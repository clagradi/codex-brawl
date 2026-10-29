// Renders the 1200x630 share card (og.png in the repo root) from the built game: an arena, the logo and the roster.
// Run after node build.mjs: node tools/make-og.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const url = await withPage(async p => {
  await p.goto('file://' + path.join(ROOT, 'index.html'));
  await p.wait(300);
  const out = await p.eval(`(() => {
    hold(true);
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630; const c = cv.getContext('2d');
    // arena scaled to cover the card, floor near the bottom
    c.save(); c.translate(0, -60); c.scale(1.25, 1.25); drawArena(c, ARENAS.findIndex(a => a.id === 'cathedral'), 600, { x: 0, zoom: 1 }); c.restore();
    const g = c.createLinearGradient(0, 0, 0, 630); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.45, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = g; c.fillRect(0, 0, 1200, 630);
    drawLogo(c, 600, 175, 0.95, 90);
    // the five fighters in a fighting line-up, the middle one in front
    const ids = ['poteto', 'tibo', 'muse', 'wang', 'dot'], xs = [190, 395, 600, 805, 1010];
    ids.forEach((id, i) => drawSprite(c, id, i === 2 ? 'win' : 'idle', 2, xs[i], 600, i < 2 ? 1 : -1, 2.3));
    drawTitleText(c, '1P VS CPU  OR  2P ON ONE KEYBOARD  -  PLAY FREE IN YOUR BROWSER', 600, 352, 22, { align: 'center', style: 'steel', glow: 0.4 });
    return cv.toDataURL('image/png');
  })()`);
  if (p.errors.length) throw new Error(p.errors.join('\n'));
  return out;
});
fs.writeFileSync(path.join(ROOT, 'og.png'), Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote og.png');
