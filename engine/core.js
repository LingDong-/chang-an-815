// core.js (formerly game.js): boot, time of day / sky, player (first person), shared by changan815/ and drums/
'use strict';
// core.js — the shared runtime (frame loop, player, doors, map, console, HUD, boot) of both apps. Each app defines window.APP
// before this file: { id, title (vertical title-card text), sub, controls (bottom line), root (path to the project root from the page,
// default '../'), start(), update(dt), hud(), draw() } — all optional.
const APP = window.APP || {};
const Q = new URLSearchParams(location.search.slice(1) + (window.__ARGS ? '&' + window.__ARGS : '')), qn = (k, d) => Q.has(k) ? +Q.get(k) : d;
const G = {
  t: 0, hour: qn('hour', 17.3), daySec: qn('day', 2880), // real seconds per game day (default 48 min)
  fly: Q.has('fly'), debug: Q.has('debug'), scene: Q.get('scene') || 'city', hold: false,
  P: { pos: [qn('x', 2010), qn('y', 0), qn('z', -600)], vel: [0, 0, 0], yaw: qn('yaw', 0), pitch: qn('pitch', 0), onGround: false, eye: 1.55, r: .28, h: 1.7, bob: 0, ck: 0, crouch: false, lean: 0 },
  world: null, fps: 60,
};

// ---------------- time of day: sun, sky, fog (Chang'an 34.3°N, mid-summer; dusty loess haze) ----------------
const ENV_KEYS = [ // by sun elevation (degrees): sky top, horizon, ground bounce, sun colour, fog colour, ambient sky
  { el: -18, top: [.03, .04, .075], hor: [.07, .085, .13], gnd: [.045, .05, .065], sun: [0, 0, 0], fog: [.07, .085, .12], sky: [.17, .195, .28] },
  { el: -6, top: [.06, .07, .16], hor: [.32, .24, .3], gnd: [.05, .045, .06], sun: [.1, .05, .05], fog: [.24, .19, .24], sky: [.16, .15, .22] },
  { el: 0, top: [.16, .2, .38], hor: [.86, .52, .34], gnd: [.12, .09, .08], sun: [.9, .42, .2], fog: [.62, .44, .36], sky: [.3, .28, .36] },
  { el: 6, top: [.22, .32, .55], hor: [.9, .7, .5], gnd: [.2, .15, .11], sun: [1.15, .78, .48], fog: [.76, .62, .5], sky: [.4, .4, .48] },
  { el: 20, top: [.3, .46, .72], hor: [.84, .8, .7], gnd: [.26, .21, .16], sun: [1.2, 1.02, .82], fog: [.78, .74, .66], sky: [.5, .52, .6] },
  { el: 60, top: [.32, .5, .78], hor: [.82, .82, .76], gnd: [.3, .25, .19], sun: [1.25, 1.15, 1.0], fog: [.8, .79, .74], sky: [.55, .58, .66] },
];
function envAt(hour) {
  const lat = 34.3 * PI / 180, dec = 21 * PI / 180, H = (hour - 12) / 12 * PI;
  // local frame: x east, y up, z south
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), el = Math.asin(clamp(up, -1, 1));
  const sunD = v3norm([-Math.cos(dec) * Math.sin(H), up, -(Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H))]);
  const e = el * 180 / PI; let i = 0; while (i < ENV_KEYS.length - 2 && e > ENV_KEYS[i + 1].el) i++;
  const A = ENV_KEYS[i], B = ENV_KEYS[i + 1], t = clamp((e - A.el) / (B.el - A.el), 0, 1), m = k => mixc(A[k], B[k], t);
  const night = clamp(-e / 10, 0, 1), sunUp = clamp((e + 2) / 6, 0, 1);
  // moonlight at night (cool, from high)
  const lightD = sunUp > 0 ? sunD : v3norm([.3, .8, .4]), sunC = sunUp > 0 ? m('sun').map(v => v * sunUp) : [.2, .24, .36];
  return {
    sky: m('sky'), gnd: m('gnd'), sunD: lightD, sunC, fogC: m('fog'), skyTop: m('top'), skyHor: m('hor'), skyBot: mixc(m('gnd'), m('fog'), .5),
    cloudC: mixc(m('hor'), [1, 1, 1], .3), clouds: .62, stars: night * .8, skySunC: m('sun'), grade: [1.03, 1, .95], sat: 1.02 - night * .3, gam: 1.04, vig: 1.15,
    lv: 48, ink: .3, inkC: [.07, .05, .05], grain: .035, bands: 14, fog: night > .5 ? [30, 2200, -99, 0] : [40, 5200, -99, 0], el: e, night,
    haze: sunUp > 0 ? m('sun').map(v => v * .55 * sunUp) : [0, 0, 0], shaft: sunUp * (e < 25 ? 1 : .6), shaftC: m('sun').map(v => v * .35), emiK: .35 + .65 * clamp(night * 1.5 + (1 - sunUp) * .5, 0, 1),
  };
}
// lamp groups (night lamplight, kit.js): 1 evening (households, shops) out by ~21:30, 2 late (great houses, 北里, 崇仁) by ~23:30,
// 3 all night (wine shops, inns, temple altars); lit from dusk. Window glow (VS_MAIN uLampK) and room lights (CITY.lights) follow it.
function lampK(h) { const on = (a, b) => { const hh = h < 12 ? h + 24 : h; return clamp((hh - a) / .3, 0, 1) * clamp((b - hh) / .3, 0, 1); }; return [1, on(17.2, 21.6), on(17.2, 23.6), on(17.2, 29.6)]; }
function applyEnv() { R.lampK = lampK(G.hour); const e = envAt(G.hour); Object.assign(R.env, e); if (G.retro === 1 || G.retro === 2) Object.assign(R.env, { lv: 20, grain: .07, ink: .42 }); if (G.envOverride) Object.assign(R.env, G.envOverride); }
function setRetro(on) { G.retro = clamp(on | 0, 0, 3); R.setWire(G.retro === 3); R.setPalette(G.retro === 2 ? 'endesga32' : null); R.resize(G.retro === 3 ? Math.min(1440, Math.round(innerHeight * (devicePixelRatio || 1))) : G.retro ? 240 : QUALITY.h()); try { localStorage.setItem('drums_retro', String(G.retro)); } catch (e) { } } // 0 smooth, 1 ordered-dither posterize, 2 ENDESGA32 palette, 3 wireframe (R.wire: white fill + black triangle edges at full resolution)

// ---------------- scenes ----------------
const SCENES = {};
// kit test: a strip of ground with some halls, a ward wall and a gate (visual check of the Tang kit)
SCENES.kit = () => {
  const L = makeL(); const w = L.world;
  L.terrain({ x0: -80, z0: -80, w: 160, d: 160, cell: 4, h: () => 0, layers: ['dirt', 'dirt', 'dirt', 'dirt'] });
  ARCH.hall(L, 0, 0, -14, { bays: 5, dbays: 3, roof: 'hip', brackets: 'full', platform: 1, tablet: false, doorOpen: true });
  ARCH.hall(L, -16, 0, 4, { yaw: PI / 2, bays: 3, dbays: 2, roof: 'xieshan', brackets: 'simple', platform: .6 });
  ARCH.hall(L, 16, 0, 4, { yaw: -PI / 2, bays: 3, dbays: 2, roof: 'gable', brackets: 'none', platform: .4, paint: 'plain' });
  ARCH.wall(L, -30, 22, 30, 22, { style: 'rammed', h: 3.2, t: 2.6 });
  void w; return finishL(L);
};
// one ward (平康), streamed like the city: building a whole ward as one mesh no longer fits in memory
SCENES.ward = () => { if (!Q.has('slice')) Q.set('slice', '平康'); return SCENES.city(); };
// the city: walkable slice (REF_CHANGAN.md 'ministers' road') + the whole of Chang'an at distance
SCENES.city = () => {
  const slice = Q.get('slice') ? (Q.get('slice') === 'all' ? 'all' : Q.get('slice').split(',')) : (APP.slice || 'all'); // default: the whole city walkable
  if (Q.has('lod1r')) CITY.LOD1R = +Q.get('lod1r'); // tests: smaller bakes
  CITY.init({ slice }); G.lay = CITY.lay[0]; G.nav = CITY.nav;
  return { draw: () => CITY.draw(), update: () => CITY.update(), lights: [] };
};
SCENES.region = SCENES.city;
function finishL(L) { return { mesh: L.mb.upload(), fol: L.fol.upload(), terrs: L.terrs.map(t => ({ m: t.b.upload(), layers: t.layers })), lights: L.lights }; }

// ---------------- the city's clock: drums, ward gates, market (REF_CHANGAN.md §7) ----------------
// dusk: 800 beats of the street drums from 19:00, gates shut at 19:30. dawn: 五更二點 (~4:24) palace drums, street drums
// answer, 3000 beats; gates open at 5:00. market: drum 200 at noon opens, gong 300 at ~17:20 closes.
const CLOCK = {
  EV: [[19.0, 'dusk drums', '日暮 · 街鼓八百聲', () => AUX('drums', 'dusk')], [19.5, 'gates shut', '坊門閉', null], [4.4, 'dawn drums', '五更二點 · 鼓三千撾', () => AUX('drums', 'dawn')], [5.0, 'gates open', '坊門開', null],
    [12.0, 'market opens', '市鼓二百', () => AUX('drums', 'market_open', CLOCK.market())], [17.33, 'market closes', '市鉦三百', () => AUX('drums', 'market_close', CLOCK.market())]],
  last: null, msg: null, msgT: 0,
  curfew(h = G.hour) { return h >= 19.5 || h < 5.0; },
  market() { const P = G.P.pos, ms = typeof CITY !== 'undefined' && CITY.all ? CITY.all.filter(w => w.kind === 'market') : []; let b = null, bd = 1e9; for (const m of ms) { const d = Math.hypot(rcx(m.r) - P[0], rcz(m.r) - P[2]); if (d < bd) { bd = d; b = m; } } return b ? { x: rcx(b.r), z: rcz(b.r) } : {}; },
  update(dt) {
    const h = G.hour; if (this.last !== null) for (const [t, , cn, fn] of this.EV) { const crossed = this.last <= h ? (this.last < t && t <= h) : (this.last < t || t <= h); if (crossed) { this.msg = cn; this.msgT = 6; if (fn) fn(); } }
    this.last = h; this.msgT -= dt;
    if (typeof CITY !== 'undefined' && CITY.ready) CITY.setVis(G.hour); // open/closed buildings by the hour
    const target = this.curfew() ? 0 : 1; G.gateOpen = G.gateOpen === undefined ? target : G.gateOpen + clamp(target - G.gateOpen, -dt / 8, dt / 8);
    if (typeof CITY !== 'undefined' && CITY.ready) CITY.setGatesSolid(G.gateOpen < .35);
  },
};
// ---------------- audio hookup (see AUDIO.md) ----------------
const SOUND = {
  t: 0, step: 0, loops: new Set(),
  district() { if (G.inside) return 'interior'; if (typeof CITY === 'undefined' || !CITY.ready) return 'ward'; const P = G.P.pos;
    const wd = CITY.all.find(w => inR(w.r, P[0], P[2])); if (!wd) return 'avenue'; if (wd.kind === 'market') return 'market'; if (wd.kind === 'palace') return 'palace';
    const lay = CITY.lay.find(l => l.wd === wd), lot = lay && lay.lots.find(l => inR(l.r, P[0], P[2])); return lot && lot.type === 'temple' && !COMP.isDao(lot) ? 'temple' : lot && lot.type === 'quarter' ? 'quarter' : 'ward'; },
  update(dt) {
    if (typeof AU === 'undefined') return; this.t -= dt;
    if (this.t <= 0) { this.t = .25; let crowd = 0; if (typeof CROWD !== 'undefined' && CROWD.near && !G.inside) { const n = CROWD.near(G.P.pos[0], G.P.pos[2], 18); crowd = clamp((n ? n.length : 0) / 25, 0, 1); }
      let mus = G.inside ? ({ wineshop: 'tavern', quarter: 'quarter', temple: 'temple' }[G.inside.I.kind] || null) : (G.hour >= 21 || G.hour < 4 ? 'night' : null); if (APP.music) { const m = APP.music(); if (m !== undefined) mus = m; } if (mus !== this.mus) { this.mus = mus; AUX('music', mus, { fade: 2 }); }
      const hAbove = G.P.pos[1] - (typeof CITY !== "undefined" && CITY.ready && CITY.height ? CITY.height(G.P.pos[0], G.P.pos[2]) : 0), hear = G.inside ? 1 : clamp(1 - (hAbove - 6) / 24, 0, 1); this.hear = hear; crowd *= hear; // people fade out between ~6 and 30 m above the ground (wind, bells, chant stay)
      AUX('set', { hear, hour: G.hour, district: this.district(), crowd: G.inside ? .7 : crowd, indoor: G.inside ? 1 : 0, curfew: CLOCK.curfew(), alert: APP.alert ? APP.alert() : 0, wind: .25, rain: 0 }); this.loopsNear(); }
  },
  // positional loops: wine shops (bed + music), shops, temples (chant) within 70 m
  loopsNear() {
    if (typeof CITY === 'undefined' || !CITY.ready || G.inside) return; const P = G.P.pos, keep = new Set();
    for (const lay of CITY.lay) { if (!inR(lay.wd.r, P[0], P[2], 80)) continue; for (const l of lay.lots) { const x = rcx(l.r), z = rcz(l.r); if (Math.abs(x - P[0]) > 70 || Math.abs(z - P[2]) > 70) continue;
      const k = 'lot' + l.seed, t = l.type === 'wineshop' ? 'wineshop' : l.type === 'temple' ? (COMP.isDao(l) ? null : 'chant') : (l.type === 'shop' || l.type === 'stall') && (l.seed % 7 === 0) ? ['smithy', 'carpentry', 'loom', 'oven', 'mill'][l.seed % 5] : null; if (!t) continue;
      keep.add(k); AUX('loop', k, t, { x, y: 1.2, z }); if (t === 'wineshop') { keep.add(k + 'm'); AUX('loop', k + 'm', 'music:tavern', { x, y: 1.5, z, vol: .6 }); } } }
    // 北里 in the evening: 箏 / 琵琶 from a few of the great houses (the two nearest within 45 m)
    if (G.hour >= 17.5 || G.hour < 1) { const qs = []; for (const lay of CITY.lay) { if (!inR(lay.wd.r, P[0], P[2], 60)) continue; for (const l of lay.lots) if (l.type === 'quarter' && l.wealth >= 3 && l.seed % 3 === 0) { const x = rcx(l.r), z = rcz(l.r), d = Math.hypot(x - P[0], z - P[2]); if (d < 45) qs.push([d, l, x, z]); } }
      qs.sort((a, b) => a[0] - b[0]); for (const [, l, x, z] of qs.slice(0, 2)) { const k = 'qm' + l.seed; keep.add(k); AUX('loop', k, 'music:quarter', { x, y: 2, z, vol: .45 }); } }
    for (const k of this.loops) if (!keep.has(k)) AUX('stop', k, .5); this.loops = keep;
  },
  foot(dist) { const P = G.P; this.step += dist; const stride = P.run ? 1.6 : P.crouch ? .8 : 1.25; if (this.step < stride) return; this.step = 0;
    const s0 = G.inside ? (G.inside.I.kind === 'hut' || G.inside.I.kind === 'shop' ? 'dirt' : 'wood') : (P.surf || 'dirt'), sf = s0 === 'thatch' ? 'grass' : s0 === 'water' ? 'water' : s0;
    AUX('step', sf, { run: P.run, crouch: P.crouch, vol: P.run ? .32 : P.crouch ? .1 : .22 });
    NOISE.emit(P.pos[0], P.pos[1], P.pos[2], (P.run ? 11 : P.crouch ? 1.2 : 4) * (PLAYER.STEP_R[s0] || 1), 'step');
    if (s0 === 'tile' && Math.random() < (P.run ? .45 : P.crouch ? 0 : .07)) PLAYER.clatter(P.run ? 1 : .4); },
};
function AUX(fn, ...a) { try { if (typeof AU !== 'undefined' && AU[fn]) AU[fn](...a); } catch (e) { console.warn('audio', fn, e.message); } }

// ---------------- entering buildings: the door prompt, a short fade, the interior scene; walk out of the door to leave ----------------
const DOORS = {
  near: null, fade: 0, pending: null,
  find() { // nearest lot door within 2.6 m
    if (typeof CITY === 'undefined' || !CITY.nav || G.inside) return null; const P = G.P.pos, N = CITY.nav; let best = null, bd = 2.6;
    for (const i of N.doors) { const n = N.nodes[i], d = Math.hypot(n.x - P[0], n.z - P[2]); if (d < bd && n.lot && INTERIOR.kindOf(n.lot)) { bd = d; best = n; } } return best;
  },
  update(dt) {
    if (this.pending) { this.fade = Math.min(1, this.fade + dt * 3); if (this.fade >= 1) { const f = this.pending; this.pending = null; f(); } return; }
    this.fade = Math.max(0, this.fade - dt * 2.5);
    if (G.inside) { const e = G.inside.exit, P = G.P.pos; this.atDoor = Math.hypot(P[0] - e.x, P[2] - e.z) < e.r; if (this.atDoor && Input.hit('KeyE')) this.go(() => leaveBuilding()); return; }
    // closed doors in the world (chunk meta, see CITY.SCHED): E passes to the other side. Open buildings are simply walked into.
    if ((R.frame & 7) === 0) { this.door = this.findDoor(); this.near = Q.has('oldinteriors') && !this.door ? this.find() : null; }
    const USE = APP.useKey || 'KeyE';
    // stealth apps: tap = push the door open fast (loud), hold = ease it open (quiet, ~1 s)
    if (this.easing) { const e = this.easing; e.t += dt; if (!Input.down(USE) || this.door !== e.d) { this.easing = null; if (e.t < .3 && this.door === e.d) this.pass(e.d, 1); } else if (e.t >= 1.1) { this.easing = null; this.pass(e.d, 0); } }
    else if (this.door && Input.hit(USE) && !(APP.useBusy && APP.useBusy())) { if (APP.stealth) this.easing = { d: this.door, t: 0 }; else this.pass(this.door, -1); }
    else if (this.near && Input.hit('KeyE')) { const lot = this.near.lot; this.go(() => enterBuilding(lot)); }
  },
  go(f) { this.pending = f; },
  // pass through a closed door: loud 1 (shoved open: a bang heard ~16 m), 0 eased (heard ~3 m), -1 (demo: no noise model)
  pass(d, loud) { const P = G.P.pos, sa = (P[0] - d.a[0]) ** 2 + (P[2] - d.a[1]) ** 2, sb = (P[0] - d.b[0]) ** 2 + (P[2] - d.b[1]) ** 2, to = sa < sb ? d.b : d.a, fr = sa < sb ? d.a : d.b;
    if (loud >= 0) { AUX('sfx', 'door_open', { x: d.x, y: (d.y || 0) + 1, z: d.z, vol: loud ? .9 : .25, pitch: loud ? 1.1 : .85 }); NOISE.emit(d.x, d.y || 0, d.z, loud ? 16 : 3, 'door'); if (APP.onDoor) APP.onDoor(d, loud); }
    this.go(() => { G.P.pos = [to[0], d.y || 0, to[1]]; G.P.yaw = Math.atan2(-(to[0] - fr[0]), -(to[1] - fr[1])); G.P.vel = [0, 0, 0]; LOADFADE.a = 1; LOADFADE.t = 0; LOADFADE.hold = false; }); },
  // a door is passable with E when it is closed now: no schedule class (homes, rich gates) or its class is shut at this hour
  findDoor() { if (typeof CITY === 'undefined' || !CITY.ready || G.inside) return null; const P = G.P.pos; let best = null, bd = 1.8;
    for (const d of CITY.metaNear(P[0], P[2], 8, 'doors')) { if (d.cls && CITY.isOpen(d.cls, G.hour)) continue; const dd = Math.hypot(d.x - P[0], d.z - P[2]); if (dd < bd && Math.abs((d.y || 0) - P[1]) < 1.5) { bd = dd; best = d; } } return best; },
};
function enterBuilding(lot) {
  const t0 = performance.now(), I = INTERIOR.build(lot), L = I.L;
  G.inside = { I, mesh: L.mb.upload(), fol: L.fol.nv ? L.fol.upload() : null, lights: L.lights, world: L.world, exit: I.exit, back: { pos: G.P.pos.slice(), yaw: G.P.yaw, world: G.world }, lot };
  G.world = L.world; G.P.pos = I.spawn.slice(0, 3); G.P.yaw = I.spawn[3]; G.P.vel = [0, 0, 0];
  if (typeof CROWD !== 'undefined') { if (CROWD.setMode) CROWD.setMode('interior'); if (CROWD.placeStatic) CROWD.placeStatic(I.people); }
  console.log('interior', I.kind, lot.type, (performance.now() - t0).toFixed(0), 'ms');
}
function leaveBuilding() {
  const b = G.inside.back; for (const k of ['mesh', 'fol']) if (G.inside[k]) R.freeMesh(G.inside[k]);
  G.world = b.world; G.P.pos = b.pos; G.P.yaw = b.yaw + PI; G.P.vel = [0, 0, 0]; G.inside = null; LOADFADE.start();
  if (typeof CROWD !== 'undefined') { if (CROWD.clearStatic) CROWD.clearStatic(); if (CROWD.setMode) CROWD.setMode('city'); }
}

