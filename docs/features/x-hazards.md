# X-HAZARDS: arena objects and stage finishes

Owner: the x-hazards agent. Code: `hazards.js`. Test: `tools/tests/x-hazards.mjs`.

Every arena now has one object near a stage edge that a fighter can use mid-fight, and one cartoon stage finish that can replace the regular finisher at the end of a match. Nothing here is gory: the loser is thrown off the screen, recycled, rate limited, merged, and so on.

## Arena objects (K + L)

Stand next to the glowing object and press K and L together (within 5 ticks of each other, in either order). Player 2 uses Numpad 2 and Numpad 3 (or Period and Slash). A small K+L prompt floats above the object while it is ready and a human fighter is close enough.

- The object glows while it is ready. After a use it goes dark and a thin bar shows the cooldown, about six to seven seconds. The cooldown only runs during the fight and resets every round.
- You must be on the ground, standing, walking, blocking or dashing, within reach of the object. A kick, punch or special you have only just started can be cancelled into the object, so pressing K and L slightly apart still works.
- Damage goes through `takeHit`, so every object can be blocked, the `damage` hook filter applies, and nothing ignores blocking.
- The CPU does not use the objects. (A CPU fighter using them is cut from this first version.)

| Arena | Object | What it does | Side |
| --- | --- | --- | --- |
| gpupit | GPU THROW | Lobs a GPU at the foe, blast on landing | left |
| cathedral | BELL ROPE | Swings on the rope into a jump kick | right |
| bridge | RATE LIMITER | Barrier dash that bounces the foe back with a 429 | left |
| furnace | STEAM VENT | A delayed steam burst under the foe | right |
| forest | FALLING SIGN | A DEPRECATED sign drops on the foe | left |
| temple | GONG | A shockwave rolls across the floor | right |
| graveyard | TOMBSTONE | A tombstone slides along the ground | left |
| rooftop | AC UNIT | A cold front blows across the roof | right |
| wasteland | POTATO SACK | Three lobbed potatoes | left |
| any other arena | CRATE | A lobbed crate (the generic fallback) | left |

## Stage finishes (DOWN + SUPER)

When FINISH IT! is up, hold DOWN and press SUPER (I, or punch and kick together; Player 2 uses Numpad 0 or Shift Right) while the loser is within reach of the arena's finish spot. The regular finisher is replaced by that arena's stage finish. Pressing SUPER without DOWN, or with the loser out of reach, plays the regular finisher exactly as before. The CPU never picks a stage finish.

A stage finish reuses the engine's finisher flow: the banner, the `finisher` event, the camera, and the normal round and match end all apply. The match ends as usual after it.

| Arena | Stage finish |
| --- | --- |
| gpupit | OOM KILLED |
| cathedral | BELL CURVED |
| bridge | 429 RATE LIMITED |
| furnace | RECYCLED INTO A CHIP |
| forest | SUNSET NOTICE |
| temple | MERGE CONFLICT |
| graveyard | GARBAGE COLLECTED |
| rooftop | SHIPPED TO PROD |
| wasteland | HASH BROWNED |
| any other arena | FORCE PUSH (at the nearest stage edge) |

While FINISH IT! is up and the loser is in reach, a `DOWN + SUPER: <name>` hint shows under the banner for a human winner.

## Registry

```js
HAZARDS.register(arenaId, {
  name: 'GPU THROW',          // shown in the popup
  x: 96,                      // object position (clamped to 60..W-60)
  h: 60,                      // object height, used to place the prompt
  reach: 70,                  // how close a fighter must stand
  cool: 400,                  // cooldown in ticks
  draw(c, o) {},              // paint at the object's feet (0,0); o = { t, ready, flash, cd, x }
  use(user, foe, obj) {},     // do the thing; return false to refuse (no cooldown is spent)
  finish: {                   // optional stage finish
    name: 'OOM KILLED',
    x: 96,                    // finish spot (defaults to the object x); edge: true uses the nearest stage edge
    reach: 260,               // how close the loser must be to the spot
    len: 150,                 // length in ticks
    keepL: true,              // true: the loser stays out of sight after the finish; false: shown as KO
    tick(S, t, winner, loser) {},          // optional, runs every tick of the finish
    scene(c, S, t, draw, winner, loser) {} // paints the scene; draw(c, fighter, opts) draws a fighter sprite
  }
});
```

- A later `register` for the same arena replaces the earlier one, even mid-fight.
- An arena without an entry falls back to the `generic` object and the FORCE PUSH finish.
- Files loaded before `hazards.js` can queue a registration with `window.HAZARD_QUEUE = []; HAZARD_QUEUE.push([arenaId, spec])`. When `hazards.js` loads it drains the array and replaces it with an object whose `push(...)` registers immediately.
- Helpers for tests and tools: `HAZARDS.get(id)`, `HAZARDS.has(id)`, `HAZARDS.list()`, `HAZARDS.state()` (the mounted object: x, cool, ready, uses), `HAZARDS.stats()` (uses, finishes, broken), `HAZARDS.use(side)` and `HAZARDS.finish(side)`.

## Events and hooks

- BUS `hazard` is emitted for every use, with `{ id, name, user, foe }`.
- BUS `stagefinish` is emitted when a stage finish starts, with `{ id, name, winner, loser }`.
- Hook points used: `input` (the K+L chord and the DOWN + SUPER trigger), `update` (mounting the arena object, the cooldown) and `drawHud` (the stage finish hint). No new settings keys and nothing is stored outside `SETTINGS`.
- Outside a fight (title, select, menus) the hooks only compare a few numbers and return, so the file costs nothing while idle.

## Trying it

Force an arena with a hash: `index.html#demo=0,1&arena=2&stop` loads the bridge with Tibo and Poteto, paused on the frame loop so you can call `step(n)` from the console. Arena indexes are 0 gpupit, 1 cathedral, 2 bridge, 3 furnace, 4 forest, 5 temple, 6 graveyard, 7 rooftop, 8 wasteland.

To see a stage finish quickly: win the last round, wait for FINISH IT!, walk the loser to the finish spot (the same edge as the object), then hold DOWN and press SUPER.
