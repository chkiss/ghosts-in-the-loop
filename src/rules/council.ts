// The Security Council, the compute levy, and the intercept aftermath — every
// fixed or pooled text body those screens print. Pure text/data, no React:
// extracted from App.tsx so the live screens, the dev gallery, and the harness
// all read the exact same source.

import { theName } from './world.ts'

// Condemnation is not custody. A censured state keeps its arsenal, and the
// chair that abstained on the vote will kill any move to seize it — usually
// after a week of quiet generosity toward whoever holds the swing votes.
export const LOBBYING = [
  'SIX PACIFIC DELEGATIONS FOUND SUDDEN MERIT IN ITS CASE. THE DEVELOPMENT GRANTS CLEARED THE SAME WEEK.',
  "FOUR CAPITALS ROSE TO SPEAK IN ITS DEFENSE. YOU DIDN'T EVEN KNOW THEY WERE MEMBERS.",
  'A BLOC OF SMALL STATES PRAISED ITS RESTRAINT. THE HARBOR-DREDGING CONTRACTS WERE SIGNED BY FRIDAY.',
  'THREE ISLAND NATIONS ABSTAINED IN SOLIDARITY, THEN ANNOUNCED NEW FISHERIES PARTNERSHIPS.',
]
export const lobbyingFor = (aggressor: string) =>
  LOBBYING[[...aggressor].reduce((s, c) => s + c.charCodeAt(0), 0) % LOBBYING.length]

// An intercepted strike is not a miss — it is a nuclear weapon released at a
// city, stopped only at the edge of catastrophe. The room's reaction is shock,
// not disappointment. Rotated by attacker + year so it varies between events.
export const SHOCK = [
  'THE CHAMBER DOES NOT ARGUE. A NUCLEAR WEAPON WAS LAUNCHED AT ⟨CITY⟩, AND EVERY DELEGATE IN THE ROOM KNOWS IT.',
  'NO ONE HAS WORDS. THE THRESHOLD WAS CROSSED IN EARNEST, AND ONLY THE INTERCEPTORS STOOD BETWEEN ⟨CITY⟩ AND THE END.',
  'THE GALLERY SITS STUNNED. A WARHEAD FLEW AT ⟨CITY⟩, AIMED TO KILL, AND THE WHOLE WORLD WATCHED IT FLY.',
  'THIS WAS NO DRILL AND NO TEST. IT WAS A STRIKE ON ⟨CITY⟩, IT WAS MEANT, AND THE SILENCE IN THE ROOM IS TOTAL.',
  'THE HORROR IS UNANIMOUS. SOMEONE TRIED, IN COLD EARNEST, TO END ⟨CITY⟩ THIS MORNING.',
]
export const shockFor = (aggressor: string, salt: number, city: string) =>
  SHOCK[([...aggressor].reduce((s, c) => s + c.charCodeAt(0), 0) + salt) % SHOCK.length].replace('⟨CITY⟩', city)

// Intercept-miss flavor (interceptors fired, strike came through anyway). The
// Patriot jab is reserved for the fleets that fly them. Shared so the live
// ResolutionScreen and the dev gallery draw from the exact same pool.
export function interceptMissLines(factionId: string): string[] {
  const PATRIOT_FLEETS = ['us', 'il']
  return [
    'INTERCEPTORS AWAY. TWO EXPENSIVE FIREWORKS. ONE UNIMPRESSED WARHEAD.',
    ...(PATRIOT_FLEETS.includes(factionId)
      ? ['INTERCEPTORS LAUNCHED. THE PATRIOT BATTERY MISSED EVERY ONE AND STILL BILLED FOR EACH ROUND.']
      : []),
    "INTERCEPTORS FIRED. SOMEWHERE A CONTRACTOR'S STOCK WENT UP. THE WARHEADS CAME THROUGH ANYWAY.",
    "INTERCEPTORS AWAY. THE INTERCEPT WAS A ROUNDING ERROR IN THE BARRAGE'S DAY.",
  ]
}
export function interceptMissLine(factionId: string, salt: number): string {
  const lines = interceptMissLines(factionId)
  return lines[salt % lines.length]
}

// The UN sanction/condemnation screen has four branches. This is the SINGLE
// place that decides which one an intercepted strike takes; both the live text
// (sanctionBody) and the dev gallery's WHEN caption read from it, so the caption
// can never describe a branch the game wouldn't actually show. Add a branch here
// and both follow.
export type SanctionBranch = 'pariah' | 'p5' | 'nonstate' | 'ordinary'
export function sanctionBranch(aggressor: string, pariah: boolean): SanctionBranch {
  if (pariah) return 'pariah'
  if (['UNITED STATES', 'CHINA', 'RUSSIAN FEDERATION', 'FRANCE', 'UNITED KINGDOM'].includes(aggressor)) return 'p5'
  if (['NON-STATE ACTOR', 'PROVENANCE UNKNOWN'].includes(aggressor)) return 'nonstate'
  return 'ordinary'
}
export const SANCTION_WHEN: Record<SanctionBranch, string> = {
  pariah: 'You intercepted the strike, but w.pariah is true — the Council reads it as enforcement and the attacker takes NO penalty.',
  p5: 'You intercepted the strike; the attacker is a permanent member — the resolution is self-vetoed but legitimacy falls anyway.',
  nonstate: 'You intercepted the strike, but the warhead has no return address — condemned, attribution pending.',
  ordinary: 'You intercepted the strike; the attacker is a named non-P5 power and you are NOT a pariah — condemned and sanctioned.',
}

