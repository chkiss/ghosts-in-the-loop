// The board. Thin glowing vector coastlines, WOPR spirit with 2026 data:
// real Natural Earth geometry, equirectangular, x = lon + 180, y = 90 − lat.

import type { PowerState, WorldWithBelief } from '../rules/world.ts'
import { FACTIONS } from '../sim/factions.ts'
import { LAND_PATHS } from '../data/coastlines.ts'

// Blip positions at national capitals (equirectangular: x = lon+180, y = 90−lat),
// with small label nudges to avoid collisions.
export const BLIPS: Record<string, { x: number; y: number; dx: number; dy: number }> = {
  us: { x: 103, y: 51, dx: -13, dy: -3 }, // Washington — label to the left of the blip
  ru: { x: 218, y: 34, dx: 4, dy: -2 },   // Moscow
  cn: { x: 296, y: 50, dx: -11, dy: 5 }, // Beijing
  fr: { x: 182, y: 41, dx: 2, dy: 4 },    // Paris — label inland; the interior draws no lines
  uk: { x: 180, y: 38, dx: -14, dy: -3 }, // London
  in: { x: 257, y: 61, dx: 3, dy: 3 },    // New Delhi
  pk: { x: 253, y: 56, dx: -11, dy: 2 }, // Islamabad
  il: { x: 215, y: 58, dx: 3, dy: 3 },  // Jerusalem — label out over the Mediterranean
  nk: { x: 306, y: 51, dx: -4, dy: -5 },    // Pyongyang — label out into the Sea of Japan
}

// Real coordinates for each targetable city, so a strike's zebra hatch lands on
// the actual place (San Diego on the west coast, not the country's dot).
export const CITY_COORDS: Record<string, { x: number; y: number }> = {
  SEATTLE: { x: 58, y: 42 }, WASHINGTON: { x: 103, y: 51 }, OMAHA: { x: 84, y: 49 }, 'SAN DIEGO': { x: 63, y: 57 },
  SHANGHAI: { x: 302, y: 59 }, CHONGQING: { x: 287, y: 60 }, 'XI’AN': { x: 289, y: 56 }, CHENGDU: { x: 284, y: 59 },
  'ST PETERSBURG': { x: 210, y: 30 }, MOSCOW: { x: 218, y: 34 }, NOVOSIBIRSK: { x: 263, y: 35 }, MURMANSK: { x: 213, y: 21 },
  MARSEILLE: { x: 185, y: 47 }, PARIS: { x: 182, y: 41 }, LYON: { x: 185, y: 44 }, BREST: { x: 176, y: 42 },
  GLASGOW: { x: 176, y: 34 }, LONDON: { x: 180, y: 38 }, MANCHESTER: { x: 178, y: 37 }, FASLANE: { x: 175, y: 34 },
  MUMBAI: { x: 253, y: 71 }, DELHI: { x: 257, y: 61 }, BANGALORE: { x: 258, y: 77 }, KOLKATA: { x: 268, y: 67 },
  ISLAMABAD: { x: 253, y: 56 }, KARACHI: { x: 247, y: 65 }, RAWALPINDI: { x: 253, y: 56 }, LAHORE: { x: 254, y: 58 },
  'TEL AVIV': { x: 215, y: 58 }, HAIFA: { x: 215, y: 57 }, DIMONA: { x: 215, y: 59 }, BEERSHEBA: { x: 215, y: 59 },
  PYONGYANG: { x: 306, y: 51 }, HAMHUNG: { x: 308, y: 50 }, CHONGJIN: { x: 310, y: 48 }, WONSAN: { x: 307, y: 51 },
}

// Iran appears on the board only once it has crossed the threshold.
const IRAN_BLIP = { x: 233, y: 57 }

// Faint zebra-hatch patches over the rough spots where a power's cities were
// struck — one per lost city, scattered near its blip.
const CITY_OFFSETS = [
  { x: -4, y: -3 }, { x: 3, y: 2 }, { x: -2, y: 3 }, { x: 4, y: -2 },
]

interface Props {
  mode: 'select' | 'board'
  world?: WorldWithBelief          // board mode
  playerId?: string
  focusId: string | null
  onFocus: (id: string) => void
  onSelect?: (id: string) => void  // select mode: click assigns the station
  onDotClick?: (id: string) => void // board mode: a click (not a hover) on a dot
  selectTip?: (id: string) => string
}

