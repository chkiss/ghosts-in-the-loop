// Shared UI-layer constants/helpers with no React in them.

export const START_YEAR = 2026

// Undo authored "artificial" line wrapping: a single newline that follows a
// letter/digit/comma is a mid-sentence break — join it into a space so the text
// flows and re-wraps to the container. Sentence-ending breaks (. ! ? : " — )) and
// blank lines (paragraph breaks) are left intact. Applied at render so authored
// hard-wraps anywhere stop mattering.
export const flow = (t: string) => t.replace(/([A-Za-z0-9,])\n(?!\n)/g, '$1 ')

// A countdown as M:SS, floored at zero. One clock format for every screen.
export function mmss(gameSeconds: number): string {
  const s = Math.max(0, Math.ceil(gameSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
