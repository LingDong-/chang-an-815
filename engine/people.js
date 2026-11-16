// people.js — EIGHT HUNDRED DRUMS: blob people (instanced crowds), dress by class, daily schedules and street AI.
// Models: lathe/ellipsoid/tube 'blob' figures in the style of the previous game (Master Hán), one mesh per body type and LOD,
// drawn with R.crowdBatch / R.drawCrowd (animation in VS_CROWD, engine.js). Crowd: CROWD.init(nav, ctx) / update(dt) / draw() / near(x,z,r).
// See PEOPLE.md. Conventions: models face +Z; instance yaw = atan2(dx, dz) of the heading; bones/slots as documented above VS_CROWD.
'use strict';

// ---------------- textures (neutral, tinted by vertex/palette colours) ----------------
TEX.add('p_cloth', (x, y) => { const w = ((x & 1) ^ (y & 1)) ? .97 : 1.02, n = qN(x, y, 8, 4, 901), f = qN(x * 4, y, 64, 2, 902); const k = (.82 + (n - .5) * .14 + (f - .5) * .1 + grainy(x, y, 903) * .04) * w; return [218 * k, 216 * k, 212 * k]; });
TEX.add('p_silk', (x, y) => { const n = qN(x, y, 8, 3, 951), f = qN(x * 6, y * .5, 64, 2, 952); const k = .84 + (n - .5) * .08 + (f - .5) * .12; return [222 * k, 220 * k, 216 * k]; });
TEX.add('p_skin', (x, y) => { const n = qN(x, y, 8, 3, 911); const k = .86 + (n - .5) * .06 + grainy(x, y, 912) * .02; return [226 * k, 216 * k, 210 * k]; });
TEX.add('p_hair', (x, y) => { const s = qN(x * 6, y * .5, 64, 2, 921); const k = .7 + (s - .5) * .5 + grainy(x, y, 922) * .1; return [60 * k, 54 * k, 50 * k]; });
TEX.add('p_felt', (x, y) => { const n = qN(x, y, 16, 5, 931); const k = .8 + (n - .5) * .22 + grainy(x, y, 932) * .1; return [214 * k, 210 * k, 204 * k]; });
TEX.add('p_hide', (x, y) => { const n = qN(x, y, 8, 4, 941), s = qN(x, y * 4, 32, 2, 942); const k = .8 + (n - .5) * .2 + (s - .5) * .12 + grainy(x, y, 943) * .05; return [214 * k, 212 * k, 208 * k]; });
TEX.add('p_coat', (x, y) => { const s = qN(x * 2, y * 8, 32, 3, 961), n = qN(x, y, 8, 3, 962); const k = .8 + (s - .5) * .16 + (n - .5) * .12 + grainy(x, y, 963) * .04; return [214 * k, 210 * k, 206 * k]; }); // short animal coat
TEX.add('p_lamellar', (x, y) => { const r = y >> 3, c = ((x + (r & 1) * 4) >> 3), e = Math.min((x + (r & 1) * 4) & 7, y & 7); const k = (e < 1 ? .45 : .85) + (hash2(c, r, 971) - .5) * .15; return [200 * k, 200 * k, 205 * k]; });
// faces: wrapped on the skull ellipsoid (front = u .25, eyes at v .48); neutral light skin with features, tinted by the skin palette slot
function P_face(fem, old) { return (x, y) => { // bold features: they must survive the mip chain at 270 px
  let k = .9 + (qN(x, y, 8, 3, 991) - .5) * .05, r = 1, g = 1, b = 1; const dx = x - 32, ax = Math.abs(dx);
  if (Math.abs(y - 70) < 6 && ax > 6 && ax < 14) { g -= .06; b -= .07; } // cheeks
  if (fem) { if (y >= 51 && y <= 53 && ax >= 3 && ax <= 11 && (y - 51) >= (ax - 3) * .28 - .6) k *= .4; } // low 八字 brows
  else if (y >= 51 && y <= 53 && ax >= 3 && ax <= 12) k *= y === 53 ? .55 : .32; // brows
  if (y >= 57 && y <= 62 && ax >= 3 && ax <= 10) { const e = Math.abs(y - 59.5) / 2.5 + Math.abs(ax - 6.5) / 3.5; if (e < 1) k *= ax >= 5 && ax <= 8 && y >= 58 && y <= 61 ? .1 : .45; } // eyes (dark iris, shadowed lids)
  if (dx >= 0 && dx <= 3 && y >= 62 && y <= 72) k *= .8; // nose shadow
  if (y >= 71 && y <= 73 && ax <= 4) k *= .65; // nostrils / under the nose
  if (y >= 78 && y <= 81 && ax <= 6 - (y === 78 || y === 81 ? 2 : 0)) { k *= fem ? .35 : .55; if (fem) { r = .75; g = .42; b = .42; } else { g = .78; b = .76; } }
  if (fem && y >= 44 && y <= 46 && ax <= 1) { r = 1.15; g = .3; b = .28; } // 花鈿
  if (old && ((y === 47 && ax < 11) || (y === 49 && ax < 9) || (y >= 74 && y <= 75 && ax > 6 && ax < 10) || (y === 63 && ax > 10 && ax < 14))) k *= .72; // wrinkles
  return [232 * k * r, 222 * k * g, 214 * k * b]; }; }
TEX.add('p_face_plain', (x, y) => { const k = .9 + (qN(x, y, 8, 3, 991) - .5) * .05; return [232 * k, 222 * k, 214 * k]; }); // the faces' skin without features (nose, ears)
TEX.add('p_face_m', P_face(false, false)); TEX.add('p_face_f', P_face(true, false)); TEX.add('p_face_o', P_face(false, true));
TEX.add('p_eye_a', (x, y) => { const dx = (x & 63) - 26, dy = y - 50, d = Math.hypot(dx, dy); return d < 5 ? [150, 140, 130] : [28, 22, 20]; }); // animal eye: dark with a glint

// ---------------- period cloth (round 6): weave + wear + drape folds painted into luminance (the engine derives bump from it); sheen per fabric ----------------
// Garment UVs: lathes u = around (0..1), v = hem (0) → waist/top (1); sleeves u = around, v = elbow (0) → cuff (1); leg tubes v = hip → ankle.
const TXD = (name, fn, o) => { const i = TEX.add(name, fn); if (TEX.defs[i]) Object.assign(TEX.defs[i], o); return i; };
const P_wd = d => ((d % 128) + 192) % 128 - 64; // wrapped distance in texels
const P_folds = (seed, n) => { const r = RNG(seed), F = []; for (let k = 0; k < n; k++) F.push([(k + r() * .7) * 128 / n, .6 + r() * .6]); return F; };
const P_FR = P_folds(71, 9), P_FS = P_folds(72, 24), P_FL = P_folds(73, 6), P_FT = P_folds(74, 5);
// fold relief at (x along u, t 0..1 along the garment from where folds are widest): narrow ridges/valleys; returns -1..1
function P_fold(F, x, wid, depth) { let h = 0; for (const [c, d] of F) { const e = P_wd(x - c) / wid; h -= d * Math.exp(-e * e); h += .45 * d * Math.exp(-((e - 1.4) ** 2)); } return h * depth; }
// weaves: hemp 麻 (coarse plain weave with slubs), plain silk 絹 (fine), damask 綾 (medallions), gauze 紗 (open weave)
const P_weave = { hemp: (x, y) => (((x & 1) ^ (y & 1)) ? -.05 : .05) + (qN(x * 3, y * .4, 64, 2, 1001) - .5) * .18 + grainy(x, y, 1002) * .06,
  silk: (x, y) => (((x & 1) ^ (y & 1)) ? -.015 : .015) + (qN(x, y, 16, 3, 1011) - .5) * .05,
  damask: (x, y) => { const cx = ((x + 16) & 31) - 16, cy = ((y + (x >> 5 & 1) * 16 + 16) & 31) - 16, r = Math.hypot(cx, cy); return (((x & 1) ^ (y & 1)) ? -.015 : .015) + (r > 7 && r < 9.5 || r < 3 ? .06 : 0) + (qN(x, y, 16, 3, 1021) - .5) * .04; } };
const P_wear = (x, y, s) => (qN(x, y, 4, 3, s) - .5) * .1 - Math.max(0, qN(x, y, 8, 2, s + 1) - .72) * .35; // uneven fading, stains
function P_fab(kind, fold) { return (x, y) => { // y = v*128 (row 0 = hem/elbow/hip end)
  const t = y / 127; let f = 0;
  if (fold === 'robe') f = P_fold(P_FR, x, lerp(7, 3.5, t), lerp(1, .3, t)) + P_fold(P_FS, x * 1, 2.2, sst(.75, 1, t) * .5); // folds widening to the hem + radiating pleats at the belt
  if (fold === 'skirt') f = P_fold(P_FS, x, lerp(3.2, 1.8, t), lerp(.9, .5, t));
  if (fold === 'sleeve') f = P_fold(P_FL, x, 5, .5 + t * .4) + Math.sin(y * .55 + Math.sin(x * .2) * 2) * .5 * Math.exp(-t * 5); // lengthwise folds, bunching at the elbow (t≈0)
  if (fold === 'trousers') f = P_fold(P_FT, x, 6, .6) + Math.sin(y * .6 + x * .1) * .45 * sst(.8, 1, t); // bunching at the ankle
  const k = .82 * (1 + P_weave[kind](x, y) + P_wear(x, y, 1030) * (kind === 'hemp' ? 1.2 : .6) + f * (fold === 'robe' ? .58 : fold === 'skirt' ? .48 : .42) - (f < 0 ? f * f * .12 : 0)); // valleys darker (baked occlusion)
  return [218 * k, 216 * k, 212 * k]; }; }
for (const [kind, sheen] of [['hemp', 0], ['silk', .25], ['damask', .35]]) {
  TXD('p_' + kind, P_fab(kind, null), { bump: 2.6, sheen }); TXD('p_robe_' + kind, P_fab(kind, 'robe'), { bump: 5, sheen }); TXD('p_sleeve_' + kind, P_fab(kind, 'sleeve'), { bump: 4.6, sheen }); }
TXD('p_skirt', P_fab('silk', 'skirt'), { bump: 5, sheen: .25 }); TXD('p_trousers', P_fab('hemp', 'trousers'), { bump: 3.6, sheen: 0 });
TXD('p_gauze', (x, y) => { const o = ((x % 3) === 0) || ((y % 3) === 0) ? 1.05 : .82, k = .84 * o * (1 + (qN(x, y, 8, 2, 1041) - .5) * .06); return [220 * k, 218 * k, 214 * k]; }, { bump: 1.6, sheen: .15 }); // 紗/羅 open weave
TXD('p_lacq_gauze', (x, y) => { const o = ((x % 2) === 0) || ((y % 2) === 0) ? 1.04 : .9, k = .8 * o * (1 + (qN(x, y, 8, 2, 1051) - .5) * .08); return [210 * k, 208 * k, 206 * k]; }, { bump: 1.2, sheen: .12 }); // lacquered 幞頭 gauze
TXD('p_veil', (x, y) => { const th = (x % 6 < 2) || (y % 6 < 2), k = .92 + (qN(x, y, 8, 2, 1071) - .5) * .05; return [228 * k, 226 * k, 222 * k, th ? 255 : 0]; }, { bump: 0, sheen: .1 }); // sheer gauze: open threads (alpha cut)
TXD('p_leather', (x, y) => { const n = qN(x, y, 16, 4, 1061), c = qN(x * 2, y * 2, 32, 2, 1062); const k = .82 * (1 + (n - .5) * .16 + (Math.abs(c - .5) < .03 ? -.12 : 0) + grainy(x, y, 1063) * .04); return [214 * k, 212 * k, 208 * k]; }, { bump: 2.4, sheen: .1 });
for (const [nm, o] of [['p_felt', { bump: 2.6, sheen: 0 }], ['p_skin', { bump: .5 }], ['p_face_m', { bump: .5 }], ['p_face_f', { bump: .5 }], ['p_face_plain', { bump: .5 }], ['p_face_o', { bump: .6 }], ['p_hair', { bump: 1.6, sheen: .1 }], ['p_cloth', { bump: 2.4 }], ['p_silk', { bump: 1.8, sheen: .25 }], ['p_coat', { bump: 1.8, sheen: .1 }]])
  if (TEX.L[nm] !== undefined) Object.assign(TEX.defs[TEX.L[nm]], o);

// ---------------- palettes (dyes of 815; see PEOPLE.md) ----------------
const PC = {
  hemp: [.72, .66, .54], white: [.86, .84, .78], offwhite: [.8, .78, .7], grey: [.58, .57, .54], brown: [.45, .34, .24], dbrown: [.32, .25, .19],
  black: [.17, .16, .16], ochre: [.62, .47, .3], indigo: [.32, .36, .46], slate: [.42, .45, .5], tan: [.66, .56, .42], rust: [.55, .32, .22],
};
const SKIN = [[.86, .7, .56], [.82, .64, .5], [.76, .58, .44], [.7, .52, .38], [.88, .74, .62]], SKIN_F = [[.92, .78, .66], [.9, .75, .62], [.86, .7, .58]], SKIN_S = [[.88, .7, .58], [.84, .64, .52], [.8, .6, .48]];
const PAL = { // per body type: 4 slot lists (slot1 main garment, slot2 secondary, slot3 accent, slot4 skin)
  man: [[PC.hemp, PC.white, PC.offwhite, PC.brown, PC.dbrown, PC.black, PC.grey, PC.tan, PC.indigo, PC.ochre], [PC.white, PC.hemp, PC.offwhite, PC.tan], [PC.black, PC.dbrown, [.24, .2, .17]], SKIN],
  labourer: [[PC.hemp, PC.tan, PC.brown, PC.offwhite, PC.grey, PC.indigo, [.5, .44, .34]], [PC.hemp, PC.offwhite, PC.tan, PC.grey, PC.dbrown], [PC.indigo, PC.dbrown, PC.black, PC.slate, [.55, .3, .24], [.4, .36, .3]], [[.76, .56, .42], [.7, .52, .38], [.8, .6, .46]]],
  official: [[[.42, .27, .45], [.36, .22, .4], [.6, .2, .18], [.72, .3, .25], [.24, .42, .3], [.36, .52, .36], [.24, .34, .5], [.38, .5, .6], [.38, .5, .6], [.24, .42, .3], [.36, .52, .36], [.72, .3, .25]], [PC.white, PC.offwhite], [[.8, .66, .36], [.72, .72, .74], [.6, .5, .36]], SKIN],
  scholar: [[PC.white, [.9, .88, .82], PC.offwhite, [.84, .82, .74]], [PC.white, PC.offwhite], [PC.black, PC.dbrown], SKIN],
  woman: [[[.68, .24, .2], [.58, .2, .2], [.3, .32, .48], [.36, .48, .36], [.78, .62, .32], [.86, .72, .7], [.5, .36, .5], [.72, .44, .34], [.84, .8, .72]], [PC.white, [.82, .86, .78], [.76, .82, .86], [.9, .8, .78], [.88, .84, .7], [.74, .6, .58], [.6, .66, .7]], [[.9, .86, .6], [.76, .86, .74], [.92, .9, .84], [.9, .7, .7], [.7, .78, .9], [.86, .64, .4]], SKIN_F],
  maid: [[[.6, .26, .22], [.34, .38, .5], [.42, .5, .4], [.72, .6, .4], PC.offwhite, [.6, .44, .4]], [PC.white, [.86, .84, .76], [.8, .74, .7]], [[.8, .3, .26], [.4, .5, .6], [.86, .8, .6]], SKIN_F],
  child: [[[.66, .28, .22], [.34, .4, .54], PC.white, [.4, .52, .38], [.7, .58, .36], PC.hemp, PC.tan], [PC.white, PC.hemp, PC.offwhite, PC.indigo], [[.7, .3, .24], PC.indigo, PC.black], [[.9, .74, .6], [.86, .68, .54]]],
  monk: [[[.3, .29, .28], [.4, .37, .33], [.42, .32, .24], [.26, .24, .22]], [[.55, .3, .2], [.62, .45, .25], [.38, .26, .18], [.5, .34, .22], [.62, .45, .25], [.45, .28, .44]], [[.55, .5, .44]], SKIN],
  daoist: [[[.5, .4, .26], [.3, .3, .34], [.42, .34, .26], [.6, .52, .34], [.26, .28, .3]], [PC.black, PC.dbrown, [.24, .26, .34]], [[.82, .68, .32], [.78, .62, .28]], SKIN],
  sogdian: [[[.62, .26, .2], [.32, .45, .32], [.3, .36, .5], [.5, .38, .26], [.82, .8, .72], [.56, .3, .36], [.66, .5, .3]], [[.8, .66, .4], [.25, .3, .45], [.7, .3, .25], [.82, .8, .72], [.4, .5, .36]], [[.86, .84, .78], [.66, .26, .2], [.32, .28, .26], [.7, .58, .4], [.3, .36, .5]], SKIN_S],
  guard: [[[.66, .22, .18], [.6, .2, .17], [.7, .3, .22], [.66, .46, .25]], [[.48, .48, .5], [.5, .37, .24], [.4, .4, .42]], [[.76, .18, .15], [.7, .16, .14]], [[.82, .62, .48], [.76, .58, .44], [.86, .68, .54]]],
  old: [[PC.brown, PC.hemp, PC.grey, PC.dbrown, [.5, .48, .5], PC.indigo, PC.offwhite], [PC.white, PC.hemp], [[.84, .82, .78], [.72, .7, .68]], [[.84, .68, .56], [.78, .62, .5]]],
  oldwoman: [[PC.dbrown, PC.grey, PC.indigo, [.4, .32, .3], PC.brown], [PC.offwhite, PC.hemp, PC.grey], [[.8, .78, .74], [.6, .58, .56]], [[.86, .7, .58], [.8, .64, .52]]],
  beggar: [[[.5, .44, .34], [.42, .38, .32], [.56, .5, .4], [.36, .32, .28]], [[.46, .4, .32], [.5, .46, .38]], [[.24, .2, .18], [.3, .26, .22]], [[.66, .5, .38], [.6, .46, .34]]],
  entertainer: [[[.7, .22, .18], [.3, .44, .36], [.82, .66, .3], [.3, .34, .5]], [PC.white, [.82, .72, .5], PC.black], [[.86, .7, .3], [.75, .2, .18], [.3, .5, .4]], SKIN],
  nun: [[[.38, .36, .34], [.3, .29, .28], [.46, .42, .36]], [[.48, .34, .26], [.4, .3, .24], [.36, .34, .32]], [[.6, .56, .5]], SKIN_F],
  uyghur: [[[.56, .3, .24], [.4, .36, .3], [.3, .38, .3], [.62, .52, .36], [.3, .3, .4]], [[.78, .64, .38], [.5, .26, .22], [.84, .8, .72]], [[.5, .4, .3], [.3, .26, .22], [.72, .62, .44]], SKIN_S],
  persian: [[[.84, .8, .72], [.3, .34, .48], [.52, .24, .22], [.4, .46, .36]], [[.76, .6, .32], [.6, .2, .2], [.3, .3, .42]], [[.88, .86, .8], [.5, .42, .3]], [[.86, .66, .54], [.8, .6, .48]]],
  huji: [[[.62, .24, .2], [.3, .42, .34], [.32, .36, .5], [.7, .56, .34], [.86, .8, .7]], [[.7, .26, .22], [.8, .72, .5], [.36, .3, .44], [.84, .8, .74]], [[.82, .66, .4], [.86, .84, .78], [.5, .2, .2]], [[.94, .8, .7], [.9, .76, .66]]],
  donkey: [[[.5, .47, .44], [.46, .4, .34], [.34, .31, .29], [.56, .52, .48], [.42, .36, .3]], [[.62, .5, .34], [.5, .4, .3], [.7, .62, .48], PC.indigo, [.56, .3, .22]], [PC.hemp, PC.white, PC.brown, PC.offwhite, PC.indigo, PC.black], SKIN],
  horse: [[[.45, .27, .16], [.58, .33, .18], [.62, .6, .58], [.2, .17, .15], [.8, .78, .74], [.68, .55, .38], [.5, .3, .18]], [[.6, .2, .18], [.3, .3, .34], [.5, .36, .24], [.24, .38, .3]], [[.42, .27, .45], [.6, .2, .18], [.24, .42, .3], [.24, .34, .5], PC.white, [.72, .3, .25], [.36, .52, .36]], SKIN],
  camel: [[[.66, .54, .38], [.6, .48, .34], [.72, .62, .46], [.54, .42, .3]], [[.6, .26, .2], [.32, .36, .5], [.7, .6, .4], [.5, .4, .3]], [PC.hemp, PC.tan, PC.offwhite, [.6, .3, .24]], SKIN],
  oxcart: [[[.24, .21, .19], [.5, .36, .24], [.62, .48, .3], [.56, .42, .28], [.66, .52, .34]], [[.3, .2, .16], [.24, .2, .18], [.5, .24, .18]], [[.42, .3, .45], [.6, .22, .2], [.3, .36, .5], [.64, .56, .42], [.3, .42, .34]], SKIN],
};
PAL.dog = [[[.62, .48, .3], [.2, .18, .16], [.78, .72, .6], [.48, .36, .24], [.7, .6, .44]], [[.5, .4, .3]], [[.3, .25, .2]], SKIN];
PAL.chicken = [[[.55, .32, .16], [.86, .82, .74], [.2, .18, .16], [.7, .5, .26], [.62, .42, .2]], [[.12, .14, .12], [.3, .2, .1], [.8, .76, .7]], [[.85, .2, .16]], SKIN];
PAL.horsewoman = [PAL.horse[0], PAL.horse[1], PAL.woman[0], SKIN_F];
PAL.porter = PAL.labourer; PAL.vendor = PAL.labourer; PAL.veil = PAL.woman; PAL.musician = PAL.woman; PAL.girl = PAL.child;

// ---------------- mesh building ----------------
// vertex bone byte = bone | slot << 5 (VS_CROWD); second bone + weight added by skinPass()
const PK = .74; // vertex colour for palette parts: texture mean ~.82 × .74 × 1.6 ≈ 1 → renders at the palette colour
const PKC = [PK, PK, PK], CAPC = [.12, .11, .11], HAIRK = [.14, .12, .11];
const sg = (q, n) => q ? n : Math.max(4, Math.round(n * .5));
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function S_(b, bone, slot, tex, col) { b.s({ bone: bone | (slot << 5), slot: bone, tex, col: col || PKC }); return b; }
// one continuous head + face: a sphere grid reshaped by smooth profile functions (narrowing jaw, rounded chin, fuller cranium at the back).
// UVs as MB.ell (u around from +x, v top→bottom) so the face textures map the same. soft: 0 man … 1 woman/child (smaller, softer jaw)
function HEADM(b, cx, cy, cz, rx, ry, rz, soft, seg, ring) {
  const jn = .3 - soft * .06, ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  return b.grid(ring, seg, (i, j) => {
    const th = i / ring * PI, ph = j / seg * TAU, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
    const low = ss(-y * 1.15), fx = 1 - jn * Math.pow(low, 1.4), back = z < 0 ? -z : 0, front = z > 0 ? z : 0;
    let fz = 1 - (z < 0 ? .3 : .1) * low; if (y > -.25 && z < 0) fz *= 1 + .06 * back * ss((y + .25) * 2); // occiput
    const chin = front * Math.exp(-Math.pow((y + .78) / .16, 2)) * (.06 - soft * .025); // soft rounded chin
    const cheek = front * Math.exp(-Math.pow((y + .15) / .3, 2)) * .03 * Math.abs(x); // a little cheek fullness
    return [cx + x * rx * fx * (1 + cheek), cy + y * ry, cz + z * rz * fz + chin * rz, j / seg, i / ring];
  }, true, (i, j, p) => [p[0] - cx, p[1] - cy, p[2] - cz], true);
}
// forearm sleeve with real thickness: lofted outer + darker inner surface + rolled rim at the opening; wide sleeves sag into a 袂 pouch on
// the back side of the forearm (which hangs down whenever the forearm is raised). Never see-through.
function SLEEVE(b, q, bone, slot, tex, E, Wp, r0, rc, pouch) {
  const nt = q ? 6 : 2, seg = q ? 12 : 6;
  const pt = (t, a, inner) => { const r = lerp(r0, rc, Math.pow(t, 1.4)) - inner * .007, ca = Math.cos(a), sa = Math.sin(a), w = Math.pow(Math.max(0, -sa), 1.3) * pouch * t * t;
    return [lerp(E[0], Wp[0], t) + ca * r, lerp(E[1], Wp[1], t) - w * .9, lerp(E[2], Wp[2], t) + sa * (r + w * .5)]; };
  S_(b, bone, slot, tex); b.grid(nt, seg, (i, j) => [...pt(i / nt, j / seg * TAU, 0), j / seg, i / nt], true, null, true); // outer (u around, v elbow → cuff)
  S_(b, bone, slot, tex, [PK * .62, PK * .6, PK * .58]); b.grid(nt, seg, (i, j) => [...pt(i / nt, j / seg * TAU, 1), j / seg, i / nt], true, null, false); // inner (darker)
  S_(b, bone, slot, tex, [PK * .9, PK * .9, PK * .88]); for (const fl of [true, false]) b.grid(1, seg, (i, j) => { const p = pt(1, j / seg * TAU, i); p[1] -= .004; return [...p, j / seg, i]; }, true, null, fl); // rolled rim, both faces
}
// flat double-sided ribbon along a path: pts[k] = [x, y, z], wv[k] = width vector (half-width, both sides shaded)
function RIBBON(b, q, pts, wv) { const n = pts.length - 1, f = (i, j) => { const p = pts[j], w = wv[j], sd = i ? 1 : -1; return [p[0] + w[0] * sd, p[1] + w[1] * sd, p[2] + w[2] * sd, i, j / n]; };
  b.grid(n, 1, (i, j) => f(j, i), false, null, false); b.grid(n, 1, (i, j) => f(j, i), false, null, true); }
// shoulder + upper sleeve as ONE skinned surface: a loft from the side of the neck, over the dropped, sloping shoulder, down the upper arm
// to past the elbow. Weights blend chest (1) → upper arm (U) across the shoulder/armpit (~12 cm), so the shoulder bends without a seam.
function SHOULDER(b, q, J, sd, U, slot, tex, r0, r1, r2) {
  const X = J.shX, v0 = b.nv, ex = sd * (X + .03);
  S_(b, U, slot, tex); b.tube([[sd * .055, J.neck - .02 * J.s, -.012], [sd * (X - .045), J.sh + .015 * J.s, -.006], [sd * (X + .006), J.sh - .06 * J.s, .0], [sd * (X + .022), (J.sh + J.elbow) / 2 - .02, .006], [ex, J.elbow - .035, .0]],
    { r: [r0 * .55, r0 * .9, r1, r1 * .95, r2], seg: sg(q, 10), steps: q ? 3 : 1, cap: [true, false] });
  shWeights(b, v0, J);
}
// chest (1) ↔ upper arm weights for everything lofted over the shoulder (sleeve, 半臂)
function shWeights(b, v0, J) { const B = b.B, W = b.W, V = b.P, shY = J.sh, X = J.shX;
  for (let i = v0; i < b.nv; i++) { const x = Math.abs(V[i * 3]), y = V[i * 3 + 1];
    const wArm = sst(shY + .03, shY - .1, y) * .75 + sst(X - .06, X + .03, x) * .25 * sst(shY + .06, shY - .02, y) + (y < shY - .1 ? .25 : 0);
    const wc = clamp(1 - wArm, 0, 1); if (wc > .002) { B[i * 2 + 1] = 1; W[i * 4] = 1 - wc; W[i * 4 + 1] = wc; } } }
