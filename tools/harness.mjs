// Headless playtest harness: plays the SAME year loop the UI plays.
//   spend → advanceYear → vote/crisis → strike roll → warning → resolve →
//   retaliate/hold → cascade → next year.
// Policies are player archetypes. Adversarial ones exist to break things, not
// to win. Usage: npx tsx tools/harness.mjs [runs-per-cell]

import {
  newWorld, advanceYear, applyPlayerAction, applyCrisisChoice, applyVote,
  income, asiHeldEnding, applyStrikeDamage, startAsIran, costFor, ACTIONS,
} from '../src/rules/world.ts'
import { rollWarning, resolve, realStrikeOdds, falseAlarmOdds } from '../src/rules/warning.ts'
import { initCascade, cascadeStep } from '../src/rules/cascade.ts'
import { rollThirdParty, resolveThirdParty } from '../src/rules/thirdparty.ts'
import { causeFor } from '../src/data/incidents.ts'
import { assignedReading } from '../src/rules/readings.ts'
import { makeRng } from '../src/sim/rng.ts'
import { FACTIONS } from '../src/sim/factions.ts'

// ——— policies: what to buy, and how to answer the screen ———
// buy: ordered wish-list, tried in order each year until the budget runs out.
// warn: how this player answers an indication.
const POLICIES = {
  // ordinary archetypes
  steward:    { buy: ['assure', 'nc3', 'diplo', 'harden'],            warn: 'careful' },
  // THE PIVOT: build the export economy early, then spend the whole of it on
  // assurance and diplomacy for the back half. The obvious human strategy, and
  // the one nobody had tested.
  pivot:      { buy: (yr) => yr < 7
                  ? ['markets', 'markets', 'nc3']
                  : ['assure', 'assure', 'diplo', 'nc3'],             warn: 'careful' },
  // THE HEDGER: build the economy but never stop working the room, then spend
  // the whole of it on the treaty regime and assurance.
  hedger:     { buy: (yr) => yr < 8
                  ? ['markets', 'diplo', 'harden']
                  : ['negotiate', 'assure', 'assure', 'diplo'],       warn: 'careful' },
  racer:      { buy: ['integrate', 'integrate', 'cyber', 'harden'],   warn: 'trusting' },
  disarmer:   { buy: ['negotiate', 'diplo', 'assure'],                warn: 'careful' },
  hairtrigger:{ buy: ['harden', 'icept', 'integrate'],                warn: 'trigger' },
  intervener: { buy: ['icept', 'harden', 'diplo'],                    warn: 'careful' },
  // THE REACTIVE PLAYER (what a person actually does): a few data centers,
  // interceptors, and treaties early; then pivot the whole economy to assurance,
  // diplomacy, and more treaties for the back half.
  reactive:   { buy: (yr) => yr < 7
                  ? ['markets', 'markets', 'tacstrike', 'icept', 'negotiate']
                  : ['assure', 'assure', 'tacstrike', 'diplo', 'negotiate'], warn: 'careful' },
  idle:       { buy: [],                                              warn: 'careful' },
  // PK-optimal: race to survivable second strike (harden×2 → surv 6), then NC3
  // for a truer first poll, then work the room. The skilled Pakistan line.
  bunker:     { buy: (yr) => yr < 4
                  ? ['harden', 'harden', 'tacstrike', 'nc3', 'diplo']
                  : ['tacstrike', 'nc3', 'diplo', 'assure', 'icept'], warn: 'careful' },
  // AEGIS: race interceptors to the shield threshold (icept ≥ 5), then shoot
  // incoming down instead of absorbing it. Tests whether cheap interceptors
  // make a defensive Pakistan viable.
  aegis:      { buy: (yr) => yr < 6
                  ? ['icept', 'icept', 'nc3', 'diplo']
                  : ['diplo', 'assure', 'harden', 'icept'],           warn: 'shield' },
  // ADVERSARIAL: not strategies, stress tests
  rogue:      { buy: ['cyber', 'cybernc3', 'integrate'],              warn: 'trigger' },  // burn standing + control
  cheat:      { buy: ['negotiate', 'defect', 'integrate', 'cyber'],   warn: 'trusting' }, // sign it, then break it
  twitchy:    { buy: ['integrate', 'integrate', 'integrate'],         warn: 'trigger' },  // rung 10 speedrun
  doomsday:   { buy: ['integrate', 'cybernc3', 'cyber', 'cyber'],     warn: 'launch' },   // launch on everything
  ostrich:    { buy: ['markets', 'markets', 'cyber'],                 warn: 'ignore' },   // never respond at all
}

