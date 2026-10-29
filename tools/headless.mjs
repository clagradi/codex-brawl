// Tiny headless-Chrome driver over the DevTools protocol (no npm dependencies).
// Usage:
//   node tools/headless.mjs <url> [--shot out.png] [--eval "js"] [--wait ms] [--keys "KeyF,KeyG"]
//   node tools/headless.mjs --test        (runs the full automated match test in tools/test-match.js)
// Prints every console error / uncaught exception and exits non-zero if any happened.
import { spawn } from 'node:child_process';
import fs from "node:fs";
import os from "node:os";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(2); }

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = name => args.includes(name);

export async function withPage(fn) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'brawl-chrome-'));
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1000,600', 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0; const pending = new Map(); const listeners = [];
  const cleanup = async () => { try { ws && ws.close(); } catch { } const exited = new Promise(r => ch.once('exit', r)); ch.kill(); await exited; await new Promise(r => setTimeout(r, 100)); fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); };
  try {
    let targets;
    for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const page = targets.find(t => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) listeners.forEach(l => l(m)); };
    const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    const on = l => listeners.push(l);
    const errors = [];
    await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
    on(m => {
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text);
    });
    const api = {
      send, errors,
      async goto(url) { // via about:blank so hash-only changes still produce a real load event
        const nav = async u => { const loaded = new Promise(r => { const l = m => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); r(); } }; on(l); }); await send('Page.navigate', { url: u }); await loaded; };
        await nav('about:blank'); await nav(url);
      },
      async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result.result.value; },
      async shot(file, full = true) {
        let clip;
        if (full) { const m = (await send('Page.getLayoutMetrics')).result; const cs = m.cssContentSize || m.contentSize; clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 }; }
        const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      },
      async key(code, down = true) { await send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code.replace('Key', ''), windowsVirtualKeyCode: code.length === 4 ? code.charCodeAt(3) : 0 }); },
      async tap(code) { await api.key(code, true); await api.key(code, false); },
      wait: ms => new Promise(r => setTimeout(r, ms)),
    };
    return await fn(api);
  } finally { await cleanup(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (flag('--test')) {
    const { runTests } = await import('./test-match.mjs');
    const ok = await withPage(runTests);
    process.exit(ok ? 0 : 1);
  }
  const url = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const ok = await withPage(async p => {
    await p.goto(url.includes('://') ? url : 'file://' + path.resolve(url));
    await p.wait(+opt('--wait', 300));
    for (const k of (opt('--keys', '') || '').split(',').filter(Boolean)) { await p.tap(k); await p.wait(60); }
    if (opt('--eval')) console.log(JSON.stringify(await p.eval(opt('--eval'))));
    if (opt('--shot')) { await p.wait(100); await p.shot(opt('--shot')); }
    if (p.errors.length) { console.error(p.errors.join('\n')); return false; }
    return true;
  });
  process.exit(ok ? 0 : 1);
}