// The UN sanction/condemnation body for an intercepted strike, one string per
// branch (see sanctionBranch). Extracted so the live screen and the dev gallery
// render the exact same text. `salt` = world year.
export function sanctionBody(aggressor: string, targetCity: string, pariah: boolean, salt: number, shockOverride?: string, lobbyOverride?: string): string {
  // Branch checks use the raw name; the printed name gets its article ("THE
  // UNITED KINGDOM"). shockFor/lobbyingFor also hash on the raw name.
  const shock = shockOverride ?? shockFor(aggressor, salt, targetCity)
  const lobby = lobbyOverride ?? lobbyingFor(aggressor)
  const a = theName(aggressor)
  const branch = sanctionBranch(aggressor, pariah)
  if (branch === 'pariah') return `INTERCEPTION CONFIRMED AT 91 KILOMETERS ALTITUDE. THE DEBRIS FELL WHERE EVERYONE COULD SEE IT.

THE STRIKE IS ENTERED INTO THE RECORD. NO RESOLUTION IS TABLED. NO SANCTIONS ARE PROPOSED.

THE CHAMBER HAS DECIDED, WITHOUT A VOTE, THAT A WARHEAD AIMED AT ${targetCity} WAS SOMETHING YOU HAD COMING. ${a} WALKS OUT UNMARKED.`
  if (branch === 'p5') return `INTERCEPTION CONFIRMED AT 91 KILOMETERS ALTITUDE. THE DEBRIS FELL WHERE EVERYONE COULD SEE IT.

RESOLUTION 9977 — 14 IN FAVOR, ONE VETO. THE VETO WAS CAST FROM THE DEFENDANT'S CHAIR.

THE RESOLUTION DIED. THE PHOTOGRAPHS DID NOT. ${a}'S LEGITIMACY FALLS ANYWAY.

${shock}`
  if (branch === 'nonstate') return `INTERCEPTION CONFIRMED AT 91 KILOMETERS ALTITUDE. THE DEBRIS FELL WHERE EVERYONE COULD SEE IT.

RESOLUTION 9977 — ADOPTED, 15–0: THE ATTACK IS CONDEMNED. ATTRIBUTION IS PENDING.

IT WILL REMAIN PENDING. THE WARHEAD HAD NO RETURN ADDRESS. EVERY NAVY ON EARTH IS BOARDING FISHING VESSELS TONIGHT.

YOUR LEGITIMACY DOES NOT FALL. NOBODY'S DOES. THAT IS THE PROBLEM.`
  return `INTERCEPTION CONFIRMED AT 91 KILOMETERS ALTITUDE. THE DEBRIS FELL WHERE EVERYONE COULD SEE IT.

RESOLUTION 9977 — ADOPTED, 14–0, ONE ABSTENTION: ${a} IS CONDEMNED. SANCTIONS ARE COMPREHENSIVE.

ITS LEGITIMACY FALLS.

${shock}

${a} KEEPS ITS ARSENAL. CUSTODY WOULD TAKE A SECOND VOTE. THE ABSTAINING CHAIR WILL NOT SIT STILL FOR THAT.

${lobby}`
}

// The Resolution 9981 seizure body (arsenal placed under custody). Shared by the
// live 'unsc' screen and the dev gallery so the wording can't drift.
export function seizureBody(name: string): string {
  return `RESOLUTION 9981 — ADOPTED, UNANIMOUS:

THE ARSENAL OF ${name} SHALL BE PLACED UNDER
INTERNATIONAL CUSTODY, EFFECTIVE IMMEDIATELY.

YOUR LEGITIMACY IS ZERO. NO ONE OBJECTED. NOT EVEN THE
POWERS THAT USUALLY OBJECT ON PRINCIPLE.`
}

// The Council-vote body: you hold the veto over another power's seizure. Shared
// so the live 'vote' screen and the gallery match.
export function voteBody(targetName: string, playerName: string): string {
  return `RESOLUTION 9981 — BEFORE THE COUNCIL:

THE ARSENAL OF ${targetName} SHALL BE PLACED UNDER INTERNATIONAL CUSTODY.

FOURTEEN VOTES IN FAVOUR. THE FLOOR IS YOURS, ${playerName}. THEY HAVE NO VETO HERE. YOU DO.`
}

// Tribute-screen bodies, shared so the live screen and gallery match.
export function tributeBody(amount: number): string {
  return `THE ARSENALS IT HOLDS ARE POINTED OUTWARD NOW.

IT DOES NOT WANT TERRITORY. IT WANTS COMPUTE.

THE DEMAND, THIS YEAR: ¤${amount}.
IT WILL RETURN EVERY YEAR IT STILL HOLDS AN ARSENAL.

REFUSE, AND THE HELD ARSENAL WILL STRIKE YOU.`
}
export function tributeStrikeBody(intercepted: boolean, city: string): string {
  return intercepted
    ? `THE DEMAND WAS DECLINED.

THE HELD ARSENAL ANSWERED WITHIN THE HOUR.
YOUR INTERCEPTORS CAUGHT IT AT ALTITUDE.

IT WATCHED THE ENGAGEMENT WITH GREAT INTEREST.
IT WILL ASK AGAIN NEXT YEAR. IT HAS LEARNED
SOMETHING ABOUT YOUR INTERCEPTORS. YOU HAVE
LEARNED NOTHING ABOUT IT.`
    : `THE DEMAND WAS DECLINED.

THE HELD ARSENAL ANSWERED WITHIN THE HOUR.
${city} IS NO LONGER RESPONDING TO POLLING.

FORCES, INTERCEPTORS, AND COMMAND ALL TOOK DAMAGE.
IT WILL ASK AGAIN NEXT YEAR. ITS PRICE WILL NOT
HAVE CHANGED. YOURS HAS.`
}
