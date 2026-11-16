/* EIGHT HUNDRED DRUMS — audio.js : every sound and note is synthesized at runtime (Web Audio, no samples, no deps).
   Plain script; defines window.AU. See AUDIO.md for the full list of names.

 API
  AU.init()                       create/resume the AudioContext (call on every user gesture; idempotent)
  AU.listener(x,y,z,yaw)          every frame. metres, y up, x east, z south; yaw 0 faces -z; forward = (-sin yaw, 0, -cos yaw)
  AU.set(state)                   every frame: {hour, indoor, crowd, district, wind, rain, curfew, alert, hear} (any subset; smoothed; hear: people sounds 1 on the ground .. 0 high above it)
  AU.sfx(name, o)                 one-shot; o {x,y,z (omit = UI/non-positional), vol, pitch, seed, muffle 0..1, ref (m at full vol)}
  AU.loop(key, name, o)           create/update positional loop emitter {x,y,z,vol,pitch}; AU.stop(key, fade)
  AU.drums(kind, o)               'dusk' | 'dawn' | 'market_open' | 'market_close' | 'alarm' ; o {speed, x,z (market/alarm position), vol}
  AU.voice(x,y,z,o)               NPC bark: o {kind: murmur|call|shout|laugh|cry|gasp|hawk|grunt|pain|sigh, pitch, seed, dur, vol}
  AU.say(x,y,z,o)                 spoken Middle Chinese line (needs mcsynth.js + speech.js): o {ctx, who, trade, id, mood, seed, pitch, vol} -> seconds or 0
  AU.step(surface, o)             footsteps dirt|stone|brick|wood|tile|grass|mud|water ; o {run, crouch, vol, x,y,z}
  AU.hoof(o)                      one hoof strike ; o {x,y,z, hard, vol}
  AU.music(name, o)               crossfade to a piece (or null); o {vol, fade}
  AU.volume(master, music, sfx)
  extras: AU.list(), AU.stopAll(fade), AU.stats(), AU.perf(), AU.duck(amount, sec), AU.ready() (Promise: background bakes done),
          AU.ctx(), AU.trackLen(name), AU._lint(), AU._dbg(), AU._render(kind, name, dur, o) -> Promise<AudioBuffer> (offline; tests)
 Layout: primitives · buffers/graph · spatial voices · scheduler (jobs) · bake queue · human voices · footsteps · SFX ·
         baked beds · loop emitters · ambience · city drums · music engine · Tang instruments · compositions · API.
 Every public method is wrapped in try/catch: an audio error is logged once and never breaks the game loop.
*/
(function () {
'use strict';
var AC = window.AudioContext || window.webkitAudioContext, OCX = window.OfflineAudioContext || window.webkitOfflineAudioContext;
var ac = null, M = null, OFF = false, REC = null;
var vols = { master: 0.9, music: 0.55, sfx: 1 };
var L = { x: 0, y: 1.6, z: 0, yaw: 0 };
var ST = { hour: 12, indoor: 0, crowd: 0.3, district: 'ward', wind: 0.2, rain: 0, curfew: false, alert: 0, hear: 1 };   // targets (AU.set)
var SM = { hour: 12, indoor: 0, crowd: 0.3, wind: 0.2, rain: 0, alert: 0, curfew: 0, hear: 1, d: {} };                   // smoothed
var DISTRICTS = ['market', 'ward', 'avenue', 'temple', 'quarter', 'outskirts', 'palace', 'interior'];
DISTRICTS.forEach(function (k) { SM.d[k] = k === 'ward' ? 1 : 0; });
var defs = {}, loopDefs = {}, tracks = {}, warned = {};
var voices = [], MAXV = 40, curMus = null, jobs = [];
var rnd = Math.random, mathRnd = Math.random;
function R(a, b) { return a + (b - a) * rnd(); }
function pick(a) { return a[(rnd() * a.length) | 0]; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function seeded(s) { s = (s * 2654435761) >>> 0 || 1; return function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function withSeed(seed, f) { if (seed == null) return f(); var r0 = rnd; rnd = seeded(seed); try { return f(); } finally { rnd = r0; } }

/* ---------- primitives (from FIFTH WATCH, tuned) ---------- */
function G(v) { var g = ac.createGain(); g.gain.value = v == null ? 1 : v; return g; }
function F(type, f, q) { var b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
function PK(f, q, db) { var b = F('peaking', f, q); b.gain.value = db; return b; }
function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
function rec(s) { if (REC) REC.push(s); return s; }
function O(type, f, t, end) {
  var o = ac.createOscillator();
  if (type === 'glottal') o.setPeriodicWave(M.glot || (M.glot = glottalWave())); else if (type === 'reed') o.setPeriodicWave(M.reed || (M.reed = reedWave())); else o.type = type;
  o.frequency.setValueAtTime(f, t); o.start(t); if (end != null) o.stop(end); return rec(o);
}
function env(p, t, a, d, pk, h) {
  h = h || 0; pk = Math.max(pk, 1e-4);
  p.setValueAtTime(1e-4, t); p.linearRampToValueAtTime(pk, t + a);
  if (h) p.setValueAtTime(pk, t + a + h);
  p.exponentialRampToValueAtTime(1e-4, t + a + h + d); return t + a + h + d;
}
function noise(t, dur, c, rate) {
  var s = ac.createBufferSource(); s.buffer = M.nb[c || 'white']; s.loop = true;
  if (rate) s.playbackRate.value = rate; s.start(t, rnd() * 2.5); if (dur != null) s.stop(t + dur); return rec(s);
}
function buf(d, fill, ch) {
  var sr = ac.sampleRate, n = Math.max(1, Math.ceil(d * sr)), b = ac.createBuffer(ch || 1, n, sr);
  for (var c = 0; c < (ch || 1); c++) fill(b.getChannelData(c), sr, n, c); return b;
}
function playBuf(b, t, rate, dest, loop, end, off) {
  var s = ac.createBufferSource(); s.buffer = b; if (rate) s.playbackRate.value = rate;
  if (loop) s.loop = true; if (dest) s.connect(dest); s.start(t, off || 0); if (end) s.stop(end); return rec(s);
}
var SHC = {};
function shaper(k) {
  k = Math.round(k * 10) / 10; var w = SHC[k];
  if (!w) { w = new Float32Array(1024); var n = Math.tanh(k); for (var i = 0; i < 1024; i++) { var x = i / 511.5 - 1; w[i] = Math.tanh(k * x) / n; } SHC[k] = w; }
  var s = ac.createWaveShaper(); s.curve = w; return s;
}
function tone(out, t, p) {
  var a = p.a || 0.002, h = p.h || 0, d = p.d || 0.2, end = t + a + h + d + 0.05;
  var o = O(p.w || 'sine', p.f, t, end);
  if (p.f1) o.frequency.exponentialRampToValueAtTime(p.f1, t + (p.pt || a + h + d));
  if (p.det) o.detune.value = p.det;
  var g = G(0); env(g.gain, t, a, d, p.v == null ? 1 : p.v, h); o.connect(g); g.connect(out);
  return { o: o, g: g, end: end };
}
function nz(out, t, p) {
  var a = p.a || 0.002, h = p.h || 0, d = p.d || 0.2, end = t + a + h + d + 0.05;
  var s = noise(t, end - t, p.c, p.rate), f = F(p.ft || 'bandpass', p.f || 1000, p.q == null ? 1 : p.q);
  f.frequency.setValueAtTime(p.f || 1000, t);
  if (p.f1) f.frequency.exponentialRampToValueAtTime(p.f1, t + (p.pt || a + h + d));
  var g = G(0); env(g.gain, t, a, d, p.v == null ? 1 : p.v, h); chain(s, f, g, out);
  return { s: s, f: f, g: g, end: end };
}
function fm(out, t, p) {
  var a = p.a || 0.003, h = p.h || 0, d = p.d || 1, end = t + a + h + d + 0.05, f = p.f, mr = p.mr || 1.4;
  var c = O(p.cw || 'sine', f, t, end), m = O('sine', f * mr, t, end), mg = G(0);
  mg.gain.setValueAtTime((p.mi == null ? 2 : p.mi) * f, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1e-3, (p.mi1 == null ? 0.1 : p.mi1) * f), t + (p.md || a + h + d));
  m.connect(mg); mg.connect(c.frequency);
  if (p.f1) { c.frequency.exponentialRampToValueAtTime(p.f1, t + a + h + d); m.frequency.exponentialRampToValueAtTime(p.f1 * mr, t + a + h + d); }
  var g = G(0); env(g.gain, t, a, d, p.v == null ? 1 : p.v, h); c.connect(g); g.connect(out);
  return { c: c, m: m, g: g, end: end };
}
var BELLR = [1, 2.76, 5.4, 8.93, 1.47, 3.9, 6.6];
function metal(out, t, p) {
  var r = p.r || BELLR, d = p.d || 1, v = p.v == null ? 1 : p.v, end = t;
  for (var i = 0; i < r.length; i++) {
    var fr = p.f * r[i] * (1 + (rnd() - 0.5) * (p.det || 0.006)); if (fr > 16000) continue;
    var e = tone(out, t, { f: fr, f1: p.bend ? fr * p.bend : null, pt: p.pt, a: p.a || 0.001, d: d * (p.dk ? Math.pow(p.dk, i) : 1 / (1 + i * 0.3)), v: v * (p.amp ? p.amp[i] : 1 / (1 + i * 0.6)) * 1.4 / Math.sqrt(r.length) });
    end = Math.max(end, e.end);
  }
  return { end: end };
}
// gritty grains (sand, gravel, cloth, crackle): a few pre-made pools per context, picked at random
function crunchBuf(d, dens, sk, flat) {
  return buf(d, function (x, sr, n) {
    var k = Math.floor(dens * d);
    for (var j = 0; j < k; j++) {
      var pos = (Math.pow(rnd(), sk || 1.8) * n) | 0, len = (R(0.0003, 0.0025) * sr) | 0, amp = R(0.2, 1) * (flat ? 1 : 1 - pos / n);
      for (var i = 0; i < len && pos + i < n; i++) x[pos + i] += (rnd() * 2 - 1) * amp * Math.exp(-i / len * 4);
    }
  });
}
function crunchPool(key, d, dens, sk) { var P = M.cp[key]; if (!P) { P = M.cp[key] = []; for (var i = 0; i < 4; i++) P.push(crunchBuf(d, dens, sk)); } return pick(P); }
function crunch(out, t, p) {
  var d = p.d || 0.15, dens = p.dens || 400, key = Math.round(d * 50) + '_' + Math.round(dens / 100) + '_' + (p.sk || 1.8);
  var s = playBuf(crunchPool(key, d, dens, p.sk), t, R(0.9, 1.1)), hp = F('highpass', p.f || 900, 0.7), pk = PK(p.pf || 2500, 1.5, 6);
  var g = G(p.v == null ? 1 : p.v); chain(s, hp, pk, g, out); return { end: t + d };
}
function bubBuf(d, n, f0) {
  return buf(d, function (x, sr, N) {
    for (var j = 0; j < n; j++) {
      var st = (Math.pow(rnd(), 1.4) * N * 0.85) | 0, len = (R(0.006, 0.035) * sr) | 0, fr = f0 * R(0.55, 1.9), ph = 0, amp = R(0.3, 1);
      for (var i = 0; i < len && st + i < N; i++) { var u = i / len; ph += 2 * Math.PI * fr * (1 + u * 1.4) / sr; x[st + i] += Math.sin(ph) * amp * Math.min(1, u * 12) * (1 - u) * (1 - u); }
    }
  });
}
function bubbles(out, t, p) {
  var d = p.d || 0.3, key = 'b' + Math.round(d * 20) + '_' + (p.n || 12) + '_' + Math.round((p.f || 700) / 100), P = M.cp[key];
  if (!P) { P = M.cp[key] = []; for (var i = 0; i < 3; i++) P.push(bubBuf(d, p.n || 12, p.f || 700)); }
  var s = playBuf(pick(P), t, R(0.85, 1.15)), g = G((p.v == null ? 1 : p.v) * 0.7); chain(s, g, out); return { end: t + d };
}
function creak(out, t, p) {
  var d = p.d || 0.6, r0 = p.r0 || 30, r1 = p.r1 || 90, key = 'cr' + Math.round(d * 10) + '_' + Math.round(r0 / 4) + '_' + Math.round(r1 / 8), P = M.cp[key];
  if (!P) P = M.cp[key] = [];
  var b = P.length >= 3 ? pick(P) : buf(d, function (x, sr, n) {
    var ph = 0, rate, s1 = rnd() * 9;
    for (var i = 0; i < n; i++) {
      var u = i / n; rate = (r0 + (r1 - r0) * u) * (1 + 0.35 * Math.sin(u * 17 + s1) + R(-0.3, 0.3) * 0.2);
      ph += rate / sr; if (ph >= 1) { ph -= 1; x[i] = R(0.5, 1) * (rnd() < 0.85 ? 1 : 0); }
    }
    var fi = Math.min(n, sr * 0.03 | 0); for (i = 0; i < fi; i++) { x[i] *= i / fi; x[n - 1 - i] *= i / fi; }
  });
  if (P.length < 3) P.push(b);
  var s = playBuf(b, t, R(0.94, 1.06)), f1 = F('bandpass', p.f || 700, 7), f2 = F('bandpass', (p.f || 700) * 2.3, 6), g = G((p.v == null ? 1 : p.v) * 25);
  s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); return { end: t + d };
}
function dbus(out, k, v) { var g = G(1); chain(g, shaper(k), G(v == null ? 0.7 : v), out); return g; }
function thump(out, t, f0, f1, d, v) { return tone(out, t, { f: f0, f1: f1, pt: d * 0.45, d: d, v: v }); }
function am(out, t, end, rate, depth, w) { var g = G(1 - depth), lf = O(w || 'sine', rate, t, end), lg = G(depth); chain(lf, lg, g.gain); g.connect(out); return g; }
function wood(out, t, p) {
  var f = p.f || 900, d = p.d || 0.08, v = p.v == null ? 1 : p.v;
  tone(out, t, { w: 'sine', f: f * 1.06, f1: f, pt: 0.01, d: d, v: v * 0.7 });
  tone(out, t, { w: 'sine', f: f * 2.71, d: d * 0.45, v: v * 0.22 });
  nz(out, t, { f: f * 2.2, q: 1.8, d: 0.012, v: v * 0.9 });
  return { end: t + d + 0.05 };
}
function whoosh(out, t, d, f0, f1, v) {
  var n = nz(out, t, { c: 'pink', f: f0, f1: f1, pt: d * 0.55, q: 1.4, a: d * 0.45, d: d * 0.6, v: v });
  n.f.frequency.exponentialRampToValueAtTime(f0 * 1.3, t + d * 1.05); return n;
}
var ZR = [1, 1.19, 2.37, 3.01, 4.16, 5.43, 6.8], ZA = [1, 0.22, 0.5, 0.32, 0.26, 0.16, 0.1], ZD = [1, 0.7, 0.45, 0.35, 0.25, 0.16, 0.11];
function zhong(out, t, p) {   // small bronze bell
  var f = p.f, d = p.d || 3, v = p.v == null ? 1 : p.v, end = t;
  for (var i = 0; i < ZR.length; i++) {
    var fr = f * ZR[i] * (1 + R(-0.002, 0.002)); if (fr > 15000) continue;
    var e = tone(out, t, { f: fr, a: 0.001, d: d * ZD[i], v: v * ZA[i] * 0.42 }); end = Math.max(end, e.end);
    if (i === 0) tone(out, t, { f: fr + R(0.8, 1.8), a: 0.001, d: d * 0.9, v: v * 0.2 });
  }
  nz(out, t, { f: Math.min(9000, f * 6), q: 2, d: 0.02, v: v * 0.25 });
  return { end: end };
}
var QR = [1, 2.76, 4.32, 5.95, 8.2], QA = [1, 0.4, 0.3, 0.14, 0.08], QD = [1, 0.5, 0.3, 0.2, 0.12];
function qing(out, t, p) {   // stone chime / bowl-ish
  var f = p.f, d = p.d || 1.6, v = p.v == null ? 1 : p.v, end = t, lp = F('lowpass', 7000, 0.7); lp.connect(out);
  for (var i = 0; i < QR.length; i++) { var e = tone(lp, t, { f: f * QR[i] * (1 + R(-0.004, 0.004)), a: 0.001, d: d * QD[i], v: v * QA[i] * 0.5 }); end = Math.max(end, e.end); }
  nz(lp, t, { f: 2200, q: 1.2, d: 0.018, v: v * 0.5 });
  return { end: end };
}
// great temple bell (梵鐘, struck by a swung beam): long hum, beating doublets, slow decay; ~len*12 s
var TOLL = [[0.5, 1, 10], [1, 0.8, 8], [1.183, 0.6, 6], [1.47, 0.4, 4.5], [2, 0.6, 4], [2.52, 0.4, 3], [2.97, 0.35, 2.6], [4.07, 0.3, 2], [5.33, 0.25, 1.6], [6.71, 0.2, 1.2], [8.2, 0.15, 0.9]];
function bigBell(out, t, f0, v, len) {
  len = len || 1;
  TOLL.forEach(function (P) {
    for (var k = 0; k < (P[0] < 2.5 ? 2 : 1); k++) {
      var fr = f0 * P[0] * (k ? 1 + R(0.004, 0.012) : 1), dd = P[2] * R(0.9, 1.1) * len;
      tone(out, t, { f: fr, f1: fr * 0.995, pt: dd, a: 0.004, d: dd, v: P[1] * 0.3 * v * (k ? 0.7 : 1) });
    }
  });
  thump(out, t, f0 * 2, f0 * 0.6, 0.3, v * 0.5); nz(out, t, { c: 'brown', ft: 'lowpass', f: 700, d: 0.18, v: v * 0.5 });
  wood(out, t, { f: 260, d: 0.1, v: v * 0.25 });   // the beam
  return { end: t + 10 * len };
}
/* membrane drum. Modes of a circular membrane (1, 1.59, 2.14, 2.30, 2.65) with pitch drop; stick/hand impact; shell boom.
   p: f fundamental, d decay, v, hard 0..1 (stick vs. mallet), skin (impact lowpass) */
var MEMR = [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16], MEMA = [1, 0.5, 0.32, 0.25, 0.16, 0.11, 0.07];
function drum(out, t, p) {
  var f = p.f || 70, d = p.d || 0.8, v = p.v == null ? 1 : p.v, hard = p.hard == null ? 0.5 : p.hard, g = dbus(out, 1.3, 0.95);
  for (var i = 0; i < MEMR.length; i++) {
    var fr = f * MEMR[i] * R(0.995, 1.005);
    tone(g, t, { f: fr * (1.12 + 0.1 * hard), f1: fr, pt: 0.05 + i * 0.005, a: 0.0015, d: d / (1 + i * 0.9), v: v * MEMA[i] * (i ? 0.5 + hard * 0.5 : 1) });
  }
  tone(g, t, { f: f * 0.62, f1: f * 0.55, pt: 0.1, a: 0.004, d: d * 0.6, v: v * 0.35 });   // shell/air boom
  nz(g, t, { c: 'pink', ft: 'lowpass', f: p.skin || 800 + hard * 1400, d: 0.05 + hard * 0.02, v: v * (0.35 + hard * 0.4) });
  nz(out, t, { f: 1800 + hard * 1500, q: 1.2, d: 0.012, v: v * hard * 0.35 });
  return { end: t + d + 0.1 };
}
/* 街鼓: a big barrel drum struck with wooden sticks. A lower-mid membrane 'dum' (inharmonic membrane partials, slight pitch
   settle), a short soft stick attack and a little shell resonance. No noise burst, no sub boom, no distortion, every part
   starts from silence with a short ramp (no clicks). p: f (60-110 Hz), d (decay s), v, stick 0..1 */
function tdrum(out, t, p) {
  var f = p.f || 80, d = p.d || 1.1, v = p.v == null ? 1 : p.v, st = p.stick == null ? 0.5 : p.stick;
  var R1 = [1, 1.59, 2.14, 2.3, 2.65, 2.92], A1 = [1, 0.42, 0.24, 0.16, 0.1, 0.06];
  for (var i = 0; i < R1.length; i++) { var fr = f * R1[i] * R(0.997, 1.003); tone(out, t, { f: fr * 1.04, f1: fr, pt: 0.07, a: 0.004, d: d / (1 + i * 0.8), v: v * A1[i] * 0.5 }); }
  tone(out, t, { f: f * 3.4, f1: f * 3.1, pt: 0.03, a: 0.003, d: 0.07, v: v * 0.09 });               // head slap ("thock")
  tone(out, t, { f: f * 2.55 * R(0.98, 1.02), a: 0.006, d: 0.3, v: v * 0.07 });                          // barrel shell
  nz(out, t, { f: 1500 + st * 900, q: 1.4, a: 0.002, d: 0.018, v: v * (0.05 + st * 0.07) });             // stick tip on the skin
  return { end: t + d + 0.1 };
}
var VOW = { a: [800, 1200, 2800], o: [500, 850, 2600], u: [340, 720, 2400], e: [480, 1750, 2600], i: [300, 2250, 3000], uh: [600, 1050, 2450], er: [500, 1450, 1700], m: [260, 1100, 2400], n: [260, 1600, 2600] };
var VAMP = { a: [1, 0.55, 0.22], o: [1, 0.4, 0.1], u: [1, 0.25, 0.05], e: [1, 0.35, 0.2], i: [1, 0.2, 0.15], uh: [1, 0.45, 0.15], er: [1, 0.4, 0.3], m: [0.7, 0.05, 0.02], n: [0.7, 0.08, 0.03] };
/* formant voice for animals (dogs, crows, donkeys...). p: f,f1,vowel,vowel1,a,h,d,v,fry,vib,dist,q,noise,fs */
function voxf(out, t, p) {
  var a = p.a || 0.02, h = p.h || 0, d = p.d || 0.5, end = t + a + h + d + 0.1, f = p.f || 110, fs = p.fs || 1, q = p.q || 8;
  var src = O(p.w || 'sawtooth', f, t, end);
  if (p.f1) src.frequency.exponentialRampToValueAtTime(p.f1, t + a + h + d);
  if (p.vib) { var lf = O('sine', p.vr || 5.5, t, end), lg = G(f * p.vib); chain(lf, lg, src.frequency); }
  var pre = G(1); src.connect(pre);
  if (p.fry) { var amg = G(0.5), lo = O(p.frw || 'square', p.fry, t, end), lg2 = G(0.5); chain(lo, lg2, amg.gain); pre.connect(amg); pre = amg; }
  if (p.noise) { var nn = noise(t, end - t, 'white'), ng = G(p.noise); chain(nn, ng, pre); }
  var vo = VOW[p.vowel || 'a'], va = VAMP[p.vowel || 'a'], v1 = p.vowel1 ? VOW[p.vowel1] : null, sum = G(1);
  for (var i = 0; i < 3; i++) {
    var b = F('bandpass', vo[i] * fs, q), bg = G(va[i] * Math.sqrt(q) * 1.3);
    b.frequency.setValueAtTime(vo[i] * fs, t);
    if (v1) b.frequency.linearRampToValueAtTime(v1[i] * fs, t + a + h + d);
    chain(pre, b, bg, sum);
  }
  var g = G(0), last = sum;
  if (p.dist) { var sh = shaper(p.dist); last.connect(sh); last = sh; }
  env(g.gain, t, a, d, p.v == null ? 1 : p.v, h); chain(last, g, out);
  return { end: end, src: src, g: g };
}
/* Karplus-Strong string; damp = loop gain, bright = excitation lowpass 0..1, pos = pluck position (comb) 0..0.5 */
function ks(f, d, damp, bright, pos) {
  bright = bright == null ? 0.6 : bright; pos = pos || 0;
  var key = Math.round(f * 4) + '_' + d + '_' + (damp || 0) + '_' + bright + '_' + pos, c = M.ks[key];
  if (c) return c;
  if (++M.ksn > 500) { M.ks = {}; M.ksn = 0; }
  c = buf(d, function (x, sr, n) {
    var P = sr / f - 0.5, N = Math.max(2, Math.floor(P)), fr = P - N, dec = damp || 0.996, i, lp = 0;
    for (i = 0; i < N && i < n; i++) { lp += ((rnd() * 2 - 1) - lp) * bright; x[i] = lp; }
    if (pos > 0) { var k = Math.max(1, Math.round(N * pos)), tmp = x.slice(0, N); for (i = 0; i < N; i++) x[i] = tmp[i] - tmp[(i + k) % N]; }
    var m = 0; for (i = 0; i < N; i++) m += x[i]; m /= N; for (i = 0; i < N; i++) x[i] -= m;
    for (i = N; i < n; i++) x[i] = dec * 0.5 * ((1 - fr) * x[i - N] + (i - N - 1 >= 0 ? x[i - N - 1] : 0) + (i - N - 2 >= 0 ? fr * x[i - N - 2] : 0));
    var mx = 1e-6; for (i = 0; i < Math.min(n, N * 4); i++) mx = Math.max(mx, Math.abs(x[i]));
    for (i = 0; i < n; i++) x[i] /= mx;
  });
  return (M.ks[key] = c);
}

/* ---------- shared buffers: noise, impulse responses (generated once per sample rate) ---------- */
var BUFC = {};
function noiseBufs() {
  var sr = ac.sampleRate; if (BUFC['n' + sr]) return BUFC['n' + sr];
  var n = Math.round(sr * 2.5), out = {}, r = Math.random;
  ['white', 'pink', 'brown'].forEach(function (c) {
    var b = ac.createBuffer(1, n, sr), x = b.getChannelData(0), b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, mx = 0, i;
    for (i = 0; i < n; i++) {
      var w = r() * 2 - 1;
      if (c === 'white') x[i] = w;
      else if (c === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else { br = (br + 0.02 * w) / 1.02; x[i] = br; }
      mx = Math.max(mx, Math.abs(x[i]));
    }
    for (i = 0; i < n; i++) x[i] /= mx;
    var fd = 2000; for (i = 0; i < fd; i++) { var u = i / fd; x[n - fd + i] = x[n - fd + i] * (1 - u) + x[i] * u; }
    out[c] = b;
  });
  return (BUFC['n' + sr] = out);
}
/* impulse response: exponential noise tail with frequency-dependent damping, plus discrete early echoes
   echoes: [[time s, gain], ...] e.g. ward walls / courtyard */
function irBuf(key, dur, damp, echoes, bright) {
  var sr = ac.sampleRate, k = key + sr; if (BUFC[k]) return BUFC[k];
  var n = (dur * sr) | 0, b = ac.createBuffer(2, n, sr), r = Math.random;
  for (var c = 0; c < 2; c++) {
    var x = b.getChannelData(c), lp = 0, i, e = 1, k = Math.exp(-6.5 / n), br = bright || 0.85, at = sr * 0.008, R2 = Math.random;
    for (i = 0; i < n; i++) {
      var co = br - (i / n) * damp; if (co < 0.03) co = 0.03; lp += (R2() * 2 - 1 - lp) * co; e *= k;
      x[i] = lp * e * (i < at ? i / at : 1);
    }
    (echoes || []).forEach(function (e) {
      var p = ((e[0] * (1 + (c ? 0.07 : -0.05)) + (r() - 0.5) * 0.01) * sr) | 0, L2 = (0.004 * sr) | 0, s = 0;
      for (var j = 0; j < L2 * 6 && p + j < n; j++) { s += (r() * 2 - 1 - s) * 0.35; x[p + j] += s * e[1] * 3 * Math.exp(-j / L2); }
    });
  }
  return (BUFC[k] = b);
}
function glottalWave() {   // -12 dB/oct-ish source: soft, voice-like (less buzzy than a saw)
  var N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (var i = 1; i < N; i++) im[i] = Math.pow(i, -1.35) * (i % 2 ? 1 : 0.8);
  return ac.createPeriodicWave(re, im);
}
function reedWave() {      // double reed (篳篥): strong odd+even harmonics with a formant hump around h4..h8
  var N = 40, re = new Float32Array(N), im = new Float32Array(N);
  for (var i = 1; i < N; i++) im[i] = (0.55 / Math.pow(i, 0.55)) * (1 + 1.6 * Math.exp(-Math.pow((i - 6) / 3, 2))) * (i % 2 ? 1 : 0.75);
  return ac.createPeriodicWave(re, im);
}

/* ---------- graph ---------- */
function build(raw) {
  var m = M = { nb: noiseBufs(), ks: {}, ksn: 0, cp: {} };
  m.pre = G(1);
  if (raw) m.pre.connect(ac.destination);
  else {
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.25;
    var lim = ac.createDynamicsCompressor();
    lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    m.master = G(vols.master); chain(m.pre, F('highpass', 28, 0.7), comp, m.master, lim, ac.destination);
  }
  m.sfx = G(vols.sfx); m.sfx.connect(m.pre);
  m.mus = G(vols.music); m.mus.connect(m.pre);
  m.duck = G(1); m.duck.connect(m.mus);
  m.musIn = G(1); m.musIn.connect(m.duck);
  // outdoor (ambience) chain: everything heard "through the walls" when indoor
  m.ambOut = G(1); m.ambOut.connect(m.sfx);
  m.ambLP = F('lowpass', 20000, 0.5); m.ambLP2 = F('lowpass', 20000, 0.5); m.ambG = G(1);
  m.ambIn = G(1); chain(m.ambIn, F('highpass', 45, 0.6), m.ambLP, m.ambLP2, m.ambG, m.ambOut);
  m.vbus = G(1); m.vbus.connect(m.sfx);       // positional one-shots / loops (game world)
  // reverbs: small room (indoors), city (outdoor: rammed-earth walls give slap echoes), music hall
  var cvR = ac.createConvolver(), cvC = ac.createConvolver(), cvM = ac.createConvolver();
  m.irs = [[cvC, function () { return irBuf('city', 2.6, 0.82, [[0.09, 0.22], [0.16, 0.16], [0.29, 0.12], [0.47, 0.1], [0.71, 0.07], [1.05, 0.05]], 0.75); }],
    [cvR, function () { return irBuf('room', 0.8, 0.9, [[0.011, 0.35], [0.019, 0.25], [0.031, 0.2]], 0.7); }],
    [cvM, function () { return irBuf('hall', 2.2, 0.7, [[0.02, 0.2], [0.035, 0.15]], 0.8); }]];
  if (OFF || raw) m.irs.forEach(function (c) { c[0].buffer = c[1](); });
  m.rvIn = G(1); m.rvRoomG = G(0); m.rvCityG = G(1);
  chain(m.rvIn, F('highpass', 160, 0.7), m.rvRoomG, cvR, G(0.9), m.sfx);
  m.rvCity = G(1); chain(m.rvCity, F('highpass', 120, 0.7), cvC, G(0.85), m.ambIn);
  m.rvIn.connect(m.rvCityG); m.rvCityG.connect(m.rvCity);
  m.mrvIn = G(1); chain(m.mrvIn, F('highpass', 150, 0.7), cvM, G(0.7), m.duck);
  // long echoes over the city (drums, bells): two feedback delays, lowpassed
  m.echo = G(1); var eo = G(0.5); eo.connect(m.ambIn);
  [[0.43, 0.38, 1800], [0.77, 0.3, 1100]].forEach(function (e) {
    var dl = ac.createDelay(2), fb = G(e[1]), lp = F('lowpass', e[2], 0.5);
    dl.delayTime.value = e[0]; chain(m.echo, dl, lp, fb, dl); lp.connect(eo);
  });
  return m;
}

/* ---------- voices & spatialization ---------- */
// a voice = in -> g -> lp -> pan -> bus (+ wet send). o: x,y,z, vol, ref (m at full volume), maxd (cull), muffle, roll
function voice(o, rev, bus, rv) {
  var v = { o: o, in: G(1), g: G(0), lp: F('lowpass', 20000, 0.5), pn: ac.createStereoPanner ? ac.createStereoPanner() : null,
    wet: G(0), base: rev == null ? 0.12 : rev, vol: o.vol == null ? 1 : o.vol, t0: ac.currentTime, end: ac.currentTime + 3, att: 1 };
  chain(v.in, v.g, v.lp); var last = v.lp;
  if (v.pn) { last.connect(v.pn); last = v.pn; }
  last.connect(bus || M.vbus); last.connect(v.wet); v.wet.connect(rv || M.rvIn);
  v.pos = (o.x != null || o.z != null) ? { x: +o.x || 0, y: o.y == null ? L.y : +o.y, z: +o.z || 0 } : null;
  v.fpan = o.pan || 0; spatial(v, true); return v;
}
function spatial(v, now) {
  var att = 1, pan = v.fpan, cut = v.o.cut || 20000, wet = v.base, o = v.o;
  if (v.pos) {
    var dx = v.pos.x - L.x, dy = v.pos.y - L.y, dz = v.pos.z - L.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), ref = o.ref || 3, maxd = o.maxd || 140;
    att = o.law ? Math.pow(ref / (ref + d), 0.8) : d <= ref ? 1 : ref / (ref + (d - ref) * (o.roll || 1));
    att *= clamp(1 - (d - maxd * 0.7) / (maxd * 0.3), 0, 1);
    var hd = Math.sqrt(dx * dx + dz * dz);
    if (hd > 0.01) {
      var sy = Math.sin(L.yaw), cy = Math.cos(L.yaw);
      pan = (dx * cy - dz * sy) / hd * clamp(hd / 2, 0, 1) * 0.8;
      var fw = (-dx * sy - dz * cy) / hd; if (fw < 0) cut = Math.min(cut, 20000 + 12000 * fw);   // head shadow behind
    }
    cut = Math.min(cut, 180 + 19000 / (1 + d / 28));                                           // air + obstacles
    wet = v.base + clamp(d / 50, 0, 0.6);
    att *= 1 - 0.35 * clamp(d / 60, 0, 1) * (o.far ? 0 : 1);                                  // more wet than dry far away
  }
  if (o.muffle) { cut = Math.min(cut, 20000 * Math.pow(0.03, o.muffle)); att *= 1 - 0.5 * o.muffle; }
  v.att = att;
  if (!(att >= 0)) att = 0; if (!(pan >= -1 && pan <= 1)) pan = 0; if (!(cut > 10)) cut = 20000; if (!(wet >= 0)) wet = 0; if (!(v.vol >= 0)) v.vol = 0;
  var t = ac.currentTime, gv = v.vol * att, nv = [gv, cut, wet * (v.vol > 0 ? Math.sqrt(v.vol) : 0) * (att > 0 ? 1 : 0), pan], lv = v.lv, ps = [v.g.gain, v.lp.frequency, v.wet.gain, v.pn && v.pn.pan];
  for (var i = 0; i < 4; i++) {
    if (!ps[i] || (lv && Math.abs(nv[i] - lv[i]) <= (i === 1 ? lv[i] * 0.06 : i === 3 ? 0.03 : Math.max(0.002, lv[i] * 0.04)))) continue;
    if (now) ps[i].value = nv[i]; else ps[i].setTargetAtTime(nv[i], t, 0.04);
    if (lv) lv[i] = nv[i];
  }
  if (!lv) v.lv = nv;
}
function later(s, f) { if (!OFF) setTimeout(f, s * 1000); }
function kill(v, fade) {
  if (v.dead) return; v.dead = true;
  var t = ac.currentTime; fade = fade || 0.03;
  v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + fade);
  if (v.srcs) v.srcs.forEach(function (s) { try { s.stop(t + fade + 0.05); } catch (e) {} });
  later(fade + 0.1, function () { free(v); });
}
function free(v) {
  v.dead = true;
  [v.in, v.g, v.lp, v.pn, v.wet].forEach(function (n) { if (n) try { n.disconnect(); } catch (e) {} });
  var i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
}
function steal(pri) {
  if (voices.length < MAXV) return true;
  var t = ac.currentTime, best = null, bs = 1e9;
  for (var i = 0; i < voices.length; i++) {
    var v = voices[i]; if (v.dead) continue;
    var life = Math.max(0.05, v.end - v.t0), s = v.vol * v.att * clamp(1 - (t - v.t0) / life, 0.05, 1) * (v.pri || 1);
    if (s < bs) { bs = s; best = v; }
  }
  if (best && bs < (pri || 1)) { voices.splice(voices.indexOf(best), 1); kill(best); return true; }
  return !best;
}
function audible(o) {   // quick cull before building any nodes
  if (o.x == null && o.z == null) return 1;
  var dx = o.x - L.x, dz = o.z - L.z, d = Math.sqrt(dx * dx + dz * dz), maxd = o.maxd || 140;
  return d < maxd ? 1 : 0;
}
function opts(o, d) {
  var q = {}; for (var k in o) q[k] = o[k];
  q.p = (o.pitch || 1) * (1 + (rnd() * 2 - 1) * (d && d.pv != null ? d.pv : 0.05)); q.r = rnd; return q;
}
/* one-shot: def(name, fn(ctx,out,t,q) -> duration, {rev, pv, pri, ref, maxd, ui, dur}) */
function oneshot(name, o, bus, t, rv) {
  var d = defs[name];
  if (!d) { if (!warned[name]) { warned[name] = 1; console.warn('AU: unknown sound "' + name + '"'); } return null; }
  o = o || {};
  var oo = o; if (d.ref || d.maxd || d.far) { oo = {}; for (var k in o) oo[k] = o[k]; if (oo.ref == null) oo.ref = d.ref; if (oo.maxd == null) oo.maxd = d.maxd; if (oo.far == null) oo.far = d.far; }
  if (!audible(oo) && !OFF) return null;
  if (!steal(d.pri || 1)) return null;
  var v = voice(oo, o.rev != null ? o.rev : d.rev, bus || (d.ui ? M.sfx : null), rv); voices.push(v); v.pri = d.pri;
  t = Math.max(t || 0, ac.currentTime + 0.005);
  var dur = 3;
  withSeed(o.seed, function () {
    try { var r = d.fn(ac, v.in, t, opts(o, d)); if (typeof r === 'number' && r > 0) dur = r; } catch (e) { console.error('AU ' + name, e); }
  });
  v.t0 = t; v.end = t + dur;
  later(t - ac.currentTime + dur + 0.3, function () { free(v); });
  return v;
}
function def(name, fn, o) { o = o || {}; defs[name] = { fn: fn, rev: o.rev, pv: o.pv, pri: o.pri, ref: o.ref, maxd: o.maxd, ui: o.ui, hide: o.hide, far: o.far }; }
function sfxIn(name, out, t, o) { var d = defs[name]; if (!d) return 0; return d.fn(ac, out, t, opts(o || {}, d)) || 0; }
function duck(amount, sec) {
  if (!M) return; var g = M.duck.gain, t = ac.currentTime; sec = sec || 1;
  var target = clamp(1 - amount, 0.05, 1);
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(Math.min(g.value, target), t + 0.06);
  g.setTargetAtTime(1, t + 0.06 + sec * 0.35, sec * 0.3);
}

/* ---------- scheduler: one timer pumps every time-based thing (music, beds, drums, loop events) ---------- */
// job = {next (ctx time), fn(t) -> next time or null (done), dead}
function job(next, fn) { var j = { next: next, fn: fn }; jobs.push(j); return j; }
function pumpJobs(until) {
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i], n = 0;
    while (!j.dead && j.next != null && j.next < until && n++ < 400) {
      var late = !OFF && j.next < ac.currentTime - 0.25;
      var r; try { r = j.fn(j.next, late); } catch (e) { console.error('AU job', e); r = null; }
      if (r == null || !(r > j.next - 1e-6)) { j.dead = true; break; } j.next = r;
    }
  }
  for (i = jobs.length - 1; i >= 0; i--) if (jobs[i].dead) jobs.splice(i, 1);
}

