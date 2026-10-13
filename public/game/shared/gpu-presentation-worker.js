/* Output-only prototype: natural Worker RAF presents a complete visual cohort.
 * This clock never ticks Game, changes authority, plays audio or writes saves. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;
 else {root.GardenGPUPresentationWorker=api;if(typeof root.importScripts==='function'&&typeof root.document==='undefined')api.attach();}})(typeof globalThis!=='undefined'?globalThis:this,function(global){
 'use strict';
 const TICKET_FIELDS=['session','captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','key','scope','sequence','receivedAt','baseWidth','baseHeight'];
 function sameTicket(a,b){return !!a&&!!b&&TICKET_FIELDS.every(k=>a[k]===b[k]);}
 function validTicket(t){return !!t&&typeof t.session==='string'&&t.session.length>0&&typeof t.key==='string'&&typeof t.scope==='string'&&t.scope.length>0&&
  ['captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','sequence','baseWidth','baseHeight'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)&&
  t.captureRequestId>0&&t.gpuRequestId>0&&t.baseWidth>0&&t.baseHeight>0&&t.baseWidth<=16384&&t.baseHeight<=16384&&Number.isFinite(t.receivedAt);}
const PROTOCOL=1,MAX_SAMPLES=65536;

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
 const finite=Number.isFinite,clamp=value=>Math.max(0,Math.min(1,value));
 function close(value){if(value&&typeof value.close==='function')try{value.close();}catch(_){} }
 function ownedImages(frame){const all=new Set();if(!frame)return all;
  for(const image of [frame.baseBitmap,frame.foregroundBitmap,frame.terrainBitmap])if(image)all.add(image);
  for(const source of frame.scene&&frame.scene.sources||[])if(source.source)all.add(source.source);return all;}
 function release(frame){for(const image of ownedImages(frame))close(image);}
 function transfers(frame){if(frame&&frame.scene&&frame.scene.descriptorWire!==undefined)return [...compactBuffers(frame.scene),...ownedImages(frame)];const all=[];if(frame&&frame.scene)for(const key of ['vertices','alphas','previousPoints','previousAlphas']){
  const stream=frame.scene[key];if(stream&&stream.buffer&&!all.includes(stream.buffer))all.push(stream.buffer);}
  const prepared=frame&&frame.scene&&frame.scene.prepared;
  if(prepared)for(const stream of [prepared.geometry,prepared.clips]){
   if(!(stream instanceof Float32Array))throw new Error('Invalid prepared transfer streams');
   if(!all.includes(stream.buffer))all.push(stream.buffer);
  }
  for(const image of ownedImages(frame))all.push(image);return all;}
 function size(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>32*1024*1024)throw new Error('Invalid complete-frame dimensions');}
 function intersect(a,b){if(!a)return b?{...b}:null;if(!b)return {...a};const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
  return {x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};}
 function compositeFrame(frame){
  const scene=frame&&frame.scene,base=frame&&frame.baseBitmap,front=frame&&frame.foregroundBitmap;
  if(!scene||scene.version!==1||!base||frame.terrainBitmap||!Array.isArray(scene.sources)||!Array.isArray(scene.commands))throw new Error('Incomplete GPU presentation cohort');
  size(scene.width,scene.height);size(base.width,base.height);if(front&&(front.width!==base.width||front.height!==base.height))throw new Error('Foreground size mismatch');
  const count=scene.alphas&&scene.alphas.length;
  if(!(scene.vertices instanceof Float32Array)||!(scene.alphas instanceof Float32Array)||!(scene.previousPoints instanceof Float32Array)||
   !(scene.previousAlphas instanceof Float32Array)||scene.vertices.length!==count*4||scene.previousPoints.length!==count*2||scene.previousAlphas.length!==count)throw new Error('Invalid complete-frame mesh streams');
  const extra=front?12:6,total=count+extra,vertices=new Float32Array(total*4),alphas=new Float32Array(total),previousPoints=new Float32Array(total*2),previousAlphas=new Float32Array(total);
  // Mesh uses its existing physical coordinate space. Base/front retain their
  // high-resolution source textures and are sampled into that output extent.
  vertices.set(scene.vertices,24);alphas.set(scene.alphas,6);previousPoints.set(scene.previousPoints,12);previousAlphas.set(scene.previousAlphas,6);
  const ids=new Set(scene.sources.map(s=>s.id));let prefix='__gardenPresentation';while(ids.has(prefix+':base')||ids.has(prefix+':front'))prefix+=':';
  const quad=(first)=>{const xyuv=[0,0,0,0,scene.width,0,1,0,0,scene.height,0,1,0,scene.height,0,1,scene.width,0,1,0,scene.width,scene.height,1,1];
   vertices.set(xyuv,first*4);for(let i=0;i<6;i++){alphas[first+i]=previousAlphas[first+i]=1;previousPoints[(first+i)*2]=xyuv[i*4];previousPoints[(first+i)*2+1]=xyuv[i*4+1];}};
  const layer=(role,first)=>({type:'layer',textureId:prefix+':'+role,signature:'complete:'+role,first,count:6,hole:[0,0,0,0],tint:[0,0,0,0],clip:null,previousClip:null,interpolated:false,owner:null});
  quad(0);let outer=null;if(frame.clip){if(!['x','y','width','height'].every(k=>finite(frame.clip[k]))||frame.clip.width<0||frame.clip.height<0)throw new Error('Invalid external presentation clip');
   const x=scene.width/base.width,y=scene.height/base.height;outer={x:frame.clip.x*x,y:frame.clip.y*y,width:frame.clip.width*x,height:frame.clip.height*y};}
  const commands=[layer('base',0),...scene.commands.map(command=>({...command,first:command.first+6,
   clip:intersect(command.clip,outer),previousClip:intersect(command.previousClip,outer)}))];
  const sources=scene.sources.map(source=>({...source}));
  const addSource=(role,image)=>sources.push({id:prefix+':'+role,version:scene.scope+':'+scene.sequence+':'+role,width:image.width,height:image.height,source:image});
  addSource('base',base);if(front){quad(count+6);commands.push(layer('front',count+6));addSource('front',front);}
  return {...scene,view:String(scene.view||'')+':complete-mesh-extent',vertices,alphas,previousPoints,previousAlphas,commands,sources,
   stats:{...(scene.stats||{}),vertices:total,commands:commands.length,transferBytes:total*32,composition:'base-mesh-front',outputWidth:scene.width,outputHeight:scene.height,baseWidth:base.width,baseHeight:base.height}};
 }
 function geometryHash(packet,blend){const scratch=new ArrayBuffer(4),f=new Float32Array(scratch),u=new Uint32Array(scratch);let hash=2166136261;
  const mix=value=>{f[0]=value;hash=Math.imul(hash^u[0],16777619);};const count=packet.alphas.length,step=Math.max(1,Math.ceil(count/32));
  for(let i=0;i<count;i+=step){mix(packet.previousPoints[i*2]+(packet.vertices[i*4]-packet.previousPoints[i*2])*blend);
   mix(packet.previousPoints[i*2+1]+(packet.vertices[i*4+1]-packet.previousPoints[i*2+1])*blend);
   mix(packet.previousAlphas[i]+(packet.alphas[i]-packet.previousAlphas[i])*blend);mix(packet.vertices[i*4+2]);mix(packet.vertices[i*4+3]);}return (hash>>>0).toString(16).padStart(8,'0');}
 function createCohortFlow(env,role,{limit=128,enabled=true}={}){
  const performance=env.performance,origin=Number.isFinite(performance&&performance.timeOrigin)?performance.timeOrigin:null;
  const clock=performance&&typeof performance.now==='function'?()=>performance.now():()=>Date.now();
  const bounded=Number.isInteger(limit)&&limit>0?Math.min(limit,512):128,rows=[];
  let on=enabled===true,dropped=0;
  function stamp(){return clock();}
  function begin(scope,sequence,extra){if(!on)return null;return {role,scope,sequence,timeOrigin:origin,points:{enter:stamp()},durations:{},...(extra||{})};}
  function point(row,name){if(row)row.points[name]=stamp();}
  function sync(row,name,callback){if(!row)return callback();const start=stamp();row.points[name+'Start']=start;try{return callback();}finally{const end=stamp();row.points[name+'End']=end;row.durations[name]=end-start;}}
  function finish(row){if(!row)return null;point(row,'end');rows.push(row);if(rows.length>bounded){rows.shift();dropped++;}return row;}
  return {begin,point,sync,finish,setEnabled(value){on=value===true;},clear(){rows.length=0;dropped=0;},snapshot(){return {role,timeOrigin:origin,enabled:on,limit:bounded,dropped,rows:rows.map(row=>({...row,points:{...row.points},durations:{...row.durations}}))};}};
 }

 function createController(env){
  const cohortFlow=createCohortFlow(env,"gpu");
  let directPort=null,directSession=null,directCaptureEpoch=0,reservation=null,earlyDirect=null,lastDirectRequestId=0;
  function clearDirect(){if(earlyDirect)release(earlyDirect.frame);earlyDirect=null;reservation=null;}
  function closeDirect(){clearDirect();if(directPort){try{directPort.close();}catch(_){}directPort=null;}}
  function directReady(){if(ready&&directPort)send({type:'direct-ready',protocol:PROTOCOL,epoch,session:directSession,captureEpoch:directCaptureEpoch});}
  function directDrop(message){release(message&&message.frame);const t=message&&message.ticket;if(t)send({type:'dropped',protocol:PROTOCOL,epoch:t.gpuEpoch,requestId:t.gpuRequestId,ticket:t});}
  function directMatches(message){const t=message&&message.ticket,f=message&&message.frame;
   return validTicket(t)&&t.session===directSession&&t.gpuEpoch===epoch&&t.captureEpoch===directCaptureEpoch&&t.gpuRequestId>lastDirectRequestId&&
    f&&f.protocol===PROTOCOL&&f.epoch===t.captureEpoch&&f.requestId===t.captureRequestId&&f.scope===t.scope&&f.sequence===t.sequence&&f.receivedAt===t.receivedAt&&
    f.width===t.baseWidth&&f.height===t.baseHeight&&f.baseBitmap&&f.baseBitmap.width===t.baseWidth&&f.baseBitmap.height===t.baseHeight;
  }
  function directReceive(message){if(disposed||failed||!ready||!message||message.type!=='direct-stage'||message.protocol!==PROTOCOL||!directMatches(message)){directDrop(message);return;}
   if(!reservation){if(earlyDirect){directDrop(message);error(new Error('Multiple unreserved direct cohorts'));return;}earlyDirect=message;return;}
   if(!sameTicket(message.ticket,reservation)){directDrop(message);error(new Error('Direct cohort reservation mismatch'));return;}
   const ticket=reservation;reservation=null;lastDirectRequestId=ticket.gpuRequestId;
   stage({type:'stage',protocol:PROTOCOL,epoch:ticket.gpuEpoch,requestId:ticket.gpuRequestId,ticket,frame:message.frame,directReceive:message.directReceive});
  }
  function connectCapture(message){if(directPort||!ready||message.epoch!==epoch||typeof message.session!=='string'||!message.session||
    !Number.isSafeInteger(message.captureEpoch)||message.captureEpoch<0||!message.port||typeof message.port.postMessage!=='function'||typeof message.port.close!=='function'){
     if(message.port)close(message.port);throw new Error('Invalid direct GPU connection');}
   directPort=message.port;directSession=message.session;directCaptureEpoch=message.captureEpoch;
   directPort.onmessage=event=>{let message;try{const beforeData=now();message=event.data;const afterData=now();
    if(message)message.directReceive={timeOrigin:env.performance&&env.performance.timeOrigin||null,beforeData,afterData,readDataMs:afterData-beforeData};
    directReceive(message);
   }catch(reason){release(message&&message.frame);error(reason);}};
   directPort.onmessageerror=()=>error(new Error('Direct GPU port message error'));if(typeof directPort.start==='function')directPort.start();directReady();
  }
  function reserve(message){const ticket=message.ticket;
   if(!ready||!directPort||!validTicket(ticket)||message.epoch!==epoch||ticket.gpuEpoch!==epoch||ticket.captureEpoch!==directCaptureEpoch||ticket.session!==directSession||ticket.gpuRequestId<=lastDirectRequestId){
    send({type:'dropped',protocol:PROTOCOL,epoch:ticket&&ticket.gpuEpoch,requestId:ticket&&ticket.gpuRequestId,ticket});return;}
   if(reservation||current&&!current.acknowledged)throw new Error('Direct cohort already pending');reservation=ticket;
   if(earlyDirect){const message=earlyDirect;earlyDirect=null;directReceive(message);}
  }
  const now=()=>env.performance&&env.performance.now?env.performance.now():Date.now(),send=p=>env.postMessage(p);
  let compactDescriptors=false,initialized=false,disposed=false,failed=false,ready=false,epoch=0,presenter=null,canvas=null,baseCanvas=null,foregroundCanvas=null,baseContext=null,foregroundContext=null,current=null,raf=null,audit=null;
  let samples=[],opportunities=[],sampleCursor=0,opportunityCursor=0,frames=0,rafCallbacks=0,truncated=0,opportunityTruncated=0,imports=0,lastImportMs=0,firstStamp=null,lastStamp=null,lastHash=null,geometryChanges=0,presentCallbacks=0;
  const rafAvailable=typeof env.requestAnimationFrame==='function'&&typeof env.cancelAnimationFrame==='function';
  let rafNative=false;try{rafNative=rafAvailable&&/\[native code\]/.test(Function.prototype.toString.call(env.requestAnimationFrame));}catch(_){}
  let windowScheduler=false,windowPort=null,windowClock=null,windowGeneration=0,windowVisible=false,windowActive=false,windowLastId=0,windowLastAbsolute=null;
  let windowTickCallbacks=0,windowSuccessfulTicks=0,windowSkippedTicks=0,windowMeasurement=0;
  function closeWindowPort(){if(windowPort){windowPort.onmessage=windowPort.onmessageerror=null;close(windowPort);windowPort=null;}}
  function windowTickAck(message,success,reason,draw){const source={id:message.id,epoch:message.epoch,clockGeneration:message.clockGeneration,
    timeOrigin:message.timeOrigin,rafTimestamp:message.rafTimestamp,absoluteTimestamp:message.absoluteTimestamp};
   if(windowPort)windowPort.postMessage({type:'window-tick-ack',protocol:PROTOCOL,id:message.id,epoch:message.epoch,clockGeneration:message.clockGeneration,
    sourceWindowOpportunity:source,timeOrigin:env.performance.timeOrigin,success,...(success?{draw}:{reason})});
  }
  function receiveWindowTick(message){if(!message||disposed||failed)return;
   try{if(message.protocol!==PROTOCOL)throw new Error('Unsupported Window scheduler protocol');
    if(message.type==='window-control'){
     if(message.epoch!==epoch||!Number.isSafeInteger(message.clockGeneration)||message.clockGeneration<windowGeneration)return;
     if(typeof message.visible!=='boolean'||typeof message.active!=='boolean')throw new Error('Invalid Window scheduler control');
     windowGeneration=message.clockGeneration;windowVisible=message.visible;windowActive=message.active;return;
    }
    if(message.type!=='window-tick')throw new Error('Unsupported Window scheduler message');
    if(!Number.isSafeInteger(message.id)||message.id<1||!Number.isSafeInteger(message.epoch)||!Number.isSafeInteger(message.clockGeneration)||
       !Number.isSafeInteger(message.measurementGeneration)||message.measurementGeneration<0||!finite(message.rafTimestamp)||message.rafTimestamp<0||!finite(message.absoluteTimestamp)||message.timeOrigin!==windowClock.timeOrigin||
       Math.abs(message.timeOrigin+message.rafTimestamp-message.absoluteTimestamp)>1e-6)throw new Error('Invalid native Window opportunity');
    const recorded=message.measurementGeneration===windowMeasurement;if(recorded)windowTickCallbacks++;
    if(message.epoch!==epoch||message.clockGeneration!==windowGeneration){if(recorded)windowSkippedTicks++;windowTickAck(message,false,'stale-generation');return;}
    if(message.id<=windowLastId||windowLastAbsolute!==null&&message.absoluteTimestamp<=windowLastAbsolute){if(recorded)windowSkippedTicks++;windowTickAck(message,false,'non-monotonic-opportunity');return;}
    windowLastId=message.id;windowLastAbsolute=message.absoluteTimestamp;
    if(!ready||!current||!windowVisible||!windowActive){if(recorded)windowSkippedTicks++;windowTickAck(message,false,!current?'inactive':'hidden-or-stopped');return;}
    const source={id:message.id,epoch:message.epoch,clockGeneration:message.clockGeneration,timeOrigin:message.timeOrigin,
      rafTimestamp:message.rafTimestamp,absoluteTimestamp:message.absoluteTimestamp};
    const draw=tick(now(),source,message.measurementGeneration);
    if(draw){if(recorded)windowSuccessfulTicks++;windowTickAck(message,true,null,draw);}
    else {if(recorded)windowSkippedTicks++;windowTickAck(message,false,failed?'render-failed':'not-presented');}
   }catch(reason){error(reason);}
  }
  function initializeWindowScheduler(message,config){if(config.scheduler===undefined||config.scheduler==='worker-raf')return;
   if(config.scheduler!=='window-raf')throw new Error('Unsupported presentation scheduler');
   const clock=config.windowClock,port=message.tickPort;
   if(!clock||clock.rafNative!==true||clock.cancelRafNative!==true||!finite(clock.timeOrigin)||!Number.isSafeInteger(clock.clockGeneration)||clock.clockGeneration<0||
     typeof clock.visible!=='boolean'||!env.performance||!finite(env.performance.timeOrigin)||typeof env.performance.now!=='function'||!port||typeof port.postMessage!=='function'||typeof port.close!=='function')
     {close(port);throw new Error('Private Window scheduler initialization unavailable');}
   windowScheduler=true;windowClock={timeOrigin:clock.timeOrigin};windowGeneration=clock.clockGeneration;windowVisible=clock.visible;
   windowPort=port;windowPort.onmessage=event=>receiveWindowTick(event.data);windowPort.onmessageerror=()=>error(new Error('Window scheduler port message error'));
   if(typeof windowPort.start==='function')windowPort.start();
  }
  function clearMetrics(){windowTickCallbacks=windowSuccessfulTicks=windowSkippedTicks=0;cohortFlow.clear();samples=[];opportunities=[];sampleCursor=opportunityCursor=0;frames=rafCallbacks=truncated=opportunityTruncated=imports=geometryChanges=presentCallbacks=0;firstStamp=lastStamp=lastHash=null;lastImportMs=0;}
  function ordered(){return truncated?samples.slice(sampleCursor).concat(samples.slice(0,sampleCursor)):samples.slice();}
  function getMetrics(options){const rows=ordered(),elapsed=firstStamp!==null&&lastStamp>firstStamp?lastStamp-firstStamp:0;
   const result={cohortFlow:cohortFlow.snapshot(),protocol:PROTOCOL,timeOrigin:env.performance&&env.performance.timeOrigin||null,rafAvailable,rafNative,
    active:!!current,ready,failed,disposed,epoch,scope:current&&current.packet.scope||null,sequence:current&&current.packet.sequence||null,
    canvas:canvas?{width:canvas.width,height:canvas.height}:null,submission:'OffscreenCanvas WebGL automatic submission after natural RAF task; no explicit commit API',
    composition:'original-three-planes',surfaces:{mesh:canvas?{width:canvas.width,height:canvas.height}:null,
      base:baseCanvas?{width:baseCanvas.width,height:baseCanvas.height}:null,foreground:foregroundCanvas?{width:foregroundCanvas.width,height:foregroundCanvas.height}:null},
    firstStamp,lastStamp,successfulNaturalFrames:frames,drawnNaturalFrames:frames,recordedNaturalFrames:rows.length,rafCallbacks,presentCallbacks,geometryChanges,truncated,droppedSamples:truncated,
    timestamps:opportunityTruncated?opportunities.slice(opportunityCursor).concat(opportunities.slice(0,opportunityCursor)):opportunities.slice(),opportunityTruncated,
    sampleLimit:MAX_SAMPLES,drawFPS:elapsed?(frames-1)*1000/elapsed:null,imports,lastImportMs,samples:rows,
    renderer:presenter?{...presenter.stats}:null};
   if(windowScheduler)Object.assign(result,{scheduler:'window-raf',clock:{scheduler:'window-raf',timeOrigin:env.performance.timeOrigin,sourceTimeOrigin:windowClock.timeOrigin,clockGeneration:windowGeneration,measurementGeneration:windowMeasurement,visible:windowVisible,active:windowActive},
    submission:'OffscreenCanvas WebGL automatic submission after real Window RAF tick task; no explicit commit API',
    successfulNaturalFrames:0,drawnNaturalFrames:0,recordedNaturalFrames:0,rafCallbacks:0,timestamps:[],opportunityTruncated:0,
    successfulWindowFrames:frames,drawnWindowFrames:frames,recordedWindowFrames:rows.length,windowTickCallbacks,windowSkippedTicks});
   if(options&&options.reset)clearMetrics();return result;}
  function closePlanes(cohort){if(!cohort)return;const all=new Set([cohort.baseBitmap,cohort.foregroundBitmap]);for(const value of all)close(value);cohort.baseBitmap=cohort.foregroundBitmap=null;}
  function stop(){if(raf!==null&&rafAvailable)env.cancelAnimationFrame(raf);raf=null;closePlanes(current);current=null;if(presenter)presenter.invalidate();}
  function error(reason){if(failed||disposed)return;failed=true;ready=false;stop();closeDirect();closeWindowPort();if(presenter)presenter.dispose();presenter=null;
   if(audit){send({type:'metrics-error',protocol:PROTOCOL,epoch,requestId:audit.requestId,error:String(reason&&reason.message||reason)});audit=null;}
   send({type:'error',protocol:PROTOCOL,epoch,fatal:true,error:String(reason&&reason.message||reason)});}
  function pixelHash(packet,blend){const gl=canvas.getContext('webgl'),rects=[],actorCommands=(packet.descriptorWire===undefined?packet.commands:env.GardenRetainedScene.sceneCommands(packet)).filter(command=>command.type==='mesh');
   const centres=actorCommands.length?[actorCommands[0],actorCommands[Math.floor(actorCommands.length/2)],actorCommands.at(-1)].map(command=>{
    const i=command.first;return {x:packet.previousPoints[i*2]+(packet.vertices[i*4]-packet.previousPoints[i*2])*blend,
     y:packet.previousPoints[i*2+1]+(packet.vertices[i*4+1]-packet.previousPoints[i*2+1])*blend};}):[{x:canvas.width/2,y:canvas.height/2}];
   let hash=2166136261;for(const centre of centres){const width=Math.min(16,canvas.width),height=Math.min(16,canvas.height),x=Math.max(0,Math.min(canvas.width-width,Math.floor(centre.x-width/2))),
    y=Math.max(0,Math.min(canvas.height-height,Math.floor(centre.y-height/2))),bytes=new Uint8Array(width*height*4);gl.readPixels(x,canvas.height-y-height,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let part=2166136261;for(const value of bytes){part=Math.imul(part^value,16777619);hash=Math.imul(hash^value,16777619);}rects.push({x,y,width,height,hash:(part>>>0).toString(16).padStart(8,'0')});}
   return {rects,hash:(hash>>>0).toString(16).padStart(8,'0')};}
  function tick(stamp,sourceWindowOpportunity,measurementGeneration){raf=null;if(disposed||failed||!current)return;
   const recordFrame=!sourceWindowOpportunity||measurementGeneration===windowMeasurement;let drawRow=null;
   if(!sourceWindowOpportunity)rafCallbacks++;
   if(!sourceWindowOpportunity){if(opportunities.length<MAX_SAMPLES)opportunities.push(stamp);else {opportunities[opportunityCursor]=stamp;opportunityCursor=(opportunityCursor+1)%MAX_SAMPLES;opportunityTruncated++;}}
   const cohort=current,packet=cohort.packet,at=now(),blend=cohort.spanMs>0&&cohort.spanMs<=120?clamp((at-cohort.arrivedAt)/cohort.spanMs):1;
   let presented=false;try{const drawStart=now();let baseFresh=false,foregroundFresh=false;
    if(cohort.planesPending){
     // Preserve the original 2D backing pixels and DOM sampling. All three
     // updates occur in this one natural RAF task; no GL texture resampling.
     const flowRow=cohort.flowRow;cohortFlow.point(flowRow,'firstPlaneRaf');
     if(flowRow)flowRow.firstPlaneRafTimestamp=stamp;
     const width=cohort.baseBitmap.width,height=cohort.baseBitmap.height;
     if(baseCanvas.width!==width)baseCanvas.width=width;if(baseCanvas.height!==height)baseCanvas.height=height;
     if(foregroundCanvas.width!==width)foregroundCanvas.width=width;if(foregroundCanvas.height!==height)foregroundCanvas.height=height;
     cohortFlow.sync(flowRow,'baseTransfer',()=>baseContext.transferFromImageBitmap(cohort.baseBitmap));cohort.baseBitmap=null;baseFresh=true;cohort.baseReady=true;
     cohortFlow.sync(flowRow,'foregroundTransfer',()=>foregroundContext.transferFromImageBitmap(cohort.foregroundBitmap||null));cohort.foregroundBitmap=null;foregroundFresh=true;cohort.foregroundReady=true;cohort.planesPending=false;cohortFlow.point(flowRow,'planesTransferred');
    }
    const ok=presenter.replay(cohort.token,blend,()=>{presented=true;if(recordFrame)presentCallbacks++;return true;}),drawEnd=now(),drawCalls=presenter.stats.drawRuns;
    // The retained renderer clears and submits a transparent mesh surface even
    // when this cohort contains no commands or vertices. Keep that real clear
    // frame valid without inventing a draw call, or accepting missing actor draws.
    const meshClearedOnly=packet.commands.length===0&&packet.vertices.length===0&&packet.alphas.length===0&&packet.previousPoints.length===0&&packet.previousAlphas.length===0;
    if(!ok||!presented||!Number.isInteger(drawCalls)||drawCalls<0||(!meshClearedOnly&&drawCalls<1))throw new Error('Complete GPU frame was not presented');
    const hash=geometryHash(packet,blend);if(recordFrame){if(lastHash!==null&&lastHash!==hash)geometryChanges++;lastHash=hash;frames++;if(!sourceWindowOpportunity){if(firstStamp===null)firstStamp=stamp;lastStamp=stamp;}}
    const row={timestamp:stamp,drawStart,drawEnd,implicitCommitAt:now(),scope:packet.scope,sequence:packet.sequence,blend,geometrySampleHash:hash,drawCalls,presented:true,
     meshDrawn:true,meshClearedOnly,baseReady:cohort.baseReady,foregroundReady:cohort.foregroundReady,baseFresh,foregroundFresh};
    if(sourceWindowOpportunity){row.timestamp=row.implicitCommitAt;row.sourceWindowOpportunity={...sourceWindowOpportunity};row.measurementGeneration=measurementGeneration;
     if(recordFrame){if(firstStamp===null)firstStamp=row.implicitCommitAt;lastStamp=row.implicitCommitAt;}}
    drawRow=row;if(recordFrame){if(samples.length<MAX_SAMPLES)samples.push(row);else {samples[sampleCursor]=row;sampleCursor=(sampleCursor+1)%MAX_SAMPLES;truncated++;}}
    if(!cohort.acknowledged){cohortFlow.point(cohort.flowRow,'firstMeshDrawn');cohortFlow.finish(cohort.flowRow);cohort.acknowledged=true;send({type:'presented',protocol:PROTOCOL,epoch,requestId:cohort.requestId,scope:packet.scope,sequence:packet.sequence,width:packet.width,height:packet.height,
      composition:'original-three-planes',baseWidth:baseCanvas.width,baseHeight:baseCanvas.height,
      ...(cohort.ticket?{ticket:cohort.ticket,metadata:cohort.metadata}:{})});}
    if(audit){audit.samples.push({timestamp:stamp,scope:packet.scope,sequence:packet.sequence,blend,...pixelHash(packet,blend)});if(audit.samples.length===audit.count){send({type:'metrics',protocol:PROTOCOL,epoch,requestId:audit.requestId,metrics:{...getMetrics(),pixelAudit:audit.samples}});audit=null;}}
   }catch(reason){error(reason);return;}if(!windowScheduler&&current===cohort&&!failed&&!disposed)raf=env.requestAnimationFrame(tick);return drawRow;
  }
  function initialize(message){if(initialized)throw new Error('GPU presenter already initialized');initialized=true;
   if(message.protocol!==PROTOCOL||!Number.isSafeInteger(message.epoch)||!message.canvas||!message.baseCanvas||!message.foregroundCanvas)throw new Error('Invalid GPU presentation initialization');
   epoch=message.epoch;canvas=message.canvas;baseCanvas=message.baseCanvas;foregroundCanvas=message.foregroundCanvas;
   if(new Set([canvas,baseCanvas,foregroundCanvas]).size!==3)throw new Error('GPU presentation surfaces must be independent');
   const config=message.config||{};initializeWindowScheduler(message,config);
   if(!windowScheduler&&!rafAvailable)throw new Error('Natural dedicated Worker RAF unavailable');
   compactDescriptors=config.compactDescriptors===true;cohortFlow.setEnabled(config.cohortFlow!==false);if(config.bundled!==true){if(!config.retainedScript||typeof env.importScripts!=='function')throw new Error('Retained scene script required');env.importScripts(config.retainedScript);}
   if(!env.GardenRetainedScene||typeof env.GardenRetainedScene.createPacketPresenter!=='function')throw new Error('Retained presentation API unavailable');
   if(env.GardenRetainedScene.preparedSchema!==1||typeof env.GardenRetainedScene.preparePacket!=='function')throw new Error('Prepared retained API unavailable');
   if(compactDescriptors&&(env.GardenRetainedScene.compactDescriptorSchema!==1||typeof env.GardenRetainedScene.prepareCompactPacket!=='function'||typeof env.GardenRetainedScene.sceneCommands!=='function'))throw new Error('Compact retained API unavailable');
   presenter=env.GardenRetainedScene.createPacketPresenter({createMeshCanvas:()=>canvas,stageDiagnostics:true,privateReplayStateCache:config.privateReplayStateCache===true,coalesceClipUploads:config.coalesceClipUploads===true});
   preparedCapabilities({preparedSchema:env.GardenRetainedScene.preparedSchema,samplerBankSize:presenter.stats.samplerBankSize,
      ...(env.GardenRetainedScene.compactDescriptorSchema===undefined?{}:{compactDescriptorSchema:env.GardenRetainedScene.compactDescriptorSchema})},compactDescriptors);ready=true;
   baseContext=baseCanvas.getContext('bitmaprenderer');foregroundContext=foregroundCanvas.getContext('bitmaprenderer');
   if(!baseContext||!foregroundContext||typeof baseContext.transferFromImageBitmap!=='function'||typeof foregroundContext.transferFromImageBitmap!=='function')throw new Error('Worker bitmaprenderer presentation unavailable');
   send({type:'ready',protocol:PROTOCOL,epoch,rafAvailable,rafNative,...(windowScheduler?{scheduler:'window-raf',windowClock:{sourceTimeOrigin:windowClock.timeOrigin,clockGeneration:windowGeneration}}:{}),
    capabilities:preparedCapabilities({preparedSchema:env.GardenRetainedScene.preparedSchema,samplerBankSize:presenter.stats.samplerBankSize,
      ...(env.GardenRetainedScene.compactDescriptorSchema===undefined?{}:{compactDescriptorSchema:env.GardenRetainedScene.compactDescriptorSchema})},compactDescriptors),
    setup:{renderOnly:true,threePlanes:true,output:'original-physical-extents'}});
  }
  function stage(message){const frame=message.frame;if(!ready||message.epoch!==epoch){release(frame);send({type:'dropped',protocol:PROTOCOL,epoch:message.epoch,requestId:message.requestId});return;}
   let imported=false;try{if(!Number.isSafeInteger(message.requestId)||!frame||typeof frame.scope!=='string'||!Number.isSafeInteger(frame.sequence)||frame.scene.scope!==frame.scope||frame.scene.sequence!==frame.sequence)throw new Error('Invalid GPU presentation generation');
    const previous=current,packet=frame.scene,flowRow=cohortFlow.begin(frame.scope,frame.sequence,{requestId:message.requestId,capture:frame.cohortFlow||null,directReceive:message.directReceive||null});if(!frame.baseBitmap||frame.terrainBitmap)throw new Error('Incomplete three-plane visual cohort');
    if(compactDescriptors!== (packet.descriptorWire!==undefined))throw new Error('Compact GPU mode mismatch');
    if(packet.descriptorWire!==undefined){
     preparedCapabilities({preparedSchema:env.GardenRetainedScene.preparedSchema,samplerBankSize:presenter.stats.samplerBankSize,compactDescriptorSchema:env.GardenRetainedScene.compactDescriptorSchema},true);
     compactBuffers(packet);
    }
    size(packet.width,packet.height);size(frame.baseBitmap.width,frame.baseBitmap.height);
    if(frame.foregroundBitmap&&(frame.foregroundBitmap.width!==frame.baseBitmap.width||frame.foregroundBitmap.height!==frame.baseBitmap.height))throw new Error('Foreground size mismatch');
    const same=previous&&previous.packet.scope===packet.scope&&frame.receivedAt>previous.receivedAt;
    const spanMs=finite(frame.spanMs)?frame.spanMs:same?frame.receivedAt-previous.receivedAt:0;
    // Keep an already scheduled natural RAF. This synchronous import replaces
    // its cohort before that callback runs, without losing an opportunity.
    cohortFlow.sync(flowRow,'closePreviousPlanes',()=>closePlanes(previous));current=null;const textures=packet.sources.filter(source=>source.source),start=now();
    imported=true;const token=cohortFlow.sync(flowRow,'importScene',()=>presenter.import({packet,textures}));if(token===null||token===false)throw new Error('Complete scene import declined');imports++;lastImportMs=now()-start;
    current={flowRow,packet,token,spanMs,arrivedAt:now(),receivedAt:frame.receivedAt,requestId:message.requestId,acknowledged:false,
      ticket:message.ticket||null,metadata:message.ticket?{scope:frame.scope,sequence:frame.sequence,receivedAt:frame.receivedAt,width:frame.width,height:frame.height,
        clip:frame.clip||null,scene:{stats:packet.stats||null},...(frame.persistentAssetBitmaps?{persistentAssetBitmaps:frame.persistentAssetBitmaps}:{}),imported:true,gpuTransferred:true}:null,
      baseBitmap:frame.baseBitmap,foregroundBitmap:frame.foregroundBitmap||null,planesPending:true,baseReady:false,foregroundReady:false};
    cohortFlow.point(flowRow,'staged');send({type:'staged',protocol:PROTOCOL,epoch,requestId:message.requestId,scope:packet.scope,sequence:packet.sequence,importMs:lastImportMs});if(!windowScheduler&&raf===null)raf=env.requestAnimationFrame(tick);
   }catch(reason){if(!imported)release(frame);else closePlanes(frame);error(reason);}}
  function receive(message){if(!message)return;if(disposed||failed){release(message.frame);return;}
   try{if(message.protocol!==PROTOCOL)throw new Error('Unsupported GPU presentation protocol');
    if(message.type==='init')initialize(message);
    else if(message.type==='connect-capture')connectCapture(message);
    else if(message.type==='reserve')reserve(message);
    else if(message.type==='cancel-reservation'){const t=message.ticket;
     if(validTicket(t)&&t.session===directSession&&t.gpuEpoch===epoch&&t.captureEpoch===directCaptureEpoch){
      if(sameTicket(t,reservation))reservation=null;
      if(earlyDirect&&sameTicket(t,earlyDirect.ticket)){release(earlyDirect.frame);earlyDirect=null;}
      lastDirectRequestId=Math.max(lastDirectRequestId,t.gpuRequestId);}}
    else if(message.type==='stage'){if(directPort)throw new Error('Main full-frame route disabled for direct session');stage(message);}
    else if(message.type==='reset'&&Number.isSafeInteger(message.epoch)&&message.epoch>epoch){
     if(windowScheduler&&(!Number.isSafeInteger(message.windowClockGeneration)||message.windowClockGeneration<=windowGeneration))throw new Error('Invalid Window reset generation');
     stop();clearDirect();epoch=message.epoch;if(windowScheduler){windowGeneration=message.windowClockGeneration;windowActive=false;}
     if(directPort){if(!Number.isSafeInteger(message.captureEpoch)||message.captureEpoch<directCaptureEpoch)throw new Error('Invalid direct capture reset epoch');directCaptureEpoch=message.captureEpoch;}
     directReady();
     if(audit){send({type:'metrics-error',protocol:PROTOCOL,epoch,requestId:audit.requestId,error:'Pixel audit interrupted by reset'});audit=null;}
     if(ready)send({type:'ready',protocol:PROTOCOL,epoch,rafAvailable,rafNative,...(windowScheduler?{scheduler:'window-raf',windowClock:{sourceTimeOrigin:windowClock.timeOrigin,clockGeneration:windowGeneration}}:{}),
      capabilities:preparedCapabilities({preparedSchema:env.GardenRetainedScene.preparedSchema,samplerBankSize:presenter.stats.samplerBankSize,
      ...(env.GardenRetainedScene.compactDescriptorSchema===undefined?{}:{compactDescriptorSchema:env.GardenRetainedScene.compactDescriptorSchema})},compactDescriptors),setup:{reset:true,threePlanes:true}});}
    else if(message.type==='metrics'){if(message.epoch!==epoch){send({type:'metrics-error',protocol:PROTOCOL,epoch,requestId:message.requestId,error:'Stale metrics epoch'});return;}
     const options=message.options||{};
     if(windowScheduler){if(!Number.isSafeInteger(options.windowMeasurementGeneration)||options.windowMeasurementGeneration<windowMeasurement)throw new Error('Invalid Window measurement generation');
      if(options.reset)windowMeasurement=options.windowMeasurementGeneration;else if(options.windowMeasurementGeneration!==windowMeasurement)throw new Error('Window measurement generation mismatch');}
     if(options.reset)clearMetrics();if(options.pixels){if(audit||!current)throw new Error('Pixel audit requires one active scene');audit={requestId:message.requestId,count:Math.max(1,Math.min(3,Math.trunc(options.pixelFrames||3))),samples:[]};}
     else send({type:'metrics',protocol:PROTOCOL,epoch,requestId:message.requestId,metrics:getMetrics()});}
    else if(message.type==='destroy')destroy();
   }catch(reason){if(message.type==='metrics')send({type:'metrics-error',protocol:PROTOCOL,epoch,requestId:message.requestId,error:String(reason.message||reason)});else {release(message.frame);error(reason);}}
  }
  function destroy(){if(disposed)return;stop();closeDirect();closeWindowPort();disposed=true;ready=false;if(presenter)presenter.dispose();presenter=null;audit=null;}
  return Object.freeze({receive,destroy,getMetrics,state:()=>({epoch,ready,failed,disposed,active:!!current})});
 }
 let controller=null;function attach(){if(controller)return controller;controller=createController(global);global.onmessage=event=>controller.receive(event.data);return controller;}
 return Object.freeze({protocol:PROTOCOL,composeFrame:compositeFrame,compositeFrame,geometryHash,transfers,release,createController,attach});
});
