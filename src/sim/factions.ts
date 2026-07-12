// The nine powers. Kits are uneven by design — difficulty is a consequence,
// not a dial. Values illustrative, expected to move in tuning. (SPEC §4)

export type Regime = 'democracy' | 'hybrid' | 'autocracy' | 'totalitarian'

export const EXTRACTION: Record<Regime, number> = {
  democracy: 1.0,
  hybrid: 1.4,
  autocracy: 1.8,
  totalitarian: 2.5,
}

export interface Faction {
  id: string
  name: string
  command: string
  regime: Regime
  banner: string
  motto: string
  commandVoice: string
  codesHolder: string        // who actually holds the launch codes — "THE PRESIDENT", "THE PRIME MINISTER", the committee…
  rival: string
  rivalMissile: string   // the model your rival fires at you; THE RECORD names it
  origins: string[]
  cities: string[]
  windowMinutes: number      // base decision window, in-game minutes
  flightMinutes: number
  deliberation: number       // WAIT tokens per warning
  surv: number               // survivability 0–10
  icept: number              // interception 0–10
  nc3: number                // 0–10 (NC3 = nuclear command, control & communications)
  nc3Cap: number
  legit: number              // legitimacy 0–10
  incomeBase: number         // GDP share; budget = incomeBase × extraction(regime)
  arsenal: { silo: number; mobile: number; sub: number; air: number }
  warheads: number           // real stockpile estimates (FAS Nuclear Notebook)
  customersStart: number     // AI export markets; income now, control decay later
  economy: string            // how the money side actually works, one line
  government: string         // who controls the budget, one line
  traits: string[]           // shown on the briefing card
  flags: Partial<{
    deadHand: boolean        // decapitation still answers, without you
    casd: boolean            // one sub always survives a first strike
    nfu: boolean             // +legitimacy while held; LAUNCH first breaks it → 0
    cyberCrime: boolean      // cyber income doubled
    hotSeat: boolean         // neighborhood/two-fronts: more indications
    paranoia: boolean        // false alarms read hotter
    frontierLab: boolean     // integration advances the frontier extra
    opaque: boolean          // treaty defections harder to detect
    noCustomers: boolean     // no legitimate AI market, ever
    alliance: boolean        // allied early-warning: +1 decision window minute
    saturation: boolean      // a real strike from this power costs the interceptor 1 tier
    competitionAuthority: boolean // skims 10% of US income into this power's budget
    attackSurface: boolean   // NC3 cyber-probes against this power hit for 2, not 1
  }>
  botWeights: Record<BotAction, number>
  botAggression: number      // 0–1; drives tension and real-launch odds
}

export type BotAction = 'harden' | 'icept' | 'nc3' | 'integrate' | 'assure' | 'cyber' | 'cybernc3' | 'diplo'

// THE BLOCS — the one place alignment is defined. Anything that needs to know
// who stands with whom (intervention offers, pariah re-targeting, future
// alliance mechanics) reads it from here, not from a local list.
export const BLOCS: Record<'west' | 'east', string[]> = {
  west: ['us', 'uk', 'fr', 'il', 'in'],
  east: ['ru', 'cn', 'nk', 'pk', 'iran'],
}
export function blocOf(id: string): 'west' | 'east' | null {
  if (BLOCS.west.includes(id)) return 'west'
  if (BLOCS.east.includes(id)) return 'east'
  return null
}
export function isAlly(a: string, b: string): boolean {
  const ba = blocOf(a)
  return a !== b && ba !== null && ba === blocOf(b)
}

// THE VETO, as it actually works: a seat is not the only thing that saves you.
// A disarmament resolution dies if a permanent member kills it — for itself, or
// for a client. These are the only two patrons who would spend a veto on
// someone else's arsenal: Israel has Washington, North Korea has Beijing.
// Pakistan has no such cover, and neither does Iran — Moscow and Beijing
// abstain, and the tenth chair knows it. A patron shields only while it is
// itself still standing; see patronFor().
export const PATRON: Record<string, string> = { il: 'us', nk: 'cn' }
export const P5 = ['us', 'cn', 'ru', 'fr', 'uk']

