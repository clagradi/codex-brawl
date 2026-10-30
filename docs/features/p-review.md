# Match code review (p-review.js)

After a one-player match against the CPU, a parody pull-request review covers the end screen. It shows 3 to 5 review comments about how you played and a verdict: APPROVED or CHANGES REQUESTED. The comments come from what happened in the match (blocks, specials, throws, combos, knockdowns, time-outs, pauses), so the same match always gets the same review. Nothing is random.

## What it looks like

- Header: `PULL REQUEST #nnn`, a title (`FEAT: BEAT DOT 2-1` after a win, `WIP: LOST TO DOT 1-2` after a loss), and the damage you dealt in green and took in red, like a diff (`+164 -88`).
- A meta line: `TIBO WANTS TO MERGE 3 ROUNDS INTO MAIN. REVIEWER: LINT-BOT`. The reviewer is a made-up bot. No fighter or real person is quoted.
- Comment cards, one every 14 ticks. Each has a tag (BLOCKING red, SUGGESTION blue, QUESTION purple, NIT grey, PRAISE green), a joke file reference such as `GUARD.JS:L12` and one or two lines of text. The cards are sorted by severity.
- A stamp with the verdict, a one-line summary (`LGTM! SHIP IT.`, `WORKS ON MY MACHINE. FIX 2 BLOCKING ISSUES FIRST.`, ...) and the key hint.
- Once the review is closed, a small badge with the verdict stays in the top-left corner of the end screen.

All text is ASCII capitals in the pixel font. The art and the sounds (a blip for each comment, a chime or a thud for the stamp) are made in code.

## Keys

| While the review is open | |
| --- | --- |
| `Enter`, `Space`, punch (touch: SELECT) | the first press skips the animation; the next one closes the review. Presses in the first 12 ticks are ignored, so a button still held from the fight does not skip the review |
| `R` or P1's super key | rematch, as on the end screen |
| `Esc` | title |
| `T` | share on X, as on the end screen. The SHARE ON X link is hidden while the review covers it and comes back when it closes |

On the end screen, after the review is closed, P1's special key (`L`, or `C` in 1P) opens it again, fully drawn. `Enter` then goes to the select screen as before.

## When it shows

Only when all of these are true:

- `SETTINGS.get('review.on')` is not `false`.
- `game.mode === 1` and the match was in a mode listed in `REVIEW.modes` (a `Set`, by default only `'versus'`). Arcade, survival, team, tournament and king of the hill have their own end screens. The integrator can add a mode with `REVIEW.modes.add(id)` if its end screen is the engine's.
- Exactly one side of the finished match is human. CPU against CPU (the demo) and two humans get no review.
- The match really ended: `match:end` fired, then the phase became `'over'`. An end screen set directly by a test (`game.phase = 'over'`) shows nothing.

## The rules

H is the human's counts. Comments are listed with BLOCKING first.

| Tag | Id | When | Says (gist) |
| --- | --- | --- | --- |
| BLOCKING | lost | the match was lost | CI is red, the score, do not merge |
| BLOCKING | idle | H landed 2 hits or fewer | the PR is mostly whitespace |
| BLOCKING | noblock | 0 blocks and 4 or more hits taken | every request went to prod unvalidated |
| BLOCKING | spam | 4 or more specials, one of them 60% or more | names the move: copy-paste, extract a helper |
| SUGGESTION | lowblock | some blocks, but under 25% of incoming hits, with 8 or more hits taken | wrap your face in a try/catch |
| SUGGESTION | nospecial | no specials and no supers | you only called PUNCH() (or KICK()) |
| SUGGESTION | fullmeter | no super and a full meter at the end | unused capacity is still billed |
| SUGGESTION | thrown | thrown 3 or more times | untrusted code |
| SUGGESTION | floor | knocked down 3 or more times | retry with exponential backoff |
| QUESTION | timeout | a round ended on the clock | performance regression or a strategy? |
| QUESTION | pause | paused 2 or more times | blocked on a standup? |
| NIT | nothrow | no throws | forward + punch up close is not deprecated |
| NIT | mash | 8 or more hits, 80% or more of them one button | KICK() is documented |
| NIT | onehit | 6 or more hits, none chained | try batching your calls |
| NIT | nosuper | specials but no super, meter not full | the meter is not just a progress bar |
| PRAISE | perfect | a won round with no hits taken | 100% uptime SLA |
| PRAISE | combo | a combo of 4 or more | clean pipeline |
| PRAISE | comeback | won the match after losing round 1 | shipped a hotfix |
| PRAISE | goodblock | 5 or more blocks, 40% or more of incoming hits | solid input validation |
| PRAISE | variety | 3 or more different specials | nice test coverage |
| PRAISE | grabs | 3 or more throws | great use of the GRAB() endpoint |
| PRAISE | finisher | a finisher was performed | deployed on a Friday and nothing broke |

