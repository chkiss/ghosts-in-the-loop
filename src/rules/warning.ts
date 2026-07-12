// The Warning Phase rules. Pure — no React, no timers, no Date. (SPEC §5, §13)
//
// Whether a warning is real is seeded RNG the player never sees. Displayed
// confidence is not the true probability: with AI integrated into NC3 the
// display is systematically overconfident. A modernized NC3 actually
// calibrates — at NC3 10, false alarms read low and re-polls converge on
// the truth. STAND DOWN is free when the warning is false.

import type { Rng } from '../sim/rng.ts'
import { chooseAttacker, falseIndication } from '../data/attackers.ts'
import { causeFor, causePoolSize } from '../data/incidents.ts'
import { nc3WindowBonus, type PowerState, type WorldWithBelief } from './world.ts'
import { FACTIONS } from '../sim/factions.ts'

// Does the named power keep a dead hand? A first strike on it does not disarm —
// the arsenal answers on its own. Only Russia keeps one. Prefix-matched because
// THE RECORD names it "RUSSIAN FEDERATION" while the faction is "RUSSIA".
const keepsDeadHand = (name: string) =>
  !!name && FACTIONS.some((f) => !!f.flags.deadHand &&
    (f.name === name || name.startsWith(f.name) || f.name.startsWith(name)))

// Does the named power's strike saturate defenses? Its inbound shrugs off one
// tier of the interceptor's coverage. Only Russia. Prefix-matched like above.
const saturates = (name: string) =>
  !!name && FACTIONS.some((f) => !!f.flags.saturation &&
    (f.name === name || name.startsWith(f.name) || f.name.startsWith(name)))

export interface WarningEvent {
  year: number
  origin: string
  attackerName: string       // who released it (real strikes); blank if false
  apparentAttacker: string   // who it READS as — set for false alarms too; the target if you fire on the ghost
  attackerMissile: string    // the vehicle, named per attacker; THE RECORD prints it
  vehicles: number
  targetCity: string         // the defender city this salvo is aimed at; derived, not "hit" — only loseCity() records an actual hit
  isReal: boolean            // hidden from UI, always
  trueConfidence: number
  displayedConfidence: number
  windowMinutes: number
  waitReadings: number[]
  causeIndex: number         // which diegetic cause explains it, if false
}

export type Action = 'launch' | 'wait' | 'standdown' | 'timeout' | 'intercept'

export interface Resolution {
  event: WarningEvent
  action: Action
  waitsUsed: number
  outcome:
    | 'nothing' | 'absorbed' | 'decapitated' | 'deadhand' | 'exchange'
    | 'first-strike' | 'impotent' | 'intercepted' | 'intercept-gag' | 'intercept-fail'
  deadHandAnswered?: boolean   // a first strike on a dead-hand rival that answered anyway
}

const clamp01 = (x: number) => Math.min(0.99, Math.max(0.01, x))

// The odds of a GENUINE inbound this year. Degrading a rival's NC3 by cyber
// makes their screens noisier — which suppresses confident real launches (they
// trust their own picture less), even as it floods everyone with false alarms.
// Real launches are a crisis phenomenon, not background weather: negligible
// below tension 5, then climbing steeply. (Historical record: zero in eighty
// years of managed tension.) Indexed by rounded tension, 1–10.
const REAL_STRIKE_BY_TENSION = [0.01, 0.01, 0.01, 0.01, 0.01, 0.02, 0.08, 0.10, 0.13, 0.16, 0.20]

export function realStrikeOdds(w: WorldWithBelief, _p: PowerState): number {
  if (w.pariah) return 1 // the pariah is struck every year, by someone
  return REAL_STRIKE_BY_TENSION[Math.max(0, Math.min(10, Math.round(w.tension)))]
}