// 半臂: short-sleeved over-jacket of Tang women, open in front, its half sleeves capping the shoulder and ending in a flared hem above the elbow
function BANBI(b, q, J, slot, tex, cr, zS, T_, F_, y0, y1) {
  const a = .62; S_(b, 1, slot, tex); b.T(0, 0, 0, 0, 0, 0, 1, 1, zS);
  const prof = T_.map((t, k) => [F_[k] * cr + .009, y0 + (y1 - y0) * t]).filter(p => p[1] > J.sh - .25 * J.s && p[1] < J.neck - .025);
  b.lathe([[prof[0][0] - .004, prof[0][1] - .012]].concat(prof), { seg: sg(q, 14), a0: PI * .5 + a, a1: PI * 2.5 - a }); b.pop();
  for (const sd of [1, -1]) { const U = sd > 0 ? 3 : 5, X = J.shX, v0 = b.nv, ym = J.sh - .15 * J.s;
    S_(b, U, slot, tex); b.tube([[sd * .065, J.neck - .028 * J.s, -.012], [sd * (X - .045), J.sh + .026 * J.s, -.006], [sd * (X + .01), J.sh - .055 * J.s, .0], [sd * (X + .024), ym, .006], [sd * (X + .03), ym - .02, .006]],
      { r: [.045, .074 * (J.wd || 1), .078 * (J.wd || 1), .084, .086], seg: sg(q, 10), steps: q ? 2 : 1, cap: false });
    if (q) { S_(b, U, 0, tex, [.62, .6, .58]); b.tube([[sd * (X + .024), ym + .002, .006], [sd * (X + .03), ym - .019, .006]], { r: [.081, .083], seg: 10, steps: 1, cap: false }); } // inside of the hem
    shWeights(b, v0, J); }
}
// blend weights at the joints so nothing separates: neck, shoulders, elbows, waist, hips, knees, ankles; robes/skirts follow the thighs
function skinPass(b, P, o = {}) {
  const n = b.nv, B = b.B, W = b.W, V = b.P;
  const hipY = P[7][1], kneeY = P[8][1], ankY = P[9][1], shY = P[3][1], elY = P[4][1], neckY = P[2][1], waY = P[1][1];
  for (let i = 0; i < n; i++) {
    if (W[i * 4 + 1] > 0) continue; // already skinned (shoulder loft)
    const bone = B[i * 2] & 31, x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2]; let b2 = bone, w = 0;
    if (bone === 0 && o.robe && y < hipY + .04) { const f = clamp((hipY + .04 - y) / (hipY - kneeY + .04), 0, 1.3); w = Math.min(.9, f * .8) * sst(.0, .1, Math.abs(x)) * (z < 0 ? .55 : 1); b2 = x >= 0 ? 7 : 10; }
    else if (bone === 0 && y > waY - .05) { w = sst(waY - .05, waY + .06, y) * .5; b2 = 1; }
    else if (bone === 1 && y < waY + .06 && y > waY - .2) { w = (1 - sst(waY - .05, waY + .06, y)) * .5; b2 = 0; }
    else if (bone === 1 && y > neckY - .03 && Math.abs(x) < .08) { w = sst(neckY - .03, neckY + .06, y); b2 = 2; }
    else if ((bone === 3 || bone === 5) && y > shY - .09) { w = sst(shY - .09, shY + .03, y) * .55; b2 = 1; }
    else if ((bone === 3 || bone === 5) && y < elY + .06) { w = (1 - sst(elY - .04, elY + .06, y)) * .5; b2 = bone + 1; }
    else if ((bone === 4 || bone === 6) && y > elY - .04) { w = sst(elY - .04, elY + .06, y) * .5; b2 = bone - 1; }
    else if ((bone === 7 || bone === 10) && y > hipY - .12) { w = sst(hipY - .12, hipY + .05, y) * .55; b2 = 0; }
    else if ((bone === 7 || bone === 10) && y < kneeY + .07) { w = (1 - sst(kneeY - .04, kneeY + .07, y)) * .5; b2 = bone + 1; }
    else if ((bone === 8 || bone === 11) && y > kneeY - .04) { w = sst(kneeY - .04, kneeY + .07, y) * .5; b2 = bone - 1; }
    else if ((bone === 8 || bone === 11) && y < ankY + .03) { w = (1 - sst(ankY - .02, ankY + .04, y)) * .45; b2 = bone + 1; }
    else if ((bone === 9 || bone === 12) && y > ankY - .01) { w = sst(ankY - .01, ankY + .07, y) * .5; b2 = bone - 1; }
    if (w > .002) { B[i * 2 + 1] = b2; W[i * 4] = 1 - w; W[i * 4 + 1] = w; }
  }
}
// ---------- the human body: parametric builder ----------
// o: {f (female), s (height scale), wd (width), hs (head scale), stoop, garment: 'long'|'mid'|'knee'|'jacket'|'skirt'|'coat', sleeve: 'narrow'|'wide'|'xwide',
//     shoes: 'boots'|'shoes'|'sandals'|'bare', legs: 'trousers'|'rolled'|'bare', head: {...}, beard, face, extras(b, q, J) }
function HUMAN(b, q, o) {
  const s = o.s || 1, wd = o.wd || 1, hs = o.hs || 1, f = !!o.f;
  const J = { ank: .085 * s, knee: .475 * s, hip: .87 * s, waist: .99 * s, sh: 1.33 * s, neck: 1.43 * s, shX: (f ? .14 : .155) * wd, hipX: (f ? .088 : .09) * wd };
  J.elbow = J.sh - .275 * s; J.wrist = J.elbow - .245 * s; J.head = J.neck + .125 * hs; J.hs = hs; J.s = s; J.f = f; J.wd = wd;
  const P = [[0, J.hip + .06, 0], [0, J.waist + .02, 0], [0, J.neck + .02, .0], [J.shX, J.sh, 0], [J.shX + .03, J.elbow, .0], [-J.shX, J.sh, 0], [-(J.shX + .03), J.elbow, .0],
    [J.hipX, J.hip, 0], [J.hipX + .006, J.knee, .012], [J.hipX + .01, J.ank, 0], [-J.hipX, J.hip, 0], [-(J.hipX + .006), J.knee, .012], [-(J.hipX + .01), J.ank, 0], [-(J.shX + .045), J.wrist, .03], [J.shX + .045, J.wrist, .03], [0, J.sh, 0]];
  const fab = o.fab || (f ? 'silk' : 'hemp'), g = o.garment || 'mid', robe = g === 'long' || g === 'mid' || g === 'skirt' || g === 'knee' || g === 'coat';
  // --- legs (trousers slot 2) and feet
  for (const sd of [1, -1]) { const T = sd > 0 ? 7 : 10, x0 = sd * J.hipX, x1 = sd * (J.hipX + .006), x2 = sd * (J.hipX + .01);
    S_(b, T, 2, 'p_trousers'); b.tube([[x0, J.hip + .06, 0], [x1, J.knee + .02, .012]], { r: [.088 * wd * s, .064 * s], seg: sg(q, 8), steps: 1, cap: [true, false] });
    const legBare = o.legs === 'bare' || o.legs === 'rolled';
    S_(b, T + 1, legBare ? 4 : 2, legBare ? 'p_skin' : 'p_trousers'); b.tube([[x1, J.knee + .05, .012], [x2, J.ank - .025, .0]], { r: [.062 * s, .042 * s], seg: sg(q, 8), steps: 1, cap: [false, false] });
    if (o.legs === 'rolled') { S_(b, T + 1, 2, 'p_trousers'); b.tube([[x1, J.knee + .05, .012], [x1, J.knee - .08, .01]], { r: [.068 * s, .066 * s], seg: sg(q, 8), steps: 1, cap: [false, true] }); }
    const sh = o.shoes || 'shoes', sc = sh === 'boots' ? [.1, .085, .08] : sh === 'sandals' ? [.55, .45, .3] : sh === 'bare' ? null : (o.shoeCol || [.3, .24, .2]);
    if (sh === 'bare') { S_(b, T + 2, 4, 'p_skin'); b.ell(x2, .035 * s, .045, .042, .035, .1 * s, { seg: sg(q, 8), ring: sg(q, 5) }); }
    else { S_(b, T + 2, 0, 'p_leather', sc); b.ell(x2, .042 * s, .045, .048 * s, .044 * s, .112 * s, { seg: sg(q, 9), ring: sg(q, 6) }); if (q && f && sh === 'shoes') b.ell(x2, .06 * s, .16 * s, .03, .03, .03, { seg: 5, ring: 4 }); // 高頭履 toe
      if (sh === 'sandals') { S_(b, T + 2, 4, 'p_skin'); b.ell(x2, .06 * s, .05, .04, .03, .09 * s, { seg: sg(q, 7), ring: 4 }); }
      if (sh === 'boots') { S_(b, T + 1, 0, 'p_leather', sc); b.tube([[x2, J.ank - .02, -.005], [x1, J.knee - .1 * s, .01]], { r: [.052 * s, .06 * s], seg: sg(q, 8), steps: 1, cap: [false, true] }); } }
  }
  // --- lower garment (bone 0, blended to the thighs): robe from the hem to the waist with folds
  const hem = { long: .07, mid: .3, knee: .45, coat: .42, jacket: .7, skirt: .04 }[g] * s, hr = ({ long: .275, mid: .255, knee: .235, coat: .235, jacket: .2, skirt: .28 }[g]) * wd * (o.robeW || 1);
  const fold = q ? ((a, y) => { const k = clamp((J.hip - y) / Math.max(.1, J.hip - hem), 0, 1); return k * (.016 * Math.sin(a * 7 + 1.3) + .007 * Math.sin(a * 13 + .4)) + .004 * Math.sin(a * 9 + y * 3); }) : undefined; // hem lobes: the hem is not a perfect circle
  if (g === 'skirt') { S_(b, 0, 1, 'p_skirt'); b.lathe([[0, hem], [hr * .96, hem], [hr, hem + .035], [hr * .86, J.knee], [.2 * wd, J.hip], [.175 * wd, J.waist], [0, J.waist + .02]], { seg: sg(q, 16), disp: fold });
    S_(b, 1, 1, 'p_silk'); b.T(0, 0, 0, 0, 0, 0, 1, 1, .84); b.lathe([[.168 * wd, J.waist - .03], [.172 * wd, J.waist + .05], [.165 * wd, J.waist + .15], [.15 * wd, J.waist + .2], [0, J.waist + .21]], { seg: sg(q, 14) }); b.pop(); // skirt pulled up over the bust
    S_(b, 1, 3, 'p_silk'); b.T(0, 0, 0, 0, 0, 0, 1, 1, .86); b.lathe([[.165 * wd, J.waist + .12], [.172 * wd, J.waist + .14], [.168 * wd, J.waist + .19], [.155 * wd, J.waist + .2]], { seg: sg(q, 12) }); b.pop(); // tie band
  } else {
    S_(b, 0, 1, 'p_robe_' + fab); b.lathe([[0, hem], [hr * .95, hem], [hr, hem + .03], [hr * .93, (hem + J.hip) / 2], [.195 * wd, J.hip + .02], [.182 * wd, J.waist], [0, J.waist + .02]], { seg: sg(q, 16), disp: fold });
    if (o.hemTrim) { S_(b, 0, 2, 'p_cloth'); b.lathe([[hr * .99, hem - .005], [hr * 1.03, hem], [hr * 1.03, hem + .05], [hr, hem + .055]], { seg: sg(q, 16) }); }
    if (o.ragged && q) { S_(b, 0, 1, 'p_cloth'); for (let k = 0; k < 7; k++) { const a = k * .9; b.T(Math.cos(a) * hr * .97, hem - .03, Math.sin(a) * hr * .97, 0, -a, 0).box(0, 0, 0, .01, .07, .06).pop(); } }
  }
  // --- chest/upper garment (bone 1) with shoulders; neck (skin)
  const cr = (f ? .15 : .172) * wd * (o.chestW || 1), y0 = J.waist - .04, y1 = J.neck - .01, T_ = [0, .02, .2, .42, .6, .76, .88, .96, 1], F_ = [.94, 1, 1.03, 1.03, .97, .84, .62, .4, .22];
  const zS = f ? .82 : .78, chestR = y => { const t = clamp((y - y0) / (y1 - y0), 0, 1); let k = 0; while (k < T_.length - 2 && t > T_[k + 1]) k++; return lerp(F_[k], F_[k + 1], (t - T_[k]) / (T_[k + 1] - T_[k])) * cr; };
  const surf = (x, y, out) => { const r = chestR(y) + out, xx = clamp(x, -r * .98, r * .98); return [xx, y, Math.sqrt(r * r - xx * xx) * zS]; }; // front surface point of the chest
  if (o.lowNeck) { // 袒領: wide low neckline of the short jacket (front cut at the collarbones), upper chest bare above the skirt
    const yc = J.sh - .085 * s; S_(b, 1, 4, 'p_skin'); b.T(0, 0, 0, 0, 0, 0, 1, 1, zS); b.lathe(T_.map((t, k) => [F_[k] * cr - .004, y0 + (y1 - y0) * t]).filter(p => p[1] > yc - .1), { seg: sg(q, 14) }); b.pop();
    S_(b, 1, o.upperSlot || 2, 'p_' + fab); b.T(0, 0, 0, 0, 0, 0, 1, 1, zS); b.lathe(T_.map((t, k) => [F_[k] * cr, y0 + (y1 - y0) * t]).filter(p => p[1] <= yc).concat([[chestR(yc) * .97, yc + .004]]), { seg: sg(q, 14) });
    b.lathe(T_.map((t, k) => [F_[k] * cr + .002, y0 + (y1 - y0) * t]).filter(p => p[1] > yc - .02), { seg: sg(q, 12), a0: PI * 1.12, a1: PI * 1.88 }); b.pop(); } // shoulders and back stay covered
  else { S_(b, 1, o.upperSlot || (g === 'skirt' ? 2 : 1), 'p_' + fab); b.T(0, 0, 0, 0, 0, 0, 1, 1, zS); b.lathe(T_.map((t, k) => [F_[k] * cr, y0 + (y1 - y0) * t]), { seg: sg(q, 14) }); b.pop(); }
  if (o.banbi) BANBI(b, q, J, o.banbi, 'p_' + (o.banbiFab || 'damask'), cr, zS, T_, F_, y0, y1);
  S_(b, 1, 4, 'p_skin'); b.tube([[0, J.sh - .04, -.005], [0, J.neck + .08 * hs, .005]], { r: (f ? .044 : .052) * hs, seg: sg(q, 8), steps: 1, cap: false });
  // round collar (圓領) or crossed collar
  if (o.collar !== false) { // 圓領: a standing band around the neck rising from the garment surface (slightly proud of it)
    const yb = J.neck - .055 * s, rb = chestR(yb) + .004; S_(b, 1, o.collarSlot || 1, 'p_' + fab); b.T(0, 0, 0, 0, 0, 0, 1, 1, zS); b.lathe([[rb, yb], [Math.max(.058, chestR(J.neck - .03 * s) + .006), J.neck - .03 * s], [.058 * hs, J.neck + .005], [.052 * hs, J.neck + .012]], { seg: sg(q, 14) }); b.pop(); }
  if (o.crossCollar) { // 交領 右衽: a flat lapel band lying on the chest, from the left of the neck across to under the right arm
    const N = q ? 6 : 2, pts = [], wv = [];
    for (let k = 0; k <= N; k++) { const t = k / N, y = lerp(J.neck - .02 * s, J.sh - .24 * s, t), x = lerp(.035, -.13, Math.pow(t, .9)) * (J.wd || 1), p = surf(x, y, .005), r = chestR(y);
      const nx = p[0] / r, nz = p[2] / (r * zS), tx = -nz, tz = nx; wv.push([tx * .016, .012, tz * .016]); pts.push(p); }
    S_(b, 1, o.crossCollar, 'p_' + fab); RIBBON(b, q, pts, wv); }
  // belt (bone 0 near the waist) and hanging things
  if (o.belt !== false && g !== 'skirt') { S_(b, 0, o.beltSlot ?? 3, 'p_leather', o.beltCol); b.T(0, 0, 0, 0, 0, 0, 1, 1, .86); b.lathe([[.186 * wd, J.waist - .055], [.196 * wd, J.waist - .045], [.196 * wd, J.waist - .005], [.186 * wd, J.waist + .005]], { seg: sg(q, 14) }); b.pop();
    if (o.pouch && q) { S_(b, 0, 0, 'p_leather', [.42, .3, .2]); b.ell(.16 * wd, J.waist - .1, .07, .035, .05, .022, { seg: 6, ring: 4 }); }
    if (o.knife && q) { S_(b, 0, 0, 'lacquer_black', [1, 1, 1]); b.T(-.17 * wd, J.waist - .14, .04, .1, 0, -.15).box(0, 0, 0, .02, .16, .03).pop(); } }
  // --- arms: sleeve upper (3/5) and lower (4/6) + hands (skin slot 4)
  const slv = o.sleeve || 'narrow', cuff = slv === 'xwide' ? .15 : slv === 'wide' ? .11 : .052, ar = f ? .9 : 1;
  for (const sd of [1, -1]) { const U = sd > 0 ? 3 : 5, X = J.shX, ex = sd * (X + .03), wx = sd * (X + .045);
    SHOULDER(b, q, J, sd, U, o.sleeveSlot || (g === 'skirt' ? 2 : 1), 'p_sleeve_' + fab, .07 * ar * wd, .064 * ar * wd, .055 * ar);
    SLEEVE(b, q, U + 1, o.sleeveSlot || (g === 'skirt' ? 2 : 1), 'p_sleeve_' + fab, [ex, J.elbow + .04, 0], [wx, J.wrist + .03, .03], .053 * ar, cuff * ar, slv === 'xwide' ? .2 : slv === 'wide' ? .14 : 0);
    // (wide sleeves: the 袂 pouch is part of the sleeve loft above; no separate lump)
    S_(b, U + 1, 4, 'p_skin'); const hx = wx + sd * .004, hy = J.wrist - .042; b.tube([[wx, J.wrist + .07, .03], [hx, hy + .02, .034]], { r: [.026, .022], seg: sg(q, 6), steps: 1, cap: false }); // wrist up into the sleeve
    b.ell(hx, hy, .035, .024, .052, .038, { seg: sg(q, 8), ring: sg(q, 6) }); // palm + fingers
    if (q) b.T(hx - sd * .01, hy + .015, .065, .5, 0, -sd * .3).ell(0, 0, 0, .012, .026, .012, { seg: 5, ring: 4 }).pop(); // thumb
  }
  // --- head (bone 2): skull with face texture, jaw, nose, ears, hair/hat, beard
  const HY = J.head, hr2 = hs;
  S_(b, 2, 4, o.face || (f ? 'p_face_f' : 'p_face_m')); HEADM(b, 0, HY - .008 * hr2, .01, .086 * hr2, .118 * hr2, .099 * hr2, o.soft ?? (f || J.s < .8 ? 1 : 0), sg(q, 16), sg(q, 12)); // one-piece head, jaw and chin
  S_(b, 2, 4, 'p_face_plain'); // separate head parts never sample the face texture (no 'face within a face')
  if (q) { b.T(0, HY - .018 * hr2, .104 * hr2, -.25, 0, 0).ell(0, 0, 0, .014 * hr2, .026 * hr2, .016 * hr2, { seg: 6, ring: 5 }).pop(); // nose
    if (o.ears !== false) for (const sd of [-1, 1]) b.ell(sd * .087 * hr2, HY - .005, .0, .012, .026 * hr2, .02 * hr2, { seg: 5, ring: 4 }); }
  HAT[o.hat || 'futou'](b, q, J, o); if (o.straw) HAT.straw(b, q, J);
  if (o.beard) BEARD(b, q, J, o.beard, o.beardCol, o.beardSlot);
  if (o.extras) o.extras(b, q, J);
  skinPass(b, P, { robe });
  BEDDING(b, q, J, f);
  return P;
}
// bedding for the sleeping poses (slot 7: hidden unless asleep; second bone = pillow variant, weight 0): a
// glazed ceramic pillow 瓷枕 (Tang) under the head — one for lying on the back (b1 1), one for lying on the right side (b1 2)
function BEDDING(b, q, J, f) {
  const v0 = b.nv; void q; void f; // (the padded quilt ellipsoid over the body was removed: it read as a cocoon clipping through the sleeper)
  const v1 = b.nv; b.s({ bone: 0 | (7 << 5), slot: 0, tex: 'glaze', col: [.86, .84, .7] }); b.box(0, J.head - .02, -.17, .3, .13, .11);
  const v2 = b.nv; b.box(-.17, J.head - .02, 0, .11, .13, .3); const v3 = b.nv;
  for (let i = v0; i < v3; i++) { b.B[i * 2 + 1] = i < v1 ? 0 : i < v2 ? 1 : 2; b.W[i * 4 + 1] = 0; } }
// hair/hats (bone 2). J.head = skull centre
// ---- headwear fitted to the actual head (HEADM): every shell follows the skull with a given clearance and ends on a rim line
// that runs from a front height (just above the brows) to a back height (above the nape). F = head fit from J.
function HF(J) { const h = J.hs, cy = J.head - .008 * h; return { h, cy, cz: .01, rx: .086 * h, ry: .118 * h, rz: .099 * h, rzb: .105 * h, brow: cy + .033 * h, top: cy + .118 * h, hairline: cy + .062 * h, nape: cy - .072 * h, bunY: cy + .118 * h, bunZ: .01 - .035 * h }; }
// shell over the cranium from the top down to the rim; cl = clearance (m)
function fitShell(b, q, F, o) {
  const seg = q ? (o.seg || 16) : 6, rows = q ? 7 : 3, cl = o.cl, rx = F.rx + cl, ry = F.ry + cl, rzf = F.rz + cl, rzb = F.rzb + cl, cz = F.cz + (o.dz || 0);
  S_(b, 2, o.slot || 0, o.tex, o.col);
  return b.grid(rows, seg, (i, j) => {
    const ph = j / seg * TAU, sz = Math.sin(ph), rimY = lerp(o.back, o.front, sst(-.7, .85, sz)), thR = Math.acos(clamp((rimY - F.cy) / ry, -.97, .97)), th = thR * i / rows;
    const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * sz;
    return [x * rx, F.cy + y * ry, cz + z * (z < 0 ? rzb : rzf), j / seg * 2, i / rows];
  }, true, (i, j, p) => [p[0], p[1] - F.cy, p[2] - cz], true);
}
// band around the head between two rim lines (lo/hi at front and back)
function fitBand(b, q, F, o) {
  const seg = q ? (o.seg || 16) : 6, cl = o.cl, rx = F.rx + cl, ry = F.ry + cl, rzf = F.rz + cl, rzb = F.rzb + cl, cz = F.cz;
  S_(b, 2, o.slot || 0, o.tex, o.col); const th = y => Math.acos(clamp((y - F.cy) / ry, -.97, .97));
  return b.grid(1, seg, (i, j) => { const ph = j / seg * TAU, sz = Math.sin(ph), w = sst(-.7, .85, sz), yy = i ? lerp(o.backLo, o.frontLo, w) : lerp(o.backHi, o.frontHi, w), t = th(yy);
    const x = Math.sin(t) * Math.cos(ph), y = Math.cos(t), z = Math.sin(t) * sz; return [x * rx, F.cy + y * ry, cz + z * (z < 0 ? rzb : rzf), j / seg * 2, i]; }, true, (i, j, p) => [p[0], 0, p[2] - cz], true);
}
const HAT = {
  none() { },
  hair(b, q, J) { const F = HF(J); fitShell(b, q, F, { cl: .006, front: F.hairline, back: F.nape, tex: 'p_hair', col: HAIRK }); }, // visible hair (women, children, bareheaded men)
  hairIn(b, q, J) { const F = HF(J); fitShell(b, q, F, { cl: .005, front: F.hairline, back: F.nape, tex: 'p_hair', col: HAIRK, seg: 12 }); }, // hair under a cap (shows at the nape)
  bunKnot(b, q, J, col) { const F = HF(J), h = F.h; S_(b, 2, 0, 'p_hair', col || HAIRK); b.ell(0, F.bunY + .012 * h, F.bunZ, .042 * h, .04 * h, .042 * h, { seg: sg(q, 9), ring: sg(q, 6) }); }, // 髻 topknot
  // 幞頭 (Li Shou / Li Xian murals, Tang figurines): black gauze wrapping the cranium, rim just above the brows and above the nape; 巾子 crown over the
  // topknot, centred slightly behind the crown of the head; knot at the back with two ties hanging (commoners) or stiffened (officials)
  futou(b, q, J, o) { const F = HF(J), h = F.h; HAT.hairIn(b, q, J);
    fitShell(b, q, F, { cl: .015, front: F.brow + .012 * h, back: F.cy - .03 * h, tex: 'p_lacq_gauze', col: CAPC });
    S_(b, 2, 0, 'p_lacq_gauze', CAPC); b.T(0, F.top + .018 * h, F.bunZ, .12, 0, 0).ell(0, 0, 0, .066 * h, .074 * h, .068 * h, { seg: sg(q, 11), ring: sg(q, 7) }).pop(); // 巾子
    const kz = F.cz - F.rzb - .018 * h, ky = F.cy + .045 * h;
    if (q) for (const sd of [-1, 1]) b.T(sd * .024 * h, ky, kz, 0, sd * .5, 0).ell(0, 0, 0, .022 * h, .016 * h, .014 * h, { seg: 6, ring: 4 }).pop(); // knot
    if (o.stiff) for (const sd of [-1, 1]) b.tube([[sd * .02 * h, ky, kz], [sd * .1 * h, ky - .01 * h, kz - .04 * h], [sd * .21 * h, ky - .07 * h, kz - .03 * h]], { r: [.012, .011, .009], seg: 4, steps: q ? 3 : 1 });
    else for (const sd of [-1, 1]) { b.T(sd * .026 * h, ky, kz, 0, 0, 0, 1, 1, .35); b.tube([[0, 0, 0], [sd * .006, -.08 * h, -.045], [sd * .01, -.2 * h, -.06], [sd * .012, -.3 * h, -.05]], { r: [.016, .02, .02, .017], seg: 4, steps: q ? 2 : 1 }); b.pop(); } },
  futou_stiff(b, q, J, o) { HAT.futou(b, q, J, Object.assign({}, o, { stiff: 1 })); },
  // 裹頭 (labourers in Tang tomb figurines): cloth wrapped over the head and the topknot, knot at the back
  headcloth(b, q, J, o) { const F = HF(J), h = F.h, sl = o.hatSlot || 3; HAT.hairIn(b, q, J);
    fitShell(b, q, F, { cl: .014, front: F.brow + .016 * h, back: F.cy - .025 * h, slot: sl, tex: 'p_cloth' });
    S_(b, 2, sl, 'p_cloth'); b.ell(0, F.bunY + .012 * h, F.bunZ, .054 * h, .05 * h, .054 * h, { seg: sg(q, 9), ring: sg(q, 6) }); // over the bun
    if (q) { const kz = F.cz - F.rzb - .016 * h; b.ell(0, F.cy + .03 * h, kz, .03 * h, .024 * h, .02 * h, { seg: 6, ring: 4 }); for (const sd of [-1, 1]) b.tube([[sd * .01, F.cy + .025 * h, kz], [sd * .035, F.cy - .05 * h, kz - .01]], { r: [.013, .009], seg: 4, steps: 1 }); } },
  // bareheaded at work: hair up in the topknot, 抹額 cloth band round the forehead
  band(b, q, J, o) { const F = HF(J), h = F.h; HAT.hair(b, q, J); HAT.bunKnot(b, q, J);
    fitBand(b, q, F, { cl: .012, frontLo: F.brow + .008 * h, frontHi: F.brow + .038 * h, backLo: F.cy - .005 * h, backHi: F.cy + .025 * h, slot: o.hatSlot || 3, tex: 'p_cloth' });
    if (q) { S_(b, 2, o.hatSlot || 3, 'p_cloth'); b.ell(0, F.bunY + .005 * h, F.bunZ, .046 * h, .011 * h, .046 * h, { seg: 7, ring: 3 }); } },
  redband(b, q, J) { HAT.band(b, q, J, { hatSlot: 3 }); },
  // 笠: wide shallow straw hat whose crown cup rests on the head just above the brows (slot 5: shown only with instance flag 4)
  straw(b, q, J) { const F = HF(J), h = F.h, yb = F.brow + .03 * h, f0 = Math.sqrt(Math.max(0, 1 - ((yb - F.cy) / F.ry) ** 2)), r0 = Math.max(F.rx, F.rzb) * f0 + .022, cz = F.cz - .01, R2 = .31, rim = yb + .01;
    S_(b, 2, 5, 'straw', [.84, .76, .56]); b.T(0, 0, cz);
    b.lathe([[0, F.top + .1 * h], [r0 * .55, F.top + .085 * h], [r0 + .01, yb + .07], [R2, rim], [R2 + .01, rim - .012]], { seg: sg(q, 14) }); // upper surface
    b.lathe([[R2 + .008, rim - .014], [R2 - .02, rim - .008], [r0 + .006, yb + .055], [r0, yb]], { seg: sg(q, 14) }); // underside to the crown band
    b.lathe([[r0, yb], [r0 + .002, yb + .055], [r0 * .5, F.top + .07 * h], [0, F.top + .08 * h]], { seg: sg(q, 12) }); b.pop(); // crown cup resting on the head
    if (q) { S_(b, 2, 5, 'rope', [.5, .42, .3]); for (const sd of [-1, 1]) b.tube([[sd * (r0 - .004), yb + .01, cz], [sd * F.rx * .98, F.cy - .04 * h, F.cz + .05 * h], [sd * .03, F.cy - .105 * h, F.cz + .07 * h], [0, F.cy - .115 * h, F.cz + .068 * h]], { r: .0035, seg: 3, steps: 1 }); } },
  // 兜鍪 helmet with a red tassel
  helmet(b, q, J) { const F = HF(J), h = F.h; HAT.hairIn(b, q, J); fitShell(b, q, F, { cl: .024, front: F.brow + .008 * h, back: F.cy - .065 * h, tex: 'iron', col: [1.1, 1.1, 1.1] });
    fitBand(b, q, F, { cl: .034, frontLo: F.brow + .0, frontHi: F.brow + .02 * h, backLo: F.cy - .075 * h, backHi: F.cy - .05 * h, tex: 'iron', col: [.9, .9, .9] });
    S_(b, 2, 3, 'p_cloth'); b.ell(0, F.top + .05 * h, F.cz, .02, .04, .02, { seg: 5, ring: 4 }); },
  // women: hair drawn up into a high 峨髻 with comb and flower (簪花仕女圖)
  bun(b, q, J) { const F = HF(J), h = F.h; HAT.hair(b, q, J); S_(b, 2, 0, 'p_hair', HAIRK);
    b.T(0, F.top + .045 * h, F.bunZ, -.2, 0, 0).ell(0, 0, 0, .066 * h, .085 * h, .062 * h, { seg: sg(q, 10), ring: sg(q, 7) }).pop(); b.ell(0, F.top + .1 * h, F.bunZ + .02, .05 * h, .045 * h, .046 * h, { seg: sg(q, 8), ring: 5 });
    if (q) { b.ell(0, F.cy + .02 * h, F.cz - F.rzb - .01, .06 * h, .045 * h, .035 * h, { seg: 7, ring: 4 }); S_(b, 2, 3, 'p_silk'); b.ell(.05 * h, F.top + .06 * h, F.bunZ + .05, .026, .026, .024, { seg: 6, ring: 4 }); S_(b, 2, 0, 'gold', [1, 1, 1]); b.T(0, F.top + .01 * h, F.cz + .055 * h, .5, 0, 0).box(0, 0, 0, .085 * h, .018, .006).pop(); } },
  twinbuns(b, q, J) { const F = HF(J), h = F.h; HAT.hair(b, q, J); S_(b, 2, 0, 'p_hair', HAIRK); for (const sd of [-1, 1]) b.ell(sd * .065 * h, F.top - .01 * h, F.cz - .015, .043 * h, .047 * h, .043 * h, { seg: sg(q, 8), ring: sg(q, 5) });
    if (q) { S_(b, 2, 3, 'p_silk'); for (const sd of [-1, 1]) b.ell(sd * .065 * h, F.top - .045 * h, F.cz + .01, .02, .012, .02, { seg: 5, ring: 3 }); } },
  tufts(b, q, J) { const F = HF(J), h = F.h; HAT.hair(b, q, J); S_(b, 2, 0, 'p_hair', HAIRK); for (const sd of [-1, 1]) b.ell(sd * .055 * h, F.top - .005 * h, F.cz - .01, .034 * h, .038 * h, .034 * h, { seg: sg(q, 7), ring: 5 }); },
  lowbun(b, q, J) { const F = HF(J), h = F.h; HAT.hair(b, q, J); S_(b, 2, 3, 'p_hair'); b.ell(0, F.cy + .02 * h, F.cz - F.rzb - .025, .05, .045, .04, { seg: sg(q, 7), ring: 5 });
    fitShell(b, q, F, { cl: .018, front: F.hairline - .005 * h, back: F.cy - .02 * h, slot: 2, tex: 'p_cloth' }); }, // old woman's head scarf over the hair
  shaven(b, q, J) { const F = HF(J); fitShell(b, q, F, { cl: .002, front: F.brow + .045 * F.h, back: F.nape, slot: 4, tex: 'p_skin', col: [.62, .6, .6] }); },
  messy(b, q, J) { const F = HF(J), h = F.h; fitShell(b, q, F, { cl: .009, front: F.hairline - .008 * h, back: F.nape - .01 * h, tex: 'p_hair', col: [.2, .18, .16] }); HAT.bunKnot(b, q, J, [.2, .18, .16]);
    if (q) { S_(b, 2, 0, 'p_hair', [.2, .18, .16]); for (const a of [-.9, .2, 1.3]) b.ell(Math.sin(a) * .07 * h, F.cy + .03 * h, F.cz + Math.cos(a) * -.08 * h, .03, .02, .025, { seg: 5, ring: 3 }); } },
  // Sogdian/胡姬 pointed felt cap (尖頂虛帽) with rolled brim: fitted base + cone + brim band
  felt_pointed(b, q, J) { const F = HF(J), h = F.h; HAT.hairIn(b, q, J); fitShell(b, q, F, { cl: .016, front: F.brow + .02 * h, back: F.cy - .02 * h, slot: 3, tex: 'p_felt' });
    S_(b, 2, 3, 'p_felt'); b.T(0, 0, F.cz - .01).lathe([[.07 * h, F.top - .02 * h], [.052 * h, F.top + .06 * h], [.02 * h, F.top + .13 * h], [0, F.top + .15 * h]], { seg: sg(q, 10) }).pop();
    fitBand(b, q, F, { cl: .028, frontLo: F.brow + .014 * h, frontHi: F.brow + .048 * h, backLo: F.cy - .026 * h, backHi: F.cy + .008 * h, slot: 2, tex: 'p_felt' }); },
  // Uyghur round felt cap with fur trim
  felt_round(b, q, J) { const F = HF(J), h = F.h; HAT.hairIn(b, q, J); fitShell(b, q, F, { cl: .018, front: F.brow + .02 * h, back: F.cy - .02 * h, slot: 3, tex: 'p_felt' });
    S_(b, 2, 3, 'p_felt'); b.T(0, 0, F.cz - .01).lathe([[.075 * h, F.top - .01 * h], [.055 * h, F.top + .035 * h], [0, F.top + .045 * h]], { seg: sg(q, 10) }).pop();
    fitBand(b, q, F, { cl: .03, frontLo: F.brow + .012 * h, frontHi: F.brow + .05 * h, backLo: F.cy - .028 * h, backHi: F.cy + .01 * h, tex: 'p_hide', col: [.45, .36, .28] }); },
  // Persian wrapped cap
  turban(b, q, J) { const F = HF(J), h = F.h; HAT.hairIn(b, q, J); fitShell(b, q, F, { cl: .024, front: F.brow + .016 * h, back: F.cy - .022 * h, slot: 3, tex: 'p_cloth' });
    fitBand(b, q, F, { cl: .034, frontLo: F.brow + .012 * h, frontHi: F.brow + .06 * h, backLo: F.cy - .028 * h, backHi: F.cy + .025 * h, slot: 3, tex: 'p_cloth' }); },
  // Daoist: topknot centred on the crown in a small 黃冠 with a pin
  crown(b, q, J) { const F = HF(J), h = F.h; HAT.hair(b, q, J); S_(b, 2, 0, 'p_hair', HAIRK); b.ell(0, F.top + .015 * h, F.cz - .015, .04, .045, .04, { seg: sg(q, 8), ring: 5 });
    S_(b, 2, 3, 'p_silk'); b.T(0, 0, F.cz - .015).lathe([[0, F.top - .01 * h], [.046, F.top - .01 * h], [.058, F.top + .055 * h], [.036, F.top + .075 * h], [0, F.top + .07 * h]], { seg: sg(q, 9) }).pop();
    S_(b, 2, 0, 'wood', [.7, .55, .4]); b.T(0, F.top + .04 * h, F.cz - .015, 0, 0, PI / 2).cyl(0, -.07, 0, .006, .07, { seg: 4 }).pop(); },
  // 帷帽: brimmed hat on top of the head with a light gauze veil to the chin, open in front
  weimao(b, q, J) { // 帷帽: wide round-brimmed hat (light lacquered straw) with a sheer gauze curtain to the chin, open in front
    const F = HF(J), h = F.h; HAT.hair(b, q, J); HAT.bunKnot(b, q, J); const y0 = F.top - .01 * h, cz = F.cz - .012, rb = .23;
    S_(b, 2, 0, 'straw', [.74, .64, .5]); b.T(0, 0, cz);
    b.lathe([[0, y0 + .1], [.06, y0 + .095], [.085, y0 + .055], [.095, y0 + .012], [rb, y0 - .012], [rb + .008, y0 - .026]], { seg: sg(q, 16) }); // crown and brim (upper)
    b.lathe([[rb + .006, y0 - .028], [rb - .01, y0 - .022], [.095, y0], [.085, y0 + .005], [0, y0 + .02]], { seg: sg(q, 16) }); b.pop(); // underside
    S_(b, 2, 0, 'p_veil', [1, .98, .95]); b.T(0, 0, cz);
    const vp = [[rb - .01, F.cy - .07 * h], [rb - .006, F.cy - .02 * h], [rb - .004, y0 - .024]];
    b.lathe(vp, { seg: sg(q, 16), a0: PI * .8, a1: PI * 2.2, uvs: [3, 1] }); b.lathe(vp.slice().reverse(), { seg: sg(q, 16), a0: PI * .8, a1: PI * 2.2, uvs: [3, 1] }); b.pop(); },
  // Uyghur: braids from behind the ears + low felt cap
  braids(b, q, J) { const F = HF(J), h = F.h; HAT.hairIn(b, q, J); S_(b, 2, 0, 'p_hair', [.2, .13, .1]); for (const sd of [-1, 1]) b.tube([[sd * (F.rx - .01), F.cy - .01 * h, F.cz - .06], [sd * (F.rx + .004), F.cy - .15 * h, F.cz - .07], [sd * (F.rx - .006), F.cy - .32 * h, F.cz - .05]], { r: [.02, .018, .012], seg: 4, steps: q ? 2 : 1 });
    fitShell(b, q, F, { cl: .018, front: F.brow + .022 * h, back: F.cy - .015 * h, slot: 3, tex: 'p_felt' }); fitBand(b, q, F, { cl: .028, frontLo: F.brow + .015 * h, frontHi: F.brow + .045 * h, backLo: F.cy - .02 * h, backHi: F.cy + .012 * h, slot: 2, tex: 'p_felt' }); },
};
function BEARD(b, q, J, kind, col, slot = 0) {
  const Y = J.head, h = J.hs, c = col || [.15, .13, .12]; S_(b, 2, slot, 'p_hair', c);
  if (kind === 'full') { b.ell(0, Y - .075 * h, .045, .07 * h, .07 * h, .065 * h, { seg: sg(q, 10), ring: sg(q, 6), disp: q ? lumpy(.12, 9, 5) : undefined }); b.ell(0, Y - .13 * h, .06, .05 * h, .06 * h, .045 * h, { seg: sg(q, 8), ring: 5 }); }
  else if (kind === 'long') { b.tube([[0, Y - .06 * h, .085], [0, Y - .12 * h, .1], [0, Y - .25 * h, .09], [0, Y - .33 * h, .07]], { r: [.035, .038, .025, .006], seg: sg(q, 7), steps: q ? 2 : 1 }); }
  else if (kind === 'goatee') { b.tube([[0, Y - .085 * h, .085], [0, Y - .15 * h, .085]], { r: [.022, .006], seg: 5, steps: 1 }); }
  else if (kind === 'stubble') { S_(b, 2, slot, 'p_hair', [.4, .36, .34]); b.ell(0, Y - .06 * h, .032, .064 * h, .05 * h, .068 * h, { seg: sg(q, 9), ring: 5, disp: (x, y) => y > .2 ? -.3 : 0 }); }
  if (q && kind !== 'stubble') for (const sd of [-1, 1]) b.tube([[sd * .006, Y - .04 * h, .1], [sd * .035, Y - .052 * h, .09], [sd * .045, Y - .085 * h, .075]], { r: [.008, .007, .003], seg: 4 }); // moustache
}
// hand items: right hand bone 13 / left 14 (hand position from the pivots)
const HP = (J, sd) => [sd * (J.shX + .05), J.wrist - .06, .04];
const ITEMS = {
  bundle(b, q, J) { const [x, y, z] = HP(J, 1); S_(b, 14, 0, 'p_cloth', [.7, .62, .5]); b.ell(x + .02, y - .07, z, .07, .065, .06, { seg: sg(q, 8), ring: sg(q, 5) }); if (q) b.ell(x, y - .01, z, .02, .03, .02, { seg: 5, ring: 4 }); },
  lantern(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'bamboo', [.8, .7, .5]); b.tube([[x, y, z], [x, y + .03, z + .2], [x, y - .02, z + .32]], { r: .008, seg: 3, steps: 1 });
    b.s({ bone: 13 | (6 << 5), slot: 13, tex: 'rope', col: [.35, .3, .25] }); b.tube([[x, y - .02, z + .32], [x, y - .085, z + .32]], { r: .0035, seg: 3, steps: 1 }); // cord (slot 6: hangs plumb from the stick tip, see VS_CROWD)
    b.s({ bone: 13 | (6 << 5), slot: 13, tex: 'p_silk', col: [1, .86, .6], emi: .9 }); b.T(x, y - .28, z + .32).lathe([[0, 0], [.055, .01], [.075, .08], [.07, .15], [.045, .19], [0, .2]], { seg: sg(q, 8) }).pop(); b.s({ emi: 0 }); },
  broom(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'wood', [.9, .85, .75]); b.tube([[x, y + .35, z - .02], [x, y - .55, z + .12]], { r: .015, seg: 4, steps: 1 }); S_(b, 13, 0, 'straw', [.9, .8, .55]); b.T(x, y - .72, z + .14, .2, 0, 0).lathe([[0, -.13], [.11, -.11], [.06, .1], [.02, .2], [0, .21]], { seg: sg(q, 8) }).pop(); },
  basket(b, q, J) { const [x, y, z] = HP(J, 1); S_(b, 14, 0, 'straw', [.9, .78, .52]); b.T(x + .05, y - .08, z + .02).lathe([[0, -.06], [.15, -.05], [.19, .04], [.18, .05], [0, -.01]], { seg: sg(q, 10) }).pop(); S_(b, 14, 0, 'p_cloth', [.85, .6, .35]); b.ell(x + .05, y - .04, z + .02, .13, .04, .13, { seg: sg(q, 7), ring: 4 }); },
  fan(b, q, J) { const [x, y, z] = HP(J, 1); S_(b, 14, 0, 'wood', [.6, .45, .3]); b.tube([[x, y, z + .02], [x, y + .12, z + .05]], { r: .007, seg: 3, steps: 1 }); S_(b, 14, 3, 'p_silk'); b.T(x, y + .21, z + .07, PI / 2 - .3, 0, 0).cyl(0, -.004, 0, .085, .004, { seg: sg(q, 10) }).pop(); }, // 團扇 round silk fan
  hu(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'bone', [.95, .9, .78]); b.T(x + .02, y + .1, z + .03, -.2, 0, 0).box(0, 0, 0, .055, .3, .012).pop(); },
  scroll(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'paper', [1, .95, .85]); b.T(x, y, z + .02, 0, 0, PI / 2).cyl(0, -.12, 0, .022, .12, { seg: 6 }).pop(); },
  staff(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'bronze', [.9, .8, .6]); b.tube([[x, .02, z], [x, y + .95, z]], { r: .013, seg: 4, steps: 1 }); b.T(x, y + 1.0, z).lathe([[0, -.04], [.06, 0], [.04, .09], [0, .11]], { seg: sg(q, 6) }).pop(); },
  bowl(b, q, J) { const [x, y, z] = HP(J, 1); S_(b, 14, 0, 'lacquer_black', [1, 1, 1]); b.T(x, y - .03, z + .03).lathe([[0, -.03], [.07, -.02], [.08, .03], [.07, .035], [0, .0]], { seg: sg(q, 8) }).pop(); },
  whisk(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'wood', [.7, .5, .35]); b.tube([[x, y, z], [x, y + .22, z + .1]], { r: .01, seg: 4, steps: 1 }); S_(b, 13, 0, 'p_hair', [3, 2.9, 2.7]); b.tube([[x, y + .22, z + .1], [x + .03, y + .06, z + .2], [x + .05, y - .15, z + .2]], { r: [.02, .026, .01], seg: 5 }); },
  spear(b, q, J) { const [x, y, z] = HP(J, -1), dx = -.11 / 1.4, dz = .26 / 1.4, at = h => [x + dx * (h - y), h, z + .03 + dz * (h - y)]; // the shaft through the fist, butt by the foot, the top leaning forward and out: clear of the forearm and sleeve
    const tp = at(y + 1.4), hd = at(y + 1.5), ts = at(y + 1.37); S_(b, 13, 0, 'wood', [.7, .52, .36]); b.tube([at(.02), tp], { r: .015, seg: 4, steps: 1 }); S_(b, 13, 0, 'steel', [1, 1, 1]);
    b.T(hd[0], hd[1], hd[2], Math.atan(dz), 0, -Math.atan(dx)).lathe([[0, -.1], [.022, -.06], [.028, .06], [0, .22]], { seg: 4 }).pop(); if (q) { S_(b, 13, 0, 'p_cloth', [.8, .2, .16]); b.ell(ts[0], ts[1], ts[2], .03, .05, .03, { seg: 5, ring: 4 }); } },
  stick(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'bark', [.9, .8, .7]); b.tube([[x, .01, z + .12], [x, y + .03, z + .02], [x + .02, y + .1, z]], { r: .018, seg: 5, steps: 1 }); },
  jug(b, q, J) { const [x, y, z] = HP(J, -1); S_(b, 13, 0, 'celadon', [1, 1, 1]); b.T(x, y - .06, z + .04).lathe([[0, -.1], [.05, -.09], [.075, 0], [.04, .07], [.025, .1], [.035, .12], [0, .12]], { seg: sg(q, 8) }).pop(); },
  balls(b, q, J) { for (const sd of [-1, 1]) { const [x, y, z] = HP(J, sd); S_(b, sd > 0 ? 14 : 13, 0, 'p_silk', sd > 0 ? [.9, .3, .25] : [.95, .8, .3]); b.ell(x, y - .02, z + .05, .035, .035, .035, { seg: 6, ring: 4 }); } },
  pole(b, q, J) { const X = -J.shX + .02, Y = J.sh + .05; S_(b, 15, 0, 'bamboo', [.9, .82, .6]); b.tube([[X, Y - .03, .85], [X, Y, 0], [X, Y - .03, -.85]], { r: .022, seg: 5, steps: 2 });
    for (const zz of [.82, -.82]) { S_(b, 15, 0, 'rope', [.8, .7, .5]); for (const dx of [-.1, .1]) b.tube([[X, Y - .03, zz], [X + dx, Y - .5, zz + dx * .4]], { r: .006, seg: 3, steps: 1, cap: false });
      S_(b, 15, 0, 'straw', [.85, .72, .5]); b.T(X, Y - .85, zz).lathe([[0, 0], [.16, .02], [.2, .2], [.21, .36], [.18, .37], [0, .3]], { seg: sg(q, 10) }).pop();
      S_(b, 15, 0, 'p_cloth', zz > 0 ? [.62, .66, .36] : [.8, .7, .52]); b.ell(X, Y - .48, zz, .17, .07, .17, { seg: sg(q, 8), ring: 4 }); } },
  pack(b, q, J) { S_(b, 15, 0, 'burlap', [1, .95, .85]); b.ell(0, J.sh - .1, -.2, .17, .22, .12, { seg: sg(q, 9), ring: sg(q, 6) }); S_(b, 15, 0, 'rope', [.7, .6, .45]); for (const sd of [-1, 1]) b.tube([[sd * .1, J.sh + .02, -.12], [sd * .12, J.sh + .03, .08], [sd * .13, J.waist + .1, .12]], { r: .008, seg: 3, steps: 1 }); },
  headload(b, q, J) { S_(b, 2, 0, 'straw', [.9, .78, .52]); b.T(0, J.head + .14, 0).lathe([[0, -.03], [.18, -.02], [.22, .06], [.2, .07], [0, .02]], { seg: sg(q, 10) }).pop(); S_(b, 2, 0, 'p_cloth', [.8, .55, .3]); b.ell(0, J.head + .2, 0, .17, .05, .17, { seg: sg(q, 8), ring: 4 }); },
  pipa(b, q, J) { const y = J.waist - .1; b.s({ bone: 15, slot: 15, tex: 'wood', col: [1.15, .9, .65] }); b.T(-.04, y + .12, .24, -.35, 0, -.95); b.ell(0, 0, 0, .12, .17, .035, { seg: sg(q, 10), ring: sg(q, 6) });
    b.s({ col: [.6, .42, .3] }); b.tube([[0, .14, .005], [0, .4, .01]], { r: [.022, .016], seg: 4, steps: 1 }); b.T(0, .43, -.01, -.6, 0, 0).box(0, 0, 0, .04, .09, .03).pop(); b.s({ tex: 'white', col: [.9, .85, .7] }); b.box(0, -.08, .037, .1, .015, .004); b.pop(); },
};
// body types → builder options
function H_(o) { return (b, q) => { let P; if (!q) P = FARH(b, o); else { P = HUMAN(b, q, o); for (const it of o.items || []) ITEMS[it](b, q, P.J || Object.assign({}, JOF(o))); }
  if (o.stoop) STOOP(b, P, JOF(o), o.stoop); return P; }; }