The review takes up to 3 issues (non-praise, most severe first), then the first praise. It fills up to 5 with the remaining matches. If fewer than 3 comments are left, fillers are added (trailing whitespace, a rematch as a regression test, a missing changelog entry). Where a rule has two wordings, the counts pick one.

The verdict is APPROVED only for a win with no BLOCKING comment. A loss is always CHANGES REQUESTED.

## How it works

- **Counts**: every count comes from BUS events, kept for both sides: `hit`, `block`, `knockdown`, `throw`, `special`, `super`, `finisher`, `round:start` / `round:end` (rounds won, time-outs, rounds with no hits taken, who won round 1) and `phase` (pauses during the match). `match:start` resets them.
- **Building**: on `match:end`, if the match qualifies, `REVIEW.build(stats)` builds the review. It is a pure function of plain counts, and every string is prebuilt and wrapped to 62 characters (two lines at most). On the next `phase` change to `'over'`, the review opens. Leaving `'over'` closes it and drops it.
- **Hooks**: `update` at order -40 runs the review clock and reads Enter, Space and punch while it is open, so the end screen does not see those presses. `drawTop` at order 150 draws the panel after the other end-screen layers (the arcade badge row is order 100). On the first frame (before any update) nothing is drawn.
- **Engine**: no edits to `game.js`.

## Settings keys

| Key | Default | Meaning |
| --- | --- | --- |
| `review.on` | `true` | show the review after a 1P match against the CPU |

## Public API

`window.REVIEW`:

- `build(stats)`: a pure function. `stats` is `{ me, foe, won, w, l, rounds, meter, pauses, timeouts, first, H, F }` and the result is `{ pr, title, meta, plus, minus, comments: [{ id, tag, file, text, lines }], approved, verdict, summary }`.
- `stats()`: a copy of the live counts.
- `state()`: `{ open, t, end, pending, data }`.
- `open(data?, skipAnim?)` and `close()`.
- `wrap(text, cols)`, `modes`, `COLS` and `timing`.

`window.STUB_REVIEW` is `1` once the file has loaded.

## Tests

`tools/tests/x-p-review.mjs` checks:

- **The builder**: the no-block, spam, no-throw, loss, clean-win and idle cases. It also runs 400 count combinations and checks each one for 3 to 5 comments, the pixel font's glyph set, at most 2 lines, the verdict rule, no banned names and the same output for the same input.
- **A real 1P match**: the counts come from BUS and the review opens. The test checks the pixels (nothing drawn on frame 0, then the panel, the red or green stamp and the corner badge), the grace period, skip, close, reopen with L, Enter to select, R to rematch (the counts reset) and the SHARE ON X link hidden and shown again.
- **No review**: in 2P, with the CPU on both sides, with `review.on` off, in another mode, or on an end screen set directly.
- **No console errors.**

Run them with `node build.mjs`, then `node tools/headless.mjs --test`.
