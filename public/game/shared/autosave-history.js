/* Three validated automatic checkpoints. The six manual slots remain separate. */
(function(root,factory){
  const dependencies=typeof module==='object'&&module.exports?require('./prepared-restore-dependencies.js'):root.GardenPreparedRestoreDependencies;
  const api=dependencies?dependencies.autosave:factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenAutosaveHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STORAGE_KEY='chiikawa-garden-auto-history-v1',LEGACY_KEY='chiikawa-garden-endless-run-v1';
  const FORMAT='chiikawa-garden-auto-history',COUNT=3,MAX_BYTES=8*1024*1024;
  // A changed serializer can expose private nested references. Invalidate all
  // prior proofs before calling it; an inherited toJSON never earns a proof.
  const proofJSON=JSON,proofStringify=JSON.stringify,proofDescriptor=Object.getOwnPropertyDescriptor,
    proofObjectPrototype=Object.prototype,proofArrayPrototype=Array.prototype,proofArrayFrom=Array.from;
  const proofNativeStringify=/\[native code\]/.test(Function.prototype.toString.call(proofStringify)),
    proofNativeArrayFrom=/\[native code\]/.test(Function.prototype.toString.call(proofArrayFrom));
  let proofSerializationEpoch=0;
  function proofSerializationSafe(){
    const d=proofDescriptor(JSON,'stringify');
    return proofNativeStringify&&JSON===proofJSON&&d&&Object.prototype.hasOwnProperty.call(d,'value')&&d.value===proofStringify&&
      !proofDescriptor(proofObjectPrototype,'toJSON')&&!proofDescriptor(proofArrayPrototype,'toJSON')&&
      Object.getPrototypeOf(proofArrayPrototype)===proofObjectPrototype&&Object.getPrototypeOf(proofObjectPrototype)===null;
  }
  function stringifyForProof(value){if(!proofSerializationSafe())proofSerializationEpoch++;return JSON.stringify(value);}
  // A storage hook can change the behavior of the final public copy even
  // without holding a private root. Check its small fixed intrinsic/prototype
  // surface after the hook; changed environments retain the original copy.
  const runtimeCopyObject=Object,runtimeCopyArray=Array,runtimeCopyNumber=Number,runtimeCopyOwnKeys=Reflect.ownKeys;
  const runtimeCopyIntrinsics=[[Object,'keys'],[Object,'getOwnPropertyDescriptor'],[Object,'getPrototypeOf'],[Array,'from'],[Array,'isArray'],[Number,'isFinite'],[Object,'is'],[proofObjectPrototype,'hasOwnProperty'],[proofArrayPrototype,'includes'],[proofArrayPrototype,Symbol.iterator],[Function.prototype,'call']].map(([object,key])=>[object,key,proofDescriptor(object,key)]);
  const runtimeCopyPrototypeKeys=runtimeCopyOwnKeys(proofObjectPrototype),runtimeCopyPrototypeDescriptors=runtimeCopyPrototypeKeys.map(key=>proofDescriptor(proofObjectPrototype,key));
  const runtimeCopyNativeIntrinsics=runtimeCopyIntrinsics.every(([, , d])=>d&&typeof d.value==='function'&&/\[native code\]/.test(Function.prototype.toString.call(d.value)))&&/\[native code\]/.test(Function.prototype.toString.call(runtimeCopyOwnKeys));
  function runtimeCopyDescriptorEqual(a,b){return a&&b&&a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;}
  function runtimeCopyEnvironmentSafe(){
    if(!runtimeCopyNativeIntrinsics||Object!==runtimeCopyObject||Array!==runtimeCopyArray||Number!==runtimeCopyNumber)return false;
    const keys=runtimeCopyOwnKeys(proofObjectPrototype);if(keys.length!==runtimeCopyPrototypeKeys.length)return false;
    for(let i=0;i<keys.length;i++)if(keys[i]!==runtimeCopyPrototypeKeys[i]||!runtimeCopyDescriptorEqual(proofDescriptor(proofObjectPrototype,keys[i]),runtimeCopyPrototypeDescriptors[i]))return false;
    for(let i=0;i<runtimeCopyIntrinsics.length;i++){const item=runtimeCopyIntrinsics[i];if(!runtimeCopyDescriptorEqual(proofDescriptor(item[0],item[1]),item[2]))return false;}
    return true;
  }
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const shape=(v,keys)=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>own(v,k));
  function copy(value,budget={left:2000000},depth=0){
    if(--budget.left<0||depth>24)throw new Error('自动存档过大或嵌套过深。');
    if(budget.maxDepth!==undefined&&depth>budget.maxDepth)budget.maxDepth=depth;
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value)){if(budget.ordinary!==undefined&&Object.is(value,-0))budget.ordinary=false;return value;}
    if(typeof value==='string'&&value.length<=MAX_BYTES)return value;
    if(Array.isArray(value)){
      if(value.length>20000)throw new Error('自动存档数组过大。');
      if(budget.maxDepth!==undefined){const d=proofDescriptor(Array,'from');if(!proofNativeArrayFrom||!d||!own(d,'value')||d.value!==proofArrayFrom)budget.reliable=false;}
      return Array.from({length:value.length},(_,i)=>{
        const d=Object.getOwnPropertyDescriptor(value,String(i));
        if(!d||!own(d,'value'))throw new Error('自动存档含不安全的数组内容。');
        return copy(d.value,budget,depth+1);
      });
    }
    if(!record(value)||Object.keys(value).length>256)throw new Error('自动存档含非数据内容。');
    const result={};
    for(const key of Object.keys(value)){
      if(key==='toJSON'&&budget.ordinary!==undefined)budget.ordinary=false;
      if(['__proto__','constructor','prototype'].includes(key))throw new Error('自动存档含不安全的字段。');
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(!d||!own(d,'value'))throw new Error('自动存档含不安全的字段。');
      if(d.value!==undefined){
        const child=copy(d.value,budget,depth+1);
        // A prototype setter could retain a freshly copied child. Such a
        // copy stays compatible, but cannot certify a private immutable shape.
        if(budget.maxDepth!==undefined){const p=proofDescriptor(proofObjectPrototype,key);if(p&&!own(p,'value'))budget.reliable=false;}
        result[key]=child;
      }
    }
    return result;
  }
  function byteCount(text){
    if(!/[^\x00-\x7f]/.test(text))return text.length;
    let n=0;for(let i=0;i<text.length;i++){
      const p=text.charCodeAt(i);
      if(p<=127)n++;else if(p<=2047)n+=2;
      else if(p>=0xd800&&p<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){n+=4;i++;}
      else n+=3;
    }return n;
  }
  function encode(value,limit=MAX_BYTES){const text=stringifyForProof(value);if(text.length>limit||byteCount(text)>limit)throw new Error('自动存档过大。');return text;}
  function decode(raw,limit){if(typeof raw!=='string')return copy(raw);if(raw.length>limit||byteCount(raw)>limit)throw new Error('自动存档过大。');try{return copy(JSON.parse(raw));}catch(_){throw new Error('自动存档无法解析。');}}
  const absent=raw=>raw===undefined||raw===null||raw==='';
  // A storage adapter may return the same mutable object on every read. Match
  // data descriptors and field order against our private detached snapshot;
  // neither object identity nor caller-controlled serialization is trusted.
  function sameData(value,expected,budget={left:2000000},depth=0){
    if(--budget.left<0||depth>24)return false;
    if(value===null||typeof value==='boolean'||typeof value==='number'||typeof value==='string')return value===expected;
    if(Array.isArray(value)){
      if(!Array.isArray(expected)||value.length!==expected.length||value.length>20000)return false;
      for(let i=0;i<value.length;i++){
        const d=Object.getOwnPropertyDescriptor(value,String(i));
        if(!d||!own(d,'value')||!sameData(d.value,expected[i],budget,depth+1))return false;
      }return true;
    }
    if(!record(value)||!record(expected))return false;
    const keys=Object.keys(value),expectedKeys=Object.keys(expected);
    if(keys.length>256||keys.length!==expectedKeys.length)return false;
    for(let i=0;i<keys.length;i++){
      const key=keys[i],d=Object.getOwnPropertyDescriptor(value,key);
      if(key!==expectedKeys[i]||!d||!own(d,'value')||!sameData(d.value,expected[key],budget,depth+1))return false;
    }return true;
  }
  // Only histories created by this library can issue a closed restore reader.
  // Private cache roots never cross callbacks: only detached validation/output
  // roots and opaque attachments do. Public latest/get retain their copies.
  const preparedHistoryReaders=new WeakMap(),preparedInputProofs=new WeakMap();
  const preparedRestoreReads=Object.freeze({version:1,
    reader(history,capability){const entry=preparedHistoryReaders.get(history);return entry&&entry.capability===capability?entry.reader:null;},
    inputProven(value,validator,request){const proof=preparedInputProofs.get(value);return !!(proof&&proof.validator===validator&&proof.request===request&&proof.epoch===proofSerializationEpoch&&runtimeCopyEnvironmentSafe()&&proofSerializationSafe());}
  });
  function create(options){
    options=options||{};const platform=options.platform,validate=options.validateCheckpoint;
    const legacyKey=options.legacyKey||LEGACY_KEY,key=options.storageKey||STORAGE_KEY;
    if(!platform||typeof platform.getStorageSync!=='function'||typeof platform.setStorageSync!=='function'||typeof validate!=='function')throw new Error('自动存档存储或校验器不可用。');
    // The explicit capability owns raw serialized storage, never public values.
    // Incomplete capabilities use the original object adapter unchanged.
    const rawText=options.rawText&&typeof options.rawText.get==='function'&&typeof options.rawText.set==='function'&&typeof options.rawText.remove==='function'?options.rawText:null;
    function readRaw(storageKey){
      const raw=rawText?rawText.get(storageKey):platform.getStorageSync(storageKey);
      if(rawText&&raw!==null&&raw!==undefined&&typeof raw!=='string')throw new Error('原始自动存档文本不可用。');
      return raw;
    }
    const restoreDescriptor=Object.getOwnPropertyDescriptor(options,'preparedRestore'),restoreValue=restoreDescriptor&&own(restoreDescriptor,'value')?restoreDescriptor.value:null;
    const restoreKeys=['version','request','take','attach'];
    const restoreShape=restoreValue&&Object.isFrozen(restoreValue)&&Object.getPrototypeOf(restoreValue)===Object.prototype&&Reflect.ownKeys(restoreValue).length===restoreKeys.length&&restoreKeys.every(key=>{const d=Object.getOwnPropertyDescriptor(restoreValue,key);return d&&own(d,'value');});
    const restoreCapability=rawText&&restoreShape&&restoreValue.version===1&&typeof restoreValue.request==='symbol'&&typeof restoreValue.take==='function'&&typeof restoreValue.attach==='function'?restoreValue:null;
    const restoreAttachments=new WeakMap();
    function restoreProofSafe(value){const proof=checkpointProofs.get(value);return restoreCapability&&proof&&proof.epoch===proofSerializationEpoch&&runtimeCopyEnvironmentSafe()&&proofSerializationSafe();}
    let errors=[],historyCache=null;const comparisonCache=new WeakMap(),checkpointProofs=new WeakMap();
    function checkpoint(value){
      // Certify only this already required detached input copy, while its exact
      // validator is synchronously active. A callback wrapper has a different
      // identity and cannot borrow the proof; it expires in finally.
      const inputBudget=restoreCapability?{left:2000000,maxDepth:0,reliable:true,ordinary:true}:null;
      const safe=inputBudget?copy(value,inputBudget):copy(value),beforeSerialization=proofSerializationSafe();encode(safe);
      const request=restoreCapability&&runtimeCopyEnvironmentSafe()&&proofSerializationSafe()?restoreCapability.request:undefined;
      if(request!==undefined&&inputBudget.reliable&&inputBudget.ordinary&&beforeSerialization)preparedInputProofs.set(safe,{validator:validate,request,epoch:proofSerializationEpoch});
      let checked;try{checked=request===undefined?validate(safe):validate(safe,request);}finally{preparedInputProofs.delete(safe);}
      if(!record(checked))throw new Error('自动存档校验未通过。');
      if(!rawText){const normalized=copy(checked);encode(normalized);return normalized;}
      // Statistics are collected by the same required detached-copy walk.
      // Neither the callback's safe input nor any public return is certified.
      const budget={left:2000000,maxDepth:0,reliable:true},normalized=copy(checked,budget);
      const safeSerialization=proofSerializationSafe();encode(normalized);
      if(budget.reliable&&safeSerialization&&proofSerializationSafe())checkpointProofs.set(normalized,{nodes:2000000-budget.left,maxDepth:budget.maxDepth,epoch:proofSerializationEpoch});
      if(request!==undefined&&restoreProofSafe(normalized)){const attachment=restoreCapability.take(checked);if(attachment)restoreAttachments.set(normalized,attachment);}
      return normalized;
    }
    function read(){
      errors=[];const raw=readRaw(key);
      if(historyCache&&(typeof raw==='string'?raw===historyCache.text:sameData(raw,historyCache.value))){
        errors=historyCache.errors.slice();return {...historyCache.data,raw};
      }
      historyCache=null;
      if(absent(raw)){
        const old=readRaw(legacyKey);let entries=[];
        if(!absent(old))try{entries=[checkpoint(decode(old,MAX_BYTES))];}catch(error){errors.push({index:0,legacy:true,message:error.message});}
        return {raw,migrated:false,active:entries.length>0,entries,rawEntries:entries};
      }
      const value=decode(raw,MAX_BYTES*COUNT+4096);
      if(!shape(value,['format','version','active','entries'])||value.format!==FORMAT||value.version!==1||typeof value.active!=='boolean'||!Array.isArray(value.entries)||value.entries.length>COUNT)throw new Error('自动存档历史损坏或版本不兼容，原数据已保留。');
      const entries=value.entries.map((entry,index)=>{try{return checkpoint(entry);}catch(error){errors.push({index,legacy:false,message:error.message});return null;}});
      const data={migrated:true,active:value.active,entries,rawEntries:value.entries};
      historyCache={value,text:typeof raw==='string'?raw:null,data,errors:errors.slice()};
      return {raw,...data};
    }
    function info(value,index,active){
      const s=value.game&&value.game.state||{};
      return {index,savedAt:value.savedAt,active:active&&index===0,wave:s.wave||0,wavesCleared:s.wavesCleared||0,mapId:s.mapId||'',boardSize:s.endlessBoardSize||'classic',seconds:Math.floor(s.time||0)};
    }
    function aggregatePrivateProof(next){
      if(!rawText)return sameData(next,next);
      // The private fixed envelope has four fields and one entries array.
      // Unknown raw/damaged entries always use the original complete walk.
      let nodes=5,maxDepth=1;
      for(const entry of next.entries){
        const proof=checkpointProofs.get(entry);
        if(!proof||proof.epoch!==proofSerializationEpoch)return sameData(next,next);
        nodes+=proof.nodes;maxDepth=Math.max(maxDepth,proof.maxDepth+2);
      }
      return nodes<=2000000&&maxDepth<=24;
    }
    function commit(previous,next,entries,nextErrors){
      const text=encode(next,MAX_BYTES*COUNT+4096);
      try{
        if((rawText?rawText.set(key,text):platform.setStorageSync(key,JSON.parse(text)))===false)throw new Error('本机存储拒绝写入。');
        const readback=readRaw(key),actual=typeof readback==='string'?readback:JSON.stringify(readback);
        if(actual!==text)throw new Error('自动存档写入校验失败。');
        // Only our already-validated private entries enter this cache. Check
        // the aggregate envelope limits as well, before allowing a text hit.
        const retainedErrors=nextErrors.filter(error=>error.index>=0&&error.index<next.entries.length&&!entries[error.index]).map(error=>({...error,legacy:false}));
        historyCache=aggregatePrivateProof(next)?{value:next,text,data:{migrated:true,active:next.active,entries,rawEntries:next.entries},errors:retainedErrors}:null;
      }catch(cause){
        const error=new Error('保存失败：'+(cause.message||'本机存储不可用。'));
        try{
          if(rawText){
            if(previous.raw===null||previous.raw===undefined)rawText.remove(key);
            else if(rawText.set(key,previous.raw)===false)throw new Error('rollback rejected');
            // Missing keys and existing empty text are distinct raw states.
            if(readRaw(key)!==previous.raw)throw new Error('rollback verification failed');
          }else{
            if(previous.raw===undefined&&typeof platform.removeStorageSync==='function')platform.removeStorageSync(key);
            else if(platform.setStorageSync(key,previous.raw===undefined?'':previous.raw)===false)throw new Error('rollback rejected');
            const restored=platform.getStorageSync(key);
            if(!(previous.raw===undefined&&absent(restored))&&JSON.stringify(restored)!==JSON.stringify(previous.raw))throw new Error('rollback verification failed');
          }
        }catch(_){error.rollbackFailed=true;}
        throw error;
      }
    }
    function comparable(value){
      if(comparisonCache.has(value))return comparisonCache.get(value);
      const data={...value};delete data.savedAt;
      if(data.game&&data.game.state)data.game={...data.game,state:{...data.game.state,status:'playing'}};
      const text=stringifyForProof(data);comparisonCache.set(value,text);return text;
    }
    function saveCheckpoint(value,discardReturn){
      const valid=checkpoint(value),previous=read();
      // Keep an individually damaged/future entry byte-for-byte as JSON
      // data until normal three-slot rotation ages it out. A malformed
      // envelope still blocks writes, since its structure is unknown.
      const entries=previous.entries.map((entry,index)=>entry||previous.rawEntries[index]);
      const normalized=previous.entries.slice();let nextErrors=errors.slice();
      // Pause, page hide and repeated manual clicks should not consume the
      // three recovery points when only the timestamp/status has changed.
      if(previous.entries[0]&&comparable(valid)===comparable(previous.entries[0])){entries[0]=valid;normalized[0]=valid;}
      else {entries.unshift(valid);normalized.unshift(valid);nextErrors=nextErrors.map(error=>({...error,index:error.index+1,legacy:false})).filter(error=>error.index<COUNT);}
      entries.length=Math.min(entries.length,COUNT);
      normalized.length=entries.length;
      commit(previous,{format:FORMAT,version:1,active:true,entries},normalized,nextErrors);
      // Native discards this result. Skip only its unused public-return copy,
      // after the detached root is still certified following storage hooks.
      if(discardReturn&&rawText){
        const proof=checkpointProofs.get(valid);
        if(proof&&proof.epoch===proofSerializationEpoch&&runtimeCopyEnvironmentSafe()&&proofSerializationSafe())return true;
      }
      // Unknown serializers/setters/callback exposure keep the original final
      // copy, including its post-write mutation/depth failure behavior.
      return copy(valid);
    }
    const history=Object.freeze({
      latest(){const data=read();if((data.active||errors.some(error=>error.legacy))&&!data.entries[0])throw new Error('最近一次自动存档损坏，请从存档页选择较早版本。');return data.active?copy(data.entries[0]):null;},
      list(){const data=read();return data.entries.map((entry,index)=>entry?info(entry,index,data.active):null).filter(Boolean);},
      get(index){if(!Number.isInteger(index)||index<0||index>=COUNT)throw new Error('无效的自动存档版本。');const entry=read().entries[index];if(!entry)throw new Error('此自动存档为空或已损坏。');return copy(entry);},
      getErrors(){return copy(errors);},
      save(value){return saveCheckpoint(value,false);},
      saveForRuntime(value){saveCheckpoint(value,true);return true;},
      finish(){
        const previous=read();
        commit(previous,{format:FORMAT,version:1,active:false,entries:previous.rawEntries},previous.entries,errors);
        return true;
      }
    });
    if(restoreCapability){
      const reader=Object.freeze({latest(){
        const data=read();
        if((data.active||errors.some(error=>error.legacy))&&!data.entries[0])throw new Error('最近一次自动存档损坏，请从存档页选择较早版本。');
        if(!data.active)return null;
        const entry=data.entries[0],result=copy(entry),attachment=restoreAttachments.get(entry);
        if(attachment&&restoreProofSafe(entry))restoreCapability.attach(result,attachment);
        return result;
      }});
      preparedHistoryReaders.set(history,{capability:restoreCapability,reader});
    }
    return history;
  }
  return Object.freeze({create,preparedRestoreReads,STORAGE_KEY,LEGACY_KEY,COUNT,MAX_BYTES});
});
