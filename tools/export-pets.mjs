// Exports the five fighters as Codex desktop pets (v2 atlas format, no image generation needed).
// Writes pets/<id>/pet.json + spritesheet.png; with --install also copies them to ~/.codex/pets/brawl-<id>/.
// Run: node tools/export-pets.mjs [--install]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Parody characters. The only real-world affiliations named are the ones the game itself shows: Tibo at Codex (OpenAI), Dot as a nod to OpenAI's
// dots, Alexandr Wang at Meta and Muse as a nod to Meta's agent. Poteto gets a gag description and no affiliation. Keep in step with the
// ROSTER bios in game.js and with the "description" in pets/<id>/pet.json.
const INFO = {
  tibo: 'Hoodie-wearing parody of Tibo from Codex at OpenAI. Fights with commits, hotfixes and reverts.',
  poteto: 'Grok bot. Long-haired fighter in round glasses who throws hot sweet potatoes.',
  dot: "Fuzzy yellow pom-pom in round glasses and a bow tie, a parody of OpenAI's dots. Fast but fragile.",
  wang: 'Parody of Alexandr Wang at Meta. Calm, with iridescent bubbles and lab drones.',
  muse: "Fluffy cream-pink hooded plush, a parody of Meta's agent. Pings, undoes and swarms.",
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
