# p-photomode: photo mode

Owner: the p-photomode agent. Code: `p-photomode.js`. Tests: `tools/tests/x-p-photomode.mjs`. Shared edits: one script line in `dev.html`, rows in `docs/ARCHITECTURE.md` (load order, file ownership, the `photo` event, three settings) and one line in `README.md`. `game.js` is not touched.

Photo mode is built on the extension layer only (HOOKS, BUS, SETTINGS). It uses no network, no image files and no libraries: the picture is the game's own scene, redrawn on request.

## What the player sees

On the pause screen, a C PHOTO MODE button (bottom right, under the pause menu) and the `C` key open photo mode. It is available only from the pause screen, never during a fight, and not on top of the options screen.

The match stays frozen exactly where it was paused. A free camera lets you look around:

- Pan: drag with the mouse or a finger, or use the arrow keys or `WASD` (hold `Shift` for faster).
- Zoom from 1x to 4x: the mouse wheel, a two-finger pinch, `E` / `Q`, `+` / `-`, or the `+` and `-` buttons. Zooming keeps the point under the pointer in place. The view can never leave the scene, so no unpainted edge shows.
- `H` hides or shows the HUD (health bars, timer, names) in the picture. The fighters and the arena are not changed by it.
- Six filters, picked with `G` (next) or `1` to `6`, or the arrow buttons in the bar: CRT (curved glass, scan lines, phosphor stripes, dark corners), SEPIA, NOIR (black and white with fixed film grain), VAPORWAVE (violet, pink and cyan with a small colour split), PIXEL BIG (5 by 5 blocks, seven levels per colour), NONE.
- Frames, picked with `B` or the arrow buttons: NONE, CINEMA (black matte with a gold line, the arena name), POLAROID (paper border with a FIGHTER VS FIGHTER caption), ARCADE (neon double border), FILM (film strip with sprocket holes). The frames are part of the saved picture.
- `V` resets the view. `U` hides the control bar for a clean look (a tap on the picture, `U` or a click brings it back).
- `Enter` or `Space`, or the SAVE PNG button, saves a picture. `Esc`, `C`, `P`, `Backspace` or the ESC DONE button go back to the pause screen. A second `P` then resumes the fight as usual.
- `F` (fullscreen) and `M` (mute) keep working. Every other key is taken by photo mode, so nothing in the pause menu or the fight reacts while it is open (no quit, no blood toggle, no resume).

## Saving

Nothing is encoded, linked or downloaded unless the player presses `Enter` / `Space` or taps SAVE PNG. Only then does the code call `canvas.toBlob`, make a blob address and click a hidden link with a `download` name (`agent-brawl-photo-YYYYMMDD-HHMMSS-N.png`), then remove the link again and release the address after 15 seconds. The file is the picture with the filter and the frame at 960 by 540 pixels, without the control bar and the toast. A short PHOTO SAVED message shows on screen and the BUS event `photo` carries `{ saved: name }`. If the browser cannot encode the picture the message is SAVE FAILED and nothing else happens.

## How it works

