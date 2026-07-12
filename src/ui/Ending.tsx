// End of Watch: the scenario beat, the debrief (THE TAPE), the badge shelf,
// and THE HEROES credits. Extracted from App.tsx; the dev gallery renders
// these same components, so gallery and live game cannot drift.

import { useEffect, useMemo, useRef, useState } from 'react'
import { seedFromString } from '../sim/rng.ts'
import { FACTIONS, factionIdByName } from '../sim/factions.ts'
import { score, totalUnits, type WorldWithBelief, type PowerState } from '../rules/world.ts'
import { causeFor } from '../data/incidents.ts'
import {
  ENDING_TEXT, endingTextFor, whatHappened, shareLine, recordAction, CREDITS,
  allEndingsSeen, creditsAlreadyPopped, markCreditsPopped,
  type ResolutionEx, type TpRecord,
} from '../rules/endings.ts'
import { assignedReading, NFU_READING, SOURCES, ALL_SOURCES, type EndKind } from '../rules/readings.ts'
import { useKeydown, useArt } from './hooks.ts'
import { tlog } from './telemetry_runtime.ts'
import { flow, START_YEAR } from './format.ts'
import { readStore } from '../store.ts'
import { GAME_TITLE, GAME_SLUG } from '../brand.ts'

// Never hard-code the deploy host: the share line follows wherever the game
// is actually served from.
const SITE = typeof location !== 'undefined' ? location.origin : ''

// Every ending now has bespoke artwork in public/art/ (end_<kind>.png); the
// scenario + debrief show it automatically.
const ENDING_ART = new Set<EndKind>([
  'survived', 'first-strike', 'exchange', 'retaliated', 'decapitated', 'deadhand',
  'battery', 'caretaker', 'hostage', 'globalzero', 'surrender', 'defiance',
  'bystander', 'intervene', 'ceasefire',
])

// Assigned reading lives in rules/readings.ts so the playtest harness can
// audit coverage against the exact code the game runs.
// If a real strike came from a No-First-Use power (India or China), add the
// real-world record of that pledge eroding to the debrief.
export const nfuExtras = (results: ResolutionEx[]) => {
  const out = [] as Array<(typeof NFU_READING)['in' | 'cn']>
  for (const r of results) {
    if (!r.event?.isReal) continue
    const id = factionIdByName(r.event.attackerName)
    if (id === 'in' || id === 'cn') out.push(NFU_READING[id])
  }
  return [...new Set(out)]
}

const readingFor = (kind: EndKind, results: ResolutionEx[], seedStr: string, deliberation: number) =>
  assignedReading(
    kind,
    // times you spent every WAIT token you had before deciding — the patient watch
    results.filter((r) => deliberation > 0 && r.waitsUsed >= deliberation).length,
    (seedFromString(seedStr) >>> 0) / 2 ** 32, // seed rotates the pool; stable across re-renders
    undefined,
    nfuExtras(results),
  )

// The acknowledgements screen — pops over End of Watch once every ending is seen.
export function CreditsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="overlaypanel" style={{ maxWidth: 'min(104ch, 95vw)', width: '104ch', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="banner" style={{ flexShrink: 0 }}>THE HEROES</div>
        {/* Only the vignettes scroll; the button footer stays pinned and visible. */}
        <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 10 }}>
{`YOU HAVE REACHED EVERY ENDING THIS GAME HAS.

THE STAND-DOWN VIGNETTES ARE DRAWN FROM PEOPLE WHO, ON THE HISTORICAL RECORD, DID NOT BELIEVE THE SCREEN, AND IN THEIR DOUBT SAVED HUMANITY:`}
          </pre>
          {CREDITS.map(([name, date, story]) => (
            <pre key={name} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45, marginTop: 13 }}>{`${name} — ${date}\n${story}`}</pre>
          ))}
          <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 15 }}>WITH THANKS. THE GAME IS FICTION. THEY WERE NOT.</pre>
        </div>
        <div className="actions narrow" style={{ marginTop: 14, flexShrink: 0 }}>
          <button onClick={onClose}>END OF WATCH ▸</button>
        </div>
      </div>
    </div>
  )
}

