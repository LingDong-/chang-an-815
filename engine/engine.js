// engine.js — EIGHT HUNDRED DRUMS engine: math, noise, procedural textures, mesh builder, rigs, renderer (log depth, ink edges,
// compact interleaved static meshes, instanced crowds), collision, input. Grew out of ref/engine.js (FIFTH WATCH).
'use strict';
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const rr = (a, b) => a + (b - a) * Math.random(), rpick = a => a[(Math.random() * a.length) | 0];
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
function RNG(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------- noise ----------------
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function hash3(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const wrapi = (i, p) => ((i % p) + p) % p;
function vnoise2(x, y, p, s) { // tileable with period p (lattice units)
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = wrapi(xi, p), x1 = wrapi(xi + 1, p), y0 = wrapi(yi, p), y1 = wrapi(yi + 1, p);
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}
function fbm2(x, y, p, oct, s) { let a = .5, t = 0, n = 0; for (let i = 0; i < oct; i++) { t += a * vnoise2(x, y, p, s + i * 31); n += a; x *= 2; y *= 2; p *= 2; a *= .5; } return t / n; }
function worley2(x, y, p, s) { // tileable cellular: returns [f1, f2, cellId]
  const xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = wrapi(cx, p), wy = wrapi(cy, p);
    const px = cx + hash2(wx, wy, s), py = cy + hash2(wx, wy, s + 7), d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, s + 13); } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}
function vnoise3(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const h = (i, j, k) => hash3(xi + i, yi + j, zi + k, s);
  return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), fx), lerp(h(0, 1, 0), h(1, 1, 0), fx), fy), lerp(lerp(h(0, 0, 1), h(1, 0, 1), fx), lerp(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function fbm3(x, y, z, oct, s) { let a = .5, t = 0, n = 0; for (let i = 0; i < oct; i++) { t += a * vnoise3(x, y, z, s + i * 31); n += a; x *= 2; y *= 2; z *= 2; a *= .5; } return t / n; }

// ---------------- mat4 (column-major) ----------------
const M4 = {
  new() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(o, a, b) {
    const r = M4._t;
    for (let c = 0; c < 4; c++) for (let rI = 0; rI < 4; rI++)
      r[c * 4 + rI] = a[rI] * b[c * 4] + a[4 + rI] * b[c * 4 + 1] + a[8 + rI] * b[c * 4 + 2] + a[12 + rI] * b[c * 4 + 3];
    o.set(r); return o;
  },
  _t: new Float32Array(16),
  persp(o, fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); o.fill(0); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  // T * Ry * Rx * Rz * S
  trs(o, tx, ty, tz, rx, ry, rz, sx = 1, sy = sx, sz = sx) {
    const cx = Math.cos(rx), sxn = Math.sin(rx), cy = Math.cos(ry), syn = Math.sin(ry), cz = Math.cos(rz), szn = Math.sin(rz);
    o[0] = (cy * cz + syn * sxn * szn) * sx; o[1] = cx * szn * sx; o[2] = (-syn * cz + cy * sxn * szn) * sx; o[3] = 0;
    o[4] = (-cy * szn + syn * sxn * cz) * sy; o[5] = cx * cz * sy; o[6] = (syn * szn + cy * sxn * cz) * sy; o[7] = 0;
    o[8] = syn * cx * sz; o[9] = -sxn * sz; o[10] = cy * cx * sz; o[11] = 0;
    o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1; return o;
  },
  inv(o, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return o; d = 1 / d;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return o;
  },
  tp(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
  td(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; },
};

// ---------------- textures (128x128 layers in one TEXTURE_2D_ARRAY) ----------------
const TS = 128;
const TEX = {
  defs: [], L: {},
  // fn(x, y) -> [r,g,b,a?] in 0..255. Use tN/tW helpers for tileable noise.
  add(name, fn) { if (name in this.L) return this.L[name]; this.L[name] = this.defs.length; this.defs.push({ name, fn }); return this.L[name]; },
  id(name) { const i = this.L[name]; if (i === undefined) { console.warn('no tex', name); return 0; } return i; },
  genLayer(data, l) {
    const d = this.defs[l], o = l * TS * TS * 4;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const c = d.fn(x, y), k = o + (y * TS + x) * 4;
      data[k] = clamp(c[0], 0, 255); data[k + 1] = clamp(c[1], 0, 255); data[k + 2] = clamp(c[2], 0, 255); data[k + 3] = c.length > 3 ? clamp(c[3], 0, 255) : 255;
    }
  },
  // a key that changes whenever any texture's name or code changes (for the IndexedDB cache)
  key() { let h = 2166136261; const s = this.defs.map(d => d.name + d.fn.toString()).join('|') + (window.UNIFONT ? Object.keys(UNIFONT).length : 0); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return this.defs.length + '_' + (h >>> 0).toString(36) + '_' + s.length; },
  // async: texture data from the cache, or generated in slices with progress callbacks (f 0..1), then stored
  async prepare(progress) {
    const n = this.defs.length, key = this.key(); let data = await TEXDB.get(key);
    if (data && data.length === TS * TS * 4 * n) { this.fromCache = true; return data; }
    data = new Uint8Array(TS * TS * 4 * n); let t = performance.now();
    for (let l = 0; l < n; l++) { this.genLayer(data, l); if (performance.now() - t > 40) { if (progress) progress(l / n); await new Promise(r => setTimeout(r, 0)); t = performance.now(); } }
    TEXDB.put(key, data); return data;
  },
  // bump: a tangent-space normal map per layer from the colour's luminance (lightly blurred height, wrapped central differences).
  // Cutout layers (foliage, grates) stay flat. Sampled with a derivative-built frame in FS_MAIN (no tangents in the vertex format).
  buildNormals(gl, data) {
    const n = this.defs.length, out = new Uint8Array(TS * TS * 4 * n), H = new Float32Array(TS * TS), B = new Float32Array(TS * TS), w = i => (i + TS) % TS;
    for (let l = 0; l < n; l++) { const o = l * TS * TS * 4, def = this.defs[l] || {}; let cut = 0;
      for (let j = 0; j < TS * TS; j++) { const i = o + j * 4; if (data[i + 3] < 250) cut++; H[j] = (data[i] * .3 + data[i + 1] * .55 + data[i + 2] * .15) / 255; }
      const k = cut > TS * TS * .02 ? 0 : (def.bump ?? 2.2);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += H[w(y + dy) * TS + w(x + dx)] * (dx || dy ? 1 : 2); B[y * TS + x] = a / 10; }
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const gx = (B[y * TS + w(x + 1)] - B[y * TS + w(x - 1)]) * k, gy = (B[w(y + 1) * TS + x] - B[w(y - 1) * TS + x]) * k, L = Math.hypot(gx, gy, 1), i = o + (y * TS + x) * 4;
        out[i] = Math.round((-gx / L * .5 + .5) * 255); out[i + 1] = Math.round((-gy / L * .5 + .5) * 255); out[i + 2] = Math.round((1 / L * .5 + .5) * 255); out[i + 3] = Math.round(255 * (def.sheen || 0)); } }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); const levels = Math.log2(TS) + 1; gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, TS, TS, n);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, TS, TS, n, gl.RGBA, gl.UNSIGNED_BYTE, out); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  },
  build(gl, data) {
    const n = this.defs.length;
    if (!data) { data = new Uint8Array(TS * TS * 4 * n); for (let l = 0; l < n; l++) this.genLayer(data, l); }
    this._data = data;
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    // mip chain built by hand: colour averaged over opaque texels; alpha keeps cutouts (grates, chains, foliage)
    // from dissolving at distance (coverage-preserving: a texel stays opaque if >= 1/4 of its children are)
    const levels = Math.log2(TS) + 1; gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, TS, TS, n);
    const soft = []; for (let l = 0; l < n; l++) { let k = 0; for (let i = l * TS * TS * 4 + 3; i < (l + 1) * TS * TS * 4; i += 4) if (data[i] > 12 && data[i] < 243) k++; soft.push(k > 40); }
    // hard cutouts: coverage-preserving mips — each level keeps the base level's fraction of opaque texels (threshold chosen per layer
    // on the box-filtered coverage), so sparse leaf cards neither fill in to solid rectangles nor dissolve at distance
    let cov = new Float32Array(n * TS * TS); const base = new Float32Array(n);
    for (let l = 0; l < n; l++) { let k = 0; for (let j = 0; j < TS * TS; j++) { const c = data[(l * TS * TS + j) * 4 + 3] >= 128 ? 1 : 0; cov[l * TS * TS + j] = c; k += c; } base[l] = k / (TS * TS); }
    let cur = data, sz = TS;
    for (let lv = 0; lv < levels; lv++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, lv, 0, 0, 0, sz, sz, n, gl.RGBA, gl.UNSIGNED_BYTE, cur);
      if (sz === 1) break; const ns = sz >> 1, nx = new Uint8Array(ns * ns * 4 * n), ncov = new Float32Array(ns * ns * n);
      for (let l = 0; l < n; l++) for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
        let r = 0, g = 0, b = 0, cnt = 0, op = 0;
        for (let k = 0; k < 4; k++) { const sx = x * 2 + (k & 1), sy = y * 2 + (k >> 1), i = ((l * sz + sy) * sz + sx) * 4; const a = cur[i + 3]; if (a >= 128) op++; const w = a / 255 + .001; r += cur[i] * w; g += cur[i + 1] * w; b += cur[i + 2] * w; cnt += w; }
        const o = ((l * ns + y) * ns + x) * 4; nx[o] = r / cnt; nx[o + 1] = g / cnt; nx[o + 2] = b / cnt; nx[o + 3] = soft[l] ? (cur[((l * sz + y * 2) * sz + x * 2) * 4 + 3] + cur[((l * sz + y * 2) * sz + x * 2 + 1) * 4 + 3] + cur[((l * sz + y * 2 + 1) * sz + x * 2) * 4 + 3] + cur[((l * sz + y * 2 + 1) * sz + x * 2 + 1) * 4 + 3]) / 4 : 0;
        if (!soft[l]) { const c = (cov[((l * sz + y * 2) * sz + x * 2)] + cov[((l * sz + y * 2) * sz + x * 2 + 1)] + cov[((l * sz + y * 2 + 1) * sz + x * 2)] + cov[((l * sz + y * 2 + 1) * sz + x * 2 + 1)]) / 4; ncov[(l * ns + y) * ns + x] = c; }
      }
      for (let l = 0; l < n; l++) { if (soft[l]) continue; const N = ns * ns, o0 = l * N, want = Math.round(base[l] * N); const H = new Uint32Array(257);
        for (let j = 0; j < N; j++) H[Math.min(256, Math.round(ncov[o0 + j] * 256))]++;
        let t = 257, acc = 0; while (t > 0 && acc + H[t - 1] <= want) acc += H[--t]; if (t > 256) t = 256; // smallest threshold whose count >= stays within the base coverage
        if (want > 0 && acc === 0) { t = 256; while (t > 1 && !H[t]) t--; } // keep at least the densest texels
        for (let j = 0; j < N; j++) nx[(o0 + j) * 4 + 3] = (want > 0 && Math.round(ncov[o0 + j] * 256) >= t && ncov[o0 + j] > 0) ? 255 : 0; }
      cov = ncov; cur = nx; sz = ns;
    }
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
};
// tiny IndexedDB store for generated texture data (any failure just means no cache)
const TEXDB = {
  open() { return this._p || (this._p = new Promise(res => { try { const r = indexedDB.open('drums', 1); r.onupgradeneeded = () => r.result.createObjectStore('tex'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } })); },
  async get(k) { const db = await this.open(); if (!db) return null; return new Promise(res => { try { const q = db.transaction('tex').objectStore('tex').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
  async put(k, v) { const db = await this.open(); if (!db) return; try { const tx = db.transaction('tex', 'readwrite'), st = tx.objectStore('tex'); st.clear(); st.put(v, k); } catch (e) { } },
};
const tN = (x, y, cells, oct = 4, s = 0) => fbm2(x / TS * cells, y / TS * cells, cells, oct, s);
const tW = (x, y, cells, s = 0) => worley2(x / TS * cells, y / TS * cells, cells, s);
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------------- mesh builder ----------------
const BOXC = [-1, -1, 1, -1, 1, 1, -1, 1], BOXUV = [1, 1];
// Vertex: pos3 nor3 uv2 col4(rgb + emissive) layer1 bone2 weight4
class MB {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.L = []; this.B = []; this.W = []; this.I = []; this.st = []; this.m = null; this.nm = null; this.col = [1, 1, 1]; this.emi = 0; this.layer = 0; this.bone = 0; this.slot = 0; }
  get nv() { return this.P.length / 3; }
  // state: tex (name), col [r,g,b], emi, bone, slot (crowd palette slot 0..7; 0 = fixed colour)
  s(o) { if (o.slot !== undefined) this.slot = o.slot; if (o.tex !== undefined) this.layer = typeof o.tex === 'string' ? TEX.id(o.tex) : o.tex; if (o.col) this.col = o.col; if (o.emi !== undefined) this.emi = o.emi; if (o.bone !== undefined) this.bone = o.bone; return this; }
  push(m) { this.st.push([this.m, this.nm]); const nm = this.m ? M4.mul(M4.new(), this.m, m) : m.slice(); this.m = nm; this.nm = M4.inv(M4.new(), nm); return this; } // nm = inverse (used transposed for normals)
  pop() { [this.m, this.nm] = this.st.pop(); return this; }
  T(tx, ty, tz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { return this.push(M4.trs(M4.new(), tx, ty, tz, rx, ry, rz, sx, sy, sz)); }
  v(x, y, z, nx, ny, nz, u, v, b0, b1, w1) {
    if (this.m) { const m = this.m, i = this.nm, X = x, Y = y, Z = z, a = nx, b = ny, c = nz;
      x = m[0] * X + m[4] * Y + m[8] * Z + m[12]; y = m[1] * X + m[5] * Y + m[9] * Z + m[13]; z = m[2] * X + m[6] * Y + m[10] * Z + m[14];
      nx = i[0] * a + i[1] * b + i[2] * c; ny = i[4] * a + i[5] * b + i[6] * c; nz = i[8] * a + i[9] * b + i[10] * c; }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    this.P.push(x, y, z); this.N.push(nx / l, ny / l, nz / l); this.U.push(u, v); this.C.push(this.col[0], this.col[1], this.col[2], this.emi); this.L.push(this.layer);
    if (b0 === undefined) { this.B.push(this.bone, this.slot); this.W.push(1, 0, 0, 0); } else { this.B.push(b0, b1); this.W.push(1 - w1, w1, 0, 0); }
    return this.nv - 1;
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  quad(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
  // generic grid: rows x cols, f(i,j)->[x,y,z,u,v,(b0,b1,w1)]; wrap=true wraps columns (smooth seam). Normals from faces.
  grid(rows, cols, f, wrap, fallbackN, flip) {
    const R = rows, C = cols, cc = wrap ? C : C + 1, pts = [];
    for (let i = 0; i <= R; i++) for (let j = 0; j < cc; j++) pts.push(f(i, j));
    const nrm = new Float32Array(pts.length * 3), idx = (i, j) => i * cc + (wrap ? j % C : j);
    for (let i = 0; i < R; i++) for (let j = 0; j < (wrap ? C : C); j++) {
      const a = pts[idx(i, j)], b = pts[idx(i + 1, j)], c = pts[idx(i + 1, j + 1)], d = pts[idx(i, j + 1)];
      const addN = (p, q, r, ks) => { const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const k of ks) { nrm[k * 3] += nx; nrm[k * 3 + 1] += ny; nrm[k * 3 + 2] += nz; } };
      addN(a, b, c, [idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)]); addN(a, c, d, [idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
    }
    const base = this.nv, sg = flip ? -1 : 1;
    for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
      const k = idx(i, j), p = (wrap && j === C) ? f(i, C) : pts[k];
      let nx = nrm[k * 3] * sg, ny = nrm[k * 3 + 1] * sg, nz = nrm[k * 3 + 2] * sg;
      if (nx * nx + ny * ny + nz * nz < 1e-12 && fallbackN) [nx, ny, nz] = fallbackN(i, j, p);
      this.v(p[0], p[1], p[2], nx, ny, nz, p[3], p[4], p[5], p[6], p[7]);
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const a = base + i * (C + 1) + j, b = a + C + 1;
      if (flip) this.quad(a, a + 1, b + 1, b); else this.quad(a, b, b + 1, a + 1);
    }
    return this;
  }
  // ellipsoid; o: {seg, ring, disp(x,y,z)->scalar (radial offset in units of r), uvs:[us,vs], b0,b1,w(x,y,z)->weight}
  ell(cx, cy, cz, rx, ry, rz, o = {}) {
    const seg = o.seg || 14, ring = o.ring || 10, us = o.uvs ? o.uvs[0] : 1, vs = o.uvs ? o.uvs[1] : 1;
    return this.grid(ring, seg, (i, j) => {
      const th = i / ring * PI, ph = j / seg * TAU; let x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      const d = o.disp ? 1 + o.disp(x, y, z) : 1;
      const p = [cx + x * rx * d, cy + y * ry * d, cz + z * rz * d, j / seg * us, i / ring * vs];
      if (o.bw) p.push(...o.bw(p[0], p[1], p[2]));
      return p;
    }, true, (i, j, p) => [p[0] - cx, p[1] - cy, p[2] - cz], true);
  }
  // eyeball facing +Z (iris at front pole); uses 'eye' texture with iris at v=0
  eye(cx, cy, cz, r, o = {}) {
    const seg = o.seg || 12, ring = o.ring || 8;
    return this.grid(ring, seg, (i, j) => { const th = i / ring * PI, ph = j / seg * TAU; return [cx + Math.sin(th) * Math.cos(ph) * r, cy + Math.sin(th) * Math.sin(ph) * r, cz + Math.cos(th) * r, j / seg, i / ring]; }, true, (i, j, p) => [p[0] - cx, p[1] - cy, p[2] - cz]);
  }
  // lathe around Y: prof = [[r,y],...]; repeat a point to make a crease. o: {seg, uvs:[us,vs], disp(ang,y,r)->dr, bw(x,y,z)}
  lathe(prof, o = {}) {
    const seg = o.seg || 16, us = o.uvs ? o.uvs[0] : 1, vs = o.uvs ? o.uvs[1] : 1; let L = [0];
    for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    const tot = L[L.length - 1] || 1, a0 = o.a0 || 0, a1 = o.a1 === undefined ? a0 + TAU : o.a1, full = a1 - a0 >= TAU - 1e-6;
    return this.grid(prof.length - 1, seg, (i, j) => {
      const a = a0 + j / seg * (a1 - a0); let r = prof[i][0]; if (o.disp) r += o.disp(a, prof[i][1], r);
      const p = [Math.cos(a) * r, prof[i][1], Math.sin(a) * r, j / seg * us, L[i] / tot * vs]; if (o.bw) p.push(...o.bw(p[0], p[1], p[2])); return p;
    }, full, (i, j, p) => [0, i === 0 ? -1 : 1, 0]);
  }
  // tube along Catmull-Rom path. o: {r: number|[per point]|fn(t), seg, steps, cap (bool|[start,end]), bones:[per point], disp(t,ang)->dr, uvs:[us,vs], twist}
  tube(pts, o = {}) {
    const n = pts.length, steps = o.steps || 4, seg = o.seg || 8, S = (n - 1) * steps;
    const cr = (t) => { // position at param t in [0,n-1]
      const i = Math.min(Math.floor(t), n - 2), f = t - i, p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
      const f2 = f * f, f3 = f2 * f;
      return [0, 1, 2].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3));
    };
    const rad = (t) => { const r = o.r === undefined ? .1 : o.r; if (typeof r === 'number') return r; if (typeof r === 'function') return r(t / (n - 1)); const i = Math.min(Math.floor(t), n - 2), f = t - i; return lerp(r[i], r[i + 1], f); };
    const cs = o.cap === undefined ? [true, true] : (Array.isArray(o.cap) ? o.cap : [o.cap, o.cap]), capR = o.capRows || 3;
    // centers and frames
    const C = [], T = []; for (let k = 0; k <= S; k++) C.push(cr(k / steps));
    for (let k = 0; k <= S; k++) { const a = C[Math.max(k - 1, 0)], b = C[Math.min(k + 1, S)]; let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...t) || 1; T.push(t.map(v => v / l)); }
    let t0 = T[0], up = Math.abs(t0[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    let nn = [up[1] * t0[2] - up[2] * t0[1], up[2] * t0[0] - up[0] * t0[2], up[0] * t0[1] - up[1] * t0[0]]; let l = Math.hypot(...nn); nn = nn.map(v => v / l);
    const Nf = [], Bf = [];
    for (let k = 0; k <= S; k++) { const t = T[k]; const d = nn[0] * t[0] + nn[1] * t[1] + nn[2] * t[2]; nn = [nn[0] - t[0] * d, nn[1] - t[1] * d, nn[2] - t[2] * d]; l = Math.hypot(...nn) || 1; nn = nn.map(v => v / l); Nf.push(nn); Bf.push([t[1] * nn[2] - t[2] * nn[1], t[2] * nn[0] - t[0] * nn[2], t[0] * nn[1] - t[1] * nn[0]]); }
    const bw = (t) => { // t in point-index space
      if (!o.bones) return []; const B = o.bones, i = Math.min(Math.floor(t), n - 1), f = t - i;
      if (f < .5) return i > 0 ? [B[i - 1], B[i], .5 + f] : [B[i], B[i], 0];
      return i + 1 < n ? [B[i], B[i + 1], f - .5] : [B[i], B[i], 0];
    };
    // rows: cap0 rows, body rows, cap1 rows
    const rows = [];
    if (cs[0]) for (let c = 0; c < capR; c++) rows.push({ k: 0, a: (1 - c / capR) * PI / 2 * -1 });
    for (let k = 0; k <= S; k++) rows.push({ k, a: 0 });
    if (cs[1]) for (let c = 1; c <= capR; c++) rows.push({ k: S, a: c / capR * PI / 2 });
    const us = o.uvs ? o.uvs[0] : 1, vs = o.uvs ? o.uvs[1] : n - 1;
    return this.grid(rows.length - 1, seg, (i, j) => {
      const R = rows[i], k = R.k, t = k / steps, ang = j / seg * TAU + (o.twist || 0) * t;
      let r = rad(t); if (o.disp) r += o.disp(t / (n - 1), ang);
      const ca = Math.cos(R.a), sa = Math.sin(R.a), rr2 = r * ca, ext = r * sa, cA = Math.cos(ang), sA = Math.sin(ang);
      const c = C[k], tt = T[k], N = Nf[k], B = Bf[k];
      const p = [c[0] + (N[0] * cA + B[0] * sA) * rr2 + tt[0] * ext, c[1] + (N[1] * cA + B[1] * sA) * rr2 + tt[1] * ext, c[2] + (N[2] * cA + B[2] * sA) * rr2 + tt[2] * ext, j / seg * us, (t / (n - 1)) * vs];
      return p.concat(bw(t));
    }, true, (i, j, p) => { const R = rows[i], tt = T[R.k]; return R.a < 0 ? tt.map(v => -v) : tt; }, true);
  }
  // axis-aligned box (in current transform). o: {world: uv scale (world-space tiling), uv:[u,v] repeats, faces:{top:tex,...}}
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, ws = o.world;
    const F = [[[1, 0, 0], [0, 0, -1], [0, 1, 0], hx, sz, sy], [[-1, 0, 0], [0, 0, 1], [0, 1, 0], hx, sz, sy], [[0, 1, 0], [1, 0, 0], [0, 0, -1], hy, sx, sz], [[0, -1, 0], [1, 0, 0], [0, 0, 1], hy, sx, sz], [[0, 0, 1], [1, 0, 0], [0, 1, 0], hz, sx, sy], [[0, 0, -1], [-1, 0, 0], [0, 1, 0], hz, sx, sy]];
    const names = ['px', 'nx', 'top', 'bot', 'pz', 'nz'], keep = this.layer;
    F.forEach(([n, u, v, d, su, sv], fi) => {
      if (o.skip && o.skip.includes(names[fi])) return;
      if (o.faces && o.faces[names[fi]]) this.layer = TEX.id(o.faces[names[fi]]);
      const b = this.nv, m = this.m; let axis = 0;
      if (ws) { const wn = m ? [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]] : n, ax = Math.abs(wn[0]), ay = Math.abs(wn[1]), az = Math.abs(wn[2]); axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2; }
      const r = o.uv || BOXUV;
      for (let q = 0; q < 4; q++) {
        const a = BOXC[q * 2], c = BOXC[q * 2 + 1];
        const x = cx + n[0] * d + u[0] * a * su / 2 + v[0] * c * sv / 2, y = cy + n[1] * d + u[1] * a * su / 2 + v[1] * c * sv / 2, z = cz + n[2] * d + u[2] * a * su / 2 + v[2] * c * sv / 2;
        let U, V;
        if (ws) { let wx = x, wy = y, wz = z; if (m) { wx = m[0] * x + m[4] * y + m[8] * z + m[12]; wy = m[1] * x + m[5] * y + m[9] * z + m[13]; wz = m[2] * x + m[6] * y + m[10] * z + m[14]; } if (axis === 1) { U = wx; V = wz; } else if (axis === 0) { U = wz; V = -wy; } else { U = wx; V = -wy; } U /= ws; V /= ws; }
        else { U = (a + 1) / 2 * r[0]; V = (1 - c) / 2 * r[1]; }
        this.v(x, y, z, n[0], n[1], n[2], U, V);
      }
      this.quad(b, b + 1, b + 2, b + 3);
      this.layer = keep;
    });
    return this;
  }
  cyl(x, y0, z, r, y1, o = {}) { this.T(x, 0, z); this.lathe([[0, y0], [r, y0], [r, y0], [r, y1], [r, y1], [0, y1]], o); return this.pop(); }
  // crossed alpha-tested quads (foliage, chains); w,h size, base at (x,y,z)
  cross(x, y, z, w, h, n = 2, rot = 0) {
    for (let k = 0; k < n; k++) {
      const a = rot + k * PI / n, dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2, b = this.nv;
      this.v(x - dx, y, z - dz, 0, 1, 0, 0, 1); this.v(x + dx, y, z + dz, 0, 1, 0, 1, 1); this.v(x + dx, y + h, z + dz, 0, 1, 0, 1, 0); this.v(x - dx, y + h, z - dz, 0, 1, 0, 0, 0);
      this.quad(b, b + 1, b + 2, b + 3);
    }
    return this;
  }
  // flat quad from 4 points (CCW seen from front)
  q4(a, b, c, d, uv = [1, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], i = this.nv;
    this.v(...a, ...n, 0, uv[1]); this.v(...b, ...n, uv[0], uv[1]); this.v(...c, ...n, uv[0], 0); this.v(...d, ...n, 0, 0); this.quad(i, i + 1, i + 2, i + 3); return this;
  }
  add(o) { // merge another MB (with current transform)
    const b = this.nv, keepC = this.col, keepE = this.emi, keepL = this.layer;
    for (let i = 0; i < o.nv; i++) {
      this.col = [o.C[i * 4], o.C[i * 4 + 1], o.C[i * 4 + 2]]; this.emi = o.C[i * 4 + 3]; this.layer = o.L[i];
      this.v(o.P[i * 3], o.P[i * 3 + 1], o.P[i * 3 + 2], o.N[i * 3], o.N[i * 3 + 1], o.N[i * 3 + 2], o.U[i * 2], o.U[i * 2 + 1], o.B[i * 2], o.B[i * 2 + 1], o.W[i * 4 + 1]);
    }
    for (const i of o.I) this.I.push(b + i);
    this.col = keepC; this.emi = keepE; this.layer = keepL; return this;
  }
  upload() { return R.mesh(this); }
}

// pack an MB into the compact interleaved format (pure JS: usable in a worker). Returns {vb: ArrayBuffer, ib, bs, box}
function MBpack(mb) {
  const n = mb.nv, ab = new ArrayBuffer(n * 32), f = new Float32Array(ab), i8 = new Int8Array(ab), u8 = new Uint8Array(ab), u16 = new Uint16Array(ab);
  const P = mb.P, N = mb.N, U = mb.U, C = mb.C, L = mb.L, B = mb.B, W = mb.W;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) {
    const o = i * 8, b = i * 32, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; f[o] = x; f[o + 1] = y; f[o + 2] = z;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    i8[b + 12] = Math.round(N[i * 3] * 127); i8[b + 13] = Math.round(N[i * 3 + 1] * 127); i8[b + 14] = Math.round(N[i * 3 + 2] * 127); i8[b + 15] = Math.round(W[i * 4 + 1] * 127);
    f[o + 4] = U[i * 2]; f[o + 5] = U[i * 2 + 1];
    for (let k = 0; k < 4; k++) { const c = C[i * 4 + k] * 127.5; u8[b + 24 + k] = c < 0 ? 0 : c > 255 ? 255 : c + .5; }
    u16[b / 2 + 14] = L[i]; u8[b + 30] = B[i * 2]; u8[b + 31] = B[i * 2 + 1];
  }
  const ib = n > 65535 ? new Uint32Array(mb.I) : new Uint16Array(mb.I);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  return { vb: ab, ib, bs: [cx, cy, cz, n ? Math.hypot(x1 - cx, y1 - cy, z1 - cz) : 0], box: [x0, y0, z0, x1, y1, z1] };
}
function vattr(gl) {
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, true, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 32, 24);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.UNSIGNED_SHORT, false, 32, 28);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 2, gl.UNSIGNED_BYTE, false, 32, 30);
}

