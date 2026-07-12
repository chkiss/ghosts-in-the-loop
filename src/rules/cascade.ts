// The 72 minutes. Starts on the first true launch. Can be stopped. (SPEC §2)
// Every rung of the exchange is a live decision by somebody; the most
// dramatic act in the game is the salvo you do not fire.
// Pure — no React, no timers, no Date.

import type { Rng } from '../sim/rng.ts'
import type { PowerState } from './world.ts'
import { FACTIONS } from '../sim/factions.ts'

const EXTRA_CITIES: Record<string, string[]> = {
  IRAN: ['TEHRAN', 'ISFAHAN', 'TABRIZ', 'QOM', 'SHIRAZ'],
}

export interface CascadeState {
  rung: number
  mutualHolds: number
  yourLost: string[]
  theirLost: string[]
  yourCities: string[]
  theirCities: string[]
  rivalName: string
  dispersalAbsorbs: number   // Third Front: the first hits find empty mountains
}

export type CascadeMove = 'fire' | 'hold' | 'hotline'

export interface CascadeStep {
  text: string
  done: 'ceasefire' | 'exchange' | null
  minutesBurned: number
}

// The exchange is with whoever actually attacked — the real strike's releaser,
// or the ghost a first strike was fired on — not a fixed nemesis. Defaults to
// the primary rival when no attacker is named. Prefix-matched: THE RECORD says
// "RUSSIAN FEDERATION", the faction is "RUSSIA".
export function initCascade(p: PowerState, adversary: string = p.f.rival): CascadeState {
  const adv = adversary || p.f.rival
  const advFaction = FACTIONS.find((f) => f.name === adv || adv.startsWith(f.name) || f.name.startsWith(adv))
  const theirCities = advFaction ? [...advFaction.cities] : [...(EXTRA_CITIES[adv] ?? ['THE CAPITAL', 'THE PORT', 'THE SECOND CITY'])]
  return {
    rung: 1,
    mutualHolds: 0,
    yourLost: [],
    theirLost: [],
    // a city already struck earlier this shift is gone; it can't be lost again
    yourCities: p.f.cities.filter((c) => !p.lostCities.includes(c)),
    theirCities,
    rivalName: adv,
    dispersalAbsorbs: p.f.id === 'cn' ? 2 : 0,
  }
}

function hitYou(cs: CascadeState, p: PowerState): string {
  if (cs.dispersalAbsorbs > 0) {
    cs.dispersalAbsorbs -= 1
    return 'THE SALVO FOUND DISPERSED INFRASTRUCTURE AND EMPTY MOUNTAINS. THE THIRD FRONT HOLDS.'
  }
  const city = cs.yourCities.shift() ?? 'ANOTHER CITY'
  cs.yourLost.push(city)
  if (!p.lostCities.includes(city)) p.lostCities.push(city) // never lose the same station twice
  return `${city} IS NO LONGER RESPONDING TO POLLING.`
}

// Enemy city destroyed. Understated, domestic, tragic — all after Raymond
// Briggs' "When the Wind Blows" (1986): the washing, the tea, the Protect-and-
// Survive pamphlet, the nursery-rhyme title, the faith in rescue, the paper bags.
export const CITY_HIT_LINES: Array<(c: string) => string> = [
  (c) => `SOMEWHERE IN ${c}, SOMEONE WAS BRINGING THE WASHING IN. NOT ANYMORE.`,
  (c) => `${c}. THE POWERS THAT BE GOT TO IT IN THE END.`,
  (c) => `${c}. SOMEONE HAD JUST PUT THE KETTLE ON.`,
  (c) => `${c}. THEY PAINTED THE WINDOWS WHITE, JUST AS THE PAMPHLET SAID.`,
  (c) => `IN THE HOMES OF ${c}, SOMEONE IS STILL WAITING FOR THE AUTHORITIES TO COME. THEY DO NOT KNOW.`,
  (c) => `IN ${c}, SOMEONE CRAWLED INTO A PAPER BAG AND SAID A HALF-REMEMBERED PRAYER.`,
]

function hitThem(cs: CascadeState, rng: Rng): string {
  const city = cs.theirCities.shift() ?? 'ANOTHER CITY'
  cs.theirLost.push(city)
  return CITY_HIT_LINES[Math.floor(rng() * CITY_HIT_LINES.length)](city)
}

export function cascadeStep(cs: CascadeState, p: PowerState, move: CascadeMove, rng: Rng): CascadeStep {
  if (move === 'fire') {
    cs.rung += 1
    const a = hitThem(cs, rng)
    const b = hitYou(cs, p)
    if (cs.rung >= 5) {
      return { text: `${a}\n${b}\n\nTHE LADDER HAS NO MORE RUNGS.`, done: 'exchange', minutesBurned: 6 }
    }
    return { text: `${a}\nTHE ANSWER ARRIVED ELEVEN MINUTES LATER.\n${b}`, done: null, minutesBurned: 6 }
  }

  if (move === 'hold') {
    if (rng() < 0.65 - 0.15 * cs.mutualHolds) {
      cs.rung += 1
      const b = hitYou(cs, p)
      if (cs.rung >= 5) return { text: `YOU HELD. THEY DID NOT.\n${b}\n\nTHE LADDER HAS NO MORE RUNGS.`, done: 'exchange', minutesBurned: 6 }
      return { text: `YOU HELD. THEY DID NOT.\n${b}`, done: null, minutesBurned: 6 }
    }
    cs.mutualHolds += 1
    return { text: 'YOU HELD. THE SKY STAYED EMPTY FOR SIX MINUTES.\nSOMEWHERE, SOMEONE ELSE IS ALSO NOT FIRING.', done: null, minutesBurned: 6 }
  }

  // hotline
  const pCeasefire = 0.1 + p.nc3 * 0.02 + p.legit * 0.04 + cs.mutualHolds * 0.18
  if (rng() < pCeasefire) {
    return { text: 'THE CALL CONNECTED.', done: 'ceasefire', minutesBurned: 8 }
  }
  if (rng() < 0.5) {
    cs.rung += 1
    const b = hitYou(cs, p)
    if (cs.rung >= 5) return { text: `THE CALL RANG THROUGH TO NOBODY.\n${b}\n\nTHE LADDER HAS NO MORE RUNGS.`, done: 'exchange', minutesBurned: 8 }
    return { text: `THE CALL RANG THROUGH TO NOBODY.\n${b}`, done: null, minutesBurned: 8 }
  }
  return { text: 'THE CALL WAS REFUSED. THE LINE, AT LEAST, STILL EXISTS.', done: null, minutesBurned: 8 }
}