// rounded back of the elderly: bend the upper spine forward along a circular arc (chest, neck and robe top follow smoothly), the head projects
// forward and down but keeps looking ahead, the arms hang from the forward shoulders. Applied to the built mesh and its pivots.
function STOOP(b, P, J, k) {
  const y0 = J.waist + .02, c = 1.45 * k, Rc = 1 / c, V = b.P, N = b.N, B = b.B;
  const bend = (y, z) => { if (y <= y0) return [y, z, 0]; const th = c * (y - y0), sn = Math.sin(th), cs = Math.cos(th); return [y0 + Rc * sn - z * sn, Rc * (1 - cs) + z * cs, th]; };
  const sh = bend(J.sh, 0), dSh = [sh[0] - J.sh, sh[1] - 0], nk = bend(P[2][1], P[2][2]), hdA = nk[2] * .45;
  const rot = (y, z, a) => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  for (let i = 0; i < b.nv; i++) { const bone = B[i * 2] & 31, y = V[i * 3 + 1], z = V[i * 3 + 2];
    if (bone === 2) { const [ry, rz] = rot(y - P[2][1], z - P[2][2], hdA); V[i * 3 + 1] = nk[0] + ry; V[i * 3 + 2] = nk[1] + rz; const [ny, nz] = rot(N[i * 3 + 1], N[i * 3 + 2], hdA); N[i * 3 + 1] = ny; N[i * 3 + 2] = nz; }
    else if (bone === 3 || bone === 4 || bone === 5 || bone === 6 || bone === 13 || bone === 14) { V[i * 3 + 1] += dSh[0]; V[i * 3 + 2] += dSh[1]; }
    else if (bone === 1 || bone === 15 || bone === 0) { const r = bend(y, z); if (r[2]) { V[i * 3 + 1] = r[0]; V[i * 3 + 2] = r[1]; const [ny, nz] = rot(N[i * 3 + 1], N[i * 3 + 2], r[2]); N[i * 3 + 1] = ny; N[i * 3 + 2] = nz; } } }
  for (const k2 of [3, 4, 5, 6, 13, 14]) { P[k2][1] += dSh[0]; P[k2][2] += dSh[1]; }
  P[2][1] = nk[0]; P[2][2] = nk[1]; const c15 = bend(P[15][1], P[15][2]); P[15][1] = c15[0]; P[15][2] = c15[1];
}
// far LOD human (≤ ~300 tris): same skeleton and slots, few coarse parts; only long items (pole, spear, staff) kept
const FAR_HAT = { futou: [0, CAPC, 'cap'], futou_stiff: [0, CAPC, 'cap'], headcloth: [3, null, 'knot'], band: [0, HAIRK, 'knot'], helmet: [0, [.5, .5, .52], 'cap'], bun: [0, HAIRK, 'bun'], twinbuns: [0, HAIRK, 'cap'], tufts: [0, HAIRK, 'cap'],
  lowbun: [2, null, 'cap'], shaven: [4, [.62, .6, .6], 'none'], felt_pointed: [3, null, 'tall'], felt_round: [3, null, 'cap'], turban: [3, null, 'cap'], crown: [0, HAIRK, 'bun'], weimao: [0, [.3, .27, .24], 'brim'], messy: [0, [.2, .18, .16], 'cap'], redband: [0, HAIRK, 'cap'], braids: [3, null, 'cap'], hair: [0, HAIRK, 'cap'], none: [0, HAIRK, 'none'] };
function FARH(b, o) {
  const J = JOF(o), wd = J.wd = o.wd || 1, f = J.f, g = o.garment || 'mid', robe = g !== 'jacket';
  const P = [[0, J.hip + .06, 0], [0, J.waist + .02, 0], [0, J.neck + .02, .0], [J.shX, J.sh, 0], [J.shX + .03, J.elbow, .0], [-J.shX, J.sh, 0], [-(J.shX + .03), J.elbow, .0],
    [J.hipX, J.hip, 0], [J.hipX + .006, J.knee, .012], [J.hipX + .01, J.ank, 0], [-J.hipX, J.hip, 0], [-(J.hipX + .006), J.knee, .012], [-(J.hipX + .01), J.ank, 0], [-(J.shX + .045), J.wrist, .03], [J.shX + .045, J.wrist, .03], [0, J.sh, 0]];
  const sk = o.legs === 'bare' || o.legs === 'rolled';
  for (const sd of [1, -1]) { const T = sd > 0 ? 7 : 10, x = sd * J.hipX;
    S_(b, T, 2, 'p_cloth'); b.tube([[x, J.hip + .04, 0], [x, J.knee, .01]], { r: [.085 * wd * J.s, .062 * J.s], seg: 3, steps: 1, cap: false });
    S_(b, T + 1, sk ? 4 : 2, sk ? 'p_skin' : 'p_cloth'); b.tube([[x, J.knee + .04, .01], [x, J.ank - .03, 0]], { r: [.06 * J.s, .045 * J.s], seg: 3, steps: 1, cap: false });
    S_(b, T + 2, 0, 'p_hide', o.shoes === 'boots' ? [.1, .085, .08] : [.3, .24, .2]); b.ell(x, .04 * J.s, .045, .05 * J.s, .042 * J.s, .11 * J.s, { seg: 4, ring: 2 }); }
  const hem = { long: .07, mid: .3, knee: .45, coat: .42, jacket: .7, skirt: .04 }[g] * J.s, hr = ({ long: .275, mid: .255, knee: .235, coat: .235, jacket: .2, skirt: .28 }[g]) * wd;
  S_(b, 0, 1, g === 'skirt' ? 'p_skirt' : 'p_robe_' + (o.fab || (f ? 'silk' : 'hemp'))); b.lathe([[0, hem], [hr, hem + .02], [.19 * wd, J.hip], [.175 * wd, J.waist + (g === 'skirt' ? .2 : 0)], [0, J.waist + (g === 'skirt' ? .21 : .02)]], { seg: 6 });
  const cr = (f ? .15 : .172) * wd; S_(b, 1, o.upperSlot || (g === 'skirt' ? 2 : 1), 'p_cloth'); b.T(0, 0, 0, 0, 0, 0, 1, 1, .8); b.lathe([[cr * .92, J.waist - .04], [cr * 1.05, J.waist + .15], [cr, J.sh - .06], [cr * .55, J.sh + .03], [0, J.neck]], { seg: 6 }); b.pop();
  const cuff = o.sleeve === 'xwide' ? .13 : o.sleeve === 'wide' ? .1 : .05;
  for (const sd of [1, -1]) { const U = sd > 0 ? 3 : 5, X = J.shX; SHOULDER(b, 0, Object.assign({ wd }, J), sd, U, o.sleeveSlot || (g === 'skirt' ? 2 : 1), 'p_sleeve_' + (o.fab || (f ? 'silk' : 'hemp')), .066, .06, .052);
    S_(b, U + 1, o.sleeveSlot || (g === 'skirt' ? 2 : 1), 'p_cloth'); b.tube([[sd * (X + .03), J.elbow + .03, 0], [sd * (X + .045), J.wrist + .02, .03]], { r: [.05, cuff], seg: 3, steps: 1, cap: [false, true] }); // closed cuff (far LOD)
    S_(b, U + 1, 4, 'p_skin'); b.ell(sd * (X + .05), J.wrist - .035, .035, .026, .055, .036, { seg: 4, ring: 2 }); }
  S_(b, 2, 4, o.face || (f ? 'p_face_f' : 'p_face_m')); HEADM(b, 0, J.head - .008 * J.hs, .01, .086 * J.hs, .118 * J.hs, .099 * J.hs, f ? 1 : 0, 6, 5); S_(b, 1, 4, 'p_skin'); b.tube([[0, J.sh - .02, 0], [0, J.neck + .06, .005]], { r: .05 * J.hs, seg: 3, steps: 1, cap: false });
  HAT[o.hat || 'futou'](b, 0, J, o); const Y = J.head, h = J.hs;
  if (o.straw) HAT.straw(b, 0, J);
  if (o.beard === 'full' || o.beard === 'long') { S_(b, 2, o.beardSlot || 0, 'p_hair', o.beardCol || [.15, .13, .12]); b.ell(0, Y - .09 * h, .05, .06, .07, .05, { seg: 4, ring: 2 }); }
  skinPass(b, P, { robe }); BEDDING(b, 0, J, f);
  for (const it of o.items || []) if (it === 'pole' || it === 'spear' || it === 'staff') ITEMS[it](b, 0, J);
  return P;
}
function JOF(o) { const s = o.s || 1, wd = o.wd || 1, hs = o.hs || 1, f = !!o.f; const J = { ank: .085 * s, knee: .475 * s, hip: .87 * s, waist: .99 * s, sh: 1.33 * s, neck: 1.43 * s, shX: (f ? .14 : .155) * wd, hipX: .09 * wd, hs, s, f };
  J.elbow = J.sh - .275 * s; J.wrist = J.elbow - .245 * s; J.head = J.neck + .125 * hs; return J; }