// ---------------- rig (skeleton) ----------------
// Bones have rest positions in MODEL space and identity rest rotation. Pose: per-bone rot (rx,ry,rz), offset, scale.
class Rig {
  constructor() { this.par = []; this.rest = []; }
  bone(parent, x, y, z) { this.par.push(parent); this.rest.push([x, y, z]); return this.par.length - 1; }
  // chain of bones through points (first bone at pts[0]); returns indices
  chain(parent, pts) { const ids = []; let p = parent; for (const q of pts) { p = this.bone(p, q[0], q[1], q[2]); ids.push(p); } return ids; }
  get n() { return this.par.length; }
}
class Pose {
  constructor(rig) { const n = rig.n; this.rig = rig; this.rot = new Float32Array(n * 3); this.off = new Float32Array(n * 3); this.scl = new Float32Array(n).fill(1); this.world = new Float32Array(n * 16); this.skin = new Float32Array(Math.max(n, 1) * 16); this._m = M4.new(); this._w = M4.new(); }
  r(i, x, y, z) { this.rot[i * 3] = x; this.rot[i * 3 + 1] = y; this.rot[i * 3 + 2] = z; }
  o(i, x, y, z) { this.off[i * 3] = x; this.off[i * 3 + 1] = y; this.off[i * 3 + 2] = z; }
  reset() { this.rot.fill(0); this.off.fill(0); this.scl.fill(1); }
  compute() {
    const R = this.rig, m = this._m, w = this._w;
    for (let i = 0; i < R.n; i++) {
      const p = R.par[i], rs = R.rest[i], pr = p >= 0 ? R.rest[p] : [0, 0, 0];
      M4.trs(m, rs[0] - pr[0] + this.off[i * 3], rs[1] - pr[1] + this.off[i * 3 + 1], rs[2] - pr[2] + this.off[i * 3 + 2], this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2], this.scl[i]);
      if (p >= 0) { M4.mul(w, this.world.subarray(p * 16, p * 16 + 16), m); this.world.set(w, i * 16); } else this.world.set(m, i * 16);
      // skin = world * T(-rest)
      const W = this.world, o = i * 16, S = this.skin;
      for (let k = 0; k < 12; k++) S[o + k] = W[o + k];
      S[o + 12] = W[o + 12] - (W[o] * rs[0] + W[o + 4] * rs[1] + W[o + 8] * rs[2]);
      S[o + 13] = W[o + 13] - (W[o + 1] * rs[0] + W[o + 5] * rs[1] + W[o + 9] * rs[2]);
      S[o + 14] = W[o + 14] - (W[o + 2] * rs[0] + W[o + 6] * rs[1] + W[o + 10] * rs[2]);
      S[o + 15] = 1;
    }
  }
  // posed model-space position of the point that sits at model-space REST position (x,y,z) and follows bone i
  sp(i, x = 0, y = 0, z = 0) { const S = this.skin, o = i * 16; return [S[o] * x + S[o + 4] * y + S[o + 8] * z + S[o + 12], S[o + 1] * x + S[o + 5] * y + S[o + 9] * z + S[o + 13], S[o + 2] * x + S[o + 6] * y + S[o + 10] * z + S[o + 14]]; }
  // model-space point attached to bone i (local offset in bone's rest-aligned frame)
  pt(i, lx = 0, ly = 0, lz = 0) { const W = this.world, o = i * 16; return [W[o] * lx + W[o + 4] * ly + W[o + 8] * lz + W[o + 12], W[o + 1] * lx + W[o + 5] * ly + W[o + 9] * lz + W[o + 13], W[o + 2] * lx + W[o + 6] * ly + W[o + 10] * lz + W[o + 14]]; }
}

