# More ways to play locally (modes2.js)

Three extra modes for people sitting at the same screen. They all live in `modes2.js`, appear in the title menu next to 1 PLAYER VS CPU and 2 PLAYERS, and are registered through `MODES.register` (ids `team`, `tournament` and `koth`). The fight itself is the normal engine: same moves, arenas, music and rounds, so everything else in the game (settings, training hooks, the other agents' features) keeps working inside them.

## Title menu entries

| Entry | What it is |
| --- | --- |
| TEAM BATTLE | Three fighters a side, one human against the CPU or two humans. |
| TOURNAMENT | A bracket of 4 or 8 entrants, each human or CPU. |
| KING OF THE HILL | 2 to 8 named players share the controller; the winner stays on. |

Each entry opens its own setup screen instead of the normal character select. The setup screens use the same inputs everywhere: Up/Down (or W/S, or the pad stick) change the row, Left/Right change the value, Enter (or punch) goes to the next field and starts at the end, Esc (or kick) goes back. The hint strip at the bottom of every screen says the same. Gamepads and the touch overlay already produce these key codes, so the screens work with them as well (not tried on real hardware yet).

## Team battle

Setup: a mode row (1 PLAYER VS CPU or 2 PLAYERS), the three slots of each team, and START BATTLE. A team never holds the same fighter twice. In 1 player mode the second team is the CPU team and the player picks it too.

Rules:

- Both sides start with their first fighter. The match is first to three bouts, so losing three bouts puts the whole side out. The stored "rounds to win" setting is not changed; the three comes from memory only for the length of the team battle.
- The winner of a bout stays in with the health it has left plus 20% of its maximum (never above full). The loser is out for good and the next fighter of that team comes in at full health.
- A drawn bout keeps both fighters in with the health they have.
- The HUD shows each side's three fighters as small icons under the name: a gold frame marks the fighter in the ring, fighters already beaten are greyed with a red cross.
- On the end screen Enter goes back to the team setup (new teams) and R rematches with the same teams, first fighters back in.

## Tournament

Setup: the number of entrants (4 or 8), then one row per entrant with the fighter, HUMAN or CPU, and three letters for the name of a human. START TOURNAMENT shows the bracket with names and fighters.

On the bracket the next match to play is highlighted, and the entries depend on who is in it:

- A match with one human is PLAY MATCH. The human is always on the left and plays with the P1 keys. A match with two humans is PLAY MATCH (2 PLAYERS) and uses both key sets.
- A match between two CPUs offers WATCH MATCH (it is played out on screen), SKIP MATCH (it is simulated) or SKIP ALL CPU MATCHES (every CPU match from here on is simulated, up to the next human match).
- Simulated matches are deterministic. They use a seeded generator and a rating made from health, power and speed of the two fighters, never `Math.random`, so a bracket skipped twice with the same seed gives the same champion.
- Esc on the bracket asks to confirm and a second Esc quits the tournament. Quitting a match from the pause menu (Q) returns to the bracket with that match still to play.
- After the final the champion screen shows the winner; Enter goes back to the title.

## King of the hill

Setup: the number of players (2 to 8), then a row per player with a fighter and three letters for the name. Every player is human; they all use the same keyboard or pad and take turns.

The two fighters in the ring use the two key sets: the left side plays with the P1 keys, the right side with the P2 keys (the numpad on a keyboard). Between matches a screen shows who is next, with the queue and everyone's win streak and total wins. The challenger can change fighter there with Left/Right before FIGHT. The winner keeps its side and its fighter, the loser goes to the back of the queue and the next player in line takes the free side. END SESSION shows the final standings with the best streaks. During a match the HUD shows the two names under the health bars and a footer line with the queue and the streaks.

## For integrators and testers

- No new global key is used. Every new input exists only on the three setup screens, the bracket, the between-match screen and the end screens, and each of them prints its own hint strip.
- `window.MODES2` exposes the state for tests: `screen()` returns the id of the open screen or null, `team.{cfg, state(), open(), start()}`, `tournament.{state(), open(), start(cfg), next()}` and `koth.{state(), open(), start(cfg)}`. `tournament.start({ seed, ents: [{ human, f, tag }] })` and `koth.start({ ents: [{ f, tag }] })` skip the setup screens.
- `tools/tests/x-modes2.mjs` plays a team battle, a four-entrant all-CPU tournament and a king of the hill session to the end under a seeded generator, twice each, and compares the runs. It also checks the title entries, the setup screens by key presses, the 20% carry-over rule, and that skipping a bracket does not depend on `Math.random`.
- The title menu now has three more entries. If other features add entries too, the menu may need a submenu; this file does not decide that.
- `roundsToWin()` is lowered to three for team battles by wrapping `SETTINGS.get` (in `modes2.js`) so that `game.js` stays untouched. A `HOOKS.filter` point for the rounds would be the cleaner home for this.