// ---------------- player ----------------
// dev: ?tour=1 — an automatic route through the slice (street level at running/riding speeds, then fast low flight), to measure
// streaming hitches in the real app: open Drums.app --args "tour=1"; results in drums_log.txt (PERF lines + SPIKE lines)
const TOUR = {
  pts: [[2010, -600, 8], [2010, -1400, 8], [2900, -1400, 16], [2900, -930, 16], [4790, -930, 16], [4862, -930, 4], [4900, -930, 3], [3000, -930, 30], [3000, 200, 30], [1300, 200, 30], [1300, -1500, 70], [3600, -1500, 70], [2010, -600, 70]],
  i: 0, t: 0, done: false,
  // ?tour=walk: walk (real input + physics) out of a ward gate and over the bridge; logs where progress stalls and what blocks
  walk(dt) { const P = G.P; if (!this.wp) { const g = CITY.gates.find(q => q.ward === (Q.get('ward') || '平康') && q.side === (Q.get('side') || 'e')); const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[g.side];
      this.wp = [[g.x - d[0] * 25, g.z - d[1] * 25], [g.x + d[0] * 40, g.z + d[1] * 40]]; P.pos = [this.wp[0][0], 0, this.wp[0][1]]; G.fly = false; this.k = 1; this.st = 0; this.lp = P.pos.slice(); NATIVE.log('WALK START gate ' + g.x.toFixed(1) + ',' + g.z.toFixed(1) + ' open ' + (G.gateOpen ?? 1).toFixed(2)); return false; }
    const t = this.wp[this.k]; if (!t) return false; const dx = t[0] - P.pos[0], dz = t[1] - P.pos[2]; if (Math.hypot(dx, dz) < 1) { NATIVE.log('WALK REACHED ' + P.pos.map(v => v.toFixed(1)).join(',')); this.k++; return false; }
    P.yaw = Math.atan2(-dx, -dz); Input.keys.KeyW = 1; this.st += dt;
    if (this.st > 1.5) { this.st = 0; const moved = Math.hypot(P.pos[0] - this.lp[0], P.pos[2] - this.lp[2]); this.lp = P.pos.slice();
      if (moved < .5) { const who = []; G.world.near(P.pos[0], P.pos[2], 1.2, q => { if (q.on === false) return; who.push(`${q.k ? 'cyl' : 'box'}${q.dynamic ? '(dyn)' : ''} c(${q.cx.toFixed(1)},${q.cy.toFixed(1)},${q.cz.toFixed(1)}) h(${(q.hx || q.r || 0).toFixed(2)},${q.hy.toFixed(2)},${(q.hz || 0).toFixed(2)}) yaw ${(q.yaw || 0).toFixed(2)} ${q.surface || ''}`); });
        NATIVE.log('WALK STUCK at ' + P.pos.map(v => v.toFixed(2)).join(',') + ' chunk ' + !!CITY.chunkAt(P.pos[0], P.pos[2]) + ' world ' + !!(CITY.chunkAt(P.pos[0], P.pos[2]) || {}).world + ' gateOpen ' + (G.gateOpen ?? 1).toFixed(2) + ' | ' + who.slice(0, 6).join(' | ')); } }
    return false; },
  update(dt) { if (!CITY.ready || this.done) return false; const P = G.P, a = this.pts[this.i], b = this.pts[this.i + 1];
    if (!b) { this.done = true; NATIVE.log('TOUR DONE after ' + G.t.toFixed(0) + ' s'); G.fly = false; return false; }
    if (!this.started) { this.started = true; NATIVE.log('TOUR START'); P.pos = [a[0], 0, a[1]]; }
    const dx = b[0] - P.pos[0], dz = b[1] - P.pos[2], d = Math.hypot(dx, dz), sp = b[2] * dt, high = b[2] > 30;
    if (d < sp + .01) { P.pos[0] = b[0]; P.pos[2] = b[1]; this.i++; NATIVE.log('TOUR leg ' + this.i + ' at ' + G.t.toFixed(0) + ' s'); return true; }
    P.pos[0] += dx / d * sp; P.pos[2] += dz / d * sp; G.fly = true; const gy = CITY.height ? CITY.height(P.pos[0], P.pos[2]) : 0; P.pos[1] += ((high ? gy + 40 : gy) - P.pos[1]) * Math.min(1, dt * 3);
    const yaw = Math.atan2(-dx, -dz); let dy = yaw - P.yaw; dy -= Math.round(dy / (2 * PI)) * 2 * PI; P.yaw += dy * Math.min(1, dt * 2); P.pitch = high ? -.25 : .02; P.vel = [0, 0, 0]; return true; },
};
function toggleFly() { const P = G.P, e = P.eye || 1.6; G.fly = !G.fly; P.pos[1] += G.fly ? e : -e; P.vel = [0, 0, 0]; }
function updatePlayer(dt) {
  const P = G.P, w = G.world, I = Input;
  if (Q.get('tour') === 'walk') TOUR.walk(dt); else if (Q.has('tour') && TOUR.update(dt)) return;
  if (I.locked) { P.yaw -= I.mdx * .0022; P.pitch = clamp(P.pitch - I.mdy * .0022, -1.5, 1.5); }
  const f = (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0), s = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  if (I.hit('KeyV')) toggleFly(); // the view stays where it is (fly mode puts the camera at the position itself, walking adds the eye height)
  if (I.hit('KeyO')) R.sh.on = !R.sh.on;
  if (I.hit('KeyU')) R.ao.on = !R.ao.on;
  if (I.hit('KeyB')) R.bump.on = !R.bump.on;
  if (I.hit('KeyJ')) R.water.on = !R.water.on;
  if (I.hit('KeyK')) setRetro(((G.retro || 0) + 1) % 4); // K: smooth → dithered → ENDESGA32 palette → wireframe → smooth
  if (I.hit('Backquote')) G.debug = !G.debug;
  if (G.fly) {
    if (I.wheel) G.flyK = clamp((G.flyK || 1) * Math.pow(1.25, -I.wheel), .25, 16);
    /* (the Ctrl/Cmd + Space bird's-eye jump to 350 m is gone: Ctrl is the fast-fly modifier and Space flies up, so climbing fast threw you into the sky) */
    const fast = I.down('ShiftLeft') || I.down('ShiftRight'), sp = (fast ? (I.down('ControlLeft') ? 420 : 80) : 14) * (G.flyK || 1) * dt, up = (I.down('KeyE') || I.down('Space') ? 1 : 0) - (I.down('KeyQ') || I.down('KeyC') ? 1 : 0), cp = Math.cos(P.pitch);
    P.pos[0] += (fx * cp * f + rx * s) * sp; P.pos[2] += (fz * cp * f + rz * s) * sp; P.pos[1] += (Math.sin(P.pitch) * f + up) * sp; return;
  }
  if (APP.player && APP.player(dt, f, s)) { PLAYER.post(dt); return; } // the app may take over (rope climbing, takedowns, cards)
  if (!HORSE.on && PLAYER.mantleStep(dt)) { PLAYER.post(dt); return; } // no climbing ledges in the saddle
  // crouch: C toggles, Ctrl holds; standing up needs headroom
  if (I.hit('KeyC') && !HORSE.on) P.crouchT = !P.crouchT; const wantC = !HORSE.on && (P.crouchT || I.down('ControlLeft') || P.forceCrouch);
  if (wantC) P.crouch = true; else if (P.crouch && w.ceil(P.pos[0], P.pos[2], P.pos[1], P.pos[1] + 1.7) >= P.pos[1] + 1.72) P.crouch = false;
  P.ck += ((P.crouch ? 1 : 0) - P.ck) * Math.min(1, dt * 10); P.h = 1.7 - .65 * P.ck; P.eye = 1.55 - .6 * P.ck; if (HORSE.on) { P.h = 2.45; P.eye = 2.3; } // in the saddle (seat 1.38 m + a seated rider's eye height)
  const leg = P.wound ? P.wound.leg || 0 : 0, run = I.down('ShiftLeft') && !leg, spd = HORSE.on ? HORSE.speed(run) : (P.crouch ? (run ? 2.4 : 1.4) : run ? 6.2 : (APP.walk || 3.0)) * (leg >= 1 ? .55 : leg > 0 ? .9 : 1) * (P.slow || 1), l = Math.hypot(f, s) || 1, tx = (fx * f + rx * s) / l * spd, tz = (fz * f + rz * s) / l * spd;
  const acc = P.onGround ? (HORSE.on ? 3.2 : 14) : 3; P.vel[0] += (tx - P.vel[0]) * Math.min(1, acc * dt); P.vel[2] += (tz - P.vel[2]) * Math.min(1, acc * dt);
  if (I.hit('Space')) { if (!PLAYER.tryMantle()) { if (P.onGround && !(P.wound && P.wound.leg >= 1)) { P.vel[1] = 4.6; P.onGround = false; AUX('sfx', 'jump', { vol: .3 }); } } else { PLAYER.post(dt); return; } }
  P.vel[1] -= 15 * dt;
  // sub-stepped movement (≤ 12 cm per step, each resolved twice) so running can't squeeze through narrow gaps or corners
  let nx = P.pos[0], nz = P.pos[2]; { const mx = P.vel[0] * dt, mz = P.vel[2] * dt, ns = Math.max(1, Math.ceil(Math.hypot(mx, mz) / .12));
    for (let i = 0; i < ns; i++) { nx += mx / ns; nz += mz / ns; for (let k = 0; k < 2; k++) [nx, nz] = w.push(nx, nz, P.r, P.pos[1], P.pos[1] + P.h, .45); } }
  // people and animals are solid: push the player out of their circles (people ~0.3 m, donkeys/oxen ~0.55, horses/camels ~0.7)
  if (!G.fly && !G.inside && typeof CROWD !== 'undefined' && CROWD.near && CROWD.info) { const near = CROWD.near(nx, nz, 1.9);
    for (let j = 0; j < near.length; j++) { if (HORSE.on && near[j] === HORSE.i) continue; /* your own horse */ const a = CROWD.info(near[j]); if (!a || Math.abs((a.y || 0) - P.pos[1]) > 1.2) continue; const t = a.type || '', ra = /horse|camel/.test(t) ? .7 : /donkey|ox|cart/.test(t) ? .55 : /dog|chicken/.test(t) ? .15 : .3, m = ra + P.r;
      const dx = nx - a.x, dz = nz - a.z, d = Math.hypot(dx, dz); if (d < m && d > 1e-4) { nx = a.x + dx / d * m; nz = a.z + dz / d * m; if (a.role !== 'static') TALK.bump(near[j], a, Math.hypot(P.vel[0], P.vel[2])); else if (APP.stealth && G.t - (PLAYER.bumpT || 0) > 1) { PLAYER.bumpT = G.t; NOISE.emit(a.x, a.y, a.z, 2.5, 'bump'); } } } }
  if (!G.inside && CITY.chunks.size && !CITY.chunkAt(nx, nz) && CITY.chunkAt(P.pos[0], P.pos[2])) { nx = P.pos[0]; nz = P.pos[2]; P.vel[0] = P.vel[2] = 0; } // edge of the walkable city
  let ny = P.pos[1] + P.vel[1] * dt; const g = w.ground(nx, nz, P.pos[1], .45, P.r); const wasG = P.onGround;
  if (ny <= g.y) { ny = g.y; P.vel[1] = 0; P.onGround = true; } else P.onGround = ny - g.y < .05;
  P.surf = g.s ? (g.s.surface || 'stone') : (CITY.height && CITY.height(nx, nz) < -.5 ? 'grass' : 'dirt');
  if (!P.onGround) P.airTop = Math.max(P.airTop ?? ny, ny); else if (!wasG || P.airTop !== undefined) { const drop = (P.airTop ?? ny) - ny; P.airTop = undefined; if (drop > .9) PLAYER.landed(drop); }
  const c = w.ceil(nx, nz, ny, ny + P.h); if (ny + P.h > c) { ny = c - P.h; P.vel[1] = Math.min(0, P.vel[1]); }
  P.pos = [nx, ny, nz];
  const hs = Math.hypot(P.vel[0], P.vel[2]); P.run = run && hs > (HORSE.on ? 7 : 4); if (P.onGround) { P.bob += hs * dt * (HORSE.on ? 1.1 : 2.1); if (HORSE.on) HORSE.feet(hs, dt); else SOUND.foot(hs * dt); }
  PLAYER.post(dt);
}
// the walking surface at street level (terrain, steps, platforms; not the roofs above): spawning, placing people
function groundAt(x, z, up = 1.2) { const w = G.world, t = typeof CITY !== 'undefined' && CITY.ready && CITY.height ? CITY.height(x, z) : 0, g = w.ground(x, z, t + up, up + .1, .3); return g.y > -1e8 ? g.y : t; }
// ---------------- player extras: mantling, lean, falls, noise (shared; the app adds tools such as the rope and hook) ----------------
// NOISE: every audible event in the world {x, y, z, r (audible radius, m), kind, src, t}. The player's steps, doors, roof tiles, falls,
// and whatever the app adds (combat, screams); NPC perception and the 'listening' HUD read the same list.
const NOISE = {
  list: [], subs: [],
  emit(x, y, z, r, kind, src) { const e = { x, y, z, r, kind, src: src ?? 'player', t: G.t }; this.list.push(e); if (this.list.length > 200) this.list.shift(); for (const f of this.subs) try { f(e); } catch (er) { console.warn('noise', er); } return e; },
  on(f) { this.subs.push(f); },
  recent(age = 2) { const t0 = G.t - age; let i = this.list.length; while (i > 0 && this.list[i - 1].t >= t0) i--; return this.list.slice(i); },
};
const PLAYER = {
  STEP_R: { tile: 1.8, wood: 1.3, stone: 1.1, brick: 1.1, dirt: 1, grass: .7, thatch: .6, water: 1.6 },
  // a ledge in front of the player within reach (top 0.5–1.8 m above the feet; tops up to 2.3 m from a jump), with room to crouch on it
  ledge(maxUp = 1.8) { const P = G.P, w = G.world, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), feet = P.pos[1];
    for (const d of [.3, .55, .8]) { const qx = P.pos[0] + fx * (P.r + d), qz = P.pos[2] + fz * (P.r + d), g = w.ground(qx, qz, feet + maxUp + .02, maxUp + .02, 0), up = g.y - feet;
      if (up < .5 || up > maxUp + .02) continue; if (w.ceil(qx, qz, g.y, g.y + 1.1) < g.y + 1.1) continue; if (w.solidAt(qx, g.y + .5, qz) || w.solidAt(qx, g.y + .95, qz)) continue;
      if (w.ceil(P.pos[0], P.pos[2], feet, g.y + 1.0) < g.y + 1.0) continue; // the way up is clear
      return { x: qx, y: g.y, z: qz, up }; } return null; },
  tryMantle() { const P = G.P; if (P.wound && P.wound.arm2) return false; const L = this.ledge(P.onGround ? 1.8 : 2.3); if (!L) return false; this.mantle([L.x, L.y, L.z], .35 + .4 * L.up / 1.8); return true; },
  // move to `to` ([x, y, z]): rise first, then over the edge; crouches if there is no room to stand
  mantle(to, dur = .6, o = {}) { const P = G.P; P.mant = { t: 0, dur, from: P.pos.slice(), to, o }; P.vel = [0, 0, 0]; AUX('sfx', 'climb', { vol: .35 }); NOISE.emit(P.pos[0], P.pos[1], P.pos[2], 2.5, 'climb'); },
  mantleStep(dt) { const P = G.P, M = P.mant; if (!M) return false; M.t += dt / M.dur; const k = Math.min(1, M.t), a = Math.min(1, k / .62), b = clamp((k - .5) / .5, 0, 1), sm = v => v * v * (3 - 2 * v);
    const y = M.from[1] + (M.to[1] + .02 - M.from[1]) * sm(a); P.pos = [M.from[0] + (M.to[0] - M.from[0]) * sm(b), y, M.from[2] + (M.to[2] - M.from[2]) * sm(b)]; P.ck += (1 - P.ck) * Math.min(1, dt * 8); P.eye = 1.55 - .6 * P.ck;
    if (k >= 1) { P.mant = null; P.pos[1] = M.to[1]; const w = G.world; [P.pos[0], P.pos[2]] = w.push(P.pos[0], P.pos[2], P.r, P.pos[1], P.pos[1] + 1.05, .3); if (w.ceil(P.pos[0], P.pos[2], P.pos[1], P.pos[1] + 1.7) < P.pos[1] + 1.72) { P.crouch = true; } P.onGround = true; P.airTop = undefined; if (M.o.done) M.o.done(); }
    return true; },
  landed(drop) { const P = G.P, sf = P.surf || 'dirt', soft = P.crouch ? .6 : 1; AUX('sfx', sf === 'tile' ? 'land_tile' : 'land_dirt', { vol: Math.min(1, .25 + drop * .12) });
    NOISE.emit(P.pos[0], P.pos[1], P.pos[2], (3 + drop * 2.2) * (this.STEP_R[sf] || 1) * soft, 'land'); if (sf === 'tile' && drop > 1.2) this.clatter(1); if (APP.onLand) APP.onLand(drop, sf); },
  clatter(k = 1) { const P = G.P; AUX('sfx', 'tile_clatter', { x: P.pos[0], y: P.pos[1], z: P.pos[2], vol: .5 + .4 * k }); NOISE.emit(P.pos[0], P.pos[1], P.pos[2], 14 + 8 * k, 'tile'); },
  // after movement: lean (Q/E while APP.lean), camera offset and roll
  post(dt) { const P = G.P, I = Input, w = G.world; let lt = 0; if (APP.lean && !P.mant && !G.fly) lt = (I.down('KeyE') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0);
    P.lean = (P.lean || 0) + (lt - (P.lean || 0)) * Math.min(1, dt * 9); const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), e = [P.pos[0], P.pos[1] + P.eye, P.pos[2]];
    let reach = .42; if (Math.abs(P.lean) > .02) { const sd = Math.sign(P.lean), d = w.ray(e, [rx * sd, 0, rz * sd], .6, .06); reach = Math.min(reach, Math.max(0, d - .14)); }
    const L = P.lean * reach; P.cam = [rx * L, -Math.abs(P.lean) * .05, rz * L]; P.roll = -P.lean * .14; },
};

// ---------------- particles: dust kicked up by hooves, carts and running feet; drifting dust motes in sunlight ----------------
const FX = {
  list: [], max: 1500,
  dust(x, y, z, k = 1) { if (this.list.length > this.max) return; const P = G.P.pos; if (Math.abs(x - P[0]) > 70 || Math.abs(z - P[2]) > 70) return; const n = 1 + (k * 2 | 0);
    for (let i = 0; i < n; i++) this.list.push({ x: x + rr(-.25, .25), y: y + .05, z: z + rr(-.25, .25), vx: rr(-.3, .3), vy: rr(.15, .5) * k, vz: rr(-.3, .3), size: rr(.12, .25) * (.6 + k * .5), grow: .7, a: .22 * Math.min(1.5, k), life: rr(1.2, 2.2), t: 0, r: .74, g: .62, b: .46, layer: TEX.L.p_smoke, rot: rr(0, 6) }); },
  update(dt) {
    const L = this.list, wind = .3; for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.t += dt; if (p.t > p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.x += (p.vx + wind) * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= .97; p.vz *= .97; p.vy *= .96; p.size += p.grow * dt; }
    // the player's own feet when running
    this.smoke(dt); this.birds(dt);
    // dust motes floating in the sunlight around the camera (day, outdoors)
    const M = this.motes || (this.motes = []), sun = !G.inside && R.env.el > 4 ? 1 : 0, C = G.P.pos;
    while (sun && M.length < 70) M.push({ x: C[0] + rr(-7, 7), y: C[1] + rr(.3, 4), z: C[2] + rr(-7, 7), vx: rr(-.05, .05), vy: rr(-.02, .03), vz: rr(-.05, .05), size: rr(.012, .025), r: 1, g: .9, b: .7, a: rr(.25, .6), layer: TEX.L.p_soft, rot: 0, ph: rr(0, 6) });
    if (!sun) M.length = 0; for (const m of M) { m.x += (m.vx + Math.sin(G.t * .3 + m.ph) * .03) * dt; m.y += m.vy * dt; m.z += m.vz * dt; if (Math.abs(m.x - C[0]) > 8 || Math.abs(m.z - C[2]) > 8 || m.y < C[1] - .5 || m.y > C[1] + 5) { m.x = C[0] + rr(-7, 7); m.y = C[1] + rr(.3, 4); m.z = C[2] + rr(-7, 7); } }
    const P = G.P; if (!G.fly && !G.inside && P.onGround && P.run && Math.hypot(P.vel[0], P.vel[2]) > 4 && Math.random() < dt * 6) this.dust(P.pos[0], P.pos[1], P.pos[2], .5);
  },
  // kitchen smoke from house roofs at mealtimes (cooking: 6–8, 11–13, 17–19.5); refreshed every 2 s from the lots near the camera
  smoke(dt) {
    if (typeof CITY === 'undefined' || !CITY.ready || G.inside) return; const h = G.hour, meal = h > 5.8 && h < 8 || h > 11 && h < 13 || h > 16.8 && h < 19.6; if (!meal) return;
    this.st = (this.st || 0) - dt; if (this.st <= 0) { this.st = 2; const P = G.P.pos, src = []; for (const lay of CITY.lay) { if (!inR(lay.wd.r, P[0], P[2], 150)) continue;
      for (const l of lay.lots) { if (!/house|hut|inn|wineshop/.test(l.type) || l.seed % 3) continue; const x = rcx(l.r), z = rcz(l.r); if (Math.abs(x - P[0]) > 140 || Math.abs(z - P[2]) > 140) continue; const { F, d } = COMP.frame(l), q = F.p(-1.5, 0, -d / 2 + 3.5); src.push([q[0], 4.6 + (l.seed % 5) * .2, q[2]]); } } this.src = src; }
    if (this.src) for (const s of this.src) if (Math.random() < dt * 2.5) this.list.push({ x: s[0] + rr(-.2, .2), y: s[1], z: s[2] + rr(-.2, .2), vx: rr(-.1, .1), vy: rr(.5, .8), vz: rr(-.1, .1), size: rr(.25, .4), grow: .45, a: .16, life: rr(5, 8), t: 0, r: .62, g: .6, b: .58, layer: TEX.L.p_smoke, rot: rr(0, 6) });
  },
  // small flocks over the wards: sparrows by day, crows at dusk, nothing at night; flapping V-shapes in a dynamic mesh
  birds(dt) {
    if (G.inside) return; const h = G.hour; if (h < 5 || h > 20) { this.fl = null; return; } const P = G.P.pos;
    if (!this.fl || Math.hypot(this.fl.x - P[0], this.fl.z - P[2]) > 260) { const a = rr(0, TAU), crows = h > 17.5; this.fl = { x: P[0] + Math.cos(a) * 120, z: P[2] + Math.sin(a) * 120, y: rr(25, 45), a: rr(0, TAU), crows, b: Array.from({ length: crows ? 9 : 16 }, () => ({ dx: rr(-8, 8), dy: rr(-3, 3), dz: rr(-8, 8), ph: rr(0, 6), sp: rr(7, 9) })) }; }
    const f = this.fl; f.a += dt * .15; f.x += Math.cos(f.a) * 8 * dt; f.z += Math.sin(f.a) * 8 * dt;
  },
  drawBirds() {
    const f = this.fl; if (!f) return; const d = this.dyn || (this.dyn = R.dyn(400)); d.n = 0; const col = f.crows ? [.06, .06, .07, 0] : [.22, .18, .14, 0], L = TEX.id('white'), t = R.time, cx = Math.cos(f.a), sx = Math.sin(f.a);
    for (const b of f.b) { const x = f.x + b.dx + Math.sin(t * .7 + b.ph) * 2, y = f.y + b.dy + Math.sin(t * 1.1 + b.ph) * .8, z = f.z + b.dz, w = f.crows ? .55 : .25, fl = Math.sin(t * b.sp * (f.crows ? .6 : 1.4) + b.ph) * w * .8;
      const fw = [cx, 0, sx], rt = [-sx, 0, cx], T = [x + fw[0] * w * .5, y, z + fw[2] * w * .5], B = [x - fw[0] * w * .3, y, z - fw[2] * w * .3];
      for (const sd of [-1, 1]) { const tip = [x + rt[0] * sd * w * 1.6, y + fl, z + rt[2] * sd * w * 1.6]; d.vert(...T, 0, 0, col, L); d.vert(...tip, 1, 0, col, L); d.vert(...B, 1, 1, col, L); d.vert(...T, 0, 0, col, L); d.vert(...B, 1, 1, col, L); d.vert(...tip, 1, 0, col, L); } }
    R.drawDyn(d, { cull: false, unlit: true }); },
  draw() { if (!this.list.length && !(this.motes && this.motes.length)) return; for (const p of this.list) { const f = p.t / p.life, a0 = p.a0 === undefined ? (p.a0 = p.a) : p.a0; p.a = a0 * (f < .2 ? f / .2 : 1 - (f - .2) / .8); } R.particles(this.list, 2); for (const p of this.list) p.a = p.a0; if (this.motes && this.motes.length) R.particles(this.motes, 1); },
};

