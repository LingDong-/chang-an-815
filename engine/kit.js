// NOTES FROM THE ARCHITECTURE ENGINEER (2026-11-06) — for the lead / nature engineer:
//  * ROUND 8 BUILDING ENTRY: ARCH.frame takes o.cls (0 home: always shut, opendoor->door; 1 business; 2 late; 3 temple; 4 courtyard gate).
//    Door / board / counter / shutter bays of cls >= 1 draw both states in slot groups 2c-1 (closed: leaves in the plane, 排門 boards,
//    gap glow) and 2c (open: leaves swung in against the jambs, boards stacked inside, blind); their solid is in group 2c-1 only. Every
//    closable bay pushes L.meta.doors {x,y,z,w,yaw,cls,a,b} (cls 0 too); ARCH.goods / ARCH.furnish push L.meta.spots (keeper, assistant,
//    cook, hostess, waiter, monk). COMP.B defaults cls 0 and takes o.furnish ('hall'|'room'|'rich'|'kitchen'|'temple'|'tavern') for
//    in-place interiors (ARCH.furnish); it also pushes a clear apron in front of every door into lot.foot -> NATURE.yard should avoid lot.foot
//    (tool/clearcheck.js lists yard clutter in door paths as '(nature.js) ... NOT counted'). Tools: clearcheck.js, metacount.js,
//    gate_ramp_test.js (春明門 ramps), zwho.js (who emitted the triangles at a point).
//  * COMP now sets lot.gx (gate x, lot-local), lot.zMain (main building z) and lot.foot (local rects [x0,z0,x1,z1] of buildings) before
//    NATURE.yard; NATURE.yard is also called for shop rows (kind 'house') and temples (kind 'temple'). Please avoid lot.foot when placing clutter.
//    It also sets lot.walled = true and lot.walls = {front, back, left, right, rect: [x0,z0,x1,z1], style} (lot-local, front = +z) for every
//    lot that gets an enclosure wall (COMP.enclose), and NATURE.yard(..., 'temple') is called by the temple's last part.
//  * NIGHT LAMPLIGHT (round 5): lit rooms are a seeded subset of bays (frame option lit = share, lamp = group). Their paper 直欞 windows,
//    the crack between closed door leaves, gaps between shop boards, open doorways and open shop fronts get warm emissive cards. The LAMP
//    GROUP is written in the vertex BONE byte (aB.x) of those emissive vertices (static meshes don't skin): 1 = evening (households/shops,
//    out by ~21:30), 2 = late (great houses, 北里 / 崇仁 households, ~23:30), 3 = all night (wine shops, inns, temple altar lamps). Lights
//    added for them carry light.group the same way. Shares (COMP.night): hut 5%, house 20%, rich 35%, shop 60%, stall 50%, inn 75%,
//    wine shop 85%, temple hall 70%; lots in 平康 / 崇仁 (and 北里 units) double, capped at 90%. LOD1 has one lit window card per lit building.
//  * COMP.BIG.temple exists: WARD.items now expands temple lots into parts (COMP.templeParts) so a big monastery spreads over chunks.
//  * Detail dressing (ARCH.dress / ARCH.goods / ARCH.hangSign / ARCH.stamp) is skipped in LOD and uses its own RNG streams, so LOD and
//    full detail place identical buildings. Keep that rule: never draw from a compound's main RNG inside an `if (!ARCH.lod)` block.
//  * Screenshots: with shadows off the uSh sampler sits on unit 0 next to the texture array (INVALID_OPERATION -> only sky/fog rendered);
//    tool/arch_shot.js (= shot.js + the people agent's workaround) renders correctly. tool/arch.html?scene=arch&lots=house,rich,...
//    (tool/arch_scene.js) is a fast compound test scene. Audits: tool/zitems.js (z-fights per item; ZUP=1 skips floor-facing bottoms),
//    tool/zlot.js TYPE W D SEED, tool/zdbg2.js "{hall opts}"|lot:TYPE:W:D:SEED, tool/chunkstat.js (verts/ms per LOD0 chunk).
// kit.js — EIGHT HUNDRED DRUMS shared kit: procedural textures, glyph textures, ARCH (architecture builders), PROPS, gib meshes.
// Base: ref/assets.js (Northern Song). Tang (815) adaptations: see the TANG section at the end, which overrides defaults
// (鴟尾 instead of 鴟吻, flatter roofs, red-ochre/white paint, 七朱八白 lintels, ward walls & gates, pagodas, Tang trees).
'use strict';
const hyp2 = (a, b) => Math.sqrt(a * a + b * b);
// in-place variants: only ever applied to a fresh temporary (the result of mixc), so values are unchanged
const shm = (c, k) => { c[0] *= k; c[1] *= k; c[2] *= k; return c; }, mixm = (a, b, t) => { a[0] += (b[0] - a[0]) * t; a[1] += (b[1] - a[1]) * t; a[2] += (b[2] - a[2]) * t; return a; };
// ---------- fast noise for texture generation ----------
// qN / qW are drop-in, bit-identical replacements for engine tN / tW: lattice hashes are cached in lazily filled tables
// (cleared at the start of every texture, see the TEX.add wrapper below) instead of being re-hashed for every texel.
const _QT = new Map();
const _qtab = (p, s, k) => { const key = (p * 65536 + s) * 4 + k; let t = _QT.get(key); if (!t) { t = new Float64Array(p * p * k).fill(-1); _QT.set(key, t); } return t; };
function _qv(x, y, p, s) {
  const t = _qtab(p, s, 1), xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % p) + p) % p, x1 = x0 + 1 === p ? 0 : x0 + 1, y0 = ((yi % p) + p) % p, y1 = y0 + 1 === p ? 0 : y0 + 1, i00 = y0 * p + x0, i10 = y0 * p + x1, i01 = y1 * p + x0, i11 = y1 * p + x1;
  let a = t[i00]; if (a < 0) a = t[i00] = hash2(x0, y0, s); let b = t[i10]; if (b < 0) b = t[i10] = hash2(x1, y0, s); let c = t[i01]; if (c < 0) c = t[i01] = hash2(x0, y1, s); let d = t[i11]; if (d < 0) d = t[i11] = hash2(x1, y1, s);
  const u = a + (b - a) * fx, v = c + (d - c) * fx; return u + (v - u) * fy;
}
// whole-texture fields for the common case of integer texel coordinates (same arithmetic as the per-call path)
const _QF = new Map(), _XI = new Int32Array(TS), _X0 = new Int32Array(TS), _X1 = new Int32Array(TS), _FX = new Float64Array(TS);
function _nField(cells, oct, s) {
  const key = (cells * 16 + oct) * 100000 + s; let F = _QF.get(key); if (F) return F; F = new Float64Array(TS * TS);
  let a = .5, n = 0, p = cells; const C = new Float64Array(TS); for (let i = 0; i < TS; i++) C[i] = i / TS * cells;
  const Y0 = new Int32Array(TS), Y1 = new Int32Array(TS), FY = new Float64Array(TS);
  for (let o = 0; o < oct; o++) { const ss = s + o * 31, t = _qtab(p, ss, 1);
    for (let i = 0; i < TS; i++) { const c = C[i], xi = Math.floor(c); let f = c - xi; f = f * f * (3 - 2 * f); const x0 = ((xi % p) + p) % p; _X0[i] = Y0[i] = x0; _X1[i] = Y1[i] = x0 + 1 === p ? 0 : x0 + 1; _FX[i] = FY[i] = f; }
    for (let y = 0; y < TS; y++) { const y0 = Y0[y], y1 = Y1[y], fy = FY[y], r0 = y0 * p, r1 = y1 * p;
      for (let x = 0; x < TS; x++) { const x0 = _X0[x], x1 = _X1[x], fx = _FX[x], i00 = r0 + x0, i10 = r0 + x1, i01 = r1 + x0, i11 = r1 + x1;
        let A = t[i00]; if (A < 0) A = t[i00] = hash2(x0, y0, ss); let B = t[i10]; if (B < 0) B = t[i10] = hash2(x1, y0, ss); let Cc = t[i01]; if (Cc < 0) Cc = t[i01] = hash2(x0, y1, ss); let D = t[i11]; if (D < 0) D = t[i11] = hash2(x1, y1, ss);
        const u = A + (B - A) * fx, v = Cc + (D - Cc) * fx; F[y * TS + x] += a * (u + (v - u) * fy); } }
    n += a; for (let i = 0; i < TS; i++) C[i] *= 2; p *= 2; a *= .5; }
  for (let i = 0; i < F.length; i++) F[i] /= n; _QF.set(key, F); return F;
}
function _wField(cells, s) {
  const key = -((cells * 100000) + s) - 1; let F = _QF.get(key); if (F) return F; const F1 = new Float64Array(TS * TS), F2 = new Float64Array(TS * TS), ID = new Float64Array(TS * TS), p = cells, T = _qtab(p, s, 3);
  const PX = new Float64Array(9), PY = new Float64Array(9), PI_ = new Float64Array(9), X = new Float64Array(TS), CI = new Int32Array(TS); for (let i = 0; i < TS; i++) { X[i] = i / TS * cells; CI[i] = Math.floor(X[i]); }
  for (let py = 0; py < TS; py++) { const y = X[py], yi = CI[py]; let cxPrev = 1e9;
    for (let px = 0; px < TS; px++) { const x = X[px], xi = CI[px];
      if (xi !== cxPrev) { cxPrev = xi; let n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = xi + i, cy = yi + j, wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p, k = (wy * p + wx) * 3;
        if (T[k] < 0) { T[k] = hash2(wx, wy, s); T[k + 1] = hash2(wx, wy, s + 7); T[k + 2] = hash2(wx, wy, s + 13); } PX[n] = cx + T[k]; PY[n] = cy + T[k + 1]; PI_[n++] = T[k + 2]; } }
      let f1 = 81, f2 = 81, id = 0; for (let n = 0; n < 9; n++) { const ex = PX[n] - x, ey = PY[n] - y, d = ex * ex + ey * ey; if (d < f1) { f2 = f1; f1 = d; id = PI_[n]; } else if (d < f2) f2 = d; }
      const q = py * TS + px; F1[q] = f1 < 81 ? Math.sqrt(f1) : 9; F2[q] = f2 < 81 ? Math.sqrt(f2) : 9; ID[q] = id; } }
  F = { F1, F2, ID, r: [0, 0, 0] }; _QF.set(key, F); return F;
}
function qN(x, y, cells, oct = 4, s = 0) { if ((x | 0) === x && (y | 0) === y && x >= 0 && y >= 0 && x < TS && y < TS) return _nField(cells, oct, s)[y * TS + x]; x = x / TS * cells; y = y / TS * cells; let a = .5, t = 0, n = 0, p = cells; for (let i = 0; i < oct; i++) { t += a * _qv(x, y, p, s + i * 31); n += a; x *= 2; y *= 2; p *= 2; a *= .5; } return t / n; }
function qW(x, y, cells, s = 0) {
  if ((x | 0) === x && (y | 0) === y && x >= 0 && y >= 0 && x < TS && y < TS) { const F = _wField(cells, s), q = y * TS + x, r = F.r; r[0] = F.F1[q]; r[1] = F.F2[q]; r[2] = F.ID[q]; return r; }
  x = x / TS * cells; y = y / TS * cells; const p = cells, T = _qtab(p, s, 3), xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p, k = (wy * p + wx) * 3;
    if (T[k] < 0) { T[k] = hash2(wx, wy, s); T[k + 1] = hash2(wx, wy, s + 7); T[k + 2] = hash2(wx, wy, s + 13); }
    const d = hyp2(cx + T[k] - x, cy + T[k + 1] - y); if (d < f1) { f2 = f1; f1 = d; id = T[k + 2]; } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}
{ const add = TEX.add.bind(TEX); TEX.add = (name, fn) => add(name, (x, y) => { if (x === 0 && y === 0) { _QT.clear(); _QF.clear(); } return fn(x, y); }); }
// ---------- texture helpers ----------
function bricks(x, y, cw, ch, stag = .5) { const row = Math.floor(y / ch), ox = (row & 1) * cw * stag, xx = (x + ox) % TS, col = Math.floor(xx / cw), lx = xx - col * cw, ly = y - row * ch; return { e: Math.min(lx, cw - 1 - lx, ly, ch - 1 - ly), id: hash2(col, row, 7), lx, ly, row, col }; }
// pooled colour temporaries for texture code (ring buffer; every result is consumed within the same texel)
const _CP = Array.from({ length: 64 }, () => [0, 0, 0]); let _cpi = 0;
const mixP = (a, b, t) => { const r = _CP[_cpi = (_cpi + 1) & 63]; r[0] = a[0] + (b[0] - a[0]) * t; r[1] = a[1] + (b[1] - a[1]) * t; r[2] = a[2] + (b[2] - a[2]) * t; return r; };
const shP = (c, k) => { const r = _CP[_cpi = (_cpi + 1) & 63]; r[0] = c[0] * k; r[1] = c[1] * k; r[2] = c[2] * k; return r; };
const sh = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const grainy = (x, y, s) => (hash2(x, y, s) - .5);
const hashStr = s => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761); return h >>> 0; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], bayer = (x, y) => (BAYER[(x & 3) + (y & 3) * 4] + .5) / 16;
const CLEAR = [0, 0, 0, 0];
// raster-painted texture: draw(P, rnd) once, lazily (at TEX.build). P: px, disc, line, ell (all wrap unless P.wrap=false)
function texPaint(name, draw, o = {}) {
  let B = null;
  return TEX.add(name, (x, y) => {
    if (!B) {
      B = new Float32Array(TS * TS * 4); if (o.bg) for (let i = 0; i < TS * TS; i++) { const c = o.bg(i % TS, (i / TS) | 0); B.set([c[0], c[1], c[2], c.length > 3 ? c[3] : 255], i * 4); }
      const P = { wrap: o.wrap !== false,
        px(x, y, c) { x = Math.round(x); y = Math.round(y); if (P.wrap) { x = wrapi(x, TS); y = wrapi(y, TS); } else if (x < 0 || y < 0 || x >= TS || y >= TS) return; const i = (y * TS + x) * 4, cc = typeof c === 'function' ? c(x, y) : c; B[i] = cc[0]; B[i + 1] = cc[1]; B[i + 2] = cc[2]; B[i + 3] = cc.length > 3 ? cc[3] : 255; },
        disc(cx, cy, r, c) { for (let j = Math.floor(-r); j <= r; j++) for (let i = Math.floor(-r); i <= r; i++) if (i * i + j * j <= r * r + .25) P.px(cx + i, cy + j, typeof c === 'function' ? c(i / (r || 1), j / (r || 1)) : c); },
        line(x0, y0, x1, y1, w0, c, w1 = w0) { const n = Math.ceil(hyp2(x1 - x0, y1 - y0) * 1.5) + 1; for (let k = 0; k <= n; k++) { const t = k / n; P.disc(lerp(x0, x1, t), lerp(y0, y1, t), lerp(w0, w1, t) / 2, typeof c === 'function' ? c(t) : c); } },
        get(x, y) { const i = (wrapi(Math.round(y), TS) * TS + wrapi(Math.round(x), TS)) * 4; return [B[i], B[i + 1], B[i + 2], B[i + 3]]; } };
      draw(P, RNG(hashStr(name)));
      if (o.soft) { const A = new Float32Array(TS * TS); for (let i = 0; i < TS * TS; i++) A[i] = B[i * 4 + 3]; for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const i = y * TS + x; if (A[i]) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= TS || Y >= TS) continue; const j = Y * TS + X; if (A[j] > 200) { B.set([B[j * 4], B[j * 4 + 1], B[j * 4 + 2], 150], i * 4); break; } } } }
    }
    const i = (y * TS + x) * 4; return [B[i], B[i + 1], B[i + 2], B[i + 3]];
  });
}
// ---------- glyph textures: real Chinese characters from the GNU Unifont 16x16 bitmaps (font_cjk.js) ----------
// TEX.glyph(name, text, o): text = 'string' (one vertical column per string; array = several columns, read right->left),
//   or o.grid=[cols,rows] (one char per cell, row-major), or o.horiz (one row, right->left like Song tablets; o.ltr to flip),
//   or an array of items {t, x, y, s, sy, rot} in 0..1 texture units (x,y = centre, s = glyph width, sy = height/width factor).
// o: fg / bg = [r,g,b,a] or (x,y)=>color ; aspect = world width/height of the surface the WHOLE texture maps to (pre-squashes
//   glyphs so they look square in the world); fill (0..1 glyph size in its cell), bold (1-texel dilation; default on for big cells), erode (0..1).
// Glyphs are nearest-neighbour blocks: k = floor(cellPx/16) texels per font pixel when the cell is >= 16 texels.
// NOTE: characters come from font_cjk.js, generated from the game's .js sources: after adding new Chinese text run `node tool/unifont.js`.
// Characters missing from it fall back to the canvas system font (with a console warning).
TEX.FONTS = '"Songti SC","STSong","Songti TC","SimSun","Noto Serif CJK SC",serif';
TEX.glyph = function (name, text, o = {}) {
  let M = null;
  const build = () => {
    const a = o.aspect || 1, fill = o.fill || .84, items = [];
    if (Array.isArray(text) && typeof text[0] === 'object') items.push(...text);
    else if (o.grid) { const [C, Rw] = o.grid, ch = [...text]; ch.forEach((t, i) => items.push({ t, x: ((i % C) + .5) / C, y: (Math.floor(i / C) + .5) / Rw, s: Math.min(1 / C, 1 / (Rw * a)) * fill, sy: a })); }
    else if (o.horiz) { const ch = [...text], n = ch.length; ch.forEach((t, i) => { const k = o.ltr ? i : n - 1 - i; items.push({ t, x: (k + .5) / n, y: .5, s: Math.min(1 / n, 1 / a) * fill, sy: a }); }); }
    else { const cols = Array.isArray(text) ? text : [text], C = cols.length; cols.forEach((col, ci) => { const ch = [...col], n = ch.length, s = Math.min(1 / C, 1 / (n * a)) * fill; ch.forEach((t, k) => items.push({ t, x: 1 - (ci + .5) / C, y: (k + .5) / n, s, sy: a })); }); }
    M = new Uint8Array(TS * TS); const miss = [];
    for (const it of items) {
      const bits = typeof unifontBits === 'function' ? unifontBits(it.t) : null; if (!bits) { miss.push(it); continue; }
      const cw = it.s * TS, kx = cw >= 16 ? Math.floor(cw / 16) : cw / 16, ky = kx * (it.sy || 1), cx = it.x * TS, cy = it.y * TS, c = Math.cos(it.rot || 0), sn = Math.sin(it.rot || 0), R = Math.max(kx, ky) * 12;
      const bold = o.bold ?? kx >= 3, on = (fx, fy) => fx >= 0 && fy >= 0 && fx < 16 && fy < 16 && bits[fy * 16 + fx];
      for (let py = Math.max(0, Math.floor(cy - R)); py < Math.min(TS, Math.ceil(cy + R)); py++) for (let px = Math.max(0, Math.floor(cx - R)); px < Math.min(TS, Math.ceil(cx + R)); px++) {
        const dx = px + .5 - cx, dy = py + .5 - cy, lx = c * dx + sn * dy, ly = -sn * dx + c * dy, fx = Math.floor(lx / kx + 8), fy = Math.floor(ly / ky + 8);
        if (on(fx, fy) || (bold && (on(Math.floor((lx - 1) / kx + 8), fy) || on(fx, Math.floor((ly - 1) / ky + 8))))) M[py * TS + px] = 1;
      }
    }
    if (miss.length) { if (!TEX._gw) { TEX._gw = 1; console.warn('TEX.glyph: some characters have no Unifont bitmap (first: ' + name + '); using the canvas font'); }
      try { const S = 2, N = TS * S, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const it of miss) { g.setTransform(1, 0, 0, 1, it.x * N, it.y * N); if (it.rot) g.rotate(it.rot); g.scale(1, it.sy || 1); g.font = 'bold ' + Math.max(4, it.s * N) + 'px ' + (o.font || TEX.FONTS); g.fillText(it.t, 0, it.s * N * .04); }
        const d = g.getImageData(0, 0, N, N).data; for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { let s2 = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) s2 += d[((y * S + j) * N + x * S + i) * 4]; if (s2 / (S * S) > 100) M[y * TS + x] = 1; } } catch (e) { }
    }
    if (o.erode) for (let i = 0; i < M.length; i++) if (M[i] && qN(i % TS, (i / TS) | 0, 16, 3, 909) > 1 - o.erode * .5) M[i] = 0;
  };
  const fg = o.fg || [20, 16, 14], bg = o.bg || [220, 206, 170];
  return TEX.add(name, (x, y) => { if (!M) build(); const f = M[y * TS + x] ? fg : bg; return typeof f === 'function' ? f(x, y) : f; });
};
// UV rect of cell i in a TEX.glyph grid texture (for b.q4 / PROPS.board)
const glyphCell = (i, cols, rows) => [(i % cols) / cols, Math.floor(i / cols) / rows, 1 / cols, 1 / rows];

// ======================= surfaces =======================
TEX.add('white', () => [255, 255, 255]);
// grey limestone ashlar (bluish grey, lichen)
TEX.add('stone', (x, y) => {
  const b = bricks(x, y, 64, 32), n = qN(x, y, 16, 4, 1), n2 = qN(x, y, 4, 3, 2), w = qW(x, y, 8, 3);
  if (b.e < 1.5) return shP([62, 62, 64], .7 + n * .4);
  let k = .8 + b.id * .2 + (n - .5) * .35 + (n2 - .5) * .25 + grainy(x, y, 1) * .07;
  if (b.ly < 2 || b.lx < 2) k *= 1.1; if (b.ly > 29 || b.lx > 61) k *= .8; if (w[1] - w[0] < .04) k *= .7;
  const c = mixP([132, 132, 128], [108, 112, 116], n2); return shm(mixP(c, [98, 106, 88], sstep(.62, .8, qN(x, y, 8, 3, 9)) * .45), k);
});
// grey Song brick 青磚, running bond, lime joints (use uv ~1 for true scale)
TEX.add('brick', (x, y) => {
  const b = bricks(x, y, 32, 8), n = qN(x, y, 16, 3, 4), m = qN(x, y, 4, 3, 5);
  if (b.e < 1) return shP([150, 150, 142], .72 + n * .32);
  let k = .74 + b.id * .28 + (n - .5) * .35 + grainy(x, y, 2) * .1; if (b.ly < 1) k *= 1.1; if (b.ly > 6) k *= .86; if (hash2(b.col, b.row, 9) > .93) k *= .7;
  let c = mixP([98, 100, 102], [80, 84, 90], b.id); c = mixP(c, [124, 120, 108], sstep(.6, .8, m) * .35); return shP(c, k);
});
// square floor bricks 方磚 (worn)
TEX.add('pave', (x, y) => {
  const b = bricks(x, y, 32, 32, 0), n = qN(x, y, 16, 4, 140), w = qN(x, y, 4, 3, 141);
  if (b.e < 1.2) return shP([60, 60, 60], .7 + n * .4);
  let k = .78 + b.id * .22 + (n - .5) * .3 + grainy(x, y, 142) * .08; if (b.e < 3) k *= .92; if (hash2(x >> 2, y >> 2, 143) > .97) k *= .8;
  return shm(mixP([118, 118, 116], [96, 98, 102], b.id), k * (.9 + w * .2));
});
// rectangular paving bricks (street / courtyard), with dirt in joints
TEX.add('pave_rect', (x, y) => {
  const b = bricks(x, y, 32, 16), n = qN(x, y, 16, 4, 144), d = qN(x, y, 4, 3, 145);
  if (b.e < 1.2) return shP([70, 62, 54], .7 + n * .4);
  let k = .76 + b.id * .24 + (n - .5) * .32 + grainy(x, y, 146) * .09; if (b.ly < 1.5) k *= 1.06;
  return shm(mixm(mixP([110, 110, 108], [92, 94, 98], b.id), [104, 92, 76], sstep(.55, .8, d) * .5), k);
});
TEX.add('cobble', (x, y) => {
  const w = qW(x, y, 7, 5), n = qN(x, y, 16, 3, 6), e = w[1] - w[0];
  if (e < .08) return shP([44, 40, 36], .6 + n * .5);
  const k = (.65 + w[2] * .35 + (n - .5) * .35) * (1 - w[0] * .35) + grainy(x, y, 3) * .06;
  return shm(mixP([108, 106, 102], [88, 88, 86], w[2]), k);
});
// dark polished floor tile (halls)
TEX.add('tile', (x, y) => {
  const b = bricks(x, y, 32, 32, 0), n = qN(x, y, 8, 4, 8), w = qW(x, y, 5, 9);
  if (b.e < 1.2) return [34, 32, 30];
  let k = .85 + (n - .5) * .4 + b.id * .15; if (w[1] - w[0] < .04) k *= .7; if (b.lx + b.ly < 6) k *= 1.2;
  return shP(((b.col + b.row) & 1) ? [70, 70, 72] : [56, 56, 60], k);
});
TEX.add('plank', (x, y) => {
  const pw = 16, col = Math.floor(x / pw), lx = x % pw, id = hash2(col, 0, 11), off = id * 128, yy = (y + off) % TS;
  const g = qN(x * 6, yy * .5, 64, 3, 12 + col), n = qN(x, y, 8, 3, 13);
  let k = .62 + id * .3 + (g - .5) * .5 + (n - .5) * .2; if (lx < 1 || lx > 14) k *= .45; if (Math.floor(yy) === 60 || Math.floor(yy) === 61) k *= .5;
  if ((lx === 3 || lx === 12) && (Math.floor(yy) % 64 === 6)) return [40, 38, 36];
  return shm(mixP([118, 92, 66], [96, 90, 82], sstep(.5, .8, n)), k);
});
TEX.add('wood', (x, y) => { const g = qN(x * 8, y * .6, 128, 3, 15), n = qN(x, y, 4, 3, 16); const k = .55 + (g - .5) * .7 + (n - .5) * .3 + grainy(x, y, 5) * .08; return shP([104, 78, 56], k); });
TEX.add('dark_wood', (x, y) => {
  const g = qN(x * 6, y * .5, 96, 3, 150), n = qN(x, y, 8, 3, 151), kn = qW(x, y, 3, 152);
  let k = .6 + (g - .5) * .6 + (n - .5) * .3 + grainy(x, y, 153) * .08; if (kn[0] < .12) k *= .6 + kn[0] * 2;
  return shm(mixP([66, 48, 36], [52, 42, 36], n), k);
});
TEX.add('bark', (x, y) => { // pine bark: grey-red scaly plates
  const w = qW(x * .7, y * .35, 8, 154), n = qN(x, y, 8, 3, 155);
  let k = .55 + (w[1] - w[0]) * 1.2 + (n - .5) * .3; if (w[1] - w[0] < .06) k *= .4;
  return shm(mixP([118, 78, 58], [86, 76, 70], w[2] * .7 + n * .3), Math.min(k, 1.15));
});
TEX.add('bark_dark', (x, y) => { // deciduous bark: dark, vertical fissures
  const f = qN(x * 1.5, y * .2, 16, 3, 156), n = qN(x, y, 16, 3, 157); let k = .55 + (n - .5) * .4; if (Math.abs(f - .5) < .06) k *= .45;
  return shm(mixP([70, 62, 56], [52, 48, 46], n), k + grainy(x, y, 158) * .1);
});
TEX.add('metal', (x, y) => {
  const b = bricks(x, y, 64, 64, 0), n = qN(x, y, 16, 4, 20), s = qN(x * 4, y * .25, 32, 2, 21);
  let k = .6 + (n - .5) * .3 + (s - .5) * .15 + b.id * .15; if (b.e < 1.5) k *= .4; else if (b.e < 3) k *= 1.2;
  const rv = [[6, 6], [57, 6], [6, 57], [57, 57], [32, 6], [32, 57]]; for (const [rx, ry] of rv) { const d = hyp2(b.lx - rx, b.ly - ry); if (d < 2.2) k = d < 1.2 ? 1.3 : .35; }
  const r = qN(x, y, 8, 4, 22); return shm(mixP([92, 94, 98], [110, 64, 40], sstep(.55, .75, r)), k);
});
TEX.add('rust', (x, y) => { const n = qN(x, y, 8, 5, 23), m = qN(x, y, 32, 3, 24), p = qW(x, y, 12, 25); let c = mixP([120, 60, 30], [70, 40, 26], m); c = mixP(c, [60, 58, 56], sstep(.6, .7, n)); return shP(c, .7 + (n - .5) * .5 + (p[0] < .2 ? -.2 : 0) + grainy(x, y, 6) * .1); });
TEX.add('bronze', (x, y) => { const n = qN(x, y, 6, 5, 26), st = qN(x * .3, y * 2, 16, 3, 27), m = qN(x, y, 24, 3, 28); let c = mixP([156, 110, 58], [118, 82, 46], m); c = mixP(c, [70, 126, 104], sstep(.55, .8, st * .6 + n * .5)); return shP(c, .72 + (n - .5) * .4 + grainy(x, y, 7) * .07); });
TEX.add('patina', (x, y) => { // verdigris over bronze
  const n = qN(x, y, 8, 5, 160), m = qN(x, y, 4, 4, 161), c2 = qN(x, y, 16, 3, 162), w = qW(x, y, 20, 163);
  let c = mixP([96, 72, 46], [130, 96, 58], c2); const g = sstep(.38, .6, n); c = mixP(c, mixP([70, 132, 104], [66, 104, 130], sstep(.4, .7, m)), g);
  if (g > .5 && w[0] < .2) c = mixP(c, [150, 186, 160], .4); if (n < .3 && c2 > .6) c = mixP(c, [176, 132, 74], .5);
  return shP(c, .78 + (w[1] - w[0]) * .4 + grainy(x, y, 164) * .1);
});
TEX.add('brass', (x, y) => { const n = qN(x, y, 8, 4, 29), l = (Math.floor(y / 8) % 4 === 0) ? .7 : 1; return shm(mixP([196, 150, 70], [140, 100, 50], n), (.75 + (n - .5) * .4) * l + grainy(x, y, 8) * .06); });
TEX.add('iron', (x, y) => { const n = qN(x, y, 16, 5, 30), s = qN(x, y * .2, 32, 2, 31); return shP([70, 70, 76], .6 + (n - .5) * .5 + (s - .5) * .2 + grainy(x, y, 9) * .08); });
TEX.add('steel', (x, y) => { const n = qN(x, y, 8, 3, 120), s = qN(x * .2, y * 3, 32, 2, 121), f = Math.abs(x - 64) < 6 ? .82 : 1; return shP([190, 192, 198], (.8 + (s - .5) * .25 + (n - .5) * .15) * f + grainy(x, y, 19) * .05); });
TEX.add('gold', (x, y) => { // gold leaf squares over red bole, worn
  const b = bricks(x, y, 16, 16, .3), n = qN(x, y, 8, 4, 165), w = qN(x, y, 6, 4, 166);
  let c = mixP([222, 178, 80], [176, 126, 50], b.id * .5 + n * .5); if (b.e < 1) c = shP(c, .85); if (w > .68) c = mixP(c, [150, 60, 40], sstep(.68, .76, w));
  return shP(c, .85 + (qN(x * 3, y * .5, 16, 2, 167) - .5) * .4);
});
TEX.add('jade', (x, y) => { const n = qN(x, y, 4, 5, 168), v = Math.abs(qN(x, y, 6, 4, 169) - .5), d = qN(x, y, 16, 3, 170); let c = mixP([132, 170, 120], [92, 140, 104], n); if (v < .05) c = mixP(c, [200, 214, 180], (.05 - v) * 12); if (d > .72) c = shP(c, .82); return shP(c, .9 + grainy(x, y, 171) * .04); });
// ---------- organic (fever-things) ----------
TEX.add('flesh', (x, y) => {
  const w = qW(x, y, 10, 40), n = qN(x, y, 8, 4, 41), v = qN(x, y, 6, 4, 42), vein = Math.abs(v - .5) < .025, vein2 = Math.abs(qN(x, y, 12, 3, 43) - .5) < .02;
  let c = mixP([168, 64, 62], [110, 30, 38], n); c = mixP(c, [196, 110, 100], sstep(.15, 0, w[0]) * .5);
  if (vein) c = [80, 20, 48]; else if (vein2) c = [120, 40, 70]; if (hash2(x, y, 44) > .985) c = [230, 170, 160];
  return shP(c, .8 + (w[1] - w[0]) * .5 + grainy(x, y, 10) * .08);
});
TEX.add('muscle', (x, y) => { const f = qN(x * .25, y * 3, 32, 3, 45), n = qN(x, y, 8, 3, 46), s = Math.sin((x + f * 40) * .9) * .5 + .5; let c = mixP([150, 40, 40], [90, 20, 30], n); c = shP(c, .65 + s * .35 + (f - .5) * .3); if (qN(x, y, 4, 3, 47) > .68) c = mixP(c, [210, 190, 150], .6); return c; });
TEX.add('skin', (x, y) => { const n = qN(x, y, 8, 5, 48), wr = Math.abs(qN(x, y, 16, 3, 49) - .5) < .03, sp = qN(x, y, 32, 2, 50); let c = mixP([186, 160, 140], [140, 118, 112], n); if (wr) c = shP(c, .7); if (sp > .7) c = mixP(c, [120, 80, 90], .4); return shP(c, .85 + grainy(x, y, 11) * .1); });
TEX.add('paleskin', (x, y) => { const n = qN(x, y, 8, 5, 51), wr = Math.abs(qN(x, y * .3, 16, 3, 52) - .5) < .04, v = Math.abs(qN(x, y, 5, 4, 53) - .5) < .015; let c = mixP([196, 192, 178], [150, 152, 140], n); if (wr) c = shP(c, .75); if (v) c = [110, 100, 140]; return shP(c, .85 + grainy(x, y, 12) * .1); });
TEX.add('bone', (x, y) => { const n = qN(x, y, 8, 4, 54), p = qW(x, y, 20, 55), s = qN(x * .3, y * 2, 16, 3, 56); let c = mixP([222, 212, 186], [170, 156, 124], n * .7 + s * .3); if (p[0] < .12) c = shP(c, .7); return shP(c, .85 + grainy(x, y, 13) * .08); });
TEX.add('teeth', (x, y) => { const tw = 8, lx = x % tw, id = hash2(Math.floor(x / tw), 0, 57), len = 40 + id * 50; const n = qN(x, y, 8, 3, 58); if (y > len || lx === 0) return [70, 20, 26]; let c = mixP([236, 226, 196], [176, 160, 110], y / len * .7 + n * .3); if (lx < 2 || lx > 6) c = shP(c, .75); return c; });
TEX.add('eye', (x, y) => {
  const v = y / TS, n = qN(x, y, 16, 3, 59), st = qN(x * 3, y * .3, 64, 2, 60);
  if (v < .07) return [10, 6, 8]; if (v < .17) return shm(mixP([200, 150, 40], [140, 60, 20], st), .7 + (v - .07) * 4); if (v < .19) return [40, 20, 20];
  const vein = Math.abs(qN(x, y, 8, 4, 61) - .5) < .03 + v * .04; let c = mixP([236, 226, 210], [200, 120, 110], sstep(.3, .7, v));
  if (vein) c = [170, 30, 40]; if (v > .7) c = mixP([150, 40, 50], [90, 20, 30], n); return shP(c, .9 + (n - .5) * .2);
});
TEX.add('wax', (x, y) => { const d = qN(x * 4, y * .3, 64, 3, 62), n = qN(x, y, 8, 3, 63); let c = mixP([232, 214, 160], [200, 170, 110], d); return shP(c, .8 + (n - .5) * .3 + (d > .6 ? .12 : 0)); });
TEX.add('chitin', (x, y) => { const w = qW(x, y, 5, 64), n = qN(x, y, 8, 3, 65); let k = .5 + (1 - w[0]) * .5 + (n - .5) * .3; if (w[1] - w[0] < .05) k *= .3; return shm(mixP([60, 52, 50], [40, 46, 38], w[2]), k); });
TEX.add('gut', (x, y) => { const n = qN(x, y, 6, 4, 66), r = Math.sin(y * .45 + n * 6) * .5 + .5; return shm(mixP([190, 120, 110], [130, 60, 70], n), .7 + r * .35); });
// ---------- textiles, paper ----------
TEX.add('cloth', (x, y) => { const w = ((x & 1) ^ (y & 1)) ? .92 : 1.05, n = qN(x, y, 8, 4, 70), st = qN(x, y, 4, 3, 71); let c = mixP([120, 44, 36], [80, 34, 30], n); if (st > .65) c = mixP(c, [50, 36, 26], .5); return shP(c, w * (.8 + grainy(x, y, 14) * .1)); });
TEX.add('burlap', (x, y) => { const w = ((x >> 1 & 1) ^ (y >> 1 & 1)) ? .85 : 1.08, n = qN(x, y, 8, 4, 72); return shm(mixP([150, 128, 92], [110, 92, 66], n), w * (.85 + grainy(x, y, 15) * .1)); });
TEX.add('rope', (x, y) => { const s = Math.sin((x + y) * .8) * .5 + .5, n = qN(x, y, 8, 3, 73); return shP([150, 124, 84], .55 + s * .45 + (n - .5) * .2); });
TEX.add('silk', (x, y) => { // cream figured silk (tint with col); faint lozenge-and-medallion damask
  const lx = (x % 32) - 16, ly = (y % 32) - 16, r = hyp2(lx, ly), dm = (Math.abs(r - 9) < 1.2 || (r < 4 && ((x ^ y) & 1))) ? 1 : (Math.abs(Math.abs(lx) + Math.abs(ly) - 15) < 1 ? .6 : 0);
  const tw = ((x + (y >> 1)) & 3) === 0 ? .93 : 1, n = qN(x, y, 4, 3, 172), sheen = Math.sin(x * .05 + n * 4) * .06;
  return shm(mixP([212, 190, 150], [186, 160, 124], n), (.86 + dm * .08 + sheen) * tw);
});
TEX.add('brocade', (x, y) => { // indigo ground, gold roundels with red flowers, green lattice
  const cx = 32, row = Math.floor(y / 32), lx = ((x + (row & 1) * 16) % 32) - 16, ly = (y % 32) - 16, r = hyp2(lx, ly), a = Math.atan2(ly, lx), tw = ((x ^ y) & 1) ? .9 : 1.04;
  let c = [36, 42, 82];
  if (Math.abs(Math.abs(lx) - Math.abs(ly)) < 1.2 && r > 11) c = [52, 104, 82];
  if (r < 11) { c = [184, 140, 58]; if (r < 9) c = [44, 50, 92]; const pet = 5.5 + Math.cos(a * 5) * 2; if (r < pet) c = [164, 44, 40]; if (r < 2) c = [220, 180, 90]; }
  return shP(c, tw * (.85 + qN(x, y, 8, 3, 173) * .25));
});
TEX.add('felt', (x, y) => { const n = qN(x, y, 16, 5, 174), f = qN(x * 2, y * 2, 64, 2, 175); return shm(mixP([128, 116, 100], [96, 88, 80], n), .8 + (f - .5) * .4 + grainy(x, y, 176) * .14); });
TEX.add('straw', (x, y) => { // bound straw: strands along v, rope bands
  const sid = hash2(x >> 1, 0, 177), n = qN(x, y, 8, 3, 178), by = (y + 6) % 42;
  if (by < 6) { const s = Math.sin((x + by * 2.5) * .9) * .5 + .5; return shP([124, 98, 56], .6 + s * .4); }
  let c = mixP([196, 166, 92], [150, 120, 66], sid * .6 + n * .4); if ((x & 1) && hash2(x, y >> 3, 179) > .8) c = shP(c, .78);
  return shP(c, .8 + (qN(x * 4, y * .3, 32, 2, 180) - .5) * .4 + (by < 9 ? -.15 : 0));
});
TEX.add('mat', (x, y) => { // woven reed/bamboo mat (awnings, cart & boat hoods)
  const u = (x + y) >> 3, v = (x - y + 256) >> 3, over = ((u + v) & 1), lx = over ? (x + y) & 7 : (x - y + 256) & 7, s = Math.sin(lx / 7 * PI);
  const n = qN(x, y, 8, 3, 181); return shm(mixP([160, 128, 76], [120, 96, 60], n), (.62 + s * .42) * (over ? 1 : .9) + grainy(x, y, 182) * .06);
});
TEX.add('paper', (x, y) => { // xuan paper with faint columns of writing
  const n = qN(x, y, 8, 4, 74), cx = x % 16, ln = cx > 5 && cx < 10 && y > 8 && y < 120 && hash2(x >> 4, y >> 3, 75) > .35 && ((y & 7) < 6); let c = mixP([226, 214, 184], [196, 180, 148], n);
  if (ln) c = mixP(c, [60, 50, 44], .75); if (qN(x, y, 3, 3, 76) > .72) c = shP(c, .85); return c;
});
TEX.add('punchcard', (x, y) => { // woodblock-printed page (Su Song's treatise): frame, columns of tiny characters
  const n = qN(x, y, 8, 3, 77); let c = mixP([214, 196, 156], [190, 168, 126], n);
  const fr = (x > 4 && x < 7) || (x > 120 && x < 123) || (y > 4 && y < 7) || (y > 120 && y < 123); if (fr && x > 3 && x < 124 && y > 3 && y < 124) return [40, 30, 26];
  if (x > 9 && x < 119 && y > 9 && y < 119) { const cx = (x - 9) % 11, cy = (y - 9) % 9; if (cx === 10) return mixP(c, [80, 60, 50], .5); if (cx > 1 && cx < 9 && cy > 0 && cy < 8 && hash2((x - 9) / 11 | 0, ((y - 9) / 9 | 0) * 8 + (cy >> 1) * 3 + (cx >> 2), 78) > .45) return [36, 28, 24]; }
  return c;
});
TEX.add('paper_window', (x, y) => { // translucent window paper (use emi for lamplight)
  const n = qN(x, y, 8, 4, 183), f = qN(x * 3, y * .4, 32, 2, 184), seam = (y % 43) < 1;
  let c = mixP([232, 218, 182], [210, 192, 150], n); if (seam) c = shP(c, .9); if (qW(x, y, 3, 185)[0] < .05) c = mixP(c, [170, 140, 100], .5);
  return shP(c, .92 + (f - .5) * .12);
});
const winTex = (x, y, bar) => { const n = qN(x, y, 8, 3, 287), e = Math.min(x, y, 127 - x, 127 - y); if (e < 5) return shP([92, 60, 44], (e < 2 ? .7 : 1) * (.85 + n * .25)); if (bar(x, y)) return shP([96, 62, 44], .85 + n * .25); return shm(mixP([232, 218, 182], [206, 190, 150], qN(x, y, 8, 4, 288)), .92 + grainy(x, y, 289) * .05); };
TEX.add('window_bars', (x, y) => winTex(x, y, (x, y) => ((x - 5) % 11.8) < 4.4)); // 直櫺窗 vertical bars over window paper (opaque; use emi for lamplight)
TEX.add('window_grid', (x, y) => winTex(x, y, (x, y) => ((x - 5) % 19.7) < 3.4 || ((y - 5) % 19.7) < 3.4)); // 格子門 square lattice over paper
TEX.add('oilpaper', (x, y) => { // oiled-paper umbrella: radial ribs along u, thread rings along v
  const n = qN(x, y, 8, 4, 186), rib = (x % 8) < 1, ring = Math.abs(y - 40) < 1 || Math.abs(y - 96) < 1; let c = mixP([196, 126, 56], [160, 92, 40], n);
  if (rib) c = shP(c, .62); if (ring) c = mixP(c, [220, 200, 160], .6); return shP(c, .9 + (qN(x, y, 4, 2, 187) - .5) * .2);
});
TEX.add('lantern', (x, y) => { // red paper lantern skin with bamboo ribs (u around, v top->bottom)
  const n = qN(x, y, 8, 4, 188), rib = (y % 10) < 1.5, ws = qN(x, y, 16, 3, 189); let c = mixP([214, 44, 30], [176, 28, 24], n);
  if (rib) c = shP(c, .58); if (ws > .7) c = mixP(c, [120, 30, 24], .4); return shP(c, .95 + grainy(x, y, 190) * .06);
});
// ---------- terrain & nature ----------
TEX.add('sand', (x, y) => { const n = qN(x, y, 8, 5, 80), r = qN(x * .5, y * 2, 16, 3, 81); return shm(mixP([150, 136, 112], [118, 106, 90], n), .85 + (r - .5) * .25 + grainy(x, y, 16) * .1); });
TEX.add('mud', (x, y) => { const n = qN(x, y, 8, 5, 82), w = qW(x, y, 10, 83); return shm(mixP([70, 58, 46], [48, 40, 34], n), .8 + (w[0] * .3) + grainy(x, y, 17) * .1); });
TEX.add('grass', (x, y) => { const n = qN(x, y, 8, 4, 84), b = hash2(x, Math.floor(y / 3), 85); return shm(mixP([112, 104, 68], [74, 72, 48], n), .7 + b * .4); }); // dry winter grass
TEX.add('dirt', (x, y) => { const n = qN(x, y, 8, 5, 86), p = qW(x, y, 24, 87); return shm(mixP([104, 86, 64], [74, 60, 46], n), .8 + (p[0] < .15 ? .25 : 0) + grainy(x, y, 18) * .12); });
TEX.add('salt', (x, y) => { const w = qW(x, y, 9, 88), n = qN(x, y, 8, 4, 89); let k = .8 + (n - .5) * .3; if (w[1] - w[0] < .06) k *= .75; return shP([196, 194, 184], k); });
TEX.add('snow', (x, y) => { // fresh ground snow: soft drifts, blue in hollows, sparkle
  const n = qN(x, y, 4, 4, 191), d = qN(x, y, 16, 3, 192), g = grainy(x, y, 193);
  if (hash2(x, y, 194) > .993) return [255, 255, 255];
  return shm(mixP([236, 240, 248], [196, 206, 226], sstep(.62, .3, n) * .7 + (d < .35 ? .2 : 0)), .9 + (d - .5) * .12 + g * .05);
});
TEX.add('snow_tracks', (x, y) => { // trodden street snow: ruts along v, footprints, slush
  const n = qN(x, y, 4, 4, 195), u = x / TS, rut = Math.min(Math.abs(u - .3), Math.abs(u - .7)), wob = qN(x, y, 8, 3, 196);
  let c = mixP([228, 232, 242], [190, 198, 218], sstep(.6, .3, n) * .7), k = .9 + grainy(x, y, 197) * .06;
  const r = sstep(.07, .02, rut + (wob - .5) * .03); c = mixP(c, [150, 146, 146], r * .7); if (r > .6 && qN(x, y, 16, 3, 198) > .6) c = mixP(c, [104, 94, 84], .5);
  const fx = x % 32, fy = y % 40, fp = hyp2((fx - 12 - (Math.floor(y / 40) & 1) * 8) / 3, (fy - 20) / 6); if (fp < 1 && hash2(x >> 5, y / 40 | 0, 199) > .45) c = mixP(c, [168, 172, 190], .6);
  if (hash2(x, y, 200) > .996) return [250, 252, 255]; return shP(c, k);
});
TEX.add('rammed_earth', (x, y) => { // tamped loess layers (夯土), erosion streaks, putlog holes
  const Ly = 8, row = Math.floor(y / Ly), ly = y % Ly, rid = hash2(row, 0, 31), n = qN(x, y, 16, 4, 32), e = qN(x * 2, y * .15, 16, 3, 34);
  const hx = (x + row * 37) % 64; if (row % 4 === 0 && hx < 4 && ly < 3 && hash2(Math.floor((x + row * 37) / 64), row, 36) > .4) return [44, 34, 28];
  let c = mixP([156, 128, 94], [126, 102, 78], rid * .7 + n * .3), k = .84 + (n - .5) * .3 + grainy(x, y, 20) * .12;
  if (ly === 0) k *= .74; else if (ly === 1) k *= 1.08; k *= 1 - sstep(.6, .8, e) * .22;
  if (hash2(x >> 1, y >> 1, 35) > .985) c = [112, 104, 96]; return shP(c, k);
});
TEX.add('water', (x, y) => { const n = qN(x, y, 4, 4, 90), r = qN(x, y, 16, 2, 91); return shm(mixP([40, 58, 66], [24, 36, 44], n), .8 + (r > .62 ? .5 : 0)); });
TEX.add('ice', (x, y) => { // dark clear river ice: cracks, bubbles
  const n = qN(x, y, 4, 4, 201), w = qW(x, y, 3, 202), w2 = qW(x, y, 9, 203), d = qN(x, y, 16, 3, 204);
  let c = mixP([30, 58, 78], [44, 82, 100], n * .7 + d * .3);
  if (w[1] - w[0] < .025) c = mixP(c, [180, 206, 220], .8); else if (w2[1] - w2[0] < .03 && w2[2] > .5) c = mixP(c, [120, 156, 176], .5);
  const bx = x % 12 - 6, by = y % 12 - 6; if (hash2(x / 12 | 0, y / 12 | 0, 205) > .8 && Math.abs(hyp2(bx, by) - 1.6) < .7) c = mixP(c, [200, 220, 230], .6);
  return shP(c, .9 + (qN(x * 2, y * 2, 64, 2, 206) - .5) * .15);
});
TEX.add('ice_snow', (x, y) => { // canal ice with wind-blown snow patches
  const n = qN(x, y, 4, 4, 207) + (qN(x, y, 32, 2, 208) - .5) * .3;
  if (n > .52) { const k = sstep(.52, .62, n); return shm(mixP([196, 206, 224], [236, 240, 248], k), .9 + grainy(x, y, 209) * .06); }
  const w = qW(x, y, 4, 210); let c = mixP([38, 68, 88], [60, 92, 110], qN(x, y, 8, 3, 211)); if (w[1] - w[0] < .03) c = mixP(c, [170, 196, 212], .7); if (n > .45) c = mixP(c, [150, 170, 196], (n - .45) * 8);
  return c;
});
TEX.add('boulder', (x, y) => { // natural rock (garden rocks, rockeries, boulders): weathered grey-brown, cracks and pits, a little lichen — no masonry joints ('stone' is dressed blocks)
  const n = qN(x, y, 16, 4, 361), n2 = qN(x, y, 4, 3, 362), w = qW(x, y, 8, 3), crack = w[1] - w[0] < .035, lich = sstep(.66, .82, qN(x, y, 8, 3, 363));
  let k = .82 + (n - .5) * .45 + (n2 - .5) * .3 + grainy(x, y, 364) * .08; if (crack) k *= .62; const c = mixP([128, 124, 116], [102, 100, 96], n2);
  return shm(mixP(c, [104, 112, 84], lich * .5), k); });
TEX.add('taihu', (x, y) => { // pale porous Taihu limestone: holes, wrinkles
  const w = qW(x, y, 6, 212), w2 = qW(x, y, 14, 213), n = qN(x, y, 8, 4, 214), wr = Math.abs(qN(x, y * .7, 6, 4, 215) - .5);
  if (w[0] < .13) return shP([42, 42, 44], .8 + w[0] * 3); if (w[0] < .19) return shP([206, 206, 200], .95);
  let c = mixP([182, 182, 176], [148, 152, 148], n); if (wr < .03) c = shP(c, .68); if (w2[0] < .12) c = shP(c, .8); if (qN(x, y, 16, 3, 216) > .72) c = mixP(c, [128, 138, 112], .35);
  return shP(c, .9 + grainy(x, y, 217) * .08);
});
TEX.add('moss', (x, y) => { const n = qN(x, y, 16, 4, 97), b = hash2(x, y, 98); return shm(mixP([70, 96, 50], [40, 62, 40], n), .7 + b * .35); });
TEX.add('pine_n', (x, y) => { // opaque pine needle mass (pads)
  const s = Math.abs(Math.sin((x * .8 + y * .5) + qN(x, y, 8, 3, 218) * 9)), n = qN(x, y, 8, 4, 219), d = qW(x, y, 10, 220);
  let k = .6 + s * .4 + (n - .5) * .4; if (d[0] < .2) k *= .6; return shm(mixP([60, 90, 64], [40, 64, 52], n), k);
});
TEX.add('bamboo', (x, y) => { // culm along v: nodes every 64 px
  const ny = y % 64, n = qN(x, y, 8, 3, 221), f = qN(x * 4, y * .2, 64, 2, 222);
  let c = mixP([134, 142, 74], [104, 116, 60], n), k = .85 + (f - .5) * .3;
  if (ny < 2) k *= .6; else if (ny < 4) k *= 1.15; if (qW(x, y, 6, 223)[0] < .08) c = mixP(c, [90, 76, 50], .5); return shP(c, k);
});
TEX.add('embers', (x, y) => { const w = qW(x, y, 8, 224), n = qN(x, y, 8, 3, 225); const e = w[1] - w[0]; if (e < .1) return mixP([255, 180, 70], [200, 60, 20], e * 10); return shm(mixP([40, 30, 28], [70, 40, 30], n), .6 + w[0] * .5); });
// ---------- Song architecture surfaces ----------
TEX.add('plaster', (x, y) => { // whitewash with grime, cracks, rain streaks, fallen patches (straw-mud beneath)
  const n = qN(x, y, 8, 4, 226), st = qN(x * 3, y * .2, 32, 3, 227), w = qW(x, y, 5, 228), p = qN(x, y, 4, 4, 229);
  let c = mixP([216, 212, 200], [190, 186, 176], n); c = shP(c, 1 - sstep(.55, .75, st) * .12);
  if (w[1] - w[0] < .015) c = shP(c, .86);
  if (p > .8) { c = p > .82 ? mixP([158, 132, 98], [130, 110, 84], qN(x, y, 16, 2, 230)) : [120, 112, 100]; if (hash2(x, y, 231) > .9) c = [190, 160, 90]; }
  return shP(c, .93 + grainy(x, y, 232) * .05);
});
TEX.add('vermilion', (x, y) => { // 朱漆 lacquered column / door wood, weathered
  const n = qN(x, y, 8, 4, 233), g = qN(x * 4, y * .3, 32, 3, 234), w = qW(x, y, 6, 235), p = qN(x, y, 4, 5, 236);
  let c = mixP([168, 44, 28], [130, 32, 24], n * .6 + g * .4);
  if (w[1] - w[0] < .02) c = shP(c, .6); if (p > .76) c = p > .8 ? mixP([70, 50, 40], [60, 44, 36], g) : shP(c, .7);
  return shP(c, .9 + (g - .5) * .2 + grainy(x, y, 237) * .05);
});
TEX.add('lacquer_black', (x, y) => { const n = qN(x, y, 8, 4, 238), s = qN(x * .5, y * 3, 16, 2, 239), w = qW(x, y, 8, 240); let c = mixP([30, 26, 24], [44, 38, 34], s); if (w[1] - w[0] < .02) c = [56, 50, 44]; if (qN(x, y, 4, 4, 241) > .74) c = mixP(c, [92, 36, 26], .6); return shP(c, .9 + (n - .5) * .2); });
TEX.add('lacquer_red', (x, y) => { const n = qN(x, y, 8, 4, 242), s = qN(x * .5, y * 3, 16, 2, 243), w = qW(x, y, 8, 244); let c = mixP([158, 30, 24], [178, 46, 32], s); if (w[1] - w[0] < .02) c = shP(c, .7); if (qN(x, y, 4, 4, 245) > .75) c = mixP(c, [34, 26, 24], .7); return shP(c, .9 + (n - .5) * .16); });
TEX.add('celadon', (x, y) => { // Ru ware: sky-blue-green glaze, fine crackle
  const n = qN(x, y, 4, 4, 246), w = qW(x, y, 7, 247), w2 = qW(x, y, 17, 248); let c = mixP([156, 186, 178], [128, 162, 160], n);
  if (w[1] - w[0] < .03) c = shP(c, .78); else if (w2[1] - w2[0] < .04) c = shP(c, .88); if (hash2(x, y, 249) > .99) c = mixP(c, [220, 230, 226], .6);
  return shP(c, .95 + (qN(x * .5, y * 2, 8, 2, 250) - .5) * .1);
});
TEX.add('glaze', (x, y) => { // dark brown-black stoneware glaze (wine jars, Jian tea bowls): hare's-fur streaks along v
  const st = qN(x * 6, y * .25, 64, 3, 251), n = qN(x, y, 8, 3, 252); let c = mixP([40, 26, 20], [30, 22, 20], n); c = mixP(c, [126, 78, 44], sstep(.62, .78, st) * .7);
  return shP(c, .85 + (n - .5) * .3 + (y < 10 ? .15 : 0));
});
TEX.add('roof_tile', (x, y) => roofTileTex(x, y, false));
TEX.add('roof_tile_green', (x, y) => roofTileTex(x, y, true));
function roofTileTex(x, y, gl) { // rows of round cover tiles (u) over pan-tile channels; courses run along v (down the slope)
  const P = 16, lx = x % P, col = Math.floor(x / P), oy = (hash2(col, 0, 40) * 24) | 0, yy = (y + oy) % 24, seg = Math.floor((y + oy) / 24), id = hash2(col, seg, 41);
  const n = qN(x, y, 16, 3, 42), g = qN(x, y, 4, 3, 43), base = gl ? [62, 116, 78] : [104, 106, 112];
  let c = base, k;
  if (lx < 11) { const t = (lx - 5) / 5.5; k = .58 + Math.cos(t * 1.4) * .52 - (t > 0 ? t * .14 : 0); if (gl && Math.abs(t + .3) < .18) k *= 1.3; if (yy < 2) k *= .5; else if (yy < 4) k *= 1.1; }
  else { k = .4 + (n - .5) * .14; if ((y + 7) % 24 < 2) k *= .7; c = gl ? [70, 96, 66] : shP(base, .9); }
  k *= .9 + id * .18 + (n - .5) * .22 + grainy(x, y, 44) * .07;
  if (gl && hash2(col, seg, 45) > .88 && lx < 11) c = [110, 108, 104]; // glaze lost
  c = mixP(c, gl ? [74, 84, 60] : [76, 84, 66], sstep(.62, .82, g) * .45);
  return shP(c, k);
}
TEX.add('roof_ridge', (x, y) => { // ridge of stacked flat tiles
  const ly = y % 7, n = qN(x, y, 16, 3, 253), b = bricks(x, y, 22, 7); let k = .78 + b.id * .2 + (n - .5) * .3; if (ly === 0) k *= .55; else if (ly === 1) k *= 1.15; if (b.lx < 1) k *= .8;
  return shm(mixP([100, 102, 108], [86, 90, 96], n), k + grainy(x, y, 254) * .06);
});
TEX.add('tile_end', (x, y) => { // eave fascia (v 0 top -> 1 bottom, ~0.3 m): round tile-ends 瓦當 over lipped drip tiles, rafter ends below
  const wx = x / 64, wy = y / TS * .32, lx = (wx % .25) - .085, n = qN(x, y, 8, 3, 255);
  const d = hyp2(lx, wy - .08);
  if (d < .07) { const k = d < .025 ? 1.05 : Math.abs(d - .05) < .008 ? .7 : .92 - d * 2; return shP([112, 114, 120], k + (n - .5) * .2); }
  if (wy < .15) { if (Math.abs(lx) < .1 && wy < .12) return shP([60, 62, 66], .7); const lip = wy > .11 && wy < .15 + Math.sin(x * .4) * .006; return lip ? shP([104, 106, 112], .8 + (n - .5) * .3) : shP([46, 48, 52], .8); }
  const rx = ((wx + .125) % .25) - .125, rd = hyp2(rx, (wy - .245) * 1.1); if (rd < .05) return rd < .035 ? shP([120, 84, 56], .9 + n * .2) : [40, 30, 24];
  return shP([46, 36, 30], .6 + n * .3);
});
TEX.add('rafters', (x, y) => { // eave underside: round rafters (along v) over boards
  const lx = x % 16, n = qN(x, y, 8, 3, 256), g = qN(x * 4, y * .4, 32, 2, 257);
  if (lx < 10) { const t = (lx - 4.5) / 5; return shm(mixP([110, 74, 50], [90, 62, 44], g), .55 + Math.cos(t * 1.3) * .45 + (n - .5) * .15); }
  return shm(mixP([134, 104, 72], [110, 88, 64], n), .55 + (g - .5) * .2);
});
// 碾玉裝 jade paint (per-face 0..1): white edging, layered blue-green bands 疊暈, worn
TEX.add('paint_jade', (x, y) => {
  const e = Math.min(x, y, 127 - x, 127 - y), n = qN(x, y, 8, 3, 258), w = sstep(.64, .82, qN(x, y, 6, 4, 259)), alt = qN(x, y, 2, 2, 260) > .5;
  let c = e < 3 ? [70, 52, 40] : e < 9 ? [214, 210, 192] : e < 18 ? [128, 182, 160] : e < 30 ? [58, 132, 110] : alt ? [44, 84, 128] : [36, 98, 96];
  if (e >= 30 && Math.abs(((x + y) % 32) - 16) < 1.5 && e > 40) c = [90, 150, 160];
  c = mixP(c, [120, 90, 66], w * .6); return shP(c, .88 + (n - .5) * .25 + grainy(x, y, 261) * .06);
});
TEX.add('beam_jade', (x, y) => { // long members (u along length, v 0..1 across)
  const e = Math.min(y, 127 - y), ue = Math.min(x, 127 - x), n = qN(x, y, 8, 3, 262), w = sstep(.66, .84, qN(x, y, 6, 4, 263));
  let c = e < 5 ? [70, 52, 40] : e < 14 ? [214, 210, 192] : e < 28 ? [124, 178, 158] : e < 44 ? [56, 130, 108] : [42, 86, 128];
  if (ue < 10) c = ue < 3 ? [214, 210, 192] : [150, 60, 44]; else if (e >= 44 && (((x >> 3) + (y >> 3)) & 1) && ue > 20) c = [52, 100, 132];
  c = mixP(c, [120, 90, 66], w * .55); return shP(c, .88 + (n - .5) * .25);
});
// 丹粉刷飾 red ochre with white lines
TEX.add('paint_ochre', (x, y) => {
  const e = Math.min(x, y, 127 - x, 127 - y), n = qN(x, y, 8, 3, 264), w = sstep(.66, .84, qN(x, y, 6, 4, 265));
  let c = (e > 7 && e < 13) ? [222, 212, 190] : e < 3 ? [80, 40, 30] : mixP([152, 66, 42], [128, 52, 36], n); c = mixP(c, [110, 84, 64], w * .6);
  return shP(c, .9 + (n - .5) * .2 + grainy(x, y, 266) * .06);
});
TEX.add('beam_ochre', (x, y) => { const e = Math.min(y, 127 - y), n = qN(x, y, 8, 3, 267), w = sstep(.66, .84, qN(x, y, 6, 4, 268)); let c = (e > 9 && e < 17) ? [222, 212, 190] : e < 4 ? [80, 40, 30] : mixP([150, 64, 40], [126, 50, 34], n); c = mixP(c, [110, 84, 64], w * .55); return shP(c, .9 + (n - .5) * .2); });
TEX.add('ceiling_plain', (x, y) => { // 平闇: the ordinary ceiling — a close lattice of thin square-section battens over plain boards, unpainted, smoke-darkened
  const lx = x % 16, ly = y % 16, n = qN(x, y, 8, 4, 271), g = grainy(x, y, 272) * .08, board = mixP([118, 92, 66], [96, 72, 52], n), bat = lx < 2 || ly < 2;
  return bat ? shm([70, 52, 38], .9 + g) : shm(board, .88 + g + (((x >> 5) + (y >> 6)) & 1 ? .04 : -.02)); });
TEX.add('ceiling', (x, y) => { // 平棊 coffers: green frames with white edge, blue panels, central flower (palaces, great temple halls, the highest ranks only)
  const lx = x % 64, ly = y % 64, e = Math.min(lx, ly, 63 - lx, 63 - ly), r = hyp2(lx - 31.5, ly - 31.5), a = Math.atan2(ly - 31.5, lx - 31.5), n = qN(x, y, 8, 3, 269);
  let c = e < 4 ? [44, 92, 76] : e < 6 ? [210, 206, 186] : [40, 66, 108];
  if (e >= 6) { const p = 9 + Math.cos(a * 8) * 3; if (r < p) c = r < 4 ? [216, 176, 80] : r < 7 ? [160, 50, 44] : [60, 130, 104]; else if (Math.abs(r - 17) < 1) c = [160, 140, 90]; }
  return shP(c, .82 + (n - .5) * .3);
});
TEX.add('door_studs', (x, y) => { // vermilion gate leaf with rows of gilt nails 門釘
  const lx = (x % 16) - 8, ly = (y % 16) - 8, d = hyp2(lx, ly), n = qN(x, y, 8, 4, 270), p = qN(x, y, 4, 5, 271);
  if (d < 4) return shP([226, 180, 80], .65 + (1 - d / 4) * .5 - (lx + ly) * .03); if (d < 5) return [70, 30, 20];
  let c = mixP([166, 40, 28], [132, 32, 24], n); if (x % 32 === 0) c = shP(c, .6); if (p > .7) c = mixP(c, [90, 60, 44], .7); return shP(c, .9 + grainy(x, y, 272) * .06);
});
TEX.add('shutter', (x, y) => { // removable shop-front boards 板搭: vertical boards, numbered dark marks
  const b = x % 21, n = qN(x, y, 8, 3, 273), g = qN(x * 4, y * .4, 32, 2, 274); let k = .6 + (g - .5) * .5 + (n - .5) * .2 + hash2(x / 21 | 0, 0, 275) * .2; if (b < 1) k *= .4;
  if (b > 8 && b < 13 && y > 10 && y < 14) k *= .5; return shm(mixP([110, 84, 60], [84, 72, 62], n), k);
});
TEX.add('cash', (x, y) => { // copper cash pile (face-on coins with square holes)
  const w = qW(x, y, 9, 276), n = qN(x, y, 8, 3, 277); if (w[0] > .5) return shP([40, 30, 22], .7 + n * .3);
  const lx = Math.abs(w[0] * Math.cos(w[2] * 9)), k = w[0] < .12 ? 0 : w[0] > .42 ? .7 : 1; if (w[0] < .14) return [30, 22, 18];
  return shm(mixP([170, 120, 60], [98, 120, 90], sstep(.6, .8, n)), .7 + k * .25 + (w[1] - w[0]) * .3 + lx * .02);
});
TEX.add('cash_str', (x, y) => { const ly = y % 4, n = qN(x, y, 8, 3, 278), id = hash2(y >> 2, 0, 279); let c = mixP([168, 118, 60], [100, 120, 88], sstep(.6, .8, n + id * .2)); return shP(c, ly === 0 ? .45 : .75 + id * .3 + (x / TS - .5) * .2); });
TEX.add('leiwen', (x, y) => leiTex(x, y)); // thunder-spiral ground (bronzes, borders)
function leiH(x, y) { const lx = ((x % 16) + 16) % 16, ly = ((y % 16) + 16) % 16, r = Math.max(Math.abs(lx - 7.5), Math.abs(ly - 7.5)); return (r % 4 < 2 && !(r > 5 && lx > 7 && ly < 3)) ? 1 : 0; }
function leiTex(x, y) { const h = leiH(x, y), d = h - leiH(x + 1, y + 1), n = qN(x, y, 8, 4, 280), p = sstep(.45, .65, qN(x, y, 6, 4, 281)); let c = mixP([120, 88, 52], [70, 128, 100], h ? p * .6 : .4 + p * .5); return shP(c, (h ? 1 : .6) + d * .25 + (n - .5) * .25); }
TEX.add('taotie', (x, y) => { // tāotiè mask (symmetric) on leiwen ground, cast relief with patina in the recesses
  const H = (x, y) => { const ax = Math.abs(x - 63.5), Y = y; const m = (ax < 54 && Y > 18 && Y < 118 && (ax < 44 || Y > 30) && !(ax > 30 && Y > 100));
    if (!m) return leiH(x, y) * .5; const eye = hyp2((ax - 22) / 11, (Y - 54) / 7.5); if (eye < .45) return 1.2; if (eye < 1) return .35; if (Math.abs(eye - 1.25) < .15) return .35;
    if (ax < 5 && Y > 34 && Y < 96) return 1.15; if (Y > 96 && ax < 26 && Math.abs((ax % 9) - 4.5) < 2.5) return 1.1; const br = Math.abs(Y - (40 - ax * .25 + Math.sin(ax * .2) * 3)); if (br < 2.5 && ax > 10) return 1.1;
    const cr = hyp2(ax - 42, Y - 80); if (Math.abs(cr - 7) < 1.6 || cr < 2) return 1.1; return leiH(x, y) ? .85 : .7; };
  const h = H(x, y), d = h - H(x + 1, y + 1), n = qN(x, y, 8, 4, 282), p = sstep(.4, .65, qN(x, y, 6, 4, 283) + (1 - h) * .35);
  return shm(mixP([128, 94, 56], [72, 130, 104], p), .5 + h * .45 + d * .5 + (n - .5) * .2);
});
// ---------- cutouts (alpha) ----------
TEX.add('reeds', (x, y) => { const c = Math.floor(x / 6), h = 20 + hash2(c, 0, 100) * 100, lx = x % 6, bend = Math.sin(y * .05 + c) * 1.5; if (y < TS - h || Math.abs(lx - 3 - bend * (1 - y / TS)) > 1.2) return CLEAR; return shm(mixP([150, 136, 84], [96, 88, 56], y / TS), .8 + hash2(c, 1, 101) * .4); });
TEX.add('weeds', (x, y) => { const n = qN(x, y, 8, 3, 102), bl = Math.abs(Math.sin(x * .7 + n * 3)) > .7 && y > 30 + hash2(Math.floor(x / 3), 0, 103) * 60; if (!bl) return CLEAR; return shP([120, 108, 66], .6 + (y / TS) * .3); });
TEX.add('chain', (x, y) => { const ly = y % 32, lx = x - 64, ring = ly < 16 ? Math.abs(hyp2(lx, (ly - 8) * 1.6) - 18) < 5 && Math.abs(lx) > 0 : Math.abs(lx) < 6; if (!ring) return CLEAR; return shP([90, 84, 80], .6 + qN(x, y, 8, 2, 104) * .5); });
TEX.add('grate', (x, y) => { if ((x % 16) > 3 && (y % 16) > 3) return CLEAR; return shP([80, 76, 70], .7 + qN(x, y, 8, 3, 105) * .4); });
TEX.add('roots', (x, y) => { const n = qN(x, y, 4, 4, 106), r = Math.abs(Math.sin(x * .3 + n * 9)) > .85 || Math.abs(Math.sin(y * .2 + n * 7 + x * .05)) > .93; if (!r) return CLEAR; return shP([90, 70, 50], .6 + n * .4); });
TEX.add('cobweb', (x, y) => { const dx = x - 64, dy = y - 64, a = Math.atan2(dy, dx), d = hyp2(dx, dy); const s = Math.abs(((a / TAU * 12) % 1 + 1) % 1 - .5) < .03 || Math.abs((d % 12) - 6) < .6; return s && d < 62 ? [200, 200, 200, 255] : CLEAR; });
TEX.add('runes', (x, y) => { const cx = x >> 4, cy = y >> 4, lx = x & 15, ly = y & 15, h = hash2(cx, cy, 117); const seg = (lx > 3 && lx < 6 && h > .3) || (ly > 3 && ly < 6 && h > .5) || (lx > 9 && lx < 12 && h < .7) || (ly > 10 && ly < 13 && h > .2); return (seg && lx > 2 && lx < 13 && ly > 2 && ly < 13) ? [255, 255, 255, 255] : CLEAR; });
TEX.add('lattice', (x, y) => { // 直櫺窗 vertical-bar window (frame + diamond-section bars); tint with col
  const e = Math.min(x, y, 127 - x, 127 - y), n = qN(x, y, 8, 3, 284); if (e < 7) return shP([120, 84, 58], (e < 2 ? .7 : 1) * (.85 + n * .25));
  const lx = (x - 7) % 11.4; if (lx > 5.2) return CLEAR; return shP([124, 86, 58], (lx < 2.6 ? 1.05 : .7) * (.85 + n * .25));
});
TEX.add('lattice_sq', (x, y) => { // 格子門 square lattice (frame + grid)
  const e = Math.min(x, y, 127 - x, 127 - y), n = qN(x, y, 8, 3, 285); if (e < 6) return shP([120, 84, 58], (e < 2 ? .7 : 1) * (.85 + n * .25));
  const lx = (x - 6) % 23.2, ly = (y - 6) % 23.2; if (lx > 4.5 && ly > 4.5) return CLEAR; return shP([124, 86, 58], (lx <= 4.5 && ly <= 4.5 ? 1.1 : lx <= 4.5 ? .95 : .8) * (.85 + n * .25));
});
TEX.add('rail_panel', (x, y) => { // Song 勾片 openwork railing panel: interlocking hooked lozenges in a frame
  const e = Math.min(x, y, 127 - x, 127 - y); if (e < 6) return shP([200, 196, 186], .85 + qN(x, y, 8, 3, 286) * .2);
  const u = (x - 6) / 116, v = (y - 6) / 116, a = Math.abs(((u * 2 + v * 1) % 1) - .5), b = Math.abs(((u * 2 - v * 1 + 4) % 1) - .5), hook = Math.abs(hyp2(((u * 4) % 1) - .5, ((v * 2) % 1) - .5) - .3) < .05;
  if (Math.min(a, b) < .07 || hook) return shP([200, 196, 186], .8 + qN(x, y, 8, 3, 287) * .25); return CLEAR;
});
texPaint('pine', (P, r) => { // needle sprays (cards around pine pads)
  for (let k = 0; k < 26; k++) { const cx = 14 + r() * 100, cy = 18 + r() * 92, a0 = r() * TAU; for (let i = 0; i < 26; i++) { const a = a0 + i / 26 * TAU + r() * .2, l = 7 + r() * 9, c = shm(mixP([46, 72, 50], [30, 50, 40], r()), .75 + r() * .4); P.line(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * .8, 1, c); } P.disc(cx, cy, 3, [34, 50, 40]); }
}, { wrap: false });
texPaint('branches', (P, r) => { // bare twigs, rooted at the bottom centre
  const br = (x, y, a, l, w, d) => { const x1 = x + Math.cos(a) * l, y1 = y - Math.sin(a) * l; P.line(x, y, x1, y1, w, t => shP([58, 50, 46], .8 + t * .3), w * .7); if (d > 0) { const n = 2 + (r() < .5); for (let i = 0; i < n; i++) br(x1, y1, a + (r() - .5) * 1.4, l * (.6 + r() * .2), w * .7, d - 1); } };
  br(64, 127, PI / 2, 36, 3.2, 5);
}, { wrap: false, soft: true });
function plumTex(P, r, pet, ctr) {
  const br = (x, y, a, l, w, d) => { let px = x, py = y; const seg = 3; for (let s = 0; s < seg; s++) { const aa = a + (r() - .5) * .9, x1 = px + Math.cos(aa) * l / seg, y1 = py - Math.sin(aa) * l / seg; P.line(px, py, x1, y1, w, [52, 40, 36]); px = x1; py = y1; if (r() < .45) { const fx = px + (r() - .5) * 5, fy = py + (r() - .5) * 5, R0 = 1.1 + r() * .9; for (let q = 0; q < 5; q++) { const qa = q / 5 * TAU + r(); P.disc(fx + Math.cos(qa) * R0, fy + Math.sin(qa) * R0, R0 * .75, shP(pet, .85 + r() * .25)); } P.disc(fx, fy, .8, ctr); } } if (d > 0) for (let i = 0; i < 2; i++) br(px, py, a + (i ? .7 : -.6) * (.6 + r()), l * .65, w * .65, d - 1); };
  br(64, 127, PI / 2 + (r() - .5) * .3, 50, 3, 4);
}
texPaint('plum', (P, r) => plumTex(P, r, [200, 36, 54], [250, 210, 120]), { wrap: false, soft: true });
texPaint('plum_w', (P, r) => plumTex(P, r, [238, 234, 226], [230, 200, 90]), { wrap: false, soft: true });
texPaint('willow', (P, r) => { // bare winter willow: drooping yellowish strands hanging from the top edge
  for (let k = 0; k < 46; k++) { let x = r() * 128, y = 0; const len = 60 + r() * 68, dx = (r() - .5) * .25, c = shm(mixP([162, 150, 84], [118, 108, 64], r()), .8 + r() * .3); for (let s = 0; s < len; s++) { P.px(x, y, c); if (r() < .06) P.px(x + 1, y, [190, 180, 110]); x += dx + Math.sin(s * .05 + k) * .15; y += 1; } }
}, { wrap: false, soft: true });
texPaint('bamboo_leaf', (P, r) => { // lanceolate leaf clusters on twigs
  for (let k = 0; k < 16; k++) { const cx = 10 + r() * 108, cy = 10 + r() * 80; for (let i = 0; i < 5; i++) { const a = PI * (.15 + r() * .7) + PI, l = 16 + r() * 14, c = shm(mixP([58, 92, 56], [40, 66, 44], r()), .8 + r() * .35); const ex = cx + Math.cos(a) * l * .3, ey = cy - Math.sin(a) * l; P.line(cx, cy, ex, ey, 3.4, c, .6); } P.line(cx, cy, cx + (r() - .5) * 20, cy - 12, 1, [80, 86, 52]); }
}, { wrap: false });
// ---------- glyph textures ----------
const _gc = (a, b, s) => (x, y) => shm(mixP(a, b, qN(x, y, 8, 3, s)), .92 + grainy(x, y, s + 1) * .08); // mottled background
const _frame = (inner, edge, w, s) => (x, y) => Math.min(x, y, 127 - x, 127 - y) < w ? shP(edge, .9 + grainy(x, y, s) * .1) : inner(x, y);
TEX.glyph('sign_jiu', '酒', { aspect: .45, fill: .78, fg: (x, y) => shP([234, 228, 210], .92 + grainy(x, y, 300) * .08), bg: _frame(_gc([56, 74, 110], [40, 54, 88], 301), [214, 206, 186], 6, 302) }); // blue wine flag 青帘
TEX.glyph('sign_cha', '茶', { aspect: .5, fill: .7, fg: _gc([226, 186, 90], [190, 140, 60], 303), bg: _frame(_gc([34, 28, 26], [48, 40, 34], 304), [120, 44, 30], 8, 305) });
TEX.glyph('sign_zhengdian', '正店', { aspect: .35, fg: _gc([226, 186, 90], [190, 140, 60], 306), bg: _frame(_gc([30, 26, 24], [46, 38, 32], 307), [140, 50, 34], 8, 308) });
TEX.glyph('sign_shop', '孫羊正店', { aspect: .25, fill: .9, fg: _gc([226, 186, 90], [190, 140, 60], 309), bg: _frame(_gc([30, 26, 24], [46, 38, 32], 310), [140, 50, 34], 8, 311) });
TEX.glyph('sign_xiang', '香', { aspect: .5, fill: .72, fg: [30, 24, 22], bg: _frame(_gc([214, 198, 160], [190, 172, 134], 312), [60, 46, 38], 7, 313) });
TEX.glyph('sign_yao', '藥', { aspect: .5, fill: .72, fg: [30, 24, 22], bg: _frame(_gc([214, 198, 160], [190, 172, 134], 314), [60, 46, 38], 7, 315) });
TEX.glyph('tablet_xuande', '宣德門', { aspect: .42, fill: .86, fg: _gc([232, 196, 100], [200, 150, 66], 316), bg: _frame(_gc([36, 60, 92], [28, 46, 74], 317), [200, 160, 80], 9, 318) });
TEX.glyph('tablet_xuanhua', '宣化門', { aspect: .42, fill: .86, fg: _gc([232, 196, 100], [200, 150, 66], 319), bg: _frame(_gc([36, 60, 92], [28, 46, 74], 320), [200, 160, 80], 9, 321) });
// round 9 — Tang shop signs (not Song signboards): wine flags 酒旗 / 青帘 and ~30% of shops with a small lacquered name board 牌 over the door
// (dark ground, gilt or pale characters, read right->left). Fixed pools, created at load in workers and the main thread alike.
TEX.glyph('flag_qing', ' ', { aspect: .3, fill: .1, fg: [0, 0, 0, 0], bg: _frame(_gc([52, 70, 108], [38, 52, 86], 330), [214, 206, 186], 7, 331) }); // plain indigo 青旗, pale hem
TEX.glyph('flag_bai', ' ', { aspect: .3, fill: .1, fg: [0, 0, 0, 0], bg: _frame(_gc([226, 220, 202], [204, 196, 176], 332), [56, 72, 108], 7, 333) }); // plain white flag, indigo hem
TEX.glyph('sign_jiu_w', '酒', { aspect: .3, fill: .7, fg: (x, y) => shP([46, 60, 96], .92 + grainy(x, y, 334) * .08), bg: _frame(_gc([226, 220, 202], [204, 196, 176], 335), [56, 72, 108], 7, 336) }); // white flag, indigo 酒
const SHOP_NAMES = { bakery: ['張家胡餅', '趙家餅肆'], medicine: ['王氏藥肆', '楊家藥行'], cloth: ['李家帛行', '劉家絹行'], silk: ['劉家絹行', '李家帛行'], wine: ['魏家酒肆', '何家酒肆'], books: ['陳氏書肆'], tea: ['鄭家茶肆'],
  smith: ['孫家鐵行'], grain: ['周家米行'], rope: ['吳氏繩肆'], butcher: ['高家肉行'], pottery: ['曹家陶肆'], dyer: ['宋家染肆'] };
{ const done = new Set(); let k = 340; for (const nm of Object.values(SHOP_NAMES).flat()) { if (done.has(nm)) continue; done.add(nm); const gilt = k % 2 === 0;
  TEX.glyph('nb_' + nm, nm, { horiz: true, aspect: 3.4, fill: .95, fg: gilt ? _gc([232, 196, 100], [196, 150, 66], k) : (x, y) => shP([226, 218, 196], .92 + grainy(x, y, k) * .08), bg: _frame(_gc([34, 26, 24], [50, 38, 32], k + 1), gilt ? [120, 40, 30] : [150, 120, 70], 5, k + 2) }); k += 3; } }
TEX.glyph('hours', '子丑寅卯辰巳午未申酉戌亥', { grid: [4, 3], fill: .72, fg: [26, 20, 18], bg: (x, y) => { const lx = x % 32, ly = y % 42.67, e = Math.min(lx, ly, 31 - lx, 41.6 - ly); return e < 2 ? [150, 36, 28] : shm(mixP([226, 214, 186], [200, 186, 152], qN(x, y, 8, 3, 322)), .95); } });
TEX.glyph('talisman', [{ t: '敕', x: .32, y: .1, s: .3, sy: .55 }, { t: '令', x: .68, y: .1, s: .3, sy: .55 }, { t: '六', x: .5, y: .3, s: .5, sy: .42 }, { t: '甲', x: .5, y: .48, s: .5, sy: .42 }, { t: '神', x: .5, y: .66, s: .5, sy: .42 }, { t: '兵', x: .5, y: .84, s: .5, sy: .42 }],
  { fg: (x, y) => shP([186, 30, 26], .9 + grainy(x, y, 323) * .15), bg: (x, y) => { const sq = Math.abs(x - 64 + Math.sin(y * .3) * 10) < 2 && y > 96 && y < 124, e = Math.min(x, 127 - x); return sq ? [186, 36, 28] : e < 3 ? [196, 150, 60] : shm(mixP([228, 192, 84], [204, 164, 64], qN(x, y, 8, 3, 324)), .95 + grainy(x, y, 325) * .06); } });
TEX.glyph('rubbing', ['天地玄黃宇宙', '洪荒日月盈昃', '辰宿列張寒來', '暑往秋收冬藏'], { fill: .8, erode: .5, fg: (x, y) => shP([222, 220, 210], .8 + qN(x, y, 16, 3, 326) * .25), bg: (x, y) => shm(mixP([22, 20, 20], [46, 42, 40], qN(x, y, 8, 4, 327)), .9 + grainy(x, y, 328) * .2) });
TEX.add('stele_text', (x, y) => { // a weathered stele face: a framed field of incised columns, worn past reading (no particular text: the old game's 宣和 inscription is gone)
  const bg = shm(mixP([128, 128, 124], [110, 112, 112], qN(x, y, 8, 4, 330)), .92 + grainy(x, y, 331) * .06), fr = x < 8 || x > 119 || y < 8 || y > 119, col = Math.floor((x - 12) / 9.4), cx = (x - 12) % 9.4;
  if (fr) return (x > 4 && x < 123 && y > 4 && y < 123 && (x === 6 || x === 121 || y === 6 || y === 121)) ? shm(bg, .8) : bg;
  const ch = Math.floor((y - 12) / 9), cy = (y - 12) % 9, h = hash2(col, ch, 333), wear = qN(x, y, 16, 3, 334);
  return col >= 0 && col < 11 && cx > 2 && cx < 7.5 && cy > 1 && cy < 7.5 && h < .82 && wear > .35 && hash2(x >> 1, y >> 1, 335 + col * 7 + ch) < .5 ? shm(bg, .62 + grainy(x, y, 336) * .1) : bg; });
TEX.glyph('couplet', ['土能生萬物', '地可發千祥'], { aspect: .36, fill: .82, fg: [28, 20, 18], bg: (x, y) => { const e = Math.abs((x % 64) - 32); return e > 26 ? CLEAR : shm(mixP([196, 40, 32], [166, 30, 26], qN(x, y, 8, 3, 332)), .92 + grainy(x, y, 333) * .1); } });
TEX.glyph('plaque_tudi', '土地祠', { horiz: true, aspect: 2.6, fill: .8, fg: _gc([232, 196, 100], [200, 150, 66], 334), bg: _frame(_gc([30, 26, 24], [46, 38, 32], 335), [150, 44, 32], 8, 336) });
// ---------- particles & decals (white, tinted by vertex/particle color) ----------
TEX.add('glow', (x, y) => { const n = qN(x, y, 8, 3, 96); return shP([255, 255, 255], .8 + n * .2); });
TEX.add('ink', (x, y) => { const n = qN(x, y, 4, 4, 92), r = qN(x, y, 16, 2, 93); return shP([30, 24, 50], .7 + n * .4 + (r > .65 ? .7 : 0)); });
TEX.add('lava', (x, y) => { const w = qW(x, y, 6, 94), n = qN(x, y, 8, 3, 95); const k = sstep(.0, .25, w[1] - w[0]); return mixP([255, 220, 120], [120, 30, 10], k * .8 + n * .2); });
TEX.add('p_soft', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64; return [255, 255, 255, clamp((1 - d) ** 1.6 * 255, 0, 255)]; });
TEX.add('p_blob', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64, n = qN(x, y, 4, 3, 110); return [235 + n * 20, 235 + n * 20, 235 + n * 20, d < .55 + (n - .5) * .5 ? 255 : 0]; });
TEX.add('p_spark', (x, y) => { const dx = Math.abs(x - 63.5) / 64, dy = Math.abs(y - 63.5) / 64, d = hyp2(dx, dy); const a = Math.max(1 - d * 2.2, 0) + Math.max(1 - dx * 12, 0) * Math.max(1 - dy, 0) * .9 + Math.max(1 - dy * 12, 0) * Math.max(1 - dx, 0) * .9; return [255, 255, 255, clamp(a * 255, 0, 255)]; });
TEX.add('p_smoke', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64, n = qN(x, y, 4, 4, 111); return [255, 255, 255, clamp((1 - d) * (n * 1.4 - .1) * 330, 0, 255)]; });
TEX.add('p_flame', (x, y) => { const dx = (x - 63.5) / 64, dy = (y - 80) / 64, n = qN(x, y, 4, 3, 112); const d = hyp2(dx * 1.6, dy < 0 ? dy * .55 : dy * 1.4); return [255, 255, 255, clamp((1 - d - n * .35) * 400, 0, 255)]; });
TEX.add('p_ring', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64; return [255, 255, 255, clamp((1 - Math.abs(d - .8) * 8) * 255, 0, 255)]; });
TEX.add('p_flake', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64, a = Math.atan2(y - 63.5, x - 63.5), s = Math.abs(Math.cos(a * 3)) > .85 && d < .9; return [255, 255, 255, d < .25 || s ? 255 : clamp((1 - d) * 120, 0, 255)]; }); // snowflake
TEX.add('d_blood', (x, y) => {
  const dx = x - 63.5, dy = y - 63.5, d = hyp2(dx, dy) / 64, a = Math.atan2(dy, dx), n = qN(x, y, 6, 4, 113), sp = vnoise2(a / TAU * 16 + 8, 0, 16, 114);
  const main = d < .32 + n * .25 + sp * .25 * sstep(.2, .6, d), drop = hash2(x >> 3, y >> 3, 115) > .9 && hyp2(x % 8 - 4, y % 8 - 4) < 2.5 && d < .95;
  return (main || drop) ? [200 + n * 55, 200 + n * 55, 200 + n * 55, 255] : CLEAR;
});
TEX.add('d_scorch', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64, n = qN(x, y, 6, 4, 116); return d < .55 + (n - .5) * .5 ? [255, 255, 255, 255] : CLEAR; });
TEX.add('ring', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64; return [255, 255, 255, Math.abs(d - .9) < .06 || (d < .84 && ((x + y) & 7) === 0) ? 255 : 0]; });
TEX.add('d_shadow', (x, y) => { const d = hyp2(x - 63.5, y - 63.5) / 64; return [0, 0, 0, bayer(x >> 2, y >> 2) < (1 - d) * 1.3 - .15 ? 255 : 0]; });
TEX.add('p_bird', (x, y) => { const f = x >= 64 ? 1 : 0, lx = (x % 64) - 32, ly = y - 64; const wing = f ? Math.abs(ly + 6 - Math.abs(lx) * .25) < 2.2 : Math.abs(ly - 2 + Math.abs(lx) * .45) < 2.2; return (Math.abs(lx) < 26 && wing) || (Math.abs(lx) < 3 && Math.abs(ly) < 4) ? [30, 24, 26, 255] : CLEAR; });
// first-person sleeve: padded cloth that dithers out toward the shoulder (v -> 1)
TEX.add('sleeve', (x, y) => { const w = ((x >> 1 & 1) ^ (y >> 1 & 1)) ? .85 : 1.08, n = qN(x, y, 8, 4, 72), f = sstep(.45, .92, y / TS); return [...shm(mixP([150, 128, 92], [110, 92, 66], n), w * (.85 + grainy(x, y, 15) * .1)), bayer(x, y) < f ? 0 : 255]; });

// ======================= shared meshes =======================
const MESH = {}; // cache of uploaded shared meshes (built lazily)
function meshOnce(name, fn) { if (!MESH[name]) { const b = new MB(); fn(b); MESH[name] = b.upload(); } return MESH[name]; }
const lumpy = (amp, freq, seed) => (x, y, z) => (fbm3(x * freq + seed, y * freq, z * freq, 3, seed | 0) - .5) * 2 * amp;
const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const v3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], v3norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ======================= ARCH — Northern Song architecture kit =======================
 Conventions: metres, y up. A building's local frame: +z = front (the side with the door / facing the street), x = width.
 `yaw` rotates the local frame like L.prop (yaw 0: front faces +z; yaw PI: front faces -z). Everything goes into L.mb
 (opaque, culled); cutouts (lattice, railing panels) are emitted double-sided so they need no foliage mesh.
 Builders that take L add geometry AND collision (L.world) and, where it says so, lights. Geometry-only helpers take an MB `b`
 and build in b's current transform.
 Common options: snow (true | 0..1: snow on roofs/platform tops), tiles 'grey'|'green', paint 'jade' (碾玉裝 blue-green)|'ochre' (丹粉刷飾)
 |'plain' (dark timber), glow (0..1: lamplit paper windows + interior lights), cols (column texture, default vermilion / dark_wood).
 High-level (L):
  ARCH.hall(L, x, y, z, {yaw, bays:3, dbays:2, bayW, dbayW, colH:3.8, platform:.9, pm, roof:'xieshan'|'hip'|'gable'|'shed'|'pyramid',
     tiles, paint, cols, walls:'white'|'brick'|'plank'|'open', door:'front'|'all'|'none'|[bay idx], doorOpen, backDoor, windows:true|'all'|false,
     glow, snow, brackets:'full'|'simple'|'none', inter, tablet:texName, railing, steps:true, fill:{front,back,left,right}}) -> info
     info = {F, W, D, top (floor y), colTop, eave, ridge, door:[x,y,z] (in front of the steps), inside:[x,y,z], roof}
  ARCH.shop(L, x, y, z, {yaw, w:6.6, d:5, storeys:1|2, roof:'gable', front:'counter'|'shutters'|'lattice', walls:'plank'|'white',
     sign:texName|null, flag:texName|null, awning:true, huanmen:false, glow, snow, tiles, paint:'plain'}) -> info
  ARCH.huanmen(L, x, y, z, {yaw, w:5, h:8, glow}) 彩樓歡門 decorated restaurant gateway (bamboo/timber frame, silk, flowers, lanterns)
  ARCH.wall(L, x0, z0, x1, z1, {y, h, t, style:'courtyard'|'brick'|'rammed', coping:true, parapet:'crenel', batter, snow, tiles})
  ARCH.gate(L, x, y, z, {yaw, w:3.2, h:3, open, snow, tiles, studs}) small roofed courtyard gate (fits a gap of width w+0.6 in an ARCH.wall)
  ARCH.gateTower(L, x, y, z, {yaw, w:30, d:16, h:9, passages:3, pw:5, ph:6, open:true, tablet:null|'gt_春明門', tower:{...hall opts}, snow, parapet:'railing'|'crenel'})
     massive brick-faced base with trapezoid-topped (Song) gate passages and studded vermilion doors, timber tower on top -> info {top, tower}
  ARCH.pavilion(L, x, y, z, {yaw, sides:4|6|8, r:2.2, colH:3, platform:.5, tiles, paint, snow, benches:true, glow})
  ARCH.steps(L, x, y, z, {yaw, w, h, d:.32, ramps:true, tex})       steps rise toward -z (local), lowest edge at local z = len
  ARCH.railing(L, pts[[x,y,z]...], {h:1.05, mat:'red'|'dark'|'stone', closed, solid:true})  Song 單鉤闌 (posts, rails, openwork panels)
  ARCH.lantern(L, x, y, z, {kind:'red'|'palace', s, light:true, col}) hung lantern (top of cord at y) + point light
  ARCH.lanternString(L, p0, p1, {n, sag, kind, light:true})
 Geometry (b):
  ARCH.roof(b, {type, X, Z, H, k, up, flare, thick, tiles, snow, ridgeH, chiwen:true, nv, col}) -> {underY(x,z), topY(x,z), H, th}
     eave top at y=0, plan half-extents X (ridge along x, X >= Z) and Z; concave profile, upturned corners, chīwěn, snow layer +4 cm.
  ARCH.roofPoly(b, {n, R, a0, H, up, thick, tiles, snow, finial:true})  pyramidal (攢尖) roof for square/hex/oct pavilions
  ARCH.bracket(b, s, {style:'full'|'simple', tex}) one bracket set (~80 tris; cached & merged), base on the wall plane, projecting +z
  ARCH.column(b, x, y, z, h, r, {tex, base:true})  entasis column on a stone base     ARCH.chiwen(b, s)  ridge-end ornament (faces +x)
  ARCH.beam(b, x0,z0,x1,z1, y0, h, d, tex)  painted member     ARCH.sweep(b, pts, w, h, {uv})  rect-section beam along a path
  ARCH.tablet(b, tex, w, h)  framed name tablet facing +z      ARCH.snowCap(b, x, y, z, w, d, {h, seed})  soft snow slab on a ledge
  ARCH.poly(b, pts, n, uvf, ctr, closed) / ARCH.quad(b, a, b, c, d, n, uv)  oriented polygons
*/
const ARCH = { _c: {}, pitch: .46 };
ARCH.F = (x, y, z, yaw = 0) => { const c = Math.cos(yaw), s = Math.sin(yaw); return { x, y, z, yaw, c, s, p: (lx, ly, lz) => [x + c * lx + s * lz, y + ly, z - s * lx + c * lz] }; };
ARCH._runs = (a, b, gap) => !gap || gap[1] <= a || gap[0] >= b ? [[a, b]] : [[a, Math.max(a, gap[0])], [Math.min(b, gap[1]), b]].filter(r => r[1] - r[0] > .05); // [a,b] minus one gap
ARCH.STATEK = new Set(['door', 'opendoor', 'board', 'boardopen', 'counter', 'shutter']); // bays that open and close (portals never: ward gates are CITY's)
ARCH.solid = (L, F, lx, ly0, lz, w, h, d, o = {}) => { const p = F.p(lx, ly0 + h / 2, lz); return L.world.box(p[0], p[1], p[2], w / 2, h / 2, d / 2, { yaw: F.yaw + (o.yaw || 0), surface: o.surface || 'stone', tag: o.tag, grp: o.grp || 0 }); };
// box with bottom at y0, world-space uv (t = metres per tile)
ARCH.box = (b, cx, y0, cz, w, h, d, tex, t = 2, o = {}) => { if (tex) b.s({ tex }); return b.box(cx, y0 + h / 2, cz, w, h, d, { world: t, faces: o.faces, skip: o.skip }); };
// painted member between plan points (u repeats along length, v 0..1 across height)
ARCH.beam = (b, x0, z0, x1, z1, y0, h, d, tex, uvLen = 2.5, o = {}) => { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (tex) b.s({ tex }); b.T((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, 0, Math.atan2(-dz, dx), 0).box(0, 0, 0, len, h, d, { uv: [Math.max(1, Math.round(len / uvLen)), 1], skip: o.skip }).pop(); return b; };
// wall slab between plan points, world uv
ARCH.slab = (b, x0, z0, x1, z1, y0, h, t, tex, tile = 2, o = {}) => { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (tex) b.s({ tex }); b.T((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, 0, Math.atan2(-dz, dx), 0).box(0, 0, 0, len, h, t, { world: tile, skip: o.skip, faces: o.faces }).pop(); return b; };
ARCH.poly = (b, pts, n, uvf, ctr, closed) => {
  const P = ctr ? [ctr, ...pts] : pts, i0 = b.nv, nn = v3norm(n), m = P.length;
  for (const p of P) { const t = uvf ? uvf(p) : [0, 0]; b.v(p[0], p[1], p[2], nn[0], nn[1], nn[2], t[0], t[1]); }
  const T = (i, j, k) => { const cr = v3cross(v3sub(P[j], P[i]), v3sub(P[k], P[i])); if (v3dot(cr, nn) >= 0) b.tri(i0 + i, i0 + j, i0 + k); else b.tri(i0 + i, i0 + k, i0 + j); };
  for (let k = 1; k < m - 1; k++) T(0, k, k + 1); if (ctr && closed) T(0, m - 1, 1); return b;
};
// quad from corners bottom-left, bottom-right, top-right, top-left (texture upright as given); winding chosen so it faces n
ARCH.quad = (b, a, c, d, e, n, uv = [1, 1]) => { const nn = v3norm(n), i = b.nv; b.v(...a, ...nn, 0, uv[1]); b.v(...c, ...nn, uv[0], uv[1]); b.v(...d, ...nn, uv[0], 0); b.v(...e, ...nn, 0, 0);
  if (v3dot(v3cross(v3sub(c, a), v3sub(e, a)), nn) >= 0) b.quad(i, i + 1, i + 2, i + 3); else b.quad(i, i + 3, i + 2, i + 1); return b; };
// double-sided quad in the local x-y plane at z (w x h, bottom-left origin at x0,y0); uv rect [u0,v0,du,dv]
ARCH.card = (b, x0, y0, z, w, h, uvr = [0, 0, 1, 1], two = true) => {
  const [u0, v0, du, dv] = uvr, quad = (zz, nz) => { const i = b.nv, xs = nz > 0 ? [x0, x0 + w] : [x0 + w, x0], us = [u0, u0 + du]; // both sides read upright, unmirrored
    b.v(xs[0], y0, zz, 0, 0, nz, us[0], v0 + dv); b.v(xs[1], y0, zz, 0, 0, nz, us[1], v0 + dv); b.v(xs[1], y0 + h, zz, 0, 0, nz, us[1], v0); b.v(xs[0], y0 + h, zz, 0, 0, nz, us[0], v0); b.quad(i, i + 1, i + 2, i + 3); };
  quad(z, 1); if (two) quad(z, -1); return b;
};
ARCH.sweep = (b, pts, w, h, o = {}) => {
  const n = pts.length, S = [], U = [], Lc = [0];
  for (let i = 0; i < n; i++) { const t = v3norm(v3sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])); let s = v3cross(t, [0, 1, 0]); if (Math.hypot(...s) < 1e-4) s = [1, 0, 0]; s = v3norm(s); S.push(s); U.push(v3cross(s, t)); if (i) Lc.push(Lc[i - 1] + Math.hypot(...v3sub(pts[i], pts[i - 1]))); }
  const ul = o.uv || 2, hw = w / 2, hh = h / 2;
  const face = (as, au, bs, bu) => b.grid(n - 1, 1, (i, j) => { const p = pts[i], s = S[i], u = U[i], es = j ? bs : as, eu = j ? bu : au; return [p[0] + s[0] * es + u[0] * eu, p[1] + s[1] * es + u[1] * eu, p[2] + s[2] * es + u[2] * eu, Lc[i] / ul, j]; }, false);
  if (!o.noTop) face(hw, hh, -hw, hh); if (!o.noBot) face(-hw, -hh, hw, -hh); face(hw, -hh, hw, hh); face(-hw, hh, -hw, -hh);
  if (o.caps !== false) for (const [i, sg] of [[0, -1], [n - 1, 1]]) { if (Array.isArray(o.caps) && !o.caps[i ? 1 : 0]) continue; const p = pts[i], s = S[i], u = U[i], c = (a, bq) => [p[0] + s[0] * a + u[0] * bq, p[1] + s[1] * a + u[1] * bq, p[2] + s[2] * a + u[2] * bq], t = v3norm(v3sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])); ARCH.quad(b, c(-hw, -hh), c(hw, -hh), c(hw, hh), c(-hw, hh), [t[0] * sg, t[1] * sg, t[2] * sg], [w / ul, 1]); }
  return b;
};
ARCH.snowCap = (b, x, y, z, w, d, o = {}) => { // soft lumpy snow slab, bottom at y (sits 2 cm proud of the ledge below), rounded edges
  const h = o.h || .07, sd = o.seed || 1, nx = Math.max(2, Math.min(10, Math.round(w / .4))), nz = Math.max(2, Math.min(6, Math.round(d / .4)));
  b.s({ tex: 'snow', col: [1, 1, 1] }).grid(nz, nx, (i, j) => { const u = j / nx, v = i / nz, e = Math.min(u, 1 - u, v, 1 - v) * 2, k = Math.sqrt(Math.min(1, e * 3)), px = x - w / 2 + u * w, pz = z - d / 2 + v * d; return [px, y + .02 + h * k * (.7 + fbm2(px * 2 + sd, pz * 2, 1e6, 2, sd) * .6), pz, px / 2, pz / 2]; }, false, null, true);
  return b;
};
// ---------- column, bracket, chiwen, tablet ----------
ARCH.column = (b, x, y, z, h, r, o = {}) => {
  if (o.base !== false) { b.s({ tex: 'stone', col: [.92, .92, .9] }).box(x, y + .0575, z, r * 2.6, .115, r * 2.6, { skip: ['bot'], world: 1 }); b.T(x, y, z).lathe([[r * 1.3, .12], [r * 1.12, .2], [r * .97, .23]], { seg: 6, uvs: [1, .2] }).pop(); }
  b.s({ tex: o.tex || 'vermilion', col: o.col || [1, 1, 1] }).T(x, y, z).lathe([[r * 1.02, .2], [r, h * .68], [r * .82, h]], { seg: o.seg || 8, uvs: [1, Math.max(1, Math.round(h / 1.6))] }).pop();
  return b;
};
ARCH._bk = (style, tex) => { const key = style + tex; if (ARCH._c[key]) return ARCH._c[key]; const b = new MB(); b.s({ tex, col: [1, 1, 1] });
  const B = (x, y, z, w, h, d, skip) => b.box(x, y, z, w, h, d, { skip });
  if (style === 'full') { // 五鋪作: 櫨斗, 泥道栱, 華栱, 交互斗, 下昂, 令栱, 耍頭
    B(0, .1, 0, .36, .2, .36, ['top']); B(0, .305, 0, 1.1, .17, .14, ['top']); B(0, .3, .2, .15, .2, 1.0); B(0, .47, .62, .24, .14, .24, ['top']);
    b.T(0, .62, .55, .35, 0, 0).box(0, 0, 0, .13, .15, 1.45, { skip: ['nz'] }).pop(); B(0, .62, .92, .22, .13, .22, ['top']); B(0, .77, .92, 1.0, .17, .13, ['top']); B(0, .93, .55, .11, .15, 1.0, ['nz']);
  } else if (style === 'none') { B(0, .08, 0, .3, .16, .3, ['top']); B(0, .21, .05, .14, .1, .38); } // plain bearing block + beam end 斗口跳-like, stays under the eave purlin
  else { B(0, .1, 0, .34, .2, .34, ['top']); B(0, .305, 0, 1.0, .17, .14, ['top']); B(0, .38, .12, .15, .36, .8); }
  return ARCH._c[key] = b; };
ARCH.bracket = (b, s = 1, o = {}) => { b.T(0, 0, 0, 0, 0, 0, s).add(ARCH._bk(o.style || 'full', o.tex || 'paint_ochre')).pop(); return b; };
ARCH.chiwen = (b, s = 1) => { // 鴟吻: tall curled fish-tail, mouth gripping the ridge; base at origin, faces +x (toward the ridge centre)
  b.s({ tex: 'roof_ridge', col: [.82, .84, .88] }).box(.05 * s, .06 * s, 0, .5 * s, .12 * s, .3 * s);
  b.T(0, 0, 0, 0, 0, 0, 1, 1, .42).tube([[-.02 * s, .05 * s, 0], [-.1 * s, .45 * s, 0], [-.02 * s, .82 * s, 0], [.2 * s, .98 * s, 0], [.36 * s, .86 * s, 0], [.3 * s, .68 * s, 0]], { r: [.24 * s, .19 * s, .15 * s, .1 * s, .065 * s, .035 * s], seg: 6, steps: 2, cap: [false, true], capRows: 1 });
  for (const [hy, l] of [[.3, .14], [.55, .12]]) b.tube([[-.12 * s, hy * s, 0], [-(.12 + l) * s, (hy + .06) * s, 0]], { r: [.06 * s, .012 * s], seg: 3, steps: 1, cap: [false, true], capRows: 1 });
  b.pop(); b.ell(.17 * s, .14 * s, 0, .14 * s, .1 * s, .1 * s, { seg: 5, ring: 3 }); return b;
};
ARCH.tablet = (b, tex, w, h, o = {}) => { // framed vertical name tablet, face toward +z, centred at origin
  b.s({ tex: o.frame || 'lacquer_red', col: [1, 1, 1] }).box(0, 0, -.03, w + .14, h + .14, .08);
  b.s({ tex: o.edge || 'gold' }).box(0, h / 2 + .1, -.01, w + .3, .08, .08).box(0, -h / 2 - .1, -.01, w + .3, .08, .08); /* rails' backs 2 cm inside the frame's back face */
  b.s({ tex, emi: o.emi || 0 }); const i = b.nv, z = .015; b.v(-w / 2, -h / 2, z, 0, 0, 1, 0, 1); b.v(w / 2, -h / 2, z, 0, 0, 1, 1, 1); b.v(w / 2, h / 2, z, 0, 0, 1, 1, 0); b.v(-w / 2, h / 2, z, 0, 0, 1, 0, 0); b.quad(i, i + 1, i + 2, i + 3); b.s({ emi: 0 });
  return b;
};
// a name board hung under an eave, in front of the bracket zone, tilted forward (top out) so it faces the people below, on two iron rods up into the eave.
// b is in the building's local frame (facade toward +z). fr: ARCH.frame's result; zf: the facade (column) line (fr.D / 2); sd: +1 front, -1 back.
ARCH.hangTablet = function (b, fr, tex, w, h, o = {}) {
  const sd = o.side || 1, th = o.tilt ?? .3, c = Math.cos(th), s = Math.sin(th); let H2 = h / 2 + .14; const gap = o.gap ?? .1, zf = fr.D / 2;
  const zc = zf + Math.max(fr.bkFront || 0, (fr.reach || 0) + .1 * (fr.bs || 0)) + gap, yc = fr.plT - .02; // everything above yc is behind zc (brackets, eave purlin)
  const zw = zf + .35 + gap; // below the bracket zone: columns, lintels and the wall stand behind zw
  let zC = zc + .3, yC = fr.plT;
  for (let k = 0; k < 6; k++) { const ztop = zC + H2 * s, ytopMax = fr.under(0, sd * (ztop + .3)) - .3; // keep the top .3 m under the rafters
    yC = (o.yTop != null ? Math.min(o.yTop, ytopMax) : ytopMax) - (H2 * c + .07 * s);
    const zBack = zC - .07 * c, yBack = yC + .07 * s; // back face centre; the back face rises toward +z
    zC = Math.max(zc + .07 * c - (Math.min(yc, yC + H2 * c) - yBack) * Math.tan(th), zw + .07 * c + H2 * s); }
  if (o.inBay) { zC = zf + .22 + .07 * c + H2 * s; const ytop = fr.under(0, sd * (zC + H2 * s + .15)) - .25; yC = ytop - H2 * c; } // in the middle bay, just in front of the lintel: up in the bracket zone (only the column tops carry bracket sets there), where the eave is high
  { const lim = fr.plT - .44, top = yC + H2 * c; if (yC - H2 * c < lim) { const k = clamp(((top - lim) / c - .28) / h, .45, 1); w *= k; h *= k; H2 = h / 2 + .14; yC = top - H2 * c; } } // the bottom stays above the lintel's underside (it hung into the gateway): smaller if the eave leaves too little room
  b.T(0, 0, 0, 0, sd > 0 ? 0 : Math.PI, 0); b.T(0, yC, zC, th, 0, 0); ARCH.tablet(b, tex, w, h, o); b.pop();
  b.s({ tex: 'iron', col: [.45, .45, .5] }); // rods from the top rail straight up into the eave
  for (const sx of [-1, 1]) { const x = sx * w * .32, yt = yC + H2 * c - .04, zt = zC + (H2 - .04) * s - .02, yr = fr.under(x, sd * zt) + .04; b.box(x, (yt + yr) / 2, zt, .035, yr - yt, .035); }
  b.pop(); b.s({ col: [1, 1, 1] }); return { yC, zC };
};
// ---------- roofs ----------
ARCH.roof = function (b, o) {
  const type = o.type || 'xieshan', shed = type === 'shed', gab = type === 'gable', xs = type === 'xieshan';
  const X = o.X, Z = o.Z, H = o.H || (shed ? Z * .42 : Z * ARCH.pitch), k = o.k ?? (shed ? .1 : .24);
  const up = o.up ?? (gab || shed ? Math.min(.1, Z * .02) : Math.min(.55, .1 + Z * .05)), fl = o.flare ?? up * .5;
  const th = o.thick ?? Math.min(.32, .12 + Z * .025), tw = 2, sn = o.snow === true ? 1 : (o.snow || 0), col = o.col || [1, 1, 1];
  const tex = o.tiles === 'green' ? 'roof_tile_green' : o.tiles === 'straw' || o.tiles === 'thatch' ? 'thatch' : o.tiles === 'mat' ? 'mat' : 'roof_tile';
  const D = shed ? 2 * Z : Z, f = s => s - k * s * (1 - s), s1 = xs ? (o.s1 ?? .46) : 1, xE = xs ? X - s1 * Z : X;
  const cn = (x, z) => Math.min(1, Math.abs(x) / X) * (shed ? 1 : Math.min(1, Math.abs(z) / Z));
  const lift = (x, z) => { const c = cn(x, z); return up * c * c * Math.sqrt(c); };
  const P = (x, z, y) => { const c = cn(x, z), e = fl * c * c * c; return [x + Math.sign(x) * e, y + lift(x, z), z + (shed ? 0 : Math.sign(z) * e)]; };
  const SL = [];
  if (shed) SL.push({ phi: 0, E: Z, lim: () => X, sm: 1, main: 1 });
  else { const lf = s => gab ? X : X - Math.min(s, s1) * Z; SL.push({ phi: 0, E: Z, lim: lf, sm: 1, main: 1 }, { phi: PI, E: Z, lim: lf, sm: 1, main: 1 }); if (!gab) { const le = s => Z * (1 - s); SL.push({ phi: PI / 2, E: X, lim: le, sm: s1 }, { phi: -PI / 2, E: X, lim: le, sm: s1 }); } }
  const loc = (S, s, a) => { const lz = S.E - s * D, c = Math.cos(S.phi), sn_ = Math.sin(S.phi); return [c * a + sn_ * lz, -sn_ * a + c * lz]; };
  const at = (S, s, a, dy) => { const [x, z] = loc(S, s, a); return P(x, z, H * f(s) + dy); };
  const gEdge = (S, s) => gab || shed || (xs && S.main && s > s1 + 1e-6);
  const nv = o.nv || 6, rows = (S, n) => { const r = []; if (xs && S.main) { const n1 = Math.max(2, Math.round(n * s1)), n2 = Math.max(2, n - n1); for (let i = 0; i <= n1; i++) r.push(s1 * i / n1); for (let i = 1; i <= n2; i++) r.push(s1 + (1 - s1) * i / n2); } else { const m = Math.max(2, Math.round(n * S.sm)); for (let i = 0; i <= m; i++) r.push(S.sm * i / m); } return r; };
  const vOf = s => { let Lh = 0, p = 0; for (let i = 1; i <= 10; i++) { const q = s * i / 10; Lh += Math.hypot(D * (q - p), H * (f(q) - f(p))); p = q; } return Lh / tw; };
  const surf = (S, rs, nu, dy, inset, up_, t) => { const vv = rs.map(vOf); b.s({ tex: t, col }); b.grid(rs.length - 1, nu, (i, j) => { const s = rs[i], lim = S.lim(s) - (inset ? inset(S, s) : 0), a = lerp(-lim, lim, j / nu), p = at(S, s, a, typeof dy === 'function' ? dy(S, s, a) : dy); return [p[0], p[1], p[2], a / tw, vv[i]]; }, false, null, up_); };
  const snowDy = (S, s, a) => { const [x, z] = loc(S, s, a); return .04 + sn * (.015 + .12 * Math.pow(1 - s, 1.4) * (.4 + fbm2(x * .7, z * .7, 1e6, 2, 77))); };
  for (const S of SL) {
    const w0 = 2 * S.lim(0), nu = Math.max(3, Math.min(13, Math.round(w0 / 1.6))), rs = rows(S, nv);
    surf(S, rs, nu, 0, null, true, tex);                                                   // tiles
    surf(S, rows(S, nv), Math.max(2, Math.ceil(nu / 2)), -th, null, false, 'rafters'); // eave underside (same rows as the tiles: the shell has no sag gaps)
    b.s({ tex: o.tiles === 'straw' || o.tiles === 'thatch' ? 'thatch' : 'tile_end', col }).grid(1, nu, (i, j) => { const lim = S.lim(0), a = lerp(-lim, lim, j / nu), p = at(S, 0, a, i ? -th : 0); return [p[0], p[1], p[2], a / tw, i]; }, false); // fascia
    if (sn) { const s0 = .025, nus = Math.max(2, Math.ceil(nu * .6)), srs = rows(S, Math.ceil(nv * .67)).map(s => s0 + s * (S.sm - s0 - (S.main ? .005 : .01)) / S.sm), ins = (S2, s) => gEdge(S2, s) ? .14 : 0;
      surf(S, srs, nus, snowDy, ins, true, 'snow');
      b.s({ tex: 'snow' }).grid(1, nus, (i, j) => { const lim = S.lim(s0) - ins(S, s0), a = lerp(-lim, lim, j / nus), p = at(S, s0, a, i ? -.03 : snowDy(S, s0, a)); return [p[0], p[1], p[2], a / tw, i * .1]; }, false); }
  }
  const straw = o.tiles === 'straw' || o.tiles === 'thatch';
  // cover-tile rolls 筒瓦 (a ridge of semicircular tiles every ~0.3 m down each slope) ending in round lotus 瓦當 at the eave
  if (!sn && !straw && o.tiles !== 'mat' && o.rolls !== false && !ARCH.noRolls) { const sp = o.rollSp || .36, hw = .075, rt = o.tiles === 'green' ? 'roof_tile_green' : 'roof_ridge', rc = [col[0] * .86, col[1] * .87, col[2] * .9];
    for (const S of SL) { const rs = rows(S, 3), lim0 = S.lim(0), n = Math.floor((2 * lim0 - .2) / sp), out = [Math.sin(S.phi), 0, Math.cos(S.phi)];
      for (let k = 0; k < n; k++) { const a = -lim0 + .1 + (k + .5) * (2 * lim0 - .2) / n; let m = 0; while (m < rs.length && Math.abs(a) + hw + (gEdge(S, rs[m]) ? (o.ridgeW ?? Math.min(.45, .2 + Z * .03)) * .6 : .05) <= S.lim(rs[m]) + 1e-6) m++; if (m < 2) continue;
        b.s({ tex: rt, col: rc }).grid(m - 1, 2, (i, j) => { const p = at(S, rs[i], a + (j - 1) * hw, j === 1 ? .07 : -.012); return [p[0], p[1], p[2], j * .5, vOf(rs[i]) * 2]; }, false, null, true);
        const c = at(S, 0, a, .022), e1 = [Math.cos(S.phi), 0, -Math.sin(S.phi)], R6 = [], q = .062; for (let t = 0; t < 6; t++) { const an = t / 6 * TAU; R6.push([c[0] + out[0] * .016 + e1[0] * Math.cos(an) * q, c[1] + Math.sin(an) * q, c[2] + out[2] * .016 + e1[2] * Math.cos(an) * q]); }
        b.s({ tex: 'roof_ridge', col: [col[0] * .95, col[1] * .95, col[2] * .98] }); ARCH.poly(b, R6, out, p => [.5 + (p[0] - c[0] + p[2] - c[2]) * 4, .5 - (p[1] - c[1]) * 4], [c[0] + out[0] * .024, c[1], c[2] + out[2] * .024]); } } }
  // eave rafters 檐椽 (round-ish) and flying rafters 飛椽 (square) under the eaves, from the fascia back past the eave purlin
  if (o.rafS && !shed && !ARCH.noRafters) for (const S of SL) { if (!S.main && !o.allRaf) continue; const sE = Math.min(.95, o.rafS + .08), lim0 = S.lim(0), sp = o.rafSp || .5, n = Math.floor(2 * lim0 / sp);
    for (let k = 0; k < n; k++) { const a = -lim0 + (k + .5) * 2 * lim0 / n; if (Math.abs(a) > S.lim(sE) - .45) continue;
      b.s({ tex: 'dark_wood', col: [.72, .6, .5] }); ARCH.sweep(b, [at(S, .035, a, -th - .1), at(S, sE, a, -th - .1)], .1, .1, { uv: 1, caps: [true, false], noTop: 1 }); // top face hidden against the soffit: not emitted
      if (o.flyR && Math.abs(a) < S.lim(sE) - 1.2) ARCH.sweep(b, [at(S, .0, a, -th - .03), at(S, .12, a, -th - .03)], .08, .06, { uv: 1 }); } }
  const rh = o.ridgeH ?? Math.min(.9, .25 + Z * .075), rw = o.ridgeW ?? Math.min(.45, .2 + Z * .03);
  // hip / gable-edge ridges (戧脊 / 垂脊) and bargeboards (博風板)
  if (!shed) for (const S of SL.filter(S => S.main)) for (const sd of [-1, 1]) {
    const rs = rows(S, 4), hh = rh * .3, ins = s => gEdge(S, s) ? rw * .5 + (S.phi ? .03 : 0) : 0, pts = rs.map(s => at(S, s, sd * (S.lim(s) - ins(s)), hh - .04 + (S.phi ? .02 : 0)));
    if (!gab) { const p0 = at(S, 0, sd * S.lim(0), hh - .04), p1 = at(S, .06, sd * S.lim(.06), hh - .04); const dd = v3norm([p0[0] - p1[0], 0, p0[2] - p1[2]]); pts.unshift([p0[0] + dd[0] * rh * .32, p0[1] + rh * .14, p0[2] + dd[2] * rh * .32]); }
    b.s({ tex: 'roof_ridge', col }); ARCH.sweep(b, pts, rw * .62, hh * 2, { uv: 1, noBot: 1 });
    if (sn) { b.s({ tex: 'snow' }); ARCH.sweep(b, pts.slice(1, -1).map(p => [p[0], p[1] + hh + .02, p[2]]), rw * .62 + .05, .07, { uv: 2 }); }
  }
  // 博風板 bargeboards: ONE closed solid per gable end following the roof's real edge profile (top +6 cm above the tiles, bottom 10 cm below the
  // underside), from eave to apex to eave, flush with the tile edge (x from X-3 cm to X+5 cm), end caps 3 cm beyond the fascia. No open
  // faces to see through, nothing detached, both slopes meet at the apex.
  if (xs) for (const S of SL.filter(S => S.main)) for (const sd of [-1, 1]) { const bs = rows(S, 4).filter(s => s >= s1 - 1e-6); b.s({ tex: o.barge || 'dark_wood', col: [.9, .85, .8] }); ARCH.sweep(b, bs.map(s => at(S, s, sd * (S.lim(s) + (S.phi ? .06 : .035)), -th / 2 - .03)), .07, th + .16, { uv: 1, caps: [false, true] }); } // closed bottom + top cap (the lower end is buried under the side slope)
  if (gab) for (const sd of [-1, 1]) {
    const S0 = SL[0], S1 = SL[1], sA = -.03 / D, ns = Math.max(4, nv), ss = []; for (let i = 0; i <= ns; i++) ss.push(sA + (1 - sA) * i / ns);
    const edge = (S, s, dy) => { const p = at(S, Math.min(1, s), (S.phi ? -sd : sd) * S.lim(Math.max(0, Math.min(1, s))), dy); return p; }; // the back slope is turned half round: its local +a points to -x (it used to put the back half of each bargeboard on the other gable, leaving a hole by the apex)
    const prof = [...ss.map(s => [edge(S0, s, .06), edge(S0, s, -th - .1)]), ...ss.slice(0, -1).reverse().map(s => [edge(S1, s, .06), edge(S1, s, -th - .1)])]; // [top, bottom] pairs eave->apex->eave
    const X0 = -.03, X1 = .05, off = (p, dx) => [p[0] + sd * dx, p[1], p[2]];
    b.s({ tex: o.barge || 'dark_wood', col: [.9, .85, .8] });
    for (let i = 0; i < prof.length - 1; i++) { const [t0, b0] = prof[i], [t1, b1] = prof[i + 1];
      ARCH.quad(b, off(b0, X1), off(b1, X1), off(t1, X1), off(t0, X1), [sd, 0, 0], [1, .3]); ARCH.quad(b, off(b1, X0), off(b0, X0), off(t0, X0), off(t1, X0), [-sd, 0, 0], [1, .3]);
      const tn = v3cross(v3sub(t1, t0), [sd, 0, 0]), up = tn[1] >= 0 ? tn : tn.map(v => -v); ARCH.quad(b, off(t0, X0), off(t0, X1), off(t1, X1), off(t1, X0), up, [1, .1]);
      ARCH.quad(b, off(b0, X1), off(b0, X0), off(b1, X0), off(b1, X1), up.map(v => -v), [1, .1]); }
    for (const [k, sg] of [[0, 1], [prof.length - 1, -1]]) { const [t0, b0] = prof[k], [t1] = prof[k + sg], dn = v3norm([t0[0] - t1[0], 0, t0[2] - t1[2]]); ARCH.quad(b, off(b0, X0), off(b0, X1), off(t0, X1), off(t0, X0), dn, [.1, .3]); }
  }
  if (shed) for (const sd of [-1, 1]) { const rs = rows(SL[0], nv); b.s({ tex: o.barge || 'dark_wood', col: [.9, .85, .8] }); ARCH.sweep(b, rs.map(s => at(SL[0], s, sd * (X + .035), -th / 2 - .03)), .07, th + .14, { uv: 1 }); }
  // main ridge (正脊) with chiwen
  const rx = gab ? X + .11 : xs ? xE + .11 : X - Z;
  if (!shed && rx > .15 && straw) { b.s({ tex: 'straw', col: [.85, .78, .62] }).T(0, H - .02, 0, 0, 0, PI / 2).lathe([[.2, -rx], [.24, -rx + .1], [.24, rx - .1], [.2, rx]], { seg: 7, uvs: [2, Math.round(rx)] }).pop();
    b.s({ tex: 'bamboo', col: [.8, .7, .5] }); for (let x = -rx + .4; x < rx - .2; x += .9) b.T(x, H - .02, 0, 0, 0, 0).box(0, 0, 0, .05, .54, .62).pop(); } // 壓脊 sticks across the bundle
  else if (!shed && rx > .15) {
    ARCH.beam(b, -rx, 0, rx, 0, H - .08, rh, rw, 'roof_ridge', 1.5); ARCH.beam(b, -rx + .02, 0, rx - .02, 0, H - .08 + rh, rh * .3, rw * .7, 'roof_ridge', 1.5); b.s({ col });
    if (sn) { ARCH.beam(b, -rx + .3, 0, rx - .3, 0, H - .08 + rh - .02, .08, rw + .06, 'snow', 2); }
    if (o.chiwen !== false) for (const sd of [-1, 1]) { b.T(sd * (rx - .05), H - .1 + rh * 1.3, 0, 0, sd < 0 ? 0 : PI, 0); ARCH.chiwei(b, rh * (o.chiweiS || 2.6)); if (sn) b.s({ tex: 'snow' }).ell(.1 * rh * 2.3, rh * 2.3 * .99, 0, .14 * rh * 2.3, .05 * rh * 2.3, .06 * rh * 2.3, { seg: 6, ring: 3 }); b.pop(); }
    else for (const sd of [-1, 1]) { b.s({ tex: 'roof_ridge' }); b.T(sd * rx, H - .08 + rh * .9, 0, 0, 0, sd * .5).box(0, rh * .3, 0, rh * .55, rh * .9, rw * (sd < 0 ? .92 : .8)).pop(); } // ends differ in depth: neighbours' end blocks never share a face
  }
  if (!shed && rx <= .15) { b.s({ tex: o.tiles === 'green' ? 'roof_tile_green' : 'roof_ridge' }).T(0, H - .05, 0).lathe([[0, 0], [rw * 1.1, 0], [rw * 1.2, rh * .4], [rw * .7, rh * .9], [rw * .9, rh * 1.3], [rw * .45, rh * 1.9], [0, rh * 2.1]], { seg: 8 }).pop(); }
  // xieshan gables (山花) + 博脊 + hanging fish (懸魚)
  if (xs) for (const sd of [-1, 1]) {
    const gin = o.gin ?? Math.min(.45, .12 + Z * .05), xg = sd * (xE - gin), n2 = Math.max(3, nv), pts = [];
    const uy = (s, z) => H * f(s) - th - .02 + lift(xg, z);
    for (let i = 0; i <= n2; i++) { const s = s1 + (1 - s1) * i / n2; pts.push([xg, uy(s, Z * (1 - s)), Z * (1 - s)]); }
    for (let i = n2 - 1; i >= 0; i--) { const s = s1 + (1 - s1) * i / n2; pts.push([xg, uy(s, -Z * (1 - s)), -Z * (1 - s)]); }
    const ctr = [xg, H * f(s1) - th, 0], uvf = p => [p[2] / 1.5, -p[1] / 1.5];
    b.s({ tex: o.gableTex || 'plank', col: o.gableCol || [.62, .5, .42] }); ARCH.poly(b, pts, [sd, 0, 0], uvf, ctr); ARCH.poly(b, pts, [-sd, 0, 0], uvf, ctr);
    b.s({ tex: 'roof_ridge', col }); ARCH.beam(b, sd * (xE - gin / 2), -Z * (1 - s1) + .15, sd * (xE - gin / 2), Z * (1 - s1) - .15, H * f(s1) - .06, rh * .42, gin + .16, 'roof_ridge', 1.5);
    if (sn) ARCH.beam(b, sd * (xE - gin / 2), -Z * (1 - s1) + .3, sd * (xE - gin / 2), Z * (1 - s1) - .3, H * f(s1) - .06 + rh * .42 - .02, .07, gin + .2, 'snow');
    if (o.fish) ARCH.fish(b, sd * (xE + .105), H - th - .02 + lift(xE, 0), sd, o.barge);
  }
  if (gab && o.fish) for (const sd of [-1, 1]) ARCH.fish(b, sd * (X + .105), H - th - .02 + lift(X, 0), sd, o.barge);
  b.s({ col: [1, 1, 1] });
  const underY = (x, z) => { let s; if (shed) s = (Z - z) / (2 * Z); else { const sf = (Z - Math.abs(z)) / Z, se = (X - Math.abs(x)) / Z; s = (!gab && se < sf && se <= s1) ? se : sf; } s = clamp(s, 0, 1); return H * f(s) + lift(x, z) - th; };
  return { underY, topY: (x, z) => underY(x, z) + th, H, th, X, Z, rx };
};
ARCH.roofPoly = function (b, o) { // pyramidal roof over a regular n-gon (corner radius R at the eave), apex at y=H
  const n = o.n || 6, R = o.R, a0 = o.a0 || 0, H = o.H || R * .75, k = o.k ?? .32, up = o.up ?? Math.min(.6, .12 + R * .1), fl = o.flare ?? up * .5, th = o.thick ?? Math.min(.26, .1 + R * .03);
  const sn = o.snow === true ? 1 : (o.snow || 0), tw = 2, tex = o.tiles === 'green' ? 'roof_tile_green' : 'roof_tile', f = s => s - k * s * (1 - s);
  const C = i => [Math.cos(a0 + i * TAU / n) * R, Math.sin(a0 + i * TAU / n) * R], slant = Math.hypot(R * Math.cos(PI / n), H);
  const at = (i, s, t, dy) => { const c0 = C(i), c1 = C(i + 1), cn = Math.abs(2 * t - 1), e = 1 + fl * cn ** 4 * (1 - s) ** 2 / R, x = lerp(c0[0], c1[0], t) * (1 - s) * e, z = lerp(c0[1], c1[1], t) * (1 - s) * e; return [x, H * f(s) + up * cn ** 3 * (1 - s) ** 1.5 + dy, z]; };
  const nv = 5, nu = Math.max(3, Math.min(8, Math.round(2 * R * Math.sin(PI / n) / 1.1)));
  const surf = (i, s0, s1, rN, cN, dy, upward, t) => { const c0 = C(i), c1 = C(i + 1), ed = v3norm([c1[0] - c0[0], 0, c1[1] - c0[1]]); b.s({ tex: t }); const ss = r => lerp(s0, s1, r / rN);
    const test = [at(i, ss(0), 0, 0), at(i, ss(1), 0, 0), at(i, ss(0), 1 / cN, 0)], nrm = v3cross(v3sub(test[1], test[0]), v3sub(test[2], test[0]));
    b.grid(rN, cN, (r, j) => { const s = ss(r), tt = j / cN, p = at(i, s, tt, typeof dy === 'function' ? dy(s, tt) : dy); return [p[0], p[1], p[2], (p[0] * ed[0] + p[2] * ed[2]) / tw, s * slant / tw]; }, false, null, (nrm[1] < 0) === upward); };
  for (let i = 0; i < n; i++) {
    surf(i, 0, 1, nv, nu, 0, true, tex); surf(i, 0, 1, 3, Math.ceil(nu / 2), -th, false, 'rafters');
    const c0 = C(i), c1 = C(i + 1), mid = [(c0[0] + c1[0]) / 2, 0, (c0[1] + c1[1]) / 2], ed = v3norm([c1[0] - c0[0], 0, c1[1] - c0[1]]);
    b.s({ tex: 'tile_end' }); const fa = [], fb = []; for (let j = 0; j <= nu; j++) { fa.push(at(i, 0, j / nu, 0)); fb.push(at(i, 0, j / nu, -th)); }
    for (let j = 0; j < nu; j++) { const uu = (p) => (p[0] * ed[0] + p[2] * ed[2]) / tw; const i0 = b.nv, A = fa[j], B = fa[j + 1], Cc = fb[j + 1], Dd = fb[j]; const nn = v3norm([mid[0], 0, mid[2]]); const ok = v3dot(v3cross(v3sub(B, A), v3sub(Dd, A)), nn) >= 0; const Q = ok ? [A, B, Cc, Dd] : [B, A, Dd, Cc], U = Q.map(uu); b.v(...Q[3], ...nn, U[3], 1); b.v(...Q[2], ...nn, U[2], 1); b.v(...Q[1], ...nn, U[1], 0); b.v(...Q[0], ...nn, U[0], 0); b.quad(i0, i0 + 1, i0 + 2, i0 + 3); }
    if (sn) { const sdy = (s, t) => .04 + sn * (.015 + .1 * (1 - s) ** 1.4 * (.5 + .5 * Math.sin(t * 7 + i))); surf(i, .1, .97, nv - 1, nu, sdy, true, 'snow'); }
    const pts = []; for (let r = 0; r <= nv; r++) pts.push(at(i, r / nv * .97, 0, .07)); const p0 = pts[0], p1 = pts[1]; pts.unshift([p0[0] * 1.06, p0[1] + .14, p0[2] * 1.06]); void p1;
    b.s({ tex: 'roof_ridge' }); ARCH.sweep(b, pts, .2, .2, { uv: 1 }); if (sn) { b.s({ tex: 'snow' }); ARCH.sweep(b, pts.slice(1, -1).map(p => [p[0], p[1] + .12, p[2]]), .24, .06); }
  }
  if (o.finial !== false) { b.s({ tex: 'roof_ridge' }).T(0, H - .05, 0).lathe([[0, 0], [.34, 0], [.3, .18], [.18, .3], [.26, .48], [.2, .66], [.08, .78], [.1, .9], [0, 1.05]], { seg: 8 }).pop(); if (sn) b.s({ tex: 'snow' }).T(0, H - .05, 0).lathe([[.31, .2], [.27, .44], [.22, .54], [0, .58]], { seg: 8 }).pop(); }
  return { H, th, underY: () => H * .5 };
};
// ---------- steps, railing ----------
ARCH._steps = (L, F, lx, lz, yaw, w, h, o = {}) => { // in frame F; steps' top edge at (lx,lz), descending along local +z rotated by yaw
  if (h < .12) return 0; const b = L.mb, n = Math.max(2, Math.round(h / (o.rise || .17))), r = h / n, d = o.d || .32, tex = o.tex || 'stone';
  b.T(F.x, F.y, F.z, 0, F.yaw, 0).T(lx, 0, lz, 0, yaw, 0);
  for (let k = 0; k < n - 1; k++) { const top = h - (k + 1) * r; b.s({ tex, col: [.95, .95, .93] }).box(0, top / 2, (k + .5) * d, w, top, d, { world: 1, skip: ['bot', 'nz'] }); if (o.snow) { b.s({ tex: 'snow' }).box(0, top + .015, (k + .45) * d, w - .1, .03, d * .7, { skip: ['bot'] }); } }
  if (o.ramps !== false) for (const sd of [-1, 1]) { const len = (n - 1) * d, x0 = sd * (w / 2 + .17); b.s({ tex, col: [.9, .9, .88] }); const pts = [[0, 0], [0, h + .06], [len, .1], [len, 0]].map(([zz, yy]) => [zz, yy]); for (const px of [x0 - .17, x0 + .17]) ARCH.poly(b, pts.map(([zz, yy]) => [px, yy, zz]), [px > x0 ? 1 : -1, 0, 0], p => [p[2] / 2, -p[1] / 2]);
    ARCH.quad(b, [x0 - .17, h + .06, 0], [x0 + .17, h + .06, 0], [x0 + .17, .1, len], [x0 - .17, .1, len], [0, 1, .3], [.2, len / 2]); ARCH.quad(b, [x0 - .17, 0, len], [x0 + .17, 0, len], [x0 + .17, .1, len], [x0 - .17, .1, len], [0, 0, 1], [.2, .05]); }
  b.pop().pop();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let k = 0; k < n - 1; k++) { const top = h - (k + 1) * r, zc = (k + .5) * d, p = [lx + s * zc, lz + c * zc]; ARCH.solid(L, F, p[0], 0, p[1], w + .7, top, d, { yaw }); }
  return (n - 1) * d;
};
ARCH.steps = (L, x, y, z, o = {}) => ARCH._steps(L, ARCH.F(x, y, z, o.yaw || 0), 0, 0, 0, o.w || 2, o.h || .6, o);
ARCH._rail = (b, len, o) => { // one railing segment along local +x from 0..len, base y=0
  const h = o.h || 1.05, tex = o.mat === 'stone' ? 'stone' : o.mat === 'dark' ? 'dark_wood' : 'vermilion', col = o.mat === 'stone' ? [1.15, 1.13, 1.08] : [1, 1, 1];
  const li = Math.max(.05, len - .18); // rails stop at the posts (corner posts are shared by two segments: no overlapping rail ends)
  b.s({ tex, col }).box(len / 2, .05, 0, li, .1, .14, { uv: [len, 1] }).box(len / 2, .56, 0, li, .07, .13, { uv: [len, 1] });
  b.T(len / 2, h - .03, 0, 0, 0, PI / 2).lathe([[.035, -li / 2], [.035, li / 2]], { seg: 5 }).pop();
  const nvp = Math.max(1, Math.round(len / 1.1)); for (let i = 1; i <= nvp; i++) { const x = len * i / (nvp + 1); b.box(x, .78, 0, .07, .38, .07); b.box(x, h - .1, 0, .16, .06, .09); }
  b.s({ tex: 'rail_panel', col: o.mat === 'stone' ? [1, 1, 1] : [.8, .62, .5] }); ARCH.card(b, .05, .1, 0, len - .1, .43, [0, 0, Math.max(1, Math.round(len / 1.2)), 1]);
};
ARCH.railing = (L, pts, o = {}) => {
  const b = L.mb, h = o.h || 1.05, tex = o.mat === 'stone' ? 'stone' : o.mat === 'dark' ? 'dark_wood' : 'vermilion', col = o.mat === 'stone' ? [1.15, 1.13, 1.08] : [1, 1, 1], P = o.closed ? [...pts, pts[0]] : pts;
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], c = P[i + 1], dx = c[0] - a[0], dz = c[2] - a[2], len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
    if (len < .2) continue; b.T(a[0], a[1], a[2], 0, yaw, 0); ARCH._rail(b, len, o); b.pop();
    if (o.solid !== false) L.world.box((a[0] + c[0]) / 2, a[1] + h / 2, (a[2] + c[2]) / 2, len / 2, h / 2, .12, { yaw, surface: 'wood' }); }
  const seenP = L._railPosts || (L._railPosts = new Set());
  for (const p of (o.closed ? pts : P)) { const pk = Math.round(p[0] * 50) + ',' + Math.round(p[1] * 50) + ',' + Math.round(p[2] * 50); if (seenP.has(pk)) continue; seenP.add(pk); b.s({ tex, col }).box(p[0], p[1] + (h + .2) / 2, p[2], .16, h + .2, .16); b.T(p[0], p[1] + h + .2, p[2]).lathe([[0, 0], [.1, 0], [.11, .06], [.06, .16], [0, .22]], { seg: 6 }).pop(); if (o.snow) b.s({ tex: 'snow' }).T(p[0], p[1] + h + .2, p[2]).lathe([[.105, .07], [.07, .15], [0, .2]], { seg: 6 }).pop(); }
};
// ---------- timber frame (shared by hall / shop / gate / tower) ----------
// o: {bw:[..], dw:[..], y0, colH, colR, brackets, paint, cols, walls, roof, tiles, snow, glow, fill:{front,back,left,right}: arrays of bay kinds,
//     doorOpen, studs, ceiling, eave, roofH, pitch, gov (gable overhang)}  bay kinds: wall window door opendoor board shutter counter rail open
ARCH.frame = function (L, F, o) {
  L.mb.s({ col: [1, 1, 1], emi: 0 }); const b = L.mb, bw = o.bw, dw = o.dw, W = bw.reduce((a, c) => a + c, 0), D = dw.reduce((a, c) => a + c, 0);
  const xs = [-W / 2], zs = [-D / 2]; bw.forEach(w => xs.push(xs[xs.length - 1] + w)); dw.forEach(w => zs.push(zs[zs.length - 1] + w));
  const y0 = o.y0 || 0, colH = o.colH || 3.8, colR = o.colR || colH * .065, st = o.brackets || 'full', bs = o.bs || colH * (st === 'full' ? .27 : .3);
  const BD = { full: [.92, 1.06], simple: [.5, .58], none: [.22, .3] }[st], reach = BD[0] * bs, ptop = BD[1] * bs;
  const paint = o.paint || 'ochre', pTex = { jade: 'paint_jade', ochre: 'paint_ochre' }[paint] || 'dark_wood', bTex = { jade: 'beam_jade', ochre: 'beam_ochre' }[paint] || 'dark_wood';
  const colTex = o.cols || (paint === 'plain' ? 'dark_wood' : 'vermilion'), walls = o.walls || 'white', glow = o.glow === true ? .8 : (o.glow || 0), snow = o.snow;
  const cT = y0 + colH, plT = cT + .1, purT = plT + ptop, rtype = o.roof || 'xieshan', shed = rtype === 'shed', gab = rtype === 'gable', eaveAll = !(shed || gab);
  const ov = reach + (o.eave ?? (colH * .36 + .2)), wallH = colH - .34, T = .3;
  b.T(F.x, F.y, F.z, 0, F.yaw, 0);
  // columns
  const cols = []; for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length; j++) if (i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1 || o.inner) cols.push([xs[i], zs[j]]);
  for (const [cx, cz] of cols) { ARCH.column(b, cx, y0, cz, colH, colR, { tex: colTex, base: o.colBase !== false }); const p = F.p(cx, 0, cz); L.world.cyl(p[0], p[2], F.y + y0, F.y + cT, colR + .03); }
  // facades: [plan start, plan end, outward normal, yaw, positions along, eaves?]
  const FAC = { front: { a: [-W / 2, D / 2], e: [1, 0], n: [0, 1], yaw: 0, len: W, ps: xs, eave: !!o.roof }, back: { a: [W / 2, -D / 2], e: [-1, 0], n: [0, -1], yaw: PI, len: W, ps: xs.slice().reverse().map(v => -v), eave: !!o.roof && !shed },
    right: { a: [W / 2, D / 2], e: [0, -1], n: [1, 0], yaw: PI / 2, len: D, ps: zs.slice().reverse().map(v => -v), eave: !!o.roof && eaveAll }, left: { a: [-W / 2, -D / 2], e: [0, 1], n: [-1, 0], yaw: -PI / 2, len: D, ps: zs, eave: !!o.roof && eaveAll } };
  const fp = (f, t, off = 0) => [f.a[0] + f.e[0] * t + f.n[0] * off, f.a[1] + f.e[1] * t + f.n[1] * off]; // plan point at distance t along facade, offset outward
  // architrave 闌額 + plate 普拍枋
  for (const [nm, f] of Object.entries(FAC)) { const d = nm === 'left' || nm === 'right' ? .02 : 0, ex = Math.max(.22, (Math.max(.32, .34 * bs + .07) + .06) / 2 + .04), p0 = fp(f, -ex), p1 = fp(f, f.len + ex); ARCH.beam(b, p0[0], p0[1], p1[0], p1[1], cT - .34 + d, .34 - d * 2, T + .03 + d, bTex); ARCH.beam(b, p0[0], p0[1], p1[0], p1[1], cT + d, .1, Math.max(.32, .34 * bs + .07) + d * 3, bTex); } // 普拍枋 always >= 3.5 cm wider than the 櫨斗 on each side
  // roof geometry first (we need its underside)
  let roof = null, ry0 = 0, zc = 0;
  if (o.roof) {
    const gov = o.gov ?? .55, X = gab ? W / 2 + gov : shed ? W / 2 + gov : W / 2 + ov, Zr = shed ? (D + ov + .3) / 2 : D / 2 + ov; zc = shed ? (ov - .3) / 2 : 0;
    const k = shed ? .12 : .3, f = s => s - k * s * (1 - s), H = o.roofH ?? (shed ? 2 * Zr * .32 * (o.pitch || 1) : (D / 2 + reach) * (2 / 3) * (o.pitch || 1) + (ov - reach) * .3);
    const th = o.tiles === 'thatch' || o.tiles === 'straw' ? .36 : Math.min(.32, .12 + Zr * .025), sp = shed ? (ov - reach) / (2 * Zr) : (ov - reach) / Zr; ry0 = purT + th - H * f(sp);
    b.T(0, ry0, zc); roof = ARCH.roof(b, { type: rtype, X: gab || shed ? X : Math.max(X, Zr + .01), Z: Zr, H, k, thick: th, tiles: o.tiles, snow, chiwen: o.chiwen ?? !(gab || shed), col: o.roofCol, barge: o.barge, fish: o.fish, rolls: o.rolls, rafS: o.rafters === false ? 0 : sp + .02, flyR: o.flyR, rafSp: st === 'none' ? .55 : .45 }); b.pop();
  }
  const under = (x, z) => roof ? ry0 + roof.underY(x, z - zc) : purT;
  if (roof && !ARCH.lod && L.world && L.world.roof) { const c = F.p(0, ry0, zc); L.world.roof(c[0], c[1], c[2], roof.X, roof.H, roof.Z, F.yaw, gab ? 0 : shed ? 1 : 2, rtype === 'xieshan' ? .46 : 1, { surface: o.tiles === 'thatch' || o.tiles === 'straw' ? 'thatch' : 'tile' }); } // walkable roof
  // brackets, eave purlins, wall-plane panels
  for (const [nm, f] of Object.entries(FAC)) {
    if (!f.eave) { // no eaves on this side (gable ends / back of a shed): fill up to the roof underside
      if (roof) { const pts = [], N = 8; for (let i = 0; i <= N; i++) { const t = -.15 + (f.len + .3) * i / N, p = fp(f, t); pts.push([p[0], under(p[0], p[1]) + .04, p[1]]); } const pa = fp(f, -.15), pb = fp(f, f.len + .15), ctr = [(pa[0] + pb[0]) / 2, cT, (pa[1] + pb[1]) / 2];
        b.s({ tex: { brick: 'brick', plank: 'plank', mud: 'rammed_earth', adobe: 'mudbrick' }[walls] || 'plaster', col: walls === 'plank' ? [.7, .6, .52] : [1, 1, 1] }); const uvf = p => [(p[0] * f.e[0] + p[2] * f.e[1]) / 2, -p[1] / 2];
        const all = [[pa[0], cT, pa[1]], ...pts, [pb[0], cT, pb[1]]]; ARCH.poly(b, all, [f.n[0], 0, f.n[1]], uvf, ctr); ARCH.poly(b, all, [-f.n[0], 0, -f.n[1]], uvf, ctr); }
      continue;
    }
    const m = fp(f, f.len / 2), uTop = under(m[0] + f.n[0] * .1, m[1] + f.n[1] * .1) + (roof ? Math.min(.1, roof.th * .6) : .06), dz = nm === 'left' || nm === 'right' ? .015 : 0;
    { const p0 = fp(f, .025), p1 = fp(f, f.len - .025); b.s({ col: paint === 'plain' ? [.62, .52, .44] : [1, 1, 1] }); ARCH.slab(b, p0[0], p0[1], p1[0], p1[1], plT + .025 + dz, uTop - plT - .025, .09 + dz, paint === 'plain' ? 'plank' : 'plaster', 2); b.s({ col: [1, 1, 1] }); } // 拱眼壁: plaster on painted halls, boards on plain houses
    { const p0 = fp(f, -reach - .05, reach), p1 = fp(f, f.len + reach + .05, reach); ARCH.beam(b, p0[0], p0[1], p1[0], p1[1], purT - .2 * bs + dz, .2 * bs + (roof ? Math.min(.07, roof.th * .45) : 0), .18 * bs, bTex); } // eave purlin, top buried in the roof: no light leak
    const pos = new Set(f.ps.map(v => Math.round((v - f.ps[0]) * 1000) / 1000));
    // corner columns: the front/back facades own the corner bracket sets; side facades must not emit them again (z-fighting duplicates)
    if ((nm === 'left' || nm === 'right') && FAC.front.eave) { pos.delete(0); pos.delete(Math.round((f.ps[f.ps.length - 1] - f.ps[0]) * 1000) / 1000); }
    if (nm === 'back' && FAC.front.eave && false) pos.clear(); if (st === 'full' && o.inter !== false && (o.inter === 'all' || nm === 'front' || nm === 'back')) for (let i = 0; i < f.ps.length - 1; i++) pos.add(Math.round(((f.ps[i] + f.ps[i + 1]) / 2 - f.ps[0]) * 1000) / 1000);
    for (const t of pos) { const p = fp(f, t); b.T(p[0], plT, p[1], 0, f.yaw, 0); ARCH.bracket(b, bs, { style: st, tex: pTex }); b.pop(); }
  }
  if (st === 'full' && roof && eaveAll) for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { b.s({ tex: pTex }).T(sx * W / 2, plT + .62 * bs, sz * D / 2, .3, Math.atan2(sx, sz), 0).box(0, 0, .75 * bs, .14 * bs, .16 * bs, 1.9 * bs).pop(); }
  // ceiling (hides the roof shell from inside)
  if (o.ceiling !== false && o.roof) { // the ceiling by status (營繕令: decorated ceilings by rank): painted coffers 平棊 only in halls with full bracket sets (palaces, great
    // temple halls, the highest officials) and temple halls; a plain lattice 平闇 in ordinary tiled houses, shops and inns; huts and thatch show their rafters (徹上明造)
    const ck = typeof o.ceiling === 'string' ? o.ceiling : (o.brackets === 'full' || o.cls === 3) ? 'ceiling' : (o.tiles === 'thatch' || o.tiles === 'straw' || (o.paint === 'plain' && (o.brackets || 'none') === 'none')) ? 'rafters' : 'ceiling_plain';
    b.s({ tex: ck }).box(0, plT - .01, 0, W - .2, .1, D - .2, { faces: { top: 'dark_wood' }, uv: ck === 'ceiling' ? [Math.round(W / 1.4), Math.round(D / 1.4)] : ck === 'rafters' ? [Math.round(W / 2), Math.round(D / 2)] : [Math.round(W / 1.2), Math.round(D / 1.2)] }); }
  // infill
  const lights = [], roomLit = !!o.lit && hash2((o.seed || 0) * 31 + 7, 11, 530) < o.lit; let glowBays = 0; // QA (tool/qa_build.js glow): a ROOM is lamplit or dark as a whole (the same draw as its LOD1 window card): all its openings glow, and it gets a real light
  for (const [nm, f] of Object.entries(FAC)) { const kinds = (o.fill && o.fill[nm]) || []; for (let i = 0; i < f.ps.length - 1; i++) { let kind = kinds[i] || 'open'; if (kind === 'open') continue; if (o.cls === 0) kind = kind === 'opendoor' ? 'door' : kind === 'boardopen' ? 'board' : kind; /* homes: always closed */ const sc = o.cls >= 1 && ARCH.STATEK.has(kind) ? o.cls : 0; // business class: open / closed geometry by schedule
    const t0 = f.ps[i] - f.ps[0], t1 = f.ps[i + 1] - f.ps[0], len = t1 - t0, c = fp(f, (t0 + t1) / 2);
    const eS = nm === 'front' || nm === 'back' ? 1 : -1, nb = f.ps.length - 2;
    const sdn = (o.seed || 0) * 31 + i * 7 + nm.length * 101, lit = roomLit && kind !== 'wall', bg = glow || (lit ? .32 + .3 * hash2(sdn, 12, 531) : 0); if (bg > 0 && kind !== 'wall' && kind !== 'rail') glowBays++; // a lamp-lit room behind this bay (uneven)
    if (bg > 0 && !ARCH.lod && !o._lampDone && (kind === 'opendoor' || kind === 'counter' || kind === 'boardopen')) { o._lampDone = 1; // an open, lit room: a real lamp on a stand 燈檠 inside, beside the opening, and its light
      const bc = (t0 + t1) / 2, inward = bc > .01 ? -1 : bc < -.01 ? 1 : (hash2(o.seed || 0, i, 533) < .5 ? -1 : 1), along = kind === 'counter' ? bc + (len / 2 - .45) * inward : bc + (len / 2 + .4) * (hash2(o.seed || 0, i, 533) < .5 ? -1 : 1), q = fp(f, along, -Math.max(1.15, Math.min(2.0, (nm === 'left' || nm === 'right' ? W : D) - .7))) /* beside a doorway (never in its path), or at the inner end of a counter bay */, wq = F.p(q[0], y0, q[1]); b.pop(); b.s({ bone: o.lamp || (glow ? 3 : 1) }); L.prop(b2 => PROPS.oilLamp(b2, true, .9), wq[0], wq[1], wq[2], { yaw: F.yaw, solid: { r: .18, h: 1.3 } }); b.s({ bone: 0 }); b.T(F.x, F.y, F.z, 0, F.yaw, 0);
      const l = L.light(wq[0], wq[1] + 1.25, wq[2], 5.5, [1.25, .7, .34], { flicker: .12 }); l.group = o.lamp || (glow ? 3 : 1); lights.push(l); }
    b.T(c[0], y0, c[1], 0, f.yaw, 0); ARCH._bay(b, len, wallH, kind, { st: sc, walls, glow: bg, lamp: o.lamp || (glow ? 3 : 1), paint, pTex, colTex, doorOpen: o.doorOpen, studs: o.studs, T, seed: (o.seed || 0) + i * 13 + nm.length, blind: o.blind, curtain: o.curtain, wcol: o.wcol, ends: [i === 0 ? eS : 0, i === nb ? eS : 0] }); b.pop();
    const solidK = kind !== 'opendoor' && kind !== 'boardopen' && kind !== 'counter' && kind !== 'rail' && kind !== 'portal' && kind !== 'open'; /* portals (ward gates: leaves drawn and collided dynamically by CITY) never get a static solid */ const cc = F.p(c[0], 0, c[1]);
    if (sc) { ARCH.solid(L, F, c[0], y0, c[1], len, wallH, T + .06, { yaw: f.yaw, surface: 'wood', grp: 2 * sc - 1 }); /* boards / leaves: solid only while closed */ if (kind === 'counter') for (const sd of [-1, 1]) { const q = fp(f, (t0 + t1) / 2 + sd * len * .3, -.45); ARCH.solid(L, F, q[0], y0, q[1], len * .38, 1, .55, { yaw: f.yaw, surface: 'wood' }); } else ARCH.solid(L, F, c[0], y0, c[1], len, .18, T + .1, { yaw: f.yaw, surface: 'wood' }); }
    else if (solidK) ARCH.solid(L, F, c[0], y0, c[1], len, wallH, T + .06, { yaw: f.yaw, surface: 'wood' });
    else if (kind === 'counter') { for (const sd of [-1, 1]) { const q = fp(f, (t0 + t1) / 2 + sd * len * .3, -.45); ARCH.solid(L, F, q[0], y0, q[1], len * .38, 1, .55, { yaw: f.yaw, surface: 'wood' }); } }
    else if (kind === 'rail') ARCH.solid(L, F, c[0], y0, c[1], len, 1.05, .2, { yaw: f.yaw, surface: 'wood' });
    else ARCH.solid(L, F, c[0], y0, c[1], len, .18, T + .1, { yaw: f.yaw, surface: 'wood' });
    if (glow && kind !== 'wall' && nm !== 'back') { const q = F.p(c[0] - f.n[0] * 1.2, y0 + 1.7, c[1] - f.n[1] * 1.2); lights.push(L.light(q[0], q[1], q[2], 4.5 + len * .3, [1.25 * glow, .72 * glow, .36 * glow], { flicker: .06 })); }
    if (!ARCH.lod && o.cls !== undefined && L.meta && ARCH.STATEK.has(kind) && (sc || kind === 'door' || kind === 'board')) { const ins = kind === 'counter' ? 1.3 : .95, pa = F.p(c[0] + f.n[0] * .95, y0, c[1] + f.n[1] * .95), pb = F.p(c[0] - f.n[0] * ins, y0, c[1] - f.n[1] * ins); // a closable door / gate / shop front: E passes through while closed
      L.meta.doors.push({ x: cc[0], y: F.y + y0, z: cc[2], w: len, yaw: F.yaw + f.yaw, cls: sc, kind, a: [pa[0], pa[2]], b: [pb[0], pb[2]] }); }
    void cc; } }
  if (glowBays && !lights.length && !ARCH.lod && L.light) { const q = F.p(0, y0 + 1.7, 0), g = glow ? Math.max(glow, .6) : 1; const l = L.light(q[0], q[1], q[2], clamp(Math.max(W, D) * .7, 4.5, 8), [1.3 * g, .72 * g, .34 * g], { flicker: .08 }); l.group = o.lamp || (glow ? 3 : 1); lights.push(l); } // every glowing room is lit inside
  b.pop();
  return { roomLit: roomLit || !!glow, W, D, xs, zs, cT, plT, purT, ov, roof, ry0, zc, under, lights, bs, reach, bkFront: ({ full: 1.26, simple: .52 }[st] || .3) * bs, ridge: roof ? ry0 + roof.H : purT };
};
// one bay of infill in bay frame: centred at x=0 on the wall plane z=0, floor y=0, outward +z
ARCH._bay = function (b, len, hb, kind, o) {
  const T = o.T || .3, wt = { white: 'plaster', brick: 'brick', plank: 'plank' }[o.walls] || 'plaster', wcol = o.walls === 'plank' ? [.72, .6, .5] : [1, 1, 1], ft = o.paint === 'plain' ? 'dark_wood' : o.pTex === 'paint_jade' ? 'paint_jade' : 'vermilion', fc = [1, 1, 1];
  const W1 = (x0, x1, y0, y1, t = T, tex = wt, tile = o.walls === 'brick' ? 1 : 2, col = wcol) => { if (x1 - x0 < .01 || y1 - y0 < .01) return; b.s({ tex, col }).box((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, t, { world: tile }); };
  const wallPart = (x0, x1, y0, y1) => { if (o.walls === 'white') { const d = Math.min(y1, .85); if (y0 < d) W1(x0, x1, y0, d, T + .06, 'brick', 1, [1, 1, 1]); W1(x0, x1, Math.max(y0, d), y1); } else W1(x0, x1, y0, y1); };
  const fr = (x0, x1, y0, y1, w = .09, d = T + .05) => { b.s({ tex: ft, col: fc }); b.box((x0 + x1) / 2, y0 + w / 2, 0, x1 - x0, w, d).box((x0 + x1) / 2, y1 - w / 2, 0, x1 - x0, w, d).box(x0 + w / 2, (y0 + y1) / 2, 0, w, y1 - y0 - 2 * w, d).box(x1 - w / 2, (y0 + y1) / 2, 0, w, y1 - y0 - 2 * w, d); };
  const paperLat = (x0, x1, y0, y1, lat, rep) => { b.s({ tex: lat === 'lattice' ? 'window_bars' : 'window_grid', col: o.glow ? [1.05, .86, .62] : [.85, .82, .78], emi: (o.glow || 0) * .55 }); ARCH.card(b, x0, y0, 0, x1 - x0, y1 - y0, [0, 0, rep, Math.max(1, Math.round((y1 - y0) / (x1 - x0) * rep))]); b.s({ emi: 0 }); };
  const h2 = len / 2;
  if (kind === 'wall') wallPart(-h2, h2, 0, hb);
  else if (kind === 'window') { const ww = Math.min(len - .9, 2.4), wy0 = .95, wy1 = Math.min(hb - .45, wy0 + 1.45); wallPart(-h2, -ww / 2, 0, hb); wallPart(ww / 2, h2, 0, hb); wallPart(-ww / 2, ww / 2, 0, wy0); wallPart(-ww / 2, ww / 2, wy1, hb); fr(-ww / 2, ww / 2, wy0, wy1); paperLat(-ww / 2 + .09, ww / 2 - .09, wy0 + .09, wy1 - .09, 'lattice', Math.max(1, Math.round(ww / 1.6))); }
  else if (kind === 'door' || kind === 'opendoor') { const lv = len > 3 ? 4 : 2, hd = hb - .5, lw = len / lv; b.s({ tex: 'stone', col: [.9, .9, .88] }).box(0, .08, 0, len, .16, T + .12);
    fr(-h2, h2, hd, hb, .08); paperLat(-h2 + .08, h2 - .08, hd + .08, hb - .08, 'lattice', Math.max(1, Math.round(len / 1.2))); // Tang: 直欞 transom, not Song 格子
    if (kind === 'door') { for (let i = 0; i <= lv; i++) b.s({ tex: ft, col: fc }).box(-h2 + i * lw, (hd + .16) / 2, 0, .09, hd - .16, .1); b.box(0, hd - .045, 0, len, .09, .075).box(0, 1.0, 0, len, .08, .075); b.s({ tex: ft === 'paint_jade' ? 'vermilion' : ft }).box(0, .58, 0, len - .05, .84, .06); b.s({ tex: 'plank', col: [.62, .48, .38] }).box(0, (1.04 + hd - .09) / 2, 0, len - .1, hd - .09 - 1.04, .05, { uv: [Math.max(1, Math.round(len / .9)), 2] }); } // 板門 leaves (plank), not lattice
    else { b.s({ tex: ft, col: fc }).box(-h2 + .05, (hd + .16) / 2, 0, .1, hd - .16, .12).box(h2 - .05, (hd + .16) / 2, 0, .1, hd - .16, .12).box(0, hd - .045, 0, len - .2, .09, .09); for (const sd of [-1, 1]) { b.T(sd * (h2 - .1), 0, -.1, 0, sd * PI / 2, 0); b.s({ tex: ft === 'paint_jade' ? 'vermilion' : ft }).box(lw / 2, .58, 0, lw, .84, .06); b.s({ tex: ft }).box(lw / 2, (hd + 1) / 2, 0, lw, hd - 1.0, .05); b.pop(); } }
  }
  else if (kind === 'board' || kind === 'boardopen') { const hd = hb - .3; b.s({ tex: 'stone', col: [.9, .9, .88] }).box(0, .1, 0, len, .2, T + .14); fr(-h2, h2, 0, hd + .1, .12, T + .08); W1(-h2, h2, hd + .1, hb, T); b.s({ tex: o.studs ? 'door_studs' : 'plank', col: o.studs ? [1, 1, 1] : [.6, .46, .38] }); if (kind === 'board') b.box(0, (hd + .2) / 2 + .05, 0, len - .24, hd - .1, .12, { uv: [Math.max(1, Math.round(len / 1.2)), Math.max(1, Math.round(hd / 1.2))] }); else for (const sd of [-1, 1]) { const lw = (len - .24) / 2; b.T(sd * (h2 - .14), 0, -.1 - lw / 2, 0, PI / 2, 0).box(0, (hd + .2) / 2 + .05, 0, lw, hd - .1, .1, { uv: [Math.max(1, Math.round(lw / 1.2)), Math.max(1, Math.round(hd / 1.2))] }).pop(); } b.s({ tex: 'iron' }); if (kind === 'board') b.box(-.12, 1.2, .07, .06, .3, .03).box(.12, 1.2, .07, .06, .3, .03); else { const lw = (len - .24) / 2; for (const sd of [-1, 1]) b.box(sd * (h2 - .14 - .07), 1.2, -.1 - lw + .22, .03, .3, .06); } }
  else if (kind === 'portal') { const hd = hb - .3; b.s({ tex: 'stone', col: [.9, .9, .88] }).box(0, .1, 0, len, .2, T + .14); fr(-h2, h2, 0, hd + .1, .12, T + .08); W1(-h2, h2, hd + .1, hb, T); } // gateway without leaves (leaves are dynamic: CITY.gates)
  else if (kind === 'shutter') { b.s({ tex: 'stone', col: [.9, .9, .88] }).box(0, .08, 0, len, .16, T + .12); fr(-h2, h2, .16, hb, .1, T + .04); b.s({ tex: 'shutter', col: [1, 1, 1] }).box(0, (hb + .16) / 2, 0, len - .2, hb - .36, .08, { uv: [Math.max(1, Math.round(len / 1.3)), 1] }); }
  else if (kind === 'counter') { b.s({ tex: 'plank', col: [.66, .54, .44] }); for (const sd of [-1, 1]) { b.box(sd * len * .3, .48, -.45, len * .38, .96, .5, { world: 1.2 }); b.s({ tex: 'dark_wood' }).box(sd * len * .3, .99, -.45, len * .4, .06, .58); b.s({ tex: 'plank' }); } fr(-h2, h2, hb - .35, hb, .07, .12); b.s({ tex: 'lattice', col: [.8, .7, .6] }); ARCH.card(b, -h2 + .07, hb - .28, 0, len - .14, .21, [0, 0, Math.round(len), .2]); }
  else if (kind === 'rail') { b.T(-h2, 0, 0); ARCH._rail(b, len, { h: 1.0, mat: o.paint === 'plain' ? 'dark' : 'red' }); b.pop(); }
};
ARCH.hall = function (L, x, y, z, o = {}) {
  L.mb.s({ col: [1, 1, 1], emi: 0 }); const F = ARCH.F(x, y, z, o.yaw || 0), b = L.mb, nb = o.bays || 3, nd = o.dbays || 2;
  const bw = Array.isArray(o.bayW) ? o.bayW : Array.from({ length: nb }, (_, i) => o.bayW || (nb % 2 && i === (nb - 1) / 2 ? 4.2 : 3.6)), dw = Array.isArray(o.dbayW) ? o.dbayW : Array(nd).fill(o.dbayW || 3.4);
  const W = bw.reduce((a, c) => a + c, 0), D = dw.reduce((a, c) => a + c, 0), colH = o.colH || 3.8, ph = o.platform ?? .9, pm = o.pm ?? (colH * .4 + .5), walls = o.walls || 'white';
  const ci = (nb - 1) / 2, doorB = Array.isArray(o.door) ? o.door : o.door === 'none' ? [] : o.door === 'all' ? bw.map((_, i) => i) : nb % 2 ? [ci] : [nb / 2 - 1, nb / 2];
  const dk = o.doorOpen ? 'opendoor' : 'door', win = o.windows ?? true;
  const fill = o.fill || (walls === 'open' ? {} : { front: bw.map((_, i) => doorB.includes(i) ? dk : win ? 'window' : 'wall'), back: bw.map((_, i) => o.backDoor && doorB.includes(i) ? dk : win === 'all' ? 'window' : 'wall'),
    left: dw.map(() => win === 'all' ? 'window' : 'wall'), right: dw.map(() => win === 'all' ? 'window' : 'wall') });
  // platform 臺基 with stone curb
  if (ph > .05) { b.T(x, y, z, 0, F.yaw, 0); const PW = W + 2 * pm, PD = D + 2 * pm;
    ARCH.box(b, 0, 0, 0, PW, ph, PD, o.platTex || 'brick', 1, { faces: { top: o.snow ? 'snow' : 'pave' }, skip: ['bot'] });
    b.s({ tex: 'stone', col: [.95, .95, .93] }); for (const sz of [-1, 1]) b.box(0, ph - .045, sz * (PD / 2 - .155), PW + .04, .15, .35, { world: 1, faces: o.snow ? { top: 'snow' } : undefined }); for (const sx of [-1, 1]) b.box(sx * (PW / 2 - .155), ph - .045, 0, .35, .15, PD - .66, { world: 1, faces: o.snow ? { top: 'snow' } : undefined });
    b.s({ tex: 'stone', col: [.85, .85, .84] }).box(0, .1, 0, PW + .08, .2, PD + .08, { world: 1, skip: ['bot', 'top'] }); b.pop();
    ARCH.solid(L, F, 0, 0, 0, PW, ph, PD);
    const stairs = []; // [x centre, z side (+1 front / -1 back), half-width incl. side ramps] for the railing openings
    if (o.steps !== false) { const sw = doorB.length ? doorB.reduce((a, i) => a + bw[i], 0) - .6 : bw[Math.floor(ci)] - .6, sx = doorB.length ? (doorB.reduce((a, i) => a + bw.slice(0, i).reduce((p, c) => p + c, 0) + bw[i] / 2, 0) / doorB.length - W / 2) : 0;
      const ww = Math.max(1.6, sw); ARCH._steps(L, F, sx, PD / 2, 0, ww, ph, { snow: o.snow }); stairs.push([sx, 1, ww / 2 + .36]); if (o.backDoor) { ARCH._steps(L, F, -sx, -PD / 2, PI, ww, ph, { snow: o.snow }); stairs.push([-sx, -1, ww / 2 + .36]); } }
    if (o.railing) { // runs round the platform edge, open over the full width of every flight of stairs
      const e = PW / 2 - .2, f2 = PD / 2 - .2, P = (lx, lz) => F.p(lx, ph, lz), runs = []; let cur = [];
      const edge = (x0, x1, z, side) => { const dir = Math.sign(x1 - x0), gaps = stairs.filter(g => g[1] === side).map(g => [Math.max(-e, g[0] - g[2]), Math.min(e, g[0] + g[2])]).sort((a, b) => dir * (a[0] - b[0]));
        for (const [g0, g1] of gaps) { const [ga, gb] = dir > 0 ? [g0, g1] : [g1, g0]; cur.push([ga, z]); runs.push(cur); cur = [[gb, z]]; } cur.push([x1, z]); };
      cur.push([e, f2]); cur.push([e, -f2]); edge(e, -e, -f2, -1); cur.push([-e, f2]); edge(-e, e, f2, 1);
      if (runs.length) { runs[0] = cur.concat(runs[0].slice(1)); } else runs.push(cur.concat([[e, f2]]));
      for (const r of runs) { const pts = r.filter((p, i) => !i || Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) > .05); if (pts.length > 1) ARCH.railing(L, pts.map(p => P(p[0], p[1])), { mat: o.railMat || 'red', snow: o.snow }); } }
  }
  const fr = ARCH.frame(L, F, Object.assign({}, o, { bw, dw, y0: ph, fill, roof: o.roof || 'xieshan' }));
  if (o.tablet) { b.T(x, y, z, 0, F.yaw, 0); for (const sd of o.tabletBack ? [1, -1] : [1]) ARCH.hangTablet(b, fr, o.tablet, o.tabletW || .75, o.tabletH || 1.5, { side: sd, inBay: o.brackets !== 'full' }); b.pop(); } // 牌匾 in front of the brackets (and on the inner face too when asked)
  const door = F.p(0, 0, D / 2 + pm + (ph > .05 ? Math.round(ph / .17) * .32 : 0) + 1.2);
  return { F, W, D, top: y + ph, colTop: y + fr.cT, eave: y + fr.ry0, ridge: y + fr.ridge, door, inside: F.p(0, ph, 0), roof: fr.roof, frame: fr, front: fill.front, back: fill.back };
};
ARCH.shop = function (L, x, y, z, o = {}) { // street shop: 1–2 storeys, gable roof parallel to the street, sign, wine flag, awning
  L.mb.s({ col: [1, 1, 1], emi: 0 }); const F = ARCH.F(x, y, z, o.yaw || 0), b = L.mb, w = o.w || 6.6, d = o.d || 5, st = o.storeys || 1, ph = o.platform ?? .25, h1 = o.colH || 3.1, h2 = o.colH2 || 2.5;
  const paint = o.paint || 'plain', walls = o.walls || 'plank', front = o.front || 'counter', bw = [w * .3, w * .4, w * .3], dw = [d];
  b.T(x, y, z, 0, F.yaw, 0); ARCH.box(b, 0, 0, .35, w + .6, ph, d + 1.3, 'stone', 1, { faces: { top: o.snow ? 'snow_tracks' : 'pave_rect' }, skip: ['bot'] }); b.pop(); ARCH.solid(L, F, 0, 0, .35, w + .6, ph, d + 1.3);
  const fk = front === 'shutters' ? ['shutter', 'opendoor', 'shutter'] : front === 'lattice' ? ['door', 'opendoor', 'door'] : ['counter', 'opendoor', 'counter'];
  const base = { cls: o.cls, bw, dw, colR: .13, brackets: o.brackets || 'none', paint, walls, cols: o.cols || 'dark_wood', tiles: o.tiles, snow: o.snow, glow: o.glow, lit: o.lit, lamp: o.lamp, seed: o.seed, chiwen: false, gov: .25, doorOpen: true, eave: .95, barge: 'dark_wood', rafters: false };
  let fr;
  if (st === 1) fr = ARCH.frame(L, F, Object.assign({}, base, { y0: ph, colH: h1, roof: o.roof || 'gable', fill: { front: fk, back: ['wall', 'wall', 'wall'], left: ['wall'], right: ['wall'] } }));
  else {
    ARCH.frame(L, F, Object.assign({}, base, { y0: ph, colH: h1, fill: { front: fk, back: ['wall', 'wall', 'wall'], left: ['wall'], right: ['wall'] } }));
    const y2 = ph + h1 + .12; b.T(x, y, z, 0, F.yaw, 0); b.s({ tex: 'plank', col: [.6, .5, .42] }).box(0, y2 - .06, 0, w + .3, .14, d + .3, { world: 1.5 });
    b.T(0, ph + h1 - .05, d / 2 + .55); ARCH.roof(b, { type: 'shed', X: w / 2 + .3, Z: .72, H: .5, tiles: o.tiles, snow: o.snow, thick: .1 }); b.pop(); b.pop();
    fr = ARCH.frame(L, F, Object.assign({}, base, { y0: y2, colH: h2, colBase: false, roof: o.roof || 'gable', fill: { front: o.balcony ? ['rail', 'rail', 'rail'] : ['window', 'window', 'window'], back: ['wall', 'window', 'wall'], left: ['wall'], right: ['wall'] } }));
  }
  b.T(x, y, z, 0, F.yaw, 0);
  if (o.jars !== false) { if (front === 'counter') { for (const sx of [-1, 1]) { b.T(sx * w * .28, ph + .96, d / 2 - .45); PROPS.wineJar(b, .32); b.pop(); } } /* (shops with ARCH.goods lay out their own wares) */
    for (let i = 0; i < 3; i++) { b.T(-w * .3 + i * w * .3, ph, -d / 2 + .5); PROPS.wineJar(b, .6 + (i & 1) * .15); b.pop(); } }
  if (o.sign) { b.T(-w / 2 - .05, 0, d / 2 + 1.0); PROPS.signboard(b, o.sign, { h: o.signH || 1.7 }); b.pop(); ARCH.solid(L, F, -w / 2 - .05, 0, d / 2 + 1.0, .5, 2.2, .3); }
  if (o.flag) { b.T(w / 2 + .25, 0, d / 2 + .8); PROPS.wineFlag(b, o.flag === true ? 'sign_jiu' : o.flag, { h: st > 1 ? 8 : 6.5, fw: o.flagW || .6, fh: o.flagH || 2.5 }); /* long narrow 酒旗 */ b.pop(); const p = F.p(w / 2 + .25, 0, d / 2 + .8); L.world.cyl(p[0], p[2], y, y + 6, .12); }
  if (o.awning ?? st === 1) { b.T(0, 0, d / 2 + .7); PROPS.awning(b, w * .42, 1.9, 2.55); b.pop(); for (const sd of [-1, 1]) { const p = F.p(sd * w * .21, 0, d / 2 + 2.55); L.world.cyl(p[0], p[2], y, y + 2.4, .08); } }
  b.pop();
  if (o.huanmen) ARCH.huanmen(L, ...F.p(0, 0, d / 2 + 2.9), { yaw: F.yaw, w: w * .7, h: (st > 1 ? h1 + h2 : h1) + 3.2, glow: o.glow });
  return { F, w, d, fk, colH: h1, top: y + ph, ridge: y + fr.ridge, door: F.p(0, ph, d / 2 + 1.5), inside: F.p(0, ph, 0) };
};
ARCH.swag = (b, p0, p1, sag, wd, n = 6) => { // hanging silk strip (catenary), double-sided
  const P = t => [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t) - sag * 4 * t * (1 - t), lerp(p0[2], p1[2], t)];
  for (const fl of [false, true]) b.grid(n, 1, (i, j) => { const p = P(i / n); return [p[0], p[1] - j * wd * (1 + .3 * Math.sin(i / n * PI)), p[2] + (fl ? -.005 : .005), i / n * 2, j]; }, false, null, fl);
};
ARCH.huanmen = function (L, x, y, z, o = {}) { // 彩樓歡門: tall bamboo/timber frame dressed with silk, flowers and lanterns
  const b = L.mb, F = ARCH.F(x, y, z, o.yaw || 0), w = o.w || 5, h = o.h || 8, g = o.glow === undefined ? .8 : (o.glow === true ? .8 : o.glow), r = RNG(o.seed || 5);
  const pole = (p, q, rd = .055) => b.s({ tex: 'bamboo', col: [.95, .82, .62], emi: 0 }).tube([p, q], { r: rd, seg: 5, steps: 1, cap: false });
  const X = [-w / 2, -w * .2, w * .2, w / 2], tiers = [h * .42, h * .58, h * .72, h * .84], silk = [[1.2, .36, .3], [.45, .9, .7], [.4, .55, 1.1], [1.15, .9, .45]];
  b.T(x, y, z, 0, F.yaw, 0);
  for (const zz of [0, -.7]) { for (const xx of X) pole([xx, 0, zz], [xx, Math.abs(xx) > w * .3 ? h : h * .84, zz], Math.abs(xx) > w * .3 ? .075 : .055); for (const ty of tiers) pole([-w / 2 - .25, ty, zz], [w / 2 + .25, ty, zz], .045); }
  for (const xx of X) for (const ty of [tiers[0], tiers[3]]) pole([xx, ty, 0], [xx, ty, -.7], .035);
  for (const zz of [0, -.7]) { pole([-w / 2 - .2, h - .6, zz], [0, h + 1.3, zz], .05); pole([w / 2 + .2, h - .6, zz], [0, h + 1.3, zz], .05); pole([-w * .2, tiers[3], zz], [0, h + .5, zz], .04); pole([w * .2, tiers[3], zz], [0, h + .5, zz], .04); }
  pole([0, h + 1.3, 0], [0, h + 1.3, -.7], .04);
  for (let i = 0; i < 3; i++) { const x0 = X[i], x1 = X[i + 1]; pole([x0, tiers[1], 0], [x1, tiers[2], 0], .03); pole([x0, tiers[2], 0], [x1, tiers[1], 0], .03); pole([x0, tiers[2], 0], [x1, tiers[3], 0], .03); pole([x0, tiers[3], 0], [x1, tiers[2], 0], .03); }
  tiers.forEach((ty, ti) => { for (let i = 0; i < 3; i++) { b.s({ tex: 'silk', col: silk[(i + ti) % 4] }); ARCH.swag(b, [X[i], ty - .02, .07], [X[i + 1], ty - .02, .07], .32 + ti * .04, .28); } });
  for (const xx of X) { b.s({ tex: 'silk', col: silk[(xx > 0) + 1] }); for (let k = 0; k < 2; k++) b.grid(4, 1, (i, j) => [xx + (j - .5) * .18 + Math.sin(i * .9 + k) * .04, tiers[3] - i / 4 * 2.6, .08 + k * .01 - .02 * j, j, i / 4], false, null, !!k); }
  for (const ty of tiers) for (const xx of X) for (let k = 0; k < 2; k++) { const c = [[1.1, .25, .3], [1.2, .7, .75], [1.2, 1.15, 1.05], [1.1, .8, .2]][(k + (ty * 7 | 0)) % 4]; b.s({ tex: 'silk', col: c }).ell(xx + (r() - .5) * .3, ty + (r() - .3) * .25, .1 + r() * .05, .1, .09, .08, { seg: 4, ring: 3, disp: lumpy(.3, 8, k) }); }
  for (let i = 0; i < 3; i++) { b.T((X[i] + X[i + 1]) / 2, tiers[0] - .35, .02); PROPS.lanternRed(b, .2, { emi: g, cord: .25 }); b.pop(); }
  b.T(0, h + 1.3, 0); PROPS.lanternRed(b, .16, { emi: g, cord: .1 }); b.pop();
  b.s({ emi: 0, col: [1, 1, 1] }); b.pop();
  for (const xx of [X[0], X[3]]) { const p = F.p(xx, 0, -.35); L.world.box(p[0], y + h / 2, p[2], .12, h / 2, .45, { yaw: F.yaw, surface: 'wood' }); }
  if (g) { const p = F.p(0, tiers[0] - .6, .3); L.light(p[0], p[1], p[2], 6, [1.4 * g, .55 * g, .3 * g], { flicker: .1 }); }
};
ARCH.wall = function (L, x0, z0, x1, z1, o = {}) {
  const b = L.mb, st = o.style || 'courtyard', ram = st === 'rammed', y = o.y || 0, h = o.h ?? (ram ? 9 : 2.6), t = o.t ?? (ram ? 7 : .5);
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L2 = len / 2, sn = o.snow;
  b.s({ col: [1, 1, 1], emi: 0 }); b.T(cx, y, cz, 0, yaw, 0);
  if (ram) { const tt = Math.max(1, t - 2 * h * (o.batter ?? .14)), hs = Math.hypot(h, (t - tt) / 2);
    b.s({ tex: 'rammed_earth', col: o.wcol || [1, 1, 1] });
    ARCH.quad(b, [-L2, 0, t / 2], [L2, 0, t / 2], [L2, h, tt / 2], [-L2, h, tt / 2], [0, .2, 1], [len / 3, hs / 3]); ARCH.quad(b, [L2, 0, -t / 2], [-L2, 0, -t / 2], [-L2, h, -tt / 2], [L2, h, -tt / 2], [0, .2, -1], [len / 3, hs / 3]);
    for (const sd of [-1, 1]) ARCH.poly(b, [[sd * L2, 0, -t / 2], [sd * L2, 0, t / 2], [sd * L2, h, tt / 2], [sd * L2, h, -tt / 2]], [sd, 0, 0], p => [p[2] / 3, -p[1] / 3]);
    b.s({ tex: sn ? 'snow' : 'pave_rect' }); ARCH.quad(b, [-L2, h, tt / 2], [L2, h, tt / 2], [L2, h, -tt / 2], [-L2, h, -tt / 2], [0, 1, 0], [len / 2, tt / 2]);
    if (o.parapet !== false) { const n = Math.max(1, Math.floor(len / 2)); b.s({ tex: 'brick' }); b.box(0, h + .3, tt / 2 - .3, len, .6, .5, { world: 1, skip: ['bot'] }); for (const [u0, u1] of ARCH._runs(-L2, L2, o.innerGap)) b.box((u0 + u1) / 2, h + .25, -tt / 2 + .25, u1 - u0, .5, .4, { world: 1, skip: ['bot'] }); /* inner parapet, open where a 馬道 landing comes up */
      for (let i = 0; i < n; i++) { const mx = -L2 + (i + .5) * len / n; b.s({ tex: 'brick' }).box(mx, h + 1.05, tt / 2 - .3, len / n * .6, .9, .5, { world: 1, skip: ['bot'] }); if (sn) ARCH.snowCap(b, mx, h + 1.5, tt / 2 - .3, len / n * .6 - .04, .46, { seed: i }); }
      if (sn) { ARCH.snowCap(b, 0, h + .5, -tt / 2 + .25, len - .1, .36, { seed: 3 }); } }
    b.pop(); L.world.box(cx, y + h / 2, cz, L2, h / 2, (t + tt) / 4, { yaw }); if (o.parapet !== false) { const s = Math.sin(yaw), c = Math.cos(yaw); for (const [off, hh] of [[tt / 2 - .3, 1.5], [-tt / 2 + .25, .5]]) for (const [u0, u1] of off < 0 ? ARCH._runs(-L2, L2, o.innerGap) : [[-L2, L2]]) { const um = (u0 + u1) / 2; L.world.box(cx + c * um + s * off, y + h + hh / 2, cz - s * um + c * off, (u1 - u0) / 2, hh / 2, .22, { yaw }); } }
    return;
  }
  const wt = st === 'brick' ? 'brick' : st === 'mud' ? 'rammed_earth' : 'plaster';
  // o.b0 / o.b1: this end butts into a perpendicular wall whose centreline is at the end point: each layer stops at that wall's face
  const bt = o.bt ?? t, bt0 = o.bt0 ?? bt, bt1 = o.bt1 ?? bt, lay = (y0, y1, d, tex, tile, top) => { const a = -L2 + (o.b0 ? (d - t + bt0) / 2 + .002 : 0), c = L2 - (o.b1 ? (d - t + bt1) / 2 + .002 : 0); /* butt: stop at the crossing wall's face (its thickness o.bt) */ if (c - a < .01) return; ARCH.box(b, (a + c) / 2, y0, 0, c - a, y1 - y0, d, tex, tile, { skip: top ? ['bot', 'px', 'nx'] : ['bot', 'top', 'px', 'nx'] });
    const yq = y1 > h - 1e-6 && o.coping !== false ? y1 - .02 : y1; for (const [sd, ex] of [[-1, a], [1, c]]) if (!(sd < 0 ? o.b0 : o.b1)) { b.s({ tex }); ARCH.quad(b, [ex, y0, -sd * d / 2], [ex, y0, sd * d / 2], [ex, yq, sd * d / 2], [ex, yq, -sd * d / 2], [sd, 0, 0], [d / tile, (yq - y0) / tile]); } };
  if (st === 'board') { // 板牆 board fence: dark posts every ~2.4 m, horizontal plank panels between, a top rail (no coping)
    const a = -L2 + (o.b0 ? bt0 / 2 + .002 : .1), c = L2 - (o.b1 ? bt1 / 2 + .002 : .1), n = Math.max(1, Math.round((c - a) / 2.4)); // free ends: boards stop at the end post's centre
    b.s({ tex: 'plank', col: [.58, .45, .34] }).box((a + c) / 2, (1.0 + h - .08) / 2, 0, c - a, h - .08 - 1.0, .08, /* up to the top rail: no slit of sky (QA wall check) */ { uv: [Math.max(1, Math.round((c - a) / 1.2)), Math.max(1, Math.round(h / .6))] }); // upper boards
    b.s({ tex: 'plank', col: [.52, .4, .3] }).box((a + c) / 2, .55, 0, c - a, .9, .1, { uv: [Math.max(1, Math.round((c - a) / 1.2)), 2] }); // lower boards, thicker
    b.s({ tex: 'dark_wood', col: [.7, .62, .54] }).box((a + c) / 2, h - .04, 0, c - a, .1, .14);
    for (let k = 0; k <= n; k++) { const u = lerp(a, c, k / n); if ((k === 0 && o.b0) || (k === n && o.b1)) continue; b.box(u, h / 2 + .04, 0, .2, h + .08, .2); }
    b.s({ col: [1, 1, 1] }); b.pop(); L.world.box(cx, y + h / 2, cz, L2, h / 2, .1, { yaw }); return; }
  if (st === 'courtyard') { const warm = o.wcol || [1.02, .91, .74]; lay(0, .45, t + .06, 'brick', 1, true); b.s({ col: warm }); lay(.45, h, t, 'plaster', 2, false); b.s({ col: [1, 1, 1] });
    if (!ARCH.lod) { const a = -L2 + (o.b0 ? bt0 / 2 + 1.2 : .9), c = L2 - (o.b1 ? bt1 / 2 + 1.2 : .9), n = Math.max(1, Math.round((c - a) / 4.2)); b.s({ tex: 'dark_wood', col: [.66, .55, .45] }); // timber posts 壁柱 every ~4 m, proud 5 cm
      for (let k = 0; k <= n; k++) { if (c - a < 1) break; b.box(lerp(a, c, k / n), (.45 + h - .05) / 2, 0, .22, h - .05 - .45, t + .06, { skip: ['bot', 'top'] }); } /* proud 3 cm: back-to-back neighbours' posts never touch */ b.s({ col: [1, 1, 1] }); }
    if (!ARCH.lod) for (let u = -L2 + 1.5; u < L2 - 1.5; u += 3.1) { const hh = hash2(Math.round(cx * 3 + u * 7), Math.round(cz * 3), 515); if (hh > .3) continue; const pw = .5 + hh * 2.5, ph = .4 + hh * 1.4, py = .65 + hash2(Math.round(u * 5), 3, 516) * (h - .9 - ph), sd = hh < .15 ? 1 : -1; // patched plaster / mud repairs, proud 2 cm
      b.s({ tex: hh < .1 ? 'rammed_earth' : 'plaster', col: hh < .1 ? [1, 1, 1] : [.94, .84, .68] }).box(u, py + ph / 2, sd * (t / 2 + .018), Math.min(pw, 2.6), ph, .01); } b.s({ col: [1, 1, 1] }); }
  else lay(0, h, t, wt, st === 'mud' ? 2 : 1, o.coping === false);
  if (o.coping !== false) { const ct = t / 2 + .28, yr = h + .46, ye = h + .14, E = L2 + (o.capExt || 0), Ea = o.b0 ? -L2 : -E, Eb = o.b1 ? L2 : E, tx = o.tiles === 'green' ? 'roof_tile_green' : o.tiles === 'thatch' ? 'thatch' : 'roof_tile', cl = Eb - Ea;
    for (const sd of [-1, 1]) { const x0 = sd > 0 ? Ea : Eb, x1 = sd > 0 ? Eb : Ea, A = [x0, ye, sd * ct], B = [x1, ye, sd * ct], C = [x1, yr, 0], D = [x0, yr, 0];
      b.s({ tex: tx }).q4(A, B, C, D, [cl / 2, .3]); b.s({ tex: tx === 'thatch' ? 'thatch' : 'tile_end' }).q4([x0, ye - .07, sd * ct], [x1, ye - .07, sd * ct], B, A, [cl / 2, 1]);
      b.s({ tex: 'rafters' }); ARCH.quad(b, [Ea, ye - .07, sd * ct], [Eb, ye - .07, sd * ct], [Eb, h - .02, sd * t / 2], [Ea, h - .02, sd * t / 2], [0, -1, sd * .3], [cl / 2, .2]); }
    for (const [sd, ex, butt] of [[-1, Ea, o.b0], [1, Eb, o.b1]]) if (!butt) { b.s({ tex: 'plaster' }); ARCH.poly(b, [[ex, ye - .07, -ct], [ex, ye - .07, ct], [ex, yr, 0]], [sd, 0, 0], p => [p[2], -p[1]]); ARCH.poly(b, [[ex, ye - .07, -ct], [ex, ye - .07, ct], [ex, h - .02, t / 2], [ex, h - .02, -t / 2]], [sd, 0, 0], p => [p[2], -p[1]]); }
    if (tx !== 'thatch') { const rl = (o.b0 ? (o.rt0 ?? .1) : .03), rr = (o.b1 ? (o.rt1 ?? .1) : .03); b.s({ tex: 'roof_ridge' }).box((Ea + rl + Eb - rr) / 2, yr + .04, 0, cl - rl - rr, .2, .2, { uv: [Math.max(1, Math.round(len)), 1] }); }
    if (sn) b.s({ tex: 'snow' }).box(0, yr + .15, 0, len + .2, .06, .25);
  }
  b.pop(); L.world.box(cx, y + (h + .5) / 2, cz, L2, (h + .5) / 2, t / 2, { yaw });
};
ARCH.gate = function (L, x, y, z, o = {}) { // small roofed gate (門樓) with board doors
  const F = ARCH.F(x, y, z, o.yaw || 0), w = o.w || 3.2, h = o.h || 3, d = o.d || 1.6;
  const fr = ARCH.frame(L, F, { bw: [w], dw: [d], y0: 0, colH: h, colR: .14, brackets: o.brackets || 'simple', bs: .75, paint: o.paint || 'ochre', cols: o.cols, roof: o.roof || 'gable', tiles: o.tiles, snow: o.snow, chiwen: false, gov: .45, eave: .5, walls: 'white', ceiling: false,
    fill: { front: [o.cls !== undefined ? 'board' : o.open ? 'boardopen' : 'board'], left: ['wall'], right: ['wall'] }, studs: o.studs !== false, doorOpen: o.open, cls: o.cls }); /* side walls: the wall-network piers butt against them, no slot beside the posts */ /* cls: 0 always shut (rich), 4 ordinary courtyard gate (open by day) */
  return { F, top: y, ridge: y + fr.ridge };
};
ARCH.gateTower = function (L, x, y, z, o = {}) { // city / palace gate: brick-faced base with Song trapezoid passages, timber tower above
  const b = L.mb, F = ARCH.F(x, y, z, o.yaw || 0), w = o.w || 30, d = o.d || 16, h = o.h || 9, np = o.passages ?? 3, pw = o.pw || 5, pH = o.ph || 6, bat = o.batter ?? .15, pier = o.pier || 3.2, sn = o.snow;
  const tot = np * pw + (np - 1) * pier, xc = i => -tot / 2 + pw / 2 + i * (pw + pier), xl = i => xc(i) - pw / 2, xr = i => xc(i) + pw / 2, ys = pH * .74, ins = pw * .2;
  b.T(x, y, z, 0, F.yaw, 0);
  const prism = (poly, topTex) => { const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
    b.s({ tex: 'brick', col: [1, 1, 1] }); for (const sz of [-1, 1]) ARCH.poly(b, poly.map(p => [p[0], p[1], sz * d / 2]), [0, 0, sz], p => [p[0], -p[1]], [c[0], c[1], sz * d / 2], true); // fan from the centroid: the pier outlines are concave
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey); if (el < .01) continue; let nx = ey, ny = -ex; const mx = (p[0] + q[0]) / 2 - c[0], my = (p[1] + q[1]) / 2 - c[1]; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const tx = ny > .9 * el ? topTex : ny < -.9 * el ? 'plank' : 'brick'; b.s({ tex: tx, col: tx === 'plank' ? [.55, .45, .38] : [1, 1, 1] }); ARCH.quad(b, [p[0], p[1], d / 2], [q[0], q[1], d / 2], [q[0], q[1], -d / 2], [p[0], p[1], -d / 2], [nx, ny, 0], [Math.max(1, Math.round(el)), Math.max(1, Math.round(d))]); } };
  const top = sn ? 'snow' : 'pave';
  prism([[-w / 2, 0], [xl(0), 0], [xl(0), ys], [xl(0) + ins, pH], [-w / 2 + bat * pH, pH]], top);
  prism([[xr(np - 1), 0], [w / 2, 0], [w / 2 - bat * pH, pH], [xr(np - 1) - ins, pH], [xr(np - 1), ys]], top);
  for (let i = 0; i < np - 1; i++) prism([[xr(i), 0], [xl(i + 1), 0], [xl(i + 1), ys], [xl(i + 1) + ins, pH], [xr(i) - ins, pH], [xr(i), ys]], top);
  prism([[-w / 2 + bat * pH, pH], [w / 2 - bat * pH, pH], [w / 2 - bat * h, h], [-w / 2 + bat * h, h]], top);
  for (let i = 0; i < np; i++) { // timber-lined passage: posts 排叉柱, doors
    b.s({ tex: 'dark_wood', col: [.8, .75, .7] }); for (const sd of [-1, 1]) { const px = xc(i) + sd * (pw / 2 - .14); for (let zz = -d / 2 + .8; zz < d / 2 - .3; zz += 3.2) { b.box(px, (ys - .2) / 2, zz, .24, ys - .2, .26); b.T(px - sd * ins / 2, ys + (pH - ys) / 2, zz, 0, 0, sd * Math.atan2(ins, pH - ys)).box(0, 0, 0, .2, Math.hypot(ins, pH - ys), .22).pop(); } b.box(px, ys - .1, 0, .3, .2, d - .3); }
    const open = o.open ?? true, lw = pw / 2 - .05;
    b.s({ tex: 'plank', col: [.5, .4, .34] }); ARCH.poly(b, [[xl(i), ys, .1], [xr(i), ys, .1], [xr(i) - ins, pH, .1], [xl(i) + ins, pH, .1]], [0, 0, 1], p => [p[0], -p[1]]); ARCH.poly(b, [[xl(i), ys, -.1], [xr(i), ys, -.1], [xr(i) - ins, pH, -.1], [xl(i) + ins, pH, -.1]], [0, 0, -1], p => [p[0], -p[1]]);
    for (const sd of [-1, 1]) { b.s({ tex: 'door_studs', col: [1, 1, 1] }); if (open) b.T(xc(i) + sd * (pw / 2 - .25), 0, -.15 - lw / 2, 0, PI / 2, 0).box(0, ys / 2, 0, lw, ys - .05, .16, { uv: [Math.round(lw / 1.1), Math.round(ys / 1.1)] }).pop(); else b.box(xc(i) + sd * lw / 2, ys / 2, 0, lw, ys - .05, .16, { uv: [Math.round(lw / 1.1), Math.round(ys / 1.1)] }); }
    if (!open) ARCH.solid(L, F, xc(i), 0, 0, pw, ys, .3);
  }
  b.pop();
  ARCH.solid(L, F, (-w / 2 + xl(0)) / 2 + bat * pH / 4, 0, 0, xl(0) + w / 2 - bat * pH / 2, pH, d); ARCH.solid(L, F, (w / 2 + xr(np - 1)) / 2 - bat * pH / 4, 0, 0, w / 2 - xr(np - 1) - bat * pH / 2, pH, d);
  for (let i = 0; i < np - 1; i++) ARCH.solid(L, F, (xr(i) + xl(i + 1)) / 2, 0, 0, pier, pH, d); ARCH.solid(L, F, 0, pH, 0, w - bat * (pH + h), h - pH, d);
  const tw = w - bat * h * 2, tp = (lx, lz) => F.p(lx, h, lz);
  if ((o.parapet || 'railing') === 'railing') ARCH.railing(L, [tp(-tw / 2 + .3, d / 2 - .3), tp(tw / 2 - .3, d / 2 - .3), tp(tw / 2 - .3, -d / 2 + .3), tp(-tw / 2 + .3, -d / 2 + .3)], { closed: true, mat: o.railMat || 'red', snow: sn });
  else { b.T(x, y, z, 0, F.yaw, 0); const n = Math.floor(tw / 2); for (const sz of [-1, 1]) { b.s({ tex: 'brick' }).box(0, h + .3, sz * (d / 2 - .25), tw, .6, .5, { world: 1, skip: ['bot'] }); for (let i = 0; i < n; i++) b.box(-tw / 2 + (i + .5) * tw / n, h + 1.05, sz * (d / 2 - .25), tw / n * .6, .9, .5, { world: 1, skip: ['bot'] }); } b.pop(); }
  const T2 = Object.assign({ platform: .4, pm: 1.0, bays: 5, dbays: 2, colH: 4.2, roof: 'xieshan', snow: sn, glow: o.glow, tablet: o.tablet === undefined ? null : o.tablet, /* no default plaque (宣德門 is Song Kaifeng); city.js passes the Tang gate names gt_* */ tabletW: 1.0, tabletH: 2.1, steps: false, yaw: F.yaw, tiles: o.tiles, paint: o.paint }, o.tower || {});
  const tower = o.tower === false ? null : ARCH.hall(L, ...F.p(0, h, -.3), T2);
  return { F, top: y + h, tower };
};
ARCH.pavilion = function (L, x, y, z, o = {}) { // open pavilion (亭) on an n-gon plan with pyramidal roof
  const b = L.mb, F = ARCH.F(x, y, z, o.yaw || 0), n = o.sides || 4, R = o.r || 2.2, colH = o.colH || 3, ph = o.platform ?? .5, pm = o.pm ?? 1, a0 = PI / 2 - PI / n;
  const paint = o.paint || 'ochre', pTex = { jade: 'paint_jade', ochre: 'paint_ochre' }[paint] || 'dark_wood', bTex = { jade: 'beam_jade', ochre: 'beam_ochre' }[paint] || 'dark_wood', colTex = o.cols || (paint === 'plain' ? 'dark_wood' : 'vermilion');
  const V = (i, r) => [Math.cos(a0 + i * TAU / n) * r, Math.sin(a0 + i * TAU / n) * r], bs = colH * .28, reach = .5 * bs, plT = ph + colH + .1, purT = plT + .58 * bs;
  b.T(x, y, z, 0, F.yaw, 0);
  if (ph > .05) { const Rp = (R + pm) / Math.cos(PI / n); const top = []; for (let i = 0; i < n; i++) { const p = V(i, Rp); top.push([p[0], ph, p[1]]); }
    b.s({ tex: o.snow ? 'snow' : 'pave', col: [1, 1, 1] }); ARCH.poly(b, top, [0, 1, 0], p => [p[0] / 2, p[2] / 2]);
    b.s({ tex: 'stone' }); for (let i = 0; i < n; i++) { const p = top[i], q = top[(i + 1) % n], m = [(p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2]; ARCH.quad(b, [p[0], 0, p[2]], [q[0], 0, q[2]], [q[0], ph, q[2]], [p[0], ph, p[2]], [m[0], 0, m[2]], [Math.round(Math.hypot(q[0] - p[0], q[2] - p[2])), ph]); } }
  for (let i = 0; i < n; i++) { const p = V(i, R), q = V(i + 1, R), m = V(i + .5, R * Math.cos(PI / n)); ARCH.column(b, p[0], ph, p[1], colH, .13, { tex: colTex });
    { const ex = i & 1 ? -.16 : 0, dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz), a = [p[0] - dx / l * ex, p[1] - dz / l * ex], c = [q[0] + dx / l * ex, q[1] + dz / l * ex]; // odd sides butt between the even sides' beam ends
      ARCH.beam(b, a[0], a[1], c[0], c[1], ph + colH - .3, .3, .18, bTex); ARCH.beam(b, a[0], a[1], c[0], c[1], ph + colH, .1, .26, bTex); }
    { const pr = V(i, R + reach), qr = V(i + 1, R + reach), ex = i & 1 ? -.1 : 0, dx = qr[0] - pr[0], dz = qr[1] - pr[1], l = Math.hypot(dx, dz); ARCH.beam(b, pr[0] - dx / l * ex, pr[1] - dz / l * ex, qr[0] + dx / l * ex, qr[1] + dz / l * ex, purT - .16, .16, .14, bTex); }
    b.T(p[0], plT, p[1], 0, Math.atan2(p[0], p[1]), 0); ARCH.bracket(b, bs, { style: 'simple', tex: pTex }); b.pop();
    b.T(m[0], plT, m[1], 0, Math.atan2(m[0], m[1]), 0); ARCH.bracket(b, bs * .8, { style: 'simple', tex: pTex }); b.pop();
    const front = Math.abs(Math.atan2(m[1], m[0]) - PI / 2) < .1;
    if (o.benches !== false && !front) { const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), ln = Math.hypot(q[0] - p[0], q[1] - p[1]) - .3; b.T(m[0] * .97, ph, m[1] * .97, 0, -ang, 0); b.s({ tex: 'plank', col: [.6, .5, .42] }).box(0, .44, 0, ln, .06, .38); b.s({ tex: 'dark_wood' }).box(0, .2, 0, ln, .4, .05); b.T(-ln / 2, 0, .12); ARCH._rail(b, ln, { h: .9, mat: paint === 'plain' ? 'dark' : 'red' }); b.pop(); b.pop();
      const wp = F.p(m[0] * .97, 0, m[1] * .97); L.world.box(wp[0], y + ph + .45, wp[2], ln / 2, .45, .25, { yaw: F.yaw - ang }); }
    const wp = F.p(p[0], 0, p[1]); L.world.cyl(wp[0], wp[2], y + ph, y + ph + colH, .16);
  }
  const Re = (R + reach + colH * .24) / Math.cos(PI / n), H = o.roofH || Re * .78, th = Math.min(.26, .1 + Re * .03), k = .32, f = s => s - k * s * (1 - s), sp = (Re - (R + reach) / Math.cos(PI / n)) / Re;
  { const ce = []; for (let i = 0; i < n; i++) { const p = V(i, R); ce.push([p[0], plT + .3, p[1]]); } b.s({ tex: o.ceiling === 'ceiling' || o.brackets === 'full' ? 'ceiling' : 'ceiling_plain' }); /* pavilions: plain 平闇 unless grand */ ARCH.poly(b, ce, [0, -1, 0], p => [p[0] / 1.4, p[2] / 1.4]); b.s({ tex: 'dark_wood' }); ARCH.poly(b, ce.map(p => [p[0], p[1] + .02, p[2]]), [0, 1, 0]); }
  b.T(0, purT + th - H * f(sp), 0); ARCH.roofPoly(b, { n, R: Re, a0, H, k, thick: th, tiles: o.tiles, snow: o.snow }); b.pop();
  b.pop();
  if (ph > .05) { L.world.cyl(x, z, y, y + ph, R + pm * .9); ARCH._steps(L, F, 0, (R + pm), 0, 1.6, ph, { snow: o.snow }); }
  if (o.glow) { L.light(x, y + ph + 2.2, z, 5, [1.2 * o.glow, .7 * o.glow, .35 * o.glow], { flicker: .1 }); b.T(x, y + ph + colH + .1, z); PROPS.lanternRed(b, .22, { emi: o.glow, cord: .5 }); b.pop(); }
  return { F, top: y + ph };
};
ARCH.lantern = (L, x, y, z, o = {}) => { L.prop(b => o.kind === 'palace' ? PROPS.palaceLantern(b, o.s || 1, o) : PROPS.lanternRed(b, (o.s || 1) * .28, o), x, y, z, { yaw: o.yaw || 0 }); if (o.light !== false) { const g = o.emi ?? .9; L.light(x, y - (o.cord ?? .3) - .3 * (o.s || 1), z, o.r || 5, o.col || [1.5 * g, .6 * g, .3 * g], { flicker: .08 }); } };
ARCH.lanternString = (L, p0, p1, o = {}) => { const n = o.n || Math.max(2, Math.round(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / 1.6)), sag = o.sag ?? .6;
  L.prop(b => PROPS.rope(b, [0, 0, 0], v3sub(p1, p0), sag), ...p0);
  for (let i = 1; i <= n; i++) { const t = i / (n + 1), p = [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t) - sag * 4 * t * (1 - t), lerp(p0[2], p1[2], t)]; ARCH.lantern(L, p[0], p[1], p[2], Object.assign({ cord: .15, light: o.light !== false && i % 2 === 1, s: o.s || .75, r: 4 }, o)); } };

// ======================= PROPS (geometry only; y=0 is the ground unless noted 'hangs') =======================
const PROPS = {
  // --- legacy names (restyled) ---
  crate(b, s = 1, seed = 1) { // Song packing crate, rope-tied, paper seal ('being carried north')
    const r = RNG(seed); b.s({ tex: 'plank', col: [.86, .76, .64] }).box(0, s * .4, 0, s, s * .8, s * .7, { world: .9 });
    b.s({ tex: 'dark_wood', col: [.8, .75, .7] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * s * .485, s * .4, sz * s * .335, s * .07, s * .82, s * .07); b.box(0, s * .02, 0, s * 1.02, s * .04, s * .72);
    b.s({ tex: 'rope', col: [1, 1, 1] }); for (const sx of [-.25, .25]) b.box(sx * s, s * .4, 0, .04, s * .83, s * .73); b.box(0, s * .4, 0, s * 1.03, .04, s * .73);
    b.s({ tex: r() > .5 ? 'talisman' : 'paper', col: [1, 1, 1] }).box(s * (r() - .5) * .3, s * .6, s * .353, s * .16, s * .34, .01);
  },
  barrel(b, h = 1.1, r = .4) { b.s({ tex: 'plank', col: [.9, .85, .8] }).lathe([[0, 0], [r * .85, 0], [r * .85, 0], [r, h * .5], [r * .85, h], [r * .85, h], [0, h]], { seg: 12, uvs: [3, 1] }); b.s({ tex: 'rope', col: [.8, .75, .65] }); for (const y of [.15, .85]) b.T(0, h * y, 0).lathe([[r * .92 + .02, -.04], [r * .94 + .03, -.04], [r * .94 + .03, .04], [r * .92 + .02, .04]], { seg: 12 }).pop(); },
  candle(b, h = .3, r = .04, lit = true) { b.s({ tex: 'wax', col: [1, .9, .86], emi: 0 }).lathe([[0, 0], [r * 1.4, 0], [r, .02], [r, h], [r * .7, h + .01], [0, h + .01]], { seg: 7 }); if (lit) { b.s({ tex: 'glow', col: [1, .7, .3], emi: 1 }).ell(0, h + .05, 0, .02, .05, .02, { seg: 5, ring: 4 }); b.s({ emi: 0 }); } },
  candles(b, n = 5, rad = .3, seed = 1) { const r = RNG(seed); for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * rad; b.T(Math.cos(a) * d, 0, Math.sin(a) * d); PROPS.candle(b, .1 + r() * .35, .025 + r() * .025, r() > .2); b.pop(); } b.s({ tex: 'wax', col: [.95, .9, .8] }).ell(0, 0, 0, rad + .08, .04, rad + .08, { seg: 10, ring: 4, disp: lumpy(.3, 3, seed) }); },
  lantern(b, emi = .8) { // standing paper storm lantern on a wooden base
    b.s({ tex: 'dark_wood', col: [1, 1, 1] }).box(0, .03, 0, .3, .06, .3); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * .12, .26, sz * .12, .03, .44, .03); b.box(0, .5, 0, .3, .04, .3);
    b.s({ tex: 'paper_window', col: [1, .8, .55], emi }).box(0, .27, 0, .22, .38, .22); b.s({ emi: 0, tex: 'iron' }).tube([[-.1, .52, 0], [0, .66, 0], [.1, .52, 0]], { r: .008, seg: 3, cap: false });
  },
  post(b, h = 2, r = .1) { b.s({ tex: 'wood', col: [.8, .75, .7] }).lathe([[0, 0], [r, 0], [r * 1.05, h * .5], [r * .9, h], [r * .5, h + .05], [0, h + .05]], { seg: 7, uvs: [1, h], disp: (a, y) => Math.sin(a * 3 + y * 2) * .01 }); },
  rock(b, s = 1, seed = 1, tex = 'boulder') { b.s({ tex, col: [.85, .85, .85] }).ell(0, s * .25, 0, s * .6, s * .45, s * .5, { seg: 10, ring: 7, disp: lumpy(.35, 1.2, seed), uvs: [2, 1] }); },
  bones(b, n = 6, seed = 2) { const r = RNG(seed); b.s({ tex: 'bone', col: [1, 1, 1] }); for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * .5, l = .2 + r() * .3, ax = r() * TAU; const x = Math.cos(a) * d, z = Math.sin(a) * d; b.tube([[x - Math.cos(ax) * l, .03, z - Math.sin(ax) * l], [x + Math.cos(ax) * l, .03 + r() * .05, z + Math.sin(ax) * l]], { r: t => .025 + Math.abs(t - .5) * .04, seg: 5, steps: 3 }); } },
  ribcage(b, s = 1) { b.s({ tex: 'bone', col: [.95, .92, .85] }); b.tube([[0, .1 * s, -.6 * s], [0, .15 * s, 0], [0, .1 * s, .6 * s]], { r: .05 * s, seg: 6 }); for (let i = -2; i <= 2; i++) for (const sd of [-1, 1]) b.tube([[0, .15 * s, i * .22 * s], [sd * .3 * s, .45 * s, i * .22 * s], [sd * .45 * s, .2 * s, i * .2 * s], [sd * .35 * s, .02 * s, i * .18 * s]], { r: .025 * s, seg: 5, steps: 3 }); },
  banner(b, w = 1, h = 2.4, tex = 'cloth') { b.s({ tex: 'wood', col: [.7, .7, .7] }).tube([[-w * .6, h, 0], [w * .6, h, 0]], { r: .03, seg: 5 }); b.s({ tex, col: [1, 1, 1] }); b.grid(6, 4, (i, j) => { const t = i / 6, u = j / 4; return [(u - .5) * w * (1 - t * .1), h - t * h * .9, Math.sin(t * 3 + u * 2) * .06 * t, u, t]; }, false); b.grid(6, 4, (i, j) => { const t = i / 6, u = j / 4; return [(u - .5) * w * (1 - t * .1), h - t * h * .9, Math.sin(t * 3 + u * 2) * .06 * t - .02, 1 - u, t]; }, false, null, true); },
  chainV(b, len, w = .25) { b.s({ tex: 'chain', col: [1, 1, 1] }); const i = b.nv; b.cross(0, -len, 0, w, len, 2); for (let k = i; k < b.nv; k++) b.U[k * 2 + 1] *= len / w / 4; },
  table(b, w = 1.4, d = .7, h = .8) { // slender Song table: lacquered top, aprons, spandrels
    b.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, h - .03, 0, w, .05, d); b.s({ tex: 'dark_wood' }).box(0, h - .1, d / 2 - .04, w - .1, .08, .03).box(0, h - .1, -d / 2 + .04, w - .1, .08, .03);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - .06), (h - .05) / 2, sz * (d / 2 - .06), .05, h - .05, .05); for (const sx of [-1, 1]) b.box(sx * (w / 2 - .06), .15, 0, .04, .04, d - .12);
  },
  bookpile(b, n = 4, seed = 3) { const r = RNG(seed); let y = 0; for (let i = 0; i < n; i++) { const h = .025 + r() * .03; b.T(r() * .05, 0, r() * .05, 0, r() * .5 - .25, 0); b.s({ tex: 'cloth', col: [.3, .38, .6].map(c => c * (.7 + r() * .4)) }).box(0, y + h / 2, 0, .26, h, .18, { faces: { px: 'paper', nx: 'paper', pz: 'paper' } }); b.s({ tex: 'paper' }).box(-.06, y + h + .002, -.03, .05, .004, .12); b.pop(); y += h; } },
  skullPile(b, s = 1, seed = 4) { const r = RNG(seed); b.s({ tex: 'bone', col: [.95, .9, .82] }); for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * .35 * s, y = r() * .2 * s; b.ell(Math.cos(a) * d, y + .1 * s, Math.sin(a) * d, .1 * s, .09 * s, .12 * s, { seg: 8, ring: 6, disp: lumpy(.2, 4, i) }); } },
  shrineCairn(b) { b.s({ tex: 'stone', col: [.8, .8, .8] }); const r = RNG(9); for (let i = 0; i < 5; i++) b.ell(0, .2 + i * .32, 0, .45 - i * .06, .2, .4 - i * .05, { seg: 9, ring: 6, disp: lumpy(.25, 2, i + r()) }); },
  // --- lanterns ---
  lanternRed(b, r = .28, o = {}) { // round red paper lantern; HANGS: origin = hook, cord o.cord, body below
    const c = o.cord ?? .3, emi = o.emi ?? .9, cy = -c - r * 1.02;
    if (c > 0) b.s({ tex: 'rope', col: [.5, .2, .15], emi: 0 }).tube([[0, 0, 0], [0, -c - .03, 0]], { r: .008, seg: 3, cap: false });
    b.s({ tex: 'lacquer_black', col: [1, 1, 1], emi: 0 }).T(0, cy, 0).lathe([[r * .34, r * .9], [r * .34, r * 1.04], [0, r * 1.04]], { seg: 6 }).lathe([[0, -r * 1.06], [r * .3, -r * 1.06], [r * .3, -r * .92]], { seg: 6 });
    b.s({ tex: 'lantern', col: o.col || [1, 1, 1], emi }).lathe([[0, -r * .95], [r * .5, -r * .9], [r * .86, -r * .6], [r, -r * .12], [r * .97, r * .3], [r * .82, r * .66], [r * .45, r * .92], [0, r * .95]], { seg: 8, uvs: [1, 1], disp: (a) => -Math.abs(Math.sin(a * 4)) * r * .035 });
    b.s({ tex: 'cloth', col: [1.3, .35, .25], emi: emi * .2 }).lathe([[0, -r * 2.05], [r * .14, -r * 2.1], [r * .05, -r * 1.1], [0, -r * 1.06]], { seg: 6 }); b.pop(); b.s({ emi: 0, col: [1, 1, 1] });
  },
  palaceLantern(b, s = 1, o = {}) { // 宮燈: hexagonal frame, glowing silk panels, crown with upturned hooks, tassels. HANGS from origin
    const emi = o.emi ?? .9, c = o.cord ?? .25, y0 = -c - .62 * s;
    if (c > 0) b.s({ tex: 'rope', col: [.6, .25, .15] }).tube([[0, 0, 0], [0, -c, 0]], { r: .01, seg: 3, cap: false });
    b.T(0, y0, 0); b.s({ tex: 'silk', col: o.col || [1.2, .95, .7], emi }).lathe([[0, -.28 * s], [.24 * s, -.28 * s], [.27 * s, .25 * s], [0, .25 * s]], { seg: 6, a0: PI / 6 });
    b.s({ tex: 'lacquer_red', emi: 0 }); for (let i = 0; i < 6; i++) { const a = PI / 6 + i * TAU / 6; b.T(Math.cos(a) * .26 * s, 0, Math.sin(a) * .26 * s).box(0, 0, 0, .035 * s, .6 * s, .035 * s).pop(); }
    b.lathe([[0, .24 * s], [.3 * s, .24 * s], [.32 * s, .3 * s], [.16 * s, .44 * s], [.06 * s, .5 * s], [0, .52 * s]], { seg: 6, a0: PI / 6 }).lathe([[0, -.36 * s], [.12 * s, -.36 * s], [.3 * s, -.28 * s], [.3 * s, -.25 * s], [0, -.25 * s]], { seg: 6, a0: PI / 6 });
    b.s({ tex: 'gold' }); for (let i = 0; i < 6; i++) { const a = PI / 6 + i * TAU / 6, ca = Math.cos(a), sa = Math.sin(a); b.tube([[ca * .3 * s, .29 * s, sa * .3 * s], [ca * .42 * s, .34 * s, sa * .42 * s], [ca * .45 * s, .44 * s, sa * .45 * s]], { r: .015 * s, seg: 3, steps: 2 }); }
    b.s({ tex: 'cloth', col: [1.2, .3, .2] }); for (let i = 0; i < 6; i++) { const a = PI / 6 + i * TAU / 6; b.T(Math.cos(a) * .3 * s, -.3 * s, Math.sin(a) * .3 * s).lathe([[0, -.27 * s], [.035 * s, -.28 * s], [.02 * s, -.02 * s], [0, 0]], { seg: 4 }).pop(); }
    b.pop(); b.s({ emi: 0, col: [1, 1, 1] });
  },
  rope(b, p0, p1, sag = .3, r = .015) { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t) - sag * 4 * t * (1 - t), lerp(p0[2], p1[2], t)]); } b.s({ tex: 'rope', col: [.8, .7, .55], emi: 0 }).tube(pts, { r, seg: 3, steps: 1, cap: false }); },
  lanternString(b, p0, p1, o = {}) { const n = o.n || 5, sag = o.sag ?? .5; PROPS.rope(b, p0, p1, sag); for (let i = 1; i <= n; i++) { const t = i / (n + 1); b.T(lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t) - sag * 4 * t * (1 - t), lerp(p0[2], p1[2], t)); if (o.kind === 'palace') PROPS.palaceLantern(b, .6, { cord: .1, emi: o.emi }); else PROPS.lanternRed(b, o.r || .2, { cord: .12, emi: o.emi }); b.pop(); } },
  // --- containers & goods ---
  wineJar(b, s = 1, seal = true) { // big-bellied stoneware jar, dark glaze; clay seal with red paper label
    b.s({ tex: 'glaze', col: [1, 1, 1] }).lathe([[0, 0], [.17 * s, 0], [.2 * s, .03 * s], [.3 * s, .26 * s], [.31 * s, .4 * s], [.24 * s, .58 * s], [.12 * s, .68 * s], [.13 * s, .72 * s], [0, .72 * s]], { seg: 8, uvs: [2, 1] });
    if (seal) { b.s({ tex: 'mud', col: [1.1, 1, .9] }).ell(0, .73 * s, 0, .14 * s, .06 * s, .14 * s, { seg: 5, ring: 3, disp: lumpy(.15, 6, 2) }); b.s({ tex: 'lacquer_red' }).T(0, .64 * s, 0, 0, .4, 0).box(0, 0, .135 * s, .09 * s, .1 * s, .01).pop(); }
  },
  jar(b, s = 1) { PROPS.wineJar(b, s, false); },
  bowl(b, r = .07, tex = 'glaze') { b.s({ tex, col: [1, 1, 1] }).lathe([[0, 0], [r * .45, 0], [r * .45, .01], [r, r * .62], [r * .9, r * .62], [0, r * .12]], { seg: 9 }); },
  bundle(b, s = 1, seed = 1) { const r = RNG(seed); b.s({ tex: r() > .5 ? 'cloth' : 'burlap', col: [.5 + r() * .5, .45 + r() * .3, .4 + r() * .3] }).ell(0, .2 * s, 0, .32 * s, .2 * s, .24 * s, { seg: 8, ring: 5, disp: lumpy(.18, 3, seed) }); b.s({ tex: 'rope', col: [1, 1, 1] }).T(0, .2 * s, 0, 0, 0, PI / 2).lathe([[.205 * s, -.03], [.215 * s, 0], [.205 * s, .03]], { seg: 8 }).pop(); b.s({ tex: 'cloth' }).ell(0, .41 * s, 0, .06 * s, .05 * s, .06 * s, { seg: 5, ring: 3 }); },
  sack(b, s = 1, seed = 1) { b.s({ tex: 'burlap', col: [1, 1, 1] }).lathe([[0, 0], [.22 * s, .02 * s], [.27 * s, .2 * s], [.22 * s, .45 * s], [.08 * s, .56 * s], [.1 * s, .66 * s], [0, .64 * s]], { seg: 8, disp: lumpy(.03, 9, seed) }); b.s({ tex: 'rope' }).T(0, .56 * s, 0).lathe([[.085 * s, -.02], [.095 * s, 0], [.085 * s, .02]], { seg: 6 }).pop(); },
  basket(b, r = .28, h = .32) { b.s({ tex: 'straw', col: [.9, .82, .7] }).lathe([[0, 0], [r * .8, 0], [r * .8, 0], [r, h], [r * .92, h], [0, h * .1]], { seg: 10, uvs: [3, 1] }); },
  carryPole(b) { // shoulder pole 扁擔 resting across two loaded baskets
    for (const sx of [-1, 1]) { b.T(sx * .7, 0, 0); PROPS.basket(b, .26, .3); b.T(0, .1, 0); PROPS.bundle(b, .7, sx + 3); b.pop(); b.s({ tex: 'rope', col: [.9, .8, .6] }); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; b.tube([[Math.cos(a) * .25, .3, Math.sin(a) * .25], [0, .78, 0]], { r: .008, seg: 3, cap: false }); } b.pop(); }
    b.s({ tex: 'bamboo', col: [.9, .75, .5] }).T(0, .8, 0, 0, 0, PI / 2).box(0, 0, 0, .025, 1.9, .07).pop();
  },
  wheel(b, r = .7, w = .12, spokes = 10) { // in the y-z plane, axle along x, centre at origin
    b.s({ tex: 'dark_wood', col: [.85, .8, .75] }).T(0, 0, 0, 0, 0, PI / 2).lathe([[r - .09, -w / 2], [r, -w / 2], [r, -w / 2], [r, w / 2], [r, w / 2], [r - .09, w / 2], [r - .09, w / 2], [r - .09, -w / 2]], { seg: 12 }).lathe([[0, -w * .9], [.12, -w * .9], [.12, w * .9], [0, w * .9]], { seg: 7 }).pop();
    for (let i = 0; i < spokes; i++) b.T(0, 0, 0, i / spokes * TAU, 0, 0).box(0, r / 2, 0, .04, r - .1, .05).pop();
  },
  cart(b, o = {}) { // 太平車: big box-bed cart on two tall wheels, shafts resting forward (+z); no ox
    b.s({ tex: 'plank', col: [.7, .6, .5] }).box(0, 1.05, 0, 1.7, .1, 3.4, { world: 1 });
    for (const sx of [-1, 1]) { b.box(sx * .82, 1.42, 0, .07, .64, 3.4, { world: 1 }); b.s({ tex: 'dark_wood' }); for (let i = 0; i < 6; i++) b.box(sx * .86, 1.35, -1.6 + i * .64, .06, .82, .08); b.s({ tex: 'plank' }); }
    b.box(0, 1.35, -1.68, 1.64, .5, .06, { world: 1 }); b.box(0, 1.25, 1.68, 1.64, .3, .06, { world: 1 });
    for (const sx of [-1, 1]) { b.T(sx * 1.0, .74, -.2); PROPS.wheel(b, .74, .13, 9); b.pop(); } b.s({ tex: 'iron' }).T(0, .74, -.2, 0, 0, PI / 2).lathe([[.04, -1.1], [.04, 1.1]], { seg: 5 }).pop();
    b.s({ tex: 'dark_wood', col: [.75, .7, .65] }); for (const sx of [-1, 1]) b.tube([[sx * .62, 1.0, 1.4], [sx * .5, .6, 3.0], [sx * .4, .1, 4.3]], { r: .055, seg: 5, steps: 2 }); b.box(0, .34, 3.75, 1.0, .06, .06);
    if (o.hood !== false) { b.s({ tex: 'mat', col: [.85, .75, .6] }); for (const fl of [false, true]) b.grid(6, 3, (i, j) => { const a = i / 6 * PI, rr2 = fl ? .86 : .88; return [Math.cos(a) * rr2, 1.72 + Math.sin(a) * .55 * (rr2 / .88), -1.55 + j * .55, i / 3, j / 2]; }, false, null, !fl); }
    if (o.load !== false) { b.T(-.35, 1.1, .7); PROPS.crate(b, .65, 2); b.pop(); b.T(.35, 1.1, .9, 0, .3, 0); PROPS.sack(b, .9, 3); b.pop(); b.T(.3, 1.1, .2); PROPS.bundle(b, .9, 4); b.pop(); }
  },
  oxCart(b, o) { PROPS.cart(b, o); },
  wheelbarrow(b) { // Song single-wheel barrow: big central wheel, frame with two handles, loads either side
    b.T(0, .48, .2); PROPS.wheel(b, .46, .08, 8); b.pop();
    b.s({ tex: 'dark_wood', col: [.8, .72, .64] }); for (const sx of [-1, 1]) b.tube([[sx * .16, .55, .9], [sx * .24, .6, 0], [sx * .3, .62, -1.1]], { r: .035, seg: 4, steps: 1 }); for (const z of [.6, -.1, -.6]) b.box(0, .6, z, .66, .04, .05);
    b.s({ tex: 'plank', col: [.7, .6, .5] }).box(-.42, .62, -.15, .3, .04, .8).box(.42, .62, -.15, .3, .04, .8); for (const sx of [-1, 1]) b.tube([[sx * .25, .62, -.95], [sx * .24, .05, -.85]], { r: .03, seg: 4, cap: false });
    b.s({ tex: 'mat', col: [.8, .7, .55] }).T(0, .98, .2).lathe([[.0, .02], [.24, .02], [.3, -.3], [.27, -.3]], { seg: 8, a0: 0, a1: PI }).pop();
    b.T(-.42, .64, -.15); PROPS.sack(b, .7, 5); b.pop(); b.T(.42, .64, -.2); PROPS.bundle(b, .7, 6); b.pop();
  },
  umbrella(b, open = true, col = [1, 1, 1]) { // oiled-paper umbrella; open: handle on the ground, canopy at ~1.8 m
    if (!open) { b.s({ tex: 'bamboo', col: [.8, .7, .5] }).cyl(0, 0, 0, .014, 1.05, { seg: 4 }); b.s({ tex: 'oilpaper', col }).T(0, .25, 0).lathe([[0, 0], [.05, .05], [.07, .5], [.03, .78], [0, .82]], { seg: 8, uvs: [2, 1], disp: a => Math.abs(Math.sin(a * 4)) * .012 }).pop(); return; }
    b.s({ tex: 'bamboo', col: [.8, .7, .5] }).cyl(0, 0, 0, .014, 1.92, { seg: 4 });
    b.s({ tex: 'oilpaper', col }).T(0, 1.55, 0).lathe([[0, .35], [.2, .32], [.58, .15], [.8, -.01], [.82, 0], [.6, .17], [.2, .35], [0, .38]], { seg: 16, uvs: [2, 1] }).pop();
    b.s({ tex: 'bamboo', col: [.6, .5, .35] }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.tube([[0, 1.3, 0], [Math.cos(a) * .42, 1.62, Math.sin(a) * .42]], { r: .006, seg: 3, cap: false }); }
  },
  brazier(b, emi = .9) { // bronze brazier on three legs, glowing coals
    b.s({ tex: 'bronze', col: [.7, .62, .55] }).T(0, .32, 0).lathe([[0, 0], [.14, 0], [.34, .16], [.42, .3], [.38, .3], [.3, .18], [0, .1]], { seg: 12 }).pop();
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; b.tube([[Math.cos(a) * .2, .34, Math.sin(a) * .2], [Math.cos(a) * .32, .15, Math.sin(a) * .32], [Math.cos(a) * .3, 0, Math.sin(a) * .3]], { r: .03, seg: 4, steps: 2 }); }
    b.s({ tex: 'embers', col: [1, 1, 1], emi }).ell(0, .55, 0, .3, .07, .3, { seg: 9, ring: 4, disp: lumpy(.25, 5, 3) }); b.s({ emi: emi * .7 }); for (let i = 0; i < 5; i++) { const a = i * 2.4; b.ell(Math.cos(a) * .15, .6, Math.sin(a) * .15, .06, .05, .07, { seg: 5, ring: 3, disp: lumpy(.3, 9, i) }); } b.s({ emi: 0 });
  },
  incenseBurner(b, s = 1, emi = 1) { // bronze tripod censer (鼎爐) with ash and three burning sticks
    b.s({ tex: 'patina', col: [1, 1, 1] }).T(0, .14 * s, 0).lathe([[0, 0], [.14 * s, 0], [.2 * s, .06 * s], [.21 * s, .14 * s], [.19 * s, .2 * s], [.22 * s, .22 * s], [.2 * s, .23 * s], [.16 * s, .16 * s], [0, .17 * s]], { seg: 12 }).pop();
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + .5; b.tube([[Math.cos(a) * .13 * s, .17 * s, Math.sin(a) * .13 * s], [Math.cos(a) * .15 * s, 0, Math.sin(a) * .15 * s]], { r: [.03 * s, .02 * s], seg: 4, steps: 1 }); }
    for (const sx of [-1, 1]) b.box(sx * .17 * s, .44 * s, 0, .03 * s, .1 * s, .1 * s);
    b.s({ tex: 'salt', col: [.75, .72, .68] }).ell(0, .31 * s, 0, .17 * s, .02 * s, .17 * s, { seg: 8, ring: 3 });
    for (let i = 0; i < 3; i++) { const x = (i - 1) * .04 * s, l = .26 * s; b.s({ tex: 'lacquer_red', emi: 0 }).tube([[x, .3 * s, 0], [x + .01, .3 * s + l, .005]], { r: .005, seg: 3, cap: false }); b.s({ tex: 'glow', col: [1, .45, .15], emi }).ell(x + .01, .3 * s + l, .005, .008, .012, .008, { seg: 4, ring: 3 }); } b.s({ emi: 0 });
  },
  oilLamp(b, stand = true, emi = 1) { // ceramic oil-lamp dish (celadon) with wick flame, optionally on a tall wooden stand 燈檠
    const y = stand ? 1.15 : 0; if (stand) { b.s({ tex: 'dark_wood', col: [1, 1, 1] }).T(0, 0, 0).lathe([[0, 0], [.18, 0], [.18, .04], [.05, .08], [.03, .1]], { seg: 8 }).pop().cyl(0, .08, 0, .025, y - .02, { seg: 6 }).T(0, y - .04, 0).lathe([[0, 0], [.1, 0], [.1, .03], [0, .03]], { seg: 8 }).pop(); }
    b.T(0, y, 0); PROPS.bowl(b, .07, 'celadon'); b.s({ tex: 'glaze', col: [.6, .5, .3] }).ell(0, .035, 0, .055, .006, .055, { seg: 7, ring: 2 }); if (emi > 0) b.s({ tex: 'glow', col: [1, .7, .3], emi }).ell(.04, .055, 0, .012, .03, .012, { seg: 4, ring: 3 }); b.pop(); b.s({ emi: 0 }); // emi 0: an unlit lamp (no flame)
  },
  cashString(b, len = .8, n = 1) { // strings of copper cash (貫), draped
    for (let k = 0; k < n; k++) { const ox = k * .07; b.s({ tex: 'cash_str', col: [1, 1, 1] }).tube([[ox, .03, -len / 2], [ox + .03, .05, -len / 6], [ox - .02, .04, len / 6], [ox, .03, len / 2]], { r: .03, seg: 5, steps: 3, uvs: [1, len * 8] }); b.s({ tex: 'rope', col: [.8, .3, .2] }).tube([[ox, .03, len / 2], [ox, .02, len / 2 + .08]], { r: .008, seg: 3 }); }
  },
  cashPile(b, r = .25, seed = 1) { b.s({ tex: 'cash', col: [1, 1, 1] }).ell(0, 0, 0, r, r * .35, r, { seg: 9, ring: 4, disp: lumpy(.2, 6, seed) }); },
  strawMat(b, w = 1.8, d = 1, rolled = false) { if (rolled) { b.s({ tex: 'mat', col: [.85, .75, .6] }).T(0, .14, 0, 0, 0, PI / 2).lathe([[0, -w / 2], [.14, -w / 2], [.14, -w / 2], [.14, w / 2], [.14, w / 2], [0, w / 2]], { seg: 8, uvs: [1, 2] }).pop(); b.s({ tex: 'rope' }).T(0, .14, 0, 0, 0, PI / 2).lathe([[.145, -.3], [.15, -.26], [.145, -.22]], { seg: 8 }).lathe([[.145, .22], [.15, .26], [.145, .3]], { seg: 8 }).pop(); return; } b.s({ tex: 'mat', col: [.85, .75, .6] }).box(0, .012, 0, w, .02, d, { skip: ['bot'], uv: [Math.round(w), Math.round(d)] }); },
  snowdrift(b, w = 2, h = .4, d = 1.2, seed = 1) { b.s({ tex: 'snow', col: [1, 1, 1] }).ell(0, 0, 0, w / 2, h, d / 2, { seg: 10, ring: 5, disp: lumpy(.25, 1.2 / Math.max(w, d), seed), uvs: [Math.max(1, Math.round(w / 2)), 1] }); },
  stele(b, tex = 'stele_text', s = 1) { // stele on a tortoise (bixi) base
    b.s({ tex: 'stone', col: [.82, .82, .8] }).box(0, .1 * s, 0, 1.4 * s, .2 * s, 2.0 * s, { skip: ['bot'] }); b.ell(0, .45 * s, 0, .6 * s, .32 * s, .9 * s, { seg: 10, ring: 6, disp: lumpy(.05, 3, 1) }); b.ell(0, .52 * s, .95 * s, .2 * s, .18 * s, .26 * s, { seg: 7, ring: 5 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.ell(sx * .55 * s, .25 * s, sz * .6 * s, .16 * s, .14 * s, .2 * s, { seg: 6, ring: 4 });
    b.box(0, 1.85 * s, 0, .95 * s, 2.4 * s, .3 * s, { faces: { pz: tex, nz: tex }, uv: [1, 1] });
    { const r = .475 * s, t = .16 * s, y0 = 3.05 * s - .01 * s, n = 10, top = []; for (let k = 0; k <= n; k++) { const a = k / n * PI; top.push([Math.cos(a) * r, y0 + Math.sin(a) * r]); } // the rounded head 碑首: a closed half-disc as wide as the shaft (it overhung by 2.5 cm with an open underside: see-through), its faces 1 cm proud of the shaft's
      for (const sz of [-1, 1]) ARCH.poly(b, top.map(([x, y]) => [x, y, sz * t]), [0, 0, sz], p => [p[0] / s + .5, -p[1] / s], [0, y0, sz * t]);
      for (let k = 0; k < n; k++) { const [x0, y1] = top[k], [x1, y2] = top[k + 1], nx = (x0 + x1) / 2, ny = (y1 + y2) / 2 - y0, l = Math.hypot(nx, ny) || 1; ARCH.quad(b, [x0, y1, t], [x1, y2, t], [x1, y2, -t], [x0, y1, -t], [nx / l, ny / l, 0], [.1, .3]); } }
  },
  well(b) { // octagonal stone curb + windlass 轆轤
    b.s({ tex: 'stone', col: [.85, .85, .83] }).lathe([[.45, 0], [.62, 0], [.62, 0], [.62, .62], [.62, .62], [.45, .62], [.45, .62], [.45, -.4]], { seg: 8, a0: PI / 8, uvs: [3, 1] });
    b.s({ tex: 'water', col: [.5, .6, .7] }).T(0, -.35, 0).lathe([[0, 0], [.46, 0]].reverse(), { seg: 8 }).pop();
    b.s({ tex: 'snow' }).T(0, .62, 0).lathe([[.61, .02], [.54, .06], [.46, .02]], { seg: 8, a0: PI / 8 }).pop();
    b.s({ tex: 'dark_wood', col: [.8, .75, .7] }); for (const sx of [-1, 1]) b.box(sx * .7, .7, 0, .12, 1.4, .14); b.T(0, 1.2, 0, 0, 0, PI / 2).lathe([[.09, -.75], [.09, .75]], { seg: 6 }).pop();
    b.s({ tex: 'rope' }).T(0, 1.2, 0, 0, 0, PI / 2).lathe([[.1, -.3], [.13, -.25], [.13, .25], [.1, .3]], { seg: 6 }).pop(); b.s({ tex: 'iron' }).tube([[.78, 1.2, 0], [.86, 1.2, 0], [.86, .95, 0], [.95, .95, 0]], { r: .02, seg: 3, steps: 1 });
    b.s({ tex: 'rope' }).tube([[0, 1.1, .12], [0, .7, .12]], { r: .01, seg: 3, cap: false }); b.s({ tex: 'plank', col: [.7, .6, .5] }).T(0, .45, .12).lathe([[0, 0], [.12, 0], [.14, .24], [0, .24]], { seg: 7 }).pop();
  },
  drum(b, s = 1) { // watch drum on a timber stand
    b.s({ tex: 'dark_wood', col: [.8, .72, .64] }); for (const sx of [-1, 1]) { b.box(sx * .55 * s, .75 * s, 0, .1 * s, 1.5 * s, .1 * s); b.tube([[sx * .55 * s, .05, -.4 * s], [sx * .55 * s, .9 * s, 0], [sx * .55 * s, .05, .4 * s]], { r: .04 * s, seg: 4, steps: 1 }); } b.box(0, .3 * s, 0, 1.16 * s, .08 * s, .08 * s);
    b.T(0, 1.05 * s, 0, PI / 2, 0, 0); b.s({ tex: 'lacquer_red' }).lathe([[0, -.3 * s], [.4 * s, -.3 * s], [.4 * s, -.3 * s], [.48 * s, 0], [.4 * s, .3 * s], [.4 * s, .3 * s], [0, .3 * s]], { seg: 12 });
    b.s({ tex: 'felt', col: [1.5, 1.35, 1.1] }).lathe([[0, -.305 * s], [.39 * s, -.305 * s]], { seg: 12 }).lathe([[.39 * s, .305 * s], [0, .305 * s]], { seg: 12 }); b.s({ tex: 'gold' }); for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; b.ell(Math.cos(a) * .4 * s, -.27 * s, Math.sin(a) * .4 * s, .02 * s, .02 * s, .02 * s, { seg: 4, ring: 2 }).ell(Math.cos(a) * .4 * s, .27 * s, Math.sin(a) * .4 * s, .02 * s, .02 * s, .02 * s, { seg: 4, ring: 2 }); } b.pop();
    b.s({ tex: 'wood' }).tube([[.3 * s, .3 * s + .05, .2], [.6 * s, .32 * s + .05, .5]], { r: .02 * s, seg: 4 });
  },
  board(b, w, h, tex, cell, o = {}) { // flat placard facing +z, bottom at y=0 (cell = [u0,v0,du,dv] from glyphCell)
    b.s({ tex: o.frame || 'dark_wood', col: [1, 1, 1] }).box(0, h / 2, -.025, w + .06, h + .06, .04); b.s({ tex }); const [u0, v0, du, dv] = cell || [0, 0, 1, 1], i = b.nv; b.v(-w / 2, 0, 0, 0, 0, 1, u0, v0 + dv); b.v(w / 2, 0, 0, 0, 0, 1, u0 + du, v0 + dv); b.v(w / 2, h, 0, 0, 0, 1, u0 + du, v0); b.v(-w / 2, h, 0, 0, 0, 1, u0, v0); b.quad(i, i + 1, i + 2, i + 3);
  },
  signboard(b, tex = 'sign_zhengdian', o = {}) { // standing vertical shop sign 立牌 with a little tiled hood; faces +z
    const w = o.w || .5, h = o.h || 1.7, y0 = o.y0 ?? .55; b.s({ tex: 'dark_wood', col: [.8, .72, .64] }); for (const sx of [-1, 1]) b.box(sx * (w / 2 + .05), (y0 + h + .25) / 2, 0, .07, y0 + h + .25, .07); b.box(0, y0 - .03, 0, w + .2, .06, .1).box(0, y0 + h + .03, 0, w + .2, .06, .1);
    b.box(0, .03, 0, w + .5, .06, .45);
    for (const sz of [-1, 1]) { b.s({ tex: sz > 0 ? tex : 'lacquer_black', col: [1, 1, 1] }); const i = b.nv, z = sz * .025, xs = sz > 0 ? [-w / 2, w / 2] : [w / 2, -w / 2]; b.v(xs[0], y0, z, 0, 0, sz, 0, 1); b.v(xs[1], y0, z, 0, 0, sz, 1, 1); b.v(xs[1], y0 + h, z, 0, 0, sz, 1, 0); b.v(xs[0], y0 + h, z, 0, 0, sz, 0, 0); b.quad(i, i + 1, i + 2, i + 3); }
    b.s({ tex: 'dark_wood' }).box(0, y0 + h / 2, 0, w, h, .03);
    for (const sz of [-1, 1]) { b.s({ tex: 'roof_tile' }).T(0, y0 + h + .38, sz * .13, -sz * .5, 0, 0).box(0, 0, 0, w + .45, .05, .32, { uv: [2, 1] }).pop(); if (o.snow ?? true) b.s({ tex: 'snow' }).T(0, y0 + h + .41, sz * .12, -sz * .5, 0, 0).box(0, 0, 0, w + .35, .03, .26).pop(); } b.s({ tex: 'roof_ridge' }).box(0, y0 + h + .5, 0, w + .5, .08, .08);
  },
  wineFlag(b, tex = 'sign_jiu', o = {}) { // tall pole with a cloth wine flag 酒旗 hanging from a crossbar
    const h = o.h || 6.5, fw = o.fw || .75, fh = o.fh || 1.9, top = h - .3; b.s({ tex: 'bamboo', col: [.85, .72, .5] }).cyl(0, 0, 0, .06, h, { seg: 6, uvs: [1, h * 2] }).tube([[0, top, 0], [fw + .35, top + .05, 0]], { r: .03, seg: 4 });
    b.s({ tex: 'lacquer_red' }).T(0, h, 0).lathe([[0, 0], [.08, 0], [.03, .2], [0, .24]], { seg: 6 }).pop();
    b.s({ tex, col: [1, 1, 1] }); for (const fl of [false, true]) b.grid(6, 3, (i, j) => { const t = i / 6, u = j / 3, sw = Math.sin(t * 2.4 + u * 1.2) * .1 * t; return [.2 + u * fw, top - .025 - t * fh, sw + (fl ? -.006 : .006), fl ? 1 - u : u, t]; }, false, null, fl); /* hangs from the crossbar (QA float check) */
    b.s({ tex: 'silk', col: [1.2, .4, .3] }); for (const fl of [false, true]) b.grid(4, 1, (i, j) => [.2 + fw * .5 + (j - .5) * .12 + Math.sin(i) * .03, top - .025 - fh - i / 4 * .6, (fl ? -.004 : .004) + .05 * i / 4, j, i / 4], false, null, fl);
  },
  awning(b, w = 2.8, d = 1.9, h = 2.55) { // mat awning on two poles, sloping out from the facade (local -z side attaches)
    b.s({ tex: 'bamboo', col: [.8, .68, .5] }); for (const sx of [-1, 1]) { b.cyl(sx * w / 2, 0, d, .045, h - .12, { seg: 5 }); b.tube([[sx * w / 2, h - .15, d], [sx * w / 2, h + .3, 0]], { r: .03, seg: 4, cap: false }); }
    b.tube([[-w / 2 - .1, h - .12, d], [w / 2 + .1, h - .12, d]], { r: .035, seg: 4 });
    b.s({ tex: 'mat', col: [.85, .75, .6] }); for (const fl of [false, true]) b.grid(3, 4, (i, j) => { const t = i / 3, u = j / 4; return [(u - .5) * (w + .3), h + .32 - t * .45 - Math.sin(t * PI) * .06 + (fl ? -.01 : 0), t * (d + .15), u * 3, t * 2]; }, false, null, !fl);
  },
  bench(b, w = 1.4) { b.s({ tex: 'plank', col: [.7, .6, .5] }).box(0, .44, 0, w, .06, .32, { uv: [2, 1] }); b.s({ tex: 'dark_wood' }); for (const sx of [-1, 1]) { b.box(sx * (w / 2 - .12), .21, .1, .05, .42, .05).box(sx * (w / 2 - .12), .21, -.1, .05, .42, .05).box(sx * (w / 2 - .12), .12, 0, .04, .04, .24); } },
  stool(b) { b.s({ tex: 'dark_wood', col: [1, 1, 1] }).box(0, .42, 0, .34, .05, .34); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * .14, .2, sz * .14, .04, .4, .04); },
  teaStall(b) { // tea stall: table, stools, stove with kettle, Jian bowls, cloth canopy on four poles
    b.T(0, 0, 0); PROPS.table(b, 1.3, .7, .78); b.pop(); for (const [x, z] of [[-.9, .1], [.9, -.1], [0, .8]]) { b.T(x, 0, z); PROPS.stool(b); b.pop(); }
    for (let i = 0; i < 4; i++) { b.T(-.4 + i * .22, .8, (i & 1) * .1); PROPS.bowl(b, .05, 'glaze'); b.pop(); }
    b.s({ tex: 'mud', col: [.9, .85, .8] }).T(-1.3, 0, -.6).lathe([[0, 0], [.26, 0], [.24, .55], [.16, .6], [0, .6]], { seg: 8 }).pop(); b.s({ tex: 'embers', emi: .6 }).box(-1.3, .2, -.37, .16, .12, .02); b.s({ emi: 0, tex: 'iron' }).T(-1.3, .6, -.6).lathe([[0, 0], [.13, 0], [.15, .1], [.07, .2], [.04, .24], [0, .24]], { seg: 8 }).pop().tube([[-1.17, .7, -.6], [-1.07, .78, -.6]], { r: .012, seg: 3 });
    b.s({ tex: 'bamboo', col: [.8, .7, .5] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(sx * 1.4, 0, sz * 1.1, .035, 2.3, { seg: 4 });
    b.s({ tex: 'cloth', col: [.55, .62, .78] }); for (const fl of [false, true]) b.grid(4, 2, (i, j) => [(j / 2 - .5) * 3.2, 2.28 + .45 * (1 - Math.abs(i / 2 - 1)) + (fl ? -.01 : 0), (i / 4 - .5) * 2.6, j, i], false, null, !fl);
  },
  scaffold(b, w = 3, h = 4, d = 1.2, seed = 1) { // bamboo scaffolding bay: standards, ledgers, braces, lashings, a plank
    const r = RNG(seed), P = (p, q, rd = .035) => b.s({ tex: 'bamboo', col: [.75 + r() * .15, .65, .45] }).tube([p, q], { r: rd, seg: 4, steps: 1, cap: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P([sx * w / 2, 0, sz * d / 2], [sx * w / 2 + (r() - .5) * .1, h, sz * d / 2]);
    for (let y = 1; y < h; y += 1.3) for (const sz of [-1, 1]) { P([-w / 2 - .2, y, sz * d / 2], [w / 2 + .2, y + (r() - .5) * .08, sz * d / 2], .03); for (const sx of [-1, 1]) P([sx * w / 2, y - .1, -d / 2 - .15], [sx * w / 2, y - .1, d / 2 + .15], .025); b.s({ tex: 'rope', col: [1, 1, 1] }); for (const sx of [-1, 1]) b.ell(sx * w / 2, y, sz * d / 2, .05, .07, .05, { seg: 4, ring: 3 }); }
    P([-w / 2, 0, d / 2], [w / 2, h * .8, d / 2], .025); b.s({ tex: 'plank', col: [.7, .6, .5] }).box(0, 2.34, 0, w * .9, .05, .35);
  },
  // --- trees (place with foliage:true: they use alpha cutout cards) ---
  pine(b, h = 7, seed = 1, o = {}) { // Song-painting pine: leaning scaly trunk, flat layered needle pads, snow on top
    const r = RNG(seed), la = r() * TAU, lean = .1 + r() * .25, sn = o.snow !== false, T = t => [Math.cos(la) * lean * h * t * t + Math.sin(t * 5 + seed) * .15 * t, t * h, Math.sin(la) * lean * h * t * t + Math.cos(t * 4 + seed) * .12 * t];
    b.s({ tex: 'bark', col: [1, 1, 1] }).tube([0, .25, .5, .75, 1].map(T), { r: t => (.08 + (1 - t) * .2) * h / 7, seg: 6, steps: 2, cap: [false, true], capRows: 1, uvs: [1, 3] });
    const n = 5 + (r() * 3 | 0);
    for (let k = 0; k <= n; k++) { const t = k === n ? 1 : .38 + .55 * k / n, a = k * 2.4 + r(), len = k === n ? 0 : (1.15 - t) * h * .3 + .3 + r() * .4, p0 = T(t), tip = [p0[0] + Math.cos(a) * len, p0[1] - .15 + r() * .45, p0[2] + Math.sin(a) * len];
      if (len > 0) b.s({ tex: 'bark' }).tube([p0, [lerp(p0[0], tip[0], .5), lerp(p0[1], tip[1], .5) + .2, lerp(p0[2], tip[2], .5)], tip], { r: [.08 * h / 7, .05, .03], seg: 4, steps: 2, cap: false });
      const rx0 = (k === n ? .85 : len * .4 + .5) * (o.s || 1);
      for (let c = 0; c < (k === n ? 1 : 2); c++) { const rx = rx0 * (c ? .62 : 1), ry = (.3 + r() * .12) * (c ? .8 : 1), rz = rx * (.72 + r() * .2), ca = a + (c ? 1.6 + r() : 0), cx = tip[0] + (c ? Math.cos(ca) * rx0 * .7 : 0), cyy = tip[1] + .05 - (c ? .18 : 0), cz = tip[2] + (c ? Math.sin(ca) * rx0 * .7 : 0);
        b.s({ tex: 'pine_n', col: [1, 1, 1] }).ell(cx, cyy, cz, rx, ry, rz, { seg: c ? 6 : 7, ring: c ? 3 : 4, disp: lumpy(.3, 1.5, seed * 7 + k + c * 13) });
        if (sn) b.s({ tex: 'snow' }).ell(cx, cyy + ry * 1.02, cz, rx * .78, ry * .3, rz * .78, { seg: 6, ring: 3, disp: lumpy(.2, 1.5, seed * 3 + k + c) });
        if (!c) b.s({ tex: 'pine', col: [1, 1, 1] }).cross(cx, cyy - ry * 1.2, cz, rx * 2.3, ry * 2.6, 2, a); }
    }
  },
  bareTree(b, h = 6, seed = 1, o = {}) { // winter deciduous tree: forking branches, twig cards
    const r = RNG(seed), tex = o.tex || 'bark_dark';
    const br = (p, dir, len, rad, d) => { const q = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len], m = [lerp(p[0], q[0], .5) + (r() - .5) * len * .15, lerp(p[1], q[1], .5), lerp(p[2], q[2], .5) + (r() - .5) * len * .15];
      b.s({ tex, col: [1, 1, 1] }).tube([p, m, q], { r: [rad, rad * .8, rad * .6], seg: d > 1 ? 5 : 3, steps: 1, cap: false });
      if (d === 0) { b.s({ tex: 'branches', col: [.9, .9, .9] }).cross(q[0], q[1] - len * .3, q[2], len * 1.4, len * 1.3, 2, r() * PI); if (o.snow) b.s({ tex: 'snow' }).ell(m[0], m[1] + rad, m[2], len * .2, rad * .7, rad * 1.5, { seg: 4, ring: 2 }); return; }
      const nk = d === 3 ? 4 : 2 + (r() < .5); for (let i = 0; i < nk; i++) { const a = r() * TAU, up = .45 + r() * .5, nd = v3norm([dir[0] * .6 + Math.cos(a) * (1 - up), up, dir[2] * .6 + Math.sin(a) * (1 - up)]); br(q, nd, len * (.55 + r() * .2), rad * .55, d - 1); } };
    br([0, 0, 0], [0, 1, 0], h * .4, .18 * h / 6, 3);
  },
  plum(b, h = 2.6, seed = 1, white = false) { // old plum (梅): gnarled angular trunk, blossom cards
    const r = RNG(seed), tex = white ? 'plum_w' : 'plum';
    const br = (p, dir, len, rad, d) => { let q = p; const pts = [p]; for (let s = 0; s < 3; s++) { const dd = v3norm([dir[0] + (r() - .5) * .9, dir[1] + (r() - .3) * .4, dir[2] + (r() - .5) * .9]); q = [q[0] + dd[0] * len / 3, q[1] + dd[1] * len / 3, q[2] + dd[2] * len / 3]; pts.push(q); }
      b.s({ tex: 'bark_dark', col: [.8, .75, .72] }).tube(pts, { r: [rad, rad * .85, rad * .7, rad * .55], seg: 5, steps: 1, cap: false });
      b.s({ tex, col: [1, 1, 1] }).cross(q[0], q[1] - len * .35, q[2], len * 1.2, len * 1.1, 2, r() * PI);
      if (d > 0) for (let i = 0; i < 2 + (d > 1); i++) { const a = r() * TAU; br(pts[2 + (i & 1)], v3norm([Math.cos(a), .5 + r() * .6, Math.sin(a)]), len * .7, rad * .6, d - 1); } };
    br([0, 0, 0], [.2, 1, 0], h * .45, .12, 2);
  },
  taihu(b, h = 2.6, seed = 1) { // Taihu rock: tall, thin, contorted, pierced pale limestone (stand it on a small base if you like)
    const r = RNG(seed); let x = 0, z = 0, y = 0; const n = 4 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), w = h * (.2 + .14 * Math.sin(t * PI * 1.3 + r()) + r() * .08), hy = h / n * (.75 + r() * .4); x += (r() - .5) * w * .8; z += (r() - .5) * w * .5;
      b.s({ tex: 'taihu', col: [1, 1, 1] }).T(x, y + hy * .5, z, (r() - .5) * .6, r() * 3, (r() - .5) * .7).ell(0, 0, 0, w, hy * .75, w * .55, { seg: 8, ring: 5, disp: lumpy(.38, 2.2 / h, seed * 11 + i), uvs: [2, 1] }).pop(); y += hy * .78; }
  },
  willow(b, h = 5, seed = 1) { // bare winter willow: thick short trunk, upright boughs, long drooping strands
    const r = RNG(seed), th = h * .45; b.s({ tex: 'bark_dark', col: [.85, .8, .7] }).tube([[0, 0, 0], [.1, th * .5, .05], [.25, th, .1]], { r: [.28, .22, .2], seg: 7, steps: 2, cap: false });
    const top = [.25, th, .1]; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * .5, l = h * (.3 + r() * .15), tip = [top[0] + Math.cos(a) * l * .7, th + l * .8, top[2] + Math.sin(a) * l * .7]; b.s({ tex: 'bark_dark' }).tube([top, [lerp(top[0], tip[0], .4), th + l * .55, lerp(top[2], tip[2], .4)], tip], { r: [.11, .07, .03], seg: 4, steps: 2, cap: false });
      b.s({ tex: 'willow', col: [1, 1, 1] }); const hang = tip[1] - .6 - r() * .6; b.cross(tip[0], .6 + r() * .5, tip[2], 1.8, hang, 2, a); b.cross((tip[0] + top[0]) / 2, 1.2, (tip[2] + top[2]) / 2, 1.4, th + l * .5 - 1.4, 1, a + 1.2); }
  },
  bamboo(b, n = 9, seed = 1, h = 5) { // bamboo clump: culms + leaf cards
    const r = RNG(seed); for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * .5, x = Math.cos(a) * d, z = Math.sin(a) * d, hh = h * (.7 + r() * .4), lx = Math.cos(a) * (.2 + r() * .5), lz = Math.sin(a) * (.2 + r() * .5), rad = .025 + r() * .02;
      const P = t => [x + lx * t * t, hh * t, z + lz * t * t]; b.s({ tex: 'bamboo', col: [.9 + r() * .2, .95, .85] }).tube([0, .5, 1].map(P), { r: [rad, rad * .9, rad * .6], seg: 4, steps: 2, cap: false, uvs: [1, hh * 2] });
      b.s({ tex: 'bamboo_leaf', col: [1, 1, 1] }); for (let k = 0; k < 3; k++) { const t = .55 + k * .2, p = P(t); b.cross(p[0], p[1] - .5, p[2], 1.1 + r() * .4, 1.1, 2, r() * PI); } }
  },
  // --- the checkpoint: roadside Earth God shrine 土地廟 (meshOnce('shrine', PROPS.shrine)); faces +z ---
  shrine(b) {
    ARCH.box(b, 0, 0, 0, 1.15, .55, .85, 'brick', .7, { skip: ['bot'] }); b.s({ tex: 'stone', col: [.9, .9, .88] }).box(0, .58, 0, 1.22, .06, .92, { world: 1 });
    ARCH.box(b, 0, .61, -.3, 1.0, .62, .14, 'brick', .7, { skip: ['bot'] }); for (const sx of [-1, 1]) ARCH.box(b, sx * .44, .61, .02, .12, .62, .5, 'brick', .7, { skip: ['bot'] });
    b.s({ tex: 'lacquer_red', col: [.9, .9, .9] }).box(0, .9, -.215, .74, .55, .01); b.s({ tex: 'stone' }).box(0, 1.28, .04, 1.04, .1, .64, { world: 1 });
    b.T(0, 1.33, .04); ARCH.roof(b, { type: 'xieshan', X: .82, Z: .6, H: .44, thick: .07, up: .1, flare: .05, ridgeH: .12, ridgeW: .1, snow: true, nv: 3, s1: .5, chiwen: false }); b.pop();
    // the clay Earth God (seated old man, black cap, white beard, staff, ingot)
    b.s({ tex: 'cloth', col: [1.35, 1.05, .6] }).ell(0, .79, -.12, .16, .19, .12, { seg: 8, ring: 5 }).ell(0, .67, -.02, .15, .06, .11, { seg: 7, ring: 4 }); b.s({ tex: 'cloth', col: [1.3, .5, .35] }).ell(0, .86, -.06, .1, .06, .07, { seg: 6, ring: 3 });
    b.s({ tex: 'skin', col: [1.05, .85, .68] }).ell(0, 1.03, -.12, .07, .08, .07, { seg: 7, ring: 5 }).ell(-.1, .78, .0, .03, .03, .03, { seg: 4, ring: 3 }).ell(.1, .8, .0, .03, .03, .03, { seg: 4, ring: 3 });
    b.s({ tex: 'white', col: [.9, .88, .84] }).ell(0, .965, -.07, .045, .07, .03, { seg: 6, ring: 4 }).ell(-.035, 1.02, -.055, .012, .025, .01, { seg: 4, ring: 2 }).ell(.035, 1.02, -.055, .012, .025, .01, { seg: 4, ring: 2 });
    b.s({ tex: 'lacquer_black' }).ell(0, 1.1, -.12, .07, .045, .07, { seg: 6, ring: 3 }).box(0, 1.09, -.15, .26, .02, .02); b.s({ tex: 'wood', col: [.7, .55, .4] }).tube([[.11, .62, .0], [.14, 1.1, -.03]], { r: .01, seg: 3 }); b.s({ tex: 'gold' }).ell(-.1, .74, .02, .035, .02, .025, { seg: 5, ring: 3 });
    // couplets (上聯 on the right), plaque, offerings, incense
    b.s({ tex: 'couplet', col: [1, 1, 1] }); ARCH.card(b, .385, .64, .292, .11, .5, [.5, 0, .5, 1], false); ARCH.card(b, -.495, .64, .292, .11, .5, [0, 0, .5, 1], false);
    b.s({ tex: 'plaque_tudi' }); ARCH.card(b, -.24, 1.24, .38, .48, .09, [0, 0, 1, 1], false);
    b.T(0, .61, .36); PROPS.bowl(b, .1, 'patina'); b.s({ tex: 'salt', col: [.7, .68, .64] }).ell(0, .055, 0, .085, .012, .085, { seg: 7, ring: 2 });
    for (let i = 0; i < 3; i++) { const x = (i - 1) * .03; b.s({ tex: 'lacquer_red', emi: 0 }).tube([[x, .05, 0], [x * 1.4, .27, .004 * i]], { r: .004, seg: 3, cap: false }); b.s({ tex: 'glow', col: [1, .4, .12], emi: 1 }).ell(x * 1.4, .275, .004 * i, .007, .01, .007, { seg: 4, ring: 3 }); } b.s({ emi: 0 }); b.pop();
    for (const sx of [-1, 1]) { b.T(sx * .28, .61, .33); b.s({ tex: 'celadon' }).T(0, 0, 0).lathe([[0, 0], [.1, .01], [.11, .025], [0, .02]], { seg: 8 }).pop(); if (sx < 0) { b.s({ tex: 'white', col: [.95, .92, .86] }); for (let k = 0; k < 3; k++) b.ell(Math.cos(k * 2.1) * .035, .045 + (k === 2) * .04, Math.sin(k * 2.1) * .035, .035, .03, .035, { seg: 6, ring: 3 }); } else { b.s({ tex: 'lacquer_red', col: [1.4, .7, .3] }); for (let k = 0; k < 3; k++) b.ell(Math.cos(k * 2.1) * .035, .05 + (k === 2) * .045, Math.sin(k * 2.1) * .035, .032, .03, .032, { seg: 6, ring: 3 }); } b.pop(); }
    b.T(.42, .61, .18); PROPS.bowl(b, .035, 'celadon'); b.pop();
    ARCH.snowCap(b, -.52, .61, 0, .1, .8, { h: .05, seed: 2 }); ARCH.snowCap(b, .52, .61, 0, .1, .8, { h: .05, seed: 3 });
    b.T(0, 0, -.5); PROPS.snowdrift(b, 1.4, .22, .5, 4); b.pop(); b.T(-.62, 0, .05); PROPS.snowdrift(b, .4, .18, .9, 5); b.pop();
  },
};
// ======================= gibs (arrays keyed by material) =======================
function gibMeshes() {
  if (MESH.gibs) return MESH.gibs; const G = { flesh: [], bone: [], bronze: [], ceramic: [], stone: [], wood: [], paper: [], straw: [] };
  const shard = (b, r, h, t, a, tex, inner) => { // curved shell piece (outer surface tex, inner tex2), closed
    b.s({ tex }).lathe([[r, -h], [r, h]], { seg: 3, a0: 0, a1: a }); b.s({ tex: inner }).lathe([[r - t, h], [r - t, -h]], { seg: 3, a0: 0, a1: a });
    b.lathe([[r - t, h], [r, h]].reverse(), { seg: 3, a0: 0, a1: a }).lathe([[r - t, -h], [r, -h]], { seg: 3, a0: 0, a1: a });
    for (const [ang, sg] of [[0, -1], [a, 1]]) { const c = Math.cos(ang), s = Math.sin(ang); ARCH.quad(b, [c * (r - t), -h, s * (r - t)], [c * r, -h, s * r], [c * r, h, s * r], [c * (r - t), h, s * (r - t)], [-s * sg, 0, c * sg]); } };
  for (let i = 0; i < 4; i++) {
    let b = new MB(); b.s({ tex: 'flesh', col: [1, 1, 1] }).ell(0, 0, 0, .12 + i * .03, .09 + i * .02, .1 + i * .02, { seg: 7, ring: 5, disp: lumpy(.45, 4, i * 3) }); G.flesh.push(b.upload());
    b = new MB(); b.s({ tex: 'bone', col: [1, 1, 1] }).tube([[-.12 - i * .03, 0, 0], [0, .02, 0], [.12 + i * .03, 0, .02]], { r: t => .025 + Math.abs(t - .5) * .05, seg: 5 }); G.bone.push(b.upload());
    b = new MB(); b.T(-.18 - i * .03, 0, 0); shard(b, .2 + i * .03, .06 + i * .015, .025, .9 + i * .2, i & 1 ? 'patina' : 'bronze', 'bronze'); b.pop(); G.bronze.push(b.upload());
    b = new MB(); b.T(-.14 - i * .02, 0, 0); shard(b, .15 + i * .02, .05 + i * .012, .012, .8 + i * .25, i === 3 ? 'glaze' : 'celadon', 'celadon'); b.pop(); G.ceramic.push(b.upload());
    b = new MB(); b.s({ tex: i & 1 ? 'taihu' : 'stone', col: [1, 1, 1] }).ell(0, 0, 0, .1 + i * .03, .08 + i * .02, .09 + i * .02, { seg: 5, ring: 3, disp: lumpy(.3, 5, i * 7) }); G.stone.push(b.upload());
    b = new MB(); b.s({ tex: i & 1 ? 'plank' : 'wood', col: [1, 1, 1] }).T(0, 0, 0, 0, 0, (i - 1.5) * .1).box(0, 0, 0, .26 + i * .03, .025, .05 + (i & 1) * .03).pop(); b.box(.15 + i * .015, .0, 0, .05, .02, .02); G.wood.push(b.upload());
    b = new MB(); if (i < 2) b.s({ tex: i ? 'talisman' : 'paper', col: [1, 1, 1] }).ell(0, 0, 0, .08 + i * .02, .06, .07, { seg: 6, ring: 4, disp: lumpy(.45, 9, i * 5) }); else b.s({ tex: i === 2 ? 'talisman' : 'paper' }).T(0, 0, 0, .2, 0, .15).box(0, 0, 0, .16, .004, .1 + i * .02).pop(); G.paper.push(b.upload());
    b = new MB(); b.s({ tex: 'straw', col: [1, 1, 1] }); for (let k = 0; k < 4; k++) { const a = k * 1.7 + i; b.tube([[0, 0, 0], [Math.cos(a) * .14, .04 + k * .01, Math.sin(a) * .14]], { r: [.012, .004], seg: 3, steps: 1 }); } b.ell(0, 0, 0, .04, .03, .04, { seg: 4, ring: 3 }); G.straw.push(b.upload());
  }
  G.metal = G.machine = G.bronze; G.wax = G.flesh;
  return MESH.gibs = G;
}

/* ======================= TANG (815) — overrides and additions =======================
 Tang vs Song: bolder brackets, flatter roofs (ARCH.pitch), modest corner lift, 鴟尾 (fin-like, curling inward, no fish mouth) instead of
 鴟吻, timber in matte red ochre (土朱) with white plaster, lintels painted 七朱八白, 直欞窗 windows, 板門 doors. */
// 鴟尾: base on the ridge end, faces +x (toward the ridge centre). A thick tapering blade rising from the ridge and curling inward,
// with a fin edge (鰭) on the outer side and a band along the inner edge.
ARCH.chiwei = (b, s = 1) => {
  b.s({ tex: 'roof_ridge', col: [.8, .82, .86] });
  b.box(.12 * s, .06 * s, 0, .46 * s, .12 * s, .28 * s);
  // spine from the base, up and curling toward +x
  const sp = [[0, .02], [-.04, .3], [-.02, .58], [.06, .8], [.2, .94], [.33, .97]].map(p => [p[0] * s, p[1] * s]), n = sp.length;
  const dep = [.42, .36, .28, .2, .12, .05], th = [.13, .12, .1, .085, .065, .04]; // blade depth (toward +x) and half-thickness
  const ring = [], N = [];
  for (let i = 0; i < n; i++) { const a = sp[Math.max(0, i - 1)], c = sp[Math.min(n - 1, i + 1)], tx = c[0] - a[0], ty = c[1] - a[1], l = Math.hypot(tx, ty); N.push([ty / l, -tx / l]); } // normal points to +x side
  for (let i = 0; i < n; i++) { const p = sp[i], q = N[i], d = dep[i] * s, t = th[i] * s;
    ring.push([[p[0] - q[0] * .02 * s, p[1] - q[1] * .02 * s], [p[0] + q[0] * d, p[1] + q[1] * d], t]); }
  // faces: outer edge, inner edge, two sides (z = ±t)
  const V = (x, y, z, nx, ny, nz, u, v) => b.v(x, y, z, nx, ny, nz, u, v);
  for (let i = 0; i < n - 1; i++) {
    const A = ring[i], B = ring[i + 1];
    for (const sd of [-1, 1]) { const k = b.nv; V(A[0][0], A[0][1], sd * A[2], 0, 0, sd, 0, i / n); V(A[1][0], A[1][1], sd * A[2] * .7, 0, 0, sd, 1, i / n); V(B[1][0], B[1][1], sd * B[2] * .7, 0, 0, sd, 1, (i + 1) / n); V(B[0][0], B[0][1], sd * B[2], 0, 0, sd, 0, (i + 1) / n); if (sd > 0) b.quad(k, k + 1, k + 2, k + 3); else b.quad(k, k + 3, k + 2, k + 1); }
    for (const [e, sg] of [[0, -1], [1, 1]]) { const q0 = N[i], q1 = N[i + 1], k = b.nv, t0 = A[2] * (e ? .7 : 1), t1 = B[2] * (e ? .7 : 1);
      V(A[e][0], A[e][1], -t0, q0[0] * sg, q0[1] * sg, 0, 0, i / n); V(A[e][0], A[e][1], t0, q0[0] * sg, q0[1] * sg, 0, 1, i / n); V(B[e][0], B[e][1], t1, q1[0] * sg, q1[1] * sg, 0, 1, (i + 1) / n); V(B[e][0], B[e][1], -t1, q1[0] * sg, q1[1] * sg, 0, 0, (i + 1) / n);
      if (sg > 0) b.quad(k, k + 1, k + 2, k + 3); else b.quad(k, k + 3, k + 2, k + 1); }
  }
  { const T = ring[n - 1], k = b.nv; V(T[0][0], T[0][1], -T[2], .3, .9, 0, 0, 1); V(T[1][0], T[1][1], -T[2] * .7, .3, .9, 0, 1, 1); V(T[1][0], T[1][1], T[2] * .7, .3, .9, 0, 1, 0); V(T[0][0], T[0][1], T[2], .3, .9, 0, 0, 0); b.quad(k, k + 3, k + 2, k + 1); }
  // fins along the outer (back) edge: small notched teeth
  for (let i = 1; i < n - 1; i++) { const p = ring[i][0], q = N[i]; b.T(p[0] - q[0] * .03 * s, p[1] - q[1] * .03 * s, 0, 0, 0, Math.atan2(q[1], q[0])).box(0, 0, 0, .1 * s, .06 * s, ring[i][2] * 1.1).pop(); }
  return b;
};
// ---------- Tang textures ----------
// leaf masses (cutout; tile over lumpy ellipsoids): small leaves with gaps, light from the top-left
function leafTex(name, o) {
  return texPaint(name, (P, rnd) => {
    const n = o.n || 900;
    for (let i = 0; i < n; i++) {
      const x = rnd() * TS, y = rnd() * TS, a = o.ang !== undefined ? o.ang + (rnd() - .5) * .8 : rnd() * TAU, L = o.len * (.7 + rnd() * .6), W = o.wid * (.7 + rnd() * .5), k = .7 + rnd() * .5, sh = rnd();
      const c = mixc(o.c0, o.c1, sh), ca = Math.cos(a), sa = Math.sin(a);
      for (let j = -L; j <= L; j += .5) { const ww = W * Math.sqrt(Math.max(0, 1 - (j / L) * (j / L))); for (let q = -ww; q <= ww; q += .5) { const lit = .78 + (-ca * j - sa * q) / L * .12 + (q / (ww + .01)) * .06; P.px(x + ca * j - sa * q, y + sa * j + ca * q, [c[0] * k * lit, c[1] * k * lit, c[2] * k * lit, 255]); } }
    }
    if (o.fruit) for (let i = 0; i < o.fruit.n; i++) { const x = rnd() * TS, y = rnd() * TS, c = o.fruit.cols[(rnd() * o.fruit.cols.length) | 0]; P.disc(x, y, o.fruit.r * (.8 + rnd() * .4), (dx, dy) => [c[0] * (1.05 - (dx + dy) * .18), c[1] * (1.05 - (dx + dy) * .22), c[2] * (1.05 - (dx + dy) * .22), 255]); } // fruit among the leaves (far crowns: 玄都觀 peaches)
  }, { bg: () => [0, 0, 0, 0] });
}
leafTex('leaf_huai', { n: 1200, len: 3.2, wid: 1.6, c0: [78, 112, 54], c1: [140, 168, 80] });
leafTex('leaf_elm', { n: 1100, len: 3.0, wid: 1.9, c0: [88, 118, 58], c1: [150, 170, 84] });
leafTex('leaf_willow', { n: 1400, len: 5, wid: .9, c0: [108, 140, 66], c1: [170, 186, 96], ang: PI / 2 });
leafTex('leaf_jujube', { n: 1000, len: 2.6, wid: 1.5, c0: [70, 104, 48], c1: [124, 156, 70] });
texPaint('leaf_willow_strand', (P, rnd) => { for (let s = 0; s < 7; s++) { let x = 10 + s * 17 + rnd() * 6; for (let y = 0; y < TS; y += 2) { x += (rnd() - .5) * .9; const c = mixc([84, 116, 52], [150, 170, 88], rnd()); if (y > 4 || rnd() < .5) { P.px(x, y, c); if (rnd() < .6) P.px(x + (rnd() < .5 ? 1 : -1), y + 1, c); } } } }, { bg: () => [0, 0, 0, 0], wrap: false });
// loess street: packed yellow-brown earth, cart ruts, hoof dust, a few pebbles
TEX.add('loess', (x, y) => { const n = qN(x, y, 8, 5, 401), m = qN(x, y, 32, 3, 402), w = qW(x, y, 20, 403); let c = mixP([170, 140, 102], [140, 112, 80], n); c = mixP(c, [120, 98, 72], sstep(.6, .78, m) * .4); let k = .88 + (n - .5) * .2 + grainy(x, y, 404) * .12; if (w[0] < .1) k *= 1.12; if (hash2(x >> 1, y >> 1, 405) > .992) c = [110, 104, 96]; return shP(c, k); });
TEX.add('loess_rut', (x, y) => { const u = x / TS, rut = Math.min(Math.abs(u - .28), Math.abs(u - .72)), wob = qN(x, y, 8, 3, 406), n = qN(x, y, 8, 5, 407); let c = mixP([168, 138, 100], [138, 110, 80], n); const r = sstep(.06, .015, rut + (wob - .5) * .03); c = mixP(c, [112, 92, 68], r * .55); return shP(c, .88 + (n - .5) * .2 + grainy(x, y, 408) * .12); });
// courtyard: swept earth, darker and smoother; garden: grass and weeds on earth
TEX.add('yard', (x, y) => { const n = qN(x, y, 8, 5, 409), m = qN(x, y, 4, 3, 410); let c = mixP([150, 124, 92], [124, 102, 78], n); c = mixP(c, [100, 104, 64], sstep(.68, .82, m) * .5); return shP(c, .9 + grainy(x, y, 411) * .1); });
TEX.add('grass_summer', (x, y) => { const n = qN(x, y, 8, 4, 412), b = hash2(x, Math.floor(y / 3), 413), d = qN(x, y, 4, 3, 414); let c = mixP([96, 104, 62], [124, 126, 78], n); c = mixP(c, [146, 124, 92], sstep(.5, .75, d) * .8); return shP(c, .72 + b * .3); }); // dusty summer grass over loess
TEX.add('field_crop', (x, y) => { const row = (x % 16) < 9, n = qN(x, y, 8, 4, 415), b = hash2(x, y >> 1, 416); return row ? shP(mixP([96, 124, 50], [140, 150, 66], n), .7 + b * .4) : shP(mixP([132, 106, 76], [112, 90, 66], n), .85 + b * .2); });
// distant facade: white plaster between red-ochre posts, a dark door and barred windows (for LOD massing boxes; u spans ~3.5 m)
TEX.add('facade_lod', (x, y) => { const n = qN(x, y, 8, 3, 420), post = x < 9 || x > 118, beam = y < 10 || (y > 104 && y < 112), win = x > 30 && x < 98 && y > 30 && y < 62, bar = win && ((x - 30) % 8) < 3, base = y > 112;
  if (post || beam) return shP([150, 62, 40], .8 + n * .3); if (base) return shP([120, 118, 112], .8 + n * .3); if (win) return bar ? [86, 58, 40] : [40, 32, 28]; return shP([214, 208, 194], .9 + (n - .5) * .15); });
// 槐/elm bark: dark grey-brown, long vertical furrows, lighter ridges (u around the trunk, v up)
TEX.add('bark_tang', (x, y) => { const f = qN(x * 3, y * .25, 32, 3, 430), n = qN(x, y, 8, 4, 431), r = Math.abs(f - .5); let c = mixP([96, 86, 74], [70, 64, 58], n); if (r < .06) c = shP(c, .55); else if (r > .3) c = mixP(c, [128, 120, 106], .35); return shP(c, .9 + grainy(x, y, 432) * .1); });

/* ======================= TANG BUILDING KIT v2 (architecture engineer, 2026-11-06 morning) =======================
 Correct-by-construction infill: every wall bay is built from abutting (never overlapping) panels; timber members are proud of the
 plaster by 2.5 cm (sill 地栿, jambs 立頰, heads 額, window frames) and crossing members differ in size, so no coplanar faces.
 Bay kinds: wall window door opendoor board boardopen portal shutter counter rail (+ o.blind / o.curtain on open doors).
 Details: brick dado 裙肩 under white plaster, 直欞/破子欞 window bars over paper, 板門 leaves with battens, 門簪 pegs, 門砧 stones,
 thresholds, ring pulls 鋪首, transoms, shop boards 排門, counters, rolled bamboo blinds 簾; plaster repairs and stains.
 NOTE for nature.js (yard clutter): COMP now sets lot.gx (gate x, local), lot.zMain (main building z, local) and lot.foot
 (array of local rects [x0, z0, x1, z1] occupied by buildings/walls inside the lot) before calling NATURE.yard. */
TEX.add('blind', (x, y) => { // bamboo blind 竹簾: thin horizontal splints, cotton ties every ~0.5 m, cloth border at the bottom
  const n = qN(x, y, 8, 3, 501), sp = (y % 3) === 0, tie = (x % 40) < 2;
  let c = mixP([176, 150, 96], [140, 116, 70], n); if (sp) c = shP(c, .62); if (tie) c = [90, 70, 50];
  return shP(c, .9 + grainy(x, y, 502) * .12); });
TEX.add('mudbrick', (x, y) => { // sun-dried adobe 土坯 in mud mortar, washed by rain at the base
  const k = bricks(x, y, 22, 11, .5), n = qN(x, y, 8, 4, 503), g = qN(x, y, 4, 3, 504); let c = mixP([170, 142, 104], [146, 120, 88], n);
  if (k.e < 1.2) c = mixP(c, [124, 104, 80], .6); c = shP(c, .9 + hash2(k.col, k.row, 505) * .14 - sstep(.6, .9, g) * .1); return shP(c, .93 + grainy(x, y, 506) * .1); });
TEX.add('thatch', (x, y) => { // thatch 茅: combed straw, darker weathered streaks running down, mossy patches
  const s = qN(x * 4, y * .25, 32, 3, 507), n = qN(x, y, 8, 4, 508), m = qN(x, y, 4, 3, 509);
  let c = mixP([170, 142, 86], [118, 96, 60], s * .7 + n * .3); c = mixP(c, [96, 92, 62], sstep(.62, .8, m) * .6); if ((x & 1) && hash2(x, y >> 2, 510) > .75) c = shP(c, .75);
  return shP(c, .8 + (s - .5) * .35); });
ARCH._bay = function (b, len, hb, kind, o) {
  const T = o.T || .3, TM = T + .05, h2 = len / 2, walls = o.walls || 'white', plain = o.paint === 'plain', sd0 = (o.seed || 1) * 7.13;
  const wt = { white: 'plaster', brick: 'brick', plank: 'plank', mud: 'rammed_earth', adobe: 'mudbrick' }[walls] || 'plaster', wtile = walls === 'brick' ? 1 : 2;
  const wcol = walls === 'plank' ? [.72, .6, .5] : o.wcol || [1, 1, 1], ft = plain ? 'dark_wood' : o.pTex === 'paint_jade' ? 'paint_jade' : 'vermilion', fcol = plain ? [.95, .9, .85] : [1, 1, 1];
  const E = o.ends || [0, 0]; // corner handling: +1 = this facade covers the corner square (extend by half the piece's thickness), -1 = butt against it
  const B = (x0, x1, y0, y1, d, tex, col, zc = 0, w, sk) => { if (zc === 0) { if (E[0] && Math.abs(x0 + h2) < 1e-6) x0 -= E[0] > 0 ? d / 2 : -(d / 2 + .004); if (E[1] && Math.abs(x1 - h2) < 1e-6) x1 += E[1] > 0 ? d / 2 : -(d / 2 + .004); }
    if (x1 - x0 < .005 || y1 - y0 < .005) return; b.s({ tex, col }).box((x0 + x1) / 2, (y0 + y1) / 2, zc, x1 - x0, y1 - y0, d, w || sk ? { world: w, skip: sk } : undefined); };
  const SH = .16, DADO = .78;
  const plasterBits = (x0, x1, y0, y1) => { // weathering on plastered panels: a repair patch, a rain stain (proud >= 2 cm)
    if (walls !== 'white' || x1 - x0 < .9 || y1 - y0 < 1) return; const h = hash2(Math.round(x0 * 10 + sd0), Math.round(y0 * 10), 511);
    if (h < .35) { const pw = .3 + h * 1.4, ph = .25 + h, px = lerp(x0 + pw / 2 + .05, x1 - pw / 2 - .05, hash2(sd0 | 0, 3, 512)), py = lerp(y0 + ph / 2 + .05, y1 - ph / 2 - .05, hash2(sd0 | 0, 4, 513));
      for (const s of [1, -1]) B(px - pw / 2, px + pw / 2, py - ph / 2, py + ph / 2, .012, 'plaster', h < .15 ? [.86, .8, .68] : [1.04, 1.02, .98], s * (T / 2 + .026)); } };
  const panel = (x0, x1, y0, y1) => { // infill between members (sill below)
    if (x1 - x0 < .005 || y1 - y0 < .005) return;
    if (walls === 'white') { if (y0 < DADO) B(x0, x1, y0, Math.min(y1, DADO), T + .03, 'brick', [1, 1, 1], 0, 1, ['bot']); if (y1 > DADO) { B(x0, x1, Math.max(y0, DADO), y1, T, wt, wcol, 0, 2, ['bot', 'top']); plasterBits(x0, x1, Math.max(y0, DADO), y1); } } // hidden top/bottom faces are not emitted
    else if (walls === 'plank' && y0 < 1.05 && y1 > 1.2) { B(x0, x1, y0, 1.05, T, wt, wcol, 0, wtile); B(x0, x1, 1.05, 1.17, TM, ft, fcol); B(x0, x1, 1.17, y1, T, wt, wcol, 0, wtile); } // 腰串 mid rail
    else B(x0, x1, y0, y1, T, wt, wcol, 0, wtile, ['bot', 'top']);
  };
  const wallRun = (x0, x1) => { if (x1 - x0 < .01) return; B(x0, x1, 0, SH, TM, walls === 'mud' || walls === 'adobe' ? 'stone' : ft, walls === 'mud' || walls === 'adobe' ? [.8, .78, .74] : fcol); panel(x0, x1, SH, hb); };
  const bars = (x0, x1, y0, y1, n, z = .02, sz = .05) => { b.s({ tex: ft, col: fcol }); for (let i = 0; i < n; i++) { const x = lerp(x0, x1, (i + .5) / n); b.T(x, (y0 + y1) / 2, z, 0, PI / 4, 0).box(0, 0, 0, sz, y1 - y0 + .04, sz, { skip: ['top', 'bot'] }).pop(); } };
  const paper = (x0, x1, y0, y1) => { // the window's own paper/gauze, 2 cm behind the bars, filling the opening edge to edge. Lit rooms: backlit,
    // warm and uneven (brighter low and in the middle, as from a lamp below), the bars silhouetted in front; unlit rooms: plain dim paper
    const g = o.glow || 0, nx = 4, ny = 3, z = -.035, ue = Math.max(1, Math.round((x1 - x0) / 1.2)), lamp = o.lamp || 1, sd0 = (o.seed || 1) * 3.7;
    for (const face of [1, -1]) { const i0 = b.nv; for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const u = i / nx, v = j / ny, c = 1 - Math.abs(u - .5) * 1.3, low = 1 - v * .55, k = g ? g * (face > 0 ? .9 : .35) * (.55 + .45 * c * low + .12 * (hash2(i + Math.round(sd0), j, 543) - .5)) : 0;
        b.s({ tex: 'paper_window', col: g ? [1.06, .8 + .06 * c, .5 + .08 * c] : [.82, .78, .72], emi: k, bone: g ? lamp : 0 }); b.v(lerp(x0, x1, u), lerp(y0, y1, v), z, 0, 0, face, u * ue, 1 - v); }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = i0 + j * (nx + 1) + i, c = a + nx + 1; if (face > 0) b.quad(a, a + 1, c + 1, c); else b.quad(a, c, c + 1, a + 1); } }
    b.s({ emi: 0, bone: 0, col: [1, 1, 1] }); };
  const gapGlow = (x0, x1, y0, y1, d) => { const g = o.glow || 0; if (!g) return; b.s({ tex: 'paper_window', col: [1.05, .72, .4], emi: Math.min(1.9, g * 2.2), bone: o.lamp || 1 }).box((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, d); b.s({ emi: 0, bone: 0, col: [1, 1, 1] }); }; // lamplight in a real gap (inside the door frame)
  if (kind === 'wall') return wallRun(-h2, h2);
  if (kind === 'window') {
    const ww = Math.min(len - 1.1, o.winW || 2.1), fw = .1; if (ww < .6) return wallRun(-h2, h2);
    const wy0 = hb > 2.6 ? .95 : .85, wy1 = Math.min(hb - .3, wy0 + 1.25), xa = ww / 2 + fw;
    B(-h2, h2, 0, SH, TM, ft, fcol); panel(-h2, -xa, SH, hb); panel(xa, h2, SH, hb); panel(-xa, xa, SH, wy0 - fw - .04); panel(-xa, xa, wy1 + fw, hb);
    B(-xa, -ww / 2, wy0 - fw, wy1 + fw, TM, ft, fcol); B(ww / 2, xa, wy0 - fw, wy1 + fw, TM, ft, fcol); // 立頰
    B(-ww / 2, ww / 2, wy1, wy1 + fw, TM + .02, ft, fcol); B(-xa - .05, xa + .05, wy0 - fw - .04, wy0, TM + .08, ft, fcol); // 窗額, 窗下串 (a ledge)
    bars(-ww / 2, ww / 2, wy0, wy1, Math.max(5, Math.round(ww / .17))); paper(-ww / 2, ww / 2, wy0, wy1); return;
  }
  if (kind === 'rail') { b.T(-h2, 0, 0); ARCH._rail(b, len, { h: 1.0, mat: plain ? 'dark' : 'red' }); b.pop(); return; }
  // openings: door / opendoor / board / boardopen / portal / shutter / counter
  const big = kind === 'board' || kind === 'boardopen' || kind === 'portal', shop = kind === 'shutter' || kind === 'counter';
  const fw = big ? .16 : .11, dw = big || shop ? len - .72 : Math.min(len - .9, 2.2), hd = big ? hb - .3 : shop ? hb - .42 : Math.min(hb - .5, 2.3), xa = dw / 2 + fw;
  if (dw < .7) return wallRun(-h2, h2);
  for (const sd of [-1, 1]) wallRun(sd < 0 ? -h2 : xa, sd < 0 ? -xa : h2);
  B(-xa, -dw / 2, 0, hb, TM, ft, fcol); B(dw / 2, xa, 0, hb, TM, ft, fcol); // jambs 立頰 run up to the lintel
  B(-dw / 2, dw / 2, hd, hd + .2, TM + .03, ft, fcol); // 門額
  if (!shop) B(-dw / 2, dw / 2, 0, big ? .26 : .18, TM + .06, big ? 'stone' : ft, big ? [.85, .84, .8] : fcol); // threshold 門限 (portals too: the closed leaves meet it, no gap under them)
  if (!shop) { const np = big ? 4 : 2; b.s({ tex: ft, col: fcol }); for (let i = 0; i < np; i++) { const x = (i - (np - 1) / 2) * dw / (np + .5); b.T(x, hd + .1, (TM + .03) / 2 + .055, PI / 2, 0, 0).lathe([[.075, -.055], [.075, .055], [0, .055]], { seg: 6 }).pop(); } } // 門簪
  if (!shop) for (const sd of [-1, 1]) B(sd * (dw / 2 - .1), sd * (dw / 2 + .2), -.03, big ? .24 : .17, .28, 'stone', [.82, .8, .76], TM / 2 + .155); // 門砧 (sunk 3 cm)
  const top = hd + .2;
  if (hb - top > .3 && !big) { const n = Math.max(4, Math.round(dw / .15)); B(-dw / 2, dw / 2, hb - .07, hb, TM, ft, fcol); bars(-dw / 2, dw / 2, top, hb - .07, n); paper(-dw / 2, dw / 2, top, hb - .07); } // 橫披 transom with straight bars
  else if (hb - top > .01) panel(-dw / 2, dw / 2, top, hb);
  const leafTex = big && o.studs ? 'door_studs' : plain || big ? 'plank' : 'vermilion', lcol = leafTex === 'plank' ? [.62, .48, .38] : [1, 1, 1], ly0 = kind === 'portal' ? 0 : big ? .27 : .19, lh = hd - .01 - ly0, lw = dw / 2 - .008;
  const leaf = (open, sd) => { // one 板門 leaf, hinge at x = sd*dw/2; closed: in the opening plane; open: swung inward against the jamb
    if (open) b.T(sd * (dw / 2 - .05), 0, -.05 - lw / 2, 0, -sd * PI / 2, 0); else b.T(sd * (dw / 2 - lw / 2), 0, 0, 0, 0, 0);
    b.s({ tex: leafTex, col: lcol }).box(0, ly0 + lh / 2, 0, lw, lh, .07, { uv: [Math.max(1, Math.round(lw / 1.1)), Math.max(1, Math.round(lh / 1.1))] });
    b.s({ tex: 'dark_wood', col: [.8, .72, .64] }); for (const y of [.25, .55, .85]) b.box(0, ly0 + lh * y, -.06, lw - .14, .1, .05); // battens 福 on the inner face
    b.s({ tex: 'iron', col: [.75, .7, .62] }).box(-sd * (lw / 2 - .16), ly0 + lh * .5, .045, .13, .13, .02); b.T(-sd * (lw / 2 - .16), ly0 + lh * .5 - .07, .07).lathe([[.05, -.008], [.065, 0], [.05, .008], [.035, 0], [.05, -.008]], { seg: 6 }).pop(); // 鋪首 + ring
    b.pop(); };
  const gC = o.st ? 2 * o.st - 1 : 0, gO = o.st ? 2 * o.st : 0; // state groups (CITY.SCHED): odd = shown while closed, even = while open
  const hang = () => { if (o.blind && !big) { b.s({ tex: 'blind', col: [1, 1, 1] }).box(0, hd - .55, TM / 2 + .04, dw - .1, 1.0, .02); b.s({ tex: 'blind' }).T(0, hd - .06, TM / 2 + .07, 0, 0, PI / 2).lathe([[.05, -dw / 2 + .06], [.05, dw / 2 - .06]], { seg: 5 }).pop(); }
    else if (o.curtain && !big) { b.s({ tex: 'cloth', col: o.curtain }); for (const sd of [-1, 1]) b.T(sd * dw * .27, hd - .7, TM / 2 + .04, 0, 0, sd * .06).box(0, 0, 0, dw * .44, 1.35, .02).pop(); } };
  if (o.st && !shop) { b.s({ slot: gC }); for (const sd of [-1, 1]) leaf(false, sd); if (!big) { gapGlow(-.007, .007, ly0 + .02, hd - .03, .05); gapGlow(-dw / 2 + .05, dw / 2 - .05, ly0 - .009, ly0 - .001, .05); } // closed: leaves in the door plane
    b.s({ slot: gO }); for (const sd of [-1, 1]) leaf(true, sd); hang(); b.s({ slot: 0 }); return; } // open: swung inward against the jambs
  if (kind === 'door' || kind === 'board') { for (const sd of [-1, 1]) leaf(false, sd); if (!big) { gapGlow(-.007, .007, ly0 + .02, hd - .03, .05); gapGlow(-dw / 2 + .05, dw / 2 - .05, ly0 - .009, ly0 - .001, .05); } } // light in the crack between the leaves and under them
  else if (kind === 'opendoor' || kind === 'boardopen') { for (const sd of [-1, 1]) leaf(true, sd); // a lit room behind an open door: a real lamp + light inside (ARCH.frame)
    if (o.blind && !big) { b.s({ tex: 'blind', col: [1, 1, 1] }).box(0, hd - .55, TM / 2 + .04, dw - .1, 1.0, .02); b.s({ tex: 'blind' }).T(0, hd - .06, TM / 2 + .07, 0, 0, PI / 2).lathe([[.05, -dw / 2 + .06], [.05, dw / 2 - .06]], { seg: 5 }).pop(); }
    else if (o.curtain && !big) { b.s({ tex: 'cloth', col: o.curtain }); for (const sd of [-1, 1]) b.T(sd * dw * .27, hd - .7, TM / 2 + .04, 0, 0, sd * .06).box(0, 0, 0, dw * .44, 1.35, .02).pop(); } }
  else if (shop) { // 排門: shop boards across the opening (closed) / taken down and stacked inside against the jamb (open); counters inside always
    const boards = () => { const n = Math.max(3, Math.round(dw / .34)), pw = dw / n; for (let i = 0; i < n; i++) { const sh = .9 + hash2(i, sd0 | 0, 514) * .2; b.s({ tex: 'plank', col: [.6 * sh, .48 * sh, .38 * sh] }).box(-dw / 2 + (i + .5) * pw, (.18 + hd) / 2, -.02, pw - .012, hd - .18, .045, { uv: [1, 2] }); } if (o.glow) for (let i = 1; i < n; i++) gapGlow(-dw / 2 + i * pw - .005, -dw / 2 + i * pw + .005, .22, hd - .04, .03); }; // lamplight in the real gaps between the boards
    const stack = () => { for (let i = 0; i < 4; i++) b.s({ tex: 'plank', col: [.6, .48, .38] }).T(-dw / 2 + .22, .03, -.9 - i * .05, -.1, 0, 0).box(0, (hd - .3) / 2, 0, .3, hd - .3, .04).pop(); if (kind === 'counter') b.s({ tex: 'blind', col: [1, 1, 1] }).T(0, hd - .09, TM / 2 + .1, 0, 0, PI / 2).lathe([[.07, -dw / 2 + .05], [.07, dw / 2 - .05]], { seg: 6 }).pop(); };
    if (kind === 'shutter') B(-dw / 2, dw / 2, 0, .18, TM + .04, ft, fcol); else B(-dw / 2, dw / 2, 0, .12, TM + .04, 'stone', [.8, .78, .74]);
    if (o.st) { b.s({ slot: gC }); boards(); b.s({ slot: gO }); stack(); b.s({ slot: 0 }); } else if (kind === 'shutter') boards(); else stack();
    if (kind === 'counter') for (const sd of [-1, 1]) { const cx = sd * len * .29, cw = len * .34; b.s({ tex: 'plank', col: [.66, .54, .44] }).box(cx, .45, -.45, cw, .9, .5, { world: 1.2 }); b.s({ tex: 'dark_wood', col: [1, 1, 1] }).box(cx, .93, -.43, cw + .06, .06, .62); }
  }
};
// 懸魚: carved board hanging from the apex of the bargeboards (only for 常參官 houses, temples, offices — §5.6), proud of the boards by 1.5 cm
ARCH.fish = (b, x, ytop, sd, tex) => { b.s({ tex: tex || 'dark_wood', col: [.9, .82, .74] }).T(x, ytop, 0, 0, PI / 2, 0);
  for (const P of [[[0, 0], [.16, -.06], [.2, -.34], [.12, -.6], [0, -.66], [-.12, -.6], [-.2, -.34], [-.16, -.06]], [[0, -.66], [-.2, -.84], [0, -.76], [.2, -.84]]]) { // convex body + tail
    for (const z of [.02, -.02]) ARCH.poly(b, P.map(([u, v]) => [u, v, z]), [0, 0, Math.sign(z)], p => [p[0] + .5, -p[1]]);
    for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], cx = P.reduce((a, r) => a + r[0], 0) / P.length, cy = P.reduce((a, r) => a + r[1], 0) / P.length; let nx = q[1] - p[1], ny = p[0] - q[0]; if (nx * ((p[0] + q[0]) / 2 - cx) + ny * ((p[1] + q[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; } ARCH.quad(b, [p[0], p[1], -.02], [q[0], q[1], -.02], [q[0], q[1], .02], [p[0], p[1], .02], [nx, ny, 0], [.1, .1]); } }
  b.pop(); void sd; };
// ---------- compound pieces (geometry cached as MBs and stamped with b.add; L-level helpers add collision) ----------
ARCH._mc = {}; ARCH.cached = (key, fn) => { let m = ARCH._mc[key]; if (!m) { m = new MB(); fn(m); ARCH._mc[key] = m; } return m; };
ARCH.stamp = (L, key, fn, x, y, z, yaw = 0, s = 1, solid) => { if (ARCH.lod) return; const b = L.mb; b.T(x, y, z, 0, yaw, 0, s).add(ARCH.cached(key, fn)).pop(); if (solid) L.world.box(x, y + solid[1] / 2, z, solid[0] / 2, solid[1] / 2, solid[2] / 2, { yaw }); };
// 迴廊 covered corridor: a row of bays along local x from (x0,z0) to (x1,z1), w deep, gable roof, rails on the open side(s); wallSide -1/1: back wall
ARCH.corridor = function (L, x0, z0, x1, z1, o = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / (o.bay || 3.6))), yaw = Math.atan2(-(z1 - z0), x1 - x0), F = ARCH.F((x0 + x1) / 2, o.y || 0, (z0 + z1) / 2, yaw);
  const ws = o.wall || 0, k = ws ? 'wall' : 'open', back = Array(n).fill(0).map((_, i) => !ws ? 'open' : o.win && (i % 3) !== 1 ? 'window' : 'wall'), front = Array(n).fill(o.rail ? 'rail' : 'open'), ph = o.ph ?? .3, w = o.w || 2.6, m0 = o.m0 ?? .4, m1 = o.m1 ?? .4;
  if (ph > .05) { const b = L.mb; b.s({ col: [1, 1, 1], emi: 0 }).T(F.x, F.y, F.z, 0, F.yaw, 0); ARCH.box(b, (m1 - m0) / 2, 0, 0, len + m0 + m1, ph, w + .8, 'brick', 1, { faces: { top: 'pave' }, skip: ['bot'] }); b.pop(); ARCH.solid(L, F, (m1 - m0) / 2, 0, 0, len + m0 + m1, ph, w + .8); }
  return ARCH.frame(L, F, { bw: Array(n).fill(len / n), dw: [o.w || 2.6], y0: o.ph ?? .3, colH: o.colH || 2.9, colR: .13, brackets: o.brackets || 'none', paint: o.paint || 'ochre', roof: 'gable', tiles: o.tiles, chiwen: false, gov: .3, eave: .7, walls: 'white', ceiling: false,
    fill: { front: ws > 0 ? back : front, back: ws < 0 ? back : front, left: [k === 'wall' ? 'open' : 'open'], right: ['open'] }, rafters: false, seed: o.seed });
};
// 囷 round granary: wattle-and-daub drum on a stone ring, conical thatch hat
ARCH.granary = (L, x, z, r = 1.6, h = 2.6, seed = 1) => { if (ARCH.lod) { L.mb.s({ tex: 'thatch', col: [1, 1, 1] }).T(x, 0, z).lathe([[r, 0], [r, h], [r + .5, h], [0, h + r * .9]], { seg: 6 }).pop(); return; }
  ARCH.stamp(L, 'granary' + (seed & 3), b => { const R = RNG(seed);
    b.s({ tex: 'stone', col: [.8, .78, .74] }).lathe([[0, 0], [r + .12, 0], [r + .12, .35], [r - .02, .36]], { seg: 10 });
    b.s({ tex: 'mudbrick', col: [1.05, 1, .95] }).lathe([[r, .35], [r * 1.03, h * .6], [r * .98, h]], { seg: 10, uvs: [4, 2] });
    b.s({ tex: 'thatch', col: [.95 + R() * .1, .9, .8] }).lathe([[r * .9, h - .05], [r + .55, h - .25], [r + .5, h - .1], [r * .55, h + r * .45], [.2, h + r * .85], [0, h + r * .95]], { seg: 10, uvs: [5, 2] });
    b.s({ tex: 'rope', col: [.8, .7, .5] }).T(0, h + r * .6, 0).lathe([[r * .45, -.05], [r * .47, 0], [r * .45, .05]], { seg: 10 }).pop();
    b.s({ tex: 'plank', col: [.6, .5, .4] }).box(0, h * .55, r * 1.02, .6, .8, .06); }, x, 0, z, seed, 1, [2 * r, h, 2 * r]); };
// trade goods for an open shop front / workshop yard (local frame: +z = street, origin on the floor at the front edge, w wide)
// shop goods (round 7): everything stands on the floor against a wall, on a counter, on a table/trestle or a shelf, or hangs from a pole —
// nothing floats — and a clear path (>= 1.2 m) runs from every door / open bay into the room. Local coords: x along the front (lx = the
// building's centre), z = 0 the front bay plane, -z inside (room depth o.depth), +z outside (o.apron = platform depth in front).
// o.bays = [[x0, x1, kind]...] across the front (default: ARCH.shop's 0.3/0.4/0.3 split of o.front kinds). ARCH._goodsLog (if an array)
// receives { F, lx, ly, lz, g0, g1, paths, items: [{ t0, t1, y, hang }] } for tool/clearcheck.js.
ARCH.goods = function (L, F, lx, ly, lz, w, trade, R, o = {}) {
  if (ARCH.lod) return; const b = L.mb, W = w, D = o.depth || 4.5, apron = o.apron || 0, iw = W / 2 - .3, back = -D + .3, g0 = b.I.length / 3;
  const bays = o.bays || (o.fk || ['counter', 'opendoor', 'counter']).map((k, i) => [[-W / 2, -.2 * W], [-.2 * W, .2 * W], [.2 * W, W / 2]][i].concat([k]));
  const DOOR = new Set(['opendoor', 'door', 'boardopen', 'portal', 'open']), paths = [], tops = [], items = [], placed = [];
  for (const [x0, x1, k] of bays) if (DOOR.has(k)) { const c = (x0 + x1) / 2, hw = Math.max(.65, (x1 - x0) / 2 - .05); paths.push([c - hw, c + hw, o.through ? -D - 1 : -Math.min(D * .62, 2.6), apron + 1.2]); } // door path box (o.through: a passage out through the back wall too — QA door check)
  for (const [x0, x1, k] of bays) if (k === 'counter') { const c = (x0 + x1) / 2, len = x1 - x0; for (const sd of [-1, 1]) tops.push({ x: c + sd * len * .29, w: len * .34 - .1, z: -.45, d: .44, y: .96 }); }
  for (const [x0, x1, k] of bays) if (k === 'counter' || k === 'shutter') { const c = (x0 + x1) / 2; placed.push([c - .5, c + .5, -1.3 - .5, -1.3 + .5], [c - .5, c + .5, .95 - .5, .95 + .5]); } // keep the door-meta standing points (and the keeper's place) clear
  const hit = (x0, x1, z0, z1) => paths.some(p => x1 > p[0] && x0 < p[1] && z1 > p[2] && z0 < p[3]) || placed.some(p => x1 > p[0] + .02 && x0 < p[1] - .02 && z1 > p[2] + .02 && z0 < p[3] - .02);
  const put = (x, y, z, yaw, fn, hang, s = 1) => { const p = F.p(lx + x, 0, lz + z), t0 = b.I.length / 3; b.T(p[0], ly + y + (hang ? 0 : .015), p[2], 0, F.yaw + yaw, 0, s); /* 1.5 cm proud of its support: lathe bottoms never z-fight the floor or counter */ fn(b); b.pop(); b.s({ emi: 0, col: [1, 1, 1] }); items.push({ t0, t1: b.I.length / 3, y: ly + y, hang: hang || 0 }); };
  const claim = (x, z, rx, rz) => { if (hit(x - rx, x + rx, z - rz, z + rz)) return false; placed.push([x - rx, x + rx, z - rz, z + rz]); return true; };
  const solid = (x, z, sw, sh, sd2, yaw = 0) => { const p = F.p(lx + x, 0, lz + z); L.world.box(p[0], ly + sh / 2, p[2], sw / 2, sh / 2, sd2 / 2, { yaw: F.yaw + yaw }); };
  // floor spots along the walls (inside): side walls behind the counters, then the back wall; outside on the apron in front of closed/counter bays
  const wallSpots = (r, step) => { const out = []; for (const sd of [-1, 1]) for (let z = -1.05 - r; z > back + r; z -= step) out.push([sd * (iw - r), z, sd > 0 ? -PI / 2 : PI / 2]); for (let x = -iw + r; x < iw - r; x += step) out.push([x, back + r, 0]); return out; };
  const apronSpots = (r, step) => { const out = []; if (apron > .5 && .25 + 2 * r <= apron - .04) for (const [x0, x1, k] of bays) if (!DOOR.has(k)) for (let x = x0 + .3 + r; x < x1 - .2 - r; x += step) out.push([x, .25 + r, 0]); return out; }; /* only what fits on the platform */
  const floor = (spots, r, n, fn, hgt) => { let k = 0; for (const [x, z, yaw] of spots) { if (k >= n) break; if (!claim(x, z, r, r)) continue; put(x, 0, z, yaw + (R() - .5) * .6, b2 => fn(b2, k)); solid(x, z, r * 1.6, hgt, r * 1.6); k++; } return k; };
  // display surfaces: the counters, else a trestle table 案 against each side wall
  if (!tops.length) for (const sd of [-1, 1]) { const tw = Math.min(1.5, D - 2.2), x = sd * (iw - .32), z = -1.2 - tw / 2; if (tw < .8 || !claim(x, z, .33, tw / 2)) continue;
    put(x, 0, z, PI / 2, b2 => { b2.s({ tex: 'plank', col: [.7, .58, .46] }).box(0, .76, 0, tw, .05, .6, { uv: [2, 1] }); b2.s({ tex: 'dark_wood', col: [.8, .7, .6] }); for (const ex of [-1, 1]) { b2.box(ex * (tw / 2 - .1), .37, -.22, .05, .74, .05).box(ex * (tw / 2 - .1), .37, .22, .05, .74, .05).box(ex * (tw / 2 - .1), .14, 0, .04, .04, .44); } }); solid(x, z, .62, .8, tw);
    tops.push({ x, w: .5, z, d: tw - .1, y: .785, side: 1 }); }
  const onTops = (n, fn, len = .4) => { for (const t of tops) { const along = t.side ? t.d : t.w, m = Math.max(1, Math.min(n, Math.floor(along / len))); for (let i = 0; i < m; i++) { const u = -along / 2 + (i + .5) * along / m; put(t.side ? t.x : t.x + u, t.y, t.side ? t.z + u : t.z, t.side ? PI / 2 : 0, b2 => fn(b2, i)); } } };
  const shelf = (fill) => { const sw = Math.min(2.4, 2 * iw - .4); if (sw < 1 || !claim(0, back + .23, sw / 2, .23)) return; put(0, 0, back + .23, 0, b2 => { b2.s({ tex: 'dark_wood', col: [.85, .75, .65] }); for (const sx of [-1, 1]) b2.box(sx * (sw / 2 - .03), 1.1, 0, .06, 2.2, .44); for (let k = 0; k < 4; k++) b2.box(0, .3 + k * .6, 0, sw - .12, .04, .42);
      for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) { b2.T(-sw / 2 + .32 + i * (sw - .64) / 3, .32 + k * .6, 0); fill(b2, i, k); b2.pop(); } }); solid(0, back + .23, sw, 2.2, .44); };
  const rack = (x0, x1, z, h, fn, n) => { // two posts and a pole; things hang from the pole
    put((x0 + x1) / 2, 0, z, 0, b2 => { b2.s({ tex: 'bamboo', col: [.9, .8, .6] }); for (const x of [x0, x1]) b2.box(x - (x0 + x1) / 2, h / 2, 0, .07, h, .07); b2.box(0, h - .04, 0, x1 - x0 + .1, .06, .06); }); solid(x0, z, .1, h, .1); solid(x1, z, .1, h, .1);
    for (let i = 0; i < n; i++) put(x0 + (i + .5) * (x1 - x0) / n, h - .07, z, 0, b2 => fn(b2, i), 1); };
  const BOLT = [[.9, .3, .25], [.3, .4, .7], [.85, .75, .5], [.95, .92, .85], [.4, .55, .35], [.6, .3, .5]];
  const bolt = (b2, i, k = 0) => { b2.s({ tex: 'silk', col: BOLT[(i + k + (R() * 6 | 0)) % 6] }).box(0, .065, 0, .4, .13, .46); };
  const jar = (b2, k) => PROPS.jar(b2, .5 + (k % 3) * .12), sack = (b2, k) => PROPS.sack(b2, .85 + (k % 3) * .1, k % 3);
  if (trade === 'wine') { floor(wallSpots(.3, .7), .3, 12, jar, .8); onTops(1, b2 => PROPS.wineJar(b2, .32)); }
  else if (trade === 'cloth' || trade === 'silk') { onTops(4, (b2, i) => { bolt(b2, i); b2.T(0, .13, 0, 0, .1, 0); bolt(b2, i, 2); b2.pop(); }, .5); shelf((b2, i, k) => bolt(b2, i, k));
    for (const sd of [-1, 1]) { const z = back + .9, x0 = sd * (iw - .2) - .05, x1 = x0 - sd * 1.3; if (Math.abs(x1) < iw && claim(Math.min(x0, x1) + .65, z, .7, .12)) rack(Math.min(x0, x1), Math.max(x0, x1), z, 2.0, (b2, i) => { b2.s({ tex: 'silk', col: BOLT[(i * 2 + 1) % 6] }).box(0, -.55, 0, .34, 1.1, .02); b2.s({ tex: 'rope' }).box(0, -.03, 0, .03, .06, .03); }, 3); } }
  else if (trade === 'pottery') { floor(apronSpots(.3, .7), .3, 8, jar, .8); floor(wallSpots(.3, .7), .3, 6, jar, .8); onTops(3, (b2, i) => { for (let j = 0; j < 5; j++) { b2.T(0, j * .045, 0); PROPS.bowl(b2, .16, (i + j) & 1 ? 'celadon' : 'glaze'); b2.pop(); } }, .4); shelf((b2, i, k) => PROPS.bowl(b2, .09 + (i & 1) * .03, (i + k) & 1 ? 'celadon' : 'white')); }
  else if (trade === 'medicine') { const cw = Math.min(W * .62, 2 * iw - .2); if (claim(0, back + .23, cw / 2, .23)) { put(0, 0, back + .23, 0, b2 => { b2.s({ tex: 'dark_wood', col: [.85, .75, .65] }).box(0, 1.1, 0, cw, 2.2, .45); b2.s({ tex: 'plank', col: [.55, .42, .32] }); for (let r = 0; r < 5; r++) for (let c = 0; c < Math.round(cw / .3); c++) b2.box(-cw / 2 + .15 + c * .3, .25 + r * .4, .235, .26, .32, .02); }); solid(0, back + .23, cw, 2.2, .45); } // 藥櫃 against the back wall
    onTops(2, b2 => { b2.s({ tex: 'straw', col: [.85, .7, .4] }).lathe([[0, 0], [.12, .05], [.13, .14], [.06, .25], [.09, .34], [.05, .44], [0, .46]], { seg: 7 }); }, .35); floor(wallSpots(.22, .6), .22, 3, b2 => PROPS.basket(b2, .22, .3), .35); }
  else if (trade === 'grain') { floor(wallSpots(.28, .58), .28, 12, sack, .7); floor(apronSpots(.28, .6), .28, 4, sack, .7); onTops(1, b2 => { PROPS.basket(b2, .2, .2); b2.s({ tex: 'sand', col: [1.1, .95, .6] }).T(0, .16, 0).lathe([[0, .05], [.17, 0]], { seg: 8 }).pop(); }); }
  else if (trade === 'books') { onTops(5, (b2, i) => { const c = [[.95, .9, .78], [.8, .62, .4], [.7, .3, .25]][i % 3]; b2.s({ tex: 'paper', col: c }).T(0, .04, (i & 1) * .03, PI / 2, 0, 0).lathe([[.04, -.16], [.04, .16]], { seg: 5 }).pop(); }, .25); /* scrolls lie across the counter, side by side */ shelf((b2, i, k) => { b2.s({ tex: 'paper', col: [[.95, .9, .78], [.8, .62, .4], [.7, .3, .25]][(i + k) % 3] }).T(0, .04, 0, PI / 2, 0, 0).lathe([[.04, -.18], [.04, .18]], { seg: 5 }).pop(); }); }
  else if (trade === 'butcher') { const cb = bays.find(q => q[2] === 'counter' || q[2] === 'shutter'); if (cb && apron > .5 && claim((cb[0] + cb[1]) / 2, .45, (cb[1] - cb[0]) / 2 - .3, .1)) rack(cb[0] + .35, cb[1] - .35, .45, 2.1, (b2, i) => { b2.s({ tex: 'iron' }).box(0, -.1, 0, .02, .2, .02); b2.s({ tex: 'flesh', col: [.72, .5, .44] }).ell(0, -.55, 0, .09, .36, .07, { seg: 6, ring: 4, disp: lumpy(.25, 4, i) }); }, 3);
    floor(wallSpots(.38, 1), .38, 1, b2 => { b2.s({ tex: 'wood', col: [.8, .7, .6] }).lathe([[.35, 0], [.35, .8], [0, .8]], { seg: 8 }); }, .8); }
  else if (trade === 'bakery') { const sp = apronSpots(.85, 1.8).concat(wallSpots(.85, 1.8)); floor(sp, .85, 1, b2 => { b2.s({ tex: 'mudbrick', col: [1, .9, .8] }).lathe([[0, 0], [.75, 0], [.78, .6], [.7, .95], [.35, 1.25], [.22, 1.3], [.22, 1.4], [0, 1.4]], { seg: 10 }); b2.s({ tex: 'embers', col: [1, .6, .3], emi: .8 }).box(0, .45, .735, .4, .3, .04); b2.s({ emi: 0 }); }, 1.4);
    const ov = placed[placed.length - 1]; if (ov) { const p = F.p(lx + (ov[0] + ov[1]) / 2, 0, lz + (ov[2] + ov[3]) / 2); L.light(p[0], ly + .7, p[2], 3.5, [1.2, .5, .2], { flicker: .2 }); }
    onTops(3, (b2, i) => { b2.s({ tex: 'bread' in TEX.L ? 'bread' : 'sand', col: [1.1, .85, .55] }); for (let j = 0; j < 2; j++) b2.T(0, j * .03, 0).lathe([[0, 0], [.13, 0], [.12, .02], [0, .03]], { seg: 7 }).pop(); }, .3); }
  else if (trade === 'smith') { if (floor(wallSpots(1.0, 2.2), 1.0, 1, b2 => { b2.s({ tex: 'brick', col: [.8, .7, .65] }).box(0, .45, 0, 1.3, .9, 1.0, { world: 1 }); b2.s({ tex: 'embers', col: [1.2, .55, .25], emi: 1 }).box(0, .91, 0, .7, .04, .5); b2.s({ emi: 0, tex: 'brick', col: [.6, .55, .5] }).box(0, 1.6, -.35, .5, 1.4, .3, { world: 1 }); }, 1.2)) { const ov = placed[placed.length - 1], p = F.p(lx + (ov[0] + ov[1]) / 2, 0, lz + (ov[2] + ov[3]) / 2); L.light(p[0], ly + 1.2, p[2], 5, [1.6, .6, .25], { flicker: .25 }); }
    floor(wallSpots(.3, .9), .3, 2, (b2, k) => { if (k) { b2.s({ tex: 'water', col: [.6, .6, .6] }).box(0, .3, 0, .5, .6, .5); } else { b2.s({ tex: 'iron', col: [.5, .5, .55] }).box(0, .32, 0, .3, .64, .3).box(0, .71, 0, .5, .14, .2); } }, .8); }
  else if (trade === 'carpenter') { floor(wallSpots(.7, 1.5), .7, 1, b2 => { for (let i = 0; i < 8; i++) b2.s({ tex: 'plank', col: [.95, .82, .66] }).T(0, .02 + i * .04, 0, 0, (i & 1) * .05, 0).box(0, 0, 0, .3, .04, 1.3).pop(); }, .35);
    floor(wallSpots(.7, 1.5), .7, 1, b2 => { b2.s({ tex: 'wood', col: [.8, .7, .55] }); for (const sx of [-.5, .5]) b2.T(sx, .35, 0).box(0, 0, -.15, .06, .7, .06).box(0, 0, .15, .06, .7, .06).pop(); b2.box(0, .74, 0, 1.3, .08, .34); }, .8); }
  else if (trade === 'dyer') { for (const sd of [-1, 1]) { const x = sd * (iw - .25), z0 = back + .3, z1 = -1.1; if (z1 - z0 < 1 || !claim(x, (z0 + z1) / 2, .12, (z1 - z0) / 2)) continue; put(x, 0, (z0 + z1) / 2, PI / 2, b2 => { b2.s({ tex: 'bamboo', col: [.9, .8, .6] }); for (const e of [-1, 1]) b2.box(e * (z1 - z0) / 2, 1.3, 0, .07, 2.6, .07); b2.box(0, 2.56, 0, z1 - z0 + .1, .06, .06); });
      for (let i = 0; i < Math.floor((z1 - z0) / .75); i++) put(x, 2.53, z0 + .4 + i * .75, PI / 2, b2 => { b2.s({ tex: 'silk', col: [[.25, .32, .62], [.3, .38, .7], [.75, .3, .25], [.9, .78, .4]][(i + sd + 4) % 4] }).box(0, -.9, 0, .6, 1.8, .02); }, 1); }
    floor(apronSpots(.6, 1.4).concat(wallSpots(.6, 1.4)), .6, 2, b2 => { b2.s({ tex: 'wood', col: [.7, .6, .5] }).lathe([[0, 0], [.55, 0], [.6, .7], [.55, .7], [.5, .65], [0, .65]], { seg: 10 }); b2.s({ tex: 'water', col: [.25, .3, .6] }).T(0, .6, 0).lathe([[0, 0], [.52, 0]], { seg: 10 }).pop(); }, .7); }
  else if (trade === 'rope') { floor(wallSpots(.3, .65), .3, 6, (b2, k) => { b2.s({ tex: 'rope', col: [.9, .8, .6] }); for (let j = 0; j <= (k & 1); j++) b2.T(0, j * .2, 0).lathe([[.12, 0], [.3, 0], [.3, .2], [.12, .2], [.12, 0]], { seg: 9 }).pop(); }, .4);
    onTops(3, b2 => { b2.s({ tex: 'mat', col: [1, .95, .85] }).T(0, .11, 0, 0, PI / 2, PI / 2).lathe([[.11, -.22], [.11, .22]], { seg: 6 }).pop(); }, .55); }
  else if (trade === 'tea') { floor(apronSpots(.4, 1).concat(wallSpots(.4, 1)), .4, 1, b2 => { b2.T(0, .03, 0); PROPS.brazier(b2, .7); b2.pop(); b2.s({ tex: 'iron', col: [.4, .4, .42] }).T(0, .65, 0).lathe([[0, 0], [.18, .02], [.2, .12], [.14, .2], [0, .21]], { seg: 8 }).pop(); }, .8);
    floor(apronSpots(.8, 1.7).concat(wallSpots(.8, 1.7)), .8, 1, b2 => PROPS.bench(b2, 1.5), .5); onTops(2, (b2, i) => PROPS.bowl(b2, .07, i & 1 ? 'celadon' : 'white'), .3); }
  if (o.sign) ARCH.hangSign(L, F, lx - W / 2 + 1.0, ly, lz + .25, trade, R);
  if (o.board !== false && SHOP_NAMES[trade] && R() < .3) { // ~30%: a small lacquered name board 牌 over the door (2-4 characters, right->left), hung on two iron links
    const list = SHOP_NAMES[trade], nm = list[(R() * list.length) | 0], db = bays.find(q => DOOR.has(q[2])) || bays[(bays.length - 1) >> 1], bx = (db[0] + db[1]) / 2, bw = Math.min(1.7, db[1] - db[0] - .3), bh = bw / 3.4, by = Math.max((o.colH || 2.9) - .3 - bh / 2 - .14, 2.06 + bh / 2 + .14); /* clear head room under it */
    if (bw > .7) { const p = F.p(lx + bx, 0, lz + .32); /* back 3 cm off the lintel face */ b.T(p[0], ly + by, p[2], 0, F.yaw, 0); ARCH.tablet(b, 'nb_' + nm, bw, bh, { frame: 'lacquer_black', edge: 'dark_wood' }); b.s({ tex: 'iron', col: [.5, .5, .55] }); for (const sx of [-1, 1]) b.box(sx * bw * .35, bh / 2 + .1, -.1, .03, .03, .1); b.pop(); b.s({ col: [1, 1, 1] }); } }
  if (L.meta && o.cls) { const S = (x, z, role, yaw, anim = 'stand') => { const p = F.p(lx + x, 0, lz + z); L.meta.spots.push({ x: p[0], y: ly, z: p[2], yaw: F.yaw + yaw, role, cls: o.cls, anim }); }; // staff: behind the counter, facing the street
    const cb = bays.find(q => q[2] === 'counter'); if (cb) S((cb[0] + cb[1]) / 2, -1.25, trade === 'wine' ? 'hostess' : 'keeper', PI); else if (tops.length) { const t = tops[0], sd = Math.sign(t.x) || 1; S(t.x - sd * .75, t.z, 'keeper', sd > 0 ? -PI / 2 : PI / 2); } else S(0, back + 1.3, 'keeper', PI);
    if (trade === 'wine' || trade === 'bakery' || trade === 'smith' || W > 7) S(cb ? -(cb[0] + cb[1]) / 4 : 0, back + 1.3, trade === 'wine' ? 'waiter' : trade === 'bakery' || trade === 'smith' ? 'cook' : 'assistant', PI, trade === 'smith' ? 'hammer' : 'stand'); }
  if (Array.isArray(ARCH._goodsLog)) ARCH._goodsLog.push({ F, lx, ly, lz, W, D, apron, g0, g1: b.I.length / 3, paths, items, tops, trade });
};
// in-place interiors (round 8): furniture by room kind inside a hall built by ARCH.hall (fr = its return). Floor-and-platform culture: 榻 with
// mats and low tables 案, folding screens 屏風, chests, lamp stands 燈檠, a stove 灶 in kitchens, an altar 須彌座 with a seated image in temple
// halls. Everything stands on the floor against the back / side walls; a clear path (>= 1.2 m) runs in from every door. LOD0 only. Logs into
// ARCH._goodsLog like ARCH.goods (tool/clearcheck.js). kind: 'hall'|'room'|'rich'|'kitchen'|'temple'|'tavern'; o: { seed, cls, lamp, lit }
ARCH.furnish = function (L, fr, kind, o = {}) {
  if (ARCH.lod || !fr || !fr.F || !fr.frame) return; const b = L.mb, F = fr.F, W = fr.W, D = fr.D, ly = fr.top, R = RNG((o.seed || 1) * 977 + 13), g0 = b.I.length / 3, IF = typeof INTERIOR !== 'undefined' && INTERIOR.F;
  const xs = fr.frame.xs || [-W / 2, W / 2], iw = W / 2 - .3, back = -D + .3, items = [], placed = [], paths = [], tops = [], lz = D / 2; // local: x across, z = 0 the front wall, -z inside (like ARCH.goods)
  const DK = new Set(['door', 'opendoor', 'board', 'boardopen', 'portal', 'counter', 'shutter']); // (counters and shutter fronts are door metas too: E passes — their inside standing point stays clear: QA door check)
  for (const q of o.block || []) placed.push(q.slice()); // stair wells and other kept areas (local: x across, z = 0 the front wall)
  for (const [nm, sg] of [['front', 1], ['back', -1]]) { const ks = nm === 'front' ? fr.front : fr.back; if (!ks) continue; ks.forEach((k, i) => { if (!DK.has(k) || xs[i + 1] === undefined) return; const a = sg > 0 ? xs[i] : -xs[i + 1], c = sg > 0 ? xs[i + 1] : -xs[i], m = (a + c) / 2, hw = Math.max(.65, (c - a) / 2 - .05);
    const ap = o.apron ?? 1.2; paths.push(sg > 0 ? [m - hw, m + hw, -Math.min(D * .62, 2.6), ap] : [m - hw, m + hw, -D - ap, -D + Math.min(D * .62, 2.6)]); }); } // ap: how far the clear path runs outside the door
  if (xs.length === 2) for (const p of paths) { const q = p[3] > 0 && paths.find(q => q[3] <= 0 && q[1] > p[0] && q[0] < p[1]); if (!q) continue; p[2] = -D; for (const r of [p, q]) { const m = (r[0] + r[1]) / 2; r[0] = Math.max(r[0], m - .8); r[1] = Math.min(r[1], m + .8); } } // front and back door on one bay: a 1.6 m through passage, the sides free
  const hit = (x0, x1, z0, z1) => paths.some(p => x1 > p[0] && x0 < p[1] && z1 > p[2] && z0 < p[3]) || placed.some(p => x1 > p[0] + .02 && x0 < p[1] - .02 && z1 > p[2] + .02 && z0 < p[3] - .02);
  const put = (x, z, yaw, fn, sz, h) => { const hx = Math.abs(Math.cos(yaw)) > .5 ? sz[0] / 2 : sz[1] / 2, hz = Math.abs(Math.cos(yaw)) > .5 ? sz[1] / 2 : sz[0] / 2;
    if (Math.abs(x) + hx > iw + .05 || z - hz < back - .05 || z + hz > -.25 || hit(x - hx, x + hx, z - hz, z + hz)) return false; placed.push([x - hx, x + hx, z - hz, z + hz]);
    const p = F.p(x, 0, lz + z), t0 = b.I.length / 3; b.T(p[0], ly + .015, p[2], 0, F.yaw + yaw, 0); fn(b); b.pop(); b.s({ emi: 0, col: [1, 1, 1], bone: 0 }); items.push({ t0, t1: b.I.length / 3, y: ly, hang: 0 });
    if (h) L.world.box(p[0], ly + h / 2, p[2], hx, h / 2, hz, { yaw: F.yaw, surface: 'wood' }); return true; }; // hx/hz are in the hall's axes: turn the box with the hall (it was world-aligned: in east/west-facing halls altars and beds collided 90° off)
  const roomLit = !!(o.lit || (fr.frame && fr.frame.lights && fr.frame.lights.length)), lamp = (x, z) => put(x, z, 0, b2 => { b2.s({ bone: o.lamp || 1 }); PROPS.oilLamp(b2, true, roomLit ? .9 : 0); }, [.4, .4], 1.3); // a burning lamp only in a lamplit room (QA glow check)
  // a 榻 seats one (two when ≥ 1.9 m wide: a host and a guest, or a courtesan and her visitor) behind the low table at its front edge
  const rot = (yaw, lx, lz) => [Math.cos(yaw) * lx + Math.sin(yaw) * lz, -Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const ta = (x, z, w, d, yaw = 0, music) => { if (!ta0(x, z, w, d, yaw, music)) return false; for (const lx of w >= 1.9 ? [-w * .24, w * .24] : [0]) { const [ox, oz] = rot(yaw, lx, -d * .14); spot('seat', x + ox, z + oz, yaw, .45, [0, 1]); } return true; };
  const ta0 = (x, z, w, d, yaw = 0, music) => put(x, z, yaw, b2 => { const r2 = RNG((o.seed || 1) + Math.round(x * 7 + z * 13)); // 榻: lacquered platform on four legs, mat, a low table 案 with bowls (set apart, never overlapping), an arm-rest 憑几
      b2.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, .38, 0, w, .1, d, { skip: ['top'] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b2.box(sx * (w / 2 - .1), .165, sz * (d / 2 - .1), .12, .33, .12, { skip: ['top', 'bot'] });
      b2.s({ tex: 'mat', col: [.95, .88, .7] }).box(0, .44, 0, w, .02, d, { uv: [2, 2], skip: ['bot'] }); const tz = d * .3; b2.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .6, tz, w * .5, .04, d * .3); for (const sx of [-1, 1]) b2.box(sx * w * .22, .5, tz, .05, .16, d * .24, { skip: ['top', 'bot'] }); // the 案 at the front edge
      for (let i = 0; i < 3; i++) { if (r2() < .25) continue; b2.T((i - 1) * w * .14, .62, tz + (r2() - .5) * d * .1); PROPS.bowl(b2, .05 + r2() * .02, r2() < .5 ? 'celadon' : 'glaze'); b2.pop(); }
      b2.s({ tex: 'dark_wood', col: [1, 1, 1] }).T(-w / 2 + .35, .45, 0).box(0, .14, 0, .5, .05, .1).box(-.2, .065, 0, .05, .13, .05, { skip: ['top', 'bot'] }).box(.2, .065, 0, .05, .13, .05, { skip: ['top', 'bot'] }).pop();
      if (music) { b2.s({ tex: 'lacquer_red', col: [.9, .7, .5] }).T(w / 2 - .4, .52, -.1, 0, .3, 0).ell(0, 0, 0, .18, .05, .3, { seg: 8, ring: 4 }).box(0, 0, -.45, .05, .03, .4).pop(); } }, [w, d], .45);
  const screen = (x, z, w) => put(x, z, 0, b2 => IF ? IF.screen(b2, w) : b2.s({ tex: 'paper' }).box(0, .9, 0, w, 1.8, .05), [w, .3], 1.8);
  const chest = (x, z, yaw) => put(x, z, yaw, b2 => IF ? IF.chest(b2) : b2.s({ tex: 'lacquer_red' }).box(0, .33, 0, 1.1, .6, .6), [1.15, .65], .65);
  const jar = (x, z, s = .8) => put(x, z, R() * 6, b2 => PROPS.jar(b2, s), [.62 * s, .62 * s], .72 * s);
  // round 11: spots for the residents (people.js): beds (lying position; yaw = the way the head points), seats on platforms, hearths, work places
  const room = o.room || (Math.round(F.x) + ',' + Math.round(F.z)), spot = (kind, x, z, yaw, dy, dir) => { if (!L.meta) return; const F2 = ARCH.F(...(q => [q[0], 0, q[2]])(F.p(x, 0, lz + z)), F.yaw + yaw), c = F2.p(0, 0, 0), h = F2.p(dir[0], 0, dir[1]);
    L.meta.spots.push({ kind, x: c[0], y: ly + dy, z: c[2], yaw: Math.atan2(-(h[0] - c[0]), -(h[2] - c[2])), lot: o.lot, room }); };
  const rich = (o.wealth || 0) >= 3;
  const bed = (x, z, yaw = 0, w = 2.05, d = 1.15, earth = false) => { if (!put(x, z, yaw, b2 => { const r2 = RNG((o.seed || 1) + Math.round(x * 11 + z * 7)); // 床 / 榻 for sleeping: platform, mat, bedding roll, pillow (瓷枕 for the well-off), curtain frame (rich)
        if (earth) b2.s({ tex: 'mudbrick', col: [.95, .86, .76] }).box(0, .22, 0, w, .44, d, { world: 1, skip: ['bot'] }); else { b2.s({ tex: 'dark_wood', col: [.85, .72, .6] }).box(0, .36, 0, w, .1, d, { skip: ['top'] }); for (const sx of [-1, 1]) b2.box(sx * (w / 2 - .12), .155, 0, .14, .31, d - .1, { skip: ['top', 'bot'] }); }
        const ty = earth ? .44 : .41; b2.s({ tex: 'mat', col: [.95, .88, .7] }).box(0, ty + .01, 0, w - .04, .02, d - .04, { uv: [2, 1], skip: ['bot'] });
        b2.s({ tex: 'silk', col: [[.55, .35, .3], [.35, .42, .55], [.75, .7, .55], [.5, .45, .35]][(r2() * 4) | 0] }).T(w / 2 - .45, ty + .1, 0, 0, 0, PI / 2).lathe([[.09, -d * .42], [.09, d * .42]], { seg: 7, caps: true }).pop(); // the rolled quilt at the foot
        b2.s(rich ? { tex: 'celadon', col: [1, 1, 1] } : { tex: 'silk', col: [.8, .75, .62] }).box(-w / 2 + .28, ty + .07, 0, .22, .12, .42, { skip: ['bot'] }); // pillow
        if (rich) { b2.s({ tex: 'lacquer_black', col: [1, 1, 1] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b2.box(sx * (w / 2 - .04), ty + .9, sz * (d / 2 - .04), .06, 1.8, .06, { skip: ['bot'] }); b2.box(0, ty + 1.8, -d / 2 + .04, w, .06, .06).box(0, ty + 1.8, d / 2 - .04, w, .06, .06);
          b2.s({ tex: 'silk', col: [.75, .62, .55] }).box(0, ty + 1.05, -d / 2 + .02, w - .16, 1.3, .02); } }, [w, d], rich ? 2.3 : .5)) return false; // 帳 curtain along the back
    spot('bed', x, z, yaw, earth ? .47 : .44, [-1, 0]); return true; };
  const rack = (x, z, yaw = 0) => put(x, z, yaw, b2 => { const r2 = RNG((o.seed || 1) + 5); b2.s({ tex: 'dark_wood', col: [.8, .68, .55] }).box(-.55, .8, 0, .06, 1.6, .06, { skip: ['bot'] }).box(.55, .8, 0, .06, 1.6, .06, { skip: ['bot'] }).box(0, 1.55, 0, 1.4, .07, .07).box(-.55, .03, 0, .1, .06, .36).box(.55, .03, 0, .1, .06, .36); // 衣架 with a robe
      b2.s({ tex: 'silk', col: [[.45, .3, .5], [.3, .38, .55], [.62, .25, .2], [.8, .78, .7]][(r2() * 4) | 0] }).box(0, 1.08, 0, 1.0, .9, .03); }, [1.4, .38], 1.6);
  const hearth = (x, z) => { if (!put(x, z, 0, b2 => { b2.s({ tex: 'stone', col: [.7, .66, .6] }); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b2.box(Math.cos(a) * .32, .08, Math.sin(a) * .32, .16, .16, .16); }
      b2.s({ tex: 'iron', col: [.33, .31, .3] }).T(0, .2, 0).lathe([[0, -.1], [.22, -.05], [.25, .08], [.22, .1]], { seg: 8 }).pop(); b2.s({ tex: 'embers', col: [1.2, .55, .25], emi: .8, bone: o.lamp || 1 }).box(0, .04, 0, .3, .03, .3); }, [.9, .9], .3)) return false; spot('hearth', x, z + .75, 0, 0, [0, -1]); return true; };
  const sacks = (x, z, n) => put(x, z, 0, b2 => { for (let i = 0; i < n; i++) { b2.T((i % 3 - 1) * .45, 0, ((i / 3) | 0) * .45 - .2); PROPS.sack(b2, .9, i); b2.pop(); } }, [1.4, .95], .7);
  const tools = (x, z, yaw) => put(x, z, yaw, b2 => { b2.s({ tex: 'wood', col: [.8, .68, .52] }).T(-.15, .7, 0, 0, 0, .12).box(0, 0, 0, .05, 1.4, .05).pop().T(.15, .65, 0, 0, 0, -.1).box(0, 0, 0, .05, 1.3, .05).pop(); b2.s({ tex: 'iron', col: [.4, .4, .42] }).box(-.24, .06, 0, .22, .12, .03).box(.22, .05, 0, .16, .1, .03); }, [.7, .3], 1.4); // hoe and spade
  const loom = (x, z) => { if (put(x, z, 0, b2 => { b2.s({ tex: 'wood', col: [.82, .7, .55] }); for (const sx of [-1, 1]) { b2.box(sx * .55, .55, -.3, .07, 1.1, .07, { skip: ['bot'] }).box(sx * .55, .35, .45, .07, .7, .07, { skip: ['bot'] }).box(sx * .55, .6, .07, .06, .06, .9); }
      b2.box(0, 1.08, -.3, 1.2, .07, .07).box(0, .55, .3, 1.15, .06, .06).box(0, .38, .55, 1.1, .08, .3); /* the bench reaches the front posts (QA float check) */ b2.s({ tex: 'silk', col: [.85, .82, .72] }).box(0, .82, -.05, 1.0, .02, .55); }, [1.3, 1.3], 1.1)) spot('work', x, z + .75, 0, .4, [0, -1]); };
  const sd = R() < .5 ? -1 : 1, mid = back + .75;
  const sleepers = n => { if (!L.meta) return; for (const [x, z, yw] of [[-sd * (iw - .5), -D * .55, PI / 2], [sd * (iw - .5), -D * .55, PI / 2], [0, back + 1.6, 0], [-sd * (iw - 1.1), back + .5, 0], [sd * (iw - 1.1), back + .5, 0]]) { // children / servants on floor mats until the room sleeps n
      if (L.meta.spots.filter(q => q.kind === 'bed' && q.room === room).length >= n) return; if (put(x, z, yw, b2 => b2.s({ tex: 'mat', col: [.9, .84, .66] }).box(0, .012, 0, 1.8, .024, .8, { uv: [2, 1] }), [1.8, .8])) spot('bed', x, z, yw, .05, [-1, 0]); } };
  if (kind === 'hall' || kind === 'rich') { // 堂: the master's 榻 before a screen at the back, guests' 榻 down the sides (rich), a chest, lamps
    const bw = Math.min(2.4, W - 2.6), bp = paths.filter(p => p[2] < -D + .5), c0 = bp.length ? Math.max(...bp.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) : 0; // a back door: the 榻 groups flank its path
    if (!c0) { if (bw > 1.2 && screen(0, back + .15, bw)) ta(0, back + .35 + .65, Math.min(2.2, bw), 1.2); else ta(sd * (iw - 1.2), back + .65, 2, 1.2); lamp(sd * Math.min(iw - .3, 1.75), back + .5); if (kind === 'rich') lamp(-sd * Math.min(iw - .3, 1.75), back + .5); }
    else for (const s of kind === 'rich' ? [-1, 1] : [sd]) { const x = s * (c0 + .15 + Math.min(1.1, (iw - c0) / 2)), w2 = Math.min(2, iw - c0 - .4); if (w2 < 1.1) continue; if (screen(x, back + .15, w2)) ta(x, back + .35 + .65, w2 - .1, 1.1); else ta(x, back + .6, w2 - .1, 1.1); lamp(s * (c0 + .3), back + 1.6); }
    if (kind === 'rich' && D > 6) for (const s of [-1, 1]) ta(s * (iw - .65), -D * .55, 1.8, 1.1, PI / 2); chest(-sd * (iw - .6), back + .35, 0);
    if (kind === 'hall' && !((fr.front || []).length === 3 && W >= 9 && o.partitions !== false)) bed(-sd * (iw - 1.05), back + .68) || bed(-sd * (iw - .7), -D * .5, PI / 2, Math.min(2.05, D - 1.6)); // a one-room house: the family sleeps in the hall
    if (kind === 'hall' && (fr.front || []).length === 3 && W >= 9 && fr.colTop && o.partitions !== false) { // 一明兩暗: plank partitions 板壁 on the inner column lines close off the two side rooms, each with a doorway near the front
      const ph = fr.colTop - fr.top - .06, zf = -.2, zb = -D + .2, dz0 = -1.0, dz1 = -1.95; b.s({ tex: 'plank', col: [.7, .58, .47] });
      for (const x of [xs[1], xs[2]]) { const xi = x; for (const [z0, z1] of [[zb, dz1], [dz0, zf]]) { if (z0 >= z1) continue; const p = F.p(xi, 0, lz + (z0 + z1) / 2); b.T(p[0], ly, p[2], 0, F.yaw, 0).box(0, ph / 2, 0, .08, ph, z1 - z0, { world: 1.2, skip: ['bot'] }).pop(); L.world.box(p[0], ly + ph / 2, p[2], .04, ph / 2, (z1 - z0) / 2, { yaw: F.yaw, surface: 'wood' }); }
        const p = F.p(xi, 0, lz + (dz0 + dz1) / 2); b.T(p[0], ly, p[2], 0, F.yaw, 0).box(0, (2.1 + ph) / 2, 0, .05, ph - 2.1, dz0 - dz1, { skip: ['bot'] }).pop(); } /* header 1.5 cm recessed: never coplanar with the boards */ b.s({ col: [1, 1, 1] });
      for (const [a, c] of [[-iw, xs[1] - .1], [xs[2] + .1, iw]]) { const rw2 = c - a; if (!(rw2 > 2.25 && bed((a + c) / 2, back + .7, 0, Math.min(2.05, rw2 - .15))) && rw2 > 1.5 && D > 5) bed((a + c) / 2, back + 1.1, PI / 2, Math.min(2.05, D - 3.2)); } } } // the two dark side rooms: the family's beds
  else if (kind === 'room' || kind === 'tavern') { // 廂 / guest rooms: a sleeping 榻 with its mat; tavern: drinking 榻 along the walls
    if (kind === 'tavern') { for (const s of [-1, 1]) ta(s * (iw - .6), -D * .5, 1.6, 1.1, PI / 2, s > 0); lamp(-sd * (iw - .3), -D * .45); }
    else { // 廂 / bedroom: bed(s) along the back wall, a chest, a clothes rack, a lamp; a second bed when there is room
      [sd, -sd].some(s => bed(s * (iw - 1.05), back + .6)) || [sd, -sd].some(s => bed(s * (iw - .62), back + 1.1, PI / 2, Math.min(2.05, D - 1.6))); chest(-sd * (iw - .6), back + .35, 0) || chest(sd * (iw - .6), back + .35, 0);
      if (W >= 8) for (let i = 0; i < xs.length - 1; i++) bed((xs[i] + xs[i + 1]) / 2, back + .6, 0, Math.min(2.05, xs[i + 1] - xs[i] - .25)); // a row of guest / family rooms: a bed in every bay
      if (W >= 5.6) bed(-sd * (iw - 1.05), back + .6 + (D > 4.4 ? 1.3 : 0)) || bed(0, back + .6);
      rack(sd * (iw - .75), back + .68 + 1.25, 0) || rack(-sd * (iw - .3), -D * .5, PI / 2); lamp(-sd * (iw - .3), -D * .45);
      sleepers(2); } }
  else if (kind === 'hut') { // poor home: an earthen sleeping platform (or a mat on the floor), a hearth, jars, a chest, tools
    [sd, -sd].some(s => bed(s * (iw - 1.05), back + .74, 0, Math.min(2.1, W - .8), 1.4, true)) || [sd, -sd].some(s => bed(s * (iw - .75), back + 1.1, PI / 2, Math.min(2, D - 1.4), 1.4, true));
    if (put(-sd * (iw - .5), back + 1.05, PI / 2, b2 => b2.s({ tex: 'mat', col: [.9, .84, .66] }).box(0, .012, 0, 1.8, .024, .8, { uv: [2, 1] }), [1.8, .8])) spot('bed', -sd * (iw - .5), back + 1.05, PI / 2, .05, [-1, 0]); // a second sleeper on a floor mat
    [[0, -D * .45], [-sd * (iw - .6), -D * .55], [sd * (iw - .6), -D * .55], [-sd * (iw - .6), back + .6], [sd * (iw - .6), back + .6], [0, back + .6]].some(([x, z]) => hearth(x, z)); jar(sd * (iw - .35), -D * .5, .7); chest(-sd * (iw - .6), back + .35, 0) || jar(-sd * (iw - .35), back + .35, .8); tools(sd * (iw - .4), -.75, PI / 2); sleepers(3); }
  else if (kind === 'study') { // 書房: a writing 案 on a mat with brush rest and scrolls, scroll racks against the walls, a 榻, a lamp
    put(0, back + 1.3, 0, b2 => { b2.s({ tex: 'mat', col: [.95, .88, .7] }).box(0, .012, 0, 2.2, .024, 1.6, { uv: [2, 2] }); b2.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, .34, 0, 1.4, .05, .6).box(-.6, .16, 0, .06, .32, .5, { skip: ['top', 'bot'] }).box(.6, .16, 0, .06, .32, .5, { skip: ['top', 'bot'] });
      b2.s({ tex: 'paper', col: [1, .97, .9] }).box(-.2, .375, 0, .5, .01, .32); b2.s({ tex: 'dark_wood' }).box(.35, .38, -.1, .2, .04, .04); }, [2.2, 1.6], .4) && spot('seat', 0, back + 1.95, 0, .05, [0, -1]);
    for (const s2 of [-1, 1]) put(s2 * (iw - .3), back + 1.4, PI / 2, b2 => { b2.s({ tex: 'dark_wood', col: [.8, .66, .52] }); for (const hy of [.02, .6, 1.2, 1.75]) b2.box(0, hy, 0, 1.6, .04, .4); for (const sx of [-.78, .78]) b2.box(sx, .9, 0, .04, 1.8, .4, { skip: ['bot'] });
      b2.s({ tex: 'paper', col: [.95, .9, .78] }); for (const hy of [.06, .64, 1.24]) for (let j = 0; j < 9; j++) b2.T(-.7 + j * .175, hy + .05, 0, PI / 2, 0, 0).lathe([[.045, -.17], [.045, .17]], { seg: 5 }).pop(); }, [1.65, .45], 1.8);
    ta(sd * (iw - 1.1), -D * .5, 1.8, 1.1, PI / 2); lamp(-sd * .9, back + .45); }
  else if (kind === 'shrine') { // 家廟: an altar table with the ancestors' tablets (神主) in a lacquer cabinet, offerings, lamps, mats for kneeling
    put(0, back + .55, 0, b2 => { b2.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .45, 0, 2.6, .9, .8, { skip: ['bot'] }); b2.s({ tex: 'lacquer_black' }).box(0, 1.25, -.12, 1.8, .7, .45); b2.s({ tex: 'gold', col: [1, .85, .5] }); for (let j = 0; j < 5; j++) b2.box(-.6 + j * .3, 1.2, .12, .16, .5, .04);
      b2.s({ tex: 'brass', col: [.8, .7, .5] }).T(0, .9, .25).lathe([[0, 0], [.12, 0], [.15, .1], [.1, .16], [0, .16]], { seg: 8 }).pop(); }, [2.6, .8], 1.6);
    lamp(-1.7, back + .5); lamp(1.7, back + .5); for (const x of [-.9, 0, .9]) put(x, back + 2.1, 0, b2 => b2.s({ tex: 'mat', col: [.9, .82, .6] }).box(0, .015, 0, .7, .03, .6), [.7, .6]) && spot('seat', x, back + 2.1, 0, .05, [0, -1]); }
  else if (kind === 'servants') { // 僕役房: floor mats in rows, bundles, a chest, a water jar
    for (let i = 0; i < 12; i++) { const x = -iw + 1.0 + (i % 6) * 1.0, z = back + .95 + ((i / 6) | 0) * 2.0; if (x > iw - .4) continue; if (put(x, z, PI / 2, b2 => { b2.s({ tex: 'mat', col: [.88, .8, .6] }).box(0, .012, 0, 1.8, .024, .78, { uv: [2, 1] }); b2.s({ tex: 'burlap', col: [.8, .74, .62] }).box(-.7, .06, 0, .3, .1, .5); }, [1.8, .8])) spot('bed', x, z, PI / 2, .05, [-1, 0]); }
    chest(-sd * (iw - .6), -D * .45, PI / 2) || jar(sd * (iw - .35), -D * .5, .8); jar(-sd * (iw - .35), back + .35, .8); }
  else if (kind === 'store') { // 庫 / shed / workshop: sacks, jars, tools; a loom in some
    sacks(sd * (iw - .75), back + .55, 5); jar(-sd * (iw - .35), back + .35, .9); jar(-sd * (iw - .35), back + 1.05, .75); tools(-sd * (iw - .4), -D * .55, PI / 2);
    if (W * D >= 11 && R() < .4) loom(0, back + 1.4); else sacks(sd * (iw - .75), back + 1.6, 3); }
  else if (kind === 'kitchen') { // 灶: a mud-brick stove with an iron pot, water jars, firewood
    put(sd * (iw - .75), back + .45, 0, b2 => { b2.s({ tex: 'mudbrick', col: [.95, .86, .76] }).box(0, .38, 0, 1.4, .76, .8, { world: 1 }); b2.s({ tex: 'iron', col: [.35, .33, .32] }).T(-.3, .76, 0).lathe([[0, -.12], [.26, -.06], [.3, .08], [.27, .1]], { seg: 9 }).pop(); b2.s({ tex: 'embers', col: [1.2, .55, .25], emi: .8, bone: o.lamp || 1 }).box(0, .22, .41, .3, .2, .02); }, [1.4, .8], .8);
    jar(-sd * (iw - .35), back + .35, .9); jar(-sd * (iw - .35), back + 1.05, .7);
    put(-sd * (iw - .4), -D * .6, PI / 2, b2 => { for (let j = 0; j < 9; j++) b2.s({ tex: 'wood', col: [.85, .72, .58] }).T((j % 3) * .2 - .2, .09 + (j / 3 | 0) * .17, 0, PI / 2, 0, 0).lathe([[.08, -.4], [.08, .4]], { seg: 5 }).pop(); }, [.8, .7], .5);
    spot('hearth', sd * (iw - .75), back + 1.45, 0, 0, [0, -1]); // the cook's place at the stove
    put(sd * (iw - .55), -D * .55, 0, b2 => { b2.s({ tex: 'stone', col: [.78, .75, .7] }).lathe([[0, .3], [.2, .3], [.24, .5], [.3, .52], [.3, 0], [0, 0]], { seg: 9 }); b2.s({ tex: 'wood', col: [.8, .68, .52] }).T(.05, .62, 0, 0, 0, .25).box(0, 0, 0, .07, .7, .07).pop(); }, [.65, .65], .55); } // 臼 mortar and pestle
  else if (kind === 'temple') { // 佛殿 / 天尊殿: the altar 須彌座 with the main image and its attendants (ARCH.image), offerings, lamps; the cleric's place before it
    const aw = Math.min(W * .42, 12), ad = Math.min(3.2, D * .3), clear = Math.max(1.5, (fr.colTop !== undefined ? fr.colTop - ly : 4) - 1.06 - .35), dao = !!o.dao, vr = (o.seed || 1) % 5;
    const main = dao ? 'tianzun' : (W >= 18 && vr === 1 ? 'maitreya' : 'buddha'), side = dao ? 'zhenren' : 'bodhi', sm = Math.min(clamp(aw / 4.2, 1, 2.6), clear / ARCH.IMG_H[main]), ss = Math.min(sm * .72, clear / ARCH.IMG_H[side]); // images fit under the ceiling
    put(0, back + ad / 2 + .1, 0, b2 => { b2.s({ tex: 'stone', col: [.85, .8, .72] }).box(0, .15, 0, aw, .3, ad).box(0, .62, 0, aw - .3, .64, ad - .3); b2.s({ tex: 'vermilion', col: [1, 1, 1] }).box(0, 1.0, 0, aw, .12, ad);
      b2.T(0, 1.06, -.15, 0, 0, 0, sm); ARCH.image(b2, main, vr); b2.pop();
      if (aw >= 5.5) for (const sx of [-1, 1]) { b2.T(sx * Math.min(aw / 2 - .55 * ss, .95 * sm + .5 * ss + .2), 1.06, -.05, 0, -sx * .25, 0, ss); ARCH.image(b2, side, vr + (sx > 0 ? 1 : 0)); b2.pop(); } // the two attendants
      b2.s({ tex: 'brass', col: [.8, .7, .5] }).T(0, 1.06, ad / 2 - .25).lathe([[0, 0], [.14, 0], [.18, .14], [.12, .22], [0, .22]], { seg: 8 }).pop(); }, [aw, ad], 1.06);
    lamp(-aw / 2 - .5, back + ad / 2); lamp(aw / 2 + .5, back + ad / 2);
    if (L.meta) { const p = F.p(0, 0, lz + back + ad + 1.1); L.meta.spots.push({ x: p[0], y: ly, z: p[2], yaw: F.yaw, role: o.dao ? 'daoist' : 'monk', cls: o.cls ?? 3, anim: 'bow' }); } }
  if (kind === 'hall') sleepers(3); // a household sleeps in its hall and side rooms
  // ---- generative fill: after the room's anchors (beds, 榻, hearth…), more Tang furniture from a catalogue per room kind, against the walls
  // (facing into the room) and, in big rooms, a low table with sitting mats in the middle; door paths stay clear, beds and chests keep
  // ~0.7 m in front of them, nothing overlaps (put() rejects collisions). Mats give 'seat' spots on the floor for the residents.
  const FILL = { hall: ['cabinet', 'shelf', 'basket', 'stool', 'basin', 'jar', 'bundle'], rich: ['cabinet', 'qin', 'censer', 'mirror', 'shelf', 'stool', 'basin', 'cabinet'], room: ['mirror', 'cabinet', 'basin', 'basket', 'bundle', 'shelf', 'stool'],
    hut: ['basket', 'jar', 'bundle', 'firewood', 'basket', 'stool'], kitchen: ['shelf', 'jar', 'basket', 'firewood', 'jar'], servants: ['bundle', 'basket', 'basin'], store: ['basket', 'jar', 'shelf', 'bundle'], tavern: ['jar', 'shelf', 'jar', 'stool'], study: ['cabinet', 'censer', 'basin'] }[kind];
  if (FILL && !o.nofill && !ARCH.noFill) {
    const keep = (x, z, yaw, w, id, dd) => { const [ox, oz] = rot(yaw, 0, id / 2 + dd / 2 + .02); const hx = Math.abs(Math.cos(yaw)) > .5 ? w / 2 : dd / 2, hz = Math.abs(Math.cos(yaw)) > .5 ? dd / 2 : w / 2; placed.push([x + ox - hx, x + ox + hx, z + oz - hz, z + oz + hz]); }; // clear floor in front
    for (const p of placed.slice()) { const w2 = p[1] - p[0], d2 = p[3] - p[2]; if (w2 > 1.5 && d2 > .9 && d2 < 1.6 && p[2] < back + .2) placed.push([p[0], p[1], p[3], p[3] + .6]); } // in front of what stands at the back wall (beds, 榻)
    const cat = {
      cabinet: [1.0, .5, 1.25, b2 => { b2.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, .64, 0, 1.0, 1.2, .48, { skip: ['bot'] }); b2.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(-.25, .7, .245, .46, .95, .02).box(.25, .7, .245, .46, .95, .02); b2.s({ tex: 'brass', col: [1, 1, 1] }).box(0, .75, .26, .08, .1, .02); for (const sx of [-1, 1]) b2.s({ tex: 'lacquer_black' }).box(sx * .45, .03, 0, .08, .06, .46); }, .7],
      shelf: [1.2, .4, 1.5, b2 => { const r2 = RNG((o.seed || 1) + 31); b2.s({ tex: 'dark_wood', col: [.85, .72, .6] }); for (const sx of [-1, 1]) b2.box(sx * .57, .75, 0, .05, 1.5, .38, { skip: ['bot'] }); for (const hy of [.04, .5, .98, 1.45]) b2.box(0, hy, 0, 1.15, .035, .38);
        for (const hy of [.52, 1.0]) for (let i = 0; i < 4; i++) { if (r2() < .3) continue; b2.T(-.42 + i * .28, hy + .02, (r2() - .5) * .12); r2() < .6 ? PROPS.bowl(b2, .06 + r2() * .03, ['celadon', 'glaze', 'white'][(r2() * 3) | 0]) : PROPS.jar(b2, .3); b2.pop(); } }, .6],
      mirror: [.6, .45, .7, b2 => { b2.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, .1, 0, .55, .2, .4, { skip: ['bot'] }); b2.s({ tex: 'lacquer_red' }).box(-.12, .25, .05, .2, .1, .16); b2.s({ tex: 'dark_wood' }).box(.1, .36, -.08, .04, .5, .04); b2.s({ tex: 'bronze', col: [1.1, 1, .8] }).T(.1, .58, -.06, -.25, 0, 0).lathe([[0, 0], [.13, 0], [.13, .015], [0, .015]], { seg: 12 }).pop(); }, .6],
      basin: [.5, .5, .75, b2 => { b2.s({ tex: 'dark_wood', col: [.8, .68, .55] }); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; b2.T(Math.cos(a) * .17, .34, Math.sin(a) * .17, 0, -a, .12).box(0, 0, 0, .04, .68, .04).pop(); } b2.s({ tex: 'bronze', col: [1, .9, .7] }).T(0, .66, 0).lathe([[0, 0], [.16, .02], [.22, .1], [.23, .11]], { seg: 10 }).pop(); }, .5],
      basket: [.55, .55, .35, b2 => { PROPS.basket(b2, .25, .3); }, 0],
      bundle: [.6, .5, .35, b2 => { PROPS.bundle(b2, .9, (o.seed || 1) + 7); }, 0],
      firewood: [.8, .7, .5, b2 => { for (let j = 0; j < 9; j++) b2.s({ tex: 'wood', col: [.85, .72, .58] }).T((j % 3) * .2 - .2, .065 + (j / 3 | 0) * .17, 0, PI / 2, 0, 0).lathe([[.08, -.4], [.08, .4]], { seg: 5 }).pop(); }, 0],
      jar: [.6, .6, .65, b2 => { PROPS.jar(b2, .75); }, 0],
      stool: [.5, .45, .45, b2 => { b2.s({ tex: 'dark_wood', col: [.85, .7, .55] }); for (const sd2 of [-1, 1]) b2.T(0, .21, 0, 0, 0, sd2 * .6).box(0, 0, -.16, .03, .5, .03).box(0, 0, .16, .03, .5, .03).pop(); b2.s({ tex: 'burlap', col: [.7, .6, .48] }).box(0, .42, 0, .34, .02, .38); }, 0], // 胡床 folding stool
      qin: [1.4, .5, .45, b2 => { b2.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, .3, 0, 1.35, .05, .45, { skip: ['bot'] }); for (const sx of [-1, 1]) b2.box(sx * .6, .14, 0, .06, .28, .4, { skip: ['top', 'bot'] }); b2.s({ tex: 'lacquer_black', col: [.6, .45, .35] }).box(0, .35, 0, 1.2, .05, .18); }, .7], // 琴 on its table
      censer: [.5, .5, .9, b2 => { b2.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .3, 0, .45, .6, .45, { skip: ['bot'] }); b2.T(0, .6, 0); PROPS.incenseBurner(b2, .5, .4); b2.pop(); }, 0],
    };
    // a low 案 with sitting mats 茵 around it, in the middle of a big room
    if (W * D >= 18 && /hall|rich|room|tavern|study/.test(kind) && !paths.some(p => p[0] < .8 && p[1] > -.8 && p[2] < -D * .45)) { const cz = -D * .52, tw = Math.min(1.3, W * .22);
      if (put(0, cz, 0, b2 => { b2.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .32, 0, tw, .04, .55); for (const sx of [-1, 1]) b2.box(sx * (tw / 2 - .08), .15, 0, .05, .3, .45, { skip: ['top', 'bot'] }); const r2 = RNG((o.seed || 1) + 3); for (let i = 0; i < 3; i++) { b2.T((i - 1) * tw * .28, .34, (r2() - .5) * .2); PROPS.bowl(b2, .05 + r2() * .03, r2() < .5 ? 'celadon' : 'glaze'); b2.pop(); } }, [tw, .55], .36))
        for (const [mx, mz, my] of [[0, -.7, 0], [0, .7, PI], [-(tw / 2 + .5), 0, -PI / 2], [tw / 2 + .5, 0, PI / 2]]) { if (put(mx, cz + mz, my, b2 => b2.s({ tex: 'silk', col: [[.62, .3, .25], [.3, .38, .55], [.7, .6, .35]][((o.seed || 1) + mx * 3 | 0) & 1] }).box(0, .03, 0, .62, .06, .62, { skip: ['bot'] }), [.62, .62])) { const l = Math.hypot(mx, mz) || 1; spot('seat', mx, cz + mz, 0, .06, [-mx / l, -mz / l]); } } }
    const RR = RNG((o.seed || 1) * 31 + 7), list = FILL.slice(), want = clamp(Math.round(W * D / 6.5), 1, kind === 'hut' || kind === 'servants' ? 4 : 8); let n = 0;
    for (let k = 0; k < list.length * 3 && n < want; k++) { const name = list[k % list.length], it = cat[name]; if (!it) continue; const [w, dd, h, fn, clr] = it;
      for (let t = 0; t < 8; t++) { const wall = (RR() * 4) | 0, u = RR() * 2 - 1; let x, z, yaw;
        if (wall === 0) { yaw = 0; z = back + dd / 2; x = u * (iw - w / 2); } else if (wall === 1) { yaw = PI / 2; x = -iw + dd / 2; z = back + (u * .5 + .5) * (D - .9); } else if (wall === 2) { yaw = -PI / 2; x = iw - dd / 2; z = back + (u * .5 + .5) * (D - .9); } else { yaw = PI; z = -.27 - dd / 2; x = u * (iw - w / 2); }
        if (put(x, z, yaw, fn, [w, dd], h > .2 ? h : 0)) { if (clr) keep(x, z, yaw, w, dd, clr); n++; break; } } } }
  // a standing place on clear floor (staff): the free point nearest the middle of the room
  const freeAt = () => { let best = null, bd = 1e9; for (let gx = -iw + .4; gx <= iw - .4; gx += .3) for (let gz = back + .4; gz <= -.5; gz += .3) { if (hit(gx - .25, gx + .25, gz - .25, gz + .25)) continue; const d = gx * gx + (gz + D / 2) ** 2; if (d < bd) { bd = d; best = [gx, gz]; } } return best; };
  if (!placed.length) { chest(sd * (iw - .6), back + .35, 0) || chest(-sd * (iw - .6), back + .35, 0); jar(-sd * (iw - .35), back + .35, .8); jar(sd * (iw - .35), -D * .5, .7); lamp(-sd * (iw - .3), -D * .45); } // small rooms and passages: at least a chest, jars and a lamp
  if (kind === 'tavern' && L.meta) { const fa = freeAt(); if (fa) { const p = F.p(fa[0], 0, lz + fa[1]); L.meta.spots.push({ x: p[0], y: ly, z: p[2], yaw: F.yaw + PI, role: 'waiter', cls: o.cls ?? 2, anim: 'serve' }); } // on clear floor, never on a bed or mat
    const ci = (fr.front || []).indexOf('counter'); if (ci >= 0 && xs[ci + 1] !== undefined) { const q = F.p((xs[ci] + xs[ci + 1]) / 2, 0, lz - 1.3); L.meta.spots.push({ x: q[0], y: ly, z: q[2], yaw: F.yaw + PI, role: 'keeper', cls: o.cls ?? 2, anim: 'stand' }); } } // the innkeeper behind the counter
  if (o.lit && !(fr.frame.lights || []).length) { const p = F.p(0, 0, lz - D * .5); const l = L.light(p[0], ly + 1.9, p[2], Math.max(3.5, Math.min(6, W * .5)), [1.2, .66, .32], { flicker: .1 }); l.group = o.lamp || 1; }
  if (Array.isArray(ARCH._goodsLog)) ARCH._goodsLog.push({ F, lx: 0, ly, lz, W, D, apron: 0, g0, g1: b.I.length / 3, paths, items, tops, trade: 'furnish:' + kind });
};
// 幌子: the trade's hanging sign object, on a short arm out from the eave post (Tang: objects, cloth flags; no carved signboards)
ARCH.hangSign = function (L, F, lx, ly, lz, trade, R) { if (ARCH.lod) return; const b = L.mb, p = F.p(lx, 0, lz + .1); b.T(p[0], ly, p[2], 0, F.yaw, 0); // 幌子: the trade's emblem on a bracket out of the wall
  b.s({ tex: 'dark_wood', col: [.7, .6, .5] }).box(0, 2.75, .2625, .07, .07, 1.425).box(0, 2.6, -.17, .06, .3, .06); // arm (its inner end buried 10 cm in the facade: QA float check) + a knee brace against the wall
  const S = 1.35, top = 2.53; // everything hangs from a cord under the arm's outer end; S: readable at 10-20 m
  const H = { medicine: () => { b.s({ tex: 'straw', col: [.85, .68, .38] }).T(0, top, .85, 0, 0, 0, S).lathe([[0, -.58], [.17, -.51], [.18, -.38], [.08, -.25], [.12, -.14], [.06, -.03], [0, 0]], { seg: 8 }).pop(); }, // gourd 葫蘆
    cloth: () => { b.s({ tex: 'dark_wood' }).box(0, top - .02, .85, .5, .04, .04); for (let i = 0; i < 3; i++) b.s({ tex: 'silk', col: [[.85, .3, .3], [.35, .45, .75], [.9, .85, .6]][i] }).box(-.16 + i * .16, top - .04 - .65, .85, .13, 1.3, .02); }, // dyed strips from a rod
    silk: () => H.cloth(),
    pottery: () => { b.T(0, top - .72 * .4 * S, .85, 0, 0, 0, S); PROPS.jar(b, .4); b.pop(); },
    grain: () => { b.s({ tex: 'straw', col: [1, .85, .5] }).T(0, top, .85, 0, 0, 0, S).lathe([[0, -.5], [.1, -.42], [.13, -.22], [.03, 0]], { seg: 7 }).pop(); }, // a sheaf
    books: () => { b.s({ tex: 'dark_wood', col: [.75, .62, .5] }).box(0, top - .3 * S, .85, .26 * S, .6 * S, .04); b.s({ tex: 'paper', col: [.95, .9, .78] }).box(0, top - .3 * S, .85, .2 * S, .5 * S, .06); }, // a wooden tablet with a paper face
    butcher: () => { b.s({ tex: 'iron', col: [.45, .45, .5] }).box(0, top - .02, .85, .5, .04, .04); for (let i = 0; i < 3; i++) { const x = -.18 + i * .18; b.box(x, top - .14, .85, .025, .24, .025).box(x + .03, top - .27, .85, .07, .025, .025); } }, // a rack of hooks
    smith: () => { b.s({ tex: 'iron', col: [.5, .5, .55] }).T(0, top, .85, 0, 0, 0, S); const pts = []; for (let k = 0; k <= 8; k++) { const a = -PI * .15 + k / 8 * PI * 1.3; pts.push([Math.cos(a + PI) * .13, -.165 - Math.sin(a + PI) * .15, 0]); } b.tube(pts, { r: .025, seg: 5, steps: 1 }).pop(); }, // a horseshoe hung by its crown, opening down
    bakery: () => { b.s({ tex: 'straw', col: [.95, .8, .55] }).T(0, top - .26 * S, .85, PI / 2, 0, 0, S).lathe([[.2, -.03], [.26, -.03], [.26, .03], [.2, .03], [.2, -.03]], { seg: 12 }).pop(); b.s({ tex: 'sand', col: [1.1, .85, .55] }).T(0, top - .26 * S, .85, PI / 2, 0, 0, S).lathe([[0, -.02], [.18, -.015], [.17, .015], [0, .02]], { seg: 10 }).pop(); }, // a basket ring with a 胡餅
    rope: () => { b.s({ tex: 'rope', col: [.9, .8, .6] }).T(0, top - .2 * S, .85, PI / 2, 0, 0, S).lathe([[.08, -.04], [.2, -.04], [.2, .04], [.08, .04], [.08, -.04]], { seg: 10 }).pop(); },
    tea: () => { b.T(0, top - .72 * .32 * S, .85, 0, 0, 0, S); PROPS.jar(b, .32); b.pop(); }, // a small tea jar
    carpenter: () => { b.s({ tex: 'wood', col: [.85, .72, .55] }).box(0, top - .25, .85, .08, .5, .04).box(0, top - .52, .85, .4, .06, .05); }, // a square 曲尺
    dyer: () => H.cloth() }, hang = H[trade];
  if (hang) { b.s({ tex: 'rope', col: [.7, .6, .45] }).box(0, 2.625, .85, .015, .19, .015); hang(); }
  b.pop(); b.s({ col: [1, 1, 1] }); };
// lived-in dressing along a building's front, under the eaves: hanging garlic and herb bundles, baskets on pegs, a ladder,
// a rain jar at the corner, a broom, firewood stacked against the gable wall. fr = hall info; kind: 'poor'|'house'|'rich'|'shop'
ARCH.dress = function (L, fr, R, kind = 'house') {
  if (ARCH.lod || !fr || !fr.F) return; const F = fr.F, W = fr.W, D = fr.D, y = fr.top, ze = D / 2 + .32, b = L.mb, eh = Math.max(2.2, fr.colTop - fr.top - .25);
  const put = (key, fn, lx, ly, lz, yaw = 0, sol) => { const p = F.p(lx, 0, lz), g = L.world && L.world.ground ? L.world.ground(p[0], p[2], y + .05, .1).y : y, base = ly < .01 && g < y - .03 ? F.y : y; ARCH.stamp(L, key, fn, p[0], base + ly, p[2], F.yaw + yaw, 1, sol); }; // standing things beyond the platform's edge stand on the ground (QA float check)
  const n = kind === 'rich' ? 1 : 2 + (R() * 3 | 0);
  const ns = Math.max(1, Math.floor((W - 1.4) / 1.3)), used = new Set(); // distinct slots 1.3 m apart: two items never share a spot
  const DK = new Set(['door', 'opendoor', 'boardopen', 'portal', 'counter', 'open']), xs = fr.frame && fr.frame.xs, doorIv = fr.front && xs ? fr.front.map((k, i) => DK.has(k) && xs[i + 1] !== undefined ? [xs[i] - .35, xs[i + 1] + .35] : null).filter(Boolean) : [], inDoor = (x, r = .3) => doorIv.some(q => x + r > q[0] && x - r < q[1]); // never in front of a doorway or open bay
  for (let i = 0; i < n; i++) { const t = R(), si = (R() * ns) | 0, k = (R() * 6) | 0; if (used.has(si)) continue; const lx = -W / 2 + .7 + (si + .5) * (W - 1.4) / ns, endSlot = Math.abs(lx) > W / 2 - 1.6; if (inDoor(lx)) continue; if ((k >= 3) && !endSlot) continue; if (k <= 2 && fr.front && xs && fr.front.some((q, j) => q !== 'wall' && xs[j + 1] !== undefined && lx + .5 > xs[j] && lx - .5 < xs[j + 1])) continue; /* hung from a peg: only on a solid wall bay, never in a window (QA float check) */ used.add(si); // standing things (ladder, broom, stool) only at the ends, clear of doors
    if (k === 0) put('garlic', b2 => { b2.s({ tex: 'dark_wood', col: [.6, .5, .4] }).box(0, -.01, -.1, .04, .04, .24); b2.s({ tex: 'rope', col: [.8, .7, .5] }).box(0, -.35, 0, .02, .7, .02); for (let j = 0; j < 7; j++) b2.s({ tex: 'paper', col: [1, .97, .9] }).ell((j & 1 ? .05 : -.05), -.1 - j * .09, 0, .06, .055, .06, { seg: 5, ring: 3 }); }, lx, eh, D / 2 + .21); /* from a peg in the wall (QA float check) */
    else if (k === 1) put('herbs', b2 => { b2.s({ tex: 'dark_wood', col: [.6, .5, .4] }).box(.3, -.01, -.06, .76, .04, .16); for (let j = 0; j < 4; j++) { b2.s({ tex: 'rope', col: [.7, .6, .4] }).box(j * .2, -.12, 0, .015, .24, .015); b2.s({ tex: 'straw', col: [.55, .7, .35] }).T(j * .2, -.45, 0).lathe([[.02, .25], [.1, 0], [.04, -.15]], { seg: 5 }).pop(); } }, lx, eh, D / 2 + .21); /* from a peg in the wall (QA float check) */
    else if (k === 2) put('pegbasket', b2 => { b2.s({ tex: 'dark_wood' }).box(0, 0, -.06, .05, .05, .14); b2.T(0, -.32, .12); PROPS.basket(b2, .24, .3); b2.pop(); }, lx, 1.9, D / 2 + .2); /* hangs on its peg */
    else if (k === 3 && kind !== 'rich') put('ladder', b2 => { b2.s({ tex: 'bamboo', col: [.85, .75, .55] }); for (const sx of [-.22, .22]) b2.T(sx, 0, 0, -.28, 0, 0).tube([[0, 0, 0], [0, 3.3, 0]], { r: .035, seg: 5, steps: 1, cap: false }).pop(); for (let j = 1; j < 10; j++) b2.T(0, 0, 0, -.28, 0, 0).box(0, j * .32, 0, .44, .03, .03).pop(); }, lx, 0, ze + .55);
    else if (k === 4) put('broom', b2 => { b2.s({ tex: 'bamboo', col: [.8, .7, .5] }).T(0, 0, 0, -.12, 0, 0).tube([[0, .3, 0], [0, 1.5, 0]], { r: .02, seg: 4, steps: 1, cap: false }).pop(); b2.s({ tex: 'straw', col: [.8, .7, .5] }).T(0, 0, .04).lathe([[.02, .32], [.16, .02], [0, 0]], { seg: 6 }).pop(); }, lx, 0, D / 2 + .25);
    else put('stool' + (k & 1), b2 => { PROPS.stool(b2); }, lx, 0, ze + .4, t * 3); }
  if (R() < .7) { const sx = R() < .5 ? -1 : 1; put('rainjar', b2 => { PROPS.jar(b2, .75); b2.s({ tex: 'water', col: [.5, .55, .6] }).T(0, .545, 0).lathe([[0, 0], [.095, 0]], { seg: 8 }).pop(); /* the water in the jar's mouth, not above it */ }, sx * (W / 2 + .3), 0, ze + .45, R() * 3, [.7, .8, .7]); }
  if (kind !== 'rich' && R() < .75) { const sx = R() < .5 ? -1 : 1, nl = 3 + (R() * 3 | 0); put('wood' + nl, b2 => { for (let j = 0; j < nl * 4; j++) b2.s({ tex: 'wood', col: [.85, .72, .58] }).T((j % 4) * .2 - .3, .1 + (j >> 2) * .18, 0, PI / 2, 0, 0).lathe([[.09, -.45], [.09, .45]], { seg: 5 }).pop(); }, sx * (W / 2 + .45), 0, (R() - .5) * (D - 1.5), PI / 2, [1, .9, .9]); }
  if (kind === 'poor' && R() < .6) { const mx = (R() - .5) * (W - 2); if (!inDoor(mx, .75)) put('mats', b2 => { b2.s({ tex: 'mat', col: [1, .95, .85] }).T(0, .9, 0, .2, 0, 0).box(0, 0, 0, 1.4, 1.8, .03).pop(); }, mx, 0, D / 2 + .25); }
  void b; };
// LOD facade for plain-timber (unpainted) white-walled houses: dark posts and beams instead of red ochre
TEX.add('facade_lod_plain', (x, y) => { const n = qN(x, y, 8, 3, 520), post = x < 9 || x > 118, beam = y < 10 || (y > 104 && y < 112), win = x > 30 && x < 98 && y > 30 && y < 62, bar = win && ((x - 30) % 8) < 3, base = y > 112;
  if (post || beam) return shP([70, 52, 40], .8 + n * .3); if (base) return shP([110, 108, 104], .8 + n * .3); if (win) return bar ? [60, 44, 34] : [40, 32, 28]; return shP([212, 206, 192], .9 + (n - .5) * .15); });
// cheap baked contact darkening (AO) on a range of vertices already in world space: darker within h of the floor/ground (y0, or y1 for
// vertices standing on a raised floor), and on downward-facing surfaces (eave undersides, beam soffits). Emissive vertices are skipped.
ARCH.ao = (b, i0, y0, y1 = y0, o = {}) => { const P = b.P, N = b.N, C = b.C, h = o.h || .35, k = o.k || .68, kd = o.down || .78;
  for (let i = i0; i < b.nv; i++) { if (C[i * 4 + 3] > 0) continue; const y = P[i * 3 + 1], base = y >= y1 - .02 ? y1 : y0, dy = y - base; let f = 1;
    if (dy < h) f *= k + (1 - k) * Math.max(0, dy) / h; if (N[i * 3 + 1] < -.6) f *= kd; if (f < 1) { C[i * 4] *= f; C[i * 4 + 1] *= f; C[i * 4 + 2] *= f; } } };
{ const _hall = ARCH.hall; ARCH.hall = function (L, x, y, z, o = {}) { const i0 = L.mb.nv, r = _hall.apply(this, arguments); ARCH.ao(L.mb, i0, y, r && r.top !== undefined ? r.top : y); return r; }; }
{ const _wall = ARCH.wall; ARCH.wall = function (L, x0, z0, x1, z1, o = {}) { const i0 = L.mb.nv, r = _wall.apply(this, arguments); ARCH.ao(L.mb, i0, o.y || 0); return r; }; }
{ const _shop = ARCH.shop; ARCH.shop = function (L, x, y, z, o = {}) { const i0 = L.mb.nv, r = _shop.apply(this, arguments); ARCH.ao(L.mb, i0, y, r && r.top !== undefined ? r.top : y); return r; }; }
/* ---------- city wall and walkable city gate (春明門 type) — for the lead's walkable region at the east wall ----------
 TANG.cityWall(L, x0, z0, x1, z1, {full, h: 5.3, t: 10, y, outer: 1|-1}) rammed-earth 外郭城 wall: battered sides, brick-capped crenellated
   parapet 女牆 on the OUTER side (local +z of the run, or -z with outer:-1), low inner parapet, walkable top (collision boxes).
 ARCH.gateTower(L, x, y, z, {yaw, full: true, ...}) walkable gate: brick-faced gate block (w 34 x d 20, top at h 6.0 m) with 3 passages
   (timber 排叉柱 frames with trapezoid tops, studded leaves), a 5x2-bay timber tower with 平坐 and hip roof on top, short stairs from the
   wall top (5.3 m) up to the gate top at both ends, 馬道 ramps up the inner (city, local -z) face on both sides, guardhouses and hitching
   posts inside. Walls should end at x = ±w/2 (gate-local) on the gate's centre line. Returns {top, w, d, h, rampEnds}. */
ARCH.cityWall = function (L, x0, z0, x1, z1, o = {}) { // exposed as TANG.cityWall (city.js)
  if (o.outer === -1) [x0, z0, x1, z1] = [x1, z1, x0, z0];
  let gap = o.innerGap; const gz = typeof CITY !== 'undefined' && CITY.gatezone && CITY.gatezone.gate, L2 = Math.hypot(x1 - x0, z1 - z0) / 2; // the run's end at the gate block (w/2 = 17 m from the gate centre): open the low inner parapet onto the 馬道 landing
  if (!gap && gz) { if (Math.abs(Math.hypot(x0 - gz.x, z0 - gz.z) - 17) < 1.5) gap = [-L2 - 1, -L2 + 4.4]; else if (Math.abs(Math.hypot(x1 - gz.x, z1 - gz.z) - 17) < 1.5) gap = [L2 - 4.4, L2 + 1]; }
  ARCH.wall(L, x0, z0, x1, z1, { style: 'rammed', h: o.h || 5.3, t: o.t || 10, batter: o.batter ?? .1, parapet: true, y: o.y || 0, innerGap: gap });
  if (ARCH.lod || !o.full) return;
  // drain spouts through the parapet every ~24 m and putlog rows are in the texture; add spouts (outer side)
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, h = o.h || 5.3, t = o.t || 10, tt = Math.max(1, t - 2 * h * (o.batter ?? .1));
  for (let u = 12; u < len - 6; u += 24) { const px = x0 + ux * u - uz * (tt / 2 + .1), pz = z0 + uz * u + ux * (tt / 2 + .1); ARCH.stamp(L, 'spout', b => { b.s({ tex: 'roof_tile', col: [.8, .8, .82] }).box(0, 0, .25, .3, .14, .7); b.s({ tex: 'd_scorch', col: [.35, .3, .25] }).box(0, -.9, .02, .35, 1.6, .02); }, px, (o.y || 0) + h - .05, pz, Math.atan2(-uz, ux)); }
};
{ const _gt = ARCH.gateTower;
  ARCH.gateTower = function (L, x, y, z, o = {}) {
    if (!o.full || ARCH.lod) return _gt.apply(this, arguments);
    const w = o.w || 34, d = o.d || 20, h = o.h || 6, wallH = o.wallH || 5.3, F = ARCH.F(x, y, z, o.yaw || 0), b = L.mb;
    const r = _gt.call(this, L, x, y, z, Object.assign({ w, d, h, passages: 3, pw: 5.2, ph: 5.0, pier: 3.4, batter: .06, open: o.open ?? true, parapet: 'crenel', tablet: o.tablet === undefined ? null : o.tablet,
      tower: Object.assign({ bays: 5, dbays: 2, bayW: 5, dbayW: 4.6, colH: 4.6, platform: .9, pm: 1.2, platTex: 'plank', railing: true, railMat: 'red', roof: 'hip', brackets: 'full', paint: 'ochre', walls: 'white', windows: true, doorOpen: true, backDoor: true, tabletBack: true }, o.tower || {}) }, o));
    if (r.tower) ARCH.furnish(L, r.tower, 'hall', { seed: 815, lot: 'gate:' + Math.round(x) + ',' + Math.round(z), apron: .5 }); // the gate officers' hall
    const P = (lx, lz) => F.p(lx, 0, lz), stamp = (k, fn, lx, ly, lz, yaw = 0, sol) => { const p = P(lx, lz); ARCH.stamp(L, k, fn, p[0], y + ly, p[2], F.yaw + yaw, 1, sol); };
    const tw = w - .06 * h * 2;
    // stairs from the wall top up to the gate top, at both ends of the gate block on the centre line (walls meet the gate at x = ±w/2)
    if (h > wallH + .1) for (const sd of [-1, 1]) { const n = Math.ceil((h - wallH) / .18), rs = (h - wallH) / n; for (let k = 0; k < n; k++) { const top = wallH + rs * (k + 1), lx = sd * (tw / 2 + .2 + (n - 1 - k) * .36 + .18);
      b.s({ tex: 'brick', col: [.95, .93, .9] }); const p = P(lx, 0); b.T(p[0], y, p[2], 0, F.yaw, 0).box(0, (top - wallH) / 2 + wallH, 0, .36, top - wallH, 4, { world: 1, skip: ['bot'] }).pop(); ARCH.solid(L, F, lx, wallH, 0, .36, top - wallH, 4); } }
    // 馬道: two long ramps up the inner (city, -z) face of the wall on both sides of the gate, rising toward the gate
    const rampW = 4, rise = wallH, run = rise * 6, wT = o.wallT || 10, rz = -(wT / 2 - .7) - rampW / 2, ends = []; // hugging the wall's inner face, its inner edge tucked into the battered wall
    for (const sd of [-1, 1]) { const xa = sd * (w / 2 + 4), xb = sd * (w / 2 + 4 + run); // top end near the gate, foot away from it
      const pa = P(xa, rz), pb = P(xb, rz); ends.push(F.p(xb, 0, rz));
      b.s({ tex: 'pave_rect', col: [.92, .9, .86] }); const c = (lx, ly, lz) => { const p = F.p(lx, ly, lz); return [p[0], p[1], p[2]]; }, wn = (nx, ny, nz) => [F.c * nx + F.s * nz, ny, -F.s * nx + F.c * nz]; // normals to world (winding follows them)
      const zo = rz - rampW / 2, zi = -(Math.max(1, wT - 2 * wallH * .1)) / 2 - .01; // outer (city-side) edge; the wall top's inner edge
      ARCH.quad(b, c(xb, y + .02, zo), c(xb, y + .02, zi), c(xa, y + rise, zi), c(xa, y + rise, zo), [0, 1, 0], [rampW / 2, run / 2]); /* inner edge meets the wall top's edge at the head */
      b.s({ tex: 'rammed_earth', col: [1, 1, 1] }); ARCH.poly(b, [c(xb, y, zo), c(xa, y, zo), c(xa, y + rise, zo)], wn(0, 0, -1), p => [(p[0] + p[2]) / 3, -p[1] / 3]);
      { // landing 平台 at the top: from the ramp's head to the gate block, flush with the wall top (the low inner parapet is open here, ARCH.cityWall)
        const xg = sd * (w / 2 - .1), xm = (xa + xg) / 2, lw = Math.abs(xa - xg), zm = (zo + zi) / 2, dz = zi - zo, p = P(xm, zm);
        b.s({ tex: 'rammed_earth', col: [1, 1, 1] }).T(p[0], y, p[2], 0, F.yaw, 0).box(0, rise / 2, 0, lw, rise, dz, { world: 1.5, skip: ['bot', 'top', sd > 0 ? 'nx' : 'px', 'pz'] }).pop();
        b.s({ tex: 'pave_rect', col: [.92, .9, .86] }); ARCH.quad(b, c(xg, y + rise, zo), c(xg, y + rise, zi), c(xa, y + rise, zi), c(xa, y + rise, zo), [0, 1, 0], [dz / 2, lw / 2]);
        ARCH.solid(L, F, xm, 0, zm, lw, rise, dz); ARCH.railing(L, [c(xa, y + rise, zo + .15), c(xg, y + rise, zo + .15)], { mat: 'stone', h: .9 }); }
      b.s({ tex: 'brick' }); for (let k = 0; k < 2; k++) { const zz = rz - rampW / 2 - .15; ARCH.beam(b, ...(q => [q[0], q[2]])(P(xb, zz)), ...(q => [q[0], q[2]])(P(xa, zz)), y, .01, .3, 'brick'); } // curb line (below grade start)
      // collision: steps of 0.2 m rise along the ramp
      const n = Math.ceil(rise / .2); for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, top = rise * t1, lx = lerp(xb, xa, (t0 + t1) / 2); ARCH.solid(L, F, lx, 0, rz, Math.abs(xa - xb) / n + .02, top, rampW); }
      // a parapet on the open side of the ramp
      const pr = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pr.push(F.p(lerp(xb, xa, t), 0, rz - rampW / 2 + .15)); pr[k][1] = y + rise * t; } if (pr.length) ARCH.railing(L, pr.map(p => [p[0], p[1], p[2]]), { mat: 'stone', h: .9 }); }
    // guardhouses 門衛 and hitching posts inside the gate, a watch drum
    for (const sd of [-1, 1]) { const g = P(sd * (w / 2 - 4), -d / 2 - 9); ARCH.furnish(L, ARCH.hall(L, g[0], y, g[2], { yaw: F.yaw + PI, bays: 2, dbays: 1, bayW: 3.2, dbayW: 4, colH: 3, platform: .4, pm: .4, brackets: 'none', paint: 'ochre', walls: 'white', roof: 'gable', door: [0], doorOpen: true, windows: true }), 'room', { seed: 31 + sd, lot: 'gate:' + Math.round(x) + ',' + Math.round(z), apron: .5 });
      for (let k = 0; k < 3; k++) stamp('hitch', b2 => { b2.s({ tex: 'dark_wood', col: [.7, .62, .55] }).box(0, .65, 0, .2, 1.3, .2); b2.s({ tex: 'iron', col: [.6, .6, .6] }).T(0, 1.05, .12, PI / 2, 0, 0).lathe([[.07, -.012], [.09, 0], [.07, .012], [.05, 0], [.07, -.012]], { seg: 6 }).pop(); }, sd * (w / 2 - 9 - k * 2.2), 0, -d / 2 - 4.5, 0, [.25, 1.3, .25]); }
    stamp('gdrum', b2 => PROPS.drum(b2, 1), 6, 0, -d / 2 - 2.5, 0, [1.3, 1.6, 1]);
    return Object.assign(r || {}, { w, d, h, wallH, rampEnds: ends });
  };
}
// 樓 two-storey building: platform, ground storey (walls, simple brackets), pent eaves 腰簷 front and back, a 平坐 balcony floor on a row of
// brackets with a railing all round, upper storey with windows and a 歇山 / hip roof. o: {yaw, bays, dbays, bayW, dbayW, colH1, colH2, platform,
// roof, paint, tiles, glow, fish, door}. Returns {F, W, D, top, ridge}. Rare in 815 (大曆 edict against overlooking neighbours): wine houses 旗亭,
// temple bell/sutra towers, a few mansion 藏書樓 / 閣.
ARCH.lou = function (L, x, y, z, o = {}) {
  L.mb.s({ col: [1, 1, 1], emi: 0 }); const b = L.mb, F = ARCH.F(x, y, z, o.yaw || 0), nb = o.bays || 3, nd = o.dbays || 2, bw = Array(nb).fill(o.bayW || 3.6), dw = Array(nd).fill(o.dbayW || 3.4);
  const W = nb * (o.bayW || 3.6), D = nd * (o.dbayW || 3.4), ph = o.platform ?? .6, pm = .6, h1 = o.colH1 || 3.4, h2 = o.colH2 || 3.0, paint = o.paint || 'ochre', i0 = b.nv;
  if (ph > .05) { b.T(x, y, z, 0, F.yaw, 0); ARCH.box(b, 0, 0, 0, W + 2 * pm, ph, D + 2 * pm, 'brick', 1, { faces: { top: 'pave' }, skip: ['bot'] }); b.s({ tex: 'stone', col: [.95, .95, .93] }).box(0, .1, 0, W + 2 * pm + .08, .2, D + 2 * pm + .08, { world: 1, skip: ['bot', 'top'] }); b.pop(); ARCH.solid(L, F, 0, 0, 0, W + 2 * pm, ph, D + 2 * pm); ARCH._steps(L, F, 0, D / 2 + pm, 0, Math.min(3, W - 1), ph, {}); }
  const door = o.door ?? ((nb - 1) >> 1), front = bw.map((_, i) => i === door ? 'opendoor' : 'window');
  const lo = ARCH.frame(L, F, { bw, dw, y0: ph, colH: h1, brackets: 'simple', paint, walls: 'white', glow: o.glow, fill: { front, back: bw.map(() => 'window'), left: dw.map(() => 'wall'), right: dw.map(() => 'wall') }, seed: o.seed });
  if (o.furnish && lo) ARCH.furnish(L, { F, W, D, top: y + ph, colTop: y + ph + h1, frame: lo, front, back: bw.map(() => 'window') }, o.furnish, { seed: o.seed, lot: o.lot, wealth: o.wealth, lamp: o.lamp, apron: .5 }); // ground floor interior (its steps start .6 m out)
  const y2 = ph + h1 + .62, ext = .95; // 平坐 floor: on a band of brackets, projecting all round
  b.T(x, y, z, 0, F.yaw, 0);
  b.s({ tex: 'plank', col: [.62, .5, .42] }).box(0, y2 - .07, 0, W + 2 * ext, .14, D + 2 * ext, { world: 1.5 });
  b.s({ tex: paint === 'plain' ? 'dark_wood' : 'beam_ochre', col: [1, 1, 1] }).box(0, y2 - .31, 0, W + .5, .32, D + .5, { skip: ['top'] }); /* underside 2 cm below the 平坐 brackets' */
  b.T(0, ph + h1 - .02, D / 2 + .55); ARCH.roof(b, { type: 'shed', X: W / 2 + .5, Z: .62, H: .38, tiles: o.tiles, thick: .1, rolls: false }); b.pop(); // 腰簷 front (back below)
  b.pop();
  { b.T(x, y, z, 0, F.yaw + PI, 0).T(0, ph + h1 - .02, D / 2 + .55); ARCH.roof(b, { type: 'shed', X: W / 2 + .5, Z: .62, H: .38, tiles: o.tiles, thick: .1, rolls: false }); b.pop().pop(); }
  for (const [lx, lz, yaw] of [...bw.map((_, i) => [-W / 2 + i * (o.bayW || 3.6) + (o.bayW || 3.6) / 2, D / 2, 0]), ...bw.map((_, i) => [-W / 2 + i * (o.bayW || 3.6) + (o.bayW || 3.6) / 2, -D / 2, PI])]) { const p = F.p(lx, 0, lz); b.T(p[0], y + y2 - .6, p[2], 0, F.yaw + yaw, 0); ARCH.bracket(b, .62, { style: 'simple', tex: paint === 'plain' ? 'dark_wood' : 'paint_ochre' }); b.pop(); } // 平坐 brackets
  ARCH.solid(L, F, 0, y2 - .14, 0, W + 2 * ext, .14, D + 2 * ext, { surface: 'wood' });
  const e = W / 2 + ext - .12, f = D / 2 + ext - .12; ARCH.railing(L, [F.p(-e, y2, f), F.p(e, y2, f), F.p(e, y2, -f), F.p(-e, y2, -f)].map(p => [p[0], y + y2, p[2]]), { closed: true, mat: paint === 'plain' ? 'dark' : 'red', h: .95 });
  const up = ARCH.frame(L, F, { bw, dw, y0: y2, colH: h2, colBase: false, brackets: o.brackets || 'simple', paint, walls: 'white', roof: o.roof || 'xieshan', tiles: o.tiles, fish: o.fish, glow: o.glow, fill: { front: bw.map((_, i) => i === door ? 'opendoor' : 'window'), back: bw.map(() => 'window'), left: dw.map(() => 'window'), right: dw.map(() => 'window') }, seed: (o.seed || 0) + 7 });
  ARCH.ao(b, i0, y, y + ph);
  return { F, W, D, top: y + ph, colTop: y + ph + h1, ridge: y + up.ridge, door: F.p(0, 0, D / 2 + pm + 1.5) };
};
// ---------- round 12: multi-storey 樓 / 閣 with interior stairs (mansions), cover pieces for stealth ----------
// a straight wooden stair in frame F: its top edge at (lx, lz) on level ly + h, descending along local +z rotated by yaw; steps are solid (exactly w wide)
ARCH.stair = (L, F, lx, lz, yaw, w, h, ly = 0) => { const b = L.mb, n = Math.max(3, Math.round(h / .19)), r = h / n, g = .27, c = Math.cos(yaw), s = Math.sin(yaw);
  b.T(F.x, F.y + ly, F.z, 0, F.yaw, 0).T(lx, 0, lz, 0, yaw, 0); b.s({ tex: 'plank', col: [.72, .58, .46] });
  for (let k = 0; k < n; k++) { const top = h - k * r; b.box(0, top - .03, (k + .5) * g, w, .06, g + .01, { skip: ['bot'] }); b.box(0, top - r / 2 - .03, (k + 1) * g - .01, w, r - .06, .02, { skip: ['top', 'bot'] }); } // treads and risers
  b.s({ tex: 'dark_wood', col: [.7, .58, .48] }); for (const sd of [-1, 1]) { const x0 = sd * (w / 2 + .04); ARCH.poly(b, [[x0, h + .05, 0], [x0, h - .3, 0], [x0, -.05, n * g], [x0, .3, n * g]], [sd, 0, 0], p => [p[2] / 2, -p[1] / 2]); } // stringers
  b.pop().pop(); for (let k = 0; k < n; k++) { const top = h - k * r, zc = (k + .5) * g; ARCH.solid(L, F, lx + s * zc, ly, lz + c * zc, w, top, g, { yaw, surface: 'wood' }); }
  return { run: n * g, n }; };
// 樓 / 閣 of 2 or 3 storeys: every floor walkable (interior stairs along the back wall, alternating direction, deck holes over them), 平坐 balconies with
// railings, 腰簷 between storeys; o.furnish = [kind per floor]; returns { F, W, D, floors: [{ y, fr }], stairs: [{ x, z, y0, y1 }] (world), ridge }
ARCH.lou2 = function (L, x, y, z, o = {}) {
  if (ARCH.lod) { const r = ARCH.lou(L, x, y, z, Object.assign({}, o, { furnish: undefined })); return Object.assign(r, { floors: [], stairs: [] }); } // far levels: the plain 樓 mass
  L.mb.s({ col: [1, 1, 1], emi: 0 }); const b = L.mb, F = ARCH.F(x, y, z, o.yaw || 0), nb = Math.max(3, o.bays || 3), nd = Math.max(2, o.dbays || 2), BW = o.bayW || 3.6, DW = o.dbayW || 3.4, bw = Array(nb).fill(BW), dw = Array(nd).fill(DW);
  const W = nb * BW, D = nd * DW, ph = o.platform ?? .6, pm = .6, ns = clamp(o.storeys || 2, 2, 3), paint = o.paint || 'ochre', ext = .95, i0 = b.nv, door = o.door ?? ((nb - 1) >> 1), sw = .95;
  if (ph > .05) { b.T(x, y, z, 0, F.yaw, 0); ARCH.box(b, 0, 0, 0, W + 2 * pm, ph, D + 2 * pm, 'brick', 1, { faces: { top: 'pave' }, skip: ['bot'] }); b.s({ tex: 'stone', col: [.95, .95, .93] }).box(0, .1, 0, W + 2 * pm + .08, .2, D + 2 * pm + .08, { world: 1, skip: ['bot', 'top'] }); b.pop(); ARCH.solid(L, F, 0, 0, 0, W + 2 * pm, ph, D + 2 * pm); ARCH._steps(L, F, 0, D / 2 + pm, 0, Math.min(3, W - 1), ph, {}); if (o.backDoor) ARCH._steps(L, F, 0, -D / 2 - pm, PI, Math.min(3, W - 1), ph, {}); }
  const floors = [], stairs = []; let yb = ph;
  for (let k = 0; k < ns; k++) {
    const last = k === ns - 1, h = k ? (o.colH2 || 3.0) : (o.colH1 || 3.4), lower = k === 0;
    const front = bw.map((_, i) => i === door ? 'opendoor' : 'window'), back = bw.map((_, i) => lower && o.backDoor && i === door ? 'opendoor' : 'window');
    const fr = ARCH.frame(L, F, { bw, dw, y0: yb, colH: h, colBase: lower, brackets: last ? (o.brackets || 'simple') : 'simple', paint, walls: 'white', roof: last ? (o.roof || 'xieshan') : undefined, tiles: o.tiles, fish: o.fish, glow: o.glow, fill: { front, back, left: dw.map(() => lower ? 'wall' : 'window'), right: dw.map(() => lower ? 'wall' : 'window') }, seed: (o.seed || 0) + k * 7 });
    // the stair up from this floor (not from the top one): along the back wall, band alternating, top landing 1.4 m from the side wall
    let blk = []; const band = k % 2, zs = -D / 2 + .3 + band * (sw + .15), dir = k % 2 ? 1 : -1; // dir -1: rises toward -x (top at the left)
    if (!last) { const H = h + .62, n = Math.max(3, Math.round(H / .19)), run = n * .27, xt = dir * (W / 2 - 1.4), p = F.p(xt, 0, zs + sw / 2);
      ARCH.stair(L, F, xt, zs + sw / 2, dir < 0 ? PI / 2 : -PI / 2, sw, H, yb); blk.push([dir < 0 ? -W / 2 : Math.min(xt, xt - dir * run) - .1, dir < 0 ? Math.max(xt, xt - dir * run) + .1 : W / 2, zs - .3, zs + sw + .5]); /* the stair and its landing */
      const pb = F.p(xt - dir * run, 0, zs + sw / 2); stairs.push({ x: pb[0], z: pb[2], y0: y + yb, x1: p[0], z1: p[2], y1: y + yb + H, k }); }
    // floors above a stair arrive through a hole over the upper part of the stair below
    const hole = k > 0 ? floors[k - 1].hole : null; if (hole) blk.push([Math.min(hole[0], hole[4] < 0 ? -W / 2 : hole[0]) - .1, Math.max(hole[1], hole[4] > 0 ? W / 2 : hole[1]) + .1, hole[2] - .3, hole[3] + .5]); // the stair well and the landing at its top
    if (o.furnish && o.furnish[k] && fr) ARCH.furnish(L, { F, W, D, top: y + yb, colTop: y + yb + h, frame: fr, front, back }, o.furnish[k], { seed: (o.seed || 1) + k * 13, lot: o.lot, wealth: o.wealth, lamp: o.lamp, apron: lower ? .5 : .3, partitions: false, /* the stair crosses the column lines */ block: blk.map(q => [q[0], q[1], q[2] - D / 2, q[3] - D / 2]), room: (o.room || '') + ':' + k });
    floors.push({ y: y + yb, fr, hole: null, h });
    if (!last) { const y2 = yb + h + .62, xt = dir * (W / 2 - 1.4), H = h + .62, n = Math.max(3, Math.round(H / .19)), run = n * .27, hx0 = Math.min(xt, xt - dir * run * .7), hx1 = Math.max(xt, xt - dir * run * .7), hz0 = zs - .05, hz1 = zs + sw + .05;
      floors[k].hole = [hx0, hx1, hz0, hz1, dir];
      // the 平坐 deck with a hole over the stair: four planks around it (plank boxes and solids alike)
      const ex0 = -W / 2 - ext, ex1 = W / 2 + ext, ez0 = -D / 2 - ext, ez1 = D / 2 + ext, pieces = [[ex0, ex1, hz1, ez1], [ex0, ex1, ez0, hz0], [ex0, hx0, hz0, hz1], [hx1, ex1, hz0, hz1]];
      b.T(x, y, z, 0, F.yaw, 0); b.s({ tex: 'plank', col: [.62, .5, .42] }); for (const [a0, a1, c0, c1] of pieces) if (a1 - a0 > .05 && c1 - c0 > .05) b.box((a0 + a1) / 2, y2 - .07, (c0 + c1) / 2, a1 - a0, .14, c1 - c0, { world: 1.5 });
      { const bx = W / 2 + .25, bz = D / 2 + .25; b.s({ tex: paint === 'plain' ? 'dark_wood' : 'beam_ochre', col: [1, 1, 1] }); // the joist band under the deck (the ceiling of the room below): open over the stair well like the deck, its inner faces line the well
        for (const [a0, a1, c0, c1] of [[-bx, bx, hz1, bz], [-bx, bx, -bz, hz0], [-bx, hx0, hz0, hz1], [hx1, bx, hz0, hz1]]) if (a1 - a0 > .05 && c1 - c0 > .05) b.box((a0 + a1) / 2, y2 - .31, (c0 + c1) / 2, a1 - a0, .32, c1 - c0, { skip: ['top'] }); }
      b.T(0, yb + h - .02, D / 2 + .55); ARCH.roof(b, { type: 'shed', X: W / 2 + .5, Z: .62, H: .38, tiles: o.tiles, thick: .1, rolls: false }); b.pop(); b.pop(); // 腰簷 front
      { b.T(x, y, z, 0, F.yaw + PI, 0).T(0, yb + h - .02, D / 2 + .55); ARCH.roof(b, { type: 'shed', X: W / 2 + .5, Z: .62, H: .38, tiles: o.tiles, thick: .1, rolls: false }); b.pop().pop(); } // and back
      for (const [lx, lz, yaw] of [...bw.map((_, i) => [-W / 2 + i * BW + BW / 2, D / 2, 0]), ...bw.map((_, i) => [-W / 2 + i * BW + BW / 2, -D / 2, PI])]) { const p = F.p(lx, 0, lz); b.T(p[0], y + y2 - .6, p[2], 0, F.yaw + yaw, 0); ARCH.bracket(b, .62, { style: 'simple', tex: paint === 'plain' ? 'dark_wood' : 'paint_ochre' }); b.pop(); }
      for (const [a0, a1, c0, c1] of pieces) if (a1 - a0 > .05 && c1 - c0 > .05) ARCH.solid(L, F, (a0 + a1) / 2, y2 - .14, (c0 + c1) / 2, a1 - a0, .14, c1 - c0, { surface: 'wood' });
      const e = W / 2 + ext - .12, f = D / 2 + ext - .12, rm = paint === 'plain' ? 'dark' : 'red';
      if (k === 0 && o.extStair) { // an outside stair up the right flank to the 平坐 (a second way up): the railing opens where it arrives
        const n = Math.max(3, Math.round(y2 / .19)), run = n * .27, sx = W / 2 + ext + .55, zt = D / 2 + ext - run; ARCH.stair(L, F, sx, zt, 0, .95, y2, 0); const pt = F.p(sx, 0, zt + .14), pb = F.p(sx, 0, zt + run + .5), po = F.p(W / 2 + ext - .7, 0, zt + .14); stairs.push({ x: pb[0], z: pb[2], y0: y, x1: pt[0], z1: pt[2], y1: y + y2, k, outside: true, off: [po[0], po[2]] }); // off: step sideways onto the 平坐
        ARCH.railing(L, [F.p(e, y2, zt - .75), F.p(e, y2, -f), F.p(-e, y2, -f), F.p(-e, y2, f), F.p(e, y2, f), F.p(e, y2, zt + .75)].map(p => [p[0], y + y2, p[2]]), { mat: rm, h: .95 }); }
      else ARCH.railing(L, [F.p(-e, y2, f), F.p(e, y2, f), F.p(e, y2, -f), F.p(-e, y2, -f)].map(p => [p[0], y + y2, p[2]]), { closed: true, mat: rm, h: .95 });
      yb = y2; }
  }
  ARCH.ao(b, i0, y, y + ph);
  return { F, W, D, floors, stairs, top: y + ph, ridge: floors[floors.length - 1].fr ? y + floors[floors.length - 1].fr.ridge : y + yb + 6, door: F.p(0, 0, D / 2 + pm + 1.5) };
};
// cover for stealth (mansion courts and gardens): L.meta.cover entries { kind, x, z, r, h, conceal }
// ---- temple images (unit size: seat / ground at y 0, facing +z; cached per kind and variant; ARCH.IMG_H = overall height to scale them into a hall)
// buddha: seated in meditation (dhyāna) on a lotus throne over an octagonal 須彌座, flaming mandorla and head halo; maitreya: seated with pendant
// legs (倚坐, the colossal Tang Maitreya type); bodhi: standing bodhisattva with crown, jewellery, scarves, a slight sway, on a lotus;
// tianzun: Daoist 天尊 seated on a draped dais, 蓮花冠 crown, beard, 如意 sceptre, halo; zhenren: standing Daoist attendant with 笏. Tang images
// were gilded and painted (robes red / green / ochre, hair blue-black).
ARCH.IMG_H = { buddha: 2.25, maitreya: 2.6, bodhi: 2.32, tianzun: 1.85, zhenren: 2.26 };
ARCH.image = (b, kind, v = 0) => { v = v % 4; b.add(ARCH.cached('img_' + kind + v, m => ARCH._img(m, kind, v))); return b; };
ARCH._img = function (b, kind, v) {
  const robe = [[.62, .2, .16], [.32, .44, .36], [.7, .5, .26], [.55, .26, .3]][v], gild = [1.05, .86, .48], skinG = [1.1, .9, .55], hairC = [.32, .36, .55];
  const G = c => b.s({ tex: 'gold', col: c || gild }), RB = c => b.s({ tex: 'silk', col: c || robe }), LQ = c => b.s({ tex: 'lacquer_red', col: c || [1, 1, 1] });
  const disc = (x, y, z, r, sx = 1, sz = 1, th = .02) => { b.T(x, y, z, PI / 2, 0, 0, sx, 1, sz).lathe([[0, -th], [r, -th], [r, th], [0, th]], { seg: 22 }).pop(); };
  const flames = (x, y, z, r, n, sx = 1, sz = 1) => { for (let k = 0; k < n; k++) { const a = k / n * TAU; b.T(x + Math.cos(a) * r * sx, y + Math.sin(a) * r * sz, z, 0, 0, a - PI / 2).ell(0, .05, 0, .045, .09, .012, { seg: 5, ring: 3 }).pop(); } };
  const head = (y0h, crown) => { b.T(0, y0h, 0, 0, 0, 0, 1.35); headU(0, crown); b.pop(); }; // the head, a little larger than life against the body (as Tang images are)
  const headU = (y, crown) => { G(skinG); b.ell(0, y, .015, .125, .152, .125, { seg: 12, ring: 9 }); b.ell(0, y - .025, .128, .016, .03, .014, { seg: 5, ring: 4 }); // a full, calm face; a small straight nose
    for (const sx of [-1, 1]) b.ell(sx * .125, y - .035, -.005, .016, .068, .026, { seg: 5, ring: 4 }); // long earlobes
    b.s({ tex: 'lacquer_black', col: [.42, .3, .22] }); for (const sx of [-1, 1]) b.T(sx * .045, y + .005, .124, 0, 0, sx * -.12).box(0, 0, 0, .05, .006, .008).pop(); b.box(0, y - .072, .121, .042, .006, .008); // half-closed eyes (thin lowered lids), lips
    if (crown === 'usnisa') { b.s({ tex: 'lacquer_black', col: hairC }); b.ell(0, y + .075, -.03, .128, .1, .125, { seg: 12, ring: 6 }); b.ell(0, y + .17, -.03, .072, .068, .072, { seg: 9, ring: 6 }); G([1.2, .6, .3]); b.ell(0, y + .075, .12, .012, .012, .01, { seg: 5, ring: 3 }); } // curls cap, 肉髻, urna
    else if (crown === 'bodhi') { b.s({ tex: 'lacquer_black', col: hairC }); b.ell(0, y + .08, -.035, .126, .095, .122, { seg: 10, ring: 6 }); b.ell(0, y + .18, -.04, .06, .09, .06, { seg: 8, ring: 5 }); G(); for (const sx of [-1, 0, 1]) b.T(sx * .07, y + .13, .06 - Math.abs(sx) * .03, -.2, 0, sx * .3).box(0, .04, 0, .06, .1, .012).pop(); } // high topknot, three-plaque crown
    else { b.s({ tex: 'lacquer_black', col: [.2, .18, .2] }); b.ell(0, y + .08, -.035, .126, .095, .122, { seg: 10, ring: 6 }); G(); b.lathe([[.0, 0], [.07, 0], [.09, .06], [.06, .1], [0, .11]].map(([r, h]) => [r, y + .12 + h]), { seg: 8 }); // 蓮花冠 with a pin
      b.box(0, y + .18, 0, .22, .012, .012); b.s({ tex: 'lacquer_black', col: [.2, .18, .2] }); b.ell(0, y - .14, .07, .07, .08, .05, { seg: 7, ring: 5 }); b.tube([[0, y - .17, .09], [0, y - .3, .1]], { r: .03, seg: 5, steps: 1 }); } }; // beard
  const torso = (y0, w = 1, col) => { RB(col); b.T(0, 0, 0, 0, 0, 0, w, 1, .72).lathe([[0, y0], [.27, y0], [.3, y0 + .22], [.31, y0 + .48], [.27, y0 + .68], [.12, y0 + .76], [.07, y0 + .8], [0, y0 + .8]], { seg: 14 }).pop();
    G(skinG); b.ell(0, y0 + .58, .14, .2, .14, .06, { seg: 8, ring: 5 }); } // bare chest under the robe (gilt)
  const arm = (sx, sh, el, hd, col) => { RB(col); b.tube([sh, el], { r: .075, seg: 7, steps: 1 }); b.tube([el, hd], { r: .065, seg: 7, steps: 1 }); G(skinG); b.ell(hd[0], hd[1], hd[2], .05, .035, .07, { seg: 6, ring: 4 }); void sx; };
  const lotusSeat = (y0, r) => { LQ([.9, .55, .45]); b.lathe([[0, y0], [r * .7, y0], [r * .8, y0 + .06], [r * .62, y0 + .16], [r, y0 + .2], [r, y0 + .24], [0, y0 + .24]], { seg: 16 });
    G([1, .78, .45]); for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 14; k++) { const a = (k + ring * .5) / 14 * TAU, rr = r * (1 - ring * .12); b.T(Math.cos(a) * rr, y0 + .2 + ring * .03, Math.sin(a) * rr, 0, -a, 0).T(0, 0, 0, 0, 0, -.6).ell(0, .05, 0, .02, .1, .07, { seg: 5, ring: 4 }).pop().pop(); } };
  const sumeru = (y0, r, h) => { LQ(); b.lathe([[0, y0], [r, y0], [r, y0 + h * .2], [r * .8, y0 + h * .3], [r * .78, y0 + h * .7], [r * .95, y0 + h * .8], [r * .95, y0 + h], [0, y0 + h]], { seg: 8 }); G(); b.T(0, y0 + h * .5, 0).lathe([[r * .79, -.02], [r * .81, -.02], [r * .81, .02], [r * .79, .02]], { seg: 8 }).pop(); };
  if (kind === 'buddha' || kind === 'maitreya') {
    if (kind === 'buddha') { sumeru(0, .62, .42); lotusSeat(.42, .58); const y0 = .66;
      RB(); b.ell(0, y0 + .1, .1, .5, .13, .32, { seg: 14, ring: 7 }); b.ell(0, y0 + .02, .26, .44, .05, .12, { seg: 10, ring: 4 }); // crossed legs under the robe, the hem over the throne
      torso(y0 + .12); head(y0 + 1.05, 'usnisa'); RB([robe[0] * .8, robe[1] * .8, robe[2] * .8]); b.tube([[.24, y0 + .86, -.02], [.05, y0 + .55, .2], [-.24, y0 + .3, .14]], { r: .045, seg: 6, steps: 3 }); // the robe's fold over the left shoulder
      for (const sx of [-1, 1]) arm(sx, [sx * .28, y0 + .82, 0], [sx * .34, y0 + .5, .08], [sx * .08, y0 + .27, .24]); G(skinG); b.ell(0, y0 + .26, .25, .15, .035, .08, { seg: 8, ring: 4 }); // hands in the lap
      G([.95, .72, .38]); disc(0, y0 + 1.05, -.2, .3); flames(0, y0 + 1.05, -.21, .3, 14); disc(0, y0 + .55, -.28, .62, 1, 1.45, .015); flames(0, y0 + .55, -.29, .62, 22, 1, 1.45); }
    else { // 倚坐: on a square throne, legs pendant, feet on a lotus footrest; hands on the knees
      LQ(); b.box(0, .3, -.05, 1.0, .6, .7); G(); b.box(0, .6, -.05, 1.05, .04, .75); lotusSeat(0, .32); const y0 = .62;
      RB(); for (const sx of [-1, 1]) { b.tube([[sx * .14, y0 + .1, .0], [sx * .15, y0 + .1, .42]], { r: .1, seg: 8, steps: 1 }); b.tube([[sx * .15, y0 + .08, .42], [sx * .15, .28, .46]], { r: .085, seg: 8, steps: 1 }); G(skinG); b.ell(sx * .15, .25, .52, .06, .04, .1, { seg: 6, ring: 4 }); RB(); }
      b.lathe([[.0, .3], [.3, .32], [.32, y0 + .05], [0, y0 + .08]].map(([r, h]) => [r, h]), { seg: 12 }); // the robe hanging between the knees
      torso(y0 + .12); head(y0 + 1.05, 'usnisa'); for (const sx of [-1, 1]) arm(sx, [sx * .28, y0 + .82, 0], [sx * .32, y0 + .52, .12], [sx * .17, y0 + .2, .42]);
      G([.95, .72, .38]); disc(0, y0 + 1.05, -.2, .32); flames(0, y0 + 1.05, -.21, .32, 14); disc(0, y0 + .7, -.42, .75, 1, 1.5, .015); flames(0, y0 + .7, -.43, .75, 24, 1, 1.5); } }
  else if (kind === 'bodhi' || kind === 'zhenren') { const dao = kind === 'zhenren', hip = .95, sw = v & 1 ? .03 : -.03;
    if (dao) { LQ([.8, .5, .4]); b.box(0, .06, 0, .6, .12, .5); } else lotusSeat(0, .32); const y0 = dao ? .12 : .24;
    b.T(sw, 0, 0, 0, 0, -sw); RB(dao ? [.75, .72, .62] : robe); b.lathe([[0, y0], [.22, y0], [.24, y0 + .1], [.2, hip], [.16, hip + .05], [0, hip + .06]], { seg: 14 }); // skirt / robe to the waist

    b.T(0, hip - .78, 0); torso(.78, .85, dao ? [.75, .72, .62] : [robe[0] * 1.1, robe[1] * 1.1, robe[2] * 1.1]); b.pop(); head(hip + 1.0, dao ? 'guan' : 'bodhi'); // on the neck (the torso runs hip .. hip + .8)
    if (!dao) { G(); b.T(0, hip + .7, .1).lathe([[.17, -.01], [.19, -.01], [.19, .01], [.17, .01]], { seg: 12 }).pop(); RB([.85, .8, .62]); b.tube([[.2, hip + .55, .0], [.26, hip + .1, .1], [.18, y0 + .35, .14], [.26, y0 + .15, .05]], { r: .022, seg: 5, steps: 4 }); b.tube([[-.2, hip + .55, .0], [-.27, hip + .05, .1], [-.2, y0 + .4, .14], [-.28, y0 + .2, .05]], { r: .022, seg: 5, steps: 4 }); } // necklace, scarves
    arm(1, [.24, hip + .58, 0], [.3, hip + .3, .06], dao ? [.08, hip + .4, .2] : [.26, hip + .05, .1]); arm(-1, [-.24, hip + .58, 0], [-.3, hip + .32, .1], dao ? [-.08, hip + .4, .2] : [-.2, hip + .55, .16]);
    if (dao) { RB([.75, .72, .62]); for (const sx of [-1, 1]) b.ell(sx * .2, hip + .2, .17, .1, .2, .1, { seg: 8, ring: 5 }); } // the wide sleeves hanging from the forearms raised to the chest (the hands meet on the 笏)
    if (dao) { b.s({ tex: 'bone', col: [1, .95, .85] }); b.T(0, hip + .48, .24, -.4, 0, 0).box(0, 0, 0, .05, .32, .015).pop(); } else { G(); b.T(-.2, hip + .6, .18).lathe([[0, 0], [.03, 0], [.05, .06], [.02, .12], [.025, .16], [0, .16]], { seg: 7 }).pop(); } // 笏 / the vase of the bodhisattva
    b.pop(); G([.95, .72, .38]); disc(sw * 3, hip + .97, -.17, .26); if (!dao) flames(sw * 3, hip + .97, -.18, .26, 12); }
  else if (kind === 'tianzun') { // a draped square dais, seated cross-legged in a wide-sleeved robe, hands holding the 如意, crown, beard, halo
    LQ(); b.box(0, .2, 0, 1.2, .4, .9); RB([.5, .2, .18]); b.box(0, .36, .46, 1.24, .32, .02); G(); b.box(0, .42, 0, 1.25, .04, .95); const y0 = .44;
    RB(); b.ell(0, y0 + .12, .1, .52, .15, .34, { seg: 14, ring: 7 }); torso(y0 + .14, 1.05); for (const sx of [-1, 1]) { RB(); b.T(sx * .3, y0 + .55, .14, 0, 0, sx * .2).ell(0, -.15, 0, .12, .3, .18, { seg: 8, ring: 5 }).pop(); } // wide sleeves
    head(y0 + 1.07, 'guan'); G(skinG); b.ell(0, y0 + .38, .3, .13, .05, .07, { seg: 7, ring: 4 }); b.s({ tex: 'jade', col: [.8, 1, .85] }); b.T(0, y0 + .5, .32, .6, 0, 0).box(0, 0, 0, .05, .4, .03).ell(0, .2, .01, .065, .035, .05, { seg: 6, ring: 4 }).pop(); // hands with the 如意: shaft up and forward from the hands, the cloud-shaped head on its end
    G([.95, .72, .38]); disc(0, y0 + 1.06, -.22, .34); disc(0, y0 + .6, -.3, .6, 1, 1.3, .015); }
};
ARCH.cover = (L, kind, x, z, r, h, conceal) => { if (L.meta) (L.meta.cover || (L.meta.cover = [])).push({ kind, x, z, r, h, conceal }); };
// a clipped shrub / hedge blob you can crouch inside (no collision): lumpy ellipsoids in leaf colours; LOD1: one blob
ARCH.bush = (L, x, z, w, h, seed = 1, o = {}) => { const b = L.mb, R = RNG(seed), y = o.y || 0;
  if (ARCH.lod) { b.s({ tex: 'moss', col: [.45, .6, .35] }).ell(x, y + h * .45, z, w / 2, h * .45, w / 2, { seg: 6, ring: 3 }); return; }
  const n = 3 + ((R() * 3) | 0); for (let i = 0; i < n; i++) { const a = (i + R() * .5) / n * TAU, rr = w * (.1 + .14 * R()), s = .55 + R() * .3; /* distinct lobes (never two near-identical ellipsoids) */ b.s({ tex: 'moss', col: [.42 + R() * .12, .58 + R() * .12, .3 + R() * .08] }).ell(x + Math.cos(a) * rr, y + h * (.42 + R() * .1), z + Math.sin(a) * rr, w * s / 2, h * (.42 + R() * .1), w * s / 2, { seg: 8, ring: 5 }); }
  if (o.flowers) { b.s({ tex: 'silk', col: o.flowers }); for (let i = 0; i < 7; i++) { const a = R() * TAU, rr = w * .35 * R(); b.ell(x + Math.cos(a) * rr, y + h * (.75 + R() * .2), z + Math.sin(a) * rr, .09, .07, .09, { seg: 5, ring: 3 }); } } // 牡丹 blooms
  ARCH.cover(L, o.kind || 'bush', x, z, w / 2, h, true); };
// 怪石 standing rock / rockery 假山: lumpy stone (solid); rockery: a ring of rocks round a mound with a pass through it
ARCH.rock = (L, x, z, w, h, seed = 1, o = {}) => { const b = L.mb, R = RNG(seed), y = o.y || 0;
  b.s({ tex: 'boulder', col: [.78 + R() * .1, .76 + R() * .08, .72 + R() * .06] });
  if (ARCH.lod) b.ell(x, y + h / 2, z, w / 2, h / 2, w * .4, { seg: 5, ring: 3 }); else { let yy = y; const k = 2 + ((R() * 2) | 0); for (let i = 0; i < k; i++) { const hh = h / k * (1.1 + R() * .3), ww = w * (1 - i * .22) * (.8 + R() * .3); b.T(x + (R() - .5) * w * .2, yy + hh / 2, z + (R() - .5) * w * .2, (R() - .5) * .4, R() * TAU, (R() - .5) * .4).ell(0, 0, 0, ww / 2, hh / 2 + .05, ww * .38, { seg: 6, ring: 4 }).pop(); yy += hh * .8; } }
  if (L.world && L.world.cyl) L.world.cyl(x, z, y, y + h, w * .42, { surface: 'stone' }); ARCH.cover(L, o.kind || 'rock', x, z, w / 2, h, false); };
ARCH.rockery = (L, x, z, r, h, seed = 1, o = {}) => { const R = RNG(seed), n = Math.max(5, Math.round(r * 2.2)), gap = R() * TAU; // a hill of rocks with a walkable pass (a gap) through it
  for (let i = 0; i < n; i++) { const a = i / n * TAU; if (Math.abs(((a - gap + PI * 3) % TAU) - PI) < .5) continue; const rr = r * (.75 + R() * .25); ARCH.rock(L, x + Math.cos(a) * rr, z + Math.sin(a) * rr, 1.2 + R() * .9, h * (.6 + R() * .5), seed * 7 + i, { kind: 'rockery' }); }
  ARCH.rock(L, x + Math.cos(gap + PI) * r * .3, z + Math.sin(gap + PI) * r * .3, 1.8, h * 1.25, seed * 7 + 99, { kind: 'rockery' }); };
// 牡丹 bed: a low brick-edged bed with peony bushes
ARCH.peonyBed = (L, x, z, w, d, yaw, seed = 1) => { const b = L.mb, R = RNG(seed), F = ARCH.F(x, 0, z, yaw); b.T(x, 0, z, 0, yaw, 0); b.s({ tex: 'brick', col: [.85, .8, .75] }).box(0, .15, 0, w, .3, d, { skip: ['bot'], faces: { top: 'yard' } }); b.pop();
  if (ARCH.lod) return; const n = Math.max(2, Math.round(w / 1.1)); for (let i = 0; i < n; i++) { const p = F.p(-w / 2 + (i + .5) * w / n, 0, (R() - .5) * (d - .9)); ARCH.bush(L, p[0], p[2], .9 + R() * .3, .8 + R() * .3, seed + i, { y: .3, flowers: [[.95, .5, .6], [.98, .85, .9], [.8, .2, .3]][(R() * 3) | 0], kind: 'bush' }); } };
/* ---------- WALL NETWORK (round 6): walls as a graph with dedicated junction piers ----------
 ARCH.wallNet(L, segs, o): segs = [{x0, z0, x1, z1, style: 'courtyard'|'mud'|'board', h, t, y, coping, tiles, wcol}]. Endpoints are snapped
 (10 cm); an endpoint lying on another segment splits it (T); collinear chains of equal walls are merged. Every node of degree 1 (END),
 2 at an angle (L) or ≥ 3 (T / X) gets a pier 墩 a little wider than the walls, with a hipped (pyramidal) tiled cap whose eaves are level
 with the copings: the copings run under it to the pier centre, their ridges stop at the pier face, the bodies, base courses and posts stop
 at the pier faces. Collinear joints of different walls also get a pier. Returns {nodes, piers}. */
ARCH.wallPier = function (L, x, z, o = {}) { // o: {style, p (pier size), h, y, t, yaw, kind}
  const b = L.mb, st = o.style || 'courtyard', y = o.y || 0, h = o.h || 2.5, p = o.p || .6, yaw = o.yaw || 0;
  b.s({ col: [1, 1, 1], emi: 0 }).T(x, y, z, 0, yaw, 0);
  if (st === 'board') { b.s({ tex: 'dark_wood', col: [.62, .52, .44] }).box(0, (h + .2) / 2, 0, .3, h + .2, .3, { skip: ['bot'] }); b.box(0, h + .25, 0, .4, .1, .4); b.pop(); L.world.box(x, y + h / 2, z, .15, h / 2, .15, { yaw }); return; }
  const cop = o.coping !== false, ye = h + .14, yr = h + .46, ov = .38 + hash2(Math.round(x * 10), Math.round(z * 10), 542) * .05, a = p / 2 + ov, k = (p / 2) / a, apex = cop ? (yr + .02 - ye * k) / (1 - k) + .02 + hash2(Math.round(x * 10), Math.round(z * 10), 540) * .1 : 0; // seeded: neighbouring lots' caps never share a plane // apex high enough to cover the copings' ends
  const sof = ye - .07 - ((Math.round(x * 1.6) + Math.round(z * 1.6)) & 1 ? .035 : 0), /* neighbouring lots' piers (about .63 m apart) alternate: soffits never share a plane */ bodyTop = cop ? ye - .05 : h + .12, wt = st === 'mud' ? 'rammed_earth' : 'plaster', wc = st === 'mud' ? [1, 1, 1] : (o.wcol || [1.02, .91, .74]);
  if (!ARCH.lod) b.s({ tex: 'brick', col: [1, 1, 1] }).box(0, .225, 0, p + .06, .45, p + .06, { world: 1, skip: ['bot'] });
  b.s({ tex: wt, col: wc }).box(0, ARCH.lod ? bodyTop / 2 : (bodyTop + .45) / 2, 0, p, ARCH.lod ? bodyTop : bodyTop - .45, p, { world: 2, skip: ARCH.lod ? ['bot'] : ['bot', 'top'] });
  if (cop) { const tx = o.tiles === 'thatch' ? 'thatch' : 'roof_tile', T = [[a, a], [-a, a], [-a, -a], [a, -a]], ap = [0, apex, 0];
    for (let i = 0; i < 4; i++) { const c0 = T[i], c1 = T[(i + 1) % 4], n = [(c0[0] + c1[0]) / 2, a * .9, (c0[1] + c1[1]) / 2]; b.s({ tex: tx, col: [1, 1, 1] }); ARCH.poly(b, [[c0[0], ye, c0[1]], [c1[0], ye, c1[1]], ap], n, q => [(q[0] + q[2]) / 2, -q[1]]);
      if (!ARCH.lod) { b.s({ tex: tx === 'thatch' ? 'thatch' : 'tile_end' }); ARCH.quad(b, [c0[0], sof, c0[1]], [c1[0], sof, c1[1]], [c1[0], ye, c1[1]], [c0[0], ye, c0[1]], [n[0], 0, n[2]], [2 * a, 1]);
        if (tx !== 'thatch') { b.s({ tex: 'roof_ridge' }); ARCH.sweep(b, [[c0[0] * .97, ye + .05, c0[1] * .97], [c0[0] * .18, ye + .05 + (apex - ye) * .82, c0[1] * .18]], .12, .1, { uv: 1 }); } } } // hip ridges (stop short of the apex: the finial covers it)
    b.s({ tex: 'rafters', col: [.8, .8, .8] }); ARCH.poly(b, T.map(c => [c[0], sof, c[1]]), [0, -1, 0], q => [q[0], q[2]]); // soffit (height seeded: neighbours' soffits never share a plane)
    if (!ARCH.lod && tx !== 'thatch') b.s({ tex: 'roof_ridge', col: [1, 1, 1] }).T(0, apex, 0).lathe([[.12, 0], [.1, .12], [.04, .22], [0, .26]], { seg: 6 }).pop(); } // finial 寶頂
  else if (st === 'mud') b.s({ tex: 'rammed_earth', col: [.92, .9, .86] }).box(0, bodyTop + .04, 0, p + .1, .08, p + .1, { world: 1 });
  b.s({ col: [1, 1, 1] }); b.pop(); L.world.box(x, y + (bodyTop + .3) / 2, z, p / 2, (bodyTop + .3) / 2, p / 2, { yaw });
  return { p, ye, apex };
};
ARCH.wallNet = function (L, segs, o = {}) {
  const SN = .1, nodes = [], node = (x, z) => { for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < SN) return n; const n = { x, z, e: [] }; nodes.push(n); return n; };
  let S = segs.filter(s => Math.hypot(s.x1 - s.x0, s.z1 - s.z0) > .25).map(s => Object.assign({}, s)); // short stubs are kept (a dropped stub left a see-through gap beside gates); only slivers go
  // split at T points (an endpoint on another segment's interior)
  for (let pass = 0; pass < 3; pass++) { let changed = false; const pts = []; for (const s of S) pts.push([s.x0, s.z0], [s.x1, s.z1]);
    const out = []; for (const s of S) { const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len; const cuts = [];
      for (const [px, pz] of pts) { const t = (px - s.x0) * ux + (pz - s.z0) * uz, d = Math.abs(-(px - s.x0) * uz + (pz - s.z0) * ux); if (d < SN && t > .3 && t < len - .3 && !cuts.some(c => Math.abs(c - t) < .2)) cuts.push(t); }
      if (!cuts.length) { out.push(s); continue; } changed = true; cuts.sort((a, b) => a - b); let t0 = 0; for (const t of [...cuts, len]) { out.push(Object.assign({}, s, { x0: s.x0 + ux * t0, z0: s.z0 + uz * t0, x1: s.x0 + ux * t, z1: s.z0 + uz * t })); t0 = t; } }
    S = out; if (!changed) break; }
  for (const s of S) { s.n0 = node(s.x0, s.z0); s.n1 = node(s.x1, s.z1); s.x0 = s.n0.x; s.z0 = s.n0.z; s.x1 = s.n1.x; s.z1 = s.n1.z; s.n0.e.push(s); s.n1.e.push(s); }
  const same = (a, b) => a.style === b.style && Math.abs((a.h || 2.5) - (b.h || 2.5)) < .01 && Math.abs((a.t || .45) - (b.t || .45)) < .01 && a.coping === b.coping;
  const dir = s => { const l = Math.hypot(s.x1 - s.x0, s.z1 - s.z0); return [(s.x1 - s.x0) / l, (s.z1 - s.z0) / l]; };
  // merge collinear chains of equal walls through degree-2 nodes
  for (let guard = 0; guard < 500; guard++) { const n = nodes.find(n => n.e.length === 2 && !n.dead && (() => { const [a, b] = n.e, da = dir(a), db = dir(b); return Math.abs(da[0] * db[0] + da[1] * db[1]) > .999 && same(a, b); })()); if (!n) break;
    const [a, b] = n.e, fa = a.n0 === n ? a.n1 : a.n0, fb = b.n0 === n ? b.n1 : b.n0, m = Object.assign({}, a, { x0: fa.x, z0: fa.z, x1: fb.x, z1: fb.z, n0: fa, n1: fb });
    fa.e = fa.e.filter(e => e !== a).concat([m]); fb.e = fb.e.filter(e => e !== b).concat([m]); S = S.filter(e => e !== a && e !== b).concat([m]); n.e = []; n.dead = true; }
  // piers at every live node
  const piers = new Map();
  for (const n of nodes) { if (!n.e.length) continue; const tmax = Math.max(...n.e.map(s => s.t || .45)), hmax = Math.max(...n.e.map(s => s.h || 2.5)), s0 = n.e[0], d0 = dir(s0);
    const st = n.e.every(s => s.style === 'board') ? 'board' : n.e.some(s => s.style === 'courtyard') ? 'courtyard' : s0.style, p = st === 'board' ? .3 : tmax + .1;
    const kind = n.e.length === 1 ? 'end' : n.e.length === 2 ? 'L' : n.e.length === 3 ? 'T' : 'X';
    piers.set(n, { p, h: hmax, kind }); ARCH.wallPier(L, n.x, n.z, { style: st, p, h: hmax, y: s0.y || 0, yaw: Math.atan2(-d0[1], d0[0]), coping: n.e.some(s => s.coping !== false) && st !== 'board', tiles: s0.tiles, wcol: s0.wcol, kind }); }
  // segments between the piers: bodies stop at the pier faces, copings run under the caps, ridges stop at the pier faces
  for (const s of S) { const P0 = piers.get(s.n0), P1 = piers.get(s.n1); if (Math.hypot(s.x1 - s.x0, s.z1 - s.z0) < (P0 ? P0.p : 0) / 2 + (P1 ? P1.p : 0) / 2 + .02) continue; /* piers (nearly) touch: nothing between them */
    ARCH.wall(L, s.x0, s.z0, s.x1, s.z1, Object.assign({}, s.wall || {}, { style: s.style, h: s.h, t: s.t, y: s.y, coping: s.coping, tiles: s.tiles, wcol: s.wcol, b0: !!P0, b1: !!P1, bt0: P0 && P0.p, bt1: P1 && P1.p, rt0: P0 ? P0.p / 2 + .02 : undefined, rt1: P1 ? P1.p / 2 + .02 : undefined })); }
  return { nodes: nodes.filter(n => n.e.length), piers };
};
