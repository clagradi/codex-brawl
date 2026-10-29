// Build: inline every <script src> of dev.html into a single deployable index.html.
// Usage: node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8');
const out = src
  .replace(/<!--[\s\S]*?-->\n?/g, '')
  .replace(/<script src="([^"]+)"><\/script>/g, (_, file) => {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script>\n// ---- ${file} ----\n${js}\n</script>`;
  });
fs.writeFileSync(path.join(ROOT, 'index.html'), out);
console.log(`index.html written (${(out.length / 1024).toFixed(1)} KB)`);