/* ---------- bake: render costly hits once (one OfflineAudioContext per set), replay as buffers ---------- */
var BK = {}, bakePend = [], BQ = [], bqTimer = null, BQSLOW = [];
function now_() { return window.performance ? performance.now() : Date.now(); }
function bq(f) { BQ.push(f); if (bqTimer == null) bqTimer = setTimeout(bqRun, 0); }
function bqRun() {   // time-sliced: at most ~5 ms of graph building per slice, so the game never hitches
  bqTimer = null; var t0 = now_();
  var wait = null;
  while (BQ.length && now_() - t0 < 5 && !wait) { var f = BQ.shift(), t1 = now_(), r = null; try { r = f(); } catch (e) { console.error('AU bake', e); } if (r && r.then) wait = r; var d1 = now_() - t1; if (d1 > 30) BQSLOW.push([Math.round(d1), f._k || String(f).slice(0, 90)]); }
  var d = now_() - t0; TS.bq += d; if (d > TS.bqMax) TS.bqMax = d;
  // one offline render at a time (less thread and memory contention); bakes take at most ~1/3 of the main thread
  if (wait) { bqTimer = -1; wait.then(function () { bqTimer = BQ.length ? setTimeout(bqRun, 16) : null; }, function () { bqTimer = BQ.length ? setTimeout(bqRun, 16) : null; }); }
  else if (BQ.length) bqTimer = setTimeout(bqRun, Math.max(16, d * 2));
}
function inCtx(off, M1, f) {   // run graph-building code against an OfflineAudioContext
  var A = ac, M0 = M, R0 = REC, O0 = OFF, r0 = rnd; ac = off; M = M1; REC = null; OFF = true;
  try { f(); } finally { ac = A; M = M0; REC = R0; OFF = O0; rnd = r0; }
}
function baked(key) { var e = BK[key]; return e && e.b ? pick(e.b) : null; }
function bakeSet(key, n, dur, fn, ch, sr0, trim) {
  if (BK[key] || !OCX || OFF) return;
  var e = BK[key] = { b: null }, sr = sr0 || ac.sampleRate, off;
  try { off = new OCX(ch || 1, Math.ceil(n * dur * sr), sr); } catch (x) { return; }
  var M1 = { nb: M.nb, ks: M.ks, ksn: 0, cp: M.cp }, res;
  bakePend.push(new Promise(function (r) { res = r; }));
  for (var i = 0; i < n; i++) (function (i) { var f = function () { inCtx(off, M1, function () { fn(off.destination, i * dur + 0.002, i); }); }; f._k = key + '#' + i; bq(f); })(i);
  bq(function () {
    return off.startRendering().then(function (b) {
      var out = [], len = Math.floor(dur * sr);
      for (var i = 0; i < n; i++) {
        var l2 = len, d0 = b.getChannelData(0);
        if (trim) { while (l2 > 64 && Math.abs(d0[i * len + l2 - 1]) < 2e-4) l2--; l2 = Math.min(len, l2 + 64); }
        var bb = ac.createBuffer(ch || 1, l2, sr);
        for (var c = 0; c < (ch || 1); c++) { var src = b.getChannelData(c).subarray(i * len, i * len + l2), dst = bb.getChannelData(c); dst.set(src); for (var k = 0; k < 64; k++) dst[l2 - 1 - k] *= k / 64; }
        out.push(bb);
      }
      e.b = out; res();
    }, function () { res(); });
  });
}
function hitBuf(b, out, t, v, rate) { var s = playBuf(b, t, rate || 1), g = G(v); chain(s, g, out); return s; }

/* ======================================================================
   HUMAN VOICES: stylised formant "speech" (Middle-Chinese-ish syllables with tone contours)
   one glottal oscillator + one noise source + 3 formant filters per utterance, automated syllable by syllable
   ====================================================================== */
var CONS = ['', '', 'k', 't', 'p', 's', 'sh', 'h', 'm', 'n', 'l', 'ts', 'ng'], VOWS = ['a', 'a', 'o', 'u', 'e', 'i', 'uh', 'er'], CODA = ['', '', '', 'n', 'n', 'ng', 'k', 'm'];
var TONES = [[1, 0.97], [0.93, 1.1], [1.1, 0.86], [1.03, 1.0]];   // 平 上 去 入
function syl(o) {
  return { c: o.c != null ? o.c : pick(CONS), v: o.v || pick(VOWS), k: o.k != null ? o.k : pick(CODA), tn: o.tn || pick(TONES), d: o.d || R(0.13, 0.22), a: o.a == null ? R(0.75, 1) : o.a, f: o.f || 1, gap: o.gap || 0 };
}
/* P: {f0, fs (formant scale), syls:[], breath, lp, vol, vib, vibd, strain(distortion), jit} */
function utterGraph(out, t, P) {   // Web Audio graph version (kept for reference; utter() uses the faster JS synthesizer below)
  var S = P.syls, tot = 0, i; for (i = 0; i < S.length; i++) tot += S[i].d + S[i].gap;
  var end = t + tot + 0.35, f0 = P.f0, fs = P.fs || 1;
  var src = O('glottal', f0, t, end), vg = G(0), ng = G(0), hg = G(0), nn = noise(t, end - t, 'white'), nf = F('bandpass', 4000, 2);
  if (P.vib) { var lf = O('sine', P.vr || 5.5, t, end), lg = G(f0 * P.vib); chain(lf, lg, src.frequency); }
  var jl = O('sine', R(3, 4.5), t, end), jg = G(f0 * (P.jit || 0.006)); chain(jl, jg, src.frequency);
  src.connect(vg); chain(nn, nf, ng); var asp = F('highpass', 600, 0.5); chain(nn, asp, hg);
  var fb = [], fg = [], sum = G(1), Q = P.q || [7, 11, 14];
  for (i = 0; i < 3; i++) {
    fb[i] = F('bandpass', VOW.a[i] * fs, Q[i]); fg[i] = G(0);
    vg.connect(fb[i]); hg.connect(fb[i]); chain(fb[i], fg[i], sum);
  }
  var body = F('lowpass', 350, 0.7), bg = G(0.12); chain(vg, body, bg, sum);   // chest warmth
  ng.connect(sum);
  var last = sum;
  if (P.strain) { var sh = shaper(P.strain); last.connect(sh); last = sh; }
  var lp = F('lowpass', P.lp || 3500, 0.6), og = G((P.vol == null ? 0.5 : P.vol) * Math.pow(118 / f0, 0.6)); chain(last, lp, og, out);
  var tt = t, n = S.length, br = P.breath || 0.08;
  vg.gain.setValueAtTime(0, t);
  for (i = 0; i < n; i++) {
    var s = S[i], V = VOW[s.v] || VOW.a, A = VAMP[s.v] || VAMP.a, decl = 1 - 0.13 * (i / Math.max(1, n - 1)) * (P.decl == null ? 1 : P.decl);
    var cd = 0, amp = s.a, ff = f0 * decl * s.f;
    // consonant onset
    var c = s.c;
    if (c === 's' || c === 'sh' || c === 'ts') {
      if (c === 'ts') { ng.gain.setValueAtTime(0.25 * amp, tt); ng.gain.setTargetAtTime(0, tt + 0.008, 0.004); }
      nf.frequency.setValueAtTime(c === 'sh' ? 2900 : 5800, tt); nf.Q.setValueAtTime(c === 'sh' ? 2.2 : 3, tt);
      ng.gain.setTargetAtTime(0.32 * amp, tt + 0.005, 0.012); ng.gain.setTargetAtTime(0, tt + 0.06, 0.012); cd = 0.07;
    } else if (c === 'k' || c === 't' || c === 'p') {
      nf.frequency.setValueAtTime(c === 'k' ? 1900 : c === 't' ? 4200 : 900, tt + 0.025); nf.Q.setValueAtTime(1.2, tt + 0.025);
      ng.gain.setValueAtTime(0.5 * amp, tt + 0.025); ng.gain.setTargetAtTime(0, tt + 0.03, 0.006); cd = 0.035;
      hg.gain.setValueAtTime(0.25 * amp, tt + 0.03); hg.gain.setTargetAtTime(0, tt + 0.045, 0.01);
    } else if (c === 'h') {
      for (var k0 = 0; k0 < 3; k0++) fb[k0].frequency.setValueAtTime(V[k0] * fs, tt);
      hg.gain.setTargetAtTime(0.6 * amp, tt, 0.01); hg.gain.setTargetAtTime(0, tt + 0.05, 0.012); cd = 0.055;
    } else if (c === 'm' || c === 'n' || c === 'ng' || c === 'l') {
      var Nn = VOW[c === 'l' ? 'er' : c === 'm' ? 'm' : 'n'];
      for (k0 = 0; k0 < 3; k0++) { fb[k0].frequency.setValueAtTime(Nn[k0] * fs, tt); fg[k0].gain.setValueAtTime(k0 ? 0.08 : 0.8, tt); }
      vg.gain.setTargetAtTime(0.45 * amp, tt, 0.012); cd = 0.05;
    }
    // vowel: formants glide in, pitch follows the tone contour
    var tv = tt + cd, te = tt + s.d;
    for (var k = 0; k < 3; k++) {
      fb[k].frequency.setTargetAtTime(V[k] * fs * R(0.96, 1.04), tv, 0.018);
      fg[k].gain.setTargetAtTime(A[k] * [2.2, 4.5, 6][k] * (k === 2 ? (P.bright || 1) : 1), tv, 0.02);
    }
    src.frequency.setTargetAtTime(ff * s.tn[0], tt, 0.012);
    src.frequency.setTargetAtTime(ff * s.tn[1], tv + (te - tv) * 0.35, (te - tv) * 0.35);
    vg.gain.setTargetAtTime(amp, tv, 0.018);
    hg.gain.setTargetAtTime(br * amp, tv, 0.03);
    // coda / release
    var rel = s.k === 'k' ? 0.006 : 0.03, tr = te - (s.k === 'k' ? 0.02 : 0.06);
    if (s.k === 'n' || s.k === 'ng' || s.k === 'm') {
      var Nk = VOW[s.k === 'm' ? 'm' : 'n'];
      for (k = 0; k < 3; k++) { fb[k].frequency.setTargetAtTime(Nk[k] * fs, tr - 0.04, 0.02); fg[k].gain.setTargetAtTime(k ? 0.1 : 0.9, tr - 0.04, 0.02); }
      vg.gain.setTargetAtTime(amp * 0.5, tr - 0.04, 0.02);
    }
    var nextLinked = i < n - 1 && !s.gap && S[i + 1].c === '' ? 0.35 : 0;
    vg.gain.setTargetAtTime(amp * nextLinked, tr, rel); hg.gain.setTargetAtTime(0, tr, rel);
    tt = te + s.gap;
  }
  vg.gain.setTargetAtTime(0, tt, 0.03); hg.gain.setTargetAtTime(0, tt, 0.03);
  // breath tail (gentle)
  if (P.tail) { hg.gain.setTargetAtTime(P.tail, tt + 0.02, 0.05); hg.gain.setTargetAtTime(0, tt + 0.15, 0.08); }
  return end - t;
}
/* utterBuf: the same formant speech rendered directly in JS (parallel Klatt-style resonators, control rate 1.45 ms).
   Building a Web Audio graph per utterance turned out to cost 100+ ms of main thread; this costs a few ms. Returns an AudioBuffer (22.05 kHz). */
var USR = 22050;
function utterBuf(P) {
  var S = P.syls, tot = 0, i; for (i = 0; i < S.length; i++) tot += S[i].d + S[i].gap;
  var sr = USR, n = Math.ceil((tot + 0.4) * sr), x = new Float32Array(n), f0 = P.f0, fs = P.fs || 1, Q = P.q || [7, 11, 14];
  // event tracks (time, target, time-constant) — setTargetAtTime semantics
  var TR = {}; function ev(k, t, v, tc) { (TR[k] = TR[k] || []).push([t, v, Math.max(0.002, tc || 0.002)]); }
  var tt = 0, br = P.breath || 0.08;
  ev('av', 0, 0, 0.002); ev('ah', 0, 0, 0.002); ev('an', 0, 0, 0.002); ev('nf', 0, 4000, 0.002); ev('f0', 0, f0, 0.002);
  for (var k = 0; k < 3; k++) { ev('F' + k, 0, VOW.a[k] * fs, 0.002); ev('A' + k, 0, 0, 0.002); }
  for (i = 0; i < S.length; i++) {
    var s = S[i], V = VOW[s.v] || VOW.a, A = VAMP[s.v] || VAMP.a, decl = 1 - 0.13 * (i / Math.max(1, S.length - 1)) * (P.decl == null ? 1 : P.decl), cd = 0, amp = s.a, ff = f0 * decl * s.f, c = s.c;
    if (c === 's' || c === 'sh' || c === 'ts') { if (c === 'ts') { ev('an', tt, 0.25 * amp, 0.002); ev('an', tt + 0.008, 0, 0.004); } ev('nf', tt, c === 'sh' ? 2900 : 5800); ev('an', tt + 0.005, 0.32 * amp, 0.012); ev('an', tt + 0.06, 0, 0.012); cd = 0.07; }
    else if (c === 'k' || c === 't' || c === 'p') { ev('nf', tt + 0.025, c === 'k' ? 1900 : c === 't' ? 4200 : 900); ev('an', tt + 0.025, 0.5 * amp, 0.001); ev('an', tt + 0.03, 0, 0.006); ev('ah', tt + 0.03, 0.25 * amp, 0.002); ev('ah', tt + 0.045, 0, 0.01); cd = 0.035; }
    else if (c === 'h') { for (k = 0; k < 3; k++) ev('F' + k, tt, V[k] * fs); ev('ah', tt, 0.6 * amp, 0.01); ev('ah', tt + 0.05, 0, 0.012); cd = 0.055; }
    else if (c === 'm' || c === 'n' || c === 'ng' || c === 'l') { var Nn = VOW[c === 'l' ? 'er' : c === 'm' ? 'm' : 'n']; for (k = 0; k < 3; k++) { ev('F' + k, tt, Nn[k] * fs); ev('A' + k, tt, k ? 0.08 : 0.8); } ev('av', tt, 0.45 * amp, 0.012); cd = 0.05; }
    var tv = tt + cd, te = tt + s.d;
    for (k = 0; k < 3; k++) { ev('F' + k, tv, V[k] * fs * R(0.96, 1.04), 0.018); ev('A' + k, tv, A[k] * [2.2, 4.5, 6][k] * (k === 2 ? (P.bright || 1) : 1), 0.02); }
    ev('f0', tt, ff * s.tn[0], 0.012); ev('f0', tv + (te - tv) * 0.35, ff * s.tn[1], (te - tv) * 0.35);
    ev('av', tv, amp, 0.018); ev('ah', tv, br * amp, 0.03);
    var rel = s.k === 'k' ? 0.006 : 0.03, tr = te - (s.k === 'k' ? 0.02 : 0.06);
    if (s.k === 'n' || s.k === 'ng' || s.k === 'm') { var Nk = VOW[s.k === 'm' ? 'm' : 'n']; for (k = 0; k < 3; k++) { ev('F' + k, tr - 0.04, Nk[k] * fs, 0.02); ev('A' + k, tr - 0.04, k ? 0.1 : 0.9, 0.02); } ev('av', tr - 0.04, amp * 0.5, 0.02); }
    var linked = i < S.length - 1 && !s.gap && S[i + 1].c === '' ? 0.35 : 0;
    ev('av', tr, amp * linked, rel); ev('ah', tr, 0, rel);
    tt = te + s.gap;
  }
  ev('av', tt, 0, 0.03); ev('ah', tt, 0, 0.03);
  if (P.tail) { ev('ah', tt + 0.02, P.tail, 0.05); ev('ah', tt + 0.15, 0, 0.08); }
  var names = ['av', 'ah', 'an', 'nf', 'f0', 'F0', 'F1', 'F2', 'A0', 'A1', 'A2'], cur = {}, ptr = {}, tgt = {}, tcs = {};
  names.forEach(function (k) { var e = TR[k] || [[0, 0, 0.01]]; e.sort(function (a, b) { return a[0] - b[0]; }); TR[k] = e; ptr[k] = 0; cur[k] = e[0][1]; tgt[k] = e[0][1]; tcs[k] = e[0][2]; });
  var CR = 32, dtc = CR / sr, ph = 0, lpS = 0, body = 0, ny0 = 0, ny1 = 0, cA = [0, 0, 0], cB = [0, 0, 0], cC = [0, 0, 0], nA = 0, nB = 0, nC = 0;
  var y00 = 0, y01 = 0, y10 = 0, y11 = 0, y20 = 0, y21 = 0, s1 = 0, s2 = 0, w1 = 0, w2 = 0, ns = (rnd() * 2147483647) | 0, nk = names.length, KF = ['F0', 'F1', 'F2'];
  var vib = P.vib || 0, vr = P.vr || 5.5, jit = P.jit || 0.006, jr = R(3, 4.5), lpc = Math.exp(-2 * Math.PI * (P.lp || 3500) / sr), o1 = 0, o2 = 0, strain = P.strain || 0, sn = strain ? Math.tanh(strain) : 1;
  var gain = (P.vol == null ? 0.5 : P.vol) * Math.pow(118 / f0, 0.6) * 0.9, rr = rnd;
  for (var b0 = 0; b0 < n; b0 += CR) {
    var tc = b0 / sr;
    for (var q = 0; q < nk; q++) {
      var nm = names[q], E = TR[nm];
      while (ptr[nm] < E.length && E[ptr[nm]][0] <= tc) { tgt[nm] = E[ptr[nm]][1]; tcs[nm] = E[ptr[nm]][2]; ptr[nm]++; }
      cur[nm] += (tgt[nm] - cur[nm]) * (1 - Math.exp(-dtc / tcs[nm]));
    }
    for (k = 0; k < 3; k++) {   // resonator coefficients
      var F = Math.min(cur[KF[k]], sr * 0.45), bw = F / Q[k], r2 = Math.exp(-Math.PI * bw / sr);
      cB[k] = 2 * r2 * Math.cos(2 * Math.PI * F / sr); cC[k] = -r2 * r2; cA[k] = (1 - r2 * r2) * 0.5;   // constant-peak-gain bandpass (zero at DC), like a Web Audio bandpass
    }
    var nfF = Math.min(cur.nf, sr * 0.45), nr = Math.exp(-Math.PI * (nfF / 2.5) / sr); nB = 2 * nr * Math.cos(2 * Math.PI * nfF / sr); nC = -nr * nr; nA = (1 - nr * nr) * 0.5;
    var fz = cur.f0 * (1 + vib * Math.sin(2 * Math.PI * vr * tc) + jit * Math.sin(2 * Math.PI * jr * tc)), inc = fz / sr;
    var av = cur.av, ah = cur.ah * 0.25, an = cur.an, a0 = cur.A0, a1 = cur.A1, a2 = cur.A2, e = Math.min(n, b0 + CR), bv = 0.12 * av, ilp = 1 - lpc;
    var A0 = cA[0], B0 = cB[0], C0 = cC[0], A1 = cA[1], B1 = cB[1], C1 = cC[1], A2 = cA[2], B2 = cB[2], C2 = cC[2];
    for (var j = b0; j < e; j++) {
      ph += inc; if (ph >= 1) ph -= 1;
      lpS += (2 * ph - 1 - lpS) * 0.25;                            // saw -> one-pole: ~-12 dB/oct glottal-ish tilt
      ns = (Math.imul(ns, 1664525) + 1013904223) | 0; var w = ns * 4.656612873e-10;
      var src = lpS * av + w * ah, dx = src - s2; s2 = s1; s1 = src;
      body += (src - body) * 0.1;
      var r0 = A0 * dx + B0 * y00 + C0 * y01; y01 = y00; y00 = r0;
      var r1 = A1 * dx + B1 * y10 + C1 * y11; y11 = y10; y10 = r1;
      var r3 = A2 * dx + B2 * y20 + C2 * y21; y21 = y20; y20 = r3;
      var wx = w - w2; w2 = w1; w1 = w;
      var nyv = nA * wx + nB * ny0 + nC * ny1; ny1 = ny0; ny0 = nyv;
      var out = r0 * a0 + r1 * a1 + r3 * a2 + nyv * an + body * bv;
      if (strain) out = Math.tanh(out * strain) / sn;
      o1 = out * ilp + o1 * lpc; o2 = o1 * ilp + o2 * lpc;
      x[j] = o2 * gain;
    }
  }
  // loudness: normalise the voiced part to the kind's target level (dBFS rms)
  var ss = 0, cnt = 0; for (j = 0; j < n; j++) { var a = x[j]; if (a > 1e-4 || a < -1e-4) { ss += a * a; cnt++; } }
  var rms = Math.sqrt(ss / Math.max(1, cnt)), sc = rms > 1e-6 ? Math.pow(10, (P.target == null ? -30 : P.target) / 20) / rms : 0;
  for (j = 0; j < n; j++) x[j] *= sc;
  var bb = ac.createBuffer(1, n, sr); bb.getChannelData(0).set(x); return bb;
}
var UCACHE = {}, UCN = 0;
function utter(out, t, P, key) {   // play an utterance (cached by key when given)
  var b = key && UCACHE[key];
  if (!b) { b = utterBuf(P); if (key) { if (++UCN > 240) { UCACHE = {}; UCN = 0; } UCACHE[key] = b; } }
  playBuf(b, t, 1, out); return b.duration;
}
function phrase(n, o) { var a = []; for (var i = 0; i < n; i++) a.push(syl(o || {})); return a; }
var PENTA = [0, 2, 4, 7, 9, 12];
/* returns duration. kinds: murmur call shout laugh cry gasp hawk grunt pain sigh */
function speak(out, t, kind, p, dur, seed) {
  var r0 = rnd, me = seeded((seed == null ? (mathRnd() * 1e9) | 0 : seed) + 1);
  // per-speaker constants from the seed
  rnd = me; var f0m = R(0.9, 1.1), fsm = R(0.95, 1.06), brm = R(0.6, 1.4); rnd = r0;
  var pitch = p || 1, f0 = 118 * pitch * f0m, fs = (pitch > 1.15 ? 1.16 : pitch < 0.75 ? 1.3 : 1) * fsm, S, P = { f0: f0, fs: fs, breath: 0.07 * brm };
  if (pitch < 0.75) P.f0 = 260 * f0m;        // child
  else if (pitch > 1.15) P.f0 = 215 * f0m * pitch / 1.4;   // woman
  dur = dur || 0;
  if (kind === 'murmur') {
    var n = Math.max(3, Math.round((dur || R(1.2, 2.4)) * 4.6)); S = [];
    for (var i = 0; i < n; i++) { var s = syl({}); s.f = R(0.94, 1.07); if (i > 2 && rnd() < 0.18) s.gap = R(0.12, 0.28); S.push(s); }
    S[n - 1].d *= 1.5;
    P.syls = S; P.vol = 0.3; P.lp = 2800; P.bright = 0.6;
  } else if (kind === 'call') {
    S = phrase(1 + (rnd() * 2 | 0)); S.forEach(function (s) { s.f = 1.15; s.a = 0.9; });
    S.push(syl({ c: pick(['', 'h', 'l']), v: pick(['a', 'o', 'e']), k: '', tn: [1.12, 1.25], d: R(0.45, 0.7) }));
    if (rnd() < 0.5) S.push(syl({ c: '', v: 'a', k: '', tn: [1.2, 0.92], d: R(0.3, 0.5) }));
    P.syls = S; P.f0 *= 1.22; P.vol = 0.6; P.lp = 4500; P.vib = 0.012; P.decl = 0.3;
  } else if (kind === 'shout') {
    S = phrase(1 + (rnd() * 2 | 0), { a: 1 }); S.forEach(function (s) { s.f = 1.1; });
    S.push(syl({ c: pick(['h', 'k', '', 't']), v: pick(['a', 'a', 'o', 'e']), k: pick(['', 'k']), tn: [1.15, 0.95], d: R(0.4, 0.65), a: 1 }));
    P.syls = S; P.f0 *= 1.6; P.vol = 0.8; P.lp = 5200; P.strain = 1.8; P.jit = 0.012; P.bright = 1.4; P.decl = 0.2; P.q = [5, 8, 10];
  } else if (kind === 'laugh') {
    S = []; n = 4 + (rnd() * 5 | 0); var lv = pick(['a', 'e', 'a', 'o']);
    for (i = 0; i < n; i++) S.push({ c: 'h', v: lv, k: '', tn: [1.05, 0.95], d: R(0.12, 0.16), a: 1 - i * 0.06, f: 1.35 - i * 0.05, gap: 0 });
    P.syls = S; P.vol = 0.45; P.breath = 0.35; P.lp = 4000; P.decl = 0; P.tail = 0.5;
  } else if (kind === 'cry') {
    S = []; n = 2 + (rnd() * 2 | 0);
    for (i = 0; i < n; i++) { S.push({ c: i ? 'h' : '', v: pick(['a', 'u', 'uh']), k: '', tn: [1.3, 0.95], d: R(0.55, 0.9), a: 0.9, f: 1.2, gap: R(0.15, 0.3) }); S.push({ c: 'h', v: 'uh', k: '', tn: [1.2, 1.25], d: 0.1, a: 0.4, f: 1.3, gap: R(0.1, 0.2) }); }
    P.syls = S; P.vol = 0.5; P.vib = 0.03; P.vr = 6.5; P.breath = 0.25; P.lp = 3800; P.f0 *= 1.25; P.decl = 0.6;
  } else if (kind === 'gasp') {
    S = [{ c: 'h', v: 'a', k: '', tn: [1.3, 1.5], d: 0.22, a: 0.25, f: 1.3, gap: 0 }];
    P.syls = S; P.vol = 0.5; P.breath = 1.2; P.lp = 5000; P.decl = 0;
  } else if (kind === 'hawk') {   // vendor's sing-song cry, pentatonic, the last vowel held and let fall
    S = []; n = 3 + (rnd() * 4 | 0); var deg = rnd() * 3 | 0;
    for (i = 0; i < n; i++) { deg = clamp(deg + pick([-1, 1, 1, 2, -2]), 0, 5); var fr = Math.pow(2, PENTA[deg] / 12); S.push({ c: pick(['', 'm', 'l', 'h', 'k', 's', 'n']), v: pick(['a', 'o', 'a', 'e', 'i', 'u']), k: pick(['', '', 'n', 'ng']), tn: [1, 1], d: R(0.2, 0.34), a: 0.9, f: fr, gap: 0 }); }
    var ls = S[n - 1]; ls.d = R(0.8, 1.3); ls.tn = [1, 0.82]; ls.k = ''; ls.v = pick(['a', 'o', 'e']);
    P.syls = S; P.f0 *= 1.3; P.vol = 0.5; P.lp = 4200; P.vib = 0.01; P.decl = 0; P.bright = 1.1;
  } else if (kind === 'grunt') {
    P.syls = [{ c: '', v: 'uh', k: '', tn: [1.05, 0.8], d: R(0.12, 0.22), a: 1, f: 1, gap: 0 }]; P.vol = 0.55; P.strain = 1.5; P.breath = 0.4; P.lp = 2500;
  } else if (kind === 'pain') {
    P.syls = [{ c: pick(['', 'h']), v: pick(['a', 'e', 'uh']), k: '', tn: [1.35, 0.85], d: R(0.3, 0.55), a: 1, f: 1.3, gap: 0 }]; P.vol = 0.7; P.strain = 2.2; P.breath = 0.3; P.lp = 4500; P.jit = 0.02;
  } else {   // sigh
    P.syls = [{ c: 'h', v: 'a', k: '', tn: [1, 0.8], d: 0.6, a: 0.35, f: 0.95, gap: 0 }]; P.vol = 0.35; P.breath = 0.9; P.lp = 2500;
  }
  P.target = { murmur: -29, call: -22, shout: -17, laugh: -27, cry: -19, gasp: -34, hawk: -18, grunt: -24, pain: -17, sigh: -32 }[kind] + (pitch < 0.75 ? -2 : 0);
  rnd = me; var d; try { d = utter(out, t, P, seed != null && !OFF ? kind + '|' + Math.round(pitch * 20) + '|' + seed + '|' + (dur || 0) : null); } finally { rnd = r0; }
  return d;
}

