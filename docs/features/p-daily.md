# Sprint of the day (p-daily.js)

One fixed challenge per calendar day, the same for everybody who plays on that date: a fighter for you, an opponent, an arena, one modifier and one goal ("win without jumping"). Win the match and meet the goal to clear the sprint. Clearing sprints on consecutive days builds a streak, and every sprint ends on a result card with the stats and a SHARE ON X text. It is entirely local: there is no server, no account and no network request, so "the same for everybody" means the same code on the same date gives the same plan.

The feature lives in `p-daily.js`. It appears in the title menu as SPRINT OF THE DAY (mode id `daily`, one player) and uses only the shared contracts (BUS, HOOKS, SETTINGS, MODES). No engine file was changed.

## How a day is made

- The day is the local calendar date as `YYYY-MM-DD` (the computer's own time zone). The day number used for the streak comes from `Date.UTC`, so a daylight saving change can never make a day 23 or 25 hours long.
- The plan is a pure function of that string: `planFor(key)` hashes `AGENT-BRAWL-SPRINT-<key>` with FNV-1a and draws everything from a mulberry32 generator. It never calls `Math.random`, so a plan cannot change between two looks at the same day. The draw order is fighter, opponent (never the same fighter), arena, modifier, goal (never one that clashes with the modifier) and the goal number.
- The tests pin the plans of three fixed dates. If you change the catalogs or the draw order you change everybody's day, so change them on purpose and update the pinned values in `tools/tests/x-p-daily.mjs`.

### Modifiers

| Name | Effect |
| --- | --- |
| GLASS CANNONS | All damage times 1.6, for both sides. |
| FRAGILE FOE | The CPU takes 50 percent more damage. |
| IRON FOE | The CPU takes 30 percent less damage. |
| NO METER | The super meter of both fighters stays empty. |
| SPEED ROUNDS | Rounds last 45 seconds. |
| ONE ROUND | A single round decides the sprint. |
| MARATHON | First to 3 rounds wins. |
| HARD CPU | The CPU fights at hard level. |
| ROOKIE CPU | The CPU fights at easy level. |

### Goals

Every goal also needs the win. Twelve kinds: win without jumping, without blocking, without special moves, without losing a round; win taking at most 45, 70 or 100 damage; win in under 50, 70 or 90 seconds; land a 3 or 4 hit combo; use 2, 3 or 4 special moves; win with a super; throw the CPU 1, 2 or 3 times; knock the CPU down 2, 3 or 4 times; land 12, 18 or 25 hits. A modifier never gets a goal that makes no sense with it (for example NO METER never gets "win with a super").

## Fixed rules

During a sprint everybody fights under the same rules: 2 rounds to win, 99 seconds, normal CPU, unless the modifier changes one of them. `SETTINGS.get` is wrapped to answer with those rules while a sprint runs, so the engine sees them without anything being written to the stored options. The moment the sprint ends (or another mode takes the game over) the wrapper steps aside and your own options read as they were. Your own character select pick and arena pick are untouched as well: the sprint puts the fighters and the arena of the day in `game.sel` and `game.arena` and gives your selection back afterwards.

## Screens

- **Briefing** (title menu, SPRINT OF THE DAY): the date, both fighters, the arena, the modifier with its rule, the goal, the status of today (NOT PLAYED YET, CLEARED with the number of tries, WON with the goal missed, or LOST), the current streak, the best streak, the cleared and played counts and a row of the last 7 days. Left/Right (or A/D, or the pad) choose FIGHT (PLAY AGAIN once cleared) or BACK, Enter confirms, Esc goes back. A tap or a click on BACK goes back and a tap anywhere else starts the sprint.
- **Versus screen and HUD**: the modifier and the goal are shown on the versus screen. During the fight a strip under the HUD keeps the goal with its live progress (for example "BEST COMBO 2/3") and the modifier name.
- **Result card** (end of the match): SPRINT CLEARED, GOAL MISSED (won, but the goal was not met) or SPRINT LOST, the goal, the modifier, and the stats the goals are judged on: time, hits landed, best combo, damage taken, jumps and blocks. Then the streak, and one line that says what happened to it (NEW BEST STREAK, TODAY IS IN THE BOOKS, ALREADY CLEARED - PRACTICE, or TRY #n - RETRY TO CLEAR IT). Keys: Enter (or Space, or a punch key) opens the briefing, R retries the same sprint, T shares on X, Esc goes to the title. Keys pressed in the first 40 ticks are ignored so a mashed fight key cannot skip the card. On a touch device the engine pills do the same job (SELECT opens the briefing, REMATCH retries).

## Streak and history

The state is one setting, `daily.state` (default `null`, label SPRINT OF THE DAY), kept with the other options in the browser's `localStorage`.

- A day has a status: 0 lost, 1 won with the goal missed, 2 cleared. A day can be played any number of times; the history keeps the best status and the number of tries. The history keeps the last 30 days.
- The streak only moves on the first clear of a day, and only when that day is newer than the last cleared day. Clearing yesterday and then today makes 2; skipping a day restarts at 1. A win that misses the goal, a loss, or clearing an older day late do not touch it. The best streak is kept.
- The streak shown is "live": if the last cleared day is before yesterday it shows 0 even though the stored value still holds the old number, so the briefing is honest the morning after a break.
- Stored data is sanitized on every read, so a state edited by hand or damaged never throws: bad values fall back to empty ones and counts are capped at 99999.

## Share text

On the sprint end screen `window.shareText` is wrapped to produce, for example: "Sprint of the day 2026-10-30 in Agent Brawl: cleared as Dot against Muse (win without blocking, no meter). Streak: 3 days." Outside a sprint the engine's own text is used. The link is still the engine's SHARE ON X intent; nothing is sent by the game itself.

## Testing

`tools/tests/x-p-daily.mjs` (about 130 checks) covers:

- the date functions (local date, day numbers across leap days and the daylight saving changes, previous day, labels);
- the hash and the generator, the pinned plans of three days, and a survey of 700 days (valid plans, no clash, every fighter, arena, modifier and goal comes up);
- every goal at its limit, and the streak rules as a table (first clear, next day, retry, gap, miss, loss, old day, month end, leap day, clock changes, trimming, bad arguments, junk and huge stored values);
- the title entry and the briefing (content, keys, a tap on BACK or elsewhere, the date changing while it is open);
- the fixed rules against changed options, and that nothing leaks after a sprint or when another mode takes over;
- every modifier measured against a baseline hit, and the stats counted from real inputs (walk is not a jump, jump, hit, take a hit, block, knockdown, throw, special, super, the CPU's events never counted);
- a six day streak played through to the result cards (cleared, retry, goal missed, lost, gap, share text) and a damaged stored state.

Matches are fast-forwarded with `step()` under a seeded random generator that exists only while stepping, and rounds are decided with `game.koBy`. Run just this file with the headless runner, or everything with `node tools/headless.mjs --test`.

## Notes for integration

- The title menu already holds many modes; this entry makes it longer. A submenu for the "play a challenge" group would help.
- `SETTINGS.reset()` with no key also wipes `daily.state` (it wipes every stored setting). That is the engine's behaviour, not something the feature can guard against.
- The page-level `pointerdown` handler on the canvas exists only to pick BACK before the engine turns a tap into Enter.