// ---------------- adaptive quality: keep the frame rate up on slower machines (measured over 3 s windows) ----------------
const QUALITY = {
  levels: [{ name: 'LOW', R0: 80, lod1: 360, far1: 1500, sh: [10, 36, 90], fade: 75, h: 300 }, { name: 'MED', R0: 100, lod1: 480, far1: 1900, sh: [14, 50, 150], fade: 120, h: 330 }, { name: 'HIGH', R0: 120, lod1: 620, far1: 2300, sh: [18, 64, 210], fade: 170, h: 360 },
    // manual only (Shift+P; auto never steps into them): XHIGH = the window's height in points (Retina: half the pixels per axis, ~11 ms at 1343x905),
    // FULL = every physical pixel (~16 ms median, dips to ~27 ms)
    { name: 'XHIGH', R0: 120, lod1: 620, far1: 2300, sh: [18, 64, 210], fade: 170, h: 'win' }, { name: 'FULL', R0: 120, lod1: 620, far1: 2300, sh: [18, 64, 210], fade: 170, h: 'full' }],
  cur: 2, auto: !Q.has('quality'), acc: 0, n: 0, hold: 0,
  h() { const L = this.levels[this.cur]; return Q.has('h') ? +Q.get('h') : L.h === 'win' ? Math.round(innerHeight) : L.h === 'full' ? Math.round(innerHeight * (devicePixelRatio || 1)) : L.h; }, // internal render height
  set(i) { this.cur = clamp(i, 0, this.levels.length - 1); const L = this.levels[this.cur]; if (typeof CITY !== 'undefined') { CITY.R0 = Q.has('r0') ? +Q.get('r0') : L.R0; CITY.R0OUT = CITY.R0 + 50; if (!Q.has('lod1r')) CITY.LOD1R = L.lod1; CITY.FAR1R = Q.has('far1r') ? +Q.get('far1r') : L.far1; } R.sh.splits = L.sh.slice(); R.sh.fade = L.fade; if (!G.retro && R.H !== this.h()) R.resize(this.h()); },
  update(dt) {
    if (Input.hit('KeyP')) { if (Input.down('ShiftLeft')) { this.auto = false; this.set((this.cur + 1) % this.levels.length); } else this.auto = true; }
    if (!this.auto || G.hold) return; this.acc += dt; this.n++; this.hold -= dt; if (this.acc < 3) return; const ms = this.acc / this.n * 1000; this.acc = 0; this.n = 0; if (this.hold > 0) return;
    if (ms > 24 && this.cur > 0) { this.set(this.cur - 1); this.hold = 6; } else if (ms < 13 && this.cur < 2) { this.set(this.cur + 1); this.hold = 10; }
  },
};

