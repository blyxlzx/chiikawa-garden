/* HTTP workers import the shared modules; the single-file build embeds them
 * before this entry, so file:// play needs no worker-relative fetch. */
(function(scope){
  'use strict';
  try{
    if(!scope.GardenEndlessWorkerCore)scope.importScripts('scene-terrain.js','combat-feedback.js','run-director.js','../engine.js','endless-worker-core.js');
    let schedule,cancel;
    if(typeof scope.MessageChannel==='function'){
      // Zero-delay catch-up must remain a macrotask so commands and ACKs can
      // run, without nested setTimeout's minimum delay throttling simulation.
      const channel=new scope.MessageChannel(),tasks=new Map();let nextId=0;
      function run(id){const task=tasks.get(id);if(!task)return;tasks.delete(id);task.callback();}
      channel.port1.onmessage=event=>run(event.data);
      schedule=(callback,delay)=>{
        const id=++nextId,task={callback,timer:null};tasks.set(id,task);
        try{if(delay===0)channel.port2.postMessage(id);else task.timer=scope.setTimeout(()=>run(id),delay);}
        catch(error){tasks.delete(id);throw error;}
        return id;
      };
      cancel=id=>{const task=tasks.get(id);if(!task)return;tasks.delete(id);if(task.timer!==null)scope.clearTimeout(task.timer);};
    }
    const core=scope.GardenEndlessWorkerCore.create({engine:scope.GardenEngine,schedule,cancel,sliceBudgetMs:12,trustedNativePostMessage:true,trustedNativeMessageInput:true,trustedAuthoritativeFields:true,trustedAuthoritativeTopology:true,trustedActorLoopPartitions:true,trustedStartupClock:true,trustedPeriodicCheckpoint:true,adaptiveWakeup:true,postMessage:packet=>scope.postMessage(packet)});
    scope.onmessage=event=>core.handle(event.data);
  }catch(error){
    scope.postMessage({type:'error',runId:null,message:error&&error.message?error.message:String(error)});
  }
})(typeof self!=='undefined'?self:globalThis);
