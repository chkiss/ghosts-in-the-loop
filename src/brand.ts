// Single source of truth for the game's name. Set it in .env (VITE_GAME_TITLE /
// VITE_GAME_SLUG); these fallbacks only cover a missing .env. The one place
// Vite can't reach is public/manifest.webmanifest — update it by hand.
export const GAME_TITLE: string = import.meta.env.VITE_GAME_TITLE ?? 'GHOSTS IN THE LOOP'
export const GAME_SLUG: string = import.meta.env.VITE_GAME_SLUG ?? 'ghosts-in-the-loop'
