(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenLilies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLORS = Object.freeze({
    lily: Object.freeze({ top: '#8bbb69', light: '#aacf83', rim: '#5f8d4d', vein: '#668f52', edge: '#344b36' }),
    frostlily: Object.freeze({ top: '#a7d3ba', light: '#cae4c9', rim: '#74a794', vein: '#7aab98', edge: '#38574d' }),
    guardlily: Object.freeze({ top: '#78a36a', light: '#9bbc80', rim: '#507448', vein: '#527e49', edge: '#354934' }),
    powerlily: Object.freeze({ top: '#a3b66a', light: '#cbd58a', rim: '#798c48', vein: '#819651', edge: '#48513a' }),
    hastelily: Object.freeze({ top: '#82bea8', light: '#b0debe', rim: '#529781', vein: '#5b9b81', edge: '#345b4c' })
  });
  function number(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function oval(ctx, x, y, rx, ry, fill, stroke, width) {
    const k = .55228475;
    ctx.beginPath(); ctx.moveTo(x + rx, y);
    ctx.bezierCurveTo(x + rx, y + ry * k, x + rx * k, y + ry, x, y + ry);
    ctx.bezierCurveTo(x - rx * k, y + ry, x - rx, y + ry * k, x - rx, y);
    ctx.bezierCurveTo(x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry);
    ctx.bezierCurveTo(x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 2; ctx.stroke(); }
  }
  function line(ctx, points, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width || 2;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }
  function leafPath(ctx, depth) {
    // The narrow notch and raised front rim stay visible below an occupying plant.
    ctx.beginPath(); ctx.moveTo(4, 2 + depth);
    ctx.lineTo(39, 17 + depth);
    ctx.bezierCurveTo(24, 26 + depth, -9, 27 + depth, -34, 18 + depth);
    ctx.bezierCurveTo(-59, 10 + depth, -57, -9 + depth, -36, -18 + depth);
    ctx.bezierCurveTo(-12, -28 + depth, 24, -26 + depth, 43, -15 + depth);
    ctx.bezierCurveTo(61, -3 + depth, 54, 10 + depth, 44, 15 + depth);
    ctx.lineTo(4, 2 + depth); ctx.closePath();
  }
  function snowflake(ctx, x, y, radius, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2.1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3;
      const dx = Math.cos(a) * radius, dy = Math.sin(a) * radius;
      ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy);
    }
    ctx.stroke();
  }
  function frostBud(ctx, x, y, size) {
    ctx.fillStyle = '#e4f1db'; ctx.strokeStyle = '#5c8a85'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + size * .9, y - size * .5, x + size * .65, y + size * .25);
    ctx.quadraticCurveTo(x, y + size * .8, x - size * .65, y + size * .25);
    ctx.quadraticCurveTo(x - size * .9, y - size * .5, x, y - size); ctx.closePath(); ctx.fill(); ctx.stroke();
    line(ctx, [[x, y - size * .45], [x, y + size * .2]], '#9ac6be', 1.8);
  }
  function shieldBadge(ctx, x, y, scale, charged) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = charged ? '#ebca76' : '#bfad79'; ctx.strokeStyle = '#5d5538'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(7, -10, 13, -9);
    ctx.lineTo(11, 2); ctx.quadraticCurveTo(8, 11, 0, 15);
    ctx.quadraticCurveTo(-8, 11, -11, 2); ctx.lineTo(-13, -9);
    ctx.quadraticCurveTo(-7, -10, 0, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff0b7'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, -2);
    ctx.lineTo(8, 0); ctx.lineTo(3, 3); ctx.lineTo(0, 9); ctx.lineTo(-3, 3);
    ctx.lineTo(-8, 0); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function flowerFace(ctx, type, palette) {
    const frost = type === 'frostlily';
    if (type === 'guardlily') return;
    const petal = type === 'powerlily' ? '#efb2a0' : type === 'hastelily' ? '#c3e6dc' : frost ? '#e4efda' : '#f5e4bc';
    const center = type === 'powerlily' ? '#ffd5b5' : type === 'hastelily' ? '#e0f1e7' : frost ? '#eff6e6' : '#fff0ce';
    // A small unopened lotus, rather than another full character on the platform.
    oval(ctx, -11, -17, 9, 10, petal, palette.edge, 2.3);
    oval(ctx, 0, -20, 12, 14, center, palette.edge, 2.3);
    oval(ctx, 11, -17, 9, 10, petal, palette.edge, 2.3);
    oval(ctx, 0, -12, 17, 11, center, palette.edge, 2.3);
    oval(ctx, -6, -13, 1.7, 2.4, '#3b4336'); oval(ctx, 6, -13, 1.7, 2.4, '#3b4336');
    oval(ctx, -11, -8, 3, 1.6, '#eab8a9'); oval(ctx, 11, -8, 3, 1.6, '#eab8a9');
    ctx.strokeStyle = '#4b4b39'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-2.5, -8); ctx.quadraticCurveTo(0, -5, 2.5, -8); ctx.stroke();
  }

  function powerMark(ctx, x, y, size) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ctx.fillStyle = '#efb098'; ctx.strokeStyle = '#664a39'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, -1); ctx.lineTo(3, -1);
    ctx.lineTo(3, 8); ctx.lineTo(-3, 8); ctx.lineTo(-3, -1); ctx.lineTo(-8, -1);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function windMark(ctx, x, y, size, time) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#eaf7d8'; ctx.lineWidth = 2.8;
    const shift = Math.sin(time * 3) * .65;
    ctx.beginPath(); ctx.moveTo(-11 + shift, -4);
    ctx.lineTo(3 + shift, -4); ctx.bezierCurveTo(13, -4, 10, -12, 5, -9);
    ctx.moveTo(-8 - shift, 2); ctx.lineTo(9 - shift, 2);
    ctx.moveTo(-4 + shift, 7); ctx.lineTo(3 + shift, 7);
    ctx.quadraticCurveTo(10, 7, 7, 11); ctx.stroke(); ctx.restore();
  }

  const LEAF_BOUNDS = Object.freeze({ left: -64, top: -40, width: 128, height: 80 });
  const LEAF_PIXEL_LIMIT = 8 * 1024 * 1024, LEAF_ENTRY_LIMIT = 128;
  const leafCache = new Map();
  let leafPixels = 0, factoryIds = new WeakMap(), nextFactoryId = 0;
  function releaseLeaf(entry) {
    for (const canvas of entry.layers) {
      try { canvas.width = 0; } catch (_) {}
      try { canvas.height = 0; } catch (_) {}
    }
  }
  function clearCache() {
    for (const entry of leafCache.values()) releaseLeaf(entry);
    leafCache.clear(); leafPixels = 0; factoryIds = new WeakMap(); nextFactoryId = 0;
    for (const entry of shieldCache.values()) releaseShield(entry);
    shieldCache.clear(); shieldPixels = 0; shieldHookIds = new WeakMap(); nextShieldHookId = 0;
  }
  function leafDensity(ctx) {
    if (typeof ctx.getTransform !== 'function' || typeof ctx.drawImage !== 'function') return 0;
    // Flattening separately painted paths must not change translucent previews,
    // special compositing, or a caller's per-path shadow/filter effects.
    if (ctx.globalAlpha !== undefined && ctx.globalAlpha !== 1 ||
        ctx.globalCompositeOperation && ctx.globalCompositeOperation !== 'source-over' ||
        ctx.filter && ctx.filter !== 'none' || ctx.shadowBlur || ctx.shadowOffsetX || ctx.shadowOffsetY) return 0;
    try {
      const m = ctx.getTransform();
      if (!m || ![m.a, m.b, m.c, m.d].every(Number.isFinite)) return 0;
      const aa = m.a * m.a + m.b * m.b, cc = m.c * m.c + m.d * m.d;
      const ac = m.a * m.c + m.b * m.d;
      // The largest singular value also covers anisotropic/sheared displays.
      const scale = Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2);
      return Number.isFinite(scale) && scale > 0 ? Math.ceil(scale * 4) / 4 : 0;
    } catch (_) { return 0; }
  }
  function drawLeafBody(ctx, type, palette, card, occupied, hit, charged) {
    // Card leaves are viewed a little more from above, never stretched per frame.
    ctx.save(); ctx.scale(1, card ? .94 : .63);
    leafPath(ctx, 6); ctx.fillStyle = palette.rim; ctx.fill(); ctx.strokeStyle = palette.edge; ctx.lineWidth = 3.8; ctx.stroke();
    leafPath(ctx, 0); ctx.fillStyle = hit ? '#d8d99f' : palette.top; ctx.fill(); ctx.stroke();
    ctx.fillStyle = palette.light; ctx.beginPath(); ctx.moveTo(-40, -9);
    ctx.bezierCurveTo(-22, -22, 17, -22, 35, -11);
    ctx.bezierCurveTo(8, -17, -19, -13, -40, -9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = palette.vein; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(4, 2); ctx.quadraticCurveTo(-13, -4, -36, -12);
    ctx.moveTo(4, 2); ctx.quadraticCurveTo(-12, 3, -41, 8);
    ctx.moveTo(4, 2); ctx.quadraticCurveTo(1, 9, -7, 19);
    ctx.moveTo(4, 2); ctx.quadraticCurveTo(20, 1, 40, -7); ctx.stroke();
    ctx.restore();
    if (type === 'frostlily') {
      frostBud(ctx, -39, -7, 7); frostBud(ctx, -30, -12, 6); frostBud(ctx, -45, 1, 5.5);
      snowflake(ctx, 25, 8, 6, '#e8f7e4');
    }
    if (type === 'powerlily') {
      // The warm bud and little pennant stay readable under the upper plant.
      oval(ctx, -38, -7, 7, 8, '#efb2a0', palette.edge, 2);
      oval(ctx, -32, -6, 5, 7, '#ffd5b5', palette.edge, 1.8);
      powerMark(ctx, 31, 4, .8);
    }
    if (type === 'hastelily') {
      line(ctx, [[-43, -3], [-31, -10], [-19, -11]], '#d9edc1', 3);
      line(ctx, [[-41, 3], [-29, -2]], '#d9edc1', 2.4);
    }
    if (type === 'guardlily') {
      shieldBadge(ctx, occupied ? -36 : 0, occupied ? 0 : -9, occupied ? .62 : 1, charged);
      // Firm side veins give the guard leaf a broader, sturdy read.
      line(ctx, [[-24, 8], [-34, 10], [-40, 8]], '#b7cd91', 2);
      line(ctx, [[18, -6], [31, -7], [39, -4]], '#b7cd91', 2);
    } else if (!occupied && type !== 'hastelily') flowerFace(ctx, type, palette);
  }
  function cachedLeaf(ctx, type, palette, card, occupied, hit, charged, createCanvas) {
    if (typeof createCanvas !== 'function') return null;
    const density = leafDensity(ctx);
    if (!density) return null;
    const width = Math.ceil(LEAF_BOUNDS.width * density), height = Math.ceil(LEAF_BOUNDS.height * density);
    // Empty haste leaves retain their original body -> moving wind -> face order.
    const layerCount = type === 'hastelily' && !occupied ? 2 : 1;
    const pixels = width * height * layerCount;
    if (!Number.isSafeInteger(pixels) || pixels > LEAF_PIXEL_LIMIT) return null;
    let factoryId = factoryIds.get(createCanvas);
    if (factoryId === undefined) { factoryId = ++nextFactoryId; factoryIds.set(createCanvas, factoryId); }
    const key = [factoryId, type, +card, +occupied, +hit, +charged, density].join(':');
    let entry = leafCache.get(key);
    if (entry) { leafCache.delete(key); leafCache.set(key, entry); return entry; }
    while (leafCache.size && (leafCache.size >= LEAF_ENTRY_LIMIT || leafPixels + pixels > LEAF_PIXEL_LIMIT)) {
      const oldest = leafCache.keys().next().value, evicted = leafCache.get(oldest);
      leafCache.delete(oldest); leafPixels -= evicted.pixels; releaseLeaf(evicted);
    }
    entry = { layers: [], density, pixels };
    try {
      for (let i = 0; i < layerCount; i++) {
        const canvas = createCanvas();
        if (!canvas || canvas === ctx.canvas || entry.layers.includes(canvas)) throw new Error('invalid leaf surface');
        entry.layers.push(canvas); canvas.width = width; canvas.height = height;
        if (canvas.width !== width || canvas.height !== height) throw new Error('leaf surface allocation failed');
        const surface = canvas.getContext('2d');
        if (!surface || surface === ctx) throw new Error('invalid leaf context');
        surface.setTransform(density, 0, 0, density, -LEAF_BOUNDS.left * density, -LEAF_BOUNDS.top * density);
        surface.lineCap = 'round'; surface.lineJoin = 'round';
        if (i === 0) drawLeafBody(surface, type, palette, card, occupied, hit, charged);
        else flowerFace(surface, type, palette);
      }
    } catch (_) { releaseLeaf(entry); return null; }
    leafCache.set(key, entry); leafPixels += pixels;
    return entry;
  }
  function drawLeafLayer(ctx, entry, index) {
    const canvas = entry.layers[index];
    ctx.drawImage(canvas, LEAF_BOUNDS.left, LEAF_BOUNDS.top, canvas.width / entry.density, canvas.height / entry.density);
  }

  /** Anchor matches other actors: x is cell center, y is the lower footprint. */
  function draw(ctx, type, x, y, size, options) {
    if (!Object.prototype.hasOwnProperty.call(COLORS, type) || !ctx) return false;
    const opt = options || {}, card = !!opt.card, occupied = !!opt.occupied;
    const palette = COLORS[type], s = Math.max(1, number(size, 126)) / 126;
    const time = number(opt.time, 0), phase = number(opt.phase, 0);
    const bob = card ? 0 : Math.sin(time * 1.75 + phase) * 1.4;
    ctx.save(); ctx.translate(number(x, 0), number(y, 0)); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!card) {
      oval(ctx, 0, -7, 56, 10, 'rgba(29,67,59,.15)');
      // Two quiet ripples remain on the water while the leaf bobs as one piece.
      ctx.strokeStyle = 'rgba(223,243,224,.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-59, -4); ctx.quadraticCurveTo(-64, 0, -53, 5);
      ctx.moveTo(55, -2); ctx.quadraticCurveTo(61, 2, 54, 5); ctx.stroke();
    }
    ctx.translate(0, (card ? -38 : -17) + bob);
    ctx.rotate(card ? -.035 : Math.sin(time * 1.25 + phase) * .012);
    const hit = number(opt.hit, 0) > 0, charged = opt.shield !== 0;
    const entry = cachedLeaf(ctx, type, palette, card, occupied, hit, charged, opt.createCanvas);
    if (entry) drawLeafLayer(ctx, entry, 0);
    else drawLeafBody(ctx, type, palette, card, occupied, hit, charged);
    if (type === 'hastelily') {
      windMark(ctx, 30, 0, .8, card ? 0 : time);
      if (!occupied) {
        if (entry) drawLeafLayer(ctx, entry, 1);
        else flowerFace(ctx, type, palette);
      }
    }
    ctx.restore();
    return true;
  }

  /** Small live-buff badge beside an upper attacker, clear of its HP/Lv labels. */
  function drawBuff(ctx, type, x, y, size, options) {
    const opt = options || {};
    if (!ctx || (type !== 'powerlily' && type !== 'hastelily') || opt.active !== true || number(opt.bonus, 0) <= 0) return false;
    const s = Math.max(1, number(size, 126)) / 126;
    ctx.save(); ctx.translate(number(x, 0), number(y, 0)); ctx.scale(s, s);
    const bx = type === 'powerlily' ? 35 : 54;
    oval(ctx, bx, -44, 10.5, 10.5, type === 'powerlily' ? '#fce0a9' : '#609e89', '#435741', 1.7);
    if (type === 'powerlily') powerMark(ctx, bx, -44, .7);
    else windMark(ctx, bx, -45, .67, number(opt.time, 0));
    ctx.restore(); return true;
  }

  const SHIELD_COLORS = {
    guard: { rim: '#f5cb62', edge: '#93723b', light: '#fff7cf', fill: 'rgba(255,222,127,.085)', bar: '#efd173' },
    ward: { rim: '#84e0e5', edge: '#387d89', light: '#e8ffff', fill: 'rgba(125,229,240,.07)', bar: '#7edbe4' }
  };
  function bubblePath(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -3);
    ctx.bezierCurveTo(-44, -3, -57, -28, -54, -69);
    ctx.bezierCurveTo(-52, -111, -33, -137, 0, -137);
    ctx.bezierCurveTo(33, -137, 52, -111, 54, -69);
    ctx.bezierCurveTo(57, -28, 44, -3, 0, -3); ctx.closePath();
  }

  // Each original fill/stroke is a separate immutable image. Combining their
  // translucent overlap before applying the live pulse would change the image.
  const SHIELD_PIXEL_LIMIT = 2 * 1024 * 1024, SHIELD_ENTRY_LIMIT = 32;
  const shieldCache = new Map();
  let shieldPixels = 0, shieldHookIds = new WeakMap(), nextShieldHookId = 0;
  function shieldHookId(fn) {
    if (!shieldHookIds.has(fn)) shieldHookIds.set(fn, ++nextShieldHookId);
    return shieldHookIds.get(fn);
  }
  function releaseShield(entry) {
    const released=new Set();
    for (const sprite of entry.layers) {
      if(released.has(sprite.canvas))continue;released.add(sprite.canvas);
      const release=()=>{
        try { entry.unregister(sprite.canvas); } catch (_) {}
        try { sprite.canvas.width = 0; } catch (_) {}
        try { sprite.canvas.height = 0; } catch (_) {}
      };
      if(entry.retire){try{if(entry.retire(sprite.canvas,release)===true)continue;}catch(_){} }
      release();
    }
  }
  function shieldDensity(ctx, scale) {
    if (typeof ctx.getTransform !== 'function' || typeof ctx.getLineDash !== 'function' ||
        typeof ctx.drawImage !== 'function' ||
        ctx.globalCompositeOperation && ctx.globalCompositeOperation !== 'source-over' ||
        ctx.filter && ctx.filter !== 'none' || ctx.shadowBlur || ctx.shadowOffsetX || ctx.shadowOffsetY ||
        ctx.shadowColor && !/^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/.test(ctx.shadowColor) ||
        ctx.imageSmoothingEnabled === false) return 0;
    try {
      if (ctx.getLineDash().length) return 0;
      const m = ctx.getTransform();
      if (!m || ![m.a, m.b, m.c, m.d].every(Number.isFinite)) return 0;
      const aa = m.a * m.a + m.b * m.b, cc = m.c * m.c + m.d * m.d;
      const ac = m.a * m.c + m.b * m.d;
      // Use the actual display density, including shear/nonuniform transforms.
      // Time, opacity, shield amount, and position never become cache keys.
      const density = Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2) * scale;
      return Number.isFinite(density) && density > 0 ? density : 0;
    } catch (_) { return 0; }
  }
  function shieldLinePath(ctx, points) {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  }
  const SHIELD_DASH = [[-47, -77], [-47, -73]];
  const SHIELD_STAR_VERTICAL = [[31, -117], [31, -105]];
  const SHIELD_STAR_HORIZONTAL = [[26, -111], [36, -111]];
  const SHIELD_CRACK_RIGHT = [[49, -94], [39, -85], [47, -76], [40, -66]];
  const SHIELD_CRACK_LEFT = [[-47, -38], [-37, -32], [-40, -23]];
  function shieldPrimitives(palette, low, kind) {
    const bubbleBounds = [-57, -137, 114, 134];
    const plans = [
      { bounds: bubbleBounds, path: bubblePath, fill: palette.fill, width: 0 },
      { bounds: bubbleBounds, path: bubblePath, stroke: palette.edge, width: 5 },
      { bounds: bubbleBounds, path: bubblePath, stroke: low && kind !== 'ward' ? '#eda965' : palette.rim, width: 3.1 },
      { bounds: [-45, -126, 29, 38], stroke: palette.light, width: 3.5, path(ctx) {
        ctx.beginPath(); ctx.moveTo(-45, -88); ctx.bezierCurveTo(-41, -108, -32, -123, -16, -126);
      } },
      { bounds: [-47, -77, 0, 4], stroke: palette.light, width: 3, path(ctx) { shieldLinePath(ctx, SHIELD_DASH); } },
      { bounds: [31, -117, 0, 12], stroke: palette.light, width: 2, path(ctx) { shieldLinePath(ctx, SHIELD_STAR_VERTICAL); } },
      { bounds: [26, -111, 10, 0], stroke: palette.light, width: 2, path(ctx) { shieldLinePath(ctx, SHIELD_STAR_HORIZONTAL); } }
    ];
    if (low) plans.push(
      { bounds: [39, -94, 10, 28], stroke: palette.edge, width: 2, path(ctx) { shieldLinePath(ctx, SHIELD_CRACK_RIGHT); } },
      { bounds: [-47, -38, 10, 15], stroke: palette.edge, width: 1.8, path(ctx) { shieldLinePath(ctx, SHIELD_CRACK_LEFT); } }
    );
    return plans;
  }
  function cachedShield(ctx, scale, opt, palette, low) {
    if (typeof opt.createCanvas !== 'function' || typeof opt.registerSceneImage !== 'function' ||
        typeof opt.unregisterSceneImage !== 'function') return null;
    if (palette !== SHIELD_COLORS.guard && palette !== SHIELD_COLORS.ward) return null;
    if ((palette === SHIELD_COLORS.ward) !== (opt.kind === 'ward')) return null;
    const density = shieldDensity(ctx, scale);
    if (!density) return null;
    const kind = opt.kind === 'ward' ? 'ward' : 'guard';
    const key = [shieldHookId(opt.createCanvas), shieldHookId(opt.registerSceneImage),
      shieldHookId(opt.unregisterSceneImage), kind, low ? 1 : 0, density].join(':')+(typeof opt.sceneImageRetirement==='function'?':retire:'+shieldHookId(opt.sceneImageRetirement):'');
    const cached = shieldCache.get(key);
    if (cached) { shieldCache.delete(key); shieldCache.set(key, cached); return cached; }
    const plans = shieldPrimitives(palette, low, kind);
    let pixels = 0;
    for (const plan of plans) {
      const bounds = plan.bounds, pad = plan.width / 2;
      const left = Math.floor((bounds[0] - pad) * density) - 2;
      const top = Math.floor((bounds[1] - pad) * density) - 2;
      const right = Math.ceil((bounds[0] + bounds[2] + pad) * density) + 2;
      const bottom = Math.ceil((bounds[1] + bounds[3] + pad) * density) + 2;
      plan.left = left; plan.top = top; plan.widthPixels = right - left; plan.heightPixels = bottom - top;
      pixels += plan.widthPixels * plan.heightPixels;
    }
    // Keep every original fill/stroke as a separate quad. They share only
    // texture storage, so the live opacity still blends each in painter order.
    let atlasWidth=0,atlasHeight=0,shelfX=0,shelfY=0,shelfHeight=0;
    const side=1024;
    for(const plan of plans){
      if(plan.widthPixels+2>side||plan.heightPixels+2>side)return null;
      if(shelfX+plan.widthPixels+2>side){shelfY+=shelfHeight;shelfX=0;shelfHeight=0;}
      plan.sx=shelfX+1;plan.sy=shelfY+1;
      shelfX+=plan.widthPixels+2;shelfHeight=Math.max(shelfHeight,plan.heightPixels+2);
      atlasWidth=Math.max(atlasWidth,shelfX);atlasHeight=Math.max(atlasHeight,shelfY+shelfHeight);
    }
    pixels=atlasWidth*atlasHeight;
    const temporaryPixels=Math.max(...plans.map(plan=>plan.widthPixels*plan.heightPixels));
    if(pixels+temporaryPixels>SHIELD_PIXEL_LIMIT)return null;
    if (!Number.isFinite(pixels) || pixels > SHIELD_PIXEL_LIMIT || atlasHeight>side) return null;
    // Make room before allocating, keeping transient registered image storage
    // inside the same budget as retained groups.
    while (shieldCache.size >= SHIELD_ENTRY_LIMIT || shieldPixels + pixels + temporaryPixels > SHIELD_PIXEL_LIMIT) {
      const oldest = shieldCache.keys().next().value;
      const stale = shieldCache.get(oldest);
      shieldCache.delete(oldest); shieldPixels -= stale.pixels; releaseShield(stale);
    }
    const entry = { layers: [], pixels, unregister: opt.unregisterSceneImage, retire:typeof opt.sceneImageRetirement==='function'?opt.sceneImageRetirement:null };
    try {
      const canvas=opt.createCanvas(atlasWidth,atlasHeight);
      if(!canvas||typeof canvas.getContext!=='function'||canvas===ctx.canvas)throw new Error('No separate shield atlas');
      // Add ownership before configuration: failures release the complete atlas.
      entry.layers.push({canvas});canvas.width=atlasWidth;canvas.height=atlasHeight;
      const paint=canvas.getContext('2d');
      if(!paint||typeof paint.setTransform!=='function'||typeof paint.clip!=='function')throw new Error('No shield atlas context');
      entry.layers.length=0;
      for(const plan of plans){
        entry.layers.push({canvas,sx:plan.sx,sy:plan.sy,sw:plan.widthPixels,sh:plan.heightPixels,
          x:plan.left/density,y:plan.top/density,width:plan.widthPixels/density,height:plan.heightPixels/density});
        // Rasterize at the identical small device coordinates as the original.
        // Integer 1:1 copies preserve those AA pixels in the shared atlas.
        const temporary=opt.createCanvas(plan.widthPixels,plan.heightPixels);
        if(!temporary||typeof temporary.getContext!=='function'||temporary===canvas||temporary===ctx.canvas)throw new Error('No isolated primitive canvas');
        try{
          temporary.width=plan.widthPixels;temporary.height=plan.heightPixels;
          const primitive=temporary.getContext('2d');
          if(!primitive||typeof primitive.setTransform!=='function')throw new Error('No primitive context');
          primitive.setTransform(density,0,0,density,-plan.left,-plan.top);
          primitive.lineCap='round';primitive.lineJoin='round';primitive.globalAlpha=1;
          plan.path(primitive);
          if(plan.fill){primitive.fillStyle=plan.fill;primitive.fill();}
          else{primitive.strokeStyle=plan.stroke;primitive.lineWidth=plan.width;primitive.stroke();}
          paint.setTransform(1,0,0,1,0,0);paint.globalAlpha=1;paint.imageSmoothingEnabled=false;
          paint.drawImage(temporary,plan.sx,plan.sy);
        }finally{temporary.width=0;temporary.height=0;}
      }
      if(opt.registerSceneImage(canvas)===false)throw new Error('Shield image registration rejected');
    }catch(_){releaseShield(entry);return null;}
    shieldCache.set(key, entry); shieldPixels += pixels; return entry;
  }

  // Closed Native prewarm: use exactly the original small-canvas rasterizer,
  // hooks, density key, integer atlas copies, and cache ownership.
  function warmShieldSources(plan, options) {
    const opt=options||{},fail=reason=>({ok:false,reason,sources:[],pixels:0});
    if(opt.nativeStatic!==true||!['ready','paused','won','lost'].includes(opt.status))return fail('Shield warmup requires nonplaying Native');
    if(!Array.isArray(plan)||plan.length>SHIELD_ENTRY_LIMIT||typeof opt.createCanvas!=='function'||typeof opt.registerSceneImage!=='function'||typeof opt.unregisterSceneImage!=='function')return fail('Shield warmup hooks or plan invalid');
    const matrix=opt.transform;
    if(!matrix||![matrix.a,matrix.b,matrix.c,matrix.d].every(Number.isFinite))return fail('Shield warmup transform invalid');
    const context={getTransform:()=>matrix,getLineDash:()=>[],drawImage(){},globalCompositeOperation:'source-over',filter:'none',shadowColor:'rgba(0,0,0,0)',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,imageSmoothingEnabled:true};
    const items=new Map();let pixels=0,temporaryPixels=0;
    for(const item of plan){
      if(!item||!Number.isFinite(item.size)||item.size<=0||!['guard','ward'].includes(item.kind)||typeof item.low!=='boolean')return fail('Shield warmup item invalid');
      const scale=Math.max(1,item.size)/126,density=shieldDensity(context,scale),palette=SHIELD_COLORS[item.kind];
      if(!density)return fail('Shield warmup density invalid');
      const key=[shieldHookId(opt.createCanvas),shieldHookId(opt.registerSceneImage),shieldHookId(opt.unregisterSceneImage),item.kind,item.low?1:0,density].join(':')+(typeof opt.sceneImageRetirement==='function'?':retire:'+shieldHookId(opt.sceneImageRetirement):'');
      if(items.has(key))continue;
      // Duplicate only the existing pure integer layout for an all-plan budget
      // check. Rasterization below still calls the unchanged cachedShield.
      const primitives=shieldPrimitives(palette,item.low,item.kind);let x=0,y=0,row=0,w=0,h=0,temp=0;
      for(const p of primitives){
        const b=p.bounds,pad=p.width/2,left=Math.floor((b[0]-pad)*density)-2,top=Math.floor((b[1]-pad)*density)-2;
        const pw=Math.ceil((b[0]+b[2]+pad)*density)+2-left,ph=Math.ceil((b[1]+b[3]+pad)*density)+2-top;
        if(!Number.isSafeInteger(pw)||!Number.isSafeInteger(ph)||pw<=0||ph<=0||pw+2>1024||ph+2>1024)return fail('Shield warmup source exceeds side limit');
        if(x+pw+2>1024){y+=row;x=0;row=0;}
        x+=pw+2;row=Math.max(row,ph+2);w=Math.max(w,x);h=Math.max(h,y+row);temp=Math.max(temp,pw*ph);
      }
      if(h>1024)return fail('Shield warmup source exceeds side limit');
      const n=w*h;pixels+=n;temporaryPixels=Math.max(temporaryPixels,temp);items.set(key,{...item,scale,density,palette,pixels:n});
    }
    if(items.size>SHIELD_ENTRY_LIMIT||pixels+temporaryPixels>SHIELD_PIXEL_LIMIT)return fail('Shield warmup pixel budget exceeded');
    const originalKeys=new Set(shieldCache.keys()),sources=new Set();
    try{
      for(const [key,item]of items){
        const entry=cachedShield(context,item.scale,{...opt,kind:item.kind},item.palette,item.low);
        if(!entry||shieldCache.get(key)!==entry||entry.pixels!==item.pixels)throw new Error('Shield warmup source unavailable');
        for(const sprite of entry.layers)sources.add(sprite.canvas);
      }
      // Existing LRU eviction remains authoritative; never claim evicted sources.
      if(Array.from(items.keys()).some(key=>!shieldCache.has(key))||Array.from(sources).some(canvas=>!(canvas.width>0&&canvas.height>0)))throw new Error('Shield warmup cache budget changed');
      return {ok:true,reason:'',sources:Array.from(sources),pixels,temporaryPixels,densities:Array.from(items.values(),item=>item.density)};
    }catch(error){
      for(const [key,entry]of shieldCache)if(!originalKeys.has(key)){shieldCache.delete(key);shieldPixels-=entry.pixels;releaseShield(entry);}
      return fail(String(error.message||error));
    }
  }

  function drawCachedShield(ctx, x, y, scale, pulse, low, entry) {
    ctx.save();
    try {
      ctx.translate(number(x, 0), number(y, 0)); ctx.scale(scale, scale);
      ctx.globalAlpha *= pulse;
      for (const sprite of entry.layers) ctx.drawImage(sprite.canvas,sprite.sx,sprite.sy,sprite.sw,sprite.sh,sprite.x,sprite.y,sprite.width,sprite.height);
      // Canvas save/restore does not restore the current path. Preserve the
      // original last path for callers that stroke it after drawShield returns.
      shieldLinePath(ctx, low ? SHIELD_CRACK_LEFT : SHIELD_STAR_HORIZONTAL);
    } finally { ctx.restore(); }
    return true;
  }
  /** Transparent enclosure: the character remains clear, even in a full formation. */
  function drawShield(ctx, x, y, size, options) {
    const opt = options || {}, shield = number(opt.shield, 0);
    if (!ctx || shield <= 0) return false;
    const ratio = Math.max(0, Math.min(1, shield / Math.max(1, number(opt.shieldMax, shield))));
    const hit = Math.max(0, Math.min(1, number(opt.hit, 0)));
    const palette = SHIELD_COLORS[opt.kind] || SHIELD_COLORS.guard;
    const pulse = .94 + Math.sin(number(opt.time, 0) * 2) * .06;
    const s = Math.max(1, number(size, 126)) / 126;
    if (hit === 0) {
      const entry = cachedShield(ctx, s, opt, palette, ratio < .25);
      if (entry) return drawCachedShield(ctx, x, y, s, pulse, ratio < .25, entry);
    }
    ctx.save(); ctx.translate(number(x, 0), number(y, 0)); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha *= pulse;
    bubblePath(ctx); ctx.fillStyle = palette.fill; ctx.fill();
    ctx.strokeStyle = palette.edge; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = hit > .1 ? palette.light : ratio < .25 && opt.kind !== 'ward' ? '#eda965' : palette.rim;
    ctx.lineWidth = 3.1 + hit * 1.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-45, -88); ctx.bezierCurveTo(-41, -108, -32, -123, -16, -126);
    ctx.strokeStyle = palette.light; ctx.lineWidth = 3.5; ctx.stroke();
    line(ctx, [[-47, -77], [-47, -73]], palette.light, 3);
    // Small star high on the shell; its center does not sit over the face.
    line(ctx, [[31, -117], [31, -105]], palette.light, 2);
    line(ctx, [[26, -111], [36, -111]], palette.light, 2);
    if (ratio < .25) {
      line(ctx, [[49, -94], [39, -85], [47, -76], [40, -66]], palette.edge, 2);
      line(ctx, [[-47, -38], [-37, -32], [-40, -23]], palette.edge, 1.8);
    }
    if (hit > 0) {
      ctx.globalAlpha *= hit;
      bubblePath(ctx); ctx.fillStyle = 'rgba(255,255,241,.17)'; ctx.fill();
      oval(ctx, 52, -69, 4 + (1 - hit) * 13, 9 + (1 - hit) * 20, null, palette.light, 3);
      line(ctx, [[59, -89], [65 + (1 - hit) * 6, -97]], palette.light, 2.6);
      line(ctx, [[61, -68], [70 + (1 - hit) * 6, -68]], palette.light, 2.6);
      line(ctx, [[59, -49], [65 + (1 - hit) * 6, -42]], palette.light, 2.6);
    }
    ctx.restore(); return true;
  }

  function drawShieldBreak(ctx, x, y, size, options) {
    const opt = options || {}, age = number(opt.age, -1);
    if (!ctx || age < 0 || age >= .65) return false;
    const t = age / .65, palette = SHIELD_COLORS[opt.kind] || SHIELD_COLORS.guard;
    const s = Math.max(1, number(size, 126)) / 126;
    ctx.save(); ctx.translate(number(x, 0), number(y, 0)); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha *= (1 - t) * (1 - t);
    ctx.strokeStyle = palette.light; ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath(); ctx.ellipse(0, -67, 53 + t * 18, 66 + t * 13, 0, -.8, .8); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -67, 53 + t * 18, 66 + t * 13, 0, Math.PI - .7, Math.PI + .7); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7 - .9;
      ctx.save(); ctx.translate(Math.cos(a) * (48 + t * 24), -67 + Math.sin(a) * (58 + t * 20) + t * t * 19);
      ctx.rotate(a + t * (i % 2 ? 1.4 : -1.4));
      ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(5, -3); ctx.lineTo(2, 8); ctx.lineTo(-5, 3); ctx.closePath();
      ctx.fillStyle = palette.light; ctx.fill(); ctx.strokeStyle = palette.rim; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    ctx.restore(); return true;
  }

  function shieldNumber(value) {
    const n = Math.max(0, Math.ceil(value));
    if (n < 10000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(n < 100000 ? 1 : 0).replace(/\.0$/, '') + 'k';
    if (n < 1000000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
    return n.toExponential(1).replace('.0e', 'e').replace('e+', 'e');
  }
  /** One stable bar per cell, split by the two real, non-stacking shield pools. */
  function drawShieldBar(ctx, x, y, width, options) {
    const opt = options || {}, shield = Math.max(0, number(opt.shield, 0)), ward = Math.max(0, number(opt.ward, 0));
    const shieldMax = Math.max(shield, number(opt.shieldMax, 0)), wardMax = Math.max(ward, number(opt.wardMax, 0));
    if (!ctx || shieldMax + wardMax <= 0) return false;
    const maximum = shieldMax + wardMax, w = Math.max(70, number(width, 104)), h = 15;
    const goldWidth = w * Math.min(1, shield / maximum), blueWidth = w * Math.min(1, ward / maximum);
    ctx.save(); ctx.translate(number(x, 0) - w / 2, number(y, 0));
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#35483f'; ctx.fillRect(0, 0, w, h);
    if (goldWidth > 0) { ctx.fillStyle = opt.dormant ? '#adab7e' : SHIELD_COLORS.guard.bar; ctx.fillRect(0, 0, goldWidth, h); }
    if (blueWidth > 0) { ctx.fillStyle = SHIELD_COLORS.ward.bar; ctx.fillRect(goldWidth, 0, blueWidth, h); }
    ctx.fillStyle = 'rgba(255,255,242,.35)'; ctx.fillRect(0, 0, goldWidth + blueWidth, 3);
    ctx.strokeStyle = number(opt.hit, 0) > 0 ? '#fffce7' : '#344a42'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, w, h);
    ctx.fillStyle = ward > 0 && shield <= 0 ? '#9ce6eb' : opt.dormant ? '#beb98d' : '#f5d57d';
    ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-1, 1); ctx.lineTo(-2, 9); ctx.lineTo(-7, 15); ctx.lineTo(-12, 9); ctx.lineTo(-13, 1); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = '#344a42'; ctx.lineWidth = 1.8; ctx.stroke();
    const text = opt.dormant ? shieldNumber(shield) + ' 待承托' : shieldNumber(shield + ward) + '/' + shieldNumber(maximum);
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#314940'; ctx.lineWidth = 3; ctx.strokeText(text, w / 2, h / 2 + .5);
    ctx.fillStyle = '#fffde5'; ctx.fillText(text, w / 2, h / 2 + .5);
    ctx.restore(); return true;
  }

  /** Three quiet air ribbons show the two-cell chill strip without hiding terrain. */
  function drawFrostMist(ctx, x, y, width, options) {
    if (!ctx) return false;
    const w = Math.max(16, Math.min(512, number(width, 256)));
    const time = number(options && options.time, 0), length = w * .19;
    ctx.save(); ctx.translate(number(x, 0), number(y, 0));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.1;
    for (let i = 0; i < 3; i++) {
      const phase = time * .85 + i * 1.9;
      const px = (i - 1) * w * .29 + Math.sin(phase) * Math.min(4, w * .02);
      const py = (i === 1 ? 7 : -3) + Math.sin(phase + .7) * 2;
      ctx.strokeStyle = 'rgba(214,244,224,' + (.33 + Math.sin(phase) * .06).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(px - length * .5, py + 2);
      ctx.bezierCurveTo(px - length * .2, py - 5, px + length * .1, py + 5, px + length * .35, py);
      ctx.quadraticCurveTo(px + length * .55, py - 4, px + length * .45, py - 7);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  return Object.freeze({ draw, drawShield, drawShieldBreak, drawShieldBar, drawFrostMist, drawBuff, clearCache, warmShieldSources, COLORS });
});