// ---------------- renderer ----------------
// Compact interleaved vertex (32 bytes): pos f32x3 | normal i8x3 + skin weight i8 | uv f32x2 | colour u8x4 (rgb/2, emissive/2) | layer u16 | bone u8, bone2-or-palette-slot u8
const VATTR = `layout(location=0) in vec3 aP; layout(location=1) in vec4 aN; layout(location=2) in vec2 aU; layout(location=3) in vec4 aC; layout(location=4) in float aL; layout(location=5) in vec2 aB;`;
const VS_MAIN = `#version 300 es
${VATTR}
uniform mat4 uVP, uM; uniform mat4 uBn[48]; uniform int uSkin; uniform float uTime, uWave; uniform vec2 uScroll; uniform int uHide; uniform vec4 uLampK; // lamp groups (aB.x of static emissive vertices): 0 = always, 1 evening, 2 late, 3 all night // bit g set = hide static vertices of visibility group g (aB.y; 0 = always shown)
out vec3 vP; out vec3 vN; out vec2 vU; out vec4 vC; flat out int vL; out vec4 vW; out float vD;
void main(){
  vec4 p=vec4(aP,1.); vec3 n=aN.xyz; float w1=aN.w;
  if(uSkin==1){ mat4 s=uBn[int(aB.x+.5)]*(1.-w1)+uBn[int(aB.y+.5)]*w1; p=s*p; n=mat3(s)*n; }
  vec4 w=uM*p;
  if(uWave>0.) w.y+=(sin(w.x*.9+uTime*1.7)+sin(w.z*1.1-uTime*1.3))*uWave;
  vP=w.xyz; vN=mat3(uM)*n; vU=aU+uScroll*uTime; vC=aC*2.; vL=int(aL+.5); vW=aC*2.;
  gl_Position=uVP*w; vD=1.+gl_Position.w;
  if(uSkin==0){ int g=int(aB.y+.5); if(g>0 && g<31 && ((uHide>>g)&1)==1) gl_Position=vec4(0.,0.,2.,1.); int lg=int(aB.x+.5); if(lg>0&&lg<4&&aC.a>0.){ float k=lg==1?uLampK.y:lg==2?uLampK.z:uLampK.w; vC.a*=k; vW.a*=k; } } // the lamps of a room go out on its schedule
}`;
// Instanced crowd vertex shader (people.js owns the conventions): procedurally animated skinned people and animals, 16 bones, 2-bone blending.
// Vertex: aB.x = bone (0..31) | palette slot << 5 (slot 0 = fixed vertex colour, 1..4 = instance colours iC0..iC3 × vertex colour); aB.y = second bone; aN.w = its weight.
// Models face +Z; instance yaw a turns +Z toward (sin a, cos a) (yaw = atan2(dx, dz)). Pivots (rest joint positions, model space) come from R.crowdBatch(mesh, cap, piv[16]).
// Humans: 0 pelvis (root) 1 chest 2 head 3 L upper arm 4 L forearm+hand 5 R upper arm 6 R forearm+hand 7 L thigh 8 L shin 9 L foot 10 R thigh 11 R shin 12 R foot
//         13 right-hand item (on 6) 14 left-hand item (on 4) 15 chest item (on 1). Left = +x.
// Instance: iA = (x, y, z, yaw) with y = ground/seat height; iB = (anim + 100*flags, phase, amount, scale); iC0..iC3 = palette colours (.a of iC3 = brightness).
// flags: 1 hides bone 13, 2 hides bone 14, 4 shows slot-5 headgear (straw hat) (animals: 13 rider, 14 load). phase = gait phase (radians; advanced from ground speed on the CPU) or a random seed for idles.
// amount = stride amplitude (thigh swing, radians) for walking anims.
// anims: 0 stand 1 walk 2 work/hammer 3 talk 4 carry pole 5 sit on the ground 6 sweep/hoe 7 run 8 bow 9 drink 10 look around 11 haggle 12 squat 13 read
//        14 walk with a load on the head 15 heavy load on the back 16 hands in sleeves 17 hawk (call out) 18 sit cross-legged on a 榻/mat (y = seat top) 19 kneel (跪坐)
//        20 play the pipa (seated) 21 pour/serve 22 write (seated) 23 drink seated 24 talk seated
// Quadrupeds (anim >= 40: 40 stand 41 walk 42 trot 43 graze/peck 44 lie down): 0 body 1 neck 2 head 3/4 FL upper/lower 5/6 FR 7/8 BL 9/10 BR 11 tail 12 wheel (spins with phase) 13 rider 14 load 15 rider arms.
const VS_CROWD = `#version 300 es
${VATTR}
layout(location=6) in vec4 iA; layout(location=7) in vec4 iB; layout(location=8) in vec4 iC0; layout(location=9) in vec4 iC1; layout(location=10) in vec4 iC2; layout(location=11) in vec4 iC3;
uniform mat4 uVP; uniform vec3 uPiv[16]; uniform float uTime;
out vec3 vP; out vec3 vN; out vec2 vU; out vec4 vC; flat out int vL; out vec4 vW; out float vD;
mat3 RX(float a){ float c=cos(a),s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 RY(float a){ float c=cos(a),s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 RZ(float a){ float c=cos(a),s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
const int PH[16]=int[16](-1,0,1,1,3,1,5,0,7,8,0,10,11,6,4,1);
const int PQ[16]=int[16](-1,0,1,0,3,0,5,0,7,0,9,0,0,0,0,13);
vec3 Rb[16]; vec3 Ob[16]; bool QD; float seatK=0., hipYg=0.; // seatK > 0: seated (跪坐): the robe drapes into a mound over the folded legs
mat3 BM(int b){ vec3 r=Rb[b]; mat3 m=RX(r.x); if(r.z!=0.) m=m*RZ(r.z); if(r.y!=0.) m=RY(r.y)*m; return m; }
void xf(int b, inout vec3 p, inout vec3 n){ for(int k=0;k<6;k++){ if(b<0) break; mat3 m=BM(b); p=m*(p-uPiv[b])+uPiv[b]+Ob[b]; n=m*n; b=QD?PQ[b]:PH[b]; } }
float tri(float s){ return s<.5 ? 1.-4.*s : -1.+4.*(s-.5); }
void main(){
  int bx=int(aB.x+.5), b0=bx&31, sl=bx>>5, b1=int(aB.y+.5); float w1=aN.w;
  int fl=int(iB.x*.01+.001), an=int(iB.x-float(fl)*100.+.5);
  float ph=iB.y, A=iB.z, tt=uTime+ph*3.7;
  for(int i=0;i<16;i++){ Rb[i]=vec3(0.); Ob[i]=vec3(0.); }
  QD=an>=40;
  bool hide=((b0==13||(an>=40&&b0==15))&&(fl&1)!=0)||(b0==14&&(fl&2)!=0); // animals: hiding the rider hides his arms (15) too
  if(sl==5&&(fl&4)==0) hide=true;
  if(sl==7&&(an!=25&&an!=26||b1==1&&an!=26||b1==2&&an!=25)) hide=true; // slot 7 = bedding (quilt; pillows: b1 1 = for the back, 2 = for the side), shown only asleep // slot 5 = optional headgear (straw hat 笠), shown with flag 4
  if(QD){
    float w=(an==41||an==42)?A:0., g=an==42?1.35:1.;
    // leg phase offsets: walk = lateral sequence (LH, LF, RH, RF), trot = diagonal pairs
    float offs[4]=float[4](an==42?0.:1.5708, an==42?3.1416:4.7124, an==42?3.1416:0., an==42?0.:3.1416);
    float lowest=1e3;
    for(int L=0;L<4;L++){
      float s=fract((ph+offs[L])/6.2832), sw, fx;
      if(s<.6){ sw=mix(.32,-.32,s/.6); fx=.03+sin(s/.6*3.1416)*.04; } else { float u=(s-.6)/.4; sw=mix(-.32,.32,smoothstep(0.,1.,u)); fx=sin(u*3.1416)*(L<2?1.25:1.0); }
      int up=3+L*2; float a=sw*w*g; Rb[up].x=-a; Rb[up+1].x=fx*w*(L<2?1.:.85);
      float Lg=uPiv[up].y; if(Lg>.05) lowest=min(lowest, Lg*(1.-cos(a)) + (s<.6?0.:1.));   // stance legs keep the body on the ground
    }
    if(an==44){ // lying down (dogs): forelegs forward, hind legs folded, body on the ground
      float hb=uPiv[3].y*.8; Ob[0].y=-hb; Rb[3].x=-1.45; Rb[5].x=-1.45; Rb[4].x=.1; Rb[6].x=.1; Rb[7].x=-1.1; Rb[9].x=-1.1; Rb[8].x=2.4; Rb[10].x=2.4; lowest=0.;
      Rb[1].x=.25; Rb[2].x=sin(uTime*.3+ph)*.1; }
    float bob=w*.018*g; Ob[0].y+=-(lowest<1e2?lowest:0.)-abs(sin(ph*(an==42?1.:2.)))*bob*.5; Rb[0].x=sin(ph*2.)*.01*w;
    float graze=an==43?1.:0.;
    Rb[1].x+=graze*.95+sin(ph*2.)*.06*w+sin(uTime*.4+ph)*.03*(1.-w); Rb[1].y=an==40?sin(uTime*.23+ph*3.)*.2:0.;
    Rb[2].x+=graze*.25+sin(uTime*.9+ph)*.03+(graze>0.?sin(uTime*5.+ph)*.08:0.); Rb[11].z=sin(uTime*1.3+ph)*.15+sin(uTime*3.1+ph*2.)*.05; Rb[11].x=.1+sin(uTime*.7+ph)*.05;
    Rb[12].x=ph*.9; Ob[13].y=abs(cos(ph*2.))*.015*w;
  } else {
    vec3 piv7=uPiv[7], piv8=uPiv[8], piv9=uPiv[9];
    float hipY=piv7.y, Lt=piv7.y-piv8.y, Ls=piv8.y-piv9.y, ankY=piv9.y;
    float th[2]=float[2](0.,0.), kn[2]=float[2](.04,.04), fw[2]=float[2](0.,0.), sp[2]=float[2](.03,.03);
    float ua[2]=float[2](.02,.02), uz[2]=float[2](.07,.07), el[2]=float[2](.18,.18);
    vec3 rS=vec3(0.), rH=vec3(0.), rP=vec3(0.); float seat=-1., lift=0., sleep=0.;
    bool gaitA=an==1||an==4||an==7||an==14||an==15;
    if(gaitA){
      float run=an==7?1.:0., st=run>.5?.38:.5;
      for(int i=0;i<2;i++){ float s=fract((ph+float(i)*3.1416)/6.2832);
        // mostly forward reach: the trailing leg only goes back to -Bk*A, little heel lift (keeps feet inside long robes)
        float Bk=run>.5?.55:.4;
        if(s<st){ float u=s/st; th[i]=mix(A,-Bk*A,u); kn[i]=.05+sin(u*3.1416)*(.08+run*.25); fw[i]=-.12*smoothstep(.8,1.,u); }
        else { float u=(s-st)/(1.-st); th[i]=mix(-Bk*A,A,smoothstep(0.,1.,u)); kn[i]=sin(u*3.1416)*(.38+A*.5+run*.55)*(1.-.35*u); fw[i]=.18*sin(u*3.1416)-.08*(1.-u); }
      }
      ua[0]=th[1]*.7-.03; ua[1]=th[0]*.7-.03; el[0]=.2+max(0.,ua[0])*.6+run*1.1; el[1]=.2+max(0.,ua[1])*.6+run*1.1;
      rS.y=(th[0]-th[1])*.12; rP.y=-(th[0]-th[1])*.1; rP.z=sin(ph)*.025; rS.x=.03+run*.18; rH.x=-run*.1;
      lift=run*abs(sin(ph))*.05;
      if(an==4){ ua[1]=.95; uz[1]=.35; el[1]=1.75; rS.x=.06; }
      if(an==14){ ua[0]=.2; uz[0]=.5; el[0]=2.6; rH.x=-.04; }
      if(an==15){ rS.x=.35; rH.x=-.35; ua[0]=.25; ua[1]=.25; el[0]=1.6; el[1]=1.6; uz[0]=.12; uz[1]=.12; }
    } else if(an==0||an==10){ float sw=sin(tt*.31); rP.z=sw*.02; th[0]=.02; th[1]=-.02; sp[0]=.05+sw*.02; sp[1]=.05-sw*.02; rH.y=sin(uTime*.37+ph*3.)*(an==10?.9:.3); rH.x=sin(uTime*.23+ph)*.05; ua[0]=sin(tt*.4)*.03; }
    else if(an==2){ float h=pow(max(0.,sin(tt*2.6)),3.); sp[0]=.14; sp[1]=.14; kn[0]=.15; kn[1]=.15; th[0]=.1; th[1]=.1; rS.x=.22+h*.12; rH.x=.15; ua[1]=2.3-h*1.9; el[1]=.4; ua[0]=1.0-h*.4; el[0]=.9; uz[0]=-.1; }
    else if(an==3){ ua[1]=.45+sin(uTime*2.1+ph)*.25; el[1]=1.1+sin(uTime*1.7+ph)*.3; uz[1]=.1; rH.y=sin(uTime*.7+ph)*.25; rH.x=sin(uTime*3.+ph)*.04; rS.y=sin(uTime*.5+ph)*.06; ua[0]=.1; el[0]=.3; th[0]=.04; }
    else if(an==5){ seat=.2; th[0]=2.25; th[1]=2.3; kn[0]=2.25; kn[1]=2.3; sp[0]=.22; sp[1]=.22; fw[0]=0.; fw[1]=0.; ua[0]=.85; ua[1]=.85; el[0]=.9; el[1]=.9; uz[0]=-.05; uz[1]=-.05; rS.x=.18; rH.y=sin(uTime*.31+ph*3.)*.4; }
    else if(an==6){ float h=sin(tt*2.2); sp[0]=.12; sp[1]=.12; kn[0]=.2; kn[1]=.2; th[0]=.18; th[1]=.05; rS.x=.38+h*.06; rS.y=h*.12; ua[1]=.75+h*.3; ua[0]=.95+h*.3; el[0]=.4; el[1]=.5; uz[0]=-.2; uz[1]=.05; }
    else if(an==8){ float h=smoothstep(.2,.8,sin(tt*.5)*.5+.5); rS.x=h*.6; rH.x=h*.15; ua[0]=.5*h+.2; ua[1]=.5*h+.2; el[0]=1.4*h+.3; el[1]=1.4*h+.3; uz[0]=-.35; uz[1]=-.35; }
    else if(an==9){ float h=pow(max(0.,sin(tt*.6)),4.); ua[1]=.75+h*.5; el[1]=1.7+h*.5; uz[1]=.15; rH.x=-h*.3; ua[0]=.25; el[0]=1.0; th[1]=.05; }
    else if(an==11){ rS.x=.14; ua[1]=.6+sin(uTime*3.1+ph)*.3; el[1]=1.2+sin(uTime*2.+ph)*.35; ua[0]=.5+sin(uTime*2.3+ph*2.)*.25; el[0]=1.0; rH.x=.1+sin(uTime*4.+ph)*.05; rH.y=sin(uTime*.9+ph)*.18; th[0]=.12; kn[0]=.12; }
    else if(an==12){ th[0]=1.55; th[1]=1.5; kn[0]=2.55; kn[1]=2.5; sp[0]=.28; sp[1]=.28; rS.x=.45; rH.x=-.3+sin(tt*.5)*.08; ua[0]=.75; ua[1]=.75+sin(tt*1.7)*.2; el[0]=.55; el[1]=.55; uz[0]=-.05; uz[1]=-.05; }
    else if(an==13){ ua[0]=.45; ua[1]=.45; el[0]=1.25; el[1]=1.25; uz[0]=-.12; uz[1]=-.12; rH.x=.4+sin(tt*.2)*.04; rH.y=sin(tt*.13)*.12; rS.x=.05; }
    else if(an==16){ ua[0]=.3; ua[1]=.3; el[0]=1.55; el[1]=1.55; uz[0]=-.12; uz[1]=-.12; rS.x=.03+sin(tt*.35)*.015; rH.y=sin(uTime*.31+ph*3.)*.3; rH.x=.05; }
    else if(an==17){ float h=smoothstep(.3,.6,sin(uTime*.7+ph)); ua[1]=mix(.1,.9,h); el[1]=mix(.3,2.4,h); uz[1]=mix(.07,.35,h); rH.x=-.15*h; rS.x=-.05*h; ua[0]=.3; el[0]=1.2; rH.y=(1.-h)*sin(uTime*.4+ph)*.4; }
    else if(an==18||an==20||an==22||an==23||an==24||an==27){ seat=.2; th[0]=1.5; th[1]=1.5; sp[0]=.05; sp[1]=.05; kn[0]=3.0; kn[1]=3.0; fw[0]=1.5; fw[1]=1.5; // 跪坐: kneeling, seated on the heels, back upright (Tang floor/榻 culture)
      ua[0]=.45; ua[1]=.45; el[0]=.75; el[1]=.75; uz[0]=.02; uz[1]=.02; rH.y=sin(uTime*.31+ph*3.)*.3; rS.x=.04+sin(tt*.35)*.015;
      if(an==20){ ua[0]=.75; uz[0]=.15; el[0]=1.45; ua[1]=.35; el[1]=1.25+sin(uTime*7.+ph)*.08; uz[1]=-.1; rH.x=.25; rH.y=-.25; rS.x=.08; }
      if(an==22){ rS.x=.2; rH.x=.45; ua[1]=.7+sin(uTime*2.3+ph)*.05; el[1]=1.0; uz[1]=-.08+sin(uTime*3.1+ph)*.06; ua[0]=.55; el[0]=1.1; uz[0]=-.12; }
      if(an==23){ float h=pow(max(0.,sin(tt*.6)),4.); ua[1]=.75+h*.5; el[1]=1.7+h*.5; uz[1]=.15; rH.x=-h*.3; }
      if(an==27){ rS.x=.16; rH.x=.42+sin(tt*.21)*.04; ua[0]=.62; el[0]=1.55; uz[0]=-.18; float k=sin(uTime*1.4+ph)*.5+.5; ua[1]=.55+k*.25; el[1]=1.25+k*.55; uz[1]=-.05-k*.12; } // sewing: needle hand draws the thread up and out
      if(an==24){ ua[1]=.5+sin(uTime*2.1+ph)*.25; el[1]=1.2+sin(uTime*1.7+ph)*.3; rH.y=sin(uTime*.7+ph)*.3; rS.y=sin(uTime*.5+ph)*.06; } }
    else if(an==19){ seat=.3; th[0]=1.2; th[1]=1.2; sp[0]=.07; sp[1]=.07; kn[0]=2.78; kn[1]=2.78; fw[0]=1.55; fw[1]=1.55; ua[0]=.35; ua[1]=.35; el[0]=.7; el[1]=.7; uz[0]=-.1; uz[1]=-.1; rS.x=.03; rH.x=.08; rH.y=sin(uTime*.29+ph*3.)*.25; }
    else if(an==21){ float h=smoothstep(.2,.8,sin(tt*.6)*.5+.5); rS.x=.14+h*.1; rH.x=.25; ua[0]=.75; el[0]=.7; uz[0]=-.1; ua[1]=.8+h*.25; el[1]=.6; uz[1]=.05; Rb[6].z=-h*.9; th[0]=.08; kn[0]=.1; }
    else if(an==28){ th[0]=1.55; th[1]=1.5; kn[0]=2.55; kn[1]=2.5; sp[0]=.28; sp[1]=.28; rS.x=.5; rH.x=.1+sin(tt*.4)*.06; ua[0]=.95; el[0]=.45; uz[0]=-.1; float k=sin(uTime*2.2+ph); ua[1]=1.0+k*.1; el[1]=.5; uz[1]=.05+k*.2; } // squatting at the stove, stirring / feeding the fire
    else if(an==25||an==26){ // asleep (on a 榻 or a floor mat at the instance height): 25 on the side, knees drawn up; 26 on the back. Breathing.
      float br=sin(uTime*1.15+ph*5.)*.5+.5; sleep=an==25?1.:2.;
      if(an==25){ th[0]=.33; th[1]=.45; kn[0]=.7; kn[1]=.85; sp[0]=.03; sp[1]=.03; fw[0]=.3; fw[1]=.3; ua[0]=.75; ua[1]=1.0; el[0]=1.3; el[1]=1.1; uz[0]=-.15; uz[1]=.1; rH.x=.18; rH.z=.12; }
      else { th[0]=.03; th[1]=.03; kn[0]=.06; kn[1]=.08; fw[0]=.25; fw[1]=.25; sp[0]=.06; sp[1]=.06; ua[0]=.1; ua[1]=.1; el[0]=.7; el[1]=.6; uz[0]=.06; uz[1]=.06; rH.x=-.08; rH.y=sin(ph)*.25; }
      rS.x=.015+br*.025; }
    if((fl&8)!=0){ ua[1]=.12+sin(tt*.7)*.02; el[1]=.32; uz[1]=.06; } // carrying a lantern: the lantern hand stays low and steady
    // bones
    for(int i=0;i<2;i++){ float sd=i==0?1.:-1.; int T=i==0?7:10, U=i==0?3:5;
      Rb[T]=vec3(-th[i],0.,sd*sp[i]); Rb[T+1]=vec3(kn[i],0.,0.); Rb[T+2]=vec3(fw[i]+th[i]-kn[i],0.,-sd*sp[i]*.5);
      Rb[U]=vec3(-ua[i],0.,sd*uz[i]); Rb[U+1].x=-el[i]; }
    Rb[0]=sleep==1.?vec3(0.,0.,1.5708):sleep==2.?vec3(-1.5708,0.,0.):rP; Rb[1]=rS; Rb[2]=rH; // asleep: the whole body lies down about the pelvis pivot
    // pelvis height: seated anims put the hips at the seat; standing ones keep the lowest ankle on the ground (feet planted, no floating)
    float dy;
    if(seat>=0.) dy=seat-hipY; if(seat>=0.){ seatK=seat; hipYg=hipY; }
    else { float a0=hipY-Lt*cos(th[0])*cos(sp[0])-Ls*cos(th[0]-kn[0]), a1=hipY-Lt*cos(th[1])*cos(sp[1])-Ls*cos(th[1]-kn[1]); dy=ankY-min(a0,a1)+lift; }
    Ob[0].y=dy; if(sleep>0.) Ob[0].y=.025-uPiv[0].y+(sleep==1.?.21:.14); // the lowest side / the back rests on the surface
  }
  vec3 p0=aP, n0=aN.xyz, p1=aP, n1=aN.xyz;
  if(seatK>0.&&!QD){
    if(b0>=7&&b0<=12){ if((fl&16)==0) hide=true; } // the folded legs stay under a long robe; under a short coat (flag 16: jackets, knee coats) they show, folded
    else if((b0==0||b0==1)&&aP.y<hipYg-.02){ // the lower garment (and torso-skinned pieces hanging below the hips: sash ends, aprons, kasaya ends, coat flaps — they hung to the mat as spikes): from the hips over the thighs to the knees in front, down over the heels behind, settling on the mat
      float t=clamp((hipYg-aP.y)/.42,0.,1.), R=length(aP.xz); float sy=hipYg-seatK; w1=0.; // the mound follows the body only (the robe's front panels are 90 % skinned to the thighs: the folded thigh swung them out as spikes) // (measured over a fixed .42 m: knee-length coats reach the mat too — they hung in the air over the hidden legs)
      if(R<.03){ p0=vec3(0.,sy+.01,.1); p1=p0; n0=vec3(0.,-1.,0.); n1=n0; } else { vec2 d=aP.xz/R; // the mound: an ellipse on the mat (knees in front, heels behind), blended up to the waist
        float rz=d.y>0.?.42:.26, rx=.35, rE=1./sqrt((d.x*d.x)/(rx*rx)+(d.y*d.y)/(rz*rz)), k=smoothstep(0.,1.,t), rd=mix(.2,rE,pow(k,.75)), r2=rd*clamp(R/.21,0.,1.); // a smooth dome by direction and height; inner pieces (ties, sash ends, front panels: R < .21) scale inside it instead of being pushed out to its rim (they made sharp V tongues)
        float y=mix(hipYg,sy+.012,pow(t,1.7)); p0=vec3(d.x*r2,y,d.y*r2); p1=p0; n0=normalize(vec3(d.x,.8+.6*(1.-t),d.y)); n1=n0; } } }
  if(sl==6){ // hanging lantern + cord (slot 6): pivot at the stick tip, kept plumb in world space, swinging a little with the gait
    vec3 tip=uPiv[13]+vec3(-.005,-.08,.33), tw=tip, tn=vec3(0.,1.,0.); xf(13,tw,tn);
    float wk=(an==1||an==7||an==14||an==15)?min(A,1.5):0., ax=sin(ph*2.)*.14*wk-.06*wk+sin(uTime*1.7+ph*5.)*.035, az=cos(ph)*.07*wk+sin(uTime*1.3+ph*3.)*.03;
    mat3 S=RX(ax)*RZ(az); p0=tw+S*(aP-tip); n0=S*aN.xyz; w1=0.; }
  else { xf(b0,p0,n0); if(w1>.003) xf(b1,p1,n1); }
  vec3 p=mix(p0,p1,w1), n=normalize(mix(n0,n1,w1));
  if(seatK>0.&&!QD&&b0>=3&&b0<=6&&p.y<seatK+.06){ p.y=seatK+.06; n=normalize(mix(n,vec3(0.,1.,0.),.6)); } // seated: the wide sleeves rest on the lap (their pouches hung to the mat as V tongues)
  float sc=iB.w; mat3 Y=RY(iA.w); vec3 w=Y*(p*sc)+iA.xyz; n=Y*n;
  vP=w; vN=n; vU=aU; vL=int(aL+.5); vW=vec4(0.);
  vec3 c=aC.rgb*2.; vec4 pal= sl==1?iC0: sl==2?iC1: sl==3?iC2: sl==4?iC3: vec4(1.);
  if(sl>0&&sl<5) c*=pal.rgb*1.6; c*=.6+iC3.a*.8;
  vC=vec4(c,aC.a*2.);
  gl_Position=hide?vec4(0.,0.,-2.,1.):uVP*vec4(w,1.); vD=1.+gl_Position.w;
}`;
// water (layer 'water', upward faces): procedural ripple normals shared by FS_MAIN (body, sky reflection, glints, fog; alpha 0 marks
// the pixel) and FS_POST (screen-space reflection replaces the sky term). Waves: uWv[i] = (wavenumber x, z, phase, amplitude), phases
// relative to uWO (camera snapped to 256 m) and advanced on the CPU, so the GPU never sees large arguments. Ripples are band-limited
// by the pixel footprint (uPx = radians per pixel), so they never alias at the low internal resolution, and fade with distance.
const WATER_GLSL = `
uniform vec4 uWv[9]; uniform vec3 uWO; uniform float uWAmp, uPx, uWRef; uniform vec3 uTop, uHor, uSkySun;
vec3 wNorm(vec2 xz, float dist, float vy){
  vec2 q=xz-uWO.xz, g=vec2(0.); float foot=dist*uPx/max(abs(vy),.1), fade=1.-.8*smoothstep(20.,150.,dist);
  for(int i=0;i<9;i++){ vec4 w=uWv[i]; float k=length(w.xy), a=w.w*(1.-smoothstep(.12,.33,foot*k*.159)); g+=w.xy*(a*cos(dot(w.xy,q)+w.z)); }
  g*=uWAmp*fade; return normalize(vec3(-g.x,1.,-g.y));
}
vec3 wSky(vec3 d){ float y=max(d.y,0.); vec3 c=mix(uHor,uTop,pow(y,.6)); float s=max(dot(d,uSunD),0.); return c+uSkySun*(pow(s,12.)*.35+pow(s,3.)*.12); }
vec3 wRefl(vec3 V, vec3 N){ vec3 d=reflect(-V,N); d.y=max(d.y,.004); return normalize(d); }
float wFres(vec3 V, vec3 N){ float c=1.-max(dot(N,V),0.); return (.03+.97*c*c*c*c*c)*uWRef; }
float wFog(vec3 P, float dist){ float dd=max(dist-uFog.x,0.), fh=exp(-max(P.y,0.)*.012); return 1.-exp(-dd*(2.6/(uFog.y-uFog.x))*(.55+.75*fh)); }`;
const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uT;
uniform vec3 uSky,uGnd,uSunD,uSunC,uFogC,uCam,uTint; uniform vec4 uFog; uniform vec4 uLP[16]; uniform vec3 uLC[16]; uniform int uNL;
uniform vec4 uFlash; uniform float uAlpha,uLogF,uUnlit,uFogAmt,uBias,uBands,uDScale,uEmiK; uniform int uTerr; uniform ivec4 uTL; uniform int uWire; // K wireframe: 1 = white fill (pushed back), 2 = black lines
uniform highp sampler2DArray uNM; uniform float uBump; uniform highp sampler2D uLB;
uniform vec3 uHaze; uniform highp sampler2DShadow uSh; uniform mat4 uLVP[3]; uniform vec4 uShS; uniform vec3 uShT; uniform int uShOn; uniform float uShK; uniform float uShB[3];
in vec3 vP; in vec3 vN; in vec2 vU; in vec4 vC; flat in int vL; in vec4 vW; in float vD;
uniform int uWatL, uWSSR; // uWSSR 1: FS_POST adds the whole reflection term (screen-space or sky), so AO/ink never darken it into negative colours
out vec4 o;
${WATER_GLSL}
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); } // value noise 0..1
// cascaded shadows: 3 cascades in the quadrants of one depth atlas; 4 hardware-PCF taps; normal offset against acne
float shTap(int c, vec3 P){
  vec4 l=uLVP[c]*vec4(P,1.); vec3 s=l.xyz*.5+.5; if(s.x<.002||s.x>.998||s.y<.002||s.y>.998||s.z>1.) return 1.;
  vec2 uv=s.xy*.5+(c==0?vec2(0.):c==1?vec2(.5,0.):vec2(0.,.5)); float d=s.z-uShB[c], t=uShK;
  return (texture(uSh,vec3(uv+vec2(-t,-t),d))+texture(uSh,vec3(uv+vec2(t,-t),d))+texture(uSh,vec3(uv+vec2(-t,t),d))+texture(uSh,vec3(uv+vec2(t,t),d)))*.25;
}
float shadowAt(vec3 P, vec3 N, float dist, float nl){
  if(uShOn==0||dist>uShS.z) return 1.;
  int c=dist<uShS.x?0:dist<uShS.y?1:2; float ts=c==0?uShT.x:c==1?uShT.y:uShT.z, k=.7+1.1*(1.-nl);
  float s=shTap(c,P+N*ts*k);
  float e=c==0?uShS.x:c==1?uShS.y:uShS.z, b0=e*.82;
  if(c<2&&dist>b0){ float ts2=c==0?uShT.y:uShT.z; s=mix(s,shTap(c+1,P+N*ts2*k),(dist-b0)/(e-b0)); }
  if(c==2) s=mix(s,1.,clamp((dist-uShS.w)/(uShS.z-uShS.w),0.,1.));
  return s;
}
void main(){
  if(uWire==2){ o=vec4(0.,0.,0.,1.); gl_FragDepth=log2(vD*uBias)*uLogF*.5*uDScale; return; }
  int L=vL;
  if(uTerr==1){ vec2 c=floor(vP.xz*4.); vec4 w=vW+vec4(h2(c),h2(c+17.3),h2(c+31.7),h2(c+53.1))*.42; float b=w.x; L=uTL.x;
    if(w.y>b){b=w.y;L=uTL.y;} if(w.z>b){b=w.z;L=uTL.z;} if(w.w>b){b=w.w;L=uTL.w;} }
  vec4 lb=texelFetch(uLB,ivec2(L,0),0); vec4 t=texture(uT,vec3(vU,float(L)),-3.*lb.r); // text layers (plaques, signs): sharper mips
  if(lb.g>.5){ // open ground: hide the tiling seen from afar — a second sampling, rotated ~37° and scaled, blended in by value noise over ~40 m patches, plus a macro tone
    vec2 u2=mat2(.8,-.6,.6,.8)*vU*.77+vec2(.37,.61); vec4 t2=texture(uT,vec3(u2,float(L)));
    float m=vn(vP.xz*.025), m2=vn(vP.xz*.0055+7.3); t.rgb=mix(t.rgb,t2.rgb,smoothstep(.3,.7,m)); t.rgb*=.86+.26*m2; }
  if(t.a<.5) discard;
  if(uWire==1){ o=vec4(1.); gl_FragDepth=log2(vD*uBias*1.0015)*uLogF*.5*uDScale; return; }
  if(L==uWatL && uTerr==0 && uUnlit<.5){ vec3 N0=normalize(vN); if(!gl_FrontFacing) N0=-N0;
    if(N0.y>.7){ // water surface: murky silty body + sky reflection (Fresnel) + sun/moon and lamp glints; FS_POST swaps in screen-space reflections
      vec3 V=uCam-vP; float dist=length(V); V/=max(dist,.001); vec3 N=wNorm(vP.xz,dist,V.y);
      float nl=max(uSunD.y,0.), sh=nl>0.?shadowAt(vP,N0,dist,nl):1.; sh=mix(1.,sh,smoothstep(.02,.22,nl));
      vec3 D=wRefl(V,N), li=uSky*(.82+.18*sh)+uSunC*nl*sh, sp=vec3(0.); float ex=mix(280.,50.,smoothstep(4.,90.,dist));
      sp+=uSunC*sh*pow(max(dot(D,uSunD),0.),ex)*ex*.012;
      for(int i=0;i<16;i++){ if(i>=uNL) break; vec3 d=uLP[i].xyz-vP; float dl=max(length(d),.001); float a=clamp(1.-dl/uLP[i].w,0.,1.); a*=a; li+=uLC[i]*a*clamp(d.y/dl*.7+.3,0.,1.); sp+=uLC[i]*a*pow(max(dot(D,d/dl),0.),30.)*.9; }
      float m=max(max(li.r,li.g),li.b); float q=floor(m*uBands+.5)/uBands; li*= m>.001? q/m : 0.;
      float F=wFres(V,N); vec3 c=vec3(.1,.104,.074)*li*(1.-F)+(uWSSR==1?vec3(0.):wSky(D)*F)+sp;
      float sa=max(dot(-V,uSunD),0.); vec3 fc=uFogC+uHaze*(pow(sa,6.)*.9+pow(sa,32.)*.8);
      c=mix(c,fc,wFog(vP,dist)*uFogAmt); c=mix(c,uFlash.rgb,uFlash.a);
      o=vec4(c,0.); gl_FragDepth=log2(vD*uBias)*uLogF*.5*uDScale; return; } }
  vec4 vc=uTerr==1?vec4(1.,1.,1.,0.):vC; vec3 al=t.rgb*vc.rgb*uTint, c;
  if(uUnlit>.5) c=al; else {
    vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
    float nl=max(dot(N,uSunD),0.), sh=nl>0.?shadowAt(vP,N,length(vP-uCam),nl):1.; sh=mix(1.,sh,smoothstep(.02,.22,nl)); // grazing light: fade, no contour bands
    // bump from the luminance normal map: cotangent frame from screen derivatives of position and uv; fades out with distance
    vec3 Nb=N; float bk=uBump*(1.-smoothstep(25.,70.,length(vP-uCam)));
    if(bk>.01){ vec3 q1=dFdx(vP), q2=dFdy(vP); vec2 st1=dFdx(vU), st2=dFdy(vU); vec3 q2p=cross(q2,N), q1p=cross(N,q1);
      vec3 T=q2p*st1.x+q1p*st2.x, Bt=q2p*st1.y+q1p*st2.y; float im=inversesqrt(max(max(dot(T,T),dot(Bt,Bt)),1e-12));
      vec4 tq=texture(uNM,vec3(vU,float(L))); vec3 tn=tq.xyz*2.-1.; tn.xy*=bk; Nb=normalize(T*im*tn.x+Bt*im*tn.y+N*tn.z); }
    float shn=texture(uNM,vec3(vU,float(L))).a; // sheen (def.sheen): silk, lacquer, glaze
    float nlb=max(dot(Nb,uSunD),0.)*smoothstep(0.,.05,nl);
    vec3 li=mix(uGnd,uSky,Nb.y*.5+.5)*(.82+.18*sh)+uSunC*nlb*sh;
    vec3 sheen=vec3(0.); if(shn>.01){ vec3 V=normalize(uCam-vP), Hh=normalize(V+uSunD); float sp=pow(max(dot(Nb,Hh),0.),8.)*nlb*sh, rim=pow(1.-max(dot(Nb,V),0.),3.)*.18;
      sheen=shn*(uSunC*sp*.32+mix(uGnd,uSky,.7)*rim); }
    for(int i=0;i<16;i++){ if(i>=uNL) break; vec3 d=uLP[i].xyz-vP; float dl=max(length(d),.001); float a=clamp(1.-dl/uLP[i].w,0.,1.); a*=a; li+=uLC[i]*a*clamp(dot(Nb,d/dl)*.7+.3,0.,1.); }
    float m=max(max(li.r,li.g),li.b); float q=floor(m*uBands+.5)/uBands; li*= m>.001? q/m : 0.;
    c=al*li+al*vc.a*1.6*uEmiK+sheen*(al*.75+.06*max(max(al.r,al.g),al.b));
  }
  float dist=length(vP-uCam);
  // aerial perspective: exponential haze (thicker low down: loess dust), brighter and warmer looking toward the sun
  float dd=max(dist-uFog.x,0.), fh=exp(-max(vP.y,0.)*.012); float f=1.-exp(-dd*(2.6/(uFog.y-uFog.x))*(.55+.75*fh));
  vec3 vd=(vP-uCam)/max(dist,.001); float sa=max(dot(vd,uSunD),0.); vec3 fc=uFogC+uHaze*(pow(sa,6.)*.9+pow(sa,32.)*.8);
  c=mix(c,fc,f*(uFogAmt<1.?mix(1.,uFogAmt,smoothstep(18000.,27000.,length(vP.xz))):uFogAmt)); // reduced fog (the mountain ring) eases in from its foot, so it meets the fully hazed far ground without a tonal line
  c=mix(c,uFlash.rgb,uFlash.a);
  o=vec4(c,uAlpha);
  gl_FragDepth=log2(vD*uBias)*uLogF*.5*uDScale;
}`;
// shadow pass: depth only; alpha-tested so leaf cards cast leafy shadows
const FS_SHADOW = `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uT; in vec2 vU; flat in int vL; in vec3 vP; in vec3 vN; in vec4 vC; in vec4 vW; in float vD; out vec4 o;
void main(){ if(texture(uT,vec3(vU,float(vL))).a<.5) discard; o=vec4(1.); }`;
const VS_SKY = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vN; void main(){ vN=aP; gl_Position=vec4(aP,1.,1.); }`;
const FS_SKY = `#version 300 es
precision highp float;
uniform mat4 uIVP; uniform vec3 uTop,uHor,uBot,uSunD,uSunC,uCloudC; uniform float uTime,uClouds,uStars;
in vec2 vN; out vec4 o;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
float fb(vec2 p){ float a=.5,t=0.; for(int i=0;i<5;i++){ t+=a*n2(p); p*=2.03; a*=.5; } return t; }
void main(){
  vec4 a=uIVP*vec4(vN,1.,1.); vec3 d=normalize(a.xyz/a.w);
  float y=d.y; vec3 c= y>0. ? mix(uHor,uTop,pow(clamp(y,0.,1.),.6)) : mix(uHor,uBot,pow(clamp(-y*3.,0.,1.),.7));
  float s=max(dot(d,uSunD),0.); c+=uSunC*(pow(s,600.)*3.+pow(s,12.)*.35+pow(s,3.)*.12);
  if(uStars>0. && y>0.){ // point stars: about one screen pixel, antialiased, each with its own magnitude, phase and rate
    vec2 sp=d.xz/(y+.3)*240.; vec2 cl=floor(sp); float st=h(cl);
    if(st>.993){ vec2 o=vec2(h(cl+vec2(1.7,9.2)),h(cl+vec2(5.3,2.9)))*.7+.15; float px=max(length(fwidth(sp)),1e-4);
      float dd=length(fract(sp)-o)/px, cov=clamp(1.2-dd,0.,1.), mag=.25+.75*pow(h(cl+vec2(3.1,7.7)),3.);
      float tw=.72+.28*sin(uTime*(1.3+2.6*h(cl+vec2(8.4,1.3)))+6.2832*h(cl+vec2(2.2,4.4)));
      c+=vec3(.95,.93,1.)*cov*mag*tw*uStars*clamp(y*4.,0.,1.); } }
  if(uClouds>0. && y>-.02){
    // summer cumulus: puffy cells (domain-warped fbm), lit from the sun side, grey-blue undersides, silver linings near the sun
    vec2 cp=d.xz/(y+.09)*.9+vec2(uTime*.006,uTime*.002), wq=vec2(fb(cp*.7+3.1),fb(cp*.7+7.7));
    float n=fb(cp+wq*.8), cov=uClouds*.62, cl=smoothstep(1.-cov-.05,1.-cov+.22,n);
    float lit=clamp(.55+(n-fb(cp+wq*.8-uSunD.xz*.09))*5.,.25,1.25), dens=smoothstep(1.-cov,1.-cov+.45,n);
    vec3 cc=mix(uCloudC*.62*vec3(.92,.95,1.05),uCloudC*1.12+uSunC*.18,lit)+uSunC*pow(s,6.)*(1.-dens)*1.2;
    float hz=clamp(y*5.+.06,0.,1.); c=mix(c,cc,cl*hz*.96);
    // high cirrus streaks
    vec2 hp=d.xz/(y+.2)*vec2(.35,2.6)+vec2(uTime*.003,0.); float ci=smoothstep(.62,.9,fb(hp))*.35*uClouds; c=mix(c,uCloudC*1.1+uSunC*.1,ci*hz*(1.-cl));
  }
  o=vec4(c,1.);
}`;
const VS_PART = `#version 300 es
layout(location=0) in vec2 aQ; layout(location=1) in vec4 iP; layout(location=2) in vec4 iC; layout(location=3) in vec2 iL;
uniform mat4 uV,uPr; out vec2 vU; out vec4 vC; flat out int vL; out float vD; out vec3 vP;
void main(){ vec4 v=uV*vec4(iP.xyz,1.); float r=iL.y; vec2 q=mat2(cos(r),sin(r),-sin(r),cos(r))*aQ; v.xy+=q*iP.w; gl_Position=uPr*v; vU=aQ*.5+.5; vU.y=1.-vU.y; vC=iC; vL=int(iL.x+.5); vD=1.+gl_Position.w; vP=iP.xyz; }`;
const FS_PART = `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uT; uniform float uLogF; uniform int uMode; uniform vec3 uFogC,uCam; uniform vec4 uFog;
in vec2 vU; in vec4 vC; flat in int vL; in float vD; in vec3 vP; out vec4 o;
void main(){ vec4 t=texture(uT,vec3(vU,float(vL))); float a=t.a*vC.a; float f=clamp((length(vP-uCam)-uFog.x)/(uFog.y-uFog.x),0.,1.);
  if(uMode==0){ if(a<.5) discard; o=vec4(mix(t.rgb*vC.rgb,uFogC,f),1.); }
  else if(uMode==1){ o=vec4(t.rgb*vC.rgb*a*(1.-f),1.); } else { if(a<.02) discard; o=vec4(mix(t.rgb*vC.rgb,uFogC,f),a); }
  gl_FragDepth=log2(vD)*uLogF*.5; }`;
