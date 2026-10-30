# Performance pack: frame budget, adaptive quality, arena cache

`p-perf.js` (premium feature, perf agent, branch `feat/p-perf`) adds three things to the game:

- a frame-time overlay on `F3`;
- adaptive quality, so a slow device drops particles and post-processing when the average frame costs more than 12 ms;
- an offscreen snapshot cache for the arena, used only below HIGH.

The file is a classic script that loads last in `dev.html`, after every other feature file, so it wraps what they may already have wrapped. Nothing in `game.js` is edited. At HIGH every wrapper passes straight through, with the same arguments, the same draw calls and no cache. The pixels and the gameplay at HIGH are those of the game without this file, and the tests check that (see "Tests" below).

## What the player gets

| Key | Effect |
|---|---|
| `F3` | Shows or hides the frame-time overlay in the top-left corner. |
| `Shift`+`F3` | Cycles the quality setting: AUTO, HIGH, LOW. The choice is saved with the other settings. |

The overlay draws a graph of the last 120 frames, with a red line at the 12 ms budget, and these lines in the pixel font:

| Line | Meaning |
|---|---|
| `FRAME BUDGET 12 MS` | The budget the controller works against. |
| `AVG x WORST y` | The average and the worst main-thread cost of a frame over the graph, in ms. |
| `UPD x DRAW y` | The last frame's split: simulation ticks (`update`) and drawing (`render`), in ms. |
| `FPS n OVER n%` | The display rate measured from the frame timestamps, and the share of frames over budget. |
| `QUALITY [AUTO ]HIGH` / `MEDIUM` / `LOW` | The level in use. `AUTO` is shown when the controller picks it. |
| `CACHE n% HIT` / `CACHE IDLE` | The share of arena draws served from the snapshot, or `IDLE` when the cache is not in use. |

The setting is `perf.quality` in `SETTINGS` (`'auto'`, the default, `'high'` or `'low'`). It is not a row on the OPTIONS screen, because `options.js` has a fixed list of rows and no extension point. `Shift`+`F3` is the way to change it in the game.

## Quality levels

| Level | Colour grade | Vignette | Live particles before a new burst is skipped | Sparks per burst | Blood burst power | Arena cache |
|---|---|---|---|---|---|---|
| HIGH | on | on | no limit | no limit | no limit | off |
| MEDIUM | off | on | 300 | 12 | 2.2 | when the display repeats ticks |
| LOW | off | off | 140 | 6 | 1.4 | when the display repeats ticks |

The colour grade and the vignette are switched off by handing `drawPost` (from `hud.js`) a copy of its options with `grade: 0`, and at LOW `vignette: 0` as well. At HIGH, `drawPost` receives the very same options object. The particle caps wrap `FX.blood`, `FX.sparks`, `FX.dust` and `FX.ring`. Particles that are already alive are never removed; a new burst is only skipped or made smaller. Particles are cosmetic and do not feed back into the simulation, so the lower levels do not change gameplay (the gameplay test below checks this).

## The adaptive controller

`window.frame` is wrapped to time each frame's main-thread work (the ticks it runs plus the draw). The controller works on these numbers:

| Rule | Value |
|---|---|
| Budget | 12 ms of work per frame. |
| Window | 180 frames (3 s at 60 Hz). The average of a full window decides. |
| Clamp | One slow frame (a tab switch, a garbage collection) counts as 33 ms at most. |
| Warm-up | 45 frames are ignored after a match or round starts and after `perf.quality` changes. |
| Step down | A window that averages over 12 ms moves AUTO one level down (HIGH to MEDIUM, MEDIUM to LOW). |
| Step up | A level below HIGH moves one level up after three windows in a row under 6 ms. |
| No see-saw | After three step-downs the level no longer steps up, so a device on the edge of the budget settles. |

Frames that run no simulation tick (a 120 Hz display draws each 60 Hz tick twice) are not sampled, and the window starts again when the loop was away (a gap of over 100 ms between frames) or the tab is hidden. A change of level emits `perf:level` on `BUS` with `{ level, name }`.