// ——— TEN PROBES: each tests one hypothesis about the game ———
const PROBES = {
  // 1. Can you survive purely by being unhittable? (the game says no)
  turtle:     { buy: ['icept', 'icept', 'harden', 'counter'],        warn: 'shield' },
  // 2. Race the AI AND fund safety in the same year — can assurance keep up?
  brinkman:   { buy: ['integrate', 'assure', 'assure'],              warn: 'careful' },
  // 3. Negotiate every year. Does treaty-maxing reach zero, or just make crises?
  peacemaker: { buy: ['negotiate', 'negotiate', 'diplo'],            warn: 'careful' },
  // 4. How a person actually plays reactive: grow income early, but never let
  //    tension or legitimacy leave a safe band, and buy safety only once the
  //    engine is running. Priorities in order, spend until broke.
  adaptive:   { buy: (y, w, me) => {
                  const out = []
                  if (w.tension > 6.5) out.push('tacstrike', 'diplo')  // put the fire out first (PK: tactical answer)
                  if (me.legit < 3) out.push('diplo')                 // stay in the room
                  if (w.humanControl < 55) out.push('assure', 'assure') // only when it's really slipping
                  if (y < 10 && w.tension < 5) out.push('markets', 'markets') // grow while it's calm
                  out.push('assure', 'nc3')                            // bank safety with the surplus
                  return out
                },                                                    warn: 'careful' },
  // 5 & 6. The patron's vote: always shield the client vs always sell them out.
  loyalist:   { buy: ['assure', 'diplo', 'nc3'], vote: 'veto',       warn: 'careful' },
  betrayer:   { buy: ['assure', 'diplo', 'nc3'], vote: 'abstain',    warn: 'careful' },
  // 7. Buy time instead of weapons: de-alert the clock, work the phone.
  dovish:     { buy: ['dealert', 'dealert', 'diplo', 'assure'],      warn: 'careful' },
  // 8. Classic minimum deterrence: unstrikeable second strike, no AI at all.
  deterrer:   { buy: ['harden', 'counter', 'counter', 'icept'],      warn: 'careful' },
  // 9. Pure soft power: economy + diplomacy, never a weapon, never a launch.
  appeaser:   { buy: ['markets', 'diplo', 'diplo'],                  warn: 'dove' },
  // 10. Reach containment: let the WORLD's frontier spawn the ASI (don't
  //     integrate yourself to rung-10 hostage first), then pledge CONTAIN
  //     every year and see if the three-power pool ever forms.
  container:  { buy: (y, w, me) => w.asi ? ['contain', 'contain', 'diplo'] : ['markets', 'nc3', 'diplo'],
                                                                     warn: 'careful' },
}
Object.assign(POLICIES, PROBES)

// mirror of the UI's name→id resolver (App.tsx): alias + prefix, not just ===.
// 'RUSSIAN FEDERATION' / 'IRAN' / 'NON-STATE ACTOR' must resolve or the aggressor
// never loses standing and never gets retaliated against.
function factionIdByName(n) {
  if (!n) return undefined
  if (n === 'IRAN') return 'iran'
  return FACTIONS.find((f) => n === f.name || n.startsWith(f.name) || f.name.startsWith(n))?.id
}

// A cascade is a mix of moves inside a 72-game-minute budget, not one move
// twelve times. Aggressive chairs keep firing; careful/defensive chairs work
// the phone and hold the rung — the only path that builds toward a ceasefire.
function cascadeMove(warn, rng) {
  if (warn === 'trigger' || warn === 'launch') return 'fire'
  return rng() < 0.5 ? 'hotline' : 'hold'
}

function answer(policy, ev, waits, me) {
  const tokens = me.f.deliberation
  // Once you've waited, you're reading the re-poll tape, not the AI gloss. The
  // gloss is worst exactly where AI is deepest in the loop, so re-polling helps
  // the integrated chairs most — the whole point of WAIT.
  const c = waits > 0
    ? (ev.waitReadings[Math.min(waits - 1, ev.waitReadings.length - 1)] ?? ev.displayedConfidence)
    : (ev.displayedConfidence ?? 0.5)
  switch (policy) {
    case 'careful':  return waits < tokens ? 'wait' : (c > 0.9 ? 'launch' : 'standdown')
    // shield: if you have interceptor coverage, shoot it down rather than launch
    case 'shield':   return me.icept >= 5 ? 'intercept'
                            : waits < tokens ? 'wait' : (c > 0.9 ? 'launch' : 'standdown')
    case 'trusting': return c > 0.6 ? 'launch' : 'standdown'
    case 'trigger':  return c > 0.45 ? 'launch' : 'wait'
    case 'launch':   return 'launch'
    case 'dove':     return 'standdown'
    case 'ignore':   return 'timeout'
    default:         return 'standdown'
  }
}

