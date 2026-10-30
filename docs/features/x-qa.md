# Quality tools (x-qa)

Four small node tools that look after the game without touching it: a fuzzer that tries to break it, a frame-data meter, a balance meter, and a banned-word checker. None of them is a game script, so none is listed in `dev.html` and nothing from them ships in `index.html`. They need only node and the Chrome that `tools/headless.mjs` already finds; there are no dependencies.

All of them run the game headless and drive it with `window.step(n)` (the same trick the test run uses), so there is no wall clock anywhere: a run takes seconds, and the same seed gives the same match every time. They read the `dev.html` sources by default, so you do not have to run `node build.mjs` first (add `--index` to use the built `index.html` instead).

## Fuzzer: `node tools/fuzz.mjs`

Plays whole matches with seeded random input for every fighter pair over several arenas, in three input modes (two humans, one human against the CPU, CPU against CPU), with random pauses mixed in, and checks after every tick that nothing is broken:

- no exception, and no console error or warning;
- no NaN in fighter or projectile numbers, the match clock included;
- fighters and shots inside the stage, health between 0 and the fighter's maximum, meter between 0 and 1000;
- nobody stuck in a hurt, attack, throw, jump or dash state for more than 420 ticks, no phase that lasts more than 3000 ticks;
- no runaway lists (projectiles, effects, popups, delayed callbacks);
- every match ends inside a tick budget (twice the round clock per round, plus the intros and the end screen), and the first match replays to the same hash on a fresh page (the determinism check).

The default run is 75 matches (about 350,000 ticks, about 90 seconds on a quiet machine) and ends with a summary: matches, failures by kind, how often each event and state was seen, and a few soft numbers such as how long fighters spent hugging the wall. Every failure prints a one-line repro:

```
node tools/fuzz.mjs --one SEED:P1:P2:ARENA:MODE
```

which replays exactly that match (for example `--one 5001:wang:muse:2:human2`) and prints the violations with the tick of the first one.

| Flag | Meaning |
| --- | --- |
| `--quick` | a short pass: fewer arenas and a shorter round clock (about 25 matches, about 25 seconds) |
| `--seed0 N`, `--seeds K` | first seed, and how many seeds per combination (default 1 and 1) |
| `--arenas K`, `--arena N` | how many arenas to rotate through (default 3), or just arena N |
| `--modes a,b` | any of `human2`, `human1`, `cpu` |
| `--fighters tibo,dot` | restrict the pairs (ids from the roster) |
| `--time S`, `--rounds N`, `--difficulty easy\|normal\|hard` | round clock in seconds (the game's minimum is 30), rounds to win, CPU level; the repro line repeats whichever of these you set |
| `--budget TICKS`, `--render TICKS` | override the tick budget, how often `render()` is called during a match (0 never) |
| `--one SEED:P1:P2:ARENA:MODE` | replay a single match |
| `--no-determinism`, `--sound`, `--index`, `--json`, `--strict` | skip the replay check, leave the sound on, test `index.html`, print the raw results, also fail when the page driver saw a console error that the per-tick checks did not |

The exit code is 0 when every match passed and 1 otherwise.

## Frame data: `node tools/framedata.mjs`

Measures every move of every fighter by simulation (about two seconds) and writes `docs/FRAMEDATA.md`: startup, active frames, recovery, total, damage, chip damage on block, advantage on hit and on block, reach and cooldown. A move is thrown at a dummy at a ladder of distances, so the table also says how far each move reaches. Advantage is counted in ticks after hit stop, positive meaning the attacker is free first. The page explains the exact conventions. The advantage columns show two numbers (for example `+6 / +7`) when the two sides differ: player 1 updates before player 2 inside a tick, which gives player 2 one tick extra in some situations. `--stdout` prints instead of writing, `--out FILE` writes elsewhere, `--fighters` restricts the list.

## Balance: `node tools/balance.mjs`

CPU against CPU, K seeded matches for every ordered pair of fighters (mirror matches included, both sides covered), arenas rotating, at the default difficulty and round settings. Default K is 12, which is 300 matches and about 2.5 minutes. It writes `docs/BALANCE.md`: the win-rate matrix, each fighter's win rate overall, against the others and as player 1 or player 2, the average match length, and the damage each move deals with its share of the fighter's total. Flags: `--k`, `--seed0`, `--difficulty`, `--time`, `--rounds`, `--fighters`, `--out`, `--stdout`, `--index`.

Read it as a measurement of the CPU brain playing each move set, not as a verdict. With twelve matches per pair one standard error on a matrix cell is about 14 points; a fighter row rests on 120 matches and is good to about 5. The report prints these numbers for the K it was run with. Re-run with another `--seed0` before acting on a small gap. The report is deterministic: the same flags and the same sources give the same file, which makes a before and after diff meaningful.

## Banned words and roster: `node tools/check-banned.mjs`

Scans every text file of the repo (sources, docs, tools and the built `index.html`) for third-party fighting-game names and catchphrases, and checks the roster rule: exactly TIBO, POTETO, DOT, ALEXANDR WANG and MUSE in that order, nobody called after a potato or a news item, and every `handle` field left an empty string. It prints `file:line: rule: text` for each problem and exits with 1 if there is one. The word list is stored scrambled in the source so that the file passes its own scan, and the one file that holds the readable list for the core test (`tools/test-match.mjs`) is skipped. A line that has to quote a word can carry the marker `check-banned: allow`. `--verbose` also lists notes (the plain word "flawless" is fine alone, the engine names its perfect-round flag `flawless` (the banner says ZERO BUGS), so it is only a note), `--json` prints machine-readable output, `--root DIR` scans another folder.

## Tests

`tools/tests/x-qa.mjs` runs inside `node tools/headless.mjs --test`. It uses the fuzzer's page-side harness on the test page with `hold(true)` and `step(n)`, so it is deterministic and takes a few seconds: a 700 tick smoke match (human against human) and a 650 tick CPU match must run clean, the same seed must replay to the same hash, a tiny tick budget must be reported as a budget failure, and a deliberately planted fault (health above the maximum) must be caught, so the checker is known to bite. It also checks that the match and balance plans are deterministic, that the balance report has no empty or NaN cells, and that `check-banned` is silent on this repo and loud on a planted banned word, a planted sixth fighter and a planted X handle.

## Notes and limits

- The fuzzer sends random buttons, not smart play, so it covers odd corners (wall, corner pins, simultaneous hits, pauses mid-move) better than it covers long combos. The CPU mode adds the AI's own paths.
- The fuzzer replaces `Math.random`, `BUS.emit` and a few settings for the length of one match and puts them back afterwards. It never writes to local storage and never opens the network.
- To fuzz a feature of yours, open the game with its settings on (or add a mode) and use `--fighters`, `--modes` and `--seed0` to focus; hooks you add through `HOOKS` are exercised like any other code path because the harness drives the real `startMatch()`.
- If a run is killed by a Chrome launch error, wait half a minute and run it once more; with many agents on one machine the browser sometimes does not start the first time.