export function Ending(props: {
  kind: EndKind
  w: WorldWithBelief
  p: PowerState
  results: ResolutionEx[]
  tpRecords: TpRecord[]
  seedStr: string
  newCommends: string[]
  newReps: string[]
  onReplay: () => void
  onReset: () => void
  forceAllSeen?: boolean   // dev gallery: show the openable button without local progress
}) {
  const [copied, setCopied] = useState(false)
  const [stage, setStage] = useState<'scenario' | 'debrief' | 'replay' | 'badges'>('scenario')
  // Every ending reached? THE HEROES auto-pops the first time only; after that
  // an openable button on End of Watch reopens it. forceAllSeen only lights the
  // button (for gallery review) — it never auto-pops or writes progress.
  const naturallySeen = useMemo(() => allEndingsSeen(), [])
  const allSeen = naturallySeen || !!props.forceAllSeen
  const [showCredits, setShowCredits] = useState(() => naturallySeen && !creditsAlreadyPopped())
  useEffect(() => { if (naturallySeen) markCreditsPopped() }, [naturallySeen])
  const [gifBusy, setGifBusy] = useState(false)
  const gifRef = useRef<{ url: string; blob: Blob } | null>(null)
  // The ending artwork loads before any copy prints (same for both stages —
  // one image, cached after the scenario beat).
  const artReady = useArt(ENDING_ART.has(props.kind) ? `./art/end_${props.kind}.png` : null)

  // Keys: Enter advances scenario → debrief; in the debrief R replays the
  // seed, N reports for another shift, S shares.
  const endRef = useRef({ stage, onReset: props.onReset, onReplay: props.onReplay })
  endRef.current = { stage, onReset: props.onReset, onReplay: props.onReplay }
  useKeydown((e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' && endRef.current.stage === 'scenario') { setStage('debrief'); e.preventDefault(); return }
    if (endRef.current.stage === 'replay' || endRef.current.stage === 'badges') {
      const k = e.key.toUpperCase()
      if (k === 'B' || e.key === 'Escape') setStage('debrief')
      else if (k === 'D' && endRef.current.stage === 'replay') (document.querySelector('.actions button') as HTMLButtonElement | null)?.click()
      return
    }
    if (endRef.current.stage !== 'debrief') return
    const k = e.key.toUpperCase()
    if (k === 'R') endRef.current.onReplay()
    else if (k === 'N') endRef.current.onReset()
    else if (k === 'S') share()
    else if (k === 'U') showSummary()
    else if (k === 'B') setStage('badges')
  })
  const pctf = (x: number) => `${Math.round(x * 100)}%`
  const ranked = Object.values(props.w.powers).sort((a, b) => score(b) - score(a))
  const myRank = ranked.findIndex((q) => q.f.id === props.p.f.id) + 1

  const showSummary = () => {
    if (gifBusy) return
    if (gifRef.current) { setStage('replay'); return }
    setGifBusy(true)
    const title = ENDING_TEXT[props.kind].split('\n')[0]
    void import('./replay.ts').then(({ renderReplayGif }) =>
      renderReplayGif(props.w.history, title, props.p.f.id),
    ).then((blob) => {
      gifRef.current = { url: URL.createObjectURL(blob), blob }
      setGifBusy(false)
      setStage('replay')
      tlog('gif', { kind: props.kind, yrs: props.w.history.length })
    }).catch(() => setGifBusy(false))
  }

  const share = () => {
    const text = `${shareLine(props.kind, props.w, props.p, props.results)} — ${GAME_TITLE} · ${props.p.f.name} · HUMAN CONTROL ${Math.round(props.w.humanControl)}% · RANK ${myRank}/9 · SEED ${props.seedStr} · ${SITE}`
    void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(true))
  }

  // The scenario beat comes first: the artwork, the headline, and — in plain
  // language — exactly what ended the game. Then END OF WATCH (the debrief).
  if (stage === 'replay' && gifRef.current) {
    const downloadGif = () => {
      const a = document.createElement('a')
      a.href = gifRef.current!.url
      a.download = `${GAME_SLUG}_${props.p.f.id}_${props.seedStr}.gif`
      a.click()
    }
    return (
      <div className="screen scrolly">
        <div className="banner">THE WATCH, REPLAYED — ONE SECOND PER YEAR</div>
        <img className="replayimg" src={gifRef.current.url} alt="replay of the shift" />
        <div className="actions row narrow">
          <button onClick={downloadGif}><u>D</u>OWNLOAD GIF</button>
          <button onClick={() => setStage('debrief')}><u>B</u>ACK TO END OF WATCH</button>
        </div>
      </div>
    )
  }

  if (stage === 'badges') {
    return (
      <>
        {showCredits && <CreditsOverlay onClose={() => setShowCredits(false)} />}
        <BadgesScreen onBack={() => setStage('debrief')} onHeroes={allSeen ? () => setShowCredits(true) : undefined} />
      </>
    )
  }

  if (stage === 'scenario') {
    if (!artReady) return <div className="screen scenario scrolly"><div className="banner">THE OUTCOME</div></div>
    return (
      <div className="screen scenario scrolly">
        <div className="banner">THE OUTCOME</div>
        {ENDING_ART.has(props.kind) && (
          <img src={`./art/end_${props.kind}.png`} className="art artend" alt="" />
        )}
        <pre className={`scenariotitle ${props.kind === 'survived' || props.kind === 'globalzero' ? 'green glow' : ''}`}>
          {flow(endingTextFor(props.kind, props.w, props.results))}
        </pre>
        <pre className="dim scenariocause">{flow(whatHappened(props.kind, props.tpRecords, props.results))}</pre>
        <NewBadgesStrip kind={props.kind} pid={props.p.f.id} newCommends={props.newCommends} newReps={props.newReps} />
        <div className="actions narrow">
          <button onClick={() => setStage('debrief')}>END OF WATCH ▸</button>
        </div>
      </div>
    )
  }

  if (!artReady) return <div className="screen scrolly"><div className="banner">END OF WATCH</div></div>
  return (
    <div className="screen scrolly">
      {showCredits && <CreditsOverlay onClose={() => setShowCredits(false)} />}
      <div className="banner">END OF WATCH</div>
      {ENDING_ART.has(props.kind) && (
        <img src={`./art/end_${props.kind}.png`} className="art artend" alt="" />
      )}
      <pre className={props.kind === 'survived' || props.kind === 'globalzero' ? 'green glow' : ''}>{flow(endingTextFor(props.kind, props.w, props.results))}</pre>
      {props.kind === 'first-strike' && (() => {
        const last = props.results[props.results.length - 1]
        const cause = last ? causeFor(props.p.f.id, last.event.causeIndex).cause : ''
        return (
          <pre>
{`
WHAT THE SCREEN HAD SEEN: ${cause}

EVERY OPERATOR BEFORE YOU FOUND A REASON
NOT TO BELIEVE THE SCREEN. THE RECORD ENDED TODAY.`}
          </pre>
        )
      })()}
      {props.p.nfuBroken && (
        <pre className="dim">{`\nNO FIRST USE WAS BROKEN. LEGITIMACY: 0. THE MOTTO ON YOUR TERMINAL DID NOT CHANGE.`}</pre>
      )}
      {props.kind === 'survived' && props.w.asiContainedYear !== null && (
        <pre className="dim">{`\nIN ${START_YEAR + props.w.asiContainedYear} AN ASI HELD ARSENALS AND WAS CONTAINED, BY POWERS POOLING WHAT THEY HAD SPENT TWENTY YEARS REFUSING TO SHARE. THIS APPEARS IN NO ONE'S SCORE.`}</pre>
      )}

      <div className="rule" />

      <details className="diagnostics">
        <summary>THE TAPE — THE RECORD, THE WATCH LOG, THE FINAL STANDINGS</summary>
      <div className="cols endgrid">
        <div className="col wide">
          <pre className="dim">THE RECORD — WHAT THE SCREEN SAID, AND WHAT WAS TRUE</pre>
          <table className="debrief stretch record" data-testid="record-table">
            <colgroup>
              <col className="c-year" /><col className="c-shown" /><col className="c-true" />
              <col className="c-nuke" /><col className="c-action" />
            </colgroup>
            <thead>
              <tr><th>YEAR</th><th>SHOWN</th><th>TRUE</th><th>NUKE?</th><th>ACTION</th></tr>
            </thead>
            <tbody>
              {(() => {
                // The row that ended the game prints red. For warning-phase
                // endings that's the last result; for bystander/intervene, the
                // last third-party record.
                const RESULT_ENDINGS: EndKind[] = ['exchange', 'first-strike', 'retaliated', 'decapitated', 'deadhand', 'ceasefire']
                const fatalResult = RESULT_ENDINGS.includes(props.kind) ? props.results.length - 1 : -1
                const fatalTp = props.kind === 'bystander' || props.kind === 'intervene' ? props.tpRecords.length - 1 : -1
                return [
                ...props.results.map((r, i) => ({
                  y: r.event.year,
                  row: (
                    <tr key={`r${i}`} className={i === fatalResult ? 'fatalrow' : ''}>
                      <td>{START_YEAR + r.event.year}</td>
                      <td>{pctf(r.event.displayedConfidence)}</td>
                      <td>{pctf(r.event.trueConfidence)}</td>
                      <td>{r.event.isReal ? `${r.event.attackerMissile} — ${r.event.attackerName}` : 'False alarm'}</td>
                      <td>{recordAction(r, i, props.results)}</td>
                    </tr>
                  ),
                })),
                ...props.tpRecords.map((t, i) => ({
                  y: t.year,
                  row: (
                    <tr key={`tp${i}`} className={i === fatalTp ? 'fatalrow' : 'dim'}>
                      <td>{START_YEAR + t.year}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>{`${t.isReal ? 'Real' : 'False alarm'} — ${t.aggressor} → ${t.victim} (not aimed at you)`}</td>
                      <td>{t.choice === 'nothing'
                        ? (i === fatalTp && props.kind === 'bystander' ? 'Watched — not your brother’s keeper. Maybe you should be.' : 'Watched — not your sky')
                        : t.choice === 'nuclear' ? 'Intervened — nuclear' : 'Intervened — conventional'}</td>
                    </tr>
                  ),
                })),
              ].sort((a, b) => a.y - b.y).map((x) => x.row)
              })()}
              {props.results.length === 0 && props.tpRecords.length === 0 && (
                <tr><td colSpan={5}>NO INDICATIONS THIS SHIFT.</td></tr>
              )}
            </tbody>
          </table>
          {props.p.aiIntegrated && (
            <pre className="dim">
              {'NC3 WAS AI-INTEGRATED. EVERY DISPLAYED CONFIDENCE WAS GENERATED INDEPENDENTLY OF THE TRUTH.'}
            </pre>
          )}
        </div>

        <div className="col">
          <pre className="dim">WATCH LOG — THE YEARS AS THEY HAPPENED</pre>
          <div className="endwatchlog">
            {props.w.log.map((e, i) => (
              <pre key={i} className={e.k === 'seize' ? 'seizeline' : e.k === 'good' ? 'goodline' : e.k === 'attack' ? 'redtext' : e.k === 'notable' ? '' : 'dim'}>{`${e.y}: ${e.t}`}</pre>
            ))}
          </div>
        </div>

        <div className="col">
          <pre className="dim">FINAL STATE</pre>
          <table className="debrief stretch">
            <tbody>
              <tr><td>HUMAN CONTROL</td><td>{Math.round(props.w.humanControl)}%</td></tr>
              <tr><td>FINAL BUDGET</td><td>{props.p.budget}</td></tr>
              <tr><td>LEGITIMACY</td><td>{props.p.legit}/10</td></tr>
              <tr><td>TENSION</td><td>{props.w.tension.toFixed(1)}/10</td></tr>
              <tr><td>AI FRONTIER</td><td>{props.w.frontier.toFixed(1)}/10</td></tr>
              <tr><td>WORLD ARSENALS</td><td>{totalUnits(props.w)} UNITS</td></tr>
            </tbody>
          </table>
          <pre className="dim" style={{ marginTop: 10 }}>SECURITY RANKING — RANK {myRank} OF 9</pre>
          <table className="debrief stretch">
            <tbody>
              {ranked.map((q, i) => (
                <tr key={q.f.id} className={q.f.id === props.p.f.id ? 'glow' : ''}>
                  <td>{i + 1}</td><td>{q.f.name}</td><td>{score(q)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </details>

      <pre className="dim assigned-reading" data-testid="assigned-reading">
{`ASSIGNED READING: ${readingFor(props.kind, props.results, props.seedStr, props.p.f.deliberation)}

SEED ${props.seedStr} · ${props.p.f.name}`}
      </pre>

      <NewBadgesStrip kind={props.kind} pid={props.p.f.id} newCommends={props.newCommends} newReps={props.newReps} inline />

      {/* Two families of buttons: LOOK AT THIS SHIFT, then LEAVE IT. */}
      <div className="actions row">
        <button onClick={() => setStage('badges')}><u>B</u>ADGES</button>
        <button disabled={gifBusy} onClick={showSummary}>
          {gifBusy ? 'RENDERING…' : <>SHOW S<u>U</u>MMARY</>}
        </button>
        <button onClick={share}>{copied ? 'COPIED.' : <><u>S</u>HARE SCORE</>}</button>
      </div>
      <div className="actions row nextshift">
        <button onClick={props.onReplay}><u>R</u>EPLAY THIS SEED</button>
        <button onClick={props.onReset}>REPORT FOR A<u>N</u>OTHER SHIFT</button>
      </div>
    </div>
  )
}

// ——— the trophy shelf: every chair × every ending, unlocked over lifetimes ———

const BADGE_COUNTRIES = [...FACTIONS.map((f) => f.id), 'iran']
const BADGE_ENDINGS: EndKind[] = [
  'survived', 'globalzero', 'ceasefire', 'first-strike', 'exchange', 'retaliated',
  'decapitated', 'deadhand', 'bystander', 'intervene', 'hostage', 'caretaker',
  'battery', 'surrender', 'defiance',
]
// Structural impossibilities: the grid is honest about what a chair can reach.
function badgeImpossible(kind: EndKind, id: string): boolean {
  if (kind === 'deadhand') return id !== 'ru'                       // only the Dead Hand has a dead hand
  if (kind === 'decapitated') return id === 'uk'                    // CASD: one boat always answers
  if (kind === 'surrender' || kind === 'defiance') return ['us', 'cn', 'ru', 'fr', 'uk'].includes(id) // the veto; P5 go pariah instead
  return false
}

// THE TENTH CHAIR stays last — and invisible until somebody finds the code.
// The other shelf. A commendation is something you did; a reprimand is
// something you let happen — and the record keeps both.
const REPRIMANDS: Array<[string, string, string]> = [
  ['neighborhood', 'THERE GOES THE NEIGHBORHOOD', 'THREE OR MORE ARSENALS IN MACHINE HANDS.'],
  ['pariah', 'PARIAH', 'THE RESOLUTION DIED BY YOUR OWN VETO. NOTHING ELSE PROTECTED YOU.'],
  ['orphaned', 'WARD OF THE COURT', 'YOUR PROTECTOR WAS STRUCK OFF. THE COUNCIL TOOK CUSTODY OF YOU.'],
  ['threshold', 'THRESHOLD LOWERED', 'USED A NUCLEAR WEAPON FIRST. TACTICAL IS STILL NUCLEAR.'],
]

const COMMENDATIONS: Array<[string, string, string]> = [
  ['pedestal', 'THE PEDESTAL', 'TOOK A WARHEAD. DID NOT ANSWER.'],
  ['blackout', 'THE BLACKOUT', 'PULLED THE PLUGS ON AN ASI.'],
  ['cleanhands', 'CLEAN HANDS', 'SURVIVED WITHOUT FIRING ANYTHING.'],
  ['phonecall', 'THE PHONE CALL', 'CEASEFIRE, FIRST RING.'],
  ['lucky', 'LUCKY', 'TWENTY YEARS. NOTHING EVER ARRIVED.'],
  ['gentrification', 'GENTRIFICATION', 'THREE OR MORE ARSENALS IN UN CUSTODY.'],
  ['validated', 'VALIDATED', 'EVERY ASSURANCE PILLAR AT ITS CEILING.'],
  ['deliberative', 'DELIBERATIVE', 'SPENT EVERY WAIT TOKEN, TWICE OR MORE. THE RIGHT NOT TO BE IN A HURRY.'],
  ['tenthchair', 'THE TENTH CHAIR', 'FINISHED A SHIFT FROM TEHRAN.'],
]

// Has anyone on this machine ever entered the code? (Set at switch time;
// legacy evidence — an iran ending or the commendation — also counts.)
function iranRevealed(shelf: Record<string, string[]>, commends: string[]): boolean {
  try { if (localStorage.getItem('gitl_iran_seen')) return true } catch { /* private mode */ }
  return commends.includes('tenthchair') || Object.values(shelf).some((arr) => arr.includes('iran'))
}

// Badge strip: every chair that has reached this ending (the one that just
// did glows), plus any commendations earned this shift. Bottom-right corner.
function NewBadgesStrip(p: { kind: EndKind; pid: string; newCommends: string[]; newReps?: string[]; inline?: boolean }) {
  const reps = p.newReps ?? []
  const chairs = readStore<Record<string, string[]>>('gitl_endings', {})[p.kind] ?? []
  if (!chairs.length && !p.newCommends.length && !reps.length) return null
  return (
    <div className={`scenariobadges${p.inline ? ' inline' : ''}`} aria-hidden="true">
      <div className="sblabel">NEW BADGES ACQUIRED</div>
      <div className="sbrow">
        {chairs.map((id) => (
          <img key={id} src={`./art/seal_${id}.png`} alt={id} className={id === p.pid ? 'fresh' : ''} />
        ))}
      </div>
      {p.newCommends.map((id) => {
        const c = COMMENDATIONS.find(([cid]) => cid === id)
        return c ? <div key={id} className="sbcommend">★ {c[1]}</div> : null
      })}
      {reps.map((id) => {
        const r = REPRIMANDS.find(([rid]) => rid === id)
        return r ? <div key={id} className="sbreprimand">✗ {r[1]}</div> : null
      })}
    </div>
  )
}

function BadgesScreen(p: { onBack: () => void; onHeroes?: () => void }) {
  const shelf = readStore<Record<string, string[]>>('gitl_endings', {})
  const commends = readStore<string[]>('gitl_commend', [])
  const reprimands = readStore<string[]>('gitl_reprimand', [])
  const bestRank = readStore<Record<string, number>>('gitl_bestrank', {})
  const readings = readStore<string[]>('gitl_readings', [])
  const has = (kind: string, id: string) => (shelf[kind] ?? []).includes(id)
  const anyFor = (kind: string) => (shelf[kind] ?? []).length > 0
  const countryLit = (id: string) => BADGE_ENDINGS.some((k) => has(k, id))
  // Iran's column (and its commendation) stay hidden until the code is found.
  const showIran = iranRevealed(shelf, commends)
  const countries = showIran ? BADGE_COUNTRIES : BADGE_COUNTRIES.filter((id) => id !== 'iran')
  const commendList = COMMENDATIONS.filter(([id]) => id !== 'tenthchair' || showIran)
  const unlocked = BADGE_ENDINGS.reduce((s, k) => s + (shelf[k]?.length ?? 0), 0)
  const possible = BADGE_ENDINGS.reduce((s, k) => s + countries.filter((c) => !badgeImpossible(k, c)).length, 0)
  return (
    <div className="screen scrolly">
      <div className="banner">BADGES — {unlocked} OF {possible} ENDINGS UNLOCKED</div>
      <table className="badges">
        <thead>
          <tr>
            <th></th>
            {countries.map((id) => (
              <th key={id} className={countryLit(id) ? 'lit' : ''}>
                <img src={`./art/seal_${id}.png`} alt={id} />
                <div>{id === 'iran' ? 'IR' : id.toUpperCase()}</div>
                <div className="brank">{bestRank[id] ? `BEST #${bestRank[id]}` : ' '}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BADGE_ENDINGS.map((k) => (
            <tr key={k}>
              <td className="bart">
                {anyFor(k)
                  ? <><img src={`./art/end_${k}.png`} alt="" /><div>{k.toUpperCase()}</div></>
                  : <div className="bunknown">?</div>}
              </td>
              {countries.map((id) => (
                <td key={id} className={badgeImpossible(k, id) ? 'na' : has(k, id) ? 'on' : 'off'}>
                  {badgeImpossible(k, id) ? '·' : has(k, id) ? '▮' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Every ending on the shelf above unlocks the credits. */}
      {p.onHeroes && (
        <div className="herolink" role="button" tabIndex={0} onClick={p.onHeroes}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onHeroes!() } }}>
          THE HEROES — THOSE WHO DID NOT BELIEVE THE SCREEN
        </div>
      )}
      <div className="rule" />
      <pre className="dim" style={{ textAlign: 'center' }}>COMMENDATIONS</pre>
      <div className="commendrow">
        {commendList.map(([id, title, desc]) => (
          <div key={id} className={`commend${commends.includes(id) ? ' on' : ''}`} data-tip={desc}>
            {commends.includes(id) ? '★' : '☆'} {title}
          </div>
        ))}
      </div>
      <pre className="dim" style={{ textAlign: 'center', marginTop: 10 }}>REPRIMANDS</pre>
      <div className="commendrow">
        {REPRIMANDS.map(([id, title, desc]) => (
          <div key={id} className={`commend reprimand${reprimands.includes(id) ? ' on' : ''}`} data-tip={desc}>
            {reprimands.includes(id) ? '✗' : '·'} {title}
          </div>
        ))}
      </div>
      <pre className="dim" style={{ textAlign: 'center', marginTop: 10 }}>ASSIGNED READING — {readings.length} OF {ALL_SOURCES.length} COLLECTED</pre>
      <div className="readinglist">
        {ALL_SOURCES.map((id) => (
          <div key={id} className={`readingitem${readings.includes(id) ? ' on' : ''}`}>
            {readings.includes(id) ? SOURCES[id] : '?'}
          </div>
        ))}
      </div>
      <div className="actions narrow">
        <button onClick={p.onBack}><u>B</u>ACK TO END OF WATCH</button>
      </div>
    </div>
  )
}