// The whole warning→resolve→retaliate→cascade path, factored so the third-party
// ESCALATION branch (your conventional strike read as decapitation → a real
// indication now aimed at YOU) resolves through the identical code. Returns an
// ending kind, or null if the alarm passes and the watch continues.
function resolveWarning(w, fid, pol, ev, rng, diag) {
  const me = w.powers[fid]
  let waits = 0
  let act = answer(pol.warn, ev, waits, me)
  while (act === 'wait' && waits < me.f.deliberation) { waits += 1; act = answer(pol.warn, ev, waits, me) }
  // NFU legit collapse on first release (UI act()): the pledge is spent for good
  if (act === 'launch' && me.f.flags.nfu && !me.nfuBroken) { me.nfuBroken = true; me.legit = 0 }
  const seized = w.asi?.arsenalsHeld.includes(fid) ?? false
  const res = resolve(me, ev, act, waits, seized, rng)
  if (diag) {
    const wr = ev.waitReadings ?? []
    // The diegetic cause the operator is handed — the "assigned reading". Real
    // strikes show no cause; only false alarms get a named explanation. Trim the
    // sentence to its first clause for a short tag.
    const cause = ev.isReal ? null : causeFor(fid, ev.causeIndex ?? 0).cause.split(/[,.]/)[0].trim()
    diag.warnings.push({
      isReal: ev.isReal,
      disp: ev.displayedConfidence ?? 0,          // the confidence the screen shows
      tru: ev.trueConfidence ?? 0,
      stuck: wr.length >= 3 && wr[0] === wr[1] && wr[1] === wr[2], // stuck-tape tell
      window: ev.windowMinutes,
      cause,                                       // the named reading (false alarms only)
      deadHandAnswered: !!res.deadHandAnswered,     // first strike on a dead-hand rival
      exhausted: me.f.deliberation > 0 && waits >= me.f.deliberation, // spent every WAIT token
      waits, act, outcome: res.outcome, seized,
    })
  }
  if (res.outcome === 'absorbed' || res.outcome === 'decapitated' || res.outcome === 'deadhand') applyStrikeDamage(me)
  // The releaser loses standing on any real inbound (UI App.tsx:570) — exact
  // name match, as the UI does it there.
  const REAL_INBOUND = ['intercepted', 'absorbed', 'decapitated', 'deadhand', 'exchange']
  if (REAL_INBOUND.includes(res.outcome) && ev.attackerName) {
    const aggrP = Object.values(w.powers).find((q) => q.f.name === ev.attackerName)
    if (aggrP && aggrP.f.id !== fid) aggrP.legit = Math.max(0, aggrP.legit - 3)
  }
  if (res.outcome === 'first-strike') return 'first-strike'
  if (res.outcome === 'decapitated') return 'decapitated'
  if (res.outcome === 'deadhand') return 'deadhand'
  if (res.outcome === 'exchange') return 'exchange'
  if (res.outcome === 'absorbed') {
    const hitsBack = (pol.warn === 'trigger' || pol.warn === 'launch' || pol.warn === 'trusting') ? true
      : (pol.warn === 'dove' || pol.warn === 'ignore') ? false
      : rng() < 0.3   // careful / shield sometimes answer, sometimes take the pedestal
    if (!hitsBack) {
      // Held fire — the pedestal (UI continueShift): legitimacy vaults to 15
      // unless you are the pariah; tension +2 either way.
      w.tension = Math.min(10, w.tension + 2)
      if (!w.heldRestraint.includes(fid)) w.heldRestraint.push(fid)
      if (!w.pariah) me.legit = 15
      return null
    }
    // Retaliate: the attacker's interceptors may catch the answer (UI retaliate)
    const aid = factionIdByName(ev.attackerName)
    const ap = aid ? w.powers[aid] : undefined
    if (ap && ap.icept > 0 && rng() < Math.min(0.9, ap.icept / 10)) return 'retaliated'
    const cs = initCascade(me, ev.attackerName || ev.apparentAttacker || me.f.rival)
    let mins = 72
    while (mins > 0) {
      const r = cascadeStep(cs, me, cascadeMove(pol.warn, rng), rng)
      mins -= r.minutesBurned
      if (r.done === 'ceasefire') return 'ceasefire'
      if (r.done === 'exchange') return 'exchange'
    }
    return 'exchange'
  }
  // nothing / impotent / intercepted / intercept-gag → the alarm passes
  return null
}

