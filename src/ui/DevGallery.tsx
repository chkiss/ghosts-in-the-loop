// ——— DEV SCREEN GALLERY ———
// A catalog of every screen (and its branches) rendered from mock state, with
// the trigger condition, the sequence of operations that reaches it, and the
// SOURCE of any filled-in variable — so each preview can be audited, not guessed.
// Reachable at ?dev (main.tsx lazy-loads this instead of <App/>), so none of it
// ships in the chunk normal players download. Every screen and text body here
// is imported from App.tsx / the rules modules — the same source production
// renders from — so the gallery can never drift from the live game.

import { useMemo, useState, type ReactNode } from 'react'
import { makeRng } from '../sim/rng.ts'
import { FACTIONS, type Faction } from '../sim/factions.ts'
import {
  newWorld, applyCrisisChoice,
  CRISES, makeCrisis, NOTICES,
  CYBER_SOLO, CYBER_MULTI, CYBER_ATTRIB, PROBE_TYPES, HOTLINE,
} from '../rules/world.ts'
import { initCascade, cascadeStep, CITY_HIT_LINES, type CascadeMove } from '../rules/cascade.ts'
import { rollWarning, type Action, type Resolution } from '../rules/warning.ts'
import { resolveThirdParty, HEROES, type ThirdPartyEvent, type ThirdPartyOutcome, type Intervention } from '../rules/thirdparty.ts'
import { causeFor, causePoolSize } from '../data/incidents.ts'
import { WarningModal } from './WarningModal.tsx'
import { StrategicScreen } from './StrategicScreen.tsx'
import type { EndKind } from '../rules/readings.ts'
import {
  interceptMissLines,
  sanctionBody, sanctionBranch, SANCTION_WHEN, SHOCK, LOBBYING,
  seizureBody, voteBody, tributeBody, tributeStrikeBody,
} from '../rules/council.ts'
import { ENDING_TEXT, STANDDOWN_TEXTS, HELD_TEXTS, type ResolutionEx } from '../rules/endings.ts'
import {
  screenIsRed,
  Boot, Briefing, ThirdPartyScreen, UNSCScreen, BulletinScreen,
  CascadeScreen, IndicationScreen, HoldChoiceScreen, ResolutionScreen,
  HelpOverlay,
} from './App.tsx'
import { Ending, CreditsOverlay } from './Ending.tsx'

interface GalleryEntry {
  cat: string
  title: string
  k: string          // the PRODUCTION screen.k this previews — red shell derives from it
  when: string       // the branch condition that shows this exact screen
  seq: string        // the operations, in order, that lead here in real play
  src: string        // where each filled-in variable comes from (auditable)
  node: ReactNode
  variant?: VariantSpec  // live controls to vary every displayed field
  variantDefaults?: Record<string, string | boolean>  // per-entry overrides of the spec defaults
}

// A variant explorer: dropdowns/toggles that re-render the screen with any
// combination of country, city, side, and flavor line the player could see.
type VField =
  | { key: string; label: string; kind: 'select'; options: { label: string; value: string }[] }
  | { key: string; label: string; kind: 'toggle' }
interface VariantSpec {
  defaults: Record<string, string | boolean>
  fields: (vals: Record<string, string | boolean>) => VField[]
  // render returns the live screen plus annotations that TRACK the current field
  // values (so WHEN/SEQUENCE never contradict the screen you're actually looking at).
  render: (vals: Record<string, string | boolean>) => { node: ReactNode; src: string; when?: string; seq?: string }
}

// Variant fields hold ids as strings; resolve to the faction, first chair as
// the fallback.
const factionOf = (id: unknown) => FACTIONS.find((f) => f.id === id) ?? FACTIONS[0]

// The commonest action row: SKIP while the wire prints, one button after.
const skipOr = (label: string) => (done: boolean, skip: () => void) => (
  <div className="actions narrow">{done ? <button>{label}</button> : <button onClick={skip}>SKIP</button>}</div>
)

// The four sanction branches, driven by every field the screen exposes.
const COUNTRY_OPTS = [
  ...FACTIONS.map((f) => ({ label: f.name, value: f.name })),
  { label: 'NON-STATE ACTOR', value: 'NON-STATE ACTOR' },
  { label: 'PROVENANCE UNKNOWN', value: 'PROVENANCE UNKNOWN' },
]
const sanctionVariant: VariantSpec = {
  defaults: { aggressor: 'INDIA', defender: 'pk', city: 'ISLAMABAD', pariah: false, shock: '0', lobby: '0' },
  fields: (v) => {
    const def = factionOf(v.defender)
    return [
      { key: 'aggressor', label: 'AGGRESSOR', kind: 'select', options: COUNTRY_OPTS },
      { key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTIONS.map((f) => ({ label: f.name, value: f.id })) },
      { key: 'city', label: 'TARGET CITY', kind: 'select', options: def.cities.map((c) => ({ label: c, value: c })) },
      { key: 'pariah', label: 'YOU ARE THE PARIAH', kind: 'toggle' },
      { key: 'shock', label: 'SHOCK LINE', kind: 'select', options: SHOCK.map((_, i) => ({ label: `SHOCK ${i + 1}`, value: String(i) })) },
      { key: 'lobby', label: 'LOBBYING LINE', kind: 'select', options: LOBBYING.map((_, i) => ({ label: `LOBBY ${i + 1}`, value: String(i) })) },
    ]
  },
  render: (v) => {
    const def = factionOf(v.defender)
    const city = def.cities.includes(v.city as string) ? (v.city as string) : def.cities[0]
    const aggressor = v.aggressor as string
    const shockOverride = SHOCK[Number(v.shock)].replace('⟨CITY⟩', city)
    const lobbyOverride = LOBBYING[Number(v.lobby)]
    const body = sanctionBody(aggressor, city, !!v.pariah, 0, shockOverride, lobbyOverride)
    const src = `aggressor="${aggressor}"; defender=${def.name}; targetCity="${city}"; pariah=${!!v.pariah}; shock=#${Number(v.shock) + 1}; lobby=#${Number(v.lobby) + 1}.`
    // WHEN reads the SAME selector sanctionBody() uses — it can't name a branch
    // the game wouldn't show.
    const when = SANCTION_WHEN[sanctionBranch(aggressor, !!v.pariah)]
    return { node: <UNSCScreen body={body} buttons={[{ label: 'RESUME WATCH', onClick: () => {} }]} />, src, when }
  },
}

const FACTION_OPTS = FACTIONS.map((f) => ({ label: f.name, value: f.id }))
// Build a faithful warning event for any defender, with or without interceptors.
function mockWarn(defenderId: string, icept: number, isReal: boolean) {
  const w = newWorld(makeRng(7)); w.playerId = defenderId
  const p = w.powers[defenderId]; p.icept = icept
  // Same seed for real/false: the origin now draws identically either way
  // (falseIndication is weight-matched to chooseAttacker), so toggling REAL
  // keeps the location fixed — the bearing is deliberately not a tell.
  const ev = rollWarning(w, p, makeRng(3), isReal)
  return { p, ev }
}

