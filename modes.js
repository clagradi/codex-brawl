// ===== AGENT BRAWL extension layer, part 3: MODES. The registry behind the title menu. Loaded after settings.js. =====
// Owner: scaffold (registry and the two built-in modes); arcade.js and training.js register more.
//   MODES.register(def)   add (or replace, same id) a mode. def: { id, label, order?, players?, onPick?, onMatchStart?, onRoundStart?, onRoundEnd?, onMatchEnd? }
//       id       unique string, also stored in game.modeId while the mode is played
//       label    the title menu text (capitals)
//       order    menu position, lower first (built-ins: versus 10, versus2 20; default 100)
//       players  1 = P1 against the CPU, 2 = two humans; becomes game.mode (the engine and the tests still read game.mode)
//       onPick(game)             the title entry was chosen, before the select screen; return false to skip the select screen (the mode took over)
//       onMatchStart(info)       the callbacks below run for the current mode only (game.modeId), from the BUS events of the same names
//       onRoundStart(info) onRoundEnd(info) onMatchEnd(info)   info is the BUS payload (docs/ARCHITECTURE.md)
//   MODES.get(id), MODES.list() (sorted by order), MODES.current() (the mode of game.modeId), MODES.pick(id) (set game.modeId and game.mode, returns the mode)
// The title menu is MODES.list() plus whatever HOOKS 'titleItems' collects, so a feature that is a place to go (options) is an item and one that is a way to fight is a mode.
'use strict';
const MODES = (() => {
  const reg = []; let seq = 0;
  function register(def) {
    if (!def || typeof def.id !== 'string') throw new Error('MODES.register needs an id');
    const m = Object.assign({ label: def.id.toUpperCase(), order: 100, players: 1 }, def, { seq: seq++ });
    const i = reg.findIndex(x => x.id === m.id); if (i >= 0) reg.splice(i, 1);
    reg.push(m); reg.sort((a, b) => a.order - b.order || a.seq - b.seq);
    return m;
  }
  const get = id => reg.find(m => m.id === id) || null;
  const current = () => get(typeof game !== 'undefined' ? game.modeId : 'versus');
  function pick(id) {
    const m = get(id); if (!m) return null;
    game.modeId = m.id; game.mode = m.players === 2 ? 2 : 1;
    return m;
  }
  for (const [ev, cb] of [['match:start', 'onMatchStart'], ['round:start', 'onRoundStart'], ['round:end', 'onRoundEnd'], ['match:end', 'onMatchEnd']])
    BUS.on(ev, info => { const m = current(); if (m && typeof m[cb] === 'function') m[cb](info); });
  return { register, get, list: () => reg.slice(), current, pick };
})();

MODES.register({ id: 'versus', label: '1 PLAYER VS CPU', order: 10, players: 1 });
MODES.register({ id: 'versus2', label: '2 PLAYERS', order: 20, players: 2 });
