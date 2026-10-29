# AGENT BRAWL: an 8-bit parody fighter

Open `index.html` in any modern browser. It is one self-contained file (about 80 KB): the pixel heads, the sprite generator, the bitmap font and the engine are all inlined, no network requests, no build step needed to play.

Seven fighters, 1 player vs CPU or 2 players on one keyboard, best of 3 rounds, specials and supers, full 8-bit pixel-art sprite sheets generated at load time.

## Roster

| Fighter | Speed | Power | HP | Special | Super |
|---|---|---|---|---|---|
| Tibo (Codex @ OpenAI) | 3.2 | 1.00 | 100 | Codex Bolt | Rate Limit Reset (drops a reset box on the opponent, heals a bit) |
| Poteto | 3.4 | 0.95 | 100 | Sweet Potato (lobbed) | Hundreds of PRs (rain of PRs) |
| Potato | 2.6 | 1.20 | 115 | Fry Toss (3 fries) | Mashed (ground quake, hits grounded foes) |
| News | 3.0 | 1.00 | 100 | Headline (fast paper) | Breaking News (huge banner) |
| Dot | 3.7 | 0.90 | 92 | Puff Ring (grows) | Big Bounce (leap and slam) |
| Alexandr Wang | 3.1 | 1.05 | 100 | Scale Bubble (wobbly) | Superintelligence (giant bubble) |
| Muse (Meta's agent) | 3.3 | 0.95 | 100 | Sentinel (homing drone) | Secure VM (shield + 3 drones, small heal) |

## Controls

- P1: `A`/`D` move, `W` jump, `S` block, `F` punch, `G` kick, `H` special, `R` super (needs a full meter).
- P2: arrows move/jump/block, `K` punch, `L` kick, `J` special, `I` super.
- `P` or `Esc` pauses (`Q` in the pause menu quits to the title). `M` mutes.
- Title: `W`/`S` choose mode, `Enter` start. Select: move with your d-pad, punch confirms, kick un-confirms, `Esc` goes back. In 1P mode you pick your fighter first, then the CPU's.
- End screen: `Enter` back to select, `R` rematch, `Esc` title.
- Touch: the first touch on the canvas shows an on-screen d-pad and buttons (1P only). Tapping anywhere confirms on the title and end screens.

Rules: 99-second rounds, best of 3. A timed-out round goes to whoever has more health left (by percentage). If draws push the match to a fourth round, that round is sudden death: 30 seconds, both at a quarter of their health, and a draw there goes to whoever has more super meter.

## Development

```
node build.mjs                 # inline dev.html + the four scripts into index.html
node tools/headless.mjs --test # headless Chrome smoke test: menus, input, full CPU matches, every special/super, no console errors
node tools/gen-heads.mjs       # regenerate heads.js from the PNGs in assets/
```

Source files (loaded in this order by `dev.html`, which you can open directly while developing):

- `heads.js`: generated pixel maps of the real heads (Tibo, Poteto, Alexandr Wang, Muse badge).
- `pixelfont.js`: 5x7 bitmap font, `ptext()`.
- `sprites.js`: procedural pixel rasterizer and the sprite sheet builder. Every character has 11 animation rows (idle, walk, jump, punch, kick, special, super, block, hit, KO, win) rendered at 48x48 per frame and drawn at 4x with image smoothing off.
- `game.js`: engine (fixed 60 Hz timestep), fighters, CPU AI, projectiles, stages, HUD, menus, touch controls.

Tools in `tools/`:

- `headless.mjs`: tiny DevTools-protocol driver for headless Chrome, no npm dependencies. `node tools/headless.mjs <url> [--shot out.png] [--eval "js"] [--keys "KeyF,KeyG"]`.
- `test-match.mjs`: the automated test run by `--test`.
- `gen-heads.mjs` + `png.mjs`: PNG decode, alpha-weighted downscale, contrast/saturation boost, k-means palette reduction and hand touch-ups that produce `heads.js`.
- `sheet-view.html?id=all&z=3`: view every generated sprite sheet.

Debug URL hashes on the game itself: `#select`, `#demo=i,j[&ff=N][&stop]` (CPU vs CPU, optionally fast-forwarded N ticks or frozen), `#sheet=<id>`. `window.step(n)` advances the simulation by n ticks.

## Art

All sprites are generated programmatically in `sprites.js` from pose rigs and small pixel maps. Nothing is traced from or copied out of any game or pet site.

- Tibo, Poteto and Alexandr Wang: heads are their public X profile pictures downscaled to about 20 pixels and palette-reduced, on original pixel bodies.
- Muse: an original pixel take on Meta's fluffy pale-pink mascot (hooded fur body, cream face, two black eyes, rosy cheeks, stubby arms). The X avatar is only used as a small badge.
- Potato, News and Dot: original pixel characters.

This is an unofficial fan parody. It is not affiliated with or endorsed by OpenAI, Meta, xAI or any of the people depicted. No third-party game trademarks or assets are used.