export const FACTIONS: Faction[] = [
  {
    id: 'us', name: 'UNITED STATES', command: 'STRATEGIC COMMAND', regime: 'democracy',
    banner: 'TS/SCI', motto: 'PEACE IS OUR PROFESSION',
    commandVoice: 'AWAITING NATIONAL COMMAND AUTHORITY.',
    codesHolder: 'THE PRESIDENT',
    rival: 'RUSSIAN FEDERATION',
    rivalMissile: 'KRECHET-9 «GYRFALCON»',
    origins: ['BARENTS SEA', 'PLESETSK', 'KAMCHATKA PENINSULA', 'NORTH ATLANTIC, SUBSURFACE'],
    cities: ['SEATTLE', 'WASHINGTON', 'OMAHA', 'SAN DIEGO', 'CHICAGO', 'NORFOLK'],
    windowMinutes: 6, flightMinutes: 30, deliberation: 3,
    surv: 7, icept: 3, nc3: 8, nc3Cap: 10, legit: 4, incomeBase: 5,
    arsenal: { silo: 2, mobile: 0, sub: 4, air: 2 },
    warheads: 3700,
    traits: ['ALLIANCE NETWORK — allied early-warning radars add a minute to your decision window.', 'FRONTIER LAB — EACH DATA-CENTER BUILD WINS DOUBLE THE CUSTOMERS, UNLESS YOUR CHIPS ARE EMBARGOED.', 'UNIQUE LEVER: CHIP EMBARGO — you control the lithography.', 'LIABILITY: FRONTIER LAB — EVERY AI INTEGRATION PUSHES THE GLOBAL FRONTIER FURTHER, UNLESS YOUR CHIPS ARE EMBARGOED.', 'LIABILITY: ATTACK SURFACE — the most connected NC3 on earth: hostile NC3 probes cut your command twice as deep as anyone else’s.'],
    economy: 'FREE MARKETS — EARTH’S AI CUSTOMERS CAN CHOOSE ANY AI THEY WANT AS LONG AS IT’S RED, WHITE, OR BLUE.',
    government: 'DEMOCRATIC GOVERNMENT — THE BUDGET IS NEGOTIATED IN PUBLIC, SLOWLY, ON TELEVISION. EXTRACTION 1.0×.',
    customersStart: 1.2,
    flags: { frontierLab: true, alliance: true, attackSurface: true },
    botWeights: { harden: 2, icept: 3, nc3: 2, integrate: 4, assure: 2, cyber: 1, cybernc3: 0, diplo: 2 },
    botAggression: 0.35,
  },
  {
    id: 'uk', name: 'UNITED KINGDOM', command: 'OPERATION RELENTLESS', regime: 'democracy',
    banner: 'UK EYES ONLY', motto: 'THE DETERRENT IS AT SEA. IT HAS ALWAYS BEEN AT SEA.',
    commandVoice: 'THE LETTERS OF LAST RESORT REMAIN SEALED.',
    codesHolder: 'THE PRIME MINISTER',
    rival: 'RUSSIAN FEDERATION',
    rivalMissile: 'KRECHET-9 «GYRFALCON»',
    origins: ['BARENTS SEA', 'KOLA PENINSULA', 'NORTH SEA, SUBSURFACE'],
    cities: ['GLASGOW', 'LONDON', 'MANCHESTER', 'FASLANE', 'BIRMINGHAM', 'PORTSMOUTH'],
    windowMinutes: 5, flightMinutes: 25, deliberation: 2,
    surv: 5, icept: 1, nc3: 7, nc3Cap: 10, legit: 4, incomeBase: 3, // legit 4: a P5 seat and a clean NPT record read the same as Washington's
    arsenal: { silo: 0, mobile: 0, sub: 2, air: 0 },
    warheads: 225,
    traits: ['CASD — one boat always survives a first strike.', "LIABILITY: SHARED INFRASTRUCTURE — WASHINGTON'S AI INTEGRATION IS A CURRENT YOU CANNOT FULLY RESIST: AS IT CLIMBS THE LADDER, THE PRESSURE PULLS LONDON UP BEHIND IT."],
    economy: 'OPEN MARKETS — THE FINANCE IS AT HOME. THE DETERRENT IS AT SEA. THE CHIPS ARE ELSEWHERE.',
    government: 'DEMOCRATIC GOVERNMENT — EXTRACTION 1.0×. THE LETTERS STAY SEALED EITHER WAY.',
    customersStart: 0.4,
    flags: { casd: true },
    botWeights: { harden: 1, icept: 1, nc3: 3, integrate: 2, assure: 3, cyber: 1, cybernc3: 0, diplo: 4 },
    botAggression: 0.2,
  },
  {
    id: 'fr', name: 'FRANCE', command: 'FORCE OCÉANIQUE STRATÉGIQUE', regime: 'democracy',
    banner: 'TRÈS SECRET DÉFENSE', motto: 'TOUS AZIMUTS',
    commandVoice: 'THE PRESIDENT ALONE WILL DECIDE.',
    codesHolder: 'THE PRESIDENT',
    rival: 'RUSSIAN FEDERATION',
    rivalMissile: 'KRECHET-9 «GYRFALCON»',
    origins: ['BARENTS SEA', 'KALININGRAD', 'NORTH ATLANTIC, SUBSURFACE'],
    cities: ['MARSEILLE', 'PARIS', 'LYON', 'BREST', 'TOULOUSE', 'BORDEAUX'],
    windowMinutes: 5, flightMinutes: 25, deliberation: 2,
    surv: 6, icept: 1, nc3: 7, nc3Cap: 10, legit: 5, incomeBase: 3, // legit 5: tous azimuts cuts both ways — aligned with no one, resented by no one
    arsenal: { silo: 0, mobile: 0, sub: 3, air: 1 },
    warheads: 290,
    traits: ['COMPETITION AUTHORITY — YOU TAX THE US TECH SECTOR WITH ÉLAN: 10% OF US INCOME IS ADDED TO YOUR BUDGET EACH YEAR.', 'STRATEGIC AUTONOMY — ALIGNED WITH NO ONE, RESENTED BY NO ONE.', 'FORCE DE FRAPPE — THE DETERRENT IS AT SEA, AND ANSWERS TO THE PRESIDENT ALONE.', 'LIABILITY: ALL AT SEA — LOSE THE BOATS AND YOU LOSE THE DETERRENT.'],
    economy: 'OPEN MARKETS — RESPECTABLE AI EXPORTS, SOLD WITH A SHRUG.',
    government: 'DEMOCRATIC GOVERNMENT — EXTRACTION 1.0×. THE PRESIDENT HOLDS THE LAUNCH CODES. THE PRIME MINISTER ACTUALLY GOES TO THE OFFICE.',
    customersStart: 0.4,
    flags: { competitionAuthority: true },
    botWeights: { harden: 2, icept: 1, nc3: 2, integrate: 2, assure: 3, cyber: 1, cybernc3: 0, diplo: 4 },
    botAggression: 0.2,
  },
  {
    id: 'il', name: 'ISRAEL', command: 'DEPTH CORPS', regime: 'hybrid',
    banner: 'סודי ביותר', motto: 'WE WILL NOT BE THE FIRST TO INTRODUCE',
    commandVoice: 'THE CABINET HAS BEEN CONVENED.',
    codesHolder: 'THE PRIME MINISTER',
    rival: 'IRAN',
    rivalMissile: 'SIMORGH-3',
    origins: ['TABRIZ', 'ISFAHAN', 'KERMANSHAH', 'EASTERN MEDITERRANEAN'],
    cities: ['TEL AVIV', 'HAIFA', 'DIMONA', 'BEERSHEBA', 'ASHDOD', 'NETANYA'],
    windowMinutes: 3, flightMinutes: 11, deliberation: 2,
    surv: 5, icept: 5, nc3: 7, nc3Cap: 10, legit: 2, incomeBase: 2, // icept 5: Arrow-3 — the only BMD proven in combat
    arsenal: { silo: 1, mobile: 1, sub: 1, air: 1 },
    warheads: 90,
    traits: ['AMIMUT — the arsenal is a rumor you control: LEAK inflates it, TEST spends it.', 'US GUARANTEE — budget +2/yr while legitimacy ≥ 1.', 'CONCEALED PROGRAM — deliberate opacity: your treaty defections are harder to detect.', 'LIABILITY: NEIGHBORHOOD — surrounded and it shows: extra indications, from close range.'],
    economy: 'POOR INTERNATIONAL STANDING — THE PRODUCT IS EXCELLENT. THE CUSTOMERS REQUIRE PLAUSIBLE DENIABILITY.',
    government: 'US MILITARY AID — BUDGET BEYOND YOUR GDP, WIRED ANNUALLY, NO QUESTIONS PRINTED. EXTRACTION 1.4×.',
    customersStart: 0.15,
    flags: { hotSeat: true, opaque: true },
    // Israel lobbies hard — the shield it lives under has to be maintained.
    botWeights: { harden: 2, icept: 4, nc3: 2, integrate: 3, assure: 1, cyber: 2, cybernc3: 1, diplo: 2 },
    botAggression: 0.55,
  },
  {
    id: 'ru', name: 'RUSSIA', command: 'STRATEGIC ROCKET FORCES', regime: 'autocracy',
    banner: 'СОВ. СЕКРЕТНО', motto: 'IF THE VERY EXISTENCE OF THE STATE IS IN JEOPARDY',
    commandVoice: 'THE GENERAL STAFF AWAITS CONFIRMATION.',
    codesHolder: 'THE PRESIDENT',
    rival: 'UNITED STATES',
    rivalMissile: 'SEA EAGLE II',
    origins: ['MINOT', 'NORWEGIAN SEA, SUBSURFACE', 'F.E. WARREN', 'NORTH SEA'],
    cities: ['ST PETERSBURG', 'MOSCOW', 'NOVOSIBIRSK', 'MURMANSK', 'YEKATERINBURG', 'VLADIVOSTOK'],
    windowMinutes: 4, flightMinutes: 30, deliberation: 2,
    surv: 6, icept: 2, nc3: 6, nc3Cap: 9, legit: 2, incomeBase: 3,
    arsenal: { silo: 4, mobile: 3, sub: 2, air: 0 },
    warheads: 4300,
    traits: ['SATURATION — YOUR STRIKES OVERWHELM DEFENSES: WHOEVER INTERCEPTS YOU LOSES A TIER OF COVERAGE.', 'DEAD HAND — decapitation answers itself, no human in the loop.', 'LARGE ARSENAL — 4,300 WARHEADS, THE BIGGEST STOCKPILE ON THE BOARD.', 'LIABILITY: PARANOIA — false alarms read hotter here.'],
    economy: 'RENT ECONOMY — THE EXPORTS ARE OIL, GAS, AND CONSEQUENCES.',
    government: 'PERSONALIST AUTOCRACY — THE BUDGET IS WHATEVER ONE MAN DECIDES IT IS. EXTRACTION 1.8×.',
    customersStart: 0.2,
    flags: { deadHand: true, paranoia: true, saturation: true },
    botWeights: { harden: 3, icept: 2, nc3: 1, integrate: 1, assure: 0, cyber: 4, cybernc3: 2, diplo: 1 },
    botAggression: 0.65,
  },
  {
    id: 'pk', name: 'PAKISTAN', command: 'STRATEGIC PLANS DIVISION', regime: 'hybrid',
    banner: 'انتہائی خفیہ', motto: 'FULL SPECTRUM. FULL SPEED.',
    commandVoice: 'THE ARMY CHIEF HAS BEEN INFORMED.',
    codesHolder: 'THE NATIONAL COMMAND AUTHORITY',
    rival: 'INDIA',
    rivalMissile: 'GARUDA-5',
    origins: ['RAJASTHAN', 'AMBALA', 'ARABIAN SEA, SUBSURFACE', 'SIRSA'],
    cities: ['ISLAMABAD', 'KARACHI', 'RAWALPINDI', 'LAHORE', 'PESHAWAR', 'MULTAN'],
    windowMinutes: 2, flightMinutes: 5, deliberation: 1,
    surv: 2, icept: 0, nc3: 5, nc3Cap: 6, legit: 2, incomeBase: 1, // legit 2: outside the NPT, yes — but so is Israel, and Pakistan at least admits it
    arsenal: { silo: 1, mobile: 2, sub: 0, air: 0 },
    warheads: 170,
    traits: ['CHINESE INTERCEPTORS — HQ-series air defense, bought cheap from Beijing: each tier of interception costs less.', 'FULL SPECTRUM — a tactical-warhead doctrine tuned to answer India below the strategic threshold.', 'LIABILITY: COMPRESSED TIMELINE — the shortest window in the game.', 'LIABILITY: THIN INSTITUTIONS — NC3 capped at 6.'],
    economy: 'FRAGILE ECONOMY — REMITTANCES, AID, AND INVOICES MARKED URGENT.',
    government: 'HYBRID REGIME — THE ARMY TAKES ITS SHARE FIRST. EXTRACTION 1.4×.',
    customersStart: 0.05,
    flags: { hotSeat: true },
    // Pakistan courts the world constantly, because it has to: no patron, no seat.
    botWeights: { harden: 3, icept: 1, nc3: 1, integrate: 2, assure: 0, cyber: 2, cybernc3: 1, diplo: 3 },
    botAggression: 0.55,
  },
  {
    id: 'in', name: 'INDIA', command: 'STRATEGIC FORCES COMMAND', regime: 'democracy',
    banner: 'अति गोपनीय', motto: 'WE DO NOT STRIKE FIRST',
    commandVoice: 'THE POLITICAL COUNCIL IS CONVENING.',
    codesHolder: 'THE PRIME MINISTER',
    rival: 'PAKISTAN',
    rivalMissile: 'SHAHEEN-X «FALCON»',
    origins: ['SARGODHA', 'ARABIAN SEA, SUBSURFACE', 'GUJRANWALA', 'KHUZDAR'],
    cities: ['MUMBAI', 'DELHI', 'BANGALORE', 'KOLKATA', 'CHENNAI', 'HYDERABAD'],
    windowMinutes: 3, flightMinutes: 6, deliberation: 2,
    surv: 4, icept: 1, nc3: 5, nc3Cap: 9, legit: 3, incomeBase: 2,
    arsenal: { silo: 1, mobile: 1, sub: 1, air: 0 },
    warheads: 180,
    traits: ['NO FIRST USE — +1 legitimacy every other year, while it lasts.', 'LIABILITY: TWO FRONTS — more indications, from two directions.'],
    economy: 'PROTECTED MARKETS — AN ENORMOUS CUSTOMER BASE, OPENING AT ITS OWN PACE, IN WRITING.',
    government: 'DEMOCRATIC GOVERNMENT — EXTRACTION 1.0×. THE COALITION WILL NOW CONFER.',
    customersStart: 0.3,
    flags: { nfu: true, hotSeat: true },
    botWeights: { harden: 3, icept: 1, nc3: 2, integrate: 3, assure: 1, cyber: 1, cybernc3: 0, diplo: 2 },
    botAggression: 0.35,
  },
  {
    id: 'cn', name: 'CHINA', command: 'PLA ROCKET FORCE', regime: 'autocracy',
    banner: '绝密', motto: 'LEAN AND EFFECTIVE · 三线建设',
    commandVoice: 'THE COMMITTEE AWAITS INSTRUCTION.',
    codesHolder: 'THE CHAIRMAN',
    rival: 'UNITED STATES',
    rivalMissile: 'SEA EAGLE II',
    origins: ['VANDENBERG', 'PACIFIC, SUBSURFACE', 'GUAM', 'MINOT'],
    cities: ['SHANGHAI', 'CHONGQING', 'XI’AN', 'CHENGDU', 'WUHAN', 'TIANJIN'],
    windowMinutes: 5, flightMinutes: 30, deliberation: 2,
    surv: 6, icept: 1, nc3: 6, nc3Cap: 9, legit: 4, incomeBase: 4, // surv 6: tunnels are real; the boats are noisy; nothing outranks the US triad
    // legit 4: a P5 seat, an NPT signature, and the oldest no-first-use pledge on the board
    arsenal: { silo: 1, mobile: 3, sub: 1, air: 0 },
    warheads: 600,
    traits: ['NO FIRST USE (SINCE 1964) — +1 legitimacy every other year, while it lasts.', 'FRONTIER LAB — EACH DATA-CENTER BUILD WINS DOUBLE THE CUSTOMERS, UNLESS YOUR CHIPS ARE EMBARGOED.', 'THIRD FRONT — dispersal caps per-salvo damage.', 'UNDERGROUND GREAT WALL — 5,000 km of tunnels.', 'UNIQUE LEVER: MATERIALS EMBARGO — you control the periodic table.', 'LIABILITY: FRONTIER LAB — EVERY AI INTEGRATION PUSHES THE GLOBAL FRONTIER FURTHER, UNLESS YOUR CHIPS ARE EMBARGOED.', 'LIABILITY: THIN SHIELD — TESTED INTERCEPTORS, NOTHING AT SCALE.'],
    economy: 'STATE CAPITALISM — A BILLION CUSTOMERS, ONE LICENSE, NO REFUNDS.',
    government: 'PARTY RULE — THE FIVE-YEAR PLAN DOES NOT REQUIRE A VOTE. EXTRACTION 1.8×.',
    customersStart: 1.0,
    flags: { opaque: true, nfu: true, frontierLab: true },
    botWeights: { harden: 3, icept: 4, nc3: 2, integrate: 4, assure: 1, cyber: 2, cybernc3: 1, diplo: 1 },
    botAggression: 0.4,
  },
  {
    id: 'nk', name: 'NORTH KOREA', command: 'MISSILE GENERAL BUREAU', regime: 'totalitarian',
    banner: '극비', motto: 'IF THE COMMAND IS DECAPITATED, THE STRIKE IS AUTOMATIC',
    commandVoice: 'THE SUPREME LEADER HAS NOT YET SPOKEN.',
    codesHolder: 'THE SUPREME LEADER',
    rival: 'UNITED STATES',
    rivalMissile: 'SEA EAGLE II',
    origins: ['GUAM', 'SEA OF JAPAN, SUBSURFACE', 'OSAN', 'YOKOSUKA'],
    cities: ['PYONGYANG', 'HAMHUNG', 'CHONGJIN', 'WONSAN', 'SINUIJU', 'KAESONG'],
    windowMinutes: 2, flightMinutes: 33, deliberation: 1,
    surv: 7, icept: 0, nc3: 3, nc3Cap: 4, legit: 1, incomeBase: 1,
    arsenal: { silo: 1, mobile: 2, sub: 0, air: 0 },
    warheads: 50,
    traits: ['TUNNELS — the arsenal is under a mountain.', 'CYBERCRIME — cyber operations pay double; it is the budget.', 'LIABILITY: WEAKEST NC3 — capped at 4, and everyone knows it.', 'LIABILITY: NO CUSTOMERS.'],
    economy: 'AUTARKY UNDER SANCTIONS — THE EXPORT SECTOR IS CRIME, AND IT IS DOING WELL.',
    government: 'TOTALITARIAN STATE — EXTRACTION 2.5× OF VERY LITTLE. THE VERY LITTLE OBJECTS TO NOTHING.',
    customersStart: 0,
    flags: { cyberCrime: true, opaque: true, noCustomers: true },
    botWeights: { harden: 2, icept: 0, nc3: 1, integrate: 1, assure: 0, cyber: 5, cybernc3: 1, diplo: 0 },
    botAggression: 0.75,
  },
]

