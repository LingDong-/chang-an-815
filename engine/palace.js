// palace.js — the imperial palaces of Chang'an in 815 (元和十年): 大明宮 (東內, the seat of court), 太極宮 (西內) with 東宮 and 掖庭宮,
// the 皇城 offices with 太廟 / 太社, and 興慶宮 (南內). A palace kit (PALK) on top of the ARCH kit, deterministic layouts, walkable
// parts per chunk (LOD0 with collision + meta, LOD1 massing), far meshes, and the people of the court. Sources and choices: PALACE.md.
//
// Hooks (city.js / core.js, the lead):
//   PALACE.units()          -> [{ name, short, kind: 'palace', r, gates: [{ x, z, side, link }] }]
//   PALACE.layout(unit)     -> { wd, streets (kind 'palace'), lanes, lots: [], gates, trees: [], wells: [], gr: { at(x, z) }, paves }
//   PALACE.items(unit)      -> [{ x, z, build(L) }] parts (≤ ~60 m), respecting ARCH.lod 0 / 1
//   PALACE.far(L, name)     -> the far mesh of one palace (ARCH.lod = 2)
//   PALACE.people(unit, h)  -> static people [{ type, x, y, z, yaw, anim, seated? }] (CROWD.placeStatic convention: faces (sin yaw, cos yaw))
//   PALACE.walkerType(kind, hour, rnd) -> archetype for walkers on palace paths
//   PALACE.depthAt(x, z)    -> carve depth (m) of palace lakes / 御溝 (for CITY.height), 0 elsewhere
// Frame: metres, x east, z south, y up; buildings face south (+z) unless noted.
'use strict';

// ---- plaques 殿額 / 門額: gold on dark blue, like the city gate plaques
const PALACE_RANK = { p: [.42, .27, .45], c: [.66, .24, .2], g: [.28, .46, .32], b: [.3, .4, .55] }; // robe colours by grade: 紫 三品以上, 緋 四五品, 綠 六七品, 青 八九品
const PAL_PLAQUES = ['含元殿', '宣政殿', '紫宸殿', '蓬萊殿', '含涼殿', '麟德殿', '三清殿', '延英殿', '翰林院', '宣政門', '紫宸門', '太極殿', '兩儀殿', '甘露殿', '太極門', '兩儀門',
  '勤政務本之樓', '花萼相輝之樓', '興慶殿', '南薰殿', '大同殿', '沉香亭', '中書省', '門下省', '尚書省', '太廟', '太社', '清思殿', '翔鸞閣', '棲鳳閣', '嘉德殿', '延嘉殿', '玄武門', '日華門', '月華門', '凌煙閣', '中書外省', '門下外省', '右銀臺門', '左銀臺門', '九仙門', '金明門', '通陽門', '躍龍門', '鐘樓', '鼓樓', '集賢殿書院', '少陽院', '內侍省'];
if (typeof TEX !== 'undefined' && typeof _gc !== 'undefined') for (const nm of PAL_PLAQUES) if (!TEX.L['pl_' + nm]) TEX.glyph('pl_' + nm, nm, { aspect: nm.length > 3 ? .3 : .42, fill: .86, fg: _gc([236, 200, 104], [204, 154, 70], 316), bg: _frame(_gc([34, 58, 90], [26, 44, 72], 317), [206, 166, 84], 9, 318) });

