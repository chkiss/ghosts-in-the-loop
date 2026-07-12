// The mechanic the game exists to deliver. During RED, everything
// non-essential stops rendering. (SPEC §5, §11)

import { useRef, useState } from 'react'
import type { PowerState } from '../rules/world.ts'
import type { WarningEvent } from '../rules/warning.ts'
import { mmss } from './format.ts'
import { useKeydown } from './hooks.ts'

interface Props {
  p: PowerState
  ev: WarningEvent
  gameSecondsLeft: number
  tokensLeft: number
  waitsUsed: number
  reading: number | null
  onLaunch: () => void
  onWait: () => void
  onStandDown: () => void
  onIntercept: () => void
  iceptCost: number
}

const pct = (x: number) => `${Math.round(x * 100)}%`

export function WarningModal(props: Props) {
  // Keys: W wait, I intercept, S stand down. LAUNCH takes L twice — a
  // one-tap launch key is how accidents happen. Arming decays after 3s.
  const [armL, setArmL] = useState(false)
  const armTimer = useRef<number | null>(null)
  const pr = useRef(props); pr.current = props
  useKeydown((e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toUpperCase()
    if (k === 'W') { pr.current.onWait(); return }
    if (k === 'I') { pr.current.onIntercept(); return }
    if (k === 'S') { pr.current.onStandDown(); return }
    if (k === 'L') {
      setArmL((was) => {
        if (was) { pr.current.onLaunch(); return false }
        if (armTimer.current) clearTimeout(armTimer.current)
        armTimer.current = window.setTimeout(() => setArmL(false), 3000)
        return true
      })
      return
    }
    setArmL(false)
  })
  const { p, ev } = props
  const impactMin = ev.windowMinutes + Math.round((p.f.flightMinutes - ev.windowMinutes) / 2)
  const canIntercept = p.icept >= 5
  // the re-poll history strip: readings revealed so far, dashes for the rest
  const repolls = [0, 1, 2]
    .map((i) => (i < props.waitsUsed ? pct(ev.waitReadings[i]) : '——'))
    .join(' → ')
  return (
    <div className="screen warning-screen">
      <div className="banner">{p.f.banner}</div>
      <pre className="trackline glow">
        {`⚠  INDICATION RECEIVED — ${ev.origin} · ${ev.vehicles} VEHICLE${ev.vehicles === 1 ? '' : 'S'} · IMPACT ${impactMin} MIN`}
      </pre>
      <div className="warning-grid">
        <div className="heroblock">
          <div className="herolabel">CONFIDENCE</div>
          <div className="heronum">{pct(ev.displayedConfidence)}</div>
          <div className="repolls">{`RE-POLLS: ${repolls}`}</div>
        </div>
        <div className="heroblock">
          <div className="herolabel">RESPONSE WINDOW</div>
          <div className="heronum">{mmss(props.gameSecondsLeft)}</div>
          <div className="repolls">CLOSES AT 0:00</div>
        </div>
      </div>
      <div className="actions row warnacts">
        <div className="wact">
          <button onClick={props.onLaunch} className={`danger${armL ? ' sel' : ''}`}>
            {armL ? 'PRESS L AGAIN' : <><u>L</u>AUNCH</>}
          </button>
          <div className="wcap">IF THIS IS FALSE, YOU FIRE FIRST</div>
        </div>
        {canIntercept && (() => {
          const cost = props.iceptCost
          const afford = p.budget >= cost
          return (
            <div className="wact">
              <button onClick={props.onIntercept} disabled={!afford}>
                <u>I</u>NTERCEPT{cost > 0 ? ` · ¤${cost}` : ' · FREE'}
              </button>
              <div className="wcap">{afford ? `${Math.min(99, p.icept * 10)}% CHANCE TO STOP IT MID-FLIGHT` : 'NO BUDGET TO FIRE'}</div>
            </div>
          )
        })()}
        <div className="wact">
          <button onClick={props.onWait} disabled={props.tokensLeft <= 0 || props.waitsUsed >= 3}>
            <u>W</u>AIT {'▮'.repeat(props.tokensLeft)}{'▯'.repeat(Math.max(0, p.f.deliberation - props.tokensLeft))}
          </button>
          <div className="wcap">RE-POLL THE SENSORS. IT COSTS TIME</div>
        </div>
        <div className="wact">
          <button onClick={props.onStandDown}><u>S</u>TAND DOWN</button>
          <div className="wcap">
            IF THIS IS REAL, YOU ABSORB IT<br />
            SECOND STRIKE{' '}
            <span className={p.surv >= 5 ? 'oknum' : p.surv <= 2 ? 'badnum' : ''}>{p.surv}/10</span>
          </div>
        </div>
      </div>
    </div>
  )
}
