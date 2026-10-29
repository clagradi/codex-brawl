// ===== AGENT BRAWL feature file: TOUCH. Loaded last (see docs/ARCHITECTURE.md). =====
// Owner: the touch agent. Only that agent edits this file and tools/tests/touch.mjs.
// Area: phones and tablets. A better on-screen pad (TBTN and drawTouch live in game.js today), multi-touch handling, layout for small screens, menu taps, pause by touch.
// Plug in with HOOKS 'drawTop' for drawing above the canvas content, HOOKS 'input' to merge touch presses into a fighter's input, and HOOKS 'update' to poll touches once per tick.
// Keep the canvas at 960x540; scale with CSS in the page, not in the game logic.
'use strict';
(() => {
  window.STUB_TOUCH = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
