// Web Audio klaxon: two detuned square waves (440/466 Hz) beating against
// each other, lowpassed, gated into pulses. Slightly too loud on first play,
// once. Must be unlocked by the START gesture — iOS silences contexts created
// without one. (SPEC §11, §13)

let ctx: AudioContext | null = null
let running: { stop: () => void } | null = null
let firstPlay = true
let muted = false

// Settings toggle. Muting mid-klaxon silences it immediately.
export function setAudioMuted(m: boolean): void {
  muted = m
  if (m) stopKlaxon()
}

export function unlockAudio(): void {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

export function startKlaxon(): void {
  if (!ctx || running || muted) return
  const ac = ctx

  const master = ac.createGain()
  master.gain.value = firstPlay ? 0.5 : 0.34
  firstPlay = false

  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2200

  const gate = ac.createGain()
  gate.gain.value = 0

  const oscs = [440, 466].map((f) => {
    const o = ac.createOscillator()
    o.type = 'square'
    o.frequency.value = f
    const g = ac.createGain()
    g.gain.value = 0.4
    o.connect(g)
    g.connect(gate)
    o.start()
    return o
  })

  gate.connect(lp)
  lp.connect(master)
  master.connect(ac.destination)

  // Pulse gate ~2.85 Hz, scheduled ahead in batches so tab throttling can't
  // desync it audibly.
  const PERIOD = 1 / 2.85
  let t = ac.currentTime + 0.02
  const scheduleBatch = () => {
    const horizon = ac.currentTime + 1.5
    while (t < horizon) {
      gate.gain.setValueAtTime(0, t)
      gate.gain.linearRampToValueAtTime(1, t + 0.012)
      gate.gain.setValueAtTime(1, t + PERIOD * 0.55)
      gate.gain.linearRampToValueAtTime(0, t + PERIOD * 0.6)
      t += PERIOD
    }
  }
  scheduleBatch()
  const timer = setInterval(scheduleBatch, 600)

  running = {
    stop: () => {
      clearInterval(timer)
      const now = ac.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setTargetAtTime(0, now, 0.05)
      setTimeout(() => {
        oscs.forEach((o) => o.stop())
        master.disconnect()
      }, 300)
    },
  }
}

export function stopKlaxon(): void {
  running?.stop()
  running = null
}

// Single soft blip for INDICATION state — one pulse, quiet, sine-ish.
export function blip(): void {
  if (!ctx || muted) return
  const ac = ctx
  const o = ac.createOscillator()
  o.type = 'triangle'
  o.frequency.value = 880
  const g = ac.createGain()
  g.gain.value = 0
  o.connect(g)
  g.connect(ac.destination)
  const t = ac.currentTime
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.15, t + 0.01)
  g.gain.setTargetAtTime(0, t + 0.09, 0.03)
  o.start(t)
  o.stop(t + 0.4)
}
