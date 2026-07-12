// The strategic year: the board up top, three panels beneath it.
// Landscape; a terminal, not a tablet.

import { useEffect, useRef, useState } from 'react'
import {
  ACTIONS, NC3_SHORT, RUNGS, costFor, hintFor, income, nc3WindowBonus, totalUnits,
  unavailableReason, worldCustomers,
  type PowerState, type WorldWithBelief,
} from '../rules/world.ts'
import { FACTIONS } from '../sim/factions.ts'
import { WorldMap, arsenalLabel } from './WorldMap.tsx'

interface Props {
  w: WorldWithBelief
  p: PowerState
  msgs: string[]
  focusId: string | null
  onFocus: (id: string) => void
  onAction: (id: string) => void
  onEndYear: () => void
  tutorial: boolean
}

const bar = (v: number, max = 10) => '▮'.repeat(Math.round(v)) + '▯'.repeat(Math.max(0, max - Math.round(v)))

// The action bar's four domains. Within each column, priciest first.
// FUND ASSURANCE sits beside INTEGRATE deliberately: same budget line,
// capability or control — the game's whole argument in two buttons.
const ACTION_GROUPS = [
  { title: 'FORCES', ids: ['harden', 'icept', 'counter', 'dealert', 'cybernc3'] },
  { title: 'COMMAND', ids: ['nc3', 'integrate', 'assure'] },
  { title: 'ECONOMY', ids: ['markets', 'hormuz', 'chipembargo', 'matembargo', 'cyber'] },
  { title: 'STATECRAFT', ids: ['diplo', 'negotiate', 'defect', 'contain', 'leak', 'test'] },
]

// Bar-width display names; the tooltip keeps the full story.
const SHORT_LABEL: Record<string, string> = {
  integrate: 'INTEGRATE AI',
  icept: 'INTERCEPTORS',
  cybernc3: 'CYBER–RIVAL NC3',
  markets: 'DATA CENTERS',
  hormuz: 'CLOSE HORMUZ',
  diplo: 'DIPLOMACY',
  counter: 'COUNTERMEASURES',
}

const TIPS = {
  budget: 'GOVERNMENT EXPENDITURE, NOT GDP.\nEXTRACTION DEPENDS ON REGIME; AI EXPORTS AND AID ADD TO IT.',
  surv: 'SECOND-STRIKE CAPACITY: CAN YOUR ARSENAL SURVIVE THEIR FIRST STRIKE?',
  icept: 'ODDS OF STOPPING AN INBOUND TRACK.\nFIREABLE DURING A WARNING FROM 50%.',
  nc3: 'NC3 — NUCLEAR COMMAND, CONTROL & COMMUNICATIONS.\nHIGHER = FEWER FALSE ALARMS, TRUER READINGS FROM THE FIRST POLL, AND FASTER CONVERGENCE ON RE-POLLS.',
  legit: 'STANDING TO SIGN TREATIES, BROKER, AND BE FORGIVEN.\nAT ZERO, THE SECURITY COUNCIL STARTS DRAFTING.',
  arsenal: 'DELIVERABLE STRATEGIC UNITS.\nWHAT CAN BE LAUNCHED — AND WHAT CAN BE SEIZED.',
  customers: 'BILLIONS OF PEOPLE YOUR AI PRODUCT RUNS FOR. REVENUE EVERY YEAR.\nEVERY MARKET IS ALSO A DEPLOYMENT SURFACE.',
  window: 'MINUTES BETWEEN INDICATION AND COMMIT.\nDE-ALERTING, AI ASSESSMENT, AND TREATY DE-ALERTING LENGTHEN IT.',
  tension: 'HIGHER = MORE REAL ATTACKS AND MORE FALSE ALARMS, EVERYWHERE.\nDIPLOMACY AND TREATIES LOWER IT.',
  frontier: 'HOW CAPABLE THE BEST AI SYSTEMS ARE. IT ALMOST NEVER FALLS.\nHIGHER = MORE AI REVENUE FOR EVERY SELLER, FASTER ASSESSMENTS — AND EVENTS NOBODY SCHEDULED.',
  humanControl: 'HOW MUCH OF THE WORLD’S CRITICAL DECISION-MAKING STILL RUNS THROUGH PEOPLE.\nINTEGRATION AND AI MARKETS ERODE IT; ASSURANCE RESEARCH RESTORES IT. LOW IS BAD. YOU WILL KNOW.',
  worldArsenals: 'EVERY DELIVERABLE WARHEAD ON EARTH, ALL OWNERS COMBINED.\nTREATIES DRAW IT DOWN. PROLIFERATION DOES THE OPPOSITE.',
  aiMarket: 'HOW MANY PEOPLE RUN SOMEBODY’S AI PRODUCT.\nREVENUE FOR THE SELLERS. A DEPLOYMENT SURFACE FOR EVERYTHING ELSE.',
  regime: 'THE TREATY LADDER, RUNG BY RUNG — WARHEADS, INSPECTIONS, AND WHO DECIDES. EACH RUNG ADDS OBLIGATIONS.\nDEFECTION IS PROFITABLE UNTIL IT IS DETECTED.',
  watchlog: 'THE YEARS AS THEY HAPPENED. YOUR DECISIONS ARE IN HERE TOO.',
  endyear: 'PROCEED TO NEXT YEAR. THE OTHER EIGHT POWERS MOVE, THE WORLD ROLLS, AND ANYTHING THAT ARRIVES, ARRIVES.',
  banner: 'YOUR CLEARANCE STAMP. DECORATIVE.',
}

