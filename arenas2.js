// ===== AGENT BRAWL feature file: ARENAS2. Loaded after training.js (see docs/ARCHITECTURE.md). =====
// Owner: the arenas agent. Only that agent edits this file and tools/tests/arenas2.mjs.
// Area: more stages. New backdrops drawn in code (no image files), animated layers, per-stage hazards or colour grading, a stage pick on the select screen.
// Add a stage by pushing onto the shared list at load: ARENAS.push(ARENAS.make({ id, name, tagline, accent, build(A) { ... }, paint(g, t, cam, A) { ... }, front(g, t, cam, A) { ... } })).
// ARENAS.make is the builder behind the nine stages in arenas.js (half-resolution 480x270 canvas, built once on first use) and ARENAS.kit holds the painter's kit those stages share (R, grad, disc, fogDraw, motes ...).
// Give the stage a theme in music2.js (MUSIC.define(name, theme, { arena: true }) when the id is the theme name). Extra scenery over the fighters goes through HOOKS 'drawWorld'.
'use strict';
(() => {
  window.STUB_ARENAS2 = 1;   // marker: tools/tests/core.mjs checks that this file loaded. Keep the line when the real feature replaces this stub.
})();
