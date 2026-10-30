# p-voice: banter, win quotes and announcer callouts

Owner: the p-voice agent. Code: `p-voice.js`. Tests: `tools/tests/x-p-voice.mjs`. Shared edits: one script line at the end of `dev.html`, rows in `docs/ARCHITECTURE.md`, one line in `README.md`, and one small engine hook in `hud.js` (`ANNOUNCER.define`, see the end of this file).

The feature is built on the extension layer (BUS events, HOOKS points, SETTINGS) and on the existing speech-synthesis announcer. It makes no network requests and uses no audio files: every voice line is the browser's own `speechSynthesis`, through `ANNOUNCER.say`. All timing runs on the 60 Hz tick, never on wall-clock time, so the tests can drive it with `step(n)`.

## What the player sees and hears

**VS banter.** On the VS screen the two fighters trade one line each, in speech bubbles in the top band: the opener at VS tick 4 and the reply at VS tick 56. Each bubble types itself out. There are 15 pairings (the 10 matchups plus the 5 mirror matches), each with two exchanges. The exchange is picked from the pairing and the match count, so it changes from one match to the next. In a mirror match the side that opens alternates.

**Announcer callouts.** During a round a tag slides in from the side of the fighter it is about, with a small flavour line under it, and fades after about 2 seconds. At most two show at once.

| Callout | When |
| --- | --- |
| FIRST HIT | the first clean hit of each round |
| COUNTER | a hit on a fighter in the middle of their own attack (attack state, no contact yet, not guarding); at most one every 4 seconds |
| COMEBACK | the round winner was at least 40% of the health bar behind at some point in the round (KO or time) |
| LAST SECOND | the KO lands with 3 seconds or less on the clock (not with the infinite clock) |

Callouts are off in training mode.

**Win quotes.** When the match is won, the winner's quote is captioned under the winner call, and the end screen of the two versus modes shows it in a speech bubble on the right, below the title lines (y 196 and down), so the left column (OKR toast, MATCH REPORT button, KO CLIP panel) stays clear. Other modes draw their own panels on the end screen, so the bubble is left out there. Each fighter has four general lines and one line for each opponent; the pick alternates between the two kinds.

**Voices.** Each fighter speaks with their own pitch and rate; callouts use a low announcer voice with the whoosh stinger. Names and acronyms are spelled for the speech engine (for example LGTM is read letter by letter).

**Captions are always on.** Every line is drawn on screen in the pixel font, in capitals, whatever the voice setting.

## Speech and the engine announcer

The engine announcer always wins. `p-voice.js` wraps `ANNOUNCER.say`: when the engine says something (FIGHT, the arena name, the winner call, and so on) the feature notes an estimated end time and holds its own queued lines until then. A queued line has a deadline and a set of phases; if it cannot start in time, or the phase moved on, it is dropped and stays a caption.

On the VS screen the engine names the arena at tick 110 and cancels any speech. The opener is spoken at tick 4 and its tail can be cut by the arena call. The reply is spoken only when its estimated length ends before tick 110, so in practice it is usually a caption only.

## Settings and keys

| Key | Label | Effect when off |
| --- | --- | --- |
| `voice.speech` | VOICE LINES | no banter, callout or quote is spoken; a line that is playing is cut; captions stay |

The pause menu has an item for it: `V VOICE LINES ON` / `V VOICE LINES OFF`, toggled with V. The engine announcer and its own setting (`announcer`) are not changed. The general mute (M) also silences voice lines, because they go through the same announcer.

## Content rules

The jokes are about AI tools and developer culture only: code review, flaky tests, stand-ups, prompts, context windows, deploys on Friday. No line is about a real person's private life, and no line states a fact about a real person. The roster is fixed (Tibo, Poteto, Dot, Wang, Muse). Every caption is ASCII and drawable in the pixel font; the tests check the glyphs and the banned phrase list.

## Hooks and events used

- BUS: `match:start` (build the VS exchange), `phase` (clear on title and select), `round:start`, `hit`, `block`, `ko`, `round:end`, `match:end`, `settings`.
- HOOKS: `update` (own clock, which stops in pause; comeback tracking; speech queue), `damage` at order 110 (reads the victim state before the hit lands, never changes the hit), `drawTop` at order 20 (bubbles, callouts, quotes), `pauseItems` (the N toggle).
- SETTINGS: `voice.speech`.

## Engine edit: ANNOUNCER.define (hud.js)

One line in the ANNOUNCER closure in `hud.js`: `ANNOUNCER.define(key, mk)` adds a phrase maker, where `mk(arg)` returns `{ text, pitch, rate, st }` like the built-in phrases. Without it a feature cannot speak a line of its own through the announcer (the phrase table is private). `p-voice.js` registers `voice.tibo`, `voice.poteto`, `voice.dot`, `voice.wang`, `voice.muse` and `voice.call`.

## Public API (for tests)

`window.VOICE`: the line tables (`BANTER`, `WIN`, `WIN_VS`, `CALLS`, `VOICES`), the constants (`C`), the pickers (`banterFor`, `winQuote`), `wrap`, `est`, `spoken`, `lines()` (every caption in capitals), `callout`, `speechOn`, `toggle` and `state()`.

## How to test

`node build.mjs`, then `node tools/headless.mjs --test`. The checks in `tools/tests/x-p-voice.mjs` cover the line tables (all pairings, wrap widths, glyphs, banned phrases), the VS timing of captions and speech, each callout and its conditions, the win quote on the winner call and the end screen, the gating behind the engine announcer, the setting with captions still on, cutting a line mid-way, and the pause toggle.
