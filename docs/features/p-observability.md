# p-observability: the post-match KPI dashboard

Owner: the observability agent. Code: `p-observability.js`. Tests: `tools/tests/x-p-observability.mjs`. Shared edits: one script line at the end of `dev.html`, rows in `docs/ARCHITECTURE.md` (load order, file ownership, three settings) and one bullet in `README.md`. `game.js` is not touched.

This is a parody. After a match the fight gets the treatment a production service gets: an observability dashboard with a status banner, KPI rows, a latency-style line chart and an incident log. All the numbers are real match numbers recorded from BUS events. The jokes are only in the captions and the incident wording.

## What the player sees

On the end screen (the engine's `over` phase) a green button appears on the left under the winner banner (below the OKR toast and above the KO CLIP panel): `O  MATCH REPORT`. It is not drawn, and `O` does nothing, while the match code review (p-review) is open; close the review first. Press `O`, or tap the button, and the report opens over the end screen. It fades in over 6 ticks with a short beep, the KPI numbers count up in 24 steps and the incident lines appear one after another, with a blinking cursor after the title.

**Status banner.** One line that reads the winner's remaining health: `ALL SYSTEMS NOMINAL` (60% or more), `DEGRADED PERFORMANCE` (25% to 60%) or `PARTIAL OUTAGE` (below 25%). With no finished match it says `NO MATCH DATA`.

**Damage chart.** A line chart drawn on the game canvas, one line per fighter in the fighter's own colour, with a y axis rounded up to a nice maximum, time ticks on the x axis and a legend. The line is drawn left to right when the report opens (the first 64 ticks), so it reads like a live graph. Two views:

- `TOTAL DAMAGE`: cumulative damage dealt over the match, sampled every second.
- `DAMAGE PER 5S`: damage dealt in a sliding five second window, which is the "load" view and shows who owned which stretch of the fight.

Switch views with Left/Right, `A`/`D`, `Tab`, or by tapping the chart.

**KPI rows.** Each row shows both fighters side by side with a bar and a number:

| KPI | How it is measured |
| --- | --- |
| `HIT ACCURACY` | attacks that connected divided by attacks thrown. An attack is a new attack state in `fighterUpdate` (or the same state restarting) plus every `throw` event. Each attack counts as connected at most once, even if it hits on several frames |
| `BLOCKS` | `block` events where the fighter was the victim, so hits the fighter deflected |
| `SPECIALS USED` | `special` plus `super` events by the fighter |
| `MAX COMBO` | the longest run of hits in a row without a gap, read from the `hit` events |
| `UPTIME %` | fight ticks where the fighter was on their feet and in control, not in a hurt, hit, down, dizzy, grabbed or KO state. The caption jokes about a 99.9% SLA |

**Incident log.** Up to five lines with a severity tag, a timestamp and a plain sentence: `INFO` for the first hit, `SEV-2` for the biggest single hit (with the move kind when it was a special, super or throw), `SEV-1` for the longest combo, `OK` for a quiet stretch of three seconds or more without a hit, and `DONE` for the result with the round count and `POSTMORTEM: NONE`.

**Fleet totals.** A footer line under the log carries totals across all matches on this device: matches, total damage and total hits. They are kept in the `observability.fleet` setting, so they survive a reload through the settings store and nothing leaves the device. A finished match is added to the totals in memory at once but written to the store only when the end screen is left (rematch, menu) or the page is hidden, so the match itself never produces an extra `settings` event.

## Closing the report

`O`, `Esc`, `Enter`, `Space` or a punch button closes it, as does the `BACK` button. The end screen is untouched underneath: the report only draws over it, and its keys are swallowed while it is open so a closing key does not also restart the match. `R` is deliberately not swallowed, so the usual rematch key still works from inside the report. Any phase change (a rematch, the menu) closes it.

## Settings

All three live in the SETTINGS store under the `observability.` prefix.

| Key | Default | Effect |
| --- | --- | --- |
| `observability.enabled` | on | label `MATCH REPORT`. Off hides the button and ignores the `O` key |
| `observability.auto` | off | label `OPEN REPORT AT END`. On opens the report by itself when the end screen appears |
| `observability.fleet` | `{ m: 0, d: 0, h: 0 }` | label `FLEET TOTALS`. The running match, damage and hit totals shown in the footer, written when the end screen is left. Reset the setting to clear them |

## Inputs

| Input | Where | Effect |
| --- | --- | --- |
| `O` | end screen | open the report |
| `O`, `Esc`, `Enter`, `Space`, punch | report | close |
| Left, Right, `A`, `D`, `Tab` | report | switch the chart view |
| tap the O button | end screen | open (the tap is not passed on to the KO CLIP panel) |
| tap the chart | report | switch view |
| tap `BACK` | report | close |

On a touch layout the right edge of the report is clamped to the touch button column, so nothing draws under the buttons, and every tap target is inflated to at least 40 CSS pixels.

## How it plugs in

- BUS: `match:start`, `round:start`, `round:end`, `hit`, `block`, `special`, `super`, `throw`, `match:end`, `phase`, `settings`.
- HOOKS: `fighterUpdate` (ticks, uptime, attacks thrown), `update` at priority -50 (the match clock, and the report's own keys on the end screen), `drawTop` (the report and the button).
- SETTINGS: the three keys above.
- DOM: one `pointerdown` listener on the canvas, and the engine's `#share` anchor is hidden with `style.visibility` while the report is open so the two do not overlap.

The recorder keeps at most 4000 damage events per match and resets on every `match:start`. Everything is driven by the tick counter, never wall-clock time, so `step(n)` reproduces a report exactly. Text goes through the pixel font in capitals, ASCII only, and the chart is plain canvas drawing.

## Public API

`window.OBS` is there for tests and other feature files: `state()`, `kpis()`, `series(view)`, `incidents()`, `status()`, `open()`, `close()`, `nextView()`, `tap(x, y, scale)`, `fleet()` (stored plus pending totals), `flushFleet()`, `isOpen()`, `button()`, `layout()`, `enabled()`, plus the constants `VIEWS`, `KEY`, `WINDOW`, `REVEAL`, and the helpers `fmtTime` and `niceMax`.

## Testing

`node build.mjs` first (the tests open `index.html`), then `node tools/headless.mjs --test` runs everything, including `tools/tests/x-p-observability.mjs`. That file covers the recorder against an independent BUS listener (so combat damage scaling does not matter), the accuracy and uptime definitions, the chart series for both views, the incident log, the fleet totals, opening and closing by key and by tap, the three settings, and real canvas pixel checks for the button, the report and the chart lines.

## Known limits

- The report is only reachable where the engine shows its `over` phase. A mode that replaces the end screen with its own (arcade, for example) will not offer the button.
- `O` is a plain key with no modifier. If a parallel feature also claims `O` on the end screen, the one that runs first in the `update` hook wins. The key is a single constant (`OPEN_KEY`) at the top of the file.
- Accuracy is inferred from attack states because the engine has no whiff event. A move that the engine animates as an attack but that never reaches the hit check counts as thrown, which is the intended meaning.
- Combo and damage numbers are whatever the engine reports, so they follow combat scaling and the active mode.