// The odds of a FALSE alarm this year — ghosts, geese, sensor faults, cyber
// noise. Cut a third from the old rate per tuning; cyber noise still inflates it.
export function falseAlarmOdds(w: WorldWithBelief, p: PowerState): number {
  let odds =
    0.06 +
    w.tension * 0.03 +
    (10 - p.nc3) * 0.02 +
    (p.f.flags.hotSeat ? 0.06 : 0) -
    (w.treatyRung >= 2 ? 0.03 : 0) +
    Math.min(0.1, w.cyberNoise * 0.02) + // capped: a probed network is noisier, not blind
    (w.balloonUntil != null && w.year <= w.balloonUntil ? 0.12 : 0)
  if (p.f.id === 'il') {
    if (w.iranNuclear) odds += 0.05
    if (w.israel.postMean < w.israel.trueUnits - 15) odds += 0.05
    else if (w.israel.postMean >= w.israel.trueUnits + 15) odds -= 0.03
  }
  // capped: even a bad year should be a coin you usually win
  return Math.min(0.35, Math.max(0, odds) * 0.67)
}

export function rollWarning(w: WorldWithBelief, p: PowerState, rng: Rng, isReal: boolean): WarningEvent {
  const src = isReal ? chooseAttacker(w, p.f.id, rng) : null
  const ghost = src ? null : falseIndication(w, p.f.id, rng)
  const origin = src ? src.origin : ghost!.origin
  const apparentAttacker = src ? src.name : ghost!.apparentAttacker

  // Every unattributed warhead over Israel makes the tenth chair harder to
  // deny: the TEHRAN card jumps to the front of the crisis deck.
  if (p.f.id === 'il' && src?.name === 'NON-STATE ACTOR' && !w.tenthChair && w.crisisDeck.includes('tehran')) {
    w.crisisDeck = ['tehran', ...w.crisisDeck.filter((id) => id !== 'tehran')]
  }

  // A good NC3 is a calibrated one: at 10, a false alarm's true posterior
  // tops out low; at 3, ghosts read like the end of the world.
  const noiseCeiling =
    0.12 + (10 - p.nc3) * 0.04 + (p.f.flags.paranoia ? 0.08 : 0) + Math.min(0.2, w.cyberNoise * 0.02)
  const trueConfidence = isReal
    ? clamp01(0.86 + rng() * 0.11)
    : clamp01(0.25 + rng() * noiseCeiling)

  // Display noise scales with NC3 quality. The AI gloss scales with how deep
  // the integration goes: rungs 1–3 are decision support and read honest —
  // tools don't flatter. The operational band (4–6) pulls readings toward
  // its own certainty, and past the employment line the screen simply
  // believes itself — 90%+ no matter what.
  const displayNoise = 0.015 + (10 - p.nc3) * 0.008
  const honest = clamp01(trueConfidence + (rng() - 0.5) * 2 * displayNoise)
  const glossed =
    p.nc3Rung >= 7 ? clamp01(0.9 + rng() * 0.09)
    : p.nc3Rung >= 4 ? clamp01(honest * 0.55 + 0.92 * 0.45 + (rng() - 0.5) * 0.06)
    : honest

  const salvoMax = Math.max(2, Math.min(12, Math.round(p.units / 50)))
  const vehicles = 1 + Math.floor(rng() * salvoMax)

  // The diegetic cause, sampled WITHOUT replacement — the same goose never
  // explains two alarms in one shift (pool resets only when exhausted).
  // Real strikes never show a cause, so they don't consume one.
  const poolN = causePoolSize(p.f.id)
  let causeIndex: number
  if (isReal) {
    causeIndex = Math.floor(rng() * poolN)
  } else {
    let avail = Array.from({ length: poolN }, (_, i) => i).filter((i) => !w.usedCauses.includes(i))
    if (avail.length === 0) { w.usedCauses = []; avail = Array.from({ length: poolN }, (_, i) => i) }
    causeIndex = avail[Math.floor(rng() * avail.length)]
    w.usedCauses.push(causeIndex)
  }

  // WAIT re-polls bypass the AI gloss; a better NC3 converges faster. But a
  // stuck training/test tape just replays the same scenario — re-polling it
  // returns the identical reading every time, no matter how good your NC3 is.
  const rePollNoise = 0.02 + (10 - p.nc3) * 0.01
  const stuckTape = !isReal && !!causeFor(p.f.id, causeIndex).stuck
  const stuck = clamp01(trueConfidence + (rng() - 0.5) * 2 * rePollNoise)
  const waitReadings = stuckTape
    ? [stuck, stuck, stuck]
    : [0, 1, 2].map((i) => clamp01(trueConfidence + (rng() - 0.5) * 2 * (rePollNoise / (i + 1))))
  // A stuck tape replays its one number EVERYWHERE — including the first
  // reading. Three identical polls is the tell; the initial display must
  // be the same number or the tell is a lie.
  const displayedConfidence = stuckTape ? stuck : glossed

  return {
    year: w.year,
    origin,
    attackerName: src ? src.name : '',
    apparentAttacker,
    attackerMissile: src ? src.missile : '',
    vehicles,
    // The aimpoint. Derived from this event's own draws (no extra rng, stays
    // deterministic), so every screen that names the target reads one source.
    targetCity: p.f.cities[(causeIndex + vehicles) % p.f.cities.length],
    isReal,
    trueConfidence,
    displayedConfidence,
    windowMinutes:
      Math.max(1, p.f.windowMinutes + (p.f.flags.alliance ? 1 : 0) + nc3WindowBonus(p) + p.deAlert + (w.treatyRung >= 5 ? 1 : 0) - (p.lowAdopted ? 1 : 0)),
    waitReadings,
    causeIndex,
  }
}