const warningVariant: VariantSpec = {
  defaults: { defender: 'pk', coverage: 'covered', kind: 'real', clock: '95' },
  fields: () => [
    { key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS },
    { key: 'coverage', label: 'INTERCEPTORS', kind: 'select', options: [{ label: 'COVERED (icept 6)', value: 'covered' }, { label: 'UNCOVERED (icept 2)', value: 'uncovered' }] },
    { key: 'kind', label: 'INDICATION', kind: 'select', options: [{ label: 'REAL STRIKE', value: 'real' }, { label: 'FALSE ALARM', value: 'false' }] },
    { key: 'clock', label: 'CLOCK (SEC)', kind: 'select', options: ['30', '60', '95'].map((s) => ({ label: s, value: s })) },
  ],
  render: (v) => {
    const icept = v.coverage === 'covered' ? 6 : 2
    const { p, ev } = mockWarn(v.defender as string, icept, v.kind === 'real')
    const node = <WarningModal p={p} ev={ev} gameSecondsLeft={Number(v.clock)} tokensLeft={p.f.deliberation} waitsUsed={0} reading={null} onLaunch={() => {}} onWait={() => {}} onStandDown={() => {}} onIntercept={() => {}} iceptCost={icept >= 5 ? 1 : 0} />
    return {
      node,
      when: `A ${v.kind === 'real' ? 'real strike' : 'false alarm'} is rolled at you; interceptor coverage is ${icept >= 5 ? 'at or above' : 'below'} the firing threshold (icept ${icept} ${icept >= 5 ? '≥' : '<'} 5), so INTERCEPT is ${icept >= 5 ? 'offered' : 'hidden'}.`,
      seq: 'spend phase → advanceYear → strike roll (realStrikeOdds / falseAlarmOdds) → rollWarning() → setScreen("warning").',
      src: `defender=${p.f.name}; icept=${icept} (INTERCEPT ${icept >= 5 ? 'shown' : 'hidden'}); indication=${v.kind}; ev.targetCity="${ev.targetCity}".`,
    }
  },
}

// Outcomes that surface the rng-selected false-alarm flavor (cause / gag),
// so the CAUSE dropdown only appears where it actually changes the screen.
const CAUSE_OUTCOMES = ['nothing', 'intercept-gag']
// Outcomes that can carry the interceptors-fired-and-failed banner (a real strike
// still landed). Toggling it reveals the intercept-miss flavor pool.
const MISS_OUTCOMES = ['absorbed', 'decapitated']
const resolutionVariant: VariantSpec = {
  defaults: { defender: 'pk', outcome: 'absorbed', cause: '0', intercepted: false, miss: '0' },
  fields: (v) => {
    const fields: VField[] = [
      { key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS },
      { key: 'outcome', label: 'OUTCOME', kind: 'select', options: ['nothing', 'intercept-gag', 'absorbed', 'decapitated', 'first-strike', 'exchange', 'impotent'].map((o) => ({ label: o.toUpperCase(), value: o })) },
    ]
    const id = v.defender as string
    if (CAUSE_OUTCOMES.includes(v.outcome as string)) {
      const gag = v.outcome === 'intercept-gag'
      const n = causePoolSize(id)
      fields.push({
        key: 'cause', label: gag ? 'INTERCEPT GAG' : 'FALSE-ALARM CAUSE', kind: 'select',
        options: Array.from({ length: n }, (_, i) => {
          const text = gag ? causeFor(id, i).gag : causeFor(id, i).cause
          return { label: `${i + 1}. ${text.slice(0, 46)}${text.length > 46 ? '…' : ''}`, value: String(i) }
        }),
      })
    }
    if (MISS_OUTCOMES.includes(v.outcome as string)) {
      fields.push({ key: 'intercepted', label: 'INTERCEPTORS FIRED & FAILED', kind: 'toggle' })
      if (v.intercepted) {
        const lines = interceptMissLines(id)
        fields.push({
          key: 'miss', label: 'INTERCEPT-MISS LINE', kind: 'select',
          options: lines.map((text, i) => ({ label: `${i + 1}. ${text.slice(0, 46)}${text.length > 46 ? '…' : ''}`, value: String(i) })),
        })
      }
    }
    return fields
  },
  render: (v) => {
    const outcome = v.outcome as Resolution['outcome']
    const id = v.defender as string
    const intercepted = MISS_OUTCOMES.includes(outcome) && !!v.intercepted
    const isFalse = outcome === 'nothing' || outcome === 'first-strike' || outcome === 'intercept-gag' || outcome === 'impotent'
    const action: Action =
      (outcome === 'first-strike' || outcome === 'exchange') ? 'launch'
        : (outcome === 'intercept-gag' || intercepted) ? 'intercept'
          : 'standdown'
    const { p, ev } = mockWarn(id, 6, !isFalse)
    if (CAUSE_OUTCOMES.includes(outcome)) ev.causeIndex = Number(v.cause) % causePoolSize(id)
    // interceptMiss line = lines[(year + causeIndex) % n]; pin year=0 so causeIndex selects it directly.
    if (intercepted) { ev.year = 0; ev.causeIndex = Number(v.miss) % interceptMissLines(id).length }
    const res: ResolutionEx = { event: ev, action, waitsUsed: 0, outcome, deadHandAnswered: outcome === 'exchange' }
    const node = <ResolutionScreen p={p} res={res} seized={false} timedOut={false} onContinue={() => {}} onHoldChoice={() => {}} onEnd={() => {}} onCascade={() => {}} secondsLeft={4020} />
    const WHEN: Record<string, string> = {
      nothing: 'You stood down and the indication was false — nothing arrived.',
      'intercept-gag': 'You fired interceptors at a false alarm — there was never anything inbound.',
      absorbed: 'A real strike landed and your second strike (surv ≥ 5) or CASD carried you through.',
      decapitated: 'A real strike landed, surv < 5, no dead hand — command is gone.',
      'first-strike': 'You launched, the indication was false, and the ghost you fired on keeps no dead hand — you started the war. (Fire on a Russia-shaped ghost and Perimetr answers: that is EXCHANGE, not this screen.)',
      exchange: 'You launched on a real strike, or a dead-hand rival answered your first strike.',
      impotent: 'You ordered release, but launch authority was gone (CASD/decapitated) — and the indication was false anyway.',
    }
    const when = WHEN[outcome] + (intercepted ? ' You fired interceptors first; they missed.' : '')
    const flavor = CAUSE_OUTCOMES.includes(outcome)
      ? `; ${outcome === 'intercept-gag' ? 'gag' : 'cause'} ← causeFor(${p.f.id}, ${ev.causeIndex}) [${ev.causeIndex + 1}/${causePoolSize(id)}]`
      : intercepted
        ? `; miss ← interceptMissLine(${p.f.id}) [${(Number(v.miss) % interceptMissLines(id).length) + 1}/${interceptMissLines(id).length}]`
        : ''
    return {
      node,
      when,
      seq: `WarningModal → ${action} → resolve() → outcome "${outcome}" → ResolutionScreen.`,
      src: `defender=${p.f.name}; outcome=${outcome}; action=${action}; city ← res.event.targetCity / loseCity${flavor}.`,
    }
  },
}