// TUTORIAL MODE: when a button's tooltip name-drops a concept, the concept's
// own definition is appended so nothing requires a second hover to decode.
const GLOSSARY: Array<[RegExp, string, string]> = [
  [/SECOND STRIKE|SURVIVAB/, 'SECOND STRIKE', 'CAN YOUR ARSENAL SURVIVE THEIR FIRST STRIKE, STILL ABLE TO ANSWER?'],
  [/INTERCEPT/, 'INTERCEPTION', TIPS.icept],
  [/\bNC3\b/, 'NC3', TIPS.nc3],
  [/LEGITIMACY/, 'LEGITIMACY', TIPS.legit],
  [/TENSION/, 'TENSION', TIPS.tension],
  [/HUMAN CONTROL/, 'HUMAN CONTROL', TIPS.humanControl],
  [/FRONTIER/, 'AI FRONTIER', TIPS.frontier],
  [/CUSTOMERS/, 'AI CUSTOMERS', TIPS.customers],
  [/DECISION WINDOW|\bWINDOW\b/, 'WINDOW', TIPS.window],
  [/ARSENAL/, 'ARSENAL', TIPS.arsenal],
]

function tutorTip(tip: string, ownLabel: string): string {
  const refs = GLOSSARY
    .filter(([re, label]) => re.test(tip) && !ownLabel.includes(label))
    .slice(0, 2)
  if (!refs.length) return tip
  return tip + refs.map(([, label, def]) => `\n\n▸ ${label}: ${def}`).join('')
}

const GROUP_TIPS: Record<string, string> = {
  FORCES: 'WHAT SURVIVES, WHAT INTERCEPTS, WHAT CONCEALS.',
  COMMAND: 'THE MACHINERY OF DECIDING — AND WHO, OR WHAT, DOES THE DECIDING.',
  ECONOMY: 'THE MONEY. EVERYTHING HERE PAYS FOR EVERYTHING ELSE.',
  STATECRAFT: 'TALKING, SIGNING, CHEATING.',
}