/* ======================================================================
   FOOTSTEPS (baked: 8 variants x surface x walk/run; live synthesis until the bake is ready)
   Tang Chang'an streets are rammed loess (dusty), lanes dirt, temples and palaces brick/stone, roofs clay tile.
   ====================================================================== */
var SURF = ['dirt', 'stone', 'brick', 'wood', 'tile', 'grass', 'mud', 'water'];
function stepSynth(out, t, s, run) {
  var k = run ? 1.35 : 1, g = G(0.8 * k); g.connect(out);
  var toe = t + (run ? R(0.018, 0.03) : R(0.04, 0.07)), tv = run ? 0.75 : R(0.35, 0.55);
  if (s === 'dirt') {
    thump(g, t, R(70, 95), 42, 0.07, 0.32);
    nz(g, t, { c: 'pink', ft: 'lowpass', f: R(800, 1300), d: 0.07, v: 0.6 });
    nz(g, t, { c: 'pink', f: R(1800, 2600), q: 0.8, d: 0.025, v: 0.1 });
    crunch(g, t, { d: 0.07, dens: 900, f: 2200, pf: 3500, v: 0.24 });
    nz(g, toe, { c: 'pink', ft: 'lowpass', f: R(800, 1200), d: 0.05, v: 0.4 * tv });
    crunch(g, toe, { d: 0.06, dens: 700, f: 2500, pf: 4000, v: 0.1 * tv });
    if (run) nz(g, toe, { f: R(1200, 1800), q: 0.7, a: 0.015, d: 0.1, v: 0.18 });
  } else if (s === 'stone' || s === 'brick') {
    var st = s === 'stone';
    thump(g, t, st ? R(110, 130) : R(90, 105), 60, 0.05, 0.28);
    nz(g, t, { f: st ? R(2600, 3400) : R(1400, 1900), q: st ? 1.6 : 2.2, d: st ? 0.022 : 0.03, v: 0.65 });
    nz(g, t, { ft: 'highpass', f: st ? 2500 : 1500, d: 0.02, v: st ? 0.35 : 0.2 });
    if (!st) tone(g, t, { f: R(280, 340), d: 0.03, v: 0.08 });
    crunch(g, t, { d: 0.04, dens: 500, f: 3000, pf: 5000, v: 0.16 });
    nz(g, toe, { f: st ? R(2800, 3600) : R(1500, 2000), q: 1.6, d: 0.015, v: 0.32 * tv });
    if (run) nz(g, toe, { f: R(2500, 4000), q: 0.8, a: 0.01, d: 0.07, v: 0.15 });
  } else if (s === 'wood') {
    tone(g, t, { w: 'triangle', f: R(150, 200), f1: 105, d: 0.09, v: 0.45 });
    nz(g, t, { f: R(480, 700), q: 3, d: 0.07, v: 0.42 });
    nz(g, t, { f: R(2000, 2600), q: 1.5, d: 0.012, v: 0.2 });
    tone(g, toe, { w: 'triangle', f: R(180, 230), f1: 130, d: 0.06, v: 0.25 * tv });
    if (rnd() < 0.3) creak(g, toe + 0.02, { d: R(0.15, 0.3), r0: 45, r1: 25, f: R(500, 800), v: 0.12 });
  } else if (s === 'tile') {
    thump(g, t, R(140, 170), 85, 0.05, 0.4);
    metal(g, t, { f: R(1700, 2500), r: [1, 1.62, 2.43, 3.3], d: 0.06, dk: 0.6, v: 0.16 });
    crunch(g, t, { d: 0.05, dens: 600, f: 2500, pf: 4500, v: 0.25 });
    if (rnd() < 0.5) metal(g, toe, { f: R(2000, 3000), r: [1, 1.7, 2.6], d: 0.04, v: 0.1 * tv });
  } else if (s === 'grass') {
    thump(g, t, R(65, 80), 40, 0.06, 0.32);
    nz(g, t, { ft: 'highpass', f: R(2200, 3200), a: 0.012, d: 0.1, v: 0.22 });
    crunch(g, t, { d: 0.12, dens: 1600, sk: 1.2, f: 3000, pf: 5000, v: 0.12 });
    nz(g, toe, { ft: 'highpass', f: 3000, a: 0.01, d: 0.07, v: 0.14 * tv });
  } else if (s === 'mud') {
    thump(g, t, R(55, 70), 38, 0.08, 0.45);
    nz(g, t, { f: R(550, 700), f1: 220, q: 2.5, d: 0.14, v: 0.6 });
    bubbles(g, t + 0.02, { d: 0.18, n: 5, f: 320, v: 0.45 });
    nz(g, t + R(0.14, 0.2), { f: 900, f1: 1700, q: 3, a: 0.01, d: 0.06, v: 0.22 });     // suction as the foot lifts
  } else {   // water
    thump(g, t, R(75, 90), 50, 0.06, 0.2);
    nz(g, t, { f: R(1100, 1500), f1: 550, q: 1, a: 0.008, d: 0.18, v: 0.45 });
    nz(g, t, { ft: 'highpass', f: 3500, d: 0.09, v: 0.22 });
    bubbles(g, t + 0.01, { d: 0.28, n: 12, f: 800, v: 0.5 });
  }
  return 0.45;
}
function bakeSteps() {
  SURF.forEach(function (s) { [0, 1].forEach(function (run) { bakeSet('step_' + s + run, 6, 0.45, function (o, t) { stepSynth(o, t, s, run); }, 1, 32000); }); });
}
// one hoof strike (the player's horse, crowd horses / donkeys near the player): o {x,y,z (omit: under the listener), hard (stone/brick/paving), vol}
function playHoof(o) { o = o || {}; var oo = { x: o.x, y: o.y == null ? (o.x != null ? L.y - 1.5 : null) : o.y, z: o.z, vol: (o.vol == null ? 1 : o.vol) * 0.9, ref: 3, maxd: 60 };
  var pri = o.pri == null ? 0.7 : o.pri; if (!audible(oo) && !OFF) return; if (!steal(pri)) return; // (the rider's own horse: pri 1, never stolen by the crowd's)
  var v = voice(oo, o.hard ? 0.14 : 0.07); voices.push(v); v.pri = pri; var t = ac.currentTime + 0.003; hoof(v.in, t, o.hard ? 1 : 0, 1); v.t0 = t; v.end = t + 0.4; later(0.7, function () { free(v); }); }
function playStep(surface, o, at) {
  if (surface === 'hoof' || surface === 'hoofhard') { // the rider's horse: a hoof strike through the footstep path (same voice, bus and priority as the player's own steps)
    o = o || {}; var hh = surface === 'hoofhard' ? 1 : 0, oh = { x: o.x, y: o.y == null ? (o.x != null ? L.y - 1.5 : null) : o.y, z: o.z, vol: (o.vol == null ? 1 : o.vol), ref: 2, maxd: 60 };
    if (!audible(oh) && !OFF) return; if (!steal(0.9)) return; var vh = voice(oh, hh ? 0.12 : 0.06); voices.push(vh); vh.pri = 0.9;
    var th = Math.max(at || 0, ac.currentTime + 0.003); hoofSynth(vh.in, th, hh, 1.6); vh.t0 = th; vh.end = th + 0.4; later(0.7, function () { free(vh); }); return; }
  if (SURF.indexOf(surface) < 0) surface = 'dirt';
  o = o || {}; var run = o.run ? 1 : 0, cr = o.crouch ? 1 : 0;
  var oo = { x: o.x, y: o.y == null ? (o.x != null ? L.y - 1.5 : null) : o.y, z: o.z, vol: (o.vol == null ? 1 : o.vol) * (cr ? 0.4 : run ? 1.1 : 0.75), ref: 2, maxd: 45, cut: cr ? 2400 : null };
  if (!audible(oo) && !OFF) return;
  if (!steal(0.8)) return;
  var v = voice(oo, surface === 'stone' || surface === 'brick' ? 0.12 : 0.06); voices.push(v); v.pri = 0.8;
  var t = Math.max(at || 0, ac.currentTime + 0.003), b = baked('step_' + surface + run);
  if (b) hitBuf(b, v.in, t, 1, R(0.93, 1.07) * (cr ? 0.95 : 1)); else stepSynth(v.in, t, surface, run);
  v.t0 = t; v.end = t + 0.45; later(0.8, function () { free(v); });
}

/* ======================================================================
   SOUND EFFECTS (AU.sfx names)
   ====================================================================== */
/* ---------- blades & weapons ---------- */
def('sword_draw', function (c, out, t, q) {   // 橫刀 leaving a lacquered wooden scabbard: a rasp, then a ring
  var p = q.p, d = R(0.35, 0.45);
  nz(out, t, { f: 3500 * p, f1: 6500 * p, q: 4, a: d * 0.6, d: d * 0.4, v: 0.35 });
  nz(out, t, { c: 'pink', f: 1500 * p, q: 1.5, a: d * 0.5, d: d * 0.5, v: 0.25 });
  wood(out, t, { f: 900, d: 0.03, v: 0.2 });
  metal(out, t + d, { f: R(1900, 2200) * p, r: [1, 2.72, 5.1, 1.41], d: 1.1, dk: 0.7, v: 0.22 });
  return d + 1.2;
}, { rev: 0.15, pv: 0.05 });
def('sword_sheathe', function (c, out, t, q) {
  var p = q.p, d = 0.28; nz(out, t, { f: 5000 * p, f1: 2800 * p, q: 4, a: 0.05, d: d, v: 0.3 });
  wood(out, t + d, { f: 650 * p, d: 0.06, v: 0.5 }); metal(out, t + d, { f: 1500 * p, r: [1, 2.7], d: 0.15, v: 0.08 });
  return d + 0.3;
}, { rev: 0.1 });
def('sword_swing', function (c, out, t, q) {
  var p = q.p, d = 0.22 * R(0.85, 1.15); whoosh(out, t, d, 600 * p, 3200 * p, 1.3);
  nz(out, t, { f: 2200 * p, f1: 5200 * p, pt: d * 0.5, q: 9, a: d * 0.5, d: d * 0.4, v: 0.2 });
  return d + 0.1;
}, { rev: 0.06, pv: 0.12 });
def('heavy_swing', function (c, out, t, q) {   // 陌刀 / axe
  var p = q.p, d = 0.42; whoosh(out, t, d, 250 * p, 1500 * p, 0.9);
  nz(out, t, { c: 'brown', ft: 'lowpass', f: 450, a: d * 0.5, d: d * 0.5, v: 0.5 });
  return d + 0.15;
}, { rev: 0.08, pv: 0.1 });
var CLANG = [1, 2.31, 3.78, 5.12, 6.9, 1.08, 2.93];
def('sword_clash', function (c, out, t, q) {   // steel on steel
  var p = q.p, g = dbus(out, 1.6, 0.9);
  nz(g, t, { ft: 'highpass', f: 3000, d: 0.03, v: 0.9 });
  metal(g, t, { f: R(780, 950) * p, r: CLANG, d: 1.4, dk: 0.75, v: 0.85, det: 0.01 });
  metal(g, t + 0.004, { f: R(1150, 1400) * p, r: CLANG, d: 0.9, dk: 0.7, v: 0.45 });
  nz(g, t, { f: 6000, q: 0.7, a: 0.002, d: 0.25, v: 0.15 });
  thump(g, t, 260 * p, 120, 0.06, 0.4);
  return 1.6;
}, { rev: 0.22, pv: 0.06, pri: 2 });
def('sword_block', function (c, out, t, q) {   // blade caught on blade/guard: shorter, duller, scrape
  var p = q.p, g = dbus(out, 2, 0.8);
  metal(g, t, { f: R(600, 720) * p, r: CLANG, d: 0.45, dk: 0.6, v: 0.6 });
  thump(g, t, 200 * p, 80, 0.08, 0.6); nz(g, t, { c: 'brown', ft: 'lowpass', f: 2000, d: 0.08, v: 0.5 });
  nz(out, t + 0.02, { f: 4500 * p, f1: 2500, q: 5, a: 0.02, d: 0.15, v: 0.15 });
  return 0.6;
}, { rev: 0.15, pv: 0.06, pri: 2 });
def('parry', function (c, out, t, q) {   // a perfect deflection: bright ring with a long shimmering tail
  var p = q.p, g = dbus(out, 1.4, 1);
  nz(g, t, { ft: 'highpass', f: 3500, d: 0.02, v: 0.9 });
  metal(g, t, { f: 1240 * p, r: CLANG, d: 2.2, dk: 0.82, bend: 1.004, pt: 0.3, v: 0.8 });
  metal(g, t, { f: 620 * p, r: [1, 2.76, 5.4], d: 1.2, v: 0.35 });
  var sh = am(out, t, t + 2.5, 9, 0.5); nz(sh, t, { ft: 'highpass', f: 7000, a: 0.01, d: 1.2, v: 0.08 });
  return 2.5;
}, { rev: 0.35, pv: 0.03, pri: 3 });
def('hit_flesh', function (c, out, t, q) {   // blade into a body
  var p = q.p, g = dbus(out, 2.4, 0.75);
  thump(g, t, 160 * p, 50 * p, 0.15, 0.9);
  nz(g, t, { c: 'brown', ft: 'lowpass', f: 1600 * p, f1: 250, q: 2, d: 0.16, v: 0.8 });
  nz(g, t, { f: R(900, 1200) * p, f1: 300 * p, q: 3, d: 0.2, v: 0.55 });
  crunch(out, t + 0.003, { d: 0.1, dens: R(300, 600), f: 1400, v: 0.35 });
  bubbles(out, t + 0.02, { d: 0.3, n: 10, f: 450 * p, v: 0.35 });
  nz(out, t, { ft: 'highpass', f: 4000, d: 0.05, v: 0.25 });   // cloth
  return 0.5;
}, { rev: 0.1, pv: 0.12, pri: 2 });
def('staff_swish', function (c, out, t, q) {   // 棍: lower, rounder whoosh, a little wood rattle
  var p = q.p, d = 0.3 * R(0.85, 1.1); whoosh(out, t, d, 300 * p, 1400 * p, 1.2);
  nz(out, t, { c: 'brown', ft: 'lowpass', f: 500, a: d * 0.5, d: d * 0.5, v: 0.35 });
  return d + 0.1;
}, { rev: 0.06, pv: 0.12 });
def('spear_swish', function (c, out, t, q) {   // 槊/矛 thrust: short, tight
  var p = q.p, d = 0.16; whoosh(out, t, d, 900 * p, 3800 * p, 1.1);
  nz(out, t + d * 0.8, { f: 3000 * p, q: 6, d: 0.05, v: 0.12 }); return d + 0.1;
}, { rev: 0.05, pv: 0.12 });
def('staff_hit', function (c, out, t, q) {   // hardwood on body/wood
  var p = q.p, g = dbus(out, 2, 0.8);
  wood(g, t, { f: R(380, 460) * p, d: 0.1, v: 0.9 }); thump(g, t, 150 * p, 60, 0.12, 0.7);
  nz(g, t, { c: 'brown', ft: 'lowpass', f: 1300, d: 0.1, v: 0.5 }); return 0.4;
}, { rev: 0.12, pv: 0.1, pri: 2 });
def('spear_hit', function (c, out, t, q) {
  var p = q.p; sfxIn('hit_flesh', out, t, { pitch: 1.15 * p });
  metal(out, t, { f: 1500 * p, r: CLANG, d: 0.12, v: 0.15 }); return 0.5;
}, { rev: 0.1, pv: 0.1, pri: 2 });
def('punch', function (c, out, t, q) {
  var p = q.p; thump(out, t, 120 * p, 55, 0.1, 0.9); nz(out, t, { c: 'pink', ft: 'lowpass', f: 1800 * p, d: 0.06, v: 0.8 });
  nz(out, t, { ft: 'highpass', f: 3000, d: 0.02, v: 0.3 }); return 0.25;
}, { rev: 0.08, pv: 0.12 });
def('kick', function (c, out, t, q) {
  var p = q.p; whoosh(out, t, 0.12, 400 * p, 1200 * p, 0.5);
  thump(out, t + 0.1, 95 * p, 45, 0.14, 1); nz(out, t + 0.1, { c: 'brown', ft: 'lowpass', f: 1400, d: 0.1, v: 0.9 });
  nz(out, t + 0.1, { ft: 'highpass', f: 2500, d: 0.03, v: 0.3 }); return 0.4;
}, { rev: 0.08, pv: 0.1 });
def('body_fall', function (c, out, t, q) {
  var p = q.p, g = dbus(out, 2, 0.8);
  thump(g, t, 85 * p, 35, 0.25, 1); nz(g, t, { c: 'brown', ft: 'lowpass', f: 900, f1: 150, d: 0.3, v: 0.9 });
  crunch(out, t, { d: 0.25, dens: 600, f: 1500, v: 0.3 });
  thump(g, t + R(0.18, 0.28), 110 * p, 50, 0.12, 0.5); nz(g, t + 0.25, { c: 'pink', ft: 'lowpass', f: 1200, d: 0.12, v: 0.4 });
  nz(out, t, { ft: 'highpass', f: 3500, a: 0.01, d: 0.25, v: 0.15 });   // cloth
  return 0.8;
}, { rev: 0.12, pv: 0.08 });
def('bow_draw', function (c, out, t, q) {   // composite bow: creak of horn and sinew, string tension
  var p = q.p; creak(out, t, { d: 0.8, r0: 25, r1: 70, f: 900 * p, v: 0.3 }); creak(out, t + 0.1, { d: 0.6, r0: 40, r1: 90, f: 1800 * p, v: 0.08 });
  nz(out, t, { f: 2500, q: 1, a: 0.3, d: 0.4, v: 0.06 }); return 1;
}, { rev: 0.06 });
def('bow_release', function (c, out, t, q) {
  var p = q.p; tone(out, t, { w: 'triangle', f: 110 * p, f1: 95 * p, d: 0.25, v: 0.5 }); tone(out, t, { f: 220 * p, d: 0.12, v: 0.25 });
  nz(out, t, { f: 900, q: 2, d: 0.05, v: 0.6 }); thump(out, t, 160, 80, 0.06, 0.4);
  whoosh(out, t + 0.02, 0.25, 2000 * p, 5000 * p, 0.25); return 0.5;
}, { rev: 0.1, pv: 0.06 });
def('crossbow_crank', function (c, out, t, q) {   // 弩: spanning with a ratchet/foot stirrup
  var p = q.p, n = 6, tt = t;
  for (var i = 0; i < n; i++) { wood(out, tt, { f: R(1300, 1500) * p, d: 0.025, v: 0.4 }); metal(out, tt, { f: 2600 * p, r: [1, 2.3], d: 0.03, v: 0.1 }); tt += R(0.11, 0.15); }
  creak(out, t, { d: tt - t, r0: 30, r1: 60, f: 700 * p, v: 0.15 }); wood(out, tt + 0.05, { f: 800 * p, d: 0.05, v: 0.6 });
  return tt - t + 0.2;
}, { rev: 0.08 });
def('crossbow_release', function (c, out, t, q) {   // bronze trigger 機 snaps, a hard string slap
  var p = q.p; metal(out, t, { f: 2200 * p, r: [1, 2.4, 3.9], d: 0.06, v: 0.35 }); nz(out, t, { ft: 'highpass', f: 2500, d: 0.02, v: 0.6 });
  tone(out, t + 0.005, { w: 'triangle', f: 160 * p, f1: 120, d: 0.15, v: 0.6 }); thump(out, t, 200, 70, 0.08, 0.7);
  whoosh(out, t + 0.01, 0.18, 2500, 6000, 0.3); return 0.4;
}, { rev: 0.1, pv: 0.05 });
def('arrow_fly', function (c, out, t, q) {   // whizz past
  var p = q.p, d = 0.35; nz(out, t, { f: 2500 * p, f1: 1200 * p, q: 3, a: d * 0.45, d: d * 0.5, v: 0.4 });
  tone(out, t, { f: 900 * p, f1: 700 * p, a: d * 0.45, d: d * 0.5, v: 0.03 }); return d + 0.1;
}, { rev: 0.05 });
def('arrow_hit_wood', function (c, out, t, q) {
  var p = q.p; wood(out, t, { f: R(700, 850) * p, d: 0.06, v: 0.8 }); nz(out, t, { ft: 'highpass', f: 2500, d: 0.02, v: 0.5 });
  tone(out, t + 0.005, { w: 'triangle', f: 210 * p, d: 0.35, v: 0.12 }); var a = am(out, t, t + 0.4, 28, 0.9); tone(a, t, { f: 420 * p, d: 0.3, v: 0.12 });   // shaft quiver
  return 0.5;
}, { rev: 0.12, pv: 0.08 });
def('arrow_hit_flesh', function (c, out, t, q) {
  var p = q.p; thump(out, t, 180 * p, 70, 0.08, 0.7); nz(out, t, { f: 900 * p, f1: 300, q: 3, d: 0.1, v: 0.6 }); nz(out, t, { ft: 'highpass', f: 3000, d: 0.02, v: 0.3 });
  return 0.3;
}, { rev: 0.08, pv: 0.1 });
def('arrow_hit_earth', function (c, out, t, q) {
  var p = q.p; thump(out, t, 120 * p, 50, 0.06, 0.6); nz(out, t, { c: 'pink', ft: 'lowpass', f: 1200, d: 0.06, v: 0.6 });
  crunch(out, t, { d: 0.12, dens: 700, f: 1500, v: 0.3 }); var a = am(out, t, t + 0.3, 30, 0.9); tone(a, t, { f: 380 * p, d: 0.25, v: 0.08 });
  return 0.4;
}, { rev: 0.1, pv: 0.1 });
def('grunt', function (c, out, t, q) { return speak(out, t, 'grunt', q.pitch || 1, 0, q.seed); }, { rev: 0.08, pv: 0 });
def('pain', function (c, out, t, q) { return speak(out, t, 'pain', q.pitch || 1, 0, q.seed); }, { rev: 0.1, pv: 0 });
def('death', function (c, out, t, q) {
  var d = speak(out, t, 'pain', (q.pitch || 1) * 0.95, 0, q.seed); speak(out, t + d * 0.6, 'sigh', (q.pitch || 1) * 0.9, 0, (q.seed || 1) + 7); return d + 1;
}, { rev: 0.12, pv: 0 });

/* ---------- doors, gates, house ---------- */
def('door_open', function (c, out, t, q) {   // plank door on wooden pivots (no metal hinges)
  var p = q.p; wood(out, t, { f: 500 * p, d: 0.05, v: 0.4 }); creak(out, t + 0.05, { d: R(0.6, 0.9), r0: 25, r1: 60, f: R(450, 650) * p, v: 0.45 });
  nz(out, t + 0.05, { c: 'brown', ft: 'lowpass', f: 400, a: 0.2, d: 0.5, v: 0.3 }); return 1.1;
}, { rev: 0.2, pv: 0.06 });
def('door_close', function (c, out, t, q) {
  var p = q.p; creak(out, t, { d: 0.35, r0: 50, r1: 30, f: R(450, 650) * p, v: 0.3 });
  thump(out, t + 0.35, 95 * p, 45, 0.18, 0.9); wood(out, t + 0.35, { f: 220 * p, d: 0.12, v: 0.6 }); nz(out, t + 0.35, { c: 'brown', ft: 'lowpass', f: 1200, d: 0.15, v: 0.6 });
  wood(out, t + 0.5, { f: 900 * p, d: 0.03, v: 0.15 }); return 0.9;
}, { rev: 0.2, pv: 0.06 });
def('door_knock', function (c, out, t, q) {
  var p = q.p, n = 2 + (rnd() * 2 | 0); for (var i = 0; i < n; i++) { wood(out, t + i * 0.22, { f: R(240, 280) * p, d: 0.1, v: 0.7 }); thump(out, t + i * 0.22, 120, 70, 0.06, 0.4); }
  return n * 0.22 + 0.3;
}, { rev: 0.2 });
def('gate_creak', function (c, out, t, q) {   // great ward gate leaf: iron-shod pivot grinding in a stone socket
  var p = q.p, d = R(3, 3.8);
  creak(out, t + 0.1, { d: d, r0: 12, r1: 26, f: 260 * p, v: 0.7 }); creak(out, t + 0.4, { d: d * 0.6, r0: 25, r1: 50, f: 520 * p, v: 0.25 });
  var s = noise(t, d + 0.5, 'brown'), f = F('lowpass', 300 * p, 2), g = G(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.5); g.gain.setValueAtTime(0.6, t + d - 0.3); g.gain.linearRampToValueAtTime(0, t + d); chain(s, f, g, out);
  thump(out, t + d, 55 * p, 28, 0.6, 1); nz(out, t + d, { c: 'brown', ft: 'lowpass', f: 900, f1: 90, d: 0.6, v: 0.8 }); wood(out, t + d, { f: 120, d: 0.3, v: 0.5 });
  return d + 1.5;
}, { rev: 0.4, pv: 0.03, ref: 6, maxd: 260 });
def('gate_bar', function (c, out, t, q) {   // heavy timber bar dropped into its brackets
  var p = q.p; nz(out, t, { c: 'pink', f: 700, q: 1, a: 0.1, d: 0.3, v: 0.25 }); wood(out, t + 0.35, { f: 180 * p, d: 0.25, v: 0.9 });
  thump(out, t + 0.35, 75 * p, 35, 0.35, 0.75); wood(out, t + 0.5, { f: 240 * p, d: 0.12, v: 0.4 }); nz(out, t + 0.35, { c: 'brown', ft: 'lowpass', f: 1500, d: 0.2, v: 0.6 });
  return 1.4;
}, { rev: 0.4, pv: 0.03, ref: 6, maxd: 220 });
def('shutter', function (c, out, t, q) {   // lattice / 直欞窗 board shutter
  var p = q.p; wood(out, t, { f: 650 * p, d: 0.04, v: 0.4 }); creak(out, t + 0.03, { d: 0.3, r0: 60, r1: 30, f: 900 * p, v: 0.2 });
  wood(out, t + 0.3, { f: 420 * p, d: 0.07, v: 0.6 }); rattleW(out, t + 0.32, 3, 0.12, 1100 * p, 0.12); return 0.6;
}, { rev: 0.15, pv: 0.06 });
function rattleW(out, t, n, span, f, v) { for (var i = 0; i < n; i++) wood(out, t + Math.pow(rnd(), 1.2) * span, { f: f * R(0.8, 1.3), d: 0.03, v: v * R(0.5, 1) }); }
def('coins', function (c, out, t, q) {   // strung 開元通寶 bronze cash
  var n = 3 + (rnd() * 5 | 0); for (var i = 0; i < n; i++) metal(out, t + Math.pow(rnd(), 1.4) * 0.3, { f: R(2400, 3400) * q.p, r: [1, 1.48, 2.2, 2.95], d: 0.16, dk: 0.7, v: R(0.1, 0.22) });
  nz(out, t, { ft: 'highpass', f: 5000, d: 0.04, v: 0.12 }); thump(out, t + 0.02, 180, 100, 0.04, 0.2); return 0.6;
}, { rev: 0.1, pv: 0.06 });
def('pickup', function (c, out, t, q) {
  nz(out, t, { ft: 'highpass', f: 3000, a: 0.02, d: 0.12, v: 0.2 }); wood(out, t + 0.05, { f: 700 * q.p, d: 0.05, v: 0.35 });
  zhong(out, t + 0.08, { f: 1568 * q.p, d: 0.7, v: 0.12 }); return 0.9;
}, { rev: 0.12, pv: 0.03 });
def('ui_select', function (c, out, t, q) { wood(out, t, { f: 1700 * q.p, d: 0.025, v: 0.35 }); return 0.1; }, { rev: 0, pv: 0.02, ui: 1 });
def('ui_confirm', function (c, out, t, q) { wood(out, t, { f: 1300, d: 0.03, v: 0.25 }); qing(out, t + 0.03, { f: 1046.5, d: 0.8, v: 0.25 }); qing(out, t + 0.12, { f: 1568, d: 0.9, v: 0.15 }); return 1; }, { rev: 0.1, pv: 0, ui: 1 });
def('ui_back', function (c, out, t, q) { wood(out, t, { f: 1500, d: 0.03, v: 0.3 }); wood(out, t + 0.07, { f: 1050, d: 0.04, v: 0.3 }); return 0.25; }, { rev: 0.05, pv: 0, ui: 1 });
def('ui_scroll', function (c, out, t, q) {   // a paper scroll unrolled across a table
  var d = R(0.55, 0.75); wood(out, t, { f: 600, d: 0.04, v: 0.3 });
  crunch(out, t, { d: d, dens: 900, sk: 1, f: 1800, pf: 3500, v: 0.25 }); nz(out, t, { c: 'pink', f: 2500, q: 0.7, a: d * 0.3, d: d * 0.7, v: 0.18 });
  wood(out, t + d, { f: 380, d: 0.06, v: 0.4 }); return d + 0.2;
}, { rev: 0.05, ui: 1 });
def('ui_page', function (c, out, t, q) { crunch(out, t, { d: 0.2, dens: 1200, sk: 1, f: 2000, pf: 4000, v: 0.2 }); nz(out, t, { c: 'pink', f: 3000, q: 0.7, a: 0.05, d: 0.15, v: 0.12 }); return 0.3; }, { rev: 0, ui: 1 });

