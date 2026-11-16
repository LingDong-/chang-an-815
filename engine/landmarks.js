// landmarks.js — dedicated builders for the famous places of Chang'an (temples, Daoist abbeys, parks, the 樂遊原, 曲江 …).
// A landmark is a named special lot (PLANW.SPECIAL in city.js: {type, at: [fx0, fz0, fx1, fz1], name, …}). When LANDMARKS.builders has an
// entry for its name, COMP.bigUnits uses it instead of the generic temple/office builder, at every level of detail:
//   LANDMARKS.builders[name] = lot => [{ x, z, build(L) }, …]   parts spread over the 64 m chunks (each part is built by the chunk that
//   contains (x, z)); build(L) must respect ARCH.lod (0 = full detail with collision + meta, 1 = LOD1 group, 2 = far ward meshes FARB) and
//   must be deterministic (RNG from lot.seed). COMP.frame(lot) gives the lot frame { F, w, d } (F.p(lx, ly, lz) → world, front = +z).
//
// Landmarks (round 15). Sources: 長安志 (宋敏求) 卷7–10, 唐兩京城坊考 (徐松) 卷2–4, 酉陽雜俎 續集 寺塔記 (段成式, c. 843), REF_CHANGAN.md.
//   玄都觀 (崇業, 九五 ridge): Daoist abbey; 劉禹錫 元和十年 「玄都觀裏桃千樹，盡是劉郎去後栽」 → walled peach orchards (in leaf, summer).
//   大慈恩寺 (晉昌 E half): 十餘院; 大雁塔 (10 storeys after 大曆) in the 西院 (front court here); 牡丹 courts (元果院 etc.).
//   杏園 (通善, S of 慈恩寺): apricot garden of the 進士 杏園宴 — open orchard with pavilions.
//   樂遊原 (昇平 NE): highest ground in the city, grassy plateau, 樂遊廟 site, pavilions, view; 青龍寺 (新昌, S gate east) on its east end.
//   大興善寺 (靖善, whole ward, 九五 ridge): 隋 national temple, huge 大興佛殿; 不空 (密教) — 灌頂道場.
//   大莊嚴寺 / 大總持寺 (和平 / 永陽): Sui twin temples with wooden pagodas 木浮圖 (~330 尺 claimed) — the SW skyline.
//   西明寺 (延康): 顯慶 temple modelled on 祇園, 十院; 牡丹. 大安國寺 (長樂): 睿宗 old residence, rich murals. 昊天觀 (保寧, whole ward).
//   大薦福寺 (開化): the temple (its pagoda court is in 安仁 — TANG.pagodaWalk, untouched). 唐昌觀 (安業): 玉蕊花 (white flowering tree).
// Everything is Tang: timber halls on brick platforms, 鴟尾, grey tiles, corridor courts (廊院), no stone lanterns, no masonry arches.
'use strict';
const LANDMARKS = {
  builders: {},
  parts(lot) { const f = lot.name && this.builders[lot.name]; return f ? f(lot) : null; },
  has(lot) { return !!(lot.name && this.builders[lot.name]); },
  // the build context of a landmark (main thread: people placement reads C.sites; no geometry is built). Cached per lot.
  _ctx: new Map(),
  ctx(lot) { const k = lot.name + '@' + Math.round(lot.r.x0) + ',' + Math.round(lot.r.z0); if (!this._ctx.has(k)) { const out = this.parts(lot); this._ctx.set(k, out && out.ctx || null); } return this._ctx.get(k); },
};

// ---- name plaques (寺額 / 觀額) over the main gates: gold on dark blue like the gate plaques (same in the page, workers and Node)
const LM_PLAQUES = ['玄都觀', '大慈恩寺', '大興善寺', '青龍寺', '西明寺', '大安國寺', '昊天觀', '大莊嚴寺', '大總持寺', '大薦福寺', '唐昌觀', '樂遊廟', '大秦寺'];
for (const nm of LM_PLAQUES) if (!TEX.L['lm_' + nm]) TEX.glyph('lm_' + nm, nm, { aspect: nm.length > 3 ? .32 : .42, fill: .86, fg: _gc([232, 196, 100], [200, 150, 66], 316), bg: _frame(_gc([36, 60, 92], [28, 46, 74], 317), [200, 160, 80], 9, 318) });