// ---------------- performance telemetry: phase times, long frames; every 10 s a line goes to the native app's log file (drums_log.txt) ----------------
const PERF = {
  n: 0, upd: 0, ren: 0, hud: 0, max: 0, long: 0, last: performance.now(), sent: 0,
  frame(dt) { const ms = dt * 1000; if (ms > this.max) this.max = ms; if (ms > 40) this.long++; this.n++; },
  // long frames with what happened in this and the previous frame (uploads, applied results), first 80 to the log
  spikes: 0, prev: '',
  spike(dt, u, r) { const up = typeof POOL !== 'undefined' ? POOL.uploaded : 0, cur = `up ${(up / 1e6).toFixed(1)}MB pend ${R.ups ? R.ups.length : 0} q ${typeof POOL !== 'undefined' ? POOL.q.length + '/' + POOL.busy + '/' + POOL.applyQ.length : ''} lod0 ${typeof CITY !== 'undefined' && CITY.order ? CITY.order.reduce((n, c) => n + (c.m0 ? 1 : 0), 0) : 0}`;
    if (dt > .034 && this.spikes < 80 && G.t > 3) { this.spikes++; NATIVE.log(`SPIKE ${(dt * 1000).toFixed(0)} ms (upd ${u.toFixed(1)} ren ${r.toFixed(1)}) now: ${cur} | prev: ${this.prev} | gpu ${((R.gpuBytes || 0) / 1e6).toFixed(0)} MB pos ${G.P.pos.map(v => v.toFixed(0)).join(',')}`); }
    this.prev = cur; },
  add(u, r, h) { this.upd += u; this.ren += r; this.hud += h;
    const now = performance.now(); if (now - this.last < 10000) return; const k = Math.max(1, this.n), line = `${new Date().toISOString().slice(11, 19)} fps ${(this.n / ((now - this.last) / 1000)).toFixed(0)} q ${QUALITY.levels[QUALITY.cur].name} upd ${(this.upd / k).toFixed(1)} ren ${(this.ren / k).toFixed(1)} hud ${(this.hud / k).toFixed(1)} ms; worst ${this.max.toFixed(0)} ms, >40ms ${this.long}; tris ${(R.stats.tris / 1e6).toFixed(2)}M calls ${R.stats.calls}; gpu ${((R.gpuBytes || 0) / 1e6).toFixed(0)} MB; workers ${typeof POOL !== 'undefined' ? (POOL.main ? 'MAIN-THREAD' : POOL.ws.length) : '-'} jobs ${typeof POOL !== 'undefined' ? POOL.q.length + '/' + POOL.busy + '/' + POOL.applyQ.length : '-'}; lod0 ${typeof CITY !== 'undefined' && CITY.order ? CITY.order.filter(c => c.m0).length : 0}; crowd ${typeof CROWD !== 'undefined' && CROWD.stats ? CROWD.stats() : ''}; pos ${G.P.pos.map(v => v.toFixed(0)).join(',')}`;
    this.lastLine = line; NATIVE.log(line); this.n = this.upd = this.ren = this.hud = this.max = this.long = 0; this.last = now; },
};
const NATIVE = { log(s) { if (Q.has('tour') && !(window.webkit && window.webkit.messageHandlers)) console.log(s); try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.drums) window.webkit.messageHandlers.drums.postMessage({ log: s }); } catch (e) { } } };
// warnings, errors and uncaught exceptions also go to the native log (the app has no console)
if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.drums) {
  for (const k of ['warn', 'error']) { const f = console[k].bind(console); let n = 0; console[k] = (...a) => { f(...a); if (n++ < 200) NATIVE.log(k.toUpperCase() + ' ' + a.map(x => x && x.stack ? x.stack : String(x)).join(' ').slice(0, 600)); }; }
  window.addEventListener('error', e => NATIVE.log('UNCAUGHT ' + e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => NATIVE.log('UNHANDLED ' + String(e.reason && e.reason.stack || e.reason).slice(0, 600)));
}
addEventListener('error', e => NATIVE.log('JS ERROR ' + e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));

// ---------------- minimap: wards with their names around the player (north up); M: the whole city ----------------
// minimap: a real pixel map (2 m per map pixel near the player, 12 m for the whole city), scaled up by a whole number with no
// smoothing so its pixels match the game's; lots by type, streets, lanes, ward walls, gates, ditches, trees; Unifont labels
const MAP = {
  big: false, MPP: 2, BIGMPP: 12, TILE: 640,
  col: { base: [150, 128, 96], street: [196, 172, 132], lane: [184, 160, 122], yard: [168, 144, 108], house: [128, 108, 84], hut: [140, 116, 86], rich: [116, 92, 74], shop: [150, 104, 72],
    wineshop: [164, 96, 66], temple: [150, 82, 62], office: [120, 84, 70], warehouse: [118, 104, 86], garden: [104, 122, 76], field: [126, 134, 82], pond: [86, 112, 116], wall: [74, 58, 44],
    ward: [138, 118, 90], market: [160, 112, 74], palace: [110, 74, 62], park: [96, 116, 82], tree: [70, 94, 52], ditch: [92, 104, 100], gate: [190, 60, 48], me: [214, 64, 48], bld: [96, 78, 60] },
  // 7x7 pixel icons (RPG-style): '.' empty, 'o' outline, 'x' colour, 'w' light
  ICON: {
    wine: { c: [176, 58, 40], n: '酒肆', p: ['.ooooo.', '..oxo..', '.oxxxo.', 'oxxxxxo', 'oxxxxxo', '.oxxxo.', '..ooo..'] },
    inn: { c: [70, 110, 160], n: '旅舍', p: ['...o...', '..oxo..', '.oxxxo.', 'oxxxxxo', '.oxwxo.', '.oxwxo.', '.ooooo.'] },
    quarter: { c: [214, 110, 150], n: '北里', p: ['..o.o..', '.oxoxo.', 'oxxwxxo', '.oxxxo.', 'oxxwxxo', '.oxoxo.', '..o.o..'] },
    cloth: { c: [130, 90, 170], n: '布帛', p: ['ooooooo', 'oxxxxxo', 'owwwwwo', 'oxxxxxo', 'owwwwwo', 'oxxxxxo', 'ooooooo'] },
    pottery: { c: [70, 150, 140], n: '陶瓷茶', p: ['.......', 'ooooooo', 'oxxxxxo', '.oxxxo.', '..ooo..', '.ooooo.', '.......'] },
    medicine: { c: [90, 150, 70], n: '藥舖', p: ['...o...', '..oxo..', '..oxo..', '.oxxxo.', 'oxxxxxo', 'oxxxxxo', '.ooooo.'] },
    food: { c: [200, 160, 90], n: '糧食', p: ['..o.o..', '..oxo..', '.oxxxo.', 'oxxxxxo', 'oxxxxxo', 'oxxxxxo', '.ooooo.'] },
    books: { c: [220, 210, 170], n: '書肆', p: ['ooooooo', 'oxwxwxo', 'oxwxwxo', 'oxwxwxo', 'oxwxwxo', 'oxwxwxo', 'ooooooo'] },
    smith: { c: [150, 150, 160], n: '鐵匠', p: ['.......', 'ooooooo', 'oxxxxxo', '.ooxoo.', '..oxo..', '.oxxxo.', '.ooooo.'] },
    rope: { c: [150, 110, 70], n: '繩索', p: ['.ooooo.', 'oxxxxxo', 'ox.o.xo', 'oxo.oxo', 'ox.o.xo', 'oxxxxxo', '.ooooo.'] },
    temple: { c: [200, 80, 50], n: '佛寺', p: ['...o...', '..oxo..', '.ooxoo.', '..oxo..', '.ooxoo.', '..oxo..', '.ooooo.'] },
    dao: { c: [220, 190, 80], n: '道觀', p: ['.ooooo.', 'oxxxwwo', 'oxxwwwo', 'oxwwwxo', 'owwwxxo', 'owwxxxo', '.ooooo.'] },
    office: { c: [60, 90, 140], n: '官署', p: ['ooooooo', 'oxxxxxo', 'oxwxwxo', 'oxxxxxo', 'oxwxwxo', 'oxxxxxo', 'ooooooo'] },
    jinzou: { c: [60, 140, 90], n: '進奏院', p: ['oo.....', 'oxoooo.', 'oxxxxxo', 'oxxxxo.', 'oxooo..', 'ox.....', 'oo.....'] },
    mansion: { c: [120, 80, 60], n: '宅第', p: ['...o...', '..oxo..', '.oxxxo.', 'ooooooo', '.oxwxo.', '.oxwxo.', '.ooooo.'] },
    well: { c: [80, 130, 160], n: '井', p: ['.......', '..ooo..', '.oxxxo.', '.oxwxo.', '.oxxxo.', '..ooo..', '.......'] },
    pagoda: { c: [230, 200, 120], n: '塔', p: ['...o...', '..oxo..', '.oxxxo.', '..oxo..', '.oxxxo.', '..oxo..', 'ooxxxoo'] },
    gate: { c: [200, 70, 50], n: '城門', p: ['ooooooo', 'oxxxxxo', 'ox...xo', 'ox...xo', 'ox...xo', 'ox...xo', 'oo...oo'] },
    market: { c: [210, 140, 60], n: '市', p: ['ooooooo', 'oxxoxxo', 'oxxoxxo', 'ooooooo', 'oxxoxxo', 'oxxoxxo', 'ooooooo'] },
  },
  TRADES: ['cloth', 'silk', 'pottery', 'medicine', 'grain', 'books', 'butcher', 'bakery', 'smith', 'rope', 'tea', 'cloth', 'pottery'],
  TRADEICON: { cloth: 'cloth', silk: 'cloth', pottery: 'pottery', tea: 'pottery', medicine: 'medicine', grain: 'food', butcher: 'food', bakery: 'food', books: 'books', smith: 'smith', rope: 'rope' },
  iconOf(t) { if (t.type === 'shop') return this.TRADEICON[t.trade || COMP.pick(RNG(t.seed >>> 3), this.TRADES)] || 'food';
    if (t.type === 'wineshop') return 'wine'; if (t.type === 'inn') return 'inn'; if (t.type === 'quarter') return 'quarter';
    if (t.type === 'temple') return /觀/.test(t.name || '') ? 'dao' : 'temple'; if (t.type === 'jinzou') return 'jinzou'; if (t.type === 'office') return 'office'; if (t.type === 'mansion' || (t.name && /宅/.test(t.name))) return 'mansion'; return null; },
  icon(g, ic, x, y) { const c = typeof ic === 'string' ? this.ICON[ic] : ic; if (!c) return; for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) { const ch = c.p[j][i]; if (ch === '.') continue; g.fillStyle = ch === 'o' ? 'rgb(36,26,20)' : ch === 'w' ? 'rgb(236,228,206)' : this.rgb(c.c); g.fillRect(x - 3 + i, y - 3 + j, 1, 1); } },
  // landmarks: drawn at their place, or pinned to the minimap edge (with distance) when out of view
  extra: [], // pins added by the app (e.g. a mission's house): {n, x, z, ic}
  landmarks() { const b = this.baseLandmarks(); return this.extra.length ? b.concat(this.extra) : b; },
  baseLandmarks() { if (this._lmk) return this._lmk; const L = []; const pa = CITY.lay.flatMap(l => l.lots).find(t => t.pagodaAt && t.pagodaAt.kind === 'xiaoyan'); if (pa) L.push({ n: '小雁塔', x: pa.pagodaAt.x, z: pa.pagodaAt.z, ic: 'pagoda' });
    if (CITY.gatezone) L.push({ n: '春明門', x: CITY.gatezone.gate.x, z: CITY.gatezone.gate.z, ic: 'gate' }); const em = CITY.all.find(w => w.short === '東市'); if (em) L.push({ n: '東市', x: (em.r.x0 + em.r.x1) / 2, z: (em.r.z0 + em.r.z1) / 2, ic: 'market' });
    const da = CITY.all.find(w => w.short === '晉昌'); if (da) L.push({ n: '大雁塔', x: (da.r.x0 + da.r.x1) * .5 + (da.r.x1 - da.r.x0) * .25, z: (da.r.z0 + da.r.z1) / 2, ic: 'pagoda' });
    // the famous places with their own builders (engine/landmarks.js): an icon on the maps; the two nearest also in the list
    if (typeof LANDMARKS !== 'undefined' && LANDMARKS.pins) try { for (const p of LANDMARKS.pins()) { if (p.n === '大慈恩寺' && p.pagoda) { const d = L.find(q => q.n === '大雁塔'); if (d) { d.x = p.pagoda.x; d.z = p.pagoda.z; } }
        L.push({ n: p.n, x: p.pagoda ? p.pagoda.x : p.x, z: p.pagoda ? p.pagoda.z : p.z, ic: p.pagoda ? 'pagoda' : /觀$|祠$/.test(p.n) ? 'dao' : 'temple', minor: true }); } } catch (e) { console.warn('landmark pins', e); }
    return this._lmk = L; },
  rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; },
  bigZ0() { return Math.min(-PLAN.H / 2, PLAN.daming ? PLAN.daming[1] : 0); }, // the big map reaches north to 大明宮
  // draw the city into a canvas covering world rect (x0,z0)-(x0+w*mpp, z0+h*mpp), mpp metres per pixel, integer-aligned rects only
  // shade what is not walkable (outside the streamed full-detail chunks), so the playable area reads at a glance
  dim(g, x0, z0, mpp, W, H) { const CH = CITY.CH; g.fillStyle = 'rgba(28,20,14,.5)';
    for (let j = Math.floor(z0 / CH); j <= Math.floor((z0 + H * mpp) / CH); j++) for (let i = Math.floor(x0 / CH); i <= Math.floor((x0 + W * mpp) / CH); i++) { if (CITY.chunks.has(CITY.key(i, j))) continue;
      const a = Math.floor((i * CH - x0) / mpp), b = Math.floor((j * CH - z0) / mpp), e = Math.floor(((i + 1) * CH - x0) / mpp), f = Math.floor(((j + 1) * CH - z0) / mpp); g.fillRect(a, b, e - a, f - b); } },
  paint(cv, x0, z0, mpp, detail) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, C = this.col; g.imageSmoothingEnabled = false;
    const box = (r, c, inset = 0) => { const a = Math.floor((r.x0 - x0) / mpp) + inset, b = Math.floor((r.z0 - z0) / mpp) + inset, e = Math.ceil((r.x1 - x0) / mpp) - inset, f = Math.ceil((r.z1 - z0) / mpp) - inset; if (e <= 0 || f <= 0 || a >= W || b >= H || e <= a || f <= b) return; g.fillStyle = this.rgb(c); g.fillRect(a, b, e - a, f - b); };
    const out = (r, c) => { const a = Math.floor((r.x0 - x0) / mpp), b = Math.floor((r.z0 - z0) / mpp), e = Math.ceil((r.x1 - x0) / mpp), f = Math.ceil((r.z1 - z0) / mpp); g.fillStyle = this.rgb(c); g.fillRect(a, b, e - a, 1); g.fillRect(a, f - 1, e - a, 1); g.fillRect(a, b, 1, f - b); g.fillRect(e - 1, b, 1, f - b); };
    g.fillStyle = this.rgb(C.street); g.fillRect(0, 0, W, H);
    const P = PLAN; box(rect(-P.W / 2, -P.H / 2, P.W / 2, P.H / 2), C.street);
    for (const w of CITY.all) { const c = w.kind === 'market' ? C.market : w.kind === 'palace' ? C.palace : w.kind === 'park' ? C.park : C.ward; box(w.r, c); out(w.r, C.wall); }
    for (const [b, c] of [[P.palace, C.palace], [P.imperial, C.office], [P.daming, C.palace]]) { const r = rect(b[0], b[1], b[2], b[3]); box(r, c); out(r, C.wall); }
    if (detail) {
      const vis = r => r.x1 > x0 && r.x0 < x0 + W * mpp && r.z1 > z0 && r.z0 < z0 + H * mpp;
      for (const lay of CITY.lay) { if (!vis(lay.wd.r) || lay.wd.kind === 'gatezone') continue; box(lay.wd.r, C.yard);
        for (const s of lay.streets) box(s.r, C.street); for (const l of lay.lanes) box(l.r, C.lane);
        for (const t of lay.lots) { if (!vis(t.r)) continue; box(t.r, C[t.type] || C.house, 1); }
        out(lay.wd.r, C.wall);
        g.fillStyle = this.rgb(C.tree); for (const t of lay.trees) g.fillRect(Math.floor((t.x - x0) / mpp), Math.floor((t.z - z0) / mpp), 1, 1); }
      // building footprints: the collision boxes of loaded full-detail chunks (walls, halls, platforms) — a real floor plan near you
      for (const c of CITY.order) { if (!c.world || c.x0 + CITY.CH < x0 || c.x0 > x0 + W * mpp || c.z0 + CITY.CH < z0 || c.z0 > z0 + H * mpp) continue;
        for (const q of c.world.solids) { if (q.k !== 0 || q.hy < .6 || q.cy - q.hy > 3) continue; const sw = Math.abs(Math.sin(q.yaw || 0)) > .7, hx = sw ? q.hz : q.hx, hz = sw ? q.hx : q.hz; if (hx < .04 || hz < .04) continue;
          const thin = Math.min(hx, hz) < .45; box(rect(q.cx - hx, q.cz - hz, q.cx + hx, q.cz + hz), thin ? C.wall : C.bld); } }
      for (const d of CITY.ditches || []) if (vis(d)) box(d, C.ditch);
      // icons: wine shops, shops, temples, offices/進奏院, wells
      for (const lay of CITY.lay) { if (!vis(lay.wd.r)) continue;
        for (const t of lay.lots) { const ic = this.iconOf(t); if (!ic || !vis(t.r)) continue;
          const fx = t.front === 'w' ? t.r.x0 + 3 : t.front === 'e' ? t.r.x1 - 3 : (t.r.x0 + t.r.x1) / 2, fz = t.front === 'n' ? t.r.z0 + 3 : t.front === 's' ? t.r.z1 - 3 : (t.r.z0 + t.r.z1) / 2; this.icon(g, ic, Math.floor((fx - x0) / mpp), Math.floor((fz - z0) / mpp)); }
        for (const w of lay.wells || []) this.icon(g, this.ICON.well, Math.floor((w.x - x0) / mpp), Math.floor((w.z - z0) / mpp)); }
      g.fillStyle = this.rgb(C.gate); for (const q of CITY.gates || []) g.fillRect(Math.floor((q.x - x0) / mpp) - 1, Math.floor((q.z - z0) / mpp) - 1, 2, 2);
    }
    this.dim(g, x0, z0, mpp, W, H);
  },
  // the player's arrow, rasterised in map pixels
  arrow(g, px, pz, yaw, sc = 1) { const c = Math.cos(yaw), s = Math.sin(yaw), T = [[0, -4.5], [3.2, 3.5], [0, 1.5], [-3.2, 3.5]].map(([x, z]) => [(x * c + z * s) * sc, (-x * s + z * c) * sc]), R0 = Math.ceil(6 * sc);
    const inside = (x, z) => { let w = 0; for (const [a, b] of [[0, 1], [1, 2], [2, 0], [0, 2], [2, 3], [3, 0]].slice(0, 3)) { const A = T[a], B = T[b]; if ((B[0] - A[0]) * (z - A[1]) - (B[1] - A[1]) * (x - A[0]) < 0) w++; } return w === 0 || w === 3; };
    const inside2 = (x, z) => { let w = 0; for (const [a, b] of [[0, 2], [2, 3], [3, 0]]) { const A = T[a], B = T[b]; if ((B[0] - A[0]) * (z - A[1]) - (B[1] - A[1]) * (x - A[0]) < 0) w++; } return w === 0 || w === 3; };
    g.fillStyle = 'rgb(30,20,14)'; for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) { const x = i + .5, z = j + .5; let n = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(x + dx, z + dz) || inside2(x + dx, z + dz)) n = true; if (n && !(inside(x, z) || inside2(x, z))) g.fillRect(px + i, pz + j, 1, 1); }
    g.fillStyle = this.rgb(this.col.me); for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) { const x = i + .5, z = j + .5; if (inside(x, z) || inside2(x, z)) g.fillRect(px + i, pz + j, 1, 1); } },
  // the zoomed big map: a full-detail map (streets, lanes, lots, trees, icons; building floor plans where chunks are loaded) of the view around
  // (cx, cz) at BIGMPP / zoom metres per pixel, repainted when the view changes; labels for wards / palace units and named lots
  ZOOMS: [1, 1.5, 2, 3, 4, 6, 8, 12],
  // the zoomed big map: a full-detail map (streets, lanes, lots, trees, icons; building floor plans where chunks are loaded) around (cx, cz) at
  // BIGMPP / zoom metres per pixel. Painted into a cache with a margin of one view on each side and repainted only when the view leaves it or the
  // zoom changes (painting every few frames made it janky); arrow keys pan at a constant speed on screen whatever the zoom.
  drawZoom(Hh, gp, P) { const I = Input, k = gp, mpp = this.BIGMPP / this.zoom, Wc = Math.floor(HUDC.width * .96 / k), Hc = Math.floor(Hh * .9 / k), now = performance.now(), dt = Math.min(.1, (now - (this._zn || now)) / 1000); this._zn = now;
    const pan = 360 / k * mpp * dt; if (I.down('ArrowLeft')) this.cx -= pan; if (I.down('ArrowRight')) this.cx += pan; if (I.down('ArrowUp')) this.cz -= pan; if (I.down('ArrowDown')) this.cz += pan; // ~360 screen px per second
    this.cx = clamp(this.cx, -PLAN.W / 2, PLAN.W / 2); this.cz = clamp(this.cz, this.bigZ0(), PLAN.H / 2);
    const vx0 = this.cx - Wc / 2 * mpp, vz0 = this.cz - Hc / 2 * mpp, C = this._zc;
    if (!C || C.mpp !== mpp || C.Wc !== Wc || C.Hc !== Hc || vx0 < C.x0 || vz0 < C.z0 || vx0 + Wc * mpp > C.x0 + C.W * mpp || vz0 + Hc * mpp > C.z0 + C.H * mpp) { // (re)paint the cache: the view plus one view of margin each side
      const cv = (C && C.cv) || document.createElement('canvas'), W = Wc * 3, H = Hc * 3, x0 = Math.floor((vx0 - Wc * mpp) / mpp) * mpp, z0 = Math.floor((vz0 - Hc * mpp) / mpp) * mpp; cv.width = W; cv.height = H; this.paint(cv, x0, z0, mpp, true); this._zc = { cv, x0, z0, W, H, mpp, Wc, Hc }; }
    const Z = this._zc, sx = Math.round((vx0 - Z.x0) / mpp), sz = Math.round((vz0 - Z.z0) / mpp), X0 = Math.round((HUDC.width - Wc * k) / 2), Y0 = Math.round((Hh - Hc * k) / 2);
    HX.drawImage(Z.cv, sx, sz, Wc, Hc, X0, Y0, Wc * k, Hc * k);
    const zx = Z.x0 + sx * mpp, zz = Z.z0 + sz * mpp, mp = (x, z) => [X0 + Math.floor((x - zx) / mpp) * k, Y0 + Math.floor((z - zz) / mpp) * k], inV = (x, y) => x > X0 && x < X0 + Wc * k && y > Y0 && y < Y0 + Hc * k;
    HX.textAlign = 'center'; HX.font = (this.zoom >= 4 ? 18 : 16) + 'px serif';
    const txt = (t, x, y, c) => { if (!inV(x, y)) return; HX.fillStyle = 'rgba(30,20,14,.75)'; const w = HX.measureText(t).width; HX.fillRect(x - w / 2 - 3, y - 13, w + 6, 18); HX.fillStyle = c || 'rgb(240,230,205)'; HX.fillText(t, x, y + 1); };
    const placed = []; const lab = (t, x, y, c) => { if (placed.some(([a, b2, w]) => Math.abs(a - x) < w && Math.abs(b2 - y) < 18)) return; placed.push([x, y, t.length * 9 + 8]); txt(t, x, y, c); }; // no overlapping labels
    for (const w of CITY.all) { const [x, y] = mp((w.r.x0 + w.r.x1) / 2, (w.r.z0 + w.r.z1) / 2); lab(this.label(w.short), x, y, w.palace ? 'rgb(255,214,150)' : undefined); }
    if (this.zoom >= 3) for (const lay of CITY.lay) for (const t of lay.lots) { if (!t.name || t.r.x1 < zx || t.r.x0 > zx + Wc * mpp || t.r.z1 < zz || t.r.z0 > zz + Hc * mpp) continue; if (!(lay.wd.palace || t.big || this.zoom >= 6)) continue; const [x, y] = mp((t.r.x0 + t.r.x1) / 2, (t.r.z0 + t.r.z1) / 2); lab(t.name, x, y + 20, 'rgb(250,240,215)'); }
    for (const lm of this.landmarks()) { const [x, y] = mp(lm.x, lm.z); if (!inV(x, y)) continue; const ic = this._ic || (this._ic = document.createElement('canvas')); ic.width = ic.height = 7; const g5 = ic.getContext('2d'); g5.clearRect(0, 0, 7, 7); this.icon(g5, lm.ic, 3, 3); HX.drawImage(ic, x - 7 * k / 2, y - 7 * k / 2, 7 * k, 7 * k); }
    { const [ax, ay] = mp(P[0], P[2]); if (inV(ax, ay)) { const sc = 1.7, n = 2 * Math.ceil(6 * sc) + 1, h = (n - 1) / 2, sm = this._sm || (this._sm = document.createElement('canvas')); sm.width = sm.height = n; const g2 = sm.getContext('2d'); g2.clearRect(0, 0, n, n); this.arrow(g2, h, h, G.P.yaw, sc); HX.drawImage(sm, ax - (h + .5) * k, ay - (h + .5) * k, n * k, n * k); } } // rasterised in map pixels (k), like the map
    HX.textAlign = 'left'; HX.font = '16px monospace'; const help = 'x' + this.zoom + '   [-] [=] zoom   [arrows] pan   [M] close', hw = HX.measureText(help).width + 16; HX.fillStyle = 'rgba(30,20,14,.8)'; HX.fillRect(X0, Y0 + Hc * k - 26, hw, 26); HX.fillStyle = 'rgb(236,226,200)'; HX.fillText(help, X0 + 8, Y0 + Hc * k - 8); },
  label(nm) { const w = typeof CITY !== 'undefined' && CITY.all ? CITY.all.find(q => q.short === nm) : null; if (w && w.palace) return nm; return nm.replace(/曲江池.*/, '曲江') + (nm.length < 3 && !/市|曲江|門/.test(nm) ? '坊' : ''); }, // palace units keep their names
  draw() {
    if (typeof CITY === 'undefined' || !CITY.ready || G.inside) return; if (Input.hit('KeyM')) { this.big = !this.big; if (this.big) { this.cx = G.P.pos[0]; this.cz = G.P.pos[2]; } }
    const Hh = HUDC.height, gp = Math.max(1, Math.round(Hh / 300)), P = G.P.pos; HX.imageSmoothingEnabled = false;
    if (this.big) { const I = Input, Z = this.ZOOMS, k0 = Math.max(0, Z.indexOf(this.zoom || 1)); let k1 = k0; if (I.hit('Equal') || I.hit('NumpadAdd')) k1 = Math.min(Z.length - 1, k0 + 1); if (I.hit('Minus') || I.hit('NumpadSubtract')) k1 = Math.max(0, k0 - 1); // M map zoom: - / = one level at a time, arrow keys pan
      if (k1 !== k0 || !this.zoom) { this.zoom = Z[k1]; if (this.cx === undefined) { this.cx = P[0]; this.cz = P[2]; } } }
    if (this.big && this.zoom > 1) return this.drawZoom(Hh, gp, P);
    if (this.big) { // whole city
      if (!this.cvB) { const P0 = PLAN, cv = this.cvB = document.createElement('canvas'); cv.width = Math.ceil(P0.W / this.BIGMPP) + 8; cv.height = Math.ceil((P0.H / 2 - this.bigZ0()) / this.BIGMPP) + 8; this.paint(cv, -P0.W / 2 - 4 * this.BIGMPP, this.bigZ0() - 4 * this.BIGMPP, this.BIGMPP, false); } // north edge: 大明宮 outside the city wall
      const cv = this.cvB, LW = 132, k0 = Math.min((HUDC.width * .96 - LW) / cv.width, Hh * .96 / cv.height), k = k0 >= 1 ? Math.floor(k0) : k0, X0 = Math.round((HUDC.width - cv.width * k + LW) / 2), Y0 = Math.round((Hh - cv.height * k) / 2);
      HX.drawImage(cv, X0, Y0, cv.width * k, cv.height * k); const ox = -PLAN.W / 2 - 4 * this.BIGMPP, oz = this.bigZ0() - 4 * this.BIGMPP, mp = (x, z) => [X0 + Math.floor((x - ox) / this.BIGMPP) * k, Y0 + Math.floor((z - oz) / this.BIGMPP) * k];
      HX.font = '16px serif'; HX.textAlign = 'center'; HX.fillStyle = 'rgb(40,30,22)'; for (const w of CITY.all) { if (w.palace) continue; const [x, y] = mp((w.r.x0 + w.r.x1) / 2, (w.r.z0 + w.r.z1) / 2); HX.fillText(this.label(w.short).replace(/坊$/, ''), x, y + 6); } // the whole-city map: 平康, not 平康坊 (three characters overflowed the narrow central 坊) for (const [nm, r] of [['大明宮', PLAN.daming], ['太極宮', PLAN.palace], ['皇城', PLAN.imperial]]) if (r) { const [x, y] = mp((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); HX.fillText(nm, x, y + 6); } { const xq = CITY.all.filter(w => w.palace && w.r.x0 > (PLAN.imperial ? PLAN.imperial[2] : 1e9) && w.r.z0 > -PLAN.H / 2); if (xq.length) { const x0 = Math.min(...xq.map(w => w.r.x0)), x1 = Math.max(...xq.map(w => w.r.x1)), z0 = Math.min(...xq.map(w => w.r.z0)), z1 = Math.max(...xq.map(w => w.r.z1)), [x, y] = mp((x0 + x1) / 2, (z0 + z1) / 2); HX.fillText('興慶宮', x, y + 6); } } // the palaces labelled whole, not by unit
      // (the player marker is drawn last, on top: see below)
      { const keys = ['wine', 'inn', 'quarter', 'cloth', 'pottery', 'medicine', 'food', 'books', 'smith', 'rope', 'temple', 'dao', 'office', 'jinzou', 'mansion', 'well', 'pagoda', 'gate', 'market'], lx = Math.max(8, X0 - LW + 4), ly0 = Y0 + 8 /* the legend beside the map, not over it */;
        HX.fillStyle = 'rgba(30,22,16,.82)'; HX.fillRect(lx - 4, ly0 - 4, 118, keys.length * 20 + 8); HX.textAlign = 'left'; HX.font = '16px serif';
        const ic = this._ic || (this._ic = document.createElement('canvas')); keys.forEach((key, i) => { ic.width = ic.height = 7; const g4 = ic.getContext('2d'); g4.clearRect(0, 0, 7, 7); this.icon(g4, key, 3, 3); HX.drawImage(ic, lx, ly0 + i * 20, 14, 14); HX.fillStyle = 'rgb(236,226,200)'; HX.fillText(this.ICON[key].n, lx + 20, ly0 + i * 20 + 13); }); }
      HX.fillStyle = (G.gateOpen ?? 1) < .5 ? 'rgb(200,60,40)' : 'rgb(236,196,90)'; for (const g of CITY.gates || []) { const [x, y] = mp(g.x, g.z); HX.fillRect(x - k, y - k, 2 * k + 1, 2 * k + 1); }
      for (const lm of this.landmarks()) { const [x, y] = mp(lm.x, lm.z); const ic = this._ic; ic.width = ic.height = 7; const g5 = ic.getContext('2d'); g5.clearRect(0, 0, 7, 7); this.icon(g5, lm.ic, 3, 3); HX.drawImage(ic, x - 7, y - 7, 14, 14); }
      { // the player: a big arrow with a dark outline and a pulsing ring, drawn over everything
        const [ax, ay] = mp(P[0], P[2]), kk = Math.max(1, k), sc = 1.3, n = 2 * Math.ceil(6 * sc) + 1, h = (n - 1) / 2, sm = this._sm || (this._sm = document.createElement('canvas')); sm.width = sm.height = n; const g2 = sm.getContext('2d'); g2.clearRect(0, 0, n, n); this.arrow(g2, h, h, G.P.yaw, sc); // in map pixels (kk), like the map; a little smaller here: the ring marks you
        const rr = (h + 4) * kk * (1 + .25 * Math.sin(performance.now() / 250)); HX.strokeStyle = 'rgba(255,240,200,.9)'; HX.lineWidth = Math.max(2, kk); HX.beginPath(); HX.arc(ax, ay, rr, 0, TAU); HX.stroke(); HX.strokeStyle = 'rgba(20,10,5,.8)'; HX.lineWidth = 1; HX.beginPath(); HX.arc(ax, ay, rr + Math.max(2, kk), 0, TAU); HX.stroke();
        HX.drawImage(sm, ax - (h + .5) * kk, ay - (h + .5) * kk, n * kk, n * kk); }
      HX.textAlign = 'left'; return; }
    // local map: a cached 640-px tile at 2 m/px around the player, re-painted when the player nears its edge
    const M = this.MPP, T = this.TILE; this.tk = (this.tk || 0) + 1; let wn = this.wn;
    if (this.tk % 90 === 0) { wn = 0; for (const c of CITY.order) if (c.world && Math.abs(c.cx - this.tcx) < T * M / 2 && Math.abs(c.cz - this.tcz) < T * M / 2) wn++; }
    const need = !this.tile || Math.abs(P[0] - this.tcx) > T * M * .3 || Math.abs(P[2] - this.tcz) > T * M * .3 || wn !== this.wn; this.wn = wn;
    if (need) { const cv = this.tile || (this.tile = document.createElement('canvas')); cv.width = cv.height = T; this.tcx = Math.round(P[0] / M) * M; this.tcz = Math.round(P[2] / M) * M; this.paint(cv, this.tcx - T * M / 2, this.tcz - T * M / 2, M, true); }
    const N = 120, sm = this._lm || (this._lm = document.createElement('canvas')); sm.width = sm.height = N; const g = sm.getContext('2d'); g.imageSmoothingEnabled = false;
    const ox = Math.floor((P[0] - (this.tcx - T * M / 2)) / M) - N / 2, oz = Math.floor((P[2] - (this.tcz - T * M / 2)) / M) - N / 2; g.drawImage(this.tile, ox, oz, N, N, 0, 0, N, N); this.arrow(g, N / 2, N / 2, G.P.yaw);
    const S = N * gp, X0 = HUDC.width - S - 12 * gp, Y0 = 12 * gp; HX.fillStyle = 'rgb(30,22,16)'; HX.fillRect(X0 - gp, Y0 - gp, S + 2 * gp, S + 2 * gp); HX.drawImage(sm, X0, Y0, S, S);
    // labels: wards and named compounds in view (Unifont)
    HX.save(); HX.beginPath(); HX.rect(X0, Y0, S, S); HX.clip(); HX.font = '16px serif'; HX.textAlign = 'center';
    const wx = x => X0 + (Math.floor(x / M) - Math.floor(P[0] / M) + N / 2) * gp, wz = z => Y0 + (Math.floor(z / M) - Math.floor(P[2] / M) + N / 2) * gp, R2 = N * M / 2;
    HX.fillStyle = 'rgba(250,240,220,.9)'; for (const lay of CITY.lay) for (const t of lay.lots) if (t.name) { const mx = (t.r.x0 + t.r.x1) / 2, mz = (t.r.z0 + t.r.z1) / 2; if (Math.abs(mx - P[0]) < R2 && Math.abs(mz - P[2]) < R2) HX.fillText(t.name, wx(mx), wz(mz) + 6); }
    HX.fillStyle = 'rgb(40,30,22)'; for (const w of CITY.all) { const mx = (w.r.x0 + w.r.x1) / 2, mz = (w.r.z0 + w.r.z1) / 2; if (Math.abs(mx - P[0]) < R2 + 400 && Math.abs(mz - P[2]) < R2 + 400) { const x = Math.max(X0 + 24, Math.min(X0 + S - 24, wx(mx))), y = Math.max(Y0 + 10, Math.min(Y0 + S - 6, wz(mz) + 6)); if (inR(w.r, P[0], P[2])) continue; HX.fillText(this.label(w.short), x, y); } }
    // neighbouring wards: a small arrow and the name at the middle of each edge
    { const here2 = CITY.all.find(w => inR(w.r, P[0], P[2])); const nb = (dx, dz) => { let best = null, bd = 1e9; for (const w of CITY.all) { if (w === here2) continue;
          const over = dx ? (P[2] >= w.r.z0 - 30 && P[2] <= w.r.z1 + 30) : (P[0] >= w.r.x0 - 30 && P[0] <= w.r.x1 + 30); if (!over) continue;
          const d = dx > 0 ? w.r.x0 - P[0] : dx < 0 ? P[0] - w.r.x1 : dz > 0 ? w.r.z0 - P[2] : P[2] - w.r.z1; if (d > -5 && d < bd) { bd = d; best = w; } } return best; };
      HX.font = '16px serif'; for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const w = nb(dx, dz); if (!w) continue; const t = (dz < 0 ? '▲' : dz > 0 ? '▼' : dx > 0 ? '▶' : '◀') + this.label(w.short), tw = HX.measureText(t).width;
        const cx = dx > 0 ? X0 + S - tw / 2 - 4 : dx < 0 ? X0 + tw / 2 + 4 : X0 + S / 2, cy = dz < 0 ? Y0 + 16 : dz > 0 ? Y0 + S - 4 : Y0 + S / 2 + 6;
        HX.fillStyle = 'rgba(30,22,16,.75)'; HX.fillRect(Math.round(cx - tw / 2 - 2), Math.round(cy - 15), Math.round(tw + 4), 19); HX.fillStyle = 'rgb(236,226,200)'; HX.textAlign = 'center'; HX.fillText(t, Math.round(cx), Math.round(cy)); } }
    // landmarks: icon at its place, or pinned to the edge in its direction with the distance
    const edgeSet = new Set(this.landmarks().filter(q => Math.abs(q.x - P[0]) >= R2 - 6 * M || Math.abs(q.z - P[2]) >= R2 - 6 * M).sort((a, b) => Math.hypot(a.x - P[0], a.z - P[2]) - Math.hypot(b.x - P[0], b.z - P[2])).filter((q, n) => !q.minor || n < 4).slice(0, 6)); // border pins: the main sights + the nearest few
    for (const lm of this.landmarks()) { const dx = lm.x - P[0], dz = lm.z - P[2], d = Math.hypot(dx, dz), inside = Math.abs(dx) < R2 - 6 * M && Math.abs(dz) < R2 - 6 * M;
      const sm2 = this._ic || (this._ic = document.createElement('canvas')); sm2.width = sm2.height = 7; const g3 = sm2.getContext('2d'); g3.clearRect(0, 0, 7, 7); this.icon(g3, lm.ic, 3, 3);
      let px, pz; if (inside) { px = wx(lm.x); pz = wz(lm.z); } else { if (!edgeSet.has(lm)) continue; const k = (R2 - 3.5 * M) / Math.max(Math.abs(dx), Math.abs(dz)); px = wx(P[0] + dx * k); pz = wz(P[2] + dz * k); } // off the tile: pinned on the border itself
      HX.drawImage(sm2, Math.round(px - 3 * gp), Math.round(pz - 3 * gp), 7 * gp, 7 * gp);
      }
    // ward gates 坊門: a gateway glyph (gold while open, red when shut after the drums), across the wall line
    { const shut = (G.gateOpen ?? 1) < .5; for (const g of CITY.gates || []) { if (Math.abs(g.x - P[0]) > R2 || Math.abs(g.z - P[2]) > R2) continue; const x = wx(g.x), y = wz(g.z), ns = g.side === 'n' || g.side === 's';
        HX.fillStyle = 'rgb(30,22,16)'; HX.fillRect(x - 4 * gp, y - 4 * gp, 8 * gp, 8 * gp); HX.fillStyle = shut ? 'rgb(200,60,40)' : 'rgb(236,196,90)';
        if (ns) { HX.fillRect(x - 3 * gp, y - 3 * gp, 6 * gp, gp); HX.fillRect(x - 3 * gp, y - 3 * gp, gp, 6 * gp); HX.fillRect(x + 2 * gp, y - 3 * gp, gp, 6 * gp); if (shut) HX.fillRect(x - 2 * gp, y, 4 * gp, gp); }
        else { HX.fillRect(x - 3 * gp, y - 3 * gp, gp, 6 * gp); HX.fillRect(x - 3 * gp, y - 3 * gp, 6 * gp, gp); HX.fillRect(x - 3 * gp, y + 2 * gp, 6 * gp, gp); if (shut) HX.fillRect(x, y - 2 * gp, gp, 4 * gp); } } }
    HX.restore();
    // where am I
    const here = CITY.all.find(w => inR(w.r, P[0], P[2])) || (CITY.gatezone && inR(CITY.gatezone.r, P[0], P[2]) ? CITY.gatezone : null); HX.font = '16px serif'; HX.fillStyle = 'rgba(232,220,192,.9)'; HX.textAlign = 'right';
    HX.fillText(here ? this.label(here.short) : '街', X0 + S, Y0 + S + 20); let ly = Y0 + S + 38;
    if (here && CITY.gates) { let best = null, bd = 1e9; for (const g of CITY.gates) { if (g.ward !== here.name && g.ward !== here.short) continue; const d = Math.hypot(g.x - P[0], g.z - P[2]); if (d < bd) { bd = d; best = g; } }
      if (best) { const a8 = Math.round(Math.atan2(best.x - P[0], -(best.z - P[2])) / (PI / 4)) & 7; HX.fillStyle = (G.gateOpen ?? 1) < .5 ? 'rgba(220,110,90,.95)' : 'rgba(236,196,90,.95)'; HX.fillText('坊門' + ((G.gateOpen ?? 1) < .5 ? '（閉）' : '') + ' ' + '↑↗→↘↓↙←↖'[a8] + ' ' + ZH.dist(bd), X0 + S, ly); HX.fillStyle = 'rgba(232,220,192,.9)'; ly += 18; } }
    // landmarks: direction (8-way, north up) and distance
    const minor = this.landmarks().filter(q => q.minor).map(q => [Math.hypot(q.x - P[0], q.z - P[2]), q]).filter(q => q[0] < 2500).sort((a, b) => a[0] - b[0]).slice(0, 2).map(q => q[1]); // the two nearest of the many landmarks
    for (const lm of this.landmarks()) { if (lm.minor && !minor.includes(lm)) continue; const dx = lm.x - P[0], dz = lm.z - P[2], d = Math.hypot(dx, dz); if (d < 60) continue; const a8 = Math.round(Math.atan2(dx, -dz) / (PI / 4)) & 7, ar = '↑↗→↘↓↙←↖'[a8];
      HX.fillStyle = 'rgba(232,220,192,.85)'; HX.fillText(lm.n + ' ' + ar + ' ' + ZH.dist(d), X0 + S, ly); ly += 18; }
    if (G.fly) HX.fillText('飛' + ((G.flyK || 1) !== 1 ? ' 速×' + (G.flyK || 1).toFixed(1) : '') + (P[1] > 10 ? '  高' + ZH.height(P[1]) : ''), X0 + S, ly); HX.textAlign = 'left';
  },
};
// fade from black after a jump (warp, leaving a building) until the full-detail chunks around the player have streamed in
const LOADFADE = {
  a: 0, t: 0, hold: false,
  start() { this.a = 1; this.t = 0; this.hold = true; },
  ready() { if (typeof CITY === 'undefined' || !CITY.ready || G.inside) return true; const P = G.P.pos, r = Math.min(CITY.R0, 70);
    for (const c of CITY.order) { if (Math.abs(c.cx - P[0]) > r + 32 || Math.abs(c.cz - P[2]) > r + 32) continue; if (c.want && (!c.m0 || (c.m0.mesh && c.m0.mesh.pending))) return false; } return true; },
  update(dt) { if (!this.a) return; this.t += dt; if (this.hold && ((this.t > .25 && this.ready()) || this.t > 4)) this.hold = false; if (!this.hold) this.a = Math.max(0, this.a - dt / .45); },
  draw() { if (this.a > 0) { HX.fillStyle = `rgba(0,0,0,${this.a})`; HX.fillRect(0, 0, HUDC.width, HUDC.height); } },
};
// interaction prompt: a small pixel door with an arrow going through it (no text), drawn at the minimap's pixel scale
const PROMPT = {
  // a 16x16 one-colour glyph in the spirit of the Unifont text: a door frame with an arrow going in (mirrored: coming out)
  G: ['................', '.......#########', '.......#.......#', '.......#.......#', '...#...#.......#', '....#..#.......#', '.....#.#.......#', '########.....#.#', '.....#.#.......#',
      '....#..#.......#', '...#...#.......#', '.......#.......#', '.......#.......#', '.......#.......#', '.......#########', '................'],
  draw(kind) { const c = this.cv || (this.cv = document.createElement('canvas')); if (this.k !== kind) { this.k = kind; c.width = c.height = 16; const g = c.getContext('2d'); g.clearRect(0, 0, 16, 16); g.fillStyle = '#f0e8d8';
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (this.G[y][kind === 'out' ? 15 - x : x] === '#') g.fillRect(x, y, 1, 1); }
    const k = Math.max(2, Math.round(HUDC.height / 360)), w = 16 * k, x = Math.round(HUDC.width / 2 - w / 2), y = Math.round(HUDC.height * .6);
    HX.imageSmoothingEnabled = false; HX.globalAlpha = .9; HX.drawImage(c, x, y, w, w); HX.globalAlpha = 1; },
};
// Chinese numerals and Tang units for the HUD: 1 步 ≈ 1.47 m, 1 里 = 360 步 ≈ 531 m, 1 丈 ≈ 2.95 m (REF_CHANGAN.md)
const ZH = {
  num(n) { n = Math.round(n); if (n <= 0) return '〇'; const D = '〇一二三四五六七八九', U = ['', '十', '百', '千']; let s = '', z = false; const ds = String(n).split('').map(Number), L = ds.length;
    ds.forEach((d, i) => { const u = L - 1 - i; if (d === 0) { z = s.length > 0; return; } if (z) { s += '零'; z = false; } s += (d === 1 && u === 1 && i === 0 ? '' : D[d]) + U[u]; }); return s; },
  dist(m) { const bu = m / 1.47; if (bu < 360) return this.num(Math.max(10, Math.round(bu / 10) * 10)) + '步'; const li = m / 531, h = Math.round(li * 2) / 2; return this.num(Math.floor(h)) + '里' + (h % 1 ? '半' : ''); },
  height(m) { return this.num(Math.round(m / 2.95)) + '丈'; },
};
// NPC speech (Middle Chinese TTS via AU.say, lines in speech.js): bumps, vendors hawking / inviting, pairs chatting, patrols at night, monks
const TALK = {
  t: 0, cd: new Map(), busyUntil: 0,
  who(type) { return /child|girl/.test(type) ? 'child' : /oldwoman/.test(type) ? 'elder' : /^old$/.test(type) ? 'elder' : /monk|nun/.test(type) ? 'monk' : /guard/.test(type) ? 'guard' : /huji/.test(type) ? 'hostess' : /woman|veil|musician|maid|nun|horsewoman/.test(type) ? 'woman' : /scholar|official/.test(type) ? 'scholar' : /labourer|porter/.test(type) ? 'labourer' : 'man'; },
  say(i, a, ctx, o = {}) { const now = G.t; if ((this.cd.get(i) || 0) > now || now < this.busyUntil - 2.5) return 0; if (typeof AU === 'undefined' || !AU.say) return 0; if (SOUND.hear !== undefined && SOUND.hear < .25) return 0; // high above the street: no chatter
    let d = 0; try { d = AU.say(a.x, (a.y || 0) + 1.55, a.z, Object.assign({ ctx, who: this.who(a.type || ''), seed: (i * 2654435761) >>> 0 }, o)) || 0; } catch (e) { return 0; }
    if (d > 0) { this.cd.set(i, now + d + 6 + Math.random() * 8); this.busyUntil = Math.max(this.busyUntil, now + d * .6); } return d; },
  bump(i, a, speed) { if (speed > 1.2) this.say(i, a, 'bump', { mood: speed > 4 ? 'angry' : 'neutral' }); },
  update(dt) { if (G.inside || G.fly || typeof CROWD === 'undefined' || !CROWD.near || !CROWD.info) return; this.t -= dt; if (this.t > 0) return; this.t = .7 + Math.random() * .6;
    const P = G.P.pos, ids = CROWD.near(P[0], P[2], 16), A = []; for (let j = 0; j < ids.length; j++) { const a = CROWD.info(ids[j]); if (a && !/horse|donkey|camel|ox|dog|chicken/.test(a.type || '')) A.push(a); } // people only (not your horse, nor the animals)
    const night = CLOCK.curfew();
    for (const a of A) { const d = Math.hypot(a.x - P[0], a.z - P[2]);
      if (a.role === 'attendant' && !night && Math.random() < .35) { if (d < 4.5) this.say(a.i, a, /huji/.test(a.type) ? 'wineshop' : 'invite'); else if (d < 14) this.say(a.i, a, 'hawk'); }
      else if (a.role === 'patrol' && night && d < 14 && Math.random() < .5) this.say(a.i, a, 'guard', { mood: 'shout' });
      else if (/monk|nun/.test(a.type) && d < 8 && Math.random() < .12) this.say(a.i, a, 'monk');
      else if (/beggar/.test(a.type) && d < 5 && Math.random() < .3) this.say(a.i, a, 'beggar');
      else if (/child/.test(a.type) && d < 8 && Math.random() < .06) this.say(a.i, a, 'child'); }
    // pairs walking together: the nearer of two close walkers says a line, sometimes the other answers
    for (let p = 0; p < A.length; p++) for (let q = p + 1; q < A.length; q++) { const a = A[p], b = A[q]; if (Math.hypot(a.x - b.x, a.z - b.z) > 1.6 || a.role === 'attendant' || b.role === 'attendant') continue;
      if (Math.random() < .25) { const d1 = this.say(a.i, a, 'chat'); if (d1 > 0 && Math.random() < .6) setTimeout(() => this.say(b.i, b, 'chat'), (d1 + .3) * 1000); } p = A.length; break; }
  },
};
// the court in the palaces (engine/palace.js: PALACE.people(unit, hour) → static people): placed while the player is within ~350 m of a
// palace unit, refreshed every half hour of game time (audiences at dawn, the emperor's day), removed when far
const PALPPL = { t: 0, on: new Map(),
  update(dt) { if ((this.t -= dt) > 0 || typeof CITY === 'undefined' || !CITY.ready || typeof PALACE === 'undefined' || !PALACE || !PALACE.people || typeof CROWD === 'undefined' || !CROWD.placeStatic) return; this.t = 2;
    const P = G.P.pos, bucket = Math.floor(G.hour * 2);
    for (const u of CITY.all) { if (!u.palace) continue; const d = Math.hypot(Math.max(u.r.x0 - P[0], 0, P[0] - u.r.x1), Math.max(u.r.z0 - P[2], 0, P[2] - u.r.z1)), cur = this.on.get(u.name);
      if (cur && (d > 450 || cur.b !== bucket || G.inside)) { for (const i of cur.idx) CROWD.remove(i); this.on.delete(u.name); }
      if (d < 350 && !this.on.has(u.name) && !G.inside) { let list = []; try { list = PALACE.people(u, G.hour) || []; } catch (e) { console.warn('PALACE.people', e); } this.on.set(u.name, { b: bucket, idx: CROWD.placeStatic(list) }); } } },
};
// ---------------- people at the landmarks (temples, abbeys, the 樂遊原, 杏園): groups at the sites the builders record (LANDMARKS.ctx(lot).sites)
// and strollers on short checked legs between nodes. Everything is placed against the loaded collision world (ground height, walls, roofs
// over open ground), filled in as the chunks load, and removed when the player is far. Busiest in the morning and the late afternoon.
const LMPPL = { t: 0, list: null, on: new Map(), legs: new Map(),
  VIS: [['man', 16], ['woman', 12], ['veil', 6], ['official', 5], ['scholar', 7], ['child', 7], ['girl', 4], ['old', 5], ['oldwoman', 5], ['maid', 4], ['sogdian', 2], ['huji', 1]],
  pick(R, mix) { let t = 0; for (const m of mix) t += m[1]; let q = R() * t; for (const m of mix) { q -= m[1]; if (q < 0) return m[0]; } return mix[0][0]; },
  act(kind, h) { if (kind === 'park') return h < 5.5 || h >= 19.5 ? 0 : h < 8 ? .35 : h < 11 ? .7 : h < 15 ? .45 : h < 19 ? 1 : .5; // summer: the 原 fills in the cool of the evening
    return h < 5 || h >= 19.5 ? 0 : h < 6 ? .3 : h < 8 ? .6 : h < 12 ? 1 : h < 15 ? .6 : h < 18.5 ? .85 : .4; },
  init() { this.list = []; for (const lay of CITY.lay || []) for (const lot of lay.lots) if (lot.big && LANDMARKS.has(lot)) this.list.push(lot); },
  update(dt) {
    if (typeof CITY === 'undefined' || !CITY.ready || typeof LANDMARKS === 'undefined' || !LANDMARKS.ctx || typeof CROWD === 'undefined' || !CROWD.placeStatic) return;
    this.walk(dt); if ((this.t -= dt) > 0) return; this.t = .5; if (!this.list) this.init();
    const P = G.P.pos, hb = Math.floor(G.hour), T0 = performance.now();
    const dist = lot => { const r = lot.r; return Math.hypot(Math.max(r.x0 - P[0], 0, P[0] - r.x1), Math.max(r.z0 - P[2], 0, P[2] - r.z1)); }, key = lot => lot.name + '@' + Math.round(lot.r.x0);
    for (const lot of this.list) { const k = key(lot), cur = this.on.get(k), d = cur ? dist(lot) : 0; if (cur && (d > 300 || G.inside || (cur.hb !== hb && d > 90))) { this.drop(cur); this.on.delete(k); } } // release first, then place
    for (const lot of this.list) { const k = key(lot), cur = this.on.get(k), d = dist(lot);
      if (!cur && d < 200 && !G.inside) { let E = null; try { E = this.start(lot, hb); } catch (e) { console.warn('LMPPL', lot.name, e); } if (E) this.on.set(k, E); }
      const E = this.on.get(k); if (E && E.jobs.length) for (let i = 0; i < E.jobs.length && performance.now() - T0 < 2.5; ) { const st = E.jobs[i](); if (st === 'wait') i++; else E.jobs.splice(i, 1); } } }, // ≤ 2.5 ms of placing per tick (every 0.5 s)
  drop(E) { for (const i of E.idx) CROWD.remove(i); for (const w of E.walkers) CROWD.remove(w.i); },
  // world helpers: the chunk's collision is loaded; standing height near the expected one, nothing solid at the body, (open: no roof above)
  loaded(x, z) { const c = CITY.chunkAt(x, z); return !!(c && c.world); },
  stand(x, z, y0, tol = .45, open = false) { const W = G.world, g = W.ground(x, z, y0 + .5, .5).y; if (!(Math.abs(g - y0) <= tol)) return null; if (W.solidAt(x, g + .6, z) || W.solidAt(x, g + 1.5, z)) return null; if (open && W.ceil(x, z, g, g + 6) < g + 5) return null; return g; },
  start(lot, hb) {
    const C = LANDMARKS.ctx(lot); if (!C) return null; const park = !!C.hf, dao = COMP.isDao(lot), h = G.hour, act = this.act(park ? 'park' : 'temple', h), night = act === 0;
    const R = RNG(((lot.seed | 0) * 7919 + hb * 104729) >>> 0), F = C.F, E = { lot, hb, idx: [], walkers: [], jobs: [], used: new Set(), nodes: [] };
    const cler = dao ? 'daoist' : 'monk', vis = /祆/.test(lot.name) ? [['sogdian', 6], ['huji', 2], ['man', 2]] : /波斯|大秦/.test(lot.name) ? [['persian', 5], ['sogdian', 2], ['man', 2]] : this.VIS;
    const yExp = (lx, lz) => C.lawnY ? C.lawnY(lx, lz) : (C.hf ? C.hf(lx, lz) : 0);
    const W2 = (lx, lz) => F.p(lx, 0, lz), yawOf = (fx, fz) => Math.atan2(F.c * fx + F.s * fz, -F.s * fx + F.c * fz); // lot-local facing → crowd yaw (faces (sin, cos))
    const cellKey = (x, z) => Math.round(x / .75) + ',' + Math.round(z / .75);
    // place one person at lot-local (lx, lz); returns 'wait' (chunk not loaded), false (no room) or true
    const put = (type, lx, lz, fx, fz, anim, o = {}) => { const p = W2(lx, lz), ld = this.loaded(p[0], p[2]); if (!ld && !(park && o.floor === undefined)) return 'wait'; const ck = cellKey(p[0], p[2]); if (E.used.has(ck)) return false;
      // the open lawn of a park beyond the loaded collision: the builder's exact lawn height (no walls out there; marked footprints avoided)
      const y = !ld ? (o.mat || C.free(lx, lz, .5) ? yExp(lx, lz) + (o.dy || 0) : null) : o.floor !== undefined ? this.stand(p[0], p[2], o.floor, .35) : this.stand(p[0], p[2], yExp(lx, lz) + (o.dy || 0), o.tol ?? .45, o.open); if (y === null) return false;
      const ids = CROWD.placeStatic([{ type, x: p[0], y: y + (o.lift || 0), z: p[2], yaw: yawOf(fx, fz), anim, seated: o.seated, flags: o.flags, seed: (R() * 1e9) | 0 }]); if (!ids.length) return 'wait'; /* the crowd is full: try again later */ E.used.add(ck); E.idx.push(...ids); return true; };
    const job = fn => E.jobs.push(fn), visitor = () => this.pick(R, vis);
    const many = (n, fn) => { let i = 0, tries = 0, again = 0; return () => { while (i < n && tries < n * 4) { tries++; const r = fn(i); if (r === 'wait') return 'wait'; if (r) i++; } if (i === 0 && n > 0 && again++ < 30) { tries = 0; return 'wait'; } return 'done'; }; }; // nobody placed yet (chunks still arriving): try again on later ticks
    for (const S of C.sites) {
      const fx = S.face ? S.face[0] : 0, fz = S.face ? S.face[1] : 1, rx = -fz, rz = fx; // row direction (across the facing)
      if (S.kind === 'gate_out' && !night) { job(many(2 + (R() * 2 | 0), i => { const sd = i % 2 ? 1 : -1, a = S.w / 2 + .5 + R() * 3; return put(i < 2 ? 'vendor' : 'beggar', S.lx + rx * sd * a, S.lz + rz * sd * a + fz * (R() * .8), fx, fz, i < 2 ? 'hawk' : 'sit_ground'); })); }
      else if (S.kind === 'gate_in') job(many(1, () => put(cler === 'monk' && !park ? cler : 'old', S.lx + (R() - .5) * 3, S.lz, fx, fz, night ? 'stand' : R() < .5 ? 'sweep' : 'stand')));
      else if (S.kind === 'worship' && !night) { const n = Math.min(14, Math.round(S.w / 1.1 * (.4 + act * .6))); job(many(n, i => { const row = i % 2, x = -S.w / 2 + (S.w / Math.max(1, Math.ceil(n / 2))) * (Math.floor(i / 2) + .5) + (R() - .5) * .3, k = R() < .65;
        return put(visitor(), S.lx + rx * x - fx * row * 1.3, S.lz + rz * x - fz * row * 1.3, fx, fz, k ? 'kneel' : 'bow'); })); } // facing the hall (S.face), a second row behind
      else if (S.kind === 'censer' && !night) job(many(2 + Math.round(4 * act), i => { const a = R() * TAU, r = S.r + .3; return put(visitor(), S.lx + Math.cos(a) * r, S.lz + Math.sin(a) * r, -Math.cos(a), -Math.sin(a), R() < .5 ? 'bow' : 'stand'); }));
      else if (S.kind === 'hall_in') { const chant = h >= 5.5 && h < 8 || h >= 16 && h < 19, n = park ? (night ? 0 : 2) : night ? 2 : chant ? Math.round(S.w / 1.15) * 2 : 3 + (R() * 3 | 0);
        job(many(n, i => { const row = i % 2, per = Math.max(1, Math.ceil(n / 2)), x = -S.w / 2 + S.w / per * (Math.floor(i / 2) + .5); return put(park ? visitor() : cler, S.lx + rx * x - fx * row * 1.2, S.lz + rz * x - fz * row * 1.2, fx, fz, park ? 'bow' : 'kneel', { floor: S.floor }); })); }
      else if ((S.kind === 'pagoda' || S.kind === 'altar' || S.kind === 'tree') && !night) job(many(4 + Math.round(12 * act), () => { const a = R() * TAU, r = S.r + R() * 3; return put(visitor(), S.lx + Math.cos(a) * r, S.lz + Math.sin(a) * r, -Math.cos(a), -Math.sin(a), R() < .7 ? 'look' : 'talk'); }));
      else if (S.kind === 'pav' && !night && R() < .3 + act * .6) job(many(2 + (R() * 3 | 0), () => { const a = R() * TAU, r = R() * S.r * .55; return put(visitor(), S.lx + Math.cos(a) * r, S.lz + Math.sin(a) * r, Math.cos(a), Math.sin(a), R() < .6 ? 'look' : 'talk', { floor: S.floor }); }));
      else if (S.kind === 'picnic' && act > 0 && R() < .25 + act * .75) { const ca = Math.cos(S.yaw), sa = Math.sin(S.yaw), L2 = (ax, az) => [S.lx + ca * ax + sa * az, S.lz - sa * ax + ca * az], seats = [[-.9, .85], [0, .9], [.9, .85], [-.9, -.85], [0, -.9], [.9, -.85]], nn = 3 + (R() * 4 | 0);
        const who = R() < .5 ? ['official', 'scholar', 'man', 'scholar', 'woman', 'man'] : ['woman', 'veil', 'girl', 'woman', 'oldwoman', 'child'];
        job(many(nn, i => { const [ax, az] = seats[i], q = L2(ax, az), d = L2(0, 0); return put(who[i], q[0], q[1], d[0] - q[0], d[1] - q[1], i === 1 && R() < .5 ? 'pipa' : R() < .5 ? 'sit_drink' : 'sit_talk', { seated: true, dy: .04, lift: .04, mat: true }); }));
        if (R() < .7) job(many(1, () => { const q = L2(2.1, 0), d = L2(0, 0); return put('maid', q[0], q[1], d[0] - q[0], d[1] - q[1], 'serve', { mat: true }); })); }
      else if (S.kind === 'brow' && act > 0 && R() < .35 + act * .5) job(many(1 + (R() * 3 | 0), i => put(visitor(), S.lx + rx * (i - 1) * 1.1 + (R() - .5) * .4, S.lz + rz * (i - 1) * 1.1, fx, fz, R() < .75 ? 'look' : 'talk', { open: true })));
      else if (S.kind === 'horses' && act > .2) { job(many(1 + Math.round(3 * act), i => put('horse', S.lx + rx * (-3 + i * 2), S.lz + rz * (-3 + i * 2) + fz * 1.6, -fx, -fz, R() < .5 ? 'graze' : 'horse_stand', { flags: 1, tol: .6 })));
        job(many(1, () => put('labourer', S.lx + rx * 4.5 + fz * 2.4, S.lz + rz * 4.5 + fz * 2.4, -rx, -rz, 'stand'))); }
      // open courts, orchards: groups of two or three talking, families, people resting in the shade, a monk or two
      if ((S.kind === 'front' || S.kind === 'court' || S.kind === 'orchard') && S.rect) { const [x0, z0, x1, z1] = S.rect, area = (x1 - x0) * (z1 - z0), ng = Math.round(area / (S.kind === 'orchard' ? 300 : 360) * (night ? .03 : .25 + act * .75));
        for (let g = 0; g < ng; g++) { const cx = x0 + R() * (x1 - x0), cz = z0 + R() * (z1 - z0), kind = R(); 
          if (kind < .45) job(many(2 + (R() < .3 ? 1 : 0), i => { const a = i * TAU / 3 + R() * .4; return put(i === 0 && !park && R() < .25 ? cler : visitor(), cx + Math.cos(a) * .7, cz + Math.sin(a) * .7, -Math.cos(a), -Math.sin(a), 'talk', { open: S.kind !== 'orchard' }); }));
          else if (kind < .7 && S.kind === 'orchard' || kind < .55) job(many(2 + (R() * 3 | 0), i => { const a = i * TAU / 4 + R() * .5; return put(visitor(), cx + Math.cos(a) * .8, cz + Math.sin(a) * .8, -Math.cos(a), -Math.sin(a), R() < .5 ? 'sit_ground' : 'sit_talk', { seated: true }); }));
          else E.nodes.push([cx, cz]); }
        for (let k = 0; k < 6; k++) E.nodes.push([x0 + R() * (x1 - x0), z0 + R() * (z1 - z0)]); }
      if (S.kind === 'axis' || S.kind === 'path' || S.kind === 'gate_in' || S.kind === 'brow' || S.kind === 'pav' && park) E.nodes.push([S.lx, S.lz]); }
    // the park's lawn: people sitting in circles on the grass, couples and friends standing, children, someone alone looking out
    if (park && act > 0) { const ng = Math.round(C.w * C.d / 750 * act);
      for (let g = 0; g < ng; g++) { const cx = (R() - .5) * (C.w - 30), cz = (R() - .5) * (C.d - 30), kind = R(); if (!C.free(cx, cz, 3)) continue;
        if (kind < .4) { const n = 3 + (R() * 3 | 0), fam = R() < .5; job(many(n, i => { const a = i * TAU / n + R() * .3; return put(fam ? (i === 0 ? 'oldwoman' : i === 1 ? 'woman' : R() < .5 ? 'child' : 'girl') : visitor(), cx + Math.cos(a) * .9, cz + Math.sin(a) * .9, -Math.cos(a), -Math.sin(a), R() < .45 ? 'sit_talk' : R() < .6 ? 'sit_drink' : 'sit_ground', { seated: true }); })); }
        else if (kind < .65) job(many(2 + (R() < .3 ? 1 : 0), i => { const a = i * TAU / 3 + R() * .4; return put(visitor(), cx + Math.cos(a) * .65, cz + Math.sin(a) * .65, -Math.cos(a), -Math.sin(a), R() < .7 ? 'talk' : 'look'); }));
        else if (kind < .8) job(many(2 + (R() * 2 | 0), i => put(R() < .6 ? 'child' : 'girl', cx + (R() - .5) * 3, cz + (R() - .5) * 3, R() - .5, R() - .5, R() < .4 ? 'squat' : R() < .5 ? 'look' : 'talk')));
        else E.nodes.push([cx, cz]); } }
    // strollers
    if (!night && E.nodes.length > 2) { const area = C.w * C.d, nw = Math.min(park ? 110 : 45, Math.round(area / (park ? 1100 : 1100) * act) + 3);
      job(many(nw, () => { const nd = E.nodes[(R() * E.nodes.length) | 0], type = !park && R() < .18 ? cler : visitor(), p = W2(nd[0], nd[1]), ld = this.loaded(p[0], p[2]); if (!ld && !park) return 'wait'; const y = ld ? this.stand(p[0], p[2], yExp(nd[0], nd[1]), .5) : yExp(nd[0], nd[1]); if (y === null) return false;
        const i = CROWD.puppet({ type, x: p[0], y, z: p[2], yaw: R() * TAU, anim: 'stand', seed: (R() * 1e9) | 0 }); if (i < 0) return 'wait';
        E.walkers.push({ i, x: p[0], y, z: p[2], lx: nd[0], lz: nd[1], tgt: null, wait: R() * 4, v: type === 'child' ? 1.5 : type === 'old' || type === 'oldwoman' ? .75 : .95 + R() * .3, yaw: R() * TAU, E, C, R: RNG((R() * 1e9) | 0), yExp, park }); return true; })); }
    return E; },
  // a leg from a node to another (6–45 m away) is used only if it is clear at body height every 0.6 m on loaded ground with no steps > 0.45 m
  leg(w, a, b) { const k = w.E.lot.name + a[0].toFixed(1) + ',' + a[1].toFixed(1) + '>' + b[0].toFixed(1) + ',' + b[1].toFixed(1); if (this.legs.has(k)) return this.legs.get(k);
    const C = w.C, pa = C.F.p(a[0], 0, a[1]), pb = C.F.p(b[0], 0, b[1]), L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), n = Math.ceil(L / .6), W = G.world; let y = w.yExp(a[0], a[1]), ok = true;
    for (let i = 1; i <= n && ok; i++) { const t = i / n, x = lerp(pa[0], pb[0], t), z = lerp(pa[2], pb[2], t); if (!this.loaded(x, z)) { if (w.park) { const lx = lerp(a[0], b[0], t), lz = lerp(a[1], b[1], t); if (!C.free(lx, lz, .4)) ok = false; y = w.yExp(lx, lz); continue; } ok = null; break; } const g = W.ground(x, z, y + .45, .45).y; if (Math.abs(g - y) > .45 || W.solidAt(x, g + .7, z) || W.solidAt(x, g + 1.5, z)) ok = false; y = g; }
    if (ok !== null) { if (this.legs.size > 4000) this.legs.clear(); this.legs.set(k, ok); } return ok; },
  walk(dt) { const W = G.world;
    for (const E of this.on.values()) for (const w of E.walkers) {
      if (w.wait > 0) { w.wait -= dt; if (w.wait <= 0 || !w.tgt) { if (w.wait > 0) continue; for (let tr = 0; tr < 4; tr++) { const nd = E.nodes[(w.R() * E.nodes.length) | 0], dd = Math.hypot(nd[0] - w.lx, nd[1] - w.lz); if (dd < 6 || dd > 45) continue; if (this.leg(w, [w.lx, w.lz], nd)) { w.tgt = nd; break; } } if (!w.tgt) w.wait = 2 + w.R() * 3; } continue; }
      if (!w.tgt) { w.wait = 1; continue; }
      const p = w.C.F.p(w.tgt[0], 0, w.tgt[1]), dx = p[0] - w.x, dz = p[2] - w.z, d = Math.hypot(dx, dz);
      if (d < .3) { w.lx = w.tgt[0]; w.lz = w.tgt[1]; w.tgt = null; w.wait = 1 + w.R() * 7; CROWD.drive(w.i, w.x, w.y, w.z, w.yaw, w.R() < .5 ? 'look' : 'stand', 0, dt); continue; }
      const st = Math.min(d, w.v * dt); w.x += dx / d * st; w.z += dz / d * st; const ty = Math.atan2(dx, dz); let dy = ty - w.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); w.yaw += dy * Math.min(1, dt * 6);
      if (this.loaded(w.x, w.z)) w.y = W.ground(w.x, w.z, w.y + .45, .45).y; else if (w.park) { const F = w.C.F, dx2 = w.x - F.x, dz2 = w.z - F.z; w.y = w.yExp(F.c * dx2 - F.s * dz2, F.s * dx2 + F.c * dz2); } CROWD.drive(w.i, w.x, w.y, w.z, w.yaw, 'walk', w.v, dt); } },
};
// name tags: census people within ~3 m get their name over the head (Unifont, fading in as you approach); filler people have none
const NAMETAGS = {
  all: false, // console 'names': everyone in view, any distance (within the simulation bubble)
  draw() { if (G.inside || typeof CROWD === 'undefined' || !CROWD.near || !CROWD.info) return; if (G.fly && !this.all) return;
    const P = G.P.pos, R0 = this.all ? 150 : 3.4, ids = CROWD.near(P[0], P[2], R0), m = R.vp, W = HUDC.width, H = HUDC.height; HX.font = '16px serif'; HX.textAlign = 'center';
    for (let j = 0; j < ids.length; j++) { const a = CROWD.info(ids[j]); if (!a || !a.name) continue; const d = Math.hypot(a.x - P[0], a.z - P[2]), al = this.all ? .85 : clamp((3.4 - d) / 1.2, 0, 1); if (al <= 0) continue;
      const x = a.x, y = (a.y || 0) + (/horse|camel|donkey/.test(a.type || '') ? 2.75 : 2.0), z = a.z, cw = m[3] * x + m[7] * y + m[11] * z + m[15]; if (cw <= .05) continue;
      const sx = Math.round(((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * .5 + .5) * W), sy = Math.round((1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * .5 + .5)) * H); if (sx < -20 || sx > W + 20 || sy < 0 || sy > H + 40) continue;
      const t = [...a.name], ch = 17, top = sy - t.length * ch; HX.globalAlpha = al * .85; HX.fillStyle = 'rgb(20,14,10)'; HX.fillRect(sx - 10, top - 3, 20, t.length * ch + 4); // a vertical column, read top to bottom, ending above the head
      HX.globalAlpha = al; HX.fillStyle = a.dead ? 'rgb(170,160,150)' : 'rgb(240,228,200)'; t.forEach((c, k) => HX.fillText(c, sx, top + (k + 1) * ch - 2)); }
    HX.globalAlpha = 1; HX.textAlign = 'left'; },
};
// ---------------- developer console (from FIFTH WATCH): '/' opens, Enter runs, Esc closes, ArrowUp recalls ----------------
const CON = {
  open: false, text: '', last: '', lines: [],
  say(t) { this.lines.push({ t, at: performance.now() }); if (this.lines.length > 14) this.lines.shift(); },
  // warp places: every 坊 (code = pinyin initials, e.g. pk 平康坊; ties extend the second syllable — aye 安業 / ayi 安義 — and identical
  // readings get a digit north to south — cl1 長樂, cl2 常樂, cl3 昌樂), every landmark and named compound (initials of the name:
  // dyt 大雁塔, xdg 玄都觀), and a few special spots (top of 小雁塔, the 春明門 wall). `warp` alone lists them all on screen.
  places() { if (this._pl) return this._pl; PY.init(); const out = [], used = new Map(), syl = n => [...n].map(c => (PY.map[c] || [''])[0]).filter(Boolean);
    const front = (t, o = 4) => { const r = t.r, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, f = t.front || 's', p = f === 'n' ? [cx, r.z0 - o] : f === 's' ? [cx, r.z1 + o] : f === 'e' ? [r.x1 + o, cz] : [r.x0 - o, cz]; return { x: p[0], z: p[1], yaw: Math.atan2(-(cx - p[0]), -(cz - p[1])) }; };
    const coded = (list) => { // initials; a clash extends the first syllable where the clashing names differ (頒政 baz / 布政 buz); identical readings get digits
      const it = list.map(q => { const s2 = syl(q.n.replace(/坊$/, '')); return { q, s2, code: s2.map(x => x[0]).join('') }; }), groups = new Map();
      for (const b of it) groups.set(b.code, (groups.get(b.code) || []).concat([b]));
      for (const [k, g] of groups) { if (g.length === 1 && !used.has(k)) { used.set(k, g[0].q); g[0].q.code = k; continue; }
        const same = g.every(b => b.s2.join('') === g[0].s2.join('')), n = Math.max(...g.map(b => b.s2.length)); let done = false;
        if (!same) for (let pos = 0; pos < n && !done; pos++) for (let L = 2; L <= 6 && !done; L++) { const cs = g.map(b => b.s2.map((x, i) => i === pos ? x.slice(0, L) : x[0]).join('')); if (new Set(cs).size === cs.length && !cs.some(c => used.has(c))) { g.forEach((b, m) => { b.q.code = cs[m]; used.set(cs[m], b.q); }); done = true; } }
        if (!done) g.sort((a, b) => a.q.z - b.q.z).forEach((b, m) => { let c = k + (m + 1); while (used.has(c)) c += 'x'; used.set(c, b.q); b.q.code = c; }); } };
    // wards: a street crossing near the middle of the ward (a node of the walk graph), else its centre
    const N = CITY.nav ? CITY.nav.nodes : [], W = [];
    for (const w of CITY.all) { if (W.some(q => q.n === w.short) || w.kind === 'park') continue; const cx = (w.r.x0 + w.r.x1) / 2, cz = (w.r.z0 + w.r.z1) / 2; let best = null, bd = 1e18;
      for (const n of N) { if (n.kind === 'door' || n.x < w.r.x0 || n.x > w.r.x1 || n.z < w.r.z0 || n.z > w.r.z1) continue; const d = (n.x - cx) ** 2 + (n.z - cz) ** 2 - (n.kind === 'x' ? 400 : 0); if (d < bd) { bd = d; best = n; } }
      W.push({ kind: 'ward', n: w.short, ward: w, x: best ? best.x : cx, z: best ? best.z : cz, yaw: 0, high: !best }); }
    coded(W); out.push(...W);
    // landmarks (their gates), named compounds (their fronts), special spots
    const P = [], lots = CITY.lay.flatMap(l => l.lots), pins = typeof LANDMARKS !== 'undefined' && LANDMARKS.pins ? LANDMARKS.pins() : [];
    for (const p of pins) P.push({ kind: 'place', n: p.n, x: p.gx, z: p.gz, yaw: p.yaw + PI });
    for (const t of lots) if (t.name && !/塔院|北院$/.test(t.name) && !P.some(q => q.n === t.name)) { const f = front(t); P.push({ kind: 'place', n: t.name, x: f.x, z: f.z, yaw: f.yaw }); }
    const pa = lots.find(t => t.pagodaAt && t.pagodaAt.kind === 'xiaoyan'); if (pa) { const A = pa.pagodaAt, F = ARCH.F(A.x, 0, A.z, A.yaw), q = F.p(0, 0, 14); P.push({ kind: 'place', n: '小雁塔', x: q[0], z: q[2], yaw: Math.atan2(-(A.x - q[0]), -(A.z - q[2])) }, { kind: 'place', n: '小雁塔頂', x: A.x, y: 42.05, z: A.z, yaw: A.yaw, high: true }); }
    if (CITY.gatezone) { const g = CITY.gatezone.gate; P.push({ kind: 'place', n: '春明門', x: g.x - 70, z: g.z, yaw: -PI / 2 }, { kind: 'place', n: '春明門城頭', x: g.x, y: 5.4, z: g.z + 45, yaw: 0, high: true }); }
    for (const lay of CITY.lay) for (const ln of lay.lanes || []) if (ln.name && ln.axis === 'x') P.push({ kind: 'place', n: '北里' + ln.name, x: ln.r.x0 + 5, z: (ln.r.z0 + ln.r.z1) / 2, yaw: -PI / 2 });
    coded(P); P.sort((a, b) => a.code < b.code ? -1 : 1); out.push(...P);
    return this._pl = out; },
  // the list on screen: wards laid out like the city (columns west → east, rows north → south), places in columns beside it
  drawPlaces() { const L = this.places(), W = HUDC.width, H = HUDC.height, k = Math.max(1, Math.round(H / 720)), fs = 14 * k, lh = 16 * k;
    HX.fillStyle = 'rgba(14,11,9,.88)'; HX.fillRect(0, 0, W, H); HX.font = fs + 'px serif'; HX.textAlign = 'left';
    const cols = Object.keys(PLAN.cols), wards = L.filter(q => q.kind === 'ward'), cw = Math.max(...wards.map(q => HX.measureText(q.code + ' ' + q.n).width)) + 10 * k, x0 = 14 * k, y0 = 34 * k;
    HX.fillStyle = 'rgb(236,210,150)'; HX.fillText('warp <code>  ·  坊 (as on the map, north up)', x0, 18 * k);
    for (const q of wards) { const w = q.ward, ci = cols.indexOf(w.col), row = w.row || 1; if (ci < 0) continue; const x = x0 + ci * cw, y = y0 + (row - 1) * lh * 1.25 + (w.kind === 'market' ? lh * .6 : 0);
      HX.fillStyle = 'rgb(236,196,90)'; HX.fillText(q.code, x, y + fs); HX.fillStyle = 'rgb(232,222,200)'; HX.fillText(q.n, x + HX.measureText(q.code + ' ').width, y + fs); }
    /* places + the palace units (no ward column) */ const P = L.filter(q => q.kind === 'place' || (q.kind === 'ward' && PLAN.cols[q.ward.col] === undefined)), px0 = x0 + cols.length * cw + 16 * k, pcw = 150 * k, rows = Math.floor((H - y0 - 10 * k) / lh);
    HX.fillStyle = 'rgb(236,210,150)'; HX.fillText('places', px0, 18 * k);
    P.forEach((q, i) => { const x = px0 + Math.floor(i / rows) * pcw, y = y0 + (i % rows) * lh; if (x > W - 60 * k) return; HX.fillStyle = 'rgb(236,196,90)'; HX.fillText(q.code, x, y + fs); HX.fillStyle = 'rgb(232,222,200)'; HX.fillText(q.n, x + HX.measureText(q.code + ' ').width, y + fs); });
    HX.fillStyle = 'rgba(232,222,200,.7)'; HX.fillText('Esc closes · codes, toneless pinyin (pingkang) or hanzi all work', x0, H - 10 * k); },
  warp(d) { LOADFADE.start(); const P = G.P; P.pos = [d.x, d.y ?? 0, d.z]; P.yaw = d.yaw || 0; P.pitch = 0; P.vel = [0, 0, 0]; if (d.high || d.y) { G.fly = true; this.land = d; } else G.fly = false; this.say('→ ' + (d.code ? d.code + ' ' : '') + d.n); },
  best(L, f) { let b = null, bs = 0; for (const x of L) { const v = f(x); if (v > bs) { bs = v; b = x; } } return b; },
  // census people by name/call in hanzi, or in toneless pinyin / initials (no IME needed); a ward name lists its residents
  people(q) { const W = CENSUS.wards, wm = (t, w) => PY.hasHan(t) ? w.name.includes(t) : PY.score(t, w.name) >= 3; let ward = null; const parts = q.trim().split(/\s+/);
    if (parts.length > 1) { const k = W.findIndex(w => wm(parts[parts.length - 1], w)); if (k >= 0) { ward = k; parts.pop(); q = parts.join(''); } }
    const ws = W.map(w => wm(q, w)), R = [];
    for (const p of CENSUS.people) { if (ward !== null && p.ward !== ward) continue; const v = (PY.hasHan(q) ? (p.call.includes(q) || p.name.includes(q) ? 3 : 0) : Math.max(PY.score(q, p.call), PY.score(q, p.name))) * 2 || (ws[p.ward] ? 1 : 0); if (v) R.push([v, p, 0]); }
    if (R.length <= 400 && typeof G !== 'undefined') { const P = G.P.pos; for (const r of R) { const w = CENSUS.where(r[1].pid, G.hour); r[2] = w && isFinite(w.x) ? Math.hypot(w.x - P[0], w.z - P[2]) : 1e9; } }
    return R.sort((a, b) => b[0] - a[0] || a[2] - b[2]).map(r => r[1]); },
  pline(p) { return `${p.pid}  ${p.call}${p.call !== p.name ? ' (' + p.name + ')' : ''}  ${p.occ}  ${(CENSUS.wards[p.ward] || {}).name || ''}`; },
  run(t) { this.last = t; this.panel = null; const [a, ...r] = t.split(/\s+/), arg = r.join(' '), D = this.places();
    if (a === 'help') { this.say('warp [code|pinyin|name] (warp alone: list)   hour <0-24>   fly   pos   tp <x> <z>   quality low|med|high|xhigh|full   names   who   census   find <name|pinyin|emperor>   goto <pid|name>'); this.say('keys: L lantern  M map  K retro  O shadows  U AO  B bump  ` stats  V fly'); }
    else if (a === 'warp' || a === 'w') { if (!arg) { this.panel = 'warp'; this.panelT = performance.now(); return; } const q = arg.trim(), ql = q.toLowerCase();
      const d = D.find(d => d.code === ql) || D.find(d => d.n === q || d.n === q.replace(/坊$/, '')) || D.find(d => PY.hasHan(q) && d.n.includes(q)) || this.best(D, d => PY.score(q, d.n) * 2 + (d.kind === 'ward' ? 1 : 0)); if (d) this.warp(d); else this.say('no such place: ' + arg + '  (warp alone lists them)'); }
    else if (a === 'hour') { const h = +arg; if (h >= 0 && h <= 24) { DBG.hour(h % 24); this.say('hour ' + h); } }
    else if (a === 'fly') { toggleFly(); this.say('fly ' + (G.fly ? 'on' : 'off')); }
    else if (a === 'names') { NAMETAGS.all = !NAMETAGS.all; this.say('names ' + (NAMETAGS.all ? 'on (everyone in view)' : 'off (only very close)')); }
    else if (a === 'pos') { const P = G.P.pos; this.say(`x ${P[0].toFixed(1)}  y ${P[1].toFixed(1)}  z ${P[2].toFixed(1)}  yaw ${G.P.yaw.toFixed(2)}`); }
    else if (a === 'tp') { const [x, z] = r.map(Number); if (isFinite(x) && isFinite(z)) this.warp({ n: `${x}, ${z}`, x, z, yaw: G.P.yaw }); }
    else if (a === 'quality') { const i = { low: 0, med: 1, high: 2, xhigh: 3, full: 4 }[arg]; if (i !== undefined) { QUALITY.auto = false; QUALITY.set(i); this.say('quality ' + arg); } }
    else if (['who', 'census', 'find', 'goto'].includes(a)) { if (typeof CENSUS === 'undefined') { this.say('no census yet'); return; } const out = v => (Array.isArray(v) ? v : String(v).split('\n')).slice(0, 12).forEach(l => this.say(String(l)));
      if (a === 'census') { const s = CENSUS.stats(), top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => k + ' ' + v).join('  ');
        out([`${s.people} people, ${s.households} households (built in ${s.buildMs} ms, ${s.routes} routes)`, 'wards: ' + top(s.wards, 8), 'class: ' + top(s.cls, 8), 'work: ' + top(s.occ, 7), 'find <name|pinyin>   goto <pid|name>   who']); }
      else if (a === 'who') { const P = G.P.pos, ids = CROWD.near(P[0], P[2], 4); let best = null, bd = 9; for (const i of ids) { const q = CROWD.info(i); if (q && q.pid != null) { const d = Math.hypot(q.x - P[0], q.z - P[2]); if (d < bd) { bd = d; best = q; } } } out(best ? CENSUS.describe(best.pid) : 'nobody named nearby'); }
      else if ((a === 'find' || a === 'goto') && /^(emperor|皇帝|天子|聖人|huangdi|hd)$/i.test(arg) && typeof PALACE !== 'undefined' && PALACE.whereIs) { // the emperor (palace schedule: PALACE.whereIs)
        const L = PALACE.whereIs('emperor', G.hour); if (!L.length) { this.say('the emperor is not to be found now'); return; } const e = L[0];
        if (a === 'goto') this.warp({ n: '皇帝 · ' + (e.place || e.unit), x: e.x + 3, z: e.z + 3, y: e.y > 1 ? e.y : undefined, yaw: Math.atan2(3, 3) }); else out(L.slice(0, 4).map(q => `皇帝  ${q.place || ''}  (${q.unit})  ${q.anim || ''}  → goto emperor`)); }
      else if (a === 'find') { const L = this.people(arg); if (!L.length) { this.say('nobody called ' + arg); return; } out(L.slice(0, 10).map(p => this.pline(p)).concat(L.length > 10 ? [`… ${L.length} in all`] : [])); }
      else if (a === 'goto') { const p = /^\d+$/.test(arg) ? CENSUS.person(+arg) : this.people(arg)[0], w = p && CENSUS.where(p.pid, G.hour); if (w && isFinite(w.x)) this.warp({ n: this.pline(p), x: w.x + 2, z: w.z + 2, yaw: G.P.yaw }); else this.say('not found: ' + arg); } }
    else this.say('? ' + t + '   (help)'); },
  // typing goes into a hidden <input> so the system IME (pinyin → hanzi) works; Enter during composition picks a candidate, not run
  inp: null,
  show() { if (!this.inp) { const i = this.inp = document.createElement('input'); i.setAttribute('autocomplete', 'off'); i.spellcheck = false;
      Object.assign(i.style, { position: 'fixed', left: '18px', bottom: '40px', width: '320px', height: '20px', opacity: '0', border: '0', padding: '0', zIndex: 5 });
      i.addEventListener('input', () => { this.text = i.value.slice(0, 40); }); document.body.appendChild(i); }
    this.open = true; this.text = ''; this.inp.value = ''; this.inp.focus(); },
  hide() { this.open = false; if (this.inp) { this.inp.blur(); this.inp.value = ''; } },
  key(e) { if (e.isComposing || e.keyCode === 229) return false; if (document.activeElement !== this.inp) this.inp.focus();
    if (e.key === 'Escape') { this.hide(); this.panel = null; return true; }
    if (e.key === 'Enter') { const t = this.inp.value.trim(); this.hide(); this.text = ''; if (t) this.run(t); return true; } if (e.key === 'ArrowUp') { this.inp.value = this.text = this.last; return true; }
    return false; },
  update() { if (this.panel && !this.open && Input.hit('Escape')) this.panel = null; if (this.land) { const c = CITY.chunkAt(this.land.x, this.land.z); if (c && c.world) { G.fly = false; this.land = null; } } },
  draw() { if (this.panel === 'warp' && (this.open || performance.now() - this.panelT < 60000)) this.drawPlaces(); const now = performance.now(), x = 18, y0 = HUDC.height - 60; HX.font = '16px serif'; HX.textAlign = 'left';
    const live = this.lines.filter(l => now - l.at < (this.open ? 60000 : 9000)); live.forEach((l, i) => { const y = y0 - (live.length - i) * 20; HX.fillStyle = 'rgba(20,14,10,.6)'; HX.fillRect(x - 4, y - 15, HX.measureText(l.t).width + 8, 19); HX.fillStyle = 'rgb(236,226,200)'; HX.fillText(l.t, x, y); });
    if (this.open) { const t = '> ' + this.text + (now % 1000 < 500 ? '_' : ''); HX.fillStyle = 'rgba(0,0,0,.75)'; HX.fillRect(x - 6, y0 - 15, Math.max(320, HX.measureText(t).width + 12), 21); HX.fillStyle = '#e6d6a6'; HX.fillText(t, x, y0); } },
};
addEventListener('keydown', e => { if (CON.open) { if (CON.key(e)) e.preventDefault(); e.stopImmediatePropagation(); Input.keys = {}; Input.hits = {}; return; }
  if (e.key === '/' && CITY.ready && !G.inside) { e.preventDefault(); e.stopImmediatePropagation(); CON.show(); Input.keys = {}; } }, true);
