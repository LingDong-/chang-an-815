'use strict';
// =====================================================================================
// CENSUS — the persistent population of the walkable slice (EIGHT HUNDRED DRUMS, 元和十年).
// Deterministic from the city's seeds: same city → same people, households, names, looks, jobs and daily schedules.
// Data only (no rendering): people.js (CROWD) materialises census people near the player as crowd agents.
//
//   CENSUS.build()                 lazily from CITY.lay + CITY.nav (main thread or Node); ~25–30k people
//   CENSUS.person(pid)             { pid, name, call, sex, age, cls, occ, type, seed, home, work, rank, retinue, hh, ward }
//   CENSUS.where(pid, h?, day?)    { state: 'home'|'in'|'at'|'go'|'off'|'dead', x, z, lot, act, seg } (abstract; live agents report their real position)
//   CENSUS.day(pid, day?)          today's schedule: [{ t0, t1, k: 'home'|'in'|'at'|'go'|'off', lot, a, b (nav nodes), x, z, act }]
//   CENSUS.find(q)                 people by name / occupation / ward / class (string or { name, occ, ward, cls, type }), max 200
//   CENSUS.track(pid, on)          keep a person 'hot' (materialised whenever possible, schedule cached)
//   CENSUS.kill(pid) / hurt(pid)   persistent; the household mourns (stays home, white clothes) for 7 days
//   CENSUS.state / load(json)      small JSON delta (deaths, injuries, day)
//   CENSUS.stats() / describe(pid) debug
// Time: game hours (G.hour) and a day counter (wraps of G.hour). Travel is abstracted at a brisk pace (the game clock runs 30× real
// time): walking 4.5 km/h, riding 8 km/h of GAME time; materialised agents walk at real speed and are released when they leave the bubble.
// =====================================================================================
const CENSUS = (() => {
  const SPEED = { walk: 4500, ride: 8000 }; // metres per game hour (abstract travel)
  let court = -1, comp = null, mainComp = 0, linked = 0, built = false, P = [], H = [], LOTS = [], WARDS = [], nav = null, buildMs = 0, exits = [], wellsN = [], templeLots = [], marketLots = [], quarterLots = [], officeLots = [], workLots = [];
  const S = { dead: {}, hurt: {}, mourn: {}, day: 0 }; // persistent delta
  const track = new Set(), live = new Map(), override = new Map(); // pid -> agent index (set by CROWD); pid -> { until, day } (materialised trip finished early)
  const R32 = s => RNG(s >>> 0);
  const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const pick = (r, a) => a[(r() * a.length) | 0];
  const wpick = (r, a) => { let t = 0; for (const [, w] of a) t += w; let x = r() * t; for (const [v, w] of a) { x -= w; if (x <= 0) return v; } return a[a.length - 1][0]; };
  // ---------------- names (815) ----------------
  const SUR = [['李', 9], ['王', 9], ['張', 8], ['劉', 6], ['陳', 4], ['楊', 4], ['趙', 4], ['周', 3], ['吳', 3], ['孫', 3], ['馬', 3], ['朱', 2], ['胡', 2], ['郭', 3], ['何', 2], ['高', 3], ['羅', 2], ['梁', 2], ['宋', 2], ['謝', 1], ['韓', 2], ['唐', 1], ['馮', 1], ['董', 2], ['蕭', 1], ['程', 1], ['曹', 1], ['袁', 1], ['鄧', 1], ['許', 1], ['沈', 1], ['呂', 1], ['蘇', 1], ['賈', 1], ['丁', 1], ['魏', 1], ['薛', 1], ['閻', 1], ['潘', 1], ['杜', 2], ['田', 2], ['任', 1], ['姜', 1], ['范', 1], ['石', 1], ['姚', 1], ['孔', 1], ['白', 1], ['崔', 1], ['秦', 1], ['侯', 1], ['孟', 1], ['段', 1], ['雷', 1], ['尹', 1], ['常', 1], ['武', 1], ['賀', 1], ['韋', 2], ['裴', 1], ['柳', 1], ['竇', 1], ['元', 1], ['盧', 1], ['鄭', 2], ['崔', 1], ['令狐', .3], ['獨孤', .3], ['長孫', .2]];
  const ELITE = [['崔', 4], ['盧', 3], ['鄭', 3], ['王', 3], ['李', 4], ['韋', 3], ['杜', 2], ['裴', 2], ['楊', 2], ['柳', 1], ['薛', 1], ['蕭', 1], ['竇', 1], ['元', 1]];
  const SOGD = [['康', 4], ['安', 4], ['石', 2], ['米', 2], ['曹', 2], ['何', 2], ['史', 2]];
  const G1 = '元文守承光延思玄仲君德弘懷敬孝庭崇令嘉從義季子允處'.split(''), G2 = '禮義信忠正明遠慶嗣本宗讓素誠業福順貴才寶直方亮章輔裕成'.split(''), G0 = '澄敏晏準均賓諒徽遜偕翊昇暢儼'.split('');
  const ORD = ['大', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  const AM = '福奴寶喜六蠻興順貴壽祿安成'.split(''), AF = '珠蘭翠桂蓮梅菊玉喜鸞鳳巧'.split('');
  const DH1 = '法智惠道圓義慧明善普'.split(''), DH2 = '明空真海光照忍淨遠澄覺林朗源通'.split(''), NUN1 = '妙淨真慧善'.split('');
  const SOGN = ['延慶', '胡子', '槃陀', '拂呼', '射勿', '那你', '婆羅', '伏帝', '阿了', '莫賀', '忿', '薄鼻', '延德', '思忠', '巴那', '突昏', '吐屯', '芬', '達干', '烏乃'];
  const CORT = '楚萊迎蘇福仙絳俞小舉令真潤媚'.split('');
  const TITLE = { 3: ['尚書', '將軍', '大卿'], 4: ['侍郎', '少卿', '少監', '將軍'], 5: ['郎中', '中丞', '少尹', '中郎將'], 6: ['員外', '司直', '長史'], 7: ['補闕', '御史', '博士', '都事'], 8: ['拾遺', '主簿', '御史', '錄事', '主事'], 9: ['校書', '正字', '參軍', '主簿'] };
  const given = r => r() < .25 ? pick(r, G0) : pick(r, G1) + pick(r, G2);
  // ---------------- graph (A* on the crowd nav) ----------------
  let hp, hv, gS, fS, from, seen, stamp = 1, nh = 0;
  function heapPush(n, f) { let i = nh++; hp[i] = n; hv[i] = f; while (i) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hp[p], hp[i]] = [hp[i], hp[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } }
  function heapPop() { const r = hp[0]; nh--; if (nh) { hp[0] = hp[nh]; hv[0] = hv[nh]; let i = 0; for (;;) { const l = i * 2 + 1, rr = l + 1; let m = i; if (l < nh && hv[l] < hv[m]) m = l; if (rr < nh && hv[rr] < hv[m]) m = rr; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return r; }
  const KCOST = { main: 1, avenue: .95, sub: 1.05, lane: 1.15, gate: 1, door: 1.5 };
  const routes = new Map(); let nRoutes = 0, routeMs = 0;
  // shortest walk between two nav nodes: { nodes: Int32Array, cum: Float32Array, len } (cached); null if unreachable
  function route(a, b) {
    if (a === b) return { nodes: new Int32Array([a]), cum: new Float32Array([0]), len: 0 };
    const key = a * 65536 + b; let rt = routes.get(key); if (rt !== undefined) return rt;
    const t0 = performance.now(), N = nav.nodes, n = N.length; if (!hp || hp.length < n * 4) { hp = new Int32Array(n * 4); hv = new Float32Array(n * 4); gS = new Float32Array(n); from = new Int32Array(n); seen = new Int32Array(n); }
    stamp++; nh = 0; const B = N[b]; gS[a] = 0; from[a] = -1; seen[a] = stamp; heapPush(a, Math.hypot(N[a].x - B.x, N[a].z - B.z)); let found = false;
    while (nh) { const u = heapPop(); if (u === b) { found = true; break; } if (seen[u] === -stamp) continue; seen[u] = -stamp; const gu = gS[u];
      for (const e of nav.adj[u]) { const E = nav.edges[e], v = E.a === u ? E.b : E.a; if (seen[v] === -stamp) continue; if (E.kind === 'door' && v !== b && u !== a) continue; // never walk through other people's lots
        const g = gu + (E.len || 1) * (KCOST[E.kind] || 1); if (seen[v] === stamp && g >= gS[v]) continue; seen[v] = stamp; gS[v] = g; from[v] = u; const V = N[v]; heapPush(v, g + Math.hypot(V.x - B.x, V.z - B.z)); } }
    rt = null; if (found) { const L = []; for (let u = b; u !== -1; u = from[u]) L.push(u); L.reverse(); const nodes = new Int32Array(L), cum = new Float32Array(L.length);
      for (let k = 1; k < L.length; k++) cum[k] = cum[k - 1] + Math.hypot(N[L[k]].x - N[L[k - 1]].x, N[L[k]].z - N[L[k - 1]].z); rt = { nodes, cum, len: cum[L.length - 1] }; }
    if (routes.size > 6000) routes.clear(); routes.set(key, rt); nRoutes++; routeMs += performance.now() - t0; return rt;
  }
  function along(rt, d) { const N = nav.nodes, c = rt.cum, n = c.length; if (n === 1 || d <= 0) return [N[rt.nodes[0]].x, N[rt.nodes[0]].z, 0]; if (d >= rt.len) return [N[rt.nodes[n - 1]].x, N[rt.nodes[n - 1]].z, n - 1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; } const t = (d - c[lo]) / Math.max(1e-6, c[hi] - c[lo]), A = N[rt.nodes[lo]], B = N[rt.nodes[hi]]; return [A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t, lo]; }
  // ---------------- build ----------------
  function nearestNode(x, z, kinds) { let best = -1, bd = 1e18; const N = nav.nodes; for (let i = 0; i < N.length; i++) { const n = N[i]; if (kinds && !kinds.includes(n.kind)) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
  function lotAt(x, z) { const g = lotGrid.get(Math.floor(x / 32) * 4096 + Math.floor(z / 32)); if (g) for (const id of g) { const r = LOTS[id].r; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id; } return -1; }
  const lotGrid = new Map();
  function build() {
    if (built) return true; if (typeof CITY === 'undefined' || !CITY.lay || !CITY.lay.length || !CITY.nav) return false;
    const t0 = performance.now(); nav = CITY.nav; for (const E of nav.edges) if (!E.len) E.len = Math.hypot(nav.nodes[E.a].x - nav.nodes[E.b].x, nav.nodes[E.a].z - nav.nodes[E.b].z) || .01;
    CITY.lay.forEach((lay, w) => { const wd = lay.wd || {}; const W = { w, name: wd.short || wd.name || ('w' + w), kind: wd.kind, r: wd.r, lots: [], wells: [], people: 0 }; WARDS.push(W);
      for (const lot of lay.lots || []) { const id = LOTS.length; const o = { id, lot, ward: w, type: lot.type, wealth: lot.wealth || 1, r: lot.r, door: lot.door ?? -1, seed: lot.seed || hash(id, w), cls: 0, hh: [] }; LOTS.push(o); W.lots.push(id);
        for (let gx = Math.floor(o.r.x0 / 32); gx <= Math.floor(o.r.x1 / 32); gx++) for (let gz = Math.floor(o.r.z0 / 32); gz <= Math.floor(o.r.z1 / 32); gz++) { const k = gx * 4096 + gz; let a = lotGrid.get(k); if (!a) lotGrid.set(k, a = []); a.push(id); } }
      for (const wl of lay.wells || []) W.wells.push(nearestNodeIn(wl.x, wl.z, 60)); });
    // connectivity: link small detached pieces (market stall blocks whose lane ends stop ~20 m short of a market street) to the main graph
    comp = components(); let big = 0; { const sz = new Map(); for (const c of comp) sz.set(c, (sz.get(c) || 0) + 1); let bs = 0; for (const [c, n] of sz) if (n > bs) { bs = n; big = c; } mainComp = big;
      for (const [c, n] of sz) { if (c === big || n < 10) continue; let bd = 30 * 30, bp = null; const N = nav.nodes;
        for (let i = 0; i < N.length; i++) { if (comp[i] !== c || N[i].kind === 'door') continue; for (let j = 0; j < N.length; j++) { if (comp[j] !== big || N[j].kind === 'door') continue; const d = (N[i].x - N[j].x) ** 2 + (N[i].z - N[j].z) ** 2; if (d < bd) { bd = d; bp = [i, j]; } } }
        if (bp) { const e = nav.edges.length; nav.edges.push({ a: bp[0], b: bp[1], w: 3, kind: 'lane', len: Math.sqrt(bd), virt: true }); nav.adj[bp[0]].push(e); nav.adj[bp[1]].push(e); linked++; } }
      if (linked) comp = components(); mainComp = comp[nav.nodes.findIndex((n, i) => comp[i] === comp[big] || true)] ?? big; { const sz2 = new Map(); for (const c of comp) sz2.set(c, (sz2.get(c) || 0) + 1); let b2 = 0; for (const [c, n] of sz2) if (n > b2) { b2 = n; mainComp = c; } } }
    // the exit toward the imperial city: the reachable avenue crossing nearest to its south-east gate (安上門 side)
    { let bd = 1e18; nav.nodes.forEach((n, i) => { if (comp[i] !== mainComp || n.kind !== 'x') return; const d = (n.x - 900) ** 2 + (n.z + 1300) ** 2; if (d < bd) { bd = d; court = i; } }); exits.push(court); }
    // big compounds without a nav door (temples, 進奏院, the 北里, mansions): use the street node nearest the middle of their front side
    for (const L of LOTS) if (L.door < 0 && ['temple', 'quarter', 'jinzou', 'office', 'mansion', 'rich', 'inn', 'shop', 'wineshop', 'house'].includes(L.type)) { const r = L.r, f = L.lot.front, x = f === 'w' ? r.x0 : f === 'e' ? r.x1 : (r.x0 + r.x1) / 2, z = f === 'n' ? r.z0 : f === 's' ? r.z1 : (r.z0 + r.z1) / 2; L.door = nearestNodeIn(x, z, 60); L.virtDoor = true; }
    for (const L of LOTS) if (L.door >= 0 && !reach(L.door)) L.stuck = true;
    for (const L of LOTS) { if (L.door < 0 || L.stuck) continue; if (L.type === 'temple') templeLots.push(L.id); else if (L.type === 'stall' || (WARDS[L.ward].kind === 'market' && (L.type === 'shop' || L.type === 'wineshop'))) marketLots.push(L.id); else if (L.type === 'quarter') quarterLots.push(L.id); else if (L.type === 'office' || L.type === 'jinzou') officeLots.push(L.id); if (L.type === 'warehouse' || L.type === 'field') workLots.push(L.id); }
    // households
    const pool = []; // adults free to take outside jobs: { pid, ward }
    for (const L of LOTS) { if (L.door < 0) continue; const r = R32(L.seed * 31 + 7); const t = L.type;
      if (t === 'house') household(L, r, wpick(r, [['craft', 4], ['clerk', 1], ['labourer', 3], ['stall', 2], ['scholar', 1.2], ['porter', 1.5], ['carter', .6], ['servant', .4]]), 2 + (r() * 5 | 0), 0, pool);
      else if (t === 'hut') household(L, r, wpick(r, [['labourer', 4], ['porter', 3], ['stall', 1], ['beggar', .3]]), 2 + (r() * 4 | 0), 0, pool);
      else if (t === 'rich' || t === 'mansion') household(L, r, L.wealth >= 3 || t === 'mansion' || r() < .55 ? 'official' : wpick(r, [['merchant', 2], ['landlord', 1], ['scholar', .7]]), 3 + (r() * 4 | 0), t === 'mansion' ? 14 : 2 + (L.wealth >= 3 ? 4 : 1) + (r() * 4 | 0), pool);
      else if (t === 'shop') { L.cls = 1; household(L, r, 'shopkeeper', 2 + (r() * 4 | 0), 0, pool, ['assistant', r() < .6 ? 'apprentice' : null]); }
      else if (t === 'wineshop') { L.cls = 2; household(L, r, 'wine', 1 + (r() * 3 | 0), 0, pool, ['hostess', r() < .5 ? 'hostess' : null, 'waiter']); }
      else if (t === 'inn') { L.cls = 1; household(L, r, 'innkeeper', 2 + (r() * 4 | 0), 0, pool, ['waiter']); }
      else if (t === 'temple') { L.cls = 3; temple(L, r); }
      else if (t === 'jinzou') { L.cls = 1; staffOnly(L, r, 'director', 'clerk', 3 + (r() * 4 | 0)); }
      else if (t === 'quarter') { L.cls = 2; staffOnly(L, r, 'madam', 'courtesan', 6 + (r() * 6 | 0)); }
    }
    // outside jobs: stalls (market), warehouses / fields, offices: filled from the pool, nearest-first by a hash order
    const takeFrom = (occs, lots, perLot, hours) => { const cand = pool.filter(q => occs.includes(P[q].occ) && !P[q].work).sort((a, b) => hash(a, 5) - hash(b, 5)); let k = 0;
      for (const lid of lots) for (let j = 0; j < perLot && k < cand.length; j++) P[cand[k++]].work = { lot: lid, hours }; };
    takeFrom(['stall'], marketLots.filter(l => LOTS[l].type === 'stall'), 1, [11.6, 17.33]);
    takeFrom(['labourer', 'porter', 'carter'], workLots, 3, [6, 17.5]);
    takeFrom(['clerk'], officeLots, 6, [7, 16]); { let k = 0; for (const q of pool) { const p = P[q]; if (p.occ === 'clerk' && !p.work && officeLots.length) p.work = { lot: officeLots[(hash(q, 9) + k++) % officeLots.length], hours: [7, 16] }; } }
    for (const q of pool) { const p = P[q]; if (!p.work && (p.occ === 'labourer' || p.occ === 'porter' || p.occ === 'carter')) p.work = { lot: marketLots.length ? marketLots[hash(q, 3) % marketLots.length] : -1, hours: [6, 17.5] }; }
    for (const L of LOTS) { if (L.hh.length < 2) continue; const used = new Set(), r = R32(L.seed * 13 + 1); for (const pid of L.hh) { const p = P[pid]; let k = 0; while (used.has(p.call) && k++ < 12) { if (p.call[0] === '阿') { p.call = '阿' + pick(r, p.sex === 'f' ? AF : AM); p.name = p.name[0] === '阿' ? p.call : p.name; } else if (p.call.endsWith('郎') || p.call.endsWith('娘')) { p.call = p.call[0] + ORD[r() * 16 | 0] + p.call.slice(-1); } else break; } used.add(p.call); } } // one 阿福 per house
    for (const p of P) if (p.retinue) for (const q of p.retinue) P[q].master = p.pid;
    for (const W of WARDS) W.people = 0; for (const p of P) WARDS[LOTS[p.home].ward].people++;
    built = true; buildMs = performance.now() - t0; if (typeof console !== 'undefined') console.log('CENSUS', P.length, 'people,', H.length, 'households,', buildMs.toFixed(0), 'ms');
    return true;
  }
  function components() { const N = nav.nodes.length, c = new Int32Array(N).fill(-1); let k = 0; for (let s = 0; s < N; s++) { if (c[s] >= 0) continue; const st = [s]; c[s] = k; while (st.length) { const u = st.pop(); for (const e of nav.adj[u]) { const E = nav.edges[e], v = E.a === u ? E.b : E.a; if (c[v] < 0) { c[v] = k; st.push(v); } } } k++; } return c; }
  const reach = n => n >= 0 && comp && comp[n] === mainComp;
  function nearestNodeIn(x, z, r) { let best = -1, bd = r * r; const N = nav.nodes; for (let i = 0; i < N.length; i++) { const n = N[i]; if (n.kind === 'door' || !reach(i)) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
  function person(L, hh, r, o) {
    const pid = P.length, p = Object.assign({ pid, sex: 'm', age: 30, cls: 'commoner', occ: 'none', type: 'man', seed: hash(L.seed, pid, 77), home: L.id, work: null, rank: 0, retinue: null, hh: hh.hid, ward: L.ward, name: '', call: '' }, o);
    P.push(p); hh.members.push(pid); L.hh.push(pid); return p;
  }
  function famName(r, p, sur, ordinal) {
    if (p.sex === 'm') { const g = given(r); p.name = sur + g; p.call = ordinal && r() < .7 ? sur + ORD[Math.min(19, ordinal - 1)] + '郎' : sur + g; }
    else { p.name = sur + '氏'; p.call = p.age < 20 ? sur + ORD[Math.min(19, (ordinal || 1) - 1)] + '娘' : sur + '氏'; }
  }
  function household(L, r, occ, nFam, nServ, pool, staff) {
    const hh = { hid: H.length, lot: L.id, members: [], occ }; H.push(hh);
    const sog = (occ === 'merchant' || occ === 'shopkeeper' || occ === 'wine') && r() < (WARDS[L.ward].kind === 'market' ? .35 : .12);
    const sur = sog ? wpick(r, SOGD) : occ === 'official' || occ === 'landlord' ? (r() < .55 ? wpick(r, ELITE) : wpick(r, SUR)) : wpick(r, SUR);
    const headAge = 28 + (r() * 32 | 0), cls = occ === 'official' ? 'official' : occ === 'merchant' || occ === 'shopkeeper' || occ === 'wine' || occ === 'innkeeper' || occ === 'landlord' ? 'merchant' : occ === 'labourer' || occ === 'porter' || occ === 'carter' || occ === 'beggar' ? 'labourer' : 'commoner';
    const typeOf = { official: 'official', scholar: 'scholar', merchant: sog ? 'sogdian' : 'man', shopkeeper: sog ? 'sogdian' : 'man', wine: sog ? 'sogdian' : 'man', innkeeper: 'man', landlord: 'man', craft: 'man', clerk: 'man', labourer: 'labourer', porter: 'porter', carter: 'labourer', stall: 'vendor', servant: 'man', beggar: 'beggar' };
    const head = person(L, hh, r, { sex: 'm', age: headAge, cls, occ, type: headAge > 58 ? 'old' : typeOf[occ] || 'man', role: 'head' });
    if (occ === 'official') { const rank = Math.max(3, Math.min(9, Math.round(9.6 - (L.wealth || 1) * 1.4 + r() * 2.6 - (L.type === 'mansion' ? 2 : 0)))); head.rank = rank; const sur2 = sur; head.name = sur2 + given(r); head.call = sur2 + pick(r, TITLE[rank]); }
    else if (sog) { head.name = sur + pick(r, SOGN); head.call = head.name; }
    else famName(r, head, sur, 1 + (r() * 12 | 0));
    if (occ !== 'shopkeeper' && occ !== 'wine' && occ !== 'innkeeper' && occ !== 'official' && occ !== 'merchant' && occ !== 'landlord' && occ !== 'scholar' && occ !== 'beggar') pool.push(head.pid);
    if (occ === 'scholar') { head.age = 20 + (r() * 16 | 0); head.type = 'scholar'; head.occ = 'candidate'; }
    let kids = 0;
    for (let k = 1; k < nFam; k++) {
      const kind = k === 1 && headAge > 22 ? 'wife' : headAge > 50 && r() < .5 ? 'grown' : r() < .12 ? 'elder' : 'child';
      if (kind === 'wife') { const wsur = sog ? wpick(r, SOGD) : wpick(r, occ === 'official' ? ELITE : SUR), p = person(L, hh, r, { sex: 'f', age: Math.max(18, headAge - 2 - (r() * 8 | 0)), cls, occ: 'wife', type: occ === 'official' || occ === 'merchant' || occ === 'landlord' ? 'woman' : headAge > 55 ? 'oldwoman' : (r() < .5 ? 'woman' : 'maid'), role: 'wife' }); p.name = wsur + '氏'; p.call = wsur + '氏'; }
      else if (kind === 'elder') { const f = r() < .6, p = person(L, hh, r, { sex: f ? 'f' : 'm', age: 62 + (r() * 18 | 0), cls, occ: 'elder', type: f ? 'oldwoman' : 'old', role: 'elder' }); if (f) { p.name = wpick(r, SUR) + '氏'; p.call = p.name; } else famName(r, p, sur, 1 + (r() * 6 | 0)); }
      else { kids++; const age = kind === 'grown' ? 17 + (r() * 12 | 0) : 2 + (r() * 14 | 0), f = r() < .48, p = person(L, hh, r, { sex: f ? 'f' : 'm', age, cls, occ: age < 15 ? 'child' : f ? 'daughter' : 'son', type: age < 15 ? (f ? 'girl' : 'child') : f ? (occ === 'official' || occ === 'merchant' ? 'woman' : 'maid') : (occ === 'labourer' || occ === 'porter' ? 'labourer' : occ === 'scholar' || occ === 'official' ? 'scholar' : 'man'), role: 'child' });
        if (age < 15) { p.name = sur + (f ? pick(r, AF) + '娘' : given(r)); p.call = '阿' + (f ? pick(r, AF) : pick(r, AM)); } else { famName(r, p, sur, kids); if (!f && age >= 15 && cls !== 'official' && cls !== 'merchant') { p.occ = occ === 'scholar' ? 'candidate' : occ; if (occ !== 'beggar') pool.push(p.pid); } if (!f && cls === 'official') { p.occ = 'candidate'; p.type = 'scholar'; } } }
    }
    // servants of the rich: a groom, maids, menservants (officials ride out at dawn with a retinue)
    const ret = [];
    for (let k = 0; k < nServ; k++) { const role = k === 0 ? 'groom' : k % 3 === 2 ? 'maid' : r() < .55 ? 'manservant' : 'maid', f = role === 'maid';
      const p = person(L, hh, r, { sex: f ? 'f' : 'm', age: 14 + (r() * 30 | 0), cls: 'servant', occ: role, type: f ? 'maid' : (role === 'groom' ? 'labourer' : 'man'), role: 'servant' }); p.name = '阿' + (f ? pick(r, AF) : pick(r, AM)); p.call = p.name; if (!f) ret.push(p.pid); }
    if (occ === 'official') { const nR = Math.min(ret.length, 1 + Math.max(0, 7 - head.rank) + (r() * 2 | 0)); head.retinue = ret.slice(0, nR); if (head.rank <= 4 && head.retinue.length) { for (let k = 1; k < head.retinue.length && k < 3; k++) P[head.retinue[k]].type = 'guard'; } }
    // live-in staff of businesses
    for (const s of staff || []) { if (!s) continue; const f = s === 'hostess', p = person(L, hh, r, { sex: f ? 'f' : 'm', age: f ? 17 + (r() * 10 | 0) : 14 + (r() * 20 | 0), cls: 'servant', occ: s, type: f ? 'huji' : s === 'waiter' ? (r() < .4 ? 'maid' : 'man') : s === 'apprentice' ? 'child' : 'man', role: 'staff' });
      if (p.type === 'maid') { p.sex = 'f'; p.name = '阿' + pick(r, AF); p.call = p.name; } else if (f) { const sr = wpick(r, SOGD); p.name = sr + ORD[r() * 12 | 0] + '娘'; p.call = p.name; } else { p.name = s === 'apprentice' ? '阿' + pick(r, AM) : wpick(r, SUR) + given(r); p.call = s === 'apprentice' ? p.name : p.name[0] + ORD[r() * 10 | 0] + '郎'; } }
    return hh;
  }
  function temple(L, r) {
    const hh = { hid: H.length, lot: L.id, members: [], occ: 'temple' }; H.push(hh); const n = 8 + (r() * 16 | 0);
    if (L.lot && typeof COMP !== 'undefined' && COMP.isDao(L.lot)) { hh.occ = 'abbey'; // a Daoist 觀: 道士 under their abbot (觀主); they keep their surnames (吳筠, 李含光…), no alms rounds
      for (let k = 0; k < n; k++) { const p = person(L, hh, r, { sex: 'm', age: k === 0 ? 55 + (r() * 20 | 0) : 16 + (r() * 50 | 0), cls: 'daoist', occ: k === 0 ? 'abbot' : 'daoist', type: 'daoist', role: 'cleric' }); p.name = wpick(r, SUR) + given(r); p.call = p.name[0] + '尊師'; }
      return hh; }
    const nuns = r() < .25;
    for (let k = 0; k < n; k++) { const p = person(L, hh, r, { sex: nuns ? 'f' : 'm', age: k === 0 ? 55 + (r() * 20 | 0) : 12 + (r() * 50 | 0), cls: nuns ? 'nun' : 'monk', occ: k === 0 ? 'abbot' : nuns ? 'nun' : 'monk', type: nuns ? 'nun' : 'monk', role: 'cleric' });
      p.name = nuns ? pick(r, NUN1) + pick(r, DH2) : pick(r, DH1) + pick(r, DH2); p.call = p.name; }
    return hh;
  }
  function staffOnly(L, r, headOcc, occ, n) {
    const hh = { hid: H.length, lot: L.id, members: [], occ: headOcc }; H.push(hh); const quarter = headOcc === 'madam';
    for (let k = 0; k < n; k++) { const head = k === 0, f = quarter; const p = person(L, hh, r, { sex: f ? 'f' : 'm', age: head ? 35 + (r() * 20 | 0) : 16 + (r() * 22 | 0), cls: quarter ? 'courtesan' : 'official', occ: head ? headOcc : (quarter && k > n - 3 ? 'maid' : occ), type: quarter ? (head ? 'oldwoman' : k > n - 3 ? 'maid' : 'musician') : (head ? 'official' : 'scholar'), role: 'staff' });
      const sur = wpick(r, SUR); if (quarter) { p.name = head ? sur + '媽' : k > n - 3 ? '阿' + pick(r, AF) : sur + pick(r, CORT) + '兒'; p.call = p.name; } else { p.name = sur + given(r); p.call = head ? sur + '留後' : sur + pick(r, ['孔目', '押衙', '書記']); if (head) p.rank = 5; } }
    return hh;
  }
  // ---------------- schedules ----------------
  const T = { sched: new Map() }; // pid*8+day%8 -> schedule
  function curDay() { return S.day; }
  const nodeXZ = n => nav.nodes[n];
  const doorOf = lid => LOTS[lid].door, homeDoor = p => LOTS[p.home].door;
  const dist = (a, b) => { const A = nav.nodes[a], B = nav.nodes[b]; return Math.hypot(A.x - B.x, A.z - B.z) * 1.35; }; // detour factor (planning only)
  function sched(pid, day = S.day) {
    const key = pid * 8 + (day & 7); let s = T.sched.get(key); if (s && s.day === day) return s.segs;
    const p = P[pid], r = R32(hash(p.seed, day, 91)), segs = [], hd = homeDoor(p); let t = 0, at = hd, loc = p.home;
    const ride = p.occ === 'official';
    const home = t1 => { if (t1 > t) { segs.push({ t0: t, t1, k: 'home', lot: p.home, a: hd, act: 'home' }); t = t1; } };
    const stay = (t1, k, lot, act, node) => { if (t1 > t) { segs.push({ t0: t, t1, k, lot, a: node ?? at, act }); t = t1; } };
    const go = (b, act = 'walk', fast = ride) => { if (b < 0 || b === at) return; const dur = dist(at, b) / (fast ? SPEED.ride : SPEED.walk); segs.push({ t0: t, t1: t + dur, k: 'go', a: at, b, act, ride: fast }); t += dur; at = b; };
    const goLot = (lid, act) => { go(doorOf(lid), act); loc = lid; };
    const travel = (a, b) => dist(a, b) / (ride ? SPEED.ride : SPEED.walk);
    const back = (act = 'home') => { go(hd, act); loc = p.home; };
    const dead = S.dead[pid] !== undefined, mourning = (S.mourn[p.hh] ?? -99) > day - 7, hurt = S.hurt[pid] !== undefined && S.hurt[pid] > day - 3;
    const occ = p.occ, ward = p.ward, sameWard = lid => LOTS[lid].ward === ward;
    const lotIn = (arr, own) => { const c = own ? arr.filter(sameWard) : arr; return c.length ? c[(r() * c.length) | 0] : -1; };
    const anyLot = (types, w) => { const L = WARDS[w].lots.filter(l => types.includes(LOTS[l].type) && LOTS[l].door >= 0); return L.length ? L[(r() * L.length) | 0] : -1; };
    const nbWard = () => { const o = WARDS.filter(W => W.w !== ward && W.lots.length && W.kind !== 'market'); return o.length ? o[(r() * o.length) | 0].w : ward; };
    const well = () => { const w = WARDS[ward].wells.filter(n => n >= 0); return w.length ? w[(r() * w.length) | 0] : -1; };
    if (dead) { segs.push({ t0: 0, t1: 24, k: 'dead', lot: p.home, a: hd, act: 'dead' }); T.sched.set(key, { day, segs }); return segs; }
    const errand = (lid, stayH, act, latest = 18.6) => { if (lid < 0 || doorOf(lid) < 0 || LOTS[lid].stuck) return; const d = doorOf(lid), there = travel(at, d), ret = travel(d, hd); if (t + there + ret + .1 > latest) return;
      goLot(lid, act); stay(Math.min(t + stayH, latest - ret), 'in', lid, act, d); back(); };
    // an evening in the 北里 (平康坊): men of means go before the dusk drums and stay the night (the curfew keeps them there till dawn)
    const beili = prob => { if (!quarterLots.length || p.sex !== 'm' || p.age < 17 || r() >= prob) return false; const lid = lotIn(quarterLots), d = lid >= 0 ? doorOf(lid) : -1; if (d < 0) return false;
      home(Math.max(t, 17.4 + r() * 1.2 - travel(at, d))); if (t + travel(at, d) > 19.3) return false; goLot(lid, 'to the 北里'); stay(24, 'in', lid, 'banquet', d); return true; };
    if (mourning || hurt || occ === 'none' || LOTS[p.home].stuck) home(24);
    else if (occ === 'official') { // dawn audience: rides out through the ward gate toward the imperial city with the retinue; back in the afternoon
      home(5.0 + r() * .3); const ex = court;
      if (ex >= 0) { go(ex, 'to court'); stay(12.6 + r() * 2.4, 'off', -1, 'at court', ex); back('home'); }
      if (r() < .25) errand(lotIn(templeLots), 1, 'temple', 18.8); beili(.14); home(24); }
    else if (p.master !== undefined && S.dead[p.master] === undefined) { // retinue: follow the master's day (CROWD keeps them as followers when materialised)
      const ms = sched(p.master, day); for (const s of ms) segs.push(Object.assign({}, s, { lot: s.k === 'home' ? p.home : s.lot })); T.sched.set(key, { day, segs }); return segs; }
    else if (occ === 'shopkeeper' || occ === 'assistant' || occ === 'apprentice' || occ === 'innkeeper' || (occ === 'waiter' && LOTS[p.home].type === 'inn')) { // shop hours at the shop (attendant spots)
      home(6.4 + r() * .4); stay(19, 'work', p.home, 'shop', hd); if (occ === 'assistant' && r() < .5) { /* an errand to the market at noon */ }
      home(24); }
    else if (occ === 'wine' || occ === 'hostess' || (occ === 'waiter')) { home(8.6 + r() * .4); stay(24, 'work', p.home, 'wine shop', hd); }
    else if (occ === 'madam' || occ === 'courtesan') { home(24); }
    else if (occ === 'stall' || (p.work && LOTS[p.work.lot] && LOTS[p.work.lot].type === 'stall')) { home(10.4 + r() * .5); if (p.work) { goLot(p.work.lot, 'to market'); stay(17.33, 'work', p.work.lot, 'stall', doorOf(p.work.lot)); } back(); home(24); }
    else if (occ === 'labourer' || occ === 'porter' || occ === 'carter') { home(5.2 + r() * .6); if (p.work && p.work.lot >= 0) { goLot(p.work.lot, 'to work'); if (occ === 'porter') { const m = lotIn(marketLots); for (let k = 0; k < 2 && m >= 0; k++) { stay(t + 1.5 + r(), 'in', p.work.lot, 'carrying', at); go(doorOf(m), 'carrying'); stay(t + .3, 'in', m, 'unloading', at); go(doorOf(p.work.lot), 'carrying'); } } stay(17.2 + r() * .6, 'in', p.work.lot, 'work', at); back(); } home(24); }
    else if (occ === 'clerk') { home(6.3 + r() * .4); if (p.work) { goLot(p.work.lot, 'to office'); stay(16 + r(), 'in', p.work.lot, 'office', at); back(); } home(24); }
    else if (occ === 'director') { home(24); }
    else if (occ === 'craft') { home(24); }
    else if (occ === 'candidate') { home(9 + r() * 2); errand(r() < .5 ? anyLot(['rich', 'jinzou'], nbWard()) : lotIn(templeLots), 1.5 + r() * 2, 'visit'); if (quarterLots.some(sameWard) && r() < .5) { home(18.2 + r() * .5); goLot(lotIn(quarterLots, true), 'to the 北里'); stay(22.5 + r(), 'in', loc, 'banquet', at); back(); } else beili(.3);
      home(24); }
    else if (occ === 'abbot' || occ === 'monk' || occ === 'nun' || occ === 'daoist') { home(7.5 + r()); if (occ !== 'abbot' && occ !== 'daoist' && p.type !== 'daoist' && r() < .45) { const doors = WARDS[ward].lots.filter(l => LOTS[l].door >= 0 && (LOTS[l].type === 'house' || LOTS[l].type === 'rich')); for (let k = 0; k < 3 && doors.length; k++) { go(doorOf(doors[(r() * doors.length) | 0]), 'alms'); stay(t + .15, 'at', -1, 'alms', at); } back(); } home(24); }
    else if (occ === 'wife' || occ === 'daughter') { home(7 + r() * 3); const w = well(); if (w >= 0 && r() < .55) { go(w, 'to the well'); stay(t + .3 + r() * .3, 'at', -1, 'well', w); back(); } if (r() < .3) errand(lotIn(marketLots), .8 + r(), 'market', 17); else if (r() < .12) errand(lotIn(templeLots), 1, 'temple', 17.5); home(24); }
    else if (p.role === 'servant') { home(6 + r()); const w = well(); if (w >= 0) { go(w, 'fetch water'); stay(t + .2, 'at', -1, 'well', w); back(); } errand(lotIn(marketLots), .5 + r() * .8, 'market'); if (r() < .5) errand(anyLot(['rich', 'house', 'shop'], r() < .5 ? ward : nbWard()), .4 + r() * .6, 'errand'); home(24); }
    else if (occ === 'child') { home(8.5 + r()); if (p.age >= 5) { stay(11.5 + r() * .5, 'at', -1, 'play', hd); home(14 + r()); stay(17 + r() * 1.2, 'at', -1, 'play', hd); } home(24); }
    else if (occ === 'elder') { home(15 + r() * 1.5); if (r() < .6) stay(17.8 + r() * .8, 'at', -1, 'sit', hd); home(24); }
    else if (occ === 'son') { beili(.08); home(24); }
    else if (occ === 'beggar') { home(7); errand(lotIn(templeLots), 4 + r() * 3, 'begging', 18.5); home(24); }
    else if (occ === 'merchant' || occ === 'landlord') { home(8 + r() * 2); errand(r() < .6 ? lotIn(marketLots) : anyLot(['rich', 'wineshop'], nbWard()), 2 + r() * 2, 'business'); beili(.12); home(24); }
    else home(24);
    segs.sort((a, b) => a.t0 - b.t0); T.sched.set(key, { day, segs }); if (T.sched.size > 40000) T.sched.clear(); return segs;
  }
  // position on a schedule at hour h
  function where(pid, h, day = S.day) {
    if (!built && !build()) return null; const p = P[pid]; if (!p) return null;
    if (live.has(pid) && typeof CROWD !== 'undefined' && CROWD.info) { const f = CROWD.info(live.get(pid)); if (f && f.pid === pid) return { state: 'live', x: f.x, z: f.z, y: f.y, agent: f.i, lot: -1, act: 'here' }; }
    if (h === undefined) h = typeof G !== 'undefined' ? G.hour : 12;
    const segs = sched(pid, day); let s = segs[segs.length - 1]; for (const q of segs) if (h >= q.t0 && h < q.t1) { s = q; break; }
    if (s.k === 'go') { const rt = route(s.a, s.b); if (!rt) { const A = nav.nodes[s.a]; return { state: 'go', x: A.x, z: A.z, lot: -1, act: s.act, seg: s, noRoute: true }; } const f = (h - s.t0) / Math.max(1e-6, s.t1 - s.t0), [x, z, k] = along(rt, f * rt.len); return { state: 'go', x, z, lot: -1, act: s.act, seg: s, d: f * rt.len, k, rt }; }
    const n = nav.nodes[s.a] || { x: 0, z: 0 }; return { state: s.k, x: n.x, z: n.z, lot: s.lot, act: s.act, seg: s };
  }
  // current schedule segment at hour h
  function segAt(pid, h, day = S.day) { const segs = sched(pid, day); for (const q of segs) if (h >= q.t0 && h < q.t1) return q; return segs[segs.length - 1]; }
  // per-day bounding boxes of everyone's whereabouts (built incrementally, a few thousand people per call)
  let bbDay = -1, bb = null, bbDone = 0;
  function prepBoxes(n) { if (!built) return false; if (bbDay !== S.day) { bbDay = S.day; bbDone = 0; if (!bb || bb.length < P.length * 4) bb = new Float32Array(P.length * 4); }
    const N = nav.nodes; for (let c = 0; c < n && bbDone < P.length; c++, bbDone++) { const segs = sched(bbDone); let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const q of segs) { if (q.k !== 'go' && q.k !== 'at') continue; for (const nd of [q.a, q.b]) { if (nd === undefined || nd < 0) continue; const v = N[nd]; if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z; } }
      const o = bbDone * 4; bb[o] = x0; bb[o + 1] = z0; bb[o + 2] = x1; bb[o + 3] = z1; }
    return bbDone >= P.length; }
  // people who may be visible outdoors near (cx, cz) at hour h: [pid...] (walking or standing somewhere); excludes live, dead, overridden and retinue members
  function candidates(cx, cz, R, h, out) { out.length = 0; if (!built) return out; prepBoxes(3000); const day = S.day;
    const N = nav.nodes; est.length = 0;
    const consider = pid => { if (!visibleNow(pid, h, day)) return; const q = segAt(pid, h, day), A = N[q.a]; let d;
      let slack = 0; if (q.k === 'go') { const B = N[q.b], f = (h - q.t0) / Math.max(1e-6, q.t1 - q.t0), L = Math.hypot(B.x - A.x, B.z - A.z); d = Math.hypot(A.x + (B.x - A.x) * f - cx, A.z + (B.z - A.z) * f - cz); slack = L * .3 + 25; } // straight-line estimate (+ detour slack for the test)
      else d = Math.hypot(A.x - cx, A.z - cz);
      if (d - slack < R || track.has(pid)) { out.push(pid); est.push(d + slack * .5); } };
    for (let pid = 0; pid < bbDone; pid++) { const o = pid * 4; if (cx < bb[o] - R || cx > bb[o + 2] + R || cz < bb[o + 1] - R || cz > bb[o + 3] + R) continue; consider(pid); }
    for (const pid of track) if (pid >= bbDone) consider(pid);
    const ix = out.map((_, k) => k).sort((a, b) => est[a] - est[b]), o2 = ix.map(k => out[k]); out.length = 0; for (const v of o2) out.push(v); return out; } // nearest first
  const est = [];
  function visibleNow(pid, h, day) { if (live.has(pid) || S.dead[pid] !== undefined) return false; const p = P[pid]; if (p.master !== undefined && S.dead[p.master] === undefined) return false;
    const ov = override.get(pid); if (ov && ov.day === day && h < ov.until) return false; const q = segAt(pid, h, day); return q.k === 'go' || q.k === 'at'; }
  // ---------------- queries ----------------
  const VIS = { day: -1, m: null }, GUESTY = new Set(['candidate', 'official', 'scholar', 'merchant', 'son', 'landlord', 'clerk']);
  const fmtH = h => { const m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60; return String(hh % 24).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  const API = {
    get built() { return built; }, get people() { return P; }, get lots() { return LOTS; }, get wards() { return WARDS; }, get households() { return H; }, live, override, SPEED,
    build, route, along, lotAt: (x, z) => { build(); return lotAt(x, z); },
    // lot ids whose rectangle comes within r of (x, z)
    lotsNear(x, z, r, out = []) { build(); out.length = 0; const seen = new Set(); for (let gx = Math.floor((x - r) / 32); gx <= Math.floor((x + r) / 32); gx++) for (let gz = Math.floor((z - r) / 32); gz <= Math.floor((z + r) / 32); gz++) { const a = lotGrid.get(gx * 4096 + gz); if (!a) continue;
        for (const id of a) { if (seen.has(id)) continue; seen.add(id); const R = LOTS[id].r, dx = Math.max(R.x0 - x, 0, x - R.x1), dz = Math.max(R.z0 - z, 0, z - R.z1); if (dx * dx + dz * dz < r * r) out.push(id); } } return out; },
    person(pid) { build(); return P[pid] || null; },
    day(pid, day) { build(); return P[pid] ? sched(pid, day ?? S.day) : null; },
    where, track(pid, on = true) { if (on) track.add(pid); else track.delete(pid); }, get tracked() { return track; },
    find(q) { build(); if (typeof q === 'string') q = { text: q }; const out = []; for (const p of P) { if (out.length >= 200) break;
        if (q.text && !(p.name.includes(q.text) || p.call.includes(q.text) || p.occ === q.text || WARDS[p.ward].name === q.text)) continue;
        if (q.name && !(p.name.includes(q.name) || p.call.includes(q.name))) continue; if (q.occ && p.occ !== q.occ) continue; if (q.cls && p.cls !== q.cls) continue; if (q.type && p.type !== q.type) continue; if (q.ward && WARDS[p.ward].name !== q.ward) continue; out.push(p); } return out; },
    kill(pid) { build(); const p = P[pid]; if (!p || S.dead[pid] !== undefined) return false; S.dead[pid] = S.day; S.mourn[p.hh] = S.day; for (const k of [...T.sched.keys()]) if (P[(k / 8) | 0] && P[(k / 8) | 0].hh === p.hh) T.sched.delete(k); return true; },
    hurt(pid) { build(); if (!P[pid]) return false; S.hurt[pid] = S.day; T.sched.delete(pid * 8 + (S.day & 7)); return true; },
    isDead: pid => S.dead[pid] !== undefined, mourning: pid => P[pid] && (S.mourn[P[pid].hh] ?? -99) > S.day - 7,
    get state() { return JSON.stringify(S); }, load(js) { try { const o = typeof js === 'string' ? JSON.parse(js) : js; Object.assign(S, o); T.sched.clear(); } catch (e) { console.error('CENSUS.load', e); } },
    get dayNum() { return S.day; },
    // day counter: call every frame with the hour; counts wraps of the clock
    tick(h) { if (API._lh !== undefined && h < API._lh - 12) { S.day++; override.clear(); } API._lh = h; },
    stats() { build(); const o = { people: P.length, households: H.length, buildMs: +buildMs.toFixed(1), routes: nRoutes, routeMs: +routeMs.toFixed(1), wards: {}, cls: {}, occ: {} };
      for (const p of P) { const w = WARDS[p.ward].name; o.wards[w] = (o.wards[w] || 0) + 1; o.cls[p.cls] = (o.cls[p.cls] || 0) + 1; o.occ[p.occ] = (o.occ[p.occ] || 0) + 1; } return o; },
    describe(pid, day) { build(); const p = P[pid]; if (!p) return 'no such person'; const L = LOTS[p.home], w = where(pid); const segs = sched(pid, day ?? S.day);
      const lines = [`#${pid} ${p.call} (${p.name}), ${p.sex === 'f' ? 'woman' : 'man'} ${p.age}, ${p.occ} [${p.cls}${p.rank ? ', rank ' + p.rank : ''}] — lives in ${WARDS[L.ward].name} (${L.type} #${L.id})` + (p.work ? `, works at ${LOTS[p.work.lot] ? LOTS[p.work.lot].type + ' #' + p.work.lot + ' in ' + WARDS[LOTS[p.work.lot].ward].name : '?'}` : '') + (S.dead[pid] !== undefined ? ' — DEAD' : ''),
        `now: ${w ? w.state + ' ' + (w.act || '') + ' @ ' + w.x.toFixed(0) + ',' + w.z.toFixed(0) : '?'}`];
      for (const s of segs) lines.push(`  ${fmtH(s.t0)}–${fmtH(s.t1)} ${s.k.padEnd(4)} ${s.act}${s.k === 'go' ? ' → ' + (nav.nodes[s.b] ? nav.nodes[s.b].x.toFixed(0) + ',' + nav.nodes[s.b].z.toFixed(0) : '') : ''}`);
      if (p.retinue) lines.push('  retinue: ' + p.retinue.map(q => P[q].call + ' (' + P[q].occ + ')').join(', '));
      return lines.join('\n'); },
    // guests in a lot at hour h (people whose schedule has them 'in' a lot that is not their home: 北里 banquets, visits): [pid…].
    // Indexed once per day over everyone's schedule (~1 s for the whole city; the slice ~0.1 s).
    visitors(lid, h, day = S.day) { build(); if (VIS.day !== day) { VIS.day = day; VIS.m = new Map(); for (const p of P) { if (S.dead[p.pid] !== undefined || !GUESTY.has(p.occ)) continue; for (const q of sched(p.pid, day)) if (q.k === 'in' && q.lot >= 0 && q.lot !== p.home) { let a = VIS.m.get(q.lot); if (!a) VIS.m.set(q.lot, a = []); a.push([p.pid, q.t0, q.t1]); } } }
      const a = VIS.m.get(lid); if (!a) return []; const out = []; for (const [pid, t0, t1] of a) if (h >= t0 && h < t1) out.push(pid); return out; },
    seg: (pid, h, day) => { build(); return P[pid] ? segAt(pid, h ?? (typeof G !== 'undefined' ? G.hour : 12), day ?? S.day) : null; }, candidates, prepBoxes,
    rankCol: rank => rank <= 3 ? [.42, .2, .46] : rank <= 5 ? [.66, .16, .14] : rank <= 7 ? [.24, .44, .3] : [.24, .32, .52], // 紫 緋 綠 青
    _sched: sched, _exits: () => exits, fmtH,
  };
  return API;
})();
if (typeof module !== 'undefined') module.exports = CENSUS;
