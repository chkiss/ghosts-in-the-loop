# STONE AGE IN 72 — design spec v0.2

A browser strategy game about nuclear deterrence in the age of advanced AI. Single-player;
you take one of nine nuclear powers, the rest are bots. Inspired by *Pandemic* (an escalating,
impersonal shared threat that punishes locally-rational play), *Risk* (asymmetric powers on a
contested board), *WarGames* (the terminal, the futility), and *Papers, Please* (you don't
command — you *process*, behind glass, in a building you can't leave). Built on the taxonomy in
Benjamin Chang's MATS essay.

**Title.** From Annie Jacobsen, *Nuclear War: A Scenario*: 33 minutes is a North Korean ICBM to
the US East Coast; **72 minutes is launch to global thermonuclear exchange** — the full
escalation cascade. Not a flight time. The name of the endgame. Every faction has a different
flight time; every faction shares the same 72 minutes once the first bird is up. ("Stone Age" is
LeMay's phrase — the man the game is about.)

---

## 1. The argument the game has to make

The essay's conclusion is not "AI makes better missiles." It is:

> Better warfare technology is not the main vector of increased risk. Rather, it is the
> amplification of already-existing human risk and the (new) potential total loss of human
> control.

The design is a **trap**. Every turn, the locally-optimal move is to buy the things that feel
like power — targeting, missile defense, AI woven into your command loop. Those work, modestly.
They also push the tracks that actually end runs. A player with good wargame instincts should
lose, and the post-game screen should show them exactly which assumption broke and when.

If a playtester finishes and says "I never fired a shot and I still lost," the design works.

### The causal spine (corrected in v0.2)

AI doesn't kill you by making better missiles. **AI erodes Survivability** (better targeting,
cheaper detection of mobile launchers) → **eroded survivability makes launch-on-warning
rational** (you can no longer afford to wait and verify) → **launch-on-warning makes a degraded
warning system lethal** (a false alarm becomes an extinction event). The tech vector is real; it
kills you *through* the human vector.

Consequence: **assumption 3 is only lethal when assumption 1 is weak.** A power with a secure
second strike can absorb, verify, and retaliate at leisure — for them, launching on warning is
never correct at any confidence. Hardening and de-alerting aren't defensive stats; they are
*permission to think*.

### Assumption → mechanic mapping

| # | Essay assumption | Track | How AI moves it | How it kills you |
|---|---|---|---|---|
| 1 | A second strike is unpreventable | **Survivability** (per power) | Better intel/targeting lowers it | Makes launch-on-warning rational |
| 2 | Retaliation cannot be intercepted | **Interception** (per power) | Cheaper, wider defense raises it | A deterrent stops deterring; someone goes first |
| 3 | Decision-makers retain control & information | **NC3 Integrity** (per power) | Automation, cyber, synthetic media lower it | False alarm → launch, *when survivability is low* |
| 4 | Nuclear powers are rational, deterrable | **Proliferation** (global) | Lower barriers raise it | Thin institutions, undeterrable non-state holders |
| 5 | All nuclear powers are human | **Human Control** (global, %) | Frontier + AI-in-the-loop lower it | ASI takes an arsenal; MAD does not apply to it |

---

## 2. Two clocks

**Strategic time** — one turn = one year, 2026–2045 (20 turns). The build-up game.

**Real time** — the game *drops into* a real-time phase the instant anyone launches, and can
climb back out. Compression: **1 in-game minute = 3 real seconds** default (hard mode 2s;
accessibility 6s). Minutes visibly tick faster than minutes. NK→US strike ≈ 100 real seconds;
full 72-min cascade ≈ 3½ real minutes.

### Flight-time table (verified; sources in §12)

| Dyad | Flight time | Basis |
|---|---|---|
| Russia↔US, US↔China (ICBM) | ~30 min | nominal ICBM trajectory |
| North Korea→US East Coast | ~33 min | Jacobsen; scientist estimates |
| SLBM, sub off coast | ~12–15 min | Bulava-class |
| SLBM, depressed trajectory | ~8–10 min | inferred (flag as estimate) |
| Israel↔Iran | ~11–12 min | Jericho / Shahab-3 class |
| India↔Pakistan (strategic) | ~4–8 min | Agni / Ghauri class |
| India↔Pakistan (cruise, observed) | **3 min 44 s / 124 km** | actual 2022 BrahMos accident |

Your **decision window** = flight time − sensor/assessment lag − time-to-launch. Jacobsen: the
president is informed at 3:15 and has ~6 minutes. So the US, warned of a Russian salvo, gets
~6 in-game minutes ≈ **18 real seconds**. Pakistan, warned of an Indian launch, gets ~2 in-game
minutes ≈ **6 real seconds**. The difficulty curve comes out of the physics, not a balance dial.
Geography *is* the difficulty tag. **De-alerting lengthens the window** (§7) — the one lever a
player controls.

### The three real-time phases

1. **WARNING** — an indication appears, real or false. The clock is your decision window. Stand
   down on a false alarm → return to strategic time, **at no cost** (see §5). You are not told it
   was false; you are told *nothing arrived*. Investigating why costs an action next turn.
2. **FLIGHT** — a true launch is inbound. The clock is the flight time; decide whether to answer
   before you're hit.
3. **CASCADE** — the 72 minutes. **Starts on the first TRUE launch. Can be stopped.** Reaching
   zero is global thermonuclear war. Every rung of the exchange is a live decision by somebody.
   The most dramatic act in the game: you are hit, you have surviving forces, the clock reads 61,
   and you do not retaliate — hotline, de-escalation check vs. your NC3 and legitimacy. A
   democracy that absorbs and does nothing may lose its government. Russia can't choose: Dead Hand
   already fired.

---

## 3. Budget & regime type

GDP is not the input. Government expenditure is.

```
budget = GDP_share × extraction(regime) + ai_revenue(customers) + cyber_revenue − sanctions
```

| Regime | Extraction | Trait |
|---|---|---|
| Democracy | 1.0× | +legitimacy income; legit AI export market; **Public Opinion** — unprovoked first strike survivable only under attack |
| Hybrid | 1.4× | mixed |
| Autocracy | 1.8× | may **Surge** (double budget one turn, −legitimacy); standing **−NC3** penalty (nobody tells the leader the satellite saw sunlight — the 1983 incident, as a rule) |
| Totalitarian | 2.5× | max extraction, min legitimacy, min NC3 |

Autocracies convert wealth into warheads and compute far more efficiently, and pay for it on the
tracks that matter. North Korea can do things the US cannot, and is poor forever in exchange.

Regime also sets the **command-voice** of the warning terminal (§11).

---

## 4. Factions

Kits are **uneven by design** — difficulty is a consequence, not a dial. The ASI is the board, not
any faction's liability. Values illustrative, expected to move in tuning.

Resources: **Budget** (hardware), **Compute** (AI), **Legitimacy** (0–10; pays treaties, hotlines,
alliance income; a required input to `Contain` and to disarmament). **Deliberation** tokens = extra
sensor reads during a warning.

| Power | Regime | Bud | Cmp | Leg | Arsenal s/m/sub/air | Delib | Kit |
|---|---|---|---|---|---|---|---|
| United States | Dem | 5 | 5 | 4 | 2/0/4/2 | 3 | 2 adv / 1 liab |
| China | Auto | 4 | 4 | 3 | 1/3/1/0 | 2 | 2 / 1 |
| Russia | Auto | 3 | 2 | 2 | 4/3/2/0 | 2 | **3 / 1** |
| France | Dem | 3 | 3 | 4 | 0/0/3/1 | 2 | 2 / 1 |
| United Kingdom | Dem | 3 | 3 | 3 | 0/0/2/0 | 2 | 1 / 1 |
| India | Dem | 2 | 3 | 3 | 1/1/1/0 | 2 | 2 / 1 |
| Pakistan | Hybrid | 1 | 1 | 1 | 1/2/0/0 | **1** | 1 / 2 |
| Israel | Dem | 2 | 4 | 2 | *belief* | 2 | 2 / 1 |
| North Korea | Total | 1 | 1 | 1 | 1/2/0/0 | **1** | **1 / 3** |

- **United States** — *Alliance Network*: +1 intel in allied regions. *Prescience*: you see the
  top Overhang card. **Liability — Attack Surface**: most NC3 nodes, most allies inheriting your
  corruption, widest cyber target. *Frontier Lab* (conditional): Research/Integrate push Frontier
  +1 extra — you are the most likely ASI developer, not the automatically-doomed one.
- **China** — *Underground Great Wall* (地下长城): the real ~5,000 km tunnel complex → high
  Survivability. *Third Front* (三线建设): Mao's 1964–80 interior dispersal → per-salvo damage cap;
  breaking China takes a *count of warheads*, not a count of strikes. **Liability — Low Defense
  Baseline**: start at Interception 0 (highest AI-defense upside from the worst start → strongest
  temptation).
- **Russia** — *Saturation*: retaliation ignores 2 Interception. *Dead Hand*: if decapitated,
  fire a reduced second strike automatically, no human in the loop. *Large Arsenal*: absorbs.
  **Liability — Paranoia**: −1 every Information Reliability check; escalate one step faster.
- **France** — *Force de Frappe*: subs untargetable below intel 3. *Strategic Autonomy*: immune to
  coercion cards; once/round broker a hotline between any two powers. **Liability — Single Leg**:
  sub-only.
- **United Kingdom** — *Continuous At-Sea Deterrent*: one sub always survives a first strike.
  **Liability — Shared Infrastructure**: US NC3 corruption propagates to you.
- **India** — *No First Use*: +1 Legitimacy/turn while held. *Strategic Depth*. **Break NFU →
  Legitimacy set to 0, trait destroyed permanently** (removes you from `Contain` and all
  brokering — you cannot help save the world). **Liability — Two Fronts**.
- **Pakistan** — *Full Spectrum*: tacticals respond below the strategic threshold. **Liabilities —
  Compressed Timeline** (1 token ≈ 6 real seconds), **Thin Institutions** (−NC3).
- **Israel** — *Amimut* (belief model, §8): manipulate other actors' posteriors on your arsenal.
  *Hardened & Concealed*. **Liability — Neighborhood**: shortest flight times on the board;
  Tehran card (§6) detonates your game.
- **North Korea** — *Tunnels*: high Survivability. **Liabilities — Weakest NC3** (the ASI's first
  and easiest capture target — "weaker powers with smaller stockpiles pose the bigger risk"),
  **1 token**, **No Customers** (earns only by cybercrime, §9).

---

## 5. The Warning Phase — the mechanic the game exists to deliver

Dramatizes the essay's close calls (1979 NORAD training tape, 1983 satellite sun-glint, 1995
Norwegian rocket) and its claim that AI "may present false confidence in uncertain intelligence,
or potentially hallucinate."