// ink: darkens silhouette edges found in a snapshot of the opaque depth (drawn before transparent things, see R.inkPass)
const FS_INK = `#version 300 es
precision highp float;
uniform highp sampler2D uDp; uniform vec2 uRes; uniform float uInk,uLF; uniform vec4 uFogP; uniform vec3 uInkC;
out vec4 o;
float ld(ivec2 p){ return texelFetch(uDp,clamp(p,ivec2(0),ivec2(uRes)-1),0).r*uLF; } // log2(1+w)
void main(){ ivec2 p=ivec2(gl_FragCoord.xy); float d=ld(p), m=max(max(ld(p+ivec2(1,0)),ld(p-ivec2(1,0))),max(ld(p+ivec2(0,1)),ld(p-ivec2(0,1))));
  float w=exp2(d)-1., k=smoothstep(.22,.5,m-d)*(1.-clamp((w-uFogP.x)/max(uFogP.y-uFogP.x,1.),0.,1.)); if(k<.01) discard; o=vec4(uInkC,k*uInk); }`;
// SSAO from the (log) depth: view-space positions, normals from neighbours, 12 hemisphere samples, range-checked; R8 output
const FS_AO = `#version 300 es
precision highp float;
uniform highp sampler2D uDp; uniform vec2 uRes; uniform float uLF, uTx, uTy, uR, uK, uFar;
out vec4 o;
float W(ivec2 p){ return exp2(texelFetch(uDp,clamp(p,ivec2(0),ivec2(uRes)-1),0).r*uLF)-1.; }
vec3 V(vec2 px, float w){ vec2 n=px/uRes*2.-1.; return vec3(n.x*uTx*w, n.y*uTy*w, -w); }
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy); float w=W(p); if(w>uFar){ o=vec4(1.); return; }
  vec3 P=V(gl_FragCoord.xy,w);
  float wx1=W(p+ivec2(1,0)), wx0=W(p-ivec2(1,0)), wy1=W(p+ivec2(0,1)), wy0=W(p-ivec2(0,1));
  vec3 dx=abs(wx1-w)<abs(wx0-w)?V(gl_FragCoord.xy+vec2(1,0),wx1)-P:P-V(gl_FragCoord.xy-vec2(1,0),wx0);
  vec3 dy=abs(wy1-w)<abs(wy0-w)?V(gl_FragCoord.xy+vec2(0,1),wy1)-P:P-V(gl_FragCoord.xy-vec2(0,1),wy0);
  vec3 N=normalize(cross(dx,dy)); if(dot(N,P)>0.) N=-N;
  float r=uR*(1.+w*.006), a0=h(gl_FragCoord.xy)*6.283, occ=0.;
  for(int i=0;i<12;i++){
    float fi=float(i), a=a0+fi*2.399, rr=r*(.25+.75*fract(fi*.618+h(gl_FragCoord.yx)));
    vec3 d=vec3(cos(a),sin(a),.6+.4*fract(fi*.37)); // a hemisphere around N
    vec3 t=normalize(abs(N.y)<.9?cross(N,vec3(0,1,0)):cross(N,vec3(1,0,0))), b=cross(N,t);
    vec3 S=P+(t*d.x+b*d.y+N*d.z)*rr;
    vec2 sp=vec2(S.x/(-S.z*uTx), S.y/(-S.z*uTy))*.5+.5; if(sp.x<0.||sp.y<0.||sp.x>1.||sp.y>1.) continue;
    float ws=W(ivec2(sp*uRes)); float dz=(-S.z)-ws; // >0: the sample point is behind the visible surface there (occluded)
    occ+= step(.03,dz)*smoothstep(1.,0.,dz/(rr*2.5));
  }
  float ao=1.-uK*occ/12.; ao=mix(ao,1.,smoothstep(uFar*.6,uFar,w)); o=vec4(ao,ao,ao,1.);
}`;
// depth-aware 3x3 blur of the AO, multiplied onto the frame
const FS_AOAPPLY = `#version 300 es
precision highp float;
uniform highp sampler2D uAo, uDp; uniform vec2 uRes; uniform float uLF;
out vec4 o;
float W(ivec2 p){ return exp2(texelFetch(uDp,clamp(p,ivec2(0),ivec2(uRes)-1),0).r*uLF)-1.; }
void main(){ ivec2 p=ivec2(gl_FragCoord.xy); float w=W(p), s=0., n=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ ivec2 q=clamp(p+ivec2(i,j),ivec2(0),ivec2(uRes)-1); float k=1./(1.+abs(W(q)-w)*4./(w*.05+.2)); s+=texelFetch(uAo,q,0).r*k; n+=k; }
  float a=s/n; o=vec4(a,a,a,1.); }`;
