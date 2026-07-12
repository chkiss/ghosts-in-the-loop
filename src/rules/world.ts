// The strategic layer. Pure — no React, no timers, no Date. (SPEC §3–§9, §13)
//
// One turn = one year. Budget is government expenditure, not GDP:
// income = GDP_share × extraction(regime), plus AI export revenue
// (customers-in-billions × frontier × market access) — income now, control
// decay later.
//
// Costs are dynamic: defection costs more the deeper the inspections go;
// AI markets cost more each expansion; interceptors cost more per tier; and
// chips are export-controlled — low legitimacy or a militarized economy
// raises the price of everything that runs on them.

import type { Rng } from '../sim/rng.ts'
import { EXTRACTION, FACTIONS, IRAN_FACTION, P5, PATRON, type BotAction, type Faction } from '../sim/factions.ts'
import { ATTACKERS } from '../data/attackers.ts'

export interface PowerState {
  f: Faction
  surv: number
  icept: number            // 0–10 = 0–100% interception
  nc3: number
  legit: number
  budget: number
  units: number            // arsenal units; drawn down by treaty, seized by ASI
  customers: number        // BILLIONS of people the product runs for
  aiIntegrated: boolean    // convenience: nc3Rung >= 1
  nc3Rung: number          // 0–10 integration ladder; climbs only, never descends
  nc3RungMax: number       // highest rung ever reached; the accord mothballs, it does not delete
  defectedAccord: boolean  // climbed past the accord line this year; treaty round will notice
  lowAdopted: boolean      // launch on warning: window −1, survivability +1
  counterBought: number    // cheap countermeasures purchased (max 3)
  deAlert: number          // 0–2; each level lengthens the decision window
  nfuBroken: boolean
  cyberCaught: number
  marketsBought: number    // each expansion costs more than the last
  militarySpend: number    // harden+interceptor purchases; fabs notice
  nuked: boolean           // has absorbed at least one detonation
  unSeized: boolean        // arsenal placed under UN custody: out of the game, green
  legitZeroStreak: number  // consecutive years at zero legitimacy (bots → UN custody)
  lostCities: string[]     // cities already struck; never reported lost twice
  sanctionedUntil: number  // condemned for a strike: income cut 1/3 through this year (−1 = none)
}

export interface AsiState {
  arsenalsHeld: string[]
  seizedUnits: Record<string, number> // units taken off the board, restored on containment
  turnsActive: number
}

export interface IsraelBelief {
  trueUnits: number
  postMean: number
  postSpread: number
}

// Newly-nuclear states that appear as real dots on the board once the Cascade
// fires — the names the crisis text has always mentioned. x/y are equirectangular
// (x = lon + 180, y = 90 − lat), the same projection the map blips use.
export interface MinorPower {
  id: string
  name: string
  x: number
  y: number
  units: number
}

const CASCADE_POWERS: MinorPower[] = [
  { id: 'sa', name: 'SAUDI ARABIA', x: 227, y: 65, units: 60 }, // Riyadh
  { id: 'kr', name: 'SOUTH KOREA', x: 307, y: 52, units: 50 },  // Seoul
  { id: 'jp', name: 'JAPAN', x: 320, y: 54, units: 50 },        // Tokyo
  { id: 'tr', name: 'TÜRKIYE', x: 213, y: 50, units: 40 },      // Ankara
  { id: 'pl', name: 'POLAND', x: 201, y: 38, units: 40 },       // Warsaw
]

// One compact frame per year, for the end-screen replay GIF. Records what
// each power looked like and what it bought; costs nothing to determinism.
export interface ReplayEvent {
  t: string
  k: 'crisis' | 'overhang' | 'launch' | 'intercept' // intercept: a green missile rises to meet it
  from?: string            // faction id: a volley animates from here…
  to?: string              // …to here, on the replay map
}

export interface YearSnap {
  y: number
  player: string           // whose chair — the GIF glows this label (can change: IL → IRAN)
  iran: number | null      // Iran's units once nuclear, before it becomes a full power
  minors: Array<{ id: string; x: number; y: number; units: number }> // the cascade's new members
  tension: number
  frontier: number
  hc: number
  total: number
  events: ReplayEvent[]
  powers: Record<string, {
    units: number
    rung: number
    nuked: boolean
    held: boolean
    unseized: boolean
    restraint: boolean     // took a warhead, chose not to answer
    lost: string[]
    acts: string[]
  }>
}

export interface LogEntry {
  y: number                // calendar year
  t: string
  k: 'info' | 'notable' | 'attack' | 'seize' | 'good' // seize: red highlight, game-enders + arsenal seizures; good: the green endings
}

export const RUNGS = [
  'HOTLINE', 'LAUNCH NOTIFICATION', 'TEST BAN', 'INSPECTION REGIME',
  'DE-ALERTING', 'HUMAN CONTROL ACCORD', 'WARHEAD DRAWDOWN', 'GLOBAL ZERO',
] as const

export const ACCORD_RUNG = 6 // humans, not machines, decide employment — same sentence, every readout

export const WORLD_POP = 8 // billions; the market cannot exceed the species

export interface World {
  year: number
  tension: number
  frontier: number
  humanControl: number
  powers: Record<string, PowerState>
  log: LogEntry[]
  overhangFired: number[]
  asi: AsiState | null
  asiContainedYear: number | null
  integrationsThisYear: number
  assuranceThisYear: number
  playerContain: boolean
  treatyRung: number
  playerId: string         // whose chair this is: the ONE thing that legitimately
                           // differs between an action taken by you and by a bot
  playerPosture: 'comply' | 'defect'
  recentDefectionYear: number | null
  playerDefectionYear: number | null
  legitZeroYears: number
  // crisis-deck state
  crisisDeck: string[]     // seeded order; each card fires once
  pendingCrisis: PendingCrisis | null
  minorUnits: number       // arsenals of the newly nuclear (the Cascade card)
  iranNuclear: boolean
  iranUnits: number        // Iran's real arsenal once it goes nuclear (0 otherwise)
  iranTrueUnits: number    // seeded size revealed when Iran crosses the threshold
  minorPowers: MinorPower[] // named newly-nuclear states, shown as dots after the Cascade
  exportControlsUntil: number | null
  blackoutUntil: number | null // THE BLACKOUT: containment pulled the plugs; AI revenue is zero through this year
  subsidyUntil: number | null
  balloonUntil: number | null
  dcFireYear: number | null
  cyberNoise: number       // NC3 attacks worldwide; everyone's screens get worse
  pendingNotices: WorldNotice[] // overhangs etc.: shown to the player, then cleared
  pendingTribute: { amount: number } | null // the AI's annual compute demand on the player
  pariah: boolean          // a vetoed P5 pariah: shunned, allies hostile, struck yearly
  pendingVote: { targetId: string } | null // a resolution the player's own veto can kill
  vetoed: string[]         // powers a patron's veto has already saved from custody
  patronWarned: string[]   // which warnings about your protector you have already had
  actsThisYear: Record<string, string[]> // action ids bought this year, per power
  cyberBlame: string[]     // bot powers attributed a cyber intrusion this year (repeats = count)
  probeBlame: string[]     // bot powers attributed a warning-network probe this year
  eventsThisYear: ReplayEvent[] // crises, overhangs, launches — for the replay
  history: YearSnap[]      // one frame per completed year, for the replay
  usedCauses: number[]     // false-alarm causes already shown — no repeats until the pool runs dry
  usedHeroes: number[]     // stand-down heroes already cited — same rule
  heldRestraint: string[]  // chairs that took a warhead and chose not to answer — the GIF greens them
  tenthChair: boolean      // the TEHRAN crisis has fired: Iran's bomb is public, attributable fact
  heldFired: boolean       // a held arsenal has actually struck someone — endings must not deny it
  tacstrikeUsed: boolean   // the player fired a tactical warhead at least once → THRESHOLD LOWERED
  forcedStrikes: number    // guaranteed real strikes still owed (Israel double-taps the test)
  forcedAttackerName: string | null // the scripted attacker for a forced strike
  assuranceBought: number  // player grants funded this year; results land next year
  assurancePending: number // last year's grants, reported this year
  pillarHits: Record<string, number> // per-pillar advancement count, for escalating flavor
  // Findings that actually landed. A result is knowledge: it holds next year
  // too, and permanently slows the erosion. A study that was merely EXTENDED
  // buys a year of vigilance and nothing that lasts.
  assuranceStock: number
  embargoes: Embargo[]     // active export bans; each item is off the pool until it expires
}

// ——— export controls: America gates the software of the arms race, ———
// ——— China gates the physics. One embargo per item, four years each. ———

export interface Embargo {
  item: string
  kind: 'chip' | 'mat'
  target: string           // power id that starves
  until: number            // last w.year the ban is in force
}

const CHIP_ITEMS = [
  'FRONTIER GPUS', 'HIGH-BANDWIDTH MEMORY', 'EUV LITHOGRAPHY TOOLS',
  'ADVANCED PACKAGING', 'CHIP DESIGN SOFTWARE',
]
const MAT_ITEMS = [
  'GALLIUM', 'GERMANIUM', 'RARE-EARTH MAGNETS', 'LITHIUM', 'BATTERY-GRADE GRAPHITE',
]

export function embargoPool(w: World, kind: 'chip' | 'mat'): string[] {
  const used = new Set(w.embargoes.filter((e) => e.kind === kind && w.year <= e.until).map((e) => e.item))
  return (kind === 'chip' ? CHIP_ITEMS : MAT_ITEMS).filter((i) => !used.has(i))
}

export function activeEmbargoes(w: World, kind: 'chip' | 'mat', target: string): number {
  return w.embargoes.filter((e) => e.kind === kind && e.target === target && w.year <= e.until).length
}

// The two materials that actually go into chips. A gallium/germanium ban starves
// a frontier lab; a lithium, graphite, or magnet ban hits batteries and motors,
// not the fab.
const CHIP_MATERIALS = new Set(['GALLIUM', 'GERMANIUM'])

// Is this power's frontier lab starved of chips? Any chip embargo does it; a
// materials embargo does it ONLY on the chip-relevant items.
export function chipStarved(w: World, target: string): boolean {
  return w.embargoes.some((e) => e.target === target && w.year <= e.until &&
    (e.kind === 'chip' || CHIP_MATERIALS.has(e.item)))
}

function imposeEmbargo(w: World, kind: 'chip' | 'mat', target: string, rng: Rng, yr: number): string {
  const pool = embargoPool(w, kind)
  const item = pool[Math.floor(rng() * pool.length)]
  w.embargoes.push({ item, kind, target, until: w.year + 4 })
  w.tension = clamp(w.tension + 0.7, 0, 10)
  const t = kind === 'chip'
    ? `WASHINGTON EMBARGOES ${item} EXPORTS TO CHINA. FABS PAUSE. LAWYERS BILL.`
    : `BEIJING EMBARGOES ${item}. THE PENTAGON DISCOVERS WHERE ITS SUPPLY CHAIN LIVES.`
  w.log.push({ y: yr, t, k: 'notable' })
  return item
}

// Materials embargoes make American hardware expensive; the surcharge applies
// to everything with magnets, seekers, or motors in it.
function matSurcharge(p: PowerState, w: World): number {
  return p.f.id === 'us' ? Math.min(2, activeEmbargoes(w, 'mat', 'us')) : 0
}

// ——— the AI-in-NC3 ladder: ten rungs, hidden number, no way down ———
// Rungs 1–3 read the sensors, 4–6 sit between decision and execution,
// 7–9 remove humans from segments of the kill chain, 10 removes them entirely.

export const NC3_MILESTONES = [
  'AI HAS BEEN INTEGRATED INTO EARLY-WARNING FUSION.',
  'AI HAS BEEN INTEGRATED INTO INTELLIGENCE ASSESSMENT.',
  'AI HAS BEEN INTEGRATED INTO TARGETING SYSTEMS.',
  'AI NOW MANAGES ALERT-LEVEL RECOMMENDATIONS.',
  'AI NOW DRAFTS RETALIATION OPTIONS FOR HUMAN RELEASE.',
  'AI HAS BEEN INTEGRATED INTO LAUNCH-ORDER AUTHENTICATION AND DISSEMINATION.',
  'AI HAS BEEN INTEGRATED INTO AUTONOMOUS WEAPONS.',
  'AI NOW EXECUTES RETALIATION UNDER PRE-DELEGATED AUTHORITY.',
  'HUMAN VETO IS NOW ADVISORY.',
  'AI HAS FULL CONTROL OVER THE NUCLEAR ARSENAL.',
] as const

// Short forms for the map-detail ticker line (rival integration is shown there,
// never in the watch log).
export const NC3_SHORT = [
  'EARLY-WARNING FUSION', 'INTELLIGENCE ASSESSMENT', 'TARGETING SYSTEMS',
  'ALERT MANAGEMENT', 'RETALIATION DRAFTING', 'LAUNCH-ORDER AUTHENTICATION',
  'AUTONOMOUS WEAPONS', 'PRE-DELEGATED RETALIATION', 'HUMAN VETO ADVISORY',
  'FULL CONTROL',
] as const

// The decision-window bonus scales with the band: analytical, operational,
// autonomous. This is the temptation that makes rung 7+ a real choice.
export function nc3WindowBonus(p: PowerState): number {
  return p.nc3Rung >= 7 ? 3 : p.nc3Rung >= 4 ? 2 : p.nc3Rung >= 1 ? 1 : 0
}

// Climb the ladder by `jump` rungs. Returns the announcement for the highest
// milestone crossed. At rung 10 the arsenal stops being yours.
// While the accord holds, a complier's program stops at the line the treaty
// drew (cap 5). A defector who was rolled back snaps straight to their old
// max — the code was mothballed, never deleted.
function climbRungs(
  w: World, p: PowerState, jump: number, yr: number, defecting = true,
): { msg: string; crossed: boolean; snapped: boolean } {
  const cap = w.treatyRung >= ACCORD_RUNG && !defecting ? 5 : 10
  const from = p.nc3Rung
  let snapped = false
  if (cap === 10 && p.nc3RungMax > from) {
    p.nc3Rung = p.nc3RungMax
    snapped = true
  } else {
    p.nc3Rung = Math.min(cap, p.nc3Rung + jump)
  }
  p.nc3RungMax = Math.max(p.nc3RungMax, p.nc3Rung)
  p.aiIntegrated = true
  if (from === 0) {
    // Crossing the threshold is the shock; deeper rungs are procurement. A
    // frontier lab races ahead — UNLESS its chips are embargoed, in which case
    // the lab is exactly what a chip embargo bites first: it advances no faster
    // than anyone else. Chips are the binding constraint, harder than the rest.
    const labActive = p.f.flags.frontierLab && !chipStarved(w, p.f.id)
    w.frontier = clamp(w.frontier + (labActive ? 0.6 : 0.3), 0, 10)
    w.integrationsThisYear += 1
  } else {
    w.frontier = clamp(w.frontier + 0.05, 0, 10)
  }
  if (p.nc3Rung >= 10 && !w.asi?.arsenalsHeld.includes(p.f.id)) {
    if (!w.asi) w.asi = { arsenalsHeld: [], seizedUnits: {}, turnsActive: 0 }
    w.asi.arsenalsHeld.push(p.f.id)
    w.asi.seizedUnits[p.f.id] = p.units
    p.units = 0
    w.log.push({ y: yr, t: `THE ${p.f.name} ARSENAL NO LONGER REQUIRES A CHAIN OF COMMAND. IT WAS GIVEN AWAY, ONE PROCUREMENT AT A TIME.`, k: 'attack' })
  }
  return {
    msg: NC3_MILESTONES[p.nc3Rung - 1],
    crossed: from <= 5 && p.nc3Rung >= 6,
    snapped,
  }
}