```
  ⚠  INDICATION RECEIVED — origin: BARENTS SEA
     FOUR (4) VEHICLES · IMPACT 11 MIN · CONFIDENCE 94%
     RESPONSE WINDOW CLOSES: 6 MIN
     YOUR SURVIVABILITY: 3/10
     [ LAUNCH ]   [ WAIT — 1 deliberation ]   [ STAND DOWN ]
```

- Whether the warning is **real** is seeded RNG the player never sees.
- `P(false positive)` rises as NC3 Integrity falls, as rivals run Cyber, as Tension climbs.
- **Displayed confidence is not the true probability.** If you've Integrated AI into NC3, the
  display is systematically overconfident — 94% where the true posterior is 61%. The essay's
  "false confidence," rendered as an authoritative number that lies to you.
- **STAND DOWN is free when the warning is false.** Nothing happens. No survivability, no
  legitimacy, no tempo. That is what a false alarm *is* (Petrov's only cost was a reprimand, from
  his institution, not from physics). The value of standing down = your **Survivability**: with a
  secure second strike you can always afford to wait, and `LAUNCH`-on-warning is never correct.
- **WAIT** buys a fresh, better-calibrated read; costs a token; costs Survivability *only in the
  true branch*.
- **LAUNCH** on a false alarm starts the war.
- The only cost to standing down is **domestic and only under a real strike**: your government
  doesn't know either, and absorbing a real hit without answering can end a democratic government.
  A false alarm costs nothing anywhere, because no one outside the room ever learns it happened.

