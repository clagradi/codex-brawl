# Alternate colourways (palettes.js)

Every fighter has four colourways: the classic look and three alternates. Each fighter also has one special star colourway that opens after a win. Clothes and accents change; face, hair, skin and the drawing itself stay the same, so each fighter is still easy to recognise.

## What you can pick

| Fighter | Classic | Alternates | Star colourway |
| --- | --- | --- | --- |
| Tibo | CLASSIC | EMBER, MINT, VIOLET | GOLD RUSH |
| Poteto | CLASSIC | ROSE, SKY, FOREST | MIDNIGHT |
| Dot | CLASSIC | BERRY, MINT, BLUEBERRY | COSMIC |
| Wang | CLASSIC | CRIMSON, TEAL, AMBER | OBSIDIAN |
| Muse | CLASSIC | LILAC, MINT, SKY | NIGHT |

## How to use it

On the character select screen, press the special key to cycle the colourway of the fighter under your cursor:

- one-player game: L or C for player 1; after player 1 has confirmed, the same key dresses the opponent
- two-player game: L for player 1 and NUM3 (or Slash) for player 2
- gamepad: the X button; touch: the SP button

Four swatches (five once the star colourway is open) sit in the outer bottom corner of each side panel, with the key name above them and the colourway name below. The ring marks the colourway in use. A side that has already confirmed no longer cycles. No new global key was added; the select screen already shows the key and the colourway name.

Each player remembers the last colourway picked for each fighter, so Tibo can stay in EMBER while Dot stays on CLASSIC. The choices are stored in the settings (see below) and survive a reload.

## Mirror matches

When both players pick the same fighter and the same colourway, player 2 automatically takes the next colourway, so the two fighters can always be told apart. If player 1 has picked a colourway, cycling player 2 skips it. Player 2's own remembered pick is kept; only the displayed colourway is shifted for that match.

## The star colourway

Win a match with a fighter as a human player (a computer-controlled winner does not count) and the star colourway of that fighter opens. The end screen shows "STAR COLOURWAY UNLOCKED" with its name. Until then the last swatch is a dim slot with an outline star and the select screen says "WIN TO UNLOCK *". An open star swatch carries a small gold star. The unlocks are stored locally in the browser.

## Where the colourway shows

The chosen colourway is used everywhere that fighter is drawn: the fight, the HUD portraits and head icons, the versus screen, the end screen, the character select panels and portrait grid, and the title line-up (which uses what player 1 last picked for each fighter). The move list shows text only, so there is nothing to recolour there.

## Settings keys

| Key | Holds |
| --- | --- |
| `palettes.p1` | `{ fighterId: colourwayIndex }` for player 1 |
| `palettes.p2` | the same for player 2 |
| `palettes.unlocked` | `{ fighterId: true }` for each open star colourway |

Index 0 is CLASSIC, 1 to 3 are the alternates and 4 is the star colourway. A stored index that is out of range, or a star index that is not open, is treated as CLASSIC.

## How it works

`palettes.js` is a classic script that loads after `touch.js`. For each fighter it builds the alternate `LOOK` (the same recipe the sprite builder uses, with new garment and accent colours) and pairs the default colour ramps with the alternate ones. That gives an exact colour map. The map is applied to the finished canvases (sheet, extra poses and bust), so the engine does not need to draw anything twice. The recoloured canvases are built on first use and cached (at most ten sets at once, least recently used first; opening the select screen and starting a match warm the ones needed).

`drawSprite`, `drawPortrait`, `drawHeadIcon` and `Fighter.prototype.draw` are wrapped. The wrapper picks the side the draw call belongs to, swaps the recoloured canvas in for that one call and puts the original back. No engine file is edited. The select screen uses the extension layer: a `HOOKS` `update` handler reads the special key, and a `HOOKS` `drawTop` handler draws the swatches and the unlock note. `BUS` events `match:start` (warm the cache) and `match:end` (unlock) complete it.

Public API on `window.PALETTES`: `ways(id)`, `count(id)`, `choice(side)`, `effective(side)`, `set(side, index, id)`, `cycle(side, dir)`, `unlocked(id)`, `unlock(id)`, `look(id, index)`, `entry(id, index)`, `swatch(id, index)`, `swatchRect(side, index)`, `note()`, `clearNote()`, `clashes()`.

## Limits

- The special effect canvases (bolts, bubbles, spuds and so on) keep their colours, and so do any semi-transparent pixels. The sprite sheets contain none today.
- Only colours that the sprite builder derives from the garment and accent fields are mapped, which is what keeps faces and hair unchanged.
- Each set of recoloured canvases takes a few megabytes, which is why the cache is capped.

## Tests

`tools/tests/x-palettes.mjs` checks that every recoloured sheet, extra pose strip and bust is pixel-identical to a direct render with the alternate look; that cycling on the select screen changes the stored colourway, is remembered per fighter and survives a reload; that a mirror match draws two different colourways (compared in pixels on the fight screen and in the portraits); that a human win opens the star colourway and a computer win does not; the swatch strip; and that no console errors appear.