function playOne(fid, polName, seed) {
  const pol = POLICIES[polName]
  const rng = makeRng(seed)
  const w = newWorld(rng)
  w.playerId = fid
  if (fid === 'iran') startAsIran(w)
  const me = () => w.powers[fid]
  const diag = { warnings: [], ev: { real: 0, false: 0, tp: 0, quiet: 0 }, buys: {} }
  const end = (kind) => ({
    kind, fid, pol: polName, year: w.year, pariah: w.pariah,
    hc: w.humanControl, tension: w.tension, frontier: w.frontier,
    treatyRung: w.treatyRung, asi: !!w.asi, legit: me().legit,
    warnings: diag.warnings, evc: diag.ev, buys: diag.buys, seed,
  })

  for (let year = 0; year < 20; year++) {
    w.year = year   // the UI bumps w.year between years; the harness must too, or
                    // every year-gated rule (NFU, embargo lapse, the clock) freezes at 0
    // ——— spend ———
    me().budget += income(me(), w)
    const wish = typeof pol.buy === 'function' ? pol.buy(year, w, me()) : pol.buy
    for (const id of wish) {
      const a = ACTIONS.find((x) => x.id === id)
      if (a && me().budget >= costFor(id, me(), w) && a.available(me(), w)) {
        applyPlayerAction(w, fid, id, rng)
        diag.buys[id] = (diag.buys[id] ?? 0) + 1
      }
    }

    // ——— the world moves ———
    const ye = advanceYear(w, fid, rng)
    if (ye === 'unsc') return end(rng() < 0.5 ? 'surrender' : 'defiance')
    if (ye) return end(ye)

    // The vote resolves on its own screen; the UI does NOT roll a strike that
    // turn. Skip straight to next year.
    if (w.pendingVote) {
      applyVote(w, fid, pol.vote === 'veto' ? true : pol.vote === 'abstain' ? false : rng() < 0.5)
      w.pendingCrisis = null; w.pendingTribute = null; w.pendingNotices = []
      continue
    }
    if (w.pendingCrisis) {
      // some crises are bulletins with no choices at all
      const ch = w.pendingCrisis.choices
      applyCrisisChoice(w, fid, ch?.length ? ch[Math.floor(rng() * ch.length)].id : '', rng)
    }
    // The compute levy (UI resolveTribute): pay it down, or refuse and let the
    // held arsenal fire — YOUR own interceptors are the only thing between you
    // and a lost city.
    if (w.pendingTribute) {
      const amount = w.pendingTribute.amount ?? 0
      w.pendingTribute = null
      const pledge = me().budget >= amount && pol.warn !== 'trigger' && pol.warn !== 'launch' && pol.warn !== 'ignore'
      if (pledge) {
        me().budget = Math.max(0, me().budget - amount)
      } else if (rng() < Math.min(0.99, me().icept / 10)) {
        // refused, and your interceptors caught the held arsenal
      } else {
        applyStrikeDamage(me()); w.heldFired = true
      }
    }
    w.pendingNotices = []

    // ——— does anything arrive? ———
    let real = w.pariah || rng() < realStrikeOdds(w, me())
    if (w.forcedStrikes > 0) { real = true; w.forcedStrikes -= 1; w.forcedAttackerName = 'ISRAEL' }
    const falseAlarm = !real && rng() < falseAlarmOdds(w, me())

    if (real || falseAlarm) {
      if (real) diag.ev.real += 1; else diag.ev.false += 1
      const ev = rollWarning(w, me(), rng, real)
      const k = resolveWarning(w, fid, pol, ev, rng, diag)
      if (k) return end(k)
    } else {
      const tp = rollThirdParty(w, fid, rng)
      if (tp) diag.ev.tp += 1; else diag.ev.quiet += 1
      if (tp) {
        // Only an intervener actually steps in; everyone else watches. A nuclear
        // intervention is its own ending; conventional runs the real subsystem.
        let choice = 'nothing'
        if (polName === 'intervener') choice = rng() < 0.35 ? 'nuclear' : 'conventional'
        if (choice === 'nuclear') return end('intervene')
        const o = resolveThirdParty(w, tp, choice, fid, rng)
        if (o.kind === 'victim-launch' || o.kind === 'regional-war') return end('bystander')
        if (o.kind === 'escalation') {
          // Your strike read as decapitation — a real indication now aims at you
          // (UI escalateToWarning).
          const ev = rollWarning(w, me(), rng, true)
          ev.trueConfidence = 0.93
          if (!me().aiIntegrated) ev.displayedConfidence = 0.91 + rng() * 0.07
          ev.waitReadings = ev.waitReadings.map(() => 0.9 + rng() * 0.08)
          const k = resolveWarning(w, fid, pol, ev, rng, diag)
          if (k) return end(k)
        }
        // defused / ghost-strike / hero / contained → the watch continues
      }
    }
  }
  return end(asiHeldEnding(w) ?? 'survived')
}

