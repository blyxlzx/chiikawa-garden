/* Closed original restore dependencies. The three public modules relay these
 * ordinary API objects; copying/wrapping or replacing a module cannot certify.
 * No proof token or copied checkpoint is exposed through this bootstrap. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenPreparedRestoreDependencies=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const runDirector=(()=>{const module={exports:{}};
/* Deterministic endless encounters and bounded, optional checkpoint metadata.
 * No assets, DOM, timers, RNG, storage or dependency on the game renderer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenRunDirector=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX=Number.MAX_SAFE_INTEGER;
  const safe=(n)=>Number.isFinite(n)&&n>=0&&n<=MAX;
  const whole=(n)=>safe(n)&&Number.isSafeInteger(n);
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const themes=[
    {id:'escort',name:'首领护卫队',roster:['anoko','helmet','healer','chimera','runner'],tip:'首领夹在护卫中，留爆发技能清掉援护。'},
    {id:'rush',name:'疾行突袭',roster:['runner','runner','pinkchimera','momonga'],tip:'疾行来客较多，先补控制与前排阻挡。'},
    {id:'armor',name:'重甲推进',roster:['helmet','anoko','helmet','momonga','runner'],tip:'厚甲来客推进较慢，持续输出比单点爆发更稳。'},
    {id:'support',name:'援护小队',roster:['drummer','momonga','anoko','healer','runner'],tip:'鼓手与治疗来客混编，范围攻击能一起压低血量。'},
    {id:'mixed',name:'多路包抄',roster:['pinkchimera','runner','chimera','momonga','anoko'],tip:'各路轮流施压，检查薄弱路线的火力。'}
  ];
  function createState(raw,options={}){
    const plantIds=Array.isArray(options.plantIds)?options.plantIds:[];
    const fresh={version:1,fromWave:Math.max(1,Math.floor(options.fromWave||1)),lastClaimed:Math.max(0,Math.floor((options.wavesCleared||0)/5)*5),pending:0,guardCharges:0,rewards:{supply:0,growth:0,defense:0},contributions:{},failure:null};
    for(const id of plantIds)fresh.contributions[id]={damage:0,kills:0};
    fresh.contributions.other={damage:0,kills:0};
    if(raw===undefined||raw===null)return fresh;
    if(!raw||raw.version!==1||!whole(raw.fromWave)||raw.fromWave<1||!whole(raw.lastClaimed)||raw.lastClaimed%5||!whole(raw.pending)||raw.pending%5||(raw.pending&&raw.pending<=raw.lastClaimed)||!whole(raw.guardCharges)||raw.guardCharges>3||!raw.rewards||!raw.contributions)throw Error('invalid strategy metadata');
    if(!['supply','growth','defense'].every(k=>whole(raw.rewards[k])))throw Error('invalid strategy rewards');
    const contributions={};
    for(const [key,value] of Object.entries(raw.contributions)){
      if(key!=='other'&&!plantIds.includes(key))throw Error('unknown strategy plant');
      if(!value||!safe(value.damage)||!whole(value.kills))throw Error('invalid strategy contribution');
      contributions[key]={damage:value.damage,kills:value.kills};
    }
    const f=raw.failure;
    if(f!==null&&(!f||!whole(f.row)||f.row>20||!whole(f.wave)||typeof f.enemyType!=='string'||f.enemyType.length>40||!whole(f.defenders)||f.defenders>1000||typeof f.mowerUsed!=='boolean'))throw Error('invalid strategy failure');
    return {...fresh,fromWave:raw.fromWave,lastClaimed:raw.lastClaimed,pending:raw.pending,guardCharges:raw.guardCharges,rewards:{supply:raw.rewards.supply,growth:raw.rewards.growth,defense:raw.rewards.defense},contributions:{...fresh.contributions,...contributions},failure:f?{row:f.row,wave:f.wave,enemyType:f.enemyType,defenders:f.defenders,mowerUsed:f.mowerUsed}:null};
  }
  function bossAt(index,count,bossCount){for(let i=0;i<bossCount;i++)if(index===Math.floor(i*count/bossCount))return true;return false;}
  function restoreState(raw,game,plantIds){
    const restored=createState(raw,{fromWave:game.wave+1,wavesCleared:game.wavesCleared,plantIds});
    if(restored.lastClaimed>game.wavesCleared||restored.fromWave>game.wave+1||
      (restored.pending&&(restored.pending!==game.wavesCleared||restored.pending!==game.wave||game.nextWaveIn===null)))throw Error('invalid strategy checkpoint');
    return restored;
  }
  function planWave(game,wave=game.wave,config=game.endlessWave){
    if(!config)return null;
    const active=!!game.strategy&&wave>=game.strategy.fromWave&&wave>5;
    const theme=themes[wave%5],available=new Set(config.types.filter(t=>t!=='boss'));
    const proposed=theme.roster.filter(t=>available.has(t));
    const roster=active&&proposed.length>=2?proposed:config.types.filter(t=>t!=='boss');
    // Opening waves retain their original exact cyclic type sequence.
    const strength=wave===game.wave?game.endlessDifficulty:game.nextEndlessDifficulty(wave);
    const opening=wave<=5&&config.wave===wave&&strength===wave;
    const sequence=opening?config.types:roster;
    const counts={};
    for(let i=0;i<sequence.length;i++){const amount=Math.floor(config.count/sequence.length)+(i<config.count%sequence.length?1:0);counts[sequence[i]]=(counts[sequence[i]]||0)+amount;}
    if(!opening)for(let i=0;i<config.bossCount;i++){
      const index=Math.floor(i*config.count/config.bossCount),previous=sequence[index%sequence.length];counts[previous]--;counts.boss=(counts.boss||0)+1;
    }
    const name=config.bossCount?'首领护卫队':active?theme.name:wave<3?'初次来访':wave<5?'混合来客':'首领讨伐';
    return {wave,count:config.count,roster,opening,sequence,bossCount:config.bossCount,counts,name,tip:active?theme.tip:'先稳定阳光收入，再照顾每条路线。',active};
  }
  function spawnType(plan,index,fallback){
    if(!plan||!plan.active)return fallback;
    return bossAt(index,plan.count,plan.bossCount)?'boss':plan.roster[index%plan.roster.length];
  }
  function offer(state,wave){
    if(!state||!whole(wave)||wave===0||wave%5||wave<=state.lastClaimed||state.pending)return false;
    state.pending=wave;return true;
  }
  function choices(state,game,deck=[]){
    if(!state||!state.pending)return [];
    const tier=Math.floor(state.pending/5),sun=150+Math.min(850,tier*25),xp=40+Math.min(360,tier*8);
    const count=[...new Set(deck)].filter(id=>own(game.growth||{},id)).length;
    return [{id:'supply',name:'阳光补给',value:sun,description:'立即获得 '+sun+' 阳光，方便补齐阵容。'},
      {id:'growth',name:'共同成长',value:xp,description:'每位伙伴 +'+xp+' 经验。已选的 '+count+' 位伙伴均可获得，同类一起成长。'},
      {id:'defense',name:'修复防线',value:1,description:'所有在场伙伴回复 35% 生命。'+(state.guardCharges<3?'再储备 1 辆应急割草机，突破时自动补位。':'应急割草机已满，改得 100 阳光。')}];
  }
  function applyChoice(state,id,game,deck=[]){
    const item=choices(state,game,deck).find(c=>c.id===id);
    if(!item||!game.isEndless||!['playing','paused'].includes(game.status)||state.pending!==game.wavesCleared)return {ok:false};
    const wave=state.pending;
    if(id==='supply')game.sun=Math.min(MAX,game.sun+item.value);
    else if(id==='growth'){for(const type of new Set(deck))if(own(game.growth||{},type))game.awardPlantXp(type,item.value,'strategyReward');}
    else {
      for(const plant of game.plants.concat(game.supports))if(plant.hp>0)plant.hp=Math.min(plant.maxHp,plant.hp+plant.maxHp*.35);
      if(state.guardCharges<3)state.guardCharges++;else game.sun=Math.min(MAX,game.sun+100);
    }
    state.rewards[id]=Math.min(MAX,state.rewards[id]+1);state.lastClaimed=wave;state.pending=0;
    return {ok:true,wave,id,name:item.name};
  }
  function rescueBreach(state,game,enemy,mower){
    if(!state||!game.isEndless||!state.guardCharges||!mower||!mower.used||mower.active||enemy.x>=.15)return false;
    state.guardCharges--;mower.used=false;mower.x=-.45;
    game.events.push({type:'strategyRescue',row:enemy.row});return true;
  }
  function recordDamage(state,type,damage,killed){
    if(!state||!safe(damage))return false;
    const key=type&&own(state.contributions,type)?type:'other',item=state.contributions[key];
    item.damage=Math.min(MAX,item.damage+damage);if(killed)item.kills=Math.min(MAX,item.kills+1);return true;
  }
  function recordFailure(state,enemy,game){
    if(!state||state.failure)return;
    state.failure={row:enemy.row,wave:game.wave,enemyType:enemy.type,defenders:game.plants.filter(p=>p.hp>0&&p.row===enemy.row).length,mowerUsed:!!(game.mowers[enemy.row]&&game.mowers[enemy.row].used)};
  }
  function summary(state){
    if(!state)return null;
    const plants=Object.entries(state.contributions).filter(([type])=>type!=='other').map(([type,v])=>({type,damage:Math.round(v.damage),kills:v.kills})).sort((a,b)=>b.damage-a.damage||b.kills-a.kills);
    return {plants,other:{...state.contributions.other},failure:state.failure?{...state.failure}:null,rewards:{...state.rewards},guardCharges:state.guardCharges,pending:state.pending,lastClaimed:state.lastClaimed};
  }
  function describe(plan,names={}){return plan?plan.name+' · '+Object.entries(plan.counts).filter(([,n])=>n>0).map(([type,n])=>(names[type]&&names[type].name||type)+'×'+n).join('、'):'';}
  return {createState,restoreState,planWave,spawnType,offer,choices,applyChoice,rescueBreach,recordDamage,recordFailure,summary,describe};
});

return module.exports;})();
  const sceneTerrain=(()=>{const module={exports:{}};
/* Registered terrain for the complete 1536 x 1024 endless illustrations.
 * Coordinates are authored against the original image, then normalized once.
 * A tile's rule comes from the same centre on which its occupants stand.
 * No painted pixels are replaced and no terrain is repeated on larger boards.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenSceneTerrain=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1, WIDTH=1536, HEIGHT=1024, PLANTING_ANCHOR_Y=.5;
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const polygon=(kind,points)=>({kind,points:points.map(p=>[p[0]/WIDTH,p[1]/HEIGHT])});
  const ellipse=(kind,x,y,rx,ry)=>polygon(kind,Array.from({length:16},(_,n)=>[x+Math.cos(n*Math.PI/8)*rx,y+Math.sin(n*Math.PI/8)*ry]));
  const river=[[847,209],[947,207],[957,241],[960,271],[981,302],[983,341],[983,441],[996,480],[1010,522],[1005,568],[1027,616],[1042,647],[1049,740],[1036,781],[1041,825],[1058,870],[1045,916],[1074,973],[1070,1024],[867,1024],[884,979],[867,938],[860,895],[875,852],[859,811],[850,777],[850,736],[835,690],[846,638],[855,608],[847,571],[856,527],[848,487],[853,450],[840,408],[848,345],[851,314],[835,270]];
  const pond=[[286,225],[431,210],[1306,212],[1379,271],[1413,416],[1426,649],[1374,870],[1290,931],[456,932],[276,863],[223,747],[225,487],[259,319]];
  const definitions={
    garden:{bounds:[256,224,1096,712],base:'grass',regions:[],description:'晴日下的开阔草坪，所有位置都能直接布阵。',tip:'所有格子都能种植；先在后排建立阳光收入。'},
    brook:{bounds:[256,224,1120,672],base:'grass',regions:[
      polygon('water',river),
      // The visible timber decks override the water, without including posts.
      polygon('bridge',[[831,349],[995,349],[1003,429],[828,429]]),
      polygon('bridge',[[834,644],[1040,644],[1053,737],[826,737]]),
      ...[[820,297,25,23],[823,470,25,22],[826,592,31,27],[826,778,21,21],[837,819,24,24],[825,912,39,28],[991,315,19,18],[1002,481,19,20],[1020,540,19,21],[1024,602,23,25],[1044,791,22,25],[1055,842,26,25],[1044,943,30,30]].map(p=>ellipse('rubble',...p))
    ],description:'浅溪从画面中央流过，两座真实木桥连接两岸。',tip:'蓝色水面先种荷叶；木桥可直接布阵。岸边石头不能种植，涉水来客移速降低 20%。'},
    ruins:{bounds:[304,224,1080,712],base:'grass',regions:[],description:'石门和断柱围绕外缘，遗迹中央是一整片可种植草坪。',tip:'中央所有格子均可种植；画面外围的遗迹不占用棋盘。'},
    frost:{bounds:[256,240,1096,680],base:'ice',regions:[],description:'整片霜白地面采用同一冰地规则，所有格子都能种植。',tip:'全场冰地使来客移速提高 18%；提前布置寒冰豌豆与守护伙伴。'},
    marsh:{bounds:[272,224,1148,672],base:'grass',regions:[
      polygon('mud',[[1257,317],[1303,302],[1341,308],[1377,328],[1382,357],[1353,383],[1307,387],[1261,374],[1230,350]]),
      polygon('water',[[1261,344],[1309,329],[1348,338],[1361,354],[1338,373],[1293,371],[1261,362]]),
      polygon('mud',[[1335,496],[1380,485],[1421,495],[1450,523],[1432,550],[1387,561],[1339,548],[1307,523]]),
      polygon('water',[[1361,515],[1392,507],[1421,517],[1428,532],[1409,546],[1373,543],[1348,531]]),
      polygon('mud',[[1355,821],[1390,806],[1430,810],[1460,828],[1468,854],[1427,874],[1378,868],[1345,847]]),
      polygon('water',[[1380,836],[1412,827],[1442,835],[1450,849],[1423,860],[1390,854],[1372,848]])
    ],description:'开阔草坪的右侧有几处小水洼，棋盘大小决定哪些落点经过水洼。',tip:'右侧泥地使来客移速降低 22%；落点在水面时，先种荷叶再放伙伴。'},
    rooftop:{bounds:[304,240,1056,680],base:'bed',regions:[],description:'整片屋顶花圃可自由布阵，天窗留在棋盘外。',tip:'所有格子均可直接种植，无需花盆；外围天窗不占用棋盘。'},
    lagoon:{bounds:[304,256,1056,624],base:'water',regions:[],waterOutline:pond,description:'晴光照亮整片荷塘，每一个落点都在水面。',tip:'每格先放 25 阳光的荷叶，再种伙伴；涉水来客移速降低 20%。'},
    moonpool:{bounds:[288,240,1088,680],base:'water',regions:[],waterOutline:[[280,225],[1326,211],[1397,284],[1424,442],[1426,802],[1365,937],[315,937],[231,833],[230,425]],description:'月光映在青石水庭中，所有落点都在幽蓝水面。',tip:'每格先放荷叶再种伙伴；月夜仍会落下阳光，涉水来客移速降低 20%。'},
    tidal:{bounds:[288,224,1088,680],base:'water',regions:[],waterOutline:[[284,195],[1394,185],[1430,282],[1420,449],[1415,703],[1349,919],[339,923],[216,844],[240,704],[258,513],[248,326]],description:'沙岸环抱蓝绿潮池，所有落点都在水面。',tip:'每格先放荷叶，再铺开水上防线；涉水来客移速降低 20%。'}
  };
  freeze(definitions);
  const identity=map=>typeof map==='string'?map:map&&map.id||'garden';
  const definition=map=>definitions[identity(map)]||definitions.garden;
  const SCENE_BOUNDS=freeze(Object.fromEntries(Object.entries(definitions).map(([id,d])=>[id,d.bounds])));
  function contains(points,x,y){
    let hit=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))hit=!hit;
    }
    return hit;
  }
  function sample(map,x,y){
    const d=definition(map);let kind=d.base;
    for(const region of d.regions)if(contains(region.points,x/WIDTH,y/HEIGHT))kind=region.kind;
    return kind;
  }
  function cellPoint(map,rows,cols,row,col){
    const b=definition(map).bounds;
    return {x:b[0]+(col+.5)*b[2]/cols,y:b[1]+(row+PLANTING_ANCHOR_Y)*b[3]/rows};
  }
  function createMap(base,board){
    const d=definition(base),rows=board.rows,cols=board.cols,counts={};
    const tiles=Array.from({length:rows},(_,row)=>Array.from({length:cols},(_,col)=>{
      const p=cellPoint(base,rows,cols,row,col),kind=sample(base,p.x,p.y);counts[kind]=(counts[kind]||0)+1;return kind;
    }));
    const tip=identity(base)==='marsh'&&!counts.water?'水洼集中在画面右侧；当前棋盘的泥地可种植，并使来客移速降低 22%。':d.tip;
    return freeze({...base,rows,cols,tiles,description:d.description,tip,sceneLayoutVersion:VERSION,plantingAnchorY:PLANTING_ANCHOR_Y,terrainCounts:counts});
  }
  function validRect(r){return r&&[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0;}
  function transform(map,width,height,options){
    const o=options||{},b=definition(map).bounds;
    let x,y,sx,sy;
    if(validRect(o.boardBounds)){
      sx=o.boardBounds.w/b[2];sy=o.boardBounds.h/b[3];x=o.boardBounds.x-b[0]*sx;y=o.boardBounds.y-b[1]*sy;
    }else if(validRect(o.sceneRect)){
      x=o.sceneRect.x;y=o.sceneRect.y;sx=o.sceneRect.w/WIDTH;sy=o.sceneRect.h/HEIGHT;
    }else{
      sx=sy=Math.max(width/WIDTH,height/HEIGHT);x=(width-WIDTH*sx)/2;y=(height-HEIGHT*sy)/2;
    }
    return {x,y,sx,sy,scale:Math.min(sx,sy),width:WIDTH*sx,height:HEIGHT*sy,sourceWidth:WIDTH,sourceHeight:HEIGHT};
  }
  function sceneGrid(map,width,height,options){
    const b=definition(map).bounds,t=transform(map,width,height,options),rows=map&&map.rows||5,cols=map&&map.cols||9;
    return {x:t.x+b[0]*t.sx,y:t.y+b[1]*t.sy,w:b[2]*t.sx/cols,h:b[3]*t.sy/rows,rows,cols,sceneTransform:t,plantingAnchorY:map&&map.sceneLayoutVersion===0?.9:PLANTING_ANCHOR_Y};
  }
  function transformForGrid(map,g){
    return g.sceneTransform||transform(map,0,0,{boardBounds:{x:g.x,y:g.y,w:g.w*g.cols,h:g.h*g.rows}});
  }
  function trace(ctx,points){ctx.moveTo(points[0][0]*WIDTH,points[0][1]*HEIGHT);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0]*WIDTH,points[i][1]*HEIGHT);ctx.closePath();}
  function waterRegions(map){
    const d=definition(map);
    return d.waterOutline?[polygon('water',d.waterOutline)]:d.regions.filter(r=>r.kind==='water');
  }
  /** Runs after the cached scene, before actors. Fixed work, no game RNG/state. */
  function drawAmbient(ctx,options){
    const o=options||{},map=o.map||'garden',g=o.grid;if(!g||o.reducedMotion||o.density===0)return;
    const t=transformForGrid(map,g),time=Number.isFinite(o.time)?o.time:0,id=identity(map),d=definition(map),water=waterRegions(map);
    const density=Number.isFinite(o.density)?Math.max(.15,Math.min(1,o.density)):1;
    ctx.save();ctx.translate(t.x,t.y);ctx.scale(t.sx,t.sy);
    if(water.length){
      ctx.save();ctx.beginPath();for(const r of water)trace(ctx,r.points);ctx.clip();
      const count=Math.ceil((d.base==='water'?24:18)*density);
      for(let n=0;n<count;n++){
        const phase=time*.62+n*2.39996;
        let x,y;
        if(id==='brook'){x=880+(n%3)*45+Math.sin(phase*.6)*6;y=245+(n/Math.max(1,count-1))*665+Math.sin(phase)*4;}
        else if(id==='marsh'){
          const spots=[[1304,351],[1390,528],[1410,846]],spot=spots[n%3];x=spot[0]+Math.sin(n*2.4)*30+Math.sin(phase)*3;y=spot[1]+Math.cos(n*2.4)*9;
        }else{x=350+(n%6)*186+Math.sin(n*1.7)*18+Math.sin(phase*.6)*6;y=310+Math.floor(n/6)*166+Math.cos(n*1.3)*12+Math.sin(phase)*4;}
        // Never draw ripples across a bridge or rock, even inside river clip.
        if(sample(map,x,y)!=='water'||sample(map,x+24,y)!=='water')continue;
        ctx.globalAlpha=.10+.06*Math.sin(phase);ctx.strokeStyle=id==='moonpool'?'#d9edff':'#eefbeb';ctx.lineWidth=1.8;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+12,y-2,x+26,y);ctx.moveTo(x+8,y+6);ctx.lineTo(x+17,y+6);ctx.stroke();
      }
      ctx.restore();
    }
    if(id==='frost'){
      ctx.fillStyle='#fffef7';
      for(let n=0;n<Math.ceil(12*density);n++){
        const x=300+(n*173%1040)+Math.sin(time*.27+n)*8,y=220+((n*157+time*9)%690);
        ctx.globalAlpha=.13+.11*(.5+.5*Math.sin(time*.6+n));ctx.beginPath();ctx.arc(x,y,1.3+(n%2)*.5,0,Math.PI*2);ctx.fill();
      }
    }
    if(id==='moonpool'||id==='marsh'){
      ctx.fillStyle='#ffe6a0';
      for(let n=0;n<Math.ceil(7*density);n++){
        const x=270+(n*199%1110)+Math.sin(time*.33+n*2)*6,y=(n%2?906:214)+Math.sin(time*.4+n)*10;
        ctx.globalAlpha=.1+.25*Math.max(0,Math.sin(time*.7+n));ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }
  return {VERSION,WIDTH,HEIGHT,PLANTING_ANCHOR_Y,SCENE_BOUNDS,definitions,definition,sample,cellPoint,createMap,transform,sceneGrid,transformForGrid,drawAmbient};
});

