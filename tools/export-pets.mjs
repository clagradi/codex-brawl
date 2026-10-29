// Exports the five fighters as Codex desktop pets (v2 atlas format, no image generation needed).
// Writes pets/<id>/pet.json + spritesheet.png; with --install also copies them to ~/.codex/pets/brawl-<id>/.
// Run: node tools/export-pets.mjs [--install]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INFO = {
  tibo: 'Codex engineer in a hoodie who grins through every outage and ships anyway.',
  poteto: 'React Compiler alum who throws hot sweet potatoes at flaky builds.',
  dot: 'Fuzzy yellow ball in round glasses and a bow tie. Surprisingly fast, slightly fragile.',
  wang: 'Calm superintelligence lead who blows iridescent bubbles while the lab runs.',
  muse: 'Fluffy cream-pink hooded plush with bead eyes that runs on its own VM.',
};

const atlas = await withPage(async p => {
  await p.goto('file://' + path.join(ROOT, 'tools', 'pet-export.html'));
  await p.wait(300);
  if (p.errors.length) throw new Error(p.errors.join('\n'));
  return p.eval('window.atlas');
});

for (const [id, url] of Object.entries(atlas)) {
  const dir = path.join(ROOT, 'pets', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'spritesheet.png'), Buffer.from(url.split(',')[1], 'base64'));
  const name = id === 'wang' ? 'Alexandr Wang' : id[0].toUpperCase() + id.slice(1);
  const pet = { id: 'brawl-' + id, displayName: name, description: INFO[id], spriteVersionNumber: 2, spritesheetPath: 'spritesheet.png' };
  fs.writeFileSync(path.join(dir, 'pet.json'), JSON.stringify(pet, null, 2) + '\n');
  if (process.argv.includes('--install')) {
    const dst = path.join(os.homedir(), '.codex', 'pets', pet.id);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ['pet.json', 'spritesheet.png']) fs.copyFileSync(path.join(dir, f), path.join(dst, f));
  }
  console.log('wrote pets/' + id + (process.argv.includes('--install') ? ' and ~/.codex/pets/' + pet.id : ''));
}