// =====================================================================================
// PALK — the palace kit
// =====================================================================================
const PALK = {
  ROOF: [.66, .7, .78],
  tintRoofs(b, i0) { if (typeof TEX === 'undefined') return; const t = PALK._rt ?? (PALK._rt = TEX.id('roof_tile')), C = b.C, Lr = b.L, k = PALK.ROOF; for (let i = i0, n = b.nv; i < n; i++) if (Lr[i] === t) { C[i * 4] *= k[0]; C[i * 4 + 1] *= k[1]; C[i * 4 + 2] *= k[2]; } },      // 青棍瓦: polished dark grey-black tiles (excavated at 大明宮), a little blue
  GREEN: [.86, 1, .9],
  RED: [1.0, .56, .46],       // 赭 / 朱 red-washed lime plaster of palace walls and tower bases (plausible: see PALACE.md §6d)       // 綠琉璃: green-glazed ridges / 鴟尾 (excavated fragments at 大明宮 halls)
  y(x, z) { return ARCH.lod === 2 && typeof FARB !== 'undefined' ? FARB.y(x, z) : 0; },
  arr: (v, n, d) => Array.isArray(v) ? v : Array(n).fill(v || d),
  sum: a => a.reduce((s, v) => s + v, 0),
  F: (x, y, z, yaw = 0) => ARCH.F(x, y, z, yaw),
  gtex: nm => !nm || typeof TEX === 'undefined' ? null : TEX.L['gt_' + nm] !== undefined ? 'gt_' + nm : TEX.L['pl_' + nm] !== undefined ? 'pl_' + nm : null,

  // paved court (方磚 brick paving), 4 cm proud of the ground; o.road: stone 御道 strip along x or z
  pave(L, x0, z0, x1, z1, o = {}) { [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)]; const b = L.mb, y = (o.y ?? 0) + .055; // between the nature decal levels (DLV)
    b.s({ tex: o.tex || 'pave', col: (o.col || [1.32, 1.27, 1.16]).map(v => v * (ARCH.lod ? 1.06 : 1)) }).box((x0 + x1) / 2, y - .1, (z0 + z1) / 2, x1 - x0, .2, z1 - z0, { world: 2, skip: ARCH.lod ? ['bot', 'px', 'nx', 'pz', 'nz'] : ['bot'] }); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) L.world.box((x0 + x1) / 2, y - .1, (z0 + z1) / 2, (x1 - x0) / 2, .1, (z1 - z0) / 2, { surface: 'stone' }); },
  road(L, x0, z0, x1, z1, o = {}) { [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)]; const b = L.mb, y = (o.y ?? 0) + .105; // 御道: raised stone slabs with a kerb
    b.s({ tex: 'stone', col: o.col || [1.08, 1.06, 1.02] }).box((x0 + x1) / 2, y - .1, (z0 + z1) / 2, x1 - x0, .2, z1 - z0, { world: 3, skip: ['bot'] }); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) L.world.box((x0 + x1) / 2, y - .1, (z0 + z1) / 2, (x1 - x0) / 2, .1, (z1 - z0) / 2, { surface: 'stone' }); },

  // multi-tier platform 台基: tiers [{ w, d, h, dx, dz, stairs: [{ side 's'|'n'|'e'|'w', at, w }], rail }] bottom → top, centred on (x, z).
  // Brick-faced (包磚) with a stone base course and coping 壓闌石, stone 螭首 water spouts along the top edge, stone balustrade 勾欄.
  // Returns the tops [y of each tier top].
  terrace(L, x, y0, z, tiers, o = {}) {
    const b = L.mb, tops = []; let y = y0;
    tiers.forEach((t, k) => { const cx = x + (t.dx || 0), cz = z + (t.dz || 0), w = t.w, d = t.d, h = t.h, yb = y - (k ? .3 : .6), yt = y + h;
      b.s({ tex: o.tex || 'brick', col: o.col || [1.18, 1.1, .98] }).box(cx, (yb + yt) / 2, cz, w, yt - yb, d, { world: 2, skip: ['bot'], faces: { top: 'pave' } });
      if (ARCH.lod !== 2) { b.s({ tex: 'stone', col: [.96, .95, .92] }); // base course (sides only) and coping (2 cm above the paving: no shared plane)
        b.box(cx, y + .2, cz, w + .12, .4 + (k ? .3 : .6), d + .12, { world: 1, skip: ['bot', 'top'] });
        for (const sz of [-1, 1]) b.box(cx, yt - .1 + .01, cz + sz * (d / 2 - .25), w + .06, .22, .56, { world: 1, skip: ['bot'] });
        for (const sx of [-1, 1]) b.box(cx + sx * (w / 2 - .25), yt - .1 + .01, cz, .56, .22, d - 1.12, { world: 1, skip: ['bot'] });
        if (!ARCH.lod && o.chishou !== false) { // 螭首 drain heads every ~5 m (excavated at 含元殿 / 麟德殿)
          b.s({ tex: 'stone', col: [.94, .93, .9] }); const sp = 5.2;
          for (const [ex, ez, along, n] of [[0, d / 2, 'x', w], [0, -d / 2, 'x', w], [w / 2, 0, 'z', d], [-w / 2, 0, 'z', d]]) { const m = Math.max(1, Math.floor(n / sp));
            for (let i = 0; i <= m; i++) { const u = -n / 2 + n * i / m; if (Math.abs(Math.abs(u) - n / 2) < .1) continue; const px = cx + (along === 'x' ? u : ex), pz = cz + (along === 'z' ? u : ez), ox = along === 'x' ? 0 : Math.sign(ex), oz = along === 'z' ? 0 : Math.sign(ez);
              if ((t.stairs || []).some(s => (s.side === 's' || s.side === 'n' ? along === 'x' && Math.sign(ez) === (s.side === 's' ? 1 : -1) : along === 'z' && Math.sign(ex) === (s.side === 'e' ? 1 : -1)) && Math.abs(u - (s.at || 0)) < s.w / 2 + 1.5)) continue;
              b.T(px + ox * .45, yt - .3, pz + oz * .45, 0, Math.atan2(ox, oz), 0).box(0, 0, 0, .34, .3, .9).box(0, .02, .42, .26, .24, .18).pop(); } }
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.T(cx + sx * (w / 2 + .5), yt - .3, cz + sz * (d / 2 + .5), 0, Math.atan2(sx, sz), 0).box(0, 0, 0, .4, .34, 1.3).pop(); } }
      b.s({ col: [1, 1, 1] });
      if (!ARCH.lod) L.world.box(cx, (y + yt) / 2 - .05, cz, w / 2, h / 2 + .05, d / 2, { surface: 'stone' });
      // stairs (踏道) on the faces of this tier, rising to its top
      const st = t.stairs || [];
      for (const s of st) { const F = ARCH.F(cx, y, cz, 0), lx = s.side === 'e' ? w / 2 : s.side === 'w' ? -w / 2 : (s.at || 0), lz = s.side === 's' ? d / 2 : s.side === 'n' ? -d / 2 : (s.at || 0), yaw = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[s.side];
        if (ARCH.lod) { const n = Math.max(2, Math.round(h / .17)), run = (n - 1) * .32, c = Math.cos(yaw), sn = Math.sin(yaw), p = F.p(lx + sn * run / 2, 0, lz + c * run / 2); b.T(p[0], y, p[2], 0, yaw, 0).s({ tex: 'stone', col: [.95, .95, .93] }); PALK.wedge(b, s.w, h, run); b.pop(); }
        else ARCH._steps(L, F, lx, lz, yaw, s.w, h, { tex: 'stone' }); }
      // balustrade round the top edge, open over every flight of stairs that arrives on it (and o.open gaps: [[side, at, w]])
      if (t.rail !== false && (ARCH.lod !== 2 || w > 40)) { const e = w / 2 - .32, f = d / 2 - .32, gaps = st.map(s => [s.side, s.at || 0, s.w + .9]).concat((t.open || []).map(g => [g[0], g[1], g[2]]));
        const side = (sd, a0, a1, fix) => { const gs = gaps.filter(g => g[0] === sd).map(g => [g[1] - g[2] / 2, g[1] + g[2] / 2]).sort((p, q) => p[0] - q[0]); let a = a0; const runs = [];
          for (const [g0, g1] of gs) { if (g0 > a + .3) runs.push([a, Math.min(g0, a1)]); a = Math.max(a, g1); } if (a1 > a + .3) runs.push([a, a1]);
          for (const [u0, u1] of runs) { const P = u => sd === 's' || sd === 'n' ? [cx + u, yt + .01, cz + fix] : [cx + fix, yt + .01, cz + u];
            if (ARCH.lod) { const hz = sd === 's' || sd === 'n', m = P((u0 + u1) / 2); b.s({ tex: 'stone', col: [1.25, 1.22, 1.15] }).box(m[0], yt + .45, m[2], hz ? u1 - u0 : .2, .9, hz ? .2 : u1 - u0, { skip: ['bot'] }); b.s({ col: [1, 1, 1] }); continue; } // LOD: the balustrade as a white stone line
            const n = Math.max(1, Math.ceil((u1 - u0) / 3.2)), pts = []; for (let i = 0; i <= n; i++) pts.push(P(lerp(u0, u1, i / n))); ARCH.railing(L, pts, { mat: 'stone', h: .95, solid: !ARCH.lod }); } };
        side('s', -e, e, f); side('n', -e, e, -f); side('e', -f, f, e); side('w', -f, f, -e); }
      tops.push(yt); y = yt; });
    return tops;
  },
  // solid wedge (LOD stairs / ramps): width w along x, rising h over run d toward -z, centred
  wedge(b, w, h, d) { const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    ARCH.quad(b, [x0, 0, z1], [x1, 0, z1], [x1, h, z0], [x0, h, z0], [0, d, h], [w / 2, d / 2]);
    ARCH.poly(b, [[x1, 0, z1], [x1, 0, z0], [x1, h, z0]], [1, 0, 0], p => [p[2] / 2, -p[1] / 2]); ARCH.poly(b, [[x0, 0, z0], [x0, 0, z1], [x0, h, z0]], [-1, 0, 0], p => [p[2] / 2, -p[1] / 2]); },
  // ramp (龍尾道 / 慢道) along z: from (x, zLo) at yLo up to (x, zHi) at yHi; brick side walls down to the ground, stone balustrades, stepped collision
  ramp(L, x, zLo, zHi, w, yLo, yHi, o = {}) {
    const b = L.mb, x0 = x - w / 2, x1 = x + w / 2, sg = Math.sign(zLo - zHi), yb = (o.yb ?? 0) - .3, len = Math.abs(zLo - zHi);
    b.s({ tex: o.tex || 'pave', col: [1.02, .99, .94] }); ARCH.poly(b, [[x0, yHi, zHi], [x1, yHi, zHi], [x1, yLo, zLo], [x0, yLo, zLo]], [0, len, sg * (yHi - yLo)], p => [p[0] / 2, p[2] / 2]);
    b.s({ tex: 'brick', col: [1.18, 1.1, .98] }); for (const [xx, sd] of [[x0, -1], [x1, 1]]) ARCH.poly(b, [[xx, yb, zHi], [xx, yHi, zHi], [xx, yLo, zLo], [xx, yb, zLo]], [sd, 0, 0], p => [p[2] / 2, -p[1] / 2]);
    if (yLo - yb > .4) ARCH.poly(b, [[x0, yb, zLo], [x1, yb, zLo], [x1, yLo, zLo], [x0, yLo, zLo]], [0, 0, sg], p => [p[0] / 2, -p[1] / 2]);
    b.s({ col: [1, 1, 1] });
    if (o.rail !== false && ARCH.lod !== 2) for (const xx of [x0 + .3, x1 - .3]) { const n = Math.max(2, Math.ceil(len / 3.2)), pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([xx, lerp(yLo, yHi, t) + .01, lerp(zLo, zHi, t)]); } ARCH.railing(L, pts, { mat: 'stone', h: .95, solid: !ARCH.lod }); }
    if (!ARCH.lod) { const n = Math.max(1, Math.ceil((yHi - yLo) / .05)); for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, top = lerp(yLo, yHi, (t0 + t1) / 2), za = lerp(zLo, zHi, t0), zb = lerp(zLo, zHi, t1); L.world.box(x, (yb + top) / 2, (za + zb) / 2, w / 2, (top - yb) / 2, Math.abs(zb - za) / 2 + .02, { surface: 'stone' }); } }
  },
  // stairs from y0 up h, top edge at (x, z), descending toward dir ('s' = +z …)
  stairs(L, x, y0, z, w, h, side = 's') { const yaw = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[side]; if (ARCH.lod) { const n = Math.max(2, Math.round(h / .17)), run = (n - 1) * .32; L.mb.T(x + Math.sin(yaw) * run / 2, y0, z + Math.cos(yaw) * run / 2, 0, yaw, 0).s({ tex: 'stone', col: [.95, .95, .93] }); PALK.wedge(L.mb, w, h, run); L.mb.pop(); return run; } return ARCH._steps(L, ARCH.F(x, y0, z, 0), 0, 0, yaw, w, h, { tex: 'stone' }); },

  // ---- walls ----
  // palace wall 宮牆: rammed earth (or plaster) body with a brick base, tiled coping; pieces ≤ seg m, collision. o: {h, t, tex, col, y}
  wall(L, x0, z0, x1, z1, o = {}) {
    const b = L.mb, len0 = Math.hypot(x1 - x0, z1 - z0); if (len0 < .3) return; const h = o.h || 8, t = o.t || 6, yaw = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.ceil(len0 / (o.seg || 60))), e = .03 / len0;
    [x0, z0, x1, z1] = [x0 - (x1 - x0) * e, z0 - (z1 - z0) * e, x1 + (x1 - x0) * e, z1 + (z1 - z0) * e]; const len = len0 + .06, l = len / n;
    for (let k = 0; k < n; k++) { const tk = t + (k % 2) * .06, a = k / n, c = (k + 1) / n, mx = lerp(x0, x1, (a + c) / 2), mz = lerp(z0, z1, (a + c) / 2), y = (o.y ?? PALK.y(mx, mz)), yt = y + h + (k % 2) * .04, bat = o.batter ?? (t > 3 ? .08 : 0);
      b.T(mx, 0, mz, 0, yaw, 0);
      if (bat > 0) { const tt = Math.max(tk * .6, tk - 2 * bat * h); b.s({ tex: o.tex || 'rammed_earth', col: o.col || [1.06, .99, .9] });
        for (const sd of [-1, 1]) ARCH.quad(b, [-l / 2, y - 1, sd * tk / 2], [l / 2, y - 1, sd * tk / 2], [l / 2, yt, sd * tt / 2], [-l / 2, yt, sd * tt / 2].map((v, i) => v), [0, bat * sd, sd], [Math.max(1, Math.round(l / 3)), Math.max(1, Math.round((h + 1) / 3))]);
        for (const ex of [-1, 1]) ARCH.poly(b, [[ex * l / 2, y - 1, -tk / 2], [ex * l / 2, y - 1, tk / 2], [ex * l / 2, yt, tt / 2], [ex * l / 2, yt, -tt / 2]], [ex, 0, 0], p => [p[2] / 3, -p[1] / 3]);
        b.s({ tex: 'pave' }).box(0, yt - .05, 0, l, .1, tt, { world: 2, skip: ['bot'] });
        if (ARCH.lod !== 2) b.s({ tex: 'brick', col: [1, .96, .9] }).box(0, y + .35, 0, l, 1.3, tk + .12, { world: 1, skip: ['bot', 'top', 'px', 'nx'] });
        if (o.cap !== false) { const lv = ARCH.lod, lu = LOD.under; ARCH.lod = 2; LOD.under = true; try { LOD.roof(b, l, tt * .5, yt + .02, .3, 'gable', undefined, l / 2 - .02, 0); } finally { ARCH.lod = lv; LOD.under = lu; } } // with its underside and bargeboards: never paper-thin from below
        b.pop(); if (!ARCH.lod) { const q = [mx, mz]; L.world.box(q[0], y + h / 2, q[1], l / 2, h / 2 + .5, tk / 2, { yaw, surface: 'dirt' }); } continue; }
      b.s({ tex: o.tex || 'plaster', col: o.col || PALK.RED }).box(0, (y - .5 + yt) / 2, 0, l, yt - y + .5, tk, { world: 3, skip: o.cap === false ? ['bot'] : ['bot', 'top'] }); // a low wall without coping keeps its top face
      if (ARCH.lod !== 2) b.s({ tex: 'brick', col: [.95, .92, .88] }).box(0, y + .45, 0, l, .9, tk + .06, { world: 1, skip: ['bot', 'top', 'px', 'nx'] }); // grey brick plinth (磚基) under the red-washed wall
      if (o.cap !== false) { const lv = ARCH.lod, lu = LOD.under; ARCH.lod = 2; LOD.under = true; try { b.s({ col: [1, 1, 1] }); LOD.roof(b, l, tk, yt, .35, 'gable', undefined, l / 2 - .02, 0); } finally { ARCH.lod = lv; LOD.under = lu; } } // closed coping: underside down to the wall top, bargeboards
      else b.s({ tex: 'roof_tile', col: [1, 1, 1] }).box(0, yt + .05, 0, l, .1, tk + .2, { skip: ['bot'] });
      b.pop(); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) L.world.box(mx, y + h / 2, mz, l / 2, h / 2 + .5, tk / 2, { yaw, surface: 'stone' }); }
  },
  // wall run with gaps [[u0, u1]] (metres along from (x0, z0))
  wallGaps(L, x0, z0, x1, z1, gaps, o) { const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len; let u = 0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[len, len]])) { if (g0 - u > .5) PALK.wall(L, x0 + ux * u, z0 + uz * u, x0 + ux * g0, z0 + uz * g0, o); u = Math.max(u, g1); } },

  // ---- buildings ----
  // a hall 殿 (o.yaw: front faces (sin yaw, cos yaw)); o.fujie: 副階周匝 — an open colonnade one bay deep all round under a lower eave (重檐),
  // the walled core rising above it to the main hip roof (廡殿). Ridge 正脊 and 鴟尾 green-glazed for the great halls. Returns info.
  dian(L, x, y, z, o = {}) {
    const yaw = o.yaw || 0, F = ARCH.F(x, y, z, yaw), b = L.mb, nb = o.bays || 7, nd = o.dbays || 4, bw = PALK.arr(o.bayW, nb, 5), dw = PALK.arr(o.dbayW, nd, 5), W = PALK.sum(bw), D = PALK.sum(dw);
    const colH = o.colH || 5.5, paint = o.paint || 'ochre', roof = o.roof || 'hip', ph = o.platform ?? 0, pm = o.pm ?? 1.2, cls = o.cls ?? 3, lit = o.lit ?? .5, lamp = o.lamp || 2, seed = o.seed || 1, tiles = o.tiles, rc = o.roofCol || [1, 1, 1]; // the tone is applied per part (PALK.tintRoofs)
    if (ph > .05) { PALK.terrace(L, x, y, z, [{ w: (Math.abs(Math.sin(yaw)) > .5 ? D : W) + 2 * pm, d: (Math.abs(Math.sin(yaw)) > .5 ? W : D) + 2 * pm, h: ph, rail: o.rail ?? false, stairs: o.noSteps ? [] : PALK.dirStairs(yaw, o.stairs || [{ side: 'f', at: 0, w: Math.min(W * .4, 12) }, { side: 'b', at: 0, w: Math.min(W * .3, 8) }], W, D) }], { chishou: o.chishou ?? ph > 1 }); }
    const jian = o.jian ?? ((roof === 'hip' || roof === 'xieshan') && (!!o.fujie || nb >= 9)), ridgeG = o.cw !== false && nb >= 5; // 剪邊 only on the great halls (attested green glaze at 含元殿 / 丹鳳門 / 麟德殿), the same at every LOD
    const y0 = ph > .05 ? ph : 0, mid = (nb - 1) / 2, doors = o.doors || (nb >= 7 ? [mid - 1, mid, mid + 1] : [mid]);
    let info;
    if (o.fujie && nb >= 5 && nd >= 3) {
      const cbw = bw.slice(1, -1), cdw = dw.slice(1, -1), cW = PALK.sum(cbw), cD = PALK.sum(cdw), h1 = colH, h2 = o.colH2 || colH * .62, cn = cbw.length, cm = (cn - 1) / 2;
      const kind = cls ? 'opendoor' : 'door', front = cbw.map((_, i) => Math.abs(i - cm) <= (cn >= 7 ? 1 : 0) ? kind : 'window'), back = cbw.map((_, i) => i === Math.floor(cm) && o.backDoor !== false ? kind : 'window');
      // ring (副階): columns + architraves, no infill
      const ring = ARCH.frame(L, F, { bw, dw, y0, colH: h1, brackets: 'simple', paint, roof: undefined, fill: {}, seed });
      // core, lower storey: walls, doors, windows (the interior is one tall space)
      ARCH.frame(L, F, { bw: cbw, dw: cdw, y0, colH: h1, brackets: 'none', paint, roof: undefined, cls, lit, lamp, seed: seed + 1, fill: { front, back, left: cdw.map(() => 'window'), right: cdw.map(() => 'window') } });
      // brackets on the ring columns (斗栱 under the lower eave)
      const bs = h1 * .3, plT = y0 + h1 + .1, purT = plT + .58 * bs, ov = .5 * bs + h1 * .36 + .5;
      if (!ARCH.lod) { b.T(F.x, F.y, F.z, 0, yaw, 0); const xs = [-W / 2], zs = [-D / 2]; bw.forEach(v => xs.push(xs[xs.length - 1] + v)); dw.forEach(v => zs.push(zs[zs.length - 1] + v));
        for (const xx of xs) for (const [zz, ry] of [[D / 2, 0], [-D / 2, PI]]) { b.T(xx, plT, zz, 0, ry, 0); ARCH.bracket(b, bs, { style: 'simple', tex: paint === 'jade' ? 'paint_jade' : 'paint_ochre' }); b.pop(); }
        for (const zz of zs.slice(1, -1)) for (const [xx, ry] of [[W / 2, PI / 2], [-W / 2, -PI / 2]]) { b.T(xx, plT, zz, 0, ry, 0); ARCH.bracket(b, bs, { style: 'simple', tex: paint === 'jade' ? 'paint_jade' : 'paint_ochre' }); b.pop(); }
        // eave purlin ring
        b.s({ tex: paint === 'jade' ? 'beam_jade' : 'beam_ochre', col: [1, 1, 1] }); const r = .5 * bs; for (const sz of [-1, 1]) b.box(0, purT - .1, sz * (D / 2 + r), W + 2 * r + .3, .2, .2); for (const sx of [-1, 1]) b.box(sx * (W / 2 + r), purT - .1 + .01, 0, .2, .2, D + 2 * r + .1);
        b.pop(); }
      // the lower eave (腰簷): a hipped skirt from the ring's eave up to the core wall
      const yIn = purT + (Math.min(bw[0], dw[0]) + ov) * .42;
      b.T(F.x, F.y, F.z, 0, yaw, 0); PALK.skirt(b, W / 2 + ov, D / 2 + ov, purT, cW / 2 + .12, cD / 2 + .12, yIn, { col: rc, tiles, jian: o.jian ?? true }); b.pop();
      if (!ARCH.lod && L.world.roof) { /* the skirt is walkable: four sheds */ }
      // core, upper storey (clerestory 殿身) with the main roof
      const up = ARCH.frame(L, ARCH.F(x, y, z, yaw), { bw: cbw, dw: cdw, y0: y0 + h1 + .12, colH: Math.max(2.2, yIn - y0 - h1 - .12 + h2 * .55), colBase: false, brackets: 'full', paint, roof, tiles, roofCol: rc, fill: { front: cbw.map(() => 'wall'), back: cbw.map(() => 'wall'), left: cdw.map(() => 'wall'), right: cdw.map(() => 'wall') }, walls: 'white', seed: seed + 2, chiwen: false, ceiling: ARCH.lod ? undefined : false });
      PALK.hallInterior(L, x, y, z, yaw, up, cbw, cdw, y0, h1, { open: o.open });
      info = { F, W, D, cW, cD, floor: y + y0, ridge: y + up.ridge, roof: up.roof, ov: up.ov, X: cW / 2 + up.ov, Z: cD / 2 + up.ov, eave: y + up.ry0, inner: [cW, cD], fr: up };
      if (ARCH.lod && (roof === 'hip' || roof === 'xieshan')) { b.T(x, y, z, 0, yaw, 0); PALK.lodTrim(b, cW, cD, up.purT, up.ov, roof, jian, ridgeG); b.pop(); }
    } else {
      const kind = cls ? 'opendoor' : 'door', fill = o.fill || { front: bw.map((_, i) => doors.includes(i) ? kind : (o.windows === false ? 'wall' : 'window')), back: bw.map((_, i) => o.backDoor && i === Math.floor(mid) ? kind : (o.windows === 'all' ? 'window' : 'wall')), left: dw.map(() => 'wall'), right: dw.map(() => 'wall') };
      const great = nb >= 7 && nd >= 3 && o.interior !== false, fr = ARCH.frame(L, F, { bw, dw, y0, colH, ceiling: great && !ARCH.lod ? false : undefined, brackets: o.brackets || 'full', paint, roof, tiles, roofCol: rc, fill, cls, lit, lamp, seed, chiwen: o.cw === false ? undefined : false, walls: o.walls || 'white', inter: o.inter });
      info = { F, W, D, cW: W, cD: D, floor: y + y0, ridge: y + fr.ridge, roof: fr.roof, ov: fr.ov, X: W / 2 + fr.ov, Z: D / 2 + fr.ov, eave: y + fr.ry0, inner: [W, D], fr };
      if (ARCH.lod && (roof === 'hip' || roof === 'xieshan')) { b.T(x, y, z, 0, yaw, 0); PALK.lodTrim(b, W, D, fr.purT, fr.ov, roof, jian, ridgeG); b.pop(); }
      if (great) PALK.hallInterior(L, x, y, z, yaw, fr, bw, dw, y0, colH, { open: o.open });
      if (o.furnish && !ARCH.lod) ARCH.furnish(L, { F: ARCH.F(x, y + y0, z, yaw), W, D, top: y + y0, frame: fr, front: fill.front, back: fill.back }, o.furnish, { seed: seed * 7 + 3, cls, lamp, lit: lit > .4, lot: 'palace', room: 'pal:' + Math.round(x) + ',' + Math.round(z), wealth: 4 });
    }
    if (!ARCH.lod && info.roof && info.fr && jian) { const fr2 = info.fr, rf = fr2.roof, X = rf.X, Z = rf.Z, k = .95, P = (lx, lz) => [lx, rf.topY(lx, lz) + .1, lz]; b.T(x, y, z, 0, yaw, 0).T(0, fr2.ry0, fr2.zc || 0); b.s({ tex: 'roof_tile_green', col: PALK.GREEN });
      for (const [ax, az, along, sg] of [[0, Z, 'x', 1], [0, -Z, 'x', -1], [X, 0, 'z', 1], [-X, 0, 'z', -1]]) { const len = along === 'x' ? X : Z, n = Math.max(4, Math.ceil(len / 1.6)); for (let i = 0; i < 2 * n; i++) { const u0 = -len + 2 * len * i / (2 * n), u1 = -len + 2 * len * (i + 1) / (2 * n);
        const q = along === 'x' ? [P(u0, az * .999), P(u1, az * .999), P(u1, az - sg * k), P(u0, az - sg * k)] : [P(ax * .999, u0), P(ax * .999, u1), P(ax - sg * k, u1), P(ax - sg * k, u0)];
        if (along === 'x' ? sg < 0 : sg > 0) q.reverse(); ARCH.poly(b, q, along === 'x' ? [0, 1, sg * .6] : [sg * .6, 1, 0], along === 'x' ? p => [p[0] / 2, (Z - Math.abs(p[2])) * 1.2 / 2] : p => [p[2] / 2, (X - Math.abs(p[0])) * 1.2 / 2]); } } // tiles run like the grey ones (ARCH.roof: 2 m per repeat, u along the eave, v down the slope); u = (x + z) / 2 laid them at 45°
      b.s({ col: [1, 1, 1] }); b.pop().pop(); }
    // 正脊 + 鴟尾 (green glaze on the great halls)
    if (!ARCH.lod && ridgeG && (roof === 'hip' || roof === 'xieshan') && info.roof) { const X = info.X, Z = info.Z, rx = roof === 'hip' ? Math.max(0, X - Z) : X - Z * .46, ry = info.ridge - y;
      if (rx > 1.2) { const rh = clamp(info.cW * .02, .55, 1.6), rwid = rh * .8 + .07; b.T(x, y, z, 0, yaw, 0); b.s({ tex: o.green === false ? 'roof_ridge' : 'roof_tile_green', col: o.green === false ? [1, 1, 1] : PALK.GREEN }).box(0, ry + (rh - .21) / 2, 0, 2 * rx + .36, rh + .21, rwid, { skip: ['bot'], world: 1 });
        for (const sd of [-1, 1]) { b.T(sd * (rx + .1), ry + rh - .03, 0, 0, sd < 0 ? 0 : PI, 0); ARCH.chiwei(b, rh * 3); b.pop(); } b.s({ col: [1, 1, 1] }); b.pop(); } }
    if (o.tablet && !ARCH.lod && info.fr) { b.T(x, y, z, 0, yaw, 0); b.s({ col: [1, 1, 1] }); ARCH.hangTablet(b, info.fr, o.tablet, o.tabletW || 1.1, o.tabletH || 2.2, { side: 1 }); b.pop(); }
    if (!ARCH.lod && L.meta && o.staff !== false && cls >= 3 && nb >= 5) for (const sd of [-1, 1]) { const p = F.p(sd * (info.cW / 2 - 1.4), 0, info.cD / 2 + (o.fujie ? dw[0] : 0) + 1.1); L.meta.spots.push({ x: p[0], y: info.floor, z: p[2], yaw: yaw + PI, role: sd < 0 ? 'eunuch' : 'palaceguard', cls }); }
    if (o.lights !== false && !ARCH.lod) { const q = F.p(0, info.floor - y + 3.2, 0); const l = L.light(q[0], q[1], q[2], Math.min(14, info.cW * .35), [1.2, .8, .45], { flicker: .05 }); l.group = 2; }
    return info;
  },
  // LOD1 / far: the massing roof (LOD.roof) gets the palace trim — a green-glazed eave band (剪邊), a green ridge and 鴟尾 — so the halls read
  // from the walls, towers and the air. Local frame of the hall (b already transformed); purT / ov from the LOD frame.
  lodTrim(b, W, D, purT, ov, type, jian, ridge) {
    const X = W / 2 + ov, Z = D / 2 + ov, H = Z * ARCH.pitch, xs = type === 'xieshan', rx = xs ? X - Z * .45 : Math.max(0, X - Z), ry = purT + H, y = purT + .07, g = PALK.GREEN;
    b.s({ tex: 'roof_tile_green', col: g }); const L2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t) + .07, lerp(p[2], q[2], t)];
    if (jian) { const u = Math.min(.2, 1.5 / Z); for (const sz of [-1, 1]) { const A = [-X, purT, sz * Z], B = [X, purT, sz * Z], Ar = [-rx, ry, 0], Br = [rx, ry, 0];
        ARCH.poly(b, [[A[0], y, A[2]], [B[0], y, B[2]], L2(B, Br, u), L2(A, Ar, u)], [0, Z, sz * H], p => [p[0] / 2, p[2] / 2]); }
      if (X - rx > .5) { const u2 = Math.min(.25, 1.5 / (X - rx)); for (const sx of [-1, 1]) { const A = [sx * X, purT, -Z], B = [sx * X, purT, Z], T = [sx * rx, ry, 0]; ARCH.poly(b, [[A[0], y, A[2]], [B[0], y, B[2]], L2(B, T, u2), L2(A, T, u2)], [sx * H, X - rx, 0], p => [p[2] / 2, p[1] / 2]); } } }
    if (ridge && rx > .6) { const rh = clamp(W * .02, .5, 1.5); b.box(0, ry + rh / 2 - .1, 0, 2 * rx + .3, rh + .2, rh * .8 + .1, { skip: ['bot'] });
      if (W > 14) for (const sd of [-1, 1]) { if (ARCH.lod === 1 && jian) { b.T(sd * (rx + .1), ry + rh - .05, 0, 0, sd < 0 ? 0 : PI, 0); ARCH.chiwei(b, rh * 3); b.pop(); } else b.box(sd * (rx - rh * .25), ry + rh * 1.6, 0, rh * .7, rh * 2.2, rh * .5, { skip: ['bot'] }); } }
    b.s({ col: [1, 1, 1] }); },
  // ---- the interior of a great hall (LOD0): Tang 殿堂 of the 金廂斗底槽 type — an outer ring of columns in the walls and an inner ring one bay
  // in (taller 內柱 with ring beams); the middle open (含元殿: 9.7 m clear front-to-back span [含元殿報告]); a 平闇 ceiling raised under the
  // roof (sloping with the rafters at the sides, flat over the centre) instead of a lid at the column tops; lamp trees along the hall.
  // Local frame of the hall (call inside b.T(x, y, z, yaw)); fr = the frame that carries the roof (its under() gives the roof underside).
  hallInterior(L, x, y, z, yaw, fr, bw, dw, y0, colH, o = {}) { if (ARCH.lod) return; const b = L.mb, F = ARCH.F(x, y, z, yaw), W = PALK.sum(bw), D = PALK.sum(dw), xs = [-W / 2], zs = [-D / 2];
    bw.forEach(v => xs.push(xs[xs.length - 1] + v)); dw.forEach(v => zs.push(zs[zs.length - 1] + v)); const n = bw.length, m = dw.length;
    const ceil = (lx, lz) => Math.min(fr.under(lx, lz) - .45, fr.under(0, D * .22) - .45), yC = ceil(0, 0);
    b.T(x, y, z, 0, yaw, 0);
    // 平闇: a grid of panels following the roof, flat in the middle
    const nx = Math.max(2, Math.ceil(W / 2.6)), nz = Math.max(2, Math.ceil(D / 2.6)), X = i => lerp(-W / 2 + .25, W / 2 - .25, i / nx), Z = j => lerp(-D / 2 + .25, D / 2 - .25, j / nz);
    b.s({ tex: 'ceiling', col: [1.55, 1.48, 1.38] }); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = [X(i), 0, Z(j)], c = [X(i + 1), 0, Z(j)], d = [X(i + 1), 0, Z(j + 1)], e = [X(i), 0, Z(j + 1)]; for (const q of [a, c, d, e]) q[1] = ceil(q[0], q[2]); ARCH.quad(b, a, c, d, e, [0, -1, 0], [Math.max(1, Math.round((c[0] - a[0]) / 1.4)), Math.max(1, Math.round((e[2] - a[2]) / 1.4))]); }
    // inner ring columns (taller), ring beams
    if (n >= 3 && m >= 3) { const hi = Math.min(yC - y0 - .6, colH * 1.3), r = colH * .07; b.s({ col: [1, 1, 1] });
      for (let i = 1; i < n; i++) for (let j = 1; j < m; j++) { if (!(i === 1 || i === n - 1 || j === 1 || j === m - 1)) continue; if (i > 1 && i < n - 1) continue; /* 減柱: the front and back inner rows keep only their end columns: the nave and the dais stay clear */ ARCH.column(b, xs[i], y0, zs[j], hi, r, { tex: 'vermilion', base: true }); const p = F.p(xs[i], 0, zs[j]); L.world.cyl(p[0], p[2], y + y0, y + y0 + hi, r + .03); }
      for (const [a0, a1, c, alongX] of [[xs[1], xs[n - 1], zs[1], 1], [xs[1], xs[n - 1], zs[m - 1], 1], [zs[1], zs[m - 1], xs[1], 0], [zs[1], zs[m - 1], xs[n - 1], 0]]) { if (alongX) ARCH.beam(b, a0, c, a1, c, y0 + hi - .55, .55, .42, 'beam_ochre'); else ARCH.beam(b, c, a0, c, a1, y0 + hi - .55 + .02, .55, .42, 'beam_ochre'); }
      // bracket sets on the inner columns carry the 明栿 (across the nave, front ring to back ring) and the 乳栿 (out to the walls); the ceiling rests on them
      const bs = colH * .26, yb = y0 + hi + .02; for (let i = 1; i < n; i++) for (const j of [1, m - 1]) { b.T(xs[i], yb, zs[j], 0, j === 1 ? PI : 0, 0); ARCH.bracket(b, bs, { style: 'simple', tex: 'paint_ochre' }); b.pop(); }
      for (let i = 1; i < n; i++) { ARCH.beam(b, xs[i], zs[1], xs[i], zs[m - 1], yb + bs * .5, .62, .44, 'beam_ochre'); for (const [za, zb] of [[zs[0] + .2, zs[1]], [zs[m - 1], zs[m] - .2]]) ARCH.beam(b, xs[i], za, xs[i], zb, yb + bs * .3, .5, .38, 'beam_ochre'); }
      for (let j = 1; j < m; j++) for (const [xa, xb2] of [[xs[0] + .2, xs[1]], [xs[n - 1], xs[n] - .2]]) ARCH.beam(b, xa, zs[j], xb2, zs[j], yb + bs * .3 + .03, .5, .38, 'beam_ochre'); }
    b.pop();
    // lamp trees along both sides of the nave, with their light
    const nl = Math.max(2, Math.round(W / 14)) | 0; for (let k = 0; k < nl; k++) { const lx = lerp(-W * .4, W * .4, k / Math.max(1, nl - 1)); if (Math.abs(lx) < Math.min(10, W * .2)) continue; /* never near the axis: the view to the throne, the dais */ for (const sz of [-1, 1]) { const lz = sz * (D / 2 - Math.min(dw[0], 4.4) * 1.05), p = F.p(lx, y0, lz);
        L.prop(bb => PALK.lampTree(bb, 2.2), p[0], p[1], p[2], { solid: { r: .4, h: 2.2 } }); }
      const q = F.p(lx, y0 + 3.2, 0), l = L.light(q[0], q[1], q[2], Math.min(16, D * .7), [1.2, .82, .48], { flicker: .05 }); l.group = 3; } },
  // stairs given in hall-local sides 'f'/'b'/'l'/'r' → world sides for a yaw that is a multiple of PI/2
  dirStairs(yaw, st, W, D) { const k = ((Math.round(yaw / (PI / 2)) % 4) + 4) % 4, map = [{ f: 's', b: 'n', l: 'w', r: 'e' }, { f: 'e', b: 'w', l: 's', r: 'n' }, { f: 'n', b: 's', l: 'e', r: 'w' }, { f: 'w', b: 'e', l: 'n', r: 's' }][k];
    return st.map(s => ({ side: map[s.side] || s.side, at: (k === 2 || k === 3) && (s.side === 'f' || s.side === 'b') ? -(s.at || 0) : (s.at || 0), w: s.w })); },
  // hipped skirt roof (lower eave of a 重檐 hall): outer eave rect ±X0 × ±Z0 at y0 up to the core ±X1 × ±Z1 at y1 (local frame)
  skirt(b, X0, Z0, y0, X1, Z1, y1, o = {}) {
    const up = .22, col = o.col || [1, 1, 1], tex = o.tiles === 'green' ? 'roof_tile_green' : 'roof_tile', th = .28;
    const O = [[-X0, Z0], [X0, Z0], [X0, -Z0], [-X0, -Z0]], I = [[-X1, Z1], [X1, Z1], [X1, -Z1], [-X1, -Z1]];
    for (let s = 0; s < 4; s++) { const a = O[s], c = O[(s + 1) % 4], ai = I[s], ci = I[(s + 1) % 4], P = [[a[0], y0 + up, a[1]], [c[0], y0 + up, c[1]], [ci[0], y1, ci[1]], [ai[0], y1, ai[1]]];
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, ml = Math.hypot(mx, mz), dh = y1 - y0 - up, dl = Math.hypot(mx - (ai[0] + ci[0]) / 2, mz - (ai[1] + ci[1]) / 2), n = [mx / ml * dh, dl, mz / ml * dh];
      const ex = c[0] - a[0], ez = c[1] - a[1], el = Math.hypot(ex, ez), ux = ex / el, uz = ez / el;
      // midpoints sag a little: the Tang roof's concave line (two strips)
      const Mo = [(a[0] + ai[0]) / 2, 0, (a[1] + ai[1]) / 2], Mc = [(c[0] + ci[0]) / 2, 0, (c[1] + ci[1]) / 2], ym = lerp(y0 + up, y1, .5) - .25;
      const A = [a[0], y0 + up, a[1]], C = [c[0], y0 + up, c[1]], Ai = [ai[0], y1, ai[1]], Ci = [ci[0], y1, ci[1]], M1 = [Mo[0], ym, Mo[2]], M2 = [Mc[0], ym, Mc[2]];
      b.s({ tex, col }); const uvq = (p) => [(p[0] * ux + p[2] * uz) / 2, -Math.hypot(p[0] * -uz + p[2] * ux) / 2]; void uvq;
      ARCH.poly(b, [A, C, M2, M1], n, p => [(p[0] * ux + p[2] * uz) / 2, (p[0] * uz - p[2] * ux) / 2]); ARCH.poly(b, [M1, M2, Ci, Ai], n, p => [(p[0] * ux + p[2] * uz) / 2, (p[0] * uz - p[2] * ux) / 2]);
      if (o.jian) { const u = .16, up2 = q => [q[0], q[1] + .1, q[2]], A2 = up2(A.map((v, i) => lerp(v, M1[i], u))), C2 = up2(C.map((v, i) => lerp(v, M2[i], u))); b.s({ tex: 'roof_tile_green', col: PALK.GREEN }); ARCH.poly(b, [up2(A), up2(C), C2, A2], n, p => [(p[0] * ux + p[2] * uz) / 2, (p[0] * uz - p[2] * ux) / 2]); b.s({ tex, col }); }
      if (ARCH.lod !== 2) { b.s({ tex: 'rafters', col: [1, 1, 1] }); const dn = p => [p[0], p[1] - th, p[2]]; ARCH.poly(b, [C, A, M1, M2].map(dn), [-n[0], -n[1], -n[2]], p => [(p[0] * ux + p[2] * uz) / 2, p[1] / 2]); ARCH.poly(b, [M2, M1, Ai, Ci].map(dn), [-n[0], -n[1], -n[2]], p => [(p[0] * ux + p[2] * uz) / 2, p[1] / 2]);
        b.s({ tex: 'tile_end', col: [1, 1, 1] }); const on = [n[0], 0, n[2]]; ARCH.quad(b, A, C, dn(C), dn(A), [mx, 0, mz], [Math.max(1, Math.round(el / 1.2)), 1]); void on; }
      // hip ridge strip along the mitre from the outer corner c to the inner corner ci
      if (ARCH.lod !== 2) { const hx = ci[0] - c[0], hz = ci[1] - c[1], hl = Math.hypot(hx, hz); b.s({ tex: 'roof_ridge', col: [1, 1, 1] }); const yaw = Math.atan2(hx, hz), pitch = Math.atan2(y1 - y0 - up, hl);
        b.T(c[0], y0 + up, c[1], 0, yaw, 0).T(0, 0, 0, -pitch, 0, 0).box(0, .12, Math.hypot(hl, y1 - y0 - up) / 2, .32, .3, Math.hypot(hl, y1 - y0 - up) + .2).pop().pop(); } }
    b.s({ col: [1, 1, 1] });
  },
  // gate hall 殿門 straddling a wall line: o.bays (odd), the middle o.pass bays open passages (cls 4 leaves), the rest walled
  menHall(L, x, z, o = {}) { const nb = o.bays || 5, mid = (nb - 1) / 2, ps = o.pass ?? (nb >= 7 ? 1 : 0), yaw = o.yaw || 0, bw = o.bayW || 5, dbw = o.dbayW || 4.6;
    const k = i => Math.abs(i - mid) <= ps ? (o.open ? 'open' : 'boardopen') : 'wall';
    return PALK.dian(L, x, o.y || 0, z, { yaw, bays: nb, dbays: 2, bayW: bw, dbayW: dbw, colH: o.colH || 5.2, roof: o.roof || 'xieshan', brackets: 'full', platform: o.ph ?? 1.2, pm: o.pm ?? 1.6, cls: 4, lit: .2, seed: o.seed || 7, tablet: o.tablet, tabletW: .95, tabletH: 1.9, cw: o.cw,
      fill: { front: Array.from({ length: nb }, (_, i) => k(i)), back: Array.from({ length: nb }, (_, i) => k(i)), left: ['wall', 'wall'], right: ['wall', 'wall'] }, stairs: [{ side: 'f', at: 0, w: (2 * ps + 1) * bw - .8 }, { side: 'b', at: 0, w: (2 * ps + 1) * bw - .8 }], lights: false }); },
  // 闕 / 閣 on a stepped base: o.sd (+1: the lower steps go east), o.h (main base top), returns { top, x, z }
  que(L, x, z, o = {}) {
    const sd = o.sd || 1, H = o.h || 8, b = L.mb, blocks = [[0, 20, 16, H], [sd * 15.5, 11, 13, H - 1.6], [sd * 24.5, 7, 10, H - 3.2]];
    for (const [dx, w, d, h] of blocks) { b.s({ tex: 'plaster', col: PALK.RED }).box(x + dx, (h - .6) / 2, z, w, h + .6, d, { world: 3, skip: ['bot'], faces: { top: 'pave' } }); if (ARCH.lod !== 2) b.s({ tex: 'stone', col: [.96, .95, .92] }).box(x + dx, .3, z, w + .12, .6, d + .12, { world: 1, skip: ['bot', 'top'] }); if (!ARCH.lod) L.world.box(x + dx, h / 2, z, w / 2, h / 2, d / 2, { surface: 'stone' }); }
    b.s({ col: [1, 1, 1] });
    // 閣 on the main base (two storeys, walkable), smaller towers on the steps
    const lou = ARCH.lou2(L, x, H, z, { bays: 3, dbays: 3, bayW: 4.6, dbayW: 3.8, colH1: 4.6, colH2: 3.6, storeys: 2, platform: .3, roof: 'hip', tiles: undefined, paint: 'ochre', seed: o.seed || 3, backDoor: true });
    PALK.dian(L, x + blocks[1][0], H - 1.6, z, { bays: 3, dbays: 2, bayW: 3, dbayW: 3.6, colH: 3.6, roof: 'hip', brackets: 'simple', cls: 0, lights: false, seed: (o.seed || 3) + 1, cw: false, windows: true, doors: [1] });
    PALK.dian(L, x + blocks[2][0], H - 3.2, z, { bays: 1, dbays: 1, bayW: 3.6, dbayW: 3.6, colH: 3.2, roof: 'hip', brackets: 'simple', cls: 0, lights: false, seed: (o.seed || 3) + 2, cw: false, fill: { front: ['window'], back: ['wall'], left: ['wall'], right: ['wall'] } });
    if (ARCH.lod !== 2) { const pts = (dx, w, d, h) => [[x + dx - w / 2 + .3, h + .01, z - d / 2 + .3], [x + dx + w / 2 - .3, h + .01, z - d / 2 + .3], [x + dx + w / 2 - .3, h + .01, z + d / 2 - .3], [x + dx - w / 2 + .3, h + .01, z + d / 2 - .3]];
      for (const [dx, w, d, h] of blocks.slice(1)) ARCH.railing(L, pts(dx, w, d, h), { closed: true, mat: 'stone', h: .95, solid: !ARCH.lod });
      const e = 9.7, f = 7.7, yy = H + .01, R = (a) => ARCH.railing(L, a.map(([u, v]) => [x + u, yy, z + v]), { mat: 'stone', h: .95, solid: !ARCH.lod }); R([[-3.6, -f], [-e, -f], [-e, f], [e, f], [e, -f], [3.6, -f]]); }
    return { top: H, lou };
  },
  // raised flying corridor 飛廊: a brick-faced earth wall (deck at y) carrying an open corridor; from (x0, z0) to (x1, z1)
  feilang(L, x0, z0, x1, z1, y, o = {}) { const b = L.mb, len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), w = o.w || 7, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.T(mx, 0, mz, 0, yaw, 0); b.s({ tex: 'plaster', col: PALK.RED }).box(0, (y - .5) / 2, 0, len, y + .5, w, { world: 3, skip: ['bot', 'px', 'nx'], faces: { top: 'pave' } }); if (ARCH.lod !== 2) b.s({ tex: 'brick', col: [.95, .92, .88] }).box(0, .45, 0, len, .9, w + .06, { world: 1, skip: ['bot', 'top', 'px', 'nx'] }); b.pop(); b.s({ col: [1, 1, 1] });
    if (!ARCH.lod) L.world.box(mx, y / 2, mz, len / 2, y / 2, w / 2, { yaw, surface: 'stone' });
    ARCH.corridor(L, x0, z0, x1, z1, { y, w: w - 2.2, colH: 3.4, ph: .25, m0: 0, m1: 0, paint: 'ochre', seed: o.seed || 5 });
    if (ARCH.lod !== 2) { const dx = (x1 - x0) / len, dz = (z1 - z0) / len, m = w / 2 - .25, e0 = o.e0 ?? 0, e1 = o.e1 ?? 0;
      for (const sd of [-1, 1]) { const n = Math.max(1, Math.ceil(len / 3.2)), pts = []; for (let i = 0; i <= n; i++) { const t = lerp(e0 / len, 1 - e1 / len, i / n); pts.push([lerp(x0, x1, t) - dz * sd * m, y + .01, lerp(z0, z1, t) + dx * sd * m]); } ARCH.railing(L, pts, { mat: 'red', h: .9, solid: !ARCH.lod }); } } },

  // 角樓: corner tower on a palace wall corner — a brick-faced bastion rising 2 m above the wall, a 3 x 3-bay hall with a 歇山 roof (plausible:
  // corner towers are known on Tang city and palace walls; the 大明宮 corners are not excavated as towers (?))
  jiaolou(L, x, z, wallH, o = {}) { const b = L.mb, s = o.s || 15, H = wallH + 2;
    b.s({ tex: 'plaster', col: PALK.RED }).box(x, (H - 1) / 2, z, s, H + 1, s, { world: 3, skip: ['bot'], faces: { top: 'pave' } }); if (ARCH.lod !== 2) b.s({ tex: 'brick', col: [.95, .92, .88] }).box(x, .45, z, s + .06, .9, s + .06, { world: 1, skip: ['bot', 'top'] }); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) L.world.box(x, H / 2, z, s / 2, H / 2, s / 2, { surface: 'stone' });
    PALK.dian(L, x, H, z, { yaw: o.yaw || 0, bays: 3, dbays: 3, bayW: 3.4, dbayW: 3.4, colH: 4.2, roof: 'xieshan', brackets: 'full', cls: 0, lights: false, staff: false, seed: (x * 7 + z) | 0, cw: undefined, windows: 'all', doors: [1] });
    if (ARCH.lod !== 2) { const e = s / 2 - .3, y = H + .01; if (ARCH.lod) { b.s({ tex: 'stone', col: [1.25, 1.22, 1.15] }); for (const [dx, dz, w, d] of [[0, e, s - .6, .2], [0, -e, s - .6, .2], [e, 0, .2, s - .6], [-e, 0, .2, s - .6]]) b.box(x + dx, y + .45, z + dz, w, .9, d, { skip: ['bot'] }); b.s({ col: [1, 1, 1] }); }
      else ARCH.railing(L, [[x - e, y, z - e], [x + e, y, z - e], [x + e, y, z + e], [x - e, y, z + e]], { closed: true, mat: 'red', h: .95 }); } },
  // painted portrait panels on both faces of a partition (凌煙閣): framed standing figures in court robes (purple / crimson), 幞頭, holding 笏
  portraits(L, x, y, z, len) { if (ARCH.lod) return; const b = L.mb, n = 6, w = len / n; b.T(x, y, z, 0, 0, 0);
    b.s({ tex: 'plaster', col: [1.05, 1.02, .95] }).box(0, 1.6, 0, len + .2, 3.2, .3); b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, 3.25, 0, len + .3, .12, .36).box(0, .06, 0, len + .3, .12, .36);
    const R = RNG(643), robes = [[.42, .27, .45], [.6, .2, .18], [.42, .27, .45], [.36, .22, .4], [.72, .3, .25]];
    for (const sd of [-1, 1]) for (let i = 0; i < n; i++) { const px = -len / 2 + (i + .5) * w, zz = sd * .17, rc = robes[(R() * robes.length) | 0];
      b.s({ tex: 'dark_wood', col: [.8, .6, .45] }).box(px, 1.75, zz + sd * .01, w - .25, 2.5, .02); b.s({ tex: 'paper', col: [1.02, .96, .84] }).box(px, 1.75, zz + sd * .02, w - .45, 2.3, .02);
      b.s({ tex: 'silk', col: rc }).box(px, 1.35, zz + sd * .035, .55, 1.25, .02); b.s({ tex: 'skin', col: [.92, .78, .62] }).box(px, 2.12, zz + sd * .035, .26, .3, .02); b.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(px, 2.32, zz + sd * .04, .3, .14, .02).box(px - .02, 1.5, zz + sd * .045, .06, .4, .02); }
    b.pop(); b.s({ col: [1, 1, 1] }); L.world.box(x, y + 1.6, z, len / 2 + .1, 1.6, .15, { surface: 'wood' }); },
  // wall junction pier (see PIERS)
  pier(L, x, z, t, h, col) { const b = L.mb, P = t + .7, H = h + .35; b.s({ tex: 'plaster', col: col || PALK.RED }).box(x, (H - .5) / 2, z, P, H + .5, P, { world: 3, skip: ['bot', 'top'] });
    if (ARCH.lod !== 2) b.s({ tex: 'brick', col: [.95, .92, .88] }).box(x, .45, z, P + .06, .9, P + .06, { world: 1, skip: ['bot', 'top'] });
    const lv = ARCH.lod, lu = LOD.under; ARCH.lod = 2; LOD.under = true; try { b.s({ col: [1, 1, 1] }); b.T(x, 0, z); LOD.roof(b, P, P, H, .4, 'pyramid'); b.pop(); } finally { ARCH.lod = lv; LOD.under = lu; } b.s({ col: [1, 1, 1] });
    if (!ARCH.lod) L.world.box(x, H / 2, z, P / 2, H / 2, P / 2, { surface: 'stone' }); },
  // ---- furnishings (LOD0 only) ----
  // 御座: a two-step dais with a lacquered couch 御床, the 扆 screen behind, 雉尾扇 fans, censers, lamp trees; meta spot 'throne'
  // a single 茵 mat (top y + .04, with collision) for a seated person
  mat(L, x, y, z, yaw = 0, col = [1, 1, 1]) { if (ARCH.lod) return; const b = L.mb; b.T(x, y, z, 0, yaw, 0).s({ tex: 'mat', col }).box(0, .02, 0, 1.2, .04, 1.1); b.pop(); b.s({ col: [1, 1, 1] }); L.world.box(x, y + .02, z, .6, .02, .55, { yaw, surface: 'wood' }); },
  // 床 (a bed-platform with 屏 screens on back and sides, mats and a quilt) or, with o.ta, a plain 榻 dais; Tang beds are low platforms
  // on 壼門 bases (法門寺 / 敦煌 murals), no posts or canopy frames of the Ming kind. Top at y + h.
  bed(L, x, y, z, yaw = 0, o = {}) { if (ARCH.lod === 2) return; const b = L.mb, w = o.w || 2.4, d = o.d || 1.6, h = o.h || .5; b.T(x, y, z, 0, yaw, 0);
    b.s({ tex: 'lacquer_red', col: [.8, .55, .5] }).box(0, h / 2 - .03, 0, w, h - .06, d, { skip: ['bot'] }); b.s({ tex: 'dark_wood', col: [.6, .5, .42] }).box(0, h * .45, d / 2 + .005, w * .86, h * .5, .01);
    b.s({ tex: 'silk', col: o.ta ? [.9, .78, .55] : [.86, .7, .5] }).box(0, h - .015, 0, w - .06, .06, d - .06);
    if (!o.ta) { b.s({ tex: 'plank', col: [.5, .36, .28] }).box(0, h + .45, -d / 2 + .04, w, .9, .06); for (const sx of [-1, 1]) b.box(sx * (w / 2 - .03), h + .3, -.1, .06, .6, d - .3); }
    b.pop(); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) L.world.box(x, y + h / 2, z, w / 2, h / 2, d / 2, { yaw, surface: 'wood' }); },
  throne(L, x, y, z, yaw = 0, o = {}) { if (ARCH.lod) return; const b = L.mb, F = ARCH.F(x, y, z, yaw), s = o.s || 1;
    b.T(x, y, z, 0, yaw, 0);
    b.s({ tex: 'stone', col: [1, .98, .94] }).box(0, .18, -.2, 8 * s, .36, 6 * s, { world: 1 }); b.s({ tex: 'brocade', col: [.85, .3, .25] }).box(0, .38, -.3, 7.2 * s, .06, 5 * s, { uv: [3, 2] }).box(0, .1, 3.6 * s, 4.4 * s, .02, 2.2 * s, { uv: [2, 1] });
    b.s({ tex: 'stone', col: [1, .98, .94] }).box(0, .6, -.8, 5.6 * s, .44, 3.6 * s, { world: 1 }); // upper step
    b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, 1.04, -1.1, 2.6 * s, .44, 1.5 * s); b.s({ tex: 'gold', col: [1, .9, .6] }).box(0, 1.27, -1.1, 2.7 * s, .04, 1.6 * s);
    b.s({ tex: 'brocade', col: [.9, .75, .35] }).box(0, 1.33, -1.1, 2.4 * s, .08, 1.3 * s); b.s({ tex: 'lacquer_red', col: [1, 1, 1] }); for (const sx of [-1, 1]) b.box(sx * 1.32 * s, 1.55, -1.1, .1, .5, 1.5 * s); b.box(0, 1.6, -1.82 * s, 2.7 * s, .62, .1);
    // 扆: three-panel screen with a dark ground and a gold 黼 (axe) band
    for (const [dx, ry] of [[0, 0], [-2.3, -.5], [2.3, .5]]) { b.T(dx * s, 0, -2.45 * s + Math.abs(dx) * .2, 0, ry, 0); b.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, 2.3, 0, 2.3 * s, 3.4, .14); b.s({ tex: 'leiwen', col: [1, .85, .5] }).box(0, 2.3, .08, 2 * s, 3.0, .02); b.s({ tex: 'lacquer_red' }).box(0, .65, 0, 2.4 * s, .3, .3); b.pop(); }
    // 雉尾扇 (two tall fans of pheasant feathers on poles, set behind and to the sides)
    for (const sx of [-1, 1]) { b.T(sx * 3.4 * s, .38, -2 * s, 0, sx * .25, 0); b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).cyl(0, 0, 0, .05, 3.6, { seg: 5 }); b.s({ tex: 'brocade', col: [.75, .55, .3] }).T(0, 4.2, 0, PI / 2, 0, 0).cyl(0, -.03, 0, .85, .03, { seg: 10 }).pop(); b.pop(); }
    // censers on the lower step, a pair of bronze lamp trees 燈樹 at the front corners
    for (const sx of [-1, 1]) { b.T(sx * 2.4 * s, .36, 1.3 * s); PROPS.incenseBurner(b, 1.2, .8); b.pop(); b.T(sx * 4.6 * s, 0, 2.2 * s); PALK.lampTree(b, 2.3); b.pop(); }
    b.pop(); L.world.box(...F.p(0, .18, -.2), 4 * s, .18, 3 * s, { yaw, surface: 'stone' }); L.world.box(...F.p(0, .6, -.8), 2.8 * s, .22, 1.8 * s, { yaw, surface: 'stone' }); L.world.box(...F.p(0, 1.07, -1.1), 1.3 * s, .3, .75 * s, { yaw, surface: 'wood' }); // the two steps and the seat (top 1.37) as drawn
    for (const sx of [-1, 1]) { const p = F.p(sx * 4.6 * s, 2.4, 2.2 * s); const l = L.light(p[0], p[1], p[2], 7, [1.3, .85, .45], { flicker: .08 }); l.group = 3; }
    if (L.meta) { const p = F.p(0, 1.37, -1.1); L.meta.spots.push({ kind: 'seat', role: 'emperor', x: p[0], y: p[1], z: p[2], yaw: yaw, room: 'throne' }); }
  },
  // rows of mats and low desks for officials or scribes (書案 + 坐褥), facing yaw; meta spots 'scribe'
  desks(L, x, y, z, yaw, nx, nz, dx = 2.2, dz = 2.4, role = 'scribe', noTable = false) { if (ARCH.lod) return; const b = L.mb;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const lx = (i - (nx - 1) / 2) * dx, lz = (j - (nz - 1) / 2) * dz, F = ARCH.F(x, y, z, yaw), p = F.p(lx, 0, lz);
      b.T(p[0], y, p[2], 0, yaw, 0); b.s({ tex: 'mat', col: [1, 1, 1] }).box(0, .02, 0, 1.2, .04, 1.1); L.world.box(p[0], y + .02, p[2], .6, .02, .55, { yaw, surface: 'wood' }); if (!noTable) { b.s({ tex: 'lacquer_black' }).box(0, .3, .62, 1.1, .06, .5); b.box(-.48, .14, .62, .06, .28, .4).box(.48, .14, .62, .06, .28, .4); }
      b.s({ tex: 'paper', col: [1, .96, .88] }).box(-.1, .34, .6, .4, .02, .3); b.pop();
      if (L.meta) L.meta.spots.push({ kind: 'seat', role, x: p[0], y: y + .04, z: p[2], yaw }); } },
  // 灶: a brick kitchen range with two pots and a chimney hood (尚食), facing yaw; meta-free (static cooks stand at its front)
  stove(L, x, y, z, yaw) { if (ARCH.lod) return; L.prop(bb => { bb.s({ tex: 'brick', col: [.9, .82, .75] }).box(0, .45, 0, 2.4, .9, 1.1); bb.s({ tex: 'embers', col: [1, .7, .5], emi: .6 }).box(0, .3, .56, .6, .3, .02); bb.s({ emi: 0 });
      for (const sx of [-.6, .6]) { bb.s({ tex: 'iron', col: [.6, .6, .62] }).T(sx, .9, 0).lathe([[0, 0], [.32, .02], [.36, .22], [.33, .24]], { seg: 8 }).pop(); } bb.s({ tex: 'brick', col: [.85, .78, .72] }).box(0, 1.8, -.45, .5, 1.8, .3); }, x, y, z, { yaw, solid: { w: 2.4, h: .9, d: 1.1 } }); },
  // 列戟: a rack of halberds beside a palace gate (12 per rack), facing yaw
  jiRack(L, x, z, yaw, n = 12) { if (ARCH.lod) return; const b = L.mb; b.T(x, 0, z, 0, yaw, 0); b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .9, 0, n * .42 + .4, .14, .3).box(0, 2.1, 0, n * .42 + .4, .14, .3); for (const sx of [-1, 1]) b.box(sx * (n * .21 + .1), 1.3, 0, .2, 2.6, .3);
    for (let i = 0; i < n; i++) { const xx = (i - (n - 1) / 2) * .42; b.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(xx, 2.2, .1, .06, 4.4, .06); b.s({ tex: 'steel', col: [.9, .9, .95] }).box(xx, 4.55, .1, .04, .5, .02).box(xx + .1, 4.25, .1, .2, .06, .02); b.s({ tex: 'silk', col: [.9, .3, .25] }).box(xx, 4.12, .12, .1, .3, .02); }
    b.pop(); L.world.box(x, 1.2, z, n * .21 + .3, 1.2, .3, { yaw, surface: 'wood' }); },
  // banner pole 旗 (儀仗 flags), o.col
  flag(L, x, z, o = {}) { if (ARCH.lod) return; const b = L.mb, h = o.h || 7.5; b.T(x, o.y || 0, z, 0, o.yaw || 0, 0); b.s({ tex: 'stone', col: [.9, .9, .88] }).box(0, .25, 0, .7, .5, .7); b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).cyl(0, .5, 0, .07, h, { seg: 5 });
    b.s({ tex: 'silk', col: o.col || [.85, .25, .2] }).box(.06, h - 2.1, .5, .02, 3.2, .9); b.s({ tex: 'gold', col: [1, .9, .6] }).T(0, h, 0).lathe([[0, 0], [.08, 0], [.03, .35], [0, .4]], { seg: 4 }).pop(); b.pop(); },
  // a 儀仗 banner pole (LOD0 detailed, LOD1 a pole and a silk card): colours of the five directions in turn
  flagLine(L, x, z, k = 0) { if (ARCH.lod === 2) return; const b = L.mb, h = 8, col = [[.85, .25, .2], [.25, .4, .7], [.86, .7, .3], [.9, .88, .82], [.2, .2, .22]][k % 5];
    if (!ARCH.lod) { PALK.flag(L, x, z, { h, col }); return; } b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(x, h / 2, z, .16, h, .16, { skip: ['bot'] }); b.s({ tex: 'silk', col }).box(x + .06, h - 2.1, z + .5, .04, 3.2, .9); b.s({ col: [1, 1, 1] }); },
  // 燈樹 (多枝燈): a bronze lamp tree — a stepped base, a tapering trunk and three tiers of curved arms, each arm ending in a lamp dish with its
  // flame (nothing floats); h = height (local, base at y = 0)
  lampTree(b, h = 2.3) { b.s({ tex: 'bronze', col: [.9, .8, .6] }).lathe([[0, 0], [.36, 0], [.34, .1], [.2, .16], [.08, .3], [.055, h], [0, h + .08]], { seg: 6 });
    for (let t = 0; t < 3; t++) { const y = h * (.55 + t * .17), r = .5 - t * .1, n = 5 - t; for (let k = 0; k < n; k++) { const a = (k + t * .5) / n * TAU, ex = Math.cos(a) * r, ez = Math.sin(a) * r;
        b.s({ tex: 'bronze', col: [.9, .8, .6] }).tube([[0, y - .06, 0], [ex * .55, y + .02, ez * .55], [ex, y + .1, ez]], { r: .022, seg: 4, steps: 2 }); b.T(ex, y + .1, ez); PROPS.oilLamp(b, false, 1); b.pop(); } } },
  // bronze lamp stand pairs / censer before a hall (LOD0)
  censer(L, x, y, z) { if (ARCH.lod) return; L.prop(bb => { bb.s({ tex: 'stone', col: [.95, .93, .9] }).box(0, .3, 0, 1.4, .6, 1.4); bb.T(0, .6, 0, 0, 0, 0, 2); PROPS.incenseBurner(bb, 1, .8); bb.pop(); }, x, y, z, { solid: { w: 1.5, h: 2, d: 1.5 } }); },
  tree(L, x, z, kind, s, seed, y = 0, pit = false) { if (pit && ARCH.lod !== 2) { const b = L.mb, e = 1.15, k = .22; b.s({ tex: 'dirt', col: [.82, .72, .6] }).box(x, .04, z, 2 * e - .1, .08, 2 * e - .1, { skip: ['bot'] }); // 樹池: a soil square in a brick kerb (trees never grow through the paving)
      b.s({ tex: 'brick', col: [1.05, 1, .95] }); for (const [dx, dz, w, d] of [[0, e, 2 * e + k, k], [0, -e, 2 * e + k, k], [e, 0, k, 2 * e - k], [-e, 0, k, 2 * e - k]]) b.box(x + dx, .13, z + dz, w, .26, d, { skip: ['bot'] }); b.s({ col: [1, 1, 1] }); }
    if (kind) TREES.place(L, x, (ARCH.lod === 2 ? PALK.y(x, z) : 0) + y, z, kind, s, seed); },

  // ---- water ----
  // a lake (irregular outline), water at y = -0.55 (the ground is carved by PALACE.depthAt), stone revetment, invisible kerb collision
  lakeShape(cx, cz, rx, rz, seed) { const R = RNG(seed), ph = [R() * TAU, R() * TAU, R() * TAU]; const rad = a => 1 + .08 * Math.sin(2 * a + ph[0]) + .05 * Math.sin(3 * a + ph[1]) + .035 * Math.sin(5 * a + ph[2]);
    return { cx, cz, rx, rz, rad, at: a => [cx + Math.cos(a) * rx * rad(a), cz + Math.sin(a) * rz * rad(a)], inside: (x, z, m = 0) => { const dx = (x - cx), dz = (z - cz), a = Math.atan2(dz / rz, dx / rx), r = rad(a); return Math.hypot(dx / (rx * r + m), dz / (rz * r + m)) < 1; } }; },
  // lotus bed 荷 (太液池: lotus roots excavated; the 6th month is lotus time): pads (and a few pink flowers) floating at the water line;
  // LOD1 / far: one green patch — the lakes read green-flecked from the walls and towers, not as black holes
  lotus(L, x, z, r, seed) { const b = L.mb, R = RNG(seed), wy = -.55 + .03;
    if (ARCH.lod) return; /* far / LOD1: no lotus patches (they read as green triangles on the dark water; the pads appear up close) */ if (ARCH.lod) { const n = 9, pts = [], yl = .09; for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = r * .55 * (.7 + R() * .45); pts.push([x + Math.cos(a) * rr, yl, z + Math.sin(a) * rr * .8]); } b.s({ tex: 'grass_summer', col: [.36, .5, .3] }); ARCH.poly(b, pts, [0, 1, 0], p => [p[0] / 3, p[2] / 3], [x, yl, z], true); b.s({ col: [1, 1, 1] }); return; }
    const n = Math.round(r * r * 1.1); for (let k = 0; k < n; k++) { const a = R() * TAU, d = Math.sqrt(R()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d * .8, s2 = .22 + R() * .3, up = R() < .25 ? .25 + R() * .5 : 0;
      b.s({ tex: 'grass_summer', col: [.5 + R() * .15, .78 + R() * .12, .42] }).T(px, wy + up, pz, (R() - .5) * .3, R() * TAU, (R() - .5) * .3).lathe([[0, 0], [s2, .015], [s2 * .96, .04], [0, .03]], { seg: 7 }).pop();
      if (R() < .1) b.s({ tex: 'silk', col: [1, .62, .7] }).T(px + .1, wy + .45 + R() * .3, pz).ell(0, 0, 0, .09, .11, .09, { seg: 5, ring: 3 }).pop(); }
    b.s({ col: [1, 1, 1] }); },
  // reeds 蘆葦 in the shallows by the bank: crossed cutout cards (foliage mesh)
  reeds(L, x, z, r, seed) { if (ARCH.lod === 2) return; const b = L.fol, R = RNG(seed), n = ARCH.lod ? 3 : 9, wy = -.6; b.s({ tex: 'reeds', col: [.95, 1, .85] });
    for (let k = 0; k < n; k++) { const a = R() * TAU, d = Math.sqrt(R()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = 1.3 + R() * .8, w = .9 + R() * .6, yaw = R() * PI;
      for (const q of [0, PI / 2]) { b.T(px, wy, pz, 0, yaw + q, 0); ARCH.card(b, -w / 2, 0, 0, w, h, [0, 0, 1, 1], true); b.pop(); } } b.s({ col: [1, 1, 1] }); },
  // pleasure boat 畫舫 / 龍舟: a lacquered hull with raised ends and a small roofed cabin, floating at the water line
  boat(L, x, z, yaw, o = {}) { if (ARCH.lod === 2) return; const b = L.mb, len = o.len || 9, w = 2.4, y = -.55; b.T(x, y, z, 0, yaw, 0);
    b.s({ tex: 'lacquer_red', col: [.9, .75, .7] }).box(0, .05, 0, w, .6, len * .7, { skip: ['top'] }); for (const sd of [-1, 1]) b.T(0, .05, sd * len * .35, sd * -.35, 0, 0).box(0, .15, sd * len * .1, w * .8, .5, len * .22).pop();
    b.s({ tex: 'plank', col: [.7, .55, .42] }).box(0, .36, 0, w - .2, .04, len * .7 - .2);
    if (o.cabin !== false) { b.s({ tex: 'vermilion', col: [1, 1, 1] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * .9, 1.3, sz * 1.6, .12, 1.9, .12); b.s({ tex: 'silk', col: [.95, .85, .6] }).box(0, 1.1, -1.6, 1.8, 1.4, .04).box(0, 1.1, 1.6, 1.8, 1.4, .04);
      const lv = ARCH.lod; ARCH.lod = 1; try { LOD.roof(b, 2.1, 3.6, 2.25, .45, 'xieshan'); } finally { ARCH.lod = lv; } }
    b.pop(); b.s({ col: [1, 1, 1] }); },
  // landing pier 碼頭 / 棧橋: a plank deck on posts from the bank into the water, a few steps down to the boats
  jetty(L, x, z, yaw, len = 10) { if (ARCH.lod === 2) return; const b = L.mb, F = ARCH.F(x, 0, z, yaw); b.T(x, 0, z, 0, yaw, 0);
    b.s({ tex: 'plank', col: [.72, .6, .48] }).box(0, .2, len / 2, 2.6, .12, len, { uv: [2, Math.round(len / 1.5)] }); b.s({ tex: 'dark_wood', col: [.7, .6, .5] }); for (let k = 1; k <= Math.floor(len / 2.5); k++) for (const sx of [-1, 1]) b.box(sx * 1.15, -.5, k * 2.5, .18, 1.5, .18, { skip: ['bot'] });
    if (!ARCH.lod) { for (const sx of [-1, 1]) { b.s({ tex: 'vermilion' }); for (let k = 0; k <= Math.floor(len / 2.5); k++) b.box(sx * 1.2, .7, k * 2.5 + .1, .1, .9, .1); b.box(sx * 1.2, 1.1, len / 2, .08, .08, len); } }
    b.pop(); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) { const p = F.p(0, 0, len / 2); L.world.box(p[0], .1, p[2], 1.3, .16, len / 2, { yaw, surface: 'wood' }); for (const sx of [-1, 1]) { const q = F.p(sx * 1.2, 0, len / 2); L.world.box(q[0], .7, q[2], .08, .6, len / 2, { yaw, surface: 'wood' }); } } },
  // the lake's water inside one chunk cell [x0, x0 + cs) x [z0, z0 + cs): horizontal strips cut by the outline (near: reaching a little past the
  // shore — the water lies below the ground there; LOD / far: kept inside the shore, as it lies just above the uncarved ground)
  lakeWater(L, lk, x0, z0, cs, o = {}) { const b = L.mb, wy = (o.y0 ?? 0) + (ARCH.lod ? .06 : -.55), st = ARCH.lod === 2 ? 6 : ARCH.lod ? 3 : 2, outer = !ARCH.lod;
    const P = lk._poly || (lk._poly = Array.from({ length: 160 }, (_, i) => lk.at(i / 160 * TAU)));
    const cuts = z => { const xs = []; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length]; if ((A[1] <= z) !== (B[1] <= z)) xs.push(A[0] + (z - A[1]) / (B[1] - A[1]) * (B[0] - A[0])); } xs.sort((p, q) => p - q); const out = []; for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]); return out; };
    b.s({ tex: 'water', col: [1.05, 1.16, 1.2], emi: .1 });
    for (let z = z0; z < z0 + cs - 1e-6; z += st) { const za = z, zb = Math.min(z + st, z0 + cs), A = cuts(za + 1e-3), B = cuts(zb - 1e-3), M = cuts((za + zb) / 2); // intervals at both edges and the middle of the strip
      for (const [m0, m1] of M) { const near = (I, c) => I.reduce((best, q) => (q[0] <= c && q[1] >= c) ? q : best, null), c = (m0 + m1) / 2, ia = near(A, c), ib = near(B, c);
        let u0 = m0, u1 = m1; if (outer) { if (ia) { u0 = Math.min(u0, ia[0]); u1 = Math.max(u1, ia[1]); } if (ib) { u0 = Math.min(u0, ib[0]); u1 = Math.max(u1, ib[1]); } u0 -= .5; u1 += .5; } else { if (!ia || !ib) continue; u0 = Math.max(m0, ia[0], ib[0]); u1 = Math.min(m1, ia[1], ib[1]); }
        u0 = Math.max(u0, x0); u1 = Math.min(u1, x0 + cs); if (u1 - u0 < .05) continue; ARCH.poly(b, [[u0, wy, za], [u1, wy, za], [u1, wy, zb], [u0, wy, zb]], [0, 1, 0], p => [p[0] / 6, p[2] / 6]);
        if (ARCH.lod) { // skirts on the cell's edges: where a near (lower, carved) cell meets this one, the step shows dark water, not a bright gap
          const sk = (a, c) => { b.s({ tex: 'water', col: [.5, .58, .5], emi: 0 }); for (const sg of [1, -1]) { const n = [c[2] - a[2], 0, a[0] - c[0]].map(v => v * sg); ARCH.poly(b, [[a[0], wy, a[2]], [c[0], wy, c[2]], [c[0], -.95, c[2]], [a[0], -.95, a[2]]], n, p => [(p[0] + p[2]) / 6, p[1] / 6]); } b.s({ tex: 'water', col: [1.05, 1.16, 1.2], emi: .1 }); };
          if (u0 <= x0 + 1e-6) sk([u0, 0, za], [u0, 0, zb]); if (u1 >= x0 + cs - 1e-6) sk([u1, 0, za], [u1, 0, zb]); if (za <= z0 + 1e-6) sk([u0, 0, za], [u1, 0, za]); if (zb >= z0 + cs - 1e-6) sk([u0, 0, zb], [u1, 0, zb]); } } }
    b.s({ emi: 0, col: [1, 1, 1] }); },
  lakeArc(L, lk, a0, a1, o = {}) { // the lake's edge between angles a0..a1 (one part): revetment + water fan + kerb
    const b = L.mb, n = Math.max(2, Math.ceil((a1 - a0) * Math.max(lk.rx, lk.rz) / 8)), wy = (o.y0 ?? 0) + (ARCH.lod ? .06 : -.55), far = ARCH.lod === 2, ctr = [lk.cx, wy, lk.cz]; // LOD1 / far: just above the uncarved ground
    for (let i = 0; i < n; i++) { const t0 = lerp(a0, a1, i / n), t1 = lerp(a0, a1, (i + 1) / n), A = lk.at(t0), B = lk.at(t1), yb = far ? wy : -1.4, yt = (o.y0 ?? 0) + .25;
      void ctr; if (far) continue; // (the water itself: PALK.lakeWater, one piece per 64 m chunk cell — a fan per arc spanned many chunks, so near and far versions mixed: seams and holes)
      const nx = (lk.cx - (A[0] + B[0]) / 2), nz = (lk.cz - (A[1] + B[1]) / 2); b.s({ tex: 'stone', col: [.92, .9, .86] }); ARCH.poly(b, [[A[0], yb, A[1]], [B[0], yb, B[1]], [B[0], yt, B[1]], [A[0], yt, A[1]]], [nx, 0, nz], p => [(p[0] + p[2]) / 3, -p[1] / 3]);
      const oA = [A[0] - nx / Math.hypot(nx, nz) * .8, A[1] - nz / Math.hypot(nx, nz) * .8], oB = [B[0] - nx / Math.hypot(nx, nz) * .8, B[1] - nz / Math.hypot(nx, nz) * .8]; ARCH.poly(b, [[A[0], yt, A[1]], [B[0], yt, B[1]], [oB[0], yt, oB[1]], [oA[0], yt, oA[1]]], [0, 1, 0], p => [p[0] / 2, p[2] / 2]);
      if (!ARCH.lod) { const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, len = Math.hypot(B[0] - A[0], B[1] - A[1]); L.world.box(mx, .5, mz, len / 2 + .2, .5, .2, { yaw: Math.atan2(-(B[1] - A[1]), B[0] - A[0]), surface: 'stone' }); } }
    b.s({ col: [1, 1, 1] }); },
};

