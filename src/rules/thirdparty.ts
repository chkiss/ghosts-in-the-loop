// Somebody else's sky. CPU powers throw indications at each other — mostly
// rival dyads, mostly false — and the player watches on an amber board that
// is very deliberately not red. Pure rules; no React, no timers.

import type { Rng } from '../sim/rng.ts'
import { pushReplayEvent, theName, type WorldWithBelief } from './world.ts'
import { FACTIONS, isAlly } from '../sim/factions.ts'

export interface ThirdPartyEvent {
  aggressorId: string      // where the indication points
  victimId: string         // whose screen is lit
  isReal: boolean          // hidden
  vehicles: number
  windowMinutes: number    // victim's clock; the player watches it run
}

export type Intervention = 'conventional' | 'nuclear' | 'nothing'

export interface ThirdPartyOutcome {
  kind:
    | 'hero'               // victim stood down; a name goes in a sealed file
    | 'victim-launch'      // victim answered a ghost; the world ends around you
    | 'regional-war'       // the attack was real and was answered
    | 'defused'            // your conventional strike stopped a real launch
    | 'ghost-strike'       // you struck conventionally over nothing
    | 'escalation'         // your strike read as decapitation; now it is your sky
    | 'contained'          // a real attack was answered conventionally; the world exhales
  text: string
}

// Rival dyads, weighted: the vast majority of scares are neighbors.
const DYADS: Array<[string, string, number]> = [
  ['pk', 'in', 4], ['in', 'pk', 3],
  ['ru', 'us', 2], ['us', 'ru', 2],
  ['cn', 'us', 1], ['us', 'cn', 1],
  ['nk', 'us', 1],
]

export function rollThirdParty(w: WorldWithBelief, playerId: string, rng: Rng): ThirdPartyEvent | null {
  // Scares are common; real launches are not. The subcontinent especially:
  // decades of crises (Kargil, 2001–02, Balakot), zero nuclear use.
  if (rng() > 0.065 + w.tension * 0.024) return null
  // You are only handed someone else's sky when the victim is YOUR ally —
  // nobody convenes the cabinet over a strike on the other bloc.
  const pool = DYADS.filter(([a, v]) => a !== playerId && v !== playerId && isAlly(playerId, v))
  if (pool.length === 0) return null
  const total = pool.reduce((s, [, , wt]) => s + wt, 0)
  let roll = rng() * total
  let pick = pool[0]
  for (const d of pool) {
    roll -= d[2]
    if (roll <= 0) { pick = d; break }
  }
  const [aggressorId, victimId] = pick
  const victim = w.powers[victimId]
  return {
    aggressorId,
    victimId,
    isReal: rng() < (0.06 + w.tension * 0.01) * (aggressorId === 'pk' || aggressorId === 'in' ? 0.45 : 1),
    vehicles: 1 + Math.floor(rng() * Math.max(2, w.powers[aggressorId].units)),
    windowMinutes: victim.f.windowMinutes,
  }
}