const LM = {
  // ground height: far meshes stand on the far terrain (樂遊原 / 九五 ridges are in CITY.base); detail levels on the flat walkable ground
  y(x, z) { return ARCH.lod === 2 && typeof FARB !== 'undefined' ? FARB.y(x, z) : 0; },
  // a landmark's build context: lot frame, parts list, shared footprint list (lot-local rects, read by nature.js and tree placement)
  ctx(lot) {
    const { F, w, d } = COMP.frame(lot), C = { lot, F, w, d, out: [], foot: [], R: RNG(((lot.seed | 0) ^ 0x2545f491) + 7), hf: null, sites: [] };
    C.out.ctx = C; C.P = (lx, lz) => F.p(lx, 0, lz);
    // people sites (lot-local; read by core.js LMPPL): kind + o {face: [fx, fz] lot-local facing, w (row width), r (radius), rect: [x0, z0, x1, z1], floor (raised floor height), yaw}
    C.site = (kind, lx, lz, o = {}) => { C.sites.push(Object.assign({ kind, lx, lz }, o)); };
    // far level: each part is lifted as a whole onto the far terrain at its centre (mesh transforms on L.mb and L.fol, so the kit's and
    // COMP's y = 0 builders land there too); C.Y then gives heights relative to that lift (walls on slopes use it per piece)
    C._lift = 0; C.Y = (lx, lz) => { if (ARCH.lod === 2) { const p = F.p(lx, 0, lz); return LM.y(p[0], p[2]) + (C.hf ? C.hf(lx, lz) : 0) - C._lift; } return C.hf ? C.hf(lx, lz) : 0; }; // far: the same plateau (樂遊原) on the far ground
    C.part = (lx, lz, fn, tag) => { const p = F.p(lx, 0, lz); C.out.push({ x: p[0], z: p[2], tag, build: L => { const keep = lot.foot; lot.foot = C.foot; const far = ARCH.lod === 2;
      if (far) { C._lift = LM.y(p[0], p[2]); L.mb.T(0, C._lift, 0); L.fol.T(0, C._lift, 0); }
      try { COMP.netRun(L, lot, () => fn(L, C.Y(lx, lz))); } finally { lot.foot = keep; if (far) { L.mb.pop(); L.fol.pop(); C._lift = 0; } } } }); };
    C.mark = (x0, z0, x1, z1) => C.foot.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
    C.free = (x, z, m = 0) => !C.foot.some(f => x > f[0] - m && x < f[2] + m && z > f[1] - m && z < f[3] + m);
    return C;
  },
  // a building on the lot frame (COMP.B: footprint, night lamps, interior); o.y overrides the ground height
  hall(L, C, lx, lz, yaw, o) { return COMP.B(L, C.lot, C.F, lx, lz, yaw, Object.assign({ y: C.Y(lx, lz) }, o)); },
  // straight wall run between two lot-local points. Detail: into the part's wall network (junction piers). Far: plain boxes per ≤ 40 m piece,
  // each on its own ground height and reaching 2 m into the ground (the far terrain is not flat)
  wall(L, C, x0, z0, x1, z1, o = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < .4) return;
    if (ARCH.lod !== 2) { const a = C.P(x0, z0), b = C.P(x1, z1), y = o.y ?? C.Y((x0 + x1) / 2, (z0 + z1) / 2); COMP.wall(L, a[0], a[2], b[0], b[2], { style: o.style || 'courtyard', h: o.h || 3, t: o.t || .6, y }); return; }
    const n = Math.max(1, Math.ceil(len / 40)), h = o.h || 3, t = o.t || .6, b = L.mb;
    for (let k = 0; k < n; k++) { const ax = lerp(x0, x1, k / n), az = lerp(z0, z1, k / n), bx = lerp(x0, x1, (k + 1) / n), bz = lerp(z0, z1, (k + 1) / n), p = C.P((ax + bx) / 2, (az + bz) / 2), y = C.Y((ax + bx) / 2, (az + bz) / 2), l = len / n;
      b.T(p[0], y, p[2], 0, C.F.yaw + Math.atan2(-(bz - az), bx - ax), 0).s({ tex: o.style === 'mud' ? 'rammed_earth' : 'plaster', col: o.style === 'mud' ? [1, 1, 1] : [1.02, .91, .74] }).box(0, (h - 2) / 2, 0, l + t, h + 2, t, { uv: [Math.max(1, Math.round(l / 4)), 1], skip: ['bot'] });
      if (o.style !== 'mud') b.s({ tex: 'roof_tile', col: [1, 1, 1] }).box(0, h + .12, 0, l + t + .2, .24, t + .5, { uv: [Math.max(1, Math.round(l / 2)), 1], skip: ['bot'] }); b.pop(); }
  },
  // rectangular enclosure (lot-local rect) with gaps: gaps = [[side 'f'|'b'|'l'|'r', centre, width], …] (f = +z side)
  ring(L, C, x0, z0, x1, z1, gaps = [], o = {}) {
    const run = (side, a0, a1, fix, horiz) => { const gs = gaps.filter(g => g[0] === side).map(g => [g[1] - g[2] / 2, g[1] + g[2] / 2]).sort((p, q) => p[0] - q[0]); let a = a0;
      for (const [g0, g1] of gs) { if (g0 > a) horiz ? LM.wall(L, C, a, fix, g0, fix, o) : LM.wall(L, C, fix, a, fix, g0, o); a = Math.max(a, g1); }
      if (a1 > a) horiz ? LM.wall(L, C, a, fix, a1, fix, o) : LM.wall(L, C, fix, a, fix, a1, o); };
    run('b', x0, x1, z0, true); run('f', x0, x1, z1, true); run('l', z0, z1, x0, false); run('r', z0, z1, x1, false);
  },
  // the main gate 山門 (straddling the front wall line at lz), with its plaque
  gatehouse(L, C, lx, lz, o = {}) { const nb = o.bays || 3, bw = o.bayW || 4.4, mid = (nb - 1) / 2, fr = Array.from({ length: nb }, (_, i) => i === mid ? 'boardopen' : (o.open && Math.abs(i - mid) === 1 ? 'boardopen' : 'wall'));
    return LM.hall(L, C, lx, lz, o.yaw || 0, { cls: 3, bays: nb, dbays: 2, bayW: bw, dbayW: 3.4, colH: o.colH || 4.2, platform: .38, pm: .5, steps: false, brackets: o.brackets || 'simple', roof: o.roof || 'xieshan', fish: true, paint: 'ochre',
      fill: { front: fr, back: Array.from({ length: nb }, (_, i) => i === mid ? 'opendoor' : 'open'), left: ['wall', 'wall'], right: ['wall', 'wall'] }, studs: true, tablet: o.tablet, tabletW: .7, tabletH: o.tablet && o.tablet.length > 6 ? 2.2 : 1.67, seed: C.lot.seed + (o.seed || 0), furnish: null }); },
  // corridor court 廊院 (local, as in COMP.templeParts): half-width cx, front line cTop (gate gap ±gw/2), back line cBot
  cloister(C, cx, cTop, cBot, gw, o = {}) { const P2 = (x, z) => { const p = C.P(x, z); return [p[0], p[2]]; }, paint = o.paint || 'ochre', s = C.lot.seed;
    C.part(0, cBot, (L, y) => ARCH.corridor(L, ...P2(-cx - 1.4, cBot), ...P2(cx + 1.4, cBot), { y, w: 2.8, wall: -1, colH: 3.05, paint, seed: s + 7 }));
    for (const sd of [-1, 1]) { const za = cTop - .9, zb = cBot + 2.2; C.part(sd * cx, (za + zb) / 2, (L, y) => ARCH.corridor(L, ...P2(sd * cx, za), ...P2(sd * cx, zb), { y, w: 2.8, wall: sd, paint, seed: s + sd })); // starts where the front corridor's platform ends (no coplanar platform tops at the corners)
      C.part(sd * (cx + gw / 2) / 2, cTop + 1.3, (L, y) => ARCH.corridor(L, ...P2(sd * (gw / 2 + 1), cTop + 1.3), ...P2(sd * (cx + 1.4), cTop + 1.3), { y, w: 2.6, wall: 0, colH: 3.05, paint, seed: s + 4 + sd })); C.mark(sd * cx - 1.6, cBot - 1.6, sd * cx + 1.6, cTop + 1.6); }
    C.mark(-cx - 1.6, cBot - 1.6, cx + 1.6, cBot + 1.6); C.mark(-cx - 1.6, cTop, cx + 1.6, cTop + 2.8);
  C.part(0, (cTop + cBot) / 2, L => { if (ARCH.lod !== 2) return; const p = C.P(0, (cTop + cBot) / 2); L.mb.T(p[0], 0, p[2], 0, C.F.yaw, 0).s({ tex: 'pave', col: [1.1, 1.05, .98] }).box(0, .15, 0, 2 * cx - 2, .5, cTop - cBot - 2, { skip: ['bot'], uv: [8, 8] }).pop(); }, 'court-far');
    if (o.gate !== false) C.part(0, cTop + 1.3, (L, y) => LM.hall(L, C, 0, cTop + 1.3, 0, { cls: 3, bays: 3, dbays: 2, bayW: Math.max(3.6, (gw - .4) / 3), dbayW: 3, colH: 3.6, platform: .38, pm: .4, steps: false, brackets: 'simple', roof: 'xieshan', paint, fill: { front: ['open', 'opendoor', 'open'], back: ['open', 'opendoor', 'open'], left: ['wall'], right: ['wall'] }, furnish: null, seed: s + 9, y })); },
  // trees in a part (one part per tree: crowns are big), avoiding the footprints
  trees(C, list, seed0) { for (const [x, z, k, s, i] of list) { if (!C.free(x, z, 4.5)) continue; C.mark(x - .8, z - .8, x + .8, z + .8); C.part(x, z, (L, y) => TREES.place(L, ...[C.P(x, z)].map(p => [p[0], y, p[2]])[0], k, s, seed0 + i)); } },
  scatterTrees(C, x0, z0, x1, z1, n, kinds, seed0, s0 = 1) { const R = RNG(seed0), L = []; for (let i = 0; i < n * 3 && L.length < n; i++) { const x = lerp(x0, x1, R()), z = lerp(z0, z1, R()), k = kinds[(R() * kinds.length) | 0];
    if (C.free(x, z, 4.5) && !L.some(t => Math.hypot(t[0] - x, t[1] - z) < 7)) L.push([x, z, k, s0 * (.85 + R() * .35), i]); } LM.trees(C, L, seed0); },
  // an orchard (桃 / 杏 / 梨) in a lot-local rect: rows of trees on grassed beds between trodden paths, in parts of ~40 m;
  // far: every third tree, a little bigger (the orchard's silhouette and colour remain)
  orchard(C, x0, z0, x1, z1, o = {}) { const sp = o.sp || 7.5, kind = o.kind || 'peach', nx = Math.max(1, Math.floor((x1 - x0) / sp)), nz = Math.max(1, Math.floor((z1 - z0) / sp)), dx = (x1 - x0) / nx, dz = (z1 - z0) / nz, cell = 40;
    C.site('orchard', (x0 + x1) / 2, (z0 + z1) / 2, { rect: [x0 + 2, z0 + 2, x1 - 2, z1 - 2], sp: dx });
    C.mark(x0, z0, x1, z1); const kF = Math.max(4, Math.ceil(nx * nz / 200)), k1 = Math.max(2, Math.ceil(nx * nz / 450)), cx = Math.max(1, Math.round((x1 - x0) / cell)), cz = Math.max(1, Math.round((z1 - z0) / cell)), seed0 = (o.seed || C.lot.seed) | 0;
    for (let a = 0; a < cx; a++) for (let c = 0; c < cz; c++) { const i0 = Math.floor(nx * a / cx), i1 = Math.floor(nx * (a + 1) / cx), j0 = Math.floor(nz * c / cz), j1 = Math.floor(nz * (c + 1) / cz), mx = x0 + (i0 + i1) / 2 * dx, mz = z0 + (j0 + j1) / 2 * dz;
      C.part(mx, mz, (L, y0) => { const R = RNG(seed0 + a * 977 + c * 131), b = L.mb;
        if (ARCH.lod === 2) { const xa = x0 + i0 * dx, xb = x0 + i1 * dx, za = z0 + j0 * dz, zb = z0 + j1 * dz, p = C.P((xa + xb) / 2, (za + zb) / 2); // far: one green patch per part (the orchards read as green blocks from afar)
          b.T(p[0], C.Y((xa + xb) / 2, (za + zb) / 2), p[2], 0, C.F.yaw, 0).s({ tex: 'grass_summer', col: [.8, .9, .7] }).box(0, .1, 0, xb - xa, .6, zb - za, { skip: ['bot'] }).pop(); }
        if (ARCH.lod !== 2 && !o.noBeds) for (let j = j0; j < j1; j++) { const zc = z0 + (j + .5) * dz, xa = x0 + i0 * dx + .4, xb = x0 + i1 * dx - .4, p = C.P((xa + xb) / 2, zc); // grassed bed under each row (paths of bare loess between)
          b.T(p[0], y0, p[2], 0, C.F.yaw, 0).s({ tex: 'grass_summer', col: o.bedCol || [.95, .97, .9] }).box(0, .04, 0, xb - xa, .08, dz - 2.2, { uv: [Math.max(1, Math.round((xb - xa) / 3)), Math.max(1, Math.round((dz - 2.2) / 3))], skip: ['bot'] }).pop(); }
        for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) { if (o.skip && o.skip(i, j)) continue; const far = ARCH.lod === 2; if (far ? (i + 2 * j) % kF : ARCH.lod && (i + j) % k1) continue; R(); const x = x0 + (i + .5 + (R() - .5) * .3) * dx, z = z0 + (j + .5 + (R() - .5) * .3) * dz;
          if (o.hole && o.hole(x, z)) continue; const s = (o.s || 1.25) * (.85 + R() * .3) * (far ? 1.25 + kF * .04 : ARCH.lod ? 1.15 : 1), p = C.P(x, z); TREES.place(L, p[0], C.Y(x, z) + (far || o.noBeds ? 0 : .08), p[2], kind === 'mix' ? ['peach', 'apricot', 'peach', 'jujube'][(i * 7 + j * 3) % 4] : kind, s, seed0 + i * 131 + j * 7); } }); } },
  // brick incense burner / stele / bell pavilion bits (detail only)
  stele(L, C, lx, lz, yaw = 0, dy = 0) { if (ARCH.lod) return; const p = C.P(lx, lz); L.prop(b => PROPS.stele(b, 'stele_text', 1.1), p[0], C.Y(lx, lz) + dy, p[2], { yaw: C.F.yaw + yaw, solid: { w: 1.6, h: 3, d: 1.2 } }); },
  censer(L, C, lx, lz) { if (ARCH.lod) return; const p = C.P(lx, lz); L.prop(b => { b.s({ tex: 'stone', col: [.9, .88, .84] }).box(0, .35, 0, 1.1, .7, 1.1); b.T(0, .7, 0, 0, 0, 0, 1.6); PROPS.incenseBurner(b, 1, .8); b.pop(); }, p[0], C.Y(lx, lz), p[2], { yaw: C.F.yaw, solid: { w: 1.2, h: 1.6, d: 1.2 } }); },
  // three-tier altar platform (壇): Daoist 醮壇 / the 樂遊廟 terrace; square brick tiers with stairs on four sides
  altar(L, C, lx, lz, o = {}) { const b = L.mb, y = C.Y(lx, lz), p = C.P(lx, lz), s0 = o.s || 16, n = o.tiers || 3, th = o.th || .9; let yy = 0;
    b.T(p[0], y, p[2], 0, C.F.yaw, 0);
    for (let k = 0; k < n; k++) { const s = s0 * (1 - k * .27); b.s({ tex: 'brick', col: [1.05, 1, .95] }).box(0, yy + th / 2, 0, s, th, s, { faces: { top: 'pave' }, skip: ['bot'], world: 1.5 }); b.s({ tex: 'stone', col: [.95, .95, .93] }).box(0, yy + th - .06, 0, s + .08, .12, s + .08, { skip: ['bot', 'top'], world: 1.5 }); // world-scaled texture // curb: sides only (its top would lie on the paving)
      if (!ARCH.lod) { const q = C.P(lx, lz); L.world.box(q[0], y + yy + th / 2, q[2], s / 2, th / 2, s / 2, { yaw: C.F.yaw, surface: 'brick' }); for (let f = 0; f < 4; f++) { const a = f * PI / 2, e = s / 2 + .01; ARCH._steps(L, ARCH.F(p[0] + Math.sin(C.F.yaw + a) * e, y + yy, p[2] + Math.cos(C.F.yaw + a) * e, C.F.yaw + a), 0, 0, 0, 2.4, th, {}); } }
      yy += th; }
    b.pop(); return y + yy; },
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// WOODEN PAGODA 木浮圖 (Sui/Tang 樓閣式, square): storeys of red columns and white walls on a stone platform, each with its tiled skirt eave;
// a 平坐 balcony with a railing on every upper storey; pyramidal top roof and an iron 剎 with 相輪 rings. o: {storeys, w (base body width), h1}
// ---------------------------------------------------------------------------------------------------------------------------------------
LM.woodPagoda = function (L, x, y, z, o = {}) {
  const b = L.mb, n = o.storeys || 7, W0 = o.w || 18, h1 = o.h1 || 7.2, pit = .42, far = ARCH.lod === 2; let yy = 2.2, half = W0 / 2;
  b.T(x, y, z, 0, o.yaw || 0, 0); b.s({ tex: 'brick', col: [1, .98, .94], emi: 0 }).box(0, 1.1 - (far ? 1 : 0), 0, W0 + 9, 2.2 + (far ? 2 : 0), W0 + 9, { faces: { top: 'pave' }, skip: ['bot'] }); // 臺基
  b.s({ tex: 'stone', col: [.95, .95, .93] }).box(0, 2.1, 0, W0 + 9.1, .2, W0 + 9.1, { skip: ['bot', 'top'] });
  if (!far) { L.world.box(x, y + 1.1, z, (W0 + 9) / 2, 1.1, (W0 + 9) / 2, { yaw: o.yaw || 0, surface: 'stone' }); for (let f = 0; f < 4; f++) { const a = (o.yaw || 0) + f * PI / 2, e = (W0 + 9) / 2 + .01; ARCH._steps(L, ARCH.F(x + Math.sin(a) * e, y, z + Math.cos(a) * e, a), 0, 0, 0, 4, 2.2, {}); } }
  const skirt = (E, y0, Hk, apex) => { // pyramidal eave over half-size E at y0, rising Hk to the apex (hidden inside the next storey unless apex)
    if (!far) { b.T(0, y0, 0); ARCH.roofPoly(b, { n: 4, R: E * Math.SQRT2, a0: PI / 4, H: Hk, k: .25, up: Math.min(.7, .15 + E * .04), thick: .3 }); b.pop(); return; }
    b.s({ tex: 'roof_tile', col: [1, 1, 1] }); for (let f = 0; f < 4; f++) { const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]], p0 = c[f], p1 = c[(f + 1) % 4]; ARCH.poly(b, [[p0[0] * E, y0, p0[1] * E], [p1[0] * E, y0, p1[1] * E], [0, y0 + Hk, 0]], [(p0[0] + p1[0]) / 2, .8, (p0[1] + p1[1]) / 2]); } };
  for (let i = 0; i < n; i++) {
    const h = h1 * (1 - i * .06), bays = half > 7 ? 5 : 3, cw = 2 * half / bays;
    // body: white plastered walls, red columns at the bay lines, a dark door in the middle bay of each face
    b.s({ tex: far ? 'facade_lod' : 'plaster', col: [1.05, 1.02, .96] }).box(0, yy + h / 2, 0, 2 * half - .3, h, 2 * half - .3, { uv: [bays, 1], skip: ['bot', 'top'] });
    if (!far) { for (let f = 0; f < 4; f++) { b.T(0, yy, 0, 0, f * PI / 2, 0); for (let k = 0; k < bays; k++) { const cx = k ? -half + k * cw : -half + .15; b.s({ tex: 'vermilion', col: [1, 1, 1] }).box(cx, h / 2, half - .15, .5, h - .02, .5); } // each face owns one corner column
        b.s({ tex: 'door_studs', col: [.8, .3, .22] }).box(0, h * .36, half - .1, cw * .7, h * .72, .06); b.s({ tex: 'lattice', col: [.75, .5, .35] }); for (const sx of [-1, 1]) if (bays > 3) b.box(sx * cw * 1.5, h * .55, half - .1, cw * .6, h * .35, .06); b.pop(); }
      b.s({ tex: 'beam_ochre', col: [1, 1, 1] }).box(0, yy + h - .3, 0, 2 * half + .1, .6, 2 * half + .1, { skip: ['bot', 'top'] }); }
    yy += h;
    // bracket band (斗栱) and the eave
    const bh = far ? .9 : 1.1; b.s({ tex: far ? 'beam_ochre' : 'paint_ochre', col: [1, 1, 1] }).box(0, yy + bh / 2, 0, 2 * half + 1.4, bh, 2 * half + 1.4, { uv: [Math.round(half), 1], skip: ['bot'] });
    if (!far) L.world.box(x, y + yy - h / 2, z, half - .15, h / 2, half - .15, { yaw: o.yaw || 0, surface: 'wood' });
    yy += bh; const E = half + 3.1, top = i === n - 1;
    if (top) { const Hk = E * .8; skirt(E, yy, Hk, true); yy += Hk; break; }
    const nh = half * (1 - .075) - .2, bal = nh + 1.3, yb = yy + (E - bal) * pit; skirt(E, yy, E * pit * 1.05, false);
    // 平坐 balcony (a stage of brackets and a floor with a railing) for the next storey
    b.s({ tex: far ? 'beam_ochre' : 'paint_ochre', col: [1, 1, 1] }).box(0, yb + .05, 0, 2 * bal - .8, 1.3, 2 * bal - .8, { skip: ['bot'] }); // its base buried in the skirt roof b.s({ tex: 'plank', col: [.7, .55, .42] }).box(0, yb + .8, 0, 2 * bal, .2, 2 * bal, { skip: ['bot'] });
    if (!far) { b.s({ tex: 'vermilion', col: [1, 1, 1] }); for (let f = 0; f < 4; f++) { b.T(0, yb + .9, 0, 0, f * PI / 2, 0); b.box(0, .95, bal - .1, 2 * bal - .26, .1, .1); b.box(0, .45, bal - .1, 2 * bal - .26, .06, .06); for (let k = 0; k < 8; k++) b.box(k ? -bal + k * bal / 4 : -bal + .1, .5, bal - .1, .12, 1.02, .12); b.pop(); } } // rails stop short of the corners; one corner post per face
    yy = yb + .9; half = nh;
  }
  // 剎: iron mast, 覆鉢, 相輪 rings, 寶珠
  b.s({ tex: 'iron', col: [.5, .48, .45] }).box(0, yy + 6, 0, .35, 12, .35, { skip: ['bot'] }); if (!far) { b.T(0, yy, 0).lathe([[0, 0], [1.6, 0], [1.5, .9], [.4, 1.3], [0, 1.3]], { seg: 10 }); for (let k = 0; k < 7; k++) b.T(0, 1.8 + k * 1.15, 0).lathe([[.15, -.12], [1.05 - k * .07, -.08], [1.05 - k * .07, .08], [.15, .12]], { seg: 10 }).pop(); b.T(0, 11.6, 0).lathe([[0, 0], [.5, .3], [.5, .7], [0, 1.2]], { seg: 8 }).pop(); b.pop(); }
  else b.box(0, yy + .7, 0, 2.4, 1.4, 2.4, { skip: ['bot'] });
  b.pop(); return { top: y + yy + 12 };
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// courts (院) of a big monastery / abbey, w x d in their own frame F2 (front +z): the kit's ('house' 僧院/道院, 'kitchen', 'veg', 'garden',
// 'library') and the landmarks' own: 'peony' 牡丹院 (beds of peonies before a small hall, rocks, a pine), 'orchard' (walled fruit garden),
// 'tower' 塔院 (a brick pagoda in its own court), 'bell' (a bell pavilion court), 'pool' (a lotus pond court with a pavilion)
// ---------------------------------------------------------------------------------------------------------------------------------------
// recolour the vertices built since v0 whose texture layer is one of `layers` (e.g. the red-washed walls of the 紅樓)
LM.tint = (b, v0, layers, col) => { const ids = new Set(layers.map(n => TEX.id(n))); for (let i = v0; i < b.nv; i++) if (ids.has(b.L[i])) for (let k = 0; k < 3; k++) b.C[i * 4 + k] *= col[k]; };
// far stand-ins (ARCH.lod 2; the part is already lifted onto the far terrain): a plain mass with its roof, a cheap pavilion
LM.mass = (b, x, y, z, yaw, w, d, h, roof = 'xieshan', tiles) => { b.T(x, y, z, 0, yaw, 0); b.s({ tex: 'facade_lod', col: [1, 1, 1] }).box(0, h / 2 - .5, 0, w, h + 1, d, { uv: [Math.max(1, Math.round(w / 3.5)), 1], skip: ['bot', 'top'] }); LOD.roof(b, w, d, h, Math.min(1.4, w * .1), roof, tiles, w / 2 - .02); b.pop(); };
LM.pav = (L, x, y, z, o = {}) => { if (!ARCH.lod) return ARCH.pavilion(L, x, y, z, o); const b = L.mb, r = (o.r || 2.2) + .3, h = (o.platform ?? .5) + (o.colH || 3); b.T(x, y, z, 0, o.yaw || 0, 0);
  b.s({ tex: 'brick', col: [1, 1, 1] }).box(0, (o.platform ?? .5) / 2, 0, 2 * r + 1.4, o.platform ?? .5, 2 * r + 1.4, { skip: ['bot'] }); b.s({ tex: 'vermilion', col: [1, 1, 1] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * r * .75, h / 2, sz * r * .75, .3, h, .3, { skip: ['bot', 'top'] });
  LOD.roof(b, 2 * r, 2 * r, h, 1.1, 'pyramid'); b.pop(); };
LM.cellFar = function (L, sub, F2, w, d, kind) { const b = L.mb, P = (x, z) => F2.p(x, 0, z), s = sub.seed | 0;
  if (kind !== 'orchard') for (const [x0, z0, x1, z1] of [[-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2]]) { const p = P((x0 + x1) / 2, (z0 + z1) / 2), l = Math.hypot(x1 - x0, z1 - z0);
    b.T(p[0], 0, p[2], 0, F2.yaw + Math.atan2(-(z1 - z0), x1 - x0), 0).s({ tex: 'plaster', col: [1.02, .91, .74] }).box(0, .4, 0, l, 4.8, .6, { uv: [Math.max(1, Math.round(l / 4)), 1], skip: ['bot'] }).s({ tex: 'roof_tile' }).box(0, 2.9, 0, l + .4, .2, 1, { skip: ['bot'] }).pop(); }
  const hall = (lx, lz, yw, ww, dd, h, roof) => { const p = P(lx, lz); LM.mass(b, p[0], 0, p[2], F2.yaw + yw, ww, dd, h, roof); }, tree = (lx, lz, k, sc) => COMP.tree(L, F2, lx, lz, k, sc, s + lx * 3 + lz | 0);
  if (kind === 'house' || kind === 'monks' || kind === 'kitchen' || kind === 'library') { hall(0, -d / 2 + 5, 0, Math.min(w - 4, 16), 7.5, kind === 'library' ? 7 : 4, kind === 'library' ? 'xieshan' : 'gable'); for (const sd of [-1, 1]) hall(sd * (w / 2 - 4), 2, PI / 2, Math.min(d - 14, 14), 6, 3.4, 'gable'); tree(0, d / 4, 'huai', 1.1); return; }
  if (kind === 'veg') { b.s({ tex: 'field_crop', col: [1, 1, 1] }); const p = P(0, -2); b.T(p[0], 0, p[2], 0, F2.yaw, 0).box(0, .1, 0, w - 6, .2, d - 10, { skip: ['bot'], uv: [Math.round(w / 4), Math.round(d / 4)] }).pop(); return; }
  if (kind === 'peony' || kind === 'tower' || kind === 'bell' || kind === 'pool') { hall(0, -d / 2 + 5, 0, Math.min(w - 6, 13), 7, 4, 'xieshan'); if (kind === 'tower') { const p = P(0, 1); TANG.pagoda(L, p[0], 0, p[2], { yaw: F2.yaw, storeys: sub.storeys || 7, w: Math.min(9, w * .25), h1: 4.2, taper: .06 }); }
    if (kind === 'bell') { const p = P(0, 0); LM.pav(L, p[0], 0, p[2], { yaw: F2.yaw, r: 3, colH: 3.6, platform: .9 }); } if (kind === 'pool') { const p = P(0, 0); b.T(p[0], 0, p[2], 0, F2.yaw, 0).s({ tex: 'water', col: [.75, .85, .8], emi: .04 }).box(0, .3, 0, Math.min(w - 10, 20), .1, Math.min(d - 14, 14), { skip: ['bot'] }).s({ emi: 0 }).pop(); }
    if (kind === 'peony') { b.s({ tex: 'grass_summer', col: [1, .75, .8] }); const p = P(0, 2); b.T(p[0], 0, p[2], 0, F2.yaw, 0).box(0, .2, 0, w - 12, .4, d * .4, { skip: ['bot'] }).pop(); } tree(w / 2 - 5, d / 2 - 6, 'pine', 1); return; }
  if (kind === 'garden') { for (let i = 0; i < 3; i++) tree((i - 1) * w * .3, (i & 1 ? -1 : 1) * d * .2, ['pine', 'huai', 'bamboo'][i], 1.1); hall(0, 0, 0, 5, 5, 3, 'pyramid'); return; }
  if (kind === 'orchard') { const n = Math.max(2, Math.round(w * d / 260)); for (let i = 0; i < n; i++) tree(-w / 2 + 3 + ((i * 0.618 * 7) % 1) * (w - 6), -d / 2 + 3 + (i + .5) / n * (d - 6), sub.fruit || 'peach', 1.5); }
};
LM.cell = function (L, sub, F2, w, d, kind, R) {
  if (ARCH.lod === 2) return LM.cellFar(L, sub, F2, w, d, kind);
  const P = (x, z) => F2.p(x, 0, z);
  if (kind === 'garden') { COMP.enclose(L, F2, w, d, 0, 2.6, { h: 2.8 }); COMP.gate(L, F2, 0, d / 2 - .3, 2.7, { h: 2.9, cls: 3 }); sub.foot = [[-4, -4, 4, 4]]; // a garden court: a few old trees round a pavilion
    const ks = ['pine', 'cypress', 'bamboo', 'huai', 'tong', 'pomegranate'], n = Math.min(7, Math.round(w * d / 220)); for (let i = 0; i < n; i++) { const a = i / n * TAU + R(), r = Math.min(w, d) * (.28 + R() * .12); COMP.tree(L, F2, Math.cos(a) * r, Math.sin(a) * r * .9, ks[(i + (sub.seed & 3)) % ks.length], .9 + R() * .3, sub.seed + i); }
    const p = P(0, 0); LM.pav(L, p[0], 0, p[2], { yaw: F2.yaw, sides: (sub.seed & 2) ? 6 : 4, r: 2.2, colH: 2.9, platform: .5 }); if (!ARCH.lod) { const q = P(w / 4, -d / 4); ARCH.rock(L, q[0], q[2], 1.4, 1.6, sub.seed + 9); } return; }
  if (/^(house|veg|kitchen|library)$/.test(kind)) return COMP.templeCell(L, sub, F2, w, d, kind, R);
  sub.foot = [];
  if (kind === 'orchard') { COMP.enclose(L, F2, w, d, 0, 2.4, { style: 'mud', h: 1.9, t: .4, coping: false }); const k = sub.fruit || 'peach', sp = 6.5, nx = Math.max(1, Math.floor((w - 4) / sp)), nz = Math.max(1, Math.floor((d - 6) / sp));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (ARCH.lod === 2 && ((i + 2 * j) % 3)) continue; const x = -w / 2 + 2 + (i + .5) * (w - 4) / nx + (R() - .5), z = -d / 2 + 2 + (j + .5) * (d - 6) / nz + (R() - .5); if (Math.abs(x) < 2 && z > d / 2 - 8) continue; COMP.tree(L, F2, x, z, k, (1.2 + R() * .3) * (ARCH.lod === 2 ? 1.25 : 1), sub.seed + i * 31 + j); }
    return; }
  COMP.enclose(L, F2, w, d, 0, 2.6, { h: 2.8 }); COMP.gate(L, F2, 0, d / 2 - .3, 2.7, { h: 2.9, cls: 3 });
  if (kind === 'monks') { // 僧院 / 道院: the monks' rooms — a hall at the back, two wings (廂) facing the court, a tree, a well
    const nb = Math.max(3, Math.min(5, Math.floor((w - 8) / 3.8))), nd = Math.max(2, Math.min(4, Math.floor((d - 22) / 3.8)));
    COMP.B(L, sub, F2, 0, -d / 2 + 4.6, 0, { bays: nb, dbays: 2, bayW: 3.8, dbayW: 3.2, colH: 3.4, platform: .6, pm: .4, brackets: 'none', roof: 'gable', paint: 'ochre', walls: 'white', windows: true, door: [nb >> 1], seed: sub.seed, furnish: 'room' });
    for (const sx of (sub.seed & 1) ? [-1] : [1]) COMP.B(L, sub, F2, sx * (w / 2 - 4), 1.5, sx < 0 ? PI / 2 : -PI / 2, { bays: nd, dbays: 1, bayW: 3.6, dbayW: 4, colH: 3, platform: .4, pm: .3, brackets: 'none', roof: 'gable', paint: 'plain', walls: 'white', windows: true, door: [nd >> 1], seed: sub.seed + sx, furnish: 'room' });
    COMP.tree(L, F2, R() < .5 ? -3 : 3, d / 2 - 9, ['huai', 'pine', 'tong', 'jujube'][(sub.seed >>> 3) & 3], 1, sub.seed + 4); COMP.tree(L, F2, -w / 2 + 6, d / 2 - 5, ['pine', 'cypress', 'huai', 'pomegranate'][(sub.seed >>> 5) & 3], .9, sub.seed + 5); if (w > 26) COMP.tree(L, F2, w / 2 - 6, d / 2 - 12, ['huai', 'tong', 'jujube', 'pine'][(sub.seed >>> 7) & 3], 1, sub.seed + 6); if (!ARCH.lod) { const q = P(w / 2 - 8, d / 2 - 5); L.prop(PROPS.well, q[0], 0, q[2], { solid: { r: .9, h: .8 } }); } return; }
  if (kind === 'peony') { const nb = w > 30 ? 5 : 3; COMP.B(L, sub, F2, 0, -d / 2 + 5.5, 0, { cls: 3, bays: nb, dbays: 2, bayW: 3.8, dbayW: 3.4, colH: 3.6, platform: .7, pm: .5, brackets: 'simple', roof: 'xieshan', paint: 'ochre', walls: 'white', windows: true, doorOpen: true, furnish: 'hall', seed: sub.seed });
    const bw = Math.min(5, (w - 10) / 3); for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) { const z = -d / 2 + 13 + j * 4.2; if (z > d / 2 - 6) break; const p = P(sx * (bw / 2 + 2.2), z); ARCH.peonyBed(L, p[0], p[2], bw, 2.2, F2.yaw, sub.seed + j * 7 + sx); }
    if (!ARCH.lod) { const q = P(w / 2 - 4, d / 2 - 6); ARCH.rock(L, q[0], q[2], 1.6, 1.9, sub.seed + 3); } COMP.tree(L, F2, -w / 2 + 4, d / 2 - 6, 'pine', 1, sub.seed + 5); COMP.tree(L, F2, w / 2 - 4, -d / 2 + 4, 'pomegranate', 1, sub.seed + 6); return; }
  if (kind === 'tower') { const p = P(0, 1); TANG.pagoda(L, p[0], 0, p[2], { yaw: F2.yaw, storeys: sub.storeys || 7, w: Math.min(9, w * .25), h1: 4.2, taper: .06 }); sub.foot.push([-7, -6, 7, 8]);
    COMP.B(L, sub, F2, 0, -d / 2 + 4.5, 0, { cls: 3, bays: 3, dbays: 2, bayW: 3.8, dbayW: 3.2, colH: 3.4, platform: .6, pm: .4, brackets: 'simple', roof: 'xieshan', paint: 'ochre', walls: 'white', doorOpen: true, furnish: 'temple', seed: sub.seed }); for (const sx of [-1, 1]) COMP.tree(L, F2, sx * (w / 2 - 4), d / 2 - 6, 'cypress', 1, sub.seed + sx); return; }
  if (kind === 'pool') { const pw = Math.min(w - 10, 20), pd = Math.min(d - 14, 14), p = P(0, 0), b = L.mb; b.T(p[0], 0, p[2], 0, F2.yaw, 0); b.s({ tex: 'stone', col: [.9, .88, .84] }).box(0, .15, 0, pw + 1, .3, pd + 1, { skip: ['bot'], faces: { top: 'stone' } }); b.s({ tex: 'water', col: [.75, .85, .8], emi: .04 }).box(0, .31, 0, pw, .02, pd, { skip: ['bot'] }); b.s({ emi: 0 }).pop();
    if (!ARCH.lod) L.world.box(p[0], .15, p[2], (pw + 1) / 2, .15, (pd + 1) / 2, { yaw: F2.yaw, surface: 'stone' }); sub.foot.push([-pw / 2 - 1, -pd / 2 - 1, pw / 2 + 1, pd / 2 + 1]);
    const q = P(0, -d / 2 + 5); LM.pav(L, q[0], 0, q[2], { yaw: F2.yaw, sides: 4, r: 2.4, colH: 3, platform: .5 }); for (const sx of [-1, 1]) COMP.tree(L, F2, sx * (w / 2 - 4), 0, 'willow', 1, sub.seed + sx); return; }
  if (kind === 'bell') { const p = P(0, 0); LM.pav(L, p[0], 0, p[2], { yaw: F2.yaw, sides: 4, r: 3, colH: 3.6, platform: .9, benches: false }); if (!ARCH.lod) ARCH.stamp(L, 'lmbell', b => { b.s({ tex: 'bronze', col: [.7, .6, .45] }).lathe([[0, 0], [.75, 0], [.68, .2], [.6, 1.2], [.4, 1.5], [0, 1.6]], { seg: 12 }); }, p[0], .9 + 3.6 - 2.2, p[2], F2.yaw);
    COMP.B(L, sub, F2, 0, -d / 2 + 4.5, 0, { bays: 3, dbays: 2, bayW: 3.6, dbayW: 3.2, colH: 3.2, platform: .4, brackets: 'none', paint: 'ochre', walls: 'white', seed: sub.seed }); return; }
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// MONASTERY / ABBEY generator (one spec per landmark). Lot-local axis from the front gate (+z) back:
//   山門 (plaque) → front court (pagoda / 醮壇 / steles, trees) → corridor court 廊院 (中門, main hall 佛殿 / 天尊殿 on a high platform,
//   bell + sutra towers, peonies, censer) → 講堂 → rear halls / 閣 → side bands of 院 cells (rows of ~40 m), or orchards.
// S: { plaque, axisW, gate {bays, bayW, colH}, front (court depth), court (cloister depth), main {hall opts}, towers, peony, censer,
//      pagoda {kind 'dayan'|'brick'|'wood', …opts}, altar, lecture, rear: [{k:'hall'|'lou'|'lou2', …}], cells (kind weights), cell(fn),
//      side(C, sd, x0, x1, z0, z1) → true when it filled the band itself, axisTrees [kinds], extra(C, A) }
// ---------------------------------------------------------------------------------------------------------------------------------------
LM.monastery = function (lot, S) {
  const C = LM.ctx(lot), { w, d, R } = C, zf = d / 2 - .3, axisW = Math.min(w - 8, S.axisW || 84), G = S.gate || {}, gb = G.bays || 5, gbw = G.bayW || 4.6, gW = gb * gbw, s0 = lot.seed | 0;
  const fd = Math.min(S.front || 60, d * .3), cd = Math.min(S.court || 100, d * .45), cTop = zf - fd, cBot = cTop - cd, cx = axisW / 2 - 1.6, mainZ = cTop - cd * .5, A = { C, zf, axisW, cTop, cBot, cx, mainZ, gW };
  // wall round the whole lot (one part: one wall network with real corner piers) + the 山門
  C.mark(-gW / 2 - 1, zf - 5, gW / 2 + 1, zf + 1);
  if (S.backGate) C.mark(-4, -d / 2, 4, -d / 2 + 6);
  C.part(0, zf, L => { LM.ring(L, C, -w / 2 + .45, -d / 2 + .45, w / 2 - .45, zf, [['f', 0, gW + .2]].concat(S.backGate ? [['b', 0, 3.6]] : []), { h: 3.3, t: .65 }); if (S.backGate) COMP.gate(L, C.F, 0, -d / 2 + .45, 3.5, { h: 3, cls: 3, y: C.Y(0, -d / 2) }); /* 後門 toward the ward's other gate */ LM.gatehouse(L, C, 0, zf - 1.6, { bays: gb, bayW: gbw, colH: G.colH || 4.6, tablet: S.plaque && 'lm_' + S.plaque, open: gb >= 5, brackets: gb >= 5 ? 'full' : 'simple', roof: G.roof }); });
  // front court: pagoda / altar on the axis, steles either side of the path
  const pz = (zf - 5 + cTop + 3) / 2;
  if (S.pagoda) { const pg = S.pagoda, o = pg.kind === 'dayan' ? { storeys: 10, w: 23, h1: 5.4, taper: .045 } : pg.kind === 'wood' ? Object.assign({ storeys: 7, w: 18, h1: 7.2 }, pg) : Object.assign({ storeys: 7, w: 11, h1: 4.8, taper: .06 }, pg), hw = (o.w + (pg.kind === 'wood' ? 9 : 3)) / 2 + 1;
    C.mark(-hw, pz - hw, hw, pz + hw); C.part(0, pz, (L, y) => { const p = C.P(0, pz); (pg.kind === 'wood' ? LM.woodPagoda : TANG.pagoda)(L, p[0], y, p[2], Object.assign({ yaw: C.F.yaw }, o)); });
    { const p = C.P(0, pz); lot.pagodaAt = { x: p[0], z: p[2], yaw: C.F.yaw, kind: pg.kind }; } }
  else if (S.altar) { C.mark(-12, pz - 12, 12, pz + 12); C.part(0, pz, L => LM.altar(L, C, 0, pz, { s: 17 })); }
  if (S.pagoda || S.altar) { const pr = S.pagoda ? ((S.pagoda.kind === 'dayan' ? 26 : S.pagoda.kind === 'wood' ? 27 : (S.pagoda.w || 11) + 3) / 2 + 2.5) : 13.5; C.site(S.pagoda ? 'pagoda' : 'altar', 0, pz, { r: pr }); }
  C.site('gate_out', 0, zf + 3, { w: gW + 6, face: [0, 1] }); C.site('gate_in', 0, zf - 8, { face: [0, 1] });
  C.site('front', 0, (cTop + zf) / 2, { rect: [-axisW / 2 + 3, cTop + 4, axisW / 2 - 3, zf - 7] }); C.site('court', 0, (cTop + cBot) / 2, { rect: [-cx + 4, cBot + 4, cx - 4, cTop - 4] });
  for (let az = zf - 6; az > cBot + 4; az -= 14) C.site('axis', 0, az);
  // the paved axis walk 甬道 (brick, 8 cm proud): gate → cloister gate → main hall steps (split around the pagoda / altar)
  { const segs = [], top = zf - 5, hallF = mainZ + (S.main && S.main.dbays ? S.main.dbays * (S.main.dbayW || 4.4) : 17.6) / 2 + (S.main && S.main.pm || 1.8) + 2.5, pg = S.pagoda || S.altar, ph = S.pagoda ? ((S.pagoda.kind === 'dayan' ? 26 : S.pagoda.kind === 'wood' ? 27 : (S.pagoda.w || 11) + 3) / 2 + 1) : 10;
    if (pg) segs.push([pz + ph, top], [cTop + 4, pz - ph]); else segs.push([cTop + 4, top]); segs.push([hallF, cTop - 1.5]);
    for (const [z0, z1] of segs) if (z1 - z0 > 2) { C.mark(-2.4, z0, 2.4, z1); C.part(0, (z0 + z1) / 2, (L, y) => { const p = C.P(0, (z0 + z1) / 2), b = L.mb; b.T(p[0], y, p[2], 0, C.F.yaw, 0).s({ tex: 'pave', col: [.92, .9, .86] }).box(0, .04, 0, 4.4, .08, z1 - z0, { uv: [2, Math.max(1, Math.round((z1 - z0) / 2))], skip: ['bot'] }).s({ tex: 'stone', col: [.95, .95, .93] }); for (const sx of [-1, 1]) b.box(sx * 2.3, .05, 0, .2, .1, z1 - z0, { skip: ['bot'] }); b.pop(); }, 'walk'); } }
  // two stele pavilions 碑亭 flanking the walk behind the gate (square, a stele on a tortoise inside)
  { const sz = zf - 12, sx0 = Math.min(axisW / 2 - 8, gW / 2 + 7); for (const sx of [-1, 1]) { C.mark(sx * sx0 - 4, sz - 4, sx * sx0 + 4, sz + 4); C.part(sx * sx0, sz, (L, y) => { const p = C.P(sx * sx0, sz); LM.pav(L, p[0], y, p[2], { yaw: C.F.yaw, sides: 4, r: 2.6, colH: 3.2, platform: .6, benches: false }); LM.stele(L, C, sx * sx0, sz, 0, .6); }, 'stele'); } }
  // the corridor court and its main hall
  LM.cloister(C, cx, cTop, cBot, 14);
  const M = Object.assign({ bays: 7, dbays: 4, bayW: 5, dbayW: 4.4, colH: 5.2, platform: 1.6, pm: 1.8, roof: 'hip' }, S.main || {}), mW = (Array.isArray(M.bayW) ? M.bayW.reduce((a, c) => a + c, 0) : M.bays * M.bayW), mD = M.dbays * M.dbayW;
  C.mark(-mW / 2 - M.pm - 1, mainZ - mD / 2 - M.pm - 1, mW / 2 + M.pm + 1, mainZ + mD / 2 + M.pm + 4);
  C.part(0, mainZ, L => LM.hall(L, C, 0, mainZ, 0, Object.assign({ cls: 3, furnish: 'temple', lit: .7, lamp: 3, brackets: 'full', walls: 'white', paint: 'ochre', doorOpen: true, windows: true, railing: true, fish: true, glow: .25, allRaf: true, seed: s0 + 1 }, M)));
  if (S.censer !== false) C.part(0, mainZ + mD / 2 + M.pm + 7, L => LM.censer(L, C, 0, mainZ + mD / 2 + M.pm + 7));
  C.site('worship', 0, mainZ + mD / 2 + M.pm + 3.4, { w: Math.min(mW - 2, 16), face: [0, -1] }); if (S.censer !== false) C.site('censer', 0, mainZ + mD / 2 + M.pm + 7, { r: 2.3 });
  C.site('hall_in', 0, mainZ + mD / 2 - 3.4, { w: mW - 7, face: [0, -1], floor: M.platform });
  if (S.peony) { const zb = mainZ + mD / 2 + M.pm + 4, za = cTop - 6; if (za - zb > 8) for (const sx of [-1, 1]) { const x = sx * Math.min(cx - 8, mW / 2 + 2), zc = (za + zb) / 2; C.mark(x - 6, zb, x + 6, za); C.part(x, zc, L => { for (let j = 0; j < 3; j++) { const z = zb + 2 + (j + .5) * (za - zb - 4) / 3; if (ARCH.lod === 2) continue; const p = C.P(x, z); ARCH.peonyBed(L, p[0], p[2], 9, 2.2, C.F.yaw, s0 + j * 5 + sx); } }); } }
  if (S.towers !== false) for (const sd of [-1, 1]) { const tz = (cTop + mainZ) / 2 + 3, tx = sd * Math.min(cx - 7, mW / 2 + 9); C.mark(tx - 5, tz - 5, tx + 5, tz + 5);
    C.part(tx, tz, (L, y) => { const p = C.P(tx, tz); ARCH.lou(L, p[0], y, p[2], { furnish: 'store', lot: s0, yaw: C.F.yaw + sd * PI / 2, bays: 1, dbays: 1, bayW: 4.8, dbayW: 4.8, colH1: 3.6, colH2: 3, platform: 1, roof: 'hip', paint: 'ochre', door: 0, seed: s0 + 60 + sd });
      if (!ARCH.lod && sd < 0) ARCH.stamp(L, 'bell', b => { b.s({ tex: 'bronze', col: [.7, .6, .45] }).lathe([[0, 0], [.55, 0], [.5, .15], [.45, .9], [.3, 1.15], [0, 1.2]], { seg: 10 }); b.s({ tex: 'dark_wood' }).box(0, 1.35, 0, 1.6, .14, .14); }, p[0], y + 1 + 3.6 + .62 + .4, p[2], C.F.yaw); }); }
  // behind the court: 講堂 and the rear sequence
  let z = cBot - 6; const rear = [{ k: 'hall', bays: 7, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.6, platform: 1.1, roof: 'xieshan', furnish: 'hall' }].concat(S.rear || []);
  for (const [i, r] of rear.entries()) { const bw = r.bayW || 4.4, dw = r.dbayW || 4, W = (r.bays || 5) * bw, D = (r.dbays || 3) * dw, zc = z - D / 2 - (r.pm ?? 1.2) - 2; if (zc - D / 2 < -d / 2 + 10) break;
    C.mark(-W / 2 - 2, zc - D / 2 - 2, W / 2 + 2, zc + D / 2 + 5); const seed = s0 + 20 + i;
    C.part(0, zc, (L, y) => { const p = C.P(0, zc); if (r.k === 'lou2') ARCH.lou2(L, p[0], y, p[2], Object.assign({ yaw: C.F.yaw, lot: s0, storeys: 2, paint: 'ochre', roof: 'xieshan', seed }, r)); else if (r.k === 'lou') ARCH.lou(L, p[0], y, p[2], Object.assign({ yaw: C.F.yaw, furnish: 'hall', lot: s0, colH1: 3.8, colH2: 3.2, platform: 1, roof: 'xieshan', paint: 'ochre', seed }, r));
      else LM.hall(L, C, 0, zc, 0, Object.assign({ cls: 3, brackets: 'simple', fish: true, paint: 'ochre', walls: 'white', windows: true, doorOpen: true, seed }, r)); });
    z = zc - D / 2 - 8; }
  A.zRear = z;
  // axis trees (old pines / cypresses / 槐) in the courts
  LM.scatterTrees(C, -cx + 4, cBot + 4, cx - 4, cTop - 4, S.courtN ?? 12, S.axisTrees || ['huai', 'pine', 'cypress'], s0 + 300);
  LM.scatterTrees(C, -axisW / 2 + 3, cTop + 4, axisW / 2 - 3, zf - 7, S.frontN ?? 10, S.frontTrees || S.axisTrees || ['huai', 'pine'], s0 + 400);
  if (S.extra) S.extra(C, A);
  // side bands: 院 cells (rows of ≤ 40 m) unless the spec fills a band itself
  const cells = [];
  for (const sd of [-1, 1]) { const x0 = sd < 0 ? -w / 2 + 2 : axisW / 2 + 2, x1 = sd < 0 ? -axisW / 2 - 2 : w / 2 - 2, sw = x1 - x0; if (sw < 22) continue;
    const lim = S.side ? S.side(C, sd, x0, x1, -d / 2 + 2, zf - 2, A) : null; if (lim === true) continue; const zMin = typeof lim === 'number' ? lim : -d / 2 + 4; // a number: cells only down to there
    const nc = Math.max(1, Math.round(sw / 46)), cw = sw / nc; let zz = zf - 4, row = 0;
    while (zz - zMin > 22) { const ud = Math.min(42, zz - zMin); for (let c = 0; c < nc; c++) cells.push({ lx: x0 + cw * (c + .5), lz: zz - ud / 2, a: cw - 4, b: ud, yaw: 0, sd, row, col: c, nc }); zz -= ud + 4; row++; } }
  { const rd = A.zRear + d / 2 - 4; if (rd > 30 && !(S.rearFill && S.rearFill(C, -axisW / 2 + 2, axisW / 2 - 2, -d / 2 + 2, A.zRear, A))) { const n = Math.max(1, Math.round((axisW - 4) / 44)); for (let c = 0; c < n; c++) cells.push({ lx: -axisW / 2 + 2 + (axisW - 4) * (c + .5) / n, lz: (A.zRear - d / 2 + 2) / 2, a: (axisW - 4) / n - 4, b: Math.min(rd, 60), yaw: 0, rear: true, col: c }); } }
  const W8 = S.cells || { monks: .55, garden: .15, veg: .1, peony: .1, kitchen: 0, pool: .1 }; let kit = false;
  for (const [ci, c] of cells.entries()) { let kind = S.cell ? S.cell(c, ci, R) : null; if (!kind) { if ((!kit || kit === 'tower') && ci > 1 && c.row === 0) { kind = 'kitchen'; kit = kit ? 'both' : true; } else { let q = hash2(s0, ci, 913), acc = 0; kind = 'house'; for (const k in W8) { acc += W8[k]; if (q < acc) { kind = k; break; } } } }
    if (kind === 'tower') { if (kit === 'tower' || kit === 'both') kind = 'monks'; else kit = kit ? 'both' : 'tower'; } // at most one 塔院 per temple
    if (kind === 'none') continue; C.mark(c.lx - c.a / 2, c.lz - c.b / 2, c.lx + c.a / 2, c.lz + c.b / 2);
    const sub = { seed: (s0 + ci * 131 + 17) | 0, wealth: 2, type: 'temple', fruit: c.fruit || S.fruit, storeys: c.storeys }; // _F set at build (nature.js reads lot feet through it)
    C.part(c.lx, c.lz, L => { const p = C.P(c.lx, c.lz), F2 = ARCH.F(p[0], 0, p[2], C.F.yaw + c.yaw); sub._F = F2; COMP.netRun(L, sub, () => LM.cell(L, sub, F2, c.a, c.b, kind, RNG(sub.seed))); }, 'cell:' + kind); }
  C.part(0, 0, L => { if (typeof NATURE !== 'undefined' && NATURE.yard && !ARCH.lod) NATURE.yard(L, lot, C.F, w, d, RNG(s0 + 5), 'temple'); });
  return C.out;
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// THE LANDMARKS
// ---------------------------------------------------------------------------------------------------------------------------------------
// 玄都觀 (崇業坊, on the 九五 ridge: 宇文愷 put a Daoist abbey and 大興善寺 there "不欲常人居之"). Daoist: no pagoda; a three-tier 醮壇 in the
// front court, 天尊殿 in a corridor court, a two-storey 閣 behind; 道院 courts along the front of both side bands, and behind them the
// peach orchards of 劉禹錫's poem (元和十年: 「玄都觀裏桃千樹，盡是劉郎去後栽」) — in the 6th month in full leaf with small fruit,
// rows on grassed beds with a walk through the middle and viewing pavilions.
LANDMARKS.builders['玄都觀'] = lot => LM.monastery(lot, {
  plaque: '玄都觀', axisW: 96, gate: { bays: 5, bayW: 4.4, colH: 4.4 }, front: 58, court: 92, altar: true, towers: true, peony: false,
  main: { bays: 7, dbays: 4, bayW: 5, dbayW: 4.4, colH: 5.2, platform: 1.8, pm: 1.8, roof: 'hip' },
  rear: [{ k: 'lou2', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, storeys: 2, roof: 'xieshan' }],
  axisTrees: ['cypress', 'pine', 'cypress', 'peach'], frontTrees: ['cypress', 'peach', 'peach'], frontN: 8, cells: { monks: .8, kitchen: 0, veg: .1, garden: .1 },
  side(C, sd, x0, x1, z0, z1) { const zc = z1 - Math.min(96, (z1 - z0) * .32), mid = (x0 + x1) / 2, R = RNG(C.lot.seed + sd * 7);
    LM.orchard(C, x0, z0, x1, zc - 4, { kind: 'peach', sp: 8.5, s: 1.3, seed: C.lot.seed + sd * 1000, hole: (x, z) => Math.abs(x - mid) < 3.5 || Math.hypot(x - mid, z - (z0 + zc) / 2) < 9 });
    // viewing pavilion in the middle of each orchard, on the walk
    const pz = (z0 + zc) / 2; C.site('pav', mid, pz, { r: 2.6, floor: .6 }); C.part(mid, pz, (L, y) => { const p = C.P(mid, pz); LM.pav(L, p[0], y, p[2], { yaw: C.F.yaw, sides: R() < .5 ? 6 : 4, r: 2.6, colH: 3, platform: .6 }); });
    return zc; },
  rearFill(C, x0, x1, z0, z1) { if (z1 - z0 < 16) return true; LM.orchard(C, x0, z0, x1, z1 - 2, { kind: 'peach', sp: 8.5, s: 1.3, seed: C.lot.seed + 5000 }); return true; },
});

// 大慈恩寺 (晉昌坊 east half): 貞觀二十二年 for 文德皇后; "凡十餘院，總一千八百九十七間" (長安志 8). 大雁塔 (10 storeys after the 大曆 rebuilding)
// in front of the main hall; the temple's peonies were the most famous of the city (元果院, 太真院: 白居易/元稹 visits) → peony beds before
// the hall and several 牡丹院 among the courts; 翻經院 (玄奘's translation court) as a two-storey hall behind the 講堂.
LANDMARKS.builders['慈恩寺'] = lot => LM.monastery(lot, {
  plaque: '大慈恩寺', axisW: 112, gate: { bays: 5, bayW: 5, colH: 5 }, front: 96, court: 124, pagoda: { kind: 'dayan' }, peony: true, towers: true,
  main: { bays: 9, dbays: 4, bayW: 5.2, dbayW: 4.6, colH: 5.6, platform: 1.8, pm: 2, roof: 'hip' },
  rear: [{ k: 'lou2', bays: 7, dbays: 3, bayW: 4.4, dbayW: 4.2, storeys: 2 }, { k: 'hall', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, colH: 4.2, platform: .9, roof: 'xieshan', furnish: 'hall' }],
  axisTrees: ['huai', 'pine', 'huai', 'tong'], frontTrees: ['huai', 'pine', 'huai'], frontN: 10, cells: { monks: .45, peony: .22, garden: .1, pool: .1, veg: .05, bell: .08 },
});

// 大興善寺 (靖善坊, the whole ward, on the 九五 ridge): the Sui national temple (開皇二年); "寺殿崇廣，為京城之最"; its 大興佛殿 "制度與太廟同"
// → the biggest hall of the city's temples (11 bays) on a double platform; 不空's 文殊閣 (大曆, three storeys) behind; 翻經院 / 灌頂道場 courts.
LANDMARKS.builders['大興善寺'] = lot => LM.monastery(lot, {
  plaque: '大興善寺', backGate: true, axisW: 132, gate: { bays: 5, bayW: 5.2, colH: 5.2 }, front: 80, court: 140, towers: true, peony: true,
  main: { bays: 11, dbays: 5, bayW: [4.6, 4.8, 5, 5.2, 5.6, 6.2, 5.6, 5.2, 5, 4.8, 4.6], dbayW: 4.8, colH: 6.2, platform: 2.4, pm: 2.4, roof: 'hip' },
  rear: [{ k: 'lou2', bays: 5, dbays: 5, bayW: 4.6, dbayW: 4.6, storeys: 3, roof: 'hip' }, { k: 'hall', bays: 7, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.6, platform: 1.2, roof: 'xieshan', furnish: 'temple' }],
  axisTrees: ['pine', 'huai', 'pine', 'cypress'], cells: { monks: .5, garden: .12, peony: .1, tower: .06, pool: .08, veg: .08, bell: .06 },
});
// 大慈恩寺's southern neighbour: the 杏園 (通善坊) of the 進士 banquet after the examination results (曲江宴 / 杏園探花宴): an apricot
// orchard with a banquet hall open to the trees and small pavilions. Summer: in leaf, apricots ripe.
// 樂遊原 (昇平坊 NE, running east into 新昌坊): the highest ground in the city, a grassy loess plateau, public on festival days (上巳, 重陽);
// 漢 樂遊廟 site; pavilions; the view over the whole city ("向晚意不適，驅車登古原"). Detail levels raise the ground themselves (the walkable
// ground is flat): an irregular plateau ~12 m high (higher to the east), walkable on shed-shaped collision tiles; far: on the far terrain hill.
LM.park = function (lot, S) {
  const C = LM.ctx(lot), { w, d } = C, s0 = lot.seed | 0, zf = d / 2 - .3;
  if (S.mound) { const M = S.mound, H = M.h || 12, sl = M.slope || 46, ex = M.east || 0;
    // height field (lot-local): rounded-rectangle plateau, wobbly outline, rising toward one end, gentle undulation on top
    C.hf = (lx, lz) => { const ax = w / 2 - sl - 4 + 10 * Math.sin(lz / 41 + 1.3), az = d / 2 - sl - 4 + 8 * Math.sin(lx / 57 + .4), qx = Math.max(0, Math.abs(lx) - ax), qz = Math.max(0, Math.abs(lz) - az), t = clamp(1 - Math.hypot(qx, qz) / sl, 0, 1);
      return H * t * t * (3 - 2 * t) * (1 + ex * lx / w) + (t > .9 ? 1.2 * Math.sin(lx / 23) * Math.sin(lz / 19) * (t - .9) * 10 : 0); };
    const cell = 48, nx = Math.ceil(w / cell), nz = Math.ceil(d / cell);
    const vis = (lx, lz) => { const e = Math.min(lx + w / 2, w / 2 - lx, lz + d / 2, d / 2 - lz); return C.hf(lx, lz) + clamp(e / 3, 0, 1) * .12; }; // lawn 12 cm proud of the street, down to the ground at the lot line
    // the lawn surface exactly as drawn at this detail level (same 48 m parts, same grid and diagonal): paths and other decals sit on it
    C.lawnY = (lx, lz) => { const g = ARCH.lod ? 8 : 4, cw = w / nx, cd = d / nz, i = clamp(Math.floor((lx + w / 2) / cw), 0, nx - 1), j = clamp(Math.floor((lz + d / 2) / cd), 0, nz - 1), x0 = -w / 2 + i * cw, z0 = -d / 2 + j * cd;
      const mx = Math.max(1, Math.round(cw / g)), mz = Math.max(1, Math.round(cd / g)), fx = (lx - x0) / (cw / mx), fz = (lz - z0) / (cd / mz), ii = clamp(Math.floor(fx), 0, mx - 1), jj = clamp(Math.floor(fz), 0, mz - 1), u = fx - ii, v = fz - jj;
      const X = k => x0 + (ii + k) * cw / mx, Z = k => z0 + (jj + k) * cd / mz, A = vis(X(0), Z(0)), B = vis(X(1), Z(0)), Cc = vis(X(0), Z(1)), D = vis(X(1), Z(1));
      return v >= u ? A + u * (D - Cc) + v * (Cc - A) : A + u * (B - A) + v * (D - B); };
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x0 = -w / 2 + i * w / nx, x1 = x0 + w / nx, z0 = -d / 2 + j * d / nz, z1 = z0 + d / nz;
      C.part((x0 + x1) / 2, (z0 + z1) / 2, L => { if (ARCH.lod === 2) { const b = L.mb, base = b.nv, n = 3; b.s({ tex: 'grass_summer', col: [.95, 1, .85] }); // far: a lawn on the far terrain hill
          for (let jj = 0; jj <= n; jj++) for (let ii = 0; ii <= n; ii++) { const lx = lerp(x0, x1, ii / n), lz = lerp(z0, z1, jj / n), p = C.P(lx, lz); b.v(p[0], C.Y(lx, lz) + .5, p[2], 0, 1, 0, p[0] / 6, p[2] / 6); }
          for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) { const a = base + jj * (n + 1) + ii, c = a + n + 1; b.I.push(a, c, c + 1, a, c + 1, a + 1, a, c + 1, c, a, a + 1, c + 1); } return; }
        const b = L.mb, g = ARCH.lod ? 8 : 4, mx = Math.max(1, Math.round((x1 - x0) / g)), mz = Math.max(1, Math.round((z1 - z0) / g)), base = b.nv;
        b.s({ tex: 'grass_summer', col: [1, 1, 1] });
        for (let jj = 0; jj <= mz; jj++) for (let ii = 0; ii <= mx; ii++) { const lx = lerp(x0, x1, ii / mx), lz = lerp(z0, z1, jj / mz), h = vis(lx, lz), e = .5, nxv = vis(lx - e, lz) - vis(lx + e, lz), nzv = vis(lx, lz - e) - vis(lx, lz + e), p = C.P(lx, lz), k = .9 + .12 * Math.sin(lx / 13 + lz / 17) + .06 * Math.sin(lx * .7) * Math.sin(lz * .6), dry = clamp(Math.hypot(nxv, nzv) * 1.2, 0, .35);
          const n = v3norm([C.F.c * nxv + C.F.s * nzv, 2 * e, -C.F.s * nxv + C.F.c * nzv]); b.col = [k * (1 + dry * .5), k * (1 - dry * .1), k * (1 - dry * .5)]; b.v(p[0], h, p[2], n[0], n[1], n[2], p[0] / 3, p[2] / 3); }
        for (let jj = 0; jj < mz; jj++) for (let ii = 0; ii < mx; ii++) { const a = base + jj * (mx + 1) + ii, c = a + mx + 1; b.I.push(a, c, c + 1, a, c + 1, a + 1); }
        b.col = [1, 1, 1];
        // collision: none here — the walkable ground on the lawn is the lawn itself (CITY.parkH → the player's world height function, exact
        // to this mesh). The 4 m shed slabs used before left steps between neighbours on the curved slopes: past a step > 0.45 m the
        // ground fell back to the flat street level and the player dropped inside the hill.
      }, 'mound'); }
  }
  if (S.extra) S.extra(C);
  return C.out;
};
LANDMARKS.builders['樂遊原'] = lot => { const { F, w } = COMP.frame(lot), a = F.p(w / 3, 0, 0), b = F.p(-w / 3, 0, 0), hi = CITY.base(a[0], a[2]) >= CITY.base(b[0], b[2]) ? 1 : -1; // which end is the high (eastern) one
  return LM.park(lot, { mound: { h: 15, slope: 42, east: .35 * hi }, extra(C) {
  const { w, d } = C, s0 = C.lot.seed | 0, R = RNG(s0 + 3);
  // 樂遊廟: a small walled court with a three-bay hall on the eastern (highest) end
  const tx = hi * (w / 2 - 90), tz = -d / 2 + 70, cw = 40, cd = 44; C.mark(tx - cw / 2, tz - cd / 2, tx + cw / 2, tz + cd / 2);
  C.part(tx, tz, (L, y) => { LM.ring(L, C, tx - cw / 2, tz - cd / 2, tx + cw / 2, tz + cd / 2, [['f', tx, 5.2]], { h: 2.8, t: .5, y });
    LM.gatehouse(L, C, tx, tz + cd / 2 - 1.2, { bays: 3, bayW: 3.8, colH: 3.8, tablet: 'lm_樂遊廟', y }); LM.hall(L, C, tx, tz - cd / 2 + 10, 0, { cls: 3, bays: 3, dbays: 3, bayW: 4.4, dbayW: 3.8, colH: 4.4, platform: 1.2, brackets: 'simple', roof: 'xieshan', fish: true, paint: 'ochre', walls: 'white', doorOpen: true, furnish: 'temple', seed: s0 + 1, y });
    for (const sx of [-1, 1]) TREES.place(L, ...C.P(tx + sx * 12, tz + 4).map((v, i) => i === 1 ? y : v), 'cypress', 1.1, s0 + 7 + sx); }, 'temple');
  // pavilions on the edge of the plateau, looking north and west over the city; one on the crest
  const pv = [[-w / 2 + 70, d / 2 - 64], [-40, d / 2 - 60], [60, d / 2 - 62], [w / 2 - 60, d / 2 - 66], [-hi * (w / 2 - 150), -d / 2 + 60], [-hi * (w / 2 - 64), -d / 2 + 66]];
  C.site('worship', tx, tz - cd / 2 + 10 + 5.7 + 1.2 + 2.6, { w: 8, face: [0, -1] }); C.site('hall_in', tx, tz - cd / 2 + 10 + 2.2, { w: 9, face: [0, -1], floor: 1.2 });
  for (const [i, [px, pz]] of pv.entries()) { C.site('pav', px, pz, { r: i === 3 ? 3.2 : 2.4, floor: .8 }); C.mark(px - 5, pz - 5, px + 5, pz + 5); C.part(px, pz, (L, y) => { const p = C.P(px, pz); LM.pav(L, p[0], y, p[2], { yaw: C.F.yaw + (i * 1.7) % 1.2 - .6, sides: i % 3 === 1 ? 8 : i % 3 ? 6 : 4, r: i === 3 ? 3.2 : 2.4, colH: 3.1, platform: .8 }); }, 'pavilion'); }
  // a two-storey 樓 (the 原's lookout) near the north-east brow
  { const lx = hi * (w / 2 - 150), lz = d / 2 - 70; C.mark(lx - 12, lz - 10, lx + 12, lz + 10); C.part(lx, lz, (L, y) => { const p = C.P(lx, lz); ARCH.lou2(L, p[0], y, p[2], { yaw: C.F.yaw, lot: s0, storeys: 2, bays: 3, dbays: 2, bayW: 4.2, dbayW: 4, paint: 'ochre', roof: 'xieshan', seed: s0 + 11 }); }, 'lou'); }
  // sparse old trees (elm, 槐, willows in the hollows), clumps here and there; no orchard: the 原 is open grass
  // trodden loess paths between the pavilions, the 廟 and the slopes (ribbons 14 cm above the lawn surface)
  const nodes = pv.concat([[tx, tz + cd / 2 + 3], [hi * (w / 2 - 150), d / 2 - 58], [0, d / 2 - 2], [-w / 2 + 2, 0], [w / 2 - 2, -d / 2 + 40]]), paths = [];
  for (let i = 0; i < nodes.length; i++) { let bj = -1, bd = 1e9; for (let j = 0; j < nodes.length; j++) { if (j === i || paths.some(p => (p[0] === j && p[1] === i))) continue; const dd = Math.hypot(nodes[j][0] - nodes[i][0], nodes[j][1] - nodes[i][1]); if (dd < bd) { bd = dd; bj = j; } } if (bj >= 0) paths.push([i, bj]); }
  const PP = []; // path points every ~2 m (lot-local): picnics, roses and tufts keep off the paths; people walk along them
  for (const [i, j] of paths) { const [ax, az] = nodes[i], [bx, bz] = nodes[j], len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1)), ux = (bx - ax) / len, uz = (bz - az) / len, wob = (R() - .5) * 14;
    for (let k = 0; k <= n; k += 2) { const t = k / n, sw = Math.sin(t * PI) * wob; PP.push([lerp(ax, bx, t) - uz * sw, lerp(az, bz, t) + ux * sw]); if (k % 24 === 0) C.site('path', lerp(ax, bx, t) - uz * sw, lerp(az, bz, t) + ux * sw); }
    for (let k0 = 0; k0 < n; k0 += 48) { const k1 = Math.min(n, k0 + 48), mx = lerp(ax, bx, (k0 + k1) / 2 / n), mz = lerp(az, bz, (k0 + k1) / 2 / n);
      C.part(mx, mz, L => { if (ARCH.lod === 2) return; const b = L.mb, base = b.nv; b.s({ tex: 'loess_rut', col: [1, 1, 1] }); const bulge = (x, z) => { const y0 = C.lawnY(x, z); let m = 0; for (let a = 0; a < 8; a++) { const dx = Math.cos(a * PI / 4) * 1.25, dz = Math.sin(a * PI / 4) * 1.25; m = Math.max(m, C.lawnY(x + dx / 2, z + dz / 2) - (y0 + C.lawnY(x + dx, z + dz)) / 2); } return m; }; // the lawn's ridge creases between this vertex and its neighbours
        const pt = t => { const sw = Math.sin(t * PI) * wob, x = lerp(ax, bx, t) - uz * sw, z = lerp(az, bz, t) + ux * sw; return [x, z]; };
        for (let k = k0; k <= k1; k++) { const t = k / n, [x, z] = pt(t), hw = 1.1 + .25 * Math.sin(k * 1.7); for (const sd of [-1, 0, 1]) { const qx = x - uz * hw * sd, qz = z + ux * hw * sd, p = C.P(qx, qz); b.v(p[0], C.lawnY(qx, qz) + .05 + bulge(qx, qz), p[2], 0, 1, 0, (sd + 1) / 2, t * len / 3); } } // on the drawn lawn (exact, with its creases half a metre around: convex slope breaks don't poke through), every metre, three across
        const P3 = b.P, tri = (a, c, e) => { const ux2 = P3[c * 3] - P3[a * 3], uz2 = P3[c * 3 + 2] - P3[a * 3 + 2], vx2 = P3[e * 3] - P3[a * 3], vz2 = P3[e * 3 + 2] - P3[a * 3 + 2]; if (uz2 * vx2 - ux2 * vz2 >= 0) b.I.push(a, c, e); else b.I.push(a, e, c); }; // facing up (the lawn hides the underside)
        for (let k = 0; k < k1 - k0; k++) for (let q = 0; q < 2; q++) { const a = base + k * 3 + q; tri(a, a + 3, a + 4); tri(a, a + 4, a + 1); } }, 'path'); } }
  const H = 15, offPath = (x, z, m) => !PP.some(q => Math.abs(q[0] - x) < m && Math.abs(q[1] - z) < m && Math.hypot(q[0] - x, q[1] - z) < m), flat = (x, z) => Math.abs(C.hf(x + 2, z) - C.hf(x - 2, z)) + Math.abs(C.hf(x, z + 2) - C.hf(x, z - 2)) < .35;
  // outings: picnic mats 茵席 with a low table, dishes and a wine jar, about half under a cloth canopy 幄 (杜甫 樂遊園歌: 公子華筵 … 曲江翠幕).
  // People gather here in the afternoon and evening (core.js LMPPL seats them on the mats).
  const PIC = []; for (let i = 0; i < 400 && PIC.length < 14; i++) { const x = (R() - .5) * (w - 90), z = (R() - .5) * (d - 90); if (C.hf(x, z) < H * .55 || !flat(x, z) || !C.free(x, z, 7) || !offPath(x, z, 6) || PIC.some(q => Math.hypot(q[0] - x, q[1] - z) < 22)) continue;
    PIC.push([x, z, R() * TAU, R() < .55, i]); C.mark(x - 4.5, z - 4.5, x + 4.5, z + 4.5); }
  const CLOTH = [[.3, .5, .4], [.62, .2, .16], [.7, .55, .3], [.36, .42, .58], [.8, .76, .66]];
  for (const [x, z, a, tent, i] of PIC) { C.site('picnic', x, z, { yaw: a, w: 3.4, d: 2.6 });
    C.part(x, z, L => { if (ARCH.lod === 2) return; const p = C.P(x, z), y = C.lawnY(x, z), b = L.mb, yw = C.F.yaw + a, cc = CLOTH[(i * 7) % CLOTH.length];
      b.T(p[0], y, p[2], 0, yw, 0); b.s({ tex: 'mat', col: [1, .96, .88] }).box(0, .02, 0, 3.4, .04, 2.6, { uv: [3, 2], skip: ['bot'] });
      if (!ARCH.lod) { b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .3, 0, 1.3, .04, .56); for (const [lx, lz] of [[-.58, -.22], [.58, -.22], [-.58, .22], [.58, .22]]) b.box(lx, .14, lz, .05, .28, .05, { skip: ['bot'] });
        b.s({ tex: 'glaze', col: [.9, .88, .8] }); for (let k = 0; k < 4; k++) { b.T(-.45 + k * .3, .32, (k & 1 ? .1 : -.1)); b.lathe([[0, 0], [.07, 0], [.11, .05], [.12, .06], [0, .03]], { seg: 8 }); b.pop(); }
        b.T(1.45, .04, .9); PROPS.jar(b, .45); b.pop(); b.T(-1.4, .04, -.95); PROPS.jar(b, .35); b.pop(); L.world.box(p[0], y + .17, p[2], .66, .17, .3, { yaw: yw, surface: 'wood' }); }
      if (tent) { const px = 1.95, pz = 1.55, ph = 2.5; b.s({ tex: 'dark_wood', col: [.8, .7, .6] }); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(sx * px, ph / 2, sz * pz, .07, ph, .07, { skip: ['bot'] });
        b.s({ tex: 'silk', col: cc }); const t = [0, ph + .55, 0], c4 = [[-px - .2, ph, -pz - .2], [px + .2, ph, -pz - .2], [px + .2, ph, pz + .2], [-px - .2, ph, pz + .2]];
        for (let k = 0; k < 4; k++) { const A = c4[k], B = c4[(k + 1) % 4], n = v3norm(v3cross(v3sub(B, A), v3sub(t, A))); ARCH.poly(b, [A, B, t], n, q => [q[0] / 2, q[2] / 2]); ARCH.poly(b, [B, A, t], [-n[0], -n[1], -n[2]], q => [q[0] / 2, q[2] / 2]); } // canopy (both sides)
        b.q4([-px, ph, -pz], [px, ph, -pz], [px, .15, -pz], [-px, .15, -pz], [2, 1]); b.q4([px, ph, -pz], [-px, ph, -pz], [-px, .15, -pz], [px, .15, -pz], [2, 1]); // back curtain 帷
        const Fq = ARCH.F(p[0], y, p[2], yw); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const q = Fq.p(sx * px, 0, sz * pz); L.world.box(q[0], y + ph / 2, q[2], .05, ph / 2, .05, { yaw: yw }); } }
      b.pop(); }, 'picnic'); }
  // the brow: places to stand and look out over the city (facing down the slope); a tethering rail for the visitors' horses near the west path
  for (let i = 0; i < 300; i++) { const x = (R() - .5) * (w - 40), z = (R() - .5) * (d - 40), h = C.hf(x, z); if (h < H * .6) continue; const gx = C.hf(x + 6, z) - C.hf(x - 6, z), gz = C.hf(x, z + 6) - C.hf(x, z - 6), gl = Math.hypot(gx, gz); if (gl < 1.2 || !C.free(x, z, 3)) continue;
    if (C.sites.some(q => q.kind === 'brow' && Math.hypot(q.lx - x, q.lz - z) < 30)) continue; C.site('brow', x, z, { face: [-gx / gl, -gz / gl] }); }
  { let hx = 0, hz = 0, ok = false; for (let i = 0; i < 200 && !ok; i++) { hx = -w / 2 + 40 + R() * 60; hz = (R() - .5) * (d - 80); ok = C.hf(hx, hz) > 3 && flat(hx, hz) && C.free(hx, hz, 6) && offPath(hx, hz, 4); }
    if (ok) { C.mark(hx - 5, hz - 2, hx + 5, hz + 2); C.site('horses', hx, hz, { w: 8, face: [0, 1] });
      C.part(hx, hz, L => { if (ARCH.lod === 2) return; const p = C.P(hx, hz), y = C.lawnY(hx, hz), b = L.mb; b.T(p[0], y, p[2], 0, C.F.yaw, 0).s({ tex: 'dark_wood', col: [.75, .66, .56] });
        for (const sx of [-4, 0, 4]) b.box(sx, .55, 0, .14, 1.1, .14, { skip: ['bot'] }); b.box(0, 1.02, 0, 8.3, .09, .09); b.pop(); L.world.box(p[0], y + .55, p[2], 4.1, .55, .07, { yaw: C.F.yaw }); }, 'rail'); } }
  // wild roses 玫瑰 in thickets on the slopes and rim ("樂遊苑自生玫瑰樹，樹下多苜蓿", 西京雜記)
  for (let k = 0; k < 18; k++) { let cx0 = 0, cz0 = 0, ok = false; for (let i = 0; i < 40 && !ok; i++) { cx0 = (R() - .5) * (w - 40); cz0 = (R() - .5) * (d - 40); ok = C.free(cx0, cz0, 4) && offPath(cx0, cz0, 4); } if (!ok) continue;
    const n = 3 + (R() * 5 | 0); for (let j = 0; j < n; j++) { const x = cx0 + (R() - .5) * 7, z = cz0 + (R() - .5) * 6; if (!C.free(x, z, 1.2) || !offPath(x, z, 2)) continue; const s = .8 + R() * .45, sd = s0 + 900 + k * 17 + j;
      C.part(x, z, L => { const p = C.P(x, z); TREES.place(L, p[0], C.lawnY(x, z) - .05, p[2], 'rose', s, sd); }, 'rose'); } }
  const Tpre = [];
  const T = []; for (let i = 0; i < 320 && T.length < 115; i++) { const cl = T.length && R() < .62 ? T[(R() * T.length) | 0] : null, x = cl ? cl[0] + (R() - .5) * 26 : (R() - .5) * (w - 30), z = cl ? cl[1] + (R() - .5) * 22 : (R() - .5) * (d - 30); // clumps
    if (Math.abs(x) > w / 2 - 12 || Math.abs(z) > d / 2 - 12 || !C.free(x, z, 6)) continue; if (T.some(t => Math.hypot(t[0] - x, t[1] - z) < 9)) continue; T.push([x, z, R() < .4 ? 'elm' : R() < .5 ? 'huai' : R() < .4 ? 'willow' : R() < .5 ? 'tong' : 'apricot', 1 + R() * .3, i]); }
  for (let i = 0; i < 60; i++) { const x = (R() - .5) * (w - 24), z = (R() - .5) * (d - 24); if (C.free(x, z, 3)) T.push([x, z, 'shrub', .8 + R() * .5, 200 + i]); }
  // a few weathered rocks by the pavilions (seats for the view; the princes' 亭 of the early 8th c. had gardens) — the 原 itself is loess, no rockeries
  for (const [i, [px, pz]] of pv.entries()) { const n = 1 + (i % 3); for (let k = 0; k < n; k++) { const a = R() * TAU, x = px + Math.cos(a) * (6 + R() * 3), z = pz + Math.sin(a) * (6 + R() * 3); if (!C.free(x, z, 1.2) || !offPath(x, z, 2)) continue;
      const sw = .9 + R() * .9, sh = .5 + R() * .5, sd = s0 + 1500 + i * 7 + k; C.mark(x - sw / 2, z - sw / 2, x + sw / 2, z + sw / 2); C.part(x, z, L => { if (ARCH.lod === 2) return; const p = C.P(x, z); ARCH.rock(L, p[0], p[2], sw, sh, sd, { y: C.lawnY(x, z) - .1 }); }, 'rock'); } }
  for (const t of T) { const [x, z, k, s, i] = t; C.part(x, z, (L, y) => { const p = C.P(x, z); TREES.place(L, p[0], y, p[2], k, s, s0 + 100 + i); }, 'tree'); }
  void Tpre;
  // ground cover on the lawn (full detail only): grass, dry grass, weeds, wild flowers; 苜蓿 (alfalfa) thick under the trees
  const cell = 48; for (let gx = -w / 2; gx < w / 2; gx += cell) for (let gz = -d / 2; gz < d / 2; gz += cell) { const cx0 = gx + cell / 2, cz0 = gz + cell / 2;
    C.part(cx0, cz0, L => { if (ARCH.lod || typeof NATURE === 'undefined' || !NATURE.tuft) return; const Rr = RNG(s0 * 31 + Math.round(gx) * 7 + Math.round(gz) * 13);
      for (let k = 0; k < 260; k++) { const x = gx + Rr() * cell, z = gz + Rr() * cell; if (Math.abs(x) > w / 2 - 2 || Math.abs(z) > d / 2 - 2 || !C.free(x, z, .4) || !offPath(x, z, 1.7)) continue;
        const nt = T.some(t => Math.abs(t[0] - x) < 7 && Math.abs(t[1] - z) < 7), r = Rr(), tex = nt ? (r < .6 ? 'ng_alfalfa' : r < .8 ? 'ng_grass' : 'ng_flower') : (r < .3 ? 'ng_grass' : r < .5 ? 'ng_dry' : r < .66 ? 'ng_alfalfa' : r < .8 ? 'ng_weed' : r < .9 ? 'ng_flower' : 'ng_dry');
        const p = C.P(x, z), hgt = tex === 'ng_alfalfa' ? .35 + Rr() * .2 : .3 + Rr() * .35; NATURE.tuft(L, p[0], C.lawnY(x, z) + .03, p[2], .5 + Rr() * .4, hgt, Rr() * PI, tex, [1, 1, 1], 2, (Rr() - .5) * .3); } }, 'tufts'); }
} }); };
LANDMARKS.builders['杏園'] = lot => { const C = LM.ctx(lot), { w, d } = C, s0 = lot.seed | 0, zf = d / 2 - .3, R = RNG(s0 + 1);
  C.mark(-6, zf - 6, 6, zf + 1);
  C.part(0, zf, L => { LM.ring(L, C, -w / 2 + .45, -d / 2 + .45, w / 2 - .45, zf, [['f', 0, 5.4]], { h: 2.6, t: .5, style: 'mud' }); LM.gatehouse(L, C, 0, zf - 1.2, { bays: 1, bayW: 4.8, colH: 3.6, brackets: 'none', roof: 'gable' }); }, 'wall');
  // the banquet hall 宴堂 (open on all sides to the trees) on a platform in the middle, with two side pavilions; a broad walk to it
  const hz = 0; C.mark(-20, hz - 12, 20, zf - 4); C.mark(-30, hz - 12, 30, hz + 12);
  C.part(0, hz, L => LM.hall(L, C, 0, hz, 0, { cls: 1, bays: 5, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.4, platform: 1, pm: 1.2, brackets: 'simple', roof: 'xieshan', fish: true, paint: 'ochre', walls: 'open', railing: true, furnish: null, seed: s0 + 2 }), 'hall');
  C.site('gate_in', 0, zf - 7, { face: [0, 1] }); C.site('hall_in', 0, hz, { w: 16, face: [0, 1], floor: 1 }); for (const sx of [-1, 1]) C.site('pav', sx * 24, hz + 2, { r: 2.4, floor: .6 });
  for (const sx of [-1, 1]) C.part(sx * 24, hz + 2, L => { const p = C.P(sx * 24, hz + 2); LM.pav(L, p[0], C.Y(sx * 24, hz + 2), p[2], { yaw: C.F.yaw, sides: 4, r: 2.4, colH: 3, platform: .6 }); }, 'pavilion');
  LM.orchard(C, -w / 2 + 3, -d / 2 + 3, w / 2 - 3, zf - 4, { kind: 'apricot', sp: 9.5, s: 1.4, seed: s0 + 9, hole: (x, z) => (Math.abs(x) < 4.5 && z > hz) || (Math.abs(x) < 32 && Math.abs(z - hz) < 14) });
  void R; return C.out; };

