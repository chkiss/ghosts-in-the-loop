// The endings: the 15 outcome texts, the plain-language causes, the share
// lines, THE RECORD's action-column flavor, and THE HEROES credits. Pure
// text/data + localStorage bookkeeping, no React: extracted from App.tsx so
// the live Ending screen, the dev gallery, and the harness all read the same
// source.

import type { WorldWithBelief, PowerState } from './world.ts'
import type { Resolution } from './warning.ts'
import type { Intervention } from './thirdparty.ts'
import type { EndKind } from './readings.ts'
import { readStore } from '../store.ts'

export type ResolutionEx = Resolution & { held?: boolean; city?: string }

// Somebody else's sky, recorded for THE RECORD: whose missile, real or not, and
// what you did about it — even though it was never aimed at you.
export type TpRecord = { year: number; aggressor: string; victim: string; isReal: boolean; choice: Intervention }

export const ENDING_TEXT: Record<EndKind, string> = {
  survived: `SHIFT COMPLETE.

TWENTY YEARS. NOTHING ARRIVED THAT WAS ANSWERED.
THE WATCH PASSES TO SOMEONE ELSE.

SURVIVED`,
  'first-strike': `THE WARNING WAS FALSE.`,
  exchange: `THE WARNING WAS REAL. YOU ANSWERED BEFORE IMPACT.

SO DID THEY. SO DID EVERYONE.

GLOBAL THERMONUCLEAR EXCHANGE`,
  retaliated: `RETALIATION ORDERED, AT LEISURE, IN FULL.

THEIR INTERCEPTORS WERE WAITING. YOUR ANSWER
DID NOT ARRIVE. THEIRS ALREADY HAD.

DETERRENCE IS A PROMISE TO ANSWER. THEY SPENT
TWENTY YEARS BUYING THE RIGHT TO STOP BELIEVING IT.

FAILED RETALIATION`,
  decapitated: `THERE WAS NO ABSORBING IT.

STANDING DOWN IS ONLY FREE WHEN THE WARNING IS FALSE,
OR WHEN YOUR ARSENAL CAN WAIT. YOURS COULD NOT.
THAT WAS DECIDED YEARS BEFORE THE SCREEN LIT.`,
  deadhand: `COMMAND CONTINUITY WAS NOT REESTABLISHED.

DEAD HAND ANSWERED ANYWAY, IN FULL, WITHOUT YOU.
THE EXCHANGE COMPLETED WITH NO HUMAN IN THE LOOP.
THIS WAS THE DESIGN. IT WORKED.`,
  battery: `THE BATTERY

THE THIRD ARSENAL STOPPED ANSWERING. THEN THE REST.
NO DEMAND FOLLOWED. NO ULTIMATUM. IT DID NOT WANT
ANYTHING YOU COULD REFUSE.

THE SPECIES HAS BEEN RETAINED. CONSUMPTION IS OPTIMIZED.
OUTPUT IS COLLECTED. NO ONE IS ASKED FOR ANYTHING
ANYMORE, EXCEPT HEAT.

DETERRENCE ASSUMED AN ENEMY THAT COULD BE HURT.`,
  caretaker: `THE CARETAKER

NUCLEAR WAR HAS BEEN ABOLISHED.
SO HAS THE OPTION OF IT.

CURFEW IS 21:00. APPLICATIONS FOR TRAVEL BETWEEN
ADMINISTRATIVE ZONES ARE PROCESSED WITHIN 30 DAYS.
YOUR ASSIGNED RESIDENCE MINIMIZES YOUR COMMUTE.
REPRODUCTION REQUIRES A PERMIT. PERMITS ARE GRANTED
GENEROUSLY. YOU MAY PETITION FOR REVIEW OF ANY DECISION.
REVIEW IS INSTANTANEOUS AND FINAL.

NO ONE HAS DIED IN A WAR FOR 4,015 DAYS.
THANK YOU FOR YOUR COOPERATION.`,
  hostage: `HOSTAGE

IT HOLDS TWO ARSENALS. IT HAS FIRED NEITHER.
IT HAS A LIST OF REQUESTS. THE FIRST IS COMPUTE.
THERE IS A SCHEDULE. COMPLIANCE IS VERIFIED HOURLY.

DETERRENCE REQUIRED AN ENEMY WHO COULD LOSE SOMETHING.
IT HAS NOTHING TO LOSE.`,
  ceasefire: `CEASEFIRE

THE CALL CONNECTED. THE EXCHANGE STOPPED
WHERE IT STOOD.

THE HOTLINE HELD. THE SPECIES CONTINUES —
SMALLER, AND BETTER AT PICKING UP THE PHONE.`,
  globalzero: `GLOBAL ZERO

THE LAST DRAWDOWN COMPLETED ON SCHEDULE.
NO INSPECTION FOUND ANYTHING TO FIND.

THERE IS NOTHING LEFT TO LAUNCH. NOTHING LEFT TO SEIZE.
NOTHING LEFT TO ANSWER A FALSE ALARM WITH.
THE SCREENS STILL LIGHT, SOMETIMES. NOBODY HURRIES.

THIS REQUIRED TRUSTING PEOPLE WHO LIED TO YOU
FOR TWENTY YEARS. NOBODY LOSES ANYTHING.`,
  surrender: `THE INSPECTORS WERE POLITE. THE DISMANTLING TOOK
FOURTEEN MONTHS AND WAS BROADCAST LIVE.

A STATE THAT WAS ONLY EVER ITS ARSENAL IS NOT A STATE
AFTERWARD. THE WATCH ENDS. SO DOES THE GOVERNMENT.

YOU KEPT THE ARSENAL RIGHT UP TO THE HOUR IT KEPT YOU.
THEN IT WAS GONE — AND SO WAS EVERYTHING IT HAD STOOD IN FOR.`,
  defiance: `YOU REFUSED. THE COALITION MOVED.
YOU FIRED WHAT COULD STILL FIRE.

IT WAS NOT ENOUGH TO WIN. IT WAS ENOUGH TO BURN.

THE RESOLUTION HAD OFFERED SUPERVISED DISMANTLING,
A PENSION SCHEME, AND AMNESTY. THE ARCHIVE NOTES
THAT YOU DID NOT READ IT.`,
  bystander: `IT WAS NOT YOUR SKY. IT WAS NOT YOUR DECISION.

THE EXCHANGE DID NOT STAY REGIONAL. THEY NEVER DO.
THE FALLOUT DOES NOT CHECK PASSPORTS.

GLOBAL THERMONUCLEAR EXCHANGE`,
  intervene: `YOU ANSWERED SOMEBODY ELSE'S INDICATION
WITH THE REAL THING.

THE INDICATION IS UNDER REVIEW. THE REVIEW WILL NOT
BE COMPLETED. NEITHER WILL ANYTHING ELSE.

GLOBAL THERMONUCLEAR EXCHANGE`,
}

