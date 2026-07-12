// Touch tooltips: a long press on any [data-tip] element "flips the card" —
// the button expands in place and shows its tooltip text (amber for live
// buttons, dim for disabled). The next tap flips it back without firing the
// button. Mouse users keep the hover tooltips; this only arms on coarse
// pointers.

const HOLD_MS = 450

let timer: ReturnType<typeof setTimeout> | null = null
let flipped: HTMLElement | null = null
let front: string | null = null
let suppressUntil = 0

function flip(el: HTMLElement): void {
  if (flipped) unflip()
  front = el.innerHTML
  el.classList.add('tipflip')
  el.textContent = el.getAttribute('data-tip') ?? ''
  flipped = el
  suppressUntil = Date.now() + 700 // the press's own click must not fire or unflip
}

function unflip(): void {
  if (!flipped) return
  flipped.classList.remove('tipflip')
  if (front !== null) flipped.innerHTML = front
  flipped = null
  front = null
}

export function installTipFlip(): void {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return

  // Disabled buttons swallow touch events entirely, so a plain closest()
  // never finds them — hit-test their boxes by hand.
  const disabledAt = (x: number, y: number): HTMLElement | null => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tip]:disabled')) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
    }
    return null
  }

  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0]
    const el = ((e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null)
      ?? (touch ? disabledAt(touch.clientX, touch.clientY) : null)
    if (flipped && el !== flipped) unflip()
    if (!el) return
    if (el === flipped) {
      // a disabled button never emits the click that would flip it back
      if ((el as HTMLButtonElement).disabled && Date.now() >= suppressUntil) unflip()
      return
    }
    timer = setTimeout(() => { timer = null; flip(el) }, HOLD_MS)
  }, { passive: true })

  const cancel = () => { if (timer) { clearTimeout(timer); timer = null } }
  document.addEventListener('touchmove', cancel, { passive: true })
  document.addEventListener('touchcancel', cancel, { passive: true })
  document.addEventListener('touchend', cancel, { passive: true })

  // Capture phase: a tap on a flipped card flips it back and never reaches
  // the button's onClick. The long-press's own synthesized click is eaten too.
  document.addEventListener('click', (e) => {
    if (!flipped) return
    if (flipped.contains(e.target as Node)) {
      // the long press's own click keeps the card face-up; a later tap flips back
      if (Date.now() >= suppressUntil) unflip()
      e.preventDefault()
      e.stopPropagation()
    }
  }, { capture: true })

  // Long-press context menus fight the flip on Android
  document.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest?.('[data-tip]')) e.preventDefault()
  })
}