// =====================================================================================
// plan context: parts (per chunk), far-only parts, walkways (nav), ground zones, lakes, people
// =====================================================================================
function PCTX(unit) {
  const C = { unit, parts: [], farOnly: [], streets: [], zones: [], lakes: [], cuts: [], people: [], gates: [], flats: [], R: RNG(hashS(unit.name)), seed: hashS(unit.name) & 0xffff };
  C.part = (x, z, fn, o = {}) => C.parts.push({ x, z, fn, ext: o.ext, build(L) { const i0 = L.mb.nv; PCOLL.run(L, fn, this); PALK.tintRoofs(L.mb, i0); }, far: o.far !== false, tag: o.tag, tree: !!o.tree, src: globalThis.__PAL_SRC ? new Error().stack.split('\n').slice(2, 4).map(l => l.replace(/.*palace\.js:/, '').replace(/\)$/, '')).join(' < ') : undefined }); // every palace roof (halls, gates, towers, galleries, wall copings) in the dark 青棍瓦 tone, at every LOD
  C.farPart = (x, z, fn) => C.farOnly.push({ x, z, build: fn });
  C.walk = (x0, z0, x1, z1, w = 6) => { const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z'; C.streets.push({ r: ax === 'x' ? rect(x0, z0 - w / 2, x1, z0 + w / 2) : rect(x0 - w / 2, z0, x0 + w / 2, z1), kind: 'palace', axis: ax }); };
  C.zone = (x0, z0, x1, z1, gc) => C.zones.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), gc]);
  // paved area in ≤ 64 m tiles (detail) + one slab far away
  C.pave = (x0, z0, x1, z1, o = {}) => { [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)]; C.zone(x0, z0, x1, z1, GC.PAVED); C.flats.push([x0, z0, x1, z1, (o.y ?? 0) + .055]); const nx = Math.ceil((x1 - x0) / 64), nz = Math.ceil((z1 - z0) / 64);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = lerp(x0, x1, i / nx), c = lerp(x0, x1, (i + 1) / nx), e = lerp(z0, z1, j / nz), f = lerp(z0, z1, (j + 1) / nz); C.part((a + c) / 2, (e + f) / 2, L => PALK.pave(L, a, e, c, f, o), { far: false, tag: 'flat' }); }
    C.farPart((x0 + x1) / 2, (z0 + z1) / 2, L => PALK.pave(L, x0, z0, x1, z1, Object.assign({}, o, { col: (o.col || [1.32, 1.27, 1.16]).map(v => v * 1.08) }))); }; // far: a little brighter (the courts read from the walls and towers)
  // stone road 御道 in ≤ 60 m pieces; it stops at the abutments of the bridges over channels (御溝: C.cuts with .bridge) — the bridge deck carries the way
  C.road = (x0, z0, x1, z1) => { [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)]; const ax = x1 - x0 > z1 - z0; let runs = [[ax ? x0 : z0, ax ? x1 : z1]];
    for (const c of C.cuts) { if (!c.r) continue; const m = c.bridge || 0, q = c.r; if (ax ? (q.z0 > z1 || q.z1 < z0) : (q.x0 > x1 || q.x1 < x0)) continue; const a = (ax ? q.x0 : q.z0) - m, b = (ax ? q.x1 : q.z1) + m;
      runs = runs.flatMap(([u, v]) => b <= u || a >= v ? [[u, v]] : [[u, Math.max(u, a)], [Math.min(v, b), v]].filter(([p, q2]) => q2 - p > .3)); }
    for (const [u, v] of runs) { const n = Math.max(1, Math.ceil((v - u) / 60)); for (let k = 0; k < n; k++) { const a = lerp(u, v, k / n), b = lerp(u, v, (k + 1) / n), q = ax ? [a, z0, b, z1] : [x0, a, x1, b]; C.flats.push([...q, .105]); C.part((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, L => PALK.road(L, ...q), { tag: 'flat' }); } } };
  // a stone walk (PALK.road) in pieces of ≤ 60 m, each its own part: collision is looked up only within ~40 m of a part's chunk
  C.strip = (x0, z0, x1, z1, o = {}) => { [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)]; const ax = x1 - x0 > z1 - z0, u = ax ? x0 : z0, v = ax ? x1 : z1, n = Math.max(1, Math.ceil((v - u) / 60));
    for (let k = 0; k < n; k++) { const a = lerp(u, v, k / n), b = lerp(u, v, (k + 1) / n), q = ax ? [a, z0, b, z1] : [x0, a, x1, b]; C.flats.push([...q, (o.y ?? 0) + .105]); C.part((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, L => PALK.road(L, ...q, o)); } };
  // wall run in parts of ≤ 60 m
  C.wallGaps = []; C.wallRuns = []; C.wallLines = []; C.wall = (x0, z0, x1, z1, o = {}, gaps = []) => { const len = Math.hypot(x1 - x0, z1 - z0); if (len < .5) return; const ux = (x1 - x0) / len, uz = (z1 - z0) / len; let u = 0; const runs = []; for (const [g0, g1] of gaps) if (g0 > 0 && g1 < len && (o.h || 8) > 2) C.wallGaps.push({ x: x0 + ux * (g0 + g1) / 2, z: z0 + uz * (g0 + g1) / 2, w: g1 - g0 }); // (low field walls may simply open)
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[len, len]])) { if (g0 - u > .5) runs.push([u, g0]); u = Math.max(u, g1); }
    for (const [a, c] of runs) C.wallLines.push({ ax: x0 + ux * a, az: z0 + uz * a, bx: x0 + ux * c, bz: z0 + uz * c, t: o.t || 6 });
    if (!(o.batter > 0)) for (const [a, c] of runs) C.wallRuns.push({ ax: x0 + ux * a, az: z0 + uz * a, bx: x0 + ux * c, bz: z0 + uz * c, h: o.h || 8, t: o.t || 6, col: o.col, ea: a > .5, eb: c < len - .5 });
    for (const [a, c] of runs) { const n = Math.max(1, Math.ceil((c - a) / 58)); for (let k = 0; k < n; k++) { const s0 = lerp(a, c, k / n), s1 = lerp(a, c, (k + 1) / n), q = [x0 + ux * s0, z0 + uz * s0, x0 + ux * s1, z0 + uz * s1], odd = (C._wk = (C._wk || 0) + 1) % 2, o2 = Object.assign({}, o, { t: (o.t || 6) + odd * .07, h: (o.h || 8) + odd * .05 }); C.part((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, L => PALK.wall(L, ...q, o2), { tag: 'wall' }); } } };
  // closed ring of walls (x0..x1, z0..z1 = centre lines); gaps: [[side 's'|'n'|'e'|'w', centre, width]]
  C.ring = (x0, z0, x1, z1, o = {}, gaps = []) => { const t2 = (o.t || 1.2) / 2, G = sd => gaps.filter(g => g[0] === sd);
    C.wall(x0 - t2, z1, x1 + t2, z1, o, G('s').map(g => [g[1] - g[2] / 2 - (x0 - t2), g[1] + g[2] / 2 - (x0 - t2)])); C.wall(x0 - t2, z0, x1 + t2, z0, o, G('n').map(g => [g[1] - g[2] / 2 - (x0 - t2), g[1] + g[2] / 2 - (x0 - t2)]));
    C.wall(x0, z0 + t2, x0, z1 - t2, o, G('w').map(g => [g[1] - g[2] / 2 - (z0 + t2), g[1] + g[2] / 2 - (z0 + t2)])); C.wall(x1, z0 + t2, x1, z1 - t2, o, G('e').map(g => [g[1] - g[2] / 2 - (z0 + t2), g[1] + g[2] / 2 - (z0 + t2)])); };
  // covered corridor run 廊 (pieces ≤ 46 m; odd pieces a little taller/wider so neighbouring roofs never share a plane); o.wall: walled side (+1 local front / -1 back)
  C.corrs = []; C.corr = (x0, z0, x1, z1, o = {}) => { const len = Math.hypot(x1 - x0, z1 - z0); if (len < 3) return; C.corrs.push({ x0, z0, x1, z1, w: o.w || 4.4 }); const n = Math.max(1, Math.ceil(len / 46)), base = C._ck = (C._ck || 0) + 1;
    for (let k = 0; k < n; k++) { const sh = .14 / len, odd = (k + base) % 2, a = k / n + (k && odd ? sh : 0), c = (k + 1) / n - (k < n - 1 && odd ? sh : 0), q = [lerp(x0, x1, a), lerp(z0, z1, a), lerp(x0, x1, c), lerp(z0, z1, c)]; // odd pieces stop 14 cm short of a joint: no shared gable plane
      C.part((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, L => ARCH.corridor(L, ...q, { y: o.y || 0, w: (o.w || 4.4) + odd * .2, colH: (o.colH || 3.6) + odd * .3, ph: (o.ph ?? .45) + odd * .06, m0: k ? 0 : (o.m0 ?? .4), m1: k < n - 1 ? 0 : (o.m1 ?? .4), paint: o.paint || 'ochre', wall: o.wall || 0, win: o.win, seed: base * 7 + k, brackets: 'simple' })); } };
  // 廊院 court: corridors round x0..x1 × z0..z1 (centre lines), walled outside; gates [[side, centre, width]] get a gate hall (o.gateHall) or a gap
  C.court = (x0, z0, x1, z1, o = {}, gates = []) => { const w = o.w || 4.4, e = w / 2 + .5, G = sd => gates.filter(g => g[0] === sd), run = (sd, a0, a1, fix, horiz, wall) => { let a = a0;
      for (const g of G(sd).sort((p, q) => p[1] - q[1])) { const g0 = g[1] - g[2] / 2, g1 = g[1] + g[2] / 2; if (g0 - a > 3) horiz ? C.corr(a, fix, g0, fix, Object.assign({}, o, { wall })) : C.corr(fix, a, fix, g0, Object.assign({}, o, { wall })); a = g1; }
      if (a1 - a > 3) horiz ? C.corr(a, fix, a1, fix, Object.assign({}, o, { wall })) : C.corr(fix, a, fix, a1, Object.assign({}, o, { wall })); };
    run('s', x0 - w / 2, x1 + w / 2, z1, true, 1); run('n', x0 - w / 2, x1 + w / 2, z0, true, -1); run('w', z0 + e, z1 - e, x0, false, 1); run('e', z0 + e, z1 - e, x1, false, -1);
    for (const g of gates) if (g[3]) { const [sd, at, gw, hall] = g, x = sd === 's' || sd === 'n' ? at : sd === 'e' ? x1 : x0, z = sd === 's' ? z1 : sd === 'n' ? z0 : at, yaw = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[sd];
      C.part(x, z, L => PALK.menHall(L, x, z, Object.assign({ yaw, bays: 3, bayW: gw / 3, dbayW: w * .75, colH: (o.colH || 3.6) + 1.2, ph: .5, pm: .8, seed: Math.round(x + z) }, hall === true ? {} : hall))); } };
  C.tree = (x, z, kind, s = 1, far = false) => { const sd = (C.R() * 1e6) | 0, zn = C.zones.filter(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]).pop(), pit = !!zn && zn[4] === GC.PAVED; C.part(x, z, L => { if (ARCH.lod === 1 && !far && (sd & 1)) { if (pit) PALK.tree(L, x, z, null, 0, 0, 0, true); return; } PALK.tree(L, x, z, kind, s * (ARCH.lod === 2 ? 1.3 : 1), sd, 0, pit); }, { far: true, tag: far ? undefined : 'small', tree: true }); }; // LOD1: every other minor tree // far: every tree in FAR1, the chosen ones in FAR2
  C.trees = (list, kind, s) => { for (const [x, z] of list) C.tree(x, z, kind, s); };
  C.lots = []; C.lot = (name, x0, z0, x1, z1, front = 's') => { if (name) C.lots.push({ r: rect(x0, z0, x1, z1), front, type: 'palace', wealth: 4, seed: hashS(name), name, big: true }); }; // named places: map labels and `warp`
  // 監門衛 guards in pairs on both sides of a gate (outside and inside), facing out / in; half = half the passage width, d = half the gate depth
  C.guardGate = (x, z, yaw, half = 4, d = 6) => { const F = ARCH.F(x, 0, z, yaw); for (const [sz, fy] of [[1, 0], [-1, PI]]) for (const sx of [-1, 1]) for (const k of [0, 1]) { const p = F.p(sx * (half + .9 + k * 1.1), 0, sz * (d + 4)); C.person('palaceguard', p[0], 0, p[2], yaw + fy, 'stand', null, { seed: (x * 7 + z * 3 + sx * 5 + k + sz * 11) | 0 }); } };
  C.person = (type, x, y, z, yaw, anim, hrs, o = {}) => C.people.push(Object.assign({ type, x, y, z, yaw, anim, h0: hrs ? hrs[0] : 0, h1: hrs ? hrs[1] : 24 }, o));
  return C;
}
// ---- a walled court of the inner palace (宮院) or an office (官署): gate hall, main hall, rear hall, side halls, trees, paving.
// r = outer rect; o.style 'gong' | 'office' | 'garden'; o.front 's'|'n'|'e'|'w'; o.name: plaque of the main hall; o.big
function YUAN(C, r, o = {}) {
  C.lot(o.name, r.x0, r.z0, r.x1, r.z1, o.front || 's'); const R = RNG(o.seed || ((r.x0 * 7 + r.z0 * 13) | 0)), st = o.style || 'gong', fr = o.front || 's', yaw = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[fr], horiz = fr === 's' || fr === 'n';
  const W = horiz ? rw(r) : rd(r), D = horiz ? rd(r) : rw(r), cx = rcx(r), cz = rcz(r), F = ARCH.F(cx, 0, cz, yaw), P = (lx, lz) => { const p = F.p(lx, 0, lz); return [p[0], p[2]]; };
  const t = st === 'office' ? 1 : 1.2, wh = st === 'office' ? 3.6 : 4.5, gw = Math.min(16, W * .2), foot = [];
  C.ring(r.x0 + t / 2, r.z0 + t / 2, r.x1 - t / 2, r.z1 - t / 2, { h: wh, t, col: st === 'office' ? [1.06, .99, .9] : PALK.RED }, [[fr, horiz ? cx : cz, gw + 1.5]]); // residence courts red-washed, offices white
  if (st === 'garden') C.zone(r.x0, r.z0, r.x1, r.z1, GC.GARDEN); else C.pave(r.x0 + t + .1, r.z0 + t + .1, r.x1 - t - .1, r.z1 - t - .1, { col: st === 'office' ? [1.26, 1.21, 1.1] : [1.32, 1.27, 1.16] });
  const g = P(0, D / 2 - t / 2); C.part(g[0], g[1], L => PALK.menHall(L, g[0], g[1], { yaw, bays: 3, bayW: gw / 3, dbayW: 3.6, colH: 4, ph: .45, pm: .7, seed: (R() * 1e5) | 0, tablet: o.gateTablet }));
  if (st === 'garden') { // 苑 / 園: a designed garden — cross walks of stone, flower beds (牡丹), fruit trees in rows, a pond with lotus and a pavilion, a 軒 at the back
    const wx = W / 2 - 6, wz = D / 2 - 6, pw = 2.6, kinds = [['peach', 'apricot'], ['apricot', 'jujube'], ['peach', 'peach'], ['willow', 'tong']][(R() * 4) | 0], pond = R() < .55 && W > 60 && D > 60;
    for (const [a, c, dy] of [[P(-pw / 2, D / 2 - 2), P(pw / 2, -D / 2 + 3), 0], [P(-wx, -pw / 2), P(wx, pw / 2), -.025]]) C.strip(a[0], a[1], c[0], c[1], { y: dy }); // cross walks
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) { const ox = qx * W / 4, oz = qz * D / 4;
      if (pond && qx > 0 && qz < 0) { const p = P(ox, oz); HAI(C, p[0], p[1], Math.min(W, D) * .16, Math.min(W, D) * .12, (R() * 1e5) | 0, { trees: 5, lotus: 1, piers: 0, boats: 0 }); const q = P(ox - W * .08, oz + D * .1); C.part(q[0], q[1], L => ARCH.pavilion(L, q[0], 0, q[1], { sides: 4, r: 2.4, colH: 2.9, platform: .5, paint: 'jade' })); continue; }
      if ((qx + qz + 2) % 4 === 0 || R() < .4) { const p = P(ox, oz), sd2 = (R() * 1e5) | 0, w2 = Math.min(W * .3, 18), d2 = Math.min(D * .25, 9); C.part(p[0], p[1], L => { if (!ARCH.lod) for (let k = -1; k <= 1; k += 2) ARCH.peonyBed(L, ...[P(ox, oz + k * (d2 / 2 + 1))].map(q => [q[0], q[1]])[0], w2, d2 * .7, yaw, sd2 + k); }); } // 牡丹 beds
      else { const nx2 = Math.max(2, Math.floor((W / 2 - 10) / 7)), nz2 = Math.max(2, Math.floor((D / 2 - 10) / 7)); for (let i = 0; i < nx2; i++) for (let j = 0; j < nz2; j++) { const lx = qx * (5 + i * 7), lz = qz * (5 + j * 7), p = P(lx, lz); C.tree(p[0], p[1], kinds[(i + j) % 2], 1 + R() * .15, (i + j) % 3 === 0); } } } // fruit trees in rows
    { const p = P(0, 0); C.part(p[0], p[1], L => ARCH.pavilion(L, p[0], 0, p[1], { sides: 6, r: 2.8, colH: 3, platform: .5, paint: 'jade' })); }
    { const p = P(0, -D / 2 + 9), sd2 = (R() * 1e5) | 0; C.part(p[0], p[1], L => PALK.dian(L, p[0], 0, p[1], { yaw, bays: 3, dbays: 2, bayW: 3.8, dbayW: 3.6, colH: 3.6, roof: 'xieshan', brackets: 'simple', platform: .5, pm: .8, paint: 'jade', cls: 0, lit: .3, seed: sd2, cw: false, lights: false, windows: 'all' })); } // 軒
    for (const [lx, lz] of [[-wx + 2, wz - 2], [wx - 2, wz - 2], [-wx + 2, -wz + 2], [wx - 2, -wz + 2]]) { const p = P(lx, lz); C.tree(p[0], p[1], 'pine', 1.15, true); }
    const g2 = P(0, 0); return { gate: g, F, W, D, main: { x: g2[0], z: g2[1], floor: .5, yaw } }; }
  const vH = .85 + R() * .3, vP = R(), mPh = o.big ? 1.2 : .5 + R() * .6, paint = st === 'gong' && R() < .4 ? 'jade' : 'ochre', mainB = clamp((W > 110 ? 7 : W > 70 ? 5 : 3) + (vP < .25 ? -2 : vP > .8 ? 2 : 0), 3, 9), bwm = clamp((W * (.38 + R() * .2)) / mainB, 3.6, 5.4), mW = mainB * bwm, mD = (st === 'office' ? 3 : 4) * 4.2, zMain = -D * .06, s1 = (R() * 1e5) | 0, hall = (lx, lz, yw, opt) => { const p = P(lx, lz), sd = (R() * 1e5) | 0; foot.push([lx, lz, opt.r || 10]); C.part(p[0], p[1], L => PALK.dian(L, p[0], 0, p[1], Object.assign({ yaw: yaw + yw, roof: 'xieshan', brackets: 'simple', platform: .5, pm: .8, paint, cls: 0, lit: .35, seed: sd, cw: false, lights: false }, opt))); };
  const role = o.role || (st === 'office' ? 'office' : st === 'gong' ? 'residence' : null), mDb = R() < .5 ? 3 : 4, mDw = 3.8 + R() * .8;
  hall(0, zMain, 0, { furnish: role ? null : 'hall', bays: mainB, dbays: mDb, bayW: bwm, dbayW: mDw, colH: (st === 'office' ? 4.4 : 5) * vH, roof: o.big || R() < .2 ? 'hip' : st === 'office' && R() < .2 ? 'gable' : 'xieshan', brackets: o.big || R() < .3 ? 'full' : 'simple', platform: mPh, pm: 1.4, cls: st === 'office' ? 1 : 3, lit: st === 'gong' ? .5 : .25, tablet: o.name && typeof TEX !== 'undefined' && TEX.L['pl_' + o.name] !== undefined ? 'pl_' + o.name : null, cw: o.big ? undefined : false, rail: !!o.big, lights: true, r: mW / 2 + 3 });
  // inner corridor court 廊院 from the gate to the main hall (bigger courts), side halls 配殿 inside it
  const ci = Math.min(W / 2 - 14, mW / 2 + 16), zf = D / 2 - t - 3;
  if (W >= 80 && D >= 90 && st !== 'garden') { const a = P(-ci, zf), c = P(-ci, zMain), e = P(ci, zf), f = P(ci, zMain), ga = P(-gw / 2 - 1.5, zf), gb = P(gw / 2 + 1.5, zf), aa = P(-ci - 2.2, zf), ee = P(ci + 2.2, zf);
    const a1 = P(-ci, zf - 2.3), e1 = P(ci, zf - 2.3); C.corr(...a1, ...c, { w: 3.6, colH: 3.3, m0: 0, m1: 0 }); C.corr(...e1, ...f, { w: 3.6, colH: 3.3, m0: 0, m1: 0 }); C.corr(...aa, ...ga, { w: 3.8, colH: 3.7, ph: .55, m0: 0, m1: 0 }); C.corr(...gb, ...ee, { w: 3.8, colH: 3.7, ph: .55, m0: 0, m1: 0 });
    const hm = P(-mW / 2 - 1, zMain), hc = P(-ci, zMain), hn = P(mW / 2 + 1, zMain), hd = P(ci, zMain); if (ci - mW / 2 > 5) { const hc2 = P(-ci + 2.1, zMain), hd2 = P(ci - 2.1, zMain); C.corr(...hc2, ...hm, { w: 3.4, colH: 3.0, ph: .38, m0: 0, m1: 0 }); C.corr(...hn, ...hd2, { w: 3.4, colH: 3.0, ph: .38, m0: 0, m1: 0 }); }
    if (D > 110) for (const sd of [-1, 1]) hall(sd * (ci - 9), (zf + zMain) / 2 + 4, -sd * PI / 2, { roof: R() < .4 ? 'gable' : 'xieshan', bays: R() < .5 ? 3 : 5, dbays: 2, bayW: 4, dbayW: 3.8, colH: 3.8, stairs: [{ side: 'f', at: 0, w: 3 }], r: 8 }); }
  else if (W > 60) for (const sd of [-1, 1]) hall(sd * (W / 2 - 11), D * .12, -sd * PI / 2, { furnish: 'room', bays: D > 90 ? 5 : 3, dbays: 2, bayW: 4, dbayW: 3.8, colH: 3.8, cls: st === 'office' ? 1 : 0, stairs: [{ side: 'f', at: 0, w: 3 }], r: 10 });
  if (D > 120 && st !== 'garden') hall(0, (zf + zMain) / 2 + 4, 0, { bays: Math.max(3, mainB - 2), dbays: 2, bayW: bwm, dbayW: 4, colH: 4.2, platform: .6, pm: .9, backDoor: true, cls: st === 'office' ? 1 : 3, stairs: [{ side: 'f', at: 0, w: 4 }, { side: 'b', at: 0, w: 4 }], r: 10 }); // 前廳
  // attendants' rows along the side walls, outside the inner court
  if (W >= 100 && st !== 'garden') for (const sd of [-1, 1]) { const len = Math.min(D * .5, 40), nb = Math.max(3, Math.round(len / 3.6)); hall(sd * (W / 2 - t - 4.6), D * .1, -sd * PI / 2, { bays: nb, dbays: 1, bayW: len / nb, dbayW: 5, colH: 3, roof: 'gable', brackets: 'none', platform: .3, pm: .4, paint: 'plain', cls: 0, lit: .2, stairs: [{ side: 'f', at: 0, w: 2.4 }], r: 6 }); }
  // bronze censers 香爐 before the main hall, side walks to the side halls
  if (W >= 70 && st !== 'garden') { for (const sd of [-1, 1]) { const p = P(sd * 5.5, zMain + mD / 2 + 4.5); C.part(p[0], p[1], L => PALK.censer(L, p[0], 0, p[1])); }
    const zw = D * .12, a = P(-(W / 2 - 16), zw - 1.2), c = P(W / 2 - 16, zw + 1.2); C.strip(a[0], a[1], c[0], c[1], { y: -.025 }); } // side walk 2.5 cm below the axis walk: no shared plane where they cross
  // the rear court: 寢殿 and two corner rooms
  const lou = st === 'gong' && D > 110 && W > 90 && R() < .38; if (lou) { const zr = -D / 2 + 17, p = P(0, zr), sd = (R() * 1e5) | 0, nb = Math.max(3, mainB - 2); foot.push([0, zr, nb * 2.3]); C.part(p[0], p[1], L => ARCH.lou2(L, p[0], 0, p[1], { yaw, bays: nb, dbays: 3, bayW: bwm * .9, dbayW: 3.8, colH1: 4.2, colH2: 3.6, storeys: 2, platform: .6, roof: 'xieshan', paint, seed: sd })); }
  if (D > 70 && !lou) { const zr = -D / 2 + 16; hall(0, zr, 0, { furnish: st === 'office' ? 'room' : 'rich', bays: Math.max(3, mainB - 2), dbays: 3, bayW: bwm * .92, dbayW: 3.8, colH: 4.2, platform: .6, pm: 1, r: 12 });
    if (W > 90) for (const sd of [-1, 1]) hall(sd * (W / 2 - 12), zr + 2, -sd * PI / 2, { bays: 3, dbays: 2, bayW: 3.8, dbayW: 3.6, colH: 3.4, stairs: [{ side: 'f', at: 0, w: 2.6 }], r: 7 }); }
  // trees: 槐 / 梧桐 / peach / pine in the free places; the path from the gate to the main hall
  const kinds = st === 'garden' ? ['peach', 'willow', 'apricot', 'pine', 'peach'] : st === 'office' ? ['huai', 'huai', 'pine', 'elm'] : ['tong', 'peach', 'pine', 'huai', 'apricot', 'willow'], nT = st === 'garden' ? 18 : Math.min(12, Math.round(W * D / 1500));
  // trees planted in rows: 宮槐 flanking the walk from the gate to the main hall (「宮槐」 in Tang court poetry), a 梧桐 / pine / fruit tree pair before the rear building
  { const zA0 = D / 2 - 9, zA1 = zMain + mD / 2 + 7, lx = gw / 2 + 5; for (let z = zA0, k = 0; z > zA1; z -= 9, k++) for (const sd of [-1, 1]) { const p = P(sd * lx, z); C.tree(p[0], p[1], st === 'office' ? 'huai' : (k % 2 ? 'huai' : kinds[0]), 1.05, k % 3 === 0); }
    if (D > 70) for (const sd of [-1, 1]) { const p = P(sd * Math.min(W * .22, 14), -D / 2 + 30); C.tree(p[0], p[1], kinds[1 + ((R() * (kinds.length - 1)) | 0)], 1.1, true); } }
  if (st === 'garden') { const p = P(0, 0); C.part(p[0], p[1], L => ARCH.pavilion(L, p[0], 0, p[1], { sides: 6, r: 2.8, colH: 3, platform: .5, paint: 'jade' })); }
  { const a = P(-2, D / 2 - 2), c = P(2, zMain + mD / 2 + 2); C.strip(a[0], a[1], c[0], c[1]); }
  // people: ladies in the court (on the paving, clear of the halls), a keeper outside the gate beside the gate hall's platform, an official inside the main hall
  const gk = P(gw / 2 + 2.6, D / 2 + 2.2); if (st === 'gong') { const p = P(5, D * .32), q = P(6.8, D * .32 + 1.2); C.person('palacelady', p[0], 0, p[1], yaw, 'talk', [8, 18]); C.person('maid', q[0], 0, q[1], yaw + PI, 'talk', [8, 18]); C.person('eunuch', gk[0], 0, gk[1], yaw, 'stand', [6, 21]); }
  if (st === 'office') C.person(role === 'guard' ? 'palaceguard' : 'man', gk[0], 0, gk[1], yaw, 'stand', role === 'guard' ? null : [7, 17]);
  if (role) INSIDE(C, P(0, zMain), yaw, mPh, mainB * bwm, mDb * mDw, role, o.seed || 1);
  const mp = P(0, zMain); return { gate: g, F, W, D, main: { x: mp[0], z: mp[1], floor: mPh, yaw } };
}

