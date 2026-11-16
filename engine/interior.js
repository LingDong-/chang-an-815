// interior.js — EIGHT HUNDRED DRUMS: building interiors. Entering a building cuts to a separate, detailed interior scene generated
// from the lot (type + seed + size), so the same building always has the same interior. Tang 815 is a floor/platform culture:
// 榻 platforms with mats (席), low tables (案), arm-rests (憑几), screens (屏風), curtains, chests, lamp stands (燈檠); no chairs.
// INTERIOR.build(lot) -> {L (meshes/lights/world), spawn [x,y,z,yaw], exit {x,z,r}, people [...] }
'use strict';
const INTERIOR = {
  ORIGIN: [0, -500, 0], // interiors are built far below the city (never drawn together; keeps coordinates small)
  kindOf(lot) { return { wineshop: 'wineshop', stall: 'shop', shop: 'shop', inn: 'wineshop', house: 'house', hut: 'hut', rich: 'hall', jinzou: 'hall', office: 'hall', mansion: 'hall', quarter: 'quarter', warehouse: 'store', temple: 'temple' }[lot.type]; },
  build(lot) {
    const kind = this.kindOf(lot) || 'house', R = RNG(lot.seed * 7 + 3), L = makeL(new World()), O = this.ORIGIN;
    const dims = { wineshop: [11 + R() * 3, 7.5 + R() * 2], shop: [8 + R() * 3, 6 + R() * 2], house: [10, 6.4], hut: [7.5, 5], hall: [16, 9], quarter: [12, 8], store: [10, 8], temple: [20, 13] }[kind] || [10, 7];
    const [W, D] = dims, H = kind === 'hall' || kind === 'temple' ? 4.4 : 3.4, F = ARCH.F(O[0], O[1], O[2], 0), b = L.mb, people = [];
    const P = (x, y, z) => [O[0] + x, O[1] + y, O[2] + z];
    b.T(...O);
    // shell: floor, walls with posts and lintels, gable ceiling with exposed rafters; the front wall (+z) has the door
    const earth = kind === 'hut' || kind === 'store' || kind === 'shop';
    b.s({ tex: earth ? 'yard' : 'plank', col: earth ? [1, 1, 1] : [.78, .66, .54] }).box(0, -.1, 0, W, .2, D, { world: earth ? 2 : 1.2, skip: ['bot'] });
    const wallT = earth ? 'rammed_earth' : 'plaster', post = kind === 'hut' ? 'dark_wood' : 'vermilion', nb = Math.max(2, Math.round(W / 3.6)), bw = W / nb;
    const wall = (x0, z0, x1, z1, h, y0 = 0) => { const len = Math.hypot(x1 - x0, z1 - z0); b.s({ tex: wallT, col: [1, 1, 1] }).T((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, 0, Math.atan2(-(z1 - z0), x1 - x0), 0).box(0, 0, 0, len, h, .3, { world: 2 }).pop(); };
    wall(-W / 2, -D / 2, W / 2, -D / 2, H); wall(-W / 2, -D / 2, -W / 2, D / 2, H); wall(W / 2, -D / 2, W / 2, D / 2, H);
    const doorW = kind === 'hall' || kind === 'temple' ? 2.6 : 1.8; wall(-W / 2, D / 2, -doorW / 2, D / 2, H); wall(doorW / 2, D / 2, W / 2, D / 2, H); wall(-doorW / 2, D / 2, doorW / 2, D / 2, H - 2.6, 2.6);
    // daylight in the doorway (an emissive backdrop of the street) and paper windows on the back wall
    // the door, closed (leave by pressing E at it): two plank leaves with battens and ring pulls, a light line at the threshold
    b.s({ tex: 'plank', col: [.62, .48, .38], emi: 0 }); for (const sd of [-1, 1]) { b.box(sd * doorW / 4, 1.3, D / 2 - .02, doorW / 2 - .02, 2.6, .08, { uv: [2, 3] }); b.s({ tex: 'dark_wood' }); for (const yy of [.5, 1.3, 2.1]) b.box(sd * doorW / 4, yy, D / 2 - .08, doorW / 2 - .12, .1, .04); b.s({ tex: 'iron', col: [1, 1, 1] }).box(sd * .16, 1.2, D / 2 - .1, .08, .08, .03); b.s({ tex: 'plank', col: [.62, .48, .38] }); }
    b.s({ tex: 'white', col: [1, .9, .7], emi: 1 }).box(0, .012, D / 2 + .02, doorW - .1, .02, .02); b.s({ emi: 0 });
    for (let i = 0; i < nb; i++) { const x = -W / 2 + bw * (i + .5); if (kind === 'store') continue; b.s({ tex: 'window_bars', col: [1.1, 1, .85], emi: .6 }).T(x, 1.9, -D / 2 + .16).box(0, 0, 0, Math.min(1.6, bw - .8), 1.1, .03).pop(); }
    b.s({ emi: 0 });
    // posts, lintels, beams, rafters
    for (let i = 0; i <= nb; i++) for (const z of [-D / 2 + .2, D / 2 - .2]) { const x = -W / 2 + .2 + (W - .4) * i / nb; b.s({ tex: post, col: [1, 1, 1] }).T(x, 0, z).lathe([[.17, 0], [.15, H], [.15, H]], { seg: 8 }).pop(); }
    for (const z of [-D / 2 + .25, D / 2 - .25]) b.s({ tex: kind === 'hut' ? 'dark_wood' : 'beam_ochre' }).box(0, H - .15, z, W, .3, .22, { uv: [nb, 1] });
    for (let i = 1; i < nb; i++) b.s({ tex: 'dark_wood' }).box(-W / 2 + bw * i, H + .1, 0, .26, .32, D - .2);
    const RH = Math.min(1.8, D * .28); // gable ceiling
    for (const sd of [-1, 1]) { b.s({ tex: kind === 'hut' ? 'straw' : 'rafters', col: [.8, .74, .68] }); b.q4([-W / 2, H + .3, sd * D / 2], [W / 2, H + .3, sd * D / 2], [W / 2, H + .3 + RH, 0], [-W / 2, H + .3 + RH, 0], [W / 2, D / 2]); }
    for (const sd of [-1, 1]) { b.s({ tex: wallT }); ARCH.poly(b, [[sd * W / 2, H + .3, -D / 2], [sd * W / 2, H + .3, D / 2], [sd * W / 2, H + .3 + RH, 0]], [-sd, 0, 0]); }
    b.s({ tex: 'dark_wood' }).box(0, H + .3 + RH - .1, 0, W, .2, .2);
    b.pop();
    const solid = (x, z, w, h, d, yaw = 0) => L.world.box(O[0] + x, O[1] + h / 2, O[2] + z, w / 2, h / 2, d / 2, { yaw });
    solid(0, -D / 2, W, H, .3); solid(-W / 2, 0, .3, H, D); solid(W / 2, 0, .3, H, D); solid(-(W + doorW) / 4, D / 2, (W - doorW) / 2, H, .3); solid((W + doorW) / 4, D / 2, (W - doorW) / 2, H, .3);
    L.world.box(O[0], O[1] - .1, O[2], W / 2, .1, D / 2, {}); // floor (ground query)
    // ----- furniture by kind -----
    const at = (fn, x, z, yaw = 0, y = 0, solidSz) => { L.prop(fn, O[0] + x, O[1] + y, O[2] + z, { yaw, solid: solidSz }); };
    const FX = INTERIOR.F;
    const lamp = (x, z) => { at(b2 => PROPS.oilLamp(b2, true), x, z); L.light(O[0] + x, O[1] + 1.3, O[2] + z, 6, [1.5, .85, .45], { flicker: .2 }); };
    if (kind === 'wineshop') {
      // the 壚: an earthen counter with wine jars set into it, by the door; jars along the side wall; platforms with low tables
      at(b2 => FX.lu(b2, 3.2), W / 2 - 2.6, D / 2 - 1.6, 0, 0, { w: 3.4, h: 1, d: 1.1 });
      for (let i = 0; i < 6; i++) at(b2 => PROPS.wineJar(b2, .75 + R() * .3), W / 2 - .6, -D / 2 + .8 + i * .9, R() * TAU, 0, { r: .35, h: 1 });
      const n = Math.max(2, Math.floor((W - 4) / 2.6)); for (let i = 0; i < n; i++) for (const zz of [-D / 2 + 1.4, .3]) { if (zz > 0 && i === n - 1) continue; const x = -W / 2 + 1.6 + i * 2.6;
        at(b2 => FX.ta(b2, 1.9, 1.3, R), x, zz, 0, 0, { w: 1.9, h: .45, d: 1.3 });
        const k = R(); if (k < .75) people.push({ type: R() < .2 ? 'sogdian' : R() < .3 ? 'scholar' : 'man', x: O[0] + x - .55, y: O[1] + .45, z: O[2] + zz, yaw: PI / 2 + (R() - .5) * .3, anim: R() < .5 ? 'drink' : 'talk', seated: true });
        if (k < .5) people.push({ type: R() < .3 ? 'official' : 'man', x: O[0] + x + .55, y: O[1] + .45, z: O[2] + zz, yaw: -PI / 2 + (R() - .5) * .3, anim: R() < .5 ? 'drink' : 'talk', seated: true }); }
      people.push({ type: 'woman', x: O[0] + W / 2 - 2.6, y: O[1], z: O[2] + D / 2 - 2.5, yaw: PI, anim: 'serve', tag: '胡姬' }); // the hostess behind the counter
      people.push({ type: 'woman', x: O[0] - W / 2 + 1.4, y: O[1] + .45, z: O[2] - D / 2 + 3, yaw: PI / 2, anim: 'pipa', seated: true });
      at(b2 => FX.ta(b2, 1.6, 1.2, R, true), -W / 2 + 1.4, -D / 2 + 3, 0, 0, { w: 1.6, h: .45, d: 1.2 });
      at(b2 => FX.screen(b2, 2.4), -W / 2 + .5, -D / 2 + 3, PI / 2); lamp(-W / 2 + 1, D / 2 - 1); lamp(W / 2 - 1, -D / 2 + 1); lamp(0, -D / 2 + .7);
    } else if (kind === 'shop' || kind === 'store') {
      const trade = ['cloth', 'ceramics', 'medicine', 'grain', 'metal'][(lot.seed >>> 3) % 5];
      at(b2 => FX.counter(b2, W - 3), 0, D / 2 - 1.4, 0, 0, { w: W - 3, h: .9, d: .7 });
      for (let i = 0; i < Math.floor(W / 2.2); i++) at(b2 => FX.shelf(b2, 2, trade, R), -W / 2 + 1.3 + i * 2.2, -D / 2 + .6, 0, 0, { w: 2, h: 2.2, d: .5 });
      for (let i = 0; i < 4; i++) at(b2 => PROPS.sack(b2, 1, i), -W / 2 + .9 + R() * 2, -.5 + R() * 2, R() * TAU, 0, { r: .3, h: .6 });
      people.push({ type: 'vendor', x: O[0] + (R() - .5) * 2, y: O[1], z: O[2] + D / 2 - 2.2, yaw: 0, anim: 'talk' });
      lamp(W / 2 - .8, -D / 2 + .8);
    } else { // house / hall / quarter / hut / temple: a platform with a screen behind it on the axis, side platforms, chests, curtains
      const big = kind === 'hall' || kind === 'temple' || kind === 'quarter';
      at(b2 => FX.ta(b2, big ? 3.2 : 2.4, big ? 2 : 1.6, R, true), 0, -D / 2 + 1.8, 0, 0, { w: 3, h: .45, d: 1.8 });
      at(b2 => FX.screen(b2, big ? 4.4 : 3), 0, -D / 2 + .55);
      if (kind !== 'hut') for (const sd of [-1, 1]) { at(b2 => FX.ta(b2, 2, 1.4, R), sd * (W / 2 - 2), .2, 0, 0, { w: 2, h: .45, d: 1.4 }); at(b2 => FX.chest(b2), sd * (W / 2 - .7), -D / 2 + .8, 0, 0, { w: 1.1, h: .7, d: .6 }); }
      for (const sd of [-1, 1]) if (big) at(b2 => FX.curtain(b2, 2.4, H - .3, R), sd * W / 4, -D / 2 + .3);
      people.push({ type: kind === 'hall' ? 'official' : kind === 'quarter' ? 'woman' : kind === 'temple' ? 'monk' : 'old', x: O[0], y: O[1] + .45, z: O[2] - D / 2 + 1.8, yaw: 0, anim: kind === 'quarter' ? 'pipa' : kind === 'hall' ? 'write' : 'talk', seated: true });
      if (kind === 'quarter' || kind === 'hall') people.push({ type: kind === 'quarter' ? 'scholar' : 'man', x: O[0] - (W / 2 - 2), y: O[1] + .45, z: O[2] + .2, yaw: PI / 2, anim: 'drink', seated: true });
      if (kind === 'hall') people.push({ type: 'maid', x: O[0] + 1.6, y: O[1], z: O[2] - D / 2 + 2.6, yaw: -2.6, anim: 'serve' });
      lamp(-1.8, -D / 2 + 1.2); lamp(1.8, -D / 2 + 1.2); if (big) lamp(0, D / 2 - 1);
    }
    return { L, kind, W, D, spawn: [O[0], O[1], O[2] + D / 2 - 1.2, 0], exit: { x: O[0], z: O[2] + D / 2 - .1, r: 2.2 }, people };
  },
  // ---------- furniture (Tang) ----------
  F: {
    // 榻: low wooden platform with a mat, a low table 案 with food and cups, an arm-rest 憑几; music = a 琵琶 laid down
    ta(b, w, d, R, music) {
      b.s({ tex: 'lacquer_black', col: [1, 1, 1] }).box(0, .38, 0, w, .1, d); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - .1), .17, sz * (d / 2 - .1), .12, .34, .12);
      b.s({ tex: 'lacquer_black' }).box(0, .17, d / 2 - .06, w - .3, .26, .03); // apron with openings (壺門) suggested
      b.s({ tex: 'mat', col: [.95, .88, .7] }).box(0, .445, 0, w - .12, .03, d - .12, { uv: [2, 2] });
      b.s({ tex: 'lacquer_red', col: [1, 1, 1] }).box(0, .6, 0, w * .45, .04, d * .4); for (const sx of [-1, 1]) b.box(sx * w * .2, .52, 0, .05, .12, d * .34);
      for (let i = 0; i < 4; i++) { b.T((R() - .5) * w * .38, .62, (R() - .5) * d * .3); PROPS.bowl(b, .05 + R() * .04, R() < .5 ? 'celadon' : 'glaze'); b.pop(); }
      b.s({ tex: 'dark_wood' }).T(-w / 2 + .35, .46, 0).box(0, .14, 0, .5, .05, .1).box(-.2, .07, 0, .05, .14, .05).box(.2, .07, 0, .05, .14, .05).pop();
      if (music) { b.s({ tex: 'lacquer_red', col: [.9, .7, .5] }).T(w / 2 - .4, .5, -.1, 0, .3, 0).ell(0, 0, 0, .18, .05, .3, { seg: 8, ring: 4 }).box(0, 0, -.45, .05, .03, .4).pop(); }
    },
    // 壚: the earthen wine counter with jars set into its top
    lu(b, w) { b.s({ tex: 'rammed_earth', col: [1, .95, .9] }).box(0, .45, 0, w, .9, 1, { world: 1.5 }); b.s({ tex: 'plank' }).box(0, .92, 0, w + .1, .05, 1.1);
      for (let i = 0; i < 3; i++) { b.T(-w / 2 + .6 + i * (w - 1.2) / 2, .7, 0); PROPS.wineJar(b, .55); b.pop(); } for (let i = 0; i < 3; i++) { b.T(-w / 2 + .9 + i * .5, .95, .3); PROPS.bowl(b, .06, 'celadon'); b.pop(); } },
    screen(b, w) { const n = 4, pw = w / n; for (let i = 0; i < n; i++) { const a = (i % 2 ? .2 : -.2); b.T(-w / 2 + pw * (i + .5), 0, 0, 0, a, 0); b.s({ tex: 'dark_wood', col: [1, 1, 1] }).box(0, .9, 0, pw, 1.8, .05); b.s({ tex: 'paper', col: [1, .97, .9] }).box(0, 1, .03, pw - .14, 1.4, .01); b.pop(); } },
    counter(b, w) { b.s({ tex: 'plank', col: [.7, .58, .46] }).box(0, .45, 0, w, .9, .6, { world: 1.2 }); b.s({ tex: 'dark_wood' }).box(0, .92, 0, w + .1, .05, .7); },
    shelf(b, w, trade, R) {
      b.s({ tex: 'dark_wood', col: [1, 1, 1] }); for (const sx of [-1, 1]) b.box(sx * (w / 2 - .04), 1.1, 0, .06, 2.2, .45); for (let k = 0; k < 4; k++) b.box(0, .3 + k * .6, 0, w, .04, .45);
      for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) { const x = -w / 2 + .3 + i * (w - .6) / 3, y = .32 + k * .6; b.T(x, y, 0);
        if (trade === 'cloth') b.s({ tex: 'silk', col: [[1.1, .4, .35], [.4, .5, .9], [.95, .9, .75], [.5, .75, .5]][(i + k) % 4] }).T(0, .12, 0, 0, 0, PI / 2).lathe([[0, -.22], [.11, -.22], [.11, .22], [0, .22]], { seg: 6 }).pop();
        else if (trade === 'ceramics') PROPS.bowl(b, .08 + R() * .04, R() < .5 ? 'celadon' : 'white');
        else if (trade === 'medicine') b.s({ tex: 'lacquer_black' }).box(0, .15, 0, .38, .3, .38);
        else if (trade === 'grain') PROPS.sack(b, .5, i + k);
        else b.s({ tex: 'iron' }).box(0, .05, 0, .4, .1, .2);
        b.pop(); }
    },
    chest(b) { b.s({ tex: 'lacquer_red', col: [.9, .9, .9] }).box(0, .35, 0, 1.1, .6, .6); b.s({ tex: 'brass' }).box(0, .45, .31, .12, .12, .02); for (const sx of [-1, 1]) b.s({ tex: 'lacquer_black' }).box(sx * .45, .03, 0, .1, .06, .55); },
    curtain(b, w, h, R) { b.s({ tex: 'silk', col: [.95, .55 + R() * .2, .45] }); b.grid(6, 1, (i, j) => [-w / 2 + j * w, h - i / 6 * (h - .2), Math.sin(i * 1.3) * .04, j * 2, i / 6], false, null, false); b.grid(6, 1, (i, j) => [-w / 2 + j * w, h - i / 6 * (h - .2), Math.sin(i * 1.3) * .04 - .01, j * 2, i / 6], false, null, true); },
  },
};
