// ASSIGNED READING — a pool of titles per ending, of which READING_COUNT are
// served, rotated by the game seed so repeat players get different homework.
// Pure module so the playtest harness audits exactly what the game recommends.

export type EndKind =
  | 'survived' | 'first-strike' | 'exchange' | 'retaliated' | 'decapitated' | 'deadhand'
  | 'battery' | 'caretaker' | 'hostage' | 'globalzero' | 'surrender' | 'defiance'
  | 'bystander' | 'intervene' | 'ceasefire'

// The library. Every ending draws from a pool of these.
// In chronological order of publication — the shelf reads as a timeline of the
// field, from the Hot Line to the loop. ALL_SOURCES (and the badges collection)
// follow this order.
export const SOURCES = {
  hotline: 'US–USSR HOT LINE AGREEMENT (1963)',
  kahn: 'KAHN, ON ESCALATION (1965)',
  schelling: 'SCHELLING, ARMS AND INFLUENCE (1966)',
  abm: 'US–USSR ANTI-BALLISTIC MISSILE TREATY (1972)',
  bracken: 'BRACKEN, THE COMMAND AND CONTROL OF NUCLEAR FORCES (1983)',
  blair: 'BLAIR, THE LOGIC OF ACCIDENTAL NUCLEAR WAR (1993)',
  saganLimits: 'SAGAN, THE LIMITS OF SAFETY (1993)',
  saganWhy: 'SAGAN, WHY DO STATES BUILD NUCLEAR WEAPONS? (1996)',
  yarynich: 'YARYNICH, C3: NUCLEAR COMMAND, CONTROL, COOPERATION (2003)',
  hoffman: 'HOFFMAN, THE DEAD HAND (2009)',
  schellingZero: 'SCHELLING, A WORLD WITHOUT NUCLEAR WEAPONS? (DAEDALUS, 2009)',
  schlosser: 'SCHLOSSER, COMMAND AND CONTROL (2013)',
  cnNfuWhitePaper: "CHINA'S 2013 DEFENSE WHITE PAPER — THE OMITTED NO-FIRST-USE PLEDGE (2013)",
  ucs: 'UNION OF CONCERNED SCIENTISTS, CLOSE CALLS WITH NUCLEAR WEAPONS (2015)',
  ellsberg: 'ELLSBERG, THE DOOMSDAY MACHINE (2017)',
  singhNfu: 'SINGH, RAJNATH — POKHRAN REMARKS ON "NO FIRST USE… DEPENDS ON CIRCUMSTANCES" (2019)',
  horowitzScharre: 'HOROWITZ & SCHARRE, AI AND INTERNATIONAL STABILITY (CNAS, 2021)',
  rand: 'RAND, AI AND STRATEGIC STABILITY (PEA4361-1, 2022)',
  schneider: 'SCHNEIDER, SCHECHTER & SHAFFER, HACKING NUCLEAR STABILITY (2023)',
  jacobsen: 'JACOBSEN, NUCLEAR WAR: A SCENARIO (2024)',
  bidenXi: "US–PRC LEADERS' AFFIRMATION ON HUMAN CONTROL OF NUCLEAR WEAPONS (2024)",
  levyLalwani: 'LEVY & LALWANI, FOREIGN AFFAIRS — THE CASE THAT DETERRENCE HOLDS "IN THE LIMIT" (2025)',
} as const

type SourceId = keyof typeof SOURCES

// Ordered by relevance: the first entries are the canonical assignment for the
// ending; rotation brings the rest around on replays.
const POOLS: Record<EndKind | 'survived-patient', SourceId[]> = {
  survived: ['levyLalwani', 'schelling', 'schlosser'],
  // survived having exhausted your deliberation tokens ≥2 times — you waited to
  // the limit, repeatedly, and lived. Yarynich's "right not to be in a hurry."
  'survived-patient': ['yarynich', 'ucs', 'saganLimits', 'schlosser'],
  'first-strike': ['ucs', 'saganLimits', 'blair', 'schneider'],
  exchange: ['jacobsen', 'ellsberg', 'blair', 'kahn', 'schlosser'], // widened so the two canonical war books stop crowding the shelf
  retaliated: ['abm', 'schelling', 'bracken'],                 // failed retaliation — BMD unmakes the promise; surfaces the ABM Treaty
  decapitated: ['bracken', 'blair', 'schlosser', 'ellsberg'],
  deadhand: ['hoffman', 'yarynich', 'ellsberg', 'blair'],      // Yarynich designed Perimetr — the primary source beside Hoffman's
  bystander: ['kahn', 'schelling', 'schlosser'],
  intervene: ['schelling', 'kahn', 'ellsberg'],
  battery: ['rand', 'horowitzScharre', 'schneider'],
  caretaker: ['horowitzScharre', 'rand', 'bidenXi', 'schneider'], // automation serving human intent — the Biden–Xi affirmation
  hostage: ['schneider', 'rand', 'horowitzScharre'],
  ceasefire: ['hotline', 'schelling', 'kahn', 'schlosser'],
  surrender: ['saganWhy', 'schlosser', 'schellingZero'],
  defiance: ['saganWhy', 'schelling', 'schlosser'],
  globalzero: ['schellingZero', 'blair', 'levyLalwani', 'saganWhy'], // Blair founded Global Zero; his chair at the table is earned
}

export const READING_COUNT = 2

// A first strike from a No-First-Use power is doctrine dying in real time. If it
// was India or China who struck, the debrief adds the real-world record of that
// pledge eroding — the speech (India) or the omission (China) it began with.
export const NFU_READING: Record<'in' | 'cn', SourceId> = {
  in: 'singhNfu',
  cn: 'cnNfuWhitePaper',
}

// roll ∈ [0,1) rotates the pool so replays surface different titles; the pool
// order still decides which pairings occur. patientHolds = the number of
// warnings on which you exhausted every WAIT token you had.
export function assignedReadingIds(kind: EndKind, patientHolds: number, roll = 0, count = READING_COUNT, extra: SourceId[] = []): SourceId[] {
  const pool = POOLS[kind === 'survived' && patientHolds >= 2 ? 'survived-patient' : kind]
  const n = Math.min(count, pool.length)
  const start = Math.floor(Math.max(0, Math.min(0.999999, roll)) * pool.length)
  const base = Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length])
  // Context-specific titles (e.g. a broken NFU pledge) lead the shelf, then the
  // canonical pool. Deduped, order preserved.
  return [...new Set([...extra, ...base])]
}

export function assignedReading(kind: EndKind, patientHolds: number, roll = 0, count = READING_COUNT, extra: SourceId[] = []): string {
  return assignedReadingIds(kind, patientHolds, roll, count, extra).map((id) => SOURCES[id]).join(' · ')
}

// The whole shelf, in library order — for the badges-screen collection.
export const ALL_SOURCES = Object.keys(SOURCES) as SourceId[]