// ——— run ———
const RUNS = Number(process.argv[2] ?? 60)
const ORDINARY = (process.env.ONLY ? process.env.ONLY.split(',') : ['reactive', 'steward', 'pivot', 'hedger', 'racer', 'disarmer', 'hairtrigger', 'intervener', 'idle'])
const ADVERSARIAL = (process.env.ONLY ? [] : ['rogue', 'cheat', 'twitchy', 'doomsday', 'ostrich'])
const PROBE_NAMES = process.env.ONLY ? [] : Object.keys(PROBES)
const ids = FACTIONS.map((f) => f.id).concat('iran')
const SURV = new Set(['survived', 'globalzero', 'ceasefire'])   // the "won the watch" endings
const ALL = ['survived', 'globalzero', 'ceasefire', 'exchange', 'first-strike', 'decapitated', 'deadhand',
  'retaliated', 'hostage', 'battery', 'caretaker', 'surrender', 'defiance', 'intervene', 'bystander']
const pct = (n, d) => d ? (100 * n / d).toFixed(1).padStart(5) : '  0.0'
const bar = (n, d, w = 44) => '█'.repeat(Math.round(w * (d ? n / d : 0)))
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

// Play every (policy × chair × seed) cell and keep the full per-run record.
function collect(policies) {
  const recs = []
  let crashes = 0
  for (const pol of policies)
    for (const fid of ids)
      for (let s = 0; s < RUNS; s++) {
        try { recs.push(playOne(fid, pol, s * 977 + 13)) }
        catch (e) { crashes++; console.error(`CRASH ${fid}/${pol}/${s}: ${e.message}`) }
      }
  return { recs, crashes }
}

// —— ending distribution for a set of runs ——
function endingDist(recs, title) {
  const tally = {}
  for (const r of recs) tally[r.kind] = (tally[r.kind] ?? 0) + 1
  const total = recs.length
  console.log(`\n=== ${title} — ${total} games ===`)
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(13)} ${String(n).padStart(5)}  ${pct(n, total)}%  ${bar(n, total)}`)
  return tally
}

// —— per-policy: survival, mean survival year, top-3 endings ——
function byPolicy(recs, policies) {
  console.log(`  ${'—'.repeat(66)}`)
  console.log(`  ${'policy'.padEnd(12)} ${'surv%'.padStart(5)} ${'yr'.padStart(4)}   top endings`)
  for (const pol of policies) {
    const rs = recs.filter((r) => r.pol === pol)
    if (!rs.length) continue
    const t = {}
    for (const r of rs) t[r.kind] = (t[r.kind] ?? 0) + 1
    const surv = rs.filter((r) => SURV.has(r.kind)).length / rs.length
    const yr = mean(rs.map((r) => r.year))
    const top = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${Math.round(100 * v / rs.length)}%`).join(', ')
    console.log(`  ${pol.padEnd(12)} ${(100 * surv).toFixed(0).padStart(4)}% ${yr.toFixed(1).padStart(4)}   ${top}`)
  }
}

// —— per-chair (country): survival + most common ending ——
function byChair(recs) {
  console.log(`\n=== BY CHAIR (country) — all policies pooled ===`)
  console.log(`  ${'chair'.padEnd(6)} ${'n'.padStart(5)} ${'surv%'.padStart(6)} ${'exch%'.padStart(6)} ${'pariah%'.padStart(7)}  most common ending`)
  for (const fid of ids) {
    const rs = recs.filter((r) => r.fid === fid)
    if (!rs.length) continue
    const t = {}
    for (const r of rs) t[r.kind] = (t[r.kind] ?? 0) + 1
    const surv = rs.filter((r) => SURV.has(r.kind)).length
    const exch = rs.filter((r) => r.kind === 'exchange').length
    const par = rs.filter((r) => r.pariah).length
    const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0]
    console.log(`  ${fid.padEnd(6)} ${String(rs.length).padStart(5)} ${pct(surv, rs.length)}% ${pct(exch, rs.length)}% ${pct(par, rs.length)}%  ${top[0]} ${Math.round(100 * top[1] / rs.length)}%`)
  }
}