/* ---------- body / movement ---------- */
def('jump', function (c, out, t, q) { nz(out, t, { c: 'pink', f: 500, f1: 1400, a: 0.03, d: 0.1, v: 0.3 }); nz(out, t, { ft: 'highpass', f: 3500, a: 0.02, d: 0.1, v: 0.1 }); return 0.25; }, { rev: 0.03 });
def('land_dirt', function (c, out, t, q) {
  thump(out, t, 90, 35, 0.15, 0.9); nz(out, t, { c: 'brown', ft: 'lowpass', f: 1100, f1: 200, d: 0.18, v: 0.6 });
  crunch(out, t, { d: 0.15, dens: 900, f: 2000, v: 0.25 }); nz(out, t + 0.02, { c: 'pink', ft: 'lowpass', f: 700, a: 0.03, d: 0.3, v: 0.12 });   // dust
  return 0.5;
}, { rev: 0.06 });
def('land_tile', function (c, out, t, q) {
  thump(out, t, 140, 70, 0.1, 0.8); crunch(out, t, { d: 0.18, dens: 800, f: 2500, pf: 4500, v: 0.4 });
  for (var i = 0; i < 4; i++) metal(out, t + R(0, 0.15), { f: R(1700, 2700), r: [1, 1.62, 2.43], d: R(0.04, 0.09), v: R(0.08, 0.18) });
  return 0.5;
}, { rev: 0.08 });
def('tile_clatter', function (c, out, t, q) {   // a loose roof tile slides and knocks: the stealth noise
  var tt = t, n = 4 + (rnd() * 4 | 0);
  crunch(out, t, { d: 0.35, dens: 500, sk: 1, f: 2000, pf: 4000, v: 0.3 });
  for (var i = 0; i < n; i++) { metal(out, tt, { f: R(1500, 2600) * q.p, r: [1, 1.62, 2.43, 3.4], d: R(0.05, 0.12), v: R(0.15, 0.3) * (1 - i / n * 0.5) }); thump(out, tt, R(130, 180), 80, 0.04, 0.25); tt += R(0.05, 0.16); }
  if (rnd() < 0.5) { sfxIn('pottery_break', out, tt + 0.5, { pitch: 1.2, vol: 0.5 }); tt += 1; }
  return tt - t + 0.5;
}, { rev: 0.25, pv: 0.05, ref: 4, maxd: 90 });
def('climb', function (c, out, t, q) {   // hands on timber/plaster, cloth, a scrape
  var p = q.p; nz(out, t, { ft: 'highpass', f: 2500, a: 0.04, d: 0.2, v: 0.2 }); thump(out, t, 120 * p, 70, 0.05, 0.4);
  crunch(out, t + 0.05, { d: 0.2, dens: 600, f: 1800, v: 0.2 }); nz(out, t + 0.1, { c: 'pink', f: 900, q: 1, a: 0.05, d: 0.2, v: 0.2 }); return 0.4;
}, { rev: 0.05, pv: 0.1 });
def('splash', function (c, out, t, q) {
  var p = q.p; thump(out, t, 90 * p, 40, 0.2, 0.6); nz(out, t, { c: 'pink', f: 1200 * p, f1: 500, q: 0.8, d: 0.4, v: 0.8 });
  nz(out, t, { ft: 'highpass', f: 3000, a: 0.005, d: 0.25, v: 0.35 }); bubbles(out, t + 0.03, { d: 0.6, n: 30, f: 700 * p, v: 0.6 });
  for (var i = 0; i < 6; i++) nz(out, t + R(0.2, 0.8), { f: R(1500, 3500), q: 2, d: 0.03, v: 0.1 });
  return 1.1;
}, { rev: 0.15, pv: 0.1 });
def('pottery_break', function (c, out, t, q) {   // glazed jar / 長沙窯 bowl shatters
  var p = q.p; nz(out, t, { ft: 'highpass', f: 2500, d: 0.03, v: 0.9 }); thump(out, t, 180 * p, 80, 0.08, 0.5);
  metal(out, t, { f: R(1100, 1500) * p, r: [1, 1.63, 2.39, 3.21], d: 0.3, dk: 0.6, v: 0.3 });
  crunch(out, t, { d: 0.5, dens: 800, sk: 1.5, f: 2500, pf: 5000, v: 0.5 });
  for (var i = 0; i < 14; i++) metal(out, t + Math.pow(rnd(), 1.6) * 0.8, { f: R(2000, 5000) * p, r: [1, 1.6, 2.5], d: R(0.04, 0.15), v: R(0.05, 0.16) });
  return 1.1;
}, { rev: 0.2, pv: 0.08, ref: 4 });
def('fire_crackle', function (c, out, t, q) {
  var n = 5 + (rnd() * 8 | 0); for (var i = 0; i < n; i++) { var tt = t + Math.pow(rnd(), 0.8) * 1.2; nz(out, tt, { ft: 'highpass', f: R(1500, 4000), d: R(0.004, 0.015), v: R(0.2, 0.7) }); }
  nz(out, t, { c: 'brown', ft: 'lowpass', f: 400, a: 0.3, d: 0.9, v: 0.3 }); return 1.4;
}, { rev: 0.1 });
def('cup_clink', function (c, out, t, q) { metal(out, t, { f: R(2100, 2600) * q.p, r: [1, 1.71, 2.6, 3.8], d: 0.35, dk: 0.6, v: 0.25 }); thump(out, t, 300, 200, 0.02, 0.1); return 0.5; }, { rev: 0.12, pv: 0.1 });
def('pour', function (c, out, t, q) { var d = R(0.8, 1.3); bubbles(out, t, { d: d, n: 40, f: 900 * q.p, v: 0.5 }); nz(out, t, { c: 'pink', f: 1500, f1: 900, q: 1, a: 0.1, d: d, v: 0.25 }); return d + 0.2; }, { rev: 0.1 });
def('cloth', function (c, out, t, q) { nz(out, t, { ft: 'highpass', f: 2200, a: 0.05, d: 0.18, v: 0.18 }); crunch(out, t, { d: 0.2, dens: 800, sk: 1, f: 2500, v: 0.08 }); return 0.3; }, { rev: 0.03, pv: 0.1 });
def('eat', function (c, out, t, q) { for (var i = 0; i < 3; i++) crunch(out, t + i * 0.28, { d: 0.12, dens: 900, f: 1500, v: 0.3 }); return 1; }, { rev: 0.03 });

/* ---------- animals ---------- */
function hoof(out, t, hard, v) { var b = baked('hoof' + (hard ? 1 : 0)); if (b) hitBuf(b, out, t, v, R(0.92, 1.08)); else hoofSynth(out, t, hard, v); }
function hoofSynth(out, t, hard, v) {   // one hoof: hard = stone/brick street, else packed earth
  if (hard) { wood(out, t, { f: R(650, 850), d: 0.04, v: v * 0.7 }); wood(out, t + 0.004, { f: R(1300, 1700), d: 0.025, v: v * 0.45 }); thump(out, t, R(150, 190), 90, 0.05, v * 0.6); nz(out, t, { f: R(2500, 3500), q: 1.5, d: 0.015, v: v * 0.35 }); }
  else { thump(out, t, R(110, 140), 60, 0.07, v * 0.8); wood(out, t + 0.003, { f: R(800, 1100), d: 0.035, v: v * 0.45 }); nz(out, t, { c: 'pink', ft: 'lowpass', f: R(1400, 2000), d: 0.05, v: v * 0.55 }); crunch(out, t, { d: 0.05, dens: 900, f: 2600, v: v * 0.22 }); }
  // (the 'clop' — a woody knock at ~1 kHz and a grit burst — carries on small speakers; the thump alone, at 110–190 Hz, did not)
}
var GAIT = { walk: [[0, 1], [0.26, 0.8], [0.52, 0.95], [0.78, 0.75]], trot: [[0, 1], [0.03, 0.6], [0.34, 0.95], [0.37, 0.55]], gallop: [[0, 0.8], [0.09, 0.9], [0.17, 1], [0.22, 0.6]] };
var GAITLEN = { walk: 1.04, trot: 0.68, gallop: 0.46 };
function gaitCycle(out, t, gait, hard, v) { GAIT[gait].forEach(function (h) { hoof(out, t + h[0] * R(0.97, 1.03), hard, v * h[1] * R(0.85, 1.1)); }); return GAITLEN[gait]; }
['walk', 'trot', 'gallop'].forEach(function (g) {
  def('hooves_' + g, function (c, out, t, q) { var tt = t, n = q.n || (g === 'walk' ? 2 : 3); for (var i = 0; i < n; i++) tt += gaitCycle(out, tt, g, q.hard, 0.8); return tt - t + 0.2; }, { rev: 0.15, pv: 0.03, ref: 4, maxd: 160 });
});
def('horse_snort', function (c, out, t, q) {
  var p = q.p, d = R(0.4, 0.7), a = am(out, t, t + d + 0.1, R(25, 40), 0.7, 'sawtooth');
  nz(a, t, { c: 'pink', f: 700 * p, f1: 400 * p, q: 1.5, a: 0.03, d: d, v: 0.9 }); nz(out, t, { c: 'brown', ft: 'lowpass', f: 300, a: 0.02, d: d * 0.8, v: 0.4 });
  return d + 0.2;
}, { rev: 0.12, pv: 0.08, ref: 4 });
def('horse_neigh', function (c, out, t, q) {   // whinny: high squeal falling, nickers
  var p = q.p, d = R(0.9, 1.2);
  voxf(out, t, { f: 900 * p, f1: 520 * p, vowel: 'i', vowel1: 'a', a: 0.05, h: d * 0.3, d: d * 0.7, v: 0.35, vib: 0.06, vr: 11, fry: 40, dist: 2.5, noise: 0.25, fs: 1.3 });
  var tt = t + d; for (var i = 0; i < 4; i++) { voxf(out, tt, { f: (360 - i * 30) * p, f1: (300 - i * 30) * p, vowel: 'e', vowel1: 'uh', a: 0.01, d: 0.1, v: 0.25 - i * 0.04, fry: 35, dist: 2, noise: 0.3 }); tt += 0.11; }
  return tt - t + 0.3;
}, { rev: 0.2, pv: 0.05, ref: 5, maxd: 200 });
def('donkey_bray', function (c, out, t, q) {   // hee-haw
  var p = q.p, n = 3 + (rnd() * 3 | 0), tt = t;
  for (var i = 0; i < n; i++) {
    voxf(out, tt, { f: 820 * p, f1: 900 * p, vowel: 'i', a: 0.04, d: 0.28, v: 0.32, dist: 2, noise: 0.5, fry: 50 }); tt += 0.32;
    voxf(out, tt, { f: 240 * p, f1: 200 * p, vowel: 'a', vowel1: 'o', a: 0.03, h: 0.15, d: 0.25, v: 0.5, dist: 3, fry: 30, noise: 0.2 }); tt += 0.42;
  }
  return tt - t + 0.3;
}, { rev: 0.25, pv: 0.05, ref: 6, maxd: 260 });
def('ox_low', function (c, out, t, q) {
  var p = q.p, d = R(1.3, 2);
  voxf(out, t, { f: 115 * p, f1: 92 * p, vowel: 'u', vowel1: 'uh', a: 0.25, h: d * 0.4, d: d * 0.6, v: 0.6, fry: 28, noise: 0.08, fs: 0.75, q: 6 });
  return d + 0.4;
}, { rev: 0.25, pv: 0.05, ref: 6, maxd: 220 });
def('camel_grunt', function (c, out, t, q) {   // a Bactrian of the Sogdian caravans: gurgling groan
  var p = q.p, d = R(0.9, 1.4);
  voxf(out, t, { f: 75 * p, f1: 60 * p, vowel: 'o', vowel1: 'uh', a: 0.1, h: d * 0.3, d: d * 0.7, v: 0.6, fry: 22, frw: 'sawtooth', dist: 3, noise: 0.15, fs: 0.7 });
  bubbles(out, t + 0.1, { d: d, n: 25, f: 220, v: 0.35 });
  return d + 0.3;
}, { rev: 0.2, pv: 0.06, ref: 5 });
def('dog_bark', function (c, out, t, q) {
  var n = q.n || (1 + (rnd() * 3 | 0)), tt = t, p = q.p;
  for (var i = 0; i < n; i++) { voxf(out, tt, { f: R(380, 470) * p, f1: 280 * p, vowel: 'a', vowel1: 'uh', fry: 60, dist: 3, a: 0.008, d: 0.13, v: 0.65, noise: 0.3 }); nz(out, tt, { f: 1500, q: 1, d: 0.03, v: 0.2 }); tt += R(0.25, 0.45); }
  return tt - t + 0.3;
}, { rev: 0.25, pv: 0.06, ref: 5, maxd: 300 });
def('dog_growl', function (c, out, t, q) {
  var p = q.p, d = R(1, 1.6);
  voxf(out, t, { f: 95 * p, f1: 105 * p, vowel: 'u', vowel1: 'uh', fry: 26, frw: 'sawtooth', dist: 2.5, a: 0.15, h: d * 0.5, d: d * 0.5, v: 0.5, noise: 0.35, fs: 1.2, vib: 0.05, vr: 3 });
  return d + 0.3;
}, { rev: 0.06, pv: 0.06, ref: 3 });
def('chicken', function (c, out, t, q) {
  var p = q.p, n = 2 + (rnd() * 4 | 0), tt = t;
  for (var i = 0; i < n; i++) { voxf(out, tt, { f: R(420, 560) * p, f1: R(380, 480) * p, vowel: 'a', vowel1: 'uh', a: 0.008, d: 0.07, v: 0.35, fs: 1.5, fry: 70, dist: 1.5 }); tt += R(0.12, 0.3); }
  if (rnd() < 0.4) { voxf(out, tt, { f: 650 * p, f1: 900 * p, vowel: 'a', a: 0.02, d: 0.35, v: 0.35, fs: 1.6, dist: 2, vib: 0.03, vr: 14 }); tt += 0.4; }
  return tt - t + 0.2;
}, { rev: 0.15, pv: 0.06, ref: 3 });
def('rooster', function (c, out, t, q) {
  var p = q.p, seg = [[520, 560, 0.14], [700, 760, 0.16], [780, 800, 0.22], [760, 600, 0.6]], tt = t;
  seg.forEach(function (s, i) { voxf(out, tt, { f: s[0] * p, f1: s[1] * p, vowel: i === 3 ? 'o' : 'a', vowel1: i === 3 ? 'u' : null, a: 0.02, h: s[2] * 0.5, d: s[2] * 0.6, v: 0.4, fs: 1.6, dist: 2.2, vib: i === 3 ? 0.03 : 0, vr: 9, noise: 0.15 }); tt += s[2] + 0.02; });
  return tt - t + 0.4;
}, { rev: 0.3, pv: 0.05, ref: 6, maxd: 400 });
def('crow', function (c, out, t, q) {   // 烏: caw
  var n = 1 + (rnd() * 3 | 0), tt = t;
  for (var i = 0; i < n; i++) { voxf(out, tt, { f: R(480, 560) * q.p, f1: 420 * q.p, vowel: 'a', vowel1: 'uh', fry: 85, frw: 'sawtooth', dist: 4, a: 0.02, d: 0.24, v: 0.42, noise: 0.4, fs: 1.15 }); tt += R(0.35, 0.55); }
  return tt - t + 0.3;
}, { rev: 0.35, pv: 0.05, ref: 5, maxd: 400 });
def('magpie', function (c, out, t, q) {   // 喜鵲: dry rattling chatter
  var p = q.p, n = 6 + (rnd() * 8 | 0), tt = t, rate = R(11, 14);
  for (var i = 0; i < n; i++) { nz(out, tt, { f: R(1800, 2400) * p, q: 3, d: 0.03, v: 0.5 }); tone(out, tt, { f: R(1400, 1700) * p, f1: 1100 * p, d: 0.035, v: 0.08 }); tt += 1 / rate * R(0.9, 1.1); }
  return tt - t + 0.2;
}, { rev: 0.2, pv: 0.05, ref: 4, maxd: 200 });
def('sparrow', function (c, out, t, q) {   // 麻雀 chirps
  var p = q.p, n = 2 + (rnd() * 5 | 0), tt = t;
  for (var i = 0; i < n; i++) { var f = R(3500, 5200) * p; tone(out, tt, { f: f, f1: f * R(0.65, 1.25), pt: 0.05, a: 0.004, d: R(0.04, 0.07), v: R(0.12, 0.25) }); tone(out, tt, { f: f * 2, f1: f * 1.6, a: 0.004, d: 0.03, v: 0.03 }); tt += R(0.08, 0.25); }
  return tt - t + 0.2;
}, { rev: 0.15, pv: 0.05, ref: 3, maxd: 120 });
def('cicada', function (c, out, t, q) {   // 蟬 (black cicada): a swelling buzz, 5-10 s
  var bc = !q.dur && !OFF && baked('cicada'); if (bc) { var rr = R(0.95, 1.05) * q.p; hitBuf(bc, out, t, 0.5, rr); return bc.duration / rr; }
  var p = q.p, d = q.dur || R(5, 9), f = R(4300, 5600) * p, rate = R(70, 110);
  var a = am(out, t, t + d + 0.5, rate, 0.55, 'sine'), g = G(0); g.connect(a);
  var n1 = noise(t, d + 0.5, 'white'), b1 = F('bandpass', f, 6), b2 = F('bandpass', f * 1.9, 5), g2 = G(0.3); chain(n1, b1, g); chain(n1, b2, g2, g);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + d * 0.35); g.gain.linearRampToValueAtTime(0.4, t + d * 0.6); g.gain.linearRampToValueAtTime(0, t + d);
  var lf = O('sine', R(0.6, 1.2), t, t + d + 0.5), lg = G(f * 0.03); chain(lf, lg, b1.frequency);
  return d + 0.6;
}, { rev: 0.15, pv: 0.03, ref: 4, maxd: 100 });
def('cricket', function (c, out, t, q) {
  var p = q.p, f = R(4200, 4900) * p, n = 4 + (rnd() * 6 | 0), tt = t, per = R(0.35, 0.6);
  for (var i = 0; i < n; i++) { for (var k = 0; k < 3; k++) tone(out, tt + k * 0.032, { f: f, a: 0.003, d: 0.02, v: 0.18 }); tt += per; }
  return tt - t + 0.2;
}, { rev: 0.12, pv: 0.02, ref: 3, maxd: 60 });
def('frog', function (c, out, t, q) {   // 蛙: gua-gua
  var p = q.p, n = 2 + (rnd() * 3 | 0), tt = t;
  for (var i = 0; i < n; i++) { voxf(out, tt, { f: R(110, 150) * p, vowel: 'a', vowel1: 'o', a: 0.01, d: 0.16, v: 0.4, fry: R(45, 70), frw: 'square', fs: 1.1, q: 5 }); tt += R(0.22, 0.32); }
  return tt - t + 0.2;
}, { rev: 0.15, pv: 0.05, ref: 3, maxd: 90 });
def('horse_pass', function (c, out, t, q) { var tt = t; for (var i = 0; i < 5; i++) tt += gaitCycle(out, tt, 'trot', q.hard, 0.7); return tt - t + 0.2; }, { rev: 0.2, ref: 5, maxd: 300, hide: 1 });

/* ---------- temple, crafts, city work ---------- */
def('temple_bell', function (c, out, t, q) {   // great bronze bell (cf. 景雲鐘, 711): struck by a beam; ~14 s
  var p = q.p, f0 = R(62, 66) * p, g = G(0.55); g.connect(out);
  var b = baked('bigbell'); if (b && !q.pitch) hitBuf(b, g, t, 1.3); else bigBell(g, t, f0, 1, 1.9);
  return 22;
}, { rev: 0.45, pv: 0.01, pri: 4, ref: 20, maxd: 3000, far: 1 });
def('wind_bell', function (c, out, t, q) {   // 風鐸: bronze bells hanging from pagoda eaves, stirred by the wind
  var n = 1 + (rnd() * 3 | 0), tt = t; for (var i = 0; i < n; i++) { zhong(out, tt, { f: pick([1180, 1325, 1490, 1770]) * q.p, d: 2.5, v: R(0.15, 0.3) }); tt += R(0.15, 0.6); }
  return tt - t + 2.6;
}, { rev: 0.4, pv: 0.01, ref: 6, maxd: 300 });
def('bell_small', function (c, out, t, q) { zhong(out, t, { f: R(700, 900) * q.p, d: 3, v: 0.4 }); return 3.2; }, { rev: 0.4, pv: 0.02, ref: 4 });
def('muyu', function (c, out, t, q) {   // 木魚 wooden fish
  var p = q.p; tone(out, t, { f: 620 * p, f1: 575 * p, pt: 0.05, d: 0.18, v: 0.6 }); tone(out, t, { f: 1350 * p, d: 0.045, v: 0.15 });
  nz(out, t, { f: 1300 * p, q: 2.5, d: 0.02, v: 0.55 }); return 0.3;
}, { rev: 0.3, pv: 0.01 });
def('chant', function (c, out, t, q) {   // a few monks reciting together on one tone, wooden fish keeping time
  var n = 10 + (rnd() * 6 | 0), sd = 0.3, base = 1 + (q.seed || 0) % 3, S = [];
  for (var i = 0; i < n; i++) S.push({ c: pick(['', 'n', 'm', 's', 'p', 'k', 't', 'l']), v: pick(['a', 'o', 'u', 'e', 'i', 'uh']), k: pick(['', 'n', 'm', 'ng']), tn: [1, 1], d: sd, a: 0.9, f: i === n - 1 ? 0.89 : 1, gap: 0 });
  S[n - 1].d = 1.2;
  for (var v = 0; v < 4; v++) utter(out, t + R(0, 0.02), { f0: 98 * R(0.985, 1.015) * (v === 3 ? 0.5 : 1), fs: R(0.95, 1.05), syls: S, target: v === 3 ? -34 : -30, lp: 2400, breath: 0.05, decl: 0, jit: 0.004 });
  for (i = 0; i < n; i++) sfxIn('muyu', out, t + i * sd, { pitch: 1 });
  return n * sd + 1.6;
}, { rev: 0.4, pv: 0, ref: 5 });
def('anvil', function (c, out, t, q) {   // smith: a heavy blow on hot iron then two light taps on the anvil face
  var p = q.p, ba = !OFF && !q.live && baked('anvil'); if (ba) { hitBuf(ba, out, t, 1, p); return 1.2; }
  metal(out, t, { f: R(1050, 1200) * p, r: [1, 2.62, 4.1, 5.7, 1.5], d: 0.5, dk: 0.7, v: 0.55 }); thump(out, t, 170, 90, 0.06, 0.6); nz(out, t, { ft: 'highpass', f: 2500, d: 0.03, v: 0.6 });
  metal(out, t + 0.32, { f: 1720 * p, r: [1, 2.62, 4.1], d: 0.6, v: 0.3 }); metal(out, t + 0.5, { f: 1720 * p, r: [1, 2.62, 4.1], d: 0.6, v: 0.22 });
  return 1.2;
}, { rev: 0.25, pv: 0.02, ref: 5, maxd: 200 });
def('saw', function (c, out, t, q) {   // two-man frame saw: four strokes
  var p = q.p, n = 4, tt = t;
  for (var i = 0; i < n; i++) { var d = R(0.35, 0.45), a = am(out, tt, tt + d + 0.05, R(45, 70), 0.75, 'sawtooth'); nz(a, tt, { f: (i % 2 ? 2600 : 3200) * p, q: 1.5, a: d * 0.3, h: d * 0.3, d: d * 0.4, v: 0.5 }); nz(out, tt, { c: 'pink', f: 700, q: 1, a: d * 0.3, d: d * 0.6, v: 0.12 }); tt += d + 0.04; }
  return tt - t + 0.1;
}, { rev: 0.2, pv: 0.04, ref: 4 });
def('plane', function (c, out, t, q) { var d = R(0.45, 0.6); nz(out, t, { ft: 'highpass', f: 2200 * q.p, a: 0.03, h: d * 0.6, d: d * 0.4, v: 0.3 }); crunch(out, t, { d: d, dens: 1500, sk: 1, f: 2500, pf: 4500, v: 0.25 }); wood(out, t, { f: 500, d: 0.04, v: 0.25 }); return d + 0.1; }, { rev: 0.15, ref: 3 });
def('adze', function (c, out, t, q) { var p = q.p; wood(out, t, { f: R(320, 400) * p, d: 0.09, v: 0.9 }); nz(out, t, { ft: 'highpass', f: 2000, d: 0.03, v: 0.6 }); thump(out, t, 140, 70, 0.08, 0.6); crunch(out, t + 0.01, { d: 0.1, dens: 600, f: 1800, v: 0.3 }); return 0.4; }, { rev: 0.2, pv: 0.08, ref: 4, maxd: 160 });
def('mill', function (c, out, t, q) {   // stone hand-mill / donkey mill: grinding rumble, one turn
  var d = 2.6, s = noise(t, d + 0.2, 'brown'), lp = F('lowpass', 220, 1.2), g = G(0); chain(s, lp, g, out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.4); g.gain.setValueAtTime(0.7, t + d - 0.5); g.gain.linearRampToValueAtTime(0, t + d);
  crunch(out, t, { d: d, dens: 300, sk: 1, f: 700, pf: 1500, v: 0.35 }); creak(out, t + 0.2, { d: d - 0.4, r0: 8, r1: 12, f: 300, v: 0.25 });
  return d + 0.2;
}, { rev: 0.15, ref: 4 });
def('loom', function (c, out, t, q) {   // treadle loom: shed change, shuttle throw, beater clack
  var p = q.p; wood(out, t, { f: 420 * p, d: 0.06, v: 0.4 }); nz(out, t + 0.15, { f: 2500, f1: 1500, q: 1.2, a: 0.03, d: 0.15, v: 0.25 });
  wood(out, t + 0.45, { f: 300 * p, d: 0.1, v: 0.75 }); thump(out, t + 0.45, 130, 70, 0.08, 0.5); wood(out, t + 0.62, { f: 360 * p, d: 0.06, v: 0.4 });
  return 0.9;
}, { rev: 0.15, pv: 0.02, ref: 4 });
def('sizzle', function (c, out, t, q) {   // 胡餅 dough slapped onto the oven wall, fat sizzling
  var d = R(1.5, 2.2); thump(out, t, 160, 90, 0.04, 0.4); nz(out, t, { c: 'pink', ft: 'lowpass', f: 1200, d: 0.05, v: 0.4 });
  nz(out, t + 0.05, { ft: 'highpass', f: 3500, a: 0.1, d: d, v: 0.25 }); crunch(out, t + 0.05, { d: d, dens: 400, sk: 1, f: 3000, pf: 6000, v: 0.3 });
  return d + 0.2;
}, { rev: 0.1, ref: 3 });
def('cart', function (c, out, t, q) {   // ox-cart wheel turning on its axle: creak + rumble
  var p = q.p, d = R(1.8, 2.4); creak(out, t, { d: d * 0.7, r0: 10, r1: 22, f: R(300, 420) * p, v: 0.45 });
  nz(out, t, { c: 'brown', ft: 'lowpass', f: 350, a: 0.3, h: d * 0.4, d: d * 0.4, v: 0.45 }); crunch(out, t, { d: d, dens: 120, sk: 1, f: 900, v: 0.25 });
  wood(out, t + d * 0.6, { f: 220, d: 0.1, v: 0.3 }); return d + 0.3;
}, { rev: 0.18, pv: 0.05, ref: 5, maxd: 180 });
def('clapper', function (c, out, t, q) {   // 柝: the watchman's two hardwood sticks
  var p = q.p, n = q.n || 3, tt = t;
  for (var i = 0; i < n; i++) { wood(out, tt, { f: R(1180, 1260) * p, d: 0.08, v: 0.85 }); nz(out, tt, { f: 3000, q: 2, d: 0.012, v: 0.4 }); tt += i === n - 2 ? 0.3 : 0.75; }
  return tt - t + 0.3;
}, { rev: 0.45, pv: 0.01, ref: 6, maxd: 400 });
function zhengHit(out, t, f, v) {   // 鉦: a flat bronze gong struck with a padded stick — steady pitch, long shimmering ring, no opera bend
  var P = [[1, 1, 4.5], [1.003, 0.5, 4], [1.52, 0.45, 3.2], [2.03, 0.4, 2.6], [2.64, 0.28, 2], [3.31, 0.18, 1.5], [4.12, 0.1, 1.1], [5.01, 0.06, 0.8]];
  P.forEach(function (q) { tone(out, t, { f: f * q[0] * R(0.998, 1.002), a: 0.006 + rnd() * 0.004, d: q[2], v: v * q[1] * 0.32 }); });   // the 1/1.003 pair beats slowly
  tone(out, t, { f: f * 0.5, a: 0.01, d: 1.2, v: v * 0.08 });
  nz(out, t, { f: 1200, q: 1.2, a: 0.003, d: 0.03, v: v * 0.08 });   // padded stick
}
def('zheng_hit', function (c, out, t, q) { zhengHit(out, t, R(370, 400) * q.p, 0.6); return 5; }, { rev: 0.35, pv: 0.02, ref: 10, maxd: 1500, far: 1 });
def('drum_hit', function (c, out, t, q) { var b = baked('drum_street'); if (b) hitBuf(b, out, t, 0.9, R(0.97, 1.03) * q.p); else tdrum(out, t, { f: 80 * q.p, d: 1.2, v: 0.9 }); return 1.8; }, { rev: 0.4, pv: 0.03, ref: 12, maxd: 3000, far: 1 });
def('alarm', function (c, out0, t, q) {   // guards raising the alarm: shouts, the 鉦 beaten fast, a drum roll
  var out = G(0.55); out.connect(out0);
  for (var i = 0; i < 4; i++) speak(out, t + i * R(0.35, 0.6), 'shout', R(0.95, 1.1), 0, (q.seed || 9) * 7 + i);
  for (i = 0; i < 10; i++) zhengHit(out, t + 0.3 + i * 0.28, 385, 0.4);
  for (i = 0; i < 14; i++) drum(out, t + 0.5 + i * 0.16, { f: 80, d: 0.5, v: 0.5 * (0.6 + i / 20), hard: 0.6 });
  return 4;
}, { rev: 0.3, pv: 0, pri: 4, ref: 8, maxd: 600 });
var FARPH = [['e4', 'g4', 'a4', 'b4', 'a4', 'g4', 'e4'], ['b4', 'd5', 'e5', 'd5', 'b4', 'a4'], ['a4', 'b4', 'd5', 'b4', 'a4', 'g4', 'e4', 'g4'], ['d5', 'b4', 'a4', 'g4', 'a4', 'b4']];
def('far_music', function (c, out, t, q) {   // a 琵琶 phrase (sometimes with a 拍板) from a house or wine shop
  var ph = pick(FARPH), sd = R(0.22, 0.3), tr = pick([0, 2, -3, 5]), lp = F('lowpass', 2500, 0.6), g = G(1); chain(g, lp, out);
  ph.forEach(function (n, i) { var tt = t + i * sd * (i === ph.length - 1 ? 1 : R(0.92, 1.08)); INST.pipa(g, tt, [mtof(parseNote(n)[0] + tr)], i === ph.length - 1 ? 0.8 : sd, R(0.6, 0.9), {}, i === ph.length - 1 && rnd() < 0.5 ? { vib: 1 } : {}); });
  if (rnd() < 0.5) for (var i = 0; i < ph.length; i += 2) DR.p(g, t + i * sd, 0.5);
  return ph.length * sd + 2;
}, { rev: 0.4, pv: 0, ref: 4, maxd: 300 });
def('wind_gust', function (c, out, t, q) {
  var p = q.p, d = R(2.2, 3.5), n = nz(out, t, { c: 'pink', f: 300 * p, f1: 900 * p, pt: d * 0.45, q: 1.2, a: d * 0.45, d: d * 0.55, v: 0.5 });
  n.f.frequency.exponentialRampToValueAtTime(380 * p, t + d);
  nz(out, t, { ft: 'highpass', f: 3000, a: d * 0.5, d: d * 0.5, v: 0.06 });   // leaves
  crunch(out, t + d * 0.3, { d: d * 0.6, dens: 300, sk: 1, f: 2500, v: 0.12 });
  return d + 0.2;
}, { rev: 0.2, pv: 0.1 });
def('thunder', function (c, out, t, q) {
  var p = q.p, g = G(1), lp = F('lowpass', q.near ? 4000 : 1200, 0.7); chain(g, lp, out);
  if (q.near) { nz(g, t, { ft: 'highpass', f: 1500, d: 0.15, v: 0.9 }); crunch(g, t, { d: 0.4, dens: 900, f: 800, v: 0.6 }); }
  var tt = t + (q.near ? 0.05 : R(0.3, 0.8));
  for (var i = 0; i < 4; i++) { nz(g, tt, { c: 'brown', ft: 'lowpass', f: R(150, 400), a: R(0.05, 0.4), d: R(1, 2.5), v: R(0.5, 1) }); tt += R(0.3, 1.2); }
  thump(g, t + 0.1, 50 * p, 25, 2, 0.6);
  return tt - t + 2.5;
}, { rev: 0.5, pv: 0.1, pri: 4 });
def('rain_drip', function (c, out, t, q) { var f = R(900, 2400) * q.p; tone(out, t, { f: f, f1: f * 1.6, pt: 0.03, d: 0.05, v: 0.3 }); return 0.15; }, { rev: 0.3, pv: 0.1 });