return module.exports;})();
  const autosave=(()=>{const module={exports:{}};
/* Three validated automatic checkpoints. The six manual slots remain separate. */
(function(root,factory){
  const api=factory();
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

return module.exports;})();
  const descriptor=Object.getOwnPropertyDescriptor,ownKeys=Reflect.ownKeys;
  const originals=[runDirector,sceneTerrain,autosave].map(api=>({api,prototype:Object.getPrototypeOf(api),keys:ownKeys(api),descriptors:ownKeys(api).map(key=>descriptor(api,key))}));
  function certifies(index,value){
    const proof=originals[index];if(value!==proof.api||Object.getPrototypeOf(value)!==proof.prototype)return false;
    const keys=ownKeys(value);if(keys.length!==proof.keys.length)return false;
    for(let i=0;i<keys.length;i++){
      const a=descriptor(value,keys[i]),b=proof.descriptors[i];
      if(keys[i]!==proof.keys[i]||!a||a.value!==b.value||a.get!==b.get||a.set!==b.set||a.writable!==b.writable||a.enumerable!==b.enumerable||a.configurable!==b.configurable)return false;
    }
    return true;
  }
  return Object.freeze({runDirector,sceneTerrain,autosave,certifiesDirector:value=>certifies(0,value),certifiesTerrain:value=>certifies(1,value),certifiesAutosave:value=>certifies(2,value)});
});
