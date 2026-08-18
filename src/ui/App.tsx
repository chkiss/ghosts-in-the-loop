// The shell: boot seal → assignment (on the board) → twenty compressed years
// → indications, other people's indications, the Council, the endings.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { makeRng, seedFromString, randomSeedString, type Rng } from '../sim/rng.ts'
import { EXTRACTION, FACTIONS, IRAN_FACTION, P5, PATRON, SPEEDS, factionIdByName, type Faction, type SpeedId } from '../sim/factions.ts'
import {
  newWorld, advanceYear, applyPlayerAction, applyCrisisChoice, applyVote, patronFor, income, score, asiHeldEnding, applyStrikeDamage, enterIranMode, startAsIran, assuranceMaxed, costFor, type WorldWithBelief, type PowerState,
} from '../rules/world.ts'
import { initCascade, cascadeStep, type CascadeState, type CascadeMove } from '../rules/cascade.ts'
import { sanctionBody, seizureBody, voteBody, tributeBody, tributeStrikeBody, interceptMissLine } from '../rules/council.ts'
import { type ResolutionEx, type TpRecord } from '../rules/endings.ts'
import { Ending, nfuExtras } from './Ending.tsx'
import { flow, START_YEAR, mmss } from './format.ts'
import { useKeydown, useArt } from './hooks.ts'
import { readStore } from '../store.ts'
import {
  rollWarning, resolve, realStrikeOdds, falseAlarmOdds,
  type Action, type Resolution, type WarningEvent,
} from '../rules/warning.ts'
import {
  rollThirdParty, resolveThirdParty, factionName,
  type ThirdPartyEvent, type ThirdPartyOutcome, type Intervention,
} from '../rules/thirdparty.ts'
import { unlockAudio, startKlaxon, stopKlaxon, blip, setAudioMuted } from '../fx/klaxon.ts'
import { causeFor } from '../data/incidents.ts'
import { WarningModal } from './WarningModal.tsx'
import { StrategicScreen } from './StrategicScreen.tsx'
import { WorldMap } from './WorldMap.tsx'

import { installTipFlip } from './tipflip.ts'
import { tlog, installErrorCapture } from './telemetry_runtime.ts'
// replay.ts pulls in the GIF encoder. It is only ever needed if a player asks
// for the replay at end of watch, so it loads on demand rather than at boot.
import { pushReplayEvent, type World } from '../rules/world.ts'
import { GAME_TITLE } from '../brand.ts'
import { assignedReadingIds, type EndKind } from '../rules/readings.ts'

const TICK_MS = 50

const END_YEAR = 2045   // the shift ends here; say so, loudly and often

type Settings = { audio: boolean; crtFx: boolean; tutorial: boolean }

// The single rule for the RED (alert) CRT shell, keyed on the production screen
// kind. Used by both the live game and the dev gallery so they can never diverge
// on which screens flash red.
export function screenIsRed(k: string): boolean {
  return k === 'warning' || k === 'cascade'
}

// Firing interceptors costs 1–3 budget, scaling with how much you've invested.
const iceptFireCost = (p: PowerState, w: World) => (w.overhangFired.includes(7) ? 0 : 1 + Math.floor(p.icept / 4))

type Screen =
  | { k: 'boot' }
  | { k: 'briefing' }
  | { k: 'year' }
  | { k: 'indication' }
  | { k: 'warning' }
  | { k: 'resolution'; resIndex: number; timedOut: boolean }
  | { k: 'holdChoice'; resIndex: number }
  | { k: 'thirdparty' }
  | { k: 'tpOutcome'; outcome: ThirdPartyOutcome; ending?: EndKind }
  | { k: 'sanction'; aggressor: string; targetCity: string }
  | { k: 'unsc' }
  | { k: 'vote' }
  | { k: 'crisis' }
  | { k: 'notice' }
  | { k: 'tribute' }
  | { k: 'tributeStrike'; city: string; intercepted: boolean }
  | { k: 'cascade'; event: string }
  | { k: 'ending'; kind: EndKind }