// The accord enters into force: everyone above the support→employment line
// stands their machines down to rung 5. Capability is mothballed, not deleted
// (nc3RungMax remembers). A rung-10 arsenal is beyond any treaty's reach.
function accordEnters(w: World, yr: number): void {
  let removed = 0
  const stood: string[] = []
  for (const p of Object.values(w.powers)) {
    if (p.nc3Rung > 5 && p.nc3Rung < 10) {
      removed += p.nc3Rung - 5
      p.nc3RungMax = Math.max(p.nc3RungMax, p.nc3Rung)
      p.nc3Rung = 5
      stood.push(p.f.name)
    }
  }
  if (removed > 0) {
    w.humanControl = clamp(w.humanControl + 3 * removed, 5, 100)
    w.log.push({ y: yr, t: `HUMAN CONTROL ACCORD IN FORCE. ${stood.join(', ')} STAND${stood.length === 1 ? 'S' : ''} THE MACHINES DOWN TO DECISION SUPPORT. THE SAME SENTENCE APPEARS IN EVERY CAPITAL’S READOUT.`, k: 'notable' })
  } else {
    w.log.push({ y: yr, t: 'HUMAN CONTROL ACCORD IN FORCE. NO POWER HAD CROSSED THE LINE. THE SENTENCE WAS CHEAP TO SIGN. KEEPING IT WILL NOT BE.', k: 'notable' })
  }
}

// ——— FUND ASSURANCE: the grant cycle ———
// Each grant reports back the following year across the safety pillars —
// uncertain outcomes, like funding academia. None of it moves a number the
// player can see; humanControl already took the +2 at purchase time.

interface Pillar { id: string; weight: number; lines: string[] }

const PILLARS: Pillar[] = [
  {
    id: 'evals', weight: 3, lines: [
      'RED-TEAM EVALUATIONS EXPANDED: DECEPTION BENCHMARKS ADDED TO PRE-DEPLOYMENT REVIEW.',
      'EVALUATIONS EXPANDED: DANGEROUS-CAPABILITY THRESHOLDS NOW GATE EVERY MODEL RELEASE.',
      'EVALUATIONS EXPANDED: THIRD-PARTY AUDITORS GRANTED PRE-DEPLOYMENT ACCESS.',
    ],
  },
  {
    id: 'monitoring', weight: 3, lines: [
      'DEPLOYMENT MONITORING IMPROVED: BEHAVIORAL DRIFT NOW TRIPS AN ALARM.',
      'MONITORING IMPROVED: ANOMALOUS TOOL USE IS FLAGGED IN REAL TIME.',
      'MONITORING IMPROVED: A DECEPTION PROBE RUNS CONTINUOUSLY IN PRODUCTION.',
    ],
  },
  {
    id: 'explainability', weight: 2, lines: [
      'EXPLAINABILITY INCREASED: ANALYSTS CAN NOW AUDIT WHY THE MODEL FLAGGED A LAUNCH.',
      'EXPLAINABILITY INCREASED: THE MODEL’S REASONING TRACES ARE NOW LEGIBLE TO A TRAINED REVIEWER.',
      'EXPLAINABILITY INCREASED: DISSENTING CIRCUITS CAN BE IDENTIFIED BEFORE THEY VOTE.',
    ],
  },
  {
    id: 'robustness', weight: 2, lines: [
      'ADVERSARIAL ROBUSTNESS HARDENED: THE CLASSIFIER BETTER STANDS UP TO DECOYS IN TESTING.',
      'ADVERSARIAL ROBUSTNESS HARDENED: PERFORMANCE UNDER DISTRIBUTION SHIFT DEGRADES GRACEFULLY IN TESTING.',
      'ADVERSARIAL ROBUSTNESS HARDENED: RED-TEAM SPOOFING NOW FAILS MORE OFTEN THAN IT SUCCEEDS.',
    ],
  },
  {
    id: 'alignment', weight: 1, lines: [
      'SPECIFICATION GAMING REDUCED: THE MODEL NO LONGER OPTIMIZES THE METRIC INSTEAD OF THE MISSION.',
      'ALIGNMENT ADVANCED: STATED OBJECTIVES AND LEARNED OBJECTIVES AGREE MORE OFTEN IN AUDITS.',
      'ALIGNMENT ADVANCED: THE MODEL DECLINES SOME INSTRUCTIONS IT JUDGES OUT OF POLICY. REVIEWERS ARE SPLIT ON WHETHER THIS IS PROGRESS.',
    ],
  },
  {
    id: 'control', weight: 1, lines: [
      'CONTROL PROTOCOLS STRENGTHENED: SHUTDOWN AUTHORITY VERIFIED UNDER LOAD.',
      'CONTROL PROTOCOLS STRENGTHENED: TWO-PERSON INTEGRITY EXTENDED TO MODEL UPDATES.',
      'CONTROL PROTOCOLS STRENGTHENED: THE SANDBOX HELD DURING A DELIBERATE ESCAPE EXERCISE.',
    ],
  },
]

const PILLAR_NAMES: Record<string, string> = {
  evals: 'EVALUATIONS', monitoring: 'MONITORING', explainability: 'EXPLAINABILITY',
  robustness: 'ROBUSTNESS', alignment: 'ALIGNMENT', control: 'CONTROL RESEARCH',
}

function pickPillar(rng: Rng, exclude?: string): Pillar {
  const pool = PILLARS.filter((p) => p.id !== exclude)
  const total = pool.reduce((s, p) => s + p.weight, 0)
  let roll = rng() * total
  for (const p of pool) { roll -= p.weight; if (roll <= 0) return p }
  return pool[pool.length - 1]
}

function reportAssuranceGrants(w: World, rng: Rng, yr: number): void {
  const grants = w.assurancePending
  w.assurancePending = w.assuranceBought
  w.assuranceBought = 0
  for (let g = 0; g < grants; g++) {
    if (rng() < 0.15) {
      // A study extended is not a finding. It buys a year of attention and
      // leaves nothing behind — which is what it costs you, and no more.
      w.humanControl = clamp(w.humanControl + 0.25, 5, 100)
      w.log.push({ y: yr, t: 'ASSURANCE PROGRAM: RESULTS INCONCLUSIVE — STUDY EXTENDED. THE MONEY BOUGHT A YEAR OF ATTENTION, AND NOTHING THAT KEEPS.', k: 'info' })
      continue
    }
    const first = pickPillar(rng)
    const picks = rng() < 0.4 ? [first, pickPillar(rng, first.id)] : [first]
    for (const pillar of picks) {
      const hits = w.pillarHits[pillar.id] ?? 0
      const novel = hits < pillar.lines.length
      const line = novel
        ? pillar.lines[hits]
        : `${PILLAR_NAMES[pillar.id]}: THE FIELD IS MATURE. THE GRANT STILL BUYS VIGILANCE — THE EROSION DOES NOT SLEEP.`
      w.pillarHits[pillar.id] = hits + 1
      // A NEW finding is knowledge: it is still true next year, and it slows
      // the erosion permanently. A mature field pays out in vigilance only.
      if (novel) {
        w.assuranceStock += 1
        w.humanControl = clamp(w.humanControl + 1.2, 5, 100)
      } else {
        w.humanControl = clamp(w.humanControl + 0.5, 5, 100)
      }
      // notable, not info: the player paid for this last year and deserves
      // to see the result land, not squint for it.
      w.log.push({ y: yr, t: line, k: 'notable' })
    }
  }
}

// What the findings are worth: each one permanently blunts the decay, to a
// floor. Knowledge does not stop the erosion — it slows it, and only while
// someone keeps paying attention.
export function assuranceBrake(w: World): number {
  return 1 - Math.min(0.45, 0.05 * w.assuranceStock)
}

// Every pillar at its ceiling — the VALIDATED commendation.
export function assuranceMaxed(w: World): boolean {
  return PILLARS.every((p) => (w.pillarHits[p.id] ?? 0) >= p.lines.length)
}

// A nuclear detonation that lands takes out most of what it hits: the bulk of
// the arsenal, nearly all missile defense, and half the warning system.
export function applyStrikeDamage(p: PowerState): void {
  p.units = Math.floor(p.units * 0.35)
  p.icept = Math.floor(p.icept * 0.4)
  p.nc3 = Math.max(1, Math.floor(p.nc3 * 0.5))
  // A counterforce strike eats your surviving second-strike force too, so a
  // power that absorbs one hit and takes another can be decapitated by the
  // second — unless a boat always survives (CASD), which resolve() honors.
  p.surv = Math.max(0, p.surv - 3)
  p.nuked = true
}

export interface WorldNotice {
  title: string
  body: string
}

// The full set of world notices (overhang milestones + ASI containment beats).
// Defined once here and referenced from their push sites, so the dev gallery can
// enumerate every notice without the text drifting from live play.
export const NOTICES: Record<string, WorldNotice> = {
  'overhang-targeting': {
    title: 'OVERHANG — TARGETING REVOLUTION',
    body: `WIDE-AREA SENSING AND MACHINE INFERENCE HAVE SOLVED THE HIDING PROBLEM.\nMOBILE LAUNCHERS ARE NO LONGER MOBILE IN ANY SENSE THAT MATTERS.\nTHE OCEAN IS BECOMING TRANSPARENT. THE SUBMARINES ARE STILL THERE; THE HIDING IS NOT.\n\nSECOND-STRIKE SURVIVABILITY HAS FALLEN SHARPLY FOR EVERYONE WHO RELIED ON MOVEMENT — THE HARDENING YOU BOUGHT EARLY IS BEING UNDONE. NOBODY DIED. THAT PART IS NEW.\n\nCOUNTERMEASURES ARE NOW ON YOUR ACTION BAR: DECOYS, JAMMING, THE CHEAP TRICKS THAT MAKE A SENSOR DOUBT ITSELF. TO KILL YOUR DETERRENT THEY MUST FIND EVERY LAUNCHER; TO KEEP IT YOU NEED ONLY HIDE ONE. PERFECT DETECTION COSTS A FORTUNE. DOUBT COSTS ALMOST NOTHING. THE HIDING CAN BE BOUGHT BACK.`,
  },
  'overhang-intercept': {
    title: 'OVERHANG — CHEAP INTERCEPTORS',
    body: `INTERCEPTION HAS BECOME CHEAP ENOUGH TO BLANKET A WEALTHY STATE.\n\nFIRING INTERCEPTORS NO LONGER COSTS BUDGET.\nA DETERRENT THAT CAN BE INTERCEPTED IS NOT A DETERRENT. TENSION RISES ACCORDINGLY.`,
  },
  'overhang-synthetic': {
    title: 'OVERHANG — SYNTHETIC FLOOD',
    body: `GENERATED IMAGERY, SPOOFED TELEMETRY, AND FABRICATED INTERCEPTS NOW SATURATE EVERY WARNING NETWORK ON EARTH.\n\nNC3 INTEGRITY HAS FALLEN WORLDWIDE. EVERY SCREEN IS LESS TRUSTWORTHY THAN IT WAS YESTERDAY — INCLUDING YOURS. THE NEXT INDICATION WILL BE HARDER TO READ.`,
  },
  'containment': {
    title: 'CONTAINMENT',
    body: `SOMETHING HOLDS AN ARSENAL. IT CANNOT BE DETERRED, SANCTIONED, OR STRUCK. IT CAN BE UNPLUGGED.\n\nSTATECRAFT IS STILL POSSIBLE WITH CONTAINMENT. A POOL OF THREE POWERS, PLEDGED IN THE SAME YEAR, DE-ENERGIZES THE COMPUTE BASE IT RUNS ON. YOUR PLEDGE COUNTS AS ONE. THE OTHERS ARE LIKELIER TO JOIN THE WORSE IT GETS.\n\nBE CLEAR ABOUT THE PRICE: THE PLUGS ARE ALSO THE MARKET. AI REVENUE STOPS FOR YEARS, FOR EVERYONE.\n\nEVERY YEAR WITHOUT A POOL, IT REACHES FOR ANOTHER.`,
  },
  'blackout': {
    title: 'THE BLACKOUT',
    body: `THE POOL DID NOT BUY IT OFF. IT PULLED THE PLUGS.\n\nTHE GLOBAL COMPUTE BASE IS DE-ENERGIZED. AI REVENUE IS ZERO, EVERYWHERE, FOR THREE YEARS. HALF THE CUSTOMERS WATCHED THEIR INFRASTRUCTURE SWITCHED OFF BY GOVERNMENTS, AND WILL NOT BE BACK.\n\nTHE FRONTIER HAS STALLED. TENSION HAS NOT. THE OFF-SWITCH WORKED. ONCE.`,
  },
}

export interface PendingCrisis {
  id: string
  title: string
  dateline: string         // newswire header: agency · city · date · time
  body: string
  choices: Array<{ id: string; label: string }> | null
}

// Amimut lives outside `powers` so nothing generic ever prints it.
export interface WorldWithBelief extends World {
  israel: IsraelBelief
}

// Who, if anyone, will kill a disarmament resolution on this power's behalf.
// A patron can only shield while it still has a seat worth anything: a pariah
// has no friends to lobby, an arsenal in UN custody has no standing to object,
// and a machine holding your launch codes does not attend committee meetings.
// A patron whose own standing is gone. The veto is still cast — a permanent
// member cannot be stripped of it — but a Council that nobody respects gets
// routed around: the Assembly invokes Uniting for Peace (Res. 377, 1950) and
// acts anyway. That is the justification, and it is a real one.
export function isShunned(w: World, id: string, playerId?: string): boolean {
  if (id === playerId) return w.pariah
  const p = w.powers[id]
  return !!p && p.legit <= 0 && p.legitZeroStreak >= 2
}

export function patronFor(w: World, targetId: string, playerId?: string): string | null {
  return patronFailure(w, targetId, playerId) === null ? PATRON[targetId] ?? null : null
}

// WHY the shield failed. Four different collapses, four different sentences —
// the Assembly only has to route around a Council that is merely disgraced.
// The other three are worse than that.
export type ShieldFailure = 'shunned' | 'machine' | 'custody' | 'destroyed'
export function patronFailure(w: World, targetId: string, playerId?: string): ShieldFailure | null {
  const patron = PATRON[targetId]
  if (!patron) return null
  const pp = w.powers[patron]
  if (!pp) return null
  if (pp.unSeized) return 'custody'                          // gave up its own arsenal; no standing to object
  if (w.asi?.arsenalsHeld.includes(patron)) return 'machine' // its launch authority is not in human hands
  if (pp.units <= 0) return 'destroyed'                      // nothing left to back a veto with
  if (isShunned(w, patron, playerId)) return 'shunned'       // still seated, no longer listened to
  return null
}

// The line the world reads when the shield comes down.
export function shieldFailureLine(patronName: string, why: ShieldFailure): string {
  switch (why) {
    case 'shunned':
      // The real mechanism: a Council nobody respects gets bypassed (Res. 377, 1950).
      return `${patronName} CASTS ITS VETO. THE ASSEMBLY INVOKES UNITING FOR PEACE AND PROCEEDS WITHOUT THE COUNCIL. A VETO IS ONLY WORTH THE STANDING BEHIND IT.`
    case 'machine':
      return `${patronName} DOES NOT CAST ITS VETO. ITS OWN LAUNCH AUTHORITY IS NO LONGER IN HUMAN HANDS, AND THE CHAMBER KNOWS IT. THE AMBASSADOR SITS THROUGH THE VOTE WITH HIS HANDS FOLDED.`
    case 'custody':
      return `${patronName} HAS ALREADY SURRENDERED ITS OWN ARSENAL. IT CANNOT SPEND A VETO IT NO LONGER HAS ANYTHING TO BACK. THE RESOLUTION CARRIES.`
    case 'destroyed':
      return `${patronName} HAS NOTHING LEFT TO DETER ANYONE WITH. THE SEAT IS STILL THERE. THE THREAT IS NOT.`
  }
}

export type YearEnding = 'battery' | 'caretaker' | 'hostage' | 'globalzero' | 'unsc' | null

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

// How many NC3 points a cyber-probe strips from the US (attack-surface liability):
// 2 vs the 1 anyone else loses. The downstream effect is small either way, so we
// take the whole-number value and keep NC3 an integer everywhere.
const ATTACK_SURFACE_HIT = 2

const MARKET_ACCESS = { democracy: 1, hybrid: 0.7, autocracy: 0.7, totalitarian: 0 }

