// ===== AGENT BRAWL feature file: MUSIC2. Loaded after arenas2.js (see docs/ARCHITECTURE.md). =====
// Owner: the music agent. Only that agent edits this file and tools/tests/music2.mjs.
// Area: more chiptune. New themes and instruments, a finishing-move sting, a low-health variation, per-arena tracks for the stages that arenas2.js adds.
// Add content through the public MUSIC object that music.js exposes: MUSIC.define(name, theme, { trim, arena }), MUSIC.instrument(name, spec), MUSIC.themes().
// Switch the track in play with HOOKS 'musicTheme' (a filter: return the name of any defined theme). Keep every theme between the loudness limits that tools/tests measure.
'use strict';
(() => {
  window.STUB_MUSIC2 = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