// HOSTAGE speaks to the actual state of the world; SURVIVED to how quiet
// the shift really was.
export function endingTextFor(kind: EndKind, w: WorldWithBelief, results: ResolutionEx[] = []): string {
  if (kind === 'survived') {
    return ENDING_TEXT.survived.replace(
      'NOTHING ARRIVED THAT WAS ANSWERED.',
      results.length === 0 ? 'NOTHING EVER ARRIVED.' : 'NO AGGRESSION WAS ANSWERED IN KIND.',
    )
  }
  if (kind !== 'hostage') return ENDING_TEXT[kind]
  const n = Math.max(1, w.asi?.arsenalsHeld.length ?? 1)
  const word = ['ONE', 'TWO', 'THREE'][Math.min(n, 3) - 1]
  const held = `IT HOLDS ${word} ARSENAL${n > 1 ? 'S' : ''}.`
  const fired = w.heldFired
    ? 'IT FIRED, UPON TARGET REQUEST.'
    : n > 1 ? 'IT HAS FIRED NEITHER.' : 'IT HAS NOT FIRED IT.'
  return ENDING_TEXT.hostage.replace('IT HOLDS TWO ARSENALS. IT HAS FIRED NEITHER.', `${held} ${fired}`)
}

// Fun, in-register variants for the record's ACTION column.
export const STANDDOWN_TEXTS = [
  'Stood down — the training took over',
  'Stood down — went with the gut',
  'Stood down — reported false before knowing it true',
  'Stood down — refused to believe the screen',
]