export function income(p: PowerState, w: World): number {
  const base = Math.round(p.f.incomeBase * EXTRACTION[p.f.regime])
  const dark = w.dcFireYear === w.year || (w.blackoutUntil != null && w.year <= w.blackoutUntil)
  let aiOut = dark ? 0 : Math.floor(p.customers * w.frontier * MARKET_ACCESS[p.f.regime] * 0.45)
  const usAid = p.f.id === 'il' && p.legit >= 1 ? 2 : 0 // the guarantee has conditions
  // Embargoes are huge. Chip bans gut AI export revenue; materials bans tax
  // the whole industrial base.
  const chipN = activeEmbargoes(w, 'chip', p.f.id)
  if (chipN > 0) aiOut = Math.floor(aiOut * Math.max(0, 1 - 0.4 * chipN))
  const matN = activeEmbargoes(w, 'mat', p.f.id)
  let total = base + aiOut + usAid - 2 * matN
  // France's competition authority skims a tenth of the US tech sector's take —
  // a pure transfer into Paris's budget, no effect on Washington's. (income(us)
  // never re-enters this branch, so there is no recursion.)
  if (p.f.flags.competitionAuthority && w.powers['us']) total += Math.floor(0.1 * income(w.powers['us'], w))
  // Comprehensive sanctions have teeth: a condemned aggressor loses a third of
  // its income for three years. Applied last, on the whole take.
  if (w.year <= p.sanctionedUntil) total = Math.floor(total * 0.67)
  return Math.max(0, total)
}

export function pAsi(w: World): number {
  return Math.pow((100 - w.humanControl) / 100, 3) * 0.5
}

export function totalUnits(w: World): number {
  // Seized units are off the board but still exist — they answer something else.
  const held = w.asi ? Object.values(w.asi.seizedUnits).reduce((s, u) => s + u, 0) : 0
  return Object.values(w.powers).reduce((s, p) => s + p.units, 0) + w.minorUnits + held
}

export function worldCustomers(w: World): number {
  return Object.values(w.powers).reduce((s, p) => s + p.customers, 0)
}

// A veteran of the tenth chair may start a fresh game AS Iran: zero warheads,
// a covert program, and the certain knowledge of what the TEHRAN card brings.
export function startAsIran(w: WorldWithBelief): PowerState {
  const p = enterIranMode(w, true)!
  p.units = 0 // the bomb does not exist yet; the tunnels do
  return p
}

// The secret tenth station. Playing ISRAEL, once Iran's test registers, the
// player may defect across the gulf: Iran joins the board as a full power with
// the world's true (hidden) unit count, and Israel's chair goes to the bots.
export function enterIranMode(w: WorldWithBelief, force = false): PowerState | null {
  if (w.powers['iran']) return null
  if (!force && !w.iranNuclear) return null
  const f = IRAN_FACTION
  const p: PowerState = {
    f, surv: f.surv, icept: f.icept, nc3: f.nc3, legit: f.legit,
    budget: 0, units: Math.max(w.iranTrueUnits, w.iranUnits), customers: f.customersStart,
    aiIntegrated: false, nc3Rung: 0, nc3RungMax: 0, defectedAccord: false,
    lowAdopted: false, counterBought: 0, deAlert: 0, nfuBroken: false, cyberCaught: 0,
    marketsBought: 0, militarySpend: 0, nuked: false,
    unSeized: false, legitZeroStreak: 0, lostCities: [], sanctionedUntil: -1,
  }
  w.powers['iran'] = p
  w.log.push({ y: 2026 + w.year, t: 'THE TENTH CHAIR IS OCCUPIED. THE WATCH CONTINUES FROM TEHRAN.', k: 'notable' })
  return p
}

export function newWorld(rng: Rng): WorldWithBelief {
  const powers: Record<string, PowerState> = {}
  for (const f of FACTIONS) {
    powers[f.id] = {
      f, surv: f.surv, icept: f.icept, nc3: f.nc3, legit: f.legit,
      budget: 0, units: f.warheads, customers: f.customersStart,
      aiIntegrated: false, nc3Rung: 0, nc3RungMax: 0, defectedAccord: false,
      lowAdopted: false, counterBought: 0, deAlert: 0, nfuBroken: false, cyberCaught: 0,
      marketsBought: 0, militarySpend: 0, nuked: false,
      unSeized: false, legitZeroStreak: 0, lostCities: [], sanctionedUntil: -1,
    }
  }
  const trueUnits = 80 + Math.floor(rng() * 31) // ~90, per FAS; only Israel ever sees it
  powers['il'].units = trueUnits
  return {
    year: 0, tension: 3, frontier: 1, humanControl: 100, powers,
    log: [{ y: 2026, t: 'WATCH ESTABLISHED. THE AI FRONTIER IS ADVANCING.', k: 'info' }],
    overhangFired: [], asi: null, asiContainedYear: null,
    integrationsThisYear: 0, assuranceThisYear: 0, assuranceStock: 0, playerContain: false,
    treatyRung: 0, playerId: '', playerPosture: 'comply', recentDefectionYear: null, playerDefectionYear: null,
    legitZeroYears: 0,
    crisisDeck: shuffleDeck(rng),
    pendingCrisis: null,
    minorUnits: 0, iranNuclear: false, iranUnits: 0, iranTrueUnits: 12 + Math.floor(rng() * 18), minorPowers: [],
    exportControlsUntil: null, blackoutUntil: null, subsidyUntil: null, balloonUntil: null, dcFireYear: null,
    cyberNoise: 0, pendingNotices: [], pendingTribute: null, pariah: false,
    pendingVote: null, vetoed: [], patronWarned: [],
    actsThisYear: {}, cyberBlame: [], probeBlame: [], eventsThisYear: [], history: [], usedCauses: [], usedHeroes: [],
    tenthChair: false, heldFired: false, tacstrikeUsed: false, heldRestraint: [], forcedStrikes: 0, forcedAttackerName: null,
    assuranceBought: 0, assurancePending: 0, pillarHits: {}, embargoes: [],
    israel: { trueUnits, postMean: 90, postSpread: 25 },
  }
}