// ---- wall junction piers (墩): where palace / court wall runs end or meet (L corners, T and X joins, free ends), a square pier a little
// thicker and higher than the walls, red-washed over a brick plinth, with a hipped tile cap that receives the copings — no see-through
// gaps or clipped coping ends at the joins. Run ends at gate gaps (ea/eb false: the run continues into a gate) get no pier.
function PIERS(C) { const pts = [], R2 = C.wallRuns;
  for (const w of R2) { if (!w.ea || true) pts.push({ x: w.ax, z: w.az, w, end: !w.ea }); if (!w.eb || true) pts.push({ x: w.bx, z: w.bz, w, end: !w.eb }); }
  const used = new Set(), groups = [];
  for (let i = 0; i < pts.length; i++) { if (used.has(i)) continue; const p = pts[i], g = [p]; used.add(i); const r = p.w.t * 1.2 + .8;
    for (let j = i + 1; j < pts.length; j++) if (!used.has(j) && Math.hypot(pts[j].x - p.x, pts[j].z - p.z) < Math.max(r, pts[j].w.t * 1.2 + .8)) { g.push(pts[j]); used.add(j); }
    // a T: this end lies on another run's interior
    const onRun = R2.find(w => !g.some(q => q.w === w) && (() => { const dx = w.bx - w.ax, dz = w.bz - w.az, l2 = dx * dx + dz * dz; if (l2 < 1) return false; const t = ((p.x - w.ax) * dx + (p.z - w.az) * dz) / l2; if (t <= 0 || t >= 1) return false; return Math.hypot(w.ax + dx * t - p.x, w.az + dz * t - p.z) < w.t / 2 + .9; })());
    if (g.length === 1 && !g[0].end && !onRun) continue; // a run end at a gate gap: the gate meets it
    groups.push({ x: g.reduce((a, q) => a + q.x, 0) / g.length, z: g.reduce((a, q) => a + q.z, 0) / g.length, t: Math.max(...g.map(q => q.w.t), onRun ? onRun.t : 0), h: Math.max(...g.map(q => q.w.h), onRun ? onRun.h : 0), col: g[0].w.col }); }
  for (const q of groups) C.part(q.x, q.z, L => PALK.pier(L, q.x, q.z, q.t, q.h, q.col), { tag: 'wall' });
  C.piers = groups; }
// ---- collision reach. A part is built in the 64 m chunk that holds its (x, z), and the game's collision (MultiWorld.near) only looks at
// chunks within ~40 m of the query point: a solid reaching further than that past its part's chunk is not there for a player standing
// on its far end (the 含元殿 terrace fall-through). Parts with p.ext (a rect [x0, z0, x1, z1] or a radius) get collision clones: items in
// every other chunk the rect touches, which build the part with a throwaway mesh and keep only the solids (big boxes cut into ≤ 60 m
// tiles) whose centre lies in their own chunk; the part itself keeps those in its chunk (and any outside the clone chunks).
// PALACE.items emits the clones; TREEFILTER sets p.ext from the far-level extent of every part that reaches too far.
const PCOLL = {
  CH() { return (typeof CITY !== 'undefined' && CITY.CH) || 64; }, M: 39,
  far(x, z, x0, z0, x1, z1) { const CH = this.CH(), i = Math.floor(x / CH), j = Math.floor(z / CH); return x0 < i * CH - this.M || x1 > (i + 1) * CH + this.M || z0 < j * CH - this.M || z1 > (j + 1) * CH + this.M; },
  rect(p) { return typeof p.ext === 'number' ? [p.x - p.ext, p.z - p.ext, p.x + p.ext, p.z + p.ext] : p.ext; },
  chunks(p) { const CH = this.CH(), r = this.rect(p), out = []; for (let i = Math.floor(r[0] / CH); i <= Math.floor(r[2] / CH); i++) for (let j = Math.floor(r[1] / CH); j <= Math.floor(r[3] / CH); j++) out.push([i, j]); return out; },
  // copy the solids of src into dst, cutting big boxes; keep(cx, cz) decides per piece
  move(src, dst, keep) { const T = 30;
    for (const s of src.solids) { if (s.dynamic) continue;
      if (s.k === 0 && (s.hx > T || s.hz > T)) { const nx = Math.ceil(s.hx / T), nz = Math.ceil(s.hz / T), hx = s.hx / nx, hz = s.hz / nz;
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const lx = -s.hx + hx * (2 * a + 1), lz = -s.hz + hz * (2 * b + 1), cx = s.cx + s.c * lx + s.s * lz, cz = s.cz - s.s * lx + s.c * lz; if (!keep(cx, cz)) continue;
          const q = Object.assign({}, s, { cx, cz, hx, hz, br: Math.hypot(hx, hz) }); dst.solids.push(q); dst._index(q); } }
      else if (keep(s.cx, s.cz)) { dst.solids.push(s); dst._index(s); } } },
  run(L, fn, p) { if (!p.ext || ARCH.lod || !L.world || !L.world._index) { fn(L); return; }
    const CH = this.CH(), i = Math.floor(p.x / CH), j = Math.floor(p.z / CH), set = new Set(this.chunks(p).map(c => c[0] + ',' + c[1])), W = L.world, T = new World(); L.world = T;
    try { fn(L); } finally { L.world = W; }
    this.move(T, W, (x, z) => { const a = Math.floor(x / CH), b = Math.floor(z / CH); return (a === i && b === j) || !set.has(a + ',' + b); }); },
  clone(p, ci, cj) { const CH = this.CH(); return { x: (ci + .5) * CH, z: (cj + .5) * CH, clone: true, src: p.src, build: L => { if (ARCH.lod || !L.world || !L.world._index) return; const L2 = makeL(new World()); p.fn(L2); this.move(L2.world, L.world, (x, z) => Math.floor(x / CH) === ci && Math.floor(z / CH) === cj); } }; },
  clones(p) { if (!p.ext) return []; const CH = this.CH(), i = Math.floor(p.x / CH), j = Math.floor(p.z / CH); return this.chunks(p).filter(([a, b]) => a !== i || b !== j).map(([a, b]) => this.clone(p, a, b)); },
};
// ---- people placed at y 0 stand on whatever flat surface is drawn there (paving .055, stone roads .105; the highest wins)
function FLOORS(C) { for (const p of C.people) { if (p.y !== 0 || p.boat) continue; let y = 0; for (const f of C.flats) if (p.x >= f[0] && p.x <= f[2] && p.z >= f[1] && p.z <= f[3] && f[4] > y) y = f[4]; p.y = y; } }
// ---- keep every tree out of buildings: the XZ extents of each building part (built once at the far level) and a band along every wall
function TREEFILTER(C) { if (typeof makeL === 'undefined') return; const prev = ARCH.lod; ARCH.lod = 2; const B = [];
  try { for (const p of C.parts) { if (p.tree || p.tag === 'small' || p.tag === 'flat' || p.tag === 'wall') continue; const L = makeL(new World()); try { p.build(L); } catch (e) { continue; } const P = L.mb.P; if (!P.length) continue;
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < P.length; i += 3) { const x = P[i], z = P[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      if (!p.ext && PCOLL.far(p.x, p.z, x0 - 10, z0 - 10, x1 + 10, z1 + 10)) p.ext = [x0 - 14, z0 - 14, x1 + 14, z1 + 14]; // reaches past the collision query margin of its chunk: collision clones (PCOLL)
      if (p.tag === 'lake' || x1 - x0 > 400 || z1 - z0 > 400) continue; B.push([x0 - .8, z0 - .8, x1 + .8, z1 + .8]); } }
  finally { ARCH.lod = prev; }
  const cs = 50, H = new Map(), key = (i, j) => i * 100003 + j; for (const b of B) for (let i = Math.floor(b[0] / cs); i <= Math.floor(b[2] / cs); i++) for (let j = Math.floor(b[1] / cs); j <= Math.floor(b[3] / cs); j++) (H.get(key(i, j)) || H.set(key(i, j), []).get(key(i, j))).push(b);
  const inB = (x, z) => (H.get(key(Math.floor(x / cs), Math.floor(z / cs))) || []).some(b => x > b[0] && x < b[2] && z > b[1] && z < b[3]);
  const nearWall = (x, z) => C.wallLines.some(w => { const dx = w.bx - w.ax, dz = w.bz - w.az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - w.ax) * dx + (z - w.az) * dz) / l2, 0, 1); return Math.hypot(w.ax + dx * t - x, w.az + dz * t - z) < w.t / 2 + 2.2; });
  const before = C.parts.length; C.parts = C.parts.filter(p => !p.tree || (!inB(p.x, p.z) && !nearWall(p.x, p.z))); C.treesDropped = before - C.parts.length; }
// ---- trees on the open ground left between the courts (palace planting: 槐, 梧桐, pine, willow and fruit trees in the 內苑): a jittered grid,
// away from every building part, court paving, walkway, lake and the rects in `keep` (the great forecourt, the polo field)
function INFILL(C, A, o = {}) { const step = o.step || 30, R = RNG(o.seed || 7), H = new Map(), key = (i, j) => i * 100003 + j, cs = 40;
  for (const p of C.parts) { if (p.tag === 'small') continue; const k = key(Math.floor(p.x / cs), Math.floor(p.z / cs)); (H.get(k) || H.set(k, []).get(k)).push(p); }
  const near = (x, z, r) => { const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((z - r) / cs), j1 = Math.floor((z + r) / cs); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const p of H.get(key(i, j)) || []) if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) return true; return false; };
  const kinds = o.kinds || ['huai', 'tong', 'pine', 'willow', 'peach', 'huai', 'elm', 'apricot']; let n = 0;
  for (let z = A.z0 + step / 2; z < A.z1; z += step) for (let x = A.x0 + step / 2; x < A.x1; x += step) { const blk = hashS((Math.floor(x / 120) * 977 + Math.floor(z / 120)) + ':' + (o.seed || 7)), px = x, pz = z, kd = kinds[blk % kinds.length], s2 = 1.15 + R() * .15; /* planted groves: rows on a grid, one species per ~120 m block */
    if (C.inside && !C.inside(px, pz)) continue; if ((o.keep || []).some(q => inR(q, px, pz, 6))) continue; if (C.lakes.some(lk => lk.inside(px, pz, 10))) continue; if (C.streets.some(st => inR(st.r, px, pz, 3))) continue;
    if (C.zones.some(q => q[4] === GC.PAVED && px > q[0] - 4 && px < q[2] + 4 && pz > q[1] - 4 && pz < q[3] + 4)) continue; if (near(px, pz, o.clear || 20)) continue; C.tree(px, pz, kd, s2, (n++ % 3) === 0); }
  return n; }