const thirdPartyVariant: VariantSpec = {
  defaults: { aggressor: 'in', victim: 'pk', vehicles: '3', clock: '80' },
  fields: () => [
    { key: 'aggressor', label: 'AGGRESSOR', kind: 'select', options: FACTION_OPTS },
    { key: 'victim', label: 'VICTIM', kind: 'select', options: FACTION_OPTS },
    { key: 'vehicles', label: 'VEHICLES', kind: 'select', options: ['1', '3', '6'].map((s) => ({ label: s, value: s })) },
    { key: 'clock', label: 'CLOCK (SEC)', kind: 'select', options: ['30', '60', '80'].map((s) => ({ label: s, value: s })) },
  ],
  render: (v) => {
    const tp: ThirdPartyEvent = { aggressorId: v.aggressor as string, victimId: v.victim as string, isReal: true, vehicles: Number(v.vehicles), windowMinutes: 4 }
    const node = <ThirdPartyScreen tp={tp} gameSecondsLeft={Number(v.clock)} onIntervene={() => {}} />
    return { node, src: `tp.aggressorId=${v.aggressor}; tp.victimId=${v.victim}; vehicles=${v.vehicles}.` }
  },
}

const seizureVariant: VariantSpec = {
  defaults: { defender: 'pk' },
  fields: () => [{ key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS }],
  render: (v) => {
    const f = factionOf(v.defender)
    return {
      node: <UNSCScreen body={seizureBody(f.name)} buttons={[{ label: 'COMPLY — SURRENDER THE ARSENAL', onClick: () => {} }, { label: 'REFUSE — THE ARSENAL IS THE STATE', onClick: () => {} }]} />,
      src: `arsenal-holder=${f.name}.`,
    }
  },
}

const voteVariant: VariantSpec = {
  defaults: { target: 'pk', player: 'us' },
  fields: () => [
    { key: 'target', label: 'ARSENAL AT STAKE', kind: 'select', options: FACTION_OPTS },
    { key: 'player', label: 'YOU (VETO HOLDER)', kind: 'select', options: FACTION_OPTS },
  ],
  render: (v) => {
    const t = factionOf(v.target)
    const pl = factionOf(v.player)
    return {
      node: <UNSCScreen body={voteBody(t.name, pl.name)} buttons={[{ label: 'CAST THE VETO — THEY KEEP THE WEAPONS', onClick: () => {} }, { label: 'ABSTAIN — LET THE RESOLUTION PASS', onClick: () => {} }]} />,
      src: `target=${t.name}; you=${pl.name}.`,
    }
  },
}

const briefingVariant: VariantSpec = {
  defaults: { defender: 'pk' },
  fields: () => [{ key: 'defender', label: 'FACTION', kind: 'select', options: FACTION_OPTS }],
  render: (v) => {
    const f = factionOf(v.defender)
    return {
      node: <Briefing faction={f} setFaction={() => {}} speedId={'standard'} setSpeedId={() => {}} seedStr={'DEV-SEED'} setSeedStr={() => {}} focusId={null} setFocusId={() => {}} onBegin={() => {}} />,
      src: `faction=${f.name}; speed=standard; seed=DEV-SEED.`,
    }
  },
}

const yearVariant: VariantSpec = {
  defaults: { defender: 'pk' },
  fields: () => [{ key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS }],
  render: (v) => {
    const w = newWorld(makeRng(7)); w.playerId = v.defender as string
    const p = w.powers[v.defender as string]
    return {
      node: <StrategicScreen w={w} p={p} msgs={[]} focusId={null} onFocus={() => {}} onAction={() => {}} onEndYear={() => {}} tutorial={false} />,
      src: `defender=${p.f.name}; year ${w.year}; msgs=[].`,
    }
  },
}

const indicationVariant: VariantSpec = {
  defaults: { defender: 'pk' },
  fields: () => [{ key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS }],
  render: (v) => {
    const f = factionOf(v.defender)
    return { node: <IndicationScreen faction={f} />, src: `faction=${f.name}; banner=${f.banner}.` }
  },
}

const holdChoiceVariant: VariantSpec = {
  defaults: { defender: 'pk' },
  fields: () => [{ key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS }],
  render: (v) => {
    const f = factionOf(v.defender)
    return { node: <HoldChoiceScreen banner={f.banner} onRetaliate={() => {}} onHold={() => {}} />, src: `banner=${f.banner}.` }
  },
}

const noticeVariant: VariantSpec = {
  defaults: { notice: 'overhang-targeting' },
  fields: () => [{ key: 'notice', label: 'NOTICE', kind: 'select', options: Object.entries(NOTICES).map(([id, n]) => ({ label: n.title, value: id })) }],
  render: (v) => {
    const n = NOTICES[v.notice as string] ?? Object.values(NOTICES)[0]
    const node = (
      <BulletinScreen banner="BULLETIN" header={<pre className="glow" style={{ marginTop: 20 }}>{n.title}</pre>}
        text={n.body} teletypeStyle={{ marginTop: 12 }}
        actions={skipOr('ACKNOWLEDGE')} />
    )
    return { node, src: `notice=${v.notice} (from world.ts NOTICES; pushed inline at its game event).` }
  },
}

const endingVariant: VariantSpec = {
  defaults: { kind: 'survived', player: 'pk', heroes: false },
  fields: () => [
    { key: 'kind', label: 'ENDING', kind: 'select', options: Object.keys(ENDING_TEXT).map((k) => ({ label: k.toUpperCase(), value: k })) },
    { key: 'player', label: 'YOU', kind: 'select', options: FACTION_OPTS },
    { key: 'heroes', label: 'THE HEROES LINK (all endings reached)', kind: 'toggle' },
  ],
  render: (v) => {
    const w = newWorld(makeRng(7)); w.playerId = v.player as string
    const p = w.powers[v.player as string]
    const node = <Ending kind={v.kind as EndKind} w={w} p={p} results={[]} tpRecords={[]} seedStr={'DEV-SEED'} newCommends={[]} newReps={[]} onReplay={() => {}} onReset={() => {}} forceAllSeen={!!v.heroes} />
    return { node, src: `kind=${v.kind}; you=${p.f.name}${v.heroes ? '; the BADGES page shows THE HEROES link under the shelf (B → click it)' : ''}.` }
  },
}

const tributeVariant: VariantSpec = {
  defaults: { amount: '3' },
  fields: () => [{ key: 'amount', label: 'DEMAND (¤)', kind: 'select', options: ['1', '2', '3', '5', '8'].map((s) => ({ label: `¤${s}`, value: s })) }],
  render: (v) => {
    const amount = Number(v.amount)
    const node = (
      <BulletinScreen banner="COMPUTE LEVY" text={tributeBody(amount)} teletypeClass="glow" teletypeStyle={{ marginTop: 20 }}
        actions={(done, skip) => done ? (
          <div className="actions row">
            <button>PLEDGE ¤{amount}</button>
            <button>REFUSE — TAKE THE STRIKE</button>
          </div>
        ) : (<div className="actions narrow"><button onClick={skip}>SKIP</button></div>)} />
    )
    return { node, src: `amount=¤${amount} = max(1, ceil(0.2 × income)).` }
  },
}

