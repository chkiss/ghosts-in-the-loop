# Refactor metrics — 2026-07-16 sweep

## Before (HEAD = index-DDdY_w7l.js, measured 06:15)
- Build (`tsc && vite build`): **6.21 s**; 47 modules
- Player JS: **414.23 kB** raw / **142.81 kB gzip** (single index chunk; gallery + all screens inside)
- CSS: 20.55 kB (gzip 5.33)
- `tsc --noEmit`: **4.75 s**
- Harness: **6.48 s**, 15/15
- Total TS/TSX LOC: **8002**; App.tsx **3374**

## After (HEAD = index-BpF9ohh4.js, measured 06:50)
- Build: **6.01 s**; 52 modules
- Player JS: **380.85 kB** raw / **132.45 kB gzip** (index) — the ?dev gallery is now a separate
  lazy chunk (DevGallery 34.20 kB / 10.85 gzip) that normal players never download
- CSS: unchanged
- `tsc --noEmit`: **4.27 s**
- Harness: **6.56 s**, 15/15
- Total LOC: **8071** (+69: module headers/imports); App.tsx **1654** (−1720)
- New modules: rules/council.ts (168), rules/endings.ts (286), ui/Ending.tsx (515),
  ui/DevGallery.tsx (808), ui/format.ts
- Dead code removed: falseOrigin() (attackers.ts)

## Comparison
| Metric | Before | After | Δ |
|---|---|---|---|
| Player bundle (raw) | 414.2 kB | 380.9 kB | **−8.1%** |
| Player bundle (gzip) | 142.8 kB | 132.5 kB | **−7.3%** (−10.4 kB per first visit) |
| Build time | 6.2 s | 6.0 s | ~flat |
| tsc time | 4.8 s | 4.3 s | −10% |
| Harness | 6.5 s | 6.6 s | flat (15/15 both) |
| App.tsx LOC | 3374 | 1654 | **−51%** |
| Total LOC | 8002 | 8071 | +0.9% (module boilerplate) |

## Read on cadence
The wins here were (a) one-time architecture debt — the gallery riding in the player
bundle, all text living in the UI shell — and (b) organizational, which pays in future
edit speed, not machine time. Build/typecheck times barely moved, so there is no
resource case for frequent sweeps. Recommended cadence: a sweep like this once per
major feature push (or when App.tsx-style hub files pass ~2000 lines again), plus a
5-minute dead-export scan before contest submission. Server load: each new player now
downloads ~10 kB less; returning players hit the PWA cache anyway.