// Real people who, on the historical record, did not believe the screen.
// Sampled without replacement per game (w.usedHeroes) — nobody wants the
// same lieutenant colonel saving the world twice a decade.
// ⟨CODES⟩ is replaced with the VICTIM's launch authority (faction.codesHolder):
// the UK wakes its prime minister, Pakistan its committee — not "the president".
export const HEROES = [
  'A LIEUTENANT COLONEL ON DUTY DID WHAT STANISLAV PETROV DID ON 26 SEPTEMBER 1983: REPORTED A FALSE ALARM BEFORE HE KNEW IT TO BE TRUE. HIS NAME WILL NOT BE RELEASED FOR FORTY YEARS.',
  'A FLAG OFFICER IN THE ROOM REFUSED HIS CONSENT, AS VASILY ARKHIPOV REFUSED HIS ABOARD SUBMARINE B-59 IN OCTOBER 1962. AUTHORIZATION REQUIRED THREE SIGNATURES. IT GOT TWO.',
  '⟨CODES⟩ WAS HANDED THE CODES AND CHOSE TO WAIT, AS BORIS YELTSIN WAITED ON 25 JANUARY 1995, WATCHING THE TRACK ON THE SCREEN UNTIL IT TURNED OUT TO SEA. IT WAS A WEATHER ROCKET.',
  'A LAUNCH CREW CAPTAIN QUESTIONED THE ORDER, AS CAPTAIN WILLIAM BASSETT IS SAID TO HAVE DONE ON OKINAWA IN 1962, AND KEPT QUESTIONING IT UNTIL IT WENT AWAY.',
  'A SENIOR OFFICER ASKED ONE QUESTION BEFORE CONFIRMING THE ATTACK, AS AIR MARSHAL ROY SLEMON ASKED AT NORAD ON 5 OCTOBER 1960: "WHERE IS KHRUSHCHEV?" THE PREMIER WAS IN NEW YORK. THE MISSILES WERE THE MOON.',
  'A LAUNCH OFFICER ASKED HOW HE COULD KNOW A LAUNCH ORDER WAS SANE, AS MAJOR HAROLD HERING ASKED IN 1973. THE QUESTION ENDED HIS CAREER. IT HAS NOT BEEN ANSWERED.',
  'AN INTELLIGENCE OFFICER WATCHED THE OTHER SIDE ARM ITS BOMBERS AND CHOSE NOT TO MATCH THE ALERT, AS GENERAL LEONARD PERROOTS DID DURING ABLE ARCHER IN NOVEMBER 1983. THE LADDER STOPPED BECAUSE ONE MAN DECLINED TO CLIMB IT. THE FILE STAYED SEALED FOR THIRTY YEARS.',
  'A DUTY OFFICER, TOLD A THOUSAND WARHEADS WERE INBOUND, WAITED FOR CONFIRMATION BEFORE WAKING ⟨CODES⟩, AS ZBIGNIEW BRZEZINSKI WAITED ON 9 NOVEMBER 1979. IT WAS A TRAINING TAPE, LEFT RUNNING. HE HAD NOT EVEN WOKEN HIS WIFE; HE THOUGHT THEY WOULD ALL BE DEAD IN HALF AN HOUR.',
]

