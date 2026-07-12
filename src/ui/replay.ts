// End-of-watch replay: one GIF frame per year, rendered on a canvas from the
// sim's YearSnap history and encoded client-side. The server does nothing.

import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { LAND_PATHS } from '../data/coastlines.ts'
import { BLIPS, CITY_COORDS } from './WorldMap.tsx'
import type { ReplayEvent, YearSnap } from '../rules/world.ts'
import { GAME_TITLE } from '../brand.ts'

const W = 720
const H = 440
const MAP_SCALE = 2          // viewBox 360×150 → 720×300
const MAP_TOP = 10           // viewBox y starts at 5; drawn at (y−5)×2 + margin
const LEGEND_Y = 300         // country boxes + purchases live UNDER the map
const STRIP_Y = 356

const AMBER = '#ffb000'
const DIM = '#b07c10'
const BG = '#0a0705'
const RED = '#ff3a30'
const GREEN = '#33ff33'

// What a year's purchases look like on the map. Always "+", per the designer.
const ACT_LABELS: Record<string, string> = {
  harden: '+HARDEN', icept: '+INTERCEPTORS', counter: '+DECOYS', dealert: '+DE-ALERT',
  cybernc3: '+CYBER', cyber: '+CYBER', nc3: '+NC3', integrate: '+AI', assure: '+ASSURANCE',
  markets: '+DATACENTERS', chipembargo: '+EMBARGO', matembargo: '+EMBARGO',
  diplo: '+DIPLOMACY', negotiate: '+TREATY', defect: '+DEFECT', contain: '+CONTAIN',
  leak: '+LEAK', test: '+TEST',
}
// Most-notable-first, for the two purchase slots per power in the legend.
const ACT_PRIORITY = [
  'integrate', 'chipembargo', 'matembargo', 'negotiate', 'defect', 'counter', 'harden',
  'icept', 'nc3', 'assure', 'markets', 'dealert', 'cybernc3', 'cyber', 'diplo',
  'contain', 'leak', 'test',
]
// West-to-east legend order, matching the selection screen.
const LEGEND_ORDER = ['us', 'uk', 'fr', 'il', 'ru', 'pk', 'in', 'cn', 'nk', 'iran']
let PLAYER_ID: string | undefined