addEventListener('keyup', e => { if (CON.open) e.stopImmediatePropagation(); }, true);

// ---------------- hand lantern (L): a paper 燈籠 hanging from a short bamboo stick in the right hand; swings with the body, lights the street ----------------
// riding (H): a saddled horse under the player (a crowd puppet, riderless flag), higher eye, trot / gallop (Shift), hoof beats; dismount: H,
// flying (V) or going indoors. The horse turns toward the way you ride and is gaited from the real ground speed (no sliding feet).
const HORSE = {
  on: false, i: -1, yaw: 0, beat: 0,
  toggle() { if (this.on) return this.off(); if (G.fly || G.inside || typeof CROWD === 'undefined' || !CROWD.puppet) return; const P = G.P;
    this.yaw = P.yaw; const i = CROWD.puppet({ type: 'horse', x: P.pos[0], y: P.pos[1], z: P.pos[2], yaw: P.yaw + PI, anim: 40, seed: 815 }); if (i < 0) return;
    CROWD.setFlags(i, 1 | 2 | 4); /* saddle, no rider (you are the rider), no lead rope, the player's reins (slot 5) */ this.i = i; this.on = true; P.crouch = P.crouchT = false; },
  off() { if (this.i >= 0 && CROWD.remove) CROWD.remove(this.i); this.i = -1; this.on = false; },
  update(dt) { if (this.freeze) return; /* (tests: hold the horse while a camera looks at it) */ if (Input.hit('KeyH')) this.toggle(); if (!this.on) return; if (G.fly || G.inside) return this.off(); const P = G.P, v = Math.hypot(P.vel[0], P.vel[2]);
    if (v > .4) { const ty = Math.atan2(-P.vel[0], -P.vel[2]); let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * (v > 6 ? 3 : 4.5)); } // body follows the way you ride
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), back = .07; // the seat (rider pivot) is 7 cm ahead of the horse's middle: the eye stays over it
    if (!CROWD.drive(this.i, P.pos[0] + sy * back, P.pos[1], P.pos[2] + cy * back, this.yaw + PI, v < .25 ? 40 : 41, v, dt)) return this.off(); },
  speed(run) { return run ? 11 : 4.2; }, // m/s: trot, gallop
  // hoof beats instead of footsteps, on the same stride cadence as the leg animation (people.js gait: v / (1.2 + .45 v) strides a second above 2.1 m/s):
  // walk = four even beats a stride, trot = two (diagonal pairs), gallop = a rolling four-beat burst then a pause (it used to rattle every 1.6 m)
  feet(v, dt) { const P = G.P; if (v < .3) { this.ph = 0; return; } const c = v > 2.1 ? v / (1.2 + .45 * v) : .55 * v, p0 = this.ph || 0; this.ph = p0 + c * dt;
    const gait = v > 7 ? 'gallop' : v > 2.1 ? 'trot' : 'walk', B = { walk: [0, .25, .5, .75], trot: [0, .5], gallop: [0] }[gait];
    for (const q of B) { if (Math.floor(p0 - q) === Math.floor(this.ph - q)) continue; // this beat's phase crossed in this frame
      const hard = P.surf === 'stone' || P.surf === 'brick' || P.surf === 'tile', snd = hard ? 'hoofhard' : 'hoof';
      if (gait === 'gallop') [0, 85, 160, 215].forEach((ms, k) => setTimeout(() => AUX('step', snd, { vol: [.75, .85, .95, .6][k] }), ms)); else AUX('step', snd, { vol: gait === 'trot' ? .8 : .65 });
      NOISE.emit(P.pos[0], P.pos[1], P.pos[2], gait === 'gallop' ? 16 : 7, 'step'); } },
};
// ---------------- title card (F9, hidden: for recordings): the name of where you are, Chinese above, English below, in a dark band with
// accent rules (the loading bar's red), fading in and out — 「宣政殿 · Xuanzheng Hall」
const TITLECARD = {
  t: -1, zh: '', en: '',
  SUF: [['進奏院', 'Provincial Liaison Office'], ['觀', 'Daoist Abbey'], ['寺', 'Monastery'], ['殿', 'Hall'], ['宮', 'Palace'], ['門', 'Gate'], ['坊', 'Ward'], ['塔', 'Pagoda'], ['市', 'Market'], ['池', 'Lake'], ['樓', 'Tower'], ['閣', 'Pavilion'], ['省', 'Department'], ['院', 'Court'], ['宅', 'Residence'], ['第', 'Mansion'], ['廟', 'Temple'], ['祠', 'Shrine'], ['苑', 'Park'], ['園', 'Garden'], ['原', 'Plateau'], ['亭', 'Pavilion'], ['監', 'Directorate'], ['臺', 'Terrace'], ['街', 'Avenue'], ['城', 'City']],
  SPECIAL: { 東市: 'The Eastern Market', 西市: 'The Western Market', 皇城: 'The Imperial City', 曲江: 'Qujiang', 長安城外: 'Outside the Walls of Chang’an', 北里: 'The Northern Quarter', 國子監: 'The Imperial Academy', 太廟: 'The Ancestral Temple', 太社: 'The Altar of the Soil' },
  py(s) { PY.init(); return [...s].map(c => (PY.map[c] || [''])[0]).filter(Boolean).map((x, i) => i ? x : x[0].toUpperCase() + x.slice(1)).join(''); },
  english(zh) { if (this.SPECIAL[zh]) return this.SPECIAL[zh]; const nm = zh.split('·').pop();
    for (const [sf, w] of this.SUF) if (nm.endsWith(sf) && nm.length > sf.length) return (sf === '坊' ? '' : '') + this.py(nm.slice(0, -sf.length)) + ' ' + w;
    return this.py(nm); },
  locate() { const P = G.P.pos, x = P[0], z = P[2]; if (typeof CITY === 'undefined' || !CITY.ready) return '長安';
    const wd = CITY.all.find(w => inR(w.r, x, z)), lay = wd && CITY.lay.find(l => l.wd === wd);
    if (lay) { const lot = lay.lots.find(t => t.name && inR(t.r, x, z) && !/塔院|北院$/.test(t.name)); if (lot) return lot.name; } // inside a named place (palace halls and courts, temples, mansions, offices)
    try { let best = null, bd = 120; for (const p of (typeof LANDMARKS !== 'undefined' && LANDMARKS.pins ? LANDMARKS.pins() : [])) { const d = Math.hypot((p.gx ?? p.x) - x, (p.gz ?? p.z) - z); if (d < bd) { bd = d; best = p; } } if (best) return best.n; } catch (e) { }
    if (wd) { const s = wd.short; return wd.palace || wd.kind === 'market' || wd.kind === 'park' || /[市宮城門江]$/.test(s) ? s : s + '坊'; }
    return Math.abs(x) < PLAN.W / 2 && Math.abs(z) < PLAN.H / 2 ? '長安' : '長安城外'; },
  update() { if (Input.hit('F10')) G.noHud = !G.noHud; /* F10: hide / show the HUD (recordings) */ if (Input.hit('F9')) { this.zh = this.locate(); this.en = this.english(this.zh); this.t = 0; } },
  draw(dt) { if (this.t < 0) return; this.t += dt; const T = this.t, a = T < .5 ? T / .5 : T < 1.8 ? 1 : T < 2.7 ? 1 - (T - 1.8) / .9 : 0; if (a <= 0 && T > 1) { this.t = -1; return; }
    const W = HUDC.width, H = HUDC.height, k = H / 720, cy = Math.round(H * .5), bh = Math.round(118 * k), A = a * a * (3 - 2 * a), g = HX;
    g.save(); g.globalAlpha = A;
    const band = g.createLinearGradient(0, 0, W, 0); band.addColorStop(0, 'rgba(8,6,5,0)'); band.addColorStop(.22, 'rgba(8,6,5,.62)'); band.addColorStop(.78, 'rgba(8,6,5,.62)'); band.addColorStop(1, 'rgba(8,6,5,0)');
    g.fillStyle = band; g.fillRect(0, cy - bh / 2, W, bh);
    const rule = g.createLinearGradient(W * .18, 0, W * .82, 0); rule.addColorStop(0, 'rgba(184,64,42,0)'); rule.addColorStop(.5, 'rgba(184,64,42,.95)'); rule.addColorStop(1, 'rgba(184,64,42,0)');
    g.fillStyle = rule; const lw = Math.max(1, Math.round(1.5 * k)); g.fillRect(W * .18, cy - bh / 2, W * .64, lw); g.fillRect(W * .18, cy + bh / 2 - lw, W * .64, lw);
    const rise = (1 - A) * 6 * k; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `${Math.round(40 * k)}px "Songti SC", "STSong", serif`; g.fillStyle = 'rgba(240,230,206,.97)'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6 * k;
    { const cs = [...this.zh], sc = PXT.scale(g), gap = 4 * sc, ws = cs.map(c => PXT.width(c, sc)), tw = ws.reduce((a, b) => a + b, 0) + gap * (cs.length - 1); let x0 = Math.round(W / 2 - tw / 2); g.textAlign = 'left'; // Unifont (all HUD text is), set a little apart
      cs.forEach((c, i) => { g.fillText(c, x0, cy + 4 * k + rise); x0 += ws[i] + gap; }); g.textAlign = 'center'; }
    g.shadowBlur = 0; g.font = `${Math.round(13 * k)}px "Times New Roman", serif`; g.fillStyle = 'rgba(214,196,160,.9)'; const en = this.en.toUpperCase(), sp = 3.2 * k; // letter-spaced capitals
    let tw = 0; const cw = [...en].map(c => { const w = g.measureText(c).width; tw += w + sp; return w; }); tw -= sp; let xx = W / 2 - tw / 2; g.textAlign = 'left';
    [...en].forEach((c, i) => { g.fillText(c, xx, cy + 34 * k + rise); xx += cw[i] + sp; });
    g.restore(); },
};
const LANTERN = {
  on: false, mS: null, mL: null, th: [0, 0], om: [0, 0], pv: null, pp: null, MS: null, ML: null, hand: [0, 0, 0],
  light: { x: 0, y: 0, z: 0, r: 7.5, c: [1, .68, .36], i: 1 },
  build() { const t = n => TEX.L[n] ?? 0, S = new MB(), L = new MB();
    S.s({ tex: t('bamboo'), col: [.78, .64, .42], emi: 0 }); S.tube([[0, -.06, .04], [-.07, .2, -.15], [-.15, .42, -.3]], { r: .009, seg: 5, steps: 3 });
    S.s({ tex: t('p_cloth'), col: [.62, .5, .4] }); S.ell(0, -.06, .05, .035, .045, .045, { seg: 6, ring: 5 }); // sleeve cuff around the grip
    L.s({ tex: t('wood'), col: [.2, .15, .1], emi: 0 }); L.tube([[0, 0, 0], [0, -.05, 0]], { r: .003, seg: 3, steps: 1 }); // cord
    L.T(0, -.065, 0).lathe([[0, 0], [.05, 0], [.05, .015], [0, .015]], { seg: 10 }).pop(); L.T(0, -.29, 0).lathe([[0, 0], [.055, 0], [.055, .016], [0, .016]], { seg: 10 }).pop(); // wooden rims
    L.s({ tex: t('p_silk'), col: [1, .84, .56], emi: 1 }); L.T(0, -.28, 0).lathe([[0, 0], [.058, .01], [.088, .065], [.092, .11], [.075, .17], [.05, .205], [0, .215]], { seg: 12 }).pop();
    this.mS = S.upload(); this.mL = L.upload(); this.MS = M4.new(); this.ML = M4.new(); },
  toggle() { this.on = !this.on; if (this.on && !this.mS) this.build(); this.pp = null; },
  update(dt) { if (Input.hit('KeyL')) this.toggle(); if (!this.on || dt <= 0) return; const P = G.P, y = P.yaw, sy = Math.sin(y), cy = Math.cos(y), f = [-sy, -cy], r = [cy, -sy];
    const b = G.fly ? 0 : Math.sin(P.bob * 2), e = P.pos[1] + (G.fly ? 0 : P.eye) + b * .025, sw = Math.sin(P.bob) * .012;
    const h = this.hand; h[0] = P.pos[0] + r[0] * (.4 + sw) + f[0] * .32; h[1] = e - .64 + b * .012; h[2] = P.pos[2] + r[1] * (.4 + sw) + f[1] * .32;
    const pv = [h[0] + f[0] * .3 - r[0] * .15, h[1] + .42, h[2] + f[1] * .3 - r[1] * .15]; // stick tip = pendulum pivot
    if (this.pp && this.pv) { const vx = (pv[0] - this.pp[0]) / dt, vy = (pv[1] - this.pp[1]) / dt, vz = (pv[2] - this.pp[2]) / dt, ax = (vx - this.pv[0]) / dt, ay = (vy - this.pv[1]) / dt, az = (vz - this.pv[2]) / dt;
      const aF = Math.max(-30, Math.min(30, ax * f[0] + az * f[1])), aR = Math.max(-30, Math.min(30, ax * r[0] + az * r[1])), g = 9.8 + Math.max(-5, Math.min(5, ay)), Ln = .16, k = 2.2;
      this.om[0] += (-(g / Ln) * Math.sin(this.th[0]) - aF / Ln * Math.cos(this.th[0]) - k * this.om[0]) * dt; this.om[1] += (-(g / Ln) * Math.sin(this.th[1]) - aR / Ln * Math.cos(this.th[1]) - k * this.om[1]) * dt;
      for (let i = 0; i < 2; i++) { this.th[i] = Math.max(-.9, Math.min(.9, this.th[i] + this.om[i] * dt)); } this.pv = [vx, vy, vz]; } else this.pv = [0, 0, 0];
    this.pp = pv; M4.trs(this.MS, h[0], h[1], h[2], 0, y, 0); M4.trs(this.ML, pv[0], pv[1], pv[2], this.th[0], y, this.th[1]);
    const L = this.light, o = .16; L.y = pv[1] - o; L.x = pv[0] + (r[0] * Math.sin(this.th[1]) + f[0] * Math.sin(this.th[0])) * o; L.z = pv[2] + (r[1] * Math.sin(this.th[1]) + f[1] * Math.sin(this.th[0])) * o;
    L.i = .92 + .08 * Math.sin(G.t * 13.1) * Math.sin(G.t * 7.3 + 1); L.c = [L.i, .68 * L.i, .36 * L.i]; },
  shown() { return this.on && this.mS && !G.inside; },
  lights(Ls) { if (this.shown()) { Ls = Ls.slice(); Ls.push(this.light); } return Ls; },
  draw() { if (!this.shown()) return; R.draw(this.mS, this.MS); R.draw(this.mL, this.ML); },
};
// ---------------- frame ----------------
let SC = null;
function render() {
  const P = G.P, bob = G.fly ? 0 : Math.sin(P.bob * 2) * .025;
  const cm = !G.fly && P.cam ? P.cam : [0, 0, 0]; R.setCamera(P.pos[0] + cm[0], P.pos[1] + (G.fly ? 0 : P.eye) + bob + cm[1], P.pos[2] + cm[2], P.yaw, P.pitch, G.fly ? 0 : (P.roll || 0));
  applyEnv(); R.time = G.t;
  R.lights = G.inside ? G.inside.lights : (typeof CITY !== 'undefined' && CITY.lights) ? CITY.lights : SC.lights || [];
  if (!G.inside && typeof CROWD !== 'undefined' && CROWD.nLights) { R.lights = R.lights.slice(); for (let i = 0; i < CROWD.nLights; i++) R.lights.push(CROWD.lights[i]); }
  R.lights = LANTERN.lights(R.lights);
  if (G.inside) { const e = R.env; e.sunC = e.sunC.map(v => v * .12); e.sky = e.sky.map(v => v * .55 + .03); e.gnd = e.gnd.map(v => v * .6 + .02); e.fog = [30, 90, -99, 0]; e.fogC = [.05, .04, .035]; e.noSky = true; e.emiK = 1; }
  else R.env.noSky = false;
  // shadows from the sun (or moon): cascades fitted to the view, snapped to texels
  if (!G.inside && SC.draw && !Q.has('noshadows')) R.renderShadows(() => { SC.draw(); if (typeof CITY !== 'undefined' && CITY.ready) CITY.drawGates(G.gateOpen ?? 1); if (typeof CROWD !== 'undefined' && CROWD.draw) CROWD.draw(); });
  else R.sh.ready = false;
  R.begin();
  if (G.inside) { R.draw(G.inside.mesh, IDM); if (G.inside.fol) R.draw(G.inside.fol, IDM, { cull: false }); }
  else if (SC.draw) { SC.draw(); if (typeof CITY !== 'undefined' && CITY.ready) CITY.drawGates(G.gateOpen ?? 1); } else { R.draw(SC.mesh, IDM); for (const t of SC.terrs) R.draw(t.m, IDM, { terr: t.layers }); R.draw(SC.fol, IDM, { cull: false }); }
  if (typeof CROWD !== 'undefined' && CROWD.draw) CROWD.draw();
  LANTERN.draw();
  if (APP.draw) APP.draw();
  if (!G.inside) FX.drawBirds();
  R.inkPass();
  if (!G.inside) FX.draw();
  R.end();
}
let last = 0, fpsAcc = 0, fpsN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; fpsAcc += dt; fpsN++; if (fpsAcc > .5) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  const T0 = performance.now(); PERF.frame(dt);
  if (!G.hold) {
    G.t += dt; G.hour = (G.hour + dt * 24 / G.daySec) % 24;
    updatePlayer(dt);
    if (SC.update) SC.update(dt);
    CLOCK.update(dt); DOORS.update(dt); LANTERN.update(dt); HORSE.update(dt); TITLECARD.update(); CON.update(); LOADFADE.update(dt); TALK.update(dt); SOUND.update(dt); FX.update(dt); QUALITY.update(dt); PALPPL.update(dt); LMPPL.update(dt);
    if (typeof CROWD !== 'undefined' && CROWD.update) CROWD.update(dt);
    if (APP.update) APP.update(dt);
  }
  const T1 = performance.now(); render(); const T2 = performance.now(); hud(); Input.end(); PERF.add(T1 - T0, T2 - T1, performance.now() - T2);
  PERF.spike(dt, T1 - T0, T2 - T1);
  if (typeof AU !== 'undefined' && AU.listener) { const P = G.P; AU.listener(P.pos[0], P.pos[1] + P.eye, P.pos[2], P.yaw); }
}
const HUDC = document.getElementById('hud'), HX = HUDC.getContext('2d');
// all HUD text in GNU Unifont pixels: fillText/measureText on 2D canvases draw cached 16x16 glyph bitmaps at an integer scale
// (scale from the font size: ~14 px -> 1x, 28 px -> 2x); colour from fillStyle, alignment from textAlign, alpha from globalAlpha
const PXT = {
  cache: new Map(),
  glyph(ch, col) { const k = ch + '|' + col; let c = this.cache.get(k); if (c) return c; const b = typeof unifontBits === 'function' && unifontBits(ch), w = (typeof unifontW === 'function' && unifontW(ch)) || 16;
    c = document.createElement('canvas'); c.width = 16; c.height = 16; c.adv = b ? w : 16; const x = c.getContext('2d'); x.fillStyle = col;
    if (b) { const o = (16 - w) / 2; for (let y = 0; y < 16; y++) for (let i = 0; i < 16; i++) if (b[y * 16 + i]) x.fillRect(i - o, y, 1, 1); } else if (ch !== ' ') { x.font = '14px serif'; x.textBaseline = 'top'; _fillText.call(x, ch, 1, 0); }
    if (this.cache.size > 4000) this.cache.clear(); this.cache.set(k, c); return c; },
  scale(ctx) { const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font), px = m ? +m[1] : 14; return Math.max(1, Math.round(px / 14)); },
  width(str, sc) { let w = 0; for (const ch of str) w += ((typeof unifontW === 'function' && unifontW(ch)) || (ch === ' ' ? 8 : 16)) * sc; return w; },
};
const _fillText = CanvasRenderingContext2D.prototype.fillText, _measure = CanvasRenderingContext2D.prototype.measureText;
CanvasRenderingContext2D.prototype.fillText = function (str, x, y) {
  str = String(str); const sc = PXT.scale(this), w = PXT.width(str, sc), col = typeof this.fillStyle === 'string' ? this.fillStyle : '#fff';
  let X = this.textAlign === 'center' ? x - w / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? x - w : x; const Y = Math.round(y - 13 * sc), sm = this.imageSmoothingEnabled; this.imageSmoothingEnabled = false; X = Math.round(X);
  for (const ch of str) { const g = PXT.glyph(ch, col); if (ch !== ' ') this.drawImage(g, X, Y, 16 * sc, 16 * sc); X += g.adv * sc; }
  this.imageSmoothingEnabled = sm; };
