/* Browser-only worker capability is supplied by the platform. The Game on the
 * main thread remains a read model with immediate, reversible input prediction. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenEndlessWorkerBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';
  const MUTATIONS = ['place', 'shovel', 'collectSun', 'upgradePlant', 'setEndlessGrowthRate'];
  const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
  let nextRun = 0;

  function clone(value, seen) {
    if (!value || typeof value !== 'object') return value;
    seen = seen || new Map();
    if (seen.has(value)) return seen.get(value);
    const result = value instanceof Set ? new Set() : Array.isArray(value) ? [] : {};
    seen.set(value, result);
    if (value instanceof Set) value.forEach(item => result.add(clone(item, seen)));
    else Object.keys(value).forEach(key => {
      if (!UNSAFE.has(key) && typeof value[key] !== 'function') result[key] = clone(value[key], seen);
    });
    return result;
  }

  // Core packets and local engine state contain data only. One native copy avoids
  // rebuilding every actor in JavaScript; public helpers retain their filtering.
  function trustedStateCopy(value) {
    if (typeof global.structuredClone === 'function') {
      try { return global.structuredClone(value); } catch (_) { /* Older host/data: use the portable copy. */ }
    }
    return clone(value);
  }

  function cloneState(game, trusted) {
    const raw = {};
    Object.keys(game).forEach(key => {
      if (key !== 'level' && key !== 'events' && !UNSAFE.has(key) && typeof game[key] !== 'function') raw[key] = game[key];
    });
    return trusted ? trustedStateCopy(raw) : clone(raw);
  }

  function assignRawState(game, raw, engine) {
    Object.keys(raw).forEach(key => {
      if (key !== 'level' && key !== 'events' && !UNSAFE.has(key) && typeof raw[key] !== 'function') game[key] = raw[key];
    });
    if (raw.isEndless && engine && engine.ENDLESS) game.level = engine.ENDLESS;
    else if (engine && engine.LEVELS && raw.levelId !== undefined) {
      const levels = engine.LEVELS;
      game.level = Array.isArray(levels) ? levels.find(level => level.id === raw.levelId) : levels[raw.levelId];
    }
    if (!Array.isArray(game.events)) game.events = [];
    return game;
  }

  function applyRawState(game, raw, engine, trusted) {
    if (!raw || typeof raw !== 'object') throw new Error('Missing worker state');
    return assignRawState(game, trusted ? trustedStateCopy(raw) : clone(raw), engine);
  }

  // Browser packets are already native-cloned into this thread. Plain data can
  // be borrowed after freezing; mutable native containers are never shared with
  // the public Game. Unknown container shapes retain the full-copy path.
  function freezeBorrowableState(raw) {
    const visited = new Map();
    function visit(value, depth) {
      const type = typeof value;
      if (!value || type !== 'object') return type !== 'function' && type !== 'symbol';
      const previous = visited.get(value);
      if (value instanceof Set || value instanceof Map) {
        if (depth !== 1 || previous !== undefined) return false;
        visited.set(value, 3); return true;
      }
      if (previous !== undefined) return previous === 2;
      const proto = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
      // A scalar leaf cannot point back into the current walk. Retain its
      // completed marker for shared aliases, but skip the in-progress write.
      let descending = false;
      for (const key of Object.keys(value)) {
        // Native structuredClone has already converted accessor properties to
        // owned data properties. Primitive actor fields need no recursive call.
        const child = value[key], childType = typeof child;
        if (child && childType === 'object') {
          if (!descending) { visited.set(value, 1); descending = true; }
          if (!visit(child, depth + 1)) return false;
        } else if (childType === 'function' || childType === 'symbol') return false;
      }
      // If a later sibling requires the copy fallback, earlier frozen nodes
      // remain private to this native packet; applyRawState still returns a
      // completely writable independent mirror. No partial borrowed state leaks.
      Object.freeze(value); visited.set(value, 2); return true;
    }
    return visit(raw, 0);
  }

  function assignReadonlyState(game, raw, engine) {
    const borrowed = {};
    for (const key of Object.keys(raw)) {
      if (UNSAFE.has(key)) continue;
      const value = raw[key];
      borrowed[key] = value instanceof Set || value instanceof Map ? trustedStateCopy(value) : value;
    }
    return assignRawState(game, borrowed, engine);
  }

  function create(options) {
    options = options || {};
    const game = options.game, engine = options.engine, platform = options.platform || {};
    if (!game) throw new Error('Worker bridge requires a Game');
    const now = options.now || (() => global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now());
    const schedule = options.schedule || ((fn, delay) => global.setTimeout(fn, delay));
    const cancel = options.cancel || (id => global.clearTimeout(id));
    const timeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10000;
    // Only a native Worker transport may opt in: MessageEvent data was already
    // structured-cloned into this thread and has no sender-owned references.
    const trustedTransport = options.trustedTransport === true;
    const readonlyMirror = trustedTransport && options.readonlyMirror === true;
    const deferFrameAck = trustedTransport && options.deferFrameAck === true;
    const barrierVoidEnabled=readonlyMirror&&deferFrameAck&&options.nativeCheckpointBarrierVoid===true&&options.snapshotState===false&&options.snapshotEffects===false;
    // Private per-instance identity, never sent on the wire or accepted from
    // packet/extra fields. The original public barrier always resolves a copy.
    const barrierVoidToken=barrierVoidEnabled?{}:null;
    const epochOrigin = options.clockEpochOrigin !== undefined ? options.clockEpochOrigin : global.performance && global.performance.timeOrigin;
    const startupClockEnabled = trustedTransport && options.startupClock === true && Number.isFinite(epochOrigin);
    let startupClockPending = false;
    // Native only: admission uses one Window performance.now domain for the
    // entire run. Worker now controls scheduling, never extrapolates physics.
    const windowClockEnabled=startupClockEnabled&&options.windowMonotonicClock===true;
    let windowClockNonce=null,windowClockAnchor=null,windowClockLast=null;
    const periodicEnabled=readonlyMirror&&windowClockEnabled&&options.periodicCheckpoint===true;
    let periodicNonce=null,periodicReady=false,periodicDisabled=false,periodicPending=null;
    function windowStamp(){
      const at=now();
      if(!Number.isFinite(at)||windowClockLast!==null&&at<windowClockLast)throw new Error('Invalid Window monotonic clock');
      windowClockLast=at;return at;
    }
    function epochNow() {
      const value = epochOrigin + now();
      if (!Number.isFinite(value)) throw new Error('Invalid startup handoff clock');
      return value;
    }
    const originals = new Map(), wrappers = new Map(), requests = new Map(), pending = new Map();
    const pendingSunIds = new Set();
    let worker = null, runId = null, status = 'stopped', destroyed = false;
    let seq = 0, ackSeq = 0, requestSeq = 0, packetSeen = 0, eventSeen = 0, effectSeen = 0, resultSeen = 0;
    let latest = null, stats = {}, error = null, lastRejection = null, bootTimer = null, speed = 1, autoCollectSun = false;
    let pausedBarrier = false, resuming = null, journals = [];
    let unlisten = null;
    let mirrorBorrowed = false;
    let pendingFrameAck = null, frameAckTimer = null, acknowledgedThrough = 0;
    const effectShapes = new Map(), frozenEffectKeys = new WeakMap();
    let indexedEffects = null, indexedTick = null, indexedLive = null;
    // Only the native readonly/private-FX pair may negotiate numeric canonical IDs.
    const fxKeyIdsEnabled=readonlyMirror&&options.snapshotEffects===false&&options.fxKeyIds!==false;
    let fxNonce=null,fxView=null,indexedKeyIds=false;
    const fxKnownIds=new Set();let fxRequestedIds=new Set();
    function fxAcknowledgement(id){
      const message={type:'ack',id};
      if(!fxKeyIdsEnabled||!fxNonce)return message;
      const held=new Set();
      for(const entry of journals)if(Number.isSafeInteger(entry.keyId)&&entry.keyId>0&&fxKnownIds.has(entry.keyId))held.add(entry.keyId);
      if(held.size>4096)return message;
      // Register before post: a synchronous native-clone fake may immediately
      // deliver the next packet. Held metadata must have been requested here.
      fxRequestedIds=held;
      message.fxKeyIds={version:1,holdVersion:1,nonce:fxNonce,held:Array.from(held)};
      return message;
    }
    function readFxMetadata(message,packetId,canBorrow){
      fxView=null;invalidateEffectIndex();
      if(!fxKeyIdsEnabled||!canBorrow)return null;
      const metadata=message.fxKeyIds,entries=message.effects||[];
      if(!metadata||metadata.version!==1||metadata.nonce!==fxNonce||metadata.packetId!==packetId||
          !Array.isArray(metadata.live)||!Array.isArray(metadata.journal)||!Array.isArray(entries)||
          metadata.live.length!==latest.effects.length*2||metadata.journal.length!==entries.length*2)return null;
      const active=new Set();
      function valid(values,effects,tickOf,effectOf){
        for(let index=0;index<effects.length;index++){
          const id=values[index*2],born=values[index*2+1],effect=effectOf(effects[index]);
          if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(born)||
              born!==(Number(tickOf(effects[index]))||0)-(Number(effect&&effect.age)||0)*100)return false;
          active.add(id);if(active.size>4096)return false;
        }
        return true;
      }
      if(!valid(metadata.live,latest.effects,()=>latest.simulationTick,effect=>effect)||
          !valid(metadata.journal,entries,entry=>entry&&entry.tick,entry=>entry&&entry.effect))return null;
      if(metadata.holdVersion!==undefined){
        if(metadata.holdVersion!==1||!Array.isArray(metadata.held)||metadata.held.length>4096)return null;
        const unique=new Set();
        for(const id of metadata.held){
          if(!Number.isSafeInteger(id)||id<=0||unique.has(id)||!fxKnownIds.has(id)||!fxRequestedIds.has(id))return null;
          unique.add(id);active.add(id);if(active.size>4096)return null;
        }
      }
      // Known IDs are bounded by this packet plus the latest explicit request.
      // Unknown journals retain canonical keys; they never gain a guessed ID.
      const known=new Set(active);
      for(const id of fxRequestedIds){known.add(id);if(known.size>4096)return null;}
      fxKnownIds.clear();for(const id of known)fxKnownIds.add(id);
      fxView={source:latest.effects,live:metadata.live,journal:metadata.journal,active};return fxView;
    }


    function invalidateEffectIndex() { indexedEffects = indexedTick = indexedLive = null; indexedKeyIds = false; }

    function writableMirror() {
      if (!mirrorBorrowed) return;
      // Copy the current view, preserving a caller's scalar edits. The private
      // frozen authority stays unchanged until its next native Worker packet.
      assignRawState(game, cloneState(game, true), engine);
      mirrorBorrowed = false;
      invalidateEffectIndex();
    }

    function active() { return !destroyed && ['starting', 'running', 'paused'].includes(status); }
    function state() {
      return Object.assign({}, stats, {status, active:active(), pending:status === 'starting' || requests.size > 0,
        failed:status === 'failed', destroyed, runId, ackSeq, lastCommandSeq:seq,
        pendingFrameAck:deferFrameAck ? pendingFrameAck : null,
        pendingCommands:pending.size, error:error && error.message || null, lastRejection:clone(lastRejection),
        mode:active() ? 'worker' : 'local', model:active() ? 'authoritative' : 'local',
        tickHz:100, snapshotHz:30, speed,
        simulationTick:active() && latest ? latest.simulationTick : game.simulationTick,
        time:active() && latest ? latest.time : game.time, debtSeconds:active() ? Number(stats.debtSeconds) || 0 : 0});
    }
    function timer(fn) {
      if (!(timeout > 0)) return null;
      const id = schedule(fn, timeout);
      if (id && typeof id.unref === 'function') id.unref();
      return id;
    }
    function clearTimer(id) { if (id !== null && id !== undefined) cancel(id); }
    function notify(name, value) { if (typeof options[name] === 'function') options[name](value); }
    function detach() {
      startupClockPending = false;
      periodicNonce=null;periodicReady=false;periodicDisabled=false;periodicPending=null;
      windowClockNonce=windowClockAnchor=windowClockLast=null;
      clearFrameAck();
      clearTimer(bootTimer); bootTimer = null;
      if (unlisten) { unlisten(); unlisten = null; }
      const previous = worker; worker = null;
      if (previous && typeof previous.terminate === 'function') previous.terminate();
    }
    function restoreMethods() {
      wrappers.forEach((wrapper, method) => {
        if (game[method] !== wrapper) return;
        const original = originals.get(method);
        if (original.own) game[method] = original.fn;
        else delete game[method];
      });
      wrappers.clear(); originals.clear();
    }
    function rejectRequests(reason) {
      requests.forEach(request => { clearTimer(request.timer); request.reject(reason); }); requests.clear();
      pending.forEach(command => { if (command.reject) command.reject(reason); }); pending.clear(); pendingSunIds.clear();
    }
    function failure(reason) {
      if (!active()) return;
      error = reason instanceof Error ? reason : new Error(String(reason || 'Simulation worker failed'));
      if (latest) applyRawState(game, latest, engine, true);
      mirrorBorrowed = false;
      if (game.status === 'playing') game.status = 'paused';
      status = 'failed'; pausedBarrier = false; resuming = null;
      detach(); restoreMethods(); rejectRequests(error);
      notify('onFailure', {error, state:cloneState(game, true), authoritativeState:trustedStateCopy(latest)});
    }
    function post(message) {
      if (!worker) return false;
      try {
        const outgoing = Object.assign({runId}, message);
        if(windowClockNonce&&message.type!=='stop'){
          const at=windowStamp();
          outgoing.windowClock=message.type==='init'
            ?{version:1,nonce:windowClockNonce,origin:epochOrigin,anchorMs:windowClockAnchor,nowMs:at}
            :{version:1,nonce:windowClockNonce,nowMs:at};
        }else{
          if (startupClockPending && !['init','ack','stop','clockCommit'].includes(message.type)) outgoing.startupEpochMs = epochNow();
          if (message.type === 'clockCommit' && startupClockEnabled) outgoing.epochMs = epochNow();
        }
        worker.postMessage(outgoing); return true;
      }
      catch (reason) { failure(reason); return false; }
    }
    function clearFrameAck() {
      clearTimer(frameAckTimer); frameAckTimer = null; pendingFrameAck = null;
    }
    function acknowledgePacket(id) {
      if (!deferFrameAck) return post(fxAcknowledgement(id));
      // A higher ACK retires its complete journal prefix in the core. Record it
      // before posting so a synchronous custom native-clone adapter cannot reenter
      // this callback and issue the same acknowledgement twice.
      if (id <= acknowledgedThrough) return false;
      acknowledgedThrough = id;
      if (pendingFrameAck !== null && pendingFrameAck <= id) clearFrameAck();
      return post(fxAcknowledgement(id));
    }
    function acknowledgeFrame() {
      if (!deferFrameAck || pendingFrameAck === null || !active()) return false;
      return acknowledgePacket(pendingFrameAck);
    }
    function retirePacket(message, id) {
      if (!deferFrameAck || message.type !== 'frame') return acknowledgePacket(id);
      clearFrameAck(); pendingFrameAck = id;
      const generation = runId;
      // Hidden pages, paused menus, autoStart:false and a failed paint may not
      // consume another frame. Keep their snapshot stream alive without changing
      // the independent authoritative simulation clock.
      frameAckTimer = schedule(() => {
        if (runId === generation && pendingFrameAck === id) acknowledgeFrame();
      }, 100);
      if (frameAckTimer && typeof frameAckTimer.unref === 'function') frameAckTimer.unref();
    }
    function command(method, args, prediction, wait) {
      if (!active()) return wait ? Promise.resolve(null) : false;
      const commandSeq = ++seq;
      let promise;
      const entry = {seq:commandSeq, method, prediction};
      if (method === 'collectSun') { entry.sunId = args[0]; pendingSunIds.add(entry.sunId); }
      if (wait) promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      pending.set(commandSeq, entry);
      if (!post({type:'command', seq:commandSeq, method, args:clone(args)})) {
        pending.delete(commandSeq);
        if (method === 'collectSun') pendingSunIds.delete(entry.sunId);
      }
      return wait ? promise : true;
    }
    function request(type, extra, responseToken) {
      if (!active()) return Promise.reject(error || new Error('Simulation worker is not active'));
      const id = ++requestSeq;
      return new Promise((resolve, reject) => {
        const entry = {type, resolve, reject, timer:null, responseToken};
        entry.timer=timer(()=>{
          if(type!=='periodicCheckpoint'){failure(new Error('Simulation worker '+type+' timed out'));return;}
          // A timed-out automatic export must not pause a healthy battle or add
          // another queued export. Disable this capability for the rest of the run.
          periodicReady=false;periodicDisabled=true;requests.delete(id);
          reject(new Error('Periodic checkpoint timed out'));
        });
        requests.set(id, entry);
        post(Object.assign({type, id}, extra));
      });
    }
    function installMethods() {
      MUTATIONS.concat('togglePause').forEach(method => {
        if (typeof game[method] !== 'function') return;
        const original = {fn:game[method], own:Object.prototype.hasOwnProperty.call(game, method)};
        originals.set(method, original);
        const wrapper = function () {
          const args = Array.from(arguments);
          if (!active()) return original.fn.apply(game, args);
          // The first accepted collection owns this id until its authority ACK.
          // Reject retries before prediction so they can never credit it twice.
          if (method === 'collectSun' && pendingSunIds.has(args[0])) return {ok:false};
          writableMirror();
          const before = game.status, eventLength = game.events.length;
          const predicted = original.fn.apply(game, args);
          // Only worker events may grant durable rewards or trigger event audio.
          game.events.splice(eventLength);
          if (method !== 'togglePause') {
            // A visibly rejected click must not become a later successful action
            // when an older worker timeline eventually reaches the command.
            if (predicted !== false && !(predicted && predicted.ok === false)) command(method, args, predicted, false);
          }
          else if (before === 'playing' && game.status === 'paused') {
            pausedBarrier = false; command('pause', [true], predicted, false);
          } else if (before === 'paused' && game.status === 'playing') {
            const raw = cloneState(game, true);
            resume(raw).catch(() => {});
          }
          return predicted;
        };
        wrappers.set(method, wrapper); game[method] = wrapper;
      });
    }
    function takeJournals(message) {
      const events = [], effects = [], results = [];
      (message.events || []).forEach(entry => {
        if (!entry || !Number.isSafeInteger(entry.seq) || entry.seq <= eventSeen) return;
        eventSeen = entry.seq; const event = clone(entry.event); events.push(event); game.events.push(event);
      });
      const exposeEffects = options.snapshotEffects !== false;
      const ownIncomingEffects = readonlyMirror && !exposeEffects;
      const receivedAt = now();
      let fxIndex = -1;
      for (const entry of message.effects || []) {
        fxIndex++;
        if (!entry || !Number.isSafeInteger(entry.seq) || entry.seq <= effectSeen) continue;
        effectSeen = entry.seq;
        // Native MessageEvent already owns this graph. With explicit callback
        // opt-out no external reference can mutate our private journal. Public
        // transient results still receive an independent copy on every call.
        const value = ownIncomingEffects ? {seq:entry.seq, tick:entry.tick, effect:entry.effect} : clone(entry);
        if (exposeEffects) effects.push(value);
        journals.push(Object.assign(value, {receivedAt, firstPresentedAt:null,
          key:fxView ? null : effectKey(value.effect, readonlyMirror), keyId:fxView ? fxView.journal[fxIndex * 2] : null, born:(Number(value.tick) || 0) - (Number(value.effect && value.effect.age) || 0) * 100}));
      }
      (message.commandResults || []).forEach(result => {
        if (!result || !Number.isSafeInteger(result.seq) || result.seq <= resultSeen) return;
        resultSeen = result.seq; const value = clone(result); results.push(value);
        const entry = pending.get(result.seq);
        if (value.result === false || value.result && value.result.ok === false) {
          lastRejection = {seq:value.seq, method:value.method || entry && entry.method, reason:value.result && value.result.reason || '操作未被战斗状态接受'};
          notify('onRejection', clone(lastRejection));
        }
        if (entry && entry.resolve) entry.resolve(value.result);
      });
      return {events, effects, commandResults:results};
    }
    function validState(raw) {
      if (!raw || raw.isEndless !== true || !['playing','paused','lost','won'].includes(raw.status) ||
          !Number.isFinite(raw.time) || !Number.isSafeInteger(raw.simulationTick) || raw.simulationTick < 0 ||
          !Number.isFinite(raw.updateRemainder) || raw.updateRemainder < 0 || !(raw.wavePlantTypes instanceof Set)) return false;
      if (!['plants','supports','enemies','projectiles','suns','effects','perkFields','perkActions','mowers'].every(key => Array.isArray(raw[key]))) return false;
      return !latest || Object.keys(latest).every(key => Object.prototype.hasOwnProperty.call(raw, key));
    }
    function receive(event) {
      // Native MessageEvent.data may lazily deserialize the structured clone.
      // Read it once, while retaining the custom transport's bare-packet form.
      const data = event && event.data;
      const message = event && data !== undefined ? data : event;
      if (!active() || !message) return;
      // A worker import/CSP failure can happen before its init message is read.
      if (message.type === 'error' && status === 'starting' && message.runId == null) {
        failure(new Error(message.message || 'Simulation worker startup failed')); return;
      }
      if (message.runId !== runId) return;
      if (message.type === 'error') { failure(new Error(message.message || 'Simulation worker failed')); return; }
      if(message.type==='periodicCheckpoint'){
        const entry=requests.get(message.requestId),capability=message.periodicCheckpoint,clock=message.windowClock;
        if(!periodicEnabled||!periodicReady||!entry||entry.type!=='periodicCheckpoint')return;
        if(!capability||capability.version!==1||capability.nonce!==periodicNonce||!clock||clock.version!==1||clock.nonce!==windowClockNonce||!Number.isFinite(clock.nowMs)||clock.nowMs<windowClockAnchor||clock.nowMs>now()+1){failure(new Error('Invalid periodic checkpoint handshake'));return;}
        const tick=message.snapshot&&message.snapshot.state&&message.snapshot.state.simulationTick;
        if(!Number.isSafeInteger(message.eventThrough)||message.eventThrough<0||message.snapshot&&(!Number.isSafeInteger(tick)||tick<0)){failure(new Error('Invalid periodic checkpoint cut'));return;}
        // A save reply never supplies render/event state. Wait for the ordinary
        // frame to apply the cut and transfer its event prefix before resolving.
        entry.periodicReply={tick,eventThrough:message.eventThrough,value:message.snapshot?{game:message.snapshot,strategy:message.strategy}:null};
        finishPeriodicCheckpoint();
        return;
      }
      if (!['ready', 'frame', 'barrier', 'replaced'].includes(message.type)) return;
      const packetId = Number.isSafeInteger(message.packetId) ? message.packetId : message.id;
      if (!Number.isSafeInteger(packetId)) { failure(new Error('Missing worker packet id')); return; }
      if (packetId <= packetSeen) {
        // A duplicate of the still-pending frame must wait for the same paint.
        // Earlier packets have already been retired by their own or a higher ACK.
        if (!deferFrameAck) acknowledgePacket(packetId);
        return;
      }
      if (!validState(message.state) || !Number.isSafeInteger(message.ackSeq) || message.ackSeq < ackSeq || message.ackSeq > seq) {
        failure(new Error('Invalid authoritative worker packet')); return;
      }
      if(windowClockNonce){
        const clock=message.windowClock;
        if(!clock||clock.version!==1||clock.nonce!==windowClockNonce||!Number.isFinite(clock.nowMs)||clock.nowMs<windowClockAnchor||clock.nowMs>now()+1){
          failure(new Error('Invalid Window monotonic clock handshake'));return;
        }
      }
      packetSeen = packetId; ackSeq = message.ackSeq;
      latest = trustedTransport ? message.state : trustedStateCopy(message.state);
      const canBorrow = readonlyMirror && freezeBorrowableState(latest);
      stats = clone(message.stats || {});
      const force = message.type === 'barrier' || message.type === 'replaced';
      if (force || ackSeq >= seq) {
        // Pause checkpoints deliberately expose a writable copy: strategy choices
        // can edit rewards, health and XP before replacePaused acknowledges them.
        if (canBorrow && !force) { assignReadonlyState(game, latest, engine); mirrorBorrowed = true; }
        else { applyRawState(game, latest, engine, true); mirrorBorrowed = false; }
      }
      readFxMetadata(message, packetId, canBorrow);
      const additions = takeJournals(message);
      pending.forEach((entry, commandSeq) => {
        if (commandSeq <= ackSeq) {
          if (entry.resolve) entry.resolve(null);
          if (entry.method === 'collectSun') pendingSunIds.delete(entry.sunId);
          pending.delete(commandSeq);
        }
      });
      if (message.type === 'ready') {
        clearTimer(bootTimer); bootTimer = null;
        const capability=message.periodicCheckpoint;
        periodicReady=!!(periodicEnabled&&capability&&capability.version===1&&capability.nonce===periodicNonce);
      }
      status = latest.status === 'playing' ? 'running' : 'paused';
      if (message.type === 'barrier') pausedBarrier = latest.status === 'paused';
      if (message.type === 'replaced') pausedBarrier = latest.status === 'paused';
      const requestId = message.requestId === undefined ? message.id : message.requestId;
      const entry = requests.get(requestId);
      if (entry && (message.type === entry.type || entry.type === 'replacePaused' && message.type === 'replaced')) {
        requests.delete(requestId); clearTimer(entry.timer); entry.resolve(barrierVoidEnabled&&entry.type==='barrier'&&entry.responseToken===barrierVoidToken?undefined:trustedStateCopy(latest));
      }
      // Initial ready is a handshake, not permission to simulate past a pause
      // queued during script loading. Same-sender FIFO places those controls
      // before this commit. Normal ready / frame ACK rules remain unchanged.
      if (message.type === 'ready' && startupClockPending) {
        startupClockPending = false;
        if (message.stats && message.stats.startupClockPending === true && !post({type:'clockCommit'})) return;
      }
      // Journals have been copied into main-thread ownership before ACK retires them.
      retirePacket(message, packetId);
      try {
        if (typeof options.onSnapshot === 'function') {
          const snapshot = Object.assign({ackSeq, status, simulationTick:message.simulationTick}, additions);
          if (options.snapshotState !== false) snapshot.state = trustedStateCopy(latest);
          notify('onSnapshot', snapshot);
        }
      }
      catch (reason) { failure(reason); }
      // Call after the original synchronous snapshot callback. Event-triggered
      // barriers can invalidate Native's pending automatic write before its then.
      finishPeriodicCheckpoint();
    }
    function start(settings) {
      settings = settings || {};
      if (destroyed || active() || status === 'failed' || !game.isEndless || !['playing', 'paused'].includes(game.status) || typeof platform.createSimulationWorker !== 'function') return active();
      speed = Number.isFinite(settings.speed) && settings.speed > 0 && settings.speed <= 20 ? settings.speed : speed;
      autoCollectSun = settings.autoCollectSun === undefined ? autoCollectSun : !!settings.autoCollectSun;
      runId = 'endless-' + (++nextRun); seq = ackSeq = requestSeq = packetSeen = eventSeen = effectSeen = resultSeen = 0;
      clearFrameAck(); acknowledgedThrough = 0;
      let handoffEpoch = null, handoffClockFailure = null;
      try {
        if (startupClockEnabled) {
          const currentEpoch = epochNow(), supplied = settings.handoffEpochMs;
          // Native can supply the already integrated RAF's exact endpoint.
          // Missing / foreign clock forms keep the v1 startup anchor; neither
          // a future stamp nor an absolute Date.now used as relative time is debt.
          handoffEpoch = Number.isFinite(supplied) && supplied <= currentEpoch + 1 && currentEpoch - supplied <= 60000 ? Math.min(currentEpoch, supplied) : currentEpoch;
        }
      }
      catch (reason) { handoffClockFailure = reason; }
      startupClockPending = false;
      periodicNonce=null;periodicReady=false;periodicDisabled=false;periodicPending=null;
      windowClockNonce=windowClockAnchor=windowClockLast=null;
      if(windowClockEnabled&&!handoffClockFailure){
        windowClockNonce=runId+':window-monotonic-v1';
        windowClockAnchor=handoffEpoch-epochOrigin;
      }
      latest = cloneState(game, true); stats = {}; error = lastRejection = null; journals = []; pausedBarrier = false;
      fxView = null; fxKnownIds.clear(); fxRequestedIds.clear(); effectShapes.clear(); invalidateEffectIndex();
      mirrorBorrowed = false;
      status = 'starting';
      try {
        if (handoffClockFailure) throw handoffClockFailure;
        worker = platform.createSimulationWorker();
        if (!worker || typeof worker.postMessage !== 'function') throw new Error('Worker factory did not return a Worker');
        const onError = event => failure(new Error(event && event.message || 'Simulation worker failed'));
        if (typeof worker.addEventListener === 'function') {
          worker.addEventListener('message', receive); worker.addEventListener('error', onError); worker.addEventListener('messageerror', onError);
          const current = worker;
          unlisten = () => { current.removeEventListener('message', receive); current.removeEventListener('error', onError); current.removeEventListener('messageerror', onError); };
        } else {
          worker.onmessage = receive; worker.onerror = onError; worker.onmessageerror = onError;
          const current = worker;
          unlisten = () => { current.onmessage = current.onerror = current.onmessageerror = null; };
        }
        installMethods(); bootTimer = timer(() => failure(new Error('Simulation worker startup timed out')));
        const init = {type:'init', state:trustedStateCopy(latest), speed, autoCollectSun};
        periodicNonce=periodicEnabled?runId+':periodic-checkpoint-v1':null;
        if(periodicNonce)init.periodicCheckpoint={version:1,nonce:periodicNonce};
        fxNonce = fxKeyIdsEnabled ? runId + ':fx-keyids-v1' : null;
        if (fxNonce) init.fxKeyIds = {version:1, holdVersion:1, nonce:fxNonce};
        if (startupClockEnabled) {
          const elapsed = settings.initialElapsed === undefined ? 0 : settings.initialElapsed;
          if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 10) throw new Error('Invalid initial RAF interval');
          init.startupClock = {version:1, epochMs:handoffEpoch, initialElapsed:elapsed};
          startupClockPending = true;
        }
        post(init);
      } catch (reason) { failure(reason); }
      return active();
    }
    function ensure(settings) {
      if (active()) {
        if (settings && settings.speed !== undefined && settings.speed !== speed) setSpeed(settings.speed);
        if (settings && settings.autoCollectSun !== undefined && !!settings.autoCollectSun !== autoCollectSun) setAutoCollectSun(settings.autoCollectSun);
        // Every real RAF calls ensure, independently of Worker packet delivery.
        if(windowClockNonce&&!post({type:'clock'}))return false;
        return true;
      }
      return start(settings);
    }
    function setSpeed(value) {
      if (!Number.isFinite(value) || value <= 0 || value > 20) return false;
      speed = value; return active() ? post({type:'speed', speed}) : true;
    }
    function setAutoCollectSun(value) {
      autoCollectSun = !!value; return active() ? post({type:'autoCollect', enabled:autoCollectSun}) : true;
    }
    function finishPeriodicCheckpoint(){
      if(!periodicEnabled||!periodicReady||!active())return;
      for(const [id,entry]of requests){
        const reply=entry.type==='periodicCheckpoint'&&entry.periodicReply;
        if(!reply)continue;
        // ackSeq<seq deliberately preserves a predicted writable mirror. That
        // mirror may not run state-dependent event side effects for a newer cut.
        if(reply.value&&(!latest||ackSeq<seq||latest.simulationTick<reply.tick||game.simulationTick<reply.tick||eventSeen<reply.eventThrough))return;
        requests.delete(id);clearTimer(entry.timer);entry.resolve(reply.value);return;
      }
    }
    function capturePeriodicCheckpoint(){
      if(periodicDisabled)return Promise.resolve(null);
      if(!active()||!periodicReady||!windowClockNonce)return null;
      if(periodicPending)return periodicPending;
      const operation=request('periodicCheckpoint',{periodicCheckpoint:{version:1,nonce:periodicNonce}});
      const owned=operation.finally(()=>{if(periodicPending===owned)periodicPending=null;});
      periodicPending=owned;return owned;
    }
    function barrierVoid() {
      if (!active()) {
        if (game.status === 'playing') game.status = 'paused';
        return Promise.resolve();
      }
      return request('barrier',undefined,barrierVoidToken);
    }
    function barrier() {
      if (!active()) {
        if (game.status === 'playing') game.status = 'paused';
        return Promise.resolve(cloneState(game, true));
      }
      return request('barrier');
    }
    function resume(raw) {
      if (destroyed) return Promise.resolve(false);
      if (status === 'failed') {
        // Explicit user recovery may restart; automatic ensure never retries failure.
        status = 'stopped'; error = null;
        if (game.status === 'paused' && !(game.strategy && game.strategy.pending)) game.status = 'playing';
        return Promise.resolve(start({speed, autoCollectSun}));
      }
      if (!active()) return Promise.resolve(false);
      if (resuming) return resuming;
      const resumeRun = runId;
      function checkRun() {
        if (!active() || runId !== resumeRun) throw new Error('Simulation worker resume was cancelled');
      }
      const supplied = raw ? cloneState(raw, true) : null;
      const alreadyPaused = pausedBarrier && latest && latest.status === 'paused' && pending.size === 0;
      const operation = (alreadyPaused ? Promise.resolve() : barrier()).then(() => {
        checkRun();
        const replacement = alreadyPaused && supplied ? supplied : cloneState(game, true);
        replacement.status = 'paused';
        return request('replacePaused', {state:replacement});
      }).then(() => {
        checkRun();
        if (game.strategy && game.strategy.pending) return false;
        pausedBarrier = false; game.status = 'playing';
        return command('pause', [false], 'playing', true).then(result => !(result === false || result && result.ok === false));
      }).finally(() => { if (resuming === operation) resuming = null; });
      resuming = operation;
      return resuming;
    }
    function stop() {
      if (worker) post({type:'stop'});
      writableMirror();
      detach(); restoreMethods(); rejectRequests(new Error('Simulation worker stopped'));
      status = 'stopped'; pausedBarrier = false; resuming = null; journals = [];
      fxView = null; fxKnownIds.clear(); fxRequestedIds.clear(); effectShapes.clear(); invalidateEffectIndex();
      return true;
    }
    function destroy() { stop(); destroyed = true; return true; }

    function originalEffectKey(effect) {
      const raw = {};
      Object.keys(effect || {}).sort().forEach(key => { if (key !== 'age') raw[key] = effect[key]; });
      return JSON.stringify(raw);
    }
    function effectKey(effect, owned) {
      // Keep arbitrary custom objects/accessors on the public contract path.
      // Owned native scalar FX reuse one canonical field shell per shape: the
      // exact original sorted-key JSON semantics are unchanged, including JSON
      // omission of undefined, numeric property ordering and nonfinite values.
      if (!readonlyMirror || !owned || !effect || typeof effect !== 'object' || Array.isArray(effect)) return originalEffectKey(effect);
      const keys = Object.keys(effect), id = keys.join('\u0000');
      let shape = effectShapes.get(id);
      let matches = !!shape && shape.keys.length === keys.length;
      if (matches) for (let index = 0; index < keys.length; index++) if (shape.keys[index] !== keys[index]) { matches = false; break; }
      if (!matches) {
        if (effectShapes.size >= 64) effectShapes.clear();
        const ordered = keys.filter(key => key !== 'age').sort(), raw = {};
        for (const key of ordered) { if (UNSAFE.has(key)) return originalEffectKey(effect); raw[key] = undefined; }
        shape = {keys, ordered, raw}; effectShapes.set(id, shape);
      }
      for (const key of shape.ordered) {
        const value = effect[key], type = typeof value;
        if (value !== null && type !== 'number' && type !== 'string' && type !== 'boolean' && type !== 'undefined') return originalEffectKey(effect);
        shape.raw[key] = value;
      }
      return JSON.stringify(shape.raw);
    }
    function getTransientEffects() {
      if (!active() || !journals.length) return [];
      const at = now(), tick = Number(game.simulationTick) || 0;
      const source = game.effects || [];
      const ownedFrozenLive = readonlyMirror && mirrorBorrowed && latest && source === latest.effects;
      // Negotiated ACK leases keep canonical IDs alive through the main-only
      // presentation journal. Missing/invalid/legacy metadata still revokes the
      // whole numeric view, preserving the original canonical fallback.
      const useKeyIds = !!(ownedFrozenLive && fxView && source === fxView.source &&
        journals.every(entry => entry.keyId !== null && fxView.active.has(entry.keyId)));
      let live = ownedFrozenLive && source === indexedEffects && tick === indexedTick && indexedKeyIds === useKeyIds ? indexedLive : null;
      if (!live) {
        live = new Map();
        let fxIndex = -1;
        for (const effect of source) {
          fxIndex++;
          let key;
          if (useKeyIds) key = fxView.live[fxIndex * 2];
          else if (ownedFrozenLive && frozenEffectKeys.has(effect)) key = frozenEffectKeys.get(effect);
          else { key = effectKey(effect, ownedFrozenLive); if (ownedFrozenLive && effect && typeof effect === 'object') frozenEffectKeys.set(effect, key); }
          const born = useKeyIds ? fxView.live[fxIndex * 2 + 1] : tick - (Number(effect && effect.age) || 0) * 100;
          let births = live.get(key);
          if (!births) { births = []; live.set(key, births); }
          births.push(born);
        }
        if (ownedFrozenLive) { indexedEffects = source; indexedTick = tick; indexedLive = live; indexedKeyIds = useKeyIds; }
        else invalidateEffectIndex();
      }
      const effects = [], retained = [];
      for (const entry of journals) {
        const effect = entry.effect || {}, duration = Number(effect.duration) || 0;
        let represented = false;
        if (!useKeyIds && entry.key === null) entry.key = effectKey(effect, readonlyMirror);
        const births = live.get(useKeyIds ? entry.keyId : entry.key);
        if (births) for (let index = 0; index < births.length; index++) if (Math.abs(births[index] - entry.born) < 0.1) { represented = true; break; }
        if (represented) continue;
        if (entry.firstPresentedAt !== null && at - entry.firstPresentedAt >= Math.max(16, duration / speed * 1000)) continue;
        if (entry.firstPresentedAt === null) entry.firstPresentedAt = at;
        const value = clone(effect);
        value.age = Math.min(Math.max(0, duration - 0.000001), Math.max(0, (at - entry.firstPresentedAt) * speed / 1000));
        effects.push(value); retained.push(entry);
      }
      journals = retained; return effects;
    }
    const api={ensure, start, state, setSpeed, setAutoCollectSun, barrier, resume, stop, destroy,
      getTransientEffects, acknowledgeFrame, getAuthoritativeState:() => trustedStateCopy(latest)};
    if(periodicEnabled)api.capturePeriodicCheckpoint=capturePeriodicCheckpoint;
    if(barrierVoidEnabled)api.barrierVoid=barrierVoid;
    return api;
  }
  return {create, cloneState, applyRawState};
});
