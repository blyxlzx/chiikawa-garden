/* Shared Canvas 2D runtime for WeChat/Douyin mini-games and the browser adapter.
 * No DOM, HTML audio, network fetch, or browser-only globals are used here.
 * create({ platform, engine, motion?, assetRoot:'assets/', autoStart:true })
 * platform touch coordinates and window/safe-area sizes are logical pixels.
 */
(function (root, factory) {
  const collection = typeof module === 'object' && module.exports ? require('./sun-collection.js') : root.GardenSunCollection;
  const combat = typeof module === 'object' && module.exports ? require('./combat-effects.js') : root.GardenCombatEffects;
  const terrain = typeof module === 'object' && module.exports ? require('./terrain-renderer.js') : root.GardenTerrain;
  const lilies = typeof module === 'object' && module.exports ? require('./lily-renderer.js') : root.GardenLilies;
  const saves = typeof module === 'object' && module.exports ? require('./save-library.js') : root.GardenSaveLibrary;
  const challenges = typeof module === 'object' && module.exports ? require('./challenge-modes.js') : root.GardenChallenges;
  const layout = typeof module === 'object' && module.exports ? require('./battle-layout.js') : root.GardenBattleLayout;
  const feedback = typeof module === 'object' && module.exports ? require('./combat-feedback.js') : root.GardenCombatFeedback;
  const tutorials = typeof module === 'object' && module.exports ? require('./tutorial.js') : root.GardenTutorial;
  const reliableImages = typeof module === 'object' && module.exports ? require('./resilient-images.js') : root.GardenResilientImages;
  const autoSaves = typeof module === 'object' && module.exports ? require('./autosave-history.js') : root.GardenAutosaveHistory;
  const director = typeof module === 'object' && module.exports ? require('./run-director.js') : root.GardenRunDirector;
  const achievements = typeof module === 'object' && module.exports ? require('./achievements.js') : root.GardenAchievements;
  const workerBridge = typeof module === 'object' && module.exports ? require('./endless-worker-bridge.js') : root.GardenEndlessWorkerBridge;
  const nativeRestoreDependencies=typeof module === 'object' && module.exports ? require('./prepared-restore-dependencies.js') : root.GardenPreparedRestoreDependencies;
  const api = factory(root, collection, combat, terrain, lilies, saves, challenges, layout, feedback, tutorials, reliableImages, autoSaves, director, achievements, workerBridge, nativeRestoreDependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenNative = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global, collectionModule, combatEffects, terrainRenderer, lilyRenderer, saveLibrary, challengeModule, battleLayout, combatFeedback, tutorialModule, reliableImages, autoSaves, runDirector, achievementModule, workerBridgeModule, nativeRestoreDependencies) {
  'use strict';
  const W = 1280, H = 960, BATTLE_WIDTH = 1472;
  const GRID = Object.freeze({ x:64, y:128, w:128, h:160 });
  const ORDER = ['sunflower','pea','mushroom','mine','cherry','wallnut','snowpea','repeater','starfruit','stormreed'];
  const HUD = Object.freeze({bank:Object.freeze({x:16,y:0,w:992,h:139.2}),cardX:150.4,cardY:12.8,cardW:80,cardH:112,cardStep:84,shovelX:1008,speed:Object.freeze({x:1134,y:6,w:134,h:72})});
  const INDEX = {sunflower:0,pea:1,mushroom:2,mine:3,cherry:4,momonga:5,anoko:6,chimera:7,mascot:8};
  const BOUNDS = [[54,15,327,415],[458,103,388,326],[894,77,343,349],[25,496,366,312],[442,449,385,355],[855,489,390,331],[33,847,368,379],[450,819,415,383],[850,901,342,318]];
  const EXCLUSIONS = {chimera:[850,971,17,48],mascot:[848,1096,17,41]};
  const IMAGE_FILES = {
    ...Object.fromEntries(achievementModule.CATALOG.map(entry=>[entry.icon,global.GardenVisualAssetMap&&global.GardenVisualAssetMap['assets/'+entry.iconFile]||entry.iconFile])),
    badgeFriendship:'achievements/friendship-v2.png', badgeSunshine:'achievements/sunshine-v2.png',
    badgeBattle:'achievements/battle-v2.png', badgeWater:'achievements/water-v2.png',
    badgeParty:'achievements/party-v2.png', badgeCollection:'achievements/collection-v2.png',
    homeBackground:'classic-menu/SelectorScreen_BG.jpg',
    homeLeft:'classic-menu/SelectorScreen_BG_Left_RGBA.png',
    homeCenter:'classic-menu/SelectorScreen_BG_Center_RGBA.png',
    homeRight:'classic-menu/SelectorScreen_BG_Right_RGBA.png',
    homeCloud:'classic-menu/SelectorScreen_Cloud1.png',
    sheet:'characters-v3.png', background:'classic-ui/background1-hd-v1.png', terrainMaterials:'terrain-materials-v1.jpg', mower:'classic-ui/LawnCleaner.png',
    sun:'classic-ui/SunSprite_79x79.png', bank:'classic-ui/SeedBank-hd-v1.png', packet:'classic-ui/SeedPacket.png',
    shovelBank:'classic-ui/ShovelBank-hd-v1.png', shovel:'classic-ui/Shovel-hd-v1.png', menu:'classic-ui/MenuButton.png',
    meterEmpty:'classic-ui/FlagMeterEmpty.png', meterFull:'classic-ui/FlagMeterFull.png',
    meterLabel:'classic-ui/FlagMeterLevelProgress.png', meterHead:'classic-ui/FlagMeterParts1.png'
  };
  const ACHIEVEMENT_IMAGE_KEYS = new Set(achievementModule.CATALOG.map(entry=>entry.icon));
  // Original image bytes include transparent padding and faint alpha noise.
  // The visible alpha > 8 bounds plus four pixels retain the antialiased rim.
  const IMAGE_SOURCE_RECTS = Object.freeze({
    bank:Object.freeze({x:0,y:146,w:1989,h:413}),
    shovelBank:Object.freeze({x:19,y:24,w:1200,h:1219})
  });
  const SCENE_FILES = Object.freeze({
    garden:'endless-scenes/garden-v2.jpg',brook:'endless-scenes/brook-v2.jpg',ruins:'endless-scenes/ruins-v2.jpg',
    frost:'endless-scenes/frost-v2.jpg',marsh:'endless-scenes/marsh-v2.jpg',rooftop:'endless-scenes/rooftop-v2.jpg',
    lagoon:'endless-scenes/lagoon-v2.jpg',moonpool:'endless-scenes/moonpool-v2.jpg',tidal:'endless-scenes/tidal-v2.jpg'
  });
  const SCENE_THUMB_FILES = Object.freeze({
    garden:'endless-scenes/garden-thumb-v2.jpg',brook:'endless-scenes/brook-thumb-v2.jpg',ruins:'endless-scenes/ruins-thumb-v2.jpg',
    frost:'endless-scenes/frost-thumb-v2.jpg',marsh:'endless-scenes/marsh-thumb-v2.jpg',rooftop:'endless-scenes/rooftop-thumb-v2.jpg',
    lagoon:'endless-scenes/lagoon-thumb-v2.jpg',moonpool:'endless-scenes/moonpool-thumb-v2.jpg',tidal:'endless-scenes/tidal-thumb-v2.jpg'
  });
  const SOUND_KINDS = ['plant','shoot','sun','burst','select','wave','win','lose','shovel','fuse','cherry','fire'];
  const MUSIC_TRACKS = Object.freeze({
    pajama:Object.freeze({file:'music/pajama-party.mp3',title:'睡衣派对之歌',caption:'睡衣派对 · 轻松守护'}),
    taibatsu:Object.freeze({file:'music/taibatsu.mp3',title:'大型讨伐③',caption:'讨伐 · 全力迎战'})
  });
  const MUSIC_VOLUMES = [.1,.2,.35,.5,.7];
  const AUTO_SUN_KEY = 'chiikawa-garden-auto-sun-v1', AUTO_SUN_DELAY = .35;
  const ENDLESS_SPEEDS = Object.freeze([1,2,3,4,5,8,10,15,20]);
  const GROWTH_CONTROL = Object.freeze({x:510,y:916,w:222,h:38});
  const GROWTH_PANEL = Object.freeze({x:460,y:684,w:480,h:220});
  const ENDLESS_SAVE_KEY = 'chiikawa-garden-endless-run-v1', AUTOSAVE_SECONDS = 15;
  const QUALITY_KEY = 'chiikawa-garden-render-quality-v1';
  const RENDER_QUALITY = Object.freeze({
    smooth:Object.freeze({name:'流畅',maxRatio:2,minRatio:1,materialRatio:1.5,pixels:6*1024*1024}),
    high:Object.freeze({name:'高清',maxRatio:3,minRatio:1,materialRatio:2,pixels:12*1024*1024}),
    ultra:Object.freeze({name:'超清',maxRatio:4,minRatio:2.5,materialRatio:3,pixels:20*1024*1024})
  });
  const ASSET_FILES = Object.freeze(Object.values(IMAGE_FILES).concat(Object.values(SCENE_FILES),Object.values(SCENE_THUMB_FILES),SOUND_KINDS.map(k=>'audio/'+k+'.wav'),Object.values(MUSIC_TRACKS).map(track=>track.file)));
  const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
  // Classic PC materials: purple-grey stone, dark seed-bank wood and aged paper.
  const UI = Object.freeze({stone:'#555a70',stoneEdge:'#292735',stoneLight:'#9795aa',wood:'#713713',woodEdge:'#3d1c0c',woodLight:'#b66c30',paper:'#e4c992',paperLight:'#f1deb0',paperEdge:'#8a6035',ink:'#493018',muted:'#75552f',gold:'#f4d879',green:'#8cdd28'});
  function rect(c,x,y,w,h,color) { c.fillStyle=color; c.fillRect(x,y,w,h); }
  function round(c,x,y,w,h,r,fill,stroke,lw) {
    r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
    if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||2;c.stroke();}
  }
  function oval(c,x,y,rx,ry,color) {c.save();c.translate(x,y);c.scale(rx,ry);c.beginPath();c.arc(0,0,1,0,Math.PI*2);c.fillStyle=color;c.fill();c.restore();}
  function label(c,text,x,y,size,color,align,bold,outline) {
    c.font=(bold?'bold ':'')+size+'px '+FONT;c.textAlign=align||'center';c.textBaseline='middle';
    if(outline){c.lineJoin='round';c.strokeStyle=outline;c.lineWidth=Math.max(2,size*.12);c.strokeText(String(text),x,y);}
    c.fillStyle=color;c.fillText(String(text),x,y);
  }
  function contains(r,p) {return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;}
  // Inlined into Native's factory; this is a single-image device-pixel cache,
  // never a flattened card, HUD or already-composited background.
  function createFixedHUDImageCache(settings) {
    const enabled=settings.enabled===true,entries=new Map(),identities=new WeakMap();
    const allowed=new Set(['bank']);
    const requested=Number(settings.pixelBudget),pixelBudget=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,8*1024*1024):4*1024*1024;
    const maxEntries=48,pad=2;
    let nextIdentity=0,pixels=0,residentPixels=0,peakPixels=0,hits=0,misses=0,bypasses=0,evictions=0,failures=0;
    function retire(surface,area){let completed=false;settings.release(surface,()=>{if(!completed){completed=true;residentPixels-=area;}});}
    function release(entry){pixels-=entry.pixels;retire(entry.surface,entry.pixels);}
    function clear(asset){for(const[key,entry]of entries)if(asset===undefined||entry.asset===asset){entries.delete(key);release(entry);}}
    function state(){return {enabled,entries:entries.size,pixels,residentPixels,peakPixels,pixelBudget,maxEntries,pad,hits,misses,bypasses,evictions,failures};}
    function numberKey(value){return Object.is(value,-0)?'-0':String(value);}
    function reject(){bypasses++;return false;}
    function draw(context,asset,source,rect,x,y,w,h,generation,ready){
      if(!enabled||!allowed.has(asset)||ready!==true||!source||source.complete!==true||typeof settings.createCanvas!=='function')return reject();
      if(context.globalAlpha!==1||context.globalCompositeOperation!=='source-over'||context.filter!=='none'||
        context.shadowBlur!==0||context.shadowOffsetX!==0||context.shadowOffsetY!==0||
        !['rgba(0, 0, 0, 0)','rgba(0,0,0,0)','transparent'].includes(context.shadowColor)||
        typeof context.getTransform!=='function'||typeof context.getContextAttributes!=='function'||
        typeof context.imageSmoothingEnabled!=='boolean'||!['low','medium','high'].includes(context.imageSmoothingQuality))return reject();
      const matrix=context.getTransform();
      if(!matrix||matrix.b!==0||matrix.c!==0||matrix.a<=0||matrix.d<=0)return reject();
      const sourceWidth=source.width,sourceHeight=source.height;
      const sourceRect=rect||{x:0,y:0,w:sourceWidth,h:sourceHeight};
      const numbers=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,x,y,w,h,sourceWidth,sourceHeight,sourceRect.x,sourceRect.y,sourceRect.w,sourceRect.h];
      if(!numbers.every(Number.isFinite)||w<=0||h<=0||sourceWidth<=0||sourceHeight<=0||sourceRect.w<=0||sourceRect.h<=0||
        sourceRect.x<0||sourceRect.y<0||sourceRect.x+sourceRect.w>sourceWidth||sourceRect.y+sourceRect.h>sourceHeight)return reject();
      let attributes;
      try{attributes=context.getContextAttributes();}catch(_){return reject();}
      if(!attributes||attributes.colorSpace!=='srgb'||attributes.colorType&&attributes.colorType!=='unorm8')return reject();
      const deviceX=matrix.a*x+matrix.e,deviceY=matrix.d*y+matrix.f;
      const deviceRight=matrix.a*(x+w)+matrix.e,deviceBottom=matrix.d*(y+h)+matrix.f;
      if(![deviceX,deviceY,deviceRight,deviceBottom].every(Number.isFinite))return reject();
      const left=Math.floor(deviceX)-pad,top=Math.floor(deviceY)-pad;
      const width=Math.ceil(deviceRight)+pad-left,height=Math.ceil(deviceBottom)+pad-top,area=width*height;
      if(!Number.isSafeInteger(left)||!Number.isSafeInteger(top)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
        width<=0||height<=0||width>8192||height>8192||!Number.isSafeInteger(area)||area>pixelBudget)return reject();
      let identity=identities.get(source);if(identity===undefined){identity=++nextIdentity;identities.set(source,identity);}
      // Absolute target/translation are deliberately retained as well as device
      // phase. This avoids treating merely near-equal floating transforms as the
      // same raster request; integer translations do not share a cache entry.
      const key=JSON.stringify([asset,identity,generation,ready,source.complete,String(source.src||''),source.naturalWidth,source.naturalHeight,
        ...numbers.map(numberKey),numberKey(deviceX-Math.floor(deviceX)),numberKey(deviceY-Math.floor(deviceY)),
        context.imageSmoothingEnabled,context.imageSmoothingQuality,attributes.colorSpace,attributes.colorType||'unorm8',rect?9:5]);
      let entry=entries.get(key);
      if(entry){entries.delete(key);entries.set(key,entry);hits++;}
      else{
        misses++;
        while(entries.size&&(entries.size>=maxEntries||pixels+area>pixelBudget)){
          const oldest=entries.keys().next().value,retired=entries.get(oldest);entries.delete(oldest);release(retired);evictions++;
        }
        // A captured surface may retire after the current scene packet ends.
        // Count those pending surfaces too; fall back instead of exceeding the
        // budget while a retirement callback still owns the old allocation.
        if(residentPixels+area>pixelBudget)return reject();
        let surface=null,allocated=0;
        try{
          surface=settings.createCanvas();if(!surface)throw Error('HUD cache canvas unavailable');
          surface.width=width;surface.height=height;
          allocated=area;residentPixels+=area;peakPixels=Math.max(peakPixels,residentPixels);
          const target=surface.getContext('2d',{alpha:true,colorSpace:attributes.colorSpace,willReadFrequently:true});
          if(!target)throw Error('HUD cache context unavailable');
          target.globalAlpha=1;target.globalCompositeOperation='source-over';
          target.filter='none';target.shadowBlur=0;target.shadowOffsetX=0;target.shadowOffsetY=0;target.shadowColor='rgba(0, 0, 0, 0)';
          target.imageSmoothingEnabled=context.imageSmoothingEnabled;target.imageSmoothingQuality=context.imageSmoothingQuality;
          // Preserve the original draw parameters and affine scale. Only an
          // integer device origin is removed; destination clip is applied once
          // on replay, in its already-established device coordinate system.
          target.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-left,matrix.f-top);
          if(rect)target.drawImage(source,rect.x,rect.y,rect.w,rect.h,x,y,w,h);
          else target.drawImage(source,x,y,w,h);
          entry={asset,surface,pixels:area,left,top};entries.set(key,entry);pixels+=area;
        }catch(_){if(surface)retire(surface,allocated);failures++;return false;}
      }
      context.save();
      try{context.setTransform(1,0,0,1,0,0);context.imageSmoothingEnabled=false;context.drawImage(entry.surface,entry.left,entry.top);}
      finally{context.restore();}
      return true;
    }
    return {draw,clear,state};
  }
  
  // One fillText raster, on its original opaque, flat panel background. No
  // badge/panel/group flattening and no transparent intermediate glyph layer.
  function createSeparateToastLabelCache(settings) {
    const enabled=settings.enabled===true,entries=new Map();
    const requested=Number(settings.pixelBudget),pixelBudget=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,2*1024*1024):512*1024;
    const maxEntries=24,pad=2,textAttributes=['font','textAlign','textBaseline','direction','fontKerning','fontStretch','fontVariantCaps','textRendering','letterSpacing','wordSpacing'];
    let pixels=0,residentPixels=0,peakPixels=0,hits=0,misses=0,bypasses=0,failures=0,evictions=0,fontGeneration=0,fontChecks=0,fontReadyChecks=0,fontBypasses=0,fontSet=null,disposed=false,lastFailure=null;
    const spacingProperties=['letterSpacing','wordSpacing'],spacingContexts=new Map(),metricProperties=['width','actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent','fontBoundingBoxDescent','emHeightAscent','emHeightDescent','hangingBaseline','alphabeticBaseline','ideographicBaseline'];
    let spacingRegistrations=0,spacingInvalidations=0,spacingCanonicalizations=0,spacingBypasses=0,metricChecks=0,metricFailures=0,lastSpacingReason=null;
    const fontEvents=['loading','loadingdone','loadingerror'];
    function retire(surface,area){let done=false;settings.release(surface,()=>{if(!done){done=true;residentPixels-=area;}});}
    function release(entry){pixels-=entry.pixels;retire(entry.surface,entry.pixels);}
    function clear(){for(const entry of entries.values())release(entry);entries.clear();}
    function fontsChanged(){fontGeneration++;clear();}
    function dispose(){if(disposed)return;disposed=true;clear();for(const [context,record]of spacingContexts)for(const item of record.items){const current=Object.getOwnPropertyDescriptor(context,item.property);if(current&&current.get===item.get&&current.set===item.set)delete context[item.property];}spacingContexts.clear();if(fontSet)for(const event of fontEvents)fontSet.removeEventListener(event,fontsChanged);fontSet=null;}
    function state(){return {enabled,disposed,entries:entries.size,pixels,residentPixels,peakPixels,pixelBudget,maxEntries,pad,hits,misses,bypasses,failures,evictions,fontGeneration,fontChecks,fontReadyChecks,fontBypasses,fontSetAttached:!!fontSet,fontSetStatus:fontSet?String(fontSet.status):null,lastFailure,spacingContexts:spacingContexts.size,spacingRegistrations,spacingInvalidations,spacingCanonicalizations,spacingBypasses,metricChecks,metricFailures,lastSpacingReason};}
    function reject(){bypasses++;return false;}
    function numberKey(value){return Object.is(value,-0)?'-0':String(value);}
    function readyFonts(context,text){
      fontChecks++;
      function decline(){fontBypasses++;return false;}
      let next;
      try{next=settings.getFontSet();}catch(_){return decline();}
      if(!next||typeof next.check!=='function'||typeof next.addEventListener!=='function'||typeof next.removeEventListener!=='function')return decline();
      if(next!==fontSet){
        if(fontSet)for(const event of fontEvents)fontSet.removeEventListener(event,fontsChanged);
        fontSet=next;fontGeneration++;clear();for(const event of fontEvents)fontSet.addEventListener(event,fontsChanged);
      }
      try{if(fontSet.status==='loaded'&&fontSet.check(context.font,text)===true){fontReadyChecks++;return true;}return decline();}catch(_){return decline();}
    }
    // Only Native's private foreground calls this before its first save(). Blink
    // can lose parsed spacing strings on save while preserving numeric spacing.
    // An empty getter by itself proves nothing, including after nonzero writes.
    function observeContext(context) {
      if(!enabled||disposed||!context||!settings.isOffscreenCanvas||!settings.isOffscreenCanvas(context.canvas))return false;
      const known=spacingContexts.get(context);if(known)return known.trusted;
      if(spacingContexts.size>=8||!Object.isExtensible(context))return false;
      const record={trusted:true,items:[]};
      try{
        for(const property of spacingProperties){
          if(Object.getOwnPropertyDescriptor(context,property)||context[property]!=='0px')throw Error('Unverified initial '+property);
          let owner=Object.getPrototypeOf(context),descriptor=null;
          for(;owner;owner=Object.getPrototypeOf(owner)){descriptor=Object.getOwnPropertyDescriptor(owner,property);if(descriptor)break;}
          if(!descriptor||typeof descriptor.get!=='function'||typeof descriptor.set!=='function'||Reflect.apply(descriptor.get,context,[])!=='0px')throw Error('Unverified native accessor '+property);
          const item={property,owner,descriptor,get(){return Reflect.apply(descriptor.get,this,[]);},set(value){
            // Even an invalid or zero setter revokes provenance; forward its
            // original behavior and never infer a hidden numeric value.
            if(record.trusted){record.trusted=false;spacingInvalidations++;}
            return Reflect.apply(descriptor.set,this,[value]);
          }};
          record.items.push(item);
        }
        for(const item of record.items)Object.defineProperty(context,item.property,{configurable:true,enumerable:item.descriptor.enumerable,get:item.get,set:item.set});
        spacingContexts.set(context,record);spacingRegistrations++;return true;
      }catch(error){
        for(const item of record.items){const current=Object.getOwnPropertyDescriptor(context,item.property);if(current&&current.get===item.get&&current.set===item.set)delete context[item.property];}
        lastSpacingReason=String(error&&error.message!==undefined?error.message:error);return false;
      }
    }
    function verifiedDefaultSpacing(context) {
      const record=spacingContexts.get(context);if(!record||!record.trusted)return false;
      for(const item of record.items){
        const current=Object.getOwnPropertyDescriptor(context,item.property),prototype=Object.getOwnPropertyDescriptor(item.owner,item.property);
        if(!current||current.get!==item.get||current.set!==item.set||!prototype||prototype.get!==item.descriptor.get||prototype.set!==item.descriptor.set){
          record.trusted=false;spacingInvalidations++;return false;
        }
      }
      return true;
    }
    function draw(context,text,x,y,safeRect) {
      if(!enabled||disposed||!context||typeof settings.createCanvas!=='function'||typeof settings.getFontSet!=='function'||typeof settings.release!=='function')return reject();
      if(context.globalAlpha!==1||context.globalCompositeOperation!=='source-over'||context.filter!=='none'||
        context.shadowBlur!==0||context.shadowOffsetX!==0||context.shadowOffsetY!==0||
        !['rgba(0, 0, 0, 0)','rgba(0,0,0,0)','transparent'].includes(context.shadowColor)||
        context.textAlign!=='left'||context.textBaseline!=='middle'||typeof context.font!=='string'||typeof context.fillStyle!=='string'||
        typeof context.getTransform!=='function'||typeof context.getContextAttributes!=='function'||typeof context.measureText!=='function'||
        typeof context.imageSmoothingEnabled!=='boolean'||!['low','medium','high'].includes(context.imageSmoothingQuality))return reject();
      // Only OffscreenCanvas can prove the meaning of inherited direction here;
      // ordinary DOM inherited direction can change without a Canvas property.
      if(!['ltr','rtl'].includes(context.direction)&&!(context.direction==='inherit'&&settings.isOffscreenCanvas&&settings.isOffscreenCanvas(context.canvas)))return reject();
      const matrix=context.getTransform();
      if(!matrix||matrix.b!==0||matrix.c!==0||matrix.a<=0||matrix.d<=0||!safeRect)return reject();
      const numbers=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f,x,y,safeRect.x,safeRect.y,safeRect.w,safeRect.h];
      if(!numbers.every(Number.isFinite)||safeRect.w<=0||safeRect.h<=0)return reject();
      let attributes;try{attributes=context.getContextAttributes();}catch(_){return reject();}
      if(!attributes||attributes.colorSpace!=='srgb'||attributes.colorType&&attributes.colorType!=='unorm8')return reject();
      text=String(text);if(!readyFonts(context,text))return reject();
      let metrics;try{metrics=context.measureText(text);}catch(_){return reject();}
      const bounds=metrics&&[metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight,metrics.actualBoundingBoxAscent,metrics.actualBoundingBoxDescent];
      if(!bounds||!bounds.every(Number.isFinite)||bounds[0]+bounds[1]<=0||bounds[2]+bounds[3]<=0)return reject();
      const deviceLeft=matrix.a*(x-bounds[0])+matrix.e,deviceRight=matrix.a*(x+bounds[1])+matrix.e;
      const deviceTop=matrix.d*(y-bounds[2])+matrix.f,deviceBottom=matrix.d*(y+bounds[3])+matrix.f;
      const left=Math.floor(deviceLeft)-pad,top=Math.floor(deviceTop)-pad;
      const width=Math.ceil(deviceRight)+pad-left,height=Math.ceil(deviceBottom)+pad-top,area=width*height;
      // Every opaque cache pixel (including padding) must be inside this row's
      // already-painted flat panel rectangle, away from border/badge/other text.
      if(left<matrix.a*safeRect.x+matrix.e||top<matrix.d*safeRect.y+matrix.f||
        left+width>matrix.a*(safeRect.x+safeRect.w)+matrix.e||top+height>matrix.d*(safeRect.y+safeRect.h)+matrix.f||
        ![left,top,width,height,area].every(Number.isSafeInteger)||width<=0||height<=0||width>8192||height>8192||area>pixelBudget)return reject();
      const textState=textAttributes.map(key=>[key,key in context?context[key]:null]);
      if(textState.some(([,value])=>value!==null&&typeof value!=='string'))return reject();
      const hasEmptySpacing=textState.some(([property,value])=>spacingProperties.includes(property)&&value==='');
      if(hasEmptySpacing&&!verifiedDefaultSpacing(context)){spacingBypasses++;lastSpacingReason='Empty spacing lacks verified untouched Native default';return reject();}
      const targetTextState=hasEmptySpacing?textState.map(([property,value])=>[property,spacingProperties.includes(property)&&value===''?'0px':value]):textState;
      const key=JSON.stringify([text,context.fillStyle,'#fff2d3',fontGeneration,textState,targetTextState,numbers.map(numberKey),bounds.map(numberKey),
        left,top,width,height,context.imageSmoothingEnabled,context.imageSmoothingQuality,attributes.colorSpace,attributes.colorType||'unorm8']);
      let entry=entries.get(key);
      if(entry){entries.delete(key);entries.set(key,entry);hits++;}
      else{
        misses++;
        while(entries.size&&(entries.size>=maxEntries||pixels+area>pixelBudget)){
          const oldest=entries.keys().next().value,retired=entries.get(oldest);entries.delete(oldest);release(retired);evictions++;
        }
        if(residentPixels+area>pixelBudget)return reject();
        let surface=null,allocated=0;
        try{
          surface=settings.createCanvas();if(!surface)throw Error('Toast cache canvas unavailable');
          surface.width=width;surface.height=height;allocated=area;residentPixels+=area;peakPixels=Math.max(peakPixels,residentPixels);
          const target=surface.getContext('2d',{alpha:true,colorSpace:'srgb',willReadFrequently:true});
          if(!target||typeof target.getContextAttributes!=='function')throw Error('Toast cache context unavailable');
          const targetAttributes=target.getContextAttributes();
          if(!targetAttributes||targetAttributes.colorSpace!=='srgb'||targetAttributes.colorType&&targetAttributes.colorType!=='unorm8')throw Error('Toast cache pixel format changed');
          if(context.direction==='inherit'&&(!settings.isOffscreenCanvas||!settings.isOffscreenCanvas(surface)))throw Error('Toast cache inherited direction changed');
          for(const [property,value]of targetTextState)if(value!==null){if(!(property in target))throw Error('Toast cache text property unavailable: '+property+' expected='+JSON.stringify(value)+' actual=<unavailable>');target[property]=value;if(target[property]!==value)throw Error('Toast cache text property changed: '+property+' expected='+JSON.stringify(value)+' actual='+JSON.stringify(target[property]));}
          if(hasEmptySpacing){
            metricChecks++;const targetMetrics=target.measureText(text);
            for(const property of metricProperties){
              const sourceHas=property in metrics,targetHas=property in targetMetrics;
              if(sourceHas!==targetHas||sourceHas&&(!Number.isFinite(metrics[property])||!Number.isFinite(targetMetrics[property])||!Object.is(metrics[property],targetMetrics[property]))){
                metricFailures++;throw Error('Toast cache text metric changed: '+property+' expected='+JSON.stringify(metrics[property])+' actual='+JSON.stringify(targetMetrics[property]));
              }
            }
            spacingCanonicalizations++;
          }
          target.globalAlpha=1;target.globalCompositeOperation='source-over';target.filter='none';
          target.shadowBlur=0;target.shadowOffsetX=0;target.shadowOffsetY=0;target.shadowColor='rgba(0, 0, 0, 0)';
          target.imageSmoothingEnabled=context.imageSmoothingEnabled;target.imageSmoothingQuality=context.imageSmoothingQuality;
          target.setTransform(1,0,0,1,0,0);target.fillStyle='#fff2d3';target.fillRect(0,0,width,height);
          target.fillStyle=context.fillStyle;target.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-left,matrix.f-top);
          target.fillText(text,x,y);
          entry={surface,pixels:area,left,top};entries.set(key,entry);pixels+=area;
        }catch(error){lastFailure=String(error&&error.message!==undefined?error.message:error);if(surface)retire(surface,allocated);failures++;return false;}
      }
      context.save();
      try{context.setTransform(1,0,0,1,0,0);context.drawImage(entry.surface,entry.left,entry.top);}
      finally{context.restore();}
      return true;
    }
    return {draw,observeContext,clear,dispose,state};
  }
  
  // Private Native helper. Only the verified first base-background draw supplies
  // the proof below; this is not a generic opaque-image or whole-frame cache.
  function createDeviceBackgroundCache(settings) {
    const enabled=settings.enabled===true,limit=20*1024*1024;
    const requested=settings.pixelBudget;
    const pixelBudget=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,limit):limit;
    let entry=null,residentPixels=0,peakPixels=0,hits=0,misses=0,bypasses=0,failures=0,clears=0,lastReason='',lastFailure=null;
    function reject(reason){bypasses++;lastReason=reason;return false;}
    function retire(surface,pixels){
      let finished=false;const released=()=>{if(!finished){finished=true;residentPixels-=pixels;}};
      settings.release(surface,released);
    }
    function clear(){if(entry){const old=entry;entry=null;retire(old.surface,old.pixels);clears++;}}
    function state(){return {enabled,pixelBudget,entries:entry?1:0,pixels:entry?entry.pixels:0,residentPixels,peakPixels,hits,misses,bypasses,failures,clears,lastReason,lastFailure:lastFailure&&{...lastFailure}};}
    function recordFailure(stage,error){lastFailure={stage,name:String(error&&error.name||'Error').slice(0,64),message:String(error&&error.message||error).slice(0,1024)};}
    function draw(context,source,width,height,generation,proof){
      if(!enabled)return reject('disabled');
      if(!proof||proof.firstBaseDraw!==true||proof.fullViewClip!==true||proof.immutableSource!==true||proof.opaqueUnderlay!=='#171912')return reject('unproved base');
      if(!source||typeof source!=='object'||!Number.isSafeInteger(generation)||generation<=0||
        !Number.isSafeInteger(source.width)||!Number.isSafeInteger(source.height)||source.width<=0||source.height<=0||
        !Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return reject('source or dimensions');
      if(context.globalAlpha!==1||context.globalCompositeOperation!=='source-over'||context.filter!=='none'||
        context.shadowBlur!==0||context.shadowOffsetX!==0||context.shadowOffsetY!==0||
        !['rgba(0, 0, 0, 0)','rgba(0,0,0,0)','transparent'].includes(context.shadowColor)||
        typeof context.getTransform!=='function'||typeof context.getContextAttributes!=='function'||
        typeof context.imageSmoothingEnabled!=='boolean'||!['low','medium','high'].includes(context.imageSmoothingQuality))return reject('context state');
      let matrix,attributes;
      try{matrix=context.getTransform();attributes=context.getContextAttributes();}catch(_){return reject('context inspection');}
      const canvas=context.canvas;
      if(!matrix||!canvas||!Number.isSafeInteger(canvas.width)||!Number.isSafeInteger(canvas.height)||canvas.width<=0||canvas.height<=0||
        ![matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite)||
        matrix.a<=0||matrix.d!==matrix.a||matrix.b!==0||matrix.c!==0||matrix.e!==0||matrix.f!==0||
        matrix.a*width!==canvas.width||matrix.d*height!==canvas.height||
        proof.viewWidth!==width||proof.viewHeight!==height)return reject('device viewport');
      if(!attributes||attributes.colorSpace!=='srgb'||attributes.colorType&&attributes.colorType!=='unorm8'||typeof attributes.alpha!=='boolean'||typeof attributes.willReadFrequently!=='boolean')return reject('color or backing attributes');
      const area=canvas.width*canvas.height;
      if(canvas.width>8192||canvas.height>8192||!Number.isSafeInteger(area)||area>pixelBudget)return reject('budget or extent');
      const key=[generation,source.width,source.height,width,height,canvas.width,canvas.height,matrix.a,matrix.d,
        context.imageSmoothingEnabled,context.imageSmoothingQuality,attributes.alpha,attributes.colorSpace,attributes.colorType||'unorm8',attributes.willReadFrequently].join('|');
      if(entry&&entry.source===source&&entry.key===key){hits++;}
      else {
        misses++;clear();
        // Retired surfaces stay charged until their real ownership callback.
        if(residentPixels+area>pixelBudget)return reject('retirement budget');
        let surface=null,allocated=0;
        try{
          surface=settings.createCanvas(attributes.willReadFrequently);if(!surface)throw Error('Device background surface unavailable');
          surface.width=canvas.width;surface.height=canvas.height;allocated=area;residentPixels+=area;peakPixels=Math.max(peakPixels,residentPixels);
          const target=surface.getContext('2d',{alpha:attributes.alpha,colorSpace:attributes.colorSpace,willReadFrequently:attributes.willReadFrequently===true});
          if(!target)throw Error('Device background 2D unavailable');
          const actual=target.getContextAttributes();
          if(!actual||actual.alpha!==attributes.alpha||actual.colorSpace!==attributes.colorSpace||
            (actual.colorType||'unorm8')!==(attributes.colorType||'unorm8')||actual.willReadFrequently!==attributes.willReadFrequently)throw Error('Device background attributes changed: expected '+JSON.stringify(attributes)+' actual '+JSON.stringify(actual));
          target.globalAlpha=1;target.globalCompositeOperation='source-over';target.filter='none';
          target.shadowColor='rgba(0, 0, 0, 0)';target.shadowBlur=0;target.shadowOffsetX=0;target.shadowOffsetY=0;
          target.imageSmoothingEnabled=context.imageSmoothingEnabled;target.imageSmoothingQuality=context.imageSmoothingQuality;
          target.setTransform(1,0,0,1,0,0);target.fillStyle='#171912';target.fillRect(0,0,canvas.width,canvas.height);
          target.setTransform(matrix.a,0,0,matrix.d,0,0);target.beginPath();target.rect(0,0,width,height);target.clip();
          // Same original high-quality resize, performed only on a miss. The
          // prior opaque fill proves every resulting pixel is opaque even when
          // the illustrated terrain image itself has transparent margins.
          target.drawImage(source,0,0,width,height);
          entry={source,key,surface,pixels:area};
        }catch(error){recordFailure('construction',error);if(surface)retire(surface,allocated);failures++;lastReason='construction failed';return false;}
      }
      context.save();
      try{
        context.setTransform(1,0,0,1,0,0);context.imageSmoothingEnabled=false;
        context.drawImage(entry.surface,0,0);
        lastReason='';return true;
      }catch(error){recordFailure('replay',error);failures++;lastReason='replay failed';clear();return false;}
      finally{context.restore();}
    }
    return {draw,clear,state};
  }
  
  function create(options) {
    options=options||{};
    if(options.visualReplica===true)options={...options,autoStart:false,worker:false};
    const platform=options.platform;
    if(!platform||typeof platform.createImage!=='function')throw new Error('GardenNative requires a platform with createImage().');
    const engine=options.engine||global.GardenEngine;
    if(!engine||!engine.Game)throw new Error('GardenNative requires the shared GardenEngine.');
    const canvas=options.canvas||platform.createCanvas();
    let ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas 2D is unavailable.');
    const mainContext=ctx;
    let deferredScene=null,sceneForeground=null,sceneRetry=false;
    let staticTerrainRecord=null,staticTerrainFrame=false,frameBackground=null,staticTerrainSourceVersion=0,staticTerrainRects=null;
    const motion=options.motion||global.GardenMotion;
    let sceneImageRetire=null,sceneImageBegin=null;
    if((options.nativeStaticWarmup===true||options.visualReplica===true)&&motion){
      try{
        const version=Object.getOwnPropertyDescriptor(motion,'sceneImageRetirementVersion'),creator=Object.getOwnPropertyDescriptor(motion,'createSceneImageRetirement');
        if(version&&Object.prototype.hasOwnProperty.call(version,'value')&&version.value===1&&creator&&Object.prototype.hasOwnProperty.call(creator,'value')&&typeof creator.value==='function'){
          const capability=creator.value.call(motion,motion,{nativeStatic:true});
          const begin=typeof capability==='function'?Object.getOwnPropertyDescriptor(capability,'beginScene'):null;
          if(begin&&Object.prototype.hasOwnProperty.call(begin,'value')&&typeof begin.value==='function'&&begin.writable===false&&begin.configurable===false){sceneImageRetire=capability;sceneImageBegin=begin.value;}
        }
      }catch(_){}
    }

    const collectionApi=collectionModule||global.GardenSunCollection;
    if(!collectionApi||typeof collectionApi.create!=='function')throw new Error('GardenNative requires GardenSunCollection.');
    const sunCollection=collectionApi.create();
    const assetRoot=String(options.assetRoot||(options.root?String(options.root).replace(/\/?$/,'/'):'')+'assets/').replace(/\/?$/,'/');
    const game=new engine.Game(options.seed===undefined?{}:{seed:options.seed});
    // Each runtime owns its geometry, so previewing another board cannot move
    // the cells in another game instance or change the exported classic grid.
    const GRID={x:64,y:128,w:128,h:160,rows:5,cols:9};
    const desktopHUD=HUD, localHUD=Object.assign({},HUD);
    let mobileLayout=false, mobileBoardBounds=null;
    const challenges=challengeModule.create(engine,game);
    const images={}, imageReady={}, imageErrors=[], audio={}, unsub=[];
    const fixedHUDAssetGeneration={};let drawingFixedHUD=false;
    const separateToastLabelCache=createSeparateToastLabelCache({enabled:options.visualReplica===true&&options.separateToastLabelCache===true,pixelBudget:options.separateToastLabelCachePixels,
      createCanvas:()=>platform.createCanvas(),release:releaseFixedHUDCachedSurface,
      getFontSet:()=>typeof globalThis!=='undefined'&&(globalThis.fonts||(globalThis.document&&globalThis.document.fonts)),
      isOffscreenCanvas:surface=>typeof OffscreenCanvas!=='undefined'&&surface instanceof OffscreenCanvas});
    const fixedHUDImageCache=createFixedHUDImageCache({enabled:options.visualReplica===true&&options.fixedHUDImageCache===true,pixelBudget:options.fixedHUDImageCachePixels,
      createCanvas:()=>platform.createCanvas(),release:releaseFixedHUDCachedSurface});
    let drawingDeviceBackground=false,terrainSurfaceGeneration=0;
    const deviceBackgroundCache=createDeviceBackgroundCache({enabled:options.visualReplica===true&&options.deviceBackgroundCache===true,pixelBudget:options.deviceBackgroundCachePixels,
      createCanvas:willReadFrequently=>willReadFrequently===false&&typeof platform.createDeviceBackgroundCanvas==='function'?platform.createDeviceBackgroundCanvas():platform.createCanvas(),release:releaseFixedHUDCachedSurface});
    const terrainCache=new Map(),mapPreviewCache=new Map(),cardGrowthCache=new Map(),materialCache=new Map(),levelBadgeCache=new Map(),actorShadowCache=new Map(),actorBarCache=new Map(),actorAccentCache=new Map();
    let pendingStaticWarmup=null;
    const staticWarmup={attempts:0,successes:0,failures:0,sources:0,pixels:0,reason:''};
    let burnedWarmTask=null,burnedWarmRequest=null;
    const burnedWarmup={attempts:0,successes:0,failures:0,sources:0,pixels:0,created:0,reason:''};
    const shieldWarmup={attempts:0,successes:0,failures:0,sources:0,pixels:0,pixelScale:1,transform:null,reason:''};
    const levelIds=Object.keys(engine.LEVELS).sort((a,b)=>(engine.LEVELS[a].index||0)-(engine.LEVELS[b].index||0));
    const plantIds=Object.keys(engine.PLANTS),enemyIds=Object.keys(engine.ENEMIES);
    const deckSize=engine.DECK_SIZE||10,defaultDeck=engine.DEFAULT_DECK||ORDER;
    const state={selected:null,level:'meadow',levelPage:0,overlay:'home',returnOverlay:'home',audio:true,toast:'',toastTime:0,best:0,age:0,hover:null,hoverTime:0,drag:null,held:null,deck:defaultDeck.slice(),pendingDeck:defaultDeck.slice(),clears:{},endlessBest:{waves:0,kills:0,seconds:0},almanac:{tab:'plants',selected:'sunflower',page:0,returnOverlay:'home'},sidebarAvailable:false,sidebarPending:false,menuHover:null,homeGreeting:null};
    let view={x:0,y:0,width:W,height:H,logicalWidth:W,scale:1,pixelRatio:1,displayPixelRatio:1,windowWidth:W,windowHeight:H};
    let renderSupports=null,renderSupportIds=null,renderPlantCells=null;
    let panelOffset=0;
    let buttons=[], disposed=false, rafId=null, lastFrame=null, lastStatus=game.status, audioFailure=false;
    let renderRequested=false,lastPaintMusicKey='',lastPaintSceneKey='';
    const visualRenderer=options.visualReplica===true?null:options.visualRenderer||null;
    let visualMode=false,visualEpoch=0,visualSequence=0,visualReplicaFrame=null,lastVisualScope='';
    let applyingVisualCohort=false;
    const tutorial=tutorialModule.create({platform,game,engine,onChange(){renderRequested=true;}});
    let threadedTask=null,threadedSaveDepth=0;
    let periodicTask=null,periodicGeneration=0,periodicEventDepth=0;
    let initialSaveGeneration=0,initialSaveRequest=null;
    const simulation=workerBridgeModule&&typeof platform.createSimulationWorker==='function'&&options.worker!==false&&options.autoStart!==false?workerBridgeModule.create({game,engine,platform,snapshotState:false,snapshotEffects:false,readonlyMirror:true,deferFrameAck:true,trustedTransport:platform.trustedWorkerTransport===true,startupClock:platform.trustedWorkerTransport===true,windowMonotonicClock:platform.trustedWorkerTransport===true,nativeCheckpointBarrierVoid:options.nativeCheckpointBarrierVoid===true&&platform.nativeCheckpointBarrierVoidVersion===1&&platform.trustedWorkerTransport===true&&options.autoStart!==false,periodicCheckpoint:options.nativePeriodicCheckpoint===true&&platform.nativePeriodicCheckpointVersion===1,onSnapshot(){renderRequested=true;},onFailure(){state.overlay='pause';state.saveError='战斗计算已暂停，请保存后继续。';renderRequested=true;}}):null;
    function threadedActive(){return !!(simulation&&simulation.state().active);}
    function withThreadCheckpoint(action,transition=false,phases=null){
      invalidatePeriodicCheckpoint();
      if(threadedTask)return threadedTask.then(()=>disposed?false:action());
      const wasPlaying=game.status==='playing',wasPending=!!state.saves.pending;
      // An already running visible browser RAF paints pending checkpoint state.
      // Capture before the barrier: a transition may intentionally reset lastFrame.
      const checkpointRaf=platform.trustedWorkerTransport===true&&options.autoStart!==false&&typeof platform.requestAnimationFrame==='function'&&rafId!==null&&lastFrame!==null&&!appHidden?platform.requestAnimationFrame:null;
      // Only the explicitly opted-in browser adapter supplies this task capability.
      // Default, manual, hidden, first-frame and unknown adapters keep their original path.
      const checkpointYield=options.nativeCheckpointTaskBoundary===true&&checkpointRaf&&checkpointActive()&&platform.checkpointTaskBoundaryVersion===1&&typeof platform.yieldCheckpointTask==='function'?platform.yieldCheckpointTask:null;
      const checkpointFactory=checkpointYield?platform.createSimulationWorker:null;
      const checkpointRun=checkpointYield?simulation.state().runId:null;
      state.saves.pending=true;cancelDrag(false);state.held=null;state.upgradePress=null;
      // Only the explicitly enabled, already-running visible browser RAF
      // checkpoint omits its unused Promise value. Public/custom barriers retain
      // their detached state, including manual, hidden and first-frame paths.
      const checkpointBarrierVoid=checkpointRaf&&options.nativeCheckpointBarrierVoid===true&&platform.nativeCheckpointBarrierVoidVersion===1&&typeof simulation.barrierVoid==='function';
      threadedTask=(checkpointBarrierVoid?simulation.barrierVoid():simulation.barrier()).then(async()=>{
        let actionResult;
        if(checkpointYield){
          // Drain the authoritative events before a RAF can consume them with a
          // different achievement-tracking scope. Never hold this depth across await.
          threadedSaveDepth++;
          try{processEvents();}finally{threadedSaveDepth--;}
          // The worker remains active and paused: existing mutation entry points
          // still queue behind threadedTask until the complete action is finished.
          await checkpointYield.call(platform);
          if(disposed)return false;
          const checkpointCurrent=simulation.state();
          if(!checkpointCurrent.active||checkpointCurrent.failed||checkpointCurrent.runId!==checkpointRun||checkpointCurrent.status!=='paused'||game.status!=='paused'||platform.createSimulationWorker!==checkpointFactory||platform.yieldCheckpointTask!==checkpointYield||platform.checkpointTaskBoundaryVersion!==1||platform.trustedWorkerTransport!==true||platform.requestAnimationFrame!==checkpointRaf)throw new Error('Checkpoint task handoff was cancelled');
          if(phases){
            // A continuation first completes its required save while the same
            // authoritative worker remains active and paused. No depth spans await.
            let prepared;
            threadedSaveDepth++;
            try{prepared=phases.prepare();}finally{threadedSaveDepth--;}
            if(!prepared)return false;
            await checkpointYield.call(platform);
            if(disposed)return false;
            const checkpointPrepared=simulation.state();
            if(!checkpointPrepared.active||checkpointPrepared.failed||checkpointPrepared.runId!==checkpointRun||checkpointPrepared.status!=='paused'||game.status!=='paused'||platform.createSimulationWorker!==checkpointFactory||platform.yieldCheckpointTask!==checkpointYield||platform.checkpointTaskBoundaryVersion!==1||platform.trustedWorkerTransport!==true||platform.requestAnimationFrame!==checkpointRaf)throw new Error('Checkpoint task handoff was cancelled');
          }
          threadedSaveDepth++;
          try{if(transition)simulation.stop();actionResult=phases?phases.commit():action();}
          finally{threadedSaveDepth--;}
        }else{
          threadedSaveDepth++;
          try{processEvents();if(transition)simulation.stop();actionResult=action();}
          finally{threadedSaveDepth--;}
        }
        const result=await actionResult;
        if(!transition&&wasPlaying&&game.status==='paused'&&!state.overlay&&!appHidden)await simulation.resume(game);
        return result;
      }).catch(()=>{state.saveError='当前战局尚未确认保存，请保持页面打开并重试。';state.overlay='pause';notice(state.saveError,5);return false;}).finally(()=>{threadedTask=null;state.saves.pending=wasPending;if(!disposed){
        lastFrame=null;renderRequested=true;
        // The next actual RAF also paints paused scenes with zero dt. Manual,
        // first-frame, hidden, custom or stopped/replaced schedulers stay immediate.
        if(!(checkpointRaf&&platform.trustedWorkerTransport===true&&options.autoStart!==false&&platform.requestAnimationFrame===checkpointRaf&&rafId!==null&&!appHidden))render();
      }});
      return threadedTask;
    }
    function pauseBattleClock(){if(game.status==='playing')game.togglePause();if(threadedActive()&&!threadedSaveDepth)saveEndlessRun({silent:true});}
    function placeGuided(type,row,col){const allowed=tutorial.allow('place',{type,row,col});return allowed.ok?game.place(type,row,col):allowed;}
    function drawTutorial(){
      const guide=tutorial.getState();if(!guide.active||state.overlay||game.status!=='playing')return;
      const pulse=.65+.35*Math.sin(state.age*3),x=GRID.x+guide.col*GRID.w,y=GRID.y+guide.row*GRID.h;
      ctx.save();ctx.globalAlpha=pulse;round(ctx,x+3,y+3,GRID.w-6,GRID.h-6,13,'rgba(255,227,136,.15)','#ffe19b',5);ctx.restore();
      if(guide.expectedPlant){const index=state.deck.indexOf(guide.expectedPlant);if(index>=0)round(ctx,localHUD.cardX+index*localHUD.cardStep-3,localHUD.cardY-3,localHUD.cardW+6,localHUD.cardH+6,8,null,'#ffe19b',4);}
      if(guide.stage==='shovel'){const b=buttons.find(b=>b.id==='shovel');if(b)round(ctx,b.x-3,b.y-3,b.w+6,b.h+6,10,null,'#ffe19b',4);}
      const w=Math.min(mobileLayout?1400:790,view.logicalWidth-38),px=(view.logicalWidth-w)/2,py=mobileLayout?176:148,height=mobileLayout?128:94;
      const skipW=mobileLayout?200:127,skipH=mobileLayout?114:43,skipX=px+w-skipW-14,skipY=py+(height-skipH)/2;
      round(ctx,px,py,w,height,12,'rgba(46,39,29,.94)','#b99b62',2);
      label(ctx,'新手练习 '+guide.step+'/'+guide.total+' · '+guide.title,px+22,py+(mobileLayout?34:25),mobileLayout?30:22,'#ffe4a5','left',true);
      growthLabel(guide.text,px+22,py+(mobileLayout?88:64),w-skipW-62,mobileLayout?25:18,'#fff2d5','left');
      round(ctx,skipX,skipY,skipW,skipH,7,'#675941','#d8c18b',2);label(ctx,'跳过教学',skipX+skipW/2,skipY+skipH/2,mobileLayout?27:20,'#fff2d5');
      addButton('tutorial-skip',skipX,skipY,skipW,skipH,()=>{tutorial.skip();notice('教学已跳过，可以自由布阵。');render();});
    }
    const imageLoader=reliableImages.create({
      createImage:()=>platform.createImage(),
      resolve:file=>file.startsWith('data:')?file:options.assetPaths&&options.assetPaths[file]||assetRoot+file,
      onChange(record){
        if(options.nativeStaticTerrain===true){staticTerrainSourceVersion++;staticTerrainRecord=null;if(record.key==='asset:background'||record.key==='asset:terrainMaterials'||record.key.startsWith('scene:')||record.key.startsWith('thumb:'))clearSurfaceCache(terrainCache);}
        if(record.key.startsWith('asset:')){const key=record.key.slice(6);fixedHUDAssetGeneration[key]=(fixedHUDAssetGeneration[key]||0)+1;fixedHUDImageCache.clear(key);images[key]=record.image;imageReady[key]=record.ready;}
        renderRequested=true;
        Promise.resolve().then(()=>{if(disposed)return;const report=imageLoader.snapshot();imageErrors.splice(0,imageErrors.length,...report.errors);const imageRafActive=platform.trustedWorkerTransport===true&&options.autoStart!==false&&typeof platform.requestAnimationFrame==='function'&&rafId!==null&&lastFrame!==null&&!appHidden;if(options.visualReplica!==true&&renderRequested&&!imageRafActive)render();if(typeof options.onAssetStatus==='function')options.onAssetStatus(report);});
      }
    });
    function retryAssets(){const count=imageLoader.retryFailed();if(typeof options.onRetryAssets==='function')options.onRetryAssets();render();return count;}
    const sceneImages=new Map(),sceneThumbs=new Map();
    function loadScene(id,full){
      const cache=full?sceneImages:sceneThumbs,file=(full?SCENE_FILES:SCENE_THUMB_FILES)[id];if(!file||disposed)return null;
      let record=cache.get(id);
      if(record){cache.delete(id);cache.set(id,record);return record.ready?record.image:null;}
      if(full)while(cache.size>=2){const key=cache.keys().next().value;imageLoader.release('scene:'+key);cache.delete(key);}
      record=imageLoader.load((full?'scene:':'thumb:')+id,file);cache.set(id,record);
      return record.ready?record.image:null;
    }
    function sceneArt(id,full){const thumb=loadScene(id,false);return (full?loadScene(id,true):null)||thumb;}
    function illustratedBattle(){return game.status==='ready'?state.level==='endless':game.levelId==='endless';}
    function releaseSceneImages(){
      for(const [cache,prefix] of [[sceneImages,'scene:'],[sceneThumbs,'thumb:']]){for(const key of cache.keys())imageLoader.release(prefix+key);cache.clear();}
    }
    state.renderQuality='high';
    try{
      const sys=(platform.getWindowInfo?platform.getWindowInfo():platform.getSystemInfoSync?platform.getSystemInfoSync():{})||{};
      if(Object.prototype.hasOwnProperty.call(RENDER_QUALITY,sys.preferredRenderQuality))state.renderQuality=sys.preferredRenderQuality;
      const saved=platform.getStorageSync&&platform.getStorageSync(QUALITY_KEY);
      if(Object.prototype.hasOwnProperty.call(RENDER_QUALITY,saved))state.renderQuality=saved;
    }catch(_){}
    let removedDeckSlot=null;
    let savedRun=null,ownsSavedRun=false,autosaveAge=0;
    state.deckPage=0;state.challengeClears={};
    try{const saved=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-challenges-v1');if(saved&&saved.version===1)for(const entry of challengeModule.LEVELS)if(saved.clears&&saved.clears[entry.id]===true)state.challengeClears[entry.id]=true;}catch(_){}
    state.challengeBest=Object.fromEntries(challengeModule.MODES.map(mode=>[mode.id,{waves:0,kills:0,seconds:0}]));
    let challengeBestDirty=false;
    try{
      let saved=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-challenge-endless-v1');
      if(typeof saved==='string')saved=JSON.parse(saved);
      if(saved&&saved.version===1&&saved.records)for(const mode of challengeModule.MODES){
        const record=saved.records[mode.id];
        if(record)for(const key of ['waves','kills','seconds'])if(Number.isSafeInteger(record[key])&&record[key]>=0)state.challengeBest[mode.id][key]=record[key];
      }
    }catch(_){}
    state.saveError='';
    state.saves={selected:1,page:0,returnOverlay:'home',confirm:null,pending:false,error:''};
    state.upgrades={selected:null,perkPage:0,returnOverlay:null,resumeOnClose:false};state.upgradePress=null;
    state.sunSweep=null;state.cardFeedback=null;
    state.autoCollectSun=false;state.autoSunSoundAt=-Infinity;state.endlessSpeed=1;state.endlessGrowthOpen=false;state.speedOpen=false;
    try{state.autoCollectSun=!!platform.getStorageSync&&platform.getStorageSync(AUTO_SUN_KEY)===true;}catch(_){}
    state.shovel=null;state.shovelGesture=null;state.shovelAction=null;state.pointer=null;
    state.endlessMap='garden';
    try{const saved=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-map-v1');if(typeof saved==='string'&&Object.prototype.hasOwnProperty.call(engine.MAPS,saved))state.endlessMap=saved;}catch(_){}
    state.endlessBoardSize='classic';
    try{const saved=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-board-v1');if(engine.ENDLESS_BOARD_SIZES&&Object.prototype.hasOwnProperty.call(engine.ENDLESS_BOARD_SIZES,saved))state.endlessBoardSize=saved;}catch(_){}
    const musicSlots={};
    let musicTransition=null;
    let musicTrack='pajama',musicEnabled=true,musicVolume=.2,musicUnlocked=false,appHidden=false,audioReturn='home';
    try {if(platform.getStorageSync){state.best=Number(platform.getStorageSync('chiikawa-garden-best'))||0;state.audio=platform.getStorageSync('chiikawa-garden-audio')!==false;}}catch(_){}
    try {
      const saved=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-music-v1');
      if(saved&&typeof saved==='object'){
        if(typeof saved.enabled==='boolean')musicEnabled=saved.enabled;
        if(typeof saved.volume==='number'&&Number.isFinite(saved.volume))musicVolume=Math.max(0,Math.min(1,saved.volume));
      }
    }catch(_){}
    try {
      let stored=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-progress-v1');
      if(typeof stored==='string')stored=JSON.parse(stored);
      if(stored&&stored.version===1&&stored.levels&&typeof stored.levels==='object'&&!Array.isArray(stored.levels)){
        levelIds.forEach(id=>{const entry=stored.levels[id];if(entry&&typeof entry==='object'&&entry.cleared===true){
          const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<1e7?Math.floor(value):0;
          state.clears[id]={cleared:true,bestKills:finite(entry.bestKills),bestTime:finite(entry.bestTime)};
        }});
      }
    }catch(_){}
    try {
      let stored=platform.getStorageSync&&platform.getStorageSync('chiikawa-garden-endless-v1');
      if(typeof stored==='string')stored=JSON.parse(stored);
      if(stored&&stored.version===1){
        ['waves','kills','seconds'].forEach(key=>{const value=stored[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER)state.endlessBest[key]=Math.floor(value);});
      }
    }catch(_){}
    const achievements=achievementModule.create(platform);
    achievements.seed({clears:state.clears,challengeClears:state.challengeClears,endlessBest:state.endlessBest,challengeBest:state.challengeBest});
    state.achievements={page:0,filter:'all',category:'all',selected:null,returnOverlay:'home',resumeOnClose:false};
    let achievementToast=null,achievementQueue=[];
    function achievementState(){return Object.assign({},achievements.getState(),state.achievements);}
    function openAchievements(){
      if(disposed||appHidden||state.saves.pending||['strategy-reward','overwrite-save'].includes(state.overlay))return false;
      if(state.overlay==='achievements')return true;
      processEvents();
      const returnOverlay=state.overlay,resumeOnClose=game.status==='playing';
      if(resumeOnClose)pause();
      cancelDrag(false);state.held=null;state.selected=null;state.hover=null;state.speedOpen=false;state.endlessGrowthOpen=false;
      Object.assign(state.achievements,{returnOverlay,resumeOnClose,selected:null,page:0});
      achievements.markSeen();achievements.flush();achievementQueue=[];achievementToast=null;achievements.drainUnlocks();
      state.overlay='achievements';state.toastTime=0;syncMusic();syncFuse();sound('select');render();return true;
    }
    function closeAchievements(){
      if(state.overlay!=='achievements')return false;
      const again=state.achievements.resumeOnClose&&!appHidden&&game.status==='paused';
      state.overlay=state.achievements.returnOverlay;state.achievements.resumeOnClose=false;state.achievements.selected=null;
      achievements.flush();if(again)resume();else{syncMusic();syncFuse();}sound('select');render();return true;
    }
    function achievementEntries(){
      const entries=achievements.getState().entries,a=state.achievements;
      const families=achievementModule.CATEGORIES.map(category=>entries.filter(entry=>entry.category===category.id));
      const ordered=a.category==='all'?Array.from({length:Math.max(...families.map(family=>family.length))},(_,index)=>families.map(family=>family[index]).filter(Boolean)).flat():entries;
      return ordered.filter(entry=>(a.category==='all'||entry.category===a.category)&&(a.filter==='all'||(a.filter==='unlocked')===entry.unlocked));
    }
    function setAchievementFilter(value){if(!['all','unlocked','locked'].includes(value))return false;state.achievements.filter=value;state.achievements.page=0;state.achievements.selected=null;sound('select');render();return true;}
    function setAchievementCategory(value){if(value!=='all'&&!achievementModule.CATEGORIES.some(category=>category.id===value))return false;state.achievements.category=value;state.achievements.page=0;state.achievements.selected=null;sound('select');render();return true;}
    function setAchievementPage(value){const count=Math.max(1,Math.ceil(achievementEntries().length/6));state.achievements.page=Math.max(0,Math.min(count-1,Math.floor(Number(value))||0));state.achievements.selected=null;sound('select');render();return true;}
    function trackAchievementEvent(event){
      switch(event.type){
        case 'start':{const map=game.getMap(),theme=(game.isEndless&&map.theme)||game.level.theme;achievements.unique('maps',map.id);if(theme==='night'||theme==='moon')achievements.record('nights');if(challenges.state)achievements.unique('challenges',challenges.state.mode);break;}
        case 'plant':achievements.record('plants');achievements.unique('plantKinds',event.plantType);if(game.getTerrain(event.row,event.col).kind==='water')achievements.record('waterPlants');break;
        case 'sun':achievements.record('sun',event.value);break;
        case 'defeat':achievements.record('kills');break;
        case 'shoot':achievements.record('shots');if(event.plantType==='stormreed')achievements.record('stormShots');break;
        case 'explosion':achievements.record('explosions');break;
        case 'mower':achievements.record('mowers');break;
        case 'shovel':achievements.record('shovels');break;
        case 'support':if(event.plantType==='kani'&&event.healed>0)achievements.record('healPulses');break;
        case 'plantLevelUp':achievements.max('growthLevel',event.level);if(event.source==='sun')achievements.record('upgrades');break;
        case 'waveClear':if(game.isEndless)achievements.max('endlessWave',event.wave);break;
        case 'challengeWaveClear':achievements.max('challengeWave',event.wave);break;
        case 'win':if(challenges.state&&!challenges.state.endless)achievements.unique('challengeClears',challenges.state.id);else if(!game.isEndless)achievements.unique('clears',game.levelId);break;
      }
    }
    function updateAchievementToast(dt){
      const unlocked=achievements.drainUnlocks();
      if(unlocked.length){achievementQueue.push(...unlocked.map(entry=>Object.assign({},entry)));if(achievementQueue.length>6){const removed=achievementQueue.splice(5);achievementQueue[4].folded=(achievementQueue[4].folded||0)+removed.reduce((n,e)=>n+1+(e.folded||0),0);}renderRequested=true;}
      if(achievementToast){achievementToast.time-=dt;if(achievementToast.time<=0){achievementToast=null;renderRequested=true;}}
      if(!achievementToast&&achievementQueue.length&&!state.overlay&&!tutorial.getState().active&&!appHidden){achievementToast=Object.assign({},achievementQueue.shift(),{time:4.2});sound('select');renderRequested=true;}
    }
    function levelInfo(id) {return id==='endless'?engine.ENDLESS:engine.LEVELS[id]||engine.LEVELS.meadow;}
    // Only a complete, validated checkpoint is offered as a resumable run.
    function readEndlessRun(restoreRequest) {return restoreRequest===preparedRestoreRequest&&preparedAutoReader?preparedAutoReader.latest():autoHistory.latest();}
    // The private slot-read path receives detached data from the save library.
    // Public overrides keep the complete original two-import validation path.
    const preparedRestoreRequest=Symbol('private slot restore'),preparedRestoreTokens=new WeakMap();
    const preparedRestoreApi=engine.preparedEndlessRestores&&engine.preparedEndlessRestores.version===1?engine.preparedEndlessRestores:null;
    const preparedRestoreStringify=JSON.stringify,preparedRestoreParse=JSON.parse,preparedRestoreNativeJson=Function.prototype.toString.call(JSON.stringify).includes('[native code]')&&Function.prototype.toString.call(JSON.parse).includes('[native code]');
    function ordinaryRestoreEnvironmentSafe(){
      if(!preparedRestoreNativeJson||JSON.stringify!==preparedRestoreStringify||JSON.parse!==preparedRestoreParse||Object.getPrototypeOf(Object.prototype)!==null||Object.getPrototypeOf(Array.prototype)!==Object.prototype||Object.getOwnPropertyDescriptor(Object.prototype,'toJSON')||Object.getOwnPropertyDescriptor(Array.prototype,'toJSON'))return false;
      return true;
    }
    function ordinaryRestoreCheckpoint(value){
      if(!ordinaryRestoreEnvironmentSafe())return false;
      const seen=new Set(),budget={left:2000000};
      function plain(item,depth){
        if(--budget.left<0||depth>24)return false;
        if(item===null||item===undefined||typeof item==='string'||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)&&!Object.is(item,-0))return true;
        if(!item||typeof item!=='object'||seen.has(item))return false;
        const prototype=Object.getPrototypeOf(item),array=Array.isArray(item);
        if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)return false;
        if(array&&item.length>20000)return false;
        const keys=Object.keys(item);if(!array&&keys.length>256||Object.getOwnPropertyDescriptor(item,'toJSON')||Object.getOwnPropertyNames(item).length!==keys.length+(array?1:0))return false;
        seen.add(item);
        for(const key of keys){
          if(key==='__proto__'||key==='constructor'||key==='prototype'||key==='toJSON')return false;
          const descriptor=Object.getOwnPropertyDescriptor(item,key);
          if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||!plain(descriptor.value,depth+1))return false;
        }
        seen.delete(item);return true;
      }
      try{return plain(value,0);}catch(_){return false;}
    }
    function validateCheckpoint(value,restoreRequest) {
      if(!value||value.version!==1||!Number.isFinite(value.savedAt)||value.savedAt<0||
        !Array.isArray(value.deck)||![8,deckSize].includes(value.deck.length)||new Set(value.deck).size!==value.deck.length||
        !value.deck.every(type=>plantIds.includes(type))||!ENDLESS_SPEEDS.includes(value.speed)||
        (value.autoCollectSun!==undefined&&typeof value.autoCollectSun!=='boolean'))throw new Error('invalid checkpoint');
      const mayPrepare=restoreRequest===preparedRestoreRequest&&preparedRestoreApi&&typeof preparedRestoreApi.acceptsConstructor==='function'&&preparedRestoreApi.acceptsConstructor(engine.Game)&&typeof preparedRestoreApi.acceptsDependencies==='function'&&preparedRestoreApi.acceptsDependencies(runDirector)&&typeof preparedRestoreApi.prepare==='function'&&typeof preparedRestoreApi.describe==='function'&&typeof preparedRestoreApi.commit==='function'&&(ordinaryRestoreEnvironmentSafe()&&nativeRestoreDependencies&&nativeRestoreDependencies.certifiesAutosave(autoSaves)&&autoSaves.preparedRestoreReads.inputProven(value,validateCheckpoint,restoreRequest)||ordinaryRestoreCheckpoint(value));
      const prepared=mayPrepare?preparedRestoreApi.prepare(value.game):null;
      if(prepared===false)throw new Error('invalid game state');
      const probe=prepared?preparedRestoreApi.describe(prepared):new engine.Game();
      if(!probe||!prepared&&!probe.importEndlessSave(value.game))throw new Error('invalid game state');
      const checkpoint=JSON.parse(JSON.stringify(value));
      if(runDirector){
        const outer=value.strategy===undefined?null:runDirector.restoreState(value.strategy,probe,plantIds);
        if(value.game.strategy!==undefined&&outer&&JSON.stringify(outer)!==JSON.stringify(probe.strategy))throw new Error('conflicting strategy checkpoint');
        checkpoint.strategy=value.game.strategy!==undefined?probe.strategy:outer||probe.strategy;
        checkpoint.game.strategy=JSON.parse(JSON.stringify(checkpoint.strategy));
      }
      // Keep the player's original card order when opening an eight-card save.
      for(const type of defaultDeck.concat(plantIds))if(checkpoint.deck.length<deckSize&&!checkpoint.deck.includes(type))checkpoint.deck.push(type);
      if(prepared)preparedRestoreTokens.set(checkpoint,prepared);
      return checkpoint;
    }
    function savedSummary() {
      if(!savedRun)return null;
      const s=savedRun.game.state;
      return {savedAt:savedRun.savedAt,wave:s.wave,wavesCleared:s.wavesCleared,mapId:s.mapId,boardSize:s.endlessBoardSize||'classic',seconds:Math.floor(s.time)};
    }
    // Browser-only opt-in; every public/object storage adapter keeps its contract.
    const autosaveRawText=platform.autosaveRawText===true&&typeof platform.getStorageTextSync==='function'&&typeof platform.setStorageTextSync==='function'&&typeof platform.removeStorageTextSync==='function'?{
      get:key=>platform.getStorageTextSync(key),set:(key,text)=>platform.setStorageTextSync(key,text),remove:key=>platform.removeStorageTextSync(key)
    }:null;
    const preparedAutoCapability=autosaveRawText&&preparedRestoreApi&&nativeRestoreDependencies&&nativeRestoreDependencies.certifiesAutosave(autoSaves)&&preparedRestoreApi.acceptsConstructor(engine.Game)&&preparedRestoreApi.acceptsDependencies(runDirector)?Object.freeze({version:1,request:preparedRestoreRequest,
      take(checkpoint){const token=preparedRestoreTokens.get(checkpoint);if(token)preparedRestoreTokens.delete(checkpoint);return token||null;},
      attach(checkpoint,token){if(preparedRestoreApi.acceptsConstructor(engine.Game)&&preparedRestoreApi.describe(token))preparedRestoreTokens.set(checkpoint,token);}
    }):null;
    const autoHistory=autoSaves.create({platform,validateCheckpoint,legacyKey:ENDLESS_SAVE_KEY,rawText:autosaveRawText,preparedRestore:preparedAutoCapability});
    const preparedAutoReader=preparedAutoCapability&&autoSaves.preparedRestoreReads&&autoSaves.preparedRestoreReads.version===1&&typeof autoSaves.preparedRestoreReads.reader==='function'?autoSaves.preparedRestoreReads.reader(autoHistory,preparedAutoCapability):null;
    let autoEntries=[],autoReadError='';
    function refreshAutoHistory(){try{autoEntries=autoHistory.list();autoReadError=autoHistory.getErrors().length?'部分自动保存版本无法读取，可选其他可恢复版本。':'';}catch(_){autoEntries=[];autoReadError='自动保存历史无法读取，原数据已保留。';}}
    function isAutoSlot(id){return typeof id==='string'&&/^auto(?::[012])?$/.test(id);}
    function autoSlotIndex(id){return isAutoSlot(id)?(id==='auto'?0:Number(id.split(':')[1])):-1;}
    refreshAutoHistory();
    try{savedRun=readEndlessRun();}catch(_){state.saveError='旧存档无法读取，可能已损坏或版本不兼容。可以新开一局。';}
    const saveSlots=saveLibrary.create({platform,validateCheckpoint});
    const SAVE_PAGE_SIZE=6,SAVE_PAGE_COUNT=Math.ceil(saveLibrary.SLOT_COUNT/SAVE_PAGE_SIZE);
    let slotEntries=Array(saveLibrary.SLOT_COUNT).fill(null),unreadableSlots=new Set(),slotReadError='';
    function refreshSlots(){
      try{slotEntries=saveSlots.list();unreadableSlots=new Set(saveSlots.getErrors().map(error=>error.id));slotReadError=unreadableSlots.size?'部分存档未能读取，其余存档仍可使用。':'';}
      catch(_){slotEntries=Array(saveLibrary.SLOT_COUNT).fill(null);unreadableSlots=new Set();slotReadError='手动存档库无法读取；原数据已保留，自动存档仍可使用。';}
    }
    // Metadata is refreshed on entry and writes, never by the animation loop.
    refreshSlots();
    function invalidatePeriodicCheckpoint(){if(options.nativePeriodicCheckpoint===true)periodicGeneration++;initialSaveGeneration++;initialSaveRequest=null;}
    function periodicCheckpointCurrent(generation,run,factory){
      const current=simulation&&simulation.state();
      return !disposed&&!appHidden&&!threadedTask&&checkpointActive()&&game.status==='playing'&&
        options.nativePeriodicCheckpoint===true&&platform.nativePeriodicCheckpointVersion===1&&platform.trustedWorkerTransport===true&&platform.createSimulationWorker===factory&&
        periodicGeneration===generation&&current&&current.active&&!current.failed&&current.runId===run;
    }
    function savePeriodicEndlessRun(){
      if(options.nativePeriodicCheckpoint!==true||platform.nativePeriodicCheckpointVersion!==1||platform.trustedWorkerTransport!==true||options.autoStart===false||!threadedActive()||!simulation||typeof simulation.capturePeriodicCheckpoint!=='function')return saveEndlessRun({silent:true});
      if(periodicTask)return periodicTask;
      const generation=periodicGeneration,run=simulation.state().runId,factory=platform.createSimulationWorker;
      if(!periodicCheckpointCurrent(generation,run,factory))return false;
      // Own caller-side metadata at request admission; UI changes while the
      // worker drains debt cannot change the detached checkpoint envelope.
      const metadata={deck:state.deck.slice(),speed:state.endlessSpeed,autoCollectSun:state.autoCollectSun};
      const reply=simulation.capturePeriodicCheckpoint();
      if(reply===null)return saveEndlessRun({silent:true});
      const operation=Promise.resolve(reply).then(value=>{
        if(!periodicCheckpointCurrent(generation,run,factory))return false;
        // Achievement/event work owns the original checkpoint tracking scope,
        // but event-triggered saves must still use the full ordinary barrier.
        threadedSaveDepth++;periodicEventDepth++;
        try{processEvents();}finally{periodicEventDepth--;threadedSaveDepth--;}
        if(!value||!periodicCheckpointCurrent(generation,run,factory))return false;
        const next={version:1,savedAt:Date.now(),deck:metadata.deck,speed:metadata.speed,autoCollectSun:metadata.autoCollectSun,game:value.game,strategy:value.strategy};
        // Keep all original history copy/encode/import validation, readback,
        // byte budgets, raw format and rollback. Never import this into live game.
        writeCheckpoint(next);savedRun=next;ownsSavedRun=true;autosaveAge=0;state.saveError='';return true;
      }).catch(()=>{
        if(periodicCheckpointCurrent(generation,run,factory)){state.saveError='保存失败：本机存储不可用或空间不足。请勿关闭页面，稍后重试。';notice(state.saveError,6);}
        return false;
      }).finally(()=>{if(periodicTask===operation)periodicTask=null;});
      periodicTask=operation;return operation;
    }
    function captureCheckpoint(){
      if(disposed||!checkpointActive())throw new Error('no active endless run');
      const snapshot=game.exportEndlessSave();if(!snapshot)throw new Error('snapshot unavailable');
      return {version:1,savedAt:Date.now(),deck:state.deck.slice(),speed:state.endlessSpeed,autoCollectSun:state.autoCollectSun,game:snapshot,strategy:game.strategy?JSON.parse(JSON.stringify(game.strategy)):undefined};
    }

    function initialSaveBoundaryCurrent(request){
      const current=simulation&&simulation.state();
      return request===initialSaveRequest&&initialSaveGeneration===request.generation&&periodicGeneration===request.periodicGeneration&&!disposed&&!appHidden&&!threadedTask&&!threadedSaveDepth&&current&&!current.active&&!current.failed&&current.runId===request.runId&&checkpointActive()&&game.status==='paused'&&game.status===request.status&&game.time===request.time&&game.wave===request.wave&&game.plants===request.plants&&game.supports===request.supports&&game.enemies===request.enemies&&game.projectiles===request.projectiles&&game.suns===request.suns&&game.effects===request.effects&&game.perkFields===request.perkFields&&game.perkActions===request.perkActions&&game.mowers===request.mowers&&game.strategy===request.strategy&&(!game.strategy||game.strategy.pending===request.reward)&&state.overlay===request.overlay&&state.level===request.level&&state.deck===request.deck&&state.endlessSpeed===request.speed&&state.autoCollectSun===request.autoCollectSun&&savedRun===request.savedRun&&ownsSavedRun&&state.saveError===''&&options.nativeCheckpointTaskBoundary===true&&options.autoStart!==false&&options.worker!==false&&platform.trustedWorkerTransport===true&&platform.checkpointTaskBoundaryVersion===1&&platform.yieldCheckpointTask===request.yield&&platform.createSimulationWorker===request.factory&&platform.requestAnimationFrame===request.raf&&rafId!==null;
    }
    function finishInitialSaveBoundary(next){
      // Capture, validation, storage readback, history and UI state already
      // completed in saveEndlessRun. This capability only delays its success.
      // Default, manual, hidden, unknown and active Worker callers stay sync.
      if(options.nativeCheckpointTaskBoundary!==true||options.autoStart===false||options.worker===false||!simulation||disposed||appHidden||threadedTask||threadedSaveDepth||game.status!=='paused'||platform.trustedWorkerTransport!==true||platform.checkpointTaskBoundaryVersion!==1||typeof platform.yieldCheckpointTask!=='function'||typeof platform.createSimulationWorker!=='function'||typeof platform.requestAnimationFrame!=='function'||rafId===null)return true;
      const current=simulation.state();if(current.active||current.failed)return true;
      const request={generation:initialSaveGeneration,periodicGeneration,runId:current.runId,status:game.status,time:game.time,wave:game.wave,plants:game.plants,supports:game.supports,enemies:game.enemies,projectiles:game.projectiles,suns:game.suns,effects:game.effects,perkFields:game.perkFields,perkActions:game.perkActions,mowers:game.mowers,strategy:game.strategy,reward:game.strategy&&game.strategy.pending,overlay:state.overlay,level:state.level,deck:state.deck,speed:state.endlessSpeed,autoCollectSun:state.autoCollectSun,savedRun:next,yield:platform.yieldCheckpointTask,factory:platform.createSimulationWorker,raf:platform.requestAnimationFrame};
      initialSaveRequest=request;
      // No raw checkpoint enters the scheduler and no capture, write, render,
      // transition or repeat save happens on the far side of the task boundary.
      return Promise.resolve().then(()=>initialSaveBoundaryCurrent(request)?request.yield.call(platform):false).then(()=>initialSaveBoundaryCurrent(request)).catch(()=>false).finally(()=>{if(initialSaveRequest===request)initialSaveRequest=null;});
    }
    function checkpointActive(){return game.isEndless&&['playing','paused'].includes(game.status);}
    function writeCheckpoint(value) {const result=value===null?autoHistory.finish():autosaveRawText&&typeof autoHistory.saveForRuntime==='function'?autoHistory.saveForRuntime(value):autoHistory.save(value);refreshAutoHistory();return result;}
    function saveEndlessRun(options={}) {
      invalidatePeriodicCheckpoint();
      if(disposed||!checkpointActive())return false;
      if(threadedActive()&&(!threadedSaveDepth||periodicEventDepth>0))return withThreadCheckpoint(()=>saveEndlessRun(options));
      try {
        const next=captureCheckpoint();
        writeCheckpoint(next);savedRun=next;ownsSavedRun=true;autosaveAge=0;state.saveError='';
        if(!options.silent)notice('进度已保存，下次可从无尽讨伐继续。');
        return finishInitialSaveBoundary(next);
      }catch(_){state.saveError='保存失败：本机存储不可用或空间不足。请勿关闭页面，稍后重试。';notice(state.saveError,6);return false;}
    }
    function saveAndHome(){if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>saveAndHome(),true);if(!saveEndlessRun())return false;return home(true);}
    function continueEndless(checkpointOverride,restoreRequest) {
      invalidatePeriodicCheckpoint();
      if(disposed)return false;
      if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>{if(checkpointActive()&&!saveEndlessRun({silent:true}))return false;return continueEndless(checkpointOverride,restoreRequest);},true,{prepare:()=>!checkpointActive()||saveEndlessRun({silent:true}),commit:()=>continueEndless(checkpointOverride,restoreRequest)});
      processEvents();achievements.flush();achievementToast=null;achievementQueue=[];
      try {
        const checkpoint=checkpointOverride?validateCheckpoint(checkpointOverride,restoreRequest):readEndlessRun(preparedRestoreRequest);
        if(simulation)simulation.stop();
        tutorial.cancel();
        saveChallengeBest();
        const prepared=checkpoint&&preparedRestoreTokens.get(checkpoint);
        if(prepared)preparedRestoreTokens.delete(checkpoint);
        if(!checkpoint||!(prepared&&preparedRestoreApi.commit(game,prepared)||game.importEndlessSave(checkpoint.game)))throw new Error('missing checkpoint');
        if(runDirector)game.strategy=runDirector.restoreState(checkpoint.strategy,game,plantIds);
        challenges.clear();savedRun=checkpoint;ownsSavedRun=true;autosaveAge=0;state.saveError='';
        cancelDrag(false);state.upgradePress=null;state.held=null;state.selected=null;state.cardFeedback=null;
        state.sunSweep=null;state.pointer=null;clearShovel();state.shovelAction=null;sunCollection.reset();
        state.hover=null;state.hoverTime=0;state.autoSunSoundAt=-Infinity;
        state.level='endless';state.endlessMap=game.mapId;state.endlessBoardSize=game.endlessBoardSize||'classic';state.deck=checkpoint.deck.slice();state.pendingDeck=state.deck.slice();
        state.endlessSpeed=checkpoint.speed;state.upgrades={selected:null,perkPage:0,returnOverlay:null,resumeOnClose:false};
        if(typeof checkpoint.autoCollectSun==='boolean')state.autoCollectSun=checkpoint.autoCollectSun;
        state.speedOpen=false;state.saves.confirm=null;
        state.overlay=game.strategy&&game.strategy.pending?'strategy-reward':'pause';lastStatus='paused';lastFrame=null;
        const burnedRequest=warmNativeStatic(state.level,state.deck);
        const finish=()=>{notice('已恢复第 '+game.wave+' 波，点「继续讨伐」开始。');syncMusic();syncFuse();render();return true;};
        const result=finishBurnedWarmup(burnedRequest,finish);
        return result&&typeof result.then==='function'?result.catch(()=>{state.saveError='存档无法读取，当前进度没有改变。';notice(state.saveError,5);render();return false;}):result;
      }catch(_){state.saveError='存档无法读取，当前进度没有改变。';notice(state.saveError,5);render();return false;}
    }
    function slotFailure(message){state.saves.error=message;notice(message,5);render();return false;}
    function openSaves(){
      if(disposed||state.saves.pending)return false;
      state.saves.returnOverlay=state.overlay&&state.overlay!=='saves'?state.overlay:'pause';
      if(game.status==='playing'){pause();state.saves.returnOverlay='pause';}
      cancelDrag(false);state.held=null;state.selected=null;state.hover=null;state.speedOpen=false;
      state.saves.confirm=null;state.saves.error='';state.overlay='saves';
      refreshSlots();refreshAutoHistory();
      try{savedRun=readEndlessRun();}catch(_){state.saves.error='自动存档无法读取，手动存档仍可使用。';}
      syncMusic();syncFuse();sound('select');render();return true;
    }
    function closeSaves(){
      if(state.saves.pending)return false;
      state.saves.confirm=null;state.overlay=state.saves.returnOverlay||'home';render();return true;
    }
    function selectSaveSlot(id){
      state.saves.selected=id;state.saves.error='';
      if(!isAutoSlot(id))state.saves.page=Math.floor((id-1)/SAVE_PAGE_SIZE);
    }
    function changeSavePage(delta){
      if(state.saves.pending||state.saves.confirm)return;
      const page=Math.max(0,Math.min(SAVE_PAGE_COUNT-1,state.saves.page+delta));
      if(page===state.saves.page)return;
      const offset=isAutoSlot(state.saves.selected)?0:(state.saves.selected-1)%SAVE_PAGE_SIZE;
      selectSaveSlot(Math.min(saveLibrary.SLOT_COUNT,page*SAVE_PAGE_SIZE+offset+1));
      sound('select');render();
    }
    function saveSlot(id,name){
      invalidatePeriodicCheckpoint();
      if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>saveSlot(id,name));
      try{processEvents();saveSlots.save(id,captureCheckpoint(),name);achievements.record('saves');achievements.flush();refreshSlots();selectSaveSlot(id);notice('已保存到存档 '+id+'，自动保存不会覆盖它。');render();return true;}
      catch(_){return slotFailure(checkpointActive()?'保存失败，请检查本机存储空间。':'请在无尽讨伐进行中保存战局。');}
    }
    function loadSlot(id){
      if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>loadSlot(id),true);
      try{
        const checkpoint=isAutoSlot(id)?autoHistory.get(autoSlotIndex(id)):saveSlots.get(id);
        if(!checkpoint)throw new Error('empty slot');
        // Preserve the outgoing run if storage is unavailable; never discard it after a failed write.
        if(checkpointActive()&&!saveEndlessRun({silent:true}))return slotFailure('当前战局未能自动保存，暂未读取其他存档。');
        if(!continueEndless(checkpoint,preparedRestoreRequest))return false;
        saveEndlessRun({silent:true});return true;
      }catch(_){return slotFailure('读取失败：存档为空或已损坏，当前战局没有改变。');}
    }
    function renameSlot(id,name){
      try{saveSlots.rename(id,name);refreshSlots();state.saves.error='';notice('存档名称已更新。');render();return true;}
      catch(_){return slotFailure('改名失败，请检查名称和本机存储。');}
    }
    function deleteSlot(id){
      try{const removed=saveSlots.remove(id);refreshSlots();state.saves.error='';if(removed)notice('已删除这个手动存档。');render();return removed;}
      catch(_){return slotFailure('删除失败，存档仍保留在本机。');}
    }
    function exportSlot(id){
      try{return saveSlots.exportSlot(id);}catch(_){return slotFailure('此存档无法导出。');}
    }
    function importSlot(id,text){
      try{saveSlots.importSlot(id,text);refreshSlots();selectSaveSlot(id);notice('备份已导入，可点击读取继续讨伐。');render();return true;}
      catch(_){return slotFailure('导入失败：请选择有效的游戏存档文件，原存档未改变。');}
    }
    function confirmSaveAction(){
      const task=state.saves.confirm;state.saves.confirm=null;if(!task)return;
      if(task.action==='save')saveSlot(task.id);
      else if(task.action==='load')loadSlot(task.id);
      else if(task.action==='delete')deleteSlot(task.id);
      else if(task.action==='import')importSlot(task.id,task.text);
      render();
    }
    function requestSaveAction(action,id,text){
      if(state.saves.pending)return;
      refreshSlots();
      const occupied=isAutoSlot(id)?autoEntries.some(row=>row.index===autoSlotIndex(id)):!!slotEntries[id-1]||unreadableSlots.has(id);
      if((action==='save'||action==='import')&&occupied||action==='delete'||action==='load'&&['playing','paused'].includes(game.status)){
        state.saves.confirm={action,id,text};render();return;
      }
      state.saves.confirm={action,id,text};confirmSaveAction();
    }
    async function editSlotName(id){
      const slot=slotEntries[id-1];if(!slot||state.saves.pending)return;
      if(!platform.requestText)return slotFailure('当前平台不支持输入名称，请在网页版改名。');
      state.saves.pending=true;render();
      try{const name=await platform.requestText({title:'为存档取个名字',value:slot.name,maxLength:20});if(!disposed&&name!==null)renameSlot(id,name);}
      catch(_){slotFailure('未能修改名称。');}
      finally{state.saves.pending=false;if(!disposed)render();}
    }
    async function downloadSlot(id){
      if(!platform.writeTextFile)return slotFailure('请在网页版导出存档文件。');
      const text=exportSlot(id);if(!text)return;
      try{await platform.writeTextFile({name:'吉伊花园-存档'+id+'.json',contents:text});notice('存档备份已导出。');render();}
      catch(_){slotFailure('导出失败，请重试。');}
    }
    async function chooseSlotFile(id){
      if(state.saves.pending)return;
      if(!platform.readTextFile)return slotFailure('请在网页版导入存档文件。');
      state.saves.pending=true;render();
      try{const text=await platform.readTextFile();state.saves.pending=false;if(!disposed&&text!==null)requestSaveAction('import',id,text);}
      catch(_){slotFailure('文件未能读取，请选择不超过 8 MB 的 JSON 存档。');}
      finally{state.saves.pending=false;if(!disposed)render();}
    }
    function clearFinishedRun() {
      if(!ownsSavedRun)return;
      try{writeCheckpoint(null);savedRun=null;ownsSavedRun=false;state.saveError='';}
      catch(_){state.saveError='本次讨伐已结束，但未能清除旧存档。';notice(state.saveError,5);}
    }
    function requestStart(){
      const map=mapForLevel(levelInfo(state.level));
      if(map.tiles.every(row=>row.every(kind=>kind==='water'))&&!state.pendingDeck.some(type=>engine.PLANTS[type]&&engine.PLANTS[type].support)){
        notice('全水地图需要荷叶承载伙伴，请先带上一张荷叶卡。',4);sound('deny');render();return;
      }
      if(state.level==='endless'&&savedRun){state.overlay='overwrite-save';render();return;}
      start(state.level,state.pendingDeck);
    }
    function mapForLevel(level){
      if(engine.getEndlessMap&&(level.id==='endless'||level.id==='map-preview'))return engine.getEndlessMap(level.id==='map-preview'?level.mapId:state.endlessMap,state.endlessBoardSize);
      return engine.MAPS[level.mapId]||engine.MAPS.garden;
    }
    function boardSize(id){return engine.ENDLESS_BOARD_SIZES&&engine.ENDLESS_BOARD_SIZES[id]||{id:'classic',name:'经典',rows:5,cols:9,countScale:1,hpScale:1};}
    function boardLabel(id){const board=boardSize(id);return board.cols+'列 × '+board.rows+'行';}
    function selectBoardSize(id){
      if(state.overlay!=='endless'||!engine.ENDLESS_BOARD_SIZES||!Object.prototype.hasOwnProperty.call(engine.ENDLESS_BOARD_SIZES,id))return false;
      state.endlessBoardSize=id;
      try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-board-v1',id);}catch(_){}
      sound('select');render();return true;
    }
    function syncGrid(){
      const board=game.status==='ready'&&state.level==='endless'?boardSize(state.endlessBoardSize):game.getBoard?game.getBoard():boardSize('classic');
      if(illustratedBattle()){
        const map=game.status==='ready'?mapForLevel(levelInfo(state.level)):game.getMap();
        Object.assign(GRID,terrainRenderer.sceneGrid(map,sceneWidth(),H,mobileBoardBounds?{boardBounds:mobileBoardBounds}:undefined));
      }else {const b=mobileBoardBounds||{x:64,y:128,w:1152,h:800};Object.assign(GRID,{x:b.x,y:b.y,rows:board.rows,cols:board.cols,w:b.w/board.cols,h:b.h/board.rows});delete GRID.sceneTransform;delete GRID.plantingAnchorY;}
    }
    function unitScale(){return Math.min(GRID.w/128,GRID.h/160);}
    function rowAnchorDelta(){return (Number.isFinite(GRID.plantingAnchorY)?GRID.plantingAnchorY:.9)-.9;}
    function selectMap(id){
      if(state.overlay!=='endless'||!Object.prototype.hasOwnProperty.call(engine.MAPS,id))return false;
      state.endlessMap=id;try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-map-v1',id);}catch(_){}
      sound('select');render();return true;
    }
    function setAutoCollectSun(enabled){
      if(disposed)return false;
      state.autoCollectSun=enabled===true;
      try{if(platform.setStorageSync)platform.setStorageSync(AUTO_SUN_KEY,state.autoCollectSun);}catch(_){}
      sound('select');render();return state.autoCollectSun;
    }
    function effectiveSpeed(){return ['playing','paused'].includes(game.status)?state.endlessSpeed:1;}
    function setEndlessSpeed(value){
      if(disposed||!ENDLESS_SPEEDS.includes(value))return false;
      state.endlessSpeed=value;state.speedOpen=false;
      if(threadedActive())simulation.setSpeed(value);
      if(state.held)updateDragTarget(state.held);
      if(state.shovel)updateShovelTarget(state.shovel);
      sound('select');render();return true;
    }
    function toggleSpeedSelector(id){
      state.speedOpen=state.speedOpen===id?false:id;state.endlessGrowthOpen=false;
      if(state.held)updateDragTarget(state.held);
      if(state.shovel)updateShovelTarget(state.shovel);
      sound('select');render();return true;
    }
    function setEndlessGrowthRate(rate){
      if(disposed||!game.setEndlessGrowthRate(rate))return false;
      state.endlessGrowthOpen=false;
      const saved=saveEndlessRun({silent:true});
      if(saved)notice('加难速度：'+engine.ENDLESS_GROWTH_RATES[rate].label+' · 下波起生效',2.5);
      sound('select');render();return true;
    }
    function toggleEndlessGrowth(){
      if(!game.isEndless||state.overlay||game.status!=='playing')return false;
      state.speedOpen=false;
      state.endlessGrowthOpen=!state.endlessGrowthOpen;
      if(state.held)updateDragTarget(state.held);
      if(state.shovel)updateShovelTarget(state.shovel);
      sound('select');render();return true;
    }
    // The album has 48 illustrations; decode only the visible badges and toast.
    // They remain in ASSET_FILES so both web and offline releases contain them.
    const ready=Promise.all(Object.keys(IMAGE_FILES).filter(key=>!ACHIEVEMENT_IMAGE_KEYS.has(key)).map(key=>imageLoader.load('asset:'+key,IMAGE_FILES[key]).firstAttempt.then(image=>image?key:null))).then(loaded=>({loaded:loaded.filter(Boolean),failed:imageLoader.snapshot().errors.slice()}));
    // Menu layers already contain alpha (scripts/build-home-layers.py).
    // Direct drawing also works on file:// pages, where pixel readback is blocked.
    function imageSource(key,x,y,w,h,source) {
      if(!imageReady[key])return false;
      if(drawingFixedHUD&&fixedHUDImageCache.draw(ctx,key,images[key],source,x,y,w,h,fixedHUDAssetGeneration[key]||0,imageReady[key]))return true;
      if(source)ctx.drawImage(images[key],source.x,source.y,source.w,source.h,x,y,w,h);
      else ctx.drawImage(images[key],x,y,w,h);
      return true;
    }
    function image(key,x,y,w,h) {return imageSource(key,x,y,w,h,IMAGE_SOURCE_RECTS[key]);}
    function drawFixedHUD(){drawingFixedHUD=true;try{drawHUD();}finally{drawingFixedHUD=false;}}
    function smoothImages(context){context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';}

    function releaseFixedHUDCachedSurface(surface,onReleased){
      const release=()=>{if(motion&&motion.unregisterSceneImage)motion.unregisterSceneImage(surface);surface.width=0;surface.height=0;onReleased();};
      if(sceneImageRetire){try{if(sceneImageRetire(surface,release)===true)return;}catch(_){} }
      release();
    }
    function releaseCachedSurface(surface){
      const release=()=>{if(motion&&motion.unregisterSceneImage)motion.unregisterSceneImage(surface);surface.width=0;surface.height=0;};
      if(sceneImageRetire){try{if(sceneImageRetire(surface,release)===true)return;}catch(_){} }
      release();
    }

    function clearSurfaceCache(cache,retained){if(cache===terrainCache)deviceBackgroundCache.clear();for(const [key,surface]of cache){
      if(retained&&retained.has(surface))continue;
      releaseCachedSurface(surface);cache.delete(key);
    }}
    function keepSurface(cache,key,surface,maxEntries,pixelLimit){
      let pixels=0;for(const item of cache.values())pixels+=item.width*item.height;
      const incoming=surface.width*surface.height;
      while(cache.size&&(cache.size>=maxEntries||pixels+incoming>pixelLimit)){
        const oldest=cache.keys().next().value,item=cache.get(oldest);pixels-=item.width*item.height;
        releaseCachedSurface(item);cache.delete(oldest);
      }
      cache.set(key,surface);
    }
    function scenePixelScale(){
      // Cache at the display density too; enlarging a 1x cache loses the detail
      // gained by the main canvas. Quantize to avoid churn on small resizes.
      const quality=RENDER_QUALITY[state.renderQuality];
      return Math.min(quality.maxRatio,Math.max(1,Math.ceil(view.scale*view.pixelRatio*4)/4),Math.sqrt(quality.pixels/(view.logicalWidth*H)),8192/Math.max(view.logicalWidth,H));
    }
    function setRenderQuality(value){
      if(disposed||!Object.prototype.hasOwnProperty.call(RENDER_QUALITY,value))return false;
      state.renderQuality=value;
      try{if(platform.setStorageSync)platform.setStorageSync(QUALITY_KEY,value);}
      catch(_){notice('本次已切换画质，设置暂未保存。',4);}
      resize();if(game.status==='paused')warmNativeStatic(state.level,state.deck);return true;
    }
    function notice(text,duration=3){state.toast=String(text);state.toastTime=duration;}
    function prepareSound(kind){
      if(options.visualReplica===true)return;
      if(audio[kind]||platform.playSound||!platform.createInnerAudioContext)return;
      const a=platform.createInnerAudioContext();a.src=assetRoot+'audio/'+kind+'.wav';a.volume=kind==='shoot'?.18:kind==='cherry'?.72:kind==='fire'?.65:.55;
      if(a.onError)a.onError(function(){if(!audioFailure){audioFailure=true;notice('音效未加载，画面与玩法不受影响');}});
      audio[kind]=a;
    }
    function sound(kind,offset=0) {
      if(options.visualReplica===true)return;
      if(!state.audio||disposed)return;
      try {
        if(platform.playSound){platform.playSound(kind,offset);return;}
        if(!platform.createInnerAudioContext)return;
        if(kind==='deny'||kind==='cancel')kind='select';
        prepareSound(kind);
        if(audio[kind].stop)audio[kind].stop();if(offset&&audio[kind].seek)audio[kind].seek(offset);audio[kind].play();
      }catch(_){if(!audioFailure){audioFailure=true;notice('当前设备暂时无法播放音效');}}
    }
    let soundingFuse=null;
    function syncFuse(){
      if(options.visualReplica===true)return;
      const plant=game.status==='playing'&&state.audio&&!disposed&&!appHidden?game.plants.find(p=>p.hp>0&&engine.PLANTS[p.type].fuse):null;
      const id=plant?plant.id:null;if(id===soundingFuse)return;
      if(soundingFuse!==null){if(platform.stopSound)platform.stopSound('fuse');if(audio.fuse&&audio.fuse.stop)audio.fuse.stop();}
      soundingFuse=id;if(plant)sound('fuse',Math.min(.99,plant.fuseAge||plant.age||0));
    }
    function musicShouldPlay(){return !disposed&&musicEnabled&&musicUnlocked&&!appHidden&&game.status!=='paused';}
    function wavePresentation(){return challenges.presentation()||game.getWavePresentation();}
    function desiredMusic(){return wavePresentation().intense?'taibatsu':'pajama';}
    function musicState(){
      const slot=musicSlots[musicTrack]||{},track=MUSIC_TRACKS[musicTrack];
      const mix={};Object.values(musicSlots).forEach(item=>{mix[item.id]=item.gain;});
      return {trackId:musicTrack,title:track.title,phase:wavePresentation().phase,enabled:musicEnabled,volume:musicVolume,playing:Object.values(musicSlots).some(item=>item.playing),suspended:appHidden||game.status==='paused',
        mix,transition:musicTransition?{to:musicTransition.to,elapsed:musicTransition.elapsed,duration:musicTransition.duration}:null,
        status:!musicEnabled?'off':slot.error==='error'?'error':!musicUnlocked||slot.error==='blocked'?'waiting':appHidden||game.status==='paused'?'paused':slot.playing?'playing':slot.pending?'loading':'ready'};
    }
    function musicSource(id){const file=MUSIC_TRACKS[id].file;return file.startsWith('data:')?file:options.assetPaths&&options.assetPaths[file]||assetRoot+file;}
    function applyMusicVolume(slot){if(slot.context)slot.context.volume=musicVolume*slot.gain;}
    function quietMusic(slot){
      if(!slot)return;
      const wasActive=slot.playing||slot.pending;
      slot.playing=false;slot.pending=false;slot.gain=0;applyMusicVolume(slot);
      // Keep each cue's playback position: returning from a boss should not
      // replay the same opening every time. Pause only after the fade is silent.
      if(wasActive&&slot.context){try{slot.context.pause();}catch(_) {}}
    }
    function beginMusicFade(slot,duration){
      if(musicTransition&&musicTransition.to===slot.id)return;
      const from={};Object.values(musicSlots).forEach(item=>{from[item.id]=item.gain;});
      musicTransition={to:slot.id,from,elapsed:0,duration};
    }
    function targetMusicFade(slot){
      if(musicTransition&&musicTransition.to===slot.id)return;
      const outgoing=Object.values(musicSlots).some(item=>item!==slot&&item.playing&&item.gain>0);
      if(!outgoing&&slot.gain===1){musicTransition=null;return;}
      beginMusicFade(slot,outgoing?(slot.id==='taibatsu'?1.8:2.6):.6);
    }
    function advanceMusicFade(dt){
      const fade=musicTransition;if(!fade)return;
      fade.elapsed=Math.min(fade.duration,fade.elapsed+dt);
      const t=fade.elapsed/fade.duration,ease=t*t*t*(10+t*(-15+6*t));
      // Interpolate power, not linear volume. The midpoint keeps the same
      // combined energy; smootherstep also eases both ends of the transition.
      Object.values(musicSlots).forEach(slot=>{
        const from=fade.from[slot.id]||0,target=slot.id===fade.to?1:0;
        slot.gain=slot.playing?Math.sqrt(Math.max(0,(1-ease)*from*from+ease*target)):0;
        applyMusicVolume(slot);
      });
      if(t>=1){
        musicTransition=null;
        Object.values(musicSlots).forEach(slot=>{if(slot.id!==fade.to)quietMusic(slot);});
      }
    }
    function recoverMusic(){
      const fallback=Object.values(musicSlots).filter(slot=>slot.playing&&!slot.error).sort((a,b)=>b.gain-a.gain)[0];
      if(fallback&&fallback.gain<1)beginMusicFade(fallback,.6);
    }
    function syncMusic(dt=0){
      if(options.visualReplica===true)return;
      const next=desiredMusic();
      if(next!==musicTrack){
        musicTrack=next;musicTransition=null;
        // A rapid reversal starts at the current gains, never at full volume.
        Object.values(musicSlots).forEach(slot=>{if(slot.id!==next&&!slot.playing)quietMusic(slot);});
        if(musicSlots[next])musicSlots[next].error=null;
      }
      if(!musicShouldPlay()){
        musicTransition=null;Object.values(musicSlots).forEach(quietMusic);
        return;
      }
      let slot=musicSlots[musicTrack];
      try {
        if(!slot){
          const id=musicTrack;
          slot={id,context:null,playing:false,pending:false,error:null,gain:0};musicSlots[id]=slot;
          if(typeof platform.createInnerAudioContext!=='function'){slot.error='error';return;}
          const context=platform.createInnerAudioContext();slot.context=context;
          context.loop=true;context.autoplay=false;context.volume=0;
          if(context.onPlay)context.onPlay(()=>{
            // The outgoing cue remains valid during a crossfade. A delayed
            // start from an already retired or suspended cue is rejected.
            if(!musicShouldPlay()||(!slot.pending&&!slot.playing)||(id!==musicTrack&&!(slot.playing&&slot.gain>0))){slot.pending=true;quietMusic(slot);return;}
            slot.pending=false;slot.playing=true;slot.error=null;
            if(id===musicTrack)targetMusicFade(slot);
          });
          const stopped=()=>{
            if(musicShouldPlay()&&(slot.pending||context.paused===false))return;
            const wasActive=slot.playing||slot.pending;
            slot.playing=false;slot.pending=false;slot.gain=0;applyMusicVolume(slot);
            if(wasActive&&musicTransition)musicTransition=null;
          };
          if(context.onPause)context.onPause(stopped);
          if(context.onStop)context.onStop(stopped);
          if(context.onError)context.onError(error=>{
            const wasActive=slot.playing||slot.pending;
            quietMusic(slot);slot.error=error&&error.blocked?'blocked':'error';
            if(wasActive&&musicShouldPlay()){musicTransition=null;recoverMusic();}
          });
          context.src=musicSource(id);
        }
        if(slot.error)recoverMusic();
        else if(slot.playing)targetMusicFade(slot);
        else if(!slot.pending){slot.pending=true;slot.context.play();}
      }catch(_){if(slot){quietMusic(slot);slot.error='error';musicTransition=null;recoverMusic();}}
      // Do not fade the outgoing cue until the incoming decoder reports Play.
      advanceMusicFade(dt);
    }
    function saveMusic(){try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-music-v1',{enabled:musicEnabled,volume:musicVolume});}catch(_) {}}
    function setMusicEnabled(enabled){
      musicEnabled=!!enabled;
      const slot=musicSlots[musicTrack];
      if(musicEnabled&&slot&&slot.error){slot.error=null;if(slot.context){try{slot.context.src=musicSource(musicTrack);}catch(_){slot.error='error';}}else delete musicSlots[musicTrack];}
      saveMusic();syncMusic();return musicEnabled;
    }
    function setMusicVolume(volume){
      if(typeof volume!=='number'||!Number.isFinite(volume))return musicVolume;
      musicVolume=Math.max(0,Math.min(1,volume));
      Object.values(musicSlots).forEach(applyMusicVolume);
      saveMusic();return musicVolume;
    }
    function unlock(){
      if(options.visualReplica===true)return;
      try{if(platform.unlockAudio)platform.unlockAudio();}catch(_){}
      try{['fuse','cherry','fire'].forEach(prepareSound);}catch(_){}
      musicUnlocked=true;Object.values(musicSlots).forEach(slot=>{if(slot.error==='blocked')slot.error=null;});syncMusic();
    }
    function cancelDrag(restoreSelection) {
      state.sunSweep=null;
      clearShovel();
      if(!state.drag)return;
      if(restoreSelection!==false)state.selected=state.drag.previousSelected==='shovel'?null:state.drag.previousSelected;
      state.drag=null;state.held=null;state.hover=null;
    }
    // Reveal the existing spawn lane without moving cells, spawns or ranges.
    // Menus retain their original composition; a live battle uses a wider view.
    function sceneWidth() {return game.status==='ready'?W:mobileLayout?view.logicalWidth:BATTLE_WIDTH;}
    function windowGeometry(battle){
      const sys=(platform.getWindowInfo?platform.getWindowInfo():platform.getSystemInfoSync?platform.getSystemInfoSync():{})||{};
      const width=Math.max(1,Number(sys.windowWidth||sys.screenWidth||canvas.width||W));
      const height=Math.max(1,Number(sys.windowHeight||sys.screenHeight||canvas.height||H));
      const quality=RENDER_QUALITY[state.renderQuality],requested=state.renderQuality==='smooth'?sys.pixelRatio:sys.renderPixelRatio||sys.pixelRatio;
      const dpr=Math.min(quality.maxRatio,Math.max(quality.minRatio,Number(requested)||1),Math.sqrt(quality.pixels/(width*height)),8192/Math.max(width,height));
      const safe=sys.safeArea||{};
      const left=Math.max(0,Math.min(width,Number(safe.left)||0));
      const top=Math.max(0,Math.min(height,Number(safe.top)||0));
      const right=Math.min(width,Math.max(left+1,Number(safe.right)||width));
      const bottom=Math.min(height,Math.max(top+1,Number(safe.bottom)||height));
      const layout=battleLayout.calculate(width,height,{left,top,right,bottom},battle);
      const logicalWidth=layout.logicalWidth,scale=layout.scale;
      const nextView={x:left+(right-left-logicalWidth*scale)/2,y:top+(bottom-top-H*scale)/2,width:logicalWidth*scale,height:H*scale,logicalWidth,scale,pixelRatio:dpr,displayPixelRatio:Math.max(1,Number(sys.pixelRatio)||1),windowWidth:width,windowHeight:height};
      return {layout,view:nextView,width,height,dpr};
    }
    function resize() {
      cancelDrag();state.held=null;state.cardPress=null;state.plantTooltip=null;state.tooltipOwner=null;
      const geometry=windowGeometry(game.status!=='ready'),{layout,width,height,dpr}=geometry;
      mobileLayout=layout.mobile;mobileBoardBounds=layout.boardBounds;Object.assign(localHUD,layout.hud||desktopHUD);view=geometry.view;
      syncGrid();
      const retained=game.status!=='ready'&&pendingStaticWarmup&&pendingStaticWarmup.signature===staticWarmSignature(view,unitScale())?pendingStaticWarmup.sources:null;
      pendingStaticWarmup=null;
      hideStaticTerrain();staticTerrainRecord=null;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      smoothImages(ctx);fixedHUDImageCache.clear();separateToastLabelCache.clear();clearSurfaceCache(terrainCache);clearSurfaceCache(mapPreviewCache);clearSurfaceCache(materialCache);clearSurfaceCache(levelBadgeCache);clearSurfaceCache(actorShadowCache,retained);clearSurfaceCache(actorBarCache,retained);clearSurfaceCache(actorAccentCache,retained);
      render();return Object.assign({},view);
    }
    function staticWarmSignature(nextView,scale){
      return JSON.stringify([state.renderQuality,state.level,state.endlessMap,state.endlessBoardSize,nextView.logicalWidth,nextView.scale,nextView.pixelRatio,nextView.windowWidth,nextView.windowHeight,nextView.x,nextView.y,scale]);
    }

    function warmNativeShieldSources(nextView,scale,deck,geometry){
      const report=shieldWarmup;report.attempts++;report.reason='';report.sources=0;report.pixels=0;
      try{
        if(!lilyRenderer||typeof lilyRenderer.warmShieldSources!=='function')throw new Error('Shield warmup helper unavailable');
        // Ready speed1 must warm the future high-speed physical scene, not the
        // current supersampled scene. Ceil ratios match motion.beginScene exactly.
        const pixelScale=Math.min(1,nextView.displayPixelRatio/nextView.pixelRatio);
        const width=Math.round(geometry.width*geometry.dpr),height=Math.round(geometry.height*geometry.dpr);
        if(!(width>0&&height>0))throw new Error('Shield warmup target invalid');
        const base=nextView.pixelRatio*nextView.scale,transform={a:base*(Math.ceil(width*pixelScale)/width),b:0,c:0,d:base*(Math.ceil(height*pixelScale)/height)};
        const live=game.status!=='ready'&&game.plants&&game.plants.some(plant=>plant.hp>0);
        const types=live?game.plants.filter(plant=>plant.hp>0).map(plant=>plant.type):(deck||[]),sizes=new Set();
        for(const type of types)if(engine.PLANTS[type]&&!engine.PLANTS[type].support)sizes.add(actorSize(type,scale));
        const plan=[];for(const size of sizes){plan.push({size,kind:'guard',low:false},{size,kind:'ward',low:false},{size:size*.92,kind:'ward',low:false});}
        if(!plan.length){report.reason='No shield actor sizes';return false;}
        const result=lilyRenderer.warmShieldSources(plan,{nativeStatic:true,status:game.status,transform,createCanvas:platform.createCanvas,registerSceneImage:motion.registerSceneImage,unregisterSceneImage:motion.unregisterSceneImage,...(sceneImageRetire?{sceneImageRetirement:sceneImageRetire}:{})});
        if(!result||result.ok!==true)throw new Error(result&&result.reason||'Shield warmup source unavailable');
        if(!motion.warmSceneImages(result.sources,{nativeStatic:true}))throw new Error('Shield warmup GPU unavailable');
        report.successes++;report.sources=result.sources.length;report.pixels=result.pixels;report.pixelScale=pixelScale;report.transform={...transform};return true;
      }catch(error){report.failures++;report.reason=String(error.message||error);return false;}
    }


    function burnedWarmIdentity(request){
      return !disposed&&!appHidden&&request===burnedWarmRequest&&periodicGeneration===request.generation&&game.status===request.status&&['ready','paused'].includes(game.status)&&game.time===request.time&&game.wave===request.wave&&game.plants===request.plants&&game.enemies===request.enemies&&game.strategy===request.strategy&&(!game.strategy||game.strategy.pending===request.reward)&&state.overlay===request.overlay&&state.level===request.level&&platform.trustedWorkerTransport===true&&platform.checkpointTaskBoundaryVersion===1&&platform.yieldCheckpointTask===request.yield&&platform.createSimulationWorker===request.factory&&platform.requestAnimationFrame===request.raf;
    }
    function burnedWarmGeometry(request){
      // A failed optional geometry read declines warming, not the mandatory
      // original action. A successfully observed changed geometry cancels it.
      try{return staticWarmSignature(windowGeometry(true).view,request.scale)===request.signature;}
      catch(_){return null;}
    }
    function queueBurnedWarmup(nextView,scale){
      // Only the closed browser adapter can schedule this additional task.
      // Ordinary, hidden, manual and unknown adapters retain their lazy path.
      if(options.nativeStaticWarmup!==true||options.nativeCheckpointTaskBoundary!==true||options.autoStart===false||disposed||appHidden||!['ready','paused'].includes(game.status)||state.level!=='endless'||state.endlessBoardSize!=='grand'||!motion||typeof motion.warmBurned!=='function'||platform.trustedWorkerTransport!==true||platform.checkpointTaskBoundaryVersion!==1||typeof platform.yieldCheckpointTask!=='function'||typeof platform.requestAnimationFrame!=='function')return null;
      const base=nextView.pixelRatio*nextView.scale;
      const request={generation:periodicGeneration,status:game.status,time:game.time,wave:game.wave,plants:game.plants,enemies:game.enemies,strategy:game.strategy,reward:game.strategy&&game.strategy.pending,overlay:state.overlay,level:state.level,scale,signature:staticWarmSignature(nextView,scale),yield:platform.yieldCheckpointTask,factory:platform.createSimulationWorker,raf:platform.requestAnimationFrame,transform:{a:base,b:0,c:0,d:base},plan:enemyIds.map(kind=>({kind,size:actorSize(kind,scale)}))};
      // At most one queued task. A later static request replaces the plan;
      // actions awaiting an older request cannot resume or restore another run.
      burnedWarmRequest=request;
      if(!burnedWarmTask){
        let operation;
        operation=Promise.resolve().then(()=>request.yield.call(platform)).then(()=>{
          const current=burnedWarmRequest;
          if(!current||!burnedWarmIdentity(current)||burnedWarmGeometry(current)!==true||!burnedWarmIdentity(current))return false;
          burnedWarmup.attempts++;
          const result=motion.warmBurned(current.plan,{nativeStatic:true,status:current.status,transform:current.transform});
          burnedWarmup.reason=result&&result.reason||'';
          if(!result||result.ok!==true){burnedWarmup.failures++;return false;}
          burnedWarmup.successes++;burnedWarmup.sources=result.sources;burnedWarmup.pixels=result.pixels;burnedWarmup.created=result.created;return true;
        }).catch(error=>{burnedWarmup.failures++;burnedWarmup.reason=String(error.message||error);return false;}).finally(()=>{if(burnedWarmTask===operation)burnedWarmTask=null;});
        burnedWarmTask=operation;
      }
      return request;
    }
    function finishBurnedWarmup(request,action){
      if(!request||!burnedWarmTask)return action();
      const task=burnedWarmTask;
      // Budget/GPU failure only declines the optimization; original full action
      // remains mandatory. Lifecycle cancellation cannot resume a changed run.
      return task.then(()=>{
        if(!burnedWarmIdentity(request))return false;
        // Leave the paused warm submission/validation task before the mandatory
        // start/restore render. Optional adapter failure retains the action.
        return Promise.resolve().then(()=>request.yield.call(platform)).catch(()=>undefined).then(()=>{
          if(!burnedWarmIdentity(request))return false;
          const geometry=burnedWarmGeometry(request);
          return geometry!==false&&burnedWarmIdentity(request)?action():false;
        });
      });
    }

    function warmNativeStatic(levelId,deck){
      // This private option cannot delay a running game or advance its clocks.
      // Normal/native/public callers stay on the established lazy-cache path.
      burnedWarmRequest=null;
      if(options.nativeStaticWarmup!==true||disposed||game.status==='playing'||levelId!=='endless'||!platform.createCanvas||!motion||typeof motion.warmSceneImages!=='function')return false;
      staticWarmup.attempts++;staticWarmup.reason='';
      try{
        const geometry=windowGeometry(true),nextView=geometry.view,map=engine.getEndlessMap(state.endlessMap,state.endlessBoardSize);
        const grid=terrainRenderer.sceneGrid(map,nextView.logicalWidth,H,geometry.layout.boardBounds?{boardBounds:geometry.layout.boardBounds}:undefined),scale=Math.min(grid.w/128,grid.h/160),quality=RENDER_QUALITY[state.renderQuality];
        const density=Math.min(quality.maxRatio,Math.max(1,Math.ceil(nextView.scale*nextView.pixelRatio*4)/4),Math.sqrt(quality.pixels/(nextView.logicalWidth*H)),8192/Math.max(nextView.logicalWidth,H));
        const signature=staticWarmSignature(nextView,scale),plan=[];
        const add=(group,width,height,make)=>plan.push({group,width:Math.ceil(width*density),height:Math.ceil(height*density),make});
        for(const [h,r,fill]of [[6,3,'rgba(30,52,24,.6)'],[6,3,'#ffec9b'],[6,3,'#ee9b7e'],[5,2,'#4a5361'],[5,2,'#b7d1df']])add('bar',r*2+6,h+4,()=>actorBarSurface(h,r,fill,density));
        for(const kind of ['slow','rage','drum']){const b=actorAccentShape(kind,126).bounds;add('accent',b.w,b.h,()=>actorAccentSurface(kind,126,density));}
        for(const radius of [28,36])add('shadow',radius*2*scale+4,16*scale+4,()=>actorShadowSurface(scale,radius,density));
        const sizes=new Set();for(const type of deck||[])if(engine.PLANTS[type])sizes.add(actorSize(type,scale));
        for(const size of sizes){const b=actorAccentShape('power',size).bounds;add('accent',b.w,b.h,()=>actorAccentSurface('power',size,density));}
        const groupPixels={bar:0,accent:0,shadow:0},groupLimits={bar:256*1024,accent:256*1024,shadow:512*1024};let pixels=0;
        if(plan.length>32)throw new Error('Static warmup source limit exceeded');
        for(const item of plan){if(!Number.isInteger(item.width)||!Number.isInteger(item.height)||item.width<=0||item.height<=0)throw new Error('Static warmup dimensions invalid');const n=item.width*item.height;pixels+=n;groupPixels[item.group]+=n;}
        if(pixels>2*1024*1024||Object.keys(groupLimits).some(group=>groupPixels[group]>groupLimits[group]))throw new Error('Static warmup pixel budget exceeded');
        const sources=new Set(plan.map(item=>item.make()));
        if(!motion.warmSceneImages(Array.from(sources),{nativeStatic:true}))throw new Error('Static warmup GPU unavailable');
        if(typeof motion.reserveSceneVertices==='function'&&!motion.reserveSceneVertices(65536,{nativeStatic:true,status:game.status}))throw new Error('Static vertex warmup GPU unavailable');
        if(grid.cols===15&&grid.rows===7&&state.renderQuality==='ultra'&&typeof motion.prepareSceneStorage==='function'){
          const pixelScale=state.endlessSpeed>=8?Math.min(1,nextView.displayPixelRatio/nextView.pixelRatio):1;
          if(!motion.prepareSceneStorage(Math.round(geometry.width*geometry.dpr),Math.round(geometry.height*geometry.dpr),{nativeStatic:true,status:game.status,pixelScale}))throw new Error('Static scene storage warmup GPU unavailable');
        }
        if(state.endlessBoardSize==='grand')warmNativeShieldSources(nextView,scale,deck,geometry);
        pendingStaticWarmup={signature,sources};staticWarmup.successes++;staticWarmup.sources=sources.size;staticWarmup.pixels=pixels;return queueBurnedWarmup(nextView,scale);
      }catch(error){pendingStaticWarmup=null;staticWarmup.failures++;staticWarmup.reason=String(error.message||error);return false;}
    }
    function validDeck(deck,levelId) {
      const level=levelInfo(levelId),map=mapForLevel(level);
      const preferred=(Array.isArray(deck)?deck:map.recommendedDeck||level.recommendedDeck||level.deck||level.recommended||ORDER).slice();
      if(!Array.isArray(deck)&&mapForLevel(level).tiles.some(row=>row.includes('water'))&&!preferred.some(type=>engine.PLANTS[type]&&engine.PLANTS[type].support)){
        const swap=preferred.includes('kani')?preferred.indexOf('kani'):preferred.includes('mine')?preferred.indexOf('mine'):preferred.length-1;
        preferred[swap]='lily';
      }
      const valid=Array.from(new Set(preferred.filter(type=>typeof type==='string'&&engine.PLANTS[type]))).slice(0,deckSize);
      plantIds.forEach(type=>{if(valid.length<deckSize&&!valid.includes(type))valid.push(type);});return valid;
    }
    function start(levelId,deck) {
      invalidatePeriodicCheckpoint();
      if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>{if(checkpointActive()&&!saveEndlessRun({silent:true}))return false;return start(levelId,deck);},true);
      processEvents();achievements.flush();achievementToast=null;achievementQueue=[];
      saveChallengeBest();challenges.clear();state.speedOpen=false;
      cancelDrag(false);state.upgradePress=null;state.held=null;state.cardFeedback=null;state.endlessGrowthOpen=false;sunCollection.reset();
      state.autoSunSoundAt=-Infinity;
      saveEndless();
      if(simulation)simulation.stop();
      const id=(engine.LEVELS[levelId]||levelId==='endless')?levelId:state.level;
      state.level=id;state.deck=validDeck(deck,id);state.pendingDeck=state.deck.slice();const burnedRequest=warmNativeStatic(id,state.deck);return finishBurnedWarmup(burnedRequest,()=>{game.start(id,{mapId:state.endlessMap,endlessBoardSize:state.endlessBoardSize});state.upgrades={selected:null,perkPage:0,returnOverlay:null,resumeOnClose:false};state.selected=null;state.overlay=null;state.hover=null;lastStatus='playing';
      ownsSavedRun=false;autosaveAge=0;
      tutorial.begin({deck:state.deck});
      notice(game.getMap().name+' · '+game.getMap().tip);
      if(game.isEndless)saveEndlessRun({silent:true});
      unlock();sound('plant');render();return game;});
    }
    function pause() {processEvents();achievements.flush();state.cardPress=null;state.plantTooltip=null;state.mobileTools=false;state.endlessGrowthOpen=false;state.upgradePress=null;cancelDrag();state.held=null;if(game.status==='playing')game.togglePause();if(game.status==='paused'){if(!state.overlay)state.overlay='pause';state.hover=null;saveEndlessRun({silent:true});}syncMusic();syncFuse();return game.status;}
    function resume() {
      if(threadedTask&&!threadedSaveDepth)return threadedTask.then(()=>resume());
      if(game.isEndless&&game.strategy&&game.strategy.pending){state.overlay='strategy-reward';render();return game.status;}
      const burnedRequest=game.status==='paused'?warmNativeStatic(state.level,state.deck):null;
      const finish=()=>{if(game.status==='playing'){state.overlay=null;lastFrame=null;}syncMusic();syncFuse();return game.status;};
      return finishBurnedWarmup(burnedRequest,()=>{
        if(simulation&&(threadedActive()||simulation.state().failed)&&game.status==='paused')return simulation.resume(game).then(finish).catch(()=>game.status);
        if(game.status==='paused')game.togglePause();return finish();
      });
    }
    function openUpgrades(type) {
      if(appHidden||!game.isEndless||!['playing','paused'].includes(game.status)||typeof game.getPlantUpgrade!=='function')return false;
      if(state.overlay&&!['pause','upgrades'].includes(state.overlay))return false;
      processEvents();achievements.flush();
      const chosen=state.deck.includes(type)?type:state.deck.includes(state.upgrades.selected)?state.upgrades.selected:state.deck[0];
      if(state.overlay!=='upgrades'){
        state.upgrades.returnOverlay=state.overlay||null;
        state.upgrades.resumeOnClose=game.status==='playing'&&!appHidden;
      }
      cancelDrag(false);state.upgradePress=null;state.held=null;state.selected=null;state.hover=null;state.hoverTime=0;
      pauseBattleClock();
      state.upgrades.selected=chosen;state.upgrades.perkPage=nextPerkPage(chosen);state.overlay='upgrades';state.toastTime=0;
      Object.values(audio).forEach(a=>{if(a.pause)a.pause();});syncMusic();syncFuse();sound('select');render();return true;
    }
    function closeUpgrades() {
      if(state.overlay!=='upgrades')return false;
      state.upgradePress=null;
      const again=state.upgrades.resumeOnClose&&!appHidden&&game.status==='paused';
      state.overlay=state.upgrades.returnOverlay||'pause';state.upgrades.resumeOnClose=false;
      if(again)resume();else{syncMusic();syncFuse();}
      if(!appHidden)sound('select');render();return true;
    }
    function buyUpgrade() {
      if(state.overlay!=='upgrades'||appHidden||threadedTask)return false;
      const result=game.upgradePlant(state.upgrades.selected);
      if(result.ok){processEvents();sound('sun');}
      else notice(result.reason||'暂时无法升级这位伙伴。');
      render();return result.ok;
    }
    function cardUnavailable(type) {
      const spec=engine.PLANTS[type];if(!spec)return null;
      if(game.cooldowns[type]>.001)return '还需 '+Math.ceil(game.cooldowns[type])+' 秒';
      if(game.sun<spec.cost)return '还差 '+Math.ceil(spec.cost-game.sun)+' 阳光';
      return null;
    }
    function select(type) {
      if(type!==null&&type!=='shovel'&&!(engine.PLANTS[type]&&state.deck.includes(type)))return false;
      const previous=state.selected;
      // An already-held seed can always be put back, even after another action
      // spends sunlight. Unavailable cards must not replace a usable selection.
      const reason=type!==previous&&game.status==='playing'&&!state.overlay&&cardUnavailable(type);
      if(reason){state.cardFeedback={type,reason,time:.95};sound('deny');return false;}
      cancelDrag(false);state.selected=type;state.hover=null;state.held=null;state.cardFeedback=null;
      if(engine.PLANTS[type]&&game.status==='playing'&&!state.overlay)holdSeed(type);
      if(type==='shovel'&&game.status==='playing'&&!state.overlay)holdShovel(state.pointer,state.pointer&&state.pointer.pointerType);
      if(type!==previous)sound(type===null?'cancel':'select');return true;
    }
    function home(alreadySaved=false) {invalidatePeriodicCheckpoint();if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>home(alreadySaved),true);processEvents();achievements.flush();if(checkpointActive()&&!alreadySaved&&!saveEndlessRun({silent:true}))return false;saveEndless();if(simulation)simulation.stop();cancelDrag(false);state.upgradePress=null;state.held=null;state.selected=null;state.hover=null;state.toastTime=0;sunCollection.reset();game.reset();challenges.clear();tutorial.cancel();ownsSavedRun=false;state.upgrades={selected:null,perkPage:0,returnOverlay:null,resumeOnClose:false};state.overlay='home';lastStatus='ready';achievementToast=null;achievementQueue=[];render();return true;}
    function openChallenges(){processEvents();achievements.flush();saveEndless();cancelDrag(false);state.held=null;state.selected=null;pauseBattleClock();state.overlay='challenges';state.toastTime=0;sound('select');render();return true;}
    function startChallenge(id){
      invalidatePeriodicCheckpoint();
      if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>startChallenge(id),true);
      if(!(challengeModule.ALL_LEVELS||challengeModule.LEVELS).some(level=>level.id===id))return false;
      processEvents();achievements.flush();achievementToast=null;achievementQueue=[];
      if(checkpointActive()&&!saveEndlessRun({silent:true}))return false;
      if(simulation)simulation.stop();
      saveEndless();cancelDrag(false);state.held=null;state.selected=null;state.hover=null;state.speedOpen=false;state.endlessGrowthOpen=false;sunCollection.reset();
      const result=challenges.start(id);if(!result)return false;tutorial.cancel();
      achievements.unique('challenges',result.mode);achievements.unique('maps',game.getMap().id);
      ownsSavedRun=false;state.endlessSpeed=1;state.overlay=null;state.level='meadow';lastStatus='playing';lastFrame=null;
      notice(result.instructions,5);unlock();sound('plant');render();return true;
    }
    function challengeAction(row,col){const result=challenges.act(row,col);if(result.ok){sound(result.opened?'shovel':'plant');if(result.reason)notice(result.reason,1.3);}else notice(result.reason,1.5);processEvents();render();return result;}
    function levels() {processEvents();achievements.flush();saveEndless();cancelDrag(false);state.held=null;state.selected=null;state.toastTime=0;pauseBattleClock();state.overlay='levels';sound('select');render();}
    function openEndless() {processEvents();achievements.flush();saveEndless();cancelDrag(false);state.held=null;state.selected=null;state.toastTime=0;pauseBattleClock();state.overlay='endless';sound('select');render();}
    function prepare(levelId) {if(!engine.LEVELS[levelId]&&levelId!=='endless')return false;removedDeckSlot=null;state.deckPage=0;state.level=levelId;if(levelId!=='endless')state.levelPage=Math.floor(levelIds.indexOf(levelId)/8);state.pendingDeck=validDeck(null,levelId);state.overlay='prepare';state.toastTime=0;sound('select');warmNativeStatic(levelId,state.pendingDeck);render();return true;}
    function toggleDeck(type) {
      if(!engine.PLANTS[type]||state.overlay!=='prepare')return false;
      const index=state.pendingDeck.indexOf(type);
      if(index>=0)state.pendingDeck.splice(index,1);
      else if(state.pendingDeck.length<deckSize)state.pendingDeck.push(type);
      else{notice('先取消一位伙伴，再选择新的伙伴。');return false;}
      removedDeckSlot=null;sound('select');return true;
    }
    function removeDeckCard(type,slot) {
      if(state.overlay!=='prepare'||state.pendingDeck[slot]!==type)return false;
      // A rapid second tap must not remove the neighbour that just slid here.
      if(removedDeckSlot&&removedDeckSlot.slot===slot&&state.age-removedDeckSlot.at<.35)return false;
      if(!toggleDeck(type))return false;
      removedDeckSlot={slot,at:state.age};return true;
    }
    function openAlmanac() {processEvents();achievements.flush();cancelDrag(false);state.held=null;state.selected=null;state.almanac.returnOverlay=state.overlay||'pause';state.almanac.page=0;state.almanac.selected=(state.almanac.tab==='plants'?plantIds:enemyIds)[0];pauseBattleClock();state.overlay='almanac';state.toastTime=0;sound('select');render();}
    function back() {
      if(state.overlay==='achievements'){if(state.achievements.selected){state.achievements.selected=null;render();}else closeAchievements();return;}
      if(state.overlay==='strategy-reward'){notice('选一项本轮补给，再继续讨伐。');return;}
      if(state.overlay==='strategy-summary'){state.overlay=game.status==='paused'?'pause':'end';render();return;}
      if(state.saves.pending)return;
      if(state.overlay==='saves'){if(state.saves.confirm){state.saves.confirm=null;render();}else closeSaves();return;}
      if(state.speedOpen){state.speedOpen=false;render();return;}
      if(state.endlessGrowthOpen){state.endlessGrowthOpen=false;render();return;}
      if(state.overlay==='upgrades'){closeUpgrades();return;}
      if(state.overlay==='audio')state.overlay=audioReturn;
      else if(state.overlay==='almanac')state.overlay=state.almanac.returnOverlay||'home';
      else if(state.overlay==='help')state.overlay=state.returnOverlay||'home';
      else if(state.overlay==='prepare')state.overlay=state.level==='endless'?'endless':'levels';
      else if(state.overlay==='overwrite-save')state.overlay='prepare';
      else if(state.overlay==='endless')home();
      else if(state.overlay==='levels'||state.overlay==='challenges')home();
      else if(state.overlay==='restart')state.overlay=game.status==='paused'?'pause':'end';
      else if(!state.overlay)select(null);
      render();
    }
    function saveChallengeBest(){
      const challenge=challenges.state;
      if(challenge&&challenge.endless){
        const before=state.challengeBest[challenge.mode];
        const safe=value=>Number.isFinite(value)&&value>=0?Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value)):0;
        const next={waves:Math.max(before.waves,safe(challenge.wavesCleared)),kills:Math.max(before.kills,safe(game.kills)),seconds:Math.max(before.seconds,safe(game.time))};
        if(Object.keys(next).some(key=>next[key]!==before[key])){state.challengeBest[challenge.mode]=next;challengeBestDirty=true;}
      }
      if(!challengeBestDirty)return true;
      try{if(platform.setStorageSync){platform.setStorageSync('chiikawa-garden-challenge-endless-v1',{version:1,records:JSON.parse(JSON.stringify(state.challengeBest))});challengeBestDirty=false;}return true;}
      catch(_){notice('小游戏纪录暂未保存，稍后返回菜单时会重试。',4);return false;}
    }
    function saveEndless() {
      saveChallengeBest();
      if(!game.isEndless)return;
      const before=state.endlessBest;
      const next={waves:Math.max(before.waves,game.wavesCleared||0),kills:Math.max(before.kills,game.kills||0),seconds:Math.max(before.seconds,Math.floor(game.time))};
      if(Object.keys(next).every(key=>next[key]===before[key]))return;
      state.endlessBest=next;
      try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-endless-v1',{version:1,...next});}catch(_){}
    }
    function saveClear() {
      const before=state.clears[game.levelId]||{},seconds=Math.floor(game.time);
      state.clears[game.levelId]={cleared:true,bestKills:Math.max(Number(before.bestKills)||0,game.kills),bestTime:before.bestTime>0?Math.min(before.bestTime,seconds):seconds};
      try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-progress-v1',{version:1,levels:state.clears});}catch(_){}
    }
    function strategyPlan(next=false){
      if(!runDirector||!game.isEndless)return null;
      if(!next)return runDirector.planWave(game);
      const wave=game.wave+1,config=engine.getEndlessWave(wave,game.nextEndlessDifficulty(wave),game.nextEndlessSurge(wave),game.endlessBoardSize);
      return runDirector.planWave(game,wave,config);
    }
    function strategyText(next=false){return runDirector?runDirector.describe(strategyPlan(next),engine.ENEMIES):'休整片刻，补好阵容。';}
    function chooseStrategyReward(id){
      if(!runDirector||state.overlay!=='strategy-reward')return false;
      if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>chooseStrategyReward(id));
      if(threadedTask&&!threadedSaveDepth)return threadedTask.then(()=>chooseStrategyReward(id));
      const result=runDirector.applyChoice(game.strategy,id,game,state.deck);if(!result.ok)return false;
      state.overlay=null;saveEndlessRun({silent:true});notice('获得「'+result.name+'」。下一波：'+strategyText(true),5);
      const resumed=resume();render();return resumed&&typeof resumed.then==='function'?resumed.then(()=>true):true;
    }
    function openStrategySummary(){if(!game.isEndless||!runDirector)return false;if(game.status==='playing')pause();state.overlay='strategy-summary';render();return true;}

    function processEvents() {
      let latestUpgrade=null,latestPerkUnlock=null,checkpoint=false;
      const events=game.events.splice(0),track=game.status==='playing'||threadedSaveDepth>0||lastStatus==='playing'&&['won','lost'].includes(game.status)||events.some(event=>['waveClear','challengeWaveClear','strategyReward'].includes(event.type));
      events.forEach(event=>{
        if(track||event.type==='plantLevelUp'&&['sun','strategyReward'].includes(event.source))trackAchievementEvent(event);
        tutorial.observe(event);
        if(event.type==='challengeWave'){notice('无尽挑战 · 第 '+event.wave+' 波开始！');sound('wave');}
        else if(event.type==='challengeWaveClear'){saveChallengeBest();notice('已守住第 '+event.wave+' 波！'+(challenges.state&&challenges.state.mode==='vase'?'休整后重新布罐，手牌与阵地会重置。':'休整 5 秒，准备下一波。'),4);sound('select');}
        else if(event.type==='wave'){notice(event.endless&&runDirector?'第 '+event.wave+' 波 · '+strategyText():!event.endless&&event.wave===game.level.waves.length?'最终波来袭！一起讨伐，守住花园！':'第 '+event.wave+' 波来啦，伙伴们加油！',5);sound('wave');}
        else if(event.type==='waveClear'&&game.isEndless){saveEndless();notice('第 '+event.wave+' 波完成。下一波：'+strategyText(true),6);checkpoint=true;sound('select');}
        else if(event.type==='strategyReward'){cancelDrag(false);state.held=null;state.selected=null;state.overlay='strategy-reward';checkpoint=true;sound('select');}
        else if(event.type==='strategyRescue'){notice('第 '+(event.row+1)+' 路应急割草机已补位！',3);sound('select');}
        else if(event.type==='plantLevelUp'){
          latestUpgrade=event;
          const info=game.getPlantUpgrade(event.plantType),perk=info&&(info.perks||[]).find(item=>item.level===event.level);
          if(perk)latestPerkUnlock={event,perk};
        }
        else if(event.type==='autoSunCollect'){
          sunCollection.add({id:event.id,x:GRID.x+event.x*GRID.w,y:GRID.y+event.y*GRID.h,value:event.value,blockPlant:false});
          if(state.age-state.autoSunSoundAt>=.18){sound('sun');state.autoSunSoundAt=state.age;}
        }
        else if(event.type==='shoot')sound('shoot');else if(event.type==='explosion')sound(event.plantType==='cherry'?'cherry':event.plantType==='jalapeno'?'fire':'burst');
        else if(event.type==='mower'){notice('割草机出动！守住这一行。');sound('burst');}
      });
      // A wave clear and its reward describe the same post-update state. Keep
      // the immediate durable checkpoint while serializing that state once.
      if(checkpoint)saveEndlessRun({silent:true});
      // A later ordinary level in the same tick should not hide an ability unlock.
      if(latestPerkUnlock){const {event,perk}=latestPerkUnlock,spec=engine.PLANTS[event.plantType];if(state.upgrades.selected===event.plantType)state.upgrades.perkPage=perk.level>=8?1:0;if(spec)notice(spec.name+'升到 Lv.'+event.level+' · 解锁「'+perk.name+'」');}
      else if(latestUpgrade){const spec=engine.PLANTS[latestUpgrade.plantType];if(spec)notice(spec.name+'升到 Lv.'+latestUpgrade.level+' · 本局同类伙伴一起成长');}
      if(game.status!==lastStatus){
        if(game.status==='won'||game.status==='lost'){
          cancelDrag();state.held=null;
          state.overlay=game.isEndless&&runDirector?'strategy-summary':'end';state.best=Math.max(state.best,game.kills);
          if(challenges.state&&challenges.state.endless){saveChallengeBest();}else if(game.isEndless){saveEndless();clearFinishedRun();}else if(game.status==='won'&&challenges.state){state.challengeClears[challenges.state.id]=true;try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-challenges-v1',{version:1,clears:state.challengeClears});}catch(_){}}else if(game.status==='won')saveClear();
          try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-best',state.best);}catch(_){}
          sound(game.status==='won'?'win':'lose');
          achievements.flush();
        }
        lastStatus=game.status;
      }
    }
    function startupHandoffEpoch(stamp,rafRelative) {
      if(platform.trustedWorkerTransport!==true)return undefined;
      const clock=global.performance;
      if(!clock||!Number.isFinite(clock.timeOrigin)||typeof clock.now!=='function')return undefined;
      const local=clock.now();if(!Number.isFinite(local))return undefined;
      const current=clock.timeOrigin+local;if(!Number.isFinite(current))return undefined;
      // RAF callbacks use the Window performance origin. Date.now fallback
      // values are absolute and must never be added to that origin.
      const supplied=rafRelative?(Number.isFinite(stamp)&&stamp>=0&&stamp<=local+1&&local-stamp<=60000?clock.timeOrigin+stamp:NaN):stamp;
      return Number.isFinite(supplied)&&supplied<=current+1&&current-supplied<=60000?Math.min(current,supplied):current;
    }
    function tick(dt,privateHandoffEpoch) {
      if(options.visualReplica===true)return;
      if(disposed)return;
      // Capture before image loading / local update; the dt's interval ends at
      // the RAF stamp, while this CPU work belongs to the next real interval.
      const initialHandoffEpoch=!threadedActive()?startupHandoffEpoch(privateHandoffEpoch,false):undefined;
      imageLoader.tick();dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,10)):0;
      const hadFeedback=state.toastTime>0||state.hoverTime>0||!!state.cardFeedback||!!state.buttonPulse||!!state.menuTransition;
      if(state.buttonPulse){state.buttonPulse.age+=dt;if(state.buttonPulse.age>.2)state.buttonPulse=null;}
      if(state.menuTransition){state.menuTransition.age+=dt;if(state.menuTransition.age>=.18)state.menuTransition=null;}
      if(game.status==='playing'||game.status==='ready'||['home','levels','endless','prepare','almanac'].includes(state.overlay))state.age+=dt;
      const wasPlaying=game.status==='playing'&&!appHidden;
      const canThread=!!(simulation&&!threadedTask&&!appHidden&&game.isEndless&&!challenges.state&&!tutorial.getState().active&&effectiveSpeed()>=8);
      if(canThread&&threadedActive())simulation.ensure({speed:effectiveSpeed(),autoCollectSun:state.autoCollectSun});
      // Keep the engine's 100 Hz integration at every multiplier. Small batches
      // also deliver wave/death events throughout long ticks instead of letting
      // a 20x update defer the entire event stream until its last instant.
      // Presentation, music and collection flights still use real seconds.
      let simulationDt=wasPlaying&&!threadedActive()?dt*effectiveSpeed():0;
      while(simulationDt>1e-9&&game.status==='playing'){
        const step=Math.min(.05,simulationDt);if(challenges.state)challenges.update(step);else {tutorial.beforeStep(step);game.update(step);}simulationDt-=step;
        if(game.events.length)processEvents();
      }
      // The raw handoff includes this real RAF interval, its 100 Hz updates and
      // all admitted events. A constructor / boot failure cannot lose that dt.
      // No simultaneous debt transfer: initialElapsed must remain exactly zero.
      // The committed paused save owns this brief completion task. Its RAF still
      // renders and processes UI; new Worker handoff resumes after release.
      if(canThread&&!threadedActive()&&!initialSaveRequest)simulation.ensure({speed:effectiveSpeed(),autoCollectSun:state.autoCollectSun,initialElapsed:0,handoffEpochMs:initialHandoffEpoch});
      if(wasPlaying)sunCollection.update(dt);
      if(dt>0&&!threadedTask&&!threadedActive()&&!tutorial.getState().blocksAutoCollect&&state.autoCollectSun&&game.isEndless&&game.status==='playing'&&!state.overlay&&!appHidden){
        // Let sky drops fall and flowers finish their toss before pickup.
        collectSuns(game.suns.filter(s=>s.landed&&s.age>=s.motionDuration+AUTO_SUN_DELAY),true);
      }
      if(wasPlaying&&state.cardPress&&!state.overlay){state.cardPress.age+=dt;if(state.drag&&state.drag.active)state.cardPress=null;else if(state.cardPress.age>=.55){state.plantTooltip=state.cardPress.type;state.tooltipOwner=state.cardPress.identifier;cancelDrag(false);state.selected=null;state.cardPress=null;state.held=null;renderRequested=true;}}
      if(wasPlaying&&state.held)state.held.age+=dt;
      if(wasPlaying&&state.shovel)state.shovel.age+=dt;
      if(wasPlaying&&state.shovelAction){state.shovelAction.age+=dt;if(state.shovelAction.age>=state.shovelAction.duration)state.shovelAction=null;}
      if(state.cardFeedback){state.cardFeedback.time-=dt;if(state.cardFeedback.time<=0)state.cardFeedback=null;}
      state.toastTime=Math.max(0,state.toastTime-dt);state.hoverTime=Math.max(0,state.hoverTime-dt);
      processEvents();
      achievements.tick(dt);updateAchievementToast(dt);
      if(state.achievementRevision!==achievements.getRevision()){state.achievementRevision=achievements.getRevision();if(state.overlay==='achievements')renderRequested=true;}
      if(wasPlaying&&checkpointActive()){
        autosaveAge+=dt;
        if(autosaveAge>=AUTOSAVE_SECONDS){autosaveAge=0;savePeriodicEndlessRun();}
      }
      syncMusic(dt);
      const music=musicState(),musicKey=music.trackId+':'+music.status;
      const animatedMenu=state.overlay==='home'||state.overlay==='almanac'||(state.overlay==='endless'&&!savedRun&&!state.saveError);
      // The simulation and music keep their clocks; static pages and paused
      // battles need no new pixels until feedback or an input changes them.
      if(!appHidden&&(wasPlaying||animatedMenu||renderRequested||hadFeedback||state.toastTime>0||musicKey!==lastPaintMusicKey||game.status+':'+state.overlay!==lastPaintSceneKey||dt===0))render();
    }
    function drawAtlas(type,x,y,size,pose) {
      const spec=engine.PLANTS[type]||engine.ENEMIES[type];
      const fallback=spec&&spec.motionKind||({snowpea:'pea',repeater:'pea',wallnut:'mascot',jalapeno:'cherry',runner:'momonga',pinkchimera:'chimera',boss:'anoko'})[type]||type;
      pose=pose||{};const bounds=BOUNDS[INDEX[fallback]===undefined?8:INDEX[fallback]];
      ctx.save();ctx.translate(x+(pose.shiftX||0),y+(pose.bob||0));ctx.rotate(pose.rotation||0);
      ctx.scale(pose.scaleX||1,pose.scaleY||1);ctx.globalAlpha*=pose.alpha===undefined?1:pose.alpha;
      if(imageReady.sheet&&type!=='chimera'&&type!=='drummer'){
        const sx=bounds[0],sy=bounds[1],sw=bounds[2],sh=bounds[3],scale=Math.min(size*.94/sw,size*.97/sh),dx=-sw*scale/2,dy=-sh*scale;
        const exclusion=EXCLUSIONS[fallback];
        if(exclusion){
          const ex=Math.max(sx,exclusion[0]),ey=Math.max(sy,exclusion[1]),er=Math.min(sx+sw,exclusion[0]+exclusion[2]),eb=Math.min(sy+sh,exclusion[1]+exclusion[3]);
          const parts=[[sx,sy,sw,Math.max(0,ey-sy)],[sx,eb,sw,Math.max(0,sy+sh-eb)],[sx,ey,Math.max(0,ex-sx),Math.max(0,eb-ey)],[er,ey,Math.max(0,sx+sw-er),Math.max(0,eb-ey)]];
          parts.forEach(p=>{if(p[2]>0&&p[3]>0)ctx.drawImage(images.sheet,p[0],p[1],p[2],p[3],dx+(p[0]-sx)*scale,dy+(p[1]-sy)*scale,p[2]*scale,p[3]*scale);});
        }else ctx.drawImage(images.sheet,sx,sy,sw,sh,dx,dy,sw*scale,sh*scale);
      }else {oval(ctx,0,-size*.4,size*.3,size*.33,'#fff8e3');oval(ctx,-size*.08,-size*.43,3,5,'#3b3931');oval(ctx,size*.08,-size*.43,3,5,'#3b3931');}
      ctx.restore();
    }
    function actorPose(type,obj,card){
      obj=obj||{};const age=obj.age===undefined?state.age:obj.age,spec=engine.PLANTS[type];
      const shooting=spec&&spec.interval&&obj.attackTimer!==undefined&&spec.interval-obj.attackTimer<.22;
      const enemy=!!engine.ENEMIES[type];
      const action=card?'idle':obj.hitTimer>0?'hurt':obj.eating?'attack':shooting?'shoot':enemy?'walk':'idle';
      const args={time:card?0:age,age:card?0:age,id:obj.id||0,action,hit:obj.hitTimer||0,enraged:!!obj.enraged,armed:!!obj.armed,phase:(obj.id||0)*.73,card:!!card};
      if(!card&&motion&&typeof motion.poseFor==='function'){
        // Live simulation entities already carry both fields. poseFor reads
        // them without mutation; avoid copying every combat/perk field simply
        // to sample one presentation pose.
        try{Object.assign(args,motion.poseFor(obj.type===type&&obj.age!==undefined?obj:Object.assign({type,age},obj),game.time));}catch(_){}
      }
      if(!card&&obj.presentation==='portrait'){args.presentation='portrait';args.action='idle';}
      if(!card&&combatFeedback)args.actionStage=combatFeedback.actionStage(obj,enemy,game.time);
      return args;
    }
    function actor(type,x,y,size,obj,card,preparedPose) {
      obj=obj||{};const age=obj.age===undefined?state.age:obj.age;
      const spec=engine.PLANTS[type];
      if(spec&&spec.support){
        lilyRenderer.draw(ctx,type,x,y,size,{time:card?0:age,card:!!card,occupied:!!obj.occupied,shield:obj.shield,shieldMax:obj.maxShield,hit:obj.hitTimer||0,phase:(obj.id||0)*.73,createCanvas:platform.createCanvas});
        return;
      }
      const args=preparedPose||actorPose(type,obj,card),shooting=args.action==='shoot',enemy=!!engine.ENEMIES[type];
      // Contact flashes are drawn by combatEffects. Do not restart or squash
      // the entire enemy on every projectile: its current stride must continue.
      ctx.save();
      if(motion&&typeof motion.draw==='function'){
        ctx.save();let drawn=false;
        try{drawn=motion.draw(ctx,type,x,y,size,args)!==false;}catch(_){drawn=false;}
        ctx.restore();if(drawn){ctx.restore();return;}
      }
      if((type==='chimera'||type==='drummer')&&motion&&typeof motion.drawFallback==='function'){
        ctx.save();let drawn=false;
        try{drawn=motion.drawFallback(ctx,type,x,y,size,args)===true;}catch(_){drawn=false;}
        ctx.restore();if(drawn){ctx.restore();return;}
      }
      const phase=age*2.7+(obj.id||0)*.73,breathe=card?0:Math.sin(phase)*.012;
      const pose={scaleX:1-breathe*.45,scaleY:1+breathe,bob:0};
      if(obj.presentation==='portrait'){
        pose.scaleX=pose.scaleY=1;pose.rotation=Math.sin(age*Math.PI*2/(type==='boss'?5.6:4.8))*.035;
      }else if(!card&&enemy){const step=Math.sin(age*(obj.enraged?8.6:6)+(obj.id||0));pose.bob=obj.eating?0:-Math.abs(step)*3;pose.rotation=-.018+step*.016;pose.shiftX=obj.eating?-Math.max(0,Math.sin(age*10))*2:0;}
      if(!card&&shooting){const r=Math.max(0,1-(spec.interval-obj.attackTimer)/.22);pose.shiftX=-r*4;pose.rotation=-r*.03;}
      if(obj.hitTimer>0&&!enemy)pose.shiftX=(pose.shiftX||0)+obj.hitTimer*30;
      drawAtlas(type,x,y,size,pose);
      ctx.restore();
    }
    function actorSize(type,scale=unitScale()) {
      if(engine.PLANTS[type]&&engine.PLANTS[type].support)return 126*scale;
      const size=motion&&motion.definitions&&motion.definitions[type]&&motion.definitions[type].drawSize;
      return (Number.isFinite(size)&&size>0?size:type==='mine'?114:type==='anoko'?170:type==='boss'?184:type==='chimera'?145:engine.ENEMIES[type]?142:134)*scale;
    }
    function sun(x,y,size,alpha) {
      ctx.save();ctx.globalAlpha=alpha===undefined?1:alpha;
      if(imageReady.sun){const frame=Math.floor(state.age*12)%29;ctx.drawImage(images.sun,frame*79,0,79,79,x-size*2.2,y-size*2.2,size*4.4,size*4.4);}
      else{for(let i=0;i<8;i++){const a=i*Math.PI/4;oval(ctx,x+Math.cos(a)*size*1.2,y+Math.sin(a)*size*1.2,size*.25,size*.25,'#efc343');}oval(ctx,x,y,size,size,'#ffe679');}
      ctx.restore();
    }
    function mower(m) {
      if(m.used&&!m.active)return;
      const x=GRID.x+m.x*GRID.w,y=GRID.y+(m.row+(.74)+rowAnchorDelta())*GRID.h+(m.active?Math.sin(state.age*35)*2:0);
      const scale=unitScale();
      if(!image('mower',x-56*scale,y-62*scale,112*scale,91.2*scale)){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);round(ctx,-25,-20,45,25,5,'#a84231','#322c23',3);oval(ctx,-15,5,9,9,'#272c26');oval(ctx,13,5,9,9,'#272c26');ctx.restore();}
    }
    function backgroundSnapshot() {
      const choosing=state.overlay==='endless'||state.overlay==='prepare'&&state.level==='endless';
      const level=levelInfo(game.status==='ready'?state.level:game.levelId),map=choosing?mapForLevel({id:'map-preview',mapId:state.endlessMap}):game.status==='ready'?mapForLevel(level):game.getMap();
      const sceneImage=illustratedBattle()||choosing?sceneArt(map.id,true):null;
      const width=view.logicalWidth,density=scenePixelScale(),grid=sceneImage?(illustratedBattle()?GRID:terrainRenderer.sceneGrid(map,width,H)):GRID;
      const key=map.id+':'+map.sceneLayoutVersion+':'+[grid.x,grid.y,grid.w,grid.h,grid.plantingAnchorY].join(',')+':'+grid.cols+'x'+grid.rows+':'+level.theme+':'+!!imageReady.background+':'+!!imageReady.terrainMaterials+':'+width+':'+density+':scene'+(sceneImage?sceneImage.width:0);
      let cached=terrainCache.get(key);
      if(!cached){
        // At most one full-size scene is retained. Visiting all maps on a
        // phone must not retain dozens of full-size GPU-backed canvases.
        clearSurfaceCache(terrainCache);
        cached=platform.createCanvas();cached.width=Math.ceil(width*density);cached.height=Math.ceil(H*density);
        const surface=cached.getContext('2d');smoothImages(surface);surface.setTransform(cached.width/width,0,0,cached.height/H,0,0);
        terrainRenderer.draw(surface,{map,grid,width,height:H,theme:level.theme,sceneImage,background:imageReady.background?images.background:null,materialAtlas:imageReady.terrainMaterials?images.terrainMaterials:null});
        terrainCache.set(key,cached);terrainSurfaceGeneration++;
      }
      return {cached,key,map,grid,width,generation:terrainSurfaceGeneration};
    }
    function drawBackground() {
      const {cached,map,grid,width,generation}=frameBackground||backgroundSnapshot();
      if(!staticTerrainFrame){
        const replayed=drawingDeviceBackground&&deviceBackgroundCache.draw(ctx,cached,width,H,generation,
          {firstBaseDraw:true,fullViewClip:true,immutableSource:true,opaqueUnderlay:'#171912',viewWidth:view.logicalWidth,viewHeight:H});
        if(!replayed)ctx.drawImage(cached,0,0,width,H);
      }
      terrainRenderer.drawAmbient(ctx,{map,grid,width,height:H,time:game.status==='ready'?state.age:game.time});
    }
    function hideStaticTerrain(){
      staticTerrainFrame=false;frameBackground=null;staticTerrainRects=null;
      if(typeof platform.hideStaticTerrain==='function')try{platform.hideStaticTerrain();}catch(_){}
    }

    function ambientBounds(draw,options){
  const rectangles=[],stack=[];let matrix=[1,0,0,1,0,0],bounds=null;
  const style={globalAlpha:1,lineWidth:1,lineCap:'butt',lineJoin:'miter',miterLimit:10};
  const finite=(...values)=>values.every(Number.isFinite);
  function point(x,y){if(!finite(x,y,...matrix))throw Error('nonfinite ambient geometry');const px=matrix[0]*x+matrix[4],py=matrix[3]*y+matrix[5];if(!bounds)bounds=[px,py,px,py];else{bounds[0]=Math.min(bounds[0],px);bounds[1]=Math.min(bounds[1],py);bounds[2]=Math.max(bounds[2],px);bounds[3]=Math.max(bounds[3],py);}}
  function paint(stroke){if(!bounds)return;const join=style.lineJoin==='miter'?Math.max(1,style.miterLimit):1,width=stroke?Math.max(Math.abs(matrix[0]),Math.abs(matrix[3]))*style.lineWidth/2*join:0;if(!finite(width)||width<0)throw Error('unsafe ambient width');rectangles.push([bounds[0]-width,bounds[1]-width,bounds[2]+width,bounds[3]+width]);}
  const methods={
    save(){stack.push({matrix:matrix.slice(),style:{...style}});},
    restore(){const saved=stack.pop();if(!saved)throw Error('unbalanced ambient save');matrix=saved.matrix;Object.assign(style,saved.style);},
    translate(x,y){if(!finite(x,y))throw Error('nonfinite ambient transform');matrix[4]+=matrix[0]*x;matrix[5]+=matrix[3]*y;},
    scale(x,y){if(!finite(x,y)||x<=0||y<=0)throw Error('unsupported ambient scale');matrix[0]*=x;matrix[3]*=y;},
    beginPath(){bounds=null;},closePath(){},
    moveTo:point,lineTo:point,
    quadraticCurveTo(x1,y1,x2,y2){point(x1,y1);point(x2,y2);},
    bezierCurveTo(x1,y1,x2,y2,x3,y3){point(x1,y1);point(x2,y2);point(x3,y3);},
    rect(x,y,w,h){point(x,y);point(x+w,y+h);},
    arc(x,y,r){if(!finite(r)||r<0)throw Error('unsafe ambient arc');point(x-r,y-r);point(x+r,y+r);},
    clip(...args){if(args.length)throw Error('unsupported ambient clip');},
    fill(...args){if(args.length)throw Error('unsupported ambient path');paint(false);},
    stroke(...args){if(args.length)throw Error('unsupported ambient path');paint(true);}
  };
  const context=new Proxy(style,{get(target,key){if(Object.hasOwn(methods,key))return methods[key];if(Object.hasOwn(target,key))return target[key];throw Error('unsupported ambient operation '+String(key));},set(target,key,value){if(['globalAlpha','lineWidth','lineCap','lineJoin','miterLimit','fillStyle','strokeStyle'].includes(key)){target[key]=value;return true;}throw Error('unsupported ambient state '+String(key));}});
  draw(context,options);if(stack.length)throw Error('unbalanced ambient saves');return rectangles;
}
    function backingRectangles(rectangles,matrix,width,height,tileX=32,tileY=tileX){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>24*1024*1024||matrix.length!==6||!matrix.every(Number.isFinite)||matrix[0]<=0||matrix[3]<=0||matrix[1]!==0||matrix[2]!==0||!Number.isInteger(tileX)||!Number.isInteger(tileY)||tileX<=0||tileY<=0||tileX>128||tileY>128)throw Error('unsafe terrain backing');
  const cols=Math.ceil(width/tileX),rows=Math.ceil(height/tileY),mask=new Uint8Array(cols*rows);
  for(const r of rectangles){if(r.length!==4||!r.every(Number.isFinite)||r[2]<r[0]||r[3]<r[1])throw Error('unsafe underlay bounds');
    const left=Math.max(0,Math.floor(matrix[0]*r[0]+matrix[4]-2)),top=Math.max(0,Math.floor(matrix[3]*r[1]+matrix[5]-2));
    const right=Math.min(width,Math.ceil(matrix[0]*r[2]+matrix[4]+2)),bottom=Math.min(height,Math.ceil(matrix[3]*r[3]+matrix[5]+2));
    if(right<=left||bottom<=top)continue;
    const x0=Math.floor(left/tileX),x1=Math.ceil(right/tileX),y0=Math.floor(top/tileY),y1=Math.ceil(bottom/tileY);
    for(let y=y0;y<y1;y++)mask.fill(1,y*cols+x0,y*cols+x1);
  }
  const out=[];let previous=new Map();
  for(let y=0;y<rows;y++){
    const next=new Map();for(let x=0;x<cols;){if(!mask[y*cols+x]){x++;continue;}const start=x;while(x<cols&&mask[y*cols+x])x++;const key=start+':'+x;let r=previous.get(key);if(r)r[3]=Math.min(height,(y+1)*tileY)-r[1];else{r=[start*tileX,y*tileY,Math.min(width,x*tileX)-start*tileX,Math.min(height,(y+1)*tileY)-y*tileY];out.push(r);}next.set(key,r);}previous=next;
  }
  return out;
}
    function supportBounds(leaf,grid,scale){
  if(!['lily','frostlily','powerlily','hastelily','guardlily'].includes(leaf.type)||![leaf.x,leaf.row,scale,grid.x,grid.y,grid.w,grid.h].every(Number.isFinite)||scale<=0)throw Error('unknown support geometry');
  const delta=(Number.isFinite(grid.plantingAnchorY)?grid.plantingAnchorY:.9)-.9,x=grid.x+leaf.x*grid.w,y=grid.y+(leaf.row+.9+delta)*grid.h;
  // Actual leaf cache: [-64,-40,128,80], bob ±1.4, rotation ±.012,
  // translated by -17. Includes the full padded badge and fixed-pixel HP bar.
  const extent=Math.max(90*scale+12,70),result=[[x-extent,y-62*scale-12,x+extent,y+Math.max(34*scale+12,20)]];
  if(leaf.type==='frostlily'){const w=Math.max(16,Math.min(512,grid.w*2)),center=x+grid.w/2;result.push([center-w*.4-5,y-35-16,center+w*.4+5,y-35+14]);}
  return result;
}
    function perkBounds(fields,grid){
  const result=[],delta=(Number.isFinite(grid.plantingAnchorY)?grid.plantingAnchorY:.9)-.9;
  for(const f of fields){
    if(!['spore','slow','burn'].includes(f.kind))throw Error('unknown field drawing');
    if(![f.age,f.duration,f.x,f.row,f.radius,f.rows===undefined?0:f.rows].every(Number.isFinite)||!Number.isInteger(f.row)||!Number.isInteger(f.rows===undefined?0:f.rows)||f.radius<0||f.rows<0)throw Error('unsafe field geometry');
    if(f.duration<=0||f.age<0||f.age>=f.duration)continue;
    const left=Math.max(0,f.x-f.radius),right=Math.min(grid.cols,f.x+f.radius);if(right<=left)continue;
    for(let row=Math.max(0,f.row-(f.rows||0));row<=Math.min(grid.rows-1,f.row+(f.rows||0));row++){
      // The spore hull is at most 1.08*21 high; include its original 1.8
      // stroke with the full default miter limit, not just half lineWidth.
      const y=grid.y+(row+.85+delta)*grid.h,top=Math.max(grid.y+row*grid.h,y-Math.max(72,grid.h*.22+44)),bottom=Math.min(grid.y+(row+1)*grid.h,y+Math.max(30,grid.h*.18+3));
      if(bottom>top)result.push([grid.x+left*grid.w,top,grid.x+right*grid.w,bottom]);
    }
  }
  return result;
}
    function staticTerrainUnderlay(background,matrix){
      // Interactive ghosts/text use the complete original path. No subset of
      // their drawing, nor any unknown geometry, is admitted by this option.
      if(state.hover&&state.hoverTime>0||state.drag&&state.drag.active||state.held&&state.held.visible||state.shovel&&state.shovel.visible)return null;
      if(!background.map||!(background.map.sceneLayoutVersion>0)||!Number.isFinite(game.time))return null;
      if(![GRID.x,GRID.y,GRID.w,GRID.h,GRID.cols,GRID.rows].every(Number.isFinite)||GRID.w<=0||GRID.h<=0)return null;
      try{
        const bounds=ambientBounds((surface,o)=>terrainRenderer.drawAmbient(surface,o),{map:background.map,grid:background.grid,width:background.width,height:H,time:game.time});
        for(const leaf of game.supports)bounds.push(...supportBounds(leaf,GRID,unitScale()));
        bounds.push(...perkBounds(game.perkFields||[],GRID));
        const grid=platform.getStaticTerrainGrid(canvas);
        if(!grid||grid.backingWidth!==canvas.width||grid.backingHeight!==canvas.height||![grid.tileX,grid.tileY,grid.displayWidth,grid.displayHeight,grid.left,grid.top].every(Number.isSafeInteger)||grid.tileX<=0||grid.tileY<=0||grid.tileX>128||grid.tileY>128||grid.displayWidth<=0||grid.displayHeight<=0||grid.displayWidth>canvas.width||grid.displayHeight>canvas.height)return null;
        // Recheck divisibility at the Native boundary; mocks/custom adapters
        // cannot admit a partially aligned grid by returning a shape alone.
        if(grid.tileX*grid.displayWidth%canvas.width||grid.tileY*grid.displayHeight%canvas.height)return null;
        return backingRectangles(bounds,matrix,canvas.width,canvas.height,grid.tileX,grid.tileY);
      }catch(_){return null;}
    }
    function restoreStaticTerrainUnderlay(){
      if(!staticTerrainFrame)return true;
      try{if(platform.restoreStaticTerrain(canvas,staticTerrainRects)===true)return true;}catch(_){}
      hideStaticTerrain();return false;
    }
    function prepareStaticTerrain(impact){
      // Closed opt-in only. All overlays, shakes and failed scene paths retain
      // the original opaque Canvas frame, including its exact clipping order.
      if(options.nativeStaticTerrain!==true||platform.staticTerrainPresentation!==true||
        typeof platform.presentStaticTerrain!=='function'||typeof platform.hideStaticTerrain!=='function'||typeof platform.restoreStaticTerrain!=='function'||typeof platform.getStaticTerrainGrid!=='function'||
        platform.motionLayerPresentation!==true||!motion||!motion.ready||typeof motion.beginScene!=='function'||
        !game.isEndless||GRID.cols<15||game.plants.length+game.enemies.length<32||game.status!=='playing'||effectiveSpeed()<8||state.overlay||appHidden||sceneRetry||impact)return false;
      const alpha=ctx.globalAlpha,composite=ctx.globalCompositeOperation||'source-over',filter=ctx.filter||'none';
      if(alpha!==1||composite!=='source-over'||filter!=='none'||ctx.miterLimit!==undefined&&(!Number.isFinite(ctx.miterLimit)||ctx.miterLimit>10)||(ctx.shadowBlur||0)!==0||
        (ctx.shadowOffsetX||0)!==0||(ctx.shadowOffsetY||0)!==0||ctx.shadowColor&&ctx.shadowColor!=='rgba(0, 0, 0, 0)'&&ctx.shadowColor!=='rgba(0,0,0,0)')return false;
      try{
        const background=backgroundSnapshot(),dpr=view.pixelRatio,matrix=[dpr*view.scale,0,0,dpr*view.scale,dpr*view.x,dpr*view.y];
        const underlay=staticTerrainUnderlay(background,matrix);if(!underlay)return false;
        const values=[canvas.width,canvas.height,...matrix,view.logicalWidth,H,state.renderQuality,
          ctx.imageSmoothingEnabled,ctx.imageSmoothingQuality,staticTerrainSourceVersion,background.key];
        const signature=JSON.stringify(values),prior=staticTerrainRecord;
        const changed=!prior||prior.signature!==signature||prior.cached!==background.cached||prior.map!==background.map;
        const paint=changed?surface=>{
          surface.save();
          try{
            surface.setTransform(1,0,0,1,0,0);surface.globalAlpha=1;surface.globalCompositeOperation='source-over';
            if('filter'in surface)surface.filter='none';
            surface.shadowColor='rgba(0,0,0,0)';surface.shadowBlur=0;surface.shadowOffsetX=0;surface.shadowOffsetY=0;
            surface.imageSmoothingEnabled=ctx.imageSmoothingEnabled;surface.imageSmoothingQuality=ctx.imageSmoothingQuality;
            rect(surface,0,0,canvas.width,canvas.height,'#171912');
            surface.setTransform(...matrix);surface.beginPath();surface.rect(0,0,view.logicalWidth,H);surface.clip();
            surface.drawImage(background.cached,0,0,background.width,H);
          }finally{surface.restore();}
        }:null;
        if(platform.presentStaticTerrain(canvas,paint)!==true){staticTerrainRecord=null;return false;}
        staticTerrainRecord={signature,cached:background.cached,map:background.map};
        frameBackground=background;staticTerrainRects=underlay;staticTerrainFrame=true;return true;
      }catch(_){staticTerrainRecord=null;return false;}
    }

    function wardSourceAlive(plant) {
      if(!plant.wardSourceId)return true;
      if(renderSupportIds){const leaf=renderSupportIds.get(plant.wardSourceId);return !!leaf&&leaf.row===plant.row&&leaf.col===plant.col;}
      return game.supports.some(leaf=>leaf.id===plant.wardSourceId&&leaf.hp>0&&leaf.row===plant.row&&leaf.col===plant.col);
    }
    function renderSupport(row,col){return renderSupports?renderSupports.get(row*GRID.cols+col):game.getSupport(row,col);}
    function visibleWard(plant) {
      return game.isEndless&&plant.hp>0&&plant.ward>0&&plant.wardUntil>game.time&&wardSourceAlive(plant)?plant.ward:0;
    }
    function shieldHit(at) {
      return Number.isFinite(at)&&at>=0?Math.max(0,Math.min(1,1-(game.time-at)/.24)):0;
    }
    function drawPlantShield(plant,support,x,y,size) {
      if(!(plant.hp>0))return;
      const guard=support&&support.hp>0&&support.maxShield>0?support:null,ward=visibleWard(plant);
      // The outer gold shell is the first pool damaged; skill wards sit within it.
      if(guard&&guard.shield>0)lilyRenderer.drawShield(ctx,x,y,size,{time:game.time,shield:guard.shield,shieldMax:guard.maxShield,hit:Math.min(1,(guard.shieldHitTimer||0)/.24),kind:'guard',createCanvas:platform.createCanvas,registerSceneImage:motion&&motion.registerSceneImage,unregisterSceneImage:motion&&motion.unregisterSceneImage,...(sceneImageRetire?{sceneImageRetirement:sceneImageRetire}:{})});
      if(ward>0)lilyRenderer.drawShield(ctx,x,y,guard&&guard.shield>0?size*.92:size,{time:game.time,shield:ward,shieldMax:plant.wardMax||ward,hit:shieldHit(plant.wardHitAt),kind:'ward',createCanvas:platform.createCanvas,registerSceneImage:motion&&motion.registerSceneImage,unregisterSceneImage:motion&&motion.unregisterSceneImage,...(sceneImageRetire?{sceneImageRetirement:sceneImageRetire}:{})});
      if(guard&&Number.isFinite(guard.shieldBreakAt)&&guard.shieldBreakAt>=0&&guard.shield<=0)
        lilyRenderer.drawShieldBreak(ctx,x,y,size,{age:game.time-guard.shieldBreakAt,kind:'guard'});
      if(game.isEndless&&wardSourceAlive(plant)&&Number.isFinite(plant.wardBreakAt)&&plant.wardBreakAt>=0&&!(ward>0))
        lilyRenderer.drawShieldBreak(ctx,x,y,size,{age:game.time-plant.wardBreakAt,kind:'ward'});
    }
    function drawShieldBars() {
      const draw=(plant,guard,dormant)=>{
        const ward=plant?visibleWard(plant):0;
        if(!guard&&!ward)return;
        const anchor=plant||guard,x=GRID.x+anchor.x*GRID.w,y=GRID.y+(anchor.row+(.9)+rowAnchorDelta())*GRID.h;
        lilyRenderer.drawShieldBar(ctx,x,y,100*unitScale(),{shield:guard?guard.shield:0,shieldMax:guard?guard.maxShield:0,ward,wardMax:ward?plant.wardMax||ward:0,dormant,hit:Math.max(guard?Math.min(1,(guard.shieldHitTimer||0)/.24):0,ward?shieldHit(plant.wardHitAt):0),time:game.time});
      };
      game.plants.forEach(plant=>{
        if(!(plant.hp>0))return;
        const support=renderSupport(plant.row,plant.col),guard=support&&support.hp>0&&support.maxShield>0?support:null;
        draw(plant,guard,false);
      });
      game.supports.forEach(leaf=>{
        if(leaf.hp>0&&leaf.maxShield>0&&!(renderPlantCells?renderPlantCells.has(leaf.row*GRID.cols+leaf.col):game.plants.some(plant=>plant.hp>0&&plant.row===leaf.row&&plant.col===leaf.col)))draw(null,leaf,true);
      });
    }
    function drawEntities() {
      // These indices last for one paint only. Combat/death/shovelling changes
      // are read again before the next frame, never held in simulation caches.
      renderSupports=new Map();renderSupportIds=new Map();renderPlantCells=new Set();
      for(const leaf of game.supports)if(leaf.hp>0){renderSupports.set(leaf.row*GRID.cols+leaf.col,leaf);renderSupportIds.set(leaf.id,leaf);}
      for(const plant of game.plants)if(plant.hp>0)renderPlantCells.add(plant.row*GRID.cols+plant.col);
      if(game.status==='ready'){
        if(state.level==='endless')return;
        for(let row=0;row<5;row++){mower({row,x:-.45,used:false});actor('sunflower',128,GRID.y+(row+(.9)+rowAnchorDelta())*GRID.h,134);if(row!==1)actor(row===4?'mushroom':'pea',256,GRID.y+(row+(.9)+rowAnchorDelta())*GRID.h,132);}
        actor('momonga',1100,GRID.y+1.9*GRID.h,142);actor('anoko',1030,GRID.y+3.9*GRID.h,170);actor('chimera',1115,GRID.y+4.9*GRID.h,145);return;
      }
      if(state.hover&&state.hoverTime>0&&game.status==='playing'){const h=state.hover;round(ctx,GRID.x+h.col*GRID.w+3,GRID.y+h.row*GRID.h+3,GRID.w-6,GRID.h-6,8,'rgba(255,246,162,.17)','#fcf1b0',2);}
      drawShovelTarget();
      const preview=state.sunSweep?null:state.drag&&state.drag.active?state.drag:state.held&&state.held.visible?state.held:null;
      if(preview&&game.status==='playing'&&!state.overlay){
        updateDragTarget(preview);
        if(game.cellValid(preview.row,preview.col)&&!contains(localHUD.bank,preview)){
          round(ctx,GRID.x+preview.col*GRID.w+3,GRID.y+preview.row*GRID.h+3,GRID.w-6,GRID.h-6,8,preview.valid?'rgba(155,245,85,.3)':'rgba(244,80,65,.3)',preview.valid?'#d0ff78':'#ff7763',4);
          if(preview.valid){
            const x=GRID.x+(preview.col+.5)*GRID.w,y=GRID.y+(preview.row+(.9)+rowAnchorDelta())*GRID.h;
            oval(ctx,x,y-6,31,9,'rgba(24,64,24,.2)');
            ctx.save();ctx.globalAlpha=.32;actor(preview.type,x,y,actorSize(preview.type),null,true);ctx.restore();
          }else if(!game.getTerrain(preview.row,preview.col).plantable||engine.PLANTS[preview.type]&&engine.PLANTS[preview.type].support){
            const tile=game.getTerrain(preview.row,preview.col),x=GRID.x+(preview.col+.5)*GRID.w,y=GRID.y+(preview.row+.5)*GRID.h;
            const support=engine.PLANTS[preview.type]&&engine.PLANTS[preview.type].support;
            const hint=support?(tile.kind!=='water'?'荷叶只能放水面':game.getSupport(preview.row,preview.col)?'已有荷叶':'暂不能放置'):tile.kind==='water'&&!game.getSupport(preview.row,preview.col)?'先放一片荷叶':tile.plantable||game.getSupport(preview.row,preview.col)?'此格暂不能种':tile.name+'不可种';
            label(ctx,hint,x,y,18,'#fff1d5','center',true,'#6c2e27');
          }
        }
      }
      if(combatEffects.drawPerkFields)combatEffects.drawPerkFields(ctx,game,GRID);
      const occupiedCells=new Set(game.plants.map(p=>p.row+':'+p.col));
      const liveSupportIds=new Set(game.supports.filter(leaf=>leaf.hp>0).map(leaf=>leaf.id));
      game.supports.forEach(leaf=>{
        const x=GRID.x+leaf.x*GRID.w,y=GRID.y+(leaf.row+(.9)+rowAnchorDelta())*GRID.h;
        if(leaf.type==='frostlily')lilyRenderer.drawFrostMist(ctx,x+GRID.w/2,y-35,GRID.w*2,{time:game.time});
        actor(leaf.type,x,y,actorSize(leaf.type),Object.assign({},leaf,{occupied:occupiedCells.has(leaf.row+':'+leaf.col)}));
        drawLevelBadge(leaf.type,x-44*unitScale(),y+unitScale());
        if(leaf.hp<leaf.maxHp){const hpX=leaf.maxShield?x+29:x-23,hpY=leaf.maxShield?y-8:y+9,hpW=leaf.maxShield?22:46;round(ctx,hpX,hpY,hpW,5,2,'#354e3c');round(ctx,hpX,hpY,hpW*Math.max(0,leaf.hp/leaf.maxHp),5,2,'#a9d688');}
      });
      // Incoming waves may be queued well beyond the right edge. Keep every
      // enemy in the simulation, but do not build meshes for invisible actors.
      const visibleEnemies=game.enemies.filter(enemy=>{const x=GRID.x+enemy.x*GRID.w,margin=actorSize(enemy.type)*1.25;return x+margin>=0&&x-margin<=view.logicalWidth;});
      const entities=game.plants.concat(visibleEnemies).sort((a,b)=>a.row-b.row||a.x-b.x);
      // Preparation and scene drawing must use the same pose. Sampling the rig
      // twice per actor wasted work on every display frame of a full board.
      const actors=entities.map(o=>({object:o,kind:o.type,size:actorSize(o.type),pose:actorPose(o.type,o,false)}));
      const impactIds=combatFeedback?new Set(combatFeedback.selectedImpacts(visibleEnemies,game.time)):null;
      const drawCombatActor=({object:o,size,pose})=>{
        const support=engine.PLANTS[o.type]?renderSupport(o.row,o.col):null;
        const displacement=engine.ENEMIES[o.type]&&combatFeedback?combatFeedback.actorOffset(o,game.time):{x:0,y:0};
        const scale=unitScale(),x=GRID.x+(o.x+displacement.x)*GRID.w,y=GRID.y+(o.row+(.9+displacement.y)+rowAnchorDelta())*GRID.h-(support?10*scale:0);
        drawActorShadow(x,y,scale,o.type==='cherry'?36:28);actor(o.type,x,y,size,o,false,pose);
        if(engine.ENEMIES[o.type]&&(!impactIds||impactIds.has(o.id))&&combatEffects.drawEnemyImpact)combatEffects.drawEnemyImpact(ctx,displacement.x?{...o,x:o.x+displacement.x}:o,GRID,motion);
        if(engine.PLANTS[o.type])drawPlantShield(o,support,x,y,size);
        if(lilyRenderer.drawBuff&&engine.PLANTS[o.type]){
          // Read the combat-applied bonuses, including nearby support skills.
          // Source existence also prevents an icon lingering after shovelling.
          const liveSource=id=>liveSupportIds.has(id);
          if(o.supportDamageBonus>0&&liveSource(o.supportPowerSourceId))drawActorAccent('power',x,y,size);
          if(o.supportAttackRate>1&&liveSource(o.supportHasteSourceId))lilyRenderer.drawBuff(ctx,'hastelily',x,y,size,{time:game.time,bonus:o.supportAttackRate-1,active:true});
        }
        if(o.type==='mine'&&!o.armed){const ratio=Math.min(1,o.age/engine.PLANTS.mine.armTime);round(ctx,x-25,y-72,50,6,3,'#5e6647');round(ctx,x-25,y-72,50*ratio,6,3,'#f2de8b');}
        if(engine.PLANTS[o.type])drawLevelBadge(o.type,x+25*scale,y-23*scale);
        if(engine.ENEMIES[o.type]&&(o.slowTimer>0||(o.frozenUntil||0)>game.time))drawActorAccent('slow',x,y,size);
        if(o.enraged)drawActorAccent('rage',x,y,size);
        if(engine.ENEMIES[o.type]&&o.drumRate>1)drawActorAccent('drum',x,y,size);
        if(o.hp<o.maxHp){drawActorBar(x-25,y+2,50,6,3,'rgba(30,52,24,.6)');drawActorBar(x-25,y+2,50*Math.max(0,o.hp/o.maxHp),6,3,o.hp/o.maxHp>.4?'#ffec9b':'#ee9b7e');}
        if(engine.ENEMIES[o.type]&&o.maxArmor>0&&o.armor>0){drawActorBar(x-25,y+12,50,5,2,'#4a5361');drawActorBar(x-25,y+12,50*Math.min(1,o.armor/o.maxArmor),5,2,'#b7d1df');}
      };
      const sceneCtx=ctx;
      // A crowded board previously copied dozens of changing WebGL atlases
      // into Canvas2D. Composite its meshes and ordered vector overlays in one
      // GPU scene, then cross that boundary only once. Small/native boards and
      // unsupported or lost contexts keep the established drawing path.
      let scene=null,sceneDrawn=false;
      if(!sceneRetry&&game.isEndless&&GRID.cols>=15&&(actors.length>=32||options.visualReplica===true)&&motion&&motion.ready&&typeof motion.beginScene==='function'){
        // At high speed, moving actors use every physical display pixel, while
        // terrain, effects and UI retain the selected supersampled quality.
        // Avoid spending the frame on extra, invisible actor supersampling.
        const pixelScale=effectiveSpeed()>=8?Math.min(1,view.displayPixelRatio/view.pixelRatio):1;
        try{scene=(sceneImageBegin?sceneImageBegin(sceneCtx,{pixelScale,immutableContext:true,cacheImageState:true,cacheCaptureContext:true}):motion.beginScene(sceneCtx,{pixelScale,immutableContext:true,cacheImageState:true,cacheCaptureContext:true}));}catch(_){scene=null;}
      }
      if(scene){
        try{
          for(const item of actors){
            const o=item.object,size=item.size,scale=unitScale(),plant=!!engine.PLANTS[o.type];
            const support=plant?renderSupport(o.row,o.col):null;
            const displacement=!plant&&combatFeedback?combatFeedback.actorOffset(o,game.time):{x:0,y:0};
            const x=GRID.x+(o.x+displacement.x)*GRID.w,y=GRID.y+(o.row+(.9+displacement.y)+rowAnchorDelta())*GRID.h-(support?10*scale:0);
            // These bounds enclose vector overlays, not the mesh itself. Mesh
            // commands retain their full geometry even outside this rectangle.
            let left=x-42*scale,right=x+77*scale,top=y-32*scale,bottom=y+25*scale;
            if(!plant){left=Math.min(left,x-size*.85-8);right=Math.max(right,x+size*.75+8);top=Math.min(top,y-Math.max(size*1.25,110));}
            if(plant&&((support&&support.shield>0)||visibleWard(o)>0)){left=Math.min(left,x-size*.62-8);right=Math.max(right,x+size*.69+8);top=Math.min(top,y-size*1.2-8);}
            if(plant&&(o.supportDamageBonus>0||o.supportAttackRate>1)){right=Math.max(right,x+size*.57+8);top=Math.min(top,y-size*.58-8);}
            if(o.type==='mine'&&!o.armed)top=Math.min(top,y-78);
            if(o.type==='shisa'){left=Math.min(left,x-size*.15-8);top=Math.min(top,y-size*.63-8);}
            if(o.enraged){right=Math.max(right,x+50);top=Math.min(top,y-110);}
            if(o.drumRate>1){left=Math.min(left,x-51);top=Math.min(top,y-88);}
            scene.capture({x:left,y:top,width:right-left,height:bottom-top},layerCtx=>{
              ctx=layerCtx;drawCombatActor(item);
            },{id:(plant?'plant:':'enemy:')+o.id,continuity:o.type+':'+(item.pose.action||'idle')+':'+(o.eating?'eat':'walk')+':'+((o.frozenUntil||0)>game.time?'frozen':'moving')});
            ctx=sceneCtx;
          }
          // Finish the shared GL canvas after later effects/card draws, then
          // let browsers display it directly between terrain and foreground.
          if(platform.motionLayerPresentation===true&&typeof platform.beginMotionScene==='function'&&typeof platform.presentMotionScene==='function'){
            const foreground=platform.beginMotionScene(canvas);
            if(foreground&&typeof foreground.getTransform==='function'){
              if(options.visualReplica===true&&options.separateToastLabelCache===true)separateToastLabelCache.observeContext(foreground);
              const m=sceneCtx.getTransform(),base=view.pixelRatio*view.scale;
              foreground.setTransform(1,0,0,1,0,0);foreground.clearRect(0,0,canvas.width,canvas.height);
              foreground.setTransform(base,0,0,base,view.pixelRatio*view.x,view.pixelRatio*view.y);
              smoothImages(foreground);foreground.save();foreground.beginPath();foreground.rect(0,0,view.logicalWidth,H);foreground.clip();foreground.save();
              foreground.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
              // Transfer render's viewport and shake saves to the foreground.
              sceneCtx.restore();sceneCtx.restore();sceneForeground=foreground;deferredScene=scene;sceneDrawn=true;
            }
          }
          if(!sceneDrawn)sceneDrawn=scene.finish()===true;
        }catch(_){if(scene.cancel)scene.cancel();}
        finally{ctx=sceneCtx;}
      }
      if(sceneForeground)ctx=sceneForeground;
      if(!sceneDrawn){
        if(motion&&motion.ready&&typeof motion.prepareFrame==='function'){try{motion.prepareFrame(ctx,actors);}catch(_){if(motion.finishFrame)motion.finishFrame();}}
        actors.forEach(drawCombatActor);
      }
      if(combatFeedback)combatFeedback.drawStatuses(ctx,game,GRID);
      if(combatEffects.drawPerkStatuses)combatEffects.drawPerkStatuses(ctx,game,GRID,{shieldOverlay:true});
      game.mowers.forEach(mower);
      if(combatEffects.drawAttackCues)combatEffects.drawAttackCues(ctx,game,GRID,motion);
      combatEffects.drawProjectiles(ctx,game,GRID,motion);
      // Victim silhouettes sit behind the blast instead of covering its impact.
      (combatFeedback?combatFeedback.selectEffects(visualReplicaFrame?game.effects.concat(visualReplicaFrame.transientEffects||[]):threadedActive()?game.effects.concat(simulation.getTransientEffects()):game.effects):game.effects.slice()).sort((a,b)=>(a.type==='burst'||a.type==='fire'?1:0)-(b.type==='burst'||b.type==='fire'?1:0)).forEach(e=>{
        const ratio=Math.min(1,e.age/e.duration),x=GRID.x+e.x*GRID.w,y=GRID.y+(e.row+(.55)+rowAnchorDelta())*GRID.h;
        // Offscreen corpses still finish their simulation lifetime. Like live
        // queued enemies, they need no high-resolution animation surface yet.
        if(e.type==='defeat'&&e.enemyType){const margin=actorSize(e.enemyType)*1.5;if(x+margin<0||x-margin>view.logicalWidth)return;}
        ctx.save();ctx.globalAlpha=['defeat','burst','fire','lightning'].includes(e.type)?1:1-ratio;
        if(e.type==='defeat'&&e.enemyType&&motion&&motion.ready){
          if(e.deathKind==='burn'&&motion.drawBurned){motion.drawBurned(ctx,e.enemyType,x,GRID.y+(e.row+(.9)+rowAnchorDelta())*GRID.h,actorSize(e.enemyType),e.age,e.duration);ctx.restore();return;}
          // PC deaths hold their last cel for 90 ticks, then fade over the
          // final 10 ticks. A rendered corpse does not also burst into dots.
          if(motion.draw(ctx,e.enemyType,x,GRID.y+(e.row+(.9)+rowAnchorDelta())*GRID.h,actorSize(e.enemyType),{action:'death',time:e.age,deathFps:e.deathFps,alpha:Math.max(0,Math.min(1,(e.duration-e.age)/.1))})){ctx.restore();return;}
          ctx.globalAlpha=1-ratio;
        }
        if(combatFeedback&&combatFeedback.drawEffect(ctx,e,GRID)){ctx.restore();return;}
        if(e.type==='burst'){
          if(!combatEffects.drawBurst(ctx,e,GRID)){ctx.globalAlpha=1-ratio;oval(ctx,x,y,28+ratio*140,22+ratio*105,'#fff1b3');for(let i=0;i<10;i++){const a=i*Math.PI/5;oval(ctx,x+Math.cos(a)*ratio*145,y+Math.sin(a)*ratio*110,7,7,'#ffc95f');}label(ctx,'嘭！',x,y-22-ratio*20,36,'#9d4f34','center',true,'#fff1b0');}
        }
        else if(e.type==='plant'){
          // Planting reads at the feet: a brief soil puff, or a water ripple,
          // rather than a cloud in front of the character's face.
          const feet=GRID.y+(e.row+(.9)+rowAnchorDelta())*GRID.h-4,tile=game.getTerrain(e.row,Math.floor(e.x));
          if(tile.kind==='water'){
            ctx.strokeStyle='#d4f3e6';ctx.lineWidth=2.5*(1-ratio)+.5;ctx.beginPath();ctx.ellipse(x,feet,22+ratio*30,7+ratio*9,0,0,Math.PI*2);ctx.stroke();
          }else for(let i=0;i<7;i++){
            const side=(i-3)/3,hop=Math.sin(Math.PI*ratio)*(11+(i%3)*4);
            oval(ctx,x+side*(13+ratio*32),feet+(i%2)*4-hop,3.5*(1-ratio)+.8,2.5*(1-ratio)+.6,i%2?'#b99b6b':'#d7c49a');
          }
        }
        else if(e.type==='defeat'||e.type==='shovel'){for(let i=0;i<7;i++){const a=i*Math.PI*2/7;oval(ctx,x+Math.cos(a)*ratio*45,y+Math.sin(a)*ratio*35,5*(1-ratio)+1,5*(1-ratio)+1,e.type==='shovel'?'#b89f6b':'#fff4d1');}}
        else if(e.type==='upgrade'){
          ctx.strokeStyle='#f8de7e';ctx.lineWidth=3*(1-ratio)+1;ctx.beginPath();ctx.ellipse(x,y+36,25+ratio*33,9+ratio*10,0,0,Math.PI*2);ctx.stroke();
          for(let i=0;i<5;i++){const a=i*Math.PI*2/5;oval(ctx,x+Math.cos(a)*(25+ratio*24),y+18+Math.sin(a)*17-ratio*70,2.5,4,'#fff2af');}
        }
        else if(e.type==='lightning'&&combatEffects.drawLightning)combatEffects.drawLightning(ctx,e,GRID);
        else if(e.type==='perkPulse'&&combatEffects.drawPerkPulse)combatEffects.drawPerkPulse(ctx,e,GRID);
        else if(e.type==='fire'&&combatEffects.drawFire)combatEffects.drawFire(ctx,e,GRID);
        else if(e.type==='slash'&&combatEffects.drawSlash)combatEffects.drawSlash(ctx,e,GRID);
        else if(e.type==='heal'&&combatEffects.drawHeal)combatEffects.drawHeal(ctx,e,GRID);
        else if(e.type==='hit'&&!combatEffects.drawHit(ctx,e,GRID))oval(ctx,x,y,8+ratio*10,8+ratio*10,'#fff8ce');ctx.restore();
      });
      if(motion&&motion.finishFrame)motion.finishFrame();
      drawChallengeObjects();
      drawShieldBars();
      game.suns.forEach(s=>sun(GRID.x+s.x*GRID.w,GRID.y+s.y*GRID.h,20*s.scale,s.age>s.duration-3?.6+.4*Math.sin(state.age*6):1));
    }
    function actorAccentShape(kind,size){
      const s=size/126,bounds=kind==='power'?{x:20*s,y:-60*s,w:32*s,h:32*s}:kind==='slow'?{x:-27,y:-20,w:54,h:16}:kind==='rage'?{x:5,y:-115,w:50,h:50}:{x:-60,y:-95,w:50,h:48};
      const paint=(c,px,py)=>{
        if(kind==='power')lilyRenderer.drawBuff(c,'powerlily',px,py,size,{time:0,bonus:1,active:true});
        else if(kind==='slow')oval(c,px,py-12,25,6,'rgba(124,211,255,.48)');
        else if(kind==='rage')label(c,'!',px+30,py-90,30,'#e75937','center',true,'#ffefb0');
        else label(c,'♪',px-35,py-71,23,'#f2cd79','center',true,'#493824');
      };
      return {bounds,paint};
    }
    function actorAccentSurface(kind,size,density,shape=actorAccentShape(kind,size)){
      const {bounds,paint}=shape,key=kind+':'+(kind==='power'?size:0)+':'+density;
      let surface=actorAccentCache.get(key);
      if(!surface){
        surface=platform.createCanvas();surface.width=Math.ceil(bounds.w*density);surface.height=Math.ceil(bounds.h*density);
        const c=surface.getContext('2d');smoothImages(c);c.setTransform(density,0,0,density,-bounds.x*density,-bounds.y*density);paint(c,0,0);
        if(motion&&motion.registerSceneImage)motion.registerSceneImage(surface);
        keepSurface(actorAccentCache,key,surface,32,256*1024);
      }
      return surface;
    }
    function drawActorAccent(kind,x,y,size) {
      const shape=actorAccentShape(kind,size),{bounds,paint}=shape;
      // Flattening several overlapping primitives is only exact at alpha 1.
      if(!platform.createCanvas||ctx.globalAlpha!==1){paint(ctx,x,y);return;}
      const density=scenePixelScale(),surface=actorAccentSurface(kind,size,density,shape);
      ctx.drawImage(surface,x+bounds.x,y+bounds.y,surface.width/density,surface.height/density);
    }
    function actorBarSurface(h,r,fill,density){
      const pad=2,middle=2,key=h+':'+r+':'+fill+':'+density;
      let surface=actorBarCache.get(key);
      if(!surface){
        surface=platform.createCanvas();surface.width=Math.ceil((r*2+middle+pad*2)*density);surface.height=Math.ceil((h+pad*2)*density);
        const c=surface.getContext('2d');smoothImages(c);c.setTransform(density,0,0,density,pad*density,pad*density);
        round(c,0,0,r*2+middle,h,r,fill);
        if(motion&&motion.registerSceneImage)motion.registerSceneImage(surface);
        keepSurface(actorBarCache,key,surface,32,256*1024);
      }
      return surface;
    }
    function drawActorBar(x,y,w,h,r,fill) {
      if(w<r*2||!platform.createCanvas){round(ctx,x,y,w,h,r,fill);return;}
      const density=scenePixelScale(),pad=2,middle=2,surface=actorBarSurface(h,r,fill,density);
      const cap=(pad+r)*density,sy=surface.height,dh=surface.height/density;
      ctx.drawImage(surface,0,0,cap,sy,x-pad,y-pad,pad+r,dh);
      if(w>r*2)ctx.drawImage(surface,cap,0,middle*density,sy,x+r,y-pad,w-r*2,dh);
      const start=(pad+r+middle)*density;
      ctx.drawImage(surface,start,0,surface.width-start,sy,x+w-r,y-pad,(surface.width-start)/density,dh);
    }
    function actorShadowSurface(scale,radius,density){
      const pad=2,w=radius*2*scale,h=16*scale,key=radius+':'+scale+':'+density;
      let surface=actorShadowCache.get(key);
      if(!surface&&platform.createCanvas){
        surface=platform.createCanvas();surface.width=Math.ceil((w+pad*2)*density);surface.height=Math.ceil((h+pad*2)*density);
        const c=surface.getContext('2d');smoothImages(c);c.setTransform(density,0,0,density,pad*density,pad*density);
        oval(c,w/2,h/2,radius*scale,8*scale,'rgba(35,70,30,.16)');
        if(motion&&motion.registerSceneImage)motion.registerSceneImage(surface);
        keepSurface(actorShadowCache,key,surface,16,512*1024);
      }
      return surface;
    }
    function drawActorShadow(x,y,scale,radius) {
      const density=scenePixelScale(),pad=2,surface=actorShadowSurface(scale,radius,density);
      if(surface)ctx.drawImage(surface,x-radius*scale-pad,y-14*scale-pad,surface.width/density,surface.height/density);
      else oval(ctx,x,y-6*scale,radius*scale,8*scale,'rgba(35,70,30,.16)');
    }
    function drawLevelBadge(type,x,y) {
      const growth=game.isEndless&&game.growth&&game.growth[type];if(!growth||growth.level<2)return;
      const scale=unitScale(),density=scenePixelScale(),key=growth.level+':'+scale+':'+density;
      let surface=levelBadgeCache.get(key);
      if(!surface&&platform.createCanvas){
        const pad=2,w=48*scale,h=20*scale;
        surface=platform.createCanvas();surface.width=Math.ceil((w+pad*2)*density);surface.height=Math.ceil((h+pad*2)*density);
        // This completed surface is immutable until eviction. Scene drawing
        // can sample its GPU texture directly instead of reading it into the
        // changing CPU overlay atlas for every occupying plant.
        const c=surface.getContext('2d');smoothImages(c);c.setTransform(density,0,0,density,pad*density,pad*density);
        round(c,0,0,w,h,5*scale,'#f3df91','#7b743d',1.5);
        const text='L'+growthNumber(growth.level),fontSize=13*scale;c.font='bold '+fontSize+'px '+FONT;
        const measured=c.measureText(text).width;
        label(c,text,w/2,h/2,measured>44*scale?fontSize*44*scale/measured:fontSize,'#4f552a','center',true);
        if(motion&&motion.registerSceneImage)motion.registerSceneImage(surface,0,{atlas:true});
        keepSurface(levelBadgeCache,key,surface,96,2*1024*1024);
      }
      if(surface)ctx.drawImage(surface,x-2,y-2,surface.width/density,surface.height/density);
      else {round(ctx,x,y,48*scale,20*scale,5*scale,'#f3df91','#7b743d',1.5);growthLabel('L'+growthNumber(growth.level),x+24*scale,y+10*scale,44*scale,13*scale,'#4f552a','center',true);}
    }
    function drawDrag() {
      const dragging=state.drag&&state.drag.active,preview=dragging?state.drag:state.held;
      if(!preview||(!dragging&&!preview.visible)||state.sunSweep||state.overlay||game.status!=='playing')return;
      if(overSpeedPanel(preview))return;
      const size=actorSize(preview.type),feet=preview.y+(dragging&&preview.touch?-Math.max(28,42/view.scale):size*.45);
      const lifted=dragging?1:.82+.18*(1-Math.pow(1-Math.min(1,preview.age/.14),3));
      ctx.save();ctx.globalAlpha=.92;actor(preview.type,preview.x,feet,size*lifted,null,true);ctx.restore();
      if(!preview.valid&&game.cellValid(preview.row,preview.col)&&!contains(localHUD.bank,preview)){
        const x=preview.x+size*.32,y=feet-size*.63;
        oval(ctx,x,y,16,16,'#b62e24');ctx.strokeStyle='#fff1d3';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.moveTo(x-8,y+8);ctx.lineTo(x+8,y-8);ctx.stroke();
      }
    }
    function drawShovelTarget() {
      const tool=state.shovel;
      if(!tool||!tool.visible||state.sunSweep||state.overlay||game.status!=='playing')return;
      updateShovelTarget(tool);
      if(!tool.valid)return;
      const x=GRID.x+(tool.col+.5)*GRID.w,y=GRID.y+(tool.row+(.85)+rowAnchorDelta())*GRID.h;
      oval(ctx,x,y,43,13,'rgba(255,215,115,.3)');
      ctx.save();ctx.strokeStyle='#ffe09b';ctx.lineWidth=3;ctx.setLineDash([7,5]);
      ctx.beginPath();ctx.ellipse(x,y,44,14,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    function drawShovel() {
      const tool=state.shovel,action=state.shovelAction;
      if(state.overlay||game.status!=='playing')return;
      if(action){
        const t=Math.min(1,action.age/action.duration),strike=Math.min(1,t/.35),lift=Math.max(0,(t-.35)/.65);
        ctx.save();ctx.translate(action.x,action.y-18*(1-strike)-27*lift);ctx.rotate(-.5+.64*strike-.2*lift);
        ctx.globalAlpha=1-lift*lift;image('shovel',-33,-106,132,132);ctx.restore();
      }
      if(!tool||!tool.visible||state.sunSweep||overSpeedPanel(tool))return;
      const lift=1-Math.pow(1-Math.min(1,tool.age/.16),3);
      ctx.save();ctx.translate(tool.x,tool.y-(tool.touch?42:0)-5*lift);ctx.rotate(-.12+.1*lift);
      const scale=1+.08*lift;ctx.scale(scale,scale);image('shovel',-32,-100,124,124);ctx.restore();
    }
    function addButton(id,x,y,w,h,fn){buttons.push({id,x:x+panelOffset,y,w,h,fn});}
    // Draw materials at their own dimensions: the original button bitmap is too
    // small to stretch into a full panel. Cache large surfaces, not every card.
    function material(kind,x,y,w,h,active) {
      const density=Math.min(scenePixelScale(),RENDER_QUALITY[state.renderQuality].materialRatio),key=kind+':'+w+':'+h+':'+!!active+':'+density;
      let surface=h>100&&materialCache.get(key);
      if(!surface){
        if(h>100){surface=platform.createCanvas();surface.width=Math.ceil(w*density);surface.height=Math.ceil(h*density);}
        const c=surface?surface.getContext('2d'):ctx;if(surface)smoothImages(c);
        c.save();if(surface)c.setTransform(surface.width/w,0,0,surface.height/h,0,0);else c.translate(x,y);
        if(kind==='wood'){
          round(c,1,3,w-2,h-4,7,'#301d12','#22170f',2);
          const paint=c.createLinearGradient(0,0,0,h);paint.addColorStop(0,'#966038');paint.addColorStop(.07,'#82502d');paint.addColorStop(.48,'#6f4025');paint.addColorStop(1,'#51301f');
          round(c,5,5,w-10,h-12,4,paint,'#b37a43',2);
          c.save();round(c,9,9,w-18,h-21,3);c.clip();
          const boards=Math.max(1,Math.round(h/116)),bh=(h-18)/boards;
          for(let j=0;j<boards;j++){
            const by=9+j*bh;
            if(j){rect(c,8,by,w-16,2,'rgba(28,15,7,.5)');rect(c,8,by+2,w-16,1,'rgba(239,176,92,.15)');}
            for(let i=0;i<9;i++){
              const yy=by+9+i*(bh-14)/9,xx=12+((j*97+i*73)%Math.max(1,w-100)),len=Math.min(w-xx-10,55+(i*43+j*23)%180);
              c.beginPath();c.moveTo(xx,yy);c.bezierCurveTo(xx+len*.26,yy-3,xx+len*.61,yy+4,xx+len,yy-1);c.strokeStyle=i%2?'rgba(239,177,98,.065)':'rgba(37,16,7,.13)';c.lineWidth=i%3?1:2;c.stroke();
            }
          }
          c.restore();rect(c,10,9,w-20,2,'#c39155');rect(c,9,h-13,w-18,3,'#3b2315');
          if(w>180&&h>95)for(const xx of [16,w-16])for(const yy of [18,h-23]){oval(c,xx,yy,4.2,4.2,'#33291e');oval(c,xx-.7,yy-1,2.5,2.5,'#8f8066');rect(c,xx-2,yy-.5,4,1,'#453c2d');}
        }else if(kind==='stone'){
          const edge=Math.min(10,h*.13);
          c.beginPath();c.moveTo(edge,1);c.lineTo(w-6,3);c.lineTo(w-2,h-edge);c.lineTo(w-edge,h-3);c.lineTo(3,h-1);c.lineTo(1,edge);c.closePath();
          const paint=c.createLinearGradient(0,0,0,h);paint.addColorStop(0,active?'#777e82':'#72778c');paint.addColorStop(.45,active?'#596766':'#5a5f74');paint.addColorStop(1,active?'#495757':'#474c61');
          c.fillStyle=paint;c.fill();c.strokeStyle='#272936';c.lineWidth=3;c.stroke();
          c.beginPath();c.moveTo(6,h-7);c.lineTo(6,edge+3);c.lineTo(edge+4,6);c.lineTo(w-9,8);c.strokeStyle='#a1a3b0';c.lineWidth=2;c.stroke();
          c.beginPath();c.moveTo(w-6,12);c.lineTo(w-7,h-edge);c.lineTo(w-edge-3,h-8);c.lineTo(12,h-6);c.strokeStyle='#343747';c.lineWidth=4;c.stroke();
          c.beginPath();c.moveTo(w-23,6);c.lineTo(w-28,14);c.lineTo(w-25,20);c.moveTo(18,h-5);c.lineTo(22,h-13);c.lineTo(18,h-18);c.strokeStyle='rgba(32,35,47,.55)';c.lineWidth=1.5;c.stroke();
          if(active)round(c,4,4,w-8,h-8,4,null,'#c4c77c',2);
        }else{
          round(c,1,3,w-2,h-4,3,'#62431f');
          const paint=c.createLinearGradient(0,0,0,h);paint.addColorStop(0,active?'#f4df9b':'#f0e1bb');paint.addColorStop(.6,active?'#e9cd86':'#e6d3a6');paint.addColorStop(1,active?'#ddbc71':'#d9be8f');
          round(c,2,1,w-4,h-5,3,paint,active?'#ccab55':'#b89a65',active?3:1.5);
          rect(c,6,5,w-12,2,'rgba(255,248,217,.72)');rect(c,6,h-9,w-12,1,'rgba(119,79,38,.21)');
          for(let i=0;i<Math.min(50,w*h/2500);i++){const px=8+(i*83.71)%(w-16),py=10+(i*47.33)%(h-20);rect(c,px,py,1.2,1.2,'rgba(126,82,30,.08)');}
        }
        c.restore();
        if(surface)keepSurface(materialCache,key,surface,12,RENDER_QUALITY[state.renderQuality].pixels);
      }
      if(surface)ctx.drawImage(surface,x,y,w,h);
    }
    function stoneSurface(x,y,w,h,active=false){material('stone',x,y,w,h,active);}
    function woodSurface(x,y,w,h){material('wood',x,y,w,h,false);}
    function paperSurface(x,y,w,h,selected=false){material('paper',x,y,w,h,selected);}
    function checkMark(x,y,size,color){
      ctx.save();ctx.strokeStyle=color||'#fff1b4';ctx.lineWidth=Math.max(2,size*.18);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(x-size*.38,y);ctx.lineTo(x-size*.1,y+size*.3);ctx.lineTo(x+size*.43,y-size*.35);ctx.stroke();ctx.restore();
    }
    function menuArrow(x,y,up,color) {
      const direction=up?-1:1;
      ctx.beginPath();ctx.moveTo(x-5,y-direction*3);ctx.lineTo(x+5,y-direction*3);ctx.lineTo(x,y+direction*3);ctx.closePath();ctx.fillStyle=color;ctx.fill();
    }
    function stoneButton(id,text,x,y,w,h,fn,primary) {
      const pressed=state.buttonPulse&&state.buttonPulse.id===id&&state.buttonPulse.age<.16;
      if(pressed){ctx.save();ctx.translate(0,3);}
      stoneSurface(x,y,w,h,primary||state.menuHover===id);
      const fontSize=Math.min(primary?29:23,h*.54,(w-16)/Math.max(1,String(text).length));
      const highlighted=primary||state.menuHover===id;
      label(ctx,text,x+w/2,y+h/2,fontSize,highlighted?'#c1ed57':'#eee4bd','center',true,highlighted?'#243014':'#33352e');addButton(id,x,y,w,h,fn);if(pressed)ctx.restore();
    }
    function drawChallengePreview(mode,x,y,w,h){
      ctx.save();ctx.translate(x,y);ctx.scale(w/332,h/160);
      round(ctx,0,0,332,160,5);ctx.clip();
      if(mode==='conveyor'){
        woodSurface(-8,-8,348,176);
        round(ctx,-17,27,366,128,35,'#85835d','#393e30',4);
        round(ctx,-13,40,358,102,29,'#343f38','#b3ac76',3);
        for(let i=-1;i<15;i++){
          const sx=i*27+10;
          ctx.beginPath();ctx.moveTo(sx,44);ctx.lineTo(sx-13,138);ctx.strokeStyle='#566355';ctx.lineWidth=9;ctx.stroke();
          ctx.beginPath();ctx.moveTo(sx+5,44);ctx.lineTo(sx-8,138);ctx.strokeStyle='#202f2a';ctx.lineWidth=2;ctx.stroke();
        }
        [15,317].forEach(cx=>{oval(ctx,cx,91,15,39,'#777958');oval(ctx,cx,91,6,28,'#b4ae76');});
        [['pea',70,-.06],['sunflower',166,.055],['snowpea',260,-.035]].forEach(([type,cx,tilt])=>{
          ctx.save();ctx.translate(cx,88);ctx.rotate(tilt);
          round(ctx,-32,-40,69,96,2,'rgba(17,24,17,.38)');
          if(!image('packet',-34,-46,68,95))round(ctx,-34,-46,68,95,2,'#e7d6a0','#685838',2);
          actor(type,0,24,57,null,true);ctx.restore();
        });
        rect(ctx,0,28,332,9,'#c1b27a');rect(ctx,0,36,332,3,'#4e5941');
        rect(ctx,0,141,332,10,'#a49b62');rect(ctx,0,141,332,2,'#ded09a');
        for(let i=0;i<9;i++){oval(ctx,10+i*39,32,2,2,'#5b633e');oval(ctx,10+i*39,146,2,2,'#4e593b');}
      }else{
        rect(ctx,0,0,332,160,'#80a950');
        if(imageReady.background){const grass=images.background;ctx.drawImage(grass,grass.width*.19,grass.height*.18,grass.width*.51,grass.height*.73,0,0,332,160);}
        if(mode==='vase'){
          rect(ctx,0,0,332,160,'rgba(43,64,29,.18)');
          // The pots sit on an actual plank surface; the middle partner peeks
          // above its open rim, making the hidden-content mechanic visible.
          woodSurface(-8,87,348,88);rect(ctx,0,141,332,19,'#6b3c21');rect(ctx,0,139,332,3,'#d29c58');
          const pot=(cx,cy,size,green,peek)=>{
            ctx.save();ctx.translate(cx,cy);ctx.scale(size,size);
            oval(ctx,0,3,37,9,'rgba(36,27,17,.28)');
            if(peek)actor(peek,0,-41,75,null,true);
            ctx.beginPath();ctx.moveTo(-18,-66);ctx.lineTo(18,-66);ctx.lineTo(16,-54);ctx.bezierCurveTo(45,-39,40,-6,23,0);ctx.quadraticCurveTo(0,6,-23,0);ctx.bezierCurveTo(-40,-6,-45,-39,-16,-54);ctx.closePath();ctx.fillStyle=green?'#a9bb76':'#c99c68';ctx.fill();ctx.strokeStyle='#5e4930';ctx.lineWidth=3;ctx.stroke();
            oval(ctx,-17,-31,6,19,green?'#c6d895':'#e5bd87');
            ctx.beginPath();ctx.moveTo(-29,-15);ctx.quadraticCurveTo(0,-6,29,-15);ctx.strokeStyle=green?'#6d8353':'#956637';ctx.lineWidth=3;ctx.stroke();
            oval(ctx,0,-66,23,7,'#edd39c');oval(ctx,0,-66,17,3,'#514331');
            ctx.beginPath();ctx.moveTo(-21,-65);ctx.quadraticCurveTo(0,-57,21,-65);ctx.strokeStyle=green?'#d5dfa0':'#eac18b';ctx.lineWidth=5;ctx.stroke();
            ctx.restore();
          };
          pot(72,133,.9,false);pot(174,141,1.12,true,'pea');pot(274,131,.78,false);
          menuPolygon([[291,151],[302,142],[308,153]],'#d8ae7b','#6e4d32',1.5);
          menuPolygon([[42,151],[47,145],[57,153]],'#caa06c','#6e4d32',1.5);
        }else{
          // Low motion streaks and dust show a rolling lane, with a small
          // approaching visitor kept behind the oversized foreground nut.
          actor('momonga',302,106,66,null,true);
          oval(ctx,206,144,55,9,'rgba(28,48,19,.26)');
          [[112,121,13,6],[91,130,9,4],[126,139,11,4]].forEach(p=>oval(ctx,p[0],p[1],p[2],p[3],'rgba(235,214,150,.65)'));
          ctx.lineCap='round';ctx.strokeStyle='#e6e3ab';ctx.lineWidth=3;
          [[45,67,122,65],[61,88,130,85],[32,108,112,103]].forEach(line=>{ctx.beginPath();ctx.moveTo(line[0],line[1]);ctx.lineTo(line[2],line[3]);ctx.stroke();});
          ctx.save();ctx.translate(211,89);ctx.rotate(-.24);actor('wallnut',0,60,127,null,true);ctx.restore();
          ctx.beginPath();ctx.moveTo(257,117);ctx.quadraticCurveTo(276,101,277,81);ctx.strokeStyle='#dce6a3';ctx.lineWidth=3;ctx.stroke();
        }
      }
      ctx.restore();round(ctx,x,y,w,h,5,null,'#80603b',2);
    }
    function drawChallenges(){
      screenFrame('花园小游戏','三种玩法 · 九项关卡 · 三项无尽挑战',home);
      challengeModule.MODES.forEach((mode,i)=>{
        const x=76+i*384,w=360;
        paperSurface(x,200,w,660);
        drawChallengePreview(mode.id,x+14,216,w-28,144);
        label(ctx,mode.name,x+w/2,393,32,'#493018','center',true);
        textLines(mode.summary,x+24,432,w-48,27,21,'#75552f');
        mode.stages.forEach((name,index)=>{
          const id=mode.id+'-'+(index+1),done=!!state.challengeClears[id];
          stoneButton('challenge-'+id,(index+1)+' · '+name,x+24,508+index*70,w-48,56,()=>startChallenge(id));
          if(done)checkMark(x+42,536+index*70,11,'#c1ed57');
        });
        stoneButton('challenge-'+mode.id+'-endless','无尽挑战',x+24,733,w-48,65,()=>startChallenge(mode.id+'-endless'),true);
        label(ctx,'完成 '+mode.stages.filter((_,j)=>state.challengeClears[mode.id+'-'+(j+1)]).length+'/3 · 无尽纪录 '+state.challengeBest[mode.id].waves+' 波',x+w/2,831,18,'#75552f');
      });
    }
    function drawChallengeHUD(){
      const challenge=challenges.state,item=challenges.picked();
      round(ctx,12,0,view.logicalWidth-24,127,8,'#6c5335','#392d22',4);
      label(ctx,challenge.modeName,115,30,27,'#fff1bd','center',true);
      label(ctx,challenge.endless?'无尽 · 第 '+challenge.wave+' 波':'第 '+challenge.stage+' 关',115,64,21,'#ead8a1');
      const resting=challenge.endless&&challenge.nextWaveIn!==null;
      growthLabel(resting?'休整 '+Math.ceil(challenge.nextWaveIn)+' 秒':challenge.mode==='vase'?'陶罐 '+challenge.vases.length+' 个':'已到访 '+challenge.spawned+'/'+challenge.total,115,99,190,19,'#e7e2b2');
      if(challenge.mode==='conveyor'){
        round(ctx,211,7,834,114,6,'#495b4b','#a1ad7c',2);
        const travel=challenge.cards.length<8?state.age*28%26:0;
        for(let i=0;i<31;i++){const x=222+i*26+travel;rect(ctx,x,9,12,4,'#b9b87d');rect(ctx,x,115,12,4,'#b9b87d');}
      }
      challenge.cards.forEach((entry,i)=>{
        const x=220+i*103,y=12,w=92,h=103,selected=entry.id===challenge.selected;
        round(ctx,x,y,w,h,7,selected?'#ffed9b':'#f4e7bd',selected?'#ffe34b':'#a19162',selected?4:2);
        actor(entry.type,x+w/2,y+75,68,null,true);
        const text=challenge.mode==='bowling'?(entry.type==='cherry'?'爆破坚果':'弹跳坚果'):shortName(entry.type);
        growthLabel(text,x+w/2,y+88,w-8,18,'#4b5331','center',true);
        addButton('challenge-card-'+entry.id,x,y,w,h,()=>{challenges.select(entry.id);sound('select');return true;});
      });
      if(challenge.cards.length<8&&challenge.mode!=='vase'){
        const x=220+challenge.cards.length*103;
        round(ctx,x,12,92,103,7,'rgba(20,25,10,.18)','#968964',1);
        label(ctx,'配送中',x+46,52,18,'#ded2a1');label(ctx,Math.ceil(Math.max(0,challenge.nextSupply-game.time))+'秒',x+46,82,20,'#e7d59a');
      }
      stoneButton('menu','菜单',view.logicalWidth-182,10,162,50,pause);
      speedSelector('speed',localHUD.speed.x,localHUD.speed.y,localHUD.speed.w,localHUD.speed.h,true);
      const hint=resting?(challenge.mode==='vase'?'休整后重新布罐 · 手牌与阵地重置':challenge.mode==='bowling'?'休整中继续补充坚果 · 下一波开始后发射':'休整中可以继续种植 · 阵地与手牌保留'):item?(challenge.mode==='bowling'?'点任意一行发射 · 再点卡牌取消':'点击空格种下 '+shortName(item.type)+' · 再点卡牌取消'):challenge.mode==='vase'?'点击陶罐揭晓内容 · 绿色陶罐藏着伙伴':challenge.mode==='bowling'?'选择坚果 → 点击一行发射 · 碰撞换行，红色爆破':'选择传送来的伙伴 → 点击草坪种下 · 卡满时暂停配送';
      round(ctx,22,913,view.logicalWidth-44,40,6,'rgba(33,52,26,.92)');
      growthLabel(hint,42,933,view.logicalWidth-440,20,'#fff0bf','left',true);
      growthLabel(challenge.endless?'已守 '+challenge.wavesCleared+' 波 · 讨伐 '+game.kills+' 位':'讨伐 '+game.kills+' / '+challenge.total,view.logicalWidth-48,933,340,20,'#e4d6a4','right',true);
    }
    function drawChallengeObjects(){
      const challenge=challenges.state;if(!challenge)return;
      for(const vase of challenge.vases){
        const x=GRID.x+(vase.col+.5)*GRID.w,y=GRID.y+(vase.row+(.88)+rowAnchorDelta())*GRID.h;
        oval(ctx,x,y+1,39,10,'rgba(27,40,21,.2)');
        ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(-22,-101);ctx.lineTo(22,-101);ctx.lineTo(19,-79);ctx.bezierCurveTo(59,-60,49,-13,29,-4);ctx.quadraticCurveTo(0,7,-29,-4);ctx.bezierCurveTo(-49,-13,-59,-60,-19,-79);ctx.closePath();ctx.fillStyle=vase.green?'#a1bd77':'#d7a875';ctx.fill();ctx.strokeStyle='#5e4834';ctx.lineWidth=4;ctx.stroke();
        round(ctx,-28,-108,56,15,5,vase.green?'#c2d899':'#edc28e','#5e4834',3);
        oval(ctx,-21,-48,7,23,'rgba(255,250,209,.26)');
        if(vase.green){actor(vase.content.type,0,-20,53,null,true);}
        else{label(ctx,'?',0,-48,37,'#8d603c','center',true);}
        ctx.restore();
      }
      for(const ball of challenge.balls){
        const blend=ball.fromRow===undefined?1:Math.min(1,(ball.age-ball.bounceAt)/.18),row=ball.fromRow===undefined?ball.row:ball.fromRow+(ball.row-ball.fromRow)*blend;
        const x=GRID.x+ball.x*GRID.w,y=GRID.y+(row+(.77)+rowAnchorDelta())*GRID.h;
        oval(ctx,x,y+28,36,10,'rgba(28,49,22,.23)');
        ctx.save();ctx.translate(x,y);ctx.rotate(ball.age*8);
        actor('wallnut',0,47,100,null,true);
        if(ball.type==='cherry'){ctx.strokeStyle='#eb705a';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,48,0,Math.PI*2);ctx.stroke();}
        ctx.restore();
      }
    }
    function drawChallengePanel(){
      const challenge=challenges.state,paused=state.overlay==='pause',restarting=state.overlay==='restart',won=game.status==='won';
      stoneSurface(300,157,680,646);
      label(ctx,paused?'休息一下':restarting?'重新挑战？':challenge.endless?'本次守住 '+challenge.wavesCleared+' 波':won?'挑战成功！':'再试一次吧',640,225,42,UI.gold,'center',true);
      label(ctx,challenge.endless?challenge.modeName+' · 无尽挑战':challenge.modeName+' · '+challenge.name,640,282,29,'#fff0c4','center',true);
      const endlessInstructions={vase:'点罐子找伙伴，选卡再点空格种植。\n每波休整5秒，重新布罐和发牌，植物清空。\n没有割草车，别让来客越过左侧。',bowling:'选坚果，再点路线发球。\n每波休整5秒，保留手牌并补卡，随后可发球。\n没有割草车，别让来客越过左侧。',conveyor:'选伙伴卡，再点空格种植，无需阳光。\n每波休整5秒，保留阵地和手牌，可继续布阵。\n没有割草车，别让来客越过左侧。'};
      textLines(paused?(challenge.endless?endlessInstructions[challenge.mode]:challenge.instructions):restarting?(challenge.endless?'从第 1 波重新开始，本局最高纪录会保留。':'这一关会重新开始，已完成的关卡记录会保留。'):challenge.endless?'累计讨伐 '+game.kills+' 位 · 用时 '+Math.floor(game.time)+' 秒\n最高纪录：守住 '+state.challengeBest[challenge.mode].waves+' 波':'讨伐 '+game.kills+' / '+challenge.total+' 位 · 用时 '+Math.floor(game.time)+' 秒',354,335,572,32,24,'#eadfbe');
      if(paused)stoneButton('resume','继续挑战',358,444,564,69,resume,true);
      else if(!restarting&&won&&!challenge.endless&&challenge.stage<3)stoneButton('challenge-next','下一关',358,444,564,69,()=>startChallenge(challenge.mode+'-'+(challenge.stage+1)),true);
      else stoneButton('challenge-again',restarting?'确认重新挑战':'再玩一次',358,444,564,69,()=>startChallenge(challenge.id),true);
      stoneButton('challenge-retry',restarting?'返回本局':'重新挑战',358,531,270,60,()=>{if(restarting){state.overlay=game.status==='paused'?'pause':'end';}else{state.overlay='restart';}render();});
      stoneButton('challenge-list','选择小游戏',652,531,270,60,openChallenges);
      stoneButton('home','返回花园',358,609,270,60,home);
      stoneButton('sound','游戏设置',652,609,270,60,openAudioSettings);
      if(!restarting)stoneButton('pause-achievements','成就收藏',358,686,564,44,openAchievements);
      label(ctx,challenge.endless?'单独记录最高波数 · 离开后下次从第 1 波开始':'小游戏进度单独记录 · 不占用讨伐存档',640,747,21,'#eadfbe');
    }
        function drawMobileHUD(){
      const lw=view.logicalWidth,h=localHUD,challenge=challenges.state;
      woodSurface(0,0,lw,170);round(ctx,12,15,122,139,9,'#ead3a0','#49301d',3);
      if(challenge){growthLabel(challenge.modeName,73,54,112,27,UI.ink,'center',true);label(ctx,'第 '+(challenge.wave||challenge.stage)+' 波',73,116,24,UI.ink);}
      else {sun(73,60,30);growthLabel(growthNumber(game.sun),73,124,112,32,UI.ink,'center',true);}
      const cards=challenge?challenge.cards:state.deck.map(type=>({type,id:type}));
      cards.forEach((entry,i)=>{
        const type=entry.type,spec=engine.PLANTS[type],x=h.cardX+i*h.cardStep,y=h.cardY,w=h.cardW,selected=challenge?challenge.selected===entry.id:state.selected===type;
        if(!image('packet',x,y,w,h.cardH))round(ctx,x,y,w,h.cardH,4,UI.paper,UI.woodEdge,3);
        actor(type,x+w/2,y+105,91,null,true);
        growthLabel(challenge?shortName(type):spec.cost,x+w/2,y+128,w-8,28,UI.ink,'center',true);
        if(!challenge){
          const cd=game.cooldowns[type]||0,previous=state.cardCooldowns&&state.cardCooldowns[type];
          if(!state.cardCooldowns)state.cardCooldowns={};state.cardCooldowns[type]=cd;
          if(previous>0&&cd<=0){if(!state.cardReady)state.cardReady={};state.cardReady[type]=state.age;}
          if(game.sun<spec.cost)rect(ctx,x,y,w,h.cardH,'rgba(25,25,15,.4)');
          if(cd>0){rect(ctx,x,y+h.cardH*(1-cd/spec.cooldown),w,h.cardH*cd/spec.cooldown,'rgba(16,25,20,.64)');label(ctx,Math.ceil(cd)+'秒',x+w/2,y+67,27,'#fff2cf','center',true,'#243014');}
          const age=state.age-(state.cardReady&&state.cardReady[type]||-100);
          if(age<.65){ctx.save();ctx.globalAlpha=(1-age/.65)*.65;ctx.strokeStyle='#ffed94';ctx.lineWidth=6;ctx.strokeRect(x-2,y-2,w+4,h.cardH+4);ctx.restore();}
        }
        if(selected){ctx.strokeStyle='#f0ef63';ctx.lineWidth=5;ctx.strokeRect(x-2,y-2,w+4,h.cardH+4);}
        addButton(challenge?'challenge-card-'+entry.id:'plant-'+type,x,y,w,h.cardH,()=>challenge?challenges.select(entry.id):select(type));
      });
      stoneButton('menu','菜单',lw-174,14,160,140,pause);
      round(ctx,0,832,lw,128,0,'rgba(39,35,26,.92)');
      const wave=wavePresentation(),rest=challenge?challenge.nextWaveIn:game.nextWaveIn;
      const message=challenge?(challenge.mode==='vase'?'点陶罐揭晓伙伴':'选卡 → 点击草坪'):(rest!==null&&rest!==undefined?'休整 '+Math.ceil(rest)+' 秒':'第 '+wave.wave+' 波 · 剩余 '+wave.remaining+' 位');
      growthLabel(message,26,876,lw-680,29,'#ffedb5','left',true);
      growthLabel(game.isEndless?'已守 '+game.wavesCleared+' 波 · 待入场 '+Math.max(0,game.waveTotal-game.waveSpawned)+' 位':'长按卡片查看说明',26,925,lw-680,23,'#d4c9a2','left');
      if(!challenge)stoneButton('shovel',state.selected==='shovel'?'收回铲子':'铲子',lw-608,838,184,116,()=>select(state.selected==='shovel'?null:'shovel'),state.selected==='shovel');
      speedSelector('speed',h.speed.x,h.speed.y,h.speed.w,h.speed.h,true);
      stoneButton('mobile-tools',state.mobileTools?'收起':'更多',lw-202,838,184,116,()=>{state.mobileTools=!state.mobileTools;state.speedOpen=false;render();});
      if(state.mobileTools){
        const x=lw-502,y=414;stoneSurface(x,y,478,436);
        if(game.isEndless){
          stoneButton('upgrades','植物升级',x+18,y+18,442,94,()=>{state.mobileTools=false;openUpgrades();});
          autoSunButton('auto-sun',x+18,y+124,442,86);
          stoneButton('mobile-growth','加难：'+engine.ENDLESS_GROWTH_RATES[game.endlessGrowthRate].label,x+18,y+222,442,86,()=>{const ids=Object.keys(engine.ENDLESS_GROWTH_RATES),i=ids.indexOf(game.endlessGrowthRate);setEndlessGrowthRate(ids[(i+1)%ids.length]);});
          stoneButton('mobile-save','保存进度',x+18,y+320,442,94,()=>{saveEndlessRun();state.mobileTools=false;});
        }else {
          stoneButton('mobile-help','伙伴图鉴',x+18,y+22,442,110,()=>{state.mobileTools=false;openAlmanac();});
          stoneButton('mobile-settings','声音与画质',x+18,y+160,442,110,()=>{state.mobileTools=false;openAudioSettings();});
          stoneButton('mobile-close','返回战斗',x+18,y+300,442,110,()=>{state.mobileTools=false;});
        }
      }
    }
    function drawPlantTooltip(){
      const type=state.plantTooltip;if(!type||state.overlay)return;
      const spec=engine.PLANTS[type];if(!spec)return;
      const w=mobileLayout?740:570,x=(view.logicalWidth-w)/2,y=190;
      material('paper',x,y,w,310);actor(type,x+90,y+208,126,null,true);
      growthLabel(spec.name,x+186,y+50,w-215,32,UI.ink,'left',true);
      growthLabel('阳光 '+spec.cost+' · 冷却 '+spec.cooldown+' 秒',x+186,y+108,w-215,25,UI.muted,'left');
      textLines(spec.description||spec.role||'轻点或拖动卡片种植',x+186,y+159,w-215,31,23,UI.ink);
      label(ctx,'松开后继续种植',x+w/2,y+281,23,UI.muted);
    }

    function drawHUD() {
      if(mobileLayout){drawMobileHUD();return;}
      if(challenges.state){drawChallengeHUD();return;}
      const bank=localHUD.bank;
      if(imageReady.bank){
        // Extend only the plain wood, keeping the sun counter and end caps intact.
        const texture=images.bank,source=IMAGE_SOURCE_RECTS.bank,scale=bank.h/87,left=80,right=14;
        const sourceLeft=source.w*left/446,sourceRight=source.w*right/446;
        imageSource('bank',bank.x,bank.y,left*scale,bank.h,{x:source.x,y:source.y,w:sourceLeft,h:source.h});
        imageSource('bank',bank.x+left*scale,bank.y,bank.w-(left+right)*scale,bank.h,{x:source.x+sourceLeft,y:source.y,w:source.w-sourceLeft-sourceRight,h:source.h});
        imageSource('bank',bank.x+bank.w-right*scale,bank.y,right*scale,bank.h,{x:source.x+source.w-sourceRight,y:source.y,w:sourceRight,h:source.h});
      }else round(ctx,bank.x,bank.y,bank.w,bank.h,8,'#774723','#422813',5);
      growthLabel(growthNumber(game.sun),76,116,105,33,'#101706','center',true);
      state.deck.forEach((type,i)=>{
        const feedback=state.cardFeedback&&state.cardFeedback.type===type?state.cardFeedback:null;
        const age=feedback ? .95-feedback.time : 1;
        const baseX=localHUD.cardX+i*localHUD.cardStep,x=baseX+(age<.24?Math.sin(age*65)*3*(1-age/.24):0),y=localHUD.cardY,w=localHUD.cardW,h=localHUD.cardH;
        if(!image('packet',x,y,w,h))round(ctx,x,y,w,h,2,'#ded6a1','#454727',2);
        actor(type,x+w/2,y+86,77,null,true);label(ctx,engine.PLANTS[type].cost,x+33,y+101,24,'#101409','center',true);
        if(game.sun<engine.PLANTS[type].cost)rect(ctx,x,y,w,h,'rgba(13,27,13,.4)');
        const cooldown=game.cooldowns[type]||0;
        const previousCooldown=state.cardCooldowns&&state.cardCooldowns[type];
        if(!state.cardCooldowns)state.cardCooldowns={};state.cardCooldowns[type]=cooldown;
        if(previousCooldown>0&&cooldown<=0){if(!state.cardReady)state.cardReady={};state.cardReady[type]=state.age;}
        const readyAge=state.age-(state.cardReady&&state.cardReady[type]||-100);
        if(readyAge<.65){ctx.save();ctx.globalAlpha=(1-readyAge/.65)*.65;ctx.strokeStyle='#ffed94';ctx.lineWidth=5;ctx.strokeRect(x-2,y-2,w+4,h+4);ctx.restore();}
        if(cooldown>0){const fraction=cooldown/engine.PLANTS[type].cooldown;rect(ctx,x,y+h*(1-fraction),w,h*fraction,'rgba(11,25,14,.6)');label(ctx,Math.ceil(cooldown)+'秒',x+w/2,y+54,21,'#fff5c0','center',true,'#243d1d');}
        if((state.drag&&state.drag.active&&state.drag.type===type)||(state.held&&state.held.type===type&&game.status==='playing'&&!state.overlay))rect(ctx,x,y,w,h,'rgba(21,34,12,.28)');
        if(state.selected===type&&game.status==='playing'){ctx.strokeStyle='#f0ed42';ctx.lineWidth=3;ctx.strokeRect(x-1,y-1,w+2,h+2);}
        if(feedback&&game.status==='playing'&&!state.overlay){ctx.strokeStyle='rgba(245,133,95,'+Math.min(1,feedback.time*3)+')';ctx.lineWidth=3;ctx.strokeRect(x-1,y-1,w+2,h+2);}
        if(game.isEndless&&game.getPlantUpgrade){
          const growth=game.growth[type]||{level:1,xp:0};
          let details=cardGrowthCache.get(type);
          // The localHUD only needs the next XP threshold. Build the full upgrade
          // description on a level change, not once per card every display frame.
          if(!details||details.level!==growth.level){const info=game.getPlantUpgrade(type);details={level:info.level,xpNeeded:info.xpNeeded};cardGrowthCache.set(type,details);}
          round(ctx,x+3,y+3,53,21,3,'#f2de9a','#786e36',1);growthLabel('Lv.'+growthNumber(growth.level),x+29.5,y+13,49,14,'#4b502b','center',true);
          round(ctx,x,y+h+4,w,4,2,'#414c2d');const amount=Math.max(0,Math.min(1,growth.xp/details.xpNeeded));if(amount>0)round(ctx,x,y+h+4,w*amount,4,2,'#bdd276');
        }
        label(ctx,(i+1)%10,x+w-9,y+13,16,'#fff5c0','center',true,'#4b512e');
        addButton('plant-'+type,baseX,y,w,h,()=>select(type));
      });
      if(state.cardFeedback&&!state.overlay&&game.status==='playing'){
        const feedback=state.cardFeedback,index=state.deck.indexOf(feedback.type),x=localHUD.cardX+index*localHUD.cardStep+localHUD.cardW/2;
        round(ctx,x-80,localHUD.cardY+localHUD.cardH+9,160,30,5,'rgba(67,42,25,.94)','#d9ad77',1.5);
        label(ctx,feedback.reason,x,localHUD.cardY+localHUD.cardH+24,17,'#ffebc9','center',true);
      }
      image('shovelBank',localHUD.shovelX,0,113.6,113.6);
      if(!state.shovel&&!state.shovelAction)image('shovel',localHUD.shovelX-4,-3,124,124);
      if(state.selected==='shovel'&&game.status==='playing'){ctx.strokeStyle='#f0ed42';ctx.lineWidth=3;ctx.strokeRect(localHUD.shovelX+1,1,111,111);}
      addButton('shovel',localHUD.shovelX,0,114,114,()=>select(state.selected==='shovel'?null:'shovel'));
      const edgeOffset=view.logicalWidth-W;
      if(!image('menu',1091.2+edgeOffset,0,179.2,51.2))round(ctx,1091.2+edgeOffset,0,179.2,51.2,5,'#737286','#454459',3);
      label(ctx,'菜单',1180.8+edgeOffset,22,32,'#57b923','center',true,'#1d3111');addButton('menu',1080+edgeOffset,0,200,game.isEndless?54:68,pause);
      if(['playing','paused'].includes(game.status)){
        speedSelector('speed',localHUD.speed.x,localHUD.speed.y,localHUD.speed.w,localHUD.speed.h,true);
      }
      if(game.isEndless&&['playing','paused'].includes(game.status)){
        stoneButton('upgrades','植物升级',1090+edgeOffset,58,180,38,()=>openUpgrades(),false);
        autoSunButton('auto-sun',1090+edgeOffset,102,180,36);
      }
      const wave=wavePresentation();
      const px=944+edgeOffset,py=922,pw=265,ph=34,progress=wave.progress;
      if(wave.intense){
        ctx.save();ctx.globalAlpha=.24+.1*Math.sin(game.time*4);
        round(ctx,px-5,py-5,pw+10,ph+10,7,'#ef6e38','#ffc778',3);ctx.restore();
      }
      image('meterEmpty',px,py,pw,ph);
      if(imageReady.meterFull&&progress>0)ctx.drawImage(images.meterFull,0,0,158*progress,24,px,py,pw*progress,ph);
      image('meterHead',px+pw*progress-17,py-4,38,38);
      for(const marker of wave.markers){
        const fx=px+pw*marker.position,fy=py-(marker.reached?5:0);
        rect(ctx,fx,fy-9,3,20+(marker.reached?5:0),'#342418');
        ctx.beginPath();ctx.moveTo(fx,fy-9);ctx.lineTo(fx-20,fy-12);ctx.lineTo(fx-17,fy);ctx.lineTo(fx,fy+2);ctx.closePath();
        ctx.fillStyle=marker.reached?'#ea4930':marker.final?'#d99836':'#733a30';ctx.fill();
        if(marker.reached||marker.final){ctx.strokeStyle=marker.reached?'#ffe5a1':'#e6b76b';ctx.lineWidth=1.5;ctx.stroke();}
      }
      image('meterLabel',px+65,py+23,135,15);
      const shownLevel=levelInfo(game.status==='ready'?state.level:game.levelId),shownMap=game.status==='ready'?mapForLevel(shownLevel):game.getMap();
      label(ctx,shownLevel.name+' · '+shownMap.name+(game.isEndless?' · '+boardLabel(game.endlessBoardSize):''),px-15,py+15,20,'#ffe49b','right',true,'#171e10');
      const waveLabel=game.isEndless?(wave.phase==='rest'?'休整 '+Math.ceil(wave.nextWaveIn)+' 秒 · '+(strategyPlan(true)?.name||'准备讨伐'):'第 '+wave.wave+' 波 · '+(strategyPlan()?.name||'睡衣派对')):
        wave.phase==='final'?'最终波 · 讨伐':wave.wave?'第 '+wave.wave+' / '+wave.waveCount+' 波 · 睡衣派对':'布阵时间 · 睡衣派对';
      label(ctx,waveLabel,px+pw,py-27,18,wave.intense?'#ffcf83':'#fff0ba','right',true,'#172411');
      if(wave.spawningDone&&['playing','paused'].includes(game.status)&&wave.remaining>0)label(ctx,'清场中 · 剩 '+wave.remaining+' 位',px+pw,py-51,16,'#fff0ba','right',true,'#172411');
      else if(game.isEndless&&wave.phase!=='rest'&&['playing','paused'].includes(game.status))growthLabel('本波 '+game.waveTotal+' 位 · 待入场 '+Math.max(0,game.waveTotal-game.waveSpawned)+' 位',px+pw,py-51,410,16,'#fff0ba','right',true);
      if(game.isEndless)growthLabel('完成 '+game.wavesCleared+' 波 · 讨伐 '+game.kills+' 位',GRID.x,py+17,GROWTH_CONTROL.x-GRID.x-18,21,'#fff0ba','left',true);
      if(game.isEndless&&!state.overlay&&['playing','paused'].includes(game.status)){
        const b=GROWTH_CONTROL,rate=engine.ENDLESS_GROWTH_RATES[game.endlessGrowthRate];
        stoneSurface(b.x,b.y,b.w,b.h,state.endlessGrowthOpen);
        label(ctx,'加难：'+rate.label,b.x+b.w/2-7,b.y+b.h/2,23,UI.green,'center',true,'#243014');
        menuArrow(b.x+b.w-18,b.y+b.h/2,!state.endlessGrowthOpen,UI.green);
        addButton('endless-growth-toggle',b.x,b.y,b.w,b.h,toggleEndlessGrowth);
      }
    }
    function drawEndlessGrowthPanel(){
      if(!state.endlessGrowthOpen)return;
      const p=GROWTH_PANEL,preview=game.getEndlessGrowthPreview();
      round(ctx,p.x+4,p.y+6,p.w,p.h,10,'rgba(24,37,14,.4)');
      stoneSurface(p.x,p.y,p.w,p.h);
      label(ctx,'无尽难度增长',p.x+p.w/2,p.y+27,25,UI.gold,'center',true);
      label(ctx,game.endlessGrowthRate==='fast'?'极速额外强化血量与攻击 · 下波起生效':'怪物数量与血量 · 下波起生效',p.x+p.w/2,p.y+58,18,'#eadfbe');
      label(ctx,'×',p.x+p.w-22,p.y+23,26,'#eadfbe');
      addButton('endless-growth-close',p.x+p.w-40,p.y+7,33,33,()=>{state.endlessGrowthOpen=false;});
      ['slow','normal','fast'].forEach((rate,i)=>{
        const spec=engine.ENDLESS_GROWTH_RATES[rate],x=p.x+18+i*150,y=p.y+80,active=game.endlessGrowthRate===rate;
        stoneSurface(x,y,144,68,active);
        label(ctx,spec.label,x+72,y+23,24,active?UI.green:'#fff0c4','center',true,'#243014');
        label(ctx,(rate==='fast'?'基础 ':'加难 ')+spec.step+'×',x+72,y+50,18,'#eadfbe');
        addButton('endless-growth-'+rate,x,y,144,68,()=>setEndlessGrowthRate(rate));
      });
      if(preview){
        const hp=growthNumber(Number(preview.next.hpScale.toFixed(2))),damage=Number(preview.next.damageScale.toFixed(2));
        growthLabel('下波 '+preview.next.count+' 位来客 · 血量 '+hp+'×',p.x+p.w/2,p.y+177,p.w-28,21,UI.gold,'center',true);
        label(ctx,'出怪间隔 '+preview.next.gap+' 秒 · 攻击 '+damage+'×',p.x+p.w/2,p.y+204,17,'#eadfbe');
      }
    }
    function textLines(text,x,y,width,lineHeight,size,color) {
      ctx.font=size+'px '+FONT;let line='',yy=y;
      Array.from(text).forEach(char=>{if(char==='\n'||ctx.measureText(line+char).width>width){label(ctx,line,x,yy,size,color,'left',false);line=char==='\n'?'':char;yy+=lineHeight;}else line+=char;});
      if(line)label(ctx,line,x,yy,size,color,'left',false);return yy;
    }
    function themeInfo(level) {
      const theme=level&&level.theme||'day';
      if(theme==='night'||theme==='moon')return{sky:'#536488',grass:'#526d51',hill:'#748276',label:'月色花园',accent:'#d6d4ed'};
      if(theme==='sunset'||theme==='dusk')return{sky:'#f2c6a0',grass:'#8b9e51',hill:'#bdad67',label:'落日草坪',accent:'#f2c395'};
      if(theme==='fog')return{sky:'#bacfd0',grass:'#789383',hill:'#9bb1a0',label:'薄雾花园',accent:'#c7dfe2'};
      return{sky:'#b8d9ca',grass:'#6c9c50',hill:'#a0bd70',label:'晴日花园',accent:'#d4e4a4'};
    }
    function landscape(x,y,w,h,level) {
      const map=mapForLevel(level),sceneImage=level.id==='map-preview'||level.id==='endless'?sceneArt(map.id,w>=200):null;
      const density=scenePixelScale(),key=map.id+':'+map.sceneLayoutVersion+':'+(map.cols||9)+'x'+(map.rows||5)+':'+(level.theme||'day')+':'+w+':'+h+':'+density+':'+!!imageReady.background+':'+!!imageReady.terrainMaterials+':scene'+(sceneImage?sceneImage.width:0);
      let cached=mapPreviewCache.get(key);
      if(!cached){
        cached=platform.createCanvas();cached.width=Math.ceil(w*density);cached.height=Math.ceil(h*density);
        const surface=cached.getContext('2d');smoothImages(surface);
        if(sceneImage){
          surface.setTransform(cached.width/w,0,0,cached.height/h,0,0);
          terrainRenderer.thumbnail(surface,map,0,0,w,h,{sceneImage});
        }else if(w>=200){
          // Detailed previews share the actual terrain renderer and selected board.
          surface.setTransform(cached.width/1280,0,0,cached.height/960,0,0);
          terrainRenderer.draw(surface,{map,grid:{x:64,y:128,w:1152/(map.cols||9),h:800/(map.rows||5),rows:map.rows||5,cols:map.cols||9},width:1280,height:960,theme:level.theme||'day',background:imageReady.background?images.background:null,materialAtlas:imageReady.terrainMaterials?images.terrainMaterials:null});
        }else{
          surface.setTransform(cached.width/w,0,0,cached.height/h,0,0);terrainRenderer.thumbnail(surface,map,0,0,w,h,{background:imageReady.background?images.background:null,materialAtlas:imageReady.terrainMaterials?images.terrainMaterials:null});
        }
        keepSurface(mapPreviewCache,key,cached,24,Math.min(RENDER_QUALITY[state.renderQuality].pixels/2,8*1024*1024));
      }
      ctx.drawImage(cached,x,y,w,h);
    }
    function toggleSound() {state.audio=!state.audio;try{if(platform.setStorageSync)platform.setStorageSync('chiikawa-garden-audio',state.audio);}catch(_){}if(state.audio)sound('sun');}
    function openAudioSettings(){
      audioReturn=state.overlay||'pause';if(game.status==='playing')pause();
      state.overlay='audio';state.toastTime=0;sound('select');render();
    }
    function sidebarButton(x,y,w) {
      if(!state.sidebarAvailable)return;
      stoneButton('sidebar',state.sidebarPending?'正在打开…':'抖音侧边栏',x,y,w,60,()=>{
        if(state.sidebarPending)return;state.sidebarPending=true;
        try{platform.navigateToScene({scene:'sidebar',success:()=>{state.sidebarPending=false;},fail:()=>{state.sidebarPending=false;notice('暂时无法打开侧边栏，可以继续游戏。');render();}});}
        catch(_){state.sidebarPending=false;notice('当前版本暂不支持侧边栏。');}
      });
    }
    function screenFrame(title,subtitle,back) {
      rect(ctx,-panelOffset,0,view.logicalWidth,H,'rgba(16,19,13,.64)');
      round(ctx,48,45,1184,877,9,'rgba(13,14,8,.38)');
      woodSurface(51,37,1178,881);
      round(ctx,71,177,1138,713,3,'#432d20','#342418',2);
      rect(ctx,77,183,1126,2,'#795334');
      label(ctx,title,92,100,39,UI.gold,'left',true,'#342313');
      label(ctx,subtitle,94,151,21,'#e4cda3','left');
      rect(ctx,93,124,Math.min(770,title.length*40),1,'rgba(215,172,101,.25)');
      if(state.overlay==='almanac'){
        paperSurface(80,188,1120,692);
        rect(ctx,689,197,2,671,'#b69c6c');rect(ctx,692,197,9,671,'rgba(84,53,22,.1)');
      }
      stoneButton(state.overlay==='achievements'?'achievements-back':'screen-back','返回',1068,77,116,62,back);
    }
    function drawAchievementBadge(entry,x,y,size,locked=false){
      if(ACHIEVEMENT_IMAGE_KEYS.has(entry.icon)&&!imageLoader.get('asset:'+entry.icon))imageLoader.load('asset:'+entry.icon,IMAGE_FILES[entry.icon]);
      ctx.save();if(locked)ctx.globalAlpha*=.48;
      if(!image(entry.icon,x-size/2,y-size/2,size,size)){
        const category=achievementModule.CATEGORIES.find(item=>item.id===entry.category),fallback=category?category.icon:entry.icon;
        if(!image(fallback,x-size/2,y-size/2,size,size))actor(fallback==='badgeSunshine'?'sunflower':fallback==='badgeCollection'?'momonga':'mascot',x,y+size*.40,size*.80,null,true);
      }
      ctx.restore();
    }
    function achievementProgress(entry,x,y,width){
      const ratio=Math.min(1,entry.current/entry.target);
      round(ctx,x,y,width,10,5,'#d3c3a4');
      if(ratio>0)round(ctx,x,y,Math.max(10,width*ratio),10,5,entry.unlocked?'#8da966':'#d5a38b');
    }
    function drawAchievements(){
      const profile=achievements.getState(),a=state.achievements;
      screenFrame('三小只的成就收藏册','把每一点勇气，都收成一枚小小的徽章。',closeAchievements);
      paperSurface(80,190,1120,688);
      // Warm paper, stitched binding and spaced stickers echo a real scrapbook.
      rect(ctx,91,200,6,663,'rgba(116,72,40,.16)');rect(ctx,98,200,2,663,'#d4ba88');
      ['all','unlocked','locked'].forEach((filter,i)=>stoneButton('achievements-filter-'+filter,['全部','已解锁','继续努力'][i],111+i*154,211,143,52,()=>setAchievementFilter(filter),a.filter===filter));
      label(ctx,'已收集 '+profile.unlocked+' / '+profile.total+' 枚',1158,226,27,UI.ink,'right',true);
      round(ctx,832,246,322,9,4,'#caba9b');if(profile.unlocked)round(ctx,832,246,Math.max(9,322*profile.unlocked/profile.total),9,4,'#a1b577');
      const categories=[{id:'all',name:'全部',icon:'badgeFriendship'}].concat(achievementModule.CATEGORIES);
      categories.forEach((category,i)=>{
        const x=111+i*150,chosen=a.category===category.id;
        round(ctx,x,280,140,54,9,chosen?'#dce3ba':'#f0dec1',chosen?'#78875c':'#c3a878',2);
        label(ctx,category.name,x+70,307,21,chosen?'#435532':UI.muted,'center',chosen);
        addButton('achievements-category-'+category.id,x,280,140,54,()=>setAchievementCategory(category.id));
      });
      const filtered=achievementEntries(),pages=Math.max(1,Math.ceil(filtered.length/6));a.page=Math.max(0,Math.min(pages-1,a.page));
      filtered.slice(a.page*6,a.page*6+6).forEach((entry,i)=>{
        const x=111+(i%2)*532,y=353+Math.floor(i/2)*145,w=519,h=132;
        round(ctx,x+2,y+4,w,h,10,'rgba(82,51,24,.10)');
        round(ctx,x,y,w,h,10,entry.unlocked?'#fff3d6':'#f1e6cf',entry.unlocked?'#bdab72':'#c5b291',1.5);
        drawAchievementBadge(entry,x+65,y+66,111,!entry.unlocked);
        growthLabel(entry.name,x+129,y+30,w-166,25,UI.ink,'left',true);
        growthLabel(entry.description,x+129,y+62,w-155,19,UI.muted,'left');
        achievementProgress(entry,x+129,y+86,w-223);
        label(ctx,entry.unlocked?'达成！':growthNumber(Math.min(entry.current,entry.target))+'/'+growthNumber(entry.target),x+w-23,y+92,18,entry.unlocked?'#63804a':UI.muted,'right',true);
        growthLabel(entry.unlocked?'小小的你，也很了不起。':'轻点看看这枚徽章的故事',x+129,y+114,w-152,16,entry.unlocked?'#899361':'#9a8364','left');
        addButton('achievement-'+entry.id,x,y,w,h,()=>{a.selected=entry.id;sound('select');render();});
      });
      if(!filtered.length){drawAchievementBadge({icon:'badgeFriendship'},640,519,200);label(ctx,a.filter==='unlocked'?'还没有收集到这一类徽章':'这一页已经全部达成啦！',640,664,29,UI.ink,'center',true);label(ctx,'一起出发，收藏下一份小小的快乐。',640,710,22,UI.muted);}
      if(a.page>0)stoneButton('achievements-prev','‹ 上一页',111,804,188,49,()=>setAchievementPage(a.page-1));
      if(a.page<pages-1)stoneButton('achievements-next','下一页 ›',975,804,188,49,()=>setAchievementPage(a.page+1));
      label(ctx,(a.page+1)+' / '+pages+' 页 · '+filtered.length+' 枚徽章',640,827,21,UI.muted);
      growthLabel(profile.error||'自动记录 · 保存在当前浏览器 · 战局存档不会回退成就',640,899,1030,18,profile.error?'#ffd8ae':'#ead9b4');
      if(a.selected){
        const entry=profile.entries.find(item=>item.id===a.selected);if(!entry){a.selected=null;return;}
        buttons=[];rect(ctx,-panelOffset,0,view.logicalWidth,H,'rgba(35,25,22,.76)');
        round(ctx,273,100,734,753,18,'#f9edce','#745238',5);
        round(ctx,294,121,692,709,13,'#fff5db','#d0b98d',2);
        drawAchievementBadge(entry,640,316,306,!entry.unlocked);
        label(ctx,entry.name,640,516,39,UI.ink,'center',true);
        textLines(entry.flavor,340,568,600,34,24,'#987154');
        growthLabel(entry.description,640,655,600,26,UI.ink,'center',true);
        achievementProgress(entry,389,688,502);
        label(ctx,entry.unlocked?'已解锁 · '+saveDate(entry.unlockedAt):'进度 '+growthNumber(Math.min(entry.current,entry.target))+' / '+growthNumber(entry.target),640,725,21,entry.unlocked?'#63804a':UI.muted);
        stoneButton('achievement-detail-back','收进收藏册',431,764,418,57,()=>{a.selected=null;sound('select');render();},true);
      }
    }
    function toastLabel(text,x,y,size,color,align,bold,safeRect){
      if(options.visualReplica!==true||options.separateToastLabelCache!==true){label(ctx,text,x,y,size,color,align,bold);return;}
      ctx.font=(bold?'bold ':'')+size+'px '+FONT;ctx.textAlign=align||'center';ctx.textBaseline='middle';ctx.fillStyle=color;
      const insideView=safeRect&&safeRect.x>=0&&safeRect.y>=0&&safeRect.x+safeRect.w<=view.logicalWidth&&safeRect.y+safeRect.h<=H;
      if(!insideView||!separateToastLabelCache.draw(ctx,String(text),x,y,safeRect))ctx.fillText(String(text),x,y);
    }
    function drawAchievementToast(){
      if(!achievementToast||state.overlay||tutorial.getState().active)return;
      const entry=achievementToast,x=view.logicalWidth-452,y=H-151,w=432;
      round(ctx,x+3,y+4,w,124,12,'rgba(27,25,15,.25)');round(ctx,x,y,w,124,12,'#fff2d3','#8b7350',3);
      drawAchievementBadge(entry,x+59,y+62,106);
      toastLabel('叮！收获一枚小小成就',x+117,y+28,20,'#8a7651','left',true,{x:x+114,y:y+13,w:300,h:29});
      growthLabel(entry.name,x+117,y+62,w-139,28,UI.ink,'left',true);
      growthLabel(entry.folded?'还有 '+entry.folded+' 枚，去收藏册看看吧':'花园首页 · 成就收藏',x+117,y+98,w-139,18,'#6f8950','left');
    }
    function menuPolygon(points,fill,stroke,width) {
      ctx.beginPath();points.forEach((point,i)=>{if(i)ctx.lineTo(point[0],point[1]);else ctx.moveTo(point[0],point[1]);});ctx.closePath();
      if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width||2;ctx.stroke();}
    }
    function classicMenuButton(id,text,x,y,w,h,fn,primary) {
      const hovered=state.menuHover===id,dy=hovered?-2:0,small=h<=44;
      ctx.save();ctx.translate(x,y+dy);
      // Uneven stone lips, rather than uniformly framed rectangular controls.
      const lip=small?5:9,outline=[[0,lip+3],[lip+3,lip],[lip*1.8,1],[w*.57,3],[w*.61,lip],[w*.82,lip-2],[w-lip,lip+3],[w,h-lip-3],[w-lip-3,h],[lip*2,h-3],[lip,h-lip],[1,h-lip+1]];
      ctx.save();ctx.translate(small?2:3,small?3:5);menuPolygon(outline,'#25252e');ctx.restore();
      menuPolygon(outline,hovered?'#737481':small?'#5c5d68':'#626472','#292a34',small?1.8:2.5);
      menuPolygon([[lip+2,lip+6],[lip*2,lip-1],[w*.56,lip+1],[w*.60,lip+7],[w*.81,lip+5],[w-lip-4,lip+10],[w-lip-1,h-lip-5],[w*.72,h-lip-8],[w*.43,h-lip-3],[lip+5,h-lip-7]],hovered?'#797b85':small?'#646670':'#696b78');
      ctx.beginPath();ctx.moveTo(lip+1,lip+7);ctx.lineTo(lip*2,lip);ctx.lineTo(w*.56,lip+2);ctx.moveTo(w*.62,lip+7);ctx.lineTo(w*.80,lip+6);ctx.lineTo(w-lip-4,lip+11);ctx.strokeStyle=hovered?'#b1b0ac':'#96989d';ctx.lineWidth=small?1:1.7;ctx.stroke();
      ctx.beginPath();ctx.moveTo(lip+5,h-lip-4);ctx.lineTo(w*.39,h-lip+1);ctx.lineTo(w*.67,h-lip-2);ctx.lineTo(w-lip-2,h-lip-5);ctx.strokeStyle='#464854';ctx.lineWidth=small?1.2:2;ctx.stroke();
      // A few short mineral seams keep the broad face quiet behind the lettering.
      ctx.strokeStyle='rgba(197,194,178,.17)';ctx.lineWidth=1;
      [[w*.10,h*.30,w*.23,h*.28],[w*.72,h*.73,w*.85,h*.71],[w*.43,h*.18,w*.52,h*.20]].forEach(line=>{ctx.beginPath();ctx.moveTo(line[0],line[1]);ctx.lineTo(line[2],line[3]);ctx.stroke();});
      ctx.beginPath();ctx.moveTo(w*.86,lip+3);ctx.lineTo(w*.83,lip+12);ctx.lineTo(w*.845,lip+17);ctx.moveTo(lip*2,h-3);ctx.lineTo(lip*2+5,h-lip-5);ctx.strokeStyle='#3d3f4b';ctx.lineWidth=small?1.2:1.8;ctx.stroke();
      const fontSize=small?18:primary?44:h>=73?36:33,ink=hovered?'#c2dc73':primary?'#a4cb50':'#eee2bd';
      label(ctx,text,w/2+1,h/2+4,fontSize,'#30322d','center',true,small?null:'#30322d');
      label(ctx,text,w/2,h/2+1.5,fontSize,ink,'center',true,primary||hovered?'#31421e':'#35372f');
      ctx.restore();
      addButton(id,x*1.6,y*1.6,w*1.6,h*1.6,fn);
    }
    function drawHome() {
      // Original 800 x 600 selector geometry, uniformly scaled with the game.
      ctx.save();ctx.scale(1.6,1.6);
      if(!image('homeBackground',0,0,800,600))rect(ctx,0,0,800,600,'#2778b5');
      ctx.save();ctx.translate(255+Math.sin(state.age*.06)*10,-57);ctx.rotate(.40);image('homeCloud',0,0,275,258);ctx.restore();
      image('homeCenter',80,250,720,350);
      image('homeLeft',0,-79.8,476,680);
      image('homeRight',71,41,730,560);
      // A compact nailed sign belongs to the tree; no full-screen title card.
      ctx.save();ctx.translate(24,40);ctx.rotate(-.045);
      menuPolygon([[2,7],[127,0],[291,7],[294,112],[162,119],[0,112]],'#54341e','#241d14',4);
      menuPolygon([[8,11],[126,7],[284,14],[284,103],[162,110],[9,103]],'#946035','#c69150',2);
      ctx.strokeStyle='#754727';ctx.lineWidth=2;
      [[15,35,272,33],[17,83,274,87],[38,98,136,95],[177,24,256,26]].forEach(line=>{ctx.beginPath();ctx.moveTo(line[0],line[1]);ctx.lineTo(line[2],line[3]);ctx.stroke();});
      [18,277].forEach(x=>{oval(ctx,x,20,4,4,'#2c2822');oval(ctx,x-1,19,1.5,1.5,'#a6a195');});
      label(ctx,'吉伊的',147,30,21,'#f2dd9d','center',true,'#47331f');
      label(ctx,'守护花园',148,76,51,'#21320f','center',true,'#302311');
      label(ctx,'守护花园',146,71,51,'#97bf46','center',true,'#2e3d1a');
      ctx.restore();
      const completed=Object.keys(state.clears).length;
      ctx.save();ctx.translate(58,174);ctx.rotate(.025);
      menuPolygon([[0,0],[244,2],[239,39],[4,37]],'#624526','#2c281b',3);
      label(ctx,'已完成 '+completed+' / '+levelIds.length+' 项讨伐',121,20,18,'#e3d29a','center',true);ctx.restore();
      classicMenuButton('home-adventure','讨伐任务',406,75,321,80,levels,true);
      classicMenuButton('home-endless','无尽讨伐',414,166,299,60,openEndless,false);
      classicMenuButton('home-challenges','小游戏',421,237,279,47,openChallenges,false);
      // Keep all five secondary plaques on the tapered stone face, including
      // their shadows, rather than extending them into the pots and pedestal.
      classicMenuButton('home-almanac','伙伴图鉴',436,292,126,33,openAlmanac,false);
      classicMenuButton('home-saves','存档管理',576,294,112,33,openSaves,false);
      classicMenuButton('help','玩法说明',441,332,121,33,()=>{state.returnOverlay='home';state.overlay='help';sound('select');},false);
      classicMenuButton('sound','游戏设置',575,334,108,33,openAudioSettings,false);
      const unseen=achievements.getState().unseen;
      classicMenuButton('home-achievements','成就收藏'+(unseen?' · 新 '+unseen:''),478,368,188,33,openAchievements,false);
      const music=musicState();
      const musicCaption=music.status==='playing'?'正在播放：睡衣派对之歌':music.status==='off'?'背景音乐已关闭':music.status==='error'?'可在游戏设置中重试音乐':'轻点画面，播放睡衣派对';
      label(ctx,musicCaption,183,235,12.5,'#f3e6b5','center',true,'#3e5431');
      // The existing Chiikawa cast stays animated on the foreground lawn.
      const cast=[{type:'sunflower',x:126,y:538,size:135,say:'呀哈！'},{type:'mascot',x:248,y:559,size:153,say:'一起加油！'},{type:'pea',x:367,y:551,size:134,say:'出发吧！'}];
      cast.forEach((friend,i)=>{
        const greeting=state.homeGreeting&&state.homeGreeting.who===i?state.age-state.homeGreeting.at:99;
        const hop=greeting<.6?Math.sin(greeting/.6*Math.PI)*14:0;
        oval(ctx,friend.x,friend.y-2,friend.size*.32,8,'rgba(17,35,12,.32)');
        // All three 25-frame idle clips share a two-second menu beat and blink.
        actor(friend.type,friend.x,friend.y-hop,friend.size,{age:state.age,id:i,idleFps:12.5,blinkAge:state.age%6.1-5.9});
        addButton('home-friend-'+i,(friend.x-friend.size*.45)*1.6,(friend.y-friend.size)*1.6,friend.size*.9*1.6,(friend.size+8)*1.6,()=>{state.homeGreeting={who:i,at:state.age};sound('select');});
        if(greeting<2.4){
          const by=friend.y-friend.size-32-hop,bw=friend.say.length*17+24;
          round(ctx,friend.x-bw/2,by,bw,32,6,'#f5edc6','#352d20',2);
          label(ctx,friend.say,friend.x,by+16,17,'#333326','center',true);
        }
      });
      if(state.homeGreeting&&state.age-state.homeGreeting.at>3)state.homeGreeting=null;
      ctx.restore();
      sidebarButton(846,845,344);
    }
    function drawLevels() {
      const pages=Math.ceil(levelIds.length/8);
      state.levelPage=Math.max(0,Math.min(pages-1,Math.floor(state.levelPage)||0));
      const first=engine.LEVELS[levelIds[state.levelPage*8]],chapter=first.chapterName||['初访花园','危机四伏','极限守护'][state.levelPage];
      screenFrame('选择讨伐任务','第 '+(state.levelPage+1)+' 章 · '+chapter+'  /  共 '+levelIds.length+' 项讨伐',home);
      levelIds.slice(state.levelPage*8,state.levelPage*8+8).forEach((id,i)=>{
        const level=engine.LEVELS[id],x=86+(i%4)*280,y=207+Math.floor(i/4)*300,w=260,h=274,cleared=state.clears[id];
        round(ctx,x+3,y+5,w,h,4,'rgba(30,15,8,.3)');paperSurface(x,y,w,h,cleared);
        landscape(x+6,y+6,w-12,108,level);round(ctx,x+15,y+14,43,37,9,'rgba(52,76,40,.77)');label(ctx,String(level.index).padStart(2,'0'),x+36,y+32,22,'#fff6d2','center',true);
        if(cleared){round(ctx,x+w-105,y+14,90,37,10,'#e4ecc1');label(ctx,'已讨伐',x+w-60,y+32,23,'#4f743a','center',true);}
        label(ctx,level.name,x+18,y+145,29,UI.ink,'left',true);
        label(ctx,level.difficulty+' · '+level.waves.length+' 波',x+18,y+188,25,UI.muted,'left');
        label(ctx,mapForLevel(level).name,x+18,y+240,23,UI.muted,'left');
        label(ctx,'›',x+w-25,y+240,37,UI.ink);addButton('level-'+id,x,y,w,h,()=>prepare(id));
      });
      for(let page=0;page<pages;page++)stoneButton('chapter-'+page,'第 '+(page+1)+' 章',87+page*202,804,184,57,()=>{state.levelPage=page;sound('select');},page===state.levelPage);
      stoneButton('levels-endless','无尽讨伐  ›',918,804,269,57,openEndless);
      label(ctx,'6 种地图 · 缩略图显示实际地形 · 所有讨伐任务均可接取',640,884,19,'#efd8a1');
    }
    function growthNumber(value,unit) {
      let shown=String(value);
      if(typeof value==='number'&&Number.isFinite(value)){
        const magnitude=Math.abs(value),scale=magnitude>=1e12?1e12:magnitude>=1e8?1e8:magnitude>=1e4?1e4:1;
        shown=magnitude>=1e16?value.toExponential(2).replace(/\.00e/,'e').replace(/(\.\d)0e/,'$1e'):
          String(Math.round(value/scale*100)/100)+(scale===1e12?'万亿':scale===1e8?'亿':scale===1e4?'万':'');
      }
      return shown+(unit||'');
    }
    function growthLabel(text,x,y,width,size,color,align,bold) {
      ctx.font=(bold?'bold ':'')+size+'px '+FONT;
      const measured=ctx.measureText(String(text)).width;
      label(ctx,text,x,y,measured>width?size*width/measured:size,color,align,bold);
    }
    function nextPerkPage(type) {
      const info=game.getPlantUpgrade(type),next=info&&(info.nextUnlock||(info.perks||[]).find(perk=>!perk.unlocked));
      return next?(next.level>=8?1:0):info&&info.level>=8?1:0;
    }
    function drawUpgrades() {
      screenFrame('植物升级','等级无上限 · 3/5/8/12 解锁技能 · 本局同类伙伴共享',closeUpgrades);
      label(ctx,'本局出战伙伴',88,195,22,UI.gold,'left',true);
      state.deck.forEach((type,i)=>{
        const x=88+(i%5)*132,y=220+Math.floor(i/5)*214,w=116,h=195,info=game.getPlantUpgrade(type),chosen=state.upgrades.selected===type;
        paperSurface(x,y,w,h,chosen);
        growthLabel(shortName(type),x+w/2,y+22,w-14,21,'#493018','center',true);
        actor(type,x+w/2,y+125,91,null,true);
        const unlocked=(info.perks||[]).filter(perk=>perk.unlocked).length;
        round(ctx,x+12,y+128,w-24,24,5,unlocked===4?'#e9d589':'#d6e0b2');growthLabel('Lv.'+growthNumber(info.level)+' · '+unlocked+'/4',x+w/2,y+140,w-30,17,'#4d5a31','center',true);
        const ratio=Math.max(0,Math.min(1,info.xp/info.xpNeeded));
        round(ctx,x+12,y+160,w-24,7,3,'#a6ae83');if(ratio>0)round(ctx,x+12,y+160,(w-24)*ratio,7,3,'#699748');
        growthLabel(growthNumber(Math.floor(info.xp))+' / '+growthNumber(info.xpNeeded)+' 经验',x+w/2,y+182,w-20,15,'#75552f','center');
        addButton('upgrade-'+type,x,y,w,h,()=>{state.upgradePress=null;state.upgrades.selected=type;state.upgrades.perkPage=nextPerkPage(type);state.toastTime=0;sound('select');});
      });
      const info=game.getPlantUpgrade(state.upgrades.selected),x=778,w=410;
      paperSurface(x,220,w,583);
      label(ctx,info.name,x+24,251,28,'#493018','left',true);
      growthLabel('Lv.'+info.level+'  →  Lv.'+(info.level+1),x+24,288,w-48,24,'#75552f','left',true);
      (info.benefits||[]).slice(0,3).forEach((benefit,i)=>{
        const y=327+i*29;label(ctx,benefit.label,x+24,y,20,'#75552f','left');
        const current=growthNumber(benefit.current,benefit.unit),next=growthNumber(benefit.next,benefit.unit),delta=benefit.next-benefit.current;
        // Compact late-run totals can round alike; keep the real next-level
        // gain visible instead of suggesting that the purchase does nothing.
        const change=current===next&&delta!==0?current+'  ('+(delta>0?'+':'')+growthNumber(delta)+')':current+' → '+next;
        growthLabel(change,x+w-24,y,248,21,'#66441f','right',true);
      });
      if(info.type==='powerlily')growthLabel('增伤随等级持续成长 · 同类取最强',x+24,385,w-48,17,'#7b744d','left');
      if(info.type==='hastelily'){
        const spec=engine.PLANTS.hastelily,steady=Math.round((spec.attackRateCap-1)*100),burst=Math.round((spec.burstAttackRateCap-1)*100);
        growthLabel('常态上限 +'+steady+'% · 爆发上限 +'+burst+'%',x+24,385,w-48,17,'#7b744d','left');
      }
      state.upgrades.perkPage=state.upgrades.perkPage===1?1:0;
      ['Lv.3 / 5','Lv.8 / 12'].forEach((title,page)=>{
        const tx=x+18+page*192,ty=397,tw=182,th=26,chosen=state.upgrades.perkPage===page;
        stoneSurface(tx,ty,tw,th,chosen);
        label(ctx,title,tx+tw/2,ty+th/2,18,chosen?UI.green:'#fff0c4','center',true,'#243014');
        addButton('perk-page-'+page,tx,ty,tw,th,()=>{state.upgradePress=null;state.upgrades.perkPage=page;state.toastTime=0;sound('select');});
      });
      (info.perks||[]).slice(state.upgrades.perkPage*2,state.upgrades.perkPage*2+2).forEach((perk,i)=>{
        const px=x+18,py=429+i*132,pw=w-36,unlocked=!!perk.unlocked,next=perk.level===info.level+1;
        round(ctx,px,py,pw,122,7,unlocked?'#e2c684':next?'#f0d298':'#d7c297',unlocked?'#987044':next?'#b6a163':'#aa895b',2);
        growthLabel('Lv.'+perk.level+'  '+perk.name,px+15,py+24,pw-111,20,unlocked?'#493018':'#75552f','left',true);
        label(ctx,unlocked?'已解锁':next?'下级解锁':'未解锁',px+pw-15,py+24,17,unlocked?'#557d37':next?'#997934':'#8a8c70','right',true);
        textLines(perk.description,px+15,py+55,pw-30,24,19,unlocked?'#5c4327':'#806343');
      });
      growthLabel('阳光余额  '+growthNumber(game.sun),x+24,710,232,21,'#6a6736','left',true);
      if(!info.canUpgrade)growthLabel(info.reason||'阳光不足',x+w-24,710,120,18,'#986343','right');
      const bx=x+22,by=737,bw=w-44,bh=53;
      stoneSurface(bx,by,bw,bh,info.canUpgrade);
      growthLabel('阳光升级  ·  '+growthNumber(info.cost),bx+bw/2,by+bh/2,bw-24,25,info.canUpgrade?UI.green:'#d1cbbb','center',true);
      addButton('upgrade-buy',bx,by,bw,bh,buyUpgrade);
      round(ctx,88,665,644,219,10,'#dac38e','#987044',2);
      label(ctx,info.level>=12?'技能已全部解锁，继续提升属性':'每位伙伴有 4 项专属能力',110,697,23,'#493018','left',true);
      textLines('经验满自动升级；花阳光立即升一级并保留经验。3、5、8、12 级解锁技能，之后属性继续成长。',110,735,600,29,21,'#75552f');
      textLines('输出、产阳光、治疗与守护获得经验；每波参战同类再获 12 经验。同类共享等级，新一局重置。',110,803,600,27,20,'#75552f');
      label(ctx,'战斗已暂停，可以慢慢选择。',x+24,886,17,'#efd8a1','left');
      stoneButton('growth-close',state.upgrades.resumeOnClose?'继续讨伐':'返回暂停菜单',908,814,254,53,closeUpgrades,false);
    }
    function saveDate(value){const d=new Date(value);return (d.getMonth()+1)+'月'+d.getDate()+'日 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
    function drawSaves(){
      screenFrame('存档管理','无尽战局 · '+saveLibrary.SLOT_COUNT+' 个独立手动存档位 · 最近 3 次自动恢复',closeSaves);
      const slots=slotEntries,selected=state.saves.selected,active=checkpointActive(),auto=autoEntries.find(row=>row.index===autoSlotIndex(selected));
      for(let i=0;i<3;i++){
        const entry=autoEntries.find(row=>row.index===i),id=i?'auto:'+i:'auto',x=86+i*374,chosen=selected===id;
        round(ctx,x,202,354,91,10,chosen?'#e5c078':'#efd7a2',chosen?'#8c622a':'#987044',3);
        label(ctx,['最近自动保存','上一次','更早一次'][i],x+15,224,22,'#493018','left',true);
        if(entry){growthLabel('第 '+entry.wave+' 波 · '+(engine.MAPS[entry.mapId]||{name:entry.mapId}).name,x+15,251,324,18,'#75552f','left');label(ctx,saveDate(entry.savedAt),x+15,276,17,'#75552f','left');}
        else label(ctx,'暂无可恢复版本',x+15,260,19,'#937c57','left');
        addButton(i?'save-select-auto-'+i:'save-select-auto',x,202,354,91,()=>selectSaveSlot(id));
      }
      label(ctx,'手动存档 · 已使用 '+(slots.filter(Boolean).length+unreadableSlots.size)+' / '+saveLibrary.SLOT_COUNT,88,330,22,'#efd8a1','left',true);
      label(ctx,'第 '+(state.saves.page+1)+' / '+SAVE_PAGE_COUNT+' 页',863,332,20,'#efd8a1');
      function pageButton(id,title,x,delta,enabled){
        stoneButton(id,title,x,306,116,49,()=>changeSavePage(delta),false);
        if(!enabled)rect(ctx,x+4,310,108,41,'rgba(45,44,57,.55)');
      }
      pageButton('save-page-prev','上一页',934,-1,state.saves.page>0);
      pageButton('save-page-next','下一页',1068,1,state.saves.page<SAVE_PAGE_COUNT-1);
      for(let i=0;i<SAVE_PAGE_SIZE;i++){
        const id=state.saves.page*SAVE_PAGE_SIZE+i+1;if(id>saveLibrary.SLOT_COUNT)break;
        const slot=slots[id-1],bad=unreadableSlots.has(id),x=86+(i%3)*374,y=368+Math.floor(i/3)*151,w=354,h=140,chosen=selected===id;
        paperSurface(x,y,w,h,chosen);
        label(ctx,'存档 '+String(id).padStart(2,'0'),x+18,y+21,18,'#75552f','left',true);
        if(chosen)label(ctx,'已选择',x+w-18,y+21,17,'#75552f','right',true);
        growthLabel(slot?slot.name:bad?'存档无法读取':'空存档位',x+18,y+48,w-36,25,bad?'#974025':'#493018','left',true);
        if(slot){const s=slot.summary;growthLabel((engine.MAPS[s.mapId]||{name:s.mapId}).name+' · 第 '+s.wave+' 波',x+18,y+78,w-36,20,'#66441f','left');label(ctx,boardLabel(s.boardSize)+' · '+s.speed+'×',x+18,y+101,17,'#75552f','left');label(ctx,saveDate(slot.savedAt),x+18,y+124,16,'#75552f','left');}
        else if(bad){label(ctx,'原数据仍保留，可确认后替换',x+18,y+92,18,'#974025','left');}
        else{
          round(ctx,x+19,y+79,23,10,2,'#c4a36b','#a17d45',1);
          round(ctx,x+19,y+84,43,28,3,'#d7bd87','#a17d45',1);
          rect(ctx,x+25,y+90,31,2,'#ead5a7');
          label(ctx,'点选后保存战局或导入备份',x+76,y+99,17,'#90744a','left');
        }
        addButton('save-select-'+id,x,y,w,h,()=>selectSaveSlot(id));
      }
      const item=isAutoSlot(selected)?null:slots[selected-1];
      const err=state.saves.error||slotReadError||autoReadError;
      if(!err&&!state.saves.pending)growthLabel(isAutoSlot(selected)?'每 15 秒保存，暂停和离开也会保存；可回退最近 3 次进度。':item?'当前选中「'+item.name+'」 · 手动存档不会被自动保存覆盖。':'当前选中存档 '+selected+' · 保存当前无尽战局，或导入之前的备份。',640,699,1090,21,'#efd8a1','center');
      if(err||state.saves.pending)growthLabel(state.saves.pending?(threadedTask?'正在保存战局…':'请完成文件选择或名称输入…'):err,640,699,1090,21,err?'#ffbb91':'#efd8a1','center');
      function control(id,title,x,y,w,fn,enabled,primary){stoneButton(id,title,x,y,w,58,enabled&&!state.saves.pending?fn:()=>notice('此操作当前不可用。'),primary&&enabled);if(!enabled||state.saves.pending)rect(ctx,x+4,y+4,w-8,50,'rgba(45,44,57,.55)');}
      if(isAutoSlot(selected)){
        control('save-load-auto','读取此恢复版本',86,746,354,()=>requestSaveAction('load',selected),!!auto,true);
        label(ctx,'上方两页共有 '+saveLibrary.SLOT_COUNT+' 个手动存档位',789,776,23,'#efd8a1');
      }else{
        control('save-slot-write','保存到此槽',86,746,210,()=>requestSaveAction('save',selected),active,true);
        control('save-slot-load','读取',314,746,184,()=>requestSaveAction('load',selected),!!item,false);
        control('save-slot-rename','改名',516,746,184,()=>editSlotName(selected),!!item,false);
        control('save-slot-export','导出备份',718,746,225,()=>downloadSlot(selected),!!item&&!!platform.writeTextFile,false);
        control('save-slot-import','导入备份',961,746,225,()=>chooseSlotFile(selected),!!platform.readTextFile,false);
        control('save-slot-delete','删除此存档',961,822,225,()=>requestSaveAction('delete',selected),!!item||unreadableSlots.has(selected),false);
      }
      label(ctx,active?'讨伐已暂停，读取后也会暂停，准备好再继续。':'存档保存在本机；重要战局建议导出文件备份。',87,852,21,'#efd8a1','left');
      if(state.saves.confirm){
        const task=state.saves.confirm,titles={save:'覆盖这个手动存档？',load:'读取这个存档？',delete:'删除这个手动存档？',import:'用备份替换这个存档？'};
        buttons=[];rect(ctx,0,0,W,H,'rgba(16,12,17,.65)');stoneSurface(297,285,686,359);
        label(ctx,titles[task.action],640,332,33,UI.gold,'center',true);
        const confirmSlot=isAutoSlot(task.id)?null:slots[task.id-1];
        growthLabel(isAutoSlot(task.id)?'自动恢复版本':('存档 '+task.id+(confirmSlot?' · '+confirmSlot.name:'')),640,376,604,22,'#e4cda3','center');
        textLines(task.action==='load'?'读取后将切换到所选进度并暂停。若要保留当前战局，请先保存到手动存档槽。':task.action==='delete'?'只删除所选的手动存档，不影响当前战局和其他存档。建议先导出备份。':'原有的这个手动存档会被替换；其他存档保持不变。',339,407,604,34,24,'#eadfbe');
        stoneButton('save-confirm-cancel','取消',341,545,265,63,()=>{state.saves.confirm=null;},false);
        stoneButton('save-confirm-accept','确认',674,545,265,63,confirmSaveAction,true);
      }
    }
    function drawEndless() {
      screenFrame('无尽讨伐','选一片花园，和伙伴一起守到下一波。',home);
      const chosenBoard=boardSize(state.endlessBoardSize),selectedMap=engine.MAPS[state.endlessMap],saved=savedSummary();
      paperSurface(86,202,682,287);
      landscape(98,214,658,211,{id:'map-preview',mapId:selectedMap.id});
      round(ctx,113,228,125,33,3,'rgba(39,53,26,.85)');label(ctx,'本次讨伐地点',175,244,17,'#eee4b7','center',true);
      label(ctx,selectedMap.name,109,455,31,UI.ink,'left',true);
      label(ctx,chosenBoard.cols+' × '+chosenBoard.rows+' 格 · '+chosenBoard.rows+' 路防守',746,459,21,UI.muted,'right');
      Object.values(engine.MAPS).forEach((map,i)=>{
        const x=86+(i%3)*230,y=505+Math.floor(i/3)*68,w=222,h=61,chosen=state.endlessMap===map.id;
        const allWater=map.tiles.every(row=>row.every(kind=>kind==='water'));
        paperSurface(x,y,w,h,chosen);landscape(x+6,y+6,87,49,{id:'map-preview',mapId:map.id});
        label(ctx,map.name,x+155,y+24,20,UI.ink,'center',true);label(ctx,chosen?'已选择':allWater?'全水域 · 荷叶布阵':'选择地点',x+155,y+46,13,chosen?'#55712c':UI.muted);
        addButton('map-'+map.id,x,y,w,h,()=>selectMap(map.id));
      });
      growthLabel(selectedMap.tip,93,719,669,17,'#d6bd91','left');
      label(ctx,'庭院规模',804,214,25,UI.gold,'left',true);
      ['classic','expanded','grand'].forEach((id,i)=>{
        const board=boardSize(id),x=798,y=242+i*80,w=389,h=69,chosen=state.endlessBoardSize===id;
        paperSurface(x,y,w,h,chosen);
        round(ctx,x+13,y+14,38,39,4,chosen?'#637a31':'#8f825b','#79643a',1);if(chosen)checkMark(x+32,y+33,21);else label(ctx,String(i+1),x+32,y+33,23,'#fff0b6','center',true);
        label(ctx,board.name,x+67,y+23,23,UI.ink,'left',true);
        label(ctx,board.cols+'×'+board.rows+' · '+board.cols*board.rows+' 格',x+w-19,y+25,19,UI.muted,'right');
        label(ctx,'来客 ×'+board.countScale+'    生命 ×'+board.hpScale,x+67,y+50,17,UI.muted,'left');
        addButton('board-'+id,x,y,w,h,()=>selectBoardSize(id));
      });
      paperSurface(798,499,389,212);
      label(ctx,'最佳讨伐纪录',819,526,20,UI.muted,'left',true);
      growthLabel(String(state.endlessBest.waves),819,570,236,45,UI.ink,'left',true);
      label(ctx,'波完成',1166,580,20,UI.muted,'right');
      label(ctx,'最多讨伐 '+growthNumber(state.endlessBest.kills)+' 位',819,613,19,UI.muted,'left');
      if(saved){
        label(ctx,'上次进度 · 第 '+saved.wave+' 波',819,644,18,UI.ink,'left',true);
        stoneButton('endless-continue','继续上次',814,666,173,35,continueEndless,true);
      }else label(ctx,state.saveError?'旧存档未能读取':'每一波，都能走得更远',819,672,17,UI.muted,'left');
      stoneButton('endless-saves','讨伐存档',1002,666,169,35,openSaves);
      rect(ctx,91,735,1094,1,'#765438');
      label(ctx,'每 5 波首领与三选一补给 · 混编来客轮换 · 清场休整 8 秒',94,758,18,'#e4cfa6','left');
      label(ctx,'同屏最多 80 位，其余排队补入，总量保留。伙伴可在本局持续成长。',94,785,17,'#bfa67e','left');
      stoneButton('endless-prepare',saved?'选择伙伴，开启新一局':'选择伙伴，准备讨伐',390,817,500,70,()=>prepare('endless'),true);
      autoSunButton('endless-auto-sun',924,823,264,54);
      label(ctx,'落地后自动收集',1056,895,14,'#c4ac86');
      // Paint the expanded speed picker last so it stays above the map cards.
      speedSelector('endless-speed',86,815,268,72);
    }
    function autoSunButton(id,x,y,w,h){
      const enabled=state.autoCollectSun;
      stoneSurface(x,y,w,h,enabled);
      label(ctx,'自动收阳光：'+(enabled?'开':'关'),x+w/2,y+h/2,h>40?24:20,enabled?UI.green:'#ddd6bf','center',true,'#243014');
      addButton(id,x,y,w,h,()=>setAutoCollectSun(!state.autoCollectSun));
    }
    function speedPanelRect(id){
      return id==='speed'&&mobileLayout?{x:localHUD.speed.x-102,y:494,w:390,h:350}:id==='speed'?{x:localHUD.speed.x+localHUD.speed.w-206,y:localHUD.speed.y+localHUD.speed.h+8,w:206,h:228}:{x:86,y:566,w:268,h:228};
    }
    function speedSelector(id,x,y,w,h,live=false){
      h=live?localHUD.speed.h:72;
      stoneSurface(x,y,w,h,state.speedOpen===id);
      label(ctx,(live?'速度 · ':'讨伐速度 · ')+state.endlessSpeed+'×',x+w/2,y+23,live?21:23,'#f1e6b9','center',true);
      label(ctx,state.speedOpen===id?'收起选项':'点击调整',x+w/2-7,y+52,17,'#e0ddc5');
      menuArrow(x+w/2+40,y+52,state.speedOpen===id,'#e0ddc5');
      addButton(id+'-toggle',x,y,w,h,()=>toggleSpeedSelector(id));
      if(state.speedOpen!==id)return;
      const panel=speedPanelRect(id),gap=6,pad=9,bw=(panel.w-pad*2-gap*2)/3,bh=mobileLayout&&live?94:48;
      stoneSurface(panel.x,panel.y,panel.w,panel.h);
      label(ctx,'选择讨伐速度',panel.x+panel.w/2,panel.y+22,20,'#f1e6b9','center',true);
      ENDLESS_SPEEDS.forEach((speed,i)=>{
        const bx=panel.x+pad+(i%3)*(bw+gap),by=panel.y+42+Math.floor(i/3)*(bh+gap),active=state.endlessSpeed===speed;
        stoneSurface(bx,by,bw,bh,active);
        label(ctx,speed+'×',bx+bw/2,by+bh/2,22,active?UI.green:'#fff0c4','center',true,'#243014');
        addButton(id+'-'+speed,bx,by,bw,bh,()=>setEndlessSpeed(speed));
      });
      label(ctx,'随时切换 · 音乐保持原速',panel.x+panel.w/2,panel.y+213,live?13:16,'#e0ddc5');
    }
    function shortName(type) {return engine.PLANTS[type].name.replace('栗子馒头','栗子').replace('射手','');}
    function drawPrepare() {
      const level=levelInfo(state.level),map=mapForLevel(level);screenFrame('选择你的伙伴',level.name+' · '+map.name+(level.id==='endless'?' · '+boardLabel(state.endlessBoardSize):'')+' · 带上 '+deckSize+' 位伙伴出发',state.level==='endless'?openEndless:levels);
      woodSurface(86,184,1108,151);
      for(let i=0;i<deckSize;i++){
        const type=state.pendingDeck[i],slotStep=1096/deckSize,x=94+i*slotStep,slotWidth=slotStep-9;
        round(ctx,x,194,slotWidth,125,3,'#3a2a1b','#a17544',1);
        if(type){
          const center=x+slotWidth/2;
          if(!image('packet',center-44,194,88,123.2))paperSurface(center-44,194,88,123);
          actor(type,center,289,78,null,true);label(ctx,engine.PLANTS[type].cost,center-8,304,21,'#191b0a','center',true);
          oval(ctx,x+slotWidth-10,201,11,11,'#463620');label(ctx,'×',x+slotWidth-10,199,18,'#f1dfac','center',true);
          addButton('chosen-'+type,x,194,slotWidth,125,()=>removeDeckCard(type,i));
        }else{label(ctx,String(i+1).padStart(2,'0'),x+slotWidth/2,251,31,'#795938','center',true);label(ctx,'空位',x+slotWidth/2,284,15,'#a7804c');}
      }
      const deckPages=Math.ceil(plantIds.length/12);state.deckPage=Math.max(0,Math.min(deckPages-1,state.deckPage));
      plantIds.slice(state.deckPage*12,state.deckPage*12+12).forEach((type,i)=>{
        const x=86+(i%6)*186,y=354+Math.floor(i/6)*210,w=170,h=207,spec=engine.PLANTS[type],chosen=state.pendingDeck.includes(type),hovered=state.menuHover==='deck-'+type;
        if(hovered)round(ctx,x+10,y-4,150,207,5,'rgba(225,191,102,.09)');
        round(ctx,x+27,y+5,124,174,3,'rgba(0,0,0,.24)');
        if(!image('packet',x+23,y,124,173.6))paperSurface(x+23,y,124,174);
        actor(type,x+85,y+133,110,null,true);label(ctx,spec.cost,x+75,y+156,28,'#191b0a','center',true);
        if(chosen){
          round(ctx,x+23,y,124,174,2,null,'#ddd267',3);
          round(ctx,x+118,y+3,24,23,3,'#425b25','#c5cf78',1);checkMark(x+130,y+14,15);
        }
        growthLabel(shortName(type),x+w/2,y+189,w-4,20,'#f1dcab','center',true);
        const detail=spec.damageBonus?'伤害+'+Math.round(spec.damageBonus*100)+'%':spec.attackRate?'攻速+'+Math.round((spec.attackRate-1)*100)+'%':spec.role;
        // Bonuses are printed on a small paper band, never duplicated as a price.
        if(spec.damageBonus||spec.attackRate){paperSurface(x+33,y+119,104,22);label(ctx,detail,x+85,y+129,15,UI.ink,'center',true);}
        addButton('deck-'+type,x,y,w,h,()=>toggleDeck(type));
      });
      if(deckPages>1){
        stoneButton('deck-page-prev','‹ 上页',88,783,126,38,()=>{state.deckPage=(state.deckPage+deckPages-1)%deckPages;});
        stoneButton('deck-page-next','下页 ›',1066,783,126,38,()=>{state.deckPage=(state.deckPage+1)%deckPages;});
        label(ctx,'伙伴目录  '+(state.deckPage+1)+' / '+deckPages,640,799,17,'#ccb38b');
      }
      stoneButton('deck-recommended','推荐阵容',88,831,232,54,()=>{removedDeckSlot=null;state.pendingDeck=validDeck(null,state.level);sound('select');});
      label(ctx,'已选 '+state.pendingDeck.length+' / '+deckSize+' 位',640,850,25,UI.gold,'center',true);
      label(ctx,'轻点上方卡包可移除',640,877,15,'#c2a67f');
      stoneButton('prepare-start','一起出发！',952,831,240,54,()=>{if(state.pendingDeck.length===deckSize)requestStart();else notice('请选择 '+deckSize+' 位伙伴，再出发讨伐。');},state.pendingDeck.length===deckSize);
      if(state.pendingDeck.length!==deckSize)rect(ctx,957,836,230,44,'rgba(45,44,57,.35)');
    }
    function almanacTab(tab) {state.almanac.tab=tab;state.almanac.page=0;state.almanac.selected=(tab==='plants'?plantIds:enemyIds)[0];sound('select');}
    function almanacPage(delta) {
      const a=state.almanac,ids=a.tab==='plants'?plantIds:enemyIds,page=Math.max(0,Math.min(Math.ceil(ids.length/9)-1,a.page+delta));
      if(page!==a.page){a.page=page;a.selected=ids[page*9];sound('select');}
    }
    function drawAlmanac() {
      const a=state.almanac,isPlant=a.tab==='plants',ids=isPlant?plantIds:enemyIds;
      const pages=Math.ceil(ids.length/9);a.page=Math.max(0,Math.min(pages-1,Number.isInteger(a.page)?a.page:0));
      const visible=ids.slice(a.page*9,a.page*9+9);
      if(!visible.includes(a.selected))a.selected=visible[0];const type=a.selected,spec=(isPlant?engine.PLANTS:engine.ENEMIES)[type];
      screenFrame('伙伴图鉴','认识每位伙伴，也了解每一位来客。',()=>{state.overlay=a.returnOverlay||'home';sound('select');});
      stoneButton('almanac-plants','讨伐伙伴 · '+plantIds.length,89,197,281,63,()=>almanacTab('plants'),isPlant);
      stoneButton('almanac-enemies','讨伐目标 · '+enemyIds.length,388,197,281,63,()=>almanacTab('enemies'),!isPlant);
      visible.forEach((id,i)=>{
        const x=89+(i%3)*198,y=282+Math.floor(i/3)*170,w=184,h=156,item=(isPlant?engine.PLANTS:engine.ENEMIES)[id],chosen=id===type;
        paperSurface(x,y,w,h,chosen);
        actor(id,x+w/2,y+105,id==='boss'?109:101,null,true);
        growthLabel(item.name.replace('栗子馒头','栗子').replace('射手',''),x+w/2,y+132,w-20,20,'#493018','center');
        addButton('entry-'+id,x,y,w,h,()=>{a.selected=id;sound('select');});
      });
      stoneButton('almanac-prev','上一页',90,803,167,57,()=>almanacPage(-1));
      stoneButton('almanac-next','下一页',502,803,167,57,()=>almanacPage(1));
      if(a.page===0)rect(ctx,94,807,159,49,'rgba(210,218,191,.38)');
      if(a.page===pages-1)rect(ctx,506,807,159,49,'rgba(210,218,191,.38)');
      label(ctx,(a.page+1)+' / '+pages+' 页',379,832,27,'#75552f','center',true);
      paperSurface(702,195,487,674);
      label(ctx,spec.name,945,237,32,'#493018','center',true);
      oval(ctx,945,481,91,18,'rgba(107,132,65,.14)');actor(type,945,483,type==='boss'?221:202,{age:state.age,armed:true});
      const description=spec.description||(isPlant?'和伙伴们一起守护草坪。':'从右侧靠近花园，被挡住时会攻击面前的伙伴。');
      textLines(description,729,531,426,28,22,'#75552f');
      const attackStat=spec.damageBonus?['增伤','+'+Math.round(spec.damageBonus*100)+'%']:spec.attackRate?['攻速','+'+Math.round((spec.attackRate-1)*100)+'%']:['伤害',spec.damage===undefined?'—':spec.damage];
      const stats=isPlant?[['阳光',spec.cost],['生命值',spec.hp],['冷却',spec.cooldown+' 秒'],attackStat]:[['生命值',spec.hp],['啃咬 / 秒',spec.damage],['移动速度',spec.speed+' 格 / 秒']];
      stats.forEach((stat,i)=>{
        const x=isPlant?729+(i%2)*224:732,y=isPlant?622+Math.floor(i/2)*49:613+i*41,right=isPlant?x+195:1154;
        label(ctx,stat[0],x,y,26,'#82603c','left');label(ctx,stat[1],right,y,26,'#493018','right',true);
      });
      const counter=spec.counter||spec.tip||spec.strategy||(isPlant?(type==='sunflower'?'种在后排，持续积累阳光。':type==='mine'?'提前布置，给它留出准备时间。':'放在有来客的行，与其他伙伴搭配。'):'用远程伙伴提前消耗，必要时准备爆炸伙伴。');
      rect(ctx,729,727,426,1,'#bca274');label(ctx,isPlant?'搭配建议':'应对建议',729,755,23,'#75552f','left',true);textLines(counter,729,791,426,28,22,'#75552f');
    }
    function drawAudioSettings(){
      const music=musicState(),x=270,y=64,w=740,h=832;
      rect(ctx,-panelOffset,0,view.logicalWidth,H,'rgba(16,12,17,.66)');
      round(ctx,x+7,y+10,w,h,5,'rgba(12,10,17,.42)');stoneSurface(x,y,w,h);
      label(ctx,'游戏设置',640,y+51,39,UI.gold,'center',true,'#302330');
      label(ctx,'画面与声音',640,y+88,21,'#e5dcc7');
      rect(ctx,x+32,y+109,w-64,2,'#363748');rect(ctx,x+32,y+111,w-64,1,'#9293a2');
      paperSurface(x+34,y+132,w-68,170);
      label(ctx,'画面精细度',x+57,y+164,25,UI.ink,'left',true);
      Object.keys(RENDER_QUALITY).forEach((key,i)=>stoneButton('quality-'+key,RENDER_QUALITY[key].name,x+53+i*214,y+185,206,57,()=>setRenderQuality(key),state.renderQuality===key));
      const qualityCaption={smooth:'流畅优先 · 轻松畅玩',high:'均衡画质 · 兼顾清晰与流畅',ultra:'画质优先 · 更清晰的轮廓与文字'};
      label(ctx,qualityCaption[state.renderQuality],640,y+278,21,UI.muted);
      paperSurface(x+34,y+322,w-68,125);
      label(ctx,'背景音乐',x+57,y+350,20,UI.muted,'left',true);
      growthLabel(music.title,x+57,y+383,430,28,UI.ink,'left',true);
      const status={playing:'正在循环播放',paused:'游戏暂停，音乐也已暂停',waiting:'轻点画面后播放',loading:'正在准备音乐',off:'背景音乐已关闭',ready:'准备播放',error:'音乐暂未加载，点击重试'}[music.status];
      growthLabel(status,x+57,y+420,430,19,UI.muted,'left');
      stoneButton('music-toggle',music.status==='error'?'重试播放':musicEnabled?'音乐：开':'音乐：关',x+w-216,y+359,160,62,()=>setMusicEnabled(music.status==='error'||!musicEnabled),musicEnabled);
      label(ctx,'音乐音量',x+34,y+489,26,UI.gold,'left',true);
      label(ctx,Math.round(musicVolume*100)+'%',x+w-34,y+489,26,'#e8e5cf','right',true);
      MUSIC_VOLUMES.forEach((volume,i)=>stoneButton('music-volume-'+i,Math.round(volume*100)+'%',x+34+i*136,y+513,128,55,()=>setMusicVolume(volume),Math.abs(volume-musicVolume)<.001));
      paperSurface(x+34,y+591,w-68,104);
      label(ctx,'战斗音效',x+57,y+625,28,UI.ink,'left',true);
      label(ctx,'种植、收阳光与攻击的声音',x+57,y+664,21,UI.muted,'left');
      stoneButton('effects-toggle',state.audio?'音效：开':'音效：关',x+w-216,y+613,160,62,toggleSound,state.audio);
      label(ctx,'画质与声音设置自动保存',640,y+728,20,'#e5dcc7');
      stoneButton('screen-back','返回',x+190,y+754,w-380,58,back,true);
    }
    function drawStrategyReward(){
      rect(ctx,-panelOffset,0,view.logicalWidth,H,'rgba(16,12,17,.68)');stoneSurface(120,140,1040,680);
      label(ctx,'守住第 '+game.strategy.pending+' 波！',640,200,40,UI.gold,'center',true);
      label(ctx,'挑一份补给 · 选好后继续本局',640,244,23,'#eadfbe');
      const choices=runDirector.choices(game.strategy,game,state.deck);
      choices.forEach((item,i)=>{const x=158+i*325;paperSurface(x,300,306,330);label(ctx,item.name,x+153,345,30,UI.ink,'center',true);textLines(item.description,x+24,402,258,35,23,UI.ink);stoneButton('strategy-'+item.id,'选择 '+item.name,x+19,548,268,60,()=>chooseStrategyReward(item.id),i===0);addButton('strategy-card-'+item.id,x,300,306,330,()=>chooseStrategyReward(item.id));});
      growthLabel('下一波 · '+strategyText(true),640,684,920,22,'#fff0c4','center',true);
      growthLabel(strategyPlan(true)?.tip||'',640,725,900,20,'#eadfbe');
      growthLabel(state.saveError||'选择前时间暂停，当前进度会自动保存',640,775,930,20,state.saveError?'#ffba98':'#d7c69e');
    }
    function drawStrategySummary(){
      const recap=runDirector.summary(game.strategy);if(!recap)return;
      rect(ctx,-panelOffset,0,view.logicalWidth,H,'rgba(16,12,17,.68)');stoneSurface(220,95,840,780);
      label(ctx,'本局讨伐复盘',640,149,38,UI.gold,'center',true);
      label(ctx,'完成 '+game.wavesCleared+' 波 · 讨伐 '+game.kills+' 位 · '+Math.floor(game.time)+' 秒',640,194,23,'#eadfbe');
      paperSurface(252,231,776,119);
      const f=recap.failure,name=f&&(engine.ENEMIES[f.enemyType]?.name||'来客');
      textLines(f?'第 '+(f.row+1)+' 路被'+name+'突破；该路剩余 '+f.defenders+' 位伙伴，'+(f.mowerUsed?'割草机已用完。':'该路没有可用割草机。'):'阵线仍在坚守。应急割草机储备：'+recap.guardCharges+' 辆。',275,266,730,32,23,UI.ink);
      label(ctx,'伙伴贡献',282,390,27,UI.gold,'left',true);label(ctx,'有效伤害 / 讨伐',990,390,21,'#eadfbe','right');
      const ranked=recap.plants.filter(p=>p.damage>0||p.kills>0).slice(0,6);
      if(!ranked.length)label(ctx,'还没有造成伤害，先为每一路补上输出伙伴。',640,444,23,'#eadfbe');
      ranked.forEach((p,i)=>{const y=435+i*43;growthLabel(engine.PLANTS[p.type]?.name||p.type,282,y,455,23,'#fff0c4','left',i===0);label(ctx,p.damage+' / '+p.kills,990,y,23,'#eadfbe','right');});
      label(ctx,'阳光补给 '+recap.rewards.supply+' 次 · 共同成长 '+recap.rewards.growth+' 次 · 防线修复 '+recap.rewards.defense+' 次',640,722,20,'#eadfbe');
      stoneButton('strategy-summary-back','返回战局菜单',270,779,350,58,()=>{state.overlay=game.status==='paused'?'pause':'end';render();},true);
      stoneButton('strategy-summary-home','返回花园',660,779,350,58,home);
    }

    function drawPanel() {
      if(!state.overlay)return;
      if(state.overlay==='strategy-reward'){drawStrategyReward();return;}
      if(state.overlay==='strategy-summary'){drawStrategySummary();return;}
      if(state.overlay==='home'){drawHome();return;}if(state.overlay==='challenges'){drawChallenges();return;}if(state.overlay==='levels'){drawLevels();return;}if(state.overlay==='endless'){drawEndless();return;}
      if(state.overlay==='prepare'){drawPrepare();return;}if(state.overlay==='almanac'){drawAlmanac();return;}
      if(state.overlay==='audio'){drawAudioSettings();return;}
      if(state.overlay==='upgrades'){drawUpgrades();return;}
      if(state.overlay==='saves'){drawSaves();return;}
      if(state.overlay==='achievements'){drawAchievements();return;}
      rect(ctx,-panelOffset,0,view.logicalWidth,H,'rgba(16,12,17,.58)');
      if(state.overlay==='overwrite-save'){
        stoneSurface(300,245,680,458);
        label(ctx,'开始新的无尽讨伐？',640,307,36,UI.gold,'center',true);
        textLines('新一局会成为最近自动保存，之前的进度暂留在恢复历史。长期保留某一局，请先将它保存到手动存档槽。',354,378,572,38,26,'#eadfbe');
        stoneButton('overwrite-confirm','替换自动存档并开始',355,511,570,70,()=>start('endless',state.pendingDeck),true);
        stoneButton('overwrite-cancel','返回选卡',355,601,570,62,()=>{state.overlay='prepare';render();});return;
      }
      if(challenges.state&&['pause','end','restart'].includes(state.overlay)){drawChallengePanel();return;}
      if(state.overlay==='help'){
        const x=300,y=83,w=680,h=794;
        round(ctx,x+6,y+10,w,h,5,'rgba(19,17,26,.6)');stoneSurface(x,y,w,h);
        label(ctx,'游戏玩法',640,y+56,39,UI.gold,'center',true);
        const tips=[['1  选好伙伴','每次带上 '+deckSize+' 张卡。点卡牌后点击空格，或直接拖种；再点同一卡牌取消，数字键 1–9、0 也能选择。'],['2  收集阳光','点击下落或落地的阳光，按住滑动可连续收集。收集时不会误种植物，松开后继续布阵。'],['3  水上布阵','先放荷叶，再种植物。冰雾减速，守护挡伤；应援增伤、疾风加速上方射手、喷菇和海獭。铲子先铲植物，再铲荷叶。'],['4  留意地形','碎石、天窗不可种；红色落点不扣阳光，伙伴留在手里可重新放置。泥地和浅水拖慢来客，冰面加速。']];
        tips.forEach((tip,i)=>{label(ctx,tip[0],x+44,y+120+i*134,28,UI.gold,'left',true);textLines(tip[1],x+44,y+159+i*134,w-88,32,26,'#eadfbe');});
        growthLabel('无尽成长：等级无上限 · 3/5/8/12 解锁技能 · 新一局重置',640,y+666,w-88,20,'#eadfbe','center',true);
        stoneButton('help-back','返回',x+155,y+h-91,370,64,()=>{state.overlay=state.returnOverlay;},true);return;
      }
      const ended=state.overlay==='end',paused=state.overlay==='pause',restarting=state.overlay==='restart';
      const saveMenu=paused&&game.isEndless,x=270,w=740,h=saveMenu?(state.sidebarAvailable?780:712):(state.sidebarAvailable?566:544),y=(H-h)/2;
      const inset=x+40,col=322,right=inset+338;
      round(ctx,x+7,y+10,w,h,5,'rgba(12,10,17,.42)');stoneSurface(x,y,w,h);
      const won=ended&&game.status==='won',nextId=game.isEndless?null:levelIds[levelIds.indexOf(game.levelId)+1];
      label(ctx,ended?(won?'讨伐成功！':game.isEndless?'本次讨伐结束':'下次讨伐再加油'):paused?'讨伐暂停':'重新讨伐？',640,y+51,39,UI.gold,'center',true,'#302330');
      growthLabel(levelInfo(game.levelId).name+' · '+game.getMap().name,640,y+95,w-80,25,'#fff0c4','center',true);
      const result=(game.isEndless?'完成 '+game.wavesCleared+' 波 · ':'')+'讨伐 '+game.kills+' 位 · '+Math.floor(game.time)+' 秒';
      growthLabel(ended?result:restarting?'重新出发后，这一局会从头开始。':'花园的时间已暂停，伙伴们会等你回来。',640,y+132,w-80,22,'#e5dcc7');
      const by=y+173;
      if(won&&nextId)stoneButton('next-level','接取下一项讨伐',inset,by,w-80,68,()=>prepare(nextId),true);
      else stoneButton(paused?'resume':'start',paused?'继续讨伐':restarting?'确认重新讨伐':'再次讨伐',inset,by,w-80,68,paused?resume:()=>start(game.levelId,state.deck),true);
      rect(ctx,inset,by+84,w-80,2,'#363748');rect(ctx,inset,by+86,w-80,1,'#9293a2');
      if(won&&nextId)stoneButton('start','再次讨伐',inset,by+105,col,58,()=>start(game.levelId,state.deck));
      else stoneButton('restart',restarting?'返回本局':'重新讨伐',inset,by+105,col,58,()=>{if(restarting){state.overlay=game.status==='paused'?'pause':'end';return;}cancelDrag();state.held=null;pauseBattleClock();state.overlay='restart';sound('select');});
      stoneButton('almanac','伙伴图鉴',right,by+105,col,58,openAlmanac);
      stoneButton(saveMenu?'pause-save-home':'home',saveMenu?'保存并返回花园':'返回花园',inset,by+175,col,58,saveMenu?saveAndHome:home);
      if(saveMenu)stoneButton('pause-recap','本局贡献',right,by+175,col,58,openStrategySummary);
      else stoneButton('help','游戏玩法',right,by+175,col,58,()=>{state.returnOverlay=state.overlay;state.overlay='help';sound('select');});
      if(saveMenu){stoneButton('pause-upgrades','植物升级',inset,by+245,col,58,()=>openUpgrades());stoneButton('sound','游戏设置',right,by+245,col,58,openAudioSettings);}
      else {stoneButton('sound','游戏设置',inset,by+245,col,58,openAudioSettings);stoneButton('pause-achievements','成就收藏',right,by+245,col,58,openAchievements);}
      if(saveMenu){
        stoneButton('pause-achievements','成就收藏',inset,by+315,w-80,58,openAchievements);
        paperSurface(x+32,y+568,w-64,113);
        stoneButton('pause-save','快速保存',inset,y+580,col,54,()=>{saveEndlessRun();render();});
        stoneButton('pause-saves','存档管理',right,y+580,col,54,openSaves);
        label(ctx,state.saveError?'未能保存，请重试':autoEntries.length?'最近保存 '+saveDate(autoEntries[0].savedAt)+' · 本机':'当前尚无存档',640,y+658,19,state.saveError?'#974025':UI.muted);
      }
      sidebarButton(inset,y+(saveMenu?698:488),w-80);
      if(!state.sidebarAvailable&&!saveMenu)label(ctx,'点种子包拿起伙伴 · 点击阳光收集',640,y+h-30,20,'#e5dcc7');
    }
    function captureVisualFrame(){
      // The wave queue stays with the authoritative simulation. Drawing needs
      // its count, not a second copy of every future monster.
      const drawingGame={};
      for(const key of Object.keys(game)){
        if(key==='events')drawingGame.events=[];
        else if(key==='spawnPlan')drawingGame.spawnPlan={length:game.spawnPlan.length};
        else if(typeof game[key]!=='function')drawingGame[key]=game[key];
      }
      return {game:drawingGame,state:{...state},view:{...view},grid:{...GRID},localHUD:{...localHUD},mobileLayout,mobileBoardBounds:mobileBoardBounds&&{...mobileBoardBounds},canvas:{width:canvas.width,height:canvas.height},transientEffects:threadedActive()?simulation.getTransientEffects():[],sunCollection:sunCollection.visualSnapshot(),achievementToast:achievementToast&&{...achievementToast}};
    }
    function captureStage(name,details){
      if(options.visualReplica!==true||typeof platform.captureStage!=='function')return;
      try{platform.captureStage(name,details);}catch(_){}
    }
    function applyVisualFrame(frame){
      if(options.visualReplica!==true||disposed||!frame||!frame.game||!frame.state||!frame.view||!frame.canvas)return false;
      if(frame.game.isEndless!==true||frame.game.status!=='playing'||frame.state.overlay)return false;
      captureStage('nativeApplyEnter');
      Object.assign(game,frame.game);Object.assign(state,frame.state);Object.assign(GRID,frame.grid);Object.assign(localHUD,frame.localHUD);
      view={...frame.view};mobileLayout=!!frame.mobileLayout;mobileBoardBounds=frame.mobileBoardBounds&&{...frame.mobileBoardBounds};
      if(canvas.width!==frame.canvas.width)canvas.width=frame.canvas.width;if(canvas.height!==frame.canvas.height)canvas.height=frame.canvas.height;
      if(frame.sunCollection)sunCollection.applyVisualSnapshot(frame.sunCollection);
      achievementToast=frame.achievementToast&&{...frame.achievementToast};visualReplicaFrame=frame;
      // The render-only replica draws exactly the requested coherent snapshot.
      // Asset callbacks may update readiness while it waits for the next one.
      captureStage('nativeStateApplied');
      applyingVisualCohort=true;
      try{render();return true;}finally{applyingVisualCohort=false;captureStage('nativeApplyExit');}
    }
    function presentVisualFrame(){
      if(!visualRenderer)return false;
      const eligible=game.isEndless&&game.status==='playing'&&GRID.cols>=15&&!state.overlay&&!challenges.state&&!tutorial.getState().active&&!state.selected&&!state.drag&&!state.held&&!state.shovel&&!state.shovelAction&&!state.speedOpen&&!state.endlessGrowthOpen&&!state.plantTooltip&&!appHidden;
      if(!eligible){if(visualMode){visualMode=false;lastVisualScope='';visualEpoch++;visualRenderer.reset();}return false;}
      visualMode=true;
      const systemNow=typeof performance==='object'&&typeof performance.now==='function'?performance.now():Date.now();
      const scopeSignature=game.levelId+':'+game.getMap().id+':'+game.sceneLayoutVersion+':'+game.endlessBoardSize+':'+canvas.width+'x'+canvas.height+':'+view.scale+':'+view.x+':'+view.y+':'+view.pixelRatio+':'+view.displayPixelRatio+':'+state.renderQuality;
      if(lastVisualScope&&lastVisualScope!==scopeSignature){visualEpoch++;visualRenderer.reset();}
      lastVisualScope=scopeSignature;
      const scope=visualEpoch+':'+scopeSignature;
      const key=scope+':'+game.simulationTick;
      if(visualRenderer.canSubmit(key))visualRenderer.submit({key,scope,sequence:++visualSequence,receivedAt:systemNow,frame:captureVisualFrame()});
      return visualRenderer.replay(systemNow,details=>platform.presentVisualFrame&&platform.presentVisualFrame(details,canvas)!==false)===true;
    }
    function render() {
      if(disposed||(options.visualReplica===true&&!applyingVisualCohort))return;
      renderSupports=null;renderSupportIds=null;renderPlantCells=null;
      ctx=mainContext;deferredScene=null;sceneForeground=null;staticTerrainFrame=false;frameBackground=null;
      captureStage('nativeMotionFrameStart');
      if(motion&&typeof motion.beginFrame==='function'){try{motion.beginFrame();}catch(_){}}
      captureStage('nativeMotionFrameEnd');
      if(state.presentedOverlay!==state.overlay){state.presentedOverlay=state.overlay;state.menuTransition=state.overlay?{age:0}:null;}
      syncGrid();
      if(state.speedOpen==='speed'&&(state.overlay||!['playing','paused'].includes(game.status))||state.speedOpen==='endless-speed'&&state.overlay!=='endless')state.speedOpen=false;
      if(state.overlay||!checkpointActive())state.endlessGrowthOpen=false;
      if(view.logicalWidth!==sceneWidth()||(game.status==='ready'&&mobileLayout)){resize();return;}
      if(presentVisualFrame()){
        syncMusic();syncFuse();
        renderRequested=false;
        if(simulation&&typeof simulation.acknowledgeFrame==='function')simulation.acknowledgeFrame();
        return;
      }
      syncMusic();syncFuse();buttons=[];panelOffset=0;
      renderRequested=false;const music=musicState();lastPaintMusicKey=music.trackId+':'+music.status;lastPaintSceneKey=game.status+':'+state.overlay;
      // A real Worker cannot dispatch MessageEvent during this synchronous
      // render task. Its received mirror and main-owned journals stay stable,
      // while the ACK lets it prepare exactly one subsequent snapshot in parallel.
      // Keep FX sampling at its original draw position: it uses real-time age.
      if(platform.trustedWorkerTransport===true&&threadedActive()&&simulation&&typeof simulation.acknowledgeFrame==='function')simulation.acknowledgeFrame();
      if(platform.setCursor)platform.setCursor(state.selected==='shovel'&&state.shovel&&state.shovel.visible&&!state.sunSweep&&!state.overlay&&game.status==='playing'?'none':state.overlay&&state.menuHover?'pointer':'default');
      const terrainImpact=options.nativeStaticTerrain===true?game.effects.find(e=>(e.plantType==='cherry'||e.plantType==='jalapeno')&&(e.type==='burst'||e.type==='fire')&&e.age<.18):null;
      if(!prepareStaticTerrain(terrainImpact))hideStaticTerrain();
      ctx.setTransform(1,0,0,1,0,0);if(staticTerrainFrame){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#171912';if(!restoreStaticTerrainUnderlay())rect(ctx,0,0,canvas.width,canvas.height,'#171912');}else rect(ctx,0,0,canvas.width,canvas.height,'#171912');
      const dpr=view.pixelRatio;ctx.setTransform(dpr*view.scale,0,0,dpr*view.scale,dpr*view.x,dpr*view.y);
      ctx.save();ctx.beginPath();ctx.rect(0,0,view.logicalWidth,H);ctx.clip();
      const fullPage=['home','levels','endless','prepare','almanac','audio','upgrades','saves','challenges','achievements'].includes(state.overlay);
      if(!fullPage){
        const impact=options.nativeStaticTerrain===true?terrainImpact:game.effects.find(e=>(e.plantType==='cherry'||e.plantType==='jalapeno')&&(e.type==='burst'||e.type==='fire')&&e.age<.18);
        ctx.save();if(impact){const fade=1-impact.age/.18;ctx.translate(3*Math.cos(impact.age*100)*fade,-4*Math.cos(impact.age*85)*fade);}
        captureStage('nativeBackgroundStart');
        drawingDeviceBackground=options.visualReplica===true&&options.deviceBackgroundCache===true&&options.nativeStaticTerrain!==true&&
          game.status==='playing'&&game.isEndless&&GRID.cols>=15&&!state.overlay&&!appHidden&&!sceneRetry&&!staticTerrainFrame&&!impact;
        try{drawBackground();}finally{drawingDeviceBackground=false;}
        captureStage('nativeBackgroundEnd');
        captureStage('nativeEntitiesStart');drawEntities();captureStage('nativeEntitiesEnd');ctx.restore();
        captureStage('nativeHUDStart');drawFixedHUD();captureStage('nativeHUDEnd');
        captureStage('nativeForegroundRestStart');sunCollection.draw(ctx,sun);drawDrag();drawShovel();drawTutorial();
      }else if(state.overlay!=='home'){
        // Only the terrain is visible around these panels. Drawing the lawn's
        // hidden characters first used to spend a second scene's frame budget.
        drawBackground();
      }
      // Modal hit targets replace, rather than overlay, the live lawn controls.
      if(state.overlay){buttons=[];panelOffset=(view.logicalWidth-W)/2;ctx.save();ctx.translate(panelOffset,0);if(state.menuTransition)ctx.globalAlpha=.7+.3*Math.min(1,state.menuTransition.age/.18);drawPanel();ctx.restore();panelOffset=0;}
      drawEndlessGrowthPanel();drawPlantTooltip();
      drawAchievementToast();
      if(state.toastTime>0&&!['strategy-reward','strategy-summary'].includes(state.overlay)&&!tutorial.getState().active){const tw=Math.min(1060,Math.max(420,state.toast.length*23+52));round(ctx,(view.logicalWidth-tw)/2,173,tw,51,8,'rgba(23,39,15,.86)','#97a86b',2);label(ctx,state.toast,view.logicalWidth/2,198,22,'#fff0b5','center',true);}
      if(imageErrors.length){const x=Math.max(18,view.logicalWidth-472),y=H-54;round(ctx,x,y,454,40,6,'rgba(28,28,21,.9)');label(ctx,imageErrors.length+' 张图片暂未就绪',x+15,y+20,18,'#ffe3a4','left',true);round(ctx,x+313,y+4,133,32,5,'#766442','#c2ac71',1);label(ctx,'重试资源',x+380,y+20,18,'#fff0c5');addButton('retry-assets',x+313,y+4,133,32,retryAssets);}
      ctx.restore();
      captureStage('nativeForegroundRestEnd');
      const pending=deferredScene;deferredScene=null;sceneForeground=null;ctx=mainContext;
      if(pending){
        captureStage('nativePendingFinishStart');
        let presented=false;
        try{presented=pending.finish(meshCanvas=>platform.presentMotionScene(meshCanvas,canvas,{x:view.pixelRatio*view.x,y:view.pixelRatio*view.y,width:view.pixelRatio*view.scale*view.logicalWidth,height:view.pixelRatio*view.scale*H}))===true;}catch(_){try{pending.cancel();}catch(_){}}
        captureStage('nativePendingFinishEnd',{presented});
        if(!presented){
          if(platform.hideMotionScene)platform.hideMotionScene();
          hideStaticTerrain();
          // Context/allocation failures show a complete original frame.
          sceneRetry=true;try{render();}finally{sceneRetry=false;}
        }
      }else{
        if(platform.hideMotionScene)platform.hideMotionScene();
        if(staticTerrainFrame){hideStaticTerrain();sceneRetry=true;try{render();}finally{sceneRetry=false;}return;}
      }
      staticTerrainFrame=false;frameBackground=null;
      if(simulation&&typeof simulation.acknowledgeFrame==='function')simulation.acknowledgeFrame();
    }
    function touchId(touch) {return touch.identifier===undefined?(touch.pointerId===undefined?null:touch.pointerId):touch.identifier;}
    function eventTouch(event,identifier,match) {
      if(!event)return null;
      // changedTouches owns an end/cancel event; another finger still present in
      // touches must never release, retarget, or cancel the active drag.
      const list=event.changedTouches!==undefined?Array.from(event.changedTouches):event.touches!==undefined?Array.from(event.touches):[event];
      return (match?list.find(t=>touchId(t)===identifier):list[0])||null;
    }
    function logicalPoint(touch) {
      if(!touch)return null;
      const cx=Number(touch.clientX===undefined?touch.x:touch.clientX),cy=Number(touch.clientY===undefined?touch.y:touch.clientY);
      return Number.isFinite(cx)&&Number.isFinite(cy)?{x:(cx-view.x)/view.scale,y:(cy-view.y)/view.scale}:null;
    }
    function overSpeedPanel(point){return !state.overlay&&['playing','paused'].includes(game.status)&&(contains(localHUD.speed,point)||(state.speedOpen==='speed'&&contains(speedPanelRect('speed'),point)));}
    function overEndlessGrowthControls(point){return !mobileLayout&&!state.overlay&&checkpointActive()&&(contains(GROWTH_CONTROL,point)||(state.endlessGrowthOpen&&contains(GROWTH_PANEL,point)));}
    function clearShovel() {
      if(state.selected==='shovel')state.selected=null;
      state.shovel=null;state.shovelGesture=null;state.shovelAction=null;
      if(platform.setCursor)platform.setCursor('default');
    }
    function updateShovelTarget(tool) {
      tool.col=Math.floor((tool.x-GRID.x)/GRID.w);tool.row=Math.floor((tool.y-GRID.y)/GRID.h);
      const target=game.plants.find(p=>p.hp>0&&p.row===tool.row&&p.col===tool.col)||game.supports.find(p=>p.hp>0&&p.row===tool.row&&p.col===tool.col);
      tool.valid=!state.overlay&&!state.speedOpen&&!state.endlessGrowthOpen&&!contains(localHUD.bank,tool)&&!overSpeedPanel(tool)&&!overEndlessGrowthControls(tool)&&game.cellValid(tool.row,tool.col)&&!!target;
      tool.targetId=tool.valid?target.id:null;
    }
    function holdShovel(point,pointerType) {
      const p=point||{x:localHUD.shovelX+50,y:108};
      state.shovel={x:p.x,y:p.y,row:null,col:null,valid:false,targetId:null,touch:pointerType==='touch',age:0,visible:p.x>=0&&p.x<=view.logicalWidth&&p.y>=0&&p.y<=H};
      updateShovelTarget(state.shovel);
    }
    function moveShovel(point,pointerType) {
      if(!state.shovel)holdShovel(point,pointerType);
      Object.assign(state.shovel,{x:point.x,y:point.y,touch:pointerType==='touch',visible:point.x>=0&&point.x<=view.logicalWidth&&point.y>=0&&point.y<=H});
      state.hover=null;state.hoverTime=0;updateShovelTarget(state.shovel);
    }
    function digAt(point) {
      const col=Math.floor((point.x-GRID.x)/GRID.w),row=Math.floor((point.y-GRID.y)/GRID.h);
      if(state.overlay||state.speedOpen||state.endlessGrowthOpen||game.status!=='playing'||!game.cellValid(row,col)||contains(localHUD.bank,point)||overSpeedPanel(point)||overEndlessGrowthControls(point))return false;
      const allowed=tutorial.allow('shovel',{row,col}),result=allowed.ok?game.shovel(row,col):allowed;
      if(!result.ok){notice(result.reason,1.25);sound('deny');return false;}
      state.shovelAction={x:point.x,y:point.y,row,col,age:0,duration:.28};
      state.selected=null;state.shovel=null;state.shovelGesture=null;state.held=null;state.hover=null;state.hoverTime=0;
      sound('shovel');return true;
    }
    function moveShovelGesture(gesture,point) {
      if(Math.hypot(point.x-gesture.x,point.y-gesture.y)*view.scale>=(gesture.pointerType==='touch'?12:6))gesture.active=true;
      moveShovel(point,gesture.pointerType);
    }
    function updateDragTarget(drag) {
      drag.col=Math.floor((drag.x-GRID.x)/GRID.w);drag.row=Math.floor((drag.y-GRID.y)/GRID.h);
      const allowed=tutorial.allow('place',{type:drag.type,row:drag.row,col:drag.col}),placement=allowed.ok?game.canPlace(drag.type,drag.row,drag.col):allowed;
      drag.valid=!state.overlay&&!state.speedOpen&&!state.endlessGrowthOpen&&!contains(localHUD.bank,drag)&&!overSpeedPanel(drag)&&!overEndlessGrowthControls(drag)&&placement.ok;
      drag.reason=placement.reason||null;
    }
    function holdSeed(type,point,pointerType) {
      const size=actorSize(type);
      const p=point||{x:localHUD.cardX+localHUD.cardW/2+Math.max(0,state.deck.indexOf(type))*localHUD.cardStep,y:localHUD.cardY+localHUD.cardH+size*.5};
      state.held={type,x:p.x,y:p.y,row:null,col:null,valid:false,touch:pointerType==='touch',age:0,visible:p.x>=0&&p.x<=view.logicalWidth&&p.y>=0&&p.y<=H};
      updateDragTarget(state.held);return state.held;
    }
    function moveHeld(point,pointerType) {
      const held=state.held||holdSeed(state.selected,point,pointerType);
      held.x=point.x;held.y=point.y;held.touch=pointerType==='touch';
      state.hover=null;state.hoverTime=0;
      held.visible=point.x>=0&&point.x<=view.logicalWidth&&point.y>=0&&point.y<=H;
      updateDragTarget(held);
    }
    function updateDragPoint(drag,point) {
      drag.x=point.x;drag.y=point.y;
      // Screen-space slop stays usable on a scaled phone canvas. A finger has
      // more natural jitter than a mouse, but a deliberate drag is immediate.
      if(!drag.active&&Math.hypot(point.x-drag.startX,point.y-drag.startY)*view.scale>=(drag.touch?12:6)){drag.active=true;state.held=null;state.hover=null;state.hoverTime=0;}
      updateDragTarget(drag);
    }
    function collectSuns(suns,automatic=false) {
      let collected=false;
      for(const found of suns){
        const result=game.collectSun(found.id);
        if(result.ok){sunCollection.add({id:found.id,x:GRID.x+found.x*GRID.w,y:GRID.y+found.y*GRID.h,value:result.value,blockPlant:!automatic});collected=true;}
      }
      if(collected&&(!automatic||state.age-state.autoSunSoundAt>=.18)){sound('sun');if(automatic)state.autoSunSoundAt=state.age;}return collected;
    }
    function sweepSuns(point) {
      const sweep=state.sunSweep;if(!sweep)return;
      if(!state.overlay&&!state.speedOpen&&!state.endlessGrowthOpen&&!overSpeedPanel(point)&&!overEndlessGrowthControls(point)&&game.status==='playing'&&point.x>=0&&point.x<=view.logicalWidth&&point.y>=localHUD.bank.h&&point.y<=H){
        const hits=collectionApi.findSunsOnSegment(game.suns,sweep.point,point,GRID,sweep.pointerType,view.scale);
        collectSuns(hits);
      }
      sweep.point=point;
    }
    function handleTouch(event) {
      if(threadedTask)return false;
      if(disposed)return false;const touch=eventTouch(event),p=logicalPoint(touch);if(!p)return false;
      if(state.plantTooltip)return false;
      if(state.upgradePress)return false;
      if(state.shovelGesture){
        if(state.shovelGesture.identifier===null&&touchId(touch)===null&&!state.shovelGesture.active)state.shovelGesture=null;
        else return false;
      }
      if(state.sunSweep){
        if(state.sunSweep.identifier===null&&touchId(touch)===null)state.sunSweep=null;
        else return false;
      }
      if(state.drag){
        // Keep the original public press-only helper usable without inventing
        // releases for actual native pointers, which always carry identifiers.
        if(state.drag.identifier===null&&touchId(touch)===null&&!state.drag.active)cancelDrag(false);
        else return false;
      }
      if(p.x<0||p.x>view.logicalWidth||p.y<0||p.y>H)return false;unlock();
      const pointerType=touch.pointerType||event.pointerType||'touch';
      state.pointer={x:p.x,y:p.y,pointerType};
      const button=buttons.slice().reverse().find(b=>contains(b,p));
      if(state.speedOpen&&(!button||!button.id.startsWith(state.speedOpen+'-'))){
        // Dismissal consumes the whole press so an equipped seed/shovel cannot
        // act on the lawn hidden under the selector or on the outside click.
        if(!contains(speedPanelRect(state.speedOpen),p))state.speedOpen=false;
        render();return true;
      }
      if(state.endlessGrowthOpen&&(!button||!button.id.startsWith('endless-growth-'))){
        // Closing a popup is its own gesture: never plant, dig, collect a sun,
        // or activate a control through the panel or on the dismissal click.
        if(!contains(GROWTH_PANEL,p))state.endlessGrowthOpen=false;
        render();return true;
      }
      if(button){
        if(button.id==='upgrade-buy'&&state.overlay==='upgrades'){state.upgradePress={identifier:touchId(touch),type:state.upgrades.selected,x:button.x,y:button.y,w:button.w,h:button.h};render();return true;}
        const type=button.id.slice(0,6)==='plant-'?button.id.slice(6):null,previousSelected=state.selected;
        state.buttonPulse={id:button.id,age:0};
        if(type)state.cardPress={type,age:0,point:p,identifier:touchId(touch)};
        const accepted=button.fn();
        if(button.id==='shovel'&&state.selected==='shovel'&&game.status==='playing'&&!state.overlay){
          holdShovel(pointerType==='touch'?{x:button.x+button.w/2,y:button.y+button.h+58}:p,pointerType);
          state.shovelGesture={identifier:touchId(touch),x:p.x,y:p.y,pointerType,active:false};
        }
        if(accepted!==false&&type&&engine.PLANTS[type]&&game.status==='playing'&&!state.overlay){
          holdSeed(type,pointerType==='touch'?{x:button.x+button.w/2,y:button.y+button.h+actorSize(type)*.5}:p,pointerType);
          state.drag={type,identifier:touchId(touch),previousSelected,active:false,startX:p.x,startY:p.y,x:p.x,y:p.y,row:null,col:null,valid:false,touch:pointerType==='touch'};
          updateDragTarget(state.drag);
        }
        render();return true;
      }
      if(state.overlay||game.status!=='playing')return false;
      if(mobileLayout&&state.mobileTools){state.mobileTools=false;render();return true;}
      if(challenges.state){const col=Math.floor((p.x-GRID.x)/GRID.w),row=Math.floor((p.y-GRID.y)/GRID.h);if(game.cellValid(row,col)){challengeAction(row,col);return true;}return false;}
      if(state.selected==='shovel')moveShovel(p,pointerType);
      const found=collectionApi.findSun(game.suns,p,GRID,pointerType,view.scale);
      if(found){
        collectSuns([found]);
        state.sunSweep={identifier:touchId(touch),pointerType,point:p};
        render();return true;
      }
      // A quick repeat press at a sun's old position must not plant underneath it.
      // Existing suns get first refusal, so neighbouring suns remain collectible.
      if(sunCollection.blocksPlant(p,pointerType,view.scale)){state.sunSweep={identifier:touchId(touch),pointerType,point:p};render();return true;}
      if(contains(localHUD.bank,p)||overSpeedPanel(p)||overEndlessGrowthControls(p))return true;
      if(state.selected==='shovel'){digAt(p);render();return true;}
      if(engine.PLANTS[state.selected])moveHeld(p,pointerType);
      const col=Math.floor((p.x-GRID.x)/GRID.w),row=Math.floor((p.y-GRID.y)/GRID.h);
      if(game.cellValid(row,col)){
        if(game.isEndless&&!state.selected){const occupant=game.plants.find(plant=>plant.row===row&&plant.col===col)||game.getSupport(row,col);if(occupant)return openUpgrades(occupant.type);}
        state.hover={row,col};state.hoverTime=.7;let result;
        if(state.selected)result=placeGuided(state.selected,row,col);else result={ok:false,reason:'先点击顶部种子包选择伙伴。'};
        if(!result.ok){notice(result.reason,1.25);if(state.selected)sound('deny');}else {
          sound('plant');state.selected=null;state.held=null;
        }render();return true;
      }return false;
    }
    function handleTouchMove(event) {
      if(disposed)return false;
      if(state.cardPress){const p=logicalPoint(eventTouch(event,state.cardPress.identifier,true));if(p&&Math.hypot(p.x-state.cardPress.point.x,p.y-state.cardPress.point.y)*view.scale>12)state.cardPress=null;}
      const pointer=eventTouch(event),position=logicalPoint(pointer);
      if(position)state.pointer={x:position.x,y:position.y,pointerType:pointer.pointerType||event.pointerType||'touch'};
      if(state.shovelGesture){
        const point=logicalPoint(eventTouch(event,state.shovelGesture.identifier,true));if(!point)return false;
        moveShovelGesture(state.shovelGesture,point);requestMoveRender();return true;
      }
      if(state.sunSweep){
        const point=logicalPoint(eventTouch(event,state.sunSweep.identifier,true));if(!point)return false;
        sweepSuns(point);requestMoveRender();return true;
      }
      if(state.overlay&&!state.drag){
        const point=logicalPoint(eventTouch(event)),button=point&&buttons.slice().reverse().find(b=>contains(b,point));
        const hovered=button?button.id:null;if(state.menuHover!==hovered){state.menuHover=hovered;requestMoveRender();}return !!button;
      }
      const drag=state.drag;
      if(drag){
        const point=logicalPoint(eventTouch(event,drag.identifier,true));if(!point)return false;
        updateDragPoint(drag,point);requestMoveRender();return true;
      }
      if(state.overlay||game.status!=='playing'||(!engine.PLANTS[state.selected]&&state.selected!=='shovel'))return false;
      const touch=eventTouch(event),pointerType=touch&&(touch.pointerType||event.pointerType),point=logicalPoint(touch);
      // Native touch moves belong to an active card gesture. Only a hovering
      // mouse or pen may carry a tapped seed without holding the button down.
      if(!point||(pointerType!=='mouse'&&pointerType!=='pen'))return false;
      if(state.selected==='shovel')moveShovel(point,pointerType);else moveHeld(point,pointerType);requestMoveRender();return true;
    }
    function requestMoveRender(){
      // Pointer devices can send several moves per display frame. Apply every
      // coordinate immediately, then paint only the latest one on the next RAF.
      if(options.autoStart===false||lastFrame===null)render();else renderRequested=true;
    }
    function handleTouchEnd(event) {
      if(disposed)return false;
      if(state.cardPress&&eventTouch(event,state.cardPress.identifier,true))state.cardPress=null;
      if(state.plantTooltip&&eventTouch(event,state.tooltipOwner,true)){state.plantTooltip=null;state.tooltipOwner=null;render();return true;}
      if(state.shovelGesture){
        const gesture=state.shovelGesture,point=logicalPoint(eventTouch(event,gesture.identifier,true));if(!point)return false;
        if(gesture.active||Math.hypot(point.x-gesture.x,point.y-gesture.y)*view.scale>=(gesture.pointerType==='touch'?12:6))moveShovelGesture(gesture,point);
        state.shovelGesture=null;
        if(gesture.active){
          const found=collectionApi.findSun(game.suns,point,GRID,gesture.pointerType,view.scale);
          if(found)collectSuns([found]);
          else if(!sunCollection.blocksPlant(point,gesture.pointerType,view.scale)){
            if(point.x<GRID.x||point.x>=GRID.x+GRID.cols*GRID.w||point.y<localHUD.bank.h||point.y>=GRID.y+GRID.rows*GRID.h)select(null);
            else digAt(point);
          }
        }
        render();return true;
      }
      if(state.sunSweep){
        const point=logicalPoint(eventTouch(event,state.sunSweep.identifier,true));if(!point)return false;
        const pointerType=state.sunSweep.pointerType;sweepSuns(point);state.sunSweep=null;
        if(engine.PLANTS[state.selected]&&(pointerType==='mouse'||pointerType==='pen'))moveHeld(point,pointerType);
        if(state.selected==='shovel'&&(pointerType==='mouse'||pointerType==='pen'))moveShovel(point,pointerType);
        render();return true;
      }
      if(state.upgradePress){
        const press=state.upgradePress,point=logicalPoint(eventTouch(event,press.identifier,true));if(!point)return false;
        state.upgradePress=null;
        if(!disposed&&state.overlay==='upgrades'&&state.upgrades.selected===press.type&&contains(press,point))buyUpgrade();else render();
        return true;
      }
      const drag=state.drag;if(disposed||!drag)return false;
      const point=logicalPoint(eventTouch(event,drag.identifier,true));if(!point)return false;
      updateDragPoint(drag,point);
      // Clear before mutating the game: a duplicate end has no transaction left.
      state.drag=null;
      if(drag.active){
        state.selected=null;state.held=null;
        let reason=drag.reason;
        if(drag.valid){
          const result=placeGuided(drag.type,drag.row,drag.col);
          if(result.ok){state.hover={row:drag.row,col:drag.col};state.hoverTime=.7;sound('plant');}
          else reason=result.reason;
        }
        if(reason&&game.cellValid(drag.row,drag.col)&&!contains(localHUD.bank,drag)&&!overEndlessGrowthControls(drag)){
          state.selected=drag.type;holdSeed(drag.type,point,drag.touch?'touch':'mouse');
          notice(reason,1.25);sound('deny');
        }else if(!drag.valid)sound('cancel');
      }else if(drag.previousSelected===drag.type){
        // Decide on release so a second press may still become a planting drag.
        // A plain second tap drops the held seed and its placement preview.
        select(null);state.hoverTime=0;
      }else if(state.held&&!drag.touch)moveHeld(point,'mouse');
      render();return true;
    }
    function handleTouchCancel(event) {
      if(state.cardPress&&(!event||eventTouch(event,state.cardPress.identifier,true)))state.cardPress=null;
      if(state.plantTooltip&&(!event||eventTouch(event,state.tooltipOwner,true))){state.plantTooltip=null;state.tooltipOwner=null;render();return true;}
      if(state.shovelGesture){if(event&&!eventTouch(event,state.shovelGesture.identifier,true))return false;clearShovel();render();return true;}
      if(state.sunSweep){if(event&&!eventTouch(event,state.sunSweep.identifier,true))return false;state.sunSweep=null;render();return true;}
      if(state.upgradePress){if(event&&!eventTouch(event,state.upgradePress.identifier,true))return false;state.upgradePress=null;render();return true;}
      if(disposed)return false;
      if(!state.drag){if(state.shovel){clearShovel();render();return true;}return false;}
      if(event&&event.changedTouches&&event.changedTouches.length&&!eventTouch(event,state.drag.identifier,true))return false;
      if(event&&!event.changedTouches&&(event.identifier!==undefined||event.pointerId!==undefined)&&touchId(event)!==state.drag.identifier)return false;
      cancelDrag();render();return true;
    }
    function bind(on,off,fn){if(options.visualReplica!==true&&typeof platform[on]==='function'){platform[on](fn);unsub.push(()=>{if(typeof platform[off]==='function')platform[off](fn);});}}
    bind('onTouchStart','offTouchStart',handleTouch);
    bind('onTouchMove','offTouchMove',handleTouchMove);
    bind('onTouchEnd','offTouchEnd',handleTouchEnd);
    bind('onTouchCancel','offTouchCancel',handleTouchCancel);
    bind('onHide','offHide',()=>{burnedWarmRequest=null;invalidatePeriodicCheckpoint();saveEndless();appHidden=true;if(state.overlay==='upgrades'){state.upgrades.resumeOnClose=false;state.upgrades.returnOverlay='pause';}if(state.overlay==='achievements'&&state.achievements.resumeOnClose){state.achievements.resumeOnClose=false;state.achievements.returnOverlay='pause';}pause();Object.values(audio).forEach(a=>{if(a.pause)a.pause();});render();});
    bind('onShow','offShow',event=>{imageLoader.tick();imageLoader.retryFailed();appHidden=false;lastFrame=null;state.sidebarPending=false;if(event&&event.launch_from==='homepage'&&event.location==='sidebar_card')notice('欢迎从侧边栏回到花园。');resize();});
    bind('onWindowResize','offWindowResize',resize);
    function frame(now){if(disposed)return;const stamp=Number.isFinite(now)?now:Date.now();const dt=lastFrame===null?0:Math.max(0,(stamp-lastFrame)/1000);lastFrame=stamp;tick(dt,!threadedActive()?(dt>0?startupHandoffEpoch(now,true):startupHandoffEpoch(undefined,false)):undefined);rafId=platform.requestAnimationFrame(frame);}
    function destroy(){invalidatePeriodicCheckpoint();pendingStaticWarmup=null;if(threadedActive()&&!threadedSaveDepth)return withThreadCheckpoint(()=>destroy(),true);if(simulation)simulation.destroy();if(visualRenderer)visualRenderer.destroy();if(options.visualReplica!==true){processEvents();achievements.flush();saveEndlessRun({silent:true});saveEndless();}cancelDrag();state.held=null;sunCollection.reset();clearSurfaceCache(terrainCache);clearSurfaceCache(mapPreviewCache);clearSurfaceCache(materialCache);clearSurfaceCache(levelBadgeCache);clearSurfaceCache(actorShadowCache);clearSurfaceCache(actorBarCache);clearSurfaceCache(actorAccentCache);if(lilyRenderer.clearCache)lilyRenderer.clearCache();fixedHUDImageCache.clear();separateToastLabelCache.dispose();releaseSceneImages();imageLoader.dispose();disposed=true;if(deferredScene)deferredScene.cancel();deferredScene=null;sceneForeground=null;ctx=mainContext;hideStaticTerrain();staticTerrainRecord=null;if(platform.disposeStaticTerrain)platform.disposeStaticTerrain();if(platform.disposeMotionScene)platform.disposeMotionScene();syncMusic();syncFuse();Object.values(musicSlots).forEach(slot=>{if(slot.context&&slot.context.destroy)slot.context.destroy();});if(rafId!==null&&platform.cancelAnimationFrame)platform.cancelAnimationFrame(rafId);unsub.forEach(fn=>fn());Object.values(audio).forEach(a=>{if(a.destroy)a.destroy();});}
    resize();ready.then(()=>{if(!disposed&&options.visualReplica!==true)render();});
    if(options.visualReplica!==true&&typeof platform.checkScene==='function'&&typeof platform.navigateToScene==='function'){
      try{platform.checkScene({scene:'sidebar',success:result=>{if(!disposed){state.sidebarAvailable=!!(result&&result.isExist);render();}},fail:()=>{state.sidebarAvailable=false;}});}catch(_){}
    }
    if(options.visualReplica!==true&&options.autoStart!==false){if(typeof platform.requestAnimationFrame!=='function')throw new Error('platform.requestAnimationFrame() is required unless autoStart is false.');rafId=platform.requestAnimationFrame(frame);}
    return {getDeviceBackgroundCacheState:deviceBackgroundCache.state,getSeparateToastLabelCacheState:separateToastLabelCache.state,getFixedHUDImageCacheState:fixedHUDImageCache.state,game,canvas,ready,applyVisualFrame,openAchievements,closeAchievements,setAchievementFilter,setAchievementCategory,setAchievementPage,chooseStrategyReward,openStrategySummary,retryAssets,getAssetStatus:()=>imageLoader.snapshot(),getSimulationState:()=>simulation?simulation.state():{active:false,status:'local'},skipTutorial:()=>{const result=tutorial.skip();render();return result;},start,openChallenges,startChallenge,challengeAction,selectChallengeCard:id=>{const ok=challenges.select(id);render();return ok;},openSaves,closeSaves,saveSlot,loadSlot,renameSlot,deleteSlot,exportSlot,importSlot,saveEndlessRun,saveAndHome,continueEndless,select,pause,resume,home,levels,openEndless,openUpgrades,closeUpgrades,prepare,selectMap,selectBoardSize,toggleDeck,openAlmanac,openAudioSettings,setRenderQuality,setMusicEnabled,setMusicVolume,setAutoCollectSun,setEndlessSpeed,setEndlessGrowthRate,setBattleSpeed:setEndlessSpeed,unlockAudio:unlock,back,tick,render,resize,handleTouch,handleTouchMove,handleTouchEnd,handleTouchCancel,destroy,getState:()=>({burnedWarmup:{...burnedWarmup},shieldWarmup:{...shieldWarmup,transform:shieldWarmup.transform&&{...shieldWarmup.transform}},staticWarmup:{...staticWarmup},simulation:simulation?simulation.state():{active:false,status:'local'},achievements:achievementState(),achievementToast:achievementToast?Object.assign({},achievementToast):null,achievementQueueCount:achievementQueue.length,strategy:runDirector?runDirector.summary(game.strategy):null,strategyPreview:strategyPlan(game.nextWaveIn!==null),status:game.status,tutorial:tutorial.getState(),overlay:state.overlay,challenge:challenges.state?JSON.parse(JSON.stringify(challenges.state)):null,challengeClears:Object.assign({},state.challengeClears),challengeBest:JSON.parse(JSON.stringify(state.challengeBest)),deckPage:state.deckPage,selected:state.selected,level:state.level,mapId:game.getMap().id,endlessMap:state.endlessMap,endlessBoardSize:state.endlessBoardSize,board:game.getBoard?Object.assign({},game.getBoard()):boardSize('classic'),grid:Object.assign({},GRID),pendingMapId:mapForLevel(levelInfo(state.level)).id,levelPage:state.levelPage,deck:state.deck.slice(),pendingDeck:state.pendingDeck.slice(),growth:JSON.parse(JSON.stringify(game.growth||{})),upgrades:Object.assign({},state.upgrades,{purchasePending:!!state.upgradePress,info:state.upgrades.selected&&game.getPlantUpgrade?game.getPlantUpgrade(state.upgrades.selected):null}),almanac:Object.assign({},state.almanac),clears:JSON.parse(JSON.stringify(state.clears)),endlessBest:Object.assign({},state.endlessBest),endlessSave:savedSummary(),autoHistory:JSON.parse(JSON.stringify(autoEntries)),lastSavedAt:autoEntries.length?autoEntries[0].savedAt:null,saveSlots:JSON.parse(JSON.stringify(slotEntries)),saves:{selected:state.saves.selected,page:state.saves.page,pageCount:SAVE_PAGE_COUNT,returnOverlay:state.saves.returnOverlay,pending:state.saves.pending,error:state.saves.error||slotReadError,confirm:state.saves.confirm?{action:state.saves.confirm.action,id:state.saves.confirm.id}:null},saveError:state.saveError,renderQuality:state.renderQuality,audio:state.audio,autoCollectSun:state.autoCollectSun,endlessSpeed:state.endlessSpeed,speedOpen:state.speedOpen,effectiveSpeed:effectiveSpeed(),endlessGrowthRate:game.endlessGrowthRate,endlessDifficulty:game.endlessDifficulty,endlessGrowthPreview:game.getEndlessGrowthPreview(),endlessGrowthOpen:state.endlessGrowthOpen,music:musicState(),wavePresentation:wavePresentation(),sidebarAvailable:state.sidebarAvailable,sunCollection:sunCollection.getState(),collecting:!!state.sunSweep,cardFeedback:state.cardFeedback?Object.assign({},state.cardFeedback):null,shovel:state.shovel?Object.assign({},state.shovel):null,shovelAction:state.shovelAction?Object.assign({},state.shovelAction):null,held:state.held?Object.assign({},state.held):null,drag:state.drag?{type:state.drag.type,active:state.drag.active,x:state.drag.x,y:state.drag.y,row:state.drag.row,col:state.drag.col,valid:state.drag.valid,reason:state.drag.reason}:null,mobileLayout,plantTooltip:state.plantTooltip||null,view:Object.assign({},view),buttons:buttons.map(b=>({id:b.id,x:b.x,y:b.y,w:b.w,h:b.h})),assetErrors:imageErrors.slice(),assetStatus:imageLoader.snapshot(),disposed})};
  }
  return {create,ASSET_FILES,SCENE_FILES,SCENE_THUMB_FILES,WIDTH:W,BATTLE_WIDTH,HEIGHT:H,GRID};
});
