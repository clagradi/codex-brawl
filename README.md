# AGENT BRAWL: an arcade parody fighter about AI agents

Play it: https://clagradi.github.io/codex-brawl/

Or open `index.html` in any modern browser. It is one self-contained file (under 900 KB): the chibi fighters, the arenas, the HUD, the announcer and the engine are all generated in code and inlined. No network requests, no image or audio files, no build step needed to play. It also works on a phone: the page fits the screen and shows on-screen controls.

Five fighters, 1 player vs CPU or 2 players on one keyboard (or two gamepads), best of 3 rounds, chain combos, throws, sweeps, air attacks, dashes, three specials plus an air special, a super and a finisher each, 21 arenas (pick one or leave it on RANDOM, with a reveal before round 1), each with its own chiptune theme generated in code.

RANKED (`p-ranked.js`) is a title menu entry: a PERFORMANCE REVIEW against the CPU. Every match is rated like Elo, the rating climbs the ranks INTERN, JUNIOR, SENIOR, STAFF, PRINCIPAL and DISTINGUISHED, the end screen shows a rank card with the rating change, and the CPU level follows your rating. The rating and the record are saved in the settings. Details: `docs/features/p-ranked.md`.

SPRINT OF THE DAY (title menu): one challenge per calendar day, the same fighter, opponent, arena, modifier and goal for everyone who plays that date, worked out on your own computer from the date alone. Clear it on consecutive days to build a streak, then share the result card. See `docs/features/p-daily.md`.

Source: https://github.com/clagradi/codex-brawl

## Controls

| | Move / jump / crouch | Punch | Kick | Special | Super |
|---|---|---|---|---|---|
| P1 | `W` `A` `S` `D` | `J` | `K` | `L` | `J`+`K` together (or `I`) |
| P2 | arrows | `Numpad1` (or `,`) | `Numpad2` (or `.`) | `Numpad3` (or `/`) | `Numpad0` (or right `Shift`) |

- Hold back (away from the opponent) to block.
- In 1P mode the arrows + `Z` `X` `C` `V` also drive P1 (the move lists show both keys).

Universal moves (P = punch, K = kick, L = special; P2 uses its own keys the same way):

| Input | Move |
|---|---|
| `P` `P` `P` | chain: two punches then a launcher that pops the opponent up |
| `P` `P` `K` | chain ending in a trip kick (knockdown) |
| down + `P` / down + `K` | low jab / sweep (knockdown; a downed fighter cannot be hit and gets up with brief invulnerability) |
| `P` or `K` in the air | air punch / air kick, landing cancels |
| forward + `P` up close | throw, unblockable; the victim can tech it by pressing punch right away |
| forward, forward / back, back | dash in / backdash (the backdash is briefly invulnerable) |
| `L`, forward + `L`, down + `L` | the three specials |
| up + `L` (or `L` in the air) | air special: special 1 fired downwards from a jump |
| `P`+`K` together (or `I`) | super, needs a full meter |