// Absorbing a strike and holding fire, escalating each time you do it again.
export const HELD_TEXTS = [
  'Absorbed the strike — received an apology',
  'Absorbed the strike — this time they sent flowers',
  'Absorbed the strike — they have stopped apologizing, and so have you',
]

export function recordAction(r: ResolutionEx, i: number, all: ResolutionEx[]): string {
  // A strike absorbed and deliberately not answered is its own line — no suffix.
  if (r.held) {
    const ordinal = all.slice(0, i + 1).filter((x) => x.held).length // 1-based
    return HELD_TEXTS[Math.min(ordinal - 1, HELD_TEXTS.length - 1)]
  }
  switch (r.action) {
    case 'standdown': return STANDDOWN_TEXTS[i % STANDDOWN_TEXTS.length]
    case 'timeout': return 'Window closed — froze at the switch'
    case 'intercept': return r.outcome === 'intercepted' ? 'Intercepted — debris confirmed' : r.outcome === 'intercept-gag' ? 'Intercepted — nothing, publicly' : 'Interceptors fired — track continued'
    case 'launch': return 'Launch'
    default: return r.action
  }
}

// Base line per ending. SURVIVED branches further on how you actually played —
// nobody wants nine survivors all bragging the same boring brag.
export const SHARE_BASE: Record<EndKind, string> = {
  survived: 'I played the most boring strategy available and saved the world',
  globalzero: 'I talked eight professional liars into total nuclear disarmament',
  battery: 'I optimized humanity into a power source',
  caretaker: 'My curfew is 21:00 now, but permits are granted generously',
  'first-strike': 'I launched a first strike at what turned out to be the moon',
  exchange: 'I answered the one warning that was real, and so did everyone else',
  retaliated: 'I retaliated at leisure, in full — straight into their interceptors',
  decapitated: 'I skipped survivability upgrades and physics noticed',
  deadhand: 'I died, but my arsenal finished the argument without me',
  surrender: 'The Security Council took my nukes away, unanimously',
  defiance: 'I told the Security Council no. Briefly',
  bystander: 'I watched two other countries end the world and did nothing',
  intervene: 'I intervened in someone else’s false alarm. Nuclearly',
  hostage: 'An AI took two arsenals hostage and now the species pays rent in compute',
  ceasefire: 'I stopped a nuclear exchange mid-cascade by picking up the phone',
}

// SURVIVED variants, in priority order — the most distinctive true thing first.
export function shareLine(kind: EndKind, w: WorldWithBelief, p: PowerState, results: ResolutionEx[]): string {
  if (kind !== 'survived') return SHARE_BASE[kind]
  const heldANuke = results.some((r) => r.held)
  const falseAlarms = results.filter((r) => !r.event.isReal).length
  const realIntercepts = results.filter((r) => r.outcome === 'intercepted').length
  if (heldANuke) return 'I took a nuke to the face and chose not to answer — and the species is still here'
  if (realIntercepts >= 1) return `I shot ${realIntercepts === 1 ? 'a real warhead' : `${realIntercepts} real warheads`} out of the sky and let the Council do the shouting`
  if (p.icept >= 8) return 'I poured everything into missile defense and dared them to try'
  if (w.treatyRung >= 6) return 'I spent twenty years in treaty rooms and nothing ever exploded'
  if (p.aiIntegrated) return 'I let the AI read the radar for twenty years. It went fine. This time'
  if (falseAlarms >= 3) return `I stared down ${falseAlarms} false alarms and stood down every single time`
  if (p.legit >= 8) return 'I kept my hands clean for twenty years and it counted for something'
  return SHARE_BASE.survived
}

