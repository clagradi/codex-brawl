// ===== AGENT BRAWL feature file: COMBAT. Loaded after game.js (see docs/ARCHITECTURE.md). =====
// Owner: the combat agent. Only that agent edits this file and tools/tests/combat.mjs.
// Area: fighting depth. New moves and properties for the roster, combo and cancel rules, the super meter, chip damage, throws and guard rules.
// Reach the engine through the extension points, not by editing game.js:
//   HOOKS 'damage' (change dmg/kb/stun before a hit lands), 'input' (rewrite what a fighter presses), 'fighterUpdate' (run once per tick for the pair),
//   'drawFighter' (extra art per fighter), BUS 'hit' 'block' 'knockdown' 'throw' 'special' 'super' (react to what happened), SETTINGS (read, or define a new key).
// New move data belongs in this file (add to MOVES[id] at load) when the moves.js tables stay untouched; anything the other five agents also need goes through a hook.
'use strict';
(() => {
  window.STUB_COMBAT = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