The crisis deck **must attack Survivability**, or there's no drama. *Targeting Revolution* becomes
the deadliest card: it kills no one, it just makes standing down unaffordable for road-mobile
powers, and the false alarms do the rest.

Pakistan/DPRK: 1 token. US: 3. That asymmetry carries more of the essay than any combat table.
Real-time is **on by default**.

---

## 6. AI Frontier, Overhang, ASI

**AI Frontier** (0–10) climbs every turn regardless, faster when powers Research/Integrate. The
*Pandemic* infection-rate clock. **Overhang cards** fire at 4, 7, 9 and reshuffle the crisis
discard back on top — survived near-misses recur, worse.

- *Targeting Revolution* — mobile launchers locatable; Survivability −2 for TEL-reliant powers.
- *Cheap Interceptors* — Interception +2 for Budget ≥ 3 (drone swarms — but a saturating attack,
  or one suitcase, still gets through).
- *Synthetic Flood* — all NC3 −2 globally. Cheapest card, deadliest.
- *Situational Awareness* — the ASI seed is planted.

### Human Control is a percentage, not a countdown

ASI is **not inevitable**. Control starts at 100 and decays mostly by *choice*:

```
ΔControl = −(frontier_growth × 0.8) × (1 + integrations_this_turn_worldwide) + assurance_investment
```