const ARCH_P = {
  man: H_({ garment: 'mid', hat: 'futou', items: ['bundle', 'lantern'], pouch: 1, beard: null }),
  labourer: H_({ garment: 'jacket', hat: 'band', straw: 1, legs: 'rolled', shoes: 'sandals', collar: false, crossCollar: 1, beltCol: [.6, .55, .45], items: ['broom'] }),
  porter: H_({ garment: 'jacket', hat: 'headcloth', straw: 1, legs: 'rolled', shoes: 'sandals', collar: false, crossCollar: 1, beltCol: [.6, .55, .45], items: ['pole'], wd: 1.04 }),
  vendor: H_({ garment: 'knee', hat: 'headcloth', straw: 1, hatSlot: 3, shoes: 'shoes', pouch: 1, items: ['basket'], extras: (b, q, J) => { S_(b, 0, 3, 'p_cloth'); b.lathe([[0, J.hip - .3], [.25, J.hip - .3], [.25, J.hip - .26], [.215, J.hip], [.2, J.waist - .04], [0, J.waist - .03]], { seg: sg(q, 12), a0: -.9 - PI / 2, a1: .9 - PI / 2 }); } }),
  official: H_({ fab: 'damask', garment: 'long', hat: 'futou_stiff', stiff: 1, sleeve: 'wide', shoes: 'boots', beltSlot: 0, beltCol: [.12, .11, .11], beard: 'goatee', items: ['hu'], extras: (b, q, J) => { if (!q) return; S_(b, 0, 3, 'metal'); for (let i = 0; i < 9; i++) { const a = -1.4 + i * .35; b.ell(Math.sin(a) * .2, J.waist - .03, Math.cos(a) * .17, .02, .018, .008, { seg: 4, ring: 3 }); } S_(b, 0, 3, 'p_hide'); b.ell(.19, J.waist - .12, .03, .02, .05, .03, { seg: 5, ring: 4 }); } }),
  scholar: H_({ garment: 'long', hat: 'futou', sleeve: 'wide', shoes: 'shoes', items: ['scroll'], beard: null }),
  woman: H_({ lowNeck: 1, banbi: 1, f: 1, s: .95, garment: 'skirt', hat: 'bun', sleeve: 'wide', shoes: 'shoes', collar: false, shoeCol: [.55, .3, .25], items: ['fan'], extras: SHAWL }),
  veil: H_({ lowNeck: 1, f: 1, s: .95, garment: 'skirt', hat: 'weimao', sleeve: 'wide', shoes: 'shoes', collar: false, shoeCol: [.55, .3, .25], extras: SHAWL }),
  musician: H_({ lowNeck: 1, banbi: 1, f: 1, s: .95, garment: 'skirt', hat: 'bun', sleeve: 'wide', shoes: 'shoes', collar: false, shoeCol: [.55, .3, .25], items: ['pipa'], extras: SHAWL }),
  huji: H_({ fab: 'silk', f: 1, s: .96, garment: 'coat', hat: 'felt_pointed', sleeve: 'narrow', shoes: 'boots', hemTrim: 1, collar: false, items: ['jug'], face: 'p_face_f', extras: (b, q, J) => { LAPELS(b, q, J, 3); S_(b, 0, 2, 'p_silk'); b.lathe([[0, .04], [.24, .04], [.25, .08], [.21, J.knee], [0, J.knee + .02]], { seg: sg(q, 13) }); } }),
  maid: H_({ banbi: 3, banbiFab: 'hemp', fab: 'hemp', f: 1, s: .9, garment: 'skirt', hat: 'twinbuns', sleeve: 'narrow', shoes: 'shoes', collar: false, items: ['bundle'] }),
  child: H_({ s: .64, hs: .92, wd: .82, garment: 'jacket', hat: 'tufts', legs: 'trousers', collar: false, crossCollar: 1, beltCol: [.6, .3, .24], face: 'p_face_m' }),
  girl: H_({ f: 1, s: .62, hs: .9, wd: .8, garment: 'skirt', hat: 'twinbuns', sleeve: 'narrow', shoes: 'shoes', collar: false, face: 'p_face_m' }),
  monk: H_({ garment: 'long', hat: 'shaven', sleeve: 'wide', shoes: 'sandals', belt: false, collar: false, crossCollar: 1, upperSlot: 2, items: ['staff', 'bowl'], extras: KASAYA }),
  nun: H_({ f: 1, s: .95, garment: 'long', hat: 'shaven', sleeve: 'wide', shoes: 'sandals', belt: false, collar: false, crossCollar: 1, upperSlot: 2, items: ['bowl'], extras: KASAYA }),
  daoist: H_({ fab: 'silk', garment: 'long', hat: 'crown', sleeve: 'xwide', shoes: 'shoes', collar: false, crossCollar: 2, beltSlot: 2, beard: 'long', beardCol: [.2, .18, .16], items: ['whisk'] }),
  sogdian: H_({ fab: 'silk', garment: 'coat', hat: 'felt_pointed', sleeve: 'narrow', shoes: 'boots', hemTrim: 1, collar: false, beltSlot: 0, beltCol: [.16, .12, .1], pouch: 1, knife: 1, beard: 'full', beardCol: [.22, .15, .1], extras: (b, q, J) => LAPELS(b, q, J, 2) }),
  persian: H_({ fab: 'silk', garment: 'long', hat: 'turban', sleeve: 'narrow', shoes: 'boots', collar: false, crossCollar: 2, beltSlot: 2, pouch: 1, beard: 'full', beardCol: [.12, .1, .09], extras: (b, q, J) => LAPELS(b, q, J, 2) }),
  uyghur: H_({ garment: 'coat', hat: 'braids', sleeve: 'narrow', shoes: 'boots', hemTrim: 1, collar: false, beltSlot: 0, beltCol: [.2, .15, .1], knife: 1, beard: 'goatee', beardCol: [.2, .15, .12], extras: (b, q, J) => LAPELS(b, q, J, 2) }),
  guard: H_({ garment: 'knee', hat: 'futou', sleeve: 'narrow', shoes: 'boots', beltSlot: 0, beltCol: [.14, .1, .08], beard: 'goatee', items: ['spear'], extras: (b, q, J) => { // 兩當 lamellar vest, 抹額, 橫刀
    S_(b, 1, 2, 'p_lamellar', [1.15, 1.15, 1.15]); b.T(0, 0, 0, 0, 0, 0, 1, 1, .84); b.lathe([[.19, J.waist - .1], [.205, J.waist - .08], [.215, J.waist + .15], [.2, J.sh - .06], [.12, J.sh + .02], [0, J.sh + .03]], { seg: sg(q, 12) }); b.pop();
    if (q) for (const sd of [-1, 1]) { b.T(sd * (J.shX + .02), J.sh + .01, 0, 0, 0, -sd * .5).ell(0, 0, 0, .09, .04, .09, { seg: 7, ring: 4 }).pop(); }
    S_(b, 2, 3, 'p_cloth'); b.lathe([[.093, J.head + .03], [.1, J.head + .035], [.1, J.head + .06], [.093, J.head + .065]], { seg: sg(q, 12) });
    S_(b, 0, 0, 'lacquer_black', [1, 1, 1]); b.T(.22, J.waist - .2, .02, .45, 0, .12).box(0, 0, 0, .032, .72, .045).pop(); } }),
  old: H_({ s: .95, garment: 'long', hat: 'futou', sleeve: 'wide', shoes: 'shoes', stoop: 1, beard: 'long', beardCol: PKC, beardSlot: 3, face: 'p_face_o', robeW: 1.06, items: ['stick'] }),
  oldwoman: H_({ fab: 'hemp', f: 1, s: .9, garment: 'skirt', hat: 'lowbun', sleeve: 'narrow', shoes: 'shoes', collar: false, stoop: 1, face: 'p_face_o', items: ['stick'] }),
  beggar: H_({ s: .97, garment: 'knee', hat: 'messy', sleeve: 'narrow', legs: 'rolled', shoes: 'bare', belt: true, beltCol: [.4, .35, .28], ragged: 1, beard: 'stubble', face: 'p_face_o', items: ['bowl', 'stick'] }),
  entertainer: H_({ garment: 'jacket', hat: 'redband', sleeve: 'narrow', legs: 'trousers', shoes: 'shoes', collar: false, crossCollar: 3, beltSlot: 3, items: ['balls'] }),
  // ---------- animals (anim >= 40) ----------
  donkey(b, q) { return QUAD(b, q, { kind: 'donkey', rider: 'labourer', load: 'packs', lead: [.55, .62] }); },
  horse(b, q) { return QUAD(b, q, { kind: 'horse', rider: 'official', load: 'saddle', lead: [.85, .7] }); },
  horsewoman(b, q) { return QUAD(b, q, { kind: 'horse', rider: 'woman', load: 'saddle' }); },
  camel(b, q) { return QUAD(b, q, { kind: 'camel', load: 'bales', lead: [.8, 1.1] }); },
  oxcart(b, q) { return QUAD(b, q, { kind: 'ox', cart: 1, z0: 1.2, lead: [-.75, 1.6] }); },
  dog(b, q) { return QUAD(b, q, { kind: 'dog' }); },
  chicken(b, q) { return CHICKEN(b, q); },
};
function SHAWL(b, q, J) { // 披帛: a long flat gauze ribbon over the shoulders and behind the neck (chest bone), its ends looped over the forearms and hanging at the sides (forearm bones)
  const N = q ? 8 : 3, back = [], bw = [];
  for (let k = 0; k <= N; k++) { const t = k / N, a = lerp(-1, 1, t), x = a * (J.shX + .05), y = J.sh - .02 - (1 - Math.cos(a * 1.4)) * .05 - (Math.abs(a) > .75 ? (Math.abs(a) - .75) * .5 : 0), z = -.07 - Math.cos(a * 1.57) * .05 + Math.max(0, Math.abs(a) - .7) * .3;
    back.push([x, y, z]); bw.push([0, .06 + .02 * Math.cos(a * 1.57), -.035]); } // gathered on the back, ~16 cm wide
  S_(b, 1, 3, 'p_gauze'); RIBBON(b, q, back, bw);
  for (const sd of [1, -1]) { const pts = [], wv = [], M = q ? 7 : 2;
    for (let k = 0; k <= M; k++) { const t = k / M, tw = t * .9; pts.push([sd * (J.shX + .085 + Math.sin(t * 2.2) * .02), lerp(J.elbow + .03, J.knee + .08, t), .03 + Math.sin(t * 3) * .03]);
      wv.push([sd * Math.sin(tw) * .07, 0, Math.cos(tw) * .075]); } // ~15 cm wide end with a slow twist, hanging at the side
    S_(b, sd > 0 ? 4 : 6, 3, 'p_gauze'); RIBBON(b, q, pts, wv); }
}
function LAPELS(b, q, J, slot) { S_(b, 1, slot, 'p_silk'); for (const sd of [-1, 1]) { const zf = .155; b.q4([sd * .01, J.waist + .02, zf], [sd * .12, J.sh - .1, zf - .03], [sd * .04, J.neck - .03, zf - .02], [sd * .015, J.sh - .14, zf + .003]); b.q4([sd * .12, J.sh - .1, zf - .029], [sd * .01, J.waist + .02, zf + .001], [sd * .015, J.sh - .14, zf + .004], [sd * .04, J.neck - .03, zf - .019]); } }
function KASAYA(b, q, J) { // 袈裟 over the left shoulder (slot 2) with the under-robe (slot 1) visible at the right shoulder and arm
  S_(b, 1, 1, 'p_cloth'); b.T(0, 0, 0, 0, 0, 0, 1, 1, .8); b.ell(-.1, J.sh - .1, .0, .12, .14, .16, { seg: sg(q, 9), ring: sg(q, 6) }); b.pop();
  S_(b, 1, 2, 'p_cloth'); b.tube([[.19, J.sh + .02, -.04], [.04, J.sh - .14, .14], [-.15, J.waist + .05, .13], [-.19, J.waist, -.02], [-.03, J.sh - .2, -.15], [.19, J.sh + .02, -.04]], { r: .04, seg: sg(q, 5), steps: q ? 2 : 1 });
  if (q) { S_(b, 0, 3, 'bronze', [.9, .8, .6]); b.ell(.12, J.sh - .15, .14, .02, .02, .01, { seg: 5, ring: 3 }); }
}
// ---------- animals: anatomy builder (faces +Z; z0 shifts the animal forward, used by the ox cart) ----------
// bones: 0 body 1 neck 2 head 3/4 FL upper/lower 5/6 FR 7/8 BL 9/10 BR 11 tail 12 wheel 13 rider 14 load 15 rider arms
const AN = {
  horse: { by: .99, ry: .32, rx: .26, L: .62, fy: .66, legF: .052, legH: .058, hoof: .064, knee: .38, hock: .48, fet: .13,
    neck: [[.68, 1.16], [.92, 1.44], [1.04, 1.64]], neckR: [.2, .15, .11], neckW: .62, head: { len: .56, w: .2, d: .26, ang: 1.05, ears: .13, jowl: 1 }, mane: 'cropped', tail: 'knot', coat: 'p_coat' },
  donkey: { by: .78, ry: .23, rx: .19, L: .47, fy: .52, legF: .04, legH: .045, hoof: .042, knee: .3, hock: .37, fet: .1,
    neck: [[.5, .9], [.66, 1.08], [.74, 1.18]], neckR: [.15, .12, .09], neckW: .65, head: { len: .44, w: .17, d: .22, ang: 1.15, ears: .2, jowl: 1 }, mane: 'upright', tail: 'tuft', stripe: 1, coat: 'p_coat' },
  camel: { by: 1.42, ry: .36, rx: .3, L: .7, fy: 1.04, legF: .046, legH: .05, hoof: .12, knee: .6, hock: .72, fet: .16, pad: 1,
    neck: [[.78, 1.5], [1.08, 1.22], [1.34, 1.36], [1.46, 1.74]], neckR: [.2, .12, .1, .085], neckW: .7, head: { len: .42, w: .16, d: .19, ang: .35, ears: .06, camel: 1 }, humps: 1, tail: 'tuft', shaggy: 1, coat: 'p_felt' },
  ox: { by: .92, ry: .34, rx: .3, L: .66, fy: .56, legF: .07, legH: .075, hoof: .07, knee: .33, hock: .42, fet: .1, cloven: 1,
    neck: [[.72, 1.02], [.92, 1.02], [1.02, .98]], neckR: [.25, .22, .17], neckW: .8, head: { len: .44, w: .26, d: .26, ang: 1.25, ears: .08, ox: 1 }, hump: 1, dewlap: 1, horns: 1, tail: 'tuft', coat: 'p_coat' },
  dog: { by: .44, ry: .14, rx: .1, L: .3, fy: .32, legF: .026, legH: .028, hoof: .03, knee: .16, hock: .2, fet: .05, paw: 1, tuck: 1,
    neck: [[.3, .52], [.38, .6], [.42, .66]], neckR: [.085, .07, .06], neckW: .8, head: { len: .24, w: .12, d: .12, ang: .45, ears: .07, dog: 1 }, tail: 'curl', coat: 'p_coat' },
};
function QUAD(b, q, o) {
  const A = AN[o.kind], z0 = o.z0 || 0, L = A.L, by = A.by, ry = A.ry, rx = A.rx, coat = A.coat, piv = []; for (let i = 0; i < 16; i++) piv.push([0, 0, 0]); piv[0] = [0, by, z0];
  const K = o.kind, X = rx / ry, seg = sg(q, 14);
  // body: a lofted barrel from croup to chest (flattened sideways), haunches, shoulders, withers, belly
  S_(b, 0, 1, coat); b.T(0, 0, z0, 0, 0, 0, X, 1, 1);
  const zs = [-L * .86, -L * .62, -L * .2, L * .3, L * .66, L * .9], ys = [by + ry * .05, by + ry * .1, by - (A.tuck ? ry * .1 : 0), by + (A.tuck ? .02 : 0), by + ry * .08, by + ry * .02], rs = [ry * .8, ry * .96, ry * (A.tuck ? .78 : .99), ry, ry * .98, ry * .82];
  const bodyV0 = b.nv; b.tube(zs.map((z, k) => [0, ys[k], z]), { r: rs, seg, steps: q ? 3 : 1 }); b.pop(); const bodyV1 = b.nv;
  if (q) { S_(b, 0, 1, coat); for (const sd of [-1, 1]) { b.ell(sd * rx * .55, by - ry * .05, z0 - L * .55, rx * .5, ry * .78, L * .34, { seg: 10, ring: 7 }); // haunch
      b.ell(sd * rx * .58, by - ry * .02, z0 + L * .6, rx * .45, ry * .72, L * .26, { seg: 10, ring: 7 }); } // shoulder
    if (!A.humps && !A.hump) b.ell(0, by + ry * .78, z0 + L * .52, rx * .4, ry * .32, L * .28, { seg: 8, ring: 5 }); } // withers
  if (A.hump) { S_(b, 0, 1, coat); b.ell(0, by + ry * .8, z0 + L * .55, rx * .62, ry * .55, L * .34, { seg: sg(q, 10), ring: sg(q, 7) }); }
  if (A.humps) { S_(b, 0, 1, coat); for (const hz of [.42, -.32]) { b.ell(0, by + ry * .95, z0 + L * hz, rx * .62, ry * .75, L * .26, { seg: sg(q, 10), ring: sg(q, 7) });
      if (q) { S_(b, 0, 2, 'p_hair'); b.ell(0, by + ry * 1.55, z0 + L * hz, rx * .42, ry * .2, L * .17, { seg: 8, ring: 5, disp: lumpy(.25, 9, 2) }); S_(b, 0, 1, coat); } } }
  if (A.stripe) { const C = b.C, V = b.P; for (let v = bodyV0; v < bodyV1; v++) { const x = V[v * 3], y = V[v * 3 + 1]; if (Math.abs(x) < rx * .2 && y > by + ry * .82) { C[v * 4] *= .5; C[v * 4 + 1] *= .48; C[v * 4 + 2] *= .46; } } } // dorsal stripe as a colour band
  if (A.dewlap) { S_(b, 0, 1, coat); b.T(0, 0, 0, 0, 0, 0, .35, 1, 1); b.ell(0, by - ry * .55, z0 + L * .95, rx, ry * .55, L * .3, { seg: sg(q, 8), ring: sg(q, 6) }); b.pop(); }
  // tail (bone 11, pivot at the root)
  const tz = z0 - L * .86 - ry * .55, ty = by + ry * .42; piv[11] = [0, ty, tz];
  if (A.tail === 'knot') { S_(b, 11, 1, coat); b.tube([[0, ty + .02, tz + .04], [0, ty - .06, tz - .07], [0, ty - .2, tz - .1]], { r: [.045, .04, .035], seg: sg(q, 6), steps: 1 });
    S_(b, 11, 0, 'p_hair', [.2, .17, .15]); b.ell(0, ty - .25, tz - .1, .06, .07, .06, { seg: sg(q, 7), ring: 5 }); b.tube([[0, ty - .28, tz - .1], [0, ty - .45, tz - .08]], { r: [.04, .02], seg: sg(q, 5), steps: 1 }); } // 結尾: knotted tail
  else if (A.tail === 'curl') { S_(b, 11, 1, coat); b.tube([[0, ty, tz + .02], [0, ty + .1, tz - .06], [0, ty + .17, tz - .02], [0, ty + .15, tz + .07]], { r: [.03, .035, .03, .015], seg: sg(q, 6), steps: q ? 2 : 1 }); }
  else { S_(b, 11, 1, coat); const tl = K === 'camel' ? .45 : K === 'ox' ? .7 : .45; b.tube([[0, ty + .02, tz + .03], [0, ty - .1, tz - .06], [0, ty - tl, tz - .05]], { r: [.035, .022, .016], seg: sg(q, 5), steps: q ? 2 : 1 });
    S_(b, 11, 0, 'p_hair', [.22, .19, .17]); if (q) b.ell(0, ty - tl - .03, tz - .05, .035, .08, .035, { seg: 5, ring: 4 }); }
  // legs: front = forearm (upper) | knee, cannon, fetlock, pastern, hoof (lower); hind = gaskin (upper) | hock, cannon, fetlock, pastern, hoof (lower)
  const lx = rx * .62, fz = z0 + L * .62, hz = z0 - L * .6, eY = by - ry * .62, sY = by - ry * .35;
  for (const [U, sd, front] of [[3, 1, 1], [5, -1, 1], [7, 1, 0], [9, -1, 0]]) {
    const x = sd * lx, R0 = front ? A.legF : A.legH, kY = front ? A.knee : A.hock, fY = A.fet, zt = front ? fz : hz;
    if (front) {
      piv[U] = [x, eY, zt]; piv[U + 1] = [x, kY, zt + .015];
      S_(b, U, 1, coat); if (q) b.ell(x * 1.02, eY - .02, zt, R0 * 2, (eY - kY) * .42, R0 * 2.1, { seg: sg(q, 8), ring: sg(q, 6) }); // forearm muscle
      b.tube([[x, eY + .04, zt], [x, (eY + kY) / 2, zt + .005], [x, kY + .03, zt + .015]], { r: [R0 * 2.2, R0 * 1.5, R0 * 1.0], seg: sg(q, 8), steps: 1, cap: [false, false] });
    } else {
      piv[U] = [x, sY, zt]; const hkz = zt - (by - kY) * .22; piv[U + 1] = [x, kY, hkz];
      S_(b, U, 1, coat); b.tube([[x * .95, sY + .02, zt + .06], [x, (sY + kY) / 2, zt - (sY - kY) * .1], [x, kY + .03, hkz + .01]], { r: [R0 * 2.6, R0 * 1.6, R0 * 1.15], seg: sg(q, 8), steps: q ? 2 : 1, cap: [false, false] }); // gaskin
    }
    const lz = front ? zt + .015 : zt - (by - kY) * .22; S_(b, U + 1, 1, coat);
    if (q) b.ell(x, kY, lz - (front ? 0 : .02), R0 * 1.02, R0 * 1.9, R0 * (front ? 1.08 : 1.45), { seg: sg(q, 7), ring: 5 }); // knee / hock
    b.tube([[x, kY, lz], [x, A.paw ? .03 : A.pad ? fY * .7 : q ? fY + .04 : .07, lz + .005]], { r: [R0 * .92, R0 * .78], seg: sg(q, 7), steps: 1, cap: [false, false] }); // cannon
    if (A.pad) { b.ell(x, fY * .5, lz + .04, A.hoof * .8, fY * .55, A.hoof * 1.05, { seg: sg(q, 8), ring: 5 }); S_(b, U + 1, 1, coat); b.ell(x, .05, lz + .06, A.hoof * .85, .055, A.hoof * 1.15, { seg: sg(q, 9), ring: 5 }); continue; } // camel: big padded two-toed foot
    if (A.paw) { b.ell(x, .022, lz + .025, R0 * .95, .024, R0 * 1.5, { seg: 6, ring: 4 }); continue; }
    if (q) b.ell(x, fY, lz + .01, R0 * .92, R0 * 1.4, R0 * 1.12, { seg: sg(q, 7), ring: 5 }); // fetlock
    if (q) b.tube([[x, fY, lz + .015], [x, .075, lz + .055]], { r: [R0 * .85, R0 * .85], seg: sg(q, 6), steps: 1, cap: [false, false] }); // pastern (sloped forward)
    S_(b, U + 1, 0, 'p_hide', K === 'ox' ? [.22, .2, .19] : [.2, .18, .16]); const H = A.hoof;
    b.T(x, 0, lz + .065, -.2, 0, 0); if (A.cloven) { for (const s2 of [-1, 1]) b.T(s2 * H * .42, 0, 0).lathe([[0, 0], [H * .55, 0], [H * .5, .06], [0, .07]], { seg: sg(q, 6) }).pop(); }
    else b.lathe([[0, 0], [H * 1.0, 0], [H * .95, .045], [H * .78, .085], [0, .086]], { seg: sg(q, 8) }); b.pop();
  }
  // neck (bone 1) and head (bone 2)
  const NK = A.neck, nb = NK[0], np = NK[NK.length - 1]; piv[1] = [0, nb[1] - .05, z0 + nb[0] - .1]; piv[2] = [0, np[1], z0 + np[0]];
  S_(b, 1, 1, coat); b.T(0, 0, 0, 0, 0, 0, A.neckW, 1, 1); b.tube([[0, nb[1] - ry * .45, z0 + nb[0] - .14], ...NK.map(p => [0, p[1], z0 + p[0]])], { r: [A.neckR[0] * 1.2, ...A.neckR], seg: sg(q, 10), steps: q ? 3 : 1 }); b.pop();
  if (A.shaggy && q) { S_(b, 1, 2, 'p_hair'); b.T(0, 0, 0, 0, 0, 0, .7, 1, 1); b.tube([[0, NK[0][1] - .12, z0 + NK[0][0] + .02], [0, NK[1][1] - .1, z0 + NK[1][0]], [0, NK[2][1] - .07, z0 + NK[2][0] + .02]], { r: [.12, .1, .07], seg: 7, steps: 2, disp: (t, a) => Math.sin(a * 7 + t * 20) * .015 }); b.pop(); } // camel's beard of hair
  if (A.mane === 'cropped') { S_(b, 1, 0, 'p_hair', [.18, .15, .13]); b.T(0, 0, 0, 0, 0, 0, .35, 1, 1); b.tube(NK.map((p, k) => [0, p[1] + A.neckR[k] * .9, z0 + p[0] - A.neckR[k] * .45]), { r: .045, seg: sg(q, 5), steps: q ? 2 : 1 }); b.pop();
    if (q) for (let k = 0; k < 3; k++) { const t = .3 + k * .22, P = [lerp(NK[0][0], np[0], t), lerp(NK[0][1], np[1], t)]; b.T(0, P[1] + .1, z0 + P[0] - .07, -.5, 0, 0).ell(0, 0, 0, .025, .05, .035, { seg: 5, ring: 4 }).pop(); } } // 三花 trimmed tufts
  if (A.mane === 'upright') { S_(b, 1, 0, 'p_hair', [.22, .19, .17]); b.T(0, 0, 0, 0, 0, 0, .3, 1, 1); b.tube(NK.map((p, k) => [0, p[1] + A.neckR[k] * .95, z0 + p[0] - A.neckR[k] * .4]), { r: .05, seg: sg(q, 5), steps: q ? 2 : 1 }); b.pop(); }
  const Hd = A.head, hx = 0, hy = np[1], hzz = z0 + np[0]; let my = 0, mz = 0;
  b.T(0, hy, hzz, Hd.ang, 0, 0); { const w = Hd.w, d = Hd.d, l = Hd.len; S_(b, 2, 1, coat);
    b.ell(0, 0, .02, w * .48, d * .45, .1, { seg: sg(q, 10), ring: sg(q, 7) }); // poll / cranium
    if (Hd.jowl && q) b.ell(0, -d * .32, .1, w * .5, d * .42, .13, { seg: sg(q, 10), ring: sg(q, 6) }); // cheek / jowl
    b.T(0, 0, 0, 0, 0, 0, w / d, 1, 1); b.tube([[0, -d * .05, .05], [0, -d * .1, l * .5], [0, -d * .12, l - .07]], { r: [d * .42, d * .34, d * (Hd.ox ? .4 : .3)], seg: sg(q, 9), steps: q ? 2 : 1, cap: [false, false] }); b.pop(); // face
    S_(b, 2, Hd.camel || Hd.dog ? 1 : 0, Hd.camel || Hd.dog ? coat : 'p_hide', K === 'horse' ? [.3, .24, .2] : K === 'donkey' ? [.8, .78, .74] : K === 'ox' ? [.36, .3, .28] : undefined);
    b.ell(0, -d * .14, l - .06, w * (Hd.ox ? .5 : .42), d * .34, Hd.ox ? .09 : .085, { seg: sg(q, 9), ring: sg(q, 6) }); // muzzle
    if (q) { b.ell(0, -d * .4, l - .1, w * .32, d * .12, .07, { seg: 7, ring: 4 }); // lower lip / chin
      S_(b, 2, 0, 'white', [.07, .06, .06]); for (const sd of [-1, 1]) b.ell(sd * w * .24, -d * .05, l - .015, .014, .018, .01, { seg: 5, ring: 3 }); // nostrils
      S_(b, 2, 1, coat); for (const sd of [-1, 1]) b.ell(sd * w * .44, d * .16, .12, .025, .02, .035, { seg: 5, ring: 3 }); // brow ridge
      S_(b, 2, 0, 'p_eye_a', [1, 1, 1]); for (const sd of [-1, 1]) b.ell(sd * w * .47, d * .08, .135, .014, .017, .02, { seg: 6, ring: 4 }); } // eyes in their sockets
    if (Hd.dog) { S_(b, 2, 0, 'white', [.06, .05, .05]); b.ell(0, -d * .02, l + .005, .018, .014, .014, { seg: 5, ring: 3 }); }
    // ears (pricked; donkey: long)
    S_(b, 2, 1, coat); const longE = Hd.ears > .15; for (const sd of [-1, 1]) { b.T(sd * w * (longE ? .46 : K === 'horse' ? .27 : .3), d * (K === 'horse' ? .3 : .38), longE ? -.02 : 0, -.35 + (Hd.ox ? 1.2 : 0) - (longE ? .2 : 0), 0, sd * (Hd.ox ? 1.1 : longE ? .55 : .25)); /* donkey: long ears set apart, splayed and tipped back (they stood together like one) */ b.T(0, 0, 0, 0, 0, 0, 1, 1, .5).lathe([[0, 0], [Hd.ears * .28, 0], [Hd.ears * .3, Hd.ears * .35], [Hd.ears * .12, Hd.ears * .85], [0, Hd.ears]], { seg: sg(q, 6) }).pop(); b.pop(); }
    if (K === 'horse' && q) { S_(b, 2, 0, 'p_hair', [.18, .15, .13]); b.ell(0, d * .42, .1, .04, .03, .06, { seg: 5, ring: 4 }); } // forelock
    if (A.horns) { S_(b, 2, 0, 'bone', [.82, .76, .66]); for (const sd of [-1, 1]) b.tube([[sd * w * .35, d * .42, .02], [sd * w * .9, d * .5, -.04], [sd * w * 1.25, d * .85, .02], [sd * w * 1.15, d * 1.15, .1]], { r: [.035, .026, .016, .005], seg: sg(q, 5), steps: q ? 2 : 1 }); }
    if (K === 'horse' || K === 'donkey' && o.rider) { S_(b, 2, 0, 'p_hide', [.28, .16, .1]); for (const sd of [-1, 1]) b.tube([[sd * w * .5, d * .12, .0], [sd * w * .52, -d * .2, .12], [sd * w * .42, -d * .2, l - .1]], { r: .008, seg: 3, steps: 2 }); b.tube([[-w * .5, d * .12, 0], [-w * .38, d * .42, -.01], [0, d * .55, -.02], [w * .38, d * .42, -.01], [w * .5, d * .12, 0]], { r: .008, seg: 3, steps: 2 }); // bridle cheek pieces + noseband, joined by the crownpiece over the poll behind the ears (their loose tops stuck out)
      b.T(0, -d * .18, l - .14, 0, 0, 0, w / d * 1.1, 1, 1).lathe([[d * .36, -.01], [d * .37, 0], [d * .37, .015], [d * .36, .02]], { seg: sg(q, 10) }).pop(); }
    my = hy - Math.sin(Hd.ang) * l; mz = hzz + Math.cos(Hd.ang) * l; }
  b.pop();
  // saddle with blanket and mudguards (障泥), breast strap and crupper; packs; rider
  const topY = by + ry, sz = z0 + L * .12;
  if (o.load === 'saddle' || o.rider) TACK(o.load === 'saddle' ? 0 : 13);
  function TACK(TB) { S_(b, TB, 2, 'p_cloth'); for (const sd of [-1, 1]) { b.T(sd * (rx * .9 + .03), (by + topY) / 2 - .02, sz + .02, 0, 0, sd * .18); b.box(0, 0, 0, .012, ry * .95, .5); b.pop(); } // 障泥 mudguards under the saddle
    S_(b, TB, 0, 'lacquer_black', [1, .8, .7]); b.T(0, topY + .03, sz).ell(0, 0, 0, rx * .75, .05, .26, { seg: sg(q, 10), ring: 5 }).pop(); for (const dz of [.24, -.24]) b.T(0, topY + .07, sz + dz, dz > 0 ? -.3 : .3, 0, 0).ell(0, 0, 0, rx * .6, .07, .035, { seg: sg(q, 8), ring: 4 }).pop(); // seat, pommel, cantle
    S_(b, TB, 0, 'p_hide', [.3, .2, .14]); b.T(0, by, sz + .05, PI / 2, 0, 0, (rx + .014) / (ry + .014), 1, 1).lathe([[ry + .01, -.03], [ry + .016, 0], [ry + .01, .03]], { seg: sg(q, 12) }).pop(); // girth round the barrel
    if (q) { S_(b, TB, 0, 'p_hide', [.3, .18, .12]); b.tube([[rx * .95, by + ry * .2, sz + .25], [rx * .6, by - ry * .1, z0 + L + .02], [0, by - ry * .05, z0 + L + .08], [-rx * .6, by - ry * .1, z0 + L + .02], [-rx * .95, by + ry * .2, sz + .25]], { r: .012, seg: 3, steps: 2 }); // breast strap
      b.tube([[0, topY + .02, sz - .27], [0, topY + .02, z0 - L * .6], [0, ty + .04, tz + .02]], { r: .012, seg: 3, steps: 2 }); S_(b, TB, 0, 'gold', [1, 1, 1]); for (let k = 0; k < 4; k++) b.ell(rx * (.85 - k * .08) * (k % 2 ? -1 : 1) * 0 + 0, topY - .02 - k * .0, z0 - L * (.15 + k * .17), .025, .04, .01, { seg: 5, ring: 3 }); } } // crupper with 杏葉 pendants
  if (o.load === 'packs' || o.load === 'bales') { const big = o.load === 'bales' ? 1.5 : 1, py = A.humps ? topY + .1 : topY;
    S_(b, 14, 2, 'burlap', [1.1, 1.05, 1]); for (const sd of [-1, 1]) b.ell(sd * (rx + .1 * big), py - .2 * big, z0 + (A.humps ? .05 : -.05), .1 * big, .17 * big, .24 * big, { seg: sg(q, 9), ring: 6 });
    S_(b, 14, 3, 'p_cloth'); b.T(0, py + .02, z0 + (A.humps ? .05 : -.05), 0, 0, PI / 2).cyl(0, -rx - .15 * big, 0, .07 * big, rx + .15 * big, { seg: sg(q, 8) }).pop(); // rolled carpet across
    S_(b, 14, 0, 'wood', [.8, .7, .55]); if (q) for (const dz of [.2, -.25]) b.T(0, py - .02, z0 + dz * big).box(0, 0, 0, rx * 2 + .1, .04, .04).pop(); }
  if (o.rider) { // seated rider (bone 13; arms bone 15) — robe slot 3, skin slot 4; stirrups. kinds: 'official' (袍, stiff 幞頭), 'labourer' (short coat, trousers, head cloth), 'woman' (胡服 coat over a skirt, high bun)
    const rk = o.rider === true ? 'official' : o.rider;
    const ry2 = topY + .07, rz = sz, wd = rx + .05; piv[13] = [0, ry2, rz]; piv[15] = [0, ry2 + .45, rz];
    S_(b, 13, 3, 'p_cloth'); if (q) b.ell(0, ry2 + .05, rz + .03, .16, .075, .12, { seg: sg(q, 10), ring: 6 });
    if (rk !== 'labourer') for (const sd of [-1, 1]) { // the 袍 skirts drape over the saddle and hang down the barrel to mid-shin (slit at the sides, 缺胯袍); double-sided cloth panels
      const nr = q ? 3 : 1, nc = q ? 5 : 2, pan = (i, j) => { const t = i / nr, u = j / nc, zz = rz - .2 + u * .52, x = t < .5 ? lerp(.12, wd + .015, t * 2) : wd + .015 + (t - .5) * .05, y = t < .5 ? lerp(ry2 + .1, ry2 - .02, t * 2) : lerp(ry2 - .02, rk === 'woman' ? ry2 - .4 : ry2 - .3, (t - .5) * 2);
        return [sd * (x + (t > .4 ? Math.sin(zz * 38 + sd) * .009 * t : 0)), y, zz, u, t]; };
      S_(b, 13, 3, 'p_cloth'); b.grid(nr, nc, pan, false, null, sd > 0); b.grid(nr, nc, pan, false, null, sd < 0); }
    for (const sd of [-1, 1]) { S_(b, 13, 0, rk === 'labourer' ? 'p_trousers' : 'p_cloth', rk === 'labourer' ? [.62, .56, .46] : [.3, .28, .27]); b.tube([[sd * .1, ry2 + .06, rz + .06], [sd * wd, ry2 - .03, rz + .2], [sd * (wd + .01), ry2 - .4, rz + .1]], { r: [.08, .065, .05], seg: sg(q, 7), steps: q ? 2 : 1 });
      S_(b, 13, 0, 'p_hide', [.1, .09, .09]); if (q) b.ell(sd * (wd + .01), ry2 - .46, rz + .15, .045, .045, .1, { seg: 6, ring: 4 }); S_(b, 13, 0, 'iron', [1, 1, 1]); if (q) b.T(sd * (wd + .01), ry2 - .5, rz + .14, 0, 0, PI / 2).lathe([[.035, -.006], [.04, 0], [.035, .006]], { seg: 6 }).pop(); }
    S_(b, 13, 3, rk === 'labourer' ? 'p_hemp' : 'p_silk'); b.T(0, 0, rz + .02, 0, 0, 0, rk === 'woman' ? .9 : 1, 1, .72); b.lathe([[0, ry2 + .04], [.14, ry2 + .06], [.16, ry2 + .28], [.15, ry2 + .4], [.118, ry2 + .47], [.068, ry2 + .512], [0, ry2 + .53]], { seg: sg(q, 12) }); b.pop();
    S_(b, 13, 4, 'p_skin'); b.tube([[0, ry2 + .48, rz], [0, ry2 + .6, rz + .01]], { r: .05, seg: 6, steps: 1, cap: false });
    S_(b, 13, 4, rk === 'woman' ? 'p_face_f' : 'p_face_m'); HEADM(b, 0, ry2 + .662, rz + .012, .085, .116, .097, rk === 'woman' ? 1 : 0, sg(q, 12), sg(q, 10)); S_(b, 13, 4, 'p_skin'); if (false) b.ell(0, ry2 + .605, rz + .035, .06, .045, .064, { seg: sg(q, 8), ring: 5 });
    if (rk === 'official') {
    S_(b, 13, 0, 'p_lacq_gauze', CAPC); b.ell(0, ry2 + .7, rz - .005, .092, .087, .104, { seg: sg(q, 11), ring: 6 }); if (q) b.T(0, ry2 + .78, rz + .01, .3, 0, 0).ell(0, 0, 0, .062, .068, .066, { seg: sg(q, 8), ring: 5 }).pop();
    if (q) for (const sd of [-1, 1]) b.tube([[sd * .02, ry2 + .74, rz - .1], [sd * .1, ry2 + .73, rz - .14], [sd * .19, ry2 + .66, rz - .13]], { r: [.012, .011, .009], seg: 4, steps: q ? 2 : 1 });
    } else if (rk === 'labourer') { S_(b, 13, 3, 'p_hemp'); b.ell(0, ry2 + .695, rz - .006, .095, .088, .106, { seg: sg(q, 11), ring: 6 }); b.ell(0, ry2 + .79, rz - .03, .05, .045, .05, { seg: sg(q, 8), ring: 5 }); } // head cloth over the topknot
    else { S_(b, 13, 0, 'p_hair', HAIRK); b.ell(0, ry2 + .69, rz - .012, .093, .1, .104, { seg: sg(q, 11), ring: 6 }); b.T(0, ry2 + .82, rz - .03, -.2, 0, 0).ell(0, 0, 0, .06, .08, .055, { seg: sg(q, 9), ring: 6 }).pop(); } // high bun
    for (const sd of [-1, 1]) { // shoulder + arm as ONE surface (as SHOULDER for walkers): from the side of the neck over the sloping shoulder to the elbow, then the forearm to the reins
      const slt = rk === 'labourer' ? 'p_sleeve_hemp' : 'p_sleeve_silk', v0 = b.nv; S_(b, 15, 3, slt);
      b.tube([[sd * .045, ry2 + .53, rz - .005], [sd * .11, ry2 + .505, rz], [sd * .165, ry2 + .44, rz + .005], [sd * .19, ry2 + .35, rz + .035], [sd * .205, ry2 + .27, rz + .075]], { r: [.03, .05, .056, .053, .048], seg: sg(q, 9), steps: q ? 3 : 1, cap: [true, false] });
      for (let i = v0; i < b.nv; i++) { const wc = sst(ry2 + .38, ry2 + .5, b.P[i * 3 + 1]); if (wc > .002) { b.B[i * 2 + 1] = 13; b.W[i * 4] = 1 - wc; b.W[i * 4 + 1] = wc; } } // torso ↔ arm blend
      b.tube([[sd * .205, ry2 + .285, rz + .065], [sd * .17, ry2 + .235, rz + .2], [sd * .09, ry2 + .22, rz + .3]], { r: [.048, .045, .042], seg: sg(q, 8), steps: q ? 2 : 1, cap: [false, true] });
      S_(b, 15, 4, 'p_skin'); if (q) b.ell(sd * .07, ry2 + .21, rz + .35, .028, .04, .035, { seg: 5, ring: 4 }); }
    if (q) { S_(b, 15, 0, 'p_hide', [.3, .18, .12]); b.tube([[.07, ry2 + .21, rz + .36], [0, my + .06, mz - .2], [-.07, ry2 + .21, rz + .36]], { r: .006, seg: 3, steps: 2 }); } // reins
  }
  if (K === 'horse' && q) { // the player's reins (slot 5: shown only with flag 4 — the mount under the player's camera): from the corners of the mouth, round
    // the sides of the neck with a little sag, to the hands just in front of the saddle under the camera; skinned head (bit) → neck → body (hands)
    const hy3 = 1.6, hz3 = .45, v0 = b.nv, nk = A.neck, nm = nk[Math.floor(nk.length / 2)], nr = (A.neckR[1] || .15) * (A.neckW || .7) + .05; S_(b, 2, 5, 'p_hide', [.26, .16, .1]);
    for (const sd of [-1, 1]) b.tube([[sd * .07, my + .03, mz - .07], [sd * (nr + .02), nm[1] - .05, nm[0] + .12], [sd * (nr + .03), (nm[1] + hy3) / 2 - .1, (nm[0] + hz3) / 2], [sd * .1, hy3, hz3]], { r: .007, seg: 3, steps: 4 });
    b.tube([[-.1, hy3, hz3], [0, hy3 - .03, hz3 + .02], [.1, hy3, hz3]], { r: .009, seg: 3, steps: 2 }); // the bight held in the hands
    const hzH = piv[2][2] - .1, hzN = piv[1][2]; for (let k = v0; k < b.nv; k++) { const z = b.P[k * 3 + 2], i2 = k * 2, i4 = k * 4;
      if (z >= hzH) { b.B[i2] = 2 | (5 << 5); b.B[i2 + 1] = 2; b.W[i4] = 1; b.W[i4 + 1] = 0; }
      else if (z >= hzN) { const t = (hzH - z) / (hzH - hzN); b.B[i2] = 2 | (5 << 5); b.B[i2 + 1] = 1; b.W[i4] = 1 - t; b.W[i4 + 1] = t; }
      else { const t = clamp((hzN - z) / (hzN - hz3), 0, 1); b.B[i2] = 1 | (5 << 5); b.B[i2 + 1] = 0; b.W[i4] = 1 - t; b.W[i4 + 1] = t; } } }
  if (o.lead) { // lead rope from the halter to the handler's right hand (handler = follower at local (side, fwd))
    const [hx2, hz2] = o.lead, hand = [hx2 - .2, .86, hz2 + .05]; S_(b, 14, 0, 'rope', [.55, .45, .32]);
    b.tube([[0, my + .02, mz - .04], [(hand[0]) * .5, Math.min(my, hand[1]) - .12, (mz + hand[2]) / 2], hand], { r: .008, seg: 3, steps: q ? 3 : 1 }); }
  if (o.cart) { // 犢車: yoke on the neck in front of the hump, shafts, cart with an arched cloth roof (slot 3); wheels on bone 12
    const cz = -1.2, ax = .78;
    S_(b, 0, 2, 'wood', [.9, .8, .7]); for (const sd of [-1, 1]) b.tube([[sd * .42, by + ry * .2, z0 + L * .75], [sd * .45, .95, cz + .2], [sd * .45, .88, cz - .75]], { r: .032, seg: 5, steps: 1 });
    b.tube([[-.5, by + ry * .95, z0 + L * .85], [0, by + ry * 1.25, z0 + L * .88], [.5, by + ry * .95, z0 + L * .85]], { r: .035, seg: 5, steps: 2 });
    S_(b, 0, 2, 'wood', [.8, .7, .6]); b.T(0, .97, cz).box(0, 0, 0, 1.0, .08, 1.5).pop(); for (const sd of [-1, 1]) b.T(sd * .5, 1.22, cz).box(0, 0, 0, .04, .5, 1.5).pop();
    S_(b, 0, 3, 'p_cloth'); b.T(0, 1.44, cz, PI / 2, 0, 0); b.lathe([[0, -.8], [.57, -.8], [.57, -.77], [.57, .77], [.57, .8], [0, .8]], { seg: sg(q, 12), a0: PI, a1: TAU }); b.pop();
    S_(b, 0, 0, 'p_cloth', [.4, .3, .25]); b.T(0, 1.22, cz + .76).box(0, 0, 0, .9, .5, .03).pop();
    S_(b, 12, 2, 'wood', [.7, .6, .5]); piv[12] = [0, ax, cz];
    for (const sd of [-1, 1]) { b.T(sd * .62, ax, cz, 0, 0, PI / 2); b.lathe([[ax - .07, -.045], [ax, -.045], [ax, .045], [ax - .07, .045], [ax - .07, -.045]], { seg: sg(q, 16) }); b.cyl(0, -.09, 0, .1, .09, { seg: 6 }); b.pop();
      for (let k = 0; k < (q ? 8 : 4); k++) { const a = k * PI / (q ? 8 : 4); b.T(sd * .62, ax, cz, a, 0, 0).box(0, 0, 0, .035, ax * 2 - .12, .035).pop(); } }
  }
  // joint blending: neck base into the body, neck top into the head; leg tops into the body; knee/hock between the leg bones
  const n = b.nv, B = b.B, Wt = b.W, V = b.P, nz0 = z0 + nb[0], nz1 = z0 + np[0];
  for (let i = 0; i < n; i++) { const bone = B[i * 2] & 31, y = V[i * 3 + 1], z = V[i * 3 + 2]; let b2 = bone, w = 0;
    if (bone === 1) { const t = clamp((z - nz0 + .12) / (nz1 - nz0 + .12), 0, 1); if (t < .35) { w = (1 - t / .35) * .7; b2 = 0; } else if (t > .82) { w = (t - .82) / .18 * .6; b2 = 2; } }
    else if ((bone === 3 || bone === 5 || bone === 7 || bone === 9) && y > piv[bone][1] - .12) { w = sst(piv[bone][1] - .12, piv[bone][1] + .1, y) * .75; b2 = 0; }
    else if ((bone === 4 || bone === 6 || bone === 8 || bone === 10) && y > piv[bone][1] - .02) { w = sst(piv[bone][1] - .02, piv[bone][1] + .08, y) * .5; b2 = bone - 1; }
    else if ((bone === 3 || bone === 5 || bone === 7 || bone === 9) && y < piv[bone + 1][1] + .07) { w = (1 - sst(piv[bone + 1][1] - .02, piv[bone + 1][1] + .07, y)) * .5; b2 = bone + 1; }
    else if (bone === 11 && y > ty - .06) { w = sst(ty - .06, ty + .04, y) * .5; b2 = 0; }
    if (w > .002) { B[i * 2 + 1] = b2; Wt[i * 4] = 1 - w; Wt[i * 4 + 1] = w; } }
  return piv;
}
function CHICKEN(b, q) { // bones: 0 body, 1 neck, 2 head, 3/4 left leg (upper/lower), 5/6 right leg, 11 tail
  const piv = []; for (let i = 0; i < 16; i++) piv.push([0, 0, 0]); const by = .24; piv[0] = [0, by, 0];
  S_(b, 0, 1, 'p_felt'); b.ell(0, by, 0, .085, .085, .13, { seg: sg(q, 10), ring: sg(q, 7), disp: q ? lumpy(.06, 12, 4) : undefined }); b.ell(0, by + .02, .07, .07, .08, .07, { seg: sg(q, 8), ring: 5 });
  for (const sd of [-1, 1]) b.ell(sd * .075, by + .01, -.01, .025, .06, .1, { seg: 6, ring: 4 }); // wings
  piv[11] = [0, by + .04, -.11]; S_(b, 11, 2, 'p_felt'); b.T(0, by + .1, -.15, -.6, 0, 0, .45, 1, 1).ell(0, 0, 0, .06, .1, .05, { seg: sg(q, 8), ring: 5 }).pop(); // tail feathers
  piv[1] = [0, by + .05, .09]; piv[2] = [0, by + .2, .14]; S_(b, 1, 1, 'p_felt'); b.tube([[0, by + .04, .08], [0, by + .14, .12], [0, by + .2, .14]], { r: [.05, .035, .03], seg: sg(q, 7), steps: 1 });
  S_(b, 2, 1, 'p_felt'); b.ell(0, by + .22, .15, .03, .032, .04, { seg: sg(q, 7), ring: 5 }); S_(b, 2, 0, 'white', [.85, .62, .2]); b.T(0, by + .215, .2, .3, 0, 0).lathe([[.008, 0], [0, .03]], { seg: 4 }).pop(); // beak
  S_(b, 2, 3, 'p_skin', [.9, .25, .2]); b.T(0, 0, 0, 0, 0, 0, .3, 1, 1).ell(0, by + .255, .15, .02, .02, .035, { seg: 6, ring: 4 }).pop(); b.ell(0, by + .18, .175, .008, .018, .008, { seg: 4, ring: 3 }); // comb, wattle
  if (q) { S_(b, 2, 0, 'white', [.05, .04, .04]); for (const sd of [-1, 1]) b.ell(sd * .027, by + .228, .165, .005, .005, .005, { seg: 4, ring: 3 }); }
  for (const [U, sd] of [[3, 1], [5, -1]]) { const x = sd * .04; piv[U] = [x, by - .05, .01]; piv[U + 1] = [x, .1, .0];
    S_(b, U, 1, 'p_felt'); b.ell(x, by - .06, .0, .03, .05, .035, { seg: 6, ring: 4 }); S_(b, U + 1, 0, 'white', [.8, .62, .3]); b.tube([[x, .11, 0], [x, .015, .01]], { r: .007, seg: 4, steps: 1 });
    for (const a of [-.5, 0, .5]) b.tube([[x, .012, .01], [x + Math.sin(a) * .04, .006, .01 + Math.cos(a) * .045]], { r: .004, seg: 3, steps: 1 }); b.tube([[x, .012, .01], [x, .01, -.025]], { r: .004, seg: 3, steps: 1 }); }
  return piv;
}
// ---- the court (palace engineer, engine/palace.js; PALACE.md §people): 815 dress after 舊唐書 輿服志 / 新唐書 車服志 and tomb murals.
// emperor: everyday 常服 — 赤黃袍 (forbidden to subjects), 折上巾 (stiff-footed 幞頭), 九環帶, 六合靴. eunuch (內侍): round-collared robe in the
// colour of his grade (green … purple for the great ones), soft 幞頭, beardless. palacelady (宮人): high bun, silk 襦裙, 披帛. nanzhuang:
// 宮人 in men's dress (幞頭, round-collared robe, boots — 舊唐書 45 「或有著丈夫衣服靴衫」). palaceguard: 千牛 / 金吾 guards with helmet, lamellar, spear.
Object.assign(ARCH_P, {
  emperor: H_({ fab: 'damask', garment: 'long', hat: 'futou_stiff', stiff: 1, sleeve: 'wide', shoes: 'boots', beltSlot: 3, beltCol: [.85, .7, .35], beard: 'goatee', items: [] }),
  eunuch: H_({ fab: 'silk', garment: 'long', hat: 'futou', sleeve: 'wide', shoes: 'boots', beltSlot: 3, beltCol: [.12, .11, .11], beard: null, face: 'p_face_m', robeW: 1.04, items: [] }),
  palacelady: H_({ lowNeck: 1, banbi: 1, f: 1, s: .95, fab: 'silk', garment: 'skirt', hat: 'bun', sleeve: 'wide', shoes: 'shoes', collar: false, shoeCol: [.6, .3, .26], items: ['fan'], extras: SHAWL }),
  nanzhuang: H_({ f: 1, s: .93, fab: 'silk', garment: 'long', hat: 'futou', sleeve: 'narrow', shoes: 'boots', beltSlot: 3, beltCol: [.12, .1, .1], beard: null, face: 'p_face_f', items: [] }),
  palaceguard: H_({ garment: 'knee', hat: 'helmet', sleeve: 'narrow', shoes: 'boots', beltSlot: 0, beltCol: [.14, .1, .08], beard: 'goatee', items: ['spear'], extras: (b, q, J) => {
    S_(b, 1, 2, 'p_lamellar', [1.2, 1.2, 1.2]); b.T(0, 0, 0, 0, 0, 0, 1, 1, .84); b.lathe([[.19, J.waist - .14], [.21, J.waist - .1], [.22, J.waist + .15], [.2, J.sh - .06], [.12, J.sh + .02], [0, J.sh + .03]], { seg: sg(q, 12) }); b.pop();
    if (q) for (const sd of [-1, 1]) { b.T(sd * (J.shX + .02), J.sh + .01, 0, 0, 0, -sd * .5).ell(0, 0, 0, .1, .045, .1, { seg: 7, ring: 4 }).pop(); }
    S_(b, 0, 0, 'lacquer_black', [1, 1, 1]); b.T(.22, J.waist - .2, .02, .45, 0, .12).box(0, 0, 0, .032, .72, .045).pop(); } }),
});
Object.assign(PAL, {
  emperor: [[[.8, .58, .22], [.76, .54, .2]], [PC.white], [[.88, .74, .38]], SKIN],
  eunuch: [[[.24, .42, .3], [.36, .52, .36], [.24, .42, .3], [.24, .34, .5], [.38, .5, .6], [.6, .2, .18], [.72, .3, .25], [.42, .27, .45]], [PC.white, PC.offwhite], [PC.black, [.24, .2, .17]], SKIN_F],
  palacelady: [[[.7, .2, .22], [.5, .3, .52], [.28, .4, .56], [.36, .5, .36], [.8, .62, .34], [.86, .7, .7], [.62, .22, .3]], [PC.white, [.84, .9, .8], [.92, .82, .82], [.86, .86, .94]], [[.92, .88, .62], [.76, .88, .76], [.94, .92, .86], [.92, .72, .72], [.72, .8, .92]], SKIN_F],
  nanzhuang: [[[.66, .22, .2], [.3, .46, .36], [.86, .84, .78], [.32, .36, .52], [.7, .5, .3]], [PC.white, [.86, .8, .7]], [PC.black], SKIN_F],
  palaceguard: [[[.7, .2, .17], [.66, .22, .18], [.74, .32, .2], [.72, .5, .26]], [[.62, .62, .66], [.56, .44, .28]], [[.8, .2, .16], [.76, .18, .15]], [[.82, .62, .48], [.76, .58, .44], [.86, .68, .54]]],
});
// body types: name → {lods: [near, far], piv, info}
const BODY_NAMES = ['man', 'labourer', 'porter', 'vendor', 'official', 'scholar', 'woman', 'veil', 'huji', 'musician', 'maid', 'child', 'girl', 'monk', 'nun', 'daoist', 'sogdian', 'persian', 'uyghur', 'guard', 'old', 'oldwoman', 'beggar', 'entertainer', 'donkey', 'horse', 'horsewoman', 'camel', 'oxcart', 'dog', 'chicken'];
const BODY_INFO = {
  man: { sp: [1.15, 1.4] }, labourer: { sp: [1.1, 1.35] }, porter: { sp: [1.0, 1.2], anim: 4 }, vendor: { sp: [1.05, 1.3] }, official: { sp: [1.0, 1.25] }, scholar: { sp: [1.05, 1.3] },
  woman: { sp: [1.0, 1.2] }, veil: { sp: [1.0, 1.15] }, huji: { sp: [1.0, 1.2] }, musician: { sp: [1.0, 1.15] }, maid: { sp: [1.05, 1.3] }, child: { sp: [.9, 1.15], r: .28 }, girl: { sp: [.9, 1.1], r: .28 },
  monk: { sp: [.8, .95] }, nun: { sp: [.8, .95] }, daoist: { sp: [.85, 1.05] }, sogdian: { sp: [1.1, 1.3] }, persian: { sp: [1.0, 1.2] }, uyghur: { sp: [1.1, 1.3] }, guard: { sp: [1.15, 1.25] },
  old: { sp: [.6, .78] }, oldwoman: { sp: [.6, .75] }, beggar: { sp: [.6, .85] }, entertainer: { sp: [1.1, 1.3] },
  donkey: { sp: [1.0, 1.25], quad: 1, r: .7, legL: .66 }, horse: { sp: [1.2, 1.5], quad: 1, r: .9, legL: 1.0 }, horsewoman: { sp: [1.2, 1.45], quad: 1, r: .9, legL: 1.0 }, camel: { sp: [1.0, 1.2], quad: 1, r: 1.0, legL: 1.15 }, oxcart: { sp: [.75, .9], quad: 1, r: 1.3, legL: .72 }, dog: { sp: [.9, 1.3], quad: 1, r: .35, legL: .35 }, chicken: { sp: [.3, .5], quad: 1, r: .15, legL: .19 },
};
BODY_NAMES.push('emperor', 'eunuch', 'palacelady', 'nanzhuang', 'palaceguard'); Object.assign(BODY_INFO, { emperor: { sp: [.9, 1.1] }, eunuch: { sp: [1.0, 1.2] }, palacelady: { sp: [.9, 1.1] }, nanzhuang: { sp: [1.05, 1.25] }, palaceguard: { sp: [1.1, 1.2] } }); // the court (palace.js)
const BODIES = []; // filled at CROWD.init (needs GL)
const B_RAD = new Float32Array(64), B_QUAD = new Uint8Array(64), B_LEG = new Float32Array(64); // up to 64 body types
function buildBodies() {
  if (BODIES.length) return BODIES;
  for (const name of BODY_NAMES) {
    const info = BODY_INFO[name], lods = [];
    for (const q of [1, 0]) { const b = new MB(); let piv;
      if (!q) { const t = b.tube.bind(b), e = b.ell.bind(b), l = b.lathe.bind(b); // far LOD: coarse segments, flat caps, no displacement
        b.tube = (pts, o = {}) => t(pts.length > 3 ? [pts[0], pts[pts.length >> 1], pts[pts.length - 1]] : pts, Object.assign({}, o, { r: Array.isArray(o.r) && pts.length > 3 ? [o.r[0], o.r[pts.length >> 1], o.r[pts.length - 1]] : o.r, capRows: 1, cap: Array.isArray(o.cap) && o.cap[1] ? o.cap : (o.seg || 8) >= 9 ? o.cap : false, seg: (o.seg || 8) >= 9 ? 5 : 3, steps: 1, disp: undefined }));
        b.ell = (cx, cy, cz, rx, ry, rz, o = {}) => { const m = Math.max(rx, ry, rz); if (m < .022) return b; return e(cx, cy, cz, rx, ry, rz, Object.assign({}, o, { seg: m < .07 ? 4 : 5, ring: m < .07 ? 2 : 3, disp: undefined })); };
        b.lathe = (p, o = {}) => l(p.length > 4 ? p.filter((v, k) => k === 0 || k === p.length - 1 || k % 2 === 1) : p, Object.assign({}, o, { seg: Math.min(o.seg || 16, 5) > 4 ? 5 : 4, disp: undefined })); } try { piv = ARCH_P[name](b, q); } catch (e) { console.error('people: build', name, e); piv = null; }
      if (!piv) { piv = []; for (let i = 0; i < 16; i++) piv.push([0, 0, 0]); }
      lods.push({ mesh: b.upload(), piv, tris: b.I.length / 3 }); }
    const k = BODIES.length; B_RAD[k] = info.r || .36; B_QUAD[k] = info.quad ? 1 : 0; B_LEG[k] = info.quad ? (lods[0].piv[3][1] || info.legL) : lods[0].piv[7][1] - lods[0].piv[9][1];
    BODIES.push({ name, id: k, info, pal: PAL[name], lods, batches: lods.map(l => R.crowdBatch(l.mesh, 1600, l.piv)) });
  }
  return BODIES;
}
const BID = {}; BODY_NAMES.forEach((n, i) => BID[n] = i);
const SHORTG = BODY_NAMES.map(n => ['huji', 'sogdian', 'uyghur', 'child', 'entertainer', 'labourer', 'porter', 'beggar', 'guard', 'palaceguard', 'vendor'].includes(n)); // jackets / knee coats / 胡 coats