- Opening takes a snapshot of the pause moment: the tick, the camera and the darkness fields of `game`. Every rebuild of the picture puts those values back for the duration of the draw, so the arena animation and the effects are the ones of the pause moment even though `game.tick` keeps counting.
- The picture is rebuilt only when something changed (view, filter, frame, HUD) and cached; a still view costs one `drawImage` per frame. The rebuild draws the scene through the engine's own `drawWorld`, `drawHUD`, the `drawHud` hook and `drawPost` with the camera as an outer transform, copies it to an offscreen canvas, runs the filter over the pixels and then the frame. The screen shows that canvas with the control bar on top; SAVE encodes the same canvas.
- The scene is drawn into the main canvas first (the engine's draw functions are bound to it) and then covered by the finished picture, all inside the `drawTop` hook, so nothing is ever visible half done.
- The pointer layer is a transparent `div` placed exactly over the canvas (the same size and position as `cv.style`). The engine and `options.js` only listen to events on the canvas, so they never see the mouse or touch input of photo mode. Pointer capture is optional (it is wrapped in `try`).

## Hooks, events, settings

| Where | What |
| --- | --- |
| HOOKS `pauseItems` | `{ key: 'KeyC', label: 'C PHOTO MODE' }`; the item only counts a C pressed while paused, because the engine keeps unused key presses from the fight |
| HOOKS `update` (order -10) | handles all keys of photo mode and ends with `clearPressed()`, so `options.js` and the engine never see them |
| HOOKS `drawTop` (order 9999) | draws the finished picture and the bar while open; draws the pause screen button otherwise |
| BUS `phase` (in) | leaving the pause phase closes photo mode |
| BUS `settings` (in) | a change of a `photo.*` key rebuilds the picture |
| BUS `photo` (out) | `{ open: true }`, `{ open: false }`, `{ saved: name }` |
| `window.drawFight` | wrapped the way `options.js` wraps it: while photo mode is open the engine does not paint its own pause scene (photo mode paints the whole picture itself) |
| SETTINGS | `photo.filter` (`crt`, `sepia`, `noir`, `vapor`, `pixel`, `none`, default `none`), `photo.frame` (`none`, `cinema`, `polaroid`, `arcade`, `film`, default `none`), `photo.hud` (bool, default on); the last choices are remembered |

The options screen lists its rows by hand, so the three `photo.*` keys do not appear there; they are changed inside photo mode.

## Public API

`window.PHOTO`: `active`, `canvas` (the finished picture), `state()`, `open()`, `close()`, `save()` (resolves to `{ name, bytes, type, width, height, filter, frame, hud, zoom }`, or `null` when it failed), `rebuild()`, `reset()`, `setView(x, y, zoom)`, `zoomAt(zoom, px, py)`, `pan(dx, dy)`, `setFilter(name)`, `setFrame(name)`, `setHud(bool)`, `ui(bool?)`, `buttons()` (the control bar rectangles in canvas units), `entryButton()`, `overlay()`, `FILTERS`, `FRAMES`.

## Tests

`tools/tests/x-p-photomode.mjs` drives everything with `hold(true)`, `step(n)` and direct `render()` calls, with real key events and real pointer and wheel events on the pointer layer. It checks, among other things:

- photo mode opens only from the pause screen, the fighters do not move while it is open, and the picture is cached and stable for 120 frames;
- pan and zoom limits, zoom around a point, the key bindings, the buttons, the wheel, a two-pointer pinch, a drag that starts on a button;
- every filter changes the picture and has its own property (SEPIA keeps red >= green >= blue, NOIR has equal channels, PIXEL BIG is flat in 5 by 5 blocks, CRT has black corners and dark scan lines, VAPORWAVE is violet and pink);
- every frame changes the picture and has its own colours;
- the HUD toggle changes only the HUD (the middle of the picture is identical);
- no `toBlob`, `createObjectURL` or link click happens before an explicit save; after `Enter` and after a tap on SAVE PNG there is exactly one of each, the link name ends in `.png`, the blob is an `image/png` with the PNG signature and a 960 by 540 header, and the decoded pixels are the same as `PHOTO.canvas` and differ from the screen (the bar is not in the file);
- no key leaks (Q, B, Enter, Space, T, O, Tab change nothing outside photo mode), `Esc` / `C` / `P` leave, a second `P` resumes;
- a phase change closes photo mode; the options screen blocks it; touch layouts grow the buttons to at least 44 pixels;
- the source has no banned word, no non-ASCII character and no network call.

## Limits and notes for the integrator

- The key `C` is the entry. If another feature also claims `KeyC` on the pause screen, change `key` in the `pauseItems` item and the two places that tap `KeyC` in the update hook.
- The pause screen button sits at x 790 to 946, y 340 to 380 (48 high on touch). If more features add pause screen content there, move `entryRect()`.
- The arena hazards of `hazards.js` count their own frames in the update hook even while paused. The picture is frozen between rebuilds (it is cached), but a rebuild made much later (after a pan, a zoom or a filter change) can show a hazard in a different animation frame than the first build. Everything driven by `game.tick` is exactly the pause moment.
- CRT and VAPORWAVE rebuilds read and write the whole 960 by 540 picture; they take a few tens of milliseconds, so dragging with them on is a little less smooth than with NONE.
- Saving goes through a hidden link with a `download` attribute. A browser that blocks downloads from a page opened as a file shows its own prompt; the picture is still encoded correctly.
