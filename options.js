// ===== AGENT BRAWL feature file: OPTIONS. Loaded after music2.js (see docs/ARCHITECTURE.md). =====
// Owner: the options agent. Only that agent edits this file and tools/tests/options.mjs.
// Area: the settings screen. Difficulty, rounds, round time, the three volumes, gore, mute, key rebinding, a reset button, a controls page.
// Plug in with HOOKS 'titleItems' (return [{ id: 'options', label: 'OPTIONS', order: 50, run(game) { ... } }]) and draw the screen from HOOKS 'drawTop' while it is open.
// Read and write every value through SETTINGS (SETTINGS.list() describes each key: type, range, label); key binds are the 'binds' key, applied by game.js applyBinds().
// A new setting that another feature needs is defined here or in that feature with SETTINGS.define; the engine keys are listed in docs/ARCHITECTURE.md.
'use strict';
(() => {
  window.STUB_OPTIONS = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