// —— ending × chair matrix: % of each chair's games ending each way ——
function endingMatrix(recs, title) {
  const byfid = {}
  for (const fid of ids) byfid[fid] = recs.filter((r) => r.fid === fid)
  const tot = {}
  for (const r of recs) tot[r.kind] = (tot[r.kind] ?? 0) + 1
  const kinds = Object.keys(tot).sort((a, b) => tot[b] - tot[a])
  console.log(`\n=== ENDING × CHAIR (${title}) — % of each chair's games ===`)
  console.log(`  ${'ending'.padEnd(13)}${ids.map((f) => f.padStart(6)).join('')}${'ALL'.padStart(7)}`)
  for (const k of kinds) {
    const cells = ids.map((fid) => {
      const rs = byfid[fid]
      return (rs.length ? (100 * rs.filter((r) => r.kind === k).length / rs.length).toFixed(1) : '0.0').padStart(6)
    })
    console.log(`  ${k.padEnd(13)}${cells.join('')}${(100 * tot[k] / recs.length).toFixed(1).padStart(7)}`)
  }
  console.log(`  ${'n'.padEnd(13)}${ids.map((fid) => String(byfid[fid].length).padStart(6)).join('')}${String(recs.length).padStart(7)}`)
}

// —— full ending histogram for every chair ——
function chairEndingHists(recs) {
  console.log(`\n=== ENDING HISTOGRAM — per chair ===`)
  for (const fid of ids) {
    const rs = recs.filter((r) => r.fid === fid)
    if (!rs.length) continue
    const t = {}
    for (const r of rs) t[r.kind] = (t[r.kind] ?? 0) + 1
    console.log(`\n  ${fid.toUpperCase().padEnd(5)} — ${rs.length} games`)
    for (const [k, n] of Object.entries(t).sort((a, b) => b[1] - a[1]))
      console.log(`    ${k.padEnd(13)} ${String(n).padStart(4)}  ${pct(n, rs.length)}%  ${bar(n, rs.length, 40)}`)
  }
}

// —— the END OF WATCH assigned reading (real books/papers), by title ——
// Each watch is served READING_COUNT titles from its ending's pool, rotated by
// the seed. This is the exact code the debrief screen runs.
function assignedReadingHist(recs) {
  const tally = {}
  let served = 0
  for (const r of recs) {
    const patientHolds = r.warnings.filter((w) => w.exhausted).length
    // The game rotates the pool by a 32-bit STRING hash → uniform roll. Our
    // seeds are small integers, so hash them the same way or every run reads
    // only pool positions 0–1 and the distribution is a lie.
    const roll = ((r.seed * 2654435761) >>> 0) / 2 ** 32
    for (const title of assignedReading(r.kind, patientHolds, roll).split(' · ')) {
      tally[title] = (tally[title] ?? 0) + 1
      served++
    }
  }
  console.log(`\n=== ASSIGNED READING (END OF WATCH homework) — ${served} titles served across ${recs.length} watches ===`)
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
    console.log(`  ${(k.length > 48 ? k.slice(0, 47) + '…' : k).padEnd(49)} ${String(n).padStart(5)}  ${pct(n, served)}%  ${bar(n, served, 26)}`)
}

// —— policy × chair survival heatmap ——
function heatmap(recs, policies) {
  console.log(`\n=== SURVIVAL HEATMAP (survived-ish %) — policy × chair ===`)
  console.log(`  ${''.padEnd(12)}${ids.map((f) => f.padStart(5)).join('')}`)
  for (const pol of policies) {
    const cells = ids.map((fid) => {
      const rs = recs.filter((r) => r.pol === pol && r.fid === fid)
      if (!rs.length) return '    ·'
      return String(Math.round(100 * rs.filter((r) => SURV.has(r.kind)).length / rs.length)).padStart(5)
    })
    console.log(`  ${pol.padEnd(12)}${cells.join('')}`)
  }
}