const VS_POST = `#version 300 es
layout(location=0) in vec2 aP; void main(){ gl_Position=vec4(aP,0.,1.); }`;
const FS_POST = `#version 300 es
precision highp float;
uniform vec3 uPalC[32]; uniform int uPalN; // a fixed palette (ENDESGA32) for the K retro mode: ordered dither, then the nearest palette colour
uniform sampler2D uS; uniform highp sampler2D uDp; uniform vec2 uRes; uniform float uLv,uVig,uSat,uGam,uGrain,uShaft; uniform vec4 uOver; uniform vec3 uGrade,uShaftC,uSunP;
uniform int uWat; uniform float uLF,uTx,uTy,uWSs; uniform mat4 uCW,uVP; uniform vec3 uCam,uSunD; uniform vec4 uFog;
uniform int uWire;
out vec4 o;
${WATER_GLSL}
const float B[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float WD(ivec2 q){ return exp2(texelFetch(uDp,q,0).r*uLF)-1.; }

// water pixels (alpha 0 from FS_MAIN): march the rippled reflection ray in screen space against the opaque depth (exponential steps,
// binary refinement); misses fall back to the sky on screen in that direction, else the sky gradient; fades at the screen edges
vec3 water(ivec2 p, vec3 c){
  float dz=texelFetch(uDp,p,0).r; if(dz>.99999) return c;
  float w=exp2(dz*uLF)-1.; vec2 nd=(vec2(p)+.5)/uRes*2.-1.; vec3 P=(uCW*vec4(nd.x*uTx*w,nd.y*uTy*w,-w,1.)).xyz;
  vec3 V=uCam-P; float dist=length(V); V/=max(dist,.001); vec3 N=wNorm(P.xz,dist,V.y), D=wRefl(V,N);
  // banks (screen space, near only): darker water away from the banks (deeper), a faint pale silt line where it meets the stone
  float near=1.-smoothstep(25.,60.,dist);
  if(near>0.){ float rp=clamp(1.2/(dist*uPx),1.,7.), sh=0., ln=0.;
    for(int i=0;i<4;i++){ ivec2 dv=i==0?ivec2(1,0):i==1?ivec2(-1,0):i==2?ivec2(0,1):ivec2(0,-1), q=clamp(p+dv*int(rp),ivec2(0),ivec2(uRes)-1), q1=clamp(p+dv,ivec2(0),ivec2(uRes)-1);
      if(texelFetch(uS,q,0).a>.5 && WD(q)>w*.93) sh+=.25;
      if(texelFetch(uS,q1,0).a>.5 && WD(q1)>w*.97) ln=1.; }
    c*=mix(1.,mix(.8,1.,sh),near); c=mix(c,c*1.35+vec3(.012,.011,.008),ln*near*.6); }
  float F=wFres(V,N), k=F*(1.-wFog(P,dist)); if(k<.004) return c;
  vec3 sky=wSky(D), X=sky; vec4 cd=uVP*vec4(D,0.);
  if(cd.w>0.){ vec2 su=cd.xy/cd.w*.5+.5, e=min(su,1.-su); if(min(e.x,e.y)>0.){ ivec2 sp=ivec2(su*uRes); if(texelFetch(uDp,sp,0).r>.99999) X=mix(sky,texelFetch(uS,sp,0).rgb,smoothstep(0.,.05,min(e.x,e.y))); } }
  vec3 S0=P+vec3(0.,.03,0.); float t=.1, tp=0.;
  for(int i=0;i<22;i++){ vec4 q=uVP*vec4(S0+D*t,1.); if(q.w<.06) break; vec2 u=q.xy/q.w*.5+.5; if(u.x<0.||u.y<0.||u.x>=1.||u.y>=1.) break;
    float dd=q.w-WD(ivec2(u*uRes));
    if(dd>0.&&dd<(t-tp)*1.5+.3+t*.03){ float a=tp, b=t;
      for(int j=0;j<5;j++){ float m=(a+b)*.5; vec4 r=uVP*vec4(S0+D*m,1.); vec2 v=r.xy/r.w*.5+.5; if(r.w-WD(ivec2(clamp(v,0.,.9999)*uRes))>0.) b=m; else a=m; }
      vec4 r=uVP*vec4(S0+D*b,1.); vec2 v=clamp(r.xy/r.w*.5+.5,0.,.9999), e=min(v,1.-v);
      float fw=smoothstep(0.,.07,min(e.x,e.y))*(1.-smoothstep(.55,1.,b/uWSs));
      X=mix(X,texelFetch(uS,ivec2(v*uRes),0).rgb,fw); break; }
    tp=t; t*=1.4; }
  return c+k*X;
}
void main(){ ivec2 p=ivec2(gl_FragCoord.xy); vec4 c4=texelFetch(uS,p,0); vec3 c=c4.rgb;
  if(uWire==1){ o=vec4(c,1.); return; } // wireframe: pure black and white
  if(uWat==1&&c4.a<.5) c=water(p,c);
  // light shafts: march toward the sun's screen position, counting open sky (depth = 1)
  if(uShaft>0.&&uSunP.z>0.){ vec2 uv=gl_FragCoord.xy/uRes, dl=(uSunP.xy-uv)/24.; float a=0.,w=1.; vec2 t=uv+dl*h(gl_FragCoord.xy);
    for(int i=0;i<24;i++){ t+=dl; if(t.x<0.||t.y<0.||t.x>1.||t.y>1.) break; a+=step(.99999,texture(uDp,t).r)*w; w*=.94; }
    float r=length((uSunP.xy-uv)*vec2(uRes.x/uRes.y,1.)); c+=uShaftC*a/12.*uShaft*exp(-r*1.6); }
  c=pow(max(c,0.),vec3(uGam))*uGrade;
  c=c*(1.+c*.12)/(1.+c*.55)*1.22; // soft filmic shoulder
  float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,uSat);
  c*=mix(vec3(.93,.97,1.06),vec3(1.05,1.,.93),smoothstep(.08,.7,l)); // cool shadows, warm highlights
  if(uGrain>0.){ vec2 q=gl_FragCoord.xy; float g=h(floor(q))*.6+h(floor(q*vec2(.25,1.)))*.4; c*=1.+(g-.5)*uGrain; }
  vec2 q=gl_FragCoord.xy/uRes-.5; c*=1.-dot(q,q)*uVig; c=mix(c,uOver.rgb,uOver.a);
  float b=B[(p.x&3)+(p.y&3)*4]/16.;
  if(uPalN>0){ vec3 qc=clamp(c+(b-.47)*.11,0.,1.), best=c; float bd=1e9; for(int i=0;i<32;i++){ if(i>=uPalN) break; vec3 d=qc-uPalC[i]; float e=dot(d*d,vec3(.3,.59,.11))+.25*pow(dot(d,vec3(.3,.59,.11)),2.); if(e<bd){ bd=e; best=uPalC[i]; } } c=best; }
  else c=floor(c*uLv+b)/uLv; o=vec4(c,1.); }`;

