# p-events: seasonal events

Owner: the p-events agent. Code: `p-events.js`. Tests: `tools/tests/x-p-events.mjs`. Shared edits: one script line in `dev.html` (after `vfx.js`), rows in `docs/ARCHITECTURE.md` (load order, file ownership, the `events.mode` setting, one extension-points note) and one line in `README.md`. `game.js` is not touched.

The game dresses itself for the calendar. Everything is draw-only: the feature never changes a hit, a timer, a health bar or an input, and the tests run the same seeded CPU vs CPU round under every mode to prove the simulation ends in the same state. It does not use `Math.random` (the engine does, for screen shake): decoration is a pure function of a tick counter and a private generator, so a given tick always draws the same picture.

## The events

The window is checked against the local date (month and day, year ignored). Windows that cross New Year work.

| Event | Local dates | In the arena | Other |
| --- | --- | --- | --- |
| Halloween | 20 Oct to 2 Nov | purple tint over the stage, mist band, two faint ghosts, two spiders on silk, six bats, four glowing jack-o'-lanterns on the floor | an occasional big bat flies across the foreground; title tag SPOOKY SEASON |
| Winter holidays | 15 Dec to 6 Jan | frosty tint, a string of blinking coloured lights across the top, two lit trees and snow piles, two layers of falling snow (small and far, big and near) | title tag WINTER LIGHTS |
| New Year | 30 Dec to 2 Jan | firework bursts in the sky (four staggered slots) | every KO throws 90 confetti pieces at the loser and 40 at the winner, with a short rain from the top of the screen; title tag HAPPY NEW YEAR |
| April Fools | 1 Apr | nothing in the arena | the announcer gets silly: each line shows a caption under the health bars and plays a slide whistle, and the spoken words are swapped for a silly version in a higher, quicker voice |

Winter and New Year overlap from 30 Dec to 6 Jan and both show. The props (jack-o'-lanterns, trees, snow piles) are left out on the title screen so the menu stays easy to read; the tint, bats and snow still show there. The title screen also prints the active event names at the top left.

Reduce flash (an existing option) makes the lights steady and the confetti and fireworks softer (50 + 20 pieces instead of 90 + 40).

## Controls and setting

One setting, `events.mode`, saved with the other options: `auto` (default, follow the date), `off` (no events at all), or `halloween`, `winter`, `newyear`, `april` (force that event on any date).

- In the pause screen, `N` cycles the mode; the label under the pause text reads `N EVENTS AUTO`, `N EVENTS OFF`, `N EVENTS HALLOWEEN` and so on.
- `#events=<mode>` in the URL hash overrides the mode for that visit only and saves nothing. The first `N` press after that continues the cycle from the override and saves the new mode. Unknown values are ignored.

## April 1: the silly announcer

`ANNOUNCER.say(key, arg)` is wrapped. When April 1 is active and the original call goes through (not muted, not dropped as a duplicate), the feature picks a silly line for that key (every announcer phrase has two or three variants, chosen in rotation), shows its capitals version as a caption for about three seconds and plays a short falling sine whistle through the engine's own `beep`. `speechSynthesis.speak` is wrapped so the utterance queued by that call carries the silly words, pitch 1.65 and rate 1.12. Fighter and arena names pass through unchanged. If the browser has no speech engine only the caption and whistle remain.

## Testing aids

`window.EVENTS` is a small public object for tests and other files: `active()`, `has(id)`, `activeOn(month, day)`, `mode()`, `setMode(mode)`, `cycle()`, `setDate(month, day)` (pin the date; `setDate(null)` goes back to the real one), `silly(key, arg, n)`, `burst(x, y, n)`, `clear()` and `state()` (clock, confetti count, caption, whistle count, last spoken line and so on). The tests pin both the date and the mode because the suite runs on the real date, which can sit inside a window.

## Tests

`tools/tests/x-p-events.mjs` runs after `core.mjs`. It checks:

- the file loaded, the setting default, the pause item and ASCII capitals in every on-screen title;
- the windows edge to edge: 19/20 Oct, 2/3 Nov, 14/15 Dec, 29/30 Dec, 2/3 Jan, 6/7 Jan, 29 Feb, 31 Mar to 2 Apr and a summer day;
- mode resolution: auto follows the date, off beats the date, a forced mode ignores it, unknown values are ignored, the real date is used when none is pinned, `SETTINGS.set` takes effect at once, cycle wraps;
- the pause key N and that the animation clock stands still while paused;
- the draw-only rule: a seeded CPU vs CPU round reaches the same end state under off, Halloween, winter, New Year, April and auto;
- pictures: Halloween, winter and New Year each change the arena, April does not until the announcer speaks, auto on a summer day draws nothing, the title screen shows the season;
- confetti: 130 pieces on a New Year KO (70 with reduce flash), none on other days, cap of 300, falls and then is gone, a new match clears it;
- April: every announcer phrase has capitals-and-ASCII silly lines, captions and whistles only on April 1, no double whistle for a dropped duplicate, silence when muted, the caption is drawn and fades out, and the spoken words are swapped (where the browser has speech);
- the URL hash override and that the chosen mode survives a reload.

## Known limits

- Dates use the player's local clock, so a game left open across midnight changes at the next once-a-second check.
- Only the engine's arenas and the extra ones that go through `drawArena` and `drawArenaFront` get the dressing. A scene that draws its own background without those functions is left plain.
- The silly spoken text is spoken only if the browser lets `speechSynthesis.speak` through; the captions do not depend on it.
