/* Registered terrain for the complete 1536 x 1024 endless illustrations.
 * Coordinates are authored against the original image, then normalized once.
 * A tile's rule comes from the same centre on which its occupants stand.
 * No painted pixels are replaced and no terrain is repeated on larger boards.
 */
(function(root,factory){
  const dependencies=typeof module==='object'&&module.exports?require('./prepared-restore-dependencies.js'):root.GardenPreparedRestoreDependencies;
  const api=dependencies?dependencies.sceneTerrain:factory();
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
