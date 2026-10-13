(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./scene-terrain.js') : root.GardenSceneTerrain);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenTerrain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sceneTerrain) {
  'use strict';
  if(!sceneTerrain)throw new Error('GardenSceneTerrain must load before GardenTerrain');

  const DEFAULT_GRID = { x: 64, y: 128, w: 128, h: 160, rows: 5, cols: 9 };
  const SCENE_BOUNDS=sceneTerrain.SCENE_BOUNDS;
  function sceneGrid(map,width,height,options) { return sceneTerrain.sceneGrid(map,width,height,options); }
  function sceneGuides(ctx,map,g){
    const dark=identity(map)==='moonpool';
    for(let row=0;row<g.rows;row++)for(let col=0;col<g.cols;col++){
      const x=g.x+col*g.w,y=g.y+row*g.h,kind=tileAt(map,row,col),size=Math.min(9,g.w*.12,g.h*.12),pad=3;
      ctx.strokeStyle=dark?'rgba(227,249,244,.19)':'rgba(47,69,39,.16)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+pad,y+pad+size);ctx.lineTo(x+pad,y+pad);ctx.lineTo(x+pad+size,y+pad);
      ctx.moveTo(x+g.w-pad-size,y+g.h-pad);ctx.lineTo(x+g.w-pad,y+g.h-pad);ctx.lineTo(x+g.w-pad,y+g.h-pad-size);ctx.stroke();
      // Small support-point marks explain mixed terrain without tinted cells.
      // The plant/lily occupies exactly this point and naturally covers it.
      const px=x+g.w*.5,py=y+g.h*.5;
      if(kind==='rubble'||kind==='roof'){
        ctx.strokeStyle='rgba(74,57,41,.55)';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(px-4,py-4);ctx.lineTo(px+4,py+4);ctx.moveTo(px+4,py-4);ctx.lineTo(px-4,py+4);ctx.stroke();
      }else if((kind==='water'&&!fullWater(identity(map)))||kind==='bridge'||kind==='mud'){
        ctx.strokeStyle=kind==='water'?'rgba(240,252,248,.65)':kind==='bridge'?'rgba(76,49,25,.45)':'rgba(94,68,40,.46)';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.stroke();
      }
    }
  }
  function illustratedScene(ctx,image,map,g,width,height,showGrid,options) {
    const t=g.sceneTransform||sceneTerrain.transform(map,width,height,options);
    ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
    ctx.drawImage(image,t.x,t.y,t.width,t.height);
    if(showGrid===false)return;
    if(map&&map.sceneLayoutVersion>0){sceneGuides(ctx,map,g);return;}
    // Small corner guides leave the painted ground visible. Special terrain
    // is marked explicitly because the rules can expand to 15 x 7 cells.
    const labels={water:'水',bridge:'桥',ice:'冰',mud:'泥',rubble:'碎石',roof:'天窗'};
    const colors={water:'#3e96bd',bridge:'#b9884f',ice:'#85c2df',mud:'#8b765a',rubble:'#5e695f',roof:'#577c87'};
    for(let row=0;row<g.rows;row++)for(let col=0;col<g.cols;col++){
      const x=g.x+col*g.w,y=g.y+row*g.h,kind=tileAt(map,row,col),pad=3;
      ctx.strokeStyle=identity(map)==='moonpool'?'rgba(227,249,244,.24)':'rgba(57,80,42,.22)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+pad,y+12);ctx.lineTo(x+pad,y+pad);ctx.lineTo(x+12,y+pad);
      ctx.moveTo(x+g.w-12,y+g.h-pad);ctx.lineTo(x+g.w-pad,y+g.h-pad);ctx.lineTo(x+g.w-pad,y+g.h-12);ctx.stroke();
      if(labels[kind]&&!(kind==='water'&&fullWater(identity(map)))){
        ctx.fillStyle=colors[kind];ctx.globalAlpha=kind==='rubble'||kind==='roof'?.19:.12;
        ctx.fillRect(x+pad,y+pad,g.w-pad*2,g.h-pad*2);ctx.globalAlpha=1;
        const font=Math.max(10,Math.min(15,g.w*.16)),tw=labels[kind].length*font+10;
        ctx.fillStyle=colors[kind];ctx.globalAlpha=.83;ctx.fillRect(x+5,y+5,tw,font+6);ctx.globalAlpha=1;
        ctx.font=font+'px "Microsoft YaHei",sans-serif';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#fff8e7';ctx.fillText(labels[kind],x+10,y+8);
        if(kind==='rubble'||kind==='roof'){
          ctx.strokeStyle='rgba(60,61,51,.32)';ctx.beginPath();ctx.moveTo(x+g.w*.4,y+g.h*.4);ctx.lineTo(x+g.w*.6,y+g.h*.6);ctx.moveTo(x+g.w*.6,y+g.h*.4);ctx.lineTo(x+g.w*.4,y+g.h*.6);ctx.stroke();
        }
      }
    }
  }
  const PALETTES = {
    garden: { base: '#758d45', light: '#78aa49', dark: '#6a9c41', edge: '#486333', line: '#557837' },
    brook: { base: '#6c8f52', light: '#8cb760', dark: '#7aa653', edge: '#476842', line: '#678d48', water: '#79b8b7', deep: '#568f99' },
    ruins: { base: '#79826b', light: '#9ba38a', dark: '#8b967c', edge: '#535e4b', line: '#737e67' },
    frost: { base: '#aabeb9', light: '#d3e2d4', dark: '#c2d6cb', edge: '#7c9f9d', line: '#a6c4ba', water: '#a8d5de', deep: '#83b9cb' },
    marsh: { base: '#687d50', light: '#8da568', dark: '#7f965c', edge: '#485e3e', line: '#69804d', water: '#79a398', deep: '#547b75' },
    rooftop: { base: '#a87359', light: '#bd9070', dark: '#af8164', edge: '#6e5040', line: '#92664f' },
    lagoon: { base: '#859b57', light: '#b1c17a', dark: '#729259', edge: '#4e7559', line: '#5d947d', water: '#78bdab', waterShade: '#73b6a5', deep: '#508f86', shore: '#c1c09a', shine: '#e1f6cc' },
    moonpool: { base: '#647888', light: '#8da3ad', dark: '#597588', edge: '#3d5a70', line: '#6291a5', water: '#608ba6', waterShade: '#5a859f', deep: '#3e637f', shore: '#99afbd', shine: '#d9e8ff' },
    tidal: { base: '#b5b188', light: '#dcd2a2', dark: '#9ca788', edge: '#617f78', line: '#5b9da6', water: '#60afb9', waterShade: '#59a8b3', deep: '#3f8397', shore: '#ded3a6', shine: '#ddf6e5' }
  };

  function identity(map) { return typeof map === 'string' ? map : map && map.id || 'garden'; }
  function fullWater(id) { return id === 'lagoon' || id === 'moonpool' || id === 'tidal'; }
  function palette(map) { return PALETTES[identity(map)] || PALETTES.garden; }
  function dimensions(map, grid) {
    const tiles = map && map.tiles, g = grid || {};
    const positive = value => Number.isInteger(value) && value > 0;
    const rows = [g.rows, map && map.rows, tiles && tiles.length, DEFAULT_GRID.rows].find(positive);
    const cols = [g.cols, map && map.cols, tiles && tiles[0] && tiles[0].length, DEFAULT_GRID.cols].find(positive);
    return { rows, cols };
  }
  function gridFor(map, grid) {
    const size = dimensions(map, grid);
    return Object.assign({}, DEFAULT_GRID, { w: 1152 / size.cols, h: 800 / size.rows }, grid, size);
  }
  function beginCell(ctx, g, row, col) {
    const x = g.x + col * g.w, y = g.y + row * g.h;
    // Preserve the original drawing commands at classic size. Smaller cells
    // use the same local artwork, clipped before it can cover a neighbour.
    if (g.w === 128 && g.h === 160) return { x, y, w: g.w, h: g.h, scaled: false };
    ctx.save(); ctx.translate(x, y); ctx.scale(g.w / 128, g.h / 160);
    ctx.beginPath(); ctx.rect(0, 0, 128, 160); ctx.clip();
    return { x: 0, y: 0, w: 128, h: 160, scaled: true };
  }
  function random(seed) {
    let value = seed >>> 0;
    return function () {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }
  function seedOf(id, row, col) {
    let n = 2166136261;
    for (let i = 0; i < id.length; i++) n = Math.imul(n ^ id.charCodeAt(i), 16777619);
    return (n + row * 383 + col * 997) >>> 0;
  }
  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  }
  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function polygon(ctx, points, fill, stroke, width) {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 2; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function oval(ctx, x, y, rx, ry, fill, stroke, width) {
    // Four curves avoid optional ellipse / Path2D dependencies in mini-game engines.
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
  function rounded(ctx, x, y, w, h, radius, fill, stroke, width) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 2; ctx.stroke(); }
  }
  function fallbackTile(id, row, col) {
    if (fullWater(id)) return 'water';
    if (id === 'brook' && (col === 4 || col === 5)) return row === 1 || row === 3 ? 'bridge' : 'water';
    if (id === 'ruins' && [[0, 5], [1, 7], [2, 4], [3, 7], [4, 5]].some(p => p[0] === row && p[1] === col)) return 'rubble';
    if (id === 'frost' && row % 2 === 0 && col >= 5 && col <= 7) return 'ice';
    if (id === 'marsh') {
      if (row % 2 === 1 && col >= 4 && col <= 6) return 'mud';
      if ((row === 0 || row === 4) && col === 7 || row === 2 && col === 6) return 'water';
    }
    if (id === 'rooftop') return (row % 2 === 0 && col === 5 || row % 2 === 1 && col === 7) ? 'roof' : 'bed';
    return 'grass';
  }
  function tileAt(map, row, col) {
    const tiles = map && typeof map === 'object' && map.tiles;
    return tiles && tiles[row] && tiles[row][col] || fallbackTile(identity(map), row, col);
  }
  function grassMark(ctx, x, y, size, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - size * .6, y - size * .55); ctx.quadraticCurveTo(x - size * .2, y - size * .35, x, y);
    ctx.moveTo(x, y); ctx.lineTo(x + size * .1, y - size);
    ctx.moveTo(x + size * .15, y); ctx.quadraticCurveTo(x + size * .4, y - size * .7, x + size * .75, y - size * .65); ctx.stroke();
  }
  // Soft-edged, asymmetric paint daubs and tapered blades belong only to the
  // cached scene. They add material texture without another animated layer.
  function brushPatch(ctx, x, y, w, h, tone) {
    ctx.fillStyle = tone; ctx.beginPath(); ctx.moveTo(x - w * .48, y);
    ctx.bezierCurveTo(x - w * .38, y - h * .62, x - w * .07, y - h * .35, x + w * .09, y - h * .46);
    ctx.bezierCurveTo(x + w * .29, y - h * .65, x + w * .53, y - h * .22, x + w * .48, y + h * .04);
    ctx.quadraticCurveTo(x + w * .22, y + h * .27, x + w * .01, y + h * .18);
    ctx.quadraticCurveTo(x - w * .22, y + h * .42, x - w * .48, y); ctx.closePath(); ctx.fill();
  }
  function grassTuft(ctx, x, y, size, dark, light) {
    brushPatch(ctx, x + size * .12, y + 1, size * 1.7, size * .37, 'rgba(34,65,30,.10)');
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(x - size * .65, y - size * .72);
    ctx.quadraticCurveTo(x - size * .07, y - size * .52, x - size * .02, y - size * .10);
    ctx.quadraticCurveTo(x - size * .13, y - size * .78, x + size * .12, y - size * 1.06);
    ctx.quadraticCurveTo(x + size * .34, y - size * .66, x + size * .24, y - size * .13);
    ctx.quadraticCurveTo(x + size * .50, y - size * .74, x + size * .90, y - size * .63);
    ctx.quadraticCurveTo(x + size * .47, y - size * .33, x + size * .44, y + size * .06);
    ctx.lineTo(x - size * .12, y + size * .07);
    ctx.quadraticCurveTo(x - size * .28, y - size * .45, x - size * .65, y - size * .72); ctx.fill();
    line(ctx, x + size * .12, y - size * .78, x + size * .13, y - size * .20, light, .9);
  }
  function stone(ctx, x, y, w, h, tone, edge) {
    polygon(ctx, [[x - w * .45, y], [x - w * .30, y - h * .75], [x + w * .21, y - h], [x + w * .49, y - h * .4], [x + w * .38, y + h * .13], [x - w * .22, y + h * .21]], tone, edge, 2.4);
    line(ctx, x - w * .28, y - h * .68, x + w * .18, y - h * .86, 'rgba(243,242,212,.34)', 2);
  }
  function reed(ctx, x, y, size) {
    ctx.strokeStyle = '#586c40'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 1, y - size * .6, x + 4, y - size);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x - size * .32, y - size * .6, x - size * .42, y - size * .72);
    ctx.moveTo(x + 2, y); ctx.quadraticCurveTo(x + size * .26, y - size * .58, x + size * .42, y - size * .61); ctx.stroke();
    line(ctx, x + 4, y - size * .92, x + 4, y - size * 1.17, '#75634a', 5);
  }
  function flower(ctx, x, y, color) {
    oval(ctx, x - 3.8, y, 3.5, 3, color); oval(ctx, x + 3.8, y, 3.5, 3, color);
    oval(ctx, x, y - 3.4, 3.3, 3.3, color); oval(ctx, x, y + 3.4, 3.3, 3.3, color);
    oval(ctx, x, y, 2.5, 2.5, '#dbc975');
  }
  function grassTile(ctx, id, row, col, x, y, w, h, p, rng) {
    rect(ctx, x, y, w + .6, h + .6, (row + col) % 2 ? p.dark : p.light);
    // Large, low-contrast brush shapes leave the central character silhouette quiet.
    for (let n = 0; n < 4; n++) {
      const xx = x + 12 + rng() * (w - 24), yy = y + 14 + rng() * (h - 28);
      brushPatch(ctx, xx, yy, 29 + rng() * 40, 10 + rng() * 9, n % 2 ? 'rgba(245,247,198,.09)' : 'rgba(44,77,40,.055)');
    }
    const tuftX = x + 17 + rng() * 21, tuftY = y + h - 12 - rng() * 12;
    grassTuft(ctx, tuftX, tuftY, 8 + rng() * 3, p.line, 'rgba(231,239,178,.38)');
    grassMark(ctx, tuftX + 13, tuftY + 2, 4, p.line);
    if ((row * 3 + col) % 3 === 0) grassTuft(ctx, x + w - 22, y + 25, 7, p.line, 'rgba(231,239,178,.32)');
    // Fine clipped brush ends soften the mowing stripes, never the grid itself.
    ctx.strokeStyle = 'rgba(226,239,166,.11)'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(x + 48, y + 13); ctx.quadraticCurveTo(x + 59, y + 9, x + 75, y + 11);
    ctx.moveTo(x + 72, y + h - 18); ctx.quadraticCurveTo(x + 86, y + h - 20, x + 95, y + h - 17); ctx.stroke();
    if (id === 'frost') {
      polygon(ctx, [[x, y], [x + w, y], [x + w, y + 8], [x + w * .68, y + 6], [x + w * .49, y + 11], [x + w * .21, y + 7], [x, y + 10]], '#e5eee1');
      if ((row + col) % 3 === 0) oval(ctx, x + w - 25, y + h - 16, 16, 5, 'rgba(244,247,232,.48)');
    }
  }
  function stoneFloor(ctx, row, col, x, y, w, h, p, rng) {
    rect(ctx, x, y, w + .5, h + .5, p.line);
    polygon(ctx, [[x + 10, y + 3], [x + w - 14, y + 5], [x + w - 5, y + 12], [x + w - 3, y + h - 15], [x + w - 13, y + h - 5], [x + 14, y + h - 3], [x + 6, y + h - 10], [x + 3, y + 13]], (row + col) % 2 ? p.dark : p.light);
    polygon(ctx, [[x + 7, y + h - 12], [x + 16, y + h - 8], [x + w - 14, y + h - 10], [x + w - 5, y + h - 19], [x + w - 3, y + h - 15], [x + w - 13, y + h - 5], [x + 14, y + h - 3], [x + 6, y + h - 10]], 'rgba(45,60,39,.14)');
    line(ctx, x + 8, y + 8, x + w - 11, y + 9, '#b3b79b', 2);
    line(ctx, x + w - 8, y + 13, x + w - 7, y + h - 13, '#808b72', 2);
    const cx = x + 13 + rng() * (w - 26), cy = y + 18 + rng() * (h - 36);
    brushPatch(ctx, cx, cy, 42 + rng() * 24, 16 + rng() * 10, 'rgba(224,226,194,.14)');
    brushPatch(ctx, x + 53 + rng() * 18, y + h - 23 - rng() * 15, 58 + rng() * 25, 9 + rng() * 8, 'rgba(55,71,48,.045)');
    ctx.strokeStyle = 'rgba(74,90,62,.40)'; ctx.lineWidth = 1.2; ctx.beginPath();
    const seamX = x + 22 + (col * 13 + row * 7) % 38;
    ctx.moveTo(seamX, y + 5); ctx.lineTo(seamX + 5, y + 18); ctx.lineTo(seamX - 1, y + 25); ctx.lineTo(seamX + 4, y + 32);
    ctx.moveTo(seamX + 5, y + 18); ctx.lineTo(seamX + 15, y + 21); ctx.stroke();
    line(ctx, seamX + 2, y + 7, seamX + 7, y + 16, 'rgba(229,233,200,.27)', 1);
    oval(ctx, x + 23 + rng() * 73, y + 52 + rng() * 57, 2.3, 1.1, 'rgba(58,76,49,.15)');
    if ((row + col) % 3 === 0) {
      ctx.strokeStyle = '#748167'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w - 5, y + 35); ctx.lineTo(x + w - 21, y + 42); ctx.lineTo(x + w - 18, y + 54); ctx.stroke();
      brushPatch(ctx, x + w - 19, y + h - 7, 27, 10, '#81915c');
      grassTuft(ctx, x + w - 17, y + h - 6, 7, '#667d50', '#a5b577');
    }
  }
  function waterTile(ctx, id, row, col, x, y, w, h, p, map, rng, g) {
    const pond = fullWater(id);
    rect(ctx, x, y, w + .5, h + .5, pond && (row + col) % 2 ? p.waterShade : p.water);
    // A few broad translucent washes suggest depth beneath the small ripples.
    // Their ends stay inside a cell; adjoining water never gains a false shore.
    brushPatch(ctx, x + w * (.45 + rng() * .10), y + h * (.21 + rng() * .24), w * (.62 + rng() * .23), h * (.10 + rng() * .11), 'rgba(225,248,226,.045)');
    brushPatch(ctx, x + w * (.45 + rng() * .13), y + h * (.60 + rng() * .17), w * (.58 + rng() * .23), h * (.10 + rng() * .12), 'rgba(30,85,104,.05)');
    const contiguous = (rr, cc) => rr >= 0 && rr < g.rows && cc >= 0 && cc < g.cols && /^(water|bridge)$/.test(tileAt(map, rr, cc));
    if (!contiguous(row, col - 1)) {
      rect(ctx, x, y, 9, h, p.deep); rect(ctx, x, y, 4, h, p.edge);
      for (let i = 0; i < 4; i++) {
        const yy = y + 15 + i * 40;
        oval(ctx, x + 3, yy, 8, 18, p.dark);
        ctx.strokeStyle = 'rgba(218,241,194,.29)'; ctx.lineWidth = 1.4; ctx.beginPath();
        ctx.moveTo(x + 12, yy - 9); ctx.quadraticCurveTo(x + 16, yy, x + 12, yy + 10); ctx.stroke();
      }
    }
    if (!contiguous(row, col + 1)) {
      rect(ctx, x + w - 9, y, 9, h, p.deep); rect(ctx, x + w - 4, y, 4, h, p.edge);
      for (let i = 0; i < 4; i++) {
        const yy = y + 26 + i * 40;
        oval(ctx, x + w - 3, yy, 8, 17, p.light);
        ctx.strokeStyle = 'rgba(27,80,84,.20)'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(x + w - 12, yy - 9); ctx.quadraticCurveTo(x + w - 16, yy, x + w - 12, yy + 9); ctx.stroke();
      }
    }
    if (!contiguous(row - 1, col)) {
      rect(ctx, x, y, w, 8, p.deep); line(ctx, x + 6, y + 2, x + w - 6, y + 2, p.edge, 3);
      polygon(ctx, [[x + 9, y + 7], [x + 34, y + 10], [x + 58, y + 8], [x + 90, y + 13], [x + w - 8, y + 8], [x + w - 8, y + 5], [x + 9, y + 5]], 'rgba(30,80,79,.16)');
      line(ctx, x + 29, y + 12, x + 61, y + 12, 'rgba(224,241,208,.22)', 1.3);
    }
    if (!contiguous(row + 1, col)) {
      rect(ctx, x, y + h - 7, w, 7, p.deep); line(ctx, x + 7, y + h - 2, x + w - 7, y + h - 2, p.edge, 3);
      polygon(ctx, [[x + 9, y + h - 6], [x + 34, y + h - 10], [x + 63, y + h - 8], [x + 91, y + h - 11], [x + w - 8, y + h - 7], [x + w - 8, y + h - 3], [x + 9, y + h - 3]], 'rgba(225,238,197,.16)');
    }
    for (let n = 0; n < 6; n++) {
      const xx = x + 20 + rng() * (w - 52), yy = y + 19 + rng() * (h - 38);
      const end = Math.min(x + w - 14, xx + 12 + rng() * 23);
      ctx.strokeStyle = n % 3 ? 'rgba(226,247,224,.25)' : 'rgba(40,100,115,.19)'; ctx.lineWidth = n % 2 ? 1.5 : 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo((xx + end) / 2, yy + (n % 2 ? -3 : 2), end, yy - 1); ctx.stroke();
    }
    if (pond) {
      // Wide, faint brush ripples establish water without hiding plant silhouettes.
      const yy = y + h * (.25 + rng() * .45);
      ctx.strokeStyle = id === 'moonpool' ? 'rgba(192,216,240,.15)' : 'rgba(224,249,221,.18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 12, yy); ctx.quadraticCurveTo(x + w * .43, yy - 7, x + w - 12, yy - 2); ctx.stroke();
      if (id === 'tidal' && (row + col * 2) % 5 === 0) {
        oval(ctx, x + w * .68, y + h * .76, 12, 4, null, 'rgba(221,246,229,.25)', 1.6);
      }
    }
    if (id === 'marsh') {
      oval(ctx, x + 27, y + h - 27, 17, 6, '#6d986b', '#547b59', 1.5);
      line(ctx, x + 27, y + h - 28, x + 31, y + h - 31, p.water, 2);
      reed(ctx, x + w - 9, y + h - 7, 27); reed(ctx, x + 9, y + 34, 19);
    }
  }
  function bridgeTile(ctx, x, y, w, h, p) {
    // Planks connect across adjacent bridge cells, forming one uninterrupted path.
    rect(ctx, x - 1, y + 12, w + 2, h - 18, '#598f91');
    rect(ctx, x - 1, y + 9, w + 2, h - 32, '#6e6450');
    const plankW = w / 4;
    for (let i = 0; i < 4; i++) {
      const px = x + i * plankW;
      polygon(ctx, [[px + 1, y + 13], [px + plankW - 2, y + 10 + i % 2 * 3], [px + plankW - 1, y + h - 28], [px + 2, y + h - 25]], i % 2 ? '#bda67a' : '#c5b184', '#796c51', 2.2);
      line(ctx, px + 6, y + 25, px + 7, y + h - 40, 'rgba(241,222,174,.43)', 2);
      line(ctx, px + plankW - 8, y + 52, px + plankW - 9, y + h - 45, 'rgba(101,86,60,.28)', 1.5);
      oval(ctx, px + plankW * .60, y + h * .6, 3, 8, null, 'rgba(101,86,60,.23)', 1.3);
    }
    rect(ctx, x, y + h - 28, w, 7, '#8c7958');
    line(ctx, x, y + 10, x + w, y + 10, '#e0c996', 3);
    line(ctx, x, y + h - 20, x + w, y + h - 20, '#5a674e', 3);
  }
  function rubbleTile(ctx, x, y, w, h, p, rng) {
    oval(ctx, x + w * .53, y + h * .68, w * .40, h * .19, 'rgba(52,67,42,.17)');
    polygon(ctx, [[x + 27, y + 52], [x + 68, y + 45], [x + 94, y + 61], [x + 95, y + 104], [x + 58, y + 122], [x + 25, y + 104]], '#7a826e', '#56634f', 3);
    polygon(ctx, [[x + 27, y + 52], [x + 67, y + 40], [x + 95, y + 59], [x + 62, y + 71]], '#b1b59b', '#67715c', 2.5);
    polygon(ctx, [[x + 62, y + 71], [x + 95, y + 59], [x + 95, y + 103], [x + 60, y + 118]], '#909b81');
    line(ctx, x + 64, y + 73, x + 64, y + 100, '#aeb399', 3);
    ctx.strokeStyle = '#606e57'; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(x + 51, y + 50); ctx.lineTo(x + 56, y + 65); ctx.lineTo(x + 48, y + 77); ctx.lineTo(x + 52, y + 91); ctx.stroke();
    stone(ctx, x + 28, y + 116, 30, 19, '#a3ab8d', '#69775d');
    stone(ctx, x + 94, y + 126, 24, 15, '#8f9a7b', '#617056');
    oval(ctx, x + 70, y + 49, 14, 6, '#81985c');
    grassMark(ctx, x + 19, y + 116, 12, '#526c41');
    grassMark(ctx, x + 104, y + 116, 9, '#526c41');
  }
  function iceTile(ctx, row, col, x, y, w, h) {
    rect(ctx, x, y, w + .5, h + .5, '#acd3d8');
    polygon(ctx, [[x + 3, y + 8], [x + w - 7, y + 3], [x + w - 2, y + h - 11], [x + 8, y + h - 2]], (row + col) % 2 ? '#bbdfe0' : '#b4d9dd', '#8fbac6', 2);
    polygon(ctx, [[x + 9, y + 10], [x + w - 12, y + 5], [x + w - 14, y + 15], [x + 17, y + 23]], 'rgba(237,250,239,.7)');
    line(ctx, x + 18, y + h - 15, x + 45, y + h - 43, 'rgba(238,249,238,.45)', 3);
    line(ctx, x + 28, y + h - 12, x + 71, y + h - 55, 'rgba(238,249,238,.27)', 5);
    ctx.strokeStyle = '#93bdc8'; ctx.lineWidth = 1.8; ctx.beginPath();
    ctx.moveTo(x + w - 7, y + 47); ctx.lineTo(x + w - 28, y + 64); ctx.lineTo(x + w - 22, y + 80); ctx.lineTo(x + w - 43, y + 93);
    ctx.moveTo(x + w - 28, y + 64); ctx.lineTo(x + w - 43, y + 61); ctx.stroke();
    oval(ctx, x + 10, y + 9, 11, 5, '#eaf0e3'); oval(ctx, x + w - 14, y + h - 7, 17, 6, '#eaf0e3');
  }
  function mudTile(ctx, row, col, x, y, w, h, map, rng, g) {
    const left = col > 0 && tileAt(map, row, col - 1) === 'mud';
    const right = col < g.cols - 1 && tileAt(map, row, col + 1) === 'mud';
    polygon(ctx, [[x, y + (left ? 18 : 32)], [x + 32, y + 17], [x + 73, y + 22], [x + w, y + (right ? 18 : 35)], [x + w, y + h - 23], [x + 88, y + h - 12], [x + 38, y + h - 19], [x, y + h - 26]], '#887b58', '#758156', 2);
    if (left) rect(ctx, x - 2, y + 22, 6, h - 49, '#887b58');
    if (right) rect(ctx, x + w - 3, y + 22, 6, h - 49, '#887b58');
    for (let n = 0; n < 5; n++) {
      const xx = x + 20 + rng() * (w - 40), yy = y + 37 + rng() * (h - 73);
      oval(ctx, xx, yy, 11 + rng() * 11, 3 + rng() * 3, n % 2 ? '#998d65' : '#756b51');
    }
    oval(ctx, x + 26, y + h - 26, 13, 3.5, '#a3a27b');
    grassMark(ctx, x + 13, y + 26, 8, '#657749'); grassMark(ctx, x + w - 13, y + h - 16, 9, '#637548');
  }
  function roofField(ctx, width, height) {
    rect(ctx, 0, 0, width, height, '#ad775c');
    for (let row = 0; row < Math.ceil(height / 57) + 1; row++) {
      const yy = row * 57;
      rect(ctx, 0, yy + 50, width, 7, '#855d49');
      line(ctx, 0, yy + 3, width, yy + 3, '#c19170', 3);
      for (let xx = -92 + row % 2 * 47; xx < width + 92; xx += 94) {
        polygon(ctx, [[xx + 9, yy + 6], [xx + 75, yy + 5], [xx + 82, yy + 44], [xx + 66, yy + 49], [xx + 16, yy + 46]], row % 3 ? 'rgba(242,184,137,.08)' : 'rgba(107,60,41,.08)');
        line(ctx, xx, yy + 9, xx + 5, yy + 49, '#95674f', 2.5);
        line(ctx, xx + 8, yy + 10, xx + 13, yy + 39, '#bb8868', 2);
        ctx.strokeStyle = '#93624b'; ctx.lineWidth = 1.6; ctx.beginPath();
        ctx.moveTo(xx + 7, yy + 46); ctx.quadraticCurveTo(xx + 47, yy + 53, xx + 91, yy + 46); ctx.stroke();
        line(ctx, xx + 20, yy + 46, xx + 57, yy + 48, 'rgba(235,178,129,.30)', 1.1);
        if ((row + Math.floor((xx + 92) / 94)) % 5 === 0) {
          ctx.strokeStyle = 'rgba(103,64,46,.38)'; ctx.lineWidth = 1.1; ctx.beginPath();
          ctx.moveTo(xx + 69, yy + 47); ctx.lineTo(xx + 65, yy + 38); ctx.lineTo(xx + 69, yy + 32); ctx.stroke();
        }
      }
    }
    // A low masonry parapet locates the whole board on a roof without a false horizon.
    rect(ctx, 0, 96, width, 20, '#6d6150'); rect(ctx, 0, 71, width, 32, '#c0b39a');
    line(ctx, 0, 73, width, 73, '#e1d4b9', 4);
    for (let x = 0; x < width; x += 112) line(ctx, x + 39, 77, x + 39, 99, '#958b77', 2);
    rect(ctx, 13, 115, 31, height - 115, '#c1ae8e'); rect(ctx, 13, 115, 8, height - 115, '#dac9a8');
    rect(ctx, width - 37, 115, 25, height - 115, '#8a725a');
  }
  function soilBed(ctx, row, col, x, y, w, h, rng, map, g) {
    const leftEnd = col === 0 || tileAt(map, row, col - 1) !== 'bed';
    const rightEnd = col === g.cols - 1 || tileAt(map, row, col + 1) !== 'bed';
    const insetLeft = leftEnd ? 9 : 0, insetRight = rightEnd ? 9 : 0;
    // Adjacent soil cells share long timber edges, forming real row planters.
    // Only the soil shade indicates the planting grid; there are no card-like rims.
    rect(ctx, x + insetLeft, y + 16, w - insetLeft - insetRight + .5, h - 29, '#775c40');
    rect(ctx, x + insetLeft, y + 14, w - insetLeft - insetRight + .5, h - 42, (row + col) % 2 ? '#918058' : '#99865e');
    brushPatch(ctx, x + 56 + rng() * 17, y + 39 + rng() * 27, 55 + rng() * 30, 12 + rng() * 12, 'rgba(206,174,114,.09)');
    brushPatch(ctx, x + 54 + rng() * 20, y + h - 37 - rng() * 25, 49 + rng() * 29, 11 + rng() * 10, 'rgba(70,52,33,.085)');
    rect(ctx, x + insetLeft, y + 8, w - insetLeft - insetRight + .5, 10, '#b9a075');
    line(ctx, x + insetLeft, y + 8, x + w - insetRight, y + 8, '#d1b78a', 3);
    rect(ctx, x + insetLeft, y + h - 29, w - insetLeft - insetRight + .5, 13, '#a5895e');
    line(ctx, x + insetLeft, y + h - 29, x + w - insetRight, y + h - 29, '#c6a779', 3);
    line(ctx, x + insetLeft, y + h - 16, x + w - insetRight, y + h - 16, '#74583d', 3);
    // Interrupted wood grain, bevel shadows and small nail heads add age to
    // the shared planter boards without dividing them into individual boxes.
    line(ctx, x + Math.max(17, insetLeft), y + 13, x + 53, y + 14, 'rgba(118,85,50,.28)', 1);
    line(ctx, x + 62, y + h - 20, x + w - Math.max(18, insetRight), y + h - 21, 'rgba(101,71,43,.24)', 1);
    if (leftEnd) {
      rect(ctx, x + 7, y + 11, 9, h - 27, '#b19a6e');
      line(ctx, x + 8, y + 12, x + 8, y + h - 18, '#d0b788', 3);
      oval(ctx, x + 12, y + 22, 1.4, 1.8, '#7c684e'); oval(ctx, x + 12, y + h - 26, 1.4, 1.8, '#7c684e');
    }
    if (rightEnd) {
      rect(ctx, x + w - 16, y + 11, 9, h - 27, '#987d55');
      line(ctx, x + w - 8, y + 12, x + w - 8, y + h - 18, '#73583d', 2);
      oval(ctx, x + w - 12, y + 22, 1.4, 1.8, '#705b43'); oval(ctx, x + w - 12, y + h - 26, 1.4, 1.8, '#705b43');
    }
    if (col % 3 === 1) {
      line(ctx, x + 11, y + h - 25, x + 65, y + h - 24, '#957c54', 1.5);
      oval(ctx, x + 88, y + h - 22, 7, 2, null, '#8e744e', 1);
    }
    for (let n = 0; n < 9; n++) {
      const xx = x + 23 + rng() * (w - 46), yy = y + 29 + rng() * (h - 74);
      const pebbleW = 2 + rng() * 3, pebbleH = 1.2 + rng();
      oval(ctx, xx, yy, pebbleW, pebbleH, n % 2 ? '#ac9367' : '#7f6d4c');
      if (n % 3 === 0) line(ctx, xx - pebbleW * .6, yy - pebbleH * .4, xx + pebbleW * .2, yy - pebbleH * .65, '#b49b6c', .8);
    }
    grassTuft(ctx, x + 28, y + h - 40, 7, '#758454', '#a0aa75');
    if ((row + col) % 3 === 0) grassMark(ctx, x + w - 28, y + 35, 6, '#768353');
  }
  function skylight(ctx, x, y, w, h) {
    oval(ctx, x + w * .53, y + h * .74, w * .42, 11, 'rgba(80,52,37,.22)');
    polygon(ctx, [[x + 13, y + 35], [x + w - 16, y + 35], [x + w - 8, y + h - 30], [x + 12, y + h - 30]], '#716c62', '#665446', 3);
    polygon(ctx, [[x + 20, y + 28], [x + w - 20, y + 28], [x + w - 13, y + h - 43], [x + 17, y + h - 43]], '#9abdb8', '#716c5b', 4);
    polygon(ctx, [[x + 28, y + 34], [x + 61, y + 34], [x + 24, y + h - 49]], '#c4d6c5');
    polygon(ctx, [[x + 74, y + 34], [x + 89, y + 34], [x + 38, y + h - 49], [x + 26, y + h - 49]], 'rgba(230,238,209,.35)');
    line(ctx, x + w * .5, y + 31, x + w * .51, y + h - 43, '#747b68', 4);
    line(ctx, x + 20, y + h * .48, x + w - 16, y + h * .48, '#747b68', 4);
    line(ctx, x + 23, y + 25, x + w - 22, y + 25, '#c3b695', 4);
  }
  function entryPath(ctx, id, g, width, height, p) {
    if (width <= 1280 || id === 'rooftop') return;
    const x = g.x + g.cols * g.w + 6, end = width - 42, bottom = Math.min(height, g.y + g.rows * g.h);
    const tone = {garden:'#a5a47b',brook:'#a5a77d',ruins:'#919681',frost:'#d7e3dc',marsh:'#7c805b'}[id] || (fullWater(id) ? p.shore : p.base);
    // A continuous, worn approach stays outside the planting columns.
    polygon(ctx, [[x,g.y],[end-8,g.y],[end+8,g.y+143],[end-3,g.y+358],[end+4,bottom],[x,bottom]], tone);
    for (let n = 0; n < g.rows; n++) {
      const yy = g.y + (45 + n * 157) * g.h / 160, xx = x + 27 + n % 3 * 43;
      const dy = offset => yy + offset * g.h / 160;
      if (id === 'ruins') {
        line(ctx, x+12, dy(31), end-20, dy(26), '#7e8773', 2);
        line(ctx, xx+38, dy(29), xx+31, dy(78), '#7e8773', 1.5);
        oval(ctx, end-13, dy(82), 14, 4, '#7e8e62');
      } else if (id === 'frost') {
        oval(ctx, xx+22, dy(41), 30, 5, '#c6d9d6');
        line(ctx, end-32, dy(31), end-50, dy(47), '#b4cccc', 2);
        line(ctx, end-50, dy(47), end-43, dy(58), '#b4cccc', 2);
      } else {
        oval(ctx, xx+18, dy(39), 23, 4, id === 'marsh' ? '#888865' : '#b0af86');
        grassMark(ctx, end+4, dy(72), 8, p.edge);
      }
    }
  }
  function pondMargins(ctx, id, g, width, height, p) {
    const left = g.x, right = g.x + g.cols * g.w, top = g.y, bottom = top + g.rows * g.h;
    // The shore sits outside the complete planting rectangle. It never turns
    // decorative rocks or reeds into occupied cells, even on a 15 by 7 board.
    rect(ctx, 0, 0, width, top, p.base);
    rect(ctx, left - 13, top - 12, right - left + 26, 12, p.shore);
    rect(ctx, left - 13, top, 13, bottom - top, p.shore);
    rect(ctx, right, top, 13, bottom - top, p.shore);
    rect(ctx, left - 13, bottom, right - left + 26, Math.min(14, height - bottom), p.shore);
    line(ctx, left - 1, top, right + 1, top, p.edge, 4);
    line(ctx, left - 1, bottom, right + 1, bottom, p.edge, 4);
    line(ctx, left - 1, top, left - 1, bottom, p.edge, 4);
    line(ctx, right + 1, top, right + 1, bottom, p.edge, 4);
    for (let n = 0; n < 10; n++) {
      const xx = left + 31 + n * (right - left - 62) / 9;
      if (id === 'moonpool') {
        rounded(ctx, xx - 27, top - 36 - n % 2 * 3, 54, 24, 6, p.dark, p.edge, 2);
        line(ctx, xx - 19, top - 31 - n % 2 * 3, xx + 15, top - 32 - n % 2 * 3, p.shore, 2);
      } else if (id === 'tidal') {
        oval(ctx, xx, top - 20, 27, 5, '#c7c296');
        if (n % 3 === 0) { stone(ctx, xx, top - 18, 20, 12, '#b0b5a1', p.edge); grassMark(ctx, xx + 19, top - 16, 13, p.edge); }
      } else {
        oval(ctx, xx, top - 18, 30, 12, p.dark); oval(ctx, xx - 7, top - 24, 20, 12, p.light);
        if (n % 3 === 0) flower(ctx, xx + 13, top - 24, '#e6d8bd');
      }
    }
    for (let n = 0; n < 5; n++) {
      const yy = top + 52 + n * (bottom - top - 98) / 4;
      if (id === 'lagoon') {
        reed(ctx, left - 27, yy + 12, 27); reed(ctx, right + 27, yy + 14, 22);
      } else {
        stone(ctx, left - 28, yy, 24, 15, p.dark, p.edge);
        stone(ctx, right + 27, yy + 8, 23, 14, p.light, p.edge);
      }
      if (id === 'tidal') {
        oval(ctx, left - 27, yy + 35, 7, 4, '#e6dec2', '#a2a88c', 1.2);
        line(ctx, left - 31, yy + 36, left - 26, yy + 32, '#bfb696', 1);
      }
    }
    if (id === 'moonpool') {
      // A broken reflection, kept in the background and cached with the map.
      const cx = left + (right - left) * .72;
      for (let n = 0; n < 8; n++) {
        const yy = top + 31 + n * 12, half = 16 + n * 5;
        line(ctx, cx - half, yy, cx + half, yy - 2, 'rgba(217,232,255,.16)', n % 2 ? 3 : 5);
      }
    }
  }
  function margins(ctx, id, g, width, height, p, map) {
    if (id === 'rooftop') return;
    if (fullWater(id)) { pondMargins(ctx, id, g, width, height, p); return; }
    const left = g.x, right = g.x + g.cols * g.w, bottom = g.y + g.rows * g.h;
    const waterRuns = row => {
      const runs = [];
      for (let col = 0; col < g.cols; col++) if (/^(water|bridge)$/.test(tileAt(map, row, col))) {
        const start = col;
        while (col + 1 < g.cols && /^(water|bridge)$/.test(tileAt(map, row, col + 1))) col++;
        runs.push([g.x + start * g.w, (col - start + 1) * g.w]);
      }
      return runs;
    };
    const classic = g.rows === 5 && g.cols === 9;
    const topWater = id === 'brook' ? waterRuns(0) : [];
    rect(ctx, 0, 0, width, g.y, p.base);
    if (id === 'brook' && classic) {
      const waterX = g.x + 4 * g.w;
      rect(ctx, waterX, 0, 2 * g.w, g.y, p.water); rect(ctx, waterX, bottom, 2 * g.w, height - bottom, p.water);
      line(ctx, waterX, 0, waterX, g.y, p.edge, 4); line(ctx, waterX + 2 * g.w, 0, waterX + 2 * g.w, g.y, p.edge, 4);
      line(ctx, waterX, bottom, waterX, height, p.edge, 4); line(ctx, waterX + 2 * g.w, bottom, waterX + 2 * g.w, height, p.edge, 4);
    } else if (id === 'brook') {
      for (const [waterX, waterWidth] of topWater) {
        rect(ctx, waterX, 0, waterWidth, g.y, p.water);
        line(ctx, waterX, 0, waterX, g.y, p.edge, 4); line(ctx, waterX + waterWidth, 0, waterX + waterWidth, g.y, p.edge, 4);
      }
      for (const [waterX, waterWidth] of waterRuns(g.rows - 1)) {
        rect(ctx, waterX, bottom, waterWidth, height - bottom, p.water);
        line(ctx, waterX, bottom, waterX, height, p.edge, 4); line(ctx, waterX + waterWidth, bottom, waterX + waterWidth, height, p.edge, 4);
      }
    }
    // Low shrubs and a worn edge, kept outside the planting grid and enemy lanes.
    for (let i = 0; i < Math.max(11, Math.ceil(width / 124)); i++) {
      const xx = 35 + i * 124;
      if (id === 'brook' && (classic ? xx > g.x + 4 * g.w - 25 && xx < g.x + 6 * g.w + 25 : topWater.some(([start, span]) => xx > start - 25 && xx < start + span + 25))) continue;
      const winter = id === 'frost';
      oval(ctx, xx, g.y - 20, 39, 21, winter ? '#b9cfc1' : p.dark, winter ? '#a4bfb7' : p.edge, 2);
      oval(ctx, xx - 18, g.y - 28, 22, 15, winter ? '#dbe7d9' : p.light);
      oval(ctx, xx + 12, g.y - 29, 24, 17, winter ? '#e6ede0' : p.light);
    }
    line(ctx, left - 3, g.y, left - 3, bottom, p.edge, 4);
    line(ctx, right + 3, g.y, right + 3, bottom, p.edge, 4);
    for (let row = 0; row < g.rows; row++) {
      const yy = g.y + row * g.h;
      const dy = offset => yy + offset * g.h / 160;
      if (id === 'ruins') {
        stone(ctx, 23, dy(103), 25, 17, '#a1a789', '#5b6952');
        stone(ctx, width - 23, dy(65), 28, 18, '#939e80', '#5b6952');
      } else if (id === 'frost') {
        oval(ctx, 24, dy(78), 24, 10, '#e2ecdf'); oval(ctx, width - 23, dy(125), 25, 9, '#e2ecdf');
      } else if (id === 'marsh') {
        reed(ctx, 22, dy(88), 27); reed(ctx, width - 19, dy(110), 31);
      } else {
        grassMark(ctx, 22, dy(77), 14, p.edge); grassMark(ctx, width - 21, dy(97), 14, p.edge);
        flower(ctx, width - 25, dy(72), row % 2 ? '#e9dba5' : '#ded0be');
      }
    }
    if (id !== 'brook') line(ctx, left, bottom + 3, right, bottom + 3, p.edge, 4);
    if (id === 'ruins') {
      // Broken boundary masonry, rather than unrelated scenic ornaments.
      for (let n = 0; n < 7; n++) {
        const xx = 82 + n * 179;
        rounded(ctx, xx, 78 + n % 2 * 4, 83, 35, 5, '#979d83', '#65705a', 3);
        line(ctx, xx + 8, 82 + n % 2 * 4, xx + 69, 82 + n % 2 * 4, '#bbc0a1', 3);
        oval(ctx, xx + 63, 110 + n % 2 * 4, 22, 6, '#7b8e58');
      }
    }
  }
  function lighting(ctx, theme, width, height) {
    if (theme === 'sunset' || theme === 'dusk') rect(ctx, 0, 0, width, height, 'rgba(211,125,59,.15)');
    else if (theme === 'night' || theme === 'moon') rect(ctx, 0, 0, width, height, 'rgba(23,36,86,.31)');
    else if (theme === 'fog') rect(ctx, 0, 0, width, height, 'rgba(181,205,214,.22)');
  }
  // Six painted materials share one small atlas. Cropping in board coordinates
  // makes neighbouring cells continuous at every grid size; no baked 9x5 grid
  // can drift away from the actual planting positions.
  function materialSurface(ctx, atlas, panel, x, y, w, h, u, v, du, dv) {
    const pw = atlas.width / 3, ph = atlas.height / 2;
    ctx.drawImage(atlas, (panel % 3 + u) * pw, (Math.floor(panel / 3) + v) * ph,
      du * pw, dv * ph, x, y, w, h);
  }
  function materialCell(ctx, atlas, panel, x, y, w, h, row, col, g) {
    const repeatX = panel === 0 ? 3 : panel === 1 || panel === 2 || panel === 5 ? 2 : 1;
    const repeatY = panel === 0 || panel === 1 || panel === 5 ? 2 : 1;
    const u0 = col / g.cols * repeatX, u1 = (col + 1) / g.cols * repeatX;
    const v0 = row / g.rows * repeatY, v1 = (row + 1) / g.rows * repeatY;
    // Reflect adjacent patches, so their touching pixels match without a
    // conspicuous tiled seam. Split crops where a real cell crosses a patch.
    for (let ty = Math.floor(v0); ty < Math.ceil(v1 - 1e-9); ty++) for (let tx = Math.floor(u0); tx < Math.ceil(u1 - 1e-9); tx++) {
      const a = Math.max(u0,tx), b = Math.min(u1,tx+1), c = Math.max(v0,ty), d = Math.min(v1,ty+1);
      const dx = x + (a-u0)/(u1-u0)*w, dy = y + (c-v0)/(v1-v0)*h;
      const dw = (b-a)/(u1-u0)*w, dh = (d-c)/(v1-v0)*h;
      const flipX = tx % 2, flipY = ty % 2;
      ctx.save(); ctx.translate(dx+(flipX?dw:0),dy+(flipY?dh:0)); ctx.scale(flipX?-1:1,flipY?-1:1);
      materialSurface(ctx,atlas,panel,0,0,dw,dh,flipX?1-(b-tx):a-tx,flipY?1-(d-ty):c-ty,b-a,d-c);
      ctx.restore();
    }
  }
  function paintedBackground(ctx, background, width, height) {
    const sx = background.width / 1400, sy = background.height / 600;
    const scale = background.width === 1915 && background.height === 821 ? (924 - 128) / (908 - 128) : 1;
    const cropWidth = Math.min(background.width - 220 * sx, (800 + Math.max(0, width - 1280) / 1.6) * sx);
    ctx.drawImage(background, 220 * sx, 0, cropWidth,
      600 * sy, 0, 128 * height / 960 * (1 - scale), width, height * scale);
  }
  function texturedBorder(ctx, atlas, id, g, width, height, p, hasBackground) {
    const right = g.x + g.w * g.cols, bottom = g.y + g.h * g.rows;
    // The approach, coping and flower borders are scenery outside the board.
    // Keep the right-hand spawn corridor clear of large decorative objects.
    if (!hasBackground || id !== 'garden') {
      if (right + 20 < width) {
        materialSurface(ctx, atlas, id === 'rooftop' ? 5 : 1, right + 8, g.y - 12,
          width - right - 8, height - g.y + 12, .68, 0, .32, 1);
        rect(ctx, right + 8, g.y - 12, width - right - 8, height - g.y + 12,
          id === 'frost' ? 'rgba(225,243,249,.48)' : 'rgba(128,136,91,.10)');
      }
    }
    const water = fullWater(id), roof = id === 'rooftop';
    const rim = water ? 15 : 7;
    rect(ctx, g.x - rim - 3, g.y - rim - 3, right - g.x + rim * 2 + 6, rim + 3, 'rgba(30,45,22,.32)');
    rect(ctx, g.x - rim - 3, g.y, rim + 3, bottom - g.y + rim, 'rgba(30,45,22,.32)');
    rect(ctx, right, g.y, rim + 5, bottom - g.y + rim, 'rgba(30,45,22,.34)');
    rect(ctx, g.x, bottom, right - g.x, rim + 5, 'rgba(30,45,22,.34)');
    const tone = water ? p.shore : roof ? '#b88963' : id === 'frost' ? '#d0ddd0' : '#849e4f';
    rect(ctx, g.x - rim, g.y - rim, right - g.x + rim * 2, rim, tone);
    rect(ctx, g.x - rim, g.y, rim, bottom - g.y, tone);
    rect(ctx, right, g.y, rim, bottom - g.y, tone);
    rect(ctx, g.x - rim, bottom, right - g.x + rim * 2, Math.min(rim, height - bottom), tone);
    line(ctx, g.x - rim, g.y - rim, right + rim, g.y - rim, 'rgba(242,243,201,.53)', 2);
    line(ctx, right + rim, g.y, right + rim, bottom, 'rgba(242,243,201,.35)', 2);
    if (water) {
      for (let x = g.x - rim + 32; x < right; x += 64) {
        line(ctx, x, g.y - rim + 2, x - 3, g.y - 2, 'rgba(58,79,69,.37)', 1.5);
        line(ctx, x, bottom + 2, x + 3, bottom + rim - 1, 'rgba(58,79,69,.37)', 1.5);
      }
      for (let y = g.y + 36; y < bottom; y += 64) {
        line(ctx, g.x - rim + 1, y, g.x - 2, y + 2, 'rgba(58,79,69,.37)', 1.5);
        line(ctx, right + 2, y, right + rim - 1, y + 2, 'rgba(58,79,69,.37)', 1.5);
      }
    }
    // Layered leaves, small blossoms and uneven stones replace identical
    // repeated ovals. These few ornaments are painted into the static cache.
    if (!roof && (!hasBackground || id !== 'garden')) {
      const rng = random(seedOf(id, 17, 31));
      for (let i = 0; i < 26; i++) {
        const x = 26 + i * (width - 48) / 25, y = g.y - 24 - rng() * 11;
        const r = 11 + rng() * 9;
        oval(ctx, x + 5, y + 8, r * 1.6, 8, 'rgba(28,48,27,.25)');
        stone(ctx, x, y + 5, r * 2, r, id === 'frost' ? '#c6d4d1' : water ? p.shore : '#81956c', '#536b51');
        for (let leaf = 0; leaf < 4; leaf++) {
          const lx = x - r + leaf * r * .6, ly = y - 2 - rng() * 8;
          oval(ctx, lx, ly, 9, 5, id === 'frost' ? '#bfd1b6' : leaf % 2 ? '#608b3a' : '#88ad4a');
          line(ctx, lx - 3, ly + 1, lx + 3, ly - 2, 'rgba(219,235,151,.42)', .8);
        }
        if (i % 4 === 1 && id !== 'ruins') flower(ctx, x + 7, y - 8, id === 'moonpool' ? '#c7daf0' : '#f4e5af');
      }
      for (let i = 0; i < 7; i++) {
        const y = g.y + 42 + i * (bottom - g.y - 75) / 6;
        if (water || id === 'marsh') reed(ctx, g.x - 29, y + 9, 19 + i % 3 * 4);
        else grassTuft(ctx, g.x - 29, y, 11, '#54783a', '#b2c97b');
        if (i % 2 === 0) flower(ctx, width - 18, y, '#e3d39f');
      }
    }
  }
  function texturedScene(ctx, o, map, id, p, g, width, height) {
    const atlas = o.materialAtlas, bg = o.background;
    const gardenSurround = !!bg && (id === 'garden' || id === 'brook' || id === 'frost');
    rect(ctx, 0, 0, width, height, p.base);
    if (gardenSurround) {
      paintedBackground(ctx, bg, width, height);
      const wash = {frost:'rgba(195,225,233,.50)', ruins:'rgba(70,83,63,.21)', marsh:'rgba(89,110,54,.20)', moonpool:'rgba(55,90,136,.18)'}[id];
      if (wash) rect(ctx, 0, 0, width, height, wash);
    } else {
      const field = id === 'rooftop' ? 5 : id === 'ruins' || id === 'moonpool' ? 1 : id === 'tidal' ? 3 : 0;
      materialCell(ctx,atlas,field,0,0,width,height,0,0,{cols:1,rows:1});
      const wash = {ruins:'rgba(69,87,57,.25)',marsh:'rgba(72,91,46,.36)',lagoon:'rgba(112,157,55,.25)',moonpool:'rgba(35,57,98,.67)',tidal:'rgba(224,205,149,.82)'}[id];
      if (wash) rect(ctx,0,0,width,height,wash);
    }
    for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
      const {x,y,w,h,scaled} = beginCell(ctx,g,row,col), kind = tileAt(map,row,col), rng = random(seedOf(id,row,col));
      let panel = kind === 'water' || kind === 'bridge' ? 2 : kind === 'ice' ? 4 : kind === 'mud' || kind === 'bed' ? 3 : id === 'ruins' ? 1 : id === 'rooftop' ? 5 : 0;
      materialCell(ctx, atlas, panel, x, y, w, h, row, col, g);
      const water = panel === 2;
      if (panel === 0) rect(ctx,x,y,w,h,'rgba(112,153,51,.29)');
      if (water) rect(ctx,x,y,w,h,'rgba(84,162,172,.36)');
      // Quiet washes separate planting cells while leaving the painted texture
      // visible. Water is continuous and gets only a very subtle grid cue.
      rect(ctx,x,y,w,h,(row+col)%2 ? water ? 'rgba(28,74,79,.09)' : 'rgba(36,65,22,.12)' : water ? 'rgba(196,238,224,.03)' : 'rgba(213,226,140,.07)');
      if (id === 'frost' && panel === 0) rect(ctx,x,y,w,h,'rgba(215,238,225,.63)');
      if (id === 'marsh' && panel === 0) rect(ctx,x,y,w,h,'rgba(125,131,66,.22)');
      if (id === 'moonpool' && water) rect(ctx,x,y,w,h,'rgba(47,75,136,.36)');
      if (id === 'lagoon' && water) rect(ctx,x,y,w,h,'rgba(108,180,116,.18)');
      if (id === 'tidal' && water) rect(ctx,x,y,w,h,'rgba(74,160,180,.12)');
      if (water) {
        const contiguous = (r,c) => r >= 0 && r < g.rows && c >= 0 && c < g.cols && /^(water|bridge)$/.test(tileAt(map,r,c));
        if (!contiguous(row,col-1)) { rect(ctx,x,y,5,h,'rgba(19,76,75,.42)'); line(ctx,x+6,y+4,x+6,y+h-4,'rgba(226,249,210,.54)',1.8); }
        if (!contiguous(row,col+1)) { rect(ctx,x+w-5,y,5,h,'rgba(18,72,71,.35)'); }
        if (!contiguous(row-1,col)) { rect(ctx,x,y,w,6,'rgba(18,72,71,.35)'); line(ctx,x+4,y+7,x+w-4,y+7,'rgba(214,245,217,.43)',1.6); }
        if (!contiguous(row+1,col)) rect(ctx,x,y+h-5,w,5,'rgba(18,72,71,.30)');
      }
      if (kind === 'bridge') bridgeTile(ctx,x,y,w,h,p);
      else if (kind === 'rubble') rubbleTile(ctx,x,y,w,h,p,rng);
      else if (kind === 'roof') skylight(ctx,x,y,w,h);
      else if (kind === 'bed') {
        // Shared planter rails; soil remains a continuous painted surface.
        rect(ctx,x,y+3,w,8,'#b3955a'); line(ctx,x,y+3,x+w,y+3,'#d3ba7c',2);
        rect(ctx,x,y+h-12,w,10,'#8c653f'); line(ctx,x,y+h-12,x+w,y+h-12,'#c39c63',2);
        if (col === 0 || tileAt(map,row,col-1) !== 'bed') rect(ctx,x+3,y+7,6,h-16,'#ba9863');
        if (col === g.cols-1 || tileAt(map,row,col+1) !== 'bed') rect(ctx,x+w-9,y+7,6,h-16,'#8c6846');
      } else if (kind === 'mud') {
        for (let i=0;i<3;i++) oval(ctx,x+23+i*34,y+45+(i%2)*54,14,3,'rgba(214,184,108,.22)');
      }
      if (!water && kind !== 'roof') {
        line(ctx,x+1,y+1,x+w-1,y+1,'rgba(234,239,190,.12)',1);
        line(ctx,x+w-1,y+1,x+w-1,y+h-1,'rgba(23,54,26,.12)',1);
      }
      if (scaled) ctx.restore();
    }
    texturedBorder(ctx,atlas,id,g,width,height,p,gardenSurround);
    if (id === 'moonpool') {
      // The surrounding stonework shares the water's moonlight, including the
      // incoming lane; a night map must not retain a bright daytime fence.
      rect(ctx,g.x+g.cols*g.w+15,0,Math.max(0,width-g.x-g.cols*g.w-15),height,'rgba(32,53,95,.47)');
      oval(ctx,width-128,45,29,29,'rgba(213,230,244,.07)');
      oval(ctx,width-128,45,19,19,'#d2dce4');
      oval(ctx,width-120,39,17,18,'#495c77');
    }
    const theme = map.theme || (id === 'moonpool' ? 'night' : o.theme);
    if (theme === 'night' || theme === 'moon') rect(ctx,0,0,width,height,'rgba(26,42,91,.18)');
    else if (theme === 'sunset' || theme === 'dusk') rect(ctx,0,0,width,height,'rgba(226,138,55,.11)');
    else if (theme === 'fog') rect(ctx,0,0,width,height,'rgba(191,212,216,.14)');
    // Thin contact shadows add depth without obscuring the first/last cells.
    rect(ctx,g.x,g.y,g.w*g.cols,5,'rgba(29,47,30,.17)');
    rect(ctx,g.x,g.y,4,g.h*g.rows,'rgba(29,47,30,.13)');
  }
  /** Static scene; callers may cache this result once per map/theme. */
  function draw(ctx, options) {
    const o = options || {}, map = o.map || 'garden', id = identity(map), p = palette(map);
    const g = gridFor(map, o.grid), width = o.width || 1280, height = o.height || 960;
    ctx.save();
    if(o.sceneImage && o.sceneImage.width>0){
      illustratedScene(ctx,o.sceneImage,map,g,width,height,o.showGrid,o);ctx.restore();return;
    }
    if (id === 'garden' && o.background && g.rows === 5 && g.cols === 9 && g.w === 128 && g.h === 160) {
      // The 1400px original already includes the sidewalk and road. Reveal it
      // at the same scale so widening the view never moves the planting cells.
      const sourceWidth = 800 + Math.max(0, width - 1280) / 1.6;
      // Enhanced art can have another pixel resolution. The original 1400 by
      // 600 layout remains the coordinate system for its crop and board cells.
      const sx = (o.background.width || 1400) / 1400, sy = (o.background.height || 600) / 600;
      // background1-hd-v1 (1915x821) is repainted, not a pixel enlargement:
      // its grass bottom was 14-17px above the original at all nine columns.
      // Keep the y=128 lawn top anchored and restore the measured 908->924
      // bottom. Limit this calibration to that raster size; other art keeps
      // its normal mapping. Clip the slightly taller image to this viewport.
      const calibratedHD = o.background.width === 1915 && o.background.height === 821;
      const verticalScale = calibratedHD ? (924 - 128) / (908 - 128) : 1;
      const destinationY = calibratedHD ? 128 * height / 960 * (1 - verticalScale) : 0;
      if (calibratedHD) { ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip(); }
      ctx.drawImage(o.background, 220 * sx, 0, sourceWidth * sx, 600 * sy, 0, destinationY, width, height * verticalScale);
      lighting(ctx, o.theme, width, height); ctx.restore(); return;
    }
    if (o.materialAtlas && o.materialAtlas.width > 0 && o.materialAtlas.height > 0) {
      texturedScene(ctx,o,map,id,p,g,width,height); ctx.restore(); return;
    }
    rect(ctx, 0, 0, width, height, p.base);
    if (id === 'rooftop') roofField(ctx, width, height);
    for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
      const { x, y, w, h, scaled } = beginCell(ctx, g, row, col);
      const kind = tileAt(map, row, col), rng = random(seedOf(id, row, col));
      if (id === 'ruins') stoneFloor(ctx, row, col, x, y, w, h, p, rng);
      else if (id !== 'rooftop' && !fullWater(id)) grassTile(ctx, id, row, col, x, y, w, h, p, rng);
      if (kind === 'water' || kind === 'bridge') waterTile(ctx, id, row, col, x, y, w, h, p, map, rng, g);
      if (kind === 'bridge') bridgeTile(ctx, x, y, w, h, p);
      else if (kind === 'rubble') rubbleTile(ctx, x, y, w, h, p, rng);
      else if (kind === 'ice') iceTile(ctx, row, col, x, y, w, h);
      else if (kind === 'mud') mudTile(ctx, row, col, x, y, w, h, map, rng, g);
      else if (kind === 'bed') soilBed(ctx, row, col, x, y, w, h, rng, map, g);
      else if (kind === 'roof') skylight(ctx, x, y, w, h);
      if (scaled) ctx.restore();
    }
    entryPath(ctx, id, g, width, height, p);
    margins(ctx, id, g, width, height, p, map);
    lighting(ctx, map.theme || (id === 'moonpool' ? 'night' : o.theme), width, height);
    ctx.restore();
  }
  /** Ambient motion depends only on simulation time, so pause freezes it exactly. */
  function drawAmbient(ctx, options) {
    const o = options || {}, map = o.map || 'garden', id = identity(map), g = gridFor(map, o.grid);
    const time = Number.isFinite(o.time) ? o.time : 0;
    if(map&&map.sceneLayoutVersion>0){sceneTerrain.drawAmbient(ctx,Object.assign({},o,{map,grid:g,time}));return;}
    if (fullWater(id)) {
      // Fixed work at all board sizes: 24 ripple pairs, never one animation
      // per tile or per actor. Simulation time also freezes this on pause.
      const p = palette(map), width = g.w * g.cols, height = g.h * g.rows;
      ctx.save(); ctx.beginPath(); ctx.rect(g.x + 10, g.y + 10, width - 20, height - 20); ctx.clip();
      for (let n = 0; n < 24; n++) {
        const phase = time * .62 + n * 2.39996;
        const xx = g.x + 32 + (n % 6 + .20 * Math.sin(n * 1.7)) * (width - 100) / 5 + Math.sin(phase * .6) * 6;
        const yy = g.y + 48 + (Math.floor(n / 6) + .13 * Math.cos(n * 1.3)) * (height - 112) / 3 + Math.sin(phase) * 4;
        ctx.globalAlpha = .17 + .09 * Math.sin(phase);
        line(ctx, xx, yy, xx + 25 + n % 3 * 5, yy - 1, p.shine, 2.2);
        line(ctx, xx + 8, yy + 6, xx + 17, yy + 6, p.shine, 1.5);
      }
      ctx.restore(); return;
    }
    if (id !== 'brook' && id !== 'marsh' && id !== 'frost') return;
    ctx.save();
    for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
      const kind = tileAt(map, row, col);
      if (kind !== 'water' && kind !== 'ice') continue;
      const { x, y, scaled } = beginCell(ctx, g, row, col);
      if (kind === 'water') {
        for (let n = 0; n < 2; n++) {
          const phase = time * .62 + row * 1.4 + col * .9 + n * 2.6;
          const xx = x + 29 + n * 44 + Math.sin(phase * .6) * 5;
          const yy = y + 42 + n * 71 + Math.sin(phase) * 4;
          ctx.globalAlpha = .20 + .10 * Math.sin(phase);
          line(ctx, xx, yy, xx + 22, yy, '#edfae8', 2.3);
          line(ctx, xx + 7, yy + 6, xx + 15, yy + 6, '#d7f0da', 1.8);
        }
      } else if (kind === 'ice') {
        const phase = (time * .35 + row * .8 + col * .53) % (Math.PI * 2);
        ctx.globalAlpha = .08 + .13 * Math.max(0, Math.sin(phase));
        line(ctx, x + 23, y + 28, x + 62, y + 27, '#ffffff', 2);
      }
      if (scaled) ctx.restore();
    }
    ctx.restore();
  }
  /** Inexpensive, tile-accurate map preview; safe to redraw in selection menus. */
  function thumbnail(ctx, map, x, y, width, height, options) {
    if(options&&options.sceneImage){
      const image=options.sceneImage,scale=Math.max(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;
      ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);ctx.restore();return;
    }
    if (options && options.materialAtlas) {
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,width,height); ctx.clip();
      ctx.translate(x,y); ctx.scale(width/1472,height/960);
      draw(ctx,Object.assign({},options,{map,width:1472,height:960}));
      ctx.restore(); return;
    }
    const id = identity(map), p = palette(map), size = dimensions(map), w = width / size.cols, h = height / size.rows;
    ctx.save(); rect(ctx, x, y, width, height, p.base);
    if (size.rows !== 5 || size.cols !== 9) {
      ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    }
    for (let row = 0; row < size.rows; row++) for (let col = 0; col < size.cols; col++) {
      const xx = x + col * w, yy = y + row * h, kind = tileAt(map, row, col);
      const normal = (row + col) % 2 ? p.dark : p.light;
      rect(ctx, xx, yy, w + .25, h + .25, normal);
      if (kind === 'water' || kind === 'bridge') {
        rect(ctx, xx, yy, w + .25, h + .25, p.water);
        if (kind === 'bridge') {
          rect(ctx, xx, yy + h * .14, w + .3, h * .71, '#bfa97c');
          line(ctx, xx + w * .5, yy + h * .17, xx + w * .5, yy + h * .81, '#8e7e5c', Math.max(.6, w * .04));
        } else line(ctx, xx + w * .24, yy + h * .53, xx + w * .71, yy + h * .53, '#c6ded0', Math.max(.6, h * .055));
      } else if (kind === 'rubble') {
        polygon(ctx, [[xx + w * .25, yy + h * .69], [xx + w * .21, yy + h * .32], [xx + w * .58, yy + h * .20], [xx + w * .82, yy + h * .40], [xx + w * .75, yy + h * .79]], '#747e68', '#606c56', Math.max(.7, w * .045));
        line(ctx, xx + w * .29, yy + h * .32, xx + w * .57, yy + h * .24, '#c2c5a5', 1);
      } else if (kind === 'ice') {
        rect(ctx, xx + 1, yy + 1, w - 2, h - 2, '#acd7df');
        line(ctx, xx + w * .17, yy + h * .77, xx + w * .68, yy + h * .20, '#e8f1e3', Math.max(.6, w * .07));
      } else if (kind === 'mud') {
        rect(ctx, xx, yy + h * .15, w + .25, h * .73, '#8a7e58');
        line(ctx, xx + w * .22, yy + h * .54, xx + w * .66, yy + h * .54, '#a0966b', 1);
      } else if (kind === 'bed') {
        rect(ctx, xx, yy + h * .06, w + .25, h * .85, '#b89f73');
        rect(ctx, xx, yy + h * .14, w + .25, h * .64, (row + col) % 2 ? '#918058' : '#99865e');
      } else if (kind === 'roof') {
        rect(ctx, xx, yy, w, h, '#b18264');
        rect(ctx, xx + w * .14, yy + h * .20, w * .72, h * .61, '#726e5e');
        rect(ctx, xx + w * .21, yy + h * .24, w * .56, h * .45, '#b7d0c6');
      }
      if (id === 'ruins' && kind !== 'rubble') {
        line(ctx, xx + w - .7, yy + 1, xx + w - .7, yy + h - 1, p.line, .7);
        line(ctx, xx + 1, yy + h - .7, xx + w - 1, yy + h - .7, p.line, .7);
      }
    }
    if (fullWater(id)) {
      const border = Math.max(2, Math.min(width, height) * .035);
      ctx.strokeStyle = p.shore; ctx.lineWidth = border;
      ctx.beginPath(); ctx.rect(x + border / 2, y + border / 2, width - border, height - border); ctx.stroke();
      if (id === 'moonpool') {
        for (let n = 0; n < 5; n++) line(ctx, x + width * .70 - 3 - n * 2, y + height * .16 + n * 4, x + width * .70 + 3 + n * 2, y + height * .16 + n * 4, '#c5dbf1', 1.6);
        rect(ctx, x, y, width, height, 'rgba(23,36,86,.20)');
      }
    }
    ctx.restore();
  }
  return { draw, drawAmbient, thumbnail, tileAt, sceneGrid, illustratedScene, SCENE_BOUNDS, PALETTES };
});