// ---- a canal / 御溝 across a court (along x at z, from x0 to x1, width w), stone-lined, with slab bridges at bx[] (deck 0.35 m, parapets)
function GOU(C, x0, x1, z, w, bx, o = {}) {
  C.cuts.push({ r: rect(x0, z - w / 2, x1, z + w / 2), d: 1.5, bridge: 1.55 }); /* roads stop at the bridge ends (deck length w + 3) */ C.zone(x0, z - w / 2 - 1, x1, z + w / 2 + 1, GC.WATER);
  const n = Math.ceil((x1 - x0) / 56);
  for (let k = 0; k < n; k++) { const a = lerp(x0, x1, k / n), c = lerp(x0, x1, (k + 1) / n);
    C.part((a + c) / 2, z, L => { const b = L.mb, far = ARCH.lod === 2, wy = (far ? PALK.y((a + c) / 2, z) : 0) + (ARCH.lod ? .06 : -.6);
      b.s({ tex: 'water', col: [.8, .9, .95], emi: .04 }).box((a + c) / 2, wy, z, c - a, .02, w, { skip: ['bot'], world: 4 }); b.s({ emi: 0 }); if (far) return;
      b.s({ tex: 'stone', col: [.92, .9, .86] }); for (const sd of [-1, 1]) { b.box((a + c) / 2, -.6, z + sd * (w / 2 + .2), c - a, 1.6, .4, { world: 2, skip: ['bot'] }); }
      if (!ARCH.lod) for (const sd of [-1, 1]) { const gaps = bx.filter(q => q > a - 4 && q < c + 4).map(q => [q - 3.2, q + 3.2]).sort((p, q) => p[0] - q[0]); let u = a;
        for (const [g0, g1] of gaps.concat([[c, c]])) { if (g0 > u + .3) L.world.box((u + Math.min(g0, c)) / 2, .5, z + sd * (w / 2 + .2), (Math.min(g0, c) - u) / 2, .5, .2, { surface: 'stone' }); u = Math.max(u, g1); } } }, { far: true }); }
  for (const x of bx) C.part(x, z, L => { const b = L.mb, bw = o.bw || 6, L2 = w + 3; b.s({ tex: 'stone', col: [1, .98, .95] }).box(x, .12, z, bw, .3, L2, { world: 2, skip: ['bot'] }).box(x, -.7, z, bw - .6, 1.4, .8, { skip: ['bot', 'top'] });
    if (ARCH.lod !== 2) for (const sx of [-1, 1]) { b.box(x + sx * (bw / 2 - .15), .62, z, .3, .7, L2 - .2, { world: 1, skip: ['bot'] }); for (const sz of [-1, 1]) b.box(x + sx * (bw / 2 - .15), .62, z + sz * (L2 / 2 - .1), .4, 1.1, .4, { world: 1 }); }
    b.s({ col: [1, 1, 1] }); if (!ARCH.lod) { L.world.box(x, .12, z, bw / 2, .15, L2 / 2, { surface: 'stone' }); for (const sx of [-1, 1]) L.world.box(x + sx * (bw / 2 - .15), .62, z, .15, .5, L2 / 2, { surface: 'stone' }); } });
}
// ---- lake: water, revetment in arcs (parts), trees and pavilions on the shore
function HAI(C, cx, cz, rx, rz, seed, o = {}) {
  const lk = PALK.lakeShape(cx, cz, rx, rz, seed); C.lakes.push(lk); const n = Math.max(6, Math.ceil((rx + rz) * 2.2 / 50));
  for (let k = 0; k < n; k++) { const a0 = k / n * TAU, a1 = (k + 1) / n * TAU, p = lk.at((a0 + a1) / 2); let ex = [1e9, 1e9, -1e9, -1e9]; for (let t = 0; t <= 8; t++) { const q = lk.at(lerp(a0, a1, t / 8)); ex = [Math.min(ex[0], q[0]), Math.min(ex[1], q[1]), Math.max(ex[2], q[0]), Math.max(ex[3], q[1])]; } ex = [ex[0] - 16, ex[1] - 16, ex[2] + 16, ex[3] + 16];
      C.part(p[0], p[1], L => PALK.lakeArc(L, lk, a0, a1), { tag: 'lake', ext: PCOLL.far(p[0], p[1], ...ex) ? ex : undefined }); }
  { const CS = 64, m = 1.2; for (let i = Math.floor((cx - rx * m) / CS); i <= Math.floor((cx + rx * m) / CS); i++) for (let j = Math.floor((cz - rz * m) / CS); j <= Math.floor((cz + rz * m) / CS); j++) { const x0 = i * CS, z0 = j * CS; // the water, one piece per chunk cell (its part sits in that cell)
      C.part(x0 + CS / 2, z0 + CS / 2, L => PALK.lakeWater(L, lk, x0, z0, CS), { tag: 'lake' }); } }
  { const R2 = RNG(seed + 9), nl = o.lotus ?? Math.round((rx + rz) / 30); for (let i = 0; i < nl; i++) { const a = (i + R2() * .7) / nl * TAU, rr = lk.rad(a), d = 14 + R2() * Math.min(40, Math.min(rx, rz) * .35), x = cx + Math.cos(a) * (rx * rr - d), z = cz + Math.sin(a) * (rz * rr - d), r = 4 + R2() * 7, sd = (seed * 31 + i) | 0;
      if (C.cuts.some(c => c.island && Math.hypot(x - c.island[0], z - c.island[1]) < c.island[2] + r)) continue; C.part(x, z, L => PALK.lotus(L, x, z, r, sd), { tag: 'lake' }); } }
  { const R3 = RNG(seed + 13), nr = Math.round((rx + rz) / 18); for (let i = 0; i < nr; i++) { const a = R3() * TAU, rr = lk.rad(a), x = cx + Math.cos(a) * (rx * rr - 3 - R3() * 3), z = cz + Math.sin(a) * (rz * rr - 3 - R3() * 3), sd = (seed * 17 + i) | 0; C.part(x, z, L => PALK.reeds(L, x, z, 2 + R3() * 3, sd), { tag: 'lake' }); }
    const np = o.piers ?? Math.max(1, Math.round((rx + rz) / 160)); for (let i = 0; i < np; i++) { const a = (i + .35) / np * TAU + .4, rr = lk.rad(a), sx = cx + Math.cos(a) * (rx * rr + .6), sz = cz + Math.sin(a) * (rz * rr + .6), yaw = Math.atan2(cx - sx, cz - sz), L2 = 10, bx = sx + Math.sin(yaw) * (L2 + 2.5) + Math.cos(yaw) * 2.2, bz = sz + Math.cos(yaw) * (L2 + 2.5) - Math.sin(yaw) * 2.2;
      C.part(sx, sz, L => PALK.jetty(L, sx, sz, yaw, L2), { ext: L2 + 4 }); C.part(bx, bz, L => PALK.boat(L, bx, bz, yaw, { len: 8 + (i % 2) * 3 })); }
    const nb = o.boats ?? Math.round((rx + rz) / 200); for (let i = 0; i < nb; i++) { const a = R3() * TAU, d = .45 + R3() * .25, x = cx + Math.cos(a) * rx * d, z = cz + Math.sin(a) * rz * d, yaw = R3() * TAU; if (C.cuts.some(c => c.island && Math.hypot(x - c.island[0], z - c.island[1]) < c.island[2] + 8)) continue; C.part(x, z, L => PALK.boat(L, x, z, yaw, { len: 10, cabin: i % 3 !== 2 })); } }
  const R = RNG(seed + 5); for (let i = 0; i < (o.trees ?? n * 2); i++) { const a = (i + R() * .6) / (o.trees ?? n * 2) * TAU, r = lk.rad(a), e = 6 + R() * 7, x = cx + Math.cos(a) * (rx * r + e), z = cz + Math.sin(a) * (rz * r + e); if (o.skip && o.skip(x, z)) continue; C.tree(x, z, i % 3 ? 'willow' : (i % 2 ? 'peach' : 'willow'), 1.1 + R() * .25, i % 4 === 0); }
  return lk;
}

// =====================================================================================
// 大明宮 (東內) — the seat of court in 815. Plan after the excavations (馬得志 1959–61; 中國社科院考古所 1990s–2000s) and
// 傅熹年 / 楊鴻勛's reconstructions of 含元殿 and 麟德殿; positions of minor courts plausible (see PALACE.md).
// =====================================================================================
function PLAN_DAMING(C) {
  const d = rect(...PLAN.daming), cx = 2014, zf = d.z1, T = 10.5, x0 = d.x0, x1 = d.x1, xn = d.x0 + 1135, R = C.R;
  C.cx = cx; C.zf = zf;
  // ---- outer wall (trapezoid narrowing north; the east wall's jog as one diagonal), gates
  const pts = [[x0 + T / 2, zf - T / 2], [x1 - T / 2, zf - T / 2], [x1 - T / 2, -5450], [xn - T / 2, -6000], [xn - T / 2, d.z0 + T / 2], [x0 + T / 2, d.z0 + T / 2]];
  C.poly = pts; const inside = (x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], q = pts[j]; if ((a[1] > z) !== (q[1] > z) && x < (q[0] - a[0]) * (z - a[1]) / (q[1] - a[1]) + a[0]) c = !c; } return c; }; C.inside = inside;
  const G = [{ i: 0, x: cx, w: 75, name: '丹鳳門' }, { i: 0, x: cx - 430, w: 34, name: '建福門' }, { i: 0, x: cx + 430, w: 34, name: '望仙門' }, { i: 5, z: -5640, w: 30, name: '右銀臺門' }, { i: 5, z: -5900, w: 30, name: '九仙門' }, { i: 1, z: -5300, w: 30, name: '左銀臺門' }, { i: 4, x: cx, w: 36, name: '玄武門' }];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]), ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
    const gaps = G.filter(g => g.i === i).map(g => { const u = g.x !== undefined ? (g.x - a[0]) / ux : (g.z - a[1]) / uz; return [u - g.w / 2, u + g.w / 2]; });
    C.wall(a[0] - ux * T / 2, a[1] - uz * T / 2, c[0] + ux * T / 2, c[1] + uz * T / 2, { h: 9.5, t: T, tex: 'rammed_earth', batter: .1 }, gaps.map(([p, q]) => [p + T / 2, q + T / 2])); }
  for (const g of G) { const side = g.i === 0 ? 's' : g.i === 1 ? 'e' : g.i === 5 ? 'w' : 'n', gx = g.x ?? (side === 'w' ? x0 + T / 2 : x1 - T / 2), gz = g.z ?? (side === 's' ? zf - T / 2 : d.z0 + T / 2), yaw = { s: 0, n: PI, e: PI / 2, w: -PI / 2 }[side], big = g.name === '丹鳳門';
    C.part(gx, gz, L => ARCH.gateTower(L, gx, 0, gz, big ? { yaw, w: 74.5, d: 33, h: 9.5, passages: 5, pw: 8.5, ph: 7.4, pier: 4, open: true, tablet: 'gt_丹鳳門', tower: { bays: 11, dbays: 3, bayW: 5.6, dbayW: 5, colH: 6.2, roof: 'hip', brackets: 'full', railing: true, platform: .6, pm: 1.6, paint: 'ochre' } }
      : { yaw, w: g.w + 6, d: 15, h: 9.5, passages: g.name === '玄武門' ? 3 : 1, pw: 6, ph: 6.5, open: true, tablet: PALK.gtex(g.name), tower: { bays: 5, dbays: 2, bayW: 4.8, dbayW: 4.4, colH: 5, roof: 'hip', brackets: 'full', railing: true } }));
    C.gates.push({ x: gx, z: side === 's' ? zf - .2 : gz, side, link: side === 's', name: g.name }); C.guardGate(gx, gz, yaw, big ? 20 : 4, big ? 17 : 8);
    if (side === 's') for (const sd of [-1, 1]) { const rx = gx + sd * (g.w / 2 + (big ? 6 : 3)), rz = gz - (big ? 22 : 12); C.part(rx, rz, L => PALK.jiRack(L, rx, rz, PI, big ? 12 : 8)); C.person('palaceguard', rx, 0, rz - 2.5, PI, 'stand', null); C.person('palaceguard', gx + sd * (big ? 10 : 5), 0, gz - (big ? 20 : 11), PI, 'stand', null); } }
  for (const [px, pz] of pts) C.part(px, pz, L => PALK.jiaolou(L, px, pz, 9.5, { s: 16 })); // corner towers
  GOU(C, x0 + 12, x1 - 12, -4640, 6, [cx, cx - 52, cx + 52, cx - 430, cx + 430]);
  C.zone(d.x0, d.z0, d.x1, d.z1, GC.YARD);
  // ---- 含元殿 (大朝 on 元日 / 冬至) on its three-tier terrace, 龍尾道, 翔鸞閣 / 棲鳳閣 with 飛廊, 東西朝堂
  const hz = -4936, tiers = [{ w: 200, d: 110, h: 5.5, dz: 15, stairs: [{ side: 'n', at: 0, w: 8 }], open: [['s', -26, 9], ['s', 26, 9]] },
    { w: 130, d: 76, h: 4.5, dz: 6, stairs: [{ side: 's', at: 0, w: 11 }, { side: 's', at: -17, w: 7 }, { side: 's', at: 17, w: 7 }, { side: 'n', at: 0, w: 7 }], open: [['e', -4, 6.5], ['w', -4, 6.5]] },
    { w: 78, d: 44, h: 3.0, dz: 0, stairs: [{ side: 's', at: 0, w: 9 }, { side: 's', at: -21, w: 5 }, { side: 's', at: 21, w: 5 }, { side: 'n', at: 0, w: 6 }] }];
  const yH = 13; C.yHan = yH; C.hz = hz;
  // terrace in parts: tier 0 split into strips (it is 200 m wide), tiers 1–2 and the hall
  C.part(cx, hz + 15, L => PALK.terrace(L, cx, 0, hz, [tiers[0]]));
  C.part(cx, hz + 6, L => PALK.terrace(L, cx, 5.5, hz, [tiers[1]]));
  C.part(cx, hz, L => PALK.terrace(L, cx, 10, hz, [tiers[2]]));
  C.part(cx, hz - 1, L => { const h = PALK.dian(L, cx, yH, hz, { bays: 13, dbays: 6, bayW: [4.4, 5.3, 5.3, 5.3, 5.3, 5.3, 5.5, 5.3, 5.3, 5.3, 5.3, 5.3, 4.4], dbayW: [4.4, 4.85, 4.85, 4.85, 4.85, 4.4], colH: 6.2, colH2: 5.6, fujie: true, roof: 'hip', cls: 3, lit: .6, lamp: 2, seed: 11, tablet: 'pl_含元殿', tabletW: 1.4, tabletH: 2.8 });
    PALK.throne(L, cx, h.floor, hz - 6.5, 0, { s: 1.1 }); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) PALK.flag(L, cx + sx * (9 + k * 4), hz + 11.5, { y: h.floor, h: 6, col: [[.85, .25, .2], [.25, .4, .7], [.86, .7, .3]][k] }); });
  // 龍尾道: three ramps from the plaza to the first tier (the centre one the 御道), flights above (in the tiers)
  const zT0 = hz + 15 + 55;
  for (const sx of [-1, 1]) C.part(cx + sx * 26, zT0 + 23, L => PALK.ramp(L, cx + sx * 26, zT0 + 46, zT0, 8, 0, 5.5));
  // the 御道 runs north to the terrace foot and forks east and west to the two 龍尾道 (paving + walkways)
  C.walk(cx, zf, cx, zT0 + 62, 12); C.walk(cx - 34, zT0 + 62, cx + 34, zT0 + 62, 8); for (const sx of [-1, 1]) C.walk(cx + sx * 26, zT0 + 62, cx + sx * 26, zT0 + 47, 7);
  C.road(cx - 6, zf - 30, cx + 6, zT0 + 66); C.road(cx - 30, zT0 + 58, cx + 30, zT0 + 66); for (const sx of [-1, 1]) C.road(cx + sx * 26 - 4, zT0 + 46, cx + sx * 26 + 4, zT0 + 58);
  // 闕 and 飛廊 (翔鸞閣 east, 棲鳳閣 west)
  for (const sd of [1, -1]) { const qx = cx + sd * 128, qz = hz + 108, zA = hz - 4;
    C.part(qx + sd * 10, qz, L => { PALK.que(L, qx, qz, { sd, h: 10, seed: sd > 0 ? 21 : 23 }); if (!ARCH.lod) { const b = L.mb; b.T(qx, 8, qz + 8.6); void b; b.pop(); } });
    C.part(cx + sd * 87, zA, L => PALK.feilang(L, cx + sd * 65, zA, qx - sd * 11.25, zA, 10, { seed: 31 + sd }));
    C.part(qx, zA, L => { PALK.terrace(L, qx, 0, zA, [{ w: 22.5, d: 17, h: 10, open: [[sd > 0 ? 'w' : 'e', 0, 6.5], ['s', 0, 6.5]] }], { chishou: false }); ARCH.lou2(L, qx, 10, zA, { bays: 5, dbays: 3, bayW: 3.6, dbayW: 3.8, colH1: 4.4, colH2: 3.6, storeys: 2, platform: .3, roof: 'xieshan', seed: 37 + sd, door: 2 }); });
    C.part(qx, (zA + 8.5 + qz - 8) / 2, L => PALK.feilang(L, qx, zA + 8.5, qx, qz - 8, 10, { seed: 33 + sd, w: 5.5 }));
    C.person('palaceguard', qx - sd * 2, 10, qz + 6.5, 0, 'stand', null); }
  // 東西朝堂 (肺石 east, 登聞鼓 west (?)), 金吾仗院 left and right, guards along the 御道 at dawn
  for (const sd of [-1, 1]) { const x = cx + sd * 122, z = hz + 108 + 8 + 30 + 34; C.part(x, z, L => { PALK.dian(L, x, 0, z, { yaw: -sd * PI / 2, bays: 13, dbays: 3, bayW: 5.2, dbayW: 5.2, colH: 4.8, roof: 'xieshan', brackets: 'simple', platform: .9, pm: 1.2, cls: 1, lit: .2, seed: 40 + sd, cw: false, windows: true, doors: [5, 6, 7] });
      if (!ARCH.lod) { const b = L.mb, fx = x - sd * 9, fz = z + 26; if (sd > 0) { b.s({ tex: 'stone', col: [.62, .55, .55] }).T(fx, 0, fz).lathe([[0, 0], [.9, 0], [1, .5], [.7, 1.4], [0, 1.6]], { seg: 7 }).pop(); } else { b.T(fx, 0, fz); PROPS.drum(b, 1.4); b.pop(); } } }); }
  for (const sd of [-1, 1]) YUAN(C, rect(cx + sd * 290 - 50, -4788, cx + sd * 290 + 50, -4688), { style: 'office', front: sd < 0 ? 'e' : 'w', seed: 50 + sd });
  // 御溝 across the plaza, 下馬橋 on the axis and two side bridges
  C.walk(cx - 300, -4800 - 12, cx + 300, -4800 - 12, 8);
  for (const sd of [-1, 1]) { const gx = cx + sd * 430; C.walk(gx, zf, gx, -4675.5, 6); C.walk(Math.min(gx, cx), -4675.5, Math.max(gx, cx), -4675.5, 6); }
  for (const sd of [-1, 1]) { C.walk(cx + sd * 200, -4812, cx + sd * 200, -5104, 6); C.walk(cx + sd * 200, -5104, cx + sd * 200, -5336, 6); }
  // ---- the forecourt: the 1st inner wall (~120 m S of the 含元殿 front [何歲利 2019]) closes the 含元殿 precinct (side walls up to wall A),
  // with a gate on the axis and two side gates; 儀仗 banner lines and halberd racks along the 御道, 槐 rows along the court's sides
  { const z1w = -4797, xa = cx - 330, xb = cx + 330, wl1 = { h: 6, t: 2.4 };
    C.wall(xa, z1w, xb, z1w, wl1, [[330 - 18, 330 + 18], [130 - 8, 130 + 8], [530 - 8, 530 + 8]]); for (const xx of [xa, xb]) { C.wall(xx, z1w - 1.2, xx, -5100 + 1.5, wl1, [[150, 166]]); const gz = z1w - 1.2 - 158; C.part(xx, gz, L => PALK.menHall(L, xx, gz, { yaw: xx < cx ? -PI / 2 : PI / 2, bays: 3, bayW: 4.4, dbayW: 3.6, colH: 4.2, pass: 1, ph: .4, pm: .7, seed: 57 + (xx | 0) })); } // side gates of the 含元殿 precinct
    C.part(cx, z1w, L => PALK.menHall(L, cx, z1w, { bays: 7, bayW: 4.8, dbayW: 4.4, colH: 5, pass: 1, ph: .42, pm: 1.2, seed: 58 })); for (const gx of [cx - 200, cx + 200]) C.part(gx, z1w, L => PALK.menHall(L, gx, z1w, { bays: 3, bayW: 5, dbayW: 4, colH: 4.2, pass: 1, ph: .4, seed: 59 + gx }));
    for (const sd of [-1, 1]) { C.walk(cx + sd * 200, z1w + 30, cx + sd * 200, -4812, 6); for (let z = -4360; z > z1w + 40; z -= 28) { const x = cx + sd * 13, zz = z; if (Math.abs(zz + 4640) < 12) continue; C.part(x, zz, L => PALK.flagLine(L, x, zz, (zz | 0) & 3)); }
      for (let z = -4370; z > z1w + 20; z -= 13) { if (Math.abs(z + 4640) < 10) continue; C.tree(cx + sd * 318, z, 'huai', 1.2, (z | 0) % 39 === 0); } } }
  // ---- wall A (宣政門 line) and the 中朝: 宣政殿 court with 日華門 / 月華門, 中書省 (W) and 門下省 (E), other offices
  const zA = -5100, zB = -5330, wl = { h: 7, t: 3 };
  C.wall(x0 + T, zA, x1 - T, zA, wl, [[cx - 20 - (x0 + T), cx + 20 - (x0 + T)], [cx - 211 - (x0 + T), cx - 189 - (x0 + T)], [cx + 189 - (x0 + T), cx + 211 - (x0 + T)], [1300 - 11 - (x0 + T), 1300 + 11 - (x0 + T)], [2700 - 11 - (x0 + T), 2700 + 11 - (x0 + T)]]);
  for (const [gx, hw] of [[cx, 9], [cx - 200, 4], [cx + 200, 4]]) { C.guardGate(gx, zA, 0, hw, 4.5); C.guardGate(gx, zB, 0, hw, 4.5); C.guardGate(gx, -4797, 0, hw, 4.5); }
  C.part(cx, zA, L => PALK.menHall(L, cx, zA, { bays: 7, bayW: 5.2, dbayW: 5, colH: 5.6, pass: 1, ph: 1.4, pm: 1.6, tablet: 'pl_宣政門', seed: 61 }));
  for (const gx of [cx - 200, cx + 200, 1300, 2700]) C.part(gx, zA, L => PALK.menHall(L, gx, zA, { bays: 3, bayW: 6.4, dbayW: 4.4, colH: 4.6, pass: 1, ph: .4, pm: 1, seed: 62 + gx }));
  C.wall(x0 + T, zB, x1 - T, zB, wl, [[cx - 16 - (x0 + T), cx + 16 - (x0 + T)], [cx - 211 - (x0 + T), cx - 189 - (x0 + T)], [cx + 189 - (x0 + T), cx + 211 - (x0 + T)], [1300 - 11 - (x0 + T), 1300 + 11 - (x0 + T)], [2700 - 11 - (x0 + T), 2700 + 11 - (x0 + T)]]);
  C.part(cx, zB, L => PALK.menHall(L, cx, zB, { bays: 5, bayW: 5.6, dbayW: 4.8, colH: 5.2, pass: 0, ph: 1.2, pm: 1.4, tablet: 'pl_紫宸門', seed: 71 }));
  for (const gx of [cx - 200, cx + 200, 1300, 2700]) C.part(gx, zB, L => PALK.menHall(L, gx, zB, { bays: 3, bayW: 6.4, dbayW: 4.4, colH: 4.6, pass: 1, ph: .4, pm: 1, seed: 72 + gx }));
  // 宣政 court: corridors east and west (日華門 / 月華門), paved, 宣政殿 on a two-tier terrace
  for (const sd of [-1, 1]) C.corr(cx + sd * 150, zA - 3, cx + sd * 150, -5168.5, { w: 4.6, colH: 3.8, wall: sd < 0 ? 1 : -1, win: true }), C.corr(cx + sd * 150, -5183.5, cx + sd * 150, zB + 3, { w: 4.6, colH: 3.8, wall: sd < 0 ? 1 : -1, win: true });
  for (const sd of [-1, 1]) { const gx = cx + sd * 150, nm = sd > 0 ? '日華門' : '月華門'; C.part(gx, -5176, L => PALK.menHall(L, gx, -5176, { yaw: sd * PI / 2, bays: 3, bayW: 4.2, dbayW: 4.6, colH: 4.6, pass: 1, ph: .4, pm: .8, tablet: 'pl_' + nm, seed: 80 + sd })); C.walk(gx - sd * 40, -5176, gx + sd * 50, -5176, 5); }
  C.pave(cx - 147, zB + 2, cx + 147, zA - 2); /* inside the court walls (zA south, zB north) */ C.road(cx - 5, zA + 8, cx + 5, -5272);
  const hz2 = -5245; C.part(cx, hz2, L => { const tops = PALK.terrace(L, cx, 0, hz2, [{ w: 80, d: 46, h: 2.2, stairs: [{ side: 's', at: 0, w: 9 }, { side: 's', at: -24, w: 5 }, { side: 's', at: 24, w: 5 }, { side: 'n', at: 0, w: 6 }] }, { w: 66, d: 34, h: 1.0, stairs: [{ side: 's', at: 0, w: 8 }, { side: 'n', at: 0, w: 5 }] }]);
    const h = PALK.dian(L, cx, tops[1], hz2, { bays: 11, dbays: 5, bayW: [4.6, 4.8, 5, 5, 5.2, 5.6, 5.2, 5, 5, 4.8, 4.6], dbayW: 5, colH: 6.2, roof: 'hip', cls: 3, lit: .5, seed: 12, tablet: 'pl_宣政殿', tabletW: 1.2, tabletH: 2.4 });
    PALK.throne(L, cx, h.floor, hz2 - 6, 0); });
  C.yXuan = 3.2; C.hz2 = hz2;
  for (const sd of [-1, 1]) for (const k of [0, 1]) { const x = cx + sd * (100 + k * 18), z = -5130; C.tree(x, z, 'huai', 1.25); } // 宮槐 by the gate
  YUAN(C, rect(1652, -5305, 1802, -5130), { style: 'office', front: 'e', name: '中書省', seed: 91, big: true }); YUAN(C, rect(2226, -5305, 2376, -5130), { style: 'office', front: 'w', name: '門下省', seed: 92, big: true });
  YUAN(C, rect(1420, -5305, 1640, -5135), { style: 'office', front: 'e', seed: 93 }); YUAN(C, rect(2390, -5305, 2610, -5135), { style: 'office', front: 'w', seed: 94 });
  YUAN(C, rect(1205, -5305, 1395, -5135), { style: 'office', front: 'e', seed: 95 }); YUAN(C, rect(2625, -5288, 2835, -5135), { style: 'office', front: 'w', seed: 96 }); // clear of the 左銀臺門 passage
  C.walk(x0 + 20, -5318, cx - 156, -5318, 5); C.walk(cx + 156, -5318, x1 - 20, -5318, 5); // outside the 宣政 court
  // ---- 內廷: 紫宸殿 court, 延英殿, 清思殿, 蓬萊殿, 太液池 with 蓬萊山, 含涼殿, 麟德殿, 三清殿, 翰林院, residence courts
  const zP = -5520; for (const sd of [-1, 1]) C.corr(cx + sd * 112, zB - 3, cx + sd * 112, zP + 2.7, { w: 4.4, colH: 3.6, wall: sd < 0 ? 1 : -1 });
  C.corr(cx - 112 - 2.2, zP, cx - 12, zP, { w: 4.4, colH: 3.6, wall: -1 }); C.corr(cx + 12, zP, cx + 112 + 2.2, zP, { w: 4.4, colH: 3.6, wall: -1 });
  C.part(cx, zP, L => PALK.menHall(L, cx, zP, { yaw: PI, bays: 3, bayW: 7, dbayW: 4.2, colH: 4.4, pass: 1, ph: .5, pm: .8, seed: 75 }));
  C.pave(cx - 110, zP + 2, cx + 110, zB - 2); const hz3 = -5440;
  C.part(cx, hz3, L => { const tops = PALK.terrace(L, cx, 0, hz3, [{ w: 64, d: 40, h: 2.4, stairs: [{ side: 's', at: 0, w: 8 }, { side: 's', at: -20, w: 4.5 }, { side: 's', at: 20, w: 4.5 }, { side: 'n', at: 0, w: 5 }] }]);
    const h = PALK.dian(L, cx, tops[0], hz3, { bays: 9, dbays: 5, bayW: [4.6, 5, 5.2, 5.4, 5.8, 5.4, 5.2, 5, 4.6], dbayW: [4.6, 5, 5.2, 5, 4.6], colH: 5.6, colH2: 4.4, fujie: true, roof: 'hip', cls: 3, lit: .6, seed: 13, tablet: 'pl_紫宸殿', tabletW: 1.2, tabletH: 2.4 });
    PALK.throne(L, cx, h.floor, hz3 - 4.5, 0); });
  C.yZi = 2.4; C.hz3 = hz3;
  C.yanying = YUAN(C, rect(1760, -5505, 1874, -5372), { style: 'gong', front: 'e', name: '延英殿', seed: 101, big: true, role: 'audience' }); YUAN(C, rect(2154, -5505, 2300, -5372), { style: 'gong', front: 'w', name: '清思殿', seed: 102, big: true });
  YUAN(C, rect(1430, -5500, 1740, -5370), { style: 'gong', front: 's', seed: 103 }); YUAN(C, rect(2320, -5500, 2600, -5370), { style: 'gong', front: 's', seed: 104 });
  YUAN(C, rect(2620, -5440, 2830, -5345), { style: 'gong', front: 'w', seed: 105 });
  C.hanlin = YUAN(C, rect(1212, -5700, 1305, -5580), { style: 'office', front: 'e', name: '翰林院', seed: 106 }); YUAN(C, rect(1205, -5480, 1400, -5345), { style: 'office', front: 'e', name: '少陽院', seed: 107 }); C.yHan2 = 0;
  C.walk(1220, -5540, 2560, -5540, 6); C.walk(1176, -5640, 1199, -5640, 5); C.walk(1199, -5640, 1199, -5540, 5); C.walk(1199, -5540, 1220, -5540, 5); /* from 右銀臺門, past the 翰林院 */ for (const sd of [-1, 1]) { const xw = cx + sd * 127; C.walk(cx + sd * 200, -5336, cx + sd * 200, -5348, 5); C.walk(Math.min(xw, cx + sd * 200), -5348, Math.max(xw, cx + sd * 200), -5348, 5); C.walk(xw, -5348, xw, -5540, 4); } C.walk(1720, -5540, 1720, -6090, 5);
  // 蓬萊殿 facing the lake garden
  const hz4 = -5562; C.part(cx, hz4, L => { const tops = PALK.terrace(L, cx, 0, hz4, [{ w: 56, d: 30, h: 1.6, stairs: [{ side: 's', at: 0, w: 7 }, { side: 'n', at: 0, w: 7 }] }]); PALK.dian(L, cx, tops[0], hz4, { bays: 9, dbays: 4, bayW: 4.8, dbayW: 4.6, colH: 5.2, roof: 'hip', cls: 3, lit: .6, seed: 14, tablet: 'pl_蓬萊殿', backDoor: true }); });
  for (const sd of [-1, 1]) { C.tree(cx + sd * 40, -5536, 'tong', 1.2); C.tree(cx + sd * 50, -5598, 'pine', 1.2); }
  // 太液池 (west pool, 蓬萊山 island) and the small east pool; 迴廊 along the south shore; 含涼殿 on the north shore
  C.cuts.push({ island: [2075, -5830, 40] }); const lkW = HAI(C, 2030, -5815, 242, 136, 61, { skip: (x, z) => z > -5660 && Math.abs(x - cx) < 40 }), lkE = HAI(C, 2370, -5760, 55, 38, 62);
  C.zone(1770, -5990, 2290, -5640, GC.GARDEN); C.zone(2270, -5830, 2420, -5715, GC.GARDEN);
  C.corr(1840, -5994, 1990, -5994, { w: 4.2, colH: 3.4 }); C.corr(2070, -5994, 2230, -5994, { w: 4.2, colH: 3.4 }); // 迴廊 (part of the 400-bay gallery)
  C.walk(1760, -5600, 2300, -5600, 4); C.walk(1760, -5600, 1760, -5545, 5); C.walk(2300, -5600, 2300, -5545, 5);
  { const ix = 2075, iz = -5830; C.part(ix, iz, L => { const b = L.mb, far = ARCH.lod === 2, y0 = far ? PALK.y(ix, iz) : 0;
      b.s({ tex: 'grass_summer', col: [.85, .95, .8] }).T(ix, y0, iz).lathe([[42, -1.2], [38, .4], [30, 3], [18, 7], [8, 9], [0, 9.4]], { seg: far ? 10 : 18, uvs: [10, 3] }).pop();
      if (!ARCH.lod) { const prof = [[42, -1.2], [38, .4], [30, 3], [18, 7], [8, 9], [0, 9.4]], hAt = r => { for (let k = 0; k < prof.length - 1; k++) { const [r0, h0] = prof[k], [r1, h1] = prof[k + 1]; if (r <= r0 && r >= r1) return lerp(h0, h1, (r0 - r) / (r0 - r1)); } return 9.4; };
        for (let k = 0; k <= 34; k++) { const r = 38.5 - k * 1.13; if (r < .6) break; L.world.cyl(ix, iz, -1.5, hAt(r) - .03, r, { surface: 'grass' }); } } // the mound is walkable: stepped rings (≤ 0.45 m) following the drawn profile
      if (!ARCH.lod) { b.s({ tex: 'boulder', col: [.9, .88, .84] }); const R2 = RNG(77); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + R2() * .3, r = 33 + R2() * 6; b.T(ix + Math.cos(a) * r, .6 + R2() * 1.5, iz + Math.sin(a) * r, R2(), R2() * 3, R2()).ell(0, 0, 0, 1.2 + R2(), .9 + R2() * .6, 1 + R2(), { seg: 6, ring: 4 }).pop(); } }
      ARCH.pavilion(L, ix, y0 + 9.2, iz, { sides: 8, r: 3.4, colH: 3.2, platform: .5, paint: 'ochre' }); });
    const R3 = RNG(78); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + R3() * .4, r = 14 + R3() * 14, x = ix + Math.cos(a) * r, z = iz + Math.sin(a) * r, y = Math.max(0, 9.4 * (1 - r / 42) * 1.05); C.part(x, z, L => PALK.tree(L, x, z, k % 3 ? 'pine' : 'peach', 1.1, 7800 + k, y)); } }
  C.part(cx, -5620, L => { const tops = PALK.terrace(L, cx, 0, -5620, [{ w: 40, d: 22, h: 1.0, stairs: [{ side: 's', at: 0, w: 6 }, { side: 'n', at: 0, w: 6 }] }]); PALK.dian(L, cx, tops[0], -5620, { bays: 7, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.8, roof: 'xieshan', paint: 'jade', cls: 3, lit: .6, seed: 15, tablet: 'pl_含涼殿', windows: 'all', backDoor: true }); });
  C.part(cx + 16, -6015, L => { const tops = PALK.terrace(L, cx + 16, 0, -6015, [{ w: 44, d: 26, h: 1.2, stairs: [{ side: 's', at: 0, w: 6 }] }]); PALK.dian(L, cx + 16, tops[0], -6015, { bays: 7, dbays: 4, bayW: 4.8, dbayW: 4.4, colH: 5, roof: 'xieshan', paint: 'jade', cls: 3, lit: .6, seed: 19, windows: 'all' }); });
  { const t = 3.75, p = lkW.at(t), yaw = Math.atan2(2030 - p[0], -5815 - p[1]), F = ARCH.F(p[0], 0, p[1], yaw), q = F.p(0, 0, 4); q[1] = q[2]; C.shuidian = { x: q[0], z: q[1], floor: .35, yaw: yaw + PI }; // 水殿: the water pavilion of 15 rooms on the NW shore [華商網] — a hall on a timber deck over the water
    C.part(q[0], q[1], L => { const b = L.mb; b.T(q[0], 0, q[1], 0, yaw, 0).s({ tex: 'plank', col: [.72, .6, .48] }).box(0, .2, 0, 24, .3, 13, { uv: [8, 4] }); if (ARCH.lod !== 2) { b.s({ tex: 'dark_wood', col: [.7, .6, .5] }); for (let i = -2; i <= 2; i++) for (const j of [-1, 1]) b.box(i * 5.5, -.6, j * 5.5, .3, 1.5, .3, { skip: ['bot'] }); } b.pop(); b.s({ col: [1, 1, 1] }); if (!ARCH.lod) L.world.box(q[0], .1, q[1], 12, .25, 6.5, { yaw, surface: 'wood' });
      PALK.dian(L, q[0], .35, q[1], { yaw: yaw + PI, bays: 5, dbays: 3, bayW: 4, dbayW: 3.4, colH: 3.8, roof: 'xieshan', brackets: 'simple', paint: 'jade', cls: 3, lit: .6, seed: 77, cw: false, windows: 'all', backDoor: true, stairs: [] }); }); }
  for (const t of [.6, 2.2, 3.9, 5.3]) { const p = lkW.at(t), x = p[0] + Math.cos(t) * 20, z = p[1] + Math.sin(t) * 16; if (z > -5660) continue; C.part(x, z, L => ARCH.pavilion(L, x, 0, z, { sides: t > 3 ? 6 : 4, r: 2.8, colH: 3.1, platform: .5, paint: 'jade' }));
    C.person('palacelady', x - .9, .5, z, PI / 2, 'sit_talk', [15, 18.5], { seated: true, seed: 900 + (t * 10 | 0) }); C.person('palacelady', x + .9, .5, z, -PI / 2, 'sit_drink', [15, 18.5], { seated: true, seed: 901 + (t * 10 | 0) }); C.person('maid', x, .5, z + 1.6, PI, 'stand', [15, 18.5]); }
  // 麟德殿: three halls front to back on a two-tier platform (excavated 130.4 x 77.6 m), 郁儀樓 / 結鄰樓 on high bases joined by 飛廊, 東亭 / 西亭
  const lx = 1372, lz = -5770; C.zone(lx - 70, lz - 90, lx + 70, lz + 90, GC.PAVED);
  C.part(lx, lz + 30, L => PALK.terrace(L, lx, 0, lz, [{ w: 77.6, d: 130.4, h: 1.4, stairs: [{ side: 's', at: 0, w: 10 }, { side: 's', at: -24, w: 5 }, { side: 's', at: 24, w: 5 }, { side: 'n', at: 0, w: 6 }], open: [['e', 0, 6.5], ['w', 0, 6.5]] }]));
  C.part(lx, lz - 10, L => PALK.terrace(L, lx, 1.4, lz - 6, [{ w: 66, d: 112, h: 1.1, stairs: [{ side: 's', at: 0, w: 9 }, { side: 'n', at: 0, w: 6 }] }]));
  C.part(lx, lz + 34, L => PALK.dian(L, lx, 2.5, lz + 34, { bays: 11, dbays: 4, bayW: 5.2, dbayW: 5, colH: 5.8, roof: 'hip', cls: 3, lit: .7, seed: 16, tablet: 'pl_麟德殿', backDoor: true }));
  C.part(lx, lz - 4, L => { const r = ARCH.lou2(L, lx, 2.5, lz - 4, { bays: 11, dbays: 5, bayW: 5, dbayW: 4.8, colH1: 7.2, colH2: 5, storeys: 2, platform: .2, roof: 'hip', paint: 'ochre', backDoor: true, seed: 17 }); void r; if (!ARCH.lod) { PALK.throne(L, lx, 2.7, lz - 10, 0, { s: .8 }); PALK.desks(L, lx - 13, 2.7, lz - 2, PI / 2, 2, 5, 2.2, 3.1, 'guest'); PALK.desks(L, lx + 13, 2.7, lz - 2, -PI / 2, 2, 5, 2.2, 3.1, 'guest'); } });
  C.part(lx, lz - 40, L => PALK.dian(L, lx, 2.5, lz - 40, { bays: 11, dbays: 3, bayW: 5, dbayW: 4.6, colH: 5.2, roof: 'xieshan', cls: 3, lit: .5, seed: 18, cw: false, backDoor: true }));
  for (const sd of [-1, 1]) { const tx = lx + sd * 58, tz = lz - 4; C.part(tx, tz, L => { PALK.terrace(L, tx, 0, tz, [{ w: 18, d: 18, h: 7.2, rail: true, open: [[sd > 0 ? 'w' : 'e', 0, 6]], stairs: [{ side: 's', at: 0, w: 3.5 }] }]); ARCH.lou2(L, tx, 7.2, tz, { bays: 3, dbays: 3, bayW: 4.2, dbayW: 4.2, colH1: 4.2, colH2: 3.6, storeys: 2, platform: .2, roof: 'xieshan', seed: 19 + sd }); });
    C.part(lx + sd * 41, tz, L => PALK.feilang(L, lx + sd * 29.5, tz, lx + sd * 49, tz, 7.2, { seed: 35 + sd, w: 5 })); // 飛橋 to the upper floor
    const px = lx + sd * 46, pz = lz + 62; C.part(px, pz, L => { PALK.terrace(L, px, 0, pz, [{ w: 14, d: 14, h: 2.4, stairs: [{ side: 's', at: 0, w: 4 }] }]); ARCH.pavilion(L, px, 2.4, pz, { sides: 4, r: 3.4, colH: 3.6, platform: .3 }); }); }
  C.walk(lx, lz + 70, lx, -5545, 6); C.walk(lx - 60, lz + 75, lx + 60, lz + 75, 6);
  // 三清殿 (Daoist hall on a ~14 m platform, NW)
  const sx3 = 2190, sz3 = -6420; C.zone(sx3 - 40, sz3 - 50, sx3 + 40, sz3 + 60, GC.PAVED);
  C.part(sx3, sz3, L => { const tops = PALK.terrace(L, sx3, 0, sz3, [{ w: 48, d: 78, h: 8, stairs: [{ side: 's', at: 0, w: 7 }] }, { w: 40, d: 56, h: 6, dz: -5, stairs: [{ side: 's', at: 0, w: 6 }] }] /* the upper tier set back: a 16 m landing for its 11 m flight */); PALK.dian(L, sx3, tops[1], sz3 - 8, { bays: 7, dbays: 5, bayW: 4.6, dbayW: 4.4, colH: 5.2, roof: 'hip', fujie: true, cls: 3, lit: .5, seed: 20, tablet: 'pl_三清殿' }); });
  // 飛龍廄 (the palace stables; the great 飛龍 / 閑廄 were in the 禁苑 north of the palace (?)): a walled stable yard by 九仙門 with open stalls,
  // troughs, horses and grooms
  { const r = rect(1200, -6095, 1300, -5950); C.ring(r.x0, r.z0, r.x1, r.z1, { h: 3.6, t: 1 , col: [1.04, .97, .88] }, [['e', rcz(r), 8]]); C.part(r.x1, rcz(r), L => PALK.menHall(L, r.x1, rcz(r), { yaw: PI / 2, bays: 3, bayW: 2.8, dbayW: 3.2, colH: 3.6, pass: 1, ph: .3, seed: 5951 })); C.zone(r.x0, r.z0, r.x1, r.z1, GC.YARD); C.lot('飛龍廄', r.x0, r.z0, r.x1, r.z1, 'e');
    for (const [z, yw] of [[r.z0 + 14, 0], [r.z1 - 14, PI]]) { C.part(rcx(r) - 6, z, L => PALK.dian(L, rcx(r) - 6, 0, z, { yaw: yw, bays: 9, dbays: 1, bayW: 3.8, dbayW: 5, colH: 3, roof: 'gable', brackets: 'none', platform: .2, pm: .3, paint: 'plain', cls: 0, lights: false, cw: false, seed: 5952 + z, fill: { front: Array(9).fill('open'), back: Array(9).fill('wall'), left: ['wall'], right: ['wall'] }, stairs: [] }));
      for (let k = 0; k < 6; k++) C.person('horse', rcx(r) - 20 + k * 5.6, .2, z + (yw ? -1.2 : 1.2), yw, 'horse_stand', null, { seed: 5960 + k + (yw ? 9 : 0) }); }
    C.person('labourer', rcx(r), 0, rcz(r), PI / 2, 'sweep', [6, 18]); C.person('labourer', rcx(r) + 8, 0, rcz(r) - 6, 0, 'carry', [7, 17]); }
  // residence courts (後宮) and gardens in the north
  for (const [ax, az, bx, bz, fr, st] of [[1450, -6300, 1640, -6110, 's', 'gong'], [1660, -6300, 1860, -6110, 's', 'gong'], [2160, -6300, 2290, -6110, 's', 'gong'], [1450, -6080, 1700, -5900, 'e', 'gong'], [2450, -5540, 2620, -5520, 's', null]].filter(q => q[5]))
    YUAN(C, rect(ax, az, bx, bz), { style: st, front: fr, seed: (ax * 3 + az) | 0 });
  C.walk(cx, -6090, cx, d.z0 + 20, 6); C.walk(1460, -6090, 2290, -6090, 4);
  // plaza sides: 東內苑 (garden, 龍首池) east; tree rows and a polo field (毬場, attested in the palace) west
  { C.zone(2340, -5090, 2840, -4650, GC.GARDEN); HAI(C, 2600, -4870, 70, 45, 63, { trees: 18 });
    // 東內苑 (the inner garden east of the forecourt): orchards in rows, vegetable plots of the 內園 in low mud fences, a gardeners' hut
    for (const [ax, az, bx, bz, kd] of [[2365, -5080, 2545, -4965, 'peach'], [2650, -5080, 2830, -4965, 'apricot'], [2365, -4935, 2500, -4800, 'jujube']]) for (let x = ax; x <= bx; x += 11) for (let z = az; z <= bz; z += 10) C.tree(x + ((z / 10) & 1) * 5.5, z, kd, 1.1, false);
    for (const [ax, az, bx, bz] of [[2380, -4785, 2560, -4692], [2665, -4785, 2830, -4692]]) { C.zone(ax, az, bx, bz, GC.FIELD); C.ring(ax, az, bx, bz, { h: 1.1, t: .5, cap: false, tex: 'rammed_earth', col: [1, .95, .85] }, [['n', (ax + bx) / 2, 4]]); }
    C.part(2470, -4795, L => PALK.dian(L, 2470, 0, -4795, { bays: 3, dbays: 2, bayW: 3.4, dbayW: 3.2, colH: 3, roof: 'gable', brackets: 'none', platform: .3, pm: .5, paint: 'plain', walls: 'plank', cls: 0, lights: false, cw: false, seed: 4801 }));
    C.person('labourer', 2470, 0, -4775, 0, 'hoe', [7, 17]); C.person('eunuch', 2600, 0, -4780, PI, 'stand', [8, 16]); C.lot('東內苑', 2345, -5090, 2840, -4650);
    C.part(2600, -4950, L => ARCH.pavilion(L, 2600, 0, -4950, { sides: 6, r: 3, colH: 3.2, platform: .6, paint: 'jade' }));
    C.zone(1250, -5060, 1640, -4700, GC.STREET); C.ring(1260, -5050, 1630, -4710, { h: 1.4, t: .6, cap: false, col: [1, .96, .9] }, [['e', -4880, 12]]); // 毬場 low wall
    C.part(1445, -5038, L => PALK.dian(L, 1445, 0, -5038, { bays: 5, dbays: 2, bayW: 4.4, dbayW: 4, colH: 4.2, roof: 'xieshan', brackets: 'simple', platform: 1.2, pm: .8, paint: 'ochre', cls: 0, lights: false, cw: false, seed: 4811, fill: { front: ['rail', 'rail', 'open', 'rail', 'rail'], back: ['wall', 'wall', 'wall', 'wall', 'wall'], left: ['wall', 'wall'], right: ['wall', 'wall'] }, stairs: [{ side: 'f', at: 0, w: 4 }] })); // 看殿: the viewing hall
    for (const gxp of [1272, 1618]) C.part(gxp, -4880, L => { if (ARCH.lod === 2) return; const b = L.mb; b.s({ tex: 'vermilion', col: [1, 1, 1] }); for (const sz of [-1, 1]) b.box(gxp, 1.6, -4880 + sz * 2.4, .22, 3.2, .22, { skip: ['bot'] }); b.s({ tex: 'plank', col: [.8, .4, .32] }).box(gxp, 3.05, -4880, .14, .5, 5); b.s({ col: [1, 1, 1] }); }); // 毬門 goals
    for (let k = 0; k < 4; k++) C.person(k % 2 ? 'official' : 'palaceguard', 1439 + k * 2.6, 1.2, -5036.5, 0, k % 2 ? 'talk' : 'stand', [15, 18]); 
    for (let x = 1215; x < 1690; x += 9) C.tree(x, -4680, 'huai', 1.1, x % 27 === 0); }
  C.lot('含元殿', cx - 100, hz - 40, cx + 100, hz + 70); C.lot('翔鸞閣', cx + 100, hz + 95, cx + 160, hz + 120); C.lot('棲鳳閣', cx - 160, hz + 95, cx - 100, hz + 120); C.lot('丹鳳門', cx - 37, zf - 33, cx + 37, zf);
  C.lot('宣政殿', cx - 150, zA, cx + 150, zB); C.lot('紫宸殿', cx - 112, zB, cx + 112, zP); C.lot('蓬萊殿', cx - 28, hz4 - 15, cx + 28, hz4 + 15); C.lot('含涼殿', cx - 20, -5631, cx + 20, -5609); C.lot('太液池', 1790, -5970, 2270, -5660);
  C.lot('麟德殿', lx - 39, lz - 65, lx + 39, lz + 65); C.lot('三清殿', sx3 - 24, sz3 - 39, sx3 + 24, sz3 + 39); C.lot('左金吾仗院', cx + 240, -4788, cx + 340, -4688); C.lot('右金吾仗院', cx - 340, -4788, cx - 240, -4688); C.lot('毬場', 1260, -5050, 1630, -4710);
  // more of the 133 recorded buildings (56 殿, 8 院 … [kemingbaike]): residence courts and gardens in the north (內苑 side), between 麟德殿 and the
  // lake, east of the lake; guards' quarters (仗舍) and offices inside the south wall on both sides of the open court (positions plausible)
  { const keep = [rect(2004, -6600, 2024, -6000), rect(2145, -6470, 2240, -6370), rect(1700, -6070, 1740, -5530)], gs = (R2, i, j) => R2() < .3 ? 'garden' : 'gong';
    YUANS(C, rect(1240, -6560, 2290, -6355), 175, 200, { seed: 151, style: gs, skip: keep }); YUANS(C, rect(1240, -6305, 1445, -6100), 200, 200, { seed: 152, style: gs }); YUANS(C, rect(1895, -6305, 2140, -6110), 120, 190, { seed: 153, style: gs, skip: keep });
    YUANS(C, rect(1440, -5870, 1705, -5590), 130, 140, { seed: 154, style: (R2) => R2() < .5 ? 'garden' : 'gong', front: 'e' }); YUAN(C, rect(2337, -5693, 2468, -5567), { style: 'gong', role: 'music', name: '內教坊', seed: 1551 }); YUAN(C, rect(2482, -5693, 2613, -5567), { style: 'office', role: 'kitchen', name: '尚食局', seed: 1552 }); // 內教坊 「在蓬萊宮側」 [教坊記]; 尚食 placement plausible
    for (const [a0, a1] of [[1200, 1560], [1608, 1690], [2340, 2420], [2468, 2840]]) YUANS(C, rect(a0, -4630, a1, -4345), 120, 140, { seed: 156 + a0, style: (R2) => R2() < .2 ? 'garden' : 'office', front: 'n', role: 'guard' }); // 仗舍: the guards' quarters inside the south wall
    for (let k = 0; k < 26; k++) { const x = 1262 + k * 14.2; C.tree(x, -5062, 'huai', 1.15, k % 3 === 0); C.tree(x, -4698, 'huai', 1.15, k % 3 === 1); } }
  { const gz = [d.x0, d.z0, d.x1, zB, GC.GARDEN], i = C.zones.findIndex(q => q[4] === GC.YARD && q[0] === d.x0 && q[2] === d.x1); C.zones.splice(i + 1, 0, gz); } // 內廷 ground: grass and planting (under every court zone)
  INFILL(C, rect(d.x0 + 12, d.z0 + 12, d.x1 - 12, zf - 12), { seed: 152, keep: [rect(cx - 340, -4800, cx + 340, zf), rect(1255, -5055, 1635, -4705), rect(cx - 340, -5100, cx + 340, -4797)] });
  COURT_DAMING(C, { cx, hz, hz2, hz3, lx, lz });
}