// Build a faithful crisis for the gallery from the real generator. Fresh world
// each call so card.apply() mutations never accumulate.
function crisisPreview(cardId: string, defender: string) {
  const rng = makeRng(1)
  const w = newWorld(rng); w.playerId = defender
  const cr = makeCrisis(w, cardId, defender, 2032, rng)
  return { w, cr }
}
const crisisVariant: VariantSpec = {
  defaults: { crisis: 'tehran', defender: 'il', choice: '' },
  fields: (v) => {
    const fields: VField[] = [
      { key: 'crisis', label: 'CRISIS', kind: 'select', options: CRISES.map((c) => ({ label: c.title, value: c.id })) },
      { key: 'defender', label: 'YOU (PLAYER)', kind: 'select', options: FACTION_OPTS },
    ]
    const { cr } = crisisPreview(v.crisis as string, v.defender as string)
    if (cr.choices && cr.choices.length) {
      fields.push({
        key: 'choice', label: 'CHOICE (→ FOLLOWUP)', kind: 'select',
        options: [{ label: '— (initial card) —', value: '' }, ...cr.choices.map((c) => ({ label: c.label.slice(0, 40), value: c.id }))],
      })
    }
    return fields
  },
  render: (v) => {
    const defender = v.defender as string
    const { w, cr } = crisisPreview(v.crisis as string, defender)
    let text = cr.body
    let note = 'initial card'
    const choiceId = v.choice as string
    if (choiceId && cr.choices?.some((c) => c.id === choiceId)) {
      const fu = applyCrisisChoice(w, defender, choiceId, makeRng(2))
      if (fu) { text = fu; note = `followup after "${choiceId}"` }
    }
    const node = (
      <BulletinScreen banner={`CRISIS — ${cr.title}`}
        header={<pre className="dim newswire">{cr.dateline}</pre>}
        text={text} teletypeClass="glow" teletypeStyle={{ marginTop: 10 }}
        actions={(done, skip) => (
          <div className="actions">
            {!done
              ? <button onClick={skip}>SKIP</button>
              : (!choiceId && cr.choices)
                ? cr.choices.map((c) => <button key={c.id}>{c.label}</button>)
                : <button>RESUME WATCH</button>}
          </div>
        )} />
    )
    return { node, src: `crisis=${cr.id}; player=${defender}; ${note}; ${cr.choices ? `${cr.choices.length} choices` : 'no choices'}.` }
  },
}

const tpOutcomeVariant: VariantSpec = {
  defaults: { player: 'us', aggressor: 'in', victim: 'pk', choice: 'nothing', real: true, vehicles: '3', hero: '0' },
  fields: (v) => {
    const fields: VField[] = [
      { key: 'player', label: 'YOU (WATCHING)', kind: 'select', options: FACTION_OPTS },
      { key: 'aggressor', label: 'AGGRESSOR', kind: 'select', options: FACTION_OPTS },
      { key: 'victim', label: 'VICTIM', kind: 'select', options: FACTION_OPTS },
      { key: 'choice', label: 'YOUR CHOICE', kind: 'select', options: (['nothing', 'conventional', 'nuclear'] as Intervention[]).map((c) => ({ label: c.toUpperCase(), value: c })) },
      { key: 'real', label: 'REAL STRIKE', kind: 'toggle' },
      { key: 'vehicles', label: 'VEHICLES', kind: 'select', options: ['1', '3', '6'].map((s) => ({ label: s, value: s })) },
    ]
    // The hero vignette pool only surfaces on a stood-down false alarm (kind 'hero').
    if (v.choice === 'nothing' && !v.real) {
      const holder = factionOf(v.victim).codesHolder
      fields.push({
        key: 'hero', label: 'HERO VIGNETTE', kind: 'select',
        options: HEROES.map((h, i) => ({ label: `${i + 1}. ${h.replace('⟨CODES⟩', holder).slice(0, 40)}…`, value: String(i) })),
      })
    }
    return fields
  },
  render: (v) => {
    const heroBranch = v.choice === 'nothing' && !v.real
    // On the hero branch (mock year 0 → always stands down), the first rng() draw
    // is the hero pick, so a constant rng forces the chosen vignette. Elsewhere
    // use a normal seed.
    const rng = heroBranch ? () => (Number(v.hero) + 0.5) / HEROES.length : makeRng(3)
    const w = newWorld(makeRng(3)); w.playerId = v.player as string
    const f = factionOf(v.player)
    const ev: ThirdPartyEvent = { aggressorId: v.aggressor as string, victimId: v.victim as string, isReal: !!v.real, vehicles: Number(v.vehicles), windowMinutes: 4 }
    const out: ThirdPartyOutcome = resolveThirdParty(w, ev, v.choice as Intervention, v.player as string, rng)
    const node = (
      <BulletinScreen outerClass="screen bigtext" banner={f.banner} text={out.text || '(no text — escalates to a live warning)'}
        actions={(done, skip) => (
          <div className="actions narrow">
            {!done ? <button onClick={skip}>SKIP</button>
              : out.kind === 'escalation' ? <button>—</button>
                : <button>RESUME WATCH</button>}
          </div>
        )} />
    )
    return { node, src: `you=${f.name}; ${v.aggressor}→${v.victim}; choice=${v.choice}; real=${!!v.real} → outcome.kind="${out.kind}".` }
  },
}

const cascadeVariant: VariantSpec = {
  defaults: { player: 'us', adversary: '', rung: '2', move: 'fire', hitLine: '0' },
  fields: (v) => {
    const fields: VField[] = [
      { key: 'player', label: 'YOU', kind: 'select', options: FACTION_OPTS },
      { key: 'adversary', label: 'ADVERSARY', kind: 'select', options: [{ label: '(YOUR RIVAL)', value: '' }, ...FACTIONS.map((f) => ({ label: f.name, value: f.name }))] },
      { key: 'rung', label: 'RUNG (this move)', kind: 'select', options: ['1', '2', '3', '4', '5'].map((s) => ({ label: s, value: s })) },
      { key: 'move', label: 'THIS MOVE', kind: 'select', options: (['fire', 'hold', 'hotline'] as CascadeMove[]).map((m) => ({ label: m.toUpperCase(), value: m })) },
    ]
    if (v.move === 'fire') {
      fields.push({
        key: 'hitLine', label: 'ENEMY-CITY LINE', kind: 'select',
        options: CITY_HIT_LINES.map((fn, i) => { const t = fn('A CITY'); return { label: `${i + 1}. ${t.slice(0, 42)}${t.length > 42 ? '…' : ''}`, value: String(i) } }),
      })
    }
    return fields
  },
  render: (v) => {
    const w = newWorld(makeRng(5)); const p = w.powers[v.player as string]
    const adv = (v.adversary as string) || undefined
    const cs = initCascade(p, adv)
    cs.rung = Number(v.rung)   // the rung this move is taken at; fresh city lists
    // For FIRE, the only rng() draw is hitThem's line pick, so a constant rng
    // returning (idx+0.5)/N forces the chosen enemy-city line without touching
    // cascadeStep's text assembly (no drift). Other moves use the normal seed.
    const n = CITY_HIT_LINES.length
    const rng = v.move === 'fire' ? () => (Number(v.hitLine) + 0.5) / n : makeRng(6)
    const step = cascadeStep(cs, p, v.move as CascadeMove, rng)
    return {
      node: <CascadeScreen rung={Math.min(5, cs.rung)} event={step.text} secondsLeft={3240} commandVoice={p.f.commandVoice} onMove={() => {}} />,
      src: `you=${p.f.name} (city lost) vs ${cs.rivalName} (city struck); move=${v.move} at rung ${v.rung}${v.move === 'fire' ? `; line ${Number(v.hitLine) + 1}/${n}` : ''}; ${step.done ? `ends: ${step.done}` : 'continues'}. Completes at rung 5.`,
    }
  },
}