const R = {
  gl: null, W: 400, H: 240, fov: 1.3, near: .05, far: 90000, time: 0,
  view: M4.new(), proj: M4.new(), vp: M4.new(), camPos: [0, 0, 0], camYaw: 0, camPitch: 0, camRoll: 0,
  env: { sky: [.3, .3, .35], gnd: [.1, .1, .1], sunD: [0, 1, 0], sunC: [0, 0, 0], fogC: [.2, .2, .25], fog: [10, 120, -99, 0], bands: 10,
    skyTop: [.1, .1, .2], skyHor: [.3, .3, .35], skyBot: [.1, .1, .1], cloudC: [.4, .4, .45], clouds: 0, stars: 0, grade: [1, 1, 1], sat: 1, gam: 1, vig: .9, lv: 28,
    ink: .35, inkC: [.07, .065, .08], grain: .05, snow: 0, wind: [.4, .1] },
  lights: [], over: [0, 0, 0, 0], frame: 0, shadowing: false, ao: { on: true, r: .7, k: .9, far: 160 },
  sh: { on: true, size: 1024, bias: new Float32Array(3), splits: [18, 64, 210], fade: 170, lvp: [new Float32Array(16), new Float32Array(16), new Float32Array(16)], tex: null, fbo: null, texel: [0, 0, 0], all: new Float32Array(48) }, _lp: new Float32Array(64), _lc: new Float32Array(48), _nl: 0, stats: { tris: 0, calls: 0 },
  init(canvas, texData) {
    const gl = canvas.getContext('webgl2', { antialias: false, depth: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl; this.canvas = canvas;
    this.pMain = this.prog(VS_MAIN, FS_MAIN); this.pCrowd = this.prog(VS_CROWD, FS_MAIN); this.pShM = this.prog(VS_MAIN, FS_SHADOW); this.pShC = this.prog(VS_CROWD, FS_SHADOW); this.pSky = this.prog(VS_SKY, FS_SKY); this.pPart = this.prog(VS_PART, FS_PART); this.pPost = this.prog(VS_POST, FS_POST); this.pInk = this.prog(VS_POST, FS_INK); this.pAo = this.prog(VS_POST, FS_AO); this.pAoA = this.prog(VS_POST, FS_AOAPPLY);
    this.u = {}; for (const p of [this.pMain, this.pCrowd, this.pShM, this.pShC, this.pSky, this.pPart, this.pPost, this.pInk, this.pAo, this.pAoA]) { const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); p.u = {}; for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i), nm = inf.name.replace('[0]', ''); p.u[nm] = gl.getUniformLocation(p, inf.name); } if (p.u.uSh) { gl.useProgram(p); gl.uniform1i(p.u.uSh, 3); } } // the shadow sampler lives on unit 3 in every program (never next to the texture array on unit 0)
    // fullscreen tri
    this.fsVao = gl.createVertexArray(); gl.bindVertexArray(this.fsVao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // particles
    this.partMax = 6000; this.partData = new Float32Array(this.partMax * 10);
    this.pVao = gl.createVertexArray(); gl.bindVertexArray(this.pVao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf); gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);
    [[1, 4, 0], [2, 4, 16], [3, 2, 32]].forEach(([l, n, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 40, o); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
    this.tex = TEX.build(gl, texData); this.ntex = TEX.buildNormals(gl, TEX._data); this.water.l = TEX.L.water ?? -1;
    { const n = TEX.defs.length, d = new Uint8Array(n * 2); TEX.defs.forEach((def, i) => { d[i * 2] = def.sharp ? Math.round(def.sharp * 85) : /^(wn_|gt_|nb_|sign_|tablet_|flag|wineflag)/.test(def.name || '') ? 255 : 0; // R: 255 = bias -3 mip levels
        d[i * 2 + 1] = def.antiTile || /^(grass|grass_summer|dirt|loess|loess_rut|yard|field_crop|sand|mud)$/.test(def.name || '') ? 255 : 0; }); // G: open ground — FS_MAIN breaks up the visible repeat (two rotated samplings blended by low-frequency noise + macro tone)
      const t = this.lbtex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, n, 1, 0, gl.RG, gl.UNSIGNED_BYTE, d); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    // shadow atlas: 2 x 2 cascades of SH x SH (3 used)
    const SH = this.sh.size; this.sh.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.sh.tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SH * 2, SH * 2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.sh.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.sh.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.sh.tex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbo = null; this.resize(this.H);
  },
  prog(vs, fs) {
    const gl = this.gl, mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) + '\n' + s); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
  },
  resize(h) {
    const gl = this.gl, asp = innerWidth / Math.max(innerHeight, 1); this.H = h; this.W = Math.round(h * asp);
    this.canvas.width = this.W; this.canvas.height = this.H;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.ctex); gl.deleteTexture(this.dtex); gl.deleteFramebuffer(this.fbo2); gl.deleteTexture(this.dsnap); }
    this.ctex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.ctex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.W, this.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.dtex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.dtex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.W, this.H, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.ctex, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.dtex, 0);
    // depth snapshot target for the ink pass
    this.dsnap = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.dsnap); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.W, this.H, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.fbo2 = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.dsnap, 0);
    if (this.aoTex) { gl.deleteTexture(this.aoTex); gl.deleteFramebuffer(this.aoFbo); }
    this.aoTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.aoTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.W, this.H, 0, gl.RED, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.aoFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.aoTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },
  // darken silhouette edges of everything drawn so far (call after opaque geometry, before transparent fx/particles)
  inkPass() {
    const gl = this.gl, e = this.env;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo2); gl.blitFramebuffer(0, 0, this.W, this.H, 0, 0, this.W, this.H, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    if (this.wire) { this.useMain(this.vp); return; }
    if (this.ao.on && !this.shadowing) { // SSAO: compute into aoTex, then multiply onto the colour (before ink and transparent things)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoFbo); gl.viewport(0, 0, this.W, this.H); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
      gl.useProgram(this.pAo); let u = this.pAo.u; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dsnap); gl.uniform1i(u.uDp, 2);
      const ty = Math.tan(this.curFov / 2), tx = ty * this.W / this.H; gl.uniform2f(u.uRes, this.W, this.H); gl.uniform1f(u.uLF, Math.log2(this.far + 1)); gl.uniform1f(u.uTx, tx); gl.uniform1f(u.uTy, ty); gl.uniform1f(u.uR, this.ao.r); gl.uniform1f(u.uK, this.ao.k * (e.aoK ?? 1)); gl.uniform1f(u.uFar, this.ao.far);
      gl.bindVertexArray(this.fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.useProgram(this.pAoA); u = this.pAoA.u; gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.aoTex); gl.uniform1i(u.uAo, 4); gl.uniform1i(u.uDp, 2); gl.uniform2f(u.uRes, this.W, this.H); gl.uniform1f(u.uLF, Math.log2(this.far + 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.activeTexture(gl.TEXTURE0); gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); }
    if (!(e.ink > 0)) { this.useMain(this.vp); return; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.colorMask(true, true, true, false);
    gl.useProgram(this.pInk); const u = this.pInk.u; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dsnap); gl.uniform1i(u.uDp, 2); gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(u.uRes, this.W, this.H); gl.uniform1f(u.uInk, e.ink); gl.uniform3fv(u.uInkC, e.inkC || [0, 0, 0]); gl.uniform1f(u.uLF, Math.log2(this.far + 1)); gl.uniform4fv(u.uFogP, [e.fog[0], e.fog[1], 0, 0]);
    gl.bindVertexArray(this.fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.colorMask(true, true, true, true); gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); this.useMain(this.vp);
  },
  // static mesh from an MB (or from MBpack output, e.g. built in a worker)
  mesh(mb) { return this.meshPacked(mb.vb ? mb : MBpack(mb)); },
  // big meshes (> UPS bytes) are allocated now and filled over the next frames by R.pump() (a few MB per frame), so streaming
  // a large ward mesh never stalls one frame; the mesh draws nothing until it is complete (m.pending)
  bump: { on: true, k: 1 }, hideMask: 0,
  // water fx (J toggles, ?nowaterfx): l = the 'water' texture layer; amp = ripple slope scale; refl = reflection strength; ssr = screen-space reflections
  water: { on: true, ssr: true, l: -1, amp: 1, refl: 1, wv: new Float32Array(36), f: -1 },
  palette: null, // Float32Array of rgb (0..1) for the palette retro mode, or null
  PALETTES: { endesga32: 'be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569' }, // ENDESGA 32 (lospec.com)
  setPalette(name) { const h = name && this.PALETTES[name]; this.palette = h ? new Float32Array(h.split(' ').flatMap(c => [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255))) : null; },
  // the ripple set: 9 directional waves around the wind direction, 3 scales; phases kept small (relative to a snapped origin) on the CPU
  waterWaves() { const W = this.water; if (W.f === this.frame) return W.wv; W.f = this.frame;
    const e = this.env, wind = e.wind ? e.wind[0] : .4, a0 = .6 + (e.windDir || 0), ox = Math.round(this.camPos[0] / 256) * 256, oz = Math.round(this.camPos[2] / 256) * 256, t = this.time;
    W.ox = ox; W.oz = oz;
    for (let i = 0; i < 9; i++) { const lam = [2.9, 2.1, 1.55, 1.1, .82, .6, .44, .33, .25][i], k = TAU / lam, a = a0 + [0, .9, -.7, .35, -1.2, 1.4, -.25, .75, -1.6][i], kx = Math.cos(a) * k, kz = Math.sin(a) * k;
      const om = Math.sqrt(9.81 * k) * .55, ph = ((kx * ox + kz * oz) - om * t + i * 1.7) % TAU, slope = [.05, .045, .045, .04, .04, .035, .035, .03, .03][i] * (.7 + .75 * wind);
      W.wv[i * 4] = kx; W.wv[i * 4 + 1] = kz; W.wv[i * 4 + 2] = ph; W.wv[i * 4 + 3] = slope / k; }
    return W.wv; },
  waterUniforms(u) { const W = this.water, e = this.env; this.waterWaves(); const gl_ = this.gl;
    gl_.uniform4fv(u.uWv, W.wv); gl_.uniform3f(u.uWO, W.ox, 0, W.oz); gl_.uniform1f(u.uWAmp, W.amp); gl_.uniform1f(u.uPx, 2 * Math.tan((this.curFov || this.fov) / 2) / this.H); gl_.uniform1f(u.uWRef, W.refl);
    gl_.uniform3fv(u.uTop, e.skyTop); gl_.uniform3fv(u.uHor, e.skyHor); gl_.uniform3fv(u.uSkySun, e.skySunC || e.sunC); },
  UPS: 3e6, ups: [],
  meshPacked(pk) {
    const gl = this.gl, vao = gl.createVertexArray(), big = pk.vb.byteLength + pk.ib.byteLength > this.UPS; gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, big ? pk.vb.byteLength : pk.vb, gl.STATIC_DRAW); vattr(gl);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? pk.ib.byteLength : pk.ib, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.gpuBytes = (this.gpuBytes || 0) + pk.vb.byteLength + pk.ib.byteLength;
    const m = { vao, vb, ib, count: pk.ib.length, itype: pk.ib instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, bs: pk.bs, box: pk.box, bytes: pk.vb.byteLength + pk.ib.byteLength, pending: 0 };
    if (big) { const u8 = a => a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength); m.pending = 2; this.ups.push({ m, buf: vb, t: gl.ARRAY_BUFFER, d: u8(pk.vb), o: 0 }, { m, buf: ib, t: gl.ELEMENT_ARRAY_BUFFER, d: u8(pk.ib), o: 0 }); }
    return m;
  },
  pump(budget = this.UPS, all = false) { // continue progressive uploads; returns bytes sent
    const gl = this.gl; let b = 0; if (!this.ups.length) return 0; gl.bindVertexArray(null);
    while (this.ups.length && (all || b < budget)) { const u = this.ups[0]; if (u.m.freed) { this.ups.shift(); continue; }
      const n = all ? u.d.byteLength - u.o : Math.min(u.d.byteLength - u.o, Math.max(65536, budget - b) & ~3); gl.bindBuffer(u.t, u.buf); gl.bufferSubData(u.t, u.o, u.d, u.o, n); u.o += n; b += n;
      if (u.o >= u.d.byteLength) { this.ups.shift(); u.m.pending--; } }
    gl.bindBuffer(gl.ARRAY_BUFFER, null); return b;
  },
  freeMesh(m) { const gl = this.gl; if (!m) return; m.freed = true; if (m.bytes) this.gpuBytes -= m.bytes; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); if (m.ib) gl.deleteBuffer(m.ib); if (m.lib) { gl.deleteBuffer(m.lib); m.lib = null; } if (m.cvao) for (const v of m.cvao) gl.deleteVertexArray(v); },
  // ---- wireframe (K): every triangle's three edges as gl.LINES, derived at runtime from the mesh's own index buffer (read back from the GPU)
  setWire(on) { this.wire = !!on; if (!on && this._libs) { for (const m of this._libs) if (m.lib) { this.gl.deleteBuffer(m.lib); m.lib = null; } this._libs = []; } },
  lines(m) {
    if (m.lib) return m.lib; if (!m.ib || m.pending || m.freed || !(this._lb > 0)) return null;
    const gl = this.gl, n = m.count, U = m.itype === gl.UNSIGNED_INT, A = U ? new Uint32Array(n) : new Uint16Array(n), Ln = U ? new Uint32Array(n * 2) : new Uint16Array(n * 2);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, A);
    for (let t = 0, o = 0; t + 2 < n; t += 3, o += 6) { const a = A[t], b = A[t + 1], c = A[t + 2]; Ln[o] = a; Ln[o + 1] = b; Ln[o + 2] = b; Ln[o + 3] = c; Ln[o + 4] = c; Ln[o + 5] = a; }
    const lib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Ln, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this._lb -= n; (this._libs || (this._libs = [])).push(m); m.lib = lib; return lib;
  },
  // dynamic triangle soup (decals, trails, rings): same vertex layout, non-indexed
  dyn(cap = 20000) {
    const gl = this.gl, ab = new ArrayBuffer(cap * 32), d = { cap, n: 0, f: new Float32Array(ab), i8: new Int8Array(ab), u8: new Uint8Array(ab), u16: new Uint16Array(ab), vao: gl.createVertexArray(), vb: gl.createBuffer() };
    gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ARRAY_BUFFER, d.vb); gl.bufferData(gl.ARRAY_BUFFER, ab.byteLength, gl.DYNAMIC_DRAW); vattr(gl); gl.bindVertexArray(null);
    d.vert = (x, y, z, u, v, c, layer, nx = 0, ny = 1, nz = 0) => { if (d.n >= d.cap) return; const i = d.n++, o = i * 8, B = i * 32; d.f[o] = x; d.f[o + 1] = y; d.f[o + 2] = z; d.i8[B + 12] = nx * 127; d.i8[B + 13] = ny * 127; d.i8[B + 14] = nz * 127; d.i8[B + 15] = 0; d.f[o + 4] = u; d.f[o + 5] = v;
      for (let k = 0; k < 4; k++) d.u8[B + 24 + k] = clamp(c[k] * 127.5, 0, 255); d.u16[B / 2 + 14] = layer; d.u8[B + 30] = 0; d.u8[B + 31] = 0; };
    d.quad = (a, b, c, e, c4, layer, uv = [0, 0, 1, 1], n) => { const nn = n || [0, 1, 0]; d.vert(...a, uv[0], uv[3], c4, layer, ...nn); d.vert(...b, uv[2], uv[3], c4, layer, ...nn); d.vert(...c, uv[2], uv[1], c4, layer, ...nn); d.vert(...a, uv[0], uv[3], c4, layer, ...nn); d.vert(...c, uv[2], uv[1], c4, layer, ...nn); d.vert(...e, uv[0], uv[1], c4, layer, ...nn); };
    d.flush = () => { if (!d.n) return; const g = R.gl; g.bindBuffer(g.ARRAY_BUFFER, d.vb); g.bufferSubData(g.ARRAY_BUFFER, 0, d.u8, 0, d.n * 32); };
    return d;
  },
  // instanced crowd batch for one body mesh: up to cap instances, 48 bytes each (see VS_CROWD)
  crowdBatch(mesh, cap, piv) {
    const gl = this.gl, ab = new ArrayBuffer(cap * 48), c = { mesh, cap, n: 0, piv: new Float32Array(piv.flat()), f: new Float32Array(ab), u8: new Uint8Array(ab), vao: gl.createVertexArray(), buf: gl.createBuffer() };
    gl.bindVertexArray(c.vao); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb); vattr(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.buf); gl.bufferData(gl.ARRAY_BUFFER, ab.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 48, 0); gl.vertexAttribDivisor(6, 1);
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, 48, 16); gl.vertexAttribDivisor(7, 1);
    for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(8 + k); gl.vertexAttribPointer(8 + k, 4, gl.UNSIGNED_BYTE, true, 48, 32 + k * 4); gl.vertexAttribDivisor(8 + k, 1); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.bindVertexArray(null);
    // add(x,y,z,yaw, anim,phase,amount,scale, cols: 4 x [r,g,b] (0..1, slot 1..4), bright 0..1)
    c.add = (x, y, z, yaw, anim, phase, amt, scale, cols, bright = .5) => { if (c.n >= c.cap) return; const i = c.n++, o = i * 12, B = i * 48; const f = c.f; f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = yaw; f[o + 4] = anim; f[o + 5] = phase; f[o + 6] = amt; f[o + 7] = scale;
      for (let k = 0; k < 4; k++) { const q = cols[k]; c.u8[B + 32 + k * 4] = q[0] * 255; c.u8[B + 33 + k * 4] = q[1] * 255; c.u8[B + 34 + k * 4] = q[2] * 255; c.u8[B + 35 + k * 4] = 255; } c.u8[B + 47] = bright * 255; };
    return c;
  },
  // more = true: another crowd batch follows immediately (program/uniform setup is shared; the main program is restored after the last one)
  drawCrowd(c, more) {
    if (this.shadowing) return this.drawCrowdShadow(c);
    const gl = this.gl, p = this.pCrowd, u = p.u;
    const cnt = c.nVis !== undefined ? Math.min(c.nVis, c.n) : c.n; // people.js appends shadow-only casters after nVis
    if (cnt) {
      if (!this._inCrowd) { gl.useProgram(p); this.envUniforms(p); gl.uniformMatrix4fv(u.uVP, false, this.vp); gl.uniform1f(u.uTime, this.time);
        gl.uniform4fv(u.uFlash, Z4); gl.uniform1f(u.uAlpha, 1); gl.uniform1f(u.uUnlit, 0); gl.uniform1f(u.uFogAmt, 1); gl.uniform1i(u.uTerr, 0); gl.uniform3fv(u.uTint, ONE3); gl.uniform1f(u.uBias, 1); gl.uniform1f(u.uDScale, this.dscale || 1);
        gl.enable(gl.CULL_FACE); this._inCrowd = true; }
      gl.uniform3fv(u.uPiv, c.piv);
      if (c.dirty !== false) { gl.bindBuffer(gl.ARRAY_BUFFER, c.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.u8, 0, c.n * 48); c.dirty = false; } // instances uploaded once per fill (people.js sets c.dirty)
      const lib = this.wire ? this.lines(c.mesh) : null; if (this.wire) gl.uniform1i(u.uWire, 1);
      gl.bindVertexArray(c.vao); gl.drawElementsInstanced(gl.TRIANGLES, c.mesh.count, c.mesh.itype, 0, cnt);
      if (lib) { gl.uniform1i(u.uWire, 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lib); gl.drawElementsInstanced(gl.LINES, c.mesh.count * 2, c.mesh.itype, 0, cnt); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.mesh.ib); }
      if (this.wire) gl.uniform1i(u.uWire, 0);
      this.stats.tris += c.mesh.count / 3 * cnt; this.stats.calls++;
    }
    if (!more && this._inCrowd) { this._inCrowd = false; this.useMain(this.vp); }
  },
  setCamera(x, y, z, yaw, pitch, roll = 0, fov = this.fov) {
    this.camPos = [x, y, z]; this.camYaw = yaw; this.camPitch = pitch; this.camRoll = roll; this.curFov = fov;
    const cw = M4.trs(M4.new(), x, y, z, pitch, yaw, roll); M4.inv(this.view, cw); this.camWorld = cw;
    M4.persp(this.proj, fov, this.W / this.H, this.near, this.far); M4.mul(this.vp, this.proj, this.view); this._planes();
  },
  // exact frustum test of an AABB [x0,y0,z0,x1,y1,z1] (planes from the view-projection matrix, updated in setCamera), plus the fog range
  boxVisible(b) {
    if (!b) return true; const P = this._fp, c = this.camPos, fr = this.env.fog[1] * 1.7 + 20;
    const dx = Math.max(b[0] - c[0], 0, c[0] - b[3]), dy = Math.max(b[1] - c[1], 0, c[1] - b[4]), dz = Math.max(b[2] - c[2], 0, c[2] - b[5]); if (dx * dx + dy * dy + dz * dz > fr * fr && !this.noCullFar) return false;
    for (let i = 0; i < 24; i += 4) { const a = P[i], bb = P[i + 1], cc = P[i + 2], d = P[i + 3]; if (a * (a > 0 ? b[3] : b[0]) + bb * (bb > 0 ? b[4] : b[1]) + cc * (cc > 0 ? b[5] : b[2]) + d < 0) return false; }
    return true;
  },
  _fp: new Float32Array(24),
  _planes() { const m = this.vp, P = this._fp; const row = (r) => [m[r], m[4 + r], m[8 + r], m[12 + r]], r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    const set = (i, a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; P[i] = a[0] / l; P[i + 1] = a[1] / l; P[i + 2] = a[2] / l; P[i + 3] = a[3] / l; };
    set(0, r3.map((v, k) => v + r0[k])); set(4, r3.map((v, k) => v - r0[k])); set(8, r3.map((v, k) => v + r1[k])); set(12, r3.map((v, k) => v - r1[k])); set(16, r3.map((v, k) => v + r2[k])); set(20, r3.map((v, k) => v - r2[k]) .map((v, k) => k === 3 ? v + 1e6 : v)); },
  // frustum-ish cull: sphere in front of camera and within fog range
  visible(x, y, z, r) {
    if (this.shadowing) return true;
    const c = this.camPos, dx = x - c[0], dy = y - c[1], dz = z - c[2], d2 = dx * dx + dy * dy + dz * dz, fr = this.env.fog[1] * 1.7 + r + 10;
    if (d2 > fr * fr && !this.noCullFar) return false;
    const fx = -Math.sin(this.camYaw) * Math.cos(this.camPitch), fy = Math.sin(this.camPitch), fz = -Math.cos(this.camYaw) * Math.cos(this.camPitch);
    const dd = dx * fx + dy * fy + dz * fz; if (dd < -r) return false;
    return dd * Math.tan(Math.min(this.curFov * .5 * this.W / this.H, 1.5) + .05) + r * 1.6 > Math.sqrt(Math.max(d2 - dd * dd, 0));
  },
  begin() {
    const gl = this.gl, e = this.env; this.frame++; this.stats.tris = 0; this.stats.calls = 0; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.W, this.H);
    this._lb = 4e6; // wireframe: line index budget per frame (indices read back and converted)
    if (this.wire) gl.clearColor(1, 1, 1, 1); else gl.clearColor(e.fogC[0], e.fogC[1], e.fogC[2], 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    if (e.sky !== null && !e.noSky && !this.wire) {
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.useProgram(this.pSky); const u = this.pSky.u;
      const vr = this.view.slice(); vr[12] = vr[13] = vr[14] = 0; const ivp = M4.inv(M4.new(), M4.mul(M4.new(), this.proj, vr));
      gl.uniformMatrix4fv(u.uIVP, false, ivp); gl.uniform3fv(u.uTop, e.skyTop); gl.uniform3fv(u.uHor, e.skyHor); gl.uniform3fv(u.uBot, e.skyBot); gl.uniform3fv(u.uSunD, e.sunD); gl.uniform3fv(u.uSunC, e.skySunC || e.sunC); gl.uniform3fv(u.uCloudC, e.cloudC);
      gl.uniform1f(u.uTime, this.time); gl.uniform1f(u.uClouds, e.clouds); gl.uniform1f(u.uStars, e.stars);
      gl.bindVertexArray(this.fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(this.depthLess ? gl.LESS : gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    this.useMain(this.vp);
  },
  useMain(vp) {
    const gl = this.gl, u = this.pMain.u; gl.useProgram(this.pMain); this.envUniforms(this.pMain);
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform1f(u.uTime, this.time);
    this._last = {};
  },
  // lighting/fog/texture uniforms shared by the main and crowd programs (light list is sorted once per frame)
  envUniforms(p) {
    const gl = this.gl, u = p.u, e = this.env;
    if (u.uHide) gl.uniform1i(u.uHide, this.hideMask | 0); if (u.uLampK) gl.uniform4fv(u.uLampK, this.lampK || [1, 1, 1, 1]);
    if (u.uLB) { gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.lbtex); gl.uniform1i(u.uLB, 6); gl.activeTexture(gl.TEXTURE0); }
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.ntex); gl.uniform1i(u.uNM, 5); gl.uniform1f(u.uBump, this.bump.on ? this.bump.k : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex); gl.uniform1i(u.uT, 0); gl.uniform1f(u.uLogF, 2 / Math.log2(this.far + 1));
    { const S = this.sh, on = S.on && S.ready && !this.shadowing ? 1 : 0; gl.uniform1i(u.uShOn, on); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, S.tex); gl.uniform1i(u.uSh, 3); gl.activeTexture(gl.TEXTURE0); if (on) {
      gl.uniformMatrix4fv(u.uLVP, false, S.all); gl.uniform4f(u.uShS, S.splits[0], S.splits[1], S.splits[2], S.fade); gl.uniform3f(u.uShT, S.texel[0], S.texel[1], S.texel[2]); gl.uniform1f(u.uShK, .5 / (S.size * 2)); gl.uniform1fv(u.uShB, S.bias); } }
    gl.uniform3fv(u.uHaze, e.haze || [0, 0, 0]); gl.uniform1f(u.uEmiK, e.emiK === undefined ? 1 : e.emiK); gl.uniform3fv(u.uSky, e.sky); gl.uniform3fv(u.uGnd, e.gnd); gl.uniform3fv(u.uSunD, e.sunD); gl.uniform3fv(u.uSunC, e.sunC); gl.uniform3fv(u.uFogC, e.fogC); gl.uniform4fv(u.uFog, e.fog); gl.uniform3fv(u.uCam, this.camPos); gl.uniform1f(u.uBands, e.bands);
    if (u.uWatL) { gl.uniform1i(u.uWatL, this.water.on && this.water.l >= 0 ? this.water.l : -1); gl.uniform1i(u.uWSSR, this.water.ssr ? 1 : 0); if (this.water.on) this.waterUniforms(u); }
    if (this._lf !== this.frame) { // lights: pick the 16 most relevant once per frame
      this._lf = this.frame; const c = this.camPos, L = this.lights.filter(l => l.r > 0 && (l.i === undefined || l.i > 0)).map(l => { const d = Math.hypot(l.x - c[0], l.y - c[1], l.z - c[2]); return [l, d - l.r * 1.5]; }).sort((a, b) => a[1] - b[1]).slice(0, 16);
      this._lp.fill(0); this._lc.fill(0); L.forEach(([l], i) => { const k = l.i === undefined ? 1 : l.i; this._lp.set([l.x, l.y, l.z, l.r], i * 4); this._lc.set([l.c[0] * k, l.c[1] * k, l.c[2] * k], i * 3); }); this._nl = L.length;
    }
    gl.uniform4fv(u.uLP, this._lp); gl.uniform3fv(u.uLC, this._lc); gl.uniform1i(u.uNL, this._nl);
  },
  // o: {pose, flash:[r,g,b,a], alpha, scroll:[u,v], wave, unlit, fog(0..1), terr:[l0,l1,l2,l3], tint, bias, cull:false}
  // ---- shadows: render the scene into the cascades. drawScene() must issue the same R.draw / R.drawCrowd calls as the main pass.
  renderShadows(drawScene) {
    const S = this.sh, gl = this.gl; if (!S.on || !S.fbo || this.wire) { S.ready = false; return; }
    // the light direction for shadows is held fixed and only snapped forward when the sun has moved > ~0.15 deg: a continuously
    // moving sun re-rasterises every shadow edge each frame (crawling/'boiling' edges even on static objects)
    const sd = this.env.sunD; if (!S.ld || S.ld[0] * sd[0] + S.ld[1] * sd[1] + S.ld[2] * sd[2] < Math.cos(.0026) || S.force) { S.ld = sd.slice(); S.force = false; S.ready = false; }
    const ld = S.ld, cam = this.camPos, fwd = [-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch)];
    // light basis (fixed for a given sun direction, so snapping in it is stable)
    const F = [-ld[0], -ld[1], -ld[2]], up = Math.abs(F[1]) > .99 ? [1, 0, 0] : [0, 1, 0], Rt = v3norm(v3cross(F, up)), Up = v3cross(Rt, F);
    const tanH = Math.tan(this.curFov / 2), asp = this.W / this.H, kk = tanH * Math.sqrt(1 + asp * asp), saved = this.vp.slice(), savedP = this._fp.slice();
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.depthMask(true); gl.clearDepth(1); S.k = (S.k || 0) + 1; // cascade 0 every frame, 1 and 2 on alternate frames
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.1, 2.0); gl.enable(gl.SCISSOR_TEST);
    this.shadowing = true; let n0 = this.near;
    for (let c = 0; c < 3; c++) {
      if (S.ready && c > 0 && (S.k & 1) !== c - 1) continue;
      const n = c ? S.splits[c - 1] * .82 : n0, f = S.splits[c], zc = (n + f) / 2, r = Math.ceil(Math.max(Math.hypot(f - zc, f * kk), Math.hypot(zc - n, n * kk)) + 1);
      let ctr = [cam[0] + fwd[0] * zc, cam[1] + fwd[1] * zc, cam[2] + fwd[2] * zc]; const tx = 2 * r / S.size; S.texel[c] = tx;
      const a = v3dot(ctr, Rt), b = v3dot(ctr, Up), da = Math.round(a / tx) * tx - a, db = Math.round(b / tx) * tx - b; ctr = [ctr[0] + Rt[0] * da + Up[0] * db, ctr[1] + Rt[1] * da + Up[1] * db, ctr[2] + Rt[2] * da + Up[2] * db];
      const D = r + 140, eye = [ctr[0] - F[0] * D, ctr[1] - F[1] * D, ctr[2] - F[2] * D], V = M4.new(); // view: rows = Rt, Up, -F; depth range tight around the cascade (+140 m for tall casters)
      V[0] = Rt[0]; V[4] = Rt[1]; V[8] = Rt[2]; V[1] = Up[0]; V[5] = Up[1]; V[9] = Up[2]; V[2] = -F[0]; V[6] = -F[1]; V[10] = -F[2];
      V[12] = -v3dot(Rt, eye); V[13] = -v3dot(Up, eye); V[14] = v3dot(F, eye); V[15] = 1;
      const P = M4.new(), nz = 1, fz = D * 2; P[0] = 1 / r; P[5] = 1 / r; P[10] = -2 / (fz - nz); P[14] = -(fz + nz) / (fz - nz); P[15] = 1;
      M4.mul(S.lvp[c], P, V); S.all.set(S.lvp[c], c * 16); S.bias[c] = (.012 + tx * .25) / (fz - nz); // world-space bias: ~1–10 cm
      const ox = c === 1 ? S.size : 0, oy = c === 2 ? S.size : 0; gl.viewport(ox, oy, S.size, S.size); gl.scissor(ox, oy, S.size, S.size); gl.clear(gl.DEPTH_BUFFER_BIT);
      this.vp.set(S.lvp[c]); this._planes(); this._ls = null; drawScene(c);
    }
    this.shadowing = false; gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.SCISSOR_TEST); this.vp.set(saved); this._fp.set(savedP); S.ready = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },
  drawS(m, model, o) {
    if (!m || !m.count || o.terr || o.noShadow) return; const gl = this.gl, p = this.pShM, u = p.u;
    if (this._ls !== p) { gl.useProgram(p); if (u.uHide) gl.uniform1i(u.uHide, this.hideMask | 0); if (u.uLampK) gl.uniform4fv(u.uLampK, this.lampK || [1, 1, 1, 1]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex); gl.uniform1i(u.uT, 0); gl.uniformMatrix4fv(u.uVP, false, this.vp); gl.uniform1f(u.uTime, this.time); gl.uniform1f(u.uWave, 0); gl.uniform2f(u.uScroll, 0, 0); this._ls = p; this._lsk = -1; }
    gl.uniformMatrix4fv(u.uM, false, model); const sk = o.pose ? 1 : 0; if (this._lsk !== sk) { gl.uniform1i(u.uSkin, sk); this._lsk = sk; } if (o.pose) gl.uniformMatrix4fv(u.uBn, false, o.pose.skin);
    if (o.cull === false) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(m.vao);
    if (o.runs) { const sz = m.itype === gl.UNSIGNED_INT ? 4 : 2; for (const [st, n] of o.runs) gl.drawElements(gl.TRIANGLES, n, m.itype, st * sz); return; }
    if (m.ib) gl.drawElements(gl.TRIANGLES, m.count, m.itype, 0); else gl.drawArrays(gl.TRIANGLES, 0, m.count);
  },
  drawCrowdShadow(c) {
    if (!c.n) return; const gl = this.gl, p = this.pShC, u = p.u; gl.useProgram(p); this._ls = p;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex); gl.uniform1i(u.uT, 0); gl.uniformMatrix4fv(u.uVP, false, this.vp); gl.uniform1f(u.uTime, this.time); gl.uniform3fv(u.uPiv, c.piv);
    if (c.dirty !== false) { gl.bindBuffer(gl.ARRAY_BUFFER, c.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.u8, 0, c.n * 48); c.dirty = false; }
    gl.disable(gl.CULL_FACE); gl.bindVertexArray(c.vao); gl.drawElementsInstanced(gl.TRIANGLES, c.mesh.count, c.mesh.itype, 0, c.n); gl.enable(gl.CULL_FACE);
  },
  draw(m, model, o = {}) {
    if (m && m.pending) return;
    if (this.shadowing) return this.drawS(m, model, o);
    if (!m || !m.count) return;
    const gl = this.gl, u = this.pMain.u, L = this._last;
    gl.uniformMatrix4fv(u.uM, false, model);
    const skin = o.pose ? 1 : 0; if (L.skin !== skin) { gl.uniform1i(u.uSkin, skin); L.skin = skin; }
    if (o.pose) gl.uniformMatrix4fv(u.uBn, false, o.pose.skin);
    const fl = o.flash || Z4; if (L.fl !== fl) { gl.uniform4fv(u.uFlash, fl); L.fl = fl; }
    const al = o.alpha === undefined ? 1 : o.alpha; if (L.al !== al) { gl.uniform1f(u.uAlpha, al); L.al = al; }
    const sc = o.scroll || Z2; if (L.sc !== sc) { gl.uniform2fv(u.uScroll, sc); L.sc = sc; }
    const wv = o.wave || 0; if (L.wv !== wv) { gl.uniform1f(u.uWave, wv); L.wv = wv; }
    const ul = o.unlit ? 1 : 0; if (L.ul !== ul) { gl.uniform1f(u.uUnlit, ul); L.ul = ul; }
    const fg = o.fog === undefined ? 1 : o.fog; if (L.fg !== fg) { gl.uniform1f(u.uFogAmt, fg); L.fg = fg; }
    const te = o.terr ? 1 : 0; if (L.te !== te) { gl.uniform1i(u.uTerr, te); L.te = te; } if (o.terr) gl.uniform4iv(u.uTL, o.terr);
    const ti = o.tint || ONE3; if (L.ti !== ti) { gl.uniform3fv(u.uTint, ti); L.ti = ti; }
    const bi = o.bias || 1; if (L.bi !== bi) { gl.uniform1f(u.uBias, bi); L.bi = bi; }
    const ds = this.dscale || 1; if (L.ds !== ds) { gl.uniform1f(u.uDScale, ds); L.ds = ds; }
    const cu = o.cull === false ? 0 : 1; if (L.cu !== cu) { if (cu) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); L.cu = cu; }
    const lib = this.wire ? this.lines(m) : null, wi = this.wire ? 1 : 0; if (L.wi !== wi) { gl.uniform1i(u.uWire, wi); L.wi = wi; }
    gl.bindVertexArray(m.vao);
    if (o.runs) { const sz = m.itype === gl.UNSIGNED_INT ? 4 : 2; for (const [st, n] of o.runs) { gl.drawElements(gl.TRIANGLES, n, m.itype, st * sz); this.stats.tris += n / 3; this.stats.calls++; }
      if (lib) { gl.uniform1i(u.uWire, 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lib); for (const [st, n] of o.runs) gl.drawElements(gl.LINES, n * 2, m.itype, st * sz * 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.uniform1i(u.uWire, 1); } return; }
    if (m.ib) gl.drawElements(gl.TRIANGLES, m.count, m.itype, 0); else gl.drawArrays(gl.TRIANGLES, 0, m.count);
    if (lib) { gl.uniform1i(u.uWire, 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lib); gl.drawElements(gl.LINES, m.count * 2, m.itype, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.uniform1i(u.uWire, 1); }
    this.stats.tris += m.count / 3; this.stats.calls++;
  },
  drawDyn(d, o = {}) { if (!d.n) return; d.flush(); this.draw({ vao: d.vao, count: d.n, ib: null }, IDM, o); },
  blend(mode) { // 0 none, 1 alpha, 2 additive
    const gl = this.gl; if (!mode) { gl.disable(gl.BLEND); gl.depthMask(true); gl.colorMask(true, true, true, true); return; }
    gl.enable(gl.BLEND); gl.depthMask(false); gl.colorMask(true, true, true, false); /* keep the colour alpha (water marker for FS_POST) */
    if (mode === 1) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);
  },
  // particles: arr of {x,y,z,size,r,g,b,a,layer,rot}; mode 0 cutout, 1 additive, 2 alpha
  particles(list, mode) {
    if (!list.length || this.wire) return; const gl = this.gl, d = this.partData; let n = 0;
    for (const p of list) { if (n >= this.partMax) break; const o = n * 10; d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = p.size; d[o + 4] = p.r; d[o + 5] = p.g; d[o + 6] = p.b; d[o + 7] = p.a; d[o + 8] = p.layer; d[o + 9] = p.rot || 0; n++; }
    gl.useProgram(this.pPart); const u = this.pPart.u, e = this.env;
    gl.uniformMatrix4fv(u.uV, false, this.view); gl.uniformMatrix4fv(u.uPr, false, this.proj); gl.uniform1f(u.uLogF, 2 / Math.log2(this.far + 1)); gl.uniform1i(u.uMode, mode); gl.uniform1i(u.uT, 0);
    gl.uniform3fv(u.uFogC, e.fogC); gl.uniform3fv(u.uCam, this.camPos); gl.uniform4fv(u.uFog, e.fog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 10);
    gl.disable(gl.CULL_FACE); this.blend(mode === 0 ? 0 : mode === 1 ? 2 : 1);
    gl.bindVertexArray(this.pVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    this.blend(0); gl.enable(gl.CULL_FACE); gl.useProgram(this.pMain); this._last = {};
  },
  clearDepth() { const gl = this.gl; gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); },
  end() {
    const gl = this.gl, e = this.env, u = this.pPost.u; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(this.pPost);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.ctex); gl.uniform1i(u.uS, 1); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.uGrain, e.grain || 0);
    { // sun position on screen for the light shafts
      const d = e.sunD, v = this.view, x = v[0] * d[0] + v[4] * d[1] + v[8] * d[2], y = v[1] * d[0] + v[5] * d[1] + v[9] * d[2], z = v[2] * d[0] + v[6] * d[1] + v[10] * d[2], P = this.proj;
      const cx = P[0] * x, cy = P[5] * y, w = -z; gl.uniform3f(u.uSunP, w > 0 ? cx / w * .5 + .5 : 0, w > 0 ? cy / w * .5 + .5 : 0, w > 0 && e.el > -2 ? 1 : 0);
      gl.uniform1f(u.uShaft, e.shaft || 0); gl.uniform3fv(u.uShaftC, e.shaftC || [0, 0, 0]); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dsnap); gl.uniform1i(u.uDp, 2); gl.activeTexture(gl.TEXTURE0); }
    { const W = this.water, on = W.on && W.ssr && W.l >= 0 ? 1 : 0; gl.uniform1i(u.uWat, on); if (on) { this.waterUniforms(u); const ty = Math.tan(this.curFov / 2);
      gl.uniform1f(u.uLF, Math.log2(this.far + 1)); gl.uniform1f(u.uTx, ty * this.W / this.H); gl.uniform1f(u.uTy, ty); gl.uniform1f(u.uWSs, 117); gl.uniformMatrix4fv(u.uCW, false, this.camWorld); gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uCam, this.camPos); gl.uniform3fv(u.uSunD, e.sunD); gl.uniform4fv(u.uFog, e.fog); } }
    gl.uniform1i(u.uWire, this.wire ? 1 : 0);
    if (u.uPalN) { const pal = this.palette; gl.uniform1i(u.uPalN, pal ? pal.length / 3 : 0); if (pal) gl.uniform3fv(u.uPalC, pal); }
    gl.uniform2f(u.uRes, this.W, this.H); gl.uniform1f(u.uLv, e.lv); gl.uniform1f(u.uVig, e.vig); gl.uniform1f(u.uSat, e.sat); gl.uniform1f(u.uGam, e.gam); gl.uniform3fv(u.uGrade, e.grade); gl.uniform4fv(u.uOver, this.over);
    gl.bindVertexArray(this.fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST);
  },
};
const Z4 = [0, 0, 0, 0], Z2 = [0, 0], ONE3 = [1, 1, 1], IDM = M4.new();

