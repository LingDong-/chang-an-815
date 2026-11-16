// city.js — EIGHT HUNDRED DRUMS: the city plan (outer wall, wards, streets, markets, palaces), ward layout (streets, lanes, lots),
// compound generation, chunk streaming with LOD, the far city, ground.
// World frame: metres, x east, y up, z south; origin = centre of the outer city on the axis of 朱雀大街.
'use strict';

// ---------------- small geometry helpers ----------------
const rect = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const rw = r => r.x1 - r.x0, rd = r => r.z1 - r.z0, rcx = r => (r.x0 + r.x1) / 2, rcz = r => (r.z0 + r.z1) / 2;
const inR = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
const hashS = (s, n = 0) => { let h = 2166136261 ^ n; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// a level builder compatible with the kit (ARCH/PROPS expect L.mb, L.fol, L.world, L.light, L.prop, L.box)
// the folder this file was loaded from (the engine/), so pages anywhere can start the build workers
const ENGINE_URL = typeof document !== 'undefined' && document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^/]*$/, '') : '';
function makeL(world) {
  const L = {
    mb: new MB(), fol: new MB(), terrs: [], lights: [], meta: { doors: [], spots: [] }, world: world || (typeof G !== 'undefined' && G.world) || new World(),
    box(x, y0, z, w, h, d, tex, o = {}) { const b = o.foliage ? L.fol : L.mb; b.s({ tex, col: o.col || [1, 1, 1], emi: o.emi || 0 }); b.T(x, y0 + h / 2, z, 0, o.yaw || 0, 0); b.box(0, 0, 0, w, h, d, { world: o.uv === undefined ? 2 : o.uv, faces: o.faces, skip: o.skip }); b.pop(); b.s({ emi: 0 });
      if (o.solid !== false) return L.world.box(x, y0 + h / 2, z, w / 2, h / 2, d / 2, { yaw: o.yaw || 0, surface: o.surface, tag: o.tag }); },
    prop(fn, x, y, z, o = {}) { if (ARCH.lod && !o.lod) return; const b = o.foliage ? L.fol : L.mb; b.T(x, y, z, o.rx || 0, o.yaw || 0, o.rz || 0, o.s || 1); (typeof fn === 'function' ? fn : (bb => bb.add(fn)))(b); b.pop(); b.s({ emi: 0, col: [1, 1, 1] });
      const s = o.s || 1; if (o.solid) { if (o.solid.r) L.world.cyl(x, z, y, y + o.solid.h * s, o.solid.r * s, { surface: o.surface }); else L.world.box(x, y + o.solid.h * s / 2, z, o.solid.w * s / 2, o.solid.h * s / 2, o.solid.d * s / 2, { yaw: o.yaw || 0, surface: o.surface }); } },
    light(x, y, z, r, c, o = {}) { const l = { x, y, z, r, c, i: 1, flicker: o.flicker || 0, base: 1 }; L.lights.push(l); return l; },
    // heightfield terrain; weights for the 4 layers go in the vertex colour (see engine FS terrain mode)
    terrain(o) {
      const nx = Math.round(o.w / o.cell), nz = Math.round(o.d / o.cell), H = new Float32Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = o.h(o.x0 + i * o.cell, o.z0 + j * o.cell);
      const t = { x0: o.x0, z0: o.z0, cell: o.cell, nx, nz, h: H }; if (!o.noCollide) L.world.terrain(t);
      const b = new MB(), uv = o.uv || 3;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = o.x0 + i * o.cell, z = o.z0 + j * o.cell, y = H[j * (nx + 1) + i];
        const hl = H[j * (nx + 1) + Math.max(i - 1, 0)], hr = H[j * (nx + 1) + Math.min(i + 1, nx)], hd = H[Math.max(j - 1, 0) * (nx + 1) + i], hu = H[Math.min(j + 1, nz) * (nx + 1) + i];
        const n = v3norm([hl - hr, 2 * o.cell, hd - hu]), w = o.wt ? o.wt(x, z, y, n) : [1, 0, 0, 0];
        b.col = [w[0], w[1], w[2]]; b.emi = w[3]; b.v(x, y, z, n[0], n[1], n[2], x / uv, z / uv);
      }
      b.emi = 0; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b2 = a + 1, c = a + nx + 1, d = c + 1; b.I.push(a, c, d, a, d, b2); }
      L.terrs.push({ b, layers: o.layers.map(n => TEX.id(n)) }); return t;
    },
  };
  return L;
}
// ---------------- ground classes (1 m raster per ward) ----------------
const GC = { OUT: 0, STREET: 1, LANE: 2, YARD: 3, PAVED: 4, GARDEN: 5, FIELD: 6, WALL: 7, BUILDING: 8, WATER: 9 };

// =====================================================================================
// WARD LAYOUT
// A ward descriptor: {name, r: rect (outer face of the ward wall), gates: 'four'|'ew', seed, profile, specials: [...]}
// Produces: streets [{r, kind}], lots [{r, front: 'n'|'s'|'e'|'w', type, wealth, seed}], wall segments, gate positions, trees, wells.
// =====================================================================================
// =====================================================================================
// CANALS (渠): 龍首渠 (from the 滻水, east: into the city near 通化門 → 崇仁 → 皇城; branches to 興慶宮's 龍池 and 大明宮's 太液池;
// and the branch past 春明門 through 道政坊 to the 東市 放生池/海池), 漕渠 (金光門 → 西市 pond), 清明渠 (south, near 安化門 → 皇城),
// 永安渠 (south-west → past 西市 → 禁苑), 黃渠 (south-east → 曲江池). Routes traced from 唐代長安圖 (ref/map2.jpg) against
// our ward grid; plausible, not surveyed. One algorithm for all: polylines → carved channel (CITY.height), stone-lined banks
// + water + willows in detail, water ribbons far away, culverts (street stays continuous) where a canal meets a street.
// =====================================================================================
const CANAL = {
  W: 5, D: 1.7, WL: -.55, // channel width, depth below street, water level
  lines: [
    { name: '龍首渠', w: 6, pts: [[8200, -1900], [6200, -1500], [5250, -1200], [5200, -2400], [5150, -2760]] },
    // through ward interiors, crossing streets briefly and squarely: 永嘉 → 安興 → (across the avenue) → 勝業 → 崇仁 → 皇城
    { name: '龍首渠', w: 5, pts: [[5150, -2760], [4860.5, -2650], [4400, -2520], [3800, -2400], [3640, -2380], [3000, -2200], [2900, -2050], [2890, -1830], [2700, -1806], [2000, -1806], [1600, -1802], [1440, -1790], [900, -1750]] }, // through 崇仁 along its free north strip (資聖寺 / 太原進奏院 stand south of it)
    { name: '龍首渠 (興慶宮)', w: 4, pts: [[4400, -2520], [4320, -1950], [4300, -1420]] },
    { name: '龍首渠 (大明宮)', w: 5, pts: [[5150, -2760], [5150, -4000], [4700, -4700], [2853, -5450], [2350, -5800]] },
    { name: '龍首渠 (東市)', w: 4.5, pts: [[5250, -1200], [5200, -760], [4860.5, -760], [4300, -748], [3761, -742], [3618, -740], [3470, -736]] },
    { name: '漕渠', w: 6, pts: [[-7600, -650], [-5600, -880], [-4860.5, -915], [-4150, -840], [-3760, -790], [-3618, -730], [-3420, -690]] },
    { name: '清明渠', w: 5, pts: [[-900, 6200], [-700, 4800], [-520, 4325.85], [-500, 3000], [-500, -990], [-520, -2000], [-560, -3000]] },
    { name: '永安渠', w: 5, pts: [[-2600, 6200], [-2050, 4800], [-1950, 4325.85], [-1950, 2000], [-1950, -990], [-1950, -4325.85], [-2100, -5600]] },
    { name: '黃渠', w: 5, pts: [[7600, 6400], [5600, 4900], [4860.5, 4150], [4300, 3800]] },
  ],
  segs: null, grid: null, G: 64, ponds: new Map(), bridges: [],
  // the drawn courses are coarse polylines (traced from 唐代長安圖); the built course rounds their corners (Chaikin) and meanders gently
  // (two sines, ~8 m inside the city, wider outside the walls, tapering to 0 at the ends). Branches start/end on the course of the
  // line they leave. Then resampled every ~6 m, with mitred normals at the joints (seamless banks and water).
  init() { if (this.segs) return; this.segs = []; this.grid = new Map(); const done = [], sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const close = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1), q = [a[0] + dx * t, a[1] + dz * t]; return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) }; };
    this.lines.forEach((l, li) => { let P = l.pts.map(p => p.slice());
      for (const e of [0, P.length - 1]) { let best = null, bd = 40; for (const C of done) for (let i = 0; i < C.length - 1; i++) { const c = close(P[e], C[i], C[i + 1]); if (c.d < bd) { bd = c.d; best = c.q; } } if (best) P[e] = best; }
      for (let it = 0; it < 4; it++) { const Q = [P[0]]; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; if (i > 0) Q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]); if (i < P.length - 2) Q.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } Q.push(P[P.length - 1]); P = Q; }
      const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); const Lt = cum[cum.length - 1], n = Math.max(1, Math.ceil(Lt / 6)), ph1 = li * 1.7 + .4, ph2 = li * 2.9 + 1.1, out = [];
      for (let j = 0, k = 0; j <= n; j++) { const sA = Lt * j / n; while (k < P.length - 2 && cum[k + 1] < sA) k++; const a = P[k], b = P[k + 1], sl = cum[k + 1] - cum[k] || 1, f = clamp((sA - cum[k]) / sl, 0, 1), x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f, ux = (b[0] - a[0]) / sl, uz = (b[1] - a[1]) / sl;
        const outside = Math.abs(x) > PLAN.W / 2 || Math.abs(z) > PLAN.H / 2, A = l.w * (outside ? 3.2 : 1.5), off = A * (.72 * Math.sin(sA / 115 * TAU + ph1) + .28 * Math.sin(sA / 41 * TAU + ph2)) * sm(0, 90, sA) * sm(0, 90, Lt - sA);
        out.push([x - uz * off, z + ux * off]); }
      l.path = out; done.push(out); const segs = [];
      for (let i = 0; i < out.length - 1; i++) { const [ax, az] = out[i], [bx, bz] = out[i + 1]; if (Math.hypot(bx - ax, bz - az) < .05) continue; const s = { ax, az, bx, bz, w: l.w, line: l }; segs.push(s); this.segs.push(s);
        const r = l.w / 2 + 4, G = this.G; for (let gx = Math.floor((Math.min(ax, bx) - r) / G); gx <= Math.floor((Math.max(ax, bx) + r) / G); gx++) for (let gz = Math.floor((Math.min(az, bz) - r) / G); gz <= Math.floor((Math.max(az, bz) + r) / G); gz++) {
          const k = gx * 100003 + gz; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(s); } }
      const nrm = s => { const L = Math.hypot(s.bx - s.ax, s.bz - s.az); return [-(s.bz - s.az) / L, (s.bx - s.ax) / L]; };
      if (segs.length) { segs[0].first = true; segs[segs.length - 1].last = true; } segs.forEach((s, i) => { const n = nrm(s); for (const [end, o] of [['m0', segs[i - 1]], ['m1', segs[i + 1]]]) { if (!o) { s[end] = [n[0], n[1], 1]; continue; } const m = nrm(o), ax = n[0] + m[0], az = n[1] + m[1], L = Math.hypot(ax, az) || 1, c = (ax / L) * n[0] + (az / L) * n[1]; s[end] = [ax / L, az / L, 1 / Math.max(.5, c)]; } }); }); },
  // a basin (the 東市 放生池): registered by the market layout, carved like the canals (rounded corners), lined and filled by COMP.pond
  pond(r) { this.ponds.set([r.x0, r.z0, r.x1, r.z1].map(v => v.toFixed(1)).join(','), r); },
  pondDepth(x, z) { for (const r of this.ponds.values()) { if (x < r.x0 - 1 || x > r.x1 + 1 || z < r.z0 - 1 || z > r.z1 + 1) continue; const cr = 6, I = 3, qx = Math.max(r.x0 + I + cr - x, 0, x - (r.x1 - I - cr)), qz = Math.max(r.z0 + I + cr - z, 0, z - (r.z1 - I - cr)), e = cr - Math.hypot(qx, qz); return e > 0 ? this.D : this.D * clamp(1 + e / .6, 0, 1); } return 0; },
  // inside the channel (incl. its coping) of a canal line other than `line`
  inOther(x, z, line) { const a = this.grid.get(Math.floor(x / this.G) * 100003 + Math.floor(z / this.G)); if (!a) return false; for (const s of a) { if (s.line === line) continue; const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz, tr = ((x - s.ax) * dx + (z - s.az) * dz) / L2, t = clamp(tr, 0, 1); if ((tr < 0 && s.first) || (tr > 1 && s.last)) continue; /* past the end of a line: a continuation, not a channel */ if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.w / 2 + .45) return true; } return false; },
  // signed distance info to the nearest canal: { d (to the centre line), w, t (along), s }
  near(x, z) { this.init(); const a = this.grid.get(Math.floor(x / this.G) * 100003 + Math.floor(z / this.G)); if (!a) return null; let best = null, bd = 1e9;
    for (const s of a) { const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz, t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1), px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; best = { d, w: s.w, s, t }; } } return best; },
  culvert: null, // set by CITY.setup: f(x, z) → true where a street or lane crosses (the street stays continuous over a culvert)
  depthAt(x, z) { if (this.ponds.size) { const p = this.pondDepth(x, z); if (p) return p; } const n = this.near(x, z); if (!n || n.d > n.w / 2 + .6) return 0; if (this.culvert && this.culvert(n.s.ax + (n.s.bx - n.s.ax) * n.t, n.s.az + (n.s.bz - n.s.az) * n.t)) return 0; /* underground or not is decided on the centre line, like the headwalls (per point on the 2 m ground raster the carve ended in steps past the headwall) */ const e = n.w / 2 - n.d; return e > 0 ? this.D : this.D * clamp(1 + e / .6, 0, 1); },
  // lots in a canal's path are dropped at layout time (nothing stands over the water)
  hits(r, pad = 2) { this.init(); const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hw = (r.x1 - r.x0) / 2 + pad, hd = (r.z1 - r.z0) / 2 + pad, G = this.G, seen = new Set();
    for (let gx = Math.floor((r.x0 - pad) / G); gx <= Math.floor((r.x1 + pad) / G); gx++) for (let gz = Math.floor((r.z0 - pad) / G); gz <= Math.floor((r.z1 + pad) / G); gz++) { const a = this.grid.get(gx * 100003 + gz); if (!a) continue;
      for (const s of a) { if (seen.has(s)) continue; seen.add(s); for (let t = 0; t <= 1.0001; t += 1 / Math.max(1, Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / 3))) { const x = s.ax + (s.bx - s.ax) * t, z = s.az + (s.bz - s.az) * t; if (Math.abs(x - cx) < hw + s.w / 2 && Math.abs(z - cz) < hd + s.w / 2) return true; } } }
    for (const p of this.ponds.values()) if (p.x0 < r.x1 + pad && p.x1 > r.x0 - pad && p.z0 < r.z1 + pad && p.z1 > r.z0 - pad && !(Math.abs(p.x0 - r.x0) < .2 && Math.abs(p.z0 - r.z0) < .2)) return true; return false; },
  // the basin's lined edge: a rounded rectangle 3 m inside the lot (corner radius 6), water at the canal level, willows round it
  basin(L, r, R) { const b = L.mb, I = 3, cr = 6, x0 = r.x0 + I, x1 = r.x1 - I, z0 = r.z0 + I, z1 = r.z1 - I, pts = [];
    for (const [cx, cz, a0] of [[x1 - cr, z0 + cr, -PI / 2], [x1 - cr, z1 - cr, 0], [x0 + cr, z1 - cr, PI / 2], [x0 + cr, z0 + cr, PI]]) for (let k = 0; k <= 4; k++) { const a = a0 + k / 4 * PI / 2; pts.push([cx + Math.cos(a) * cr, cz + Math.sin(a) * cr, -Math.cos(a), -Math.sin(a)]); }
    b.s({ tex: 'water', col: [.72, .84, .9], emi: .03 }); const wy = ARCH.lod ? .04 : this.WL; this.Q(b, [x0, wy, z0], [x1, wy, z0], [x1, wy, z1], [x0, wy, z1], [0, 1, 0], p => [p[0] / 6, p[2] / 6]); b.s({ emi: 0 });
    if (ARCH.lod) return; b.s({ tex: 'stone', col: [1.0, .98, .94] });
    // the lined edge, open where a canal comes in (its own banks run up to the edge, its water meets the basin's at the edge: QA tool/qa_water.js)
    this.init(); const mouths = this.segs.filter(sg => [sg.ax, sg.bx].some(x => x > r.x0 - 8 && x < r.x1 + 8) && [sg.az, sg.bz].some(z => z > r.z0 - 8 && z < r.z1 + 8));
    for (let i = 0; i < pts.length; i++) { const A = pts[i], B = pts[(i + 1) % pts.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < .05) continue; const ex = (B[0] - A[0]) / len, ez = (B[1] - A[1]) / len, cuts = [];
      for (const sg of mouths) { const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, den = ex * dz - ez * dx; if (Math.abs(den) < 1e-9) continue; const qx = sg.ax - A[0], qz = sg.az - A[1], u = (qx * dz - qz * dx) / den, v = (qx * ez - qz * ex) / den; if (u < -sg.w || u > len + sg.w || v < 0 || v > 1) continue;
        const sl = Math.hypot(dx, dz), sn = Math.abs(den) / sl, hw = (sg.w / 2) / Math.max(.3, sn); cuts.push([u - hw, u + hw]); }
      cuts.sort((p, q) => p[0] - q[0]); let u0 = 0; const runs = []; for (const [c0, c1] of cuts) { if (c0 > u0) runs.push([u0, Math.min(c0, len)]); u0 = Math.max(u0, c1); } if (u0 < len) runs.push([u0, len]);
      for (const [a0, a1] of runs) { if (a1 - a0 < .02) continue; const f0 = a0 / len, f1 = a1 / len, P0 = [A[0] + (B[0] - A[0]) * f0, A[1] + (B[1] - A[1]) * f0], P1 = [A[0] + (B[0] - A[0]) * f1, A[1] + (B[1] - A[1]) * f1], N0 = [lerp(A[2], B[2], f0), lerp(A[3], B[3], f0)], N1 = [lerp(A[2], B[2], f1), lerp(A[3], B[3], f1)];
        this.bank(b, P0, P1, N0, N1, this.D); const mx = (P0[0] + P1[0]) / 2, mz = (P0[1] + P1[1]) / 2, l = a1 - a0; L.world.box(mx - (N0[0] + N1[0]) / 2 * .2, .35, mz - (N0[1] + N1[1]) / 2 * .2, .2, .3, l / 2 + .1, { yaw: Math.atan2(ex, ez) }); } }
    for (let u = 0; u < 2 * (x1 - x0 + z1 - z0); u += 8 + R() * 5) { if (R() < .35) continue; const per = 2 * (x1 - x0) + 2 * (z1 - z0); let q = u % per, x, z; const W = x1 - x0, D2 = z1 - z0;
      if (q < W) { x = x0 + q; z = z0 - 2.2; } else if ((q -= W) < D2) { x = x1 + 2.2; z = z0 + q; } else if ((q -= D2) < W) { x = x1 - q; z = z1 + 2.2; } else { q -= W; x = x0 - 2.2; z = z1 - q; }
      if (x < r.x0 + .8 || x > r.x1 - .8 || z < r.z0 + .8 || z > r.z1 - .8) continue; TREES.place(L, x, 0, z, 'willow', .95 + R() * .3, (R() * 1e6) | 0); } },
  // a quad whose face is turned toward the normal n (whatever order the corners come in)
  Q(b, p0, p1, p2, p3, n, uv) { const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2], c = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const P = c >= 0 ? [p0, p1, p2, p3] : [p3, p2, p1, p0], I = P.map(p => b.v(p[0], p[1], p[2], n[0], n[1], n[2], ...uv(p))); b.quad(I[0], I[1], I[2], I[3]); },
  // a lined edge from (ax,az) to (bx,bz) with the channel on the side of normal (nx,nz) given per end (mitred): inner face, coping, outer lip
  bank(b, a0, a1, nA, nB, D) { const uvw = p => [(p[0] + p[2]) / 1.5, p[1] / 1.5], uvt = p => [p[0] / 1.5, p[2] / 1.5], yt = .06, cw = .45;
    const at = (a, n, o, y) => [a[0] - n[0] * o, y, a[1] - n[1] * o], nI = [(nA[0] + nB[0]) / 2, 0, (nA[1] + nB[1]) / 2];
    this.Q(b, at(a0, nA, 0, -D - .05), at(a1, nB, 0, -D - .05), at(a1, nB, 0, yt), at(a0, nA, 0, yt), nI, uvw);
    this.Q(b, at(a0, nA, 0, yt), at(a1, nB, 0, yt), at(a1, nB, cw, yt), at(a0, nA, cw, yt), [0, 1, 0], uvt);
    const yo = -Math.max(.8, D * .8); // the outer face runs well down into the ground (it stopped at -10 cm: wherever the carved bank or the street dipped, the hollow showed)
    this.Q(b, at(a0, nA, cw, yt), at(a1, nB, cw, yt), at(a1, nB, cw, yo), at(a0, nA, cw, yo), [-nI[0], 0, -nI[2]], uvw);
    for (const [a, n, sg] of [[a0, nA, -1], [a1, nB, 1]]) { const tx = a1[0] - a0[0], tz = a1[1] - a0[1], tl = Math.hypot(tx, tz) || 1, en = [sg * tx / tl, 0, sg * tz / tl]; // end caps: a bank that stops (culvert mouth, junction, basin) is a closed block of stone
      this.Q(b, at(a, n, 0, -D - .05), at(a, n, cw, -D - .05), at(a, n, cw, yt), at(a, n, 0, yt), en, p => [(p[0] + p[2]) / 1.5, p[1] / 1.5]); } },
  // detail for one piece of canal (segment s from t0 to t1): stone-lined banks, water, culvert parapets, willows (LOD0); water ribbon (LOD)
  piece(L, s, t0, t1, R) { const b = L.mb, dx = s.bx - s.ax, dz = s.bz - s.az, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux, w = s.w, hw = w / 2;
    const P = t => [s.ax + dx * t, s.az + dz * t], yaw = Math.atan2(ux, uz), seg = len * (t1 - t0), [cx, cz] = P((t0 + t1) / 2);
    const M = t => t <= 1e-6 ? s.m0 : t >= 1 - 1e-6 ? s.m1 : [nx, nz, 1], mA = M(t0), mB = M(t1), pA = P(t0), pB = P(t1), E = (p, m, o) => [p[0] + m[0] * o * m[2], p[1] + m[1] * o * m[2]];
    // water surface at the water level (in LOD a little above the coarse ground so it reads from afar)
    const wy = ARCH.lod ? .04 : this.WL, uvW = p => [p[0] / 6, p[2] / 6], wc = (p, m, o) => { const q = E(p, m, o); return [q[0], wy, q[1]]; };
    b.s({ tex: 'water', col: [.72, .84, .9], emi: .03 }); this.Q(b, wc(pA, mA, -hw + .05), wc(pB, mB, -hw + .05), wc(pB, mB, hw - .05), wc(pA, mA, hw - .05), [0, 1, 0], uvW); b.s({ emi: 0 });
    if (ARCH.lod) return;
    // stone lining on both banks (inner face from the bed to just above the street, coping, outer lip), mitred at the joints
    b.s({ tex: 'stone', col: [1.0, .98, .94] }); for (const sd of [-1, 1]) { const nA2 = [-mA[0] * sd, -mA[1] * sd], nB2 = [-mB[0] * sd, -mB[1] * sd]; // (pointing into the channel)
      { const a0 = E(pA, mA, sd * hw), a1 = E(pB, mB, sd * hw), nA3 = [nA2[0] * mA[2], nA2[1] * mA[2]], nB3 = [nB2[0] * mB[2], nB2[1] * mB[2]], bl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), ns = Math.max(1, Math.ceil(bl / .25)); let r0 = null; // no bank inside another canal's channel (where a branch leaves / joins: QA tool/qa_water.js)
        const at = f => [a0[0] + (a1[0] - a0[0]) * f, a0[1] + (a1[1] - a0[1]) * f], nn = f => [lerp(nA3[0], nB3[0], f), lerp(nA3[1], nB3[1], f)];
        for (let q = 0; q <= ns; q++) { const f = q / ns, p = at(f), inside = this.inOther(p[0], p[1], s.line); if (!inside && r0 === null) r0 = f; if ((inside || q === ns) && r0 !== null) { const f1 = inside ? (q - .5) / ns : 1; if (f1 - r0 > 1e-3) this.bank(b, at(r0), at(f1), nn(r0), nn(f1), this.D); r0 = null; } } }
      const ox = nx * sd * (hw + .2), oz = nz * sd * (hw + .2); L.world.box(cx + ox, .35, cz + oz, .2, .3, seg / 2 + .1, { yaw }); } // a low invisible kerb so you don't stroll into the water by accident
    for (let u = 0; u < seg; u += 9 + R() * 4) { if (R() < .45) continue; const sd = R() < .5 ? -1 : 1, t = t0 + (u / len), [px, pz] = P(t), qx = px + nx * sd * (hw + 1.6), qz = pz + nz * sd * (hw + 1.6);
      if (this.culvert && this.culvert(qx, qz)) continue; if (this.inOther(qx, qz, s.line)) continue; if ([GC.BUILDING, GC.PAVED, GC.WALL, GC.WATER].includes(CITY.groundAt(qx, qz))) continue; TREES.place(L, qx, 0, qz, 'willow', .9 + R() * .3, (R() * 1e6) | 0); } },
  // where a street or lane crosses, the canal runs under it (a stone culvert / slab bridge): at each street edge a headwall across the channel
  // with the dark mouth, and a stone parapet along the street edge across the canal (ux,uz: along the canal, pointing away from the street)
  bridgeEnd(L, x, z, ux, uz, w) { if (ARCH.lod) return; const b = L.mb, yaw = Math.atan2(ux, uz), D = this.D;
    b.s({ tex: 'stone', col: [1.0, .98, .94] }).T(x, 0, z, 0, yaw, 0).box(0, -D / 2 - .05, -.25, w + .9, D + .1, .5, { world: 1.5, skip: ['top'] }).pop();
    b.s({ tex: 'stone', col: [.12, .11, .1] }).T(x, 0, z, 0, yaw, 0).box(0, (this.WL - .12) / 2, .015, w - 1.2, -this.WL - .12, .02, { world: 1 }).pop();
    b.s({ tex: 'stone', col: [1.02, 1, .96] }).T(x, 0, z, 0, yaw, 0).box(0, .32, -.2, w + 1.6, .64, .32, { world: 1 }).box(-(w / 2 + .8), .42, -.2, .42, .84, .42, { world: 1 }).box(w / 2 + .8, .42, -.2, .42, .84, .42, { world: 1 }).pop();
    L.world.box(x - ux * .2, .4, z - uz * .2, (w + 1.6) / 2, .4, .18, { yaw }); },
  // culvert parapets where a street crosses: low stone walls along both street edges of the crossing
  parapet(L, x, z, yaw, w) { if (ARCH.lod) return; const b = L.mb; for (const sd of [-1, 1]) { b.s({ tex: 'stone', col: [1.02, 1, .96] }).T(x, 0, z, 0, yaw, 0).box(sd * (w / 2 + .35), .35, 0, .3, .7, 1.2, { world: 1 }).pop(); } },
};
const WARD = {
  WALL_T: 2.4, WALL_H: 3.0, MAIN_W: 15, SUB_W: 6, LANE_W: 3.6,
  layout(wd) {
    const R = RNG(wd.seed), r = wd.r, T = WARD.WALL_T, out = { wd, streets: [], lanes: [], lots: [], gates: [], wallSegs: [], trees: [], wells: [], props: [] };
    const inner = rect(r.x0 + T, r.z0 + T, r.x1 - T, r.z1 - T), cx = rcx(r), cz = rcz(r), MW = WARD.MAIN_W, SW = WARD.SUB_W;
    out.inner = inner;
    // main streets
    const ew = rect(inner.x0, cz - MW / 2, inner.x1, cz + MW / 2); out.streets.push({ r: ew, kind: 'main', axis: 'x' });
    let ns = null; if (wd.gates === 'four') { ns = rect(cx - MW / 2, inner.z0, cx + MW / 2, inner.z1); out.streets.push({ r: ns, kind: 'main', axis: 'z' }); }
    // gates (centre of each wall side that has a street)
    out.gates.push({ x: r.x0, z: cz, side: 'w' }, { x: r.x1, z: cz, side: 'e' }); if (ns) out.gates.push({ x: cx, z: r.z0, side: 'n' }, { x: cx, z: r.z1, side: 's' });
    // quadrants / halves
    const quads = ns ? [rect(inner.x0, inner.z0, cx - MW / 2, cz - MW / 2), rect(cx + MW / 2, inner.z0, inner.x1, cz - MW / 2), rect(inner.x0, cz + MW / 2, cx - MW / 2, inner.z1), rect(cx + MW / 2, cz + MW / 2, inner.x1, inner.z1)]
      : [rect(inner.x0, inner.z0, inner.x1, cz - MW / 2), rect(inner.x0, cz + MW / 2, inner.x1, inner.z1)];
    // 小十字街 in each quadrant of a big ward -> blocks; small wards: N-S lanes only
    const blocks = [];
    for (const q of quads) {
      if (ns && rw(q) > 200 && rd(q) > 120) { const mx = rcx(q), mz = rcz(q);
        out.streets.push({ r: rect(q.x0, mz - SW / 2, q.x1, mz + SW / 2), kind: 'sub', axis: 'x' }, { r: rect(mx - SW / 2, q.z0, mx + SW / 2, q.z1), kind: 'sub', axis: 'z' });
        blocks.push(rect(q.x0, q.z0, mx - SW / 2, mz - SW / 2), rect(mx + SW / 2, q.z0, q.x1, mz - SW / 2), rect(q.x0, mz + SW / 2, mx - SW / 2, q.z1), rect(mx + SW / 2, mz + SW / 2, q.x1, q.z1));
      } else blocks.push(q);
    }
    // specials: 'at' = fraction rect of the inner ward area, cut into one lot per block it covers; or 'block' = a whole block
    const claimed = new Set(), spR = [];
    for (const sp of wd.specials || []) {
      if (sp.at) { const a = sp.at, q = rect(inner.x0 + a[0] * rw(inner), inner.z0 + a[1] * rd(inner), inner.x0 + a[2] * rw(inner), inner.z0 + a[3] * rd(inner));
        if (sp.qu) { if (ns && Math.abs(q.x0 - ns.x1) < 40) q.x0 = ns.x1; if (q.z0 - inner.z0 < 40) q.z0 = inner.z0; if (inner.x1 - q.x1 < 40) q.x1 = inner.x1; if (Math.abs(q.z1 - (cz - MW / 2)) < 40) q.z1 = cz - MW / 2; }
        // one compound; ward streets crossing it are cut back to its walls (big temples and mansions absorbed streets)
        spR.push(q); blocks.forEach((b, bi) => { if (q.x0 <= b.x0 + 1 && q.x1 >= b.x1 - 1 && q.z0 <= b.z0 + 1 && q.z1 >= b.z1 - 1) claimed.add(bi); });
        const cut = []; for (const st of out.streets) { const r = st.r; if (!(r.x0 < q.x1 && r.x1 > q.x0 && r.z0 < q.z1 && r.z1 > q.z0)) { cut.push(st); continue; }
          if (st.axis === 'x') { if (q.x0 - r.x0 > 8) cut.push(Object.assign({}, st, { r: rect(r.x0, r.z0, q.x0, r.z1) })); if (r.x1 - q.x1 > 8) cut.push(Object.assign({}, st, { r: rect(q.x1, r.z0, r.x1, r.z1) })); }
          else { if (q.z0 - r.z0 > 8) cut.push(Object.assign({}, st, { r: rect(r.x0, r.z0, r.x1, q.z0) })); if (r.z1 - q.z1 > 8) cut.push(Object.assign({}, st, { r: rect(r.x0, q.z1, r.x1, r.z1) })); } }
        out.streets = cut;
        if (sp.qu) { WARD.quarterLanes(q, out, R); continue; }
        out.lots.push({ r: q, front: WARD.frontOf(q, out.streets), type: sp.type, wealth: sp.wealth ?? 3, seed: (R() * 1e9) | 0, name: sp.name, pagoda: sp.pagoda, big: true });
        continue; }
      let bi = sp.block; if (bi === undefined || bi === 'auto') { const free = blocks.map((b, i) => i).filter(i => !claimed.has(i)); bi = free[(R() * free.length) | 0]; }
      if (bi === undefined || claimed.has(bi)) continue; claimed.add(bi); const b = blocks[bi];
      out.lots.push({ r: b, front: WARD.frontOf(b, out.streets), type: sp.type, wealth: sp.wealth ?? 3, seed: (R() * 1e9) | 0, name: sp.name, big: true });
    }
    // great houses 第宅 (REF_CHANGAN §2: officials 1/16–1/4 ward; 郭子儀 1/4 of 親仁 'with lanes through it and 3000 household members').
    // East wards (near the palaces and the 皇城) hold 2–6, west fewer, the southern rows almost none. In wards with 小十字街 a great
    // house takes a whole block (~250×120 m, 3 ha) and a middling one half (~1.5 ha); in E-W-street wards a strip of the half-ward from the
    // street back to the wall (~250 m deep). The small houses that would have stood there are absorbed. type 'mansion', big.
    if (wd.kind === 'ward' && wd.profile) { const nM = Math.round((wd.profile.rich || 0) * 15 + R() * 1.4 - .5), hitSp = b => spR.some(t => b.x0 < t.x1 && b.x1 > t.x0 && b.z0 < t.z1 && b.z1 > t.z0);
      const cand = blocks.map((b, i) => i).filter(i => !claimed.has(i) && rw(blocks[i]) > 90 && rd(blocks[i]) > 80 && (Math.max(rw(blocks[i]), rd(blocks[i])) >= 320 || !hitSp(blocks[i])));
      for (let k = 0; k < nM && cand.length; k++) { const bi = cand.splice((R() * cand.length) | 0, 1)[0], b = blocks[bi], great = R() < .4, long = rw(b) >= rd(b);
        let m, rest = [];
        if (rw(b) < 320 && rd(b) < 160) { // a 小十字街 block: whole (great) or the half on the better street
          if (great) m = b; else if (long) { const h = rcx(b); m = R() < .5 ? rect(b.x0, b.z0, h, b.z1) : rect(h, b.z0, b.x1, b.z1); rest = [m.x0 === b.x0 ? rect(h, b.z0, b.x1, b.z1) : rect(b.x0, b.z0, h, b.z1)]; }
          else { const h = rcz(b); m = R() < .5 ? rect(b.x0, b.z0, b.x1, h) : rect(b.x0, h, b.x1, b.z1); rest = [m.z0 === b.z0 ? rect(b.x0, h, b.x1, b.z1) : rect(b.x0, b.z0, b.x1, h)]; } }
        else { // a half-ward of an E-W-street ward: a strip across it
          const W = great ? 120 + R() * 40 : 75 + R() * 25; if (long) { const x0 = b.x0 + 40 + R() * Math.max(0, rw(b) - W - 80), x1 = x0 + W; m = rect(x0, b.z0, x1, b.z1); rest = [rect(b.x0, b.z0, x0, b.z1), rect(x1, b.z0, b.x1, b.z1)]; }
          else { const z0 = b.z0 + 40 + R() * Math.max(0, rd(b) - W - 80), z1 = z0 + W; m = rect(b.x0, z0, b.x1, z1); rest = [rect(b.x0, b.z0, b.x1, z0), rect(b.x0, z1, b.x1, b.z1)]; } }
        if (hitSp(m)) { k--; continue; } // the strip landed on a special compound: try another block
        claimed.add(bi); for (const q of rest) if (rw(q) > 30 && rd(q) > 30) blocks.push(q);
        out.lots.push({ r: m, front: WARD.frontOf(m, out.streets), type: 'mansion', wealth: great ? 4 : 3, seed: (R() * 1e9) | 0, big: true, great }); } }
    // remaining blocks -> lanes (曲) and lots (dropping what overlaps a special compound)
    const n0 = out.lots.length, l0 = out.lanes.length;
    // a narrow lane (巷) just inside the ward wall wherever a block touches it, so lots along the wall face a way, not the wall
    blocks.forEach((b, bi) => { if (claimed.has(bi)) return; const LW = WARD.LANE_W, I = inner, b2 = { ...b };
      if (b.x0 - I.x0 < 1) { out.lanes.push({ r: rect(b.x0, b.z0, b.x0 + LW, b.z1), axis: 'z', edge: true }); b2.x0 += LW; }
      if (I.x1 - b.x1 < 1) { out.lanes.push({ r: rect(b.x1 - LW, b.z0, b.x1, b.z1), axis: 'z', edge: true }); b2.x1 -= LW; }
      if (b.z0 - I.z0 < 1) { out.lanes.push({ r: rect(b2.x0, b.z0, b2.x1, b.z0 + LW), axis: 'x', edge: true }); b2.z0 += LW; }
      if (I.z1 - b.z1 < 1) { out.lanes.push({ r: rect(b2.x0, b.z1 - LW, b2.x1, b.z1), axis: 'x', edge: true }); b2.z1 -= LW; }
      WARD.subdivide(b2, out, R, wd); });
    const hit = q => spR.some(t => q.x0 < t.x1 - .5 && q.x1 > t.x0 + .5 && q.z0 < t.z1 - .5 && q.z1 > t.z0 + .5);
    // lots that overlap a special compound are clipped to the part outside it (keeping their street front), or dropped if too small
    const clip = (l) => { let r = l.r; for (const q of spR) { if (!(r.x0 < q.x1 - .5 && r.x1 > q.x0 + .5 && r.z0 < q.z1 - .5 && r.z1 > q.z0 + .5)) continue;
        const parts = [['w', rect(r.x0, r.z0, Math.min(r.x1, q.x0 - .5), r.z1)], ['e', rect(Math.max(r.x0, q.x1 + .5), r.z0, r.x1, r.z1)], ['n', rect(r.x0, r.z0, r.x1, Math.min(r.z1, q.z0 - .5))], ['s', rect(r.x0, Math.max(r.z0, q.z1 + .5), r.x1, r.z1)]]
          .filter(([, p]) => rw(p) >= 9 && rd(p) >= 9 && p.x0 >= r.x0 - .01 && p.z0 >= r.z0 - .01 && p.x1 <= r.x1 + .01 && p.z1 <= r.z1 + .01 && !spR.some(t => p.x0 < t.x1 - .5 && p.x1 > t.x0 + .5 && p.z0 < t.z1 - .5 && p.z1 > t.z0 + .5)).sort((A, B) => (B[0] === l.front) - (A[0] === l.front) || rw(B[1]) * rd(B[1]) - rw(A[1]) * rd(A[1]));
        if (!parts.length) return null; r = parts[0][1]; }
      return r === l.r ? l : Object.assign({}, l, { r }); };
    if (spR.length) { out.lots = out.lots.map((l, i) => i < n0 ? l : clip(l)).filter(Boolean); out.lanes = out.lanes.filter((l, i) => i < l0 || !hit(l.r)); }
    out.lots = out.lots.filter(l => l.big || !CANAL.hits(l.r)); // nothing stands over a canal
    // fronts: a lot must face a street or lane, never the ward wall. Flip to the opposite side if that one touches a way, else to any side that does.
    { const ways = [...out.streets, ...out.lanes].map(w => w.r), opp = { n: 's', s: 'n', e: 'w', w: 'e' };
      const touches = (r, f) => ways.some(q => f === 'n' ? Math.abs(q.z1 - r.z0) < 1.5 && q.x0 < r.x1 - 2 && q.x1 > r.x0 + 2 : f === 's' ? Math.abs(q.z0 - r.z1) < 1.5 && q.x0 < r.x1 - 2 && q.x1 > r.x0 + 2
        : f === 'w' ? Math.abs(q.x1 - r.x0) < 1.5 && q.z0 < r.z1 - 2 && q.z1 > r.z0 + 2 : Math.abs(q.x0 - r.x1) < 1.5 && q.z0 < r.z1 - 2 && q.z1 > r.z0 + 2);
      for (const l of out.lots) { if (l.big || touches(l.r, l.front)) continue; const f2 = [opp[l.front], 'n', 's', 'e', 'w'].find(f => touches(l.r, f)); if (f2) l.front = f2; } }
    // doors: the middle of each lot's front edge (gates, gatehouses, shop fronts) — keep trees and clutter away from them
    COMP.frontFix(out); // every lot faces a street or lane (QA tool/qa_lots.js)
    const doors = out.lots.map(l => { const r = l.r, f = l.front; return [f === 'e' ? r.x1 : f === 'w' ? r.x0 : rcx(r), f === 's' ? r.z1 : f === 'n' ? r.z0 : rcz(r), l.big ? 9 : 4.5]; });
    const doorNear = (x, z) => doors.some(([dx, dz, rr]) => Math.abs(dx - x) < rr && Math.abs(dz - z) < rr + 4);
    out.doorNear = doorNear;
    // trees along the main streets (槐), wells at crossings
    for (const s of out.streets) {
      const along = s.axis === 'x', len = along ? rw(s.r) : rd(s.r), step = s.kind === 'main' ? 6.5 : 11; // close rows of 槐 (ref/zhihu, REF_CHANGAN)
      for (let d = 6; d < len - 6; d += step + R() * 1.5) for (const sd of [-1, 1]) {
        if (R() < (s.kind === 'main' ? .08 : .4)) continue;
        const off = (along ? rd(s.r) : rw(s.r)) / 2 - (s.kind === 'main' ? 1.4 : .9), x = along ? s.r.x0 + d : rcx(s.r) + sd * off, z = along ? rcz(s.r) + sd * off : s.r.z0 + d;
        if (WARD.nearGate(out, x, z, 9) || doorNear(x, z) || out.lanes.some(l => inR(l.r, x, z, 3.5))) continue; out.trees.push({ x, z, kind: s.kind === 'main' ? 'huai' : (R() < .5 ? 'elm' : 'huai'), s: .85 + R() * .4, seed: (R() * 1e6) | 0 });
      }
    }
    out.wells.push({ x: cx + 9, z: cz + 9.5 });
    return out;
  },
  // 北里 (孫棨《北里志》): 'entering 平康 by the north gate and turning east, three lanes 曲 where the courtesans live'. 南曲 and 中曲 hold the
  // famous houses ('halls wide and quiet, each with three or so reception rooms, flowers before and behind, odd rocks and basin ponds'); the
  // lane along the wall (北曲, 循牆一曲) the humble ones. Lanes run east from the ward's N-S street; a cross alley joins them (十字); the
  // band along the ward's main street is ordinary frontage (wine shops, inns). Lots face their lane, never a wall.
  quarterLanes(q, out, R) {
    const LW = WARD.LANE_W, QW = 5.5, x0 = q.x0, x1 = q.x1 - LW, xm = (x0 + x1) / 2 + (R() - .5) * 40; let z = q.z0;
    out.lanes.push({ r: rect(x1, q.z0, q.x1, q.z1), axis: 'z', edge: true }); // along the east ward wall, joining the lane ends
    const lane = (w, name) => { out.lanes.push({ r: rect(x0, z, x1, z + w), axis: 'x', name }); z += w; };
    const row = (dep, front, wealth, split, type) => { const z0 = z, z1 = z + dep; z = z1;
      for (const [a, b] of split ? [[x0, xm - QW / 2], [xm + QW / 2, x1]] : [[x0, x1]]) { let u = a; const fw0 = wealth >= 3 ? 23 : 15, fwr = wealth >= 3 ? 10 : 8;
        while (u < b - 10) { let fw = fw0 + R() * fwr; if (b - u - fw < fw0 * .75) fw = b - u; out.lots.push({ r: rect(u, z0, u + fw, z1), front, type: type ? type(R()) : 'quarter', wealth, seed: (R() * 1e9) | 0, qu: true }); u += fw; } } };
    const avail = q.z1 - q.z0, fixed = LW + 24 + 34 + QW + 34 + 34 + QW, rest = Math.max(60, avail - fixed), zx0 = z + LW;
    lane(LW, '北曲'); row(24, 'n', 1, true); row(34, 's', 3, true); lane(QW, '中曲'); row(34, 'n', 3, true); row(34, 's', 3, true); lane(QW, '南曲');
    out.lanes.push({ r: rect(xm - QW / 2, zx0, xm + QW / 2, z - QW), axis: 'z', name: '十字' });
    row(rest / 2, 'n', 3, false); row(q.z1 - z, 's', 2, false, v => v < .3 ? 'wineshop' : v < .45 ? 'inn' : v < .6 ? 'shop' : 'house');
  },
  nearGate(o, x, z, d) { return o.gates.some(g => Math.hypot(g.x - x, g.z - z) < d); },
  // which side of block b faces the widest street
  frontOf(b, streets) {
    let best = null, bw = -1;
    for (const s of streets) { const w = s.kind === 'main' ? 15 : s.kind === 'sub' ? 6 : 3;
      for (const [side, test] of [['n', Math.abs(s.r.z1 - b.z0) < 1 && s.r.x0 < b.x1 && s.r.x1 > b.x0], ['s', Math.abs(s.r.z0 - b.z1) < 1 && s.r.x0 < b.x1 && s.r.x1 > b.x0], ['w', Math.abs(s.r.x1 - b.x0) < 1 && s.r.z0 < b.z1 && s.r.z1 > b.z0], ['e', Math.abs(s.r.x0 - b.x1) < 1 && s.r.z0 < b.z1 && s.r.z1 > b.z0]])
        if (test && w > bw) { bw = w; best = side; } }
    return best || 's';
  },
  // a block: N-S lanes every ~40–70 m, then two rows of lots back to back in each strip, lots facing the lanes;
  // strip ends facing the streets become street-front lots (shops); some cells merge into bigger compounds.
  subdivide(b, out, R, wd) {
    const LW = WARD.LANE_W, P = wd.profile || {}, W = rw(b), D = rd(b), vertical = W >= D * .8; // lanes run N-S if the block is wide
    const len = vertical ? W : D, cross = vertical ? D : W, strips = []; let p = 0;
    // strip widths 34–62 m separated by lanes
    while (p < len - 20) { let w = 34 + R() * 28; if (len - p - w < 30) w = len - p; strips.push([p, Math.min(len, p + w)]); p += w + LW; }
    strips.forEach(([a0, a1], si) => {
      // lane on the far side of each strip (except the last)
      if (si < strips.length - 1) { const l = vertical ? rect(b.x0 + a1, b.z0, b.x0 + a1 + LW, b.z1) : rect(b.x0, b.z0 + a1, b.x1, b.z0 + a1 + LW); out.lanes.push({ r: l, axis: vertical ? 'z' : 'x' }); }
      const sw = a1 - a0, half = sw / 2, rows = sw > 30 ? [[a0, a0 + half, -1], [a0 + half, a1, 1]] : [[a0, a1, 0]];
      // street-front depth at both ends of the strip (lots facing the block's streets)
      const endD = 14 + R() * 8; let c0 = 0, c1 = cross;
      const front0 = vertical ? 'n' : 'w', front1 = vertical ? 's' : 'e';
      const mkLot = (u0, u1, v0, v1, front, type, wealth) => { const r = vertical ? rect(b.x0 + u0, b.z0 + v0, b.x0 + u1, b.z0 + v1) : rect(b.x0 + v0, b.z0 + u0, b.x0 + v1, b.z0 + u1); out.lots.push({ r, front, type, wealth, seed: (R() * 1e9) | 0 }); };
      if (cross > 70) { mkLot(a0, a1, 0, endD, front0, WARD.pick(P, R, true), 1 + (R() * 2 | 0)); mkLot(a0, a1, cross - endD, cross, front1, WARD.pick(P, R, true), 1 + (R() * 2 | 0)); c0 = endD; c1 = cross - endD; }
      // the rows: lots of 12–30 m frontage along the lane; occasional mansions spanning the whole strip
      let v = c0;
      while (v < c1 - 8) {
        const big = R() < (P.rich ?? .15) && c1 - v > 40, fr = big ? 30 + R() * 25 : 12 + R() * 16, v1 = (c1 - (v + fr) < 10) ? c1 : Math.min(c1, v + fr);
        if (big || rows.length === 1) { const side = rows.length === 1 || si === strips.length - 1 ? (si > 0 ? -1 : 1) : (R() < .5 ? -1 : 1);
          const fdir = vertical ? (side < 0 ? 'w' : 'e') : (side < 0 ? 'n' : 's'); mkLot(a0, a1, v, v1, fdir, big ? 'rich' : WARD.pick(P, R), big ? 3 : 1 + (R() * 2 | 0)); }
        else for (const [u0, u1, sd] of rows) { const fdir = vertical ? (sd < 0 ? 'w' : 'e') : (sd < 0 ? 'n' : 's'); const t = WARD.pick(P, R); mkLot(u0, u1, v, v1, fdir, t, t === 'hut' ? 0 : 1 + (R() < .3 ? 1 : 0)); }
        v = v1;
      }
    });
  },
  pick(P, R, street) {
    const w = street ? (P.street || { shop: .5, house: .35, wineshop: .15 }) : (P.lots || { house: .55, hut: .2, rich: .1, garden: .08, field: .07 });
    let t = R() * Object.values(w).reduce((a, c) => a + c, 0); for (const k in w) { t -= w[k]; if (t <= 0) return k; } return Object.keys(w)[0];
  },
};

// =====================================================================================
// COMPOUNDS — geometry for one lot. lot.front = side facing the lane/street. Local frame: +z = front, x = width.
// =====================================================================================
const COMP = {
  // lot rect + front -> frame (centre, yaw) and local size (w along the front, d depth)
  frame(lot) {
    const r = lot.r, f = lot.front, cx = rcx(r), cz = rcz(r);
    const yaw = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[f], horiz = f === 'n' || f === 's';
    return { F: ARCH.F(cx, 0, cz, yaw), w: horiz ? rw(r) : rd(r), d: horiz ? rd(r) : rw(r) };
  },
  build(L, lot, gy) {
    const fn = COMP[lot.type] || COMP.house, { F, w, d } = COMP.frame(lot), R = RNG(lot.seed);
    COMP.netRun(L, lot, () => fn(L, lot, F, w, d, R, gy || 0));
  },
  // enclosure wall round the lot (inset .3 m), leaving a gap for the gate in the front wall
  enclose(L, F, w, d, gx, gw, o = {}) { // gw > 0: gate gap at gx; gw == 0: closed; gw < 0: no front run, or o.front = [[x0, x1], ...] runs (o.gate = [gx, gw] gap)
    const lt = COMP._lot; if (lt && !lt.walls) { lt.walled = true; lt.walls = { front: gw !== -1 || !!o.front, back: true, left: true, right: true, rect: [-w / 2, -d / 2 + (o.z || 0), w / 2, d / 2 + (o.z || 0)], style: o.style || 'courtyard' }; } // for nature.js (lot-local: front = +z)
    const t = o.t || .45, zo = o.z || 0, P = (x, z) => F.p(x, 0, z + zo), ins = o.style === 'board' ? .17 : (t + .1) / 2 + .04, x0 = -w / 2 + ins, x1 = w / 2 - ins, z0 = -d / 2 + ins, z1 = d / 2 - .3, // walls a pier's half-width inside the lot line: neighbours' corner piers never touch
      st = o.style || 'courtyard', h = o.h || 2.4;
    const seg = (a, b) => { const p = P(...a), q = P(...b); if (Math.hypot(q[0] - p[0], q[2] - p[2]) > .4) COMP.wall(L, p[0], p[2], q[0], q[2], { style: st, h, t, y: o.y || 0, coping: o.coping, tiles: o.tiles }); }; // into the lot's wall network
    // a closed ring through the four corner piers (the wall network makes the L corners, T joins and the ends at gates/buildings)
    seg([x0, z0], [x1, z0]); const zs = o.sideEnd ?? z1; seg([x1, z0], [x1, zs]); seg([x0, zs], [x0, z0]);
    const cl = v => Math.max(x0, Math.min(x1, v)); if (o.front) { for (const [a0, c0] of o.front) { const a = cl(a0), c = cl(c0), g = o.gate; if (g && g[0] > a && g[0] < c) { seg([a, z1], [g[0] - g[1] / 2, z1]); seg([g[0] + g[1] / 2, z1], [c, z1]); } else seg([a, z1], [c, z1]); } }
    else if (gw > 0) { seg([x0, z1], [gx - gw / 2, z1]); seg([gx + gw / 2, z1], [x1, z1]); } else if (gw === 0) seg([x1, z1], [x0, z1]);
  },
  gate(L, F, gx, z, w, o = {}) { const p = F.p(gx, 0, z); ARCH.gate(L, p[0], o.y || 0, p[2], { yaw: F.yaw, w, h: o.h || 2.8, open: o.open ?? true, cls: o.cls ?? (COMP._lot && COMP._lot.gateCls) ?? 4, roof: 'gable', paint: o.paint || 'ochre', brackets: o.brackets || 'none', studs: o.studs || false }); },
  hall(L, F, lx, lz, yaw, o) { const p = F.p(lx, 0, lz); return ARCH.hall(L, p[0], o.y || 0, p[2], Object.assign({ yaw: F.yaw + yaw }, o)); },
  tree(L, F, lx, lz, kind, s, seed) { const p = F.p(lx, 0, lz); TREES.place(L, p[0], 0, p[2], kind, s, seed); },
  // ----- helpers (architecture engineer) -----
  // every wall emitted while building a lot (or a big unit / temple part) is collected and built as ONE wall network (ARCH.wallNet):
  // junction piers with hipped caps at corners, T joins and ends, instead of independent runs clipping into each other
  _net: null,
  wall(L, x0, z0, x1, z1, o = {}) { if (COMP._net) COMP._net.push(Object.assign({ x0, z0, x1, z1, style: o.style || 'courtyard', h: o.h ?? 2.6, t: o.t ?? .5, y: o.y || 0 }, o)); else ARCH.wall(L, x0, z0, x1, z1, o); },
  netRun(L, lot, fn) { const keepN = COMP._net, keepL = COMP._lot; COMP._net = []; COMP._lot = lot; try { fn(); if (COMP._net.length) ARCH.wallNet(L, COMP._net); } finally { COMP._net = keepN; COMP._lot = keepL; } },
  // night lamplight: share of rooms lit in the evening and their lamp group (vertex bone channel of the emissive window/door cards, and
  // light.group): 1 = evening (households, shops), 2 = late (great houses, 北里 / 崇仁 households), 3 = all night (wine shops, inns, temples' altar lamps)
  _wardMap: new WeakMap(),
  ward(lot) { if (!lot || !lot.r) return ''; let w = COMP._wardMap.get(lot); if (w !== undefined) return w; w = ''; const x = (lot.r.x0 + lot.r.x1) / 2, z = (lot.r.z0 + lot.r.z1) / 2;
    if (typeof CITY !== 'undefined' && CITY.lay) for (const l of CITY.lay) if (l && l.wd && l.wd.r && x >= l.wd.r.x0 && x <= l.wd.r.x1 && z >= l.wd.r.z0 && z <= l.wd.r.z1) { w = l.wd.name || ''; break; }
    COMP._wardMap.set(lot, w); return w; },
  isDao(lot) { return !!(lot && lot.name && /觀$|觀[ 北南東西]院?$/.test(lot.name)); }, // Daoist abbeys 觀 (玄都觀, 昊天觀, 回元觀…): 天尊 images, Daoist priests, no Buddhist chant
  night(lot, kind) { const busy = /平康|崇仁/.test(COMP.ward(lot)) || lot.glow, base = { hut: .05, house: .2, rich: .35, shop: .6, stall: .5, wineshop: .85, inn: .75, temple: .6, warehouse: .05 }[kind] ?? .2;
    const lamp = kind === 'wineshop' || kind === 'inn' || kind === 'temple' ? 3 : busy || kind === 'rich' ? 2 : 1; return { lit: Math.min(.9, base * (busy ? 2 : 1)), lamp }; },
  // a building in lot-local coordinates, recorded in lot.foot (local rect incl. platform) for nature.js; returns ARCH.hall info
  B(L, lot, F, lx, lz, yaw, o) {
    const nb = o.bays || 3, nd = o.dbays || 2, bw = Array.isArray(o.bayW) ? o.bayW.reduce((a, c) => a + c, 0) : nb * (o.bayW || 3.6), D = Array.isArray(o.dbayW) ? o.dbayW.reduce((a, c) => a + c, 0) : nd * (o.dbayW || 3.4), pm = (o.platform ?? .9) > .05 ? (o.pm ?? .5) : .3;
    const rot = Math.abs(Math.sin(yaw)) > .5, hx = (rot ? D : bw) / 2 + pm, hz = (rot ? bw : D) / 2 + pm; if (lot.foot) lot.foot.push([lx - hx, lz - hz, lx + hx, lz + hz]);
    const nt = COMP.night(lot, lot.type || 'house'), h = COMP.hall(L, F, lx, lz, yaw, Object.assign({ lit: nt.lit, lamp: nt.lamp, cls: 0 }, o)); /* cls 0: homes, always closed (callers set business classes) */
    if (lot.foot) { const DK = new Set(['door', 'opendoor', 'board', 'boardopen']), Fl = ARCH.F(lx, 0, lz, yaw), nb2 = o.bays || 3, nd2 = o.dbays || 2; // keep the ground in front of every door clear (granaries, stables, yard clutter avoid lot.foot); from the inputs, so LOD0 and LOD1 decide alike
      const bws = Array.isArray(o.bayW) ? o.bayW : Array.from({ length: nb2 }, (_, i) => o.bayW || (nb2 % 2 && i === (nb2 - 1) / 2 ? 4.2 : 3.6)), Dd = Array.isArray(o.dbayW) ? o.dbayW.reduce((a, c) => a + c, 0) : nd2 * (o.dbayW || 3.4), Ww = bws.reduce((a, c) => a + c, 0);
      const doorB = Array.isArray(o.door) ? o.door : o.door === 'none' ? [] : o.door === 'all' ? bws.map((_, i) => i) : nb2 % 2 ? [(nb2 - 1) / 2] : [nb2 / 2 - 1, nb2 / 2], fl = o.fill || (o.walls === 'open' ? {} : { front: bws.map((_, i) => doorB.includes(i) ? 'door' : 'w'), back: bws.map((_, i) => o.backDoor && doorB.includes(i) ? 'door' : 'w') });
      const xs = [-Ww / 2]; for (const v of bws) xs.push(xs[xs.length - 1] + v);
      for (const [ks, sg] of [[fl.front, 1], [fl.back, -1]]) (ks || []).forEach((k, i) => { if (!DK.has(k) || xs[i + 1] === undefined) return; const m = (xs[i] + xs[i + 1]) / 2 * sg, hw = Math.max(.7, (xs[i + 1] - xs[i]) / 2), z0 = sg * Dd / 2, z1 = sg * (Dd / 2 + (o.pm ?? .5) + 1.6), A = Fl.p(m - hw, 0, z0), B2 = Fl.p(m + hw, 0, z1);
        lot.foot.push([Math.min(A[0], B2[0]), Math.min(A[2], B2[2]), Math.max(A[0], B2[0]), Math.max(A[2], B2[2])]); }); }
    // round 11: every enterable building gets an interior: callers name the room kind; otherwise it is chosen here (sheds and warehouses: stores; huts: a poor home; the rest: bedrooms)
    const area = nb * (o.bayW || 3.6) * nd * (o.dbayW || 3.4), fk = o.furnish !== undefined ? o.furnish : o.walls === 'open' ? null : (lot.type === 'warehouse' || area < 9) ? 'store' : (lot.type === 'hut' || (o.tiles === 'thatch' && area < 30)) ? 'hut' : 'room';
    if (fk && h) ARCH.furnish(L, h, fk, { seed: (lot.seed || 1) * 7 + Math.round(lx * 3 + lz * 5), cls: o.cls ?? 0, lamp: o.lamp || nt.lamp, lit: fk === 'temple' || fk === 'tavern', dao: COMP.isDao(lot), lot: lot.seed, room: (lot.seed | 0) + ':' + Math.round(lx) + ',' + Math.round(lz), wealth: lot.wealth || 0 }); return h; // in-place interior
  },
  pick: (R, a) => a[(R() * a.length) | 0],
  TRADES: ['cloth', 'pottery', 'medicine', 'grain', 'books', 'butcher', 'bakery', 'smith', 'carpenter', 'dyer', 'rope', 'tea'],
  // the people of a building: colour, walls, paint by wealth (0 poor .. 3 official); sumptuary: commoners 3間, no 懸魚, gable roofs
  look(R, wealth) {
    if (wealth <= 0) return { paint: 'plain', walls: R() < .55 ? 'mud' : 'adobe', tiles: R() < .75 ? 'thatch' : undefined, roof: 'gable' };
    if (wealth === 1) return { paint: R() < .7 ? 'plain' : 'ochre', walls: R() < .25 ? 'plank' : R() < .2 ? 'adobe' : 'white', tiles: R() < .25 ? 'thatch' : undefined, roof: 'gable' };
    if (wealth === 2) return { paint: R() < .35 ? 'plain' : 'ochre', walls: R() < .12 ? 'plank' : 'white', roof: 'gable' };
    return { paint: 'ochre', walls: 'white', roof: 'xieshan', fish: true };
  },
  // kitchen shed with a clay chimney and soot, lean-to against the back wall
  kitchen(L, lot, F, lx, lz, yaw, look, R) {
    const i = COMP.B(L, lot, F, lx, lz, yaw, { furnish: 'kitchen', bays: 1, dbays: 1, bayW: 3.2 + R() * .4, dbayW: 2.6, colH: 2.4, platform: .15, pm: .2, brackets: 'none', paint: 'plain', walls: look.walls === 'white' ? 'white' : look.walls, roof: 'shed', tiles: look.tiles, steps: false, windows: false, door: [0], doorOpen: true, curtain: [.55, .5, .42], rafters: false });
    if (ARCH.lod || !i) return i; const c = i.F.p(i.W / 2 - .45, 0, -i.D / 2 + .5), top = i.ridge + .2;
    L.mb.s({ tex: 'mudbrick', col: [.8, .74, .66] }).T(c[0], 0, c[2], 0, i.F.yaw, 0).box(0, (top + .6) / 2 + i.top * 0, 0, .42, top + .6, .42, { world: 1 }).s({ tex: 'd_scorch', col: [.2, .18, .16] }).box(0, top + .62, 0, .3, .04, .3).pop(); L.mb.s({ col: [1, 1, 1] });
    return i;
  },
  stable(L, lot, F, lx, lz, yaw, n, R) { // 馬廄: open-fronted shed, troughs, hay
    const i = COMP.B(L, lot, F, lx, lz, yaw, { bays: n, dbays: 1, bayW: 3, dbayW: 3.6, colH: 2.6, platform: .1, pm: .2, brackets: 'none', paint: 'plain', walls: 'plank', roof: 'shed', steps: false, rafters: false, fill: { front: [], back: Array(n).fill('wall'), left: ['wall'], right: ['wall'] } });
    if (ARCH.lod || !i) return i; for (let k = 0; k < n; k++) { ARCH.stamp(L, 'trough', b => { b.s({ tex: 'plank', col: [.55, .45, .38] }).box(0, .45, 0, 2.2, .1, .38).box(0, .3, -.22, 2.26, .5, .06).box(0, .3, .22, 2.26, .5, .06); b.s({ tex: 'straw', col: [.9, .82, .6] }).box(0, .48, 0, 2.0, .06, .33); }, ...i.F.p(-i.W / 2 + 1.5 + k * 3, i.top, -i.D / 2 + .6), i.F.yaw, 1, [2.2, .6, .6]); }
    const h = i.F.p(i.W / 2 + .9, 0, i.D / 2 - .3); ARCH.stamp(L, 'hay', b => { b.s({ tex: 'straw', col: [1, .9, .62] }).ell(0, .5, 0, .9, .7, .8, { seg: 7, ring: 5, disp: lumpy(.15, 2, 3) }); }, h[0], 0, h[2], (lx * 7.3 + lz) % 6, 1, [1.6, 1.2, 1.4]); return i;
  },
  // walled yard with a gate; returns nothing. o: {style, h, t, tiles, gate:{x, w, paint, studs, roofed}}
  yardWall(L, lot, F, w, d, gx, gw, o = {}) { COMP.enclose(L, F, w, d, gx, gw, o); if (gw > 0 && o.gateRoof !== false) COMP.gate(L, F, gx, d / 2 - .3, gw + .1, { h: o.gh || 2.6, paint: o.paint, studs: o.studs, brackets: 'none' }); },
  // ----- types -----
  hut(L, lot, F, w, d, R) { // poor: adobe / rammed-earth yard wall (thatch coping), one or two thatched 2–3 bay houses, lean-to kitchen, granary
    lot.foot = []; const gx = (R() - .5) * (w - 6), gw = 2.2, look = COMP.look(R, 0); lot.gx = gx;
    COMP.enclose(L, F, w, d, gx, gw, { style: 'mud', h: 1.9 + R() * .4, t: .45, coping: R() < .5 ? false : undefined, tiles: 'thatch' });
    { const p = F.p(gx, 0, d / 2 - .3); if (!ARCH.lod) L.mb.s({ tex: 'wood', col: [.7, .62, .5] }).T(p[0], 0, p[2], 0, F.yaw, 0).box(-gw / 2 - .05, 1.1, 0, .14, 2.2, .14).box(gw / 2 + .05, 1.1, 0, .14, 2.2, .14).box(0, 2.15, 0, gw + .4, .12, .12).pop(); } // 柴門 posts
    const bays = w > 14 ? 3 : 2, zMain = -d / 2 + 4.2; lot.zMain = zMain;
    const m = COMP.B(L, lot, F, (R() - .5) * Math.max(0, w - 3.2 * bays - 3) * .5, zMain, 0, { furnish: 'hut', bays, dbays: 1, dbayW: 4.4, bayW: 3.1, colH: 2.6, platform: .25, pm: .4, brackets: 'none', paint: 'plain', walls: look.walls, roof: 'gable', tiles: look.tiles, steps: false, windows: true, curtain: [.6, .55, .45], rafters: look.tiles !== 'thatch' });
    ARCH.dress(L, m, RNG(lot.seed * 3 + 1), 'poor');
    if (w > 9) COMP.kitchen(L, lot, F, w / 2 - 2.2, zMain + 5.5, -PI / 2, look, R);
    if (d > 18 && R() < .5) ARCH.granary(L, ...(p => [p[0], p[2]])(F.p(-w / 2 + 2.2, 0, zMain + 6.5)), 1.2 + R() * .4, 2.2, lot.seed);
    if (d > 20 && w > 12 && R() < .5) COMP.B(L, lot, F, -w / 2 + 2.4, d / 2 - 4.5, PI / 2, { bays: 1, dbays: 1, bayW: 3, dbayW: 3, colH: 2.3, platform: .15, pm: .2, brackets: 'none', paint: 'plain', walls: look.walls, roof: 'gable', tiles: 'thatch', steps: false, windows: false, door: [0], rafters: false });
    if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, F, w, d, R, 'hut');
  },
  house(L, lot, F, w, d, R) { // commoner / craftsman: several plans (single, L, U, front building on the lane, workshop), kitchen, granary, stable
    lot.foot = []; const r0 = R(), wealth = Math.min(2, lot.wealth ?? 1), look = COMP.look(R, wealth), plan = R(), gw = 2.4;
    const zMain = -d / 2 + Math.min(d * .3, 8), mainB = Math.min(3, Math.max(1, Math.floor((w - 3) / 3.4))); lot.zMain = zMain;
    const trade = lot.trade || (d > 16 && w > 10 && R() < (lot.street ? .7 : .35) ? COMP.pick(R, COMP.TRADES) : null);
    const frontB = w >= 10.5 && d >= 18 && (trade || plan < .45), fbays = Math.min(3, Math.floor((w - 1.5) / 3.3)), fW = fbays * 3.3;
    let gx = w > 18 ? 0 : (r0 - .5) * (w - 6); if (frontB) { gx = w - fW > 5.2 ? (fW / 2 + (w / 2 - fW / 2) / 2) * (R() < .5 ? -1 : 1) : 0; }
    lot.gx = gx; const zf = d / 2 - .3;
    if (frontB) { // front building on the wall line: its middle bay is the gate passage unless a separate gate fits beside it
      const fx = gx !== 0 ? -Math.sign(gx) * Math.max(0, (w / 2 - fW / 2 - .3) - (w / 2 - fW / 2) * .5) : 0, fD = 4.2, through = gx === 0;
      const kinds = trade ? ['shutter', 'counter', 'counter'].slice(0, fbays) : ['window', 'opendoor', 'window'].slice(0, fbays); if (through) kinds[(fbays - 1) >> 1] = 'opendoor'; /* the gate passage stays a clear doorway */
      const fb = COMP.B(L, lot, F, fx, zf - fD / 2, 0, { furnish: trade ? false : undefined, /* a shop: ARCH.goods furnishes it */ cls: trade ? 1 : 0, bays: fbays, dbays: 1, bayW: 3.3, dbayW: fD, colH: 2.9, platform: .2, pm: .3, brackets: 'none', paint: look.paint, walls: look.walls === 'mud' ? 'adobe' : look.walls, roof: 'gable', tiles: look.tiles, steps: false, fill: { front: kinds, back: kinds.map((k, i) => through && i === ((fbays - 1) >> 1) ? 'opendoor' : 'window'), left: ['wall'], right: ['wall'] }, blind: R() < .5, seed: lot.seed });
      if (trade) ARCH.goods(L, F, fx, .2, zf, fW, trade, RNG(lot.seed * 5 + 9), { sign: true, cls: 1, colH: 2.9, depth: fD, through, bays: kinds.map((k, i) => [-fW / 2 + i * 3.3, -fW / 2 + (i + 1) * 3.3, k]) });
      ARCH.dress(L, fb, RNG(lot.seed * 3 + 2), 'house');
      const xl = fx - fW / 2 - .02, xr = fx + fW / 2 + .02; // front wall runs either side of the front building (with the gate if separate)
      COMP.enclose(L, F, w, d, 0, -1, { h: 2.4, style: look.walls === 'mud' || look.walls === 'adobe' ? 'mud' : 'courtyard', front: [[-w / 2, xl], [xr, w / 2]], gate: gx !== 0 ? [gx, gw] : null });
      if (gx !== 0) COMP.gate(L, F, gx, zf, gw + .1, { h: 2.5, paint: look.paint });
    } else { const board = wealth <= 1 && ((lot.seed >>> 7) % 4) === 0; COMP.enclose(L, F, w, d, gx, gw - .1, board ? { h: 2.2, t: .2, style: 'board', coping: false } : { h: 2.5, style: look.walls === 'mud' || look.walls === 'adobe' ? 'mud' : 'courtyard' }); COMP.gate(L, F, gx, zf, gw, { h: 2.6, paint: look.paint }); } // 板牆 board fences on some poorer lots
    if (lot.glow && !ARCH.lod) { const p = F.p(gx + 1.9, 0, d / 2 - 1.2); L.prop(b2 => PROPS.oilLamp(b2, true), p[0], 0, p[2], { yaw: F.yaw }); L.light(p[0], 1.5, p[2], 6, [1.4, .7, .35], { flicker: .15 }); } // 北里: a lamp on a stand inside the gate
    // main house 堂 (3間 for commoners) at the back, facing the yard
    const m = COMP.B(L, lot, F, 0, zMain, 0, { furnish: 'hall', bays: mainB, dbays: 2, bayW: 3.3 + R() * .3, dbayW: 2.9, colH: 2.9 + R() * .3, platform: .35 + R() * .2, pm: .5, brackets: wealth >= 2 && R() < .5 ? 'simple' : 'none', paint: look.paint, walls: look.walls, roof: 'gable', tiles: look.tiles, windows: true, doorOpen: R() < .6, blind: R() < .4, curtain: R() < .3 ? [.5, .4, .6] : null, seed: lot.seed + 1 });
    ARCH.dress(L, m, RNG(lot.seed * 3 + 3), wealth >= 2 ? 'house' : 'poor');
    // wings 廂: L or U plan, facing the yard
    const zw = zMain + 6.6 + R(), roomY = frontB ? zf - 4.2 - .8 : zf - 2.5;
    if (w > 14.5 && zw + 3.6 < roomY) { const sides = plan < .55 ? [-1, 1] : [plan < .78 ? -1 : 1]; for (const sd of sides) { const wb = Math.max(1, Math.min(3, Math.floor((roomY - zw + 3) / 3.2))), wi = COMP.B(L, lot, F, sd * (w / 2 - 3.6), zw + (wb - 1) * 1.6, -sd * PI / 2, /* eaves clear of the lot wall */ { furnish: 'room', bays: wb, dbays: 1, bayW: 3.2, dbayW: 3.6, colH: 2.7, platform: .3, pm: .35, brackets: 'none', paint: look.paint === 'ochre' && R() < .5 ? 'ochre' : 'plain', walls: R() < .3 ? 'plank' : look.walls, roof: 'gable', tiles: look.tiles, windows: true, doorOpen: R() < .5, seed: lot.seed + 2 + sd, rafters: false }); ARCH.dress(L, wi, RNG(lot.seed * 3 + 4 + sd * 17), 'poor'); } }
    // the back strip: kitchen, granary or stable, behind the main house
    const back = -d / 2 + .3, room = zMain - 2.9 - .8 - back;
    if (room > 4.5 && w > 9) COMP.kitchen(L, lot, F, -w / 2 + 2.8, back + 1.95, 0, look, R); /* its door needs >= 1.5 m clear before the hall's back (QA door check) */
    else if (w / 2 - 5.1 > (m ? m.W : 10) / 2 + 2.4) COMP.kitchen(L, lot, F, w / 2 - 3.1, zMain + 1.5, 0, look, R); /* beside the hall when it clears the hall's eaves (a walkable roof: tool/climb_test.js), its door to the yard */
    if (d > 26 && w > 12) { if (R() < .35) { const sx2 = w / 2 - 4.2, sz2 = d / 2 - 6.5; if (!lot.foot.some(f => sx2 + 1.9 > f[0] && sx2 - 1.9 < f[2] && sz2 + 2.2 > f[1] && sz2 - 2.2 < f[3])) COMP.stable(L, lot, F, sx2, sz2, PI, 1, R); } else if (R() < .5) { const gx2 = w / 2 - 2.2, gz2 = zw + 4.5; if (!lot.foot.some(f => gx2 + 1.4 > f[0] && gx2 - 1.4 < f[2] && gz2 + 1.4 > f[1] && gz2 - 1.4 < f[3])) ARCH.granary(L, ...(p => [p[0], p[2]])(F.p(gx2, 0, gz2)), 1.3, 2.4, lot.seed); } }
    if (R() < .45) { const wx = (R() < .5 ? -1 : 1) * (w / 2 - 2.2), wz = (zMain + zf) / 2 + 2, p = F.p(wx, 0, wz); if (!lot.foot.some(f => wx > f[0] - 1.2 && wx < f[2] + 1.2 && wz > f[1] - 1.2 && wz < f[3] + 1.2)) L.prop(PROPS.well, p[0], 0, p[2], { yaw: F.yaw, solid: { r: .9, h: .8 } }); }
    if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, F, w, d, R, 'house');
  },
  rich(L, lot, F, w, d, R) { // official / wealthy: 門屋 gatehouse, 廊院 front court with corridors, 堂, 中門, rear court 寢, stable court, garden
    if (w < 20 || d < 26) return COMP.house(L, lot, F, w, d, R);
    lot.foot = []; const wealth = lot.wealth || 3, look = COMP.look(R, Math.min(3, wealth)), paint = lot.paint || look.paint, zf = d / 2 - .3; lot.gx = 0;
    const side = w > 44 && COMP.wayAt(...(q => [q[0], q[2]])(F.p(-Math.min(16, w * .28) / 2, 0, d / 2 + 2))) ? Math.min(16, w * .28) : 0, cw = w - side, cx = side ? -side / 2 : 0; lot.gx = cx; // a service strip on one side (only when the gate, then off the middle, still opens onto the street: QA door check)
    // gatehouse straddling the front wall (3 bays, passage in the middle) — walls run into its gable ends
    const gB = wealth >= 3 ? 3 : 1, gW = gB === 3 ? 3.4 * 3 : 3.8;
    const frontage = wealth >= 3 && !side && cw >= 30 && ((lot.seed >>> 3) % 3) !== 0; // 廊 along the street front: red columns, 直欞窗 bays, the gatehouse breaking its roof
    COMP.enclose(L, F, w, d, cx, gW + .2, frontage ? { h: 2.9, t: .55, front: [], sideEnd: zf - 3.6 } : side ? { h: 2.9, t: .55, front: [[-w / 2, cx - (gW + .2) / 2], [cx + (gW + .2) / 2, w / 2 - side / 2 - 1.4], [w / 2 - side / 2 + 1.4, w / 2]] } : { h: 2.9, t: .55 }); // (with a service court: a second gap for its gate)
    if (frontage) { const P2 = (x, z) => { const p = F.p(x, 0, z); return [p[0], p[2]]; }, zc = zf - 1.45, ends = [[-w / 2 + .45, cx - gW / 2 - .55], [cx + gW / 2 + .55, w / 2 - .45]];
      for (const [xa, xb] of ends) if (xb - xa > 3) { ARCH.corridor(L, ...P2(xa, zc), ...P2(xb, zc), { w: 2.9, wall: 1, win: true, colH: 3.0, ph: .26, paint, rail: false, m0: .3, m1: .05, seed: lot.seed + (xa < 0 ? 3 : 5) }); lot.foot.push([xa - .3, zc - 1.9, xb, zc + 1.9]); } }
    COMP.B(L, lot, F, cx, zf - 1.3, 0, { bays: gB, dbays: 1, bayW: gB === 3 ? 3.4 : 3.8, dbayW: 4.2, colH: 3.3, platform: .3, pm: .35, steps: false, brackets: 'simple', paint, walls: 'white', roof: wealth >= 3 ? 'xieshan' : 'gable', fish: wealth >= 3, door: [(gB - 1) / 2], doorOpen: true, backDoor: true, windows: false, studs: true, fill: { front: gB === 3 ? ['wall', 'boardopen', 'wall'] : ['boardopen'], back: gB === 3 ? ['wall', 'opendoor', 'wall'] : ['opendoor'], left: ['wall'], right: ['wall'] }, seed: lot.seed });
    if (wealth >= 3 && !ARCH.lod) for (const sd of [-1, 1]) { const p = F.p(cx + sd * (gW / 2 + .9), 0, zf + .55); ARCH.stamp(L, 'wutou', b => { b.s({ tex: 'vermilion' }).box(0, 1.6, 0, .26, 3.2, .26); b.s({ tex: 'lacquer_black' }).box(0, 3.35, 0, .32, .3, .32); }, p[0], 0, p[2], F.yaw, 1, [.3, 3.5, .3]); } // 烏頭 posts
    const n = d > 70 ? 3 : d > 44 ? 2 : 1, z0 = zf - 5, step = (z0 - (-d / 2 + 4)) / n;
    let zHall = 0;
    for (let i = 0; i < n; i++) {
      const top = z0 - step * i, bot = top - step, main = i === 0, hz = (h0 => i < n - 1 && h0 - 4.2 - (bot + .2) < 2.4 && top - (bot + 6.8 + 4.2) >= 4 ? bot + 6.8 : h0)(bot + step * (main ? .38 : .45)) /* the 中門 behind the hall keeps 2.4 m clear (QA door check) */, bays = main && wealth >= 3 && cw > 24 ? 5 : 3, bw = main ? 3.9 : 3.5, dbays = 2;
      const lou = !main && i === n - 1 && wealth >= 3 && R() < .45; // a 藏書樓 / 閣 in the rear court of some great houses
      if (lou) { lot.foot.push([cx - 3 * bw / 2 - 2, hz - 5, cx + 3 * bw / 2 + 2, hz + 5]); ARCH.lou(L, ...(p => [p[0], 0, p[2]])(F.p(cx, 0, hz)), { furnish: main ? "rich" : "hall", lot: lot.seed, wealth: lot.wealth || 3, yaw: F.yaw, bays: 3, dbays: 2, bayW: bw, dbayW: 3.3, colH1: 3.4, colH2: 3.0, platform: .7, paint, fish: true, seed: lot.seed + 30 }); }
      const hb = lou ? null : COMP.B(L, lot, F, cx, hz, 0, { furnish: main ? 'rich' : 'hall', bays, dbays, bayW: bw, dbayW: 3.4, colH: main ? 3.8 : 3.4, platform: main ? .9 : .6, pm: .8, brackets: main && wealth >= 3 ? 'full' : 'simple', paint, walls: 'white', roof: main && wealth >= 3 ? 'xieshan' : 'gable', fish: wealth >= 3, doorOpen: R() < .6, backDoor: true, windows: true, glow: R() < .3 ? .5 : 0, railing: main && wealth >= 3 && R() < .5, blind: R() < .5, seed: lot.seed + 10 + i });
      if (main) zHall = hz; if (hb) ARCH.dress(L, hb, RNG(lot.seed * 3 + 5 + i * 17), 'rich');
      // corridors 迴廊 along both sides of the court in front of the hall (廊院), else side rooms 廂
      const cz0 = top - .5, cxw = cw / 2 - 2.1 /* the side corridors clear of the lot wall (they ran into it, and in the 北里 into the neighbour's) */, cz1 = cxw - 1.3 < (lou ? 3 * bw : bays * bw) / 2 + .8 ? hz + (lou ? 2 : dbays) * 3.4 / 2 + .85 : hz + 1.5; /* corridors in line with the hall end at its front edge (they used to run into its corners) */
      if (main && wealth >= 3 && cz0 - cz1 > 5 && !ARCH.lod) { const px0 = cx - (cxw - 1.9), px1 = cx + (cxw - 1.9), pz0 = hz + 6.2, pz1 = top - .2; if (px1 - px0 > 4 && pz1 - pz0 > 3 && !(c4 => COMP.wetRect(Math.min(...c4.map(q => q[0])), Math.min(...c4.map(q => q[2])), Math.max(...c4.map(q => q[0])), Math.max(...c4.map(q => q[2]))))([F.p(px0, 0, pz0), F.p(px1, 0, pz1)])) { const pc = F.p((px0 + px1) / 2, 0, (pz0 + pz1) / 2); L.mb.s({ tex: 'pave', col: [1.02, .97, .9] }).T(pc[0], 0, pc[2], 0, F.yaw, 0).box(0, .03, 0, px1 - px0, .06, pz1 - pz0, { world: 1.6, skip: ['bot'] }).pop(); L.mb.s({ col: [1, 1, 1] }); lot.foot.push([px0, pz0, px1, pz1]); } } // stone-paved court 甬道 / 方磚 slabs
      if (cz0 - cz1 > 5) { if (main && wealth >= 3) { for (const sd of [-1, 1]) { ARCH.corridor(L, ...(p => [p[0], p[2]])(F.p(cx + sd * cxw, 0, cz0)), ...(p => [p[0], p[2]])(F.p(cx + sd * cxw, 0, cz1)), { w: 2.6, wall: sd, paint, rail: false, seed: lot.seed + sd }); if (lot.foot) lot.foot.push([cx + sd * cxw - 1.6, cz1, cx + sd * cxw + 1.6, cz0]); } }
        else if (cz0 - (hz + 4.5) > 4) for (const sd of [-1, 1]) { const c1 = hz + 4.5, nb = Math.max(1, Math.min(3, Math.floor((cz0 - c1) / 3.4))); /* side rooms start clear of the hall's front */ COMP.B(L, lot, F, cx + sd * (cw / 2 - 3.95), (cz0 + c1) / 2, -sd * PI / 2, /* eaves clear of the lot wall (they reached over it: two neighbours' wings met across the walls) */ { furnish: 'room', bays: nb, dbays: 1, bayW: 3.3, dbayW: 4, colH: 3, platform: .4, pm: .4, brackets: 'none', paint, walls: 'white', roof: 'gable', windows: true, seed: lot.seed + 20 + i * 2 + sd }); } }
      if (i < n - 1) { const zc = bot + .2, hW = (lou ? 3 : bays) * bw / 2 + .8, sdg = side ? -1 : 1, off = hz - 4.2 - zc < 2.2 && hW + 2.2 < cw / 2 - 1.6 ? sdg * (hW + 1.6) : 0, gx = cx + off; // 中門 on the axis, or beside the hall when the hall's back stands closer than 2.2 m (QA door check)
        const a = F.p(-w / 2 + .365, 0, zc), b = F.p(gx - 1.6, 0, zc), c = F.p(gx + 1.6, 0, zc), e = F.p(side ? w / 2 - side - .3 : w / 2 - .365, 0, zc);
        COMP.wall(L, a[0], a[2], b[0], b[2], { h: 2.5, t: .4 }); COMP.wall(L, c[0], c[2], e[0], e[2], { h: 2.5, t: .4 }); COMP.gate(L, F, gx, zc, 2.8, { h: 2.6, paint, studs: false, cls: 0 }); } // 中門
    }
    lot.zMain = zHall;
    if (side) { // service court: separated by a wall, stable, carriage shed, storehouses 庫, kitchen
      const sx = w / 2 - side / 2, xw = w / 2 - side - .3, a = F.p(xw, 0, zf), b = F.p(xw, 0, -d / 2 + .365); COMP.wall(L, a[0], a[2], b[0], b[2], { h: 2.6, t: .45 });
      COMP.gate(L, F, sx, zf, 2.6, { h: 2.6, paint, studs: false, cls: 0 }); // service gate: rich gates are always shut (E passes)
      COMP.stable(L, lot, F, sx, zf - 6, PI, Math.max(1, Math.min(4, Math.floor((side - 2) / 3))), R);
      COMP.B(L, lot, F, sx, -d / 2 + 4.5, 0, { bays: Math.max(1, Math.min(4, Math.floor((side - 2) / 3.4))), dbays: 1, bayW: 3.4, dbayW: 4.2, colH: 3.1, platform: .6, pm: .4, brackets: 'none', paint: 'plain', walls: 'plank', roof: 'gable', windows: false, door: [0], seed: lot.seed + 40 });
      COMP.kitchen(L, lot, F, sx, (zf - 6 - d / 2 + 4.5) / 2, 0, look, R);
      if (d > 50) ARCH.granary(L, ...(p => [p[0], p[2]])(F.p(sx + side / 2 - 2.6, 0, (zf - d / 2) / 2 - 6)), 1.6, 2.8, lot.seed + 3);
    }
    // back garden: a pavilion 亭
    if (d > 40 && R() < .6 && !ARCH.lod) { const p = F.p(cx + (R() - .5) * cw * .4, 0, -d / 2 + 5); ARCH.pavilion(L, p[0], 0, p[2], { yaw: F.yaw + PI, sides: R() < .5 ? 4 : 6, r: 1.8, colH: 2.7, platform: .4, paint, benches: true }); if (lot.foot) lot.foot.push([p[0] - 3, -d / 2 + 2, p[0] + 3, -d / 2 + 8]); }
    if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, F, w, d, R, 'rich');
  },
  shop(L, lot, F, w, d, R) { // a row of shopfronts 肆 along the street, each with its trade, sign object, awning; yards and back rooms behind
    lot.foot = []; const n = Math.max(1, Math.round(w / (6 + R() * 2.5))), uw = w / n, sd = Math.min(5.5, d - 2); lot.gx = 0; lot.zMain = d / 2 - sd / 2;
    for (let i = 0; i < n; i++) { const R2 = RNG(lot.seed * 7 + i), ux = -w / 2 + uw * (i + .5), trade = i === 0 && lot.trade ? lot.trade : COMP.pick(R2, ['cloth', 'pottery', 'medicine', 'grain', 'books', 'butcher', 'bakery', 'rope', 'tea', 'cloth', 'grain']), st = R2() < .06 ? 2 : 1;
      const sh = ARCH.shop(L, ...F.p(ux, 0, d / 2 - sd / 2 - 1.0), { ...COMP.night(lot, 'shop'), jars: false, cls: 1, yaw: F.yaw, w: uw - .8, d: sd, storeys: st, colH: 2.9 + (i & 1) * .35 + R2() * .2, front: R2() < .65 ? 'counter' : 'shutters', walls: R2() < .5 ? 'white' : 'plank', sign: null, flag: null, awning: R2() < .55, paint: R2() < .7 ? 'plain' : 'ochre', tiles: R2() < .12 ? 'thatch' : undefined, seed: lot.seed + i });
      lot.foot.push([ux - uw / 2, d / 2 - sd - 1, ux + uw / 2, d / 2]);
      ARCH.goods(L, F, ux, .25, d / 2 - 1.0, uw - .8, trade, RNG(lot.seed * 5 + 10 + i * 17), { sign: true, cls: 1, depth: sd, apron: .95, fk: sh.fk, colH: sh.colH });
      if (d > sd + 10 && uw > 6.5 && R2() < .6) { const bi = COMP.B(L, lot, F, ux, -d / 2 + 2.9, 0, /* >= 3 m clear before the shop's back (QA door check) */ { bays: uw > 8.5 ? 2 : 1, dbays: 1, bayW: Math.min(3.6, (uw - 1.6) / (uw > 8.5 ? 2 : 1)), dbayW: 4, colH: 2.8, platform: .3, pm: .3, brackets: 'none', paint: 'plain', walls: R2() < .4 ? 'adobe' : 'white', roof: 'gable', tiles: R2() < .3 ? 'thatch' : undefined, windows: true, seed: lot.seed + 50 + i }); ARCH.dress(L, bi, RNG(lot.seed * 3 + 6 + i * 17), 'poor'); }
    }
    if (d > 14) { COMP.enclose(L, F, w, d - sd - 1.2, 0, 0, { h: 2.3, z: -(sd + 1.2) / 2 }); for (let i = 1; i < n; i++) { const x = -w / 2 + uw * i, a = F.p(x, 0, d / 2 - sd - 1.2 - .3), b = F.p(x, 0, -d / 2 + .315); if (d - sd - 1.8 > 3) COMP.wall(L, a[0], a[2], b[0], b[2], { h: 2.1, t: .35 }); } }
    if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, F, w, d, R, 'house');
  },
  wineshop(L, lot, F, w, d, R) { // 酒肆: open front, jars, wine flag 酒旗; rarely a 樓 with an upper balcony
    lot.foot = []; const sw = Math.min(w - 1, 9 + R() * 4), sd = Math.min(6, d - 2), st = R() < .22 ? 2 : 1, sx = (R() - .5) * Math.max(0, w - sw - 1); lot.gx = sx; lot.zMain = d / 2 - sd / 2;
    const sh = ARCH.shop(L, ...F.p(sx, 0, d / 2 - sd / 2 - 1.0), { ...COMP.night(lot, 'wineshop'), jars: false, cls: 2, yaw: F.yaw, w: sw, d: sd, storeys: st, balcony: true, front: 'counter', walls: 'white', sign: null, flag: ['sign_jiu', 'flag_qing', 'sign_jiu_w', 'flag_bai', 'sign_jiu'][(lot.seed >>> 4) % 5], awning: true, paint: R() < .6 ? 'ochre' : 'plain', glow: .7, seed: lot.seed });
    lot.foot.push([sx - sw / 2 - .5, d / 2 - sd - 1, sx + sw / 2 + .5, d / 2]); ARCH.goods(L, F, sx, .25, d / 2 - 1.0, sw, 'wine', RNG(lot.seed * 5 + 11), { cls: 2, depth: sd, apron: .95, fk: sh.fk, colH: sh.colH });
    if (!ARCH.lod && typeof INTERIOR !== 'undefined') { for (const k of [-1, 1]) { const p = F.p(sx + k * Math.min(sw * .2 + .9, sw / 2 - 1.15), 0, d / 2 - sd / 2 - 1.2); /* platforms beside the door path, clear of the wall jars */ L.prop(b2 => INTERIOR.F.ta(b2, 1.6, 1.1, RNG(lot.seed + 11 + k)), p[0], .25, p[2], { yaw: F.yaw, solid: { w: 1.6, h: .5, d: 1.1 } }); }
      const q = F.p(sx - sw * .4, 0, d / 2 - sd / 2 - 1.6); L.prop(b2 => PROPS.oilLamp(b2, true), q[0], .25, q[2], {}); L.light(q[0], 1.6, q[2], 5, [1.4, .8, .4], { flicker: .2 }).group = 3;
      const g = F.p(sx, 0, d / 2 - .4); L.light(g[0], 1.3, g[2], 7.5, [1.1, .6, .28], { flicker: .12 }).group = 3; } // light spilling out of the open front onto the street
    if (w - sw > 8) { const ox = sx + Math.sign(-sx || 1) * (sw / 2 + (w / 2 - sw / 2 - Math.abs(sx)) / 2 + .2), ow = w / 2 - sw / 2 - Math.abs(sx) - 1, R2 = RNG(lot.seed + 3), tr = COMP.pick(R2, ['tea', 'bakery', 'pottery', 'grain']); if (ow > 4.5) { const sh2 = ARCH.shop(L, ...F.p(ox, 0, d / 2 - 3.25), { ...COMP.night(lot, 'shop'), jars: false, cls: 1, yaw: F.yaw, w: ow, d: 4.5, colH: 2.8, front: 'counter', walls: 'plank', paint: 'plain', awning: R2() < .6, seed: lot.seed + 9 }); ARCH.goods(L, F, ox, .25, d / 2 - 1.0, ow, tr, RNG(lot.seed * 5 + 12), { sign: true, cls: 1, depth: 4.5, apron: .95, fk: sh2.fk, colH: sh2.colH }); lot.foot.push([ox - ow / 2, d / 2 - 5.5, ox + ow / 2, d / 2]); } }
    if (d > 14) COMP.enclose(L, F, w, d - sd - 1.2, 0, 0, { h: 2.3, z: -(sd + 1.2) / 2 });
    if (d > 18 && w > 10) COMP.kitchen(L, lot, F, -w / 2 + 2.8, -d / 2 + 2, 0, COMP.look(R, 1), R);
  },
  inn(L, lot, F, w, d, R) { // 邸店 / 旅舍: front building on the street (passage through), stables, rows of guest rooms round a yard, carts
    if (w < 13 || d < 18) return COMP.house(L, lot, F, w, d, R);
    lot.foot = []; const zf = d / 2 - .3, fD = 4.6, fb = Math.min(5, Math.floor((w - 1) / 3.4)), fW = fb * 3.4, mid = (fb - 1) >> 1; lot.gx = 0;
    const kinds = Array(fb).fill('window'); kinds[mid] = 'boardopen'; if (fb > 2) kinds[0] = 'counter';
    const two = R() < .3;
    const f = COMP.B(L, lot, F, 0, zf - fD / 2, 0, { cls: 2, furnish: 'tavern', bays: fb, dbays: 1, bayW: 3.4, dbayW: fD, colH: 3.1, platform: .25, pm: .3, brackets: 'none', paint: R() < .5 ? 'ochre' : 'plain', walls: 'white', roof: 'gable', steps: false, fill: { front: kinds, back: kinds.map((k, i) => i === mid ? 'opendoor' : 'window'), left: ['wall'], right: ['wall'] }, seed: lot.seed });
    ARCH.dress(L, f, RNG(lot.seed * 3 + 7), 'house'); if (fb > 2) ARCH.hangSign(L, F, -fW / 2 + .6, .25, zf + .1, 'tea', RNG(lot.seed + 77));
    COMP.enclose(L, F, w, d, 0, -1, { h: 2.6, front: [[-w / 2, -fW / 2 - .02], [fW / 2 + .02, w / 2]] }); void two;
    const yz1 = zf - fD - 1, yz0 = -d / 2 + .3; lot.zMain = (yz0 + yz1) / 2;
    COMP.stable(L, lot, F, -w / 2 + 2.8, (yz0 + yz1) / 2, PI / 2, Math.max(1, Math.min(4, Math.floor((yz1 - yz0 - 2) / 3))), R);
    const rb = Math.max(1, Math.min(5, Math.floor((w - 8) / 3.2), w > 18 ? Math.floor((w / 2 - 8.05) / 1.6) : 9)); /* clear of the side rooms (w > 18) and their doors (QA door check) */ const rr = COMP.B(L, lot, F, 1.5, yz0 + 3.0, 0, { furnish: 'room', bays: rb, dbays: 1, bayW: 3.2, dbayW: 4, colH: 2.8, platform: .35, pm: .35, brackets: 'none', paint: 'plain', walls: 'white', roof: 'gable', fill: { front: Array(rb).fill(0).map((_, i) => i & 1 ? 'window' : 'door'), back: Array(rb).fill('wall'), left: ['wall'], right: ['wall'] }, seed: lot.seed + 5 }); ARCH.dress(L, rr, RNG(lot.seed * 3 + 8), 'poor');
    if (w > 18) { const nb = Math.max(1, Math.min(3, Math.floor((yz1 - yz0 - 7) / 3.2))); if (nb >= 1) COMP.B(L, lot, F, w / 2 - 2.8, (yz0 + yz1) / 2 + 1.5, -PI / 2, { bays: nb, dbays: 1, bayW: 3.2, dbayW: 3.8, colH: 2.8, platform: .3, pm: .3, brackets: 'none', paint: 'plain', walls: 'white', roof: 'gable', fill: { front: Array(nb).fill(0).map((_, i) => i & 1 ? 'window' : 'door'), back: Array(nb).fill('wall'), left: ['wall'], right: ['wall'] }, seed: lot.seed + 6 }); }
    if (!ARCH.lod) { const p = F.p(1, 0, (yz0 + yz1) / 2 + 2); L.prop(b2 => PROPS.cart(b2, {}), p[0], 0, p[2], { yaw: F.yaw + 1.2, solid: { w: 2, h: 1.6, d: 3.4 } }); }
    if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, F, w, d, R, 'house');
  },
  garden(L, lot, F, w, d, R) { lot.foot = []; COMP.enclose(L, F, w, d, 0, 2.1, { h: 2.4 }); COMP.gate(L, F, 0, d / 2 - .3, 2.2, {}); lot.gx = 0; for (let i = 0; i < Math.min(14, w * d / 70); i++) COMP.tree(L, F, (R() - .5) * (w - 4), (R() - .5) * (d - 4), ['huai', 'willow', 'elm', 'jujube', 'peach'][(R() * 5) | 0], .7 + R() * .5, lot.seed + i);
    if (w > 14 && d > 14 && R() < .6 && !ARCH.lod) { const p = F.p((R() - .5) * (w - 8), 0, (R() - .5) * (d - 8)); ARCH.pavilion(L, p[0], 0, p[2], { yaw: F.yaw, sides: R() < .5 ? 4 : 6, r: 1.6, colH: 2.6, platform: .35, paint: R() < .5 ? 'ochre' : 'plain', benches: true }); } },
  field(L, lot, F, w, d, R) { lot.foot = []; COMP.enclose(L, F, w, d, 0, 2.4, { style: 'mud', h: 1.8, t: .4, coping: false }); for (let i = 0; i < 3; i++) COMP.tree(L, F, (R() - .5) * (w - 4), (R() - .5) * (d - 4), 'elm', .8, lot.seed + i);
    if (w > 10 && !ARCH.lod) { const p = F.p(w / 2 - 3, 0, d / 2 - 3.5); COMP.B(L, lot, F, w / 2 - 3, d / 2 - 3.5, PI, { bays: 1, dbays: 1, bayW: 2.8, dbayW: 2.6, colH: 2.2, platform: .1, pm: .2, brackets: 'none', paint: 'plain', walls: 'mud', roof: 'gable', tiles: 'thatch', steps: false, windows: false, door: [0], doorOpen: true, rafters: false }); void p; } },
};

// =====================================================================================
// TREES (summer, Chang'an): 槐 (Chinese scholar tree: the avenue tree), 榆 elm, 柳 willow, 棗 jujube, 桃 peach, 松 pine.
// Trunk + branches (tubes) + lumpy leaf-mass clusters with a cutout leafy texture (double-sided foliage mesh).
// =====================================================================================
// ---- lot fronts (QA tool/qa_lots.js, tool/qa_build.js door check): a lot's gate / shopfront / doors face lot.front; when that side does not
// open onto a street or lane (subdivision can leave a lot backing onto its neighbours there), turn the lot to the side that does, so its
// gate never opens onto a neighbour's wall (the temple whose door a wall blocked). The ward wall has no openings but its gates, so it never
// counts as a way. A lot with no side on a way (big compounds inserted over a block leave their neighbours, and themselves, landlocked)
// gets an ACCESS LANE: a 3.6 m 巷 from the middle of its front straight out to the nearest street or lane (never through a big compound or
// the ward wall), plus a short stub along the front (the nav's door link); small lots in its way are clipped or dropped.
// Called at the end of WARD.layout / MARKET.layout, before nav and doors.
COMP.frontFix = function (out) { const ways = (out.streets || []).concat(out.lanes || []).map(s => s.r), W = out.wd.r, I = out.inner || W, NB = 0;
  const open = (lot, f) => { const r = lot.r, o = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f], hz = f === 'n' || f === 's', a0 = hz ? r.x0 : r.z0, a1 = hz ? r.x1 : r.z1, ns = Math.max(3, Math.round((a1 - a0) / 2)); let ok = 0;
    for (let i = 0; i < ns; i++) { const u = a0 + (i + .5) * (a1 - a0) / ns, ex = f === 'e' ? r.x1 : f === 'w' ? r.x0 : 0, ez = f === 's' ? r.z1 : f === 'n' ? r.z0 : 0; let good = true;
      for (const k of [1, 2]) { const x = (hz ? u : ex) + o[0] * k, z = (hz ? ez : u) + o[1] * k; if (ways.some(q => x >= q.x0 - .3 && x <= q.x1 + .3 && z >= q.z0 - .3 && z <= q.z1 + .3)) continue; good = false; break; }
      if (good) ok++; } return ok / ns; };
  let n = 0; for (const lot of out.lots) { if (!lot.front || !lot.r || lot.type === 'pond' || lot.type === 'field' || lot.fixedFront) continue; if (open(lot, lot.front) >= .6) continue;
    let best = lot.front, bv = -1; for (const f of ['s', 'n', 'e', 'w']) { const v = open(lot, f); if (v > bv + 1e-9) { bv = v; best = f; } } if (bv >= .6 && best !== lot.front) { lot.front0 = lot.front; lot.front = best; n++; } }
  // access lanes for the lots still facing no way
  const LW = WARD.LANE_W, ovl = (a, q, m = 0) => a.x0 < q.x1 - m && a.x1 > q.x0 + m && a.z0 < q.z1 - m && a.z1 > q.z0 + m, onWay = (x, z) => ways.some(q => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1); let na = 0;
  for (const lot of out.lots.slice()) { if (!lot.front || !lot.r || lot.type === 'pond' || lot.type === 'field' || !out.lots.includes(lot) || open(lot, lot.front) >= .6) continue; const r = lot.r; let best = null;
    for (const f of [lot.front, 's', 'n', 'e', 'w']) { const o = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f], hz = f === 'n' || f === 's', gx = hz ? rcx(r) : f === 'e' ? r.x1 : r.x0, gz = hz ? (f === 's' ? r.z1 : r.z0) : rcz(r);
      for (let k = 1; k <= 160; k++) { const x = gx + o[0] * k, z = gz + o[1] * k; if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1) break; const P = rect(gx - (hz ? LW / 2 : 0), gz - (hz ? 0 : LW / 2), x + (hz ? LW / 2 : 0), z + (hz ? 0 : LW / 2));
        if (out.lots.some(l => l !== lot && (l.big || l.type === 'pond') && ovl(P, l.r, .05))) break; if (onWay(x, z) && onWay(x + (hz ? LW / 2 - .2 : 0), z + (hz ? 0 : LW / 2 - .2)) && onWay(x - (hz ? LW / 2 - .2 : 0), z - (hz ? 0 : LW / 2 - .2))) { if (!best || k < best.k) best = { k, f, P, hz, gx, gz, o }; break; } } }
    if (!best) continue; const { f, P, hz, gx, gz, o } = best, sl = Math.min(8, (hz ? rw(r) : rd(r)) - 1), S = rect(gx - (hz ? sl / 2 : 0) + (hz ? 0 : o[0] > 0 ? 0 : -LW), gz - (hz ? (o[1] > 0 ? 0 : LW) : sl / 2), gx + (hz ? sl / 2 : (o[0] > 0 ? LW : 0)), gz + (hz ? (o[1] > 0 ? LW : 0) : sl / 2));
    out.lanes.push({ r: P, axis: hz ? 'z' : 'x', access: true }, { r: S, axis: hz ? 'x' : 'z', access: true }); ways.push(P, S); lot.front0 = lot.front0 || lot.front; lot.front = f; na++;
    out.lots = out.lots.map(l => { if (l === lot || l.big || !(ovl(l.r, P, .05) || ovl(l.r, S, .05))) return l; let rr = l.r; for (const q of [P, S]) { if (!ovl(rr, q, .05)) continue; const parts = [rect(rr.x0, rr.z0, Math.min(rr.x1, q.x0), rr.z1), rect(Math.max(rr.x0, q.x1), rr.z0, rr.x1, rr.z1), rect(rr.x0, rr.z0, rr.x1, Math.min(rr.z1, q.z0)), rect(rr.x0, Math.max(rr.z0, q.z1), rr.x1, rr.z1)].filter(p => rw(p) >= 9 && rd(p) >= 9 && !ovl(p, P, .05) && !ovl(p, S, .05)).sort((A, B) => rw(B) * rd(B) - rw(A) * rd(A)); if (!parts.length) return null; rr = parts[0]; } return Object.assign({}, l, { r: rr }); }).filter(Boolean); }
  if (na) for (const lot of out.lots) { if (!lot.front || lot.type === 'pond' || lot.type === 'field' || open(lot, lot.front) >= .6) continue; let bf = lot.front, bv = -1; for (const f of ['s', 'n', 'e', 'w']) { const v = open(lot, f); if (v > bv + 1e-9) { bv = v; bf = f; } } if (bv >= .6) lot.front = bf; } // the clipped neighbours face the new lane where they must
  out.frontFixed = n; out.accessLanes = na; return n; };
// is (x, z) on a street or lane of its ward (true when the layout is unknown)
COMP.wayAt = (x, z) => { if (typeof CITY === 'undefined' || !CITY.lay || !CITY.lay.length) return true; for (const lay of CITY.lay) { const r = lay.wd && lay.wd.r; if (!r || x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue; return (lay.streets || []).concat(lay.lanes || []).some(s => x >= s.r.x0 && x <= s.r.x1 && z >= s.r.z0 && z <= s.r.z1); } return false; };
// ---- canal keep-out (QA tool/qa_water.js "blocked"): nothing of a compound stands in a canal that runs through it (great houses, offices
// and temples keep their lots when a canal crosses them). Walls, corridors split around the channel; buildings, gates, pavilions, towers
// and trees in it are left out. All detail levels but the far one (ARCH.lod 2 keeps its massing).
COMP.wet = (x, z, m = 0) => { if (typeof CANAL === 'undefined') return false; const n = CANAL.near(x, z); return !!n && n.d < n.w / 2 + .5 + m; };
COMP.wetRect = (x0, z0, x1, z1, m = 0) => typeof CANAL !== 'undefined' && CANAL.hits(rect(x0, z0, x1, z1), .5 + m);
COMP.dryRuns = (x0, z0, x1, z1, m) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / .4)), out = []; let a = null;
  for (let k = 0; k <= n; k++) { const f = k / n, wet = COMP.wet(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, m); if (!wet && a === null) a = f; if ((wet || k === n) && a !== null) { const b = wet ? Math.max(a, (k - 1) / n) : 1; if ((b - a) * len > .6) out.push([x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, z0 + (z1 - z0) * b]); a = null; } }
  return out; };
{ const _wall = COMP.wall; COMP.wall = function (L, x0, z0, x1, z1, o = {}) { if (ARCH.lod === 2 || !COMP.wetRect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (o.t ?? .5) / 2)) return _wall.apply(this, arguments); for (const r of COMP.dryRuns(x0, z0, x1, z1, (o.t ?? .5) / 2)) _wall.call(this, L, r[0], r[1], r[2], r[3], o); }; }
{ const _c = ARCH.corridor; ARCH.corridor = function (L, x0, z0, x1, z1, o = {}) { if (ARCH.lod === 2 || !COMP.wetRect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (o.w || 2.8) / 2)) return _c.apply(this, arguments); let r = null; for (const q of COMP.dryRuns(x0, z0, x1, z1, (o.w || 2.8) / 2 + .2)) r = _c.call(this, L, q[0], q[1], q[2], q[3], o); return r; }; }
{ const _g = ARCH.gate; ARCH.gate = function (L, x, y, z, o = {}) { if (ARCH.lod !== 2 && COMP.wet(x, z, (o.w || 3.2) / 2 + .8)) return { F: ARCH.F(x, y, z, o.yaw || 0), top: y, ridge: y + 3 }; return _g.apply(this, arguments); }; }
for (const k of ['lou', 'lou2', 'pavilion']) { const f = ARCH[k]; ARCH[k] = function (L, x, y, z, o = {}) { if (ARCH.lod !== 2) { const h = k === 'pavilion' ? (o.r || 2.2) + (o.pm ?? 1) + 1 : Math.max((o.bays || 3) * (o.bayW || 3.6), (o.dbays || 2) * (o.dbayW || 3.4)) / 2 + 1.5; if (COMP.wetRect(x - h, z - h, x + h, z + h)) return { F: ARCH.F(x, y, z, o.yaw || 0), top: y, floors: [], stairs: [] }; } return f.apply(this, arguments); }; }
{ const _h = COMP.hall; COMP.hall = function (L, F, lx, lz, yaw, o) { if (ARCH.lod !== 2) { const W = Array.isArray(o.bayW) ? o.bayW.reduce((a, c) => a + c, 0) : (o.bays || 3) * (o.bayW || 3.6), D = Array.isArray(o.dbayW) ? o.dbayW.reduce((a, c) => a + c, 0) : (o.dbays || 2) * (o.dbayW || 3.4), pm = (o.pm ?? .5) + .3, c = Math.abs(Math.cos(F.yaw + yaw)), s = Math.abs(Math.sin(F.yaw + yaw)), hx = (W / 2 + pm) * c + (D / 2 + pm) * s, hz = (W / 2 + pm) * s + (D / 2 + pm) * c, p = F.p(lx, 0, lz);
    if (COMP.wetRect(p[0] - hx, p[2] - hz, p[0] + hx, p[2] + hz)) return null; } return _h.apply(this, arguments); }; }
{ const _g = COMP.gate; COMP.gate = function (L, F, gx, z, w, o = {}) { const p = F.p(gx, 0, z); if (ARCH.lod !== 2 && COMP.wet(p[0], p[2], w / 2 + 1)) return; return _g.apply(this, arguments); }; }
const TREES = {
  place(L, x, y, z, kind, s = 1, seed = 1) { if (ARCH.lod !== 2 && COMP.wet(x, z, .3)) return; // no tree standing in a canal (QA tool/qa_water.js)
    if (typeof NATURE !== 'undefined' && NATURE.tree) return NATURE.tree(L, x, y, z, kind, s, seed);
    if (kind === 'pine') { L.prop(b => PROPS.pine(b, 7 * s, seed % 97), x, y, z, { foliage: true, solid: { r: .3, h: 3 } }); return; }
    L.prop(b => TREES.leafy(b, kind, s, seed), x, y, z, { foliage: true, yaw: (seed % 628) / 100, solid: { r: .25 * s, h: 3 } });
  },
  leafy(b, kind, s, seed) {
    const R = RNG(seed), K = { huai: { h: 9, cr: 4.4, ch: 4, leaf: 'leaf_huai', n: 9, tint: [1, 1, .95] }, elm: { h: 10, cr: 3.6, ch: 4.6, leaf: 'leaf_elm', n: 8, tint: [1, 1, 1] },
      willow: { h: 7.5, cr: 3.8, ch: 4.4, leaf: 'leaf_willow', n: 7, droop: 1, tint: [1, 1, 1] }, jujube: { h: 5.5, cr: 2.4, ch: 2.8, leaf: 'leaf_jujube', n: 6, tint: [1, 1, 1] }, peach: { h: 4, cr: 2.2, ch: 2.2, leaf: 'leaf_jujube', n: 5, tint: [1.05, 1, .95] } }[kind] || {};
    const H = K.h * s, cr = K.cr * s, trunkH = H - K.ch * s, lean = (R() - .5) * .35;
    const top = [lean * trunkH * .35, trunkH, (R() - .5) * .3];
    b.s({ tex: 'bark_tang', col: [1, 1, 1] }).tube([[0, -.1, 0], [lean * .15, trunkH * .5, 0], top], { r: [.26 * s, .19 * s, .15 * s], seg: 7, steps: 2, cap: [false, true], uvs: [2, 3] });
    // clusters on a dome: a ring low and wide, a ring higher, one on top
    const cl = [], n = K.n;
    for (let i = 0; i < n; i++) { const ring = i < n * .55 ? 0 : 1, a = (i / n) * TAU * 1.9 + R() * .6, rr = cr * (ring ? .38 : .72) * (.85 + R() * .3), y = trunkH + K.ch * s * (ring ? .7 : .42) + (R() - .5) * .5;
      cl.push([top[0] + Math.cos(a) * rr, y, top[2] + Math.sin(a) * rr, cr * (ring ? .5 : .48) * (.85 + R() * .3)]); }
    cl.push([top[0], trunkH + K.ch * s * .78, top[2], cr * .5]);
    for (const c of cl) if (c[1] < trunkH + K.ch * s * .5) b.s({ tex: 'bark_tang', col: [.9, .9, .9] }).tube([[top[0], top[1] - .4, top[2]], [lerp(top[0], c[0], .75), lerp(top[1], c[1], .75), lerp(top[2], c[2], .75)]], { r: [.12 * s, .05 * s], seg: 4, steps: 1, cap: false });
    for (const c of cl) { const rr = c[3], k = .9 + (c[1] - trunkH) / (K.ch * s) * .3 + R() * .08; b.s({ tex: K.leaf, col: [k * K.tint[0], k * K.tint[1], k * K.tint[2]], emi: .12 }); b.ell(c[0], c[1], c[2], rr, rr * (K.droop ? 1.0 : .7), rr, { seg: 9, ring: 6, disp: lumpy(.18, 1.4 / rr, seed % 31 + c[0]), uvs: [2.4 * rr, 1.6 * rr] }); }
    b.s({ emi: 0 });
    if (K.droop) for (let i = 0; i < 18; i++) { const a = R() * TAU, r = cr * (.55 + R() * .45), x = top[0] + Math.cos(a) * r, z = top[2] + Math.sin(a) * r, y = trunkH + K.ch * s * (.35 + R() * .35);
      b.s({ tex: 'leaf_willow_strand', col: [1, 1, 1] }).T(x, y, z, 0, a + PI / 2, 0); ARCH.card(b, -.5, -3 * s, 0, 1, 3.2 * s, [0, 0, 1, 1], true); b.pop(); }
  },
};

// =====================================================================================
// TANG — buildings specific to the city: ward wall & gate, pagoda
// =====================================================================================
const TANG = {
  cityWall(L, x0, z0, x1, z1, o = {}) { return ARCH.cityWall(L, x0, z0, x1, z1, o); }, // 外郭城 wall, walkable top with o.full (kit.js)
  // ward wall: rammed earth with slight batter, a tile coping; segment from (x0,z0) to (x1,z1)
  wardWall(L, x0, z0, x1, z1, o = {}) { const h = o.h || WARD.WALL_H, t = o.t || WARD.WALL_T, bat = .12, y = o.y || 0, wc = [1.16, 1.07, .9]; // pale lime-washed rammed earth
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, P = TANG.wardPierSize(), e0 = o.b0 ? P / 2 - .15 : 0, e1 = o.b1 ? P / 2 - .15 : 0; // butt ends stop 15 cm inside the pier
    ARCH.wall(L, x0 + ux * e0, z0 + uz * e0, x1 - ux * e1, z1 - uz * e1, { style: 'rammed', h, t, batter: bat, parapet: false, y, wcol: wc });
    TANG.wallCap(L, x0, z0, x1, z1, Object.assign({}, o, { b0: o.b0, b1: o.b1, rt: TANG.wardPierSize(true) / 2 + .02 }));
    if (ARCH.lod) return; const b = L.mb, yaw = Math.atan2(-(z1 - z0), x1 - x0), a = -len / 2 + e0, c = len / 2 - e1;
    b.T((x0 + x1) / 2, y, (z0 + z1) / 2, 0, yaw, 0); for (const sd of [-1, 1]) b.s({ tex: 'brick', col: [.9, .86, .8] }).box((a + c) / 2, .22, sd * (t / 2 - .03), c - a, .44, .16, { world: 1, skip: ['bot', 'px', 'nx'] }); // base course 墻基
    b.s({ col: [1, 1, 1] }); b.pop(); TANG.sluice(L, x0, z0, x1, z1, t + .2, y); },
  // 水竇: where a canal passes under a wall, a stone lintel slab carries the wall over the water (its underside closes the wall from below)
  sluice(L, x0, z0, x1, z1, t, y = 0) { if (ARCH.lod || typeof CANAL === 'undefined' || !COMP.wetRect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), t / 2)) return; const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), b = L.mb, n = Math.max(1, Math.ceil(len / .4)); let a = null;
    for (let k = 0; k <= n; k++) { const f = k / n, wet = COMP.wet(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, t / 2 - .5); if (wet && a === null) a = f; if ((!wet || k === n) && a !== null) { const u0 = a * len - .4, u1 = f * len + .4; b.T(x0, y, z0, 0, yaw, 0); b.s({ tex: 'stone', col: [.95, .93, .9] }).box((u0 + u1) / 2, -.13, 0, u1 - u0, .26, t, { world: 1 }).s({ tex: 'stone', col: [.12, .11, .1] }).box((u0 + u1) / 2, -.3, 0, u1 - u0 - .6, .06, t - .04, { world: 1, skip: ['top'] }).pop(); b.s({ col: [1, 1, 1] }); a = null; } } },
  wardPierSize(top) { const t = WARD.WALL_T, h = WARD.WALL_H, P = t + .5; return top ? P - 2 * h * .12 : P; },
  // ward-wall pier 墩: battered square block a little wider than the wall, with a hipped tiled cap whose eaves are level with the wall caps,
  // apex high enough to cover the caps' ends that run under it (corners, both sides of every gate)
  wardPier(L, x, z, o = {}) { const b = L.mb, h = WARD.WALL_H + .06, y = o.y || 0, P = TANG.wardPierSize(), Pt = TANG.wardPierSize(true), yaw = o.yaw || 0;
    b.s({ col: [1, 1, 1], emi: 0 }).T(x, y, z, 0, yaw, 0);
    b.s({ tex: 'rammed_earth', col: [1.16, 1.07, .9] }); const fl = !!o.flat, fs = Math.sign(o.flat || 0), Tx = fl ? P : Pt, q = (s, yy, sx = s) => [[sx, yy, s], [-sx, yy, s], [-sx, yy, -s], [sx, yy, -s]], cx = fl ? -fs * (.3 - .1) / 2 : 0, /* gate side: the cap stops 10 cm into the gate's side wall instead of overhanging the gateway */ B0 = q(P / 2, 0), B1 = q(Pt / 2, h, Tx / 2); // flat (gate piers): the x faces stay VERTICAL — tight against the gate post on one side, the wall end inside it on the other — batter only on the front / back faces
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, n = [(B0[i][0] + B0[j][0]) / 2, .25, (B0[i][2] + B0[j][2]) / 2]; ARCH.quad(b, B0[i], B0[j], B1[j], B1[i], n, [P / 3, h / 3]); }
    if (!ARCH.lod) { b.s({ tex: 'brick', col: [.9, .86, .8] }).box(0, .24, 0, P + .1, .48, P + .1, { world: 1, skip: ['bot'] }); }
    b.T(cx, 0, 0); const ye = h + .08 - .06 + .02, ov = .3, A = Pt / 2 + ov, yr = WARD.WALL_H + .42, k = (Pt / 2) / A, apex = (yr + .2 - ye * k) / (1 - k), C = q(A, ye, fl ? (P + .1 + ov) / 2 : Tx / 2 + ov), ap = [0, apex, 0];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, n = [(C[i][0] + C[j][0]) / 2, A, (C[i][2] + C[j][2]) / 2]; b.s({ tex: 'roof_tile' }); ARCH.poly(b, [C[i], C[j], ap], n, p => [(p[0] + p[2]) / 2, -p[1]]);
      if (!ARCH.lod) { b.s({ tex: 'tile_end' }); ARCH.quad(b, [C[i][0], ye - .07, C[i][2]], [C[j][0], ye - .07, C[j][2]], C[j], C[i], [n[0], 0, n[2]], [2 * A, 1]); b.s({ tex: 'roof_ridge' }); ARCH.sweep(b, [[C[i][0] * .96, ye + .06, C[i][2] * .96], [C[i][0] * .15, ye + .06 + (apex - ye) * .85, C[i][2] * .15]], .16, .12, { uv: 1 }); } }
    b.s({ tex: 'rafters', col: [.8, .8, .8] }); ARCH.poly(b, C.map(c => [c[0], ye - .07, c[2]]), [0, -1, 0], p => [p[0], p[2]]);
    b.s({ tex: 'rammed_earth', col: [1.16, 1.07, .9] }).box(-cx, (h + ye - .05) / 2, 0, fl ? Tx - .03 : Tx, ye - .05 - h + .02, Pt, { skip: ['bot', 'top'] }); // the pier body up into the cap: no sky under it (flat piers: 1.5 cm inside the vertical faces)
    if (!ARCH.lod) b.s({ tex: 'roof_ridge', col: [1, 1, 1] }).T(0, apex, 0).lathe([[.18, 0], [.14, .18], [.05, .32], [0, .36]], { seg: 6 }).pop();
    b.pop(); b.s({ col: [1, 1, 1] }); b.pop(); L.world.box(x, y + h / 2, z, P / 2, h / 2 + .3, P / 2, { yaw }); },
  wallCap(L, x0, z0, x1, z1, o = {}) { // small tiled coping ON the top of a rammed wall (same top height and width as the body): tiles, eave strips,
    // closed undersides (no sky between wall and cap), closed ends unless o.b0 / o.b1 (the end runs under a pier's cap)
    const b = L.mb, hh = o.h || WARD.WALL_H, h = hh + (o.y || 0), tt = Math.max(1, (o.t || WARD.WALL_T) - 2 * hh * (o.batter ?? .12)), dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
    b.s({ col: [1, 1, 1], emi: 0 }).T((x0 + x1) / 2, h, (z0 + z1) / 2, 0, yaw, 0);
    const ct = tt / 2 + .22, yr = .42, ye = .08, L2 = len / 2;
    for (const sd of [-1, 1]) { const A = [-sd * L2, ye, sd * ct], B = [sd * L2, ye, sd * ct], C = [sd * L2, yr, 0], D = [-sd * L2, yr, 0]; b.s({ tex: 'roof_tile' }).q4(A, B, C, D, [len / 2, .3]); b.s({ tex: 'tile_end' }).q4([-sd * L2, ye - .07, sd * ct], [sd * L2, ye - .07, sd * ct], B, A, [len / 2, 1]);
      b.s({ tex: 'rafters' }); ARCH.quad(b, [-L2, ye - .07, sd * ct], [L2, ye - .07, sd * ct], [L2, -.02, sd * tt / 2], [-L2, -.02, sd * tt / 2], [0, -1, sd * .3], [len / 2, .2]); } // underside, 2 cm into the wall top
    const rl = o.b0 ? (o.rt || .3) : .03, rr = o.b1 ? (o.rt || .3) : .03; b.s({ tex: 'roof_ridge' }).box((rl - rr) / 2, yr + .05, 0, len - rl - rr, .16, .22, { uv: [Math.max(1, Math.round(len)), 1] });
    for (const [sd, ex, butt] of [[-1, -L2, o.b0], [1, L2, o.b1]]) if (!butt) { b.s({ tex: 'plaster', col: [.9, .86, .8] }); ARCH.poly(b, [[ex, ye - .07, -ct], [ex, ye - .07, ct], [ex, yr, 0]], [sd, 0, 0], p => [p[2], -p[1]]); ARCH.poly(b, [[ex, ye - .07, -ct], [ex, ye - .07, ct], [ex, 0, tt / 2], [ex, 0, -tt / 2]], [sd, 0, 0], p => [p[2], -p[1]]); b.s({ col: [1, 1, 1] }); }
    b.pop();
  },

  // ward gate 坊門: a timber gate frame in the wall opening with a tiled roof and the ward's name board
  wardGate(L, x, z, yaw, o = {}) {
    const w = o.w || 5.2, h = 4.2, b = L.mb, F = ARCH.F(x, 0, z, yaw);
    const gfr = ARCH.frame(L, F, { bw: [w], dw: [WARD.WALL_T + 1.2], y0: 0, colH: h, colR: .2, brackets: 'simple', bs: 1.4, paint: 'ochre', roof: 'gable', chiwen: false, eave: .8, walls: 'white', ceiling: false, fill: { front: [ARCH.lod ? 'board' : 'portal'], left: ['wall'], right: ['wall'] }, studs: true, doorOpen: o.open !== false }); /* side walls close the gate house against the piers */
    if (!ARCH.lod) { const p = F.p(0, 0, -(WARD.WALL_T + 1.2) / 2 + .4); L.light(p[0], 2.4, p[2], 5, [.9, .5, .25], { flicker: .1 }); } // the gatekeeper's lamp, inside
    if (o.name) { b.T(x, 0, z, 0, yaw, 0); ARCH.hangTablet(b, gfr, o.nameTex, .45, 1.0, { frame: 'dark_wood', edge: 'dark_wood', gap: .06, inBay: true }); /* in front of the eave purlin, tilted to the street, on two rods */ b.pop(); }
  },
};
// brick pagoda (Tang square plan: corbelled 疊澀 eaves, arched openings, a finial 剎). Storey heights shrink upward.
// 醮壇: the Daoist altar terrace for 齋醮 rites (three square brick tiers, paved tops, stone curbs, a flight of steps on each side) — the
// characteristic open-air structure of a 觀, where a Buddhist monastery would have its pagoda; s0 = bottom side
TANG.altar = function (L, x, y, z, yaw = 0, s0 = 16, n = 3, th = .9) { const b = L.mb; let yy = 0; b.T(x, y, z, 0, yaw, 0);
  for (let k = 0; k < n; k++) { const s = s0 * (1 - k * .27); b.s({ tex: 'brick', col: [1.05, 1, .95] }).box(0, yy + th / 2, 0, s, th, s, { faces: { top: 'pave' }, skip: ['bot'], world: 1.5 }); b.s({ tex: 'stone', col: [.95, .95, .93] }).box(0, yy + th - .06, 0, s + .08, .12, s + .08, { skip: ['bot', 'top'], world: 1.5 }); // world-scaled texture (one tile per face stretched the paving and squashed the brick)
    if (!ARCH.lod) { L.world.box(x, y + yy + th / 2, z, s / 2, th / 2, s / 2, { yaw, surface: 'brick' }); for (let f = 0; f < 4; f++) { const a = f * PI / 2, e = s / 2 + .01; ARCH._steps(L, ARCH.F(x + Math.sin(yaw + a) * e, y + yy, z + Math.cos(yaw + a) * e, yaw + a), 0, 0, 0, 2.4, th, {}); } }
    yy += th; }
  if (!ARCH.lod) b.s({ tex: 'bronze', col: [.8, .7, .5] }).T(0, yy, 0).lathe([[0, 0], [.35, 0], [.42, .3], [.3, .45], [.36, .6], [0, .62]], { seg: 8 }).pop(); // a censer 香爐 on top
  b.pop(); b.s({ col: [1, 1, 1] }); return { top: y + yy }; };
TANG.pagoda = function (L, x, y, z, o = {}) {
  const b = L.mb, n = o.storeys || 7, W0 = o.w || 10, H1 = o.h1 || W0 * .5, taper = o.taper ?? .075, dense = o.dense; // dense: 密檐 (小雁塔 style)
  b.T(x, y, z, 0, o.yaw || 0, 0);
  b.s({ tex: 'brick', col: [1, .98, .94] }).box(0, .6, 0, W0 + 3, 1.2, W0 + 3, { world: 1.2, skip: ['bot'] });
  let yy = 1.2, w = W0;
  for (let i = 0; i < n; i++) {
    const h = dense ? (i === 0 ? H1 * 1.6 : H1 * .32) : H1 * (1 - i * .05), wt = w * (1 - taper * .5);
    // body (slightly tapered box via two stacked boxes), pilaster strips and an opening on each face
    b.s({ tex: 'brick', col: [1.45, 1.36, 1.2] }).box(0, yy + h / 2, 0, w, h, w, { world: 1.2, skip: ['bot', 'top'] });
    if (!dense || i === 0) for (let f = 0; f < 4; f++) { b.T(0, yy, 0, 0, f * PI / 2, 0);
      const ow = Math.min(1.4, w * .16), oh = Math.min(2.4, h * .55); b.s({ tex: 'dark_wood', col: [.25, .2, .18] }).box(0, h * .18 + oh / 2, w / 2 + .01, ow, oh, .04); // dark opening (proud by 2 cm; 'door' depth read via ink)
      b.s({ tex: 'brick', col: [1.3, 1.22, 1.08] }); for (const sx of [-1, 1]) b.box(sx * (w / 2 - .25), h / 2, w / 2 + .06, .3, h, .12, { world: 1 });
      b.pop(); }
    yy += h;
    // corbelled eave: steps out, then back in
    const steps = dense ? 4 : 6; let ww = w; b.s({ tex: 'brick', col: [1.4, 1.32, 1.18] });
    for (let k = 0; k < steps; k++) { ww += .14; b.box(0, yy + .09, 0, ww, .18, ww, { world: 1 }); yy += .18; }
    b.s({ tex: 'roof_tile', col: [.9, .9, .92] }).box(0, yy + .06, 0, ww + .1, .12, ww + .1, { world: 1.2 }); yy += .12;
    for (let k = 0; k < steps - 1; k++) { ww -= .2; b.s({ tex: 'brick', col: [1.4, 1.32, 1.18] }).box(0, yy + .09, 0, ww, .18, ww, { world: 1, skip: ['bot'] }); yy += .18; }
    w = w * (1 - taper);
  }
  // finial
  b.s({ tex: 'brick', col: [.9, .88, .84] }).box(0, yy + .4, 0, w * .6, .8, w * .6, { world: 1, skip: ['bot'] }); yy += .8;
  b.s({ tex: 'iron', col: [.8, .7, .6] }).T(0, yy, 0).lathe([[0, 0], [.6, 0], [.7, .4], [.3, .6], [.1, 3], [.35, 3.2], [.1, 3.5], [.3, 3.8], [.08, 4.1], [.2, 4.4], [0, 5]], { seg: 8 }).pop();
  b.pop();
  L.world.box(x, y + yy / 2, z, (W0 + 3) / 2, yy / 2, (W0 + 3) / 2, { yaw: o.yaw || 0 });
  return { top: y + yy };
};

// =====================================================================================
// WARD BUILD — full-detail geometry of a laid-out ward into L (walls, gates, lots, trees, wells, ground)
// =====================================================================================
WARD.groundRaster = function (lay, cell = 2) {
  const r = lay.wd.r, m = 30, x0 = r.x0 - m, z0 = r.z0 - m, nx = Math.ceil((rw(r) + 2 * m) / cell), nz = Math.ceil((rd(r) + 2 * m) / cell), g = new Uint8Array(nx * nz).fill(GC.STREET);
  const fill = (q, v) => { for (let j = Math.max(0, Math.floor((q.z0 - z0) / cell)); j < Math.min(nz, Math.ceil((q.z1 - z0) / cell)); j++) for (let i = Math.max(0, Math.floor((q.x0 - x0) / cell)); i < Math.min(nx, Math.ceil((q.x1 - x0) / cell)); i++) g[j * nx + i] = v; };
  fill(rect(r.x0, r.z0, r.x1, r.z1), GC.GARDEN);
  for (const l of lay.lots) fill(l.r, l.type === 'garden' || l.type === 'pond' ? GC.GARDEN : l.type === 'field' ? GC.FIELD : /rich|temple|office|mansion|jinzou/.test(l.type) ? GC.PAVED : GC.YARD);
  for (const s of lay.streets) fill(s.r, GC.STREET); for (const s of lay.lanes) fill(s.r, GC.LANE);
  return { x0, z0, cell, nx, nz, g, at(x, z) { const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); return i < 0 || j < 0 || i >= nx || j >= nz ? GC.STREET : g[j * nx + i]; } };
};
WARD.build = function (L, lay, o = {}) {
  const wd = lay.wd, r = wd.r, T = WARD.WALL_T, gw = 7.2; // wall opening for a gate
  // ward wall: four sides with gaps at the gates (wall centreline inset by T/2)
  const sides = [['n', r.x0, r.z0 + T / 2, r.x1, r.z0 + T / 2], ['s', r.x0, r.z1 - T / 2, r.x1, r.z1 - T / 2], ['w', r.x0 + T / 2, r.z0, r.x0 + T / 2, r.z1], ['e', r.x1 - T / 2, r.z0, r.x1 - T / 2, r.z1]];
  for (const [sd, ax, az, bx, bz] of sides) {
    const g = lay.gates.find(q => q.side === sd), horiz = az === bz, cuts = [];
    if (g) cuts.push(horiz ? g.x : g.z);
    let p0 = horiz ? ax : az; const p1 = horiz ? bx : bz, segs = [];
    for (const c of cuts) { segs.push([p0, c - gw / 2]); p0 = c + gw / 2; } segs.push([p0, p1]);
    for (const [u0, u1] of segs) for (let u = u0; u < u1 - .1; u += 48) { const v = Math.min(u1, u + 48); if (horiz) TANG.wardWall(L, u, az, v, az); else TANG.wardWall(L, ax, u, ax, v); }
    if (g) TANG.wardGate(L, horiz ? g.x : ax, horiz ? az : g.z, { n: PI, s: 0, w: -PI / 2, e: PI / 2 }[sd], { name: wd.name, nameTex: o.nameTex });
  }
  for (const lot of lay.lots) { if (o.filter && !o.filter(lot)) continue; COMP.build(L, lot); }
  for (const t of lay.trees) TREES.place(L, t.x, 0, t.z, t.kind, t.s, t.seed);
  for (const w of lay.wells) L.prop(PROPS.well, w.x, 0, w.z, { solid: { r: .9, h: .8 } });
};
WARD.terrain = function (L, lay, gr, o = {}) {
  const r = lay.wd.r, m = o.margin ?? 30;
  L.terrain({ x0: r.x0 - m, z0: r.z0 - m, w: rw(r) + 2 * m, d: rd(r) + 2 * m, cell: o.cell || 2, h: () => 0, layers: ['loess', 'yard', 'grass_summer', 'field_crop'], uv: 3,
    wt: (x, z) => { const c = gr.at(x, z); return c === GC.STREET || c === GC.LANE ? [1, 0, 0, 0] : c === GC.YARD || c === GC.PAVED ? [0, 1, 0, 0] : c === GC.FIELD ? [0, 0, 0, 1] : [0, .3, 1, 0]; } });
};

// =====================================================================================
// NAV — walk graph of a ward: centrelines of streets and lanes split at crossings, plus one door node per lot
// nav = {nodes: [{x, z, kind: 'x'|'door'|'gate'|'end', lot?}], edges: [{a, b, w (street width), kind}], adj: [[edge idx]...], doors: [node idx], gates: [node idx]}
// =====================================================================================
WARD.nav = function (lay, nav) {
  nav = nav || { nodes: [], edges: [], adj: [], doors: [], gates: [], key: new Map() };
  const node = (x, z, kind, extra) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); let i = nav.key.get(k); if (i === undefined) { i = nav.nodes.length; nav.nodes.push(Object.assign({ x, z, kind }, extra)); nav.adj.push([]); nav.key.set(k, i); } else if (kind !== 'x' && nav.nodes[i].kind === 'x') Object.assign(nav.nodes[i], { kind }, extra); return i; };
  // centrelines: {axis, c (fixed coord), a0, a1, w, kind, pts: [[t, nodeIdx]]}
  const lines = [...lay.streets.map(s => ({ s, kind: s.kind })), ...lay.lanes.map(s => ({ s, kind: 'lane' }))].map(({ s, kind }) => { const ax = s.axis || (rw(s.r) > rd(s.r) ? 'x' : 'z'); return { axis: ax, c: ax === 'x' ? rcz(s.r) : rcx(s.r), a0: ax === 'x' ? s.r.x0 : s.r.z0, a1: ax === 'x' ? s.r.x1 : s.r.z1, w: ax === 'x' ? rd(s.r) : rw(s.r), kind, pts: [] }; });
  const P = (l, t) => l.axis === 'x' ? [t, l.c] : [l.c, t];
  for (const l of lines) { l.pts.push([l.a0, node(...P(l, l.a0), 'end')]); l.pts.push([l.a1, node(...P(l, l.a1), 'end')]); }
  // crossings (a centreline ending at another street's edge is extended to its centreline)
  for (const A of lines) for (const B of lines) { if (A === B || A.axis === B.axis) continue;
    const t = B.c, u = A.c; // A runs along its axis; B is perpendicular at coordinate B.c on A's axis
    if (t >= A.a0 - B.w && t <= A.a1 + B.w && u >= B.a0 - A.w && u <= B.a1 + A.w) { const tt = clamp(t, A.a0, A.a1), uu = clamp(u, B.a0, B.a1), i = node(...P(A, t), 'x'); A.pts.push([t, i]); B.pts.push([u, i]); void tt; void uu; } }
  // lot doors: projection of the lot's front-centre onto the nearest parallel centreline
  for (const lot of lay.lots) { if (lot.type === 'palace') continue; /* the palaces' named places are labels, not compounds with a street door */
    const r = lot.r, f = lot.front, fx = f === 'e' ? r.x1 : f === 'w' ? r.x0 : rcx(r), fz = f === 's' ? r.z1 : f === 'n' ? r.z0 : rcz(r), ax = (f === 'n' || f === 's') ? 'x' : 'z';
    let best = null, bd = 1e9; for (const l of lines) { if (l.axis !== ax) continue; const t = ax === 'x' ? fx : fz, d = Math.abs((ax === 'x' ? fz : fx) - l.c) - l.w / 2; if (t < l.a0 - 1 || t > l.a1 + 1 || d < -1 || d > 4) continue; if (d < bd) { bd = d; best = l; } }
    if (!best) continue; const t = clamp(ax === 'x' ? fx : fz, best.a0, best.a1), on = node(...P(best, t), 'x'); best.pts.push([t, on]);
    const di = node(fx, fz, 'door', { lot }); lot.door = di; nav.doors.push(di); link(di, on, 2, 'door');
  }
  for (const g of lay.gates) { let best = null, bd = 1e9; nav.nodes.forEach((n, i) => { const d = Math.hypot(n.x - g.x, n.z - g.z); if (n.kind !== 'door' && d < bd) { bd = d; best = i; } }); const gi = node(g.x + (g.side === 'w' ? -6 : g.side === 'e' ? 6 : 0), g.z + (g.side === 'n' ? -6 : g.side === 's' ? 6 : 0), 'gate', { side: g.side }); nav.gates.push(gi); if (best !== null) link(gi, best, 2.5, 'gate'); }
  for (const l of lines) { l.pts.sort((a, b) => a[0] - b[0]); for (let i = 1; i < l.pts.length; i++) if (l.pts[i][1] !== l.pts[i - 1][1]) link(l.pts[i - 1][1], l.pts[i][1], l.w, l.kind); }
  function link(a, b, w, kind) { if (a === b) return; const e = nav.edges.length; nav.edges.push({ a, b, w, kind, len: Math.hypot(nav.nodes[a].x - nav.nodes[b].x, nav.nodes[a].z - nav.nodes[b].z) }); nav.adj[a].push(e); nav.adj[b].push(e); }
  return nav;
};

// =====================================================================================
// LOD — 'massing' versions of the kit (ARCH.lod = 1): same placement code, a fraction of the triangles, no collision.
// =====================================================================================
const LOD = {
  // simple roof over a W x D footprint, eave at y, overhang ov; type 'gable'|'hip'|'xieshan'|'shed'|'pyramid'
  roof(b, W, D, y, ov, type, tiles, gx, gov = .55) {
    const X = W / 2 + (type === 'gable' || type === 'shed' ? Math.min(ov, gov) : ov), Z = D / 2 + ov, H = (type === 'shed' ? 2 * Z * .3 : Z * ARCH.pitch), tex = tiles === 'straw' || tiles === 'thatch' ? 'thatch' : 'roof_tile';
    b.s({ tex, col: [1, 1, 1] });
    if (type === 'shed') { b.q4([-X, y, Z], [X, y, Z], [X, y + H, -Z], [-X, y + H, -Z], [W / 2, 2]); b.s({ tex: 'plaster' }); ARCH.poly(b, [[-X, y, Z], [-X, y, -Z], [-X, y + H, -Z]], [-1, 0, 0]); ARCH.poly(b, [[X, y, Z], [X, y + H, -Z], [X, y, -Z]], [1, 0, 0]); return y + H; }
    const rx = type === 'gable' ? X : type === 'xieshan' ? X - Z * .45 : type === 'pyramid' ? 0 : Math.max(0, X - Z), ry = y + H;
    b.q4([-X, y, Z], [X, y, Z], [rx, ry, 0], [-rx, ry, 0], [W / 2, 2]); b.q4([X, y, -Z], [-X, y, -Z], [-rx, ry, 0], [rx, ry, 0], [W / 2, 2]);
    if (type === 'gable') { // gable walls (山牆) at the wall plane, up to the underside of the roof
      const g = gx || W / 2, zw = D / 2, ye = y + (ry - y) * (1 - zw / Z) - .05; b.s({ tex: 'plaster', col: [1, 1, 1] });
      for (const sd of [-1, 1]) ARCH.poly(b, [[sd * g, y - .02, -zw], [sd * g, y - .02, zw], [sd * g, ye, zw], [sd * g, ry - .08, 0], [sd * g, ye, -zw]], [sd, 0, 0], p => [p[2] / 2, -p[1] / 2]); }
    else { b.s({ tex }); ARCH.poly(b, [[X, y, Z], [X, y, -Z], [rx, ry, 0]], [1, .6, 0]); ARCH.poly(b, [[-X, y, -Z], [-X, y, Z], [-rx, ry, 0]], [-1, .6, 0]); }
    if (rx > .2 && ARCH.lod !== 2) b.s({ tex: 'roof_ridge' }).box(0, ry + .1, 0, rx * 2, .3, .3, { uv: [Math.round(rx), 1], skip: ['bot', 'px', 'nx'] });
    // underside so the eaves don't look paper-thin from below (LOD1 only)
    // roof thickness (LOD1 only): sloped undersides, eave fascias, and on gables the bargeboard strips, so the eaves never look paper-thin
    // or open from below / from the gable end (the full-detail roof has the same silhouette)
    if (ARCH.lod !== 2 || LOD.under) { const t = .2, k = H / Z, dn = p => [p[0], p[1] - t, p[2]], gab = type === 'gable'; // LOD.under: far-level parts you can walk under (曲江 / 芙蓉園 pavilions and halls; QA: tool/qa_build.js roof check)
      const tri = (pts, n) => ARCH.poly(b, pts, n, p => [p[0] / 2, p[2] / 2]);
      b.s({ tex: 'rafters' }); tri([[-X, y, Z], [X, y, Z], [rx, ry, 0], [-rx, ry, 0]].map(dn), [0, -1, -k]); tri([[X, y, -Z], [-X, y, -Z], [-rx, ry, 0], [rx, ry, 0]].map(dn), [0, -1, k]);
      if (!gab) { const kx = H / Math.max(.1, X - rx); tri([[X, y, Z], [X, y, -Z], [rx, ry, 0]].map(dn), [-kx, -1, 0]); tri([[-X, y, -Z], [-X, y, Z], [-rx, ry, 0]].map(dn), [kx, -1, 0]); }
      b.s({ tex: tiles === 'straw' || tiles === 'thatch' ? 'thatch' : 'tile_end' }); for (const sz of [-1, 1]) tri([[-X, y, sz * Z], [X, y, sz * Z], [X, y - t, sz * Z], [-X, y - t, sz * Z]], [0, 0, sz]);
      if (!gab) for (const sx of [-1, 1]) tri([[sx * X, y, -Z], [sx * X, y, Z], [sx * X, y - t, Z], [sx * X, y - t, -Z]], [sx, 0, 0]);
      else { b.s({ tex: 'dark_wood' }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) tri([[sx * X, y, sz * Z], [sx * X, ry, 0], [sx * X, ry - t, 0], [sx * X, y - t, sz * Z]], [sx, 0, 0]); } }
    return ry;
  },
};
{
  const NOWORLD = { box() { return {}; }, cyl() { return {}; } };
  const _frame = ARCH.frame;
  ARCH.frame = function (L, F, o) {
    if (!ARCH.lod) return _frame(L, F, o);
    const b = L.mb, W = o.bw.reduce((a, c) => a + c, 0), D = o.dw.reduce((a, c) => a + c, 0), y0 = o.y0 || 0, colH = o.colH || 3.8, st = o.brackets || 'full', bs = o.bs || colH * (st === 'full' ? .27 : .3);
    const BD = { full: [.92, 1.06], simple: [.5, .58], none: [.22, .3] }[st], cT = y0 + colH, plT = cT + .1, purT = plT + BD[1] * bs, ov = BD[0] * bs + (o.eave ?? (colH * .36 + .2));
    b.T(F.x, F.y, F.z, 0, F.yaw, 0);
    const wt = { white: o.paint === 'plain' ? 'facade_lod_plain' : 'facade_lod', brick: 'brick', plank: 'plank', open: 'dark_wood', mud: 'rammed_earth', adobe: 'mudbrick' }[o.walls || 'white'] || 'facade_lod';
    b.s({ tex: wt, col: o.walls === 'plank' ? [.72, .6, .5] : [1, 1, 1] }).box(0, y0 + colH / 2, 0, W - .2, colH, D - .2, { uv: [Math.max(1, Math.round(W / 3.5)), 1], skip: ['bot', 'top'] });
    // the bracket zone up to the eave (painted band), closed at the top, so the roof always sits on the building
    b.s({ tex: st === 'none' ? 'dark_wood' : 'paint_ochre', col: [1, 1, 1] }).box(0, (cT + purT) / 2, 0, W - .1, purT - cT + .02, D - .1, { uv: [Math.max(1, Math.round(W / 1.2)), 1], skip: ['bot'] });
    const frontWin = o.walls !== 'open' && o.windows !== false && (o.fill && o.fill.front ? o.fill.front.some(k => k === 'window') : (o.bays || 3) > (Array.isArray(o.door) ? o.door.length : 1)); // only where the real building has window bays on its front (never an open shop front)
    if ((o.lit || o.glow) && ARCH.lod === 1 && frontWin && !(o.fill && o.fill.front && !o.fill.front.some((q, i, A) => q === 'window' && A[A.length - 1 - i] === 'window'))) { const k = o.glow ? .7 : hash2((o.seed || 0) * 31 + 7, 11, 530) < o.lit ? .4 : 0; if (k) { b.s({ tex: 'paper_window', col: [1.05, .8, .52], emi: k * .55, bone: o.lamp || (o.glow ? 3 : 1) }); const fb = o.fill && o.fill.front, wi = fb ? fb.findIndex((q, i) => q === 'window' && fb[fb.length - 1 - i] === 'window') : -1, /* a window bay whichever way the bays are counted */ bx = wi >= 0 ? -W / 2 + o.bw.slice(0, wi).reduce((q, v) => q + v, 0) + o.bw[wi] / 2 : 0, bwid = wi >= 0 ? Math.min(2, o.bw[wi] - 1.1) : W * .3; ARCH.card(b, bx - bwid / 2, y0 + .95, D / 2 - .1 + .02, bwid, 1.1, [0, 0, 2, 1], false); /* on the massing's front face, at a window bay */ b.s({ emi: 0, bone: 0, col: [1, 1, 1] }); } } // lamplit window seen from afar (same groups as LOD0)
    let ridge = purT;
    if (o.roof) ridge = LOD.roof(b, W, D, purT, ov, o.roof, o.tiles, W / 2 - .01, o.gov ?? .55);
    b.pop();
    return { W, D, xs: [-W / 2, W / 2], zs: [-D / 2, D / 2], cT, plT, purT, ov, roof: { H: ridge - purT, underY: () => purT, topY: () => ridge }, ry0: purT, zc: 0, under: () => purT, lights: [], ridge };
  };
  for (const k of ['_steps', 'railing', 'tablet', 'huanmen', 'column', 'lanternString', 'lantern']) { const f = ARCH[k]; ARCH[k] = function (...a) { if (ARCH.lod) return k === '_steps' ? undefined : {}; return f.apply(this, a); }; }
  const _hall = ARCH.hall;
  ARCH.hall = function (L, x, y, z, o = {}) {
    if (!ARCH.lod) return _hall(L, x, y, z, o);
    const i0 = L.mb.nv, F = ARCH.F(x, y, z, o.yaw || 0), nb = o.bays || 3, nd = o.dbays || 2, bw = Array.isArray(o.bayW) ? o.bayW : Array.from({ length: nb }, (_, i) => o.bayW || (nb % 2 && i === (nb - 1) / 2 ? 4.2 : 3.6)), dw = Array.isArray(o.dbayW) ? o.dbayW : Array(nd).fill(o.dbayW || 3.4);
    const W = bw.reduce((a, c) => a + c, 0), D = dw.reduce((a, c) => a + c, 0), colH = o.colH || 3.8, ph = o.platform ?? .9, pm = o.pm ?? (colH * .4 + .5);
    if (ph > .05) { L.mb.T(x, y, z, 0, F.yaw, 0); L.mb.s({ tex: o.platTex || 'brick', col: [1, 1, 1] }).box(0, ph / 2 - .2, 0, W + 2 * pm, ph + .4, D + 2 * pm, { world: 2, skip: ['bot'], faces: { top: 'pave' } }); L.mb.pop(); }
    const fr = ARCH.frame(L, F, Object.assign({}, o, { bw, dw, y0: ph, roof: o.roof || 'xieshan' })); ARCH.ao(L.mb, i0, y, y + ph); // same baked contact darkening as LOD0
    return { F, W, D, top: y + ph, colTop: y + fr.cT, eave: y + fr.ry0, ridge: y + fr.ridge, door: F.p(0, 0, D / 2 + pm + 1.2), inside: F.p(0, ph, 0), roof: fr.roof, frame: fr };
  };
  const _wall = ARCH.wall;
  ARCH.wall = function (L, x0, z0, x1, z1, o = {}) {
    if (!ARCH.lod) return _wall(L, x0, z0, x1, z1, o);
    const i0 = L.mb.nv;
    const st = o.style || 'courtyard', ram = st === 'rammed', h = o.h ?? (ram ? 9 : 2.6), t = o.t ?? (ram ? 7 : .5); // butt ends (o.b0/o.b1) stop at the crossing wall's face
    { const L0 = Math.hypot(x1 - x0, z1 - z0) || 1, ux = (x1 - x0) / L0, uz = (z1 - z0) / L0, e0 = (o.bt0 ?? o.bt ?? t) / 2 + .003, e1 = (o.bt1 ?? o.bt ?? t) / 2 + .003; if (o.b0) { x0 += ux * e0; z0 += uz * e0; } if (o.b1) { x1 -= ux * e1; z1 -= uz * e1; } }
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const tex = ram || st === 'mud' ? 'rammed_earth' : st === 'brick' ? 'brick' : st === 'board' ? 'plank' : 'plaster';
    L.mb.T((x0 + x1) / 2, o.y || 0, (z0 + z1) / 2, 0, Math.atan2(-dz, dx), 0); L.mb.s({ tex, col: st === 'courtyard' ? (o.wcol || [1.02, .91, .74]) : st === 'board' ? [.58, .45, .34] : (o.wcol || [1, 1, 1]) }).box(0, h / 2 - .15, 0, len, h + .3, ram ? Math.max(1, t - 2 * h * (o.batter ?? .14)) : t, { world: 2, skip: ARCH.lod === 2 || len > 6 ? ['bot', 'px', 'nx'] : ['bot'], faces: o.coping === false || ram || st === 'board' ? undefined : { top: 'roof_tile' } }); L.mb.pop(); L.mb.s({ col: [1, 1, 1] }); ARCH.ao(L.mb, i0, o.y || 0);
  };
  const _prop = null; void _prop;
  const _place = TREES.place;
  TREES.place = function (L, x, y, z, kind, s = 1, seed = 1) {
    if (!ARCH.lod) return _place(L, x, y, z, kind, s, seed);
    if (typeof NATURE !== 'undefined' && NATURE.treeLod) return NATURE.treeLod(L, x, y, z, kind, s, seed, ARCH.lod);
    const R = RNG(seed), h = (kind === 'willow' ? 7 : kind === 'jujube' ? 5 : kind === 'pine' ? 7 : 8.5) * s, r = (kind === 'jujube' ? 2.4 : 3.8) * s, b = L.fol;
    if (ARCH.lod !== 2) b.s({ tex: 'bark_dark', col: [.7, .65, .6] }).box(x, y + h * .3, z, .4 * s, h * .6, .4 * s, { skip: ['bot', 'top'] });
    b.s({ tex: kind === 'pine' ? 'pine_n' : kind === 'willow' ? 'leaf_willow' : 'leaf_huai', col: [1, 1, 1] }).ell(x + (R() - .5), y + h * .72, z + (R() - .5), r, r * .65, r, { seg: ARCH.lod === 2 ? 4 : 5, ring: 3, uvs: [2 * r, r] });
  };
  const _pagoda = TANG.pagoda;
  TANG.pagoda = function (L, x, y, z, o = {}) {
    if (!ARCH.lod) return _pagoda(L, x, y, z, o);
    const b = L.mb, n = o.storeys || 7, W0 = o.w || 10, H1 = o.h1 || W0 * .5, taper = o.taper ?? .075; let yy = 1.2, w = W0;
    b.T(x, y, z, 0, o.yaw || 0, 0); b.s({ tex: 'brick', col: [1, .98, .94] }).box(0, .6, 0, W0 + 3, 1.2, W0 + 3, { world: 2, skip: ['bot'] });
    for (let i = 0; i < n; i++) { const h = o.dense ? (i === 0 ? H1 * 1.6 : H1 * .32) : H1 * (1 - i * .05); b.s({ tex: 'plaster', col: [.82, .76, .66] }).box(0, yy + h / 2, 0, w, h, w, { world: 3, skip: ['bot', 'top'] }); yy += h;
      const st = o.dense ? 4 : 6, eo = st * .18, wo = w + st * .28, ei = (st - 1) * .18; // the same corbelled eave stack as LOD0 (out st × 18 cm, tiles 12 cm, back in): the same height at every level
      b.s({ tex: 'brick', col: [1.15, 1.1, 1.02] }).box(0, yy + eo / 2, 0, wo, eo, wo, { world: 2 }); yy += eo; b.s({ tex: 'roof_tile', col: [.8, .8, .82] }).box(0, yy + .06, 0, wo + .1, .12, wo + .1, { world: 2 }); yy += .12;
      b.s({ tex: 'brick', col: [1.15, 1.1, 1.02] }).box(0, yy + ei / 2, 0, wo - .2 * (st - 1) / 2 - .1, ei, wo - .2 * (st - 1) / 2 - .1, { world: 2, skip: ['bot'] }); yy += ei; w *= 1 - taper; }
    b.s({ tex: 'brick', col: [.9, .88, .84] }).box(0, yy + .4, 0, w * .6, .8, w * .6, { world: 1, skip: ['bot'] }); yy += .8; // the finial base and the 剎 (5 m), as at LOD0
    b.s({ tex: 'iron' }).box(0, yy + 2.5, 0, .4, 5, .4); b.pop(); return { top: y + yy };
  };
  // build `fn(L)` in LOD mode into L (no collision)
  LOD.run = function (L, fn, lvl) { const w = L.world, prev = ARCH.lod; L.world = NOWORLD; ARCH.lod = lvl || prev || 1; try { fn(L); } finally { ARCH.lod = prev; L.world = w; } };
}

// =====================================================================================
// ITEMS — everything placeable in a walkable region, each with a position (for chunk assignment) and a build(L)
// =====================================================================================
WARD.items = function (lay, o = {}) {
  // ward wall as a network (architecture engineer): runs between the corner-pier centres; a pier 墩 at every corner and on both sides of every
  // gate (tight against the gate posts); pieces of <= 32 m between them; piece ends at a pier stop inside it, their caps run under its cap.
  const wd = lay.wd, r = wd.r, T = WARD.WALL_T, it = [], P = TANG.wardPierSize(), gp = 2.75 + P / 2; // the gate piers' vertical faces 2.75 m from the gate axis: tight against the gate posts and side walls
  const cx0 = r.x0 + T / 2, cx1 = r.x1 - T / 2, cz0 = r.z0 + T / 2, cz1 = r.z1 - T / 2;
  for (const [x, z] of [[cx0, cz0], [cx1, cz0], [cx0, cz1], [cx1, cz1]]) it.push({ x, z, build: L => TANG.wardPier(L, x, z, { kind: 'L' }) });
  const sides = [['n', cx0, cz0, cx1, cz0], ['s', cx0, cz1, cx1, cz1], ['w', cx0, cz0, cx0, cz1], ['e', cx1, cz0, cx1, cz1]];
  for (const [sd, ax, az, bx, bz] of sides) {
    const gs = lay.gates.filter(q => q.side === sd), horiz = az === bz;
    let p0 = horiz ? ax : az; const p1 = horiz ? bx : bz, segs = [];
    for (const c of gs.map(g => horiz ? g.x : g.z).sort((a, b) => a - b)) { segs.push([p0, c - gp]); p0 = c + gp; } segs.push([p0, p1]);
    for (const g of gs) { const c = horiz ? g.x : g.z; for (const e of [c - gp, c + gp]) { const x = horiz ? e : ax, z = horiz ? az : e, fl = (e < c ? 1 : -1) * (horiz ? 1 : -1); it.push({ x, z, build: L => TANG.wardPier(L, x, z, { kind: 'end', yaw: horiz ? 0 : PI / 2, flat: fl }) }); } }
    for (const [u0, u1] of segs) { const n = Math.max(1, Math.ceil((u1 - u0) / 32)); for (let k = 0; k < n; k++) { const u = u0 + (u1 - u0) * k / n, v = u0 + (u1 - u0) * (k + 1) / n, a = horiz ? [u, az, v, az] : [ax, u, ax, v];
      it.push({ x: (a[0] + a[2]) / 2, z: (a[1] + a[3]) / 2, build: L => TANG.wardWall(L, ...a, { b0: k === 0, b1: k === n - 1 }) }); } }
    for (const g of gs) { const gx = horiz ? g.x : ax, gz = horiz ? az : g.z, yaw = { n: PI, s: 0, w: -PI / 2, e: PI / 2 }[sd]; it.push({ x: gx, z: gz, build: L => TANG.wardGate(L, gx, gz, yaw, { name: wd.name, nameTex: o.nameTex }) }); }
  }
  for (const lot of lay.lots) { if (COMP.BIG[lot.type] && lot.big) { for (const u of COMP.bigUnits(lot)) it.push(u); continue; } it.push({ x: rcx(lot.r), z: rcz(lot.r), build: L => COMP.build(L, lot) }); }
  for (const t of lay.trees) it.push({ x: t.x, z: t.z, build: L => TREES.place(L, t.x, 0, t.z, t.kind, t.s, t.seed) });
  for (const w of lay.wells) it.push({ x: w.x, z: w.z, build: L => L.prop(PROPS.well, w.x, 0, w.z, { solid: { r: .9, h: .8 } }) });
  return it;
};

// =====================================================================================
// AVENUES — outside the ward walls: a verge, a drainage ditch (明溝), a row of 槐 trees, the road; bridges at ward gates;
// 武候鋪 guard posts at ward corners. Ditches are carved into the terrain height (CITY.height).
// =====================================================================================
const AVENUE = {
  VERGE: 2, DITCH_W: 3, DITCH_D: 1.6, TREE_OFF: 7.5, TREE_STEP: 6,
  items(wards, region) {
    const it = [], ditches = [];
    for (const wd of wards) {
      const r = wd.r, V = AVENUE.VERGE, DW = AVENUE.DITCH_W, R = RNG(wd.seed * 13 + 5);
      const sides = [['n', r.x0, r.x1, r.z0, -1, 'x'], ['s', r.x0, r.x1, r.z1, 1, 'x'], ['w', r.z0, r.z1, r.x0, -1, 'z'], ['e', r.z0, r.z1, r.x1, 1, 'z']];
      for (const [sd, a0, a1, f, dir, ax] of sides) {
        // ditch rect, aligned to the 1 m grid
        const d0 = Math.round(f + dir * V), d1 = Math.round(f + dir * (V + DW)), lo = Math.round(a0 - V - DW), hi = Math.round(a1 + V + DW);
        const dr = ax === 'x' ? rect(lo, Math.min(d0, d1), hi, Math.max(d0, d1)) : rect(Math.min(d0, d1), lo, Math.max(d0, d1), hi);
        if (!inR(region, rcx(dr), rcz(dr))) continue; ditches.push(dr);
        // stone-lined ditch edges and a kerb line of slabs along the road, in 32 m pieces (so they spread over chunks)
        { const along = ax === 'x', a0d = along ? dr.x0 : dr.z0, a1d = along ? dr.x1 : dr.z1, eNear = Math.min(d0, d1), eFar = Math.max(d0, d1), kerb = f + dir * (AVENUE.TREE_OFF + 1.9);
          for (let u = a0d; u < a1d - .5; u += 32) { const v = Math.min(a1d, u + 32), um = (u + v) / 2, px = along ? um : (eNear + eFar) / 2, pz = along ? (eNear + eFar) / 2 : um; it.push({ x: px, z: pz, build: L => AVENUE.ditchEdge(L, along, u, v, eNear, eFar, kerb, wd.gates === 'four' || sd === 'w' || sd === 'e' ? (a0 + a1) / 2 : null) }); } }
        // bridge at the gate
        const g = wd.gates === 'four' || sd === 'w' || sd === 'e' ? (a0 + a1) / 2 : null;
        // gates on this side: wards (middle of the side, or E/W only) and markets (two per side, at the thirds of the inner square)
        const T0 = WARD.WALL_T, gs = wd.gates === 'market' ? [a0 + T0 + (a1 - a0 - 2 * T0) / 3, a0 + T0 + (a1 - a0 - 2 * T0) * 2 / 3] : g !== null ? [g] : [];
        for (const gg of gs) { const mid = f + dir * (V + DW / 2), bx = ax === 'x' ? gg : mid, bz = ax === 'x' ? mid : gg, yaw = ax === 'x' ? 0 : PI / 2;
          it.push({ x: bx, z: bz, build: L => AVENUE.bridge(L, bx, bz, yaw, 7.5) }); }
        // trees between ditch and road
        const toff = f + dir * AVENUE.TREE_OFF;
        for (let u = a0 + 4; u < a1 - 4; u += AVENUE.TREE_STEP + R() * 1.2) { if (gs.some(gg => Math.abs(u - gg) < 9)) continue; if (R() < .05) continue;
          const x = ax === 'x' ? u : toff, z = ax === 'x' ? toff : u, seed = (R() * 1e6) | 0, s = .9 + R() * .3; it.push({ x, z, build: L => TREES.place(L, x, 0, z, 'huai', s, seed) }); }
      }
      // guard posts at two opposite corners
      for (const [cx, cz, yaw] of [[r.x0 - 6, r.z0 - 6, PI * .75], [r.x1 + 6, r.z1 + 6, -PI * .25]]) if (inR(region, cx, cz)) it.push({ x: cx, z: cz, build: L => AVENUE.guardPost(L, cx, cz, yaw) });
    }
    return { items: it, ditches };
  },
  bridge(L, x, z, yaw, w) { // stone-slab bridge 石橋 across the ditch: long granite slabs on stone abutments, low kerb stones on both sides
    const b = L.mb, DW = AVENUE.DITCH_W, F = ARCH.F(x, 0, z, yaw), n = Math.max(3, Math.round(w / .95)), sw = w / n;
    b.s({ col: [1, 1, 1], emi: 0 }).T(x, 0, z, 0, yaw, 0);
    for (let i = 0; i < n; i++) { const k = .9 + hash2(Math.round(x * 3) + i, Math.round(z * 3), 520) * .14; b.s({ tex: 'stone', col: [.95 * k, .93 * k, .88 * k] }).box(-w / 2 + (i + .5) * sw, -.06 + (i & 1) * .012, 0, sw - .03, .2, DW + 1.4, { world: 1, skip: ['bot'] }); } // slabs, a little uneven
    b.s({ tex: 'stone', col: [.82, .8, .76] }); for (const sx of [-1, 1]) b.box(sx * (w / 2 + .14), .1, 0, .28, .32, DW + 1.6, { world: 1, skip: ['bot'] }); // kerb stones
    for (const sz of [-1, 1]) b.box(0, -.9, sz * (DW / 2 + .2), w + .9, 1.6, .5, { world: 1, skip: ['top'] }); // abutments (top hidden under the slabs)
    b.pop(); ARCH.solid(L, F, 0, -.16, 0, w, .2, DW + 1.4, { surface: 'stone' });
    for (const sx of [-1, 1]) ARCH.solid(L, F, sx * (w / 2 + .14), -.06, 0, .28, .32, DW + 1.6);
  },
  // stone lining along both rims of a ditch and a kerb line of slabs between the road and the walkway (from u to v along the ditch)
  ditchEdge(L, along, u, v, e0, e1, kerb, gateAt) { if (ARCH.lod) return; const b = L.mb, len = v - u, c = (u + v) / 2, P = (a, e) => along ? [a, e] : [e, a];
    const box = (a, e, ww, y0, y1, ee, tex, col) => { const [px, pz] = P(a, e); b.s({ tex, col }).box(px, (y0 + y1) / 2, pz, along ? ww : ee, y1 - y0, along ? ee : ww, { world: 1, skip: ['bot'] }); };
    const segs = gateAt !== null && gateAt > u - 6 && gateAt < v + 6 ? [[u, gateAt - 4.4], [gateAt + 4.4, v]] : [[u, v]]; // the bridge's abutments take over at the gate
    const wetAt = (a, e) => { const [px, pz] = P(a, e); return COMP.wet(px, pz, .2); }, dry = (s0, s1, e) => { const out = [], n = Math.max(1, Math.ceil((s1 - s0) / .4)); let a = null; for (let k = 0; k <= n; k++) { const q = s0 + (s1 - s0) * k / n, w = wetAt(q, e); if (!w && a === null) a = q; if ((w || k === n) && a !== null) { const z = w ? q - (s1 - s0) / n : s1; if (z - a > .3) out.push([a, z]); a = null; } } return out; }; // a canal crossing the avenue: no ditch lining or kerb across its water (QA tool/qa_water.js)
    for (const [s0, s1] of segs) { if (s1 - s0 < .3) continue; for (const ee of [e0 + .18, e1 - .18]) for (const [q0, q1] of dry(s0, s1, ee)) box((q0 + q1) / 2, ee, q1 - q0, -AVENUE.DITCH_D, .07, .36, 'stone', [.86, .84, .8]); }
    const ks = Math.max(1, Math.round(len / 1.1)); for (let i = 0; i < ks; i++) { const a = u + (i + .5) * len / ks; if (wetAt(a, kerb)) continue; const k = .88 + hash2(Math.round(a * 4), Math.round(kerb), 521) * .16; box(a, kerb, len / ks - .03, -.1, .05, .5, 'stone', [.92 * k, .9 * k, .85 * k]); } // kerb slabs 路緣石
    void c; b.s({ col: [1, 1, 1] }); },
  guardPost(L, x, z, yaw) { // 武候鋪: a small two-bay hut with a drum
    const h = ARCH.hall(L, x, 0, z, { yaw, bays: 2, dbays: 1, bayW: 3, dbayW: 3.4, colH: 2.8, platform: .35, pm: .4, brackets: 'none', paint: 'ochre', walls: 'white', roof: 'gable', door: [0], doorOpen: true, windows: true });
    const p = h.F.p(4.1, 0, 2.4); L.prop(b => PROPS.drum(b, .8), p[0], .0, p[2], { yaw, solid: { w: 1, h: 1.4, d: .8 } });
    ARCH.furnish(L, h, 'room', { seed: Math.round(x * 3 + z * 7), lot: 'guard:' + Math.round(x) + ',' + Math.round(z), lamp: 1 }); // the watchmen's 榻 / beds, chest, lamp
  },
};

// =====================================================================================
// PLAN → ward descriptors (all 114 units of the city), specials from the reference sheet
// =====================================================================================
const PLANW = {
  // named special compounds per ward: {type, at: [fx0, fz0, fx1, fz1] fraction of the ward's inner rect, name, wealth}
  SPECIAL: {
    崇仁: [{ type: 'temple', at: [.55, .05, .95, .45], name: '資聖寺' }, { type: 'jinzou', at: [.05, .55, .45, .75], name: '淄青進奏院' }, { type: 'jinzou', at: [.55, .55, .8, .75], name: '幽州進奏院' }, { type: 'jinzou', at: [.05, .05, .3, .25], name: '太原進奏院' }, { type: 'inn', at: [.3, .3, .5, .45] }],
    平康: [{ type: 'quarter', at: [.52, .02, .98, .46], name: '北里', qu: true }, { type: 'temple', at: [.55, .56, .8, .95], name: '菩提寺' }, { type: 'temple', at: [.1, .1, .35, .4], name: '陽化寺' }, { type: 'jinzou', at: [.1, .6, .3, .8], name: '魏博進奏院' }],
    宣陽: [{ type: 'office', at: [.7, .6, .98, .98], name: '萬年縣廨' }, { type: 'temple', at: [.1, .55, .4, .95], name: '淨域寺' }, { type: 'jinzou', at: [.6, .1, .8, .4], name: '邠寧進奏院' }],
    親仁: [{ type: 'mansion', at: [.5, .02, .98, .48], name: '郭令公宅' }, { type: 'temple', at: [.05, .55, .3, .95], name: '回元觀' }],
    務本: [{ type: 'office', at: [.02, .02, .5, .98], name: '國子監' }],
    崇義: [{ type: 'temple', at: [.6, .55, .95, .95], name: '招福寺' }, { type: 'jinzou', at: [.1, .1, .35, .4], name: '易定進奏院' }],
    長興: [{ type: 'office', at: [.3, .05, .7, .42], name: '禮賓院' }, { type: 'jinzou', at: [.7, .55, .95, .95], name: '鎮州進奏院' }, { type: 'temple', at: [.05, .55, .3, .95], name: '乾元觀' }],
    永樂: [{ type: 'mansion', at: [.55, .55, .9, .95], name: '裴度宅' }, { type: 'temple', at: [.1, .05, .4, .42], name: '清都觀' }],
    靖安: [{ type: 'mansion', at: [.6, .05, .95, .42], name: '武元衡宅' }, { type: 'temple', at: [.05, .55, .35, .95], name: '崇敬尼寺' }],
    靖善: [{ type: 'temple', at: [.045, 0, 1, 1], name: '大興善寺' }], 保寧: [{ type: 'temple', at: [.045, 0, 1, 1], name: '昊天觀' }], // a stub of the 東西街 from the west gate (朱雀大街 side) to the temple gate
    晉昌: [{ type: 'temple', at: [.5, 0, 1, 1], name: '慈恩寺', pagoda: 'dayan' }], 安仁: [{ type: 'temple', at: [.04, .04, .34, .4], name: '薦福寺塔院', pagoda: 'xiaoyan' }],
    開化: [{ type: 'temple', at: [.03, .53, .97, .98], name: '薦福寺' }], 崇業: [{ type: 'temple', at: [.2, .1, .8, .9], name: '玄都觀' }], 延康: [{ type: 'temple', at: [.02, .53, .48, .98], name: '西明寺' }],
    新昌: [{ type: 'temple', at: [.52, .53, .97, .97], name: '青龍寺' }], 長樂: [{ type: 'temple', at: [.1, .1, .9, .6], name: '大安國寺' }], 光德: [{ type: 'office', at: [.5, .05, .95, .5], name: '京兆府' }],
    長壽: [{ type: 'office', at: [.5, .5, .95, .95], name: '長安縣廨' }], 和平: [{ type: 'temple', at: [.03, .03, .48, .97], name: '大總持寺北院' }, { type: 'temple', at: [.52, .03, .97, .97], name: '大莊嚴寺北院' }],
    永陽: [{ type: 'temple', at: [.03, .03, .48, .97], name: '大總持寺', pagoda: 'wooden' }, { type: 'temple', at: [.52, .03, .97, .97], name: '大莊嚴寺', pagoda: 'wooden' }],
    昇平: [{ type: 'temple', at: [.45, .02, .98, .48], name: '樂遊原' }], 通善: [{ type: 'temple', at: [.5, .03, .97, .47], name: '杏園' }], 安業: [{ type: 'temple', at: [.55, .55, .9, .92], name: '唐昌觀' }],
    布政: [{ type: 'temple', at: [.04, .86, .12, .97], name: '胡祆祠' }], 義寧: [{ type: 'temple', at: [.52, .04, .62, .16], name: '波斯胡寺' }], // 長安志 10: 布政坊 西南隅 胡祆祠; 義寧坊 街東之北 波斯胡寺 (貞觀十二年, 阿羅本: the 景教 church, 大秦寺)
  },
  wards() {
    if (this._w) return this._w; const out = [];
    for (const w of PLAN.wards) {
      if (w.name === '東市' || w.name === '西市') continue;
      const c = PLAN.cols[w.col], rr = PLAN.rows[w.row], inner = /^[EW][12]$/.test(w.col), name = w.name.split('|')[0], row = w.row;
      const d = { name: w.name, short: name, col: w.col, row, r: rect(c[0], rr[0], c[1], rr[1]), gates: inner ? 'ew' : 'four', seed: hashS(w.name), notes: w.notes, kind: 'ward' };
      if (/興慶/.test(w.name) || /曲江/.test(w.name)) d.kind = /興慶/.test(w.name) ? 'palace' : 'park';
      if (/十六宅/.test(w.name)) d.kind = 'princes';
      // density profile: south rows sparse (fields), east/north officials, west commoners & merchants
      const south = row >= 10, east = w.col[0] === 'E';
      d.profile = south ? { rich: .05, lots: { field: .35, garden: .15, house: .3, hut: .15, rich: .05 }, street: { house: .6, shop: .3, wineshop: .1 } }
        : { rich: east ? .2 : .1, lots: { house: .5, hut: east ? .12 : .25, rich: east ? .09 : .05, garden: .1, inn: .05, field: .03 }, street: { shop: .5, house: .3, wineshop: .2 } };
      d.specials = (this.SPECIAL[name] || []).map(sp => Object.assign({}, sp));
      out.push(d);
    }
    for (const m of PLAN.markets) { const c = PLAN.cols[m.col], r0 = PLAN.rows[m.rows[0]], r1 = PLAN.rows[m.rows[1]], cx = (c[0] + c[1]) / 2, cz = (r0[0] + r1[1]) / 2;
      out.push({ name: m.name, short: m.name, col: m.col, row: m.rows[0], r: rect(cx - m.w / 2, cz - m.h / 2, cx + m.w / 2, cz + m.h / 2), kind: 'market', gates: 'market', seed: hashS(m.name), specials: [] }); }
    out.forEach((d, i) => d.i = i); return this._w = out;
  },
};
// ward name tablets (declared at load so they exist in the texture array, same order in workers)
// gate name plaques (門額): Tang names, in the style of the kit's tablets (gold characters on blue, framed); same in workers and main thread
for (const nm of ['春明門', '通化門', '延興門', '金光門', '開遠門', '延平門', '明德門', '啟夏門', '安化門', '承天門', '朱雀門', '含光門', '安上門', '丹鳳門', '延喜門', '景風門', '安福門', '順義門', '建福門', '望仙門', '通陽門', '興慶門']) if (!TEX.L['gt_' + nm]) TEX.glyph('gt_' + nm, nm, { aspect: .42, fill: .86, fg: _gc([232, 196, 100], [200, 150, 66], 316), bg: _frame(_gc([36, 60, 92], [28, 46, 74], 317), [200, 160, 80], 9, 318) });
for (const w of PLAN.wards) { const nm = w.name.split('|')[0].replace(/曲江池.*/, '曲江'); if (!TEX.L['wn_' + nm]) TEX.glyph('wn_' + nm, nm + (nm.length < 3 && !/市/.test(nm) ? '坊' : ''), { aspect: .42, fill: .86, fg: [226, 200, 140], bg: [40, 30, 26] }); }

// =====================================================================================
// MARKET (東市 / 西市): walled square with 2 gates per side, 井-shaped streets, rows of shops facing the streets (行),
// warehouses behind, a pond (放生池) and the market office 市署 in the centre block.
// =====================================================================================
const MARKET = {
  layout(wd) {
    const R = RNG(wd.seed), r = wd.r, T = WARD.WALL_T, inner = rect(r.x0 + T, r.z0 + T, r.x1 - T, r.z1 - T), out = { wd, inner, streets: [], lanes: [], lots: [], gates: [], trees: [], wells: [], props: [] };
    const SW = 16, xs = [inner.x0 + rw(inner) / 3, inner.x0 + rw(inner) * 2 / 3], zs = [inner.z0 + rd(inner) / 3, inner.z0 + rd(inner) * 2 / 3];
    for (const x of xs) { out.streets.push({ r: rect(x - SW / 2, inner.z0, x + SW / 2, inner.z1), kind: 'main', axis: 'z' }); out.gates.push({ x, z: r.z0, side: 'n' }, { x, z: r.z1, side: 's' }); }
    for (const z of zs) { out.streets.push({ r: rect(inner.x0, z - SW / 2, inner.x1, z + SW / 2), kind: 'main', axis: 'x' }); out.gates.push({ x: r.x0, z, side: 'w' }, { x: r.x1, z, side: 'e' }); }
    // streets along the inside of the market walls (found at the 西市), so the outer shop rows face a street, not the wall
    const PW = 10; out.streets.push({ r: rect(inner.x0, inner.z0, inner.x1, inner.z0 + PW), kind: 'sub', axis: 'x' }, { r: rect(inner.x0, inner.z1 - PW, inner.x1, inner.z1), kind: 'sub', axis: 'x' },
      { r: rect(inner.x0, inner.z0 + PW, inner.x0 + PW, inner.z1 - PW), kind: 'sub', axis: 'z' }, { r: rect(inner.x1 - PW, inner.z0 + PW, inner.x1, inner.z1 - PW), kind: 'sub', axis: 'z' });
    const bx = [inner.x0 + PW, xs[0] - SW / 2, xs[0] + SW / 2, xs[1] - SW / 2, xs[1] + SW / 2, inner.x1 - PW], bz = [inner.z0 + PW, zs[0] - SW / 2, zs[0] + SW / 2, zs[1] - SW / 2, zs[1] + SW / 2, inner.z1 - PW];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const b = rect(bx[i * 2], bz[j * 2], bx[i * 2 + 1], bz[j * 2 + 1]);
      if (i === 1 && j === 1) { // centre block: market office + pond
        out.lots.push({ r: rect(b.x0 + 20, b.z0 + 20, rcx(b) - 10, b.z1 - 20), front: 'w', type: 'office', wealth: 3, seed: (R() * 1e9) | 0, name: '市署' });
        out.lots.push({ r: rect(rcx(b) + 10, b.z0 + 30, b.x1 - 20, b.z1 - 30), front: 'e', type: 'garden', wealth: 2, seed: (R() * 1e9) | 0 }); void ({ r: rect(0, 0, 0, 0), front: 'e', type: 'pond', wealth: 1, seed: (R() * 1e9) | 0, name: '放生池' }); continue; }
      // shop rows on the 4 sides of the block facing out, depth 12–16 m, frontage 6–9 m; warehouses/yards inside
      const dep = 13 + R() * 3;
      for (const side of ['n', 's', 'w', 'e']) {
        const horiz = side === 'n' || side === 's', len = horiz ? rw(b) : rd(b) - 2 * dep; let u = horiz ? b.x0 : b.z0 + dep;
        while (u < (horiz ? b.x1 : b.z1 - dep) - 4) { const fw = Math.min(6 + R() * 4, (horiz ? b.x1 : b.z1 - dep) - u); const lr = horiz ? rect(u, side === 'n' ? b.z0 : b.z1 - dep, u + fw, side === 'n' ? b.z0 + dep : b.z1) : rect(side === 'w' ? b.x0 : b.x1 - dep, u, side === 'w' ? b.x0 + dep : b.x1, u + fw);
          out.lots.push({ r: lr, front: side, type: R() < .15 ? 'wineshop' : 'stall', wealth: 1, seed: (R() * 1e9) | 0 }); u += fw; void len; }
      }
      // behind the shop rows: a back lane all round, then lanes and lots of warehouses (邸), inns, workshops and dwellings
      const inn = rect(b.x0 + dep + 4, b.z0 + dep + 4, b.x1 - dep - 4, b.z1 - dep - 4);
      if (rw(inn) > 40 && rd(inn) > 40) { const bl = [rect(b.x0, b.z0 + dep, b.x1, b.z0 + dep + 4), rect(b.x0, b.z1 - dep - 4, b.x1, b.z1 - dep)]; // back lanes run through the side rows to the streets
        out.lots = out.lots.filter(l => !bl.some(q => l.r.x0 < q.x1 && l.r.x1 > q.x0 && l.r.z0 < q.z1 && l.r.z1 > q.z0)); out.lanes.push({ r: bl[0], axis: 'x' }, { r: bl[1], axis: 'x' });
        if (i === (wd.short === '西市' ? 0 : 2) && j === 0) { const pz1 = inn.z0 + rd(inn) * .45; /* 東市: NE block (龍首渠 from the east); 西市: NW block, where the 漕渠 ends (QA: tool/qa_water.js) */ out.lots.push({ r: rect(inn.x0 + 4, inn.z0 + 4, inn.x1 - 4, pz1), front: 's', type: 'pond', wealth: 1, seed: (R() * 1e9) | 0, name: '放生池', big: true }); CANAL.pond(out.lots[out.lots.length - 1].r); inn.z0 = pz1 + 4; } // the 放生池 / 海池 in the NE corner, fed by the canal from 道政坊 (城坊考 3)
        WARD.subdivide(inn, out, R, { profile: { rich: .05, lots: { warehouse: .4, house: .25, inn: .15, wineshop: .1, shop: .1 }, street: { shop: .6, wineshop: .2, house: .2 } } }); }
      else if (rw(inn) > 20 && rd(inn) > 20) out.lots.push({ r: inn, front: 's', type: 'warehouse', wealth: 2, seed: (R() * 1e9) | 0 });
    }
    for (const s of out.streets) for (let d = 10; d < (s.axis === 'x' ? rw(s.r) : rd(s.r)) - 10; d += 22) if (R() < .5) { const x = s.axis === 'x' ? s.r.x0 + d : rcx(s.r) + (R() < .5 ? -6 : 6), z = s.axis === 'x' ? rcz(s.r) + (R() < .5 ? -6 : 6) : s.r.z0 + d; out.trees.push({ x, z, kind: R() < .7 ? 'huai' : 'elm', s: .8, seed: (R() * 1e6) | 0 }); }
    for (let k = 0; k < 6; k++) out.wells.push({ x: xs[k & 1] + 6, z: zs[(k >> 1) & 1] + 6 });
    COMP.frontFix(out); // every lot faces a street or lane (QA tool/qa_lots.js)
    return out;
  },
};
// market lot types
COMP.stall = function (L, lot, F, w, d, R) { // a market shop 肆 of a 行: open front, goods by trade, the trade's sign object, awning
  lot.foot = []; const sd = Math.min(6, d - 2), trade = lot.trade || COMP.pick(RNG(lot.seed >>> 3), ['cloth', 'silk', 'pottery', 'medicine', 'grain', 'books', 'butcher', 'bakery', 'smith', 'rope', 'tea', 'cloth', 'pottery']), zc = d / 2 - sd / 2 - 1.0, sw = Math.max(3.4, w - .9);
  const sh = ARCH.shop(L, ...F.p(0, 0, zc), { ...COMP.night(lot, 'stall'), jars: false, cls: 1, yaw: F.yaw, w: sw, d: sd, colH: 2.9 + ((lot.seed >>> 5) % 4) * .14, front: R() < .7 ? 'counter' : 'shutters', walls: R() < .5 ? 'white' : 'plank', awning: R() < .7, paint: R() < .75 ? 'plain' : 'ochre', sign: null, flag: null, seed: lot.seed });
  lot.foot.push([-w / 2, zc - sd / 2 - 1, w / 2, d / 2]); ARCH.goods(L, F, 0, .25, zc + sd / 2, sw, trade === 'smith' ? 'pottery' : trade, RNG(lot.seed * 5 + 1), { sign: true, cls: 1, depth: sd, apron: .95, fk: sh.fk, colH: sh.colH });
  /* (the stall's shelves and wares come from ARCH.goods) */
};
COMP.warehouse = function (L, lot, F, w, d, R) { // 邸: storehouses 庫 with plank walls round a yard, carts, sacks and crates
  lot.foot = []; COMP.enclose(L, F, w, d, 0, 3, (lot.seed & 1) ? { h: 2.4, t: .2, style: 'board', coping: false } : { h: 2.6 }); COMP.gate(L, F, 0, d / 2 - .3, 3.1, { h: 3, paint: 'plain', studs: false, cls: 1 }); lot.gx = 0;
  const n = Math.max(1, Math.min(4, Math.floor((w - 2) / 13)));
  for (let i = 0; i < n; i++) { const bays = Math.max(2, Math.min(4, Math.floor((w / n - 2) / 3.6))); COMP.B(L, lot, F, -w / 2 + (i + .5) * w / n, -d / 2 + 4.6, 0, { bays, dbays: 2, bayW: 3.6, dbayW: 3.6, colH: 3.4, platform: .6, pm: .4, brackets: 'none', paint: 'plain', walls: R() < .5 ? 'plank' : 'adobe', roof: 'gable', windows: false, door: [bays >> 1], doorOpen: R() < .5, seed: lot.seed + i }); }
  if (d > 22 && w > 16) COMP.B(L, lot, F, w / 2 - 2.8, 0, -PI / 2, { bays: 3, dbays: 1, bayW: 3.4, dbayW: 4, colH: 3, platform: .4, pm: .3, brackets: 'none', paint: 'plain', walls: 'plank', roof: 'gable', windows: false, door: [1], seed: lot.seed + 9 });
  if (!ARCH.lod) { for (let i = 0; i < 6; i++) { const p = F.p((R() - .5) * (w - 8), 0, (R() - .5) * (d - 14) + 2); L.prop(b2 => { for (let k = 0; k < 4; k++) { b2.T((k % 2) * .6, (k >> 1) * .5, 0, 0, k * .3, 0); PROPS.sack(b2, .9, k); b2.pop(); } }, p[0], 0, p[2], { yaw: R() * 6, solid: { w: 1.4, h: 1, d: 1 } }); }
    const c = F.p(-2, 0, 2); L.prop(b2 => PROPS.cart(b2, {}), c[0], 0, c[2], { yaw: F.yaw + .4, solid: { w: 2, h: 1.6, d: 3.4 } }); }
};
COMP.pond = function (L, lot, F, w, d, R) { CANAL.pond(lot.r); CANAL.basin(L, lot.r, R); }; // (registered by the layout too, so the ground is carved)
// big special compounds: office / 進奏院 / mansion / courtesan quarter / inn — built as one or several 'rich' units
COMP.jinzou = function (L, lot) { COMP.big(L, lot); };
COMP.office = function (L, lot) { COMP.big(L, lot); };

COMP.quarter = function (L, lot, F, w, d, R, gy) { if (lot.big || !F) return COMP.big(L, lot); // 北里 house: a refined courtyard house (南曲/中曲) or a small one (北曲), lit late
  lot.glow = 1; lot.gateCls = 2; const rich = lot.wealth >= 3 && w >= 20 && d >= 26; (rich ? COMP.rich : COMP.house)(L, lot, F, w, d, R, gy);
  if (ARCH.lod) return; const gx = lot.gx || 0, off = rich ? 7.2 : 2.6; /* rich: outside the 烏頭 posts at ±6.0 */ // lantern posts either side of the gate: a timber post with an arm, the lantern hanging from it
  for (const sd of [-1, 1]) { const lx = gx + sd * off; if (Math.abs(lx) > w / 2 - .8) continue; const p = F.p(lx, 0, d / 2 + .45), yaw = F.yaw + (sd < 0 ? 0 : PI);
    L.prop(b => { b.s({ tex: 'wood', col: [.42, .28, .18] }); b.box(0, 1.5, 0, .13, 3, .13); b.box(.3, 2.92, 0, .66, .08, .08); b.box(.1, 2.7, 0, .05, .4, .05); }, p[0], 0, p[2], { yaw, solid: { w: .2, h: 3, d: .2 } });
    const q = F.p(lx - sd * .55, 0, d / 2 + .45); ARCH.lantern(L, q[0], 2.9, q[2], { s: .95, cord: .25, r: 7.5, emi: 1.1 }); } };
// split a big lot into units along the front (u) and depth (v), each a smaller compound facing the front
COMP.BIG = { temple: { parts: true }, jinzou: { unit: 'rich', wealth: 3, cell: [48, 56] }, office: { unit: 'rich', wealth: 3, paint: 'ochre' }, mansion: { unit: 'rich', wealth: 3, garden: .3 }, quarter: { unit: 'house', wealth: 2, cell: [22, 26], garden: .08, glow: 1, mix: { wineshop: .12, inn: .08 } } };
// the units of a big lot (each its own compound facing the front): [{x, z, build(L)}] — so a huge compound spreads over many chunks
COMP.bigUnits = function (lot) {
  if (typeof LANDMARKS !== 'undefined') { const lp = LANDMARKS.parts(lot); if (lp) return lp; } // engine/landmarks.js: dedicated builders for named places
  if (lot.type === 'temple') return COMP.templeParts(lot);
  if (lot.type === 'mansion') return COMP.mansionParts(lot);
  const o = COMP.BIG[lot.type], { F, w, d } = COMP.frame(lot), cw = (o.cell || [60, 70])[0], cd = (o.cell || [60, 70])[1], nu = Math.max(1, Math.round(w / cw)), nv = Math.max(1, Math.round(d / cd)), out = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const uw = w / nu, vd = d / nv, lx = -w / 2 + uw * (i + .5), lz = d / 2 - vd * (j + .5), sub = { r: lot.r, front: lot.front, wealth: o.wealth, seed: lot.seed + i * 31 + j * 977, glow: o.glow, type: o.unit, paint: o.paint };
    const p = F.p(lx, 0, lz), F2 = ARCH.F(p[0], 0, p[2], F.yaw), R2 = RNG(sub.seed), g = R2(); let kind = (o.garden && g < o.garden && !(i === (nu >> 1) && j === 0)) ? 'garden' : o.unit;
    if (o.mix && kind === o.unit) { let acc = 0; const q = R2(); for (const k in o.mix) { acc += o.mix[k]; if (q < acc) { kind = k; break; } } }
    out.push({ x: p[0], z: p[2], build: L => COMP.netRun(L, sub, () => COMP[kind](L, sub, F2, uw, vd, RNG(sub.seed + 1))) });
  }
  return out;
};
COMP.big = function (L, lot) { for (const u of COMP.bigUnits(lot)) u.build(L); };
COMP.temple = function (L, lot) { for (const u of COMP.templeParts(lot)) u.build(L); };
// monastery as separate parts (so a temple that fills a ward quarter spreads over many chunks):
// 山門 → 迴廊 corridor court round the 佛殿 (bell tower and sutra tower in the court) → 講堂; pagoda; monks' courts round small yards
// a temple's pagoda: kind, size and place depend on the lot only (the detailed temple and its far stand-in used to roll them separately)
COMP.pagodaKind = lot => { const { w, d } = COMP.frame(lot); return lot.pagoda || (!COMP.isDao(lot) && w * d > 9000 && ((lot.seed >>> 3) % 10) < 6 ? 'brick' : null); }; // pagodas (stupas) are Buddhist: a Daoist 觀 gets its 醮壇 altar terrace instead (TANG.altar)
COMP.pagodaSpec = (lot, pg) => pg === 'dayan' ? { storeys: 10, w: 23, h1: 5.4, taper: .045 } : pg === 'xiaoyan' ? { storeys: 15, w: 16, h1: 6.5, dense: true, taper: .03, walk: true } : pg === 'wooden' ? { storeys: 7, w: 16, h1: 9 } : { storeys: 5 + ((lot.seed >>> 5) % 3), w: 8 + ((lot.seed >>> 7) % 7) * .5 };
COMP.templeMainZ = lot => { const { w, d } = COMP.frame(lot), big = w * d > 9000, zf = d / 2 - .3, cTop = zf - 6.2, cBot = big ? d / 2 - Math.min(d * .62, 120) : -d / 2 + 6; return big ? cBot + (cTop - cBot) * .35 : -d * .12; }; // as COMP.templeParts
COMP.pagodaZ = lot => { const { d } = COMP.frame(lot); return (d / 2 - .3 - 4 + COMP.templeMainZ(lot)) / 2 + 2; };
COMP.templeParts = function (lot) {
  const { F, w, d } = COMP.frame(lot), R = RNG(lot.seed), big = w * d > 9000, zf = d / 2 - .3, out = [], foot = [], P2 = (x, z) => { const p = F.p(x, 0, z); return [p[0], p[2]]; };
  const axisW = Math.min(w - 8, big ? 76 : w - 8), gW = 3 * 4.4, cTop = zf - 6.2, cBot = big ? d / 2 - Math.min(d * .62, 120) : -d / 2 + 6, mainZ = big ? cBot + (cTop - cBot) * .35 : -d * .12, cx = axisW / 2 - 1.6;
  const part = (lx, lz, fn) => { const p = F.p(lx, 0, lz); out.push({ x: p[0], z: p[2], build: L => { const keep = lot.foot; lot.foot = foot; try { COMP.netRun(L, lot, () => fn(L)); } finally { lot.foot = keep; } } }); };
  lot.gx = 0; lot.zMain = mainZ;
  part(0, zf, L => { COMP.enclose(L, F, w, d, 0, gW + .2, { h: 3, t: .6 }); COMP.B(L, lot, F, 0, zf - 1.6, 0, { cls: 3, bays: 3, dbays: 2, bayW: 4.4, dbayW: 3.2, colH: 4, platform: .38, pm: .5, steps: false, brackets: 'simple', roof: 'xieshan', fish: true, paint: 'ochre', fill: { front: ['wall', 'boardopen', 'wall'], back: ['open', 'opendoor', 'open'], left: ['wall', 'wall'], right: ['wall', 'wall'] }, studs: true, seed: lot.seed }); });
  part(0, mainZ, L => COMP.B(L, lot, F, 0, mainZ, 0, { cls: 3, furnish: 'temple', lit: .7, lamp: 3, bays: big ? 7 : 5, dbays: 4, bayW: big ? 5 : 4.4, dbayW: 4.4, colH: 5, platform: 1.3, pm: 1.6, brackets: 'full', roof: 'hip', walls: 'white', paint: 'ochre', doorOpen: true, windows: true, railing: true, fish: true, glow: .25, allRaf: true, seed: lot.seed + 1 }));
  if (cTop - cBot > 20) {
    part(0, cBot, L => ARCH.corridor(L, ...P2(-cx - 1.4, cBot), ...P2(cx + 1.4, cBot), { w: 2.8, wall: -1, colH: 3.05, paint: 'ochre', seed: lot.seed + 7 })); // cross corridors 15 cm higher than the side ones: their gable ends never share planes
    for (const sd of [-1, 1]) { const za = cTop - .5, zb = cBot + 2.2; part(sd * cx, (za + zb) / 2, L => ARCH.corridor(L, ...P2(sd * cx, za), ...P2(sd * cx, zb), { w: 2.8, wall: sd, paint: 'ochre', seed: lot.seed + sd }));
      part(sd * cx / 2, cTop + 1.3, L => ARCH.corridor(L, ...P2(sd * (gW / 2 + 1), cTop + 1.3), ...P2(sd * (cx + 1.4), cTop + 1.3), { w: 2.6, wall: 0, colH: 3.05, paint: 'ochre', seed: lot.seed + 4 + sd })); foot.push([sd * cx - 1.6, cBot, sd * cx + 1.6, cTop]);
      const tz = (cTop + mainZ) / 2 + 3, tx = sd * Math.min(cx - 7, 16); foot.push([tx - 4, tz - 4, tx + 4, tz + 4]);
      part(tx, tz, L => { const p = F.p(tx, 0, tz); ARCH.lou(L, p[0], 0, p[2], { furnish: 'store', lot: lot.seed, yaw: F.yaw + sd * PI / 2, bays: 1, dbays: 1, bayW: 4.6, dbayW: 4.6, colH1: 3.4, colH2: 2.8, platform: 1, roof: 'hip', paint: 'ochre', door: 0, seed: lot.seed + 60 + sd }); // 鐘樓 / 經藏 two-storey towers
        if (!ARCH.lod && sd < 0) ARCH.stamp(L, 'bell', b => { b.s({ tex: 'bronze', col: [.7, .6, .45] }).lathe([[0, 0], [.55, 0], [.5, .15], [.45, .9], [.3, 1.15], [0, 1.2]], { seg: 10 }); b.s({ tex: 'dark_wood' }).box(0, 1.35, 0, 1.6, .14, .14).box(0, 1.47, 0, 4.56, .2, .2); }, p[0], 1 + 3.4 + .62 + .4, p[2], F.yaw); /* hung from a beam spanning the storey wall to wall (QA float check) */ }); } } // the bell hangs in the upper storey
  if (big && d > 160) part(0, cBot - 18, L => COMP.B(L, lot, F, 0, cBot - 18, 0, { cls: 3, furnish: 'hall', bays: 5, dbays: 3, bayW: 4.6, dbayW: 4, colH: 4.4, platform: 1, brackets: 'simple', roof: 'xieshan', fish: true, paint: 'ochre', walls: 'white', windows: true, seed: lot.seed + 2 })); // 講堂
  const pz = COMP.pagodaZ(lot), pg = COMP.pagodaKind(lot);
  if (!pg && COMP.isDao(lot)) { const s0 = Math.min(16, w * .3); foot.push([-s0 / 2 - 3, pz - s0 / 2 - 3, s0 / 2 + 3, pz + s0 / 2 + 3]); part(0, pz, L => { const p = F.p(0, 0, pz); TANG.altar(L, p[0], 0, p[2], F.yaw, s0); }); } // the abbey's 醮壇 (齋醮 rites) on the axis where a monastery has its pagoda
  if (pg) { const o = COMP.pagodaSpec(lot, pg);
    foot.push([-o.w, pz - o.w, o.w, pz + o.w]); part(0, pz, L => { const p = F.p(0, 0, pz); TANG.pagoda(L, p[0], 0, p[2], Object.assign({ yaw: F.yaw }, o)); }); { const p = F.p(0, 0, pz); lot.pagodaAt = { x: p[0], z: p[2], yaw: F.yaw, kind: pg }; } }
  // round 11: the side bands and the rear of the axis are filled with 院 cells (no bare strips): 僧院 monks' courts, one 庫院 (kitchen and stores, a well),
  // 菜園 vegetable plots, garden courts (pine, cypress, 槐, bamboo), and behind the 講堂 the 藏經樓 court. Cells ~40 m: no court more than ~1/3 bare.
  if (big) { const cells = []; let kit = false;
    for (const sd of [-1, 1]) { const sw = (w - axisW) / 2 - 4; if (sw < 20) continue; const nc = Math.max(1, Math.round(sw / 44)), cw = sw / nc; let z = d / 2 - 6;
      while (z > -d / 2 + 30) { const ud = Math.min(40, z + d / 2 - 4); for (let c = 0; c < nc; c++) cells.push({ lx: sd * (axisW / 2 + 2 + cw * (c + .5)), lz: z - ud / 2, a: ud, b: cw - 3, yaw: sd < 0 ? PI / 2 : -PI / 2 }); z -= ud + 4; } }
    if (d > 160) { let z = cBot - 30, first = true; while (z > -d / 2 + 34) { const ud = Math.min(40, z + d / 2 - 4); if (first) cells.push({ lx: 0, lz: z - ud / 2, a: axisW - 4, b: ud, yaw: 0, kind: 'library' }); else for (const sd of [-1, 1]) cells.push({ lx: sd * axisW / 4, lz: z - ud / 2, a: axisW / 2 - 3, b: ud, yaw: 0 }); first = false; z -= ud + 4; } }
    for (const [ci, c] of cells.entries()) { const rot = Math.abs(Math.sin(c.yaw)) > .5, ex = (rot ? c.b : c.a) / 2, ez = (rot ? c.a : c.b) / 2; foot.push([c.lx - ex, c.lz - ez, c.lx + ex, c.lz + ez]);
      const r = hash2(lot.seed, ci, 911); c.kind = c.kind || (!kit && ci > 1 ? (kit = 'kitchen') : r < .55 ? 'house' : r < .75 ? 'garden' : r < .9 ? 'veg' : 'house');
      const p = F.p(c.lx, 0, c.lz), F2 = ARCH.F(p[0], 0, p[2], F.yaw + c.yaw), sub = { seed: (lot.seed + ci * 131) | 0, wealth: 2, type: 'temple', _F: F2 }; // _F: the cell's frame (nature.js reads lot feet through it)
      part(c.lx, c.lz, L => COMP.netRun(L, sub, () => COMP.templeCell(L, sub, F2, c.a, c.b, c.kind, RNG(sub.seed)))); } }
  { const mw = (big ? 7 * 5 : 5 * 4.4) / 2 + 1.6, md = 4 * 4.4 / 2 + 1.6; foot.push([-mw, mainZ - md, mw, mainZ + md]); foot.push([-3 * 4.4 / 2 - .5, zf - 1.6 - 3.2 - .5, 3 * 4.4 / 2 + .5, zf]); if (big && d > 160) foot.push([-5 * 4.6 / 2 - 1, cBot - 18 - 7, 5 * 4.6 / 2 + 1, cBot - 18 + 7]); } // the halls' footprints before the trees are drawn (they only reached lot.foot while building: trees stood inside the halls)
  const trees = []; for (let i = 0; i < (big ? 24 : 8); i++) { const x = (R() - .5) * (axisW - 10), z = (R() - .5) * (d - 10), k = R() < .4 ? 'huai' : R() < .6 ? 'pine' : 'elm'; if (!foot.some(f => x > f[0] - 5.5 && x < f[2] + 5.5 && z > f[1] - 5.5 && z < f[3] + 5.5)) trees.push([x, z, k, i]); } // crowns stay clear of the halls (they showed through inside)
  for (const [x, z, k, i] of trees) part(x, z, L => COMP.tree(L, F, x, z, k, 1, lot.seed + i));
  part(0, 0, L => { if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, F, w, d, RNG(lot.seed + 5), 'temple'); });
  return out;
};

// one 院 of a big monastery, w x d in its own frame (front +z = its gate side): 'house' 僧院 | 'kitchen' 庫院 | 'veg' 菜園 | 'garden' | 'library' 藏經樓 court
COMP.templeCell = function (L, lot, F, w, d, kind, R) {
  if (kind === 'house') return COMP.house(L, lot, F, w, d, R);
  lot.foot = []; const P = (x, z) => F.p(x, 0, z), b = L.mb;
  if (kind === 'veg') { COMP.enclose(L, F, w, d, 0, 2.4, { style: 'mud', h: 1.7, t: .4, coping: false });
    b.s({ tex: 'field_crop', col: [1, 1, 1] }); for (let z = -d / 2 + 3; z < d / 2 - 7; z += 2.3) { const p = P(0, z); b.T(p[0], 0, p[2], 0, F.yaw, 0).box(0, .06, 0, w - 7, .24, 1.5, { skip: ['bot'], uv: [Math.round(w / 3), 1] }).pop(); } // raised beds
    COMP.B(L, lot, F, w / 2 - 3.2, d / 2 - 4, PI, { bays: 1, dbays: 1, bayW: 2.8, dbayW: 2.6, colH: 2.2, platform: .1, pm: .2, brackets: 'none', paint: 'plain', walls: 'mud', roof: 'gable', tiles: 'thatch', steps: false, windows: false, door: [0], doorOpen: true, rafters: false }); // tool shed
    const q = P(-w / 2 + 3, d / 2 - 3.5); L.prop(PROPS.well, q[0], 0, q[2], { solid: { r: .9, h: .8 } }); return; }
  COMP.enclose(L, F, w, d, 0, 2.6, { h: 2.8 });
  if (kind === 'garden') { const n = Math.round(w * d / 110), pav = w > 24 && d > 24; for (let i = 0; i < n; i++) { const x = (R() - .5) * (w - 6), z = (R() - .5) * (d - 7); if (pav && Math.abs(x) < 5 && Math.abs(z) < 5) continue; /* clear of the 亭 */ COMP.tree(L, F, x, z, ['pine', 'cypress', 'bamboo', 'huai', 'bamboo', 'peach'][i % 6], .9 + R() * .3, lot.seed + i); }
    if (w > 24 && d > 24) COMP.B(L, lot, F, 0, 0, 0, { bays: 1, dbays: 1, bayW: 4.2, dbayW: 4.2, colH: 3, platform: .5, pm: .4, brackets: 'none', paint: 'ochre', walls: 'open', roof: 'hip', steps: false, windows: false, rafters: false }); return; } // 亭 (square hip = 攢尖)
  if (kind === 'kitchen') { const nb = Math.max(2, Math.floor((w - 6) / 3.6)); COMP.B(L, lot, F, 0, -d / 2 + 5, 0, { bays: nb, dbays: 2, bayW: 3.6, dbayW: 3.4, colH: 3.2, platform: .3, pm: .4, brackets: 'none', paint: 'plain', walls: 'white', roof: 'gable', windows: true, door: [nb >> 1], doorOpen: true }); // 香積廚
    const nd = Math.max(2, Math.floor((d - 16) / 3.6)); for (const sd of [-1, 1]) COMP.B(L, lot, F, sd * (w / 2 - 4.2), 1, sd < 0 ? PI / 2 : -PI / 2, { bays: nd, dbays: 2, bayW: 3.6, dbayW: 3.2, colH: 3, platform: .3, pm: .3, brackets: 'none', paint: 'plain', walls: 'white', roof: 'gable', windows: false, door: [nd >> 1] }); // stores
    const q = P(0, d / 2 - 6); L.prop(PROPS.well, q[0], 0, q[2], { solid: { r: .9, h: .8 } }); for (let i = 0; i < 3; i++) COMP.tree(L, F, (i - 1) * 7, d / 2 - 11, 'huai', 1, lot.seed + i); return; }
  if (kind === 'library') { const p = P(0, -2); ARCH.lou(L, p[0], 0, p[2], { furnish: 'hall', lot: lot.seed, yaw: F.yaw, bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, colH1: 3.6, colH2: 3.2, platform: 1, roof: 'xieshan', paint: 'ochre', seed: lot.seed }); lot.foot.push([-14, -11, 14, 7]); // 藏經樓
    for (const sd of [-1, 1]) COMP.B(L, lot, F, sd * (w / 2 - 5), 0, sd < 0 ? PI / 2 : -PI / 2, { bays: Math.max(3, Math.floor((d - 10) / 3.8)), dbays: 2, bayW: 3.8, dbayW: 3.4, colH: 3.2, platform: .5, pm: .4, brackets: 'none', paint: 'ochre', walls: 'white', roof: 'gable', windows: true }); // 廊房
    for (const sd of [-1, 1]) COMP.tree(L, F, sd * 9, d / 2 - 6, 'pine', 1.1, lot.seed + sd); }
};

// =====================================================================================
// MANSIONS 第宅 (round 12): one coherent great house per 'mansion' lot, as parts spread over chunks.
// History: 營繕令 (唐會要 31): 三品已上堂舍五間九架, 門屋 ≤ 五間五架, 烏頭大門; 郭子儀宅 (舊唐書): a quarter of 親仁坊, 中通永巷, 家人三千.
// Ceremonial core on the main axis (symmetric): 門屋 → front court (stables, grooms) → 中門 → 廳 in a 廊院 → 寢 court (family; 廂 for wives and
// concubines) → rear court with a 樓 in some. Everything else comes from a small WFC on a coarse grid of side cells (kitchen / store / stable /
// servants / guest / 書院 / 家廟 / family 跨院 / orchard / vegetable plot / garden court) with adjacency rules, 永巷 lanes between the columns
// and a cross lane at the back, a garden (園) at the back, a side or a front side, 1–3 axes, several perimeter gates.
// COMP.mansionPlan(lot) is pure data (Node-safe): regions, gates, buildings, cover, path graph with patrol loops, stats. COMP.mansionParts(lot)
// builds it: one 'walls' part (the whole wall network, one netRun: real junction piers) + one part per region.
// =====================================================================================
COMP.mansionPlan = function (lot) {
  if (lot._mplan) return lot._mplan;
  const { F, w, d } = COMP.frame(lot), R = RNG(((lot.seed | 0) ^ 0x5bd1e995) * 7 + 11), named = !!lot.name, giant = w * d > 42000, great = !!lot.great || giant, wealth = great ? 4 : Math.max(3, lot.wealth || 3);
  const ins = .45, X0 = -w / 2 + ins, X1 = w / 2 - ins, Z0 = -d / 2 + ins, Z1 = d / 2 - ins, LW = 4, IW = X1 - X0;
  const P = { lot: lot.seed, name: lot.name || null, w, d, wealth, great, giant, regions: [], gates: [], bld: [], cover: [], nodes: [], edges: [], spots: [], stats: {} };
  const reg = (kind, x0, z0, x1, z1, o = {}) => { const r = Object.assign({ id: P.regions.length, kind, x0, z0, x1, z1 }, o); P.regions.push(r); return r; };
  // ---- columns: sides | lane | axes (lanes between) | lane | sides; the main axis among the axes
  const nA = giant ? 2 + (R() < .5 ? 1 : 0) : great ? (IW > 150 && R() < .6 ? 2 : 1) : 1;
  const aw = [clamp(IW * (nA === 1 ? .36 + R() * .1 : nA === 2 ? .3 : .24), 30, 60)]; for (let i = 1; i < nA; i++) aw.push(clamp(IW * (.16 + R() * .08), 24, 42));
  let rest = IW - aw.reduce((a, c) => a + c, 0) - LW * (nA - 1); const rr = .2 + R() * .6; let sL = rest * rr, sR = rest - sL;
  if (sL < 18 + LW) { sR += sL; sL = 0; } if (sR < 18 + LW) { if (sL) sL += sR; else aw[0] += sR; sR = 0; } if (!sL && !sR) aw[0] = IW - aw.slice(1).reduce((a, c) => a + c, 0) - LW * (nA - 1);
  const mi = nA === 3 ? 1 : R() < .5 ? 0 : nA - 1, order = []; for (let i = 0; i < nA; i++) order.push(i === mi ? 0 : (i < mi ? i + 1 : i)); // index into aw
  const cols = []; let x = X0; const col = (kind, wd, o = {}) => { cols.push(Object.assign({ kind, x0: x, x1: x + wd }, o)); x += wd; };
  const side = (s, which) => { if (s > 54) { const a = s * (.4 + R() * .2) - LW / 2; col('side', a, { which, outer: which === 'L' }); col('lane', LW); col('side', s - a - LW, { which, outer: which === 'R' }); } else col('side', s, { which, outer: true, inner: true }); };
  if (sL) { side(sL - LW, 'L'); col('lane', LW); } order.forEach((ai, k) => { if (k) col('lane', LW); col('axis', aw[ai], { main: ai === 0, ai }); }); if (sR) { col('lane', LW); side(sR - LW, 'R'); }
  const scale = IW / (x - X0); if (Math.abs(scale - 1) > 1e-6) { let xx = X0; for (const c of cols) { const wd = (c.x1 - c.x0) * (c.kind === 'lane' ? 1 : scale + (1 - scale) * 0); c.x0 = xx; c.x1 = xx + wd; xx = c.x1; } cols[cols.length - 1].x1 = X1; }
  for (const c of cols) if (c.kind === 'side') { const i = cols.indexOf(c); c.laneL = cols[i - 1] && cols[i - 1].kind === 'lane'; c.laneR = cols[i + 1] && cols[i + 1].kind === 'lane'; }
  // ---- rows: front court across the front; garden at the back (with a cross lane), on a side or at a front side
  const fd = clamp(d * .14, 16, 26), Zf = Z1 - fd, sides = cols.filter(c => c.kind === 'side');
  let gm = sides.length ? (R() < (great ? .45 : .6) ? 'back' : R() < .65 || d < 110 ? 'side' : 'frontside') : 'back'; if (giant) gm = 'back';
  const gd = clamp(d * (.18 + R() * .08), 22, 60); let Zb = Z0, gardenCol = null;
  const FC = reg('front', X0, Zf, X1, Z1);
  if (gm === 'back') { reg('garden', X0, Z0, X1, Z0 + gd); reg('cross', X0, Z0 + gd, X1, Z0 + gd + LW); Zb = Z0 + gd + LW; }
  else { gardenCol = sides.reduce((a, c) => (c.x1 - c.x0 > a.x1 - a.x0 ? c : a)); const span = Zf - Z0, gz = span * (.4 + R() * .25);
    if (gm === 'side') { reg('garden', gardenCol.x0, Z0, gardenCol.x1, Z0 + gz); gardenCol.gz0 = Z0 + gz; gardenCol.gz1 = Zf; } else { reg('garden', gardenCol.x0, Zf - gz, gardenCol.x1, Zf); gardenCol.gz0 = Z0; gardenCol.gz1 = Zf - gz; } }
  for (const c of cols) if (c.kind === 'lane') c.reg = reg('lane', c.x0, Zb, c.x1, Zf);
  // ---- axes: the ceremonial core on the main axis, family courts on the others
  const span = Zf - Zb; let master = null;
  for (const c of cols.filter(q => q.kind === 'axis')) {
    if (c.main) { const hd = clamp(span * (.36 + R() * .08), 32, 64), qd = clamp(span * (.28 + R() * .06), 26, 50);
      const HC = reg('hall', c.x0, Zf - hd, c.x1, Zf, { axis: true }), remZ = Zf - hd - qd - Zb, rc = remZ >= 24; // a deep axis gets a rear court (and a family court behind it): no empty 寢 court
      const QC = reg('qin', c.x0, rc ? Zf - hd - qd : Zb, c.x1, Zf - hd, { axis: true, lou: great ? R() < .45 : R() < .25 });
      if (rc) { const zr = Zf - hd - qd; if (remZ > 70) { const rd2 = clamp(remZ * .45, 28, 45); reg('rear', c.x0, zr - rd2, c.x1, zr, { axis: true, storeys: great && R() < .14 ? 3 : 2 }); reg('family', c.x0, Zb, c.x1, zr - rd2, { axis: true, lou: R() < .35 }); } else reg('rear', c.x0, Zb, c.x1, zr, { axis: true, storeys: great && R() < .14 ? 3 : 2 }); } c.HC = HC; c.QC = QC; master = QC; }
    else { const n = span > 110 ? 3 : 2; let z = Zf; for (let k = 0; k < n; k++) { const dz = k === n - 1 ? z - Zb : span / n * (.85 + R() * .3); reg('family', c.x0, z - dz, c.x1, z, { axis: true, lou: k === n - 1 && R() < .5 }); z -= dz; } } }
  // ---- side cells and a small WFC: modules with adjacency rules and counts
  const cells = []; for (const c of sides) { let z1 = Zf, zb = Zb; if (c === gardenCol) { z1 = c.gz1; zb = c.gz0; } const len = z1 - zb; if (len < 16) continue; const n = Math.max(1, Math.round(len / (20 + R() * 10))), cd = len / n;
    for (let k = 0; k < n; k++) cells.push({ c, row: k, rows: n, x0: c.x0, x1: c.x1, z1: z1 - k * cd, z0: z1 - (k + 1) * cd, top: k === 0 && z1 === Zf, bottom: k === n - 1 }); }
  const MOD = ['kitchen', 'store', 'stable', 'servants', 'guest', 'study', 'shrine', 'family', 'orchard', 'veg', 'gardenlet'];
  const WT = { kitchen: 2, store: 1.4, stable: 1.4, servants: 2, guest: 1.2, study: 1, shrine: wealth >= 4 ? 1 : .4, family: 1.6, orchard: .8, veg: .7, gardenlet: 1 };
  const MAXN = { kitchen: 2, stable: 2, study: great ? 2 : 1, shrine: 1, orchard: 1, veg: 1, guest: 2, gardenlet: 2 };
  const BAD = { kitchen: ['shrine', 'study', 'guest'], stable: ['shrine', 'study', 'kitchen'], servants: ['shrine'], shrine: ['kitchen', 'stable', 'servants', 'veg'], study: ['stable', 'kitchen'], guest: ['stable', 'kitchen'] };
  const allow = (cl, m) => { if (m === 'stable') return cl.top; if (m === 'orchard' || m === 'veg') return cl.bottom && !cl.top; if (m === 'gardenlet') return !cl.top; if (m === 'kitchen') return !!(cl.c.laneL || cl.c.laneR); return true; };
  const nb = (a, b) => a.c === b.c && Math.abs(a.row - b.row) === 1 || (Math.abs(a.row - b.row) <= 1 && a.c.which === b.c.which && a.c !== b.c && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 4);
  let ok = false; for (let tries = 0; tries < 30 && !ok; tries++) {
    for (const cl of cells) cl.dom = MOD.filter(m => allow(cl, m)); const cnt = {}; ok = true;
    for (let it = 0; it < cells.length; it++) { const open = cells.filter(q => !q.mod); if (!open.length) break; const minD = Math.min(...open.map(q => q.dom.length)); const cand = open.filter(q => q.dom.length === minD), cl = cand[(R() * cand.length) | 0];
      if (!cl.dom.length) { ok = false; break; } const tw = cl.dom.reduce((a, m) => a + WT[m], 0); let rv = R() * tw, m = cl.dom[cl.dom.length - 1]; for (const q of cl.dom) { rv -= WT[q]; if (rv <= 0) { m = q; break; } }
      cl.mod = m; cnt[m] = (cnt[m] || 0) + 1; if (MAXN[m] && cnt[m] >= MAXN[m]) for (const q of cells) if (!q.mod) q.dom = q.dom.filter(z => z !== m);
      for (const q of cells) if (!q.mod && nb(cl, q)) q.dom = q.dom.filter(z => !(BAD[m] || []).includes(z) && !(BAD[z] || []).includes(m)); }
    if (ok && cells.length >= 3 && !(['kitchen', 'servants'].every(m => cells.some(q => q.mod === m)))) ok = false; // every house has a kitchen and servants' rows
    if (!ok) for (const q of cells) q.mod = null; }
  for (const q of cells) if (!q.mod) q.mod = 'family';
  // merge vertical runs of the same service module (one bigger court)
  for (const cl of cells) { const prev = cells.find(q => q.c === cl.c && q.row === cl.row - 1); if (prev && prev.mod === cl.mod && /store|servants|orchard/.test(cl.mod) && prev.r) { prev.r.z0 = cl.z0; cl.r = prev.r; continue; } cl.r = reg(cl.mod, cl.x0, cl.z0, cl.x1, cl.z1, { cell: true, col: cl.c }); }
  // ---- gates (lot-local; ori 'x': in a wall running along x, i.e. z = const)
  const FW = COMP.frame(lot).F, gate = (a, b, x, z, ori, wd, kind, o = {}) => { const g = Object.assign({ id: P.gates.length, a: a ? a.id : -1, b: b ? b.id : -1, x, z, ori, w: wd, kind }, o);
    if (!b && kind !== 'main') { const q = FW.p(x + (ori === 'z' ? Math.sign(x) * 2.2 : 0), 0, z + (ori === 'x' ? Math.sign(z) * 2.2 : 0)); if (!COMP.wayAt(q[0], q[2])) return g; } // a side / back gate only where a street or lane runs outside (never into the ward wall or a neighbour: QA door check)
    P.gates.push(g); return g; };
  const main = cols.find(c => c.main), ax = (main.x0 + main.x1) / 2, gB = great ? (named || giant ? 5 : 3) : 3;
  gate(FC, null, ax, Z1, 'x', gB * 3.4 + .2, 'main', { bays: gB });
  const laneCols = cols.filter(c => c.kind === 'lane');
  if (sides.length) { const sc = sides[(R() * sides.length) | 0]; if (R() < .55) gate(FC, null, (sc.x0 + sc.x1) / 2, Z1, 'x', 3.0, 'side'); else gate(FC, null, sc.which === 'L' ? X0 : X1, (Zf + Z1) / 2, 'z', 3.0, 'side'); }
  else gate(FC, null, R() < .5 ? X0 : X1, (Zf + Z1) / 2, 'z', 3.0, 'side');
  if (giant) { const g1 = P.gates[P.gates.length - 1]; if (g1.ori === 'z') gate(FC, null, g1.x < 0 ? X1 : X0, (Zf + Z1) / 2, 'z', 3.0, 'side'); else gate(FC, null, R() < .5 ? X0 : X1, (Zf + Z1) / 2, 'z', 3.0, 'side'); } // giants: side gates on both flanks
  const GR = P.regions.find(r => r.kind === 'garden'), CR = P.regions.find(r => r.kind === 'cross');
  if (gm === 'back') gate(GR, null, laneCols.length ? (laneCols[(R() * laneCols.length) | 0].x0 + LW / 2) : (X0 + X1) / 2 + (R() - .5) * IW * .5, Z0, 'x', 2.8, 'back');
  else { const bot = P.regions.filter(r => r.axis && Math.abs(r.z0 - Z0) < .1 && /qin|rear|family/.test(r.kind)); const r = bot.length ? bot[(R() * bot.length) | 0] : null; // 後門 from a rear court (or the garden) to the lane behind
    if (r) gate(r, null, (r.x0 + r.x1) / 2 + (R() - .5) * (r.x1 - r.x0) * .4, Z0, 'x', 2.8, 'back'); else gate(GR, null, (GR.x0 + GR.x1) / 2, Z0, 'x', 2.8, 'back'); }
  const laneAt = (xx) => laneCols.find(c => Math.abs(c.x0 - xx) < .5 || Math.abs(c.x1 - xx) < .5);
  for (const r of P.regions) { if (!/hall|qin|rear|family|kitchen|store|stable|servants|guest|study|shrine|orchard|veg|gardenlet/.test(r.kind)) continue; const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, LL = laneAt(r.x0), RL = laneAt(r.x1);
    const sideGate = (lc, zz, kind = 'inner') => gate(r, lc.reg, lc === LL ? r.x0 : r.x1, zz, 'z', 2.6, kind);
    if (r.kind === 'hall') { gate(FC, r, cx, r.z1, 'x', 3 * 3.4 + .2, 'zhongmen', { bays: 3 }); for (const lc of [LL, RL]) if (lc && R() < .65) sideGate(lc, r.z0 + (r.z1 - r.z0) * (.25 + R() * .2)); }
    else if (r.kind === 'qin') { const H = P.regions.find(q => q.kind === 'hall' && Math.abs(q.z0 - r.z1) < .1 && q.x0 === r.x0); if (H) gate(H, r, cx + (R() < .5 ? 0 : (R() - .5) * 8), r.z1, 'x', 2.8, 'inner');
      const ls = [LL, RL].filter(Boolean); if (ls.length) { const pick = ls.length > 1 && R() < .55 ? ls : [ls[(R() * ls.length) | 0]]; for (const lc of pick) sideGate(lc, r.z0 + (r.z1 - r.z0) * (.2 + R() * .2)); }
      if (Math.abs(r.z0 - Zb) < .1 && CR) gate(r, CR, cx + (R() - .5) * 10, r.z0, 'x', 2.6, 'inner'); else if (Math.abs(r.z0 - Zb) < .1 && !CR) { /* a back door into the rear lanes */ }
      r.master = true; }
    else if (r.kind === 'rear') { const Q = P.regions.find(q => q.kind === 'qin' && Math.abs(q.z0 - r.z1) < .1 && q.x0 === r.x0); if (Q) gate(Q, r, cx, r.z1, 'x', 2.6, 'inner'); const ls = [LL, RL].filter(Boolean); if (ls.length) sideGate(ls[(R() * ls.length) | 0], (r.z0 + r.z1) / 2); if (CR) gate(r, CR, cx + (R() - .5) * 8, r.z0, 'x', 2.6, 'inner'); }
    else if (r.kind === 'family' && !r.cell) { const above = P.regions.find(q => q.axis && Math.abs(q.z0 - r.z1) < .1 && Math.abs(q.x0 - r.x0) < .1); if (Math.abs(r.z1 - Zf) < .1) gate(FC, r, cx, r.z1, 'x', 2.8, 'inner'); else if (above) gate(above, r, cx, r.z1, 'x', 2.6, 'inner');
      for (const lc of [LL, RL]) if (lc && R() < .5) sideGate(lc, cz); if (Math.abs(r.z0 - Zb) < .1 && CR && R() < .6) gate(r, CR, cx, r.z0, 'x', 2.6, 'inner'); }
    else if (r.cell) { const c = r.col; let n = 0;
      if (Math.abs(r.z1 - Zf) < .1 && (/stable|kitchen|servants/.test(r.kind) || R() < .5)) { gate(FC, r, cx, r.z1, 'x', /stable/.test(r.kind) ? 3.4 : 2.8, 'inner'); n++; }
      const lc = c.laneL ? laneAt(c.x0) : c.laneR ? laneAt(c.x1) : null; if (lc && (!n || R() < .6)) { gate(r, lc.reg, lc === laneAt(r.x0) ? r.x0 : r.x1, cz + (R() - .5) * (r.z1 - r.z0) * .3, 'z', 2.6, 'inner'); n++; }
      const below = P.regions.find(q => q.cell && q.col === c && Math.abs(q.z1 - r.z0) < .1); if (below && (!n || R() < .35)) { gate(r, below, cx + (R() - .5) * 6, r.z0, 'x', 2.6, 'inner'); n++; }
      if (!n) { const above = P.regions.find(q => q.cell && q.col === c && Math.abs(q.z0 - r.z1) < .1) || (gardenCol === c ? GR : null); if (above) gate(above, r, cx, r.z1, 'x', 2.6, 'inner'); else if (Math.abs(r.z0 - Zb) < .1 && CR) gate(r, CR, cx, r.z0, 'x', 2.6, 'inner'); else { const nbC = P.regions.find(q => q.cell && q.col !== c && q.col.which === c.which && Math.min(q.z1, r.z1) - Math.max(q.z0, r.z0) > 6); if (nbC) gate(r, nbC, Math.abs(nbC.x0 - r.x1) < LW + 1 ? r.x1 : r.x0, (Math.max(nbC.z0, r.z0) + Math.min(nbC.z1, r.z1)) / 2, 'z', 2.6, 'inner'); } } } }
  // a court with a perimeter gate gets at least two other ways out (side gates to its lanes): no single choke point behind a back door
  for (const pg of P.gates.filter(g => g.b < 0 && g.kind !== 'main')) { const r = P.regions[pg.a]; if (/front|garden|lane|cross/.test(r.kind)) continue; const other = P.gates.filter(g => g !== pg && (g.a === r.id || g.b === r.id)).length;
    if (other < 2) for (const lc of [laneAt(r.x0), laneAt(r.x1)]) { if (!lc || P.gates.some(g => (g.a === r.id || g.b === r.id) && (g.a === lc.reg.id || g.b === lc.reg.id))) continue; gate(r, lc.reg, lc === laneAt(r.x0) ? r.x0 : r.x1, r.z0 + (r.z1 - r.z0) * .35, 'z', 2.6, 'inner'); break; } }
  // the garden: gates from the cross lane at every lane foot (back), or from its column's lane and the court above (side / front side)
  if (GR) { if (gm === 'back') { const xs2 = laneCols.map(lc => lc.x0 + LW / 2); if (xs2.length < 2) xs2.push(xs2.length && Math.abs(xs2[0] - ax) < 8 ? (xs2[0] < 0 ? X1 - 8 : X0 + 8) : ax); for (const gx of xs2) gate(CR, GR, gx, GR.z1, 'x', 2.6, 'inner'); } // at least two ways into the garden
    else { const c = gardenCol, lc = c.laneL ? laneAt(c.x0) : c.laneR ? laneAt(c.x1) : null; if (lc) gate(GR, lc.reg, lc === laneAt(c.x0) ? c.x0 : c.x1, (GR.z0 + GR.z1) / 2, 'z', 2.6, 'inner'); if (gm === 'frontside') gate(FC, GR, (GR.x0 + GR.x1) / 2, GR.z1, 'x', 2.6, 'inner'); } }
  // ---- buildings per region (lot-local centre, yaw: 0 faces +z (front), PI back, ±PI/2 sideways), cover and planting
  let bid = 0; const B = (r, kind, cx, cz, yaw, o) => { // a building: shrunk (fewer bays) until it clears the others, its region's walls and the gates; else dropped
    for (let bays = o.bays; bays >= 1; bays--) { const b = Object.assign({ region: r.id, kind, cx, cz, yaw, storeys: 1 }, o, { bays }); const W = bays * b.bayW, D = b.dbays * b.dbayW, rot = Math.abs(Math.sin(yaw)) > .5, m = (b.platform ?? .5) > .6 ? 1.6 : 1.1, hx = (rot ? D : W) / 2 + m, hz = (rot ? W : D) / 2 + m;
      b.rect = [cx - hx, cz - hz, cx + hx, cz + hz]; const inR = kind === 'gatehouse' || (b.rect[0] > r.x0 - .1 && b.rect[2] < r.x1 + .1 && b.rect[1] > r.z0 - .1 && b.rect[3] < r.z1 + .1);
      const hit = P.bld.some(q => b.rect[0] < q.rect[2] && b.rect[2] > q.rect[0] && b.rect[1] < q.rect[3] && b.rect[3] > q.rect[1]) || (kind !== 'gatehouse' && P.gates.some(g => { const ex = g.ori === 'x' ? g.w / 2 + 1 : 2.5, ez = g.ori === 'x' ? 2.5 : g.w / 2 + 1; return g.x > b.rect[0] - ex && g.x < b.rect[2] + ex && g.z > b.rect[1] - ez && g.z < b.rect[3] + ez; }));
      if (inR && !hit) { b.id = bid++; P.bld.push(b); return b; } if (b.lou && bays <= 3) break; } return null; };
  const cov = (kind, x, z, r, h, conceal) => P.cover.push({ kind, x, z, r, h, conceal });
  const keep = [], free = (x, z, rad) => !keep.some(k => x > k[0] - rad && x < k[2] + rad && z > k[1] - rad && z < k[3] + rad) && !P.bld.some(b => x > b.rect[0] - rad && x < b.rect[2] + rad && z > b.rect[1] - rad && z < b.rect[3] + rad) && !P.gates.some(g => Math.hypot(g.x - x, g.z - z) < g.w / 2 + 3 + rad);
  const plant = (r, n, kinds) => { for (let i = 0; i < n * 3 && n > 0; i++) { const k = kinds[(R() * kinds.length) | 0], x = r.x0 + 3 + R() * (r.x1 - r.x0 - 6), z = r.z0 + 3 + R() * (r.z1 - r.z0 - 6), rad = k === 'tree' ? 2 : k === 'peony' ? 2 : 1.4; if (!free(x, z, rad) || P.cover.some(c => Math.hypot(c.x - x, c.z - z) < c.r + rad + .8)) continue;
      if (k === 'bush') cov('bush', x, z, .8 + R() * .7, 1.2 + R() * .4, true); else if (k === 'bamboo') cov('bamboo', x, z, 1.1 + R() * .6, 4 + R() * 2, true); else if (k === 'rock') cov('rock', x, z, .7 + R() * .35, 1.3 + R() * .7, false); else if (k === 'peony') cov('peony', x, z, 1.6, .9, false); else if (k === 'tree') cov('tree', x, z, .5, 8, false); n--; } };
  for (const r of P.regions) { const W = r.x1 - r.x0, D = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (r.kind === 'front') { const bw = gB * 3.4; B(r, 'gatehouse', ax, Z1 - 2.1, 0, { bays: gB, dbays: 1, bayW: 3.4, dbayW: 4.2 });
      if (great) for (const sd of [-1, 1]) { const len = Math.min(26, (sd < 0 ? ax - X0 : X1 - ax) - bw / 2 - 6); if (len > 9) B(r, 'servants', ax + sd * (bw / 2 + 3 + len / 2), Z1 - 3.2, PI, { bays: Math.floor(len / 3.3), dbays: 1, bayW: 3.3, dbayW: 3.6 }); } // grooms' and gatekeepers' rooms against the front wall
      const st = sides.length && !cells.some(q => q.mod === 'stable') ? 1 : 0; if (st) { const sc = sides[0]; B(r, 'stable', (sc.x0 + sc.x1) / 2, Zf + 3.4, PI, { bays: Math.min(5, Math.floor((sc.x1 - sc.x0 - 4) / 3)), dbays: 1, bayW: 3, dbayW: 3.6 }); }
      cov('screen', ax, Z1 - 9.5, 2.6, 2.6, false); } // the screen wall (蕭牆) behind the gate
    else if (r.kind === 'hall') { const bays = 5, bw = Math.min(4.4, (W - 14) / 5); B(r, 'ting', cx, r.z0 + D * .42, 0, { bays, dbays: 3, bayW: bw, dbayW: 3.6, platform: 1.2 }); r.corr = W > 34; if (r.corr) for (const sd of [-1, 1]) keep.push(sd < 0 ? [r.x0, r.z0 + D * .42 + 4, r.x0 + 4, r.z1] : [r.x1 - 4, r.z0 + D * .42 + 4, r.x1, r.z1]); /* the 廊 along the sides */ plant(r, 4, ['tree', 'peony', 'rock']); }
    else if (r.kind === 'qin') { const lou = r.lou && W >= 26; const q = B(r, 'qin', cx, r.z0 + D * .3, 0, lou ? { bays: 3, dbays: 3, bayW: Math.min(4.2, (W - 16) / 3), dbayW: 3.4, storeys: 2, lou: true } : { bays: 5, dbays: 3, bayW: Math.min(4, (W - 14) / 5), dbayW: 3.4, platform: .8 });
      const nx = Math.max(1, Math.min(4, Math.floor((D * .55 - 4) / 3.3))); for (const sd of [-1, 1]) B(r, 'xiang', cx + sd * (W / 2 - 3.6), r.z0 + D * .62, -sd * PI / 2, { bays: nx, dbays: 1, bayW: 3.3, dbayW: 4.4 }); // wives' and concubines' rooms
      plant(r, 7, ['peony', 'bush', 'tree', 'rock', 'bamboo']); }
    else if (r.kind === 'rear') { B(r, 'lou', cx, cz - 2, 0, { bays: 3, dbays: 3, bayW: Math.min(4.2, (W - 14) / 3), dbayW: 3.4, storeys: r.storeys, lou: true }); plant(r, 6, ['bamboo', 'bush', 'tree', 'rock']); }
    else if (r.kind === 'family' || r.kind === 'guest') { const bays = W > 30 ? 5 : 3, bw = Math.min(3.8, (W - 12) / bays), lou = r.lou && W >= 26; B(r, lou ? 'lou' : 'tang', cx, r.z0 + D * .32, 0, lou ? { bays: 3, dbays: 2, bayW: Math.min(4, (W - 14) / 3), dbayW: 3.4, storeys: 2, lou: true } : { bays, dbays: 2, bayW: bw, dbayW: 3.4, platform: .6 });
      const nx = Math.max(1, Math.min(3, Math.floor((D * .5 - 4) / 3.3))); for (const sd of (W > 26 ? [-1, 1] : [R() < .5 ? -1 : 1])) B(r, 'xiang', cx + sd * (W / 2 - 3.6), r.z0 + D * .64, -sd * PI / 2, { bays: nx, dbays: 1, bayW: 3.3, dbayW: 4.2 }); plant(r, 5, ['peony', 'bush', 'tree', 'rock']); }
    else if (r.kind === 'study') { B(r, 'shulou', cx, r.z0 + D * .38, 0, { bays: 3, dbays: 2, bayW: Math.min(3.8, (W - 8) / 3), dbayW: 3.4, storeys: 2, lou: true }); plant(r, 6, ['bamboo', 'bamboo', 'rock', 'bush']); }
    else if (r.kind === 'shrine') { B(r, 'shrine', cx, r.z0 + D * .4, 0, { bays: 3, dbays: 2, bayW: Math.min(4, (W - 10) / 3), dbayW: 3.6, platform: 1.2 }); plant(r, 4, ['tree', 'tree']); }
    else if (r.kind === 'kitchen') { B(r, 'kitchen', cx, r.z0 + D * .3, 0, { bays: Math.max(2, Math.min(4, Math.floor((W - 6) / 3.6))), dbays: 2, bayW: 3.6, dbayW: 3.2 }); if (D > 26) B(r, 'store', cx + (W / 2 - 4) * (R() < .5 ? -1 : 1), r.z0 + D * .68, R() < .5 ? PI / 2 : -PI / 2, { bays: 2, dbays: 1, bayW: 3.6, dbayW: 4 }); r.well = [cx + (R() - .5) * W * .3, r.z1 - 5]; }
    else if (r.kind === 'store') { const n = Math.max(1, Math.floor((D - 8) / 12)); for (let k = 0; k < n; k++) B(r, 'store', cx, r.z0 + 6 + k * 12, 0, { bays: Math.max(2, Math.min(5, Math.floor((W - 6) / 3.6))), dbays: 2, bayW: 3.6, dbayW: 3.4 }); r.granary = D > 24; }
    else if (r.kind === 'stable') { B(r, 'stable', cx, r.z0 + 3.4, 0, { bays: Math.max(2, Math.min(6, Math.floor((W - 4) / 3))), dbays: 1, bayW: 3, dbayW: 3.6 }); if (D > 18) B(r, 'servants', cx + (W / 2 - 3.2), (r.z0 + r.z1) / 2 + 3, -PI / 2, { bays: 2, dbays: 1, bayW: 3.3, dbayW: 3.6 }); }
    else if (r.kind === 'servants') { const n = Math.max(1, Math.floor((D - 4) / 11)); for (let k = 0; k < n; k++) B(r, 'servants', cx, r.z0 + 4.5 + k * 11, 0, { bays: Math.max(2, Math.min(6, Math.floor((W - 5) / 3.3))), dbays: 1, bayW: 3.3, dbayW: 4 }); }
    else if (r.kind === 'orchard' || r.kind === 'veg') { if (r.kind === 'veg') B(r, 'shed', r.x1 - 3.5, r.z1 - 3.5, PI, { bays: 1, dbays: 1, bayW: 2.8, dbayW: 2.6 }); }
    else if (r.kind === 'gardenlet') { r.pond = [cx, cz, Math.min(W, D) * .22]; plant(r, 6, ['bamboo', 'rock', 'bush', 'tree']); if (W > 18) B(r, 'pav', cx + W * .25, cz - D * .2, 0, { bays: 1, dbays: 1, bayW: 4, dbayW: 4 }); }
    else if (r.kind === 'garden') { const pw = Math.min(W * .45, 60), pd = Math.min(D * .5, 26), px = cx + (R() - .5) * (W - pw) * .5, pz = cz + (R() - .5) * (D - pd) * .4; r.pond = [px, pz, pw, pd]; r.island = [px + pw * .15, pz, Math.min(pw, pd) * .18];
      const gz = great ? 1 : R() < .5 ? 1 : 0, gs = great && R() < .14 ? 3 : 2, gx2 = px + (px < cx ? 1 : -1) * (pw / 2 + 12); if (gz && Math.abs(gx2 - cx) < W / 2 - 10) B(r, 'ge', gx2, cz - D * .1, 0, { bays: 3, dbays: 2, bayW: 3.6, dbayW: 3.4, storeys: gs, lou: true }); // the 閣, set back from the neighbours
      B(r, 'pav', px - pw / 2 - 5, pz + pd / 2 + 4, 0, { bays: 1, dbays: 1, bayW: 4, dbayW: 4 }); if (W > 60) B(r, 'pav', px + pw / 2 + 4, pz - pd / 2 - 4, 0, { bays: 1, dbays: 1, bayW: 4, dbayW: 4 });
      const nr = great ? 3 : 2; for (let k = 0; k < nr; k++) { const x = r.x0 + 8 + R() * (W - 16), z = r.z0 + 6 + R() * (D - 12); if (Math.abs(x - px) < pw / 2 + 8 && Math.abs(z - pz) < pd / 2 + 8 || !free(x, z, 6)) continue; cov('rockery', x, z, 4 + R() * 2, 2.6 + R() * 1.2, false); }
      plant(r, Math.round(W * D / 120), ['bamboo', 'bush', 'tree', 'tree', 'bush', 'rock', 'bamboo']); for (let x2 = r.x0 + 3; x2 < r.x1 - 3; x2 += 7 + R() * 5) { if (free(x2, r.z0 + 2.2, 1.5)) cov('bush', x2, r.z0 + 2.2, .9, 1.4, true); } } // shrubbery along the back wall
    else if (r.kind === 'lane' || r.kind === 'cross') { const L2 = Math.max(W, D); for (let t = 8; t < L2 - 8; t += 14 + R() * 12) { if (R() < .5) continue; const along = W > D, xx = along ? r.x0 + t : (R() < .5 ? r.x0 + .9 : r.x1 - .9), zz = along ? (R() < .5 ? r.z0 + .9 : r.z1 - .9) : r.z0 + t; if (free(xx, zz, .8)) cov(R() < .6 ? 'bush' : 'rock', xx, zz, .75, 1.3, R() < .6); } } }
  // ---- path graph: gates, region nodes (lanes / front / cross as chains), doors and rooms (stairs to upper floors); patrol loops marked
  const N = (kind, x, z, y = 0, o = {}) => { const n = Object.assign({ id: P.nodes.length, kind, x, z, y }, o); P.nodes.push(n); return n.id; };
  const E = (a, b, kind, o = {}) => { if (a === b || a == null || b == null) return; P.edges.push(Object.assign({ a, b, kind, len: Math.hypot(P.nodes[a].x - P.nodes[b].x, P.nodes[a].z - P.nodes[b].z) + Math.abs(P.nodes[a].y - P.nodes[b].y) * 2 }, o)); };
  const chain = new Map(), rnode = new Map();
  for (const r of P.regions) { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; if (/lane|front|cross/.test(r.kind)) chain.set(r.id, []); else rnode.set(r.id, N('yard', cx, r.kind === 'qin' || r.kind === 'hall' ? r.z1 - 5 : cz, 0, { region: r.id })); }
  const attach = (r, x, z) => { if (!r) return null; if (chain.has(r.id)) { const along = r.kind === 'lane' ? 'z' : 'x', id = N(r.kind, along === 'z' ? (r.x0 + r.x1) / 2 : x, along === 'z' ? z : (r.z0 + r.z1) / 2, 0, { region: r.id }); chain.get(r.id).push(id); return id; } return rnode.get(r.id); };
  for (const g of P.gates) { const id = N('gate', g.x, g.z, 0, { gate: g.id, gk: g.kind }); g.node = id; const ra = P.regions[g.a], rb = g.b >= 0 ? P.regions[g.b] : null;
    if (rb) { E(id, attach(ra, g.x, g.z), 'gate'); E(id, attach(rb, g.x, g.z), 'gate'); } else { const out = N('street', g.ori === 'x' ? g.x : g.x + (g.x < 0 ? -3 : 3), g.ori === 'x' ? g.z + (g.z > 0 ? 3 : -3) : g.z); g.street = out; E(id, out, 'gate'); g.inner = attach(ra, g.x, g.z); E(id, g.inner, 'gate'); } }
  // lane tops open into the front court, lane feet into the cross lane
  for (const lc of laneCols) { const r = lc.reg; E(attach(r, 0, r.z1 - 1), attach(FC, lc.x0 + LW / 2, 0), 'open'); if (CR) E(attach(r, 0, r.z0 + 1), attach(CR, lc.x0 + LW / 2, 0), 'open'); }
  let masterNode = null;
  for (const b of P.bld) { if (b.kind === 'pav') continue; const r = P.regions[b.region], yawF = [Math.sin(b.yaw), Math.cos(b.yaw)], D = b.dbays * b.dbayW, ph = b.platform ?? .5, dz = D / 2 + 1.6;
    const door = N('door', b.cx + yawF[0] * dz, b.cz + yawF[1] * dz, 0, { bld: b.id }), room = N('room', b.cx, b.cz, ph, { bld: b.id, floor: 0 }); E(rnode.get(r.id) ?? attach(r, b.cx + yawF[0] * dz, b.cz + yawF[1] * dz), door, 'yard'); E(door, room, 'door'); b.door = door; b.rooms = [room];
    if (/ting|qin|tang|lou|shulou|ge/.test(b.kind) && b.kind !== 'ge') { const back = N('door', b.cx - yawF[0] * dz, b.cz - yawF[1] * dz, 0, { bld: b.id, back: true }); E(back, room, 'door'); b.backDoor = back; // a back door: loops round the hall
      const yid = r.kind === 'qin' ? (r.backYard ?? (r.backYard = N('yard', (r.x0 + r.x1) / 2, r.z0 + 3, 0, { region: r.id }))) : rnode.get(r.id); E(back, yid, 'yard'); if (r.kind === 'qin' && yid !== rnode.get(r.id)) E(yid, rnode.get(r.id), 'yard', { watch: true }); }
    for (let k = 1; k < (b.storeys || 1); k++) { const up = N('room', b.cx, b.cz, ph + k * 4.1, { bld: b.id, floor: k }); E(b.rooms[k - 1], up, 'stair'); b.rooms.push(up); }
    if (b.lou && (b.storeys || 1) > 1 && b.kind !== 'ge') { b.extStair = true; const ys = b.backYard != null ? (r.backYard ?? rnode.get(r.id)) : rnode.get(r.id); E(ys, b.rooms[1], 'stair', { outside: true }); } // the outside stair to the 平坐
    if (b.kind === 'qin') masterNode = b.rooms[b.rooms.length - 1]; }
  // the 寢's back yard reaches the court's back / side gates
  for (const r of P.regions) if (r.backYard != null) for (const g of P.gates) if ((g.a === r.id || g.b === r.id) && g.z < (r.z0 + r.z1) / 2 && g.kind !== 'zhongmen') E(g.node, r.backYard, 'yard');
  for (const r of P.regions) if (r.kind === 'garden') { const ids = []; for (const g of P.gates) if (g.a === r.id || g.b === r.id) ids.push(g.node); const c = rnode.get(r.id); for (let i = 0; i < ids.length; i++) E(ids[i], ids[(i + 1) % ids.length], 'garden', { watch: true }); void c; }
  for (const [rid, ids] of chain) { const r = P.regions[rid], along = r.kind === 'lane' ? 'z' : 'x'; ids.sort((a, b) => P.nodes[a][along] - P.nodes[b][along]); for (let i = 1; i < ids.length; i++) E(ids[i - 1], ids[i], r.kind, { watch: true });
    if (r.kind !== 'lane') { const hub = N('yard', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0, { region: r.id }); for (const id of ids) E(hub, id, 'yard'); } } // lanes, the front court and the cross lane as node chains (patrol routes); open courts also as a hub
  P.master = masterNode;
  // ---- stats: loops (cyclomatic number), edge-disjoint routes from each perimeter gate to the master bedroom, depth (hops / metres)
  const V = P.nodes.length, adj = Array.from({ length: V }, () => []); P.edges.forEach((e, i) => { adj[e.a].push([e.b, i]); adj[e.b].push([e.a, i]); });
  let comp = 0; { const seen = new Uint8Array(V); for (let s = 0; s < V; s++) { if (seen[s]) continue; comp++; const st = [s]; seen[s] = 1; while (st.length) { const u = st.pop(); for (const [v] of adj[u]) if (!seen[v]) { seen[v] = 1; st.push(v); } } } }
  const flow = (s, t) => { const cap = new Map(), key = (u, v) => u * 100000 + v; for (const e of P.edges) { cap.set(key(e.a, e.b), (cap.get(key(e.a, e.b)) || 0) + 1); cap.set(key(e.b, e.a), (cap.get(key(e.b, e.a)) || 0) + 1); } let f = 0;
    for (;;) { const prev = new Int32Array(V).fill(-1); prev[s] = s; const q = [s]; while (q.length && prev[t] < 0) { const u = q.shift(); for (const [v] of adj[u]) if (prev[v] < 0 && (cap.get(key(u, v)) || 0) > 0) { prev[v] = u; q.push(v); } } if (prev[t] < 0) break; for (let v = t; v !== s; v = prev[v]) { const u = prev[v]; cap.set(key(u, v), cap.get(key(u, v)) - 1); cap.set(key(v, u), (cap.get(key(v, u)) || 0) + 1); } f++; if (f > 8) break; } return f; };
  const bfs = s => { const dist = new Float64Array(V).fill(Infinity), hops = new Int32Array(V).fill(-1); dist[s] = 0; hops[s] = 0; const q = [s]; while (q.length) { q.sort((a, b) => dist[a] - dist[b]); const u = q.shift(); for (const [v, ei] of adj[u]) { const nd = dist[u] + P.edges[ei].len; if (nd < dist[v]) { dist[v] = nd; hops[v] = hops[u] + 1; q.push(v); } } } return { dist, hops }; };
  P.stats.loops = P.edges.length - V + comp; P.stats.components = comp; P.stats.routes = {}; P.stats.depth = {};
  if (masterNode != null) for (const g of P.gates) if (g.street != null) { P.stats.routes[g.kind + g.id] = flow(g.inner, masterNode); const r = bfs(g.street); P.stats.depth[g.kind + g.id] = { hops: r.hops[masterNode], m: Math.round(r.dist[masterNode]) }; }
  P.stats.minRoutes = Math.min(...Object.values(P.stats.routes)); P.stats.storeys = P.bld.filter(b => (b.storeys || 1) > 1).map(b => b.kind + b.storeys); P.stats.modules = P.regions.filter(r => r.cell).map(r => r.kind);
  P.stats.cover = P.cover.length; P.stats.watchEdges = P.edges.filter(e => e.watch).length;
  // world coordinates for the people / mission code
  const wp = (xx, zz) => { const p = F.p(xx, 0, zz); return [p[0], p[2]]; };
  for (const n of P.nodes) [n.wx, n.wz] = wp(n.x, n.z); for (const g of P.gates) [g.wx, g.wz] = wp(g.x, g.z); for (const c of P.cover) [c.wx, c.wz] = wp(c.x, c.z); for (const b of P.bld) [b.wx, b.wz] = wp(b.cx, b.cz);
  P.F = { x: F.x, z: F.z, yaw: F.yaw }; P.hash = COMP.planHash(P);
  return (lot._mplan = P);
};
COMP.planHash = P => { let h = 2166136261; const s = P.regions.map(r => r.kind + [r.x0, r.z0, r.x1, r.z1].map(v => Math.round(v / 2)).join(',')).join('|') + '#' + P.gates.map(g => g.kind + Math.round(g.x) + ',' + Math.round(g.z)).join('|'); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

// the walls of a plan: every court edge, deduplicated on shared lines, minus the gate gaps; the perimeter separately (taller)
COMP.mansionWalls = function (P) {
  const ins = .45, X0 = -P.w / 2 + ins, X1 = P.w / 2 - ins, Z0 = -P.d / 2 + ins, Z1 = P.d / 2 - ins, lines = new Map(), add = (ori, c, a, b) => { if (b - a < .3) return; const k = ori + ':' + Math.round(c * 20) / 20; (lines.get(k) || lines.set(k, []).get(k)).push([Math.min(a, b), Math.max(a, b)]); };
  const onPer = (ori, c) => ori === 'x' ? Math.abs(c - Z0) < .05 || Math.abs(c - Z1) < .05 : Math.abs(c - X0) < .05 || Math.abs(c - X1) < .05;
  const nb = r => P.regions.filter(q => q !== r);
  for (const r of P.regions) { if (/lane|front|cross/.test(r.kind)) continue; const isG = r.kind === 'garden';
    for (const [ori, c, a, b] of [['x', r.z0, r.x0, r.x1], ['x', r.z1, r.x0, r.x1], ['z', r.x0, r.z0, r.z1], ['z', r.x1, r.z0, r.z1]]) { if (onPer(ori, c)) continue;
      if (isG && nb(r).every(q => q.kind === 'garden' || !(ori === 'x' ? Math.abs(q.z0 - c) < .05 || Math.abs(q.z1 - c) < .05 : Math.abs(q.x0 - c) < .05 || Math.abs(q.x1 - c) < .05))) continue; add(ori, c, a, b); } }
  const merge = iv => { iv.sort((p, q) => p[0] - q[0]); const out = []; for (const v of iv) { const l = out[out.length - 1]; if (l && v[0] <= l[1] + .05) l[1] = Math.max(l[1], v[1]); else out.push(v.slice()); } return out; };
  const cut = (iv, gaps) => { let out = iv; for (const [g0, g1] of gaps) { const nx = []; for (const [a, b] of out) { if (g1 <= a || g0 >= b) { nx.push([a, b]); continue; } if (g0 - a > .3) nx.push([a, g0]); if (b - g1 > .3) nx.push([g1, b]); } out = nx; } return out; };
  const segs = [], per = [], gapsOn = (ori, c) => P.gates.filter(g => g.ori === ori && Math.abs((ori === 'x' ? g.z : g.x) - c) < .05).map(g => { const m = ori === 'x' ? g.x : g.z, hw = g.w / 2 + (/main|zhongmen/.test(g.kind) ? .07 : /side|back/.test(g.kind) ? .27 : .2); return [m - hw, m + hw]; }); // end piers never flush with the gate's side panels
  for (const [k, iv] of lines) { const [ori, cs] = k.split(':'), c = +cs; for (const [a, b] of cut(merge(iv), gapsOn(ori, c))) segs.push(ori === 'x' ? [a, c, b, c] : [c, a, c, b]); }
  for (const [ori, c, a, b] of [['x', Z1, X0, X1], ['x', Z0, X0, X1], ['z', X0, Z0, Z1], ['z', X1, Z0, Z1]]) for (const [p, q] of cut([[a, b]], gapsOn(ori, c))) per.push(ori === 'x' ? [p, c, q, c] : [c, p, c, q]);
  return { segs, per };
};

// build: parts spread over chunks (like templeParts)
COMP.mansionParts = function (lot) {
  const P = COMP.mansionPlan(lot), { F } = COMP.frame(lot), out = [], R0 = RNG(lot.seed * 3 + 1), look = COMP.look(R0, 3), paint = P.great ? 'red' : look.paint || 'ochre', Pp = (x, z) => F.p(x, 0, z);
  const part = (lx, lz, fn, sub) => { const p = Pp(lx, lz); out.push({ x: p[0], z: p[2], build: L => { const s = sub || { seed: lot.seed, wealth: P.wealth, type: 'rich', foot: [], _F: F, r: lot.r, front: lot.front }; s.foot = []; COMP.netRun(L, s, () => fn(L, s)); } }); };
  // all the walls in one network (junction piers, T joins); the perimeter taller
  part(0, 0, (L) => { const W = COMP.mansionWalls(P); for (const [x0, z0, x1, z1] of W.per) { const a = Pp(x0, z0), b = Pp(x1, z1); COMP.wall(L, a[0], a[2], b[0], b[2], { h: 3.3, t: .6 }); } for (const [x0, z0, x1, z1] of W.segs) { const a = Pp(x0, z0), b = Pp(x1, z1); COMP.wall(L, a[0], a[2], b[0], b[2], { h: 2.7, t: .45 }); } });
  // gates
  for (const g of P.gates) part(g.x, g.z, (L, s) => { const yaw = g.ori === 'x' ? (g.z < 0 ? PI : 0) : (g.x < 0 ? -PI / 2 : PI / 2), p = Pp(g.x, g.z);
    if (g.kind === 'main' || g.kind === 'zhongmen') { const F2 = ARCH.F(p[0], 0, p[2], F.yaw), b = COMP.B(L, s, F2, 0, g.kind === 'main' ? -1.25 : 0, 0, { furnish: 'room', /* the 閽 gatekeepers' / porters' rooms in the side bays */ bays: g.bays, dbays: 1, bayW: 3.4, dbayW: g.kind === 'main' ? 4.2 : 3.6, colH: 3.4, platform: .35, pm: .35, steps: g.kind !== 'main', brackets: P.great ? 'simple' : 'none', paint, walls: 'white', roof: P.great ? 'xieshan' : 'gable', fish: P.great, door: [(g.bays - 1) / 2], doorOpen: true, backDoor: true, windows: false, studs: true, cls: g.kind === 'main' ? 0 : 4, seed: lot.seed + g.id });
      if (g.kind === 'main' && !ARCH.lod) for (const sd of [-1, 1]) { const q = F2.p(sd * (g.w / 2 + .9), 0, 1.6); ARCH.stamp(L, 'wutou', b2 => { b2.s({ tex: 'vermilion' }).box(0, 1.6, 0, .26, 3.2, .26); b2.s({ tex: 'lacquer_black' }).box(0, 3.35, 0, .32, .3, .32); }, q[0], 0, q[2], F.yaw, 1, [.3, 3.5, .3]); } void b; } // 烏頭 posts
    else ARCH.gate(L, p[0], 0, p[2], { yaw: F.yaw + yaw, w: g.w, h: g.kind === 'inner' ? 2.7 : 3.0, open: true, cls: g.kind === 'inner' ? 4 : 0, roof: 'gable', paint: g.kind === 'inner' ? 'ochre' : paint, brackets: 'none' });
    if (L.meta && g.kind !== 'inner') { const q = F.p(g.x + (g.ori === 'z' ? (g.x < 0 ? 2.5 : -2.5) : 1.6), 0, g.z + (g.ori === 'x' ? (g.z > 0 ? -3.2 : 3.2) : 1.6)); L.meta.spots.push({ role: 'gatekeeper', x: q[0], y: 0, z: q[2], yaw: F.yaw + yaw, cls: 0, anim: 'stand', lot: lot.seed, gate: g.id }); } });
  // regions: buildings, planting, cover, props
  const tree = (L, x, z, kind, s, seed) => { const p = Pp(x, z); TREES.place(L, p[0], 0, p[2], kind, s, seed); };
  for (const r of P.regions) { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, W = r.x1 - r.x0, D = r.z1 - r.z0;
    // big regions are split into several parts (by their buildings and cover) so a 3 ha house spreads over its chunks
    part(cx, cz, (L, s) => { const Rr = RNG(lot.seed + r.id * 97);
      if (r.kind === 'hall' && r.corr && !ARCH.lod) for (const sd of [-1, 1]) { const x = sd > 0 ? r.x1 - 1.9 : r.x0 + 1.9, a = Pp(x, r.z1 - 3), b = Pp(x, r.z0 + D * .42 + 6); ARCH.corridor(L, a[0], a[2], b[0], b[2], { w: 2.6, wall: sd, paint, rail: false, seed: lot.seed + sd }); for (let z = r.z0 + D * .42 + 7; z < r.z1 - 3; z += 3.6) ARCH.cover(L, 'column', ...(q => [q[0], q[2]])(Pp(x - sd * 1.2, z)), .15, 3, false); }
      if (r.kind === 'front' && !ARCH.lod) { const q = Pp(P.gates[0].x, r.z1 - 9.5); L.mb.s({ tex: 'plaster', col: [1, .97, .92] }).T(q[0], 0, q[2], 0, F.yaw, 0).box(0, 1.3, 0, 5.2, 2.6, .5, { skip: ['bot'] }).s({ tex: 'roof_tile' }).box(0, 2.72, 0, 5.6, .24, .8, { skip: ['bot'] }).pop(); L.world.box(q[0], 1.3, q[2], 2.6, 1.3, .25, { yaw: F.yaw }); }
      if (r.kind === 'kitchen' && r.well) { const q = Pp(...r.well); L.prop(PROPS.well, q[0], 0, q[2], { solid: { r: .9, h: .8 } }); }
      if (r.kind === 'store' && r.granary) { const q = Pp(r.x1 - 4, r.z1 - 5); ARCH.granary(L, q[0], q[2], 1.6, 2.8, lot.seed + r.id); }
      if (r.kind === 'orchard') for (let x = r.x0 + 3.5; x < r.x1 - 2; x += 5) for (let z = r.z0 + 3.5; z < r.z1 - 2; z += 5) tree(L, x, z, ['peach', 'apricot', 'jujube', 'pomegranate'][(Rr() * 4) | 0], .8, lot.seed + (x * 7 + z) | 0);
      if (r.kind === 'veg' && !ARCH.lod) { L.mb.s({ tex: 'field_crop', col: [1, 1, 1] }); for (let z = r.z0 + 3; z < r.z1 - 7; z += 2.3) { const q = Pp(cx - 2, z); L.mb.T(q[0], 0, q[2], 0, F.yaw, 0).box(0, .06, 0, W - 10, .24, 1.5, { skip: ['bot'], uv: [Math.round(W / 3), 1] }).pop(); } }
      if (r.pond && r.kind === 'gardenlet') { const [px, pz, pr] = r.pond, q = Pp(px, pz); L.mb.s({ tex: 'stone', col: [.85, .82, .78] }).T(q[0], 0, q[2], 0, F.yaw, 0).box(0, .2, 0, pr * 2 + .6, .4, pr * 2 + .6, { skip: ['bot', 'top'] }).s({ tex: 'water', col: [.75, .85, .9], emi: .05 }).box(0, .3, 0, pr * 2, .02, pr * 2, { skip: ['bot'] }).s({ emi: 0 }).pop(); L.world.box(q[0], .2, q[2], pr + .3, .2, pr + .3, { yaw: F.yaw }); } // 盆池
      if (r.kind === 'garden') { const [px, pz, pw, pd] = r.pond, q = Pp(px, pz), b = L.mb; // raised stone-rimmed pond, island (mound + trees), a plank bridge
        b.s({ tex: 'stone', col: [.85, .82, .78] }).T(q[0], 0, q[2], 0, F.yaw, 0); for (const [x0, z0, x1, z1] of [[-pw / 2, -pd / 2, pw / 2, -pd / 2 + .5], [-pw / 2, pd / 2 - .5, pw / 2, pd / 2], [-pw / 2, -pd / 2 + .5, -pw / 2 + .5, pd / 2 - .5], [pw / 2 - .5, -pd / 2 + .5, pw / 2, pd / 2 - .5]]) { if (z1 - z0 > 3 && x0 > 0) continue; b.box((x0 + x1) / 2, .22, (z0 + z1) / 2, x1 - x0, .44, z1 - z0, { skip: ['bot'] }); }
        b.s({ tex: 'water', col: [.72, .84, .9], emi: .05 }).box(0, .28, 0, pw - 1, .02, pd - 1, { skip: ['bot'] }).s({ emi: 0 }); const [ix, iz, ir] = r.island; b.s({ tex: 'grass_summer', col: [.85, .95, .8] }).T(ix - px, .29, iz - pz).lathe([[ir, 0], [ir * .8, .5], [ir * .4, 1.1], [0, 1.3]], { seg: 10 }).pop();
        b.s({ tex: 'plank', col: [.7, .58, .46] }).box((ix - px + ir + pw / 2) / 2 - .2, .6, iz - pz, pw / 2 - (ix - px) - ir + .4, .12, 1.6, {}); b.pop(); // bridge from the island to the east bank
        for (const [x0, z0, x1, z1] of [[-pw / 2, -pd / 2, pw / 2, -pd / 2 + .5], [-pw / 2, pd / 2 - .5, pw / 2, pd / 2], [-pw / 2, -pd / 2 + .5, -pw / 2 + .5, pd / 2 - .5]]) { const c = F.p(px + (x0 + x1) / 2, 0, pz + (z0 + z1) / 2); L.world.box(c[0], .22, c[2], (x1 - x0) / 2, .22, (z1 - z0) / 2, { yaw: F.yaw }); }
        for (let i = 0; i < 6; i++) tree(L, ix + (Rr() - .5) * ir, iz + (Rr() - .5) * ir, i % 2 ? 'pine' : 'willow', .9, lot.seed + 300 + i);
        for (let i = 0; i < Math.round((pw + pd) / 5); i++) { const t = i / Math.round((pw + pd) / 5) * TAU, x = px + Math.cos(t) * (pw / 2 + 2.5), z = pz + Math.sin(t) * (pd / 2 + 2.5); if (Math.abs(x - px - pw / 2) < 3 && Math.abs(z - iz) < 3) continue; tree(L, x, z, 'willow', 1, lot.seed + 400 + i); } }
      if (L.meta && /lane|cross|garden|front/.test(r.kind)) { const q = Pp(cx, cz); L.meta.spots.push({ role: 'watch', x: q[0], y: 0, z: q[2], yaw: F.yaw, cls: 0, anim: 'stand', lot: lot.seed, region: r.id }); } // watch points for the night rounds
    }, null);
    // cover and planting from the plan, in ~40 m tiles (each its own part)
    const tiles = new Map(); for (const c of P.cover) { if (c.x < r.x0 || c.x > r.x1 || c.z < r.z0 || c.z > r.z1) continue; const k = Math.floor((c.x - r.x0) / 40) + ',' + Math.floor((c.z - r.z0) / 40); (tiles.get(k) || tiles.set(k, []).get(k)).push(c); }
    for (const list of tiles.values()) part(list.reduce((a, c) => a + c.x, 0) / list.length, list.reduce((a, c) => a + c.z, 0) / list.length, L => {
      for (const c of list) { const p = Pp(c.x, c.z), sd = (lot.seed + Math.round(c.x * 13 + c.z * 7)) | 0;
        if (c.kind === 'bush') ARCH.bush(L, p[0], p[2], c.r * 2, c.h, sd); else if (c.kind === 'rock') ARCH.rock(L, p[0], p[2], c.r * 2, c.h, sd); else if (c.kind === 'rockery') ARCH.rockery(L, p[0], p[2], c.r, c.h, sd);
        else if (c.kind === 'bamboo') { for (let i = 0; i < 5; i++) TREES.place(L, p[0] + (RNG(sd + i)() - .5) * c.r, 0, p[2] + (RNG(sd + i + 9)() - .5) * c.r, 'bamboo', .9, sd + i); ARCH.cover(L, 'bamboo', p[0], p[2], c.r, c.h, true); }
        else if (c.kind === 'peony') ARCH.peonyBed(L, p[0], p[2], 3.2, 1.6, F.yaw, sd); else if (c.kind === 'tree') TREES.place(L, p[0], 0, p[2], ['huai', 'tong', 'pomegranate', 'huai', 'elm'][((sd % 5) + 5) % 5], 1, sd); else if (c.kind === 'screen') ARCH.cover(L, 'screen', p[0], p[2], c.r, c.h, false); } });
    // buildings of the region, each its own part (spread over chunks)
    for (const b of P.bld.filter(q => q.region === r.id)) part(b.cx, b.cz, (L, s) => {
      if (b.kind === 'gatehouse') return; // built with its gate
      const F2 = F, room = lot.seed + ':' + b.id, common = { bays: b.bays, dbays: b.dbays, bayW: b.bayW, dbayW: b.dbayW, paint, walls: 'white', seed: lot.seed + b.id };
      if (b.lou) { const p = Pp(b.cx, b.cz); const kinds = { qin: ['hall', 'room', 'room'], lou: ['hall', 'room', 'study'], shulou: ['study', 'study', 'room'], ge: ['hall', 'room', 'study'], tang: ['hall', 'room'] }[b.kind] || ['hall', 'room', 'room']; ARCH.lou2(L, p[0], 0, p[2], Object.assign({}, common, { yaw: F.yaw + b.yaw, storeys: b.storeys, platform: .7, colH1: 3.4, colH2: 3.0, furnish: kinds, lot: lot.seed, wealth: P.wealth, backDoor: b.kind !== 'ge', extStair: !!b.extStair, roof: 'xieshan', fish: true, room })); return; }
      if (b.kind === 'pav') { const p = Pp(b.cx, b.cz); ARCH.pavilion(L, p[0], 0, p[2], { r: 2.6 }); ARCH.cover(L, 'column', p[0], p[2], 2.2, 3, false); return; }
      if (b.kind === 'stable') { COMP.stable(L, s, F2, b.cx, b.cz, b.yaw, b.bays, RNG(lot.seed + b.id)); return; }
      const fk = { ting: 'rich', qin: 'hall', tang: 'hall', xiang: 'room', servants: 'servants', kitchen: 'kitchen', store: 'store', shrine: 'shrine', shed: 'store', gatehouse: 'room' }[b.kind] || 'room';
      COMP.B(L, s, F2, b.cx, b.cz, b.yaw, Object.assign({}, common, { furnish: fk, colH: b.kind === 'ting' ? 4.2 : b.kind === 'qin' ? 3.8 : 3.0, platform: b.platform ?? (b.kind === 'ting' ? 1.2 : .5), pm: b.kind === 'ting' ? .9 : .45, brackets: b.kind === 'ting' && P.great ? 'full' : /ting|qin|shrine/.test(b.kind) ? 'simple' : 'none', roof: /ting|qin|shrine/.test(b.kind) ? 'xieshan' : 'gable', fish: /ting|qin/.test(b.kind),
        door: [(b.bays - 1) >> 1], doorOpen: true, backDoor: /ting|qin|tang/.test(b.kind), windows: true, cls: 0, wealth: P.wealth }));
    });
  }
  return out;
};
COMP.mansion = function (L, lot) { for (const u of COMP.mansionParts(lot)) u.build(L); };

// =====================================================================================
// CITY — the whole city. setup() is deterministic and runs both on the main thread and in every build worker, so both
// sides agree on wards, lots, items and chunks. Geometry is built by JOBS (in workers when possible) and drawn here.
//  - walkable slice: 64 m chunks; LOD0 (full detail, collision) streamed near the camera; per-ward LOD1 'group' meshes whose
//    index ranges are per chunk and drawn in runs that skip LOD0 chunks; chunk terrain likewise.
//  - every ward (slice or not) also has FAR1 (a roof per lot) and FAR2 (block masses) meshes; landmarks; far terrain with
//    holes where the walkable chunks are.
// =====================================================================================
const CITY = {
  CH: 64, R0: 120, R0OUT: 170, LOD1R: 620, FAR1R: 2300, EXP: 80, // EXP: chunks within this of a walkable ward (covers half of the 150 m 朱雀大街)
  chunks: new Map(), order: [], lights: [], lay: [], items: [], groups: [], far: [], land: [], ready: false,
  key: (i, j) => (i + 5000) * 10000 + (j + 5000),
  setup(o) {
    this.opts = o; const t0 = performance.now(), CH = this.CH;
    const whole = o.slice === 'all' || (o.slice && o.slice[0] === 'all');
    // the palaces (engine/palace.js): walkable units like wards (layout in the ward format, own parts and far meshes); with the whole city only
    const PU = whole && typeof PALACE !== 'undefined' && PALACE && PALACE.units ? PALACE.units().map(u => Object.assign({ seed: hashS(u.name) }, u, { kind: 'palace', palace: true })) : [];
    this.all = PLANW.wards().filter(w => !PU.some(u => u.short === w.short)).concat(PU); this.all.forEach((w, i) => w.i = i);
    this.palDepth = PU.length && !!PALACE.depthAt; if (PU.length) FARB.PARTS = FARB.PARTS.filter(p => !/^(palace|imperial|daming|xingqing|xqtowers)$/.test(p));
    this.slice = whole ? this.all.filter(w => w.kind !== 'park' && (w.kind !== 'palace' || w.palace)) : this.all.filter(w => o.slice.includes(w.short)); // 'all': the whole city (曲江 is a landmark part)
    this.slice.forEach((wd, g) => { wd.group = g; const lay = wd.palace ? PALACE.layout(wd) : wd.kind === 'market' ? MARKET.layout(wd) : WARD.layout(wd); lay.wd = lay.wd || wd; lay.gr = lay.gr || WARD.groundRaster(lay); this.lay.push(lay);
      for (const it of wd.palace ? PALACE.items(wd) : WARD.items(lay, { nameTex: 'wn_' + wd.short.replace(/曲江池.*/, '曲江') })) this.items.push(it); this.groups.push({ wd, lay, mesh: null, fol: null }); });
    const av = AVENUE.items(this.slice.filter(w => !w.palace), { x0: -1e5, z0: -1e5, x1: 1e5, z1: 1e5 }); for (const it of av.items) this.items.push(it); this.ditches = av.ditches;
    // walkable chunks: centre within EXP of a slice ward; each belongs to the nearest slice ward (its group)
    const dist = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    for (const wd of this.slice) { const r = wd.r, E = this.EXP;
      for (let j = Math.floor((r.z0 - E) / CH); j <= Math.floor((r.z1 + E) / CH); j++) for (let i = Math.floor((r.x0 - E) / CH); i <= Math.floor((r.x1 + E) / CH); i++) {
        const k = this.key(i, j); if (this.chunks.has(k)) continue; const cx = (i + .5) * CH, cz = (j + .5) * CH;
        let g = -1, bd = 1e9; this.slice.forEach((w2, gi) => { const d = dist(w2.r, cx, cz); if (d < bd) { bd = d; g = gi; } }); if (bd > this.EXP) continue;
        this.chunks.set(k, { i, j, x0: i * CH, z0: j * CH, cx, cz, items: [], m0: null, world: null, want: 0, group: g, ditches: null }); } }
    // the 春明門 zone: the 春明門–金光門 avenue from 東市 east to the outer wall, the gate and a stretch of wall, walkable at full detail
    if (o.gate !== false && this.slice.some(w => w.short === '東市')) {
      const zc = (PLAN.rows[4][1] + PLAN.rows[5][0]) / 2, xw = PLAN.W / 2, zr = rect(2600, zc - 76, xw + 150, zc + 76), g = this.groups.length;
      const wd = { name: '春明門', short: '春明門', kind: 'gatezone', r: zr, group: g, seed: hashS('春明門'), gate: { x: xw, z: zc } }; this.gatezone = wd;
      const lay = { wd, streets: [], lanes: [], lots: [], gates: [], trees: [], wells: [], gr: { at: (x, z) => x > xw + 6 ? (Math.abs(z - zc) < 14 ? GC.STREET : GC.YARD) : Math.abs(z - zc) < 60 ? GC.STREET : GC.YARD } }; this.lay.push(lay); this.groups.push({ wd, lay, mesh: null, fol: null, keep: true });
      const add = (x, z, build) => this.items.push({ x, z, build });
      // the city wall (rammed earth, ~5.3 m) north and south of the gate, and the gate itself
      for (const [z0, z1] of [[zr.z0 - 4, zc - 17], [zc + 17, zr.z1 + 4]]) for (let z = z0; z < z1 - .1; z += 30) { const za = z, zb = Math.min(z1, z + 30); add(xw, (za + zb) / 2, L => (TANG.cityWall ? TANG.cityWall(L, xw, za, xw, zb, { full: true, outer: -1 }) : ARCH.wall(L, xw, za, xw, zb, { style: 'rammed', h: 5.3, t: 10, parapet: 'crenel' }))); }
      add(xw, zc, L => ARCH.gateTower(L, xw, 0, zc, { yaw: PI / 2, w: 34, d: 20, full: true, open: true, tablet: 'gt_春明門' }));
      // avenue: 槐 rows and ditches on both sides, a guard post by the gate
      const R = RNG(wd.seed); for (const sd of [-1, 1]) { const zt = zc + sd * (60 - 7.5); for (let x = 2640; x < xw - 30; x += 6 + R() * 1.2) { if (R() < .05) continue; const xx = x, s0 = .9 + R() * .3, sdd = (R() * 1e6) | 0; add(xx, zt, L => TREES.place(L, xx, 0, zt, 'huai', s0, sdd)); }
        av.ditches.push(rect(2610, Math.round(zc + sd * 58.5) - (sd > 0 ? 0 : 3), xw - 12, Math.round(zc + sd * 58.5) + (sd > 0 ? 3 : 0))); }
      add(xw - 30, zc - 30, L => AVENUE.guardPost(L, xw - 30, zc - 30, PI / 2));
      // the walls of the wards along the avenue (drawn by their far meshes): invisible colliders so nobody walks through them
      for (const w of this.all) { if (w.group !== undefined) continue; for (const ze of [w.r.z0, w.r.z1]) { if (Math.abs(ze - zc) > 70 || Math.abs(ze - zc) < 40) continue;
        for (let x = Math.max(w.r.x0, zr.x0); x < Math.min(w.r.x1, xw - 6); x += 40) { const xa = x, xb = Math.min(w.r.x1, xw - 6, x + 40), zz = ze + Math.sign(ze - zc) * 1.5;
          add((xa + xb) / 2, zz, L => L.world.box((xa + xb) / 2, 2, zz, (xb - xa) / 2, 3, 1.5)); } } }
      for (let j = Math.floor(zr.z0 / CH); j <= Math.floor(zr.z1 / CH); j++) for (let i = Math.floor(zr.x0 / CH); i <= Math.floor(zr.x1 / CH); i++) { const k = this.key(i, j); if (this.chunks.has(k)) continue;
        this.chunks.set(k, { i, j, x0: i * CH, z0: j * CH, cx: (i + .5) * CH, cz: (j + .5) * CH, items: [], m0: null, world: null, want: 0, group: g, ditches: null }); }
    }
    // ward gates (dynamic leaves): position, yaw, opening width
    this.gates = []; for (const lay of this.lay) { if (lay.wd.palace) continue; /* the palaces build their own gate towers */ const r = lay.wd.r, T = WARD.WALL_T; for (const g of lay.gates) { const horiz = g.side === 'n' || g.side === 's', gx = horiz ? g.x : (g.side === 'w' ? r.x0 + T / 2 : r.x1 - T / 2), gz = horiz ? (g.side === 'n' ? r.z0 + T / 2 : r.z1 - T / 2) : g.z;
      this.gates.push({ x: gx, z: gz, yaw: { n: PI, s: 0, w: -PI / 2, e: PI / 2 }[g.side], w: 5.6, ward: lay.wd.short, side: g.side }); } }
    this.order = [...this.chunks.values()].sort((a, b) => a.group - b.group || a.j - b.j || a.i - b.i); this.order.forEach((c, i) => c.idx = i);
    // canals: culverts where a way crosses (wards' streets/lanes in the walkable slice, the avenues between wards, the road out of 春明門)
    CANAL.culvert = (x, z) => { for (const lay of this.lay) if (inR(lay.wd.r, x, z)) { const g = lay.gr.at(x, z); return g === GC.STREET || g === GC.LANE; }
      if (Math.abs(x) > PLAN.W / 2 || Math.abs(z) > PLAN.H / 2) return false; for (const w of this.all) if (inR(w.r, x, z)) return false;
      // avenues: open water, bridged where the walking routes cross: the avenue's centre line (±8 m) and each ward gate's approach (±4 m)
      for (const st of PLAN.streets) { const c = (st.a0 + st.a1) / 2; if (st.axis === 'z' ? x > st.a0 && x < st.a1 && Math.abs(x - c) < 8 : z > st.a0 && z < st.a1 && Math.abs(z - c) < 8) return true; }
      for (const lay of this.lay) for (const g of lay.gates || []) if (g.side === 'n' || g.side === 's' ? Math.abs(x - g.x) < 4 && Math.abs(z - g.z) < 90 : Math.abs(z - g.z) < 4 && Math.abs(x - g.x) < 90) return true;
      return false; };
    // per line, walk the course in ~1.5 m steps: open runs become lined pieces (split at segment joints and every ~24 m), runs under a way
    // become culverts with a headwall + parapet at each end (CANAL.bridges records them for the crowd)
    { let ci = 0; CANAL.init(); CANAL.bridges = []; const bySeg = new Map(); for (const sg of CANAL.segs) { if (!bySeg.has(sg.line)) bySeg.set(sg.line, []); bySeg.get(sg.line).push(sg); }
      for (const [, segs] of bySeg) { let run = null; const pos = (k, t) => { const sg = segs[k]; return [sg.ax + (sg.bx - sg.ax) * t, sg.az + (sg.bz - sg.az) * t]; };
        const flush = (k1, t1) => { if (!run) return; const { k0, t0, cul } = run; run = null;
          if (!cul) { for (let k = k0; k <= k1; k++) { const sg = segs[k], a = k === k0 ? t0 : 0, b = k === k1 ? t1 : 1; if (b - a < 1e-4) continue; const [x, z] = pos(k, (a + b) / 2), seed = (++ci * 7919) | 0; this.items.push({ x, z, build: L => CANAL.piece(L, sg, a, b, RNG(seed)) }); } return; }
          if (cul === 2) return; // inside a basin: its own water and lining
          const A = pos(k0, t0), B = pos(k1, t1), s0 = segs[k0], s1 = segs[k1], u0 = [s0.bx - s0.ax, s0.bz - s0.az], u1 = [s1.bx - s1.ax, s1.bz - s1.az], l0 = Math.hypot(...u0), l1 = Math.hypot(...u1), w = s0.w;
          if (k0 > 0 || t0 > 1e-6) this.items.push({ x: A[0], z: A[1], build: L => CANAL.bridgeEnd(L, A[0], A[1], -u0[0] / l0, -u0[1] / l0, w) });
          if (k1 < segs.length - 1 || t1 < 1 - 1e-6) this.items.push({ x: B[0], z: B[1], build: L => CANAL.bridgeEnd(L, B[0], B[1], u1[0] / l1, u1[1] / l1, w) });
          CANAL.bridges.push({ x: (A[0] + B[0]) / 2, z: (A[1] + B[1]) / 2, ax: A[0], az: A[1], bx: B[0], bz: B[1], w }); };
        segs.forEach((sg, k) => { const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), n = Math.max(1, Math.ceil(len / 1.5));
          for (let q = k === 0 ? 0 : 1; q <= n; q++) { const t = q / n, [x, z] = pos(k, t); if (!this.chunkAt(x, z)) { flush(k, t); continue; } const inB = (xx, zz) => CANAL.pondDepth(xx, zz) >= CANAL.D - 1e-9, cul = inB(x, z) ? 2 : CANAL.culvert(x, z);
            if (!run) run = { k0: k, t0: t, cul }; else if (run.cul !== cul) { let tc = t; { const cls = (xx, zz) => inB(xx, zz) ? 2 : CANAL.culvert(xx, zz); let lo = (q - 1) / n, hi = t; for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2, [mx, mz] = pos(k, m); if (cls(mx, mz) === cul) hi = m; else lo = m; } tc = hi; } /* the run ends exactly where the way / basin begins: the headwall stands at the street's edge, no carved gap (QA tool/qa_water.js) */ flush(k, tc); run = { k0: k, t0: tc, cul }; } } });
        flush(segs.length - 1, 1); } }
    for (const it of this.items) { const c = this.chunkAt(it.x, it.z); if (c) c.items.push(it); }
    for (const d of av.ditches) for (let j = Math.floor(d.z0 / CH); j <= Math.floor(d.z1 / CH); j++) for (let i = Math.floor(d.x0 / CH); i <= Math.floor(d.x1 / CH); i++) { const c = this.chunks.get(this.key(i, j)); if (c) (c.ditches || (c.ditches = [])).push(d); }
    this.groups.forEach((g, gi) => { const cs = this.order.filter(c => c.group === gi); g.c0 = cs.length ? cs[0].idx : 0; g.c1 = cs.length ? cs[cs.length - 1].idx + 1 : 0;
      g.box = cs.length ? [Math.min(...cs.map(c => c.x0)), -6, Math.min(...cs.map(c => c.z0)), Math.max(...cs.map(c => c.x0)) + CH, 90, Math.max(...cs.map(c => c.z0)) + CH] : null; }); // for culling a ward's chunks at once
    this.live = new Set(); // chunks requested or loaded (LOD0)
    this.setupMs = performance.now() - t0;
  },
  chunkAt(x, z) { return this.chunks.get(this.key(Math.floor(x / this.CH), Math.floor(z / this.CH))); },
  // ground height: gentle natural relief outside the slice (樂遊原, 龍首原) + carved ditches in the slice
  base(x, z) { const g = (cx, cz, rx, rz, h) => h * Math.exp(-((x - cx) * (x - cx)) / (rx * rx) - ((z - cz) * (z - cz)) / (rz * rz));
    return g(3550, 1470, 700, 260, 22) + g(4300, 1350, 500, 260, 14) + (z < -4326 ? Math.min(14, (-4326 - z) * .02) * sstep(5800, 7500, x + 9000) : 0) + g(2400, -5600, 1200, 900, 10); },
  height(x, z, coarse) { const c = this.chunkAt(x, z); if (c) { if (c.ditches) for (const d of c.ditches) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) return -AVENUE.DITCH_D; return coarse ? 0 : -CANAL.depthAt(x, z) - (this.palDepth ? PALACE.depthAt(x, z) : 0); } return this.farH(x, z); },
  // raised park lawns (樂遊原): the walkable ground there is the drawn lawn itself (LM.park C.lawnY, exact to the LOD0 mesh) — a heightfield
  // with no seams; -1e9 outside them. Used by the player's world (MultiWorld.hfn), so ground queries never drop under the hill.
  parkH(x, z) { if (!this._parks) { this._parks = []; if (typeof LANDMARKS !== 'undefined' && LANDMARKS.ctx) for (const lay of this.lay || []) for (const lot of lay.lots) if (lot.big && LANDMARKS.has(lot)) { const C = LANDMARKS.ctx(lot); if (C && C.lawnY) this._parks.push({ r: lot.r, C }); } }
    for (const P of this._parks) { const r = P.r; if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue; const F = P.C.F, dx = x - F.x, dz = z - F.z, lx = F.c * dx - F.s * dz, lz = F.s * dx + F.c * dz;
      if (Math.abs(lx) > P.C.w / 2 || Math.abs(lz) > P.C.d / 2) continue; return P.C.lawnY(lx, lz); } return -1e9; },
  // the ground away from the walkable chunks (= the far terrain): the natural relief inside the 坊 / units, and outside them rising only from ~150 m
  // out (so it meets the flat walkable ground at its level); dU = distance to the nearest unit rect
  dU(x, z) { const A = this.all || []; if (A.length && this._ubN !== A.length) { this._ubN = A.length; this._ub = A.reduce((b, w) => [Math.min(b[0], w.r.x0), Math.min(b[1], w.r.z0), Math.max(b[2], w.r.x1), Math.max(b[3], w.r.z1)], [1e9, 1e9, -1e9, -1e9]); }
    if (this._ub) { const b = this._ub, q = Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3])); if (q > 900) return q; } // far outside every unit: the bounding box distance is enough (callers saturate by ~520 m)
    let d = 1e9; for (const w of A) { const r = w.r, dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1), q = Math.hypot(dx, dz); if (q < d) d = q; } return d; },
  farH(x, z) { const b = this.base(x, z); if (!b || !this.all) return b; if (Math.abs(x) < PLAN.W / 2 && Math.abs(z) < PLAN.H / 2 && this.all.some(w => inR(w.r, x, z))) return b; return b * sstep(150, 520, this.dU(x, z)); },
  groundAt(x, z) { for (const lay of this.lay) if (inR(lay.wd.r, x, z)) return lay.gr.at(x, z); return GC.STREET; },
  terrWeights(x, z) { if (this.height(x, z) < -.1) return [0, .2, 1, 0]; const c = this.groundAt(x, z); return c === GC.STREET || c === GC.LANE ? [1, 0, 0, 0] : c === GC.YARD || c === GC.PAVED ? [0, 1, 0, 0] : c === GC.FIELD ? [0, 0, 0, 1] : [0, .9, .7, 0]; },
  terrTile(b, x0, z0, size, cell, wfn, hfn) {
    const n = Math.round(size / cell), base = b.nv, H = hfn || ((x, z) => this.height(x, z)), W = wfn || ((x, z) => this.terrWeights(x, z));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = x0 + i * cell, z = z0 + j * cell, y = H(x, z), w = W(Math.min(x, x0 + size - .5), Math.min(z, z0 + size - .5));
      const e = cell * .5, nn = v3norm([H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)]); b.col = [w[0], w[1], w[2]]; b.emi = w[3]; b.v(x, y, z, nn[0], nn[1], nn[2], x / 3, z / 3); }
    b.emi = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i, c = a + n + 1; b.I.push(a, c, c + 1, a, c + 1, a + 1); }
  },
};
// ---------------- JOBS (pure: inputs are indices; outputs are packed buffers) ----------------
const pk = (mb, tr) => { if (!mb.nv) return null; const p = MBpack(mb); tr.push(p.vb, p.ib.buffer); return p; };
const SURF = ['stone', 'wood', 'dirt', 'tile', 'brick', 'grass', 'water', 'thatch'];
CITY.JOBS = {
  lod0({ ci }, tr) { // full-detail chunk with collision
    const c = CITY.order[ci], L = makeL(new World());
    for (const it of c.items) it.build(L);
    const grp = CITY.groups[c.group], palace = grp && grp.wd && grp.wd.palace; /* palace courts: no street litter / refuse scatter (the palace builds its own planting) */
    if (typeof NATURE !== 'undefined' && NATURE.chunk && !palace) NATURE.chunk(L, { x0: c.x0, z0: c.z0, size: CITY.CH, seed: (c.i * 73856093) ^ (c.j * 19349663), ground: (x, z) => CITY.groundAt(x, z), height: (x, z) => CITY.height(x, z), GC,
      lots: CITY.lay.flatMap(l => l.lots.filter(t => t.r.x1 > c.x0 && t.r.x0 < c.x0 + CITY.CH && t.r.z1 > c.z0 && t.r.z0 < c.z0 + CITY.CH)), gates: CITY.gates.filter(g => g.x > c.x0 - 10 && g.x < c.x0 + CITY.CH + 10 && g.z > c.z0 - 10 && g.z < c.z0 + CITY.CH + 10) });
    const T = new MB(); CITY.terrTile(T, c.x0, c.z0, CITY.CH, 1);
    const S = L.world.solids, sol = new Float32Array(S.length * 10);
    S.forEach((s, i) => sol.set([s.k, s.cx, s.cy, s.cz, s.hx || 0, s.hy, s.hz || 0, s.yaw || 0, s.r || 0, Math.max(0, SURF.indexOf(s.surface)) + 256 * (s.grp || 0)], i * 10)); tr.push(sol.buffer);
    return { ci, mesh: pk(L.mb, tr), fol: pk(L.fol, tr), terr: pk(T, tr), sol, lights: L.lights.map(l => ({ x: l.x, y: l.y, z: l.z, r: l.r, c: l.c, flicker: l.flicker, group: l.group })), meta: L.meta };
  },
  group({ g }, tr) { // LOD1 of one slice ward's chunks, with per-chunk index ranges
    const G = CITY.groups[g], L = makeL(new World()), ranges = [];
    const bbox = (mb, v0, B) => { const P = mb.P; for (let i = v0 * 3; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (x < B[0]) B[0] = x; if (y < B[1]) B[1] = y; if (z < B[2]) B[2] = z; if (x > B[3]) B[3] = x; if (y > B[4]) B[4] = y; if (z > B[5]) B[5] = z; } };
    for (let ci = G.c0; ci < G.c1; ci++) { const c = CITY.order[ci], a = L.mb.I.length, f = L.fol.I.length, v0 = L.mb.nv, w0 = L.fol.nv; LOD.run(L, L2 => { for (const it of c.items) it.build(L2); });
      const B = [c.x0, -2, c.z0, c.x0 + CITY.CH, 2, c.z0 + CITY.CH]; bbox(L.mb, v0, B); bbox(L.fol, w0, B); ranges.push([ci, a, L.mb.I.length - a, f, L.fol.I.length - f, B]); }
    return { g, mesh: pk(L.mb, tr), fol: pk(L.fol, tr), ranges };
  },
  terr(_, tr) { // walkable-chunk terrain at 8 m (LOD1), ranges per chunk
    const T = new MB(), ranges = []; for (const c of CITY.order) { const a = T.I.length; CITY.terrTile(T, c.x0, c.z0, CITY.CH, 8, null, (x, z) => CITY.height(x, z, true)); ranges.push([c.idx, a, T.I.length - a]); }
    return { terr: pk(T, tr), ranges };
  },
  far({ wi, lvl }, tr) { // FAR1 or FAR2 meshes for a list of wards
    const out = []; for (const i of wi) { const A = makeL(new World()); FARB.ward(A, CITY.all[i], lvl); out.push({ i, mesh: pk(A.mb, tr), fol: pk(A.fol, tr) }); }
    return { list: out, lvl };
  },
  land({ part, prof }, tr) { const L = makeL(new World()), PT = {}, undo = []; // prof: per-function build times (tool/landjob.html)
    if (prof) for (const [o, k] of [[FARB, 'tr'], [FARB, 'lake'], [FARB, 'compound'], [FARB, 'pwall'], [FARB, 'lhall'], [FARB, 'court'], [FARB, 'gt'], [ARCH, 'lou'], [TREES, 'place'], [CANAL, 'near'], [CANAL, 'hits'], [ARCH, 'gateTower'], [TEX, 'id']]) { const f = o[k]; undo.push([o, k, f]); o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { PT[k] = (PT[k] || 0) + performance.now() - t; } }; }
    try { FARB.land(L, part); } finally { for (const [o, k, f] of undo) o[k] = f; } return { part, mesh: pk(L.mb, tr), fol: pk(L.fol, tr), prof: prof ? PT : undefined }; },
  fterr(_, tr) { const T = new MB(); FARB.terrain(T); return { terr: pk(T, tr) }; },
  canals(_, tr) { const L = makeL(new World()), b = L.mb; CANAL.init(); const prev = ARCH.lod; ARCH.lod = 2;
    try { for (const s of CANAL.segs) { const len = Math.hypot(s.bx - s.ax, s.bz - s.az), n = Math.max(1, Math.ceil(len / 40)), yaw = Math.atan2(s.bx - s.ax, s.bz - s.az);
        for (let k = 0; k < n; k++) { const t = (k + .5) / n, x = s.ax + (s.bx - s.ax) * t, z = s.az + (s.bz - s.az) * t; if (CITY.chunkAt(x, z)) continue;
          b.s({ tex: 'water', col: [.7, .82, .88], emi: .03 }).T(x, CITY.farH(x, z) + .06, z, 0, yaw, 0).box(0, 0, 0, s.w, .02, len / n + .2, { world: 4, skip: ['bot'] }).pop(); } } }
    finally { ARCH.lod = prev; } return { mesh: pk(b, tr) }; },
  mtn(_, tr) { const T = new MB(); FARB.mountains(T); return { mesh: pk(T, tr) }; },
};
CITY.job = function (m) { const tr = []; const r = CITY.JOBS[m.t](m, tr); r.t = m.t; r.id = m.id; return { msg: r, transfer: tr }; };

// =====================================================================================
// FARB — far representations: wards at two levels, landmarks (outer wall & gates, palace & imperial city, 大明宮), terrain
// =====================================================================================
const FARB = {
  y(x, z) { return CITY.chunkAt(x, z) ? 0 : CITY.farH(x, z); }, // far meshes stand on the same ground as the walkable chunks there (flat), else on the far terrain
  mass(b, x, z, yaw, w, d, h, roof, tiles) { const y = this.y(x, z); b.T(x, y, z, 0, yaw, 0); b.s({ tex: 'facade_lod', col: [1, 1, 1] }).box(0, h / 2 - .5, 0, w, h + 1, d, { uv: [Math.max(1, Math.round(w / 3.5)), 1], skip: ['bot', 'top'] }); LOD.roof(b, w, d, h, Math.min(1.4, w * .1), roof, tiles, w / 2 - .02); b.pop(); }, // gable infill 2 cm inside the box's end faces
  wallRing(b, r, h, t, tex = 'rammed_earth') { for (const [x0, z0, x1, z1] of [[r.x0, r.z0, r.x1, r.z0 + t], [r.x0, r.z1 - t, r.x1, r.z1], [r.x0, r.z0 + t, r.x0 + t, r.z1 - t], [r.x1 - t, r.z0 + t, r.x1, r.z1 - t]]) {
    const n = Math.max(1, Math.round(Math.max(x1 - x0, z1 - z0) / 200)); for (let k = 0; k < n; k++) { const ax = x1 - x0 > z1 - z0, a0 = ax ? lerp(x0, x1, k / n) : lerp(z0, z1, k / n), a1 = ax ? lerp(x0, x1, (k + 1) / n) : lerp(z0, z1, (k + 1) / n), cx = ax ? (a0 + a1) / 2 : (x0 + x1) / 2, cz = ax ? (z0 + z1) / 2 : (a0 + a1) / 2, y = this.y(cx, cz);
      b.s({ tex, col: [1, 1, 1] }).box(cx, y + h / 2 - 1, cz, ax ? a1 - a0 : x1 - x0, h + 2, ax ? z1 - z0 : a1 - a0, { world: 3, skip: ['bot'] }); } } },
  ward(L, wd, level) { const prev = ARCH.lod; ARCH.lod = 2; try { this._ward(L, wd, level); } finally { ARCH.lod = prev; } },
  _ward(L, wd, level) {
    const b = L.mb, r = wd.r, R = RNG(wd.seed * 7 + level);
    if (wd.palace) { if (PALACE.far) PALACE.far(L, wd.name, level); return; } // the palaces' own far meshes (engine/palace.js)
    if (wd.kind === 'palace' || wd.kind === 'park') return; // 興慶宮 and 曲江 / 芙蓉園 are landmark parts (FARB.PARTS: 'xingqing', 'qujiang')
    this.wallRing(b, r, 3.2, 2.4);
    const lay = wd.kind === 'market' ? MARKET.layout(wd) : WARD.layout(wd);
    LOD.run(L, L2 => {
      for (const lot of lay.lots) {
        const { F, w, d } = COMP.frame(lot), t = lot.type, big = /rich|jinzou|office|mansion|quarter|temple/.test(t);
        if (level === 2 && !big && !lot.pagoda && (lot.seed % 3)) continue; // FAR2: every third ordinary lot, standing in for its neighbours
        const P = (lx, lz) => F.p(lx, 0, lz);
        if (t === 'field') continue;
        if (t === 'pond') { const I = 3, q0 = P(-w / 2 + I, -d / 2 + I), q1 = P(w / 2 - I, d / 2 - I), x0 = Math.min(q0[0], q1[0]), x1 = Math.max(q0[0], q1[0]), z0 = Math.min(q0[2], q1[2]), z1 = Math.max(q0[2], q1[2]), wy = this.y((x0 + x1) / 2, (z0 + z1) / 2) + .07; // far: the basin's water (same layer and dark shading as near; it used to read as garden grass from afar)
          b.s({ tex: 'water', col: [.72, .84, .9], emi: .03 }).box((x0 + x1) / 2, wy - .01, (z0 + z1) / 2, x1 - x0, .02, z1 - z0, { skip: ['bot'], world: 6 }); b.s({ emi: 0, col: [1, 1, 1] }); }
        if (t === 'garden' || t === 'pond') { if (level === 1) for (let k = 0; k < 3; k++) { const p = P((R() - .5) * w * .7, (R() - .5) * d * .7); TREES.place(L2, p[0], this.y(p[0], p[2]), p[2], R() < .5 ? 'huai' : 'willow', 1, lot.seed + k); } continue; }
        if (lot.big && typeof LANDMARKS !== 'undefined' && LANDMARKS.has(lot)) { for (const u of LANDMARKS.parts(lot)) u.build(L2); continue; } // the landmark's own far version (ARCH.lod = 2)
        if (t === 'temple') { const big2 = w * d > 9000, mz = COMP.templeMainZ(lot), p = P(0, mz); this.mass(b, p[0], p[2], F.yaw, big2 ? 35 : 24, big2 ? 20 : 15, 6.5, 'hip');
          const g = P(0, d / 2 - 3); this.mass(b, g[0], g[2], F.yaw, 13, 7, 4.5, 'xieshan');
          const pg = COMP.pagodaKind(lot); if (!pg && COMP.isDao(lot)) { const q = P(0, COMP.pagodaZ(lot)); TANG.altar(L2, q[0], this.y(q[0], q[2]), q[2], F.yaw, Math.min(16, w * .3)); } if (pg) { const q = P(0, COMP.pagodaZ(lot)), o = COMP.pagodaSpec(lot, pg); // the same pagoda, at the same place, as the detailed temple
            TANG.pagoda(L2, q[0], this.y(q[0], q[2]), q[2], Object.assign({ yaw: F.yaw }, o)); }
          // monks' courts (僧院) as rows of halls either side of the axis; rear halls on the axis
          if (big2) { const axisW = 70; for (const sd of [-1, 1]) { const sw = (w - axisW) / 2 - 6; if (sw < 20) continue; const nu = Math.max(1, Math.floor(sw / 46));
              for (let u = 0; u < nu; u++) { const ux = sd * (axisW / 2 + 6 + sw * (u + .5) / nu), uw = Math.min(sw / nu - 8, 26);
                for (let z = d / 2 - 22; z > -d / 2 + 20; z -= 42) { const q = P(ux, z); this.mass(b, q[0], q[2], F.yaw, uw, 8, 3.6, 'gable'); const q2 = P(ux, z - 17); this.mass(b, q2[0], q2[2], F.yaw, uw * .8, 7, 3.4, 'xieshan');
                  if (level === 1 && (u + z) % 3 < 1) { const q3 = P(ux + uw * .4, z - 8); TREES.place(L2, q3[0], this.y(q3[0], q3[2]), q3[2], 'huai', 1, lot.seed + u * 7 + z | 0); } } } }
            for (const zz of [mz - 45, mz - 90]) if (zz > -d / 2 + 15) { const q = P(0, zz); this.mass(b, q[0], q[2], F.yaw, 24, 14, 5, 'xieshan'); } }
          if (level === 1) for (let k = 0; k < (big2 ? 24 : 6); k++) { const p2 = P((R() - .5) * w * .85, (R() - .5) * d * .85); TREES.place(L2, p2[0], this.y(p2[0], p2[2]), p2[2], R() < .4 ? 'pine' : 'huai', 1.1, lot.seed + k); } continue; }
        if (big) { const nu = Math.max(1, Math.round(w / 60)), nv = Math.max(1, Math.round(d / 70));
          for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const lx = -w / 2 + w / nu * (i + .5), lz = d / 2 - d / nv * (j + .5), uw = w / nu, vd = d / nv;
            for (let k = 0; k < (level === 1 ? 3 : 1); k++) { const p = P(lx, lz + vd * (.25 - k * .3)); this.mass(b, p[0], p[2], F.yaw, Math.min(uw - 6, k === 1 ? 19 : 12), 9, k === 1 ? 4.6 : 3.8, k === 1 ? 'xieshan' : 'gable'); } } continue; }
        // ordinary lot: main house at the back, a wing if wide
        const sc2 = level === 2 ? 1.5 : 1, mw = Math.min(w - 2, 10.5 * sc2), p = P(0, -d / 2 + Math.min(d * .32, 9)); this.mass(b, p[0], p[2], F.yaw, mw, 6.4 * (level === 2 ? 1.3 : 1), 3.2, 'gable', t === 'hut' && (lot.seed & 1) ? 'straw' : undefined);
        if (/shop|wineshop|stall/.test(t)) { const q = P(0, d / 2 - 4); this.mass(b, q[0], q[2], F.yaw, Math.min(w - .5, 10), 5, 3.4, 'gable'); }
        if ((lot.seed % 5) < (level === 2 ? 1 : 2)) { const q = P((R() - .5) * (w - 4), d / 2 - 4); TREES.place(L2, q[0], this.y(q[0], q[2]), q[2], 'huai', .9 * (level === 2 ? 1.3 : 1), lot.seed); }
      }
    });
  },
  water(b, q) { const y = this.y(rcx(q), rcz(q)) + .15; b.s({ tex: 'water', col: [.8, .9, .95], emi: .05 }).grid(4, 4, (i, j) => [lerp(q.x0, q.x1, j / 4), y, lerp(q.z0, q.z1, i / 4), lerp(q.x0, q.x1, j / 4) / 6, lerp(q.z0, q.z1, i / 4) / 6], false, null, true); b.s({ emi: 0 }); },
  // landmarks
  land(L, part) { const prev = ARCH.lod; ARCH.lod = 2; LOD.under = part === 'qujiang' || part === 'walls'; /* parts you walk under / beside: roofs with undersides (QA roof check) */ try { this._land(L, part); } finally { ARCH.lod = prev; LOD.under = false; } },
  _land(L, part) {
    const b = L.mb, P = PLAN, OW = P.W / 2, OH = P.H / 2;
    LOD.run(L, L2 => {
      if (part === 'walls') { // outer wall 5.3 m (with a parapet to read at distance), 12 gates with towers
        const mid = (a, c) => (P.rows[a][1] + P.rows[c][0]) / 2, gx = { 安化: (P.cols.W2[0] + P.cols.W1[1]) / 2 - 25, 啟夏: (P.cols.E1[1] + P.cols.E2[0]) / 2 };
        const S = [['s', [-OW, OH], [OW, OH], [gx.安化, 0, gx.啟夏]], ['n', [-OW, -OH], [OW, -OH], []], ['w', [-OW, -OH], [-OW, OH], [mid(2, 3), mid(4, 5), mid(8, 9)]], ['e', [OW, -OH], [OW, OH], [mid(2, 3), mid(4, 5), mid(8, 9)]]];
        for (const [sd, a, c, gates] of S) { const horiz = a[1] === c[1], A = horiz ? a[0] : a[1], C = horiz ? c[0] : c[1], GZ = sd === 'e' && CITY.gatezone, cuts = gates.map(g => GZ && Math.abs(g - GZ.gate.z) < 1 ? [GZ.r.z0 - 4, GZ.r.z1 + 4] : [g - (g === 0 && horiz ? 30 : 18), g + (g === 0 && horiz ? 30 : 18)]).sort((p, q) => p[0] - q[0]);
          for (const cc of this.canalX(a[0], a[1], c[0], c[1])) { const ow = cc.w + 2.4, v = A + cc.u; if (cuts.some(q => v + ow / 2 > q[0] && v - ow / 2 < q[1])) continue; cuts.push([v - ow / 2, v + ow / 2]); this.waterGate(L2, horiz ? v : a[0], horiz ? a[1] : v, horiz ? 0 : -PI / 2, ow, { h: 5.3, t: 10, cap: false, col: [1, .96, .9] }); } // 水門
          if (horiz) for (const wd of CITY.all) if (wd.kind === 'palace' && (Math.abs(wd.r.z0 - a[1]) < 3 || Math.abs(wd.r.z1 - a[1]) < 3)) cuts.push([wd.r.x0, wd.r.x1]); // the 宮城 and 大明宮 draw their own walls (玄武門 / 丹鳳門 lines): the city wall used to run through their gates and double their walls
          cuts.sort((p, q) => p[0] - q[0]); for (let k = cuts.length - 1; k > 0; k--) if (cuts[k][0] <= cuts[k - 1][1] + .01) { cuts[k - 1][1] = Math.max(cuts[k - 1][1], cuts[k][1]); cuts.splice(k, 1); } // merge overlapping cuts
          let u = A; const segs = []; for (const [g0, g1] of cuts) { segs.push([u, g0]); u = g1; } segs.push([u, C]);
          for (const [u0, u1] of segs) for (let v = u0; v < u1 - 1; v += 150) { const v1 = Math.min(u1, v + 150), cx = horiz ? (v + v1) / 2 : a[0], cz = horiz ? a[1] : (v + v1) / 2, y = this.y(cx, cz);
            b.s({ tex: 'rammed_earth', col: [1, .96, .9] }).box(cx, y + 2.15 + (horiz ? .03 : 0), cz, horiz ? v1 - v : 10, 6.3 + (horiz ? .06 : 0), horiz ? 10 : v1 - v, { world: 4, skip: ['bot'] }); } // N/S runs 6 cm taller: no shared top plane at the corners
          for (const [gi, g] of gates.entries()) { if (GZ && Math.abs(g - GZ.gate.z) < 1) continue; const cx = horiz ? g : a[0], cz = horiz ? a[1] : g, main = g === 0 && horiz, gn = { e: ['通化門', '春明門', '延興門'], w: ['開遠門', '金光門', '延平門'], s: ['安化門', '明德門', '啟夏門'] }[sd]; ARCH.gateTower(L2, cx, this.y(cx, cz), cz, { tablet: gn ? 'gt_' + gn[gi] : null, yaw: horiz ? 0 : PI / 2, w: main ? 60 : 36, d: 18, h: 7, passages: main ? 5 : 3, pw: 5, ph: 5.5, open: true, tower: { bays: main ? 11 : 7, dbays: 2, roof: 'hip' } }); }
        }
      }
      this._tl = part === 'imperial' ? 2 : 1; this._part = part; const fn = { palace: this.landPalace, imperial: this.landImperial, daming: this.landDaming, xingqing: this.landXingqing, xqtowers: this.landXingqing, qujiang: this.landQujiang }[part]; if (fn) { LOD.under = part === 'qujiang' || part === 'walls'; try { fn.call(this, L2); } finally { LOD.under = false; } }
    });
  },
  // the horizon: the Qinling (終南山) wall ~30 km south, 驪山 to the east, low loess uplands (原) north and west. Drawn with partial fog.
  mountains(T) {
    const NA = 360, rs = [16000, 22000, 26000, 29000, 32000, 36000, 42000, 52000, 70000], base = T.nv;
    // noise sampled in world x/z (not in angle: the angle wraps at due south and the ridges jumped there); wavelengths as before at the main ridge (r ~ 29 km)
    const H = (a, r) => { const sx = Math.sin(a), cz = Math.cos(a), x = sx * r, z = cz * r; // a = 0: south (+z), a = PI/2: east (+x)
      const south = Math.pow(Math.max(0, cz), 1.6), east = Math.exp(-Math.pow((a - 1.25) / .22, 2)), n = fbm2(x / 3200 + 500, z / 3200 + 500, 1e6, 5, 7), m = fbm2(x / 725 + 500, z / 725 + 500, 1e6, 3, 9);
      const rise = sstep(24000, 31000, r) * (2400 * south * (.6 + n * .8) + 520 * east * sstep(25000, 29000, r)) + sstep(16000, 30000, r) * (120 + 160 * n) * (1 - south * .6);
      // the inner edge meets the far ground (which reaches r ~ 16.3 km) at its own level (14 m on the plateau to the north), 2 m under it where they overlap
      return rise * (.85 + m * .3) + CITY.farH(x, z) * (1 - sstep(16000, 26000, r)) - 2 * (1 - sstep(16000, 18500, r)); };
    for (let j = 0; j < rs.length; j++) for (let i = 0; i <= NA; i++) { const a = i / NA * TAU, r = rs[j], h = H(a, r), x = Math.sin(a) * r, z = Math.cos(a) * r, k = .55 + .45 * fbm2(x / 1450 + 300, z / 1450 + 300, 1e6, 3, 3);
      T.col = [.62 * k, .7 * k, .58 * k]; T.emi = 0; T.layer = TEX.id('grass_summer'); T.v(x, h, z, 0, 1, 0, x / 200, z / 200); }
    for (let j = 0; j < rs.length - 1; j++) for (let i = 0; i < NA; i++) { const a = base + j * (NA + 1) + i, b = a + NA + 1; T.I.push(a, b, b + 1, a, b + 1, a + 1); }
    // normals from the grid
    const P = T.P, N = T.N; for (let j = 0; j < rs.length; j++) for (let i = 0; i <= NA; i++) { const k = base + j * (NA + 1) + i, ip = base + j * (NA + 1) + Math.min(NA, i + 1), jp = base + Math.min(rs.length - 1, j + 1) * (NA + 1) + i;
      const u = [P[ip * 3] - P[k * 3], P[ip * 3 + 1] - P[k * 3 + 1], P[ip * 3 + 2] - P[k * 3 + 2]], v = [P[jp * 3] - P[k * 3], P[jp * 3 + 1] - P[k * 3 + 1], P[jp * 3 + 2] - P[k * 3 + 2]], nn = v3norm(v3cross(v, u)); N[k * 3] = nn[0]; N[k * 3 + 1] = Math.abs(nn[1]); N[k * 3 + 2] = nn[2]; }
  },
  terrain(T) { // far terrain: 64 m tiles skipping the walkable chunks; finer inside the city
    const OW = PLAN.W / 2, OH = PLAN.H / 2, inCity = (x, z) => Math.abs(x) < OW && Math.abs(z) < OH;
    const wardAt = (x, z) => CITY.all.find(w => inR(w.r, x, z));
    // outside the walls: the distance to the nearest 坊 / palace unit drives a gentle transition — packed loess by the walls fading into grass and
    // fields (the 禁苑 park to the north, farmland and villages around), and the natural relief rising only from ~150 m out, so the far ground
    // meets the walkable ground at its level (outside 大明宮 the 龍首原 relief stood metres above it: a step with a see-through seam)
    const dU = (x, z) => CITY.dU(x, z);
    const W = (x, z) => { if (!inCity(x, z) || CITY.all.every(w => !inR(w.r, x, z))) { if (inCity(x, z) && !wardAt(x, z)) return [1, 0, 0, 0]; const t = sstep(20, 260, dU(x, z) + (fbm2(x / 380, z / 380, 1e6, 3, 811) - .5) * 300); return [.55 * (1 - t), .45 * (1 - t), .5 * t, .5 * t]; } // a wide, irregular edge: the fields come and go
      const w = wardAt(x, z); if (!w) return [1, 0, 0, 0]; return w.kind === 'park' || w.kind === 'palace' ? [0, .2, 1, 0] : w.row >= 10 ? [0, .3, .4, .5] : [0, .7, .5, 0]; };
    const H = (x, z) => CITY.farH(x, z);
    const X0 = -7040, X1 = 7040, Z0 = -7488, Z1 = 6400;
    for (let z0 = Z0; z0 < Z1; z0 += 64) for (let x0 = X0; x0 < X1; x0 += 64) { if (CITY.chunkAt(x0 + 1, z0 + 1)) continue; CITY.terrTile(T, x0, z0, 64, inCity(x0 + 32, z0 + 32) || dU(x0 + 32, z0 + 32) < 400 ? 32 : 64, W, H); }
    // beyond: out to the foot of the mountain ring (FARB.mountains starts at r = 16 km): 512 m tiles on a grid anchored at the rectangle's corner,
    // 64 m tiles where a big tile overlaps the rectangle (whose sides are whole multiples of 64 m from that corner)
    const RM = 16300, near0 = (x0, z0, sz) => Math.hypot(Math.max(-x0 - sz, 0, x0), Math.max(-z0 - sz, 0, z0)); // distance from the origin to the tile
    for (let z0 = Z0 - 512 * 18; z0 < RM; z0 += 512) for (let x0 = X0 - 512 * 19; x0 < RM; x0 += 512) {
      if (near0(x0, z0, 512) > RM) continue; const ov = x0 < X1 && x0 + 512 > X0 && z0 < Z1 && z0 + 512 > Z0;
      if (!ov) { CITY.terrTile(T, x0, z0, 512, 128, W, H); continue; }
      for (let zz = z0; zz < z0 + 512; zz += 64) for (let xx = x0; xx < x0 + 512; xx += 64) if (!(xx >= X0 && xx < X1 && zz >= Z0 && zz < Z1)) CITY.terrTile(T, xx, zz, 64, 64, W, H); }
  },
};

// =====================================================================================
// FARB landmarks (round 11): 宮城 (太極宮 / 掖庭宮 / 東宮), 皇城 (百司 offices, 太廟, 太社), 大明宮, 興慶宮, 曲江池 / 芙蓉園.
// Massing level (ARCH.lod 2); LOD1 for the great halls (roof thickness, ridges) and for 興慶宮's south edge on the 春明門 avenue,
// LOD0 for its two towers (seen from 60–150 m). Axis orders and the big dimensions follow REF_CHANGAN §1.4 (考古1963) and the
// excavated plans (含元殿 with 翔鸞 / 棲鳳閣 and 龍尾道, 麟德殿's triple hall, 興慶宮's 龍池 and SW towers). Everything off the
// axes (minor courts, offices, garden pavilions, lake outlines) is a PLAUSIBLE RECONSTRUCTION with invented positions.
// =====================================================================================
Object.assign(FARB, {
  PARTS: ['walls', 'palace', 'imperial', 'daming', 'xingqing', 'xqtowers', 'qujiang'], // xqtowers: 興慶宮's two LOD0 towers (own job: build time)
  tr(L, x, z, kind, s, seed) { const c = CANAL.near(x, z); if (c && c.d < c.w / 2 + 3) return; const lv = ARCH.lod; ARCH.lod = this._tl ?? lv; try { TREES.place(L, x, this.y(x, z), z, kind, s, seed); } finally { ARCH.lod = lv; } }, // _tl: tree level for the part (1: full crowns; 2 for the long street rows)
  // a rect clear of the canals: split across the channel (6 m margins) when one runs through it; parts too small are dropped
  clear(r, minW = 40, minD = 50) { if (!CANAL.hits(r, 4)) return [r]; const c = CANAL.near(rcx(r), rcz(r)); if (!c) return []; const s = c.s, dx = s.bx - s.ax, dz = s.bz - s.az, m = s.w / 2 + 6; let parts;
    if (Math.abs(dz) > Math.abs(dx)) { const xc = s.ax + dx * clamp((rcz(r) - s.az) / dz, 0, 1); parts = [rect(r.x0, r.z0, xc - m, r.z1), rect(xc + m, r.z0, r.x1, r.z1)]; }
    else { const zc = s.az + dz * clamp((rcx(r) - s.ax) / dx, 0, 1); parts = [rect(r.x0, r.z0, r.x1, zc - m), rect(r.x0, zc + m, r.x1, r.z1)]; }
    return parts.filter(q => rw(q) >= minW && rd(q) >= minD && !CANAL.hits(q, 4)); },
  // a hall on stepped terraces (o.tiers: [[height, margin | [mx, mz]]] bottom-up, margins beyond the hall's own platform, decreasing);
  // great roofs get a ridge with 鴟尾 (o.cw). o.lod: build level (default: the current one)
  lhall(L, x, z, o = {}) {
    const prev = ARCH.lod; if (o.lod) ARCH.lod = o.lod;
    try {
      const b = L.mb, yaw = o.yaw || 0, nb = o.bays || 5, nd = o.dbays || 2, bw = o.bayW || 4.6, dw = o.dbayW || 4.4, W = nb * bw, D = nd * dw, colH = o.colH || 4.6, pm = o.pm ?? (colH * .4 + .5), roof = o.roof || 'hip';
      let y = o.y ?? this.y(x, z);
      if (o.tiers && o.tiers.length) { b.T(x, 0, z, 0, yaw, 0); o.tiers.forEach(([th, m], k) => { const mx = Array.isArray(m) ? m[0] : m, mz = Array.isArray(m) ? m[1] : m, yb = y - (k ? .5 : 2);
        b.s({ tex: o.baseTex || 'brick', col: [1, .97, .92] }).box(0, (yb + y + th) / 2, 0, W + 2 * (pm + mx), y + th - yb, D + 2 * (pm + mz), { world: 3, skip: ['bot'], faces: { top: 'pave' } }); y += th; }); b.pop(); }
      const r = ARCH.hall(L, x, y, z, { yaw, bays: nb, dbays: nd, bayW: bw, dbayW: dw, colH, platform: o.ph ?? .9, pm, roof, brackets: o.brackets || 'full', paint: o.paint || 'ochre', walls: o.walls || 'white', windows: true, seed: o.seed || 1 });
      if (o.cw !== false && (roof === 'hip' || roof === 'xieshan') && r.frame) {
        const ov = r.frame.ov, X = W / 2 + ov, Z = D / 2 + ov, rx = roof === 'hip' ? Math.max(0, X - Z) : X - Z * .45, ry = r.ridge;
        if (rx > 1.5) { const rh = clamp(W * .012, .5, 1.3), rwid = rh * .8; b.T(x, 0, z, 0, yaw, 0); b.s({ tex: 'roof_ridge', col: [1, 1, 1] }).box(0, ry + (rh - .25) / 2, 0, 2 * rx + .3, rh + .25, rwid, { skip: ['bot'] });
          for (const sd of [-1, 1]) { b.T(sd * (rx + .1), ry + rh - .03, 0, 0, sd < 0 ? 0 : PI, 0); ARCH.chiwei(b, rh * 2.4); b.pop(); } b.s({ col: [1, 1, 1] }); b.pop(); } }
      return { y, W, D, pm, ridge: r.ridge };
    } finally { ARCH.lod = prev; }
  },
  // ramp (龍尾道) along z: high end at zHi against a terrace face, low end at zLo
  ramp(b, x, zHi, zLo, w, yHi, yLo, tex = 'brick') {
    const yb = Math.min(yLo, this.y(x, zLo)) - 1, x0 = x - w / 2, x1 = x + w / 2, sg = Math.sign(zLo - zHi); b.s({ tex, col: [1, .97, .92] });
    ARCH.poly(b, [[x0, yHi, zHi], [x1, yHi, zHi], [x1, yLo, zLo], [x0, yLo, zLo]], [0, Math.abs(zLo - zHi), sg * (yHi - yLo)], p => [p[0] / 3, p[2] / 3]);
    for (const [xx, sd] of [[x0, -1], [x1, 1]]) ARCH.poly(b, [[xx, yb, zHi], [xx, yHi, zHi], [xx, yLo, zLo], [xx, yb, zLo]], [sd, 0, 0], p => [p[2] / 3, -p[1] / 3]);
    ARCH.poly(b, [[x0, yb, zLo], [x1, yb, zLo], [x1, yLo, zLo], [x0, yLo, zLo]], [0, 0, sg], p => [p[0] / 3, -p[1] / 3]);
  },
  // a corridor run (廊), split into pieces where the ground slopes (pieces alternate in height so their roofs never share a plane)
  corr(L, x0, z0, x1, z1, o = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 3) return; const ys = [0, .25, .5, .75, 1].map(t => this.y(lerp(x0, x1, t), lerp(z0, z1, t))), y0 = Math.min(...ys), dy = Math.max(...ys) - y0;
    const n = o.y !== undefined ? 1 : Math.max(1, Math.ceil(dy / .8)), w = o.w || 5;
    for (let k = 0; k < n; k++) { const a = k / n, c = (k + 1) / n, ax = lerp(x0, x1, a), az = lerp(z0, z1, a), cx = lerp(x0, x1, c), cz = lerp(z0, z1, c);
      const yy = o.y ?? (n === 1 ? y0 - .2 : Math.min(this.y(ax, az), this.y(cx, cz)) - .2), ph = (o.ph ?? .5) + (n === 1 && o.y === undefined ? dy : 0) + (k % 2) * .06;
      ARCH.corridor(L, ax, az, cx, cz, { y: yy, w: w + (k % 2) * .2, colH: (o.colH || 3.6) + (k % 2) * .35, ph, m0: k ? 0 : (o.m0 ?? .4), m1: k < n - 1 ? 0 : (o.m1 ?? .4), paint: 'ochre', wall: o.wall ?? 0, seed: 1 }); }
  },
  // walled 廊院 court: corridors round W x D (front = south, +z), a gate hall in the front corridor (and o.rear: one in the back)
  court(L, cx, cz, W, D, o = {}) {
    const w = o.w || 5, gw = o.gateW || 24, x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2, e = w / 2 + .45;
    if (o.rear) { this.corr(L, x0 - w / 2, z0, cx - gw / 2, z0, o); this.corr(L, cx + gw / 2, z0, x1 + w / 2, z0, o); } else this.corr(L, x0 - w / 2, z0, x1 + w / 2, z0, o);
    this.corr(L, x0 - w / 2, z1, cx - gw / 2, z1, o); this.corr(L, cx + gw / 2, z1, x1 + w / 2, z1, o);
    for (const xx of [x0, x1]) this.corr(L, xx, z0 + e, xx, z1 - e, Object.assign({}, o, { m0: 0, m1: 0, ph: (o.ph ?? .5) - .05 }));
    const gate = zz => this.lhall(L, cx, zz, { bays: 5, dbays: 2, bayW: gw / 5, dbayW: w * .8, colH: (o.colH || 3.6) + 1.4, roof: 'xieshan', brackets: 'simple', ph: .8, pm: 1.2, cw: false });
    gate(z1); if (o.rear) gate(z0);
  },
  // palace / precinct wall: rammed earth with a tiled coping, in pieces following the ground; gaps: [[u0, u1]] metres along the run
  pwall(L, x0, z0, x1, z1, o = {}, gaps = []) {
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len; let u = 0; gaps = gaps.slice();
    for (const c of this.canalX(x0, z0, x1, z1)) { const ow = c.w + 2.4; if (gaps.some(g => c.u + ow / 2 > g[0] && c.u - ow / 2 < g[1])) continue; gaps.push([c.u - ow / 2, c.u + ow / 2]); this.waterGate(L, x0 + ux * c.u, z0 + uz * c.u, Math.atan2(-uz, ux), ow, o); } // 水門 where a canal passes under
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[len, len]])) { if (g0 - u > .5) this._pw(L, x0 + ux * u, z0 + uz * u, x0 + ux * g0, z0 + uz * g0, o); u = Math.max(u, g1); }
  },
  // canal crossings of a wall run: [{u (metres along), w}]
  canalX(x0, z0, x1, z1) { CANAL.init(); const out = [], len = Math.hypot(x1 - x0, z1 - z0), dx = x1 - x0, dz = z1 - z0;
    for (const s of CANAL.segs) { const ex = s.bx - s.ax, ez = s.bz - s.az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((s.ax - x0) * ez - (s.az - z0) * ex) / den, v = ((s.ax - x0) * dz - (s.az - z0) * dx) / den; if (t <= 0 || t >= 1 || v < 0 || v > 1) continue; const u = t * len; if (!out.some(q => Math.abs(q.u - u) < 4)) out.push({ u, w: s.w }); }
    return out; },
  // 水門: the wall bridges the channel on a stone lintel, with a timber-and-iron grille (水柵) down into the water
  waterGate(L, x, z, yaw, ow, o) { const b = L.mb, h = o.h || 6, t = (o.t || 3) + .2, y = this.y(x, z), yo = 2.5, yt = y + h + .03;
    b.T(x, 0, z, 0, yaw, 0); b.s({ tex: o.tex || 'rammed_earth', col: o.col || [1.04, .98, .9] }).box(0, (y + yo + .3 + yt) / 2, 0, ow + .2, yt - y - yo - .3, t, { world: 3, skip: o.cap === false ? ['bot'] : ['bot', 'top'] });
    if (o.cap !== false) { const lv = ARCH.lod; ARCH.lod = 2; try { LOD.roof(b, ow + .2, t, yt, .3, 'gable', undefined, (ow + .2) / 2 - .02, 0); } finally { ARCH.lod = lv; } }
    b.s({ tex: 'stone', col: [.92, .9, .88] }).box(0, y + yo + .15, 0, ow + .3, .3, t + .14, { world: 2 }); // stone lintel
    b.s({ tex: 'dark_wood', col: [.7, .62, .55] }); const n = Math.max(3, Math.round(ow / .35)); for (let i = 1; i < n; i++) b.box(-ow / 2 + i * ow / n, y + yo / 2 - .7, 0, .1, yo + 1.4, .1, { skip: ['bot', 'top'] }); // 水柵 bars
    b.s({ tex: 'iron', col: [.5, .5, .55] }).box(0, y + .6, 0, ow, .08, .16).box(0, y + 1.6, 0, ow, .08, .16); b.pop(); b.s({ col: [1, 1, 1] }); },
  _pw(L, x0, z0, x1, z1, o) {
    let b = L.mb, h = o.h || 6, len0 = Math.hypot(x1 - x0, z1 - z0), e = .03 / len0, n = Math.max(1, Math.ceil(len0 / (o.seg || 120))), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    [x0, z0, x1, z1] = [x0 - (x1 - x0) * e, z0 - (z1 - z0) * e, x1 + (x1 - x0) * e, z1 + (z1 - z0) * e]; // 3 cm past each end: an abutting wall's face never shares this end's plane
    const len = len0 + .06, l = len / n;
    for (let k = 0; k < n; k++) { const t = (o.t || 3) + (k % 2) * .08, /* neighbouring pieces differ in thickness: no shared face planes */ a = k / n, c = (k + 1) / n, ax = lerp(x0, x1, a), az = lerp(z0, z1, a), cx = lerp(x0, x1, c), cz = lerp(z0, z1, c), mx = (ax + cx) / 2, mz = (az + cz) / 2;
      const yb = Math.min(this.y(ax, az), this.y(cx, cz), this.y(mx, mz)) - 1, yt = this.y(mx, mz) + h + (k % 2) * .05; b.T(mx, 0, mz, 0, yaw, 0);
      b.s({ tex: o.tex || 'rammed_earth', col: o.col || [1.04, .98, .9] }).box(0, (yb + yt) / 2, 0, l, yt - yb, t, { world: 3, skip: o.cap === false ? ['bot'] : ['bot', 'top'] });
      if (o.cap !== false) { const lv = ARCH.lod; ARCH.lod = 2; try { LOD.roof(b, l, t, yt, .3, 'gable', undefined, l / 2 - .02, 0); } finally { ARCH.lod = lv; } } // plain cap (no ridge box / thickness strips), ending flush with the piece: neighbours abut
      b.pop(); } b.s({ col: [1, 1, 1] });
  },
  // closed wall loop through pts with gates: gates = [{ i: side index, u: metres along, w }]
  pring(L, pts, o, gates = []) { for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length], t2 = (o.t || 3) / 2, len = Math.hypot(c[0] - a[0], c[1] - a[1]), ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
    // each side runs from corner to corner, shortened by half the thickness at its start so the corners overlap only inside the walls
    this.pwall(L, a[0] + ux * t2, a[1] + uz * t2, c[0] + ux * t2, c[1] + uz * t2, o, gates.filter(g => g.i === i).map(g => [g.u - g.w / 2 - t2, g.u + g.w / 2 - t2])); } },
  // open pavilion (亭): stone base, four red posts, a painted beam band, pyramid roof (massing)
  pav(L, x, z, s = 6, o = {}) { const b = L.mb, y = o.y ?? this.y(x, z), hp = .8, ch = s * .55 + 1.2;
    b.T(x, 0, z, 0, o.yaw || 0, 0); b.s({ tex: 'stone', col: [1, 1, 1] }).box(0, y + (hp - 1) / 2, 0, s + 1.6, hp + 1, s + 1.6, { skip: ['bot'], faces: { top: 'pave' } });
    b.s({ tex: 'vermilion' }); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(sx * (s / 2 - .3), y + hp + (ch - .5) / 2, sz * (s / 2 - .3), .4, ch - .5, .4, { skip: ['bot', 'top'] });
    b.s({ tex: 'paint_ochre' }).box(0, y + hp + ch - .25, 0, s + .1, .5, s + .1); LOD.roof(b, s, s, y + hp + ch, s * .28, o.roof || 'pyramid'); b.pop(); b.s({ col: [1, 1, 1] }); },
  // lake with an irregular outline (fan), a stone lip and an earth bank down/up to the ground; returns the outline radius fn
  lake(L, cx, cz, rx, rz, seed, o = {}) {
    const b = L.mb, N = o.n || 48, R = RNG(seed), ph = [R() * TAU, R() * TAU, R() * TAU], rad = a => 1 + .09 * Math.sin(2 * a + ph[0]) + .06 * Math.sin(3 * a + ph[1]) + .04 * Math.sin(5 * a + ph[2]);
    if (o.reach) { const [px, pz] = o.reach, u = (px - cx) / rx, v = (pz - cz) / rz, a = Math.atan2(v, u), k = Math.hypot(u, v) / (rad(a) * .96); if (k > 1) { rx *= k; rz *= k; } } // the canal feeding it ends inside
    const P = a => [cx + Math.cos(a) * rx * rad(a), cz + Math.sin(a) * rz * rad(a)]; let ymax = -1e9; for (let k = 0; k < N; k++) { const p = P(k / N * TAU); ymax = Math.max(ymax, this.y(p[0], p[1])); }
    const wy = ymax + .5, ring = [], lip = [], out = []; for (let k = 0; k < N; k++) { const a = k / N * TAU, p = P(a), q = [cx + Math.cos(a) * (rx * rad(a) + 6), cz + Math.sin(a) * (rz * rad(a) + 6)], q2 = [cx + Math.cos(a) * (rx * rad(a) + 14), cz + Math.sin(a) * (rz * rad(a) + 14)];
      ring.push([p[0], wy, p[1]]); lip.push([p[0], wy + .45, p[1]]); out.push([q[0], wy + .45, q[1]], [q2[0], this.y(q2[0], q2[1]) - .4, q2[1]]); }
    b.s({ tex: 'water', col: [.8, .9, .95], emi: .05 }); ARCH.poly(b, ring, [0, 1, 0], p => [p[0] / 6, p[2] / 6], [cx, wy, cz], true); b.s({ emi: 0 });
    for (let k = 0; k < N; k++) { const k1 = (k + 1) % N, A = ring[k], B = ring[k1], C = lip[k1], D = lip[k], o1 = out[2 * k], o2 = out[2 * k1], f1 = out[2 * k + 1], f2 = out[2 * k1 + 1];
      const nin = [cx - (A[0] + B[0]) / 2, 0, cz - (A[2] + B[2]) / 2]; b.s({ tex: 'stone', col: [.95, .93, .9] }); ARCH.poly(b, [[A[0], wy - .3, A[2]], [B[0], wy - .3, B[2]], C, D], nin, p => [(p[0] + p[2]) / 3, -p[1] / 3]); // revetment above the water
      ARCH.poly(b, [D, C, o2, o1], [0, 1, 0], p => [p[0] / 3, p[2] / 3]); // stone path on the bank
      b.s({ tex: 'grass_summer', col: [.9, .95, .85] }); const dn = v3cross(v3sub(f1, o1), v3sub(o2, o1)); ARCH.poly(b, [o1, o2, f2, f1], dn[1] < 0 ? [-dn[0], -dn[1], -dn[2]] : dn, p => [p[0] / 4, p[2] / 4]); } // sloping bank to the ground
    b.s({ col: [1, 1, 1] }); return { wy, at: a => P(a), r: a => rad(a), rx, rz };
  },
  // trees round a lake (just beyond its bank) and pavilions on the shore at the given angles
  shore(L, lk, x, z, a, c, n, off, R, seed, pavs = []) {
    a = lk.rx; c = lk.rz; // the lake's own radii (scaled when it had to reach a canal end)
    for (let i = 0; i < n; i++) { const t = (i + R() * .5) / n * TAU, rr = lk.r(t), e = off + R() * 8; this.tr(L, x + Math.cos(t) * (a * rr + e), z + Math.sin(t) * (c * rr + e), i % 4 ? 'willow' : 'peach', 1.15, seed + i); }
    for (const t of pavs) { const rr = lk.r(t); this.pav(L, x + Math.cos(t) * (a * rr + 22), z + Math.sin(t) * (c * rr + 22), 7, { roof: (seed + t * 10) % 2 < 1 ? 'pyramid' : 'xieshan' }); }
  },
  // walled courtyard group facing south: 門屋, front hall, main hall, rear hall, side wings, trees (plausible generic office / palace court)
  compound(L, r, R, o = {}) {
    const w = rw(r), d = rd(r), cx = rcx(r), wh = o.wallH || 4.2, t = 1.4, gw = Math.min(14, w * .3), odd = v => Math.max(3, Math.round(v) | 1);
    this.pwall(L, r.x0, r.z1 - t / 2, r.x1, r.z1 - t / 2, { h: wh, t }, [[cx - gw / 2 - r.x0, cx + gw / 2 - r.x0]]); this.pwall(L, r.x0, r.z0 + t / 2, r.x1, r.z0 + t / 2, { h: wh, t });
    for (const xx of [r.x0 + t / 2, r.x1 - t / 2]) this.pwall(L, xx, r.z0 + t, xx, r.z1 - t, { h: wh, t });
    this.lhall(L, cx, r.z1 - t / 2, { bays: 3, dbays: 2, bayW: gw / 3, dbayW: 3.2, colH: 3.6, roof: 'xieshan', brackets: 'simple', ph: .5, pm: 1.2, cw: false });
    const roofs = ['xieshan', 'hip', 'xieshan'], st = o.style || 'office';
    if (st === 'rows') { for (let z = r.z0 + 16; z < r.z1 - 18; z += 19) this.mass(L.mb, cx, z, 0, w - 14, 8, 3.6, 'gable'); }
    else { // office / palace court: the interior is a grid of 院 (each: hall at the back, a front hall or 門, side wings), the axis column larger
      const ix0 = r.x0 + t + 3, ix1 = r.x1 - t - 3, iz0 = r.z0 + t + 3, iz1 = r.z1 - t - 9, nu = Math.max(1, Math.round((ix1 - ix0) / 72)) | 1, nv = Math.max(1, Math.round((iz1 - iz0) / 78)), cw = (ix1 - ix0) / nu, cd = (iz1 - iz0) / nv;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const ux = ix0 + cw * (i + .5), uz0 = iz0 + cd * j, uz1 = uz0 + cd, axis = i === (nu >> 1), hw = Math.min(cw * (axis ? .62 : .55), axis && o.big ? 46 : 32), odd = v => Math.max(3, Math.round(v) | 1);
        { const nb = odd(hw / 4.8); this.lhall(L, ux, uz0 + cd * .36, { bays: nb, dbays: 3, bayW: hw / nb, dbayW: 4.4, colH: axis ? 5 : 4.4, roof: axis ? roofs[(R() * 3) | 0] : 'xieshan', brackets: axis && o.big ? 'full' : 'simple', ph: axis ? 1 : .6, cw: axis && !!o.big }); } // 堂
        if (cd > 55) { const nb = odd(hw * .75 / 4.4); this.lhall(L, ux, uz1 - 9, { bays: nb, dbays: 2, bayW: hw * .75 / nb, dbayW: 4, colH: 3.8, roof: R() < .5 ? 'xieshan' : 'gable', brackets: 'simple', ph: .5, cw: false }); } // front hall / 門
        if (cw > 46) for (const sd of [-1, 1]) this.mass(L.mb, ux + sd * (cw / 2 - 6.5), (uz0 + uz1) / 2 + 4, PI / 2, Math.min(cd * .5, 36), 7.5, 3.6, 'gable'); // 廂
        if (cd > 70 && R() < .6) this.mass(L.mb, ux, uz0 + 6, 0, Math.min(cw - 18, 40), 6.5, 3.2, 'gable'); // rear row
        this.tr(L, ux + (R() - .5) * cw * .4, uz1 - 20 - R() * 6, R() < .5 ? 'huai' : 'pine', 1.1, (R() * 1e6) | 0); } }
  },
  // fill an area with compounds on a jittered grid; skip(rect) rejects cells
  fillCompounds(L, A, cw, cd, R, skip, o = {}) {
    const nx = Math.max(1, Math.round(rw(A) / cw)), nz = Math.max(1, Math.round(rd(A) / cd)), gx = rw(A) / nx, gz = rd(A) / nz;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x0 = A.x0 + i * gx + 6, z0 = A.z0 + j * gz + 6, r = rect(x0, z0, x0 + gx - 12 - R() * gx * .15, z0 + gz - 12 - R() * gz * .1);
      if (rw(r) < 40 || rd(r) < 50 || (skip && skip(r))) continue; for (const q of this.clear(r)) this.compound(L, q, R, o); }
  },
  // great hall on terraces with ramps (stairs) in front
  axisHall(L, x, z, o) { const h = this.lhall(L, x, z, Object.assign({ lod: 1, brackets: 'full', roof: 'hip' }, o)); return h; },
  gt(L, x, z, o) { const y = o.y ?? this.y(x, z); return ARCH.gateTower(L, x, y, z, Object.assign({ d: 18, h: 9, passages: 1, pw: 6, ph: 6, open: true, tower: { bays: 5, dbays: 2, roof: 'hip' } }, o)); },

  // ---------------- 宮城: 太極宮 (centre), 掖庭宮 (west), 東宮 (east) ----------------
  landPalace(L) {
    const P = PLAN, pal = rect(...P.palace), R = RNG(1515), xT = 642, xE = (xT + pal.x1) / 2, xY = (pal.x0 - xT) / 2, zS = pal.z1, zN = pal.z0, T = 12;
    // outer wall (12 m base, 10 m) with gates; inner walls between the three palaces
    const sG = [[0, 60, '承天'], [-330, 30, '長樂'], [330, 30, '永安'], [xY, 26, '廣運'], [xE, 30, '重明']], nG = [[0, 40, '玄武'], [xY, 26, null], [xE, 30, '玄德']];
    this.pwall(L, pal.x0, zS - T / 2, pal.x1, zS - T / 2, { h: 10, t: T }, sG.map(([x, w]) => [x - w / 2 - pal.x0, x + w / 2 - pal.x0]));
    this.pwall(L, pal.x0, zN + T / 2, pal.x1, zN + T / 2, { h: 10, t: T }, nG.map(([x, w]) => [x - w / 2 - pal.x0, x + w / 2 - pal.x0]));
    for (const xx of [pal.x0 + T / 2, pal.x1 - T / 2]) this.pwall(L, xx, zN + T, xx, zS - T, { h: 10, t: T });
    for (const xx of [-xT, xT]) this.pwall(L, xx, zN + T, xx, zS - T, { h: 8, t: 6 });
    for (const [x, w, nm] of sG) this.gt(L, x, zS - T / 2, { w, h: 10, d: 20, passages: w > 45 ? 5 : w > 28 ? 3 : 1, pw: 5, tablet: nm === '承天' ? 'gt_承天門' : null, tower: { bays: w > 45 ? 9 : 5, dbays: 2, roof: 'hip' } });
    for (const [x, w] of nG) this.gt(L, x, zN + T / 2, { yaw: PI, w, h: 10, d: 20, passages: w > 35 ? 3 : 1, pw: 5, tower: { bays: w > 35 ? 7 : 5, dbays: 2, roof: 'hip' } });
    // 太極宮 axis: 嘉德門 in a cross wall, then the 太極殿 / 兩儀殿 / 甘露殿 courts (order: 長安志; spacing plausible)
    const zJ = zS - 90; this.pwall(L, -xT + 3, zJ, xT - 3, zJ, { h: 7, t: 4 }, [[xT - 3 - 18, xT - 3 + 18]]); this.lhall(L, 0, zJ, { lod: 1, bays: 7, dbays: 2, bayW: 5.2, dbayW: 5, colH: 5.5, roof: 'xieshan', brackets: 'simple', ph: 1, pm: 2.5 }); // 嘉德門
    this.court(L, 0, -3130, 420, 330, { gateW: 34, w: 6, colH: 4 }); // 太極門 + 廊
    this.axisHall(L, 0, -3165, { bays: 13, dbays: 5, bayW: 5.6, dbayW: 5.4, colH: 7.5, tiers: [[2.4, 14], [1.4, 5]] }); // 太極殿 (大朝)
    for (const sd of [-1, 1]) this.lhall(L, sd * 120, -3050, { bays: 3, dbays: 3, bayW: 5, dbayW: 5, colH: 7, roof: 'xieshan', brackets: 'simple', ph: 2, cw: false }); // 鐘 / 鼓 樓 (massing)
    this.court(L, 0, -3415, 320, 210, { gateW: 28, w: 5.5 }); this.axisHall(L, 0, -3430, { bays: 9, dbays: 4, bayW: 5.4, dbayW: 5.2, colH: 6.5, tiers: [[1.6, 8]] }); // 兩儀殿 (常朝)
    this.court(L, 0, -3625, 280, 170, { gateW: 26, w: 5 }); this.axisHall(L, 0, -3640, { bays: 9, dbays: 4, bayW: 5, dbayW: 5, colH: 6, tiers: [[1.2, 6]] }); // 甘露殿 (寢)
    for (const sd of [-1, 1]) this.lhall(L, sd * 100, -3640, { bays: 5, dbays: 3, bayW: 5, dbayW: 4.6, colH: 5, roof: 'xieshan', brackets: 'simple', cw: false }); // 神龍殿 / 安仁殿 (plausible)
    this.axisHall(L, 0, -3790, { bays: 7, dbays: 3, bayW: 5, dbayW: 5, colH: 5.5, roof: 'xieshan', tiers: [[1, 5]] }); // 延嘉殿
    // flanks of 太極宮: courts and offices (中書 / 門下 inside the palace, 內侍省 ...): plausible
    const axis = rect(-235, zN, 235, zS); this.fillCompounds(L, rect(-xT + 6, -3830, xT - 6, zJ - 6), 135, 140, R, r => r.x1 > axis.x0 && r.x0 < axis.x1, { big: true });
    // north garden: 四海池 (東 / 西 / 北海池, outlines plausible), pavilions, 凌煙閣, trees
    const lakes = [[-230, -4030, 120, 72], [240, -3995, 95, 62], [0, -4160, 170, 50]];
    lakes.forEach(([x, z, a, c], k) => { const lk = this.lake(L, x, z, a, c, 40 + k); this.shore(L, lk, x, z, a, c, 26, 18, R, k * 100, [.5, 3.6]); });
    ARCH.lou(L, -430, this.y(-430, -3880), -3880, { bays: 5, dbays: 3, bayW: 4.6, dbayW: 4.4, colH1: 5, colH2: 4.4, platform: 1.2, roof: 'xieshan' }); // 凌煙閣 (position plausible)
    this.axisHall(L, 0, -4275, { bays: 5, dbays: 2, bayW: 5, dbayW: 4.6, colH: 5, roof: 'xieshan', cw: false }); // a hall by 玄武門
    for (let k = 0; k < 160; k++) { const x = (R() - .5) * 2 * (xT - 20), z = zN + 25 + R() * 420; if (lakes.some(([lx, lz, a, c]) => ((x - lx) / (a + 30)) ** 2 + ((z - lz) / (c + 30)) ** 2 < 1)) continue; this.tr(L, x, z, ['pine', 'huai', 'peach', 'elm', 'cypress'][k % 5], 1.2, 7000 + k); }
    // 掖庭宮 (palace women, workshops; 太倉 north): rows of long halls in walled courts (plausible)
    this.fillCompounds(L, rect(pal.x0 + T + 4, zN + T + 4, -xT - 5, zS - T - 4), 150, 170, R, null, { style: 'rows' });
    // 東宮: 嘉德門, 顯德殿, 崇教殿, 麗正殿, 光天殿 on its own axis; garden and pond north (order: 長安志; spacing plausible)
    const zJ2 = zS - 80; this.pwall(L, xT + 3, zJ2, pal.x1 - T, zJ2, { h: 6, t: 4 }, [[xE - xT - 3 - 15, xE - xT - 3 + 15]]); this.lhall(L, xE, zJ2, { lod: 1, bays: 5, dbays: 2, bayW: 6, dbayW: 5, colH: 5, roof: 'xieshan', brackets: 'simple', ph: 1, pm: 2.5 });
    this.court(L, xE, -3080, 300, 230, { gateW: 26, w: 5 }); this.axisHall(L, xE, -3100, { bays: 9, dbays: 4, bayW: 5.2, dbayW: 5, colH: 6.2, tiers: [[1.5, 8]] }); // 顯德殿
    this.court(L, xE, -3320, 240, 170, { gateW: 24, w: 5 }); this.axisHall(L, xE, -3335, { bays: 7, dbays: 3, bayW: 5.2, dbayW: 5, colH: 5.6, roof: 'xieshan', tiers: [[1, 5]] }); // 崇教殿
    this.court(L, xE, -3505, 220, 150, { gateW: 22, w: 4.6 }); this.axisHall(L, xE, -3515, { bays: 7, dbays: 3, bayW: 5, dbayW: 4.6, colH: 5.4, roof: 'xieshan', tiers: [[1, 4]] }); // 麗正殿
    this.axisHall(L, xE, -3660, { bays: 7, dbays: 3, bayW: 5, dbayW: 4.6, colH: 5.2, roof: 'xieshan', cw: false }); // 光天殿
    this.fillCompounds(L, rect(xT + 6, -3760, pal.x1 - T - 4, zJ2 - 6), 110, 150, R, r => r.x1 > xE - 160 && r.x0 < xE + 160);
    { const lk = this.lake(L, xE, -3990, 110, 60, 50); this.shore(L, lk, xE, -3990, 110, 60, 24, 18, R, 9500, []); } for (let k = 0; k < 70; k++) { const x = xT + 30 + R() * (pal.x1 - xT - 60), z = zN + 30 + R() * 420; if (((x - xE) / 140) ** 2 + ((z + 3990) / 90) ** 2 < 1) continue; this.tr(L, x, z, ['willow', 'pine', 'huai', 'peach'][k % 4], 1.1, 9000 + k); }
    this.pav(L, xE + 175, -3985, 7);
  },

  // ---------------- 皇城: offices of the 百司 on a street grid, 太廟 (SE), 太社 (SW) ----------------
  landImperial(L) {
    const P = PLAN, imp = rect(...P.imperial), R = RNG(2468), T = 10, zH = imp.z0 + 200; // 橫街 in front of 承天門 (~200 m, plausible)
    const xH = (P.cols.W1[0] + P.cols.W2[1]) / 2, xA = (P.cols.E1[1] + P.cols.E2[0]) / 2; // 含光門 / 安上門 on the outer city's streets
    const sG = [[xH, 36, '含光'], [0, 50, '朱雀'], [xA, 36, '安上']], zG = [zH - 100, -1950]; // E: 延喜, 景風; W: 安福, 順義
    this.pwall(L, imp.x0, imp.z1 - T / 2, imp.x1, imp.z1 - T / 2, { h: 9, t: T }, sG.map(([x, w]) => [x - w / 2 - imp.x0, x + w / 2 - imp.x0]));
    for (const [xx, sd] of [[imp.x0 + T / 2, -1], [imp.x1 - T / 2, 1]]) { this.pwall(L, xx, imp.z0, xx, imp.z1 - T, { h: 9, t: T }, zG.map(z => [z - 16 - imp.z0, z + 16 - imp.z0])); for (const [k, z] of zG.entries()) this.gt(L, xx, z, { yaw: sd * PI / 2, w: 32, h: 9, d: 18, passages: 3, pw: 5, tablet: 'gt_' + (sd > 0 ? ['延喜', '景風'] : ['安福', '順義'])[k] + '門', tower: { bays: 5, dbays: 2, roof: 'hip' } }); }
    for (const [x, w, nm] of sG) this.gt(L, x, imp.z1 - T / 2, { w, h: 9, d: 20, passages: w > 45 ? 5 : 3, pw: 5, tablet: 'gt_' + nm + '門', tower: { bays: w > 45 ? 9 : 5, dbays: 2, roof: 'hip' } });
    // street grid: 5 N–S streets (承天門街 ~150 m on the axis, others ~30–40 m), 橫街 + 6 E–W streets (positions plausible)
    const xb = [[imp.x0 + T, -1062], [-1032, xH - 20], [xH + 20, -75], [75, xA - 20], [xA + 20, 1032], [1062, imp.x1 - T]], zTop = zH, zBot = imp.z1 - T - 30, rowD = (zBot - zTop - 5 * 30) / 6;
    const zb = Array.from({ length: 6 }, (_, j) => [zTop + j * (rowD + 30), zTop + j * (rowD + 30) + rowD]);
    const temple = rect(xA + 20, zb[4][0], imp.x1 - T, zb[5][1]), she = rect(imp.x0 + T, zb[4][0], xH - 20, zb[5][1]);
    for (const [x0, x1] of xb) for (const [z0, z1] of zb) { const blk = rect(x0, z0, x1, z1); if ((rcx(blk) > temple.x0 && rcz(blk) > temple.z0) || (rcx(blk) < she.x1 && rcz(blk) > she.z0)) continue;
      const n = Math.max(1, Math.round(rw(blk) / 175)), gw = rw(blk) / n; for (let k = 0; k < n; k++) { const r0 = rect(x0 + k * gw + 4, z0 + 4, x0 + (k + 1) * gw - 4, z1 - 4); for (const r of this.clear(r0)) this.compound(L, r, R, { big: rw(r) > 150 && R() < .5 }); } } // 省 / 寺 / 監 / 衛 (which office where: plausible)
    // 太廟: outer wall, inner court with gates on four sides, 太廟 hall (main) and 寢殿 behind, cypresses
    { const r = temple, c = [rcx(r), rcz(r)], ir = rect(c[0] - 150, c[1] - 140, c[0] + 150, c[1] + 140); this.pwall(L, r.x0, r.z1 - 1, r.x1, r.z1 - 1, { h: 5, t: 2 }, [[c[0] - 12 - r.x0, c[0] + 12 - r.x0]]); this.pwall(L, r.x0, r.z0 + 1, r.x1, r.z0 + 1, { h: 5, t: 2 }); for (const xx of [r.x0 + 1, r.x1 - 1]) this.pwall(L, xx, r.z0 + 2, xx, r.z1 - 2, { h: 5, t: 2 });
      this.lhall(L, c[0], r.z1 - 1, { bays: 5, dbays: 2, bayW: 4.8, dbayW: 4, colH: 4.5, roof: 'xieshan', brackets: 'simple', ph: .8, cw: false });
      this.pring(L, [[ir.x0, ir.z0], [ir.x1, ir.z0], [ir.x1, ir.z1], [ir.x0, ir.z1]], { h: 5.5, t: 2.4 }, [0, 1, 2, 3].map(i => ({ i, u: (i % 2 ? rd(ir) : rw(ir)) / 2, w: 22 })));
      for (const [x, z, yaw] of [[c[0], ir.z1, 0], [c[0], ir.z0, PI], [ir.x0, c[1], -PI / 2], [ir.x1, c[1], PI / 2]]) this.lhall(L, x, z, { yaw, bays: 5, dbays: 2, bayW: 4.4, dbayW: 4, colH: 4.6, roof: 'xieshan', brackets: 'simple', ph: .8, cw: false });
      this.axisHall(L, c[0], c[1] + 10, { bays: 11, dbays: 4, bayW: 5.6, dbayW: 5.4, colH: 6.8, roof: 'hip', tiers: [[1.8, 10]] }); this.axisHall(L, c[0], c[1] - 80, { bays: 9, dbays: 3, bayW: 5, dbayW: 5, colH: 5.6, roof: 'hip', tiers: [[1, 5]] });
      for (let k = 0; k < 150; k++) { const x = r.x0 + 15 + R() * (rw(r) - 30), z = r.z0 + 15 + R() * (rd(r) - 30); if (x > ir.x0 - 10 && x < ir.x1 + 10 && z > ir.z0 - 10 && z < ir.z1 + 10) continue; this.tr(L, x, z, k % 3 ? 'cypress' : 'pine', 1.2, 11000 + k); } }
    // 太社: walled square precinct, low inner wall with four gates round the five-coloured altar (社壇), 社樹 and pines
    { const r = she, c = [rcx(r), rcz(r)], b = L.mb, y = this.y(c[0], c[1]); this.pring(L, [[r.x0 + 1, r.z0 + 1], [r.x1 - 1, r.z0 + 1], [r.x1 - 1, r.z1 - 1], [r.x0 + 1, r.z1 - 1]], { h: 5, t: 2 }, [{ i: 2, u: rw(r) / 2, w: 24 }]);
      this.lhall(L, c[0], r.z1 - 1, { bays: 5, dbays: 2, bayW: 4.8, dbayW: 4, colH: 4.5, roof: 'xieshan', brackets: 'simple', ph: .8, cw: false });
      const s = 70; this.pring(L, [[c[0] - s, c[1] - s], [c[0] + s, c[1] - s], [c[0] + s, c[1] + s], [c[0] - s, c[1] + s]], { h: 2.6, t: 1.2 }, [0, 1, 2, 3].map(i => ({ i, u: s, w: 10 })));
      for (const [x, z, yaw] of [[c[0], c[1] + s, 0], [c[0], c[1] - s, PI], [c[0] - s, c[1], -PI / 2], [c[0] + s, c[1], PI / 2]]) this.lhall(L, x, z, { yaw, bays: 3, dbays: 1, bayW: 3.4, dbayW: 3, colH: 3.6, roof: 'xieshan', brackets: 'none', ph: .4, cw: false });
      const a = 12.5, h = 1.6, yt = y + h; b.s({ tex: 'rammed_earth', col: [1.1, 1, .8] }).box(c[0], y + (h - 1) / 2, c[1], 2 * a, h + 1, 2 * a, { skip: ['bot', 'top'], world: 2 });
      const Q = (p, col) => { b.s({ tex: 'rammed_earth', col }); ARCH.poly(b, p.map(q => [c[0] + q[0], yt, c[1] + q[1]]), [0, 1, 0], q => [q[0] / 3, q[2] / 3]); }, ia = 5; // five soils: centre yellow, E green, S red, W white, N black
      Q([[-ia, -ia], [ia, -ia], [ia, ia], [-ia, ia]], [1.25, 1.05, .45]); Q([[ia, -ia], [a, -a], [a, a], [ia, ia]], [.55, .8, .6]); Q([[-ia, ia], [ia, ia], [a, a], [-a, a]], [1.2, .5, .38]); Q([[-a, -a], [-ia, -ia], [-ia, ia], [-a, a]], [1.35, 1.32, 1.25]); Q([[-a, -a], [a, -a], [ia, -ia], [-ia, -ia]], [.35, .33, .32]);
      b.s({ col: [1, 1, 1] }); this.tr(L, c[0] + 22, c[1] - 18, 'huai', 1.6, 777); // 社樹
      for (let k = 0; k < 120; k++) { const x = r.x0 + 15 + R() * (rw(r) - 30), z = r.z0 + 15 + R() * (rd(r) - 30); if (Math.abs(x - c[0]) < s + 10 && Math.abs(z - c[1]) < s + 10) continue; this.tr(L, x, z, k % 2 ? 'pine' : 'cypress', 1.2, 12000 + k); } }
    // 槐 rows along the streets and the south edge of 橫街
    const row = (x0, z0, x1, z1, sp, sd) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / sp); for (let k = 0; k <= n; k++) { if (R() < .1) continue; const t = k / n; this.tr(L, lerp(x0, x1, t), lerp(z0, z1, t), 'huai', 1.15, (sd * 7919 + k) | 0); } };
    for (let j = 0; j < 6; j++) { const zs = j ? zb[j][0] - 15 : zTop - 19; for (const dz of [-11, 11]) if (j || dz < 0) row(imp.x0 + 25, zs + dz, imp.x1 - 25, zs + dz, 40, j * 2 + (dz > 0)); }
    for (const xs of [-1047, xH, 0, xA, 1047]) { const hw = xs === 0 ? 70 : 13; for (const dx of [-hw, hw]) row(xs + dx, zTop + 10, xs + dx, zBot, 40, 100 + xs + dx); }
  },

  // ---------------- 大明宮 on 龍首原 ----------------
  landDaming(L) {
    const P = PLAN, d = rect(...P.daming), cx = (P.cols.E3[0] + P.cols.E3[1]) / 2, zf = d.z1, R = RNG(815), T = 10;
    // walls: trapezoid narrowing to the north (S 1674, N ~1135 m; the east wall's jog simplified to one diagonal — approximate)
    const poly = [[d.x0, zf], [d.x1, zf], [d.x1, -5450], [d.x0 + 1135, -6000], [d.x0 + 1135, d.z0], [d.x0, d.z0]];
    const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], q = poly[j]; if ((a[1] > z) !== (q[1] > z) && x < (q[0] - a[0]) * (z - a[1]) / (q[1] - a[1]) + a[0]) c = !c; } return c; };
    const h2 = T / 2, pts = [[d.x0 + h2, zf - h2], [d.x1 - h2, zf - h2], [d.x1 - h2, -5450], [d.x0 + 1135 - h2, -6000], [d.x0 + 1135 - h2, d.z0 + h2], [d.x0 + h2, d.z0 + h2]];
    const gates = [{ i: 0, u: cx - pts[0][0], w: 72 }, { i: 0, u: cx - 330 - pts[0][0], w: 30 }, { i: 0, u: cx + 330 - pts[0][0], w: 30 }, { i: 1, u: 400, w: 30 }, { i: 4, u: pts[4][0] - 1950, w: 34 }, { i: 5, u: -5400 - pts[5][1], w: 30 }];
    this.pring(L, pts, { h: 10, t: T }, gates);
    this.gt(L, cx, pts[0][1], { tablet: 'gt_丹鳳門', w: 70, d: 22, h: 9, passages: 5, pw: 8, ph: 7, tower: { bays: 11, dbays: 2, roof: 'hip' } });
    for (const sd of [-1, 1]) this.gt(L, cx + sd * 330, pts[0][1], { w: 30, h: 9, passages: 3, pw: 5, tablet: sd < 0 ? 'gt_建福門' : 'gt_望仙門' }); // 建福門 (officials' gate; 待漏院 outside) / 望仙門
    this.gt(L, pts[1][0], pts[1][1] - 400, { yaw: PI / 2, w: 30, h: 9 }); this.gt(L, 1950, pts[4][1], { yaw: PI, w: 34, h: 9, passages: 3, pw: 5 }); this.gt(L, pts[5][0], -5400, { yaw: -PI / 2, w: 30, h: 9 }); // 左銀臺門, 玄武門, 右銀臺門
    // 含元殿 on its three-tier terrace (front ~13 m above the plaza), 翔鸞閣 (E) / 棲鳳閣 (W) on stepped 闕 bases, 飛廊, 龍尾道
    const hz = zf - 610, yF = this.y(cx, hz + 70), Hh = { bays: 13, dbays: 6, bayW: 5.8, dbayW: 5.5, colH: 8 }, pm = 8 * .4 + .5, W = 13 * 5.8, D = 6 * 5.5;
    const tiers = [[6, [64, 34]], [4.5, [40, 22]], [2.5, [12, 8]]], tz = k => hz + D / 2 + pm + tiers[k][1][1]; // front face z of tier k
    this.axisHall(L, cx, hz, Object.assign({ y: yF, tiers }, Hh));
    for (const sd of [-1, 1]) { this.ramp(L.mb, cx + sd * 30, tz(0), tz(0) + 75, 10, yF + 6, this.y(cx + sd * 30, tz(0) + 75)); this.ramp(L.mb, cx + sd * 30, tz(1), tz(1) + 13, 8, yF + 10.5, yF + 6); this.ramp(L.mb, cx + sd * 30, tz(2), tz(2) + 7, 6, yF + 13, yF + 10.5); }
    for (const sd of [-1, 1]) { const qx = cx + sd * 125, qz = hz + 100, b = L.mb, yq = this.y(qx, qz);
      const steps = [[0, 32, 26, 15], [sd * 25, 22, 20, 12], [sd * 41, 14, 15, 9]]; b.s({ tex: 'brick', col: [1, .97, .92] }); for (const [dx, w, dd, h] of steps) b.box(qx + dx, yq + (h - 1) / 2, qz, w, h + 1, dd, { world: 3, skip: ['bot'], faces: { top: 'pave' } }); // 三出闕
      ARCH.lou(L, qx, yq + 15, qz, { bays: 5, dbays: 3, bayW: 5, dbayW: 4.4, colH1: 5, colH2: 4.5, platform: .3, roof: 'hip' }); this.lhall(L, qx + sd * 25, qz, { y: yq + 12, bays: 3, dbays: 2, bayW: 4.4, dbayW: 4.6, colH: 4.4, roof: 'hip', brackets: 'simple', ph: .3, pm: .8, cw: false });
      // 飛廊: raised corridors from the 閣 to the terrace (on rammed-earth walls)
      const zA = hz + 20, yW = yF + 6; b.s({ tex: 'rammed_earth', col: [1.04, .98, .9] }); b.box(qx, (yq - 1 + yW) / 2, (zA - 4 + qz - 13) / 2, 8, yW - yq + 1, qz - 13 - zA + 4, { world: 3, skip: ['bot', 'top'] });
      const xe = cx + sd * (W / 2 + pm + 64), xa = Math.min(xe, qx - 4 * sd) , xb = Math.max(xe, qx - 4 * sd); b.box((xa + xb) / 2 - sd * 0, (this.y((xa + xb) / 2, zA) - 1 + yW) / 2, zA, xb - xa, yW - this.y((xa + xb) / 2, zA) + 1, 8, { world: 3, skip: ['bot', 'top'] });
      b.s({ tex: 'pave' }).box(qx, yW - .1, (zA - 4 + qz - 13) / 2, 8.1, .2, qz - 13 - zA + 4.1, { skip: ['bot'] }); b.box((xa + xb) / 2, yW - .15, zA, xb - xa - .1, .2, 8.2, { skip: ['bot'] }); b.s({ col: [1, 1, 1] });
      this.corr(L, qx, qz - 13 - .5, qx, zA + 2.9, { y: yW, w: 4.6, colH: 3.4, ph: .3, m0: 0, m1: 0 }); this.corr(L, qx - sd * 4.2, zA, xe - sd * .5, zA, { y: yW, w: 4.6, colH: 3.4, ph: .25, m0: 0, m1: 0 }); }
    // inner palace wall across behind 含元殿 (宣政門 line), 宣政殿 and 紫宸殿 courts, 中書 / 門下省 flanking (positions plausible)
    const zX = hz - 150; this.pwall(L, pts[0][0] + T / 2, zX, cx - 20, zX, { h: 7, t: 4 }); this.pwall(L, cx + 20, zX, d.x1 - T, zX, { h: 7, t: 4 }); this.lhall(L, cx, zX, { lod: 1, bays: 7, dbays: 2, bayW: 5.4, dbayW: 5, colH: 5.6, roof: 'xieshan', brackets: 'simple', ph: 1, pm: 2.5 }); // 宣政門
    this.court(L, cx, -5225, 320, 230, { gateW: 30, w: 5.5, colH: 3.8 }); this.axisHall(L, cx, -5245, { bays: 11, dbays: 5, bayW: 5.4, dbayW: 5.2, colH: 7, tiers: [[2, 8]] }); // 宣政殿 (常朝)
    for (const sd of [-1, 1]) this.compound(L, rect(cx + sd * 230 - 55, -5190, cx + sd * 230 + 55, -5096), R, { big: true }); // 門下省 (E) / 中書省 (W)
    this.court(L, cx, -5440, 250, 170, { gateW: 26, w: 5, rear: true }); this.axisHall(L, cx, -5450, { bays: 9, dbays: 4, bayW: 5.2, dbayW: 5, colH: 6.4, tiers: [[1.4, 6]] }); // 紫宸殿 (內朝)
    this.axisHall(L, cx, -5620, { bays: 9, dbays: 4, bayW: 5, dbayW: 5, colH: 6, roof: 'xieshan', tiers: [[1, 5]] }); // 蓬萊殿
    this.axisHall(L, cx - 40, -5728, { bays: 7, dbays: 3, bayW: 5, dbayW: 4.6, colH: 5.4, roof: 'xieshan', cw: false }); // 含涼殿 on the lake's south shore
    // 太液池 (west pool with 蓬萊山 island, small east pool), shore pavilions, willows
    const LK = [[1990, -5965, 250, 165, 61], [2300, -5815, 75, 50, 62]], lks = LK.map(([x, z, a, c, s], k) => { const lk = this.lake(L, x, z, a, c, s, k ? { reach: [2350, -5800] } : {}); this.shore(L, lk, x, z, a, c, Math.round(a / 4), 18, R, s * 100, k ? [2.2] : [.3, 1.9, 3.4, 4.9]); return lk; });
    { const b = L.mb, ix = 2005, iz = -5965, wy = lks[0].wy; b.s({ tex: 'grass_summer', col: [.85, .95, .8] }).T(ix, 0, iz).lathe([[48, wy - 1], [44, wy + 2], [32, wy + 7], [16, wy + 12], [0, wy + 14]], { seg: 14, uvs: [8, 3] }).pop(); this.pav(L, ix, iz, 8, { y: wy + 13.6 }); for (let k = 0; k < 12; k++) { const t = k / 12 * TAU; TREES.place(L, ix + Math.cos(t) * 30, wy + 7, iz + Math.sin(t) * 30, 'pine', 1, 6200 + k); } } // 蓬萊山
    // 麟德殿 (NW): three halls joined front to back on a two-tier platform, 郁儀樓 / 結鄰樓 on the flanks (after the excavated plan)
    { const lx = d.x0 + 170, lz = -5700, y = this.y(lx, lz); const b = L.mb; b.s({ tex: 'brick', col: [1, .97, .92] }).box(lx, y + 1, lz, 80, 4, 135, { world: 3, skip: ['bot'], faces: { top: 'pave' } }).box(lx, y + 3.5, lz, 66, 2, 108, { world: 3, skip: ['bot'], faces: { top: 'pave' } });
      [[26, 4, 1], [-2, 5, 1.1], [-30, 3, 1.2]].forEach(([dz, nd, ph], k) => this.lhall(L, lx, lz + dz, { lod: 1, y: y + 4.5, bays: 11, dbays: nd, bayW: 5.2, dbayW: 5.2, colH: 6 - k * .3, roof: k === 1 ? 'hip' : 'xieshan', brackets: 'full', ph, pm: 1.2 + k * .1, cw: k === 1 }));
      for (const sd of [-1, 1]) { b.s({ tex: 'brick', col: [1, .97, .92] }).box(lx + sd * 52, y + 2, lz - 2, 20, 6, 20, { world: 3, skip: ['bot'], faces: { top: 'pave' } }); ARCH.lou(L, lx + sd * 52, y + 5, lz - 2, { bays: 3, dbays: 3, bayW: 4.4, dbayW: 4.4, colH1: 4.6, colH2: 4, platform: 1, roof: 'xieshan' }); } }
    // minor palaces, offices and courts (plausible): jittered grid inside the walls, clear of the axis, the plaza, the lakes and 麟德殿
    const keep = [rect(cx - 210, -5560, cx + 210, zX + 10), rect(cx - 300, -5200, cx + 300, zX + 10), rect(cx - 90, -5800, cx + 90, -5560), rect(d.x0 + 100, -5800, d.x0 + 250, -5600), rect(1700, -6200, 2400, -5760), rect(cx - 200, hz - 80, cx + 200, zf)];
    this.fillCompounds(L, rect(d.x0 + T, d.z0 + T, d.x1 - T, zX - 8), 150, 150, R, r => keep.some(k => r.x1 > k.x0 && r.x0 < k.x1 && r.z1 > k.z0 && r.z0 < k.z1) || ![[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].every(([x, z]) => inside(x, z)));
    for (const sd of [-1, 1]) this.compound(L, rect(cx + sd * 300 - 60, hz + 60, cx + sd * 300 + 60, hz + 170), R); // 左右金吾仗院 in front of 含元殿 (plausible)
    this.fillCompounds(L, rect(d.x0 + T + 4, zX + 10, d.x1 - T - 4, zf - 40), 160, 150, R, r => r.x1 > cx - 380 && r.x0 < cx + 380); // offices and courts west / east of the plaza (plausible)
    for (let k = 0; k < 260; k++) { const x = d.x0 + 30 + R() * (rw(d) - 60), z = d.z0 + 30 + R() * (zX - d.z0 - 60); if (!inside(x, z) || keep.slice(0, 4).some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1)) continue; if (LK.some(([lx, lz, a, c]) => ((x - lx) / (a + 25)) ** 2 + ((z - lz) / (c + 25)) ** 2 < 1)) continue; this.tr(L, x, z, ['pine', 'huai', 'elm', 'peach', 'cypress'][k % 5], 1.2, 13000 + k); }
  },

  // ---------------- 興慶宮 (南內) beside the 春明門 avenue ----------------
  landXingqing(L) {
    const wd = CITY.all.find(w => w.kind === 'palace'); if (!wd) return; const r = wd.r, R = RNG(714), T = 3, zm = -1470, ax = 4560, b = L.mb;
    const xc = z => { const c = CANAL.near(4310, z); return c ? c.s.ax + (c.s.bx - c.s.ax) * clamp((z - c.s.az) / (c.s.bz - c.s.az), 0, 1) : 4310; }; // the 龍首渠 branch running south to 龍池
    // walls 7 m with tiled copings; south edge (on the avenue) at LOD1. Gates: 通陽門 (S), 興慶門 / 金明門 (W), 躍龍門 (N); 勤政務本樓 sits in the
    // south wall near the SW corner facing the avenue, 花萼相輝樓 in the west wall facing west (after the excavated plan, approximate)
    const qx = r.x0 + 175, hx = r.z1 - 150, BW = 34, BD = 24;
    // the two towers on brick bases flush with the wall faces (LOD0: they are 60–150 m from the avenue)
    const tower = (x, z, yaw, bw, bd) => { const y = this.y(x, z); b.T(x, 0, z, 0, yaw, 0); b.s({ tex: 'brick', col: [1, .97, .92] }).box(0, y + 3.25, 0, bw, 8.5, bd, { world: 3, skip: ['bot'], faces: { top: 'pave' } }); b.pop();
      const prev = ARCH.lod; ARCH.lod = 0; try { ARCH.lou(L, x, y + 7.5, z, { yaw, bays: 5, dbays: 3, bayW: 5.2, dbayW: 4.8, colH1: 5.4, colH2: 4.8, platform: .4, roof: 'xieshan', brackets: 'full', seed: 9 }); } finally { ARCH.lod = prev; } };
    if (this._part === 'xqtowers') { tower(qx, r.z1 - BD / 2 + .06, 0, BW, BD); tower(r.x0 + BD / 2 - .06, hx, -PI / 2, BW, BD); return; } // 勤政務本樓 (base 6 cm proud of the wall face), 花萼相輝樓
    LOD.run(L, L1 => { this.pwall(L1, r.x0, r.z1 - T / 2, r.x1, r.z1 - T / 2, { h: 7, t: T, seg: 60 }, [[qx - BW / 2 - r.x0, qx + BW / 2 - r.x0], [4330 - 16 - r.x0, 4330 + 16 - r.x0]]);
      this.gt(L1, 4330, r.z1 - T / 2, { w: 30, h: 7.2, d: 14, passages: 3, pw: 4.6, ph: 5, tablet: 'gt_通陽門', tower: { bays: 5, dbays: 2, roof: 'hip' } }); }, 1);
    const xn = xc(r.z0); this.pwall(L, r.x0, r.z0 + T / 2, r.x1, r.z0 + T / 2, { h: 7, t: T }, [[ax - 15 - r.x0, ax + 15 - r.x0]]); this.gt(L, ax, r.z0 + T / 2, { yaw: PI, w: 28, h: 7.2, d: 14, passages: 1, pw: 5, ph: 5 }); // 躍龍門; the canal passes under the wall beside it
    this.pwall(L, r.x1 - T / 2, r.z0 + T, r.x1 - T / 2, r.z1 - T, { h: 7, t: T }); // east wall (the 夾城 to 大明宮 / 曲江 ran along the city wall beyond it)
    LOD.run(L, L1 => { this.pwall(L1, r.x0 + T / 2, r.z0 + T, r.x0 + T / 2, r.z1 - T, { h: 7, t: T, seg: 60 }, [[hx - BW / 2 - r.z0 - T, hx + BW / 2 - r.z0 - T], [-1600 - 15 - r.z0 - T, -1600 + 15 - r.z0 - T]]);
      this.gt(L1, r.x0 + T / 2, -1600, { yaw: -PI / 2, w: 28, h: 7.2, d: 14, passages: 3, pw: 4.6, ph: 5, tablet: 'gt_興慶門' }); }, 1);
    // the cross wall between the northern palace and the 龍池 garden, with 瀛洲門 (and a gap where the canal runs through)
    const xm = xc(zm); this.pwall(L, r.x0 + T, zm, r.x1 - T, zm, { h: 6, t: 2.6 }, [[ax - 14 - r.x0 - T, ax + 14 - r.x0 - T]]); this.lhall(L, ax, zm, { bays: 5, dbays: 2, bayW: 5.4, dbayW: 4, colH: 4.6, roof: 'xieshan', brackets: 'simple', ph: .8, pm: 1.4, cw: false });
    // north: 興慶殿 court, 大同殿 (W) and 南薰殿 (E) groups, other courts (plausible), all clear of the canal
    this.court(L, ax, -1655, 220, 180, { gateW: 26, w: 5 }); this.axisHall(L, ax, -1665, { bays: 9, dbays: 4, bayW: 5.2, dbayW: 5, colH: 6.2, tiers: [[1.4, 6]] });
    this.fillCompounds(L, rect(r.x0 + T + 4, r.z0 + T + 4, r.x1 - T - 4, zm - 4), 125, 150, R, q => q.x1 > ax - 128 && q.x0 < ax + 128, { big: true }); // 大同殿, 南薰殿 and the other courts (plausible)
    // south: 龍池 (an elongated lake fed by the canal from the north), 龍堂 on its north shore, 沉香亭, two 樓 by the south wall (LOD1), willows
    const lk = this.lake(L, 4330, -1272, 350, 128, 77, { reach: [xc(-1420), -1420] }); LOD.run(L, L1 => {
      this.lhall(L1, ax, -1452, { bays: 5, dbays: 3, bayW: 5, dbayW: 4, colH: 5, roof: 'xieshan', brackets: 'full', ph: 1.2 }); this.pav(L1, 4700, -1360, 8); this.pav(L1, 3930, -1400, 7, { roof: 'xieshan' }); // 龍堂, 沉香亭, a lakeside pavilion
      for (const [x, nb] of [[4560, 7], [4120, 5]]) ARCH.lou(L1, x, this.y(x, -1046), -1046, { bays: nb, dbays: 2, bayW: 4.8, dbayW: 4.4, colH1: 5.6, colH2: 4.8, platform: 1.5, roof: 'xieshan' }); // lakeside 樓 by the south wall (plausible)
      for (let i = 0; i < 80; i++) { const t = (i + R() * .5) / 80 * TAU, rr = lk.r(t), x = 4330 + Math.cos(t) * (lk.rx * rr + 20 + R() * 10), z = -1272 + Math.sin(t) * (lk.rz * rr + 20 + R() * 10); if (z > -1066 && (Math.abs(x - 4560) < 26 || Math.abs(x - 4120) < 20)) continue; if (z < -1430 && Math.abs(x - ax) < 22) continue; if (z > -1000 || z < zm + 4) continue; this.tr(L1, x, z, i % 5 ? 'willow' : i % 10 ? 'peach' : 'poplar', 1.35, 14000 + i); }
      this._tl = 0; for (let x = r.x0 + 40; x < r.x1 - 30; x += 22 + R() * 10) { if (Math.abs(x - qx) < 30 || Math.abs(x - 4330) < 24 || Math.abs(x - 4560) < 26 || Math.abs(x - 4120) < 20) continue; this.tr(L1, x, r.z1 - 14 - R() * 6, ['poplar', 'huai', 'elm', 'poplar', 'willow'][(R() * 5) | 0], 1.6, 15000 + (x | 0)); } this._tl = 1; }, 1); // tall full-detail crowns over the wall, seen from the avenue
    // the 龍池 garden: groves, bamboo, more pavilions (plausible)
    for (const t of [1.2, 2.5, 4.2, 5.6]) { const rr = lk.r(t); this.pav(L, 4330 + Math.cos(t) * (lk.rx * rr + 34), -1272 + Math.sin(t) * (lk.rz * rr + 34), 6, { roof: t > 3 ? 'xieshan' : 'pyramid' }); }
    const gc = Array.from({ length: 70 }, () => [r.x0 + 30 + R() * (rw(r) - 60), zm + 12 + R() * (r.z1 - 30 - zm - 12)]); // grove centres: trees in clumps
    for (let k = 0; k < 520; k++) { const g = gc[k % gc.length], x = g[0] + (R() - .5) * 34, z = g[1] + (R() - .5) * 34, u = (x - 4330) / (lk.rx * 1.25 + 30), v = (z + 1272) / (lk.rz * 1.25 + 30); if (u * u + v * v < 1) continue; if ((Math.abs(x - 4560) < 40 || Math.abs(x - 4120) < 34) && z > -1070) continue; if (Math.abs(x - qx) < 40 && z > -1030) continue; if (x < r.x0 + 40 && Math.abs(z - hx) < 30) continue;
      this.tr(L, x, z, ['pine', 'peach', 'huai', 'bamboo', 'willow', 'apricot'][k % 6], 1.15, 15500 + k); }
    for (let k = 0; k < 90; k++) { const x = r.x0 + 20 + R() * (rw(r) - 40), z = r.z0 + 20 + R() * (zm - r.z0 - 40); if (Math.abs(x - ax) < 120 && z > -1750) continue; if ((x < 4255 || x > 4695) && z > -1795 && z < -1495) continue; this.tr(L, x, z, ['huai', 'pine', 'peach', 'elm'][k % 4], 1.15, 16000 + k); }
  },

  // ---------------- 曲江池, 紫雲樓, 芙蓉園 (SE corner) ----------------
  landQujiang(L) {
    const parks = CITY.all.filter(w => w.kind === 'park'); if (!parks.length) return; const R = RNG(316), x0 = Math.min(...parks.map(w => w.r.x0)), x1 = Math.max(...parks.map(w => w.r.x1)), z0 = Math.min(...parks.map(w => w.r.z0)), z1 = Math.max(...parks.map(w => w.r.z1));
    // 曲江池: an irregular lake running N–S (~0.5 km² here; outline plausible), 杏園 apricots to the west, willows on the banks
    const lx = 4190, lz = 3540, lk = this.lake(L, lx, lz, 280, 270, 99, { n: 64, reach: [4300, 3800] }); this.shore(L, lk, lx, lz, 280, 270, 110, 20, R, 17000, [.1, 3.0, 4.6]);
    for (let k = 0; k < 70; k++) this.tr(L, x0 + 10 + R() * 45, z0 + 30 + R() * 420, 'willow', 1.05, 17500 + k); // west bank (the 杏園 itself is a landmark lot in 通善坊: engine/landmarks.js)
    // 芙蓉園: walled garden S of the lake, 紫雲樓 in its north wall over the water, halls, pond, pavilions, trees
    const fr = rect(x0 + 40, lz + 380, x1 - 20, z1 - 20), zx = 4190; this.pwall(L, fr.x0, fr.z0 + 1.5, fr.x1, fr.z0 + 1.5, { h: 5, t: 3 }, [[zx - 20 - fr.x0, zx + 20 - fr.x0]]); this.pwall(L, fr.x0, fr.z1 - 1.5, fr.x1, fr.z1 - 1.5, { h: 5, t: 3 });
    for (const xx of [fr.x0 + 1.5, fr.x1 - 1.5]) this.pwall(L, xx, fr.z0 + 3, xx, fr.z1 - 3, { h: 5, t: 3 });
    { const y = this.y(zx, fr.z0), b = L.mb; b.s({ tex: 'brick', col: [1, .97, .92] }).box(zx, y + 2.75, fr.z0 + 1.5, 40, 7.5, 22, { world: 3, skip: ['bot'], faces: { top: 'pave' } }); ARCH.lou(L, zx, y + 6.5, fr.z0 + 1.5, { yaw: PI, bays: 5, dbays: 3, bayW: 5, dbayW: 4.6, colH1: 5, colH2: 4.6, platform: .3, roof: 'xieshan' }); } // 紫雲樓 faces the lake
    this.lake(L, rcx(fr) + 120, rcz(fr) + 20, 120, 60, 98); this.axisHall(L, rcx(fr) - 200, rcz(fr), { bays: 7, dbays: 3, bayW: 5, dbayW: 4.6, colH: 5.2, roof: 'xieshan', tiers: [[1, 4]] }); this.lhall(L, rcx(fr) + 230, fr.z1 - 50, { bays: 5, dbays: 3, bayW: 5, dbayW: 4.4, colH: 4.8, roof: 'xieshan', brackets: 'simple', cw: false });
    for (const [x, z] of [[rcx(fr) - 80, rcz(fr) + 90], [rcx(fr) + 120, rcz(fr) - 85], [rcx(fr) - 330, fr.z0 + 60]]) this.pav(L, x, z, 7);
    // garden halls and pavilions through the park, groves in clumps (plausible)
    const spots = [[fr.x0 + 90, fr.z0 + 90], [fr.x0 + 140, fr.z1 - 70], [rcx(fr) + 40, fr.z1 - 60], [fr.x1 - 90, rcz(fr) - 40], [fr.x1 - 120, fr.z1 - 60], [rcx(fr) - 120, fr.z0 + 70]];
    spots.forEach(([x, z], k) => k % 2 ? this.pav(L, x, z, 8, { roof: 'xieshan' }) : this.lhall(L, x, z, { bays: 5, dbays: 2, bayW: 4.6, dbayW: 4.4, colH: 4.4, roof: 'xieshan', brackets: 'simple', ph: .9, cw: false }));
    const busy = (x, z) => ((x - rcx(fr) - 120) / 145) ** 2 + ((z - rcz(fr) - 20) / 85) ** 2 < 1 || spots.some(([a, c]) => Math.abs(x - a) < 20 && Math.abs(z - c) < 16) || (Math.abs(x - zx) < 30 && z < fr.z0 + 20) || Math.abs(x - rcx(fr) + 200) < 32 && Math.abs(z - rcz(fr)) < 22;
    const gc = Array.from({ length: 45 }, () => [fr.x0 + 25 + R() * (rw(fr) - 50), fr.z0 + 25 + R() * (rd(fr) - 50)]);
    for (let k = 0; k < 420; k++) { const g = gc[k % gc.length], x = clamp(g[0] + (R() - .5) * 40, fr.x0 + 8, fr.x1 - 8), z = clamp(g[1] + (R() - .5) * 40, fr.z0 + 8, fr.z1 - 8); if (busy(x, z)) continue; this.tr(L, x, z, ['peach', 'willow', 'pine', 'apricot', 'bamboo', 'huai'][k % 6], 1.1, 18000 + k); }
    for (const t of [.6, 2.2, 3.5, 4.4]) { const rr = lk.r(t), x = lx + Math.cos(t) * (280 * rr * (lk.rx / 280) + 30), z = lz + Math.sin(t) * (270 * rr * (lk.rz / 270) + 30); if (z < fr.z0 - 12) this.pav(L, x, z, 7, { roof: t > 3 ? 'xieshan' : 'pyramid' }); } // 曲江 lakeside 亭 (進士 banquets)
  },
});

// =====================================================================================
// POOL — build workers (fallback: run jobs on the main thread). Jobs carry a priority function, re-evaluated on dispatch.
// =====================================================================================
const POOL = {
  ws: [], free: [], q: [], cbs: new Map(), id: 0, main: false, busy: 0,
  init(n, setupOpts) {
    if (typeof Worker === 'undefined' || (typeof Q !== 'undefined' && (Q.has('noworkers') || Q.has('bake')))) { this.main = true; return; }
    try { for (let i = 0; i < n; i++) { const w = new Worker(ENGINE_URL + 'worker.js'); w.onmessage = e => this.onmsg(w, e.data); w.onerror = e => { console.warn('worker error', e.message); this.ws = this.ws.filter(x => x !== w); if (!this.ws.length) this.main = true; }; w.postMessage({ t: 'setup', o: setupOpts }); this.ws.push(w); } }
    catch (e) { console.warn('workers unavailable, building on the main thread:', e.message); this.main = true; }
  },
  onmsg(w, m) {
    if (m.t === 'ready') { this.free.push(w); this.pump(); return; }
    const cb = this.cbs.get(m.id); this.cbs.delete(m.id); this.busy--; this.free.push(w);
    if (m.error) console.error('job', m.t, m.error); else if (cb) this.applyQ.push([cb, m, POOL.bytesOf(m)]);
    this.pump();
  },
  // results are applied (uploaded to the GPU) a little at a time: at most ~BUDGET bytes per frame, so a big chunk never stalls a frame
  applyQ: [], BUDGET: 4e6, uploaded: 0,
  bytesOf(m) { let b = 0; const walk = v => { if (!v || typeof v !== 'object') return; if (v.vb) { b += v.vb.byteLength + v.ib.byteLength; return; } if (Array.isArray(v)) v.forEach(walk); else for (const k in v) walk(v[k]); }; walk(m); return b; },
  drain(settling) { let b = R.pump(this.BUDGET, settling); while (this.applyQ.length && (settling || b < this.BUDGET || b === 0)) { const [cb, m, n] = this.applyQ.shift(); cb(m); b += n > R.UPS ? R.UPS : n; } if (settling) R.pump(0, true); this.uploaded = b; },
  submit(job, pri, cb, cancel) {
    if (typeof BAKE !== 'undefined') { const k = JSON.stringify(job), r = BAKE[k]; if (r) { delete BAKE[k]; this.busy++; POOL.unbake(r).then(m => { this.busy--; cb(m); }); return 0; } }
    job.id = ++this.id; this.q.push({ job, pri, cb, cancel }); this.pump(); return job.id; },
  // test-only: decode a baked job result (base64 buffers via data: URLs, decoded natively)
  b64(s) { const T = POOL._b64t || (POOL._b64t = (() => { const t = new Uint8Array(128); const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (let i = 0; i < 64; i++) t[A.charCodeAt(i)] = i; return t; })()); // base64 -> ArrayBuffer (fetching data: URLs stalls past Chrome's ~2 MB URL limit: big baked buffers never arrived)
    let n = s.length; while (n && s.charCodeAt(n - 1) === 61) n--; const out = new Uint8Array((n * 3) >> 2); let j = 0, i = 0;
    for (; i + 4 <= n; i += 4) { const a = T[s.charCodeAt(i)], b = T[s.charCodeAt(i + 1)], c = T[s.charCodeAt(i + 2)], d = T[s.charCodeAt(i + 3)]; out[j++] = (a << 2) | (b >> 4); out[j++] = ((b & 15) << 4) | (c >> 2); out[j++] = ((c & 3) << 6) | d; }
    if (n - i >= 2) { const a = T[s.charCodeAt(i)], b = T[s.charCodeAt(i + 1)]; out[j++] = (a << 2) | (b >> 4); if (n - i === 3) { const c = T[s.charCodeAt(i + 2)]; out[j++] = ((b & 15) << 4) | (c >> 2); } }
    return out.buffer; },
  async unbake(v) { if (v === null || typeof v !== 'object') return v; if (v.$b !== undefined) { const ab = POOL.b64(v.$b); await null; return v.$t === 'AB' ? ab : new self[v.$t](ab); }
    if (Array.isArray(v)) return Promise.all(v.map(x => POOL.unbake(x))); const o = {}; for (const k in v) o[k] = await POOL.unbake(v[k]); return o; },
  pump() {
    if (this.main || !this.free.length || !this.q.length) return;
    for (const e of this.q) e.p = typeof e.pri === 'function' ? e.pri() : e.pri; this.q.sort((a, b) => a.p - b.p);
    while (this.free.length && this.q.length) { const e = this.q.shift(); if (e.p === Infinity) { if (e.cancel) e.cancel(); continue; } const w = this.free.pop(); this.cbs.set(e.job.id, e.cb); this.busy++; w.postMessage(e.job); }
  },
  // main-thread fallback: run queued jobs within a time budget
  runMain(ms) { const t0 = performance.now(); while (this.q.length && performance.now() - t0 < ms) { for (const e of this.q) e.p = typeof e.pri === 'function' ? e.pri() : e.pri; this.q.sort((a, b) => a.p - b.p); const e = this.q.shift(); if (e.p === Infinity) { if (e.cancel) e.cancel(); continue; } const r = CITY.job(e.job).msg; if (r.error) console.error(r.error); else e.cb(r); } },
  pending() { return this.q.length + this.busy + this.applyQ.length + (typeof R !== "undefined" && R.ups ? R.ups.length : 0); },
};

// ---------------- main-thread runtime ----------------
Object.assign(CITY, {
  // gate leaves: one shared mesh per leaf, drawn per gate rotated by the global openness (1 open .. 0 shut); closed gates block
  gateMesh() { if (this._gm) return this._gm; const mk = sd => { const b = new MB(), lw = 2.17 - .01, hd = 4.2 - .34 - .3; b.s({ tex: 'door_studs', col: [1, 1, 1] }).box(-sd * lw / 2, (hd + .2) / 2 + .05, 0, lw, hd - .1, .12, { uv: [2, 3] }); b.s({ tex: 'iron', col: [1, 1, 1] }).box(-sd * (lw - .25), 1.25, .07, .05, .25, .03); return b.upload(); };
    return this._gm = [mk(-1), mk(1)]; },
  drawGates(open) {
    const P = R.camPos, M = this._gmM || (this._gmM = M4.new()), Mt = M4.new(); const [L, Rr] = this.gateMesh();
    for (const g of this.gates) { const dx = g.x - P[0], dz = g.z - P[2]; if (dx * dx + dz * dz > 260 * 260 || !R.visible(g.x, 2, g.z, 4)) continue;
      const a = open * PI * .5, h2 = 2.17, zf = (WARD.WALL_T + 1.2) / 2; // hinges just inside the jambs (inner faces ±2.24 m): open leaves lie against the passage walls
      for (const [m, sd] of [[L, -1], [Rr, 1]]) { M4.trs(M, g.x, 0, g.z, 0, g.yaw, 0); M4.trs(Mt, sd * h2, 0, zf, 0, -sd * a, 0); M4.mul(Mt, M, Mt); R.draw(m, Mt); } }
  },
  setGatesSolid(on) { if (!this.gateSolids) this.gateSolids = this.gates.map(g => { const s = this.world.box(g.x, 2, g.z, 2.85, 2, .3, { yaw: g.yaw, dynamic: true, surface: 'wood' }); s.on = false; return s; }); for (const s of this.gateSolids) s.on = on; },
  init(o) {
    const t0 = performance.now();
    this.setup(o); this.TL = ['loess', 'yard', 'grass_summer', 'field_crop'].map(n => TEX.id(n));
    this.world = new MultiWorld(this); this.world.hfn = (x, z) => { const h = this.height(x, z), p = this.parkH(x, z); return p > h ? p : h; }; G.world = this.world;
    let nav = null; for (const lay of this.lay) nav = WARD.nav(lay, nav); this.nav = nav; this.avenueNav(nav);
    console.log('CITY setup', this.setupMs.toFixed(0), 'ms;', this.slice.length, 'walkable units,', this.order.length, 'chunks,', this.items.length, 'items');
    POOL.init(Q.has('workers') ? +Q.get('workers') : (typeof Input !== 'undefined' && Input.native ? 2 : 3), o); /* the Mac app (WebKit): 2 — every worker holds the whole city's layout and WebKit kills the page past its memory budget */ // each worker holds a full copy of the layout + caches: keep few (memory)
    const cam = () => R.camPos, dw = wd => { const c = cam(), r = wd.r; return Math.hypot(Math.max(r.x0 - c[0], 0, c[0] - r.x1), Math.max(r.z0 - c[2], 0, c[2] - r.z1)); };
    POOL.submit({ t: 'terr' }, 0, m => { this.terr1 = R.meshPacked(m.terr); for (const [ci, a, n] of m.ranges) this.order[ci].t1 = [a, n]; });
    POOL.submit({ t: 'fterr' }, 1, m => { this.fterr = R.meshPacked(m.terr); });
    POOL.submit({ t: 'mtn' }, 4, m => { this.mtn = R.meshPacked(m.mesh); });
    for (const part of FARB.PARTS) POOL.submit({ t: 'land', part }, /^xq|xingqing/.test(part) ? 1.5 : 2.5, m => /* landmarks: skyline from everywhere (before the far wards); 興慶宮 borders the walkable avenue */ { this.land.push({ mesh: m.mesh && R.meshPacked(m.mesh), fol: m.fol && R.meshPacked(m.fol) }); });
    POOL.submit({ t: 'canals' }, 6, m => { this.land.push({ mesh: m.mesh && R.meshPacked(m.mesh), fol: null }); }); // far canal water
    for (let k = 0; k < this.all.length; k += 12) { const wi = this.all.slice(k, k + 12).map(w => w.i); POOL.submit({ t: 'far', wi, lvl: 2 }, () => 3 + Math.min(...wi.map(i => dw(this.all[i]))) / 1000, m => this.applyFar(m)); }
    this.dw = dw;
    this.t0 = t0; this.ready = true;
  },
  // avenues in the walk graph: centrelines of the plan's streets inside the walkable area, crossings, and links from every ward gate
  avenueNav(nav) {
    const node = (x, z, kind) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); let i = nav.key.get(k); if (i === undefined) { i = nav.nodes.length; nav.nodes.push({ x, z, kind }); nav.adj.push([]); nav.key.set(k, i); } return i; };
    const link = (a, b, w, kind) => { if (a === b) return; const e = nav.edges.length; nav.edges.push({ a, b, w, kind, len: Math.hypot(nav.nodes[a].x - nav.nodes[b].x, nav.nodes[a].z - nav.nodes[b].z) }); nav.adj[a].push(e); nav.adj[b].push(e); };
    const inUnit = (x, z) => this.all.some(wd => x > wd.r.x0 - 2 && x < wd.r.x1 + 2 && z > wd.r.z0 - 2 && z < wd.r.z1 + 2); /* within 2 m: also the seam between two abutting palace units */ // avenues run between the units, never through a ward / market / palace unit (palace units made the 皇城 and palaces walkable: avenue lines used to cross them, through their walls)
    const walk = (x, z) => !!this.chunkAt(x, z) && !inUnit(x, z), xs = this.order.map(c => c.cx), zs = this.order.map(c => c.cz), X0 = Math.min(...xs) - 32, X1 = Math.max(...xs) + 32, Z0 = Math.min(...zs) - 32, Z1 = Math.max(...zs) + 32;
    const lines = PLAN.streets.map(s => ({ axis: s.axis, c: (s.a0 + s.a1) / 2, w: s.w, pts: [] })).filter(l => l.axis === 'z' ? l.c > X0 && l.c < X1 : l.c > Z0 && l.c < Z1);
    for (const A of lines) for (const B of lines) if (A.axis === 'z' && B.axis === 'x') { const x = A.c, z = B.c; if (x > X0 && x < X1 && z > Z0 && z < Z1 && walk(x, z)) { const i = node(x, z, 'x'); A.pts.push([z, i]); B.pts.push([x, i]); } }
    for (const gi of nav.gates.slice()) { const g = nav.nodes[gi]; let best = null, bd = 1e9; for (const l of lines) { const d = Math.abs((l.axis === 'z' ? g.x : g.z) - l.c); if (d < bd) { bd = d; best = l; } }
      if (!best || bd > 170) continue; const t = best.axis === 'z' ? g.z : g.x, p = best.axis === 'z' ? [best.c, t] : [t, best.c]; if (!walk(...p)) continue; const i = node(p[0], p[1], 'x'); best.pts.push([t, i]); link(gi, i, 2.5, 'gate'); }
    let n = 0; for (const l of lines) { l.pts.sort((a, b) => a[0] - b[0]); for (let k = 1; k < l.pts.length; k++) { const [t0, a] = l.pts[k - 1], [t1, b] = l.pts[k], m = (t0 + t1) / 2; let ok = true; const nq = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 8)); for (let q = 1; q < nq && ok; q++) { const tq = t0 + (t1 - t0) * q / nq; ok = l.axis === 'z' ? walk(l.c, tq) : walk(tq, l.c); } if (!ok) continue; link(a, b, l.w, 'avenue'); n++; } }
    console.log('avenue nav:', lines.length, 'lines,', n, 'edges');
  },
  applyFar(m) { for (const f of m.list) { const e = this.far[f.i] || (this.far[f.i] = {}); const k = m.lvl === 1 ? 'f1' : 'f2'; if (e[k]) continue; e[k] = { mesh: f.mesh && R.meshPacked(f.mesh), fol: f.fol && R.meshPacked(f.fol) }; if (m.lvl === 1) e.req1 = false; } },
  freeM(o) { if (!o) return; for (const k of ['mesh', 'fol', 'terr']) if (o[k]) R.freeMesh(o[k]); },
  // on-demand LOD1 groups and FAR1 wards (with eviction), LOD0 chunks
  update() {
    if (!this.ready) return; const P = R.camPos;
    this.groups.forEach((g, gi) => { const d = this.dw(g.wd);
      if ((d < this.LOD1R || g.keep) && !g.mesh && !g.req && !g.done) { g.req = true; POOL.submit({ t: 'group', g: gi }, () => g.keep || this.dw(g.wd) < this.LOD1R + 200 ? 1 + this.dw(g.wd) / 1000 : Infinity, m => { g.req = false; g.done = true; if (g.mesh) return; /* an empty result (a unit without chunks of its own) is done too */ g.mesh = m.mesh && R.meshPacked(m.mesh); g.fol = m.fol && R.meshPacked(m.fol); for (const [ci, a, n, fa, fn, B] of m.ranges) { const c = this.order[ci]; c.r1 = [a, n]; c.f1 = [fa, fn]; c.b1 = B; } }, () => { g.req = false; }); }
      if (d > this.LOD1R + 250 && (g.mesh || g.done) && !g.keep) { this.freeM(g); g.mesh = g.fol = null; g.done = false; } });
    for (const wd of this.all) { const d = this.dw(wd), e = this.far[wd.i] || (this.far[wd.i] = {});
      if (d < this.FAR1R && !e.f1 && !e.req1) { e.req1 = true; POOL.submit({ t: 'far', wi: [wd.i], lvl: 1 }, () => this.dw(wd) < this.FAR1R + 300 ? 2 + this.dw(wd) / 1000 : Infinity, m => this.applyFar(m), () => { e.req1 = false; }); }
      if (d > this.FAR1R + 800 && e.f1) { this.freeM(e.f1); e.f1 = null; } }
    // LOD0 chunks: the ones within reach of the camera (a grid lookup, not a scan of the whole city), and the live ones (loaded or asked for)
    const CH = this.CH, rr = this.R0 + CH, seen = this._seen || (this._seen = new Set()); seen.clear();
    const chunkD = c => Math.hypot(Math.max(Math.abs(P[0] - c.cx) - CH / 2, 0), Math.max(Math.abs(P[2] - c.cz) - CH / 2, 0), Math.max(0, P[1] - 30));
    const visit = c => { if (seen.has(c)) return; seen.add(c); const d = chunkD(c); c.want = d < this.R0 ? 1 : 0;
      if (c.want && !c.m0 && !c.req) { c.req = true; this.live.add(c); POOL.submit({ t: 'lod0', ci: c.idx }, () => c.want ? -10 + Math.hypot(R.camPos[0] - c.cx, R.camPos[2] - c.cz) / 1000 : Infinity, m => this.applyChunk(c, m), () => { c.req = false; }); }
      if (!c.want && c.m0 && d > this.R0OUT) { for (const k of ['mesh', 'fol', 'terr']) if (c.m0[k]) R.freeMesh(c.m0[k]); c.m0 = null; c.req = false; }
      if (!c.m0 && !c.req) this.live.delete(c); };
    if (P[1] - 30 < this.R0) for (let j = Math.floor((P[2] - rr) / CH); j <= Math.floor((P[2] + rr) / CH); j++) for (let i = Math.floor((P[0] - rr) / CH); i <= Math.floor((P[0] + rr) / CH); i++) { const c = this.chunks.get(this.key(i, j)); if (c) visit(c); }
    for (const c of this.live) visit(c);
    if (POOL.main) POOL.runMain(8); else POOL.pump();
    POOL.drain(this.settling);
    // lights of loaded chunks
    if (R.frame % 15 === 0) { const K = R.lampK || [1, 1, 1, 1], L = []; for (const c of this.live) if (c.m0 && c.lights) for (const l of c.lights) if (!l.group || K[l.group] > .3) L.push(l); this.lights = L; } // a room's light goes out with its lamp group
    // chunks far behind keep nothing: collision, furnishing spots and lights are dropped beyond ~400 m (rebuilt with the chunk when you come back), so
    // memory stays bounded however far you walk (WebKit kills the page past its budget)
    if (R.frame % 60 === 0 && this.held) for (const c of this.held) { if (c.m0 || c.req) continue; if (Math.hypot(P[0] - c.cx, P[2] - c.cz) < this.R0OUT + 250) continue; c.world = null; c.meta = null; c.lights = null; this.held.delete(c); }
  },
  // open/closed buildings: static geometry and solids carry a visibility group (MB slot / solid grp). Groups by schedule class:
  // odd = shown while CLOSED, even = shown while OPEN. 1/2 business (open 7–19), 3/4 late (wine shops, 北里: 9–1), 5/6 temple (5–19.5),
  // 7/8 courtyard gate (open 7–18). Homes and rich gates have no groups: always closed (E to pass).
  SCHED: [null, [7, 19], [9, 25], [5, 19.5], [7, 18]],
  isOpen(cls, h) { const r = this.SCHED[cls]; if (!r) return false; const hh = h < 4 ? h + 24 : h; return hh >= r[0] && hh < r[1]; },
  visMask(h) { let m = 0; for (let c = 1; c <= 4; c++) { const op = this.isOpen(c, h); m |= 1 << (op ? 2 * c - 1 : 2 * c); } return m; }, // hide the closed group when open, the open group when closed
  visApply(W) { const m = this.mask | 0; for (const s of W.solids) if (s.grp) s.on = !((m >> s.grp) & 1); },
  setVis(h) { const m = this.visMask(h); if (m === this.mask) return false; this.mask = m; R.hideMask = m; for (const c of this.order) if (c.world) this.visApply(c.world); return true; },
  // staff/customer spots and doors from the loaded full-detail chunks near (x, z)
  metaNear(x, z, r, key) { const out = [], CH = this.CH; // chunks overlapping the square (a grid lookup)
    for (let j = Math.floor((z - r) / CH); j <= Math.floor((z + r) / CH); j++) for (let i = Math.floor((x - r) / CH); i <= Math.floor((x + r) / CH); i++) { const c = this.chunks.get(this.key(i, j)); if (!c || !c.meta || !c.world) continue;
      for (const e of c.meta[key] || []) if (Math.abs(e.x - x) < r && Math.abs(e.z - z) < r) out.push(e); } return out; },
  applyChunk(c, m) {
    if (c.m0) return; c.req = false; if (!c.want && !this.settling) { return; }
    c.m0 = { mesh: m.mesh && R.meshPacked(m.mesh), fol: m.fol && R.meshPacked(m.fol), terr: R.meshPacked(m.terr) }; c.lights = m.lights; c.meta = m.meta || null;
    { const B = [c.x0, -2, c.z0, c.x0 + this.CH, 2, c.z0 + this.CH]; for (const k of ['mesh', 'fol', 'terr']) { const b = c.m0[k] && c.m0[k].box; if (b) for (let i = 0; i < 3; i++) { B[i] = Math.min(B[i], b[i]); B[i + 3] = Math.max(B[i + 3], b[i + 3]); } } c.m0.box = B; }
    if (!c.world) { (this.held || (this.held = new Set())).add(c); const W = new World(), s = m.sol; for (let i = 0; i < s.length; i += 10) { const sf = SURF[s[i + 9] % 256], grp = Math.floor(s[i + 9] / 256); if (s[i] === 0) W.box(s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5], s[i + 6], { yaw: s[i + 7], surface: sf, grp }); else if (s[i] === 2) { const t = Math.floor(s[i + 8] / 10 + 1e-4); W.roof(s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5], s[i + 6], s[i + 7], t, s[i + 8] - t * 10, { surface: sf, grp }); } else W.cyl(s[i + 1], s[i + 3], s[i + 2] - s[i + 5], s[i + 2] + s[i + 5], s[i + 8], { surface: sf, grp }); } c.world = W; CITY.visApply(W); }
  },
  // block until everything needed for the current view exists (boot, screenshots)
  async settleAsync(timeout = 120000) { const t0 = performance.now(); this.settling = true;
    while (performance.now() - t0 < timeout) { this.update(); if (POOL.main) POOL.runMain(1e9); POOL.drain(true);
      const missing = this.order.some(c => c.want && !c.m0) || !this.terr1 || !this.fterr || this.groups.some(g => !g.mesh && !g.done && (g.keep || this.dw(g.wd) < this.LOD1R)) || this.all.some(w => !(this.far[w.i] && this.far[w.i].f2) || (this.dw(w) < this.FAR1R && !this.far[w.i].f1)) || this.land.length < FARB.PARTS.length || this.land.some(l => (l.mesh && l.mesh.pending) || (l.fol && l.fol.pending)); // landmark uploads too
      if (!missing) break; if (performance.now() - (this._lp || 0) > 5000) { this._lp = performance.now(); console.log('settling', (this.progress() * 100).toFixed(0) + '%', 'queue', POOL.q.length, 'busy', POOL.busy, 'lod0', this.order.filter(c => c.m0).length + '/' + this.order.filter(c => c.want).length); } await new Promise(r => setTimeout(r, 30)); }
    if (performance.now() - t0 >= timeout) console.warn('settle timed out, still waiting for:', this.waiting().join(' | '));
    this.settling = false; return true; },
  // what settleAsync is still waiting for (diagnostics)
  waiting() { const W = []; const c = this.order.filter(c => c.want && !c.m0); if (c.length) W.push(c.length + ' LOD0 chunks'); if (!this.terr1) W.push('terr1'); if (!this.fterr) W.push('fterr');
    for (const g of this.groups) if (!g.mesh && !g.done && (g.keep || this.dw(g.wd) < this.LOD1R)) W.push('LOD1 ' + g.wd.short + (g.req ? ' (asked)' : ''));
    for (const w of this.all) { const f = this.far[w.i]; if (!(f && f.f2)) W.push('far2 ' + w.short); else if (this.dw(w) < this.FAR1R && !f.f1) W.push('far1 ' + w.short + (f.req1 ? ' (asked)' : '')); }
    if (this.land.length < FARB.PARTS.length) W.push('land ' + this.land.length + '/' + FARB.PARTS.length); return W; },
  settle() { return this.settleAsync(); },
  progress() { const n = 2 + FARB.PARTS.length + this.all.length + this.order.filter(c => c.want).length, d = (this.terr1 ? 1 : 0) + (this.fterr ? 1 : 0) + this.land.length + this.all.filter(w => this.far[w.i] && this.far[w.i].f2).length + this.order.filter(c => c.want && c.m0).length; return d / n; },
  draw() {
    if (!this.ready) return;
    const P = R.camPos, TL = this.TL, dist = r => Math.hypot(Math.max(r.x0 - P[0], 0, P[0] - r.x1), Math.max(r.z0 - P[2], 0, P[2] - r.z1));
    const push = (a, r) => { if (!r || !r[1]) return; const l = a[a.length - 1]; if (l && l[0] + l[1] === r[0]) l[1] += r[1]; else a.push([r[0], r[1]]); };
    if (this.mtn && !R.shadowing) R.draw(this.mtn, IDM, { fog: .62 });
    if (this.fterr) R.draw(this.fterr, IDM, { terr: TL });
    // walkable chunks: LOD0 where loaded, else chunk terrain (LOD1) runs
    const tr = this._tr || (this._tr = []), shown = this._shown && this._shown.length === this.order.length ? this._shown.fill(0) : (this._shown = new Uint8Array(this.order.length)); tr.length = 0;
    const tb = this._tb || (this._tb = [0, -2.5, 0, 0, 1.5, 0]);
    for (const g of this.groups) { if (!g.box || !R.boxVisible(g.box)) continue; // a whole ward's chunks culled at once
      for (let ci = g.c0; ci < g.c1; ci++) { const c = this.order[ci]; tb[0] = c.x0; tb[2] = c.z0; tb[3] = c.x0 + this.CH; tb[5] = c.z0 + this.CH;
        if (c.want && c.m0 && !(c.m0.mesh && c.m0.mesh.pending) && !(c.m0.terr && c.m0.terr.pending)) { shown[c.idx] = 1; if (R.boxVisible(c.m0.box)) { if (c.m0.mesh) R.draw(c.m0.mesh, IDM); if (c.m0.fol) R.draw(c.m0.fol, IDM, { cull: false }); R.draw(c.m0.terr, IDM, { terr: TL }); } continue; }
        if (R.boxVisible(tb)) push(tr, c.t1); } }
    if (this.terr1 && tr.length) R.draw(this.terr1, IDM, { terr: TL, runs: tr });
    // wards
    for (const wd of this.all) {
      const d = dist(wd.r), wb = wd._box || (wd._box = [wd.r.x0 - 40, -5, wd.r.z0 - 40, wd.r.x1 + 40, 80, wd.r.z1 + 40]); if (!R.boxVisible(wb)) continue;
      const g = wd.group !== undefined ? this.groups[wd.group] : null;
      if (g && g.mesh && !g.mesh.pending && !(g.fol && g.fol.pending) && d < this.LOD1R) { const rm = [], rf = []; for (let ci = g.c0; ci < g.c1; ci++) { const c = this.order[ci]; if (shown[ci] || !R.boxVisible(c.b1)) continue; push(rm, c.r1); push(rf, c.f1); }
        if (rm.length) R.draw(g.mesh, IDM, { runs: rm }); if (g.fol && rf.length) R.draw(g.fol, IDM, { cull: false, runs: rf }); continue; }
      const f = this.far[wd.i]; if (!f) continue; const m = (d < this.FAR1R && f.f1 && !(f.f1.mesh && f.f1.mesh.pending) && f.f1) || f.f2; if (!m) continue;
      if (m.mesh) R.draw(m.mesh, IDM); if (m.fol) R.draw(m.fol, IDM, { cull: false });
    }
    const gz = this.gatezone && this.groups[this.gatezone.group];
    if (gz && gz.mesh && !gz.mesh.pending) { // always drawn: it stands in for the far wall and gate there
      const rm = [], rf = []; for (let ci = gz.c0; ci < gz.c1; ci++) { const c = this.order[ci]; if (shown[ci] || !c.b1 || !R.boxVisible(c.b1)) continue; push(rm, c.r1); push(rf, c.f1); }
      if (rm.length) R.draw(gz.mesh, IDM, { runs: rm }); if (gz.fol && rf.length) R.draw(gz.fol, IDM, { cull: false, runs: rf }); }
    for (const l of this.land) { if (l.mesh && R.boxVisible(l.mesh.box)) R.draw(l.mesh, IDM); if (l.fol && R.boxVisible(l.fol.box)) R.draw(l.fol, IDM, { cull: false }); }
  },
});
// collision across chunk worlds (kept after a chunk's meshes are freed)
class MultiWorld extends World {
  constructor(city) { super(); this.city = city; }
  near(x, z, r, cb) {
    const C = this.city, CH = C.CH, m = 40, seen = this._s || (this._s = new Set()); seen.clear();
    for (let j = Math.floor((z - r - m) / CH); j <= Math.floor((z + r + m) / CH); j++) for (let i = Math.floor((x - r - m) / CH); i <= Math.floor((x + r + m) / CH); i++) {
      const c = C.chunks.get(C.key(i, j)); if (c && c.world) c.world.near(x, z, r, s => { if (!seen.has(s)) { seen.add(s); cb(s); } }); }
    for (const s of this.dyn) if (s.on) cb(s);
  }
}

// =====================================================================================
// 小雁塔 (薦福寺塔院, 安仁坊), walkable: a square brick 密檐 tower ~45 m on a high base — tall first storey, 14 close-set corbelled
// eaves, a slight bulge in the profile; a hollow core with a steep stair winding up along the inner walls (corner landings, rail on
// the open side), arched windows on the N/S faces where the stair passes, a small top room with windows on all four sides.
// LOD versions (ARCH.lod) build the same exterior, so the silhouette matches at every range. Local +z = front (door).
// =====================================================================================
TANG.pagodaWalk = function (L, x, y, z, o = {}) {
  const b = L.mb, yaw = o.yaw || 0, lod = ARCH.lod, F = ARCH.F(x, y, z, yaw), q = Math.round(yaw / (PI / 2)) & 1;
  const solid = (lx, ly, lz, sx, sy, sz) => { if (lod) return; const p = F.p(lx, ly, lz); L.world.box(p[0], p[1], p[2], (q ? sz : sx) / 2, sy / 2, (q ? sx : sz) / 2, { surface: 'brick' }); };
  const box = (lx, ly, lz, sx, sy, sz, tex, col, coll = true, skip) => { if (sx <= .001 || sy <= .001 || sz <= .001) return; b.s({ tex, col }).box(lx, ly, lz, sx, sy, sz, { world: 1, skip }); if (coll) solid(lx, ly, lz, sx, sy, sz); };
  b.T(x, y, z, 0, yaw, 0);
  const BR = [1.42, 1.34, 1.18], BRd = [1.3, 1.22, 1.07], WOOD = [.62, .46, .34], RAIL = [.5, .38, .3], N = 15, A0 = 11.4, IN = 5.0, a = IN / 2, PB = 2.0, PW = 16, BW = .95;
  // the high base with a flight of steps front and back
  box(0, PB / 2, 0, PW, PB, PW, 'brick', [1.15, 1.1, 1.0], true, ['bot']);
  for (const sd of [1, -1]) for (let k = 0; k < 10; k++) { const h = (k + 1) * PB / 10; box(0, h / 2, sd * (PW / 2 + 2.6 - k * .26 - .13), 4.2, h, .26, 'stone', [1.05, 1.02, .98], true, ['bot']); }
  // storeys: a tall first storey, then 14 close-set eaves; slight bulge then taper
  const S = []; let yy = PB;
  for (let i = 0; i < N; i++) { const t = i / (N - 1), W = A0 * (1 + .04 * Math.sin(PI * Math.min(1, t * 1.6))) * (1 - .42 * Math.pow(t, 1.5)), body = i === 0 ? 7.5 : 1.6, eave = .9; S.push({ y0: yy, body, eave, W }); yy += body + eave; }
  const yTop = yy;
  // floors: ground at PB, then one wooden floor per storey, 30 cm below the storey's wall line (windows at eye height above it)
  const FL = [PB]; for (let k = 1; k < N; k++) FL.push(S[k].y0 - .3);
  // stairs: one continuous spiral of straight flights along the inner walls, landing in each corner; each storey's rise in steps of ~19 cm
  const perWall = 13, corners = [[-a, -a], [a, -a], [a, a], [-a, a]], along = [[1, 0], [0, 1], [-1, 0], [0, -1]], inward = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const segs = []; let w = 1;
  for (let k = 0; k < N - 1; k++) { const R = FL[k + 1] - FL[k], n = Math.max(1, Math.round(R / .19)), r = R / n, fl = []; let left = n, h = FL[k];
    const walls = Math.ceil(n / perWall); for (let j = 0; j < walls; j++) { const m = Math.round(n * (j + 1) / walls) - Math.round(n * j / walls); fl.push({ w, h0: h, n: m, r, g: (IN - 2 * BW) / m }); h += m * r; w = (w + 1) % 4; } segs.push(fl); } // every flight runs corner to corner
  // windows: N and S faces at every upper storey (eye height above its floor); all four faces in the top storey; doors N and S at ground
  const wins = []; for (let k = 1; k < N; k++) { const y0w = S[k].y0 + .2, y1w = S[k].y0 + S[k].body - .05; for (const sd of [-1, 1]) wins.push({ face: sd, y0: y0w, y1: y1w, w: .7 }); }
  const doors = [{ face: 1, y0: PB, y1: PB + 2.5, w: 1.6 }, { face: -1, y0: PB, y1: PB + 2.5, w: 1.6 }];
  // walls, storey by storey: N/S faces span the full width, E/W faces fit between them; one opening cut per face and storey
  for (const s of S) { const A = s.W / 2, th = A - a, ys = s.y0, hs = s.body + s.eave, top = s === S[N - 1];
    for (const face of [-1, 1]) {
      const ops = [...doors, ...wins].filter(w => w.face === face && w.y0 < ys + hs && w.y1 > ys).map(w => ({ ...w, y0: Math.max(w.y0, ys), y1: Math.min(w.y1, ys + hs) }));
      const zc = face * (a + th / 2); let u = -A; const cuts = ops.slice(0, 1).map(w => [-w.w / 2, w.w / 2, w]);
      if (!cuts.length) box(0, ys + hs / 2, zc, 2 * A, hs, th, 'brick', BR, true, ['bot']);
      else { for (const [c0, c1, w] of cuts) { box((u + c0) / 2, ys + hs / 2, zc, c0 - u, hs, th, 'brick', BR, true, ['bot']); box(0, (ys + w.y0) / 2, zc, c1 - c0, w.y0 - ys, th, 'brick', BR, true); box(0, (w.y1 + ys + hs) / 2, zc, c1 - c0, ys + hs - w.y1, th, 'brick', BR, true); u = c1;
          { const r0 = (c1 - c0) / 2, n4 = 4, hr = Math.min(r0, w.y1 - w.y0 - .3) / n4; for (let k = 0; k < n4; k++) { const d = (k + .5) * hr, hw = Math.sqrt(Math.max(0, r0 * r0 - (r0 - d) * (r0 - d))), t = r0 - hw; if (t < .02) continue; for (const sx of [-1, 1]) box(sx * (r0 - t / 2), w.y1 - d, zc, t, hr, th, 'brick', BRd, false); } } } // arched head (半圓券): fill each side of the arch, through the wall
        box((u + A) / 2, ys + hs / 2, zc, A - u, hs, th, 'brick', BR, true, ['bot']); } }
    for (const face of [-1, 1]) { const tw = face * (a + th / 2), ops = top ? [{ y0: ys + .2, y1: ys + s.body - .05, w: .7 }] : [];
      if (!ops.length) box(tw, ys + hs / 2, 0, th, hs, 2 * a, 'brick', BR, true, ['bot']);
      else { const w = ops[0]; box(tw, ys + hs / 2, -(a + w.w / 2) / 2, th, hs, a - w.w / 2, 'brick', BR, true, ['bot']); box(tw, ys + hs / 2, (a + w.w / 2) / 2, th, hs, a - w.w / 2, 'brick', BR, true, ['bot']); box(tw, (ys + w.y0) / 2, 0, th, w.y0 - ys, w.w, 'brick', BR); box(tw, (w.y1 + ys + hs) / 2, 0, th, ys + hs - w.y1, w.w, 'brick', BR); } }
    // corbelled eave: rings around the wall (never across the hollow core)
    const ring = (yc, h, wo, wi, tex, col) => { if (wo <= wi + .01) return; const t = (wo - wi) / 2; for (const sd of [-1, 1]) { box(0, yc, sd * (wi + t) / 2, wo, h, t, tex, col, false); box(sd * (wi + t) / 2, yc, 0, t, h, wi, tex, col, false); } };
    let ww = s.W; const e0 = ys + s.body, steps = lod === 2 ? 1 : 3;
    for (let k = 0; k < steps; k++) { ww += .3 / steps * 2; ring(e0 + (k + .5) * .3 / steps, .3 / steps, ww, s.W, 'brick', BR); }
    ring(e0 + .3 + .06, .12, ww + .14, s.W, 'roof_tile', [.9, .9, .92]);
    const nxt = S[S.indexOf(s) + 1], wn = nxt ? nxt.W : s.W * .8; for (let k = 0; k < steps; k++) { const w2 = ww - (ww - wn) * (k + 1) / steps; ring(e0 + .42 + (k + .5) * .48 / steps, .48 / steps, w2, s.W, 'brick', BR); } }
  // the roof cap and the finial (剎)
  box(0, yTop + .4, 0, S[N - 1].W * .7, .8, S[N - 1].W * .7, 'brick', BR, true, ['bot']);
  b.s({ tex: 'iron', col: [.8, .7, .6] }).T(0, yTop + .8, 0).lathe([[0, 0], [.6, 0], [.7, .4], [.3, .6], [.1, 3], [.35, 3.2], [.1, 3.5], [.3, 3.8], [.08, 4.1], [.2, 4.4], [0, 5]], { seg: lod ? 5 : 8 }).pop();
  // a seated Buddha: lotus base, crossed legs, robed torso, head with ushnisha, a halo behind (k = scale, facing local +z)
  const image = (x0, y0, z0, k) => { b.T(x0, y0, z0, 0, 0, 0, k); b.s({ tex: 'gold', col: [.95, .82, .55] });
    b.lathe([[0, 0], [.48, 0], [.52, .07], [.46, .14], [.36, .17], [0, .17]], { seg: 12 });
    b.T(0, .29, .04).ell(0, 0, 0, .4, .13, .28, { seg: 10, ring: 5 }).pop();
    b.T(0, .3, 0).lathe([[0, 0], [.23, 0], [.25, .2], [.21, .38], [.14, .46], [.07, .5], [0, .5]], { seg: 10 }).pop();
    b.T(0, .92, .01).ell(0, 0, 0, .11, .13, .11, { seg: 8, ring: 5 }).pop(); b.T(0, 1.06, 0).ell(0, 0, 0, .055, .05, .055, { seg: 6, ring: 3 }).pop();
    b.s({ tex: 'gold', col: [.8, .62, .38] }).T(0, .78, -.18, PI / 2, 0, 0).lathe([[0, -.01], [.52, -.01], [.52, .01], [0, .01]], { seg: 14 }).pop(); b.pop(); };
  if (!lod) {
    box(0, PB + .01, 0, IN, .02, IN, 'brick', [1.0, .95, .88], false);
    // stair flights (wooden treads), inner rail, corner landings
    const highIn = new Map(); // per floor: max tread height reached in each band/corner below it (head-room)
    segs.forEach((fl, k) => { for (const f of fl) { const [cx, cz] = corners[f.w], [ux, uz] = along[f.w], [ix, iz] = inward[f.w];
        const gg = f.g, i0 = k > 0 || f !== fl[0] ? 0 : 3; for (let i = 0; i < f.n; i++) { const s0 = BW + i * gg, h = f.h0 + (i + 1) * f.r, px = cx + ux * (s0 + gg / 2) + ix * BW / 2, pz = cz + uz * (s0 + gg / 2) + iz * BW / 2;
          box(px, h - .1, pz, ux ? gg : BW, .2, uz ? gg : BW, i % 2 ? 'plank' : 'dark_wood', WOOD, true);
          if (i >= i0) { const rx = cx + ux * (s0 + gg / 2) + ix * (BW + .02), rz = cz + uz * (s0 + gg / 2) + iz * (BW + .02);
            if ((i - i0) % 3 === 0 || i === f.n - 1) box(rx, h + .43, rz, .05, .86, .05, 'dark_wood', RAIL, false); solid(rx, h + .5, rz, ux ? gg : .06, 1.0, uz ? gg : .06); } } // posts standing on the treads
        { const sp = (q, off) => [cx + ux * (BW + q * gg) + ix * off, f.h0 + q * f.r - .2, cz + uz * (BW + q * gg) + iz * off]; b.s({ tex: 'dark_wood', col: WOOD }); // stringers 樓梯梁 under the treads (inner edge and against the wall): the treads used to float
          for (const off of [BW - .05, .05]) ARCH.sweep(b, [sp(0, off), sp(f.n, off)], .1, .3, { uv: 1 }); }
        if (f.n - 1 > i0) { const R0 = (i, e) => { const sx = BW + (i + .5 + e) * gg; return [cx + ux * sx + ix * (BW + .02), f.h0 + (i + 1) * f.r + .86 + e * f.r, cz + uz * sx + iz * (BW + .02)]; }; // one sloped handrail along the flight (the old per-tread bars stepped in the air)
          b.s({ tex: 'dark_wood', col: RAIL }); ARCH.sweep(b, [R0(i0, -.5), R0(f.n - 1, .5)], .05, .05, { uv: 1 }); }
        const top = f.h0 + f.n * f.r, [ex, ez] = corners[(f.w + 1) % 4]; f.top = top;
        if (Math.abs(top - FL[k + 1]) > .01) box(ex - Math.sign(ex) * BW / 2, top - .1, ez - Math.sign(ez) * BW / 2, BW, .2, BW, 'plank', WOOD, true); } }); // mid-segment landing (floors provide the others)
    { const f = segs[0][0], [cx, cz] = corners[f.w]; box(cx - Math.sign(cx) * BW / 2, PB + .1, cz - Math.sign(cz) * BW / 2, BW, .2, BW, 'plank', WOOD, true); }
    // floors: everything except the bands (and corners) where a flight below rises within 2.1 m of this floor; rails along the openings
    const bandRect = k => [[0, -a + BW / 2, IN - 2 * BW, BW], [a - BW / 2, 0, BW, IN - 2 * BW], [0, a - BW / 2, IN - 2 * BW, BW], [-a + BW / 2, 0, BW, IN - 2 * BW]][k];
    for (let k = 1; k < N; k++) { const fy = FL[k], open = new Set(), openC = new Set();
      for (const f of segs[k - 1]) { if (f.top > fy - 2.1) open.add(f.w); if (f.h0 > fy - 2.1) openC.add(f.w); } // band of the flight; its start corner if the flight starts high
      box(0, fy - .1, 0, IN - 2 * BW, .2, IN - 2 * BW, 'plank', WOOD, true);
      for (let w2 = 0; w2 < 4; w2++) { const [bx, bz, sx, sz] = bandRect(w2); if (!open.has(w2)) box(bx, fy - .1, bz, sx, .2, sz, 'plank', WOOD, true);
        else { const [ix, iz] = inward[w2], [ux, uz] = along[w2], GAP = 1.8, L2 = (ux ? sx : sz) - GAP, c2 = -GAP / 2, rx = bx + ix * (BW / 2 + .03) + ux * c2, rz = bz + iz * (BW / 2 + .03) + uz * c2; // open balustrade, gap where the stair arrives
          if (L2 > .2) { box(rx, fy + .86, rz, ix ? .05 : L2, .05, iz ? .05 : L2, 'dark_wood', RAIL, false); box(rx, fy + .42, rz, ix ? .04 : L2, .04, iz ? .04 : L2, 'dark_wood', RAIL, false);
            const np = Math.max(2, Math.round(L2 / .8) + 1); for (let q = 0; q < np; q++) { const t = -L2 / 2 + L2 * q / (np - 1); box(rx + ux * t, fy + .43, rz + uz * t, .06, .86, .06, 'dark_wood', RAIL, false); }
            solid(rx, fy + .5, rz, ix ? .06 : L2, 1.0, iz ? .06 : L2); } } }
      corners.forEach(([cx, cz], c) => { if (openC.has(c)) return; box(cx - Math.sign(cx) * BW / 2, fy - .1, cz - Math.sign(cz) * BW / 2, BW, .2, BW, 'plank', WOOD, true); });
      // a little furniture: sutra chests on some floors, a small image on others, a lamp now and then (kept off the stair bands)
      if (k % 3 === 1) { box(.95, fy + .25, 0, .5, .5, .9, 'lacquer_black', [1, 1, 1], true); box(.95, fy + .56, 0, .4, .12, .7, 'cloth', [.8, .5, .3], false); }
      if (k % 3 === 2) { box(-.95, fy + .3, 0, .6, .6, .8, 'stone', [1.05, 1, .95], true); b.T(-.95, fy + .6, 0, 0, PI / 2, 0); image(0, 0, 0, .55); b.pop(); }
      if (k % 4 === 0 || k === N - 1) L.light(...F.p(0, fy + 1.9, 0), 4.5, [.85, .65, .42], { flicker: .1 }); }
    // ground floor: a stone altar with a seated image facing the south door, a lamp stand
    box(0, PB + .45, -1.2, 1.6, .9, .9, 'stone', [1.05, 1, .95], true);
    image(0, PB + .9, -1.25, 1.25);
    L.light(...F.p(.9, PB + 1.6, -.6), 5, [1, .72, .42], { flicker: .15 });
    // the ceiling of the top storey
    box(0, S[N - 1].y0 + S[N - 1].body + S[N - 1].eave - .1, 0, IN, .2, IN, 'plank', [.5, .4, .32], true);
  }
  b.pop();
  if (lod) L.world.box(x, y + yTop / 2, z, A0 / 2 + 2, yTop / 2, A0 / 2 + 2, { yaw });
  return { top: y + yTop, floors: FL };
};
{ const _pgw = TANG.pagoda; TANG.pagoda = function (L, x, y, z, o = {}) { return o.walk ? TANG.pagodaWalk(L, x, y, z, o) : _pgw.call(this, L, x, y, z, o); }; }
