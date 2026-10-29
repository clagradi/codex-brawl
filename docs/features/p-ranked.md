# RANKED: the PERFORMANCE REVIEW (p-ranked.js)

RANKED is a title menu entry, one player against the CPU, in which every match moves a local rating (an Elo-like number that starts at 1000). The rating maps to six ranks, and the CPU level of the next match follows the rating, so the game gets harder as the player gets better. Nothing leaves the browser: the rating and the record live in the SETTINGS store.

Owner: the p-ranked agent. Files: `p-ranked.js`, `tools/tests/x-p-ranked.mjs`, this note. The script is the last one in `dev.html`, after `vfx.js`.

## The ranks

| Rank | From rating | Colour |
|------|-------------|--------|
| INTERN | 0 | steel |
| JUNIOR | 1100 | green |
| SENIOR | 1250 | blue |
| STAFF | 1400 | purple |
| PRINCIPAL | 1550 | orange |
| DISTINGUISHED | 1700 | gold |

A new player is an INTERN at 1000. The rating is kept between 0 and 5000. The progress bar of an INTERN starts at 900, DISTINGUISHED has no next rank to show.

## How a match is rated

Every ranked match is played against an opponent with a rating of its own, and the result is the usual Elo step with two adjustments.

- Expectation: `E = 1 / (1 + 10^((opponent - rating) / 400))`.
- K factor: 40 for the first ten matches, 24 afterwards.
- Margin: a win multiplies the step by `1 + 0.25 * (roundsWon - roundsLost) / roundsToWin` (clamped to 0..1), so a 2-0 win pays up to 25 percent more than a 2-1 win. A loss multiplies it by `1 - 0.25 * roundsWon / roundsToWin`, so a loss that took a round costs less than a 0-2 loss.
- The change is `round(K * (result - E) * multiplier)`. A win is always at least +1 and a loss always at most -1.

Two anchors: an even match at the start is worth +25 for a 2-0 win and -20 for a 0-2 loss.

## The opponent and the CPU level

The opponent of match number `games` is the player's rating plus an offset taken from a fixed cycle of five: 0, +100, 0, -100, 0. The label on the screens is PEER, STRETCH GOAL, PEER, WARM-UP, PEER. The opponent rating is clamped to 450..1870.

The CPU level is `0.45 + (opponent - 1000) * 0.0006`, clamped to 0.12..0.97, so 1000 is the NORMAL level (0.45) and the top of the ladder is a NIGHTMARE-class opponent. The level is set when the match starts and again at the start of every round, which switches off the engine's usual rise of the CPU level from round to round: a ranked opponent keeps its level for the whole match. The ranked match ignores the DIFFICULTY setting.

While a ranked match is on screen, `SETTINGS.get('difficulty')` answers the engine tier closest to that level (easy below 0.325, normal below 0.575, hard below 0.825, otherwise nightmare, or hard when the nightmare tier is not loaded) so that the code that reads the difficulty for the CPU behaviour agrees with the level. This is a wrapper in memory only: the stored setting is never written, and the pause screen and the options screen read the real value.

## Screens

- Title: the RANKED entry (order 27, one player). With it highlighted, a small note shows the rank, the rating and the record. After a forfeit the title shows a note with the cost for seven seconds.
- Character select: a badge with the rank, the rating and the stakes (`WIN +N LOSE -M`, the base steps against the next opponent).
- VS screen: the same, with the CPU level and the opponent label.
- Pause: a red line, QUITTING COUNTS AS A LOSS, with the cost.
- End screen: the rank card, PERFORMANCE REVIEW. It shows the emblem and name of the rank, the rating counting up to its new value, the change popping in, a progress bar to the next rank, a verdict, the opponent and the rounds, the RECORD, STREAK and PEAK boxes, a sparkline of the last ratings and the CPU level of the next match. Verdicts: EXCEEDS EXPECTATIONS and MEETS EXPECTATIONS for wins, NEEDS IMPROVEMENT and BELOW EXPECTATIONS for losses, PROMOTION APPROVED when the rank went up, PERFORMANCE PLAN when it went down, NO SHOW for a forfeit. A short rising or falling jingle plays when the number lands. The card is drawn through the `drawTop` hook, so it sits over whatever the end screen already shows.

All text is capitals in the pixel font. The emblem and the card are drawn with rectangles; no image or audio files.

## Leaving a match

A rated match that has reached its first round is a commitment. Going back to the title or to the character select from the pause menu, or starting another match over it, counts as a loss: the rating drops as for a 0-2 loss, the record gets a loss and a forfeit, the streak is reset and a note on the title says what it cost. Leaving on the VS screen, before round one, costs nothing. A finished match is already settled and is never forfeited afterwards. Matches in any other mode are never rated.

## Saved data

| Key | Meaning |
|-----|---------|
| `ranked.rating` | the rating, a number 0..5000, default 1000 |
| `ranked.record` | `{ games, wins, losses, streak, best, peak, forfeits, hist }`: `streak` is the current run of wins, `best` the best run, `peak` the highest rating, `forfeits` the matches left, `hist` the rating after each of the last 12 matches |

The record is a free-form value in the store, so it is cleaned up on every read: counts are whole numbers, the wins and losses cannot exceed the games, and the history keeps only numbers in range.

## Events and API

- BUS `ranked:result` is emitted once per rated match, with `{ won, forfeit, before, after, delta, expected, k, mult, wins, opp, label, level, tier, rankBefore, rankAfter, promoted, demoted, record }`. Other features can listen to it (a badge, a log).
- `window.RANKED` is the single global: the pure maths (`expected`, `kFactor`, `levelFor`, `tierOf`, `rankOf`, `calc`, `schedule`, `band`, `preview`, `cleanRec`), the data (`RANKS`, `OFFS`, `START`, `CAP`), the state (`rating()`, `record()`, `last()`, `toast()`, `live()`, `level()`, `state()`) and `reset()`. `reset()` puts the rating back to 1000 and empties the record; an options screen can call it for a RESET RANKING row.

## How to test

`node tools/headless.mjs --test` runs `tools/tests/x-p-ranked.mjs` with the rest. It checks the maths as pure functions, the schedule, the sanitising of a damaged record, the whole flow on the real engine (the title entry, the select, a 2-0 win, a loss, a comeback win, a promotion and a demotion, a flat CPU level over the rounds, the difficulty wrapper, the forfeit rules, a reload), the texts the screens draw and that other modes are untouched.

## Notes

- The title menu already holds many entries; RANKED adds one more. When the list outgrows the title, a submenu or a second page for the modes is the integrator's call.
- The rating is local and unverified: it lives in the browser store, so it can be edited or cleared. It is a personal ladder, not a leaderboard.