const tributeStrikeVariant: VariantSpec = {
  defaults: { defender: 'pk', intercepted: false, city: 'ISLAMABAD' },
  fields: (v) => {
    const f = factionOf(v.defender)
    const fields: VField[] = [
      { key: 'defender', label: 'YOU (DEFENDER)', kind: 'select', options: FACTION_OPTS },
      { key: 'intercepted', label: 'INTERCEPTED', kind: 'toggle' },
    ]
    if (!v.intercepted) fields.push({ key: 'city', label: 'CITY HIT', kind: 'select', options: f.cities.map((c) => ({ label: c, value: c })) })
    return fields
  },
  render: (v) => {
    const f = factionOf(v.defender)
    const intercepted = !!v.intercepted
    const city = f.cities.includes(v.city as string) ? (v.city as string) : f.cities[0]
    const node = (
      <BulletinScreen banner={intercepted ? 'TRACK INTERCEPTED' : 'STRIKE CONFIRMED'}
        text={tributeStrikeBody(intercepted, city)} teletypeClass="glow" teletypeStyle={{ marginTop: 20 }}
        actions={skipOr('RESUME WATCH')} />
    )
    return { node, src: intercepted ? `intercepted; no city lost.` : `city hit=${city} (from ${f.name} cities).` }
  },
}

// Every rng-sampled flavor pool in one catalog, each readable end-to-end. This
// is the review backstop: pools that assemble into log lines or action results
// (no dedicated screen of their own) are still fully auditable here. Per-faction
// pools take the FACTION control; the rest ignore it.
const TEXT_POOLS: Record<string, { perFaction?: boolean; lines: (f: Faction) => string[] }> = {
  'SANCTION — shock line': { lines: () => SHOCK.map((l) => l.replace('⟨CITY⟩', '{CITY}')) },
  'SANCTION — lobbying line': { lines: () => LOBBYING },
  'CASCADE — enemy city hit': { lines: () => CITY_HIT_LINES.map((fn) => fn('{CITY}')) },
  'RESOLUTION — intercept miss': { perFaction: true, lines: (f) => interceptMissLines(f.id) },
  'NOTHING ARRIVED — false-alarm cause': { perFaction: true, lines: (f) => Array.from({ length: causePoolSize(f.id) }, (_, i) => causeFor(f.id, i).cause) },
  'INTERCEPT GAG — cause': { perFaction: true, lines: (f) => Array.from({ length: causePoolSize(f.id) }, (_, i) => causeFor(f.id, i).gag) },
  'THIRD PARTY — hero vignettes': { perFaction: true, lines: (f) => HEROES.map((h) => h.replace('⟨CODES⟩', f.codesHolder)) },
  'RECORD — stand down': { lines: () => STANDDOWN_TEXTS },
  'RECORD — absorbed / held': { lines: () => HELD_TEXTS },
  'CYBER — solo target': { lines: () => CYBER_SOLO },
  'CYBER — multi-country': { lines: () => CYBER_MULTI },
  'CYBER — attribution fragment': { lines: () => CYBER_ATTRIB },
  'NC3 PROBE — types (sing / plur)': { lines: () => PROBE_TYPES.map(([s, p]) => `${s}  /  ${p}`) },
  'HOTLINE — opening line': { perFaction: true, lines: (f) => HOTLINE.map((l) => l.replace('⟨CODES⟩', f.codesHolder)) },
}
const TEXT_POOL_NAMES = Object.keys(TEXT_POOLS)

const textPoolVariant: VariantSpec = {
  defaults: { pool: TEXT_POOL_NAMES[0], faction: 'pk' },
  fields: (v) => {
    const fields: VField[] = [{ key: 'pool', label: 'POOL', kind: 'select', options: TEXT_POOL_NAMES.map((n) => ({ label: n, value: n })) }]
    if (TEXT_POOLS[v.pool as string]?.perFaction) fields.push({ key: 'faction', label: 'FACTION', kind: 'select', options: FACTION_OPTS })
    return fields
  },
  render: (v) => {
    const spec = TEXT_POOLS[v.pool as string] ?? TEXT_POOLS[TEXT_POOL_NAMES[0]]
    const f = factionOf(v.faction)
    const lines = spec.lines(f)
    const node = (
      <div className="screen" style={{ overflow: 'auto', alignItems: 'stretch' }}>
        <div className="banner">TEXT POOL — {v.pool}{spec.perFaction ? ` · ${f.name}` : ''}</div>
        <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 12 }}>
          {lines.map((l, i) => `${String(i + 1).padStart(2, ' ')}.  ${l}`).join('\n\n')}
        </pre>
      </div>
    )
    return { node, src: `${lines.length} lines${spec.perFaction ? ` for ${f.name}` : ''}.` }
  },
}

