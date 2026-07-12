// Saturation tuning probe. Simulates a HUMAN who always fires interceptors when
// they have coverage (icept >= 5), from year 3 on, against real Russian strikes.
// The only quantity saturation changes is the interception roll:
//   P(intercept) = min(0.99, max(0, icept - TIERS) / 10)
// So we replicate exactly that roll (the same line resolve() runs) and measure,
// per candidate TIERS, how much of the shield actually holds.
import { makeRng } from '../src/sim/rng.ts'

// A plausible aggressive-shield icept ramp: reach the firing threshold (5) at
// year 4, then keep climbing as budget allows. Years 0..19.
const ICEPT_BY_YEAR = [0,1,3,4,5,5,6,6,7,7,7,8,8,8,9,9,9,10,10,10]

const RUNS = Number(process.argv[2] ?? 5000)

function trial(tiers, seed) {
  const rng = makeRng(seed)
  let faced = 0, fired = 0, stopped = 0, through = 0
  for (let y = 3; y < 20; y++) {          // "after y3": years 3..19
    faced++
    const icept = ICEPT_BY_YEAR[y]
    if (icept < 5) { through++; continue }  // no coverage → can't fire, it lands
    fired++
    const p = Math.min(0.99, Math.max(0, icept - tiers) / 10)
    if (rng() < p) stopped++; else through++
  }
  return { faced, fired, stopped, through }
}

console.log(`\nSATURATION PROBE — shield player, always intercepts real Russian strikes from y3`)
console.log(`icept ramp by year: ${ICEPT_BY_YEAR.slice(3).join(' ')}  (years 3..19)\n`)
console.log(`  tiers   P@icept5   P@icept7   P@icept10   stopped/faced   got-through/game`)
for (const tiers of [0, 1, 2]) {
  let stopped = 0, through = 0, faced = 0
  for (let s = 0; s < RUNS; s++) {
    const r = trial(tiers, s * 977 + 13)
    stopped += r.stopped; through += r.through; faced += r.faced
  }
  const p5 = Math.min(0.99, Math.max(0, 5 - tiers) / 10)
  const p7 = Math.min(0.99, Math.max(0, 7 - tiers) / 10)
  const p10 = Math.min(0.99, Math.max(0, 10 - tiers) / 10)
  const stoppedPct = (100 * stopped / faced).toFixed(1)
  const throughPerGame = (through / RUNS).toFixed(2)
  console.log(`  ${tiers}       ${(p5*100).toFixed(0).padStart(4)}%      ${(p7*100).toFixed(0).padStart(4)}%       ${(p10*100).toFixed(0).padStart(4)}%        ${stoppedPct.padStart(5)}%          ${throughPerGame.padStart(5)}`)
}
console.log(`\n(17 strikes faced per game; "got-through/game" = warheads that beat the shield)`)