export function arsenalLabel(q: PowerState, viewerId: string): string {
  if (q.f.id === 'il') {
    if (viewerId === 'il') return `${q.units} WARHEADS (COVERT)`
    // Only Washington gets the full amimut wink; everyone else gets a shrug.
    return viewerId === 'us' ? 'WHAT ARSENAL?' : '?'
  }
  if (q.f.id === 'nk' && viewerId !== 'nk') return `${Math.max(0, q.units - 20)}–${q.units + 40} (EST)`
  return `${q.units.toLocaleString('en-US')} WARHEADS`
}

// A country that has taken a detonation loses a piece of its coastline — a
// jigsaw bite in the background colour, punched over the map where it was hit.
// The dot stays amber; the land is what changed. (Normalized ~±9 unit path.)
const JIGSAW =
  'M -8 -8 L -3 -8 C -3 -11.5 3 -11.5 3 -8 L 8 -8 L 8 -3 ' +
  'C 11.5 -3 11.5 3 8 3 L 8 8 L 3 8 C 3 11.5 -3 11.5 -3 8 ' +
  'L -8 8 L -8 3 C -11.5 3 -11.5 -3 -8 -3 Z'

export function WorldMap({ mode, world, focusId, onFocus, onSelect, onDotClick, selectTip }: Props) {
  return (
    <div className="mapwrap">
      <svg viewBox="0 5 360 150" className="worldmap" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="zebra" width="1.6" height="1.6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="1.6" height="1.6" fill="none" />
            <rect width="0.8" height="1.6" className="zebrabar" />
          </pattern>
        </defs>
        {LAND_PATHS.map((d, i) => (
          <path key={i} d={d} className="coast" />
        ))}
        {FACTIONS.map((f) => {
          const b = BLIPS[f.id]
          const q = world?.powers[f.id]
          const held = world?.asi?.arsenalsHeld.includes(f.id) // seized by the ASI → red, "HAL"
          const unseized = q?.unSeized                          // UN custody → green, out of play
          const cls = [
            'blip',
            q?.aiIntegrated ? 'ai' : '',
            q?.nuked ? 'nuked' : '',
            held ? 'held' : '',
            unseized ? 'unseized' : '',
            focusId === f.id ? 'focus' : '',
          ].join(' ')
          // Arsenal size nudges the blip radius on a log scale — enough to tell a
          // heavyweight from a minnow, but small: a legible pinpoint, not a blob.
          const r = q ? 0.8 + Math.min(1.15, Math.log10(q.units + 1) * 0.32) : 1.3
          return (
            <g
              key={f.id}
              className={cls}
              onMouseEnter={() => onFocus(f.id)}
              onClick={() => {
                if (mode === 'select') onSelect?.(f.id)
                else { onFocus(f.id); onDotClick?.(f.id) }
              }}
            >
              {mode === 'select' && selectTip && <title>{selectTip(f.id)}</title>}
              {/* generous invisible hit target: the whole ring is clickable */}
              <circle cx={b.x} cy={b.y} r={9} className="hit" />
              {/* zebra hatch on the real spot of each struck city */}
              {q?.lostCities?.slice(0, 4).map((c, li) => {
                const cc = CITY_COORDS[c] ?? { x: b.x + CITY_OFFSETS[li].x, y: b.y + CITY_OFFSETS[li].y }
                return (
                  <rect key={c} x={cc.x - 2.5} y={cc.y - 1.6} width={5} height={3.2} className="zebra" fill="url(#zebra)" />
                )
              })}
              {q?.nuked && (
                <path
                  className="notch"
                  transform={`translate(${b.x - r - 4} ${b.y + r + 4}) scale(0.4)`}
                  d={JIGSAW}
                />
              )}
              {focusId === f.id && <circle cx={b.x} cy={b.y} r={r + 3.5} className="focusring" />}
              <circle cx={b.x} cy={b.y} r={r} className="dot" />
              <text x={b.x + b.dx} y={b.y + b.dy} className="bliplabel">
                {held ? 'HAL' : f.id.toUpperCase()}
              </text>
            </g>
          )
        })}
        {world?.iranNuclear && (
          <g className="blip minor">
            <circle cx={IRAN_BLIP.x} cy={IRAN_BLIP.y} r={1.7} className="dot" />
            <text x={IRAN_BLIP.x - 2} y={IRAN_BLIP.y + 6} className="bliplabel">IR</text>
          </g>
        )}
        {world?.minorPowers.map((m) => (
          <g key={m.id} className="blip minor">
            <circle cx={m.x} cy={m.y} r={1.6} className="dot" />
            <text x={m.x - 2} y={m.y + 6} className="bliplabel">{m.id.toUpperCase()}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