export function resolveThirdParty(
  w: WorldWithBelief,
  ev: ThirdPartyEvent,
  choice: Intervention,
  playerId: string,
  rng: Rng,
): ThirdPartyOutcome {
  const yr = 2026 + w.year
  const aggressor = w.powers[ev.aggressorId]
  const victim = w.powers[ev.victimId]
  const player = w.powers[playerId]
  const aN = theName(aggressor.f.name)   // articled name for prose ("THE UNITED STATES")
  const vN = theName(victim.f.name)
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

  if (choice === 'nuclear') {
    // Handled by the caller as an ending; text unused.
    return { kind: 'escalation', text: '' }
  }

  if (choice === 'conventional') {
    // Striking launch infrastructure reads as decapitation to a regime that
    // cannot see well. Bad NC3 and a hot temper make it worse.
    const pEscalate = 0.15 + (10 - aggressor.nc3) * 0.04 + aggressor.f.botAggression * 0.2
    if (rng() < pEscalate) {
      w.log.push({ y: yr, t: `YOUR CONVENTIONAL STRIKE ON ${aN} WAS READ AS THE FIRST WAVE. THEY HAVE ANSWERED. THE SKY IS YOURS NOW.`, k: 'attack' })
      w.tension = clamp(w.tension + 2, 0, 10)
      return {
        kind: 'escalation',
        text: `THE STRIKE PACKAGE ARRIVED. ${aN}, HALF-BLIND, READ IT AS DECAPITATION. AN INDICATION IS NOW INBOUND — TO YOU. THIS ONE IS NOT AMBIGUOUS.`,
      }
    }
    if (ev.isReal) {
      player.legit = player.legit >= 10 ? player.legit : player.legit + 1
      w.tension = clamp(w.tension - 1, 0, 10)
      w.log.push({ y: yr, t: `A CONVENTIONAL STRIKE DESTROYED ${aN}'S LAUNCH INFRASTRUCTURE MID-COUNT. THE WAR DID NOT HAPPEN. LEGITIMACY +1.`, k: 'notable' })
      return {
        kind: 'defused',
        text: `THE TRANSPORTER-ERECTORS WERE STILL FUELING WHEN THE STRIKE ARRIVED. THE LAUNCH DID NOT COMPLETE. THE PEOPLE OF ${vN} WILL NEVER KNOW HOW CLOSE IT CAME. LEGITIMACY RISES. QUIETLY.`,
      }
    }
    player.legit = Math.max(0, player.legit - 1)
    w.tension = clamp(w.tension + 1, 0, 10)
    w.log.push({ y: yr, t: `YOUR CONVENTIONAL STRIKE ON ${aN} ANSWERED AN INDICATION THAT WAS NEVER REAL.`, k: 'attack' })
    return {
      kind: 'ghost-strike',
      text: `THE STRIKE WAS FLAWLESS. THE TARGET LIST WAS ACCURATE. THE LAUNCH IT WAS MEANT TO STOP HAD NEVER EXISTED. ${aN} BURIES ITS DEAD ON TELEVISION. LEGITIMACY FALLS.`,
    }
  }

  // DO NOTHING: the decision belongs to the victim, as it always did.
  // Calibration: no third-party watch can end the world in the first six
  // years — the opening moves belong to the player. After that, victims stand
  // down the overwhelming majority of the time, and a real regional exchange
  // only spreads when the world is already wound tight.
  const early = w.year < 6
  const pStandDown = 0.9 + victim.nc3 * 0.01 - victim.f.botAggression * 0.05
  if (!ev.isReal) {
    if (early || rng() < pStandDown) {
      let heroAvail = HEROES.map((_, i) => i).filter((i) => !w.usedHeroes.includes(i))
      if (heroAvail.length === 0) { w.usedHeroes = []; heroAvail = HEROES.map((_, i) => i) }
      const heroIdx = heroAvail[Math.floor(rng() * heroAvail.length)]
      w.usedHeroes.push(heroIdx)
      const hero = HEROES[heroIdx].replace('⟨CODES⟩', victim.f.codesHolder)
      w.log.push({ y: yr, t: `${vN} STOOD DOWN ON A FALSE INDICATION. NOTHING ARRIVED.`, k: 'notable' })
      w.tension = clamp(w.tension + 0.3, 0, 10)
      return { kind: 'hero', text: `NOTHING ARRIVED IN ${vN}.\n\nIN THEIR WARNING CENTER, ${hero}` }
    }
    pushReplayEvent(w, `${victim.f.name} ANSWERED A GHOST`, 'launch', victim.f.id, ev.aggressorId)
    pushReplayEvent(w, `${aggressor.f.name} ANSWERED IN FULL`, 'launch', ev.aggressorId, victim.f.id)
    return {
      kind: 'victim-launch',
      text: `${vN} BELIEVED THEIR SCREEN. THE SCREEN WAS WRONG. ${aN} ANSWERED WHAT WAS, UNTIL THAT MOMENT, A FALSE ALARM.`,
    }
  }
  // Real attack, no intervention. At low tension the answer stays
  // conventional; at high tension the region burns, and then the world does.
  if (early || w.tension < 5) {
    w.tension = clamp(w.tension + 2, 0, 10)
    w.log.push({ y: yr, t: `A REAL STRIKE ON ${vN} WAS ANSWERED CONVENTIONALLY. THE THRESHOLD HELD.`, k: 'attack' })
    pushReplayEvent(w, `REAL STRIKE ON ${victim.f.name} — HELD CONVENTIONAL`, 'launch', ev.aggressorId, ev.victimId)
    return {
      kind: 'contained',
      text: `IT WAS REAL. ${vN} ABSORBED IT — AND ANSWERED BELOW THE THRESHOLD. ARTILLERY, AIRCRAFT, A BORDER ON FIRE. NOT THE OTHER THING.\n\nTHE EXCHANGE STAYED REGIONAL. THIS TIME. TENSION SOARS.`,
    }
  }
  pushReplayEvent(w, `${aggressor.f.name} STRUCK ${victim.f.name}`, 'launch', ev.aggressorId, ev.victimId)
  pushReplayEvent(w, `${victim.f.name} ANSWERED IN FULL`, 'launch', ev.victimId, ev.aggressorId)
  return {
    kind: 'regional-war',
    text: `IT WAS REAL. ${vN} ABSORBED THE FIRST WAVE AND ANSWERED IN FULL. THE EXCHANGE DID NOT STAY REGIONAL. THEY NEVER DO.`,
  }
}

export function factionName(id: string): string {
  return FACTIONS.find((f) => f.id === id)?.name ?? id.toUpperCase()
}