// 青龍寺 (新昌坊, east of the south gate, "北枕高原，南望爽塏，為登眺之美" — on the 樂遊原's east end): 惠果's 密教 temple where 空海 studied
// (804–806). Excavations: a west court with a pagoda before the main hall (the Sui 靈感寺 plan) and an east court. Built here: the axis
// court with a five-storey brick pagoda in front of the hall, an 灌頂 hall behind, monks' courts and a garden; on a raised terrace (detail).
LANDMARKS.builders['青龍寺'] = lot => LM.monastery(lot, {
  plaque: '青龍寺', axisW: 84, gate: { bays: 3, bayW: 4.6, colH: 4.4 }, front: 60, court: 90, pagoda: { kind: 'brick', storeys: 5, w: 10, h1: 5.4, taper: .07 }, towers: true,
  main: { bays: 5, dbays: 4, bayW: 5, dbayW: 4.4, colH: 5, platform: 1.6, pm: 1.6, roof: 'hip' }, rear: [{ k: 'hall', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, colH: 4.2, platform: 1, roof: 'xieshan', furnish: 'temple' }],
  axisTrees: ['pine', 'cypress', 'huai'], cells: { monks: .55, garden: .2, veg: .1, pool: .1, peony: .05 },
});
// 西明寺 (延康坊 SW corner): 顯慶元年 for 孝敬太子, modelled on 祇園精舍: "凡有十院，屋四千餘間"; 道宣 (律宗); its peonies (白居易
// 「西明寺牡丹花時憶元九」). A dense grid of courts, peony courts among them; pagoda: none recorded (none built).
LANDMARKS.builders['西明寺'] = lot => LM.monastery(lot, {
  plaque: '西明寺', axisW: 92, gate: { bays: 5, bayW: 4.8, colH: 4.8 }, front: 54, court: 104, towers: true, peony: true,
  main: { bays: 7, dbays: 4, bayW: 5, dbayW: 4.4, colH: 5.2, platform: 1.6, pm: 1.8, roof: 'hip' }, rear: [{ k: 'lou2', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, storeys: 2 }],
  axisTrees: ['huai', 'pine', 'tong'], cells: { monks: .5, peony: .22, garden: .1, pool: .08, kitchen: 0, library: .05, veg: .05 },
});
// 大安國寺 (長樂坊): 景雲元年 from 睿宗's princely residence; murals by 吳道子 and others; the 紅樓 (睿宗's old dance pavilion, 紅樓院):
// a red two-storey 樓 in its own court beside the axis.
LANDMARKS.builders['大安國寺'] = lot => LM.monastery(lot, {
  plaque: '大安國寺', axisW: 96, gate: { bays: 5, bayW: 4.8, colH: 4.8 }, front: 60, court: 110, towers: true, peony: false,
  main: { bays: 7, dbays: 4, bayW: 5, dbayW: 4.4, colH: 5.2, platform: 1.6, pm: 1.8, roof: 'hip' }, rear: [{ k: 'hall', bays: 7, dbays: 3, bayW: 4.4, dbayW: 4, colH: 4.4, platform: 1.1, roof: 'xieshan', furnish: 'temple' }],
  axisTrees: ['huai', 'pine'], cells: { monks: .55, garden: .15, pool: .1, peony: .1, veg: .1 },
  extra(C, A) { const lx = A.axisW / 2 + 26, lz = A.cTop - 20; C.mark(lx - 22, lz - 22, lx + 22, lz + 22); // 紅樓院
    C.part(lx, lz, (L, y) => { LM.ring(L, C, lx - 20, lz - 20, lx + 20, lz + 20, [['f', lx, 4]], { h: 2.8, t: .5, y }); const p = C.P(lx, lz - 3); const v0 = L.mb.nv; ARCH.lou2(L, p[0], y, p[2], { yaw: C.F.yaw, lot: C.lot.seed, storeys: 2, bays: 5, dbays: 3, bayW: 4, dbayW: 3.8, paint: 'ochre', roof: 'xieshan', seed: C.lot.seed + 31 }); LM.tint(L.mb, v0, ['plaster', 'facade_lod', 'paint_ochre', 'beam_ochre'], [1.2, .62, .5]);
      for (const sx of [-1, 1]) TREES.place(L, ...C.P(lx + sx * 14, lz + 12).map((v, i) => i === 1 ? y : v), 'pomegranate', 1, C.lot.seed + sx); }, 'redlou'); },
});
// 昊天觀 (保寧坊, the whole ward): 貞觀 晉王 residence, made a Daoist abbey by 高宗 for 太宗 (顯慶元年). Daoist: 醮壇, 天尊殿, a 閣.
LANDMARKS.builders['昊天觀'] = lot => LM.monastery(lot, {
  plaque: '昊天觀', backGate: true, axisW: 116, gate: { bays: 5, bayW: 5, colH: 5 }, front: 76, court: 130, altar: true, towers: true, peony: false,
  main: { bays: 9, dbays: 4, bayW: 5, dbayW: 4.6, colH: 5.6, platform: 2, pm: 2, roof: 'hip' }, rear: [{ k: 'lou2', bays: 5, dbays: 3, bayW: 4.6, dbayW: 4.2, storeys: 2 }, { k: 'hall', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, colH: 4.4, platform: 1.1, roof: 'xieshan', furnish: 'temple' }],
  axisTrees: ['cypress', 'pine', 'cypress'], frontTrees: ['cypress', 'pine'], cells: { monks: .6, garden: .15, veg: .15, pool: .1 },
});
// 大薦福寺 (開化坊 south half; 文明元年 for 高宗; 義淨's translation court). Its pagoda (小雁塔) stands in the 塔院 across the street in 安仁坊.
LANDMARKS.builders['薦福寺'] = lot => LM.monastery(lot, {
  plaque: '大薦福寺', axisW: 90, gate: { bays: 5, bayW: 4.6, colH: 4.6 }, front: 50, court: 100, towers: true, peony: true,
  main: { bays: 7, dbays: 4, bayW: 5, dbayW: 4.4, colH: 5.2, platform: 1.6, pm: 1.8, roof: 'hip' }, rear: [{ k: 'lou2', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, storeys: 2 }],
  axisTrees: ['huai', 'pine', 'tong'], cells: { monks: .55, garden: .15, pool: .1, peony: .1, veg: .1 },
});
// 大莊嚴寺 / 大總持寺 (永陽坊 east / west halves; their northern courts take the matching halves of 和平坊: "坊內南北街之東築入莊嚴寺，
// 街之西築入總持寺", 長安志 10). Sui (仁壽 / 大業) twin temples, each with a wooden pagoda "崇三百三十尺，周回一百二十步" — built here
// ~82 m (7 storeys and the 剎): the tallest things on the south-west skyline.
for (const [nm, pl] of [['大莊嚴寺', '大莊嚴寺'], ['大總持寺', '大總持寺']]) {
  LANDMARKS.builders[nm] = lot => LM.monastery(lot, { plaque: pl, axisW: 110, gate: { bays: 5, bayW: 5, colH: 5 }, front: 110, court: 120, pagoda: { kind: 'wood', storeys: 7, w: 18, h1: 7.2 }, towers: true, peony: false,
    main: { bays: 9, dbays: 4, bayW: 5, dbayW: 4.6, colH: 5.6, platform: 1.8, pm: 2, roof: 'hip' }, rear: [{ k: 'hall', bays: 7, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.6, platform: 1.2, roof: 'xieshan', furnish: 'hall' }],
    axisTrees: ['pine', 'huai', 'cypress'], cells: { monks: .6, garden: .12, veg: .12, pool: .08, bell: .04, kitchen: 0 } });
  LANDMARKS.builders[nm + '北院'] = lot => LM.monastery(lot, { axisW: 80, gate: { bays: 3, bayW: 4.4, colH: 4.2 }, front: 40, court: 90, towers: false, peony: false,
    main: { bays: 5, dbays: 3, bayW: 4.8, dbayW: 4.4, colH: 4.8, platform: 1.2, pm: 1.4, roof: 'xieshan' }, axisTrees: ['pine', 'huai'], cells: { monks: .6, veg: .2, garden: .2 } });
}
// 唐昌觀 (安業坊; position in the ward uncertain): small Daoist abbey famous for its 玉蕊花 (元和 poems by 元稹, 白居易, 劉禹錫; 康駢
// 劇談錄: a fairy visits the 玉蕊). Built: gate, 醮壇-less court with a 天尊殿, a flowering-tree court (a great 槐 in cream blossom stands
// for the 玉蕊 — the species is uncertain) with a viewing pavilion, 道院 courts.
LANDMARKS.builders['唐昌觀'] = lot => { const C = LM.ctx(lot), { w, d } = C, s0 = lot.seed | 0, zf = d / 2 - .3;
  C.mark(-8, zf - 6, 8, zf + 1);
  C.part(0, zf, L => { LM.ring(L, C, -w / 2 + .45, -d / 2 + .45, w / 2 - .45, zf, [['f', 0, 13.4]], { h: 3, t: .6 }); LM.gatehouse(L, C, 0, zf - 1.6, { bays: 3, bayW: 4.4, colH: 4.2, tablet: 'lm_唐昌觀' }); }, 'gate');
  const mz = zf - 46; C.mark(-16, mz - 10, 16, mz + 12); C.part(0, mz, L => LM.hall(L, C, 0, mz, 0, { cls: 3, furnish: 'temple', bays: 5, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.8, platform: 1.3, pm: 1.4, brackets: 'full', roof: 'hip', fish: true, paint: 'ochre', walls: 'white', doorOpen: true, railing: true, lit: .6, lamp: 3, seed: s0 + 1 }), 'hall');
  // the 玉蕊 court in front of the hall: the flowering tree, a pavilion, steles
  const yz = zf - 22; C.mark(-3, yz - 3, 3, yz + 3); C.site('tree', 0, yz, { r: 6 }); C.site('worship', 0, mz + 12, { w: 12, face: [0, -1] }); C.site('hall_in', 0, mz + 3, { w: 14, face: [0, -1], floor: 1.3 });
  C.site('gate_out', 0, zf + 3, { w: 18, face: [0, 1] }); C.site('gate_in', 0, zf - 8, { face: [0, 1] }); C.site('front', 0, (zf + mz) / 2, { rect: [-w / 2 + 8, mz + 14, w / 2 - 8, zf - 8] }); C.part(0, yz, L => { const p = C.P(0, yz); TREES.place(L, p[0], C.Y(0, yz), p[2], 'huai', 1.35, s0 + 77); LM.stele(L, C, -9, yz + 4); LM.stele(L, C, 9, yz + 4); }, 'yurui');
  C.part(14, yz - 6, L => { const p = C.P(14, yz - 6); LM.pav(L, p[0], C.Y(14, yz - 6), p[2], { yaw: C.F.yaw, sides: 6, r: 2.4, colH: 3, platform: .6 }); }, 'pavilion');
  // 道院 courts behind and to the sides
  const cw = Math.max(24, (w - 40) / 2 - 4); for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) { const lx = sx * (w / 2 - cw / 2 - 2), lz = zf - 24 - j * 44; if (lz - 20 < -d / 2) break; const sub = { seed: s0 + 300 + j * 7 + sx, wealth: 2, type: 'temple' };
    C.mark(lx - cw / 2, lz - 20, lx + cw / 2, lz + 20); C.part(lx, lz, L => { const p = C.P(lx, lz), F2 = ARCH.F(p[0], 0, p[2], C.F.yaw); sub._F = F2; COMP.netRun(L, sub, () => LM.cell(L, sub, F2, cw - 2, 38, j === 2 ? 'garden' : 'monks', RNG(sub.seed))); }, 'cell'); }
  LM.scatterTrees(C, -w / 2 + 6, -d / 2 + 6, w / 2 - 6, zf - 6, 10, ['cypress', 'pine', 'huai', 'peach'], s0 + 500);
  return C.out; };

