/* Deterministic endless encounters and bounded, optional checkpoint metadata.
 * No assets, DOM, timers, RNG, storage or dependency on the game renderer. */
(function(root,factory){const dependencies=typeof module==='object'&&module.exports?require('./prepared-restore-dependencies.js'):root.GardenPreparedRestoreDependencies;
  const api=dependencies?dependencies.runDirector:factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenRunDirector=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
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
