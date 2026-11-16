// nature.js — EIGHT HUNDRED DRUMS: trees, ground cover and clutter (owned by the nature/detail engineer).
// Hooks called by city.js (all optional): NATURE.tree(L,x,y,z,kind,s,seed), NATURE.treeLod(L,x,y,z,kind,s,seed,lodLevel),
// NATURE.chunk(L, info) for every full-detail 64 m chunk, NATURE.yard(L, lot, F, w, d, R, kind) inside compounds.
//
// HOOK REQUESTS for the lead (city.js):
//  1. NATURE.yard: please pass the gate position (gx, local x of the lot gate) and the main hall's local z / depth, e.g. lot.gx, lot.zMain
//     (I currently re-derive gx from RNG(lot.seed)'s first draw, which breaks if COMP.hut/house change their RNG order).
//  2. tool/zcheck.js does not call NATURE.chunk (only it.build). tool/nature_zcheck.js audits with it; consider adding the call there.
//  3. Optional: call NATURE.yard for 'temple' lots too (kind 'temple'); garden/field lots are dressed from NATURE.chunk already.
//  4. Ground classes come from a 2 m raster (CITY.groundAt) — too coarse for wall feet, so NATURE.chunk reads CITY.lay (streets, lanes,
//     lots, wells) directly. If you rename those fields, tell me. A per-lot 'walled' flag (enclosure exists on this side) would help.
//  5. The shared bake for 4 far-apart cameras is ~1.2 GB and hangs headless Chrome; bake one area per run.
//  6. tool/bake.js bug: without --slice, si = -1 so the filter `i !== si + 1` drops the FIRST camera argument (one camera -> no
//     lod0/group jobs at all; the page then builds those chunks on the main thread). Fix: `(si < 0 || i !== si + 1)`.
//  7. URGENT engine.js R.meshPacked (staged uploads): `u8 = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)` gets an
//     ArrayBuffer for pk.vb (MBpack returns vb as a plain ArrayBuffer) -> a 0-byte upload, so every mesh > R.UPS (3 MB) draws as
//     garbage/nothing (whole LOD0 chunks and LOD1 groups vanish). Fix: `a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(...)`.
//  8. Street trees (ref/zhihu): AVENUE.TREE_STEP 11 -> 6 (and drop the 12% skip to ~5%); ward main-street step 12 -> 6.5 with skip .25 -> .08.
//     NATURE's huai is now the street form (clear 3–4 m trunk, 2–3 limbs, high canopy, ~2.8k tris, cached variants).
// Tools: tool/nature_bench.js (cost), tool/nature_zcheck.js (z-fight delta incl. NATURE.chunk), tool/nature_preview.js (Node software
//        render of trees / a city spot, no browser), tool/nature_tex.js (texture contact sheet).
//
// Design: every tree species is grown from a seeded recursive skeleton (tapered bent tubes with root flare and surface roots,
// scaffold limbs → branches → twigs) with alpha-cutout leaf-spray cards (painted per species) at the twig tips, oriented outward,
// shaded darker toward the crown core. Skeletons are cached per (species, variant) and stamped with yaw / non-uniform scale /
// tint, so building is fast and instancing-friendly. Ground detail (grass tufts, ruts, dung, pebbles, litter, reeds, clutter)
// and yard life are emitted straight into the chunk's mesh builders from cached templates.
'use strict';
const NATURE = (() => {
  const N = {};
  // ============================================================================================
  // fast emission (world coordinates, straight into an MB's arrays)
  // ============================================================================================
  const push = (b, x, y, z, nx, ny, nz, u, v, r, g, bl, e, layer) => { b.P.push(x, y, z); b.N.push(nx, ny, nz); b.U.push(u, v); b.C.push(r, g, bl, e); b.L.push(layer); b.B.push(0, 0); b.W.push(1, 0, 0, 0); };
  // copy template MB t into b at (x,y,z), yaw, scale (sx,sy,sz), colour tint
  function put(b, t, x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx, tint) {
    if (!t || !t.nv) return;
    if (b.m) { b.T(x, y, z, 0, yaw, 0, sx, sy, sz); b.add(t); b.pop(); return; }
    const c = Math.cos(yaw), s = Math.sin(yaw), base = b.nv, P = t.P, Nn = t.N, U = t.U, C = t.C, Ls = t.L, n = t.nv;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1, isx = 1 / sx, isy = 1 / sy, isz = 1 / sz;
    const BP = b.P, BN = b.N, BU = b.U, BC = b.C, BL = b.L, BB = b.B, BW = b.W;
    for (let i = 0; i < n; i++) {
      const lx = P[i * 3] * sx, ly = P[i * 3 + 1] * sy, lz = P[i * 3 + 2] * sz;
      BP.push(x + c * lx + s * lz, y + ly, z - s * lx + c * lz);
      let nx = Nn[i * 3] * isx, ny = Nn[i * 3 + 1] * isy, nz = Nn[i * 3 + 2] * isz; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
      BN.push(c * nx + s * nz, ny, -s * nx + c * nz); BU.push(U[i * 2], U[i * 2 + 1]);
      BC.push(C[i * 4] * tr, C[i * 4 + 1] * tg, C[i * 4 + 2] * tb, C[i * 4 + 3]); BL.push(Ls[i]); BB.push(0, 0); BW.push(1, 0, 0, 0);
    }
    const I = t.I, BI = b.I; for (let k = 0; k < I.length; k++) BI.push(base + I[k]);
  }
  // a quad card: base centre (x,y,z), half-width vector u, height vector v; front = cross(u,v); normal n (lighting); uv rect
  function card(b, x, y, z, ux, uy, uz, vx, vy, vz, nx, ny, nz, col, layer, u0 = 0, v0 = 0, u1 = 1, v1 = 1, ctop) {
    const i = b.nv, t = ctop || col;
    push(b, x - ux, y - uy, z - uz, nx, ny, nz, u0, v1, col[0], col[1], col[2], 0, layer);
    push(b, x + ux, y + uy, z + uz, nx, ny, nz, u1, v1, col[0], col[1], col[2], 0, layer);
    push(b, x + ux + vx, y + uy + vy, z + uz + vz, nx, ny, nz, u1, v0, t[0], t[1], t[2], 0, layer);
    push(b, x - ux + vx, y - uy + vy, z - uz + vz, nx, ny, nz, u0, v0, t[0], t[1], t[2], 0, layer);
    b.I.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // flat ground decal (horizontal quad), centre (x,z) at height y, size w×d, rotated by a
  function decal(b, x, y, z, w, d, a, layer, col, u1 = 1, v1 = 1) {
    const c = Math.cos(a), s = Math.sin(a), hx = w / 2, hz = d / 2, i = b.nv;
    const P = [[-hx, -hz, 0, 0], [hx, -hz, u1, 0], [hx, hz, u1, v1], [-hx, hz, 0, v1]];
    for (const [px, pz, u, v] of P) push(b, x + c * px + s * pz, y, z - s * px + c * pz, 0, 1, 0, u, v, col[0], col[1], col[2], 0, layer);
    b.I.push(i, i + 2, i + 1, i, i + 3, i + 2); // facing up
  }
  // crossed upright grass/weed cards (n planes), base at ground
  N.tuft = (L, x, y, z, w, h, a, tex, col = [1, 1, 1], n = 2, lean = 0) => tuft(L.fol, x, y, z, w, h, a, L_(tex), col, n, lean); // for builders outside nature.js (landmark lawns)
  function tuft(b, x, y, z, w, h, a, layer, col, n = 2, lean = 0) {
    const ct = [col[0] * 1.12, col[1] * 1.12, col[2] * 1.08], lx = Math.cos(a + 1) * lean * h, lz = Math.sin(a + 1) * lean * h;
    for (let k = 0; k < n; k++) { const q = a + k * PI / n, ux = Math.cos(q) * w / 2, uz = Math.sin(q) * w / 2; card(b, x, y - .03, z, ux, 0, uz, lx, h, lz, 0, 1, 0, col, layer, 0, 0, 1, 1, ct); }
  }
  const L_ = name => TEX.id(name);
  const V3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sc: (a, k) => [a[0] * k, a[1] * k, a[2] * k], norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] };
  const perp = d => V3.norm(Math.abs(d[1]) < .9 ? V3.cross(d, [0, 1, 0]) : V3.cross(d, [1, 0, 0]));
  // rotate vector d by angle t toward direction p (p ⟂ d)
  const tilt = (d, p, t) => V3.norm(V3.add(V3.sc(d, Math.cos(t)), V3.sc(p, Math.sin(t))));
  const rotAround = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), d = V3.dot(k, v), x = V3.cross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; };

  // ============================================================================================
  // TEXTURES (declared at load time)
  // ============================================================================================
  const T0 = () => [0, 0, 0, 0];
  const shade = (c, k, a = 255) => [c[0] * k, c[1] * k, c[2] * k, a];
  // one leaf: base (x,y), direction a, length L, width W, shape, colour; lit from the top-left; midrib
  function leaf(P, x, y, a, L, W, col, shape, rnd) {
    const ca = Math.cos(a), sa = Math.sin(a), k0 = .85 + rnd() * .3;
    for (let j = 0; j <= L; j += .5) { const t = j / L;
      let f = shape === 'lance' ? Math.pow(Math.sin(PI * t), 1.3) * (1 - t * .2) : shape === 'round' ? Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) : shape === 'needle' ? .35 : shape === 'lobed' ? Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (.72 + .28 * Math.abs(Math.cos(t * PI * 2.5))) : Math.pow(Math.sin(PI * Math.min(1, t * 1.05)), .75);
      const hw = Math.max(.3, W * f);
      for (let q = -hw; q <= hw; q += .5) { const px = x + ca * j - sa * q, py = y + sa * j + ca * q;
        let k = k0 * (q > 0 ? 1.06 : .9) * (1.08 - py / TS * .22); if (Math.abs(q) < .5 && t < .92 && W > 1.4) k *= .82; if (Math.abs(q) > hw - .55) k *= .86;
        P.px(px, py, shade(col, k)); } }
  }
  // leaf spray card: a twig from the bottom centre branching upward, leaves along the twigs (texture y=0 is the card top)
  function spray(name, o) {
    return texPaint(name, (P, rnd) => {
      const tw = [];
      const grow = (x, y, a, len, dep) => { const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len; tw.push([x, y, x1, y1, dep, a]);
        if (dep < (o.td ?? 2)) { const n = dep === 0 ? (o.side ?? 4) : 2; for (let k = 0; k < n; k++) { const t = .25 + .65 * (k + rnd() * .5) / n, sd = k % 2 ? 1 : -1; grow(x + (x1 - x) * t, y + (y1 - y) * t, a + sd * (o.sa ?? .7) * (.7 + .6 * rnd()), len * (.42 + .22 * rnd()), dep + 1); } } };
      grow(64 + (rnd() - .5) * 8, 127, -PI / 2 + (rnd() - .5) * .25, o.tl ?? 112, 0);
      const twc = o.twig || [92, 74, 56];
      for (const [x0, y0, x1, y1, dep] of tw) P.line(x0, y0, x1, y1, dep === 0 ? 2.2 : 1.3, shade(twc, .8 + rnd() * .3));
      const cols = o.cols;
      const col = () => { const c = cols[(rnd() * cols.length) | 0], j = .9 + rnd() * .2; return [c[0] * j, c[1] * j, c[2] * j]; };
      for (const [x0, y0, x1, y1, dep, a] of tw) {
        const len = Math.hypot(x1 - x0, y1 - y0), sp = o.sp ?? 7; let sd = 1;
        for (let j = (dep === 0 ? 18 : 3); j < len + 2; j += sp * (.8 + rnd() * .4)) { const t = Math.min(1, j / len), x = lerp(x0, x1, t), y = lerp(y0, y1, t); sd = -sd; if (rnd() > (o.keep ?? 1)) continue;
          if (o.type === 'pinnate') { // compound leaf: rachis with paired leaflets and a terminal one
            const ra = a + sd * (.5 + rnd() * .5), rl = o.len * (.8 + rnd() * .4), np = o.np ?? 5, c = col();
            for (let p = 1; p <= np; p++) { const rx = x + Math.cos(ra) * rl * p / (np + .5), ry = y + Math.sin(ra) * rl * p / (np + .5); for (const s2 of [-1, 1]) leaf(P, rx, ry, ra + s2 * 1.15, o.ll, o.lw, c, 'oval', rnd); }
            leaf(P, x + Math.cos(ra) * rl, y + Math.sin(ra) * rl, ra, o.ll, o.lw, c, 'oval', rnd);
          } else if (o.type === 'needle') { const n = o.nn ?? 9, c = col(); for (let q = 0; q < n; q++) { const na = a + (q / (n - 1) - .5) * (o.fan ?? 2.4) + (rnd() - .5) * .2, nl = o.len * (.75 + rnd() * .4); P.line(x, y, x + Math.cos(na) * nl, y + Math.sin(na) * nl, 1.1, shade(c, .8 + rnd() * .4)); } }
          else if (o.type === 'scale') { const c = col(), fa = a + sd * (.5 + rnd() * .4); for (let q = 0; q < 4; q++) { const fl = o.len * (1 - q * .18), qa = fa + (q - 1.5) * .35; P.line(x, y, x + Math.cos(qa) * fl, y + Math.sin(qa) * fl, o.lw ?? 2.6, shade(c, .85 + rnd() * .3)); } }
          else { const n = o.whorl ?? 1; for (let q = 0; q < n; q++) leaf(P, x, y, a + sd * (o.la ?? .9) * (.7 + .6 * rnd()) + (q - (n - 1) / 2) * .6, o.len * (.75 + rnd() * .5), o.wid * (.8 + rnd() * .4), col(), o.shape || 'oval', rnd); }
        }
      }
      if (o.fl) for (let i = 0; i < o.fl.n; i++) { const t = tw[(rnd() * tw.length) | 0], x = t[2] + (rnd() - .5) * 10, y = t[3] + (rnd() - .5) * 10, c = o.fl.cols[(rnd() * o.fl.cols.length) | 0];
        if (o.fl.panicle) { for (let q = 0; q < 9; q++) P.disc(x + (rnd() - .5) * 9, y + (rnd() - .5) * 12 - 4, 1.1, shade(c, .85 + rnd() * .3)); }
        else P.disc(x, y, o.fl.r * (.8 + rnd() * .4), (dx, dy) => shade(c, 1.1 - (dx + dy) * .2)); }
    }, { bg: T0, wrap: false });
  }
  // species leaf sprays (summer 815: 槐 in bloom with cream panicles 槐花; pomegranate in red flower; peaches ripening; jujubes green)
  spray('nl_huai', { keep: .45,  type: 'pinnate', len: 15, np: 5, ll: 3.4, lw: 1.7, sp: 8, side: 4, cols: [[60, 92, 44], [74, 108, 50], [52, 80, 40], [86, 116, 56]], fl: { n: 7, panicle: true, cols: [[226, 220, 170], [210, 206, 150]] } });
  spray('nl_huai2', { keep: .45,  type: 'pinnate', len: 14, np: 4, ll: 3.6, lw: 1.8, sp: 7, side: 5, sa: .9, cols: [[56, 86, 42], [70, 102, 48], [82, 112, 54]] });
  spray('nl_elm', { keep: .45,  len: 6.5, wid: 2.6, sp: 4.5, la: 1.0, side: 5, td: 2, cols: [[78, 104, 50], [92, 118, 56], [66, 92, 44]] });
  spray('nl_jujube', { keep: .45,  len: 6, wid: 2.8, sp: 6, la: .9, side: 4, sa: .9, twig: [110, 70, 50], cols: [[70, 104, 44], [90, 124, 54], [104, 134, 60]], fl: { n: 10, r: 1.6, cols: [[150, 170, 80], [170, 180, 96]] } });
  spray('nl_peach', { keep: .45,  len: 12, wid: 2.2, sp: 5, la: .55, shape: 'lance', side: 4, twig: [120, 70, 56], cols: [[84, 118, 52], [100, 132, 60], [72, 104, 48]], fl: { n: 16, r: 5.2, cols: [[252, 150, 138], [242, 104, 98], [254, 196, 164], [248, 128, 118]] } }); // peaches ripening in the 6th month: cream with a red-pink blush, many and big enough to read from afar
  spray('nl_apricot', { keep: .45,  len: 8, wid: 4.2, sp: 6, la: .9, shape: 'round', side: 4, twig: [110, 72, 56], cols: [[82, 116, 50], [98, 128, 58], [70, 100, 46]], fl: { n: 3, r: 2.6, cols: [[220, 176, 90]] } });
  spray('nl_willow', { keep: .45,  len: 10, wid: 1.3, sp: 3, la: .35, shape: 'lance', side: 3, td: 1, sa: .3, tl: 124, twig: [120, 110, 70], cols: [[110, 140, 66], [130, 156, 78], [96, 126, 58]] });
  spray('nl_pine', { keep: .45,  type: 'needle', len: 14, nn: 11, fan: 2.6, sp: 6, side: 4, twig: [120, 80, 60], cols: [[46, 70, 46], [56, 82, 52], [40, 62, 42]] });
  spray('nl_cypress', { keep: .45,  type: 'scale', len: 11, lw: 2.8, sp: 4, side: 5, sa: .8, twig: [100, 76, 56], cols: [[54, 76, 44], [64, 88, 50], [46, 66, 40]] });
  spray('nl_mulberry', { keep: .45,  len: 15, wid: 6.5, sp: 10, la: .9, shape: 'lobed', side: 3, cols: [[74, 112, 46], [88, 126, 52], [64, 98, 42]], fl: { n: 5, r: 2, cols: [[90, 40, 60], [150, 60, 70]] } });
  spray('nl_poplar', { keep: .45,  len: 8, wid: 4.6, sp: 6, la: 1.0, shape: 'round', side: 4, cols: [[86, 116, 62], [150, 164, 132], [74, 104, 56], [100, 128, 70]] });
  spray('nl_tong', { keep: .45,  len: 24, wid: 11, sp: 16, la: .8, shape: 'lobed', side: 2, tl: 100, cols: [[84, 122, 54], [100, 136, 62], [72, 108, 48]] });
  spray('nl_pomegranate', { keep: .45,  len: 7, wid: 2.4, sp: 5, la: .8, shape: 'lance', side: 4, cols: [[72, 108, 44], [90, 124, 50]], fl: { n: 9, r: 2.4, cols: [[226, 80, 40], [240, 110, 50]] } });
  spray('nl_bamboo', { keep: .45,  len: 20, wid: 2.6, sp: 9, la: .5, shape: 'lance', side: 3, sa: .5, whorl: 2, twig: [120, 130, 70], cols: [[86, 118, 52], [104, 132, 60], [74, 104, 48]] });
  spray('nl_peony', { keep: .45,  len: 14, wid: 4.6, sp: 9, la: .9, shape: 'lobed', side: 3, whorl: 3, twig: [90, 100, 60], cols: [[70, 104, 56], [84, 118, 64], [96, 126, 70]] });
  // wild rose 玫瑰 (樂遊原: "樂遊苑自生玫瑰樹，樹下多苜蓿", 西京雜記): small pinnate leaves, the last purple-red flowers of early summer
  spray('nl_rose', { keep: .5,  type: 'pinnate', len: 9, np: 3, ll: 2.4, lw: 1.6, sp: 6, side: 4, twig: [100, 70, 56], cols: [[62, 96, 46], [76, 110, 52], [56, 86, 42]], fl: { n: 9, r: 3, cols: [[200, 60, 110], [220, 90, 140], [180, 40, 90]] } });
  // sparse small-leaf twig sprays for the near trees (2–3 variants per species): a forked twig with leaves and see-through gaps
  const SPR = { huai: { type: 'pinnate', len: 12, np: 4, ll: 3.2, lw: 1.5, sp: 14, side: 5, sa: .75, cols: [[60, 92, 44], [74, 108, 50], [52, 80, 40], [90, 118, 56], [104, 124, 62]], fl: { n: 4, panicle: true, cols: [[226, 220, 170], [210, 206, 150]] } },
    elm: { len: 6, wid: 2.4, sp: 6.5, la: 1.0, side: 6, cols: [[78, 104, 50], [92, 118, 56], [66, 92, 44], [110, 128, 62]] }, willow: { len: 10, wid: 1.2, sp: 4.5, la: .35, shape: 'lance', side: 4, sa: .3, cols: [[110, 140, 66], [130, 156, 78], [96, 126, 58]] },
    jujube: { len: 5.5, wid: 2.6, sp: 8, la: .9, side: 5, sa: .9, twig: [110, 70, 50], cols: [[70, 104, 44], [90, 124, 54], [104, 134, 60]], fl: { n: 5, r: 1.5, cols: [[150, 170, 80]] } },
    peach: { len: 11, wid: 2, sp: 6.5, la: .55, shape: 'lance', side: 5, twig: [120, 70, 56], cols: [[84, 118, 52], [100, 132, 60], [72, 104, 48]], fl: { n: 8, r: 5, cols: [[252, 150, 138], [242, 104, 98], [254, 196, 164], [248, 128, 118]] } },
    apricot: { len: 7, wid: 3.8, sp: 8, la: .9, shape: 'round', side: 5, twig: [110, 72, 56], cols: [[82, 116, 50], [98, 128, 58], [70, 100, 46]], fl: { n: 2, r: 2.4, cols: [[220, 176, 90]] } },
    mulberry: { len: 12, wid: 5.5, sp: 12, la: .9, shape: 'lobed', side: 4, cols: [[74, 112, 46], [88, 126, 52], [64, 98, 42]], fl: { n: 3, r: 1.8, cols: [[90, 40, 60]] } },
    tong: { len: 20, wid: 9, sp: 20, la: .8, shape: 'lobed', side: 3, cols: [[84, 122, 54], [100, 136, 62], [72, 108, 48]] }, pomegranate: { len: 6.5, wid: 2.2, sp: 7, la: .8, shape: 'lance', side: 5, cols: [[72, 108, 44], [90, 124, 50]], fl: { n: 5, r: 2.2, cols: [[226, 80, 40], [240, 110, 50]] } },
    poplar: { len: 7, wid: 4, sp: 8, la: 1.0, shape: 'round', side: 5, cols: [[86, 116, 62], [150, 164, 132], [74, 104, 56], [100, 128, 70]] }, pine: { type: 'needle', len: 12, nn: 10, fan: 2.6, sp: 9, side: 5, twig: [120, 80, 60], cols: [[46, 70, 46], [56, 82, 52], [40, 62, 42]] },
    cypress: { type: 'scale', len: 9, lw: 2.4, sp: 6, side: 6, sa: .8, twig: [100, 76, 56], cols: [[54, 76, 44], [64, 88, 50], [46, 66, 40]] } };
  for (const k in SPR) for (let j = 1; j <= (k === 'huai' ? 3 : 2); j++) spray('nm_' + k + j, Object.assign({ tl: 118, keep: .55 }, SPR[k]));
  spray('nl_shrub', { keep: .45,  len: 6, wid: 3, sp: 4, la: 1, side: 5, cols: [[64, 96, 46], [80, 110, 52], [56, 84, 40]] });
  // willow strands: long hanging whips of narrow leaves (card hangs from its top edge)
  texPaint('nl_willow_strand', (P, rnd) => { for (let s = 0; s < 9; s++) { let x = 6 + s * 14 + rnd() * 6; const y0 = rnd() * 20;
    for (let y = y0; y < TS - rnd() * 20; y += 2.2) { x += (rnd() - .5) * 1.3; const c = mixc([96, 128, 56], [150, 170, 86], rnd()); P.line(x, y, x, y + 2.5, 1, shade([110, 96, 60], .9));
      leaf(P, x, y, PI / 2 + (rnd() < .5 ? .5 : -.5), 5 + rnd() * 3, 1, c, 'lance', rnd); } } }, { bg: T0, wrap: false });
  // barks (u around, v along)
  TEX.add('nb_huai', (x, y) => { const f = qN(x * 2, y * .35, 16, 3, 501), g = qN(x * 2.5 + 40, y * .3, 16, 3, 502), n = qN(x, y, 8, 4, 503); const r = Math.min(Math.abs(f - .5), Math.abs(g - .5));
    let c = mixP([84, 76, 66], [58, 54, 50], n); if (r < .05) c = shP(c, .45); else if (r < .09) c = shP(c, .7); else c = mixP(c, [120, 112, 98], sstep(.15, .3, r) * .5); return shP(c, .92 + grainy(x, y, 504) * .12); });
  TEX.add('nb_smooth', (x, y) => { const n = qN(x, y, 8, 4, 505), l = (Math.abs(((y + qN(x, y, 4, 2, 506) * 10) % 9) - 4.5) < .7) && hash2(x >> 2, (y / 9) | 0, 507) > .35; let c = mixP([118, 74, 62], [92, 60, 54], n); if (l) c = mixP(c, [170, 140, 110], .55); return shP(c, .9 + grainy(x, y, 508) * .1); });
  TEX.add('nb_poplar', (x, y) => { const n = qN(x, y, 8, 4, 509), w = qW(x, y * .7, 6, 510); let c = mixP([186, 182, 166], [150, 150, 138], n); if (w[0] < .14 && w[2] > .4) c = shP([60, 56, 52], 1.1 - w[0] * 3); return shP(c, .9 + grainy(x, y, 511) * .1); });
  TEX.add('nb_willow', (x, y) => { const f = qN(x * 3, y * .4, 16, 3, 512), n = qN(x, y, 8, 4, 513), r = Math.abs(f - .5); let c = mixP([100, 88, 70], [70, 62, 54], n); if (r < .07) c = shP(c, .5); else if (r > .3) c = mixP(c, [130, 120, 100], .4); return shP(c, .9 + grainy(x, y, 514) * .1); });
  TEX.add('nb_cypress', (x, y) => { const f = qN(x * 4, y * .2, 32, 2, 515), n = qN(x, y, 8, 4, 516); let c = mixP([120, 84, 64], [92, 66, 54], n); c = shP(c, .75 + Math.abs(f - .5) * 1.2); return shP(c, .92 + grainy(x, y, 517) * .1); });
  TEX.add('nb_tong', (x, y) => { const n = qN(x, y, 8, 4, 518), m = qN(x, y * .3, 16, 3, 519); let c = mixP([112, 128, 92], [88, 104, 76], n); c = mixP(c, [140, 140, 120], sstep(.62, .75, m) * .5); return shP(c, .92 + grainy(x, y, 520) * .08); });
  TEX.add('nb_bamboo', (x, y) => { const node = (y % 64) < 3, n = qN(x, y, 4, 3, 521); let c = mixP([96, 126, 60], [120, 140, 70], n); if (node) c = shP([150, 150, 96], .9); else if ((y % 64) < 6) c = shP(c, 1.12); return shP(c, .9 + Math.sin(x / TS * TAU) * .08); });
  // grass & low-plant cards (bottom-anchored; texture y=0 is the top)
  const blades = (P, rnd, n, h0, h1, cols, w = 1.2, bend = 1) => { for (let i = 0; i < n; i++) { let x = 12 + rnd() * 104; const h = h0 + rnd() * (h1 - h0), lean = (rnd() - .5) * 1.4 * bend, c = cols[(rnd() * cols.length) | 0];
    let y = 127, px = x; for (let k = 0; k < h; k += 2) { const t = k / h; px = x + lean * t * t * 30; P.line(px, y - k, px, y - k - 2, Math.max(.8, w * (1 - t * .7)), shade(c, .7 + t * .5)); } } };
  texPaint('ng_grass', (P, rnd) => blades(P, rnd, 42, 40, 118, [[98, 116, 58], [118, 130, 66], [84, 100, 50], [140, 140, 84], [120, 118, 70]], 1.1), { bg: T0, wrap: false });
  texPaint('ng_dry', (P, rnd) => blades(P, rnd, 55, 30, 110, [[170, 150, 96], [150, 132, 84], [126, 120, 70], [184, 164, 112]], 1.1, 1.3), { bg: T0, wrap: false });
  texPaint('ng_weed', (P, rnd) => { blades(P, rnd, 14, 30, 90, [[96, 120, 56]], 1); for (let i = 0; i < 9; i++) leaf(P, 64 + (rnd() - .5) * 40, 127, -PI / 2 + (rnd() - .5) * 2.4, 22 + rnd() * 18, 7 + rnd() * 3, mixc([70, 104, 46], [100, 130, 58], rnd()), 'oval', rnd);
    for (let i = 0; i < 4; i++) { const x = 30 + rnd() * 68, h = 60 + rnd() * 50; P.line(x, 127, x + (rnd() - .5) * 10, 127 - h, 1, [110, 120, 70, 255]); for (let k = 0; k < 14; k++) P.px(x + (rnd() - .5) * 3, 127 - h + k * 1.6, [130, 120, 80, 255]); } }, { bg: T0, wrap: false });
  texPaint('ng_flower', (P, rnd) => { blades(P, rnd, 40, 30, 100, [[92, 120, 54], [110, 134, 60], [80, 108, 48]]); const fc = [[236, 230, 200], [236, 206, 80], [190, 150, 210], [230, 236, 240]];
    for (let i = 0; i < 16; i++) { const x = 14 + rnd() * 100, y = 127 - 40 - rnd() * 70, c = fc[(rnd() * fc.length) | 0]; P.line(x, y, x + (rnd() - .5) * 6, 127, 1, [90, 116, 54, 255]); P.disc(x, y, 1.8 + rnd(), shade(c, 1)); P.px(x, y, [200, 160, 40, 255]); } }, { bg: T0, wrap: false });
  texPaint('ng_alfalfa', (P, rnd) => { blades(P, rnd, 10, 30, 70, [[86, 118, 52]], 1); for (let i = 0; i < 26; i++) leaf(P, 64 + (rnd() - .5) * 90, 127 - rnd() * 60, -PI / 2 + (rnd() - .5) * 2.6, 9 + rnd() * 6, 4 + rnd() * 2, mixc([74, 112, 50], [100, 134, 62], rnd()), 'oval', rnd); // 苜蓿: clover-like leaves, small purple racemes
    for (let i = 0; i < 10; i++) { const x = 16 + rnd() * 96, y = 127 - 50 - rnd() * 50; P.line(x, y, x + (rnd() - .5) * 8, 127, 1, [84, 112, 50, 255]); for (let k = 0; k < 5; k++) P.disc(x + (rnd() - .5) * 3, y + k * 2.2, 1.6, shade(mixc([120, 80, 170], [150, 110, 200], rnd()), 1)); } }, { bg: T0, wrap: false });
  texPaint('ng_reed', (P, rnd) => { blades(P, rnd, 26, 80, 124, [[100, 124, 60], [120, 136, 70], [86, 110, 52]], 1.6, .6); for (let i = 0; i < 6; i++) { const x = 20 + rnd() * 88; P.line(x, 127, x + (rnd() - .5) * 8, 4, 1, [130, 130, 80, 255]); P.line(x, 4, x + 3, 22, 3, [150, 120, 90, 255]); } }, { bg: T0, wrap: false });
  texPaint('ng_millet', (P, rnd) => { for (let i = 0; i < 9; i++) { const x = 10 + i * 12 + rnd() * 6, h = 90 + rnd() * 30, tip = x + 8 + rnd() * 6; P.line(x, 127, x + 2, 127 - h, 1.6, [96, 124, 52, 255]);
    for (let k = 0; k < 5; k++) leaf(P, x + 1, 127 - h * (.2 + k * .14), -PI / 2 + (k % 2 ? 1 : -1) * (1 + rnd() * .5), 26 + rnd() * 10, 2.4, mixc([86, 118, 50], [110, 136, 60], rnd()), 'lance', rnd);
    P.line(x + 2, 127 - h, tip, 127 - h + 26, 4.5, (t) => [150, 150, 80, 255]); } }, { bg: T0, wrap: false });
  texPaint('ng_veg', (P, rnd) => { for (let i = 0; i < 12; i++) leaf(P, 64 + (rnd() - .5) * 24, 124, -PI / 2 + (rnd() - .5) * 2.6, 34 + rnd() * 30, 14 + rnd() * 6, mixc([70, 112, 50], [118, 150, 70], rnd()), 'round', rnd); }, { bg: T0, wrap: false });
  texPaint('ng_daylily', (P, rnd) => { blades(P, rnd, 30, 50, 100, [[80, 116, 50], [96, 128, 56]], 2.4, 1.6); for (let i = 0; i < 6; i++) { const x = 25 + rnd() * 78, y = 10 + rnd() * 30; P.line(x, y, x + (rnd() - .5) * 8, 127, 1.2, [90, 120, 50, 255]); for (let p = 0; p < 6; p++) { const a = p / 6 * TAU; P.line(x, y, x + Math.cos(a) * 6, y + Math.sin(a) * 4, 2.2, [232, 120 + rnd() * 30, 40, 255]); } } }, { bg: T0, wrap: false });
  // tree-base soil: dark loam with fallen leaflets, twigs and huai flowers (opaque, tiles on the base mound)
  texPaint('nd_soil', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const n = qN(x, y, 8, 4, 560), m = qN(x, y, 32, 2, 561); P.px(x, y, shade(mixc([96, 78, 58], [70, 58, 44], n), .85 + m * .3)); }
    for (let i = 0; i < 160; i++) { const x = rnd() * TS, y = rnd() * TS, r = rnd(); if (r < .55) leaf(P, x, y, rnd() * TAU, 3 + rnd() * 3, 1.3 + rnd(), mixc([150, 132, 70], [110, 100, 56], rnd()), 'oval', rnd);
      else if (r < .75) P.line(x, y, x + (rnd() - .5) * 14, y + (rnd() - .5) * 14, 1, shade([80, 62, 46], .8 + rnd() * .3)); else if (r < .9) P.disc(x, y, 1, shade([214, 206, 150], .85 + rnd() * .2)); else P.disc(x, y, 1.2, shade([120, 112, 100], .9 + rnd() * .2)); } });
  texPaint('ng_fern', (P, rnd) => { for (let f = 0; f < 7; f++) { const a = -PI / 2 + (f - 3) * .32 + (rnd() - .5) * .15, L = 70 + rnd() * 45; let x = 64, y = 127; const c = mixc([70, 104, 48], [96, 128, 60], rnd());
      for (let k = 0; k < L; k += 2) { const t = k / L, aa = a + t * t * (a > -PI / 2 ? .9 : -.9), nx = x + Math.cos(aa) * 2, ny = y + Math.sin(aa) * 2; P.line(x, y, nx, ny, 1, shade([86, 104, 54], 1));
        if (k % 4 === 0 && k > 6) { const w = (1 - t) * 12 + 2; for (const sd of [-1, 1]) leaf(P, nx, ny, aa + sd * 1.3, w, 1.6, c, 'lance', rnd); } x = nx; y = ny; } } }, { bg: T0, wrap: false });
  // ground decals (top-down, cutout)
  texPaint('nd_ruts', (P, rnd) => { for (const u0 of [32, 96]) { let x = u0, w = 3; for (let y = 0; y < TS; y++) { x += (rnd() - .5) * .7; x = lerp(x, u0, .06); w = clamp(w + (rnd() - .5) * .8, 1.5, 4.5);
      for (let q = -w; q <= w; q++) if (rnd() < .85 - Math.abs(q) / w * .3) P.px(x + q, y, shade([142, 116, 86], .86 + Math.abs(q) / w * .1 + rnd() * .1)); } }
    for (let i = 0; i < 40; i++) P.disc(40 + rnd() * 48, rnd() * 128, .8 + rnd() * 1.4, shade([134, 110, 82], .9 + rnd() * .2)); }, { bg: T0 });
  texPaint('nd_pebbles', (P, rnd) => { for (let i = 0; i < 55; i++) { const x = 8 + rnd() * 112, y = 8 + rnd() * 112, r = .8 + rnd() * rnd() * 3.5, c = mixc([150, 140, 126], [96, 90, 84], rnd()); P.disc(x, y, r, (dx, dy) => shade(c, 1.1 - (dx + dy) * .25)); P.px(x + r * .7, y + r * .7, shade(c, .5)); } }, { bg: T0, wrap: false });
  texPaint('nd_dung', (P, rnd) => { for (let i = 0; i < 7; i++) { const x = 40 + rnd() * 48, y = 40 + rnd() * 48, r = 3 + rnd() * 4, c = mixc([84, 70, 44], [64, 58, 36], rnd()); P.disc(x, y, r, (dx, dy) => shade(c, 1.15 - (dx + dy) * .3)); }
    for (let i = 0; i < 20; i++) P.line(20 + rnd() * 88, 20 + rnd() * 88, 20 + rnd() * 88, 20 + rnd() * 88, 1, [170, 150, 90, 255]); }, { bg: T0, wrap: false });
  texPaint('nd_straw', (P, rnd) => { for (let i = 0; i < 40; i++) { const x = 16 + rnd() * 96, y = 16 + rnd() * 96, a = rnd() * TAU, l = 4 + rnd() * 9; P.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1, shade([170, 150, 108], .75 + rnd() * .35)); } }, { bg: T0, wrap: false });
  texPaint('nd_litter', (P, rnd) => { for (let i = 0; i < 260; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * 58, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d; if (rnd() < .8) P.px(x, y, shade([214, 206, 150], .8 + rnd() * .3)); else leaf(P, x, y, rnd() * TAU, 2.5, 1.1, mixc([170, 160, 96], [130, 128, 74], rnd()), 'oval', rnd); } }, { bg: T0, wrap: false });
  texPaint('nd_damp', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = hyp2((x - 64) / 64, (y - 64) / 64), n = qN(x, y, 8, 4, 530), m = qN(x, y, 16, 3, 548); if (d < .55 + (n - .5) * .7 && m > .28 + d * .4) P.px(x, y, shade([120, 100, 76], .9 + n * .2)); } }, { bg: T0, wrap: false });
  texPaint('nd_dust', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = hyp2((x - 64) / 64, (y - 64) / 64), n = qN(x, y, 4, 4, 545), m = qN(x, y, 16, 3, 547); if (d < .62 + (n - .5) * .9 && m > .3 + d * .35) P.px(x, y, shade([172, 146, 108], .92 + qN(x, y, 16, 2, 546) * .14)); } }, { bg: T0, wrap: false });
  texPaint('nd_crack', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = hyp2((x - 64) / 64, (y - 64) / 64), w = qW(x, y, 7, 531), n = qN(x, y, 8, 3, 532); if (d < .6 + (n - .5) * .5) P.px(x, y, w[1] - w[0] < .05 ? [122, 100, 76, 255] : shade([160, 134, 100], .92 + w[0] * .12)); } }, { bg: T0, wrap: false });
  texPaint('nd_puddle', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = hyp2((x - 64) / 64, (y - 64) / 48), n = qN(x, y, 8, 4, 533); const e = .62 + (n - .5) * .5; if (d < e) P.px(x, y, d > e - .1 ? [86, 70, 54, 255] : shade(mixc([84, 100, 112], [130, 150, 160], sstep(.3, .9, qN(x, y, 4, 2, 534))), .9)); } }, { bg: T0, wrap: false });
  texPaint('nd_hoof', (P, rnd) => { for (let i = 0; i < 26; i++) { const x = 10 + rnd() * 108, y = 10 + rnd() * 108; if (rnd() < .5) { for (let a = -1.2; a <= 1.2; a += .2) P.px(x + Math.cos(a - PI / 2) * 3, y + Math.sin(a - PI / 2) * 3, [118, 96, 70, 255]); } else P.disc(x, y, 1.6, [126, 104, 78, 255]); } }, { bg: T0, wrap: false });
  texPaint('nd_shards', (P, rnd) => { const cs = [[120, 150, 130], [150, 110, 76], [70, 56, 48], [210, 206, 190]]; for (let i = 0; i < 14; i++) { const x = 20 + rnd() * 88, y = 20 + rnd() * 88, c = cs[(rnd() * 4) | 0], a = rnd() * TAU, r = 3 + rnd() * 4; for (let k = 0; k < 3; k++) P.line(x, y, x + Math.cos(a + k * 2.1) * r, y + Math.sin(a + k * 2.1) * r, 2.5, shade(c, .9 + rnd() * .2)); } }, { bg: T0, wrap: false });
  texPaint('nd_ash', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = hyp2((x - 64) / 64, (y - 64) / 64), n = qN(x, y, 8, 4, 535); if (d < .6 + (n - .5) * .5) P.px(x, y, shade(mixc([120, 116, 110], [70, 64, 58], qN(x, y, 16, 2, 536)), .9 + grainy(x, y, 537) * .2)); }
    for (let i = 0; i < 20; i++) P.disc(30 + rnd() * 68, 30 + rnd() * 68, 1 + rnd() * 2, rnd() < .5 ? [40, 34, 30, 255] : [196, 186, 160, 255]); }, { bg: T0, wrap: false });
  texPaint('nd_grain', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const n = qN(x, y, 16, 3, 538); P.px(x, y, shade([196, 170, 96], .8 + n * .3 + grainy(x, y, 539) * .3)); } }, { bg: T0 });
  texPaint('nd_lotus', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const dx = x - 64, dy = y - 64, d = hyp2(dx, dy) / 62, a = Math.atan2(dy, dx); if (d < 1 && !(Math.abs(a - 1) < .06 && d > .1)) P.px(x, y, shade(mixc([70, 110, 54], [100, 136, 70], d), .85 + Math.abs(Math.sin(a * 11)) * .15 * d)); } }, { bg: T0, wrap: false });
  texPaint('nd_cloth', (P, rnd) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const w = ((x >> 1 & 1) ^ (y >> 1 & 1)) ? .9 : 1.05, f = Math.sin(x * .1 + qN(x, y, 4, 2, 540) * 4) * .08; if (y > 124 - Math.abs(Math.sin(x * .25)) * 3) continue; P.px(x, y, shade([214, 206, 186], w * (.9 + f))); } }, { bg: T0, wrap: false });
  texPaint('nd_chicken', (P, rnd) => { // side view of a hen: used on small cards
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const bx = (x - 60) / 40, by = (y - 80) / 30, body = bx * bx + by * by < 1, head = hyp2(x - 98, y - 44) < 11, tail = x < 32 && x > 12 && y > 30 && y < 80 && (y - 30) > (32 - x) * .6, leg = (Math.abs(x - 56) < 2 || Math.abs(x - 68) < 2) && y > 104 && y < 126;
      if (leg) P.px(x, y, [200, 160, 60, 255]); else if (head && hyp2(x - 104, y - 42) < 2) P.px(x, y, [20, 20, 20, 255]); else if (head || body || tail) P.px(x, y, shade([150, 104, 64], .8 + qN(x, y, 8, 2, 541) * .4)); else if (hyp2(x - 98, y - 31) < 5) P.px(x, y, [190, 40, 30, 255]); else if (x > 106 && x < 116 && Math.abs(y - 48) < 2) P.px(x, y, [210, 170, 60, 255]); } }, { bg: T0, wrap: false });
  // dense crown masses for far LOD (tile over low ellipsoids)
  if (typeof leafTex === 'function') { leafTex('nlf_huai', { n: 1300, len: 3.0, wid: 1.6, c0: [56, 86, 42], c1: [100, 128, 60] }); leafTex('nlf_light', { n: 1200, len: 3.2, wid: 1.8, c0: [76, 104, 50], c1: [130, 150, 74] }); leafTex('nlf_dark', { n: 1300, len: 2.4, wid: 1.4, c0: [40, 62, 40], c1: [74, 96, 56] }); leafTex('nlf_peach', { n: 1150, len: 3.2, wid: 1.7, c0: [76, 104, 50], c1: [124, 146, 70], fruit: { n: 260, r: 3, cols: [[252, 150, 138], [242, 104, 98], [254, 196, 164], [248, 128, 118]] } }); }

  // ============================================================================================
  // TREES
  // ============================================================================================
  // species: H height range (m), tr trunk fraction to the first fork, r0 base radius / H, k children per level, ang branch angle per
  // level, lr length ratio, up phototropism, gn gnarl, dep levels, card leaf card size (m), cpt cards per tip, form, flowers…
  const SP = {
    huai:   { cards: 399, leafSz: 1.9, leaf2: ['nm_huai1', 'nm_huai2', 'nm_huai3'], lod1: 'nl_huai', att: .1, H: [10, 13], tr: .3, r0: .03, k: [2, 4, 3, 3], ang: [.42, .75, .7, .6], lr: [.62, .55, .62, .56], up: .28, fdep: 3, lean: .14, gn: .35, dep: 4, card: 1.25, cpt: 3, leaf: ['nl_huai', 'nl_huai2'], bark: 'nb_huai', bc: [.9, .88, .85], lc: [.95, 1, .95], far: 'nlf_huai', crown: [.55, .42] },
    elm:    { cards: 546, leafSz: 1.2, leaf2: ['nm_elm1', 'nm_elm2'], lod1: 'nl_elm', att: 0, H: [9, 13], tr: .35, r0: .026, k: [4, 3, 2, 2], ang: [.5, .62, .62, .6], lr: [.6, .64, .62, .6], up: .3, gn: .25, dep: 4, card: 1.05, cpt: 3, leaf: ['nl_elm'], bark: 'nb_willow', bc: [.85, .85, .85], lc: [1, 1, 1], far: 'nlf_light', crown: [.38, .5] },
    willow: { cards: 273, leafSz: 1.0, leaf2: ['nm_willow1', 'nm_willow2'], lod1: 'nl_willow', att: 0, H: [7, 10], tr: .28, r0: .04, k: [6, 3, 2], ang: [.5, .6, .7], lr: [.6, .6, .55], up: .25, gn: .3, dep: 3, card: 1.1, cpt: 2, leaf: ['nl_willow'], bark: 'nb_willow', bc: [.95, .92, .88], lc: [1, 1.04, .95], weep: true, far: 'nlf_light', crown: [.5, .5] },
    jujube: { cards: 210, leafSz: 1.1, leaf2: ['nm_jujube1', 'nm_jujube2'], lod1: 'nl_jujube', att: 0, H: [4.5, 7], tr: .3, r0: .03, k: [3, 3, 2, 2], ang: [.7, .75, .7, .7], lr: [.62, .6, .6, .6], up: .05, gn: .6, dep: 4, card: .85, cpt: 2, leaf: ['nl_jujube'], bark: 'nb_huai', bc: [.8, .72, .66], lc: [1, 1, 1], lean: .25, far: 'nlf_light', crown: [.45, .5] },
    peach:  { cards: 189, leafSz: 1.1, leaf2: ['nm_peach1', 'nm_peach2'], lod1: 'nl_peach', att: 0, H: [3, 4.5], tr: .22, r0: .035, k: [4, 3, 2, 2], ang: [.75, .6, .6, .6], lr: [.65, .62, .6, .6], up: .2, gn: .4, dep: 4, card: .75, cpt: 2, leaf: ['nl_peach'], bark: 'nb_smooth', bc: [1, 1, 1], lc: [1, 1, 1], far: 'nlf_peach', crown: [.6, .5] },
    apricot:{ cards: 210, leafSz: 1.1, leaf2: ['nm_apricot1', 'nm_apricot2'], lod1: 'nl_apricot', att: 0, H: [4, 6], tr: .25, r0: .035, k: [4, 3, 2, 2], ang: [.7, .6, .6, .6], lr: [.65, .62, .6, .6], up: .15, gn: .4, dep: 4, card: .85, cpt: 2, leaf: ['nl_apricot'], bark: 'nb_smooth', bc: [.85, .8, .8], lc: [1, 1, 1], far: 'nlf_light', crown: [.55, .5] },
    mulberry:{ cards: 294, leafSz: 1.4, leaf2: ['nm_mulberry1', 'nm_mulberry2'], lod1: 'nl_mulberry', att: 0, H: [5, 8], tr: .3, r0: .035, k: [4, 3, 2, 2], ang: [.75, .65, .6, .6], lr: [.62, .62, .6, .58], up: .15, gn: .45, dep: 4, card: 1.1, cpt: 2, leaf: ['nl_mulberry'], bark: 'nb_willow', bc: [.9, .85, .78], lc: [1, 1, 1], far: 'nlf_light', crown: [.5, .5] },
    tong:   { cards: 189, leafSz: 2.0, leaf2: ['nm_tong1', 'nm_tong2'], lod1: 'nl_tong', att: 0, H: [8, 11], tr: .42, r0: .028, k: [4, 3, 2], ang: [.6, .6, .55], lr: [.6, .6, .6], up: .3, gn: .15, dep: 3, card: 1.6, cpt: 3, leaf: ['nl_tong'], bark: 'nb_tong', bc: [1, 1, 1], lc: [1, 1, 1], far: 'nlf_light', crown: [.42, .45] },
    pomegranate:{ cards: 189, leafSz: 1.0, leaf2: ['nm_pomegranate1', 'nm_pomegranate2'], lod1: 'nl_pomegranate', att: 0, H: [3, 4.2], tr: .12, r0: .03, k: [5, 3, 2, 2], ang: [.45, .6, .6, .6], lr: [.7, .6, .6, .6], up: .25, gn: .5, dep: 4, card: .7, cpt: 2, leaf: ['nl_pomegranate'], bark: 'nb_smooth', bc: [.8, .75, .7], lc: [1, 1, 1], far: 'nlf_light', crown: [.5, .55] },
    poplar: { cards: 378, leafSz: 1.2, leaf2: ['nm_poplar1', 'nm_poplar2'], lod1: 'nl_poplar', att: 0, H: [13, 18], tr: .15, r0: .022, k: [0, 2, 2], ang: [0, .45, .5], lr: [0, .5, .55], up: .55, gn: .15, dep: 3, card: 1.1, cpt: 2, leaf: ['nl_poplar'], bark: 'nb_poplar', bc: [1, 1, 1], lc: [1, 1, 1], excurrent: true, whorl: [7, .26], far: 'nlf_light', crown: [.18, .8] },
    pine:   { cards: 336, leafSz: 1.5, leaf2: ['nm_pine1', 'nm_pine2'], lod1: 'nl_pine', att: 0, H: [7, 11], tr: .3, r0: .03, k: [0, 3, 2], ang: [0, .5, .5], lr: [0, .55, .6], up: .05, gn: .45, dep: 3, card: 1.3, cpt: 3, leaf: ['nl_pine'], bark: 'bark', bc: [1, .95, .9], lc: [1, 1, 1], excurrent: true, whorl: [6, .55], flatTop: true, far: 'nlf_dark', crown: [.45, .45] },
    cypress:{ cards: 420, leafSz: 1.2, leaf2: ['nm_cypress1', 'nm_cypress2'], lod1: 'nl_cypress', att: 0, H: [7, 11], tr: .08, r0: .03, k: [0, 2, 2], ang: [0, .35, .4], lr: [0, .5, .55], up: .8, gn: .2, dep: 3, card: 1.05, cpt: 3, leaf: ['nl_cypress'], bark: 'nb_cypress', bc: [1, 1, 1], lc: [1, 1, 1], excurrent: true, whorl: [14, .17], cone: true, far: 'nlf_dark', crown: [.25, .7] },
  };
  N.kinds = Object.keys(SP).concat(['bamboo', 'peony', 'shrub', 'rose']);
  const NV = 6; // variants per species
  const cache = new Map();
  // grow the skeleton
  function skeleton(kind, v) {
    const sp = SP[kind], R = RNG(hash2(v, kind.length * 77 + kind.charCodeAt(0), 9001)), H = lerp(sp.H[0], sp.H[1], .5 + (R() - .5) * .5);
    const segs = [], tips = [], r0 = H * sp.r0 * (.85 + R() * .3);
    const lean = (sp.lean || .08) * (R() - .3), la = R() * TAU, CC = [0, H * .6, 0];
    const trunkDir = V3.norm([Math.cos(la) * lean, 1, Math.sin(la) * lean]);
    const branch = (p, dir, len, r, d, path) => { // returns end point
      const n = d === 0 ? 4 : d < 2 ? 3 : 2, pts = [p]; let q = p, dv = dir;
      for (let i = 1; i <= n; i++) { dv = V3.norm(V3.add(dv, [(R() - .5) * sp.gn, (R() - .5) * sp.gn * .5 + sp.up * .25 - (sp.weep && d > 0 ? .12 : 0), (R() - .5) * sp.gn]));
        if (d >= 1 && sp.att) { const o = V3.norm([q[0] - CC[0], (q[1] - CC[1]) * 1.3, q[2] - CC[2]]); dv = V3.norm(V3.add(dv, V3.sc(o, sp.att))); }
        q = V3.add(q, V3.sc(dv, len / n)); pts.push(q); }
      const rEnd = d >= sp.dep - 1 ? r * .35 : r * .62;
      segs.push({ pts, r0: r, r1: rEnd, d });
      return { q, dv, rEnd, pts };
    };
    const grow = (p, dir, len, r, d) => {
      const { q, dv, rEnd, pts } = branch(p, dir, len, r, d);
      if (d >= sp.dep - 1 || r < .012) { tips.push({ p: q, dir: dv, d }); if (d >= sp.dep - 2) tips.push({ p: pts[Math.max(1, pts.length - 2)], dir: dv, d, mid: true }); return; }
      if (d === 1 && R() < .07) { tips.push({ p: q, dir: dv, d, broken: true }); return; } // broken limb: a stub
      const k = sp.k[d + 1] + (R() < .3 ? 1 : 0), az0 = R() * TAU, pd = perp(dv);
      for (let i = 0; i < k; i++) {
        const az = az0 + i * TAU / k + (R() - .5) * .8, side = rotAround(pd, dv, az), a = sp.ang[d + 1] * (.75 + R() * .5);
        let cd = tilt(dv, side, a); if (sp.weep && d >= 1) cd = V3.norm(V3.add(cd, [0, -.35, 0]));
        const start = i === 0 || R() < .6 ? q : pts[Math.max(1, pts.length - 2)];
        grow(start, cd, len * sp.lr[d + 1] * (.75 + R() * .4), rEnd * (.75 + R() * .2), d + 1);
      }
      if (d >= 1) { tips.push({ p: pts[1], dir: dv, d, mid: true }); if (d >= 2 && pts.length > 2) tips.push({ p: pts[2], dir: dv, d, mid: true }); }
    };
    const trunkLen = H * sp.tr * (.85 + R() * .3); CC[1] = trunkLen + (H - trunkLen) * .4;
    if (sp.excurrent) { // a leader to the top with whorls of laterals (pine, cypress, poplar)
      const pts = [[0, -.3, 0]]; let q = [0, -.3, 0], dv = trunkDir; const n = 6;
      for (let i = 1; i <= n; i++) { dv = V3.norm(V3.add(dv, [(R() - .5) * sp.gn * .4, .4, (R() - .5) * sp.gn * .4])); q = V3.add(q, V3.sc(dv, (H * (sp.flatTop ? .85 : .97) + .3) / n)); pts.push(q); }
      segs.push({ pts, r0, r1: r0 * .18, d: 0, trunk: true });
      const [nw, spread] = sp.whorl, y0 = trunkLen;
      for (let i = 0; i < nw * 2; i++) {
        const t = i / (nw * 2), y = lerp(y0, H * .96, t), k = Math.floor(t * n * .999), f = t * n - k, a0 = pts[Math.min(k + 1, n)], a1 = pts[Math.min(k + 2, n)];
        const base = [lerp(a0[0], a1[0], f), y, lerp(a0[2], a1[2], f)], az = i * 2.4 + R() * .6, side = [Math.cos(az), 0, Math.sin(az)];
        const lenF = sp.cone ? (1 - t) * .9 + .1 : sp.flatTop ? .6 + .6 * Math.sin(t * PI * .9) : (1 - t * .7);
        const cd = V3.norm(V3.add(side, [0, sp.up * 1.4 - (sp.flatTop ? .15 : 0) + (R() - .5) * .3, 0]));
        grow(base, cd, H * spread * lenF * (.7 + R() * .5), r0 * .35 * (1 - t * .6), 1);
      }
      tips.push({ p: q, dir: [0, 1, 0], d: 1 });
    } else {
      const tb = branch([0, -.3, 0], trunkDir, trunkLen + .3, r0, 0); segs[segs.length - 1].trunk = true;
      const k = sp.k[0] + (R() < .4 ? 1 : 0), az0 = R() * TAU, pd = perp(tb.dv);
      for (let i = 0; i < k; i++) { const az = az0 + i * TAU / k + (R() - .5) * .9, side = rotAround(pd, tb.dv, az), a = sp.ang[0] * (.7 + R() * .6) * (i === 0 && kind !== 'willow' ? .45 : 1);
        const start = i === 0 ? tb.q : tb.pts[Math.max(1, tb.pts.length - 1 - (R() < .5 ? 1 : 0))];
        grow(start, tilt(tb.dv, side, a), H * (1 - sp.tr) * .55 * (.8 + R() * .4), tb.rEnd * (i === 0 ? .85 : .7), 1); }
    }
    return { H, r0, segs, tips, R, sp, kind };
  }
  // build the full-detail template (opaque MB for wood, foliage MB for leaves) + LOD templates
  function template(kind, v) {
    const key = kind + v; let t = cache.get(key); if (t) return t;
    if (kind === 'bamboo') t = bambooT(v); else if (kind === 'peony' || kind === 'shrub' || kind === 'rose') t = shrubT(kind, v);
    else {
      const S = skeleton(kind, v), sp = S.sp, R = S.R, wood = new MB(), fol = new MB();
      wood.s({ tex: sp.bark, col: sp.bc });
      for (const sg of S.segs) {
        const len = sg.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - sg.pts[i - 1][0], p[1] - sg.pts[i - 1][1], p[2] - sg.pts[i - 1][2]) : 0, 0), circ = TAU * sg.r0;
        if (sg.trunk) { const r0 = sg.r0, ph = R() * TAU, flare = sp.excurrent ? .5 : .9;
          wood.tube(sg.pts, { r: t2 => { const y = t2 * len; return Math.max(.02, r0 * (1 + flare * Math.exp(-y / .45)) * (1 - t2 * (sp.excurrent ? .82 : .3))); }, seg: 9, steps: 2, cap: [false, !sp.excurrent],
            disp: (t2, a) => { const y = t2 * len; return r0 * (.45 * Math.pow(Math.max(0, Math.cos(a * 5 + ph)), 3) * Math.exp(-y / .6) + .06 * Math.sin(a * 13 + y * 2)); }, uvs: [1, Math.max(1, Math.round(len / Math.max(.3, circ)))] });
          // surface roots
          const nr = 4 + ((R() * 3) | 0);
          for (let i = 0; i < nr; i++) { const a = ph / 5 + i * TAU / nr + (R() - .5) * .5, l = r0 * (3 + R() * 3), c = Math.cos(a), s = Math.sin(a);
            wood.tube([[c * r0 * .6, .22, s * r0 * .6], [c * (r0 + l * .4), .05, s * (r0 + l * .4)], [c * (r0 + l), -.12, s * (r0 + l)]], { r: [r0 * .42, r0 * .22, r0 * .08], seg: 5, steps: 2, cap: false, uvs: [1, 2] }); }
        } else {
          const seg = sg.d <= 1 ? 6 : sg.d === 2 ? 4 : 3;
          wood.tube(sg.pts, { r: [sg.r0, lerp(sg.r0, sg.r1, .6), sg.r1, sg.r1].slice(0, sg.pts.length), seg, steps: sg.d <= 1 ? 2 : 1, cap: false, uvs: [1, Math.max(1, Math.round(len / Math.max(.25, circ * 2)))] });
        }
      }
      // soil splash and a little moss low on the trunk; branches slightly lighter toward the tips
      for (let i = 0; i < wood.nv; i++) { const y = wood.P[i * 3 + 1], k = y < 1.4 ? .72 + .28 * Math.max(0, y) / 1.4 : Math.min(1.12, 1 + (y - 1.4) / S.H * .25), g = y < 1.1 && wood.N[i * 3 + 2] < -.2 ? 1.08 : 1;
        wood.C[i * 4] *= k; wood.C[i * 4 + 1] *= k * g; wood.C[i * 4 + 2] *= k * (g > 1 ? .92 : 1); }
      for (const tp of S.tips) if (tp.broken) { wood.s({ tex: 'wood', col: [.75, .66, .56] }).ell(tp.p[0], tp.p[1], tp.p[2], .05, .05, .05, { seg: 5, ring: 3 }); wood.s({ tex: sp.bark, col: sp.bc }); }
      // crown centre & radius (from the branch tips)
      const lt = S.tips.filter(t2 => !t2.broken); let cx = 0, cy = 0, cz = 0; for (const t2 of lt) { cx += t2.p[0]; cy += t2.p[1]; cz += t2.p[2]; } cx /= lt.length; cy /= lt.length; cz /= lt.length;
      let cr = 0, ylo = 1e9, yhi = -1e9; for (const t2 of lt) { cr = Math.max(cr, Math.hypot(t2.p[0] - cx, (t2.p[1] - cy) * .7, t2.p[2] - cz)); ylo = Math.min(ylo, t2.p[1]); yhi = Math.max(yhi, t2.p[1]); }
      // FOLIAGE: leafy twigs. Every attachment point on the outer branches (levels dep-2 .. dep-1) sprouts small twig cards that start ON
      // the branch and point along the twig (card 'up' = twig direction, random roll), so clumps of many small cards build layered volume.
      const leaves = (sp.leaf2 || sp.leaf).map(L_), att = [];
      for (const sg of S.segs) { if (sg.trunk || sg.d < sp.dep - (sp.fdep || (sp.excurrent || sp.weep ? 2 : 3))) continue; const term = sg.d >= sp.dep - 1;
        let gx = 0, gy = 0, gz = 0; for (const q of sg.pts) { gx += q[0]; gy += q[1]; gz += q[2]; } const gc = [gx / sg.pts.length, gy / sg.pts.length, gz / sg.pts.length], clk = .82 + R() * .3;
        for (let i = 1; i < sg.pts.length; i++) { const q = sg.pts[i], pq = sg.pts[i - 1], dir = V3.norm([q[0] - pq[0], q[1] - pq[1], q[2] - pq[2]]);
          // half-way points too, so twigs sit all along the branch
          att.push({ p: [(q[0] + pq[0]) / 2, (q[1] + pq[1]) / 2, (q[2] + pq[2]) / 2], dir, w: term ? 1 : .6, gc, clk, sg });
          att.push({ p: q, dir, w: term ? (i === sg.pts.length - 1 ? 1.8 : 1) : .7, gc, clk, sg }); } }
      const wsum = att.reduce((a, b) => a + b.w, 0) || 1, per = (sp.cards || 600) / wsum, fcs = [];
      for (const a of att) {
        let n = a.w * per; n = Math.floor(n) + (R() < n - Math.floor(n) ? 1 : 0);
        for (let i = 0; i < n; i++) {
          if (sp.weep && i % 2 === 0) { // willow: long hanging whips from the branch
            const hl = Math.min(a.p[1] - .5, 1.4 + R() * 2.6), w = .3 + R() * .25, ang = R() * TAU, k = (.8 + R() * .3) * a.clk;
            const o = V3.norm([a.p[0] - cx, .3, a.p[2] - cz]), col = [k * .95, k, k * .9], ct = [k * 1.08, k * 1.1, k];
            card(fol, a.p[0] + (R() - .5) * .2, a.p[1] - hl, a.p[2] + (R() - .5) * .2, Math.cos(ang) * w / 2, 0, Math.sin(ang) * w / 2, (R() - .5) * .3, hl, (R() - .5) * .3, o[0], o[1], o[2], col, L_('nl_willow_strand'), R() < .5 ? 0 : 1, 0, R() < .5 ? 1 : 0, 1, ct);
            continue; }
          // twig direction: the branch direction swung out by 25–80° around a random azimuth, a little toward the light
          const pd = perp(a.dir), side0 = rotAround(pd, a.dir, R() * TAU); let up = tilt(a.dir, side0, .45 + R() * .95);
          up = V3.norm(V3.add(up, [0, sp.up * .6 + .12 - (sp.droopLeaf || 0), 0]));
          const sz = sp.leafSz * (.75 + R() * .55), roll = R() * TAU;
          let side = rotAround(perp(up), up, roll);
          const base = V3.add(a.p, V3.sc(up, -sz * .06)), mid = V3.add(base, V3.sc(up, sz * .5));
          const co = V3.norm([mid[0] - cx, (mid[1] - cy) * .8, mid[2] - cz]), lo = V3.norm(V3.sub ? V3.sub(mid, a.gc) : [mid[0] - a.gc[0], mid[1] - a.gc[1], mid[2] - a.gc[2]]);
          const nrm = V3.norm([co[0] * .6 + lo[0] * .7, co[1] * .6 + lo[1] * .7 + .35, co[2] * .6 + lo[2] * .7]);
          if (V3.dot(V3.cross(side, up), nrm) < 0) side = V3.sc(side, -1);
          const dIn = Math.min(1.2, Math.hypot(mid[0] - cx, (mid[1] - cy) * .7, mid[2] - cz) / (cr || 1)), hf = clamp((mid[1] - ylo) / Math.max(.1, yhi - ylo), 0, 1);
          const k = (.5 + .36 * dIn + .2 * hf + .12 * Math.max(0, V3.dot(lo, [.3, .8, .2]))) * a.clk * (.9 + R() * .2), hue = (R() - .5) * .1;
          const col = [k * sp.lc[0] * (1 + hue), k * sp.lc[1], k * sp.lc[2] * (1 - hue * 1.5)], ct = [col[0] * 1.07, col[1] * 1.07, col[2] * 1.04];
          const fl = R() < .5; // mirrored texture for variety
          const lay = leaves[(R() * leaves.length) | 0]; card(fol, base[0], base[1], base[2], side[0] * sz / 2, side[1] * sz / 2, side[2] * sz / 2, up[0] * sz, up[1] * sz, up[2] * sz, nrm[0], nrm[1], nrm[2], col, lay, fl ? 1 : 0, 0, fl ? 0 : 1, 1, ct);
          fcs.push({ base, side, up, sz, nrm, col, ct, lay });
        }
      }
      // LOD1: trunk + main limbs + 2–3 big dense cards per outer clump (same skeleton, same colours); LOD2: trunk + a lumpy crown
      const l1 = new MB(), l2 = new MB();
      l1.s({ tex: sp.bark, col: sp.bc });
      const trunk = S.segs[0]; l1.tube([trunk.pts[0], trunk.pts[trunk.pts.length - 1]], { r: [trunk.r0 * 1.2, trunk.r1], seg: 5, steps: 1, cap: false });
      S.segs.filter(sg => sg.d === 1).slice(0, 5).forEach(sg => l1.tube([sg.pts[0], sg.pts[sg.pts.length - 1]], { r: [sg.r0, sg.r1], seg: 3, steps: 1, cap: false }));
      // LOD1 / LOD2: the same sparse cards, fewer and bigger (scaled about their centres), same textures and colours
      const lodCards = (b, n, f) => { if (!fcs.length) return; const st = fcs.length / n; for (let q = 0; q < n; q++) { const c = fcs[Math.floor(q * st + R() * st * .8) % fcs.length], z2 = c.sz * f;
          const cen = V3.add(c.base, V3.sc(c.up, c.sz / 2)), b0 = V3.add(cen, V3.sc(c.up, -z2 / 2));
          card(b, b0[0], b0[1], b0[2], c.side[0] * z2 / 2, c.side[1] * z2 / 2, c.side[2] * z2 / 2, c.up[0] * z2, c.up[1] * z2, c.up[2] * z2, c.nrm[0], c.nrm[1], c.nrm[2], c.col, c.lay, 0, 0, 1, 1, c.ct); } };
      if (sp.weep) { const ws = L_('nl_willow_strand'); for (let q = 0; q < 26; q++) { const a = att[(R() * att.length) | 0]; if (!a) break; const hl = Math.min(a.p[1] - .5, 2 + R() * 2), w = 1.2, an = R() * TAU, k = .9 * a.clk;
          card(l1, a.p[0], a.p[1] - hl, a.p[2], Math.cos(an) * w / 2, 0, Math.sin(an) * w / 2, 0, hl, 0, 0, .5, .8, [k * .95, k, k * .9], ws); }
        for (let q = 0; q < 6; q++) { const a = att[(R() * att.length) | 0]; if (!a) break; const hl = Math.min(a.p[1] - .5, 3), an = R() * TAU, k = .9 * a.clk; card(l2, a.p[0], a.p[1] - hl, a.p[2], Math.cos(an) * 1.6, 0, Math.sin(an) * 1.6, 0, hl, 0, 0, .5, .8, [k * .95, k, k * .9], ws); } }
      lodCards(l1, sp.weep ? 30 : 75, 1.45); lodCards(l2, sp.weep ? 8 : 24, 1.9);
      l2.s({ tex: sp.bark, col: sp.bc }).tube([trunk.pts[0], [cx * .5, ylo + (yhi - ylo) * .35, cz * .5]], { r: [trunk.r0, trunk.r0 * .6], seg: 3, steps: 1, cap: false });
      t = { wood, fol, l1, l2, r0: S.r0, H: S.H, cr, cy };
    }
    cache.set(key, t); return t;
  }
  // bamboo clump 竹: culms with nodes, arching, leaf fans up top
  function bambooT(v) {
    const R = RNG(4242 + v), wood = new MB(), fol = new MB(), l1 = new MB(), l2 = new MB(), n = 14 + ((R() * 10) | 0), lay = L_('nl_bamboo');
    wood.s({ tex: 'nb_bamboo', col: [1, 1, 1] }); l1.s({ tex: 'nb_bamboo', col: [1, 1, 1] });
    for (let i = 0; i < n; i++) { const a = R() * TAU, d = Math.sqrt(R()) * .9, h = 4.5 + R() * 3, r = .025 + R() * .025, out = .15 + R() * .25, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const top = [x + Math.cos(a) * h * out, h, z + Math.sin(a) * h * out], mid = [x + Math.cos(a) * h * out * .3, h * .55, z + Math.sin(a) * h * out * .3];
      wood.tube([[x, -.1, z], mid, top], { r: [r, r * .8, r * .4], seg: 4, steps: 2, cap: false, uvs: [1, Math.round(h / 1.2)] });
      if (i % 3 === 0) l1.tube([[x, -.1, z], top], { r: [r, r * .5], seg: 3, steps: 1, cap: false });
      for (let k = 0; k < 6; k++) { const t2 = .45 + k * .1, p = [lerp(x, top[0], t2 * t2), h * t2, lerp(z, top[2], t2 * t2)], sz = .9 + R() * .5, b2 = R() * TAU, up = V3.norm([Math.cos(b2) * .8 + Math.cos(a) * .5, .3 + R() * .5, Math.sin(b2) * .8 + Math.sin(a) * .5]);
        let side = V3.norm(V3.cross(up, [0, 1, 0])); const o = V3.norm([Math.cos(a), .4, Math.sin(a)]); if (V3.dot(V3.cross(side, up), o) < 0) side = V3.sc(side, -1);
        const k2 = .8 + t2 * .35 + R() * .1, col = [k2, k2, k2 * .95];
        card(fol, p[0], p[1], p[2], side[0] * sz / 2, side[1] * sz / 2, side[2] * sz / 2, up[0] * sz, up[1] * sz, up[2] * sz, o[0], o[1], o[2], col, lay);
        if (k % 3 === 1) card(l1, p[0], p[1], p[2], side[0] * sz, side[1] * sz, side[2] * sz, up[0] * sz * 2, up[1] * sz * 2, up[2] * sz * 2, o[0], o[1], o[2], col, lay); } }
    l2.add(l1);
    return { wood, fol, l1, l2, r0: .9, H: 7, cr: 1.5, cy: 4, clump: true };
  }
  // peony 牡丹 bush (summer: foliage only — the flowers were in the 3rd month) / generic shrub
  function shrubT(kind, v) {
    const R = RNG(777 + v * 13 + kind.length), wood = new MB(), fol = new MB(), l1 = new MB(), l2 = new MB(), lay = L_(kind === 'peony' ? 'nl_peony' : kind === 'rose' ? 'nl_rose' : 'nl_shrub'), n = kind === 'peony' ? 9 : kind === 'rose' ? 18 : 14, H = kind === 'peony' ? 1.1 : kind === 'rose' ? 1.3 : 1.5;
    wood.s({ tex: 'nb_smooth', col: [.6, .55, .5] });
    for (let i = 0; i < n; i++) { const a = R() * TAU, d = R() * .25, out = .3 + R() * .5, h = H * (.6 + R() * .5), tip = [Math.cos(a) * (d + h * out), h, Math.sin(a) * (d + h * out)];
      wood.tube([[Math.cos(a) * d, -.05, Math.sin(a) * d], tip], { r: [.018, .008], seg: 3, steps: 1, cap: false });
      for (let k = 0; k < 2; k++) { const sz = (kind === 'peony' ? .7 : .65) * (.8 + R() * .4), o = V3.norm([Math.cos(a), .5 + R() * .4, Math.sin(a)]), up = V3.norm([o[0] * .6 + (R() - .5) * .6, .8, o[2] * .6 + (R() - .5) * .6]);
        let side = V3.norm(V3.cross(up, o)); if (V3.dot(V3.cross(side, up), o) < 0) side = V3.sc(side, -1); const kk = .8 + R() * .3, b0 = V3.add(tip, V3.sc(up, -sz * (.5 + k * .2)));
        card(fol, b0[0], b0[1], b0[2], side[0] * sz / 2, side[1] * sz / 2, side[2] * sz / 2, up[0] * sz, up[1] * sz, up[2] * sz, o[0], o[1], o[2], [kk, kk, kk], lay); } }
    l1.add(fol); l2.add(fol); // shrubs are tiny: the same sparse cards at every distance
    return { wood, fol, l1, l2, r0: .3, H, cr: H * .8, cy: H * .5, shrub: true };
  }
  const tintOf = (seed, kind) => { const R = RNG(seed * 7 + 3), k = .92 + R() * .16, h = (R() - .5) * .08; return [k * (1 + h), k, k * (1 - h * 1.5)]; };
  N.tree = function (L, x, y, z, kind, s = 1, seed = 1) {
    if (!SP[kind] && kind !== 'bamboo' && kind !== 'peony' && kind !== 'shrub' && kind !== 'rose') kind = 'huai';
    const v = ((seed >>> 0) % NV), t = template(kind, v), R = RNG(seed + 11), yaw = R() * TAU, sx = s * (.88 + R() * .24), sz = s * (.88 + R() * .24), sy = s * (.9 + R() * .2);
    put(L.mb, t.wood, x, y, z, yaw, sx, sy, sz); put(L.fol, t.fol, x, y, z, yaw, sx, sy, sz, tintOf(seed, kind));
    if (t.clump) { L.world.cyl(x, z, y, y + 3, .9 * s); return; }
    if (t.shrub) return;
    L.world.cyl(x, z, y, y + 3, Math.max(.12, t.r0 * 1.15 * s), {});
    // a natural base: raised dark soil with litter round the root flare, grass/weeds/ferns clustered between the roots
    if (y > -.05 && y < .05 && s > .6) (L._nb || (L._nb = [])).push([x, z, t, s, kind, seed]); // emitted by NATURE.yard / NATURE.chunk after the door aprons are known
    // the bare, trodden ground and leaf/flower litter under a big tree
    if (y > -.05 && y < .05 && !t.shrub && (kind === 'huai' || kind === 'elm' || kind === 'willow' || kind === 'tong' || kind === 'mulberry' || kind === 'jujube')) {
      const lr = Math.min(3.2, t.cr * s * .7); decalAt(L.fol, x, z, lr * 2, lr * 2, R() * TAU, kind === 'huai' ? 'nd_litter' : (R() < .5 ? 'nd_litter' : 'nd_damp'), [.95, .95, .95]);
      if (kind === 'huai') decalAt(L.fol, x + (R() - .5) * 2, z + (R() - .5) * 2, 5 + R() * 2, 4 + R() * 2, R() * TAU, 'nd_dust', [1.04, 1.02, 1]);
    }
  };
  // tree base templates (cached): an irregular low soil mound (rim just below ground) + tufts; LOD version: a flat-ish mound + 2 tufts
  const BASE = new Map();
  function baseT(v, lod) { const key = v * 2 + (lod ? 1 : 0); let t = BASE.get(key); if (t) return t; const R = RNG(9100 + v * 31), m = new MB(), f = new MB(), seg = lod ? 7 : 14, rad = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU; rad.push(1 + .28 * Math.sin(a * 2 + R() * 6) + .2 * Math.sin(a * 3 + R() * 6) + (R() - .5) * .25); }
    m.s({ tex: 'nd_soil', col: [1, 1, 1] }); const rings = lod ? [[0, .07], [1, -.03]] : [[0, .085], [.35, .07], [.7, .04], [1, -.025]], base = m.nv;
    for (const [rf, h] of rings) for (let i = 0; i <= seg; i++) { const a = i / seg * TAU, r = rf * rad[i % seg], px = Math.cos(a) * r, pz = Math.sin(a) * r; m.v(px, h, pz, -px * .15, 1, -pz * .15, px * .9, pz * .9); }
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) { const a0 = base + k * (seg + 1) + i, b0 = a0 + seg + 1; m.I.push(a0, a0 + 1, b0 + 1, a0, b0 + 1, b0); }
    // tufts: denser near the flare and on the north (-z) side; ferns and the odd low bush
    const nT = lod ? 3 : 22; for (let i = 0; i < nT; i++) { let a = R() * TAU; if (R() < .45) a = -PI / 2 + (R() - .5) * 2.2; const rr = .25 + Math.pow(R(), 1.6) * (lod ? .9 : 1.9), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const r2 = R(), tex = r2 < .38 ? 'ng_grass' : r2 < .6 ? 'ng_weed' : r2 < .75 ? 'ng_fern' : r2 < .86 ? 'ng_dry' : r2 < .94 ? 'ng_flower' : 'nl_shrub', big = tex === 'nl_shrub', sc = big ? .55 + R() * .3 : (.25 + R() * .3) * (1.2 - rr * .25);
      const k = .82 + R() * .25; tuft(f, x, rr < .9 ? .03 : 0, z, sc * (tex === 'ng_fern' ? 1.4 : 1), sc, R() * PI, L_(tex), [k, k * (z < 0 ? 1.02 : .98), k * .92], 2, (R() - .5) * .3); }
    t = { m, f }; BASE.set(key, t); return t; }
  function treeBase(L, x, z, t, s, kind, seed, lod) { const R = RNG(seed * 13 + 7), r0 = Math.max(.12, t.r0 || .3) * s, sz = clamp(r0 * 3.6 + .55, .7, 1.6) * (t.clump ? 1.3 : 1);
    const tb = baseT(seed % 5, lod); put(L.mb, tb.m, x, 0, z, R() * TAU, sz, 1, sz * (.85 + R() * .3)); put(L.fol, tb.f, x, 0, z, R() * TAU, s * .95 + .05, .9 + R() * .25, s * .95 + .05); }
  // door aprons and buildings recorded by the kit in lot.foot (lot-local rects): world point test with a margin
  const footHit = (lot, x, z, r) => { if (!lot || !lot.foot || !lot.foot.length) return false; const F = lot._F || (lot._F = COMP.frame(lot).F), dx = x - F.x, dz = z - F.z, lx = F.c * dx - F.s * dz, lz = F.s * dx + F.c * dz;
    for (const f of lot.foot) if (lx > f[0] - r && lx < f[2] + r && lz > f[1] - r && lz < f[3] + r) return true; return false; };
  const flushBases = (L, lots) => { if (!L._nb) return; for (const [x, z, t, s, kind, seed] of L._nb) if (!lots.some(l => footHit(l, x, z, 1.8 * s))) treeBase(L, x, z, t, s, kind, seed); L._nb = null; };
  N.treeLod = function (L, x, y, z, kind, s = 1, seed = 1, lod = 1) {
    if (!SP[kind] && kind !== 'bamboo' && kind !== 'peony' && kind !== 'shrub' && kind !== 'rose') kind = 'huai';
    const v = ((seed >>> 0) % NV), t = template(kind, v), R = RNG(seed + 11), yaw = R() * TAU, sx = s * (.88 + R() * .24), sz = s * (.88 + R() * .24), sy = s * (.9 + R() * .2);
    put(L.fol, lod >= 2 ? t.l2 : t.l1, x, y, z, yaw, sx, sy, sz, tintOf(seed, kind));
    if (lod === 1 && y > -.05 && y < .05 && s > .6 && !t.shrub) treeBase(L, x, z, t, s, kind, seed, true);
  };
  N._template = template; N._SP = SP;

  // ============================================================================================
  // decal registry: overlapping ground decals get distinct heights (≥ 6 mm apart), all ≥ 1.6 cm above the ground
  // ============================================================================================
  const DREG = new Map(); let dcount = 0; const DLV = [.017, .0235, .03, .0365, .072, .0785, .085]; // skips 4–7 cm, where kit paving/kerb tops sit
  function decalAt(b, x, z, w, d, a, tex, col, uv) {
    if (dcount > 6000) { DREG.clear(); dcount = 0; }
    const r = Math.max(w, d) * .72, used = new Set(), ci = Math.floor(x / 4), cj = Math.floor(z / 4), rc = Math.ceil(r / 4);
    for (let i = ci - rc - 1; i <= ci + rc + 1; i++) for (let j = cj - rc - 1; j <= cj + rc + 1; j++) { const a2 = DREG.get(i * 100003 + j); if (a2) for (const e of a2) if (Math.hypot(e[0] - x, e[1] - z) < e[2] + r) used.add(e[3]); }
    let lv = 0; while (used.has(lv) && lv < DLV.length) lv++; if (lv >= DLV.length) return false;
    const k = ci * 100003 + cj; let a2 = DREG.get(k); if (!a2) DREG.set(k, a2 = []); a2.push([x, z, r, lv]); dcount++;
    decal(b, x, DLV[lv], z, w, d, a, L_(tex), col, uv ? uv[0] : 1, uv ? uv[1] : 1); return true;
  }
  // ============================================================================================
  // PROP TEMPLATES (cached MBs in local coordinates, base on y=0, front = +z)
  // ============================================================================================
  const PT = new Map();
  const tpl = (name, fn) => { let t = PT.get(name); if (!t) { t = { m: new MB(), f: new MB() }; fn(t.m, t.f); PT.set(name, t); } return t; };
  const stamp = (L, name, fn, x, y, z, yaw = 0, s = 1, tint) => { const t = tpl(name, fn); put(L.mb, t.m, x, y, z, yaw, s, s, s, tint); put(L.fol, t.f, x, y, z, yaw, s, s, s, tint); };
  const log = (b, x, y, z, len, r, ry, rz) => { b.s({ tex: 'nb_willow', col: [.9, .82, .72] }).T(x, y, z, PI / 2, ry, 0).lathe([[0, -len / 2], [r, -len / 2], [r * .95, len / 2], [0, len / 2]], { seg: 5, uvs: [1, 1] }).pop(); };
  const P2 = {
    stone: (k) => (b) => { const R = RNG(k * 31 + 5); b.s({ tex: 'boulder', col: [1.15 + R() * .2, 1.1 + R() * .15, 1.0 + R() * .12] }).ell(0, .02, 0, .5, .32 + R() * .2, .4 + R() * .2, { seg: 4, ring: 3, disp: lumpy(.25, 1.6, k * 7 + 1) }); },
    dung: (k) => (b) => { const R = RNG(k + 90); for (let i = 0; i < 4 + k; i++) b.s({ tex: 'mud', col: [1.5 + R() * .2, 1.35, 1.0] }).ell((i % 3 - 1) * .13 + (R() - .5) * .03, .01 + i * .007, (Math.floor(i / 3) - .5) * .14, .055 + R() * .02, .035 + i * .004, .05, { seg: 5, ring: 3 }); },
    shards: (k) => (b) => { const R = RNG(k + 120); for (let i = 0; i < 5; i++) { b.s({ tex: R() < .5 ? 'glaze' : (R() < .5 ? 'celadon' : 'rammed_earth'), col: [1, 1, 1] }).T((R() - .5) * .5, .03, (R() - .5) * .5, (R() - .5) * .8, R() * 3, (R() - .5) * .8).box(0, 0, 0, .06 + R() * .08, .012, .05 + R() * .06).pop(); } },
    firewood: (k) => (b) => { const R = RNG(k + 7); const L0 = .9 + R() * .5; for (let row = 0; row < 4; row++) for (let i = 0; i < 8 - row; i++) log(b, (i - (8 - row) / 2) * .15, .07 + row * .128, (((i * 7 + row * 3) % 11) - 5) * .009, L0 * (.9 + R() * .2) + ((i + row) % 3) * .013, .06 + R() * .008, 0, PI / 2);
      },
    brush: (k) => (b, f) => { const R = RNG(k + 17); for (let i = 0; i < 3; i++) { const x = (i - 1) * .35, a = (R() - .5) * .3; b.s({ tex: 'straw', col: [.7, .6, .45] }).T(x, 0, 0, -.25, 0, a).lathe([[0, 0], [.16, 0], [.16, .02], [.13, 1.4], [0, 1.45]], { seg: 6, uvs: [2, 2] }); b.s({ tex: 'rope', col: [.9, .8, .6] }).lathe([[.155, .45], [.165, .5], [.155, .55]], { seg: 6 }).lathe([[.145, .95], [.155, 1], [.145, 1.05]], { seg: 6 }).pop(); }
      f.s({ tex: 'ng_dry', col: [.8, .7, .55] }); for (let i = 0; i < 3; i++) { const x = (i - 1) * .35; card(f, x, 1.2, -.3 + i * .05, .16, 0, 0, 0, .5, .1, 0, 1, 0, [.75, .66, .5], L_('ng_dry')); } },
    jars: (k) => (b) => { const R = RNG(k + 33), n = 2 + (k % 3); for (let i = 0; i < n; i++) { b.T((i - (n - 1) / 2) * .6 + (R() - .5) * .1, 0, (R() - .5) * .3, 0, R() * 6, 0); PROPS.wineJar(b, .7 + R() * .4, R() < .5); b.pop(); } if (k % 2) { b.T(.3, .02, .55, PI / 2 - .2, .4, 0); PROPS.jar(b, .45); b.pop(); } },
    sacks: (k) => (b) => { const R = RNG(k + 44); const n = 3 + (k % 3); for (let i = 0; i < n; i++) { const top = i >= n - 1 && n > 3; b.T(top ? 0 : (i - (n - 2) / 2) * .45, top ? .42 : 0, top ? 0 : (R() - .5) * .2, top ? PI / 2 : 0, R() * 6, 0); PROPS.sack(b, .9 + R() * .3, k + i); b.pop(); } },
    baskets: (k) => (b) => { const R = RNG(k + 55); for (let i = 0; i < 3; i++) { b.T(i * .1 - .1, i * .17, 0); PROPS.basket(b, .3 - i * .015, .3); b.pop(); } b.T(.6, .2, .1, PI / 2 + .2, 1, 0); PROPS.basket(b, .26, .3); b.pop();
      b.T(-.6, 0, .2); PROPS.basket(b, .3, .28); b.s({ tex: R() < .5 ? 'grass' : 'moss', col: [.9, 1, .7] }).ell(0, .27, 0, .26, .1, .26, { seg: 6, ring: 3, disp: lumpy(.3, 6, k) }); b.pop(); },
    crates: (k) => (b) => { const R = RNG(k + 66); for (let i = 0; i < 3; i++) { const w = .5 + R() * .3, h = .35 + R() * .2, top = i === 2; b.T(top ? .1 : (i - .5) * .75, top ? .45 : 0, (R() - .5) * .2, 0, (R() - .5) * .3, 0); b.s({ tex: 'plank', col: [.75, .62, .5] }).box(0, h / 2, 0, w, h, w * .8, { uv: [1, 1] }); b.s({ tex: 'rope', col: [.9, .8, .6] }).box(0, h / 2, 0, w + .015, h * .1 + .02, w * .8 + .015); b.pop(); } },
    pots: (k) => (b) => { const R = RNG(k + 77); for (let i = 0; i < 6; i++) { const tx = R() < .5 ? 'celadon' : 'glaze'; b.T((i % 3 - 1) * .32, 0, (Math.floor(i / 3) - .5) * .34); for (let j = 0; j < 2 + (R() * 3 | 0); j++) { b.T(0, .074 + j * .055, 0); PROPS.bowl(b, .13, tx); b.pop(); } b.pop(); } b.T(0, .052, 0); PROPS.strawMat(b, 1.3, 1); b.pop(); },
    cloth: (k) => (b) => { const R = RNG(k + 88); b.T(0, .052, 0); PROPS.strawMat(b, 1.4, 1); b.pop(); const cs = [[.7, .3, .25], [.3, .4, .6], [.85, .8, .65], [.4, .55, .35], [.6, .45, .3]]; for (let i = 0; i < 5; i++) { b.s({ tex: 'silk', col: cs[(i + k) % 5] }).T(0, .152, (i - 2) * .18, 0, 0, PI / 2).lathe([[0, -.38], [.08, -.38], [.08, -.38], [.08, .38], [.08, .38], [0, .38]], { seg: 6 }).pop(); } },
    veg: (k) => (b) => { const R = RNG(k + 99); for (let i = 0; i < 3; i++) { b.T((i - 1) * .62, 0, (R() - .5) * .2); PROPS.basket(b, .27, .26); const c = [[.5, .7, .3], [.7, .6, .3], [.45, .62, .35]][i]; for (let j = 0; j < 7; j++) b.s({ tex: 'moss', col: c }).ell(((j % 3) - 1) * .13 + (R() - .5) * .02, .25 + j * .013, (Math.floor(j / 3) - 1) * .13, .065 + R() * .02, .055 + j * .002, .065, { seg: 5, ring: 3 }); b.pop(); }
      b.s({ tex: 'moss', col: [.75, .9, .6] }); for (let j = 0; j < 3; j++) b.T(-.5 + j * .5, .1 + j * .01, .55, 0, R(), PI / 2).ell(0, 0, 0, .1, .22, .1, { seg: 6, ring: 4 }).pop(); },
    cart: (k) => (b) => { // Tang two-wheeled hand cart 手車: plank bed, two shafts resting on the ground, spoked wheels
      b.T(0, 0, 0, -.12, 0, 0); b.s({ tex: 'plank', col: [.72, .6, .48] }).box(0, .675, 0, 0.96, .05, 1.5, { uv: [2, 2] }); b.s({ tex: 'dark_wood', col: [.85, .8, .75] });
      for (const sx of [-1, 1]) { b.box(sx * .52, .62, .4, .07, .07, 2.6); b.box(sx * .5, .75, 0, .05, .22, 1.42); } b.box(0, .6, 1.5, 1.1, .05, .05); b.pop();
      for (const sx of [-1, 1]) { b.T(sx * .62, .5, -.15); wheel(b, .5, .07, 12); b.pop(); }
      if (k % 2) { b.T(0, .68, -.2, -.12, 0, 0); PROPS.sack(b, .8, 3); b.T(.3, 0, .4); PROPS.sack(b, .75, 4); b.pop(); b.pop(); } },
    huchuang: (k) => (b) => { b.s({ tex: 'dark_wood', col: [.8, .7, .6] }); for (const sz of [-1, 1]) for (const sx of [-1, 1]) b.T(sx * .16, .2, sz * .02, 0, 0, sx * .6).box(0, 0, 0, .025, .5, .025).pop(); for (const sx of [-1, 1]) b.box(sx * .3, .4, 0, .03, .03, .34);
      b.s({ tex: 'rope', col: [.8, .7, .55] }).box(0, .41, 0, .55, .015, .3); },
    trough: (k) => (b) => { b.s({ tex: 'stone', col: [.85, .82, .76] }); b.box(0, .2, .22, 1.5, .4, .1, { world: 1 }); b.box(0, .2, -.22, 1.5, .4, .1, { world: 1 }); b.box(.7, .2, 0, .1, .4, .34, { world: 1 }); b.box(-.7, .2, 0, .1, .4, .34, { world: 1 }); b.box(0, .05, 0, 1.3, .1, .34, { world: 1 });
      b.s({ tex: 'water', col: [.8, .9, .95] }).box(0, .3, 0, 1.3, .02, .34); },
    hitch: (k) => (b) => { b.s({ tex: 'wood', col: [.7, .6, .5] }).lathe([[0, 0], [.09, 0], [.08, 1.1], [.06, 1.2], [0, 1.22]], { seg: 6 }); b.s({ tex: 'iron', col: [1, 1, 1] }).T(0, .95, .09, PI / 2, 0, 0).lathe([[.06, -.012], [.075, 0], [.06, .012]], { seg: 8 }).pop(); },
    block: (k) => (b) => { b.s({ tex: 'stone', col: [.82, .8, .76] }).box(0, .2, 0, .9, .4, .55, { world: 1 }).box(.15, .5, 0, .6, .2, .55, { world: 1 }); },
    lowbench: (k) => (b) => { b.s({ tex: 'stone', col: [.8, .78, .74] }).box(-.6, .14, 0, .25, .28, .3).box(.6, .14, 0, .25, .28, .3); b.s({ tex: 'plank', col: [.7, .6, .5] }).box(0, .31, 0, 1.6, .06, .32, { uv: [2, 1] }); },
    mound: (k) => (b, f) => { const R = RNG(k + 5); b.s({ tex: k % 2 ? 'loess' : 'dirt', col: [1, 1, 1] }).ell(0, -.05, 0, .7 + R() * .5, .3 + R() * .2, .6 + R() * .4, { seg: 8, ring: 4, disp: lumpy(.2, 2, k * 3) });
      for (let i = 0; i < 4; i++) tuft(f, (R() - .5) * 1, .1, (R() - .5) * .8, .4, .35, R() * 3, L_('ng_grass'), [.85, .85, .8]); },
    refuse: (k) => (b, f) => { const R = RNG(k + 6); b.s({ tex: 'dirt', col: [.75, .72, .7] }).ell(0, -.05, 0, .8, .3, .6, { seg: 8, ring: 4, disp: lumpy(.3, 2.4, k * 5) }); P2.shards(k)(b);
      b.T(.4, .15, .2, .8, 0, .3); PROPS.basket(b, .22, .25); b.pop(); b.s({ tex: 'bone', col: [.9, .88, .8] }).T(-.3, .2, .1, .3, 1, 0).box(0, 0, 0, .25, .03, .03).pop(); for (let i = 0; i < 3; i++) tuft(f, (R() - .5) * 1.4, 0, (R() - .5) * 1, .5, .4, R() * 3, L_('ng_weed'), [.9, .9, .85]); },
    hay: (k) => (b) => { b.s({ tex: 'straw', col: [1, .92, .75] }).ell(0, .1, 0, .9, .8, .8, { seg: 9, ring: 5, disp: lumpy(.12, 3, k), uvs: [3, 2] }); },
    tool: (k) => (b) => { // a hoe 钁 / rake 杷 leaning back against a wall (top toward -z)
      b.s({ tex: 'wood', col: [.8, .7, .55] }).T(0, 0, 0, -.28, 0, 0).box(0, .9, 0, .035, 1.6, .035); b.s({ tex: 'iron', col: [1, 1, 1] }); if (k % 2) b.box(0, .135, .1, .18, .04, .16); else { b.box(0, .14, .006, .4, .04, .062); for (let i = 0; i < 6; i++) b.box(-.17 + i * .068, .065, .035, .015, .06, .015); } b.pop(); },
    pole: (k) => (b) => { b.s({ tex: 'bamboo', col: [.9, .75, .5] }).T(0, 0, 0, -.2, 0, 0).box(0, .95, 0, .07, 1.9, .03).pop(); b.T(.5, 0, .25); PROPS.basket(b, .26, .3); b.pop(); b.T(-.45, 0, .35); PROPS.basket(b, .26, .3); b.pop(); },
    ladder: (k) => (b) => { b.s({ tex: 'bamboo', col: [.85, .75, .55] }).T(0, 0, 0, -.25, 0, 0); for (const sx of [-1, 1]) b.box(sx * .22, 1.4, 0, .05, 2.8, .05); for (let i = 0; i < 8; i++) b.box(0, .3 + i * .33, 0, .44, .03, .03); b.pop(); },
    tiles: (k) => (b) => { b.s({ tex: 'roof_tile', col: [.8, .8, .82] }); for (let i = 0; i < 3; i++) b.box((i - 1) * .4, .2, 0, .34, .4, .5, { uv: [1, 1] }); b.s({ tex: 'brick', col: [.9, .85, .8] }).box(.1, .52, 0, 1.1, .24, .5, { world: 1 }); },
    stove: (k) => (b) => { // clay cooking stove 灶 with an iron pot and a fire mouth, outdoors under the eaves
      b.s({ tex: 'rammed_earth', col: [.9, .82, .72] }).box(0, .35, 0, 1.0, .7, .7, { world: 1 }); b.s({ tex: 'embers', col: [.25, .2, .18] }).box(0, .2, .355, .28, .22, .02);
      b.s({ tex: 'iron', col: [.6, .6, .6] }).T(0, .7, 0).lathe([[0, -.12], [.18, -.06], [.27, .04], [.29, .06], [.27, .07]], { seg: 9 }).pop(); b.s({ tex: 'wood', col: [.6, .5, .4] }).box(.36, .73, .1, .25, .03, .25);
      b.s({ tex: 'rammed_earth', col: [.8, .74, .66] }).box(-.35, 1.1, -.25, .18, .8, .18); },
    oven: (k) => (b) => { b.s({ tex: 'rammed_earth', col: [.95, .85, .72] }).lathe([[0, 0], [.55, 0], [.55, 0], [.5, .5], [.32, .9], [.2, .95], [.18, .9], [0, .85]], { seg: 10, uvs: [3, 1] }); b.s({ tex: 'embers', col: [.3, .25, .2] }).box(0, .18, .52, .22, .2, .04); },
    quern: (k) => (b) => { b.s({ tex: 'stone', col: [.85, .84, .8] }).cyl(0, 0, 0, .55, .45, { seg: 10 }).cyl(0, .45, 0, .36, .62, { seg: 10 }).cyl(0, .62, 0, .34, .78, { seg: 10 }); b.s({ tex: 'wood', col: [.7, .6, .5] }).T(.3, .9, 0, 0, 0, .1).box(0, 0, 0, .05, .25, .05).pop(); },
    mortar: (k) => (b) => { b.s({ tex: 'stone', col: [.8, .8, .76] }).lathe([[0, 0], [.28, 0], [.26, .42], [.2, .4], [.12, .22], [0, .25]], { seg: 9 }); b.s({ tex: 'wood', col: [.75, .65, .5] }).T(.05, .55, 0, 0, 0, .25).box(0, 0, 0, .07, .9, .07).pop(); },
    washing: (k) => (b, f) => { const R = RNG(k + 3); b.s({ tex: 'bamboo', col: [.9, .8, .6] }); for (const sx of [-1.4, 1.4]) { b.T(sx, 0, .03, .3, 0, 0).box(0, .85, 0, .04, 1.8, .04).pop(); b.T(sx, 0, -.03, -.3, 0, 0).box(0, .85, 0, .045, 1.8, .045).pop(); }
      b.T(0, 1.72, 0, 0, 0, PI / 2).box(0, 0, 0, .035, 3.2, .035).pop(); const cs = [[.95, .92, .85], [.45, .55, .7], [.75, .45, .35], [.9, .85, .7], [.5, .6, .45]];
      for (let i = 0; i < 4; i++) { const x = -1 + i * .62 + R() * .1, w = .3 + R() * .2, h = .7 + R() * .5, c = cs[(i + k) % 5]; card(f, x, 1.72 - h, (i % 2 ? .025 : -.025) + i * .004, w / 2, 0, 0, 0, h, 0, 0, .3, 1, c, L_('nd_cloth')); } },
    mat: (k) => (b) => { b.T(0, .052, 0); PROPS.strawMat(b, 2, 1.3); b.pop(); b.s({ tex: 'nd_grain', col: [1, 1, 1] }).box(0, .095, 0, 1.7, .03, 1.05, { uv: [1, 1] }); b.T(1.25, 0, .2); PROPS.basket(b, .25, .25); b.pop(); },
    coop: (k) => (b) => { b.s({ tex: 'mat', col: [.8, .7, .55] }).lathe([[0, 0], [.55, 0], [.55, 0], [.5, .4], [.3, .7], [0, .78]], { seg: 9, uvs: [3, 1] }); b.s({ tex: 'dark_wood', col: [.3, .25, .2] }).box(0, .17, .52, .26, .3, .06); },
    chicken: (k) => (b) => { const c = [[.8, .55, .32], [.95, .92, .85], [.4, .3, .25], [.7, .45, .3]][k % 4]; b.s({ tex: 'felt', col: c }).ell(0, .2, 0, .09, .09, .14, { seg: 6, ring: 4 }).ell(0, .32, .1, .05, .06, .05, { seg: 5, ring: 3 }); b.s({ tex: 'felt', col: [c[0] * .8, c[1] * .8, c[2] * .8] }).T(0, .3, -.12, .6, 0, 0).box(0, 0, 0, .04, .14, .08).pop();
      b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .39, .11, .015, .04, .04); b.s({ tex: 'brass', col: [1, 1, 1] }).box(0, .31, .16, .02, .02, .04).box(.03, .06, 0, .015, .12, .015).box(-.03, .06, 0, .015, .12, .015); },
    kennel: (k) => (b) => { b.s({ tex: 'plank', col: [.6, .5, .42] }).box(0, .3, 0, .8, .6, .9, { uv: [1, 1] }); b.s({ tex: 'dark_wood', col: [.15, .12, .1] }).box(0, .22, .455, .3, .36, .02); b.s({ tex: 'straw', col: [.9, .8, .6] }).T(0, .66, 0, 0, 0, 0).box(0, 0, 0, 1.0, .12, 1.1).pop(); },
    dog: (k) => (b) => { const c = k % 2 ? [.75, .6, .4] : [.35, .3, .25]; b.s({ tex: 'felt', col: c }).ell(0, .16, 0, .22, .12, .3, { seg: 7, ring: 4 }).ell(0, .2, .3, .1, .09, .12, { seg: 6, ring: 3 }).box(.06, .3, .28, .03, .06, .03).box(-.06, .3, .28, .03, .06, .03); }, // curled up asleep
    shrine: (k) => (b) => { b.s({ tex: 'brick', col: [.85, .8, .75] }).box(0, .35, 0, .7, .7, .45, { world: 1 }); b.s({ tex: 'plaster', col: [.8, .78, .72] }).box(0, .95, 0, .6, .5, .4); b.s({ tex: 'dark_wood', col: [.25, .2, .18] }).box(0, .95, .205, .34, .36, .01);
      b.s({ tex: 'roof_tile', col: [.8, .8, .82] }).T(0, 1.25, 0).box(0, 0, 0, .84, .08, .6).pop(); b.T(0, .7, .3); PROPS.incenseBurner(b, .25, .6); b.pop(); },
    pot: (k) => (b, f) => { const R = RNG(k + 4); b.s({ tex: k % 2 ? 'glaze' : 'rammed_earth', col: [1, 1, 1] }).lathe([[0, 0], [.14, 0], [.2, .22], [.22, .28], [.2, .3], [0, .27]], { seg: 8 }); tuft(f, 0, .27, 0, .45, .5, R() * 3, L_(k % 3 ? 'ng_daylily' : 'ng_flower'), [1, 1, 1], 3); },
    planter: (k) => (b) => { b.s({ tex: 'stone', col: [.85, .83, .78] }).box(0, .25, 0, .9, .5, .9, { world: 1 }); b.s({ tex: 'dirt', col: [.7, .6, .5] }).box(0, .48, 0, .8, .03, .8); },
    taihu: (k) => (b) => { b.s({ tex: 'stone', col: [.75, .74, .7] }).box(0, .1, 0, 1.2, .2, .9, { world: 1 }); b.T(0, .15, 0); PROPS.taihu(b, 1.8 + (k % 3) * .4, k + 3); b.pop(); },
    roller: (k) => (b) => { b.s({ tex: 'stone', col: [.8, .78, .74] }).T(0, .28, 0, 0, 0, PI / 2).lathe([[0, -.4], [.26, -.4], [.26, -.4], [.28, .4], [.28, .4], [0, .4]], { seg: 9 }).pop(); },
    oldwheel: (k) => (b) => { b.T(0, .09, 0, 0, 0, PI / 2 - .12); wheel(b, .5, .07, 10); b.pop(); },
    pebbles: (k) => (b) => { const R = RNG(k + 61); for (let i = 0; i < 7; i++) { const s2 = .03 + R() * R() * .07, c = .65 + R() * .3; b.s({ tex: 'boulder', col: [c, c * .96, c * .9] }).ell((R() - .5) * .9, s2 * .2, (R() - .5) * .9, s2 * 1.2, s2 * .7, s2, { seg: 3, ring: 2 }); } },
    vegbed: (k) => (b, f) => { const R = RNG(k + 31); b.s({ tex: 'dirt', col: [.85, .75, .62] }); for (let i = 0; i < 4; i++) { b.box(0, .07 + i * .006, (i - 1.5) * .62, 2.6, .14 + i * .012, .42, { world: 1, skip: ['bot'] }); for (let j = 0; j < 6; j++) tuft(f, -1.1 + j * .44 + (R() - .5) * .08, .14, (i - 1.5) * .62 + (R() - .5) * .06, .42, .3 + R() * .15, R() * PI, L_(k % 2 && i % 2 ? 'ng_millet' : 'ng_veg'), [.9 + R() * .2, .95 + R() * .1, .85], 2); } },
    // 侵街 encroachments against the outside of a ward wall (local: x along the wall, back at z=0 on the wall foot, front = +z)
    shed: (k) => (b, f) => { const R = RNG(k * 13 + 3), W = 3 + (k % 3) * .5, D = 1.75, hb = 2.55, hf = 1.95, thatch = k % 2;
      b.s({ tex: 'wood', col: [.62, .52, .42] }); for (const x of [-W / 2 + .08, W / 2 - .08].concat(W > 3.4 ? [0] : [])) { b.box(x, hf / 2, D - .08, .09, hf, .09); b.box(x, (hb - .1) / 2, .08, .08, hb - .1, .08); }
      b.box(0, hf - .015, D - .08, W, .08, .115); b.box(0, hb - .17, .08, W, .08, .105);
      const ang = Math.atan2(hb - hf, D), L2 = Math.hypot(hb - hf, D) + .35; b.s({ tex: thatch ? 'straw' : 'mat', col: thatch ? [.95, .85, .7] : [.85, .75, .6] }).T(0, (hb + hf) / 2 + .06, D / 2 - .05, ang, 0, 0).box(0, 0, 0, W + .3, thatch ? .16 : .05, L2, { uv: [2, 1] }).pop();
      b.s({ tex: 'mat', col: [.8, .7, .58] }).box(-W / 2 + .04, .95, D / 2, .03, 1.8, D - .3);
      b.s({ tex: 'plank', col: [.7, .58, .46] }).box(.2, .62, D - .45, W * .55, .06, .5); b.s({ tex: 'dark_wood', col: [.7, .6, .5] }).box(.2 - W * .25, .3, D - .45, .06, .6, .45).box(.2 + W * .25, .3, D - .45, .06, .6, .45);
      const goods = ['jars', 'sacks', 'baskets', 'pots', 'cloth', 'veg', 'crates'][k % 7]; b.T(.2, .65, D - .45, 0, 0, 0, .55); P2[goods === 'jars' ? 'pots' : goods](k)(b, f); b.pop();
      b.T(-W / 4, 0, .45); P2[goods === 'sacks' ? 'jars' : 'sacks'](k)(b, f); b.pop(); if (R() < .6) { b.T(W / 2 - .5, 0, .5); PROPS.basket(b, .26, .3); b.pop(); }
      if (k % 3 === 0) { b.s({ tex: 'cloth', col: [.75, .7, .62] }).box(W / 2 - .05, 1.2, D / 2 + .2, .02, 1.3, .9); } },
    stall: (k) => (b, f) => { const W = 2.4 + (k % 2) * .6, D = 1.6; b.s({ tex: 'bamboo', col: [.85, .75, .55] }); for (const x of [-W / 2, W / 2]) { b.box(x, 1.1, D, .05, 2.2, .05); b.box(x, 1.25, .15, .05, 2.5, .05); }
      b.s({ tex: 'mat', col: [.9, .8, .62] }).T(0, 2.32, D / 2 + .05, Math.atan2(.3, D), 0, 0).box(0, 0, 0, W + .2, .04, D + .3).pop();
      b.s({ tex: 'plank', col: [.72, .6, .48] }).box(0, .55, D * .6, W * .8, .05, .7); b.s({ tex: 'dark_wood', col: [.6, .5, .42] }); for (const x of [-W * .35, W * .35]) b.T(x, .27, D * .6, 0, 0, 0).box(0, 0, 0, .05, .54, .6).pop();
      b.T(0, .58, D * .6, 0, 0, 0, .6); P2[['pots', 'veg', 'cloth', 'baskets'][k % 4]](k)(b, f); b.pop(); b.T(W / 2 - .3, 0, D + .5, 0, 1, 0); P2.huchuang(k)(b, f); b.pop(); },
    booth: (k) => (b, f) => { const W = 2.6 + (k % 2) * .5, D = 1.8, H = 2.3; b.s({ tex: 'plank', col: [.62, .52, .42] }); b.box(-W / 2 + .03, H / 2, D / 2, .06, H, D, { uv: [1, 1] }).box(W / 2 - .03, H / 2, D / 2, .06, H, D, { uv: [1, 1] }).box(0, H / 2, .06, W - .12, H, .06, { uv: [2, 1] });
      b.s({ tex: 'plank', col: [.7, .58, .46] }).box(0, .5, D - .2, W - .14, 1.0, .1, { uv: [2, 1] }).box(0, 1.03, D - .2, W - .1, .06, .3);
      b.s({ tex: 'roof_tile', col: [.78, .78, .8] }).T(0, H + .12, D / 2 + .1, Math.atan2(.25, D), 0, 0).box(0, 0, 0, W + .3, .1, D + .5, { uv: [2, 1] }).pop();
      b.T(0, 1.06, D - .2, 0, 0, 0, .5); P2[['pots', 'jars', 'cloth'][k % 3]](k)(b, f); b.pop(); b.s({ tex: 'cloth', col: [.55, .4, .3] }).box(0, H - .25, D - .12, W - .2, .35, .02); },
    tub: (k) => (b) => { b.s({ tex: 'plank', col: [.7, .6, .5] }).lathe([[0, 0], [.4, 0], [.4, 0], [.45, .32], [.42, .32], [0, .05]], { seg: 10, uvs: [4, 1] }); b.s({ tex: 'water', col: [1, 1, 1] }).cyl(0, .26, 0, .41, .27, { seg: 10 }); },
  };
  // spoked wheel in the y-z plane (axle along x): rim ring, spokes from hub to rim (no crossing faces), hub
  function wheel(b, r, w, n) { b.s({ tex: 'dark_wood', col: [.8, .75, .7] }).T(0, 0, 0, 0, 0, PI / 2).lathe([[r - .06, -w / 2], [r, -w / 2], [r, w / 2], [r - .06, w / 2], [r - .06, -w / 2]], { seg: 14 }).lathe([[0, -w * .8], [.09, -w * .8], [.09, w * .8], [0, w * .8]], { seg: 8 }).pop();
    for (let i = 0; i < n; i++) { const a = i / n * TAU, m = (r - .03 + .09) / 2; b.T(0, Math.cos(a) * m, Math.sin(a) * m, a, 0, 0).box(0, 0, 0, .03 + (i % 2) * .008, r - .03 - .09, .03).pop(); } }
  const STC = {}; N._stc = STC;
  const ST = (L, name, k, x, z, yaw, s = 1, tint, y = 0) => (STC[name] = (STC[name] || 0) + 1, stamp(L, name + k, P2[name](k), x, y, z, yaw, s, tint));

  // ============================================================================================
  // CHUNK scatter: streets, lanes, avenues, ditches, ward wall feet, shop fronts, gates
  // ============================================================================================
  const GRASS = ['ng_grass', 'ng_grass', 'ng_dry', 'ng_weed', 'ng_flower', 'ng_dry'], FOOT = ['ng_grass', 'ng_weed', 'ng_weed', 'ng_dry', 'ng_grass', 'ng_flower', 'ng_daylily'];
  const gcol = (R, k = 1) => { const a = .78 + R() * .3; return [a * k * (1 + (R() - .5) * .1), a * k, a * k * (.92 + R() * .1)]; };
  function terrY(H, x, z) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
    return fx >= fz ? h00 + (h10 - h00) * fx + (h11 - h10) * fz : h00 + (h11 - h01) * fx + (h01 - h00) * fz; }
  N.chunk = function (L, info) {
    if (typeof CITY === 'undefined') return;
    const R = RNG(info.seed >>> 0), x0 = info.x0, z0 = info.z0, S = info.size, H = info.height, fol = L.fol;
    const lays = CITY.lay.filter(l => l.wd.r.x1 > x0 - 40 && l.wd.r.x0 < x0 + S + 40 && l.wd.r.z1 > z0 - 40 && l.wd.r.z0 < z0 + S + 40), T = WARD.WALL_T;
    const LN = new Map(); for (const l of lays) LN.set(l, l.lots.filter(t => t.r.x1 > x0 - 3 && t.r.x0 < x0 + S + 3 && t.r.z1 > z0 - 3 && t.r.z0 < z0 + S + 3));
    const streets = []; const nearR = r => r.x1 > x0 - 3 && r.x0 < x0 + S + 3 && r.z1 > z0 - 3 && r.z0 < z0 + S + 3; for (const l of lays) { for (const s of l.streets) if (nearR(s.r)) streets.push({ r: s.r, axis: s.axis, kind: s.kind }); for (const s of l.lanes) if (nearR(s.r)) streets.push({ r: s.r, axis: s.axis, kind: 'lane' }); }
    const lots = info.lots, doors = [], gates = info.gates || [], aprons = lots.filter(l => l.foot && l.foot.length);
    for (const lot of lots) { const r = lot.r, f = lot.front; doors.push(f === 's' ? [(r.x0 + r.x1) / 2, r.z1] : f === 'n' ? [(r.x0 + r.x1) / 2, r.z0] : f === 'e' ? [r.x1, (r.z0 + r.z1) / 2] : [r.x0, (r.z0 + r.z1) / 2]); }
    const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
    const inStreet = (x, z) => { for (const s of streets) if (inRect(s.r, x, z)) return s; return null; };
    const nearDoor = (x, z, d) => doors.some(p => Math.hypot(p[0] - x, p[1] - z) < d);
    const nearGate = (x, z, d) => gates.some(g => Math.hypot(g.x - x, g.z - z) < d);
    const hgt = (x, z) => terrY(H, x, z);
    const wallAt = (x, z) => { for (const l of lays) { if (!inRect(l.wd.r, x, z)) continue; for (const lot of LN.get(l)) { if (!inRect(lot.r, x, z)) continue; if (lot.type === 'pond') return false;
          if (/shop|stall/.test(lot.type)) { const q = lot.r, f = lot.front, df = f === 's' ? q.z1 - z : f === 'n' ? z - q.z0 : f === 'e' ? q.x1 - x : x - q.x0; return df > 2.2; } return true; } return false; } return false; };
    const occ = [], claim = (x, z, rr) => { for (const o of occ) if (Math.hypot(o[0] - x, o[1] - z) < o[2] + rr) return false; occ.push([x, z, rr]); return true; };
    const freeW = (x, z, rr = .25) => { if (rr >= .5 && occ.some(o => Math.hypot(o[0] - x, o[1] - z) < o[2] + rr)) return false; let ok = true; L.world.near(x, z, rr + 1, s => { if (ok && s.cy + s.hy > .06 && L.world._inXZ(s, x, z, rr)) ok = false; }); return ok; };
    // classify a point: {z: 'street'|'lane'|'av'|'verge'|'bank'|'ditch'|'waste'|'lot'|'wall', e: distance to the nearest wall face, s: street}
    const cls = (x, z) => {
      let lay = null; for (const l of lays) if (inRect(l.wd.r, x, z)) { lay = l; break; }
      if (!lay) { let dw = 1e9; for (const l of lays) { const r = l.wd.r; dw = Math.min(dw, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1))); }
        const h = hgt(x, z); if (h < -1.3) return { z: 'ditch', e: dw, h }; if (h < -.04) return { z: 'bank', e: dw, h };
        return { z: dw < 2.1 ? 'verge' : 'av', e: dw, h: 0 }; }
      const r = lay.wd.r; if (x < r.x0 + T || x > r.x1 - T || z < r.z0 + T || z > r.z1 - T) return { z: 'wall' };
      const s = inStreet(x, z);
      if (s) { const lo = s.axis === 'x' ? z - s.r.z0 : x - s.r.x0, hi = s.axis === 'x' ? s.r.z1 - z : s.r.x1 - x; let e = 1e9;
        const bLo = s.axis === 'x' ? [x, s.r.z0 - .6] : [s.r.x0 - .6, z], bHi = s.axis === 'x' ? [x, s.r.z1 + .6] : [s.r.x1 + .6, z];
        let dx = 0, dz = 0; if (!inStreet(bLo[0], bLo[1]) && lo < e) { e = lo; dx = s.axis === 'x' ? 0 : -1; dz = s.axis === 'x' ? -1 : 0; } if (!inStreet(bHi[0], bHi[1]) && hi < e) { e = hi; dx = s.axis === 'x' ? 0 : 1; dz = s.axis === 'x' ? 1 : 0; }
        return { z: s.kind === 'lane' ? 'lane' : 'street', mk: lay.wd.kind === 'market', e, s, dx, dz, w: s.axis === 'x' ? s.r.z1 - s.r.z0 : s.r.x1 - s.r.x0 }; }
      for (const lot of LN.get(lay)) if (inRect(lot.r, x, z)) return { z: 'lot', lot };
      // ward ground outside lots and streets: wall-side strips, scraps
      if (info.GC && info.ground && info.ground(x, z) === info.GC.STREET) { // roadway of a special zone (e.g. a gate square): distance to the nearest non-street ground
        let e2 = 12; for (const d of [2, 5, 9]) { if (d >= e2) break; for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (info.ground(x + ux * d, z + uz * d) !== info.GC.STREET) { e2 = d; break; } }
        return { z: 'av', e: e2, h: 0 }; }
      return { z: 'waste', mk: lay.wd.kind === 'market', e: Math.min(x - r.x0 - T, r.x1 - T - x, z - r.z0 - T, r.z1 - T - z) };
    };
    const tuftAt = (x, z, h, sc, kinds, k = 1) => { const t = kinds[(R() * kinds.length) | 0], s2 = sc * (.7 + R() * .6); tuft(fol, x, h, z, s2 * (.8 + R() * .5), s2, R() * PI, L_(t), gcol(R, k), R() < .3 ? 3 : 2, (R() - .5) * .3); };
    // 1. jittered sample grid
    const step = .8;
    for (let gz = z0 + step / 2; gz < z0 + S; gz += step) for (let gx = x0 + step / 2; gx < x0 + S; gx += step) {
      const x = gx + (R() - .5) * step, z = gz + (R() - .5) * step, c = cls(x, z), r = R();
      if (aprons.length && aprons.some(l => footHit(l, x, z, .6))) continue;
      if (c.z === 'wall') continue;
      if (c.h === undefined && hgt(x, z) < -.05) continue; // carved ground (canal channels, basins): nothing floats over the water
      if (c.z === 'lot') { const t = c.lot.type, q = c.lot.r, el = Math.min(x - q.x0, q.x1 - x, z - q.z0, q.z1 - z);
        if (el < .85 || !freeW(x, z)) continue;
        if (t === 'garden' || t === 'pond') { if (r < .32) tuftAt(x, z, 0, .45, ['ng_grass', 'ng_grass', 'ng_flower', 'ng_weed', 'ng_daylily', 'ng_dry'], .95); else if (r < .335) ST(L, 'stone', (R() * 4) | 0, x, z, R() * TAU, .2 + R() * .3); }
        else if (t === 'field') { if (el < 1.6 && r < .4) tuftAt(x, z, 0, .45, GRASS); }
        else if (/temple|jinzou|office|mansion|quarter|warehouse/.test(t) && el < 1.5 && r < .28) tuftAt(x, z, 0, .32, ['ng_grass', 'ng_weed', 'ng_flower', 'ng_dry'], .95);
        continue; }
      const gate = nearGate(x, z, 6.5), door = nearDoor(x, z, 2.2);
      if (c.z === 'ditch') { if (r < .3) tuftAt(x, z, c.h, 1.1, ['ng_reed', 'ng_reed', 'ng_grass']); else if (r < .33) decalAtY(fol, x, c.h, z, 1, 1, R() * TAU, 'nd_damp', [.8, .8, .8]); continue; }
      if (c.z === 'bank') { if (r < .55) tuftAt(x, z, c.h, .6, ['ng_grass', 'ng_grass', 'ng_weed', 'ng_flower', 'ng_dry'], .95); continue; }
      if (c.z === 'verge') { if (gate) continue; if (r < (c.e < .8 ? .55 : .35)) tuftAt(x, z, 0, c.e < .8 ? .5 : .38, GRASS); else if (r < .38) ST(L, 'stone', (R() * 4) | 0, x, z, R() * TAU, .12 + R() * .2); continue; }
      const e = c.e;
      if (c.z === 'waste') { const tw = c.mk ? (e < 1 ? .5 : .03) : e < 1.2 ? .55 : .2; if (r < tw) tuftAt(x, z, 0, .45, GRASS); else if (r < tw + .015) ST(L, 'stone', (R() * 4) | 0, x, z, R() * TAU, .15 + R() * .25); continue; }
      // streets, lanes and the avenue roadway
      const lane = c.z === 'lane', walled = c.z === 'av' || wallAt(x + c.dx * (e + .55), z + c.dz * (e + .55)) || wallAt(x + c.dx * (e + 1.1), z + c.dz * (e + 1.1)), foot = e < .95 && walled, near = e < 2.4 && walled;
      if (gate && !foot) { if (r < .02) decalAt(fol, x, z, .9, .9, R() * TAU, 'nd_hoof', [.9, .9, .9]); continue; }
      if (foot && !door) { if (r < (lane ? .9 : .8)) { const n = 1 + ((R() * (lane ? 3 : 2.4)) | 0); for (let q = 0; q < n; q++) tuftAt(x + (R() - .5) * .5, z + (R() - .5) * .5, 0, (lane ? .5 : .42) * (q ? .8 : 1.15), q ? GRASS : FOOT, .95); } else if (r < .47) ST(L, 'stone', (R() * 4) | 0, x, z, R() * TAU, .1 + R() * .22); else if (r < .5) decalAt(fol, x, z, 1.2, .7, R() * TAU, 'nd_damp', [.85, .85, .85]); continue; }
      if (near && !door) { const tn = lane ? (e < 1.5 ? .3 : .08) : .36; if (r < tn) tuftAt(x, z, 0, .32, ['ng_grass', 'ng_dry', 'ng_weed', 'ng_grass']); else if (r < tn + .03) decalAt(fol, x, z, .9, .9, R() * TAU, 'nd_pebbles', [1, 1, 1]); else if (r < tn + .034) ST(L, 'stone', (R() * 4) | 0, x, z, R() * TAU, .1 + R() * .15); else if (r < tn + .05) decalAt(fol, x, z, .8, .8, R() * TAU, 'nd_shards', [1, 1, 1]);
        else if (r < tn + .056 && c.s && e > 1 && !nearGate(x, z, 9) && freeW(x, z, .7) && claim(x, z, 1.2)) { const sa = c.s.axis, mid = sa === 'x' ? (c.s.r.z0 + c.s.r.z1) / 2 : (c.s.r.x0 + c.s.r.x1) / 2, toC = sa === 'x' ? Math.sign(mid - z) : Math.sign(mid - x), yw = sa === 'x' ? (toC > 0 ? 0 : PI) : (toC > 0 ? PI / 2 : -PI / 2);
          const pk = (lane ? ['mound', 'refuse', 'baskets', 'brush', 'tiles', 'pole'] : ['mound', 'refuse', 'baskets', 'tiles', 'brush', 'block', 'jars', 'hay', 'cart', 'pole'])[(R() * (lane ? 6 : 10)) | 0];
          const wx = sa === 'x' ? x : x - toC * (e - .9), wz = sa === 'x' ? z - toC * (e - .9) : z; ST(L, pk, (R() * 3) | 0, pk === 'mound' || pk === 'refuse' || pk === 'cart' ? x : wx, pk === 'mound' || pk === 'refuse' || pk === 'cart' ? z : wz, yw + (pk === 'cart' ? PI / 2 + (R() - .5) * .4 : 0));
          if (/jars|cart|hay|block|tiles/.test(pk)) L.world.cyl(x, z, 0, 1, .6); }
        continue; }
      // the open roadway
      if (c.z === 'av' && (hgt(x + 1.6, z) < -.01 || hgt(x - 1.6, z) < -.01 || hgt(x, z + 1.6) < -.01 || hgt(x, z - 1.6) < -.01)) continue; // ditch kerbs
      // patchy verge vegetation along the tree rows (avenue rows ~7.5 m off the wall; ward main-street rows ~1.4 m off the edge), linking the tree bases
      if (!c.mk && !door && ((c.z === 'av' && e > 6.2 && e < 8.8) || (c.z === 'street' && c.w > 12 && e > .9 && e < 2.0)) && hash2(Math.floor(x / 2.5), Math.floor(z / 2.5), 77) > .45) {
        if (r < .3) { tuftAt(x, z, 0, .3, ['ng_grass', 'ng_grass', 'ng_weed', 'ng_dry', 'ng_flower', 'ng_fern']); continue; } else if (r < .33) { decalAt(fol, x, z, 1.4, 1, R() * TAU, 'nd_litter', [.95, .95, .95]); continue; } }
      const mid = c.mk || (c.z === 'av' ? e > 12.5 : c.s && c.w > 9 ? Math.abs(e - c.w / 2) < 3.2 : true), side = !mid; // the trafficked middle vs the quieter sides of a wide street
      if (r < .05) decalAt(fol, x, z, 1, 1, R() * TAU, 'nd_pebbles', [1, 1, 1]);
      else if (r < .09) decalAt(fol, x, z, 1.1, 1.1, R() * TAU, 'nd_hoof', [.95, .95, .95]);
      else if (r < .105 && !lane) { decalAt(fol, x, z, .7, .7, R() * TAU, 'nd_dung', [1, 1, 1]); if (R() < .25) ST(L, 'dung', 0, x, z, R() * TAU); }
      else if (r < .125) decalAt(fol, x, z, 1.2, 1.2, R() * TAU, 'nd_straw', [1, 1, 1]);
      else if (r < .138) { const sz = 2 + R() * 4.5; decalAt(fol, x, z, sz, sz * (.6 + R() * .4), R() * TAU, R() < .8 ? 'nd_dust' : 'nd_damp', R() < .5 ? [1, 1, 1] : [.95, .94, .92]); }
      else if (r < .153 && c.z === 'av') decalAt(fol, x, z, 2.2, 1.8, R() * TAU, 'nd_crack', [1, 1, 1]);
      else if (r < .156 + (c.mk ? 0 : c.z === 'av' ? (e < 6 ? .1 : e < 10 ? .025 : .006) : side ? .06 : .01)) tuftAt(x, z, 0, side || e < 10 ? .28 : .18, ['ng_grass', 'ng_dry', 'ng_dry', 'ng_weed', 'ng_flower']);
      else if (r < .28) { /* bare trodden earth */ }
      else if (r < .2815) ST(L, 'pebbles', (R() * 3) | 0, x, z, R() * TAU);
      else if (r < .2845) ST(L, 'stone', (R() * 4) | 0, x, z, R() * TAU, .1 + R() * .15);
      else if (r < .2851 && c.z === 'av' && freeW(x, z, .8) && claim(x, z, .8)) ST(L, R() < .4 ? 'oldwheel' : R() < .5 ? 'mound' : 'refuse', 0, x, z, R() * TAU);
      else if (r < .2865) decalAt(fol, x, z, .8, .8, R() * TAU, 'nd_shards', [1, 1, 1]);
      else if (r < .2868 && !lane && freeW(x, z, 1.5) && !nearGate(x, z, 12) && claim(x, z, 1.5)) { ST(L, 'cart', (R() * 2) | 0, x, z, R() * TAU); L.world.cyl(x, z, 0, 1, 1); }
    }
    // field crops in rows: millet (粟, growing in the 6th month), vegetable beds (葵, 菘), or wheat stubble after the harvest
    for (const lot of lots) { if (lot.type !== 'field') continue; const q = lot.r, kind = lot.seed % 4, alongX = (q.x1 - q.x0) > (q.z1 - q.z0), RF = RNG(lot.seed + 3);
      const sp = kind === 2 ? 1.6 : kind === 1 ? .7 : .85, pl = kind === 2 ? 1.4 : kind === 1 ? .55 : .75;
      for (let a = (alongX ? q.z0 : q.x0) + 1.6; a < (alongX ? q.z1 : q.x1) - 1.6; a += sp) for (let u = (alongX ? q.x0 : q.z0) + 1.6; u < (alongX ? q.x1 : q.z1) - 1.6; u += pl * (.8 + RF() * .4)) {
        const x = alongX ? u : a + (RF() - .5) * .1, z = alongX ? a + (RF() - .5) * .1 : u; if (x < x0 || x >= x0 + S || z < z0 || z >= z0 + S) continue; if (RF() < .06 || !freeW(x, z, .3)) continue;
        if (kind === 0 || kind === 3) tuft(fol, x, 0, z, .9 + RF() * .3, (kind === 3 ? 1.5 : 1.0) * (.85 + RF() * .3), (alongX ? 0 : PI / 2) + (RF() - .5) * .6, L_('ng_millet'), gcol(RF, kind === 3 ? .9 : 1), 2);
        else if (kind === 1) tuft(fol, x, 0, z, .55, .42 * (.8 + RF() * .4), RF() * PI, L_('ng_veg'), gcol(RF), 2);
        else { tuft(fol, x, 0, z, .7, .22, RF() * PI, L_('ng_dry'), gcol(RF, 1.05), 2); if (RF() < .15) decalAt(fol, x, z, 1.4, 1.4, RF() * TAU, 'nd_straw', [1, 1, 1]); } } }
    // 2. wheel ruts along the streets and the avenue roadways
    const clipRun = (ax, cOff, a0, a1, wid) => { // pieces of rut along axis ax at cross offset cOff from a0 to a1
      if (ax === 'x' ? (cOff < z0 || cOff >= z0 + S) : (cOff < x0 || cOff >= x0 + S)) return;
      for (let a = Math.max(a0, ax === 'x' ? x0 : z0); a < Math.min(a1, ax === 'x' ? x0 + S : z0 + S) - 1;) { const len = 3 + R() * 7, b2 = Math.min(a + len, a1, ax === 'x' ? x0 + S : z0 + S), m = (a + b2) / 2, l2 = b2 - a;
        const x = ax === 'x' ? m : cOff, z = ax === 'x' ? cOff : m, ok = l2 > 1 && hgt(x, z) === 0 && !nearGate(x, z, 5) && hgt(ax === 'x' ? a : x, ax === 'x' ? z : a) === 0 && hgt(ax === 'x' ? b2 : x, ax === 'x' ? z : b2) === 0;
        if (ok) { decalAt(fol, x, z, wid, l2, ax === 'x' ? PI / 2 : 0, 'nd_ruts', [1, 1, 1], [1, l2 / wid]);
          for (let q = 0; q < l2 / 3; q++) { const t = (R() - .5) * l2, px = ax === 'x' ? x + t : x + (R() - .5) * .5, pz = ax === 'x' ? z + (R() - .5) * .5 : z + t, rr = R();
            if (rr < .35) decalAt(fol, px, pz, .9, .9, R() * TAU, 'nd_hoof', [.95, .95, .95]); else if (rr < .5) { decalAt(fol, px, pz, .6, .6, R() * TAU, 'nd_dung', [1, 1, 1]); } else if (rr < .62) decalAt(fol, px, pz, 1, 1, R() * TAU, 'nd_straw', [1, 1, 1]); } }
        a = b2 + R() * 4; } };
    for (const s of streets) { if (s.kind === 'lane') continue; const r = s.r; if (r.x1 < x0 || r.x0 > x0 + S || r.z1 < z0 || r.z0 > z0 + S) continue;
      const cen = s.axis === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2, offs = s.kind === 'main' ? [-2.2 - R(), 2.2 + R()] : [(R() - .5)];
      for (const o of offs) { const c2 = cen + o; if ((s.axis === 'x' ? c2 : c2) < (s.axis === 'x' ? z0 : x0) || c2 > (s.axis === 'x' ? z0 : x0) + S) continue; clipRun(s.axis, c2, s.axis === 'x' ? r.x0 + 3 : r.z0 + 3, s.axis === 'x' ? r.x1 - 3 : r.z1 - 3, 2.4); } }
    for (const l of lays) if (l.wd.kind === 'gatezone' && l.wd.gate) for (const o of [-14, -6, 5, 13]) clipRun('x', l.wd.gate.z + o + (R() - .5) * 2, l.wd.r.x0, l.wd.gate.x + 40, 2.4);
    for (const l of lays) { const r = l.wd.r; if (l.wd.kind === 'gatezone') continue;
      for (const [ax, base, dir] of [['x', r.z0, -1], ['x', r.z1, 1], ['z', r.x0, -1], ['z', r.x1, 1]]) for (const o of [12 + (l.wd.seed % 7), 22 + (l.wd.seed % 11)]) {
        const c2 = base + dir * o, px = ax === 'x' ? (r.x0 + r.x1) / 2 : c2, pz = ax === 'x' ? c2 : (r.z0 + r.z1) / 2;
        if (lays.some(l2 => { const q = l2.wd.r; return ax === 'x' ? (c2 > q.z0 - 9 && c2 < q.z1 + 9 && q.x1 > x0 && q.x0 < x0 + S) : (c2 > q.x0 - 9 && c2 < q.x1 + 9 && q.z1 > z0 && q.z0 < z0 + S); })) continue;
        void px; void pz; clipRun(ax, c2, ax === 'x' ? r.x0 - 30 : r.z0 - 30, ax === 'x' ? r.x1 + 30 : r.z1 + 30, 2.4); } }
    // 3. a trickle of water in the avenue ditches (summer: shallow, broken by dry mud)
    const ch = CITY.chunkAt(x0 + 1, z0 + 1);
    if (ch && ch.ditches) for (const d of ch.ditches) { const ax = (d.x1 - d.x0) > (d.z1 - d.z0) ? 'x' : 'z', a0 = Math.max(ax === 'x' ? d.x0 : d.z0, ax === 'x' ? x0 : z0), a1 = Math.min(ax === 'x' ? d.x1 : d.z1, ax === 'x' ? x0 + S : z0 + S), cc = ax === 'x' ? (d.z0 + d.z1) / 2 : (d.x0 + d.x1) / 2, hw = ((ax === 'x' ? d.z1 - d.z0 : d.x1 - d.x0) - 1.8) / 2;
      for (let a = a0; a < a1 - .5;) { const len = 4 + R() * 9, b2 = Math.min(a1, a + len); if (R() < .75) { const m = (a + b2) / 2; L.mb.s({ tex: 'water', col: [.75, .85, .9] }); const W2 = hw * 2;
          if (ax === 'x') L.mb.box(m, -1.47, cc, b2 - a, .02, W2, { world: 2, skip: ['bot'] }); else L.mb.box(cc, -1.47, m, W2, .02, b2 - a, { world: 2, skip: ['bot'] }); }
        a = b2 + R() * 2; } }
    // 4. shop fronts: goods, jars, baskets, sacks, carts, stools; house gates: firewood, a mounting block
    for (let li = 0; li < lots.length; li++) { const lot = lots[li], t = lot.type, r = lot.r, f = lot.front, RL = RNG(lot.seed ^ 0x5bd1e995);
      const shop = /shop|stall|wineshop/.test(t), house = /house|hut|inn/.test(t); if (!shop && !house) continue;
      const along = f === 'n' || f === 's', w = along ? r.x1 - r.x0 : r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, out = f === 's' ? [0, 1] : f === 'n' ? [0, -1] : f === 'e' ? [1, 0] : [-1, 0];
      const ex = f === 's' ? [cx, r.z1] : f === 'n' ? [cx, r.z0] : f === 'e' ? [r.x1, cz] : [r.x0, cz], tan = [Math.abs(out[1]), Math.abs(out[0])], yaw = Math.atan2(out[0], out[1]);
      const n = shop ? 2 + ((RL() * 3) | 0) : (RL() < .45 ? 1 : 0);
      for (let k = 0; k < n; k++) { const u = (RL() < .5 ? -1 : 1) * (2.4 + RL() * Math.max(.2, w / 2 - 3.2)), o = shop ? -.6 + RL() * 1.6 : .7 + RL() * .5;
        const x = ex[0] + tan[0] * u + out[0] * o, z = ex[1] + tan[1] * u + out[1] * o; if (x < x0 || x >= x0 + S || z < z0 || z >= z0 + S) continue;
        const c2 = cls(x + out[0] * .01, z + out[1] * .01); if (c2.z === 'wall' || (c2.z !== 'lot' && c2.z !== 'street' && c2.z !== 'lane')) continue; if (nearGate(x, z, 7) || nearDoor(x, z, 2.2) && Math.abs(u) < 2.2) continue; if (aprons.some(l => footHit(l, x, z, .8))) continue; if (!claim(x, z, .7)) continue;
        const pick = shop ? ['jars', 'sacks', 'baskets', 'crates', 'pots', 'cloth', 'veg', 'huchuang', 'cart', 'pole', 'firewood'][(RL() * 11) | 0] : ['firewood', 'brush', 'block', 'pole', 'hay', 'tiles'][(RL() * 6) | 0];
        const k2 = (RL() * 3) | 0, yw = yaw + (RL() - .5) * .5 + (pick === 'cart' ? PI / 2 : 0);
        ST(L, pick, k2, x, z, /brush|pole|firewood|ladder|tiles/.test(pick) ? yaw : yw);
        if (/jars|sacks|crates|cart|firewood|hay|block/.test(pick)) L.world.cyl(x, z, 0, 1, pick === 'cart' ? 1 : .5);
        if (RL() < .5) decalAt(fol, x + (RL() - .5), z + (RL() - .5), 1.4, 1.4, RL() * TAU, RL() < .5 ? 'nd_straw' : 'nd_damp', [1, 1, 1]); } }
    // 5. ward gates: a trough, a hitching post and a mounting block outside; a low bench inside for the gatekeeper
    for (const g of gates) { if (g.x < x0 || g.x >= x0 + S || g.z < z0 || g.z >= z0 + S) continue; const RG = RNG(Math.round(g.x * 7 + g.z * 13)), F = ARCH.F(g.x, 0, g.z, g.yaw);
      const putG = (name, lx, lz, yw2, solid) => { const p = F.p(lx, 0, lz); ST(L, name, (RG() * 3) | 0, p[0], p[2], g.yaw + yw2); if (solid) L.world.cyl(p[0], p[2], 0, .8, solid); };
      const sd = RG() < .5 ? -1 : 1; putG('hitch', sd * 5.2, 2.2, 0, .12); putG('block', -sd * 5.4, 2.0, 0, .45); putG('lowbench', sd * 5.6, -2.3, PI, .6); putG('trough', -sd * 5.8, -2.6, PI, .7);
      if (RG() < .6) putG('huchuang', sd * 4.6, -2.9, PI + .4, 0);
      const pd = F.p(0, 0, 3), pd2 = F.p(0, 0, -3); decalAt(fol, pd[0], pd[2], 3, 3, RG(), 'nd_hoof', [.95, .95, .95]); decalAt(fol, pd2[0], pd2[2], 2.5, 2.5, RG(), 'nd_dung', [1, 1, 1]); }
    // 7. 侵街: lean-to sheds, booths, stalls and stacked goods against the outside of the ward walls, in clusters (more near gates
    //    and the markets); gate passages, bridges and corners stay clear. And small stalls across the ditch at the roadside.
    for (const l of lays) { const r = l.wd.r, gz = l.wd.kind === 'gatezone', mk = l.wd.kind === 'market' || gz, Rw = RNG((l.wd.seed >>> 0) + 991);
      const sides = gz ? (l.wd.gate ? [['n', 'x', r.x0 + 20, l.wd.gate.x - 40, l.wd.gate.z - 63.5, 1], ['s', 'x', r.x0 + 20, l.wd.gate.x - 40, l.wd.gate.z + 63.5, -1]] : [])
        : [['n', 'x', r.x0, r.x1, r.z0, -1], ['s', 'x', r.x0, r.x1, r.z1, 1], ['w', 'z', r.z0, r.z1, r.x0, -1], ['e', 'z', r.z0, r.z1, r.x1, 1]];
      for (const [sd, ax, a0, a1, f, dir] of sides) {
        const RS = RNG(((l.wd.seed >>> 0) * 7 + sd.charCodeAt(0)) >>> 0), yaw = ax === 'x' ? (dir > 0 ? 0 : PI) : (dir > 0 ? PI / 2 : -PI / 2);
        const gs = gates.concat(CITY.gates || []).filter(g => (ax === 'x' ? Math.abs(g.z - f) < 4 : Math.abs(g.x - f) < 4)).map(g => ax === 'x' ? g.x : g.z);
        let u = a0 + 12; while (u < a1 - 12) { // walk the side cluster by cluster (deterministic per side, independent of chunks)
          const nearG = gs.some(gp => Math.abs(gp - u) < 70), pc = mk ? .75 : nearG ? .6 : .22, n = RS() < pc ? 2 + ((RS() * 4) | 0) : 0;
          for (let i = 0; i < n && u < a1 - 12; i++) { const k = (RS() * 12) | 0, typ = RS(), W = typ < .45 ? 3 + (k % 3) * .5 : typ < .7 ? 2.6 + (k % 2) * .5 : typ < .88 ? 2.4 + (k % 2) * .6 : 1.6, cu = u + W / 2;
            u += W + RS() * .8; if (gs.some(gp => Math.abs(gp - cu) < 9 + W / 2)) continue;
            const x = ax === 'x' ? cu : f + dir * .12, z = ax === 'x' ? f + dir * .12 : cu; if (x < x0 || x >= x0 + S || z < z0 || z >= z0 + S) continue;
            const name = typ < .45 ? 'shed' : typ < .7 ? 'booth' : typ < .88 ? 'stall' : (RS() < .5 ? 'firewood' : 'tiles');
            ST(L, name, k % 6, x, z, yaw); const cx2 = x + (ax === 'x' ? 0 : dir * .9), cz2 = z + (ax === 'x' ? dir * .9 : 0);
            L.world.box(cx2, 1.2, cz2, ax === 'x' ? W / 2 : .9, 1.2, ax === 'x' ? .9 : W / 2, {}); claim(cx2, cz2, W / 2);
            if (RS() < .5) decalAt(fol, cx2 + (ax === 'x' ? 0 : dir * 1.2), cz2 + (ax === 'x' ? dir * 1.2 : 0), 2.4, 1.6, RS() * TAU, RS() < .5 ? 'nd_straw' : 'nd_damp', [1, 1, 1]); }
          u += 25 + RS() * 50; }
        // roadside stalls across the ditch, between it and the tree row
        let v = a0 + 20; while (v < a1 - 20) { v += 30 + RS() * 60; if (RS() > (mk ? .6 : .3) || gs.some(gp => Math.abs(gp - v) < 14)) continue;
          const off = f + dir * 6.1, x = ax === 'x' ? v : off, z = ax === 'x' ? off : v; if (x < x0 || x >= x0 + S || z < z0 || z >= z0 + S || !freeW(x, z, 1.4)) continue;
          ST(L, RS() < .7 ? 'stall' : 'cart', (RS() * 4) | 0, x - (ax === 'x' ? 0 : dir * .8), z - (ax === 'x' ? dir * .8 : 0), yaw + PI); L.world.cyl(x, z, 0, 1.2, 1.1); claim(x, z, 1.5); } } }
    // 6b. garden lots: a lotus pond, Taihu rocks, flower clumps (only from the chunk holding the lot centre)
    for (const lot of lots) { if (lot.type !== 'garden') continue; const q = lot.r, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2; if (cx < x0 || cx >= x0 + S || cz < z0 || cz >= z0 + S) continue;
      const { F, w, d } = COMP.frame(lot), RG = RNG(lot.seed + 77), fr = (lx, lz, r) => { const p = F.p(lx, 0, lz); return freeW(p[0], p[2], r) && claim(p[0], p[2], r); };
      if (w > 12 && d > 12) for (let i = 0; i < 8; i++) { const pw = 3 + RG() * 3, pd = 2.5 + RG() * 2, lx = (RG() - .5) * (w - pw - 4), lz = (RG() - .5) * (d - pd - 4); if (fr(lx, lz, Math.hypot(pw, pd) / 2 + .4)) { pond(L, F, lx, lz, pw, pd, RG); break; } }
      for (let i = 0; i < 3; i++) { const lx = (RG() - .5) * (w - 3), lz = (RG() - .5) * (d - 3); if (fr(lx, lz, .9)) { const p = F.p(lx, 0, lz); ST(L, 'taihu', (RG() * 3) | 0, p[0], p[2], RG() * TAU); L.world.cyl(p[0], p[2], 0, 2, .6); } }
      for (let i = 0; i < 6; i++) { const lx = (RG() - .5) * (w - 3), lz = (RG() - .5) * (d - 3), p = F.p(lx, 0, lz); if (!freeW(p[0], p[2], .6)) continue; for (let k = 0; k < 6; k++) tuft(fol, p[0] + (RG() - .5) * 1.2, 0, p[2] + (RG() - .5) * 1.2, .5, .5 + RG() * .3, RG() * PI, L_(RG() < .5 ? 'ng_daylily' : 'ng_flower'), gcol(RG), 2); } }
    // 6. wells: wet trodden ground, a bucket and a water jar
    for (const l of lays) for (const wl of l.wells || []) { if (wl.x < x0 || wl.x >= x0 + S || wl.z < z0 || wl.z >= z0 + S) continue; const RW = RNG(Math.round(wl.x * 3 + wl.z * 5));
      decalAt(fol, wl.x, wl.z, 4.2, 4.2, RW() * TAU, 'nd_damp', [.85, .85, .85]); decalAt(fol, wl.x + 1.3, wl.z + .4, 1.6, 1.2, RW() * TAU, 'nd_puddle', [.9, .9, .9]);
      const a = RW() * TAU; ST(L, 'tub', 0, wl.x + Math.cos(a) * 1.5, wl.z + Math.sin(a) * 1.5, RW() * TAU, .7); ST(L, 'jars', 0, wl.x + Math.cos(a + 1.6) * 1.7, wl.z + Math.sin(a + 1.6) * 1.7, RW() * TAU, .8); L.world.cyl(wl.x + Math.cos(a + 1.6) * 1.7, wl.z + Math.sin(a + 1.6) * 1.7, 0, .8, .6); }
    flushBases(L, aprons); DREG.clear(); dcount = 0;
  };
  function decalAtY(b, x, y, z, w, d, a, tex, col) { decal(b, x, y + .02, z, w, d, a, L_(tex), col); }

  // ============================================================================================
  // YARD: the inside of a compound — make it lived in
  // ============================================================================================
  N.yard = function (L, lot, F, w, d, R, kind) {
    const RY = RNG((lot.seed ^ 0x2545F491) >>> 0), occ = [], world = L.world, fol = L.fol;
    // re-derive gate and main house (see hook request 1)
    const R0 = RNG(lot.seed); let gx = 0, hx = 0, hz;
    if (kind === 'hut') { gx = (R0() - .5) * (w - 6); R0(); const bays = w > 14 ? 3 : 2; hx = (R0() - .5) * (w - 3.2 * bays - 2) * .5; hz = -d / 2 + 7.6; }
    else if (kind === 'house') { gx = w > 18 ? 0 : (R0() - .5) * (w - 6); hz = -d / 2 + Math.min(d * .32, 9) + 3.5; }
    else { gx = 0; hz = d / 2 - 6; }
    if (lot.gx !== undefined) gx = lot.gx;
    const W2 = w / 2 - .6, D2 = d / 2 - .6;
    const segD = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1), 0, 1); return Math.hypot(px - ax - vx * t, pz - az - vz * t); };
    const onPath = (lx, lz, r) => kind === 'rich' || kind === 'temple' ? Math.abs(lx) < (kind === 'temple' ? 4 : 2) + r : (segD(lx, lz, gx, d / 2, gx, hz + 1) < 1.3 + r || segD(lx, lz, gx, hz + 1, hx, hz) < 1.3 + r || (Math.abs(lx - hx) < 2 + r && lz < hz + 1.5 && lz > hz - 1));
    const inFoot = (lx, lz, r) => (lot.foot || []).some(f => lx > f[0] - r && lx < f[2] + r && lz > f[1] - r && lz < f[3] + r);
    const free = (lx, lz, r) => { if (Math.abs(lx) > W2 - r + .3 || Math.abs(lz) > D2 - r + .3) return false; if (onPath(lx, lz, r) || inFoot(lx, lz, r + .15)) return false; if (Math.hypot(lx - gx, lz - d / 2) < 2.4 + r) return false;
      for (const o of occ) if (Math.hypot(o[0] - lx, o[1] - lz) < o[2] + r) return false;
      const p = F.p(lx, 0, lz); let ok = true; world.near(p[0], p[2], r + 1, s => { if (ok && s.cy + s.hy > .06 && world._inXZ(s, p[0], p[2], r)) ok = false; }); return ok; };
    const place = (name, k, lx, lz, r, yaw, o = {}) => { if (!free(lx, lz, r)) return false; occ.push([lx, lz, r]); const p = F.p(lx, 0, lz); ST(L, name, k, p[0], p[2], F.yaw + yaw, o.s || 1, o.tint, o.y || 0); if (o.solid) world.cyl(p[0], p[2], 0, o.solid, Math.max(.15, r * .8)); return true; };
    const dec = (lx, lz, sz, tex, col = [1, 1, 1]) => { if (inFoot(lx, lz, sz * .72)) return; const p = F.p(lx, 0, lz); decalAt(fol, p[0], p[2], sz, sz, RY() * TAU, tex, col); };
    const tf = (lx, lz, sc, kinds, k = 1) => { if (inFoot(lx, lz, .4)) return; const p = F.p(lx, 0, lz); const t = kinds[(RY() * kinds.length) | 0], s2 = sc * (.7 + RY() * .6); tuft(fol, p[0], 0, p[2], s2 * (.8 + RY() * .5), s2, RY() * PI, L_(t), gcol(RY, k), 2, (RY() - .5) * .3); };
    const poor = kind === 'hut', temple = kind === 'temple', rich = kind === 'rich' || temple;
    // wall-foot slots (inside faces of the enclosure): things leaning against walls
    const wallItems = temple ? ['jars', 'tiles', 'ladder', 'firewood', 'baskets', 'tub'] : poor ? ['firewood', 'brush', 'brush', 'tool', 'pole', 'jars', 'hay', 'baskets', 'refuse', 'ladder', 'tiles', 'sacks'] : rich ? ['jars', 'tiles', 'tool', 'baskets', 'firewood', 'ladder', 'crates'] : ['firewood', 'brush', 'tool', 'pole', 'jars', 'baskets', 'sacks', 'ladder', 'tiles', 'crates', 'hay'];
    const slots = []; const ws = .62;
    for (let u = -w / 2 + 1.2; u < w / 2 - 1.2; u += 1.7) slots.push([u, -d / 2 + ws + .3, 0]);
    for (let v = -d / 2 + 1.2; v < d / 2 - 1.2; v += 1.7) { slots.push([-w / 2 + ws + .3, v, PI / 2]); slots.push([w / 2 - ws - .3, v, -PI / 2]); }
    for (let u = -w / 2 + 1.2; u < w / 2 - 1.2; u += 1.7) slots.push([u, d / 2 - ws - .3, PI]);
    for (let i = slots.length - 1; i > 0; i--) { const j = (RY() * (i + 1)) | 0; [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const nWall = Math.min(slots.length, Math.round((w + d) / (poor ? 3 : rich ? 7 : 3.6)));
    let placed = 0; for (const [lx, lz, yw] of slots) { if (placed >= nWall) break; const it = wallItems[(RY() * wallItems.length) | 0], r = /firewood|hay|refuse|tiles/.test(it) ? .75 : .5;
      // push the item off the wall by its radius
      const nx = Math.round(Math.sin(yw)), nz = Math.round(Math.cos(yw)), px = lx + nx * (r - .35), pz = lz + nz * (r - .35);
      if (place(it, (RY() * 3) | 0, px, pz, r, yw, { solid: /firewood|hay|jars|sacks|crates|tiles/.test(it) ? 1 : 0 })) placed++; }
    // grass and weeds along the wall feet (inside), denser in poor yards; moss in rich ones
    const nT = Math.round((w + d) * (poor ? 2.2 : rich ? .5 : 1.1));
    for (let i = 0; i < nT; i++) { const side = (RY() * 4) | 0, t = RY() - .5, lx = side < 2 ? t * (w - 1.2) : (side === 2 ? -1 : 1) * (w / 2 - .7 - RY() * .4), lz = side < 2 ? (side === 0 ? -1 : 1) * (d / 2 - .7 - RY() * .4) : t * (d - 1.2);
      if (onPath(lx, lz, 0) || !free(lx, lz, .05)) continue; tf(lx, lz, poor ? .45 : .35, poor ? ['ng_grass', 'ng_weed', 'ng_dry', 'ng_grass'] : ['ng_grass', 'ng_weed', 'ng_flower'], .95); }
    // open-yard items
    const tryPlace = (name, r, n = 12, o = {}) => { for (let i = 0; i < n; i++) { const lx = (RY() - .5) * (w - 2 * r - 1.4), lz = (RY() - .5) * (d - 2 * r - 1.4), yw = o.yaw !== undefined ? o.yaw : (RY() < .5 ? 0 : PI / 2) + (RY() - .5) * .3; if (place(name, o.k ?? ((RY() * 4) | 0), lx, lz, r, yw, o)) return [lx, lz]; } return null; };
    const yardList = temple ? [['taihu', .8, { solid: 2 }], ['planter', .6, { solid: .6 }], ['planter', .6, { solid: .6 }], ['pot', .3], ['pot', .3], ['tub', .5, { solid: .4 }], ['mortar', .45, { solid: .5 }], ['taihu', .8, { solid: 2 }]] : poor ? [['stove', .8, { solid: 1 }], ['coop', .7, { solid: .7 }], ['kennel', .7, { solid: .6 }], ['washing', 1.7], ['mortar', .45, { solid: .5 }], ['refuse', 1], ['vegbed', 1.5], ['hay', .95, { solid: 1 }], ['roller', .5, { solid: .5 }], ['tub', .5, { solid: .4 }]]
      : rich ? [['planter', .6, { solid: .6 }], ['planter', .6, { solid: .6 }], ['taihu', .8, { solid: 2 }], ['pot', .3], ['pot', .3], ['pot', .3], ['washing', 1.7], ['quern', .6, { solid: .8 }], ['shrine', .5, { solid: 1.2 }], ['tub', .5, { solid: .4 }]]
      : [['stove', .8, { solid: 1 }], ['oven', .65, { solid: .9 }], ['washing', 1.7], ['quern', .6, { solid: .8 }], ['mortar', .45, { solid: .5 }], ['coop', .7, { solid: .7 }], ['mat', 1.2], ['vegbed', 1.5], ['pot', .3], ['pot', .3], ['shrine', .5, { solid: 1.2 }], ['tub', .5, { solid: .4 }], ['kennel', .7, { solid: .6 }]];
    const nY = Math.min(yardList.length, Math.round(w * d / (poor ? 35 : rich ? 90 : 40)) + 3);
    const order = yardList.map((e, i) => [RY(), e]).sort((a, b) => a[0] - b[0]).map(e => e[1]).slice(0, nY);
    for (const [name, r, o] of order) { const at = tryPlace(name, r, 14, o || {});
      if (!at) continue; const [lx, lz] = at;
      if (name === 'coop') for (let i = 0; i < 2 + ((RY() * 4) | 0); i++) { const a = RY() * TAU, dd = 1 + RY() * 2.2; place('chicken', (RY() * 4) | 0, lx + Math.cos(a) * dd, lz + Math.sin(a) * dd, .18, RY() * TAU); }
      if (name === 'planter') { const p = F.p(lx, 0, lz); N.tree(L, p[0], .5, p[2], RY() < .6 ? 'pomegranate' : RY() < .5 ? 'peony' : 'shrub', .45 + RY() * .15, lot.seed + 7 + ((RY() * 99) | 0)); }
      if (name === 'kennel' && RY() < .7) place('dog', (RY() * 2) | 0, lx + .9, lz + .4, .35, RY() * TAU);
      if (name === 'stove' || name === 'oven') dec(lx + (RY() - .5), lz + 1, 1.6, 'nd_ash');
      if (name === 'tub' || name === 'washing') dec(lx, lz + .4, 1.4, 'nd_damp', [.9, .9, .9]);
      if (name === 'refuse') dec(lx, lz, 2.2, 'nd_ash');
    }
    // trodden ground, straw, puddles; rich: a stone-slab walk along the axis; poor: mud
    for (let i = 0; i < (poor ? 6 : 3); i++) { const lx = (RY() - .5) * (w - 3), lz = (RY() - .5) * (d - 3); if (!free(lx, lz, .3)) continue; dec(lx, lz, 1 + RY() * 1.4, poor ? (RY() < .5 ? 'nd_damp' : 'nd_straw') : (RY() < .4 ? 'nd_straw' : RY() < .5 ? 'nd_hoof' : 'nd_damp')); }
    if (poor && RY() < .6) { const lx = gx + (RY() - .5), lz = d / 2 - 2.5; dec(lx, lz, 2.4, 'nd_puddle', [.9, .9, .9]); }
    if (!poor) for (let i = 0; i < 4; i++) { const lx = (RY() - .5) * (w - 3), lz = (RY() - .5) * (d - 3); if (free(lx, lz, .3)) tf(lx, lz, .22, ['ng_grass', 'ng_dry']); }
    if (rich) { const sl = new MB(); for (let lz = d / 2 - 1.2; !temple && lz > -d / 2 + 1; lz -= .95) for (const lx of [0]) { const p = F.p(lx + (RY() - .5) * .04, 0, lz); let ok = true; world.near(p[0], p[2], 1, s => { if (ok && s.cy + s.hy > .06 && world._inXZ(s, p[0], p[2], .35)) ok = false; }); if (!ok) continue;
        const k = .8 + RY() * .2; L.mb.s({ tex: 'stone', col: [k, k * .98, k * .94] }); L.mb.T(p[0], 0, p[2], 0, F.yaw + (RY() - .5) * .03, 0).box(0, .045, 0, 1.3 + RY() * .2, .075 + RY() * .02, .9, { world: 1, skip: ['bot'] }).pop(); }
      void sl;
      // peonies in a raised bed, bamboo by the wall, a lotus pond if there is room
      const bed = tryPlace('planter', 1.2, 10, { s: 1.6, solid: .5 }); if (bed) { for (let i = 0; i < 3; i++) { const p = F.p(bed[0] + (i - 1) * .45, 0, bed[1] + (RY() - .5) * .3); N.tree(L, p[0], .78, p[2], 'peony', .55 + RY() * .2, lot.seed + i); } }
      for (let i = 0; i < 2; i++) { const s = slots[(RY() * slots.length) | 0], lx = s[0] + Math.sin(s[2]) * .5, lz = s[1] + Math.cos(s[2]) * .5; if (free(lx, lz, 1.1)) { occ.push([lx, lz, 1.1]); const p = F.p(lx, 0, lz); N.tree(L, p[0], 0, p[2], 'bamboo', .8 + RY() * .3, lot.seed + 50 + i); } }
      for (let i = 0; i < 12; i++) { const pw = 3.5 + RY() * 2, pd = 2.5 + RY() * 1.5, lx = (RY() - .5) * (w - pw - 3), lz = (RY() - .5) * (d - pd - 3);
        if (!free(lx, lz, Math.hypot(pw, pd) / 2 + .3)) continue; occ.push([lx, lz, Math.hypot(pw, pd) / 2 + .3]); pond(L, F, lx, lz, pw, pd, RY); break; }
      const lp = tryPlace('pot', .3, 8); void lp;
    }
    if (!rich && kind === 'house' && RY() < .5) for (let i = 0; i < 2; i++) tryPlace('pot', .3, 8);
    flushBases(L, [lot]);
  };
  // a small garden pond: stone kerb, water a little below ground, lotus pads and a few pink flowers (summer)
  function pond(L, F, lx, lz, pw, pd, R) {
    const b = L.mb, p = F.p(lx, 0, lz); b.T(p[0], 0, p[2], 0, F.yaw, 0);
    b.s({ tex: 'stone', col: [.82, .8, .76] }); const t = .3;
    b.box(0, .12, pd / 2 + t / 2, pw + 2 * t, .26, t, { world: 1, skip: ['bot'] }).box(0, .12, -pd / 2 - t / 2, pw + 2 * t, .26, t, { world: 1, skip: ['bot'] }).box(pw / 2 + t / 2, .12, 0, t, .26, pd, { world: 1, skip: ['bot'] }).box(-pw / 2 - t / 2, .12, 0, t, .26, pd, { world: 1, skip: ['bot'] });
    b.s({ tex: 'water', col: [.7, .85, .85] }).box(0, .06, 0, pw, .04, pd, { world: 2, skip: ['bot'] });
    b.pop();
    for (let i = 0; i < 9; i++) { const x = (R() - .5) * (pw - .6), z = (R() - .5) * (pd - .6), q = F.p(lx + x, 0, lz + z), s = .35 + R() * .3; decal(L.fol, q[0], .1 + i * .007, q[2], s, s, R() * TAU, L_('nd_lotus'), [1, 1, 1]); }
    for (let i = 0; i < 3; i++) { const q = F.p(lx + (R() - .5) * (pw - 1), 0, lz + (R() - .5) * (pd - 1)); L.mb.s({ tex: 'silk', col: [1.1, .7, .75] }).T(q[0], .35 + R() * .2, q[2]).lathe([[0, -.05], [.06, 0], [.1, .08], [.04, .07], [0, .02]], { seg: 6 }).pop(); L.mb.s({ tex: 'moss', col: [.6, .8, .5] }).T(q[0], 0, q[2]).box(0, .2, 0, .015, .3, .015).pop(); }
    L.world.box(p[0], .13, p[2], pw / 2 + t, .13, pd / 2 + t, { yaw: F.yaw });
  }

  N._decalAt = decalAt; N._ST = ST;
  return N;
})();
