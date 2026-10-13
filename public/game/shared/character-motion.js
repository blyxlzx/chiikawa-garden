/* Shared PC reanim retargeting. Source clocks drive grounded character motion.
 * Plant faces move together; source PNGs and expression cels stay unchanged. */
(function(root,factory){
  const data=typeof module==='object'&&module.exports?require('./pvz-motion-data.js'):root.GardenPvZMotionData;
  const retained=typeof module==='object'&&module.exports?require('./retained-scene.js'):root.GardenRetainedScene;
  const api=factory(data,retained);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(data,retained){
  'use strict';
  const files=['motion-allies-v5.png','motion-enemies-v5.png','motion-expansion-allies-v1.png','motion-expansion-enemies-v1.png','motion-friends-v1.png','motion-mushroom-v7.png','motion-expansion-six-v1.png','motion-night-monster-v1.png'];
  const sources=['assets/motion-allies-v5.png','assets/motion-enemies-v5.png','assets/motion-expansion-allies-v1.png','assets/motion-expansion-enemies-v1.png','assets/motion-friends-v1.png','assets/motion-mushroom-v7.png','assets/motion-expansion-six-v1.png','assets/motion-night-monster-v1.png'];
  const aliases=Object.freeze({mascot:'sunflower',snowpea:'pea',repeater:'pea',wallnut:'sunflower',jalapeno:'cherry',runner:'momonga',pinkchimera:'momonga',boss:'anoko',rakko:'pea',shisa:'sunflower',kani:'sunflower',starfruit:'pea',magnet:'pea',stormreed:'pea',helmet:'momonga',drummer:'momonga',healer:'momonga'});
  const sourceFor=kind=>aliases[kind]||kind;
  const isEnemy=kind=>['momonga','anoko','chimera'].includes(sourceFor(kind));
  // x, y, width, height; inspected against each transparent connected component.
  const definitions={
    sunflower:{sheet:0,frames:[[20,21,216,256],[276,52,215,226],[531,25,214,253],[790,21,213,256]],anchors:[128,384,640,896]},
    pea:{sheet:0,frames:[[22,312,233,200],[277,312,227,201],[518,312,229,206],[781,320,236,192]],anchors:[128,384,640,896]},
    // Wide, low mushroom redesign: idle / blink / charge / release. The
    // separate atlas leaves every other original character and cel untouched.
    mushroom:{sheet:5,frames:[[61,141,536,425],[683,145,537,421],[63,735,533,430],[679,761,543,405]],anchors:[310,933.5,309,930.5],drawSize:148,attachments:{muzzle:[[550.5,286.5],[1174,288],[550.5,886],[1173.5,903]]}},
    mine:{sheet:0,frames:[[15,780,226,197],[271,787,225,190],[527,779,224,199],[785,779,223,199]],anchors:[128,384,640,896]},
    cherry:{sheet:0,frames:[[9,1009,242,224],[265,1009,240,224],[520,1028,237,205],[771,1004,247,229]],anchors:[128,384,640,896]},
    mascot:{sheet:0,frames:[[15,1259,210,219],[258,1263,218,215],[511,1263,218,215],[751,1279,252,197]],anchors:[143,391,646,909]},
    momonga:{sheet:1,frames:[[39,60,258,235],[337,87,275,208],[634,93,255,202],[934,58,242,236],[1200,99,309,195],[1537,102,217,192]],anchors:[132,432,731,1027,1327,1632]},
    anoko:{sheet:1,frames:[[31,347,267,236],[347,348,259,235],[638,351,258,232],[919,329,278,254],[1187,351,318,232],[1532,352,220,231]],anchors:[142,451,745,1040,1350,1645],exclude:{3:[1186,431,12,36],4:[1186,492,12,49]}},
    // Keep the legacy save key; this visitor now uses its own anime-reference
    // atlas. The living skin stays stable while the lower tentacles articulate.
    chimera:{sheet:7,frames:[[63,60,417,431],[578,60,415,431],[1104,60,414,431],[63,561,417,421],[518,560,502,421],[1139,566,340,415]],anchors:[269,783,1308.5,271,812,1305.5],drawSize:160,stableLivingCel:true},
    // Expansion sheets retain generated alpha. Bounds include a three-pixel
    // antialias margin around inspected opaque components; no raster is edited.
    snowpea:{sheet:2,frames:[[117,108,522,440]],anchors:[324],drawSize:134},
    repeater:{sheet:2,frames:[[682,108,522,440]],anchors:[890],drawSize:134},
    wallnut:{sheet:2,frames:[[126,719,430,449]],anchors:[340],drawSize:142},
    jalapeno:{sheet:2,frames:[[702,580,394,594]],anchors:[882],drawSize:170},
    runner:{sheet:3,frames:[[45,156,682,517]],anchors:[275],drawSize:144},
    pinkchimera:{sheet:3,frames:[[783,158,543,505]],anchors:[1038],drawSize:152},
    boss:{sheet:3,frames:[[1365,68,787,609]],anchors:[1710],drawSize:212},
    rakko:{sheet:4,frames:[[102,88,600,585]],anchors:[394],drawSize:156},
    shisa:{sheet:4,frames:[[777,90,620,584]],anchors:[1110],drawSize:144},
    kani:{sheet:4,frames:[[1571,61,464,614]],anchors:[1803],drawSize:136},
    // Generated as one transparent 3x2 atlas. Read-only alpha inspection
    // determines source rectangles; the original generated PNG is preserved.
    starfruit:{sheet:6,frames:[[55,61,408,441]],anchors:[260],drawSize:142},
    magnet:{sheet:6,frames:[[529,108,479,393]],anchors:[777],drawSize:140},
    stormreed:{sheet:6,frames:[[1081,36,430,472]],anchors:[1277],drawSize:164},
    helmet:{sheet:6,frames:[[41,548,468,423]],anchors:[219],drawSize:152},
    drummer:{sheet:6,frames:[[571,573,401,390]],anchors:[743],drawSize:148},
    healer:{sheet:6,frames:[[1061,583,444,388]],anchors:[1220],drawSize:150}
  };
  Object.values(definitions).forEach(d=>{
    d.maxW=Math.max(...d.frames.map(f=>f[2]));
    d.maxH=Math.max(...d.frames.map(f=>f[3]));
  });
  let images=[],sheetReady=[],ready=false,canvasFactory=null,gpuFactory=null,gpuRig=null,gpuAttempted=false,gpuSceneRig=null,gpuSceneAttempted=false;
  const cache=new Map(),CACHE_LIMIT=384,CACHE_SIZE=176,CACHE_PIXEL_LIMIT=16*1024*1024;
  // Transparent rig padding must not crowd useful actor pixels out of the
  // cache. The pixel budget still bounds memory at every display density.
  // Keep the much smaller, resolution-independent mesh when its raster is
  // evicted, so a crowded frame does not resample and deform every actor again.
  const meshCache=new Map(),MESH_CACHE_LIMIT=512,MESH_POINT_LIMIT=24*1024;
  // Only rigMesh-created, privately held point arrays may use shared XY arithmetic.
  const generatedSceneMeshes=new WeakSet();
  // Only original privately created frame arrays can certify ordinary numeric
  // coordinates. Replacement arrays/Proxies and getter overrides retain reads.
  const generatedSceneSources=new WeakSet(Object.values(definitions).flatMap(d=>d.frames));
  const sceneImageProto=typeof globalThis.HTMLImageElement==='function'?globalThis.HTMLImageElement.prototype:null;
  const sceneImageWidth=sceneImageProto&&Object.getOwnPropertyDescriptor(sceneImageProto,'width');
  const sceneImageHeight=sceneImageProto&&Object.getOwnPropertyDescriptor(sceneImageProto,'height');
  const nativeImageDimensions=!!(sceneImageWidth&&sceneImageHeight&&typeof sceneImageWidth.get==='function'&&typeof sceneImageHeight.get==='function'&&Function.prototype.toString.call(sceneImageWidth.get).includes('[native code]')&&Function.prototype.toString.call(sceneImageHeight.get).includes('[native code]'));
  function sceneUvDimensions(src,image){
    if(!generatedSceneSources.has(src)||!image||typeof image!=='object')return null;
    const sx=Object.getOwnPropertyDescriptor(src,'0'),sy=Object.getOwnPropertyDescriptor(src,'1');
    if(!sx||!sy||!Object.prototype.hasOwnProperty.call(sx,'value')||!Object.prototype.hasOwnProperty.call(sy,'value')||!Number.isFinite(sx.value)||!Number.isFinite(sy.value))return null;
    const ow=Object.getOwnPropertyDescriptor(image,'width'),oh=Object.getOwnPropertyDescriptor(image,'height'),proto=Object.getPrototypeOf(image);
    // Only a genuine native branded image may bypass per-vertex reads. Own
    // numeric mock properties cannot prove that a plain object is not a Proxy.
    if(!nativeImageDimensions||proto!==sceneImageProto||ow||oh)return null;
    const w=Object.getOwnPropertyDescriptor(sceneImageProto,'width'),h=Object.getOwnPropertyDescriptor(sceneImageProto,'height');
    if(!w||!h||w.get!==sceneImageWidth.get||h.get!==sceneImageHeight.get)return null;
    let width,height;
    try{width=sceneImageWidth.get.call(image);height=sceneImageHeight.get.call(image);}catch(_){return null;}
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
    return {sx:sx.value,sy:sy.value,width,height};
  }
  let meshPoints=0;
  const frameEntries=new Map();
  let frameCanvas=null,frameContext=null,framePages=[],framePage=-1,frameStats={actors:0,meshes:0,copies:0,pixels:0,pages:0};
  const SCENE_PIXEL_LIMIT=32*1024*1024;
  const SCENE_IMAGE_PIXEL_LIMIT=8*1024*1024,SCENE_IMAGE_LIMIT=256;
  let sceneImages=new WeakMap();
  let sceneLayer=null,scenePages=[],pendingScene=null,activeCapture=null;
  const emptySceneStats=()=>({captures:0,meshes:0,layers:0,images:0,sourceUploads:0,sourcePixels:0,pages:0,pixels:0,copies:0,presented:0,pixelScale:1,renderWidth:0,renderHeight:0,reason:''});
  let sceneStats=emptySceneStats();
  const allocationDiagnostics={sceneFrames:0,sceneAllocationChecks:0,getErrorCalls:0,getErrorMs:0,getErrorNonzero:0,getErrorThrows:0,imageCreates:0,imageUpdates:0,pageCreates:0,pageSizeChanges:0,backingResizes:0,sceneLegacyResizes:0,reasons:{sceneNotReady:0,sceneBackingResize:0,sceneImageUpload:0,cpuPageResize:0,cpuPageCreate:0,verticesGrow:0},getErrorByKind:{},backingTransitions:[]};
  const diagnosticClock=()=>typeof performance==='object'&&typeof performance.now==='function'?performance.now():Date.now();
  function diagnosticGetError(gl,rig,kind){
    const d=allocationDiagnostics,key=rig+':'+kind,entry=d.getErrorByKind[key]||(d.getErrorByKind[key]={calls:0,ms:0,nonzero:0,throws:0}),start=diagnosticClock();d.getErrorCalls++;entry.calls++;
    try{const result=gl.getError();if(result!==gl.NO_ERROR){d.getErrorNonzero++;entry.nonzero++;}return result;}
    catch(error){d.getErrorThrows++;entry.throws++;throw error;}
    finally{const ms=Math.max(0,diagnosticClock()-start);d.getErrorMs+=ms;entry.ms+=ms;}
  }
  function diagnosticSnapshot(){const d=allocationDiagnostics;return {...d,reasons:{...d.reasons},getErrorByKind:Object.fromEntries(Object.entries(d.getErrorByKind).map(([key,value])=>[key,{...value}])),backingTransitions:d.backingTransitions.map(entry=>({...entry}))};}
  const CACHE_WIDTH=Math.ceil(CACHE_SIZE*1.85),CACHE_HEIGHT=Math.ceil(CACHE_SIZE*1.6);
  let cachePixels=0;
  function cacheResolution(ctx,size){
    let pixelsPerUnit=1;
    if(typeof ctx.getTransform==='function'){
      try{
        const m=ctx.getTransform(),scale=Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
        if(Number.isFinite(scale))pixelsPerUnit=scale;
      }catch(_){}
    }
    const desired=size*pixelsPerUnit;
    return [176,264,352,528,704].find(resolution=>resolution>=desired)||704;
  }
  function cachedCanvas(key,resolution,paint,bounds){
    key=resolution+':'+key;
    let entry=cache.get(key);
    if(entry){cache.delete(key);cache.set(key,entry);return entry;}
    const density=resolution/CACHE_SIZE,width=bounds?bounds.width:Math.ceil(CACHE_WIDTH*density),height=bounds?bounds.height:Math.ceil(CACHE_HEIGHT*density),pixels=width*height;
    while(cache.size>=CACHE_LIMIT||cachePixels+pixels>CACHE_PIXEL_LIMIT){
      const oldest=cache.keys().next().value;
      const evicted=cache.get(oldest);cache.delete(oldest);cachePixels-=evicted.canvas.width*evicted.canvas.height;
      if(!entry)entry=evicted;
      else{evicted.canvas.width=0;evicted.canvas.height=0;}
    }
    if(!entry){const canvas=canvasFactory();entry={canvas,context:null};}
    // Recycle the GPU surface without resizing while its resolution stays the
    // same. A byte budget also bounds enlarged actors in dense endless battles.
    if(entry.canvas.width!==width)entry.canvas.width=width;
    if(entry.canvas.height!==height)entry.canvas.height=height;
    if(!entry.context)entry.context=entry.canvas.getContext('2d');
    entry.density=density;entry.left=bounds?bounds.left:-width/2;entry.top=bounds?bounds.top:-CACHE_SIZE*1.25*density;
    const c=entry.context;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    c.clearRect(0,0,entry.canvas.width,entry.canvas.height);
    c.save();c.scale(density,density);
    if('imageSmoothingEnabled' in c)c.imageSmoothingEnabled=true;
    if('imageSmoothingQuality' in c)c.imageSmoothingQuality='high';
    try{paint(c,entry.canvas,density);}finally{c.restore();}
    cache.set(key,entry);cachePixels+=pixels;
    return entry;
  }
  function load(platform,assetRoot='assets/',paths={}){
    resetScenePackets();packetPlatform=platform;
    resetSceneResources();
    if(gpuRig)gpuRig.dispose();gpuRig=null;gpuAttempted=false;
    if(gpuSceneRig)gpuSceneRig.dispose();gpuSceneRig=null;gpuSceneAttempted=false;
    if(frameCanvas){frameCanvas.width=0;frameCanvas.height=0;}frameCanvas=null;frameContext=null;frameEntries.clear();framePages=[];framePage=-1;
    frameStats={actors:0,meshes:0,copies:0,pixels:0,pages:0};
    gpuFactory=typeof platform.createMeshCanvas==='function'?()=>platform.createMeshCanvas():null;
    ready=false;cache.clear();cachePixels=0;meshCache.clear();meshPoints=0;canvasFactory=platform.createCanvas?()=>platform.createCanvas():null;
    const sheets=images=[],loaded=sheetReady=[];
    return Promise.all(files.map((name,i)=>new Promise((resolve,reject)=>{
      const image=platform.createImage();sheets[i]=image;
      image.onload=()=>{loaded[i]=true;resolve(image);};
      image.onerror=()=>reject(new Error('动作素材加载失败：'+name));
      image.src=sources[i].startsWith('data:')?sources[i]:(paths[name]||assetRoot+name);
    }))).then(()=>{if(images===sheets)ready=true;return api;});
  }
  function captureStage(name,details){
    const mark=packetPlatform&&packetPlatform.captureStage;
    if(typeof mark!=='function')return;
    try{mark(name,details);}catch(_){}
  }
  function beginFrame(now){
    if(!gpuRig&&!gpuSceneRig)return true;
    if(!Number.isFinite(now))now=typeof performance==='object'&&typeof performance.now==='function'?performance.now():Date.now();
    let sceneHealthy=true;
    if(gpuSceneRig){
      try{sceneHealthy=gpuSceneRig.beginFrame(now);}catch(_){sceneHealthy=false;}
      if(!sceneHealthy){const failed=gpuSceneRig;gpuSceneRig=null;gpuSceneAttempted=true;try{failed.dispose();}catch(_){}resetSceneResources();}
    }
    if(!gpuRig)return sceneHealthy;
    try{if(gpuRig.beginFrame(now))return sceneHealthy;}catch(_){}
    // A WebGL allocation error need not emit contextlost. Do not let a blank
    // GPU result survive as an ordinary raster-cache hit in following frames.
    const failed=gpuRig;gpuRig=null;gpuAttempted=true;
    try{failed.dispose();}catch(_){}
    for(const entry of cache.values()){entry.canvas.width=0;entry.canvas.height=0;}
    cache.clear();cachePixels=0;frameEntries.clear();framePages=[];framePage=-1;
    if(frameCanvas){frameCanvas.width=0;frameCanvas.height=0;}
    frameCanvas=null;frameContext=null;
    // A menu/card accelerator failure does not invalidate the independent
    // scene's completed textures or its explicitly immutable registrations.
    return false;
  }
  function poseFor(o,time=0){
    const kind=sourceFor(o.type);
    const t=Number.isFinite(o.animationAge)?o.animationAge:Number.isFinite(o.age)?o.age:time;
    const pose={time:t,age:o.age??t,id:o.id||0,action:'idle',armed:!!o.armed,enraged:!!o.enraged,slow:o.slowTimer>0,hit:o.hitTimer||0,idleFps:o.idleFps,walkFps:o.sourceWalkFps,walkPhase:o.locomotionPhase,eatTime:o.eatTime,eatPhase:o.eatPhase,idlePhase:o.idlePhase,blinkAge:o.blinkAge,animationState:o.animationState,previousAnimationState:o.previousAnimationState,previousAnimationPhase:o.previousAnimationPhase,armedFps:o.idleFps,riseAge:o.riseAge,armedTime:o.armedTime,gaspAge:o.gaspAge,gaspPhase:o.gaspPhase,cloudAge:o.cloudAge,shootAge:o.shootAge,produceAge:o.produceAge,shootMarkerAge:o.shootMarkerAge,animationStateAge:o.animationStateAge};
    pose.chilled=isEnemy(o.type)&&(o.slowTimer>0||(o.frozenUntil||0)>time);
    if(isEnemy(o.type)){
      // The simulation owns the displayed state, including frozen attacks.
      // Damage is an impact overlay; it must not replace the current action.
      pose.action=o.animationState==='eat'?'attack':o.animationState==='gasp'?'gasp':o.eating?'attack':'walk';
      pose.eatFrames=o.sourceEatFrames;pose.eatFps=o.eatFps;
    }
    else if(kind==='cherry'){
      pose.action='fuse';pose.fuseAge=o.fuseAge??pose.age;pose.fuseDuration=o.fuseDuration??1;
      pose.fuseProgress=Math.max(0,Math.min(1,o.fuseProgress??pose.fuseAge/pose.fuseDuration));pose.phase=pose.fuseProgress;
    }
    else if(o.type==='mine')pose.action=o.armed?'armed':o.riseAge>=0?'rise':'idle';
    else if(['sunflower','shisa','kani'].includes(o.type)&&o.produceAge>=0&&o.produceAge<.65){pose.action='produce';pose.phase=o.produceAge;}
    else if(kind==='pea'||kind==='mushroom'){
      const duration=(kind==='pea'?25:30)/35;
      if(o.shootAge>=0&&o.shootAge<duration){pose.action='shoot';pose.phase=o.shootAge;}
    }
    if(o.animationState==='gasp')pose.action='gasp';
    pose.baseAction=pose.action==='hurt'?(o.eating?'attack':'walk'):pose.action;
    if(pose.hit>0&&pose.action!=='shoot'&&!isEnemy(o.type))pose.action='hurt';
    return pose;
  }
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mod=x=>((x%1)+1)%1;
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  function explosivePose(kind,pose={}){
    if(!['cherry','jalapeno'].includes(kind)||pose.card||(pose.action!=='fuse'&&!Number.isFinite(pose.fuseProgress)))return {scale:1,shakeX:0,shakeY:0};
    const progress=clamp(pose.fuseProgress??((pose.fuseAge??pose.age??pose.phase??pose.time??0)/(pose.fuseDuration||1)),0,1);
    // Enlarge the whole drawing about its planted feet, never stretch the face.
    // Keep the source's tiny rapid tremble separate from its body inflation.
    const age=pose.fuseAge??pose.age??pose.time??progress,weight=smooth(progress/.18),seed=(pose.id||0)*2.17;
    return {scale:1+(kind==='cherry'?.42:.24)*smooth(progress),shakeX:Math.sin(age*91+seed)*weight,shakeY:Math.sin(age*117+seed+.7)*weight*.8};
  }
  const angle=(x,y)=>((x-y+540)%360)-180;
  const meanCache=new WeakMap();
  function mean(track){if(!meanCache.has(track))meanCache.set(track,track[0].map((_,i)=>track.reduce((s,v)=>s+v[i],0)/track.length));return meanCache.get(track);}
  function sampleTrack(track,phase){
    const p=clamp(phase,0,1)*(track.length-1),i=Math.floor(p),f=p-i,a=track[i],b=track[Math.min(i+1,track.length-1)];
    return a.map((v,k)=>v+(b[k]-v)*f);
  }
  // Shape-preserving cubic interpolation: retain the source keys and clock,
  // but join their velocities. Tangents vanish at extrema, not at every key.
  // Duplicate loop endpoints use the same neighbours on both sides.
  function samplePlantTrack(track,phase,loop=false){
    if(track.length<3)return sampleTrack(track,phase);
    const last=track.length-1,p=clamp(phase,0,1)*last,i=Math.min(last-1,Math.floor(p)),f=p-i;
    const a=track[i],b=track[i+1],prev=track[i>0?i-1:loop?last-1:0],next=track[i+2<=last?i+2:loop?1:last];
    const tangent=(a,b)=>a*b<=0?0:2*a*b/(a+b);
    return a.map((value,k)=>{
      const delta=b[k]-value,m0=tangent(value-prev[k],delta),m1=tangent(delta,next[k]-b[k]);
      return (2*f*f*f-3*f*f+1)*value+(f*f*f-2*f*f+f)*m0+(-2*f*f*f+3*f*f)*b[k]+(f*f*f-f*f)*m1;
    });
  }
  function gestureCurve(keys,time){
    if(time<=keys[0][0])return keys[0][1];
    for(let i=1;i<keys.length;i++)if(time<=keys[i][0]){
      const [a,b]=[keys[i-1],keys[i]],t=smooth((time-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t;
    }
    return keys[keys.length-1][1];
  }
  function plantGesture(kind,pose,s){
    // The original fume recoil includes a very fast neck recovery. Retarget
    // less of that turn to a wide anime head; the gesture supplies its weight.
    const fume=s.sourceKind==='mushroom',shooting=s.name==='shoot';
    const g={x:0,y:0,angle:0,angleY:0,sx:1,sy:1,neckGain:fume?(shooting?.30:.65):.38,bobGain:fume&&!shooting?.48:.30,bobLimit:fume?(shooting?.017:.028):.03};
    if(s.name==='shoot'){
      const age=pose.shootAge??pose.phase??s.phase*s.duration,marker=pose.shootMarkerAge??(s.sourceKind==='mushroom'?.49:.34);
      // Load weight, push forward, recoil, then a single soft recovery.
      const kick=gestureCurve([[0,0],[marker*.65,-.25],[marker,.30],[marker+(kind==='rakko'?.125:.10),-1],[Math.min(s.duration-.08,marker+.28),.12],[s.duration,0]],age);
      g.angle=kick*(kind==='rakko'?.095:s.sourceKind==='mushroom'?.036:.060);
      g.x=kick*(kind==='rakko'?.018:.012);
      g.y=-Math.max(0,-kick)*.004;
    }else if(pose.action==='produce'){
      const age=pose.produceAge??pose.phase??0;
      const lift=gestureCurve([[0,0],[.13,-.25],[.28,1],[.48,-.12],[.65,0]],age);
      g.angle=lift*(kind==='kani'?-.055:.04);g.y=-lift*.018;g.x=lift*.007;
    }
    return g;
  }
  // These landmarks belong to the actual round character drawings. Humanoid
  // head/arm tracks cannot be added together across one large anime face.
  const enemyRigs=Object.freeze({
    momonga:{hip:.37,split:.37,tail:.64,tailY:.79,root:.78,stride:.145,lift:.055,weight:1,hand:[.22,.77,.70,.87]},
    anoko:{hip:.41,split:.43,tail:.77,tailY:.83,root:.81,stride:.14,lift:.048,weight:.72,hand:[.20,.72,.62,.74]},
    chimera:{hip:.49,split:.50,tail:.90,tailY:.79,root:.77,stride:.12,lift:.043,weight:.65,hand:[.30,.79,.73,.86]},
    runner:{hip:.34,split:.33,tail:.60,tailY:.78,root:.78,stride:.17,lift:.068,weight:1.2,hand:[.22,.68,.59,.76],leftSole:.89},
    pinkchimera:{hip:.43,split:.42,tail:.78,tailY:.83,root:.81,stride:.14,lift:.060,weight:1,hand:[.24,.70,.58,.78]},
    boss:{hip:.40,split:.46,tail:.80,tailY:.83,root:.80,stride:.13,lift:.041,weight:.62,hand:[.28,.59,.25,.64]},
    helmet:{hip:.37,split:.37,tail:.65,tailY:.81,root:.80,stride:.13,lift:.045,weight:.78,hand:[.22,.72,.64,.79]},
    drummer:{hip:.42,split:.44,tail:.80,tailY:.83,root:.88,stride:.13,lift:.050,weight:.8,hand:[.28,.67,.53,.79]},
    healer:{hip:.38,split:.40,tail:.68,tailY:.81,root:.83,stride:.14,lift:.052,weight:.9,hand:[.22,.74,.62,.80]}
  });
  // Put vertices at each sole and between the feet, and put an unarticulated
  // row below the eyes/mouth. Uniform cells mixed a swinging leg into the
  // standing foot and pulled the face with a nearby paw. The 72-triangle rig
  // remains small, is cached, and is shared by Canvas and the GPU batch.
  const enemyMeshColumns={
    momonga:[0,.13,.25,.37,.53,.64,1],anoko:[0,.14,.29,.43,.61,.77,1],
    chimera:[0,.16,.30,.50,.69,.90,1],runner:[0,.10,.20,.33,.44,.60,1],
    pinkchimera:[0,.14,.25,.42,.60,.78,1],boss:[0,.18,.29,.46,.66,.80,1],
    helmet:[0,.12,.24,.37,.53,.65,1],drummer:[0,.14,.25,.44,.62,.80,1],
    healer:[0,.12,.24,.40,.55,.68,1]
  };
  const uniform=n=>Object.freeze(Array.from({length:n+1},(_,i)=>i/n));
  const standardMesh=Object.freeze({u:uniform(4),v:uniform(6)}),portraitMesh=Object.freeze({u:uniform(12),v:uniform(12)});
  const enemyMeshRows={
    momonga:[0,.25,.70,.78,.86,.94,1],anoko:[0,.25,.62,.76,.85,.94,1],
    chimera:[0,.25,.49,.73,.83,.94,1],runner:[0,.25,.58,.72,.80,.89,1],
    pinkchimera:[0,.25,.58,.75,.84,.94,1],boss:[0,.25,.58,.74,.84,.94,1],
    helmet:[0,.25,.64,.76,.84,.94,1],drummer:[0,.25,.53,.74,.88,.95,1],
    healer:[0,.25,.62,.76,.85,.94,1]
  };
  const enemyMeshes=Object.fromEntries(Object.entries(enemyMeshColumns).map(([kind,u])=>[kind,Object.freeze({u:Object.freeze(u),v:Object.freeze(enemyMeshRows[kind])})]));
  function meshLayout(kind,bones={}){return bones.portrait?portraitMesh:bones.enemy?enemyMeshes[kind]||enemyMeshes.momonga:standardMesh;}
  function footstep(phase,stride,lift){
    const p=mod(phase),stance=.58;
    if(p<stance)return {x:stride*(p/stance-.5),y:0};
    // Grounded support travels back under the body. Swing clears the ground,
    // returns forward, and meets the support velocity at both endpoints (C1).
    const t=(p-stance)/(1-stance),t2=t*t,t3=t2*t;
    const tangent=stride*(1-stance)/stance;
    return {x:(2*t3-3*t2+1)*stride*.5+(t3-2*t2+t)*tangent+(-2*t3+3*t2)*-stride*.5+(t3-t2)*tangent,
      y:-lift*Math.pow(Math.sin(Math.PI*t),2)};
  }
  function enemyGesture(kind,s){
    const r=enemyRigs[kind]||enemyRigs.momonga,p=s.phase,tau=Math.PI*2;
    const g={turn:0,x:0,y:0,leftX:0,leftY:0,rightX:0,rightY:0,arm:0,tail:0,ear:0};
    if(s.name==='walk'||s.name==='rageWalk'){
      // Two complete left/right strides per source loop. Slow/rage use the
      // engine's integrated phase, so neither speed changes nor hits reset it.
      const phase=mod(p*2),a=phase*tau,l=footstep(phase,r.stride,r.lift),rr=footstep(phase+.5,r.stride,r.lift);
      g.leftX=l.x;g.leftY=l.y;g.rightX=rr.x;g.rightY=rr.y;
      g.turn=Math.sin(a)*.043*r.weight;g.y=-(1-Math.cos(a*2))*.007*r.weight;
      g.x=Math.sin(a)*.008;g.arm=-Math.sin(a)*.095*r.weight;
      g.tail=Math.sin(a-.65)*.11*r.weight;g.ear=Math.sin(a-.4)*.022;
    }else if(s.name==='attack'||s.name==='rageAttack'){
      const single=kind==='chimera'||kind==='drummer';
      const keys=single?[[0,0],[.19,-.32],[.42,1],[.67,-.08],[.86,0],[1,0]]:
        [[0,0],[.045,-.24],[.14,1],[.32,-.08],[.46,0],[.55,-.24],[.68,1],[.88,0],[1,0]];
      const push=gestureCurve(keys,p),follow=gestureCurve(keys,mod(p-.065));
      const heavy=kind==='boss'||kind==='anoko';
      g.turn=-push*(heavy?.075:.095);g.x=-push*(heavy?.020:.027);g.y=Math.min(0,push)*.015;
      g.arm=-push*(kind==='drummer'?.30:heavy?.27:.19);
      g.tail=follow*.09;g.ear=-follow*.028;
    }else if(s.name==='gasp'){
      const load=gestureCurve([[0,0],[.28,1],[.62,.72],[1,0]],p);
      g.turn=load*.10;g.x=load*.018;g.y=-load*.017;g.arm=load*.16;g.tail=-load*.10;
    }else{
      g.turn=Math.sin(p*tau)*.012;g.y=-(1-Math.cos(p*tau))*.003;
    }
    // The night visitor reaches with its front tentacle beneath the bowl.
    if(kind==='chimera')g.arm*=.7;
    return g;
  }
  function animation(kind,pose={}){
    const sourceKind=sourceFor(kind),a=data?.actors[sourceKind];if(!a)return null;
    const clips=a.animations,t=pose.time||0,enemy=isEnemy(kind);
    // Record-card mascots are standing, not walking toward a plant. Give
    // these single-cel drawings their own clock instead of zombie limb tracks.
    if(pose.presentation==='portrait'&&['boss','runner'].includes(kind)){
      const duration=kind==='boss'?5.6:4.8;
      return {sourceKind,name:'portrait',phase:mod(t/duration),duration,once:false};
    }
    // Boss keeps Anoko's normal walk/eat/death tracks and borrows the verified
    // 13-frame newspaper gasp for its explicit half-health transition.
    const gaspClip=clips.gasp||(kind==='boss'?data?.actors.chimera?.animations.gasp:null);
    let name='idle',fps=pose.idleFps||(sourceKind==='pea'?17.5:12.5),clock=t,once=false;
    const action=pose.action==='hurt'?(pose.baseAction||(enemy?'walk':'idle')):pose.action;
    if(enemy){
      if(action==='gasp'&&gaspClip){name='gasp';fps=8*(pose.slow?.5:1);clock=pose.animationStateAge??t;once=true;}
      else if(action==='attack'){name=pose.enraged&&clips.rageAttack?'rageAttack':'attack';fps=pose.eatFps||36*(pose.slow?.5:1);clock=pose.eatTime??t;}
      else if(action==='walk'||action==='death'){name=action==='death'?'death':pose.enraged&&clips.rageWalk?'rageWalk':'walk';fps=pose.walkFps||((pose.enraged?.9:.30)*47*47/(sourceKind==='chimera'?57.8:49.8));clock=t;once=action==='death';if(once)fps=pose.deathFps||27;}
    }else if(action==='shoot'&&(sourceKind==='pea'||sourceKind==='mushroom')){name='shoot';fps=35;clock=pose.shootAge??pose.phase??t;once=true;}
    else if(kind==='mine'){
      fps=12;if(pose.armed||action==='armed'){name='armed';fps=pose.armedFps||13.5;clock=pose.armedTime??Math.max(0,(pose.age??t)-6);}
      else if(action==='rise'){name='rise';fps=18;clock=pose.riseAge??pose.phase??0;once=true;}
    }else if(sourceKind==='cherry'&&action==='fuse'){name='explode';clock=pose.age??pose.phase??t;once=true;}
    else if(kind==='mushroom')fps=pose.idleFps||12;
    const clip=name==='gasp'&&gaspClip?gaspClip:kind==='drummer'&&action==='attack'?data.actors.chimera.animations.attack:clips[name]||clips.idle;
    let phase=once?clamp(clock*fps/clip.count,0,1):mod(clock*fps/clip.count);
    if(enemy&&(name.includes('Walk')||name==='walk'))if(Number.isFinite(pose.walkPhase))phase=mod(pose.walkPhase);
    // A chilled enemy's eatTime is already speed-integrated by the engine.
    if(enemy&&action==='attack'&&Number.isFinite(pose.eatPhase))phase=mod(pose.eatPhase);
    if(name==='gasp'&&Number.isFinite(pose.gaspPhase))phase=clamp(pose.gaspPhase,0,1);
    if(name==='idle'&&Number.isFinite(pose.idlePhase))phase=mod(pose.idlePhase);
    if(Number.isFinite(pose.overridePhase))phase=clamp(pose.overridePhase,0,1);
    return {sourceKind,name,fps,phase,clip,duration:clip.count/fps,once,bodyPhase:Number.isFinite(pose.idlePhase)?mod(pose.idlePhase):mod(t*(pose.idleFps||(sourceKind==='mushroom'?12:17.5))/(sourceKind==='mushroom'?17:25))};
  }
  function channels(kind,pose={},blend=true){
    const s=animation(kind,pose);if(!s)return {sample:null,bones:{}};
    if(s.name==='portrait'){
      const phase=s.phase*Math.PI*2,runner=kind==='runner';
      return {sample:s,bones:{portrait:{
        turn:Math.sin(phase)*(runner?.047:.041),
        lift:(1-Math.cos(phase*2))*(runner?.009:.006),
        tail:(Math.sin(phase-.28)*(runner?.095:.075)+Math.sin(phase*2-.45)*.014)*(runner?.8:1)
      }}};
    }
    const bones={};
    for(const [role,track]of Object.entries(s.clip.tracks)){
      let useTrack=track,phase=s.phase;
      if(s.sourceKind==='pea'&&s.name==='shoot'&&['body','neck','leaf'].includes(role)){
        useTrack=data.actors.pea.animations.stemIdle.tracks[role];phase=s.bodyPhase;
      }
      const bodyContinuous=s.sourceKind==='pea'&&['body','neck','leaf'].includes(role);
      const v=isEnemy(kind)?sampleTrack(useTrack,phase):samplePlantTrack(useTrack,phase,!s.once||bodyContinuous),base=s.once&&!bodyContinuous?useTrack[0]:mean(useTrack);
      bones[role]={x:clamp((v[0]-base[0])/80,-.27,.27),y:clamp((v[1]-base[1])/90,-.23,.23),angle:clamp(angle(v[2],base[2])*Math.PI/180,-.5,.5),angleY:clamp(angle(v[3],base[3])*Math.PI/180,-.5,.5),sx:clamp(v[4]/(base[4]||1),.7,1.4),sy:clamp(v[5]/(base[5]||1),.7,1.4)};
    }
    if(isEnemy(kind))bones.enemy=enemyGesture(kind,s);
    else{
      bones.gesture=plantGesture(kind,pose,s);
      const stem=s.sourceKind==='pea'&&s.name==='shoot',bodyClip=data.actors.pea.animations.stemIdle;
      const track=(stem?bodyClip:s.clip).tracks.neck;
      if(track){
        const loop=!s.once||stem,phase=stem?s.bodyPhase:s.phase,lag=.085/(stem?bodyClip.count/(pose.idleFps||(s.sourceKind==='mushroom'?12:17.5)):s.duration);
        const v=samplePlantTrack(track,loop?mod(phase-lag):Math.max(0,phase-lag),loop),base=loop?mean(track):track[0];
        bones.follow={x:0,y:0,angle:angle(v[2],base[2])*Math.PI/180,angleY:0,sx:1,sy:1};
      }
    }
    // Transition clocks come from the 100 Hz simulation, so pausing also freezes blends.
    // Original transitions capture the outgoing pose, then blend over 10 or 20 ticks.
    const previous=pose.previousAnimationState==='eat'?'attack':pose.previousAnimationState;
    const duration=pose.animationState==='gasp'?.1:.2;
    if(blend&&previous&&previous!==pose.animationState&&Number.isFinite(pose.animationStateAge)&&pose.animationStateAge<duration){
      const old=channels(kind,{...pose,action:previous,baseAction:previous,overridePhase:pose.previousAnimationPhase??0,previousAnimationState:null},false).bones;
      const progress=clamp(pose.animationStateAge/duration,0,1);
      const f=smooth(progress);
      for(const role of Object.keys(bones)){
        // A basic pea only switches its head animation; its stem never transitions.
        if(s.sourceKind==='pea'&&['body','neck','leaf'].includes(role))continue;
        if(old[role])for(const key of Object.keys(bones[role]))bones[role][key]=old[role][key]+(bones[role][key]-old[role][key])*f;
      }
    }
    return {sample:s,bones};
  }
  function sampleFrame(kind,pose={}){
    const d=definitions[kind];if(!d)return 0;
    if(Number.isInteger(pose.frame))return Math.max(0,Math.min(d.frames.length-1,pose.frame));
    // New actors use their own cel plus continuous source-track deformation.
    if(d.frames.length===1)return 0;
    const t=(pose.time||0)+(pose.id||0)*.137;
    const blink=Number.isFinite(pose.blinkAge)?pose.blinkAge>=0&&pose.blinkAge<.2:(t%6.1)>5.90;
    const cycle=animation(kind,pose),phase=cycle?.phase||0;
    if(d.sheet===1||d.stableLivingCel){
      if(pose.action==='death')return 5;
      // The source cels are unrelated silhouettes, not in-between drawings.
      // Keep one skin for living actions and articulate its limbs continuously.
      return 0;
    }
    if(pose.action==='hurt')return 1;
    if(kind==='cherry')return pose.action==='fuse'?Math.min(3,Math.floor(phase*4)):0;
    if(kind==='mine'&&(pose.armed||pose.action==='armed'||pose.action==='rise'))return phase>.35&&phase<.50?3:2;
    if(pose.action==='shoot'){
      const age=pose.shootAge??pose.phase??0,marker=pose.shootMarkerAge??(kind==='pea'?.34:.49);
      return age<marker?2:age<marker+.16?3:0;
    }
    if(pose.action==='produce')return [2,3,3,2][Math.min(3,Math.floor((pose.phase||0)*6))];
    if(pose.action==='attack')return Math.floor(t*5)%2?3:2;
    return blink?1:0;
  }
  function frameGeometry(kind,pose={},size=1){
    const d=definitions[kind];if(!d)return null;
    const frame=sampleFrame(kind,pose),src=d.frames[frame];
    // Preserve each hand-drawn pose's proportions and actual foot landmark.
    // Blending different crop sizes would stretch the newly selected face.
    const scale=Math.min(size*.94/d.maxW,size*.97/d.maxH);
    const width=src[2]*scale,height=src[3]*scale,anchor=(d.anchors[frame]-src[0])*scale;
    return {frame,width,height,anchor,aspect:width/height};
  }
  function deathPose(kind,pose={},size=1){
    if(!isEnemy(kind)||!definitions[kind])return null;
    const sample=animation(kind,{...pose,action:'death'}),track=sample?.clip?.tracks.body;
    if(!track)return null;
    const geometry=frameGeometry(kind,{...pose,action:'death'},size);
    const current=samplePlantTrack(track,sample.phase),first=track[0],last=track[track.length-1];
    const turnOf=value=>(angle(value[2],first[2])+angle(value[3],first[3]))/2;
    // Keep the PC clip's recoil, loss of balance and landing cadence. Its
    // humanoid head track stays upright during death, so it must NOT drive
    // an anime face separately from the falling body. Rotate the entire cel.
    const turn=clamp(turnOf(current)/Math.abs(turnOf(last)||1)*1.48,-1.62,.24);
    const c=Math.cos(turn),s=Math.sin(turn),{width,height,anchor}=geometry;
    // Roll a rounded silhouette onto the grass. The support point changes
    // with the angle instead of leaving the original feet pinned in midair.
    const cx=width/2-anchor,cy=-height/2;
    const bottom=s*cx+c*cy+Math.hypot(s*width/2,c*height/2);
    return {phase:sample.phase,duration:sample.duration,turn,
      x:clamp((current[0]-first[0])/80,-1.3,.2)*size*.14,y:-bottom,
      impactPhase:sample.sourceKind==='chimera'?.63:.77,geometry};
  }
  function drawDeath(ctx,kind,x,y,size,pose){
    const fall=deathPose(kind,pose,size);if(!fall)return false;
    const d=definitions[kind],g=fall.geometry,src=d.frames[g.frame],c=Math.cos(fall.turn),s=Math.sin(fall.turn);
    ctx.save();if(pose.alpha!==undefined)ctx.globalAlpha*=clamp(pose.alpha,0,1);
    const centerX=x+fall.x+c*(g.width/2-g.anchor)+s*g.height/2;
    ctx.save();ctx.translate(centerX,y-3);ctx.scale(Math.hypot(c*g.width,s*g.height)*.36,size*.038);
    ctx.fillStyle='rgba(35,70,30,.16)';ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.translate(x+fall.x,y+fall.y);ctx.transform(c,s,-s,c,0,0);
    // One atlas blit per corpse: no mesh, per-frame raster cache or skew.
    ctx.drawImage(images[d.sheet],...src,-g.anchor,-g.height,g.width,g.height);
    ctx.restore();return true;
  }
  const plantSway=Object.freeze({sunflower:1.15,pea:1.1,snowpea:1.05,repeater:1.05,mushroom:.9,mine:.4,cherry:.75,jalapeno:.7,wallnut:.4,rakko:.85,shisa:.85,kani:.95,mascot:.85});
  function portraitPoint(kind,u,v,motion,aspect){
    const d=definitions[kind],frame=d.frames[0],anchor=(d.anchors[0]-frame[0])/frame[2];
    // Rotate in pixel proportions: the head, cheeks and body stay one rigid
    // drawing. Only the soles ease back to the fixed ground line.
    const px=(u-anchor)*aspect,py=v-1,c=Math.cos(motion.turn),s=Math.sin(motion.turn);
    let dx=(px*c-py*s-px)/aspect,dy=px*s+py*c-py-motion.lift;
    const runner=kind==='runner',root=runner?.88:.85,pin=1-smooth((v-root)/(1-root));
    dx*=pin;dy*=pin;
    // The tail follows the weight shift, with its root held to the body.
    // These masks are outside each drawing's face, not generic zombie bones.
    const weight=runner?smooth((u-.62)/.20):smooth((u-.76)/.16)*smooth((v-.58)/.17);
    const tx=(u-(runner?.57:.73))*aspect,ty=v-(runner?.89:.83),tc=Math.cos(motion.tail),ts=Math.sin(motion.tail);
    dx+=weight*(tx*tc-ty*ts-tx)/aspect*pin;
    dy+=weight*(tx*ts+ty*tc-ty)*pin;
    return [u+dx,v+dy];
  }
  function plantPoint(kind,u,v,bones,aspect){
    const head=bones.head||{},body=bones.body||head,neck=bones.neck||head,gain=plantSway[kind]??1,gesture=bones.gesture||{};
    // Restore broad arcs by moving the drawing as a rigid mass, in pixel
    // space. Do not add independently stretching head/neck/face transforms.
    const turnInput=((neck.angle||0)*(gesture.neckGain??(kind==='mushroom'?.65:.38))+(body.angle||0)*.075)*gain+(gesture.angle||0);
    const turn=.16*Math.tanh(turnInput/.16);
    const growth=sourceFor(kind)==='cherry'
      ?clamp((((head.sx??1)+(body.sx??1))/2-1)*.13,-.015,.045)
      :clamp(((head.sy??1)-1)*.035*gain,-.005,.007);
    const scale=1+growth,px=(u-.5)*aspect,py=v-.90;
    const travel=.04*Math.tanh(((head.x||0)*.18*gain+(gesture.x||0))/.04);
    const bobLimit=gesture.bobLimit??.03;
    const bob=bobLimit*Math.tanh(((head.y||0)*(gesture.bobGain??.30)*gain+(gesture.y||0))/bobLimit);
    let dx=(px*scale*Math.cos(turn)-py*scale*Math.sin(turn)-px)/aspect+travel;
    let dy=px*scale*Math.sin(turn)+py*scale*Math.cos(turn)-py+bob;
    // Secondary motion follows the weight shift by 85 ms. Only extremities
    // move relative to the face; their root eases back into the main drawing.
    const follow=clamp(((bones.follow?.angle??neck.angle??0)-(neck.angle||0))*.55,-.055,.055);
    if(['sunflower','shisa','kani','mascot'].includes(kind)){
      const weight=1-smooth((v-.12)/.16),ex=(u-.5)*aspect,ey=v-.31;
      dx+=weight*(ex*Math.cos(follow)-ey*Math.sin(follow)-ex)/aspect;
      dy+=weight*(ex*Math.sin(follow)+ey*Math.cos(follow)-ey);
    }
    if(kind==='rakko'&&bones.mouth){
      const weight=smooth((u-.65)/.23)*(1-smooth((v-.60)/.18));
      const a=clamp(((bones.mouth.x||0)-(head.x||0))*.7+(gesture.angle||0)*1.6,-.16,.16),sx=(u-.75)*aspect,sy=v-.70;
      dx+=weight*(sx*Math.cos(a)-sy*Math.sin(a)-sx)/aspect;
      dy+=weight*(sx*Math.sin(a)+sy*Math.cos(a)-sy);
    }else if(kind==='mushroom'&&bones.mouth){
      const weight=smooth((u-.78)/.2)*(1-smooth((v-.35)/.18));
      dx+=weight*clamp(((bones.mouth.x||0)-(head.x||0))*.10,-.014,.014);
    }else if(kind==='mine'&&bones.light){
      dx+=(1-smooth((v-.20)/.15))*clamp((bones.light.x||0)*.15,-.012,.012);
    }
    // Ease into a planted base across the lower fifth, instead of pulling
    // all the movement into the last thin row of the mesh.
    const rootStart=kind==='mushroom'?.88:.78,pin=1-smooth((v-rootStart)/(1-rootStart));
    return [u+dx*pin,v+dy*pin];
  }
  function enemyTransforms(kind,bones){
    if(bones.enemy){
      const g=bones.enemy;
      return {bodyC:Math.cos(g.turn),bodyS:Math.sin(g.turn),tailC:Math.cos(g.tail),tailS:Math.sin(g.tail),armC:Math.cos(g.arm),armS:Math.sin(g.arm),earC:Math.cos(g.ear),earS:Math.sin(g.ear)};
    }
    const model=sourceFor(kind);
    return [['body',.43,.77,.65],['head',.40,.58,.64],['arm',.40,.65,.8],['leg',.31,.87,.9],['otherLeg',.54,.87,.9],['arm',.62,.70,model==='chimera'?1.45:.9],['otherLeg',.62,.75,1]].map(([role,cx,cy,gain])=>{
      const b=bones[role];if(!b)return null;
      const a=b.angle*gain,ay=(b.angleY??b.angle)*gain,sx=1+(b.sx-1)*gain,sy=1+(b.sy-1)*gain;
      return {cx,cy,x:b.x*gain,y:b.y*gain,xx:sx*Math.cos(a),xy:sy*Math.sin(ay),yx:sx*Math.sin(a),yy:sy*Math.cos(ay)};
    });
  }
  function warpPoint(kind,u,v,bones,aspect,transforms){
    if(bones.portrait){
      const d=definitions[kind];
      return portraitPoint(kind,u,v,bones.portrait,aspect||d.maxW/d.maxH);
    }
    if(!isEnemy(kind)){
      const d=definitions[kind];
      return plantPoint(kind,u,v,bones,aspect||(d?d.maxW/d.maxH:1));
    }
    if(bones.enemy){
      const r=enemyRigs[kind]||enemyRigs.momonga,g=bones.enemy,d=definitions[kind];
      aspect=aspect||d.frames[0][2]/d.frames[0][3];
      const t=transforms||enemyTransforms(kind,bones),px=(u-r.hip)*aspect,py=v-r.root;
      // One rigid upper-body transform keeps the eyes, cheeks and silhouette
      // in proportion. Only actual extremities move relative to that mass.
      let dx=(px*t.bodyC-py*t.bodyS-px+g.x)/aspect,dy=px*t.bodyS+py*t.bodyC-py+g.y;
      const tail=smooth((u-r.tail)/.16),tx=(u-r.tail)*aspect,ty=v-r.tailY;
      dx+=tail*(tx*t.tailC-ty*t.tailS-tx)/aspect;dy+=tail*(tx*t.tailS+ty*t.tailC-ty);
      const ear=(1-smooth((v-.08)/.17))*(1-tail),ex=(u-r.hip)*aspect,ey=v-.27;
      dx+=ear*(ex*t.earC-ey*t.earS-ex)/aspect;dy+=ear*(ex*t.earS+ey*t.earC-ey);
      if(r.hand){
        const [hx,hy,top,bottom]=r.hand;
        const arm=(1-smooth((u-(hx-.18))/.18))*smooth((v-top)/.10)*(1-smooth((v-bottom)/.10));
        const ax=(u-hx)*aspect,ay=v-hy;
        dx+=arm*(ax*t.armC-ay*t.armS-ax)/aspect;dy+=arm*(ax*t.armS+ay*t.armC-ay);
      }
      // Hip/ankle skinning converges on the two independent foot trajectories.
      // During stance a sole remains on y=1; during swing it clears the lawn.
      const right=smooth((u-(r.split-.045))/.09);
      const sole=(r.leftSole||1)+(1-(r.leftSole||1))*right;
      const legs=smooth((v-r.root)/(sole-r.root))*(1-smooth((u-(r.tail-.06))/.10));
      dx=dx*(1-legs)+(g.leftX+(g.rightX-g.leftX)*right)/aspect*legs;
      dy=dy*(1-legs)+(1-sole+g.leftY+(g.rightY-g.leftY)*right)*legs;
      return [u+dx,v+dy];
    }
    let dx=0,dy=0;
    const upper=1-smooth((v-.68)/.30),lower=smooth((v-.70)/.27),tail=smooth((u-.61)/.27)*(1-smooth((v-.86)/.13));
    const weights=[(1-tail)*.35,upper*(1-tail),(1-Math.abs(v-.62)*3)*Math.max(0,1-Math.abs(u-.17)*3)*(1-tail),lower*(1-smooth((u-.39)/.22)),lower*smooth((u-.35)/.25)*(1-tail),tail,tail*.35];
    transforms=transforms||enemyTransforms(kind,bones);
    for(let i=0;i<weights.length;i++){
      const t=transforms[i],weight=weights[i];if(!t||weight<=0)continue;
      const px=u-t.cx,py=v-t.cy;
      dx+=weight*(t.x+px*t.xx-py*t.xy-px);
      dy+=weight*(t.y+px*t.yx+py*t.yy-py);
    }
    return [u+dx,v+dy];
  }
  // Named points use the same expression cel, foot anchor and source-track
  // deformation as the actor. Atlas coordinates stay absolute, like frames.
  function attachmentPoint(kind,name,x,y,size,pose={}){
    const d=definitions[kind];
    if(!d||!d.attachments||!d.attachments[name]||![x,y,size].every(Number.isFinite)||size<=0)return null;
    const geometry=frameGeometry(kind,pose,size),n=geometry.frame,point=d.attachments[name][n],src=d.frames[n];
    if(!src||!point||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return null;
    const [sx,sy,sw,sh]=src;
    let u=(point[0]-sx)/sw,v=(point[1]-sy)/sh;
    if(data&&!pose.card)[u,v]=warpPoint(kind,u,v,channels(kind,pose).bones,geometry.aspect);
    else{
      const t=pose.time||0,move=pose.action==='walk'?Math.abs(Math.sin(t*(pose.slow?4:7)))*1.8:0;
      x+=(pose.action==='attack'&&n===4?-size*.035:0)+(pose.action==='hurt'?2:0);y-=move;
    }
    return {x:x+u*geometry.width-geometry.anchor,y:y+(v-1)*geometry.height};
  }
  function triangle(c,img,src,uv,dst,hole,bleed=.32){
    const [p,q,r]=uv,[a,b,d]=dst;
    const det=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);if(Math.abs(det)<1e-6)return;
    const m1=((b[0]-a[0])*(r[1]-p[1])-(d[0]-a[0])*(q[1]-p[1]))/det;
    const m2=((b[1]-a[1])*(r[1]-p[1])-(d[1]-a[1])*(q[1]-p[1]))/det;
    const m3=((q[0]-p[0])*(d[0]-a[0])-(r[0]-p[0])*(b[0]-a[0]))/det;
    const m4=((q[0]-p[0])*(d[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/det;
    c.save();c.beginPath();const cx=(a[0]+b[0]+d[0])/3,cy=(a[1]+b[1]+d[1])/3;
    [a,b,d].forEach((p,i)=>{const len=Math.hypot(p[0]-cx,p[1]-cy)||1,x=p[0]+(p[0]-cx)/len*bleed,y=p[1]+(p[1]-cy)/len*bleed;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.clip();
    c.transform(m1,m2,m3,m4,a[0]-m1*p[0]-m3*p[1],a[1]-m2*p[0]-m4*p[1]);
    if(hole){const hx=hole[0]-src[0],hy=hole[1]-src[1];c.beginPath();c.rect(0,0,src[2],src[3]);c.moveTo(hx,hy);c.lineTo(hx,hy+hole[3]);c.lineTo(hx+hole[2],hy+hole[3]);c.lineTo(hx+hole[2],hy);c.closePath();c.clip();}
    c.drawImage(img,...src,0,0,src[2],src[3]);c.restore();
  }
  // One reusable GPU surface draws the same mesh in one call. The ordinary
  // Canvas path remains available on native platforms and after context loss.
  // Blit each finished actor immediately, retaining the scene's painter order.
  function resetSceneResources(){
    if(pendingScene)pendingScene.cancel();activeCapture=null;
    if(sceneLayer){sceneLayer.canvas.width=0;sceneLayer.canvas.height=0;}sceneLayer=null;
    for(const page of scenePages){page.canvas.width=0;page.canvas.height=0;}scenePages=[];
    sceneImages=new WeakMap();sceneStats=emptySceneStats();
  }
  // Only explicitly immutable sources bypass the software layer. A caller
  // must advance version after repainting, or unregister before recycling a
  // Canvas. Ordinary mutable Canvases retain the established capture path.

  // The original creator certifies its own API, not copied or replaced hooks.
  // A capability only owns physical retirement of this transaction's captured
  // sources. Public unregister/resize/version changes keep their original checks.
  const sceneImageRetirementCapabilities=new WeakSet(),sceneImageRetirementTransactions=new WeakMap();
  function sceneImageRetirementIdentity(owner){
    if(owner!==api)return false;
    for(const [key,value]of [['beginScene',beginScene],['registerSceneImage',registerSceneImage],['unregisterSceneImage',unregisterSceneImage],['createSceneImageRetirement',createSceneImageRetirement]]){
      const descriptor=Object.getOwnPropertyDescriptor(owner,key);
      if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||descriptor.value!==value)return false;
    }
    return true;
  }
  function createSceneImageRetirement(owner,options={}){
    if(options.nativeStatic!==true||!sceneImageRetirementIdentity(owner))return null;
    const retire=function(source,release){
      if(typeof release!=='function'||!sceneImageRetirementIdentity(owner))return false;
      const transaction=pendingScene&&sceneImageRetirementTransactions.get(pendingScene);
      if(!transaction||transaction.capability!==retire||!transaction.sources.has(source))return false;
      if(!transaction.retired.has(source))transaction.retired.set(source,release);
      return true;
    };
    // This immutable own method passes the capability privately. Public scene
    // options are read exactly as before, including getters and Proxy adapters.
    Object.defineProperty(retire,'beginScene',{value:function(mainCtx,options={}){
      if(!sceneImageRetirementIdentity(owner))return owner.beginScene(mainCtx,options);
      return beginScene(mainCtx,options,retire);
    }});
    sceneImageRetirementCapabilities.add(retire);return retire;
  }

  function registerSceneImage(source,version=0,options={}){
    if(!source||typeof source!=='object'||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<=0||source.height<=0||source.width*source.height>SCENE_IMAGE_PIXEL_LIMIT)return false;
    const registered=sceneImages.get(source),atlas=options?.atlas===true;
    if(!registered||registered.width!==source.width||registered.height!==source.height||!Object.is(registered.version,version)||registered.atlas!==atlas)sceneImages.set(source,{width:source.width,height:source.height,version,atlas});
    return true;
  }
  function unregisterSceneImage(source){
    if(!source||typeof source!=='object')return false;
    const removed=sceneImages.delete(source);
    // Keep queued commands valid until their transaction has finished.
    if(!pendingScene&&gpuSceneRig?.releaseSceneImage)gpuSceneRig.releaseSceneImage(source);
    return removed;
  }
  // Closed Native preparation only: no pending capture, resize, draw or present.
  // Upload the same immutable images via the existing texture/LRU path, then
  // keep the real allocation fence before declaring these resources usable.
  const sceneWarmup={calls:0,uploads:0,pixels:0,failures:0,reason:''};
  function warmSceneImages(sources,options={}){
    if(options?.nativeStatic!==true||pendingScene||activeCapture||!ready||!Array.isArray(sources)||sources.length>32)return false;
    const required=new Map();let pixels=0;
    for(const source of sources){
      const registered=sceneImages.get(source);
      if(!registered||registered.atlas||source.width!==registered.width||source.height!==registered.height)return false;
      if(required.has(source))continue;
      pixels+=registered.width*registered.height;if(pixels>2*1024*1024)return false;
      required.set(source,registered);
    }
    if(!required.size)return true;
    sceneWarmup.calls++;sceneWarmup.reason='';
    const gpu=gpuRenderer(true);if(!gpu){sceneWarmup.failures++;sceneWarmup.reason='Scene GPU unavailable';return false;}
    try{
      const commands=Array.from(required,([source,registered])=>({type:'image',source,registered}));
      const changed=gpu.warmImages(commands);
      if(changed===null)throw new Error('Scene GPU context lost during preparation');
      sceneWarmup.uploads+=changed;sceneWarmup.pixels=pixels;return true;
    }catch(error){
      sceneWarmup.failures++;sceneWarmup.reason=String(error.message||error);
      if(gpuSceneRig===gpu){gpuSceneRig=null;gpuSceneAttempted=true;try{gpu.dispose();}catch(_){}}
      return false;
    }
  }
  const sceneVertexReserve={calls:0,allocations:0,vertices:0,pointBytes:0,alphaBytes:0,failures:0,reason:''};
  function reserveSceneVertices(count,options={}){
    if(options?.nativeStatic!==true||!['ready','paused','won','lost'].includes(options.status)||pendingScene||activeCapture||!ready||!Number.isInteger(count)||count<=0||count>1024*1024)return false;
    sceneVertexReserve.calls++;sceneVertexReserve.reason='';
    const gpu=gpuRenderer(true);if(!gpu){sceneVertexReserve.failures++;sceneVertexReserve.reason='Scene GPU unavailable';return false;}
    try{
      const reserved=gpu.reserveSceneVertices(count);
      if(!reserved)throw new Error('Scene GPU context lost during vertex preparation');
      sceneVertexReserve.allocations+=reserved.changed?1:0;sceneVertexReserve.vertices=reserved.vertices;sceneVertexReserve.pointBytes=reserved.pointBytes;sceneVertexReserve.alphaBytes=reserved.alphaBytes;return true;
    }catch(error){
      sceneVertexReserve.failures++;sceneVertexReserve.reason=String(error.message||error);
      if(gpuSceneRig===gpu){gpuSceneRig=null;gpuSceneAttempted=true;try{gpu.dispose();}catch(_){}}
      return false;
    }
  }
  const sceneStorageWarmup={calls:0,allocations:0,width:0,height:0,pageWidth:0,pageHeight:0,failures:0,reason:''};
  function prepareSceneStorage(targetWidth,targetHeight,options={}){
    const pixelScale=options?.pixelScale??1;
    if(options?.nativeStatic!==true||!['ready','paused','won','lost'].includes(options.status)||pendingScene||activeCapture||!ready||typeof canvasFactory!=='function'||
      !Number.isInteger(targetWidth)||!Number.isInteger(targetHeight)||targetWidth<=0||targetHeight<=0||!Number.isFinite(pixelScale)||pixelScale<=0||pixelScale>1)return false;
    const width=Math.ceil(targetWidth*pixelScale),height=Math.ceil(targetHeight*pixelScale);
    if(width*height>SCENE_PIXEL_LIMIT)return false;
    sceneStorageWarmup.calls++;sceneStorageWarmup.reason='';
    const gpu=gpuRenderer(true);if(!gpu){sceneStorageWarmup.failures++;sceneStorageWarmup.reason='Scene GPU unavailable';return false;}
    let candidate=null;
    try{
      if(!gpu.canScene(width,height)||gpu.sceneAtlasSide<2048||gpu.sceneAtlasSide*gpu.sceneAtlasSide>SCENE_PIXEL_LIMIT)throw new Error('Scene storage dimensions exceed budget');
      const previous=scenePages[0];
      // Allocate privately before committing either the page or its retained extent.
      // Existing larger stores never shrink; the original packer/UV calculation stays intact.
      const pageWidth=Math.max(2048,previous?.canvas.width||1,previous?.uploadWidth||1),pageHeight=Math.max(256,previous?.canvas.height||1,previous?.uploadHeight||1);
      if(pageWidth>gpu.sceneAtlasSide||pageHeight>gpu.sceneAtlasSide)throw new Error('Scene layer storage exceeds atlas side');
      let page=previous;
      if(!page||page.canvas.width!==pageWidth||page.canvas.height!==pageHeight){
        const canvas=canvasFactory();candidate=canvas;canvas.width=pageWidth;canvas.height=pageHeight;
        const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Scene layer Canvas unavailable');
        context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.clearRect(0,0,pageWidth,pageHeight);
        page={canvas,context};
      }
      const prepared=gpu.prepareSceneStorage(width,height,page.canvas);
      if(!prepared)throw new Error('Scene GPU context lost during storage preparation');
      if(page!==previous){if(previous){previous.canvas.width=0;previous.canvas.height=0;}scenePages[0]=page;}
      page.uploadWidth=pageWidth;page.uploadHeight=pageHeight;candidate=null;
      sceneStorageWarmup.allocations+=prepared.changed?1:0;Object.assign(sceneStorageWarmup,{width,height,pageWidth,pageHeight});return true;
    }catch(error){
      if(candidate){try{candidate.width=0;candidate.height=0;}catch(_){}}
      sceneStorageWarmup.failures++;sceneStorageWarmup.reason=String(error.message||error);
      if(gpuSceneRig===gpu){gpuSceneRig=null;gpuSceneAttempted=true;try{gpu.dispose();}catch(_){}}
      return false;
    }
  }
  function transformedBounds(m,x,y,width,height){
    const left=m.a*x+m.c*y+m.e,top=m.b*x+m.d*y+m.f,dx=m.a*width,dy=m.b*width,ex=m.c*height,ey=m.d*height;
    return {left:Math.min(left,left+dx,left+ex,left+dx+ex),top:Math.min(top,top+dy,top+ey,top+dy+ey),right:Math.max(left,left+dx,left+ex,left+dx+ex),bottom:Math.max(top,top+dy,top+ey,top+dy+ey)};
  }
  function deviceBounds(ctx,x,y,width,height){
    const m=ctx.getTransform();if(![m.a,m.b,m.c,m.d,m.e,m.f,x,y,width,height].every(Number.isFinite))return null;
    return transformedBounds(m,x,y,width,height);
  }
  // Track conservative painted bounds without reading pixels back. The layers
  // are software Canvases: only their small painted rectangles enter an atlas,
  // so a shadow does not upload a whole actor-sized transparent rectangle.
  function trackedSceneContext(context,width,height,cacheImageState=false,cacheMethods=false){
    let imageCompatible;
    function invalidateImageState(){imageCompatible=undefined;}
    function compatibleImageState(){
      if(!cacheImageState||imageCompatible===undefined)imageCompatible=!(context.globalCompositeOperation!=='source-over'||(context.filter&&context.filter!=='none')||(context.shadowBlur||context.shadowOffsetX||context.shadowOffsetY)||(context.shadowColor&&context.shadowColor!=='transparent'&&context.shadowColor!=='rgba(0, 0, 0, 0)')||context.imageSmoothingEnabled===false);
      return imageCompatible;
    }
    const initial=context.getTransform();let matrix={a:initial.a,b:initial.b,c:initial.c,d:initial.d,e:initial.e,f:initial.f};
    let dirty=null,path=null,clipped=false;const clips=[],methods=new Map();
    const full=()=>({left:0,top:0,right:width,bottom:height});
    function union(a,b){if(!a)return {...b};a.left=Math.min(a.left,b.left);a.top=Math.min(a.top,b.top);a.right=Math.max(a.right,b.right);a.bottom=Math.max(a.bottom,b.bottom);return a;}
    function pathRect(x,y,w,h){path=union(path,transformedBounds(matrix,x,y,w,h));}
    function paint(bounds,stroke=false){
      if(context.globalAlpha===0)return;
      if(!bounds)bounds=full();else bounds={...bounds};
      if(context.filter&&context.filter!=='none')bounds=full();
      else{
        const m=matrix,scale=Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
        const padding=2+(stroke?(context.lineWidth||1)*scale*.5*(context.lineJoin==='miter'?(context.miterLimit||10):1):0);
        bounds.left-=padding;bounds.top-=padding;bounds.right+=padding;bounds.bottom+=padding;
        if(context.shadowColor&&context.shadowColor!=='transparent'&&context.shadowColor!=='rgba(0, 0, 0, 0)'){
          const blur=(context.shadowBlur||0)*3,dx=context.shadowOffsetX||0,dy=context.shadowOffsetY||0;
          bounds=union(bounds,{left:bounds.left+dx-blur,top:bounds.top+dy-blur,right:bounds.right+dx+blur,bottom:bounds.bottom+dy+blur});
        }
      }
      dirty=union(dirty,bounds);
    }
    function textBounds(text,x,y,maxWidth){
      if(typeof context.measureText!=='function')return null;
      const metrics=context.measureText(text),fontSize=Number((context.font||'').match(/([\d.]+)px/)?.[1])||16;
      if(!Number.isFinite(metrics.width))return null;
      let left,right,ascent,descent;
      if([metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight,metrics.actualBoundingBoxAscent,metrics.actualBoundingBoxDescent].every(Number.isFinite)){
        left=-metrics.actualBoundingBoxLeft;right=metrics.actualBoundingBoxRight;ascent=metrics.actualBoundingBoxAscent;descent=metrics.actualBoundingBoxDescent;
      }else{
        const textWidth=metrics.width;left=context.textAlign==='center'?-textWidth/2:context.textAlign==='right'||context.textAlign==='end'?-textWidth:0;right=left+textWidth;
        ascent=fontSize*1.5;descent=fontSize*.5;
        if(context.textBaseline==='top'||context.textBaseline==='hanging'){ascent=fontSize*.5;descent=fontSize*1.5;}
        else if(context.textBaseline==='middle'){ascent=fontSize;descent=fontSize;}
      }
      if(Number.isFinite(maxWidth)&&maxWidth>0&&metrics.width>maxWidth){const ratio=maxWidth/metrics.width;left*=ratio;right*=ratio;}
      return transformedBounds(matrix,x+left,y-ascent,right-left,ascent+descent);
    }
    const proxy=new Proxy(context,{get(target,name){
      // The explicitly closed scene forbids replacing native methods or retaining
      // this proxy. Resolve each native binding once in that scene only.
      if(cacheMethods&&methods.has(name))return methods.get(name);
      const value=Reflect.get(target,name,target);if(typeof value!=='function')return value;
      if(methods.has(name))return methods.get(name);
      const method=(...args)=>{
        if(name==='reset'){invalidateImageState();for(const state of clips)state.imageCompatible=undefined;}
        if(name==='getTransform')return {...matrix};
        if(name==='beginPath')path=null;
        else if(name==='save')clips.push({clipped,matrix:{...matrix},imageCompatible});
        else if(name==='restore'){
          // Only the closed scene promises that every style mutation uses this
          // proxy. Native restore reinstates the saved compatibility exactly.
          if(clips.length){const state=clips.pop();clipped=state.clipped;matrix=state.matrix;
            if(cacheImageState)imageCompatible=state.imageCompatible;else invalidateImageState();
          }else if(!cacheImageState)invalidateImageState();
        }
        else if(name==='setTransform'){const m=args.length===1?args[0]:{a:args[0],b:args[1],c:args[2],d:args[3],e:args[4],f:args[5]};matrix={a:m?.a??1,b:m?.b??0,c:m?.c??0,d:m?.d??1,e:m?.e??0,f:m?.f??0};}
        else if(name==='resetTransform')matrix={a:1,b:0,c:0,d:1,e:0,f:0};
        else if(name==='translate'){matrix.e+=matrix.a*args[0]+matrix.c*args[1];matrix.f+=matrix.b*args[0]+matrix.d*args[1];}
        else if(name==='scale'){matrix.a*=args[0];matrix.b*=args[0];matrix.c*=args[1];matrix.d*=args[1];}
        else if(name==='rotate'){const cosine=Math.cos(args[0]),sine=Math.sin(args[0]),{a,b,c,d}=matrix;matrix.a=a*cosine+c*sine;matrix.b=b*cosine+d*sine;matrix.c=c*cosine-a*sine;matrix.d=d*cosine-b*sine;}
        else if(name==='transform'){const {a,b,c,d,e,f}=matrix;matrix={a:a*args[0]+c*args[1],b:b*args[0]+d*args[1],c:a*args[2]+c*args[3],d:b*args[2]+d*args[3],e:a*args[4]+c*args[5]+e,f:b*args[4]+d*args[5]+f};}
        else if(name==='clip')clipped=true;
        else if(name==='moveTo'||name==='lineTo')pathRect(args[0],args[1],0,0);
        else if(name==='rect'||name==='roundRect')pathRect(args[0],args[1],args[2],args[3]);
        else if(name==='quadraticCurveTo'){pathRect(args[0],args[1],0,0);pathRect(args[2],args[3],0,0);}
        else if(name==='bezierCurveTo')for(let i=0;i<6;i+=2)pathRect(args[i],args[i+1],0,0);
        else if(name==='arc')pathRect(args[0]-args[2],args[1]-args[2],args[2]*2,args[2]*2);
        else if(name==='ellipse'){
          const rx=Math.hypot(args[2]*Math.cos(args[4]),args[3]*Math.sin(args[4])),ry=Math.hypot(args[2]*Math.sin(args[4]),args[3]*Math.cos(args[4]));
          pathRect(args[0]-rx,args[1]-ry,rx*2,ry*2);
        }else if(name==='arcTo')path=full();
        else if(name==='fill'||name==='stroke')paint(args[0]&&typeof args[0]==='object'?null:path,name==='stroke');
        else if(name==='fillRect'||name==='strokeRect')paint(transformedBounds(matrix,args[0],args[1],args[2],args[3]),name==='strokeRect');
        else if(name==='drawImage'){
          if(activeCapture?.context===proxy&&activeCapture.image(args))return;
          const destination=args.length===9?args.slice(5,9):args.length===5?args.slice(1,5):[args[1],args[2],args[0]?.width,args[0]?.height];
          paint(transformedBounds(matrix,...destination));
        }else if(name==='fillText'||name==='strokeText')paint(textBounds(...args),name==='strokeText');
        else if(name==='putImageData')paint(null);
        return Reflect.apply(value,target,args);
      };
      methods.set(name,method);return method;
    },set(target,name,value){if(cacheMethods)methods.delete(name);if(name==='globalCompositeOperation'||name==='filter'||name==='shadowBlur'||name==='shadowOffsetX'||name==='shadowOffsetY'||name==='shadowColor'||name==='imageSmoothingEnabled')invalidateImageState();return Reflect.set(target,name,value,target);}});
    return {context:proxy,compatibleImageState,get matrix(){return matrix;},get dirty(){return dirty;},get clipped(){return clipped;},clear(){dirty=null;},reset(nextWidth,nextHeight){
      // Called after the original clear/beginPath/save/styles/setTransform.
      // Only wrapper bookkeeping resets; the native state/path stays original.
      width=nextWidth;height=nextHeight;invalidateImageState();
      const initial=context.getTransform();matrix={a:initial.a,b:initial.b,c:initial.c,d:initial.d,e:initial.e,f:initial.f};
      dirty=null;path=null;clipped=false;clips.length=0;
    }};
  }
  const sceneContextProperties=['globalAlpha','globalCompositeOperation','fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit','lineDashOffset','font','textAlign','textBaseline','direction','fontKerning','fontStretch','fontVariantCaps','letterSpacing','wordSpacing','imageSmoothingEnabled','imageSmoothingQuality','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY','filter'];
  function beginScene(mainCtx,options={},retirementCapability=null){
    const packetAttempt=!!nextPacketMeta;
    function declined(reason){if(packetAttempt)sceneStats.reason='Scene packet begin declined: '+reason;return null;}
    if(packetExportBusy)return declined('packet export busy');
    if(pendingScene)return declined('scene pending');
    if(!ready)return declined('motion not ready');
    if(!data)return declined('motion data unavailable');
    if(!canvasFactory)return declined('createCanvas unavailable');
    if(!gpuFactory&&!nextPacketMeta)return declined('createMeshCanvas unavailable');
    if(typeof Proxy!=='function')return declined('Proxy unavailable');
    if(typeof mainCtx?.getTransform!=='function')return declined('context.getTransform unavailable');
    if(!mainCtx.canvas)return declined('context canvas unavailable');
    const targetWidth=mainCtx.canvas.width,targetHeight=mainCtx.canvas.height,pixelScale=options?.pixelScale??1;
    if(!Number.isInteger(targetWidth)||!Number.isInteger(targetHeight)||targetWidth<=0||targetHeight<=0)return declined('invalid canvas dimensions '+targetWidth+'x'+targetHeight);
    if(!Number.isFinite(pixelScale)||pixelScale<=0||pixelScale>1)return declined('invalid pixelScale '+pixelScale);
    if(mainCtx.globalCompositeOperation!=='source-over')return declined('composite operation '+mainCtx.globalCompositeOperation);
    // This is an explicit platform choice: a supersampled main Canvas may
    // keep its UI while the world uses the actual display's physical pixels.
    const width=Math.ceil(targetWidth*pixelScale),height=Math.ceil(targetHeight*pixelScale),scaleX=width/targetWidth,scaleY=height/targetHeight;
    if(width*height>SCENE_PIXEL_LIMIT)return declined('scene pixel limit '+width+'x'+height);
    // Native render promises that the parent styles are fixed for this scene.
    // Matrices, bounds, callback drawing state and the default public API stay live.
    let immutableState=null,immutableDash=null,installedLayer=null,installedWidth=-1,installedHeight=-1;
    if(options?.immutableContext===true){
      try{
        immutableState=[];for(const property of sceneContextProperties)if(property in mainCtx)immutableState.push([property,mainCtx[property]]);
        if(typeof mainCtx.getLineDash==='function')immutableDash=Array.from(mainCtx.getLineDash());
      }catch(error){return declined('immutable context: '+String(error.message||error));}
    }
    const packetMeta=nextPacketMeta;nextPacketMeta=null;
    if(packetMeta)captureStage('motionPacketSceneStart');
    const gpu=packetMeta?packetSceneRenderer(packetMeta):gpuRenderer(true);if(!gpu||!gpu.canScene(width,height))return declined('scene renderer refused '+width+'x'+height);
    sceneStats=emptySceneStats();
    sceneStats.pixelScale=pixelScale;sceneStats.renderWidth=width;sceneStats.renderHeight=height;
    sceneStats.immutableContext=!!immutableState;sceneStats.contextStateCopies=0;
    // Context/method identities are reusable only in the closed Native scene.
    // Callbacks must not retain the proxy or replace native context methods.
    const reuseCaptureContext=options.cacheCaptureContext===true&&!!immutableState;
    let captureTracker=null,captureTrackerContext=null;
    sceneStats.contextTrackers=0;sceneStats.contextTrackerReuses=0;
    const side=gpu.sceneAtlasSide,commands=[],pages=[],sources=new Map(),atlasSprites=new Map();let finished=false,failed=false,sourcePixels=0,stagingPixels=0,atlasSourcePixels=0;

    const retirement=typeof retirementCapability==='function'&&sceneImageRetirementCapabilities.has(retirementCapability)&&sceneImageRetirementIdentity(api)?{capability:retirementCapability,sources,retired:new Map()}:null;
    function releaseRetiredSceneImages(){
      if(!retirement)return;
      // Remove ownership before callbacks, making finish/cancel and reentry safe.
      sceneImageRetirementTransactions.delete(scene);
      const releases=Array.from(retirement.retired.values());retirement.retired.clear();
      let failed=false,firstError;
      for(const release of releases){try{release();}catch(error){if(!failed){failed=true;firstError=error;}}}
      if(failed)throw firstError;
    }

    sceneStats.atlasUploadPixels=0;sceneStats.stagingPeakPixels=0;sceneStats.atlasSources=0;sceneStats.atlasSourcePixels=0;sceneStats.atlasImages=0;
    function pageAt(index){
      if((index+1)*side*side>SCENE_PIXEL_LIMIT)throw new Error('Scene layer atlas exceeds pixel budget');
      let page=scenePages[index];
      if(!page){const canvas=canvasFactory();canvas.width=1;canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Scene layer Canvas unavailable');page=scenePages[index]={canvas,context};}
      if(!pages[index])pages[index]={...page,shelves:[],usedHeight:0,patches:[],atlasSprites:[],direct:false};
      return pages[index];
    }
    function resetPage(page,width,height){
      if(page.canvas.width!==width)page.canvas.width=width;
      if(page.canvas.height!==height)page.canvas.height=height;
      page.context.setTransform(1,0,0,1,0,0);page.context.globalAlpha=1;page.context.globalCompositeOperation='source-over';page.context.clearRect(0,0,width,height);
    }
    function directPage(page){
      if(page.direct)return;
      resetPage(page,side,side);page.direct=true;
      for(const patch of page.patches){page.context.putImageData(patch.pixels,patch.x,patch.y);stagingPixels-=patch.pixels.width*patch.pixels.height;}
      page.patches.length=0;
    }
    function paintAtlasSprites(page){
      if(!page.atlasSprites.length)return;
      const c=page.context;c.save();
      try{
        c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
        if('filter'in c)c.filter='none';if('shadowColor'in c)c.shadowColor='transparent';if('shadowBlur'in c)c.shadowBlur=0;
        if('shadowOffsetX'in c)c.shadowOffsetX=0;if('shadowOffsetY'in c)c.shadowOffsetY=0;
        // Integer 1:1 copies retain the source's completed physical pixels.
        // Duplicate the outer texels: transparent padding would change LINEAR
        // sampling at an opaque source edge compared with CLAMP_TO_EDGE.
        for(const {source,registered,x,y}of page.atlasSprites){
          const w=registered.width,h=registered.height;
          c.drawImage(source,x,y);
          c.drawImage(source,0,0,1,h,x-1,y,1,h);c.drawImage(source,w-1,0,1,h,x+w,y,1,h);
          c.drawImage(source,0,0,w,1,x,y-1,w,1);c.drawImage(source,0,h-1,w,1,x,y+h,w,1);
          c.drawImage(source,0,0,1,1,x-1,y-1,1,1);c.drawImage(source,w-1,0,1,1,x+w,y-1,1,1);
          c.drawImage(source,0,h-1,1,1,x-1,y+h,1,1);c.drawImage(source,w-1,h-1,1,1,x+w,y+h,1,1);
        }
      }finally{c.restore();}
    }
    function preparePages(){
      for(let index=0;index<pages.length;index++){
        const page=pages[index];
        if(page.direct){paintAtlasSprites(page);continue;}
        // Rasterize the original integer pixel patches after their complete
        // packing extent is known. Storage grows only while this page warms;
        // power-of-two storage limits growth checks; UVs retain original texels.
        const usedWidth=Math.max(1,...page.shelves.map(shelf=>shelf.x));
        const previous=scenePages[index];
        const bucket=value=>Math.min(side,2**Math.ceil(Math.log2(Math.max(1,value))));
        const width=Math.max(previous.uploadWidth||1,bucket(usedWidth)),height=Math.max(previous.uploadHeight||1,bucket(page.usedHeight));
        resetPage(page,width,height);previous.uploadWidth=width;previous.uploadHeight=height;
        for(const patch of page.patches){page.context.putImageData(patch.pixels,patch.x,patch.y);stagingPixels-=patch.pixels.width*patch.pixels.height;}
        page.patches.length=0;paintAtlasSprites(page);
      }
      sceneStats.atlasUploadPixels=pages.reduce((sum,page)=>sum+page.canvas.width*page.canvas.height,0);
    }
    function layerSlot(width,height){
      // Queue order is independent of packing order. Fit short shadows back
      // into short rows rather than wasting the taller overlay row beside them.
      const packedWidth=width+2,packedHeight=height+2;let chosen=null,waste=Infinity;
      for(let index=0;index<pages.length;index++)for(const shelf of pages[index].shelves){
        if(shelf.height>=packedHeight&&shelf.height-packedHeight<16&&shelf.x+packedWidth<=side&&shelf.height-packedHeight<waste){chosen={page:pages[index],index,shelf};waste=shelf.height-packedHeight;}
      }
      if(!chosen){
        const rowHeight=Math.min(side,Math.ceil(packedHeight/16)*16);
        let index=pages.findIndex(page=>page.usedHeight+rowHeight<=side);if(index<0)index=pages.length;
        const page=pageAt(index),shelf={x:0,y:page.usedHeight,height:rowHeight};page.shelves.push(shelf);page.usedHeight+=rowHeight;chosen={page,index,shelf};
      }
      const x=chosen.shelf.x+1,y=chosen.shelf.y+1;chosen.shelf.x+=packedWidth;return {page:chosen.page,index:chosen.index,x,y};
    }
    function flush(tracker,rect){
      const bounds=tracker.dirty;if(!bounds)return;
      const left=Math.max(0,Math.floor(bounds.left)),top=Math.max(0,Math.floor(bounds.top)),right=Math.min(rect.width,Math.ceil(bounds.right)),bottom=Math.min(rect.height,Math.ceil(bounds.bottom));
      const width=right-left,height=bottom-top;
      if(width>0&&height>0){
        if(width+2>side||height+2>side)throw new Error('Scene layer rectangle exceeds atlas limits');
        const {page,index,x,y}=layerSlot(width,height);
        // Both surfaces use software backing. A direct pixel copy avoids
        // taking a Canvas snapshot immediately before clearing the source.
        // Keep the Canvas path for native implementations lacking pixel APIs.
        if(typeof sceneLayer.context.getImageData==='function'&&typeof page.context.putImageData==='function'){
          const pixels=sceneLayer.context.getImageData(left,top,width,height);
          if(page.direct)page.context.putImageData(pixels,x,y);else{page.patches.push({pixels,x,y});stagingPixels+=width*height;sceneStats.stagingPeakPixels=Math.max(sceneStats.stagingPeakPixels,stagingPixels);}
        }else{directPage(page);page.context.drawImage(sceneLayer.canvas,left,top,width,height,x,y,width,height);}
        commands.push({type:'layer',page:index,x,y,width,height,left:rect.x+left,top:rect.y+top});
        sceneStats.layers++;sceneStats.pixels+=width*height;sceneStats.pages=pages.length;
      }
      // Clearing in device coordinates must preserve the caller's transform,
      // alpha, paths and save stack for the accents painted after motion.draw.
      const c=sceneLayer.context;c.save();try{c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,rect.width,rect.height);}finally{c.restore();}tracker.clear();
    }
    const scene={capture(bounds,callback,owner){
      if(finished||failed||activeCapture||typeof callback!=='function')return false;
      let saved=false;const commandStart=commands.length;
      try{
        const original=mainCtx.getTransform(),m={a:original.a*scaleX,b:original.b*scaleY,c:original.c*scaleX,d:original.d*scaleY,e:original.e*scaleX,f:original.f*scaleY};
        if(![m.a,m.b,m.c,m.d,m.e,m.f,bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite))throw new Error('Invalid scene capture bounds');
        const transformed=transformedBounds(m,bounds.x,bounds.y,bounds.width,bounds.height);
        const x=Math.max(0,Math.floor(transformed.left)),y=Math.max(0,Math.floor(transformed.top)),right=Math.min(width,Math.ceil(transformed.right)),bottom=Math.min(height,Math.ceil(transformed.bottom));
        // Even an offscreen Canvas layer can contain a mesh extending onto the
        // board. Run its callback on a minimal layer, without clipping that mesh.
        const rect={x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
        if(rect.width*rect.height>8*1024*1024||rect.width>gpu.maxSceneSide||rect.height>gpu.maxSceneSide)throw new Error('Scene capture exceeds layer budget');
        if(!sceneLayer){const canvas=canvasFactory();canvas.width=rect.width;canvas.height=rect.height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Scene layer Canvas unavailable');sceneLayer={canvas,context};}
        const layer=sceneLayer.canvas,c=sceneLayer.context,nextWidth=Math.max(layer.width,rect.width),nextHeight=Math.max(layer.height,rect.height);
        if(nextWidth*nextHeight>8*1024*1024){layer.width=rect.width;layer.height=rect.height;}else{if(layer.width!==nextWidth)layer.width=nextWidth;if(layer.height!==nextHeight)layer.height=nextHeight;}
        c.setTransform(1,0,0,1,0,0);
        if(immutableState){
          if(installedLayer!==layer||installedWidth!==layer.width||installedHeight!==layer.height){
            for(const [property,value]of immutableState)c[property]=value;
            if(immutableDash&&typeof c.setLineDash==='function')c.setLineDash(immutableDash);
            installedLayer=layer;installedWidth=layer.width;installedHeight=layer.height;sceneStats.contextStateCopies++;
          }
          // clearRect ignores paint styles/alpha/composite; leave the baseline
          // installed and let the real Canvas save/restore preserve every property.
          c.clearRect(0,0,rect.width,rect.height);c.beginPath();c.save();saved=true;
        }else{
          c.globalAlpha=1;c.globalCompositeOperation='source-over';c.clearRect(0,0,rect.width,rect.height);c.beginPath();c.save();saved=true;
          for(const property of sceneContextProperties)if(property in mainCtx)c[property]=mainCtx[property];
          if(typeof mainCtx.getLineDash==='function'&&typeof c.setLineDash==='function')c.setLineDash(mainCtx.getLineDash());sceneStats.contextStateCopies++;
        }
        c.setTransform(m.a,m.b,m.c,m.d,m.e-rect.x,m.f-rect.y);
        let tracker;
        if(reuseCaptureContext&&captureTracker&&captureTrackerContext===c){
          tracker=captureTracker;tracker.reset(rect.width,rect.height);sceneStats.contextTrackerReuses++;
        }else{
          tracker=trackedSceneContext(c,rect.width,rect.height,options.cacheImageState===true,reuseCaptureContext);sceneStats.contextTrackers++;
          if(reuseCaptureContext){captureTracker=tracker;captureTrackerContext=c;}
        }
        activeCapture={scene,context:tracker.context,rect,tracker,flush(){flush(tracker,rect);},image(args){
          const source=args[0],registered=sceneImages.get(source);
          if(!registered||source.width!==registered.width||source.height!==registered.height||registered.width>gpu.maxSceneSide||registered.height>gpu.maxSceneSide||tracker.clipped||!tracker.compatibleImageState())return false;
          let sx=0,sy=0,sw=registered.width,sh=registered.height,dx,dy,dw,dh;
          if(args.length===3){dx=args[1];dy=args[2];dw=sw;dh=sh;}
          else if(args.length===5){[,dx,dy,dw,dh]=args;}
          else if(args.length===9){[,sx,sy,sw,sh,dx,dy,dw,dh]=args;}
          else return false;
          if(![sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite))return false;
          if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}if(dw<0){dx+=dw;dw=-dw;}if(dh<0){dy+=dh;dh=-dh;}
          if(!sw||!sh||!dw||!dh||c.globalAlpha===0)return true;
          const left=Math.max(0,sx),top=Math.max(0,sy),right=Math.min(registered.width,sx+sw),bottom=Math.min(registered.height,sy+sh);
          if(right<=left||bottom<=top)return true;
          dx+=(left-sx)*dw/sw;dy+=(top-sy)*dh/sh;dw*=(right-left)/sw;dh*=(bottom-top)/sh;sx=left;sy=top;sw=right-left;sh=bottom-top;
          const pixels=registered.width*registered.height;
          if(registered.atlas&&(registered.width+2>side||registered.height+2>side||(!atlasSprites.has(source)&&atlasSourcePixels+(registered.width+2)*(registered.height+2)>2*1024*1024)))return false;
          if(sources.has(source)&&sources.get(source)!==registered)throw new Error('Scene image changed during capture');
          if(!sources.has(source)&&(sources.size>=SCENE_IMAGE_LIMIT||sourcePixels+pixels>SCENE_IMAGE_PIXEL_LIMIT))return false;
          if(!sources.has(source)){sources.set(source,registered);sourcePixels+=pixels;}
          flush(tracker,rect);const matrix=tracker.matrix;let atlas=null;
          if(registered.atlas){
            atlas=atlasSprites.get(source);
            if(!atlas){
              const slot=layerSlot(registered.width,registered.height);
              slot.page.atlasSprites.push({source,registered,x:slot.x,y:slot.y});
              atlas={page:slot.index,x:slot.x,y:slot.y};atlasSprites.set(source,atlas);
              atlasSourcePixels+=(registered.width+2)*(registered.height+2);sceneStats.atlasSources=atlasSprites.size;sceneStats.atlasSourcePixels=atlasSourcePixels;sceneStats.pages=pages.length;
            }
            sceneStats.atlasImages++;
          }
          commands.push({type:'image',source,registered,atlas,sx,sy,sw,sh,dx,dy,dw,dh,alpha:c.globalAlpha,matrix:{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e+rect.x,f:matrix.f+rect.y},clip:rect});
          sceneStats.images++;return true;
        },mesh(d,n,mesh,size,chilled){
          if(tracker.clipped||c.globalCompositeOperation!=='source-over'||(c.filter&&c.filter!=='none')||(c.shadowBlur||c.shadowOffsetX||c.shadowOffsetY))throw new Error('Mesh scene requires source-over without a local clip or filter');
          flush(tracker,rect);const matrix=tracker.matrix;
          commands.push({type:'mesh',d,n,mesh,size,chilled,sharedPoints:!!immutableState,alpha:c.globalAlpha,matrix:{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e+rect.x,f:matrix.f+rect.y}});
          sceneStats.meshes++;
        }};
        callback(tracker.context);flush(tracker,rect);
        if(owner&&typeof owner.id==='string'&&typeof owner.continuity==='string')for(let i=commandStart;i<commands.length;i++)commands[i].owner={id:owner.id,continuity:owner.continuity};
        sceneStats.captures++;return true;
      }catch(error){failed=true;sceneStats.reason=String(error.message||error);return false;}
      finally{activeCapture=null;if(saved)sceneLayer.context.restore();}
    },finish(present){
      if(finished)return false;finished=true;pendingScene=null;
      try{
      if(failed){commands.length=0;pages.length=0;return false;}
      for(const [source,registered]of sources)if(sceneImages.get(source)!==registered||source.width!==registered.width||source.height!==registered.height){sceneStats.reason='Scene image changed before submission';commands.length=0;pages.length=0;return false;}
      let presentationError=null;
      const presenter=typeof present==='function'?canvas=>{try{return present(canvas);}catch(error){presentationError=error;return false;}}:present;
      if(packetMeta)captureStage('motionPreparePagesStart');
      try{preparePages();if(packetMeta)captureStage('motionPreparePagesEnd',{pages:pages.length,atlasUploadPixels:sceneStats.atlasUploadPixels});}catch(error){sceneStats.reason=String(error.message||error);commands.length=0;pages.length=0;return false;}
      try{const drawn=gpu.scene(commands,pages,width,height,mainCtx,presenter);if(drawn){sceneStats.copies=typeof present==='function'?0:1;sceneStats.presented=typeof present==='function'?1:0;frameStats={actors:sceneStats.captures,meshes:sceneStats.meshes,copies:sceneStats.copies,pixels:sceneStats.copies?targetWidth*targetHeight:0,pages:sceneStats.pages};}else sceneStats.reason=presentationError?String(presentationError.message||presentationError):'Scene GPU context lost or presentation declined';return drawn;}
      catch(error){sceneStats.reason=String(error.message||error);if(gpuSceneRig===gpu){gpuSceneRig=null;gpuSceneAttempted=true;try{gpu.dispose();}catch(_){}}return false;}
      finally{commands.length=0;pages.length=0;}
      }finally{if(packetMeta&&lastPacketExport&&packetExportBusy)lastPacketExport=lastPacketExport.finally(releaseRetiredSceneImages);else releaseRetiredSceneImages();}
    },cancel(){finished=true;commands.length=0;pages.length=0;if(pendingScene===scene)pendingScene=null;if(activeCapture?.scene===scene)activeCapture=null;releaseRetiredSceneImages();}};
    if(retirement)sceneImageRetirementTransactions.set(scene,retirement);
    pendingScene=scene;return scene;
  }
  function gpuRenderer(forScene=false){
    const existing=forScene?gpuSceneRig:gpuRig;if(existing)return existing;
    if((forScene?gpuSceneAttempted:gpuAttempted)||!gpuFactory)return null;
    if(forScene)gpuSceneAttempted=true;else gpuAttempted=true;
    let canvas,gl,program,buffer,alphaBuffer;const textures=[],shaders=[];
    const release=()=>{if(gl){textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));if(buffer)gl.deleteBuffer(buffer);if(alphaBuffer)gl.deleteBuffer(alphaBuffer);if(program)gl.deleteProgram(program);const ext=gl.getExtension('WEBGL_lose_context');if(ext&&!gl.isContextLost())ext.loseContext();}if(canvas){canvas.width=0;canvas.height=0;}};
    try{
      canvas=gpuFactory();gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});
      if(!gl||typeof gl.createShader!=='function'){release();return null;}
      const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if(images.some(image=>!image.width||!image.height||image.width>maxTextureSize||image.height>maxTextureSize))throw new Error('Mesh atlas exceeds GPU limits');
      canvas.width=CACHE_WIDTH;canvas.height=CACHE_HEIGHT;
      function shader(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Mesh shader compilation failed');return s;}
      // Large atlases need precise UV interpolation, including exclusion edges.
      // WebGL 1 fragment highp is optional; both stages must agree on the varying.
      let uvPrecision='mediump';
      try{if(gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision>0)uvPrecision='highp';}catch(_){}
      program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 point;attribute vec2 uv;'+(forScene?'attribute float vertexAlpha;varying mediump float primitiveAlpha;':'')+'uniform vec2 extent;varying '+uvPrecision+' vec2 texUV;void main(){texUV=uv;'+(forScene?'primitiveAlpha=vertexAlpha;':'')+'gl_Position=vec4(point.x/extent.x*2.0-1.0,1.0-point.y/extent.y*2.0,0.0,1.0);}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D atlas;uniform '+uvPrecision+' vec4 hole;uniform vec4 tint;uniform float opacity;'+(forScene?'varying mediump float primitiveAlpha;':'')+'varying '+uvPrecision+' vec2 texUV;void main(){if(hole.z>0.0&&texUV.x>hole.x&&texUV.y>hole.y&&texUV.x<hole.z&&texUV.y<hole.w)discard;vec4 color=texture2D(atlas,texUV);color.rgb=mix(color.rgb,tint.rgb*color.a,tint.a);gl_FragColor=color*'+(forScene?'(opacity*primitiveAlpha)':'opacity')+';}'));
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Mesh shader linking failed');
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      let sharedSceneXY=null,sharedSceneUV=null; // Two transient 169-point Float32 tables, 2,704 CPU bytes.
      let vertices=new Float32Array(12*12*6*4),bufferCapacity=vertices.byteLength;gl.bufferData(gl.ARRAY_BUFFER,vertices.byteLength,gl.DYNAMIC_DRAW);
      // Scene alpha has its own stream; the original point/UV bytes stay exact.
      // The existing 16 MiB vertex ceiling also bounds this stream to 4 MiB.
      let vertexAlphas=forScene?new Float32Array(vertices.length/4):null,alphaCapacity=vertexAlphas?.byteLength||0;
      const point=gl.getAttribLocation(program,'point'),uv=gl.getAttribLocation(program,'uv');
      gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
      const alphaAttribute=forScene?gl.getAttribLocation(program,'vertexAlpha'):-1;
      if(forScene){
        if(alphaAttribute<0)throw new Error('Scene alpha attribute unavailable');
        alphaBuffer=gl.createBuffer();if(!alphaBuffer)throw new Error('Scene alpha buffer allocation failed');
        gl.bindBuffer(gl.ARRAY_BUFFER,alphaBuffer);gl.bufferData(gl.ARRAY_BUFFER,alphaCapacity,gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(alphaAttribute,1,gl.FLOAT,false,4,0);
        gl.disableVertexAttribArray(alphaAttribute);gl.vertexAttrib1f(alphaAttribute,1);
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      }
      const extent=gl.getUniformLocation(program,'extent'),hole=gl.getUniformLocation(program,'hole'),tint=gl.getUniformLocation(program,'tint'),opacity=gl.getUniformLocation(program,'opacity');
      const setOpacity=value=>{if(typeof gl.uniform1f==='function')gl.uniform1f(opacity,value);};setOpacity(1);
      gl.uniform1i(gl.getUniformLocation(program,'atlas'),0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      for(const image of images){const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}
      // Upload failures usually set a GL error instead of throwing. A failed
      // accelerator must leave the established Canvas rendering available.
      if(diagnosticGetError(gl,forScene?'scene':'legacy','initialAtlases')!==gl.NO_ERROR)throw new Error('Mesh atlas upload failed');
      // A few expressive poses overlap mesh cells. Match Canvas source-over
      // so a transparent later cell cannot punch a hole in an earlier one.
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);
      const sceneTextures=[],sceneTextureSizes=[],sceneAtlasSide=Math.min(maxTextureSize,2048),sourceTextures=new Map();let sourceTexturePixels=0;
      function releaseSceneImage(source){
        const entry=sourceTextures.get(source);if(!entry)return;
        gl.deleteTexture(entry.texture);const index=textures.indexOf(entry.texture);if(index>=0)textures.splice(index,1);
        sourceTextures.delete(source);sourceTexturePixels-=entry.width*entry.height;
      }
      function prepareSceneImages(commands){
        const required=new Map();for(const command of commands)if(command.type==='image'&&!command.atlas)required.set(command.source,command.registered);
        let changed=false;
        for(const [source,registered]of required){
          let entry=sourceTextures.get(source);
          if(entry&&(entry.width!==registered.width||entry.height!==registered.height)){releaseSceneImage(source);entry=null;}
          if(!entry){
            const pixels=registered.width*registered.height;
            while(sourceTextures.size>=SCENE_IMAGE_LIMIT||sourceTexturePixels+pixels>SCENE_IMAGE_PIXEL_LIMIT){
              const oldest=Array.from(sourceTextures.keys()).find(candidate=>!required.has(candidate));
              if(!oldest)throw new Error('Scene image texture budget exceeded');releaseSceneImage(oldest);
            }
            const texture=gl.createTexture();if(!texture)throw new Error('Scene image texture allocation failed');textures.push(texture);
            gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
            entry={texture,width:registered.width,height:registered.height,registered};sourceTexturePixels+=pixels;changed=true;sceneStats.sourceUploads++;allocationDiagnostics.imageCreates++;
          }else if(entry.registered!==registered){
            gl.bindTexture(gl.TEXTURE_2D,entry.texture);
            if(typeof gl.texSubImage2D==='function')gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
            else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
            entry.registered=registered;changed=true;sceneStats.sourceUploads++;allocationDiagnostics.imageUpdates++;
          }
          sourceTextures.delete(source);sourceTextures.set(source,entry);
        }
        for(const command of commands)if(command.type==='image'&&!command.atlas)command.texture=sourceTextures.get(command.source).texture;
        sceneStats.sourcePixels=sourceTexturePixels;return changed;
      }
      let maxSceneSide=maxTextureSize;
      if(gl.MAX_RENDERBUFFER_SIZE!==undefined){const limit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);if(Number.isFinite(limit)&&limit>0)maxSceneSide=Math.min(maxSceneSide,limit);}
      let lost=false,pendingErrorCheck=false,lastErrorCheck=null,batchMode=false,directWidth=CACHE_WIDTH,directHeight=CACHE_HEIGHT,sceneReady=false;
      if(canvas.addEventListener)canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
      function resize(width,height,cause='legacy'){
        if(canvas.width!==width||canvas.height!==height){const d=allocationDiagnostics;d.backingResizes++;if(forScene&&cause!=='scene')d.sceneLegacyResizes++;if(d.backingTransitions.length<12)d.backingTransitions.push({rig:forScene?'scene':'legacy',cause,frame:d.sceneFrames,fromWidth:canvas.width,fromHeight:canvas.height,width,height});}
        if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
      }
      function writeVertices(d,src,pts,cols,rows,unit,originX,originY,offset){
        for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
          const a=j*(cols+1)+i,b=a+1,e=a+cols+1;
          for(let vertex=0;vertex<6;vertex++){const index=vertex===0?a:vertex===1||vertex===3?b:vertex===4?e+1:e;const p=pts[index];vertices[offset++]=p.xy[0]*unit+originX;vertices[offset++]=p.xy[1]*unit+originY;vertices[offset++]=(src[0]+p.uv[0])/images[d.sheet].width;vertices[offset++]=(src[1]+p.uv[1])/images[d.sheet].height;}
        }
        return offset;
      }
      function drawMesh(d,n,rect,chilled,first,count,clear){
        // Keep the scene renderer's direct/prepared methods valid as well.
        if(forScene){gl.disableVertexAttribArray(alphaAttribute);gl.vertexAttrib1f(alphaAttribute,1);}
        gl.viewport(rect.x,canvas.height-rect.y-rect.height,rect.width,rect.height);gl.scissor(rect.x,canvas.height-rect.y-rect.height,rect.width,rect.height);if(clear)gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(extent,rect.width,rect.height);const cut=d.exclude?.[n],image=images[d.sheet];
        gl.uniform4f(hole,cut?cut[0]/image.width:0,cut?cut[1]/image.height:0,cut?(cut[0]+cut[2])/image.width:0,cut?(cut[1]+cut[3])/image.height:0);
        gl.uniform4f(tint,8/255,115/255,214/255,chilled?.42:0);
        setOpacity(1);
        gl.bindTexture(gl.TEXTURE_2D,textures[d.sheet]);gl.drawArrays(gl.TRIANGLES,first,count);
      }
      function paint(d,n,src,pts,cols,rows,rect,unit,originX,originY,chilled){
        const offset=writeVertices(d,src,pts,cols,rows,unit,originX,originY,0);
        gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices.subarray(0,offset));drawMesh(d,n,rect,chilled,0,offset/4,true);
      }
      // Keep a presented scene's backing store stable across the menu, card,
      // ash and legacy atlas draws. Those draws otherwise resize this Canvas
      // and copy its GPU contents into 2D while a compositor still owns it.
      const renderer={dispose:release,releaseSceneImage,reserveSceneVertices(count){
        if(!forScene||lost||gl.isContextLost())return null;
        if(!Number.isInteger(count)||count<=0||count>1024*1024)throw new Error('Scene vertex reservation exceeds budget');
        const length=Math.max(vertices.length,2**Math.ceil(Math.log2(count*4)));
        if(length>4*1024*1024)throw new Error('Scene mesh buffer exceeds budget');
        // CPU allocation precedes either GPU store mutation. A failed store
        // is disposed by the closed public wrapper, never presented.
        const nextVertices=vertices.length<length?new Float32Array(length):vertices;
        const nextAlphas=vertexAlphas.length<length/4?new Float32Array(length/4):vertexAlphas;
        const pointBytes=nextVertices.byteLength,alphaBytes=nextAlphas.byteLength;
        const changed=pointBytes>bufferCapacity||alphaBytes>alphaCapacity;
        if(changed){
          try{
            gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,pointBytes,gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER,alphaBuffer);gl.bufferData(gl.ARRAY_BUFFER,alphaBytes,gl.DYNAMIC_DRAW);
          }finally{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);}
          if(diagnosticGetError(gl,'scene','staticVertexReserve')!==gl.NO_ERROR)throw new Error('Scene vertex reservation allocation failed');
          if(lost||gl.isContextLost())return null;
          vertices=nextVertices;vertexAlphas=nextAlphas;bufferCapacity=pointBytes;alphaCapacity=alphaBytes;
        }
        return {changed,vertices:length/4,pointBytes,alphaBytes};
      },prepareSceneStorage(width,height,page){
        if(!forScene||lost||gl.isContextLost())return null;
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width>maxSceneSide||height>maxSceneSide||width*height>SCENE_PIXEL_LIMIT||
          !Number.isInteger(page.width)||!Number.isInteger(page.height)||page.width<=0||page.height<=0||page.width>sceneAtlasSide||page.height>sceneAtlasSide)throw new Error('Scene storage dimensions exceed budget');
        const previous=sceneTextureSizes[0],backingChanged=canvas.width!==width||canvas.height!==height;
        const pageChanged=!sceneTextures[0]||!previous||previous.width!==page.width||previous.height!==page.height;
        const changed=backingChanged||pageChanged;
        if(changed){
          // This is allocation only, never actor submission or presentation.
          resize(width,height,'scene');
          if(pageChanged){
            let texture=sceneTextures[0];
            if(!texture){texture=gl.createTexture();if(!texture)throw new Error('Scene texture allocation failed');sceneTextures[0]=texture;textures.push(texture);
              gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            }else gl.bindTexture(gl.TEXTURE_2D,texture);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,page);
          }
          gl.viewport(0,0,width,height);gl.scissor(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT);
          if(diagnosticGetError(gl,'scene','staticSceneStorage')!==gl.NO_ERROR)throw new Error('Scene storage allocation failed');
          if(lost||gl.isContextLost())return null;
          sceneTextureSizes[0]={width:page.width,height:page.height};
          // Storage is not a validated rendered scene. Original allocationPrecheck
          // must still run before the first actual actor draw, including after resize.
          sceneReady=false;
        }
        return {changed};
      },warmImages(commands){
        if(!forScene||lost||gl.isContextLost())return null;
        const before=allocationDiagnostics.imageCreates+allocationDiagnostics.imageUpdates;
        const changed=prepareSceneImages(commands);
        if(changed&&diagnosticGetError(gl,'scene','staticWarmup')!==gl.NO_ERROR)throw new Error('Scene static image allocation failed');
        if(lost||gl.isContextLost())return null;
        return allocationDiagnostics.imageCreates+allocationDiagnostics.imageUpdates-before;
      },maxFrameSide:Math.min(maxTextureSize,512),maxSceneSide,sceneAtlasSide,canScene(width,height){
        return typeof gl.uniform1f==='function'&&width<=maxSceneSide&&height<=maxSceneSide&&!lost&&!gl.isContextLost();
      },scene(commands,pages,width,height,target,present){
        if(lost||gl.isContextLost())return false;
        // The layer atlases remain CPU-backed. Each used page crosses into GL
        // once, before any meshes or layers are drawn, and there is only one
        // GL-to-Canvas copy at the end of this complete ordered scene.
        allocationDiagnostics.sceneFrames++;
        const allocationReasons={sceneNotReady:!sceneReady,sceneBackingResize:canvas.width!==width||canvas.height!==height,sceneImageUpload:false,cpuPageResize:false,cpuPageCreate:false,verticesGrow:false};
        let allocationChanged=allocationReasons.sceneNotReady||allocationReasons.sceneBackingResize;
        resize(width,height,'scene');batchMode=true;pendingErrorCheck=false;
        if(prepareSceneImages(commands)){allocationChanged=true;allocationReasons.sceneImageUpload=true;}
        for(let index=0;index<pages.length;index++){
          let texture=sceneTextures[index];
          const page=pages[index].canvas,previousSize=sceneTextureSizes[index];
          if(!previousSize||previousSize.width!==page.width||previousSize.height!==page.height){allocationChanged=true;allocationReasons.cpuPageResize=true;allocationDiagnostics.pageSizeChanges++;}
          sceneTextureSizes[index]={width:page.width,height:page.height};
          if(!texture){
            texture=gl.createTexture();if(!texture)throw new Error('Scene texture allocation failed');sceneTextures[index]=texture;textures.push(texture);
            gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pages[index].canvas);allocationChanged=true;allocationReasons.cpuPageCreate=true;allocationDiagnostics.pageCreates++;
          }else{
            gl.bindTexture(gl.TEXTURE_2D,texture);
            // A completed previous frame can still sample this store. Let the
            // driver replace the texture storage instead of modifying it in
            // place and waiting for the previous compositor submission.
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pages[index].canvas);
          }
        }
        for(const command of commands)if(command.atlas)command.texture=sceneTextures[command.atlas.page];
        const needed=commands.reduce((sum,command)=>sum+(command.type==='mesh'?command.mesh.cols*command.mesh.rows*6*4:24),0);
        if(needed>4*1024*1024)throw new Error('Scene mesh buffer exceeds budget');
        if(vertices.length<needed)vertices=new Float32Array(2**Math.ceil(Math.log2(needed)));
        if(forScene&&vertexAlphas.length<vertices.length/4)vertexAlphas=new Float32Array(vertices.length/4);
        let offset=0;
        for(const command of commands){
          command.vertexFirst=offset/4;
          if(command.type==='mesh'){
            const {d,n,mesh,matrix:m,size}=command,src=d.frames[n],image=images[d.sheet],unit=size/CACHE_SIZE;
            let shared=forScene&&command.sharedPoints&&generatedSceneMeshes.has(mesh)&&mesh.pts.length<=169&&typeof size==='number'&&Number.isFinite(size);
            const uv=shared?sceneUvDimensions(src,image):null;
            if(shared){
              if(!sharedSceneXY)sharedSceneXY=new Float32Array(169*2);
              if(uv&&!sharedSceneUV)sharedSceneUV=new Float32Array(169*2);
              for(let point=0;point<mesh.pts.length;point++){
                const p=mesh.pts[point],x=p.xy[0]*unit,y=p.xy[1]*unit;
                const px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;
                // Keep the original arithmetic path for exceptional non-finite values.
                if(!Number.isFinite(px)||!Number.isFinite(py)){shared=false;break;}
                sharedSceneXY[point*2]=px;sharedSceneXY[point*2+1]=py;
                if(uv){sharedSceneUV[point*2]=(uv.sx+p.uv[0])/uv.width;sharedSceneUV[point*2+1]=(uv.sy+p.uv[1])/uv.height;}
              }
            }
            for(let j=0;j<mesh.rows;j++)for(let i=0;i<mesh.cols;i++){
              const a=j*(mesh.cols+1)+i,b=a+1,e=a+mesh.cols+1;
              for(let vertex=0;vertex<6;vertex++){const index=vertex===0?a:vertex===1||vertex===3?b:vertex===4?e+1:e;
                const p=mesh.pts[index];
                if(shared){vertices[offset++]=sharedSceneXY[index*2];vertices[offset++]=sharedSceneXY[index*2+1];}
                else{const x=p.xy[0]*unit,y=p.xy[1]*unit;vertices[offset++]=m.a*x+m.c*y+m.e;vertices[offset++]=m.b*x+m.d*y+m.f;}
                if(shared&&uv){vertices[offset++]=sharedSceneUV[index*2];vertices[offset++]=sharedSceneUV[index*2+1];}
                else{vertices[offset++]=(src[0]+p.uv[0])/image.width;vertices[offset++]=(src[1]+p.uv[1])/image.height;}
              }
            }
          }else if(command.type==='image'){
            const {matrix:m,registered,sx,sy,sw,sh,dx,dy,dw,dh}=command;
            for(let vertex=0;vertex<6;vertex++){const u=vertex===1||vertex===3||vertex===4?1:0,v=vertex===2||vertex===4||vertex===5?1:0;
              const x=dx+dw*u,y=dy+dh*v;
              vertices[offset++]=m.a*x+m.c*y+m.e;vertices[offset++]=m.b*x+m.d*y+m.f;
              const atlas=command.atlas;
              vertices[offset++]=atlas?(atlas.x+sx+sw*u)/pages[atlas.page].canvas.width:(sx+sw*u)/registered.width;
              vertices[offset++]=atlas?(atlas.y+sy+sh*v)/pages[atlas.page].canvas.height:(sy+sh*v)/registered.height;
            }
          }else{
            const {left,top,width:w,height:h,x,y}=command;
            for(let vertex=0;vertex<6;vertex++){const u=vertex===1||vertex===3||vertex===4?1:0,v=vertex===2||vertex===4||vertex===5?1:0;
              vertices[offset++]=left+w*u;vertices[offset++]=top+h*v;vertices[offset++]=(x+w*u)/pages[command.page].canvas.width;vertices[offset++]=(y+h*v)/pages[command.page].canvas.height;
            }
          }
          command.vertexCount=offset/4-command.vertexFirst;
          if(forScene)vertexAlphas.fill(command.type==='layer'?1:command.alpha,command.vertexFirst,offset/4);
        }
        // Orphan the shared VBO once per scene, rather than waiting for an
        // earlier mesh before rewriting the same store for the next actor.
        if(vertices.byteLength>bufferCapacity||(forScene&&vertexAlphas.byteLength>alphaCapacity)){allocationChanged=true;allocationReasons.verticesGrow=true;}bufferCapacity=vertices.byteLength;
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,bufferCapacity,gl.DYNAMIC_DRAW);
        if(offset)gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices.subarray(0,offset));
        if(forScene){
          alphaCapacity=vertexAlphas.byteLength;gl.bindBuffer(gl.ARRAY_BUFFER,alphaBuffer);
          gl.bufferData(gl.ARRAY_BUFFER,alphaCapacity,gl.DYNAMIC_DRAW);
          if(offset)gl.bufferSubData(gl.ARRAY_BUFFER,0,vertexAlphas.subarray(0,offset/4));
          gl.enableVertexAttribArray(alphaAttribute);
          // Restore the shared vertex binding for direct/prepared follow-up.
          gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        }
        gl.viewport(0,0,width,height);gl.scissor(0,0,width,height);gl.uniform2f(extent,width,height);gl.clear(gl.COLOR_BUFFER_BIT);
        // Validate new uploads, VBO storage and the cleared framebuffer before
        // submitting actor draws. Growth OOM still declines before presentation.
        if(allocationChanged){
          allocationDiagnostics.sceneAllocationChecks++;for(const reason of Object.keys(allocationReasons))if(allocationReasons[reason])allocationDiagnostics.reasons[reason]++;
          if(diagnosticGetError(gl,forScene?'scene':'legacy','allocationPrecheck')!==gl.NO_ERROR)throw new Error('Scene GPU allocation failed');
        }
        // Uploads may change bindings. Start every scene with unknown state;
        // preserve exact values and submission order while skipping duplicates.
        let scissorX=NaN,scissorY=NaN,scissorW=NaN,scissorH=NaN,holeX=NaN,holeY=NaN,holeZ=NaN,holeW=NaN,tintR=NaN,tintG=NaN,tintB=NaN,tintA=NaN,liveOpacity=NaN,boundTexture=null;
        function sceneScissor(x,y,w,h){if(x!==scissorX||y!==scissorY||w!==scissorW||h!==scissorH){gl.scissor(x,y,w,h);scissorX=x;scissorY=y;scissorW=w;scissorH=h;}}
        function sceneHole(x,y,z,w){if(x!==holeX||y!==holeY||z!==holeZ||w!==holeW){gl.uniform4f(hole,x,y,z,w);holeX=x;holeY=y;holeZ=z;holeW=w;}}
        function sceneTint(r,g,b,a){if(r!==tintR||g!==tintG||b!==tintB||a!==tintA){gl.uniform4f(tint,r,g,b,a);tintR=r;tintG=g;tintB=b;tintA=a;}}
        function sceneOpacity(value){if(value!==liveOpacity){setOpacity(value);liveOpacity=value;}}
        function sceneTexture(texture){if(texture!==boundTexture){gl.bindTexture(gl.TEXTURE_2D,texture);boundTexture=texture;}}
        for(let commandIndex=0;commandIndex<commands.length;commandIndex++){
          const command=commands[commandIndex];
          const clip=command.type==='image'?command.clip:null;
          sceneScissor(clip?clip.x:0,clip?height-clip.y-clip.height:0,clip?clip.width:width,clip?clip.height:height);
          if(command.type==='mesh'){
            const cut=command.d.exclude?.[command.n],image=images[command.d.sheet];
            sceneHole(cut?cut[0]/image.width:0,cut?cut[1]/image.height:0,cut?(cut[0]+cut[2])/image.width:0,cut?(cut[1]+cut[3])/image.height:0);
            sceneTint(8/255,115/255,214/255,command.chilled?.42:0);sceneOpacity(forScene?1:command.alpha);
            sceneTexture(textures[command.d.sheet]);
          }else if(command.type==='image'){
            sceneHole(0,0,0,0);sceneTint(0,0,0,0);sceneOpacity(forScene?1:command.alpha);sceneTexture(command.texture);
          }else{
            sceneHole(0,0,0,0);sceneTint(0,0,0,0);sceneOpacity(1);sceneTexture(sceneTextures[command.page]);
          }
          let vertexCount=command.vertexCount;
          if(command.type==='image'){
            // Adjacent immutable slices already occupy adjacent VBO ranges.
            // Keep primitive order while submitting a bar's three slices once.
            // Texture, clip, mesh and CPU layer boundaries still end the run.
            // The scene shader keeps each primitive's alpha in its own vertices.
            while(commandIndex+1<commands.length){
              const next=commands[commandIndex+1],nextClip=next.clip;
              if(next.type!=='image'||next.texture!==command.texture||(!forScene&&next.alpha!==command.alpha)||nextClip.x!==clip.x||nextClip.y!==clip.y||nextClip.width!==clip.width||nextClip.height!==clip.height)break;
              vertexCount+=next.vertexCount;commandIndex++;
            }
          }
          gl.drawArrays(gl.TRIANGLES,command.vertexFirst,vertexCount);
        }
        if(lost||gl.isContextLost())return false;
        sceneReady=true;
        // Presentation belongs to the platform. A browser may expose this GL
        // Canvas directly; native callers retain the single Canvas2D copy.
        if(typeof present==='function')return present(canvas)!==false;
        target.save();try{
          target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;target.globalCompositeOperation='source-over';
          if('filter' in target)target.filter='none';if('shadowColor' in target)target.shadowColor='transparent';if('shadowBlur' in target)target.shadowBlur=0;
          if('shadowOffsetX' in target)target.shadowOffsetX=0;if('shadowOffsetY' in target)target.shadowOffsetY=0;
          if(canvas.width===target.canvas.width&&canvas.height===target.canvas.height)target.drawImage(canvas,0,0);
          else target.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,target.canvas.width,target.canvas.height);
        }finally{target.restore();}
        return true;
      },primeSubmittedProbe(){lastErrorCheck=null;},beginFrame(now){
        if(lost||gl.isContextLost())return false;
        if(!pendingErrorCheck)return true;
        // getError can wait for the driver, even at the next frame's start.
        // Probe submitted work at most once per second; context loss remains
        // guarded on every frame/page. Errors never leave a lasting empty cache.
        if(lastErrorCheck!==null&&now>=lastErrorCheck&&now-lastErrorCheck<1000)return true;
        pendingErrorCheck=false;lastErrorCheck=now;return diagnosticGetError(gl,forScene?'scene':'legacy','submittedProbe')===gl.NO_ERROR;
      },draw(c,d,n,src,pts,cols,rows,size){
        if(lost||gl.isContextLost())return false;
        pendingErrorCheck=true;
        const m=c.getTransform(),density=Math.min(4,Math.max(.5,Math.hypot(m.a,m.b)*size/CACHE_SIZE));
        const width=Math.ceil(CACHE_WIDTH*density),height=Math.ceil(CACHE_HEIGHT*density),unit=density*CACHE_SIZE/size;
        directWidth=Math.max(directWidth,width);directHeight=Math.max(directHeight,height);
        if(batchMode||canvas.width<width||canvas.height<height)resize(directWidth,directHeight);batchMode=false;
        paint(d,n,src,pts,cols,rows,{x:0,y:0,width,height},unit,width/2,CACHE_SIZE*1.25*density,false);
        c.drawImage(canvas,0,0,width,height,-width/unit/2,-size*1.25,width/unit,height/unit);return true;
      },prepare(entries,width,height,target){
        if(lost||gl.isContextLost())return false;
        pendingErrorCheck=true;
        // Bound the actual source as well as the packed page. A cropped blit
        // can still make a browser process the complete source canvas; large
        // atlases multiply that cost for every actor. Reuse this small backing
        // across pages, including after a larger direct/menu actor draw.
        const side=Math.min(maxTextureSize,512);resize(side,side);batchMode=true;
        const needed=entries.reduce((sum,entry)=>sum+entry.mesh.cols*entry.mesh.rows*6*4,0);
        if(vertices.length<needed)vertices=new Float32Array(2**Math.ceil(Math.log2(needed)));
        let offset=0;
        for(const entry of entries){
          const {d,n,mesh}=entry;entry.vertexFirst=offset/4;
          offset=writeVertices(d,d.frames[n],mesh.pts,mesh.cols,mesh.rows,entry.density,-entry.left,-entry.top,offset);
          entry.vertexCount=offset/4-entry.vertexFirst;
        }
        // Give this page a fresh buffer store before drawing. Rewriting one
        // small VBO between every actor can wait for the preceding GPU draw.
        // One upload retains every original vertex while avoiding that loop.
        gl.bufferData(gl.ARRAY_BUFFER,vertices.byteLength,gl.DYNAMIC_DRAW);bufferCapacity=vertices.byteLength;
        gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices.subarray(0,offset));
        gl.scissor(0,canvas.height-height,width,height);gl.clear(gl.COLOR_BUFFER_BIT);
        for(const entry of entries)drawMesh(entry.d,entry.n,entry,entry.chilled,entry.vertexFirst,entry.vertexCount,false);
        // Shader and texture setup is checked once above. Querying getError
        // after every page forces the browser to wait for all queued GPU work;
        // context loss is handled by its event and the next page's guard.
        if(lost)return false;
        // Snapshot only after every mesh is finished. Subsequent scene blits
        // read a stable 2D atlas instead of flushing a changed WebGL surface
        // once for each individual enemy, while keeping painter order intact.
        target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;target.globalCompositeOperation='copy';
        try{target.drawImage(canvas,0,0,width,height,0,0,width,height);}finally{target.globalCompositeOperation='source-over';}
        return true;
      }};
      if(forScene)gpuSceneRig=renderer;else gpuRig=renderer;
      return renderer;
    }catch(_){release();return null;}
  }
  function rigMesh(kind,n,size,rig,pose,cacheKey){
    const d=definitions[kind],src=d.frames[n];
    let mesh=cacheKey&&meshCache.get(cacheKey);
    if(mesh){meshCache.delete(cacheKey);meshCache.set(cacheKey,mesh);}
    else{
      rig=rig||channels(kind,pose);
      const sw=src[2],sh=src[3],geometry=frameGeometry(kind,pose,size),layout=meshLayout(kind,rig.bones),cols=layout.u.length-1,rows=layout.v.length-1,pts=[];
      // Bone angles do not change between mesh vertices. Evaluate their
      // trigonometry once per pose, preserving every original vertex and UV.
      const transforms=isEnemy(kind)&&!rig.bones.portrait?enemyTransforms(kind,rig.bones):null;
      for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
        const u=layout.u[i],v=layout.v[j],w=warpPoint(kind,u,v,rig.bones,geometry.aspect,transforms);
        pts.push({uv:[u*sw,v*sh],xy:[w[0]*geometry.width-geometry.anchor,(w[1]-1)*geometry.height]});
      }
      mesh={cols,rows,pts};generatedSceneMeshes.add(mesh);
      if(cacheKey){
        while(meshCache.size>=MESH_CACHE_LIMIT||meshPoints+pts.length>MESH_POINT_LIMIT){const oldest=meshCache.keys().next().value;meshPoints-=meshCache.get(oldest).pts.length;meshCache.delete(oldest);}
        meshCache.set(cacheKey,mesh);meshPoints+=pts.length;
      }
    }
    return mesh;
  }
  function renderRig(c,kind,n,size,rig,pose,cacheKey,mesh){
    const d=definitions[kind],src=d.frames[n],{cols,rows,pts}=mesh||rigMesh(kind,n,size,rig,pose,cacheKey);
    const gpu=gpuRenderer();
    if(gpu&&typeof c.getTransform==='function'){
      try{if(gpu.draw(c,d,n,src,pts,cols,rows,size))return;}catch(_){gpu.dispose();gpuRig=null;gpuAttempted=true;}
    }
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const a=j*(cols+1)+i,b=a+1,e=a+cols+1,d1=e+1;
      // Cover shared clip edges so enlarged menu characters do not show the
      // triangular mesh through their otherwise solid animation colour fills.
      [[a,b,e],[b,d1,e]].forEach(ids=>triangle(c,images[d.sheet],src,ids.map(k=>pts[k].uv),ids.map(k=>pts[k].xy),d.exclude?.[n],1));
    }
  }
  function drawAccents(ctx,kind,x,y,size,pose,s){
    if(kind==='shisa'&&pose.action==='produce'&&pose.produceAge>=0&&pose.produceAge<.65){
      const t=pose.produceAge/.65;
      ctx.save();ctx.globalAlpha*=(1-t)*.7*(pose.alpha??1);ctx.strokeStyle='#fff6dc';ctx.lineWidth=Math.max(1,size*.014);ctx.lineCap='round';
      for(let i=-1;i<=1;i++){const sx=x+i*size*.075,sy=y-size*(.35+t*.13);ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx+size*.025,sy-size*.04,sx,sy-size*.085);ctx.stroke();}
      ctx.restore();
    }
    if(pose.action==='attack'&&isEnemy(kind)){
      const markers=kind==='chimera'||kind==='drummer'?[.42]:[.14,.68];
      for(const marker of markers){const since=mod((s?.phase||0)-marker);if(since>.1)continue;
        ctx.save();ctx.globalAlpha=(1-since/.1)*.8*(pose.alpha??1);ctx.fillStyle='#b1cf78';
        for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(x-size*(.20+since+i*.024),y-size*(.38-since*(i+1)),size*.012,0,Math.PI*2);ctx.fill();}ctx.restore();
      }
    }
  }
  function motionKey(kind,n,pose,s){
    const transitioning=pose.previousAnimationState&&pose.previousAnimationState!==pose.animationState&&(pose.animationStateAge??1)<.2;
    // Plant idle follow-through depends on duration; enemy meshes still share
    // equal phases across walking speeds to keep crowded scenes inexpensive.
    const idleDuration=!isEnemy(kind)&&s?.name==='idle'&&s.clip.tracks.neck?s.duration:'';
    return [kind,n,s?.name,idleDuration,pose.action,pose.action==='produce'?Math.round((pose.produceAge??pose.phase??0)*120):'',Math.round((s?.phase||0)*(s?.name==='portrait'?360:180)),['pea','mushroom'].includes(s?.sourceKind)&&s?.name==='shoot'?Math.round((s?.bodyPhase||0)*120):'',transitioning?pose.previousAnimationState:'',transitioning?Math.round((pose.previousAnimationPhase||0)*100):'',transitioning?Math.round((pose.animationStateAge||0)*100):''].join(':');
  }
  function rasterBounds(mesh,density){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const point of mesh.pts){left=Math.min(left,point.xy[0]*density);right=Math.max(right,point.xy[0]*density);top=Math.min(top,point.xy[1]*density);bottom=Math.max(bottom,point.xy[1]*density);}
    // Match the previous surface's subpixel origin. The gutter also contains
    // the Canvas triangles' one-unit seam overlap at the highest density.
    const originX=Math.ceil(CACHE_WIDTH*density)/2,originY=CACHE_SIZE*1.25*density,gutter=Math.ceil(density)+2;
    left=Math.floor(left+originX)-gutter-originX;top=Math.floor(top+originY)-gutter-originY;
    right=Math.ceil(right+originX)+gutter-originX;bottom=Math.ceil(bottom+originY)+gutter-originY;
    // Small allocation buckets avoid resizing a recycled Canvas for every
    // one-pixel change in a continuously moving mesh; added pixels are clear.
    return {left,top,width:Math.ceil((right-left)/16)*16,height:Math.ceil((bottom-top)/16)*16};
  }
  function paintFramePage(index){
    const page=framePages[index],gpu=gpuRenderer();if(!page||!gpu)return false;
    if(framePage===index)return true;
    try{
      if(!frameCanvas){frameCanvas=canvasFactory();frameContext=frameCanvas.getContext('2d');}
      if(frameCanvas.width<page.width)frameCanvas.width=page.width;
      if(frameCanvas.height<page.height)frameCanvas.height=page.height;
      if(!gpu.prepare(page.entries,page.width,page.height,frameContext))return false;
      framePage=index;frameStats.copies++;frameStats.pixels+=page.width*page.height;
      return true;
    }catch(_){gpu.dispose();gpuRig=null;gpuAttempted=true;frameEntries.clear();framePages=[];framePage=-1;return false;}
  }
  function prepareFrame(ctx,actors){
    frameEntries.clear();framePages=[];framePage=-1;frameStats={actors:0,meshes:0,copies:0,pixels:0,pages:0};
    if(!ready||!data||!canvasFactory||!gpuFactory||!Array.isArray(actors)||!actors.length)return false;
    const gpu=gpuRenderer();if(!gpu)return false;
    const side=gpu.maxFrameSide;let entries=[],x=0,y=0,rowHeight=0,usedWidth=0,meshes=0;
    const finishPage=()=>{
      if(!entries.length)return;
      framePages.push({entries,width:Math.min(side,Math.ceil(usedWidth/128)*128),height:Math.min(side,Math.ceil((y+rowHeight)/128)*128)});
      entries=[];x=0;y=0;rowHeight=0;usedWidth=0;
    };
    for(const actor of actors){
      const {kind,size}=actor,pose=actor.pose||{},d=definitions[kind];
      if(!d||pose.card||pose.action==='death'||!Number.isFinite(size)||size<=0)continue;
      frameStats.actors++;
      const n=sampleFrame(kind,pose),s=animation(kind,pose),meshKey=motionKey(kind,n,pose,s),chilled=isEnemy(kind)&&!!(pose.chilled||pose.slow);
      const resolution=cacheResolution(ctx,size*explosivePose(kind,pose).scale),key=resolution+':'+meshKey+':'+(chilled?'ice':'');
      if(cache.has(key))continue;
      let planned=frameEntries.get(key),existing=planned&&planned.entries[planned.entries.length-1];
      if(existing&&existing.page===framePages.length){planned.entries.push(existing);continue;}
      const density=resolution/CACHE_SIZE,mesh=rigMesh(kind,n,CACHE_SIZE,null,pose,meshKey);
      const {left,top,width,height}=rasterBounds(mesh,density);
      if(width>side||height>side||!Number.isFinite(width+height))continue;
      if(x+width>side){x=0;y+=rowHeight;rowHeight=0;}
      // At high DPR a crowd may exceed one texture. Stream ordered pages
      // through one reusable atlas instead of forcing each overflowing actor
      // back to a separate GPU readback. Painter order remains unchanged.
      if(y+height>side)finishPage();
      const entry={key,d,n,mesh,chilled,density,left,top,width,height,x,y,page:framePages.length};
      entries.push(entry);meshes++;
      // A repeated pose on a later page must be packed into that page too.
      // Otherwise drawing the later actor seeks back to an earlier page and
      // re-renders its entire WebGL crowd for another synchronous snapshot.
      if(!planned){planned={entries:[],cursor:0};frameEntries.set(key,planned);}planned.entries.push(entry);
      x+=width;usedWidth=Math.max(usedWidth,x);rowHeight=Math.max(rowHeight,height);
    }
    finishPage();frameStats.meshes=meshes;frameStats.pages=framePages.length;
    if(!framePages.length)return false;
    if(paintFramePage(0))return true;
    frameEntries.clear();framePages=[];framePage=-1;return false;
  }
  function finishFrame(){frameEntries.clear();framePages=[];framePage=-1;}
  function draw(ctx,kind,x,y,size,pose={}){
    const d=definitions[kind];if(!ready||!d)return false;
    if(pose.action==='death'&&!pose.card&&isEnemy(kind))return drawDeath(ctx,kind,x,y,size,pose);
    const chilled=isEnemy(kind)&&!pose.card&&!!(pose.chilled||pose.slow);
    if(data&&!pose.card){
      const geometry=frameGeometry(kind,pose,CACHE_SIZE),n=geometry.frame,s=animation(kind,pose);
      const meshKey=motionKey(kind,n,pose,s);
      const key=meshKey+':'+(chilled?'ice':'');
      const charge=explosivePose(kind,pose);
      ctx.save();try{ctx.translate(x+charge.shakeX,y+charge.shakeY);ctx.scale(charge.scale,charge.scale);if(pose.alpha!==undefined)ctx.globalAlpha*=pose.alpha;
      if(activeCapture&&ctx===activeCapture.context){
        activeCapture.mesh(d,n,rigMesh(kind,n,CACHE_SIZE,null,pose,meshKey),size,chilled);
      }else{
      const resolution=cacheResolution(ctx,size),planned=frameEntries.get(resolution+':'+key),prepared=planned&&planned.entries[planned.cursor++];
      if(prepared&&paintFramePage(prepared.page)){
        const ratio=size/CACHE_SIZE/prepared.density;
        ctx.drawImage(frameCanvas,prepared.x,prepared.y,prepared.width,prepared.height,prepared.left*ratio,prepared.top*ratio,prepared.width*ratio,prepared.height*ratio);
      }else if(canvasFactory){
        const mesh=rigMesh(kind,n,CACHE_SIZE,null,pose,meshKey),bounds=rasterBounds(mesh,resolution/CACHE_SIZE);
        const entry=cachedCanvas(key,resolution,(c,canvas,density)=>{
          c.save();c.translate(-bounds.left/density,-bounds.top/density);renderRig(c,kind,n,CACHE_SIZE,null,pose,meshKey,mesh);c.restore();
          if(chilled){
            // Tint only the actor's opaque pixels. Keeping half of the source
            // color retains the eyes, linework and shading on every moving cel.
            c.save();c.globalCompositeOperation='source-atop';c.globalAlpha=.42;
            c.fillStyle='#0873d6';c.fillRect(0,0,canvas.width/density,canvas.height/density);c.restore();
          }
        },bounds);
        const ratio=size/CACHE_SIZE/entry.density;ctx.drawImage(entry.canvas,entry.left*ratio,entry.top*ratio,entry.canvas.width*ratio,entry.canvas.height*ratio);
      }else renderRig(ctx,kind,n,size,channels(kind,pose),pose);
      }
      }finally{ctx.restore();}drawAccents(ctx,kind,x,y,size,pose,s);return true;
    }
    const n=sampleFrame(kind,pose),f=d.frames[n];
    const [sx,sy,sw,sh]=f;
    const scale=Math.min(size*.94/d.maxW,size*.97/d.maxH);
    const dx=(sx-d.anchors[n])*scale,dy=-sh*scale;
    const t=pose.time||0;
    const move=pose.action==='walk'?Math.abs(Math.sin(t*(pose.slow?4:7)))*1.8:0;
    const lunge=pose.action==='attack'&&n===4?-size*.035:0;
    ctx.save();try{ctx.translate(x+lunge+(pose.action==='hurt'?2:0),y-move);
    if(pose.alpha!==undefined)ctx.globalAlpha*=pose.alpha;
    const hole=d.exclude&&d.exclude[n];
    if(hole){
      // Exclude the neighboring cel's tiny tail/claw intrusion without altering PNG.
      const hx=(hole[0]-d.anchors[n])*scale,hy=dy+(hole[1]-sy)*scale,hw=hole[2]*scale,hh=hole[3]*scale;
      ctx.beginPath();ctx.rect(dx,dy,sw*scale,sh*scale);
      ctx.moveTo(hx,hy);ctx.lineTo(hx,hy+hh);ctx.lineTo(hx+hw,hy+hh);ctx.lineTo(hx+hw,hy);ctx.closePath();ctx.clip();
    }
    ctx.drawImage(images[d.sheet],sx,sy,sw,sh,dx,dy,sw*scale,sh*scale);
    }finally{ctx.restore();}return true;
  }

  // A failed unrelated atlas must not resurrect an obsolete character tile.
  // Draw the actor's own loaded source cel without relying on global readiness
  // or the mesh renderer, which may itself have failed on this platform.
  function drawFallback(ctx,kind,x,y,size,pose={}){
    const d=definitions[kind];
    if(!d||!sheetReady[d.sheet]||![x,y,size].every(Number.isFinite)||size<=0)return false;
    const src=d.frames[0],g=frameGeometry(kind,{frame:0},size);
    ctx.save();try{
      if(pose.alpha!==undefined)ctx.globalAlpha*=pose.alpha;
      const hole=d.exclude&&d.exclude[0];
      if(hole){
        const scale=g.width/src[2],hx=x+(hole[0]-src[0])*scale-g.anchor,hy=y-g.height+(hole[1]-src[1])*scale,hw=hole[2]*scale,hh=hole[3]*scale;
        ctx.beginPath();ctx.rect(x-g.anchor,y-g.height,g.width,g.height);
        ctx.moveTo(hx,hy);ctx.lineTo(hx,hy+hh);ctx.lineTo(hx+hw,hy+hh);ctx.lineTo(hx+hw,hy);ctx.closePath();ctx.clip();
      }
      ctx.drawImage(images[d.sheet],...src,x-g.anchor,y-g.height,g.width,g.height);
    }finally{ctx.restore();}
    return true;
  }

  // Only an explicitly opted-in, nonplaying Native caller requests this work.
  // Paint the unchanged drawBurned into a throwaway 1-pixel target: the exact
  // original ash cache, source cels, density tier and GL/Canvas fallback remain.
  function warmBurned(plan,options={}){
    const fail=reason=>({ok:false,reason,sources:0,pixels:0,created:0});
    if(options.nativeStatic!==true||!['ready','paused','won','lost'].includes(options.status)||!ready||!canvasFactory||pendingScene||activeCapture)return fail('Burned warmup requires idle Native');
    let target=null;const originalKeys=new Set(cache.keys());
    try{
      if(!Array.isArray(plan)||!plan.length||plan.length>9)throw new Error('Burned warmup plan invalid');
      const m=options.transform;
      if(!m||![m.a,m.b,m.c,m.d].every(Number.isFinite)||Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))<=0)throw new Error('Burned warmup transform invalid');
      const measure={getTransform:()=>m},items=new Map();let pixels=0,created=0;
      for(const item of plan){
        if(!item||typeof item.kind!=='string'||!isEnemy(item.kind)||!definitions[item.kind]||!Number.isFinite(item.size)||item.size<=0)throw new Error('Burned warmup item invalid');
        const resolution=cacheResolution(measure,item.size),key=resolution+':ash:'+item.kind;
        if(items.has(key))continue;
        const density=resolution/CACHE_SIZE,width=Math.ceil(CACHE_WIDTH*density),height=Math.ceil(CACHE_HEIGHT*density);
        const n=width*height;pixels+=n;items.set(key,{kind:item.kind,size:item.size,width,height});
      }
      // Same 2 MiPixel whole-plan bound as the existing Native static warmup.
      // The original global 16 MiPixel / 384-entry cache and its LRU stay intact.
      if(pixels+1>2*1024*1024)throw new Error('Burned warmup pixel budget exceeded');
      target=canvasFactory();if(!target)throw new Error('Burned warmup Canvas unavailable');
      target.width=1;target.height=1;const c=target.getContext('2d');
      if(!c||typeof c.setTransform!=='function')throw new Error('Burned warmup context unavailable');
      c.setTransform(m.a,m.b,m.c,m.d,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
      for(const [key,item]of items){
        if(!cache.has(key))created++;
        if(!drawBurned(c,item.kind,0,0,item.size,0))throw new Error('Burned warmup draw unavailable');
        const entry=cache.get(key);
        if(!entry||entry.canvas.width!==item.width||entry.canvas.height!==item.height)throw new Error('Burned warmup cache unavailable');
      }
      // Do not carry first-use submitted work into a battle callback. The
      // original beginFrame still performs getError and all failure cleanup.
      if(gpuRig&&created)gpuRig.primeSubmittedProbe();
      if(created&&!beginFrame())throw new Error('Burned warmup GPU validation failed');
      if(Array.from(items.keys()).some(key=>!cache.has(key)))throw new Error('Burned warmup cache evicted');
      return {ok:true,reason:'',sources:items.size,pixels,created};
    }catch(error){
      for(const [key,entry]of cache)if(!originalKeys.has(key)){
        cache.delete(key);cachePixels-=entry.canvas.width*entry.canvas.height;entry.canvas.width=0;entry.canvas.height=0;
      }
      return fail(String(error.message||error));
    }finally{if(target){target.width=0;target.height=0;}}
  }

  // Explosion victims keep their recognizable outline, hold briefly, then
  // crumble vertically into ash instead of replaying an ordinary walk/death.
  function drawBurned(ctx,kind,x,y,size,age,duration=1.1){
    if(!ready||!definitions[kind]||age>=duration)return false;
    if(!canvasFactory)return draw(ctx,kind,x,y,size,{action:'hurt',time:0,alpha:Math.max(0,1-age/duration)});
    const key='ash:'+kind;
    const entry=cachedCanvas(key,cacheResolution(ctx,size),(c,canvas,density)=>{
      const pose={action:'hurt',baseAction:'idle',time:0,overridePhase:0};
      c.save();c.translate(canvas.width/density/2,CACHE_SIZE*1.25);renderRig(c,kind,sampleFrame(kind,pose),CACHE_SIZE,channels(kind,pose),pose);c.restore();
      c.globalCompositeOperation='source-in';c.fillStyle='#382d29';c.fillRect(0,0,canvas.width/density,canvas.height/density);c.globalCompositeOperation='source-over';
    });
    const canvas=entry.canvas,ratio=size/CACHE_SIZE/entry.density,left=x-canvas.width*ratio/2,top=y-size*1.25;
    ctx.save();
    const opacity=ctx.globalAlpha,collapse=smooth((age-.38)/.59),edge=y-size*1.04*(1-collapse);
    ctx.save();ctx.beginPath();ctx.moveTo(left,y+size*.1);ctx.lineTo(left,edge);
    for(let i=0;i<=16;i++)ctx.lineTo(left+canvas.width*ratio*i/16,edge+Math.sin(i*7.13)*size*.025*collapse);
    ctx.lineTo(left+canvas.width*ratio,y+size*.1);ctx.closePath();ctx.clip();
    ctx.globalAlpha=opacity*(1-smooth((collapse-.75)/.25));
    ctx.drawImage(canvas,left,top,canvas.width*ratio,canvas.height*ratio);ctx.restore();
    if(collapse>0&&collapse<1)for(let i=0;i<12;i++){
      const drift=(age*1.7+i*.13)%1;
      ctx.globalAlpha=opacity*(1-collapse)*(1-drift)*.8;ctx.fillStyle='#514238';ctx.beginPath();
      ctx.arc(x+Math.sin(i*11.7)*size*.30+Math.sin(i)*drift*12,Math.min(y-2,edge+drift*size*.21),1.5+(1-drift)*size*.014,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<5;i++){
      const t=clamp((age-.18-i*.07)/.72,0,1);if(t<=0||t>=1)continue;
      ctx.globalAlpha=opacity*(1-t)*.45;ctx.fillStyle='#7d7264';ctx.beginPath();ctx.arc(x+Math.sin(i*7)*size*.15+Math.sin(i+age*3)*t*9,y-size*(.55+t*.5),size*(.035+t*.055),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();return true;
  }

  // Candidate-only rendering replica. Capture the identical painter stream in
  // the Worker; only its packet receiver owns the retained presentation GL.
  let packetPlatform=null,packetPresenter=null,nextPacketMeta=null,lastPacketExport=null,packetExportBusy=false,packetEpoch=0;
  let packetCompiler=retained&&retained.createCompiler(),packetIds=new WeakMap(),packetVersions=new WeakMap(),packetSerial=0,packetSent=new Map(),packetScope=null;
  function configureScenePacket(platform){
    if(!platform||typeof platform.createMeshCanvas!=='function')throw new Error('Packet platform requires createMeshCanvas');
    if(packetPresenter)packetPresenter.dispose();packetPresenter=null;packetPlatform=platform;return true;
  }
  function resetScenePackets(){
    packetEpoch++;nextPacketMeta=null;lastPacketExport=null;packetExportBusy=false;
    if(packetCompiler)packetCompiler.reset();packetSent.clear();packetScope=null;
    if(packetPresenter)packetPresenter.dispose();packetPresenter=null;
  }
  function beginScenePacket(meta){
    if(!retained||!packetCompiler||pendingScene||nextPacketMeta||packetExportBusy)throw new Error('Scene packet capture is unavailable/busy');
    if(!meta||typeof meta.scope!=='string'||!meta.scope||!Number.isSafeInteger(meta.sequence)||meta.sequence<0||typeof meta.view!=='string')throw new Error('Invalid scene packet identity');
    if(packetScope!==meta.scope){packetCompiler.reset();packetSent.clear();packetScope=meta.scope;}
    lastPacketExport=null;nextPacketMeta={scope:meta.scope,sequence:meta.sequence,view:meta.view};return true;
  }
  function exportScenePacket(){
    if(!lastPacketExport)return Promise.reject(new Error('Scene packet capture did not finish: '+JSON.stringify({ready,pending:!!pendingScene,next:!!nextPacketMeta,busy:packetExportBusy,stats:sceneStats})));
    const result=lastPacketExport;lastPacketExport=null;return result;
  }
  function importScenePacket(packet){
    const textures=packet&&Array.isArray(packet.sources)?packet.sources.filter(s=>s.source):[];
    if(!packetPlatform||!retained){for(const s of textures)if(s.source&&typeof s.source.close==='function')s.source.close();throw new Error('Scene packet platform not configured');}
    if(!packetPresenter){try{packetPresenter=retained.createPacketPresenter(packetPlatform);}catch(error){for(const s of textures)if(s.source&&typeof s.source.close==='function')s.source.close();throw error;}}
    return packetPresenter.import({packet,textures});
  }
  function replayScenePacket(token,{blend=1,present}={}){return !!packetPresenter&&packetPresenter.replay(token,blend,present);}
  function packetSourceIdentity(source,registered){
    let id=packetIds.get(source);if(!id){id='static:'+ ++packetSerial;packetIds.set(source,id);}
    let v=packetVersions.get(registered);if(!v){v=String(++packetSerial);packetVersions.set(registered,v);}
    return {id,version:v,width:registered.width,height:registered.height,source};
  }
  function packetSceneRenderer(meta){
    return {sceneAtlasSide:2048,maxSceneSide:8192,canScene:(w,h)=>w<=8192&&h<=8192&&w*h<=SCENE_PIXEL_LIMIT,
      scene(commands,pages,width,height,target,present){
        captureStage('motionBuildStreamsStart');
        const count=commands.reduce((n,c)=>n+(c.type==='mesh'?c.mesh.cols*c.mesh.rows*6:6),0);
        if(count>retained.MAX_VERTICES)throw new Error('Scene packet vertex budget exceeded');
        const vertices=new Float32Array(count*4),alphas=new Float32Array(count),descriptors=[],manifest=new Map();let offset=0;
        const dynamicVersion=meta.scope+':'+meta.sequence,epoch=packetEpoch;
        function add(record){const old=manifest.get(record.id);if(old&&(old.version!==record.version||old.source!==record.source))throw new Error('Scene packet source changed');manifest.set(record.id,record);return record;}
        function sheet(index){const image=images[index];return add({id:'sheet:'+index,version:'load:'+packetEpoch,width:image.width,height:image.height,source:image});}
        function page(index){const source=pages[index].canvas;return add({id:'page:'+index,version:dynamicVersion,width:source.width,height:source.height,source});}
        for(const command of commands){
          const first=offset/4;let texture,signature,hole=[0,0,0,0],tint=[0,0,0,0],clip=null;
          if(command.type==='mesh'){
            const {d,n,mesh,matrix:m,size}=command,src=d.frames[n],image=images[d.sheet],unit=size/CACHE_SIZE;
            texture=sheet(d.sheet);const cut=d.exclude?.[n];
            hole=cut?[cut[0]/image.width,cut[1]/image.height,(cut[0]+cut[2])/image.width,(cut[1]+cut[3])/image.height]:hole;
            tint=[8/255,115/255,214/255,command.chilled?.42:0];
            signature=JSON.stringify([d.sheet,n,mesh.cols,mesh.rows,mesh.pts.length,size,src,cut||null,!!command.chilled,texture.version]);
            let shared=command.sharedPoints&&generatedSceneMeshes.has(mesh)&&mesh.pts.length<=169&&typeof size==='number'&&Number.isFinite(size),xy=null,uvValues=null;
            const uv=shared?sceneUvDimensions(src,image):null;
            if(shared){
              xy=new Float32Array(mesh.pts.length*2);if(uv)uvValues=new Float32Array(mesh.pts.length*2);
              for(let point=0;point<mesh.pts.length;point++){
                const p=mesh.pts[point],x=p.xy[0]*unit,y=p.xy[1]*unit,px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;
                if(!Number.isFinite(px)||!Number.isFinite(py)){shared=false;break;}
                xy[point*2]=px;xy[point*2+1]=py;
                if(uv){uvValues[point*2]=(uv.sx+p.uv[0])/uv.width;uvValues[point*2+1]=(uv.sy+p.uv[1])/uv.height;}
              }
            }
            for(let j=0;j<mesh.rows;j++)for(let i=0;i<mesh.cols;i++){
              const a=j*(mesh.cols+1)+i,b=a+1,e=a+mesh.cols+1;
              for(let vertex=0;vertex<6;vertex++){
                const index=vertex===0?a:vertex===1||vertex===3?b:vertex===4?e+1:e,p=mesh.pts[index];
                if(shared){vertices[offset++]=xy[index*2];vertices[offset++]=xy[index*2+1];}
                else {const x=p.xy[0]*unit,y=p.xy[1]*unit;vertices[offset++]=m.a*x+m.c*y+m.e;vertices[offset++]=m.b*x+m.d*y+m.f;}
                if(shared&&uv){vertices[offset++]=uvValues[index*2];vertices[offset++]=uvValues[index*2+1];}
                else {vertices[offset++]=(src[0]+p.uv[0])/image.width;vertices[offset++]=(src[1]+p.uv[1])/image.height;}
              }
            }
          }else if(command.type==='image'){
            const {matrix:m,registered,sx,sy,sw,sh,dx,dy,dw,dh}=command;
            const identity=packetSourceIdentity(command.source,registered);texture=command.atlas?page(command.atlas.page):add(identity);clip={...command.clip};
            signature=JSON.stringify([identity.id,identity.version,registered.width,registered.height,sx,sy,sw,sh,dw,dh]);
            for(let vertex=0;vertex<6;vertex++){
              const u=vertex===1||vertex===3||vertex===4?1:0,v=vertex===2||vertex===4||vertex===5?1:0,x=dx+dw*u,y=dy+dh*v,atlas=command.atlas;
              vertices[offset++]=m.a*x+m.c*y+m.e;vertices[offset++]=m.b*x+m.d*y+m.f;
              vertices[offset++]=atlas?(atlas.x+sx+sw*u)/pages[atlas.page].canvas.width:(sx+sw*u)/registered.width;
              vertices[offset++]=atlas?(atlas.y+sy+sh*v)/pages[atlas.page].canvas.height:(sy+sh*v)/registered.height;
            }
          }else{
            const {left,top,width:w,height:h,x,y}=command;texture=page(command.page);signature='raster:'+dynamicVersion;
            for(let vertex=0;vertex<6;vertex++){
              const u=vertex===1||vertex===3||vertex===4?1:0,v=vertex===2||vertex===4||vertex===5?1:0;
              vertices[offset++]=left+w*u;vertices[offset++]=top+h*v;vertices[offset++]=(x+w*u)/pages[command.page].canvas.width;vertices[offset++]=(y+h*v)/pages[command.page].canvas.height;
            }
          }
          const vertexCount=offset/4-first;alphas.fill(command.type==='layer'?1:command.alpha,first,offset/4);
          descriptors.push({type:command.type,textureId:texture.id,signature,first,count:vertexCount,hole,tint,clip,owner:command.owner||null});
        }
        captureStage('motionBuildStreamsEnd',{vertices:count,commands:commands.length,pages:pages.length});
        captureStage('motionCompilerStart');
        const records=Array.from(manifest.values()),packet=packetCompiler.compile({...meta,width,height,vertices,alphas,commands:descriptors,sources:records.map(({source,...r})=>r)});
        captureStage('motionCompilerEnd');
        const bitmapFactory=packetPlatform&&packetPlatform.createImageBitmap||globalThis.createImageBitmap;
        if(typeof bitmapFactory!=='function')throw new Error('ImageBitmap snapshot is unavailable');
        const updates=records.filter(r=>packetSent.get(r.id)!==r.version),bitmaps=[];packetExportBusy=true;
        // AllSettled initiates every bounded snapshot before the capture source
        // can be reused; retirement is held until all of them finish.
        captureStage('motionTextureSnapshotsLaunchStart',{sources:records.length,updatedSources:updates.length});
        lastPacketExport=Promise.allSettled(updates.map(async record=>{
          const bitmap=await bitmapFactory.call(packetPlatform&&packetPlatform.createImageBitmap?packetPlatform:globalThis,record.source);
          if(!bitmap||bitmap.width!==record.width||bitmap.height!==record.height)throw new Error('Invalid scene bitmap snapshot');
          bitmaps.push(bitmap);packet.sources.find(s=>s.id===record.id).source=bitmap;
        })).then(results=>{
          const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
          if(epoch!==packetEpoch)throw new Error('Scene packet reset during snapshot');
          packetSent=new Map(records.map(r=>[r.id,r.version]));
          return {packet,bitmaps,transferables:[...retained.transferables(packet),...bitmaps]};
        }).catch(error=>{for(const bitmap of bitmaps)if(typeof bitmap.close==='function')bitmap.close();if(epoch===packetEpoch){packetCompiler.reset();packetSent.clear();}throw error;})
          .finally(()=>{if(epoch===packetEpoch)packetExportBusy=false;});
        captureStage('motionTextureSnapshotsLaunchEnd',{legacyRig:!!gpuRig,legacySceneRig:!!gpuSceneRig,getErrorCalls:allocationDiagnostics.getErrorCalls,getErrorMs:allocationDiagnostics.getErrorMs,legacyCacheEntries:cache.size});
        if(typeof present==='function'&&present({width,height,scenePacket:true})===false)return false;
        return true;
      },dispose(){}};
  }

  const api={files,sources,aliases,definitions,load,beginScenePacket,exportScenePacket,configureScenePacket,importScenePacket,replayScenePacket,resetScenePackets,draw,drawFallback,drawBurned,warmBurned,beginFrame,beginScene,registerSceneImage,unregisterSceneImage,createSceneImageRetirement,sceneImageRetirementVersion:1,warmSceneImages,reserveSceneVertices,prepareSceneStorage,prepareFrame,finishFrame,get packetStats(){return packetPresenter?packetPresenter.stats:null;},get frameStats(){return {...frameStats};},get sceneStats(){return {...sceneStats,allocationDiagnostics:diagnosticSnapshot(),warmup:{...sceneWarmup},vertexReserve:{...sceneVertexReserve},storageWarmup:{...sceneStorageWarmup}};},scenePixelLimit:SCENE_PIXEL_LIMIT,sceneImagePixelLimit:SCENE_IMAGE_PIXEL_LIMIT,deathPose,explosivePose,poseFor,attachmentPoint,sampleFrame,frameGeometry,animation,channels,warpPoint,meshLayout,sampleTrack,samplePlantTrack,get ready(){return ready;},frameCount:Object.values(definitions).reduce((sum,d)=>sum+d.frames.length,0),mode:'pvz-reanim-retarget',data,get cacheSize(){return cache.size;},get cachePixels(){return cachePixels;},cachePixelLimit:CACHE_PIXEL_LIMIT};
  return api;
});
