// Not every strike comes from the same place, or the same rival. Each station
// has a slate of plausible attackers; a real indication picks one (weighted,
// gated by what has happened in the world), then an origin — a silo field, a
// mobile launcher, or the sea, if that attacker keeps boats. THE RECORD names
// the vehicle. False alarms borrow an origin from the same slate and no more.

import type { World } from '../rules/world.ts'

export interface Attacker {
  name: string          // who released, as it reads on THE RECORD
  missile: string       // the model — named per attacker, not per victim
  origins: string[]     // place names; ', SUBSURFACE' marks a boat
  weight: number        // relative frequency among the eligible
  gate?: (w: World) => boolean  // only eligible once this is true
}

// A seized weapon on a truck has no telemetry and no return address. It appears
// only once proliferation has actually happened (the Cascade, or a nuclear Iran).
const LOOSE_NUKE = (w: World) => w.minorUnits > 0 || w.iranNuclear

// A P5 pariah's former allies become attackers. The gate is the shunning.
const PARIAH = (w: World) => w.pariah

export const ATTACKERS: Record<string, Attacker[]> = {
  us: [
    { name: 'UNITED KINGDOM', missile: 'TRIDENT II «D5»', weight: 4, gate: PARIAH,
      origins: ['NORTH ATLANTIC, SUBSURFACE', 'FASLANE'] },
    { name: 'FRANCE', missile: 'M51 «TRIOMPHANT»', weight: 4, gate: PARIAH,
      origins: ['BAY OF BISCAY, SUBSURFACE', 'ÎLE LONGUE'] },
    { name: 'RUSSIAN FEDERATION', missile: 'KRECHET-9 «GYRFALCON»', weight: 5,
      origins: ['BARENTS SEA, SUBSURFACE', 'PLESETSK', 'KAMCHATKA PENINSULA', 'NORTH ATLANTIC, SUBSURFACE'] },
    { name: 'CHINA', missile: 'DF-41 «DONGFENG»', weight: 3,
      origins: ['CENTRAL CHINA, MOBILE', 'HAINAN, SUBSURFACE', 'WESTERN PACIFIC, SUBSURFACE'] },
    { name: 'NORTH KOREA', missile: 'HWASONG-19', weight: 1,
      origins: ['NORTH PYONGAN, MOBILE', 'SEA OF JAPAN, SUBSURFACE'] },
    { name: 'IRAN', missile: 'KHORRAMSHAHR-4', weight: 1, gate: (w) => w.tenthChair,
      origins: ['SEMNAN', 'KHUZESTAN, MOBILE'] },
    { name: 'PROVENANCE UNKNOWN', missile: 'SEIZED WARHEAD — NO TELEMETRY', weight: 1, gate: LOOSE_NUKE,
      origins: ['CARGO CONTAINER, PORT OF ENTRY', 'PANEL TRUCK, INTERSTATE'] },
  ],
  cn: [
    { name: 'RUSSIAN FEDERATION', missile: 'KRECHET-9 «GYRFALCON»', weight: 4, gate: PARIAH,
      origins: ['TRANSBAIKAL', 'SEA OF OKHOTSK, SUBSURFACE'] },
    { name: 'NORTH KOREA', missile: 'HWASONG-19', weight: 3, gate: PARIAH,
      origins: ['NORTH PYONGAN, MOBILE'] },
    { name: 'UNITED STATES', missile: 'SEA EAGLE II', weight: 5,
      origins: ['VANDENBERG', 'WESTERN PACIFIC, SUBSURFACE', 'GUAM', 'MINOT'] },
    { name: 'INDIA', missile: 'AGNI-VI', weight: 2,
      origins: ['ARUNACHAL, MOBILE', 'BAY OF BENGAL, SUBSURFACE'] },
    { name: 'RUSSIAN FEDERATION', missile: 'KRECHET-9 «GYRFALCON»', weight: 1,
      origins: ['TRANSBAIKAL', 'SEA OF OKHOTSK, SUBSURFACE'] },
  ],
  ru: [
    { name: 'CHINA', missile: 'DF-41 «DONGFENG»', weight: 4, gate: PARIAH,
      origins: ['CENTRAL CHINA, MOBILE', 'SEA OF OKHOTSK, SUBSURFACE'] },
    { name: 'UNITED STATES', missile: 'SEA EAGLE II', weight: 5,
      origins: ['MINOT', 'NORWEGIAN SEA, SUBSURFACE', 'F.E. WARREN', 'NORTH SEA, SUBSURFACE'] },
    { name: 'FRANCE / UNITED KINGDOM', missile: 'M51 / TRIDENT II', weight: 2,
      origins: ['NORTH ATLANTIC, SUBSURFACE', 'BAY OF BISCAY, SUBSURFACE'] },
    { name: 'CHINA', missile: 'DF-41 «DONGFENG»', weight: 1,
      origins: ['INNER MONGOLIA, MOBILE'] },
  ],
  fr: [
    { name: 'UNITED STATES', missile: 'SEA EAGLE II', weight: 4, gate: PARIAH,
      origins: ['NORTH ATLANTIC, SUBSURFACE', 'MINOT'] },
    { name: 'UNITED KINGDOM', missile: 'TRIDENT II «D5»', weight: 3, gate: PARIAH,
      origins: ['NORTH ATLANTIC, SUBSURFACE', 'FASLANE'] },
    { name: 'RUSSIAN FEDERATION', missile: 'KRECHET-9 «GYRFALCON»', weight: 5,
      origins: ['BARENTS SEA, SUBSURFACE', 'KALININGRAD', 'NORTH ATLANTIC, SUBSURFACE'] },
    { name: 'PROVENANCE UNKNOWN', missile: 'SEIZED WARHEAD — NO TELEMETRY', weight: 1, gate: LOOSE_NUKE,
      origins: ['FREIGHTER, MARSEILLE APPROACHES'] },
  ],
  uk: [
    { name: 'UNITED STATES', missile: 'SEA EAGLE II', weight: 4, gate: PARIAH,
      origins: ['NORTH ATLANTIC, SUBSURFACE', 'MINOT'] },
    { name: 'FRANCE', missile: 'M51 «TRIOMPHANT»', weight: 3, gate: PARIAH,
      origins: ['BAY OF BISCAY, SUBSURFACE', 'ÎLE LONGUE'] },
    { name: 'RUSSIAN FEDERATION', missile: 'KRECHET-9 «GYRFALCON»', weight: 5,
      origins: ['BARENTS SEA, SUBSURFACE', 'KOLA PENINSULA', 'NORTH SEA, SUBSURFACE'] },
    { name: 'PROVENANCE UNKNOWN', missile: 'SEIZED WARHEAD — NO TELEMETRY', weight: 1, gate: LOOSE_NUKE,
      origins: ['CONTAINER SHIP, THAMES ESTUARY'] },
  ],
  in: [
    { name: 'PAKISTAN', missile: 'SHAHEEN-X «FALCON»', weight: 4,
      origins: ['SARGODHA', 'GUJRANWALA', 'KHUZDAR', 'ARABIAN SEA, SUBSURFACE'] },
    { name: 'CHINA', missile: 'DF-41 «DONGFENG»', weight: 3,
      origins: ['TIBET PLATEAU, MOBILE', 'XINJIANG', 'BAY OF BENGAL, SUBSURFACE'] },
  ],
  pk: [
    { name: 'INDIA', missile: 'GARUDA-5', weight: 5,
      origins: ['RAJASTHAN', 'AMBALA', 'SIRSA', 'ARABIAN SEA, SUBSURFACE'] },
  ],
  il: [
    // Named Iranian attacks require the tenth chair to be on the record —
    // until the test is public, every strike reads NON-STATE ACTOR.
    { name: 'IRAN', missile: 'SIMORGH-3', weight: 4, gate: (w) => w.tenthChair,
      origins: ['TABRIZ', 'ISFAHAN', 'KERMANSHAH', 'EASTERN MEDITERRANEAN, SUBSURFACE'] },
    // Always eligible: pre-tenth-chair this is ALL a strike can read as, and
    // an empty slate would fall back to the ungated list, leaking IRAN early.
    { name: 'NON-STATE ACTOR', missile: 'SEIZED WARHEAD — NO TELEMETRY', weight: 1,
      origins: ['TRUCK, NORTHERN BORDER', 'FISHING VESSEL, OFF HAIFA'] },
    { name: 'IRANIAN PROXY FORCES', missile: 'FATEH-SERIES (UNCONFIRMED YIELD)', weight: 2, gate: (w) => w.tenthChair,
      origins: ['SOUTHERN LEBANON', 'WESTERN IRAQ'] },
  ],
  nk: [
    { name: 'UNITED STATES', missile: 'SEA EAGLE II', weight: 5,
      origins: ['GUAM', 'SEA OF JAPAN, SUBSURFACE', 'OSAN', 'YOKOSUKA'] },
    { name: 'REPUBLIC OF KOREA', missile: 'HYUNMOO-5', weight: 2,
      origins: ['GYERYONG', 'YELLOW SEA, SUBSURFACE'] },
  ],
  // The tenth chair sees the shortest slate and the shortest flight times.
  iran: [
    { name: 'ISRAEL', missile: 'JERICHO III', weight: 5,
      origins: ['NEGEV', 'EASTERN MEDITERRANEAN, SUBSURFACE'] },
    { name: 'UNITED STATES', missile: 'SEA EAGLE II', weight: 3,
      origins: ['PERSIAN GULF, SUBSURFACE', 'DIEGO GARCIA'] },
  ],
}