// ---------------- collision world ----------------
// Solids: oriented boxes (yaw only) and vertical cylinders, plus optional heightfield terrain. Grid-indexed.
class World {
  constructor() { this.solids = []; this.dyn = []; this.grid = new Map(); this.terr = null; this.killY = -60; this.cs = 6; }
  _key(i, j) { return (i + 2048) * 4096 + (j + 2048); }
  _index(s) {
    const r = s.br, cs = this.cs;
    for (let i = Math.floor((s.cx - r) / cs); i <= Math.floor((s.cx + r) / cs); i++) for (let j = Math.floor((s.cz - r) / cs); j <= Math.floor((s.cz + r) / cs); j++) {
      const k = this._key(i, j); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(s);
    }
  }
  // box by center + half extents. o: {yaw, dynamic, tag, surface}
  box(cx, cy, cz, hx, hy, hz, o = {}) {
    const yaw = o.yaw || 0, s = { k: 0, cx, cy, cz, hx, hy, hz, yaw, c: Math.cos(yaw), s: Math.sin(yaw), br: Math.hypot(hx, hz), tag: o.tag, surface: o.surface, on: true, grp: o.grp || 0 };
    this.solids.push(s); if (o.dynamic) { s.dynamic = true; this.dyn.push(s); this.syncDyn(s); s.pcx = cx; s.pcy = cy; s.pcz = cz; s.pyaw = yaw; } else this._index(s); return s;
  }
  cyl(x, z, y0, y1, r, o = {}) { const s = { k: 1, cx: x, cz: z, cy: (y0 + y1) / 2, hy: (y1 - y0) / 2, r, br: r, tag: o.tag, surface: o.surface, on: true }; this.solids.push(s); if (o.dynamic) { s.dynamic = true; this.dyn.push(s); s.pcx = x; s.pcy = s.cy; s.pcz = z; s.pyaw = 0; s.yaw = 0; } else this._index(s); return s; }
  // sloped roof (walkable): base y at the eaves (cy), rise hy (H) to the ridge, half extents hx (X, along the ridge) / hz (Z), yaw;
  // type 0 gable, 1 shed (rises toward -z), 2 hipped/歇山 (s1: hip share; 1 = full hip); the same curve as ARCH.roof (concave, k)
  roof(cx, cy, cz, hx, hy, hz, yaw, type = 0, s1 = 1, o = {}) { const s = { k: 2, cx, cy, cz, hx, hy, hz, yaw, c: Math.cos(yaw), s: Math.sin(yaw), br: Math.hypot(hx, hz), rt: type, s1, kk: type === 1 ? .12 : .3, tag: o.tag, surface: o.surface || 'tile', on: true, grp: o.grp || 0, r: type * 10 + s1 }; this.solids.push(s); this._index(s); return s; }
  roofTop(s, x, z, clampIn = false) { let [lx, lz] = this._local(s, x, z); if (clampIn) { lx = clamp(lx, -s.hx, s.hx); lz = clamp(lz, -s.hz, s.hz); } else if (Math.abs(lx) > s.hx || Math.abs(lz) > s.hz) return -1e9;
    let v; if (s.rt === 1) v = (s.hz - lz) / (2 * s.hz); else { const sf = (s.hz - Math.abs(lz)) / s.hz, se = (s.hx - Math.abs(lx)) / s.hz; v = (s.rt === 2 && se < sf && se <= s.s1) ? se : sf; }
    v = clamp(v, 0, 1); return s.cy + s.hy * (v - s.kk * v * (1 - v)); }
  syncDyn(s) { s.c = Math.cos(s.yaw || 0); s.s = Math.sin(s.yaw || 0); }
  beginFrame() { for (const s of this.dyn) { s.pcx = s.cx; s.pcy = s.cy; s.pcz = s.cz; s.pyaw = s.yaw || 0; } }
  // carry a point standing on dynamic solid s from previous to current transform
  carry(s, p) {
    const dx = p[0] - s.pcx, dz = p[2] - s.pcz, pc = Math.cos(s.pyaw), ps = Math.sin(s.pyaw);
    const lx = pc * dx - ps * dz, lz = ps * dx + pc * dz, c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0);
    p[0] = s.cx + c * lx + sn * lz; p[2] = s.cz - sn * lx + c * lz; p[1] += s.cy - s.pcy; return (s.yaw || 0) - s.pyaw;
  }
  terrain(t) { this.terr = t; } // {x0,z0,cell,nx,nz,h:Float32Array((nx+1)*(nz+1))}
  heightAt(x, z) {
    if (this.hfn) return this.hfn(x, z);
    const t = this.terr; if (!t) return -1e9; const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell;
    if (fx < 0 || fz < 0 || fx >= t.nx || fz >= t.nz) return -1e9;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, W = t.nx + 1, h = t.h;
    const h00 = h[j * W + i], h10 = h[j * W + i + 1], h01 = h[(j + 1) * W + i], h11 = h[(j + 1) * W + i + 1];
    return u > v ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h11 - h01) * u + (h01 - h00) * v;
  }
  near(x, z, r, cb) {
    const cs = this.cs, seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = Math.floor((x - r) / cs); i <= Math.floor((x + r) / cs); i++) for (let j = Math.floor((z - r) / cs); j <= Math.floor((z + r) / cs); j++) {
      const a = this.grid.get(this._key(i, j)); if (a) for (const s of a) if (s.on && !seen.has(s)) { seen.add(s); cb(s); }
    }
    for (const s of this.dyn) if (s.on) cb(s);
  }
  _local(s, x, z) { const dx = x - s.cx, dz = z - s.cz; return [s.c * dx - s.s * dz, s.s * dx + s.c * dz]; }
  _inXZ(s, x, z, pad = 0) { if (s.k === 1) return Math.hypot(x - s.cx, z - s.cz) < s.r + pad; const [lx, lz] = this._local(s, x, z); return Math.abs(lx) <= s.hx + pad && Math.abs(lz) <= s.hz + pad; }
  // highest support surface at or below `feet+step`. returns {y, s}
  ground(x, z, feet, step = .45, rad = 0) {
    let best = this.heightAt(x, z), bs = null;
    this.near(x, z, rad + .1, s => { if (s.k === 2) { const top = this.roofTop(s, x, z); if (top <= feet + step && top > best) { best = top; bs = s; } return; } const top = s.cy + s.hy; if (top <= feet + step && top > best && this._inXZ(s, x, z, rad * .5)) { best = top; bs = s; } });
    return { y: best, s: bs };
  }
  // lowest ceiling above `head` region
  ceil(x, z, feet, head) { let best = 1e9; this.near(x, z, .1, s => { const bot = s.k === 2 ? this.roofTop(s, x, z) - World.ROOFT : s.cy - s.hy; if (bot >= feet + .2 && bot < best && this._inXZ(s, x, z)) best = bot; }); return best; }
  // push circle out of walls; returns [x,z,hit]
  push(x, z, r, feet, head, step = .45) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      this.near(x, z, r + 1, s => {
        let top = s.cy + s.hy, bot = s.cy - s.hy;
        if (s.k === 2) { top = this.roofTop(s, x, z, true); bot = top - World.ROOFT; } // a roof blocks only where its slab is higher than a step (a ridge beyond, a higher roof)
        if (top <= feet + step || bot >= head) return;
        if (s.k === 1) { const dx = x - s.cx, dz = z - s.cz, d = Math.hypot(dx, dz), m = s.r + r; if (d < m) { const k = d > 1e-6 ? (m - d) / d : 0; x += dx * k || m; z += dz * k; moved = hit = true; } return; }
        const [lx, lz] = this._local(s, x, z); const px = clamp(lx, -s.hx, s.hx), pz = clamp(lz, -s.hz, s.hz); let ddx = lx - px, ddz = lz - pz; const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) return; let ox, oz;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); ox = ddx / d * (r - d); oz = ddz / d * (r - d); }
        else { const ex = s.hx - Math.abs(lx), ez = s.hz - Math.abs(lz); if (ex < ez) { ox = Math.sign(lx || 1) * (ex + r); oz = 0; } else { ox = 0; oz = Math.sign(lz || 1) * (ez + r); } }
        x += s.c * ox + s.s * oz; z += -s.s * ox + s.c * oz; moved = hit = true;
      });
      if (!moved) break;
    }
    return [x, z, hit];
  }
  solidAt(x, y, z) {
    if (y < this.heightAt(x, z)) return true; let r = false;
    this.near(x, z, .05, s => { if (r) return; if (s.k === 2) { const t = this.roofTop(s, x, z); if (y < t && y > t - World.ROOFT) r = true; return; } if (y > s.cy - s.hy && y < s.cy + s.hy && this._inXZ(s, x, z)) r = true; }); return r;
  }
  los(a, b, step = .5) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz), n = Math.ceil(d / step);
    for (let i = 1; i < n; i++) { const t = i / n; if (this.solidAt(a[0] + dx * t, a[1] + dy * t, a[2] + dz * t)) return false; } return true;
  }
  // march a ray; returns distance to first solid or maxD
  ray(o, d, maxD, step = .25) { for (let t = step; t < maxD; t += step) if (this.solidAt(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t)) return t; return maxD; }
}
World.ROOFT = .35; // roof slab thickness for collision