// =====================================================================================
// PALACE — units (ward-sized pieces of each palace complex), layouts, parts, far meshes, people
// =====================================================================================
const PALACE = {
  // complexes: plan builder + unit grid (x cuts, z cuts per row) — units tile the complex rect; names: complex·precinct
  COMPLEX: {
    大明宮: { plan: PLAN_DAMING, rect: () => rect(...PLAN.daming),
      rows: [[-4325.85, -5100, [[1179.5, 1720, '西內朝', 's'], [1720, 2310, '含元殿', 's'], [2310, 2853.5, '東內苑', 's']]],
             [-5100, -5650, [[1179.5, 1720, '翰林院'], [1720, 2310, '宣政殿']]], [-5100, -6000, [[2310, 2853.5, '清思殿']]],
             [-5650, -6581.85, [[1179.5, 1720, '麟德殿'], [1720, 2310, '太液池']]]] },
    太極宮: { plan: PLAN_TAIJI, rows: [[-2833.75, -3580, [[-1410.2, -642, '掖庭宮'], [-642, 0, '太極殿西'], [0, 642, '太極殿'], [642, 1410.1, '東宮']]], [-3580, -4325.85, [[-1410.2, -642, '掖庭北'], [-642, 0, '西海池'], [0, 642, '凌煙閣'], [642, 1410.1, '東宮北']]]] },
    皇城: { plan: PLAN_HUANG, rows: [[-990.15, -1605, [[-1410.2, -470, '太社'], [-470, 470, '朱雀門'], [470, 1410.1, '太廟']]], [-1605, -2220, [[-1410.2, -470, '皇城西'], [-470, 470, '皇城'], [470, 1410.1, '皇城東']]], [-2220, -2833.75, [[-1410.2, -470, '安福門'], [-470, 470, '承天門'], [470, 1410.1, '延喜門']]]] },
    興慶宮: { plan: PLAN_XINGQING, rows: [[-2239.85, -1615, [[3761, 4836, '興慶']]], [-1615, -989.85, [[3761, 4836, '龍池']]]] },
  },
  _plans: new Map(),
  plan(cname) { let C = this._plans.get(cname); if (C) return C; const X = this.COMPLEX[cname]; C = PCTX({ name: cname }); X.plan(C); PIERS(C); TREEFILTER(C); FLOORS(C);
    // clip walkways to the units (their ends on unit edges coincide, so WARD.nav joins them across units)
    this._plans.set(cname, C); return C; },
  units() { const out = []; for (const [cn, X] of Object.entries(this.COMPLEX)) for (const [z0, z1, cols] of X.rows) for (const [x0, x1, nm] of cols) out.push({ name: cn + '·' + nm, short: nm, kind: 'palace', complex: cn, r: rect(x0, Math.min(z0, z1), x1, Math.max(z0, z1)), gates: [] });
    for (const u of out) { const C = this.plan(u.complex); u.gates = C.gates.filter(g => inR(u.r, g.x, g.z, .5) && g.link).map(g => ({ x: g.x, z: g.z, side: g.side, link: true, name: g.name })); }
    return out; },
  _in(u, x, z) { const r = u.r; return x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1; },
  _unit(u) { if (typeof u === 'string') return this.units().find(q => q.name === u); return u.complex ? u : this.units().find(q => q.name === u.name) || u; },
  layout(u) { u = this._unit(u); const C = this.plan(u.complex), r = u.r;
    const clipR = q => { const a = { x0: Math.max(q.x0, r.x0), z0: Math.max(q.z0, r.z0), x1: Math.min(q.x1, r.x1), z1: Math.min(q.z1, r.z1) }; return a.x1 - a.x0 > .5 && a.z1 - a.z0 > .5 ? a : null; };
    const streets = []; for (const s of C.streets) { const cxl = rcx(s.r), czl = rcz(s.r); // a walkway belongs whole (across its width) to the unit holding its centre line; only its length is cut at unit edges
      if (s.axis === 'z' ? !(cxl >= r.x0 && cxl < r.x1) : !(czl >= r.z0 && czl < r.z1)) continue; const q = s.axis === 'z' ? { x0: s.r.x0, x1: s.r.x1, z0: Math.max(s.r.z0, r.z0), z1: Math.min(s.r.z1, r.z1) } : { x0: Math.max(s.r.x0, r.x0), x1: Math.min(s.r.x1, r.x1), z0: s.r.z0, z1: s.r.z1 };
      if (s.axis === 'x' ? q.x1 - q.x0 > 2 : q.z1 - q.z0 > 2) streets.push({ r: q, axis: s.axis, kind: 'palace' }); }
    const lots = C.lots.filter(l => this._in(u, rcx(l.r), rcz(l.r)));
    const Z = C.zones, inside = C.inside || (() => true);
    const gr = { at(x, z) { if (!inside(x, z)) return GC.GARDEN; for (const s of streets) if (inR(s.r, x, z)) return GC.STREET; for (let i = Z.length - 1; i >= 0; i--) { const q = Z[i]; if (x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]) return q[4]; } return GC.YARD; } };
    return { wd: u, streets, lanes: [], lots, gates: u.gates.map(g => ({ x: g.x, z: g.z, side: g.side })), trees: [], wells: [], props: [], gr, inner: r, palace: true }; },
  // every part of a complex plus its collision clones (tools that build chunks themselves)
  allParts(cname) { const out = []; for (const p of this.plan(cname).parts) { out.push(p); for (const q of PCOLL.clones(p)) out.push(q); } return out; },
  items(u) { u = this._unit(u); const C = this.plan(u.complex); const out = []; for (const p of C.parts) { if (!this._in(u, p.x, p.z)) continue; out.push({ x: p.x, z: p.z, build: L => p.build(L), src: p.src }); for (const q of PCOLL.clones(p)) out.push(q); } return out; },
  // far mesh of one unit: its parts at ARCH.lod 2 (skipping small things), each lifted onto the far ground at its centre
  far(L, name, level = 1) { const u = this._unit(name); if (!u) return; const C = this.plan(u.complex), prev = ARCH.lod; ARCH.lod = 2;
    try { for (const p of C.parts.concat(C.farOnly)) { if (!this._in(u, p.x, p.z) || p.far === false && !C.farOnly.includes(p)) continue; if (level === 2 && p.tag === 'small') continue; const y = typeof FARB !== 'undefined' ? FARB.y(p.x, p.z) : 0; L.mb.T(0, y, 0); L.fol.T(0, y, 0); try { p.build(L); } finally { L.mb.pop(); L.fol.pop(); } } }
    finally { ARCH.lod = prev; } },
  depthAt(x, z) { for (const C of this._plans.values()) { for (const c of C.cuts) if (c.r && inR(c.r, x, z)) return c.d; for (const lk of C.lakes) if (lk.inside(x, z)) { const isl = C.cuts.find(c => c.island && Math.hypot(x - c.island[0], z - c.island[1]) < c.island[2] - 2); return isl ? 0 : 1.6; } } return 0; },
  people(u, hour) { u = this._unit(u); const C = this.plan(u.complex), h = ((hour % 24) + 24) % 24, out = [];
    if (!C._own) { C._own = true; const us = this.units().filter(q => q.complex === u.complex), dR = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
      for (const p of C.people) if (!us.some(q => this._in(q, p.x, p.z))) { let best = null, bd = 1e9; for (const q of us) { const d = dR(q.r, p.x, p.z); if (d < bd) { bd = d; best = q; } } if (best && bd < 40) p.unit = best.name; } } // guards outside the outer gates belong to the nearest unit
    for (const p of C.people) { if (!this._in(u, p.x, p.z) && p.unit !== u.name) continue; const on = p.h0 <= p.h1 ? h >= p.h0 && h < p.h1 : h >= p.h0 || h < p.h1; if (!on) continue; out.push({ type: p.type, x: p.x, y: p.y, z: p.z, yaw: p.yaw, anim: p.anim, seated: p.seated ?? /^(sit|kneel|pipa|write)/.test(p.anim), seed: p.seed, place: p.place, boat: p.boat, cols: p.cols }); }
    return out; },
  // where are the placed people of a type at an hour (e.g. whereIs('emperor', 14) -> [{unit, place, x, y, z}]); console 'find emperor'
  whereIs(type, hour) { const h = ((hour % 24) + 24) % 24, out = [], us = this.units();
    for (const cn of Object.keys(this.COMPLEX)) { const C = this.plan(cn); for (const p of C.people) { if (p.type !== type) continue; const on = p.h0 <= p.h1 ? h >= p.h0 && h < p.h1 : h >= p.h0 || h < p.h1; if (!on) continue;
      const u = us.find(q => q.complex === cn && this._in(q, p.x, p.z)); out.push({ unit: u ? u.name : cn, place: p.place || (u ? u.short : cn), x: p.x, y: p.y, z: p.z, anim: p.anim }); } }
    return out; },
  walkerType(kind, hour, rnd) { const h = hour, r = rnd(); if (h >= 20 || h < 5) return r < .7 ? 'palaceguard' : r < .92 ? 'eunuch' : 'palacelady'; // the precincts are guarded, quiet, mostly empty
    if (h < 9) return r < .38 ? 'official' : r < .7 ? 'palaceguard' : r < .88 ? 'eunuch' : 'palacelady';
    return r < .36 ? 'palaceguard' : r < .62 ? 'eunuch' : r < .78 ? 'official' : r < .88 ? 'palacelady' : r < .95 ? 'nanzhuang' : 'maid'; },
};