/* ======================================================================
   BAKED LOOP BEDS (crowd walla, cricket chorus...): rendered once, crossfaded into seamless loops
   ====================================================================== */
function bakeLoop(key, len, xf, ch, chunks) {   // chunks(out, t, tot) -> [fn, fn, ...] built one per time slice
  if (BK[key] || !OCX || OFF) return;
  var e = BK[key] = { b: null }, sr = 32000, off, tot = len + xf;
  try { off = new OCX(ch, Math.ceil(tot * sr), sr); } catch (x) { return; }
  var M1 = { nb: M.nb, ks: M.ks, ksn: 0, cp: M.cp }, res, list;
  bakePend.push(new Promise(function (r) { res = r; }));
  inCtx(off, M1, function () { list = chunks(off.destination, 0, tot); });
  list.forEach(function (f, i) { var g = function () { inCtx(off, M1, f); }; g._k = key + '#' + i; bq(g); });
  bq(function () {
    return off.startRendering().then(function (b) {
      var n = Math.floor(len * sr), nx = Math.floor(xf * sr), bb = ac.createBuffer(ch, n, sr);
      for (var c = 0; c < ch; c++) {
        var s = b.getChannelData(c), d = bb.getChannelData(c);
        for (var i = 0; i < n; i++) d[i] = s[i];
        for (i = 0; i < nx; i++) { var u = i / nx; d[i] = s[i] * Math.sqrt(u) + s[n + i] * Math.sqrt(1 - u); }
      }
      e.b = [bb]; res();
    }, function () { res(); });
  });
}
function panned(out, pan) { var p = ac.createStereoPanner(); p.pan.value = pan; p.connect(out); return p; }
function crowdBed(out, t, tot, n, far) {   // n utterances of many speakers spread around; returns chunk builders
  var L2 = [];
  if (!far) for (var c0 = 0; c0 < 4; c0++) L2.push(function () {   // shuffling feet, cloth, the odd knock: the crowd moving
    var pn = panned(out, R(-1, 1)), g = G(0.5), lp = F('lowpass', 2500, 0.5); chain(g, lp, pn);
    for (var tt = t + R(0, 0.5); tt < t + tot; tt += R(0.15, 0.6)) {
      var k = rnd(); if (k < 0.7) { nz(g, tt, { c: 'pink', ft: 'lowpass', f: R(600, 1100), d: 0.06, v: R(0.04, 0.1) }); crunch(g, tt, { d: 0.05, dens: 700, f: 2200, v: R(0.02, 0.05) }); }
      else if (k < 0.9) nz(g, tt, { ft: 'highpass', f: 2500, a: 0.04, d: 0.15, v: R(0.01, 0.03) });
      else wood(g, tt, { f: R(300, 900), d: 0.05, v: R(0.03, 0.07) });
    }
  });
  for (var c = 0; c < n; c += 4) L2.push(function () {
    for (var i = 0; i < 4; i++) {
      var pn = panned(out, R(-1, 1)), lp = F('lowpass', far ? R(500, 900) : R(1400, 3200), 0.5), g = G(far ? R(0.3, 0.6) : R(0.2, 0.7)); chain(g, lp, pn);
      var k = far && rnd() < 0.1 ? 'call' : 'murmur', p = pick([1, 1, 1, 1.4, 1.4, 0.65, 0.85, 1.15]);   // no laughs in the loop: they would be heard repeating
      speak(g, t + R(0, tot - 1), k, p, R(1, 2.6), (rnd() * 1e6) | 0);
    }
  });
  return L2;
}
function crickets(out, t, tot) {   // a chorus of field crickets, each with its own rate and pitch
  var L2 = [];
  for (var c = 0; c < 9; c++) L2.push(function () {
    var f = R(4100, 5000), per = R(0.3, 0.7), pn = panned(out, R(-1, 1)), g = G(R(0.15, 0.5)); g.connect(pn);
    var tt = t + R(0, per), np = 2 + (rnd() * 3 | 0);
    while (tt < t + tot) { if (rnd() < 0.9) for (var k = 0; k < np; k++) tone(g, tt + k * 0.03, { f: f, a: 0.003, d: 0.018, v: 0.2 }); tt += per * R(0.97, 1.03); }
  });
  return L2;
}
function frogs(out, t, tot) {
  var L2 = [];
  for (var c = 0; c < 6; c++) L2.push(function () {
    var pn = panned(out, R(-1, 1)), g = G(R(0.2, 0.5)), tt = t + R(0, 2), f = R(100, 160); g.connect(pn);
    while (tt < t + tot) { var n = 2 + (rnd() * 3 | 0); for (var i = 0; i < n; i++) { voxf(g, tt, { f: f, vowel: 'a', vowel1: 'o', a: 0.01, d: 0.14, v: 0.35, fry: R(45, 70), frw: 'square', fs: 1.1, q: 5 }); tt += R(0.22, 0.3); } tt += R(1.5, 4); }
  });
  return L2;
}
function bakeBeds() {
  bakeLoop('crowd_near', 11, 1.5, 2, function (o, t, tot) { return crowdBed(o, t, tot, 64, 0); });
  bakeLoop('crickets', 9, 1, 2, function (o, t, tot) { return crickets(o, t, tot); });
  bakeLoop('crowd_far', 14, 2, 2, function (o, t, tot) { return crowdBed(o, t, tot, 48, 1); });
  bakeLoop('frogs', 12, 1.5, 2, function (o, t, tot) { return frogs(o, t, tot); });
}
function bakeHits() {
  bakeSet('drum_palace', 3, 2.4, function (o, t, i) { tdrum(o, t, { f: 64 + i * 2, d: 1.5, v: 0.9, stick: 0.3 + i * 0.1 }); }, 1, 24000);
  bakeSet('drum_street', 5, 2, function (o, t, i) { tdrum(o, t, { f: 78 + i * 3, d: 1.2, v: 0.9, stick: 0.35 + (i % 3) * 0.15 }); }, 1, 24000);
  bakeSet('drum_ward', 4, 1.8, function (o, t, i) { tdrum(o, t, { f: 92 + i * 4, d: 1, v: 0.9, stick: 0.5 + (i % 2) * 0.15 }); }, 1, 24000);
  bakeSet('zheng', 3, 5, function (o, t, i) { zhengHit(o, t, 372 + i * 9, 0.7); }, 1, 32000);
  bakeSet('bigbell', 1, 24, function (o, t) { bigBell(o, t, 64, 1, 1.9); }, 1, 24000);
  bakeSet('hoof0', 6, 0.3, function (o, t) { hoofSynth(o, t, 0, 1); }); bakeSet('hoof1', 6, 0.3, function (o, t) { hoofSynth(o, t, 1, 1); });
  bakeSet('anvil', 3, 1.3, function (o, t) { sfxIn('anvil', o, t, { live: 1 }); }, 1, 32000);
  bakeSet('cicada', 4, 9, function (o, t, i) { sfxIn('cicada', o, t, { dur: 7 + i * 0.5, pitch: 0.94 + i * 0.04 }); }, 1, 32000);
}

/* ======================================================================
   LOOP EMITTERS (AU.loop): positional, culled by distance (max 12 active), started/stopped automatically
   loopDefs[name] = {rev, ref, maxd, vol, fn(out, t, h) -> optional {ev(t) -> next time}}
   ====================================================================== */
var emitters = {}, MAXLOOPS = 12;
function lp1(out, t, c, ft, f, q, v, rate) { var s = noise(t, null, c, rate), fl = F(ft, f, q), g = G(v); chain(s, fl, g, out); return { s: s, f: fl, g: g }; }
function wander(param, t, depth, rate) { var m = noise(t, null, 'brown', rate || 0.05), g = G(depth); chain(m, g, param); }
function crackleL(out, t, dens, f, v) {
  var key = 'crk' + dens; if (!M.cp[key]) M.cp[key] = [crunchBuf(4, dens, 1, true)];
  var cs = playBuf(M.cp[key][0], t, 1, null, true, null, R(0, 3.5)), hp = F('highpass', f, 0.7), cg = G(v); chain(cs, hp, cg, out); return cs;
}
function bedBuf(key, out, t, v, rate) { var b = baked(key); if (!b) return null; var s = playBuf(b, t, rate || 1, null, true, null, R(0, b.duration)), g = G(v); chain(s, g, out); return g; }
function every(lo, hi, f) { return function (t) { f(t); return t + R(lo, hi); }; }
loopDefs.fire = { rev: 0.1, ref: 3, maxd: 40, fn: function (out, t) {
  var w = lp1(out, t, 'brown', 'lowpass', 450, 0.8, 0.18); wander(w.g.gain, t, 0.12, 0.08);
  crackleL(out, t, 90, 1500, 0.4); lp1(out, t, 'white', 'bandpass', 3000, 0.5, 0.03);
  return { ev: every(0.8, 3, function (tt) { sfxIn('fire_crackle', out, tt, { vol: 0.4 }); }) };
} };
loopDefs.water = { rev: 0.12, ref: 3, maxd: 40, fn: function (out, t) {
  var w = lp1(out, t, 'pink', 'lowpass', 1100, 0.7, 0.25); wander(w.f.frequency, t, 400, 0.1);
  var b = playBuf(bubBuf(3, 120, 900), t, 1, null, true), g = G(0.35); chain(b, g, out);
} };
loopDefs.wind = { rev: 0.2, ref: 5, maxd: 80, fn: function (out, t) { var w = lp1(out, t, 'pink', 'bandpass', 500, 1.2, 0.6); wander(w.f.frequency, t, 300, 0.04); wander(w.g.gain, t, 0.5, 0.03); } };
loopDefs.crowd = { rev: 0.2, ref: 6, maxd: 90, fn: function (out, t, h) {
  if (!bedBuf('crowd_near', out, t, 0.5, R(0.96, 1.04))) lp1(out, t, 'pink', 'bandpass', 600, 0.8, 0.03);
  return { ev: every(0.5, 2.2, function (tt) { var a = R(0, 6.3), r = R(1, 5), o = { x: h.o.x + Math.cos(a) * r, z: h.o.z + Math.sin(a) * r, y: h.o.y, vol: 0.7 }; if (!OFF) AU.voice(o.x, o.y, o.z, { kind: rnd() < 0.12 ? 'laugh' : 'murmur', pitch: pick([1, 1.4, 0.9, 1.2]) }); }) };
} };
loopDefs.market = { outdoor: 1, rev: 0.25, ref: 15, maxd: 220, fn: function (out, t, h) {
  if (!bedBuf('crowd_near', out, t, 0.6, R(0.97, 1.03))) lp1(out, t, 'pink', 'bandpass', 600, 0.8, 0.04);
  bedBuf('crowd_far', out, t + 0.5, 0.4, 1);
  return { ev: every(0.6, 2, function (tt) { var a = R(0, 6.3), r = R(2, 14), x = h.o.x + Math.cos(a) * r, z = h.o.z + Math.sin(a) * r;
    var k = rnd(); if (k < 0.35) oneshotAt('voice:hawk', x, z, tt, R(0.5, 0.8)); else if (k < 0.5) oneshotAt('coins', x, z, tt, 0.5); else if (k < 0.6) oneshotAt('voice:laugh', x, z, tt, 0.5); else if (k < 0.66) oneshotAt('donkey_bray', x, z, tt, 0.4); else oneshotAt('voice:call', x, z, tt, 0.5); }) };
} };
loopDefs.wineshop = { rev: 0.25, ref: 5, maxd: 60, fn: function (out, t, h) {   // interior bed: talk, laughter, cups, pouring
  if (!bedBuf('crowd_near', out, t, 0.45, R(0.98, 1.02))) lp1(out, t, 'pink', 'bandpass', 600, 0.8, 0.03);
  return { ev: every(0.4, 1.6, function (tt) { var k = rnd(); var a = R(0, 6.3), r = R(1, 4), x = h.o.x + Math.cos(a) * r, z = h.o.z + Math.sin(a) * r;
    if (k < 0.25) oneshotAt('voice:laugh', x, z, tt, R(0.5, 0.9)); else if (k < 0.5) oneshotAt('cup_clink', x, z, tt, 0.5); else if (k < 0.58) oneshotAt('pour', x, z, tt, 0.4); else if (k < 0.66) oneshotAt('voice:call', x, z, tt, 0.4); else oneshotAt('voice:murmur', x, z, tt, 0.6); }) };
} };
loopDefs.smithy = { rev: 0.2, ref: 4, maxd: 160, fn: function (out, t) {
  crackleL(out, t, 60, 1500, 0.15); lp1(out, t, 'brown', 'lowpass', 300, 0.8, 0.04);
  return { ev: function (tt) { var n = 3 + (rnd() * 6 | 0); for (var i = 0; i < n; i++) sfxIn('anvil', out, tt + i * R(0.9, 1.1), { vol: 1 }); if (rnd() < 0.5) nz(out, tt + n + 0.3, { c: 'pink', f: 500, q: 0.8, a: 0.4, d: 0.8, v: 0.3 }); return tt + n + R(1.5, 4); } };
} };
loopDefs.carpentry = { rev: 0.2, ref: 4, maxd: 120, fn: function (out) {
  return { ev: function (tt) { var k = rnd(), d; if (k < 0.4) d = sfxIn('saw', out, tt, {}); else if (k < 0.7) { d = 0; for (var i = 0; i < 4; i++) { sfxIn('adze', out, tt + d, {}); d += R(0.5, 0.8); } } else d = sfxIn('plane', out, tt, {}) + sfxIn('plane', out, tt + 0.8, {}); return tt + d + R(1, 3); } };
} };
loopDefs.mill = { rev: 0.15, ref: 4, maxd: 70, fn: function (out, t) {
  var w = lp1(out, t, 'brown', 'lowpass', 220, 1.2, 0.5), a = O('sine', 0.4, t), ag = G(0.3); chain(a, ag, w.g.gain); crackleL(out, t, 250, 700, 0.15);
  return { ev: every(2.4, 2.6, function (tt) { creak(out, tt, { d: 1.8, r0: 8, r1: 12, f: 300, v: 0.2 }); }) };
} };
loopDefs.loom = { rev: 0.15, ref: 3, maxd: 60, fn: function (out) { return { ev: every(0.95, 1.15, function (tt) { sfxIn('loom', out, tt, {}); }) }; } };
loopDefs.oven = { rev: 0.12, ref: 3, maxd: 50, fn: function (out, t) {   // 胡餅 shop: fire + sizzle + slaps
  crackleL(out, t, 80, 1500, 0.25); lp1(out, t, 'brown', 'lowpass', 400, 0.8, 0.05); lp1(out, t, 'white', 'highpass', 4000, 0.5, 0.02);
  return { ev: every(2, 5, function (tt) { sfxIn('sizzle', out, tt, {}); }) };
} };
loopDefs.cart = { rev: 0.15, ref: 5, maxd: 150, fn: function (out, t, h) {
  lp1(out, t, 'brown', 'lowpass', 300, 0.8, 0.08); crackleL(out, t, 120, 800, 0.2);
  return { ev: function (tt) { creak(out, tt, { d: R(0.8, 1.2), r0: 10, r1: 20, f: R(300, 420), v: 0.4 }); hoof(out, tt + 0.2, h.o.hard, 0.4); hoof(out, tt + 0.9, h.o.hard, 0.35); return tt + R(1.3, 1.6); } };
} };
['walk', 'trot', 'gallop'].forEach(function (g) {
  loopDefs['horse_' + g] = { rev: 0.15, ref: 4, maxd: 200, fn: function (out, t, h) {
    return { ev: function (tt) { var d = gaitCycle(out, tt, g, h.o.hard, 0.8); if (rnd() < 0.04) sfxIn('horse_snort', out, tt, {}); return tt + d * R(0.98, 1.02); } };
  } };
});
loopDefs.cicada_tree = { outdoor: 1, vol: 0.35, rev: 0.15, ref: 4, maxd: 70, fn: function (out) { return { ev: function (tt) { var d = sfxIn('cicada', out, tt, {}); return tt + d * R(1.2, 3); } }; } };
loopDefs.frogs = { outdoor: 1, rev: 0.15, ref: 5, maxd: 120, fn: function (out, t) { if (!bedBuf('frogs', out, t, 1)) return { ev: every(1, 3, function (tt) { sfxIn('frog', out, tt, {}); }) }; } };
loopDefs.crickets = { outdoor: 1, rev: 0.1, ref: 4, maxd: 50, fn: function (out, t) { if (!bedBuf('crickets', out, t, 1)) return { ev: every(1, 3, function (tt) { sfxIn('cricket', out, tt, {}); }) }; } };
loopDefs.chant = { rev: 0.4, ref: 6, maxd: 120, fn: function (out, t) {   // sutra hall: recitation with the wooden fish (no synthetic drone)
  var seed = 1; return { ev: function (tt) { var d = sfxIn('chant', out, tt, { seed: seed++ }); return tt + d - 0.6; } };
} };
loopDefs.wind_bells = { outdoor: 1, rev: 0.35, ref: 6, maxd: 200, fn: function (out) {   // 風鐸 on pagoda eaves
  return { ev: every(1.5, 6, function (tt) { var f = pick([1180, 1325, 1490, 1770]); zhong(out, tt, { f: f * R(0.995, 1.005), d: 2.5, v: 0.25 }); }) };
} };
loopDefs.rain_roof = { rev: 0.1, ref: 4, maxd: 40, fn: function (out, t) { lp1(out, t, 'pink', 'bandpass', 1200, 0.6, 0.3); crackleL(out, t, 900, 2000, 0.3); } };
function oneshotAt(name, x, z, t, vol, bus, rv) {
  var o = { x: x, z: z, y: L.y, vol: vol == null ? 1 : vol };
  if (name.indexOf('voice:') === 0) return voiceAt(name.slice(6), o, t, bus, rv);
  return oneshot(name, o, bus, t, rv);
}
var nVoice = 0;
var VKINDS = { murmur: 1, call: 1, shout: 1, laugh: 1, cry: 1, gasp: 1, hawk: 1, grunt: 1, pain: 1, sigh: 1 };
function voiceAt(kind, o, t, bus, rv, needBaked) {
  if (!VKINDS[kind]) kind = 'murmur';
  if (!OFF && nVoice >= 10) return null;
  if (!audible({ x: o.x, z: o.z, maxd: kind === 'shout' || kind === 'hawk' || kind === 'call' ? 160 : 70 }) && !OFF) return null;
  if (!steal(1)) return null;
  o.ref = o.ref || 3; o.maxd = kind === 'shout' || kind === 'hawk' || kind === 'call' ? 160 : 70;
  var v = voice(o, 0.12, bus, rv); voices.push(v); t = Math.max(t || 0, ac.currentTime + 0.01);
  // a speaker without a seed gets one of 10 stock voices per kind (cached buffers); a seeded NPC always sounds the same
  var p = o.pitch || pick([1, 1, 1.4, 1.2, 0.9]), sd = o.seed != null ? o.seed : (rnd() * 10) | 0;
  if (o.seed == null) { var PQ = [0.55, 0.62, 0.9, 1, 1.08, 1.3, 1.4, 1.45], bi = 0; for (var qi = 1; qi < PQ.length; qi++) if (Math.abs(PQ[qi] - p) < Math.abs(PQ[bi] - p)) bi = qi; p = PQ[bi]; }
  var d = speak(v.in, t, kind, p, o.dur ? Math.round(o.dur * 2) / 2 : 0, sd);
  v.t0 = t; v.end = t + d; nVoice++;
  later(t - ac.currentTime + d + 0.2, function () { nVoice--; free(v); });
  return v;
}
function startEmitter(e) {
  var D = loopDefs[e.name], o = {}; for (var k in e.o) o[k] = e.o[k];
  if (o.ref == null) o.ref = D.ref; if (o.maxd == null) o.maxd = D.maxd; o.vol = (o.vol == null ? 1 : o.vol) * (D.vol || 1);
  if (o.follow) { delete o.x; delete o.z; }
  var v = voice(o, D.rev, (o.outdoor != null ? o.outdoor : D.outdoor) ? M.ambIn : null), t = ac.currentTime + 0.02, r;
  REC = []; try { r = D.fn(v.in, t, e); } catch (x) { console.error('AU loop ' + e.name, x); } v.srcs = REC; REC = null;
  v.in.gain.setValueAtTime(0, t); v.in.gain.linearRampToValueAtTime(1, t + (OFF ? 0.01 : 0.6));
  e.v = v; e.vo = o;
  if (r && r.ev) { var ev = r.ev; e.job = job(t + R(0, 0.5), function (tt) { if (!e.v) return null; var m = REC; REC = e.v.srcs; var n = ev(tt); REC = m; if (e.v.srcs.length > 400) e.v.srcs.splice(0, 200); return n; }); }
  if (D.music) e.mus = startTrack(D.music, OFF ? 0 : 1.5, t, v.in);
}
function stopEmitter(e, fade) {
  if (e.job) { e.job.dead = true; e.job = null; }
  if (e.mus) { stopTrack(e.mus, fade || 0.5); e.mus = null; }
  if (e.v) { kill(e.v, fade || 0.5); e.v = null; }
}
function updateEmitters() {
  var list = [], k, e;
  for (k in emitters) { e = emitters[k]; if (e.o.follow) { e.o.x = L.x; e.o.z = L.z; } var D = loopDefs[e.name], dx = e.o.x - L.x, dz = e.o.z - L.z; e.d = Math.sqrt(dx * dx + dz * dz); e.ok = e.d < (e.o.maxd || D.maxd); list.push(e); }
  list.sort(function (a, b) { return a.d - b.d; });
  var starts = 0;
  list.forEach(function (e, i) {
    var on = e.ok && i < MAXLOOPS && !e.stopping;
    if (on && !e.v) { if (starts++ < 2 || OFF) startEmitter(e); }   // at most 2 new emitters per tick: no start-up spike
    else if (!on && e.v) stopEmitter(e, 0.6);
    if (e.v) { var pv = e.v.pos; if (pv) { pv.x = e.o.x; pv.y = e.o.y == null ? L.y : e.o.y; pv.z = e.o.z; } if (e.o.vol != null) e.v.vol = e.o.vol * (loopDefs[e.name].vol || 1); spatial(e.v); }
  });
}

/* ======================================================================
   AMBIENCE: continuous layers + scattered world events, all driven by the smoothed AU.set state
   ====================================================================== */
var AMB = null;
function dsum(tab) { var s = 0; for (var k in SM.d) s += SM.d[k] * (tab[k] || 0); return s; }
function hourF(h) {
  var day = smooth(5.3, 7.3, h) * (1 - smooth(18.6, 20.2, h));
  var dawn = smooth(4.3, 5.2, h) * (1 - smooth(6.5, 8, h));
  var dusk = smooth(17.3, 18.4, h) * (1 - smooth(19.6, 20.6, h));
  var night = clamp(1 - smooth(4.6, 6.2, h) + smooth(19.3, 21, h), 0, 1);
  var heat = smooth(8.5, 11, h) * (1 - smooth(17.8, 19.3, h));
  return { day: day, dawn: dawn, dusk: dusk, night: night, heat: heat };
}
var GREEN = { market: 0.25, ward: 1, avenue: 0.85, temple: 1.3, quarter: 0.7, outskirts: 1.3, palace: 0.8, interior: 0.6 };
var BUSY = { market: 1, ward: 0.45, avenue: 0.6, temple: 0.3, quarter: 0.55, outskirts: 0.15, palace: 0.25, interior: 0.4 };
/* layers are built lazily when their level rises above zero and torn down after staying silent (saves the audio thread) */
var LAYERS = {
  wind: function (g, t) {   // broadband air, slowly breathing; no low rumble
    var w1 = lp1(g, t, 'pink', 'bandpass', 900, 0.35, 0.35); wander(w1.f.frequency, t, 350, 0.02); wander(w1.g.gain, t, 0.3, 0.02);
    var w3 = lp1(g, t, 'pink', 'highpass', 3000, 0.5, 0.08); wander(w3.g.gain, t, 0.07, 0.03); },   // leaves of the 槐 trees
  hum: function (g, t) { return bedL(g, t, 'crowd_far', 0.5, 2200, 250); },   // distant walla only (no rumble): busy districts by day
  crowd: function (g, t) { return bedL(g, t, 'crowd_near', 1, 6000, 180); },
  cicada: function (g, t) { var b = baked('cicada'); if (b) { for (var i = 0; i < 3; i++) { var s = playBuf(b, t, R(0.96, 1.04), null, true, null, R(0, b.duration)), pn = panned(g, i - 1); chain(s, G(0.6), pn); } return; }
    var cn = noise(t, null, 'white'), cb = F('bandpass', 5200, 3), cb2 = F('bandpass', 4300, 4), ca = am(g, t, null, 88, 0.6, 'sawtooth'), cs = G(0.5);
    chain(cn, cb, cs, ca); chain(cn, cb2, G(0.3), ca); wander(cs.gain, t, 0.45, 0.06); },
  cricket: function (g, t) { return bedL(g, t, 'crickets', 1, 20000); },
  frog: function (g, t) { return bedL(g, t, 'frogs', 1, 20000, 120); },
  rain: function (g, t) { lp1(g, t, 'pink', 'highpass', 900, 0.5, 0.35); lp1(g, t, 'pink', 'bandpass', 600, 0.5, 0.12); crackleL(g, t, 1200, 1800, 0.25); },
  room: function (g, t) { lp1(g, t, 'pink', 'bandpass', 1500, 0.4, 0.05); },   // barely-there air of a room (no low hum)
  rainroof: function (g, t) { lp1(g, t, 'pink', 'bandpass', 1100, 0.7, 0.25); crackleL(g, t, 700, 1400, 0.35); }   // rain drumming on the tiles overhead
};
function bedL(g, t, key, v, cut, hp) {   // a baked loop bed (or nothing until the bake is ready: the layer rebuilds later)
  var bb = baked(key); if (!bb) return false;
  var s = playBuf(bb, t, R(0.98, 1.02), null, true, null, R(0, bb.duration)), lp = F('lowpass', cut, 0.6), gg = G(v); chain(s, lp, F('highpass', hp || 60, 0.6), gg, g); return true;
}
function startAmb() { AMB = { L: {} }; }
function tgt(p, v, t, tc) {   // automation only when the target really changes (keeps AudioParam timelines short)
  var o = p._t; if (!OFF && o != null && Math.abs(v - o) <= Math.max(1e-4, Math.abs(o) * 0.01)) return;
  p._t = v; p.setTargetAtTime(v, t, OFF ? 0.01 : tc);
}
function setG(k, v, t) {
  var A = AMB, l = A.L[k];
  if (!l) l = A.L[k] = { g: null, srcs: null, quiet: 0, ok: true };
  if (v > 0.0015 && !l.g) {
    l.g = G(0); l.g.connect(k === 'room' || k === 'rainroof' ? M.sfx : M.ambIn); REC = l.srcs = []; var t0 = Math.max(t, ac.currentTime) + 0.01;
    try { var r = LAYERS[k](l.g, t0); l.ok = r !== false; } catch (e) { console.error('AU layer ' + k, e); } REC = null; l.quiet = 0;
  }
  if (!l.g) return;
  if (!l.ok && !OFF && rnd() < 0.05) { tearLayer(l); return; }   // bed not baked yet: retry later
  tgt(l.g.gain, v, t, 0.4);
  if (v <= 0.0015 && !OFF) { if ((l.quiet += 1) > 40) tearLayer(l); } else l.quiet = 0;
}
function tearLayer(l) { var g = l.g, ss = l.srcs, t = ac.currentTime; l.g = null; l.srcs = null; g.gain.setTargetAtTime(0, t, 0.1); later(0.6, function () { ss.forEach(function (s) { try { s.stop(); } catch (e) {} }); try { g.disconnect(); } catch (e) {} }); }
function ensureBeds() {}
var PEOPLE_EVT = { 'voice:hawk': 1, 'voice:murmur': 1, 'voice:laugh': 1, 'voice:child': 1, 'voice:call': 1, coins: 1, cart: 1, anvil: 1, adze: 1, far_music: 1, donkey_bray: 1, camel_grunt: 1 };
var EVT = [   // name, rate per minute fn(H, S), distance range (m), vol
  ['sparrow', function (H) { return (H.dawn * 10 + H.day * 3) * dsum(GREEN); }, [6, 40], 0.8],
  ['magpie', function (H) { return H.day * 1 * dsum(GREEN); }, [15, 70], 0.7],
  ['crow', function (H) { return (H.dusk * 5 + H.day * 0.5 + H.dawn * 1) ; }, [30, 160], 0.7],
  ['rooster', function (H) { return H.dawn * 3 * dsum({ ward: 1, outskirts: 1.5, quarter: 0.4, market: 0.2, avenue: 0.5, temple: 0.6 }); }, [50, 300], 0.8],
  ['chicken', function (H) { return H.day * 1.2 * dsum({ ward: 1, outskirts: 1.5 }); }, [15, 60], 0.6],
  ['dog_bark', function (H, S) { return H.night * 2.2 + H.day * 0.5 + S.alert * 2; }, [60, 350], 0.7],
  ['cicada', function (H, S) { var w = 0.5 + 0.5 * Math.sin(now_() / 1000 * 0.07); return H.heat * 2.2 * w * w * dsum(GREEN) * (1 - S.rain); }, [30, 110], 0.22],   // a few trees, in slow waves
  ['cricket', function (H) { return H.night * 5 * dsum(GREEN); }, [3, 18], 0.6],
  ['frog', function (H) { return H.night * 3 * dsum({ outskirts: 2, temple: 1, ward: 0.3, palace: 0.5 }); }, [10, 70], 0.6],
  ['voice:hawk', function (H, S) { return H.day * (0.3 + S.crowd) * dsum({ market: 9, avenue: 2.5, ward: 2, quarter: 1.5, temple: 1 }) * (1 - S.curfew); }, [10, 45], 0.75],
  ['voice:murmur', function (H, S) { return S.crowd * 14; }, [6, 22], 0.6],   // background; people near the player talk via AU.say
  ['voice:laugh', function (H, S) { return S.crowd * (H.day + H.night * dsum({ quarter: 2, ward: 0.3 })) * 3; }, [5, 30], 0.6],
  ['voice:child', function (H, S) { return H.day * (1 - S.curfew) * dsum({ ward: 1.5, quarter: 0.4, market: 0.6, temple: 0.3, outskirts: 0.8 }); }, [12, 70], 0.6],
  ['voice:call', function (H, S) { return (0.2 + S.crowd) * H.day * 2.5 * (1 - S.curfew * 0.8); }, [12, 60], 0.6],
  ['cart', function (H, S) { return H.day * dsum({ avenue: 2.5, market: 2, ward: 0.7, outskirts: 1 }) * (1 - S.curfew); }, [20, 90], 0.7],
  ['donkey_bray', function (H) { return H.day * dsum({ market: 1, ward: 0.4, outskirts: 0.8, avenue: 0.3 }); }, [40, 220], 0.6],
  ['horse_neigh', function (H) { return H.day * 0.35 + dsum({ palace: 0.4 }); }, [50, 250], 0.5],
  ['camel_grunt', function (H) { return H.day * dsum({ market: 0.8 }); }, [25, 100], 0.6],
  ['ox_low', function (H) { return H.day * dsum({ outskirts: 0.8, ward: 0.2, market: 0.2 }); }, [50, 220], 0.6],
  ['anvil', function (H, S) { return H.day * dsum({ market: 1.5, ward: 0.6 }) * (1 - S.curfew); }, [40, 160], 0.45],
  ['adze', function (H, S) { return H.day * dsum({ ward: 0.6, market: 0.4 }) * (1 - S.curfew); }, [40, 160], 0.4],
  ['coins', function (H, S) { return S.crowd * dsum({ market: 3, quarter: 1 }); }, [4, 18], 0.5],
  ['temple_bell', function (H) { return (H.dawn * 1.2 + H.dusk * 0.8) + dsum({ temple: 0.25 }); }, [300, 1400], 0.8],
  ['chant', function (H) { return dsum({ temple: 1.2 }) * (H.day + H.dawn * 2 + H.dusk); }, [30, 80], 0.6],
  ['clapper', function (H, S) { return H.night * (0.4 + S.curfew) * dsum({ ward: 1.2, quarter: 0.8, avenue: 0.3, temple: 0.4 }); }, [60, 300], 0.8],
  ['patrol', function (H, S) { return H.night * S.curfew * dsum({ avenue: 1.2, ward: 0.4, market: 0.6, palace: 0.8 }); }, [40, 120], 0.8],
  ['far_music', function (H, S) { return (H.dusk + H.night * 0.8) * dsum({ quarter: 3, ward: 0.6, market: 0.4 }) * (1 - S.alert); }, [30, 140], 0.5],
  ['wind_bell', function (H, S) { return dsum({ temple: 3, palace: 0.6, ward: 0.2 }) * (0.3 + S.wind * 2); }, [20, 120], 0.6],
  ['wind_gust', function (H, S) { return S.wind * 5; }, null, 0.5],
  ['thunder', function (H, S) { return S.rain > 0.55 ? (S.rain - 0.5) * 2.2 : 0; }, null, 0.8],
  ['rain_drip', function (H, S) { return S.rain * 40; }, [2, 9], 0.5]
];
var INROOM = { 'voice:murmur': 1, 'voice:laugh': 1, coins: 1 };
function ambEvent(e, t) {
  var name = e[0], vol = e[3] * (1 - 0.7 * SM.indoor);
  if (SM.indoor > 0.5 && INROOM[name]) {   // people in the same room: not muffled, small-room reverb
    var a0 = R(0, Math.PI * 2), d0 = R(1.5, 7), o0 = { x: L.x + Math.cos(a0) * d0, z: L.z + Math.sin(a0) * d0, y: L.y, vol: e[3] };
    return name === 'coins' ? oneshot(name, o0, null, t) : voiceAt(name.slice(6), o0, t, null, null, true);
  }
  if (!e[2]) { var o = { pan: R(-0.8, 0.8), vol: vol }; return oneshot(name, o, M.ambIn, t, M.rvCity); }
  var a = R(0, Math.PI * 2), d = R(e[2][0], e[2][1]), x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
  if (name === 'patrol') return patrol(x, z, a, t, vol);
  var nm = name.indexOf('voice:') === 0;
  var o2 = { x: x, z: z, y: L.y + (name === 'sparrow' || name === 'magpie' || name === 'crow' || name === 'cicada' ? R(3, 10) : 0), vol: vol, maxd: 2000 };
  if (nm) { o2.maxd = 400; var vk = name.slice(6); if (vk === 'child') { vk = pick(['call', 'laugh', 'laugh', 'shout', 'murmur']); o2.pitch = R(0.5, 0.65); } return voiceAt(vk, o2, t, M.ambIn, M.rvCity, true); }
  return oneshot(name, o2, M.ambIn, t, M.rvCity);
}
function patrol(x, z, a, t, vol) {   // 金吾衛 riders trotting past along a line
  var dir = a + Math.PI / 2 + R(-0.3, 0.3), sp = R(3.5, 5), n = 2 + (rnd() * 3 | 0), len = 18;
  var o = { x: x - Math.cos(dir) * sp * len / 2, z: z - Math.sin(dir) * sp * len / 2, y: L.y, vol: vol, ref: 6, maxd: 400 };
  if (!steal(2)) return; var v = voice(o, 0.2, M.ambIn, M.rvCity); voices.push(v); v.t0 = t; v.end = t + len;
  var tt = t, hard = SM.d.avenue > 0.5 ? 0 : 0, rid = 0;
  var j = job(t, function (t1) {
    if (t1 > t + len) { later(1, function () { free(v); }); return null; }
    var u = (t1 - t) / len; v.pos.x = o.x + Math.cos(dir) * sp * len * u; v.pos.z = o.z + Math.sin(dir) * sp * len * u; spatial(v);
    for (var k = 0; k < n; k++) gaitCycle(v.in, t1 + k * 0.13, 'trot', hard, 0.6);
    if (rnd() < 0.08) sfxIn('horse_snort', v.in, t1, {}); if (rnd() < 0.05) metal(v.in, t1, { f: 2400, r: [1, 2.4, 3.9], d: 0.3, v: 0.1 });
    return t1 + GAITLEN.trot;
  });
  return v;
}
function ambTick(t, dt) {
  if (!AMB) return;
  if (!OFF) ensureBeds();
  // smooth state
  var k = OFF ? 1 : clamp(dt / 2.5, 0, 1), kf = OFF ? 1 : clamp(dt / 0.6, 0, 1);
  var dh = ST.hour - SM.hour; if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
  SM.hour = (SM.hour + dh * (Math.abs(dh) > 1 ? 1 : k) + 24) % 24;
  SM.indoor += (ST.indoor - SM.indoor) * kf; SM.crowd += (ST.crowd - SM.crowd) * k; SM.hear += (ST.hear - SM.hear) * k; SM.wind += (ST.wind - SM.wind) * k; SM.rain += (ST.rain - SM.rain) * k;
  SM.alert += (ST.alert - SM.alert) * kf; SM.curfew += ((ST.curfew ? 1 : 0) - SM.curfew) * k;
  for (var d in SM.d) SM.d[d] += ((ST.district === d ? 1 : 0) - SM.d[d]) * k;
  var H = hourF(SM.hour), S = SM, ind = SM.indoor, out = 1 - ind;
  var busy = dsum(BUSY) * (H.day * 0.9 + H.dusk * 0.6 + 0.1) * (1 - S.curfew * 0.75);
  setG('wind', (0.006 + S.wind * S.wind * 0.2 + S.wind * 0.03) * (1 - ind * 0.6), t);
  setG('hum', busy > 0.25 ? (busy - 0.25) * 0.12 : 0, t);
  setG('crowd', clamp(S.crowd * S.crowd * 0.18 + dsum({ market: 0.04 }) * H.day, 0, 0.22) * (1 - S.curfew * 0.6), t);
  setG('cricket', H.night * 0.25 * dsum(GREEN) * (1 - S.rain * 0.7), t);
  setG('frog', H.night * 0.2 * dsum({ outskirts: 1, temple: 0.5, ward: 0.1, palace: 0.3 }), t);
  setG('rain', S.rain * 0.4, t);
  setG('room', ind * 0.012, t);
  setG('rainroof', S.rain * ind * 0.22, t);
  // indoor: outdoor world muffled through walls; reverb switches from city to room
  var cut = 20000 * Math.pow(0.04, ind);
  tgt(M.ambLP.frequency, cut, t, 0.15); tgt(M.ambLP2.frequency, cut * 1.5, t, 0.15);
  tgt(M.ambG.gain, 1 - ind * 0.55, t, 0.15); tgt(M.rvRoomG.gain, ind * 0.9, t, 0.15); tgt(M.rvCityG.gain, 1 - ind * 0.85, t, 0.15);
  // scattered events (Poisson)
  for (var i = 0; i < EVT.length && !SM.noEv; i++) {
    var e = EVT[i], r = e[1](H, S) * (e[0] === 'voice:murmur' || e[0] === 'coins' ? 1 : 1 - ind * 0.5) * (PEOPLE_EVT[e[0]] ? (S.hear === undefined ? 1 : S.hear) : 1); // people sounds fade with height above the ground (AU.set hear: 1 on the ground .. 0 high up); wind, bells, chant, birds stay
    if (r > 0 && rnd() < r / 60 * dt) ambEvent(e, t + R(0, dt));
  }
  if (curMus && curMus.T.adapt) adaptMusic(curMus);
}

