/* Output-only dedicated GPU Worker client; main replay never counts as drawing. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenGPUPresentationBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(global){
 'use strict';const PROTOCOL=1;let nextSession=0;const privateWindowOptions=new WeakSet();
 const TICKET_FIELDS=['session','captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','key','scope','sequence','receivedAt','baseWidth','baseHeight'];
 function sameTicket(a,b){return !!a&&!!b&&TICKET_FIELDS.every(k=>a[k]===b[k]);}
 function validTicket(t){return !!t&&typeof t.session==='string'&&t.session.length>0&&typeof t.key==='string'&&typeof t.scope==='string'&&t.scope.length>0&&
  ['captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','sequence','baseWidth','baseHeight'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)&&
  t.captureRequestId>0&&t.gpuRequestId>0&&t.baseWidth>0&&t.baseHeight>0&&t.baseWidth<=16384&&t.baseHeight<=16384&&Number.isFinite(t.receivedAt);}

 function preparedCapabilities(value,requireCompact=false){
  if(!value||value.preparedSchema!==1||!Number.isInteger(value.samplerBankSize)||value.samplerBankSize<1||value.samplerBankSize>16)
   throw new Error('Unsupported sampler preparation capabilities');
  if(value.compactDescriptorSchema!==undefined&&value.compactDescriptorSchema!==1||requireCompact&&value.compactDescriptorSchema!==1)
   throw new Error('Unsupported compact descriptor capabilities');
  return Object.freeze({preparedSchema:1,samplerBankSize:value.samplerBankSize,
   ...(value.compactDescriptorSchema===1?{compactDescriptorSchema:1}:{})});
 }


 // A compact packet exclusively owns thirteen complete buffer views. Layout,
 // descriptor/contract equivalence and bank coverage remain the helper's job.
 function compactBuffers(scene){
  const p=scene&&scene.prepared,c=p&&p.compact;
  if(!scene||scene.descriptorWire!==1||!p||p.schema!==1||p.binding!=='compact-direct-v1'||!c||c.schema!==1)
   throw new Error('Invalid compact transfer packet');
  const streams=[scene.vertices,scene.alphas,scene.previousPoints,scene.previousAlphas,p.geometry,p.clips,
   scene.commands,scene.descriptorValues,c.metadata,c.values,c.banks,c.textureIds,c.bankCommands];
  const types=[Float32Array,Float32Array,Float32Array,Float32Array,Float32Array,Float32Array,
   Uint32Array,Float64Array,Uint32Array,Float64Array,Uint32Array,Uint32Array,Uint32Array];
  if(streams.some((stream,i)=>!(stream instanceof types[i])||stream.byteOffset!==0||stream.byteLength!==stream.buffer.byteLength)||
     new Set(streams.map(stream=>stream.buffer)).size!==13)throw new Error('Incomplete compact transfer streams');
  return streams.map(stream=>stream.buffer);
 }
 function close(image){if(image&&typeof image.close==='function')try{image.close();}catch(_){} }
 function images(frame){const values=new Set();if(frame){for(const image of [frame.baseBitmap,frame.foregroundBitmap,frame.terrainBitmap])if(image)values.add(image);
  for(const source of frame.scene&&frame.scene.sources||[])if(source.source)values.add(source.source);}return values;}
 function release(frame){for(const image of images(frame))close(image);}
 function transfers(frame){if(frame&&frame.scene&&frame.scene.descriptorWire!==undefined)return [...compactBuffers(frame.scene),...images(frame)];const values=[];for(const name of ['vertices','alphas','previousPoints','previousAlphas']){
  const stream=frame.scene&&frame.scene[name];if(stream&&stream.buffer&&!values.includes(stream.buffer))values.push(stream.buffer);}

  const prepared=frame.scene&&frame.scene.prepared;
  if(prepared)for(const stream of [prepared.geometry,prepared.clips]){
   if(!(stream instanceof Float32Array))throw new Error('Invalid prepared transfer streams');
   if(!values.includes(stream.buffer))values.push(stream.buffer);
  }
  for(const image of images(frame))values.push(image);return values;}
 function consume(frame){frame.gpuTransferred=true;frame.imported=true;frame.baseBitmap=frame.foregroundBitmap=frame.terrainBitmap=null;
  for(const source of frame.scene&&frame.scene.sources||[])if(source.source)delete source.source;}
 function create(options){options=options||{};const platform=options.platform||{},canvas=options.canvas,baseCanvas=options.baseCanvas,foregroundCanvas=options.foregroundCanvas||options.frontCanvas,
  schedule=options.schedule||((fn,ms)=>global.setTimeout(fn,ms)),cancel=options.cancel||((id)=>global.clearTimeout(id));
  let worker=null,epoch=0,requestId=0,ready=false,failed=false,disposed=false,current=null,pending=null,bootTimer=null,error='',metricsId=0;
  const metricJobs=new Map();let submitted=0,presented=0,capabilities=null;
  let directSession=null,directReady=false,directCaptureEpoch=0;const failureListeners=new Set();
  // Strict private opt-in. The default path does not install a Window clock,
  // intercept visibility, construct a tick channel, or add scheduler metrics.
  const windowRafMode=privateWindowOptions.has(options);
  const windowEnv=windowRafMode?(options.windowEnvironment||global):null;
  let tickPort=null,pendingTickTransfer=null,windowRafId=null,clockGeneration=0,clockActive=false,clockVisible=false,clockDisposed=false;
  let opportunityId=0,clockMeasurement=0,inflightTick=null,latestTick=null,lastWindowStamp=null,lastWindowAbsolute=null;
  let windowTimeOrigin=null,nativeWindowRAF=false,nativeWindowCancelRAF=false,visibilityListener=null;
  let windowRows=[],windowCursor=0,windowDropped=0,opportunityCount=0,sentTicks=0,successfulAcks=0,skippedAcks=0,coalescedOpportunities=0,cancelledOpportunities=0,staleAcks=0,busyOpportunities=0;
  const WINDOW_SAMPLE_LIMIT=65536;
  function windowNow(){return windowEnv.performance.now();}
  function windowOpportunity(row){return {id:row.id,epoch:row.epoch,clockGeneration:row.clockGeneration,timeOrigin:windowTimeOrigin,rafTimestamp:row.rafTimestamp,absoluteTimestamp:row.absoluteTimestamp};}
  function windowSummary(includeRows=false){const result={timeOrigin:windowTimeOrigin,nativeRAF:nativeWindowRAF,nativeCancelRAF:nativeWindowCancelRAF,
    epoch,clockGeneration,visible:clockVisible,active:clockActive,opportunityCount,sentTicks,successfulAcks,skippedAcks,
    coalescedOpportunities,cancelledOpportunities,staleAcks,busyOpportunities,inflight:!!inflightTick,waitingLatest:!!latestTick,
    droppedRows:windowDropped,sampleLimit:WINDOW_SAMPLE_LIMIT,measurementGeneration:clockMeasurement};
   if(includeRows)result.opportunities=(windowDropped?windowRows.slice(windowCursor).concat(windowRows.slice(0,windowCursor)):windowRows.slice()).map(row=>({...row,...(row.tickAck?{tickAck:{...row.tickAck}}:{})}));
   return result;
  }
  function clearWindowMetrics(){clockMeasurement++;windowRows=[];windowCursor=windowDropped=opportunityCount=sentTicks=successfulAcks=skippedAcks=coalescedOpportunities=cancelledOpportunities=staleAcks=busyOpportunities=0;}
  function windowRecorded(row){return row&&row.measurementGeneration===clockMeasurement;}
  function markWindowCoalesced(row,replacement){if(!row)return;row.status='coalesced';row.supersededBy=replacement;
   if(windowRecorded(row))coalescedOpportunities++;
  }
  function cancelWindowRAF(){if(windowRafId!==null)try{windowEnv.cancelAnimationFrame(windowRafId);}finally{windowRafId=null;}}
  function invalidateWindowClock(reason){if(!windowRafMode)return;cancelWindowRAF();clockGeneration++;
   for(const row of [inflightTick,latestTick])if(row){row.status='cancelled';row.cancelReason=reason;if(windowRecorded(row))cancelledOpportunities++;}
   inflightTick=latestTick=null;
  }
  function sendWindowControl(){if(!windowRafMode||!tickPort||!ready||disposed||failed)return;
   tickPort.postMessage({type:'window-control',protocol:PROTOCOL,epoch,clockGeneration,visible:clockVisible,active:clockActive});
  }
  function scheduleWindowRAF(){if(windowRafMode&&ready&&tickPort&&clockActive&&clockVisible&&!failed&&!disposed&&!clockDisposed&&windowRafId===null)
   windowRafId=windowEnv.requestAnimationFrame(windowRAF);
  }
  function pauseHiddenFrameTimer(){if(windowRafMode&&!clockVisible&&pending&&pending.timer!==null){cancel(pending.timer);pending.timer=null;}}
  function resumeVisibleFrameTimer(){if(windowRafMode&&clockVisible&&pending&&pending.timer===null)
   pending.timer=schedule(()=>failure(new Error('Window GPU first visible frame timed out')),options.frameTimeoutMs||15000);
  }
  function windowVisibility(){if(!windowRafMode||clockDisposed||disposed||failed)return;const next=windowEnv.document.visibilityState;
   if(next!=='visible'&&next!=='hidden'){failure(new Error('Unknown Window visibility state'));return;}
   const visible=next==='visible';if(visible===clockVisible)return;clockVisible=visible;invalidateWindowClock(visible?'visible-resume':'hidden');
   try{sendWindowControl();if(visible){resumeVisibleFrameTimer();scheduleWindowRAF();}else pauseHiddenFrameTimer();}catch(reason){failure(reason);}
  }
  function windowRAF(stamp){windowRafId=null;windowVisibility();if(!ready||!tickPort||!clockActive||!clockVisible||failed||disposed||clockDisposed)return;
   try{const absolute=windowTimeOrigin+stamp,observedAt=windowNow();
    if(!Number.isFinite(stamp)||stamp<0||!Number.isFinite(absolute)||!Number.isFinite(observedAt)||
      lastWindowStamp!==null&&stamp<=lastWindowStamp||lastWindowAbsolute!==null&&absolute<=lastWindowAbsolute)
      throw new Error('Non-monotonic native Window RAF clock');
    lastWindowStamp=stamp;lastWindowAbsolute=absolute;
    const row={id:++opportunityId,epoch,clockGeneration,rafTimestamp:stamp,absoluteTimestamp:absolute,observedAt,active:true,visible:true,status:'opportunity',measurementGeneration:clockMeasurement};
    opportunityCount++;if(windowRows.length<WINDOW_SAMPLE_LIMIT)windowRows.push(row);else{windowRows[windowCursor]=row;windowCursor=(windowCursor+1)%WINDOW_SAMPLE_LIMIT;windowDropped++;}
    if(latestTick){markWindowCoalesced(latestTick,row.id);latestTick=null;}
    if(inflightTick){row.status='waiting';row.waitReason='inflight';latestTick=row;busyOpportunities++;}
    else {row.status='sent';inflightTick=row;sentTicks++;tickPort.postMessage({type:'window-tick',protocol:PROTOCOL,measurementGeneration:row.measurementGeneration,...windowOpportunity(row)});}
    // ACK never posts a catch-up tick. The next real native opportunity replaces
    // any waiting stamp, so stalls cannot generate synthetic replay bursts.
    scheduleWindowRAF();
   }catch(reason){failure(reason);}
  }
  function receiveWindowAck(event){const reply=event&&event.data!==undefined?event.data:event;if(!reply||disposed||failed||clockDisposed)return;
   if(reply.protocol!==PROTOCOL||reply.type!=='window-tick-ack'){failure(new Error('Invalid Window tick ACK'));return;}
   const row=inflightTick,source=reply.sourceWindowOpportunity;
   if(!row||reply.epoch!==epoch||reply.clockGeneration!==clockGeneration||reply.id!==row.id){staleAcks++;return;}
   if(!source||source.id!==row.id||source.epoch!==row.epoch||source.clockGeneration!==row.clockGeneration||source.timeOrigin!==windowTimeOrigin||source.rafTimestamp!==row.rafTimestamp||source.absoluteTimestamp!==row.absoluteTimestamp){failure(new Error('Window opportunity ACK mismatch'));return;}
   inflightTick=null;
   if(reply.success===true){const draw=reply.draw;
    if(!draw||draw.presented!==true||draw.meshDrawn!==true||!Number.isFinite(reply.timeOrigin)||!Number.isFinite(draw.drawStart)||!Number.isFinite(draw.drawEnd)||!Number.isFinite(draw.implicitCommitAt)||
       draw.drawEnd<draw.drawStart||draw.implicitCommitAt<draw.drawEnd||draw.timestamp!==draw.implicitCommitAt||draw.measurementGeneration!==row.measurementGeneration||
       !draw.sourceWindowOpportunity||Object.keys(source).some(key=>draw.sourceWindowOpportunity[key]!==source[key]))
      {failure(new Error('Window tick lacks actual successful draw timing'));return;}
    row.status='ack-success';row.tickAck={success:true,timeOrigin:reply.timeOrigin,drawStart:draw.drawStart,drawEnd:draw.drawEnd,implicitCommitAt:draw.implicitCommitAt,scope:draw.scope,sequence:draw.sequence};if(windowRecorded(row))successfulAcks++;
   }else if(reply.success===false&&typeof reply.reason==='string'){row.status='ack-skip';row.tickAck={success:false,reason:reply.reason,timeOrigin:reply.timeOrigin};if(windowRecorded(row))skippedAcks++;}
   else failure(new Error('Invalid Window draw ACK status'));
  }
  function initializeWindowClock(){if(!windowRafMode)return null;
   nativeWindowRAF=typeof windowEnv.requestAnimationFrame==='function'&&/\[native code\]/.test(Function.prototype.toString.call(windowEnv.requestAnimationFrame));
   nativeWindowCancelRAF=typeof windowEnv.cancelAnimationFrame==='function'&&/\[native code\]/.test(Function.prototype.toString.call(windowEnv.cancelAnimationFrame));
   if(!nativeWindowRAF||!nativeWindowCancelRAF||!windowEnv.performance||typeof windowEnv.performance.now!=='function'||
      !Number.isFinite(windowEnv.performance.timeOrigin)||!windowEnv.document||typeof windowEnv.document.addEventListener!=='function'||typeof windowEnv.document.removeEventListener!=='function')
     throw new Error('Native Window RAF and monotonic clock unavailable');
   windowTimeOrigin=windowEnv.performance.timeOrigin;const initial=windowEnv.document.visibilityState;
   if(initial!=='visible'&&initial!=='hidden')throw new Error('Unknown initial Window visibility state');clockVisible=initial==='visible';
   const factory=options.createChannel||platform.createVisualChannel||(typeof windowEnv.MessageChannel==='function'?()=>new windowEnv.MessageChannel():null);
   if(!factory)throw new Error('Private Window tick channel unavailable');const channel=factory();
   if(!channel||!channel.port1||!channel.port2||channel.port1===channel.port2||[channel.port1,channel.port2].some(port=>typeof port.postMessage!=='function'||typeof port.close!=='function')){
    if(channel){close(channel.port1);close(channel.port2);}throw new Error('Invalid private Window tick channel');}
   pendingTickTransfer=channel.port2;tickPort=channel.port1;tickPort.onmessage=receiveWindowAck;tickPort.onmessageerror=()=>failure(new Error('Window tick port message error'));
   if(typeof tickPort.start==='function')tickPort.start();visibilityListener=windowVisibility;windowEnv.document.addEventListener('visibilitychange',visibilityListener);
   return {port:channel.port2,clock:{timeOrigin:windowTimeOrigin,rafNative:nativeWindowRAF,cancelRafNative:nativeWindowCancelRAF,clockGeneration,visible:clockVisible}};
  }
  function disposeWindowClock(){if(!windowRafMode||clockDisposed)return;invalidateWindowClock('disposed');clockDisposed=true;clockActive=false;
   if(visibilityListener){try{windowEnv.document.removeEventListener('visibilitychange',visibilityListener);}catch(_){}visibilityListener=null;}
   if(tickPort){tickPort.onmessage=tickPort.onmessageerror=null;close(tickPort);tickPort=null;}
   if(pendingTickTransfer){close(pendingTickTransfer);pendingTickTransfer=null;}
  }
  function onFailure(callback){if(typeof callback!=='function')throw new Error('GPU failure listener required');failureListeners.add(callback);
   return ()=>failureListeners.delete(callback);}
  function connectCapture(captureEpoch){
   if(options.directTransport===false)return null;
   if(disposed||failed||!worker||directSession)throw new Error('Direct capture connection unavailable');
   if(!Number.isSafeInteger(captureEpoch)||captureEpoch<0)throw new Error('Invalid capture epoch');
   const factory=options.createChannel||platform.createVisualChannel||
    (typeof global.MessageChannel==='function'?()=>new global.MessageChannel():null);
   if(!factory)return null;
   let channel;
   try{channel=factory();if(!channel||!channel.port1||!channel.port2||channel.port1===channel.port2)throw new Error('Invalid visual MessageChannel');
    directSession='garden-direct:'+Date.now()+':'+(++nextSession);directCaptureEpoch=captureEpoch;directReady=false;
    worker.postMessage({type:'connect-capture',protocol:PROTOCOL,epoch,session:directSession,captureEpoch,port:channel.port1},[channel.port1]);
    return {session:directSession,port:channel.port2};
   }catch(reason){if(channel){close(channel.port1);close(channel.port2);}failure(reason);throw reason;}
  }
  function reserveFrame(packet,captureJob){
   if(!directSession||!canStage())throw new Error('Direct GPU presenter not ready or busy');
   const dimensions=packet&&packet.frame&&packet.frame.canvas;
   const ticket=Object.freeze({session:directSession,captureEpoch:captureJob.epoch,gpuEpoch:epoch,captureRequestId:captureJob.requestId,
    gpuRequestId:++requestId,key:captureJob.key,scope:packet.scope,sequence:packet.sequence,receivedAt:packet.receivedAt,
    baseWidth:dimensions&&dimensions.width,baseHeight:dimensions&&dimensions.height});
   if(!validTicket(ticket)||ticket.captureEpoch!==directCaptureEpoch)throw new Error('Invalid direct GPU ticket');
   let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   const job={requestId:ticket.gpuRequestId,scope:ticket.scope,sequence:ticket.sequence,epoch,ticket,resolve,reject,timer:null};pending=job;
   try{worker.postMessage({type:'reserve',protocol:PROTOCOL,epoch,ticket});submitted++;
    job.timer=schedule(()=>failure(new Error('Direct GPU first natural frame timed out')),options.frameTimeoutMs||15000);pauseHiddenFrameTimer();
   }catch(reason){failure(reason);}
   return {ticket,promise};
  }
  function cancelReserved(ticket,reason){if(!pending||!sameTicket(ticket,pending.ticket))return false;
   clearPending(reason instanceof Error?reason:new Error(String(reason||'Direct capture cancelled')));
   try{if(worker)worker.postMessage({type:'cancel-reservation',protocol:PROTOCOL,epoch,ticket});}catch(error){failure(error);}return true;
  }
  const clearBoot=()=>{if(bootTimer!==null)cancel(bootTimer);bootTimer=null;};
  function clearPending(reason){if(pending){cancel(pending.timer);pending.reject(reason);pending=null;}}
  function failure(reason){if(failed||disposed)return;disposeWindowClock();failed=true;ready=false;directReady=false;capabilities=null;current=null;error=String(reason&&reason.message||reason);const failure=new Error(error);clearBoot();clearPending(failure);
   for(const job of metricJobs.values()){cancel(job.timer);job.reject(failure);}metricJobs.clear();
   if(worker){try{worker.postMessage({type:'destroy',protocol:PROTOCOL,epoch});}catch(_){}try{worker.terminate();}catch(_){}worker=null;}
   for(const callback of [...failureListeners])try{callback(failure);}catch(_){}
   if(typeof options.onFailure==='function')try{options.onFailure(failure);}catch(_){} }
  function receive(event){const reply=event&&event.data!==undefined?event.data:event;if(!reply||disposed||failed)return;
   if(reply.protocol!==PROTOCOL){failure(new Error('Unsupported GPU reply'));return;}
   if(reply.type==='error'){
    release(reply.frame||reply);
    // Fatal errors permanently stop this Worker. A main-thread reset cannot
    // revive it, even when its final error was queued in the previous epoch.
    if(reply.fatal!==true&&reply.epoch!==epoch)return;
    failure(new Error(reply.error||'GPU presentation failed'));return;
   }
   if(reply.type==='metrics'||reply.type==='metrics-error'){const job=metricJobs.get(reply.requestId);if(!job)return;metricJobs.delete(reply.requestId);cancel(job.timer);
    if(reply.type==='metrics-error'||reply.epoch!==job.epoch)job.reject(new Error(reply.error||'Stale GPU metrics'));else job.resolve(windowRafMode?{...reply.metrics,scheduler:'window-raf',windowRAF:windowSummary(true)}:reply.metrics);return;}
   if(reply.type==='direct-ready'){
    if(reply.epoch===epoch&&reply.session===directSession&&reply.captureEpoch===directCaptureEpoch)directReady=true;return;
   }
   if(windowRafMode&&reply.type==='staged'){
    const job=pending;if(reply.epoch!==epoch||!job||reply.requestId!==job.requestId||reply.scope!==job.scope||reply.sequence!==job.sequence)return;
    clockActive=true;try{sendWindowControl();scheduleWindowRAF();}catch(reason){failure(reason);}return;
   }
   if(reply.type==='ready'){if(reply.epoch!==epoch)return;
    if(windowRafMode&&(reply.scheduler!=='window-raf'||!reply.windowClock||!Number.isSafeInteger(reply.windowClock.clockGeneration)||reply.windowClock.clockGeneration<0||reply.windowClock.clockGeneration>clockGeneration||reply.windowClock.sourceTimeOrigin!==windowTimeOrigin)){failure(new Error('Window scheduler readiness mismatch'));return;}
    try{capabilities=preparedCapabilities(reply.capabilities,options.compactDescriptors===true);}catch(reason){failure(reason);return;}
    ready=true;clearBoot();if(windowRafMode)try{sendWindowControl();scheduleWindowRAF();}catch(reason){failure(reason);}return;}
   if(reply.type!=='presented'&&reply.type!=='dropped')return;const job=pending;if(!job||reply.requestId!==job.requestId)return;
   if(job.ticket&&(!sameTicket(job.ticket,reply.ticket)))return;
   pending=null;cancel(job.timer);if(reply.type==='dropped'||reply.epoch!==epoch||reply.scope!==job.scope||reply.sequence!==job.sequence){job.reject(new Error('GPU cohort dropped after epoch reset'));return;}
   if(job.ticket){const t=job.ticket,m=reply.metadata;
    if(!m||m.scope!==t.scope||m.sequence!==t.sequence||m.receivedAt!==t.receivedAt||m.width!==t.baseWidth||m.height!==t.baseHeight||
      reply.baseWidth!==t.baseWidth||reply.baseHeight!==t.baseHeight||reply.composition!=='original-three-planes'){
     const reason=new Error('Invalid direct presentation metadata');job.reject(reason);failure(reason);return;}
   }
   const token=Object.freeze({epoch,scope:reply.scope,sequence:reply.sequence,width:reply.width,height:reply.height,
     composition:reply.composition,baseWidth:reply.baseWidth,baseHeight:reply.baseHeight});current=token;presented++;
   // This ACK describes successful GL drawing in a natural Worker RAF. DOM
   // visibility is a separate main-thread action and is not a draw-FPS metric.
   try{if(typeof options.onPresented==='function')options.onPresented(canvas,token);}catch(reason){job.reject(reason);failure(reason);return;}job.resolve(job.ticket?Object.freeze({token,ticket:job.ticket,metadata:reply.metadata}):token);
  }
  function canStage(){return ready&&(!directSession||directReady)&&!failed&&!disposed&&!pending&&!!worker;}
  function importFrame(frame){if(!canStage())return Promise.reject(new Error('GPU presenter not ready or busy'));
   if(!frame||!frame.scene||!frame.baseBitmap||typeof frame.scope!=='string'||!Number.isSafeInteger(frame.sequence))return Promise.reject(new Error('Invalid GPU cohort'));
   if(!frame.scene.prepared)return Promise.reject(new Error('Prepared GPU cohort required'));
   if((options.compactDescriptors===true)!==(frame.scene.descriptorWire!==undefined))return Promise.reject(new Error('Compact GPU bridge mode mismatch'));
   return new Promise((resolve,reject)=>{const id=++requestId,job={requestId:id,scope:frame.scope,sequence:frame.sequence,epoch,resolve,reject,timer:null};pending=job;
    try{worker.postMessage({type:'stage',protocol:PROTOCOL,epoch,requestId:id,frame},transfers(frame));consume(frame);submitted++;
     job.timer=schedule(()=>failure(new Error('GPU presentation first natural frame timed out')),options.frameTimeoutMs||15000);pauseHiddenFrameTimer();
    }catch(reason){release(frame);consume(frame);failure(reason);}
   });
  }
  function metrics(options){if(disposed||failed||!worker)return Promise.reject(new Error('GPU metrics unavailable'));
   if(windowRafMode&&options&&options.reset)clearWindowMetrics();
   return new Promise((resolve,reject)=>{const id=++metricsId,job={epoch,resolve,reject,timer:null};metricJobs.set(id,job);
    job.timer=schedule(()=>{metricJobs.delete(id);reject(new Error('GPU metrics timed out'));},options&&options.timeoutMs||5000);
    try{worker.postMessage({type:'metrics',protocol:PROTOCOL,epoch,requestId:id,options:windowRafMode?{...(options||{}),windowMeasurementGeneration:clockMeasurement}:options||{}});}catch(reason){metricJobs.delete(id);cancel(job.timer);reject(reason);}
   });
  }
  function reset(captureEpoch){if(disposed||failed)return false;
   if(captureEpoch!==undefined){if(!Number.isSafeInteger(captureEpoch)||captureEpoch<directCaptureEpoch){failure(new Error('Invalid direct reset epoch'));return false;}directCaptureEpoch=captureEpoch;}
   if(windowRafMode){invalidateWindowClock('reset');clockActive=false;}epoch++;ready=false;directReady=false;capabilities=null;current=null;clearPending(new Error('GPU presentation reset'));
   clearBoot();bootTimer=schedule(()=>failure(new Error('Natural GPU Worker reset setup timed out')),options.bootTimeoutMs||10000);
   for(const job of metricJobs.values()){cancel(job.timer);job.reject(new Error('GPU metrics reset'));}metricJobs.clear();
   try{worker.postMessage({type:'reset',protocol:PROTOCOL,epoch,captureEpoch:directCaptureEpoch,...(windowRafMode?{windowClockGeneration:clockGeneration}: {})});return true;}catch(reason){failure(reason);return false;}
  }
  function destroy(){if(disposed)return;disposeWindowClock();clearBoot();clearPending(new Error('GPU presentation disposed'));for(const job of metricJobs.values()){cancel(job.timer);job.reject(new Error('GPU metrics disposed'));}metricJobs.clear();
   if(worker){try{worker.postMessage({type:'destroy',protocol:PROTOCOL,epoch:++epoch});}catch(_){}try{worker.terminate();}catch(_){}worker=null;}
   disposed=true;ready=false;directReady=false;capabilities=null;current=null;
  }
  const state=()=>({protocol:PROTOCOL,epoch,ready,active:!!current,failed,disposed,error,inflight:!!pending,submitted,presented,current,capabilities,direct:!!directSession,directReady,directCaptureEpoch,...(windowRafMode?{scheduler:'window-raf',windowRAF:windowSummary(false)}:{})});
  try{if(!canvas||!baseCanvas||!foregroundCanvas||new Set([canvas,baseCanvas,foregroundCanvas]).size!==3||
    [canvas,baseCanvas,foregroundCanvas].some(surface=>typeof surface.transferControlToOffscreen!=='function'))throw new Error('Three independent Offscreen transfers unavailable');
   if(typeof platform.createGPUPresentationWorker!=='function')throw new Error('GPU Worker platform unavailable');
   worker=platform.createGPUPresentationWorker();if(!worker||typeof worker.postMessage!=='function'||typeof worker.terminate!=='function')throw new Error('Invalid GPU Worker');
   if(typeof worker.addEventListener==='function'){worker.addEventListener('message',receive);worker.addEventListener('error',failure);worker.addEventListener('messageerror',failure);}
   else {worker.onmessage=receive;worker.onerror=failure;worker.onmessageerror=failure;}
   const offscreen=canvas.transferControlToOffscreen(),baseOffscreen=baseCanvas.transferControlToOffscreen(),frontOffscreen=foregroundCanvas.transferControlToOffscreen();
   const windowSetup=windowRafMode?initializeWindowClock():null;
   worker.postMessage({type:'init',protocol:PROTOCOL,epoch,canvas:offscreen,baseCanvas:baseOffscreen,foregroundCanvas:frontOffscreen,
     ...(windowSetup?{tickPort:windowSetup.port}:{}),
     config:{bundled:options.bundled===true,retainedScript:options.retainedScript,compactDescriptors:options.compactDescriptors===true,privateReplayStateCache:options.privateReplayStateCache===true,coalesceClipUploads:options.coalesceClipUploads===true,
      ...(windowSetup?{scheduler:'window-raf',windowClock:windowSetup.clock}: {})}},[offscreen,baseOffscreen,frontOffscreen,...(windowSetup?[windowSetup.port]:[])]);pendingTickTransfer=null;
   bootTimer=schedule(()=>failure(new Error('Natural GPU Worker setup timed out')),options.bootTimeoutMs||10000);
  }catch(reason){failure(reason);}
  return Object.freeze({state,canStage,connectCapture,reserveFrame,cancelReserved,onFailure,importFrame,metrics,reset,destroy,replay(token){return !!current&&!failed&&!disposed&&(!token||token===current);}});
 }
 function createWindowRaf(options){const descriptor=options&&Object.getOwnPropertyDescriptor(options,'windowRafPresentation');
  if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||descriptor.value!==true)throw new Error('Private Window RAF requires own literal true');
  privateWindowOptions.add(options);try{return create(options);}finally{privateWindowOptions.delete(options);}
 }
 return Object.freeze({protocol:PROTOCOL,create,createWindowRaf,release,transfers});
});