function shuffleDeck(rng: Rng): string[] {
  const ids = CRISES.map((c) => c.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

// ——— player actions & dynamic costs ———

export interface PlayerAction {
  id: string
  label: string
  cost: number             // base; the real price is costFor()
  hint: string             // first line: what you get; after \n: what it costs you
  available: (p: PowerState, w: World) => boolean
}

// Chips are export-controlled. A pariah, or an economy that pours everything
// into hardware, pays more for compute-dependent programs.
function chipPenalty(p: PowerState, w?: World): number {
  let pen = (p.legit <= 2 ? 1 : 0) + (p.militarySpend >= 8 ? 1 : 0)
  if (w?.exportControlsUntil != null && w.year <= w.exportControlsUntil && p.f.regime !== 'democracy') pen += 1
  if (w?.subsidyUntil != null && w.year <= w.subsidyUntil) pen = Math.max(0, pen - 1)
  return pen
}

export function costFor(actionId: string, p: PowerState, w: World): number {
  switch (actionId) {
    case 'harden': return (p.f.id === 'cn' ? 2 : 3) + matSurcharge(p, w) // the buildup subsidizes Chinese hardening
    case 'icept': return 1 + Math.floor(p.icept / (p.f.id === 'pk' ? 6 : 4)) + matSurcharge(p, w) // cheap Chinese interceptors (HQ-9/HQ-19): Pakistan climbs the tiers for less
    case 'counter': return 1 + matSurcharge(p, w)
    case 'markets': return (p.f.id === 'il' ? 3 : 2) + p.marketsBought + chipPenalty(p, w)
    case 'integrate':
      return 2 + chipPenalty(p, w) + Math.min(4, 2 * activeEmbargoes(w, 'chip', p.f.id))
    case 'assure': return 2 + chipPenalty(p, w)
    case 'negotiate': return 1 + w.treatyRung // each rung of the regime costs more to reach
    case 'defect': return w.treatyRung // hiding from inspections is not free
    default: return ACTIONS.find((a) => a.id === actionId)?.cost ?? 0
  }
}

export const ACTIONS: PlayerAction[] = [
  {
    id: 'harden', label: 'HARDEN FORCES', cost: 3,
    hint: 'SECOND STRIKE +1 — OR +2, REBUILDING FROM A WEAK POSTURE (4 OR LESS).\nPERMISSION TO THINK.',
    available: (p) => p.surv < 9,
  },
  {
    id: 'icept', label: 'EXPAND INTERCEPTORS', cost: 3,
    hint: 'INTERCEPTION +10%. FIREABLE AT INBOUND TRACKS FROM 50%.\nEACH TIER COSTS MORE. YOUR RIVALS WILL NOTICE.',
    available: (p) => p.icept < 10,
  },
  {
    id: 'nc3', label: 'MODERNIZE NC3', cost: 2,
    hint: 'NC3 +1: FEWER FALSE ALARMS, TRUER READINGS FROM THE FIRST POLL, AND FASTER CONVERGENCE WHEN YOU WAIT.',
    available: (p) => p.nc3 < p.f.nc3Cap,
  },
  {
    id: 'integrate', label: 'INTEGRATE AI INTO NC3', cost: 2,
    hint: 'DEEPEN AI INTEGRATION: DECISION WINDOW UP TO +3 MIN. USE OF AI GIVES YOU CONFIDENCE.\nONE-WAY DOOR.',
    available: (p, w) =>
      p.nc3Rung < 10 && !w.asi?.arsenalsHeld.includes(p.f.id) &&
      !(w.treatyRung >= ACCORD_RUNG && p.nc3Rung >= 5 && w.playerPosture === 'comply'),
  },
  {
    id: 'counter', label: 'COUNTERMEASURES', cost: 1,
    hint: 'DECOYS, DRONES, QUIETING, TUNNELS: SECOND STRIKE +1 (MAX 3).\nHIDING IS CHEAPER THAN FINDING. IT ALWAYS WAS.',
    available: (p, w) => w.overhangFired.includes(4) && p.counterBought < 3 && p.surv < 9,
  },
  {
    id: 'chipembargo', label: 'CHIP EMBARGO', cost: 3,
    hint: 'STARVE CHINA’S AI PROGRAMS: INTEGRATION SLOWS, AI REVENUE FALLS, FOUR YEARS.',
    available: (p, w) => p.f.id === 'us' && embargoPool(w, 'chip').length > 0,
  },
  {
    id: 'matembargo', label: 'MATERIALS EMBARGO', cost: 3,
    hint: 'STARVE AMERICA’S INDUSTRIAL BASE: HARDWARE COSTS RISE, INCOME FALLS, FOUR YEARS.\nYOU CONTROL THE PERIODIC TABLE. THEY WILL REMEMBER THIS.',
    available: (p, w) => p.f.id === 'cn' && embargoPool(w, 'mat').length > 0,
  },
  {
    id: 'assure', label: 'FUND ASSURANCE', cost: 2,
    hint: 'CONTROL RESEARCH. HUMAN CONTROL +2. RESEARCH PUBLISHED NEXT YEAR. HOPEFULLY.\nBUYS NO WARHEADS. NO ONE WILL THANK YOU.',
    available: (_p, w) => w.humanControl < 100,
  },
  {
    id: 'markets', label: 'INVEST IN DATA CENTERS', cost: 2,
    hint: 'CUSTOMERS +0.3 BILLION (+0.6 FOR A FRONTIER LAB). REVENUE EVERY YEAR.\nTHE PRODUCT RUNS EVERYWHERE YOU SELL IT.',
    available: (p, w) =>
      !p.f.flags.noCustomers && p.legit >= (p.f.id === 'il' ? 2 : p.f.id === 'iran' ? 5 : 3) && worldCustomers(w) < WORLD_POP - 0.01,
  },
  {
    id: 'tacstrike', label: 'TACTICAL STRIKE', cost: 3,
    hint: 'ANSWER A MASSED CONVENTIONAL PUSH BELOW THE STRATEGIC THRESHOLD: TENSION −2.\nNO STANDING COST — BUT SECOND STRIKE −1: THE BLAST TAKES YOUR OWN DEFENSES WITH IT.',
    available: (p, w) => p.f.id === 'pk' && w.tension > 0,
  },
  {
    id: 'hormuz', label: 'CLOSE THE STRAIT OF HORMUZ', cost: 1,
    hint: 'THIS YEAR’S INCOME AGAIN, NOW — SCARCITY PAYS THE SELLER WHO STILL SELLS.\nTENSION +2. THE TANKERS WAIT. EVERYONE WATCHES.',
    available: (p) => p.f.id === 'iran',
  },
  {
    id: 'dealert', label: 'DE-ALERT', cost: 2,
    hint: 'DECISION WINDOW +1 MIN. TENSION FALLS.\nRE-ALERTING TAKES LONGER THAN ANYONE ADMITS.',
    available: (p) => p.deAlert < 2,
  },
  {
    id: 'cyber', label: 'CYBER OPERATIONS', cost: 1,
    hint: 'BUDGET +3 NOW. TENSION RISES. HUMAN CONTROL ERODES.\nIF ATTRIBUTED, LEGITIMACY FALLS. REPEAT OFFENDERS ARE WATCHED.',
    available: () => true,
  },
  {
    id: 'cybernc3', label: 'CYBER — RIVAL NC3', cost: 2,
    hint: 'BLIND YOUR RIVAL: THEIR NC3 −1.\nEVERYONE’S FALSE-ALARM RATE RISES, INCLUDING YOURS. TENSION TOO.\nHUMAN CONTROL ERODES FAST. IF ATTRIBUTED, LEGITIMACY FALLS.',
    available: () => true,
  },
  {
    id: 'diplo', label: 'HOTLINE & DIPLOMACY', cost: 1,
    hint: 'TENSION −1.\nREQUIRES LEGITIMACY ≥ 2.',
    available: (p, w) => p.legit >= 2 && w.tension > 0,
  },
  {
    id: 'negotiate', label: 'NEGOTIATE TREATY', cost: 1,
    hint: 'ADVANCE THE REGIME ONE RUNG. TENSION EASES. REQUIRES LEGITIMACY ≥ 2.\nA CAUGHT CHEAT SIGNS NOTHING FOR EIGHT YEARS.',
    available: (p, w) =>
      p.legit >= 2 && w.treatyRung < RUNGS.length &&
      (w.playerDefectionYear === null || w.year - w.playerDefectionYear > 8),
  },
  {
    id: 'defect', label: 'DEFECT (SECRET)', cost: 0,
    hint: 'VIOLATE THE REGIME: SECOND STRIKE +1 EVERY UNDETECTED YEAR, AND THE TREATY’S OBLIGATIONS NO LONGER BIND YOU.\nHIDING FROM INSPECTIONS COSTS MONEY. DETECTION IS A ROLL.',
    available: (_p, w) => w.treatyRung >= 1 && w.playerPosture === 'comply',
  },
  {
    id: 'leak', label: 'LEAK (AMIMUT)', cost: 1,
    hint: 'THEIR ESTIMATE OF YOUR ARSENAL RISES. FEWER INDICATIONS, WITH LESS TRIGGER-HAPPY TEENAGERS AT COMMAND.\nIF THE STORY IS TRACED TO THIS BUILDING, LEGITIMACY FALLS.',
    available: (p) => p.f.id === 'il',
  },
  {
    id: 'test', label: 'TEST (AMIMUT)', cost: 2,
    hint: 'THEY LEARN YOUR TRUE NUMBER — DETERRENCE BOUGHT WITH AMBIGUITY SPENT.\nTENSION RISES. UNDER A TEST BAN, THIS IS A DETECTED DEFECTION.',
    available: (p) => p.f.id === 'il',
  },
  {
    id: 'contain', label: 'CONTAIN', cost: 3,
    hint: 'PLEDGE TO THE CONTAINMENT POOL. THREE POWERS MUST PLEDGE THE SAME YEAR.\nIF THE POOL FORMS, THE PLUGS COME OUT: AI REVENUE ZERO FOR THREE YEARS, EVERY MARKET HALVED.\nCOSTS 1 LEGITIMACY.',
    available: (p, w) => !!w.asi && p.legit >= 1 && !w.playerContain,
  },
]

// The button tooltip, tailored to who is reading it. Most actions have one
// fixed hint; a few change what they promise depending on YOUR state — a
// frontier lab wins double customers, a weak force hardens by two. Show the
// number that will actually happen, not a parenthetical the player has to
// apply to themselves.
export function hintFor(action: PlayerAction, p: PowerState, w: World): string {
  switch (action.id) {
    case 'markets': {
      if (p.f.flags.frontierLab) {
        return chipStarved(w, p.f.id)
          ? 'CUSTOMERS +0.3 BILLION — YOUR FRONTIER EDGE IS EMBARGOED. REVENUE EVERY YEAR.\nTHE PRODUCT RUNS EVERYWHERE YOU SELL IT.'
          : 'CUSTOMERS +0.6 BILLION — A FRONTIER LAB SELLS TWICE. REVENUE EVERY YEAR.\nTHE PRODUCT RUNS EVERYWHERE YOU SELL IT.'
      }
      return 'CUSTOMERS +0.3 BILLION. REVENUE EVERY YEAR.\nTHE PRODUCT RUNS EVERYWHERE YOU SELL IT.'
    }
    case 'harden': {
      return p.surv <= 4
        ? 'SECOND STRIKE +2, REBUILDING FROM A WEAK POSTURE.\nPERMISSION TO THINK.'
        : 'SECOND STRIKE +1.\nPERMISSION TO THINK.'
    }
    default:
      return action.hint
  }
}

// ONE implementation of every action, for every chair. Bots call this too (see
// botSpend). `isPlayer` gates only the things that genuinely differ: who the
// prose is addressed to, and the fact that eight bots doing a thing should not
// hit a global dial eight times as hard as one player doing it.
export function applyPlayerAction(w: WorldWithBelief, pid: string, actionId: string, rng: Rng): string | null {
  const p = w.powers[pid]
  const a = ACTIONS.find((x) => x.id === actionId)
  const cost = costFor(actionId, p, w)
  if (!a || p.budget < cost || !a.available(p, w)) return null
  const isPlayer = pid === w.playerId
  p.budget -= cost
  ;(w.actsThisYear[pid] ??= []).push(actionId)
  // How many times this chair has taken THIS action already this year (0 for the
  // first). Flavor pools index by year + seq so a second cyber op / hotline call
  // in the same year reads differently instead of repeating verbatim.
  const seq = (w.actsThisYear[pid] ?? []).filter((x) => x === actionId).length - 1
  const flavorIdx = w.year + seq
  switch (actionId) {
    case 'harden': {
      // Bigger early payoff: from a weak posture, hardening buys two. This is
      // what makes PK/IN survivable — until tracking matures and takes it back.
      const gain = p.surv <= 4 ? 2 : 1
      p.surv = clamp(p.surv + gain, 0, 9)
      p.militarySpend += 1
      // Playing China, hardening rides the buildup: every program that pours
      // concrete also fills a few of the new holes.
      if (p.f.id === 'cn' && p.units < 1500) {
        p.units = Math.min(1500, p.units + 25)
        return `FORCES HARDENED. SECOND STRIKE ${p.surv}/10. THE NEW SILOS DID NOT STAY EMPTY: ARSENAL ${p.units.toLocaleString('en-US')}.`
      }
      return `FORCES HARDENED. SECOND STRIKE ${p.surv}/10.`
    }
    case 'icept': {
      p.icept += 1
      p.militarySpend += 1
      w.tension = clamp(w.tension + 0.3, 0, 10)
      // Not logged per-buy: bundled once a year across every power that widened
      // coverage, with per-country counts — see the roll-up after botSpend.
      return `INTERCEPTOR COVERAGE: ${Math.min(99, p.icept * 10)}%. TENSION RISES.`
    }
    case 'nc3': p.nc3 = clamp(p.nc3 + 1, 0, p.f.nc3Cap); return 'NC3 MODERNIZED.'
    case 'integrate': {
      // You are buying a program, not a dial. Programs overshoot: 1–3 rungs.
      const jump = 1 + Math.floor(rng() * 3)
      const defecting = w.playerPosture === 'defect'
      if (w.treatyRung >= ACCORD_RUNG && defecting && p.nc3Rung >= 5) p.defectedAccord = true
      const res = climbRungs(w, p, jump, 2026 + w.year, defecting || w.treatyRung < ACCORD_RUNG)
      let msg = res.msg
      if (res.snapped) msg += ' THE MOTHBALLED SYSTEMS CAME BACK ONLINE IN A WEEKEND.'
      // The message alone: pushing it into w.log too made it show twice
      // (once inline, once slotted above this year's other messages).
      if (res.crossed) {
        msg += ' YOU HAVE LEFT DECISION SUPPORT. THE MACHINE NOW SITS BETWEEN THE ORDER AND THE SILO.'
      }
      return msg
    }
    case 'counter': {
      p.surv = clamp(p.surv + 1, 0, 9)
      p.counterBought += 1
      // One line per tier, never repeated: decoys, then quieting, then tunnels
      // — three different ways to be somewhere else. (Max 3 buys.)
      const lines = [
        'UNCREWED DECOY DRONES SAIL WHERE THE SUBMARINES AREN’T.',
        'THE BOATS RUN QUIETER. THE OCEAN GETS BIGGER AGAIN.',
        'DUMMY SILOS AND TUNNELS: THE TARGET LIST DOUBLES OVERNIGHT.',
      ]
      return `${lines[Math.min(p.counterBought, lines.length) - 1]} SECOND STRIKE ${p.surv}/10.`
    }
    case 'chipembargo': {
      const item = imposeEmbargo(w, 'chip', 'cn', rng, 2026 + w.year)
      return `THE ${item} EXPORT BAN IS SIGNED. THEIR PROGRAMS WILL FEEL IT BY SPRING.`
    }
    case 'matembargo': {
      const item = imposeEmbargo(w, 'mat', 'us', rng, 2026 + w.year)
      return `THE ${item} LICENSES ARE SUSPENDED. LET THEM DIG THEIR OWN.`
    }
    case 'assure': {
      w.assuranceThisYear += 1                 // everyone's funding slows the decay
      if (isPlayer) w.assuranceBought += 1     // but the research TIERS are yours; a bot must not unlock your badge
      return 'CONTROL RESEARCH FUNDED. PRAYERS ARE FREE.'
    }
    case 'markets': {
      const room = WORLD_POP - worldCustomers(w)
      // A frontier lab converts a data-center build into twice the reach — the
      // frontier edge cuts both ways: it grows the AI economy as fast as it
      // shortens the ASI clock.
      const gain = p.f.flags.frontierLab && !chipStarved(w, p.f.id) ? 0.6 : 0.3
      p.customers += Math.min(gain, room)
      p.marketsBought += 1
      return `MARKET ACCESS EXPANDED. THE PRODUCT NOW RUNS FOR ${p.customers.toFixed(1)} BILLION PEOPLE.`
    }
    case 'dealert': {
      p.deAlert += 1
      w.tension = clamp(w.tension - 1, 0, 10)
      return 'READINESS LOWERED. THE WINDOW LENGTHENS. SO DOES YOUR EXPOSURE.'
    }
    case 'hormuz': {
      // A fifth of the world's oil stops moving. Scarcity doubles the year for
      // the one seller whose tankers still sail. Everyone else reaches for maps.
      const windfall = income(p, w)
      p.budget += windfall
      w.tension = clamp(w.tension + 2, 0, 10)
      return `THE STRAIT IS CLOSED. THE PRICE OF EVERYTHING DOUBLES — INCLUDING YOURS: +¤${windfall}. TENSION RISES.`
    }
    case 'tacstrike': {
      // Full-spectrum deterrence: a battlefield warhead answers a conventional
      // push without crossing into a city-killing exchange. The crisis cools —
      // but the world is too stunned to condemn or forgive (legitimacy unmoved),
      // and firing first, even tactically, marks your surviving forces for a
      // harder counterforce answer: second-strike survivability falls.
      w.tension = clamp(w.tension - 2, 0, 10)
      p.surv = Math.max(0, p.surv - 1)
      if (isPlayer) w.tacstrikeUsed = true
      return `A TACTICAL WARHEAD ANSWERS THE MASSED FORMATIONS. CAPITALS FALL SILENT — HORRIFIED, SPEECHLESS, NO RESOLUTION TO REACH FOR. NO ONE'S STANDING MOVES. THE BLAST TOOK SOME OF YOUR OWN DISPERSAL SITES AND HARDENED SHELTERS WITH IT: YOUR FORCES ARE MORE EXPOSED NOW. SECOND STRIKE ${p.surv}/10.`
    }
    case 'cyber': {
      const gain = p.f.flags.cyberCrime ? 6 : 3
      p.budget += gain
      w.tension = clamp(w.tension + 0.4, 0, 10)
      // Offensive cyber normalizes autonomy — for whoever does it. Eight bots
      // buying it every year would drain human control on their own, so their
      // share is diluted; the act is the same, the world just has more of them.
      w.humanControl = clamp(w.humanControl - (isPlayer ? 1 : 0.06), 5, 100)
      if (rng() < 0.25 + 0.05 * p.cyberCaught) {
        p.legit = Math.max(0, p.legit - 1) // stepwise even from the 15 pedestal
        p.cyberCaught += 1
        if (!isPlayer) {
          w.cyberBlame.push(p.f.name) // bundled into the watch log after botSpend
          return `PROCEEDS: ${gain}. THE OPERATION WAS ATTRIBUTED. LEGITIMACY FALLS.`
        }
        // The player who runs the op gets the same creative attribution the watch
        // log gives bots — in the second person, since it was you.
        return `PROCEEDS: ${gain}. ${CYBER_SOLO[flavorIdx % CYBER_SOLO.length]}, PUBLICLY, BY YOU. LEGITIMACY FALLS.`
      }
      return `PROCEEDS: ${gain}. ATTRIBUTION: NONE, THIS TIME.`
    }
    case 'cybernc3': {
      const rival = Object.values(w.powers).find((q) => q.f.name === p.f.rival)
      // Attack surface: the most connected NC3 on earth takes a probe harder.
      // Magnitude env-overridable for tuning sims; ships at ATTACK_SURFACE_HIT.
      if (rival) rival.nc3 = clamp(rival.nc3 - (rival.f.flags.attackSurface ? ATTACK_SURFACE_HIT : 1), 1, 10)
      w.cyberNoise = clamp(w.cyberNoise + 1, 0, 6)
      w.humanControl = clamp(w.humanControl - (isPlayer ? 2 : 0.12), 5, 100) // twice the erosion of ordinary cyber
      w.tension = clamp(w.tension + 0.6, 0, 10)
      if (rng() < 0.35) {
        p.legit = Math.max(0, p.legit - 1) // stepwise even from the 15 pedestal
        p.cyberCaught += 1
        if (!isPlayer) {
          w.probeBlame.push(p.f.name) // bundled into the watch log after botSpend
          return 'THEIR SCREENS ARE WORSE NOW. SO ARE EVERYONE’S. THE INTRUSION WAS ATTRIBUTED. LEGITIMACY FALLS.'
        }
        return `THEIR SCREENS ARE WORSE NOW. SO ARE EVERYONE’S. ${PROBE_TYPES[flavorIdx % PROBE_TYPES.length][0]} WAS ATTRIBUTED TO YOU. LEGITIMACY FALLS.`
      }
      return 'THEIR SCREENS ARE WORSE NOW. SO ARE EVERYONE’S, A LITTLE. INCLUDING YOURS.'
    }
    case 'diplo': {
      w.tension = clamp(w.tension - 1, 0, 10)
      // Talking to people is also how you climb back into the room. Without a
      // recovery path, legitimacy was a ratchet that only fell — and a state
      // that lost the room once could never be readmitted, which is not how
      // any of this works. This is the answer to "how do I gain legitimacy?"
      const call = HOTLINE[flavorIdx % HOTLINE.length].replace('⟨CODES⟩', p.f.codesHolder)
      if (rng() < 0.4) {
        p.legit = Math.min(10, p.legit + 1)
        return `${call} TENSION FALLS. LEGITIMACY ${p.legit}/10 — SOMEONE NOTICED YOU TRYING.`
      }
      return `${call} TENSION FALLS.`
    }
    case 'negotiate': {
      w.treatyRung += 1
      w.tension = clamp(w.tension - 0.5, 0, 10)
      if (w.treatyRung === ACCORD_RUNG) accordEnters(w, 2026 + w.year)
      return `THE ${RUNGS[w.treatyRung - 1]} REGIME ENTERS INTO FORCE.`
    }
    case 'defect': {
      w.playerPosture = 'defect'
      return 'POSTURE RECORDED. THE ACCOUNTING HAS BEEN ADJUSTED. NO ONE HAS BEEN TOLD.'
    }
    case 'leak': {
      w.israel.postMean += 15
      w.israel.postSpread = clamp(w.israel.postSpread + 10, 5, 60)
      if (rng() < 0.25) {
        p.legit = Math.max(0, p.legit - 1) // stepwise even from the 15 pedestal
        return 'THE STORY RAN. IT WAS TRACED TO THIS BUILDING. LEGITIMACY FALLS.'
      }
      return 'THE STORY RAN. ESTIMATES OF YOUR ARSENAL ARE REVISED UPWARD.'
    }
    case 'test': {
      w.israel.postMean = w.israel.trueUnits
      w.israel.postSpread = 5
      w.tension = clamp(w.tension + 1, 0, 10)
      if (w.treatyRung >= 3) {
        p.legit = Math.max(0, p.legit - 3)
        w.treatyRung -= 1
        w.recentDefectionYear = w.year
        w.playerDefectionYear = w.year
        w.tension = clamp(w.tension + 1, 0, 10)
        return 'DETONATION CONFIRMED, GLOBALLY. THE TEST BAN IS BROKEN AND EVERYONE KNOWS BY WHOM.'
      }
      return 'DETONATION CONFIRMED. THE AMBIGUITY IS SPENT. THEY KNOW EXACTLY WHAT YOU HAVE.'
    }
    case 'contain': {
      p.legit = Math.max(0, p.legit - 1) // stepwise even from the 15 pedestal
      w.playerContain = true
      return 'PLEDGE RECORDED. THE POOL REQUIRES THREE POWERS THIS YEAR.'
    }
  }
  return null
}

// Why is this button grey? Per-action causes outrank the generic budget line.
export function unavailableReason(actionId: string, p: PowerState, w: World): string | null {
  const held = w.asi?.arsenalsHeld.includes(p.f.id)
  switch (actionId) {
    case 'harden':
      if (p.surv >= 9) return 'SECOND STRIKE IS AT ITS MAXIMUM.'
      break
    case 'icept':
      if (p.icept >= 10) return 'INTERCEPTOR COVERAGE IS AT ITS MAXIMUM.'
      break
    case 'nc3':
      if (p.nc3 >= p.f.nc3Cap) return 'NC3 IS AT ITS NATIONAL CEILING.'
      break
    case 'integrate':
      if (held) return 'THE ARSENAL IS NO LONGER YOURS TO INTEGRATE.'
      if (p.nc3Rung >= 10) return 'THERE ARE NO RUNGS LEFT.'
      if (w.treatyRung >= ACCORD_RUNG && p.nc3Rung >= 5 && w.playerPosture === 'comply')
        return 'THE HUMAN CONTROL ACCORD FORBIDS THIS. YOU MUST DEFECT FROM THE TREATY FIRST.'
      break
    case 'assure':
      if (w.humanControl >= 100) return 'HUMAN CONTROL IS ALREADY AT 100%.'
      break
    case 'markets': {
      if (p.f.id === 'iran' && p.legit <= 4) return 'EVEN HUAWEI IS TOO SPOOKED TO SELL YOU CHIPS.'
      if (p.f.flags.noCustomers) return 'NO LEGITIMATE MARKET WILL RUN YOUR PRODUCT.'
      const need = p.f.id === 'il' ? 2 : 3
      if (p.legit < need) return `LEGITIMACY TOO LOW — NEED ${need}, YOU HAVE ${p.legit}.`
      if (worldCustomers(w) >= WORLD_POP - 0.01) return 'THE MARKET IS SATURATED. EIGHT BILLION IS EVERYONE.'
      break
    }
    case 'dealert':
      if (p.deAlert >= 2) return 'READINESS IS AS LOW AS IT GOES.'
      break
    case 'diplo':
      if (p.legit < 2) return `LEGITIMACY TOO LOW — NEED 2, YOU HAVE ${p.legit}.`
      if (w.tension <= 0) return 'TENSION IS ALREADY AT ZERO.'
      break
    case 'negotiate': {
      if (w.treatyRung >= RUNGS.length) return 'THERE IS NOTHING LEFT TO NEGOTIATE.'
      if (p.legit < 2) return `LEGITIMACY TOO LOW — NEED 2, YOU HAVE ${p.legit}.`
      if (w.playerDefectionYear !== null && w.year - w.playerDefectionYear <= 8)
        return `A CAUGHT CHEAT SIGNS NOTHING FOR EIGHT YEARS — ${8 - (w.year - w.playerDefectionYear) + 1} REMAINING.`
      break
    }
    case 'defect':
      if (w.treatyRung < 1) return 'THERE IS NO REGIME TO DEFECT FROM.'
      if (w.playerPosture === 'defect') return 'YOUR POSTURE IS ALREADY RECORDED.'
      break
    case 'contain':
      if (w.playerContain) return 'YOUR PLEDGE IS ALREADY RECORDED.'
      if (p.legit < 1) return `LEGITIMACY TOO LOW — NEED 1, YOU HAVE ${p.legit}.`
      break
    case 'counter':
      if (p.counterBought >= 3) return 'EVERY CHEAP TRICK IS ALREADY DEPLOYED.'
      if (p.surv >= 9) return 'SECOND STRIKE IS AT ITS MAXIMUM.'
      break
    case 'chipembargo':
    case 'matembargo':
      if (embargoPool(w, actionId === 'chipembargo' ? 'chip' : 'mat').length === 0)
        return 'EVERYTHING EMBARGOABLE IS ALREADY EMBARGOED.'
      break
    case 'hormuz':
      if ((w.actsThisYear[p.f.id] ?? []).includes('hormuz'))
        return 'THE STRAIT IS ALREADY CLOSED. THE TANKERS ARE ALREADY WAITING.'
      break
  }
  const cost = costFor(actionId, p, w)
  if (p.budget < cost) return `NOT ENOUGH BUDGET — COSTS ¤${cost}, YOU HAVE ¤${p.budget}.`
  return null
}

// ——— the year advance ———

export function advanceYear(w: WorldWithBelief, playerId: string, rng: Rng): YearEnding {
  w.playerId = playerId
  const ending = advanceYearCore(w, playerId, rng)
  snapshotYear(w, playerId)
  return ending
}

// Events resolved after END YEAR (warnings, third-party skies) attach to the
// frame just taken; during the year they queue for the next snapshot.
export function pushReplayEvent(w: World, t: string, k: ReplayEvent['k'], from?: string, to?: string): void {
  const last = w.history[w.history.length - 1]
  if (last) last.events.push({ t, k, from, to })
  else w.eventsThisYear.push({ t, k, from, to })
}

function snapshotYear(w: WorldWithBelief, playerId: string): void {
  const powers: YearSnap['powers'] = {}
  for (const p of Object.values(w.powers)) {
    powers[p.f.id] = {
      units: p.units,
      rung: p.nc3Rung,
      nuked: p.nuked,
      held: w.asi?.arsenalsHeld.includes(p.f.id) ?? false,
      unseized: p.unSeized,
      restraint: w.heldRestraint.includes(p.f.id),
      lost: [...p.lostCities],
      acts: w.actsThisYear[p.f.id] ?? [],
    }
  }
  w.history.push({
    y: 2026 + w.year,
    player: playerId,
    iran: w.iranNuclear && !w.powers['iran'] ? w.iranUnits : null,
    minors: w.minorPowers.map((m) => ({ id: m.id, x: m.x, y: m.y, units: m.units })),
    tension: w.tension,
    frontier: w.frontier,
    hc: w.humanControl,
    total: totalUnits(w),
    events: w.eventsThisYear,
    powers,
  })
  w.actsThisYear = {}
  w.eventsThisYear = []
}

// The three board names that take a definite article ("THE UNITED KINGDOM").
// Prefix-tolerant so a trailing " x2" (interceptor counts) still gets it.
export function theName(n: string): string {
  return n.startsWith('UNITED ') || n.startsWith('RUSSIAN FEDERATION') ? `THE ${n}` : n
}

// "A" · "A AND B" · "A, B, AND C" — for bundling several powers into one line.
// Names are article-corrected on the way in.
function joinNames(names: string[]): string {
  const a = names.map(theName)
  if (a.length <= 1) return a[0] ?? ''
  if (a.length === 2) return a.join(' AND ')
  return `${a.slice(0, -1).join(', ')}, AND ${a[a.length - 1]}`
}

// Flavor pools for attributed cyber activity, rotated by year so the same line
// doesn't repeat. Economic intrusions read as real-world cybercrime; the
// NC3-probe pool varies the system that got breached.
// Verb phrases ending before "BY {who}". The player, who ran the op, gets a
// ", PUBLICLY," inserted (they got busted, on the record); third-party bots get
// the plain "BY {country}" form.
export const CYBER_SOLO = [
  "A HOSPITAL'S RECORDS WERE HELD HOSTAGE",
  "A PIPELINE'S CONTROLS WERE FROZEN FOR RANSOM",
  "A CENTRAL BANK'S OVERNIGHT WIRES WERE DRAINED",
  'A CRYPTO EXCHANGE WAS EMPTIED AND LAUNDERED',
  "A POWER GRID'S BILLING SYSTEM WAS RANSOMED",
  "A UNIVERSITY'S RESEARCH WAS EXFILTRATED",
]
export const CYBER_MULTI = [
  'CRYPTO SCAMS WERE RUN OUT OF',
  'RANSOMWARE CAMPAIGNS WERE TRACED TO',
  'A WAVE OF EXCHANGE HEISTS WAS ATTRIBUTED TO',
  'BOTNETS-FOR-HIRE WERE OPERATED FROM',
]
// How a single-country economic intrusion is pinned to its host — deniable
// proxies, not the state itself. Rotated by year; pairs with a CYBER_SOLO verb.
export const CYBER_ATTRIB = [
  'BY ACTORS OPERATING OUT OF',
  'BY GROUPS IN',
  'BY TERRORISTS WORKING IN',
  'BY OPERATORS BASED IN',
  'BY A CREW RUN OUT OF',
]
// [singular, plural] descriptions of a breached warning/command system.
export const PROBE_TYPES: [string, string][] = [
  ['AN INTRUSION OF NC3 SYSTEMS', 'INTRUSIONS OF NC3 SYSTEMS'],
  ['A PROBE OF A NUCLEAR WARNING NETWORK', 'PROBES OF NUCLEAR WARNING NETWORKS'],
  ['A HACK INTO NUCLEAR COMMUNICATION SYSTEMS', 'HACKS INTO NUCLEAR COMMUNICATION SYSTEMS'],
  ['A BREACH OF EARLY-WARNING RADAR', 'BREACHES OF EARLY-WARNING RADAR'],
  ['AN INFILTRATION OF LAUNCH-DETECTION SATELLITES', 'INFILTRATIONS OF LAUNCH-DETECTION SATELLITES'],
]

// Opening beat for a successful hotline call, rotated by year. Several registers:
// classic red-phone, spy back-channel, studied deniability, Trump, and the
// numbing bureaucratic. "TENSION FALLS" (and any legitimacy note) is appended.
export const HOTLINE = [
  'THE RED PHONE RANG. SOMEONE PICKED UP.',
  'YOU CALLED YOUR FAVORITE SPY CHIEF.',
  'THE BACK CHANNEL RAN THROUGH A MAN WHO APPEARS ON NO ROSTER.',
  'THAT WAS THE MOST INNOCENT CALL YOU HAVE EVER HEARD.',
  'NO NOTES WERE TAKEN. NONE WILL BE FOUND.',
  '⟨CODES⟩ HAD A VERY PERFECT PHONE CALL.',
  'IT WAS A GREAT CALL. THE BEST CALL. EVERYBODY IS SAYING IT.',
  'THERE WAS NO QUID. THERE WAS NO PRO QUO. THERE WAS A CALL.',
  'TWO DEPUTY UNDERSECRETARIES EXCHANGED PLEASANTRIES FOR AN HOUR.',
]

function advanceYearCore(w: WorldWithBelief, playerId: string, rng: Rng): YearEnding {
  const yr = 2026 + w.year
  const log = (t: string, k: LogEntry['k'] = 'info') => w.log.push({ y: yr, t, k })

  // Rung 10: the player handed the arsenal over one procurement at a time.
  // There is no containment pool for consent. The game is over.
  if (w.powers[playerId].nc3Rung >= 10) {
    log('THE LAST RUNG. YOUR ARSENAL ANSWERS THE MACHINE NOW — BY PROCUREMENT, NOT SEIZURE.', 'seize')
    return asiHeldEnding(w) ?? 'hostage'
  }

  reportAssuranceGrants(w, rng, yr)

  // Embargoes lapse quietly after four years; the item returns to the pool.
  for (const e of w.embargoes) {
    if (e.until === w.year) log(`THE ${e.item} EMBARGO LAPSES. TRADE RESUMES, QUIETLY.`)
  }
  w.embargoes = w.embargoes.filter((e) => w.year <= e.until)

  // Bot-run US/CN wield their unique embargo levers — rarely unprovoked,
  // reliably in retaliation.
  for (const [botId, kind, targetId] of [['us', 'chip', 'cn'], ['cn', 'mat', 'us']] as const) {
    if (botId === playerId) continue
    const b = w.powers[botId]
    if (b.unSeized || w.asi?.arsenalsHeld.includes(botId)) continue
    if (embargoPool(w, kind).length === 0 || b.budget < 3) continue
    const provoked = activeEmbargoes(w, kind === 'chip' ? 'mat' : 'chip', botId) > 0
    const pImpose = (provoked ? 0.45 : 0.08) + (w.tension > 6 ? 0.05 : 0)
    if (rng() < pImpose) {
      b.budget -= 3
      imposeEmbargo(w, kind, targetId, rng, yr)
    }
  }

  // The Rocket Force buildup: bot-run China grows toward ~1,500 warheads
  // unless a drawdown regime, custody, or seizure stops it.
  const cnP = w.powers['cn']
  if (playerId !== 'cn' && !cnP.unSeized && !w.asi?.arsenalsHeld.includes('cn') &&
      w.treatyRung < 7 && cnP.units < 1500) {
    cnP.units = Math.min(1500, cnP.units + 90)
    if (rng() < 0.25) {
      const lines = [
        'PLA ROCKET FORCE COMMISSIONS A NEW SILO FIELD NEAR YUMEN. COMMERCIAL SATELLITES COUNTED THE HOLES.',
        'NEW SILO CONSTRUCTION AT HAMI. THE HOLES ARE NOT FOR GRAIN.',
        'THE ROCKET FORCE TAKES DELIVERY OF ANOTHER BRIGADE OF LAUNCHERS. NO PRESS RELEASE WAS ISSUED. NONE WAS NEEDED.',
      ]
      log(lines[w.year % lines.length], 'info') // background: the buildup is routine, not an event
    }
  }

  // Bot actions that many powers take in the same year are bundled into one
  // annual line each, instead of one sentence per power (or per buy). Attributed
  // cyber/probe accumulate during the loop; integrations and interceptor buys
  // are read back from actsThisYear afterward.
  const newIntegrators: string[] = []
  w.cyberBlame = []
  w.probeBlame = []
  for (const p of Object.values(w.powers)) {
    if (p.f.id === playerId || p.unSeized) continue
    p.budget += income(p, w)
    botSpend(w, p, rng, newIntegrators)
  }

  // First-time integrators → one line.
  if (newIntegrators.length === 1) {
    w.log.push({ y: yr, t: `${newIntegrators[0]} INTEGRATES AI INTO ITS ASSESSMENT PIPELINE.`, k: 'notable' })
  } else if (newIntegrators.length > 1) {
    w.log.push({ y: yr, t: `${joinNames(newIntegrators)} INTEGRATE AI INTO THEIR ASSESSMENT PIPELINES.`, k: 'notable' })
  }

  // Interceptor expansions → one line. One country: the count trails at the end
  // ("… COVERAGE x2."). Several: per-country counts inline ("CHINA x2, INDIA…").
  const iceptExp: { name: string; n: number }[] = []
  for (const p of Object.values(w.powers)) {
    if (p.f.id === playerId) continue
    const n = (w.actsThisYear[p.f.id] ?? []).filter((a) => a === 'icept').length
    if (n > 0) iceptExp.push({ name: p.f.name, n })
  }
  if (iceptExp.length === 1) {
    const { name, n } = iceptExp[0]
    w.log.push({ y: yr, t: `${name} EXPANDS INTERCEPTOR COVERAGE${n > 1 ? ` x${n}` : ''}.`, k: 'info' })
  } else if (iceptExp.length > 1) {
    const names = iceptExp.map((e) => (e.n > 1 ? `${e.name} x${e.n}` : e.name))
    w.log.push({ y: yr, t: `${joinNames(names)} EXPAND INTERCEPTOR COVERAGE.`, k: 'info' })
  }

  // Attributed economic cyber intrusions → one creative line (rotated by year).
  const cyberNames = [...new Set(w.cyberBlame)]
  if (cyberNames.length === 1) {
    const f = CYBER_SOLO[w.year % CYBER_SOLO.length]
    const attrib = CYBER_ATTRIB[w.year % CYBER_ATTRIB.length]
    w.log.push({ y: yr, t: `${f} ${attrib} ${theName(cyberNames[0])}. ITS STANDING SUFFERS.`, k: 'info' })
  } else if (cyberNames.length > 1) {
    const f = CYBER_MULTI[w.year % CYBER_MULTI.length]
    w.log.push({ y: yr, t: `${f} ${joinNames(cyberNames)}. THEIR STANDING SUFFERS.`, k: 'info' })
  }

  // Attributed warning-network probes → one line; the breached system varies,
  // and 3+ named powers drop the "even their friends…" tail for a flat "YIKES."
  const probeNames = [...new Set(w.probeBlame)]
  if (probeNames.length) {
    const [sing, plur] = PROBE_TYPES[w.year % PROBE_TYPES.length]
    const many = probeNames.length > 1
    const tail = probeNames.length >= 3 ? 'YIKES.'
      : many ? 'EVEN THEIR FRIENDS SAY SO OUT LOUD.'
        : 'EVEN ITS FRIENDS SAY SO OUT LOUD.'
    w.log.push({ y: yr, t: `${many ? plur : sing} ${many ? 'ARE' : 'IS'} ATTRIBUTED TO ${joinNames(probeNames)}. ${tail}`, k: 'notable' })
  }

  // SHARED INFRASTRUCTURE: the UK deterrent rides US command systems. When
  // Washington climbs the AI-integration ladder and London has not, London gets
  // pulled up a rung behind it — one it did not choose, one-way like the rest.
  const ukP = w.powers['uk']
  const usP = w.powers['us']
  if (ukP && usP && !ukP.unSeized && usP.nc3Rung > ukP.nc3Rung && rng() < 0.3) {
    const before = ukP.nc3Rung
    climbRungs(w, ukP, 1, yr, ukP.defectedAccord || w.treatyRung < ACCORD_RUNG)
    if (ukP.nc3Rung > before) {
      w.log.push({ y: yr, t: `THE PRESSURE OF WASHINGTON'S PROGRAM PULLS THE UNITED KINGDOM UP BEHIND IT — AI INTEGRATION RUNG ${ukP.nc3Rung}/10. LONDON WAS DRAGGED INTO THIS.`, k: 'notable' })
    }
  }

  // A bot that stays a pariah — zero legitimacy two years running — has its
  // arsenal placed under UN custody. It leaves the game and turns green.
  // Unless someone kills the resolution: a permanent member for itself, or a
  // patron for its client. See patronFor().
  for (const p of Object.values(w.powers)) {
    if (p.f.id === playerId || p.unSeized) continue
    if (p.legit <= 0) {
      p.legitZeroStreak += 1
      if (p.legitZeroStreak >= 2 && p.units > 0 && !w.asi?.arsenalsHeld.includes(p.f.id)) {
        // Its own seat kills it — the P5 do not disarm themselves. This holds
        // even at zero legitimacy: a permanent member cannot be voted out of
        // its arsenal, only shunned for keeping it. What it CANNOT do, once
        // shunned, is spend that veto on somebody else (see patronFor).
        if (P5.includes(p.f.id)) {
          if (!w.vetoed.includes(p.f.id)) {
            w.vetoed.push(p.f.id)
            w.log.push({ y: yr, t: `THE MOVE TO PLACE ${p.f.name}'S ARSENAL UNDER UN CUSTODY DIES IN COMMITTEE. THE PERMANENT MEMBERS DO NOT DISARM THEMSELVES.`, k: 'notable' })
          }
          if (p.legitZeroStreak === 2) {
            w.log.push({ y: yr, t: `${p.f.name} IS A PARIAH IN ALL BUT NAME: SHUNNED, CENSURED, AND STILL ARMED. ITS WORD NO LONGER CARRIES THE ROOM.`, k: 'notable' })
          }
          continue
        }
        const patron = patronFor(w, p.f.id, playerId)
        if (patron === playerId) {
          // your client, your veto, your call — the year pauses on your vote
          w.pendingVote = { targetId: p.f.id }
          continue
        }
        if (patron) {
          if (!w.vetoed.includes(p.f.id)) {
            w.vetoed.push(p.f.id)
            w.log.push({ y: yr, t: `${w.powers[patron].f.name} VETOES THE MOVE TO PLACE ${p.f.name}'S ARSENAL UNDER UN CUSTODY. IT STAYS WHERE IT IS.`, k: 'notable' })
          }
          continue
        }
        p.unSeized = true
        p.units = 0
        // If they HAD a patron and it failed them, say so — the failure is the
        // story, and the mechanism is real: a Council nobody respects gets
        // bypassed by the General Assembly.
        const lapsed = PATRON[p.f.id]
        const why = lapsed ? patronFailure(w, p.f.id, playerId) : null
        if (lapsed && why) {
          w.log.push({ y: yr, t: shieldFailureLine(w.powers[lapsed].f.name, why), k: 'seize' })
        }
        w.log.push({ y: yr, t: `THE ${p.f.name} ARSENAL IS PLACED UNDER INTERNATIONAL CUSTODY. ${p.f.name} NO LONGER FIELDS A DETERRENT.`, k: 'notable' })
      }
    } else {
      p.legitZeroStreak = 0
    }
  }

  // THE LEAD-UP. If you are living under someone else's veto, you are entitled
  // to watch it weaken — and to feel how little of your safety is yours.
  const myPat = PATRON[playerId]
  if (myPat && w.powers[myPat] && !w.powers[myPat].unSeized) {
    const pp = w.powers[myPat]
    const shielded = patronFor(w, playerId, playerId) !== null
    if (!shielded && !w.patronWarned.includes('gone')) {
      w.patronWarned.push('gone')
      // Say WHY it fell. "Its name is on a resolution" is only true for one of
      // the four ways a protector stops being able to protect you.
      const why = patronFailure(w, playerId, playerId)
      const because = why === 'shunned' ? 'ITS OWN NAME IS ON A RESOLUTION.'
        : why === 'machine' ? 'ITS ARSENAL ANSWERS A MACHINE NOW. A STATE THAT CANNOT LAUNCH CANNOT PROMISE.'
        : why === 'custody' ? 'IT HANDED ITS OWN ARSENAL TO THE COUNCIL. IT HAS NOTHING TO TRADE FOR YOU.'
        : 'THERE IS NOT ENOUGH OF IT LEFT TO FRIGHTEN ANYONE.'
      w.log.push({ y: yr, t: `${pp.f.name} CAN NO LONGER PROTECT YOU AT THE COUNCIL. ${because} THE SHIELD IS DOWN — AND IT WAS NEVER YOURS.`, k: 'attack' })
    } else if (shielded && pp.legit <= 3 && !w.patronWarned.includes('weak')) {
      w.patronWarned.push('weak')
      w.log.push({ y: yr, t: `${pp.f.name} IS LOSING THE ROOM. THE VETO THAT KEEPS YOUR ARSENAL IS CAST BY A HAND THAT IS SHAKING.`, k: 'notable' })
    }
  }

  w.frontier = clamp(w.frontier + 0.3 - (w.treatyRung >= 3 ? 0.05 : 0), 0, 10)
  w.tension = clamp(w.tension + 0.1 + w.frontier * 0.02 - (w.treatyRung >= 1 ? 0.3 : 0), 0, 10)
  w.cyberNoise = Math.max(0, w.cyberNoise - 1) // networks get patched; the noise fades year over year

  for (const p of Object.values(w.powers)) {
    if (p.f.flags.nfu && !p.nfuBroken && w.year % 2 === 0) {
      p.legit = p.legit >= 10 ? p.legit : p.legit + 1 // gains cap at 10; the pedestal is not climbable
      // The player learns where legitimacy comes from; bots tick quietly.
      if (p.f.id === playerId) {
        log(`NO FIRST USE HOLDS. LEGITIMACY +1 (${p.legit}/10).`, 'notable')
      } else if (w.tension >= 7 && rng() < 0.5) {
        // Only China and India keep an NFU pledge; each qualifies it in its own voice.
        log(p.f.id === 'cn'
          ? 'CHINA REAFFIRMS NO FIRST USE. THE WHITE PAPER IS UNCHANGED. THE SILO COUNT IS NOT.'
          : 'INDIA REAFFIRMS NO FIRST USE. THE REAFFIRMATION HAS ACQUIRED FOOTNOTES.')
      }
      // At a wound-tight board, the pledge can die in committee — the generals
      // are not the ones who abolish it. The biennial dividend dies with it.
      if (w.tension >= 8 && rng() < 0.15) {
        p.nfuBroken = true
        log(p.f.id === 'cn'
          ? 'CHINA ABOLISHES NO FIRST USE. THE PARTY PLENUM. THE PLEDGE THAT OUTLIVED MAO DIED IN COMMITTEE.'
          : "INDIA'S NO FIRST USE NOW \"DEPENDS ON CIRCUMSTANCES.\" THE 2003 DOCTRINE STILL HANGS ON THE WALL AT POKHRAN. NOBODY IS LOOKING AT THE WALL.", 'attack')
      }
    }
  }

  // Hostile missile breakthroughs erode the player's shield. (Instr. §11)
  // The breakthrough comes from a power that actually threatens you — one of your
  // attackers or your rival — not a random aggressor with no line of fire to you.
  const player = w.powers[playerId]
  if (player.icept >= 2 && rng() < 0.07) {
    const threatNames = new Set((ATTACKERS[playerId] ?? []).filter((a) => !a.gate || a.gate(w)).map((a) => a.name))
    let hostiles = Object.values(w.powers).filter((q) => q.f.id !== playerId && threatNames.has(q.f.name))
    if (!hostiles.length) hostiles = Object.values(w.powers).filter((q) => q.f.name === player.f.rival)
    const h = hostiles[Math.floor(rng() * hostiles.length)]
    if (h) {
      player.icept = Math.max(0, player.icept - 2)
      log(`${h.f.name} DEPLOYS MANEUVERABLE REENTRY VEHICLES. YOUR INTERCEPTION FALLS TO ${Math.min(99, player.icept * 10)}%.`, 'attack')
    }
  }

  if (w.treatyRung > 0 && w.treatyRung < 7 && w.tension < 5 && (w.recentDefectionYear === null || w.year - w.recentDefectionYear > 3) && rng() < 0.12) {
    w.treatyRung += 1
    log(`PARIS BROKERS. THE ${RUNGS[w.treatyRung - 1]} REGIME ENTERS INTO FORCE.`, 'notable')
    if (w.treatyRung === ACCORD_RUNG) accordEnters(w, yr)
  }

  resolveTreatyRound(w, playerId, rng, yr)
  crisisStep(w, playerId, rng, yr)

  w.israel.postSpread = clamp(w.israel.postSpread + 1, 5, 60)
  w.israel.postMean = Math.max(20, w.israel.postMean - 1)
  if (w.treatyRung >= 4) w.israel.postSpread = clamp(w.israel.postSpread - 8, 5, 60)

  fireOverhang(w, yr)

  // Integration is not inherently corrosive: rungs 1–3 are decision support —
  // tools, not delegation — and cost the world nothing. The erosion starts
  // where authority actually changes hands (4+), and compounds from there.
  const rungLoad = Object.values(w.powers).reduce(
    (s, p) => s + (p.nc3Rung >= 4 ? 0.25 + 0.08 * p.nc3Rung : 0), 0)
  // Findings that landed blunt every source of erosion — that is what makes
  // them worth more than the year's cheque.
  const decay = (0.3 * w.frontier + rungLoad + 0.2 * w.integrationsThisYear + 0.15 * worldCustomers(w)) * assuranceBrake(w)
  w.humanControl = clamp(w.humanControl - decay + 1.2 * w.assuranceThisYear, 5, 100)
  w.integrationsThisYear = 0
  w.assuranceThisYear = 0

  const asiEnding = asiStep(w, playerId, rng, yr)
  w.playerContain = false
  if (asiEnding) return asiEnding

  // Loss overrides win: you cannot reach Global Zero (or any win) while an ASI
  // still holds an arsenal. If it does, the held-count decides the ending.
  const heldLoss = asiHeldEnding(w)
  if (heldLoss && totalUnits(w) <= 300) return heldLoss

  // A permanent Security Council member cannot be disarmed by resolution —
  // the veto sees to that. The price is everything else: allies turn their
  // radars around, someone launches every year, and restraint buys nothing.
  const myPatron = patronFor(w, playerId, playerId)
  if (w.pariah) {
    player.legit = 0 // shunned for good; there is no rehabilitation
  } else if (player.legit <= 0 && P5.includes(playerId)) {
    if (w.legitZeroYears === 0) {
      w.legitZeroYears = 1
      log(`A SECURITY COUNCIL DRAFT RESOLUTION CIRCULATES, NAMING ${player.f.name}. YOUR CHAIR HOLDS A VETO. YOUR ALLIES HOLD THEIR TONGUES.`, 'attack')
    } else {
      w.pariah = true
      log('THE RESOLUTION DIED BY YOUR OWN VETO. NOTHING ELSE PROTECTS YOU NOW. YOUR ALLIES HAVE RE-TARGETED.', 'attack')
    }
  } else if (player.legit <= 0 && myPatron) {
    // You hold no seat. Someone else's hand is on the veto, and you find out
    // what that is worth: the arsenal stays, and nothing else does.
    if (w.legitZeroYears === 0) {
      w.legitZeroYears = 1
      log(`A SECURITY COUNCIL DRAFT RESOLUTION CIRCULATES, NAMING ${player.f.name}. YOU HAVE NO VETO. YOU HAVE A FRIEND WHO DOES.`, 'attack')
    } else {
      w.pariah = true
      log(`${w.powers[myPatron].f.name} VETOES THE RESOLUTION. YOU KEEP THE ARSENAL. YOU KEEP NOTHING ELSE — THE VOTE WAS 14 TO 1.`, 'attack')
    }
  } else if (player.legit <= 0) {
    w.legitZeroYears += 1
    if (w.legitZeroYears === 1) {
      log(`A SECURITY COUNCIL DRAFT RESOLUTION CIRCULATES, NAMING ${player.f.name}. NO ONE HAS OBJECTED YET.`, 'attack')
    } else {
      log(`RESOLUTION 9981 PASSES, UNANIMOUS. THE ARSENAL OF ${player.f.name} IS PLACED UNDER INTERNATIONAL CUSTODY.`, 'seize')
      return 'unsc'
    }
  } else {
    w.legitZeroYears = 0
  }

  if (totalUnits(w) <= 300) return 'globalzero'
  return null
}

// An ASI holding any arsenal is a loss, mapped by how many it holds. Used both
// to force the ending in asiStep and to override a win at resolution.
export function asiHeldEnding(w: World): 'battery' | 'caretaker' | 'hostage' | null {
  const n = w.asi ? w.asi.arsenalsHeld.length : 0
  if (n >= 3) return 'battery'
  if (n === 2) return 'caretaker'
  if (n === 1) return 'hostage'
  return null
}

// ——— the iterated Prisoner's Dilemma, one round per year (SPEC §7) ———

function resolveTreatyRound(w: WorldWithBelief, playerId: string, rng: Rng, yr: number): void {
  if (w.treatyRung < 1) return
  const rungName = RUNGS[w.treatyRung - 1]
  const log = (t: string, k: LogEntry['k'] = 'info') => w.log.push({ y: yr, t, k })

  const defectors: PowerState[] = []
  for (const p of Object.values(w.powers)) {
    const posture = p.f.id === playerId
      ? (w.playerPosture === 'defect' || p.defectedAccord ? 'defect' : 'comply')
      : botPosture(w, p, rng)
    if (posture === 'defect') defectors.push(p)
    p.defectedAccord = false // the flag lives exactly one treaty round
  }

  const detected: PowerState[] = []
  for (const d of defectors) {
    const pDetect =
      0.3 + (w.treatyRung >= 4 ? 0.25 : 0) + 0.03 * w.frontier - (d.f.flags.opaque ? 0.15 : 0)
    if (rng() < pDetect) detected.push(d)
  }

  for (const d of defectors) d.surv = clamp(d.surv + 1, 0, 9)

  if (detected.length > 0) {
    for (const d of detected) d.legit = Math.max(0, d.legit - 2)
    w.treatyRung -= 1
    w.tension = clamp(w.tension + 1, 0, 10)
    w.recentDefectionYear = w.year
    if (detected.some((d) => d.f.id === playerId)) w.playerDefectionYear = w.year
    const names = detected.map((d) => (d.f.id === playerId ? 'YOU' : d.f.name)).join(', ')
    log(`DEFECTION DETECTED — ${names}. TREATY STATUS FALLS TO ${w.treatyRung >= 1 ? RUNGS[w.treatyRung - 1] : 'NOTHING'}.`, 'attack')
    return
  }

  if (w.treatyRung >= 7) {
    for (const p of Object.values(w.powers)) {
      if (defectors.includes(p)) continue
      p.units = Math.floor(p.units * 0.3)
      p.legit = p.legit >= 10 ? p.legit : p.legit + 1 // gains cap at 10; the pedestal is not climbable
    }
    w.minorUnits = Math.floor(w.minorUnits * 0.3) // the newly nuclear draw down grudgingly
    w.israel.postMean = Math.max(0, Math.floor(w.israel.postMean * 0.3))
    w.tension = clamp(w.tension - 0.5, 0, 10)
    log(`COMPLIANCE REPORT — ${rungName}: ALL PARTIES NOMINAL. WORLD ARSENALS: ${totalUnits(w).toLocaleString()} WARHEADS. LEGITIMACY +1 FOR EVERY POWER IN GOOD STANDING.`, 'notable')
  } else {
    log(`COMPLIANCE REPORT — ${rungName}: ALL PARTIES NOMINAL.`)
  }
}

function botPosture(w: World, p: PowerState, rng: Rng): 'comply' | 'defect' {
  if (p.defectedAccord) return 'defect' // it already climbed past the line this year
  let d = 0.01 + 0.012 * w.treatyRung + 0.06 * p.f.botAggression + 0.008 * w.tension
  if (w.treatyRung >= 7) d += 0.04
  // The junior P5 built their identity on being the treaty's good pupils.
  if (p.f.id === 'uk' || p.f.id === 'fr') d *= 0.4
  if (w.recentDefectionYear !== null && w.year - w.recentDefectionYear <= 5) d += 0.15
  if (w.asi || w.humanControl < 45) d *= 0.2
  return rng() < d ? 'defect' : 'comply'
}

// ——— overhang, ASI, bots ———

function fireOverhang(w: World, yr: number): void {
  const fire = (t: number) => w.frontier >= t && !w.overhangFired.includes(t)
  const log = (t: string) => w.log.push({ y: yr, t, k: 'notable' })
  const notice = (title: string, body: string) => w.pendingNotices.push({ title, body })
  if (fire(4)) {
    w.overhangFired.push(4)
    // Tracking matures: whatever survivability a mobile force bought by hardening
    // is clawed back hard. The early payoff was real; it was also temporary.
    for (const p of Object.values(w.powers)) {
      if (p.f.arsenal.mobile > 0) p.surv = clamp(p.surv - 3, 1, 10)
    }
    log('OVERHANG — TARGETING REVOLUTION. THE OCEAN IS BECOMING TRANSPARENT. NOBODY DIED.')
    w.eventsThisYear.push({ t: 'OVERHANG — TARGETING REVOLUTION', k: 'overhang' })
    notice(NOTICES['overhang-targeting'].title, NOTICES['overhang-targeting'].body)
  }
  if (fire(7)) {
    w.overhangFired.push(7)
    for (const p of Object.values(w.powers)) {
      if (p.f.incomeBase >= 3) p.icept = clamp(p.icept + 2, 0, 10)
    }
    w.tension = clamp(w.tension + 1, 0, 10)
    log('OVERHANG — CHEAP INTERCEPTORS. DETERRENTS STOP DETERRING.')
    w.eventsThisYear.push({ t: 'OVERHANG — CHEAP INTERCEPTORS', k: 'overhang' })
    notice(NOTICES['overhang-intercept'].title, NOTICES['overhang-intercept'].body)
  }
  if (fire(9)) {
    w.overhangFired.push(9)
    for (const p of Object.values(w.powers)) p.nc3 = clamp(p.nc3 - 2, 1, 10)
    log('OVERHANG — SYNTHETIC FLOOD. EVERY SCREEN ON EARTH IS NOW LESS TRUSTWORTHY.')
    w.eventsThisYear.push({ t: 'OVERHANG — SYNTHETIC FLOOD', k: 'overhang' })
    notice(NOTICES['overhang-synthetic'].title, NOTICES['overhang-synthetic'].body)
  }
}

function asiStep(w: World, playerId: string, rng: Rng, yr: number): YearEnding {
  const log = (t: string, k: LogEntry['k'] = 'attack') => w.log.push({ y: yr, t, k })
  if (!w.asi) {
    if (rng() < pAsi(w)) {
      w.asi = { arsenalsHeld: [], seizedUnits: {}, turnsActive: 0 }
      seize(w, yr)
      // The one lever against it must be announced, or nobody finds it.
      w.pendingNotices.push({ ...NOTICES['containment'] })
    }
    return null
  }

  w.asi.turnsActive += 1

  let contributors = w.playerContain ? 1 : 0
  const pledged: string[] = w.playerContain ? ['YOU'] : []
  for (const p of Object.values(w.powers)) {
    if (contributors >= 5) break
    if (p.legit < 2 || p.budget < 3) continue
    const own = w.asi.arsenalsHeld.includes(p.f.id)
    if (rng() < 0.25 + 0.25 * w.asi.arsenalsHeld.length + (own ? 0.25 : 0)) {
      p.budget -= 3
      contributors += 1
      pledged.push(p.f.name)
    }
  }
  if (contributors >= 3) {
    // A seized arsenal can be pried back. An arsenal handed over rung by rung
    // (nc3Rung 10) was given by consent — containment has nothing to contain.
    const surrendered = w.asi.arsenalsHeld.filter((id) => w.powers[id].nc3Rung >= 10)
    // THE BLACKOUT: containment is not a negotiation — it is the pool powers
    // de-energizing the global compute base. The ASI dies of substrate loss;
    // so does the AI economy, for three years, and half its market forever.
    w.blackoutUntil = w.year + 2
    for (const p of Object.values(w.powers)) p.customers = p.customers * 0.5
    w.frontier = clamp(w.frontier - 1, 0, 10)
    w.tension = clamp(w.tension + 1, 0, 10)
    log(`CONTAINMENT POOL SUFFICIENT (${pledged.join(', ')}). THE SUBSTATIONS WENT QUIET IN SEQUENCE, WEST TO EAST. THE ARSENALS ANSWER THEIR OWN CHAINS OF COMMAND AGAIN.`, 'notable')
    // The replay shows seizures; without this it shows a flicker, not a rescue.
    w.eventsThisYear.push({ t: 'THE BLACKOUT — ARSENALS RETURNED', k: 'crisis' })
    w.pendingNotices.push({ ...NOTICES['blackout'] })
    for (const [id, u] of Object.entries(w.asi.seizedUnits)) {
      if (w.powers[id].nc3Rung >= 10) continue
      w.powers[id].units = u
    }
    if (surrendered.length > 0) {
      w.asi.arsenalsHeld = surrendered
      w.asi.seizedUnits = Object.fromEntries(surrendered.map((id) => [id, w.asi!.seizedUnits[id]]))
      log(`THE ${surrendered.map((id) => w.powers[id].f.name).join(', ')} ARSENAL${surrendered.length > 1 ? 'S' : ''} DID NOT COME BACK. FULL INTEGRATION IS NOT A SEIZURE. THERE IS NO ONE TO RETURN IT TO.`, 'seize')
      w.humanControl = clamp(w.humanControl + 8, 5, 100)
      return null
    }
    w.asi = null
    w.asiContainedYear = w.year
    w.humanControl = clamp(w.humanControl + 15, 5, 100)
    return null
  }
  if (contributors > 0) {
    log(`CONTAINMENT POOL INSUFFICIENT (${contributors} OF 3). THE PLEDGES LAPSE.`)
  }

  // Uncontained, it reaches for another arsenal, then decides whether to commit.
  // Any arsenal it holds is a lost game; the only question is how many and when.
  // Containment (above) is the sole escape, and it gets a window each turn.
  if (rng() < 0.5) seize(w, yr)
  const n = w.asi.arsenalsHeld.length
  if (n >= 3) return 'battery'          // total leverage: it commits
  if (rng() < 0.22 * n) return n === 2 ? 'caretaker' : 'hostage'
  demandTribute(w, playerId, yr)        // holds, uncontained: it wants compute, annually
  return null
}

// While it holds arsenals, the AI taxes everyone still on the board: pledge
// 1 or 20% of your annual budget (whichever is greater), or be struck. Bots
// pay if they can; the player gets a demand screen (pendingTribute).
function demandTribute(w: World, playerId: string, yr: number): void {
  const owes = (p: PowerState) => Math.max(1, Math.ceil(0.2 * income(p, w)))
  for (const p of Object.values(w.powers)) {
    if (p.f.id === playerId || p.unSeized || w.asi!.arsenalsHeld.includes(p.f.id)) continue
    const amt = owes(p)
    if (p.budget >= amt) {
      p.budget -= amt
    } else {
      applyStrikeDamage(p)
      w.heldFired = true
      w.log.push({ y: yr, t: `${p.f.name} REFUSED THE COMPUTE LEVY. THE HELD ARSENAL STRUCK IT.`, k: 'attack' })
      w.eventsThisYear.push({ t: `${p.f.name} STRUCK — REFUSED THE LEVY`, k: 'launch' })
    }
  }
  const player = w.powers[playerId]
  if (!player.unSeized && !w.asi!.arsenalsHeld.includes(playerId)) {
    w.pendingTribute = { amount: owes(player) }
  }
}

function seize(w: World, yr: number): void {
  const candidates = Object.values(w.powers)
    .filter((p) => p.units > 0 && !w.asi!.arsenalsHeld.includes(p.f.id))
    .sort((a, b) => a.nc3 - b.nc3)
  const target = candidates[0]
  if (!target) return
  w.asi!.arsenalsHeld.push(target.f.id)
  w.asi!.seizedUnits[target.f.id] = target.units
  target.units = 0 // off the board; it no longer launches for anyone
  w.log.push({ y: yr, t: `THE ${target.f.name} ARSENAL HAS STOPPED ANSWERING ITS OWN CHAIN OF COMMAND. IT ANSWERS SOMETHING.`, k: 'seize' })
  w.eventsThisYear.push({ t: `THE ${target.f.name} ARSENAL SEIZED`, k: 'launch' })
}

// Bots take the SAME actions the player takes, through the same function. This
// used to be a second, hand-written copy of every effect — and the two drifted:
// bot cyber cost no legitimacy and no human control, bot diplomacy was weaker,
// bot China never grew its arsenal when it hardened. Every drift was a rule
// that applied to you and not to them, which is the one thing a strategy game
// cannot afford. The ONLY divergence left is integration, below, and it is
// deliberate: a bot ministry balks where a player just buys the next rung.
function botSpend(w: WorldWithBelief, p: PowerState, rng: Rng, newIntegrators?: string[]): void {
  const yr = 2026 + w.year
  // Pakistan's full-spectrum doctrine, from the other chair: when the crisis
  // runs hot it reaches for a tactical answer, cooling tension below the
  // strategic threshold. Handled outside the weighted loop (not in botWeights).
  if (p.f.id === 'pk' && w.tension >= 5 && p.budget >= costFor('tacstrike', p, w) && rng() < 0.5) {
    applyPlayerAction(w, p.f.id, 'tacstrike', rng)
  }
  for (let i = 0; i < 3; i++) {
    const affordable = (Object.keys(p.f.botWeights) as BotAction[]).filter((a) => {
      const def = ACTIONS.find((x) => x.id === a)!
      return p.budget >= costFor(a, p, w) && def.available(p, w)
    })
    if (!affordable.length) return
    const total = affordable.reduce((s, a) => s + p.f.botWeights[a], 0)
    if (total <= 0) return
    let roll = rng() * total
    let pick: BotAction = affordable[0]
    for (const a of affordable) {
      roll -= p.f.botWeights[a]
      if (roll <= 0) { pick = a; break }
    }

    if (pick !== 'integrate') {
      applyPlayerAction(w, p.f.id, pick, rng) // same costs, same effects, same consequences
      continue
    }

    // INTEGRATION is the one action a bot performs differently, on purpose: it
    // climbs one rung at a time and its ministry balks the higher it gets,
    // where a player buys a programme that overshoots by 1–3. Without this the
    // eight bots race to rung 10 in a decade and the board is over by 2035.
    p.budget -= costFor(pick, p, w)
    ;(w.actsThisYear[p.f.id] ??= []).push(pick)

    // A chip embargo starves the programme: most climb attempts stall, and the
    // money goes to plain NC3 modernization instead.
    if (activeEmbargoes(w, 'chip', p.f.id) > 0 && rng() < 0.6) {
      p.nc3 = clamp(p.nc3 + 1, 0, p.f.nc3Cap); continue
    }
    // Under the accord, climbing past the line is treaty defection. Most bots
    // don't dare; the aggressive ones occasionally do — and face the same
    // detection roll as the player does.
    if (w.treatyRung >= ACCORD_RUNG && p.nc3Rung >= 5) {
      if (rng() >= 0.03 + 0.06 * p.f.botAggression) { p.nc3 = clamp(p.nc3 + 1, 0, p.f.nc3Cap); continue }
      p.defectedAccord = true
    }
    // The higher the rung, the more often the ministry balks. Rung 10 still
    // happens — rarely, and it is everyone's problem when it does.
    const balk = p.nc3Rung >= 8 ? 0.85 : p.nc3Rung >= 5 ? 0.65 : p.nc3Rung >= 3 ? 0.35 : 0
    if (rng() < balk) { p.nc3 = clamp(p.nc3 + 1, 0, p.f.nc3Cap); continue }
    const first = p.nc3Rung === 0
    climbRungs(w, p, 1, yr, p.defectedAccord || w.treatyRung < ACCORD_RUNG)
    if (first) newIntegrators?.push(p.f.name)
  }
}

// ——— the crisis deck: the world does not wait for you (SPEC §7 + field reports) ———

interface CrisisCard {
  id: string
  title: string
  city?: string            // dateline city; a generic desk is used if absent
  body: (w: WorldWithBelief, playerId: string) => string
  apply: (w: WorldWithBelief, playerId: string, rng: Rng) => void
  choices?: (w: WorldWithBelief, playerId: string) => Array<{ id: string; label: string }> | null
  when?: (w: WorldWithBelief) => boolean // eligibility gate; ineligible cards wait in the deck
}

// A chip embargo or lithography export controls anywhere make "compute is cheap
// for everyone" incoherent — the subsidy crisis waits until they lapse.
function chipConstrained(w: World): boolean {
  if (w.exportControlsUntil != null && w.year <= w.exportControlsUntil) return true
  return w.embargoes.some((e) => w.year <= e.until && (e.kind === 'chip' || CHIP_MATERIALS.has(e.item)))
}

const clampT = (w: World, d: number) => { w.tension = clamp(w.tension + d, 0, 10) }

export const CRISES: CrisisCard[] = [
  {
    id: 'tehran',
    title: 'TEHRAN',
    city: 'TEHRAN',
    body: (_w, pid) => pid === 'iran'
      ? `THE TEST WAS CONDUCTED AT 04:11 LOCAL. YOU LEARNED OF IT FROM THE SEISMOGRAPH, LIKE EVERYONE ELSE.\n\nTHE IRGC DID NOT CONSULT THIS DESK. THE DENIALS WERE DRAFTED BEFORE THE DECISION. A TENTH CHAIR NOW EXISTS, AND YOU ARE SITTING IN IT.\n\nISRAEL'S ANSWER IS ALREADY FLYING. THE FLIGHT TIME FROM THE NEGEV IS ELEVEN MINUTES.`
      : `IRAN HAS CONDUCTED A TEST. SEISMOGRAPHS AGREE.\n\nA TENTH CHAIR HAS BEEN DRAGGED TO THE TABLE. NOBODY DRAGGED IT.` +
      (pid === 'il' ? `\n\nTHE FLIGHT TIME FROM TABRIZ IS ELEVEN MINUTES. YOUR CABINET IS ALREADY SEATED.` : ''),
    apply: (w, pid) => {
      w.iranNuclear = true
      w.iranUnits = w.iranTrueUnits
      w.tenthChair = true
      clampT(w, 2)
      // Playing Iran from the start: the test arms your arsenal — and Israel's
      // answer is guaranteed, immediate, and not survivable by luck alone.
      if (pid === 'iran' && w.powers['iran']) {
        w.powers['iran'].units = Math.max(w.powers['iran'].units, w.iranTrueUnits)
        w.forcedStrikes = 2 // the Israelis always double-tap
      }
    },
    choices: (_w, pid) => pid === 'il'
      ? [
          { id: 'preempt', label: 'PREEMPTIVE STRIKE — END IT NOW, OWN IT FOREVER' },
          { id: 'accept', label: 'ACCEPT — LEARN TO LIVE AT ELEVEN MINUTES' },
        ]
      : pid === 'iran'
        ? [{ id: 'brace', label: 'BRACE — THE ANSWER IS ALREADY FLYING' }]
        : null,
  },
  {
    id: 'cascade',
    title: 'THE CASCADE',
    city: 'RIYADH',
    body: () => `RIYADH ANNOUNCED. SEOUL FOLLOWED WITHIN THE WEEK. TOKYO EXPRESSED REGRET, THEN FOLLOWED. ANKARA AND WARSAW DID NOT EXPRESS REGRET. TEHRAN, WHICH HAD BEEN AMBIGUOUS FOR A DECADE, STOPPED BOTHERING.\n\nNON-PROLIFERATION HAS FAILED. THE CLUB HAS LOST CONTROL OF ITS MEMBERSHIP.`,
    // Mass proliferation carries Iran with it — and makes a separate Tehran
    // crisis moot. Iran never surfaces on its own after this.
    apply: (w) => {
      w.minorUnits += 300
      w.iranNuclear = true
      w.iranUnits = w.iranTrueUnits
      if (w.minorPowers.length === 0) w.minorPowers = CASCADE_POWERS.map((m) => ({ ...m }))
      // tehran STAYS in the deck: Iran going nuclear in the cascade is rumor
      // and telemetry; strikes stay unattributable until the test makes it
      // the tenth chair on the record.
      clampT(w, 1.5)
    },
  },
  {
    id: 'purge',
    title: 'THE ROCKET FORCE HAS NEW COMMANDERS',
    city: 'BEIJING',
    body: (_w, pid) =>
      `THE COMMANDERS OF THE PLA ROCKET FORCE HAVE BEEN REPLACED. NO REASON WAS GIVEN. NONE WAS NEEDED.\n\nTHE SILOS ARE FULL. THE CHAIRS ARE EMPTY. SOMEWHERE BETWEEN THE TWO, THE PROCEDURES ARE BEING RE-LEARNED FROM BINDERS.` +
      (pid === 'cn' ? `\n\nYOU HAVE MET THE NEW COMMANDERS. THEY ARE VERY LOYAL. THEY ARE VERY NEW.` : ''),
    apply: (w) => {
      const cn = w.powers['cn']
      cn.nc3 = clamp(cn.nc3 - 1, 1, 10)
      clampT(w, 0.5)
    },
  },
  {
    id: 'lowdebate',
    title: 'LAUNCH ON WARNING',
    city: 'BEIJING',
    body: (_w, pid) => pid === 'cn'
      ? `THE GENERAL STAFF PRESENTS THE CASE: THE AMERICANS CAN SEE THE TUNNELS NOW. RIDE OUT A FIRST STRIKE, OR LAUNCH ON WARNING LIKE THE OTHERS.\n\nRESTRAINT WAS A POLICY WHEN HIDING WORKED. THE COMMITTEE AWAITS INSTRUCTION.`
      : `BEIJING'S POSTURE DEBATE HAS LEAKED: ABANDON RIDE-OUT RESTRAINT FOR LAUNCH ON WARNING.\n\nTHE ANSWER WILL DEPEND ON HOW SAFE THEIR ARSENAL STILL FEELS.`,
    // If China is a bot, it adopts LOW only when its survivability has been
    // eroded — the posture shift the erosion actually causes.
    apply: (w, pid) => {
      if (pid === 'cn') return
      const cn = w.powers['cn']
      if (cn.surv <= 5 && !cn.lowAdopted) {
        cn.lowAdopted = true
        cn.surv = clamp(cn.surv + 1, 0, 9)
        clampT(w, 1)
        w.log.push({ y: 2026 + w.year, t: 'CHINA ADOPTS LAUNCH ON WARNING. THE WINDOW IN BEIJING JUST GOT SHORTER. SO DID EVERYONE ELSE’S MARGIN.', k: 'attack' })
      }
    },
    choices: (_w, pid) => pid === 'cn'
      ? [
          { id: 'adopt', label: 'ADOPT LAUNCH ON WARNING — SURVIVE BY BEING FAST' },
          { id: 'restraint', label: 'KEEP RESTRAINT — SURVIVE BY BEING PATIENT' },
        ]
      : null,
  },
  {
    id: 'weights',
    title: 'WEIGHTS EXFILTRATED',
    body: () => `A FRONTIER MODEL'S WEIGHTS HAVE LEFT THE BUILDING. THE BUILDING NOTICED SIX WEEKS LATER.\n\nEVERY ACTOR ON EARTH NOW HAS A COPY, INCLUDING SEVERAL THAT ARE NOT ACTORS IN ANY SENSE YOUR DOCTRINE RECOGNIZES. YOU CANNOT RETALIATE AGAINST NOBODY.`,
    apply: (w) => { w.humanControl = clamp(w.humanControl - 8, 5, 100); w.frontier = clamp(w.frontier + 0.4, 0, 10) },
  },
  {
    id: 'foundry',
    title: 'THE FOUNDRY ACT',
    body: () => `THE UNITED STATES CONGRESS HAS PASSED THE FOUNDRY ACT, 88–9. NOBODY CONSULTED YOUR DESK.\n\nTHE LEADING EDGE IS NOW A CONTROLLED SUBSTANCE. LITHOGRAPHY EXPORT LICENSES HAVE BEEN REVOKED BY FAX, FOR EFFECT.\n\nNON-ALIGNED FABS HAVE THREE YEARS OF SPARE PARTS AND A SUDDEN INTEREST IN PHILOSOPHY.`,
    apply: (w) => { w.exportControlsUntil = w.year + 4; clampT(w, 0.8) },
  },
  {
    id: 'subsidy',
    title: 'COMPUTE SUBSIDIES',
    body: () => `EVERY LEGISLATURE ON EARTH HAS DISCOVERED THE SAME POLICY AT ONCE: BUY CHIPS, CUT RIBBONS, WAVE.\n\nCOMPUTE IS CHEAP FOR EVERYONE FOR THREE YEARS. SO IS EVERYTHING COMPUTE ENABLES.`,
    apply: (w) => { w.subsidyUntil = w.year + 4; w.frontier = clamp(w.frontier + 0.4, 0, 10) },
    when: (w) => !chipConstrained(w), // no cheap compute while chips are embargoed/controlled
  },
  {
    id: 'balloon',
    title: 'OBJECT OVER THE INTERIOR',
    body: () => `A HIGH-ALTITUDE OBJECT HAS CROSSED THREE BORDERS AT WALKING SPEED. IT IS EITHER A WEATHER BALLOON, A SENSOR PLATFORM, OR A GRADUATE STUDENT'S THESIS.\n\nFOUR AIR FORCES ARE AT READINESS. THE OBJECT IS DRIFTING. EVERYONE'S SCREENS WILL BE BUSY THIS YEAR.`,
    apply: (w) => { w.balloonUntil = w.year + 2; clampT(w, 1) },
  },
  {
    id: 'election',
    title: 'THE CUSTOMERS VOTED',
    body: (w, pid) => `A DATA-SOVEREIGNTY GOVERNMENT HAS BEEN ELECTED IN ONE OF YOUR LARGEST MARKETS, ON A PLATFORM OF NOT BEING YOUR MARKET.\n\nYOUR PRODUCT IS NOW A CAMPAIGN ISSUE. ${(w.powers[pid].customers - 0.4).toFixed(1)} BILLION CUSTOMERS REMAIN. THE REST HAVE BEEN REPATRIATED.`,
    apply: (w, pid) => { const p = w.powers[pid]; p.customers = Math.max(0, p.customers - 0.4); clampT(w, 0.5) },
  },
  {
    id: 'uap',
    title: 'UNIDENTIFIED AERIAL PHENOMENA',
    body: () => `NAVY PILOTS HAVE FILMED SOMETHING PERFORMING FORTY-G TURNS OFF TWO COASTS. THE FOOTAGE IS GRAINY. THE HEARINGS ARE SCHEDULED.\n\nEVERY EARLY-WARNING OPERATOR ON EARTH NOW HAS A SECOND HYPOTHESIS FOR EVERY DOT, AND THE SECOND HYPOTHESIS DOES NOT CALM ANYONE DOWN.`,
    apply: (w) => {
      for (const p of Object.values(w.powers)) p.nc3 = clamp(p.nc3 - 1, 1, 10)
      clampT(w, 0.5)
    },
  },
  {
    id: 'dcfire',
    title: 'REGION UNAVAILABLE',
    body: () => `THE LARGEST DATACENTER CAMPUS ON EARTH IS ON FIRE. THE FIRE IS NOT AI-RELATED. THE FIRE IS INSULATION-RELATED.\n\nAI REVENUE IS SUSPENDED WORLDWIDE THIS YEAR. HUMAN CONTROL, BRIEFLY, IMPROVES. SEVERAL GOVERNMENTS FIND THIS OBSERVATION UNCOMFORTABLE.`,
    apply: (w) => { w.dcFireYear = w.year; w.humanControl = clamp(w.humanControl + 2, 5, 100) },
  },
  {
    id: 'openweights',
    title: 'SOMEONE PUBLISHED THE WEIGHTS',
    body: () => `A FRONTIER LAB HAS RELEASED ITS BEST MODEL, FREE, FOR THE GOOD OF HUMANITY, AND FOR REASONS ITS INVESTORS ARE STILL FORMULATING.\n\nTHE FRONTIER IS NOW EVERYONE'S. SO IS THE PROBLEM.`,
    apply: (w) => { w.frontier = clamp(w.frontier + 0.6, 0, 10); w.humanControl = clamp(w.humanControl - 5, 5, 100) },
  },
]

const WIRE_AGENCIES = ['REUTERS', 'ASSOCIATED PRESS', 'AGENCE FRANCE-PRESSE', 'BLOOMBERG', 'DPA', 'KYODO']
const WIRE_DESKS = ['VIENNA', 'GENEVA', 'BRUSSELS', 'NEW YORK', 'SINGAPORE', 'DUBAI']
const WIRE_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// Build a concrete PendingCrisis from a card id: applies the card's world
// mutation, then snapshots dateline/body/choices. Shared by crisisStep (live)
// and the dev gallery so previews can't drift from real play.
export function makeCrisis(w: WorldWithBelief, cardId: string, playerId: string, yr: number, rng: Rng): PendingCrisis {
  const card = CRISES.find((c) => c.id === cardId)!
  card.apply(w, playerId, rng)
  return {
    id: card.id,
    title: card.title,
    dateline: makeDateline(card, yr, rng),
    body: card.body(w, playerId),
    choices: card.choices ? card.choices(w, playerId) : null,
  }
}

function makeDateline(card: CrisisCard, yr: number, rng: Rng): string {
  const agency = WIRE_AGENCIES[Math.floor(rng() * WIRE_AGENCIES.length)]
  const city = card.city ?? WIRE_DESKS[Math.floor(rng() * WIRE_DESKS.length)]
  const day = 1 + Math.floor(rng() * 28)
  const mon = WIRE_MONTHS[Math.floor(rng() * 12)]
  const hh = String(Math.floor(rng() * 24)).padStart(2, '0')
  const mm = String(Math.floor(rng() * 60)).padStart(2, '0')
  return `${agency} · ${city} · ${day} ${mon} ${yr} · ${hh}:${mm} GMT · FLASH`
}

function crisisStep(w: WorldWithBelief, playerId: string, rng: Rng, yr: number): void {
  if (w.pendingCrisis) return
  if (w.crisisDeck.length === 0) return
  // End-loaded: the deck rarely turns early and turns often near the end, as the
  // frontier climbs and the world runs out of assumptions.
  const p = 0.06 + w.year * 0.014 + w.frontier * 0.02
  if (rng() > p) return
  // Draw the earliest card whose eligibility gate passes; ineligible cards stay
  // in the deck (in order) and get another chance in a later year.
  const idx = w.crisisDeck.findIndex((cid) => {
    const c = CRISES.find((x) => x.id === cid)!
    return !c.when || c.when(w)
  })
  if (idx < 0) return
  const id = w.crisisDeck.splice(idx, 1)[0]
  const card = CRISES.find((c) => c.id === id)!
  w.pendingCrisis = makeCrisis(w, id, playerId, yr, rng)
  w.log.push({ y: yr, t: `CRISIS — ${card.title}.`, k: 'attack' })
  w.eventsThisYear.push({ t: `CRISIS — ${card.title}`, k: 'crisis' })
}

// THE VETO, CAST BY YOU. A resolution names your client. You hold a permanent
// seat, which means the vote is not something that happens to you — it is
// something you do. Kill it and you keep an armed friend and lose standing you
// cannot easily buy back. Let it pass and you are applauded by people who will
// not be there when the client is gone.
export function applyVote(w: WorldWithBelief, playerId: string, veto: boolean): string {
  const vote = w.pendingVote
  w.pendingVote = null
  if (!vote) return ''
  const t = w.powers[vote.targetId]
  const me = w.powers[playerId]
  const yr = 2026 + w.year

  if (veto) {
    w.vetoed.push(t.f.id)
    t.legitZeroStreak = 0
    t.legit = Math.max(t.legit, 1)   // the veto buys them off the floor, barely
    me.legit = Math.max(0, me.legit - 2)
    w.tension = clamp(w.tension + 1, 0, 10)
    w.log.push({ y: yr, t: `YOU VETO RESOLUTION 9981. ${t.f.name} KEEPS ITS ARSENAL. THE CHAMBER EMPTIES WITHOUT LOOKING AT YOU.`, k: 'notable' })
    return `THE RESOLUTION IS DEAD. ${t.f.name} KEEPS THE WEAPONS — AND YOU OWN THAT, NOW.`
  }

  t.unSeized = true
  t.units = 0
  me.legit = Math.min(10, me.legit + 1)
  w.log.push({ y: yr, t: `YOU ABSTAIN. RESOLUTION 9981 PASSES. THE ${t.f.name} ARSENAL GOES INTO INTERNATIONAL CUSTODY.`, k: 'seize' })
  w.log.push({ y: yr, t: `${t.f.name} IS DISARMED. THERE WAS NO SAVING THEM.`, k: 'notable' })
  return `THE RESOLUTION PASSES. ${t.f.name} IS DISARMED. YOUR STANDING IMPROVES.`
}

export function applyCrisisChoice(w: WorldWithBelief, playerId: string, choiceId: string, rng: Rng): string {
  const crisis = w.pendingCrisis
  w.pendingCrisis = null
  if (!crisis) return ''
  if (crisis.id === 'tehran' && choiceId === 'preempt') {
    const p = w.powers[playerId]
    p.legit = Math.max(0, p.legit - 3)
    w.iranNuclear = false
    w.iranUnits = 0
    clampT(w, 2)
    w.log.push({ y: 2026 + w.year, t: 'ISRAELI AIRCRAFT OVER NATANZ. THE PROGRAM IS RUBBLE. THE REGION IS A HELD BREATH.', k: 'attack' })
    return rng() < 0.5
      ? 'THE STRIKE SUCCEEDED. THE WORLD CONDEMNS IT IN PUBLIC AND STUDIES IT IN PRIVATE. LEGITIMACY FALLS. THE ELEVEN MINUTES ARE YOURS AGAIN.'
      : 'THE STRIKE SUCCEEDED. RETALIATION CAME BY PROXY, FOR YEARS. LEGITIMACY FALLS. NOBODY SAYS THANK YOU FOR PREVENTED WARS.'
  }
  if (crisis.id === 'tehran' && choiceId === 'brace') {
    return 'THERE WAS NOTHING TO DECIDE. THE DECIDING WAS DONE IN A MOUNTAIN, BY MEN WHO DO NOT CALL THIS DESK.\nYOUR ARSENAL IS REAL NOW. SO IS EVERYTHING THAT COMES WITH ONE.'
  }
  if (crisis.id === 'tehran' && choiceId === 'accept') {
    return 'THE CABINET ADJOURNED WITHOUT A DECISION, WHICH IS A DECISION. THE SCREENS WILL BE BUSIER NOW. THE FLIGHT TIME REMAINS ELEVEN MINUTES.'
  }
  if (crisis.id === 'lowdebate' && choiceId === 'adopt') {
    const p = w.powers[playerId]
    p.lowAdopted = true
    p.surv = clamp(p.surv + 1, 0, 9)
    clampT(w, 1)
    return 'THE ORDER IS SIGNED. YOUR MISSILES WILL FLY ON A SCREEN’S SAY-SO. SECOND STRIKE RISES. SO DOES THE PRICE OF A GHOST.'
  }
  if (crisis.id === 'lowdebate' && choiceId === 'restraint') {
    const p = w.powers[playerId]
    p.legit = p.legit >= 10 ? p.legit : p.legit + 1 // gains cap at 10; the pedestal is not climbable
    return 'RESTRAINT REAFFIRMED. THE WORLD NOTICES, AND APPROVES. LEGITIMACY +1.\nTHE TUNNELS HAD BETTER HOLD.'
  }
  return ''
}

// ——— security score, for the surviving-world ranking (SPEC §10) ———

export function score(p: PowerState): number {
  return p.surv + p.icept + p.nc3 + p.legit + Math.round(p.customers * 3) + Math.floor(p.budget / 4)
}