// ---- an axis court 殿庭: corridors round x ± W/2 × z0..z1, a gate hall in front (plaque), the main hall on a terrace, paving, trees,
// a throne; o: { gate: {bays, tablet}, hall: {bays, dbays, bayW, dbayW, colH, roof, fujie, tablet}, tiers: [[h, mx, mz]], hz, rear: true, bell: true }
function DIANTING(C, cx, z0, z1, W, o = {}) {
  if (o.hall && o.hall.tablet) C.lot(o.hall.tablet.replace('pl_', ''), cx - W / 2, z0, cx + W / 2, z1, 's'); const w = 4.4, gh = o.gate || {}, H = o.hall || {}, hz = o.hz ?? lerp(z1, z0, .55), nb = H.bays || 9, nd = H.dbays || 4, bw = H.bayW || 5, dw = H.dbayW || 4.8, HW = Array.isArray(bw) ? PALK.sum(bw) : nb * bw, HD = Array.isArray(dw) ? PALK.sum(dw) : nd * dw;
  const gW = (gh.bays || 5) * (gh.bayW || 5);
  C.corr(cx - W / 2 - w / 2, z1, cx - gW / 2 - 1, z1, { wall: 1, w }); C.corr(cx + gW / 2 + 1, z1, cx + W / 2 + w / 2, z1, { wall: 1, w });
  if (o.rear) { C.corr(cx - W / 2 - w / 2, z0, cx - 9, z0, { wall: -1, w }); C.corr(cx + 9, z0, cx + W / 2 + w / 2, z0, { wall: -1, w }); C.part(cx, z0, L => PALK.menHall(L, cx, z0, { yaw: PI, bays: 3, bayW: 5.4, dbayW: 4, colH: 4.4, ph: .5, pm: .8, seed: (cx + z0) | 0 })); }
  else C.corr(cx - W / 2 - w / 2, z0, cx + W / 2 + w / 2, z0, { wall: -1, w });
  for (const sd of [-1, 1]) { const zm = (z0 + z1) / 2, e = w / 2 + .5; C.corr(cx + sd * W / 2, z0 + e, cx + sd * W / 2, zm - 6, { wall: sd < 0 ? 1 : -1, w, win: true }); C.corr(cx + sd * W / 2, zm + 6, cx + sd * W / 2, z1 - e, { wall: sd < 0 ? 1 : -1, w, win: true });
    C.part(cx + sd * W / 2, zm, L => PALK.menHall(L, cx + sd * W / 2, zm, { yaw: sd * PI / 2, bays: 3, bayW: 3.6, dbayW: 4.2, colH: 4, pass: 1, ph: .45, pm: .6, seed: (zm * 3 + sd) | 0 })); }
  C.part(cx, z1, L => PALK.menHall(L, cx, z1, Object.assign({ bays: 5, bayW: 5, dbayW: 4.6, colH: 5, pass: 1, ph: 1, pm: 1.4, seed: (cx + z1 * 7) | 0 }, gh)));
  C.pave(cx - W / 2 + 2.5, z0 + 2.5, cx + W / 2 - 2.5, z1 - 2.5); C.road(cx - 4.5, hz + 25, cx + 4.5, z1 - 4);
  const tiers = o.tiers || [[1.8, 6, 6]], T = tiers.map(([h, mx, mz]) => ({ w: HW + 2 * mx, d: HD + 2 * mz, h, stairs: [{ side: 's', at: 0, w: Math.min(10, HW * .2) }, { side: 'n', at: 0, w: 5 }] }));
  for (let k = 1; k < T.length; k++) { T[k].dz = 0; } if (T.length > 1) T[0].stairs.push({ side: 's', at: -T[0].w * .3, w: 4.5 }, { side: 's', at: T[0].w * .3, w: 4.5 });
  let floor = PALK.sum(tiers.map(t => t[0])); C.floor = floor;
  C.part(cx, hz, L => { const tops = PALK.terrace(L, cx, 0, hz, T); const h = PALK.dian(L, cx, tops[tops.length - 1], hz, Object.assign({ roof: 'hip', cls: 3, lit: .5, seed: (hz | 0) & 255 }, H)); if (o.throne !== false) PALK.throne(L, cx, h.floor, hz - HD * .18, 0); });
  if (o.bell) for (const sd of [-1, 1]) { const x = cx + sd * W * .3, z = lerp(hz, z1, .55); C.part(x, z, L => { ARCH.lou2(L, x, 0, z, { bays: 3, dbays: 3, bayW: 3.8, dbayW: 3.8, colH1: 4, colH2: 3.4, storeys: 2, platform: 1, roof: 'xieshan', seed: (z | 0) + sd }); }); }
  for (const sd of [-1, 1]) { C.tree(cx + sd * W * .38, z1 - 18, 'huai', 1.2); C.tree(cx + sd * W * .38, z0 + 16, 'pine', 1.15); }
  if (W >= 240) for (const sd of [-1, 1]) { const x = cx + sd * (W / 2 - 18), z = lerp(hz, z1, .3), nb = rd({ z0, z1 }) > 250 ? 9 : 7; C.part(x, z, L => PALK.dian(L, x, 0, z, { yaw: -sd * PI / 2, bays: nb, dbays: 3, bayW: 4.6, dbayW: 4.4, colH: 4.6, roof: 'xieshan', brackets: 'simple', platform: .9, pm: 1.2, cls: 3, lit: .3, seed: (x * 3) | 0, cw: false, lights: false, stairs: [{ side: 'f', at: 0, w: 5 }] })); } // 配殿 east and west
  C.person('palaceguard', cx - gW / 2 + 1, 0, z1 + 8.5, 0, 'stand', null); C.person('palaceguard', cx + gW / 2 - 1, 0, z1 + 8.5, 0, 'stand', null); /* in front of the gate hall's platform */
  C.person('eunuch', cx + 6, floor, hz + HD / 2 + 2, 0, 'stand', [6, 20]);
  return { hz, floor };
}
// a grid of residence / office courts in a rect (cells of about cw × cd), skipping rects in `skip`
// ---- people inside a court's main hall by its role (on mats / at desks on the hall floor, inside the inner ring; no overlaps):
// office: officials and clerks writing at desks (8–16, one clerk till 20); residence: palace ladies and a consort at leisure on mats, a eunuch
// at the door; guard (仗舍): guards resting on mats day and night; music (內教坊): musicians playing and ladies; kitchen (尚食): eunuch cooks at ranges
function INSIDE(C, mp, yaw, floor, W, D, role, seed) { if (role === 'audience') return; /* furnished and peopled by the court schedule */ const R = RNG(seed * 7 + 5), F = ARCH.F(mp[0], 0, mp[1], yaw), nx = clamp(Math.floor((W - 4) / 2.6), 2, 4), nz = 2, dx = 2.6, dz = 3, x = mp[0], z = mp[1];
  if (role === 'kitchen') { for (const sx of [-1, 1]) { const p = F.p(sx * Math.min(3.2, W / 4), 0, -D * .18); C.part(p[0], p[2], L => PALK.stove(L, p[0], floor, p[2], yaw)); const q = F.p(sx * Math.min(3.2, W / 4), 0, -D * .18 + 1.3); C.person('eunuch', q[0], floor, q[2], yaw + PI, 'cook', [5, 20], { seed: seed + sx }); } return; }
  const noTable = role !== 'office'; C.part(x, z, L => PALK.desks(L, x, floor, z, yaw, nx, nz, dx, dz, role, noTable));
  const seat = (i, j) => F.p((i - (nx - 1) / 2) * dx, 0, (j - (nz - 1) / 2) * dz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const p = seat(i, j), k = i + j * nx, sd = seed * 13 + k;
    if (role === 'office') C.person(k % 3 ? 'official' : 'scholar', p[0], floor + .04, p[2], yaw, 'write', k ? [8, 16] : [8, 20], { seated: true, seed: sd });
    else if (role === 'residence') C.person(k === 0 ? 'palacelady' : (k % 2 ? 'palacelady' : 'nanzhuang'), p[0], floor + .04, p[2], yaw + (j ? 0 : PI), k % 2 ? 'sit_talk' : 'sit_drink', [9, 20], { seated: true, seed: sd });
    else if (role === 'guard') C.person('palaceguard', p[0], floor + .04, p[2], yaw + (j ? 0 : PI), 'sit', null, { seated: true, seed: sd });
    else if (role === 'music') C.person(k % 2 ? 'musician' : 'palacelady', p[0], floor + .04, p[2], yaw + PI * (j ? 0 : 1), k % 2 ? 'pipa' : 'sit_talk', [10, 22], { seated: true, seed: sd }); }
  if (role === 'residence' || role === 'music') { const p = F.p(W / 2 - 1.8, 0, D / 2 - 1.6); C.person('eunuch', p[0], floor, p[2], yaw + PI, 'stand', [7, 21]); } }
function YUANS(C, A, cw, cd, o = {}) { const nx = Math.max(1, Math.round(rw(A) / cw)), nz = Math.max(1, Math.round(rd(A) / cd)), gx = rw(A) / nx, gz = rd(A) / nz, R = RNG(o.seed || 1);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const r = rect(A.x0 + i * gx + 7, A.z0 + j * gz + 7, A.x0 + (i + 1) * gx - 7, A.z0 + (j + 1) * gz - 7); if (o.skip && o.skip.some(q => r.x0 < q.x1 && r.x1 > q.x0 && r.z0 < q.z1 && r.z1 > q.z0)) continue; if (C.inside && ![[r.x0, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x1, r.z0]].every(p => C.inside(...p))) continue;
    const st = typeof o.style === 'function' ? o.style(R, i, j) : o.style || 'gong'; if (!st) continue; YUAN(C, r, { style: st, front: o.front || 's', seed: ((R() * 1e6) | 0), role: o.role }); } }

// =====================================================================================
// 宮城: 太極宮 (西內) on the axis, 掖庭宮 (west, palace women's quarters, 內侍省), 東宮 (east). In 815 the court sat in 大明宮;
// 太極宮 kept its halls (state rituals, funerals) with fewer people. Axis order after 長安志 卷6 / 唐兩京城坊考 卷1.
// =====================================================================================
function PLAN_TAIJI(C) {
  const P = rect(...PLAN.palace), zS = P.z1, zN = P.z0, xT = 642, T = 12, xE = (xT + P.x1) / 2, xY = (P.x0 - xT) / 2; C.inside = () => true;
  const sG = [[0, 60, '承天門'], [-330, 30], [330, 30], [xY, 26], [xE, 30]], nG = [[0, 40, '玄武門'], [xY, 26], [xE, 30]];
  C.wall(P.x0, zS - T / 2, P.x1, zS - T / 2, { h: 10, t: T, tex: 'rammed_earth', batter: .1 }, sG.map(([x, w]) => [x - w / 2 - P.x0, x + w / 2 - P.x0]));
  C.wall(P.x0, zN + T / 2, P.x1, zN + T / 2, { h: 10, t: T, tex: 'rammed_earth', batter: .1 }, nG.map(([x, w]) => [x - w / 2 - P.x0, x + w / 2 - P.x0]));
  for (const xx of [P.x0 + T / 2, P.x1 - T / 2]) C.wall(xx, zN + T, xx, zS - T, { h: 10, t: T, tex: 'rammed_earth', batter: .1 });
  for (const [px, pz] of [[P.x0 + T / 2, zN + T / 2], [P.x1 - T / 2, zN + T / 2], [P.x0 + T / 2, zS - T / 2], [P.x1 - T / 2, zS - T / 2]]) C.part(px, pz, L => PALK.jiaolou(L, px, pz, 10, { s: 17 }));
  for (const [xx, gz] of [[-xT, -3557], [xT, -3510]]) { C.wall(xx, zN + T, xx, zS - T, { h: 8, t: 5, tex: 'rammed_earth', batter: .1 }, [[gz - (zN + T) - 12, gz - (zN + T) + 12]]); C.part(xx, gz, L => ARCH.gateTower(L, xx, 0, gz, { yaw: xx < 0 ? -PI / 2 : PI / 2, w: 24, h: 8, d: 8, passages: 1, pw: 6, ph: 5.6, open: true, tower: { bays: 3, dbays: 2, roof: 'xieshan' } })); } // gates through the inner walls, on the alleys between the courts
  for (const [x, w, nm] of sG) { const big = w > 45, z = zS - T / 2; C.part(x, z, L => ARCH.gateTower(L, x, 0, z, { w: w + 4, h: 10, d: 22, passages: big ? 5 : 1, pw: big ? 6 : 6, ph: 6.5, open: true, tablet: PALK.gtex(nm), tower: { bays: big ? 9 : 5, dbays: 2, bayW: 5.2, dbayW: 4.6, colH: 5.6, roof: 'hip', brackets: 'full', railing: true } }));
    C.gates.push({ x, z: zS - .2, side: 's', link: true, name: nm || '' }); C.guardGate(x, zS - T / 2, 0, big ? 16 : 4, 12); if (big) for (const sd of [-1, 1]) { C.part(x + sd * 36, zS + 8, L => PALK.jiRack(L, x + sd * 36, zS + 8, 0, 12)); C.person('palaceguard', x + sd * 18, 0, zS + 10, 0, 'stand', null); } }
  for (const [x, w, nm] of nG) { const z = zN + T / 2; C.part(x, z, L => ARCH.gateTower(L, x, 0, z, { yaw: PI, w: w + 4, h: 10, d: 20, passages: w > 35 ? 3 : 1, pw: 6, ph: 6.5, open: true, tablet: PALK.gtex(nm), tower: { bays: 5, dbays: 2, roof: 'hip' } })); }
  C.zone(P.x0, P.z0, P.x1, P.z1, GC.YARD);
  // 太極宮 axis
  C.walk(0, zS, 0, -2975, 10); C.road(-6, zS - 12, 6, -2905);
  const zJ = zS - 70; C.wall(-xT + 3, zJ, xT - 3, zJ, { h: 7, t: 3 }, [[xT - 3 - 22, xT - 3 + 22], [xT - 3 - 222, xT - 3 - 200], [xT - 3 + 200, xT - 3 + 222]]); C.part(0, zJ, L => PALK.menHall(L, 0, zJ, { bays: 7, bayW: 5.4, dbayW: 4.8, colH: 5.4, pass: 1, ph: .42, pm: 1.4, seed: 201 }));
  C.guardGate(0, zJ, 0, 9, 4.5); for (const gx of [-211, 211]) C.part(gx, zJ, L => PALK.menHall(L, gx, zJ, { bays: 3, bayW: 6.4, dbayW: 4.4, colH: 4.4, pass: 1, ph: .4, seed: 202 + gx }));
  C.pave(-30, zJ + 3, 30, -2905 + 4);
  const a = DIANTING(C, 0, -3285, -2990, 300, { gate: { bays: 7, bayW: 5.2, pass: 1, tablet: 'pl_太極門', colH: 5.4, ph: 1.2 }, hall: { bays: 11, dbays: 5, bayW: [4.6, 4.8, 5, 5.2, 5.4, 5.8, 5.4, 5.2, 5, 4.8, 4.6], dbayW: 5, colH: 6.4, colH2: 5, fujie: true, tablet: 'pl_太極殿', tabletW: 1.3, tabletH: 2.6 }, hz: -3160, tiers: [[2.4, 9, 9], [1.2, 3, 3]], bell: true });
  C.yTaiji = a.floor;
  DIANTING(C, 0, -3500, -3310, 280, { gate: { bays: 5, tablet: 'pl_兩儀門' }, hall: { bays: 9, dbays: 4, bayW: 5, dbayW: 4.8, colH: 5.6, tablet: 'pl_兩儀殿' }, hz: -3420, tiers: [[1.8, 6, 6]] });
  DIANTING(C, 0, -3700, -3525, 220, { gate: { bays: 5 }, hall: { bays: 7, dbays: 4, bayW: 5, dbayW: 4.6, colH: 5.2, roof: 'xieshan', tablet: 'pl_甘露殿' }, hz: -3625, tiers: [[1.4, 5, 5]], rear: true });
  C.part(0, -3790, L => { const t = PALK.terrace(L, 0, 0, -3790, [{ w: 46, d: 28, h: 1.2, stairs: [{ side: 's', at: 0, w: 6 }] }]); PALK.dian(L, 0, t[0], -3790, { bays: 7, dbays: 4, bayW: 4.8, dbayW: 4.4, colH: 5, roof: 'xieshan', paint: 'jade', cls: 3, seed: 205, tablet: 'pl_延嘉殿' }); });
  C.pave(-20, -2988, 20, -2906); C.walk(-330, -2880, 330, -2880, 6); for (const sd of [-1, 1]) { C.walk(sd * 330, zS, sd * 330, -2880, 6); C.walk(sd * 211, -2880, sd * 211, -3870, 6); } C.walk(-560, -3870, 560, -3870, 6);
  C.walk(-650.5, -3556.7, -211, -3556.7, 5); C.walk(211, -3556.7, 626, -3556.7, 5); C.walk(626, -3556.7, 626, -3510, 4); C.walk(626, -3510, xE, -3510, 5); // through the inner-wall gates to 掖庭 / 東宮
  // north: the pools (海池) and 凌煙閣 (portraits of the 24 meritorious ministers) in the NE
  HAI(C, -260, -4060, 150, 80, 211); HAI(C, 220, -4130, 110, 70, 212); C.zone(-560, -4300, 560, -3880, GC.GARDEN);
  C.lot('凌煙閣', 415, -3972, 445, -3948); C.lot('承天門', -32, zS - 22, 32, zS); C.lot('掖庭宮', P.x0, -3700, -650, -3300); C.lot('東宮', 660, -3480, 1395, -2860);
  // 凌煙閣 (貞觀十七年, 643): the portraits of the 24 meritorious ministers by 閻立本. 「閣中有隔，隔內面北寫功高宰輔，南面寫功高侯王，隔外面次第寫諸功臣」
  // [長安志 6 / 唐兩京城坊考 1 (?)]: a partition inside, portraits on both faces. Built as a three-storey 閣 (storey count (?)) on a terrace, walkable.
  C.part(430, -3960, L => { PALK.terrace(L, 430, 0, -3960, [{ w: 32, d: 26, h: 1.8, stairs: [{ side: 's', at: 0, w: 5 }, { side: 'n', at: 0, w: 4 }] }]); ARCH.lou2(L, 430, 1.8, -3960, { bays: 5, dbays: 4, bayW: 4.6, dbayW: 4.2, colH1: 5, colH2: 3.8, storeys: 3, platform: .2, roof: 'xieshan', paint: 'jade', seed: 214, backDoor: true }); PALK.portraits(L, 430, 2.05, -3960, 15); });
  for (const [x, z] of [[-430, -3960], [-120, -4220], [460, -4210]]) C.part(x, z, L => ARCH.pavilion(L, x, 0, z, { sides: 6, r: 3, colH: 3.2, platform: .6, paint: 'jade' }));
  YUANS(C, rect(-620, -3860, -260, -2950), 180, 150, { seed: 221, front: 'e', skip: [rect(-240, -3860, 240, -2900)] }); YUANS(C, rect(260, -3860, 620, -2950), 180, 150, { seed: 222, front: 'w' });
  // 掖庭宮: rows of quarters (宮人), 內侍省, workshops, a garden
  YUANS(C, rect(P.x0 + 12, -4300, -650, -2860), 150, 130, { seed: 231, style: (R, i, j) => R() < .12 ? 'garden' : R() < .3 ? 'office' : 'gong' }); C.walk(xY, zS, xY, -2856, 6); C.walk(-1098.9, -2856, xY, -2856, 5); C.walk(-1098.9, -2856, -1098.9, -4303, 5); C.walk(-1098.9, -4303, xY, -4303, 5); C.walk(xY, -4303, xY, zN, 6); // along the alleys between the 掖庭 courts
  C.walk(-1098.9, -3514.6, -650.5, -3514.6, 5); C.walk(-650.5, -3514.6, -650.5, -3556.7, 4);
  // 東宮: 嘉德門 → 嘉德殿, 崇教殿, 麗正殿 (the crown prince lived in 大明宮's 少陽院 in 815: the courts are kept, quiet)
  DIANTING(C, xE, -3250, -2950, 280, { gate: { bays: 5, tablet: null }, hall: { bays: 9, dbays: 4, bayW: 5, dbayW: 4.8, colH: 5.6, tablet: 'pl_嘉德殿' }, hz: -3120, tiers: [[1.8, 6, 6]] });
  DIANTING(C, xE, -3480, -3290, 220, { gate: { bays: 5 }, hall: { bays: 7, dbays: 4, bayW: 5, dbayW: 4.6, colH: 5.2, roof: 'xieshan' }, hz: -3400, tiers: [[1.4, 5, 5]], rear: true });
  C.walk(xE, zS, xE, -2936, 8); C.walk(xE, -3485, xE, zN, 6);
  YUANS(C, rect(660, -4300, 1395, -3520), 170, 150, { seed: 241, style: (R) => R() < .2 ? 'garden' : 'gong' }); C._infill = () => INFILL(C, rect(P.x0 + 14, P.z0 + 14, P.x1 - 14, P.z1 - 14), { seed: 251, step: 26, clear: 16, keep: [rect(-160, -3290, 160, -2990)] }); YUANS(C, rect(660, -3500, 870, -2860), 200, 150, { seed: 242, front: 'e' }); YUANS(C, rect(1180, -3500, 1395, -2860), 200, 150, { seed: 243, front: 'w' });
  C._infill();
}

// =====================================================================================
// 皇城: the offices 百司 (no north wall; the 橫街 square in front of 承天門), 承天門街, 7 E-W × 5 N-S streets, 太廟 (SE), 太社 (SW)
// =====================================================================================
function PLAN_HUANG(C) {
  const P = rect(...PLAN.imperial), T = 10, zS = P.z1, zN = P.z0; C.inside = () => true;
  const sG = [[-677, 34, '含光門'], [0, 60, '朱雀門'], [677, 34, '安上門']], eG = [[-2345, '延喜門'], [-1805, '景風門']], wG = [[-2345, '安福門'], [-1805, '順義門']]; // on the 橫街 lines
  C.wall(P.x0, zS - T / 2, P.x1, zS - T / 2, { h: 9, t: T, tex: 'rammed_earth', batter: .1 }, sG.map(([x, w]) => [x - w / 2 - P.x0, x + w / 2 - P.x0]));
  for (const [px, pz] of [[P.x0 + T / 2, zS - T / 2], [P.x1 - T / 2, zS - T / 2]]) C.part(px, pz, L => PALK.jiaolou(L, px, pz, 9, { s: 15 }));
  for (const [xx, G2, sd] of [[P.x0 + T / 2, wG, 'w'], [P.x1 - T / 2, eG, 'e']]) C.wall(xx, zN, xx, zS - T, { h: 9, t: T, tex: 'rammed_earth', batter: .1 }, G2.map(([z]) => [z - 16 - zN, z + 16 - zN]));
  for (const [x, w, nm] of sG) { const z = zS - T / 2, big = w > 45; C.part(x, z, L => ARCH.gateTower(L, x, 0, z, { w: w + 4, h: 9, d: 20, passages: big ? 5 : 3, pw: 5.4, ph: 6.2, open: true, tablet: 'gt_' + nm, tower: { bays: big ? 9 : 5, dbays: 2, bayW: 5, dbayW: 4.6, colH: 5.4, roof: 'hip', brackets: 'full', railing: true } })); C.gates.push({ x, z: zS - .2, side: 's', link: true, name: nm }); C.guardGate(x, zS - T / 2, 0, big ? 16 : 9, 11); }
  for (const [xx, G2, sd] of [[P.x0 + T / 2, wG, 'w'], [P.x1 - T / 2, eG, 'e']]) for (const [z, nm] of G2) { C.part(xx, z, L => ARCH.gateTower(L, xx, 0, z, { yaw: sd === 'e' ? PI / 2 : -PI / 2, w: 32, h: 9, d: 18, passages: 3, pw: 5, ph: 6, open: true, tablet: 'gt_' + nm, tower: { bays: 5, dbays: 2, roof: 'hip' } })); C.gates.push({ x: sd === 'e' ? P.x1 - .2 : P.x0 + .2, z, side: sd, link: true, name: nm }); C.guardGate(xx, z, sd === 'e' ? PI / 2 : -PI / 2, 9, 10); }
  C.zone(P.x0, P.z0, P.x1, P.z1, GC.YARD); C.zone(P.x0, zN, P.x1, zN + 220, GC.STREET); // 橫街
  C.walk(P.x0 + 20, zN + 110, P.x1 - 20, zN + 110, 20); C.walk(0, zN, 0, zS, 30); for (const x of [-330, 330, (PLAN.palace[0] - 642) / 2, (642 + PLAN.palace[2]) / 2]) C.walk(x, zN, x, zN + 110, 8); /* from the 宮城 gates into the 橫街 */ C.road(-7, zN + 5, 7, zS - 12);
  // 5 N-S streets (承天門街 ~147 m on the axis [長安志 7], the 含光門 / 安上門 streets, two outer ones) and the E-W 橫街 lines; offices fill the blocks
  const SX = [-1110, -677, 0, 677, 1110], HW = [20, 20, 73, 20, 20], zs = [zN + 220, -2330, -2060, -1790, -1520, -1260, zS - 12];
  for (const [k, x] of SX.entries()) if (x) C.walk(x, zN + 110, x, zS - 12, HW[k]);
  for (const z of zs.slice(1, -1)) { if (z - 15 > -1520) { for (const [a2, b2] of [[P.x0 + 15, -1110], [-677, 677], [1110, P.x1 - 15]]) C.walk(a2, z - 15, b2, z - 15, 24); } else C.walk(P.x0 + 15, z - 15, P.x1 - 15, z - 15, 24); }
  for (const z of zs.slice(1, -1)) for (const sd of [-1, 1]) for (let x = P.x0 + 30; x < P.x1 - 30; x += 9) { if (Math.abs(x) < 80 || SX.some(q => q && Math.abs(x - q) < 26) || (z - 15 > -1520 && Math.abs(x) > 690 && Math.abs(x) < 1097)) continue; C.tree(x, z - 15 + sd * 11, 'huai', 1.1, (x | 0) % 27 === 0); } // 槐 rows (宮槐 along the streets of the 皇城)
  for (const sd of [-1, 1]) for (let z = zN + 230; z < zS - 30; z += 9) { if (zs.some(q => Math.abs(z - (q - 15)) < 18)) continue; C.tree(sd * 58, z, 'huai', 1.25, (z | 0) % 27 === 0); }
  // offices by row (N→S, the 2nd–7th 橫街) and side, nearest the 承天門街 first [長安志 7]; 太廟 / 太社 take the SE / SW corners of the last rows
  const OFF = { e: [['門下外省', '殿中省', '左衛', '左千牛衛'], ['左驍衛', '左武衛', '左監門衛'], ['尚書省', '光祿寺', '軍器監'], ['左威衛', '左領軍衛'], ['太僕寺', '少府監'], ['太常寺']],
    w: [['中書外省', '右衛', '右千牛衛', '右監門衛'], ['右驍衛', '右武衛', '將作監'], ['衛尉寺', '大理寺', '司農寺'], ['右威衛', '右領軍衛', '秘書省'], ['御史臺', '宗正寺', '司天監'], ['鴻臚寺']] };
  const PLQ = new Set(['尚書省', '中書外省', '門下外省']), BX = [[P.x0 + T, SX[0] - HW[0]]]; for (let k = 0; k < SX.length - 1; k++) BX.push([SX[k] + HW[k], SX[k + 1] - HW[k + 1]]); BX.push([SX[4] + HW[4], P.x1 - T]);
  const courts = [];
  BX.forEach(([bx0, bx1], i) => { for (let j = 0; j < zs.length - 1; j++) { const bz0 = zs[j] + (j ? 0 : 8), bz1 = zs[j + 1] - 30;
      if (i === 4 && j >= 4) { if (j === 4) TAIMIAO(C, rect(bx0 + 4, bz0, bx1 - 4, zS - 30)); continue; } if (i === 1 && j >= 4) { if (j === 4) TAISHE(C, rect(bx0 + 4, bz0, bx1 - 4, zS - 30)); continue; }
      const n = Math.max(1, Math.round((bx1 - bx0) / 125)); for (let k = 0; k < n; k++) { const a = lerp(bx0, bx1, k / n) + 6, c = lerp(bx0, bx1, (k + 1) / n) - 6; courts.push({ r: rect(a, bz0 + 4, c, bz1), side: (a + c) / 2 < 0 ? 'w' : 'e', j, ax: Math.abs((a + c) / 2), seed: 300 + i * 31 + j * 7 + k }); } } });
  for (const side of ['w', 'e']) for (let j = 0; j < 6; j++) courts.filter(q => q.side === side && q.j === j).sort((p2, q) => p2.ax - q.ax).forEach((q, k) => q.name = (OFF[side][j] || [])[k]);
  for (const q of courts) YUAN(C, q.r, { style: 'office', front: 's', seed: q.seed, name: q.name, plaque: PLQ.has(q.name), big: PLQ.has(q.name) });
}
function TAIMIAO(C, r) { // 太廟: the ancestral temple — a walled precinct with gates on four sides, the hall of 11 bays on a high terrace
  const cx = rcx(r), cz = rcz(r); C.lot('太廟', r.x0, r.z0, r.x1, r.z1); C.zone(r.x0, r.z0, r.x1, r.z1, GC.PAVED);
  C.ring(r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1, { h: 5.5, t: 2 }, [['s', cx, 18], ['n', cx, 18], ['e', cz, 18], ['w', cz, 18]]);
  for (const [x, z, yaw] of [[cx, r.z1 - 1, 0], [cx, r.z0 + 1, PI], [r.x1 - 1, cz, PI / 2], [r.x0 + 1, cz, -PI / 2]]) C.part(x, z, L => PALK.menHall(L, x, z, { yaw, bays: 3, bayW: 6, dbayW: 4.4, colH: 4.8, pass: 1, ph: .8, seed: 310 + (x | 0) }));
  C.part(cx, cz - 10, L => { const t = PALK.terrace(L, cx, 0, cz - 10, [{ w: 78, d: 40, h: 2.2, stairs: [{ side: 's', at: -14, w: 5 }, { side: 's', at: 14, w: 5 }, { side: 's', at: 0, w: 7 }] }, { w: 68, d: 30, h: 1.2, stairs: [{ side: 's', at: 0, w: 7 }] }]); PALK.dian(L, cx, t[1], cz - 10, { bays: 11, dbays: 4, bayW: 5, dbayW: 5, colH: 6, roof: 'hip', cls: 3, lit: .3, seed: 311, tablet: 'pl_太廟', windows: false }); });
  C.part(cx, cz - 55, L => PALK.dian(L, cx, 0, cz - 55, { bays: 9, dbays: 3, bayW: 4.6, dbayW: 4.4, colH: 4.8, roof: 'xieshan', platform: 1, cls: 0, seed: 312, cw: false })); // 寢殿
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, x = cx + Math.cos(a) * rw(r) * .38, z = cz + Math.sin(a) * rd(r) * .38; if (Math.abs(x - cx) < 45 && Math.abs(z - cz) < 40) continue; C.tree(x, z, k % 2 ? 'cypress' : 'pine', 1.2); }
  C.pave(cx - 45, cz + 12, cx + 45, r.z1 - 6);
}
function TAISHE(C, r) { // 太社: square altar 社壇 of five-coloured earth (green E, red S, white W, black N, yellow top) in a walled square, 稷壇 west of it
  const cx = rcx(r), cz = rcz(r); C.zone(r.x0, r.z0, r.x1, r.z1, GC.GARDEN); C.lot('太社', r.x0, r.z0, r.x1, r.z1);
  C.ring(r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1, { h: 4.5, t: 1.6 }, [['s', cx, 14], ['n', cx, 14], ['e', cz, 14], ['w', cz, 14]]);
  for (const [x, z, yaw] of [[cx, r.z1 - 1, 0], [cx, r.z0 + 1, PI], [r.x1 - 1, cz, PI / 2], [r.x0 + 1, cz, -PI / 2]]) C.part(x, z, L => PALK.menHall(L, x, z, { yaw, bays: 3, bayW: 4.6, dbayW: 3.6, colH: 4.2, pass: 1, ph: .5, seed: 320 + (z | 0) }));
  for (const [x, z, s, top] of [[cx + 30, cz, 16, [.82, .7, .36]], [cx - 34, cz, 13, [.5, .42, .3]]]) C.part(x, z, L => { const b = L.mb, cols = [[.34, .5, .32], [.66, .26, .2], [.86, .84, .78], [.18, .17, .17]], h = 1.6; b.s({ tex: 'rammed_earth', col: top }).box(x, h / 2 - .2, z, s, h + .4, s, { skip: ['bot'] });
    if (ARCH.lod !== 2) [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dz], k) => { const c = [cols[0], cols[1], cols[2], cols[3]][[2, 3, 0, 1][k]]; b.s({ tex: 'rammed_earth', col: c }).box(x + dx * (s / 2 + .02), h / 2 - .2, z + dz * (s / 2 + .02), dx ? .04 : s, h + .4, dz ? .04 : s); });
    if (!ARCH.lod) { L.world.box(x, h / 2, z, s / 2, h / 2, s / 2, { surface: 'dirt' }); for (const sd of ['s', 'n', 'e', 'w']) PALK.stairs(L, x + (sd === 'e' ? s / 2 : sd === 'w' ? -s / 2 : 0), 0, z + (sd === 's' ? s / 2 : sd === 'n' ? -s / 2 : 0), 2.4, h, sd); } b.s({ col: [1, 1, 1] }); });
  for (let k = 0; k < 20; k++) { const a = k / 20 * TAU, x = cx + Math.cos(a) * rw(r) * .4, z = cz + Math.sin(a) * rd(r) * .4; C.tree(x, z, k % 3 ? 'huai' : 'pine', 1.2); }
}