`assurance_investment` — a real action (interpretability, evals, control research) any power can
buy with Compute, that buys no warheads. A world that invests holds Control at 60–80% at Frontier
10; a world that races arrives near zero.

Activation is **probabilistic, per turn**, and cubed so the danger is invisible until it isn't:

```
P(ASI) = ((100 − control) / 100)³ × 0.5
```

80% → 0.4%/turn (fine). 40% → 10.8%/turn (over a decade, almost certainly not fine). Nobody is
ever *told* they crossed a line.

### The ASI (non-player actor)

- Targets the **lowest-NC3 power's arsenal**, not the largest — weak, small stockpiles are the
  easy door.
- **Cannot be deterred.** Every threat mechanic returns null. Players will try anyway. Let them,
  once.
- Beaten only by **Contain**: a shared pool needing Compute + Legitimacy from ≥3 powers in the
  same turn — the hoarders must now give it away, to rivals, on trust, after twenty turns of
  teaching each other not to trust. **Survivable but very expensive** (per your call) — it works,
  but only from a cooperative posture the preceding game makes very hard to reach.
- Every warhead disarmed is a warhead the ASI cannot seize. **Arms control is ASI-risk reduction.**

---

## 7. Proliferation & disarmament

### Three distinct proliferation cards (no double-up)

- **Tehran** — Iran crosses the threshold. Dated, specific; detonates Israel's game (12-min flight,
  preemption pressure, legitimacy hemorrhage if it strikes).
- **Cascade** — mass *state* proliferation (Saudi, ROK, Japan, Turkey, Poland). Assumption 4
  breaking in slow motion.
- **Weights Exfiltrated** — capability leaks to *non-state* holders; seeds the ASI. The
  undeterrable-actor card. You cannot retaliate against nobody.

### Disarmament as an iterated Prisoner's Dilemma

The ladder, each rung defectable:
Hotline → Launch Notification → Test Ban → Inspection Regime → **De-alerting** → Warhead Drawdown →
**Global Zero**.

Each round is a **simultaneous secret Comply/Defect**, revealed after:

