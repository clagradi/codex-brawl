# Options, controls, pause menu, fullscreen, install

Owner file: `options.js`. Tests: `tools/tests/options.mjs`. PWA files: `manifest.webmanifest`, `icons/`, `tools/make-icons.mjs`, the head tags in `dev.html`.

Everything goes through the extension layer (`docs/ARCHITECTURE.md`): the title entry is a `titleItems` hook, the pause menu rows and the O key are a `pauseItems` hook, the input runs in an `update` hook (order -5, before the engine's own phase code), the screens are drawn by wrapping `drawTitle` and `drawFight`, and every value is stored with `SETTINGS` (`brawl.settings` in localStorage). `game.js` is not edited.

## What the player gets

### OPTIONS screen

Opens from the title (third entry, OPTIONS) and from the pause menu (OPTIONS row or the O key).

| Row | Values | Setting |
| --- | --- | --- |
| MUSIC, EFFECTS, VOICE | 0 to 10 steps, a short beep previews the level | `musicVol`, `sfxVol`, `voiceVol` |
| ROUNDS | best of 1, 3, 5 (rounds to win 1, 2, 3) | `rounds` |
| ROUND TIME | 30, 60, 99 seconds or INFINITE | `time`, `infTime` |
| DIFFICULTY | easy, normal, hard, nightmare | `difficulty` (nightmare is added by `options.js`: `DIFFICULTY.nightmare = [0.9, 0.3]`) |
| SCREEN SHAKE | off, low, full | `shake` |
| REDUCE FLASH | on, off (caps the white screen flashes) | `reduceFlash` |
| CRT FILTER | on, off (stronger scanlines) | `crt` |
| ANNOUNCER | on, off (the announcer lines) | `announcer` |
| TRACK TOAST | on, off (the music title pop-up) | `trackToast` |
| BLOOD | on, off (the B key keeps working) | `gore` |
| FULLSCREEN | on, off (only where the browser supports it) | none |
| CONTROLS | opens the key screen | none |
| RESET TO DEFAULTS | press twice; restores the rows above, not the key bindings, not mute | the keys listed above |
| BACK | leaves | none |

Keys: W/S or up/down move, A/D or left/right change a value, Enter, Space or the punch key also change it (or run a button row), Esc goes back. Gamepad: D-pad or stick, A to change, B or Back to go back. Touch and mouse: tap a row to select it, tap `<` and `>` or the bar to change a value.

### CONTROLS screen

A table of every action (LEFT, RIGHT, UP, DOWN, PUNCH, KICK, SPECIAL, SUPER) in three columns: P1, P2, and 1P ALT (the second set of keys that player 1 has in the one-player mode).

1. Move to a cell and press Enter (or tap it). The cell waits: PRESS A KEY.
2. Press the new key. It is stored in `binds` and takes effect at once (`MAP`, `LABEL`, `ALTL` and the touch buttons follow; the move lists and hints show the new labels).
3. A key that another action of the same player (or an alternate set sharing the player) already uses is refused with a red warning that names the action. Keys the engine owns (Esc, Enter, Space, Tab, Backspace, P, Q, M, B, T, E, R, F, O, the Meta keys, F1 to F12) are refused as well. The cell keeps waiting.
4. Esc cancels the wait. R puts the selected cell back to its default. RESET ALL KEYS clears every binding.

The gamepad mapping is shown on the same screen, read only (A punch, B kick, X special, Y or RB super, D-pad or left stick moves, Start pauses, Back goes back).

### Pause menu

P or Esc pauses. The menu has RESUME, MOVES, OPTIONS, CONTROLS and QUIT TO TITLE. W/S and Enter pick a row, P or Esc resumes, Q still quits at once, M mutes, B toggles blood, O opens OPTIONS. Rows other features add through `pauseItems` keep their keys (and are drawn as extra lines). MOVES shows the move lists (with the current key labels). QUIT TO TITLE asks first, with NO selected.

### Fullscreen

The F key toggles fullscreen on the page container (with the webkit fallback) and tries to lock the orientation to landscape, ignoring failures. The title shows the key in its hint line and a small FULLSCREEN button at the top right for touch. The canvas keeps its aspect ratio. Browsers that refuse (or iPhone Safari, which has no fullscreen for pages) simply do nothing: every promise is caught.

### Install (PWA basics)

`manifest.webmanifest` (name AGENT BRAWL, standalone, landscape, theme and background `#050304`, icons 192 and 512 plus a maskable 512), `apple-touch-icon`, `apple-mobile-web-app-capable`, `mobile-web-app-capable` and `theme-color` are linked from `dev.html`, so `node build.mjs` keeps them in `index.html`. There is no service worker: nothing is cached or fetched behind the player's back, and the game still needs the page to be served once. The icons are rendered from the game itself (logo, arena, two fighters) by `node tools/make-icons.mjs` (run after `node build.mjs`); the PNGs in `icons/` are committed.

On `file://` Chrome refuses to read a manifest and logs a CORS error. `tools/headless.mjs` filters exactly that log line for the manifest, because the test suite opens the build from disk. It does not happen over http.

## How it hangs together

- `options.js` redefines `difficulty` (four values) and defines `infTime`, `shake`, `reduceFlash`, `crt`, `announcer`, `trackToast` (documented in `docs/ARCHITECTURE.md`).
- Round time INFINITE keeps `game.timer` above 4 while a fight runs (the `update` hook tops it up) and the HUD draws `--` instead of the number.
- Shake is applied by scaling `game.shake` around the world draw; reduce flash caps the white flash in `drawPost`; CRT raises the scanline strength; the announcer switch silences `ANNOUNCER.say`; the track toast switch hides the music title text.
- The input hook only acts in the `title` and `pause` phases. It reads the same keys as the engine (`pressed` edges), clears the ones it used, and leaves the others alone, so the engine's P/Esc/Q/M/B behaviour in the pause phase is unchanged. While a key is being captured a window `keydown` listener in the capture phase takes the key before the engine sees it.
- `window.OPTIONS` is the small API the tests use: `screen`, `capturing`, `message`, `warning`, `open(screen)`, `close()`, `rows()`, `state`, `rebind(who, action, code)`, `conflict`, `reserved`, `keyName`, `fullscreen()`, `resetDefaults()`, `ownKeys`.

## Tests

`tools/tests/options.mjs`: the options screen opens from the title and from the pause menu by keys; the pause menu rows (MOVES, OPTIONS, CONTROLS, QUIT with confirmation); ROUNDS, ROUND TIME and RESET TO DEFAULTS; every effect switch changed while a fight draws and runs; the music volume is set on the screen, stored in `brawl.settings`, survives a reload and the live audio level follows it; a P1 punch rebind makes the new key punch and the old one not in a scripted fight; a conflict and a reserved key are refused with a warning; best of 1 ends a CPU match after one decided round; infinite time never times out over 7000 stepped ticks (with a control that does time out); the F key does not break the page; the manifest, the icons (sizes) and the head tags exist.

## Not done

- A colour-blind friendly health bar palette (needs a palette hook in `hud.js`).
- Real devices: fullscreen and orientation lock on a phone, install prompts over http, gamepad navigation on real pads and the touch rows were checked only through the code paths and the headless browser.
