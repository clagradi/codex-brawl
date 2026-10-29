# Six more stages (x-arenas3)

Owner: the arenas3 agent. Files: `arenas3.js`, `tools/tests/x-arenas3.mjs`, this note.

Agent Brawl gets six new fighting stages, each with its own parallax layers, lighting, a foreground layer that passes in front of the fighters, animated details, a thumbnail for the picker and its own procedural chiptune theme. Everything is drawn and synthesised in code (no images, no audio files, no network), in the same half-resolution pixel look as the nine original stages. The jokes are about AI and developer life only.

## How to play them

Nothing new to learn: the stage picker on the select screen already cycles with **Q / E**, and the six new stages follow the nine original ones (RANDOM can now land on any of the fifteen). The picker previews the picked stage live. There are no new keys, buttons or menu entries.

For screenshots and debugging, `index.html#demo=0,1&arena=K` shows stage number K in a CPU-versus-CPU match, with K up to 14 (arenas3.js re-applies the number because game.js reads it before the new stages exist).

## The stages

Each stage has one background reaction: a big hit (11 or more damage, a super, or a hit that is part of a 4+ combo) or a KO makes the scenery react.

| Stage | Look | Reaction | Music |
| --- | --- | --- | --- |
| TECH-DEBT SWAMP | Legacy mainframes sinking into a bog, a rubber duck drifting by, fireflies that are all TODO comments | The fireflies lurch away from the impact | Swamp blues: shuffled E blues scale, wobbling lead, walking bass, brushed backbeat, 84 bpm |
| CACHE MISS CANYON | A red echoing canyon, boulders stamped MISS, a cracked-mud floor laid out as a grid of empty cache cells, a roadside sign | An echo ring and a "MISS" call-out spread from the hit, boulders rattle, dust rains down | Spaghetti-western E phrygian dominant, a twanging lead answered by its own late, quieter echo, 104 bpm |
| OPEN-PLAN OFFICE | A skyline wall, cubicles with glowing monitors, standing desks, a foosball table | Coworkers pop up over the partitions with "OOF" and "?!" bubbles; after a KO they all say "GG" | Office bossa muzak: D dorian, rim-click clave, soft e-piano stabs, a mellow triangle melody, 132 bpm |
| CLOUD BILLING VOLCANO | Lava that arrives as invoices, burning paper, and a pylon with a cost counter that only goes up | A lava geyser at the hit and the counter jumps by the damage; after a KO it reads OVERDUE | Volcano metal: E harmonic minor, galloping low saw, double kick, a shrieking square lead, 172 bpm |
| NIGHTLY BUILD EXPRESS | The roof of a night train: poles, signs and cities rush past, an opposing train and a tunnel go by on a cycle | An arc jumps along the overhead wire with sparks and a flash | Train-rhythm techno: A dorian, four on the floor, 16th hats, off-beat saw bass, a plucked arpeggio, 134 bpm |
| KEYNOTE STAGE | A giant screen that mirrors the live fight (mini fighters, health bars, a ticker), sweeping spotlights in the haze, an audience filming everything | Spotlights snap to the hit, the screen glitches and says OOPS, the crowd's phones flash in a wave; after a KO the screen announces a shipped build and confetti falls | Keynote anthem: B flat major, I-V-vi-IV, organ pads, pumping saw bass, a heroic square lead, stomp and clap, 120 bpm |

When no fight is running (the stage picker thumbnail, the title demo), the keynote screen shows a slide-deck screensaver instead, including a "DEMO LOADING" bar that stalls at 99 percent.

## Under the hood

- `arenas3.js` is a classic script loaded after `touch.js`. Each stage is described once as `{ id, name, tagline, accent, build, paint, front }` and registered by pushing `ARENAS.make(...)` onto `ARENAS`. The thumbnail comes with `ARENAS.make`, so the picker and the title screen get it for free.
- Each theme is registered with `MUSIC.define(id, theme, { trim, arena: true })`, which maps it to the stage with the same id. Trims are tuned so every theme lands inside the house loudness window (-18.5 to -15.5 dBFS RMS).
- The reactions read a tiny clock kept in `ARENAS3.rx`, which is fed by `BUS` events `match:start`, `round:start`, `hit`, `block` (it only remembers where the action is) and `ko`. A stage only stamps and reads ticks (`game.tick`), so replays, pauses and slow motion stay in step.
- `window.ARENAS3 = { ids, rx, themes }` is exposed for tests and for other features that want to know the stage ids.
- Shared files touched: `dev.html` (one `<script>` line after `touch.js`) and `tools/tests/core.mjs` (the load-order check now only looks at the documented prefix, and the stage count check accepts more than nine stages).

## Tests

`tools/tests/x-arenas3.mjs` checks, with fixed ticks and no sleeping on the painters: registration and metadata, theme patterns and loudness, that every stage paints a full, animated frame with parallax, a foreground layer and a thumbnail, that the BUS reactions change the picture, a whole match with every stage (every phase painted, the theme follows the stage), the picker with Q / E, and the `&arena=K` route.

## Known limits

- The keynote screen mirrors the fight at a small scale, and the game's own combo pop-ups can cover part of it.
- The stage list is open-ended: other features may append stages after these six, so look stages up by id, never by index.