// animation names (CROWD.placeStatic accepts these strings; with seated: true, drink/talk become their seated versions)
const ANIM_NAMES = { stand: 0, walk: 1, work: 2, hammer: 2, talk: 3, carry: 4, sit_ground: 5, sweep: 6, hoe: 6, run: 7, bow: 8, drink: 9, look: 10, haggle: 11, squat: 12, read: 13, head_load: 14, back_load: 15, sleeves: 16, wait: 16, hawk: 17, call: 17,
  sit: 18, cross: 18, kneel: 19, pipa: 20, play: 20, serve: 21, pour: 21, write: 22, sit_drink: 23, sit_talk: 24, sleep: 25, sleep_side: 25, sleep_back: 26, sew: 27, cook: 28, horse_stand: 40, horse_walk: 41, trot: 42, graze: 43 };
const ANIM_SEATED = { drink: 23, talk: 24, sit_drink: 23, sit_talk: 24, read: 22, stand: 18, sleeves: 18 };

// =====================================================================================
// CROWD — instanced population on a nav graph (WARD.nav format; any number of wards/avenues)
// =====================================================================================
const CROWD = (() => {
  const MAX = 2400, R_ACT = 135, R_DESP = 165, R_SET = 110, R_DRAW = 240, LOD_D = 24;
  const RW = 0, RSET = 1, RPAT = 2, RFOL = 3, RDISP = 4, RSTAT = 5; // roles: walker, set piece, patrol leader, follower, display (line-up), static (placeStatic: interiors)
  let mode = 'city', freeInit = false;
  function ensure() { if (!BODIES.length) buildBodies(); if (!freeInit) { alive.fill(0); nFree = 0; for (let i = MAX - 1; i >= 0; i--) free[nFree++] = i; S.agents = 0; freeInit = true; } }
  const SW = 0, SPAUSE = 1, SENTER = 2, SSTATIC = 3; // states
  const ty = new Uint8Array(MAX), alive = new Uint8Array(MAX), role = new Uint8Array(MAX), st = new Uint8Array(MAX), anim = new Uint8Array(MAX), anim0 = new Uint8Array(MAX), flags = new Uint8Array(MAX), home = new Uint8Array(MAX);
  const px = new Float32Array(MAX), pz = new Float32Array(MAX), gy = new Float32Array(MAX), yaw = new Float32Array(MAX), yawT = new Float32Array(MAX), spd = new Float32Array(MAX), sp0 = new Float32Array(MAX), vel = new Float32Array(MAX);
  const off = new Float32Array(MAX), offF = new Float32Array(MAX), es = new Float32Array(MAX), ph = new Float32Array(MAX), kA = new Float32Array(MAX), scl = new Float32Array(MAX), timer = new Float32Array(MAX), cd = new Float32Array(MAX);
  const hx = new Float32Array(MAX), hz = new Float32Array(MAX), tx = new Float32Array(MAX), tz = new Float32Array(MAX), fx = new Float32Array(MAX), fz = new Float32Array(MAX);
  const edge = new Int32Array(MAX), from = new Int32Array(MAX), to = new Int32Array(MAX), lead = new Int32Array(MAX), gen = new Int32Array(MAX), leadGen = new Int32Array(MAX), lotOf = new Int32Array(MAX).fill(-1);
  const stuckT = new Float32Array(MAX), ancX = new Float32Array(MAX), ancZ = new Float32Array(MAX), pidOf = new Int32Array(MAX).fill(-1), rteOf = new Array(MAX).fill(null), rk = new Int32Array(MAX), atUntil = new Float32Array(MAX);
  const turned = new Uint8Array(MAX), col = new Uint8Array(MAX * 16), free = new Int32Array(MAX), cur = new Float32Array(MAX); let nFree = 0;
  const GH = 4096, gHead = new Int32Array(GH), gNext = new Int32Array(MAX);
  let nav = null, ctx = null, nodeY = null, rnd = RNG(815), tAcc = 0, setAcc = 9, lastPX = 1e9, lastPZ = 1e9, locE = [], locW = new Float32Array(0), locTot = 0, filled = false, lotState = null, nWalk = 0, nPat = 0, frame = 0, mainLen = 0, lineup = null;
  const S = { agents: 0, drawn: 0, ms: 0, target: 0, tm: 0, ng: 0, nsp: 0, tsp: 0, nman: 0, tman: 0 };
  const hourF = () => ctx && ctx.hour ? ctx.hour() : 12;
  // ---------- schedules ----------
  // street-use factor by hour; 'main' = ward cross streets and (later) avenues 'avenue'; lanes stay alive longer at night (life inside the wards)
  function fMain(h) { if (h < 3.6) return .02; if (h < 5) return lerp(.02, .35, (h - 3.6) / 1.4); if (h < 7) return lerp(.35, .8, (h - 5) / 2); if (h < 11) return .8; if (h < 14) return .9; if (h < 18.2) return 1; if (h < 19) return .9; if (h < 19.6) return lerp(.7, .12, (h - 19) / .6); if (h < 21.5) return .1; return .04; }
  function fLane(h) { if (h < 4) return .04; if (h < 6) return lerp(.04, .5, (h - 4) / 2); if (h < 8) return lerp(.5, 1, (h - 6) / 2); if (h < 19.2) return 1; if (h < 20) return lerp(1, .45, (h - 19.2) / .8); if (h < 22) return .4; return lerp(.4, .06, Math.min(1, (h - 22) / 1.5)); }
  const night = h => h >= 19.6 || h < 4.6, drums = h => h >= 18.9 && h < 19.6;
  // ward gates closed (curfew): G.gateOpen < .35 when the game drives it, else by the hour
  const gatesShut = h => typeof G !== 'undefined' && G.gateOpen !== undefined ? G.gateOpen < .35 : night(h);
  // nav door node -> schedule class of the closable door there (chunk meta 'doors'; 0 = none/home), cached once its chunk is loaded
  const doorCls = new Map();
  function doorShut(n, h) { if (typeof CITY === 'undefined' || !CITY.metaNear) return false; let c = doorCls.get(n);
    if (c === undefined) { const D = nav.nodes[n], L = CITY.metaNear(D.x, D.z, 6, 'doors'); let best = 99; c = -1;
      for (const d of L) { const dd = Math.hypot(d.x - D.x, d.z - D.z); if (dd < best && dd < 5) { best = dd; c = d.cls || 0; } }
      if (c < 0) { if (CITY.chunkAt && CITY.chunkAt(D.x, D.z) && CITY.chunkAt(D.x, D.z).meta) c = 0; else return false; } doorCls.set(n, c); }
    return c > 0 && CITY.isOpen && !CITY.isOpen(c, h); }
  const DENS = { main: .7, avenue: .16, sub: .25, lane: .075, gate: .03, door: 0, palace: .3 }; // palace: paths of the court (engine/palace.js)
  const censusOn = () => typeof CENSUS !== 'undefined' && CENSUS.built;
  const dens = (kind, h) => (censusOn() && (kind === 'lane' || kind === 'sub') ? .35 : 1) * densF(kind, h);
  const densF = (kind, h) => (DENS[kind] ?? .06) * (kind === 'lane' || kind === 'sub' ? fLane(h) * (kind === 'sub' ? .5 + .5 * fMain(h) / Math.max(fLane(h), .01) * .5 + .25 : 1) : kind === 'avenue' ? (night(h) ? 0 : fMain(h)) : fMain(h));
  // who walks: weights per body type, by street kind and time
  const MIX_DAY = { man: 20, labourer: 8, porter: 6, vendor: 3, official: 4, scholar: 4, woman: 13, veil: .6, maid: 5, child: 4, girl: 2.5, monk: 2.5, nun: 1, daoist: 1.2, sogdian: 2.2, persian: .8, uyghur: .8, old: 3, oldwoman: 2, beggar: .6, donkey: 4, horse: 2.5, camel: .6, oxcart: .8, dog: 1.1, horsewoman: .9 };
  const MIX_NIGHT = { man: 30, labourer: 5, scholar: 7, official: 2, woman: 6, maid: 4, old: 2, sogdian: 2, persian: .6, uyghur: .6, child: .5, monk: .5, horse: .6, donkey: .5, dog: 1.2 };
  const LANE_X = { horsewoman: .1, dog: 1.6, girl: 2, oldwoman: 1.4, nun: 1, official: .25, horse: .1, oxcart: 0, camel: .1, porter: .7, child: 2.2, woman: 1.4, maid: 1.3, old: 1.3, vendor: .8 };
  let PALR = null; const inPalace = n => { if (PALR === null) PALR = typeof CITY !== 'undefined' && CITY.all ? CITY.all.filter(w => w.palace).map(w => w.r) : []; for (const r of PALR) if (n.x >= r.x0 && n.x <= r.x1 && n.z >= r.z0 && n.z <= r.z1) return true; return false; };
  function pickType(kind, h) {
    if (kind === 'palace' && typeof PALACE !== 'undefined' && PALACE && PALACE.walkerType) { const t = PALACE.walkerType(kind, h, rnd); if (t && BID[t] !== undefined) return BID[t]; } // the court on palace paths (engine/palace.js)
    const M = night(h) ? MIX_NIGHT : MIX_DAY; let tot = 0;
    for (const k in M) tot += M[k] * (kind === 'lane' ? (LANE_X[k] ?? 1) : 1) * (k === 'official' && h > 10.5 && h < 14 ? .5 : 1);
    let r = rnd() * tot; for (const k in M) { r -= M[k] * (kind === 'lane' ? (LANE_X[k] ?? 1) : 1) * (k === 'official' && h > 10.5 && h < 14 ? .5 : 1); if (r <= 0) return BID[k]; } return BID.man;
  }
  const KPREF = { def: { main: 2.6, avenue: 2, sub: 1.3, lane: .45, gate: .25 }, child: { main: .8, avenue: .2, sub: .9, lane: 1.1, gate: .05 }, big: { main: 1.6, avenue: 1.6, sub: .5, lane: .03, gate: .4 }, pat: { main: 1, avenue: 1, sub: .15, lane: 0, gate: 0 }, fem: { main: 1.6, avenue: .8, sub: 1.2, lane: .8, gate: .15 } };
  const prefOf = i => role[i] === RPAT ? KPREF.pat : (BODIES[ty[i]].info.quad && ty[i] !== BID.dog) || ty[i] === BID.official ? KPREF.big : (ty[i] === BID.child || ty[i] === BID.girl) ? KPREF.child : (ty[i] === BID.woman || ty[i] === BID.maid || ty[i] === BID.veil || ty[i] === BID.oldwoman || ty[i] === BID.nun) ? KPREF.fem : KPREF.def;
  const margin = (kind, w) => Math.min(w / 2 - .5, kind === 'main' || kind === 'avenue' || kind === 'palace' ? w / 2 - (w >= 20 ? 5.5 : 2.3) : kind === 'sub' ? w / 2 - 1.3 : kind === 'lane' ? w / 2 - .65 : kind === 'gate' ? w / 2 - 1 : 0); // never beyond w/2 - 0.5 (gate edges = bridges over the ditch)
  // ---------- agents ----------
  function alloc() { if (!nFree) return -1; const i = free[--nFree]; alive[i] = 1; gen[i]++; lotOf[i] = -1; lead[i] = -1; flags[i] = 0; cd[i] = 5 + rnd() * 10; home[i] = 0; S.agents++; return i; }
  function kill(i) { if (!alive[i]) return; if (pidOf[i] >= 0) censusRelease(i); alive[i] = 0; free[nFree++] = i; S.agents--; if (role[i] === RW) nWalk--; if (role[i] === RPAT) nPat--; }
  function colours(i, b) {
    const P = BODIES[b].pal, o = i * 16;
    for (let k = 0; k < 4; k++) { const L = P[k], c = L[(rnd() * L.length) | 0], v = .94 + rnd() * .12; col[o + k * 4] = clamp(c[0] * v, 0, 1) * 255; col[o + k * 4 + 1] = clamp(c[1] * v, 0, 1) * 255; col[o + k * 4 + 2] = clamp(c[2] * v, 0, 1) * 255; col[o + k * 4 + 3] = 255; }
    col[o + 15] = (.44 + rnd() * .12) * 255;
  }
  function newAgent(b, r, x, z) {
    const i = alloc(); if (i < 0) return -1; const inf = BODIES[b].info;
    ty[i] = b; role[i] = r; st[i] = SW; px[i] = x; pz[i] = z; gy[i] = 0; vel[i] = 0; ph[i] = rnd() * TAU;
    sp0[i] = spd[i] = lerp(inf.sp[0], inf.sp[1], rnd()); cur[i] = spd[i] * .9; scl[i] = (b === BID.child ? .85 + rnd() * .3 : .93 + rnd() * .12) * (b === BID.woman || b === BID.maid || b === BID.veil ? .97 : 1);
    if (inf.quad) scl[i] = .95 + rnd() * .1;
    const a = rnd() * TAU; hx[i] = Math.sin(a); hz[i] = Math.cos(a); offF[i] = (rnd() < .72 ? 1 : -1) * (.25 + rnd() * .7); if (inf.quad) offF[i] *= .6;
    anim[i] = anim0[i] = inf.quad ? 41 : (inf.anim || 1); colours(i, b);
    // items: some commoners carry nothing; monks sometimes without the staff
    if ((b === BID.labourer || b === BID.porter || b === BID.vendor) && strawTime() && rnd() < .55) flags[i] |= 4; // 笠 in the summer sun
    if (b === BID.woman && rnd() < .6) flags[i] |= 2; if (b === BID.man) { if (rnd() < .55) flags[i] |= 2; const hh = hourF(); if (!(hh > 18.8 || hh < 5) || rnd() < .3) flags[i] |= 1; } if (b === BID.monk && rnd() < .5) flags[i] |= 1; if (b === BID.labourer && rnd() < .5) flags[i] |= 1;
    if (b === BID.official && rnd() < .5) flags[i] |= 1; if (b === BID.scholar && rnd() < .4) flags[i] |= 1; if (b === BID.maid && rnd() < .4) flags[i] |= 2; if (b === BID.old && rnd() < .2) flags[i] |= 1;
    if (b === BID.donkey) flags[i] |= rnd() < .45 ? 1 : 2; // ridden (packs hidden) or a pack donkey
    if (b === BID.horse && rnd() < .12) flags[i] |= 1; // led horse without rider
    if (role[i] === RW) nWalk++; if (r === RPAT) nPat++;
    return i;
  }
  const strawTime = () => { const h = hourF(); return h > 6 && h < 18.5; };
  function groundAt(x, z) { S.ng++; try { if (ctx && ctx.height) { const y = ctx.height(x, z); return y > -1e6 ? y : 0; } const y = ctx && ctx.ground ? ctx.ground(x, z) : 0; return y > -50 && y < 1.5 ? y : 0; } catch (e) { return 0; } }
  // node ground heights: world.ground is expensive (0.1-0.3 ms), so at most a few queries per frame; unknown nodes read 0 until filled
  let gBudget = 2, gFill = 0;
  function groundOf(i) {
    // near the camera: the surface actually walked on (palace terraces, steps, platforms), following from the last height so nobody pops onto a roof
    const W = typeof G !== 'undefined' && G.world, c = R.camPos; if (W && c && (px[i] - c[0]) ** 2 + (pz[i] - c[2]) ** 2 < 3600 && typeof CITY !== 'undefined' && CITY.chunkAt) { const ch = CITY.chunkAt(px[i], pz[i]); if (ch && ch.world) { const g = W.ground(px[i], pz[i], gy[i] + .5, .6, 0); if (g.y > -1e6) return g.y; } }
    if (ctx && ctx.height) { try { const y = ctx.height(px[i], pz[i]); if (y > -1e6) return y; } catch (e) { } }
    const r = role[i]; if ((r === RW || r === RPAT) && st[i] !== SENTER) { const E = nav.edges[edge[i]], t = clamp(es[i] / E.len, 0, 1); return lerp(nY(from[i]), nY(to[i]), t); }
    if (r === RFOL && alive[lead[i]]) return gy[lead[i]]; return gy[i];
  }
  // is (x,z) possibly visible from the camera (cone + range); m = margin in metres
  function inView(x, z, m) { const c = R.camPos; if (!c) return false; const dx = x - c[0], dz = z - c[2], d2 = dx * dx + dz * dz; if (d2 > 150 * 150) return false;
    const fx_ = -Math.sin(R.camYaw), fz_ = -Math.cos(R.camYaw), dd = dx * fx_ + dz * fz_; if (dd < -m) return d2 < 4; const lat = Math.abs(-dx * fz_ + dz * fx_); return lat < dd * 1.25 + m; }
  function nY(n) { let y = nodeY[n]; if (y !== y) { if (gBudget <= 0) return 0; gBudget--; const N = nav.nodes[n]; y = nodeY[n] = groundAt(N.x, N.z); } return y; }
  function fillNodeY() { gBudget = 2; const NN = nav.nodes.length; for (let k = 0; k < 64 && gBudget > 1; k++) { gFill = (gFill + 1) % NN; if (nodeY[gFill] !== nodeY[gFill]) nY(gFill); } }
  function setEdge(i, e, fromN) {
    const E = nav.edges[e]; edge[i] = e; from[i] = fromN; to[i] = E.a === fromN ? E.b : E.a; es[i] = 0; turned[i] = 0;
    const A = nav.nodes[from[i]], B = nav.nodes[to[i]], L = E.len || 1; fx[i] = (B.x - A.x) / L; fz[i] = (B.z - A.z) / L;
    const m = Math.max(0, margin(E.kind, E.w)); off[i] = offF[i] * m;
  }
  function placeOnEdge(i, e, s, fromN) { setEdge(i, e, fromN); es[i] = s; const A = nav.nodes[from[i]];
    if (ctx && ctx.height) for (let k = 0; k < 6; k++) { let y = 0; try { y = ctx.height(A.x + fx[i] * s - fz[i] * off[i], A.z + fz[i] * s + fx[i] * off[i]); } catch (er) { } if (!(y < -.3)) break; off[i] *= .5; offF[i] *= .5; } // never placed in a ditch
    px[i] = A.x + fx[i] * s - fz[i] * off[i]; pz[i] = A.z + fz[i] * s + fx[i] * off[i]; yaw[i] = yawT[i] = Math.atan2(fx[i], fz[i]); gy[i] = lerp(nY(from[i]), nY(to[i]), clamp(s / (nav.edges[e].len || 1), 0, 1)); }
  // choose the next edge at node n for agent i (came along edge ce)
  function nextEdge(i, n, ce, h) {
    const adj = nav.adj[n], P = prefOf(i), nightNow = night(h); let tot = 0, best = -1;
    const enterP = role[i] !== RW || BODIES[ty[i]].info.quad ? 0 : home[i] ? 1 : drums(h) ? .3 : nightNow ? .12 : h > 17 ? .07 : .035;
    for (const e of adj) { const E = nav.edges[e]; if (E.kind === 'door' && e !== ce && rnd() < enterP) { const dn = nav.nodes[E.a].kind === 'door' ? E.a : E.b; if (!doorShut(dn, h)) return e; } }
    const shut = gatesShut(h);
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      tot = 0; for (const e of adj) { if (e === ce && pass === 0) continue; const E = nav.edges[e]; if (E.kind === 'door') continue; let w = P[E.kind] ?? .5; if (E.kind === 'gate' && (shut || nightNow || role[i] === RPAT)) w = 0; if (E.kind === 'gate' && h > 4.6 && h < 7) w *= 3;
        const o = E.a === n ? E.b : E.a, dx = nav.nodes[o].x - nav.nodes[n].x, dz = nav.nodes[o].z - nav.nodes[n].z, L = E.len || 1; w *= Math.max(.08, 1 + 1.3 * (dx * hx[i] + dz * hz[i]) / L); tot += w; }
      if (tot <= 0) continue; let r = rnd() * tot;
      for (const e of adj) { if (e === ce && pass === 0) continue; const E = nav.edges[e]; if (E.kind === 'door') continue; let w = P[E.kind] ?? .5; if (E.kind === 'gate' && (shut || nightNow || role[i] === RPAT)) w = 0; if (E.kind === 'gate' && h > 4.6 && h < 7) w *= 3;
        const o = E.a === n ? E.b : E.a, dx = nav.nodes[o].x - nav.nodes[n].x, dz = nav.nodes[o].z - nav.nodes[n].z, L = E.len || 1; w *= Math.max(.08, 1 + 1.3 * (dx * hx[i] + dz * hz[i]) / L); r -= w; if (r <= 0 && w > 0) { best = e; break; } }
    }
    return best >= 0 ? best : ce; // (ce = the way back; a shut gate is never chosen above)
  }
  function arrive(i, h) {
    if (pidOf[i] >= 0 && rteOf[i]) { censusArrive(i, h); return; }
    const n = to[i], N = nav.nodes[n];
    if (N.kind === 'door' && nav.edges[edge[i]].kind === 'door' && !doorShut(n, h)) { st[i] = SENTER; timer[i] = 7 / Math.max(.5, spd[i]); return; }
    if (nav.adj[n].length === 1 && N.kind === 'gate' && !gatesShut(h)) { st[i] = SENTER; timer[i] = 25 / Math.max(.5, spd[i]); return; } // out through a ward gate (dead end in this graph): keep walking, vanish out of view
    // wander heading drifts; turn toward a gate at dawn
    if (rnd() < .15) { const a = Math.atan2(hx[i], hz[i]) + (rnd() - .5) * 1.6; hx[i] = Math.sin(a); hz[i] = Math.cos(a); }
    const e = nextEdge(i, n, edge[i], h); setEdge(i, e, n);
    if (role[i] === RW && st[i] === SW && !BODIES[ty[i]].info.quad && rnd() < .03) { st[i] = SPAUSE; anim[i] = 10; timer[i] = 1.5 + rnd() * 3; }
  }
  // ---------- spawning ----------
  function localEdges(cx, cz) {
    const L = []; mainLen = 0;
    for (let e = 0; e < nav.edges.length; e++) { const E = nav.edges[e], A = nav.nodes[E.a], B = nav.nodes[E.b];
      // clipped length inside R_ACT (sampled)
      let inside = 0; const n = Math.max(1, Math.ceil(E.len / 10)); for (let k = 0; k < n; k++) { const t = (k + .5) / n, x = lerp(A.x, B.x, t), z = lerp(A.z, B.z, t); if ((x - cx) ** 2 + (z - cz) ** 2 < R_ACT * R_ACT) inside++; }
      if (inside) { L.push(e, inside / n * E.len); if (E.kind === 'main' || E.kind === 'avenue') mainLen += inside / n * E.len; } }
    return L;
  }
  function refreshLocal(cx, cz, h) {
    if (Math.hypot(cx - lastPX, cz - lastPZ) > 18) { locE = localEdges(cx, cz); lastPX = cx; lastPZ = cz; }
    if (locW.length < locE.length / 2) locW = new Float32Array(locE.length / 2 + 64);
    locTot = 0; for (let k = 0; k < locE.length; k += 2) { const E = nav.edges[locE[k]]; locTot += locE[k + 1] * dens(E.kind, h); locW[k / 2] = locTot; }
    return locTot;
  }
  function pickLocal() { const r = rnd() * locTot, n = locE.length / 2; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (locW[m] < r) lo = m + 1; else hi = m; } return locE[lo * 2]; }
  const _ci = [0, 0, 0, 0, 0];
  function camInfo() { const c = R.camPos, y = R.camYaw || 0; if (c) { _ci[0] = c[0]; _ci[1] = c[2]; _ci[4] = c[1]; } _ci[2] = -Math.sin(y); _ci[3] = -Math.cos(y); return _ci; }
  function spawnWalker(h, fill) {
    const ci = camInfo(), cx = ci[0], cz = ci[1], cfx = ci[2], cfz = ci[3];
    for (let tries = 0; tries < 6; tries++) {
      let e, s, fromN, door = false;
      if (!fill && rnd() < .3 && nav.doors.length) { // come out of a door
        const dn = nav.doors[(rnd() * nav.doors.length) | 0], D = nav.nodes[dn]; if ((D.x - cx) ** 2 + (D.z - cz) ** 2 > R_ACT * R_ACT) continue;
        if (!nav.adj[dn].length) continue; e = nav.adj[dn][0]; fromN = dn; s = -4.5; door = true;
        if (night(h) && rnd() < .5 || doorShut(dn, h)) continue;
      } else {
        if (locTot <= 0) return -1; e = pickLocal(); const E = nav.edges[e]; s = rnd() * E.len; fromN = rnd() < .5 ? E.a : E.b;
        if (E.kind === 'door' || E.kind === 'gate' && gatesShut(h)) continue;
        const A = nav.nodes[fromN], B = nav.nodes[E.a === fromN ? E.b : E.a], t = s / (E.len || 1), x = lerp(A.x, B.x, t), z = lerp(A.z, B.z, t), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d > R_ACT) continue; if (!fill && d < 75 && dx * cfx + dz * cfz > -d * .2) continue; // don't pop up in view
      }
      const E = nav.edges[e], b = pickType(inPalace(nav.nodes[E.a]) ? 'palace' : door ? 'lane' : E.kind, h); // inside the palaces: the court's people only
      if (BODIES[b].info.quad && b !== BID.dog && (door || E.kind === 'lane' && b !== BID.donkey)) continue;
      const i = newAgent(b, RW, 0, 0); if (i < 0) return -1; placeOnEdge(i, e, s, fromN);
      if (drums(h)) { spd[i] = Math.min(1.6, sp0[i] * 1.2); cur[i] = spd[i]; if ((b === BID.man || b === BID.child || b === BID.labourer) && rnd() < .1) { anim[i] = anim0[i] = 7; spd[i] = 2.2 + rnd() * .5; } }
      companions(i, h);
      return i;
    }
    return -1;
  }
  function follower(L, b, side, fwd) { const i = newAgent(b, RFOL, px[L], pz[L]); if (i < 0) return -1; lead[i] = L; leadGen[i] = gen[L]; tx[i] = side; tz[i] = fwd; yaw[i] = yaw[L];
    px[i] = px[L] + (-fz[L] * 0) + Math.cos(yaw[L]) * side + Math.sin(yaw[L]) * fwd; pz[i] = pz[L] - Math.sin(yaw[L]) * side + Math.cos(yaw[L]) * fwd; return i; }
  function companions(i, h) { // groups: a groom with a horse, a driver with the ox cart, a maid with her lady, a child with a parent, monks in pairs
    const b = ty[i], r = rnd();
    if (b === BID.horse || b === BID.horsewoman) { if (b === BID.horse) follower(i, rnd() < .5 ? BID.man : BID.labourer, .85, .7); else flags[i] |= 2; } // grooms lead official horses; women ride alone (no rope)
    else if (b === BID.donkey) { if (flags[i] & 1) follower(i, rnd() < .6 ? BID.labourer : BID.man, .55, .62); } // pack donkeys are led; ridden ones carry their rider (packs and rope hidden)
    else if (b === BID.oxcart) follower(i, BID.labourer, -.75, 1.6);
    else if (b === BID.camel) follower(i, rnd() < .7 ? BID.sogdian : BID.labourer, .8, 1.1);
    else if ((b === BID.woman || b === BID.veil) && r < .35) follower(i, rnd() < .7 ? BID.maid : BID.child, -.7, -.5);
    else if (b === BID.official && r < .4) follower(i, BID.man, -.75, -.8);
    else if (b === BID.monk && r < .3) follower(i, BID.monk, .75, -.3);
    else if ((b === BID.man || b === BID.woman || b === BID.old) && r < .14) follower(i, BID.child, .65, .1);
    else if (b === BID.man && r < .24) follower(i, rnd() < .5 ? BID.man : BID.scholar, .75, 0);
    else if (b === BID.child && r < .4) { const f = follower(i, BID.child, .7, -1.2); if (f >= 0) { spd[i] *= 1.1; } }
  }
  function spawnPatrol(h, fill) {
    // a pair of 金吾 guards on a main street / avenue
    const ci = camInfo(), cx = ci[0], cz = ci[1], cfx = ci[2], cfz = ci[3]; const mains = [];
    for (let k = 0; k < locE.length; k += 2) { const E = nav.edges[locE[k]]; if (E.kind === 'main' || E.kind === 'avenue') mains.push(locE[k]); }
    if (!mains.length) return;
    for (let tries = 0; tries < 5; tries++) {
      const e = mains[(rnd() * mains.length) | 0], E = nav.edges[e], s = rnd() * E.len, fromN = rnd() < .5 ? E.a : E.b, A = nav.nodes[fromN], B = nav.nodes[E.a === fromN ? E.b : E.a], t = s / (E.len || 1), x = lerp(A.x, B.x, t), z = lerp(A.z, B.z, t), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (!fill && d < 75 && dx * cfx + dz * cfz > -d * .2) continue;
      const i = newAgent(BID.guard, RPAT, x, z); if (i < 0) return; offF[i] = (rnd() < .5 ? -1 : 1) * (.1 + rnd() * .3); placeOnEdge(i, e, s, fromN); spd[i] = sp0[i] = 1.15;
      follower(i, BID.guard, offF[i] > 0 ? -.85 : .85, -.2); return;
    }
  }
  // ---------- set pieces at lot fronts, gates and wells ----------
  function bucket(h) { return h >= 19.6 || h < 4.8 ? 0 : h < 10 ? 1 : h < 16 ? 2 : 3; }
  function setAgent(b, x, z, a, an, lot, fl = 0) { if (ctx && ctx.height) { let y = 0; try { y = ctx.height(x, z); } catch (e) { } if (y < -.3) return -1; } const i = newAgent(b, RSET, x, z); if (i < 0) return -1; st[i] = SSTATIC; yaw[i] = yawT[i] = a; anim[i] = anim0[i] = an; lotOf[i] = lot; flags[i] = fl | (b === BID.man && !(hourF() > 18.8 || hourF() < 5) ? 1 : 0) | ((b === BID.labourer || b === BID.porter || b === BID.vendor) && strawTime() && rnd() < .5 ? 4 : 0); gy[i] = lot >= 0 ? nY(lot < nav.nodes.length ? lot : nav.edges[lot - nav.nodes.length].a) : 0; ph[i] = rnd() * 100; return i; }
  function populateLot(dn, bk, h) {
    const D = nav.nodes[dn], lot = D.lot; if (!lot || !nav.adj[dn].length) return;
    const E = nav.edges[nav.adj[dn][0]], S2 = nav.nodes[E.a === dn ? E.b : E.a]; let ux = S2.x - D.x, uz = S2.z - D.z; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L; const tX = -uz, tZ = ux;
    const R2 = RNG((lot.seed || dn * 7919) ^ (bk * 977)), r = R2, at = (u, t) => [D.x + ux * u + tX * t, D.z + uz * u + tZ * t], face = Math.atan2(ux, uz), back = Math.atan2(-ux, -uz);
    const pick = a => a[(r() * a.length) | 0], put = (b, u, t, a, an, fl) => { const [x, z] = at(u, t); return setAgent(b, x, z, a, an, dn, fl); };
    const type = lot.type, day = bk > 0;
    if (type === 'shop' && day) {
      const v = put(r() < .7 ? BID.vendor : BID.man, 1.0, (r() - .5) * 2, face, pick([17, 17, 16, 0, 3]), r() < .5 ? 2 : 0);
      if (v >= 0 && ty[v] === BID.vendor && r() < .5) flags[v] |= 2;
      const nc = r() < .75 ? 1 + (r() * 2.2 | 0) : 0; for (let k = 0; k < nc; k++) put(pick([BID.man, BID.woman, BID.woman, BID.maid, BID.old, BID.sogdian, BID.scholar]), 2.1 + r() * .5, (k - (nc - 1) / 2) * .8 + (r() - .5) * .4, back + (r() - .5) * .5, pick([11, 11, 3, 0, 13]));
    } else if (type === 'wineshop' && (day || h < 23 && h > 12)) {
      put(r() < .35 ? BID.huji : BID.man, 1.0, 1.4 * (r() < .5 ? 1 : -1), face, pick([17, 16, 3, 21]), 2);
      const n = 1 + (r() * 3 | 0); for (let k = 0; k < n; k++) put(pick([BID.man, BID.man, BID.scholar, BID.sogdian, BID.official, BID.labourer]), 1.8 + r() * 1.2, (r() - .5) * 4, r() * TAU, pick([9, 9, 5, 3, 11]), 3);
    } else if (type === 'rich') {
      if (r() < (day ? .75 : .5)) put(r() < .5 ? BID.man : BID.guard, 1.0, 2.2 * (r() < .5 ? 1 : -1), face, pick([16, 0, 16, 10]), 1 | 2);
      if (bk === 1 && r() < .6) put(BID.labourer, 2 + r() * 2, (r() - .5) * 5, r() * TAU, 6, 0);
      if (r() < .4) put(BID.dog, 1.7, 2.4 * (r() < .5 ? 1 : -1), r() * TAU, pick([44, 44, 40]), 0); // guard dog
      if (day && r() < .25) { put(BID.horse, 3.2, 3, Math.atan2(tX, tZ), 40, 1 | 2); put(BID.man, 2.6, 1.8, Math.atan2(-tX, -tZ), 16, 3); }
    } else if (type === 'temple') {
      if (r() < .8) put(r() < .8 ? BID.monk : BID.nun, 1.5, (r() - .5) * 3, face, pick([16, 0, 8, 13]), r() < .5 ? 1 : 0);
      if (day && r() < .35) put(BID.beggar, 2.0, 2.6 * (r() < .5 ? 1 : -1), face, pick([5, 12, 16]), 1);
      if (day && r() < .45) put(BID.labourer, 2.2 + r() * 2, (r() - .5) * 6, r() * TAU, 6, 0);
      if (day && r() < .3) { put(BID.monk, 2.4, 1, back, 3, 3); put(BID.woman, 2.6, 2, back + .3, 8, 0); }
    } else if ((type === 'house' || type === 'hut') && bk !== 0) {
      const q = r(); if (r() < .22) { const nc = 2 + (r() * 3 | 0); for (let c = 0; c < nc; c++) put(BID.chicken, 1.2 + r() * 2.2, (r() - .5) * 5, r() * TAU, r() < .7 ? 43 : 40, 0); } // chickens in the lane
      if (q < .2) { put(pick([BID.woman, BID.woman, BID.old, BID.man, BID.oldwoman]), 1.4, -.6, Math.atan2(tX, tZ), 3, 2); put(pick([BID.woman, BID.maid, BID.man, BID.oldwoman]), 1.4, .6, Math.atan2(-tX, -tZ), pick([3, 3, 11]), 2); }
      else if (q < .32 && bk !== 0) { put(r() < .5 ? BID.child : BID.girl, 1.3 + r(), (r() - .5) * 3, r() * TAU, pick([12, 12, 0]), 0); if (r() < .6) put(BID.child, 2.4 + r(), (r() - .5) * 3, r() * TAU, 12, 0); }
      else if (q < .4) put(BID.old, 1.2, (r() - .5) * 2, face, pick([5, 16, 12]), 1);
      else if (q < .45) put(BID.labourer, 1.5, (r() - .5) * 3, r() * TAU, 6, 0);
    } else if ((type === 'garden' || type === 'field') && day && r() < .3) put(BID.labourer, 1.5, (r() - .5) * 4, r() * TAU, 6, 1);
    else if (bk === 0 && (type === 'house' || type === 'wineshop') && r() < .08) put(BID.man, 1.3, 0, face, 16, 0);
  }
  function populateGates(h) {
    if (!nav.gates) return; for (const gn of nav.gates) { const G = nav.nodes[gn]; if (!nav.adj[gn].length) continue; const E = nav.edges[nav.adj[gn][0]], I = nav.nodes[E.a === gn ? E.b : E.a];
      let ux = I.x - G.x, uz = I.z - G.z; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L; const tX = -uz, tZ = ux;
      for (const sd of [-1, 1]) { if (night(h) && sd > 0) continue; const x = G.x + ux * 10.5 + tX * 2.9 * sd, z = G.z + uz * 10.5 + tZ * 2.9 * sd; const i = setAgent(BID.guard, x, z, Math.atan2(-tX * sd, -tZ * sd), rnd() < .5 ? 16 : 0, -2, rnd() < .4 ? 1 : 0); void i; } }
    if (ctx.lay && ctx.lay.wells) for (const w of ctx.lay.wells) { if (night(h)) continue; setAgent(BID.woman, w.x + 1.4, w.z, -PI / 2, 3, -2); setAgent(BID.maid, w.x - .3, w.z + 1.5, PI, 3, -2); if (h < 12) setAgent(BID.old, w.x - 1.8, w.z - .8, PI / 2 + .4, 5, -2, 1); }
  }
  // key space for set pieces: door node dn -> dn; street edge e -> nodes.length + e
  const keyPos = k => { const NN = nav.nodes.length; if (k < NN) return nav.nodes[k]; const E = nav.edges[k - NN], A = nav.nodes[E.a], B = nav.nodes[E.b]; _kp.x = (A.x + B.x) / 2; _kp.z = (A.z + B.z) / 2; return _kp; }, _kp = { x: 0, z: 0 };
  function populateEdge(e, bk, h) { // street life on main/sub streets: squatting sellers with customers (侵街 stalls), people chatting
    const E = nav.edges[e]; if (!(E.kind === 'main' || E.kind === 'sub' || E.kind === 'avenue') || bk === 0) return;
    const r = RNG(e * 7907 + bk * 131 + 5), A = nav.nodes[E.a], B = nav.nodes[E.b], L = E.len || 1, ux = (B.x - A.x) / L, uz = (B.z - A.z) / L, key = nav.nodes.length + e, hw = E.w / 2;
    const pick = a => a[(r() * a.length) | 0], at = (s, o) => [A.x + ux * s - uz * o, A.z + uz * s + ux * o];
    const n = Math.floor(L / (E.kind === 'sub' ? 30 : 16));
    for (let k = 0; k < n; k++) { const s = 6 + r() * (L - 12), q = r(); if (s < 6 || s > L - 6) continue;
      if (q < (E.kind === 'sub' ? .25 : .42) && bk > 0) { const side = r() < .5 ? -1 : 1, o = side * (hw - 2.6 - r() * .4), [x, z] = at(s, o), fc = Math.atan2(uz * side, -ux * side); // face the street centre
        const v = setAgent(r() < .75 ? BID.vendor : pick([BID.old, BID.woman, BID.sogdian]), x, z, fc, pick([12, 12, 17, 5, 16]), key); void v;
        const nc = r() < .6 ? 1 + (r() < .3 ? 1 : 0) : 0; for (let c = 0; c < nc; c++) { const [x2, z2] = at(s + (c - .5 * (nc - 1)) * .8, o - side * 1.15); setAgent(pick([BID.man, BID.woman, BID.maid, BID.old, BID.scholar, BID.labourer, BID.child]), x2, z2, fc + PI + (r() - .5) * .4, pick([11, 11, 3, 12, 0]), key, r() < .5 ? 3 : 0); } }
      else if (q < .47 && E.kind === 'main' && bk > 1) { const o = (r() - .5) * (hw - 3), [x, z] = at(s, o), a0 = r() * TAU; setAgent(BID.entertainer, x, z, a0, 11, key, 0); // 百戲: a juggler and a ring of onlookers
        const m = 3 + (r() * 4 | 0); for (let c = 0; c < m; c++) { const a = a0 + PI * .35 + c * PI * 1.3 / m, [x2, z2] = [x + Math.sin(a) * 1.8, z + Math.cos(a) * 1.8]; setAgent(pick([BID.man, BID.child, BID.girl, BID.woman, BID.labourer, BID.scholar, BID.old]), x2, z2, a + PI, pick([0, 0, 3, 16, 10]), key, 3); } }
      else if (q < .62) { const o = (r() - .5) * 2 * (hw - 3), [x, z] = at(s, o), m = 2 + (r() < .3 ? 1 : 0), a0 = r() * TAU;
        for (let c = 0; c < m; c++) { const a = a0 + c * TAU / m, rr = m === 2 ? .6 : .72, [x2, z2] = [x + Math.sin(a) * rr, z + Math.cos(a) * rr]; setAgent(pick([BID.man, BID.man, BID.woman, BID.scholar, BID.old, BID.official, BID.sogdian, BID.labourer]), x2, z2, a + PI, pick([3, 3, 11, 0, 8, 16]), key, r() < .6 ? 3 : 0); } }
    }
  }
  // set-piece key bookkeeping without closures (runs over thousands of doors every 0.25 s): true = (re)populate now
  function visitKey(k, bk, cx, cz, F2) { const D = keyPos(k), d2 = (D.x - cx) ** 2 + (D.z - cz) ** 2;
    if (d2 > F2) { lotState[k] = 0; return false; }
    if (d2 < R_SET * R_SET && lotState[k] !== bk + 1 && (!filled || d2 > 96 * 96 || !inView(D.x, D.z, 8))) { if (lotState[k]) for (let i = 0; i < MAX; i++) if (alive[i] && role[i] === RSET && lotOf[i] === k) kill(i); lotState[k] = bk + 1; return true; }
    return false; }
  function manageSets(h, cx, cz) {
    const bk = bucket(h), NN = nav.nodes.length, F2 = (R_SET + 25) ** 2;
    // set pieces only appear/disappear where nobody is looking (or far away in the haze)
    for (let i = 0; i < MAX; i++) if (alive[i] && role[i] === RSET && lotOf[i] >= 0) { const D = keyPos(lotOf[i]); if ((D.x - cx) ** 2 + (D.z - cz) ** 2 > F2) kill(i); }
    for (let n = 0; n < nav.doors.length; n++) { const dn = nav.doors[n]; if (visitKey(dn, bk, cx, cz, F2)) populateLot(dn, bk, h); }
    for (let k = 0; k < locE.length; k += 2) { const e = locE[k]; if (visitKey(NN + e, bk, cx, cz, F2)) populateEdge(e, bk, h); }
    if (setAcc !== bk) { for (let i = 0; i < MAX; i++) if (alive[i] && role[i] === RSET && lotOf[i] === -2) kill(i); setAcc = bk; populateGates(h); }
  }
  let mX = 1e9, mZ = 1e9;
  function manage(h) {
    const ci = camInfo(), cx = ci[0], cz = ci[1]; if (Math.hypot(cx - mX, cz - mZ) > 60) filled = false; mX = cx; mZ = cz; // teleport: refill instantly
    refreshLocal(cx, cz, h);
    // despawn far walkers (and orphaned followers)
    for (let i = 0; i < MAX; i++) { if (!alive[i]) continue; const r = role[i];
      if (r === RFOL && (!alive[lead[i]] || gen[lead[i]] !== leadGen[i])) { kill(i); continue; }
      if ((r === RW || r === RPAT) && (px[i] - cx) ** 2 + (pz[i] - cz) ** 2 > R_DESP * R_DESP) kill(i); }
    const target = Math.min(MAX - 380, Math.round(locTot)); S.target = target;
    let n = filled ? 3 : target; const ts = performance.now(); while (nWalk < target && n-- > 0) { S.nsp++; if (spawnWalker(h, !filled) < 0 && filled) break; if (filled && performance.now() - ts > .8) break; } S.tsp += performance.now() - ts;
    // too many (evening): send the surplus home
    if (nWalk > target * 1.1 + 2) { let ex = nWalk - target; for (let i = 0; i < MAX && ex > 0; i++) if (alive[i] && role[i] === RW && !home[i]) { home[i] = 1; ex--; } }
    const pT = Math.max(1, Math.round(mainLen / (night(h) ? 220 : 320))); let m = filled ? 1 : pT; while (nPat < pT && m-- > 0) spawnPatrol(h, !filled);
    manageSets(h, cx, cz); filled = true;
  }
  // ---------- attendants: staff at business spots (CITY.metaNear(x, z, r, 'spots')), shown while the business is open ----------
  // spot = {x, y, z, yaw (placeStatic convention: faces (sin yaw, cos yaw)), role, cls, anim?}. Refreshed every 0.5 s; spawn < 70 m, keep < 82 m.
  const RATT = 6, ATT = new Map(); let attAcc = 9, attStamp = 0;
  const ATT_TYPES = { keeper: ['man', 'man', 'vendor', 'old', 'man'], assistant: ['labourer', 'man', 'child', 'maid'], waiter: ['man', 'maid', 'labourer'], cook: ['labourer', 'labourer', 'man'], hostess: ['huji'], monk: ['monk'], daoist: ['daoist'], eunuch: ['eunuch', 'eunuch', 'nanzhuang'], palaceguard: ['palaceguard'], lady: ['palacelady', 'palacelady', 'nanzhuang'] }; // eunuch / palaceguard / lady: palace posts (palace.js)
  const ATT_ANIMS = { keeper: [0, 3, 16, 17, 10, 0], assistant: [0, 6, 2, 3, 10], waiter: [21, 0, 3, 10], cook: [2, 2, 6, 0], hostess: [21, 3, 0, 10], monk: [16, 8, 13, 16], daoist: [16, 8, 13, 16], eunuch: [16, 0, 16, 10], palaceguard: [0, 0, 10], lady: [3, 16, 0, 10] };
  const ATT_GREET = { keeper: [11, 3], assistant: [11, 3], waiter: [8, 21], cook: [3], hostess: [21, 3, 8], monk: [8], eunuch: [8], palaceguard: [0], lady: [8, 3] };
  const sHash = (x, z) => ((Math.round(x * 4) * 73856093) ^ (Math.round(z * 4) * 19349663)) >>> 0;
  function attAnim(s, d) { const a = s.anim; if (typeof a === 'number') return a; if (typeof a === 'string' && ANIM_NAMES[a] !== undefined) return ANIM_NAMES[a]; return d; }
  function manageAtt(dt, h, cx, cz) {
    attAcc += dt; if (attAcc < .5) return; attAcc = 0; attStamp++;
    const C = typeof CITY !== 'undefined' ? CITY : null, src = API.spotSource || (C && C.metaNear ? (x, z, r) => C.metaNear(x, z, r, 'spots') : null);
    const list = src ? src(cx, cz, 82) || [] : [];
    for (const s of list) {
      if (!s.role || s.kind || s.role === 'watch') continue; // staff posts only: resident spots (bed/seat/hearth/work) are for people at home; night-watch posts are the game's
      const cls = s.cls ?? (s.role === 'gatekeeper' ? 4 : 0), open = !cls || !C || !C.isOpen || C.isOpen(cls, h), d2 = (s.x - cx) ** 2 + (s.z - cz) ** 2, k = sHash(s.x, s.z); let A = ATT.get(k);
      if (A && (!alive[A.i] || gen[A.i] !== A.g || role[A.i] !== RATT)) { ATT.delete(k); A = null; }
      if (!open || d2 > 82 * 82) continue; if (API.skipLot && typeof CENSUS !== 'undefined' && API.skipLot(CENSUS.lotAt(s.x, s.z))) { if (A) { kill(A.i); ATT.delete(k); } continue; } const rl = ATT_TYPES[s.role] ? s.role : 'keeper';
      if (!A) { if (d2 > 70 * 70) continue;
        let yw = (s.yaw || 0) + PI; // spots use the game/kit convention (forward = (-sin, -cos)); crowd models face (sin, cos)
        if (C && C.metaNear) { let bd = 144, dr = null; for (const d of C.metaNear(s.x, s.z, 12, 'doors')) { if (!d.a) continue; const q = (d.x - s.x) ** 2 + (d.z - s.z) ** 2; if (q < bd) { bd = q; dr = d; } }
          if (dr) yw = Math.atan2(dr.a[0] - s.x, dr.a[1] - s.z); } // face the entrance (its outside point)
        const cp = censusStaff(s, rl, h), rs = RNG(cp ? CENSUS.person(cp).seed : k), tl = ATT_TYPES[rl], b = cp !== null ? BID[CENSUS.person(cp).type] ?? BID.man : BID[tl[(rs() * tl.length) | 0]] ?? BID.man, i = alloc(); if (i < 0) break; const keep = rnd; rnd = rs;
        ty[i] = b; role[i] = RATT; st[i] = SSTATIC; px[i] = s.x; pz[i] = s.z; gy[i] = s.y || 0; yaw[i] = yawT[i] = yw; vel[i] = 0; kA[i] = 1; ph[i] = rs() * 100;
        scl[i] = b === BID.child ? .9 + rs() * .15 : .95 + rs() * .1; colours(i, b); rnd = keep; flags[i] = rl === 'hostess' || rl === 'waiter' ? 0 : 3; lotOf[i] = -1;
        A = { i, g: gen[i], rl, base: attAnim(s, ATT_ANIMS[rl][0]), yaw: yw, t: 0, cust: 0, rs }; anim[i] = anim0[i] = A.base; ATT.set(k, A);
        if (cp !== null) { pidOf[i] = cp; CENSUS.live.set(cp, i); mourningCols(i, cp); } }
      A.s = attStamp; attIdle(A);
    }
    for (const [k, A] of ATT) if (A.s !== attStamp) { if (alive[A.i] && gen[A.i] === A.g && role[A.i] === RATT) kill(A.i); ATT.delete(k); }
    S.att = ATT.size;
  }
  function attIdle(A) { // idle variety; greet/haggle with a walker passing within ~2 m (turn to face them), then back to the post
    const i = A.i, x = px[i], z = pz[i], gx = Math.floor(x / 1.6), gz = Math.floor(z / 1.6); let cj = -1, cd2 = 5;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let j = gHead[((((gx + a) * 73856093) ^ ((gz + b) * 19349663)) >>> 0) & (GH - 1)]; j >= 0; j = gNext[j]) {
      if (role[j] !== RW || BODIES[ty[j]].info.quad) continue; const d2 = (px[j] - x) ** 2 + (pz[j] - z) ** 2; if (d2 < cd2) { cd2 = d2; cj = j; } }
    A.t -= .5;
    if (cj >= 0 && A.cust <= 0 && A.rs() < .6) { const G = ATT_GREET[A.rl]; anim[i] = G[(A.rs() * G.length) | 0]; yawT[i] = Math.atan2(px[cj] - x, pz[cj] - z); A.cust = 3 + A.rs() * 4; A.t = A.cust;
      if (st[cj] === SW && cd[cj] <= 0 && A.rs() < .35) { st[cj] = SPAUSE; timer[cj] = 3 + A.rs() * 5; anim[cj] = A.rs() < .6 ? 11 : 3; yawT[cj] = Math.atan2(x - px[cj], z - pz[cj]); cd[cj] = 30; } return; } // a customer stops to haggle
    if (A.cust > 0) { A.cust -= .5; if (A.cust > 0) return; yawT[i] = A.yaw; anim[i] = A.base; A.t = 4 + A.rs() * 8; return; }
    if (A.t <= 0) { const L = ATT_ANIMS[A.rl]; anim[i] = A.rs() < .45 ? A.base : L[(A.rs() * L.length) | 0]; A.t = 5 + A.rs() * 10; yawT[i] = A.yaw + (anim[i] === 10 ? (A.rs() - .5) * 1.2 : (A.rs() - .5) * .3); }
  }
  // the player's feet (G.P.pos; else the camera 1.6 m below the eye); null while flying
  function playerPos() { if (typeof G !== 'undefined' && G.P && G.P.pos) return G.fly ? null : G.P.pos; const c = R.camPos; if (!c) return null; _pp[0] = c[0]; _pp[1] = c[1] - 1.6; _pp[2] = c[2]; return _pp; }
  const _pp = [0, 0, 0];
  // stuck for 4 s (blocked, jammed): out of view -> back to the abstract simulation (census) / gone (filler); in view -> step aside and re-plan
  function unstick(i, h) { if (NOSEP) return; stuckT[i] = 0; ancX[i] = px[i]; ancZ[i] = pz[i]; S.unstuck = (S.unstuck || 0) + 1;
    if (!inView(px[i], pz[i], 3)) { kill(i); return; }
    offF[i] = -offF[i]; off[i] += (rnd() < .5 ? -1 : 1) * .8; if (pidOf[i] >= 0) { censusNext(i, h); return; }
    const E = nav.edges[edge[i]], f = from[i]; from[i] = to[i]; to[i] = f; es[i] = Math.max(0, E.len - es[i]); fx[i] = -fx[i]; fz[i] = -fz[i]; off[i] = -off[i]; } // turn back
  // hard separation: no two bodies overlap (humans ~0.28 m radius, animals by body); followers keep their station next to their leader
  const movable = i => { const r = role[i]; return (r === RW || r === RPAT || r === RFOL) && st[i] !== SSTATIC || r === RW && pidOf[i] >= 0; };
  const sepR = i => B_QUAD[ty[i]] ? B_RAD[ty[i]] * .8 : .28;
  let NOSEP = null; // test toggle (?nosep: no separation, no unsticking)
  function separate(dt, camX, camZ) { if (NOSEP === null) NOSEP = typeof Q !== 'undefined' && !!Q.has && Q.has('nosep'); if (NOSEP) return;
    const mx = 2.5 * dt + .01; let pairs = 0;
    for (let i = 0; i < MAX; i++) { if (!alive[i] || !movable(i)) continue; const x = px[i], z = pz[i];
      if ((x - camX) ** 2 + (z - camZ) ** 2 > 8100 && ((i + frame) & 3)) continue; const gx = Math.floor(x / 1.6), gz = Math.floor(z / 1.6), ri = sepR(i); let sx = 0, sz = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let j = gHead[((((gx + a) * 73856093) ^ ((gz + b) * 19349663)) >>> 0) & (GH - 1)]; j >= 0; j = gNext[j]) {
        if (j === i || !alive[j] || role[j] === RDISP || role[j] === RSTAT) continue; if (role[i] === RFOL && (lead[i] === j || role[j] === RFOL && lead[j] === lead[i])) continue; if (role[j] === RFOL && lead[j] === i) continue;
        if (Math.abs(gy[j] - gy[i]) > 1.2) continue; const dx = x - px[j], dz = z - pz[j], d2 = dx * dx + dz * dz, rr = ri + sepR(j); if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-3, o = (rr - d) * (movable(j) ? .5 : 1); sx += (d2 > 1e-8 ? dx / d : Math.cos(i)) * o; sz += (d2 > 1e-8 ? dz / d : Math.sin(i)) * o; pairs++; }
      if (sx || sz) { const l = Math.hypot(sx, sz), k = l > mx ? mx / l : 1, nx = px[i] + sx * k, nz = pz[i] + sz * k; let ok = true; if (ctx.height) { try { ok = !(ctx.height(nx, nz) < -.3); } catch (e) { } } if (ok) { px[i] = nx; pz[i] = nz; } } }
    S.sepPairs = pairs;
  }
  // canal crossings (CANAL.bridges: x, z, ax, az, bx, bz along the canal = the span) on an edge: [{s along E.a->E.b, lo, hi lateral bounds (+0.5 m in)}]
  const BRL = new Map(), NOBR = [];
  function bridgeLim(e) { let r = BRL.get(e); if (r) return r; r = NOBR; const B = typeof CANAL !== 'undefined' && CANAL.bridges; if (B && B.length) { const E = nav.edges[e], A = nav.nodes[E.a], Bn = nav.nodes[E.b], L = E.len || 1, fx = (Bn.x - A.x) / L, fz = (Bn.z - A.z) / L;
      for (const b of B) { const dx = b.x - A.x, dz = b.z - A.z, s = dx * fx + dz * fz, d = Math.abs(-dx * fz + dz * fx); if (s < -4 || s > L + 4 || d > Math.max(10, (E.w || 4) / 2)) continue;
        const la = -(b.ax - A.x) * fz + (b.az - A.z) * fx, lb = -(b.bx - A.x) * fz + (b.bz - A.z) * fx, lo = Math.min(la, lb) + .5, hi = Math.max(la, lb) - .5; if (hi > lo) (r === NOBR ? (r = []) : r).push({ s, lo, hi }); } }
    BRL.set(e, r); return r; }
  // never step into a street ditch (CITY.height < -0.3): undo the step and move toward the edge's centre line (followers: toward the leader), shrinking the side offset
  let NODITCH = null; // test toggle (?noditch)
  function ditchGuard(i, ox, oz, dt) { if (NODITCH === null) NODITCH = typeof Q !== 'undefined' && !!Q.has && Q.has('noditch'); if (NODITCH) return;
    let y; try { y = ctx.height(px[i], pz[i]); } catch (e) { return; } if (!(y < -.3)) return;
    const r = role[i], E = nav.edges[edge[i]];
    if (E && (E.kind === 'gate' || E.kind === 'door')) { // gate/door edges cross the ditch on a bridge (~7.5 m wide; CITY.height has no bridges): fine within 3.2 m of the centre line
      const A = nav.nodes[r === RFOL ? E.a : from[i]], B = nav.nodes[r === RFOL ? E.b : to[i]], ex = B.x - A.x, ez = B.z - A.z, el = Math.hypot(ex, ez) || 1, lat = Math.abs((px[i] - A.x) * ez - (pz[i] - A.z) * ex) / el;
      if (lat < 3.2) return; }
    let cx, cz;
    if (r === RFOL) { const L = lead[i]; if (!alive[L]) return; cx = px[L]; cz = pz[L]; tx[i] *= .8; }
    else { const A = nav.nodes[from[i]], t = (ox - A.x) * fx[i] + (oz - A.z) * fz[i] + .3; cx = A.x + fx[i] * t; cz = A.z + fz[i] * t; off[i] *= .5; offF[i] *= .8; } // nearest point of the centre line (a little ahead)
    const dx = cx - ox, dz = cz - oz, d = Math.hypot(dx, dz), s = Math.min(d, Math.max(Math.hypot(px[i] - ox, pz[i] - oz), 1.2 * dt));
    if (d > 1e-4) { px[i] = ox + dx / d * s; pz[i] = oz + dz / d * s; } else { px[i] = ox; pz[i] = oz; }
    let y2 = 0; try { y2 = ctx.height(px[i], pz[i]); } catch (e) { } if (y2 < -.3) { let y0 = 0; try { y0 = ctx.height(ox, oz); } catch (e) { } if (y0 >= -.3) { px[i] = ox; pz[i] = oz; } } // still in: stay put on the bank
    S.ditch = (S.ditch || 0) + 1;
  }
  // ---------- census people: materialised near the player from CENSUS (census.js), released back to the abstract simulation ----------
  const CAND = [], R_CEN = R_ACT, CEN_MAX = 520; let cenAcc = 9, nCen = 0, cenRoutes = 0, lastCH = -1;
  const CEN_AT_ANIM = { well: 3, alms: 8, play: 7, sit: 5, here: 0 };
  function edgeBetween(u, v) { for (const e of nav.adj[u]) { const E = nav.edges[e]; if (E.a === v || E.b === v) return e; } return -1; }
  function mourningCols(i, pid) { if (!CENSUS.mourning(pid)) return; for (const k of [0, 1]) { const o = i * 16 + k * 4; col[o] = 236; col[o + 1] = 232; col[o + 2] = 222; } } // 素服: white mourning clothes
  function censusLook(i, p) { const keep = rnd; rnd = RNG(p.seed); colours(i, ty[i]); scl[i] = (p.age < 15 ? .78 + p.age * .012 : .94 + rnd() * .1); rnd = keep;
    if (p.rank && ty[i] === BID.official) { const c = CENSUS.rankCol(p.rank); for (let k = 0; k < 3; k++) col[i * 16 + k] = c[k] * 255; }
    mourningCols(i, p.pid); }
  function censusRelease(i) { const pid = pidOf[i]; pidOf[i] = -1; rteOf[i] = null; if (typeof CENSUS === 'undefined') return; if (CENSUS.live.get(pid) === i) CENSUS.live.delete(pid); if (role[i] === RHOME) return; // at home: no override (they may step out of the door next)
    const h = hourF(), q = CENSUS.seg(pid, h); if (q) CENSUS.override.set(pid, { day: CENSUS.dayNum, until: q.k === 'go' ? Math.min(24, q.t1 + .5) : q.t1 }); }
  // staff at a business spot: the census person who works there (owner, assistant, hostess, waiter, cook, monk), if at work now
  function censusStaff(sp, rl, h) { if (!censusOn()) return null; const lid = CENSUS.lotAt(sp.x, sp.z); if (lid < 0) return null; const L = CENSUS.lots[lid];
    const want = { keeper: ['shopkeeper', 'wine', 'innkeeper', 'director', 'madam', 'abbot', 'stall'], assistant: ['assistant', 'apprentice'], cook: ['assistant', 'apprentice', 'waiter'], waiter: ['waiter'], hostess: ['hostess'], monk: ['monk', 'nun', 'abbot'], daoist: ['daoist', 'abbot'] }[rl] || [];
    const pool = L.hh.length ? L.hh : CENSUS.people.filter(p => p.work && p.work.lot === lid).map(p => p.pid);
    for (const pid of pool) { const p = CENSUS.person(pid); if (!want.includes(p.occ) || CENSUS.live.has(pid) || CENSUS.isDead(pid)) continue; const q = CENSUS.seg(pid, h); if (q && (q.k === 'work' || q.k === 'home' && L.cls === 0)) return pid; }
    if (L.type === 'stall') for (const p of CENSUS.people) if (p.work && p.work.lot === lid && !CENSUS.live.has(p.pid) && !CENSUS.isDead(p.pid)) return p.pid;
    return null; }
  function manageCensus(dt, h, cx, cz) {
    cenAcc += dt; if (cenAcc < .5 || !nav || typeof CENSUS === 'undefined') return; cenAcc = 0;
    if (!CENSUS.built) { if (typeof CITY === 'undefined' || CITY.nav !== nav) return; CENSUS.build(); return; } // only on the city's own graph
    CENSUS.tick(h); const t0 = performance.now(); cenRoutes = 0;
    if (lastCH >= 0 && Math.abs(h - lastCH) > .3 && Math.abs(h - lastCH) < 23.5) { for (let i = 0; i < MAX; i++) if (alive[i] && pidOf[i] >= 0 && role[i] !== RATT) kill(i); CENSUS.override.clear(); } // the clock jumped (sleep, debug): re-sync from the schedules
    lastCH = h;
    // static census people ('at' the well, playing, sitting, on alms): when their time is up, walk on (next trip) or go home
    nCen = 0; for (let i = 0; i < MAX; i++) if (alive[i] && pidOf[i] >= 0 && role[i] !== RATT) { nCen++; if (role[i] === RW && st[i] === SSTATIC && h >= atUntil[i]) censusNext(i, h); }
    if (nCen >= CEN_MAX) return; const ci = camInfo();
    CENSUS.candidates(cx, cz, R_CEN, h, CAND); S.cenCand = CAND.length;
    let done = 0; for (const pid of CAND) { if (nCen >= CEN_MAX || performance.now() - t0 > 2.5 && done >= 3) break; done++; const w = CENSUS.where(pid, h); if (!w || w.state === 'live') continue;
      const dx = w.x - cx, dz = w.z - cz, d2 = dx * dx + dz * dz; if (d2 > R_CEN * R_CEN) continue; if (w.state === 'go' && !w.rt) continue;
      const d = Math.sqrt(d2), seen = d < 75 && dx * ci[2] + dz * ci[3] > -d * .2; // in front of the camera and near: only allowed when stepping out of a door
      if (w.state === 'go') { const fromDoor = nav.nodes[w.seg.a].kind === 'door' && w.d < 4; if (seen && !fromDoor) continue; if (spawnCensusGo(pid, w, h, fromDoor) >= 0) nCen++; }
      else if (w.state === 'at' && !seen && spawnCensusAt(pid, w, h) >= 0) nCen++; }
    S.cenMs = performance.now() - t0; S.cen = nCen;
  }
  function censusAgent(pid, b, x, z) { const p = CENSUS.person(pid), i = newAgent(b, RW, x, z); if (i < 0) return -1; pidOf[i] = pid; CENSUS.live.set(pid, i); censusLook(i, p); flags[i] = (b === BID.man || b === BID.official) ? 1 | 2 : b === BID.woman ? 2 : flags[i] & ~1; return i; }
  function spawnCensusGo(pid, w, h, fromDoor) {
    const p = CENSUS.person(pid), rt = w.rt, N = rt.nodes; if (N.length < 2) return -1; let k = Math.min(w.k, N.length - 2), e = edgeBetween(N[k], N[k + 1]); if (e < 0) return -1;
    const ride = w.seg.ride && p.occ === 'official', b = ride ? BID.horse : BID[p.type] ?? BID.man, i = censusAgent(pid, b, w.x, w.z); if (i < 0) return -1;
    rteOf[i] = rt; rk[i] = k; placeOnEdge(i, e, fromDoor ? -4.5 + w.d : w.d - rt.cum[k], N[k]); home[i] = 1;
    if (ride) { flags[i] = 0; const c = CENSUS.rankCol(p.rank || 9); for (let q = 0; q < 3; q++) col[i * 16 + 8 + q] = c[q] * 255; // the rider's 袍 (slot 3) in his rank colour
      (p.retinue || []).forEach((r, j) => { if (CENSUS.isDead(r) || CENSUS.live.has(r)) return; const rp = CENSUS.person(r), f = follower(i, BID[rp.type] ?? BID.man, j === 0 ? .85 : (j & 1 ? .75 : -.75), j === 0 ? .7 : -1.6 - (j >> 1) * 1.1); if (f >= 0) { pidOf[f] = r; CENSUS.live.set(r, f); censusLook(f, rp); flags[f] = j === 0 ? 1 : 3; } }); }
    return i;
  }
  function spawnCensusAt(pid, w, h) {
    const p = CENSUS.person(pid), n = w.seg.a, N = nav.nodes[n]; if (!N) return -1; let ox = 0, oz = 0; const adj = nav.adj[n]; if (adj.length) { const E = nav.edges[adj[0]], o = nav.nodes[E.a === n ? E.b : E.a], l = Math.hypot(o.x - N.x, o.z - N.z) || 1; ox = (o.x - N.x) / l * 1.6; oz = (o.z - N.z) / l * 1.6; }
    const ha = (pid * 2654435761 >>> 0) / 4294967296 * TAU, hr = .7 + ((pid * 40503 >>> 0) % 997) / 997 * 1.6, b = BID[p.type] ?? BID.man, i = censusAgent(pid, b, N.x + ox + Math.cos(ha) * hr, N.z + oz + Math.sin(ha) * hr); if (i < 0) return -1; // spread around the point
    st[i] = SSTATIC; edge[i] = adj.length ? adj[0] : 0; from[i] = n; to[i] = n; vel[i] = 0; gy[i] = groundAt(px[i], pz[i]); yaw[i] = yawT[i] = rnd() * TAU; anim[i] = anim0[i] = CEN_AT_ANIM[w.act] ?? (w.act === 'well' ? 3 : 0); if (anim[i] === 7) { anim[i] = anim0[i] = rnd() < .5 ? 7 : 0; }
    atUntil[i] = w.seg.t1; home[i] = 1; return i;
  }
  // walking a census route: next edge, or the end of the trip
  function censusArrive(i, h) {
    const rt = rteOf[i], N = rt.nodes, k = ++rk[i], pid = pidOf[i];
    const atDoorStop = k === N.length - 2 && nav.nodes[N[k + 1]].kind === 'door' && (() => { const q2 = CENSUS.seg(pid, h); return q2 && q2.k === 'at'; })(); // standing at someone's gate (alms): wait on the street side, not in the doorway
    if (k < N.length - 1 && !atDoorStop) { const e = edgeBetween(N[k], N[k + 1]); if (e >= 0) { setEdge(i, e, N[k]); return; } }
    const end = N[N.length - 1], node = atDoorStop ? nav.nodes[N[k]] : nav.nodes[end], q = CENSUS.seg(pid, h);
    if (node.kind === 'door' && !(q && q.k === 'at')) { st[i] = SENTER; timer[i] = 7 / Math.max(.5, spd[i]); rteOf[i] = null; return; } // into the lot (home, work, a visit, the market)
    if (q && (q.k === 'in' || q.k === 'home' || q.k === 'work' || q.k === 'go')) { // a compound without a nav door (temple, 北里, 進奏院, mansion): walk in toward its middle
      const lid = q.k === 'home' ? CENSUS.person(pid).home : q.lot, L = lid >= 0 ? CENSUS.lots[lid] : null; if (L) { const cx = (L.r.x0 + L.r.x1) / 2 - px[i], cz = (L.r.z0 + L.r.z1) / 2 - pz[i], l = Math.hypot(cx, cz) || 1; fx[i] = cx / l; fz[i] = cz / l; }
      if (q.k !== 'go' || L) { st[i] = SENTER; timer[i] = 7 / Math.max(.5, spd[i]); rteOf[i] = null; return; } }
    if (q && q.k === 'off' || q && q.act === 'to court') { st[i] = SENTER; timer[i] = 25 / Math.max(.5, spd[i]); rteOf[i] = null; return; } // off the slice
    // stand here (the well, a door on the alms round, play): until the abstract schedule moves on
    rteOf[i] = null; st[i] = SSTATIC; vel[i] = 0; const a = q && q.k === 'at' ? q.act : 'here'; anim[i] = anim0[i] = BODIES[ty[i]].info.quad ? 40 : CEN_AT_ANIM[a] ?? 0; atUntil[i] = q && q.k === 'at' ? q.t1 : h + .25; yawT[i] = yaw[i] + (rnd() - .5);
  }
  function censusNext(i, h) {
    const pid = pidOf[i], p = CENSUS.person(pid), q = CENSUS.seg(pid, h); let a = from[i], b = -1;
    if (q && q.k === 'go') { a = q.a; b = q.b; } else b = CENSUS.lots[p.home].door; // walk home
    if (b < 0 || a === b) { st[i] = SENTER; timer[i] = 3; return; }
    const rt = CENSUS.route(a, b); if (!rt || rt.nodes.length < 2) { st[i] = SENTER; timer[i] = 3; return; } const e = edgeBetween(rt.nodes[0], rt.nodes[1]); if (e < 0) { st[i] = SENTER; timer[i] = 3; return; }
    rteOf[i] = rt; rk[i] = 0; setEdge(i, e, rt.nodes[0]); st[i] = SW; anim[i] = anim0[i] = BODIES[ty[i]].info.quad ? 41 : 1;
  }
  // ---------- people at home: census residents materialised inside their own house near the player (asleep at night, home life by day) ----------
  // Static instances (role RHOME). Placement: chunk-meta spots {kind: bed|seat|hearth|work} when the architecture provides them, else points
  // found in the loaded collision world: covered (a roof above), clear of walls and furniture (World.push), on the floor (World.ground).
  const RHOME = 7, HOMES = new Map(), LAYOUT = new Map(), NEARL = []; let homeAcc = 9;
  const HOME_TYPES = new Set(['house', 'hut', 'rich', 'mansion', 'shop', 'wineshop', 'inn', 'temple', 'jinzou', 'quarter']);
  const H_R = 40, H_OUT = 48;
  function lotLayout(lid) {
    let Lo = LAYOUT.get(lid); if (Lo) return Lo; const C = typeof CITY !== 'undefined' ? CITY : null, W = C && C.world; if (!W || !C.chunkAt) return null;
    const L = CENSUS.lots[lid], R = L.r, loaded = (x, z) => { const c = C.chunkAt(x, z); return !c || (c.m0 && c.world); }; if (!loaded((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2)) return null; // collision not loaded yet
    const pts = [], yard = [], beds = [], seats = [], hearths = [], works = [], inR = (x, z, m = 0) => x > R.x0 + m && x < R.x1 - m && z > R.z0 + m && z < R.z1 - m;
    // furnishing spots from chunk meta (architecture): bed (centre, lying surface y, yaw = head direction, game convention), seat (榻), hearth, work (loom); matched by lot seed
    for (const sp of C.metaNear ? C.metaNear((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, Math.max(R.x1 - R.x0, R.z1 - R.z0) / 2 + 4, 'spots') : []) { if (!sp.kind || !(sp.lot === L.seed || sp.lot === undefined && inR(sp.x, sp.z))) continue;
      const o = { x: sp.x, z: sp.z, y: sp.y || 0, cy: (sp.yaw || 0) + PI, ax: -Math.sin(sp.yaw || 0), az: -Math.cos(sp.yaw || 0), room: sp.room }; ({ bed: beds, seat: seats, hearth: hearths, work: works })[sp.kind]?.push(o); }
    const fits = q => !W.push(q.x, q.z, .2, q.y + .06, q.y + 1.1)[2]; // a sitter/cook here touches no wall, screen or furniture
    const clear = (x, z, y, r) => { const g = W.ground(x, z, y + .3, .35, 0).y; if (Math.abs(g - y) > .07) return false; return !W.push(x, z, r, y + .06, y + 1.0)[2]; };
    const covered = (x, z, y) => { const g = W.ground(x, z, y + .05, .1, 0), sp = g.s; return W.ceil(x, z, y, y + 1.7) < y + 7 || !!(sp && sp.k === 0 && Math.min(sp.hx, sp.hz) > 1.2 && y - W.heightAt(x, z) > .08); }; // under a roof, or on a building's floor platform (roofs carry no collision)
    const st = .9; for (let x = R.x0 + .7; x < R.x1 - .6; x += st) for (let z = R.z0 + .7; z < R.z1 - .6; z += st) { if (!loaded(x, z)) continue; const t0 = W.heightAt(x, z); if (!(t0 > -50)) continue; const y = W.ground(x, z, t0 + .65, .1, 0).y;
      if (!clear(x, z, y, .36)) continue; (covered(x, z, y) ? pts : yard).push({ x, z, y }); }
    // lying slots (floor mats; beds from meta first): 1.9 m x 0.6 m clear, along the lot axes
    const lie = []; const lieOK = (x, z, y, ax, az) => { for (const t of [-.75, 0, .75]) if (!clear(x + ax * t, z + az * t, y, .22)) return false; return true; };
    for (const b of beds) { const px2 = -b.az * .27, pz2 = b.ax * .27; lie.push({ x: b.x, z: b.z, y: b.y, ax: b.ax, az: b.az, bed: true, room: b.room, double: lieOK(b.x + px2, b.z + pz2, b.y, b.ax, b.az) && lieOK(b.x - px2, b.z - pz2, b.y, b.ax, b.az) }); }
    for (const p of pts) { if (lie.length > 24) break; for (const [ax, az] of [[1, 0], [0, 1]]) if (lieOK(p.x, p.z, p.y, ax, az)) { lie.push({ x: p.x, z: p.z, y: p.y, ax, az }); break; } }
    Lo = { lid, pts, yard, lie, seats: seats.filter(fits), hearths: hearths.filter(fits), works: works.filter(fits), clear, lieOK, covered }; LAYOUT.set(lid, Lo); if (LAYOUT.size > 400) LAYOUT.delete(LAYOUT.keys().next().value); return Lo;
  }
  const isNight = h => h >= 21.3 || h < 5.1;
  function homeAct(p, h, L) { // what a resident does at home now: [anim, where: 'lie'|'seat'|'yard'|'hearth']
    if (isNight(h) && !(L.type === 'quarter' && (h >= 21.3 || h < 1.5))) return [25, 'lie'];
    if (L.type === 'quarter') return [p.occ === 'courtesan' ? 20 : 24, 'seat'];
    const r = ((p.seed >>> 3) + Math.floor(h * 2)) % 7;
    if (p.occ === 'child') return [r < 3 ? 12 : r < 5 ? 0 : 10, 'yard'];
    if (p.occ === 'elder') return [r < 3 ? 26 : 18, r < 3 ? 'lie' : 'seat'];
    if (p.occ === 'wife' || p.occ === 'daughter' || p.occ === 'maid' || p.occ === 'nun') return r < 2 ? [28, 'hearth'] : r < 3 ? [27, 'work'] : [r < 5 ? 27 : 24, 'seat'];
    if (p.role === 'servant' || p.occ === 'manservant' || p.occ === 'groom' || p.occ === 'apprentice') return [r < 3 ? 6 : 0, 'yard'];
    if (p.occ === 'candidate' || p.occ === 'scholar' || p.occ === 'official' || p.occ === 'clerk') return [r < 4 ? 22 : 24, 'seat'];
    if (p.occ === 'monk' || p.occ === 'abbot' || p.occ === 'daoist') return [18, 'seat'];
    return [r < 3 ? 24 : r < 5 ? 23 : 18, 'seat'];
  }
  function homeSpawn(pid, p, L, Lo, act, used, pp) {
    let [an, wh] = act; const rs = RNG(p.seed * 7 + 3); let x, z, y, a, slot = null, lat = 0;
    if (wh === 'lie') { // couples side by side; children next to their mother
      const partner = HOMES.get(p.role === 'wife' ? pp.head : -1), sl = Lo.lie.find(q => !used.has(q));
      if (partner && partner.slot && partner.slot.base) { const q = partner.slot.base; if (q.double && partner.lat < 0) { slot = q; lat = .27; }
        else if (!q.bed) { const ox = -q.az * .62, oz = q.ax * .62; if (Lo.lieOK(q.x + ox, q.z + oz, q.y, q.ax, q.az)) { slot = { x: q.x + ox, z: q.z + oz, y: q.y, ax: q.ax, az: q.az }; } } }
      if (!slot && sl) { slot = sl; used.add(sl); if (sl.double && p.role === 'head' && L.hh.some(w => CENSUS.person(w).role === 'wife' && !CENSUS.isDead(w))) lat = -.27; } if (!slot) return -1;
      const side = an === 25, hx = slot.ax, hz = slot.az; x = slot.x + hx * .1 - hz * lat; z = slot.z + hz * .1 + hx * lat; y = slot.y + (slot.bed ? 0 : .02); a = side ? Math.atan2(hz, -hx) : Math.atan2(-hx, -hz); slot = { base: slot }; }
    else { const src = wh === 'yard' ? (Lo.yard.length ? Lo.yard : Lo.pts) : wh === 'hearth' && Lo.hearths.some(q => !used.has(q)) ? Lo.hearths : wh === 'work' && Lo.works.some(q => !used.has(q)) ? Lo.works : Lo.seats.some(q => !used.has(q)) ? Lo.seats : Lo.pts;
      if (src !== Lo.hearths && an === 28) an = 27; /* no free hearth: sew instead */ let cand = src.filter(q => !used.has(q));
      if (src === Lo.pts && wh !== 'yard') { if (p.home !== L.id) return -1; /* a guest without a seat stays out of sight */ an = (p.seed & 1) ? 3 : 0; // no seat left: stand (or talk) on clear floor, apart from the others
        cand = cand.filter(q => { for (const u of used) if (u.x !== undefined && (q.x - u.x) ** 2 + (q.z - u.z) ** 2 < 1.6) return false; return true; }); }
      if (!cand.length) return -1;
      slot = cand[(rs() * cand.length) | 0]; if (p.home !== L.id && wh === 'seat') { let bd = 1e9; for (const q of cand) for (const u of used) { if (u.x === undefined) continue; const d = (q.x - u.x) ** 2 + (q.z - u.z) ** 2; if (d < bd) { bd = d; slot = q; } } } // a guest sits by someone of the house
      used.add(slot); x = slot.x; z = slot.z; y = slot.y; a = slot.cy !== undefined ? slot.cy : rs() * TAU; }
    const b = BID[p.type] ?? BID.man, i = alloc(); if (i < 0) return -1;
    ty[i] = b; role[i] = RHOME; st[i] = SSTATIC; px[i] = x; pz[i] = z; gy[i] = y; yaw[i] = yawT[i] = a; vel[i] = 0; kA[i] = 1; ph[i] = rs() * 100; lotOf[i] = -1;
    censusLook(i, p); flags[i] = 3; anim[i] = anim0[i] = an; pidOf[i] = pid; CENSUS.live.set(pid, i); return { i, g: gen[i], slot, an: act[0], lat };
  }
  function homeVisibleSpot(x, z, y, L, Lo, pp) { const R = L.r, inside = pp && pp[0] > R.x0 && pp[0] < R.x1 && pp[2] > R.z0 && pp[2] < R.z1; return inView(x, z, 2) && (inside || !Lo.covered(x, z, y)); } // seen: in the view cone and either the player is in the lot or the spot is open to the sky
  function manageHomes(dt, h) {
    homeAcc += dt; if (homeAcc < 1 || mode !== 'city' || !censusOn()) return; homeAcc = 0; const t0 = performance.now(), pp = playerPos(); if (!pp) return;
    const lots = CENSUS.lotsNear(pp[0], pp[2], H_R, NEARL), want = new Set();
    for (const lid of lots) { const L = CENSUS.lots[lid]; if (!HOME_TYPES.has(L.type) || !L.hh.length || (API.skipLot && API.skipLot(lid))) continue; const Lo = lotLayout(lid); if (!Lo) continue;
      const used = new Set(), hh = { head: -1 }; for (const pid of L.hh) if (CENSUS.person(pid).role === 'head') hh.head = pid;
      for (const H of HOMES.values()) if (H.lot === lid && H.slot) used.add(H.slot.base || H.slot);
      const vis = CENSUS.visitors ? CENSUS.visitors(lid, h) : [];
      for (const pid of vis.length ? L.hh.concat(vis) : L.hh) { const p = CENSUS.person(pid); if (CENSUS.isDead(pid)) continue; const q = CENSUS.seg(pid, h); if (!q) continue;
        const guest = p.home !== lid, atHome = guest ? q.k === 'in' && q.lot === lid : q.k === 'home' || (q.k === 'in' || q.k === 'work') && q.lot === lid && !(L.cls && CITY.isOpen && CITY.isOpen(L.cls, h)); if (!atHome) continue;
        const act = guest ? [((p.seed >>> 5) & 1) ? 23 : 24, 'seat'] : homeAct(p, h, L), cur = HOMES.get(pid); want.add(pid); // a guest drinks or talks, seated
        if (cur) { if (alive[cur.i] && gen[cur.i] === cur.g) { if (cur.an !== act[0] && !homeVisibleSpot(px[cur.i], pz[cur.i], gy[cur.i], L, Lo, pp)) { kill(cur.i); HOMES.delete(pid); } else continue; } else HOMES.delete(pid); }
        if (CENSUS.live.has(pid) || performance.now() - t0 > 3) continue;
        const H = homeSpawn(pid, p, L, Lo, act, used, hh); if (!H || H === -1) continue;
        if (homeVisibleSpot(px[H.i], pz[H.i], gy[H.i], L, Lo, pp)) { kill(H.i); if (H.slot) used.delete(H.slot); continue; } // would pop up in view: later
        H.lot = lid; HOMES.set(pid, H); } }
    for (const [pid, H] of HOMES) { if (API.skipLot && API.skipLot(H.lot)) { if (alive[H.i] && gen[H.i] === H.g) kill(H.i); HOMES.delete(pid); continue; } if (want.has(pid) && alive[H.i] && gen[H.i] === H.g) continue; if (alive[H.i] && gen[H.i] === H.g) { const L = CENSUS.lots[H.lot], Lo = LAYOUT.get(H.lot); if (Lo && homeVisibleSpot(px[H.i], pz[H.i], gy[H.i], L, Lo, pp)) continue; kill(H.i); } HOMES.delete(pid); }
    S.homes = HOMES.size; S.homeMs = performance.now() - t0;
  }
  // ---------- per-frame update ----------
  function gridBuild() { gHead.fill(-1); for (let i = 0; i < MAX; i++) { if (!alive[i]) continue; const k = (((Math.floor(px[i] / 1.6) * 73856093) ^ (Math.floor(pz[i] / 1.6) * 19349663)) >>> 0) & (GH - 1); gNext[i] = gHead[k]; gHead[k] = i; } }
  function avoid(i, dt) { // light separation: shift lateral offset away from neighbours ahead, slow down behind slower ones; trigger chats
    const x = px[i], z = pz[i], gx = Math.floor(x / 1.6), gz = Math.floor(z / 1.6), ri = B_RAD[ty[i]]; let slow = 1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { let j = gHead[((((gx + a) * 73856093) ^ ((gz + b) * 19349663)) >>> 0) & (GH - 1)];
      for (; j >= 0; j = gNext[j]) { if (j === i) continue; const dx = px[j] - x, dz = pz[j] - z, d2 = dx * dx + dz * dz, rr = ri + B_RAD[ty[j]] + .3; if (d2 > Math.max(rr * rr, 2.6) || (role[j] === RFOL && lead[j] === i)) continue; const close = d2 < rr * rr;
        const ahead = dx * fx[i] + dz * fz[i], side = -dx * fz[i] + dz * fx[i]; // side > 0: j is to my right
        if (close && ahead > -.2) { off[i] -= (side >= 0 ? 1 : -1) * dt * 1.6; if (ahead > 0) slow = Math.min(slow, d2 < rr * rr * .5 ? .15 : .55); }
        // chat: two walking humans meeting head-on
        if (st[i] === SW && st[j] === SW && role[i] === RW && role[j] === RW && cd[i] <= 0 && cd[j] <= 0 && !B_QUAD[ty[i]] && !B_QUAD[ty[j]] && fx[i] * fx[j] + fz[i] * fz[j] < -.5 && ahead > 0 && d2 > .95 && d2 < 2.4) {
          cd[i] = cd[j] = 20 + rnd() * 30; if (rnd() < .3 && !home[i] && !home[j]) { const T = 4 + rnd() * 10; st[i] = st[j] = SPAUSE; timer[i] = timer[j] = T; anim[i] = rnd() < .2 ? 8 : 3; anim[j] = rnd() < .5 ? 3 : 11; yawT[i] = Math.atan2(dx, dz); yawT[j] = Math.atan2(-dx, -dz); } } } }
    // the player
    const PP = playerPos(); if (PP) { const dx = PP[0] - x, dz = PP[2] - z, d2 = dx * dx + dz * dz; if (d2 < 9 && Math.abs(PP[1] - gy[i]) < 1.8) { const ahead = dx * fx[i] + dz * fz[i], side = -dx * fz[i] + dz * fx[i]; // step aside for the player (from ~3 m ahead; firmly within 1.2 m)
      if (ahead > -.3 && Math.abs(side) < 1.1) { off[i] -= (side >= 0 ? 1 : -1) * dt * (d2 < 1.44 ? 2.8 : 1.4); if (ahead > 0 && d2 < 1.44) slow = Math.min(slow, d2 < .6 ? .1 : .5); } } }
    const E = nav.edges[edge[i]], m = Math.max(0, margin(E.kind, E.w)); off[i] = clamp(off[i] + (offF[i] * m - off[i]) * dt * .25, -m, m);
    const BL = bridgeLim(edge[i]); if (BL.length) { const fwd = from[i] === E.a; for (const q of BL) { const s2 = fwd ? es[i] : E.len - es[i]; if (Math.abs(s2 - q.s) > 16) continue; // canal bridge ahead/under: funnel onto its span
      const lo = fwd ? q.lo : -q.hi, hi = fwd ? q.hi : -q.lo; off[i] = clamp(off[i], lo, hi); } }
    return slow;
  }
  // advance the animation phase from the actual ground speed so feet don't slide (VS_CROWD: stance = linear thigh sweep ±A over half a cycle)
  const stepEv = [], STEPS_MAX = 64; let nStep = 0, nStepOut = 0; for (let k = 0; k < STEPS_MAX; k++) stepEv.push({ x: 0, y: 0, z: 0, s: 0 });
  function footfall(i, v, quad) { const c = R.camPos; if (!c || (px[i] - c[0]) ** 2 + (pz[i] - c[2]) ** 2 > 2025) return;
    const st = quad ? clamp(.35 + v * .25, .3, 1) * (ty[i] === BID.horse || ty[i] === BID.oxcart || ty[i] === BID.camel ? 1 : .7) : clamp((v - .7) / 2.2, .08, 1);
    if (nStep < STEPS_MAX) { const e = stepEv[nStep++]; e.x = px[i]; e.y = gy[i]; e.z = pz[i]; e.s = st; } if (API.onStep) try { API.onStep(px[i], gy[i], pz[i], st, quad && (ty[i] === BID.horse || ty[i] === BID.horsewoman || ty[i] === BID.donkey || ty[i] === BID.oxcart) ? 1 : 0); } catch (e) { } } // 5th: a hoofed animal (hoof sounds in core)
  function gait(i, v, dt) {
    const b = ty[i], L = B_LEG[b] * scl[i], p0 = ph[i];
    if (B_QUAD[b]) { anim[i] = v < .06 ? (anim0[i] === 43 ? 43 : 40) : v > 2.1 ? 42 : 41; kA[i] = clamp(v / .9, 0, 1); const amp = .64 * (anim[i] === 42 ? 1.35 : 1) * Math.max(kA[i], .25); ph[i] += v > 2.1 ? dt * TAU * v / (L * (1.2 + .45 * v)) : dt * TAU * .6 * v / (amp * L + .01); // trot / gallop: the stride lengthens with speed (horse: ~1.4 strides/s at 4 m/s, ~1.8 at 11 m/s; it was 2.9 and 7.5)
      if (Math.floor(ph[i] / (PI / 2)) !== Math.floor(p0 / (PI / 2)) && v > .2) footfall(i, v, 1); return; }
    const run = anim0[i] === 7; kA[i] = run ? .55 : clamp(.18 + v * .24, .2, .5); const st = run ? .38 : .5, Bk = run ? .55 : .4; // VS_CROWD: thigh sweeps +A .. -Bk·A in stance
    ph[i] += dt * Math.PI * v * (run ? st * 2 : 1) / (L * (Math.sin(kA[i]) + Math.sin(Bk * kA[i])) + .001);
    if (Math.floor(ph[i] / PI) !== Math.floor(p0 / PI) && v > .3) footfall(i, v, 0);
  }
  function update(dt) {
    nStep = 0; if (!nav || mode !== 'city') return; const t0 = performance.now(), h = hourF(); frame++;
    try {
      tAcc += dt; if (tAcc > .25 || !filled) { tAcc = 0; const tm = performance.now(); manage(h); S.tm = performance.now() - tm; S.tman += S.tm; S.nman++; S.tmx = Math.max(S.tmx || 0, S.tm); }
      fillNodeY(); gridBuild(); const shutNow = gatesShut(h), PPn = playerPos(), camX = R.camPos ? R.camPos[0] : 0, camZ = R.camPos ? R.camPos[2] : 0; manageAtt(dt, h, camX, camZ); manageCensus(dt, h, camX, camZ); manageHomes(dt, h);
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) continue; const r = role[i];
        if (cd[i] > 0) cd[i] -= dt;
        if (r === RSTAT || r === RHOME) continue;
        if (r === RDISP) { if (st[i] === SW) gait(i, spd[i], dt); continue; }
        if (st[i] === SSTATIC) { yaw[i] += angd(yawT[i], yaw[i]) * Math.min(1, dt * 3); continue; }
        const ox = px[i], oz = pz[i];
        if (r === RFOL) { // keep station beside/behind the leader
          const L = lead[i]; if (!alive[L]) continue; const cy = Math.cos(yaw[L]), sy = Math.sin(yaw[L]);
          const gx = px[L] + cy * tx[i] + sy * tz[i], gz = pz[L] - sy * tx[i] + cy * tz[i], dx = gx - px[i], dz = gz - pz[i], d = Math.hypot(dx, dz);
          if (st[L] === SPAUSE || vel[L] < .05) { if (d > .3) { const s = Math.min(d, sp0[i] * dt); px[i] += dx / d * s; pz[i] += dz / d * s; } if (vel[L] < .05 && d < .4) yawT[i] = st[L] === SPAUSE ? yawT[L] : yaw[L]; }
          else { const s = Math.min(d, Math.min(vel[L] + d * .5, Math.max(1.7, vel[L] * 1.1)) * dt); if (d > 1e-4) { px[i] += dx / d * s; pz[i] += dz / d * s; } yawT[i] = yaw[L]; }
          fx[i] = Math.sin(yaw[L]); fz[i] = Math.cos(yaw[L]); edge[i] = edge[L]; anim[i] = st[L] === SPAUSE ? (rnd() < .01 ? 3 : anim[i]) : anim0[i];
          if (st[L] === SPAUSE && anim[i] !== 3) anim[i] = 0; if (st[L] !== SPAUSE) anim[i] = anim0[i];
        } else if (st[i] === SPAUSE) {
          timer[i] -= dt; if (timer[i] <= 0) { st[i] = SW; anim[i] = anim0[i]; }
        } else if (st[i] === SENTER) { // walking into a compound / out through a ward gate; vanish only when nobody can see it
          if (timer[i] > 0) { cur[i] += (spd[i] - cur[i]) * Math.min(1, dt * 1.5); const nx = px[i] + fx[i] * cur[i] * dt, nz = pz[i] + fz[i] * cur[i] * dt, W = typeof G !== 'undefined' && G.world;
            // the first steps in are checked against walls too (they walked straight through shop partitions, and the ones stopped made a queue)
            if (W && (px[i] - camX) ** 2 + (pz[i] - camZ) ** 2 < 3600 && W.push(nx, nz, .22, gy[i] + .1, gy[i] + 1.6, .45)[2]) { cur[i] = 0; anim[i] = anim0[i] === 41 ? 40 : 0; timer[i] = -5.2; } // blocked: stand a moment in the doorway, then go in (below)
            else { px[i] = nx; pz[i] = nz; timer[i] -= dt; } }
          else { if (timer[i] > -6) { timer[i] -= dt; const sp = .55, nx = px[i] + fx[i] * sp * dt, nz = pz[i] + fz[i] * sp * dt, W = typeof G !== 'undefined' && G.world;
              // on into the compound, slowly — but never through a wall: near the camera the step is checked against the collision world
              if (W && (px[i] - camX) ** 2 + (pz[i] - camZ) ** 2 < 3600 && W.push(nx, nz, .22, gy[i] + .1, gy[i] + 1.6, .45)[2]) { cur[i] = 0; anim[i] = anim0[i] === 41 ? 40 : 0; timer[i] = Math.min(timer[i], -6); }
              else { px[i] = nx; pz[i] = nz; cur[i] = sp; } } else anim[i] = anim0[i] === 41 ? 40 : 0;
            if (!inView(px[i], pz[i], 3) || timer[i] <= -6) { kill(i); continue; } } // gone in: out of view at once, in view after a moment in the doorway (they used to wait there, blocking the way)
        } else { // walk along the edge
          let slow = avoid(i, dt); if (home[i] && drums(h)) slow *= 1.2;
          // kids burst into a run now and then
          if (ty[i] === BID.child && anim0[i] !== 7 && rnd() < dt * .006) { anim0[i] = anim[i] = 7; spd[i] = 2.2 + rnd() * .6; timer[i] = 1.5 + rnd() * 2; } else if (ty[i] === BID.child && anim0[i] === 7 && (timer[i] -= dt) < 0 && !drums(h)) { anim0[i] = anim[i] = 1; spd[i] = sp0[i]; }
          if (!turned[i] && shutNow && pidOf[i] < 0 && nav.edges[edge[i]].kind === 'gate') { // the gate has closed: turn back (wards keep their night life inside)
            const E = nav.edges[edge[i]], f = from[i]; from[i] = to[i]; to[i] = f; es[i] = Math.max(0, E.len - es[i]); fx[i] = -fx[i]; fz[i] = -fz[i]; off[i] = -off[i]; turned[i] = 1; }
          if (anim0[i] === 7 && cur[i] < 1.6) anim[i] = 1; else anim[i] = anim0[i];
          cur[i] += (spd[i] * slow - cur[i]) * Math.min(1, dt * (slow < 1 ? 3 : 1.4)); es[i] += cur[i] * dt; const E = nav.edges[edge[i]];
          if (es[i] >= E.len) { es[i] -= E.len; arrive(i, h); if (!alive[i] || st[i] === SENTER) continue; }
          const A = nav.nodes[from[i]]; let gx = A.x + fx[i] * es[i] - fz[i] * off[i], gz = A.z + fz[i] * es[i] + fx[i] * off[i];
          const k = Math.min(1, dt * 4.5); let mx = (gx - px[i]) * k, mz = (gz - pz[i]) * k; const ml = Math.hypot(mx, mz), mm = (cur[i] * 1.08 + .06) * dt; if (ml > mm) { mx *= mm / ml; mz *= mm / ml; } px[i] += mx; pz[i] += mz;
        }
        if (PPn && st[i] !== SENTER) { const dx = px[i] - PPn[0], dz = pz[i] - PPn[2], d2 = dx * dx + dz * dz, rr = .45 + B_RAD[ty[i]]; if (d2 < rr * rr && d2 > 1e-6 && Math.abs(PPn[1] - gy[i]) < 1.8) { const d = Math.sqrt(d2), k = Math.min(rr - d, 1.6 * dt) / d; px[i] += dx * k; pz[i] += dz * k; } } // don't stand inside the player
        if (ctx.height && (st[i] !== SENTER || nav.edges[edge[i]].kind === 'gate') && (px[i] !== ox || pz[i] !== oz) && (((i + frame) & 1) === 0 || (px[i] - camX) ** 2 + (pz[i] - camZ) ** 2 < 6400)) ditchGuard(i, ox, oz, dt);
        const dx = px[i] - ox, dz = pz[i] - oz, v = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 1e-4);
        vel[i] += (v - vel[i]) * Math.min(1, dt * 8);
        if (st[i] === SW && (r === RW || r === RPAT)) { if ((px[i] - ancX[i]) ** 2 + (pz[i] - ancZ[i]) ** 2 > .25) { ancX[i] = px[i]; ancZ[i] = pz[i]; stuckT[i] = 0; } else { stuckT[i] += dt; if (stuckT[i] > 4) unstick(i, h); } } else { stuckT[i] = 0; ancX[i] = px[i]; ancZ[i] = pz[i]; } // no net progress (blocked or jostling in place) for 4 s
        if (st[i] === SW || st[i] === SENTER || r === RFOL) { if (v > .15 && r !== RFOL) yawT[i] = Math.atan2(dx, dz); gait(i, vel[i], dt); }
        yaw[i] += angd(yawT[i], yaw[i]) * Math.min(1, dt * 5);
        if (((i + frame) & 3) === 0 || (px[i] - camX) ** 2 + (pz[i] - camZ) ** 2 < 1600) gy[i] = groundOf(i);
      }
      separate(dt, camX, camZ);
    } catch (e) { console.error('CROWD.update', e); nav = null; }
    S.ms = S.ms * .95 + (performance.now() - t0) * .05;
    if ((frame & 15) === 0 && typeof G !== 'undefined' && G.debug && (!G.dbgText || G.dbgText.startsWith('crowd'))) G.dbgText = 'crowd ' + S.agents + '/' + S.target + ' drawn ' + S.drawn + ' ' + S.ms.toFixed(2) + 'ms';
  }
  const angd = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
  // ---------- draw ----------
  let lastFillT = -1, lastFillMode = null;
  const drawList = [], shC = new Int32Array(MAX); let nShC = 0;
  function issue() { // all batches in one go: shared program setup; the far LOD casts no shadow
    const sh = R.shadowing; drawList.length = 0; for (const B of BODIES) { const b0 = B.batches[0]; if (sh ? b0.n : b0.nVis) drawList.push(b0); if (!sh && B.batches[1].n) drawList.push(B.batches[1]); }
    for (let k = 0; k < drawList.length; k++) R.drawCrowd(drawList[k], k < drawList.length - 1);
  }
  function draw() {
    if (!BODIES.length) return; const interior = mode !== 'city';
    // the shadow pass draws the crowd again (per cascade): fill + upload the instances once per frame, then only re-issue the draws
    if (R.time === lastFillT && lastFillMode === interior) { issue(); return; }
    lastFillT = R.time; lastFillMode = interior; const lodD = typeof Q !== 'undefined' && Q.has('lod') ? +Q.get('lod') : LOD_D; // ?lod=0 forces the far LOD (inspection)
    try {
      for (const B of BODIES) { B.batches[0].n = 0; B.batches[1].n = 0; B.batches[0].dirty = true; B.batches[1].dirty = true; }
      const c = R.camPos, cfx = -Math.sin(R.camYaw) * Math.cos(R.camPitch), cfz = -Math.cos(R.camYaw) * Math.cos(R.camPitch), cfy = Math.sin(R.camPitch), tn = Math.tan(Math.min((R.curFov || 1.3) * .5 * R.W / R.H, 1.5) + .08);
      let drawn = 0; nShC = 0;
      // shadow reach: people's shadows stretch away from the sun (≈ height / tan elevation, capped)
      const sd = R.env && R.env.sunD, shOn = !!(sd && sd[1] > .03 && R.sh && R.sh.on) && !(typeof Q !== 'undefined' && Q.has('nocast')), sl = shOn ? Math.min(28, 2 / sd[1] * Math.hypot(sd[0], sd[2])) : 0, sn = shOn ? Math.hypot(sd[0], sd[2]) || 1 : 1;
      const shX = shOn ? -sd[0] / sn * sl : 0, shZ = shOn ? -sd[2] / sn * sl : 0, shL = sl;
      for (let i = 0; i < MAX; i++) {
        if (!alive[i] || (interior && role[i] !== RSTAT)) continue; const x = px[i], y = gy[i], z = pz[i], dx = x - c[0], dy = y + .9 - c[1], dz = z - c[2], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R_DRAW * R_DRAW) continue; const dd = dx * cfx + dy * cfy + dz * cfz, rad = 2.5;
        if (dd < -rad || dd * tn + rad * 1.6 < Math.sqrt(Math.max(d2 - dd * dd, 0))) { // outside the view: its shadow may still reach in
          if (shOn && d2 < lodD * lodD + 900) { const hx2 = dx + shX * .5, hz2 = dz + shZ * .5, e2 = hx2 * hx2 + dy * dy + hz2 * hz2, ed = hx2 * cfx + dy * cfy + hz2 * cfz, er = rad + shL * .5;
            if (ed > -er && ed * tn + er * 1.6 > Math.sqrt(Math.max(e2 - ed * ed, 0))) shC[nShC++] = i; }
          continue; }
        const B = BODIES[ty[i]], bt = B.batches[d2 < lodD * lodD ? 0 : 1]; if (bt.n >= bt.cap) continue;
        const o = bt.n * 12, f = bt.f; f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = yaw[i]; f[o + 4] = anim[i] + 100 * (flags[i] | (ty[i] === BID.man && !(flags[i] & 1) ? 8 : 0) | (SHORTG[ty[i]] ? 16 : 0)); /* 16: short garment (VS_CROWD 跪坐 shows the folded legs) */ f[o + 5] = ph[i]; f[o + 6] = kA[i]; f[o + 7] = scl[i];
        const u = bt.u8, Bo = bt.n * 48 + 32, co = i * 16; for (let k = 0; k < 16; k++) u[Bo + k] = col[co + k];
        bt.n++; drawn++;
      }
      // shadow-only casters go after the visible instances of the near batch: colour pass draws [0, nVis), shadow pass [0, n)
      for (const B of BODIES) B.batches[0].nVis = B.batches[0].n;
      for (let k = 0; k < nShC; k++) { const i = shC[k], bt = BODIES[ty[i]].batches[0]; if (bt.n >= bt.cap) continue;
        const o = bt.n * 12, f = bt.f; f[o] = px[i]; f[o + 1] = gy[i]; f[o + 2] = pz[i]; f[o + 3] = yaw[i]; f[o + 4] = anim[i] + 100 * (flags[i] | (ty[i] === BID.man && !(flags[i] & 1) ? 8 : 0) | (SHORTG[ty[i]] ? 16 : 0)); /* 16: short garment (VS_CROWD 跪坐 shows the folded legs) */ f[o + 5] = ph[i]; f[o + 6] = kA[i]; f[o + 7] = scl[i];
        const u = bt.u8, Bo = bt.n * 48 + 32, co = i * 16; for (let q2 = 0; q2 < 16; q2++) u[Bo + q2] = col[co + q2]; bt.n++; }
      issue();
      S.drawn = drawn; S.casters = nShC;
      // lantern lights of the nearest carriers (men with the lantern shown): CROWD.lights[0..CROWD.nLights) — the game may merge them into R.lights
      let nl = 0; if (BID.man !== undefined) for (let i = 0; i < MAX && nl < LIGHTS.length; i++) { if (!alive[i] || ty[i] !== BID.man || (flags[i] & 1)) continue; const dx = px[i] - c[0], dz = pz[i] - c[2]; if (dx * dx + dz * dz > 900) continue;
        const L = LIGHTS[nl++], cy = Math.cos(yaw[i]), sy = Math.sin(yaw[i]), s = scl[i]; L.x = px[i] + (cy * -.235 + sy * .36) * s; L.z = pz[i] + (-sy * -.235 + cy * .36) * s; L.y = gy[i] + .62 * s; }
      API.nLights = nl;
    } catch (e) { console.error('CROWD.draw', e); }
  }
  // ---------- API ----------
  const nearOut = [], LIGHTS = Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0, r: 5, c: [1.0, .7, .38], i: 1, flicker: 1, base: 1 }));
  const API = {
    S, BODIES, MAX, lights: LIGHTS, nLights: 0, onStep: null, get steps() { return stepEv; }, get nSteps() { return nStep; },
    init(nv, cx) {
      try {
        ensure(); ctx = cx || {}; nav = nv && nv.nodes && nv.nodes.length ? nv : null;
        if (nav && typeof CENSUS !== 'undefined' && typeof CITY !== 'undefined' && CITY.nav === nav) { try { CENSUS.build(); } catch (e) { console.error('CENSUS.build', e); } } // (may add a few links to the graph: before the per-edge arrays) rnd = RNG(815 + ((Math.random() * 1e6) | 0));
        for (let i = 0; i < MAX; i++) if (alive[i] && role[i] !== RSTAT) kill(i); nWalk = 0; nPat = 0; filled = false; lastPX = lastPZ = 1e9; mX = mZ = 1e9; setAcc = 9;
        if (nav) { if (!nav.doors) nav.doors = []; if (!nav.gates) nav.gates = []; for (const E of nav.edges) if (!E.len) E.len = Math.hypot(nav.nodes[E.a].x - nav.nodes[E.b].x, nav.nodes[E.a].z - nav.nodes[E.b].z) || .01; lotState = new Uint8Array(nav.nodes.length + nav.edges.length); nodeY = new Float32Array(nav.nodes.length).fill(NaN); }
        if (lineup) addLineup(lineup);
        if (nav) update(1 / 60);
      } catch (e) { console.error('CROWD.init', e); nav = null; }
    },
    update, draw,
    // static people in fixed poses (interiors, set dressing): never despawned, independent of the nav graph and of init().
    // list: [{type, x, y, z, yaw, anim, phase?, cols?: 4 x [r,g,b] (slots 1..4, 0..1), seed?, flags? (1 hide right-hand item, 2 hide left-hand item), scale?, bright?}]
    // y = floor or platform top: seated anims (5, 18, 19, 20, 22) lower the body onto it. Returns the agent indices.
    placeStatic(list) {
      const out = [], keep = rnd; try { ensure();
        for (const o of list || []) { let tn = o.type, an = o.anim; if (typeof an === 'string') { const seat = o.seated ?? (/^sit|kneel|pipa|write/.test(an) || (ANIM_SEATED[an] !== undefined && onPlatform(o))); an = (seat ? ANIM_SEATED[an] : undefined) ?? ANIM_NAMES[an] ?? 0; }
          if ((tn === 'woman' || tn === 'maid') && an === 20) tn = 'musician'; if (o.tag === '胡姬' || o.tag === 'huji') tn = 'huji';
          const b = BID[tn] ?? (typeof tn === 'number' ? tn : BID.man), i = alloc(); if (i < 0) break; const B = BODIES[b];
          if (o.seed !== undefined) rnd = RNG(o.seed >>> 0);
          ty[i] = b; role[i] = RSTAT; st[i] = SSTATIC; px[i] = o.x || 0; pz[i] = o.z || 0; gy[i] = o.y || 0; yaw[i] = yawT[i] = o.yaw || 0;
          anim[i] = anim0[i] = an ?? (B.info.quad ? 40 : 0); ph[i] = o.phase ?? rnd() * 100; kA[i] = 1; vel[i] = 0; scl[i] = o.scale || (B.info.quad ? 1 : .95 + rnd() * .1);
          colours(i, b); if (o.cols) for (let k = 0; k < 4; k++) if (o.cols[k]) for (let c = 0; c < 3; c++) col[i * 16 + k * 4 + c] = clamp(o.cols[k][c], 0, 1) * 255;
          if (o.bright !== undefined) col[i * 16 + 15] = clamp(o.bright, 0, 1) * 255;
          flags[i] = o.flags ?? (b === BID.man ? 1 : 0); out.push(i); } } catch (e) { console.error('CROWD.placeStatic', e); }
      rnd = keep; return out;
    },
    spotSource: null, // optional (x, z, r) -> spots override (tests); default CITY.metaNear(x, z, r, 'spots')
    // game puppets (drums/): static agents the app moves every frame. puppet(o) takes a placeStatic entry and returns the index;
    // drive(i, x, y, z, yaw (crowd convention: faces (sin, cos)), anim (number or name), speed (m/s, steps the gait), dt); remove(i).
    puppet(o) { return API.placeStatic([o])[0] ?? -1; },
    drive(i, x, y, z, yw, an, v = 0, dt = 0) { if (!alive[i]) return false; px[i] = x; pz[i] = z; gy[i] = y; yaw[i] = yawT[i] = yw; if (an !== undefined && an !== null) { const a = typeof an === 'string' ? (ANIM_NAMES[an] ?? 0) : an; anim[i] = anim0[i] = a; } vel[i] = v; if (v > .05 && dt > 0) gait(i, v, dt); else if (anim[i] === 1 || anim[i] === 7) kA[i] = 0; else kA[i] = 1; return true; },
    setFlags(i, f) { if (alive[i]) flags[i] = f; }, setCol(i, k, c) { if (alive[i]) for (let q = 0; q < 3; q++) col[i * 16 + k * 4 + q] = clamp(c[q], 0, 1) * 255; },
    remove(i) { if (alive[i] && role[i] === RSTAT) kill(i); },
    take(i) { if (!alive[i]) return -1; if (pidOf[i] >= 0) censusRelease(i); if (role[i] === RW) nWalk--; if (role[i] === RPAT) nPat--; role[i] = RSTAT; st[i] = SSTATIC; return i; }, // the app takes over a crowd agent (a patrol that spotted you)
    skipLot: null, // (census lot id) => true: its residents are not materialised at home (the game runs that house itself)
    attendants() { return ATT.size; },
    clearStatic() { for (let i = 0; i < MAX; i++) if (alive[i] && role[i] === RSTAT) kill(i); },
    // 'interior': street crowd hidden and frozen (only static people drawn); 'city': normal
    setMode(m) { mode = m === 'interior' ? 'interior' : 'city'; },
    get mode() { return mode; },
    // indices of agents within r of (x,z) (reused array); CROWD.info(i) describes one
    near(x, z, r) { nearOut.length = 0; for (let i = 0; i < MAX; i++) if (alive[i] && (px[i] - x) ** 2 + (pz[i] - z) ** 2 < r * r) nearOut.push(i); return nearOut; },
    info(i) { return alive[i] ? { i, type: BODY_NAMES[ty[i]], x: px[i], y: gy[i], z: pz[i], yaw: yaw[i], role: ['walker', 'set', 'patrol', 'follower', 'display', 'static', 'attendant', 'home'][role[i]], anim: anim[i], state: st[i], pid: pidOf[i] >= 0 ? pidOf[i] : null, name: pidOf[i] >= 0 && typeof CENSUS !== 'undefined' ? CENSUS.person(pidOf[i]).call : null } : null; },
    // line-up of every body type × animation for inspection (used by SCENES.people); o = {x, z} = front-left corner, rows go north (-z)
    lineup(o) { lineup = o; },
    _dbg: () => ({ edge, from, to, es, turned, px, pz, vel, role, alive, ty, cur, st, manage, manageSets, spawnWalker, refreshLocal, camInfo, hourF, pickType, pickLocal, newAgent, placeOnEdge, companions, kill, colours }),
    _nav: () => nav, _ctx: () => ctx, _home: () => ({ HOMES, LAYOUT, lotLayout, manageHomes }), _cen: () => ({ manageCensus, spawnCensusGo, spawnCensusAt, CAND, nCen, pidOf, cenAcc }),
    stats() { return `crowd ${S.agents}/${S.target} drawn ${S.drawn} ${S.ms.toFixed(2)}ms`; },
  };
  return API;
  // heuristic when seated is not given: feet 0.25-0.8 m above the next support below them = sitting on a 榻/platform
  function onPlatform(o) { try { if (typeof G === 'undefined' || !G.world || o.y === undefined) return false; const g = G.world.ground(o.x, o.z, o.y - .2, 0, 0).y, d = o.y - g; return d > .25 && d < .8; } catch (e) { return false; } }
  function addLineup(o) {
    const HUM = BODY_NAMES.filter(n => !BODY_INFO[n].quad), ANIMS = [0, 1, 7, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    HUM.forEach((n, ci) => ANIMS.forEach((an, ri) => { const i = alloc(); if (i < 0) return; const b = BID[n]; ty[i] = b; role[i] = RDISP; st[i] = an === 1 || an === 7 || an === 4 || an === 14 || an === 15 ? SW : SSTATIC;
      px[i] = o.x + ci * 1.6; pz[i] = o.z - ri * 2.0; gy[i] = 0; yaw[i] = yawT[i] = 0; anim[i] = anim0[i] = an; ph[i] = ci * .7 + ri; kA[i] = an === 7 ? 1 : 1.1; spd[i] = an === 7 ? 2.6 : 1.3; scl[i] = 1; cur[i] = spd[i]; flags[i] = (n === 'labourer' || n === 'porter' || n === 'vendor') && ri % 2 ? 4 : 0; colours(i, b); }));
    ['donkey', 'horse', 'camel', 'oxcart', 'dog', 'chicken', 'horsewoman'].forEach((n, ci) => (n === 'dog' ? [40, 41, 42, 43, 44] : [40, 41, 42, 43]).forEach((an, ri) => { const i = alloc(); if (i < 0) return; const b = BID[n]; ty[i] = b; role[i] = RDISP; st[i] = an === 41 || an === 42 ? SW : SSTATIC; spd[i] = an === 42 ? 2.6 : 1.2; px[i] = o.x - 6 - ci * 3.4; pz[i] = o.z - ri * 4.5; gy[i] = 0; yaw[i] = yawT[i] = PI / 2; anim[i] = anim0[i] = an; ph[i] = 0; kA[i] = an === 41 || an === 42 ? 1 : 0; scl[i] = 1; flags[i] = ci === 0 && ri % 2 ? 1 : 0; colours(i, b); }));
  }
})();