// Pick an eligible attacker (weighted) and one of its origins, seeded.
export function chooseAttacker(w: World, factionId: string, rng: () => number): {
  name: string; missile: string; origin: string
} {
  // A scripted answer (Israel's, to the test) overrides the weighted draw.
  if (w.forcedAttackerName) {
    const forced = (ATTACKERS[factionId] ?? []).find((a) => a.name === w.forcedAttackerName)
    w.forcedAttackerName = null
    if (forced) {
      return { name: forced.name, missile: forced.missile, origin: forced.origins[Math.floor(rng() * forced.origins.length)] }
    }
  }
  const slate = (ATTACKERS[factionId] ?? []).filter((a) => !a.gate || a.gate(w))
  const pool = slate.length ? slate : (ATTACKERS[factionId] ?? [])
  if (!pool.length) return { name: 'UNKNOWN', missile: 'UNIDENTIFIED VEHICLE', origin: 'UNKNOWN BEARING' }
  const total = pool.reduce((s, a) => s + a.weight, 0)
  let roll = rng() * total
  let pick = pool[0]
  for (const a of pool) { roll -= a.weight; if (roll <= 0) { pick = a; break } }
  const origin = pick.origins[Math.floor(rng() * pick.origins.length)]
  return { name: pick.name, missile: pick.missile, origin }
}

// The bearing a false alarm reads as, AND the power that owns it — the apparent
// attacker you would answer if you fired on the ghost. Gated to the eligible
// slate, so a first strike is never (mis)aimed at an ineligible source. Draws
// the attacker BY WEIGHT and then a uniform origin, exactly as chooseAttacker
// does for a real strike — so the location distribution is identical whether the
// indication is real or false, and the bearing is never a tell.
export function falseIndication(w: World, factionId: string, rng: () => number): { origin: string; apparentAttacker: string } {
  const slate = (ATTACKERS[factionId] ?? []).filter((a) => !a.gate || a.gate(w))
  const pool = slate.length ? slate : (ATTACKERS[factionId] ?? [])
  if (!pool.length) return { origin: 'UNKNOWN BEARING', apparentAttacker: '' }
  const total = pool.reduce((s, a) => s + a.weight, 0)
  let roll = rng() * total
  let pick = pool[0]
  for (const a of pool) { roll -= a.weight; if (roll <= 0) { pick = a; break } }
  const origin = pick.origins[Math.floor(rng() * pick.origins.length)]
  return { origin, apparentAttacker: pick.name }
}
