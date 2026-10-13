/* Candidate 67: one in-flight visual render, with a local Canvas fallback. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenRenderWorkerBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(global){
  'use strict';
 const TICKET_FIELDS=['session','captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','key','scope','sequence','receivedAt','baseWidth','baseHeight'];
 function sameTicket(a,b){return !!a&&!!b&&TICKET_FIELDS.every(k=>a[k]===b[k]);}
 function validTicket(t){return !!t&&typeof t.session==='string'&&t.session.length>0&&typeof t.key==='string'&&typeof t.scope==='string'&&t.scope.length>0&&
  ['captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','sequence','baseWidth','baseHeight'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)&&
  t.captureRequestId>0&&t.gpuRequestId>0&&t.baseWidth>0&&t.baseHeight>0&&t.baseWidth<=16384&&t.baseHeight<=16384&&Number.isFinite(t.receivedAt);}

  const PROTOCOL=1;
 function preparedCapabilities(value,requireCompact=false){
  if(!value||value.preparedSchema!==1||!Number.isInteger(value.samplerBankSize)||value.samplerBankSize<1||value.samplerBankSize>16)
   throw new Error('Unsupported sampler preparation capabilities');
  if(value.compactDescriptorSchema!==undefined&&value.compactDescriptorSchema!==1||requireCompact&&value.compactDescriptorSchema!==1)
   throw new Error('Unsupported compact descriptor capabilities');
  return Object.freeze({preparedSchema:1,samplerBankSize:value.samplerBankSize,
   ...(value.compactDescriptorSchema===1?{compactDescriptorSchema:1}:{})});
 }

  function close(value){if(value&&typeof value.close==='function')try{value.close();}catch(_){} }
  function release(packet){
    if(!packet)return;close(packet.baseBitmap);close(packet.foregroundBitmap);close(packet.terrainBitmap);
    // Imported scene sources are owned by motion; only unimported/drop packets
    // are released here. ImageBitmap.close is harmless if already transferred.
    if(!packet.imported&&packet.scene&&Array.isArray(packet.scene.sources))
      for(const source of packet.scene.sources)close(source.source);
  }
  function create(options){
    options=options||{};const platform=options.platform||{},motion=options.motion,gpu=options.gpuPresenter||null;
    const now=options.now||(()=>global.performance&&global.performance.now?global.performance.now():Date.now());
    const schedule=options.schedule||((fn,delay)=>global.setTimeout(fn,delay));
    const cancel=options.cancel||((id)=>global.clearTimeout(id));
    let worker=null,epoch=0,requestId=0,ready=false,failed=false,disposed=false,inflight=null,
      current=null,retired=null,lastKey=null,changed=false,timer=null,phase='booting',error='';
    let submitted=0,received=0,dropped=0,replays=0,direct=null,removeGPUFailureListener=null;
    function captureCompleted(job){job.captureSettled=true;
     if(job.epoch!==epoch&&job.gpuSettled&&inflight===job){inflight=null;clearTimer();dropped++;}}
    function directPresented(job,value){job.captureSettled=true;job.gpuSettled=true;
     if(disposed||failed||job.epoch!==epoch){if(inflight===job){inflight=null;clearTimer();dropped++;}return;}
     if(inflight!==job)return;
     if(!value||!sameTicket(job.ticket,value.ticket)||!value.metadata)throw new Error('Invalid direct natural presentation ACK');
     const packet={...value.metadata,sceneToken:value.token,arrivedAt:now()};inflight=null;clearTimer();
     release(retired);retired=current;current=packet;changed=true;received++;
    }
    function directRejected(job,reason){job.gpuSettled=true;
     if(job.epoch!==epoch||disposed||failed){if(job.captureSettled&&inflight===job){inflight=null;clearTimer();dropped++;}return;}
     failure(reason);
    }
    // Root's sequence identifies rendered packets; its simulation tick is the
    // authority generation and can stay constant over several 240 Hz RAFs.
    const keyFor=packet=>typeof packet.key==='string'?packet.key:typeof packet.packetKey==='string'?packet.packetKey:
      packet.scope+':'+(packet.frame&&packet.frame.game&&Number.isSafeInteger(packet.frame.game.simulationTick)?packet.frame.game.simulationTick:packet.sequence);
    function clearTimer(){if(timer!==null)cancel(timer);timer=null;}
    function deadline(delay,message){clearTimer();timer=schedule(()=>failure(new Error(message)),delay);}
    function terminate(){if(worker){try{worker.terminate();}catch(_){}worker=null;}}
    function failure(reason){
      if(failed||disposed)return;failed=true;ready=false;phase='failed';error=String(reason&&reason.message||reason);
      if(removeGPUFailureListener){removeGPUFailureListener();removeGPUFailureListener=null;}
      if(direct&&direct.port)close(direct.port);clearTimer();terminate();inflight=null;release(current);release(retired);current=null;retired=null;
      try{if(motion&&typeof motion.resetScenePackets==='function')motion.resetScenePackets();}catch(_){}
      try{if(gpu)gpu.destroy();}catch(_){}
      if(typeof options.onFailure==='function')try{options.onFailure(new Error(error));}catch(_){}
    }
    function receive(event){
      const packet=event&&event.data!==undefined?event.data:event;
      if(!packet)return;
      if(disposed||failed){release(packet);return;}
      if(packet.protocol!==PROTOCOL){release(packet);failure(new Error('Unsupported visual reply'));return;}
      if(packet.type==='ready'){
        if(packet.epoch!==epoch)return;ready=true;phase='ready';if(!inflight)clearTimer();return;
      }
      if(packet.type==='capture-sent'){
        const job=inflight;
        if(!direct||!job||packet.epoch!==job.epoch||packet.requestId!==job.requestId||!sameTicket(packet.ticket,job.ticket))return;
        captureCompleted(job);return;
      }
      if(packet.type==='error'){
        release(packet);
        // The capture replica remains usable after a per-cohort error. An
        // already queued error from before reset is only a stale completion.
        if(packet.epoch!==epoch){
          if(inflight&&packet.requestId===inflight.requestId&&packet.epoch===inflight.epoch){
            const job=inflight;if(direct){captureCompleted(job);gpu.cancelReserved(job.ticket,new Error('Stale capture error'));}
            else {inflight=null;clearTimer();}}
          dropped++;return;
        }
        failure(new Error(packet.error||'Rendering Worker failed'));return;
      }
      if(packet.type!=='frame'&&packet.type!=='dropped')return;
      const job=inflight;
      if(!job||packet.requestId!==job.requestId){release(packet);dropped++;return;}
      if(direct){
       if(packet.epoch!==job.epoch){release(packet);dropped++;return;}
       if(packet.type==='dropped'){captureCompleted(job);gpu.cancelReserved(job.ticket,new Error('Capture cohort dropped'));if(inflight===job){inflight=null;clearTimer();dropped++;}return;}
       release(packet);failure(new Error('Unexpected main full-frame reply in direct transport'));return;
      }
      if(packet.type==='dropped'||packet.epoch!==epoch||packet.scope!==job.scope||packet.sequence!==job.sequence){inflight=null;clearTimer();release(packet);dropped++;return;}
      try{
        if(gpu){
          if(!packet.baseBitmap||!packet.scene)throw new Error('Incomplete visual reply');
          // The independent presenter owns all transferred image sources. Keep
          // the capture slot occupied until its first natural display RAF ACK.
          Promise.resolve(gpu.importFrame(packet)).then(token=>{
            if(disposed||failed||job.epoch!==epoch){release(packet);dropped++;if(inflight===job){inflight=null;clearTimer();}return;}
            if(inflight!==job){release(packet);return;}
            inflight=null;clearTimer();packet.sceneToken=token;packet.arrivedAt=now();
            release(retired);retired=current;current=packet;changed=true;received++;
          }).catch(reason=>{
            release(packet);
            if(job.epoch!==epoch||disposed||failed){dropped++;if(inflight===job){inflight=null;clearTimer();}return;}
            failure(reason);
          });
          return;
        }
        inflight=null;clearTimer();
        if(!motion||typeof motion.importScenePacket!=='function'||typeof motion.replayScenePacket!=='function')throw new Error('Scene presentation API unavailable');
        if(!packet.baseBitmap||!packet.scene)throw new Error('Incomplete visual reply');
        // Motion owns and closes texture inputs on entry, including rejected
        // GPU imports. The bridge retains only the 2D presentation bitmaps.
        packet.imported=true;
        const token=motion.importScenePacket(packet.scene);if(token===false||token===null)throw new Error('Scene import declined');
        packet.sceneToken=token;
        const same=current&&current.scope===packet.scope&&packet.receivedAt>current.receivedAt;
        packet.spanMs=same?packet.receivedAt-current.receivedAt:0;
        packet.arrivedAt=now();release(retired);retired=current;current=packet;changed=true;received++;
      }catch(reason){release(packet);failure(reason);}
    }
    function state(){return {protocol:PROTOCOL,epoch,active:!!worker,ready,failed,disposed,phase,error,
      inflight:!!inflight,sequence:current?current.sequence:null,scope:current?current.scope:null,
      submitted,received,dropped,replays,direct:!!direct,packetStats:motion&&motion.packetStats||null,
      persistentAssetBitmaps:current&&current.persistentAssetBitmaps||null,interpolation:current&&current.scene?current.scene.stats||null:null,gpu:gpu?gpu.state():null};}
    function presentationCapabilities(){
      if(!gpu)return null;
      try{const state=gpu.state();return state.ready&&!state.failed&&!state.disposed?preparedCapabilities(state.capabilities,options.compactDescriptors===true):null;}catch(reason){if(options.compactDescriptors===true)failure(reason);return null;}
    }
    function canSubmit(packetKey){return ready&&!failed&&!disposed&&!inflight&&(!gpu||gpu.canStage()&&!!presentationCapabilities())&&typeof packetKey==='string'&&packetKey!==lastKey;}
    function submit(packet){
      if(!packet||typeof packet.scope!=='string'||!packet.scope||!Number.isSafeInteger(packet.sequence)||packet.sequence<0||!Number.isFinite(packet.receivedAt)||!packet.frame)return false;
      const key=keyFor(packet);if(!canSubmit(key))return false;
      const job={requestId:++requestId,scope:packet.scope,sequence:packet.sequence,epoch,key,captureSettled:false,gpuSettled:false,ticket:null};
      try{
        // postMessage creates the private data replica. No game methods or
        // platform callbacks are sent, and the main Game remains authoritative.
        const capabilities=presentationCapabilities();
        if(gpu&&!capabilities)throw new Error('GPU sampler preparation negotiation unavailable');
        // Main pending ticket precedes both the tiny GPU reservation and capture post.
        inflight=job;
        if(direct){const reserved=gpu.reserveFrame(packet,job);job.ticket=reserved.ticket;
          Promise.resolve(reserved.promise).then(value=>directPresented(job,value)).catch(reason=>directRejected(job,reason));}
        worker.postMessage({type:'frame',protocol:PROTOCOL,epoch,requestId:job.requestId,packet,
          directTicket:job.ticket,prepareSampler:!!gpu,prepareCompact:options.compactDescriptors===true,presentationCapabilities:capabilities});
        lastKey=key;submitted++;deadline(options.frameTimeoutMs||15000,'Rendering Worker frame timed out');return true;
      }catch(reason){failure(reason);return false;}
    }
    function replay(at,present){
      if(!ready||failed||disposed||!current)return false;
      if(typeof present!=='function')present=platform.presentVisualFrame;
      if(typeof present!=='function')return false;
      const packet=current,span=packet.spanMs;
      const blend=span>0&&span<=120&&Number.isFinite(at)?Math.max(0,Math.min(1,(at-packet.arrivedAt)/span)):1;
      let presented=false;
      try{
        if(gpu){
          // This main-thread callback only exposes the transferred canvas.
          // Actual draw/submit counts belong exclusively to the Worker RAF.
          if(gpu.replay()!==true)return false;
          presented=present({packet,changed,sceneCanvas:options.presentationCanvas,baseCanvas:options.presentationBaseCanvas,frontCanvas:options.presentationFrontCanvas,workerPlanes:true})===true;
          if(!presented)throw new Error('GPU presentation surface declined');
          changed=false;release(retired);retired=null;replays++;return true;
        }
        const ok=motion.replayScenePacket(packet.sceneToken,{blend,present(sceneCanvas){
          presented=present({packet,changed,blend,sceneCanvas,clip:packet.clip})===true;return presented;
        }});
        if(ok!==true||!presented)throw new Error('Visual replay declined');
        changed=false;release(retired);retired=null;replays++;return true;
      }catch(reason){failure(reason);return false;}
    }
    function reset(){
      if(disposed||failed)return false;epoch++;if(direct)ready=false;lastKey=null;changed=false;release(current);release(retired);current=null;retired=null;
      try{if(motion&&typeof motion.resetScenePackets==='function')motion.resetScenePackets();if(gpu)gpu.reset(direct?epoch:undefined);
        if(worker)worker.postMessage({type:'reset',protocol:PROTOCOL,epoch});
      }catch(reason){failure(reason);return false;}
      // If a previous epoch is still rendering, wait for its drop ACK before
      // submitting again. There is never a second simultaneous render request.
      return true;
    }
    function destroy(){
      if(disposed)return;if(removeGPUFailureListener){removeGPUFailureListener();removeGPUFailureListener=null;}disposed=true;ready=false;phase='disposed';epoch++;clearTimer();
      if(worker)try{worker.postMessage({type:'destroy',protocol:PROTOCOL,epoch});}catch(_){}
      terminate();inflight=null;release(current);release(retired);current=null;retired=null;
      try{if(motion&&typeof motion.resetScenePackets==='function')motion.resetScenePackets();}catch(_){}
      try{if(gpu)gpu.destroy();}catch(_){}
    }
    try{
      if(options.compactDescriptors===true&&!gpu)throw new Error('Compact rendering requires a GPU presenter');
      if(typeof platform.createVisualWorker!=='function')throw new Error('Visual Worker platform unavailable');
      worker=platform.createVisualWorker();if(!worker||typeof worker.postMessage!=='function'||typeof worker.terminate!=='function')throw new Error('Invalid Visual Worker');
      if(typeof worker.addEventListener==='function'){
        worker.addEventListener('message',receive);worker.addEventListener('error',failure);worker.addEventListener('messageerror',failure);
      }else {worker.onmessage=receive;worker.onerror=failure;worker.onmessageerror=failure;}
      if(gpu&&typeof gpu.onFailure==='function')removeGPUFailureListener=gpu.onFailure(failure);
      if(gpu&&typeof gpu.connectCapture==='function')direct=gpu.connectCapture(epoch);
      worker.postMessage({type:'init',protocol:PROTOCOL,epoch,directTransport:direct,config:{scriptBase:options.scriptBase,assetRoot:options.assetRoot,
        bundled:options.bundled===true,compactDescriptors:options.compactDescriptors===true,persistentAssetBitmaps:options.persistentAssetBitmaps===true,captureStages:options.captureStages===true,outputBackingCPU:(options.outputBackingCPU===true?true:options.outputBackingCPU&&typeof options.outputBackingCPU==='object'?{base:options.outputBackingCPU.base===true,foreground:options.outputBackingCPU.foreground===true}:false),outputSnapshotTransfer:(options.outputSnapshotTransfer===true?true:options.outputSnapshotTransfer&&typeof options.outputSnapshotTransfer==='object'?{base:options.outputSnapshotTransfer.base===true,foreground:options.outputSnapshotTransfer.foreground===true}:false),
        systemInfo:platform.getSystemInfoSync?platform.getSystemInfoSync():{},runtimeOptions:options.runtimeOptions||{}}},direct?[direct.port]:[]);
      if(direct)direct={session:direct.session};
      deadline(options.bootTimeoutMs||30000,'Rendering Worker assets timed out');
    }catch(reason){failure(reason);}
    return Object.freeze({state,canSubmit,submit,replay,reset,destroy});
  }
  return Object.freeze({protocol:PROTOCOL,create,release});
});
