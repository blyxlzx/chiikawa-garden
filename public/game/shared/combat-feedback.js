/* Additive combat presentation. Source artwork, action clips and collision
 * positions remain authoritative; only short visual offsets are interpolated. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenCombatFeedback=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const HEAVY=new Set(['rakko','mushroom','mine','cherry','jalapeno']);
  const NUMERIC_SAVE_FIELDS='impactAt nextImpactAt nextWaterImpactAt shockUntil nextShockAt pushVisualAt pushVisualOffset pushVisualDuration';
  function actionStage(entity,enemy=false,time=0){
    if(entity.hp<=0||entity.animationState==='death')return 'death';
    if(enemy){
      if((entity.shockUntil||0)>time||(entity.stunnedUntil||0)>time)return 'hit';
      if(entity.impactKind==='heavy'&&time>=entity.impactAt&&time-entity.impactAt<.18)return time-entity.impactAt<.06?'hit':'recovery';
      if(entity.gasping)return 'anticipation';
      if(entity.eating||entity.animationState==='eat'||entity.animationState==='attack'){
        const p=((entity.eatPhase||0)%1+1)%1,markers=entity.sourceChewMarkers||[.14,.68];
        for(const at of markers)if(p>=Math.max(0,at-.13)&&p<at)return 'anticipation';
        for(const at of markers)if(p>=at&&p<at+.045)return 'attack';
        return 'recovery';
      }
      return entity.animationState==='idle'?'idle':'walk';
    }
    const age=entity.shootAge,duration=entity.shootDuration||.86,marker=entity.shootMarkerAge||.34;
    if(age>=0&&age<duration)return age<marker?'anticipation':age<marker+.09?'attack':'recovery';
    return entity.hitTimer>0?'hit':'idle';
  }
  function pushOffset(enemy,time){
    if(!Number.isFinite(enemy.pushVisualAt)||!Number.isFinite(enemy.pushVisualOffset)||!(enemy.pushVisualDuration>0))return 0;
    const t=(time-enemy.pushVisualAt)/enemy.pushVisualDuration;
    return t>=0&&t<1?enemy.pushVisualOffset*(1-smooth(t)):0;
  }
  function actorOffset(enemy,time){
    let x=pushOffset(enemy,time);
    // Heavy contact has one load/recovery arc; normal projectiles never shake
    // every body in a crowd. There is no random frame-to-frame jitter.
    const age=time-enemy.impactAt;
    if(enemy.impactKind==='heavy'&&age>=0&&age<.18){
      const pulse=age<.045?smooth(age/.045):1-smooth((age-.045)/.135);
      x+=pulse*(enemy.type==='boss'?.015:.035);
    }
    return {x,y:0};
  }
  function noteKnockback(enemy,oldX,time){
    if(![oldX,enemy.x,time].every(Number.isFinite)||enemy.x===oldX)return false;
    // Preserve the current displayed position if a second push arrives before
    // the first settles. Resetting to the logical origin would snap backwards.
    const displayed=oldX+pushOffset(enemy,time);
    enemy.pushVisualAt=time;enemy.pushVisualOffset=displayed-enemy.x;
    enemy.pushVisualDuration=clamp(.15+Math.abs(enemy.pushVisualOffset)*.08,.15,.24);
    return true;
  }
  function noteHit(enemy,time,sourceType,options={}){
    if(!enemy||!Number.isFinite(time))return {water:false,shock:false};
    const kind=sourceType==='stormreed'?'electric':HEAVY.has(sourceType)?'heavy':sourceType==='snowpea'?'ice':options.armored?'armor':'normal';
    if(!options.continuous&&(time>=(enemy.nextImpactAt||0)||(kind==='heavy'&&enemy.impactKind!=='heavy'))){
      enemy.impactAt=time;enemy.impactKind=kind;enemy.nextImpactAt=time+(kind==='heavy'?.18:.09);
    }
    let shock=false,water=false;
    if(sourceType==='stormreed'&&!options.continuous&&time>=(enemy.nextShockAt||0)){
      enemy.shockUntil=time+(enemy.type==='boss'?.025:.05);
      enemy.nextShockAt=time+.4;shock=true;
    }
    if(options.water&&!options.continuous&&time>=(enemy.nextWaterImpactAt||0)){
      enemy.nextWaterImpactAt=time+.20;water=true;
    }
    return {water,shock,kind};
  }
  function selectedImpacts(enemies,time,limit=32){
    return (enemies||[]).filter(e=>e.hp>0&&e.hitTimer>0).sort((a,b)=>{
      const priority=e=>(e.type==='boss'?4:0)+(e.impactKind==='electric'?3:e.impactKind==='heavy'?2:0);
      return priority(b)-priority(a)||(b.lastHitAt||0)-(a.lastHitAt||0)||a.x-b.x||a.id-b.id;
    }).slice(0,limit).map(e=>e.id);
  }
  function selectEffects(effects,limit=96){
    const active=(effects||[]).filter(e=>e.age>=0&&e.age<e.duration);
    if(active.length<=limit)return active;
    const critical=[],secondary=[],seen=new Set();
    for(const e of active){
      // Keep every segment of a lightning circuit and gameplay-wide attacks.
      // Only decorative duplicates share a budget. Simulation is never edited.
      if(['lightning','burst','fire','slash','mower'].includes(e.type)){critical.push(e);continue;}
      const key=e.type+':'+e.row+':'+Math.floor(e.x*2)+':'+(e.projectileType||e.kind||'');
      if(seen.has(key))continue;seen.add(key);secondary.push(e);
    }
    secondary.sort((a,b)=>((b.type==='defeat'?1:0)-(a.type==='defeat'?1:0))||a.age/a.duration-b.age/b.duration);
    return critical.concat(secondary.slice(0,Math.max(0,limit-critical.length)));
  }
  function rowAnchorDelta(grid){return (Number.isFinite(grid.plantingAnchorY)?grid.plantingAnchorY:.9)-.9;}
  function drawShock(ctx,enemy,grid,time){
    const age=time-enemy.impactAt;
    if(enemy.hp<=0||enemy.impactKind!=='electric'||!(age>=0&&age<.19))return false;
    const t=age/.19,scale=Math.min(grid.w/128,grid.h/160),off=actorOffset(enemy,time);
    const x=grid.x+(enemy.x+off.x)*grid.w,y=grid.y+(enemy.row+.63+rowAnchorDelta(grid))*grid.h;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha*=1-smooth(t);ctx.lineCap='round';ctx.lineJoin='round';
    // Two open contours frame the torso; they never repaint or cover the face.
    for(const side of [-1,1]){
      const jitter=Math.sin((enemy.id||0)*1.9+Math.floor(age*30))*3;
      ctx.beginPath();ctx.moveTo(side*30,-20);ctx.lineTo(side*(39+jitter),-8);ctx.lineTo(side*31,0);ctx.lineTo(side*41,13);ctx.lineTo(side*29,29);
      ctx.strokeStyle='#57c8ee';ctx.lineWidth=4.5;ctx.stroke();ctx.strokeStyle='#f3fbca';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();return true;
  }
  function drawStatuses(ctx,game,grid){
    let count=0;
    for(const enemy of game.enemies||[])if(count<24&&drawShock(ctx,enemy,grid,game.time))count++;
    return count;
  }
  function drawEffect(ctx,e,grid){
    if(e.type!=='waterHit')return false;
    if(!(e.age>=0&&e.age<e.duration))return true;
    const t=e.age/e.duration,spread=smooth(t),scale=Math.min(grid.w/128,grid.h/160),x=grid.x+e.x*grid.w,y=grid.y+(e.row+.91+rowAnchorDelta(grid))*grid.h;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha*=1-smooth(t);ctx.lineCap='round';
    for(let ring=0;ring<2;ring++){
      ctx.beginPath();ctx.ellipse(0,0,10+spread*(29+ring*13),3+spread*(8+ring*3),0,0,Math.PI*2);ctx.lineWidth=ring?1.2:2.4;ctx.strokeStyle=ring?'#a7dfda':'#eefdf3';ctx.stroke();
    }
    for(let i=0;i<5;i++){
      const side=(i-2)/2,px=side*(7+32*t),py=-Math.sin(Math.PI*t)*(14+(i%3)*8)+(i%2)*2;
      ctx.beginPath();ctx.ellipse(px,py,1.5+1.1*(1-t),2.5+2*(1-t),-side*.4,0,Math.PI*2);ctx.fillStyle=i%2?'#edfef4':'#a5e4e0';ctx.fill();
    }
    ctx.restore();return true;
  }
  return {NUMERIC_SAVE_FIELDS,actionStage,actorOffset,pushOffset,noteKnockback,noteHit,selectedImpacts,selectEffects,drawStatuses,drawEffect};
});