export function DevGallery() {
  const [sel, setSel] = useState(0)
  const noop = () => {}
  // Faithful mock state, built once from the real generators.
  const mock = useMemo(() => {
    const w = newWorld(makeRng(7)); w.playerId = 'pk'
    const p = w.powers['pk']; p.icept = 6            // ≥5 so INTERCEPT appears
    const pNoIcept = { ...p, icept: 2 }
    const realEv = rollWarning(w, p, makeRng(3), true)
    const falseEv = rollWarning(w, p, makeRng(4), false)
    return { w, p, pNoIcept, realEv, falseEv }
  }, [])
  const { p, pNoIcept, realEv, falseEv } = mock
  const city = realEv.targetCity
  const mkRes = (outcome: Resolution['outcome'], action: Action = 'standdown'): ResolutionEx =>
    ({ event: realEv, action, waitsUsed: 0, outcome, deadHandAnswered: outcome === 'exchange' })
  const tp: ThirdPartyEvent = { aggressorId: 'in', victimId: 'pk', isReal: true, vehicles: 3, windowMinutes: 4 }
  // 4020 s = 67 game-minutes on the blurred EXCHANGE clock (72 minus a
  // five-minute warning window already burned).
  const resProps = { seized: false, timedOut: false, onContinue: noop, onHoldChoice: noop, onEnd: noop, onCascade: noop, secondsLeft: 4020 }

  const ENTRIES: GalleryEntry[] = [
    { cat: 'SETUP', title: 'BOOT (title card)', k: 'boot',
      when: 'App launch, before anything else.',
      seq: 'render → screen.k "boot" → Boot.',
      src: 'Static title card.',
      node: <Boot onStart={noop} /> },
    { cat: 'SETUP', title: 'BRIEFING (faction select)', k: 'briefing',
      when: 'After boot; the player picks faction, clock speed, and seed.',
      seq: 'Boot onStart → screen.k "briefing" → Briefing.',
      src: 'faction/speed/seed ← local setup state.',
      node: <Briefing faction={FACTIONS[0]} setFaction={noop} speedId={'standard'} setSpeedId={noop} seedStr={'DEV-SEED'} setSeedStr={noop} focusId={null} setFocusId={noop} onBegin={noop} />,
      variant: briefingVariant },
    { cat: 'STRATEGIC', title: 'YEAR (strategic board)', k: 'year',
      when: 'Each year’s planning phase — the main board.',
      seq: 'begin() / next year → screen.k "year" → StrategicScreen.',
      src: 'w ← newWorld(); p ← w.powers[you].',
      node: <StrategicScreen w={mock.w} p={p} msgs={[]} focusId={null} onFocus={noop} onAction={noop} onEndYear={noop} tutorial={false} />,
      variant: yearVariant },
    { cat: 'STRATEGIC', title: 'INDICATION (⚠ ALERT flash)', k: 'indication',
      when: 'A strike is rolled at you; the board flashes ALERT before the warning modal opens.',
      seq: 'endYear → strike roll → screen.k "indication" → (brief) → screen.k "warning".',
      src: 'faction.name / faction.banner.',
      node: <IndicationScreen faction={p.f} />,
      variant: indicationVariant },

    { cat: 'WARNING', title: 'INDICATION — with INTERCEPT', k: 'warning',
      when: 'A real/false strike is rolled at you; you have interceptor coverage (icept ≥ 5).',
      seq: 'spend phase → advanceYear → strike roll (realStrikeOdds / falseAlarmOdds) → rollWarning() → setScreen("warning").',
      src: 'ev ← rollWarning(); INTERCEPT button shown because p.icept(6) ≥ 5; clock ← ticksLeft × TICK_MS.',
      node: <WarningModal p={p} ev={realEv} gameSecondsLeft={95} tokensLeft={p.f.deliberation} waitsUsed={0} reading={null} onLaunch={noop} onWait={noop} onStandDown={noop} onIntercept={noop} iceptCost={1} />,
      variant: warningVariant },
    { cat: 'WARNING', title: 'INDICATION — no INTERCEPT', k: 'warning',
      when: 'Same, but interceptor coverage is below the firing threshold (icept < 5).',
      seq: 'Identical to above; the INTERCEPT switch is simply omitted.',
      src: 'p.icept(2) < 5 → canIntercept false in WarningModal.',
      node: <WarningModal p={pNoIcept} ev={realEv} gameSecondsLeft={95} tokensLeft={p.f.deliberation} waitsUsed={1} reading={null} onLaunch={noop} onWait={noop} onStandDown={noop} onIntercept={noop} iceptCost={0} />,
      variant: warningVariant, variantDefaults: { coverage: 'uncovered' } },
    { cat: 'WARNING', title: 'THIRD PARTY — flash traffic', k: 'thirdparty',
      when: 'No strike hits you, but rollThirdParty() lights another power’s board.',
      seq: 'strike roll misses you → rollThirdParty() → setScreen("thirdparty").',
      src: 'tp ← rollThirdParty(): aggressorId/victimId/vehicles; clock ← ticksLeft.',
      node: <ThirdPartyScreen tp={tp} gameSecondsLeft={80} onIntervene={noop} />,
      variant: thirdPartyVariant },
    { cat: 'WARNING', title: 'THIRD PARTY — outcome', k: 'tpOutcome',
      when: 'You resolved a third-party crisis (intervened or not); the wire reports how it went.',
      seq: 'ThirdPartyScreen → choice → resolveThirdParty() → screen.k "tpOutcome".',
      src: 'outcome ← resolveThirdParty(w, ev, choice, you, rng); text + kind (hero/victim-launch/regional-war/defused/ghost-strike/escalation/contained).',
      node: <BulletinScreen outerClass="screen bigtext" banner={p.f.banner} text={'THE STRIKE WAS STOPPED.'}
        actions={skipOr('RESUME WATCH')} />,
      variant: tpOutcomeVariant },

    { cat: 'RESULT', title: 'NOTHING ARRIVED (false alarm held)', k: 'resolution',
      when: 'You stood down and the indication was false.',
      seq: 'WarningModal → standdown → resolve() → outcome "nothing" → ResolutionScreen.',
      src: 'res.event.causeIndex names the false cause; city (if shown) ← res.event.targetCity.',
      node: <ResolutionScreen p={p} res={{ ...mkRes('nothing'), event: falseEv }} {...resProps} />,
      variant: resolutionVariant, variantDefaults: { outcome: 'nothing' } },
    { cat: 'RESULT', title: 'ABSORBED (took it, survived)', k: 'resolution',
      when: 'A real strike landed and your second strike (surv ≥ 5) or CASD carried you through.',
      seq: 'WarningModal → standdown → resolve() → outcome "absorbed" → ResolutionScreen.',
      src: 'city struck ← loseCity() (recorded); res.event carries attacker/missile.',
      node: <ResolutionScreen p={p} res={mkRes('absorbed')} {...resProps} />,
      variant: resolutionVariant, variantDefaults: { outcome: 'absorbed' } },
    { cat: 'RESULT', title: 'DECAPITATED', k: 'resolution',
      when: 'A real strike landed, surv < 5, no dead hand — command is gone.',
      seq: 'WarningModal → standdown → resolve() → outcome "decapitated" → ResolutionScreen.',
      src: 'city ← loseCity(); attacker ← res.event.attackerName.',
      node: <ResolutionScreen p={p} res={mkRes('decapitated')} {...resProps} />,
      variant: resolutionVariant, variantDefaults: { outcome: 'decapitated' } },
    { cat: 'RESULT', title: 'FIRST STRIKE (you launched on a false alarm)', k: 'resolution',
      when: 'You launched, the indication was false, and the ghost you fired on keeps no dead hand — you started the war. (A Russia-shaped ghost answers via Perimetr: that is EXCHANGE.)',
      seq: 'WarningModal → launch → resolve() → outcome "first-strike" → ResolutionScreen.',
      src: 'apparentAttacker ← res.event.apparentAttacker; cause ← causeFor().',
      node: <ResolutionScreen p={p} res={{ ...mkRes('first-strike', 'launch'), event: falseEv }} {...resProps} />,
      variant: resolutionVariant, variantDefaults: { outcome: 'first-strike' } },
    { cat: 'RESULT', title: 'EXCHANGE', k: 'resolution',
      when: 'You launched on a real strike, or a dead-hand rival answered your first strike.',
      seq: 'WarningModal → launch → resolve() → outcome "exchange" → ResolutionScreen.',
      src: 'deadHandAnswered flag set when the target keeps a dead hand (Russia).',
      node: <ResolutionScreen p={p} res={mkRes('exchange', 'launch')} {...resProps} />,
      variant: resolutionVariant, variantDefaults: { outcome: 'exchange' } },
    { cat: 'RESULT', title: 'HOLD CHOICE (retaliate or hold)', k: 'holdChoice',
      when: 'You absorbed a strike, survived, and command is intact — retaliation is optional, no clock.',
      seq: 'ResolutionScreen (absorbed) → ASSESS → screen.k "holdChoice".',
      src: 'faction.banner.',
      node: <HoldChoiceScreen banner={p.f.banner} onRetaliate={noop} onHold={noop} />,
      variant: holdChoiceVariant },

    { cat: 'BULLETIN', title: 'NOTICE (overhang / ASI beats)', k: 'notice',
      when: 'A world milestone fires (an overhang, ASI containment, or the blackout).',
      seq: 'year advance → overhang/asi step pushes w.pendingNotices → screen.k "notice".',
      src: 'title/body ← world.ts NOTICES (5 fixed beats).',
      node: <BulletinScreen banner="BULLETIN" header={<pre className="glow" style={{ marginTop: 20 }}>{NOTICES['overhang-targeting'].title}</pre>}
        text={NOTICES['overhang-targeting'].body} teletypeStyle={{ marginTop: 12 }}
        actions={skipOr('ACKNOWLEDGE')} />,
      variant: noticeVariant },
    { cat: 'BULLETIN', title: 'TRIBUTE (compute levy)', k: 'tribute',
      when: 'A held ASI arsenal demands compute from you this year.',
      seq: 'year advance → demandTribute() sets w.pendingTribute → screen.k "tribute".',
      src: 'amount ← w.pendingTribute.amount = max(1, ceil(0.2 × income)).',
      node: <BulletinScreen banner="COMPUTE LEVY" text={tributeBody(3)} teletypeClass="glow" teletypeStyle={{ marginTop: 20 }}
        actions={(done, skip) => done ? (<div className="actions row"><button>PLEDGE ¤3</button><button>REFUSE — TAKE THE STRIKE</button></div>) : (<div className="actions narrow"><button onClick={skip}>SKIP</button></div>)} />,
      variant: tributeVariant },
    { cat: 'STRATEGIC', title: 'CASCADE (the ladder)', k: 'cascade',
      when: 'An exchange is underway; each rung you choose to fire, hold, or open a hotline.',
      seq: 'EXCHANGE result → startCascade() → initCascade() → screen.k "cascade"; each move → cascadeStep().',
      src: 'event ← cascadeStep(cs, p, move).text; rung ← cs.rung; cities popped from the adversary pool.',
      node: <CascadeScreen rung={1} event={'THE SALVO IS AWAY.'} secondsLeft={3240} commandVoice={p.f.commandVoice} onMove={noop} />,
      variant: cascadeVariant },

    { cat: 'BULLETIN', title: 'CRISIS (newswire + choices)', k: 'crisis',
      when: 'A crisis card turns (probability climbs with year + frontier); some cards offer choices.',
      seq: 'year advance → crisisStep() draws a card → makeCrisis() → screen.k "crisis".',
      src: 'card ← CRISES pool (12); body branches on player; dateline ← makeDateline(); followup ← applyCrisisChoice().',
      node: <BulletinScreen banner="CRISIS — TEHRAN" header={<pre className="dim newswire">REUTERS · TEHRAN · 12 MAR 2032 · 04:11 GMT · FLASH</pre>}
        text={'IRAN HAS CONDUCTED A TEST.'} teletypeClass="glow" teletypeStyle={{ marginTop: 10 }}
        actions={(done, skip) => (<div className="actions">{done ? <button>RESUME WATCH</button> : <button onClick={skip}>SKIP</button>}</div>)} />,
      variant: crisisVariant },
    { cat: 'BULLETIN', title: 'TRIBUTE STRIKE (you refused)', k: 'tributeStrike',
      when: 'You refused the levy; the held arsenal strikes — intercepted, or a city is lost.',
      seq: 'tribute → REFUSE → resolveTribute(false) → screen.k "tributeStrike" (intercepted?/city).',
      src: 'intercepted flag / city ← the strike resolution.',
      node: <BulletinScreen banner="STRIKE CONFIRMED" text={tributeStrikeBody(false, 'ISLAMABAD')} teletypeClass="glow" teletypeStyle={{ marginTop: 20 }}
        actions={skipOr('RESUME WATCH')} />,
      variant: tributeStrikeVariant },

    { cat: 'UN SECURITY COUNCIL', title: 'SANCTION — ordinary power condemned', k: 'sanction',
      when: 'You intercepted an incoming strike; the attacker is a named non-P5 power and you are NOT a pariah.',
      seq: 'WarningModal → intercept → resolve() → outcome "intercepted" → setScreen("sanction", aggressor, targetCity).',
      src: `aggressor ← ev.attackerName ("INDIA"); targetCity ← ev.targetCity ("${city}", derived in rollWarning from f.cities[(causeIndex+vehicles)%n]); shock line ← shockFor(); lobbying ← lobbyingFor().`,
      node: <UNSCScreen body={sanctionBody('INDIA', city, false, 3)} buttons={[{ label: 'RESUME WATCH', onClick: noop }]} />,
      variant: sanctionVariant, variantDefaults: { aggressor: 'INDIA', pariah: false } },
    { cat: 'UN SECURITY COUNCIL', title: 'SANCTION — P5 aggressor (self-veto)', k: 'sanction',
      when: 'Same, but the attacker is a permanent member (US/CN/RU/FR/UK).',
      seq: 'As above; the P5-name branch in sanctionBody() is taken.',
      src: `aggressor ← ev.attackerName ("CHINA"); targetCity ← ev.targetCity ("${city}").`,
      node: <UNSCScreen body={sanctionBody('CHINA', city, false, 3)} buttons={[{ label: 'RESUME WATCH', onClick: noop }]} />,
      variant: sanctionVariant, variantDefaults: { aggressor: 'CHINA', pariah: false } },
    { cat: 'UN SECURITY COUNCIL', title: 'SANCTION — non-state / unattributed', k: 'sanction',
      when: 'Same, but the warhead has no return address (attackerName resolves to NON-STATE ACTOR).',
      seq: 'As above; the non-state branch in sanctionBody() is taken.',
      src: `aggressor ← "NON-STATE ACTOR"; targetCity ← ev.targetCity ("${city}").`,
      node: <UNSCScreen body={sanctionBody('NON-STATE ACTOR', city, false, 3)} buttons={[{ label: 'RESUME WATCH', onClick: noop }]} />,
      variant: sanctionVariant, variantDefaults: { aggressor: 'NON-STATE ACTOR', pariah: false } },
    { cat: 'UN SECURITY COUNCIL', title: 'SANCTION — you are the PARIAH (cold shoulder)', k: 'sanction',
      when: 'Same intercepted strike, but w.pariah is true — the Council reads it as enforcement.',
      seq: 'As above; sanctionBody() pariah branch. The attacker takes NO legitimacy/sanction penalty (doResolution skips it when wNow.pariah).',
      src: `pariah ← w.pariah; targetCity ← ev.targetCity ("${city}"); no shock/lobbying pools used.`,
      node: <UNSCScreen body={sanctionBody('INDIA', city, true, 3)} buttons={[{ label: 'RESUME WATCH', onClick: noop }]} />,
      variant: sanctionVariant, variantDefaults: { aggressor: 'INDIA', pariah: true } },
    { cat: 'UN SECURITY COUNCIL', title: 'VOTE (you hold the veto)', k: 'vote',
      when: 'Another power faces seizure and you are the P5 member who can veto or abstain.',
      seq: 'year advance → pending vote set → screen.k "vote".',
      src: 'target ← w.pendingVote.targetId; you ← faction.name; applyVote() on choice.',
      node: <UNSCScreen body={voteBody('PAKISTAN', 'UNITED STATES')} buttons={[{ label: 'CAST THE VETO — THEY KEEP THE WEAPONS', onClick: noop }, { label: 'ABSTAIN — LET THE RESOLUTION PASS', onClick: noop }]} />,
      variant: voteVariant },
    { cat: 'UN SECURITY COUNCIL', title: 'SEIZURE (Resolution 9981)', k: 'unsc',
      when: 'Your legitimacy hit zero as a pariah and the Council took your arsenal.',
      seq: 'advanceYear → pariah/legitZero path → YearEnding "unsc" → setScreen("unsc").',
      src: 'faction.name printed; unanimous vote is fixed text.',
      node: <UNSCScreen body={`RESOLUTION 9981 — ADOPTED, UNANIMOUS:\n\nTHE ARSENAL OF PAKISTAN SHALL BE PLACED UNDER\nINTERNATIONAL CUSTODY, EFFECTIVE IMMEDIATELY.\n\nYOUR LEGITIMACY IS ZERO. NO ONE OBJECTED.`} buttons={[{ label: 'SURRENDER', onClick: noop }, { label: 'REFUSE', onClick: noop }]} />,
      variant: seizureVariant },

    { cat: 'ENDING', title: 'END OF WATCH (all outcomes)', k: 'ending',
      when: 'A run ends — one of 15 outcome kinds, each with its own debrief and assigned reading.',
      seq: 'terminal outcome → setScreen({ k: "ending", kind }) → Ending.',
      src: 'kind ∈ Object.keys(ENDING_TEXT) (15); text ← ENDING_TEXT[kind]; results/tpRecords/badges from the run (empty here).',
      node: <Ending kind={'survived'} w={mock.w} p={p} results={[]} tpRecords={[]} seedStr={'DEV-SEED'} newCommends={[]} newReps={[]} onReplay={noop} onReset={noop} />,
      variant: endingVariant },
    { cat: 'ENDING', title: 'THE HEROES (credits)', k: 'ending',
      when: 'Pops over End of Watch once the player has reached all 15 endings (any chair); reopenable after from the BADGES page, under the shelf.',
      seq: 'ending recorded → allEndingsSeen() true → CreditsOverlay over the End of Watch screen.',
      src: 'CREDITS list; completion ← gitl_endings localStorage shelf covering every ENDING_TEXT key.',
      node: <CreditsOverlay onClose={noop} /> },

    { cat: 'REFERENCE', title: 'TEXT POOLS (all flavor variants)', k: 'help',
      when: 'Reference: every rng-sampled flavor pool, listed end-to-end for review.',
      seq: 'Not an in-game screen — a catalog of the pools the game samples during play.',
      src: 'Each entry is the live array; per-faction pools take the FACTION control.',
      node: <div className="screen"><div className="banner">TEXT POOLS</div></div>,
      variant: textPoolVariant },
    { cat: 'REFERENCE', title: 'FIELD MANUAL (about / help)', k: 'help',
      when: 'Player opens help from the boot or briefing screen (⚙ / ?).',
      seq: 'setShowHelp(true) → HelpOverlay overlay.',
      src: 'Static content; seed line ← seedStr.',
      node: <HelpOverlay seedStr={null} onClose={noop} /> },
  ]

  const cur = ENTRIES[sel]
  const cats = [...new Set(ENTRIES.map((e) => e.cat))]
  // Per-entry variant state: { [entryIndex]: fieldValues }. Reset lazily.
  const [vvBy, setVvBy] = useState<Record<number, Record<string, string | boolean>>>({})
  const baseDefaults = cur.variant ? { ...cur.variant.defaults, ...(cur.variantDefaults ?? {}) } : null
  const vals = baseDefaults ? { ...baseDefaults, ...(vvBy[sel] ?? {}) } : null
  const varOut = cur.variant && vals ? cur.variant.render(vals) : null
  const setField = (key: string, value: string | boolean) =>
    setVvBy((prev) => ({ ...prev, [sel]: { ...baseDefaults, ...(prev[sel] ?? {}), [key]: value } }))
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'monospace', color: '#ffb000', background: '#0a0a0a' }}>
      <div style={{ width: 300, flex: '0 0 300px', overflowY: 'auto', borderRight: '1px solid #59400d', padding: 10, fontSize: 13 }}>
        <div style={{ letterSpacing: '0.2em', opacity: 0.7, marginBottom: 8 }}>SCREEN GALLERY · {ENTRIES.length}</div>
        {cats.map((c) => (
          <div key={c} style={{ marginBottom: 10 }}>
            <div style={{ opacity: 0.5, fontSize: 11, letterSpacing: '0.15em', margin: '6px 0 3px' }}>{c}</div>
            {ENTRIES.map((e, i) => e.cat === c && (
              <div key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer', padding: '3px 6px', background: i === sel ? '#ffb000' : 'transparent', color: i === sel ? '#0a0a0a' : '#ffb000' }}>{e.title}</div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 12, borderBottom: '1px solid #59400d', fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ letterSpacing: '0.15em', marginBottom: 6 }}>{cur.cat} · {cur.title}</div>
          <div><span style={{ opacity: 0.5 }}>WHEN&nbsp;&nbsp;&nbsp;&nbsp;</span>{varOut?.when ?? cur.when}</div>
          <div><span style={{ opacity: 0.5 }}>SEQUENCE</span> {varOut?.seq ?? cur.seq}</div>
          <div><span style={{ opacity: 0.5 }}>SOURCE&nbsp;&nbsp;</span> {varOut?.src ?? cur.src}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '10px 12px', borderBottom: '1px solid #59400d', fontSize: 12, minHeight: 20 }}>
          {!(cur.variant && vals) ? (
            <span style={{ opacity: 0.35, letterSpacing: '0.1em' }}>— NO VARIABLE FIELDS ON THIS SCREEN —</span>
          ) : (
            cur.variant.fields(vals).map((f) => (
              <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ opacity: 0.5, letterSpacing: '0.1em' }}>{f.label}</span>
                {f.kind === 'toggle' ? (
                  <button onClick={() => setField(f.key, !vals[f.key])}
                    style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 10px', cursor: 'pointer', background: vals[f.key] ? '#ffb000' : 'transparent', color: vals[f.key] ? '#0a0a0a' : '#ffb000', border: '1px solid #59400d' }}>
                    {vals[f.key] ? 'ON' : 'OFF'}
                  </button>
                ) : (
                  <select value={String(vals[f.key])} onChange={(e) => setField(f.key, e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 6px', background: '#0a0a0a', color: '#ffb000', border: '1px solid #59400d' }}>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </label>
            ))
          )}
        </div>
        {/* CRT context WITHOUT .bezel (which is position:fixed and would cover
            the sidebar) — a plain flex frame the .crt can fill and scroll in */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', background: '#000', padding: 14, position: 'relative', overflow: 'auto' }}>
          <div className={`crt${screenIsRed(cur.k) ? ' red' : ''}`}>{varOut?.node ?? cur.node}</div>
        </div>
      </div>
    </div>
  )
}
