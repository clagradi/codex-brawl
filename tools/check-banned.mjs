// Banned-word and roster checker for Agent Brawl. Owner: the x-qa agent. Area: quality tooling (a node tool, not a game script: it is not listed in dev.html).
// What it does: scans every text file of the repo (sources, docs, tools, the built index.html) for the third-party game names and catchphrases the project must never carry,
// and checks the roster rule: exactly the five fighters TIBO, POTETO, DOT, ALEXANDR WANG and MUSE, no fighter called after a potato or a news item, and every X handle field left an empty string.
// Exit code 1 when anything is found, 0 when the repo is clean. Hooks used: none (it only reads files).
// The word list is kept in ROT13 on purpose: this file must pass its own scan, and so must the grep in the core test (tools/test-match.mjs defines the list that test enforces; that one file is exempt here).
// A line can opt out with the marker "check-banned: allow" (for a doc that has to quote a word).
// Usage: node tools/check-banned.mjs [--root DIR] [--verbose] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const rot13 = s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
// Hard list: third-party fighting-game names and catchphrases. Any hit is an error.
const HARD = ['zbegny xbzong', 'sngnyvgl', 'svavfu uvz', 'synjyrff ivpgbel', 'trg bire urer', 'gbnfgl', 'fpbecvba', 'fho-mreb', 'envqra', 'unqbhxra', 'fubelhxra', 'fgerrg svtugre', 'grxxra', 'ononyvgl', 'oehgnyvgl'].map(rot13);
// Watch list: words that are fine alone (the game has a flawless-round banner) but show up in the report so a human can look at them. Never an error.
const WATCH = ['synjyrff'].map(rot13);
const toRegex = w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[-_\\s]?'), 'i');
const HARD_RE = HARD.map(w => ({ word: w, re: toRegex(w) })), WATCH_RE = WATCH.map(w => ({ word: w, re: toRegex(w) }));

export const ROSTER_IDS = ['tibo', 'poteto', 'dot', 'wang', 'muse'];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'shots']);
const SKIP_FILES = new Set(['tools/test-match.mjs']);   // holds the list the core test greps for
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp3|wav|ogg|m4a|mp4|webm|pdf|zip|gz|bin)$/i;
const MAX_BYTES = 4 * 1024 * 1024;

export function listFiles(root) {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name), rel = path.relative(root, full).split(path.sep).join('/');
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); }
      else if (e.isFile() && !BINARY.test(e.name) && !SKIP_FILES.has(rel)) { try { if (fs.statSync(full).size <= MAX_BYTES) out.push(rel); } catch (e2) { /* vanished while scanning */ } }
    }
  };
  walk(root);
  return out.sort();
}

// Scans `root`; returns { files, errors: [{file, line, rule, text}], notes: [...] }.
export function scan(root = ROOT) {
  const files = listFiles(root), errors = [], notes = [];
  const clip = s => s.trim().replace(/\s+/g, ' ').slice(0, 90);
  for (const rel of files) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { continue; }
    if (text.indexOf('\u0000') >= 0) continue;   // binary after all
    const lines = text.split('\n');
    lines.forEach((ln, i) => {
      if (ln.includes('check-banned: allow')) return;
      for (const { word, re } of HARD_RE) if (re.test(ln)) errors.push({ file: rel, line: i + 1, rule: 'banned-word', text: clip(ln) });
      for (const { word, re } of WATCH_RE) if (re.test(ln)) notes.push({ file: rel, line: i + 1, rule: 'watch-word', text: clip(ln) });
      // an X handle that is not an empty string (the owner fills those in; nobody invents one)
      const h = /\bhandle\s*:\s*(['"`])([^'"`]+)\1/.exec(ln);
      if (h && h[2].trim() && !/^\s*(\/\/|\*)/.test(ln)) errors.push({ file: rel, line: i + 1, rule: 'handle-not-empty', text: clip(ln) });
    });
    // fighter definitions: { id: '...', name: '...' } lines of the roster in game.js
    if (rel === 'game.js') {
      const block = /\bconst ROSTER\s*=\s*\[([\s\S]*?)\n\];/.exec(text);
      if (!block) notes.push({ file: rel, line: 1, rule: 'roster-not-found', text: 'could not find "const ROSTER = [ ... ];" to check the roster rule' });
      else {
        const base = text.slice(0, block.index).split('\n').length;
        const ids = [];
        block[1].split('\n').forEach((ln, i) => {
          const m = /\bid\s*:\s*(['"])([^'"]+)\1/.exec(ln);
          if (!m) return;
          ids.push(m[2]);
          const nm = /\bname\s*:\s*(['"])([^'"]+)\1/.exec(ln);
          if (/\b(potato|news)\b/i.test(m[2]) || (nm && /\b(potato|news)\b/i.test(nm[2]))) errors.push({ file: rel, line: base + i, rule: 'roster-forbidden-fighter', text: clip(ln) });
        });
        if (ids.join(',') !== ROSTER_IDS.join(',')) errors.push({ file: rel, line: base, rule: 'roster-ids', text: 'roster ids are [' + ids.join(', ') + '], expected [' + ROSTER_IDS.join(', ') + ']' });
      }
    }
  }
  return { files: files.length, errors, notes };
}

function main() {
  const args = process.argv.slice(2), flag = n => args.includes(n), arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
  const root = path.resolve(arg('--root', ROOT)), r = scan(root);
  if (flag('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(r.errors.length ? 1 : 0); }
  for (const e of r.errors) console.log(`${e.file}:${e.line}: ${e.rule}: ${e.text}`);
  if (flag('--verbose')) for (const n of r.notes) console.log(`${n.file}:${n.line}: note ${n.rule}: ${n.text}`);
  console.log(`check-banned: ${r.files} files scanned, ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}${r.notes.length ? `, ${r.notes.length} note${r.notes.length === 1 ? '' : 's'} (--verbose lists them)` : ''}`);
  process.exit(r.errors.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
