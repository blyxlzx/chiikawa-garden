/* Canvas platform image loading. No DOM/timers; call tick() from the runtime. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenResilientImages=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(options){
    options=options||{};
    if(typeof options.createImage!=='function')throw new Error('Image platform is required.');
    const now=typeof options.now==='function'?options.now:Date.now;
    const resolve=typeof options.resolve==='function'?options.resolve:file=>file;
    const change=typeof options.onChange==='function'?options.onChange:()=>{};
    const delays=Array.isArray(options.retryDelays)?options.retryDelays.slice():[1000,2000,4000];
    if(delays.some(value=>!Number.isFinite(value)||value<0))throw new Error('Invalid retry delays.');
    const timeout=Number.isFinite(options.timeoutMs)?Math.max(1,options.timeoutMs):15000;
    const records=new Map();let disposed=false;
    function emit(record){try{change(record);}catch(_){} }
    function releaseAttempt(record){
      if(record.image){record.image.onload=null;record.image.onerror=null;}
      record.generation++;
    }
    function settleFirst(record,value){if(record.resolveFirst){record.resolveFirst(value);record.resolveFirst=null;}}
    function fail(record,generation,message){
      if(disposed||records.get(record.key)!==record||record.generation!==generation||record.status!=='loading')return;
      releaseAttempt(record);record.ready=false;record.error=message||'图片暂时无法加载';
      if(record.attempts<=delays.length){record.status='waiting';record.retryAt=now()+delays[record.attempts-1];}
      else{record.status='failed';record.retryAt=null;}
      settleFirst(record,null);emit(record);
    }
    function start(record){
      if(disposed||records.get(record.key)!==record)return;
      releaseAttempt(record);record.attempts++;record.ready=false;record.status='loading';record.retryAt=null;
      record.startedAt=now();const generation=record.generation;
      try{
        const image=options.createImage();record.image=image;
        image.onload=()=>{
          if(disposed||records.get(record.key)!==record||record.generation!==generation||record.status!=='loading')return;
          image.onload=null;image.onerror=null;record.status='ready';record.ready=true;record.error='';record.retryAt=null;
          settleFirst(record,image);emit(record);
        };
        image.onerror=()=>fail(record,generation,'图片暂时无法加载');
        emit(record);
        image.src=resolve(record.file,record.attempts);
      }catch(error){fail(record,generation,error&&error.message||'图片加载失败');}
    }
    function load(key,file){
      if(disposed)throw new Error('Image loader has been disposed.');
      if(typeof key!=='string'||typeof file!=='string'||!file)throw new Error('Invalid image reference.');
      let record=records.get(key);
      if(record){if(record.file!==file)throw new Error('Image key already belongs to another file.');return record;}
      let resolveFirst;
      const firstAttempt=new Promise(resolve=>{resolveFirst=resolve;});
      record={key,file,image:null,ready:false,status:'idle',attempts:0,startedAt:0,retryAt:null,error:'',generation:0,firstAttempt,resolveFirst};
      records.set(key,record);start(record);return record;
    }
    function tick(){
      if(disposed)return;
      const stamp=now();
      for(const record of records.values()){
        if(record.status==='loading'&&stamp-record.startedAt>=timeout)fail(record,record.generation,'图片加载超时');
        else if(record.status==='waiting'&&stamp>=record.retryAt)start(record);
      }
    }
    function retryFailed(){
      if(disposed)return 0;let count=0;
      for(const record of records.values())if(record.status==='failed'||record.status==='waiting'){
        record.attempts=0;count++;start(record);
      }
      return count;
    }
    function release(key){
      const record=records.get(key);if(!record)return false;
      records.delete(key);releaseAttempt(record);settleFirst(record,null);record.status='released';record.ready=false;return true;
    }
    function snapshot(){
      const entries=Array.from(records.values(),r=>({key:r.key,file:r.file,status:r.status,attempts:r.attempts,retryAt:r.retryAt,error:r.error}));
      return {total:entries.length,loaded:entries.filter(r=>r.status==='ready').length,pending:entries.filter(r=>r.status==='loading'||r.status==='waiting').length,
        failed:entries.filter(r=>r.status==='failed').map(r=>r.file),errors:entries.filter(r=>r.error).map(r=>r.file),entries};
    }
    return Object.freeze({load,tick,retryFailed,release,snapshot,get:key=>records.get(key)||null,
      dispose(){if(disposed)return;for(const key of Array.from(records.keys()))release(key);disposed=true;}});
  }
  return Object.freeze({create});
});