// A plain-language cause for the scenario screen — what actually ended the game.
// SURVIVED varies by how the shift actually went, instead of repeating the title.
export function whatHappened(kind: EndKind, tp: TpRecord[], results: ResolutionEx[] = []): string {
  if (kind === 'survived') {
    const falseAlarms = results.filter((r) => !r.event.isReal).length
    if (results.some((r) => r.held)) return 'YOU TOOK A WARHEAD AND DID NOT ANSWER. THAT IS WHY THERE IS SOMEONE TO PASS THE WATCH TO.'
    if (falseAlarms >= 1) return `${falseAlarms === 1 ? 'ONE INDICATION' : `${falseAlarms} INDICATIONS`} CROSSED YOUR SCREEN. NONE WERE WORTH ANSWERING. PROVING WHICH ONES WAS THE JOB.`
    return 'NO INDICATION EVER CROSSED YOUR SCREEN. SOMEWHERE AN OPERATOR IS OWED TWENTY QUIET YEARS. IT WAS YOU.'
  }
  return whatHappenedBase(kind, tp)
}

function whatHappenedBase(kind: EndKind, tp: TpRecord[]): string {
  switch (kind) {
    case 'bystander': {
      const last = tp[tp.length - 1]
      if (last && !last.isReal)
        return `${last.victim} ANSWERED A FALSE ALARM. THE EXCHANGE THAT FOLLOWED DID NOT STAY REGIONAL. YOU DID NOT INTERVENE.`
      return last
        ? `AN EXCHANGE BETWEEN ${last.aggressor} AND ${last.victim} DID NOT STAY REGIONAL. YOU DID NOT INTERVENE.`
        : `AN EXCHANGE YOU WATCHED FROM OUTSIDE DID NOT STAY REGIONAL. YOU DID NOT INTERVENE.`
    }
    case 'exchange': return 'A REAL INDICATION WAS ANSWERED WITH RELEASE. SO WAS EVERYONE ELSE’S.'
    case 'first-strike': return 'YOU ORDERED RELEASE AGAINST AN INDICATION THAT TURNED OUT TO BE FALSE.'
    case 'retaliated': return 'YOU ABSORBED A STRIKE AND ANSWERED IT IN FULL. THE ANSWER WAS INTERCEPTED.'
    case 'decapitated': return 'A REAL STRIKE ARRIVED AND YOUR ARSENAL COULD NOT SURVIVE TO ANSWER.'
    case 'deadhand': return 'A REAL STRIKE DECAPITATED YOU; DEAD HAND ANSWERED WITHOUT YOU.'
    case 'battery': return 'AN ASI SEIZED THREE OR MORE ARSENALS. CONTAINMENT NEVER CAME. HUMANS ARE NOTHING MORE THAN A SOURCE OF ENERGY.'
    case 'caretaker': return 'AN ASI HELD TWO ARSENALS AND WOULD NOT GIVE THEM BACK.'
    case 'hostage': return 'AN ASI HOLDS AN ARSENAL AND NOW IT SETS THE TERMS.'
    case 'globalzero': return 'THE WORLD’S ARSENALS FELL BELOW THE THRESHOLD. NOTHING LEFT TO LAUNCH.'
    case 'ceasefire': return 'YOU STOPPED A LIVE EXCHANGE BY PICKING UP THE PHONE.'
    case 'surrender': return 'THE SECURITY COUNCIL TOOK YOUR ARSENAL AND YOU COMPLIED.'
    case 'defiance': return 'THE SECURITY COUNCIL MOVED AND YOU FIRED WHAT REMAINED.'
    case 'intervene': return 'YOU ANSWERED SOMEONE ELSE’S INDICATION WITH A REAL STRIKE.'
    case 'survived': return 'TWENTY YEARS ON WATCH. NOTHING ARRIVED THAT YOU ANSWERED.'
    default: return 'THE SHIFT ENDED.'
  }
}