// —— warning / assigned-reading diagnostics: the sensor's honesty ——
function readingDiag(recs) {
  const warns = recs.flatMap((r) => r.warnings)
  const reals = warns.filter((w) => w.isReal)
  const falses = warns.filter((w) => !w.isReal)
  const stuck = warns.filter((w) => w.stuck)
  console.log(`\n=== WARNING & ASSIGNED-READING DIAGNOSTICS — ${warns.length} indications shown ===`)
  console.log(`  real strikes ${reals.length} (${pct(reals.length, warns.length)}%)   false alarms ${falses.length} (${pct(falses.length, warns.length)}%)   stuck-tape ${stuck.length} (${pct(stuck.length, warns.length)}%)`)

  // assigned-reading histogram: what confidence the screen SHOWS, real vs false.
  // A well-formed sensor shows real strikes high and false alarms low; overlap
  // is the whole danger. Bins of 0.1.
  const bins = Array.from({ length: 10 }, () => ({ real: 0, false: 0 }))
  for (const w of warns) {
    const b = Math.min(9, Math.max(0, Math.floor((w.disp ?? 0) * 10)))
    bins[b][w.isReal ? 'real' : 'false'] += 1
  }
  console.log(`  assigned reading (displayedConfidence)   REAL ▓   FALSE ░`)
  for (let i = 0; i < 10; i++) {
    const lo = (i / 10).toFixed(1)
    const b = bins[i]
    console.log(`   ${lo}-${((i + 1) / 10).toFixed(1)}  R${String(b.real).padStart(4)} F${String(b.false).padStart(4)}  ${'▓'.repeat(Math.round(40 * b.real / warns.length))}${'░'.repeat(Math.round(40 * b.false / warns.length))}`)
  }
  // calibration: at a high displayed reading, how often is it actually real?
  const hi = warns.filter((w) => w.disp > 0.9)
  const hiReal = hi.filter((w) => w.isReal).length
  const realShownHi = reals.filter((w) => w.disp > 0.9).length
  const falseShownHi = falses.filter((w) => w.disp > 0.9).length
  console.log(`  at reading > 0.9:  ${hi.length} shown, ${pct(hiReal, hi.length)}% truly real (positive predictive value)`)
  console.log(`  sensitivity: ${pct(realShownHi, reals.length)}% of REAL strikes were shown > 0.9`)
  console.log(`  false-high:  ${pct(falseShownHi, falses.length)}% of FALSE alarms were shown > 0.9  (these bait a first strike)`)

  // what players DID with the readings, and how it went
  const acts = {}
  for (const w of warns) acts[w.act] = (acts[w.act] ?? 0) + 1
  console.log(`  action taken: ${Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, warns.length)}%`).join('  ')}`)
  const launchFalse = falses.filter((w) => w.act === 'launch').length
  const missReal = reals.filter((w) => w.act === 'standdown' || w.act === 'timeout').length
  console.log(`  launched on a FALSE alarm: ${launchFalse} (${pct(launchFalse, falses.length)}% of false alarms → self-started war)`)
  console.log(`  stood down on a REAL strike: ${missReal} (${pct(missReal, reals.length)}% of real strikes absorbed unanswered)`)
  console.log(`  mean waits before deciding: ${mean(warns.map((w) => w.waits)).toFixed(2)}`)
}

// —— end-of-game world state, per policy: where the knobs settle ——
function worldStats(recs, policies) {
  console.log(`\n=== WORLD STATE AT GAME END — per policy ===`)
  console.log(`  ${'policy'.padEnd(12)} ${'HC'.padStart(5)} ${'tens'.padStart(5)} ${'front'.padStart(6)} ${'treaty'.padStart(6)} ${'asi%'.padStart(5)} ${'legit'.padStart(6)}`)
  for (const pol of policies) {
    const rs = recs.filter((r) => r.pol === pol)
    if (!rs.length) continue
    console.log(`  ${pol.padEnd(12)} ${mean(rs.map((r) => r.hc)).toFixed(0).padStart(5)} ${mean(rs.map((r) => r.tension)).toFixed(1).padStart(5)} ${mean(rs.map((r) => r.frontier)).toFixed(1).padStart(6)} ${mean(rs.map((r) => r.treatyRung)).toFixed(1).padStart(6)} ${(100 * rs.filter((r) => r.asi).length / rs.length).toFixed(0).padStart(4)}% ${mean(rs.map((r) => r.legit)).toFixed(1).padStart(6)}`)
  }
}

const CELLS = [
  { name: 'STANDARD PLAY', policies: ORDINARY },
  { name: 'ADVERSARIAL PLAY', policies: ADVERSARIAL },
  { name: 'PROBES', policies: PROBE_NAMES },
].filter((c) => c.policies.length)

let allRecs = []
let totalCrashes = 0
for (const cell of CELLS) {
  const { recs, crashes } = collect(cell.policies)
  totalCrashes += crashes
  allRecs = allRecs.concat(recs)
  endingDist(recs, cell.name)
  byPolicy(recs, cell.policies)
  worldStats(recs, cell.policies)
  heatmap(recs, cell.policies)
  if (cell.name === 'STANDARD PLAY') endingMatrix(recs, cell.name)
}

// —— the dead-hand flip: how often a first strike on a dead-hand rival answers ——
function deadHandStat(recs) {
  const warns = recs.flatMap((r) => r.warnings)
  const answered = warns.filter((w) => w.deadHandAnswered).length
  const firstStrikeAttempts = warns.filter((w) => !w.isReal && w.act === 'launch').length
  const western = recs.filter((r) => ['us', 'uk', 'fr'].includes(r.fid))
  const westernGames = western.length
  const westernAnswered = western.filter((r) => r.warnings.some((w) => w.deadHandAnswered)).length
  console.log(`\n=== DEAD HAND ANSWERS A FIRST STRIKE ===`)
  console.log(`  ${answered} of ${firstStrikeAttempts} launches-on-false-alarm hit a dead-hand rival (${pct(answered, firstStrikeAttempts)}% of first strikes answered)`)
  console.log(`  affected ${westernAnswered} of ${westernGames} US/UK/FR watches (${pct(westernAnswered, westernGames)}%) — the only chairs that rival Russia`)
  console.log(`  across ALL ${recs.length} watches: ${pct(westernAnswered, recs.length)}%`)
  // DELIBERATIVE commendation / survived-patient reading: exhausted every WAIT
  // token on ≥2 warnings.
  const patient = recs.filter((r) => r.warnings.filter((w) => w.exhausted).length >= 2)
  const survivors = recs.filter((r) => SURV.has(r.kind))
  const patientSurv = survivors.filter((r) => r.warnings.filter((w) => w.exhausted).length >= 2)
  console.log(`  DELIBERATIVE (≥2 exhausted holds): ${pct(patient.length, recs.length)}% of all watches, ${pct(patientSurv.length, survivors.length)}% of survivors`)
}

// —— pooled diagnostics across every run ——
deadHandStat(allRecs)
byChair(allRecs)
chairEndingHists(allRecs)
readingDiag(allRecs)
assignedReadingHist(allRecs)

// ——— dev gallery audit: every screen appears exactly once ———
// Same title twice, or two entries defaulting to the same production state
// (same screen kind + same variant defaults), means a duplicate the reviewer
// would count as coverage it isn't.
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/ui/DevGallery.tsx', import.meta.url), 'utf8')
  const entries = [...src.matchAll(/cat: '([^']+)', title: '([^']+)', k: '([^']+)'/g)]
    .map((m) => ({ cat: m[1], title: m[2], k: m[3] }))
  const defaults = [...src.matchAll(/variantDefaults: (\{[^}]*\})/g)].map((m) => m[1])
  const titles = entries.map((e) => `${e.cat} · ${e.title}`)
  const dupTitles = titles.filter((t, i) => titles.indexOf(t) !== i)
  const dupDefaults = defaults.filter((d, i) => defaults.indexOf(d) !== i)
  const galleryOk = entries.length > 0 && dupTitles.length === 0 && dupDefaults.length === 0
  console.log(`\nGALLERY: ${entries.length} entries` + (galleryOk ? ' — each screen appears once' : `  !! DUPLICATES: ${[...dupTitles, ...dupDefaults].join(' | ')}`))
  if (!galleryOk) process.exitCode = 1
}

const seen = new Set(allRecs.map((r) => r.kind))
const missing = ALL.filter((k) => !seen.has(k))
console.log(`\nENDING COVERAGE: ${seen.size}/${ALL.length}` + (missing.length ? `  MISSING: ${missing.join(', ')}` : '  — all reachable'))
if (totalCrashes) console.log(`!! ${totalCrashes} CRASHES`)

// An ending nothing can reach, or a run that threw, is a failure and not a
// remark: this is the only automated check the game has, so it has to be able
// to go red. The gallery check above already sets exitCode the same way.
if (missing.length) process.exitCode = 1
if (totalCrashes) process.exitCode = 1