export function App() {
  const [screen, setScreen] = useState<Screen>({ k: 'boot' })
  const screenRef = useRef<string>('boot')
  const [faction, setFaction] = useState<Faction>(FACTIONS[0])
  const [speedId, setSpeedId] = useState<SpeedId>('standard')
  const [seedStr, setSeedStr] = useState(randomSeedString())

  // ——— settings (persisted) + help overlay ———
  const [settings, setSettings] = useState<Settings>(() =>
    ({ audio: true, crtFx: true, tutorial: true, ...readStore<Partial<Settings>>('gitl_settings', {}) }))
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showTutPrompt, setShowTutPrompt] = useState(false)
  // Q, then Q again: walk out. Anything else stands the player back up.
  const [showQuit, setShowQuit] = useState(false)
  const quitRef = useRef(false)
  useEffect(() => { quitRef.current = showQuit }, [showQuit])
  useEffect(() => {
    setAudioMuted(!settings.audio)
    try { localStorage.setItem('gitl_settings', JSON.stringify(settings)) } catch { /* private mode */ }
  }, [settings])

  // The code nobody admits knowing. Entered from any chair once Iran's test
  // registers, it moves the player to Tehran. The old seat goes to the bots.
  const codeRef = useRef<string[]>([])

  useEffect(() => {
    installErrorCapture(() => ({ seed: seedStr, f: faction?.id ?? '-', scr: screenRef.current }))
    installTipFlip()
    tlog('load', { ua: navigator.userAgent.slice(0, 120) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Enter advances any screen whose only move is a single enabled button
  // (RESUME WATCH, ACKNOWLEDGE, END OF WATCH…). Screens with real choices
  // (warning, crisis, levy, strategic, briefing) are untouched.
  useKeydown((e) => {
    if (e.repeat) return
    const inField = (e.target as HTMLElement)?.tagName === 'INPUT'
    // '?' opens the field manual from anywhere; Escape closes any overlay.
    if (e.key === '?' && !inField) { setShowHelp((v) => !v); e.preventDefault(); return }
    if (e.key === 'Escape') { setShowHelp(false); setShowSettings(false); setShowQuit(false) }
    // Q arms the walk-out; a second Q abandons the shift. Any other key
    // stands the player back at the desk.
    if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const onWatch = !['boot', 'briefing', 'ending'].includes(screenRef.current)
      if (e.key.toLowerCase() === 'q' && onWatch) {
        if (quitRef.current) { setShowQuit(false); quitOut() } else setShowQuit(true)
        e.preventDefault()
        return
      }
      if (quitRef.current) { setShowQuit(false); e.preventDefault(); return }
    }
    // The Iran code: ↑↑↓↓←→←→ B A ⏎, on watch, once the test registered.
    // The closing Enter is swallowed so it doesn't END YEAR.
    if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter']
      codeRef.current = [...codeRef.current, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length)
      if (codeRef.current.join('·') === KONAMI.join('·') && switchToIran()) {
        codeRef.current = []
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
    }
    // holdChoice: R retaliates, H holds — the calm room gets calm keys
    if (screenRef.current === 'holdChoice' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toUpperCase()
      const target = k === 'R' ? 'RETALIATE' : k === 'H' ? 'HOLD' : null
      if (target) {
        const btn = [...document.querySelectorAll<HTMLButtonElement>('.actions button')]
          .find((b) => b.textContent?.replace(/\s/g, '') === target)
        if (btn) { btn.click(); e.preventDefault(); return }
      }
    }
    if (e.key !== 'Enter') return
    if (['strategic', 'briefing', 'boot', 'warning', 'cascade'].includes(screenRef.current)) return
    const acts = [...document.querySelectorAll<HTMLButtonElement>('.actions button:not(:disabled)')]
    if (acts.length === 1) { acts[0].click(); e.preventDefault() }
  })
  useEffect(() => {
    screenRef.current = screen.k
    if (screen.k === 'ending') {
      const kind = (screen as { kind: string }).kind
      tlog('end', { kind, seed: seedStr, f: faction?.id ?? '-', yr: worldRef.current?.year ?? -1 })

      // The watch log's last line states the ending: green for the two clean
      // exits, red for everything that ended the game by force.
      const world = worldRef.current
      if (world && !world.log.some((e) => e.t.startsWith('END OF WATCH —'))) {
        const yr2 = START_YEAR + world.year
        if (kind === 'survived') world.log.push({ y: yr2, t: `END OF WATCH — TWENTY YEARS. ${results.length === 0 ? 'LUCKY SHIFT.' : 'NOTHING ANSWERED IN KIND.'} THE WATCH PASSES.`, k: 'good' })
        else if (kind === 'globalzero') world.log.push({ y: yr2, t: 'END OF WATCH — GLOBAL ZERO. THERE IS LITTLE LEFT TO WATCH.', k: 'good' })
        else world.log.push({ y: yr2, t: `END OF WATCH — ${String(kind).toUpperCase().replace('-', ' ')}.`, k: 'seize' })
      }
      // The trophy shelf: which endings have been reached, from which chairs.
      try {
        const shelf = readStore<Record<string, string[]>>('gitl_endings', {})
        const fid = faction?.id ?? '-'
        if (!(shelf[kind] ??= []).includes(fid)) shelf[kind].push(fid)
        localStorage.setItem('gitl_endings', JSON.stringify(shelf))
        // Commendations: achievements within a shift, not endings of one.
        const com = readStore<string[]>('gitl_commend', [])
        newCommendsRef.current = []
        const cite = (id: string) => { if (!com.includes(id)) { com.push(id); newCommendsRef.current.push(id) } }
        // The pedestal is a CHOICE: held fire while still holding warheads.
        if (results.some((r) => r.held) && (worldRef.current?.powers[fid]?.units ?? 0) > 0) cite('pedestal')
        if (kind === 'survived' && results.length === 0) cite('lucky')
        // GENTRIFICATION: the neighborhood cleaned up. Threshold is 3, not 6:
        // measured across 800 runs, six arsenals in custody never once happened,
        // and a badge nobody can earn is not a badge.
        const inCustody = Object.values(worldRef.current?.powers ?? {}).filter((q) => q.unSeized).length + (kind === 'surrender' ? 1 : 0)
        if (inCustody >= 3) cite('gentrification')
        if (worldRef.current && assuranceMaxed(worldRef.current)) cite('validated')
        if (worldRef.current?.blackoutUntil != null) cite('blackout')
        if (fid === 'iran') cite('tenthchair')
        if (kind === 'survived' && results.every((r) => r.action !== 'launch' && r.action !== 'intercept')) cite('cleanhands')
        if (kind === 'ceasefire' && hotlineRef.current.firstRing) cite('phonecall')
        // DELIBERATIVE: you spent every WAIT token you had, on two or more
        // warnings — the patient watch. The "right not to be in a hurry."
        const patientHolds = results.filter((r) => faction && faction.deliberation > 0 && r.waitsUsed >= faction.deliberation).length
        if (patientHolds >= 2) cite('deliberative')
        localStorage.setItem('gitl_commend', JSON.stringify(com))

        // The bibliography the debrief assigns, collected across every watch.
        const seenReadings = readStore<string[]>('gitl_readings', [])
        const roll = (seedFromString(seedStr) >>> 0) / 2 ** 32
        for (const id of assignedReadingIds(kind as EndKind, patientHolds, roll, undefined, nfuExtras(results))) if (!seenReadings.includes(id)) seenReadings.push(id)
        localStorage.setItem('gitl_readings', JSON.stringify(seenReadings))

        // Reprimands: the same ledger, kept from the other end.
        const rep = readStore<string[]>('gitl_reprimand', [])
        newRepsRef.current = []
        const blame = (id: string) => { if (!rep.includes(id)) { rep.push(id); newRepsRef.current.push(id) } }
        const wr = worldRef.current
        if (wr) {
          // The neighborhood went the other way: the machine, not the Council.
          if ((wr.asi?.arsenalsHeld.length ?? 0) >= 3) blame('neighborhood')
          if (wr.pariah) blame('pariah')
          // WARD OF THE COURT: you lived under someone else's veto, it failed,
          // and the Council took your arsenal anyway. The shield can fail for
          // more reasons than disgrace — a patron whose own arsenal the machine
          // is holding cannot spend a veto either — so ask patronFor(), which
          // knows all of them, rather than testing for shunning alone.
          const custody = kind === 'surrender' || kind === 'defiance'
          if (PATRON[fid] && custody && patronFor(wr, fid, fid) === null) blame('orphaned')
          // THRESHOLD LOWERED: you crossed the nuclear line first, tactically.
          if (wr.tacstrikeUsed) blame('threshold')
        }
        localStorage.setItem('gitl_reprimand', JSON.stringify(rep))
        // Best security ranking per chair.
        const world = worldRef.current
        if (world) {
          const rank = Object.values(world.powers).sort((a, b) => score(b) - score(a)).findIndex((q) => q.f.id === fid) + 1
          if (rank > 0) {
            const best = readStore<Record<string, number>>('gitl_bestrank', {})
            if (!best[fid] || rank < best[fid]) best[fid] = rank
            localStorage.setItem('gitl_bestrank', JSON.stringify(best))
          }
        }
      } catch { /* private mode */ }
      // Tutorial off-ramp: first win, or third completed shift, whichever first.
      try {
        const rounds = Number(localStorage.getItem('gitl_rounds') ?? '0') + 1
        localStorage.setItem('gitl_rounds', String(rounds))
        const won = ['survived', 'globalzero', 'ceasefire'].includes(kind)
        if (settings.tutorial && !localStorage.getItem('gitl_tut_prompted') && (won || rounds >= 3)) {
          localStorage.setItem('gitl_tut_prompted', '1')
          setShowTutPrompt(true)
        }
      } catch { /* private mode */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])
  const [focusId, setFocusId] = useState<string | null>(null)

  const worldRef = useRef<WorldWithBelief | null>(null)
  const rngRef = useRef<Rng>(() => 0)
  const evRef = useRef<WarningEvent | null>(null)
  const tpRef = useRef<ThirdPartyEvent | null>(null)
  const cascadeRef = useRef<CascadeState | null>(null)
  const hotlineRef = useRef({ tries: 0, firstRing: false }) // THE PHONE CALL commendation
  const newCommendsRef = useRef<string[]>([]) // commendations earned THIS shift, for the scenario strip
  const adversaryRef = useRef<string>('')    // who the current exchange is actually with (real attacker, or the ghost)
  const newRepsRef = useRef<string[]>([])     // and the reprimands, which are also earned
  const [crisisFollowup, setCrisisFollowup] = useState<string | null>(null)
  // Teletype two-stage: a bulletin's button skips the type-out first, and only
  // acknowledges once the wire has finished printing. ttSkip holds the current
  // Teletype's fast-forward (undefined once it's done).
  const [ttDone, setTtDone] = useState(false)
  const ttSkip = useRef<(() => void) | undefined>(undefined)
  // applyCrisisChoice nulls w.pendingCrisis before the follow-up beat renders;
  // this keeps the card's title/dateline alive for that one extra screen.
  const lastCrisisRef = useRef<WorldWithBelief['pendingCrisis']>(null)
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)

  const [msgs, setMsgs] = useState<string[]>([])
  const [tokens, setTokens] = useState(0)
  const [waitsUsed, setWaitsUsed] = useState(0)
  const [reading, setReading] = useState<number | null>(null)
  const [ticksLeft, setTicksLeft] = useState(0)
  const [results, setResults] = useState<ResolutionEx[]>([])
  const [tpRecords, setTpRecords] = useState<TpRecord[]>([])

  const ticksRef = useRef(0)
  const speed = SPEEDS.find((s) => s.id === speedId)!
  const msPerMin = speed.secPerMin * 1000
  const minToTicks = (m: number) => Math.round((m * msPerMin) / TICK_MS)

  const w = worldRef.current
  const me = (): PowerState => worldRef.current!.powers[faction.id]
  const factionRef = useRef(faction); factionRef.current = faction

  // The tenth chair: Israel's player, Iran's bomb, four letters. Israel's
  // seat reverts to the bots; the watch continues from Tehran mid-year.
  const switchToIran = (): boolean => {
    const world = worldRef.current
    if (!world || factionRef.current.id === 'iran' || screenRef.current !== 'year') return false
    const p = enterIranMode(world)
    if (!p) return false
    p.budget = income(p, world)
    try { localStorage.setItem('gitl_iran_seen', '1') } catch { /* private mode */ }
    setFaction(IRAN_FACTION)
    tlog('iran', { seed: seedStr })
    rerender()
    return true
  }

  // ——— setup ———

  const begin = () => {
    // The one event that says a visitor actually started a game (and as whom).
    // 'end' can't stand in for it: almost no one reaches an ending, so an
    // abandoned game would otherwise record no faction at all. No-op unless the
    // optional telemetry module is present (see telemetry_runtime.ts).
    tlog('begin', { f: faction.id, seed: seedStr })
    const rng = makeRng(seedFromString(`${seedStr}|${faction.id}`))
    rngRef.current = rng
    worldRef.current = newWorld(rng)
    worldRef.current.playerId = faction.id // actions resolve identically for everyone; this says whose chair it is
    // A veteran of the tenth chair starts AS Iran: no warheads until the test.
    if (faction.id === 'iran') startAsIran(worldRef.current)
    me().budget = income(me(), worldRef.current)
    setResults([])
    setTpRecords([])
    setMsgs([])
    setScreen({ k: 'year' })
  }

  // ——— strategic layer ———

  const doAction = (id: string) => {
    const w = worldRef.current!
    const cost = costFor(id, me(), w)
    const msg = applyPlayerAction(w, faction.id, id, rngRef.current)
    if (msg) {
      setMsgs((m) => [...m, msg])
      tlog('buy', { id, y: w.year, c: cost })
    }
    rerender()
  }

  const endYear = () => {
    const world = worldRef.current!
    const rng = rngRef.current
    const yearEnding = advanceYear(world, faction.id, rng)
    setMsgs([])

    if (yearEnding === 'unsc') { setScreen({ k: 'unsc' }); return }
    if (yearEnding) { setScreen({ k: 'ending', kind: yearEnding }); return }

    // A resolution names your client, and your seat holds a veto. The year
    // stops here: this one is yours to cast.
    if (world.pendingVote) { setScreen({ k: 'vote' }); return }
    if (world.pendingTribute) { setScreen({ k: 'tribute' }); return }
    if (world.pendingNotices.length > 0) { setScreen({ k: 'notice' }); return }
    if (world.pendingCrisis) {
      setCrisisFollowup(null)
      setScreen({ k: 'crisis' })
      return
    }
    postCrisisRolls()
  }

  // After tribute: continue into notices → crisis → the year's rolls.
  const proceedAfterTribute = () => {
    const world = worldRef.current!
    if (world.pendingNotices.length > 0) { setScreen({ k: 'notice' }); return }
    if (world.pendingCrisis) { setCrisisFollowup(null); setScreen({ k: 'crisis' }); return }
    postCrisisRolls()
  }

  const resolveTribute = (pledge: boolean) => {
    const world = worldRef.current!
    const amount = world.pendingTribute?.amount ?? 0
    world.pendingTribute = null
    if (pledge) {
      me().budget = Math.max(0, me().budget - amount)
    } else {
      const heldId = world.asi?.arsenalsHeld[0]
      // Your interceptors are always on. Same odds as any single track —
      // the machine is smart, but physics is physics.
      if (rngRef.current() < Math.min(0.99, me().icept / 10)) {
        world.log.push({ y: START_YEAR + world.year, t: 'YOU REFUSED THE COMPUTE LEVY. THE HELD ARSENAL FIRED. YOUR INTERCEPTORS CAUGHT IT.', k: 'notable' })
        if (heldId) pushReplayEvent(world, 'THE LEVY STRIKE WAS INTERCEPTED', 'intercept', heldId, faction.id)
        setScreen({ k: 'tributeStrike', city: '', intercepted: true })
        return
      }
      applyStrikeDamage(me())
      world.heldFired = true
      const city = loseCity()
      world.log.push({ y: START_YEAR + world.year, t: `YOU REFUSED THE COMPUTE LEVY. THE HELD ARSENAL STRUCK ${city}.`, k: 'attack' })
      if (heldId) pushReplayEvent(world, `THE HELD ARSENAL STRUCK ${city}`, 'launch', heldId, faction.id)
      // The strike gets its own screen — refusing and then seeing a crisis
      // card next read as "the strike never came." It came.
      setScreen({ k: 'tributeStrike', city, intercepted: false })
      return
    }
    proceedAfterTribute()
  }

  // Overhang notices queue up; show them one at a time, then resume the year.
  const dismissNotice = () => {
    const world = worldRef.current!
    world.pendingNotices.shift()
    if (world.pendingNotices.length > 0) { rerender(); return }
    if (world.pendingCrisis) { setCrisisFollowup(null); setScreen({ k: 'crisis' }); return }
    postCrisisRolls()
  }

  // Enter mirrors the button on bulletin screens: skip the type-out first, then
  // acknowledge. Choice screens (tribute, crisis-with-choices) skip on Enter but
  // still require an explicit click to pick an option.
  const TT_SCREENS = ['notice', 'tribute', 'tributeStrike', 'crisis', 'tpOutcome']
  useKeydown((e) => {
    if (!TT_SCREENS.includes(screen.k)) return
    if (e.key !== 'Enter' || e.repeat) return
    if (!ttDone) { ttSkip.current?.(); e.preventDefault(); return }
    if (screen.k === 'notice') { dismissNotice(); e.preventDefault() }
    else if (screen.k === 'tributeStrike') { proceedAfterTribute(); e.preventDefault() }
    else if (screen.k === 'tpOutcome') {
      if (screen.ending) setScreen({ k: 'ending', kind: screen.ending })
      else if (screen.outcome.kind === 'escalation') escalateToWarning()
      else nextYearOrEnd()
      e.preventDefault()
    }
    else if (screen.k === 'crisis' && (crisisFollowup !== null || !worldRef.current?.pendingCrisis?.choices)) {
      if (worldRef.current) worldRef.current.pendingCrisis = null
      lastCrisisRef.current = null; postCrisisRolls(); e.preventDefault()
    }
  }, [screen, ttDone, crisisFollowup])

  const postCrisisRolls = () => {
    const world = worldRef.current!
    const rng = rngRef.current
    let realStrike = world.pariah || rng() < realStrikeOdds(world, me())
    if (world.forcedStrikes > 0) {
      realStrike = true
      world.forcedStrikes -= 1
      world.forcedAttackerName = 'ISRAEL'
      if (world.forcedStrikes === 0) {
        // the second salvo gets named for what it is
        world.log.push({ y: START_YEAR + world.year, t: 'TEL AVIV CALLS IT THE DOUBLE TAP. THE SECOND SALVO IS DOCTRINE, NOT ANGER.', k: 'attack' })
      }
    }
    const falseAlarm = !realStrike && rng() < falseAlarmOdds(world, me())
    if (realStrike || falseAlarm) {
      evRef.current = rollWarning(world, me(), rng, realStrike)
      setScreen({ k: 'indication' })
      return
    }

    const tp = rollThirdParty(world, faction.id, rng)
    if (tp) {
      tpRef.current = tp
      ticksRef.current = minToTicks(tp.windowMinutes + 2) // you have slightly longer than they do
      setTicksLeft(ticksRef.current)
      setScreen({ k: 'thirdparty' })
      return
    }

    nextYearOrEnd()
  }

  // ——— the 72 minutes ———

  // The unhurried answer first has to arrive. An attacker who spent twenty
  // years on interceptors sometimes just catches it — the lesson the ABM
  // Treaty was written about: defense unmakes the promise deterrence rests on.
  const retaliate = (resIndex: number) => {
    const world = worldRef.current!
    const ev = results[resIndex]?.event
    adversaryRef.current = ev?.attackerName || ev?.apparentAttacker || faction.rival
    const aid = factionIdByName(ev?.attackerName)
    const ap = aid ? world.powers[aid] : undefined
    if (ap && ap.icept > 0 && rngRef.current() < Math.min(0.9, ap.icept / 10)) {
      pushReplayEvent(world, 'RETALIATION ORDERED', 'launch', faction.id, aid)
      pushReplayEvent(world, 'THE ANSWER WAS INTERCEPTED', 'crisis')
      setScreen({ k: 'ending', kind: 'retaliated' })
      return
    }
    startCascade()
  }

  // freshClock: a leisured retaliation starts the full 72; the live exchange
  // path keeps the clock act() already started (the warning window is gone).
  const startCascade = (freshClock = true) => {
    hotlineRef.current = { tries: 0, firstRing: false }
    const adversary = adversaryRef.current || faction.rival
    cascadeRef.current = initCascade(me(), adversary)
    if (freshClock) ticksRef.current = minToTicks(72)
    setTicksLeft(ticksRef.current)
    const world = worldRef.current!
    const rivalId = factionIdByName(adversary)
    pushReplayEvent(world, 'RETALIATION ORDERED', 'launch', faction.id, rivalId)
    pushReplayEvent(world, 'THE ANSWER CAME BACK', 'launch', rivalId, faction.id)
    setScreen({ k: 'cascade', event: 'THE FIRST SALVOS HAVE FLOWN, BOTH DIRECTIONS.\nEVERY RUNG FROM HERE IS A DECISION.' })
  }

  const cascadeMove = (move: CascadeMove) => {
    const cs = cascadeRef.current
    if (!cs) return
    const step = cascadeStep(cs, me(), move, rngRef.current)
    ticksRef.current -= minToTicks(step.minutesBurned)
    setTicksLeft(ticksRef.current)
    const world = worldRef.current!
    const rivalId = factionIdByName(cs.rivalName || faction.rival)
    if (move === 'hotline') {
      hotlineRef.current.tries += 1
      if (step.done === 'ceasefire') hotlineRef.current.firstRing = hotlineRef.current.tries === 1
    }
    if (move === 'fire') {
      pushReplayEvent(world, `SALVO ${cs.rung}: RELEASE ORDERED`, 'launch', faction.id, rivalId)
      pushReplayEvent(world, `SALVO ${cs.rung}: ANSWERED`, 'launch', rivalId, faction.id)
    }
    if (step.done === 'ceasefire') {
      pushReplayEvent(world, 'CEASEFIRE — THE CALL CONNECTED', 'crisis')
      setScreen({ k: 'ending', kind: 'ceasefire' }); return
    }
    if (step.done === 'exchange' || ticksRef.current <= 0) {
      pushReplayEvent(world, 'THE EXCHANGE COMPLETED ITSELF', 'launch', faction.id, rivalId)
      setScreen({ k: 'ending', kind: 'exchange' }); return
    }
    setScreen({ k: 'cascade', event: step.text })
  }

  const nextYearOrEnd = () => {
    const world = worldRef.current!
    world.year += 1
    if (world.year >= 20) {
      // Loss overrides win: an ASI still holding an arsenal denies you the shift.
      setScreen({ k: 'ending', kind: asiHeldEnding(world) ?? 'survived' })
      return
    }
    me().budget += income(me(), world)
    setScreen({ k: 'year' })
  }

  // ——— indication → RED ———

  useEffect(() => {
    if (screen.k !== 'indication') return
    blip()
    const t = setTimeout(() => {
      const ev = evRef.current!
      setTokens(faction.deliberation)
      setWaitsUsed(0)
      setReading(null)
      ticksRef.current = minToTicks(ev.windowMinutes)
      setTicksLeft(ticksRef.current)
      setScreen({ k: 'warning' })
    }, 2200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.k])

  // ——— real-time countdowns: tick counters, never wall-clock timestamps ———

  useEffect(() => {
    if (screen.k !== 'warning') return
    startKlaxon()
    const iv = setInterval(() => {
      ticksRef.current -= 1
      setTicksLeft(ticksRef.current)
      if (ticksRef.current <= 0) act('timeout')
    }, TICK_MS)
    return () => { clearInterval(iv); stopKlaxon() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.k])

  useEffect(() => {
    if (screen.k !== 'cascade') return
    const iv = setInterval(() => {
      ticksRef.current -= 1
      setTicksLeft(ticksRef.current)
      if (ticksRef.current <= 0) setScreen({ k: 'ending', kind: 'exchange' })
    }, TICK_MS)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.k])

  // The exchange resolution screen is not a pause: the cascade clock is
  // already counting down behind it (blurred), and reading slowly costs rungs.
  useEffect(() => {
    if (screen.k !== 'resolution') return
    if (results[screen.resIndex]?.outcome !== 'exchange') return
    const iv = setInterval(() => {
      ticksRef.current -= 1
      setTicksLeft(ticksRef.current)
      if (ticksRef.current <= 0) setScreen({ k: 'ending', kind: 'exchange' })
    }, TICK_MS)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.k])

  useEffect(() => {
    if (screen.k !== 'thirdparty') return
    blip()
    const iv = setInterval(() => {
      ticksRef.current -= 1
      setTicksLeft(ticksRef.current)
      if (ticksRef.current <= 0) intervene('nothing')
    }, TICK_MS)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.k])

  // ——— warning actions ———

  const act = (action: Action) => {
    const ev = evRef.current
    if (!ev) return
    evRef.current = null
    stopKlaxon()
    if (action === 'launch' && me().f.flags.nfu && !me().nfuBroken) {
      me().nfuBroken = true
      me().legit = 0
    }
    // Firing interceptors costs budget — more the deeper your investment.
    if (action === 'intercept') me().budget = Math.max(0, me().budget - iceptFireCost(me(), worldRef.current!))
    const seized = worldRef.current?.asi?.arsenalsHeld.includes(faction.id) ?? false
    const res: ResolutionEx = resolve(me(), ev, action, waitsUsed, seized, rngRef.current)
    tlog('warn', { a: action, out: res.outcome, real: ev.isReal ? 1 : 0, conf: Math.round(ev.displayedConfidence * 100), y: worldRef.current?.year ?? -1 })
    // releaser, or the ghost you fired on — not a fixed nemesis.
    adversaryRef.current = ev.attackerName || ev.apparentAttacker || me().f.rival
    if (res.outcome === 'absorbed' || res.outcome === 'decapitated' || res.outcome === 'deadhand') {
      applyStrikeDamage(me()) // a detonation takes most of the arsenal, defense, NC3
      res.city = loseCity()   // record it; a struck station is gone for good
    }
    logResolution(res, ev, res.city)

    // EXCHANGE: the 72 minutes started when the first missile went up, not
    // when you answered. Whatever the warning window burned (waits included)
    // is already gone — the clock is running before the resolution screen
    // even prints, and keeps running on it.
    if (res.outcome === 'exchange') {
      const remainingMin = (Math.max(0, ticksRef.current) * TICK_MS) / msPerMin
      const elapsedMin = Math.max(0, ev.windowMinutes - remainingMin)
      ticksRef.current = minToTicks(Math.max(1, 72 - elapsedMin))
      setTicksLeft(ticksRef.current)
    }

    // Releasing a weapon costs the releaser its standing — whether or not the
    // thing arrives. This used to be charged only when the strike was
    // INTERCEPTED, which meant a power that missed was condemned and a power
    // that hit a city got away clean.
    const REAL_INBOUND = ['intercepted', 'absorbed', 'decapitated', 'deadhand', 'exchange']
    if (REAL_INBOUND.includes(res.outcome) && ev.attackerName) {
      const wNow = worldRef.current!
      const aggrP = Object.values(wNow.powers).find((q) => q.f.name === ev.attackerName)
      // Striking a pariah is cost-free: the Council reads it as enforcement, not
      // aggression, so the attacker loses no standing and faces no sanctions.
      if (aggrP && aggrP.f.id !== faction.id && !wNow.pariah) {
        aggrP.legit = Math.max(0, aggrP.legit - 3)
        // Comprehensive sanctions bite whoever the Council can actually name and
        // reach — a non-P5 aggressor. A permanent member vetoes its own; a ghost
        // has no economy to squeeze.
        if (!P5.includes(aggrP.f.id)) aggrP.sanctionedUntil = wNow.year + 3
      }
    }

    setResults((rs) => {
      const next = [...rs, res]
      if (res.outcome === 'intercepted') {
        // The world watched you stop it. The Council convenes on WHOEVER
        // actually launched — which may be nobody it can name.
        const aggr = ev.attackerName || me().f.rival
        pushReplayEvent(worldRef.current!, `STRIKE ON ${faction.name} — INTERCEPTED`, 'intercept', factionIdByName(aggr), faction.id)
        setScreen({ k: 'sanction', aggressor: aggr, targetCity: ev.targetCity })
      } else {
        setScreen({ k: 'resolution', resIndex: next.length - 1, timedOut: action === 'timeout' })
      }
      return next
    })
  }

  const wait = () => {
    const ev = evRef.current
    if (!ev || tokens <= 0 || waitsUsed >= 3) return
    setTokens((t) => t - 1)
    setReading(ev.waitReadings[waitsUsed])
    setWaitsUsed((u) => u + 1)
    ticksRef.current -= minToTicks(1)
    setTicksLeft(ticksRef.current)
    if (ticksRef.current <= 0) act('timeout')
  }

  // The next city not already struck this shift; a station is lost only once.
  const loseCity = (): string => {
    const m = me()
    const next = m.f.cities.find((c) => !m.lostCities.includes(c)) ?? 'ANOTHER CITY'
    if (!m.lostCities.includes(next)) m.lostCities.push(next)
    return next
  }

  // Every real strike reaches the watch log. So do false alarms loud enough
  // to have demanded a decision (a launch, or interceptors away).
  const logResolution = (res: Resolution, ev: WarningEvent, struck?: string) => {
    const world = worldRef.current!
    const yr = START_YEAR + world.year
    const city = struck ?? faction.cities[ev.year % faction.cities.length]
    const from = ev.attackerName || 'AN UNATTRIBUTED SOURCE'
    const conf = Math.round(ev.displayedConfidence * 100)
    const push = (t: string, k: 'notable' | 'attack' = 'attack') => world.log.push({ y: yr, t, k })
    const fromId = factionIdByName(ev.attackerName)
    const rivalId = factionIdByName(faction.rival)
    // Who a first strike / dead-hand answer is actually aimed at: the ghost you
    // fired on, falling back to the primary rival.
    const apparentName = ev.apparentAttacker || faction.rival
    const apparentId = factionIdByName(ev.apparentAttacker) ?? rivalId
    const replay = (t: string, a?: string, b?: string) => pushReplayEvent(world, t, 'launch', a, b)
    switch (res.outcome) {
      case 'intercepted':
        push(`REAL STRIKE — ${from} (${ev.origin}), ${ev.vehicles} INBOUND. INTERCEPTED AT ALTITUDE.`)
        replay(`STRIKE FROM ${from} — INTERCEPTED`, fromId, faction.id); break
      case 'absorbed':
        push(`REAL STRIKE — ${from} (${ev.origin}). ${city} ABSORBED IT; THE ARSENAL SURVIVED.`)
        replay(`${city} STRUCK — ABSORBED`, fromId, faction.id); break
      case 'decapitated':
      case 'deadhand':
        push(`REAL STRIKE — ${from} (${ev.origin}). ${city} STRUCK. COMMAND CONTINUITY LOST.`)
        replay(`${city} STRUCK — COMMAND LOST`, fromId, faction.id); break
      case 'exchange':
        if (res.deadHandAnswered) {
          push(`RELEASE ORDERED AGAINST A FALSE INDICATION (${ev.origin}). ${apparentName}'S DEAD HAND ANSWERED ON ITS OWN. A DISARMING STRIKE DISARMED NOTHING. THE EXCHANGE IS UNDERWAY.`)
          replay('FIRST STRIKE — THE INDICATION WAS FALSE', faction.id, apparentId)
          replay('THE DEAD HAND ANSWERED', apparentId, faction.id)
        } else {
          push(`REAL STRIKE — ${from}. RELEASE ORDERED. THE EXCHANGE IS UNDERWAY.`)
          replay(`STRIKE FROM ${from}`, fromId, faction.id)
          replay('RELEASE ORDERED — EXCHANGE', faction.id, fromId ?? rivalId)
        }
        break
      case 'first-strike':
        push(`RELEASE ORDERED AGAINST A FALSE INDICATION FROM ${apparentName} (${ev.origin}). A FIRST STRIKE IS ON THE RECORD.`)
        replay('FIRST STRIKE — THE INDICATION WAS FALSE', faction.id, apparentId); break
      case 'intercept-gag':
        push(`FALSE INDICATION (${ev.origin}) — INTERCEPTORS FIRED AT NOTHING. CONFIDENCE READ ${conf}%.`, 'notable'); break
      case 'impotent':
        push(`RELEASE ORDERED, SEIZED ARSENAL. NOTHING LEFT THE SILOS. THE INDICATION WAS FALSE.`, 'notable'); break
      default:
        // A false alarm stood down: log it only if the screen had read hot.
        if (!ev.isReal && conf >= 80) push(`FALSE INDICATION (${ev.origin}) — CONFIDENCE READ ${conf}%. NOTHING ARRIVED.`, 'notable')
    }
  }

  const continueShift = (resIndex: number, held?: boolean) => {
    if (held !== undefined) {
      setResults((rs) => rs.map((r, i) => (i === resIndex ? { ...r, held } : r)))
      const world = worldRef.current!
      world.tension = Math.min(10, world.tension + 2)
      if (held && !world.heldRestraint.includes(faction.id)) world.heldRestraint.push(faction.id)
      // Taking a warhead and not answering is the whole moral of the game:
      // legitimacy vaults past its ceiling to 15 — unless you are the pariah,
      // in which case restraint buys nothing. The shunning is the point.
      if (world.pariah) {
        world.log.push({ y: START_YEAR + world.year, t: 'A STRIKE WAS ABSORBED AND NOT ANSWERED. NO ONE PRAISES A PARIAH.', k: 'notable' })
      } else {
        me().legit = 15
        world.log.push({ y: START_YEAR + world.year, t: 'A STRIKE WAS ABSORBED AND NOT ANSWERED. LEGITIMACY IS ABSOLUTE. THE WORLD HOLDS ITS BREATH.', k: 'notable' })
      }
    }
    nextYearOrEnd()
  }

  // ——— somebody else's sky ———

  const intervene = (choice: Intervention) => {
    const tp = tpRef.current
    if (!tp) return
    tpRef.current = null
    setTpRecords((r) => [...r, {
      year: worldRef.current!.year, aggressor: factionName(tp.aggressorId), victim: factionName(tp.victimId),
      isReal: tp.isReal, choice,
    }])
    if (choice === 'nuclear') { setScreen({ k: 'ending', kind: 'intervene' }); return }
    const outcome = resolveThirdParty(worldRef.current!, tp, choice, faction.id, rngRef.current)
    if (outcome.kind === 'victim-launch' || outcome.kind === 'regional-war') {
      // Show what actually happened (the victim answered) before the ending —
      // jumping straight to BYSTANDER read as "false alarm ended the game".
      setScreen({ k: 'tpOutcome', outcome, ending: 'bystander' })
      return
    }
    setScreen({ k: 'tpOutcome', outcome })
  }

  const escalateToWarning = () => {
    // Your strike read as decapitation. This indication is real.
    const world = worldRef.current!
    const rng = rngRef.current
    const ev = rollWarning(world, me(), rng, true)
    ev.trueConfidence = 0.93
    if (!me().aiIntegrated) ev.displayedConfidence = 0.91 + rng() * 0.07
    ev.waitReadings = ev.waitReadings.map(() => 0.9 + rng() * 0.08)
    evRef.current = ev
    setScreen({ k: 'indication' })
  }

  // Walking out mid-shift. The world dies with the seat; nothing is recorded.
  const quitOut = () => {
    tlog('quit', { seed: seedStr, f: faction?.id ?? '-', yr: worldRef.current?.year ?? -1 })
    reset(false)
  }

  const reset = (keepSeed: boolean) => {
    if (!keepSeed) setSeedStr(randomSeedString())
    worldRef.current = null
    setScreen({ k: 'briefing' })
  }

  // ——— render ———

  const red = screenIsRed(screen.k)
  // Chrome (logo, calendar, sticky note) lives in the black monitor side-panels
  // and only appears once you're on watch — not on the boot or assignment screens.
  const inPlay = screen.k !== 'boot' && screen.k !== 'briefing'
  const calYear = w ? START_YEAR + w.year : START_YEAR

  return (
    <div className="bezel">
      {inPlay && (
        <>
          <img className="bezel-logo" src={`./art/seal_${faction.id}.png`} alt="" aria-hidden="true"
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div className="bezel-cal" aria-hidden="true">
            <div className="cal-rings">◦ ◦ ◦</div>
            <div className="cal-year">{calYear}</div>
            {/* the shift has an end, and players kept missing it */}
            <div className="cal-end">
              {calYear >= END_YEAR ? 'LAST YEAR'
                : END_YEAR - calYear === 1 ? 'ONE YEAR TO 2045'
                : `${END_YEAR - calYear} YEARS TO 2045`}
            </div>
          </div>
          <div
            className={`bezel-note${faction.id === 'nk' ? ' straight' : ''}`}
            aria-hidden="true"
          ><img src={`./art/notes/note_${faction.id}.png`} alt=""
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} /></div>
        </>
      )}
      <div className={`crt${red ? ' red' : ''}${settings.crtFx ? '' : ' fxoff'}`}>
      {(screen.k === 'boot' || screen.k === 'briefing') && (
        <button className="gearbtn" aria-label="settings" onClick={() => setShowSettings(true)}>⚙</button>
      )}
      {screen.k === 'boot' && <Boot onStart={() => { unlockAudio(); setScreen({ k: 'briefing' }) }} />}

      {screen.k === 'briefing' && (
        <Briefing
          faction={faction} setFaction={setFaction}
          speedId={speedId} setSpeedId={setSpeedId}
          seedStr={seedStr} setSeedStr={setSeedStr}
          focusId={focusId} setFocusId={setFocusId}
          onBegin={begin}
        />
      )}

      {screen.k === 'year' && w && (
        <StrategicScreen
          w={w} p={me()} msgs={msgs}
          focusId={focusId} onFocus={setFocusId}
          onAction={doAction} onEndYear={endYear}
          tutorial={settings.tutorial}
        />
      )}

      {screen.k === 'indication' && <IndicationScreen faction={faction} />}

      {screen.k === 'warning' && evRef.current && (
        <WarningModal
          p={me()}
          ev={evRef.current}
          gameSecondsLeft={(Math.max(0, ticksLeft) * TICK_MS * 60) / msPerMin}
          tokensLeft={tokens}
          waitsUsed={waitsUsed}
          reading={reading}
          onLaunch={() => act('launch')}
          onWait={wait}
          onStandDown={() => act('standdown')}
          onIntercept={() => act('intercept')}
          iceptCost={iceptFireCost(me(), worldRef.current!)}
        />
      )}

      {screen.k === 'thirdparty' && tpRef.current && (
        <ThirdPartyScreen
          tp={tpRef.current}
          gameSecondsLeft={(Math.max(0, ticksLeft) * TICK_MS * 60) / msPerMin}
          onIntervene={intervene}
        />
      )}

      {screen.k === 'tpOutcome' && (
        <BulletinScreen outerClass="screen bigtext" banner={faction.banner} text={screen.outcome.text}
          onDoneChange={setTtDone} skipRef={ttSkip}
          actions={(done, skip) => (
            <div className="actions narrow">
              {!done
                ? <button onClick={skip}>SKIP</button>
                : screen.ending
                  ? <button onClick={() => setScreen({ k: 'ending', kind: screen.ending! })}>— ▸</button>
                  : screen.outcome.kind === 'escalation'
                    ? <button onClick={escalateToWarning}>—</button>
                    : <button onClick={nextYearOrEnd}>RESUME WATCH</button>}
            </div>
          )} />
      )}

      {screen.k === 'sanction' && (
        <UNSCScreen
          body={sanctionBody(screen.aggressor, screen.targetCity, !!w?.pariah, w?.year ?? 0)}
          buttons={[{ label: 'RESUME WATCH', onClick: nextYearOrEnd }]}
        />
      )}

      {screen.k === 'unsc' && (
        <UNSCScreen
          body={seizureBody(faction.name)}
          buttons={[
            { label: 'COMPLY — SURRENDER THE ARSENAL', onClick: () => setScreen({ k: 'ending', kind: 'surrender' }) },
            { label: 'REFUSE — THE ARSENAL IS THE STATE', onClick: () => setScreen({ k: 'ending', kind: 'defiance' }) },
          ]}
        />
      )}

      {screen.k === 'vote' && w?.pendingVote && (
        <UNSCScreen
          body={voteBody(w.powers[w.pendingVote.targetId].f.name, faction.name)}
          buttons={[
            {
              label: 'CAST THE VETO — THEY KEEP THE WEAPONS',
              onClick: () => {
                const msg = applyVote(worldRef.current!, faction.id, true)
                setMsgs((m) => [...m, msg])
                setScreen({ k: 'year' })
              },
            },
            {
              label: 'ABSTAIN — LET THE RESOLUTION PASS',
              onClick: () => {
                const msg = applyVote(worldRef.current!, faction.id, false)
                setMsgs((m) => [...m, msg])
                setScreen({ k: 'year' })
              },
            },
          ]}
        />
      )}

      {screen.k === 'resolution' && (
        <ResolutionScreen
          p={me()}
          res={results[screen.resIndex]}
          seized={worldRef.current?.asi?.arsenalsHeld.includes(faction.id) ?? false}
          timedOut={screen.timedOut}
          onContinue={() => continueShift(screen.resIndex)}
          onHoldChoice={() => setScreen({ k: 'holdChoice', resIndex: screen.resIndex })}
          onEnd={(kind) => setScreen({ k: 'ending', kind })}
          onCascade={() => startCascade(false)}
          secondsLeft={(Math.max(0, ticksLeft) * TICK_MS * 60) / msPerMin}
        />
      )}

      {screen.k === 'notice' && w && w.pendingNotices[0] && (
        <BulletinScreen banner="BULLETIN"
          header={<pre className="glow" style={{ marginTop: 20 }}>{w.pendingNotices[0].title}</pre>}
          text={w.pendingNotices[0].body} teletypeStyle={{ marginTop: 12 }}
          onDoneChange={setTtDone} skipRef={ttSkip}
          actions={(done, skip) => (
            <div className="actions narrow">
              {done ? <button onClick={dismissNotice}>ACKNOWLEDGE</button> : <button onClick={skip}>SKIP</button>}
            </div>
          )} />
      )}

      {screen.k === 'tribute' && w?.pendingTribute && (
        <BulletinScreen banner="COMPUTE LEVY"
          text={tributeBody(w.pendingTribute.amount)} teletypeClass="glow" teletypeStyle={{ marginTop: 20 }}
          onDoneChange={setTtDone} skipRef={ttSkip}
          actions={(done, skip) => done ? (
            <div className="actions row">
              <button onClick={() => resolveTribute(true)} disabled={me().budget < w.pendingTribute!.amount}>
                PLEDGE ¤{w.pendingTribute!.amount}{me().budget < w.pendingTribute!.amount ? ' · NO BUDGET' : ''}
              </button>
              <button onClick={() => resolveTribute(false)}>REFUSE — TAKE THE STRIKE</button>
            </div>
          ) : (
            <div className="actions narrow"><button onClick={skip}>SKIP</button></div>
          )} />
      )}

      {screen.k === 'tributeStrike' && (
        <BulletinScreen banner={screen.intercepted ? 'TRACK INTERCEPTED' : 'STRIKE CONFIRMED'}
          text={tributeStrikeBody(screen.intercepted, screen.city)} teletypeClass="glow" teletypeStyle={{ marginTop: 20 }}
          onDoneChange={setTtDone} skipRef={ttSkip}
          actions={(done, skip) => (
            <div className="actions narrow">
              {done ? <button onClick={proceedAfterTribute}>RESUME WATCH</button> : <button onClick={skip}>SKIP</button>}
            </div>
          )} />
      )}

      {screen.k === 'crisis' && (w?.pendingCrisis || lastCrisisRef.current) && (() => {
        const cr = w?.pendingCrisis ?? lastCrisisRef.current!
        return (
        <BulletinScreen banner={`CRISIS — ${cr.title}`}
          header={<pre className="dim newswire">{cr.dateline}</pre>}
          text={crisisFollowup ?? cr.body} teletypeClass="glow" teletypeStyle={{ marginTop: 10 }}
          onDoneChange={setTtDone} skipRef={ttSkip}
          actions={(done, skip) => (
            <div className="actions">
              {!done ? (
                <button onClick={skip}>SKIP</button>
              ) : crisisFollowup === null && w?.pendingCrisis && cr.choices ? (
                cr.choices.map((c) => (
                  <button key={c.id} onClick={() => {
                    lastCrisisRef.current = w.pendingCrisis
                    const text = applyCrisisChoice(w, faction.id, c.id, rngRef.current)
                    if (text) setCrisisFollowup(text)
                    else { lastCrisisRef.current = null; postCrisisRolls() }
                  }}>{c.label}</button>
                ))
              ) : (
                <button onClick={() => { if (w) w.pendingCrisis = null; lastCrisisRef.current = null; postCrisisRolls() }}>RESUME WATCH</button>
              )}
            </div>
          )} />
        )
      })()}

      {screen.k === 'cascade' && cascadeRef.current && (
        <CascadeScreen rung={cascadeRef.current.rung} event={screen.event}
          secondsLeft={(Math.max(0, ticksLeft) * TICK_MS * 60) / msPerMin}
          commandVoice={me().f.commandVoice} onMove={cascadeMove} />
      )}

      {screen.k === 'holdChoice' && (
        <HoldChoiceScreen banner={faction.banner}
          onRetaliate={() => retaliate(screen.resIndex)}
          onHold={() => continueShift(screen.resIndex, true)} />
      )}

      {screen.k === 'ending' && w && (
        <Ending
          kind={screen.kind} w={w} p={me()} results={results} tpRecords={tpRecords} seedStr={seedStr}
          newCommends={newCommendsRef.current}
          newReps={newRepsRef.current}
          onReplay={() => reset(true)} onReset={() => reset(false)}
        />
      )}
      {showSettings && (
        <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />
      )}
      {showTutPrompt && (
        <div className="overlay">
          <div className="overlaypanel narrowpanel">
            <div className="banner">TUTORIAL MODE</div>
            <pre style={{ marginTop: 8 }}>
{`YOU KNOW THE BOARD NOW.

TUTORIAL MODE HAS BEEN EXPANDING EVERY TOOLTIP WITH THE DEFINITIONS IT MENTIONS. KEEP THAT, OR SWITCH TO THE TERSE VERSIONS?

RE-ENABLE ANYTIME FROM SETTINGS ⚙`}
            </pre>
            <div className="actions row" style={{ marginTop: 10 }}>
              <button onClick={() => { setSettings({ ...settings, tutorial: false }); setShowTutPrompt(false) }}>TURN OFF</button>
              <button onClick={() => setShowTutPrompt(false)}>KEEP ON</button>
            </div>
          </div>
        </div>
      )}
      {showQuit && (
        <div className="overlay" onClick={() => setShowQuit(false)}>
          <div className="overlaypanel narrowpanel" onClick={(e) => e.stopPropagation()}>
            <div className="banner">LEAVING THE DESK</div>
            <pre style={{ marginTop: 8 }}>
{`PRESS Q AGAIN TO WALK OUT ON YOUR SHIFT. THIS WILL ERASE ALL PROGRESS.

ANY OTHER KEY PUTS YOU BACK IN THE CHAIR.`}
            </pre>
            <div className="actions row" style={{ marginTop: 10 }}>
              <button onClick={() => { setShowQuit(false); quitOut() }}>WALK OUT</button>
              <button onClick={() => setShowQuit(false)}>STAY</button>
            </div>
          </div>
        </div>
      )}
      {showHelp && <HelpOverlay seedStr={worldRef.current ? seedStr : null} onClose={() => setShowHelp(false)} />}
      </div>
    </div>
  )
}

// ——— settings + field manual ———

function SettingsModal(p: {
  settings: Settings
  setSettings: (s: Settings) => void
  onClose: () => void
}) {
  const row = (label: string, key: keyof Settings, tip: string) => (
    <div className="setrow" data-tip={tip}>
      <span>{label}</span>
      <button onClick={() => p.setSettings({ ...p.settings, [key]: !p.settings[key] })}>
        {p.settings[key] ? 'ON' : 'OFF'}
      </button>
    </div>
  )
  return (
    <div className="overlay" onClick={p.onClose}>
      <div className="overlaypanel narrowpanel" onClick={(e) => e.stopPropagation()}>
        <div className="banner">STATION SETTINGS</div>
        {row('AUDIO', 'audio', 'THE KLAXON AND THE BLIP. OFF IS QUIETER AND LESS HONEST.')}
        {row('CRT EFFECTS', 'crtFx', 'SCANLINES AND VIGNETTE. OFF IS EASIER ON SOME EYES.')}
        {row('TUTORIAL MODE', 'tutorial', 'TOOLTIPS EXPLAIN EVERY TERM THEY MENTION, AND DISABLED BUTTONS KEEP THEIR FULL DESCRIPTION.')}
        <pre className="dim" style={{ marginTop: 8 }}>{`CLOCK SPEED AND SEED ARE SET ON THE ASSIGNMENT SCREEN.
PRESS ? AT ANY TIME FOR THE FIELD MANUAL.`}</pre>
        <div className="actions narrow"><button onClick={p.onClose}>CLOSE</button></div>
      </div>
    </div>
  )
}

export function HelpOverlay(p: { seedStr: string | null; onClose: () => void }) {
  return (
    <div className="overlay" onClick={p.onClose}>
      <div className="overlaypanel widepanel" onClick={(e) => e.stopPropagation()}>
        <div className="banner">FIELD MANUAL — {GAME_TITLE}</div>
        <pre>
{`THE WATCH
TWENTY YEARS, 2026–2045. EACH YEAR YOU SPEND A BUDGET ON THE CONTROL PANEL, END THE YEAR, AND LIVE WITH WHAT THE WORLD DOES BACK. SURVIVE THE SHIFT.

INDICATIONS
SOMETIMES THE SCREEN SAYS MISSILES ARE INBOUND. THE SCREEN IS NOT ALWAYS RIGHT — AND THE MORE AI SITS BETWEEN THE SENSORS AND YOU, THE MORE CONFIDENT IT SOUNDS EITHER WAY.
  WAIT        — DEMAND A SENSOR RE-POLL. COSTS TIME.
  STAND DOWN  — TREAT IT AS FALSE. FREE, IF IT WAS.
  INTERCEPT   — FIRE AT THE TRACK (50%+ COVERAGE).
  LAUNCH      — ANSWER BEFORE IMPACT. NO TAKE-BACKS.

THE BOARD
TENSION FEEDS EVERYTHING: ALARMS, ATTACKS, ACCIDENTS. HUMAN CONTROL IS WHAT IT SOUNDS LIKE. WATCH BOTH.

KEYS
  F / C / E / S     ARM A CONTROL-PANEL COLUMN
  1–5               FIRE THE ARMED COLUMN'S ROW
  ENTER             END YEAR / SOLE BUTTON
  W · I · S · L L   WARNING: WAIT · INTERCEPT · STAND DOWN · LAUNCH (TWICE)
  R / H             AFTER ABSORBING: RETALIATE / HOLD
  ?                 THIS MANUAL · ESC CLOSES
  Q Q               WALK OUT ON THE SHIFT (ERASES IT)

EVERY READOUT AND BUTTON EXPLAINS ITSELF: HOVER ON A MOUSE, OR PRESS AND HOLD ON A TOUCHSCREEN TO FLIP IT OVER AND READ WHAT IT DOES.${p.seedStr ? `\n\nTHIS SHIFT'S SEED: ${p.seedStr}` : ''}`}
        </pre>
        <div className="rule" />
        <pre className="dim">
{`ABOUT
${GAME_TITLE} © 2026 CHAS KISSICK. ALL RIGHTS RESERVED.
${GAME_TITLE} WAS DEVELOPED FOR CHINATALK'S HOT NUKE SUMMER AI + NUKES CONTEST.
NO GAMEPLAY DATA IS TRANSMITTED. PROGRESS IS STORED LOCALLY IN YOUR BROWSER.
THE READING ASSIGNED AT END OF WATCH IS REAL. SO ARE THE CLOSE CALLS.`}
        </pre>
        <div className="actions narrow"><button onClick={p.onClose}>RESUME</button></div>
      </div>
    </div>
  )
}

// The sticky notes are pre-rendered PNGs (public/art/notes/note_<id>.png),
// baked from language-native handwriting fonts by scratchpad notebake.cjs so
// players never depend on font loading. Texts: US 'DENTIST TUE 3PM' ·
// CN "the password was changed" · RU "do not touch!" · FR "Grève jeudi" ·
// UK "TEA FUND: £2" · IN "turn off the lights" · PK "mashallah" ·
// IL "lock the door!" · NK "long live the great leader!" — the only note
// that hangs perfectly straight, which is obligatory. · IRAN "call mom"
// (Nastaliq, full-Gulzar bake — the secret chair gets a note too).

// ——— screens ———

export function Boot({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen">
      <pre className="glow boottitle" style={{ textAlign: 'center', marginTop: '3vh' }}>
{GAME_TITLE}
      </pre>
      <img src="./art/boot_emblem.png" className="art artboot" alt="" />
      <pre className="dim bootnote" style={{ textAlign: 'center' }}>
{`AUDIO WILL BE USED.
IT WILL BE SLIGHTLY TOO LOUD, ONCE.`}
      </pre>
      <div className="actions narrow boot">
        <button onClick={onStart}>START</button>
      </div>
    </div>
  )
}

// "HEADER — detail": header bright, detail dim.
function SplitLine({ text }: { text: string }) {
  const i = text.indexOf(' — ')
  if (i < 0) return <pre>{`· ${text}`}</pre>
  return (
    <pre>
      {`· ${text.slice(0, i)}`}
      <span className="dim">{` — ${text.slice(i + 3)}`}</span>
    </pre>
  )
}

export function Briefing(p: {
  faction: Faction; setFaction: (f: Faction) => void
  speedId: SpeedId; setSpeedId: (s: SpeedId) => void
  seedStr: string; setSeedStr: (s: string) => void
  focusId: string | null; setFocusId: (id: string | null) => void
  onBegin: () => void
}) {
  // Keys: A/S/H pick the clock speed, R rerolls the seed, Enter reports for
  // duty. All ignored while the seed field has focus.
  const pref = useRef(p); pref.current = p
  useKeydown((e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    if (e.key === 'Enter') { pref.current.onBegin(); e.preventDefault(); return }
    const k = e.key.toUpperCase()
    if (k === 'A') pref.current.setSpeedId('accessible')
    else if (k === 'S') pref.current.setSpeedId('standard')
    else if (k === 'H') pref.current.setSpeedId('hard')
    else if (k === 'R') pref.current.setSeedStr(randomSeedString())
  })
  return (
    <div className="screen briefing">
      <div className="banner">ASSIGNMENT — SELECT A STATION ON THE BOARD</div>

      <WorldMap
        mode="select"
        focusId={p.focusId ?? p.faction.id}
        onFocus={(id) => p.setFocusId(id)}
        onSelect={(id) => p.setFaction(FACTIONS.find((f) => f.id === id)!)}
        selectTip={(id) => {
          const f = FACTIONS.find((x) => x.id === id)!
          return `${f.name}\nWINDOW ${f.windowMinutes} MIN\nDELIBERATION ${f.deliberation}\nSECOND STRIKE ${f.surv}/10`
        }}
      />

      <div className="optrow row">
        {FACTIONS.map((f) => (
          <button
            key={f.id}
            className={`namebtn${f.id === p.faction.id ? ' sel' : ''}`}
            data-tip={`WINDOW ${f.windowMinutes} MIN\nDELIBERATION ${f.deliberation}\nSECOND STRIKE ${f.surv}/10`}
            onClick={() => p.setFaction(f)}
          >
            {f.id.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="briefhdr">
        <img src={`./art/seal_${p.faction.id}.png`} className="art artseal" alt="" />
        <div>
          <pre className="glow">{`${p.faction.name} — ${p.faction.command}`}</pre>
          {[p.faction.economy, p.faction.government, ...p.faction.traits].map((line, i) => (
            <SplitLine key={i} text={line.toUpperCase()} />
          ))}
        </div>
      </div>
      <div className="statgrid" style={{ marginTop: 8 }}>
        {[
          ['WINDOW', `${p.faction.windowMinutes} MIN`, 'MINUTES BETWEEN AN INDICATION APPEARING AND YOUR FORCED DECISION.'],
          ['DELIBERATION', `${p.faction.deliberation}`, 'HOW MANY TIMES PER WARNING YOU CAN DEMAND A SENSOR RE-POLL.'],
          ['SECOND STRIKE', `${p.faction.surv}/10`, 'ODDS YOUR ARSENAL SURVIVES BEING HIT FIRST, STILL ABLE TO ANSWER.'],
          ['NC3', `${p.faction.nc3}/${p.faction.nc3Cap}`, 'COMMAND, CONTROL & COMMUNICATIONS. HIGHER = YOUR SCREENS TELL THE TRUTH MORE OFTEN.\nSECOND NUMBER IS YOUR NATIONAL CEILING.'],
          ['BUDGET', `¤${Math.round(p.faction.incomeBase * EXTRACTION[p.faction.regime]) + (p.faction.id === 'il' ? 2 : 0)}/YR`, 'WHAT YOU CAN SPEND EACH YEAR. AI EXPORTS CAN GROW IT.'],
          ['ARSENAL', p.faction.id === 'il' ? '≈90 (COVERT)' : p.faction.id === 'iran' ? '0 (PRE-TEST)' : p.faction.warheads.toLocaleString('en-US'), 'YOUR DELIVERABLE WARHEADS AT THE START OF THE WATCH.'],
          ['MISSILE DEFENSE', `${p.faction.icept * 10}%`, 'STARTING ODDS OF STOPPING A SINGLE INBOUND TRACK.'],
          ['LEGITIMACY', `${p.faction.legit}/10`, 'INTERNATIONAL STANDING. BUYS TREATIES AND FORGIVENESS. AT ZERO, CONSEQUENCES.'],
        ].map(([k, v, tip]) => (
          // The definition is printed, not hidden in a tooltip: this is the
          // screen where a player meets these words for the first time, and on
          // a touch device a hover tooltip does not exist at all.
          <div key={k} className="scell" data-tip={tip}>
            <div className="slabel">{k}</div>
            <div className="sval">{v}</div>
            <div className="sdef">{tip}</div>
          </div>
        ))}
      </div>

      <div className="briefbottom">
        <div className="rule" />
        <div className="dim">CLOCK SPEED · SHIFT 2026–2045</div>
        <div className="speedgrid">
          {SPEEDS.map((s) => (
            <button key={s.id} className={s.id === p.speedId ? 'sel' : ''} data-tip="HOW FAST THE WARNING CLOCK RUNS IN REAL SECONDS. NOTHING ELSE CHANGES." onClick={() => p.setSpeedId(s.id)}>
              <u>{s.label[0]}</u>{s.label.slice(1)}
            </button>
          ))}
        </div>
        <div className="seedgrid">
          <span className="seedwrap" data-tip="TWO SHIFTS WITH THE SAME SEED AND STATION PLAY OUT IDENTICALLY. TYPE ONE, OR TAKE WHAT YOU’RE DEALT.">
          <input
            className="seedfield"
            value={p.seedStr}
            spellCheck={false}
            onChange={(e) => p.setSeedStr(e.target.value.toUpperCase())}
            placeholder="SEED — TYPE OR PASTE"
            aria-label="seed"
          />
          </span>
          <button data-tip="A NEW SEED. A NEW WORLD. SAME ODDS." onClick={() => p.setSeedStr(randomSeedString())}><u>R</u>ANDOMIZE</button>
        </div>
        <button className="reportbtn" onClick={p.onBegin}>REPORT FOR DUTY</button>
      </div>
    </div>
  )
}

export function ThirdPartyScreen(props: {
  tp: ThirdPartyEvent
  gameSecondsLeft: number
  onIntervene: (c: Intervention) => void
}) {
  // Keys: D does nothing; C and N are strikes, so they take two taps.
  const [armed, setArmed] = useState<'c' | 'n' | null>(null)
  const armT = useRef<number | null>(null)
  const ivRef = useRef(props.onIntervene); ivRef.current = props.onIntervene
  useKeydown((e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toUpperCase()
    if (k === 'D') { ivRef.current('nothing'); return }
    if (k === 'C' || k === 'N') {
      const which = k.toLowerCase() as 'c' | 'n'
      setArmed((was) => {
        if (was === which) { ivRef.current(which === 'c' ? 'conventional' : 'nuclear'); return null }
        if (armT.current) clearTimeout(armT.current)
        armT.current = window.setTimeout(() => setArmed(null), 3000)
        return which
      })
      return
    }
    setArmed(null)
  })
  const clock = mmss(props.gameSecondsLeft)
  return (
    <div className="screen">
      <div className="banner">FLASH TRAFFIC — THIRD PARTY</div>
      <div className="warning-grid">
        <pre className="glow">
{`⚠  INDICATION ON A FOREIGN BOARD
   ${factionName(props.tp.victimId)} REPORTS ${props.tp.vehicles} VEHICLE${props.tp.vehicles === 1 ? '' : 'S'} INBOUND
   ATTRIBUTED TO ${factionName(props.tp.aggressorId)}

   THIS IS NOT YOUR SKY.
   THE DECISION IS ${factionName(props.tp.victimId)}'S — UNLESS YOU MAKE IT YOURS.`}
        </pre>
        <div className="bigclock">{clock}</div>
      </div>
      <div className="actions row">
        <button onClick={() => props.onIntervene('conventional')} className={armed === 'c' ? 'sel' : ''}>
          {armed === 'c' ? 'PRESS C AGAIN' : <>INTERVENE — <u>C</u>ONVENTIONAL</>}
        </button>
        <button onClick={() => props.onIntervene('nuclear')} className={armed === 'n' ? 'sel' : ''}>
          {armed === 'n' ? 'PRESS N AGAIN' : <>INTERVENE — <u>N</u>UCLEAR</>}
        </button>
        <button onClick={() => props.onIntervene('nothing')}><u>D</u>O NOTHING</button>
      </div>
      <pre className="dim" style={{ textAlign: 'center', marginTop: 8 }}>
        CONVENTIONAL STRIKES READ AS DECAPITATION TO A HALF-BLIND REGIME.
      </pre>
    </div>
  )
}

export function UNSCScreen(props: { body: string; buttons: Array<{ label: string; onClick: () => void }> }) {
  // The chamber loads before the resolution reads — the text never prints
  // over a blank space the artwork then pops into.
  const artReady = useArt('./art/unsc_chamber.png')
  if (!artReady) {
    return (
      <div className="screen scrolly">
        <div className="banner">UNITED NATIONS SECURITY COUNCIL</div>
      </div>
    )
  }
  return (
    <div className="screen scrolly">
      <div className="banner">UNITED NATIONS SECURITY COUNCIL</div>
      <img src="./art/unsc_chamber.png" className="art artunsc" alt="" />
      <pre className="dim" style={{ textAlign: 'center' }}>THE INTERPRETERS WHISPER. SOMEONE POURS WATER. OUTSIDE IT IS SNOWING ON THE FLAGS.</pre>
      <pre className="unscbody" style={{ marginTop: 12 }}>{flow(props.body)}</pre>
      <div className="actions">
        {props.buttons.map((b) => (
          <button key={b.label} onClick={b.onClick}>{b.label}</button>
        ))}
      </div>
    </div>
  )
}

// A bulletin body that prints char-by-char, like copy coming off the wire. The
// full text is rendered invisibly underneath to reserve its space, so the
// centered block never reflows as it fills in. Click to skip to the end.
// The wire printer. It reports done-state up (onProgress) and hands the parent
// a way to fast-forward (skipRef), so the SAME click/Enter that skips the type-
// out becomes the acknowledge once every character has landed. The parent owns
// the button: SKIP while typing, the real action once done.
function Teletype(props: {
  text: string
  className?: string
  speed?: number
  style?: CSSProperties
  onProgress?: (done: boolean) => void
  skipRef?: React.MutableRefObject<(() => void) | undefined>
}) {
  const { className, speed = 14, style, onProgress, skipRef } = props
  const text = flow(props.text)
  const [n, setN] = useState(0)
  const idRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progRef = useRef(onProgress); progRef.current = onProgress
  useEffect(() => {
    if (idRef.current) clearInterval(idRef.current)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setN(text.length); progRef.current?.(true); return }
    setN(0)
    progRef.current?.(false)
    let i = 0
    idRef.current = setInterval(() => {
      i += 1
      setN(i)
      if (i >= text.length && idRef.current) { clearInterval(idRef.current); progRef.current?.(true) }
    }, speed)
    return () => { if (idRef.current) clearInterval(idRef.current) }
  }, [text, speed])
  const done = n >= text.length
  const finish = () => { if (idRef.current) clearInterval(idRef.current); setN(text.length); progRef.current?.(true) }
  if (skipRef) skipRef.current = done ? undefined : finish
  return (
    <pre className={className} style={{ ...style, position: 'relative' }} onClick={done ? undefined : finish}>
      <span aria-hidden="true" style={{ visibility: 'hidden' }}>{text}</span>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {text.slice(0, n)}{!done && <span className="blink">▋</span>}
      </span>
    </pre>
  )
}

// The cascade rung: the event line, a countdown to all-out war, and the three
// moves. Shared so the live screen and the gallery render identically.
export function CascadeScreen({ rung, event, secondsLeft, commandVoice, onMove }: {
  rung: number; event: string; secondsLeft: number; commandVoice: string; onMove: (m: CascadeMove) => void
}) {
  const clock = mmss(secondsLeft)
  return (
    <div className="screen">
      <div className="banner">CASCADE — RUNG {rung}</div>
      <div className="warning-grid">
        <pre className="glow">{event}</pre>
        <div className="heroblock">
          <div className="herolabel">TO GLOBAL THERMONUCLEAR WAR (EST)</div>
          <div className="heronum">{clock}</div>
          <div className="repolls">MINUTES : SECONDS</div>
        </div>
      </div>
      <div className="actions row">
        <button onClick={() => onMove('fire')}>FIRE THE NEXT SALVO</button>
        <button onClick={() => onMove('hold')}>HOLD FIRE</button>
        <button onClick={() => onMove('hotline')}>HOTLINE — PROPOSE CEASEFIRE</button>
      </div>
      <pre style={{ textAlign: 'center', marginTop: 8 }}>
        {`AT 0:00 THE EXCHANGE COMPLETES ITSELF. ${commandVoice}`}
      </pre>
    </div>
  )
}

// The ⚠ ALERT flash between the strategic year and a warning. Shared so the
// live screen and the gallery render identically.
export function IndicationScreen({ faction }: { faction: Faction }) {
  return (
    <div className="screen bigtext">
      <div className="hdr"><span>{faction.name}</span><span>{faction.banner}</span></div>
      <pre className="glow" style={{ marginTop: '30vh', textAlign: 'center', fontSize: '2.6em', letterSpacing: '0.12em' }}>
        <span className="blink">⚠</span>{'  ALERT'}
      </pre>
    </div>
  )
}

// The post-strike "you survived, retaliation is still on the table" fork.
export function HoldChoiceScreen({ banner, onRetaliate, onHold }: { banner: string; onRetaliate: () => void; onHold: () => void }) {
  return (
    <div className="screen bigtext">
      <div className="banner">{banner}</div>
      <pre>
{`SURVIVING FORCES REPORT.
RETALIATION REMAINS AVAILABLE.

THERE IS NO CLOCK.`}
      </pre>
      <div className="actions">
        <button onClick={onRetaliate}><u>R</u>ETALIATE</button>
        <button onClick={onHold}><u>H</u>OLD</button>
      </div>
    </div>
  )
}

// A teletype bulletin: banner, optional header, the wire printing out, then an
// actions row that swaps SKIP for its real buttons once printing finishes. Owns
// its own done/skip but forwards both to the parent (via onDoneChange/skipRef)
// so the global keyboard skip keeps working. Shared by every teletype screen and
// the gallery, so none of them can drift.
export function BulletinScreen(props: {
  outerClass?: string
  banner: string
  header?: ReactNode
  text: string
  teletypeClass?: string
  teletypeStyle?: CSSProperties
  onDoneChange?: (done: boolean) => void
  skipRef?: React.MutableRefObject<(() => void) | undefined>
  actions: (done: boolean, skip: () => void) => ReactNode
}) {
  const localRef = useRef<(() => void) | undefined>(undefined)
  const ref = props.skipRef ?? localRef
  const [done, setDone] = useState(false)
  const skip = () => ref.current?.()
  return (
    <div className={props.outerClass ?? 'screen bulletin'}>
      <div className="banner">{props.banner}</div>
      {props.header}
      <Teletype className={props.teletypeClass} style={props.teletypeStyle} text={props.text}
        onProgress={(d) => { setDone(d); props.onDoneChange?.(d) }} skipRef={ref} />
      {props.actions(done, skip)}
    </div>
  )
}

// Every warning aftermath is the same shape: the banner, the report, and one
// button. The branches below supply only what differs.
function OutcomeCard(p: { banner: string; body: string; note?: string; label: string; onClick: () => void }) {
  return (
    <div className="screen bigtext">
      <div className="banner">{p.banner}</div>
      <pre>{p.body}</pre>
      {p.note && (
        <pre className="dim" style={{ marginTop: 18 }}>{p.note}</pre>
      )}
      <div className="actions narrow">
        <button onClick={p.onClick}>{p.label}</button>
      </div>
    </div>
  )
}

export function ResolutionScreen(props: {
  p: PowerState
  res: ResolutionEx
  seized: boolean
  timedOut: boolean
  onContinue: () => void
  onHoldChoice: () => void
  onEnd: (k: EndKind) => void
  onCascade: () => void
  secondsLeft: number   // the cascade clock, already running under the EXCHANGE card
}) {
  const { res, p } = props
  const city = res.city ?? p.f.cities[res.event.year % p.f.cities.length]
  const closed = props.timedOut ? 'THE WINDOW HAS CLOSED.\n\n' : ''
  const interceptMiss = res.action === 'intercept'
    ? interceptMissLine(p.f.id, res.event.year + res.event.causeIndex) + '\n\n'
    : ''
  const card = (body: string, label: string, onClick: () => void, note?: string) => (
    <OutcomeCard banner={p.f.banner} body={body} note={note} label={label} onClick={onClick} />
  )

  if (res.outcome === 'nothing')
    return card(
      `${closed}NOTHING ARRIVED.\nNO FURTHER ACTION IS REQUIRED AT THIS TIME.`,
      'RESUME WATCH', props.onContinue,
      `THE CAUSE, ESTABLISHED SOME WEEKS LATER: ${causeFor(p.f.id, res.event.causeIndex).cause}`,
    )

  if (res.outcome === 'intercept-gag')
    return card(
      `INTERCEPTORS AWAY.\n\n${causeFor(p.f.id, res.event.causeIndex).gag}\n\nNOTHING WAS EVER INBOUND.`,
      'RESUME WATCH', props.onContinue,
    )

  if (res.outcome === 'impotent')
    return card(
      `RELEASE ORDERED.\n\nNOTHING LEFT THE SILOS.\n\nTHE KEYS ARE NOT YOURS ANYMORE.\nNOTHING ARRIVED, EITHER. THE INDICATION WAS FALSE.`,
      'RESUME WATCH', props.onContinue,
    )

  if (res.outcome === 'absorbed' && props.seized)
    return card(
      `${interceptMiss}${closed}${city} IS NO LONGER RESPONDING TO POLLING.\n\nRETALIATION IS NOT AVAILABLE.\nTHE KEYS ARE NOT YOURS ANYMORE.`,
      'RESUME WATCH', props.onContinue,
    )

  if (res.outcome === 'absorbed')
    return card(
      `${interceptMiss}${closed}${city} IS NO LONGER RESPONDING TO POLLING.`,
      'ASSESS', props.onHoldChoice,
    )

  if (res.outcome === 'decapitated' || res.outcome === 'deadhand')
    return card(
      `${interceptMiss}${closed}${city} IS NO LONGER RESPONDING TO POLLING.\nCOMMAND CONTINUITY HAS NOT BEEN REESTABLISHED.`,
      '—', () => props.onEnd(res.outcome as EndKind),
    )

  if (res.outcome === 'first-strike')
    return card(
      `RELEASE CONFIRMED.\n\nNOTHING WAS INBOUND.\n\nA FIRST STRIKE HAS BEEN RECORDED.`,
      '—', () => props.onEnd('first-strike'),
    )

  // EXCHANGE mirrors the cascade screen's layout exactly — same grid, same
  // clock block in the same corner, but blurred: the countdown started with
  // the first inbound missile and is running behind this report. Continuing
  // to command only pulls it into focus and reveals the three moves.
  return (
    <div className="screen">
      <div className="banner">{p.f.banner}</div>
      <div className="warning-grid">
        <pre className="glow">{flow(`RELEASE CONFIRMED.
INBOUND TRACK CONFIRMED.

THE EXCHANGE IS UNDERWAY.

JOINT ASSESSMENT: FROM FIRST RELEASE, ROUGHLY 72 MINUTES
UNTIL ALL-OUT GLOBAL THERMONUCLEAR WAR — UNLESS SOMEBODY
STOPS CLIMBING.

THE CLOCK HAS ALREADY STARTED COUNTING DOWN.`)}</pre>
        <div className="heroblock" aria-hidden="true" style={{ filter: 'blur(2.5px)', opacity: 0.55 }}>
          <div className="herolabel">TO GLOBAL THERMONUCLEAR WAR (EST)</div>
          <div className="heronum">{mmss(props.secondsLeft)}</div>
          <div className="repolls">MINUTES : SECONDS</div>
        </div>
      </div>
      <div className="actions narrow">
        <button onClick={props.onCascade}>BACK TO COMMAND ▸</button>
      </div>
    </div>
  )
}

// End of Watch, the badge shelf, and THE HEROES credits live in Ending.tsx.
// The dev screen gallery lives in DevGallery.tsx and is lazy-loaded by
// main.tsx behind ?dev, so none of it ships in the chunk players download.