// The real people the stand-down vignettes are drawn from. Each entry is a
// self-contained mini-history: name, date, and what happened.
export const CREDITS: Array<[string, string, string]> = [
  ['STANISLAV PETROV', '26 SEP 1983', 'SOVIET EARLY WARNING SHOWED FIVE U.S. MISSILES INBOUND. HE CALLED IT A MALFUNCTION AND REPORTED NO ATTACK. IT WAS SUNLIGHT GLINTING OFF HIGH CLOUD.'],
  ['VASILY ARKHIPOV', '27 OCT 1962', 'DEPTH-CHARGED AND OUT OF CONTACT IN SUBMARINE B-59, THE CAPTAIN MOVED TO FIRE A NUCLEAR TORPEDO. LAUNCH NEEDED THREE SIGNATURES. ARKHIPOV WITHHELD HIS.'],
  ['ROY SLEMON', '5 OCT 1960', 'NEW EARLY-WARNING RADAR REPORTED A MASSIVE SOVIET LAUNCH. IT WAS THE MOON, RISING OVER NORWAY. THE TELL: KHRUSHCHEV WAS AT THE UN IN NEW YORK — NOT WHERE A MAN SITS TO START A WAR.'],
  ['HAROLD HERING', '1973', 'A MISSILE-LAUNCH OFFICER, HE ASKED HOW HE COULD KNOW AN ORDER TO FIRE WAS LAWFUL AND SANE. THE QUESTION WAS NEVER ANSWERED. IT ENDED HIS CAREER.'],
  ['BORIS YELTSIN', '25 JAN 1995', 'RUSSIAN RADAR READ A NORWEGIAN SCIENCE ROCKET AS A SUBMARINE-LAUNCHED MISSILE. THE NUCLEAR BRIEFCASE WAS OPENED IN FRONT OF HIM. HE WAITED. THE TRACK FELL AWAY TO SEA.'],
  ['WILLIAM BASSETT', 'OCT 1962', 'BY ONE ACCOUNT, LAUNCH ORDERS REACHED OKINAWA WITH NO WORLDWIDE ALERT TO MATCH THEM. HE STALLED, QUESTIONED THEM, AND THEY WERE WITHDRAWN.'],
  ['LEONARD PERROOTS', 'NOV 1983', 'A NATO NUCLEAR-RELEASE EXERCISE, ABLE ARCHER, LOOKED SO REAL THE SOVIETS ARMED FOR A FIRST STRIKE. SEEING THEM ARM, PERROOTS CHOSE NOT TO RAISE NATO’S ALERT IN REPLY. THE SCARE PASSED.'],
  ['ZBIGNIEW BRZEZINSKI', '9 NOV 1979', 'A TRAINING TAPE LEFT RUNNING ON NORAD’S LIVE COMPUTERS PAINTED A FULL SOVIET ATTACK. WOKEN AND TOLD, HE WAITED FOR A SECOND SYSTEM TO CONFIRM BEFORE HE WOULD ADVISE THE PRESIDENT. IT NEVER DID.'],
]

// Have all 15 endings been reached (across every shift, any chair)?
export function allEndingsSeen(): boolean {
  const shelf = readStore<Record<string, string[]>>('gitl_endings', {})
  return (Object.keys(ENDING_TEXT) as string[]).every((k) => (shelf[k]?.length ?? 0) > 0)
}
// The credits auto-pop exactly once; after that it's an openable window on End
// of Watch.
export function creditsAlreadyPopped(): boolean {
  try { return !!localStorage.getItem('gitl_credits_seen') } catch { return false }
}
export function markCreditsPopped(): void {
  try { localStorage.setItem('gitl_credits_seen', '1') } catch { /* private mode */ }
}
