/* Shared pickup hit areas and visual flights. The engine alone awards currency. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GardenSunCollection=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TARGET=Object.freeze({x:76,y:54}),PULSE_SECONDS=.42,PICKUP_SECONDS=.18,RAPID_PICKUP_SECONDS=.32;
  const clamp=x=>Math.max(0,Math.min(1,x));
  function hitRadius(pointerType='mouse',scale=1){
    if(pointerType==='mouse')return 48;
    const ratio=Number.isFinite(scale)&&scale>0?scale:1;
    return Math.min(92,Math.max(56,28/ratio));
  }
  function findSun(suns,point,grid,pointerType='mouse',scale=1){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
    let found=null,best=hitRadius(pointerType,scale)**2;
    // The nearest visible center wins, so generous finger padding doesn't
    // steal a tap from a neighboring sun. Equal distances favor the topmost.
    for(let i=suns.length-1;i>=0;i--){
      const s=suns[i],distance=(point.x-grid.x-s.x*grid.w)**2+(point.y-grid.y-s.y*grid.h)**2;
      if(distance<=best&&(!found||distance<best)){found=s;best=distance;}
    }
    return found;
  }
  function findSunsOnSegment(suns,from,to,grid,pointerType='mouse',scale=1){
    if(!from||!to||![from.x,from.y,to.x,to.y].every(Number.isFinite))return [];
    const vx=to.x-from.x,vy=to.y-from.y,length2=vx*vx+vy*vy,radius2=hitRadius(pointerType,scale)**2,hits=[];
    // Test the whole motion segment, so a fast pointer cannot jump past a sun
    // between two browser events. Entry time gives a stable pickup order.
    for(let i=0;i<suns.length;i++){
      const sun=suns[i],dx=grid.x+sun.x*grid.w-from.x,dy=grid.y+sun.y*grid.h-from.y;
      if(!Number.isFinite(dx)||!Number.isFinite(dy))continue;
      const projection=length2?(dx*vx+dy*vy)/length2:0,t=clamp(projection);
      if((dx-t*vx)**2+(dy-t*vy)**2>radius2)continue;
      const perpendicular2=length2?Math.max(0,dx*dx+dy*dy-projection*projection*length2):0;
      const entry=length2?clamp(projection-Math.sqrt(Math.max(0,(radius2-perpendicular2)/length2))):0;
      hits.push({sun,entry,distance:dx*dx+dy*dy,index:i});
    }
    hits.sort((a,b)=>a.entry-b.entry||a.distance-b.distance||b.index-a.index);
    const seen=new Set();
    return hits.filter(hit=>{const key=hit.sun.id===undefined?hit.sun:hit.sun.id;if(seen.has(key))return false;seen.add(key);return true;}).map(hit=>hit.sun);
  }
  function sampleFlight(f,age){
    // Begin moving on the first frame, then ease into the counter. A zero-speed
    // start makes a successful pickup look like an ignored click.
    const t=clamp(age/f.duration),p=1-(1-t)*(1-t),q=1-p;
    return {id:f.id,value:f.value,age:Math.max(0,age),duration:f.duration,
      x:q*q*f.startX+2*q*p*f.controlX+p*p*TARGET.x,
      y:q*q*f.startY+2*q*p*f.controlY+p*p*TARGET.y,
      size:20*(1-.63*p)+Math.sin(Math.min(1,t/.22)*Math.PI)*2.4,
      alpha:1,progress:p};
  }
  function create(){
    let flights=[],pulse=0,lastValue=0;const seen=new Set();
    function add(input){
      if(!input||input.id===undefined||seen.has(input.id)||!Number.isFinite(input.x)||!Number.isFinite(input.y)||!Number.isFinite(input.value)||input.value<=0)return false;
      const distance=Math.hypot(TARGET.x-input.x,TARGET.y-input.y);
      flights.push({id:input.id,value:input.value,startX:input.x,startY:input.y,blockPlant:input.blockPlant!==false,
        controlX:input.x+(TARGET.x-input.x)*.32,controlY:Math.max(22,Math.min(input.y,TARGET.y)-distance*.12),
        age:0,duration:Math.min(.65,.35+distance/4000)});
      seen.add(input.id);return true;
    }
    function update(dt){
      if(!Number.isFinite(dt)||dt<=0)return;
      pulse=Math.max(0,pulse-dt/PULSE_SECONDS);
      const remaining=[];let landed=0,latestPulse=0;
      for(const f of flights){
        f.age+=dt;
        if(f.age>=f.duration){landed+=f.value;latestPulse=Math.max(latestPulse,1-(f.age-f.duration)/PULSE_SECONDS);}
        else remaining.push(f);
      }
      flights=remaining;
      if(landed){lastValue=landed;pulse=Math.max(pulse,clamp(latestPulse));}
    }
    function reset(){flights=[];pulse=0;lastValue=0;seen.clear();}
    function blocksPlant(point,pointerType='mouse',scale=1){
      if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
      const radius=hitRadius(pointerType,scale);
      return flights.some(f=>f.blockPlant&&f.age<RAPID_PICKUP_SECONDS&&Math.hypot(point.x-f.startX,point.y-f.startY)<=radius);
    }
    function star(ctx,x,y,r,alpha){
      ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#fff3a2';ctx.beginPath();
      ctx.moveTo(x,y-r);ctx.lineTo(x+r*.3,y-r*.3);ctx.lineTo(x+r,y);ctx.lineTo(x+r*.3,y+r*.3);
      ctx.lineTo(x,y+r);ctx.lineTo(x-r*.3,y+r*.3);ctx.lineTo(x-r,y);ctx.lineTo(x-r*.3,y-r*.3);ctx.closePath();ctx.fill();ctx.restore();
    }
    function draw(ctx,drawSun){
      for(const f of flights){
        if(f.age<PICKUP_SECONDS){
          const p=f.age/PICKUP_SECONDS,alpha=1-p;
          ctx.save();ctx.globalAlpha=alpha*.55;ctx.strokeStyle='#fff4b2';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(f.startX,f.startY,18+p*15,0,Math.PI*2);ctx.stroke();ctx.restore();
          for(let i=0;i<3;i++){const a=-Math.PI/2+i*Math.PI*2/3,dist=25+p*17;star(ctx,f.startX+Math.cos(a)*dist,f.startY+Math.sin(a)*dist,2.5*alpha,alpha*.55);}
        }
        for(let i=4;i>=1;i--){const age=f.age-i*.035;if(age<=0)continue;const p=sampleFlight(f,age);star(ctx,p.x,p.y,5-i*.65,(1-i/5)*.42);}
        const p=sampleFlight(f,f.age);drawSun(p.x,p.y,p.size,p.alpha);
      }
      if(pulse>0){
        const age=1-pulse;
        ctx.save();ctx.globalAlpha=pulse*.75;ctx.strokeStyle='#fff4a6';ctx.lineWidth=3*pulse+1;
        ctx.beginPath();ctx.arc(TARGET.x,TARGET.y,29+age*19,0,Math.PI*2);ctx.stroke();ctx.restore();
        for(let i=0;i<6;i++){const a=i*Math.PI/3,dist=33+age*26;star(ctx,TARGET.x+Math.cos(a)*dist,TARGET.y+Math.sin(a)*dist,3+3*pulse,pulse);}
        ctx.save();ctx.globalAlpha=pulse;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 20px "Microsoft YaHei",sans-serif';
        ctx.strokeStyle='#74511f';ctx.lineWidth=3;ctx.fillStyle='#fff4b2';
        ctx.strokeText('+'+lastValue,128,63-age*18);ctx.fillText('+'+lastValue,128,63-age*18);ctx.restore();
      }
    }
    function getState(){return {flights:flights.map(f=>sampleFlight(f,f.age)),pulse,lastValue};}
    // A drawing replica receives pickup visuals without collecting currency,
    // advancing the authoritative clock, or touching the saved game.
    function visualSnapshot(){return {flights:flights.map(f=>({...f})),pulse,lastValue};}
    function applyVisualSnapshot(snapshot){
      if(!snapshot||!Array.isArray(snapshot.flights))return false;
      flights=snapshot.flights.map(f=>({...f}));pulse=snapshot.pulse;lastValue=snapshot.lastValue;return true;
    }
    return {add,update,reset,draw,getState,blocksPlant,visualSnapshot,applyVisualSnapshot};
  }
  return {create,sampleFlight,TARGET,PULSE_SECONDS,PICKUP_SECONDS,RAPID_PICKUP_SECONDS,hitRadius,findSun,findSunsOnSegment};
});
