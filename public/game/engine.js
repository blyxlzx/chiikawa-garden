/* Chiikawa Garden — dependency-free simulation, browser + Node.
 * const game = new GardenEngine.Game({seed: 42}); game.start('meadow');
 * Advance with update(seconds). Coordinates use board grid units; a cell's
 * centre is (col + .5, row + .5). UI owns selection and drains game.events.
 * Commands return {ok, reason?}; cooldowns[type] is seconds remaining.
 */
(function (root, factory) {
  const feedback = typeof module === 'object' && module.exports ? require('./shared/combat-feedback.js') : root.GardenCombatFeedback;
  const director = typeof module === 'object' && module.exports ? require('./shared/run-director.js') : root.GardenRunDirector;
  const nativeRestoreDependencies=typeof module === 'object' && module.exports ? require('./shared/prepared-restore-dependencies.js') : root.GardenPreparedRestoreDependencies;
  const api = factory(feedback, typeof module === 'object' && module.exports ? require('./shared/scene-terrain.js') : root.GardenSceneTerrain, director, nativeRestoreDependencies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (combatFeedback, sceneTerrain, runDirector, nativeRestoreDependencies) {
  'use strict';
  if(!sceneTerrain)throw new Error('GardenSceneTerrain must load before GardenEngine');

  const PLANTS = Object.freeze({
    sunflower: { name: '乌萨奇向日葵', cost: 50, cooldown: 5, hp: 180, interval: 13, role:'阳光生产', motionKind:'sunflower', tip:'先在后排建立阳光收入，再补上前排伙伴。', description: '首次 8 秒、之后每 13 秒生产 25 阳光' },
    pea: { name: '小八豌豆射手', cost: 100, cooldown: 5, hp: 220, interval: 1.5, damage: 28, range: 10, role:'整行射击', motionKind:'pea', tip:'适合放在后排，持续守护一整条草坪。', description: '向前发射豌豆，守护整条草坪' },
    mushroom: { name: '栗子馒头喷菇', cost: 75, cooldown: 6, hp: 220, interval: 1.5, damage: 20, range: 3.2, role:'穿透击退', motionKind:'mushroom', tip:'放在坚果后方，喷雾击退整群来客；同一目标每 3 秒至多击退一次。', description: '喷雾穿透前方 3.2 格，造成 20 伤害并击退 0.35 格；首领位移减弱' },
    mine: { name: '吉伊土豆地雷', cost: 25, cooldown: 25, hp: 120, armTime: 12, damage: 600, range: 1.2, role:'埋伏爆破', motionKind:'mine', tip:'提前种下，留出 12 秒准备时间；不适合临时救场。', description: '准备 12 秒后触发近处同一行爆炸，造成 600 点伤害' },
    cherry: { name: '双子樱桃炸弹', cost: 150, cooldown: 35, hp: 9999, fuse: 1, damage: 1500, range: 1.65, role:'范围爆破', motionKind:'cherry', tip:'留给多行同时告急的密集来客，使用后需要较久冷却。', description: '准备 1 秒后，对周围 3 × 3 范围造成 1500 点伤害' },
    snowpea: { name:'小八寒冰豌豆', cost:175, cooldown:5, hp:220, interval:1.5, damage:28, range:10, role:'远程冰冻', motionKind:'pea', tip:'与坚果搭配，既延缓前进，也降低敌人的啃咬伤害。', description:'冰豌豆使目标移动和啃咬速度减半，持续 4 秒' },
    repeater: { name:'小八双发射手', cost:200, cooldown:5, hp:220, interval:1.5, damage:28, range:10, role:'双发输出', motionKind:'pea', tip:'每轮连续两发，适合对付耐打的那孩子。', description:'每轮相隔 0.18 秒连续发射两颗豌豆' },
    wallnut: { name:'吉伊坚果', cost:50, cooldown:18, hp:1600, role:'前排守护', motionKind:'sunflower', tip:'挡在射手前面，受伤后记得及时补位。', description:'拥有 1600 点生命，挡住来客保护后排' },
    jalapeno: { name:'乌萨奇火爆辣椒', cost:150, cooldown:35, hp:9999, fuse:1, damage:1500, range:10, role:'整行爆破', motionKind:'cherry', tip:'处理同一行分散的来客；价格和樱桃相同，按敌人位置选择。', description:'准备 1 秒后，对一整行造成 1500 点伤害' },
    rakko: { name:'海獭师傅', cost:150, cooldown:8, hp:450, interval:1.5, damage:50, range:1.65, role:'近战守护', motionKind:'pea', tip:'可以站在坚果后面一格挥剑；单独迎战首领仍需要支援。', description:'拥有 450 生命，挥剑攻击前方 1.65 格内的一个目标，造成 50 点伤害' },
    shisa: { name:'狮萨面摊', cost:100, cooldown:8, hp:240, interval:13, produceValue:50, role:'双份阳光', motionKind:'sunflower', tip:'一个格子的产量等于两株向日葵，适合阳光充足后补建。', description:'首次 8 秒、之后每 13 秒送出价值 50 的阳光' },
    kani: { name:'古本屋应援', cost:75, cooldown:10, hp:220, supportInterval:6, heal:75, range:1.5, role:'邻格治疗', motionKind:'sunflower', tip:'放在两三个前排伙伴之间，同时治疗多个受伤伙伴更划算。', description:'每 6 秒为周围 3 × 3 内其他存活伙伴恢复 75 生命' },
    starfruit: { name:'吉伊星星果', cost:175, cooldown:7, hp:240, interval:1.5, damage:24, range:10, role:'三线星光', motionKind:'pea', tip:'放在中间三行，同时支援上、中、下三条路线。', description:'每轮向本行和相邻两行各发射一颗星弹，每颗造成 24 伤害' },
    magnet: { name:'小八磁力菇', cost:125, cooldown:8, hp:260, interval:1.5, damage:18, range:3.2, role:'吸走护甲', motionKind:'pea', tip:'靠近铁盔来客放置；磁力无视护甲，并吸走目标 35% 的护甲上限。', description:'锁定本行 3.2 格内最近目标，造成 18 伤害；每次吸走 35% 最大护甲' },
    stormreed: { name:'乌萨奇闪电芦苇', cost:200, cooldown:8, hp:220, interval:1.5, damage:38, range:4.5, unlimitedRange:true, role:'无限雷击', motionKind:'pea', tip:'种在后排也能锁定前方本行任意距离的来客，闪电最多连锁到附近另外两位目标。', description:'不限距离雷击前方本行最近目标并连锁 2 次，每次保留 70% 伤害，同一目标每轮只命中一次' },
    lily: { name:'荷叶', cost:25, cooldown:5, hp:180, support:true, motionKind:'lily', role:'水面搭台', tip:'先在水面种荷叶，再在上面放一位伙伴。铲除时先移走上层伙伴。', description:'只能种在水面，承载一位普通伙伴；荷叶拥有 180 生命' },
    frostlily: { name:'冰雾荷叶', cost:75, cooldown:10, hp:180, support:true, moveFactor:.7, motionKind:'lily', role:'水面减速', tip:'同格及前方一格的敌人移速降低 30%；多片冰雾不叠加，也不会降低啃咬速度。', description:'承载一位伙伴，同格及前方一格的敌人移速降低 30%，可与寒冰豌豆叠加' },
    guardlily: { name:'守护荷叶', cost:100, cooldown:18, hp:180, support:true, shield:180, shieldRatio:1, motionKind:'lily', role:'生命比例护盾', tip:'护盾等于上层伙伴最大生命的 100%；换人或升级保持剩余比例，不会免费回满。', description:'为上层伙伴提供其最大生命 100% 的护盾；每升一级比例增加 5 个百分点，空荷叶仍直接受伤' },
    powerlily: { name:'应援荷叶', cost:100, cooldown:10, hp:180, support:true, damageBonus:.3, motionKind:'lily', role:'水面增伤', tip:'与狮萨鼓舞相乘，同类应援取最强；不强化炸弹或生产。', description:'承载一位伙伴，使同格射手、喷菇和海獭伤害提高 30%' },
    hastelily: { name:'疾风荷叶', cost:100, cooldown:10, hp:180, support:true, attackRate:1.25, attackRateCap:1.6, burstAttackRateCap:1.75, motionKind:'lily', role:'水面攻速', tip:'不加快生产、治疗和引信。连射仍间隔0.18秒，同类加速取最强。', description:'承托植物，上层射手、喷菇和海獭的攻击频率提高25%。' }
  });
  const ENEMIES = Object.freeze({
    momonga: { name: '飞鼠', hp: 140, speed: 0.155, damage: 32, role:'普通来客', motionKind:'momonga', description:'悠哉走来，遇到伙伴就停下来啃咬。', counter:'一名豌豆射手就能稳定守住。' },
    anoko: { name: '那孩子', hp: 410, speed: 0.12, damage: 38, role:'重装来客', motionKind:'anoko', description:'脚步较慢，生命比普通来客更高。', counter:'双发射手持续输出，或用地雷提前埋伏。' },
    chimera: { name: '夜行触手怪', hp: 210, speed: 0.14, damage: 34, role:'暴走来客', motionKind:'chimera', description:'挥动触手前进；生命低于一半时会停顿，然后加速冲来。', counter:'寒冰减速，或趁停顿时集中火力。' },
    runner: { name:'迅捷飞鼠', hp:120, speed:.23, damage:30, role:'快速来客', motionKind:'momonga', description:'生命较少，但会更快接近后排。', counter:'寒冰豌豆配合坚果，稳稳拦下冲刺。' },
    pinkchimera: { name:'粉色奇美拉', hp:260, speed:.14, damage:40, role:'强壮来客', motionKind:'momonga', description:'步伐稳定、啃咬更有力，持续向花园推进。', counter:'坚果拖住脚步，双发射手尽早集火。' },
    boss: { name:'暴走那孩子', hp:850, speed:.10, damage:55, rageSpeed:1.5, role:'首领来客', motionKind:'anoko', description:'生命低于一半时短暂停顿，随后移动与啃咬加快。', counter:'寒冰与双发协作，留一张整行爆破应急。' },
    helmet: { name:'铁盔飞鼠', hp:180, armor:260, speed:.13, damage:34, role:'铁盔护甲', motionKind:'momonga', description:'260 护甲先承受伤害，护甲耗尽后才会失去生命。', counter:'小八磁力菇能按护甲上限吸走护甲。' },
    drummer: { name:'鼓手奇美拉', hp:230, speed:.13, damage:28, role:'群体鼓舞', motionKind:'chimera', description:'附近 1.6 格、相邻行的其他来客移动和啃咬速度提高 20%，不叠加；冻结或眩晕时停止。', counter:'优先集火鼓手，或者用寒冰中断鼓舞。' },
    healer: { name:'药草飞鼠', hp:250, speed:.12, damage:26, role:'群体治疗', motionKind:'momonga', description:'每 5 秒为附近 1.5 格、相邻行的其他来客恢复 8% 最大生命，不恢复护甲；冻结时停止。', counter:'闪电和星星果同时削弱治疗者与其同伴。' }
  });
  // Derived combat data stays outside game/save state. Keep combat and upgrade
  // preview levels together so drawing a preview cannot evict every live stat.
  const plantStatCaches = new WeakMap();
  const battleIndexes = new WeakMap();
  const supportIndexes = new WeakMap();
  const terrainLookups = new WeakMap();
  const perkWorkspaces = new WeakMap();
  // Only an authoritative owner with no untracked writes opts in. Public Game
  // instances retain the full live signature scan, including unusual inputs.
  const authoritativeFields = new WeakMap();
  function ordinaryAuthorityField(field) {
    if(!field||Object.getPrototypeOf(field)!==Object.prototype)return false;
    const allowed=['id','kind','x','row','radius','rows','age','duration','damage','sourceType','moveFactor','weaken'];
    for(const key of Reflect.ownKeys(field)){
      const descriptor=Object.getOwnPropertyDescriptor(field,key);
      if(!allowed.includes(key)||!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))return false;
    }
    for(const key of ['id','kind','x','row','radius','rows','age','duration','damage','sourceType'])if(!Object.prototype.hasOwnProperty.call(field,key))return false;
    for(const key of ['moveFactor','weaken'])if(!Object.prototype.hasOwnProperty.call(field,key)&&key in field)return false;
    return Number.isSafeInteger(field.id)&&field.id>0&&typeof field.sourceType==='string'&&['burn','slow','spore'].includes(field.kind)&&Number.isFinite(field.x)&&Number.isInteger(field.row)&&Number.isInteger(field.rows)&&field.rows>=0&&Number.isFinite(field.radius)&&field.radius>=0&&Number.isFinite(field.age)&&field.age>=0&&Number.isFinite(field.duration)&&field.duration>0&&field.age<field.duration&&Number.isFinite(field.damage)&&field.damage>=0&&(field.moveFactor===undefined||Number.isFinite(field.moveFactor))&&(field.weaken===undefined||typeof field.weaken==='boolean');
  }
  function authorityFieldState(game) {
    const state=authoritativeFields.get(game),fields=game.perkFields;
    if(!state)return null;
    if(state.fields!==fields||state.length!==fields.length){
      state.fields=fields;state.length=fields.length;state.generation++;state.workspace=null;
      const seen=new Set();state.ordinary=Array.isArray(fields)&&Object.getPrototypeOf(fields)===Array.prototype;
      if(state.ordinary)for(const key of Reflect.ownKeys(fields))if(key!=='length'&&(typeof key!=='string'||! /^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=fields.length)){state.ordinary=false;break;}
      for(let i=0;state.ordinary&&i<fields.length;i++){
        const descriptor=Object.getOwnPropertyDescriptor(fields,String(i)),field=descriptor&&descriptor.value;
        if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||seen.has(field)||!ordinaryAuthorityField(field))state.ordinary=false;
        else seen.add(field);
      }
    }
    return state.ordinary?state:null;
  }
  function authorityFieldMutation(game,field,changed,added) {
    const state=authoritativeFields.get(game);
    if(!state)return;
    // A replacement, sparse input, or external array mutation is validated
    // before any trusted reuse. Internal pushes preserve the recorded identity.
    if(state.fields!==game.perkFields||state.length+(added?1:0)!==game.perkFields.length){state.fields=null;state.workspace=null;return;}
    state.length=game.perkFields.length;
    if(state.ordinary&&(added?!ordinaryAuthorityField(field):!Number.isFinite(field.age)||!Number.isFinite(field.duration)||field.duration<=0||!Number.isFinite(field.damage)||field.damage<0||!Number.isFinite(field.radius)||field.radius<0||!Number.isInteger(field.rows)||field.rows<0))state.ordinary=false;
    const priorGeneration=state.generation;
    if(changed||!state.ordinary)state.generation++;
    if(!state.ordinary)state.workspace=null;
    else if(changed&&state.workspace&&state.workspace.authorityGeneration===priorGeneration){
      mutateAuthorityRows(state.workspace,field,added?1:0);
      state.workspace.authorityGeneration=state.generation;
    }
  }
  function resetFieldAuthority(game) {
    if(authoritativeFields.has(game))authoritativeFields.set(game,{fields:null,length:0,generation:0,ordinary:false,workspace:null});
  }
  // Closed-owner mutations never relocate an existing field: the merge's
  // find predicate fixes kind, x, row, radius, rows, movement and weakening.
  // Appends remain last in every lane; deletion preserves the survivors'
  // original order. A dirty lane records references, not copied snapshots.
  function mutateAuthorityRows(work,field,operation) {
    for(let row=Math.max(0,Math.ceil(field.row-field.rows));row<=Math.min(work.rows-1,Math.floor(field.row+field.rows));row++){
      const lane=work.authorityRows[row],fields=work.fieldsByRow[row];
      if(operation>0)fields.push(field);
      else if(operation<0){const index=fields.indexOf(field);if(index>=0)fields.splice(index,1);}
      mutateAuthorityBucket(work,row,field,operation);
      if(!lane.pending){lane.pending=true;lane.generation++;lane.changed.length=0;}
      // Consecutive refreshes of one cloud need a single exact footprint.
      if(lane.changed[lane.changed.length-1]!==field)lane.changed.push(field);
    }
  }
  // The closed field owner changes damage/age on a merge, never geometry.
  // Derive the identical conservative ULP boundaries once per live footprint;
  // the inclusive hit test itself still uses the original subtraction below.
  const authorityFieldEdgesCache=new WeakMap();
  function authorityFieldEdges(field) {
    let edge=authorityFieldEdgesCache.get(field);
    if(!edge||edge.x!==field.x||edge.radius!==field.radius||edge.kind!==field.kind){
      const margin=Number.EPSILON*8*Math.max(1,Math.abs(field.x),field.radius),lower=field.x-field.radius,upper=field.x+field.radius;
      edge={x:field.x,radius:field.radius,kind:field.kind,innerLeft:lower+margin,innerRight:upper-margin,outerLeft:lower-margin,outerRight:upper+margin,slot:field.kind==='burn'?0:field.kind==='slow'?1:2};
      authorityFieldEdgesCache.set(field,edge);
    }
    return edge;
  }
  // A bucket only limits the candidate list. Exact Math.abs hit tests and
  // insertion order remain unchanged, and match reuse never crosses its ULP
  // inner edges. Unknown/huge footprints retain the complete lane traversal.
  const emptyAuthorityBucket=Object.freeze([]);
  function authorityBucketRange(field) {
    const edge=authorityFieldEdges(field);
    if(edge.bucketChecked)return edge.bucketSafe?edge:null;
    edge.bucketChecked=true;
    const lo=Math.floor(edge.outerLeft),hi=Math.floor(edge.outerRight);
    edge.bucketSafe=Number.isSafeInteger(lo)&&Number.isSafeInteger(hi)&&Math.abs(lo)<4503599627370496&&Math.abs(hi)<4503599627370496&&hi>=lo&&hi-lo<=64;
    edge.bucketLo=lo;edge.bucketHi=hi;
    return edge.bucketSafe?edge:null;
  }
  function buildAuthorityBuckets(work) {
    const buckets=Array.from({length:work.rows},()=>new Map());
    for(let row=0;row<work.rows;row++)for(const field of work.fieldsByRow[row]){
      const edge=authorityBucketRange(field);if(!edge)return null;
      for(let bin=edge.bucketLo;bin<=edge.bucketHi;bin++){
        let fields=buckets[row].get(bin);if(!fields)buckets[row].set(bin,fields=[]);
        fields.push(field);
      }
    }
    return buckets;
  }
  function mutateAuthorityBucket(work,row,field,operation) {
    if(!work.authorityBuckets||operation===0)return;
    const edge=authorityBucketRange(field);if(!edge){work.authorityBuckets=null;return;}
    const buckets=work.authorityBuckets[row];
    for(let bin=edge.bucketLo;bin<=edge.bucketHi;bin++){
      let fields=buckets.get(bin);
      if(operation>0){if(!fields)buckets.set(bin,fields=[]);fields.push(field);}
      else if(fields){const index=fields.indexOf(field);if(index>=0)fields.splice(index,1);if(!fields.length)buckets.delete(bin);}
    }
  }
  function reuseAuthorityRowMatch(lane,match,enemy) {
    if(match.generation!==lane.generation-1||!Number.isFinite(enemy.x))return false;
    let left=match.left,right=match.right;
    for(const field of lane.changed){
      // New, changed and removed fields all invalidate their inclusive
      // footprint. A removed outside footprint only narrows conservatively.
      if(!(Math.abs(enemy.x-field.x)>field.radius))return false;
      const edge=authorityFieldEdges(field);
      if(enemy.x<field.x)right=Math.min(right,edge.outerLeft);
      else left=Math.max(left,edge.outerRight);
    }
    match.generation=lane.generation;match.x=enemy.x;match.left=left;match.right=right;
    return true;
  }
  function refreshFieldDeltas(work,fields) {
    const priorGeneration=work.generation,nextGeneration=priorGeneration+1,records=work.fieldRecords;
    work.deltas.length=0;work.deltaValid=work.priorUnique!==false;
    let lastOrder=-1,unique=true;
    for(let i=0;i<fields.length;i++){
      const field=fields[i],prior=records.get(field),active=!(field.age>=field.duration);
      if(prior&&prior.seen===nextGeneration){work.deltaValid=false;unique=false;}
      const existed=prior&&prior.seen===priorGeneration;
      if(existed){if(prior.order<lastOrder)work.deltaValid=false;lastOrder=prior.order;}
      const same=existed&&prior.kind===field.kind&&prior.x===field.x&&prior.row===field.row&&prior.radius===field.radius&&prior.rows===field.rows&&prior.damage===field.damage&&prior.moveFactor===field.moveFactor&&prior.weaken===field.weaken&&prior.active===active;
      let current=prior;
      if(!same){
        current={kind:field.kind,x:field.x,row:field.row,radius:field.radius,rows:field.rows,damage:field.damage,moveFactor:field.moveFactor,weaken:field.weaken,active};
        work.deltas.push({before:existed?prior:null,after:current});records.set(field,current);
      }
      current.order=i;current.seen=nextGeneration;
    }
    for(const field of work.priorFields){const prior=records.get(field);if(prior&&prior.seen!==nextGeneration)work.deltas.push({before:prior,after:null});}
    work.priorUnique=unique;
    work.priorFields.length=0;for(const field of fields)work.priorFields.push(field);
  }
  function fieldRecordReaches(record,row,rows) {
    return record&&record.active&&row>=Math.max(0,Math.ceil(record.row-record.rows))&&row<=Math.min(rows-1,Math.floor(record.row+record.rows));
  }
  function reuseChangedFieldMatch(work,match,enemy) {
    if(!work.deltaValid||match.generation!==work.generation-1||!Number.isInteger(enemy.row)||!Number.isFinite(enemy.x))return false;
    let left=match.left,right=match.right;
    for(const delta of work.deltas){
      const prior=delta.before,field=delta.after;
      if(fieldRecordReaches(prior,enemy.row,work.rows)&&!(Math.abs(enemy.x-prior.x)>prior.radius))return false;
      if(!fieldRecordReaches(field,enemy.row,work.rows))continue;
      if(!(Math.abs(enemy.x-field.x)>field.radius))return false;
      // A newly introduced outside footprint can only narrow the old safe
      // interval. At an exact edge the original subtraction is still used.
      if(Number.isFinite(field.x)&&Number.isFinite(field.radius)&&field.radius>=0){
        const margin=Number.EPSILON*8*Math.max(1,Math.abs(field.x),field.radius),lower=field.x-field.radius,upper=field.x+field.radius;
        if(enemy.x<field.x)right=Math.min(right,lower-margin);
        else left=Math.max(left,upper+margin);
      }else{left=enemy.x;right=enemy.x;}
    }
    match.generation=work.generation;match.x=enemy.x;match.left=left;match.right=right;
    return true;
  }

  // Explicit closed Worker ownership only. An ordinary Game keeps its original
  // per-tick geometry checks, including all public/custom input semantics.
  const actorAuthorities=new WeakMap();
  const actorAuthorityRoots=['enemies','projectiles','suns','effects','perkFields','perkActions','mowers','cooldowns','growth','strategy','spawnPlan','wavePlantTypes','level','endlessWave'];
  function resetActorAuthority(game){
    const prior=actorAuthorities.get(game);
    if(prior)actorAuthorities.set(game,{initial:true,ordinary:false,active:false,revision:0,roots:null});
  }
  function recordActorAuthority(game,state){
    state.plants=game.plants;state.supports=game.supports;
    state.plantCount=game.plants.length;state.supportCount=game.supports.length;
    state.endless=game.isEndless;state.boardSize=game.endlessBoardSize;
    if(!state.roots)state.roots=new Array(actorAuthorityRoots.length);
    for(let i=0;i<actorAuthorityRoots.length;i++)state.roots[i]=game[actorAuthorityRoots[i]];
  }
  function ordinaryActorAuthority(game){
    // Certify data descriptors once, without executing custom getters. Refuse
    // actor aliases anywhere in the rest of the raw model, so a sun/projectile
    // update cannot secretly relocate an indexed actor. Shared non-actor data
    // are safe: they never mutate these own primitive geometry fields.
    if(game.isEndless!==true||game.level!==ENDLESS)return false;
    const board=game.getBoard(),actors=new Set(),actorArrays=new Set([game.plants,game.supports]);
    if(game.plants===game.supports)return false;
    function dense(array){
      if(!Array.isArray(array)||Object.getPrototypeOf(array)!==Array.prototype||array.length>210)return false;
      const keys=Reflect.ownKeys(array);if(keys.length!==array.length+1)return false;
      for(let i=0;i<array.length;i++){const d=Object.getOwnPropertyDescriptor(array,String(i));if(!d||!Object.prototype.hasOwnProperty.call(d,'value'))return false;}
      return true;
    }
    for(const [array,support] of [[game.plants,false],[game.supports,true]]){
      if(!dense(array))return false;
      for(const actor of array){
        if(!actor||typeof actor!=='object'||Array.isArray(actor)||actors.has(actor))return false;
        const proto=Object.getPrototypeOf(actor);if(proto!==Object.prototype&&proto!==null)return false;
        for(const key of Reflect.ownKeys(actor)){
          const d=Object.getOwnPropertyDescriptor(actor,key);
          if(typeof key!=='string'||!d||!Object.prototype.hasOwnProperty.call(d,'value')||!d.writable)return false;
        }
        for(const key of ['id','type','row','col','x'])if(!Object.prototype.hasOwnProperty.call(actor,key))return false;
        if('support' in actor&&!Object.prototype.hasOwnProperty.call(actor,'support'))return false;
        if(support?actor.support!==true:actor.support!==undefined&&actor.support!==false)return false;
        if(!Number.isSafeInteger(actor.id)||actor.id<=0||!Object.prototype.hasOwnProperty.call(PLANTS,actor.type)||!!PLANTS[actor.type].support!==support||!!actor.support!==support||
          !Number.isInteger(actor.row)||actor.row<0||actor.row>=board.rows||!Number.isInteger(actor.col)||actor.col<0||actor.col>=board.cols||actor.x!==actor.col+.5)return false;
        actors.add(actor);
      }
    }
    const visited=new WeakSet();let budget=120000;
    function visit(value,depth=0){
      if(--budget<0||depth>20)return false;
      if(value===null||typeof value!=='object')return typeof value!=='function'&&typeof value!=='symbol';
      if(actors.has(value)||actorArrays.has(value))return false;
      if(visited.has(value))return true;visited.add(value);
      const proto=Object.getPrototypeOf(value);
      if(value instanceof Set){
        if(proto!==Set.prototype||Reflect.ownKeys(value).length)return false;
        for(const item of Set.prototype.values.call(value))if(!visit(item,depth+1))return false;
        return true;
      }
      if(Array.isArray(value)){if(proto!==Array.prototype)return false;}
      else if(proto!==Object.prototype&&proto!==null)return false;
      for(const key of Reflect.ownKeys(value)){
        const d=Object.getOwnPropertyDescriptor(value,key);
        if(typeof key!=='string'||!d||!Object.prototype.hasOwnProperty.call(d,'value')||!visit(d.value,depth+1))return false;
      }
      return true;
    }
    for(const actor of actors)for(const key of Reflect.ownKeys(actor))if(!visit(Object.getOwnPropertyDescriptor(actor,key).value))return false;
    for(const key of Object.keys(game)){
      const d=Object.getOwnPropertyDescriptor(game,key);if(!d||!Object.prototype.hasOwnProperty.call(d,'value'))return false;
      // The engine-owned immutable ENDLESS definition has a legitimate
      // recommendedDeck accessor; it cannot alias per-run indexed actors.
      if(key!=='plants'&&key!=='supports'&&key!=='level'&&!visit(d.value))return false;
    }
    return true;
  }
  function beginActorAuthority(game){
    const state=actorAuthorities.get(game);if(!state)return;
    if(state.initial){state.initial=false;state.ordinary=ordinaryActorAuthority(game);if(state.ordinary)recordActorAuthority(game,state);}
    if(state.ordinary&&(state.plants!==game.plants||state.supports!==game.supports||state.plantCount!==game.plants.length||state.supportCount!==game.supports.length||
      state.endless!==game.isEndless||state.boardSize!==game.endlessBoardSize))state.ordinary=false;
    if(state.ordinary)for(let i=0;i<actorAuthorityRoots.length;i++)if(state.roots[i]!==game[actorAuthorityRoots[i]]){state.ordinary=false;break;}
    state.active=state.ordinary;
  }
  function endActorAuthority(game){
    const state=actorAuthorities.get(game);if(!state)return;
    if(state.active)recordActorAuthority(game,state);state.active=false;
  }
  function actorTopologyChanged(game){
    const state=actorAuthorities.get(game);if(!state||!state.ordinary)return;
    state.revision++;state.plants=game.plants;state.supports=game.supports;
    state.plantCount=game.plants.length;state.supportCount=game.supports.length;
  }
  function activeActorAuthority(game){const state=actorAuthorities.get(game);return state&&state.active&&state.ordinary?state:null;}

  const contactWorkspaces = new WeakMap();
  const attackAuraWorkspaces = new WeakMap();
  // Only the engine's tick uses these immutable derived aura values. Public
  // supportAttack still scans live actors and returns an independent object.
  function tickSupportAttack(game,plant) {
    const index=game.activeSupportIndex();
    if(!index||!Number.isInteger(plant.row)||!Number.isInteger(plant.col)||plant.row<0||plant.row>=index.rows||plant.col<0||plant.col>=index.cols)return game.supportAttack(plant);
    let work=attackAuraWorkspaces.get(game);
    if(!work||work.index!==index){work={index,version:-1,checkedTick:-1,signature:[],cells:[]};attackAuraWorkspaces.set(game,work);}
    const powerLevel=game.isEndless?game.growth.powerlily.level:null,hasteLevel=game.isEndless?game.growth.hastelily.level:null;
    if(work.checkedTick!==game.simulationTick||work.version!==index.version||work.powerLevel!==powerLevel||work.hasteLevel!==hasteLevel||work.endless!==game.isEndless||work.boardSize!==game.endlessBoardSize){
      let changed=work.version!==index.version||work.powerLevel!==powerLevel||work.hasteLevel!==hasteLevel||work.endless!==game.isEndless||work.boardSize!==game.endlessBoardSize||work.signature.length!==game.supports.length*4;
      for(let i=0;i<game.supports.length;i++){
        const leaf=game.supports[i],at=i*4,prior=work.signature;
        const alive=!(leaf.hp<=0),burst=(leaf.hasteBurstUntil||0)>game.time,team=(leaf.teamHasteUntil||0)>game.time;
        if(prior[at]!==leaf.type||prior[at+1]!==alive||prior[at+2]!==burst||prior[at+3]!==team)changed=true;
        prior[at]=leaf.type;prior[at+1]=alive;prior[at+2]=burst;prior[at+3]=team;
      }
      work.signature.length=game.supports.length*4;
      if(changed){
        const count=index.rows*index.cols;
        if(work.cells.length!==count)work.cells=Array.from({length:count},()=>({powerSource:null,powerBonus:0,hasteSource:null,attackRate:1}));
        else for(const cell of work.cells){cell.powerSource=null;cell.powerBonus=0;cell.hasteSource=null;cell.attackRate=1;}
        let powerStats,hasteStats;
        // Sources stay in the original order, including equal-strength ties.
        for(const leaf of game.supports){
          if(leaf.hp<=0||(leaf.type!=='powerlily'&&leaf.type!=='hastelily')||!Number.isInteger(leaf.row)||!Number.isInteger(leaf.col)||leaf.row<0||leaf.row>=index.rows||leaf.col<0||leaf.col>=index.cols)continue;
          const power=leaf.type==='powerlily',spec=power?(powerStats||(powerStats=game.combatPlantStats('powerlily'))):(hasteStats||(hasteStats=game.combatPlantStats('hastelily'))),m=spec.mechanics||{};
          for(let row=Math.max(0,leaf.row-1);row<=Math.min(index.rows-1,leaf.row+1);row++)for(let col=Math.max(0,leaf.col-1);col<=Math.min(index.cols-1,leaf.col+1);col++){
            const cell=work.cells[row*index.cols+col],same=row===leaf.row&&col===leaf.col;
            if(power){const bonus=same?spec.damageBonus:m.neighborAura?spec.damageBonus*.5:0;if(bonus>cell.powerBonus){cell.powerBonus=bonus;cell.powerSource=leaf;}}
            else{const rate=same?Math.min(spec.burstAttackRateCap,spec.attackRate+((leaf.hasteBurstUntil||0)>game.time?.15:0)):(leaf.teamHasteUntil||0)>game.time?1.12:1;if(rate>cell.attackRate){cell.attackRate=rate;cell.hasteSource=leaf;}}
          }
        }
      }
      work.version=index.version;work.checkedTick=game.simulationTick;work.powerLevel=powerLevel;work.hasteLevel=hasteLevel;work.endless=game.isEndless;work.boardSize=game.endlessBoardSize;
    }
    const result=work.cells[plant.row*index.cols+plant.col];
    plant.supportDamageBonus=result.powerBonus;plant.supportAttackRate=result.attackRate;
    plant.supportPowerSourceId=result.powerSource?result.powerSource.id:null;plant.supportHasteSourceId=result.hasteSource?result.hasteSource.id:null;
    return result;
  }
  function contactRows(game) {
    const rows=game.getBoard().rows;
    let work=contactWorkspaces.get(game),changed=!work||work.rows!==rows;
    if(!work||work.rows!==rows){work={rows,topology:[],byRow:Array.from({length:rows},()=>[]),finite:Array(rows).fill(true)};contactWorkspaces.set(game,work);}
    const authority=activeActorAuthority(game);
    if(authority&&!changed&&work.authorityRevision===authority.revision)return work;
    let at=0;
    for(const actors of [game.plants,game.supports])for(const actor of actors){
      if(work.topology[at]!==actor||work.topology[at+1]!==actor.row||work.topology[at+2]!==actor.x||work.topology[at+3]!==actor.support)changed=true;
      at+=4;
    }
    if(work.topology.length!==at)changed=true;
    if(!changed){work.authorityRevision=authority?authority.revision:undefined;return work;}
    work.topology.length=0;
    for(let row=0;row<rows;row++){work.byRow[row].length=0;work.finite[row]=true;}
    for(const actors of [game.plants,game.supports])for(const actor of actors){
      work.topology.push(actor,actor.row,actor.x,actor.support);
      work.byRow[actor.row].push(actor);
      if(!Number.isFinite(actor.x))work.finite[actor.row]=false;
    }
    // Stable equal-x order retains the first upper partner, then the first
    // support, exactly as the source-order scan. Health stays live per visitor.
    for(let row=0;row<rows;row++)if(work.finite[row])work.byRow[row].sort((a,b)=>b.x-a.x||Number(!!a.support)-Number(!!b.support));
    work.authorityRevision=authority?authority.revision:undefined;
    return work;
  }
  function contactBlocker(work,enemy) {
    const actors=work.byRow[enemy.row];
    if(!work.finite[enemy.row]||!Number.isFinite(enemy.x)){
      let blocker;
      for(const plant of actors){
        if(plant.hp<=0||enemy.x<plant.x-.2||enemy.x-plant.x>.61)continue;
        if(!blocker||plant.x>blocker.x||(plant.x===blocker.x&&blocker.support&&!plant.support))blocker=plant;
      }
      return blocker;
    }
    // Use the original comparisons in the binary search as well: rewriting
    // these as enemy.x + .2 changes membership at adjacent float boundaries.
    let low=0,high=actors.length;
    while(low<high){const mid=(low+high)>>>1;if(enemy.x<actors[mid].x-.2)low=mid+1;else high=mid;}
    for(let i=low;i<actors.length;i++){
      const plant=actors[i];
      if(enemy.x-plant.x>.61)break;
      if(!(plant.hp<=0))return plant;
    }
  }
  const EXPANSION_PLANTS = ['starfruit','magnet','stormreed'];
  const DECK_SIZE = 10;
  const DEFAULT_DECK = Object.freeze(['sunflower','pea','mushroom','mine','cherry','wallnut','snowpea','repeater','starfruit','stormreed']);
  const ENDLESS_BOARD_SIZES = Object.freeze({
    classic:Object.freeze({id:'classic',name:'经典草坪',rows:5,cols:9,countScale:1,hpScale:1,startingSun:250}),
    expanded:Object.freeze({id:'expanded',name:'扩展花园',rows:6,cols:12,countScale:1.6,hpScale:1.1,startingSun:325}),
    grand:Object.freeze({id:'grand',name:'巨型庭院',rows:7,cols:15,countScale:2.4,hpScale:1.2,startingSun:400})
  });
  const knownEndlessBoardSize = id => typeof id==='string'&&Object.prototype.hasOwnProperty.call(ENDLESS_BOARD_SIZES,id);
  // Terrain changes placement and walking only. Weapon and bite clocks keep
  // their existing timing. Mixed maps preserve a clear rear lawn; full-water
  // maps deliberately require an inexpensive lily under every land plant.
  const TERRAIN_TILES = Object.freeze(Object.fromEntries([
    ['grass','草地',true,1,''],
    ['water','浅溪',false,.8,'这里是水面，先种荷叶再放伙伴'],
    ['bridge','木桥',true,1,''],
    ['rubble','碎石',false,1,'碎石占住了格子，请选择旁边的空地'],
    ['ice','薄冰',true,1.18,''],
    ['mud','泥地',true,.78,''],
    ['bed','花圃',true,1,''],
    ['roof','天窗',false,1,'天窗不能种植，请选择屋顶花圃']
  ].map(([kind,name,plantable,speed,reason])=>[kind,Object.freeze({kind,name,plantable,speed,reason})])));
  function terrainMap(id,name,description,tip,fill,patches,details={}) {
    const tiles=Array.from({length:5},()=>Array(9).fill(fill));
    for(const [kind,cells] of patches)for(const [row,col] of cells)tiles[row][col]=kind;
    return Object.freeze({...details,id,name,description,tip,rows:5,cols:9,tiles:Object.freeze(tiles.map(row=>Object.freeze(row)))});
  }
  const WATER_DECK=Object.freeze(['lily','sunflower','pea','mushroom','snowpea','repeater','wallnut','cherry','starfruit','stormreed']);
  const MAPS = Object.freeze({
    garden:terrainMap('garden','晴日花园','开阔草坪，五条路线自由布阵。','所有格子都能种植，先在后排建立阳光收入。','grass',[]),
    brook:terrainMap('brook','溪流木桥','浅溪穿过草坪，两座木桥连接两岸。','水面先种荷叶再放伙伴；涉水来客移速降低 20%，木桥可直接布阵。','grass',[
      ['water',[[0,4],[0,5],[2,4],[2,5],[4,4],[4,5]]],['bridge',[[1,4],[1,5],[3,4],[3,5]]]
    ]),
    ruins:terrainMap('ruins','石门遗迹','石道上的碎石打散了前排阵形。','碎石不能种植，来客仍能通过；留意每行可以补位的空格。','grass',[
      ['rubble',[[0,5],[1,7],[2,4],[3,7],[4,5]]]
    ]),
    frost:terrainMap('frost','霜叶冰原','薄冰横在三条路线前方。','薄冰可以种植，经过的来客移速提高 18%；提前布置减速和守护伙伴。','grass',[
      ['ice',[[0,5],[0,6],[0,7],[2,5],[2,6],[2,7],[4,5],[4,6],[4,7]]]
    ]),
    marsh:terrainMap('marsh','蘑菇沼泽','泥地与水洼交错，适合集中守住窄口。','泥地可种植并使来客移速降低 22%；水洼先种荷叶，再放伙伴。','grass',[
      ['mud',[[1,4],[1,5],[1,6],[3,4],[3,5],[3,6]]],['water',[[0,7],[2,6],[4,7]]]
    ]),
    rooftop:terrainMap('rooftop','屋顶花圃','平坦屋顶上，花床围着天窗排开。','花圃可直接种植，无需花盆；避开天窗，保持每行的防线。','bed',[
      ['roof',[[0,5],[1,7],[2,5],[3,7],[4,5]]]
    ]),
    lagoon:terrainMap('lagoon','晴光荷塘','晴光照亮整片荷塘，每一条路线都是水面。','每格先放 25 阳光的普通荷叶；再种向日葵和豌豆，逐步铺开水上防线。','water',[],{fullWater:true,theme:'day',recommendedDeck:WATER_DECK}),
    moonpool:terrainMap('moonpool','月影水庭','月光映在青石围拢的水庭中，所有路线都铺满幽蓝水面。','整片水面需荷叶承载伙伴；月夜仍会落下阳光，也可种向日葵补充收入。','water',[],{fullWater:true,theme:'night',recommendedDeck:WATER_DECK}),
    tidal:terrainMap('tidal','碧湾潮池','沙岸环抱蓝绿潮池，来客沿水路缓缓靠近。','全部格子都是水面；先用普通荷叶建立产阳光后排，再沿各路补齐火力。','water',[],{fullWater:true,theme:'day',recommendedDeck:WATER_DECK})
  });
  const endlessMapCache = new Map();
  function getLegacyEndlessMap(mapId,boardId='classic') {
    const base=Object.prototype.hasOwnProperty.call(MAPS,mapId)?MAPS[mapId]:MAPS.garden;
    const board=ENDLESS_BOARD_SIZES[knownEndlessBoardSize(boardId)?boardId:'classic'];
    if(board.id==='classic')return base;
    const key=base.id+':'+board.id;
    if(!endlessMapCache.has(key)){
      // Preserve the original lawn and repeat its terrain rhythm into the
      // extension. Mixed maps keep three clear rear columns; full-water maps
      // keep every added cell as water, including the rear and far corners.
      const tiles=Array.from({length:board.rows},(_,row)=>Object.freeze(Array.from({length:board.cols},(_,col)=>base.tiles[row%5][col<3?col:3+(col-3)%6])));
      endlessMapCache.set(key,Object.freeze({...base,rows:board.rows,cols:board.cols,tiles:Object.freeze(tiles)}));
    }
    return endlessMapCache.get(key);
  }
  const sceneMapCache = new Map();
  function getEndlessMap(mapId,boardId='classic',layoutVersion=sceneTerrain.VERSION) {
    const base=Object.prototype.hasOwnProperty.call(MAPS,mapId)?MAPS[mapId]:MAPS.garden;
    const board=ENDLESS_BOARD_SIZES[knownEndlessBoardSize(boardId)?boardId:'classic'];
    const version=layoutVersion===0?0:sceneTerrain.VERSION,key=base.id+':'+board.id+':'+version;
    if(!sceneMapCache.has(key))sceneMapCache.set(key,version===0?
      Object.freeze({...getLegacyEndlessMap(base.id,board.id),sceneLayoutVersion:0,plantingAnchorY:.9}):sceneTerrain.createMap(base,board));
    return sceneMapCache.get(key);
  }
  const LEVEL_MAP_IDS = Object.freeze({
    meadow:'garden',picnic:'garden',moon:'garden',orchard:'garden',ridge:'garden',
    brook:'brook',rain:'brook',
    ruins:'ruins',gate:'ruins',fortress:'ruins',citadel:'ruins',finale:'ruins',laststand:'ruins',
    frost:'frost',cliff:'frost',eclipse:'frost',
    fog:'marsh',thicket:'marsh',marsh:'marsh',storm:'marsh',
    dusk:'rooftop',festival:'rooftop',windmill:'rooftop',lanterns:'rooftop'
  });
  const CHAPTER_NAMES = Object.freeze(['初见花园','山谷远征','长夜守护']);
  function level(spec) {
    const mapId=LEVEL_MAP_IDS[spec.id]||'garden',cards=(spec.deck||DEFAULT_DECK).slice();
    if(MAPS[mapId].tiles.some(row=>row.includes('water'))&&!cards.some(type=>PLANTS[type].support)){
      const slot=cards.includes('kani')?cards.indexOf('kani'):cards.includes('mine')?cards.indexOf('mine'):cards.length-1;
      cards[slot]='lily';
    }
    // Keep existing recommendations and water support in their familiar slots.
    for(const type of ['starfruit','stormreed',...DEFAULT_DECK])if(cards.length<DECK_SIZE&&!cards.includes(type))cards.push(type);
    const deck=Object.freeze(cards);
    const chapter=Math.ceil(spec.index/8);
    return Object.freeze({damageScale:1,...spec,mapId,chapter,chapterName:CHAPTER_NAMES[chapter-1],deck,recommendedDeck:deck});
  }
  const LEVELS = Object.freeze({
    meadow: level({ id:'meadow', index:1, theme:'day', name:'晴天草坪', description:'悠闲开局 · 适合初次见面', difficulty:'轻松', sunInterval:7, speedScale:.92, hpScale:.9, waves:[{at:16,count:4,gap:5},{at:47,count:7,gap:4},{at:82,count:10,gap:3}] }),
    picnic: level({ id:'picnic', index:2, theme:'day', name:'午后野餐', description:'三波来客 · 认真守护点心', difficulty:'标准', sunInterval:7.5, speedScale:1, hpScale:1, waves:[{at:14,count:5,gap:5},{at:52,count:9,gap:3.5},{at:94,count:13,gap:2.6}] }),
    moon: level({ id:'moon', index:3, theme:'night', name:'月光派对', description:'来客加倍 · 考验你的布阵', difficulty:'挑战', sunInterval:8, speedScale:1.08, hpScale:1.08, waves:[{at:12,count:7,gap:4},{at:56,count:12,gap:3},{at:104,count:17,gap:2.4}] }),
    orchard: level({ id:'orchard', index:4, theme:'day', name:'果园追逐', description:'迅捷飞鼠来袭 · 海獭师傅守住前排', difficulty:'标准', sunInterval:7, speedScale:1, hpScale:1, deck:['sunflower','pea','snowpea','rakko','cherry','wallnut','kani','mine'], waves:[{at:17,count:5,gap:5,types:['momonga','runner','momonga']},{at:53,count:9,gap:3.6,types:['runner','momonga','chimera']},{at:99,count:13,gap:2.8,types:['runner','anoko','momonga','runner']}] }),
    dusk: level({ id:'dusk', index:5, theme:'sunset', name:'落日小路', description:'粉色奇美拉到访 · 古本屋为伙伴应援', difficulty:'进阶', sunInterval:7.5, speedScale:1, hpScale:1, deck:['sunflower','pea','repeater','wallnut','kani','snowpea','rakko','cherry'], waves:[{at:17,count:5,gap:5,types:['momonga','pinkchimera','momonga']},{at:56,count:10,gap:3.7,types:['pinkchimera','runner','momonga']},{at:104,count:14,gap:3,types:['anoko','pinkchimera','momonga','runner']}] }),
    fog: level({ id:'fog', index:6, theme:'night', name:'星光蘑菇林', description:'重装与快怪结伴 · 喷雾守住密集路线', difficulty:'进阶', sunInterval:8, speedScale:1.04, hpScale:1.05, deck:['sunflower','pea','mushroom','snowpea','jalapeno','wallnut','mine','kani'], waves:[{at:16,count:8,gap:4,types:['momonga','chimera','runner']},{at:57,count:13,gap:3,types:['pinkchimera','runner','chimera','anoko'],lanes:[0,0,2,2,4,1,3]},{at:108,count:20,gap:2.3,types:['anoko','runner','pinkchimera','momonga','chimera'],lanes:[0,4,1,3,2,2]}] }),
    festival: level({ id:'festival', index:7, theme:'sunset', name:'点心保卫战', description:'四波夹攻 · 狮萨面摊支援持久战', difficulty:'困难', sunInterval:7, speedScale:1.05, hpScale:1.06, deck:['shisa','pea','repeater','wallnut','jalapeno','snowpea','kani','rakko'], waves:[{at:16,count:7,gap:4,types:['runner','momonga','pinkchimera']},{at:58,count:11,gap:3,types:['anoko','runner','momonga','chimera'],lanes:[0,0,4,4,2,1,3]},{at:105,count:15,gap:2.5,types:['pinkchimera','runner','anoko','momonga','chimera']},{at:158,count:18,gap:2.2,types:['anoko','runner','pinkchimera','chimera'],lanes:[0,4,0,4,1,3,2]}] }),
    finale: level({ id:'finale', index:8, theme:'night', name:'最后的守护', description:'第一章首领战 · 守住四波来客', difficulty:'首领', sunInterval:7, speedScale:1.06, hpScale:1.08, deck:['sunflower','repeater','snowpea','wallnut','jalapeno','cherry','kani','rakko'], waves:[{at:18,count:7,gap:4,types:['momonga','runner','pinkchimera']},{at:61,count:12,gap:3,types:['anoko','chimera','runner','momonga']},{at:111,count:16,gap:2.5,types:['pinkchimera','runner','anoko','chimera'],lanes:[0,0,4,4,1,3,2]},{at:165,count:20,gap:2.2,types:['boss','runner','pinkchimera','momonga','chimera','anoko','momonga','runner'],lanes:[0,4,1,3,2]}] }),
    ...makeLateLevels()
  });

  function makeLateLevels() {
    const decks=[
      ['sunflower','pea','mushroom','snowpea','repeater','wallnut','cherry','kani'],
      ['shisa','pea','mushroom','snowpea','repeater','wallnut','jalapeno','kani'],
      ['sunflower','pea','mushroom','snowpea','wallnut','rakko','cherry','kani']
    ];
    const routes=[[0,2,4,1,3],[0,0,1,1,2,2,3,3,4,4],[0,4,0,4,1,3,2],[0,1,2,3,4,4,3,2,1,0]];
    const recipes=[
      ['ridge','山坡急行','day','快怪与重装接力',['runner','momonga','pinkchimera','anoko'],0],
      ['brook','溪边合围','day','上下两路同时告急',['pinkchimera','runner','momonga','anoko'],2],
      ['windmill','风车追逐','sunset','同路结伴的来客',['runner','anoko','momonga','runner','pinkchimera'],1],
      ['thicket','密林来客','night','夜行怪与飞鼠交错前进',['chimera','runner','pinkchimera','momonga','anoko'],3],
      ['ruins','遗迹重装','day','重装前排掩护后方快怪',['anoko','runner','anoko','pinkchimera','momonga'],1],
      ['rain','雨夜双线','night','边路夹攻与中路突破',['pinkchimera','chimera','runner','anoko','runner'],2],
      ['gate','石门围攻','sunset','密集来客轮流冲击五路',['anoko','pinkchimera','runner','chimera'],3],
      ['fortress','山谷守关','night','第二章首领战与重装护卫',['anoko','runner','chimera','pinkchimera','anoko'],0],
      ['frost','霜叶长夜','night','持久防线迎来五波冲击',['runner','anoko','pinkchimera','chimera'],1],
      ['lanterns','灯火追击','sunset','两侧快怪牵制中路重装',['runner','pinkchimera','runner','anoko','chimera'],2],
      ['marsh','沼地重围','night','集群来客考验穿透与治疗',['anoko','pinkchimera','chimera','runner'],1],
      ['cliff','悬崖夹击','day','多路接力与首领压阵',['runner','anoko','chimera','pinkchimera','anoko'],3],
      ['storm','暴雨守夜','night','六波不断线的来客',['pinkchimera','runner','anoko','chimera','runner'],2],
      ['citadel','古城防线','sunset','重装纵队轮番逼近',['anoko','anoko','runner','pinkchimera','chimera'],1],
      ['eclipse','月蚀突围','night','暴走来客与首领协同进攻',['chimera','runner','anoko','pinkchimera','chimera'],3],
      ['laststand','终章的守护','night','三路首领与全线来客',['anoko','runner','pinkchimera','chimera','anoko','runner'],2]
    ];
    return Object.fromEntries(recipes.map(([id,name,theme,description,types,route],stage)=>{
      const waveCount=stage<6?4:stage<12?5:6,waves=[];
      let at=16;
      for(let w=0;w<waveCount;w++){
        const count=8+Math.floor(stage/5)+w*(3+Math.floor(stage/8));
        const lateRush=stage>=12&&w>=2?.16+(stage-12)*.035:0;
        const gap=Math.round(Math.max(1.05,2.9-stage*.035-w*.19-lateRush)*100)/100;
        let composition=types.slice(w%types.length).concat(types.slice(0,w%types.length));
        if((stage>=7&&w===waveCount-1)||(stage>=11&&w===waveCount-2))composition=['boss',...composition,...composition];
        waves.push({at,count,gap,types:composition,lanes:routes[(route+(w===0?0:w%2))%routes.length]});
        at=Math.round((at+(count-1)*gap+(stage<8?16:stage>=12?10:12))*100)/100;
      }
      return [id,level({id,index:stage+9,name,theme,description,difficulty:stage>=12?'极限':stage>=7?'高难':'困难',sunInterval:7,
        hpScale:Math.round((1.08+stage*.018)*100)/100,speedScale:Math.round((1.06+stage*.008)*100)/100,
        damageScale:Math.round((1+stage*.012)*100)/100,deck:decks[stage%decks.length],waves})];
    }));
  }

  const ENDLESS = Object.freeze({id:'endless',name:'无尽讨伐',description:'完成一波讨伐，再迎接更强的目标',theme:'night',difficulty:'无尽',mapId:'garden',
    sunInterval:7,hpScale:1,speedScale:1,damageScale:1,waves:Object.freeze([]),
    deck:Object.freeze(['shisa','pea','mushroom','snowpea','repeater','wallnut','jalapeno','kani','starfruit','stormreed']),
    get recommendedDeck(){return this.deck;},maxAlive:80,maxSpeed:.46,eventLimit:2048});
  const LEGACY_ENDLESS_MAX_COUNT=400;
  const ENDLESS_GROWTH_RATES = Object.freeze({
    slow:Object.freeze({label:'缓慢',step:.5}),
    normal:Object.freeze({label:'正常',step:1}),
    fast:Object.freeze({label:'极速',step:12})
  });
  const knownEndlessGrowthRate = rate => typeof rate==='string'&&Object.prototype.hasOwnProperty.call(ENDLESS_GROWTH_RATES,rate);
  function getEndlessWave(value, difficulty, surge = 0, boardId = 'classic') {
    const board=ENDLESS_BOARD_SIZES[knownEndlessBoardSize(boardId)?boardId:'classic'];
    const wave=Number.isFinite(value)?Math.max(1,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value))):1;
    const strength=Number.isFinite(difficulty)?Math.max(1,Math.min(Number.MAX_SAFE_INTEGER,difficulty)):wave,stage=strength-1;
    const oldRoster=wave<3?['momonga','momonga','runner']:wave<5?['momonga','runner','pinkchimera','chimera']:['anoko','runner','pinkchimera','chimera','momonga','runner'];
    const roster=wave<7?oldRoster:wave<10?[...oldRoster,'helmet']:[...oldRoster,'helmet','drummer','healer'];
    const types=wave%5===0?['boss',...roster,...roster]:roster;
    const pressure=Math.max(0,strength-5);
    // Fast waves bank extra pressure. It survives switching pace, while zero
    // retains the exact old curve for normal runs and in-progress old saves.
    const surgeWaves=Number.isSafeInteger(surge)&&surge>0?surge:0;
    const baseGap=strength<=5?Math.round((2.9-stage*.115)*100)/100:Math.max(.2,Math.round(2.44/(1+pressure*.24)*100)/100);
    // Keep the opening intact, then grow both arrivals and simultaneous pressure.
    // Stagger every route so a denser wave remains readable and multi-lane.
    const classicLanes=wave>5?(wave%3===0?[0,4,2,1,3]:wave%3===1?[0,4,1,3,2]:[2,1,3,0,4]):
      wave<4?[0,2,4,1,3]:wave%3===1?[0,4,1,3,2]:[0,0,1,1,2,2,3,3,4,4];
    const lanes=board.rows===5?classicLanes:[...classicLanes,...Array.from({length:board.rows-5},(_,index)=>index+5)];
    // Keep the actual wave population. A compact plan below makes its memory
    // cost independent of this number; only JavaScript's integer precision is a limit.
    const classicCount=Math.floor((8+Math.floor(stage*1.6)+pressure*3)*(1+Math.min(1,surgeWaves*.06)));
    return Object.freeze({wave,count:Math.min(Number.MAX_SAFE_INTEGER,Math.floor(classicCount*board.countScale)),
      gap:surgeWaves?Math.max(.1,Math.round(baseGap/(1+surgeWaves*.35)*100)/100):baseGap,
      bossCount:wave%5===0?Math.min(8,2+Math.floor(Math.max(0,wave-5)/10)):0,
      hpScale:Math.min(1e9,Math.min(64,1+stage*.10)*(1+.45*surgeWaves+.04*surgeWaves*surgeWaves))*board.hpScale,
      speedScale:Math.min(1.42,.96+stage*.018),damageScale:Math.min(64,Math.min(1.8,1+stage*.027)*(1+.22*surgeWaves)),
      types:Object.freeze(types),lanes:Object.freeze(lanes),rest:8,maxAlive:Math.min(ENDLESS.maxAlive,28+Math.floor(pressure*1.5)),maxSpeed:ENDLESS.maxSpeed});
  }

  // Timing only: extracted Windows 1.0.0.1051 reanimations and source at
  // assets/references-v6/pc-source (commit 325b2229). Sun economy, damage,
  // movement distance and the mine preparation remain game-specific.
  const ANIMATION_TIMING = Object.freeze({
    tickHz:100, launchRate:150, launchJitter:15, idleMin:10, idleMax:15,
    pea:Object.freeze({idleMin:15,idleMax:20,idleFrames:25,shootFps:35,shootCounter:35,fireCounter:1,shootFrames:25,blendTicks:20}),
    mushroom:Object.freeze({idleMin:10,idleMax:15,idleFrames:17,shootFps:35,shootCounter:50,fireCounter:1,shootFrames:30,blendTicks:20,cloudCounter:15,postShootIdleFps:12}),
    enemy:Object.freeze({walkFrames:47,normalGround:49.8,paperGround:57.8,walkVelocityMin:.23,walkVelocityMax:.37,paperRageMin:.89,paperRageMax:.91,eatFps:36,normalEatFrames:40,paperEatFrames:24,chilledRate:.5,gaspFrames:13,gaspFps:8,gaspBlendTicks:10}),
    blink:Object.freeze({minimumTicks:400,jitterTicks:400,fps:15,frames:3}),
    mine:Object.freeze({riseFrames:19,riseFps:18,armedFpsMin:12,armedFpsMax:15}), cherry:Object.freeze({fuseTicks:100})
  });
  const STEP = 1 / ANIMATION_TIMING.tickHz;
  // Levels have no gameplay ceiling. Safe integers are only a JavaScript
  // precision boundary: pathological external XP grants reject atomically.
  const PLANT_PERK_LEVELS = Object.freeze([3,5,8,12]);
  const PLANT_LEVEL_PRECISION_LIMIT = Number.MAX_SAFE_INTEGER;
  const plantXpNeeded = level => 10*(level+1)*(level+1);
  const validPlantGrowth = growth => !!growth&&Number.isSafeInteger(growth.level)&&growth.level>=1&&Number.isFinite(growth.xp)&&growth.xp>=0;
  function experienceToAdvance(level, count) {
    // Sum 10*(level+i)^2 directly. Subtracting two large cumulative totals
    // loses small awards at high levels; this form also avoids per-level loops.
    return 10*count*(level*level+level*(count+1)+(count+1)*(2*count+1)/6);
  }
  // Milestones change how a species plays; the ordinary animation and economy
  // clocks remain untouched. These descriptions also drive the native panels.
  const PLANT_PERKS = Object.freeze({
    pea:[['贯穿豌豆','豌豆穿透 2 个目标，后续目标受到 60% 伤害。'],['三连贯穿','每颗豌豆最多穿透 3 个目标。'],['破甲标记','命中标记 3 秒，其他种类伙伴的直接攻击伤害提高 15%，不叠加。'],['跳跳豌豆','每颗豌豆首次击杀时，弹跳攻击附近一位来客，造成 45% 伤害，不连锁。']],
    starfruit:[['贯穿星光','星弹最多贯穿 2 位目标，后续伤害 60%。'],['五线星阵','射击范围扩展到本行上下各两行。'],['星光标记','命中附加破甲标记，使其他伙伴直接伤害提高 15%。'],['星光跳跃','击杀时弹向附近另一位目标，造成 45% 伤害。']],
    magnet:[['强磁吸附','每次吸走目标 50% 最大护甲。'],['余磁扰动','命中使目标减速 2 秒。'],['磁力震荡','每次命中眩晕 0.35 秒，同一目标间隔 4 秒，首领效果减弱。'],['磁场扩散','同时吸走目标附近其他敌人 25% 最大护甲。']],
    stormreed:[['四重闪电','一次攻击最多命中 4 位来客。'],['余电共鸣','每次连锁保留 85% 伤害。'],['电流麻痹','闪电使目标减速 2 秒。'],['雷云织网','一次攻击最多命中 5 位来客，跳跃距离扩大到 2 格。']],
    mushroom:[['毒孢子','命中附加 3 秒中毒，每秒 6 伤害，不叠加。'],['孢子地带','命中留下 3 秒孢子区，每秒 6 伤害，不叠加。'],['麻痹孢子','中毒期间移动减速 20%，同类效果不叠加。'],['孢子传播','被原始孢子感染的来客死亡时，将毒传播给一格内含相邻行的来客；传播毒不继续传播。']],
    snowpea:[['冰结射击','每第 3 发冻结目标 0.7 秒；首领效果减弱。'],['碎冰扩散','冰结射击也冻结目标附近与相邻行的来客。'],['寒冰共鸣','命中已经冻结的目标时，追加本发 35% 伤害。'],['碎晶爆破','成功冻结时对附近含相邻行的来客造成本发 30% 碎冰伤害。']],
    repeater:[['三连射','每轮追加第 3 发，与上一发相隔 0.18 秒。'],['爆裂尾弹','第 3 发溅射附近与相邻行，造成 45% 伤害。'],['重击尾弹','第 3 发击退目标 0.35 格；同一目标间隔 3 秒，首领位移减弱。'],['交叉火力','第 3 发额外攻击相邻两行各一位、横向 1.8 格内的来客，造成 35% 伤害。']],
    wallnut:[['带刺外壳','被啃咬时反击 18 伤害，最多每秒一次。'],['休息修复','连续 5 秒未受攻击后，每秒恢复 12 生命。'],['背水守护','生命降至 35% 时获得最大生命 20% 的护盾，持续 6 秒，每 25 秒一次。'],['挺身而出','为邻格非坚果伙伴分担 25% 啃咬伤害；自身低于 35% 生命时停止，不叠加。']],
    rakko:[['横扫剑术','同次挥剑最多扫中 3 位来客，次要目标伤害减半。'],['震退斩','每第 3 次挥剑击退命中来客，首领位移减弱。'],['居合格挡','遭遇啃咬时格挡 0.6 秒并反击 60 伤害，每 8 秒一次。'],['讨伐终结','挥剑后处决生命低于 15% 的非首领；首领则追加 30% 挥剑伤害，每位首领间隔 5 秒。']],
    sunflower:[['丰收时刻','每第 3 次生产，额外掉落一颗 25 阳光。'],['暖阳疗愈','生产阳光时，为周围伙伴各恢复 30 生命。'],['暖阳余辉','生产治疗的溢出量转为最多最大生命 15% 的护盾，保留 6 秒。'],['播种时节','每第 3 次生产令全卡牌冷却减少 1 秒，全场间隔 10 秒。']],
    shisa:[['热面打气','周围射手伤害提高 12%，多座面摊不叠加。'],['开饭加速','生产时全卡牌冷却减少 1 秒，全场间隔 8 秒。'],['热汤护身','生产时为邻格伙伴提供 最大生命 20% 的护盾，持续 5 秒，不叠加。'],['团圆面摊','生产时为邻格伙伴与荷叶恢复 40 生命，并修复护盾荷叶 25 点护盾。']],
    kani:[['安心书签','溢出的治疗转为护盾，最多最大生命的 25%，保留 6 秒。'],['守护应援','治疗时使伙伴减伤 20%，持续 4 秒，不叠加。'],['紧急书签','邻格伙伴遭遇致命啃咬时保留 1 生命并恢复 60 生命；每位被救伙伴间隔 20 秒。'],['巡回图书馆','常规治疗扩至横向两格、相邻行，并可治疗荷叶、修复护盾荷叶 20 点护盾。']],
    mine:[['震退爆破','爆炸击退幸存来客，首领位移减弱。'],['松软陷坑','爆炸留下 6 秒陷坑，范围内移动减速 50%。'],['连环地雷','爆炸后 0.35、0.7 秒在左右一格各爆一次，半径 0.75 格，造成原爆炸 20% 伤害。'],['连片陷坑','陷坑同时覆盖相邻两行，所有来客在其中减速 50%。']],
    cherry:[['震荡爆破','爆炸使幸存来客眩晕 1.4 秒；首领效果减弱。'],['连锁余震','0.8 秒后再震一次，造成原爆炸 25% 的伤害。'],['樱桃碎片','0.25 秒后在上下左右各溅出碎片，半径 0.65 格，各造成原爆炸 12% 伤害。'],['余震焦土','余震留下 4 秒焦土，覆盖原爆炸三行范围，每秒 35 伤害，同类不叠加。']],
    jalapeno:[['灼热余烬','整行燃烧 4 秒，每秒 45 伤害，多处不叠加。'],['烈焰扩散','引爆时也对相邻两行造成 25% 爆破伤害。'],['热浪压制','身处余烬的来客啃咬伤害降低 20%，不叠加。'],['三线火墙','相邻两行也留下 3 秒余烬，每秒 25 伤害，并附带热浪压制。']],
    lily:[['溪水滋养','4 秒未受攻击后，每 3 秒治疗上层伙伴 18 生命。'],['水珠护盾','每 10 秒给予上层最大生命 20% 的护盾，保留 6 秒。'],['清泉助攻','每 6 秒使上层射手的攻击提高 18%，持续 3 秒；荷叶消失立即失效。'],['浮叶救援','上层伙伴遭遇致命啃咬时恢复 15% 最大生命；每位伙伴间隔 30 秒。']],
    frostlily:[['寒雾压制','冰雾内来客的啃咬速度也降低 25%。'],['霜冻脉冲','每 8 秒冻结冰雾内来客 0.6 秒；首领效果减弱。'],['寒霜反甲','上层被啃咬时冻结攻击者 0.4 秒，每片荷叶间隔 6 秒，受冻结免疫与首领抗性影响。'],['冰川航道','霜冻脉冲后在本行留下 4 秒寒流，前方 3 格减速 35%，不叠加。']],
    guardlily:[['护盾修复','8 秒未受攻击后每秒修复上限的 2.5%，上限为护盾的 35%。'],['破盾震波','破盾击退附近来客，每片荷叶间隔至少 30 秒。'],['连叶屏障','每 10 秒给予邻格伙伴最大生命 20% 的护盾，持续 5 秒，不叠加。'],['应急补盾','护盾降至 20% 以下时恢复到 35%，每片荷叶间隔 30 秒。']],
    powerlily:[['应援水花','同格伙伴每第 4 轮主攻击首次命中时，溅伤一格内含相邻行的其他来客，造成该次攻击 20% 伤害。'],['凯旋补给','同格伙伴直接攻击击杀时，为伙伴与本荷叶各恢复 20 生命。'],['荷塘应援','邻格射手也获得本荷叶一半的增伤，同类取最强；与狮萨鼓舞和普通荷叶助攻相乘。'],['应援震波','同格伙伴每第 6 轮主攻击使命中来客眩晕 0.6 秒；首领时长 35%，同目标间隔 5 秒。']],
    hastelily:[['疾风护身','同格伙伴每第 4 轮主攻击首次命中后获得最大生命 15% 的护盾，持续 3 秒，不叠加。'],['顺风追击','同格伙伴每第 5 轮主攻击后 0.18 秒追加一次攻击；不会再次触发荷叶技能。'],['邻叶顺风','同格伙伴每第 6 轮主攻击带动邻格射手，攻击频率提高 12%，持续 3 秒，同类取最强。'],['疾风时刻','同格伙伴每第 8 轮主攻击开启 3 秒疾风，额外提高 15% 攻击频率；总频率不超过原速 175%。']]
  });
  function plantMechanics(type, level) {
    const a=level>=3,b=level>=5,c=level>=8,d=level>=12;
    return ({
      starfruit:{maxHits:a?2:1,starRows:b?2:1,mark:c,ricochet:d?.45:0},
      magnet:{armorStrip:a?.5:.35,magnetSlow:b,magnetStun:c,magnetSplash:d},
      stormreed:{chainHits:d?5:a?4:3,chainFalloff:b?.85:.7,chainSlow:c,chainRange:d?2:1.5},
      pea:{maxHits:b?3:a?2:1,mark:c,ricochet:d?.45:0},mushroom:{poison:a?6:0,sporeField:b?6:0,poisonSlow:c?.8:1,poisonSpread:d},
      snowpea:{freezeEvery:a?3:0,freezeSplash:b?.7:0,frostBonus:c?.35:0,shatter:d?.3:0},repeater:{shots:a?3:2,splash:b?.45:0,tailPush:c?.35:0,crossfire:d?.35:0},
      wallnut:{retaliate:a?18:0,regen:b?12:0,clutchWard:c?.2:0,share:d?.25:0},rakko:{cleave:a?3:1,pushEvery:b?3:0,parry:c,execute:d},
      sunflower:{bonusEvery:a?3:0,heal:b?30:0,overhealWard:c,seedRally:d},shisa:{encourage:a?.12:0,cooldown:b?1:0,serviceWard:c?.2:0,groupRecovery:d?40:0},
      kani:{ward:a?.25:0,protection:b?.2:0,rescue:c,wideSupport:d},mine:{push:a?.8:0,slowField:b?.5:0,chain:c,wideTrap:d},
      cherry:{stun:a?1.4:0,aftershock:b?.25:0,fragments:c,scorch:d},jalapeno:{burn:a?45:0,adjacent:b?.25:0,weaken:c,crossBurn:d},
      lily:{heal:a?18:0,ward:b?.2:0,attackPulse:c,survival:d},frostlily:{biteFactor:a?.75:1,freeze:b?.6:0,frostArmor:c,iceLane:d},
      guardlily:{regen:a?.025:0,push:b?.8:0,shareWard:c?.2:0,emergencyRepair:d},
      powerlily:{splashEvery:a?4:0,killHeal:b?20:0,neighborAura:c,stunEvery:d?6:0},
      hastelily:{wardEvery:a?4:0,followEvery:b?5:0,teamEvery:c?6:0,burstEvery:d?8:0}
    })[type]||{};
  }
  const SHOOTERS = new Set(['pea','mushroom','snowpea','repeater','rakko','starfruit','magnet','stormreed']);
  function motionKind(type) { return (PLANTS[type]||ENEMIES[type]||{}).motionKind||type; }
  function shootingTiming(type) { return ANIMATION_TIMING[motionKind(type)]; }
  function animationRandom(entity) {
    let value=entity.animationRngState;value^=value<<13;value^=value>>>17;value^=value<<5;
    entity.animationRngState=value>>>0;return entity.animationRngState/4294967296;
  }
  function crossed(before,after,marker) {return Math.floor(after-marker-1e-9)>Math.floor(before-marker-1e-9);}

  // A save is an explicit data format, not a dump of a Game instance. Keep
  // methods, definitions and the transient event queue out of local storage.
  const LEGACY_SAVE_FIELDS = Object.freeze(('seed status time sun wave isEndless wavesCleared nextWaveIn waveSpawned waveTotal waveKillStart endlessWave nextEndlessSpawnAt intermissionUntilTick kills plants supports enemies projectiles suns effects perkFields perkActions nextShisaCooldownAt nextSunflowerRallyAt mowers cooldowns growth wavePlantTypes growthRewardedWave levelId mapId spawnIndex spawnPlan totalEnemies skyTimer nextId rngState waveAnnounced simulationTick updateRemainder').split(' '));
  const GROWTH_SAVE_FIELDS = Object.freeze([...LEGACY_SAVE_FIELDS,'endlessGrowthRate','endlessDifficulty']);
  const SURGE_SAVE_FIELDS = Object.freeze([...GROWTH_SAVE_FIELDS,'endlessSurge']);
  const BOARD_SAVE_FIELDS = Object.freeze([...SURGE_SAVE_FIELDS,'endlessBoardSize']);
  const SAVE_FIELDS = Object.freeze([...BOARD_SAVE_FIELDS,'sceneLayoutVersion']);
  const saveNumber = value => typeof value==='number'&&Number.isFinite(value);
  const saveNatural = value => Number.isSafeInteger(value)&&value>=0;
  const savePositive = value => Number.isSafeInteger(value)&&value>0;
  const saveNonnegative = value => saveNumber(value)&&value>=0;
  const saveBool = value => typeof value==='boolean';
  const saveRow = value => Number.isInteger(value)&&value>=0&&value<7;
  const saveCol = value => Number.isInteger(value)&&value>=0&&value<15;
  const saveRecord = value => value!==null&&typeof value==='object'&&!Array.isArray(value);
  const saveKnownPlant = value => typeof value==='string'&&Object.prototype.hasOwnProperty.call(PLANTS,value);
  const saveKnownEnemy = value => typeof value==='string'&&Object.prototype.hasOwnProperty.call(ENEMIES,value);
  const saveNullable = check => value => value===null||check(value);
  const saveEnum = values => value => values.includes(value);
  const saveArray = (check,max) => value => Array.isArray(value)&&value.length<=max&&value.every(check);
  function saveSchema(numbers='',booleans='',other={}) {
    return Object.assign(Object.fromEntries(numbers.split(' ').filter(Boolean).map(key=>[key,saveNumber])),
      Object.fromEntries(booleans.split(' ').filter(Boolean).map(key=>[key,saveBool])),other);
  }
  function saveShape(value,schema,required=Object.keys(schema)) {
    return saveRecord(value)&&required.every(key=>Object.prototype.hasOwnProperty.call(value,key))&&
      Object.keys(value).every(key=>Object.prototype.hasOwnProperty.call(schema,key)&&schema[key](value[key]));
  }
  function copySaveData(value,budget={left:400000},depth=0) {
    if(--budget.left<0||depth>12)throw new Error('Save exceeds its data budget');
    if(value===null||typeof value==='boolean'||saveNumber(value))return value;
    if(typeof value==='string'&&value.length<=128)return value;
    if(Array.isArray(value)){
      if(value.length>20000)throw new Error('Save array is too large');
      return Array.from(value,item=>copySaveData(item,budget,depth+1));
    }
    if(!saveRecord(value))throw new Error('Save contains a non-data value');
    const result={},keys=Object.keys(value);
    if(keys.length>256)throw new Error('Save object is too large');
    for(const key of keys){
      if(key==='__proto__'||key==='constructor'||key==='prototype')throw new Error('Unsafe save key');
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('Save contains an accessor');
      // Match JSON's treatment of optional undefined fields in event visuals.
      if(descriptor.value!==undefined)result[key]=copySaveData(descriptor.value,budget,depth+1);
    }
    return result;
  }
  const SAVE_CUE_SCHEMA=saveSchema('at sequence phase burstIndex','melee',{
    type:saveEnum(['hurt','shoot','produce','support','armed','cloud','shoot-start','bite','shield-hit','shield-break']),
    id:savePositive,entityId:savePositive,targetId:saveNullable(savePositive),sourceId:savePositive,projectileId:savePositive,sunId:savePositive,
    targets:saveArray(value=>saveShape(value,{id:savePositive,value:saveNonnegative}),210)
  });
  const SAVE_ANIMATION_NUMBERS='animationAge animationStateAge animationStateAt previousAnimationPhase idleFps idleFrame idlePhase walkTime eatTime locomotionPhase eatPhase eatCycles shootAge produceAge cloudAge recoil cueSequence lastShotAt lastProduceAt lastBiteAt lastHitAt sourceIdleFps sourceTickHz sourceIdleFrames';
  const SAVE_ANIMATION_SCHEMA=saveSchema(SAVE_ANIMATION_NUMBERS,'',{
    animationRngState:value=>saveNatural(value)&&value<=0xffffffff,
    animationState:saveEnum(['idle','walk','eat','attack','shoot','gasp','armed','rise','fuse']),
    previousAnimationState:saveEnum(['idle','walk','eat','attack','shoot','gasp','armed','rise','fuse']),
    cue:saveNullable(value=>saveShape(value,SAVE_CUE_SCHEMA,['type','at','id','entityId','sequence']))
  });
  const SAVE_PLANT_SCHEMA={...SAVE_ANIMATION_SCHEMA,...saveSchema(
    'x y hp maxHp age attackTimer produceTimer supportTimer hitTimer hurtCooldown '+
    'shield maxShield shieldHitTimer shieldBreakAt sourceShootFps sourceShootCounter sourceFireCounter shootMarkerAge shootDuration sourceShootFrames sourceBlendTicks shootStartedAt shootTicks shootingCounter launchCounter launchRate secondShotTick thirdShotTick burstShots launchPeriodTicks '+
    'riseAge riseDuration sourceRiseFps sourceRiseFrames armedTime fuseAge fuseDuration fuseProgress blinkCountdown blinkTimer blinkAge blinkPhase blinkStartedAt sourceBlinkFps sourceBlinkFrames productionFlash '+
    'ward wardMax wardRatio wardGrantedAt wardHitAt wardBreakAt wardUntil lastDamagedAt nextClutchWardAt encouragedUntil nextLilyHealAt nextLilyWardAt nextLilyAttackAt springBoostUntil nextFrostPulseAt nextSharedWardAt nextEmergencyRepairAt supportDamageBonus supportAttackRate '+
    'powerAttackCount hasteAttackCount teamHasteUntil hasteBurstUntil perkShotCount nextParryAt parryUntil nextFrostArmorAt nextKaniRescueAt nextLilyRescueAt perkProduceCount protectedUntil nextShieldPushAt nextRetaliateAt',
    'armed targeting support shotReleased',{
      id:savePositive,type:saveKnownPlant,row:saveRow,col:saveCol,level:savePositive,
      wardSourceType:saveKnownPlant,wardSourceId:saveNullable(savePositive),springBoostSourceId:savePositive,
      supportPowerSourceId:saveNullable(savePositive),supportHasteSourceId:saveNullable(savePositive),powerCounterSourceId:savePositive,hasteCounterSourceId:savePositive
    })};
  const SAVE_ENEMY_SCHEMA={...SAVE_ANIMATION_SCHEMA,...saveSchema(
    'x y hp maxHp age speed damageScale slowTimer frostTimer hitTimer sourceWalkVelocity sourceRageVelocity sourceWalkFrames sourceGroundDistance sourceEatFps sourceEatFrames sourceWalkFps walkFps eatFps '+
    'gaspAge gaspPhase gaspStartedAt gaspDuration sourceGaspFps sourceGaspFrames sourceGaspBlendTicks frozenUntil freezeImmuneUntil poisonTimer perkMoveFactor weakenedUntil nextPowerStunAt stunnedUntil nextDotFlashAt markedUntil nextFinisherAt nextTailPushAt nextSporePushAt armor maxArmor armorBrokenAt nextHealAt nextMagnetStunAt drumRate '+(combatFeedback?combatFeedback.NUMERIC_SAVE_FIELDS:''),
    'eating enraged gasping',{
      impactKind:saveEnum(['electric','heavy','ice','armor','normal']),
      id:savePositive,type:saveKnownEnemy,row:saveRow,wave:savePositive,blockerId:saveNullable(savePositive),
      sourceChewMarkers:saveArray(value=>saveNumber(value)&&value>=0&&value<=1,4),
      dotStatuses:value=>saveShape(value,{poison:poison=>saveShape(poison,saveSchema('damage until moveFactor','spread',{sourceType:saveKnownPlant}))},[])
    })};
  const SAVE_ATTACK_SCHEMA=saveSchema('powerBonus hasteRate killHeal','powerSplash powerStun hasteWard powerSplashSpent hasteWardSpent',{
    entityId:savePositive,powerSourceId:saveNullable(savePositive),hasteSourceId:saveNullable(savePositive),powerSkillSourceId:savePositive,hasteSkillSourceId:savePositive
  });
  const SAVE_PROJECTILE_SCHEMA=saveSchema('x y originX speed damage range age createdAt burstIndex poison sporeField freezeSplash splash ricochet poisonSlow frostBonus shatter tailPush crossfire',
    'freeze mark poisonSpread ricochetSpent spent',{
      id:savePositive,type:saveEnum(['spore','pea','snowpea']),kind:saveEnum(['spore','pea','snowpea']),plantType:saveKnownPlant,row:saveRow,entityId:savePositive,
      hitIds:saveArray(savePositive,ENDLESS.maxAlive*4),maxHits:value=>value==='unlimited'||savePositive(value),
      supportCredit:value=>saveShape(value,SAVE_ATTACK_SCHEMA,['entityId','powerBonus','hasteRate','powerSourceId','hasteSourceId'])
    });
  const SAVE_SUN_SCHEMA=saveSchema('x y startX startY targetX targetY motionDuration scale value age duration createdAt','landed',{
    id:savePositive,entityId:savePositive,source:saveEnum(['sky','sunflower'])
  });
  const SAVE_EFFECT_SCHEMA=saveSchema('x row y age duration radius range level deathFps deathDuration rows fromX','iceSplash',{
    type:saveEnum(['upgrade','plant','shovel','perkPulse','perkField','defeat','burst','fire','slash','mower','heal','hit','lightning','waterHit']),
    kind:saveEnum(['aftershock','bonusSun','burn','cooldown','freeze','heal','knockback','poison','retaliate','splash','stun','ward','slow','spore']),
    plantType:value=>saveKnownPlant(value)||saveKnownEnemy(value),enemyType:saveKnownEnemy,entityId:savePositive,fieldId:savePositive,targetId:savePositive,
    sourceId:savePositive,fromRow:saveRow,jump:value=>saveNatural(value)&&value<5,
    deathKind:saveEnum(['burn']),cause:saveEnum(['cherry','jalapeno']),projectileType:saveEnum(['pea','snowpea','spore'])
  });
  const SAVE_FIELD_SCHEMA=saveSchema('x radius rows age duration damage moveFactor','weaken',{
    id:savePositive,kind:saveEnum(['burn','slow','spore']),row:saveRow,sourceType:saveKnownPlant
  });
  const SAVE_ACTION_SCHEMA=saveSchema('at x radius damage rows','scorch done',{
    kind:saveEnum(['supportFollowup']),row:saveRow,sourceType:saveKnownPlant,entityId:savePositive,sourceId:savePositive
  });
  function validEndlessState(state) {
    if(!saveRecord(state)||Object.keys(state).length!==SAVE_FIELDS.length||SAVE_FIELDS.some(key=>!Object.prototype.hasOwnProperty.call(state,key)))return false;
    if(state.levelId!=='endless'||state.isEndless!==true||!['playing','paused'].includes(state.status)||!Object.prototype.hasOwnProperty.call(MAPS,state.mapId))return false;
    if(!knownEndlessBoardSize(state.endlessBoardSize)||![0,sceneTerrain.VERSION].includes(state.sceneLayoutVersion))return false;
    const board=ENDLESS_BOARD_SIZES[state.endlessBoardSize],map=getEndlessMap(state.mapId,board.id,state.sceneLayoutVersion);
    const boardRow=value=>saveRow(value)&&value<board.rows,boardCol=value=>saveCol(value)&&value<board.cols;
    for(const key of 'seed rngState wave wavesCleared waveSpawned waveTotal waveKillStart kills growthRewardedWave spawnIndex totalEnemies nextId waveAnnounced simulationTick'.split(' '))if(!saveNatural(state[key]))return false;
    for(const key of 'time sun nextEndlessSpawnAt nextShisaCooldownAt nextSunflowerRallyAt skyTimer updateRemainder'.split(' '))if(!saveNonnegative(state[key]))return false;
    if(state.seed>0xffffffff||state.rngState>0xffffffff||!state.wave||!state.nextId||state.updateRemainder>=STEP+1e-9||state.time!==state.simulationTick/100)return false;
    if(!saveNullable(saveNonnegative)(state.nextWaveIn)||!saveNullable(saveNatural)(state.intermissionUntilTick)||(state.nextWaveIn===null)!==(state.intermissionUntilTick===null))return false;
    if(state.intermissionUntilTick!==null&&(state.intermissionUntilTick<state.simulationTick||Math.abs(state.nextWaveIn-(state.intermissionUntilTick-state.simulationTick)/100)>1e-8))return false;
    if(!knownEndlessGrowthRate(state.endlessGrowthRate)||!saveNumber(state.endlessDifficulty)||state.endlessDifficulty<1||state.endlessDifficulty>Number.MAX_SAFE_INTEGER||!Number.isInteger(state.endlessDifficulty*2))return false;
    if(!saveNatural(state.endlessSurge))return false;
    const freshConfig=getEndlessWave(state.wave,state.endlessDifficulty,state.endlessSurge,board.id),savedConfig=state.endlessWave;
    // Legacy array plans finish their original (possibly capped) current wave.
    // The next beginEndlessWave always creates a full-population compact plan.
    const legacyPlan=Array.isArray(state.spawnPlan);
    if(legacyPlan&&board.id!=='classic')return false;
    const config=legacyPlan?{...freshConfig,count:Math.min(LEGACY_ENDLESS_MAX_COUNT,freshConfig.count)}:freshConfig;
    if(!saveRecord(savedConfig)||Object.keys(savedConfig).length!==Object.keys(config).length||Object.keys(config).some(key=>JSON.stringify(savedConfig[key])!==JSON.stringify(config[key])))return false;
    if(!saveShape(state.cooldowns,Object.fromEntries(Object.keys(PLANTS).map(key=>[key,saveNonnegative])))||
       !saveShape(state.growth,Object.fromEntries(Object.keys(PLANTS).map(key=>[key,value=>saveShape(value,{level:savePositive,xp:saveNonnegative})]))))return false;
    if(!saveArray(saveKnownPlant,Object.keys(PLANTS).length)(state.wavePlantTypes)||new Set(state.wavePlantTypes).size!==state.wavePlantTypes.length)return false;
    const animationRequired=Object.keys(SAVE_ANIMATION_SCHEMA);
    const plantRequired='id type row col x y hp maxHp age attackTimer produceTimer supportTimer armed hitTimer hurtCooldown targeting level blinkCountdown blinkTimer blinkAge blinkPhase blinkStartedAt sourceBlinkFps sourceBlinkFrames'.split(' ').concat(animationRequired);
    const enemyRequired='id type row wave x y hp maxHp speed damageScale age eating slowTimer frostTimer enraged hitTimer sourceWalkVelocity sourceRageVelocity sourceWalkFrames sourceGroundDistance sourceEatFps sourceEatFrames sourceChewMarkers sourceWalkFps walkFps eatFps blockerId gasping gaspAge gaspPhase gaspStartedAt gaspDuration sourceGaspFps sourceGaspFrames sourceGaspBlendTicks'.split(' ').concat(animationRequired);
    const validPlant=(plant,support)=>{
      if(!saveShape(plant,SAVE_PLANT_SCHEMA,plantRequired)||!boardRow(plant.row)||!boardCol(plant.col)||!!PLANTS[plant.type].support!==support||!!plant.support!==support||plant.maxHp<=0||plant.hp>plant.maxHp||plant.x!==plant.col+.5||plant.y!==plant.row+.5||plant.level!==state.growth[plant.type].level||plant.sourceIdleFrames<=0||plant.sourceTickHz<=0)return false;
      if(support&&(!['shield','maxShield','shieldHitTimer','shieldBreakAt'].every(key=>saveNumber(plant[key]))||plant.shield<0||plant.maxShield<plant.shield||map.tiles[plant.row][plant.col]!=='water'))return false;
      if(SHOOTERS.has(plant.type)&&!'sourceShootFps sourceShootCounter sourceFireCounter shootMarkerAge shootDuration sourceShootFrames sourceBlendTicks shootStartedAt shootTicks shootingCounter launchCounter launchRate secondShotTick'.split(' ').every(key=>saveNumber(plant[key])))return false;
      if(SHOOTERS.has(plant.type)&&typeof plant.shotReleased!=='boolean')return false;
      if(SHOOTERS.has(plant.type)&&(plant.sourceShootFps<=0||plant.shootDuration<=plant.shootMarkerAge||plant.shootMarkerAge<0))return false;
      if(plant.type==='mine'&&!'riseAge riseDuration sourceRiseFps sourceRiseFrames armedTime'.split(' ').every(key=>saveNumber(plant[key])))return false;
      if(PLANTS[plant.type].fuse&&!'fuseAge fuseDuration fuseProgress'.split(' ').every(key=>saveNumber(plant[key])))return false;
      return true;
    };
    if(!saveArray(p=>validPlant(p,false),board.rows*board.cols)(state.plants)||!saveArray(p=>validPlant(p,true),board.rows*board.cols)(state.supports)||
       !saveArray(e=>saveShape(e,SAVE_ENEMY_SCHEMA,enemyRequired)&&boardRow(e.row)&&e.maxHp>0&&e.hp<=e.maxHp&&e.speed>=0&&e.sourceEatFrames>0&&e.sourceWalkFrames>0&&e.sourceGroundDistance>0&&e.sourceIdleFrames>0&&e.gaspDuration>0&&e.sourceChewMarkers.length>0,ENDLESS.maxAlive)(state.enemies))return false;
    if(!saveArray(p=>saveShape(p,SAVE_PROJECTILE_SCHEMA,'id type kind plantType row x y originX speed damage range age createdAt entityId burstIndex supportCredit maxHits poison sporeField freeze freezeSplash splash mark ricochet poisonSlow poisonSpread frostBonus shatter tailPush crossfire'.split(' '))&&
      boardRow(p.row)&&p.type===p.kind&&p.speed>=0&&p.damage>=0&&p.range>0&&(p.maxHits!=='unlimited'||p.type==='spore')&&(!(p.type==='spore'||p.maxHits>1)||Array.isArray(p.hitIds)),4096)(state.projectiles))return false;
    if(!saveArray(s=>saveShape(s,SAVE_SUN_SCHEMA,'id x y startX startY targetX targetY motionDuration landed scale value age duration source'.split(' '))&&s.motionDuration>0&&s.duration>0&&s.value>0,2048)(state.suns)||
       !saveArray(e=>saveShape(e,SAVE_EFFECT_SCHEMA,['type','x','row','y','age','duration'])&&boardRow(e.row)&&e.duration>0&&
         (e.type==='lightning'?saveNumber(e.fromX)&&boardRow(e.fromRow)&&savePositive(e.sourceId)&&savePositive(e.targetId)&&e.plantType==='stormreed'&&saveNatural(e.jump)&&e.jump<5:
           !['fromX','fromRow','sourceId','jump'].some(key=>Object.prototype.hasOwnProperty.call(e,key))),20000)(state.effects)||
       !saveArray(f=>saveShape(f,SAVE_FIELD_SCHEMA,['id','kind','x','row','radius','rows','age','duration','damage','sourceType'])&&boardRow(f.row)&&f.duration>0&&f.radius>=0&&f.damage>=0,4096)(state.perkFields)||
       !saveArray(a=>saveShape(a,SAVE_ACTION_SCHEMA,a.kind==='supportFollowup'?['kind','at','entityId','sourceId']:['at','x','row','radius','damage','sourceType'])&&(!Object.prototype.hasOwnProperty.call(a,'row')||boardRow(a.row)),4096)(state.perkActions))return false;
    if(!saveArray(m=>saveShape(m,{row:boardRow,x:saveNumber,active:saveBool,used:saveBool}),board.rows)(state.mowers)||state.mowers.length!==board.rows||state.mowers.some((m,i)=>m.row!==i))return false;
    const validPlan=legacyPlan?
      saveArray(s=>saveShape(s,{at:saveNonnegative,row:boardRow,type:saveKnownEnemy,wave:savePositive})&&s.wave===state.wave,LEGACY_ENDLESS_MAX_COUNT)(state.spawnPlan):
      saveShape(state.spawnPlan,{kind:value=>value==='endless-v2',length:savePositive,startAt:saveNonnegative,laneOffset:boardRow});
    if(!validPlan||
       state.spawnIndex>state.spawnPlan.length||state.waveSpawned!==state.spawnIndex||state.waveTotal!==state.spawnPlan.length||state.waveTotal!==config.count||state.totalEnemies<state.waveTotal||state.waveAnnounced!==state.wave||state.waveKillStart>state.kills||state.wavesCleared>state.wave||state.growthRewardedWave>state.wave)return false;
    if(state.nextWaveIn!==null&&(state.spawnIndex!==state.waveTotal||state.enemies.length!==0))return false;
    const ids=new Set();
    for(const entity of state.plants.concat(state.supports,state.enemies,state.projectiles,state.suns,state.perkFields)){
      if(entity.id>=state.nextId||ids.has(entity.id))return false;ids.add(entity.id);
    }
    for(const layer of [state.plants,state.supports])if(new Set(layer.map(p=>p.row*board.cols+p.col)).size!==layer.length)return false;
    return true;
  }

  const preparedEndlessGames=new WeakSet();
  // Experimental JIT partitioning. Bodies are byte-for-byte copies of the
  // original natural loop regions; authority, ordering and numeric writes stay
  // in their original positions. Public/default-off instances use original code.
  const trustedActorLoopPartitions=new WeakSet();
  function stepActorSupportsAndPlants(dt) {
      for(const support of this.supports){
        support.age+=dt;support.animationAge=support.age;
        support.animationStateAge=this.time-support.animationStateAt;
        support.idleFrame+=dt*support.idleFps;
        support.idlePhase=(support.idleFrame/support.sourceIdleFrames)%1;
        support.hitTimer=Math.max(0,support.hitTimer-dt);
        support.shieldHitTimer=Math.max(0,support.shieldHitTimer-dt);
        support.hurtCooldown=Math.max(0,support.hurtCooldown-dt);
        this.tickPlantPerks(support,dt);
      }
      for (const plant of this.plants) {
        if (plant.hp <= 0) continue;
        const spec = this.combatPlantStats(plant.type);
        plant.age += dt;
        plant.animationAge=plant.age;
        plant.animationStateAge=this.time-plant.animationStateAt;
        plant.idleFrame+=dt*plant.idleFps;
        plant.idlePhase=(plant.idleFrame/plant.sourceIdleFrames)%1;
        if(plant.produceAge>=0)plant.produceAge=this.time-plant.lastProduceAt;
        if(plant.cloudAge>=0)plant.cloudAge+=dt;
        plant.hitTimer=Math.max(0,plant.hitTimer-dt);
        plant.hurtCooldown=Math.max(0,plant.hurtCooldown-dt);
        this.tickPlantPerks(plant,dt);
        if (plant.type === 'sunflower'||plant.type==='shisa') {
          plant.produceTimer -= dt;
          plant.productionFlash=Math.max(0,1-plant.produceTimer);
          if (plant.produceTimer <= 1e-9) {
            const produced=this.addSun(plant.x + .12, plant.y - .2, 'sunflower',spec.produceValue||25);
            produced.entityId=plant.id;produced.createdAt=this.time;
            plant.produceAge=0;plant.lastProduceAt=this.time;
            this.animationCue(plant,'produce',{sunId:produced.id});
            this.events.push({type:'produce',plantType:plant.type,id:plant.id,entityId:plant.id,sunId:produced.id,value:produced.value,at:this.time,x:plant.x,row:plant.row});
            this.awardPlantXp(plant.type,produced.value/10);
            const m=spec.mechanics||{};
            plant.perkProduceCount=(plant.perkProduceCount||0)+1;
            if(m.bonusEvery&&plant.perkProduceCount%m.bonusEvery===0){
              this.addSun(plant.x-.25,plant.y-.2,'sunflower',25);this.awardPlantXp(plant.type,2.5);this.perkPulse('bonusSun',plant,.8);
            }
            if(m.heal){
              for(const other of this.nearbyPlants(plant)){
                const healed=this.healPlant(other,m.heal,plant.type);
                if(m.overhealWard&&m.heal>healed)this.grantPercentWard(other,.15*(m.heal-healed)/m.heal,6,plant.type);
              }
              this.perkPulse('heal',plant,1.2);
            }
            if(m.seedRally&&plant.perkProduceCount%3===0&&this.time+1e-9>=this.nextSunflowerRallyAt){
              for(const type of Object.keys(this.cooldowns))this.cooldowns[type]=Math.max(0,this.cooldowns[type]-1);
              this.nextSunflowerRallyAt=this.time+10;this.perkPulse('cooldown',plant,1.2);
            }
            if(m.serviceWard||m.groupRecovery)for(const other of this.nearbyPlants(plant)){
              if(m.serviceWard)this.grantPercentWard(other,m.serviceWard,5,plant.type);
              if(m.groupRecovery){this.healPlant(other,m.groupRecovery,plant.type);this.repairSupport(other,25,plant.type);}
            }
            if(m.serviceWard)this.perkPulse(m.groupRecovery?'heal':'ward',plant,1.2);
            if(m.cooldown&&this.time+1e-9>=this.nextShisaCooldownAt){
              for(const type of Object.keys(this.cooldowns))this.cooldowns[type]=Math.max(0,this.cooldowns[type]-m.cooldown);
              this.nextShisaCooldownAt=this.time+8;this.perkPulse('cooldown',plant,1.2);
            }
            plant.produceTimer += spec.interval;
          }
        } else if(plant.type==='kani'){
          plant.supportTimer-=dt;
          if(plant.supportTimer<=1e-9){
            const targets=[];
            const m=spec.mechanics||{};
            for(const other of this.plants.concat(m.wideSupport?this.supports:[])){
              if(other.id===plant.id||other.hp<=0||Math.abs(other.row-plant.row)>1||Math.abs(other.col-plant.col)>(m.wideSupport?2:1))continue;
              const value=Math.min(spec.heal,Math.max(0,other.maxHp-other.hp));
              if(value>0){other.hp+=value;targets.push({id:other.id,value});}
              if(m.ward&&spec.heal>value)this.grantPercentWard(other,m.ward*(spec.heal-value)/spec.heal,6,plant.type);
              if(m.protection)other.protectedUntil=this.time+4;
              if(m.wideSupport)this.repairSupport(other,20,plant.type);
            }
            plant.produceAge=0;plant.lastProduceAt=this.time;plant.supportTimer+=spec.supportInterval;
            this.animationCue(plant,'support',{targets});
            this.effect('heal',plant.x,plant.row,.7,{plantType:plant.type,radius:spec.range});
            this.events.push({type:'support',plantType:plant.type,id:plant.id,entityId:plant.id,at:this.time,x:plant.x,row:plant.row,
              healed:targets.reduce((sum,target)=>sum+target.value,0),targets});
            this.awardPlantXp(plant.type,targets.reduce((sum,target)=>sum+target.value,0)/40);
            if(m.ward)this.perkPulse('ward',plant,1.2);
          }
        } else if (plant.type === 'mine') {
          plant.riseAge=plant.age<spec.armTime-plant.riseDuration?-1:Math.min(plant.riseDuration,plant.age-(spec.armTime-plant.riseDuration));
          const wasArmed=plant.armed;
          plant.armed = plant.age >= spec.armTime-1e-9;
          this.animationState(plant,plant.armed?'armed':plant.riseAge>=0?'rise':'idle');
          if(plant.armed&&!wasArmed){
            plant.idleFps=12+animationRandom(plant)*3;plant.sourceIdleFps=plant.idleFps;plant.idleFrame=0;plant.idlePhase=0;
            this.animationCue(plant,'armed');
          }else if(plant.armed)plant.armedTime+=dt;
          if (plant.armed && this.enemiesInRow(plant.row).some(e => e.hp > 0 && Math.abs(e.x - plant.x) < .63)) this.explode(plant, spec.range, spec.damage, false);
        } else if (spec.fuse) {
          plant.fuseAge=plant.age;plant.fuseProgress=Math.min(1,plant.age/spec.fuse);
          if (plant.age >= spec.fuse-1e-9) {
            if (plant.type==='jalapeno') this.burnRow(plant);
            else this.explode(plant, spec.range, spec.damage, true);
          }
        } else if (SHOOTERS.has(plant.type)) {
          const targets = this.hasAttackTarget(plant);
          plant.targeting=targets;
          const timing=shootingTiming(plant.type),attackRate=tickSupportAttack(this,plant).attackRate;
          if(plant.secondShotTick&&this.simulationTick>=plant.secondShotTick){
            this.fireProjectile(plant,1);plant.secondShotTick=0;
            if(plant.burstShots===3)plant.thirdShotTick=this.simulationTick+18;
          }
          if(plant.thirdShotTick&&this.simulationTick>=plant.thirdShotTick){this.fireProjectile(plant,2);plant.thirdShotTick=0;}
          // UpdateShooting precedes UpdateShooter in the PC game. A newly
          // started counter is not decremented until the following 10 ms tick.
          if(plant.shootAge>=0){
            const beforeTicks=plant.shootTicks;
            plant.shootTicks+=attackRate;
            plant.shootAge=plant.shootTicks/100;
            plant.shootingCounter=Math.max(0,timing.shootCounter-plant.shootTicks);
            if(timing.cloudCounter&&beforeTicks<timing.shootCounter-timing.cloudCounter-1e-9&&plant.shootTicks>=timing.shootCounter-timing.cloudCounter-1e-9){
              plant.cloudAge=0;this.animationCue(plant,'cloud');
              this.events.push({type:'cloud',plantType:plant.type,id:plant.id,entityId:plant.id,at:this.time,x:plant.x,row:plant.row});
            }
            if(!plant.shotReleased&&plant.shootTicks>=timing.shootCounter-timing.fireCounter-1e-9){
              this.fireProjectile(plant);plant.shotReleased=true;
              if(plant.type==='repeater'){plant.secondShotTick=this.simulationTick+18;plant.burstShots=(spec.mechanics||{}).shots||2;}
            }
            plant.recoil=plant.shotReleased?Math.max(0,1-(plant.shootAge-plant.shootMarkerAge)/(plant.shootDuration-plant.shootMarkerAge)):0;
            if(plant.shootAge>=plant.shootDuration-1e-9){
              this.animationState(plant,'idle');plant.shootAge=-1;plant.recoil=0;plant.shootingCounter=0;
              if(timing.postShootIdleFps){plant.idleFps=timing.postShootIdleFps;plant.sourceIdleFps=plant.idleFps;plant.idleFrame=0;plant.idlePhase=0;}
            }
          }
          plant.launchCounter-=attackRate;
          if(plant.launchCounter<=0){
            // Rand(15) is [0,15): exact source launch spacing is 136..150 ticks.
            const overflow=attackRate===1?0:plant.launchCounter;
            plant.launchCounter=150-Math.floor(animationRandom(plant)*15)+overflow;
            plant.launchPeriodTicks=plant.launchCounter;
            if(targets){
              plant.shootAge=0;plant.shootTicks=0;plant.shootingCounter=timing.shootCounter;
              plant.shootStartedAt=this.time;plant.shotReleased=false;plant.recoil=0;plant.cloudAge=-1;
              this.animationState(plant,'shoot');this.animationCue(plant,'shoot-start');
              this.events.push({type:'shoot-start',plantType:plant.type,id:plant.id,entityId:plant.id,at:this.time,x:plant.x,row:plant.row});
            }
          }
          plant.attackTimer=plant.launchCounter/(100*attackRate);
        }
        if(plant.blinkAge>=0){plant.blinkAge=this.time-plant.blinkStartedAt;plant.blinkPhase=Math.min(1,plant.blinkAge/.2);if(plant.blinkAge>=.2-1e-9){plant.blinkAge=-1;plant.blinkPhase=0;}}
        plant.blinkCountdown--;
        if(plant.blinkCountdown<=0){
          // DoBlink resets the countdown even when the blink is suppressed.
          plant.blinkCountdown=400+Math.floor(animationRandom(plant)*400);
          if(!plant.shootingCounter&&(plant.type!=='mine'||plant.armed)){
            plant.blinkAge=0;plant.blinkPhase=0;plant.blinkStartedAt=this.time;
            this.events.push({type:'blink',id:plant.id,entityId:plant.id,at:this.time});
          }
        }
        plant.blinkTimer=plant.blinkCountdown/100;
      }

  }
  function stepActorProjectiles(dt) {
      for (const shot of this.projectiles) {
        // A projectile appears at the visual marker, and moves on the next tick.
        if(shot.createdAt===this.time)continue;
        const oldX = shot.x;
        const endX=shot.originX+shot.range;
        shot.x = Math.min(shot.x + shot.speed * dt,endX);
        shot.age += dt;
        const piercing=shot.type==='spore'||shot.maxHits>1;
        const targets = this.rowTargets(shot.row,oldX-.33,Math.min(endX,shot.x+.33),piercing?shot.hitIds:null);
        for (const target of targets) {
          const credit=this.liveSupportCredit(shot.supportCredit);
          const liveDamage=shot.damage/(1+(shot.supportCredit?shot.supportCredit.powerBonus:0))*(1+(credit?credit.powerBonus:0));
          const damage=liveDamage*(shot.type!=='spore'&&piercing&&shot.hitIds.length?.6:1)*(shot.frostBonus&&(target.frozenUntil||0)>this.time?1+shot.frostBonus:1);
          this.hurt(target, damage, shot.type==='snowpea'?4:0,.5,null,shot.plantType,false,credit);
          this.supportHit(shot.supportCredit,target,damage);
          this.effect('hit', target.x, target.row, shot.type==='snowpea'?.42:.2, {projectileType:shot.type,targetId:target.id});
          if(shot.mark&&target.hp>0){target.markedUntil=this.time+3;this.perkPulse('retaliate',target,.4);}
          if(shot.ricochet&&!shot.ricochetSpent&&target.hp<=0){
            shot.ricochetSpent=true;
            const bounce=this.nearestEnemy(target.x,target.row,1.5,1);
            if(bounce){this.hurt(bounce,liveDamage*shot.ricochet,0,.58,null,shot.plantType);this.perkPulse('splash',bounce,.5);}
          }
          if(shot.poison)this.poisonEnemy(target,shot.poison,shot.plantType,shot);
          if(shot.sporeField)this.addPerkField('spore',target.x,target.row,.65,3,shot.sporeField,shot.plantType);
          if(shot.freeze){
            const frozen=this.freezeEnemy(target,.7);
            if(shot.freezeSplash)for(const other of this.enemies)if(other.id!==target.id&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=shot.freezeSplash){
              if(this.freezeEnemy(other,.7))this.effect('hit',other.x,other.row,.42,{projectileType:'snowpea',targetId:other.id,iceSplash:true});
            }
            if(frozen&&shot.shatter){
              for(const other of this.enemies)if(other.hp>0&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=.7)this.hurt(other,liveDamage*shot.shatter,0,.58,null,shot.plantType);
              this.perkPulse('splash',target,.7);
            }
          }
          if(shot.splash){
            for(const other of this.enemies)if(other.id!==target.id&&other.hp>0&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=.65)this.hurt(other,liveDamage*shot.splash,0,.58,null,shot.plantType);
            this.perkPulse('splash',target,.7);
          }
          if(shot.plantType==='mushroom'&&target.hp>0&&this.time>=(target.nextSporePushAt||0)){target.nextSporePushAt=this.time+3;this.knockbackEnemy(target,.35);}
          if(shot.tailPush&&target.hp>0&&this.time>=(target.nextTailPushAt||0)){target.nextTailPushAt=this.time+3;this.knockbackEnemy(target,shot.tailPush);}
          if(shot.crossfire)for(const row of[target.row-1,target.row+1]){
            const side=this.nearestEnemy(target.x,row,1.8);
            if(side){this.hurt(side,liveDamage*shot.crossfire,0,.58,null,shot.plantType);this.perkPulse('splash',side,.6);}
          }
          if(piercing){shot.hitIds.push(target.id);if(shot.hitIds.length>=(shot.maxHits||Infinity)){shot.spent=true;break;}}
          else{shot.spent=true;break;}
        }
        if(shot.x>=endX)shot.spent=true;
      }
      this.projectiles = this.projectiles.filter(shot => !shot.spent && shot.x < this.getBoard().cols+1.2);

  }
  function stepActorEnemies(dt) {
      const blockers=contactRows(this);
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        enemy.age += dt;
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        enemy.frostTimer = Math.max(0, enemy.frostTimer - dt);
        enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
        const chilled=enemy.slowTimer>0?ANIMATION_TIMING.enemy.chilledRate:1;
        if((enemy.frozenUntil||0)>this.time||(enemy.stunnedUntil||0)>this.time||(enemy.shockUntil||0)>this.time){
          // Stop both the clip and its transition at the last displayed pose.
          // Keep contact state so thawing beside the same plant resumes the
          // bite; combat still skips this entire tick while immobilized.
          enemy.animationStateAt=this.time-enemy.animationStateAge;
          enemy.walkFps=0;enemy.eatFps=0;
          continue;
        }
        enemy.animationAge+=dt;
        enemy.animationStateAge=this.time-enemy.animationStateAt;
        if(enemy.gasping){
          enemy.eating=false;enemy.blockerId=null;
          if(this.time>enemy.gaspStartedAt)enemy.gaspAge+=dt*chilled;
          enemy.gaspPhase=Math.min(1,enemy.gaspAge/enemy.gaspDuration);
          if(enemy.gaspPhase<1-1e-9){if(this.checkEnemyBreach(enemy))break;continue;}
          enemy.gasping=false;enemy.gaspPhase=1;
          // Retain the last supporting step through the rage anticipation.
          enemy.eatTime=0;enemy.eatPhase=0;enemy.eatCycles=0;
          this.events.push({type:'rage-ready',id:enemy.id,entityId:enemy.id,at:this.time});
        }
        const blocker=contactBlocker(blockers,enemy);
        const enteringEat=!!blocker&&enemy.animationState!=='eat';
        enemy.eating = !!blocker;
        enemy.blockerId=blocker?blocker.id:null;
        const sourceVelocity=enemy.enraged?(enemy.type==='boss'?enemy.sourceWalkVelocity*1.5:enemy.sourceRageVelocity):enemy.sourceWalkVelocity;
        const enemyCol=Math.floor(enemy.x);
        // The front tile catches approaching visitors before contact. Multiple
        // neighboring leaves refresh the same local mist instead of stacking.
        const mistHere=this.getSupport(enemy.row,enemyCol),mistBehind=this.getSupport(enemy.row,enemyCol-1);
        const leafSlow=(mistHere&&mistHere.type==='frostlily'||mistBehind&&mistBehind.type==='frostlily')?this.combatPlantStats('frostlily').moveFactor:1;
        const terrainSpeed=this.getTerrain(enemy.row,Math.floor(enemy.x)).speed*leafSlow*(enemy.perkMoveFactor||1);
        const mistBite=leafSlow<1?(this.combatPlantStats('frostlily').mechanics||{}).biteFactor||1:1;
        let ordinarySpeed=enemy.speed*(enemy.enraged?ENEMIES[enemy.type].rageSpeed||2.05:1);
        if(this.isEndless)ordinarySpeed=Math.min(ENDLESS.maxSpeed,ordinarySpeed);
        let moveSpeed=ordinarySpeed*terrainSpeed*(enemy.drumRate||1);
        if(this.isEndless)moveSpeed=Math.min(ENDLESS.maxSpeed,moveSpeed);
        const terrainWalkRate=ordinarySpeed>0?moveSpeed/ordinarySpeed:terrainSpeed;
        enemy.sourceWalkFps=sourceVelocity*enemy.sourceWalkFrames/enemy.sourceGroundDistance*47;
        enemy.walkFps=enemy.sourceWalkFps*chilled*terrainWalkRate;
        enemy.eatFps=enemy.sourceEatFps*chilled*mistBite*(enemy.drumRate||1);
        if (blocker) {
          const guard=!blocker.support?this.getSupport(blocker.row,blocker.col):null;
          const shield=guard&&guard.shield>0?guard:null;
          if(enteringEat){enemy.eatTime=0;enemy.eatCycles=0;enemy.eatPhase=0;this.animationState(enemy,'eat');enemy.animationStateAge=0;enemy.animationStateAt=this.time;}
          else {
            enemy.eatTime+=dt;
            const previousCycle=enemy.eatCycles;
            enemy.eatCycles+=dt*enemy.eatFps/enemy.sourceEatFrames;
            enemy.eatPhase=enemy.eatCycles%1;
            for(const marker of enemy.sourceChewMarkers){
              if(crossed(previousCycle,enemy.eatCycles,marker)){
                enemy.lastBiteAt=this.time;
                this.animationCue(enemy,'bite',{targetId:blocker.id,phase:marker});
                const struck=shield||blocker;
                struck.hitTimer=.18;struck.lastHitAt=this.time;
                if(shield)shield.shieldHitTimer=.24;
                else if(this.isEndless&&blocker.ward>0&&(blocker.wardUntil||0)>this.time&&
                  (!blocker.wardSourceId||this.supportSourceAt(blocker.wardSourceId,blocker.row,blocker.col)))blocker.wardHitAt=this.time;
                this.animationCue(struck,shield?'shield-hit':'hurt',{sourceId:enemy.id});
                this.events.push({type:'bite',id:enemy.id,entityId:enemy.id,targetId:blocker.id,at:this.time,phase:marker});
              }
            }
          }
          // As in the source, chew animation/sound markers are not damage
          // ticks. Chilling slows both the animation and damage rate.
          let damage=ENEMIES[enemy.type].damage * (enemy.damageScale||1) * (enemy.enraged ? 1.5 : 1) * chilled * mistBite * (enemy.drumRate||1) * dt;
          if(this.isEndless){
            blocker.lastDamagedAt=this.time;
            if(guard)guard.lastDamagedAt=this.time;
            if((blocker.protectedUntil||0)>this.time)damage*=.8;
            if((enemy.weakenedUntil||0)>this.time)damage*=.8;
            damage=this.defendPlant(blocker,enemy,damage,guard);
          }
          if(shield){
            if(this.isEndless)shield.lastDamagedAt=this.time;
            const absorbed=Math.min(shield.shield,damage);
            shield.shield=Math.max(0,shield.shield-absorbed);damage-=absorbed;
            this.awardPlantXp(shield.type,absorbed/40);
            if(shield.shield===0){
              shield.shieldBreakAt=this.time;
              this.animationCue(shield,'shield-break');
              this.events.push({type:'shieldBreak',id:shield.id,entityId:shield.id,row:shield.row,col:shield.col,at:this.time});
              const m=this.combatPlantStats(shield.type).mechanics||{};
              if(m.push&&this.time>=(shield.nextShieldPushAt||0)){
                shield.nextShieldPushAt=this.time+30;
                for(const other of this.enemies)if(Math.abs(other.row-shield.row)<=1&&Math.abs(other.x-shield.x)<=1.2)this.knockbackEnemy(other,m.push);
              }
            }
          }
          if(blocker.wardSourceId&&!this.supportSourceAt(blocker.wardSourceId,blocker.row,blocker.col))blocker.ward=0;
          if(this.isEndless&&blocker.ward>0&&(blocker.wardUntil||0)>this.time){
            const absorbed=Math.min(blocker.ward,damage);blocker.ward-=absorbed;damage-=absorbed;
            if(absorbed>0&&blocker.ward===0)blocker.wardBreakAt=this.time;
            this.awardPlantXp(blocker.wardSourceType,absorbed/40);
          }
          const effectiveDamage=Math.min(Math.max(0,blocker.hp),damage);
          blocker.hp-=damage;
          this.awardPlantXp(blocker.type,effectiveDamage/40);
          if(blocker.hp<=0)this.rescuePlant(blocker);
          if(this.isEndless&&blocker.type==='wallnut'&&blocker.hp>0){
            const m=this.combatPlantStats(blocker.type).mechanics;
            if(m.retaliate&&this.time>=(blocker.nextRetaliateAt||0)){
              blocker.nextRetaliateAt=this.time+1;this.hurt(enemy,m.retaliate,0,.58,null,blocker.type);this.perkPulse('retaliate',blocker,.65);
            }
          }
          if (blocker.hp <= 0) {
            this.effect('shovel', blocker.x, blocker.row, .6);
            this.events.push({type:'plantLost', plantType:blocker.type, row:blocker.row, col:blocker.col});
          }
        } else {
          if(enemy.animationState!=='walk'){this.animationState(enemy,'walk');}
          else {
            enemy.walkTime+=dt;
            enemy.locomotionPhase=(enemy.locomotionPhase+dt*enemy.walkFps/enemy.sourceWalkFrames)%1;
          }
          // Hurt flashes do not immobilize the source body reanimation. Its
          // integrated phase keeps advancing through hits, slow and rage.
          enemy.x -= moveSpeed * (enemy.frostTimer>0?.5:enemy.slowTimer>0?.58:1) * dt;
        }
        if(this.checkEnemyBreach(enemy))break;
      }
  }
  class Game {
    constructor(options = {}) {
      preparedEndlessGames.add(this);
      this.seed = Number.isFinite(options.seed) ? options.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
      if(options.trustedAuthoritativeFields===true)authoritativeFields.set(this,{fields:null,length:0,generation:0,ordinary:false,workspace:null});
      if(options.trustedAuthoritativeTopology===true)actorAuthorities.set(this,{initial:true,ordinary:false,active:false,revision:0,roots:null});
      // Only existing private field owners inspect the new capability option.
      // Public/default-off options receive no new descriptor trap.
      if(authoritativeFields.has(this)&&Object.getPrototypeOf(this)===Game.prototype){
        const partitions=Object.getOwnPropertyDescriptor(options,'trustedActorLoopPartitions');
        if(partitions&&Object.prototype.hasOwnProperty.call(partitions,'value')&&partitions.value===true)trustedActorLoopPartitions.add(this);
      }
      this.reset();
    }
    reset() {
      plantStatCaches.delete(this);battleIndexes.delete(this);supportIndexes.delete(this);terrainLookups.delete(this);perkWorkspaces.delete(this);contactWorkspaces.delete(this);attackAuraWorkspaces.delete(this);resetFieldAuthority(this);resetActorAuthority(this);
      this.strategy=runDirector?runDirector.createState(undefined,{plantIds:Object.keys(PLANTS)}):null;
      this.status = 'ready';
      this.time = 0;
      this.sun = 250;
      this.wave = 1;
      this.isEndless = false;
      this.wavesCleared = 0;
      this.nextWaveIn = null;
      this.waveSpawned = 0;
      this.waveTotal = 0;
      this.waveKillStart = 0;
      this.endlessWave = null;
      this.endlessGrowthRate = 'normal';
      this.endlessDifficulty = 1;
      this.endlessSurge = 0;
      this.endlessBoardSize = 'classic';
      this.sceneLayoutVersion = sceneTerrain.VERSION;
      this.nextEndlessSpawnAt = 0;
      this.intermissionUntilTick = null;
      this.kills = 0;
      this.plants = [];
      this.supports = [];
      this.enemies = [];
      this.projectiles = [];
      this.suns = [];
      this.effects = [];
      this.perkFields = [];
      this.perkActions = [];
      this.nextShisaCooldownAt = 0;
      this.nextSunflowerRallyAt = 0;
      this.events = [];
      this.mowers = Array.from({length: 5}, (_, row) => ({row, x: -.45, active: false, used: false}));
      this.cooldowns = Object.fromEntries(Object.keys(PLANTS).map(key => [key, 0]));
      // Research belongs to this run and this species, not permanent unlocks or
      // one disposable plant. Replanting therefore inherits the earned level.
      this.growth = Object.fromEntries(Object.keys(PLANTS).map(key => [key, {level:1,xp:0}]));
      this.wavePlantTypes = new Set();
      this.growthRewardedWave = 0;
      this.levelId = 'meadow';
      this.level = LEVELS.meadow;
      this.mapId = 'garden';
      this.spawnIndex = 0;
      this.spawnPlan = [];
      this.totalEnemies = 0;
      this.skyTimer = 5;
      this.nextId = 1;
      this.rngState = this.seed || 0x12345678;
      this.waveAnnounced = 0;
      this.simulationTick = 0;
      this.updateRemainder = 0;
    }
    exportEndlessSave() {
      if(!this.isEndless||!['playing','paused'].includes(this.status))return null;
      try{
        const data={};
        for(const key of SAVE_FIELDS)data[key]=key==='wavePlantTypes'?Array.from(this.wavePlantTypes):
          key==='projectiles'?this.projectiles.map(shot=>({...shot,maxHits:shot.maxHits===Infinity?'unlimited':shot.maxHits})):this[key];
        const state=copySaveData(data);
        if(!validEndlessState(state))return null;
        const snapshot={version:4,state};
        // The compact queue derives types from strategy.fromWave. Keep that
        // input in raw engine saves as well as the UI checkpoint envelope.
        if(runDirector)snapshot.strategy=runDirector.restoreState(this.strategy,state,Object.keys(PLANTS));
        return snapshot;
      }catch(_){return null;}
    }
    importEndlessSave(snapshot) {
      try{
        const save=copySaveData(snapshot);
        if(!saveShape(save,{version:value=>value===1||value===2||value===3||value===4,state:saveRecord,strategy:saveRecord},['version','state'])||(save.version===1&&!Array.isArray(save.state.spawnPlan)))return false;
        if(save.version<3&&Object.prototype.hasOwnProperty.call(save.state,'endlessBoardSize'))return false;
        if(save.version<4&&Object.prototype.hasOwnProperty.call(save.state,'sceneLayoutVersion'))return false;
        // Only complete known v1 shapes migrate. Preserve the entire current
        // wave; the strengthened fast curve starts at the next wave boundary.
        if(save.version===1&&Object.keys(save.state).length===LEGACY_SAVE_FIELDS.length&&LEGACY_SAVE_FIELDS.every(key=>Object.prototype.hasOwnProperty.call(save.state,key))){
          save.state.endlessGrowthRate='normal';save.state.endlessDifficulty=save.state.wave;
        }
        if(save.version===1&&Object.keys(save.state).length===GROWTH_SAVE_FIELDS.length&&GROWTH_SAVE_FIELDS.every(key=>Object.prototype.hasOwnProperty.call(save.state,key))){
          save.state.endlessSurge=0;
        }
        if(save.version<3&&Object.keys(save.state).length===SURGE_SAVE_FIELDS.length&&SURGE_SAVE_FIELDS.every(key=>Object.prototype.hasOwnProperty.call(save.state,key))){
          save.state.endlessBoardSize='classic';
        }
        // Keep old runs on exactly the terrain on which they were planted.
        if(save.version<4&&Object.keys(save.state).length===BOARD_SAVE_FIELDS.length&&BOARD_SAVE_FIELDS.every(key=>Object.prototype.hasOwnProperty.call(save.state,key))){
          save.state.sceneLayoutVersion=0;
        }
        const oldPlants=Object.keys(PLANTS).filter(type=>!EXPANSION_PLANTS.includes(type));
        const oldShape=save.version===1&&save.state.cooldowns&&save.state.growth&&Object.keys(save.state.cooldowns).length===oldPlants.length&&Object.keys(save.state.growth).length===oldPlants.length&&oldPlants.every(type=>Object.prototype.hasOwnProperty.call(save.state.cooldowns,type)&&Object.prototype.hasOwnProperty.call(save.state.growth,type));
        if(oldShape){
          for(const type of EXPANSION_PLANTS){save.state.cooldowns[type]=0;save.state.growth[type]={level:1,xp:0};}
          const wave=save.state.wave,oldRoster=wave<3?['momonga','momonga','runner']:wave<5?['momonga','runner','pinkchimera','chimera']:['anoko','runner','pinkchimera','chimera','momonga','runner'];
          const oldTypes=wave%5===0?['boss',...oldRoster,...oldRoster]:oldRoster;
          if(save.state.endlessWave&&JSON.stringify(save.state.endlessWave.types)===JSON.stringify(oldTypes))save.state.endlessWave.types=getEndlessWave(wave,save.state.endlessDifficulty,save.state.endlessSurge).types;
        }
        if(!validEndlessState(save.state))return false;
        const state=save.state;
        const strategy=runDirector?runDirector.restoreState(save.strategy,state,Object.keys(PLANTS)):null;
        state.wavePlantTypes=new Set(state.wavePlantTypes);
        for(const shot of state.projectiles)if(shot.maxHits==='unlimited')shot.maxHits=Infinity;
        // Every validation and conversion above precedes the commit. Restoring
        // starts paused and never replays already handled sound/reward events.
        for(const key of SAVE_FIELDS)this[key]=state[key];
        plantStatCaches.delete(this);battleIndexes.delete(this);supportIndexes.delete(this);terrainLookups.delete(this);perkWorkspaces.delete(this);contactWorkspaces.delete(this);attackAuraWorkspaces.delete(this);resetFieldAuthority(this);resetActorAuthority(this);
        this.level=ENDLESS;this.endlessWave=Object.freeze(state.endlessWave);this.status='paused';this.events=[];
        this.strategy=strategy;
        if(oldShape){
          this.syncGuardShields();
          const ratios={sunflower:.15,shisa:.2,kani:.25,wallnut:.2,lily:.2,guardlily:.2,hastelily:.15};
          for(const plant of this.plants.concat(this.supports))if(plant.ward>0&&ratios[plant.wardSourceType]){const left=plant.wardMax>0?plant.ward/plant.wardMax:1;plant.wardRatio=ratios[plant.wardSourceType];plant.wardMax=plant.maxHp*plant.wardRatio;plant.ward=plant.wardMax*left;}
        }
        return true;
      }catch(_){return false;}
    }
    initAnimation(entity, state) {
      // An independent stream keeps artwork variation from changing sun drops.
      entity.animationRngState=(this.seed^Math.imul(entity.id,0x9e3779b1)^0x85ebca6b)>>>0||1;
      const kind=motionKind(entity.type),spec=ANIMATION_TIMING[kind];
      entity.idleFps=(spec&&spec.idleMin||10)+animationRandom(entity)*((spec&&spec.idleMax||15)-(spec&&spec.idleMin||10));
      Object.assign(entity,{animationAge:0,animationState:state,animationStateAge:0,animationStateAt:this.time,
        previousAnimationState:state,previousAnimationPhase:0,idleFrame:0,idlePhase:0,walkTime:0,eatTime:0,locomotionPhase:0,eatPhase:0,eatCycles:0,
        shootAge:-1,produceAge:-1,cloudAge:-1,recoil:0,cue:null,cueSequence:0,lastShotAt:-1,lastProduceAt:-1,lastBiteAt:-1,lastHitAt:-1,
        sourceIdleFps:entity.idleFps,sourceTickHz:100,sourceIdleFrames:kind==='mushroom'?17:kind==='mine'?11:kind==='cherry'?14:25});
      if(SHOOTERS.has(entity.type)){
        Object.assign(entity,{sourceShootFps:spec.shootFps,sourceShootCounter:spec.shootCounter,sourceFireCounter:spec.fireCounter,
          shootMarkerAge:(spec.shootCounter-spec.fireCounter)/100,shootDuration:spec.shootFrames/spec.shootFps,
          sourceShootFrames:spec.shootFrames,sourceBlendTicks:spec.blendTicks,shootStartedAt:-1,shootTicks:0,shootingCounter:0,shotReleased:false,
          launchCounter:Math.floor(animationRandom(entity)*151),launchRate:150,secondShotTick:0});
        entity.attackTimer=entity.launchCounter/100;
      }
      if(ENEMIES[entity.type]){
        const timing=ANIMATION_TIMING.enemy,paper=kind==='chimera';
        Object.assign(entity,{sourceWalkVelocity:.23+animationRandom(entity)*.14,sourceRageVelocity:.89+animationRandom(entity)*.02,
          sourceWalkFrames:47,sourceGroundDistance:paper?57.8:49.8,sourceEatFps:36,sourceEatFrames:paper?24:40,
          sourceChewMarkers:paper?[.42]:[.14,.68],sourceWalkFps:0,walkFps:0,eatFps:36,blockerId:null,
          gasping:false,gaspAge:-1,gaspPhase:0,gaspStartedAt:-1,gaspDuration:13/8,sourceGaspFps:8,sourceGaspFrames:13,sourceGaspBlendTicks:10});
        entity.sourceWalkFps=entity.sourceWalkVelocity*timing.walkFrames/entity.sourceGroundDistance*47;
        entity.walkFps=entity.sourceWalkFps;
      }
      if(entity.type==='mine')Object.assign(entity,{riseAge:-1,riseDuration:19/18,sourceRiseFps:18,sourceRiseFrames:19,armedTime:0});
      if(kind==='cherry')Object.assign(entity,{fuseAge:0,fuseDuration:PLANTS[entity.type].fuse,fuseProgress:0});
      if(PLANTS[entity.type]){
        entity.blinkCountdown=400+Math.floor(animationRandom(entity)*400);
        Object.assign(entity,{blinkTimer:entity.blinkCountdown/100,blinkAge:-1,blinkPhase:0,blinkStartedAt:-1,sourceBlinkFps:15,sourceBlinkFrames:3});
      }
    }
    animationState(entity, state) {
      if(entity.animationState===state)return;
      const previous=entity.animationState;
      entity.previousAnimationPhase=previous==='walk'?entity.locomotionPhase:previous==='eat'||previous==='attack'?entity.eatPhase:
        previous==='shoot'?Math.max(0,Math.min(1,entity.shootAge/entity.shootDuration)):previous==='gasp'?entity.gaspPhase:
        previous==='rise'?Math.max(0,Math.min(1,entity.riseAge/entity.riseDuration)):previous==='fuse'?entity.fuseProgress:entity.idlePhase;
      entity.previousAnimationState=entity.animationState;entity.animationState=state;entity.animationStateAge=0;entity.animationStateAt=this.time;
    }
    animationCue(entity, type, extra = {}) {
      entity.cue={type,at:this.time,id:entity.id,entityId:entity.id,sequence:++entity.cueSequence,...extra};
      return entity.cue;
    }
    random() {
      let value = this.rngState;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      this.rngState = value >>> 0;
      return this.rngState / 4294967296;
    }
    start(levelId = 'meadow', options = {}) {
      this.reset();
      if(levelId==='endless'){
        this.levelId='endless';this.level=ENDLESS;this.isEndless=true;this.status='playing';
        this.mapId=options&&Object.prototype.hasOwnProperty.call(MAPS,options.mapId)?options.mapId:'garden';
        if(options&&knownEndlessBoardSize(options.endlessBoardSize))this.endlessBoardSize=options.endlessBoardSize;
        const board=this.getBoard();this.sun=board.startingSun;
        this.mowers=Array.from({length:board.rows},(_,row)=>({row,x:-.45,active:false,used:false}));
        if(options&&knownEndlessGrowthRate(options.endlessGrowthRate))this.endlessGrowthRate=options.endlessGrowthRate;
        this.events.push({type:'start',levelId:'endless',endless:true});
        this.beginEndlessWave(1,16);
        return this;
      }
      this.levelId = LEVELS[levelId] ? levelId : 'meadow';
      this.level = LEVELS[this.levelId];
      this.mapId = this.level.mapId;
      const laneOffset = Math.floor(this.random() * 5);
      this.level.waves.forEach((wave, waveIndex) => {
        for (let i = 0; i < wave.count; i++) {
          let type = 'momonga';
          if (waveIndex === 1 && i % 4 === 2) type = 'chimera';
          if (waveIndex === 2) type = i % 5 === 2 ? 'anoko' : i % 3 === 1 ? 'chimera' : 'momonga';
          if (wave.types && wave.types.length) type = wave.types[i % wave.types.length];
          const lane=wave.lanes&&wave.lanes.length?wave.lanes[i%wave.lanes.length]:i*2;
          this.spawnPlan.push({at: wave.at + i * wave.gap, row: (lane + laneOffset + waveIndex) % 5, type, wave: waveIndex + 1});
        }
      });
      this.spawnPlan.sort((a, b) => a.at - b.at);
      this.totalEnemies = this.spawnPlan.length;
      this.waveTotal = this.level.waves[0].count;
      this.status = 'playing';
      this.events.push({type: 'start', levelId: this.levelId});
      return this;
    }
    beginEndlessWave(value, delay = 0) {
      if(!this.isEndless||this.enemies.some(enemy=>enemy.hp>0))return false;
      const wave=Number.isFinite(value)?Math.max(1,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value))):1;
      const difficulty=this.nextEndlessDifficulty(wave);
      const surge=this.nextEndlessSurge(wave);
      const config=getEndlessWave(wave,difficulty,surge,this.endlessBoardSize),laneOffset=Math.floor(this.random()*this.getBoard().rows);
      // Replace the pending plan, rather than retaining past or future waves.
      this.totalEnemies-=Math.max(0,this.spawnPlan.length-this.spawnIndex);
      this.wave=config.wave;this.endlessDifficulty=difficulty;this.endlessSurge=surge;this.endlessWave=config;this.waveTotal=config.count;this.waveSpawned=0;
      this.waveKillStart=this.kills;this.nextWaveIn=null;this.intermissionUntilTick=null;
      this.wavePlantTypes=new Set(this.plants.concat(this.supports).filter(plant=>plant.hp>0).map(plant=>plant.type));
      this.spawnIndex=0;this.nextEndlessSpawnAt=this.time+Math.max(0,Number.isFinite(delay)?delay:0);
      this.spawnPlan={kind:'endless-v2',length:config.count,startAt:this.nextEndlessSpawnAt,laneOffset};
      this.totalEnemies=Math.min(Number.MAX_SAFE_INTEGER,this.totalEnemies+config.count);this.waveAnnounced=this.wave;
      this.events.push({type:'wave',wave:this.wave,endless:true,total:config.count,at:this.time});
      return true;
    }
    spawnSpecAt(index) {
      if(!Number.isSafeInteger(index)||index<0||index>=this.spawnPlan.length)return null;
      if(Array.isArray(this.spawnPlan))return this.spawnPlan[index];
      const plan=this.spawnPlan,config=this.endlessWave;
      const regularTypes=config.types.filter(type=>type!=='boss');
      let boss=false;
      for(let i=0;i<config.bossCount;i++)if(index===Math.floor(i*config.count/config.bossCount)){boss=true;break;}
      const originalType=this.wave<=5&&this.endlessDifficulty===this.wave?config.types[index%config.types.length]:boss?'boss':regularTypes[index%regularTypes.length];
      return {at:plan.startAt+index*config.gap,row:(config.lanes[index%config.lanes.length]+plan.laneOffset)%this.getBoard().rows,
        type:runDirector?runDirector.spawnType(runDirector.planWave(this),index,originalType):originalType,wave:this.wave};
    }
    nextEndlessDifficulty(wave=this.wave+1) {
      return Math.min(Number.MAX_SAFE_INTEGER,this.endlessDifficulty+Math.max(0,wave-this.wave)*ENDLESS_GROWTH_RATES[this.endlessGrowthRate].step);
    }
    nextEndlessSurge(wave=this.wave+1) {
      return Math.min(Number.MAX_SAFE_INTEGER,this.endlessSurge+(this.endlessGrowthRate==='fast'?Math.max(0,wave-this.wave):0));
    }
    setEndlessGrowthRate(rate) {
      if(!this.isEndless||!['playing','paused'].includes(this.status)||!knownEndlessGrowthRate(rate))return false;
      // Changing pace affects the next wave only. Existing enemies and the
      // remaining spawn queue retain their original stats and arrival cadence.
      this.endlessGrowthRate=rate;
      return true;
    }
    getEndlessGrowthPreview() {
      if(!this.isEndless||!this.endlessWave)return null;
      const nextDifficulty=this.nextEndlessDifficulty(),nextSurge=this.nextEndlessSurge();
      return {rate:this.endlessGrowthRate,difficulty:this.endlessDifficulty,nextDifficulty,surge:this.endlessSurge,nextSurge,
        current:this.endlessWave,next:getEndlessWave(this.wave+1,nextDifficulty,nextSurge,this.endlessBoardSize)};
    }
    togglePause() {
      if (this.status === 'playing') this.status = 'paused';
      else if (this.status === 'paused'&&!(this.isEndless&&this.strategy&&this.strategy.pending)) this.status = 'playing';
      return this.status;
    }
    cellValid(row, col) {
      const board=this.getBoard();
      return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < board.rows && col >= 0 && col < board.cols;
    }
    getBoard() {
      return ENDLESS_BOARD_SIZES[this.isEndless&&knownEndlessBoardSize(this.endlessBoardSize)?this.endlessBoardSize:'classic'];
    }
    getMap() {
      const cached=terrainLookups.get(this);
      if(cached&&cached.mapId===this.mapId&&cached.boardSize===this.endlessBoardSize&&cached.endless===this.isEndless&&cached.layout===this.sceneLayoutVersion)return cached.map;
      const boardId=this.getBoard().id;
      const map=this.isEndless?getEndlessMap(this.mapId,boardId,this.sceneLayoutVersion):getLegacyEndlessMap(this.mapId,boardId);
      terrainLookups.set(this,{mapId:this.mapId,boardId,boardSize:this.endlessBoardSize,endless:this.isEndless,layout:this.sceneLayoutVersion,map});
      return map;
    }
    getTerrain(row, col) {
      // Outside the visible lawn, enemies still enter and leave at their
      // ordinary pace. Placement separately requires an in-bounds cell.
      const board=this.getBoard();
      return TERRAIN_TILES[Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&row<board.rows&&col>=0&&col<board.cols?this.getMap().tiles[row][col]:'grass'];
    }
    getSupport(row, col) {
      const index=this.activeSupportIndex();
      if(index&&Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&row<index.rows&&col>=0&&col<index.cols){
        for(const support of index.supportCells[row*index.cols+col])if(support.hp>0)return support;
        return null;
      }
      return (index?index.outsideSupports:this.supports).find(support=>support.hp>0&&support.row===row&&support.col===col)||null;
    }
    getPlantAt(row, col) {
      const index=this.activeSupportIndex();
      if(index&&Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&row<index.rows&&col>=0&&col<index.cols){
        for(const plant of index.plantCells[row*index.cols+col])if(plant.hp>0)return plant;
        return null;
      }
      return (index?index.outsidePlants:this.plants).find(plant=>plant.hp>0&&plant.row===row&&plant.col===col)||null;
    }
    getPlantById(id) {
      const index=this.activeSupportIndex(),plant=index?index.plantsById.get(id):this.plants.find(plant=>plant.hp>0&&plant.id===id);
      return plant&&plant.hp>0?plant:null;
    }
    getSupportById(id) {
      const index=this.activeSupportIndex(),support=index?index.supportsById.get(id):this.supports.find(support=>support.hp>0&&support.id===id);
      return support&&support.hp>0?support:null;
    }
    supportSourceAt(id, row, col) {
      const source=this.getSupportById(id);
      return source&&source.row===row&&source.col===col?source:null;
    }
    localPlants(row, col, supports=false) {
      const index=this.activeSupportIndex();
      return index&&Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&row<index.rows&&col>=0&&col<index.cols?(supports?index.nearSupports:index.nearPlants)[row*index.cols+col]:supports?this.supports:this.plants;
    }
    refreshSupportIndex() {
      // Small or dry formations cost less to scan than to populate four cell
      // tables. Crossing this threshold during a step remains safe: consumers
      // use live-array queries until the next step rebuilds the table.
      if(this.supports.length<16){
        const prior=supportIndexes.get(this);if(prior)prior.active=false;
        return null;
      }
      const board=this.getBoard(),count=board.rows*board.cols;
      let index=supportIndexes.get(this);
      const authority=activeActorAuthority(this);
      if(authority&&index&&index.boardId===board.id&&index.authorityRevision===authority.revision){
        index.plants=this.plants;index.supports=this.supports;index.boardSize=this.endlessBoardSize;index.endless=this.isEndless;index.active=true;
        return index;
      }
      const sameTopology=(actors,topology)=>{
        if(!topology||topology.length!==actors.length*4)return false;
        for(let i=0;i<actors.length;i++){
          const actor=actors[i],at=i*4;
          if(topology[at]!==actor||topology[at+1]!==actor.row||topology[at+2]!==actor.col||topology[at+3]!==actor.id)return false;
        }
        return true;
      };
      // Check the live source topology at every tick boundary. Health, wards,
      // levels and burst timers are still read from the actors on every use;
      // only unchanged cell/neighbor membership and insertion order are reused.
      if(index&&index.boardId===board.id&&sameTopology(this.plants,index.plantTopology)&&sameTopology(this.supports,index.supportTopology)){
        index.authorityRevision=authority?authority.revision:undefined;
        index.plants=this.plants;index.supports=this.supports;index.boardSize=this.endlessBoardSize;index.endless=this.isEndless;index.active=true;
        return index;
      }
      if(!index||index.boardId!==board.id){
        index={boardId:board.id,rows:board.rows,cols:board.cols,plantCells:Array.from({length:count},()=>[]),supportCells:Array.from({length:count},()=>[]),
          nearPlants:Array.from({length:count},()=>[]),nearSupports:Array.from({length:count},()=>[]),plantsById:new Map(),supportsById:new Map(),plantTopology:[],supportTopology:[],outsidePlants:[],outsideSupports:[],active:false,version:0};
        supportIndexes.set(this,index);
      }
      index.authorityRevision=authority?authority.revision:undefined;
      index.version++;
      for(let i=0;i<count;i++){
        index.plantCells[i].length=0;index.supportCells[i].length=0;
        index.nearPlants[i].length=0;index.nearSupports[i].length=0;
      }
      index.plantsById.clear();index.supportsById.clear();
      const fill=(actors,cells,near,byId,topology,outside)=>{
        topology.length=0;outside.length=0;
        // Iterate sources first: equal-strength auras and healers retain the
        // same insertion-order precedence as the original full-array scans.
        for(const actor of actors){
          topology.push(actor,actor.row,actor.col,actor.id);
          byId.set(actor.id,actor);
          if(!this.cellValid(actor.row,actor.col)){outside.push(actor);continue;}
          cells[actor.row*board.cols+actor.col].push(actor);
          for(let row=Math.max(0,actor.row-1);row<=Math.min(board.rows-1,actor.row+1);row++){
            for(let col=Math.max(0,actor.col-1);col<=Math.min(board.cols-1,actor.col+1);col++)near[row*board.cols+col].push(actor);
          }
        }
      };
      // Keep references to dead actors until cleanup: a rescue can revive one
      // during this tick, and every consumer checks its current hp.
      fill(this.plants,index.plantCells,index.nearPlants,index.plantsById,index.plantTopology,index.outsidePlants);
      fill(this.supports,index.supportCells,index.nearSupports,index.supportsById,index.supportTopology,index.outsideSupports);
      index.plants=this.plants;index.supports=this.supports;index.plantCount=this.plants.length;index.supportCount=this.supports.length;index.boardSize=this.endlessBoardSize;index.endless=this.isEndless;index.active=true;
      return index;
    }
    activeSupportIndex() {
      const index=supportIndexes.get(this);
      // Public commands and callers may move or replace actors between ticks.
      // The table is only authoritative during a step; every new step checks
      // live membership, coordinates, IDs and insertion order before reuse.
      if(!index||!index.active)return null;
      if(index.boardSize!==this.endlessBoardSize||index.endless!==this.isEndless||index.plants!==this.plants||index.supports!==this.supports||
        index.plantCount!==this.plants.length||index.supportCount!==this.supports.length)return this.refreshSupportIndex();
      return index;
    }
    getPlantStats(type, levelOverride) {
      // Public callers keep independent values; combat reuses a read-only snapshot.
      const stats=this.combatPlantStats(type,levelOverride);
      return stats?{...stats,...(stats.mechanics?{mechanics:{...stats.mechanics}}:{})}:null;
    }
    combatPlantStats(type, levelOverride) {
      let cache=plantStatCaches.get(this),entry=cache&&cache[type];
      // Default combat reads must observe XP level changes immediately, even
      // midway through a tick. UI previews do not replace this live record.
      if(this.isEndless&&levelOverride===undefined&&entry&&entry.requested===this.growth[type].level&&entry.boardSize===this.endlessBoardSize)return entry.liveStats;
      if(!Object.prototype.hasOwnProperty.call(PLANTS,type))return null;
      const base=PLANTS[type];
      if(!this.isEndless)return base;
      const requested=levelOverride===undefined?this.growth[type].level:levelOverride;
      const level=Number.isFinite(requested)?Math.max(1,Math.min(PLANT_LEVEL_PRECISION_LIMIT,Math.floor(requested))):1,steps=level-1;
      if(!cache){cache=Object.create(null);plantStatCaches.set(this,cache);}
      if(!entry)entry=cache[type]={levels:[]};
      const board=this.getBoard(),levels=entry.levels;
      const remember=stats=>{
        if(levelOverride===undefined){entry.requested=requested;entry.boardSize=this.endlessBoardSize;entry.liveStats=stats;}
        return stats;
      };
      for(const prior of levels)if(prior.level===level&&prior.boardId===board.id)return remember(prior.stats);
      const stats={...base};
      if(base.range===10)stats.range=board.cols+1;
      const hpGain=['wallnut','lily','frostlily','powerlily','hastelily'].includes(type)?.35:type==='guardlily'?.25:.18;
      const rounded=value=>Math.round(value*100)/100;
      stats.hp=rounded(base.hp*(1+hpGain*steps));
      if(base.damage)stats.damage=rounded(base.damage*(1+.25*steps));
      if(type==='sunflower')stats.produceValue=25+5*steps;
      if(type==='shisa')stats.produceValue=50+10*steps;
      if(base.heal)stats.heal=rounded(base.heal*(1+.25*steps));
      if(base.shieldRatio){stats.shieldRatio=rounded(base.shieldRatio+.05*steps);stats.shield=rounded(stats.hp*stats.shieldRatio);}
      if(type==='frostlily')stats.moveFactor=Math.max(.2,rounded(base.moveFactor-.04*steps));
      if(type==='powerlily')stats.damageBonus=rounded(base.damageBonus+.02*steps);
      if(type==='hastelily')stats.attackRate=Math.min(base.attackRateCap,rounded(base.attackRate+.01*steps));
      stats.mechanics=plantMechanics(type,level);
      levels.unshift({level,boardId:board.id,stats});
      if(levels.length>2)levels.pop();
      return remember(stats);
    }
    getPlantUpgrade(type) {
      const known=Object.prototype.hasOwnProperty.call(PLANTS,type),growth=known?this.growth[type]:null;
      const valid=validPlantGrowth(growth),level=valid?growth.level:1,maxed=false,enabled=this.isEndless&&known;
      const numericLimit=level>=PLANT_LEVEL_PRECISION_LIMIT;
      const current=known?this.getPlantStats(type):null,next=enabled&&valid&&!numericLimit?this.getPlantStats(type,level+1):null;
      const cost=enabled?Math.ceil(Math.max(50,PLANTS[type].cost*.85)*(1+.8*(level-1))/25)*25:0;
      const active=this.status==='playing'||this.status==='paused';
      const reason=!known?'没有这位伙伴':!this.isEndless?'成长仅在无尽讨伐中开放':!active?'开始无尽讨伐后才能升级':!valid||numericLimit?'等级超出安全数值范围':!Number.isFinite(this.sun)?'阳光数值无效':this.sun<cost?'阳光不足':'';
      const benefits=[];
      if(next){
        if(current.damage)benefits.push({label:'伤害',current:current.damage,next:next.damage,unit:''});
        if(current.produceValue)benefits.push({label:'每次产出',current:current.produceValue,next:next.produceValue,unit:'阳光'});
        if(current.heal)benefits.push({label:'每次治疗',current:current.heal,next:next.heal,unit:'生命'});
        if(current.shieldRatio)benefits.push({label:'生命护盾比例',current:Math.round(current.shieldRatio*100),next:Math.round(next.shieldRatio*100),unit:'%'});
        if(current.moveFactor)benefits.push({label:'移动减速',current:Math.round((1-current.moveFactor)*100),next:Math.round((1-next.moveFactor)*100),unit:'%'});
        if(current.damageBonus)benefits.push({label:'上层增伤',current:Math.round(current.damageBonus*100),next:Math.round(next.damageBonus*100),unit:'%'});
        if(current.attackRate)benefits.push({label:'攻击加速',current:Math.round((current.attackRate-1)*100),next:Math.round((next.attackRate-1)*100),unit:'%'});
        benefits.push({label:'生命上限',current:current.hp,next:next.hp,unit:''});
      }
      const perks=known?PLANT_PERKS[type].map(([name,description],index)=>({id:type+'-'+PLANT_PERK_LEVELS[index],level:PLANT_PERK_LEVELS[index],name,description,unlocked:enabled&&level>=PLANT_PERK_LEVELS[index]})):[];
      return {type,name:known?PLANTS[type].name:'未知伙伴',enabled,level,maxLevel:null,xp:valid?growth.xp:0,
        xpNeeded:enabled?plantXpNeeded(level):0,cost,maxed,canUpgrade:enabled&&!reason,reason,current,next,benefits,perks,nextUnlock:enabled?perks.find(perk=>!perk.unlocked)||null:null};
    }
    levelUpPlant(type, source, targetLevel) {
      if(!this.isEndless||!['playing','paused'].includes(this.status)||!Object.prototype.hasOwnProperty.call(PLANTS,type))return false;
      const growth=this.growth[type];
      if(!validPlantGrowth(growth))return false;
      const previousLevel=growth.level,nextLevel=targetLevel===undefined?previousLevel+1:targetLevel;
      if(!Number.isSafeInteger(nextLevel)||nextLevel<=previousLevel)return false;
      growth.level=nextLevel;
      const stats=this.combatPlantStats(type);
      for(const plant of this.plants.concat(this.supports)){
        if(plant.type!==type||plant.hp<=0)continue;
        const healthRatio=Math.max(0,Math.min(1,plant.hp/plant.maxHp));
        plant.maxHp=stats.hp;plant.hp=stats.hp*healthRatio;plant.level=growth.level;
        if(plant.wardRatio&&plant.wardMax>0){const ratio=plant.ward/plant.wardMax;plant.wardMax=plant.maxHp*plant.wardRatio;plant.ward=plant.wardMax*ratio;}
        this.effect('upgrade',plant.x,plant.row,1,{plantType:type,level:growth.level,entityId:plant.id});
      }
      this.syncGuardShields();
      // Bulk XP updates bodies once, while every crossed skill still notifies
      // the UI. One final event represents any remaining numerical levels.
      const milestones=PLANT_PERK_LEVELS.filter(level=>level>previousLevel&&level<=nextLevel);
      for(const level of milestones)this.events.push({type:'plantLevelUp',plantType:type,level,source,at:this.time});
      if(!milestones.includes(nextLevel))this.events.push({type:'plantLevelUp',plantType:type,level:nextLevel,source,at:this.time});
      return true;
    }
    awardPlantXp(type, amount, source) {
      if(!this.isEndless||(this.status!=='playing'&&!(source==='strategyReward'&&this.status==='paused'&&this.strategy&&this.strategy.pending))||!Object.prototype.hasOwnProperty.call(PLANTS,type)||!Number.isFinite(amount)||amount<=0)return false;
      const growth=this.growth[type];
      if(!validPlantGrowth(growth))return false;
      const total=growth.xp+amount,room=PLANT_LEVEL_PRECISION_LIMIT-growth.level;
      if(!Number.isFinite(total))return false;
      if(total+1e-9<plantXpNeeded(growth.level)){
        this.wavePlantTypes.add(type);growth.xp=total;return true;
      }
      const toPrecisionLimit=experienceToAdvance(growth.level,room);
      if(total>=toPrecisionLimit&&total-toPrecisionLimit>=plantXpNeeded(PLANT_LEVEL_PRECISION_LIMIT))return false;
      // At most 53 probes even for enormous valid awards. Preserve fractional
      // XP, and the original tiny tolerance around exact early thresholds.
      let low=0,high=Math.min(room,Math.floor((total+1e-9)/plantXpNeeded(growth.level)));
      while(low<high){
        const middle=low+Math.floor((high-low+1)/2);
        if(experienceToAdvance(growth.level,middle)<=total+1e-9)low=middle;
        else high=middle-1;
      }
      const remainder=Math.max(0,total-experienceToAdvance(growth.level,low));
      this.wavePlantTypes.add(type);
      growth.xp=remainder;
      if(low)this.levelUpPlant(type,'xp',growth.level+low);
      return true;
    }
    upgradePlant(type) {
      const info=this.getPlantUpgrade(type);
      if(!info.canUpgrade)return {ok:false,reason:info.reason};
      if(!this.levelUpPlant(type,'sun'))return {ok:false,reason:'等级超出安全数值范围'};
      this.sun-=info.cost;
      return {ok:true,level:this.growth[type].level,cost:info.cost};
    }
    canPlace(type, row, col) {
      if (this.status !== 'playing') return {ok:false, reason:'先和伙伴们出发讨伐吧'};
      if (!Object.prototype.hasOwnProperty.call(PLANTS,type) || !this.cellValid(row, col)) return {ok:false, reason:'请选择场地上的空格'};
      const terrain=this.getTerrain(row,col),spec=PLANTS[type],support=this.getSupport(row,col);
      if(spec.support){
        if(terrain.kind!=='water')return {ok:false,reason:'荷叶只能种在水面上'};
        if(support)return {ok:false,reason:'这里已经有荷叶啦'};
      }else{
        if(!terrain.plantable&&!(terrain.kind==='water'&&support))return {ok:false,reason:terrain.reason};
        if(this.plants.some(p=>p.hp>0&&p.row===row&&p.col===col))return {ok:false,reason:'这里已经有伙伴啦'};
      }
      if (this.cooldowns[type] > 0.001) return {ok:false, reason:'伙伴还在休息，稍等一下'};
      if (this.sun < spec.cost) return {ok:false, reason:'阳光不够啦，点一点金色阳光'};
      return {ok:true};
    }
    place(type, row, col) {
      const result=this.canPlace(type,row,col);
      if (!result.ok) return result;
      const spec = this.combatPlantStats(type);
      this.sun -= spec.cost;
      this.cooldowns[type] = spec.cooldown;
      const plant = {id:this.nextId++, type, row, col, x:col + .5, y:row + .5, hp:spec.hp, maxHp:spec.hp, age:0, attackTimer:.3, produceTimer:8, supportTimer:spec.supportInterval||0, armed:false, hitTimer:0, hurtCooldown:0, targeting:false};
      if(this.isEndless){plant.level=this.growth[type].level;this.wavePlantTypes.add(type);}
      if(spec.support)Object.assign(plant,{support:true,shield:spec.shield||0,maxShield:spec.shield||0,shieldHitTimer:0,shieldBreakAt:-1});
      this.initAnimation(plant,spec.fuse?'fuse':'idle');
      (spec.support?this.supports:this.plants).push(plant);actorTopologyChanged(this);
      this.syncGuardShields();
      this.effect('plant', plant.x, row, .6);
      this.events.push({type:'plant', plantType:type, row, col, id:plant.id, entityId:plant.id, at:this.time});
      return {ok:true, plant};
    }
    shovel(row, col) {
      if (this.status !== 'playing') return {ok:false, reason:'暂停时不能铲除伙伴'};
      const upper=this.plants.some(p=>p.hp>0&&p.row===row&&p.col===col);
      const layer=upper?this.plants:this.supports;
      const index = layer.findIndex(p => p.hp>0&&p.row === row && p.col === col);
      if (index < 0) return {ok:false, reason:'这里没有伙伴'};
      const [plant] = layer.splice(index, 1);actorTopologyChanged(this);
      this.syncGuardShields();
      this.effect('shovel', plant.x, row, .5);
      this.events.push({type:'shovel', row, col});
      return {ok:true};
    }
    cleanupSupports() {
      if(this.supports.some(support=>support.hp<=0)){this.supports=this.supports.filter(support=>support.hp>0);actorTopologyChanged(this);}
      // Closed ordinary actor coordinates are already certified for this step.
      // Acquire the current map/table after the original dead-leaf filter; HP,
      // wards and first-live source order are still read for every plant.
      const index=activeActorAuthority(this)&&this.activeSupportIndex();
      if(index&&!index.outsidePlants.length){
        const tiles=this.getMap().tiles;
        for(const plant of this.plants){
          if(plant.wardSourceId){
            const source=index.supportsById.get(plant.wardSourceId);
            if(!source||!(source.hp>0)||source.row!==plant.row||source.col!==plant.col)plant.ward=0;
          }
          if(plant.hp>0&&TERRAIN_TILES[tiles[plant.row][plant.col]].kind==='water'){
            let supported=false;
            for(const support of index.supportCells[plant.row*index.cols+plant.col])if(support.hp>0){supported=true;break;}
            if(!supported){
              plant.hp=0;this.effect('shovel',plant.x,plant.row,.6);
              this.events.push({type:'plantLost',plantType:plant.type,row:plant.row,col:plant.col,reason:'supportLost'});
            }
          }
        }
        return;
      }
      // A water plant cannot continue shooting or survive a missing raft.
      for(const plant of this.plants){
        if(plant.wardSourceId&&!this.supportSourceAt(plant.wardSourceId,plant.row,plant.col))plant.ward=0;
        if(plant.hp>0&&this.getTerrain(plant.row,plant.col).kind==='water'&&!this.getSupport(plant.row,plant.col)){
          plant.hp=0;this.effect('shovel',plant.x,plant.row,.6);
          this.events.push({type:'plantLost',plantType:plant.type,row:plant.row,col:plant.col,reason:'supportLost'});
        }
      }
    }
    collectSun(id) {
      if (this.status !== 'playing') return {ok:false};
      const index = this.suns.findIndex(sun => sun.id === id);
      if (index < 0) return {ok:false};
      const [sun] = this.suns.splice(index, 1);
      this.sun += sun.value;
      this.events.push({type:'sun', value:sun.value, x:sun.x, y:sun.y});
      return {ok:true, value:sun.value};
    }
    addSun(x, y, source = 'sky', value = 25) {
      // Sky coordinates name the landing spot; sunflower coordinates name
      // the flower head. Position is authoritative for drawing AND picking.
      const fromFlower = source === 'sunflower';
      const startX = x, startY = fromFlower ? y : -1.1;
      const targetX = fromFlower ? Math.min(this.getBoard().cols-.35, x + .3) : x;
      const targetY = fromFlower ? Math.min(this.getBoard().rows-.3, y + .4) : y;
      const motionDuration = fromFlower ? .95 : Math.max(.01, (targetY - startY) / .65);
      const sun = {id:this.nextId++, x:startX, y:startY, startX, startY, targetX, targetY,
        motionDuration, landed:false, scale:fromFlower ? .35 : 1,
        value:Number.isFinite(value)&&value>0?value:25, age:0, duration:motionDuration + 14, source};
      this.suns.push(sun);
      this.events.push({type:'sunSpawn', source, x:sun.x, y:sun.y, targetX, targetY});
      return sun;
    }
    updateSun(sun, dt) {
      sun.age += dt;
      const t = Math.min(1, sun.age / sun.motionDuration);
      sun.x = sun.startX + (sun.targetX - sun.startX) * t;
      sun.y = sun.startY + (sun.targetY - sun.startY) * t;
      if (sun.source === 'sunflower') {
        // A shallow arc also keeps first-row drops below the seed bank.
        sun.y -= 4 * .32 * t * (1 - t);
        sun.scale = Math.min(1, .35 + .65 * sun.age / .18);
      }
      sun.landed = t === 1;
    }
    effect(type, x, row, duration, extra = {}) {
      this.effects.push({type, x, row, y:row + .5, age:0, duration, ...extra});
    }
    spawn(spec) {
      if(!spec||!this.cellValid(spec.row,0)||!Object.prototype.hasOwnProperty.call(ENEMIES,spec.type))return null;
      if(this.isEndless&&this.enemies.filter(enemy=>enemy.hp>0).length>=this.endlessWave.maxAlive)return null;
      const base = ENEMIES[spec.type];
      const scaling=this.isEndless?this.endlessWave:this.level;
      const hp = base.hp * scaling.hpScale;
      const enemy = {id:this.nextId++, type:spec.type, row:spec.row, wave:spec.wave||this.wave,x:this.getBoard().cols+.55, y:spec.row + .5, hp, maxHp:hp,
        speed:base.speed * scaling.speedScale,damageScale:scaling.damageScale||1,age:0, eating:false, slowTimer:0, frostTimer:0, enraged:false, hitTimer:0};
      if(base.armor)Object.assign(enemy,{armor:base.armor*scaling.hpScale,maxArmor:base.armor*scaling.hpScale});
      if(spec.type==='healer')enemy.nextHealAt=this.time+5;
      this.initAnimation(enemy,'walk');
      this.enemies.push(enemy);
      this.events.push({type:'enemy', enemyType:enemy.type, row:enemy.row});
      return enemy;
    }
    perkPulse(kind, plant, radius=.7) {
      this.effect('perkPulse',plant.x,plant.row,.65,{kind,radius,plantType:plant.type||plant.sourceType,entityId:plant.id});
    }
    refreshEnemyIndex() {
      let index=battleIndexes.get(this);
      const rows=this.getBoard().rows;
      if(!index||index.rows.length!==rows){index={rows:Array.from({length:rows},()=>[]),dirty:Array(rows).fill(false),active:false};battleIndexes.set(this,index);}
      for(const row of index.rows)row.length=0;
      for(const enemy of this.enemies)if(enemy.hp>0)index.rows[enemy.row].push(enemy);
      for(let row=0;row<rows;row++){index.rows[row].sort((a,b)=>a.x-b.x||a.id-b.id);index.dirty[row]=false;}
      index.active=true;index.count=this.enemies.length;
      return index;
    }
    enemiesInRow(row) {
      if(!Number.isInteger(row)||row<0||row>=this.getBoard().rows)return [];
      const index=battleIndexes.get(this);
      // Public commands/tests may move actors between ticks. Only reuse the
      // derived index inside a simulation tick; it never enters a save file.
      if(!index||!index.active||index.count!==this.enemies.length)return this.enemies.filter(e=>e.hp>0&&e.row===row).sort((a,b)=>a.x-b.x||a.id-b.id);
      if(index.dirty[row]){index.rows[row].sort((a,b)=>a.x-b.x||a.id-b.id);index.dirty[row]=false;}
      return index.rows[row];
    }
    rowTargets(row, minimum, maximum, hitIds=null) {
      const enemies=this.enemiesInRow(row),result=[];
      let lo=0,hi=enemies.length;
      while(lo<hi){const middle=(lo+hi)>>>1;if(enemies[middle].x<minimum)lo=middle+1;else hi=middle;}
      for(let i=lo;i<enemies.length&&enemies[i].x<=maximum;i++){
        const enemy=enemies[i];if(enemy.hp>0&&(!hitIds||!hitIds.includes(enemy.id)))result.push(enemy);
      }
      return result;
    }
    hasAttackTarget(plant) {
      const spec=this.combatPlantStats(plant.type),reach=plant.type==='starfruit'?(spec.mechanics||{}).starRows||1:0;
      for(let row=Math.max(0,plant.row-reach);row<=Math.min(this.getBoard().rows-1,plant.row+reach);row++){
        for(const enemy of this.enemiesInRow(row)){
          if(!spec.unlimitedRange&&enemy.x>plant.x+spec.range)break;
          if(enemy.hp>0&&enemy.x>=plant.x-.1)return true;
        }
      }
      return false;
    }
    nearestEnemy(x,row,radius,rows=0,excluded=null) {
      let best=null,distance=Infinity;
      for(let lane=Math.max(0,row-rows);lane<=Math.min(this.getBoard().rows-1,row+rows);lane++)for(const enemy of this.enemiesInRow(lane)){
        const dx=Math.abs(enemy.x-x);
        if(enemy.hp<=0||dx>radius||excluded&&excluded.has(enemy.id))continue;
        const score=dx;
        if(score<distance||score===distance&&enemy.id<best.id){best=enemy;distance=score;}
      }
      return best;
    }
    tickEnemyAbilities() {
      // Source-limited aura pass. Ordinary enemies do not scan the whole crowd.
      for(const enemy of this.enemies)enemy.drumRate=1;
      for(const source of this.enemies){
        if(source.hp<=0||(source.frozenUntil||0)>this.time||(source.stunnedUntil||0)>this.time)continue;
        if(source.type==='drummer'){
          for(let row=Math.max(0,source.row-1);row<=Math.min(this.getBoard().rows-1,source.row+1);row++)for(const other of this.enemiesInRow(row)){
            if(other.id!==source.id&&other.hp>0&&Math.abs(other.x-source.x)<=1.6)other.drumRate=1.2;
          }
        }else if(source.type==='healer'&&this.time>=(source.nextHealAt||0)){
          source.nextHealAt=this.time+5;
          for(let row=Math.max(0,source.row-1);row<=Math.min(this.getBoard().rows-1,source.row+1);row++)for(const other of this.enemiesInRow(row)){
            if(other.id!==source.id&&other.hp>0&&other.hp<other.maxHp&&Math.abs(other.x-source.x)<=1.5){
              other.hp=Math.min(other.maxHp,other.hp+other.maxHp*.08);this.perkPulse('heal',other,.5);
            }
          }
          this.perkPulse('heal',source,1.5);
        }
      }
    }
    nearbyPlants(plant) {
      return this.localPlants(plant.row,plant.col).concat(this.localPlants(plant.row,plant.col,true)).filter(other=>other.hp>0&&other.id!==plant.id&&Math.abs(other.row-plant.row)<=1&&Math.abs(other.col-plant.col)<=1);
    }
    healPlant(plant, amount, sourceType) {
      if(!plant||plant.hp<=0)return 0;
      const restored=Math.min(amount,Math.max(0,plant.maxHp-plant.hp));
      plant.hp+=restored;this.awardPlantXp(sourceType,restored/40);return restored;
    }
    syncGuardShields() {
      for(const leaf of this.supports){
        if(leaf.type!=='guardlily'||leaf.hp<=0)continue;
        const upper=this.getPlantAt(leaf.row,leaf.col);
        const maximum=(upper?upper.maxHp:leaf.maxHp)*this.combatPlantStats(leaf.type).shieldRatio;
        if(leaf.maxShield!==maximum){const left=leaf.maxShield>0?Math.max(0,Math.min(1,leaf.shield/leaf.maxShield)):0;leaf.maxShield=maximum;leaf.shield=maximum*left;}
      }
    }
    grantPercentWard(plant, ratio, duration, sourceType, sourceId=null) {
      if(!plant||!ratio)return;
      const amount=plant.maxHp*ratio;
      this.grantWard(plant,amount,duration,sourceType,sourceId);
      if(plant.ward===amount)plant.wardRatio=ratio;
    }
    grantWard(plant, amount, duration, sourceType, sourceId=null) {
      if(!plant||plant.hp<=0||amount<=0)return;
      if((plant.wardUntil||0)<=this.time)plant.ward=0;
      // Wards share one pool. A smaller ward refreshes, never adds to it.
      if(amount>=(plant.ward||0)){
        plant.ward=amount;plant.wardMax=amount;delete plant.wardRatio;plant.wardGrantedAt=this.time;
        plant.wardHitAt=-1;plant.wardBreakAt=-1;
        plant.wardSourceType=sourceType;plant.wardSourceId=sourceId;
      }
      plant.wardUntil=Math.max(plant.wardUntil||0,this.time+duration);
    }
    freezeEnemy(enemy, duration) {
      if(enemy.hp<=0||(enemy.freezeImmuneUntil||0)>this.time)return false;
      const actual=duration*(enemy.type==='boss'?.35:1);
      enemy.frozenUntil=this.time+actual;enemy.freezeImmuneUntil=enemy.frozenUntil+4;
      this.perkPulse('freeze',enemy,.6);return true;
    }
    knockbackEnemy(enemy, amount) {
      if(enemy.hp<=0)return;
      const oldX=enemy.x;
      enemy.x=Math.min(this.getBoard().cols+.7,enemy.x+amount*(enemy.type==='boss'?.3:1));
      if(combatFeedback)combatFeedback.noteKnockback(enemy,oldX,this.time);
      const index=battleIndexes.get(this);if(index)index.dirty[enemy.row]=true;
      enemy.eating=false;enemy.blockerId=null;
      // Capture the outgoing bite before changing the displayed action. A
      // frozen actor keeps that pose until thaw; repeated pushes during a walk
      // must not restart its gait or its transition.
      if((enemy.frozenUntil||0)<=this.time&&(enemy.stunnedUntil||0)<=this.time&&
        (enemy.animationState==='eat'||enemy.animationState==='attack')){
        this.animationState(enemy,'walk');
      }
      this.perkPulse('knockback',enemy,.6);
    }
    poisonEnemy(enemy, damage, sourceType, mechanics={}) {
      if(enemy.hp<=0)return;
      if(!enemy.dotStatuses)enemy.dotStatuses={};
      const prior=enemy.dotStatuses.poison;
      const strongest=prior&&prior.until>this.time?Math.max(prior.damage,damage):damage;
      enemy.dotStatuses.poison={damage:strongest,until:this.time+3,sourceType,moveFactor:Math.min(prior&&prior.until>this.time?prior.moveFactor||1:1,mechanics.poisonSlow||1),spread:!!mechanics.poisonSpread||!!(prior&&prior.until>this.time&&prior.spread)};
      enemy.poisonTimer=3;this.perkPulse('poison',enemy,.4);
    }
    addPerkField(kind,x,row,radius,duration,damage,sourceType,extra={}) {
      // Repeated clouds over one small area refresh a shared footprint.
      const prior=this.perkFields.find(field=>field.kind===kind&&field.row===row&&Math.abs(field.x-x)<1e-6&&field.sourceType===sourceType&&field.radius===radius&&field.rows===(extra.rows||0)&&(field.moveFactor||1)===(extra.moveFactor||1)&&!!field.weaken===!!extra.weaken);
      if(prior){
        const managed=authoritativeFields.get(this);
        if(!managed||!managed.ordinary||managed.fields!==this.perkFields||managed.length!==this.perkFields.length){
          prior.age=0;prior.duration=Math.max(prior.duration,duration);prior.damage=Math.max(prior.damage,damage);prior.rows=Math.max(prior.rows,extra.rows||0);prior.radius=Math.max(prior.radius,radius);if(extra.weaken)prior.weaken=true;
          authorityFieldMutation(this,prior,true,false);return prior;
        }
        const active=!(prior.age>=prior.duration),oldDamage=prior.damage,oldRows=prior.rows,oldRadius=prior.radius,oldWeaken=prior.weaken;
        prior.age=0;prior.duration=Math.max(prior.duration,duration);prior.damage=Math.max(prior.damage,damage);prior.rows=Math.max(prior.rows,extra.rows||0);prior.radius=Math.max(prior.radius,radius);if(extra.weaken)prior.weaken=true;
        authorityFieldMutation(this,prior,active!==!(prior.age>=prior.duration)||oldDamage!==prior.damage||oldRows!==prior.rows||oldRadius!==prior.radius||oldWeaken!==prior.weaken,false);
        return prior;
      }
      const field={id:this.nextId++,kind,x,row,radius,rows:0,age:0,duration,damage,sourceType,...extra};
      this.perkFields.push(field);
      authorityFieldMutation(this,field,true,true);
      this.effect('perkField',x,row,duration,{kind,radius,rows:field.rows,fieldId:field.id,plantType:sourceType});
      return field;
    }
    tickPerkEffects(dt) {
      if(!this.isEndless)return;
      for(const action of this.perkActions){
        if(action.at>this.time+1e-9)continue;
        if(action.kind==='supportFollowup'){
          action.done=true;
          const upper=this.getPlantById(action.entityId),source=this.getSupportById(action.sourceId);
          if(upper&&source&&source.row===upper.row&&source.col===upper.col&&this.hasAttackTarget(upper))this.fireProjectile(upper,99);
          continue;
        }
        action.done=true;this.perkPulse('aftershock',action,action.radius);
        for(const enemy of this.enemies)if(enemy.hp>0&&Math.abs(enemy.row-action.row)<=(action.rows===undefined?1:action.rows)&&Math.abs(enemy.x-action.x)<=action.radius)this.hurt(enemy,action.damage,0,.58,action.sourceType,action.sourceType);
        if(action.scorch)this.addPerkField('burn',action.x,action.row,action.radius,4,35,action.sourceType,{rows:1});
      }
      this.perkActions=this.perkActions.filter(action=>!action.done);
      // Preserve field insertion order (including equal-strength ties) while
      // testing each visitor only against fields that can reach its lane.
      const rows=this.getBoard().rows;
      let workspace=perkWorkspaces.get(this);
      if(!workspace||workspace.rows!==rows){workspace={rows,fieldsByRow:Array.from({length:rows},()=>[]),strongest:[null,null,null],order:[],topology:[],generation:0,matches:new WeakMap(),fieldRecords:new WeakMap(),priorFields:[],deltas:[],deltaValid:false,ordinaryKinds:true};perkWorkspaces.set(this,workspace);}
      const {fieldsByRow,strongest,order}=workspace;
      const authority=authorityFieldState(this);
      if(authority&&(!Number.isFinite(dt)||dt<0)){authority.ordinary=false;authority.workspace=null;}
      const trusted=authority&&authority.ordinary?authority:null;
      let incremental=!!(trusted&&trusted.workspace===workspace&&workspace.authorityGeneration===trusted.generation);
      let sameFields=trusted?incremental:!workspace.authorityRowsUsed&&workspace.topology.length===this.perkFields.length*10;
      for(let i=0;!trusted&&sameFields&&i<this.perkFields.length;i++){
        const field=this.perkFields[i],at=i*10,prior=workspace.topology;
        sameFields=prior[at]===field&&prior[at+1]===field.kind&&prior[at+2]===field.x&&prior[at+3]===field.row&&prior[at+4]===field.radius&&prior[at+5]===field.rows&&prior[at+6]===field.damage&&prior[at+7]===field.moveFactor&&prior[at+8]===field.weaken&&prior[at+9]===!(field.age>=field.duration);
      }
      if(!sameFields){
        // A first/replaced/unsafe input or changed board builds the original
        // full topology. Row-local generations cannot alias the old global
        // generation, so discard their matches before leaving/rebinding.
        if(workspace.authorityRowsUsed){workspace.matches=new WeakMap();workspace.fieldRecords=new WeakMap();workspace.priorFields.length=0;workspace.priorUnique=false;}
        workspace.authorityRowsUsed=false;workspace.authorityBuckets=null;
        workspace.authorityGeneration=trusted?trusted.generation:undefined;
        refreshFieldDeltas(workspace,this.perkFields);
        workspace.generation++;workspace.topology.length=0;workspace.ordinaryKinds=true;
        for(const fields of fieldsByRow)fields.length=0;
        for(const field of this.perkFields){
          const active=!(field.age>=field.duration);
          workspace.topology.push(field,field.kind,field.x,field.row,field.radius,field.rows,field.damage,field.moveFactor,field.weaken,active);
          if(!active)continue;
          if(field.kind!=='burn'&&field.kind!=='slow'&&field.kind!=='spore')workspace.ordinaryKinds=false;
          for(let row=Math.max(0,Math.ceil(field.row-field.rows));row<=Math.min(rows-1,Math.floor(field.row+field.rows));row++)fieldsByRow[row].push(field);
        }
        if(trusted){
          workspace.authorityRows=Array.from({length:rows},()=>({generation:workspace.generation,changed:[],pending:false}));
          workspace.authorityBuckets=buildAuthorityBuckets(workspace);
          workspace.authorityRowsUsed=true;trusted.workspace=workspace;incremental=true;
          // The full-build records are unused while lanes own the geometry.
          // Release their strong field references rather than retaining the
          // initial snapshot throughout a long authoritative run.
          workspace.topology.length=0;workspace.priorFields.length=0;
        }
      }
      for(const enemy of this.enemies){
        if(enemy.hp<=0)continue;
        enemy.perkMoveFactor=1;
        if(workspace.ordinaryKinds){
          const geometry=incremental?workspace.authorityRows[enemy.row]:workspace;
          // Three real field kinds need no per-enemy object/values allocation.
          // Keep first-kind encounter order and first-source equal-damage ties.
          let match=workspace.matches.get(enemy);
          if(match&&match.generation!==geometry.generation&&match.row===enemy.row&&(match.x===enemy.x||enemy.x>match.left&&enemy.x<match.right)){
            if(incremental)reuseAuthorityRowMatch(geometry,match,enemy);else reuseChangedFieldMatch(workspace,match,enemy);
          }
          if(!match||match.generation!==geometry.generation||match.row!==enemy.row||!(match.x===enemy.x||enemy.x>match.left&&enemy.x<match.right)){
            if(!match){match={fields:[]};workspace.matches.set(enemy,match);}
            strongest[0]=strongest[1]=strongest[2]=null;order.length=0;
            const candidateBin=incremental&&workspace.authorityBuckets&&Number.isFinite(enemy.x)?Math.floor(enemy.x):null;
            const bin=candidateBin!==null&&Number.isSafeInteger(candidateBin)&&Math.abs(candidateBin)<4503599627370496?candidateBin:null;
            const candidates=bin===null?fieldsByRow[enemy.row]:workspace.authorityBuckets[enemy.row].get(bin)||emptyAuthorityBucket;
            const binMargin=bin===null?0:Number.EPSILON*8*Math.max(1,Math.abs(bin),Math.abs(bin+1));
            let moveFactor=1,weaken=false,left=bin===null?-Infinity:bin+binMargin,right=bin===null?Infinity:bin+1-binMargin;
            for(const field of candidates){
              const outside=Math.abs(enemy.x-field.x)>field.radius;
              // Staying strictly inside this conservative interval cannot
              // cross any field edge. Shrink by several ULPs so subtraction
              // rounding at inclusive radius boundaries always rescans using
              // the original Math.abs comparison (never an epsilon hit test).
              const edge=incremental?authorityFieldEdges(field):null;
              if(edge){
                if(!outside){left=Math.max(left,edge.innerLeft);right=Math.min(right,edge.innerRight);}
                else if(enemy.x<field.x)right=Math.min(right,edge.outerLeft);
                else left=Math.max(left,edge.outerRight);
              }else if(Number.isFinite(field.x)&&Number.isFinite(field.radius)&&field.radius>=0){
                const margin=Number.EPSILON*8*Math.max(1,Math.abs(field.x),field.radius),lower=field.x-field.radius,upper=field.x+field.radius;
                if(!outside){left=Math.max(left,lower+margin);right=Math.min(right,upper-margin);}
                else if(enemy.x<field.x)right=Math.min(right,lower-margin);
                else left=Math.max(left,upper+margin);
              }else{left=enemy.x;right=enemy.x;}
              if(outside)continue;
              if(field.moveFactor)moveFactor=Math.min(moveFactor,field.moveFactor);
              if(field.weaken)weaken=true;
              const slot=edge?edge.slot:field.kind==='burn'?0:field.kind==='slow'?1:2,current=strongest[slot];
              if(!current){order.push(slot);strongest[slot]=field;}else if(field.damage>current.damage)strongest[slot]=field;
            }
            match.generation=geometry.generation;match.x=enemy.x;match.row=enemy.row;match.left=left;match.right=right;match.moveFactor=moveFactor;match.weaken=weaken;match.fields.length=0;
            for(const slot of order)match.fields.push(strongest[slot]);
          }
          // Reuse geometry only. Every 10 ms still applies live field damage,
          // fractional remaining duration, weakening, XP, flashes and poison.
          enemy.perkMoveFactor=match.moveFactor;if(match.weaken)enemy.weakenedUntil=this.time+.02;
          for(const field of match.fields)if(field.damage)this.hurt(enemy,field.damage*Math.min(dt,field.duration-field.age),0,.58,field.kind==='burn'?'jalapeno':null,field.sourceType,true);
        }else{
          // Public callers can add unusual kinds; retain the original ordinary
          // object semantics and key enumeration order for those inputs.
          const byKind={};
          for(const field of fieldsByRow[enemy.row]){
            if(Math.abs(enemy.x-field.x)>field.radius)continue;
            if(field.moveFactor)enemy.perkMoveFactor=Math.min(enemy.perkMoveFactor,field.moveFactor);
            if(field.weaken)enemy.weakenedUntil=this.time+.02;
            const current=byKind[field.kind];if(!current||field.damage>current.damage)byKind[field.kind]=field;
          }
          for(const field of Object.values(byKind))if(field.damage)this.hurt(enemy,field.damage*Math.min(dt,field.duration-field.age),0,.58,field.kind==='burn'?'jalapeno':null,field.sourceType,true);
        }
        const poison=enemy.dotStatuses&&enemy.dotStatuses.poison;
        if(poison&&poison.until>this.time)enemy.perkMoveFactor=Math.min(enemy.perkMoveFactor,poison.moveFactor||1);
        enemy.poisonTimer=poison?Math.max(0,poison.until-this.time):0;
        if(poison&&poison.until>this.time-dt)this.hurt(enemy,poison.damage*Math.min(dt,Math.max(0,poison.until-(this.time-dt))),0,.58,null,poison.sourceType,true);
        if(poison&&poison.until<=this.time)delete enemy.dotStatuses.poison;
      }
      if(incremental)for(const lane of workspace.authorityRows)lane.pending=false;
      const tracked=authoritativeFields.get(this);
      // Trusted records start active and finite. With a nonnegative finite dt,
      // every active->inactive transition fails the original filter below, so
      // removal alone invalidates the topology. Keep the exact age arithmetic.
      for(const field of this.perkFields)field.age+=dt;
      const priorFieldLength=this.perkFields.length;
      const managedRemoval=tracked&&tracked.ordinary&&tracked.fields===this.perkFields&&tracked.length===priorFieldLength&&tracked.workspace===workspace&&workspace.authorityGeneration===tracked.generation;
      this.perkFields=this.perkFields.filter(field=>{
        const keep=field.age<field.duration-1e-9;
        if(!keep&&managedRemoval)mutateAuthorityRows(workspace,field,-1);
        return keep;
      });
      if(tracked){
        if(this.perkFields.length!==priorFieldLength)tracked.generation++;
        if(managedRemoval)workspace.authorityGeneration=tracked.generation;
        tracked.fields=this.perkFields;tracked.length=this.perkFields.length;
      }
    }
    tickPlantPerks(plant, dt) {
      if(!this.isEndless||plant.hp<=0)return;
      const type=plant.type;
      // Preserve the original invalid public-type error before any mutation.
      if(!Object.prototype.hasOwnProperty.call(PLANTS,type))this.combatPlantStats(type).mechanics;
      if((plant.wardUntil||0)<=this.time||(plant.wardSourceId&&!this.supportSourceAt(plant.wardSourceId,plant.row,plant.col)))plant.ward=0;
      if(type==='wallnut'){
        const m=this.combatPlantStats(type).mechanics;
        const quietFor=this.time-(plant.lastDamagedAt===undefined?this.time-plant.age:plant.lastDamagedAt);
        if(m.regen&&quietFor>=5)this.healPlant(plant,m.regen*dt,type);
        if(m.clutchWard&&plant.hp<=plant.maxHp*.35&&this.time>=(plant.nextClutchWardAt||0)){
          plant.nextClutchWardAt=this.time+25;this.grantPercentWard(plant,m.clutchWard,6,type);this.perkPulse('ward',plant,.8);
        }
      }
      if(type==='shisa'){
        const m=this.combatPlantStats(type).mechanics;
        if(m.encourage)for(const other of this.nearbyPlants(plant))if(SHOOTERS.has(other.type))other.encouragedUntil=this.time+.05;
      }
      if(!plant.support||(type!=='lily'&&type!=='frostlily'&&type!=='guardlily'))return;
      const m=this.combatPlantStats(type).mechanics;
      const periodic=(key,interval)=>{
        if(plant[key]===undefined)plant[key]=this.time+interval;
        if(this.time+1e-9<plant[key])return false;
        plant[key]=this.time+interval;return true;
      };
      if(type==='lily'){
        const upper=this.getPlantAt(plant.row,plant.col);
        if(m.heal&&periodic('nextLilyHealAt',3)&&upper){
          const quietFor=this.time-(plant.lastDamagedAt===undefined?this.time-plant.age:plant.lastDamagedAt);
          const upperQuiet=this.time-(upper.lastDamagedAt===undefined?this.time-upper.age:upper.lastDamagedAt);
          if(quietFor>=4&&upperQuiet>=4&&this.healPlant(upper,m.heal,type)>0)this.perkPulse('heal',plant,.6);
        }
        if(m.ward&&periodic('nextLilyWardAt',10)&&upper){this.grantPercentWard(upper,m.ward,6,type);this.perkPulse('ward',plant,.6);}
        if(m.attackPulse&&periodic('nextLilyAttackAt',6)&&upper){upper.springBoostUntil=this.time+3;upper.springBoostSourceId=plant.id;this.perkPulse('cooldown',plant,.7);}
      }else if(type==='frostlily'){
        if(m.freeze&&periodic('nextFrostPulseAt',8)){
          for(const enemy of this.enemies)if(enemy.row===plant.row&&Math.floor(enemy.x)>=plant.col&&Math.floor(enemy.x)<=plant.col+1)this.freezeEnemy(enemy,m.freeze);
          this.perkPulse('freeze',plant,1.2);
          if(m.iceLane)this.addPerkField('slow',plant.x+1.5,plant.row,1.5,4,0,type,{moveFactor:.65});
        }
      }else if(type==='guardlily'){
        const quietFor=this.time-(plant.lastDamagedAt===undefined?this.time-plant.age:plant.lastDamagedAt);
        if(m.regen&&quietFor>=8&&plant.shield<plant.maxShield*.35)plant.shield=Math.min(plant.maxShield*.35,plant.shield+plant.maxShield*m.regen*dt);
        if(m.shareWard&&periodic('nextSharedWardAt',10)){
          const upper=this.getPlantAt(plant.row,plant.col);
          for(const other of this.nearbyPlants(plant).concat(upper?[upper]:[]))this.grantPercentWard(other,m.shareWard,5,type);
          this.perkPulse('ward',plant,1.2);
        }
        if(m.emergencyRepair&&plant.shield<plant.maxShield*.2&&this.time>=(plant.nextEmergencyRepairAt||0)){
          plant.shield=plant.maxShield*.35;plant.nextEmergencyRepairAt=this.time+30;this.perkPulse('heal',plant,.8);
        }
      }
    }
    supportAttack(plant) {
      const result={powerSource:null,powerBonus:0,hasteSource:null,attackRate:1};
      if(!plant||plant.hp<=0||!SHOOTERS.has(plant.type))return result;
      for(const leaf of this.localPlants(plant.row,plant.col,true)){
        if(leaf.hp<=0||(leaf.type!=='powerlily'&&leaf.type!=='hastelily'))continue;
        const same=leaf.row===plant.row&&leaf.col===plant.col,near=Math.abs(leaf.row-plant.row)<=1&&Math.abs(leaf.col-plant.col)<=1;
        if(!same&&!near)continue;
        if(leaf.type==='powerlily'){
          const spec=this.combatPlantStats(leaf.type),m=spec.mechanics||{};
          const bonus=same?spec.damageBonus:m.neighborAura&&near?spec.damageBonus*.5:0;
          if(bonus>result.powerBonus){result.powerBonus=bonus;result.powerSource=leaf;}
        }
        if(leaf.type==='hastelily'){
          const spec=this.combatPlantStats(leaf.type);
          const rate=same?Math.min(spec.burstAttackRateCap,spec.attackRate+((leaf.hasteBurstUntil||0)>this.time?.15:0)):near&&(leaf.teamHasteUntil||0)>this.time?1.12:1;
          if(rate>result.attackRate){result.attackRate=rate;result.hasteSource=leaf;}
        }
      }
      plant.supportDamageBonus=result.powerBonus;plant.supportAttackRate=result.attackRate;
      plant.supportPowerSourceId=result.powerSource?result.powerSource.id:null;plant.supportHasteSourceId=result.hasteSource?result.hasteSource.id:null;
      return result;
    }
    prepareSupportAttack(plant, burstIndex, support) {
      const result={entityId:plant.id,powerBonus:support.powerBonus,hasteRate:support.attackRate,
        powerSourceId:support.powerSource?support.powerSource.id:null,hasteSourceId:support.hasteSource?support.hasteSource.id:null};
      const leaf=this.getSupport(plant.row,plant.col);
      if(!leaf||!this.isEndless||burstIndex===99)return result;
      const m=this.combatPlantStats(leaf.type).mechanics||{};
      if(leaf.type==='powerlily'){
        result.killHeal=m.killHeal||0;result.powerSkillSourceId=leaf.id;
        if(burstIndex===0){
          if(plant.powerCounterSourceId!==leaf.id){plant.powerCounterSourceId=leaf.id;plant.powerAttackCount=0;}
          const count=plant.powerAttackCount=(plant.powerAttackCount||0)+1;
          result.powerSplash=!!m.splashEvery&&count%m.splashEvery===0;
          result.powerStun=!!m.stunEvery&&count%m.stunEvery===0;
        }
      }else if(leaf.type==='hastelily'&&burstIndex===0){
        result.hasteSkillSourceId=leaf.id;
        if(plant.hasteCounterSourceId!==leaf.id){plant.hasteCounterSourceId=leaf.id;plant.hasteAttackCount=0;}
        const count=plant.hasteAttackCount=(plant.hasteAttackCount||0)+1;
        result.hasteWard=!!m.wardEvery&&count%m.wardEvery===0;
        if(m.followEvery&&count%m.followEvery===0)this.perkActions.push({kind:'supportFollowup',at:this.time+.18,entityId:plant.id,sourceId:leaf.id});
        if(m.teamEvery&&count%m.teamEvery===0){leaf.teamHasteUntil=this.time+3;const aura=attackAuraWorkspaces.get(this);if(aura)aura.checkedTick=-1;this.perkPulse('cooldown',leaf,1.2);}
        if(m.burstEvery&&count%m.burstEvery===0){leaf.hasteBurstUntil=this.time+3;const aura=attackAuraWorkspaces.get(this);if(aura)aura.checkedTick=-1;this.perkPulse('cooldown',leaf,.8);}
      }
      return result;
    }
    liveSupportCredit(attack) {
      if(!attack)return null;
      const upper=this.getPlantById(attack.entityId);
      const active=id=>{const source=this.getSupportById(id);return upper&&source&&Math.abs(source.row-upper.row)<=1&&Math.abs(source.col-upper.col)<=1;};
      return {...attack,powerBonus:active(attack.powerSourceId)?attack.powerBonus:0,hasteRate:active(attack.hasteSourceId)?attack.hasteRate:1};
    }
    supportHit(attack, target, damage) {
      if(!attack||!this.isEndless)return;
      const upper=this.getPlantById(attack.entityId);
      if(!upper)return;
      const sourceAt=id=>this.supportSourceAt(id,upper.row,upper.col);
      const power=sourceAt(attack.powerSkillSourceId);
      if(power&&attack.powerSplash&&!attack.powerSplashSpent){
        attack.powerSplashSpent=true;
        for(const enemy of this.enemies)if(enemy.hp>0&&enemy.id!==target.id&&Math.abs(enemy.row-target.row)<=1&&Math.abs(enemy.x-target.x)<=1)this.hurt(enemy,damage*.2,0,.58,null,'powerlily');
        this.perkPulse('splash',target,1);
      }
      if(power&&attack.powerStun&&target.hp>0&&this.time>=(target.nextPowerStunAt||0)){
        target.nextPowerStunAt=this.time+5;target.stunnedUntil=Math.max(target.stunnedUntil||0,this.time+.6*(target.type==='boss'?.35:1));this.perkPulse('stun',target,.6);
      }
      if(power&&attack.killHeal&&target.hp<=0){
        upper.hp=Math.min(upper.maxHp,upper.hp+attack.killHeal);power.hp=Math.min(power.maxHp,power.hp+attack.killHeal);this.perkPulse('heal',power,.7);
      }
      if(attack.hasteWard&&!attack.hasteWardSpent&&upper){
        const source=sourceAt(attack.hasteSkillSourceId);
        if(source){attack.hasteWardSpent=true;this.grantPercentWard(upper,.15,3,source.type,source.id);this.perkPulse('ward',source,.7);}
      }
    }
    shotDamage(plant, damage, support=this.supportAttack(plant)) {
      // Query the live sources, so an aura ends immediately if its source dies.
      const encouraged=this.isEndless&&this.localPlants(plant.row,plant.col).some(other=>other.hp>0&&other.type==='shisa'&&this.growth.shisa.level>=3&&Math.abs(other.row-plant.row)<=1&&Math.abs(other.col-plant.col)<=1);
      const springSource=this.isEndless&&(plant.springBoostUntil||0)>this.time?this.supportSourceAt(plant.springBoostSourceId,plant.row,plant.col):null;
      const spring=springSource&&springSource.type==='lily';
      return damage*(encouraged?1.12:1)*(spring?1.18:1)*(1+support.powerBonus);
    }
    repairSupport(plant, amount, sourceType) {
      if(!plant||plant.hp<=0||!plant.maxShield)return 0;
      const restored=Math.min(amount,Math.max(0,plant.maxShield-plant.shield));
      plant.shield+=restored;this.awardPlantXp(sourceType,restored/40);return restored;
    }
    defendPlant(blocker, enemy, damage, guard) {
      if(!this.isEndless)return damage;
      const m=this.combatPlantStats(blocker.type).mechanics||{};
      if(m.parry){
        if(this.time>=(blocker.nextParryAt||0)){
          blocker.nextParryAt=this.time+8;blocker.parryUntil=this.time+.6;
          this.hurt(enemy,60,0,.58,null,blocker.type);this.perkPulse('retaliate',blocker,.8);
        }
        if((blocker.parryUntil||0)>this.time)damage=0;
      }
      if(guard&&guard.type==='frostlily'&&this.combatPlantStats(guard.type).mechanics.frostArmor&&this.time>=(guard.nextFrostArmorAt||0)){
        guard.nextFrostArmorAt=this.time+6;this.freezeEnemy(enemy,.4);
      }
      if(blocker.type!=='wallnut'&&damage>0){
        const nut=this.localPlants(blocker.row,blocker.col).find(other=>other.hp>other.maxHp*.35&&other.type==='wallnut'&&this.combatPlantStats(other.type).mechanics.share&&Math.abs(other.row-blocker.row)<=1&&Math.abs(other.col-blocker.col)<=1);
        if(nut){
          const shared=Math.min(damage*.25,nut.hp-nut.maxHp*.35);
          nut.hp-=shared;nut.lastDamagedAt=this.time;damage-=shared;this.awardPlantXp(nut.type,shared/40);
        }
      }
      return damage;
    }
    rescuePlant(plant) {
      if(!this.isEndless||plant.hp>0)return false;
      const healer=this.localPlants(plant.row,plant.col).find(other=>other.hp>0&&other.type==='kani'&&this.combatPlantStats(other.type).mechanics.rescue&&Math.abs(other.row-plant.row)<=1&&Math.abs(other.col-plant.col)<=1);
      if(healer&&this.time>=(plant.nextKaniRescueAt||0)){
        plant.nextKaniRescueAt=this.time+20;plant.hp=Math.min(plant.maxHp,61);this.perkPulse('heal',plant,.9);return true;
      }
      const leaf=this.getSupport(plant.row,plant.col);
      if(!plant.support&&leaf&&leaf.type==='lily'&&this.combatPlantStats(leaf.type).mechanics.survival&&this.time>=(plant.nextLilyRescueAt||0)){
        plant.nextLilyRescueAt=this.time+30;plant.hp=Math.max(1,plant.maxHp*.15);this.perkPulse('ward',plant,.9);return true;
      }
      return false;
    }
    hurt(enemy, damage, slow = 0, slowFactor = .58, cause = null, sourceType = null, continuous = false, supportCredit=null) {
      if (!enemy||enemy.hp <= 0||!Number.isFinite(damage)||damage<=0) return;
      if(this.isEndless&&!continuous&&sourceType&&sourceType!=='pea'&&(enemy.markedUntil||0)>this.time)damage*=1.15;
      let absorbed=0;
      if(enemy.armor>0&&sourceType!=='magnet'){absorbed=Math.min(enemy.armor,damage);enemy.armor-=absorbed;damage-=absorbed;if(enemy.armor===0)enemy.armorBrokenAt=this.time;}
      const effectiveDamage=Math.min(enemy.hp,damage)+absorbed;
      if(this.isEndless&&runDirector)runDirector.recordDamage(this.strategy,sourceType||cause,effectiveDamage,enemy.hp-damage<=0);
      enemy.hp -= damage;
      // Continuous poison/ground damage is integrated exactly, but only flashes
      // occasionally so it does not hold the character in a permanent hit pose.
      if(!continuous||this.time>=(enemy.nextDotFlashAt||0)){
        enemy.hitTimer = .13;enemy.lastHitAt=this.time;this.animationCue(enemy,'hurt');
        if(continuous)enemy.nextDotFlashAt=this.time+.45;
      }
      if (slow) enemy.slowTimer = Math.max(enemy.slowTimer, slow);
      if (slow && slowFactor <= .5) enemy.frostTimer = Math.max(enemy.frostTimer, slow);
      // Continuous damage already has its timed hurt flash above. Feedback's
      // impact/shock/water states are exclusively non-continuous, so avoid a
      // terrain lookup and a transient feedback result for each DOT tick.
      if(combatFeedback&&!continuous){
        const feedback=combatFeedback.noteHit(enemy,this.time,sourceType||cause,{continuous,armored:absorbed>0,water:this.getTerrain(enemy.row,Math.floor(enemy.x)).kind==='water'});
        if(feedback.water)this.effect('waterHit',enemy.x,enemy.row,.36);
      }
      let ownerDamage=effectiveDamage;
      if(supportCredit&&supportCredit.powerBonus>0){
        const extra=Math.max(0,effectiveDamage-Math.min(effectiveDamage,damage/(1+supportCredit.powerBonus)));
        this.awardPlantXp('powerlily',extra/25);ownerDamage-=extra;
      }
      if(supportCredit&&supportCredit.hasteRate>1){
        const share=ownerDamage*(1-1/supportCredit.hasteRate);this.awardPlantXp('hastelily',share/25);ownerDamage-=share;
      }
      this.awardPlantXp(sourceType,ownerDamage/25);
      if (enemy.hp <= 0) {
        this.kills++;
        const deathX=enemy.x+(combatFeedback?combatFeedback.actorOffset(enemy,this.time).x:0);
        const deathFps=(24+animationRandom(enemy)*6)*(enemy.slowTimer>0?.5:1),deathDuration=(motionKind(enemy.type)==='chimera'?36:39)/deathFps;
        if(cause==='cherry'||cause==='jalapeno')this.effect('defeat',deathX,enemy.row,1.1,{enemyType:enemy.type,deathKind:'burn',cause,deathDuration:1.1});
        else this.effect('defeat', deathX, enemy.row, deathDuration+1, {enemyType:enemy.type,deathFps,deathDuration});
        this.events.push({type:'defeat', enemyType:enemy.type, x:enemy.x, row:enemy.row});
        const poison=enemy.dotStatuses&&enemy.dotStatuses.poison;
        if(this.isEndless&&poison&&poison.spread&&poison.until>this.time){
          poison.spread=false;
          for(const other of this.enemies)if(other.hp>0&&Math.abs(other.row-enemy.row)<=1&&Math.abs(other.x-enemy.x)<=1)this.poisonEnemy(other,poison.damage,poison.sourceType,{poisonSlow:poison.moveFactor});
          this.perkPulse('poison',enemy,1);
        }
      } else if ((enemy.type === 'chimera'||enemy.type==='boss') && enemy.hp <= enemy.maxHp * .5 && !enemy.enraged) {
        enemy.enraged = true;
        enemy.gasping=true;enemy.gaspAge=0;enemy.gaspPhase=0;enemy.gaspStartedAt=this.time;
        this.animationState(enemy,'gasp');
        this.events.push({type:'rage', x:enemy.x, row:enemy.row,id:enemy.id,entityId:enemy.id,at:this.time});
      }
    }
    explode(plant, radius, damage, allRows) {
      const m={...this.combatPlantStats(plant.type).mechanics};
      this.effect('burst', plant.x, plant.row, plant.type==='cherry'?.85:.8, {radius, plantType:plant.type});
      this.events.push({type:'explosion', plantType:plant.type, x:plant.x, row:plant.row, id:plant.id, entityId:plant.id, at:this.time});
      plant.hp=0;
      for (const enemy of this.enemies) {
        if ((allRows ? Math.abs(enemy.row - plant.row) <= 1 : enemy.row === plant.row) && Math.abs(enemy.x - plant.x) <= radius){
          this.hurt(enemy, damage,0,.58,plant.type,plant.type);
          if(m.push)this.knockbackEnemy(enemy,m.push);
          if(m.stun&&enemy.hp>0){enemy.stunnedUntil=Math.max(enemy.stunnedUntil||0,this.time+m.stun*(enemy.type==='boss'?.35:1));this.perkPulse('stun',enemy,.7);}
        }
      }
      if(m.slowField)this.addPerkField('slow',plant.x,plant.row,radius,6,0,plant.type,{moveFactor:m.slowField,rows:m.wideTrap?1:0});
      if(m.aftershock)this.perkActions.push({at:this.time+.8,x:plant.x,row:plant.row,radius,damage:damage*m.aftershock,sourceType:plant.type,scorch:!!m.scorch});
      if(m.chain)for(const [offset,delay]of[[-1,.35],[1,.7]])this.perkActions.push({at:this.time+delay,x:plant.x+offset,row:plant.row,radius:.75,rows:0,damage:damage*.2,sourceType:plant.type});
      if(m.fragments)for(const [dx,dr]of[[-1,0],[1,0],[0,-1],[0,1]])if(plant.row+dr>=0&&plant.row+dr<this.getBoard().rows)this.perkActions.push({at:this.time+.25,x:plant.x+dx,row:plant.row+dr,radius:.65,rows:0,damage:damage*.12,sourceType:plant.type});
      plant.hp = 0;
    }
    burnRow(plant) {
      const center=this.getBoard().cols/2,radius=(this.getBoard().cols+1)/2;
      this.effect('fire',center,plant.row,.85,{plantType:plant.type,radius});
      this.events.push({type:'explosion',plantType:plant.type,x:plant.x,row:plant.row,id:plant.id,entityId:plant.id,at:this.time});
      const spec=this.combatPlantStats(plant.type),damage=spec.damage,m=spec.mechanics||{};
      plant.hp=0;
      for (const enemy of this.enemies){
        if(enemy.row===plant.row)this.hurt(enemy,damage,0,.58,plant.type,plant.type);
        else if(m.adjacent&&Math.abs(enemy.row-plant.row)===1)this.hurt(enemy,damage*m.adjacent,0,.58,plant.type,plant.type);
      }
      if(m.burn)this.addPerkField('burn',center,plant.row,radius,4,m.burn,plant.type,{weaken:!!m.weaken});
      if(m.crossBurn)for(const row of[plant.row-1,plant.row+1])if(row>=0&&row<this.getBoard().rows)this.addPerkField('burn',center,row,radius,3,25,plant.type,{weaken:!!m.weaken});
      if(m.adjacent)this.perkPulse('burn',plant,1.5);
      plant.hp=0;
    }
    fireProjectile(plant, burstIndex = 0) {
      const spec=this.combatPlantStats(plant.type),spore=plant.type==='mushroom',m=spec.mechanics||{},support=this.supportAttack(plant),damage=this.shotDamage(plant,spec.damage,support);
      const attack=this.prepareSupportAttack(plant,burstIndex===0&&this.hasAttackTarget(plant)?0:burstIndex||99,support);
      if(plant.type==='magnet'||plant.type==='stormreed'){
        let target=this.rowTargets(plant.row,plant.x-.1,spec.unlimitedRange?Infinity:plant.x+spec.range)[0];
        let fromX=plant.x,fromRow=plant.row;
        const primary=target,visited=new Set();
        const hits=plant.type==='magnet'?1:m.chainHits||3;
        for(let jump=0;target&&jump<hits;jump++){
          visited.add(target.id);
          const hitDamage=damage*Math.pow(m.chainFalloff||.7,jump);
          if(plant.type==='magnet'){
            if(target.armor>0){const removed=Math.min(target.armor,target.maxArmor*(m.armorStrip||.35));target.armor-=removed;this.awardPlantXp(plant.type,removed/25);if(!target.armor)target.armorBrokenAt=this.time;}
            if(m.magnetSplash)for(const other of this.enemies)if(other.hp>0&&other.armor>0&&other.id!==target.id&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=1){const removed=Math.min(other.armor,other.maxArmor*.25);other.armor-=removed;this.awardPlantXp(plant.type,removed/25);if(!other.armor)other.armorBrokenAt=this.time;}
            if(m.magnetStun&&this.time>=(target.nextMagnetStunAt||0)){target.nextMagnetStunAt=this.time+4;target.stunnedUntil=this.time+.35*(target.type==='boss'?.35:1);}
          }
          this.hurt(target,hitDamage,m.magnetSlow||m.chainSlow?2:0,.58,null,plant.type,false,attack);
          this.supportHit(attack,target,hitDamage);
          if(plant.type==='stormreed'){
            this.effect('lightning',target.x,target.row,.32,{fromX,fromRow,targetId:target.id,sourceId:plant.id,plantType:'stormreed',jump});
            fromX=target.x;fromRow=target.row;
          }else{
            this.effect('hit',target.x,target.row,.3,{projectileType:'pea',targetId:target.id});
            this.perkPulse('retaliate',target,.6);
          }
          target=this.nearestEnemy(target.x,target.row,m.chainRange||1.5,1,visited);
        }
        plant.lastShotAt=this.time;this.animationCue(plant,'shoot',{melee:true,targetId:primary?primary.id:null});
        this.events.push({type:'shoot',plantType:plant.type,melee:true,x:plant.x,row:plant.row,id:plant.id,entityId:plant.id,targetId:primary?primary.id:null,at:this.time,startedAt:plant.shootStartedAt,markerAge:plant.shootMarkerAge,burstIndex});
        return null;
      }
      if(plant.type==='rakko'){
        const targets=this.rowTargets(plant.row,plant.x-.1,plant.x+spec.range).slice(0,m.cleave||1),target=targets[0];
        plant.perkShotCount=(plant.perkShotCount||0)+1;
        for(let i=0;i<targets.length;i++){
          this.hurt(targets[i],damage*(i?.5:1),0,.58,null,plant.type,false,attack);
          this.supportHit(attack,targets[i],damage*(i?.5:1));
          if(m.execute&&targets[i].hp>0){
            if(targets[i].type!=='boss'&&targets[i].hp<=targets[i].maxHp*.15)this.hurt(targets[i],targets[i].hp,0,.58,null,plant.type);
            else if(targets[i].type==='boss'&&this.time>=(targets[i].nextFinisherAt||0)){targets[i].nextFinisherAt=this.time+5;this.hurt(targets[i],damage*.3,0,.58,null,plant.type);}
          }
          if(m.pushEvery&&plant.perkShotCount%m.pushEvery===0)this.knockbackEnemy(targets[i],.6);
        }
        plant.lastShotAt=this.time;this.animationCue(plant,'shoot',{melee:true,targetId:target?target.id:null});
        this.effect('slash',plant.x,plant.row,.35,{plantType:plant.type,range:spec.range});
        this.events.push({type:'shoot',plantType:plant.type,melee:true,x:plant.x,row:plant.row,id:plant.id,entityId:plant.id,
          targetId:target?target.id:null,at:this.time,startedAt:plant.shootStartedAt,markerAge:plant.shootMarkerAge,burstIndex});
        return null;
      }
      plant.perkShotCount=(plant.perkShotCount||0)+1;
      const kind=spore?'spore':plant.type==='snowpea'?'snowpea':'pea';
      const projectile={id:this.nextId++,type:kind,kind,plantType:plant.type,row:plant.row,x:plant.x+.3,y:plant.y-.1,originX:plant.x,
        speed:spore?4.2:5.1,damage,range:spec.range,age:0,createdAt:this.time,entityId:plant.id,burstIndex,
        supportCredit:attack,
        ...(spore||m.maxHits>1?{hitIds:[]}: {}),
        ...(this.isEndless?{maxHits:spore?Infinity:m.maxHits||1,poison:m.poison||0,sporeField:m.sporeField||0,
          freeze:!!m.freezeEvery&&plant.perkShotCount%m.freezeEvery===0,freezeSplash:m.freezeSplash||0,splash:plant.type==='repeater'&&burstIndex===2?m.splash||0:0,
          mark:!!m.mark,ricochet:m.ricochet||0,poisonSlow:m.poisonSlow||1,poisonSpread:!!m.poisonSpread,frostBonus:m.frostBonus||0,shatter:m.shatter||0,
          tailPush:burstIndex===2?m.tailPush||0:0,crossfire:burstIndex===2?m.crossfire||0:0}: {})};
      this.projectiles.push(projectile);plant.lastShotAt=this.time;
      if(plant.type==='starfruit')for(let row=Math.max(0,plant.row-(m.starRows||1));row<=Math.min(this.getBoard().rows-1,plant.row+(m.starRows||1));row++)if(row!==plant.row){
        this.projectiles.push({...projectile,id:this.nextId++,row,y:row+.4,...(projectile.hitIds?{hitIds:[]}:{}),supportCredit:{...attack}});
      }
      this.animationCue(plant,'shoot',{projectileId:projectile.id,burstIndex});
      this.events.push({type:'shoot',plantType:plant.type,x:plant.x,row:plant.row,id:plant.id,entityId:plant.id,
        projectileId:projectile.id,at:this.time,startedAt:plant.shootStartedAt,markerAge:plant.shootMarkerAge,burstIndex});
      return projectile;
    }
    getProgress() {
      if(this.isEndless)return this.nextWaveIn!==null?1:this.waveTotal?Math.max(0,Math.min(1,(this.kills-this.waveKillStart)/this.waveTotal)):0;
      return this.totalEnemies ? Math.min(1, this.kills / this.totalEnemies) : 0;
    }
    getWavePresentation() {
      // Read-only presentation shared by music and the progress bar. Adventure
      // follows arrivals, not kills; waveAnnounced is the authoritative marker
      // even when two spawn groups overlap or floating timestamps round up a tick.
      const live=this.status==='playing'||this.status==='paused';
      const pending=Math.max(0,this.spawnPlan.length-this.spawnIndex);
      const alive=this.enemies.reduce((count,enemy)=>count+(enemy.hp>0?1:0),0);
      const spawningDone=this.spawnPlan.length>0&&pending===0;
      if(this.isEndless){
        const rest=this.nextWaveIn!==null;
        const boss=this.wave%5===0;
        const progress=this.getProgress();
        const phase=rest?'rest':boss?'boss':spawningDone?'cleanup':'normal';
        return {mode:'endless',phase,intense:live&&!rest&&boss,progress,
          wave:this.wave,waveCount:0,
          markers:[{wave:this.wave,position:1,reached:progress>=1,final:false}],
          spawningDone,remaining:pending+alive,nextWaveIn:this.nextWaveIn};
      }
      const waves=this.level.waves;
      const waveCount=waves.length;
      const endTime=this.spawnPlan.length?this.spawnPlan[this.spawnPlan.length-1].at:
        waves.reduce((last,wave)=>Math.max(last,wave.at+Math.max(0,wave.count-1)*wave.gap),0);
      const progress=this.status==='won'?1:endTime>0?Math.max(0,Math.min(1,this.time/endTime)):0;
      const finalWave=waveCount>0&&this.waveAnnounced>=waveCount;
      return {mode:'adventure',phase:finalWave?'final':spawningDone?'cleanup':'normal',
        intense:live&&finalWave,progress,wave:this.waveAnnounced,waveCount,
        markers:waves.map((wave,index)=>({wave:index+1,
          position:endTime>0?Math.max(0,Math.min(1,wave.at/endTime)):0,
          reached:this.waveAnnounced>=index+1,final:index===waveCount-1})),
        spawningDone,remaining:pending+alive,nextWaveIn:null};
    }
    checkEnemyBreach(enemy) {
      const mower=this.mowers[enemy.row];
      if(this.isEndless&&runDirector)runDirector.rescueBreach(this.strategy,this,enemy,mower);
      if(enemy.x<.15&&!mower.used){
        mower.used=true;mower.active=true;mower.x=-.4;
        this.events.push({type:'mower',row:enemy.row});this.effect('mower',0,enemy.row,.8);
      }
      if(enemy.x<-.7&&!mower.active){
        if(this.isEndless&&runDirector)runDirector.recordFailure(this.strategy,enemy,this);
        this.status='lost';this.events.push({type:'lose',row:enemy.row});return true;
      }
      return false;
    }
    update(dt) {
      if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      // The source animation counters advance at 100 Hz. Accumulate render
      // deltas so 30/60/120 Hz presentation cannot drift the fire markers.
      this.updateRemainder += Math.min(dt,10);
      while (this.updateRemainder >= STEP-1e-9 && this.status === 'playing') {
        this.updateRemainder=Math.max(0,this.updateRemainder-STEP);
        this.step(STEP);
      }
      // A milestone can pause halfway through a fast-forward/render delta.
      // Wall time after that boundary belongs to the paused reward screen;
      // retaining it would invalidate saves and fast-forward after selection.
      if(this.status==='paused'&&this.isEndless&&this.strategy&&this.strategy.pending)this.updateRemainder=0;
    }
    step(dt) {
      beginActorAuthority(this);
      this.simulationTick++;
      this.time = this.simulationTick / ANIMATION_TIMING.tickHz;
      for (const type of Object.keys(this.cooldowns)) this.cooldowns[type] = Math.max(0, this.cooldowns[type] - dt);
      this.skyTimer -= dt;
      if (this.skyTimer <= 0) {
        this.addSun(.6 + this.random() * (this.getBoard().cols-1.2), .35 + this.random() * (this.getBoard().rows-.8));
        this.skyTimer += this.level.sunInterval;
      }
      for (const sun of this.suns) this.updateSun(sun, dt);
      this.suns = this.suns.filter(sun => sun.age < sun.duration);
      for (const fx of this.effects) fx.age += dt;
      this.effects = this.effects.filter(fx => fx.age < fx.duration);

      if(this.isEndless&&this.intermissionUntilTick!==null){
        this.nextWaveIn=Math.max(0,(this.intermissionUntilTick-this.simulationTick)/ANIMATION_TIMING.tickHz);
        if(this.nextWaveIn===0)this.beginEndlessWave(this.wave+1);
      }

      while (this.spawnIndex < this.spawnPlan.length &&
        (Array.isArray(this.spawnPlan)?this.spawnPlan[this.spawnIndex].at:this.spawnPlan.startAt+this.spawnIndex*this.endlessWave.gap) <= this.time) {
        if(this.isEndless&&(this.enemies.length>=this.endlessWave.maxAlive||this.time+1e-9<this.nextEndlessSpawnAt))break;
        const spec = this.spawnSpecAt(this.spawnIndex++);
        this.wave = spec.wave;
        if (this.wave > this.waveAnnounced) {
          this.waveAnnounced = this.wave;
          this.waveSpawned=0;this.waveTotal=this.level.waves[this.wave-1].count;
          this.events.push({type:'wave', wave:this.wave});
        }
        this.spawn(spec);
        this.waveSpawned++;
        if(this.isEndless)this.nextEndlessSpawnAt=this.time+this.endlessWave.gap;
      }

      this.refreshSupportIndex();
      this.cleanupSupports();
      this.refreshEnemyIndex();
      this.tickEnemyAbilities(dt);
      this.tickPerkEffects(dt);
      if (trustedActorLoopPartitions.has(this)) stepActorSupportsAndPlants.call(this,dt);
      else {
      for(const support of this.supports){
        support.age+=dt;support.animationAge=support.age;
        support.animationStateAge=this.time-support.animationStateAt;
        support.idleFrame+=dt*support.idleFps;
        support.idlePhase=(support.idleFrame/support.sourceIdleFrames)%1;
        support.hitTimer=Math.max(0,support.hitTimer-dt);
        support.shieldHitTimer=Math.max(0,support.shieldHitTimer-dt);
        support.hurtCooldown=Math.max(0,support.hurtCooldown-dt);
        this.tickPlantPerks(support,dt);
      }
      for (const plant of this.plants) {
        if (plant.hp <= 0) continue;
        const spec = this.combatPlantStats(plant.type);
        plant.age += dt;
        plant.animationAge=plant.age;
        plant.animationStateAge=this.time-plant.animationStateAt;
        plant.idleFrame+=dt*plant.idleFps;
        plant.idlePhase=(plant.idleFrame/plant.sourceIdleFrames)%1;
        if(plant.produceAge>=0)plant.produceAge=this.time-plant.lastProduceAt;
        if(plant.cloudAge>=0)plant.cloudAge+=dt;
        plant.hitTimer=Math.max(0,plant.hitTimer-dt);
        plant.hurtCooldown=Math.max(0,plant.hurtCooldown-dt);
        this.tickPlantPerks(plant,dt);
        if (plant.type === 'sunflower'||plant.type==='shisa') {
          plant.produceTimer -= dt;
          plant.productionFlash=Math.max(0,1-plant.produceTimer);
          if (plant.produceTimer <= 1e-9) {
            const produced=this.addSun(plant.x + .12, plant.y - .2, 'sunflower',spec.produceValue||25);
            produced.entityId=plant.id;produced.createdAt=this.time;
            plant.produceAge=0;plant.lastProduceAt=this.time;
            this.animationCue(plant,'produce',{sunId:produced.id});
            this.events.push({type:'produce',plantType:plant.type,id:plant.id,entityId:plant.id,sunId:produced.id,value:produced.value,at:this.time,x:plant.x,row:plant.row});
            this.awardPlantXp(plant.type,produced.value/10);
            const m=spec.mechanics||{};
            plant.perkProduceCount=(plant.perkProduceCount||0)+1;
            if(m.bonusEvery&&plant.perkProduceCount%m.bonusEvery===0){
              this.addSun(plant.x-.25,plant.y-.2,'sunflower',25);this.awardPlantXp(plant.type,2.5);this.perkPulse('bonusSun',plant,.8);
            }
            if(m.heal){
              for(const other of this.nearbyPlants(plant)){
                const healed=this.healPlant(other,m.heal,plant.type);
                if(m.overhealWard&&m.heal>healed)this.grantPercentWard(other,.15*(m.heal-healed)/m.heal,6,plant.type);
              }
              this.perkPulse('heal',plant,1.2);
            }
            if(m.seedRally&&plant.perkProduceCount%3===0&&this.time+1e-9>=this.nextSunflowerRallyAt){
              for(const type of Object.keys(this.cooldowns))this.cooldowns[type]=Math.max(0,this.cooldowns[type]-1);
              this.nextSunflowerRallyAt=this.time+10;this.perkPulse('cooldown',plant,1.2);
            }
            if(m.serviceWard||m.groupRecovery)for(const other of this.nearbyPlants(plant)){
              if(m.serviceWard)this.grantPercentWard(other,m.serviceWard,5,plant.type);
              if(m.groupRecovery){this.healPlant(other,m.groupRecovery,plant.type);this.repairSupport(other,25,plant.type);}
            }
            if(m.serviceWard)this.perkPulse(m.groupRecovery?'heal':'ward',plant,1.2);
            if(m.cooldown&&this.time+1e-9>=this.nextShisaCooldownAt){
              for(const type of Object.keys(this.cooldowns))this.cooldowns[type]=Math.max(0,this.cooldowns[type]-m.cooldown);
              this.nextShisaCooldownAt=this.time+8;this.perkPulse('cooldown',plant,1.2);
            }
            plant.produceTimer += spec.interval;
          }
        } else if(plant.type==='kani'){
          plant.supportTimer-=dt;
          if(plant.supportTimer<=1e-9){
            const targets=[];
            const m=spec.mechanics||{};
            for(const other of this.plants.concat(m.wideSupport?this.supports:[])){
              if(other.id===plant.id||other.hp<=0||Math.abs(other.row-plant.row)>1||Math.abs(other.col-plant.col)>(m.wideSupport?2:1))continue;
              const value=Math.min(spec.heal,Math.max(0,other.maxHp-other.hp));
              if(value>0){other.hp+=value;targets.push({id:other.id,value});}
              if(m.ward&&spec.heal>value)this.grantPercentWard(other,m.ward*(spec.heal-value)/spec.heal,6,plant.type);
              if(m.protection)other.protectedUntil=this.time+4;
              if(m.wideSupport)this.repairSupport(other,20,plant.type);
            }
            plant.produceAge=0;plant.lastProduceAt=this.time;plant.supportTimer+=spec.supportInterval;
            this.animationCue(plant,'support',{targets});
            this.effect('heal',plant.x,plant.row,.7,{plantType:plant.type,radius:spec.range});
            this.events.push({type:'support',plantType:plant.type,id:plant.id,entityId:plant.id,at:this.time,x:plant.x,row:plant.row,
              healed:targets.reduce((sum,target)=>sum+target.value,0),targets});
            this.awardPlantXp(plant.type,targets.reduce((sum,target)=>sum+target.value,0)/40);
            if(m.ward)this.perkPulse('ward',plant,1.2);
          }
        } else if (plant.type === 'mine') {
          plant.riseAge=plant.age<spec.armTime-plant.riseDuration?-1:Math.min(plant.riseDuration,plant.age-(spec.armTime-plant.riseDuration));
          const wasArmed=plant.armed;
          plant.armed = plant.age >= spec.armTime-1e-9;
          this.animationState(plant,plant.armed?'armed':plant.riseAge>=0?'rise':'idle');
          if(plant.armed&&!wasArmed){
            plant.idleFps=12+animationRandom(plant)*3;plant.sourceIdleFps=plant.idleFps;plant.idleFrame=0;plant.idlePhase=0;
            this.animationCue(plant,'armed');
          }else if(plant.armed)plant.armedTime+=dt;
          if (plant.armed && this.enemiesInRow(plant.row).some(e => e.hp > 0 && Math.abs(e.x - plant.x) < .63)) this.explode(plant, spec.range, spec.damage, false);
        } else if (spec.fuse) {
          plant.fuseAge=plant.age;plant.fuseProgress=Math.min(1,plant.age/spec.fuse);
          if (plant.age >= spec.fuse-1e-9) {
            if (plant.type==='jalapeno') this.burnRow(plant);
            else this.explode(plant, spec.range, spec.damage, true);
          }
        } else if (SHOOTERS.has(plant.type)) {
          const targets = this.hasAttackTarget(plant);
          plant.targeting=targets;
          const timing=shootingTiming(plant.type),attackRate=tickSupportAttack(this,plant).attackRate;
          if(plant.secondShotTick&&this.simulationTick>=plant.secondShotTick){
            this.fireProjectile(plant,1);plant.secondShotTick=0;
            if(plant.burstShots===3)plant.thirdShotTick=this.simulationTick+18;
          }
          if(plant.thirdShotTick&&this.simulationTick>=plant.thirdShotTick){this.fireProjectile(plant,2);plant.thirdShotTick=0;}
          // UpdateShooting precedes UpdateShooter in the PC game. A newly
          // started counter is not decremented until the following 10 ms tick.
          if(plant.shootAge>=0){
            const beforeTicks=plant.shootTicks;
            plant.shootTicks+=attackRate;
            plant.shootAge=plant.shootTicks/100;
            plant.shootingCounter=Math.max(0,timing.shootCounter-plant.shootTicks);
            if(timing.cloudCounter&&beforeTicks<timing.shootCounter-timing.cloudCounter-1e-9&&plant.shootTicks>=timing.shootCounter-timing.cloudCounter-1e-9){
              plant.cloudAge=0;this.animationCue(plant,'cloud');
              this.events.push({type:'cloud',plantType:plant.type,id:plant.id,entityId:plant.id,at:this.time,x:plant.x,row:plant.row});
            }
            if(!plant.shotReleased&&plant.shootTicks>=timing.shootCounter-timing.fireCounter-1e-9){
              this.fireProjectile(plant);plant.shotReleased=true;
              if(plant.type==='repeater'){plant.secondShotTick=this.simulationTick+18;plant.burstShots=(spec.mechanics||{}).shots||2;}
            }
            plant.recoil=plant.shotReleased?Math.max(0,1-(plant.shootAge-plant.shootMarkerAge)/(plant.shootDuration-plant.shootMarkerAge)):0;
            if(plant.shootAge>=plant.shootDuration-1e-9){
              this.animationState(plant,'idle');plant.shootAge=-1;plant.recoil=0;plant.shootingCounter=0;
              if(timing.postShootIdleFps){plant.idleFps=timing.postShootIdleFps;plant.sourceIdleFps=plant.idleFps;plant.idleFrame=0;plant.idlePhase=0;}
            }
          }
          plant.launchCounter-=attackRate;
          if(plant.launchCounter<=0){
            // Rand(15) is [0,15): exact source launch spacing is 136..150 ticks.
            const overflow=attackRate===1?0:plant.launchCounter;
            plant.launchCounter=150-Math.floor(animationRandom(plant)*15)+overflow;
            plant.launchPeriodTicks=plant.launchCounter;
            if(targets){
              plant.shootAge=0;plant.shootTicks=0;plant.shootingCounter=timing.shootCounter;
              plant.shootStartedAt=this.time;plant.shotReleased=false;plant.recoil=0;plant.cloudAge=-1;
              this.animationState(plant,'shoot');this.animationCue(plant,'shoot-start');
              this.events.push({type:'shoot-start',plantType:plant.type,id:plant.id,entityId:plant.id,at:this.time,x:plant.x,row:plant.row});
            }
          }
          plant.attackTimer=plant.launchCounter/(100*attackRate);
        }
        if(plant.blinkAge>=0){plant.blinkAge=this.time-plant.blinkStartedAt;plant.blinkPhase=Math.min(1,plant.blinkAge/.2);if(plant.blinkAge>=.2-1e-9){plant.blinkAge=-1;plant.blinkPhase=0;}}
        plant.blinkCountdown--;
        if(plant.blinkCountdown<=0){
          // DoBlink resets the countdown even when the blink is suppressed.
          plant.blinkCountdown=400+Math.floor(animationRandom(plant)*400);
          if(!plant.shootingCounter&&(plant.type!=='mine'||plant.armed)){
            plant.blinkAge=0;plant.blinkPhase=0;plant.blinkStartedAt=this.time;
            this.events.push({type:'blink',id:plant.id,entityId:plant.id,at:this.time});
          }
        }
        plant.blinkTimer=plant.blinkCountdown/100;
      }

      }
      if (trustedActorLoopPartitions.has(this)) stepActorProjectiles.call(this,dt);
      else {
      for (const shot of this.projectiles) {
        // A projectile appears at the visual marker, and moves on the next tick.
        if(shot.createdAt===this.time)continue;
        const oldX = shot.x;
        const endX=shot.originX+shot.range;
        shot.x = Math.min(shot.x + shot.speed * dt,endX);
        shot.age += dt;
        const piercing=shot.type==='spore'||shot.maxHits>1;
        const targets = this.rowTargets(shot.row,oldX-.33,Math.min(endX,shot.x+.33),piercing?shot.hitIds:null);
        for (const target of targets) {
          const credit=this.liveSupportCredit(shot.supportCredit);
          const liveDamage=shot.damage/(1+(shot.supportCredit?shot.supportCredit.powerBonus:0))*(1+(credit?credit.powerBonus:0));
          const damage=liveDamage*(shot.type!=='spore'&&piercing&&shot.hitIds.length?.6:1)*(shot.frostBonus&&(target.frozenUntil||0)>this.time?1+shot.frostBonus:1);
          this.hurt(target, damage, shot.type==='snowpea'?4:0,.5,null,shot.plantType,false,credit);
          this.supportHit(shot.supportCredit,target,damage);
          this.effect('hit', target.x, target.row, shot.type==='snowpea'?.42:.2, {projectileType:shot.type,targetId:target.id});
          if(shot.mark&&target.hp>0){target.markedUntil=this.time+3;this.perkPulse('retaliate',target,.4);}
          if(shot.ricochet&&!shot.ricochetSpent&&target.hp<=0){
            shot.ricochetSpent=true;
            const bounce=this.nearestEnemy(target.x,target.row,1.5,1);
            if(bounce){this.hurt(bounce,liveDamage*shot.ricochet,0,.58,null,shot.plantType);this.perkPulse('splash',bounce,.5);}
          }
          if(shot.poison)this.poisonEnemy(target,shot.poison,shot.plantType,shot);
          if(shot.sporeField)this.addPerkField('spore',target.x,target.row,.65,3,shot.sporeField,shot.plantType);
          if(shot.freeze){
            const frozen=this.freezeEnemy(target,.7);
            if(shot.freezeSplash)for(const other of this.enemies)if(other.id!==target.id&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=shot.freezeSplash){
              if(this.freezeEnemy(other,.7))this.effect('hit',other.x,other.row,.42,{projectileType:'snowpea',targetId:other.id,iceSplash:true});
            }
            if(frozen&&shot.shatter){
              for(const other of this.enemies)if(other.hp>0&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=.7)this.hurt(other,liveDamage*shot.shatter,0,.58,null,shot.plantType);
              this.perkPulse('splash',target,.7);
            }
          }
          if(shot.splash){
            for(const other of this.enemies)if(other.id!==target.id&&other.hp>0&&Math.abs(other.row-target.row)<=1&&Math.abs(other.x-target.x)<=.65)this.hurt(other,liveDamage*shot.splash,0,.58,null,shot.plantType);
            this.perkPulse('splash',target,.7);
          }
          if(shot.plantType==='mushroom'&&target.hp>0&&this.time>=(target.nextSporePushAt||0)){target.nextSporePushAt=this.time+3;this.knockbackEnemy(target,.35);}
          if(shot.tailPush&&target.hp>0&&this.time>=(target.nextTailPushAt||0)){target.nextTailPushAt=this.time+3;this.knockbackEnemy(target,shot.tailPush);}
          if(shot.crossfire)for(const row of[target.row-1,target.row+1]){
            const side=this.nearestEnemy(target.x,row,1.8);
            if(side){this.hurt(side,liveDamage*shot.crossfire,0,.58,null,shot.plantType);this.perkPulse('splash',side,.6);}
          }
          if(piercing){shot.hitIds.push(target.id);if(shot.hitIds.length>=(shot.maxHits||Infinity)){shot.spent=true;break;}}
          else{shot.spent=true;break;}
        }
        if(shot.x>=endX)shot.spent=true;
      }
      this.projectiles = this.projectiles.filter(shot => !shot.spent && shot.x < this.getBoard().cols+1.2);

      }
      // Reuse unchanged contact geometry; each visitor still reads current hp
      // so an earlier bite, rescue or shield break immediately takes effect.
      if (trustedActorLoopPartitions.has(this)) stepActorEnemies.call(this,dt);
      else {
      const blockers=contactRows(this);
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        enemy.age += dt;
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        enemy.frostTimer = Math.max(0, enemy.frostTimer - dt);
        enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
        const chilled=enemy.slowTimer>0?ANIMATION_TIMING.enemy.chilledRate:1;
        if((enemy.frozenUntil||0)>this.time||(enemy.stunnedUntil||0)>this.time||(enemy.shockUntil||0)>this.time){
          // Stop both the clip and its transition at the last displayed pose.
          // Keep contact state so thawing beside the same plant resumes the
          // bite; combat still skips this entire tick while immobilized.
          enemy.animationStateAt=this.time-enemy.animationStateAge;
          enemy.walkFps=0;enemy.eatFps=0;
          continue;
        }
        enemy.animationAge+=dt;
        enemy.animationStateAge=this.time-enemy.animationStateAt;
        if(enemy.gasping){
          enemy.eating=false;enemy.blockerId=null;
          if(this.time>enemy.gaspStartedAt)enemy.gaspAge+=dt*chilled;
          enemy.gaspPhase=Math.min(1,enemy.gaspAge/enemy.gaspDuration);
          if(enemy.gaspPhase<1-1e-9){if(this.checkEnemyBreach(enemy))break;continue;}
          enemy.gasping=false;enemy.gaspPhase=1;
          // Retain the last supporting step through the rage anticipation.
          enemy.eatTime=0;enemy.eatPhase=0;enemy.eatCycles=0;
          this.events.push({type:'rage-ready',id:enemy.id,entityId:enemy.id,at:this.time});
        }
        const blocker=contactBlocker(blockers,enemy);
        const enteringEat=!!blocker&&enemy.animationState!=='eat';
        enemy.eating = !!blocker;
        enemy.blockerId=blocker?blocker.id:null;
        const sourceVelocity=enemy.enraged?(enemy.type==='boss'?enemy.sourceWalkVelocity*1.5:enemy.sourceRageVelocity):enemy.sourceWalkVelocity;
        const enemyCol=Math.floor(enemy.x);
        // The front tile catches approaching visitors before contact. Multiple
        // neighboring leaves refresh the same local mist instead of stacking.
        const mistHere=this.getSupport(enemy.row,enemyCol),mistBehind=this.getSupport(enemy.row,enemyCol-1);
        const leafSlow=(mistHere&&mistHere.type==='frostlily'||mistBehind&&mistBehind.type==='frostlily')?this.combatPlantStats('frostlily').moveFactor:1;
        const terrainSpeed=this.getTerrain(enemy.row,Math.floor(enemy.x)).speed*leafSlow*(enemy.perkMoveFactor||1);
        const mistBite=leafSlow<1?(this.combatPlantStats('frostlily').mechanics||{}).biteFactor||1:1;
        let ordinarySpeed=enemy.speed*(enemy.enraged?ENEMIES[enemy.type].rageSpeed||2.05:1);
        if(this.isEndless)ordinarySpeed=Math.min(ENDLESS.maxSpeed,ordinarySpeed);
        let moveSpeed=ordinarySpeed*terrainSpeed*(enemy.drumRate||1);
        if(this.isEndless)moveSpeed=Math.min(ENDLESS.maxSpeed,moveSpeed);
        const terrainWalkRate=ordinarySpeed>0?moveSpeed/ordinarySpeed:terrainSpeed;
        enemy.sourceWalkFps=sourceVelocity*enemy.sourceWalkFrames/enemy.sourceGroundDistance*47;
        enemy.walkFps=enemy.sourceWalkFps*chilled*terrainWalkRate;
        enemy.eatFps=enemy.sourceEatFps*chilled*mistBite*(enemy.drumRate||1);
        if (blocker) {
          const guard=!blocker.support?this.getSupport(blocker.row,blocker.col):null;
          const shield=guard&&guard.shield>0?guard:null;
          if(enteringEat){enemy.eatTime=0;enemy.eatCycles=0;enemy.eatPhase=0;this.animationState(enemy,'eat');enemy.animationStateAge=0;enemy.animationStateAt=this.time;}
          else {
            enemy.eatTime+=dt;
            const previousCycle=enemy.eatCycles;
            enemy.eatCycles+=dt*enemy.eatFps/enemy.sourceEatFrames;
            enemy.eatPhase=enemy.eatCycles%1;
            for(const marker of enemy.sourceChewMarkers){
              if(crossed(previousCycle,enemy.eatCycles,marker)){
                enemy.lastBiteAt=this.time;
                this.animationCue(enemy,'bite',{targetId:blocker.id,phase:marker});
                const struck=shield||blocker;
                struck.hitTimer=.18;struck.lastHitAt=this.time;
                if(shield)shield.shieldHitTimer=.24;
                else if(this.isEndless&&blocker.ward>0&&(blocker.wardUntil||0)>this.time&&
                  (!blocker.wardSourceId||this.supportSourceAt(blocker.wardSourceId,blocker.row,blocker.col)))blocker.wardHitAt=this.time;
                this.animationCue(struck,shield?'shield-hit':'hurt',{sourceId:enemy.id});
                this.events.push({type:'bite',id:enemy.id,entityId:enemy.id,targetId:blocker.id,at:this.time,phase:marker});
              }
            }
          }
          // As in the source, chew animation/sound markers are not damage
          // ticks. Chilling slows both the animation and damage rate.
          let damage=ENEMIES[enemy.type].damage * (enemy.damageScale||1) * (enemy.enraged ? 1.5 : 1) * chilled * mistBite * (enemy.drumRate||1) * dt;
          if(this.isEndless){
            blocker.lastDamagedAt=this.time;
            if(guard)guard.lastDamagedAt=this.time;
            if((blocker.protectedUntil||0)>this.time)damage*=.8;
            if((enemy.weakenedUntil||0)>this.time)damage*=.8;
            damage=this.defendPlant(blocker,enemy,damage,guard);
          }
          if(shield){
            if(this.isEndless)shield.lastDamagedAt=this.time;
            const absorbed=Math.min(shield.shield,damage);
            shield.shield=Math.max(0,shield.shield-absorbed);damage-=absorbed;
            this.awardPlantXp(shield.type,absorbed/40);
            if(shield.shield===0){
              shield.shieldBreakAt=this.time;
              this.animationCue(shield,'shield-break');
              this.events.push({type:'shieldBreak',id:shield.id,entityId:shield.id,row:shield.row,col:shield.col,at:this.time});
              const m=this.combatPlantStats(shield.type).mechanics||{};
              if(m.push&&this.time>=(shield.nextShieldPushAt||0)){
                shield.nextShieldPushAt=this.time+30;
                for(const other of this.enemies)if(Math.abs(other.row-shield.row)<=1&&Math.abs(other.x-shield.x)<=1.2)this.knockbackEnemy(other,m.push);
              }
            }
          }
          if(blocker.wardSourceId&&!this.supportSourceAt(blocker.wardSourceId,blocker.row,blocker.col))blocker.ward=0;
          if(this.isEndless&&blocker.ward>0&&(blocker.wardUntil||0)>this.time){
            const absorbed=Math.min(blocker.ward,damage);blocker.ward-=absorbed;damage-=absorbed;
            if(absorbed>0&&blocker.ward===0)blocker.wardBreakAt=this.time;
            this.awardPlantXp(blocker.wardSourceType,absorbed/40);
          }
          const effectiveDamage=Math.min(Math.max(0,blocker.hp),damage);
          blocker.hp-=damage;
          this.awardPlantXp(blocker.type,effectiveDamage/40);
          if(blocker.hp<=0)this.rescuePlant(blocker);
          if(this.isEndless&&blocker.type==='wallnut'&&blocker.hp>0){
            const m=this.combatPlantStats(blocker.type).mechanics;
            if(m.retaliate&&this.time>=(blocker.nextRetaliateAt||0)){
              blocker.nextRetaliateAt=this.time+1;this.hurt(enemy,m.retaliate,0,.58,null,blocker.type);this.perkPulse('retaliate',blocker,.65);
            }
          }
          if (blocker.hp <= 0) {
            this.effect('shovel', blocker.x, blocker.row, .6);
            this.events.push({type:'plantLost', plantType:blocker.type, row:blocker.row, col:blocker.col});
          }
        } else {
          if(enemy.animationState!=='walk'){this.animationState(enemy,'walk');}
          else {
            enemy.walkTime+=dt;
            enemy.locomotionPhase=(enemy.locomotionPhase+dt*enemy.walkFps/enemy.sourceWalkFrames)%1;
          }
          // Hurt flashes do not immobilize the source body reanimation. Its
          // integrated phase keeps advancing through hits, slow and rage.
          enemy.x -= moveSpeed * (enemy.frostTimer>0?.5:enemy.slowTimer>0?.58:1) * dt;
        }
        if(this.checkEnemyBreach(enemy))break;
      }
      }
      for (const mower of this.mowers) {
        if (!mower.active) continue;
        const before = mower.x;
        mower.x += 6 * dt;
        for (const enemy of this.enemies) {
          if (enemy.hp > 0 && enemy.row === mower.row && enemy.x >= before - .65 && enemy.x <= mower.x + .65) this.hurt(enemy, 99999);
        }
        if (mower.x > this.getBoard().cols+1.3) mower.active = false;
      }
      this.cleanupSupports();
      // Retain the live array so shield sync can reuse this tick's support index.
      if (this.plants.some(plant => !(plant.hp > 0))) {this.plants = this.plants.filter(plant => plant.hp > 0);actorTopologyChanged(this);}
      this.syncGuardShields();
      this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
      if (this.status === 'playing' && this.spawnIndex === this.spawnPlan.length && this.spawnPlan.length > 0 && this.enemies.length === 0) {
        if(this.isEndless){
          if(this.nextWaveIn===null){
            this.wavesCleared=this.wave;this.nextWaveIn=this.endlessWave.rest;
            this.intermissionUntilTick=this.simulationTick+Math.round(this.nextWaveIn*ANIMATION_TIMING.tickHz);
            if(this.growthRewardedWave<this.wave){
              this.growthRewardedWave=this.wave;
              for(const type of this.wavePlantTypes)this.awardPlantXp(type,12);
            }
            this.events.push({type:'waveClear',wave:this.wave,endless:true,at:this.time,nextWaveIn:this.nextWaveIn,kills:this.kills});
            if(runDirector&&runDirector.offer(this.strategy,this.wave)){this.status='paused';this.events.push({type:'strategyReward',wave:this.wave});}
          }
        }else{
          this.status = 'won';this.wavesCleared=this.level.waves.length;
          this.events.push({type:'win', time:this.time, kills:this.kills});
        }
      }
      // Consumers normally drain events each frame. A headless endless run
      // must also remain bounded when nobody reads its transient event queue.
      if(this.isEndless&&this.events.length>ENDLESS.eventLimit)this.events.splice(0,this.events.length-ENDLESS.eventLimit);
      endActorAuthority(this);
      const index=battleIndexes.get(this);if(index)index.active=false;
      const supports=supportIndexes.get(this);if(supports)supports.active=false;
    }
  }
  // Prepared restores contain one already validated private Game. No snapshot or
  // actor graph is exposed through the opaque token, and every commit consumes it.
  const preparedEndlessTokens=new WeakMap(),preparedEndlessImport=Game.prototype.importEndlessSave,preparedEndlessReset=Game.prototype.reset;
  const preparedEndlessDescriptor=Object.getOwnPropertyDescriptor,preparedEndlessOwnKeys=Reflect.ownKeys;
  const preparedEndlessIntrinsics=[[Math,'random'],[JSON,'stringify'],[Object,'keys'],[Object,'getPrototypeOf'],[Object,'getOwnPropertyDescriptor'],[Object,'getOwnPropertyNames'],[Object,'fromEntries'],[Array,'from'],[Array,'isArray'],[Number,'isFinite'],[Number,'isInteger'],[Number,'isSafeInteger'],[Object.prototype,'hasOwnProperty'],[Function.prototype,'call']].map(([object,key])=>[object,key,preparedEndlessDescriptor(object,key)]);
  const preparedEndlessNativeIntrinsics=preparedEndlessIntrinsics.every(([, , d])=>d&&typeof d.value==='function'&&Function.prototype.toString.call(d.value).includes('[native code]'));
  const preparedEndlessObjectKeys=preparedEndlessOwnKeys(Object.prototype),preparedEndlessObjectDescriptors=preparedEndlessObjectKeys.map(key=>preparedEndlessDescriptor(Object.prototype,key));
  const preparedEndlessDependencies=[[sceneTerrain,'VERSION'],[sceneTerrain,'createMap'],...(runDirector?[[runDirector,'createState'],[runDirector,'restoreState']]:[])].map(([object,key])=>[object,key,preparedEndlessDescriptor(object,key)]);
  function preparedEndlessDescriptorSame(a,b){return a===undefined&&b===undefined||a&&b&&a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;}
  function preparedEndlessEnvironmentSafe(){
    if(!nativeRestoreDependencies||!nativeRestoreDependencies.certifiesDirector(runDirector)||!nativeRestoreDependencies.certifiesTerrain(sceneTerrain))return false;
    if(!preparedEndlessNativeIntrinsics)return false;
    const keys=preparedEndlessOwnKeys(Object.prototype);if(keys.length!==preparedEndlessObjectKeys.length)return false;
    for(let i=0;i<keys.length;i++)if(keys[i]!==preparedEndlessObjectKeys[i]||!preparedEndlessDescriptorSame(preparedEndlessDescriptor(Object.prototype,keys[i]),preparedEndlessObjectDescriptors[i]))return false;
    for(const [object,key,descriptor] of preparedEndlessIntrinsics.concat(preparedEndlessDependencies))if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||!preparedEndlessDescriptorSame(preparedEndlessDescriptor(object,key),descriptor))return false;
    for(const key of [...SAVE_FIELDS,'strategy','seed'])if(preparedEndlessDescriptor(Game.prototype,key))return false;
    return true;
  }
  function preparedEndlessValidationProof(){
    if(!preparedEndlessEnvironmentSafe())return null;
    const proof=[];
    for(const type of Object.keys(PLANTS)){
      const spec=PLANTS[type],prototype=Object.getPrototypeOf(spec);if(prototype!==Object.prototype&&prototype!==null)return null;
      const descriptors=['support','fuse'].map(key=>preparedEndlessDescriptor(spec,key));
      if(descriptors.some(d=>d&&!Object.prototype.hasOwnProperty.call(d,'value')))return null;
      proof.push([spec,prototype,...descriptors]);
    }
    return proof;
  }
  function preparedEndlessProofMatches(proof){
    if(!proof||!preparedEndlessEnvironmentSafe())return false;
    for(const [spec,prototype,support,fuse] of proof)if(Object.getPrototypeOf(spec)!==prototype||!preparedEndlessDescriptorSame(preparedEndlessDescriptor(spec,'support'),support)||!preparedEndlessDescriptorSame(preparedEndlessDescriptor(spec,'fuse'),fuse))return false;
    return true;
  }
  function ordinaryPreparedEndlessTarget(game){
    try{
      if(!preparedEndlessGames.has(game)||Object.getPrototypeOf(game)!==Game.prototype||Game.prototype.importEndlessSave!==preparedEndlessImport||Game.prototype.reset!==preparedEndlessReset||game.importEndlessSave!==preparedEndlessImport)return false;
      for(const key of [...SAVE_FIELDS,'strategy','level','events']){
        const descriptor=Object.getOwnPropertyDescriptor(game,key);
        if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||descriptor.writable!==true)return false;
      }
      return true;
    }catch(_){return false;}
  }
  const preparedEndlessRestores=Object.freeze({
    version:1,
    acceptsDependencies(value){return value===runDirector&&preparedEndlessEnvironmentSafe();},
    acceptsConstructor(value){return value===Game&&Game.prototype.importEndlessSave===preparedEndlessImport&&Game.prototype.reset===preparedEndlessReset&&preparedEndlessEnvironmentSafe();},
    prepare(snapshot){
      try{
        // Older migrations and changed engines retain the original import path.
        const version=snapshot&&Object.getOwnPropertyDescriptor(snapshot,'version');
        if(!version||!Object.prototype.hasOwnProperty.call(version,'value')||version.value!==4||Game.prototype.importEndlessSave!==preparedEndlessImport||Game.prototype.reset!==preparedEndlessReset)return null;
        const proof=preparedEndlessValidationProof();if(!proof)return null;
        const probe=new Game();
        if(!probe.importEndlessSave(snapshot))return false;
        const token=Object.freeze(Object.create(null));preparedEndlessTokens.set(token,{probe,proof});return token;
      }catch(_){return false;}
    },
    describe(token){
      const entry=preparedEndlessTokens.get(token),probe=entry&&entry.probe;if(!probe)return null;
      // Strategy validation needs only these scalar timeline fields. Its copy
      // cannot mutate the private graph that will later become the live Game.
      return {wave:probe.wave,wavesCleared:probe.wavesCleared,nextWaveIn:probe.nextWaveIn,strategy:copySaveData(probe.strategy)};
    },
    commit(game,token){
      const entry=preparedEndlessTokens.get(token),probe=entry&&entry.probe;if(!probe)return false;
      preparedEndlessTokens.delete(token);
      if(!ordinaryPreparedEndlessTarget(game)||!preparedEndlessProofMatches(entry.proof))return false;
      try{
        for(const key of SAVE_FIELDS)game[key]=probe[key];
        plantStatCaches.delete(game);battleIndexes.delete(game);supportIndexes.delete(game);terrainLookups.delete(game);perkWorkspaces.delete(game);contactWorkspaces.delete(game);attackAuraWorkspaces.delete(game);resetFieldAuthority(game);resetActorAuthority(game);
        game.level=ENDLESS;game.endlessWave=probe.endlessWave;game.status='paused';game.events=[];game.strategy=probe.strategy;
        return true;
      }catch(_){return false;}
    }
  });
  return {Game, preparedEndlessRestores, PLANTS, ENEMIES, LEVELS, ENDLESS, ENDLESS_GROWTH_RATES, ENDLESS_BOARD_SIZES, MAPS, TERRAIN_TILES, getEndlessWave, getEndlessMap, ANIMATION_TIMING, DECK_SIZE, DEFAULT_DECK, PLANT_PERK_LEVELS};
});
