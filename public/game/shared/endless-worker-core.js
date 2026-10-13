/* The worker owns one endless Game. Clock debt, commands and engine events stay
 * ordered independently of the main thread's paint cadence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GardenEndlessWorkerCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const METHODS=new Set(['place','shovel','collectSun','upgradePlant','setEndlessGrowthRate','togglePause','pause']);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function copy(value,seen=new Map()){
    if(value===null||typeof value!=='object'){
      if(typeof value==='function'||typeof value==='symbol')throw Error('Worker state must contain data only');
      return value;
    }
    if(seen.has(value))return seen.get(value);
    if(value instanceof Set){const result=new Set();seen.set(value,result);for(const item of value)result.add(copy(item,seen));return result;}
    if(value instanceof Map){const result=new Map();seen.set(value,result);for(const [key,item]of value)result.set(copy(key,seen),copy(item,seen));return result;}
    const result=Array.isArray(value)?new Array(value.length):{};seen.set(value,result);
    for(const key of Object.keys(value)){
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!own(descriptor,'value'))throw Error('Worker state accessors are not supported');
      Object.defineProperty(result,key,{value:copy(descriptor.value,seen),writable:true,enumerable:true,configurable:true});
    }
    return result;
  }
  function copyJournal(value){
    // Legal engine journals are usually flat data. Still detach every entry;
    // nested values and unusual objects retain the strict recursive path.
    if(!value||typeof value!=='object'||Array.isArray(value))return copy(value);
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null)return copy(value);
    const result={};
    for(const key of Object.keys(value)){
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!own(descriptor,'value'))return copy(value);
      const item=descriptor.value;
      if(item!==null&&(typeof item==='object'||typeof item==='function'||typeof item==='symbol'))return copy(value);
      // Preserve own keys even when a prototype has an inherited setter.
      if(key in result)Object.defineProperty(result,key,{value:item,writable:true,enumerable:true,configurable:true});
      else result[key]=item;
    }
    return result;
  }
  function stateData(game){
    const state={};
    for(const key of Object.keys(game))if(key!=='events'&&key!=='level'){
      const descriptor=Object.getOwnPropertyDescriptor(game,key);
      if(!descriptor||!own(descriptor,'value'))throw Error('Worker state accessors are not supported');
      Object.defineProperty(state,key,{value:descriptor.value,writable:true,enumerable:true,configurable:true});
    }
    return state;
  }
  function cloneState(game){return copy(stateData(game));}
  // Native Worker delivery owns a fresh, writable data graph. This capability
  // is separate from native output cloning: injected/public callers keep both
  // input copies. Unknown containers and aliases into the enclosing packet
  // retain the original normalization and detachment path in its entirety.
  function nativeOwnedMessageState(message){
    try{
    const stateNodes=new Set(),otherNodes=new Set();let remaining=2000000;
    function visit(value,nodes,forbidden,depth){
      if(--remaining<0||depth>64)return false;
      if(value===null||typeof value!=='object')return typeof value!=='function'&&typeof value!=='symbol';
      if(forbidden&&forbidden.has(value))return false;
      if(nodes.has(value))return true;
      nodes.add(value);
      const proto=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value);
      if(proto===Set.prototype||proto===Map.prototype){
        // Native clone does not preserve custom container properties. The
        // original recursive copy also discards them, so do not adopt any.
        if(keys.length)return false;
        if(proto===Set.prototype){for(const item of Set.prototype.values.call(value))if(!visit(item,nodes,forbidden,depth+1))return false;}
        else for(const [key,item]of Map.prototype.entries.call(value))if(!visit(key,nodes,forbidden,depth+1)||!visit(item,nodes,forbidden,depth+1))return false;
        return true;
      }
      const array=Array.isArray(value);
      if(array?proto!==Array.prototype:proto!==Object.prototype)return false;
      for(const key of keys){
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(typeof key!=='string'||!descriptor||!own(descriptor,'value'))return false;
        if(array&&key==='length'){
          if(!descriptor.writable||descriptor.enumerable||descriptor.configurable)return false;
          continue;
        }
        if(!descriptor.writable||!descriptor.enumerable||!descriptor.configurable||!visit(descriptor.value,nodes,forbidden,depth+1))return false;
      }
      return true;
    }
    if(Object.getPrototypeOf(message)!==Object.prototype)return false;
    const state=Object.getOwnPropertyDescriptor(message,'state');
    if(!state||!own(state,'value')||!state.enumerable||!state.writable||!state.configurable||!visit(state.value,stateNodes,null,0)||stateNodes.has(message))return false;
    for(const key of Reflect.ownKeys(message)){
      const descriptor=Object.getOwnPropertyDescriptor(message,key);
      if(typeof key!=='string'||!descriptor||!own(descriptor,'value')||!descriptor.enumerable||!descriptor.writable||!descriptor.configurable)return false;
      if(key!=='state'&&!visit(descriptor.value,otherNodes,stateNodes,0))return false;
    }
    return true;
    }catch(_){return false;}
  }
  function applyRawState(game,raw,engine){return applyRawStateInput(game,raw,engine,false);}
  function applyRawStateInput(game,raw,engine,adopt){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.isEndless!==true||!['playing','paused','lost','won'].includes(raw.status))throw Error('Expected a complete endless worker state');
    const state=adopt?raw:copy(raw),keys=Object.keys(game).filter(key=>key!=='events'&&key!=='level');
    if(!keys.every(key=>own(state,key)))throw Error('Incomplete endless worker state');
    for(const key of ['plants','supports','enemies','projectiles','suns','effects','perkFields','perkActions','mowers'])if(!Array.isArray(state[key]))throw Error('Invalid endless worker arrays');
    if(!(state.wavePlantTypes instanceof Set)||!Number.isSafeInteger(state.simulationTick)||state.simulationTick<0||!Number.isFinite(state.updateRemainder)||state.updateRemainder<0)throw Error('Invalid endless worker clock');
    const blocked=new Set(['__proto__','prototype','constructor']);
    for(let proto=Object.getPrototypeOf(game);proto&&proto!==Object.prototype;proto=Object.getPrototypeOf(proto))for(const key of Object.getOwnPropertyNames(proto))if(typeof Object.getOwnPropertyDescriptor(proto,key).value==='function')blocked.add(key);
    for(const key of Object.keys(state)){
      if(key==='events'||key==='level')continue;
      if(blocked.has(key))throw Error('Invalid endless worker state key');
      Object.defineProperty(game,key,{value:state[key],writable:true,enumerable:true,configurable:true});
    }
    game.events=[];game.level=engine.ENDLESS;
    if(game.endlessWave)Object.freeze(game.endlessWave);
    return game;
  }
  function create(options){
    options=options||{};
    const engine=options.engine;
    if(!engine||typeof engine.Game!=='function')throw Error('Endless worker needs GardenEngine');
    const now=options.now||(()=>performance.now()),schedule=options.schedule||((callback,delay)=>setTimeout(callback,delay)),cancel=options.cancel||clearTimeout,post=options.postMessage;
    if(typeof post!=='function')throw Error('Endless worker needs postMessage');
    // Only the browser entry opts in: native postMessage synchronously clones
    // these references before returning. Injected/public senders stay isolated.
    const trustedNativePost=options.trustedNativePostMessage===true;
    const partitionDescriptor=trustedNativePost?Object.getOwnPropertyDescriptor(options,'trustedActorLoopPartitions'):null;
    const trustedActorLoopPartitions=!!(partitionDescriptor&&own(partitionDescriptor,'value')&&partitionDescriptor.value===true);
    // Set only by the closed native entry, whose MessageEvent data is never
    // retained or exposed outside this private core. Output trust alone does
    // not authorize input adoption. Exported applyRawState always copies.
    const trustedNativeInput=trustedNativePost&&options.trustedNativeMessageInput===true;
    // Epoch stamps are accepted only by the native browser entry. A monotonic
    // Window/Worker epoch is timeOrigin + now; their local now origins can differ.
    const epochOrigin=options.clockEpochOrigin!==undefined?options.clockEpochOrigin:(typeof performance!=='undefined'?performance.timeOrigin:NaN);
    const startupClockAvailable=trustedNativePost&&options.trustedStartupClock===true&&Number.isFinite(epochOrigin);
    let startupClockUsed=false,startupClockPending=false,startupWallAt=0,initialElapsed=0,handoffWallSeconds=0,handoffDebtSeconds=0;
    let windowClockNonce=null,windowClockOrigin=0,windowClockStart=0,windowClockAt=0,windowClockReceivedAt=0;
    // Only the real native entry can negotiate this detached, non-pausing export.
    let periodicNonce=null,lastPeriodicId=0;
    function accrueWindow(clock){
      if(!clock||clock.version!==1||clock.nonce!==windowClockNonce||!Number.isFinite(clock.nowMs)||clock.nowMs<windowClockAt||!Number.isFinite(clock.nowMs-windowClockAt))throw Error('Invalid Window monotonic watermark');
      const elapsed=clock.nowMs-windowClockAt;windowClockAt=clock.nowMs;windowClockReceivedAt=time();
      if(clockRunning&&elapsed>0)queue.push({kind:'advance',remaining:elapsed/1000*speed});
      return windowClockAt;
    }
    function epochTime(epoch){
      const at=time(),mapped=epoch-epochOrigin;
      if(!Number.isFinite(epoch)||!Number.isFinite(mapped)||mapped>at+1||at-mapped>60000)throw Error('Invalid startup clock epoch');
      // Browser timestamp rounding may put a stamp <1 ms ahead of its receiver.
      // It never authorizes a future interval, and old stamps cannot rewind debt.
      return Math.min(at,mapped);
    }
    const budget=Number.isFinite(options.sliceBudgetMs)&&options.sliceBudgetMs>0?options.sliceBudgetMs:6;
    const maxBatches=Number.isSafeInteger(options.maxBatches)&&options.maxBatches>0?options.maxBatches:40;
    const frameGap=1000/30,queue=[];
    let game=null,runId=null,stopped=false,timer=null,pumping=false,head=0,wallAt=0,clockRunning=false,speed=1,autoCollect=false,barrierReady=false;
    let packetSeq=0,eventSeq=0,effectSeq=0,ackSeq=0,receivedSeq=0,lastFrameAt=-Infinity,inFlight=0;
    let events=[],effects=[],results=[];
    const packets=new Map();
    // Closed native capability: raw effects/save data never receive metadata.
    // Canonical IDs are monotonic; only live and reliable journal keys stay interned.
    const fxIntern=new Map(),fxRecords=new WeakMap(),fxById=new Map();
    let fxHoldEnabled=false,fxHeld=new Set();
    let fxNonce=null,fxNextId=0,fxBytes=0;
    const FX_MAX_KEYS=4096,FX_MAX_BYTES=2*1024*1024;
    function fxRecord(effect){
      if(!effect||typeof effect!=='object'||Array.isArray(effect))return null;
      const proto=Object.getPrototypeOf(effect);
      if(proto!==Object.prototype&&proto!==null)return null;
      const keys=Object.keys(effect).filter(key=>key!=='age').sort(),values=[],raw={};
      for(const key of keys){
        if(key==='__proto__'||key==='constructor'||key==='prototype')return null;
        const descriptor=Object.getOwnPropertyDescriptor(effect,key);
        if(!descriptor||!own(descriptor,'value'))return null;
        const value=descriptor.value,type=typeof value;
        if(value!==null&&type!=='string'&&type!=='number'&&type!=='boolean'&&type!=='undefined')return null;
        values.push(value);raw[key]=value;
      }
      const key=JSON.stringify(raw),item=fxInternItem(key);
      return item?{keys,values,key:item.key}:null;
    }
    function fxInternItem(key){
      let item=fxIntern.get(key);
      if(!item){
        const bytes=key.length*2;
        if(fxIntern.size>=FX_MAX_KEYS||fxBytes+bytes>FX_MAX_BYTES||fxNextId>=Number.MAX_SAFE_INTEGER)return null;
        item={id:++fxNextId,bytes,key};fxIntern.set(key,item);fxById.set(item.id,item);fxBytes+=bytes;
      }
      return item;
    }
    function fxIdentity(effect,tick){
      const record=fxRecords.get(effect);
      if(!record)return null;
      // Engine changes age only. Unknown shape/value mutation revokes the shortcut.
      const keys=Object.keys(effect).filter(key=>key!=='age');
      if(keys.length!==record.keys.length)return null;
      for(let index=0;index<record.keys.length;index++){
        const descriptor=Object.getOwnPropertyDescriptor(effect,record.keys[index]);
        if(!descriptor||!own(descriptor,'value')||!descriptor.enumerable||!Object.is(descriptor.value,record.values[index]))return null;
      }
      const age=Object.getOwnPropertyDescriptor(effect,'age');
      if(age&&!own(age,'value'))return null;
      const born=(Number(tick)||0)-(Number(age&&age.value)||0)*100;
      if(!Number.isFinite(born))return null;
      const item=fxInternItem(record.key);
      if(!item)return null;
      return {id:item.id,born,key:record.key};
    }
    function fxMetadata(packet){
      if(!fxNonce)return;
      const live=[],journal=[],used=new Set(),allowed=new Set();
      function append(target,effect,tick){
        const identity=fxIdentity(effect,tick);
        if(identity){target.push(identity.id,identity.born);used.add(identity.key);allowed.add(identity.id);}
        else target.push(0,0); // Any zero makes the receiver use its original keys.
      }
      for(const effect of game.effects)append(live,effect,game.simulationTick);
      for(const entry of effects)append(journal,entry.effect,entry.tick);
      // Leases never enlarge the original 4096-key / 2MiB intern budget. A
      // native ACK may retain only IDs exposed by that exact recorded packet.
      const held=[];
      if(fxHoldEnabled)for(const id of fxHeld){
        const item=fxById.get(id);
        if(item){used.add(item.key);allowed.add(id);held.push(id);}
      }
      for(const [key,item] of fxIntern)if(!used.has(key)){fxBytes-=item.bytes;fxIntern.delete(key);fxById.delete(item.id);}
      packet.fxKeyIds={version:1,nonce:fxNonce,packetId:packet.packetId,live,journal};
      if(fxHoldEnabled)Object.assign(packet.fxKeyIds,{holdVersion:1,held});
      return allowed;
    }

    function time(){const value=now();if(!Number.isFinite(value))throw Error('Invalid endless worker clock');return value;}
    function drain(){
      if(!game.events.length)return;
      for(const event of game.events)events.push({seq:++eventSeq,event:copyJournal(event)});
      game.events.length=0;
    }
    function bindGame(raw,adopt){
      const gameOptions={seed:0,trustedAuthoritativeFields:trustedNativePost&&options.trustedAuthoritativeFields===true,trustedAuthoritativeTopology:trustedNativePost&&options.trustedAuthoritativeTopology===true};
      if(trustedActorLoopPartitions)gameOptions.trustedActorLoopPartitions=true;
      game=applyRawStateInput(new engine.Game(gameOptions),raw,engine,adopt===true);
      const effect=game.effect;
      Object.defineProperty(game,'effect',{enumerable:false,configurable:true,value:function(){
        const start=this.effects.length,result=effect.apply(this,arguments);
        for(let index=start;index<this.effects.length;index++){
          const actual=this.effects[index],journal=copyJournal(actual);
          if(fxNonce){const record=fxRecord(actual);if(record){fxRecords.set(actual,record);fxRecords.set(journal,record);}}
          effects.push({seq:++effectSeq,tick:this.simulationTick,effect:journal});
        }
        return result;
      }});
    }
    function accrue(at=time()){
      if(windowClockNonce){wallAt=Math.max(wallAt,at);return at;}
      const elapsed=Math.max(0,at-wallAt);wallAt=Math.max(wallAt,at);
      if(clockRunning&&elapsed>0)queue.push({kind:'advance',remaining:elapsed/1000*speed});
      return at;
    }
    function send(type,requestId){
      drain();
      let debt=0;for(let index=head;index<queue.length;index++)if(queue[index].kind==='advance')debt+=queue[index].remaining;
      const packetId=++packetSeq,packet={type,runId,packetId,id:type==='barrier'||type==='replaced'?requestId:packetId,state:trustedNativePost?stateData(game):cloneState(game),events:trustedNativePost?events:copy(events),effects:trustedNativePost?effects:copy(effects),commandResults:trustedNativePost?results:copy(results),ackSeq,eventThrough:eventSeq,effectThrough:effectSeq,resultThrough:ackSeq,stats:{mode:'worker',model:'authoritative',simulationTick:game.simulationTick,time:game.time,speed,debtSeconds:debt+game.updateRemainder,...(startupClockUsed?{startupClockPending,initialElapsed,handoffWallSeconds,handoffDebtSeconds}:{})}};
      const fxAllowed=fxMetadata(packet);
      if(windowClockNonce){
        packet.windowClock={version:1,nonce:windowClockNonce,nowMs:windowClockAt};
        packet.stats.clockAuthority='window-monotonic';
        packet.stats.windowElapsedSeconds=(windowClockAt-windowClockStart)/1000;
        packet.stats.watermarkAgeMs=Math.max(0,time()-windowClockReceivedAt);
      }
      if(type==='ready'&&periodicNonce)packet.periodicCheckpoint={version:1,nonce:periodicNonce};
      if(type==='barrier'||type==='replaced')packet.requestId=requestId;
      packets.set(packetId,{eventThrough:eventSeq,effectThrough:effectSeq,resultThrough:ackSeq,fxAllowed});
      lastFrameAt=time();
      if(type==='frame')inFlight=packetId;
      post(packet);
      return packetId;
    }
    function collect(){
      if(!autoCollect||game.status!=='playing')return;
      const ready=game.suns.filter(sun=>sun.landed&&sun.age>=sun.motionDuration+.35);
      for(const sun of ready){
        // collectSun owns the credit and its original achievement event. This
        // separate journal entry only lets the main thread present the flight.
        const event={type:'autoSunCollect',id:sun.id,x:sun.x,y:sun.y,value:sun.value};
        if(game.collectSun(sun.id).ok)game.events.push(event);
      }
      drain();
    }
    function request(delay=0){
      if(stopped||!game||startupClockPending)return;
      if(timer!==null){if(delay!==0)return;cancel(timer);timer=null;}
      timer=schedule(()=>{timer=null;pump();},delay);
    }
    function fatal(error){
      stop();
      try{post({type:'error',runId,message:error&&error.message?error.message:String(error)});}catch(_){}
    }
    function pause(value){
      if(value){if(game.status==='playing')game.togglePause();}
      else if(game.status==='paused')game.togglePause();
      if(game.status!=='playing'&&!value)clockRunning=false;
      if(!value&&game.status==='playing')barrierReady=false;
      return game.status;
    }
    function execute(item){
      if(item.kind==='command'){
        let result;
        if(!METHODS.has(item.method))result={ok:false,reason:'Unsupported worker command'};
        else if(item.method==='pause')result=pause(item.args[0]===true);
        else result=game[item.method].apply(game,item.args);
        if(item.method==='togglePause'&&game.status!=='playing')clockRunning=false;
        ackSeq=item.seq;results.push({seq:item.seq,method:item.method,result:copy(result)});drain();
      }else if(item.kind==='periodicCheckpoint'){
        // FIFO admitted debt and mutations before this cut are complete. Do not
        // pause admission, retire journals, change frame cadence or borrow live data.
        collect();drain();let snapshot=null,strategy;
        try{snapshot=game.exportEndlessSave();if(snapshot&&game.strategy)strategy=JSON.parse(JSON.stringify(game.strategy));}
        catch(_){snapshot=null;}
        const reply={type:'periodicCheckpoint',runId,requestId:item.id,
          periodicCheckpoint:{version:1,nonce:periodicNonce},snapshot,strategy,
          eventThrough:eventSeq};
        if(windowClockNonce)reply.windowClock={version:1,nonce:windowClockNonce,nowMs:windowClockAt};
        // The native post immediately structured-clones the detached export and
        // save. Ordinary frames retain every event/FX/result and ACK responsibility.
        post(reply);
      }else if(item.kind==='barrier'){
        pause(true);barrierReady=true;collect();send('barrier',item.id);
      }else if(item.kind==='replace'){
        if(!barrierReady||game.status!=='paused'||item.state.status!=='paused')throw Error('Worker replacement requires a completed pause barrier');
        bindGame(item.state,item.adopt===true);clockRunning=false;wallAt=time();send('replaced',item.id);
      }else if(item.kind==='autoCollect')autoCollect=item.enabled;
    }
    function pump(){
      if(stopped||pumping||!game||startupClockPending)return;
      pumping=true;
      try{
        const began=accrue();let batches=0;
        while(head<queue.length){
          const item=queue[head];
          if(item.kind!=='advance'){head++;execute(item);}
          else if(game.status!=='playing'){head++;}
          else{
            const step=Math.min(.05,item.remaining),complete=step===item.remaining;game.update(step);item.remaining-=step;batches++;drain();
            if(complete)head++;
            if(game.status!=='playing'){
              // A strategy reward pauses at its exact engine tick. As in the
              // native loop, the unused part of this playing interval ends.
              clockRunning=false;wallAt=time();
            }
          }
          if(batches>=maxBatches||time()-began>=budget)break;
        }
        if(head===queue.length){queue.length=0;head=0;collect();}
        else if(head>64){queue.splice(0,head);head=0;}
        const at=time();
        if(!inFlight&&at-lastFrameAt>=frameGap&&(clockRunning||events.length||effects.length||results.length))send('frame');
        if(head<queue.length)request(0);
        else if(clockRunning&&windowClockNonce){
          // Window watermarks are the only physics admission clock. With no
          // queued work an in-flight frame needs only input/ACK wakeups; a
          // free frame slot still gets the original 30 Hz heartbeat deadline.
          // Queued debt above always remains a zero-delay catch-up macrotask.
          if(!inFlight)request(Math.max(0,frameGap-(at-lastFrameAt)));
        }
        else if(clockRunning)request(trustedNativePost&&options.adaptiveWakeup===true&&speed>=8?1:8);
        else if(!inFlight&&(events.length||effects.length||results.length))request(Math.max(0,frameGap-(at-lastFrameAt)));
      }catch(error){fatal(error);}finally{pumping=false;}
    }
    function acknowledge(id,metadata){
      const packet=packets.get(id);if(!packet)return;
      // Missing/foreign/malformed/old ACKs cannot silently release an existing
      // lease. Only a complete valid list for a real packet replaces it; [] is
      // the explicit release. Simulation and reliable journal ACK still proceed.
      if(fxHoldEnabled&&metadata&&metadata.version===1&&metadata.holdVersion===1&&
          metadata.nonce===fxNonce&&Array.isArray(metadata.held)&&metadata.held.length<=FX_MAX_KEYS){
        const next=new Set();let valid=!!packet.fxAllowed;
        for(const id of metadata.held){
          if(!Number.isSafeInteger(id)||id<=0||next.has(id)||!packet.fxAllowed||
              !packet.fxAllowed.has(id)||!fxById.has(id)){valid=false;break;}
          next.add(id);
        }
        if(valid)fxHeld=next;
      }
      events=events.filter(entry=>entry.seq>packet.eventThrough);effects=effects.filter(entry=>entry.seq>packet.effectThrough);results=results.filter(entry=>entry.seq>packet.resultThrough);
      for(const key of packets.keys())if(key<=id)packets.delete(key);
      if(inFlight&&inFlight<=id)inFlight=0;
      request(0);
    }
    function stop(){
      stopped=true;fxHeld.clear();startupClockPending=false;if(timer!==null){cancel(timer);timer=null;}queue.length=0;head=0;clockRunning=false;
    }
    function handle(message){
      if(stopped)return;
      try{
        if(!message||typeof message!=='object')throw Error('Invalid endless worker message');
        if(message.type==='init'){
          if(game)throw Error('Endless worker already initialized');
          if(typeof message.runId!=='string'||!message.runId)throw Error('Invalid endless worker run id');
          runId=message.runId;
          const capability=message.fxKeyIds;
          if(trustedNativePost&&capability&&capability.version===1&&typeof capability.nonce==='string'&&capability.nonce.length>0&&capability.nonce.length<=128)fxNonce=capability.nonce;
          fxHoldEnabled=!!fxNonce&&capability.holdVersion===1;
          const periodic=message.periodicCheckpoint;
          if(trustedNativePost&&options.trustedPeriodicCheckpoint===true&&periodic&&periodic.version===1&&typeof periodic.nonce==='string'&&periodic.nonce.length>0&&periodic.nonce.length<=128)periodicNonce=periodic.nonce;
          if(!Number.isFinite(message.speed)||message.speed<=0||message.speed>20)throw Error('Invalid endless worker speed');
          speed=message.speed;autoCollect=message.autoCollectSun===true;bindGame(message.state,trustedNativeInput&&nativeOwnedMessageState(message));wallAt=time();clockRunning=game.status==='playing';
          if(startupClockAvailable&&message.startupClock!==undefined){
            const clock=message.startupClock;
            if(!clock||clock.version!==1||!Number.isFinite(clock.initialElapsed)||clock.initialElapsed<0||clock.initialElapsed>10)throw Error('Invalid startup clock handoff');
            const windowClock=message.windowClock;
            if(windowClock!==undefined){
              if(!windowClock||windowClock.version!==1||typeof windowClock.nonce!=='string'||windowClock.nonce.length<1||windowClock.nonce.length>128||!Number.isFinite(windowClock.origin)||!Number.isFinite(windowClock.anchorMs)||windowClock.anchorMs<0||!Number.isFinite(windowClock.nowMs)||windowClock.nowMs<0||windowClock.anchorMs>windowClock.nowMs+1||windowClock.nowMs-windowClock.anchorMs>60000||!Number.isFinite(clock.epochMs)||clock.epochMs!==windowClock.origin+windowClock.anchorMs)throw Error('Invalid Window monotonic startup clock');
              windowClockNonce=windowClock.nonce;windowClockOrigin=windowClock.origin;
              windowClockStart=windowClockAt=windowClock.anchorMs;windowClockReceivedAt=time();
            }else wallAt=epochTime(clock.epochMs);
            startupWallAt=wallAt;initialElapsed=clock.initialElapsed;startupClockUsed=startupClockPending=true;
            // Standalone callers can transfer one admitted RAF interval. Native
            // instead integrates it before ensure and therefore always sends 0.
            if(clockRunning&&initialElapsed>0)queue.push({kind:'advance',remaining:initialElapsed*speed});
            if(windowClockNonce)accrueWindow(message.windowClock);
          }
          send('ready');request(0);return;
        }
        if(!game)throw Error('Endless worker is not initialized');
        if(message.runId!==undefined&&message.runId!==runId)return;
        if(message.type==='ack'){
          if(windowClockNonce)accrueWindow(message.windowClock);
          acknowledge(message.id,message.fxKeyIds);
          // An already retired/unknown ACK still carries a real Window
          // watermark. Its newly admitted debt must wake a sleeping pump,
          // even though that ACK cannot retire any packet or FX lease.
          if(windowClockNonce&&timer===null&&head<queue.length)request(0);
          return;
        }
        if(message.type==='stop'){stop();return;}
        if(message.type==='clockCommit'&&startupClockUsed){
          if(!startupClockPending)return; // Duplicate commits never admit debt.
          const at=windowClockNonce?accrueWindow(message.windowClock):accrue(epochTime(message.epochMs));
          handoffWallSeconds=Math.max(0,at-(windowClockNonce?windowClockStart:startupWallAt))/1000;
          for(let index=head;index<queue.length;index++)if(queue[index].kind==='advance')handoffDebtSeconds+=queue[index].remaining;
          startupClockPending=false;request(0);return;
        }
        // Before commit every control carries its actual Window admission stamp.
        // FIFO orders the old speed interval ahead of that command / pause.
        if(windowClockNonce)accrueWindow(message.windowClock);
        else accrue(startupClockPending?epochTime(message.startupEpochMs):undefined);
        if(message.type==='clock'&&windowClockNonce){request(0);return;}
        if(message.type==='command'){
          if(!Number.isSafeInteger(message.seq)||message.seq<=0)throw Error('Invalid endless worker command sequence');
          if(message.seq<=receivedSeq){
            // Duplicate commands do not execute again, but their real Window
            // watermark may have admitted debt while the pump was asleep.
            if(windowClockNonce&&timer===null&&head<queue.length)request(0);
            return;
          }
          if(typeof message.method!=='string'||!Array.isArray(message.args))throw Error('Invalid endless worker command');
          if(message.method==='pause'&&typeof message.args[0]!=='boolean')throw Error('Worker pause requires a boolean');
          receivedSeq=message.seq;
          if(message.method==='pause')clockRunning=message.args[0]!==true&&!(game.strategy&&game.strategy.pending);
          else if(message.method==='togglePause')clockRunning=!clockRunning&&!(game.strategy&&game.strategy.pending);
          queue.push({kind:'command',seq:message.seq,method:message.method,args:copy(message.args)});
        }else if(message.type==='speed'){
          if(!Number.isFinite(message.speed)||message.speed<=0||message.speed>20)throw Error('Invalid endless worker speed');
          speed=message.speed;
        }else if(message.type==='autoCollect')queue.push({kind:'autoCollect',enabled:message.enabled===true});
        else if(message.type==='periodicCheckpoint'&&periodicNonce){
          const periodic=message.periodicCheckpoint;
          if(!periodicNonce||!windowClockNonce||!periodic||periodic.version!==1||periodic.nonce!==periodicNonce||!Number.isSafeInteger(message.id)||message.id<=0)throw Error('Invalid periodic checkpoint capability');
          if(message.id<=lastPeriodicId){if(timer===null&&head<queue.length)request(0);return;}
          lastPeriodicId=message.id;queue.push({kind:'periodicCheckpoint',id:message.id});
        }
        else if(message.type==='barrier'){clockRunning=false;queue.push({kind:'barrier',id:message.id});}
        else if(message.type==='replacePaused'){
          const adopt=trustedNativeInput&&nativeOwnedMessageState(message);
          queue.push({kind:'replace',id:message.id,state:adopt?message.state:copy(message.state),adopt});
        }
        else throw Error('Unsupported endless worker message');
        request(0);
      }catch(error){fatal(error);}
    }
    return {handle,stop,get game(){return game;},get stopped(){return stopped;}};
  }
  return {create,cloneState,applyRawState};
});
