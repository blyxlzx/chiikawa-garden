/* Garden achievement book. Events update only their metric's indexed goals.
 * Career progress is independent of battle snapshots and manual save slots. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenAchievements = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'chiikawa-garden-achievements-v1';
  const FORMAT = 'chiikawa-garden-achievements';
  const MAX_VALUE = Number.MAX_SAFE_INTEGER, MAX_BYTES = 65536, QUEUE_LIMIT = 6;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const COUNTERS = Object.freeze(['plants','sun','kills','shots','explosions','mowers','shovels','upgrades','stormShots','healPulses','waterPlants','nights','saves','returns']);
  const MAXIMA = Object.freeze(['endlessWave','challengeWave','growthLevel']);
  const UNIQUE_IDS = Object.freeze({
    clears:Object.freeze(['meadow','picnic','moon','orchard','dusk','fog','festival','finale','ridge','brook','windmill','thicket','ruins','rain','gate','fortress','frost','lanterns','marsh','cliff','storm','citadel','eclipse','laststand']),
    challengeClears:Object.freeze(['vase-1','vase-2','vase-3','bowling-1','bowling-2','bowling-3','conveyor-1','conveyor-2','conveyor-3']),
    plantKinds:Object.freeze(['sunflower','pea','mushroom','mine','cherry','snowpea','repeater','wallnut','jalapeno','rakko','shisa','kani','starfruit','magnet','stormreed','lily','frostlily','guardlily','powerlily','hastelily']),
    maps:Object.freeze(['garden','brook','ruins','frost','marsh','rooftop','lagoon','moonpool','tidal']),
    challenges:Object.freeze(['vase','bowling','conveyor'])
  });
  const UNIQUE = Object.freeze(Object.keys(UNIQUE_IDS));
  const METRICS = Object.freeze([...COUNTERS, ...MAXIMA, ...UNIQUE]);
  const metricSet = new Set(METRICS), counterSet = new Set(COUNTERS), maximumSet = new Set(MAXIMA);
  const uniqueAllowed = Object.fromEntries(UNIQUE.map(key => [key, new Set(UNIQUE_IDS[key])]));
  const CATEGORIES = Object.freeze([
    {id:'friendship',name:'伙伴贴贴',icon:'badgeFriendship'},
    {id:'sunshine',name:'阳光小金库',icon:'badgeSunshine'},
    {id:'battle',name:'呀哈讨伐队',icon:'badgeBattle'},
    {id:'water',name:'水边散步',icon:'badgeWater'},
    {id:'party',name:'快乐小游戏',icon:'badgeParty'},
    {id:'collection',name:'花园毕业册',icon:'badgeCollection'}
  ].map(Object.freeze));
  // These are original playful titles inspired by the characters and motifs;
  // flavor lines are game copy, never presented as quotations from the anime.
  const recipes = [
    ['friendship','first-friend','呀哈！种下啦','plants',1,'种下第一位伙伴','小小一株，先和花园打个招呼。'],
    ['friendship','little-gardener','除草检定练习生','plants',20,'累计种下 20 位伙伴','认真种植，认真可爱。'],
    ['friendship','garden-exam','除草检定合格！','plants',100,'累计种下 100 位伙伴','今天也把花园照顾得整整齐齐。'],
    ['friendship','crowded-hugs','挤挤！贴贴！','plants',500,'累计种下 500 位伙伴','伙伴来了一批又一批，花园一直很热闹。'],
    ['friendship','trio-reunion','三小只集合','plantKinds',3,'累计种过 3 种伙伴','不同伙伴一起努力，才有花园的样子。'],
    ['friendship','friendship-rollcall','全员点名中','plantKinds',10,'累计种过 10 种伙伴','每一种伙伴都有自己的拿手本领。'],
    ['friendship','everybody-here','一个都不能少','plantKinds',20,'种过全部 20 种伙伴','伙伴名单终于圆满啦！'],
    ['friendship','secondhand-cheer','古本屋的贴心应援','healPulses',100,'触发 100 次伙伴治疗','温柔的应援也能撑起防线。'],
    ['sunshine','sunshine-pocket','口袋里有阳光','sun',250,'累计收集 250 阳光','把亮闪闪的好心情装进口袋。'],
    ['sunshine','hachiware-budget','小八的精打细算','sun',2500,'累计收集 2,500 阳光','一颗一颗攒起来，就有大大的希望。'],
    ['sunshine','ramen-open','郎面摊开张啦','sun',25000,'累计收集 25,000 阳光','花园里的小面摊，今天也元气满满。'],
    ['sunshine','sunshine-feast','点心自由！','sun',250000,'累计收集 250,000 阳光','阳光小金库鼓鼓的，大家一起庆祝吧。'],
    ['sunshine','first-upgrade','变强一点点','upgrades',1,'进行第一次伙伴手动升级','一点点进步，也值得开心很久。'],
    ['sunshine','upgrade-party','变强！再变强！','upgrades',20,'进行 20 次伙伴手动升级','升级按钮旁边，排满了期待的眼神。'],
    ['sunshine','growing-brave','小小的也很强','growthLevel',5,'任一伙伴达到 5 级','小身体里，藏着大大的守护力量。'],
    ['sunshine','hachiware-strength','强强！花园分强','growthLevel',20,'任一伙伴达到 20 级','今天的分强，是花园守护强！'],
    ['battle','tiny-bravery','小小勇气第一步','kills',1,'累计击退 1 位来客','有一点紧张，也有一点勇敢。'],
    ['battle','ya-ha-squad','呀哈讨伐小队','kills',100,'累计击退 100 位来客','呀哈！今天的讨伐工作很顺利。'],
    ['battle','urara-guard','乌拉拉守护队','kills',1000,'累计击退 1,000 位来客','热热闹闹，也稳稳当当。'],
    ['battle','rakko-graduate','海獭师傅点头了','kills',10000,'累计击退 10,000 位来客','师傅看着这道防线，放心地点了点头。'],
    ['battle','pea-chatter','豌豆聊天停不下来','shots',1000,'伙伴累计攻击 1,000 次','嗒嗒嗒，伙伴们说的是守护花园！'],
    ['battle','boom-ya-ha','呀哈！砰砰派对','explosions',50,'累计触发 50 次伙伴爆破','小小引信后面，是一场大大的清场。'],
    ['battle','usagi-circuit','乌萨奇来电啦','stormShots',100,'闪电芦苇累计攻击 100 次','乌拉！电流在伙伴的花园里跳舞。'],
    ['battle','danger-lifeline','危！但还有办法','mowers',1,'触发一次割草车救场','险险接住了，下次早点补上防线。'],
    ['water','lily-first-step','扑通？稳稳站住','waterPlants',1,'在水面种下第一位伙伴','荷叶一晃，小脚丫已经站稳啦。'],
    ['water','lily-raft','荷叶小船出发','waterPlants',25,'累计在水面种下 25 位伙伴','一片片荷叶，连成大家的水上花园。'],
    ['water','water-neighbors','水上邻居贴贴','waterPlants',100,'累计在水面种下 100 位伙伴','水光闪闪，伙伴挤挤，可爱满满。'],
    ['water','weekend-stroll','三站萌萌散步','maps',3,'游玩 3 张不同地图','走过草坪，也想看看远处的风景。'],
    ['water','garden-passport','花园散步护照','maps',6,'游玩 6 张不同地图','每到一处，都盖一个小小的可爱章。'],
    ['water','all-scenery','九种风景都贴贴','maps',9,'游玩全部 9 张地图','晴光、月影、潮池，全都留下了足迹。'],
    ['water','sleepover-first','睡衣派对开场','nights',1,'开始一局夜间讨伐','月亮来了，守护花园的伙伴还醒着。'],
    ['water','sleepover-club','睡衣派对常驻嘉宾','nights',10,'开始 10 局夜间讨伐','夜色温柔，伙伴的防线也很认真。'],
    ['party','mystery-invitation','拟态型？先玩一局','challenges',1,'尝试一种小游戏玩法','神秘的花园邀请函，拆开看看吧。'],
    ['party','all-games','什么都想玩的小八','challenges',3,'尝试全部 3 种小游戏','陶罐、坚果、传送带，一个都想试试。'],
    ['party','first-party-clear','萌萌闯关成功','challengeClears',1,'通关一个小游戏关卡','第一枚小游戏通关贴纸，贴好啦。'],
    ['party','three-party-stickers','三张贴纸贴贴','challengeClears',3,'通关 3 个不同小游戏关卡','闯关的快乐，已经攒成一小叠。'],
    ['party','party-graduation','派对检定全合格','challengeClears',9,'通关全部 9 个小游戏关卡','小小花园游乐场，全部玩明白啦！'],
    ['party','party-endless-five','快乐还没散场','challengeWave',5,'小游戏无尽模式守住 5 波','还有下一轮，大家继续一起玩。'],
    ['party','party-endless-twenty','呀哈！再来亿局','challengeWave',20,'小游戏无尽模式守住 20 波','花园派对的邀请，似乎一直没有尽头。'],
    ['party','party-endless-fifty','派对永动小萌兽','challengeWave',50,'小游戏无尽模式守住 50 波','热闹持续很久，守护也持续很久。'],
    ['collection','garden-first-clear','今天也做到了','clears',1,'通关一个讨伐关卡','把第一次完成，认真贴进花园小册子。'],
    ['collection','six-clear-stamps','攒够六枚小印章','clears',6,'通关 6 个不同讨伐关卡','不知不觉，已经走过了这么多地方。'],
    ['collection','halfway-hugs','半本花园都萌了','clears',12,'通关 12 个不同讨伐关卡','小册子翻到中间，都是努力的印记。'],
    ['collection','garden-full-clear','花园毕业啦！','clears',24,'通关全部 24 个讨伐关卡','大家一起守护过的花园，真漂亮。'],
    ['collection','endless-five','总会有办法的嘛','endlessWave',5,'无尽讨伐守住 5 波','一点点布阵，就一点点走得更远。'],
    ['collection','endless-twenty','小小防线大大安心','endlessWave',20,'无尽讨伐守住 20 波','伙伴在这里，花园就有安心的声音。'],
    ['collection','endless-fifty','呀哈！无尽也萌萌','endlessWave',50,'无尽讨伐守住 50 波','波数变多了，守护花园的心也变强啦。'],
    ['collection','first-save','把今天装进小盒子','saves',1,'成功保存一次手动存档','今天的花园，已经好好收起来了。']
  ];
  const CATALOG = Object.freeze(recipes.map(([category,id,name,metric,target,description,flavor]) => Object.freeze({id,name,description,flavor,category,icon:'achievement-'+id,iconFile:'achievements/individual-v1/'+id+'.png',metric,target})));
  const byId = Object.fromEntries(CATALOG.map(entry => [entry.id, entry]));
  const byMetric = Object.fromEntries(METRICS.map(metric => [metric, CATALOG.filter(entry => entry.metric === metric)]));
  const safeValue = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_VALUE;
  function plain(value) {
    if (!object(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) return false;
    return Object.keys(value).every(key => !['__proto__','constructor','prototype'].includes(key) && own(Object.getOwnPropertyDescriptor(value,key),'value'));
  }
  function blank() { return {format:FORMAT,version:1,stats:Object.fromEntries(METRICS.map(key => [key,0])),sets:Object.fromEntries(UNIQUE.map(key => [key,[]])),unlocked:{},seen:[]}; }
  function decode(raw) {
    if (raw === undefined || raw === null || raw === '') return blank();
    if (typeof raw === 'string') {
      if (raw.length > MAX_BYTES) throw new Error('成就数据过大，原数据已保留。');
      try { raw = JSON.parse(raw); } catch (_) { throw new Error('成就数据无法读取，原数据已保留。'); }
    }
    if (!plain(raw) || Object.keys(raw).length !== 6 || raw.format !== FORMAT || raw.version !== 1 ||
        !plain(raw.stats) || !plain(raw.sets) || !plain(raw.unlocked) || !Array.isArray(raw.seen)) throw new Error('成就数据版本不兼容或已损坏，原数据已保留。');
    if (Object.keys(raw.stats).length > METRICS.length || Object.keys(raw.stats).some(key => !metricSet.has(key) || !safeValue(raw.stats[key])) ||
        Object.keys(raw.sets).length > UNIQUE.length || Object.keys(raw.sets).some(key => !own(uniqueAllowed,key))) throw new Error('成就进度无法读取，原数据已保留。');
    const result = blank();
    for (const key of Object.keys(raw.stats)) result.stats[key] = raw.stats[key];
    for (const key of UNIQUE) {
      const values = own(raw.sets,key) ? raw.sets[key] : [];
      if (!Array.isArray(values) || values.length > UNIQUE_IDS[key].length || new Set(values).size !== values.length || values.some(value => !uniqueAllowed[key].has(value))) throw new Error('成就收集记录无法读取，原数据已保留。');
      result.sets[key] = values.slice();
      if (own(raw.stats,key) && raw.stats[key] !== values.length) throw new Error('成就收集进度不一致，原数据已保留。');
      result.stats[key] = values.length;
    }
    const unlockIds = Object.keys(raw.unlocked);
    if (unlockIds.length > CATALOG.length || unlockIds.some(id => !own(byId,id) || !safeValue(raw.unlocked[id])) ||
        raw.seen.length > CATALOG.length || new Set(raw.seen).size !== raw.seen.length || raw.seen.some(id => typeof id !== 'string' || !own(raw.unlocked,id))) throw new Error('成就解锁记录无法读取，原数据已保留。');
    for (const id of unlockIds) result.unlocked[id] = raw.unlocked[id];
    result.seen = raw.seen.slice();
    return result;
  }
  function create(platform, options) {
    options = options || {};
    const clock = typeof options.now === 'function' ? options.now : Date.now;
    let data = blank(), error = '', dirty = false, revision = 0, elapsed = 0, cache = null, queued = [], folded = 0;
    let sets = {}, seen = new Set();
    function restoreIndexes() { sets = Object.fromEntries(UNIQUE.map(key => [key,new Set(data.sets[key])])); seen = new Set(data.seen); }
    function changed() { revision++; cache = null; }
    function setError(message) { if (error !== message) { error = message; changed(); } }
    function read() {
      if (!platform || typeof platform.getStorageSync !== 'function') throw new Error('成就存储暂不可用。');
      let raw;
      try { raw = platform.getStorageSync(STORAGE_KEY); }
      catch (_) { throw new Error('成就暂不可读取，将稍后重试。'); }
      return decode(raw);
    }
    try { data = read(); } catch (failure) { error = failure.message || '成就数据暂不可读取，原数据已保留。'; }
    restoreIndexes();
    function timestamp() { try { const value = clock(); return Number.isFinite(value) ? Math.max(0,Math.min(MAX_VALUE,Math.floor(value))) : 0; } catch (_) { return 0; } }
    function entryState(entry) { return Object.freeze({...entry,current:Math.min(entry.target,data.stats[entry.metric]),unlocked:own(data.unlocked,entry.id),unlockedAt:own(data.unlocked,entry.id)?data.unlocked[entry.id]:null}); }
    function checkMetric(metric, silent) {
      for (const entry of byMetric[metric]) {
        if (data.stats[metric] < entry.target || own(data.unlocked,entry.id)) continue;
        data.unlocked[entry.id] = timestamp();
        if (silent) seen.add(entry.id);
        else if (queued.length < QUEUE_LIMIT) queued.push(entry.id);
        else folded++;
      }
    }
    function update(metric,value,silent) {
      if (value === data.stats[metric]) return false;
      data.stats[metric] = value; checkMetric(metric,silent); dirty = true; changed(); return true;
    }
    function record(metric,amount) {
      if (!counterSet.has(metric)) return false;
      if (amount === undefined) amount = 1;
      if (!safeValue(amount) || amount === 0) return false;
      return update(metric,Math.min(MAX_VALUE,data.stats[metric] + amount),false);
    }
    function max(metric,value) {
      if (!maximumSet.has(metric) || !safeValue(value)) return false;
      return update(metric,Math.max(data.stats[metric],value),false);
    }
    function uniqueInternal(metric,id,silent) {
      if (!own(uniqueAllowed,metric) || !uniqueAllowed[metric].has(id) || sets[metric].has(id)) return false;
      sets[metric].add(id); return update(metric,sets[metric].size,silent);
    }
    function unique(metric,id) { return uniqueInternal(metric,id,false); }
    function seed(progress) {
      if (!plain(progress)) return false;
      let didChange = false;
      for (const id of UNIQUE_IDS.clears) {
        const entry = progress.clears && own(progress.clears,id) ? progress.clears[id] : null;
        if (entry === true || entry && entry.cleared === true) didChange = uniqueInternal('clears',id,true) || didChange;
      }
      for (const id of UNIQUE_IDS.challengeClears) if (progress.challengeClears && own(progress.challengeClears,id) && progress.challengeClears[id] === true) didChange = uniqueInternal('challengeClears',id,true) || didChange;
      const best = progress.endlessBest && progress.endlessBest.waves;
      if (safeValue(best)) didChange = update('endlessWave',Math.max(data.stats.endlessWave,best),true) || didChange;
      for (const id of UNIQUE_IDS.challenges) {
        const best = progress.challengeBest && own(progress.challengeBest,id) && progress.challengeBest[id] && progress.challengeBest[id].waves;
        if (safeValue(best)) didChange = update('challengeWave',Math.max(data.stats.challengeWave,best),true) || didChange;
      }
      return didChange;
    }
    function getState() {
      if (!cache) {
        const unlocked = Object.keys(data.unlocked).length;
        cache = Object.freeze({entries:Object.freeze(CATALOG.map(entryState)),unlocked,total:CATALOG.length,unseen:unlocked-seen.size,dirty,error,revision});
      }
      return cache;
    }
    function drainUnlocks() {
      const result = queued.map(id => entryState(byId[id]));
      if (result.length && folded) result[result.length-1] = Object.freeze({...result[result.length-1],folded});
      queued = []; folded = 0; return Object.freeze(result);
    }
    function markSeen() {
      let count = 0;
      for (const id of Object.keys(data.unlocked)) if (!seen.has(id)) { seen.add(id); count++; }
      if (count) { dirty = true; changed(); }
      return count;
    }
    // Merge monotonic facts before saving. A second tab can never erase another
    // tab's badges, unique collections or higher records. Numeric career totals
    // use the larger value when independent tabs progress at the same time.
    function merge(previous) {
      let didChange = false;
      for (const key of METRICS) if (!own(uniqueAllowed,key) && previous.stats[key] > data.stats[key]) { data.stats[key] = previous.stats[key]; checkMetric(key,true); didChange = true; }
      for (const key of UNIQUE) for (const id of previous.sets[key]) if (!sets[key].has(id)) { sets[key].add(id); didChange = true; }
      for (const key of UNIQUE) if (sets[key].size !== data.stats[key]) { data.stats[key] = sets[key].size; checkMetric(key,true); }
      for (const id of Object.keys(previous.unlocked)) {
        if (!own(data.unlocked,id)) { data.unlocked[id] = previous.unlocked[id]; didChange = true; }
        else if (previous.unlocked[id] < data.unlocked[id]) { data.unlocked[id] = previous.unlocked[id]; didChange = true; }
      }
      for (const id of previous.seen) if (!seen.has(id)) { seen.add(id); didChange = true; }
      if (didChange) changed();
    }
    function snapshot() { return {format:FORMAT,version:1,stats:{...data.stats},sets:Object.fromEntries(UNIQUE.map(key => [key,Array.from(sets[key])])),unlocked:{...data.unlocked},seen:Array.from(seen)}; }
    // Storage adapters can fail without throwing. Verify all monotonic facts,
    // including the earliest unlock time, before considering progress durable.
    function contains(stored,expected) {
      return METRICS.every(key => stored.stats[key] >= expected.stats[key]) &&
        UNIQUE.every(key => expected.sets[key].every(id => stored.sets[key].includes(id))) &&
        Object.keys(expected.unlocked).every(id => own(stored.unlocked,id) && stored.unlocked[id] <= expected.unlocked[id]) &&
        expected.seen.every(id => stored.seen.includes(id));
    }
    function flush() {
      if (!dirty) return true;
      try {
        merge(read());
        if (!platform || typeof platform.setStorageSync !== 'function') throw new Error('成就存储暂不可用。');
        const saved = snapshot();
        try { platform.setStorageSync(STORAGE_KEY,saved); }
        catch (_) { throw new Error('成就暂未保存，将稍后重试。'); }
        const confirmed = read();
        merge(confirmed);
        if (!contains(confirmed,saved)) throw new Error('成就暂未保存，将稍后重试。');
        data = snapshot(); dirty = !contains(confirmed,data); elapsed = 0;
        setError(dirty ? '成就暂未保存，将稍后重试。' : ''); changed(); return !dirty;
      } catch (failure) { setError(failure.message || '成就暂未保存，将稍后重试。'); return false; }
    }
    function tick(dt) {
      if (!dirty || !Number.isFinite(dt) || dt <= 0) return false;
      elapsed += Math.min(60,dt);
      if (elapsed < 5) return false;
      elapsed = 0; return flush();
    }
    return Object.freeze({record,max,unique,seed,getState,getRevision:()=>revision,drainUnlocks,markSeen,flush,tick});
  }
  return Object.freeze({STORAGE_KEY,FORMAT,CATALOG,CATEGORIES,METRICS,UNIQUE_IDS,QUEUE_LIMIT,create});
});