Under automation (`navigator.webdriver`, or a `HeadlessChrome` user agent) AUTO never adapts by itself, so headless tests and screenshots always run at HIGH. Tests drive the controller with `PERF.feed(ms, n)` instead.

## The arena snapshot cache

The arena is the largest static layer. A display that refreshes faster than the 60 Hz simulation draws the same tick two or more times, and on those frames the arena is identical. The cache paints the arena once into an offscreen canvas and copies it to the screen on the repeats.

The cache is used only when all of these hold:

- the quality is below HIGH, or `PERF.cache` is `'on'`;
- the loop is live, and over 20% of the last 120 frames ran no tick (otherwise there is nothing to repeat);
- the call comes from the match `render()`, not a menu backdrop: the context is the main canvas and the camera is `game.cam`;
- the canvas state is plain (no filter, full alpha, `source-over` compositing) and the view is inside the stage;
- the arena passed the probe.

The probe checks that an arena paints every pixel of the views the game uses: zoom 1 centred, zoom 1.1 at ±40 and the zoom 1.2 knockout camera at ±80. It draws each view over black and over white, and an arena is cached only when every pixel matches. All 21 arenas pass.

The cache key is made of the arena, the arena clock, the game phase, the camera, the canvas transform and size, and a generation counter. The counter moves on every simulation tick, every input event (keys, pointer, touch, wheel, resize, focus), every settings change and every `ARENAS2.react` call. A screen shake moves the transform by a random offset, so a shaking frame either repaints the snapshot or, when the shake shows the stage edge, draws the arena normally.

### Why the cache is not used at HIGH

The task asks that HIGH changes no pixels. In headless Chrome, a cached arena is not bit-identical to the same arena drawn straight onto the main canvas.

- Painting into a second canvas and copying it back shifts 5 to 15 anti-aliased edge pixels out of 518 400.
- Reading the main canvas back in the middle of a frame (the other way to take a snapshot) forces a flush, which shifts 1 to 17 pixels in what is drawn after it.

The differences cannot be seen, but they are not zero, so AUTO turns the cache on only below HIGH, where the colour grade already changes the image. `PERF.cache = 'on'` forces it at any level for tests and the bench.

## Wrapped globals

| Global | Why |
|---|---|
| `window.frame` | Times the whole frame and feeds the controller. |
| `window.update` | Times the ticks and counts them (a frame with no tick is a repeat). |
| `window.render` | Times the draw and marks the match render, so the cache never touches a menu backdrop. |
| `window.drawArena` | The snapshot cache. |
| `window.drawPost` | Drops the colour grade at MEDIUM, and the vignette too at LOW. |
| `FX.blood`, `FX.sparks`, `FX.dust`, `FX.ring` | Particle caps at MEDIUM and LOW. |
| `ARENAS2.react` (when present) | Invalidates the cache when an arena reacts to a hit. |

The overlay is drawn on the `drawTop` hook at order 1000, over everything else.

## Measured before and after

All numbers were measured in headless Chrome with a software canvas on the development Mac (960 x 540 canvas). A GPU-backed browser is faster in absolute terms; the ratios are what matter.

### Before and after this file

`tools/shots/beforeafter.mjs` (git-ignored) runs the same seeded CPU match on three pages: `dev.html` without the `p-perf.js` line, `dev.html` at HIGH, and `dev.html` at LOW. It uses arena 0 (GPU Pit), Tibo against Poteto, 300 ticks into the fight, with `Math.random` and `FX` seeded. The `render()` cost is the mean of 120 draws, with a canvas flush after each one.

| Page | `render()` run 1 | `render()` run 2 | Frame hash | Health after 300 ticks |
|---|---|---|---|---|
| before (no `p-perf.js`) | 6.86 ms | 6.87 ms | 1812823853 | 100 / 84.98 |
| after, HIGH | 6.72 ms | 6.76 ms | 1812823853 | 100 / 84.98 |
| after, LOW | 2.95 ms | 2.97 ms | differs (no grade, no vignette) | 100 / 84.98 |