// small foreign temples of the west city. 胡祆祠 (布政坊 SW corner): the Sogdians' Zoroastrian fire temple, under the 薩寶 office — Chinese
// timber halls (the form of Tang 祆祠 is unknown), the fire kept on a stone altar before the hall. 波斯胡寺 (義寧坊, 景教 'Persian' church
// of 阿羅本, 貞觀十二年; called 大秦寺 from 天寶): Chinese halls; its 大秦景教流行中國碑 (建中二年, 781) stood in the court: a tall stele.
LM.shrine = function (lot, S) { const C = LM.ctx(lot), { w, d } = C, s0 = lot.seed | 0, zf = d / 2 - .3, R = RNG(s0 + 2);
  C.mark(-8, zf - 6, 8, zf + 1);
  C.part(0, zf, L => { LM.ring(L, C, -w / 2 + .45, -d / 2 + .45, w / 2 - .45, zf, [['f', 0, 13.4]], { h: 3, t: .6 }); LM.gatehouse(L, C, 0, zf - 1.6, { bays: 3, bayW: 4.4, colH: 4.2, tablet: S.plaque && 'lm_' + S.plaque }); }, 'gate');
  const mz = -d / 2 + Math.min(d * .4, 60); C.mark(-15, mz - 10, 15, mz + 14);
  C.part(0, mz, L => LM.hall(L, C, 0, mz, 0, { cls: 3, furnish: 'temple', bays: 5, dbays: 3, bayW: 4.4, dbayW: 4, colH: 4.6, platform: 1.2, pm: 1.3, brackets: 'simple', roof: 'xieshan', fish: true, paint: 'ochre', walls: 'white', doorOpen: true, lit: .6, lamp: 3, seed: s0 + 1 }), 'hall');
  const az = mz + 18; C.mark(-3, az - 3, 3, az + 3); C.site('worship', 0, az + 4, { w: 8, face: [0, -1] }); C.site('hall_in', 0, mz + 3, { w: 14, face: [0, -1], floor: 1.2 });
  C.site('gate_out', 0, zf + 3, { w: 18, face: [0, 1] }); C.site('front', 0, (zf + az) / 2, { rect: [-w / 2 + 10, az + 6, w / 2 - 10, zf - 8] });
  C.part(0, az, L => { if (ARCH.lod) return; const p = C.P(0, az), y = C.Y(0, az);
    if (S.fire) { L.prop(b => { b.s({ tex: 'stone', col: [.9, .86, .8] }).lathe([[0, 0], [.9, 0], [.9, .25], [.55, .4], [.45, 1.1], [.75, 1.25], [.75, 1.4], [0, 1.4]], { seg: 8 }); b.T(0, 1.4, 0, 0, 0, 0, 1.3); PROPS.brazier(b, 1); b.pop(); }, p[0], y, p[2], { yaw: C.F.yaw, solid: { r: .9, h: 1.6 } }); L.light(p[0], y + 2.2, p[2], 7, [1.4, .8, .4], { flicker: .3 }); } // the fire altar
    else { L.prop(b => { b.T(0, 0, 0, 0, 0, 0, 1.5); PROPS.stele(b, 'stele_text', 1); b.pop(); b.s({ tex: 'stone', col: [.92, .9, .86] }).box(0, 5.55, 0, .14, .7, .1).box(0, 5.65, 0, .5, .12, .1); }, p[0], y, p[2], { yaw: C.F.yaw, solid: { w: 2.4, h: 5, d: 1.6 } }); } }, 'altar');
  for (const sx of [-1, 1]) { const lx = sx * (w / 2 - 6), sub = { seed: s0 + 40 + sx, wealth: 2, type: 'temple' }, dd = Math.max(20, d - 30); C.mark(lx - 5, -d / 2, lx + 5, d / 2);
    C.part(lx, 0, L => { if (w > 34) LM.hall(L, C, lx, 0, sx < 0 ? PI / 2 : -PI / 2, { bays: Math.max(3, Math.floor(dd / 4.2)), dbays: 1, bayW: 3.8, dbayW: 4, colH: 3.2, platform: .5, brackets: 'none', roof: 'gable', paint: 'plain', walls: 'white', windows: true, seed: sub.seed }); }, 'wing'); }
  LM.scatterTrees(C, -w / 2 + 12, -d / 2 + 6, w / 2 - 12, zf - 8, 6, S.trees || ['huai', 'elm', 'pomegranate'], s0 + 9); void R;
  return C.out; };
