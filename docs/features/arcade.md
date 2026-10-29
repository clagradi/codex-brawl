# Arcade, survival, stats and unlocks

Everything lives in `arcade.js` (one IIFE, classic script, no other file). It talks to the game only through the extension layer
(`BUS`, `HOOKS`, `SETTINGS`, `MODES`), so `game.js` is untouched. Tests: `tools/tests/arcade.mjs`, run by `node tools/headless.mjs --test`.

## What the player gets

Title menu (first to last): `ARCADE`, `SURVIVAL`, `1 PLAYER VS CPU`, `2 PLAYERS`, `STATS` (plus entries from other feature files).
`ARCADE` and `SURVIVAL` are `MODES` entries (ids `arcade` order 5, `survival` order 6) whose `onPick` opens our own select screen and returns `false`
so the engine stays on the title. `STATS` is a `titleItems` hook entry (order 30).

### Select screen (arcade and survival)

| Key | Action |
| --- | --- |
| A / D or left / right | choose the fighter |
| W / S or up / down | choose the difficulty: EASY, NORMAL, HARD, NIGHTMARE |
| J, Enter, Space, Z, Numpad 1 | start the run |
| K, Esc, X, Numpad 2 | back to the title |

The chosen difficulty is written to the `difficulty` setting, so the engine settings screen shows it too.

### Difficulty tiers

`SETTINGS.define('difficulty', ...)` re-declares the core key with four values (same key, so the core test still sees exactly nine keys) and
`DIFFICULTY.nightmare = [0.95, 0.3]` is added to the engine table (`[CPU level at the start, added per round]`). The extra behaviour is a
low-order `input` filter that only touches CPU fighters:

- EASY: the CPU acts on what it saw 10 ticks ago and never cancels into specials or supers.
- NORMAL and HARD: the engine's own CPU, using the engine `DIFFICULTY` levels.
- NIGHTMARE: near perfect guard, punishes recovery frames, cancels into specials and spends its meter.

### Arcade ladder

- Five stages: the other four fighters in random order, each on a random arena, then the boss.
- Boss: an overclocked mirror of the fighter you picked: `<NAME> (OVERCLOCKED)`, +15% speed and damage, red aura, level +0.1.
  The roster entry itself is never changed: the copy is installed in the `match:start` handler.
- CPU level also rises by 0.05 per stage.
- Ladder screen between fights: five portraits, won fights marked `WON`, the next rival with a one-line taunt and the arena name.
  Any button fights, Esc leaves the run.
- Losing opens `CONTINUE?` with a 10 second countdown (600 ticks). Any button continues (the ladder is kept, the fight starts again),
  Esc or a timeout goes back to the title. The run counts its continues.
- Clearing the ladder records the clear for that difficulty, then plays the ending and the credits.

### Endings and credits

Each fighter has an ending of three text cards (portrait on the left, typed text on the right). The cards are written in the game's own words:
jokes about AI and developer culture, nothing about real people. Enter types the card out, then advances; a finished card advances by itself after
a few seconds; Esc jumps to the credits. The credits scroll the game name, "art, code and music generated in code" and the roster;
Enter or Esc skips them. Both end on the title.

### Survival

- Endless fights against random rivals (never the same one twice in a row) on random arenas.
- One deciding round per fight (the engine round wins are preset to one short of the target).
- Your health carries over to the next fight with a 25% heal (capped at full), and the super meter is kept.
- The CPU level rises by 0.04 per win, up to +0.35.
- Score per win: `1000 + round(health percent) x 3 + seconds left x 3`. The break screen between fights continues on any button or after
  4 seconds; Esc cashes out.
- Losing (or cashing out) shows `GAME OVER`. A score in the top 10 asks for 3 letter initials:
  W / S changes the letter, A / D moves, a confirm press moves on and the third one saves. Then the top 10 table is shown (any button leaves).

### Stats and badges

`STATS` shows wins and losses per fighter, best combo, best survival run (score and wins), matches played, ladder clears per
difficulty and the badge wall. Every finished match counts, CPU against CPU demo matches (`#demo=0,1`) included.

| Badge | Earned when |
| --- | --- |
| FIRST BLOOD | you win your first match |
| LADDER CLIMBER | you clear the arcade ladder |
| TEN HIT | you land a combo of ten hits |
| CLEAN MERGE | you win a round without being hit |
| FULL ROSTER | you have won with every fighter |
| UPTIME | you win five fights in one survival run |
| NIGHTMARE FUEL | you clear the ladder on NIGHTMARE |
| HOT FIX | you land a finisher |

A small row of eight badge squares shows on the engine select screen (top left), on the arcade and survival select screens (top left) and
on the end screen (bottom centre). Earning one slides in a toast and emits a `BUS` event:

```
BUS.on('unlock', e => { /* e = { id, name, desc } */ });
```

`unlock` is not in the fixed event list of `docs/ARCHITECTURE.md`; nothing in the core listens to it.

## Storage

All access is wrapped in try/catch and corrupt data falls back to empty.

- `brawl.stats`: `{ f: { <id>: { w, l } }, hw, ends, clears: { easy, normal, hard, nightmare }, badges, combo, surv: { score, wins }, matches }`
- `brawl.survival`: `{ top: [ { n: 'ABC', s: score, w: wins, d: difficulty } ] }`, best first, ten at most.

## How it hooks in

- `MODES.register` x2 (arcade, survival), `HOOKS.add('titleItems')` (stats), `HOOKS.add('input', ..., 50)` (difficulty tiers),
  `HOOKS.add('update')` (reads the keys for our screens and clears them so the title menu never sees them),
  `HOOKS.add('drawTop')` (draws our screens over the engine title, the badge rows and the toast), `HOOKS.add('drawFighter')` (boss aura and label).
- Our screens all run while the engine is in phase `title`. A fight is a normal engine match started with `startMatch()`.
  The `phase` handler turns the engine `over` phase of a run fight into the next ladder, continue, survival or score screen.
- BUS used: `match:start`, `round:start`, `hit`, `round:end`, `finisher`, `match:end`, `phase`. BUS emitted: `unlock`.

## Test API

`window.ARCADE`: `S` (live state), `BADGES`, `DIFFS`, `ENDINGS`, `TAUNT`, `stats()`, `top()`, `qualifies(score)`, `addScore(name, score, wins, diff)`,
`rankOf(score)`, `earn(id)`, `startRun(kind, fighterIndex, difficulty)`, `launchFight()`, `bossDef(fighterIndex)`, `route()`, `reload()`.

## Not done

Bonus stage between ladder fights, an ending gallery on the STATS screen and a boss music theme swap were cut for time.