/* ======================================================================
   THE DRUMS (街鼓): dusk 800 / dawn 3000 / market 300 / alarm
   Drum sources are placed around the city: first the palace (承天門), then street drums answering street by street,
   far to near; every hit reaches the listener after d/343 s, with air absorption, city reverb and wall echoes.
   ====================================================================== */
var PALACE = { x: 0, z: -2830 }, drumSets = [], LASTDRUMS = null;
function drumVoice(x, z, y, vol) {
  var o = { x: x, z: z, y: y || 8, vol: vol, law: 1, ref: 60, maxd: 9000, far: 1 }, v = voice(o, 0.45, M.ambIn, M.rvCity);
  var es = G(0); v.lp.connect(es); es.connect(M.echo); v.es = es; v.recalc = function () { var dx = x - L.x, dz = z - L.z, d = Math.sqrt(dx * dx + dz * dz); es.gain.value = clamp(0.05 + d / 4000, 0, 0.35); v.dist = d; };
  v.recalc(); return v;
}
/* roll pattern: a 通 is a run of beats that starts slow, accelerates into a roll and resolves on heavy strokes */
function tongTimes(t0, T, slow, fast, accent) {
  var ts = [], t = t0, u;
  while ((u = (t - t0) / T) < 1) { var iv = slow + (fast - slow) * Math.pow(u, 1.3); ts.push([t, (0.6 + 0.4 * u) * (rnd() < 0.15 ? 0.7 : 1)]); t += iv * R(0.93, 1.07); }
  for (var k = 0; k < (accent || 3); k++) { t += slow * 1.1; ts.push([t, 1]); }
  return { ts: ts, end: t + slow * 2 };
}
function drumSource(set, s) {   // s: {x,z,y, on, off, kind, vol, slow, fast, tong}
  var v = drumVoice(s.x, s.z, s.y, s.vol); voices.push(v); v.pri = 3; v.t0 = s.on; v.end = s.off + 4; set.vs.push(v);
  var queue = [], tt = s.on;
  while (tt < s.off) { var T = Math.min(s.tong * R(0.85, 1.15), s.off - tt); if (T < s.slow * 3) break; var tg = tongTimes(tt, T, s.slow, s.fast, s.accent); queue = queue.concat(tg.ts); tt = tg.end + (s.pause || 0.8) * R(0.8, 1.25); }
  var qi = 0, delay = Math.max(0, v.dist / 343 - (set.shift || 0));
  set.jobs.push(job(s.on, function (t1) {
    if (qi >= queue.length) { later(delay + 5, function () { free(v); }); return null; }
    var h = queue[qi++], b = baked(s.kind);
    if (set.hits) set.hits.push([h[0] + delay - set.t0, Math.round(v.dist), h[1]]);
    if (b) hitBuf(b, v.in, h[0] + delay, h[1] * 0.9, R(0.98, 1.02));
    else tdrum(v.in, h[0] + delay, { f: s.kind === 'drum_palace' ? 64 : s.kind === 'drum_ward' ? 94 : 80, d: 1.2, v: h[1] * 0.85, stick: 0.4 });
    return qi < queue.length ? queue[qi][0] : h[0] + 0.01;
  }));
}
function zhengSource(set, s) {   // one 鉦 player: a stroke every ~1.5-2.5 s in rounds of 8-12, a pause between rounds
  var v = drumVoice(s.x, s.z, s.y, s.vol); voices.push(v); v.t0 = s.on; v.end = s.off + 6; set.vs.push(v);
  var delay = Math.max(0, v.dist / 343 - (set.shift || 0)), n = 0, nr = 8 + (rnd() * 5 | 0);
  set.jobs.push(job(s.on, function (t1) {
    if (t1 > s.off) { later(delay + 6, function () { free(v); }); return null; }
    var acc = n === 0 ? 1 : 0.7 + rnd() * 0.15, b = baked('zheng');
    if (set.hits) set.hits.push([t1 + delay - set.t0, Math.round(v.dist), acc]);
    if (b) hitBuf(b, v.in, t1 + delay, acc * 0.9, R(0.997, 1.003)); else zhengHit(v.in, t1 + delay, 380, acc * 0.6);
    if (++n >= nr) { n = 0; nr = 8 + (rnd() * 5 | 0); return t1 + R(4, 6) / s.rate; }   // end of a round
    return t1 + R(1.5, 2.5) / s.rate;
  }));
}
function drumsStart(kind, o) {
  o = o || {}; var sp = o.speed || 1, t = ac.currentTime + 0.1, set = { kind: kind, vs: [], jobs: [], hits: [], t0: ac.currentTime }, vol = o.vol == null ? 1 : o.vol; LASTDRUMS = set;
  var pal = o.palace || PALACE, near = o.near || null, rr = withSeed(o.seed, function () { return [rnd(), rnd(), rnd()]; });
  function around(d, ang) { return { x: L.x + Math.cos(ang) * d, z: L.z + Math.sin(ang) * d }; }
  if (kind === 'dusk' || kind === 'dawn') {
    set.shift = Math.max(0, Math.sqrt((pal.x - L.x) * (pal.x - L.x) + (pal.z - L.z) * (pal.z - L.z)) / 343 - 0.5);   // don't make the player wait for the sound to cross the city
    var dawn = kind === 'dawn', TOT = (dawn ? 95 : 78) / sp, base = Math.atan2(pal.z - L.z, pal.x - L.x);
    // each drummer beats rounds (通): a slow start (~one stroke per 2 s) quickening to ~1.2 s, two closing strokes, a pause.
    // The palace drum starts; avenue guard-post drums take it up from far to near; the nearest post dominates at the end.
    // At any moment: at most 1 near + 2-4 distant drums, about 1-2 strokes per second in all. Dawn is a little brisker.
    var q = dawn ? 0.85 : 1, POSTS = [   // [distance (m) or 0 = palace, start, end (fractions of TOT), drum, vol, slowest, fastest interval]
      [0, 0, 0.42, 'drum_palace', 1.3, 2.6, 1.6], [1700, 0.1, 0.56, 'drum_palace', 1.1, 2.5, 1.5], [1000, 0.22, 0.7, 'drum_street', 1, 2.4, 1.45],
      [550, 0.35, 0.84, 'drum_street', 0.95, 2.3, 1.4], [R(70, 110), 0.5, 1, 'drum_street', 0.75, 2, 1.15]];
    POSTS.forEach(function (P, i) {
      var p = P[0] ? (i === POSTS.length - 1 && near ? near : around(P[0], base + R(-0.8, 0.8))) : pal;
      drumSource(set, { x: p.x, z: p.z, y: P[0] ? 9 : 30, on: t + P[1] * TOT + (i ? R(0, 1.5) : 0), off: t + P[2] * TOT, kind: P[3], vol: P[4] * vol,
        slow: P[5] * q, fast: P[6] * q, tong: 14 * q, accent: 2, pause: 3.2 * q });
    });
    var np = POSTS[POSTS.length - 1][0] ? (near || { x: set.vs[set.vs.length - 1].pos.x, z: set.vs[set.vs.length - 1].pos.z }) : pal;
    // the gates: when the near drum falls silent the ward gate swings shut (dusk) / open (dawn)
    var gp = { x: np.x + 15, z: np.z + 10, vol: 0.9 * vol, maxd: 600 };
    set.jobs.push(job(t + TOT - 6 / sp, function (t1) { oneshot('gate_creak', gp, M.ambIn, t1, M.rvCity); if (!dawn) oneshot('gate_bar', gp, M.ambIn, t1 + 4.2, M.rvCity); return null; }));
    if (dawn) {   // dawn bells of the great monasteries
      [0, 1, 2].forEach(function (i) { var p = around(R(600, 1600), R(0, 6.28)); set.jobs.push(job(t + (20 + i * 17) / sp, function (t1) { oneshot('temple_bell', { x: p.x, z: p.z, vol: 0.9 * vol, maxd: 5000 }, M.ambIn, t1, M.rvCity); return t1 + 16 < t + TOT ? t1 + R(14, 18) : null; })); });
      set.jobs.push(job(t + 30 / sp, function (t1) { var p = around(R(60, 200), R(0, 6.28)); oneshot('rooster', { x: p.x, z: p.z, vol: 0.6 }, M.ambIn, t1, M.rvCity); return t1 < t + TOT ? t1 + R(6, 15) : null; }));
    } else {
      set.jobs.push(job(t + 8 / sp, function (t1) { var p = around(R(40, 160), R(0, 6.28)); voiceAt(pick(['call', 'call', 'shout', 'murmur']), { x: p.x, z: p.z, vol: 0.5 }, t1, M.ambIn, M.rvCity); return t1 < t + TOT - 10 ? t1 + R(2, 6) : null; }));
      set.jobs.push(job(t + 15 / sp, function (t1) { var p = around(R(50, 200), R(0, 6.28)); oneshot('crow', { x: p.x, z: p.z, y: 15, vol: 0.5, maxd: 600 }, M.ambIn, t1, M.rvCity); return t1 < t + TOT ? t1 + R(3, 9) : null; }));
    }
    set.end = t + TOT + 6;
    if (!OFF) duck(0.35, TOT * 0.8);   // let the drums own the moment
  } else if (kind === 'market_open') {
    var mp = o.x != null ? { x: o.x, z: o.z } : around(350, rr[1] * 6.28), TT = 40 / sp;
    drumSource(set, { x: mp.x, z: mp.z, y: 8, on: t, off: t + TT, kind: 'drum_street', vol: 1 * vol, slow: 1.6, fast: 0.9, tong: 12, accent: 2, pause: 2.5 });
    drumSource(set, { x: mp.x + 120, z: mp.z - 80, y: 8, on: t + 4, off: t + TT - 1, kind: 'drum_ward', vol: 0.6 * vol, slow: 1.8, fast: 1.1, tong: 12, accent: 2, pause: 3 });
    set.end = t + TT + 5;
  } else if (kind === 'market_close') {
    var cp = o.x != null ? { x: o.x, z: o.z } : around(350, rr[1] * 6.28), TC = 50 / sp;
    zhengSource(set, { x: cp.x, z: cp.z, y: 6, on: t, off: t + TC, vol: 0.9 * vol, rate: 1 });   // one player at the market office; the city echo answers
    set.end = t + TC + 5;
  } else if (kind === 'alarm') {
    var ap = o.x != null ? { x: o.x, z: o.z } : around(120, rr[2] * 6.28), TA = (o.dur || 18) / sp;
    drumSource(set, { x: ap.x, z: ap.z, y: 5, on: t, off: t + TA, kind: 'drum_ward', vol: 1 * vol, slow: 0.22, fast: 0.09, tong: 5, accent: 2 });
    zhengSource(set, { x: ap.x + 10, z: ap.z, y: 5, on: t + 0.3, off: t + TA, vol: 0.8 * vol, rate: 2.2 });
    set.jobs.push(job(t, function (t1) { voiceAt('shout', { x: ap.x + R(-20, 20), z: ap.z + R(-20, 20), vol: 0.9, pitch: R(0.95, 1.1) }, t1, M.ambIn, M.rvCity); return t1 < t + TA ? t1 + R(0.6, 2) : null; }));
    set.end = t + TA + 4;
  } else { console.warn('AU: unknown drums "' + kind + '"'); return; }
  drumSets.push(set);
  return set;
}
function drumsStop(fade) { drumSets.forEach(function (s) { s.jobs.forEach(function (j) { j.dead = true; }); s.vs.forEach(function (v) { kill(v, fade || 1); }); }); drumSets = []; }

/* ======================================================================
   MUSIC: notation + scheduler (format from FIFTH WATCH)
 Track: {bpm, div (steps per beat), inst:{voice:{type,vol,rev,pan,oct,prob,wob,hum,al:[a0,a1] (fade in with alert), ...}},
         pat:{name:{voice:"tokens"}}, seq:['A','B:+2','C@0.7','X/Y'], loop: seq index to loop to, once, tail, gain, adapt}
 Tokens: note c4 d#3 bb2 · join with + (d3+a3) · '-' hold · '.' rest · tok*n repeat · '|' ignored
   suffixes: ^ accent  ~ soft  ! ghost  ? 50%  < scoop up  > fall off  % tremolo (pipa)/vibrato (winds)  ' harmonic (zheng)
   prefix '=': glide from the sounding note (zheng press-bend, bili/flute portamento)
 Drum voices (type 'drums'), each char a hit:
   j 羯鼓 stick  J 羯鼓 accent  q 羯鼓 ghost  y 腰鼓 low (open palm)  Y 腰鼓 slap  k big drum  K big drum soft
   p 拍板 clappers  w 木魚  b small bell (P.bf)  B great bell (P.Bf)  s stone/bowl (P.sf)  n noise swell
   ====================================================================== */
var NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function acc(c) { return c === '#' ? 1 : c === 'b' ? -1 : 0; }
function parseNote(s) { var m = /^([a-g])([#b]?)(-?\d)$/.exec(s); return m ? [12 * (+m[3] + 1) + NOTE[m[1]] + acc(m[2])] : null; }
var SUF = /^(.*?)([\^~!?<>'%]*)$/;
function toks(s) { var o = []; s.trim().split(/\s+/).forEach(function (t) { var m = /^(.+)\*(\d+)$/.exec(t); if (m) for (var i = 0; i < +m[2]; i++) o.push(m[1]); else if (t && t !== '|') o.push(t); }); return o; }
function parseVoice(str, drum) {
  var ev = [], last = null, st = 0;
  toks(str).forEach(function (tk) {
    if (tk === '.') { last = null; st++; return; }
    if (tk === '-') { if (last) last.l++; st++; return; }
    var gl = tk.charAt(0) === '='; if (gl) tk = tk.slice(1);
    var m = SUF.exec(tk), sx = m[2], v = 0.8, x = {}; tk = m[1];
    if (sx.indexOf('^') >= 0) v = 1; if (sx.indexOf('~') >= 0) v = 0.45; if (sx.indexOf('!') >= 0) v = 0.25;
    if (sx.indexOf('?') >= 0) x.ch = 0.5; if (sx.indexOf('<') >= 0) x.up = 1; if (sx.indexOf('>') >= 0) x.fall = 1;
    if (sx.indexOf("'") >= 0) x.harm = 1; if (sx.indexOf('%') >= 0) x.vib = 1;
    if (drum) { ev.push({ s: st, d: tk, v: v, l: 1, x: x }); last = null; st++; return; }
    var ns = [];
    tk.split('+').forEach(function (y) { var n = parseNote(y); if (n) ns = ns.concat(n); else console.warn('AU music: bad token ' + y); });
    if (gl && last && ns.length) { (last.x.path = last.x.path || []).push([st - last.s, ns[0] - last.n[0]]); last.l = st - last.s + 1; st++; return; }
    last = { s: st, n: ns, l: 1, v: v, x: x }; ev.push(last); st++;
  });
  return { len: st, ev: ev };
}
function compile(T) {
  if (T.C) return T.C;
  var pats = {};
  Object.keys(T.pat).forEach(function (name) {
    var P = T.pat[name], vs = {}, len = 0, at = [];
    Object.keys(P).forEach(function (v) { if (!T.inst[v]) console.warn('AU music: no instrument ' + v); vs[v] = parseVoice(P[v], (T.inst[v] || {}).type === 'drums'); len = Math.max(len, vs[v].len); });
    if (T.bar) len = Math.ceil(len / T.bar) * T.bar;
    Object.keys(vs).forEach(function (v) { var pv = vs[v]; if (!pv.len) return; for (var k = 0; k < len; k += pv.len) pv.ev.forEach(function (e) { var s = e.s + k; if (s < len) (at[s] = at[s] || []).push([v, e]); }); });
    pats[name] = { len: len, at: at };
  });
  var seq = T.seq.map(function (s) {
    return s.split('/').map(function (s1) {
      var m = /^([^:@]+)(?::([+-]\d+))?(?:@([\d.]+))?$/.exec(s1); if (!m || !pats[m[1]]) throw new Error('AU music: bad seq item ' + s1);
      return { p: pats[m[1]], tr: +(m[2] || 0), g: m[3] ? +m[3] : 1 };
    });
  });
  return (T.C = { sd: 60 / T.bpm / (T.div || 2), seq: seq });
}
function trackLen(T) { var C = compile(T), s = 0; C.seq.forEach(function (a) { s += a[0].p.len; }); return s * C.sd; }
function startTrack(id, fade, t0, dest) {
  var T = tracks[id], C = compile(T), m = { id: id, T: T, C: C, pi: 0, st: 0, e: pick(C.seq[0]), g: G(0), w: G(0), vb: {}, wv: {} };
  if (dest) { m.g.connect(dest); m.w.connect(dest); m.w.gain.value = 0; } else { m.g.connect(M.musIn); m.w.connect(M.mrvIn); }
  var gn = (T.gain || 1) * (m.vol = 1);
  Object.keys(T.inst).forEach(function (v) {
    var I = T.inst[v], d = G(I.vol == null ? 0.5 : I.vol), s = G((I.rev == null ? 0.3 : I.rev) * (dest ? 0.4 : 1)), o = d, ag = G(I.al ? 0 : 1);
    chain(d, ag); o = ag; m.wv[v] = ag;
    if (I.lp) { var lf = F('lowpass', I.lp, 0.7); o.connect(lf); o = lf; }
    if (I.pan && ac.createStereoPanner) { var pn = ac.createStereoPanner(); pn.pan.value = I.pan; o.connect(pn); o = pn; }
    o.connect(m.g); chain(o, s, dest ? m.g : m.w); m.vb[v] = d;
  });
  [m.g.gain].concat(dest ? [] : [m.w.gain]).forEach(function (p) { p.setValueAtTime(0, t0); p.linearRampToValueAtTime(gn, t0 + Math.max(0.02, fade)); });
  m.job = job(t0 + 0.06, function (t, late) {
    if (m.stopped) return null;
    var e = m.e, at = e.p.at[m.st];
    if (at && !late) for (var i = 0; i < at.length; i++) playEv(m, at[i][0], at[i][1], e.tr, t, e.g);
    if (++m.st >= e.p.len) { m.st = 0; if (++m.pi >= C.seq.length) { if (T.once) { m.done = true; later(T.tail || 6, function () { if (curMus === m) curMus = null; disposeTrack(m); }); return null; } m.pi = T.loop || 0; } m.e = pick(C.seq[m.pi]); }
    return t + C.sd;
  });
  if (T.adapt) adaptMusic(m, true);
  return m;
}
function adaptMusic(m, now) {
  var a = SM.alert, t = ac.currentTime;
  Object.keys(m.T.inst).forEach(function (v) { var I = m.T.inst[v]; if (!I.al) return; var w = smooth(I.al[0], I.al[1], a); if (I.alInv) w = 1 - w; if (now) m.wv[v].gain.setTargetAtTime(w, t, 0.01); else tgt(m.wv[v].gain, w, t, 0.8); m.wv[v]._w = w; });
}
function playEv(m, v, e, tr, t, sg) {
  var I = m.T.inst[v]; if (!I || m.stopped) return;
  if (I.al && (m.wv[v]._w || 0) < 0.02) return;
  if ((e.x.ch && rnd() > e.x.ch) || (I.prob && rnd() > I.prob)) return;
  var out = m.vb[v], vel = e.v * sg * R(0.9, 1.05), sd = m.C.sd;
  if (I.hum) t += R(0, I.hum);
  try {
    if (I.type === 'drums') { for (var i = 0; i < e.d.length; i++) drumhit(e.d.charAt(i), out, t + i * 0.012, vel, I); }
    else {
      var k = (I.fixed ? 0 : tr) + (I.oct || 0) * 12, w = I.wob ? Math.pow(2, R(-I.wob, I.wob) / 1200) : 1, x = e.x;
      if (x.path) x = { up: x.up, fall: x.fall, vib: x.vib, harm: x.harm, path: x.path.map(function (p) { return [p[0] * sd, Math.pow(2, p[1] / 12)]; }) };
      // ornaments: on longer notes, sometimes a quick grace note from a step above (heterophonic decoration; differs every pass)
      if (I.orn && e.l >= 2 && !x.path && e.n.length === 1 && rnd() < I.orn) INST[I.type](out, Math.max(t - 0.075, ac.currentTime), [mtof(e.n[0] + k + pick([2, 2, 3])) * w], 0.07, vel * 0.55, I, {});
      INST[I.type](out, t, e.n.map(function (n) { return mtof(n + k) * w; }), e.l * sd, vel, I, x);
    }
  } catch (er) { console.error('AU music', er); }
}
function stopTrack(m, fade) {
  if (!m) return; m.stopped = true; if (m.job) m.job.dead = true; var t = ac.currentTime;
  [m.g.gain, m.w.gain].forEach(function (p) { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(0, t + Math.max(0.02, fade)); });
  later(fade + 1, function () { disposeTrack(m); });
}
function disposeTrack(m) { try { m.g.disconnect(); m.w.disconnect(); } catch (e) {} }

/* ---------- Tang instruments ---------- */
function bend(p, t, base, d, x, sl) {
  var cur = base, lt = t; sl = sl || 0.16;
  if (x.up) { p.setValueAtTime(base * 0.89, t); p.exponentialRampToValueAtTime(base, t + 0.12); lt = t + 0.12; } else p.setValueAtTime(base, t);
  if (x.path) x.path.forEach(function (q) { var tt = Math.max(t + q[0] - sl * 0.4, lt); p.setValueAtTime(cur, tt); cur = base * q[1]; p.exponentialRampToValueAtTime(cur, tt + sl); lt = tt + sl; });
  if (x.fall) { var tf = Math.max(lt, t + d * 0.6); p.setValueAtTime(cur, tf); p.exponentialRampToValueAtTime(cur * 0.89, tf + Math.max(0.15, d * 0.4)); }
}
function vibr(p, t, end, rate, depth, delay) { var o = O('sine', rate, t, end), g = G(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(depth, t + (delay || 0.2) + 0.15); chain(o, g, p); return g; }
function body(out, k, mk) { return out[k] || (out[k] = mk()); }
function pluck(out, hp, fr, t, d, v, P, x, def) {   // shared plucked-string voice (KS buffer + envelope + bends)
  var ring = P.ring == null ? def.ring : P.ring, end = t + d + ring + 0.8, s = playBuf(ks(fr, def.len, P.damp || def.damp, P.bright || def.bright, def.pos), t, 1, null, false, end), g = G(0);
  bend(s.playbackRate, t, 1, d, x, 0.18); if (x.vib && def.vib) vibr(s.playbackRate, t, end, 5.5, 0.014, 0.12);
  g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t + d + ring, 0.12 + ring * 0.1); chain(s, g, hp);
  return s;
}
var INST = {
  // 琵琶: four strings, crooked neck, big plectrum: bright snap, quick decay, wooden body; % = 輪 tremolo
  pipa: function (out, t, fs, d, v, P, x) {
    var hp = body(out, '_pipa', function () { var h = F('highpass', 110, 0.7); chain(h, PK(320, 1.5, 4), PK(1000, 1.6, 4), PK(2700, 2, 3), F('lowpass', P.cut || 7000, 0.7), out); return h; });
    fs.forEach(function (fr, j) {
      var n = fs.length, t0 = t + j * (P.strum || 0.013), D = { len: 1.6, damp: 0.9925, bright: 0.92, pos: 0.13, ring: 0.5 };
      if (x.vib) {
        var rate = P.tr || 14, k = Math.max(2, Math.floor(d * rate)), b = ks(fr, 1.6, P.damp || 0.9925, 0.92, 0.13), tt;
        for (var i = 0; i < k; i++) {
          tt = t0 + i / rate * R(0.96, 1.04); var s = playBuf(b, tt, 1, null, false, tt + 0.3), g = G(0), u = i / k;
          var pk = v * 0.45 / Math.sqrt(n) * (i % 2 ? 0.7 : 1) * R(0.85, 1) * (0.8 + 0.4 * Math.sin(u * Math.PI));
          g.gain.setValueAtTime(pk, tt); g.gain.setTargetAtTime(0, tt + 1 / rate, 0.035); chain(s, g, hp);
        }
        return;
      }
      pluck(out, hp, fr, t0, Math.min(d, 0.6), v * 0.55 / Math.sqrt(n), P, x, D);
      nz(hp, t0, { ft: 'highpass', f: 3800, d: 0.005, v: v * 0.3 });   // plectrum
    });
  },
  // 五弦: five-string straight-necked lute — a little darker and rounder than the pipa
  wuxian: function (out, t, fs, d, v, P, x) {
    var hp = body(out, '_wx', function () { var h = F('highpass', 100, 0.7); chain(h, PK(260, 1.4, 4), PK(800, 1.5, 3), F('lowpass', P.cut || 5000, 0.7), out); return h; });
    fs.forEach(function (fr, j) { pluck(out, hp, fr, t + j * 0.016, Math.min(d, 0.8), v * 0.55 / Math.sqrt(fs.length), P, x, { len: 2, damp: 0.994, bright: 0.78, pos: 0.18, ring: 0.6 }); nz(hp, t + j * 0.016, { ft: 'highpass', f: 3000, d: 0.005, v: v * 0.18 }); });
  },
  // 箏: zither with movable bridges; long ring, left-hand press-bends (=), vibrato (%), harmonics (')
  zheng: function (out, t, fs, d, v, P, x) {
    var hp = body(out, '_zheng', function () { var h = F('highpass', 80, 0.7); chain(h, PK(500, 1.2, 3), PK(2800, 1.5, 2), F('lowpass', P.cut || 6000, 0.7), out); return h; });
    fs.forEach(function (fr, i) {
      var tt = t + i * (P.strum || 0.035);
      if (x.harm) { tone(out, tt, { f: fr, d: 1.8, v: v * 0.25 }); tone(out, tt, { f: fr * 2, d: 0.6, v: v * 0.05 }); return; }
      pluck(out, hp, fr, tt, d, v * 0.5 / Math.sqrt(fs.length), P, x, { len: 3, damp: 0.9985, bright: 0.65, pos: 0.22, ring: 1.6, vib: 1 });
    });
  },
  // 箜篌: angular harp; soft fingers, very long ring, airy
  konghou: function (out, t, fs, d, v, P, x) {
    var hp = body(out, '_kh', function () { var h = F('highpass', 90, 0.7); chain(h, PK(700, 1, 2), F('lowpass', P.cut || 4500, 0.7), out); return h; });
    fs.forEach(function (fr, i) { pluck(out, hp, fr, t + i * 0.06, d, v * 0.45 / Math.sqrt(fs.length), P, x, { len: 3.5, damp: 0.9982, bright: 0.45, pos: 0.3, ring: 2.5 }); });
  },
  // 篳篥: short cylindrical double reed — loud, nasal, always sliding into its notes; % = wide vibrato
  bili: function (out, t, fs, d, v, P, x) {
    var fr = fs[0], r = P.r || 0.09, hold = Math.max(d - 0.02, 0.06), end = t + hold + r * 4 + 0.1, o = O('reed', fr, t, end), g = G(0);
    var xx = { up: x.up || (!P.noscoop && rnd() < 0.6), path: x.path, fall: x.fall }; bend(o.frequency, t, fr, d, xx, 0.14);
    vibr(o.frequency, t, end, P.vr || 5.2, fr * (x.vib ? 0.022 : 0.007), x.vib ? 0.12 : 0.3);
    var n = noise(t, end - t, 'pink'), nb = F('bandpass', 1800, 1.2), ng = G(0.05); chain(n, nb, ng, g);
    chain(o, g, body(out, '_bili', function () { var h = shaper(P.k || 1.6); chain(h, F('highpass', 280, 0.7), PK(1250, 1.6, 7), PK(2600, 2.2, 4), F('lowpass', P.cut || 4200, 0.7), G(0.32), out); return h; }));
    var pk = v; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.035); g.gain.linearRampToValueAtTime(pk * (P.swell || 1.05), t + hold); g.gain.setTargetAtTime(0, t + hold, r / 3);
  },
  // 橫笛 (bright transverse flute, no membrane) and 簫 (dark end-blown): breathy, ornamented with scoops
  flute: function (out, t, fs, d, v, P, x) {
    var fr = fs[0], a = P.a || 0.06, r = P.r || 0.18, hold = Math.max(d - 0.03, 0.06), end = t + hold + r * 4 + 0.1;
    var o1 = O('triangle', fr, t, end), o2 = O('sine', fr * 2, t, end), sum = G(1), g2 = G(P.h2 == null ? (P.dark ? 0.05 : 0.38) : P.h2), g = G(0), lp = F('lowpass', P.cut || (P.dark ? 1600 : 6000), 0.7);
    bend(o1.frequency, t, fr, d, x, 0.11); bend(o2.frequency, t, fr * 2, d, x, 0.11);
    var vd = (x.vib ? 0.016 : P.vib == null ? 0.005 : P.vib) * fr; if (d > 0.3 || x.vib) { var vb = vibr(o1.frequency, t, end, P.vr || 5, vd, 0.25); vb.connect(o2.frequency); }
    o1.connect(sum); chain(o2, g2, sum);
    if (!P.dark) { var o3 = O('sine', fr * 3, t, end), g3 = G(0.1); bend(o3.frequency, t, fr * 3, d, x, 0.11); chain(o3, g3, sum); }
    var n = noise(t, end - t, 'white'), nb = F('bandpass', fr * 2, 2.5), ng = G(P.breath == null ? (P.dark ? 0.3 : 0.14) : P.breath); chain(n, nb, ng, sum);
    nz(lp, t, { f: Math.min(9000, fr * 3), q: 2, d: 0.04, v: v * 0.12 });   // tongue / chiff
    var pk = v * 0.3; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.linearRampToValueAtTime(pk * (P.swell || 1), t + hold); g.gain.setTargetAtTime(0, t + hold, r / 3);
    chain(sum, lp, g, out);
  },
  // 笙: free reeds, chordal clusters (fourths, fifths, octaves), breath swell
  sheng: function (out, t, fs, d, v, P, x) {
    var a = P.a || 0.15, r = P.r || 0.3, hold = Math.max(d, a), end = t + hold + r * 4 + 0.1, bus = G(1), g = G(0);
    fs.forEach(function (fr) { var o = O('reed', fr, t, end); o.detune.value = R(-4, 4); bend(o.frequency, t, fr, d, x); var o2 = O('triangle', fr * 2, t, end), g2 = G(0.07); o2.detune.value = R(-3, 3); o.connect(bus); chain(o2, g2, bus); });
    var tr = am(g, t, end, 4.8, 0.06); chain(bus, F('lowpass', P.cut || 1900, 0.7), PK(1100, 1.2, 3), tr);
    var pk = v * 0.2 / Math.sqrt(fs.length); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk * 0.7, t + a);
    // the player breathes: long notes are re-articulated every few seconds (swell, sag, a short dip) so it never sits like a synth pad
    var bt = t + a, n = 0; while (hold - (bt - t) > 3.2 && n++ < 12) { var L3 = R(2.6, 3.8); g.gain.linearRampToValueAtTime(pk, bt + L3 * 0.4); g.gain.linearRampToValueAtTime(pk * 0.75, bt + L3 - 0.25); g.gain.linearRampToValueAtTime(pk * 0.3, bt + L3); g.gain.linearRampToValueAtTime(pk * 0.7, bt + L3 + 0.3); bt += L3 + 0.3; }
    g.gain.linearRampToValueAtTime(pk, Math.max(bt + 0.2, t + hold - 0.01)); g.gain.setTargetAtTime(0, Math.max(bt + 0.2, t + hold), r / 3);
    g.connect(out);
  },
  // 方響: sixteen iron/bronze slabs on a frame, struck with small mallets (free-bar partials)
  fangxiang: function (out, t, fs, d, v, P) {
    fs.forEach(function (fr) {
      var key = 'fx' + Math.round(fr), b = baked(key);
      if (b) { hitBuf(b, out, t, v * 0.8); return; }
      if (!BK[key] && !OFF) bakeSet(key, 2, 2.4, function (o, tt) { fxHit(o, tt, fr, 1); });
      fxHit(out, t, fr, v * 0.8);
    });
  },
  // monks' chant: a few voices on one pitch, syllables, no harmony
  chant: function (out, t, fs, d, v, P) {
    var S = [syl({ tn: [1, 1], d: d, a: 0.9, gap: 0 })];
    for (var k = 0; k < (P.n || 3); k++) utter(out, t + R(0, 0.03), { f0: fs[0] * R(0.99, 1.01), fs: R(0.95, 1.05), syls: S, target: -30 + 20 * Math.log10(Math.max(0.05, v)), lp: 2200, breath: 0.05, decl: 0, jit: 0.004 });
  }
};
function fxHit(out, t, f, v) {
  metal(out, t, { f: f, r: [1, 2.756, 5.404, 8.933], amp: [1, 0.35, 0.15, 0.06], d: 1.8, dk: 0.55, v: v * 0.6 });
  tone(out, t, { f: f * 1.003, d: 1.6, v: v * 0.15 }); nz(out, t, { f: Math.min(8000, f * 4), q: 2, d: 0.01, v: v * 0.2 });
}
INST.xiao = function (out, t, fs, d, v, P, x) { var Q = {}; for (var k in P) Q[k] = P[k]; Q.dark = 1; Q.a = P.a || 0.1; Q.r = P.r || 0.3; INST.flute(out, t, fs, d, v, Q, x); };
var DR = {
  j: function (o, t, v) { drum(o, t, { f: 340, d: 0.12, v: v * 0.55, hard: 1, skin: 3500 }); },
  J: function (o, t, v) { drum(o, t, { f: 345, d: 0.16, v: v * 0.75, hard: 1, skin: 4500 }); nz(o, t, { f: 3500, q: 1.5, d: 0.012, v: v * 0.3 }); },
  q: function (o, t, v) { drum(o, t, { f: 335, d: 0.08, v: v * 0.25, hard: 0.8, skin: 2500 }); },
  y: function (o, t, v) { var e = tone(o, t, { f: 150, f1: 128, pt: 0.12, d: 0.4, v: v * 0.6 }); drum(o, t, { f: 132, d: 0.35, v: v * 0.4, hard: 0.15, skin: 900 }); },
  Y: function (o, t, v) { drum(o, t, { f: 255, d: 0.15, v: v * 0.45, hard: 0.6, skin: 2500 }); nz(o, t, { f: 2200, q: 1, d: 0.02, v: v * 0.45 }); },
  k: function (o, t, v, P) { drum(o, t, { f: P.kf || 58, d: P.kd || 1.4, v: v * 0.9, hard: 0.4 }); },
  K: function (o, t, v, P) { drum(o, t, { f: (P.kf || 58) * 1.05, d: 0.7, v: v * 0.45, hard: 0.2 }); },
  p: function (o, t, v) { nz(o, t, { f: 2300, q: 1.5, d: 0.018, v: v * 0.6 }); nz(o, t + 0.008, { f: 2000, q: 1.5, d: 0.025, v: v * 0.7 }); wood(o, t, { f: 1150, d: 0.03, v: v * 0.3 }); },
  w: function (o, t, v) { tone(o, t, { f: 620, f1: 575, pt: 0.05, d: 0.18, v: v * 0.6 }); nz(o, t, { f: 1300, q: 2.5, d: 0.02, v: v * 0.55 }); },
  b: function (o, t, v, P) { zhong(o, t, { f: P.bf || 880, d: P.bd || 2.5, v: v * 0.45 }); },
  B: function (o, t, v, P) { bigBell(o, t, P.Bf || 64, v * 0.7, P.Blen || 0.8); },
  s: function (o, t, v, P) { qing(o, t, { f: P.sf || 660, d: 1.8, v: v * 0.5 }); },
  n: function (o, t, v) { nz(o, t, { c: 'pink', ft: 'lowpass', f: 1200, f1: 300, a: 0.3, d: 1.2, v: v * 0.3 }); }
};
var DRLEN = { k: 2, K: 1, B: 9, b: 3, s: 2, n: 1.6, y: 0.5, w: 0.3 };
function drumhit(ch, out, t, v, P) {
  var f = DR[ch]; if (!f) return; P = P || {}; v = v == null ? 0.8 : v;
  var key = 'md' + ch + (P.kf || '') + (P.kd || '') + (P.bf || '') + (P.Bf || '') + (P.sf || ''), b = baked(key);
  if (b) { hitBuf(b, out, t, v, R(0.985, 1.015)); return; }
  if (!BK[key] && !OFF) bakeSet(key, ch === 'B' ? 1 : 2, (DRLEN[ch] || 0.3) + 0.1, function (o, tt) { f(o, tt, 1, P); }, 1, ch === 'B' ? 24000 : null);
  f(out, t, v, P);
}

/* ======================================================================
   COMPOSITIONS — 燕樂-flavoured modes, heterophony (instruments sharing one line, each ornamenting it), drones, no chord progressions.
   div 2 = eighth-note steps; bars are 8 steps (combat: div 4, 16 steps).
   ====================================================================== */
function I(base, o) { var r = {}, k; for (k in base) r[k] = base[k]; for (k in o || {}) r[k] = o[k]; return r; }
var PIPA = { type: 'pipa', vol: 0.5, rev: 0.35 }, ZHENG = { type: 'zheng', vol: 0.45, rev: 0.45 }, KH = { type: 'konghou', vol: 0.4, rev: 0.5 },
  BILI = { type: 'bili', vol: 0.3, rev: 0.45 }, DI = { type: 'flute', vol: 0.4, rev: 0.4 }, XIAO = { type: 'xiao', vol: 0.5, rev: 0.55 },
  SHENG = { type: 'sheng', vol: 0.3, rev: 0.5, a: 1, r: 1.5 }, FX = { type: 'fangxiang', vol: 0.3, rev: 0.55 }, WX = { type: 'wuxian', vol: 0.4, rev: 0.35 };
function DRS(o) { return I({ type: 'drums', vol: 0.5, rev: 0.35 }, o); }

/* title — E 羽 (E G A B D): the 篳篥 sings over 琵琶, 箜篌 and slow drums */
tracks.title = { bpm: 58, div: 2, loop: 1, gain: 1.1,
  inst: { bili: I(BILI, { pan: -0.1, orn: 0.2 }), pipa: I(PIPA, { pan: 0.2, orn: 0.15 }), pipaT: I(PIPA, { vol: 0.4, pan: 0.25 }), kh: I(KH, { pan: -0.3 }), sheng: I(SHENG, { vol: 0.24, a: 1.5, r: 2 }),
    drum: DRS({ kf: 50, kd: 1.8, vol: 0.6, rev: 0.6 }), pb: DRS({ vol: 0.25 }), fx: I(FX, { pan: 0.35 }) },
  pat: {
    intro: { sheng: 'e3+b3+e4 -*31', drum: 'k . . . . . . . | .*8 | K~ . . . . . . . | .*8', kh: 'e3 b3 e4 g4 b4 . . . | .*8 | d3 a3 d4 e4 a4 . . . | .*8' },
    A: { bili: 'e4< - - - - - =g4 - | a4 - - - b4 - a4 - | g4 - - - e4 - - - | d4 - - - =e4 - - -', pipa: 'e3 . . . b3 . e4 . | . . g3 . a3 . . . | e3 . . . b3 . e4 . | d4 . . . e4 . . .',
      drum: 'k . . . . . . . | K~ . . . k~ . . . | k . . . . . . . | K~ . k~ . k . . .', sheng: 'e3+b3+e4 -*15 | d3+a3+d4 -*7 e3+b3+e4 -*7' },
    B: { bili: 'b4< - - - - - d5 - | e5 - - - d5 - b4 - | a4 - - - g4 - a4 - | b4 -*7', pipaT: 'b3+e4% -*7 | a3+d4% - - - g3+d4% - - - | e3+b3% -*7 | d3+a3% - - - e3+b3% - - -',
      drum: 'k . . . . . . . | K~ . . . k~ . . . | k . . . . . . . | K~ . k~ . k . . .', fx: '.*8 | e5~ .*7 | .*8 | b4~ .*7' },
    C: { pipa: 'd5 . b4 . a4 . g4 a4 | b4 . . . g4 . e4 . | g4 . a4 . b4 d5 b4 a4 | g4 . e4 . . . . .', kh: 'e3 . . . . . . . | g3 . . . . . . . | a3 . . . . . . . | e3 . . . . . . .',
      drum: 'k .*15 | K~ .*15', pb: '.*6 p . | .*6 p . | .*6 p . | . . p . . . p .' },
    D: { bili: 'd5< - - - b4 - a4 - | g4 - a4 - - - e4 - | g4 - - - a4 - =b4 - | e4 -*7', pipa: 'd4 . b3 . a3 . g3 . | g3 . a3 . . . e3 . | g3 . . . a3 . b3 . | e3 . . . . . . .',
      drum: 'k . . . k~ . . . | K~ . . . k . k~ . | k . . . k~ . . . | K~ . k . k^ . . .', sheng: 'd3+a3+d4 -*15 | e3+b3+e4 -*15', fx: 'e5~ .*15 | g5~ .*7 a5~ .*7' }
  },
  seq: ['intro', 'A', 'B', 'C', 'D', 'A', 'B/C', 'D'] };

/* city_day — D 宮 (D E F# A B): sparse 箏 and 簫 fragments; mostly silence so the city carries */
tracks.city_day = { bpm: 72, div: 2, loop: 0, gain: 1.7,
  inst: { zheng: I(ZHENG, { prob: 0.9, orn: 0.15 }), xiao: I(XIAO, { vol: 0.4, hum: 0.04, orn: 0.2 }), kh: I(KH, { vol: 0.3 }) },
  pat: {
    A: { zheng: 'd4 . . a4 . . b4 . | a4 - - - f#4 . . . | e4 . . d4 . . e4 . | f#4 . . . . . . . | .*8 | b3 . . d4 . . e4 . | d4 - - - . . . . | .*8' },
    B: { xiao: 'a4 - - - b4 - - - | a4 - f#4 - e4 - - - | d4 -*7 | .*8 | e4 - - - f#4 - a4 - | b4 - - - a4 - - - | f#4 - - - e4 - - - | d4 -*7',
      kh: '.*4 d3 . . . | .*8 | .*4 a2 . . . | .*8 | .*4 b2 . . . | .*8 | .*4 d3 . . . | .*8' },
    C: { zheng: "d5' .*7 | .*8 | a4' .*7 | .*8 | .*8 | e5' .*7 | .*8 | .*8", kh: 'd2 .*15 | a2 .*15 | .*16 | .*16' },
    R: { kh: '.*32' }
  },
  seq: ['A', 'R', 'B', 'C', 'R', 'A/B', 'C'] };

/* night — A 羽 (A C D E G): a lone 簫, a few low 箏 strings */
tracks.night = { bpm: 46, div: 2, loop: 0, gain: 1,
  inst: { xiao: I(XIAO, { vol: 0.55, rev: 0.65, hum: 0.06, orn: 0.25 }), zheng: I(ZHENG, { vol: 0.35, rev: 0.6, prob: 0.85 }) },
  pat: {
    A: { xiao: 'e4 -*5 . . | g4 - a4 - - - - - | c5 - - - a4 - g4 - | e4 -*7 | .*8 | d4 - e4 - g4 - - - | e4 - d4 - c4 - - - | a3 -*7 | .*8' },
    B: { zheng: 'a2 . . . e3 . . . | .*8 | g2 . . . d3 . . . | .*8', xiao: '.*16 | a4~ - - - g4 - e4 - | g4 -*7' },
    C: { xiao: 'a4< -*7 | c5 - - - d5 - - - | e5 - - - - - d5 - | c5 - a4 - - - - - | g4 - - - e4 - - - | g4 - a4 - - - - - | a4 -*7 | .*8', zheng: "a2 .*31 | .*16 | e4' .*15" },
    R: { zheng: '.*16' }
  },
  seq: ['A', 'B', 'R', 'C', 'B', 'R', 'A/C'] };

/* tavern — a 胡 dance (胡旋 / 柘枝 feel) in a heptatonic D mode with C natural: 琵琶, 橫笛, 羯鼓, 腰鼓, 拍板 */
var TM1 = 'a4 - b4 a4 f#4 - e4 - | d4 - e4 - f#4 - a4 - | b4 - c5 b4 a4 - f#4 - | a4 - - - - - . .';
var TM2 = 'd5 - c5 b4 a4 - b4 - | c5 - b4 a4 f#4 - e4 - | f#4 - a4 - e4 - d4 - | d4 - - - - - . .';
var TP1 = 'a4 . b4 a4 f#4 . e4 . | d4 . e4 . f#4 . a4 . | b4 . c5 b4 a4 . f#4 . | a4% - - - - - . .';
var TP2 = 'd5 . c5 b4 a4 . b4 . | c5 . b4 a4 f#4 . e4 . | f#4 . a4 . e4 . d4 . | d4% - - - - - . .';
var TRUN = 'd5 c5 b4 a4 b4 a4 f#4 e4 | f#4 a4 f#4 e4 d4 e4 f#4 a4 | b4 a4 b4 c5 d5 c5 b4 a4 | b4 a4 f#4 e4 d4 . . .';
var JG1 = 'J . j j J . j . | J . j j . j J . | J . j j J . j . | J j j . J . J .', JG2 = 'J j j . J . j j | J . j . J j J . | J j j . J . j j | J . J . J J J .';
tracks.tavern = { bpm: 138, div: 2, loop: 1, gain: 1,
  inst: { pipa: I(PIPA, { vol: 0.42, pan: 0.15, orn: 0.15 }), ost: I(PIPA, { vol: 0.34, pan: -0.2, ring: 0.2 }), di: I(DI, { vol: 0.34, pan: -0.1, orn: 0.3 }), wx: I(WX, { pan: 0.3 }),
    jg: DRS({ vol: 0.5, rev: 0.25, pan: 0.1 }), yg: DRS({ vol: 0.5, rev: 0.25, pan: -0.15 }), pb: DRS({ vol: 0.3, rev: 0.2, pan: 0.25 }) },
  pat: {
    intro: { ost: 'd3 . a3 . d4 . a3 . | c4 . a3 . g3 . a3 .', yg: 'y . . Y . . y . | y . Y . y . Y .' },
    A: { ost: 'd3 . a3 . d4 . a3 . | c4 . a3 . g3 . a3 .', yg: 'y . . Y . . y . | y . Y . y . Y .', jg: JG1, di: TM1, pb: 'p . . . p . . .' },
    A2: { ost: 'd3 . a3 . d4 . a3 . | c4 . a3 . g3 . a3 .', yg: 'y . . Y . . y . | y . Y . y . Y .', jg: JG2, di: TM1, pipa: TP1, pb: 'p . . . p . . .' },
    B: { ost: 'd3 . a3 . d4 . a3 . | c4 . a3 . g3 . a3 .', yg: 'y . Y Y y . Y . | y . Y . y Y Y .', jg: JG1, di: TM2, pipa: TP2, pb: 'p . . . p . p .' },
    C: { ost: 'd3 . d3 . c3 . c3 . | d3 . d3 . a2 . a2 .', yg: 'y . Y . y . Y . | y Y . Y y . Y .', jg: JG2, pipa: TRUN, wx: 'd4 . . . a3 . . . | c4 . . . a3 . . .', pb: 'p . . . p . . .' },
    C2: { ost: 'd3 . d3 . c3 . c3 . | d3 . d3 . a2 . a2 .', yg: 'y . Y . y . Y . | y Y . Y y . Y .', jg: JG1, pipa: TRUN, di: '.*16 | b4 - c5 - d5 - - - | a4 - - - - - . .', pb: 'p . . . p . . .' },
    D: { jg: 'J . . . J . . . | J j J j J . . . | J . . . J . . . | J j J j J J J .', yg: 'y . . . y . . . | y . y . y . . . ', pb: 'p . . . p . . . | p . p . p . . .', wx: 'd3 . . . . . . . | .*8 | a2 . . . . . . . | .*8' }
  },
  seq: ['intro', 'A', 'B', 'A2', 'C', 'D', 'B', 'C2/C', 'A2/A', 'D'] };

/* quarter — 平康坊: refined 箏 / 琵琶 duet, G 宮 (G A B D E), heterophonic */
var QZ1 = 'd5 - - - e5 - d5 b4 | a4 - - - g4 - - - | a4 - b4 - d5 - - - | b4 - a4 - g4 - - - | e4 - - - g4 - a4 - | b4 - - - a4 - g4 - | e4 - d4 - e4 - g4 - | g4 -*7';
var QP1 = 'd4 . . d4 e4 . d4 b3 | a3 . . a3 g3 . . . | a3 . b3 . d4 . d4 . | b3 . a3 . g3 . . . | e3 . . e3 g3 . a3 . | b3 . . b3 a3 . g3 . | e3 . d3 . e3 . g3 . | g3% -*7';
var QZ2 = 'g4 - a4 - b4 - d5 - | e5 - - - =d5 - - - | b4 - d5 - a4 - - - | g4 - - - e4 - - - | d4 - e4 - g4 - a4 - | b4 - - - d5 - b4 - | a4 - - - =g4 - - - | g4 -*7';
tracks.quarter = { bpm: 66, div: 2, loop: 0, gain: 1.9,
  inst: { zheng: I(ZHENG, { pan: -0.25, orn: 0.2 }), pipa: I(PIPA, { vol: 0.4, pan: 0.25, orn: 0.2 }), xiao: I(XIAO, { vol: 0.35, orn: 0.2 }), pb: DRS({ vol: 0.22, rev: 0.3 }), zl: I(ZHENG, { vol: 0.3, pan: -0.25 }) },
  pat: {
    A: { zheng: QZ1, pb: 'p . . . . . . . ', zl: 'g2 .*15 | d3 .*15 | e2 .*15 | g2 .*15' },
    B: { zheng: QZ2, pipa: QP1, pb: 'p . . . . . . . ' },
    A2: { pipa: QZ1, zheng: "g5' .*15 | d5' .*15 | e5' .*15 | g4' .*15", pb: 'p . . . . . p . ' },
    C: { xiao: QZ2, zl: 'g2 .*7 d3 .*7 | e3 .*15 | d3 .*7 a2 .*7 | g2 .*15', zheng: '.*32 | ' + QP1.split('|').slice(4).join('|') }
  },
  seq: ['A', 'B', 'A2', 'C', 'B/A'] };

/* temple — monks chanting on one tone, 木魚 keeping time, 笙 drone, bells */
tracks.temple = { bpm: 60, div: 2, loop: 1, gain: 1,
  inst: { ch: { type: 'chant', vol: 0.8, rev: 0.6, n: 3 }, w: DRS({ vol: 0.45, rev: 0.4 }), sheng: I(SHENG, { vol: 0.16, a: 3, r: 3, rev: 0.6 }), bell: DRS({ vol: 0.35, rev: 0.7, bf: 587, Bf: 73.4, Blen: 0.9 }), qg: DRS({ vol: 0.3, rev: 0.6, sf: 1175 }) },
  pat: {
    intro: { sheng: 'd3+a3+d4 -*31', bell: 'B .*31', qg: '.*16 s .*15' },
    A: { ch: 'd3 - d3 - d3 - d3 - | d3 - d3 - e3 - d3 - | d3 - d3 - d3 - a2 - | d3 -*7', w: 'w . w . w . w . | w . w . w . w . | w . w . w . w . | w . . . . . . .', sheng: 'd3+a3+d4 -*31' },
    B: { ch: 'a2 - d3 - d3 - e3 - | d3 - d3 - d3 - d3 - | e3 - d3 - a2 - a2 - | d3 -*7', w: 'w . w . w . w . | w . w . w . w . | w . w . w . w . | w . . . . . . .', bell: '.*24 | b .*7', sheng: 'd3+a3+e4 -*31' },
    C: { sheng: 'd3+a3+d4 -*31', bell: 'B .*31', qg: 's .*15 | s~ .*15' }
  },
  seq: ['intro', 'A', 'A', 'B', 'A', 'C'] };

/* stealth — adaptive with AU.set({alert}): low 箜篌 ostinato always; 琵琶 tremolo, 羯鼓 ghosts, drum, 篳篥 stabs fade in as alert rises */
tracks.stealth = { bpm: 84, div: 2, loop: 0, gain: 1, adapt: true,
  inst: { low: I(KH, { vol: 0.5, rev: 0.4 }), pulse: DRS({ vol: 0.35, rev: 0.3 }), xiao: I(XIAO, { vol: 0.3, rev: 0.6, al: [0.75, 0.3], alInv: 0 }),
    pipaT: I(PIPA, { vol: 0.3, al: [0.3, 0.6] }), jg: DRS({ vol: 0.35, rev: 0.2, al: [0.35, 0.65] }), bili: I(BILI, { vol: 0.24, al: [0.65, 0.9] }), drum: DRS({ vol: 0.5, kf: 54, rev: 0.4, al: [0.55, 0.85] }) },
  pat: {
    A: { low: 'e2 . . b2 . . e3 . | f2 . . c3 . . f3 . | e2 . . b2 . . e3 . | d2 . . a2 . . d3 .', pulse: 'y~ . . . y! . . . | y~ . . . y! . . . | y~ . . . y! . . . | y~ . . . y! . y! .',
      xiao: 'b3 -*7 | c4 -*5 b3 - | a3 -*7 | .*8', pipaT: 'e3+b3% -*7 | f3+c4% -*7 | e3+b3% -*7 | d3+a3% - - - . . . .', jg: 'q . q q . q . q | q . q q . q J . | q . q q . q . q | q q q . J . J .',
      bili: '.*8 | f4< - - - e4 - . . | .*8 | c5< - - - =b4 - . .', drum: 'k . . . . . k . | k . . . . . . . | k . . . . . k . | k . . . k . k .' },
    B: { low: 'e2 . . b2 . . e3 . | c3 . . g2 . . c3 . | a2 . . e3 . . a3 . | b2 . . f2 . . b2 .', pulse: 'y~ . . . y! . . . | y~ . . . y! . . . | y~ . . . y! . . . | y~ . y! . y! . y! .',
      xiao: 'e4 -*7 | f4 -*5 e4 - | c4 -*7 | b3 -*7', pipaT: 'e3+b3% -*7 | c3+g3% -*7 | a2+e3% -*7 | b2+f3% -*7', jg: 'q . q q . q . q | q . q q . q . q | q . q q . q J . | J . q J . q J .',
      bili: '.*8 | b4< - - - c5 - . . | .*8 | f4< - - - =e4 - . .', drum: 'k . . . . . k . | k . . . . . . . | k . . . k . . . | k . k . k . k .' },
    C: { low: 'e2 . . . . . . . | . . . . f2 . . . | e2 . . . . . . . | . . d2 . . . . .', pulse: 'y! . . . . . . . | y! . . . . . . . | y! . . . . . . . | y! . . . y! . . .',
      xiao: 'a3 -*15 | b3 -*7 . . . . . . . .', pipaT: 'e3% -*15 | f3% -*7 e3% -*7', jg: 'q . . q . . q . | q . . q . . q . | q . . q . . q . | q q . q J . J .',
      bili: '.*16 | e5< - - - =f5 - - - | e5 - - - . . . .', drum: 'k . . . . . . . | .*8 | k . . . . . . . | k . . . k . . .' }
  },
  seq: ['A', 'B', 'C', 'A', 'B/C'] };

/* combat — fast 羯鼓 + 腰鼓 + big drum, 篳篥 riff, 琵琶 tremolo / runs; 16th-note grid */
tracks.combat = { bpm: 148, div: 4, loop: 0, gain: 0.55,
  inst: { jg: DRS({ vol: 0.5, rev: 0.2, pan: 0.15 }), yg: DRS({ vol: 0.45, rev: 0.2, pan: -0.15 }), drum: DRS({ vol: 0.6, kf: 56, kd: 1, rev: 0.3 }),
    bili: I(BILI, { vol: 0.3 }), pipaT: I(PIPA, { vol: 0.32, tr: 16 }), pipa: I(PIPA, { vol: 0.4, pan: 0.2 }) },
  pat: {
    A: { jg: 'J . j j J . j j J . j j J j J j', yg: 'y . Y . y y Y . y . Y . y Y Y .', drum: 'k . . . . . k . . . k . . . . . | k . . . . . k . . . k . . . k .',
      bili: 'e5< - - - - - d5 - b4 - - - a4 - b4 - | e5 - - - g5 - e5 - d5 - b4 - a4 - - - | b4< - - - - - a4 - g4 - - - e4 - g4 - | a4 - - - b4 - - - e4 - - - - - - -',
      pipaT: 'e3+b3% -*7 e3+b3% -*7 | f3+c4% -*7 e3+b3% -*7 | d3+a3% -*7 d3+a3% -*7 | e3+b3% -*15' },
    B: { jg: 'J j j j J . j j J j j . J j J j', yg: 'y . Y . y y Y . y . Y . y Y Y .', drum: 'k . . . k . . . k . . . k . k . | k . . . k . . . k . k . k k k .',
      pipa: 'e4 g4 a4 b4 d5 b4 a4 g4 e4 g4 a4 b4 a4 g4 e4 d4 | e4 . e4 . f4 . e4 . d4 . b3 . a3 . b3 . | e4 g4 a4 b4 d5 e5 d5 b4 a4 b4 a4 g4 e4 g4 e4 d4 | e4 . . . e4 . . . e3+b3 . . . . . . .',
      bili: '.*32 | e5< - - - - - - - f5 - e5 - d5 - b4 - | e5 -*15' },
    C: { jg: 'J . . . J . . . J . j j J . . . | J j j j J j j j J j J j J J J .', drum: 'k . . . . . . . k . . . . . . . | k . . . k . . . k . k . k . k .', yg: 'y . . . Y . . . y . . . Y . Y .',
      pipaT: 'e3+b3% -*15 | f3+c4% -*15', bili: 'f5< - - - e5 - - - b4 - - - c5 - - - | e5< -*15' },
    D: { jg: 'q . q . q . q . q . q . J . J . | q . q . q . q . J . J . J J J .', yg: 'y . Y Y y . Y . y Y . Y y . Y Y', drum: 'k . . . . . . . k . . . . . . . | k . . . . . . . k . . k . k . .',
      bili: 'b4% -*15 | a4 - - - g4 - - - e4 -*7' },
    E: { pipa: 'e4 g4 a4 . e4 g4 b4 . . . . . . . . . | a4 b4 d5 . b4 a4 g4 . . . . . . . . .', jg: '. . . . . . . . J j j J j j J . | . . . . . . . . J j J j J J J .',
      drum: 'k . . . . . . . . . . . . . . . | k . . . . . . . . . . . k . k .', yg: '. . . . . . . . y . Y . y Y Y .' }
  },
  seq: ['A', 'B', 'A', 'C', 'D', 'E', 'B/A', 'C/E'] };

/* mission_done — a short flourish: 琵琶 sweep, 方響 run, 笙 cluster, drum, bell (once) */
tracks.mission_done = { bpm: 76, div: 2, once: true, tail: 6, gain: 1.1,
  inst: { pipa: I(PIPA, { vol: 0.55, strum: 0.03 }), fx: I(FX, { vol: 0.32 }), sheng: I(SHENG, { vol: 0.3, a: 0.3, r: 2 }), drum: DRS({ vol: 0.55, kf: 52, rev: 0.5 }), bell: DRS({ vol: 0.3, rev: 0.7, bf: 659 }) },
  pat: { A: { pipa: 'e3+b3+e4+g4 . . . g4 . a4 . | b4% -*7 | e4+b4 . . . . . . .', fx: 'e5 . g5 . a5 . b5 . | e6 -*7 | .*8', sheng: 'e3+b3+e4 -*15 | .*8', drum: 'k . . . . . . . | k~ . . . . . . . | k . . . . . . .', bell: '.*8 | b .*7 | .*8' } },
  seq: ['A'] };

/* positional music emitters (AU.loop(key, 'music:tavern', {x,y,z})) */
Object.keys(tracks).forEach(function (k) { loopDefs['music:' + k] = { rev: 0.2, ref: 5, maxd: 90, music: k, fn: function () {} }; });

/* ======================================================================
   SPEECH (AU.say): Middle Chinese lines from speech.js, synthesised by mcsynth.js (MC.synth), then "put into the world":
   band-limited 120 Hz-5 kHz, a gentle high tilt, breath/air noise that follows the voice, slow shimmer, soft saturation
   (all of which hide the buzzy formant-synth source), normalised to a per-context level that sits under the street,
   then played through the same positional chain as every emitter (distance lowpass, pan, indoor muffling, room/city reverb).
   Buffers are cached per line x voice x speaker-variant x mood; cache misses are rendered at most one per 120 ms
   (the rest are queued and rendered in idle ticks), so AU.say never stalls a frame for long.
   ====================================================================== */
var SAYTEST = [   // used until speech.js (SPEECH.lines) is loaded
  { id: 't_hawk1', ctx: 'hawk', zh: '胡餅！熱胡餅！', bax: 'hu pjiengX！ nyet hu pjiengX！', trade: 'bakery' },
  { id: 't_invite1', ctx: 'invite', zh: '好酒，進來坐。', bax: 'xawX tsjuwX， tsinH loj dzwaX。', trade: 'wineshop' },
  { id: 't_guard1', ctx: 'guard', zh: '站住！何人？', bax: 'treamH drjuH！ ha nyin？' },
  { id: 't_bump1', ctx: 'bump', zh: '借過，借過。', bax: 'tsjaeH kwaH， tsjaeH kwaH。' },
  { id: 't_haggle1', ctx: 'haggle', zh: '多少錢？太貴了。', bax: 'ta syewX dzjen？ thajH kjwiojH lewX。' },
  { id: 't_farewell1', ctx: 'farewell', zh: '慢走。', bax: 'maenH tsuwX。' },
  { id: 't_monk1', ctx: 'monk', zh: '阿彌陀佛。', bax: "'a mjie da bjut。" },
  { id: 't_beggar1', ctx: 'beggar', zh: '施主，可憐我。', bax: 'sye tsyuX， khaX len ngaX。' },
  { id: 't_child1', ctx: 'child', zh: '娘，我要糖。', bax: "nrjang， ngaX 'jiewH dang。" },
  { id: 't_chat1', ctx: 'chat', zh: '今日天熱。', bax: 'kim nyit then nyet。' },
  { id: 't_chat2', ctx: 'chat', zh: '多少錢？', bax: 'ta syewX dzjen？' }
];
var CTXMOOD = { hawk: 'shout', guard: 'angry', react: 'afraid', beggar: 'sad', child: 'happy', invite: 'happy', greet: 'happy', wineshop: 'happy' };
var CTXLVL = { hawk: -25, guard: -24, react: -26, bump: -28, invite: -29, wineshop: -29 };   // dBFS rms of the voiced part (crowd murmur events sit at -29)
var SAY = { cache: {}, n: 0, recent: {}, active: [], last: -1e9, pend: {}, np: 0 };
function sayBank() { try { if (typeof SPEECH !== 'undefined' && SPEECH && SPEECH.lines && SPEECH.lines.length) return SPEECH; } catch (e) {} return window.SPEECH && window.SPEECH.lines ? window.SPEECH : null; }   // speech.js declares a global const
function sayLines() { var S = sayBank(); return S ? S.lines : SAYTEST; }
function sayText(line) { var S = sayBank(); try { if (S && S.text && line.zh && line.bax) return S.text(line); } catch (e) {} return line.bax || line.text || ''; }
function whoHas(l, w) { return !l.who || (Array.isArray(l.who) ? l.who.indexOf(w) >= 0 : l.who === w || l.who === 'any'); }
function sayVoice(o) {
  var VS = window.MC && MC.VOICES || {}, w = o.who || '', S = sayBank(), vf = S && S.meta && S.meta.voiceFor;
  if (vf && vf[w] && !(w === 'beggar' && o.pitch > 1.18)) return vf[w];
  if (VS[w]) return w;
  if (/child|boy|girl/.test(w)) return 'child'; if (/crone|old.?wom/.test(w)) return 'crone'; if (/elder|old/.test(w)) return 'elder';
  if (/wom|girl|lady|maid|hu ?ji|胡姬/.test(w)) return 'woman';
  var p = o.pitch || 1; return p < 0.75 ? 'child' : p > 1.18 ? 'woman' : 'man';
}
function sayPick(o) {
  var L = sayLines(), i, c = [], rk = (o.ctx || '') + '|' + (o.trade || '');
  if (o.id) { for (i = 0; i < L.length; i++) if (L[i].id === o.id) return L[i]; }
  var vv = sayVoice(o);
  for (i = 0; i < L.length; i++) {
    var l = L[i]; if (o.ctx && l.ctx !== o.ctx) continue;
    if (o.trade && l.trade && l.trade !== o.trade) continue;
    if (o.who && !whoHas(l, o.who)) continue;
    c.push(l);
  }
  if (!c.length && o.ctx) for (i = 0; i < L.length; i++) if (L[i].ctx === o.ctx && (!o.trade || !L[i].trade || L[i].trade === o.trade) && whoHas(L[i], vv)) c.push(L[i]);   // same voice type
  if (!c.length && o.ctx) for (i = 0; i < L.length; i++) if (L[i].ctx === o.ctx) c.push(L[i]);
  if (!c.length) return null;
  var rec = SAY.recent[rk] || (SAY.recent[rk] = []), fresh = c.filter(function (l) { return rec.indexOf(l.id) < 0; });
  var l2 = pick(fresh.length ? fresh : c); rec.push(l2.id); if (rec.length > Math.min(8, c.length - 1)) rec.shift();
  return l2;
}
/* biquad (RBJ) in JS for the speech post-processing */
function bq2(type, f, q, sr) {
  var w = 2 * Math.PI * f / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al, b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; } else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cw / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function bqStep(f, x) { var y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y; return y; }
function speechFX(x, sr, lvl, seed) {
  /* soften the formant synth toward the murmur engine: no added noise, no saturation. 140 Hz high-pass, ~-6 dB high shelf
     above 2.5 kHz, a gentle 1-pole lowpass at 2.9 kHz, and a soft doubling (2nd voice 10-15 ms later, slow +-10 cent drift)
     that blurs the buzzy pulse train; then the level is matched to the murmur barks. */
  var n = x.length, pad = Math.ceil(0.02 * sr), m = n + pad, y = new Float32Array(m), hp = bq2('hp', 140, 0.7, sr), hp2 = bq2('hp', 140, 0.7, sr), i;
  var ksh = 1 - Math.exp(-2 * Math.PI * 2500 / sr), klp = 1 - Math.exp(-2 * Math.PI * 2900 / sr), sh = 0, lp = 0, ph = (seed % 7) * 0.9;
  for (i = 0; i < m; i++) {
    var dl = (0.0125 + 0.0012 * Math.sin(2 * Math.PI * 0.6 * i / sr + ph)) * sr, j = i - dl, j0 = Math.floor(j), fr = j - j0;
    var a = i < n ? x[i] : 0, b = j0 >= 0 && j0 + 1 < n ? x[j0] * (1 - fr) + x[j0 + 1] * fr : 0;
    var v = a * 0.56 + b * 0.44;                                           // soft doubling
    sh += (v - sh) * ksh; v = sh + (v - sh) * 0.5;                           // high shelf: -6 dB above ~2.5 kHz
    lp += (v - lp) * klp; v = lp;                                            // 1-pole lowpass 3.3 kHz
    y[i] = bqStep(hp2, bqStep(hp, v));
  }
  var ss = 0, cnt = 0;
  for (i = 0; i < m; i++) { var u = y[i]; if (u > 0.003 || u < -0.003) { ss += u * u; cnt++; } }
  var sc = cnt ? Math.pow(10, lvl / 20) / Math.sqrt(ss / cnt) : 0;
  for (i = 0; i < m; i++) y[i] *= sc;
  for (i = 0; i < 64 && i < m; i++) { y[i] *= i / 64; y[m - 1 - i] *= i / 64; }
  return y;
}
function sayKey(line, vname, sv, mood, pitch) { return line.id + '|' + vname + '|' + sv + '|' + mood + '|' + (pitch || 1).toFixed(2); }
function sayLvl(ctx, vname) { return (CTXLVL[ctx] != null ? CTXLVL[ctx] : -30) + (vname === 'child' ? -2 : 0); }
function sayOpts(vname, mood, sv, pitch) {   // like the murmur engine: smooth soft source (low tilt corner), no breath noise, wide soft formants, almost no jitter/shimmer
  var VS = MC.VOICES[vname] || {}; return { voice: vname, mood: mood === 'whisper' ? 'neutral' : mood, seed: sv * 101 + 7, sr: 16000, pitch: pitch || 1, jit: 0.006, breath: 0, tilt: Math.min(1500, (VS.tilt || 2600) * 0.6), bw: 1.6, shimmer: 0.25, vib: (VS.vib || 0.006) * 0.8 };
}
/* synthesis runs in a Web Worker built from a Blob (mcsynth source + speechFX), so a new line never stalls the game;
   without Worker support it falls back to the main thread (at most one render per 120 ms). */
function sayWorker() {
  if (SAY.w !== undefined) return SAY.w;
  SAY.w = null;
  try {
    if (OFF || !window.Worker || !window.Blob || !window.URL || !window.MC_SRC) return null;
    var src = window.MC_SRC + '\n' + bq2.toString() + '\n' + bqStep.toString() + '\n' + speechFX.toString() + '\n' +
      'onmessage = function (e) { var q = e.data, y; try { var x = MC.synth(MC.parse(q.text, null), q.opts); y = speechFX(x, q.opts.sr, q.lvl, q.seed); } catch (err) { y = new Float32Array(0); } postMessage({ key: q.key, y: y }, [y.buffer]); };';
    var w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = function (e) { sayDone(e.data.key, e.data.y); };
    w.onerror = function () { SAY.w = null; SAY.pend = {}; };
    SAY.w = w;
  } catch (e) { SAY.w = null; }
  return SAY.w;
}
function sayDone(key, y) {
  var cbs = SAY.pend[key] || []; delete SAY.pend[key]; SAY.np = Math.max(0, SAY.np - 1);
  if (!y || !y.length || !ac) return;
  var b = ac.createBuffer(1, y.length, 16000); b.getChannelData(0).set(y);
  if (++SAY.n > 300) { SAY.cache = {}; SAY.n = 0; } SAY.cache[key] = b;
  cbs.forEach(function (f) { try { f(b); } catch (e) {} });
}
function sayReq(line, vname, mood, sv, pitch, cb) {   // async render; cb(buffer) when ready
  var key = sayKey(line, vname, sv, mood, pitch), w = sayWorker();
  if (!w) return false;
  if (SAY.pend[key]) { if (cb) SAY.pend[key].push(cb); return true; }
  SAY.pend[key] = cb ? [cb] : []; SAY.np++;
  w.postMessage({ key: key, text: sayText(line), opts: sayOpts(vname, mood, sv, pitch), lvl: sayLvl(line.ctx, vname), seed: sv + 3 });
  return true;
}
function sayBuffer(line, voice, mood, sv, pitch) {   // synchronous render (offline renders, or no Worker)
  var key = sayKey(line, voice, sv, mood, pitch), b = SAY.cache[key];
  if (b) return b;
  if (!window.MC) return null;
  var seq = MC.parse(sayText(line), null); if (!seq.length) return null;   // bax is authoritative: no dictionary at runtime
  var y = speechFX(MC.synth(seq, sayOpts(voice, mood, sv, pitch)), 16000, sayLvl(line.ctx, voice), sv + 3), ab = ac.createBuffer(1, y.length, 16000); ab.getChannelData(0).set(y);
  if (!OFF) { if (++SAY.n > 300) { SAY.cache = {}; SAY.n = 0; } SAY.cache[key] = ab; }
  return ab;
}
function sayPlay(b, o, d, t) {
  var pos = o.x != null && o.z != null;
  if (SAY.active.length >= 4 && !OFF) {   // at the cap: a nearer speaker replaces the farthest one
    var far = null; SAY.active.forEach(function (a) { if (!far || a.d > far.d) far = a; });
    if (!far || far.d <= d + 2) return 0;
    kill(far.v, 0.25); SAY.active.splice(SAY.active.indexOf(far), 1);
  }
  var oo = { x: o.x, y: o.y, z: o.z, vol: o.vol == null ? 1 : o.vol, ref: { hawk: 5, guard: 6, react: 4, child: 3.5 }[o._ctx] || 2.5, maxd: (o.maxd || 25) + 5, muffle: o.muffle, cut: 1500 + 3500 / (1 + d / 8) };
  if (!pos) { delete oo.x; delete oo.z; }
  if (!steal(2)) return 0;
  var v = voice(oo, 0.12); voices.push(v); v.pri = 2; t = Math.max(t || 0, ac.currentTime + 0.01);   // same reverb send as the murmur barks
  hitBuf(b, v.in, t, 1); var du = b.duration; v.t0 = t; v.end = t + du;
  if (!OFF) { var rec = { v: v, d: pos ? d : 0 }; SAY.active.push(rec); later(t - ac.currentTime + du + 0.3, function () { var k = SAY.active.indexOf(rec); if (k >= 0) SAY.active.splice(k, 1); free(v); }); }
  return du;
}
function sayEst(line, mood) { var n = (line.bax || '').split(/\s+/).length, p = (line.zh || '').replace(/[^，。！？]/g, '').length; return (n * 0.27 + p * 0.25 + 0.3) / ((MC.MOODS[mood] || {}).rate || 1); }
function sayAt(o, t) {   // returns duration (estimated when the line is still being rendered) or 0
  var line = sayPick(o); if (!line || !window.MC) return 0;
  var vname = sayVoice(o), mood = o.mood || line.mood || CTXMOOD[line.ctx] || 'neutral', sv = Math.abs((o.seed == null ? (rnd() * 3) | 0 : o.seed) | 0) % 3;
  if (!MC.MOODS[mood]) mood = 'neutral';
  var pos = o.x != null && o.z != null, d = 0;
  if (pos) { var dx = o.x - L.x, dz = o.z - L.z; d = Math.sqrt(dx * dx + dz * dz); if (d > (o.maxd || 25) && !OFF) return 0; }
  if (!OFF && SAY.active.length >= 4) { var fd = 0; SAY.active.forEach(function (a) { fd = Math.max(fd, a.d); }); if (fd <= d + 2) return 0; }
  o._ctx = line.ctx;
  var key = sayKey(line, vname, sv, mood, o.pitch), b = SAY.cache[key];
  if (b) return sayPlay(b, o, d, t);
  if (OFF) { b = sayBuffer(line, vname, mood, sv, o.pitch); return b ? sayPlay(b, o, d, t) : 0; }
  var t0 = now_(), oc = {}; for (var k in o) oc[k] = o[k];
  if (sayReq(line, vname, mood, sv, o.pitch, function (bb) { if (now_() - t0 < 1500) sayPlay(bb, oc, d, 0); })) return sayEst(line, mood);
  if (now_() - SAY.last < 120) return 0;   // no worker: main-thread render, rate-limited
  SAY.last = now_(); b = sayBuffer(line, vname, mood, sv, o.pitch); return b ? sayPlay(b, o, d, t) : 0;
}
function sayIdle() {   // prewarm the lines heard most (bumps, guards, reactions, vendors' cries) in the worker, one at a time
  if (SAY.w === undefined) sayWorker();
  if (!SAY.w || SAY.np > 1 || !window.MC) return;
  var S = sayBank(); if (!S) return;
  if (!SAY.warm) { SAY.warm = S.lines.filter(function (l) { return /^(bump|guard|react|hawk|greet)$/.test(l.ctx); }); SAY.wi = 0; }
  if (SAY.wi >= SAY.warm.length) return;
  var l = SAY.warm[SAY.wi++], w0 = Array.isArray(l.who) ? l.who[0] : l.who, vname = sayVoice({ who: w0 }), mood = l.mood || CTXMOOD[l.ctx] || 'neutral';
  if (!MC.MOODS[mood]) mood = 'neutral';
  if (!SAY.cache[sayKey(l, vname, 0, mood, 1)]) sayReq(l, vname, mood, 0, 1, null);
}

/* ======================================================================
   PUBLIC API
   ====================================================================== */
var wantMus = null, lastTick = 0, timer = null, nTick = 0;
var TS = { n: 0, sum: 0, max: 0, bq: 0, bqMax: 0 }, LS = { x: 0, y: 0, z: 0, yaw: 0 };
function tick() { var t0 = now_(); tick1(); var d = now_() - t0; TS.n++; TS.sum += d; if (d > TS.max) TS.max = d; }
function tick1() {
  if (!ac || !M) return;
  var now = ac.currentTime, dt = now - lastTick; if (dt < 0.09) { var tJ = now_(); pumpJobs(now + 0.3); TS.jobs = (TS.jobs || 0) + now_() - tJ; return; } lastTick = now; dt = Math.min(dt, 0.5);
  var tA = now_(); try { ambTick(now, dt); } catch (e) { console.error('AU amb', e); } TS.amb = (TS.amb || 0) + now_() - tA;
  tA = now_(); pumpJobs(now + 0.3); TS.jobs = (TS.jobs || 0) + now_() - tA;
  if ((nTick & 3) === 1) { try { sayIdle(); } catch (e) {} }
  var tA = now_(); if ((nTick++ & 1) === 0) updateEmitters();
  if (L.x !== LS.x || L.z !== LS.z || L.y !== LS.y || L.yaw !== LS.yaw) {   // listener moved: refresh long-lived positional voices
    LS.x = L.x; LS.y = L.y; LS.z = L.z; LS.yaw = L.yaw;
    for (var j = 0; j < voices.length; j++) { var v = voices[j]; if (v.pos && !v.dead && v.end - v.t0 > 0.7 && v.end > now) { spatial(v); if (v.recalc) v.recalc(); } }
  }
  TS.emit = (TS.emit || 0) + now_() - tA;
  for (var i = drumSets.length - 1; i >= 0; i--) if (now > drumSets[i].end) drumSets.splice(i, 1);
}
function bakeMusicDrums() {
  Object.keys(tracks).forEach(function (id) {
    var T = tracks[id];
    Object.keys(T.inst).forEach(function (v) {
      var I = T.inst[v]; if (I.type !== 'drums') return; var used = {};
      Object.keys(T.pat).forEach(function (pn) { var s = T.pat[pn][v]; if (s) s.replace(/[^a-zA-Z]/g, '').split('').forEach(function (c) { used[c] = 1; }); });
      Object.keys(used).forEach(function (ch) { var f = DR[ch]; if (!f) return; var key = 'md' + ch + (I.kf || '') + (I.kd || '') + (I.bf || '') + (I.Bf || '') + (I.sf || ''); bakeSet(key, ch === 'B' ? 1 : 2, (DRLEN[ch] || 0.3) + 0.1, function (o, tt) { f(o, tt, 1, I); }, 1, ch === 'B' ? 24000 : 32000); });
    });
  });
}
function stagedBakes() {
  M.irs.forEach(function (c) { bq(function () { c[0].buffer = c[1](); }); });
  if (window.AU_NOBAKE) return;   // debugging: live synthesis only
  bq(bakeSteps); bq(bakeHits); bq(bakeBeds); bq(bakeMusicDrums);
}
var AU = {
  init: function () {
    if (!ac) {
      if (!AC) { console.warn('AU: Web Audio unavailable'); return null; }
      try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { ac = new AC(); }
      build(); startAmb(); lastTick = ac.currentTime;
      timer = setInterval(tick, 50);
      stagedBakes();
      if (wantMus) AU.music(wantMus.name, wantMus.o);
    }
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    return ac;
  },
  listener: function (x, y, z, yaw) {
    L.x = +x || 0; L.y = +y || 0; L.z = +z || 0; L.yaw = +yaw || 0;
  },
  set: function (s) { if (!s) return; for (var k in s) if (k in ST) ST[k] = s[k]; },
  sfx: function (name, o) { if (M) oneshot(name, o || {}); },
  loop: function (key, name, o) {
    o = o || {}; var D = loopDefs[name];
    if (!D) { if (!warned['l' + name]) { warned['l' + name] = 1; console.warn('AU: unknown loop "' + name + '"'); } return; }
    var e = emitters[key];
    if (e && e.name !== name) { stopEmitter(e, 0.5); e = null; }
    if (!e) e = emitters[key] = { key: key, name: name, o: {} };
    if (o.x != null) delete e.o.follow;
    for (var k in o) e.o[k] = o[k];
    if (e.o.x == null) { e.o.x = L.x; e.o.z = L.z; e.o.follow = 1; }
  },
  stop: function (key, fade) { var e = emitters[key]; if (!e) return; if (M) stopEmitter(e, fade == null ? 0.5 : fade); delete emitters[key]; },
  drums: function (kind, o) { if (!M) return; if (!kind || kind === 'stop') { drumsStop(o && o.fade); return; } drumsStart(kind, o); },
  say: function (x, y, z, o) { if (!M) return 0; o = o || {}; var q = {}; for (var k in o) q[k] = o[k]; q.x = x; q.y = y; q.z = z; if (x == null) { delete q.x; delete q.z; } return sayAt(q, 0); },
  voice: function (x, y, z, o) {
    if (!M) return; o = o || {};
    var q = { x: x, y: y, z: z, vol: o.vol == null ? 1 : o.vol, pitch: o.pitch, seed: o.seed, dur: o.dur };
    if (x == null) { delete q.x; delete q.z; }
    voiceAt(o.kind || 'murmur', q, 0);
  },
  step: function (surface, o) { if (M) playStep(surface, o); },
  hoof: function (o) { if (M) playHoof(o); }, // one hoof strike, positional (o.x/y/z) or under the listener; o.hard for stone/brick
  music: function (name, o) {
    o = o || {}; var fade = o.fade == null ? 2.5 : o.fade; wantMus = name ? { name: name, o: o } : null;
    if (!M) return;
    if (curMus && !curMus.stopped && curMus.id === name) { if (o.vol != null) curMus.g.gain.setTargetAtTime(o.vol * (curMus.T.gain || 1), ac.currentTime, 0.3); return; }
    if (curMus) stopTrack(curMus, fade);
    curMus = null;
    if (name && tracks[name]) { curMus = startTrack(name, fade, ac.currentTime + 0.05); if (o.vol != null) curMus.g.gain.linearRampToValueAtTime(o.vol * (curMus.T.gain || 1), ac.currentTime + fade + 0.1); }
    else if (name) console.warn('AU: unknown music "' + name + '"');
  },
  volume: function (master, music, sfx) {
    if (master != null) vols.master = clamp(+master, 0, 1); if (music != null) vols.music = clamp(+music, 0, 1); if (sfx != null) vols.sfx = clamp(+sfx, 0, 1);
    if (!M) return; var t = ac.currentTime;
    if (M.master) M.master.gain.setTargetAtTime(vols.master, t, 0.05); M.sfx.gain.setTargetAtTime(vols.sfx, t, 0.05); M.mus.gain.setTargetAtTime(vols.music, t, 0.05);
  },
  duck: function (amount, sec) { duck(amount == null ? 0.5 : amount, sec); },
  stopAll: function (fade) { for (var k in emitters) AU.stop(k, fade); drumsStop(fade); AU.music(null, { fade: fade || 0.5 }); voices.slice().forEach(function (v) { kill(v, fade || 0.2); }); },
  ready: function () { return new Promise(function (res) { (function w() { if (BQ.length) return setTimeout(w, 50); Promise.all(bakePend.slice()).then(function () { if (BQ.length) setTimeout(w, 50); else res(bakePend.length); }); })(); }); },
  perf: function () { var r = { ticks: TS.n, tickAvgMs: TS.n ? TS.sum / TS.n : 0, tickMaxMs: TS.max, ambMs: TS.amb, jobsMs: TS.jobs, emitMs: TS.emit, bakeMs: TS.bq, bakeSliceMaxMs: TS.bqMax, bakeQueue: BQ.length }; TS = { n: 0, sum: 0, max: 0, bq: 0, bqMax: 0 }; return r; },
  stats: function () { var a = 0; for (var k in emitters) if (emitters[k].v) a++; return { voices: voices.length, speaking: nVoice, loops: Object.keys(emitters).length, activeLoops: a, jobs: jobs.length, drums: drumSets.length, music: curMus && curMus.id, time: ac && ac.currentTime, state: ac && ac.state, smoothed: SM }; },
  list: function () {
    return { sfx: Object.keys(defs).filter(function (k) { return !defs[k].hide; }), loops: Object.keys(loopDefs), music: Object.keys(tracks),
      drums: ['dusk', 'dawn', 'market_open', 'market_close', 'alarm'], voices: ['murmur', 'call', 'shout', 'laugh', 'cry', 'gasp', 'hawk', 'grunt', 'pain', 'sigh'], steps: SURF.slice(),
      districts: DISTRICTS.slice() };
  },
  trackLen: function (name) { return tracks[name] ? trackLen(tracks[name]) : 0; },
  ctx: function () { return ac; },
  _lint: function () {   // music: voices whose length does not divide their pattern, patterns not a whole number of bars
    var out = [];
    Object.keys(tracks).forEach(function (id) { var T = tracks[id], bar = T.div === 4 ? 16 : 8;
      Object.keys(T.pat).forEach(function (pn) { var P = T.pat[pn], lens = {}, mx = 0;
        Object.keys(P).forEach(function (v) { var l = parseVoice(P[v], (T.inst[v] || {}).type === 'drums').len; lens[v] = l; mx = Math.max(mx, l); if (!T.inst[v]) out.push(id + '.' + pn + ': no instrument ' + v); });
        Object.keys(lens).forEach(function (v) { if (lens[v] && mx % lens[v]) out.push(id + '.' + pn + '.' + v + ' len ' + lens[v] + ' / ' + mx); });
        if (mx % bar) out.push(id + '.' + pn + ' length ' + mx + ' not a multiple of ' + bar);
      }); out.push(id + ': ' + trackLen(T).toFixed(1) + ' s per pass'); });
    return out;
  },
  _ubench: function (kind, n) { var t0 = now_(); for (var i = 0; i < (n || 5); i++) speak(M.pre, ac.currentTime + 10, kind || 'murmur', 1, 0, null); return (now_() - t0) / (n || 5); },
  _say: function () { return { worker: !!SAY.w, cached: SAY.n, pending: SAY.np, active: SAY.active.length, warmed: SAY.wi || 0, warmTotal: SAY.warm ? SAY.warm.length : 0 }; },
  _drumHits: function () { return LASTDRUMS ? LASTDRUMS.hits.slice().sort(function (a, b) { return a[0] - b[0]; }) : []; },
  _dbg: function () { var r = { ready: [], pending: [], queue: BQ.length, bakedMB: 0 }; for (var k in BK) { (BK[k].b ? r.ready : r.pending).push(k); (BK[k].b || []).forEach(function (b) { r.bakedMB += b.length * b.numberOfChannels * 4 / 1e6; }); } r.bakedMB = Math.round(r.bakedMB * 10) / 10; r.slow = BQSLOW.slice().sort(function (a, b) { return b[0] - a[0]; }).slice(0, 15); return r; },
  /* offline render for tests: kind sfx|voice|step|loop|music|drums|amb ; returns Promise<AudioBuffer> */
  _render: function (kind, name, dur, o) {
    o = o || {}; var sr = o.sr || 44100, off = new OCX(2, Math.ceil(dur * sr), sr);
    var S = [ac, M, voices, OFF, MAXV, jobs, AMB, curMus, drumSets, nVoice, { x: L.x, y: L.y, z: L.z, yaw: L.yaw }, JSON.stringify(ST), JSON.stringify(SM), rnd], err = null;
    ac = off; OFF = true; voices = []; MAXV = 1e9; jobs = []; AMB = null; curMus = null; drumSets = []; nVoice = 0; L.x = 0; L.y = 1.6; L.z = 0; L.yaw = 0;
    if (o.seed != null) rnd = seeded(o.seed);
    build(o.raw);
    try {
      if (kind === 'sfx') oneshot(name, o.opts || {}, null, 0.05);
      else if (kind === 'voice') voiceAt(name, { pitch: o.pitch || 1, seed: o.vseed, vol: 1 }, 0.05);
      else if (kind === 'step') { var iv = o.run ? 0.34 : 0.5; for (var t = 0.05, i = 0; t < dur - 0.4; t += iv * R(0.96, 1.04), i++) playStep(name, { run: o.run, crouch: o.crouch, x: (i % 2 ? 0.15 : -0.15), z: -0.2, y: 0.1 }, t); }
      else if (kind === 'loop') { var e = { key: '_r', name: name, o: { x: 0, z: -(o.dist || 4), y: 1.6 } }; startEmitter(e); }
      else if (kind === 'music') startTrack(name, 0, 0.02);
      else if (kind === 'say') (o.lines || [{ ctx: name }]).forEach(function (q) { if (q.murmur) voiceAt(q.murmur, { x: q.x, y: q.y, z: q.z, pitch: q.pitch || 1, seed: q.seed, vol: 1, dur: q.dur }, (q.t || 0) + 0.05); else sayAt(q, (q.t || 0) + 0.05); });
      else if (kind === 'inst') { var ig = G(1); ig.connect(M.musIn); INST[name](ig, 0.05, (o.notes || [o.note || 64]).map(mtof), o.d || 0.5, o.v || 0.8, o.P || {}, o.x || {}); }
      else if (kind === 'drums') drumsStart(name, o.opts || {});
      else if (kind === 'amb') {
        var st = o.state || {}; for (var k in st) ST[k] = st[k];
        SM.hour = ST.hour; SM.indoor = ST.indoor; SM.crowd = ST.crowd; SM.hear = ST.hear; SM.wind = ST.wind; SM.rain = ST.rain; SM.alert = ST.alert; SM.curfew = ST.curfew ? 1 : 0; for (var d in SM.d) SM.d[d] = ST.district === d ? 1 : 0;
        SM.noEv = !!o.noEvents; startAmb(); ensureBeds(); for (var tt = 0.02; tt < dur; tt += 0.1) ambTick(tt, 0.1); SM.noEv = false;
      }
      pumpJobs(dur);
    } catch (x) { err = x; }
    ac = S[0]; M = S[1]; voices = S[2]; OFF = S[3]; MAXV = S[4]; jobs = S[5]; AMB = S[6]; curMus = S[7]; drumSets = S[8]; nVoice = S[9];
    L.x = S[10].x; L.y = S[10].y; L.z = S[10].z; L.yaw = S[10].yaw; ST = JSON.parse(S[11]); var sm = JSON.parse(S[12]); for (var q in sm) SM[q] = sm[q]; rnd = S[13];
    return err ? Promise.reject(err) : off.startRendering();
  }
};
Object.keys(AU).forEach(function (k) {   // the game loop must never die because of audio
  var f = AU[k]; if (typeof f !== 'function' || k === '_render' || k === 'ready') return;
  AU[k] = function () { try { return f.apply(AU, arguments); } catch (e) { if (!warned['x' + k]) { warned['x' + k] = 1; console.error('AU.' + k, e); } } };
});
window.AU = AU;
})();