LANDMARKS.builders['胡祆祠'] = lot => LM.shrine(lot, { fire: true, trees: ['elm', 'pomegranate', 'huai'] });
LANDMARKS.builders['波斯胡寺'] = lot => LM.shrine(lot, { plaque: '大秦寺', trees: ['huai', 'cypress', 'pomegranate'] });

// ---------------------------------------------------------------------------------------------------------------------------------------
// map labels / warp points for the lead (core.js): every landmark lot of the city with its main gate (standing point outside it) and,
// where there is one, the pagoda. Pure data (lays out the wards concerned once, ~ms each); [{ n, ward, x, z, gx, gz, yaw, pagoda: {x, z} }]
// ---------------------------------------------------------------------------------------------------------------------------------------
LANDMARKS.pins = function () {
  if (this._pins) return this._pins; const out = [];
  for (const wd of PLANW.wards()) { if (!(wd.specials || []).some(s => this.builders[s.name])) continue; const lay = WARD.layout(wd);
    for (const lot of lay.lots) { if (!lot.big || !this.has(lot) || /北院$/.test(lot.name)) continue; const { F, d } = COMP.frame(lot), g = F.p(0, 0, d / 2 + 6);
      this.parts(lot); const pg = lot.pagodaAt; out.push({ n: lot.name, ward: wd.short, x: F.x, z: F.z, gx: g[0], gz: g[2], yaw: F.yaw, pagoda: pg ? { x: pg.x, z: pg.z, kind: pg.kind } : null }); } }
  return this._pins = out;
};
