// Renders the install icons from the built game into icons/: icon-512.png, icon-192.png, apple-touch-icon.png (180x180) and icon-maskable-512.png.
// The picture is full bleed (an arena, the logo, two fighters). The maskable one keeps everything inside the central circle that launchers may crop to.
// Run after node build.mjs: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// file name -> [pixels, how much the logo and fighters are shrunk towards the middle (1 = full size)]
const ICONS = { 'icon-512.png': [512, 1], 'icon-192.png': [192, 1], 'apple-touch-icon.png': [180, 1], 'icon-maskable-512.png': [512, 0.78] };

const urls = await withPage(async p => {
  await p.goto('file://' + path.join(ROOT, 'index.html'));
  await p.wait(300);
  const out = await p.eval(`(() => {
    hold(true);
    const icons = ${JSON.stringify(ICONS)}, res = {}, cache = {};
    function compose(k) {   // a 512x512 picture; k < 1 pulls the foreground in from the edges
      if (cache[k]) return cache[k];
      const big = document.createElement('canvas'); big.width = 512; big.height = 512; const c = big.getContext('2d');
      c.fillStyle = '#050304'; c.fillRect(0, 0, 512, 512);
      c.save(); c.beginPath(); c.rect(0, 0, 512, 512); c.clip(); c.translate(-250, -60); c.scale(1.2, 1.2);   // the arena, cropped to a square around its middle
      drawArena(c, ARENAS.findIndex(a => a.id === 'cathedral'), 600, { x: 0, zoom: 1 }); c.restore();
      const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(5,3,4,0.7)'); g.addColorStop(0.5, 'rgba(5,3,4,0.35)'); g.addColorStop(1, 'rgba(5,3,4,0.6)');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.save(); c.translate(256, 256); c.scale(k, k); c.translate(-256, -256);
      drawLogo(c, 256, 192, 0.6, 0);
      drawSprite(c, 'tibo', 'idle', 0, 142, 470, 1, 1.9);
      drawSprite(c, 'wang', 'idle', 0, 370, 470, -1, 1.9);
      c.restore();
      return cache[k] = big;
    }
    for (const name in icons) {
      const [s, k] = icons[name], big = compose(k), o = document.createElement('canvas'); o.width = s; o.height = s; const x = o.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(big, 0, 0, s, s);
      res[name] = o.toDataURL('image/png');
    }
    return res;
  })()`);
  const errs = p.errors.filter(e => !/Failed to load resource/.test(e));   // the very first run has no icons/ to load yet
  if (errs.length) throw new Error(errs.join('\n'));
  return out;
});
fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
for (const [name, url] of Object.entries(urls)) {
  fs.writeFileSync(path.join(ROOT, 'icons', name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote icons/' + name);
}
