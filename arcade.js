// ===== AGENT BRAWL feature file: ARCADE. Loaded after combat.js (see docs/ARCHITECTURE.md). =====
// Owner: the arcade agent. Only that agent edits this file and tools/tests/arcade.mjs.
// Area: the single player ladder. A run of CPU opponents in a set order, a rising difficulty, a between-fights screen, a final result and a share line.
// Plug in with MODES.register({ id: 'arcade', label: 'ARCADE', order: 12, players: 1, onPick, onMatchStart, onRoundEnd, onMatchEnd }) and BUS 'match:end' to advance the ladder.
// Draw extra screens with HOOKS 'drawTop' (and 'update' for their keys) while game.modeId === 'arcade'; never write to localStorage directly, keep progress under a SETTINGS key you define.
'use strict';
(() => {
  window.STUB_ARCADE = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