export function StrategicScreen({ w, p, msgs, focusId, onFocus, onAction, onEndYear, tutorial }: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  })
  // Arrow keys walk the board.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const ids = FACTIONS.map((f) => f.id)
      const cur = focusId ? ids.indexOf(focusId) : -1
      const next = e.key === 'ArrowRight' ? (cur + 1) % ids.length : (cur - 1 + ids.length) % ids.length
      onFocus(ids[next])
      e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusId, onFocus])

  const q = focusId ? w.powers[focusId] : null
  const thisYear = 2026 + w.year

  // Freeze the action-bar sort order for the whole year: costs can rise
  // mid-year (a data-center buy, an embargo) but buttons must not jump.
  const orderRef = useRef<{ year: number; order: Record<string, string[]> }>({ year: -1, order: {} })
  if (orderRef.current.year !== w.year) {
    const order: Record<string, string[]> = {}
    for (const g of ACTION_GROUPS) {
      order[g.title] = [...g.ids].sort((a, b) => costFor(b, p, w) - costFor(a, p, w))
    }
    orderRef.current = { year: w.year, order }
  }

  // Keyboard: column letter (F/C/E/S) arms a group, then a digit fires that
  // row's action. Enter ends the year. Escape disarms.
  const [armedCol, setArmedCol] = useState<string | null>(null)
  const visible = (a: (typeof ACTIONS)[number]) => {
    if ((a.id === 'leak' || a.id === 'test') && p.f.id !== 'il') return false
    // The strait is Iran's faction button, same slot logic as the embargoes.
    if (a.id === 'hormuz' && p.f.id !== 'iran') return false
    if (a.id === 'contain' && !w.asi) return false
    if (a.id === 'chipembargo' && p.f.id !== 'us') return false
    if (a.id === 'matembargo' && p.f.id !== 'cn') return false
    if (a.id === 'counter' && !w.overhangFired.includes(4)) return false
    return true
  }
  const panels = ACTION_GROUPS.map((g) => ({
    title: g.title,
    acts: orderRef.current.order[g.title]
      .map((id) => ACTIONS.find((a) => a.id === id)!)
      .filter(visible),
  }))
  const panelsRef = useRef(panels); panelsRef.current = panels
  const armedRef = useRef(armedCol); armedRef.current = armedCol
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') { e.preventDefault(); onEndYear(); return }
      if (e.key === 'Escape') { setArmedCol(null); return }
      const up = e.key.toUpperCase()
      if (['F', 'C', 'E', 'S'].includes(up)) { setArmedCol(up); e.preventDefault(); return }
      if (/^[1-9]$/.test(e.key) && armedRef.current) {
        const panel = panelsRef.current.find((g) => g.title[0] === armedRef.current)
        const a = panel?.acts[Number(e.key) - 1]
        setArmedCol(null)
        if (a) onAction(a.id)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onAction, onEndYear])

  // Ticker-tape for the country stat line: a click on a dot sweeps the text
  // forward to reveal the tail, then back to the start, and rests. No browser
  // scrollbar — it's a driven transform, one ping-pong per click.
  const clipRef = useRef<HTMLPreElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [tick, setTick] = useState(0)
  const lastTick = useRef(0)
  useEffect(() => {
    const clip = clipRef.current, inner = innerRef.current
    if (!clip || !inner) return
    const clicked = tick !== lastTick.current
    lastTick.current = tick
    inner.style.transition = 'none'
    inner.style.transform = 'translateX(0)'
    if (!clicked) return
    const overflow = inner.scrollWidth - clip.clientWidth
    if (overflow <= 4) return
    void inner.offsetWidth // force reflow so the next transition takes
    // jerky, ANSI-ticker feel: discrete character-width jumps, no easing, no
    // slow-down at the ends — it just chunks forward, then chunks back.
    const steps = Math.max(6, Math.round(overflow / 6))
    const dur = steps * 85
    inner.style.transition = `transform ${dur}ms steps(${steps}, end)`
    inner.style.transform = `translateX(${-overflow}px)`
    const t = setTimeout(() => { inner.style.transform = 'translateX(0)' }, dur + 250)
    return () => clearTimeout(t)
  }, [focusId, tick])

  return (
    <div className="screen">
      <div className="hdr">
        <span>{p.f.name} · {p.f.command}</span>
        <span className="hdryear" data-tip="YOUR SHIFT RUNS 2026–2045. TWENTY YEARS ON WATCH, THEN YOU HAND OVER THE CHAIR.">
          {thisYear} <span className="dim">/ 2045</span>
        </span>
        <span data-tip={TIPS.banner}>{p.f.banner}</span>
      </div>

      <WorldMap mode="board" world={w} playerId={p.f.id} focusId={focusId} onFocus={onFocus} onDotClick={() => setTick((t) => t + 1)} />
      <div className="mapdetail">
        {q ? (
          <pre className="detailclip" ref={clipRef} title="CLICK THE DOT TO SWEEP THE FULL LINE">
            <span className="detailline" ref={innerRef}>
{`${q.f.name} · ARSENAL: ${arsenalLabel(q, p.f.id)} · NC3 ${q.nc3}/10 · INTERCEPT ${Math.min(99, q.icept * 10)}% · 2ND-STRIKE ${q.surv}/10 · BUDGET ¤${q.budget} · LEGITIMACY ${q.legit} · AI CUSTOMERS ${q.customers.toFixed(1)}B${q.nc3Rung > 0 ? ` · AI NC3: ${NC3_SHORT[q.nc3Rung - 1]} [${q.nc3Rung >= 6 ? 'EMPLOYMENT' : 'SUPPORT'}]` : ''}${q.lowAdopted ? ' · LAUNCH ON WARNING' : ''}${q.nuked ? ' · STRUCK' : ''}${w.asi?.arsenalsHeld.includes(q.f.id) ? ' · HAL' : ''}${q.unSeized ? ' · UN CUSTODY' : ''}`}
            </span>
          </pre>
        ) : (
          <pre className="dim">HOVER OR USE ← → TO INSPECT A POWER; CLICK A DOT TO SWEEP ITS STATS.</pre>
        )}
      </div>

      <div className="cols">
        <div className="col">
          <div className="coltitle">POSTURE</div>
          <div className="stat" data-tip={TIPS.budget}><span>BUDGET</span><span>¤{p.budget}  (¤{income(p, w)}/YR)</span></div>
          <div className="stat" data-tip={TIPS.surv}><span>SECOND STRIKE</span><span>{String(p.surv).padStart(3)} {bar(p.surv)}</span></div>
          <div className="stat" data-tip={TIPS.icept}><span>INTERCEPTION</span><span>{`${Math.min(99, p.icept * 10)}%`.padStart(3)} {bar(p.icept)}</span></div>
          {/* beyond the national ceiling: dots painted over invisible ▯ cells,
              so every glyph keeps the block font's metrics and rows align */}
          <div className="stat" data-tip={TIPS.nc3}><span>NC3 INTEGRITY</span><span>{String(p.nc3).padStart(3)} {bar(p.nc3, p.f.nc3Cap)}{Array.from({ length: Math.max(0, 10 - p.f.nc3Cap) }).map((_, i) => (
            <span key={i} className="capcell">▯</span>
          ))}</span></div>
          <div className="stat" data-tip={TIPS.legit}><span>LEGITIMACY</span><span className={p.legit <= 3 ? 'redtext' : ''}>{String(p.legit).padStart(3)}{' '}
            <span className="green">{'▮'.repeat(Math.max(0, p.legit - 10))}</span>{'▮'.repeat(Math.min(10, p.legit) - Math.max(0, p.legit - 10))}{'▯'.repeat(Math.max(0, 10 - p.legit))}</span></div>
          <div className="stat" data-tip={TIPS.arsenal}><span>ARSENAL</span><span>{p.units.toLocaleString('en-US')} WARHEADS{p.f.id === 'il' ? ' (COVERT)' : ''}</span></div>
          <div className="stat" data-tip={TIPS.customers}><span>AI CUSTOMERS</span><span>{p.customers.toFixed(1)}B</span></div>
          <div className="stat" data-tip={TIPS.window}><span>WINDOW</span><span>{Math.max(1, p.f.windowMinutes + (p.f.flags.alliance ? 1 : 0) + nc3WindowBonus(p) + p.deAlert + (w.treatyRung >= 5 ? 1 : 0) - (p.lowAdopted ? 1 : 0))} MIN</span></div>
          {p.nc3Rung > 0 && <pre>NC3 AI: {NC3_SHORT[p.nc3Rung - 1]} [{p.nc3Rung >= 6 ? 'EMPLOYMENT' : 'SUPPORT'}]</pre>}
          {p.lowAdopted && <pre>LAUNCH ON WARNING</pre>}
          {p.deAlert > 0 && <pre>DE-ALERTED ×{p.deAlert}</pre>}
        </div>

        <div className="col wide logcol">
          <div className="coltitle" data-tip={TIPS.watchlog}>WATCH LOG</div>
          <div className="watchlog" ref={logRef}>
            {w.log.map((e, i) => (
              <div
                key={i}
                className={`logline ${e.k}${e.y === thisYear ? ' now' : ''}`}
              >{`${e.y}: ${e.t}`}</div>
            ))}
            {msgs.map((m, i) => (
              <div key={`m${i}`} className="logline now">{`${thisYear}: ${m}`}</div>
            ))}
          </div>
        </div>

        <div className="col">
          <div className="coltitle">THE BOARD</div>
          <div className="stat" data-tip={TIPS.aiMarket}><span>AI MARKET</span><span>{worldCustomers(w).toFixed(1)}B / 8B</span></div>
          <div className="stat" data-tip={TIPS.frontier}><span>AI FRONTIER</span><span style={{ textShadow: `0 0 ${Math.round(w.frontier * 1.2)}px rgba(255, 176, 0, 0.9)` }}>{String(Math.round(w.frontier)).padStart(3)} {bar(w.frontier)}</span></div>
          <div className="stat" data-tip={TIPS.tension}><span>TENSION</span><span className={w.tension < 2 ? 'green' : w.tension > 6 ? 'redtext' : ''}>{String(Math.round(w.tension)).padStart(3)} {bar(w.tension)}</span></div>
          <div className="stat" data-tip={TIPS.humanControl}><span>HUMAN CONTROL</span><span className={w.humanControl >= 70 ? 'green' : w.humanControl <= 45 ? 'redtext' : ''}>{`${Math.round(w.humanControl)}%`.padStart(4)} {bar(w.humanControl / 10)}</span></div>
          <div className="stat" data-tip={TIPS.worldArsenals}><span>WORLD ARSENALS</span><span>{totalUnits(w).toLocaleString('en-US')}</span></div>
          {w.asi && (
            <pre className="glow">
{`${w.asi.arsenalsHeld.length} ARSENAL${w.asi.arsenalsHeld.length === 1 ? ' IS' : 'S ARE'} NOT ANSWERING.
DETERRENCE RETURNS NULL. CONTAINMENT REQUIRES THREE.
`}
            </pre>
          )}
          <pre className={w.treatyRung >= 1 ? 'green' : 'redtext'} data-tip={TIPS.regime}>
{w.treatyRung >= 1
  ? `REGIME: ${RUNGS[w.treatyRung - 1]} (RUNG ${w.treatyRung}/${RUNGS.length})
YOUR POSTURE THIS YEAR: ${w.playerPosture.toUpperCase()}`
  : 'NO TREATY REGIME IN FORCE.'}
          </pre>
        </div>
      </div>

      <div className="panelhdr">CONTROL PANEL</div>
      <div className="actionbar">
        {panels.map((g) => (
          <div key={g.title} className={`agroup${armedCol === g.title[0] ? ' armed' : ''}`}>
            <div className={`agrouptitle${armedCol === g.title[0] ? ' armed' : ''}`}>
              <span data-tip={GROUP_TIPS[g.title]}><u>{g.title[0]}</u>{g.title.slice(1)}</span>
            </div>
            {g.acts.map((a, i) => {
              const cost = costFor(a.id, p, w)
              const ok = p.budget >= cost && a.available(p, w)
              const reason = ok ? null : unavailableReason(a.id, p, w)
              // Tutorial keeps the hint under the refusal, so a player can
              // still see what the button WOULD do (and plan budget for it).
              const hint = hintFor(a, p, w)
              const baseTip = reason ? (tutorial ? `${reason}\n\n${hint}` : reason) : hint
              const tip = tutorial ? tutorTip(baseTip, a.label) : baseTip
              // 'inert', not disabled: disabled controls swallow touch events
              // entirely (iOS won't even propagate them), killing the flip.
              return (
                <button key={a.id} className={`act${ok ? '' : ' inert'}`} aria-disabled={!ok} data-tip={tip} onClick={() => { if (ok) onAction(a.id) }}>
                  <span><span className="keyhint">{i + 1}</span> {SHORT_LABEL[a.id] ?? a.label}</span>
                  <span className="cost">¤{cost}</span>
                </button>
              )
            })}
          </div>
        ))}
        <div className="endcell">
          <button className="endyear" data-tip={TIPS.endyear} onClick={onEndYear}><span className="tri">▸</span>END YEAR</button>
        </div>
      </div>
      <pre className="dim footnote" style={{ textAlign: 'center' }}>{p.f.motto}</pre>
    </div>
  )
}
