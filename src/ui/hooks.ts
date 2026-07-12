// Small shared React hooks for the UI layer.

import { useEffect, useState } from 'react'

// Register a window keydown handler for the life of the component (or of
// `deps`, when the handler closes over changing state). Guards (repeat,
// modifiers, input focus) stay with each caller — they are where the
// per-screen quirks live.
export function useKeydown(handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Wait for a screen's artwork before the copy prints, so the image never pops
// in under text that already landed. Ready on decode, on error (the screen
// then renders without art, as before), or after a one-second cap so a slow
// connection can't hold the screen hostage. Pass null for screens without art.
export function useArt(src: string | null): boolean {
  const [ready, setReady] = useState(!src)
  useEffect(() => {
    if (!src) { setReady(true); return }
    let alive = true
    setReady(false)
    const done = () => { if (alive) setReady(true) }
    const img = new Image()
    img.src = src
    img.decode().then(done, done)
    const cap = window.setTimeout(done, 1000)
    return () => { alive = false; window.clearTimeout(cap) }
  }, [src])
  return ready
}
