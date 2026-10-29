// ===== AGENT BRAWL extension layer, part 2: SETTINGS. One persisted store for every option. Loaded after bus.js. =====
// Owner: scaffold (core keys); options.js owns the screen that edits them. Stored as JSON under localStorage 'brawl.settings'; storage that is blocked or corrupt just means the defaults.
//   SETTINGS.define(key, spec)  register a key: spec = { def, type?, min?, max?, step?, values?, label?, legacy?, fromLegacy? }
//                               type is inferred: boolean -> 'bool', number -> 'num' (clamped to min..max, rounded to step), values array -> 'enum', anything else -> 'any' (JSON-safe value)
//                               legacy / fromLegacy: an older localStorage key to read once when nothing is stored yet (fromLegacy turns its string into the value)
//   SETTINGS.get(key)           current value (the default when unset or invalid; undefined for an unknown key)
//   SETTINGS.set(key, value)    validate, store, persist, emit BUS 'settings' { key, value, old } when it changed; returns the stored value
//   SETTINGS.toggle(key)        flip a bool key
//   SETTINGS.reset(key)         back to the default (no key: reset all)
//   SETTINGS.all()              { key: value } for every defined key
//   SETTINGS.list()             definitions in registration order, for an options screen
// Feature files add their own keys with SETTINGS.define at load time. Do not read localStorage for options anywhere else.
'use strict';
const SETTINGS = (() => {
  const KEY = 'brawl.settings', defs = Object.create(null);
  let store = {};
  try { const raw = localStorage.getItem(KEY), o = raw && JSON.parse(raw); if (o && typeof o === 'object' && !Array.isArray(o)) store = o; } catch (e) { store = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage blocked: the value lives for this visit only */ } };
  // strict: a value read back from storage must already have the right type; otherwise (set) it is converted when it can be
  function norm(d, v, strict) {
    switch (d.type) {
      case 'bool': return strict ? (typeof v === 'boolean' ? v : d.def) : !!v;
      case 'num': {
        if (!strict) v = Number(v); if (typeof v !== 'number' || !isFinite(v)) return d.def;
        if (d.step) v = Math.round(v / d.step) * d.step;
        return +Math.min(d.max, Math.max(d.min, v)).toFixed(6);
      }
      case 'enum': return d.values.includes(v) ? v : d.def;
      default: return v === undefined ? d.def : v;
    }
  }
  function get(key) { const d = defs[key]; if (!d) return undefined; return key in store ? norm(d, store[key], true) : d.def; }
  function define(key, spec) {
    const def = spec.def, d = Object.assign({ key, label: key.toUpperCase(), min: -Infinity, max: Infinity, type: spec.values ? 'enum' : typeof def === 'boolean' ? 'bool' : typeof def === 'number' ? 'num' : 'any' }, spec);
    defs[key] = d;
    if (!(key in store) && d.legacy) { try { const raw = localStorage.getItem(d.legacy); if (raw !== null) store[key] = d.fromLegacy ? d.fromLegacy(raw) : raw; } catch (e) { /* blocked: default */ } }
    return get(key);
  }
  function set(key, v) {
    const d = defs[key]; if (!d) return undefined;
    const old = get(key); v = norm(d, v, false); store[key] = v; save();
    if (v !== old) BUS.emit('settings', { key, value: v, old });
    return v;
  }
  function reset(key) {
    const keys = key ? [key] : Object.keys(defs);
    for (const k of keys) { if (!(k in defs)) continue; const old = get(k); delete store[k]; if (old !== defs[k].def) BUS.emit('settings', { key: k, value: defs[k].def, old }); }
    save();
  }
  const api = {
    define, get, set, reset, toggle: key => set(key, !get(key)),
    all() { const o = {}; for (const k in defs) o[k] = get(k); return o; },
    list() { return Object.keys(defs).map(k => Object.assign({}, defs[k])); },
  };
  return api;
})();

// ---- core keys (the engine reads these) ----
SETTINGS.define('difficulty', { def: 'normal', values: ['easy', 'normal', 'hard'], label: 'DIFFICULTY' });         // CPU level at the start of a match and how fast it ramps (game.js DIFFICULTY)
SETTINGS.define('rounds', { def: 2, min: 1, max: 4, step: 1, label: 'ROUNDS TO WIN' });                            // rounds a fighter must win; sudden death is round 2 * rounds
SETTINGS.define('time', { def: 99, min: 30, max: 99, step: 1, label: 'ROUND TIME' });                              // seconds per round (sudden death stays 30)
SETTINGS.define('musicVol', { def: 1, min: 0, max: 1, step: 0.05, label: 'MUSIC' });                              // 1 = the mix the tests measure; applied in music.js
SETTINGS.define('sfxVol', { def: 1, min: 0, max: 1, step: 0.05, label: 'EFFECTS' });                              // beep() and thud() in game.js
SETTINGS.define('voiceVol', { def: 1, min: 0, max: 1, step: 0.05, label: 'ANNOUNCER' });                          // speech and stingers in hud.js
SETTINGS.define('gore', { def: true, label: 'BLOOD', legacy: 'brawl.gore', fromLegacy: v => v !== '0' });          // FX.gore (hud.js) mirrors it
SETTINGS.define('muted', { def: false, label: 'MUTE', legacy: 'brawl.muted', fromLegacy: v => v === '1' });        // game.js keeps its top-level `muted` in step
SETTINGS.define('binds', { def: null, label: 'KEY BINDINGS' });                                                    // null = defaults; or { p1?, p2?, alt? }: action letter -> array of KeyboardEvent.code (game.js applyBinds)
