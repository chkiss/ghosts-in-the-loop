// Layout regression test for the station-select / briefing screen.
//
// The briefing screen is NOT scrollable — it lives inside the fixed CRT bezel
// (overflow:hidden). If a faction's economy + government + trait lines push the
// stack taller than the viewport, the whole .briefbottom row — clock speed, the
// seed field, and the BEGIN WATCH button — slides off the bottom of the screen
// and becomes unreachable. Text length alone can't catch this: whether a line
// wraps to two rows depends on real font metrics, so we measure in a real
// browser at fixed viewports.
//
// Self-contained: serves dist/ over an ephemeral port and drives a throwaway
// headless Chromium (its own temp profile — never your :9222 browser). Run the
// build first (npm run build). Exits non-zero if any faction overflows.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, rm, mkdtemp } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'

const CHROME = ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find(existsSync)
const DIST = new URL('../dist/', import.meta.url).pathname
// Viewports the game should keep the BEGIN button reachable on. 1366x768 is the
// single most common laptop resolution; 1280x720 is the small-laptop floor.
const VIEWPORTS = [[1366, 768], [1280, 720]]
const TOLERANCE = 2 // px of sub-pixel rounding slack
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }

if (!CHROME) { console.error('LAYOUT: no chromium/chrome binary found'); process.exit(2) }
if (!existsSync(join(DIST, 'index.html'))) { console.error('LAYOUT: dist/ missing — run `npm run build` first'); process.exit(2) }

// --- static file server over dist/ ---
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    if (p === '/' || p.endsWith('/')) p = '/index.html'
    const full = join(DIST, p)
    if (!full.startsWith(DIST)) { res.writeHead(403).end(); return }
    const body = await readFile(full)
    res.writeHead(200, { 'content-type': MIME[full.slice(full.lastIndexOf('.'))] || 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

// --- launch throwaway headless chromium ---
const profile = await mkdtemp(join(tmpdir(), 'nukes-layout-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

// read the chosen debug port from DevToolsActivePort
const portFile = join(profile, 'DevToolsActivePort')
let wsBase = ''
for (let i = 0; i < 100 && !wsBase; i++) {
  await new Promise((r) => setTimeout(r, 100))
  try { wsBase = `http://127.0.0.1:${readFileSync(portFile, 'utf8').split('\n')[0].trim()}` } catch {}
}
if (!wsBase) { console.error('LAYOUT: chromium did not open a debug port'); chrome.kill(); process.exit(2) }

const tab = await (await fetch(wsBase + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
await send('Page.enable'); await send('Runtime.enable')

// The nine selectable stations (Iran is an NPC rival with no select button).
const FACTIONS = ['US', 'RU', 'FR', 'UK', 'IN', 'IL', 'PK', 'CN', 'NK']
const failures = []
for (const [w, h] of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: origin + '/' })
  await new Promise((r) => setTimeout(r, 800))
  for (let t = 0; t < 8; t++) {
    if (await evalJs(`document.querySelectorAll('.namebtn').length`)) break
    await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/START/i.test(x.textContent));if(b)b.click();})()`)
    await new Promise((r) => setTimeout(r, 300))
  }
  console.log(`\nviewport ${w}x${h}`)
  for (const f of FACTIONS) {
    const m = await evalJs(`(() => {
      const b=[...document.querySelectorAll('.namebtn')].find(x=>x.textContent.trim()===${JSON.stringify(f)});
      if(!b) return null; b.click();
      const crt=document.querySelector('.crt');
      const scr=document.querySelector('.screen.briefing');
      const begin=document.querySelector('.reportbtn');
      if(!begin) return {noBegin:true};
      // how much the briefing content exceeds its scroll viewport (informational:
      // >0 means REPORT FOR DUTY needs a scroll to reach on this viewport)
      const overflow=scr?Math.round(scr.scrollHeight-scr.clientHeight):Math.round(crt.scrollHeight-crt.clientHeight);
      // the invariant that actually matters: after the screen scrolls to the
      // bottom, REPORT FOR DUTY sits fully inside the CRT viewport (reachable).
      if(scr) scr.scrollTop=scr.scrollHeight;
      const bRect=begin.getBoundingClientRect(), cRect=crt.getBoundingClientRect();
      const stranded=Math.round(Math.max(bRect.bottom-cRect.bottom, cRect.top-bRect.top));
      return {overflow, stranded};
    })()`)
    if (!m || m.noBegin) { console.log(`  ${f.padEnd(5)} MISSING`); failures.push(`${f}@${w}x${h}: REPORT FOR DUTY button missing`); continue }
    const bad = m.stranded > TOLERANCE
    const scrolls = m.overflow > TOLERANCE ? `(scrolls ${m.overflow}px)` : '(fits, no scroll)'
    console.log(`  ${f.padEnd(5)} report-for-duty reachable: ${bad ? 'NO' : 'yes'} ${scrolls}`)
    if (bad) failures.push(`${f}@${w}x${h}: REPORT FOR DUTY unreachable — ${m.stranded}px outside CRT even after scroll`)
  }
}

ws.close(); chrome.kill(); server.close()
await new Promise((r) => setTimeout(r, 300))
await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
if (failures.length) {
  console.error(`\nLAYOUT: ${failures.length} overflow(s):`)
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log('\nLAYOUT: all factions fit the CRT at every tested viewport')
