// Tests for touch.js. Owner: the touch agent. Runs after core.mjs; `t` is described in docs/ARCHITECTURE.md (How to add a test).
// Use t.open(hash) for a fresh page, t.eval(code) to run code in it, t.check(cond, message) for each assertion.
export async function run(t) {
  const { check } = t, ev = t.eval;
  await t.open(''); await ev('SETTINGS.reset(); hold(true); 1');
  // a synthetic pointer press on the canvas at game coordinates; the Enter it queues is dropped before the next tick, so nothing launches
  const press = (x, y) => ev(`(() => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + ${x} * r.width / W, clientY: r.top + ${y} * r.height / H, pointerType: 'mouse', button: 0 })); const sel = game.titleSel; clearPressed(); return sel; })()`);
  const n = await ev('titleItems().length');
  check(n > 6, 'the title menu has more than one page of entries here (' + n + ')');
  // every entry on every page is under a tap once its page is showing
  const miss = [];
  for (let first = 0; first < n; first += 6) {
    await ev(`game.titleSel = ${first}; step(1); 1`);
    for (let i = first; i < Math.min(n, first + 6); i++) {
      const s = await ev(`titleSlot(${i}, ${n})`);
      const sel = await press(s.x, s.y + 3);
      if (sel !== i) miss.push(i + '->' + sel);
    }
  }
  check(miss.length === 0, 'a tap on any title entry on any page highlights that entry' + (miss.length ? ' (missed ' + miss.join(' ') + ')' : ''));
  // the PAGE note flips the page and does not launch anything; the last page wraps to the first
  const pg = await ev('titlePager(titleItems().length)');
  const seen = [];
  await ev('game.titleSel = 0; step(1); 1');
  for (let k = 0; k < pg.pages; k++) {
    await press(pg.x, pg.y + 6);
    await ev('step(1); 1');
    seen.push((await ev('game.titleSel')) + ':' + (await ev('game.phase')));
  }
  check(seen.join(' ') === Array.from({ length: pg.pages }, (_, k) => (((k + 1) % pg.pages) * pg.size) + ':title').join(' '), 'a tap on the PAGE note moves to the next page, wraps after the last, and stays on the title (' + seen.join(' ') + ')');
  // a tap away from every entry keeps the highlighted one (it is the one confirmed)
  const sel0 = await ev('game.titleSel');
  check((await press(40, 40)) === sel0, 'a tap away from every entry keeps the highlighted entry');
}