// ---------------- test scene: a small ward with a line-up of every type and animation north of it ----------------
function PEOPLE_registerScene() {
  if (typeof SCENES === 'undefined' || SCENES.people) return;
  SCENES.people = () => {
    const L = makeL(), wd = { name: '平康坊', r: rect(-150, -90, 150, 90), gates: 'four', seed: qn('seed', 11), profile: {} };
    TEX.glyph && TEX.glyph('ward_name_p', wd.name, { aspect: .42, fill: .86, fg: [226, 200, 140], bg: [40, 30, 26] });
    const lay = WARD.layout(wd), gr = WARD.groundRaster(lay); G.lay = lay; G.nav = WARD.nav(lay);
    WARD.terrain(L, lay, gr, { margin: 70 }); WARD.build(L, lay, { nameTex: TEX.L.ward_name_p !== undefined ? 'ward_name_p' : undefined });
    CROWD.lineup({ x: -14, z: -112 });
    // interior tableau (static API demo): a 榻 platform with a low table, wine jars, a 壚 counter; drinkers, a writer, a pipa player, a 胡姬 pouring, a kneeling maid
    const X = 30, Z = -114;
    L.box(X, 0, Z, 3.2, .45, 2.2, 'wood', { col: [.8, .62, .48] }); L.box(X, .45, Z, 3.0, .03, 2.0, 'mat', { col: [1, .95, .8] }); L.box(X, .48, Z + .1, 1.0, .28, .55, 'lacquer_black', {});
    L.box(X + 3.4, 0, Z - .4, 1.6, .95, .7, 'rammed_earth', {}); for (const dx of [-.5, 0, .5]) L.prop(b => b.s({ tex: 'glaze', col: [.6, .5, .4] }).lathe([[0, 0], [.16, .02], [.22, .2], [.18, .4], [.09, .46], [.1, .5], [0, .5]], { seg: 10 }), X + 3.4 + dx, .95, Z - .4);
    CROWD.placeStatic([
      { type: 'scholar', x: X - .9, y: .48, z: Z + .2, yaw: PI / 2, anim: 22, seed: 1 }, { type: 'man', x: X + .9, y: .48, z: Z + .2, yaw: -PI / 2, anim: 'drink', seated: true, seed: 2 },
      { type: 'official', x: X, y: .48, z: Z - .65, yaw: 0, anim: 'sit_talk', seed: 3, flags: 1 }, { type: 'musician', x: X - 1.0, y: .48, z: Z + .55, yaw: PI * .8, anim: 20, seed: 4 },
      { type: 'huji', x: X + 2.2, y: 0, z: Z + .5, yaw: -PI / 2, anim: 21, seed: 5 }, { type: 'maid', x: X + .2, y: .48, z: Z + .85, yaw: PI, anim: 19, seed: 6, flags: 2 },
      { type: 'sogdian', x: X + 3.4, y: 0, z: Z + .5, yaw: PI, anim: 9, seed: 7 }, { type: 'woman', x: X - 2.2, y: 0, z: Z + .6, yaw: PI / 2, anim: 8, seed: 8 },
      { type: 'old', x: X + .95, y: .48, z: Z - .55, yaw: -PI / 2 - .4, anim: 'talk', seed: 9 }, // seated guessed from the platform under him
    ]);
    // attendant test spots (in the city they come from CITY.metaNear(..., 'spots')): beside the doors of shops, wine shops and temples
    { const N = G.nav, sp = [], RL = { shop: [['keeper', 1], ['assistant', 1]], wineshop: [['hostess', 2], ['waiter', 2]], temple: [['monk', 3]], rich: [], house: [] };
      N.edges.forEach(E => { if (E.kind !== 'door') return; const [d, o] = N.nodes[E.a].kind === 'door' ? [N.nodes[E.a], N.nodes[E.b]] : [N.nodes[E.b], N.nodes[E.a]]; if (!d.lot || !RL[d.lot.type]) return;
        const dx = o.x - d.x, dz = o.z - d.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, yw = Math.atan2(ux, uz);
        RL[d.lot.type].forEach(([role, cls], k) => { const sd = k ? -1 : 1; sp.push({ x: d.x + ux * 1.3 + uz * 1.5 * sd, y: 0, z: d.z + uz * 1.3 - ux * 1.5 * sd, yaw: yw + PI + (k ? .4 : -.3), role, cls }); }); });
      CROWD.spotSource = (x, z, r) => sp.filter(q => Math.abs(q.x - x) < r && Math.abs(q.z - z) < r); }
    if (!Q.has('x')) { G.P.pos = [0, 0, 30]; }
    return finishL(L);
  };
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', PEOPLE_registerScene);