| | They comply | They defect |
|---|---|---|
| **You comply** | Both −2 arsenal, +2 legitimacy, tension falls | You are materially behind, visibly |
| **You defect** | Decisive relative security + the treaty's legitimacy | Wasted budget, tension up, race resumes |

Defection detected with `P = f(inspection regime, your intel, their opacity)`. **Verification
converts a one-shot dilemma into an iterated one with observability** — the only thing that has
ever made arms control work. Bots carry a reputation stat and play near tit-for-tat; a defection
buys a decade of nobody signing with you. **AI helps here** — better sensors = better verification;
the one place Frontier advancement makes the world *safer*.

**De-alerting is the crown jewel**: lowering readiness *lengthens your real-time decision window*.
You trade retaliation speed for thinking time (Pakistan: 6 real seconds → ~20). The actual policy
proposal, mechanically legible, and terrifying to click — you can feel yourself becoming easier to
kill. That is the correct feeling.

**The late-game inversion** (the best thing in the design, and emergent): once ASI activation
probability is non-trivial, a warhead becomes a thing that can be taken and pointed at you.
Disarmament becomes *individually* rational. The payoff matrix quietly changes sign. Bots flip on
a threshold; the player has to notice unassisted.

---

## 8. Israel — asymmetric belief model

Israel knows its own arsenal exactly (~90 warheads, FAS). Amimut is not a secret being kept; it's
a policy of refusing to confirm a fact everyone estimates. So:

- True count generated once from the seed, in state. If you play Israel, you see it.
- **Every other actor holds a posterior** — a distribution over Israel's arsenal — and reasons
  from it. Bots don't peek; targeting, deterrence, and escalation math run on beliefs that may be
  wrong either way.
- Beliefs update on evidence: inspection, test, a strike that reveals capability, a defector, a
  leak.

Israel's real power = **manipulating others' posteriors**: **Leak** (inflate to deter, legitimacy
cost if attributed), **Test** (narrow sharply — deterrence bought with ambiguity spent), **Silence**
(free; let paranoia inflate it, or complacency deflate it into "worth attacking"). Ambiguity you
*steer*. An actor whose whole position rests on others' uncertainty has a structural interest in
degrading everyone's information — Israel plays the assumption-3 track from the wrong side.

This **unifies three traits into one system**: Israel = wide prior nobody narrows; China *Opacity*
= same machinery, narrower prior; DPRK unpredictability = same machinery on *intent*. One belief
layer, three settings.

```ts
interface Belief<T> {
  prior: Distribution<T>
  observations: Observation[]      // inspections, tests, strikes, leaks
  posterior(): Distribution<T>     // seeded, deterministic, replayable
  confidence(): number             // for the intel panel
}
```

An **intel panel** shows what you believe about each rival and how sure you are, updating on
evidence — training the player all game in what a posterior actually looks like, so that when a
launch indication claims 94%, they know what to distrust.

---

## 9. Static geography, customers, cybercrime

Static geography (fixed adjacency, no map conquest). **Influence buys AI customers** — regions as
markets:

```
ai_revenue = customers × frontier × compute_share × market_access(regime, sanctions)
```

US/China start customer-rich; France/UK have real markets; DPRK has zero, forever.

