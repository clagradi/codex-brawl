// Tests for the quality tools (tools/fuzz.mjs, tools/balance.mjs, tools/check-banned.mjs; framedata.mjs is checked by running it, see docs/features/x-qa.md). Owner: the x-qa agent.
// Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test). Deterministic: the page is frozen with hold(true) and only step(n) advances it, nothing waits on the wall clock.
// Hooks used: HOOKS 'input' (the fuzzer's random input stream, plus one deliberate fault to prove the checker bites). The page-side harness is the one tools/fuzz.mjs ships (pageQA).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pageQA, planMatches, reproLine, ROOT } from '../fuzz.mjs';
import { planBalance, analyze, renderMarkdown } from '../balance.mjs';

const rot13 = s => s.replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });

export async function run(t) {
  const { check } = t;
  const fresh = async () => { await t.open(''); await t.eval('(' + pageQA.toString() + ')()'); };
  const go = cfg => t.eval('__qa.run(' + JSON.stringify(cfg) + ')');
  const base = { p1: 'tibo', p2: 'dot', arena: 0, seed: 11, mode: 'human2', maxTicks: 700, render: 150, pauses: false };

  // 1. The fuzz smoke: 700 ticks of two random-input fighters (the intro takes 300, so about 400 ticks of fighting), checked after every tick. Only the budget note (the match is not over yet) may show.
  await fresh();
  const a = await go(base);
  check(a.ticks === 700 && a.violations.length === 1 && a.violations[0].kind === 'budget', 'x-qa: a 700 tick fuzz smoke runs clean, apart from the budget note: ' + JSON.stringify(a.violations).slice(0, 200));
  check(a.phases.fight > 100 && (a.events.phase || 0) >= 2 && typeof a.hash === 'string' && a.hash.length > 0, 'x-qa: the smoke reached the fight and recorded events: ' + JSON.stringify({ phases: a.phases, hash: a.hash }).slice(0, 160));

  // 2. Same seed, same fresh page, same match: the fuzzer's determinism claim.
  await fresh();
  const b = await go(base);
  check(b.hash === a.hash && b.ticks === a.ticks && JSON.stringify(b.events) === JSON.stringify(a.events), 'x-qa: the same seed replays the same match (hash ' + a.hash + ' vs ' + b.hash + ')');

  // 3. The checker bites: a tiny budget is reported, and a deliberate fault (health far above the maximum) is caught.
  await fresh();
  const c = await go({ ...base, maxTicks: 150, render: 0 });
  check(c.violations.length === 1 && c.violations[0].kind === 'budget' && c.ticks === 150, 'x-qa: a match that outlives its tick budget is reported: ' + JSON.stringify(c.violations).slice(0, 160));
  await fresh();
  await t.eval("(() => { let n = 0; window.__qaFault = HOOKS.add('input', (i, side, f) => { if (side === 0 && ++n === 30) f.hp = 99999; }, 90); })()");
  const d = await go({ ...base, maxTicks: 520, render: 0 });
  await t.eval('window.__qaFault && window.__qaFault()');
  check(d.violations.some(v => v.kind === 'health'), 'x-qa: health above the maximum is caught: ' + JSON.stringify(d.violations).slice(0, 200));
  await fresh();
  const e = await go({ ...base, mode: 'cpu', seed: 5, p1: 'wang', p2: 'muse', arena: 4, maxTicks: 650, render: 0 });
  check(e.violations.every(v => v.kind === 'budget') && e.ticks === 650, 'x-qa: CPU against CPU also runs clean for 650 ticks: ' + JSON.stringify(e.violations).slice(0, 160));
  await t.open('');   // leave a clean page behind

  // 4. The node-side planning is pure: same input, same plan, and every repro line names its seed.
  const plan = () => planMatches({ roster: ['tibo', 'poteto', 'dot', 'wang', 'muse'], arenaCount: 9, arenas: 2, seed0: 5 });
  const p1 = plan(), p2 = plan();
  check(p1.length > 0 && JSON.stringify(p1) === JSON.stringify(p2) && p1.every(m => m.seed >= 5 && m.arena >= 0 && m.arena < 9), 'x-qa: planMatches is deterministic and stays inside the arena list (' + p1.length + ' matches)');
  check(/^node tools\/fuzz\.mjs --one \d+:[a-z]+:[a-z]+:\d+:(human2|human1|cpu)$/.test(reproLine(p1[0])), 'x-qa: a failing match prints a copy-paste repro line: ' + reproLine(p1[0]));
  const bp = planBalance({ roster: ['tibo', 'dot'], k: 3, seed0: 10, arenaCount: 9 });
  check(bp.length === 12 && new Set(bp.map(m => m.seed)).size === 12 && bp.filter(m => m.p1 === 'tibo' && m.p2 === 'dot').length === 3, 'x-qa: the balance plan covers every ordered pair K times with distinct seeds');

  // 5. The balance report: made-up results in, a report without holes out.
  const res = (p1, p2, winner, dmg) => ({ p1, p2, seed: 1, arena: 0, ticks: 3600, ended: true, rounds: 2, wins: winner ? [0, 2] : [2, 0], winner, dmg: [{ punch: dmg }, { kick: dmg / 2 }], hits: [{ punch: 4 }, { kick: 2 }], used: [{}, { 'SOME SPECIAL': 3 }], blocks: [1, 0], chip: [1, 0], throws: [0, 1], supers: [0, 1], maxCombo: [3, 2], err: null });
  const an = analyze([res('tibo', 'dot', 0, 40), res('tibo', 'dot', 1, 30), res('dot', 'tibo', 1, 20), res('tibo', 'tibo', 0, 10)], ['tibo', 'dot']);
  const md = renderMarkdown(an, { k: 1, seed0: 1, total: 4, difficulty: 'normal', time: 99, rounds: 2 }, { tibo: 'TIBO', dot: 'DOT' });
  check(an.done === 4 && an.mat.tibo.dot.n === 2 && an.mat.tibo.dot.w === 1 && an.fighter.tibo.matches === 5, 'x-qa: analyze counts wins per ordered pair');
  check(!/NaN|undefined|Infinity/.test(md) && md.includes('## Win rate matrix') && md.includes('## Damage per move'), 'x-qa: the balance report has no NaN or undefined cells');

  // 6. The banned-word and roster checker: clean on this repo, loud on a planted word, a planted fighter and a planted handle.
  const cb = root => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check-banned.mjs'), '--root', root], { encoding: 'utf8' });
  const repo = cb(ROOT);
  check(repo.status === 0, 'x-qa: check-banned finds nothing in this repo: ' + String(repo.stdout).split('\n').slice(0, 3).join(' | ').slice(0, 220));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x-qa-'));
  try {
    const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true }); fs.writeFileSync(path.join(tmp, name), text); };
    const roster = extra => "const ROSTER = [\n  { id: 'tibo', name: 'TIBO', handle: '' },\n  { id: 'poteto', name: 'POTETO', handle: '' },\n  { id: 'dot', name: 'DOT', handle: '' },\n  { id: 'wang', name: 'ALEXANDR WANG', handle: '' },\n  { id: 'muse', name: 'MUSE', handle: '' },\n" + extra + '];\n';
    put('game.js', roster(''));
    check(cb(tmp).status === 0, 'x-qa: check-banned passes a clean five-fighter roster');
    put('notes.md', 'the finishing move is called ' + rot13('sngnyvgl') + '\n');
    const hit = cb(tmp);
    check(hit.status === 1 && /notes\.md:1: banned-word/.test(hit.stdout), 'x-qa: check-banned fails on a banned word and names the file and line: ' + String(hit.stdout).split('\n')[0].slice(0, 120));
    fs.unlinkSync(path.join(tmp, 'notes.md'));
    put('game.js', roster("  { id: 'potato', name: 'POTATO', handle: '' },\n"));
    const extra = cb(tmp);
    check(extra.status === 1 && /roster-forbidden-fighter/.test(extra.stdout) && /roster-ids/.test(extra.stdout), 'x-qa: check-banned fails on a sixth fighter called after a potato');
    const field = 'han' + 'dle';   // spelled in two parts so that this file does not trip the very rule it tests
    put('game.js', roster('').replace("name: 'DOT', " + field + ": ''", "name: 'DOT', " + field + ": 'somebody'"));
    const hd = cb(tmp);
    check(hd.status === 1 && /handle-not-empty/.test(hd.stdout), 'x-qa: check-banned fails on a filled-in X handle');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