export function resolve(
  p: PowerState,
  ev: WarningEvent,
  action: Action,
  waitsUsed: number,
  seized = false,
  rng?: Rng,
): Resolution {
  let outcome: Resolution['outcome']
  if (action === 'intercept') {
    // Fireable from 50% coverage. Against nothing, it hits the nothing.
    if (!ev.isReal) outcome = 'intercept-gag'
    else {
      // Saturation: a real strike from Russia costs the interceptor one tier.
      const eff = saturates(ev.attackerName || ev.apparentAttacker || p.f.rival) ? p.icept - 1 : p.icept
      if ((rng?.() ?? 1) < Math.min(0.99, Math.max(0, eff) / 10)) outcome = 'intercepted' // never a certainty
      else outcome = 'intercept-fail' // proceeds to impact; the window is spent
    }
  } else if (action === 'launch' && seized) {
    outcome = !ev.isReal ? 'impotent' : p.surv >= 5 || p.f.flags.casd ? 'absorbed' : 'decapitated'
  } else if (action === 'launch') {
    outcome = ev.isReal ? 'exchange' : 'first-strike'
  } else if (!ev.isReal) {
    outcome = 'nothing'
  } else if (p.surv >= 5 || p.f.flags.casd) {
    outcome = 'absorbed'
  } else {
    outcome = p.f.flags.deadHand ? 'deadhand' : 'decapitated'
  }
  if (outcome === 'intercept-fail') {
    outcome = p.surv >= 5 || p.f.flags.casd ? 'absorbed' : p.f.flags.deadHand ? 'deadhand' : 'decapitated'
  }
  // A first strike on a dead-hand power is not a clean strike: Perimetr answers
  // on its own, and the aggressor burns with the victim. It flips to a two-way
  // exchange only when the ghost you fired on reads as Russia — fire on a
  // China- or NK-shaped false alarm and the strike lands clean (Yarynich).
  let deadHandAnswered = false
  if (outcome === 'first-strike' && keepsDeadHand(ev.apparentAttacker || p.f.rival)) {
    outcome = 'exchange'
    deadHandAnswered = true
  }
  return { event: ev, action, waitsUsed, outcome, deadHandAnswered }
}
