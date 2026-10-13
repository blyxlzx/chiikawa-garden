/* Portable, validated manual save slots. The existing auto-save is separate. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenSaveLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'chiikawa-garden-save-library-v1';
  const FORMAT = 'chiikawa-garden-save-library', FILE_FORMAT = 'chiikawa-garden-save-slot';
  const SLOT_COUNT = 12, LEGACY_SLOT_COUNT = 6, MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const shape = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
  // Reject accessors, unsafe keys and non-JSON data before serialization can run
  // user supplied toJSON/getter code. This also makes all returned data detached.
  function copy(value, budget = {left:2000000}, depth = 0) {
    if (--budget.left < 0 || depth > 24) throw new Error('存档数据过大或嵌套过深。');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length <= MAX_IMPORT_BYTES) return value;
    if (Array.isArray(value)) {
      if (value.length > 20000) throw new Error('存档数组过大。');
      const result = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !own(descriptor, 'value')) throw new Error('存档包含不安全的数组内容。');
        result.push(copy(descriptor.value, budget, depth + 1));
      }
      return result;
    }
    if (!record(value)) throw new Error('存档包含非数据内容。');
    const result = {}, keys = Object.keys(value);
    if (keys.length > 256) throw new Error('存档对象过大。');
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('存档包含不安全的字段。');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value')) throw new Error('存档包含不安全的字段。');
      // Existing engine snapshots may omit optional visual fields in JSON.
      if (descriptor.value !== undefined) result[key] = copy(descriptor.value, budget, depth + 1);
    }
    return result;
  }
  function bytes(text) {
    let length = 0;
    for (const char of text) {
      const point = char.codePointAt(0);
      length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    return length;
  }
  function parse(text, limit) {
    if (typeof text !== 'string' || text.length > limit || bytes(text) > limit) throw new Error('存档文件过大。');
    try { return JSON.parse(text); } catch (_) { throw new Error('存档不是有效的 JSON 文件。'); }
  }
  function encoded(value, limit) {
    const text = JSON.stringify(value);
    if (text.length > limit || bytes(text) > limit) throw new Error('存档文件过大。');
    return text;
  }
  function slotId(id) {
    if (!Number.isInteger(id) || id < 1 || id > SLOT_COUNT) throw new Error('无效的存档位置。');
    return id;
  }
  function nameFor(value, id) {
    if (value === undefined) return '存档 ' + id;
    if (typeof value !== 'string') throw new Error('存档名称必须是文字。');
    return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 20).join('') || '存档 ' + id;
  }
  function summary(checkpoint) {
    const state = checkpoint.game && checkpoint.game.state || {};
    return {
      wave:state.wave || 0, wavesCleared:state.wavesCleared || 0,
      mapId:state.mapId || '', seconds:Math.floor(state.time || 0),
      sun:state.sun || 0, speed:checkpoint.speed || 1,
      growthRate:state.endlessGrowthRate || 'normal', boardSize:state.endlessBoardSize || 'classic'
    };
  }
  function entryInfo(entry) {
    return entry ? {id:entry.id, name:entry.name, savedAt:entry.savedAt, summary:summary(entry.checkpoint)} : null;
  }
  function emptyLibrary() { return {format:FORMAT, version:1, slots:Array(SLOT_COUNT).fill(null)}; }
  function create(options) {
    options = options || {};
    const platform = options.platform, validate = options.validateCheckpoint;
    if (!platform || typeof platform.getStorageSync !== 'function' || typeof platform.setStorageSync !== 'function') throw new Error('存档存储不可用。');
    if (typeof validate !== 'function') throw new Error('缺少存档校验器。');
    let errors = [];
    function checkpoint(value) {
      const detached = copy(value);
      encoded(detached, MAX_IMPORT_BYTES);
      const checked = validate(detached);
      if (!record(checked)) throw new Error('存档校验未通过。');
      const normalized = copy(checked);
      encoded(normalized, MAX_IMPORT_BYTES);
      return normalized;
    }
    function read() {
      errors = [];
      const raw = platform.getStorageSync(STORAGE_KEY);
      if (raw === undefined || raw === null || raw === '') return {raw, library:emptyLibrary(), rawSlots:Array(SLOT_COUNT).fill(null)};
      // Do not discard other slots when one entry is corrupt or from a later
      // version. No read operation writes repairs to the original storage.
      const value = typeof raw === 'string' ? parse(raw, MAX_IMPORT_BYTES * SLOT_COUNT + 16384) : raw;
      if (!shape(value, ['format','version','slots']) || value.format !== FORMAT || value.version !== 1 ||
        !Array.isArray(value.slots) || ![LEGACY_SLOT_COUNT, SLOT_COUNT].includes(value.slots.length)) throw new Error('存档库损坏或版本不兼容。');
      const library = emptyLibrary();
      for (let i = 0; i < value.slots.length; i++) {
        const entry = value.slots[i];
        if (entry === null) continue;
        try {
          if (!shape(entry, ['id','name','savedAt','checkpoint']) || entry.id !== i + 1 || typeof entry.name !== 'string' ||
            entry.name !== nameFor(entry.name, i + 1) || !Number.isFinite(entry.savedAt) || entry.savedAt < 0) throw new Error('存档信息不完整。');
          library.slots[i] = {id:i + 1, name:entry.name, savedAt:entry.savedAt, checkpoint:checkpoint(entry.checkpoint)};
        } catch (error) { errors.push({id:i + 1, message:error.message || '存档无法读取。'}); }
      }
      return {raw, library, rawSlots:value.slots};
    }
    function commit(previous, changedId) {
      // Read-time isolation is only a display view. A write owns exactly one
      // slot, so retain every other raw slot, including recoverable corrupt or
      // future-version data. Unsafe data in another slot blocks this write.
      const library = emptyLibrary();
      for (let i = 0; i < SLOT_COUNT; i++) {
        if (i + 1 === changedId) library.slots[i] = previous.library.slots[i];
        // Legacy six-slot libraries acquire empty new slots only when the
        // user writes. Keep the original document intact until verification.
        else if (i >= previous.rawSlots.length) library.slots[i] = null;
        else {
          const descriptor = Object.getOwnPropertyDescriptor(previous.rawSlots, String(i));
          if (!descriptor || !own(descriptor, 'value')) throw new Error('其他存档包含不安全的数据，保存已取消。');
          library.slots[i] = copy(descriptor.value);
        }
      }
      const text = encoded(library, MAX_IMPORT_BYTES * SLOT_COUNT + 16384);
      try {
        if (platform.setStorageSync(STORAGE_KEY, JSON.parse(text)) === false) throw new Error('存储拒绝写入。');
        const result = platform.getStorageSync(STORAGE_KEY);
        const actual = typeof result === 'string' ? result : JSON.stringify(result);
        if (actual !== text) throw new Error('存档写入校验失败。');
      } catch (cause) {
        // The API is synchronous and one-key, so a verified complete document
        // replaces the library. A failed/partial write restores the last value
        // where the host permits it and never reports success.
        const error = new Error('保存失败：' + (cause.message || '本机存储不可用。'));
        try {
          if (previous.raw === undefined && typeof platform.removeStorageSync === 'function') platform.removeStorageSync(STORAGE_KEY);
          else if (platform.setStorageSync(STORAGE_KEY, previous.raw === undefined ? '' : previous.raw) === false) throw new Error('rollback rejected');
          const restored = platform.getStorageSync(STORAGE_KEY);
          if (!(previous.raw === undefined && (restored === undefined || restored === null || restored === '')) && JSON.stringify(restored) !== JSON.stringify(previous.raw)) throw new Error('rollback verification failed');
        } catch (_) { error.rollbackFailed = true; }
        throw error;
      }
    }
    function save(id, value, name) {
      slotId(id);
      const valid = checkpoint(value), previous = read();
      const old = previous.library.slots[id - 1];
      const entry = {id, name:nameFor(name === undefined && old ? old.name : name, id), savedAt:Date.now(), checkpoint:valid};
      previous.library.slots[id - 1] = entry;
      commit(previous, id);
      return entryInfo(entry);
    }
    return Object.freeze({
      list() { return read().library.slots.map(entryInfo); },
      get(id) { slotId(id); const entry = read().library.slots[id - 1]; return entry ? copy(entry.checkpoint) : null; },
      getErrors() { return copy(errors); },
      save,
      rename(id, name) {
        slotId(id); const previous = read(), entry = previous.library.slots[id - 1];
        if (!entry) throw new Error('这个位置还没有存档。');
        entry.name = nameFor(name, id); commit(previous, id); return entryInfo(entry);
      },
      remove(id) {
        slotId(id); const previous = read();
        if (!previous.library.slots[id - 1] && !errors.some(error => error.id === id)) return false;
        previous.library.slots[id - 1] = null; commit(previous, id); return true;
      },
      exportSlot(id) {
        slotId(id); const entry = read().library.slots[id - 1];
        if (!entry) throw new Error('这个位置还没有存档。');
        return encoded({format:FILE_FORMAT, version:1, name:entry.name, checkpoint:entry.checkpoint}, MAX_IMPORT_BYTES);
      },
      importSlot(id, text, name) {
        slotId(id); const data = copy(parse(text, MAX_IMPORT_BYTES));
        if (!shape(data, ['format','version','name','checkpoint']) || data.format !== FILE_FORMAT || data.version !== 1 || typeof data.name !== 'string') throw new Error('存档文件格式或版本不兼容。');
        return save(id, data.checkpoint, name === undefined ? data.name : name);
      }
    });
  }
  return Object.freeze({create, STORAGE_KEY, SLOT_COUNT, FILE_FORMAT, MAX_IMPORT_BYTES});
});
