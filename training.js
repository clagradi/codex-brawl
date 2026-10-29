// ===== AGENT BRAWL feature file: TRAINING. Loaded after arcade.js (see docs/ARCHITECTURE.md). =====
// Owner: the training agent. Only that agent edits this file and tools/tests/training.mjs.
// Area: the practice room. A dummy that stands, blocks or jumps on request, an input display, damage and combo readouts, a refilling health bar, reset keys.
// Plug in with MODES.register({ id: 'training', label: 'TRAINING', order: 14, players: 1, ... }); drive the dummy through HOOKS 'input' (only while game.modeId === 'training'),
// read results from BUS 'hit' and 'block', show them with HOOKS 'drawHud', and add the pause keys through HOOKS 'pauseItems'.
'use strict';
(() => {
  window.STUB_TRAINING = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