The before page and HIGH give the same frame hash and the same health. They also give the same hash again after 120 more ticks (3096809231). HIGH costs the same as no file: the difference is within run-to-run noise, and earlier runs gave 7.03 / 6.75 ms before and 7.83 / 6.85 ms at HIGH. One simulation tick (`update`) costs 0.02 ms on every page, so the frame cost is almost all drawing. LOW cuts it by about 57%.

### PERF.bench

`PERF.bench(n)` times `n` draws of the current frame at each level, with a flush after each draw. It forces each level directly, without touching the saved setting, and restores the previous state afterwards. To reproduce, run `node build.mjs`, then:

```
node tools/headless.mjs "index.html#demo=0,1&stop" --wait 800 --eval "(() => { hold(true); while (game.phase !== 'fight') step(1); step(200); game.arena = 0; return PERF.bench(30); })()"
```

| Measure | One run | Range over runs |
|---|---|---|
| `render()` at HIGH | 7.75 ms | 7.22 to 8.14 ms |
| of which `drawPost` at HIGH | 3.91 ms | |
| of which the arena | 1.70 ms | 1.56 to 2.12 ms |
| `render()` at HIGH with the cache forced on | 6.21 ms | 5.41 to 6.21 ms |
| `render()` at MEDIUM | 4.44 ms | 3.63 to 4.44 ms |
| `drawPost` at MEDIUM | 0.68 ms | |
| `render()` at LOW | 3.90 ms | 3.04 to 3.90 ms |
| `drawPost` at LOW | 0 ms | |

The post-processing pass is the largest single cost, which is why MEDIUM drops the colour grade first. The cache saves most of the arena's cost on repeated ticks.

The bench also fires a test burst: 24 blood bursts at power 3, 24 bursts of 20 sparks and 24 dust puffs. After it, HIGH holds 520 live particles and LOW 141. Drawing them costs 0.34 ms at HIGH and 0.08 ms at LOW.

## Tests

`tools/tests/x-p-perf.mjs` runs inside `node tools/headless.mjs --test`. It checks the following:

- **API and defaults.** `PERF` exists, the setting defaults to `'auto'`, the level is HIGH, the overlay is off, and the page reports it runs under automation.
- **Cache correctness.** The cache is forced on for six arenas and three cameras each. Every probe passes, the first draw misses, the next two hit and repeat each other exactly, and the result is within 100 pixels of an uncached draw.
- **Cache invalidation.** A spy on the arena's draw function checks the following. Held renders reuse the snapshot. A new tick, a key event and a settings change each repaint. Cache `'off'` always paints. A screen shake bypasses the cache. AUTO at HIGH never caches.
- **Keys.** `F3` toggles the overlay and changes pixels. `Shift`+`F3` cycles AUTO, HIGH, LOW.
- **Controller.** `PERF.feed` checks stepping down under 15 ms frames, holding at 9 ms, recovering under 3 ms, and the three-step-down limit. Forced HIGH and LOW are checked too, along with the `perf:level` events.
- **Levels.** HIGH, MEDIUM and LOW give different frames. `PERF.postOpts` drops the grade and the vignette at LOW, and hands HIGH the very same object. A large burst stays under the LOW particle cap.
- **Gameplay unchanged.** A seeded CPU match of 1500 ticks, drawn every tick, ends in the same state at HIGH, at HIGH with the cache forced on, and at LOW.

## Public API (`window.PERF`)

| Member | Use |
|---|---|
| `BUDGET`, `WINDOW`, `NAMES` | The constants above. |
| `overlay` | Get or set the overlay (same as `F3`). |
| `cache` | `'auto'` (default), `'on'` or `'off'`. |
| `level()`, `quality()` | The level in use (0 HIGH, 1 MEDIUM, 2 LOW) and the setting. |
| `cycleQuality()` | Same as `Shift`+`F3`. |
| `stats()` | The overlay numbers plus the cache hits, misses and bypasses. |
| `bench(n)` | The bench above. |
| `feed(ms, n)` | Feeds `n` frames of `ms` into the controller (tests); returns the AUTO level. |
| `reset()` | Clears the controller state. |
| `postOpts(opts)` | The options `drawPost` receives at the current level. |
| `probe(i, t)` | Whether arena `i` passes the cache probe. |
