/* Challenge rules. Uses the same battle simulation and never touches saves. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenChallenges=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODES=Object.freeze([
    {id:'vase',name:'神秘陶罐',icon:'mushroom',color:'#ac7baf',summary:'敲开陶罐，找出伙伴；把藏起来的来客全部赶走。',instructions:'点陶罐揭晓内容。点上方伙伴，再点空格种下；绿色陶罐一定藏着伙伴。',stages:['午后寻宝','夜色惊喜','陶罐大挑战']},
    {id:'bowling',name:'滚滚坚果',icon:'wallnut',color:'#b88a4e',summary:'选好路线，让坚果碰撞、弹跳，连着击退来客。',instructions:'选上方坚果，再点任意一行发射。普通坚果碰撞后换行；红色坚果会爆炸。',stages:['滚球练习','弹跳连击','爆破派对']},
    {id:'conveyor',name:'伙伴传送带',icon:'repeater',color:'#648e9d',summary:'伙伴卡持续送达，不花阳光；随机应变守住五行。',instructions:'点传送带上的伙伴，再点空格种下，不用阳光。卡槽满时暂停配送，及时使用。',stages:['伙伴集合','临机应变','全员守护']}
  ]);
  const LEVELS=Object.freeze(MODES.flatMap(mode=>mode.stages.map((name,i)=>Object.freeze({id:mode.id+'-'+(i+1),mode:mode.id,stage:i+1,name,modeName:mode.name,instructions:mode.instructions}))));
  const ENDLESS_LEVELS=Object.freeze(MODES.map(mode=>Object.freeze({id:mode.id+'-endless',mode:mode.id,stage:1,endless:true,name:mode.name+' · 无尽',modeName:mode.name,instructions:mode.instructions+' 每波清完后休整5秒，下一波会更难。'+(mode.id==='vase'?'每轮重新布罐，清空上一轮植物、手牌和弹丸，并重新发放基础手牌。':mode.id==='conveyor'?'植物阵地、手牌和供卡进度保留，休整时可以继续种植。':'手牌保留，休整时继续补卡，下一波开始后再发球。')})));
  const ALL_LEVELS=Object.freeze([...LEVELS,...ENDLESS_LEVELS]);
  const MAX_ALIVE=80,REST_SECONDS=5,MAX_COUNT=Number.MAX_SAFE_INTEGER;
  function levelFor(id){return ALL_LEVELS.find(level=>level.id===id)||null;}
  function waveCount(mode,wave){
    const base=mode==='bowling'?22:25,growth=Math.pow(1.16,wave-1);
    return growth>=MAX_COUNT/base?MAX_COUNT:Math.ceil(base*growth);
  }
  function create(engine,game){
    let state=null,serial=0;
    const available=type=>engine.PLANTS[type]?type:'pea';
    function card(type){return {id:++serial,type:available(type)};}
    function start(id){
      const level=levelFor(id);if(!level)return false;
      game.start('meadow');
      game.level=Object.assign({},engine.LEVELS.meadow,{name:level.name,hpScale:1+(level.stage-1)*.12,speedScale:.85+(level.stage-1)*.075,damageScale:1,sunInterval:1e9,waves:[{at:0,count:0,gap:1}]});
      game.spawnPlan=[];game.spawnIndex=0;game.totalEnemies=0;game.wave=1;game.waveTotal=0;game.waveAnnounced=1;game.skyTimer=1e9;game.sun=0;game.events=[];
      // Every challenge must be defended, including its endless variant.
      game.mowers.forEach(mower=>{mower.used=true;mower.active=false;});
      state={id,mode:level.mode,stage:level.stage,endless:!!level.endless,wave:1,wavesCleared:0,intermissionUntil:null,nextWaveIn:null,name:level.name,modeName:level.modeName,instructions:level.instructions+' 本模式没有割草车，别让来客穿过左侧。',selected:null,cards:[],vases:[],balls:[],queue:[],delivered:0,nextSupply:0,spawned:0,total:0,opened:0,supplyInterval:0};
      beginWave(1,true);
      return state;
    }
    function beginWave(wave,initial=false){
      state.wave=wave;state.intermissionUntil=null;state.nextWaveIn=null;
      if(state.endless)state.stage=Math.min(3,wave);
      const stage=state.stage,mode=state.mode;
      game.wave=wave;game.waveAnnounced=wave;game.wavesCleared=state.wavesCleared;game.nextWaveIn=null;game.waveSpawned=0;game.waveKillStart=game.kills;
      if(state.endless){
        game.level=Object.assign({},game.level,{hpScale:1+(wave-1)*.10,speedScale:.85+Math.min(.5,(wave-1)*.035)});
      }
      state.spawned=0;state.total=0;state.opened=0;state.queue=[];state.vases=[];
      if(mode==='vase'){
        if(!initial){
          game.plants=[];game.supports=[];game.projectiles=[];game.suns=[];game.effects=[];game.perkFields=[];game.perkActions=[];game.wavePlantTypes.clear();
          state.selected=null;state.balls=[];
        }
        // Every row has partners and a known green vase; no unlucky seed can
        // leave a whole lane without an attacker. Contents remain deterministic.
        state.cards=['pea','wallnut','pea'].map(card);
        for(let row=0;row<5;row++){
          const contents=[{kind:'plant',type:row%2?'snowpea':'repeater'},{kind:'enemy',type:row===2&&stage===3?'anoko':'momonga'},{kind:'plant',type:'pea'}];
          if(stage>=2)contents.push({kind:row%2?'plant':'enemy',type:row%2?'mushroom':'chimera'});
          if(stage>=3)contents.push({kind:row===2?'plant':'enemy',type:row===2?'cherry':row%2?'runner':'momonga'});
          if(state.endless&&wave>=4){
            const pool=['momonga','runner','chimera',...(wave>=6?['anoko','pinkchimera']:[]),...(wave>=10?['helmet']:[]),...(wave>=15?['boss']:[])];
            contents.forEach((content,i)=>{if(content.kind==='enemy')content.type=pool[(row+i+wave)%pool.length];});
          }
          for(let i=contents.length-1;i>0;i--){const j=Math.floor(game.random()*(i+1));[contents[i],contents[j]]=[contents[j],contents[i]];}
          contents.forEach((content,i)=>{state.vases.push({id:++serial,row,col:8-i,content,green:content.kind==='plant'&&content.type!=='pea'});if(content.kind==='enemy')state.total++;});
        }
      }else{
        const count=state.endless?waveCount(mode,wave):mode==='bowling'?15+stage*7:15+stage*10;
        const baseGap=mode==='bowling'?2.7-stage*.25:3.2-stage*.18;
        const gap=state.endless?Math.max(.35,baseGap/Math.pow(1.025,wave-1)):baseGap;
        const pool=mode==='bowling'?['momonga','momonga','runner','chimera',...(stage>1?['anoko']:[])]:['momonga','runner','momonga','chimera',...(stage>1?['pinkchimera','anoko']:[])];
        if(state.endless&&wave>=8)pool.push('helmet');
        if(state.endless&&wave>=12)pool.push('drummer');
        if(state.endless&&wave>=16)pool.push('healer');
        if(state.endless&&wave>=20)pool.push('boss');
        if(state.endless)state.queue={kind:'challenge-wave',length:count,startAt:game.time+7,gap,pool,laneOffset:(wave-1)%5};
        else for(let i=0;i<count;i++)state.queue.push({at:7+i*gap,row:(i*2+Math.floor(i/5))%5,type:pool[i%pool.length],wave:1});
        state.total=count;
        state.supplyInterval=mode==='bowling'?2.4:2.6;
        if(initial){state.cards=(mode==='bowling'?['wallnut','wallnut','cherry']:['pea','pea','snowpea','wallnut','repeater']).map(card);state.nextSupply=game.time+state.supplyInterval;}
        if(!initial&&mode==='bowling'){state.balls=[];game.projectiles=[];}
      }
      game.totalEnemies=state.total;game.waveTotal=state.total;
      if(state.endless)game.events.push({type:'challengeWave',id:state.id,mode,endless:true,wave,wavesCleared:state.wavesCleared,total:state.total,nextWaveIn:null,at:game.time});
    }
    function select(id){if(!state||game.status!=='playing')return false;const item=state.cards.find(entry=>entry.id===id);if(!item)return false;state.selected=state.selected===id?null:id;return true;}
    function picked(){return state&&state.cards.find(entry=>entry.id===state.selected)||null;}
    function placeFree(type,row,col){const sun=game.sun,cd=game.cooldowns[type];game.sun=engine.PLANTS[type].cost;game.cooldowns[type]=0;const result=game.place(type,row,col);game.sun=sun;game.cooldowns[type]=cd;return result;}
    function act(row,col){
      if(!state||game.status!=='playing'||!game.cellValid(row,col))return {ok:false,reason:'点击草坪上的一格。'};
      if(state.endless&&state.intermissionUntil!==null&&state.mode!=='conveyor')return {ok:false,reason:'正在休整，下一波开始后再行动。'};
      const item=picked();
      if(state.mode==='vase'){
        const vase=state.vases.find(entry=>entry.row===row&&entry.col===col);
        if(vase){
          if(item)return {ok:false,reason:'这里有陶罐。再点已选卡牌取消，再敲开陶罐。'};
          if(vase.content.kind==='plant'&&state.cards.length>=8)return {ok:false,reason:'伙伴卡已满，先种下一位伙伴再开罐。'};
          if(state.endless&&vase.content.kind==='enemy'&&game.enemies.filter(enemy=>enemy.hp>0).length>=MAX_ALIVE)return {ok:false,reason:'场上来客太多，先击退几位再开罐。'};
          state.vases.splice(state.vases.indexOf(vase),1);state.opened++;
          game.effect('shovel',col+.5,row,.38);
          if(vase.content.kind==='plant')state.cards.push(card(vase.content.type));
          else{const enemy=game.spawn({type:vase.content.type,row,wave:state.wave});enemy.x=col+.5;state.spawned++;game.waveSpawned=state.spawned;}
          return {ok:true,opened:true,reason:vase.content.kind==='plant'?'找到一位伙伴！':'来客出现了！'};
        }
      }
      if(!item)return {ok:false,reason:state.mode==='vase'?'点击陶罐揭晓内容，或先选择上方伙伴。':'先选上方的一张卡。'};
      if(state.mode==='bowling'){
        state.balls.push({id:++serial,type:item.type,row,x:.45,age:0,hits:[],direction:row===4?-1:1});
      }else{
        const result=placeFree(item.type,row,col);if(!result.ok)return result;
      }
      state.cards.splice(state.cards.indexOf(item),1);state.selected=null;return {ok:true};
    }
    function moveBalls(dt){
      for(const ball of state.balls){
        const before=ball.x;ball.x+=3.25*dt;ball.age+=dt;
        let target=null;
        for(const enemy of game.enemies)if(enemy.hp>0&&enemy.row===ball.row&&!ball.hits.includes(enemy.id)&&enemy.x+.3>=before&&enemy.x-.3<=ball.x&&(!target||enemy.x<target.x))target=enemy;
        if(!target)continue;
        if(ball.type==='cherry'){
          game.effect('burst',target.x,target.row,.68,{plantType:'cherry',radius:1.5});
          for(const enemy of game.enemies)if(enemy.hp>0&&Math.abs(enemy.row-target.row)<=1&&Math.abs(enemy.x-target.x)<=1.6)game.hurt(enemy,700,0,.58,'cherry','cherry');
          game.events.push({type:'explosion',plantType:'cherry'});ball.spent=true;
        }else{
          game.hurt(target,180,0,.58,null,'wallnut');ball.hits.push(target.id);
          game.effect('hit',target.x,target.row,.18);game.events.push({type:'shoot',plantType:'wallnut'});
          if(ball.row===0)ball.direction=1;else if(ball.row===4)ball.direction=-1;
          ball.fromRow=ball.row;ball.row+=ball.direction;ball.bounceAt=ball.age;
        }
      }
      state.balls=state.balls.filter(ball=>!ball.spent&&ball.x<10.6);
    }
    function pending(){return Math.max(0,state.total-state.spawned);}
    function queueEmpty(){return Array.isArray(state.queue)?state.queue.length===0:state.spawned>=state.queue.length;}
    function spawnDue(){
      let alive=state.endless?game.enemies.filter(enemy=>enemy.hp>0).length:0;
      while(!queueEmpty()){
        if(state.endless&&alive>=MAX_ALIVE)break;
        const plan=state.queue,index=state.spawned;
        const entry=Array.isArray(plan)?plan[0]:{at:plan.startAt+index*plan.gap,row:(index%5*2+Math.floor(index/5)%5+plan.laneOffset)%5,type:plan.pool[index%plan.pool.length],wave:state.wave};
        if(entry.at>game.time)break;
        const enemy=game.spawn(entry);if(!enemy)break;
        if(Array.isArray(plan))plan.shift();
        state.spawned++;game.waveSpawned=state.spawned;alive++;
      }
    }
    function update(dt){
      if(!state||game.status!=='playing')return;
      // Keep collision and supply clocks in step with the engine even for
      // direct callers that pass a long delta (runtime normally passes .05 s).
      let remaining=Math.max(0,Math.min(Number(dt)||0,10));
      while(remaining>1e-8&&game.status==='playing'){
        const step=Math.min(.05,remaining);remaining-=step;game.update(step);if(game.status!=='playing')break;
        if(state.endless&&state.intermissionUntil!==null){
          state.nextWaveIn=Math.max(0,state.intermissionUntil-game.time);game.nextWaveIn=state.nextWaveIn;
          if(state.nextWaveIn<=1e-9)beginWave(Math.min(MAX_COUNT,state.wave+1));
        }
        spawnDue();
        if(state.mode!=='vase'&&game.time>=state.nextSupply){
          if(state.cards.length<8){
            const pool=state.mode==='bowling'?['wallnut','wallnut','wallnut','cherry']:['pea','wallnut','snowpea','repeater','mushroom','cherry','rakko','starfruit'];
            state.cards.push(card(pool[state.delivered++%pool.length]));
          }
          state.nextSupply=game.time+state.supplyInterval;
        }
        if(state.mode==='bowling')moveBalls(step);
        // Dead actors are removed by the next engine step. Check live HP here
        // so the final bowling hit completes without waiting for a new wave.
        if(state.intermissionUntil===null&&queueEmpty()&&state.vases.length===0&&state.spawned===state.total&&!game.enemies.some(enemy=>enemy.hp>0)){
          if(state.endless){
            state.wavesCleared=state.wave;game.wavesCleared=state.wavesCleared;
            state.intermissionUntil=game.time+REST_SECONDS;state.nextWaveIn=REST_SECONDS;game.nextWaveIn=REST_SECONDS;
            game.events.push({type:'challengeWaveClear',id:state.id,mode:state.mode,endless:true,wave:state.wave,wavesCleared:state.wavesCleared,total:state.total,nextWaveIn:REST_SECONDS,at:game.time,kills:game.kills});
          }else{
            game.status='won';game.wavesCleared=1;game.events.push({type:'win',time:game.time,kills:game.kills});
          }
        }
        // Mini-game endless deliberately keeps game.isEndless false, so its
        // unconsumed event history needs the same bounded buffer explicitly.
        if(state.endless&&game.events.length>engine.ENDLESS.eventLimit)game.events.splice(0,game.events.length-engine.ENDLESS.eventLimit);
      }
    }
    function presentation(){
      if(!state)return null;
      const progress=state.mode==='vase'?state.opened/Math.max(1,state.opened+state.vases.length):state.spawned/Math.max(1,state.total),resting=state.intermissionUntil!==null;
      return {phase:resting?'intermission':progress>.75?'final':'wave',intense:!resting&&progress>.75,endless:state.endless,wave:state.wave,waveCount:state.endless?null:1,wavesCleared:state.wavesCleared,progress,remaining:game.enemies.filter(enemy=>enemy.hp>0).length,pending:pending(),total:state.total,spawned:state.spawned,spawningDone:queueEmpty()&&state.vases.length===0,markers:[],nextWaveIn:state.nextWaveIn};
    }
    return {start,select,picked,act,update,presentation,clear(){state=null;},get state(){return state;}};
  }
  return {MODES,LEVELS,ENDLESS_LEVELS,ALL_LEVELS,levelFor,MAX_ALIVE,REST_SECONDS,create};
});