CanvasRenderingContext2D.prototype.measureText = function (str) { return { width: PXT.width(String(str), PXT.scale(this)) }; };
function hud() {
  if (HUDC.width !== innerWidth || HUDC.height !== innerHeight) { HUDC.width = innerWidth; HUDC.height = innerHeight; }
  HX.clearRect(0, 0, HUDC.width, HUDC.height);
  // the hour (時辰, each two hours, 子 centred on midnight) and the state of the ward gates
  if (!G.debug && !G.noHud && G.started === true) { const sc = Math.max(1, HUDC.height / 540), hi = Math.floor(((G.hour + 1) % 24) / 2), sh = '子丑寅卯辰巳午未申酉戌亥'[hi] + '時', st = G.inside ? '' : CLOCK.curfew() ? '　坊門閉' : '';
    HX.font = `${Math.round(15 * sc)}px "Songti SC", serif`; HX.fillStyle = 'rgba(232,220,192,.8)'; HX.fillText(sh + st, 18 * sc, 30 * sc); }
  if (!Input.locked && !G.hold && G.started !== true) { const w = HUDC.width, h = HUDC.height; HX.fillStyle = 'rgba(10,8,7,.62)'; HX.fillRect(0, 0, w, h); TITLE.draw(w, h);
    const k = Math.max(1, Math.round(h / 560)); HX.font = (14 * k) + 'px serif'; HX.textAlign = 'center'; HX.fillStyle = 'rgba(200,186,156,.85)';
    HX.fillText(APP.controls || 'click to begin   ·   WASD move   ·   mouse look   ·   Shift run   ·   Space jump   ·   E door   ·   L lantern   ·   M map   ·   V fly   ·   / console', Math.round(w / 2), h - 14 * k); HX.textAlign = 'left'; }
  if (Input.locked) G.started = true;
  if (!G.noHud) { NAMETAGS.draw(); MAP.draw(); } if (APP.hud) APP.hud(); CON.draw();
  TITLECARD.draw(Math.min(.1, (performance.now() - (TITLECARD._lt || performance.now())) / 1000)); TITLECARD._lt = performance.now(); // (shown with the HUD hidden too: for recordings)
  LOADFADE.draw();
  if (DOORS.fade > 0) { HX.fillStyle = `rgba(0,0,0,${DOORS.fade})`; HX.fillRect(0, 0, HUDC.width, HUDC.height); }
  if (!(APP.modal && APP.modal()) && ((G.inside && DOORS.atDoor && !DOORS.pending) || ((DOORS.near || DOORS.door) && !G.inside && !DOORS.pending))) PROMPT.draw(G.inside ? 'out' : 'in');
  if (DOORS.easing) { const k = Math.max(2, Math.round(HUDC.height / 360)), w = 16 * k, x = Math.round(HUDC.width / 2 - w / 2), y = Math.round(HUDC.height * .6) + w + 2 * k; HX.fillStyle = 'rgba(240,232,216,.25)'; HX.fillRect(x, y, w, k); HX.fillStyle = 'rgba(240,232,216,.9)'; HX.fillRect(x, y, Math.round(w * Math.min(1, DOORS.easing.t / 1.1)), k); }
  if (CLOCK.msgT > 0 && CLOCK.msg && !G.noHud) { const a = clamp(Math.min(CLOCK.msgT, 6 - CLOCK.msgT), 0, 1), sc = Math.max(1, HUDC.height / 540); HX.globalAlpha = a; HX.font = `${Math.round(15 * sc)}px "Songti SC", serif`; HX.fillStyle = 'rgba(232,220,192,.8)'; HX.fillText(CLOCK.msg, 18 * sc, 52 * sc); HX.globalAlpha = 1; } // drum / gong events: under the 時辰, same size
  if (G.debug) { const P = G.P, h = G.hour, s = `${G.fps.toFixed(0)} fps  ${QUALITY.levels[QUALITY.cur].name}${QUALITY.auto ? '·auto' : ''}  ${(R.stats.tris / 1000).toFixed(0)}k tris  ${R.stats.calls} calls  ${String(h | 0).padStart(2, '0')}:${String((h % 1) * 60 | 0).padStart(2, '0')}  x ${P.pos[0].toFixed(1)} y ${P.pos[1].toFixed(1)} z ${P.pos[2].toFixed(1)} yaw ${P.yaw.toFixed(2)}${G.fly ? '  FLY' : ''}` + (G.dbgText ? '  ' + G.dbgText : '') + (PERF.lastLine ? '\n' + PERF.lastLine : '');
    HX.font = '13px Menlo, monospace'; HX.fillStyle = 'rgba(0,0,0,.5)'; HX.fillRect(8, 8, HX.measureText(s).width + 12, 20); HX.fillStyle = '#e8e0d0'; HX.fillText(s, 14, 22); }
}

