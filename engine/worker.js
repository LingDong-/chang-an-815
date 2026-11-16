// worker.js — EIGHT HUNDRED DRUMS build worker: runs the same deterministic CITY.setup as the main thread, then builds
// geometry jobs (CITY.JOBS) and returns packed vertex/index buffers (transferred, zero-copy).
'use strict';
importScripts('engine.js', 'font_cjk.js', 'kit.js', 'nature.js', 'plan.js', 'city.js', 'landmarks.js', 'palace.js', 'interior.js');
onmessage = e => {
  const m = e.data;
  if (m.t === 'setup') { CITY.setup(m.o); postMessage({ t: 'ready', ms: CITY.setupMs }); return; }
  try { const r = CITY.job(m); postMessage(r.msg, r.transfer); } catch (err) { postMessage({ t: m.t, id: m.id, error: String(err && err.stack || err) }); }
};