// ---------------- input ----------------
const Input = {
  keys: {}, hits: {}, mdx: 0, mdy: 0, mb: [0, 0, 0, 0, 0], mbh: [0, 0, 0, 0, 0], mbr: [0, 0, 0, 0, 0], wheel: 0, locked: false, native: typeof window !== 'undefined' && !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.drums),
  init(el) {
    addEventListener('keydown', e => { if (!this.keys[e.code]) this.hits[e.code] = 1; this.keys[e.code] = 1; if (!e.metaKey) e.preventDefault(); });
    addEventListener('keyup', e => { this.keys[e.code] = 0; });
    addEventListener('blur', () => { this.keys = {}; this.mb = [0, 0, 0, 0, 0]; });
    el.addEventListener('mousedown', e => { this.mb[e.button] = 1; this.mbh[e.button] = 1; if (!this.locked) this.lock(); });
    addEventListener('mouseup', e => { if (this.mb[e.button]) this.mbr[e.button] = 1; this.mb[e.button] = 0; });
    addEventListener('mousemove', e => { if (this.locked && !this.native) { this.mdx += e.movementX; this.mdy += e.movementY; } });
    addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', e => e.preventDefault());
    // mouse side buttons (3/4) would navigate back/forward in browsers
    addEventListener('auxclick', e => { if (e.button > 2) e.preventDefault(); }); addEventListener('mouseup', e => { if (e.button > 2) e.preventDefault(); }); addEventListener('mousedown', e => { if (e.button > 2) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    window.__nativeMouse = (dx, dy) => { if (this.locked) { this.mdx += dx; this.mdy += dy; } };
    window.__nativeUnlocked = () => { this.locked = false; };
    window.__nativeButton = (b, down) => { if (down) { this.mb[b] = 1; this.mbh[b] = 1; } else { this.mb[b] = 0; this.mbr[b] = 1; } };
    this.el = el;
  },
  lock() { if (this.native) { window.webkit.messageHandlers.drums.postMessage({ lock: true }); this.locked = true; } else if (this.el.requestPointerLock) { const p = this.el.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } },
  unlock() { if (this.native) { window.webkit.messageHandlers.drums.postMessage({ lock: false }); this.locked = false; } else if (document.exitPointerLock) document.exitPointerLock(); },
  down(c) { return !!this.keys[c]; }, hit(c) { return !!this.hits[c]; },
  end() { this.hits = {}; this.mdx = this.mdy = 0; this.mbh = [0, 0, 0, 0, 0]; this.mbr = [0, 0, 0, 0, 0]; this.wheel = 0; },
};
