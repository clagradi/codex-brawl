# p-jukebox: SOUND TEST, fighter themes and visualiser

Owner: the jukebox agent. Code: `p-jukebox.js`. Tests: `tools/tests/x-p-jukebox.mjs`. Shared edits: one script line at the end of `dev.html`, additive rows in `docs/ARCHITECTURE.md` and one paragraph in `README.md`, and one small engine edit, the read-only `MUSIC.info` / `MUSIC.hits` / `MUSIC.clock` block at the end of `music.js` (see the end of this file).

Everything else is built on the extension layer: `HOOKS` (`titleItems`, `update`, `drawTop`, `musicTheme`), `SETTINGS` and `MUSIC.define`. The feature does not depend on any other premium feature, and `game.js` is not touched.

## What the player sees

**SOUND TEST.** A new entry in the title menu (order 800, in front of OPTIONS). It opens a full screen that lists every theme `MUSIC` knows, by name, in three groups: MENU (title screen, versus screen, match over), ARENA (one per stage, named like the stage) and FIGHTER (the five new themes). Anything another feature defines later with `MUSIC.define` shows up in a fourth group without any change here. The list holds 14 rows and scrolls.

- `W`/`S` or up/down move the cursor (it wraps), `A`/`D` or left/right page through the list.
- `Enter`, `Space` or punch plays the selected track from its top; pressing it on the track that is playing restarts it.
- `Backspace` or the special key stops the music (and plays the selection again when it is already stopped). Leaving the screen resumes the normal title music.
- `V` or the super key toggles the fighter themes on the VS screen.
- `Esc` or the kick key leaves. The title cursor is put back where it was.
- The mouse and touch work too: tap a row to play it, the scroll bar pages, the buttons are STOP/PLAY, FIGHTER THEMES ON VS and BACK, and the wheel moves the cursor. Taps on this screen never reach the title menu below it.

The right half shows NOW PLAYING: the track name and its group, the tempo (BPM), the key, the number of bars and the loop time, the instruments of the lead, bass and arpeggio, the 24 visualiser bars, a strip of the 16 steps of the bar that is sounding, and BAR n OF m with the pass count. A fighter theme also shows that fighter's idle sprite. When sound is muted the header says so.

**Fighter themes.** Five 8-bar themes, one per fighter of the fixed roster, generated in code and registered as `fight_tibo`, `fight_poteto`, `fight_dot`, `fight_wang` and `fight_muse`. Each has its own scale, tempo, drum kit, chord loop and instruments, chosen to suit the fighter bios in the roster, and nothing else about anyone is claimed:

| Fighter | Track | BPM | Feel |
|---|---|---|---|
| Tibo | SHIP IT | 148 | driving, dorian, straight kit |
| Poteto | SWEET HEAT | 112 | mixolydian shuffle |
| Dot | ROUND TRIP | 164 | bright lydian, quick and bouncy |
| Wang | IRIDESCENT | 92 | slow whole-tone shimmer with a gentle vibrato |
| Muse | UNDO SWARM | 172 | pentatonic pings that stack up and get undone |

The melodies come from a seeded random walk (mulberry32 seeded by an FNV hash of the fighter id), so a fighter always gets the same song. The walk is chord aware: the first note of every bar is a tone of that bar's chord, and the lead has an even-pass and an odd-pass variant. Every theme is tuned to the house loudness of about -17 dBFS RMS (the test measures all five).

**VS screen.** The setting `jukebox.vs` (off by default) makes the VS screen, and the round 1 intro that shares its track, play the theme of the first fighter. The `musicTheme` hook does this; the engine only honours a returned name that exists. It is off by default because the match test expects the classic `vs` track on the demo route (`tools/test-match.mjs`); the SOUND TEST has a switch for it, and flipping the default to `true` is one word in `p-jukebox.js`.

**Visualiser.** 24 bars drawn from the music clock. On every 16th step of the playing theme `MUSIC.hits` says what starts: kicks light the low bars, toms and snares the middle, hats the top, and the bass, lead and arpeggio notes light the bar of their pitch. Bars decay and a thin peak marker falls slower.

The clock has two sources. With sound running it is `MUSIC.clock()`, the real audio position, so the bars are in time with what you hear. Muted, suspended or before the first key press there is no audio position, so a virtual clock advances the same tempo one game tick at a time (and wraps to the theme's loop point). Both feed the bars through the same step counter, so each 16th step lights its bars exactly once. The screen shows the same bars in a muted run, which is also what makes the tests exact.

## Settings

| Key | Default | Meaning |
|---|---|---|
| `jukebox.vs` | `false` | the VS screen plays the first fighter's theme |
| `jukebox.last` | `''` | the track last played on the SOUND TEST; the cursor starts there next time |

## How to test

`tools/tests/x-p-jukebox.mjs` drives the screen with real key events and synthetic pointer events, with the loop frozen by `hold(true)` and advanced with `step(n)`. It checks the registry (entry, order, settings, exactly five fighter themes, every theme listed once), the generator (length, tempos, voices, note range, chord tones, seeded determinism, valid pattern characters), loudness and clipping by rendering each theme with `MUSIC.render`, the three accessors, the key and pointer paths of the screen, the live and virtual clocks (every kick of a theme lights the low bar on the tick that crosses it, bars only rise on a step crossing, the virtual clock keeps the tempo and wraps to the loop point), and the VS hook, including a real match on the demo route. Run the whole suite with `node tools/headless.mjs --test`.

## The engine edit

`music.js` is engine code and has no public way to read a theme or the playing position, so a small block of read-only accessors sits after `MUSIC.themes`:

- `MUSIC.info(name)` returns `{ bpm, len, from, root, voices }` or `null`.
- `MUSIC.hits(name, step, rep)` returns what starts on one 16th step, `{ k, s, t, h, l, b, a }`, or `null`.
- `MUSIC.clock()` returns `{ name, step, rep, sd, len }` for the live player, or `null`.

They schedule nothing and change no state; the only code they share with the scheduler is its own `comp` and `pitch` helpers.
