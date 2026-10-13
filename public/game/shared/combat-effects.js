/* Shared, visual-only attacks. All clocks come from the game, so pause freezes them. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenCombatEffects=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PEA_RADIUS=16,PUFF_LIFE=.66,PUFF_DELAY=.038,PUFF_COUNT=9;
  const FUME_DURATION=PUFF_LIFE+PUFF_DELAY*(PUFF_COUNT-1);
  const ATTACK_CUE_DURATION=.20,ENEMY_IMPACT_DURATION=.13;
  const DRAW_LIMITS=Object.freeze({attackCues:48,projectiles:256,fumeStreams:24,plantSamples:256});
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const cellScale=grid=>Math.min(grid.w/128,grid.h/160);
  function rowAnchorDelta(grid){return (Number.isFinite(grid.plantingAnchorY)?grid.plantingAnchorY:.9)-.9;}
  const validGrid=grid=>grid&&[grid.x,grid.y,grid.w,grid.h].every(Number.isFinite)&&grid.w>0&&grid.h>0;
  function scaleAround(ctx,x,y,scale){
    if(scale===1)return;
    ctx.translate(x,y);ctx.scale(scale,scale);ctx.translate(-x,-y);
  }
  function boardSize(grid,game){
    const board=game&&typeof game.getBoard==='function'?game.getBoard():null;
    const dimension=(key,fallback)=>Number.isSafeInteger(grid[key])&&grid[key]>0?grid[key]:board&&Number.isSafeInteger(board[key])&&board[key]>0?board[key]:fallback;
    return {cols:dimension('cols',9),rows:dimension('rows',5)};
  }
  function oval(ctx,x,y,rx,ry,fill){
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
  }
  function drawPea(ctx,x,y,age=0,ice=false){
    if(![x,y,age].every(Number.isFinite)||age<0)return;
    const r=PEA_RADIUS;
    ctx.save();
    oval(ctx,x-6,y+55,r*.9,4,'rgba(39,70,22,.15)');
    // Small speed strokes keep the silhouette round and readable on the grass.
    if(age>.025){
      const phase=age%1,stretch=Math.min(1,age/.10);
      ctx.lineCap='round';ctx.lineWidth=7;ctx.strokeStyle=ice?'rgba(141,224,254,.22)':'rgba(158,212,65,.18)';
      ctx.beginPath();ctx.moveTo(x-r+3,y);ctx.lineTo(x-r-31*stretch,y);ctx.stroke();
      ctx.lineWidth=3;ctx.strokeStyle=ice?'rgba(220,251,255,.85)':'rgba(235,255,169,.75)';
      ctx.beginPath();ctx.moveTo(x-r-4,y-4);ctx.lineTo(x-r-22*stretch,y-4);ctx.stroke();
      ctx.lineWidth=2;ctx.strokeStyle=ice?'rgba(165,231,255,.55)':'rgba(218,249,143,.44)';
      ctx.beginPath();ctx.moveTo(x-r-5,y+6);ctx.lineTo(x-r-15*stretch,y+6);ctx.stroke();
      if(ice){
        for(let i=0;i<3;i++){
          const drift=(phase*5+i*.34)%1,tx=x-r-7-drift*25,ty=y+(i%2?1:-1)*(8+drift*5);
          ctx.save();ctx.globalAlpha*=(1-drift)*.65;ctx.strokeStyle='#e4fbff';ctx.lineWidth=1.3;
          ctx.beginPath();ctx.moveTo(tx-2,ty);ctx.lineTo(tx+2,ty);ctx.moveTo(tx,ty-2);ctx.lineTo(tx,ty+2);ctx.stroke();ctx.restore();
        }
      }
    }
    const color=ctx.createRadialGradient(x-r*.36,y-r*.42,1,x,y,r);
    color.addColorStop(0,ice?'#f0ffff':'#e3fa8d');color.addColorStop(.42,ice?'#b5edff':'#b9e454');
    color.addColorStop(.78,ice?'#65c4ec':'#87c735');color.addColorStop(1,ice?'#3b90b7':'#5d9d26');
    oval(ctx,x,y,r,r,color);ctx.strokeStyle=ice?'#315c77':'#345c1d';ctx.lineWidth=2.6;ctx.stroke();
    oval(ctx,x-r*.34,y-r*.4,5.5,3.7,ice?'#ffffff':'#f6ffd2');
    oval(ctx,x+r*.32,y+r*.4,4.3,2.1,ice?'rgba(40,125,170,.4)':'rgba(90,145,36,.4)');
    if(ice){ctx.strokeStyle='#f1ffff';ctx.lineWidth=1.6;for(let i=0;i<3;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(x-Math.cos(a)*6,y-Math.sin(a)*6);ctx.lineTo(x+Math.cos(a)*6,y+Math.sin(a)*6);ctx.stroke();}}
    ctx.restore();
  }
  function sampleFume(age,range=410){
    if(!Number.isFinite(age)||age<0||age>=FUME_DURATION||!Number.isFinite(range)||range<=0)return [];
    const puffs=[];
    for(let index=0;index<PUFF_COUNT;index++){
      const life=age-index*PUFF_DELAY;if(life<0||life>=PUFF_LIFE)continue;
      const phase=life/PUFF_LIFE;
      puffs.push({index,phase,x:phase*Math.max(0,range-32),
        y:Math.sin(index*2.1+phase*4.5)*(3+phase*7),
        radius:10+22*Math.sin(phase*Math.PI/2),
        alpha:.82*Math.min(1,life/.035)*(1-smooth((phase-.60)/.40))});
    }
    return puffs;
  }
  let puffPaths=null,puffPathType=null;
  function cachedPuffPaths(){
    const Type=typeof globalThis==='object'?globalThis.Path2D:null;
    if(typeof Type!=='function')return null;
    if(puffPaths&&puffPathType===Type)return puffPaths;
    try{
      const outline=new Type(),curl=new Type();
      outline.moveTo(-1,.18);
      outline.bezierCurveTo(-1.24,-.25,-.72,-.62,-.40,-.50);
      outline.bezierCurveTo(-.4,-1.02,.25,-1.08,.49,-.61);
      outline.bezierCurveTo(1.06,-.74,1.35,-.13,.96,.15);
      outline.bezierCurveTo(1.16,.64,.46,.9,.14,.57);
      outline.bezierCurveTo(-.35,.97,-1.02,.73,-1,.18);outline.closePath();
      curl.moveTo(-.49,-.1);curl.bezierCurveTo(-.27,-.65,.49,-.51,.56,-.12);
      curl.bezierCurveTo(.63,.20,.21,.29,.1,.09);
      puffPathType=Type;puffPaths={outline,curl};return puffPaths;
    }catch(_){return null;}
  }
  function puff(ctx,x,y,r,alpha,index){
    // Reuse vector geometry while retaining the exact radius, alpha, colors,
    // stroke widths and draw order. Unusual dashed contexts keep the old path.
    const paths=r>0&&Number.isFinite(r)&&(!ctx.getLineDash||ctx.getLineDash().length===0)?cachedPuffPaths():null;
    if(paths){
      ctx.save();ctx.translate(x,y);ctx.scale(r,r);ctx.globalAlpha*=alpha;
      ctx.fillStyle=index%2?'#b784d4':'#c097df';ctx.fill(paths.outline);
      ctx.strokeStyle='rgba(99,55,138,.34)';ctx.lineWidth=1.8/r;ctx.stroke(paths.outline);
      ctx.lineCap='round';ctx.lineWidth=Math.max(2,r*.10)/r;ctx.strokeStyle='#ead5f5';ctx.stroke(paths.curl);
      ctx.restore();return;
    }
    ctx.save();ctx.translate(x,y);ctx.globalAlpha*=alpha;
    // Scalloped vapor, with a pale inner curl, rather than individual round bullets.
    ctx.beginPath();ctx.moveTo(-r,.18*r);
    ctx.bezierCurveTo(-1.24*r,-.25*r,-.72*r,-.62*r,-.40*r,-.50*r);
    ctx.bezierCurveTo(-.4*r,-1.02*r,.25*r,-1.08*r,.49*r,-.61*r);
    ctx.bezierCurveTo(1.06*r,-.74*r,1.35*r,-.13*r,.96*r,.15*r);
    ctx.bezierCurveTo(1.16*r,.64*r,.46*r,.9*r,.14*r,.57*r);
    ctx.bezierCurveTo(-.35*r,.97*r,-1.02*r,.73*r,-r,.18*r);
    ctx.closePath();ctx.fillStyle=index%2?'#b784d4':'#c097df';ctx.fill();
    ctx.strokeStyle='rgba(99,55,138,.34)';ctx.lineWidth=1.8;ctx.stroke();
    ctx.beginPath();ctx.moveTo(-.49*r,-.1*r);
    ctx.bezierCurveTo(-.27*r,-.65*r,.49*r,-.51*r,.56*r,-.12*r);
    ctx.bezierCurveTo(.63*r,.20*r,.21*r,.29*r,.1*r,.09*r);
    ctx.lineCap='round';ctx.lineWidth=Math.max(2,r*.10);ctx.strokeStyle='#ead5f5';ctx.stroke();
    ctx.restore();
  }
  function drawFume(ctx,x,y,age,range=410,scale=1){
    const puffs=sampleFume(age,range/scale);if(!puffs.length)return;
    ctx.save();scaleAround(ctx,x,y,scale);
    for(const p of puffs){
      if(p.alpha<=0)continue;
      puff(ctx,x+p.x,y+p.y,p.radius,p.alpha,p.index);
      if(p.phase>.14){
        const spread=7+p.phase*21;
        oval(ctx,x+p.x-8,y+p.y-spread,2.3,2.3,'rgba(230,198,250,'+(p.alpha*.65)+')');
        oval(ctx,x+p.x+6,y+p.y+spread,1.8,1.8,'rgba(222,178,245,'+(p.alpha*.5)+')');
      }
    }
    ctx.restore();
  }
  function muzzle(plant,grid,motion){
    if(motion&&typeof motion.poseFor==='function'&&typeof motion.attachmentPoint==='function'){
      const definition=motion.definitions&&motion.definitions.mushroom;
      const size=(definition&&Number.isFinite(definition.drawSize)&&definition.drawSize>0?definition.drawSize:134)*cellScale(grid);
      const point=motion.attachmentPoint('mushroom','muzzle',grid.x+plant.x*grid.w,grid.y+(plant.row+(.9)+rowAnchorDelta(grid))*grid.h,size,motion.poseFor(plant));
      if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y))return point;
    }
    return {x:grid.x+(plant.x+.36)*grid.w,y:grid.y+(plant.row+(.22)+rowAnchorDelta(grid))*grid.h};
  }
  function supportLift(game,plant,grid){
    const support=typeof game.getSupport==='function'?game.getSupport(plant.row,plant.col):null;
    return support&&support.hp>0?10*cellScale(grid):0;
  }
  function attackMuzzle(plant,grid,motion){
    if(plant.type==='mushroom')return muzzle(plant,grid,motion);
    if(motion&&typeof motion.poseFor==='function'&&typeof motion.attachmentPoint==='function'){
      const definition=motion.definitions&&motion.definitions[plant.type];
      const size=(definition&&Number.isFinite(definition.drawSize)&&definition.drawSize>0?definition.drawSize:134)*cellScale(grid);
      const point=motion.attachmentPoint(plant.type,'muzzle',grid.x+plant.x*grid.w,grid.y+(plant.row+(.9)+rowAnchorDelta(grid))*grid.h,size,motion.poseFor(plant));
      if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y))return point;
    }
    return {x:grid.x+(plant.x+.3)*grid.w,y:grid.y+(plant.row+(.36)+rowAnchorDelta(grid))*grid.h};
  }
  function drawAttackCues(ctx,game,grid,motion){
    if(!validGrid(grid)||!game||!Number.isFinite(game.time))return 0;
    const plants=game.plants||[],stride=Math.max(1,Math.ceil(plants.length/DRAW_LIMITS.plantSamples)),size=cellScale(grid);
    let drawn=0;
    for(let index=0;index<plants.length&&drawn<DRAW_LIMITS.attackCues;index+=stride){
      const plant=plants[index];
      if(!(plant.hp>0)||!['pea','snowpea','repeater','starfruit','mushroom'].includes(plant.type)||![plant.x,plant.row,plant.lastShotAt].every(Number.isFinite))continue;
      // lastShotAt is set by the real fire marker, not by the wind-up or cloud cue.
      if(plant.lastShotAt<0||game.time>=plant.lastShotAt+ATTACK_CUE_DURATION)continue;
      const t=effectTime(game.time-plant.lastShotAt,ATTACK_CUE_DURATION);if(t===null)continue;
      const point=attackMuzzle(plant,grid,motion),lift=supportLift(game,plant,grid),x=point.x,y=point.y-lift;
      if(![x,y].every(Number.isFinite))continue;
      const ice=plant.type==='snowpea',spore=plant.type==='mushroom',star=plant.type==='starfruit';
      const spread=1-(1-t)*(1-t),color=ice?'#dafaff':spore?'#ecd4fa':star?'#fff0a5':'#eaf9b4';
      ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.globalAlpha*=1-smooth(t);
      ctx.lineCap='round';ctx.lineWidth=2.5*(1-t)+1;ctx.strokeStyle=color;
      ctx.beginPath();ctx.ellipse(4+spread*13,0,5+spread*8,9+spread*14,0,-Math.PI*.7,Math.PI*.7);ctx.stroke();
      ctx.lineWidth=1.5;ctx.beginPath();
      for(let i=0;i<3;i++){
        const sy=(i-1)*(7+spread*6),sx=8+spread*(13+i*3);
        ctx.moveTo(sx,sy);ctx.lineTo(sx+6*(1-t),sy+(i-1)*3);
      }
      ctx.stroke();
      if(ice||spore)for(let i=0;i<2;i++){
        if(spore)puff(ctx,8+spread*(13+i*8),(i?1:-1)*(6+spread*6),5+spread*6,.30*(1-t),i);
        else oval(ctx,6+spread*(13+i*10),(i?1:-1)*(7+spread*5),5+spread*7,3+spread*4,'rgba(168,233,252,.28)');
      }
      ctx.restore();drawn++;
    }
    return drawn;
  }
  function drawEnemyImpact(ctx,enemy,grid,motion){
    if(!validGrid(grid)||!enemy||!(enemy.hp>0)||![enemy.x,enemy.row,enemy.hitTimer].every(Number.isFinite)||enemy.hitTimer<=0)return false;
    const size=cellScale(grid),definition=motion&&motion.definitions&&motion.definitions[enemy.type];
    const actorSize=definition&&Number.isFinite(definition.drawSize)&&definition.drawSize>0?definition.drawSize:enemy.type==='boss'?212:enemy.type==='anoko'?170:145;
    const t=1-clamp(enemy.hitTimer/ENEMY_IMPACT_DURATION),fade=1-smooth(t),spread=1-(1-t)*(1-t);
    const x=grid.x+enemy.x*grid.w-actorSize*.16*size,y=grid.y+(enemy.row+(.9)+rowAnchorDelta(grid))*grid.h-actorSize*.46*size;
    if(![x,y].every(Number.isFinite))return false;
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.globalAlpha*=fade*.80;
    // A small contact on the leading shoulder leaves the face and silhouette clear.
    if(t<.48){ctx.save();ctx.globalAlpha*=1-t/.48;impactShape(ctx,0,0,10+spread*4,13+spread*3,'#fff4c8');ctx.restore();}
    ctx.lineCap='round';ctx.lineWidth=2.8*(1-t)+.8;ctx.strokeStyle=enemy.armor>0?'#e4eefc':'#f8e3a8';
    ctx.beginPath();
    for(let i=0;i<3;i++){
      const angle=Math.PI+(i-1)*.70,near=9+spread*7,far=near+5+spread*5;
      ctx.moveTo(Math.cos(angle)*near,Math.sin(angle)*near);ctx.lineTo(Math.cos(angle)*far,Math.sin(angle)*far);
    }
    ctx.stroke();ctx.restore();return true;
  }
  function drawProjectiles(ctx,game,grid,motion){
    if(!validGrid(grid)||!game)return;
    const size=cellScale(grid);
    const shots=game.projectiles||[],stride=Math.max(1,Math.ceil(shots.length/DRAW_LIMITS.projectiles));
    for(let index=0;index<shots.length;index+=stride){
      const p=shots[index];if(![p.x,p.row].every(Number.isFinite))continue;
      if(p.type==='pea'||p.type==='snowpea'){
        const x=grid.x+(p.x+.10)*grid.w,y=grid.y+(p.row+(.36)+rowAnchorDelta(grid))*grid.h;
        if(![x,y].every(Number.isFinite))continue;
        ctx.save();scaleAround(ctx,x,y,size);
        if(p.maxHits>1&&Number.isFinite(p.maxHits)){
          ctx.save();ctx.strokeStyle='#deefa3';ctx.lineWidth=2;ctx.lineCap='round';
          for(let i=0;i<Math.min(2,p.maxHits-1);i++){ctx.beginPath();ctx.moveTo(x-30-i*11,y-7);ctx.lineTo(x-24-i*11,y);ctx.lineTo(x-30-i*11,y+7);ctx.stroke();}ctx.restore();
        }
        drawPea(ctx,x,y,p.age,p.type==='snowpea');
        if(p.freeze||p.splash){ctx.save();if(p.freeze)frostMark(ctx,x,y,12);else{ctx.strokeStyle='#fff3c1';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,20,0,Math.PI*2);ctx.stroke();}ctx.restore();}
        ctx.restore();
      }
    }
    // The short-lived collision projectile can disappear on contact; the emitted
    // vapor keeps dissipating naturally using the plant's original cloud clock.
    const plants=game.plants||[],plantStride=Math.max(1,Math.ceil(plants.length/DRAW_LIMITS.plantSamples));let fumes=0;
    for(let index=0;index<plants.length&&fumes<DRAW_LIMITS.fumeStreams;index+=plantStride){
      const plant=plants[index];
      if(plant.type!=='mushroom'||!(plant.cloudAge>=0))continue;
      if(![plant.x,plant.row,plant.cloudAge].every(Number.isFinite)||plant.cloudAge>=FUME_DURATION)continue;
      const point=muzzle(plant,grid,motion),y=point.y-supportLift(game,plant,grid);
      if(![point.x,y].every(Number.isFinite))continue;
      drawFume(ctx,point.x,y,plant.cloudAge,3.2*grid.w,size);fumes++;
    }
  }
  function drawIceHit(ctx,x,y,t,splash,size=1){
    const spread=1-(1-t)*(1-t),scale=(splash?.72:1)*size;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha*=1-smooth(t);
    // A crisp contact flash, an expanding cold ring and angular fragments read
    // as ice breaking. These are game-clock driven, so pausing holds the burst.
    if(t<.3){
      ctx.save();ctx.globalAlpha*=1-t/.3;
      impactShape(ctx,0,0,24+spread*10,25+spread*8,'#edffff');ctx.restore();
    }
    const radius=10+spread*41;
    ctx.strokeStyle='#6bd8ff';ctx.lineWidth=4*(1-t)+1;
    ctx.beginPath();ctx.ellipse(0,0,radius,radius*.84,0,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#e6ffff';ctx.lineWidth=1.8;
    ctx.beginPath();ctx.ellipse(0,0,radius*.88,radius*.74,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+.18,dist=11+spread*(i%2?46:36);
      const length=(i%2?10:8)*(1-.45*t),width=length*.42;
      ctx.save();ctx.translate(Math.cos(a)*dist,Math.sin(a)*dist*.88+7*t*t);ctx.rotate(a+t*(i%2?.5:-.5));
      ctx.beginPath();ctx.moveTo(length,0);ctx.lineTo(0,width);ctx.lineTo(-length*.7,0);ctx.lineTo(0,-width);ctx.closePath();
      ctx.fillStyle=i%2?'#c9f8ff':'#83dcff';ctx.fill();ctx.lineWidth=1.3;ctx.strokeStyle='#3e9dc9';ctx.stroke();
      ctx.beginPath();ctx.moveTo(-length*.4,0);ctx.lineTo(length*.75,0);ctx.strokeStyle='#f4ffff';ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
    }
    if(t<.65){ctx.save();ctx.globalAlpha*=1-t/.65;frostMark(ctx,0,0,11+spread*4);ctx.restore();}
    ctx.restore();
  }
  function drawHit(ctx,e,grid){
    if(e.type!=='hit'||!['pea','snowpea','spore'].includes(e.projectileType))return false;
    const t=effectTime(e.age,e.duration);if(t===null||!validGrid(grid)||![e.x,e.row].every(Number.isFinite))return true;
    const spore=e.projectileType==='spore';
    const x=grid.x+e.x*grid.w,y=grid.y+(e.row+((spore?.22:.36))+rowAnchorDelta(grid))*grid.h;
    if(![x,y].every(Number.isFinite))return true;
    if(e.projectileType==='snowpea'){drawIceHit(ctx,x,y,t,e.iceSplash,cellScale(grid));return true;}
    const spread=1-Math.pow(1-t,3);
    ctx.save();scaleAround(ctx,x,y,cellScale(grid));ctx.globalAlpha*=1-smooth(t);
    if(spore){
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.2;puff(ctx,x+Math.cos(a)*spread*23,y+Math.sin(a)*spread*19-4*t,8+spread*10,.52,i);}
      ctx.lineCap='round';ctx.lineWidth=2;ctx.strokeStyle='#ead6f5';ctx.beginPath();
      for(let i=0;i<4;i++){const a=i*Math.PI/2+.4,r=10+spread*25;ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.8);ctx.lineTo(x+Math.cos(a)*(r+5),y+Math.sin(a)*(r+5)*.8);}
      ctx.stroke();
      if(t<.4){ctx.save();ctx.globalAlpha*=1-t/.4;impactShape(ctx,x,y,13+spread*7,10+spread*6,'#f0ddfa');ctx.restore();}
    }else{
      if(t<.4){ctx.save();ctx.globalAlpha*=1-t/.4;impactShape(ctx,x,y,17+spread*10,15+spread*10,'#f4ffd1');ctx.restore();}
      oval(ctx,x,y,7+spread*13,7+spread*13,'rgba(218,249,152,.26)');
      ctx.lineCap='round';ctx.strokeStyle='rgba(226,251,176,.72)';ctx.lineWidth=2*(1-t)+1;
      ctx.beginPath();ctx.arc(x,y,9+spread*25,Math.PI*.16,Math.PI*1.42);ctx.stroke();
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3+.3,dist=7+spread*(i%2?27:33);
        oval(ctx,x+Math.cos(a)*dist,y+Math.sin(a)*dist*.84+11*t*t,4*(1-t)+1,3*(1-t)+1,i%2?'#ddf7a5':'#8ac83d');
      }
    }
    ctx.restore();return true;
  }
  function drawLightning(ctx,e,grid){
    if(e.type!=='lightning')return false;
    const t=effectTime(e.age,e.duration);if(t===null)return true;
    if(![e.x,e.row,e.fromX,e.fromRow,grid.x,grid.y,grid.w,grid.h].every(Number.isFinite)||grid.w<=0||grid.h<=0)return true;
    // The first arc leaves Usagi's raised reed; every later arc starts at the
    // previous contact point, so the whole volley reads as one live circuit.
    const first=e.jump===0,reedSize=164*cellScale(grid);
    const start={x:grid.x+e.fromX*grid.w+(first?.40*reedSize:0),y:grid.y+(e.fromRow+((first?.9:.57))+rowAnchorDelta(grid))*grid.h-(first?.64*reedSize:0)};
    const end={x:grid.x+e.x*grid.w,y:grid.y+(e.row+(.57)+rowAnchorDelta(grid))*grid.h};
    const dx=end.x-start.x,dy=end.y-start.y,distance=Math.hypot(dx,dy);
    if(![start.x,start.y,end.x,end.y,distance].every(Number.isFinite))return true;
    const size=Math.max(.45,Math.min(1.15,grid.w/128,grid.h/160));
    const nx=distance?-dy/distance:0,ny=distance?dx/distance:-1;
    const idPhase=value=>Number.isFinite(value)?value%997:0;
    const seed=idPhase(e.sourceId)*.17+idPhase(e.targetId)*.31+idPhase(e.jump)*1.7;
    const tick=Math.floor((e.age%1024)*48),segments=Math.max(4,Math.min(18,Math.ceil(distance/(18*size))));
    const amplitude=Math.min(14*size,distance*.16),points=[start];
    for(let i=1;i<segments;i++){
      const u=i/segments,offset=(i%2?1:-1)*amplitude*Math.sin(u*Math.PI)*(.65+.35*Math.sin(seed+i*2.13+tick*1.91));
      points.push({x:start.x+dx*u+nx*offset,y:start.y+dy*u+ny*offset});
    }
    points.push(end);
    const trace=path=>{ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(let i=1;i<path.length;i++)ctx.lineTo(path[i].x,path[i].y);};
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    const alpha=ctx.globalAlpha*(1-smooth((t-.46)/.54))*(.9+.1*Math.sin(seed+tick*1.2));
    // Reuse one bounded path for the colored sheath and hot core. No blur or
    // per-pixel glow is needed, even when several reeds fire in the same tick.
    trace(points);
    for(const [width,color,opacity] of [[10,'#9b78ff',.24],[5.5,'#65cfff',.78],[2.8,'#ffe79b',.96],[1.2,'#ffffee',1]]){
      ctx.lineWidth=width*size;ctx.strokeStyle=color;ctx.globalAlpha=alpha*opacity;ctx.stroke();
    }
    for(let i=0;i<3;i++){
      const p=points[Math.max(1,Math.min(segments-1,Math.floor(segments*(.23+i*.25))))],side=i%2?1:-1;
      const length=(11+7*(.5+.5*Math.sin(seed+i*3+tick)))*size;
      trace([p,{x:p.x+nx*length*.55*side+dx/(distance||1)*length*.3,y:p.y+ny*length*.55*side+dy/(distance||1)*length*.3},
        {x:p.x+nx*length*side-dx/(distance||1)*length*.12,y:p.y+ny*length*side-dy/(distance||1)*length*.12}]);
      ctx.globalAlpha=alpha*.7;ctx.lineWidth=2.3*size;ctx.strokeStyle='#aaa1ff';ctx.stroke();
      ctx.globalAlpha=alpha*.9;ctx.lineWidth=.9*size;ctx.strokeStyle='#dbfaff';ctx.stroke();
    }
    // Short angular sparks sit exactly on the actual hit, never on a guessed
    // neighboring enemy. Their expansion and flicker use the effect clock only.
    for(let i=0;i<7;i++){
      const a=seed+i*Math.PI*2/7+.2*Math.sin(tick*.7+i),inner=(3+4*t)*size;
      const radius=(12+7*Math.sin(seed+i*2)**2)*(1+.45*t)*size;
      trace([{x:end.x+Math.cos(a)*inner,y:end.y+Math.sin(a)*inner},
        {x:end.x+Math.cos(a+.17)*radius*.64,y:end.y+Math.sin(a+.17)*radius*.64},
        {x:end.x+Math.cos(a)*radius,y:end.y+Math.sin(a)*radius}]);
      ctx.globalAlpha=alpha;ctx.lineWidth=(i%2?1.3:2)*size;ctx.strokeStyle=i%2?'#fff8cb':'#89dcff';ctx.stroke();
    }
    ctx.restore();return true;
  }
  const BLAST_DURATION=.85,FIRE_DURATION=.85;
  function effectTime(age,duration){
    return Number.isFinite(age)&&Number.isFinite(duration)&&duration>0&&age>=0&&age<duration?age/duration:null;
  }
  function sampleBlast(age,duration=BLAST_DURATION){
    const t=effectTime(age,duration);if(t===null)return null;
    return {phase:t<.14?'impact':t<.43?'blast':'smoke',t,
      expansion:.64+.36*smooth(t/.14),
      flash:1-smooth(t/.17),fire:1-smooth((t-.21)/.36),
      smoke:smooth((t-.12)/.20)*(1-smooth((t-.48)/.52)),
      drift:smooth(t),ring:1-smooth(t/.37)};
  }
  function cloudShape(ctx,x,y,rx,ry,fill,stroke){
    // Fixed lobes keep the outline drawn, rather than a stack of shiny circles.
    ctx.beginPath();ctx.moveTo(x-rx*.84,y+ry*.39);
    ctx.bezierCurveTo(x-rx*1.16,y+ry*.21,x-rx*1.10,y-ry*.24,x-rx*.77,y-ry*.35);
    ctx.bezierCurveTo(x-rx*.86,y-ry*.73,x-rx*.32,y-ry*.92,x-rx*.12,y-ry*.69);
    ctx.bezierCurveTo(x+rx*.15,y-ry*1.10,x+rx*.63,y-ry*.89,x+rx*.63,y-ry*.53);
    ctx.bezierCurveTo(x+rx*1.06,y-ry*.60,x+rx*1.20,y-ry*.04,x+rx*.87,y+ry*.20);
    ctx.bezierCurveTo(x+rx*1.02,y+ry*.65,x+rx*.49,y+ry*.91,x+rx*.16,y+ry*.65);
    ctx.bezierCurveTo(x-rx*.12,y+ry*.97,x-rx*.70,y+ry*.89,x-rx*.84,y+ry*.39);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.lineWidth=2.5;ctx.strokeStyle=stroke;ctx.stroke();}
  }
  function impactShape(ctx,x,y,rx,ry,fill){
    // Uneven blunt rays read as a single hit, without a regular flower outline.
    const tips=[[-1,-.13],[-.58,-.43],[-.61,-.89],[-.20,-.66],[.11,-1],[.28,-.53],[.79,-.69],[.63,-.17],[1,-.02],[.62,.25],[.72,.66],[.21,.51],[-.04,.86],[-.31,.54],[-.83,.69],[-.68,.19]];
    ctx.beginPath();ctx.moveTo(x+tips[0][0]*rx,y+tips[0][1]*ry);
    for(let i=1;i<tips.length;i++)ctx.lineTo(x+tips[i][0]*rx,y+tips[i][1]*ry);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  }
  function drawBurst(ctx,e,grid){
    if(e.type!=='burst'||e.plantType!=='cherry')return false;
    const s=sampleBlast(e.age,e.duration);if(!s)return true;
    const x=grid.x+e.x*grid.w,y=grid.y+(e.row+(.53)+rowAnchorDelta(grid))*grid.h,rx=grid.w*1.37*s.expansion,ry=grid.h*1.22*s.expansion;
    const board=boardSize(grid);
    ctx.save();ctx.beginPath();ctx.rect(grid.x,grid.y,grid.w*board.cols,grid.h*board.rows);ctx.clip();
    const alpha=ctx.globalAlpha;
    // The damage pulse is already broad on its first frame. A short ground ring
    // and pointed flash provide the hit; the cloud only supplies the aftermath.
    if(s.ring>0){
      ctx.globalAlpha=alpha*s.ring*.65;ctx.strokeStyle='#fff7bf';ctx.lineWidth=7*(1-s.t)+1;
      ctx.beginPath();ctx.ellipse(x,y+grid.h*.38,grid.w*(.9+s.t*1.8),grid.h*(.20+s.t*.55),0,0,Math.PI*2);ctx.stroke();
    }
    if(s.fire>0){
      ctx.globalAlpha=alpha*s.fire;
      const lobes=[[-.81,.16,.40,.33],[-.55,-.66,.44,.36],[.21,-.73,.53,.47],[.81,-.23,.43,.37],[.63,.61,.49,.36],[-.36,.69,.58,.35]];
      for(let i=0;i<lobes.length;i++){
        const [px,py,pw,ph]=lobes[i],drift=.94+s.t*.35;
        cloudShape(ctx,x+px*rx*drift,y+py*ry*drift,rx*pw,ry*ph,i%2?'#ef7b25':'#f8a02c','#af4b24');
      }
      impactShape(ctx,x,y,rx*1.04,ry*1.02,'#f8a431');
      impactShape(ctx,x-rx*.07,y-ry*.04,rx*.87,ry*.80,'#ffdb67');
      impactShape(ctx,x+rx*.08,y+ry*.02,rx*.51,ry*.58,'#fff6bf');
    }
    if(s.flash>0){
      ctx.globalAlpha=alpha*s.flash;ctx.beginPath();
      for(let i=0;i<20;i++){
        const a=i*Math.PI/10-.08,r=i%2?.42:1,px=x+Math.cos(a)*rx*.94*r,py=y+Math.sin(a)*ry*.92*r;
        if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();ctx.fillStyle='#fffbe6';ctx.fill();
    }
    if(s.smoke>0){
      ctx.globalAlpha=alpha*s.smoke*.86;
      const smokePuffs=[[-.89,.24,.87],[-.44,-.72,1.25],[.29,-.84,1.04],[.81,-.23,.79],[.55,.39,1.15],[-.37,.64,.86],[-.76,-.28,.65]];
      for(let i=0;i<smokePuffs.length;i++){
        const [px,py,size]=smokePuffs[i],spread=.72+s.drift*.45;
        const sx=x+px*grid.w*1.35*spread,sy=y+py*grid.h*1.10*spread-s.drift*grid.h*.33;
        const sr=grid.w*(.27+s.drift*.11)*size;
        cloudShape(ctx,sx,sy,sr,sr*.91,i%3?'#9b8262':'#b49a77');
        oval(ctx,sx-sr*.21,sy-sr*.18,sr*.32,sr*.17,'#c1a780');
      }
      // The center opens as the smoke dissipates, exposing the cleared ground.
      for(let i=0;i<9;i++){
        const a=i*2.39,dist=grid.w*(.45+s.t*1.10);
        oval(ctx,x+Math.cos(a)*dist,y+Math.sin(a)*dist*.73+s.t*grid.h*.30,2.4*(1-s.t)+.6,3.7*(1-s.t)+.6,'#6f573c');
      }
    }
    ctx.restore();return true;
  }
  function sampleFire(age,duration=FIRE_DURATION,cols=9){
    const t=effectTime(age,duration);if(t===null)return null;
    const fade=1-smooth((t-.48)/.52);
    return {phase:t<.15?'ignition':t<.55?'burn':'embers',t,columns:cols*3,
      flash:1-smooth(t/.18),flame:fade,
      height:(.84+.16*smooth(t/.12))*(1-.46*smooth((t-.55)/.45)),
      embers:smooth(t/.06)*(1-smooth((t-.70)/.30))};
  }
  function drawFire(ctx,e,grid){
    if(e.type!=='fire')return false;
    const board=boardSize(grid),s=sampleFire(e.age,e.duration,board.cols);if(!s)return true;
    const top=grid.y+(e.row+rowAnchorDelta(grid))*grid.h,y=top+grid.h*.94;
    ctx.save();ctx.beginPath();ctx.rect(grid.x,top,grid.w*board.cols,grid.h);ctx.clip();
    const alpha=ctx.globalAlpha;
    // Every position ignites at once, matching the one-tick, whole-row damage.
    ctx.globalAlpha=alpha*s.flame*.45;
    ctx.fillStyle='#de4d23';ctx.fillRect(grid.x,y-grid.h*.20,grid.w*board.cols,grid.h*.23);
    ctx.globalAlpha=alpha*s.flame;
    for(let i=0;i<s.columns;i++){
      const x=grid.x+(i+.5)*grid.w/3,sw=Math.sin(i*2.4-s.t*25),lean=Math.sin(i*1.9+s.t*19)*grid.w*.085;
      const h=grid.h*.98*s.height*(.67+.20*Math.sin(i*1.71+.5)+.13*sw),w=grid.w*(.31+.06*Math.sin(i*2.07));
      ctx.beginPath();ctx.moveTo(x-w,y);
      ctx.bezierCurveTo(x-w*1.23,y-h*.19,x-w*1.10,y-h*.50,x-w*.57,y-h*.57);
      ctx.bezierCurveTo(x-w*.80,y-h*.35,x-w*.33,y-h*.30,x-w*.28+lean,y-h*.57);
      ctx.bezierCurveTo(x-w*.13+lean,y-h*.80,x-w*.61+lean,y-h*.94,x-w*.26+lean,y-h);
      ctx.bezierCurveTo(x-w*.34+lean,y-h*.83,x+w*.21+lean,y-h*.75,x+w*.24,y-h*.56);
      ctx.bezierCurveTo(x+w*.48,y-h*.64,x+w*.58,y-h*.80,x+w*.55,y-h*.86);
      ctx.bezierCurveTo(x+w*1.00,y-h*.72,x+w*.90,y-h*.38,x+w*.68,y-h*.22);
      ctx.bezierCurveTo(x+w*1.16,y-h*.33,x+w*1.13,y-h*.50,x+w*1.03,y-h*.60);
      ctx.bezierCurveTo(x+w*1.45,y-h*.31,x+w*1.22,y-h*.06,x+w,y);
      ctx.closePath();ctx.fillStyle=i%2?'#f78325':'#ed5925';ctx.fill();
      ctx.beginPath();ctx.moveTo(x-w*.62,y);
      ctx.bezierCurveTo(x-w*.79,y-h*.16,x-w*.45,y-h*.35,x-w*.22,y-h*.40);
      ctx.bezierCurveTo(x-w*.35,y-h*.21,x+w*.10,y-h*.21,x+lean*.5,y-h*.50);
      ctx.bezierCurveTo(x-w*.08+lean*.5,y-h*.66,x-w*.04+lean*.5,y-h*.73,x+w*.10+lean*.5,y-h*.76);
      ctx.bezierCurveTo(x+w*.01+lean*.5,y-h*.59,x+w*.50,y-h*.49,x+w*.31,y-h*.26);
      ctx.bezierCurveTo(x+w*.55,y-h*.31,x+w*.65,y-h*.41,x+w*.63,y-h*.50);
      ctx.bezierCurveTo(x+w*.97,y-h*.27,x+w*.69,y-h*.09,x+w*.56,y);
      ctx.closePath();ctx.fillStyle='#ffcd50';ctx.fill();
      ctx.beginPath();ctx.moveTo(x-w*.33,y);ctx.bezierCurveTo(x-w*.50,y-h*.16,x-w*.08,y-h*.21,x+lean*.25,y-h*.43);
      ctx.bezierCurveTo(x+w*.29,y-h*.33,x+w*.12,y-h*.20,x+w*.21,y-h*.15);
      ctx.quadraticCurveTo(x+w*.38,y-h*.23,x+w*.39,y-h*.30);ctx.quadraticCurveTo(x+w*.60,y-h*.11,x+w*.30,y);
      ctx.closePath();ctx.fillStyle='#fff4ae';ctx.fill();
    }
    if(s.flash>0){
      ctx.globalAlpha=alpha*s.flash*.85;ctx.fillStyle='#fff8d7';
      ctx.fillRect(grid.x,y-grid.h*.19,grid.w*board.cols,grid.h*.15);
    }
    if(s.embers>0){
      ctx.globalAlpha=alpha*s.embers;
      for(let i=0;i<board.cols*2;i++){
        const life=(s.t*1.4+(i%5)*.173)%1,x=grid.x+(i+.5)*grid.w*.5+Math.sin(i*2+s.t*8)*8;
        const ey=y-grid.h*(.18+life*.77),r=(1-life)*2.8+.7;
        oval(ctx,x,ey,r*.65,r,i%2?'#ffe69a':'#ed7a35');
      }
    }
    ctx.restore();return true;
  }
  function drawSlash(ctx,e,grid){
    if(e.type!=='slash')return false;
    const t=clamp(e.age/e.duration);if(t>=1)return true;
    const x=grid.x+e.x*grid.w,y=grid.y+(e.row+(.52)+rowAnchorDelta(grid))*grid.h;
    ctx.save();ctx.globalAlpha*=1-t;ctx.translate(x,y);ctx.scale(cellScale(grid),cellScale(grid));ctx.rotate(-.8+t*1.5);
    ctx.beginPath();ctx.moveTo(32,-64);ctx.quadraticCurveTo(174,-20,137,64);ctx.quadraticCurveTo(155,-1,32,-64);ctx.closePath();ctx.fillStyle='#eefeff';ctx.fill();ctx.strokeStyle='#9bdae0';ctx.lineWidth=2;ctx.stroke();
    for(let i=0;i<4;i++){const a=-.8+i*.55;oval(ctx,110+Math.cos(a)*t*48,Math.sin(a)*t*74,3,3,'#fff2bd');}
    ctx.restore();return true;
  }
  function drawHeal(ctx,e,grid){
    if(e.type!=='heal')return false;
    const t=clamp(e.age/e.duration);if(t>=1)return true;
    const x=grid.x+e.x*grid.w,y=grid.y+(e.row+(.72)+rowAnchorDelta(grid))*grid.h,size=cellScale(grid);
    ctx.save();ctx.globalAlpha*=Math.sin(t*Math.PI)*.85;
    ctx.beginPath();ctx.ellipse(x,y,(.2+t)*grid.w,(.12+t*.6)*grid.h,0,0,Math.PI*2);ctx.strokeStyle='#dbf5b1';ctx.lineWidth=4*(1-t)+1;ctx.stroke();
    for(let i=0;i<5;i++){
      const hx=x+(i-2)*37*size,hy=y-(28+t*65+Math.sin(i*2)*15)*size;
      ctx.save();scaleAround(ctx,hx,hy,size);
      ctx.beginPath();ctx.moveTo(hx,hy+8);ctx.bezierCurveTo(hx-20,hy-3,hx-10,hy-18,hx,hy-7);ctx.bezierCurveTo(hx+10,hy-18,hx+20,hy-3,hx,hy+8);ctx.fillStyle=i%2?'#ffe2e1':'#e8f8c0';ctx.fill();ctx.restore();
    }
    ctx.restore();return true;
  }
  // Upgrade visuals use only simulation clocks and small, low silhouettes so
  // persistent abilities remain readable without hiding the characters.
  function frostMark(ctx,x,y,r){
    ctx.strokeStyle='#e6fbff';ctx.lineWidth=2;ctx.lineCap='round';
    for(let i=0;i<3;i++){const a=i*Math.PI/3,dx=Math.cos(a)*r,dy=Math.sin(a)*r;ctx.beginPath();ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);ctx.stroke();}
  }
  function drawPerkFields(ctx,game,grid){
    const fields=(game.perkFields||[]).filter(f=>['spore','slow','burn'].includes(f.kind)&&effectTime(f.age,f.duration)!==null);
    if(!fields.length)return;
    const board=boardSize(grid,game);
    ctx.save();ctx.beginPath();ctx.rect(grid.x,grid.y,grid.w*board.cols,grid.h*board.rows);ctx.clip();
    for(const f of fields)for(let row=Math.max(0,f.row-(f.rows||0));row<=Math.min(board.rows-1,f.row+(f.rows||0));row++){
      const alpha=Math.min(1,f.age/.12,(f.duration-f.age)/.35),x=grid.x+f.x*grid.w,y=grid.y+(row+(.85)+rowAnchorDelta(grid))*grid.h;
      const left=Math.max(0,f.x-f.radius),right=Math.min(board.cols,f.x+f.radius);
      if(right<=left)continue;
      ctx.save();ctx.globalAlpha*=clamp(alpha);
      // Ground visuals follow the actual footprint, including multi-row traps
      // and local cherry scorch. A nearby pepper cannot make them look lane-wide.
      ctx.beginPath();ctx.rect(grid.x+left*grid.w,grid.y+row*grid.h,(right-left)*grid.w,grid.h);ctx.clip();
      if(f.kind==='burn'){
        oval(ctx,grid.x+grid.w*(left+right)/2,y,grid.w*(right-left)/2,grid.h*.10,'rgba(142,65,36,.18)');
        const count=Math.max(2,Math.ceil((right-left)*2));
        for(let i=0;i<count;i++){
          const fx=grid.x+(left+(i+.5)*(right-left)/count)*grid.w,h=13+8*(1+Math.sin(f.age*8+i*2.1)),w=6;
          ctx.beginPath();ctx.moveTo(fx-w,y);ctx.quadraticCurveTo(fx-w*1.5,y-h*.55,fx+Math.sin(f.age*7+i)*4,y-h);ctx.quadraticCurveTo(fx+w*1.6,y-h*.45,fx+w,y);ctx.closePath();ctx.fillStyle=i%2?'#eea142':'#e47b38';ctx.fill();
          oval(ctx,fx,y-4,2.5,5,'#fbe6a1');
        }
      }else{
        const r=Math.max(.2,f.radius||.65)*grid.w;
        const dirt=f.kind==='slow'&&f.sourceType==='mine';
        oval(ctx,x,y,r,grid.h*.18,f.kind==='spore'?'rgba(144,99,160,.17)':dirt?'rgba(128,92,58,.27)':'rgba(153,216,233,.22)');
        for(let i=0;i<5;i++){
          const phase=(f.age*.36+i*.213)%1,px=x+(i-2)*r*.34+Math.sin(f.age*1.6+i)*4,py=y-4-phase*grid.h*.22;
          if(f.kind==='spore')puff(ctx,px,py,11+phase*10,(1-phase)*.38,i);
          else if(dirt){oval(ctx,px,y-3+(i%2)*5,6,3,'#a48259');}
          else {ctx.save();ctx.globalAlpha*=(1-phase)*.65;frostMark(ctx,px,py,4+phase*3);ctx.restore();}
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function drawPerkStatuses(ctx,game,grid,options){
    const now=game.time||0,size=cellScale(grid);
    for(const enemy of game.enemies||[]){
      if(!(enemy.hp>0))continue;
      const frozen=enemy.frozenUntil>now,stunned=enemy.stunnedUntil>now,poison=enemy.poisonTimer>0,marked=enemy.markedUntil>now,weakened=enemy.weakenedUntil>now;
      if(!frozen&&!stunned&&!poison&&!marked&&!weakened)continue;
      const x=grid.x+enemy.x*grid.w,y=grid.y+(enemy.row+(.9)+rowAnchorDelta(grid))*grid.h;
      ctx.save();scaleAround(ctx,x,y,size);
      if(frozen){
        oval(ctx,x,y-7,34,10,'rgba(179,232,250,.5)');
        for(let i=0;i<3;i++){
          const fx=x+(i-1)*22,fy=y-7,high=24+(i%2)*12;
          ctx.beginPath();ctx.moveTo(fx-9,fy);ctx.lineTo(fx-6,fy-high);ctx.lineTo(fx+2,fy-high-7);ctx.lineTo(fx+10,fy);ctx.closePath();ctx.fillStyle='rgba(185,230,246,.72)';ctx.fill();ctx.strokeStyle='#e8fbff';ctx.lineWidth=1.8;ctx.stroke();
        }
        frostMark(ctx,x+31,y-56,8);
      }
      if(stunned){
        for(let i=0;i<3;i++){const a=now*4+i*Math.PI*2/3,sx=x+Math.cos(a)*25,sy=y-100+Math.sin(a)*6;ctx.beginPath();for(let j=0;j<8;j++){const b=j*Math.PI/4,r=j%2?2:6;const px=sx+Math.cos(b)*r,py=sy+Math.sin(b)*r;if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();ctx.fillStyle='#f9df83';ctx.fill();}
      }
      if(poison){
        for(let i=0;i<3;i++){const phase=(now*.7+i*.33)%1;ctx.globalAlpha=(1-phase)*.75;oval(ctx,x-27+Math.sin(i*2+phase*3)*7,y-16-phase*35,3+phase*2,3+phase*2,'#b88dd1');}
      }
      if(marked){
        ctx.globalAlpha=.9;ctx.strokeStyle='#eea456';ctx.lineWidth=2;
        const mx=x+32,my=y-77;ctx.beginPath();ctx.arc(mx,my,8,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.beginPath();ctx.moveTo(mx+Math.cos(a)*5,my+Math.sin(a)*5);ctx.lineTo(mx+Math.cos(a)*12,my+Math.sin(a)*12);ctx.stroke();}
      }
      if(weakened){
        ctx.globalAlpha=.85;ctx.strokeStyle='#cf9168';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-34,y-67);ctx.lineTo(x-34,y-55);ctx.moveTo(x-39,y-60);ctx.lineTo(x-34,y-55);ctx.lineTo(x-29,y-60);ctx.stroke();
      }
      ctx.restore();
    }
    for(const plant of (game.plants||[]).concat(game.supports||[])){
      if(!(plant.hp>0))continue;
      const ward=!(options&&options.shieldOverlay)&&plant.ward>0&&plant.wardUntil>now&&(!plant.wardSourceId||(game.supports||[]).some(s=>s.hp>0&&s.id===plant.wardSourceId&&s.row===plant.row&&s.col===plant.col)),protectedPlant=plant.protectedUntil>now,encouraged=plant.encouragedUntil>now,parry=plant.parryUntil>now;
      const spring=plant.springBoostUntil>now&&(game.supports||[]).some(s=>s.hp>0&&s.id===plant.springBoostSourceId&&s.row===plant.row&&s.col===plant.col);
      if(!ward&&!protectedPlant&&!encouraged&&!spring&&!parry)continue;
      const x=grid.x+plant.x*grid.w,y=grid.y+(plant.row+(.9)+rowAnchorDelta(grid))*grid.h;
      ctx.save();scaleAround(ctx,x,y,size);
      if(ward||protectedPlant||parry){
        const sx=x-32,sy=y-32;
        ctx.beginPath();ctx.moveTo(sx,sy-10);ctx.lineTo(sx+9,sy-6);ctx.lineTo(sx+7,sy+3);ctx.quadraticCurveTo(sx+4,sy+9,sx,sy+11);ctx.quadraticCurveTo(sx-7,sy+7,sx-8,sy+1);ctx.lineTo(sx-9,sy-6);ctx.closePath();ctx.fillStyle=ward?'#c6e9dd':'#efdc9b';ctx.fill();ctx.strokeStyle='#658b78';ctx.lineWidth=1.5;ctx.stroke();
        if(ward){ctx.strokeStyle='rgba(210,247,229,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-11,39,12,0,Math.PI*.07,Math.PI*.93);ctx.stroke();}
      }
      if(encouraged||spring){
        const sx=x+28,sy=y-68+Math.sin(now*3)*2;
        ctx.strokeStyle=spring?'#418d7b':'#b77838';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,sy+5);ctx.lineTo(sx,sy-8);ctx.lineTo(sx+7,sy-6);ctx.stroke();oval(ctx,sx-3,sy+5,4,2.5,spring?'#a0e3d8':'#e5ba66');
      }
      ctx.restore();
    }
  }
  function drawPerkPulse(ctx,e,grid){
    if(e.type!=='perkPulse')return false;
    const t=effectTime(e.age,e.duration);if(t===null)return true;
    const palette={poison:'#bf91d4',spore:'#bf91d4',freeze:'#c9f3fb',ward:'#c9efdf',protect:'#ead789',encourage:'#f6d693',retaliate:'#dcaa79',heal:'#d2edb6',aftershock:'#efba7e',knockback:'#f8ead0',slow:'#c4e7f0',burn:'#eca052'};
    const x=grid.x+e.x*grid.w,y=grid.y+(e.row+(.72)+rowAnchorDelta(grid))*grid.h,r=(14+Math.min(1.3,e.radius||.6)*grid.w*smooth(t));
    ctx.save();ctx.globalAlpha*=1-t;ctx.strokeStyle=palette[e.kind]||'#f7e5b7';ctx.lineWidth=3*(1-t)+1;
    ctx.beginPath();ctx.ellipse(x,y,r,r*.42,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+.3,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.42-12*t;
      if(e.kind==='freeze')frostMark(ctx,px,py,5);
      else {ctx.beginPath();ctx.moveTo(px-4,py+3);ctx.lineTo(px,py-4);ctx.lineTo(px+4,py+3);ctx.stroke();}
    }
    ctx.restore();return true;
  }
  return {PEA_RADIUS,FUME_DURATION,BLAST_DURATION,FIRE_DURATION,ATTACK_CUE_DURATION,ENEMY_IMPACT_DURATION,DRAW_LIMITS,sampleFume,sampleBlast,sampleFire,drawPea,drawFume,drawAttackCues,drawEnemyImpact,drawProjectiles,drawHit,drawLightning,drawBurst,drawFire,drawSlash,drawHeal,drawPerkFields,drawPerkStatuses,drawPerkPulse,muzzle};
});
