// ===== AGENT BRAWL extension layer, part 1: BUS (events) and HOOKS (extension points). Loaded first, right after the inline W/H script. =====
// Owner: scaffold. Feature files talk to the engine only through BUS, HOOKS, SETTINGS (settings.js) and MODES (modes.js); the contracts are listed in docs/ARCHITECTURE.md.
//   BUS   fire-and-forget notifications. BUS.on(name, fn) returns an unsubscribe function. BUS.once(name, fn), BUS.off(name, fn), BUS.emit(name, payload), BUS.count(name).
//   HOOKS places where a feature changes what the engine does. HOOKS.add(name, fn, order = 0) returns a remove function (lower order runs first, ties run in registration order).
//         HOOKS.run(name, ...args)           call every handler (draw and update points)
//         HOOKS.filter(name, value, ...args) pass value through every handler, each returns the new value (undefined keeps it); the engine uses what comes out
//         HOOKS.collect(name, ...args)       gather what the handlers return (single items or arrays) into one flat array (menu items)
//         HOOKS.has(name)                    true when something is registered
// A handler that throws is caught and logged once per name (console.error, so the test run fails on it); the game keeps going.
// With nothing registered every call returns at once: the engine can call them from its hot paths.
'use strict';
const BUS = (() => {
  const subs = Object.create(null), warned = Object.create(null);
  const bad = (name, e) => { if (warned[name]) return; warned[name] = 1; try { console.error('BUS handler for "' + name + '" threw: ' + (e && e.stack || e)); } catch (x) { /* no console */ } };
  function on(name, fn) { (subs[name] || (subs[name] = [])).push(fn); return () => off(name, fn); }
  function off(name, fn) { const l = subs[name]; if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function once(name, fn) { const w = p => { off(name, w); fn(p); }; return on(name, w); }
  function emit(name, payload) { const l = subs[name]; if (!l || !l.length) return; for (const fn of l.slice()) { try { fn(payload); } catch (e) { bad(name, e); } } }
  return { on, off, once, emit, count: name => (subs[name] || []).length };
})();

const HOOKS = (() => {
  const pts = Object.create(null), warned = Object.create(null);
  let seq = 0;
  const bad = (name, e) => { if (warned[name]) return; warned[name] = 1; try { console.error('HOOK "' + name + '" threw: ' + (e && e.stack || e)); } catch (x) { /* no console */ } };
  function add(name, fn, order = 0) {
    const l = pts[name] || (pts[name] = []); l.push({ fn, order, n: seq++ }); l.sort((a, b) => a.order - b.order || a.n - b.n);
    return () => remove(name, fn);
  }
  function remove(name, fn) { const l = pts[name]; if (!l) return; const i = l.findIndex(h => h.fn === fn); if (i >= 0) l.splice(i, 1); }
  function run(name, ...args) {
    const l = pts[name]; if (!l || !l.length) return;
    for (const h of l.slice()) { try { h.fn(...args); } catch (e) { bad(name, e); } }
  }
  function filter(name, value, ...args) {
    const l = pts[name]; if (!l || !l.length) return value;
    for (const h of l.slice()) { try { const r = h.fn(value, ...args); if (r !== undefined) value = r; } catch (e) { bad(name, e); } }
    return value;
  }
  function collect(name, ...args) {
    const out = [], l = pts[name]; if (!l || !l.length) return out;
    for (const h of l.slice()) { try { const r = h.fn(...args); if (Array.isArray(r)) out.push(...r); else if (r != null) out.push(r); } catch (e) { bad(name, e); } }
    return out;
  }
  return { add, remove, run, filter, collect, has: name => !!(pts[name] && pts[name].length) };
})();
