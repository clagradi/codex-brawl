# p-clips: KO clips

Owner: the clips agent. Code: `p-clips.js`. Tests: `tools/tests/x-p-clips.mjs`. Shared edits: one script line at the end of `dev.html`, rows in `docs/ARCHITECTURE.md` (load order, file ownership, the `clips.on` setting) and one README line. `game.js` is not touched.

Everything is built on the extension layer only: the HOOKS points `update` and `drawTop`, the BUS events `match:start`, `round:start`, `ko`, `round:end`, `match:end`, `phase` and `settings`, and one SETTINGS key.

## What the player sees

While a match is played, the browser keeps a rolling capture of the game canvas. When the match is decided, the clip is cut a few seconds after the deciding blow. The end screen then shows a **KO CLIP** panel on the left, with the clip length, a looping preview at 8 frames a second and a blinking **C SAVE CLIP** button (**TAP TO SAVE** on touch screens).

- **`C`**, or a tap anywhere on the panel, saves the clip as a local download named `agent-brawl-ko-<winner>-vs-<loser>-<date>-<time>.webm`. Where the browser records only mp4, the file is `.mp4`.
- The panel turns green and shows **CLIP SAVED** for two seconds. Saving again needs a fresh press after half a second, and a held key does not repeat.
- Nothing is ever saved without that key press or tap. Nothing is uploaded or sent anywhere: the file is a `blob:` object URL handed to an `<a download>` link.
- The clip is freed (the object URL is revoked) when the player leaves the end screen or starts the next match.

## How the capture works

- `canvas.captureStream(30)` feeds a `MediaRecorder`. The capture is video only: the engine's audio graph is not touched. The type is the first one the browser supports out of `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm` and `video/mp4`. The bit rate is 2.5 Mbit/s and the timeslice is 1 s.
- **Rolling window.** A WebM file cannot simply be trimmed at the front, so two recorders overlap. A new one starts every 3 s of recorded time and the oldest is dropped. The older of the two always holds the last 3 to 6 s.
- **The cut.** At the blow that decides the match (a `ko` or `round:end` where the winner reaches the rounds needed, which includes a decision on time), the newer recorder is dropped. The older one runs on for 3 s.
  - While FINISH IT or a finisher is on screen, the cut waits. It comes 1.5 s after that phase ends, so the finisher is in the clip.
  - A clip never runs past 16 s from its recorder's start.
  - If the match reaches `match:end` or the end screen without a decision (for example a mode that ends the match itself), the clip is cut there.
- **Pauses.** The pause screen and a hidden tab pause the recorders. Recorded time does not count while paused.
- **Abandoned matches.** Going back to the title or select screen mid-match stops everything and keeps no clip.
- **No recording at all:** training mode (`game.modeId === 'training'`) and `clips.on` turned off.
- **Preview.** The preview is not a decoded video. While recording, the `drawTop` hook copies the finished canvas into a ring of 100 small 160x90 canvases, 8 times a second, and the panel loops the ones that fall inside the clip. This keeps the canvas origin-clean and costs one small `drawImage` every 125 ms.

## Settings

| Key | Label | Effect when off |
| --- | --- | --- |
| `clips.on` | KO CLIPS | nothing is recorded and no panel is shown; turning it off mid-match stops the recorders at once |

The options screen does not list it yet: `options.js` has a fixed row list and no extension API for feature rows.

## Unsupported browsers

The feature registers nothing (no hooks, no listeners) in these cases:

- no `MediaRecorder`
- no `canvas.captureStream`
- no recordable type
- a headless or automated browser (`navigator.webdriver`, or `HeadlessChrome` in the user agent)

The last case keeps the shared test suite free of real encoding work. The game is unchanged in all of these cases. If a recorder throws when it starts, or the browser refuses the capture, that match simply has no clip.

## API

`window.CLIPS`:

- `supported()`
- `state()`: booted, type, recording, ages of the live recorders, cutIn, paused, pending and the clip `{ size, type, dur, name, url, frames, blob }`
- `save()`
- `cut()`
- `consts`
- `_test({ MR, capture, now, seg, tail })`: swaps in a fake `MediaRecorder`, a fake capture and a tick clock, and boots the wiring even in headless Chrome. `MR: null` simulates an unsupported browser.

## How to test

`node build.mjs && node tools/headless.mjs --test` runs `tools/tests/x-p-clips.mjs` along with the rest. The file checks:

- the headless no-op and the support detection (webm before mp4)
- the 3 s rotation, pause and hidden-tab freezing
- the cut after a KO, after an untaken FINISH IT window, after a finisher and after a time-out
- the 16 s cap
- the late-stop race with a rematch
- the panel pixels on the end screen
- `C` and tap saving, once per press, with no automatic download
- the URL being revoked when leaving the end screen
- quitting mid-match, the setting, and training
- a full match with recording unsupported
- a short real-time run with the browser's own `MediaRecorder`, which checks the EBML header of the webm and that the canvas is not tainted
- a source scan for network code

By hand: open `dev.html` in a desktop browser, play a match to the end screen, and press `C`. The browser downloads a short `.webm` of the knockout.
