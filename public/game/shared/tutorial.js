/* Guided first battle; only enemy arrival deadlines pause, never animation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenTutorial=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STORAGE_KEY='chiikawa-garden-tutorial-v1';
  const TEXT={
    sun:['收集阳光','点击发光的阳光，它能让伙伴加入花园。'],
    plant:['种下第一位伙伴','选择向日葵，再点亮起的格子。它会持续产生阳光。'],
    shovel:['试试铲子','选择铲子，再点刚种下的向日葵，腾出这个位置。'],
    shooter:['布置守卫','选择豌豆射手，种在亮起的格子上。'],
    enemy:['守住这一行','伙伴会自动攻击前方敌人。观察出手与命中，击败这只怪后正式开始。'],
    lily:['先铺一片荷叶','水面上先种荷叶，普通伙伴才能站上去。'],
    waterPlant:['让伙伴站上荷叶','选择攻击伙伴，种在刚铺好的荷叶上。']
  };
  function create(options){
    options=options||{};const game=options.game,engine=options.engine,platform=options.platform||{};
    if(!game||!engine)throw new Error('Tutorial requires the shared game and engine.');
    const progress={version:1,intro:null,water:null};let saveError='',state=null,deck=[];
    try{let raw=platform.getStorageSync&&platform.getStorageSync(STORAGE_KEY);if(typeof raw==='string')raw=JSON.parse(raw);if(raw&&raw.version===1)for(const kind of ['intro','water'])if(['complete','skipped'].includes(raw[kind]))progress[kind]=raw[kind];}catch(_){}
    function emit(){if(typeof options.onChange==='function')options.onChange(getState());}
    function persist(){
      try{
        if(!platform.setStorageSync||!platform.getStorageSync||platform.setStorageSync(STORAGE_KEY,{...progress})===false)throw new Error('storage unavailable');
        let actual=platform.getStorageSync(STORAGE_KEY);if(typeof actual==='string')actual=JSON.parse(actual);
        if(!actual||actual.version!==1||actual.intro!==progress.intro||actual.water!==progress.water)throw new Error('write not verified');saveError='';return true;
      }catch(_){saveError='教学进度暂未保存，下次打开可能再次出现。';return false;}
    }
    function target(kind){
      const map=game.getMap(),board=game.getBoard(),cells=[];
      for(let row=0;row<board.rows;row++)for(let col=0;col<board.cols;col++){
        const terrain=game.getTerrain(row,col);
        if((kind==='water'?terrain.kind==='water':terrain.plantable)&&!game.plants.some(p=>p.hp>0&&p.row===row&&p.col===col)&&!game.getSupport(row,col))cells.push({row,col});
      }
      cells.sort((a,b)=>Math.abs(a.row-(board.rows-1)/2)+Math.abs(a.col-1)*.8-(Math.abs(b.row-(board.rows-1)/2)+Math.abs(b.col-1)*.8));
      return cells[0]||null;
    }
    function stage(value){if(!state)return;state.stage=value;state.stageAge=0;emit();}
    function addLessonSun(){
      const sun=game.addSun(state.col+.5,state.row+.5,'sunflower',25);
      // The same real sun entity remains animated and collectible.
      state.sunId=sun.id;
    }
    function begin(config){
      config=config||{};state=null;deck=(config.deck||engine.DEFAULT_DECK||[]).slice();
      if(!['playing','paused'].includes(game.status)||game.time>.1||game.enemies.length)return false;
      const hasWater=game.getMap().tiles.some(row=>row.some(tile=>tile==='water'));
      const kind=config.kind||(game.levelId==='meadow'&&!progress.intro?'intro':hasWater&&!progress.water?'water':null);
      if(!['intro','water'].includes(kind)||progress[kind]&&!config.force)return false;
      if(kind==='intro'&&(!deck.includes('sunflower')||!deck.includes('pea')))return false;
      const support=deck.find(type=>engine.PLANTS[type]&&engine.PLANTS[type].support);
      const shooter=deck.includes('pea')?'pea':deck.find(type=>engine.PLANTS[type]&&!engine.PLANTS[type].support&&engine.PLANTS[type].damage>0&&!engine.PLANTS[type].fuse);
      if(kind==='water'&&(!support||!shooter))return false;
      const cell=target(kind==='water'?'water':'land');if(!cell)return false;
      state={kind,stage:kind==='intro'?'sun':'lily',row:cell.row,col:cell.col,stageAge:0,sunId:null,support:support||'lily',shooter:shooter||'pea',practiceId:null,killBaseline:game.kills};
      if(kind==='intro')addLessonSun();
      emit();return true;
    }
    function finish(result){if(!state)return false;const kind=state.kind;state=null;progress[kind]=result;persist();emit();return true;}
    function beforeStep(dt){
      if(!state||game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
      state.stageAge+=dt;
      // Keep the original spacing and total population of every pending wave.
      // Advancing all other engine clocks preserves idle/walk/attack frames,
      // sun flights, cooldowns and the one real practice enemy.
      if(Array.isArray(game.spawnPlan))for(let i=game.spawnIndex;i<game.spawnPlan.length;i++)game.spawnPlan[i].at+=dt;
      else if(game.spawnPlan&&game.spawnPlan.kind==='endless-v2'){
        game.spawnPlan.startAt+=dt;
        game.nextEndlessSpawnAt+=dt;
      }
      if(game.isEndless&&game.intermissionUntilTick!==null){
        game.intermissionUntilTick+=Math.round(dt*100);
      }
      if(state.stage==='sun'&&!game.suns.some(s=>s.id===state.sunId)&&!game.events.some(e=>e.type==='sun'))addLessonSun();
    }
    function allow(action,value){
      if(!state)return {ok:true};value=value||{};
      const at=value.row===state.row&&value.col===state.col;
      if(action==='place'){
        const type=state.stage==='plant'?'sunflower':state.stage==='shooter'?state.shooter:state.stage==='lily'?state.support:state.stage==='waterPlant'?state.shooter:null;
        return type&&at&&value.type===type?{ok:true}:{ok:false,reason:'先完成当前练习，或点“跳过教学”自由布阵。'};
      }
      if(action==='shovel')return state.stage==='shovel'&&at?{ok:true}:{ok:false,reason:'先完成当前练习，或点“跳过教学”自由布阵。'};
      return {ok:true};
    }
    function spawnPractice(){
      const spec=game.spawnSpecAt(game.spawnIndex);if(!spec){finish('complete');return;}
      game.spawnIndex++;game.wave=spec.wave;game.waveAnnounced=Math.max(game.waveAnnounced,spec.wave);game.waveSpawned++;
      const enemy=game.spawn({...spec,row:state.row,type:'momonga'});
      if(enemy){enemy.x=Math.max(state.col+3.5,Math.min(game.getBoard().cols-.5,state.col+5));state.practiceId=enemy.id;}
      state.killBaseline=game.kills;stage('enemy');
    }
    function observe(event){
      if(!state||!event)return false;
      const at=event.row===state.row&&event.col===state.col;
      if(state.stage==='sun'&&event.type==='sun'){stage('plant');return true;}
      if(state.stage==='plant'&&event.type==='plant'&&event.plantType==='sunflower'&&at){stage('shovel');return true;}
      if(state.stage==='shovel'&&event.type==='shovel'&&at){stage('shooter');return true;}
      if(state.stage==='shooter'&&event.type==='plant'&&event.plantType===state.shooter&&at){spawnPractice();return true;}
      if(state.stage==='enemy'&&event.type==='defeat'&&game.kills>state.killBaseline){finish('complete');return true;}
      if(state.stage==='lily'&&event.type==='plant'&&event.plantType===state.support&&at){stage('waterPlant');return true;}
      if(state.stage==='waterPlant'&&event.type==='plant'&&event.plantType===state.shooter&&at){finish('complete');return true;}
      return false;
    }
    function getState(){
      if(!state)return {active:false,completed:{...progress},saveError};
      const steps=state.kind==='intro'?['sun','plant','shovel','shooter','enemy']:['lily','waterPlant'];
      const expected=state.stage==='plant'?'sunflower':state.stage==='shooter'||state.stage==='waterPlant'?state.shooter:state.stage==='lily'?state.support:null;
      return {...state,active:true,title:TEXT[state.stage][0],text:state.stage==='waterPlant'?'选择'+engine.PLANTS[state.shooter].name+'，种在刚铺好的荷叶上。':state.stage==='lily'?'选择'+engine.PLANTS[state.support].name+'，先铺在亮起的水面格子。':TEXT[state.stage][1],step:steps.indexOf(state.stage)+1,total:steps.length,expectedPlant:expected,blocksAutoCollect:state.stage==='sun',freezeSpawns:true,completed:{...progress},saveError};
    }
    return Object.freeze({begin,beforeStep,observe,allow,getState,skip:()=>finish('skipped'),cancel(){state=null;emit();},retrySave:persist,STORAGE_KEY});
  }
  return Object.freeze({create,STORAGE_KEY});
});