const px = (x: number) => x * MAP_SCALE
const py = (y: number) => (y - 5) * MAP_SCALE + MAP_TOP
const IRAN = { x: 233, y: 57 }
const coord = (id?: string) => (id ? (id === 'iran' ? IRAN : BLIPS[id] ?? null) : null)
const bez = (a: number, c: number, b: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b

// One missile on a northern arc: launch flash, dashed trajectory-so-far, a
// siren over the target from mid-flight, a burst on arrival. Intercept
// events end differently: a green missile rises from the target and the
// two meet mid-air.
function drawVolley(ctx: CanvasRenderingContext2D, ev: ReplayEvent, t: number): void {
  const a = coord(ev.from)
  const b = coord(ev.to)
  if (!a || !b) return
  const icept = ev.k === 'intercept'
  const x0 = px(a.x), y0 = py(a.y), x1 = px(b.x), y1 = py(b.y)
  const cx = (x0 + x1) / 2
  const cy = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * 0.28 - 16
  // the incoming track flies to u=0.62 when intercepted, 1.0 when not
  const meetU = icept ? 0.62 : 1
  const tt = Math.min(1, t) * meetU
  ctx.strokeStyle = 'rgba(255, 58, 48, 0.6)'
  ctx.setLineDash([3, 4])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  const steps = 28
  for (let i = 1; i <= Math.round(steps * tt); i++) {
    const u = (i / steps)
    if (u > tt) break
    ctx.lineTo(bez(x0, cx, x1, u), bez(y0, cy, y1, u))
  }
  ctx.stroke()
  ctx.setLineDash([])
  // launch flash at the origin
  ctx.strokeStyle = RED
  ctx.beginPath()
  ctx.arc(x0, y0, 6, 0, Math.PI * 2)
  ctx.stroke()
  // the missile
  const mx = bez(x0, cx, x1, tt)
  const my = bez(y0, cy, y1, tt)
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(mx, my, 2.6, 0, Math.PI * 2)
  ctx.fill()
  const meetX = bez(x0, cx, x1, meetU)
  const meetY = bez(y0, cy, y1, meetU)
  if (icept && t >= 0.5) {
    // the interceptor: a green missile climbing from the target to the meet
    const g = Math.min(1, (t - 0.5) * 2)
    const gx = x1 + (meetX - x1) * g
    const gy = y1 + (meetY - y1) * g
    ctx.strokeStyle = 'rgba(51, 255, 51, 0.7)'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(gx, gy)
    ctx.stroke()
    ctx.fillStyle = GREEN
    ctx.beginPath()
    ctx.arc(gx, gy, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }
  // siren over the target once the track is unambiguous
  if (t >= 0.5 && !(icept && t >= 1)) {
    ctx.fillStyle = RED
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('⚠', x1, y1 - 10)
    ctx.textAlign = 'left'
  }
  // arrival: red burst at the city — or a green burst mid-air where it died
  if (t >= 1) {
    const bx2 = icept ? meetX : x1
    const by2 = icept ? meetY : y1
    ctx.strokeStyle = icept ? GREEN : RED
    ctx.lineWidth = 1.5
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(bx2 + Math.cos(ang) * 4, by2 + Math.sin(ang) * 4)
      ctx.lineTo(bx2 + Math.cos(ang) * 11, by2 + Math.sin(ang) * 11)
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }
}

function bar(v: number, max = 10): string {
  const n = Math.max(0, Math.min(max, Math.round(v)))
  return '▮'.repeat(n) + '▯'.repeat(max - n)
}

function drawFrame(
  ctx: CanvasRenderingContext2D, snap: YearSnap, prev: YearSnap | null, endingTitle: string | null,
): void {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  // coastlines
  ctx.save()
  ctx.translate(0, MAP_TOP - 5 * MAP_SCALE)
  ctx.scale(MAP_SCALE, MAP_SCALE)
  ctx.strokeStyle = DIM
  ctx.lineWidth = 0.35
  for (const d of LAND_PATHS) ctx.stroke(new Path2D(d))
  ctx.restore()

  // zebra scars where cities died
  ctx.fillStyle = 'rgba(176, 124, 16, 0.55)'
  for (const q of Object.values(snap.powers)) {
    for (const c of q.lost.slice(0, 4)) {
      const cc = CITY_COORDS[c]
      if (cc) ctx.fillRect(px(cc.x) - 4, py(cc.y) - 3, 8, 6)
    }
  }

  // blips, labels, annotations
  ctx.textBaseline = 'middle'
  const playerNow = snap.player ?? PLAYER_ID // old snapshots lack .player

  // proliferation: Iran (once nuclear, before the switch) + cascade minors
  if (snap.iran != null) {
    ctx.fillStyle = AMBER
    ctx.beginPath()
    ctx.arc(px(IRAN.x), py(IRAN.y), 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillText('IR', px(IRAN.x - 2), py(IRAN.y + 5))
  }
  for (const m of snap.minors ?? []) {
    ctx.fillStyle = 'rgba(255, 176, 0, 0.65)'
    ctx.beginPath()
    ctx.arc(px(m.x), py(m.y), 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillText(m.id.toUpperCase(), px(m.x + 2), py(m.y + 4))
  }

  // The map stays clean: dots only — missiles and crises get the airspace.
  const blipsAll: Record<string, { x: number; y: number }> =
    snap.powers['iran'] ? { ...BLIPS, iran: { ...IRAN } } : BLIPS
  for (const [id, b] of Object.entries(blipsAll)) {
    const q = snap.powers[id]
    if (!q) continue
    ctx.fillStyle = q.held ? RED : q.restraint || q.unseized ? GREEN : AMBER
    ctx.beginPath()
    ctx.arc(px(b.x), py(b.y), q.held ? 4 : 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // The legend: code boxes under the map, this year's top-2 purchases beneath
  // each. The player's box is filled; HAL turns a box red; a chair that took
  // a warhead and did not answer turns green.
  const cols = LEGEND_ORDER.filter((id) => snap.powers[id])
  const colW = W / cols.length
  // mask the map's Antarctica out from under the legend band
  ctx.fillStyle = BG
  ctx.fillRect(0, LEGEND_Y - 6, W, 50)
  ctx.textAlign = 'center'
  cols.forEach((id, i) => {
    const q = snap.powers[id]!
    const cxm = colW * i + colW / 2
    const code = q.held ? 'HAL' : id === 'iran' ? 'IR' : id.toUpperCase()
    const color = q.held ? RED : q.restraint || q.unseized ? GREEN : AMBER
    const isPlayer = id === playerNow
    // the box
    const bw = Math.min(colW - 10, 56)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    if (isPlayer) {
      ctx.fillStyle = color
      ctx.fillRect(cxm - bw / 2, LEGEND_Y, bw, 16)
      ctx.fillStyle = BG
    } else {
      ctx.strokeRect(cxm - bw / 2, LEGEND_Y, bw, 16)
      ctx.fillStyle = color
    }
    ctx.font = 'bold 11px monospace'
    ctx.textBaseline = 'middle'
    ctx.fillText(code, cxm, LEGEND_Y + 9)
    // purchases: top two this year, last year's fading beneath if fewer
    const pick = (acts: string[]) => {
      const uniq = [...new Set(acts)]
      uniq.sort((a, z) => ACT_PRIORITY.indexOf(a) - ACT_PRIORITY.indexOf(z))
      return uniq.slice(0, 2)
    }
    ctx.font = '9px monospace'
    let line = 0
    for (const act of pick(q.acts)) {
      ctx.fillStyle = q.held ? RED : AMBER
      ctx.fillText((ACT_LABELS[act] ?? `+${act.toUpperCase()}`).slice(0, 13), cxm, LEGEND_Y + 26 + line * 10)
      line++
    }
    if (prev && line < 2) {
      ctx.fillStyle = 'rgba(255, 176, 0, 0.35)'
      for (const act of pick(prev.powers[id]?.acts ?? []).slice(0, 2 - line)) {
        ctx.fillText((ACT_LABELS[act] ?? `+${act.toUpperCase()}`).slice(0, 13), cxm, LEGEND_Y + 26 + line * 10)
        line++
      }
    }
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // event banner: crises, overhangs, launches — top center, launches in red
  ctx.textAlign = 'center'
  snap.events.slice(0, 3).forEach((e, i) => {
    ctx.font = 'bold 13px monospace'
    const text = e.t.slice(0, 68)
    const w2 = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(10, 7, 5, 0.8)'
    ctx.fillRect(W / 2 - w2 / 2 - 8, 10 + i * 18, w2 + 16, 17)
    ctx.fillStyle = e.k === 'launch' ? RED : e.k === 'intercept' ? GREEN : AMBER
    ctx.fillText(text, W / 2, 23 + i * 18)
  })
  ctx.textAlign = 'left'

  // stat strip
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = AMBER
  ctx.font = 'bold 34px monospace'
  ctx.fillText(String(snap.y), 24, STRIP_Y + 44)
  ctx.font = '13px monospace'
  const rows: Array<[string, string, string]> = [
    ['AI FRONTIER', bar(snap.frontier), AMBER],
    ['TENSION', bar(snap.tension), snap.tension < 2 ? GREEN : snap.tension > 6 ? RED : AMBER],
    ['HUMAN CONTROL', `${bar(snap.hc / 10)} ${Math.round(snap.hc)}%`, snap.hc >= 70 ? GREEN : snap.hc <= 45 ? RED : AMBER],
    ['WORLD ARSENALS', snap.total.toLocaleString('en-US'), AMBER],
  ]
  rows.forEach(([k, v, color], i) => {
    ctx.fillStyle = DIM
    ctx.fillText(k, 160, STRIP_Y + 18 + i * 20)
    ctx.fillStyle = color
    ctx.fillText(v, 310, STRIP_Y + 18 + i * 20)
  })
  ctx.fillStyle = DIM
  ctx.font = '11px monospace'
  ctx.fillText(GAME_TITLE, 560, H - 12)

  // the punchline card
  if (endingTitle) {
    ctx.fillStyle = 'rgba(10, 7, 5, 0.72)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = AMBER
    ctx.textAlign = 'center'
    // shrink the headline until it fits — some endings are sentences
    let size = 40
    do {
      ctx.font = `bold ${size}px monospace`
      size -= 2
    } while (size > 12 && ctx.measureText(endingTitle).width > W - 48)
    ctx.fillText(endingTitle, W / 2, H / 2)
    ctx.font = '14px monospace'
    ctx.fillStyle = DIM
    ctx.fillText(GAME_TITLE, W / 2, H / 2 + 34)
    ctx.textAlign = 'left'
  }
}

export async function renderReplayGif(history: YearSnap[], endingTitle: string, playerId?: string): Promise<Blob> {
  PLAYER_ID = playerId
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const gif = GIFEncoder()

  const addFrame = (delay: number) => {
    const { data } = ctx.getImageData(0, 0, W, H)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, W, H, { palette, delay, repeat: 0 }) // repeat 0 = loop forever
  }

  let volleyBudget = 12 // cap the animated volleys so a long cascade can't bloat the file
  for (let i = 0; i < history.length; i++) {
    const snap = history[i]
    const prev = i > 0 ? history[i - 1] : null
    drawFrame(ctx, snap, prev, null)
    addFrame(1000) // one second per year
    // the exciting part: each volley flies as its own three-beat animation
    for (const ev of snap.events) {
      if (!coord(ev.from) || !coord(ev.to) || volleyBudget <= 0) continue
      volleyBudget--
      for (const [t, delay] of [[0.3, 420], [0.7, 420], [1, 750]] as const) {
        drawFrame(ctx, snap, prev, null)
        drawVolley(ctx, ev, t)
        addFrame(delay)
      }
    }
    // let the event loop breathe on long runs
    if (i % 5 === 4) await new Promise((r) => setTimeout(r))
  }
  const last = history[history.length - 1]
  if (last) {
    drawFrame(ctx, last, history.length > 1 ? history[history.length - 2] : null, endingTitle)
    addFrame(3200) // hold the punchline
  }
  gif.finish()
  return new Blob([new Uint8Array(gif.bytes()).buffer as ArrayBuffer], { type: 'image/gif' })
}