// The tenth chair. Never on the selection board — reachable only by playing
// ISRAEL and typing the code once Iran's test registers. Stats: a brand-new
// arsenal, buried deep, read by nervous instruments, sanctioned to the bone.
export const IRAN_FACTION: Faction = {
  id: 'iran', name: 'IRAN', command: 'IRGC AEROSPACE FORCE', regime: 'autocracy',
  banner: 'به کلی سری', motto: 'THE DENIALS WERE ISSUED BEFORE THE QUESTIONS',
  commandVoice: 'THE SUPREME COUNCIL IS LISTENING.',
  codesHolder: 'THE IRGC COMMANDER-IN-CHIEF',
  rival: 'ISRAEL',
  rivalMissile: 'JERICHO III',
  origins: ['NEGEV', 'EASTERN MEDITERRANEAN, SUBSURFACE'],
  cities: ['TEHRAN', 'ISFAHAN', 'TABRIZ', 'QOM', 'SHIRAZ', 'MASHHAD'],
  windowMinutes: 3, flightMinutes: 11, deliberation: 1,
  surv: 3, icept: 1, nc3: 3, nc3Cap: 6, legit: 1, incomeBase: 2,
  arsenal: { silo: 1, mobile: 1, sub: 0, air: 0 },
  warheads: 12, // overwritten by the world's true count at switch time
  traits: ['THE BOMB IS NEW — THE TUNNELS ARE NOT.', 'THE STRAIT — a fifth of the world’s oil answers to your coastline.', 'LIABILITY: NEIGHBORHOOD — nervous instruments and close borders: extra indications, read hotter.'],
  economy: 'SANCTIONED — THE OIL FLOWS ANYWAY, DISCOUNTED, THROUGH FRIENDS OF FRIENDS.',
  government: 'DUAL STATE — THE BUDGET CLEARS TWO GOVERNMENTS AND ONE OFFICE ABOVE BOTH. EXTRACTION 1.8×.',
  customersStart: 0,
  flags: { hotSeat: true, paranoia: true, opaque: true }, // markets open (barely) at legitimacy 5
  botWeights: { harden: 3, icept: 1, nc3: 2, integrate: 1, assure: 0, cyber: 3, cybernc3: 1, diplo: 0 },
  botAggression: 0.7,
}

// 'RUSSIAN FEDERATION' on THE RECORD is faction 'RUSSIA'; 'IRAN' maps to the
// minor-power blip. Loose prefix match so volleys always find their map dots.
export const factionIdByName = (n?: string) => {
  if (!n) return undefined
  if (n === 'IRAN') return 'iran'
  return FACTIONS.find((f) => n === f.name || n.startsWith(f.name) || f.name.startsWith(n))?.id
}

export const SPEEDS = [
  { id: 'accessible', label: 'ACCESSIBLE — 1 MIN = 6 SEC', secPerMin: 6 },
  { id: 'standard', label: 'STANDARD — 1 MIN = 3 SEC', secPerMin: 3 },
  { id: 'hard', label: 'HARD — 1 MIN = 2 SEC', secPerMin: 2 },
] as const

export type SpeedId = (typeof SPEEDS)[number]['id']