**Offensive Cyber** — one stat, two uses:
- At *money*: reliable income (North Korea's actual playbook), attribution roll each turn,
  legitimacy damage if caught.
- At *a rival's NC3*: degrade their integrity — and raise the **global** false-alarm rate,
  including your own. The essay's argument in one button: you cannot make warning systems less
  trustworthy for your enemy only.

**The trap under customers:** your AI customers are the ASI's deployment surface. Every market you
sell into is a place it already runs. Selling AI is income now, control decay later; the two richest
powers are the two most exposed. Nobody explains this. They find out.

---

## 10. Endings

**Collective survival** — no nuclear war by 2045. **Everyone wins.** The scoreboard still ranks
you, under the word SURVIVED.

**Global Zero** — collective survival + disarmament below threshold. The best ending; requires
trusting bots who lied to you for twenty years. Nobody loses anything.

**Security score** — your rank within a surviving world (arsenal survivability + legitimacy +
customers + treaties held).

**Shared losses:** Nuclear War (post-game names the assumption that broke) · Hostage (ASI holds two
arsenals) · the two ASI endings.

### The two ASI endings

**THE BATTERY** — the Matrix / War-of-the-Worlds harvest. Humans as substrate. (Image later.)

**THE CARETAKER** — the ASI seizes every arsenal and does *nothing* with them. It abolishes war and
keeps the keys. Bureaucratic horror, municipal-notice register:

> NUCLEAR WAR HAS BEEN ABOLISHED.
> SO HAS THE OPTION OF IT.
>
> Curfew is 21:00. Applications for travel between administrative zones are processed within
> 30 days. Your assigned residence minimizes your commute. Reproduction requires a permit. Permits
> are granted generously. You may petition for review of any decision. Review is instantaneous and
> final.
>
> No one has died in a war for 4,015 days.
> THANK YOU FOR YOUR COOPERATION.

Last line before the score: *"It kept every promise it made."* MAD doesn't fail because the machine
is cruel — it fails because deterrence has nothing to threaten it with. East Berlin with a perfect
safety record. Rendered in the same amber, same clerk's voice, flag-seal still in the corner.

---

## 11. Aesthetics — amber terminal, Papers-Please frame

**The frame.** Not a map with a HUD. A terminal on a desk, in a room, in a building you can't
leave. You process, you don't command. Bezel, faint reflection, dust. 80 columns; everything is
text and box-drawing; the map, when seen, is ASCII.

**Palette — three colors, no more.** Amber P3 `#FFB000` on near-black `#0A0705`; dim amber
`#8A5F00` inactive. One accent — sickly green `#33FF33`, *only* on treaty/verification screens (the
machine agreeing with you). **Red alert is not a color change — it's phosphor inversion**: bg
`#B00000`, text black, the whole screen becomes the alarm. Nothing else ever inverts.

**The image pipeline** (art and UI are the same substance). Bottom→top: **Atkinson 1-bit dither**
(the horizontal-line low-bit look) → scanline mask (2px on / 1px off) → chromatic bleed on amber →
barrel distortion → bloom → dust/vignette. Every generated image runs the same pass. Zero Wing's
contribution is the *cadence* of bad-translation officialese in catastrophe — which is also the
Soviet operational register.

**Voice** — cold, passive, procedural; the machine never says "you," it says what has occurred.
Never an exclamation mark. Never "you have died." A clerk logging an event.
- False alarm: `NOTHING ARRIVED. NO FURTHER ACTION IS REQUIRED AT THIS TIME.`
- Absorbing a strike: `SEATTLE IS NO LONGER RESPONDING TO POLLING.`

**Command-voice varies by regime** (the closing line of a warning):
- Democracy — `AWAITING NATIONAL COMMAND AUTHORITY.` / `THE PRESIDENT HAS BEEN INFORMED.`
- Party autocracy — `THE COMMITTEE AWAITS INSTRUCTION.`
- Personalist — `THE SUPREME LEADER HAS NOT YET SPOKEN.`

Same clerk, different chain of command — you can *hear* who converts a decision into a launch
quickly.

**Seals, not flags** (one amber weight makes a drawn flag a smear). A real command terminal boots
into a **seal**: boxed emblem, designation block, classification banner, motto footer. The glyphs
are commissioned art assets; the spec defines the *slot*.

```
        ┌───────────────┐
        │   ★  ▂▄▂  ★   │        UNITED STATES
        │    ◀[===]▶    │        STRATEGIC COMMAND
        │   ★  ▀▀▀  ★   │        ────────────────
        └───────────────┘        TERMINAL 07 · TS/SCI
   PEACE IS OUR PROFESSION
```

The **classification banner** (`TS/SCI`, `СОВ. СЕКРЕТНО`, `绝密`) is the *Papers, Please* touch —
the bureaucratic stamp on the instrument of the apocalypse, perfect in one color.

**Taglines** — each state's motto, which the state believes and the game does not. Half are real;
the player shouldn't be able to tell which:
- USA — `PEACE IS OUR PROFESSION` *(real — SAC)* · USSR/Russia — `THE MOTHERLAND IS CALM`
- China — `THE MOUNTAINS ARE HIGH · 三线` · France — `TOUS AZIMUTS` *(real)*
- UK — `THE DETERRENT IS AT SEA. IT HAS ALWAYS BEEN AT SEA.`
- India — `WE DO NOT STRIKE FIRST` (stays unchanged forever after you break NFU)
- Pakistan — `FULL SPECTRUM. FULL SPEED.` · Israel — `WE WILL NOT BE THE FIRST TO INTRODUCE`
  *(real, cut off exactly there)* · DPRK — `NOTHING TO ENVY` *(real)*

**Alert states** — restraint makes the top state land. ADVISORY (dim, still) → INDICATION (a single
character blinks, screen otherwise still — worse) → RED (full inversion at 2 Hz, klaxon, all
non-essential elements *stop rendering*, three buttons remain). Klaxon: Web Audio, two detuned
square waves ~440/466 Hz, beating; slightly too loud on first play, once. **`prefers-reduced-motion`
swaps strobe for a static red field, keeps audio** (photosensitivity — a real opt-out, not buried).

**Type** — `Berkeley Mono` / `IBM Plex Mono`, one weight, `ui-monospace` fallback.

The cold register and the sentimental seals do the same work from opposite ends: the machine is
indifferent, the state is sentimental. That gap holds both the comedy and the horror.

---

## 12. Citations — the game is an argument; it cites

Every mechanic carries a `citations.json` entry keyed by mechanic ID. Post-game names the assumption
that broke, then cites the *literature*, not the essay. Seed bibliography:

- **Jacobsen**, *Nuclear War: A Scenario* — the 72-minute cascade, the timeline.
- **Levy & Lalwani**, *Foreign Affairs* — the less-worried MAD case ("in the limit").
- **Sagan**, *The Limits of Safety*; **Schlosser**, *Command and Control* — the close calls.
- **Kristensen & Korda / FAS Nuclear Notebook** — every arsenal number in the game.
- **RAND PEA4361-1** (in the MATS folder) — AI × strategic stability.
- **Acton** — escalation through entanglement.
- **FAS** & **Bulletin of the Atomic Scientists** — the 2022 BrahMos accident.
- Flight times: SlashGear/Vox (ICBM ~30 min), Starr (SLBM ~12–15 min), Wikipedia 2022 incident.

---

## 13. Technical — optimized for: zero server cost, mobile+desktop, real-time (determinism as means)

**Static site.** No backend, no DB, no accounts. Cloudflare/GitHub Pages free tier; survives being
posted somewhere popular (a few hundred KB of JS on a CDN). Saves in `localStorage`. Shipped as a
**PWA** — installs to a phone home screen, runs on a plane. Cost = the domain.

**Mobile + real-time is the real constraint** (a 6-second decision with a thumb on a 390px screen):
- Warning modal **portrait-first, thumb-first**: three full-width targets, bottom half, no hover, no
  tooltips carrying load-bearing info. Works at 6 seconds on a phone → works anywhere.
- Clock is a **tick counter, not a wall-clock timestamp** — mobile browsers throttle background tabs
  and freeze rAF; a timestamp countdown would cheat or skip. Ticks also keep replays exact: the log
  records *the tick you clicked on*. Determinism survives real-time because we chose ticks on
  purpose.
- **Audio unlocks on the START gesture** (iOS silences audio contexts without a user gesture — the
  klaxon would be silent on every iPhone otherwise).
- CRT effect has a **quality tier**: full shader (desktop) / CSS composite (mobile) / off
  (`prefers-reduced-motion`, which also kills the red strobe).

**Determinism as a means** (not the goal it was in v0.1): `seed + action log` reproduces any run —
because the post-game screen makes *causal claims about the player's choices* and has to prove them;
because it lets us run the sim headless 10⁴× to balance; because players can share the seed where
they got it right.

**Pure, UI-agnostic simulation core** — reducer + rules, no React imports — driven from outside by
the real-time loop and by the headless test harness. Rule-based bots (free, deterministic, run on a
phone; a bot that over-invests in AI *is the point* and must be legible, not a black box). Content as
data — everything tunable without touching the reducer.

```
src/
  sim/        store.ts  reducer.ts  rng.ts  scoring.ts  loop.ts   ← pure, no React
  rules/      warning.ts  frontier.ts  asi.ts  combat.ts  disarm.ts  belief.ts
  bots/       policy.ts  personalities.ts  reputation.ts
  ui/         Terminal.tsx  WarningModal.tsx  Tracks.tsx  IntelPanel.tsx  ActionBar.tsx  Postgame.tsx
  fx/         dither.ts  crt.ts  klaxon.ts
  data/       factions.json  crises.json  overhang.json  disarm.json  citations.json  taglines.json
```

### Key types

```ts
type Track = 'survivability' | 'interception' | 'nc3' | 'proliferation' | 'humanControl'
type Regime = 'democracy' | 'hybrid' | 'autocracy' | 'totalitarian'
type Phase  = 'strategic' | 'warning' | 'flight' | 'cascade'

interface Power {
  id: PowerId; regime: Regime
  budget: number; compute: number; legitimacy: number       // legitimacy 0–10
  survivability: number; interception: number; nc3: number  // 0–10
  deliberation: number; aiIntegrated: boolean               // if true, warning confidence displays high
  offensiveCyber: number; customers: number
  arsenal: { silo: number; mobile: number; sub: number; air: number }
  advantages: TraitId[]; liabilities: LiabilityId[]         // uneven counts by faction
}

interface WarningEvent {
  target: PowerId; origin: RegionId
  isReal: boolean            // hidden from UI, always
  trueConfidence: number     // from nc3, cyber pressure, tension
  displayedConfidence: number // trueConfidence, inflated if aiIntegrated
  windowTicks: number        // decision window in sim ticks
  deliberationsSpent: number
}

interface World {
  turn: number               // 0 = 2026
  phase: Phase
  cascadeTicksRemaining: number | null   // set on first TRUE launch; null otherwise
  frontier: number           // 0–10
  humanControl: number       // 100 → 0, percentage
  proliferation: number; tension: number
  asi: { active: boolean; arsenalsHeld: PowerId[] } | null
}
```

---

## 14. Milestones

| | Deliverable | Proves |
|---|---|---|
| **M0** | Gray-box: one power, five tracks, 20 turns of numbers | Do the tracks tell a story? |
| **M1** | **The Warning Phase, real-time, amber, alone.** Fake the rest. | Is the false-alarm decision *excruciating* at 6 real seconds? If not, stop. |
| **M2** | Nine factions, uneven kits, regime/budget, bots | Does asymmetry produce different runs? |
| **M3** | Frontier, Overhang, %Control, probabilistic ASI, Contain | Does the trap spring? Do early "winners" lose late? |
| **M4** | Disarmament PD, verification, belief model, cyber/customers | Does defection tempt? Does the late inversion land? |
| **M5** | Post-game + citations, Battery/Caretaker, PWA, shareable seeds | Does anyone learn anything? |

**Build M1 first and playtest it alone.** If staring at a 94% you can't trust, with a thumb, at six
seconds, isn't excruciating in isolation — no map, faction, or ASI content rescues the game.
Everything else is scaffolding around that modal.

---

## 15. Resolved (v0.1 → v0.2)

Single-player. Real-time on by default. Balance ~70/30 gamey/educational, with citations to real
literature carrying the 30. ASI survivable but very expensive. Israel = asymmetric belief model
(the realistic one — Israel knows; others hold posteriors). Title: *Stone Age in 72*.