// =====================================================================================
// 興慶宮 (南內): 玄宗's palace on his old residence; 龍池 fills the south half; 勤政務本樓 in the SW corner and 花萼相輝樓 on the west
// wall look onto the avenues; 沉香亭 (牡丹) NE of the lake; 興慶殿 / 南薰殿 / 大同殿 in the north. In 815 a secondary palace
// (empress-dowager's residence (?), banquets). After 長安志 卷9, 唐兩京城坊考 卷1 and the 1958 excavation (馬得志).
// =====================================================================================
function PLAN_XINGQING(C) {
  const r = rect(PLAN.cols.E5[0], PLAN.xingqing.z0, PLAN.cols.E5[1], PLAN.xingqing.z1), T = 4, zm = -1600; C.inside = () => true;
  const wl = { h: 7, t: T, tex: 'rammed_earth', batter: .1 }, gW = [[-1720, '興慶門'], [-1350, '金明門']], gS = [[4270, '通陽門']], gN = [[4180, '躍龍門']];
  C.wall(r.x0 + T / 2, r.z0, r.x0 + T / 2, r.z1, wl, gW.map(([z]) => [z - 12 - r.z0, z + 12 - r.z0]).concat([[-1200 - 22 - r.z0, -1200 + 22 - r.z0]]));
  C.wall(r.x1 - T / 2, r.z0, r.x1 - T / 2, r.z1, wl); C.wall(r.x0, r.z1 - T / 2, r.x1, r.z1 - T / 2, wl, gS.map(([x]) => [x - 12 - r.x0, x + 12 - r.x0]).concat([[3880 - 30 - r.x0, 3880 + 30 - r.x0]])); C.wall(r.x0, r.z0 + T / 2, r.x1, r.z0 + T / 2, wl, gN.map(([x]) => [x - 12 - r.x0, x + 12 - r.x0]));
  for (const [z, nm] of gW) { C.part(r.x0 + T / 2, z, L => ARCH.gateTower(L, r.x0 + T / 2, 0, z, { yaw: -PI / 2, w: 26, h: 7, d: 10, passages: nm === '興慶門' ? 3 : 1, pw: 5, ph: 5, open: true, tablet: PALK.gtex(nm), tower: { bays: 5, dbays: 2, roof: 'hip' } })); C.gates.push({ x: r.x0 + .2, z, side: 'w', link: true, name: nm }); C.guardGate(r.x0 + T / 2, z, -PI / 2, 4, 6); }
  for (const [x, nm] of gS) { C.part(x, r.z1 - T / 2, L => ARCH.gateTower(L, x, 0, r.z1 - T / 2, { w: 26, h: 7, d: 10, passages: 1, pw: 5, ph: 5, open: true, tablet: PALK.gtex(nm), tower: { bays: 5, dbays: 2, roof: 'hip' } })); C.gates.push({ x, z: r.z1 - .2, side: 's', link: true, name: nm }); C.guardGate(x, r.z1 - T / 2, 0, 4, 6); }
  for (const [x, nm] of gN) C.part(x, r.z0 + T / 2, L => ARCH.gateTower(L, x, 0, r.z0 + T / 2, { yaw: PI, w: 26, h: 7, d: 10, passages: 1, pw: 5, ph: 5, open: true, tablet: PALK.gtex(nm), tower: { bays: 3, dbays: 2, roof: 'hip' } }));
  for (const [px, pz] of [[r.x1 - T / 2, r.z0 + T / 2], [r.x1 - T / 2, r.z1 - T / 2], [r.x0 + T / 2, r.z0 + T / 2]]) C.part(px, pz, L => PALK.jiaolou(L, px, pz, 7, { s: 12 }));
  // 勤政務本樓 (SW corner, in the south wall, facing the avenue) and 花萼相輝樓 (west wall): two-storey halls on high bases
  C.lot('勤政務本樓', 3850, r.z1 - 29, 3910, r.z1); C.lot('花萼相輝樓', r.x0, -1228, r.x0 + 31, -1172); C.lot('沉香亭', 4550, -1620, 4570, -1600); C.lot('龍池', 3960, -1590, 4640, -1250);
  { const x = 3880, z = r.z1 - 14; C.part(x, z, L => { PALK.terrace(L, x, 0, z, [{ w: 60, d: 30, h: 5, stairs: [{ side: 'n', at: -20, w: 5 }, { side: 'n', at: 20, w: 5 }] }]); ARCH.lou2(L, x, 5, z, { bays: 9, dbays: 4, bayW: 5, dbayW: 4.6, colH1: 6.6, colH2: 4.8, storeys: 2, platform: .3, roof: 'hip', backDoor: true, seed: 401 }); if (!ARCH.lod) { const b = L.mb; b.T(x, 0, z, 0, 0, 0); b.pop(); } }); }
  { const x = r.x0 + 16, z = -1200; C.part(x, z, L => { PALK.terrace(L, x, 0, z, [{ w: 30, d: 56, h: 5, stairs: [{ side: 'e', at: 0, w: 6 }] }]); ARCH.lou2(L, x, 5, z, { yaw: -PI / 2, bays: 9, dbays: 4, bayW: 4.8, dbayW: 4.4, colH1: 6.4, colH2: 4.6, storeys: 2, platform: .3, roof: 'hip', backDoor: true, seed: 402 }); }); }
  C.part(3880, r.z1 - 34, L => { if (!ARCH.lod) { const b = L.mb; b.T(3880, 0, r.z1 - 34); b.pop(); } });
  // 龍池 (fed by the 龍首渠 branch from the north-west), 沉香亭 with peonies on the NE shore, willows
  const lk = HAI(C, 4290, -1420, 330, 150, 411, { trees: 60 }); C.zone(3790, -1600, 4800, -1010, GC.GARDEN);
  { const x = 4560, z = -1610; C.part(x, z, L => { PALK.terrace(L, x, 0, z, [{ w: 14, d: 14, h: 1.4, stairs: [{ side: 's', at: 0, w: 4 }] }]); ARCH.pavilion(L, x, 1.4, z, { sides: 4, r: 3.6, colH: 3.4, platform: .3, paint: 'jade' }); if (!ARCH.lod) for (const [dx, dz] of [[-12, 4], [12, 4], [-12, -6], [12, -6]]) ARCH.peonyBed(L, x + dx, z + dz, 7, 3, 0, (x + dx) | 0); }); }
  { const R2 = RNG(4130); for (let k = 0, n = 0; k < 400 && n < 70; k++) { const x = 3800 + R2() * 980, z = -1590 + R2() * 570; if (lk.inside(x, z, 14) || (x < 3960 && z > -1060) || (x < 3840 && z > -1240 && z < -1160) || Math.abs(x - 3880) < 5 || Math.abs(z + 1215) < 5 || Math.abs(z + 1350) < 5 || (Math.abs(x - 4270) < 5 && z > -1215) || Math.abs(z + 1622) < 5) continue; C.tree(x, z, ['willow', 'peach', 'apricot', 'willow', 'huai', 'pine'][k % 6], 1.1 + R2() * .3, n % 3 === 0); n++; }
    for (const t of [1.2, 2.4, 3.6, 5.6]) { const p = lk.at(t), x = p[0] + Math.cos(t) * 18, z = p[1] + Math.sin(t) * 14; if (z < -1590 || z > -1020) continue; C.part(x, z, L => ARCH.pavilion(L, x, 0, z, { sides: t > 3 ? 8 : 4, r: 3, colH: 3.2, platform: .6, paint: 'jade' })); }
    const hx = 4300, hz = -1598; C.part(hx, hz, L => { const tt = PALK.terrace(L, hx, 0, hz, [{ w: 30, d: 20, h: 1.2, stairs: [{ side: 's', at: 0, w: 5 }, { side: 'n', at: 0, w: 5 }] }]); PALK.dian(L, hx, tt[0], hz, { bays: 5, dbays: 3, bayW: 4.6, dbayW: 4.2, colH: 4.6, roof: 'xieshan', paint: 'jade', cls: 3, seed: 431, backDoor: true }); }); } // 龍堂 on the north shore
  // the palace courts in the north half: 興慶殿 axis (west of centre), 南薰殿, 大同殿 (east)
  const xd = DIANTING(C, 4060, -2120, -1830, 240, { gate: { bays: 5 }, hall: { bays: 9, dbays: 4, bayW: 5, dbayW: 4.8, colH: 5.6, tablet: 'pl_興慶殿' }, hz: -1990, tiers: [[1.6, 6, 6]] });
  // the empress-dowager 王氏 (順宗's empress) lived here in 815 [舊唐書 15]: receiving in 興慶殿 by day; ladies in the gardens by 沉香亭 in the afternoon
  { const zt = xd.hz - 19.2 * .18 - 1.1; C.person('palacelady', 4060, xd.floor + 1.37, zt, 0, 'sit', [9, 12], { seated: true, seed: 811 }); for (const sd of [-1, 1]) { C.person('nanzhuang', 4060 + sd * 3.6, xd.floor + .36, zt + .6, 0, 'stand', [9, 12]); C.person('eunuch', 4060 + sd * 7, xd.floor, zt + 6, 0, 'stand', [8, 17]); } }
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, x = 4560 + Math.cos(a) * (10 + (k % 3) * 3), z = -1593 + Math.sin(a) * 7; C.person(k % 3 ? 'palacelady' : 'maid', x, 0, z, a + PI / 2, ['talk', 'look', 'stand', 'talk'][k % 4], [14.5, 18.5], { seed: 820 + k }); }
  for (let k = 0; k < 4; k++) C.person('musician', 4556.7 + k * 2.2, 1.7, -1612, 0, 'pipa', [15, 18], { seated: true, seed: 830 + k });
  for (const sd of [-1, 1]) C.person('palaceguard', 3880 + sd * 6, 0, r.z1 + 3, 0, 'stand', null);
  DIANTING(C, 4060, -1800, -1640, 180, { gate: { bays: 3, bayW: 5 }, hall: { bays: 7, dbays: 4, bayW: 4.8, dbayW: 4.4, colH: 5, roof: 'xieshan', tablet: 'pl_南薰殿' }, hz: -1730, tiers: [[1.2, 5, 5]], throne: false });
  YUAN(C, rect(4420, -2180, 4620, -1990), { style: 'gong', name: '大同殿', big: true, seed: 421 }); YUAN(C, rect(4640, -2180, 4820, -1990), { style: 'gong', seed: 422 });
  YUAN(C, rect(4420, -1960, 4620, -1760), { style: 'gong', seed: 423 }); YUAN(C, rect(4640, -1960, 4820, -1760), { style: 'garden', seed: 424 }); YUAN(C, rect(3790, -2200, 3920, -2000), { style: 'office', front: 'e', seed: 425 });
  INFILL(C, rect(r.x0 + 10, r.z0 + 10, r.x1 - 10, -1610), { seed: 441, step: 26, clear: 16 });
  C.walk(r.x0, -1720, 3955, -1720, 8); C.walk(3955, -1720, 3955, -1622, 6); C.walk(4300, -2220, 4300, -1622, 6); C.walk(3880, -1622, 4740, -1622, 5); C.walk(3880, -1622, 3880, -1215, 5); C.walk(3880, -1215, 4270, -1215, 5); C.walk(4270, -1215, 4270, r.z1, 6); C.walk(r.x0, -1350, 3880, -1350, 5); // round the 南薰 court and the lake
}

// ---- the court of 大明宮 through the day (static people; PALACE.people filters by hour). Sources: 新唐書 儀衛志 (常朝: officials in ranks
// left and right of the court, 千牛 beside the throne, fans), 唐會要 24 (朔望 at 宣政殿, 入閤 at 紫宸殿), 延英召對 of the 宰相, 麟德殿 banquets.
function COURT_DAMING(C, A) {
  const { cx, hz, hz2, hz3, lx, lz } = A, R = RNG(8150), seat = 1.37;
  // the emperor's day (a representative day; every placement carries 'place' for PALACE.whereIs). 憲宗 lived in the 內廷 of 大明宮; the
  // sleeping hall is not recorded for 815; 含涼殿 on the north shore of 太液池 (長安志 6) is used here as a summer sleeping hall —
  // a reconstruction. Night (22–5): asleep on a 床 in its east bay, a eunuch and a lady on watch, guards at the steps.
  { const hz5 = -5620, fl = 1.0, bx = cx + 13.8, bz = hz5 - 4.2; C.part(bx, bz, L => PALK.bed(L, bx, fl, bz, 0, { w: 2.4, d: 1.6, h: .5 }));
    C.part(cx, hz5 - 2.5, L => PALK.bed(L, cx, fl, hz5 - 2.5, 0, { ta: true, w: 2.6, d: 1.8, h: .42 }));
    const E = (x, y, z, yaw, anim, hrs, place, o = {}) => C.person('emperor', x, y, z, yaw, anim, hrs, Object.assign({ place, seed: 9 }, o));
    E(bx + .1, fl + .5, bz, PI, 'sleep', [22, 5], '含涼殿 (寢)'); /* along the bed, head to the east end (crowd lying convention: yaw = atan2(hz, -hx) for head direction (1, 0)) */ C.person('eunuch', cx + 9.2, fl, bz + 1.2, PI / 2, 'wait', [22, 5]); C.part(cx + 9.4, bz - .3, L => PALK.mat(L, cx + 9.4, fl, bz - .3, PI / 2)); C.person('palacelady', cx + 9.4, fl + .04, bz - .3, PI / 2, 'kneel', [22, 5], { seated: true, seed: 901 });
    E(cx + 9.2, fl, hz5 - .2, 0, 'stand', [5, 5.9], '含涼殿 (更衣)'); /* between the column rows (x ±6.9 / ±11.5, z ±2.1) */ for (let k = 0; k < 3; k++) C.person(k < 2 ? 'palacelady' : 'eunuch', cx + 9.2 + (k - 1) * 1.1, fl, hz5 + .9 + (k % 2) * .3, PI, k < 2 ? 'serve' : 'stand', [5, 5.9], { seed: 902 + k });
    // midday (12–15): rest in 含涼殿 on the 榻, ladies talking on mats, a musician
    E(cx, fl + .42, hz5 - 2.7, 0, 'sit', [12, 15], '含涼殿', { seated: true }); for (let k = 0; k < 4; k++) { const mx = cx + [-3.6, -1.1, 1.1, 3.6][k], mz = hz5 + 1.1 + (k % 2) * .4; C.part(mx, mz, L => PALK.mat(L, mx, fl, mz, PI)); C.person(k === 3 ? 'musician' : 'palacelady', mx, fl + .04, mz, PI, k === 3 ? 'pipa' : 'sit_talk', [12, 15], { seated: true, seed: 910 + k }); }
    C.person('eunuch', cx + 4.5, fl, hz5 - 1.5, -PI / 2, 'wait', [12, 15]); C.person('eunuch', cx - 4.5, fl, hz5 - 1.5, PI / 2, 'wait', [12, 15]);
    for (const sd of [-1, 1]) C.person('palaceguard', cx + sd * 4.2, 0, hz5 + 12.5, 0, 'stand', null); }
  // afternoon (15–17): boating on 太液池 (a pleasure boat with a cabin; a boatman at the stern, a lady and a eunuch aboard; a guard boat near)
  { const bx = 1930, bz = -5760, dk = -.17; C.part(bx, bz, L => PALK.boat(L, bx, bz, 0, { len: 10 })); C.part(bx + 14, bz + 6, L => PALK.boat(L, bx + 14, bz + 6, 0, { len: 8, cabin: false }));
    C.person('emperor', bx, dk, bz - .3, 0, 'sit', [15, 17], { seated: true, place: '太液池 (泛舟)', seed: 9, boat: true }); C.person('palacelady', bx, dk, bz - 2.4, PI, 'sit_talk', [15, 17], { seated: true, seed: 920, boat: true });
    C.person('eunuch', bx + .5, dk, bz + 2.3, 0, 'stand', [15, 17], { boat: true }); C.person('labourer', bx, dk, bz + 3.1, 0, 'work', [15, 17], { seed: 921, boat: true });
    for (let k = 0; k < 2; k++) C.person('palaceguard', bx + 14, dk, bz + 6 + (k - .5) * 2.4, 0, 'stand', [15, 17], { boat: true }); }
  // evening (17–18): in the 水殿 over the water, then to the 麟德殿 banquet (18–22)
  if (C.shuidian) { const m = C.shuidian, F = ARCH.F(m.x, 0, m.z, m.yaw), P = (a, b2) => F.p(a, 0, b2), t = P(0, -1.2); C.part(t[0], t[2], L => PALK.bed(L, t[0], m.floor, t[2], m.yaw, { ta: true, w: 2.4, d: 1.6, h: .42 }));
    C.person('emperor', t[0], m.floor + .42, t[2], m.yaw, 'sit_drink', [17, 18], { seated: true, place: '水殿', seed: 9 });
    for (let k = 0; k < 3; k++) { const p = P((k - 1) * 2.2, 1.6), yw = Math.atan2(t[0] - p[0], t[2] - p[2]); C.part(p[0], p[2], L => PALK.mat(L, p[0], m.floor, p[2], yw)); C.person(k === 1 ? 'musician' : 'palacelady', p[0], m.floor + .04, p[2], yw, k === 1 ? 'pipa' : 'sit_talk', [17, 18], { seated: true, seed: 930 + k }); }
    for (const sd of [-1, 1]) { const p = P(sd * 4, -.5); C.person('eunuch', p[0], m.floor, p[2], m.yaw, 'wait', [17, 18]); } }
  // dawn: officials ride in through 建福門 / 望仙門 and wait; 常朝 at 宣政殿 (6:00–8:30)
  C.person('emperor', cx, 3.2 + seat, hz2 - 6 - 1.1, 0, 'sit', [6, 8.5], { seated: true, seed: 1, place: '宣政殿 (常朝)' });
  for (const sd of [-1, 1]) { C.person('palaceguard', cx + sd * 3.6, 3.2 + .36, hz2 - 6 - .2, 0, 'stand', [6, 8.5]); C.person('eunuch', cx + sd * 5.5, 3.2, hz2 - 4, 0, 'stand', [6, 8.5]); }
  // the 班 in the court (常參官: 文官五品以上, 兩省供奉官, 監察御史, 員外郎, 太常博士 … [唐六典 2; 新唐書 儀衛志]): 文東武西, each side in
  // rows by grade (異位重行) — purple (三品以上), 緋 (四五品), 綠 (六七品), 青 (八九品) — the higher post nearer the 御道, all facing north
  // with their 笏; the 宰相 at the head of the civil 班; 監察御史 at the ends of the 班 and 殿中侍御史 at the foot of the steps keep order.
  const RANK = PALACE_RANK, BAN = { e: [['p', 16], ['c', 48], ['g', 60], ['b', 16]], w: [['p', 30], ['c', 30], ['g', 14], ['b', 6]] }, PER = 12, DX = 1.3, DZ = 1.7, X0 = 10.5, Z0 = hz2 + 30;
  for (let k = 0; k < 3; k++) C.person('official', cx + X0 + k * DX, 0, Z0 - DZ, PI, 'stand', [6, 8.5], { seed: 990 + k, cols: [RANK.p] }); // 宰相 (張弘靖, 韋貫之; 武元衡 until 6/3, 裴度 from 6/25)
  for (const [side, sd] of [['e', 1], ['w', -1]]) { let row = 0; for (const [rk, n] of BAN[side]) { for (let i = 0; i < n; i++) { const r = row + Math.floor(i / PER), k = i % PER; C.person('official', cx + sd * (X0 + k * DX), 0, Z0 + r * DZ, PI, 'stand', [6, 8.5], { seed: 1000 + (sd > 0 ? 0 : 500) + r * 20 + k, cols: [RANK[rk]] }); } row += Math.ceil(n / PER); }
    const zE = Z0 + row * DZ; C.person('official', cx + sd * (X0 + PER * DX + 1.2), 0, (Z0 + zE) / 2, -sd * PI / 2, 'stand', [6, 8.5], { seed: 1900 + sd, cols: [RANK.b] }); C.person('official', cx + sd * (X0 + PER * DX / 2), 0, zE + 1.2, PI, 'stand', [6, 8.5], { seed: 1910 + sd, cols: [RANK.b] }); // 監察御史
    C.person('official', cx + sd * 6.5, 0, hz2 + 25.5, 0, 'stand', [6, 8.5], { seed: 1920 + sd, cols: [RANK.g] }); } // 殿中侍御史 at the foot of the steps, facing the 班
  // in the hall: the 兩省供奉官 flank the way to the throne (門下 east, 中書 west), 起居郎 / 起居舍人 by the throne recording
  for (const [sd, list] of [[1, 'ccccggbb'], [-1, 'cccggbb']]) for (let i = 0; i < list.length; i++) C.person('official', cx + sd * 7.5, 3.2, hz2 - 4 + i * 1.6, -sd * PI / 2, 'stand', [6, 8.5], { seed: 1950 + i + (sd > 0 ? 0 : 20), cols: [RANK[list[i]]] });
  for (const sd of [-1, 1]) C.person('official', cx + sd * 6.6, 3.2, hz2 - 8, -sd * PI / 2, 'stand', [6, 8.5], { seed: 1990 + sd, cols: [RANK.g] });
  for (let z = -5110; z > hz2 + 26; z -= 7) for (const sd of [-1, 1]) C.person('palaceguard', cx + sd * 7.5, 0, z, sd * PI / 2 * -1, 'stand', [5.5, 9]);
  // 入閤 at 紫宸殿 (8:30–10:30): the 宰相 and a few officials stand before the throne inside the hall
  C.person('emperor', cx, 2.4 + seat, hz3 - 4.5 - 1.1, 0, 'sit', [8.5, 10.5], { seated: true, seed: 2, place: '紫宸殿 (入閤)' });
  for (let k = 0; k < 6; k++) C.person('official', cx + (k - 2.5) * 2.2, 2.4, hz3 + 2 + (k % 2) * 1.4, PI, k % 3 ? 'stand' : 'bow', [8.5, 10.5], { seed: 200 + k });
  for (const sd of [-1, 1]) { C.person('palaceguard', cx + sd * 3.6, 2.4 + .36, hz3 - 4.7, 0, 'stand', [8.5, 10.5]); C.person('nanzhuang', cx + sd * 5, 2.4, hz3 - 6, 0, 'stand', [8.5, 10.5]); /* 千牛 on the throne's lower step (.36), attendants on the hall floor */ }
  // 延英召對 (10:30–12:00): the emperor with three 宰相 kneeling on mats in 延英殿 (裴度 (from 6/25), 韋貫之, 張弘靖 in 815)
  if (C.yanying) { const m = C.yanying.main, F = ARCH.F(m.x, 0, m.z, m.yaw), P = (a, b) => F.p(a, 0, b), e = P(0, -2.6);
    C.part(e[0], e[2], L => PALK.bed(L, e[0], m.floor, e[2], m.yaw, { ta: true, w: 2.6, d: 1.8, h: .42 })); // the emperor on a 榻 (a low dais with a mat); the 宰相 on mats before him
    C.person('emperor', e[0], m.floor + .42, e[2], m.yaw, 'sit', [10.5, 12], { seated: true, seed: 3, place: '延英殿 (召對)' });
    for (let k = 0; k < 3; k++) { const p = P((k - 1) * 1.9, 1.3 - Math.abs(k - 1) * .4), yw = Math.atan2(e[0] - p[0], e[2] - p[2]); C.part(p[0], p[2], L => PALK.mat(L, p[0], m.floor, p[2], yw)); C.person('official', p[0], m.floor + .04, p[2], yw, 'sit_talk', [10.5, 12], { seated: true, seed: 300 + k, cols: [PALACE_RANK.p] }); }
    { const p = P(3.5, -2); C.person('eunuch', p[0], m.floor, p[2], m.yaw - PI / 2, 'stand', [10.5, 12]); } }
  // 翰林學士 at their desks (by day; one on night duty 宿直)
  if (C.hanlin) { const m = C.hanlin.main, F = ARCH.F(m.x, 0, m.z, m.yaw); for (let k = 0; k < 4; k++) { const p = F.p((k - 1.5) * 2.4, 0, .5); C.part(p[0], p[2], L => PALK.mat(L, p[0], m.floor, p[2], m.yaw)); C.person('scholar', p[0], m.floor + .04, p[2], m.yaw, 'write', k ? [8, 17] : [8, 24], { seated: true, seed: 400 + k }); } }
  // 麟德殿 banquet (18:00–22:00): the emperor on the throne, guests at their low desks, musicians, palace ladies serving
  C.person('emperor', lx, 2.7 + seat, lz - 10 - 1.1, 0, 'sit_drink', [18, 22], { seated: true, seed: 5, place: '麟德殿 (宴)' });
  for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) for (let j = 0; j < 5; j++) { const F = ARCH.F(lx + sd * 13, 2.7, lz - 2, -sd * PI / 2), p = F.p((i - .5) * 2.2, 0, (j - 2) * 3.1); C.person(j % 4 ? 'official' : 'sogdian', p[0], 2.74, p[2], -sd * PI / 2, j % 2 ? 'sit_drink' : 'sit_talk', [18, 22], { seated: true, seed: 500 + i * 5 + j + (sd > 0 ? 20 : 0) }); }
  for (let k = 0; k < 5; k++) C.part(lx + (k - 2) * 2, lz + 3, L => PALK.mat(L, lx + (k - 2) * 2, 2.7, lz + 3, PI)); for (let k = 0; k < 5; k++) C.person('musician', lx + (k - 2) * 2, 2.74, lz + 3, PI, 'pipa', [18, 22], { seated: true, seed: 600 + k });
  for (let k = 0; k < 4; k++) C.person('palacelady', lx + (k - 1.5) * 4, 2.7, lz - 1 - (k % 2) * 5, k % 2 ? PI / 2 : -PI / 2, 'serve', [18, 22], { seed: 650 + k });
  // the plaza: guards at the 闕 and the ramps; officials waiting by the 朝堂 at dawn
  for (const sx of [-1, 1]) { C.person('palaceguard', cx + sx * 26 - 4.5, 0, hz + 70 + 48, 0, 'stand', null); C.person('palaceguard', cx + sx * 26 + 4.5, 0, hz + 70 + 48, 0, 'stand', null);
    for (let k = 0; k < 10; k++) C.person('official', cx + sx * (106 - (k % 3) * 2.5), 0, hz + 147 + k * 3.4, -sx * PI / 2, k % 4 ? 'talk' : 'wait', [4.5, 6.2], { seed: 700 + k + (sx > 0 ? 20 : 0) }); }
  for (const sd of [-1, 1]) C.person('palaceguard', cx + sd * 4, 13, hz + 18, 0, 'stand', null);
  // the dawn procession up the two 龍尾道 (officials climbing to the terrace for the audience), 5:40–6:10
  const zT0 = hz + 70; for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) { const t = .1 + k * .12, y = 5.5 * t, z = zT0 + 46 - 46 * t; C.person('official', cx + sx * 26 + (k % 2 ? 1.6 : -1.6), y, z, PI, k % 3 ? 'stand' : 'bow', [5.6, 6.15], { seed: 760 + k + (sx > 0 ? 10 : 0) }); }
}
