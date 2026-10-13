/* Candidate 67: private rendering replica. It owns no simulation or saves. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.GardenRenderWorker=api;api.attach();}
})(typeof globalThis!=='undefined'?globalThis:this,function(global){
  'use strict';
 const TICKET_FIELDS=['session','captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','key','scope','sequence','receivedAt','baseWidth','baseHeight'];
 function sameTicket(a,b){return !!a&&!!b&&TICKET_FIELDS.every(k=>a[k]===b[k]);}
 function validTicket(t){return !!t&&typeof t.session==='string'&&t.session.length>0&&typeof t.key==='string'&&typeof t.scope==='string'&&t.scope.length>0&&
  ['captureEpoch','gpuEpoch','captureRequestId','gpuRequestId','sequence','baseWidth','baseHeight'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)&&
  t.captureRequestId>0&&t.gpuRequestId>0&&t.baseWidth>0&&t.baseHeight>0&&t.baseWidth<=16384&&t.baseHeight<=16384&&Number.isFinite(t.receivedAt);}

  const PROTOCOL=1,MAX_PIXELS=24*1024*1024;
  const SCRIPTS=Object.freeze([
    'shared/prepared-restore-dependencies.js','shared/scene-terrain.js',
    'shared/combat-feedback.js','shared/run-director.js','engine.js',
    'shared/endless-worker-bridge.js','shared/pvz-motion-data.js',
    'shared/retained-scene.js','shared/character-motion.js',
    'shared/sun-collection.js','shared/combat-effects.js','shared/terrain-renderer.js',
    'shared/lily-renderer.js','shared/explosive-sound.js','shared/save-library.js',
    'shared/challenge-modes.js','shared/battle-layout.js','shared/resilient-images.js',
    'shared/autosave-history.js','shared/tutorial.js','shared/browser-assets.js',
    'shared/achievements.js','shared/native-runtime.js'
  ]);

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
  const noop=()=>{};
  function closeBitmap(value){if(value&&typeof value.close==='function')try{value.close();}catch(_){} }
  function dimensions(width,height){
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>MAX_PIXELS)
      throw new Error('Invalid rendering replica canvas size');
  }
  // Private replica only. Snapshot the already rasterized CPU asset canvas,
  // never its initial decoded bitmap. Source identities remain unchanged.
  function createPersistentAssetBitmaps(settings){
    const enabled=settings.enabled===true,pixelLimit=16*1024*1024,entryLimit=64;
    const sources=new WeakMap(),entries=new Map(),retired=new Set(),owned=new WeakMap(),closed=new WeakSet(),contexts=new WeakSet();
    let disposed=false,epoch=0,pixels=0,residentEntries=0;
    const counts={attempts:0,hits:0,misses:0,pendingDraws:0,bypasses:0,failures:0,invalidations:0,snapshots:0,closed:0,
      baseHits:0,foregroundHits:0,attachedBase:0,attachedForeground:0,lastFailure:null};
    function fail(error){counts.failures++;counts.lastFailure=String(error&&error.message||error).slice(0,1024);}
    function close(value){
      if(!value||typeof value!=='object'||closed.has(value)||typeof value.close!=='function')return;
      closed.add(value);counts.closed++;try{value.close();}catch(error){fail(error);}
    }
    function finishReservation(entry){
      if(entry.reserved){pixels-=entry.pixels;entry.reserved=false;}
      if(!entry.alive&&entry.resident){residentEntries--;entry.resident=false;retired.delete(entry);}
    }
    function retire(entry){
      if(!entry||!entry.alive)return;entry.alive=false;
      if(entries.get(entry.source)===entry)entries.delete(entry.source);
      if(entry.bitmap){owned.delete(entry.bitmap);close(entry.bitmap);entry.bitmap=null;pixels-=entry.pixels;}
      if(entry.pending){retired.add(entry);return;}
      finishReservation(entry);
      if(entry.resident){residentEntries--;entry.resident=false;}
    }
    function register(source,generation){
      if(!enabled||disposed)return;
      if(!source||typeof source!=='object'||!Number.isSafeInteger(generation)||generation<0)throw Error('Invalid owned asset registration');
      if(sources.has(source))throw Error('Asset source already registered');
      sources.set(source,{generation,ready:false,width:0,height:0});
    }
    function invalidate(source,generation){
      if(!enabled||disposed)return;const record=sources.get(source);
      if(!record||!Number.isSafeInteger(generation)||generation<=record.generation)throw Error('Invalid asset source generation');
      retire(entries.get(source));record.generation=generation;record.ready=false;record.width=0;record.height=0;counts.invalidations++;
    }
    function ready(source,generation){
      if(!enabled||disposed)return;const record=sources.get(source);
      if(!record||generation!==record.generation)throw Error('Unknown/stale loaded asset source');
      const w=source.width,h=source.height;
      if(source.complete!==true||!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||w*h>24*1024*1024)throw Error('Invalid loaded asset dimensions');
      record.ready=true;record.width=w;record.height=h;
    }
    function sourceReady(source,record){return !!record&&record.ready&&source.complete===true&&source.width===record.width&&source.height===record.height;}
    function allocate(source,record){
      const size=record.width*record.height;
      if(size>pixelLimit){counts.bypasses++;return null;}
      while(entries.size&&(residentEntries>=entryLimit||pixels+size>pixelLimit))retire(entries.values().next().value);
      if(residentEntries>=entryLimit||pixels+size>pixelLimit){counts.bypasses++;return null;}
      const entry={source,generation:record.generation,width:record.width,height:record.height,pixels:size,epoch,
        alive:true,resident:true,reserved:true,pending:true,bitmap:null,failed:false};
      entries.set(source,entry);residentEntries++;pixels+=size;counts.misses++;
      // Single-flight launch in a microtask. Retired pending sources remain
      // strongly retained and charged until their factory settles.
      Promise.resolve().then(()=>{
        if(disposed||!entry.alive||entry.epoch!==epoch||!sourceReady(source,record)||record.generation!==entry.generation)return null;
        counts.snapshots++;return settings.createBitmap(source);
      }).then(bitmap=>{
        if(!bitmap){if(!disposed&&entry.alive&&entry.epoch===epoch&&entries.get(source)===entry)throw Error('Invalid persistent asset snapshot');return;}
        const previousOwner=typeof bitmap==='object'?owned.get(bitmap):null;
        if(previousOwner&&previousOwner!==entry)throw Error('Snapshot bitmap already belongs to another live asset');
        let valid;try{valid=typeof bitmap==='object'&&bitmap!==source&&typeof bitmap.close==='function'&&!closed.has(bitmap)&&
          bitmap.width===entry.width&&bitmap.height===entry.height;}catch(error){if(!previousOwner&&bitmap!==source)close(bitmap);throw error;}
        if(!valid){if(!previousOwner&&bitmap!==source)close(bitmap);throw Error('Invalid persistent asset snapshot');}
        if(disposed||!entry.alive||entry.epoch!==epoch||entries.get(source)!==entry||!sourceReady(source,record)||record.generation!==entry.generation){close(bitmap);return;}
        owned.set(bitmap,entry);entry.bitmap=bitmap;entry.reserved=false;
      }).catch(error=>{entry.failed=true;fail(error);}).finally(()=>{
        entry.pending=false;
        if(!entry.bitmap)finishReservation(entry);
      });
      return entry;
    }
    function resolve(source,plane){
      if(!enabled||disposed)return source;const record=sources.get(source);
      if(!record){counts.bypasses++;return source;}
      if(!sourceReady(source,record)){retire(entries.get(source));counts.bypasses++;return source;}
      counts.attempts++;let entry=entries.get(source);
      if(entry&&(entry.generation!==record.generation||entry.width!==record.width||entry.height!==record.height)){retire(entry);entry=null;}
      if(!entry)entry=allocate(source,record);
      if(!entry)return source;
      entries.delete(source);entries.set(source,entry);
      if(entry.bitmap){counts.hits++;if(plane==='base')counts.baseHits++;else counts.foregroundHits++;return entry.bitmap;}
      if(entry.pending)counts.pendingDraws++;
      return source;
    }
    function attach(context,plane){
      if(!enabled||disposed||!context||contexts.has(context)||!['base','foreground'].includes(plane))return context;
      let attributes;try{attributes=context.getContextAttributes();}catch(_){return context;}
      if(!attributes||attributes.willReadFrequently!==false||attributes.colorSpace!=='srgb'||attributes.colorType!=='unorm8'||typeof context.drawImage!=='function')return context;
      const drawImage=context.drawImage;
      Object.defineProperty(context,'drawImage',{configurable:true,writable:true,value:function(source,...args){
        // Preserve borrowed-method behavior and every Canvas state/argument.
        return drawImage.call(this,this===context?resolve(source,plane):source,...args);
      }});
      contexts.add(context);if(plane==='base')counts.attachedBase++;else counts.attachedForeground++;
      return context;
    }
    function clear(){epoch++;for(const entry of Array.from(entries.values()))retire(entry);}
    function dispose(){if(disposed)return;disposed=true;clear();}
    function state(){
      let readyEntries=0,pendingEntries=0,failedEntries=0,bitmapPixels=0,reservedPixels=0;
      for(const entry of [...entries.values(),...retired]){
        if(entry.bitmap){readyEntries++;bitmapPixels+=entry.pixels;}
        if(entry.pending)pendingEntries++;if(entry.failed)failedEntries++;if(entry.reserved)reservedPixels+=entry.pixels;
      }
      return {enabled,disposed,epoch,pixelLimit,entryLimit,entries:entries.size,retiredEntries:retired.size,residentEntries,
        readyEntries,pendingEntries,failedEntries,pixels,bitmapPixels,reservedPixels,...counts};
    }
    return Object.freeze({register,invalidate,ready,attach,resolve,clear,dispose,state});
  }

  function createPlatform(env,config){
    config=config||{};
    if(typeof env.OffscreenCanvas!=='function'||typeof env.createImageBitmap!=='function'||typeof env.fetch!=='function')
      throw new Error('Offscreen rendering is unavailable');
    let disposed=false,foreground=null,mesh=null,clip=null,motionVisible=false;
    const images=new Set(),controllers=new Set();
    const requestedOutputBacking=config.outputBackingCPU;
    const outputPlaneCPU={
      base:requestedOutputBacking===true||!!(requestedOutputBacking&&typeof requestedOutputBacking==='object'&&requestedOutputBacking.base===true),
      foreground:requestedOutputBacking===true||!!(requestedOutputBacking&&typeof requestedOutputBacking==='object'&&requestedOutputBacking.foreground===true)
    };
    const persistentAssets=createPersistentAssetBitmaps({enabled:config.persistentAssetBitmaps===true,createBitmap:source=>env.createImageBitmap.call(env,source)});
    const canvas=createOutputCanvas('base');
    const assetMap=config.assetMap||env.GardenVisualAssetMap;
    function imageSource(source){
      if(!assetMap||typeof assetMap!=='object'||source.startsWith('data:')||source.startsWith('blob:'))return source;
      const keys=[source],assetRoot=String(config.assetRoot||'');
      if(assetRoot&&source.startsWith(assetRoot))keys.push('assets/'+source.slice(assetRoot.length).replace(/^\/+/,''));
      try{
        const url=new env.URL(source,config.scriptBase||assetRoot||undefined),path=decodeURIComponent(url.pathname);
        const assetsAt=path.lastIndexOf('/assets/');if(assetsAt>=0)keys.push(path.slice(assetsAt+1));
      }catch(_){}
      for(const key of keys)if(Object.prototype.hasOwnProperty.call(assetMap,key)&&typeof assetMap[key]==='string')return assetMap[key];
      return source;
    }
    // Diagnostic only: output surfaces preserve original backing by default.
    // Explicit boolean/per-plane opt-in changes only first 2D backing hints.
    function createOutputCanvas(plane){
      if(disposed)throw new Error('Rendering replica is disposed');
      const surface=new env.OffscreenCanvas(1,1);
      if(outputPlaneCPU[plane]!==true){
        if(config.persistentAssetBitmaps===true){const getContext=surface.getContext;
          surface.getContext=function(type,attributes){const context=getContext.call(this,type,attributes);return type==='2d'?persistentAssets.attach(context,plane):context;};}
        return surface;
      }
      const getContext=surface.getContext;let first2D=true;
      surface.getContext=function(type,attributes){
        if(type==='2d'&&first2D){first2D=false;return getContext.call(this,type,{...(attributes||{}),willReadFrequently:true});}
        return getContext.call(this,type,attributes);
      };
      return surface;
    }
    function createCanvas(){
      if(disposed)throw new Error('Rendering replica is disposed');
      const surface=new env.OffscreenCanvas(1,1),getContext=surface.getContext;let first2D=true;
      // Resource drawable, Native cache, and Motion scratch/page surfaces
      // request CPU-friendly backing. A WebGL canvas is never locked to 2D.
      surface.getContext=function(type,attributes){
        if(type==='2d'&&first2D){first2D=false;return getContext.call(this,type,{...(attributes||{}),willReadFrequently:true});}
        return getContext.call(this,type,attributes);
      };
      return surface;
    }
    // This private cache factory leaves first context acquisition to Native.
    function createDeviceBackgroundCanvas(){
      if(disposed)throw new Error('Rendering replica is disposed');
      return new env.OffscreenCanvas(1,1);
    }
    function createImage(){
      // A real CanvasImageSource is essential: an HTMLImage-like plain wrapper
      // cannot be used by Canvas.drawImage or WebGL.texImage2D.
      const drawable=createCanvas();let generation=0,source='',controller=null;
      drawable.onload=null;drawable.onerror=null;drawable.complete=false;images.add(drawable);persistentAssets.register(drawable,generation);
      Object.defineProperty(drawable,'src',{get(){return source;},set(value){
        source=String(value);const token=++generation;drawable.complete=false;persistentAssets.invalidate(drawable,token);
        if(controller){controller.abort();controllers.delete(controller);}
        controller=typeof env.AbortController==='function'?new env.AbortController():null;
        if(controller)controllers.add(controller);
        const taskController=controller;
        Promise.resolve().then(()=>{
          if(disposed||token!==generation)return null;
          return env.fetch(imageSource(source),{credentials:'same-origin',...(taskController?{signal:taskController.signal}:{})});
        }).then(response=>{
          if(!response)return null;if(!response.ok)throw new Error('Image response '+response.status);
          return response.blob();
        }).then(blob=>blob?env.createImageBitmap(blob):null).then(bitmap=>{
          if(!bitmap)return;
          try{
            if(disposed||token!==generation)return;
            dimensions(bitmap.width,bitmap.height);drawable.width=bitmap.width;drawable.height=bitmap.height;
            const context=drawable.getContext('2d');if(!context)throw new Error('Image canvas unavailable');
            context.imageSmoothingEnabled=false;context.drawImage(bitmap,0,0);
            drawable.complete=true;drawable.naturalWidth=bitmap.width;drawable.naturalHeight=bitmap.height;persistentAssets.ready(drawable,token);
            if(typeof drawable.onload==='function')drawable.onload();
          }finally{closeBitmap(bitmap);}
        }).catch(error=>{
          if(!disposed&&token===generation&&typeof drawable.onerror==='function')drawable.onerror(error);
        }).finally(()=>{if(taskController)controllers.delete(taskController);});
      }});
      return drawable;
    }
    const platform={
      createCanvas,createMeshCanvas:createCanvas,createImage,createDeviceBackgroundCanvas,
      motionLayerPresentation:true,
      beginMotionScene(base){
        if(disposed||base!==canvas)return null;
        if(!foreground)foreground=createOutputCanvas('foreground');
        if(foreground.width!==base.width)foreground.width=base.width;
        if(foreground.height!==base.height)foreground.height=base.height;
        return foreground.getContext('2d');
      },
      presentMotionScene(surface,base,bounds){
        if(disposed||base!==canvas||!surface||!foreground)return false;
        mesh=surface;clip=bounds?{...bounds}:null;motionVisible=true;return true;
      },
      hideMotionScene(){motionVisible=false;mesh=null;clip=null;},
      disposeMotionScene(){motionVisible=false;mesh=null;clip=null;if(foreground){foreground.width=0;foreground.height=0;}foreground=null;},
      getSystemInfoSync(){return {...(config.systemInfo||{windowWidth:1280,windowHeight:960,pixelRatio:1,renderPixelRatio:1})};},
      // These functions provide inert platform compatibility, never another
      // audio owner, input loop, persistence owner or simulation Worker.
      getStorageSync(){return '';},setStorageSync:noop,removeStorageSync:noop,
      getStorageTextSync(){return null;},setStorageTextSync:noop,removeStorageTextSync:noop,
      playSound:noop,stopSound:noop,unlockAudio:noop,setCursor:noop,
      onTouchStart:noop,offTouchStart:noop,onTouchMove:noop,offTouchMove:noop,
      onTouchEnd:noop,offTouchEnd:noop,onTouchCancel:noop,offTouchCancel:noop,
      onHide:noop,offHide:noop,onShow:noop,offShow:noop,onWindowResize:noop,offWindowResize:noop
    };
    return {platform,canvas,persistentAssetBitmapState:persistentAssets.state,
      begin(){motionVisible=false;mesh=null;clip=null;},
      layers(){return {foreground:motionVisible?foreground:null,mesh:motionVisible?mesh:null,clip};},
      dispose(){if(disposed)return;disposed=true;persistentAssets.dispose();for(const controller of controllers)controller.abort();controllers.clear();
        for(const image of images){image.onload=null;image.onerror=null;image.width=0;image.height=0;}images.clear();
        platform.disposeMotionScene();canvas.width=0;canvas.height=0;}
    };
  }
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

  const stages=['nativeMotionFrame','nativeBackground','nativeEntities','nativeHUD','nativeForegroundRest','nativePendingFinish','motionPreparePages','motionBuildStreams','motionCompiler','motionTextureSnapshotsLaunch'];
  function createCaptureStageProbe(env){
    let row=null;
    function now(){try{return env.performance.now();}catch(_){return null;}}
    function mark(name,details){
      if(!row||typeof name!=='string')return;
      const stamp=now();if(!Number.isFinite(stamp))return;
      // Failed/retried render segments are kept explicitly, never summed into a
      // plausible single cohort duration. Formal analysis must reject retries.
      if(Object.prototype.hasOwnProperty.call(row.points,name)){row.repeated.push(name);return;}
      row.points[name]=stamp;
      if(details&&typeof details==='object')row.details[name]={...details};
    }
    return {mark,begin(scope,sequence){
      row={scope,sequence,timeOrigin:env.performance&&env.performance.timeOrigin,points:{},details:{},repeated:[]};
      return row;
    },finish(){
      if(!row)return null;const result=row;row=null;result.durations={};
      for(const stage of stages){const a=result.points[stage+'Start'],b=result.points[stage+'End'];if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)result.durations[stage]=b-a;}
      if(Number.isFinite(result.points.nativeApplyEnter)&&Number.isFinite(result.points.nativeApplyExit))result.durations.nativeApply=result.points.nativeApplyExit-result.points.nativeApplyEnter;
      return result;
    },reset(){row=null;}};
  }

 function createController(env){
  const cohortFlow=createCohortFlow(env,"capture");let directPort=null,directSession=null,compactDescriptors=false,captureProbe=null,outputSnapshotTransfer={base:false,foreground:false};
    let epoch=0,initialized=false,disposed=false,ready=false,busy=false,runtime=null,facade=null,motion=null,oracleAssetStatus=false,persistentAssetBitmaps=false;
    const send=(packet,transfers)=>env.postMessage(packet,transfers||[]);
    function fail(error,request){
      if(disposed)return;
      send({type:'error',protocol:PROTOCOL,epoch,requestId:request&&request.requestId,error:String(error&&error.message||error)});
    }
    function renderDiagnostic(packet){
      const pick=(value,keys)=>{const summary={};if(value)for(const key of keys)if(value[key]!==undefined)summary[key]=value[key];return summary;};
      const safe=fn=>{try{return fn();}catch(error){return {error:String(error&&error.message||error)};}};
      const state=safe(()=>runtime&&typeof runtime.getState==='function'?runtime.getState():null);
      const layers=safe(()=>facade.layers());
      const context=safe(()=>{
        const ctx=facade.canvas.getContext('2d'),m=ctx&&typeof ctx.getTransform==='function'?ctx.getTransform():null;
        return {width:facade.canvas.width,height:facade.canvas.height,context:!!ctx,
          globalCompositeOperation:ctx&&ctx.globalCompositeOperation,globalAlpha:ctx&&ctx.globalAlpha,
          transform:m&&pick(m,['a','b','c','d','e','f'])};
      });
      const game=packet.frame.game||{};
      return {motion:{ready:motion&&motion.ready,sceneStats:safe(()=>pick(motion.sceneStats,
        ['reason','captures','meshes','presented','layers','renderWidth','renderHeight','pixelScale']))},
        runtime:pick(state,['status','overlay','board','grid','view']),
        packet:{game:{isEndless:game.isEndless,status:game.status,plantsLength:game.plants&&game.plants.length,
          enemiesLength:game.enemies&&game.enemies.length},view:packet.frame.view,grid:packet.frame.grid},
        context,layers:{foreground:!!(layers&&layers.foreground),mesh:!!(layers&&layers.mesh),clip:layers&&layers.clip}};
    }
    async function boot(message){
      if(initialized)throw new Error('Rendering replica already initialized');initialized=true;
      if(message.protocol!==PROTOCOL||!Number.isSafeInteger(message.epoch))throw new Error('Unsupported rendering protocol');
      epoch=message.epoch;
      if(message.directTransport){const transport=message.directTransport;
       if(typeof transport.session!=='string'||!transport.session||!transport.port||typeof transport.port.postMessage!=='function'||typeof transport.port.close!=='function')throw new Error('Invalid direct capture transport');
       directSession=transport.session;directPort=transport.port;directPort.onmessageerror=()=>fail(new Error('Direct capture port message error'),{epoch});if(typeof directPort.start==='function')directPort.start();
      }
      const config=message.config||{},base=String(config.scriptBase||'');compactDescriptors=config.compactDescriptors===true;persistentAssetBitmaps=config.persistentAssetBitmaps===true;cohortFlow.setEnabled(config.cohortFlow!==false);
      oracleAssetStatus=config.oracleAssetStatus===true;
      const requestedOutputTransfer=config.outputSnapshotTransfer;
      outputSnapshotTransfer={
        base:requestedOutputTransfer===true||!!(requestedOutputTransfer&&typeof requestedOutputTransfer==='object'&&requestedOutputTransfer.base===true),
        foreground:requestedOutputTransfer===true||!!(requestedOutputTransfer&&typeof requestedOutputTransfer==='object'&&requestedOutputTransfer.foreground===true)
      };
      if(config.bundled!==true){
        if(!base)throw new Error('Rendering script base is required');
        if(typeof env.importScripts!=='function')throw new Error('Rendering script loader is unavailable');
        env.importScripts(...SCRIPTS.map(file=>new env.URL(file,base).href));
      }
      if(disposed)return;
      if(compactDescriptors&&(!env.GardenRetainedScene||env.GardenRetainedScene.compactDescriptorSchema!==1||typeof env.GardenRetainedScene.prepareCompactPacket!=='function'))throw new Error('Compact preparation API unavailable');
      motion=env.GardenMotion;if(!motion||!env.GardenNative||!env.GardenEngine)throw new Error('Rendering modules unavailable');
      facade=createPlatform(env,config);
      if(config.captureStages===true){captureProbe=createCaptureStageProbe(env);facade.platform.captureStage=captureProbe.mark;}
      runtime=env.GardenNative.create({...(config.runtimeOptions||{}),platform:facade.platform,canvas:facade.canvas,
        engine:env.GardenEngine,motion,assetRoot:config.assetRoot,autoStart:false,worker:false,
        visualReplica:true,nativeStaticTerrain:false,nativeStaticWarmup:false});
      if(typeof runtime.applyVisualFrame!=='function')throw new Error('Rendering replica API unavailable');
      await Promise.all([runtime.ready,motion.load(facade.platform,config.assetRoot)]);
      if(disposed)return;
      const assets=runtime.getAssetStatus?runtime.getAssetStatus():null;
      if(assets&&(assets.pending||assets.failed&&assets.failed.length))throw new Error('Rendering replica assets incomplete');
      ready=true;send({type:'ready',protocol:PROTOCOL,epoch,assets:assets&&{total:assets.total,loaded:assets.loaded},setup:{renderOnly:true,offscreen:true}});
    }
    async function render(message){
      if(!ready||busy)throw new Error('Rendering replica not ready');
      if(message.epoch!==epoch){send({type:'dropped',protocol:PROTOCOL,epoch:message.epoch,requestId:message.requestId});return;}
      const packet=message.packet;
      if(!packet||typeof packet.scope!=='string'||!packet.scope||!Number.isSafeInteger(packet.sequence)||
          !Number.isFinite(packet.receivedAt)||!packet.frame||!packet.frame.canvas)throw new Error('Invalid visual frame');
      const prepareCompact=message.prepareCompact===true;
      if(prepareCompact!==compactDescriptors||prepareCompact&&message.prepareSampler!==true)throw new Error('Compact capture mode mismatch');
      const preparation=message.prepareSampler===true?preparedCapabilities(message.presentationCapabilities,prepareCompact):null;
      if(prepareCompact&&(!env.GardenRetainedScene||env.GardenRetainedScene.compactDescriptorSchema!==1||typeof env.GardenRetainedScene.prepareCompactPacket!=='function'))throw new Error('Compact preparation API unavailable');
      if(preparation&&(!env.GardenRetainedScene||env.GardenRetainedScene.preparedSchema!==1||typeof env.GardenRetainedScene.preparePacket!=='function'))
        throw new Error('Sampler preparation API unavailable');
      const size=packet.frame.canvas;dimensions(size.width,size.height);
      const ticket=message.directTicket;
      if(directPort&&(!validTicket(ticket)||ticket.session!==directSession||ticket.captureEpoch!==epoch||ticket.captureRequestId!==message.requestId||
        ticket.scope!==packet.scope||ticket.sequence!==packet.sequence||ticket.receivedAt!==packet.receivedAt||ticket.baseWidth!==size.width||ticket.baseHeight!==size.height||
        ticket.key!==(typeof packet.key==='string'?packet.key:typeof packet.packetKey==='string'?packet.packetKey:packet.scope+':'+(packet.frame.game&&Number.isSafeInteger(packet.frame.game.simulationTick)?packet.frame.game.simulationTick:packet.sequence))))throw new Error('Invalid direct capture ticket');
      if(!directPort&&ticket)throw new Error('Direct ticket without transport');
      const flowRow=cohortFlow.begin(packet.scope,packet.sequence,{requestId:message.requestId});
      const frameEpoch=epoch;busy=true;let baseBitmap=null,foregroundBitmap=null,exported=null;
      try{
        if(facade.canvas.width!==size.width)facade.canvas.width=size.width;
        if(facade.canvas.height!==size.height)facade.canvas.height=size.height;
        facade.begin();
        if(typeof motion.beginScenePacket!=='function'||typeof motion.exportScenePacket!=='function')throw new Error('Scene packet API unavailable');
        motion.beginScenePacket({scope:packet.scope,sequence:packet.sequence,view:packet.coordinateSignature||packet.scope});
        if(captureProbe)captureProbe.begin(packet.scope,packet.sequence);
        try{
          if(cohortFlow.sync(flowRow,'applyVisualFrame',()=>runtime.applyVisualFrame(packet.frame))===false)throw new Error('Rendering replica declined frame');
        }finally{if(captureProbe){const stages=captureProbe.finish();if(flowRow)flowRow.captureStages=stages;}}
        try{cohortFlow.point(flowRow,'motionExportStart');exported=await motion.exportScenePacket();cohortFlow.point(flowRow,'motionExportSettled');}
        catch(error){throw new Error(String(error&&error.message||error)+'; worker render diagnostic: '+JSON.stringify(renderDiagnostic(packet)));}
        if(!exported)throw new Error('Rendering scene export unavailable');
        if(disposed||frameEpoch!==epoch){
          if(!disposed)send({type:'dropped',protocol:PROTOCOL,epoch:frameEpoch,requestId:message.requestId});return;
        }
        if(prepareCompact){
          const sourceScene=exported.packet||exported;
          const compact=cohortFlow.sync(flowRow,'prepareSampler',()=>env.GardenRetainedScene.prepareCompactPacket(sourceScene,{samplerBankSize:preparation.samplerBankSize}));
          if(!compact||!compact.packet||!Array.isArray(compact.transferables))throw new Error('Compact preparation declined');
          const buffers=compactBuffers(compact.packet);
          if(compact.transferables.length!==13||new Set(compact.transferables).size!==13||buffers.some(buffer=>!compact.transferables.includes(buffer)))
            throw new Error('Incomplete compact preparation transfer list');
          // The four authority-derived raw streams and bitmap manifest must be
          // the original exports, not replacements or a second resource owner.
          if(['vertices','alphas','previousPoints','previousAlphas'].some(key=>compact.packet[key]!==sourceScene[key])||
             compact.packet.sources!==sourceScene.sources||compact.packet.scope!==sourceScene.scope||compact.packet.sequence!==sourceScene.sequence||
             compact.packet.width!==sourceScene.width||compact.packet.height!==sourceScene.height||compact.packet.view!==sourceScene.view||compact.packet.version!==sourceScene.version)
            throw new Error('Compact export identity changed');
          exported.packet=compact.packet;
          exported.transferables=[...new Set([...(exported.transferables||[]),...compact.transferables])];
        }else if(preparation){
          const scene=exported.packet||exported;
          const prepared=cohortFlow.sync(flowRow,'prepareSampler',()=>env.GardenRetainedScene.preparePacket(scene,{samplerBankSize:preparation.samplerBankSize}));
          if(!prepared||!prepared.prepared||!Array.isArray(prepared.transferables))throw new Error('Sampler preparation declined');
          scene.prepared=prepared.prepared;
          const streams=[scene.prepared.geometry,scene.prepared.clips];
          const rawBuffers=['vertices','alphas','previousPoints','previousAlphas'].map(name=>scene[name]&&scene[name].buffer);
          if(streams.some(stream=>!(stream instanceof Float32Array))||new Set(streams.map(stream=>stream.buffer)).size!==2||
             streams.some(stream=>rawBuffers.includes(stream.buffer)||!prepared.transferables.includes(stream.buffer))||
             new Set(prepared.transferables).size!==2)throw new Error('Incomplete prepared transfer streams');
          exported.transferables=[...new Set([...(exported.transferables||[]),...prepared.transferables])];
        }
        // Diagnostic opt-in may detach only the fully painted output planes.
        // The default remains the original nondestructive bitmap snapshot.
        // Resource textures, mesh canvases and caches never use this path.
        const layers=facade.layers(),copySources=[facade.canvas];
        if(layers.foreground)copySources.push(layers.foreground);
        const anyOutputTransfer=outputSnapshotTransfer.base||outputSnapshotTransfer.foreground;
        const snapshots=await Promise.allSettled(copySources.map((source,index)=>{
          const plane=index===0?'base':'foreground',name=plane+'Snapshot';
          const snapshot=()=>{
            if(!outputSnapshotTransfer[plane])return env.createImageBitmap(source);
            if(typeof source.transferToImageBitmap!=='function')throw new Error('Output bitmap transfer unavailable: '+plane);
            return source.transferToImageBitmap();
          };
          let pending;
          if(anyOutputTransfer){
            // A synchronous failure must not abandon the sibling bitmap.
            try{pending=cohortFlow.sync(flowRow,name+'Call',snapshot);}
            catch(error){pending=Promise.reject(error);}
          }else pending=cohortFlow.sync(flowRow,name+'Call',()=>env.createImageBitmap(source));
          return Promise.resolve(pending).then(value=>{cohortFlow.point(flowRow,name+'Settled');return value;},error=>{cohortFlow.point(flowRow,name+'Rejected');throw error;});
        }));
        cohortFlow.point(flowRow,'snapshotsSettled');
        for(let index=0;index<snapshots.length;index++)if(snapshots[index].status==='fulfilled'){
          if(index===0)baseBitmap=snapshots[index].value;else foregroundBitmap=snapshots[index].value;
        }
        const failedSnapshot=snapshots.find(result=>result.status==='rejected');
        if(failedSnapshot)throw failedSnapshot.reason;
        if(!baseBitmap||baseBitmap.width!==size.width||baseBitmap.height!==size.height||
           (layers.foreground&&(!foregroundBitmap||foregroundBitmap.width!==layers.foreground.width||foregroundBitmap.height!==layers.foreground.height)))
          throw new Error('Invalid visual Canvas snapshot');
        if(disposed||frameEpoch!==epoch){
          // finally owns all abandoned images, including exported textures.
          if(!disposed)send({type:'dropped',protocol:PROTOCOL,epoch:frameEpoch,requestId:message.requestId});return;
        }
        const result={type:'frame',protocol:PROTOCOL,epoch:frameEpoch,requestId:message.requestId,
          scope:packet.scope,sequence:packet.sequence,receivedAt:packet.receivedAt,width:size.width,height:size.height,
          baseBitmap,foregroundBitmap,scene:exported.packet||exported,clip:layers.clip,cohortFlow:flowRow};
        if(persistentAssetBitmaps)result.persistentAssetBitmaps=facade.persistentAssetBitmapState();
        // Outside-timing pixel oracle only; no default frame payload or runtime work changes.
        if(oracleAssetStatus){
          result.oracleAssetStatus=runtime.getAssetStatus();
          result.oraclePersistentAssetBitmaps=facade.persistentAssetBitmapState();
          if(typeof runtime.getFixedHUDImageCacheState==='function')result.oracleFixedHUDImageCache=runtime.getFixedHUDImageCacheState();
          if(typeof runtime.getSeparateToastLabelCacheState==='function')result.oracleSeparateToastLabelCache=runtime.getSeparateToastLabelCacheState();
          if(typeof runtime.getDeviceBackgroundCacheState==='function')result.oracleDeviceBackgroundCache=runtime.getDeviceBackgroundCacheState();
        }
        const transfers=[baseBitmap];if(foregroundBitmap)transfers.push(foregroundBitmap);
        for(const value of exported.transferables||[])if(!transfers.includes(value))transfers.push(value);
        cohortFlow.point(flowRow,'postMessageStart');
        if(directPort)directPort.postMessage({type:'direct-stage',protocol:PROTOCOL,ticket,frame:result},transfers);else send(result,transfers);
        cohortFlow.point(flowRow,'postMessageEnd');baseBitmap=null;foregroundBitmap=null;exported=null;
        // Successful transfer relinquishes every bitmap before the small ACK can throw.
        if(directPort)send({type:'capture-sent',protocol:PROTOCOL,epoch:frameEpoch,requestId:message.requestId,ticket});
      }finally{
        closeBitmap(baseBitmap);closeBitmap(foregroundBitmap);
        if(exported&&exported.bitmaps)for(const bitmap of exported.bitmaps)closeBitmap(bitmap);
        cohortFlow.finish(flowRow);busy=false;
      }
    }
    function destroy(){
      if(disposed)return;disposed=true;epoch++;ready=false;if(captureProbe)captureProbe.reset();
      // terminate() owns the Worker lifecycle. The replica never calls the
      // normal runtime destroy method that flushes gameplay saves/events.
      if(directPort){try{directPort.close();}catch(_){}directPort=null;}
      if(facade)facade.dispose();facade=null;runtime=null;motion=null;
    }
    function receive(message){
      if(disposed||!message)return;
      if(message.type==='init'){Promise.resolve().then(()=>boot(message)).catch(error=>fail(error,message));return;}
      if(message.type==='reset'){
        if(Number.isSafeInteger(message.epoch)&&message.epoch>epoch){epoch=message.epoch;if(captureProbe)captureProbe.reset();if(motion&&typeof motion.resetScenePackets==='function')motion.resetScenePackets();
          // A boot-ready reply from the previous epoch may still be queued on
          // the main thread. Re-acknowledge an already initialized replica so
          // reset cannot leave the bridge waiting for a discarded old reply.
          if(ready)send({type:'ready',protocol:PROTOCOL,epoch,setup:{renderOnly:true,offscreen:true,reset:true}});
        }
        return;
      }
      if(message.type==='destroy'){destroy();return;}
      if(message.type==='frame')Promise.resolve().then(()=>render(message)).catch(error=>{
        if(disposed)return;
        if(message.epoch!==epoch)send({type:'dropped',protocol:PROTOCOL,epoch:message.epoch,requestId:message.requestId});
        else fail(error,message);
      });
    }
    return {receive,destroy,state:()=>({epoch,initialized,ready,busy,disposed})};
  }
  let attachedController=null;
  function attach(){if(attachedController)return attachedController;attachedController=createController(global);global.onmessage=event=>attachedController.receive(event.data);return attachedController;}
  return Object.freeze({protocol:PROTOCOL,SCRIPTS,createPersistentAssetBitmaps,createPlatform,createController,attach});
});
