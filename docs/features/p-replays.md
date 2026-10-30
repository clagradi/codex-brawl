# Match replays (p-replays.js)

Every 1 PLAYER VS CPU and 2 PLAYERS match is recorded while it is played. The game keeps the last five, and REPLAYS on the title menu plays them back frame for frame. A replay is not a video: it stores the random seed, the match settings and the inputs of both fighters, and the engine plays the match again from them. A replay therefore ends with the same winner and the same health as the real match, and the end panel checks that and says REPLAY VERIFIED.

## How to use it

Play a 1 PLAYER VS CPU or 2 PLAYERS match to the end. The match is saved when the end screen appears; a match quit from the pause screen is not saved. Other modes (arcade, survival, team, tournament, training and the bonus games) are not recorded.

On the title, choose REPLAYS:

- `W`/`S` (or up/down) choose a match. Each row shows both fighters, the result, the arena, how long the match ran, and a tag: NEW (not watched yet), VERIFIED or DESYNC.
- `Enter`, `Space` or punch watches it.
- `Delete` (or `T`) twice erases it; the first press arms the row and shows a prompt. Moving the pick or leaving the list disarms it. (`X` is the back key everywhere in the game, so it never erases; `D` is 1P right and the pad's right, so it is not an erase key either; the Mac delete key sends Backspace, which is back too.)
- `Esc`, `X` or kick goes back to the title.

While a replay plays, the pill at the top shows REPLAY, the speed and the progress:

| Key | Action |
| --- | --- |
| `Space`, `Enter`, `P` or punch | pause and resume |
| `K`, `2` | toggle 1X and 2X speed |
| `.` or right | while paused, step one frame |
| `R` | restart from the first frame |
| `Esc` or `Backspace` | back to the list |

When the replay reaches the recorded end, a panel shows REPLAY VERIFIED (or REPLAY DESYNC with the first frame that differed), the result and the health of both fighters. `Enter` goes back to the list and `R` watches it again. Leaving a replay puts back the viewer's own settings, fighters and arena choice.

## How it stays deterministic

- **Seeded randomness.** At the VS screen the recorder picks a seed and replaces `Math.random` with a generator. The generator hashes the seed, the match tick and a per-tick counter, so the CPU, the arena roll, the effects and every other random call give the same numbers on playback. The original `Math.random` comes back as soon as the match ends or is left. If another script has already replaced `Math.random` (a test, for example), the match is not recorded rather than recorded wrong.
- **Settings snapshot.** The entry stores every setting that changes the simulation (difficulty, rounds, round time, infinite time, key binds, and the boolean, number and choice settings of other features). The match mutators (`mutators.on`) are part of the snapshot too, so a replay of a TURBO or GLASS match plays with the same ones; an entry saved before they were kept plays with none. Volume, mute, blood, screen shake, flash, CRT, announcer and the track note are left to the viewer, and so are the settings that only change how the screen or the sound looks: colour-blind palette, high contrast, big text, live captions, rumble, button hints and glyphs, the quality level, the photo filter, frame and HUD, and the speech voice. REDUCED MOTION (`a11y.motion`) and SIMPLE SPECIALS do change the simulation, so they follow the recording; a viewer with REDUCED MOTION on still gets a calm picture, because the replay zeroes the screen shake and the full-screen flash while it plays (`REPLAYS.calm()`). Playback applies the snapshot and restores the viewer's settings afterwards. A crash guard (`replays.restore`) puts them back on the next load if the page closes mid-replay.
- **Inputs, not positions.** Each tick the recorder compares the held keys with the previous tick and writes only the changes, plus the presses of that tick. Pauses (the `P` key or a lost window focus) are stored too, so a paused stretch replays as a paused stretch.
- **Checksums.** Every 30 ticks the recorder hashes the health, position and super meter of both fighters, plus the round and the round clock. Playback compares the same hash at the same tick. The first mismatch is reported as the DESYNC frame, and the result check at the end needs the same winner, the same health of both fighters and the same length.

## Entry format

`replays.list` holds up to five entries, newest first:

| Field | Meaning |
| --- | --- |
| `v` | format version (1) |
| `at` | time saved, in milliseconds |
| `modeId`, `mode` | `'versus'` or `'versus2'`, and the engine mode number |
| `ids`, `sel` | fighter ids and roster indexes of both sides |
| `arena`, `arenaId` | the arena index and id that were played |
| `cpu` | which sides the CPU played |
| `seed`, `tk` | random seed and the engine tick at the start |
| `set` | the settings snapshot |
| `codes` | the key codes that appear in `ev` |
| `ev` | input changes, `;`-separated, one group per tick that changed: `gap:held|pressed`, where the gap is the number of ticks since the previous group and the two lists are `.`-separated indexes into `codes`, all in base 36 |
| `pz` | the ticks where a pause started or ended |
| `ck` | checksums, three base-36 characters each, one per 30 ticks |
| `len` | ticks from the VS screen to the end screen |
| `res` | `{ w, hp, wins, rounds }`: winner side, health of both fighters, round wins and rounds played |
| `chk` | set after a playback: 1 verified, 0 desync |

A recording stops (and is dropped) after an hour of play or 400 000 characters of input, so one entry never fills the browser store.

## Limits

- A replay recorded by an older version of the game can show DESYNC after the fight code changes. That is the check doing its job; the match itself still plays.
- A replay is not a new match. While one plays, `p-replays.js` keeps its `match:end` event from the other features (it wraps `BUS.emit` for that one event only), so the STATS counters and the colourway unlocks do not count it twice. Hits, KOs and rounds still send their events, so effects and sounds play as usual; OKRS and the VAULT look at `REPLAYS.state().active` and count nothing from a replay (no round, hit, special, arena play, match, win or loss). Every setting is put back when the replay is left.
- The REPLAYS item uses the title menu registry. On a build with many modes the title can list more items than fit on screen; `W`/`S` still reach REPLAYS.
- The list and the viewer controls need a keyboard or a gamepad; there are no touch buttons for them.

## Settings keys

| Key | Default | Meaning |
| --- | --- | --- |
| `replays.list` | `[]` | the saved replays (see the entry format above) |
| `replays.restore` | `null` | the viewer's settings while a replay plays; restored on the next load after a crash |

## How to test

`node tools/headless.mjs --test` runs `tools/tests/x-p-replays.mjs`, which:

- records a CPU vs CPU match and replays it to the same winner and health, also after a reload;
- records a scripted 2 PLAYERS match with a `P` pause and a lost-focus pause, and checks that the replay matches, paused ticks included;
- tampers with a seed and with the inputs and expects DESYNC with the frame number;
- drives the viewer keys (pause, 2X, frame step, restart, exit) and checks that the viewer's settings, fighters and arena choice come back;
- opens REPLAYS from the title, moves, erases with a double press of `T`, checks that `X` backs out and never arms the erase, watches and leaves;
- records with and without mutators and plays both back with the recorded ones (and an old entry without the key with none), then checks that the viewer's mutators come back;
- checks that a viewer's colour-blind, contrast, big-text and REDUCED MOTION choices survive a replay, that REDUCED MOTION viewers get no shake or flash and still see a VERIFIED replay;
- checks that a replay moves no OKRS or VAULT counter;
- checks the cap of five, that a quit match and a match with a foreign `Math.random` are not saved, the crash guard, and that there are no console errors.