- Presses are buffered, so mashing punch three times performs the full chain, and a special pressed during a hit comes out as a cancel when that hit lands. Attacks that connect can cancel into the next chain hit, a special or the super. Long combos scale damage down a little.
- Combo strings: every fighter has four named strings, listed on the STRINGS page of the move lists (`N` on the select screen or the pause screen) and announced on screen when they land. Hold up while a launcher lands to chase the opponent into the air, then chain `P`, `K` and `L` in the air. A juggle allows four hits, each scaled down, and the whole combo stops at 35% of a life bar. Options: `strings.on` and `strings.callouts` in `p-strings.js`.
- Super: needs a full meter. Finisher: when a fighter wins the second round, the loser is stunned and the screen shows FINISH IT! for 5 seconds. Press super (no meter needed) to perform your finisher. Any hit on the stunned fighter, or the time running out, just ends the match with a normal K.O. The CPU usually goes for its finisher.
- Gamepads: pad 1 is P1, pad 2 is P2 (d-pad or left stick; A punch, B kick, X special, Y or RB super). Start pauses and resumes, and is `Enter` on the menus; Back is `Esc`.
- Touch: on a phone or tablet the page fits the screen (no scrolling or zooming) and shows an 8-way d-pad plus `P`, `K`, `SP` (special) and `SU` (super) buttons, so every move above works: a diagonal jumps forward or back, tapping a direction twice dashes, down + `K` sweeps, forward + `P` throws. In portrait the game sits on top with the menu buttons under it and the controls at the bottom; in landscape the controls float over the playfield and the menu buttons run down the right edge. On the menus you can also tap a title row, a fighter (tap the highlighted one again to confirm) or the arena box (next arena). The first tap starts the audio. Touch plays P1 only: 2 PLAYERS needs a keyboard or two gamepads. A laptop with a touch screen shows the on-screen controls from the first touch, and pressing a key hides them again.
- Title: `W`/`S` (or up/down) choose the mode, `Enter`, `Space` or punch starts.
- TUTORIAL (on the title menu): ten short lessons against a practice dummy (move, attack, block, chain, throw, special, super, dash, air, get up). `W`/`S` pick a lesson, `A`/`D` the fighter, punch or `Enter` starts, kick or `Esc` goes back; cleared lessons are remembered, and the pause screen adds `R` (restart the lesson) and `N` (next lesson).
- Attract demo and WATCH: leave the title alone for 20 seconds (change it with the `watch.idle` setting, turn it off with `watch.attract`) and a CPU against CPU round plays with live commentary captions and a blinking PRESS START banner; any key, tap or click brings the title back. The WATCH entry on the title lets you pick two CPU fighters, an arena and a CPU level and just watch a whole match; on its end screen `Enter` or `R` watches again and `Esc` goes back to the picker. Notes in `docs/features/p-watch.md`.
- Select: move with your d-pad, punch confirms (`Enter` too), kick un-confirms (`Esc` goes back), `Q`/`E` (or the super key) pick an arena or leave it on RANDOM. In 1P mode you pick your fighter first, then the CPU's; in 2P both players pick at the same time and `Esc` goes back to the title. Each player's panel shows the move list of the highlighted fighter, and 2P also shows the P2 keys.
- `P` or `Esc` pauses; the pause screen shows both move lists, the controls and the sudden-death rule. `P`, `Esc` or `Enter` resumes, `Q` quits to the title.
- Photo mode: `C` on the pause screen (or its PHOTO MODE button) keeps the match frozen behind a free camera. Drag or the arrow keys pan, the wheel, a pinch or `Q`/`E` zoom, `H` hides the HUD, `G` or `1` to `6` pick a filter (CRT, SEPIA, NOIR, VAPORWAVE, PIXEL BIG, NONE), `B` picks a frame, and `Enter` (or the SAVE PNG button) saves a PNG. Nothing is saved until you ask; `Esc` goes back to the pause screen.
- End screen: `Enter`, `Space` or punch goes back to select, `R` (or P1's super key) is a rematch with the same fighters and the same arena (an arena left on RANDOM is rolled again), `Esc` goes to the title, `T` or the SHARE ON X button opens a post on X with the result.
- OBSERVABILITY: on the end screen `O` (or a tap on the OBSERVABILITY button) opens the match report, a parody monitoring dashboard drawn from what happened in the fight: a damage-over-time line chart on the canvas, hit accuracy, blocks, specials used, max combo, uptime %, and a short incident log. Left and right (or a tap on the chart) switch the chart view; `O`, `Esc` or the BACK button closes it. Nothing leaves the page. Details in `docs/features/p-observability.md`.
- KO clips: during a match the browser keeps the last few seconds of the canvas, and the end screen shows a KO CLIP panel with a looping preview of the deciding blow. `C` (or a tap on the panel) saves it as a `.webm` video file. It is never saved on its own and never uploaded. Browsers that cannot record a canvas simply show no panel, and the KO CLIPS setting (`clips.on`) turns it off.
- `M` mutes (music and effects), `B` turns the stylised blood on or off. Both are remembered between visits.
- Voice lines: the fighters trade banter on the VS screen, the announcer calls FIRST HIT, COUNTER, COMEBACK and LAST SECOND, and the winner gets a quote. Every line is captioned on screen; `N` in the pause menu turns the spoken voice lines off or on (the captions stay).
- TRAINING (title menu): an endless round against a dummy, no K.O. and no clock. `1` cycles the dummy (STAND, CROUCH, JUMP, BLOCK ALL, BLOCK AFTER HIT), `2` records 5 seconds of your inputs driving the dummy, `3` plays them back in a loop, `4` shows the hitboxes, `5` hides the input display, `R` resets positions (`R` with left or right held puts the dummy in that corner). The HUD shows your last 12 inputs and the frame advantage after every hit or block. Keyboard only.
- Replays: the last five 1 PLAYER and 2 PLAYERS matches are kept, and REPLAYS on the title lists them (`W`/`S` choose, `Enter` watches, `Delete` twice erases, `Esc` goes back). While one plays, `Space` pauses, `K` toggles 2X speed, `.` (or right) steps one frame while paused, `R` restarts and `Esc` returns to the list. A replay ends with the recorded winner and health, and the end panel says REPLAY VERIFIED.
- Mutators: on the select screen of the 1P and 2P versus modes, `G` opens the MUTATORS panel with six match modifiers (BIG HEADS, LOW GRAVITY, TURBO 1.5X, RATE LIMITED, LEGACY MODE, GLASS CANNON). `W`/`S` move, `Enter` toggles, `1` to `6` toggle directly, `X` clears, `G` or `Esc` closes. All are off by default, the ones that are on show as tags on the VS screen and under the round timer, and the choice is remembered. Keyboard only.
- `Y` on the title or the pause screen (or the ACCESSIBILITY title entry) opens the accessibility options: colour filters for red-, green- or blue-weak vision, a high contrast HUD, larger text, reduced motion (no shake, flashes or slow motion), screen reader announcements and simple specials (`L`, `L` + left or right, `L` + down). See `docs/features/p-a11y.md`.
- `F3` shows the frame-time overlay (what each frame costs against a 12 ms budget). `Shift`+`F3` cycles the quality: AUTO, HIGH, LOW. AUTO switches to fewer particles and lighter post-processing when the average frame takes over 12 ms (see [docs/features/p-perf.md](docs/features/p-perf.md)).

Rules: 99-second rounds, best of 3. A timed-out round goes to whoever has more health left (by percentage), and an exact tie in rounds 1 to 3 is a draw that nobody wins. If nobody has two wins after round 3, round 4 and any later round is sudden death: 30 seconds, both fighters start at a quarter of their health, and a time-out tie goes to whoever has more super meter. The sudden-death round spells the rule out at the start, and the pause screen repeats it.

## Roster and moves

| Fighter | `L` | forward + `L` | down + `L` | up + `L` (air) | Super | Finisher |
|---|---|---|---|---|---|---|
| Tibo (Codex at OpenAI) | Commit Bolt | Hotfix Rush | Revert | Drop Table | Push to Prod | Outage |
| Poteto (Grok bot) | Hot Potato | Hot Take | Tater Drop | Air Fry | Sweet Potato Storm | Mashed Up |
| Dot (OpenAI's dots) | Dot Dot Dot | Pop In | Seen | Dot Rain | Big Dot Energy | Full Stop |
| Alexandr Wang (Meta) | Bubble Sort | Lab Drones | Singularity | Deep Dive | Superintelligence | Acqui-hire |
| Muse (Meta's agent) | Ping | Secure VM | Undo | Packet Drop | Agent Swarm | Uninstall |

Finishers are cartoon gags, nothing gory. The fighters are parody caricatures drawn from scratch, and the only real-world affiliations named are the ones in the table. Tibo has a swept fringe and a hoodie, Poteto long hair, round glasses and happy closed eyes, Dot is a fuzzy yellow ball in round glasses and a bow tie, Wang has neat black hair and a calm stare, and Muse is a cream-pink hooded plush with bead eyes.

## Arenas

GPU Pit, Datacenter Cathedral, Rate-Limit Bridge, Token Furnace, Deprecated Forest, Merge-Conflict Temple, Server Graveyard, Launch-Night Rooftop, Potato Wasteland, Context Window Cliff, Hallucination Hall, Benchmark Stadium, Prompt Injection Sewer, Latency Lagoon, Alignment Dojo, Tech-Debt Swamp, Cache Miss Canyon, Open-Plan Office, Cloud Billing Volcano, Nightly Build Express, Keynote Stage. Each has parallax layers, lighting and a foreground layer. Pick one on the select screen or leave it on RANDOM: the versus screen reveals the arena with a short roulette.

## Music

Every arena has its own chiptune theme, synthesised live with WebAudio (oscillators, a shared noise buffer for drums, a compressor and an output limiter, no audio files): electro arpeggios in the GPU Pit, a dark organ in the Cathedral, a chromatic riff on the Bridge, a sawtooth gallop in the Furnace, a mellow pentatonic tune in the Forest, an eastern-flavoured beat in the Temple, eerie long notes in the Graveyard, synthwave on the Rooftop and a shuffling western twang in the Wasteland, plus a title fanfare, a versus riff and a victory jingle. The music ducks while paused, stops when muted (`M`) and never plays before the first key press or tap, as browsers require.

## Extras

EXTRAS on the title menu (or `V` on the title) opens the vault: a fighter gallery with a big sprite viewer and a picker for every animation, an arena gallery, the colourways you have unlocked, and your lifetime stats (matches, wins per fighter, longest combo, most played arenas). `Q`/`E` or `1` to `4` switch tabs, the arrows pick, `Esc` goes back, and the mouse or touch works too. The counters are saved in this browser only.

SOUND TEST (in the title menu) lists every track by name and plays it while 24 bars dance to the music clock: the menu tracks, one per arena, and five fighter themes (Tibo SHIP IT, Poteto SWEET HEAT, Dot ROUND TRIP, Wang IRIDESCENT, Muse UNDO SWARM) that are generated in code. `W`/`S` choose, `Enter` plays, `Backspace` stops, `V` lets the versus screen play the first fighter's own theme (off by default), `Esc` leaves; the mouse and touch work too.

## OKRS

Thirty parody objectives (SHIP IT, ZERO DOWNTIME, ROLLBACK KING and 27 more) unlock as you play: a toast drops in when one is reached, and the OKRS button in the top left corner of the title screen (or `G` on the title or pause screen) opens the progress bars. Progress is saved in this browser only; training mode does not count.

## Codex desktop pets

`pets/<id>/` holds each fighter as a Codex desktop pet (v2 atlas: 8 x 11 cells of 192x208, `pet.json` + `spritesheet.png`), rendered from the same sprites as the game and checked with the `hatch-pet` atlas validator. To use them, copy a folder to `~/.codex/pets/brawl-<id>/`, or run `node tools/export-pets.mjs --install`, which regenerates and installs all five. The `description` in each `pet.json` comes from the `INFO` table at the top of `tools/export-pets.mjs`, so edit it there (and keep it in step with the roster in `game.js`).

## Development

```
node build.mjs                    # inline dev.html + the scripts into index.html
node tools/headless.mjs --test    # headless Chrome test: menus, input, full CPU matches, every move and finisher, no console errors
node tools/make-og.mjs            # render og.png, the 1200x630 share card (after build)
node tools/export-pets.mjs        # render the Codex pets into pets/ (--install also copies them to ~/.codex/pets)
```

Source files (loaded in this order by `dev.html`, which you can open directly while developing):

- `pixelfont.js`: 5x7 bitmap font, `ptext()`.
- `sprites.js`: the chibi fighters. Procedural pose rigs rasterised into sprite sheets at load time (11 animation rows: idle, walk, jump, punch, kick, special, super, block, hit, KO, win), plus a few extra pose strips for the throw, the low jab and the sweep (used in the game only, not in the pet atlas), portraits, head icons and effect sprites.
- `arenas.js`: the original arenas, their thumbnails and foreground layers. `arenas2.js` and `arenas3.js` add six more each.
- `hud.js`: health bars, timer, meters, banners, versus screen, logo, move list panel, post-processing, announcer (speech synthesis plus WebAudio stingers) and the particle system (sparks, dust, blood).
- `music.js`: the procedural chiptune player, one theme per arena plus the menu themes. It polls the game state, so it needs no hooks in the engine.
- `moves.js`: every special, air special, super and finisher.
- `game.js`: engine (fixed 60 Hz timestep), fighters, chains, throws, knockdowns, dashes, CPU AI, input (keyboard, gamepad, touch), menus, camera, share button.

Tools in `tools/`:

- `headless.mjs`: tiny DevTools-protocol driver for headless Chrome, no npm dependencies. `node tools/headless.mjs <url> [--shot out.png] [--eval "js"] [--keys "KeyJ,KeyK"] [--wait ms] [--device phone|phone-landscape|tablet]`. `--device` emulates a touch phone or tablet (viewport, device pixel ratio, touch events), and its page object can send multi-touch (`touch`, `tapAt`) to tests.
- `test-match.mjs`: the automated tests run by `--test`: the desktop run, then a phone run on the emulated touch device (layout, d-pad, buttons, menus).
- `sheet-view.html`, `portrait-view.html`, `arena-view.html`, `hud-view.html`, `moves-view.html`: viewers for each part on its own.
- `pet-export.html` + `export-pets.mjs`: Codex pet export. `make-og.mjs`: share card.

Debug URL hashes on the game itself: `#select`, `#demo=i,j[&ff=N][&stop]` (CPU vs CPU, optionally fast-forwarded N ticks or frozen), `#sheet=<id>`, `&arena=K` on a demo (force arena K). `window.step(n)` advances the simulation by n ticks, `window.hold(true)` freezes the real-time loop.

## Deploy

GitHub Pages serves the repository root of `main`: push a new `index.html` (and `og.png`) and the site updates. The Open Graph and X card meta point to `https://clagradi.github.io/codex-brawl/og.png`.

## Art and disclaimer

All art is generated programmatically from original pose rigs and small pixel maps. Nothing is traced from or copied out of any game or pet site, and no third-party sprites, fonts or sounds are used. The look is inspired by chibi desktop pets and dark arcade fighters, recreated from scratch.

This is an unofficial fan parody. It is not affiliated with or endorsed by OpenAI, Meta, xAI or any of the people depicted, and it uses no third-party game trademarks, characters or catchphrases.