// ---------------- boot ----------------
function loadingScreen(f) { HUDC.width = innerWidth; HUDC.height = innerHeight; const W = HUDC.width, H = HUDC.height; HX.fillStyle = '#0c0a09'; HX.fillRect(0, 0, W, H);
  const yb = TITLE.draw(W, H) + Math.round(H * .05), bw = Math.round(Math.min(300, W * .3)), x = Math.round((W - bw) / 2);
  HX.fillStyle = '#2a2420'; HX.fillRect(x, yb, bw, 2); HX.fillStyle = '#b8402a'; HX.fillRect(x, yb, Math.round(bw * clamp(f, 0, 1)), 2); }
// the title: APP.title (元和十年) set vertically (Unifont, large), APP.sub ("Chang'an, 815") beneath; returns the y below the subtitle
const TITLE = {
  draw(w, h) { const k = Math.max(3, Math.round(h / 190)), cs = 16 * k, gap = Math.round(cs * .12), t = APP.title || '元和十年', colH = t.length * cs + (t.length - 1) * gap, k2 = Math.max(1, Math.round(k / 2.2));
    const subH = 16 * k2, total = colH + Math.round(cs * .55) + subH, y0 = Math.round((h - total) / 2 - h * .04); HX.textAlign = 'center'; HX.fillStyle = '#e8dcc0'; HX.font = (14 * k) + 'px serif';
    for (let i = 0; i < t.length; i++) HX.fillText(t[i], Math.round(w / 2), y0 + i * (cs + gap) + cs - 2 * k);
    const ys = y0 + colH + Math.round(cs * .55) + subH; HX.font = (14 * k2) + 'px serif'; HX.fillStyle = '#a8987a'; HX.fillText(APP.sub ?? "Chang'an, 815", Math.round(w / 2), ys); HX.textAlign = 'left'; return ys; },
};
const DBG = {
  // for tools: enter the nearest enterable building (or a lot of the given type) — interior tests
  enter(type) { const N = CITY.nav, P = G.P.pos; let best = null, bd = 1e9; for (const i of N.doors) { const n = N.nodes[i]; if (!n.lot || !INTERIOR.kindOf(n.lot) || (type && n.lot.type !== type)) continue; const d = Math.hypot(n.x - P[0], n.z - P[2]); if (d < bd) { bd = d; best = n; } } if (best) enterBuilding(best.lot); return best ? best.lot.type : null; },
  // for tools: place the camera and freeze the simulation
  cam(x, y, z, yaw = 0, pitch = 0, fly = true) { G.fly = fly; G.P.pos = [x, y, z]; G.P.yaw = yaw; G.P.pitch = pitch; G.P.vel = [0, 0, 0]; return true; },
  hold(v = true) { G.hold = v; return true; },
  hour(h) { G.hour = h; CLOCK.last = h; G.gateOpen = CLOCK.curfew(h) ? 0 : 1; return true; },
  // GPU z-fight check (ZFIGHT.md): render with depth test LEQUAL and with LESS; exactly coplanar overlaps change winner between the two.
  // Returns {n: differing pixels, png: heatmap (red = fight) over a dimmed frame}. Ink and post are off for the comparison.
  zdiff() { const gl = R.gl, W = R.W, H = R.H, inkK = R.env.ink, grab = () => { const a = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return a; };
    const frame = less => { R.depthLess = less; const k = R.env.ink; R.env.ink = 0; render(); R.env.ink = k; return grab(); };
    const A = frame(false), B = frame(true); R.depthLess = false; let n = 0; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), im = x.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) { const s = ((H - 1 - y) * W + i) * 4, d = (y * W + i) * 4, df = Math.abs(A[s] - B[s]) + Math.abs(A[s + 1] - B[s + 1]) + Math.abs(A[s + 2] - B[s + 2]);
      if (df > 6) { n++; im.data[d] = 255; im.data[d + 1] = 30; im.data[d + 2] = 30; } else { const l = (A[s] + A[s + 1] + A[s + 2]) / 6; im.data[d] = im.data[d + 1] = im.data[d + 2] = l; } im.data[d + 3] = 255; }
    x.putImageData(im, 0, 0); void inkK; return { n, png: c.toDataURL('image/png') }; },
  // pop detector: move the camera in small steps along a path; returns the mean per-pixel change of each frame (spikes = popping)
  popTest(x0, z0, x1, z1, n = 60, yaw0 = null, turn = 0) { const gl = R.gl, W = R.W, H = R.H, a = new Uint8Array(W * H * 4), out = []; let prev = null;
    for (let i = 0; i <= n; i++) { const t = i / n; G.fly = true; G.P.pos = [lerp(x0, x1, t), 1.6, lerp(z0, z1, t)]; G.P.yaw = (yaw0 === null ? Math.atan2(-(x1 - x0), -(z1 - z0)) : yaw0) + turn * t; G.P.pitch = 0;
      CITY.update(); if (POOL.main) POOL.runMain(1e9); render(); gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (prev) { let d = 0; for (let k = 0; k < a.length; k += 16) d += Math.abs(a[k] - prev[k]) + Math.abs(a[k + 1] - prev[k + 1]); out.push(+(d / (a.length / 16)).toFixed(1)); } prev = a.slice(); }
    return out; },
  // the game canvas (true render pixels) upscaled x2 with nearest filtering, plus the debug line, as a PNG data URL
  png(scale = 2) { render(); const c = document.getElementById('c'), o = document.createElement('canvas'); o.width = c.width * scale; o.height = c.height * scale; const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height);
    if (G.debug) { const P = G.P, s = `${(R.stats.tris / 1000).toFixed(0)}k tris ${R.stats.calls} calls  ${String(G.hour | 0).padStart(2, '0')}:${String((G.hour % 1) * 60 | 0).padStart(2, '0')}  x ${P.pos[0].toFixed(0)} y ${P.pos[1].toFixed(0)} z ${P.pos[2].toFixed(0)} yaw ${P.yaw.toFixed(2)}`; x.font = '12px Menlo, monospace'; x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(6, 6, x.measureText(s).width + 10, 18); x.fillStyle = '#e8e0d0'; x.fillText(s, 11, 19); }
    return o.toDataURL('image/png'); },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { G.t += dt; updatePlayer(dt); CLOCK.update(dt); if (SC.update) SC.update(dt); if (typeof CROWD !== 'undefined' && CROWD.update) CROWD.update(dt); } render(); return true; },
};
(async function boot() {
  if (Q.has('bake')) { const base = (APP.root ?? '../') + 'tool/.bake/' + (Q.get('bake') === '1' ? 'bake' : Q.get('bake')), load = src => new Promise(res => { const sc = document.createElement('script'); sc.src = src; sc.onload = () => res(true); sc.onerror = () => res(false); document.head.appendChild(sc); });
    if (!await load(base + '.js')) console.warn('no bake file'); else for (let i = 0; i < (window.BAKE_PARTS || 0); i++) if (!await load(base + '.' + i + '.js')) console.warn('bake part missing', i); } // bakes come in parts (tool/bake.js)
  const cv = document.getElementById('c');
  HX.fillStyle = '#000'; HX.fillRect(0, 0, 9999, 9999);
  const data = await TEX.prepare(f => { HUDC.width = innerWidth; HUDC.height = innerHeight; HX.fillStyle = '#000'; HX.fillRect(0, 0, HUDC.width, HUDC.height); HX.fillStyle = '#c8b89a'; HX.font = '14px Menlo, monospace'; HX.fillText('preparing textures ' + (f * 100 | 0) + '%', 20, HUDC.height - 24); });
  R.init(cv, data); R.resize(qn('h', 360)); if (Q.has('nobump')) R.bump.on = false; if (Q.has('nowaterfx')) R.water.on = false; if (Q.has('nossr')) R.water.ssr = false; try { const rv = Q.has('retro') ? (Q.get('retro') === 'pal' ? 2 : clamp(+Q.get('retro') || 1, 0, 3)) : +(localStorage.getItem('drums_retro') || 0); if (rv) setRetro(rv); } catch (e) { } /* ?retro=1 dither, ?retro=2 ENDESGA32 */ addEventListener('resize', () => R.resize(G.retro === 3 ? Math.min(1440, Math.round(innerHeight * (devicePixelRatio || 1))) : G.retro ? R.H : QUALITY.h())); // XHIGH / FULL / wireframe follow the window
  Input.init(HUDC);
  for (const ev of ['mousedown', 'keydown']) addEventListener(ev, () => AUX('init'));
  const t0 = performance.now(); G.world = new World();
  SC = (SCENES[G.scene] || SCENES.kit)();
  console.log('scene', G.scene, 'built in', (performance.now() - t0).toFixed(0), 'ms');
  if (typeof CROWD !== 'undefined') CROWD.onStep = (x, y, z, k, hoof) => { FX.dust(x, y, z, k); if (hoof && (SOUND.hear ?? 1) > .2 && (SOUND.hoofN = (G.t - (SOUND.hoofT || 0) > 1 ? 0 : SOUND.hoofN || 0)) < 8) { if (!SOUND.hoofN) SOUND.hoofT = G.t; SOUND.hoofN++; AUX('hoof', { x, y: y + .05, z, hard: typeof CITY !== 'undefined' && CITY.groundAt && CITY.groundAt(x, z) === GC.PAVED, vol: .35 + .4 * k, pri: .45 }); } }; // crowd hooves: low priority, at most 8 a second // hooves of horses, donkeys, oxen near you
  if (typeof CROWD !== 'undefined' && CROWD.init && G.nav) CROWD.init(G.nav, { lay: G.lay, hour: () => G.hour, height: typeof CITY !== 'undefined' && CITY.ready ? (x, z) => CITY.height(x, z) : undefined, ground: (x, z) => groundAt(x, z) });
  if (!G.fly) G.P.pos[1] = Math.max(G.P.pos[1], groundAt(G.P.pos[0], G.P.pos[2]));
  if (SC.update) { R.setCamera(G.P.pos[0], G.P.pos[1] + 1.6, G.P.pos[2], G.P.yaw, G.P.pitch);
    if (typeof CITY !== 'undefined' && CITY.ready) { const t1 = performance.now(), iv = setInterval(() => loadingScreen(CITY.progress()), 100); await CITY.settleAsync(); clearInterval(iv); console.log('city ready in', ((performance.now() - t1) / 1000).toFixed(1), 's', POOL.main ? '(main thread)' : '(' + POOL.ws.length + ' workers)'); } }
  if (Q.has('lantern') && !LANTERN.on) LANTERN.toggle();
  if (Q.has('con') && typeof CITY !== 'undefined' && CITY.ready) for (const c of Q.get('con').split(';')) CON.run(c.trim());
  if (APP.start) APP.start();
  window.__ready = true;
  requestAnimationFrame(loop);
})().catch(e => { console.error(e); document.title = 'ERROR ' + e.message; window.__error = e.message + '\n' + e.stack; });
