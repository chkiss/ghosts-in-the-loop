# STONE AGE IN 72 — art asset spec (aesthetic backlog)

Everything below runs through one pipeline and lands in one palette. No asset
ships raw.

## The pipeline (SPEC §11)

Source image → grayscale → contrast stretch → **Atkinson 1-bit dither** at
target resolution → map black→transparent, white→amber `#FFB000` → PNG.
The CRT layers (scanlines, bloom, vignette) come from CSS at render time and
are NOT baked in.

Implementation: ~40 lines of Python/PIL (`tools/dither.py`, to be written —
Atkinson error diffusion is 6 neighbors at 1/8 weight). Runs locally, no GPU.

## Assets needed

| # | Asset | Size (pre-dither) | Slot |
|---|---|---|---|
| 1–9 | Faction seals ×9 | 512×512 | boot/briefing seal box, ~15 chars wide rendered |
| 10 | THE BATTERY ending | 1024×640 | ending screen, above text |
| 11 | THE CARETAKER ending | 1024×640 | ending screen, above text |
| 12 | Boot emblem (title) | 512×512 | START screen |
| 13 | UNSC chamber | 1024×512 | Council screens (replaces ASCII roundtable) |

## Seal design language

Circular or shield emblem, heavy central glyph, thick strokes (survives 1-bit
at small size), no text (designation block is typeset separately). Motifs:

- **US** — eagle over crossed missiles, stars
- **CN** — mountain range over tunnel arch (三线 without writing it)
- **RU** — double-headed eagle grasping lightning
- **FR** — trident rising from waves (sub-only leg)
- **UK** — anchor and crown, wave band
- **IN** — Ashoka chakra over folded hands (NFU)
- **PK** — crescent-star over a stopwatch face (the compressed timeline)
- **IL** — blank shield with a question-mark-shaped shadow (amimut)
- **NK** — mountain (Paektu) over a radio mast

## Ending image briefs

- **THE BATTERY**: rows of human silhouettes in translucent cells receding to
  a vanishing point, cabling overhead converging on a single bright point.
  War-of-the-Worlds verticality, not Matrix-literal. High contrast; must read
  at 1-bit.
- **THE CARETAKER**: an immaculate, empty plaza at dusk; one municipal notice
  board, lit; surveillance pylons shaped like streetlamps. East Berlin with a
  perfect safety record. Stillness is the horror; no figures, or one small
  figure waiting at a crossing with no traffic.

## Does a Google Colab help?

**Yes, for steps the laptop can't do — image generation.** The split:

- **Colab (free T4 GPU)**: run SDXL or FLUX.1-schnell to generate the 13
  source images from the briefs above (black-and-white, "high contrast
  woodcut / linocut" style prompts dither best). Batch of ~8 candidates per
  asset, download the keepers. One session (~1–2h) covers everything.
- **Local (this machine)**: the Atkinson dither + amber-mapping script, and
  iteration on placement — no GPU needed, instant feedback.

Alternative: commission or hand-draw the 9 seals as vector art (they're
geometric enough), and use Colab only for the 4 scene images.

## Also in the backlog, code-side (no art needed)

- ADVISORY alert tier (dim, still — between routine and INDICATION)
- CRT quality tiers: full effects / CSS-lite (mobile) / off (reduced-motion)
- Berkeley Mono: licensed font, user-supplied file via @font-face; ship IBM
  Plex Mono (OFL) as the bundled default instead
- localStorage mid-shift save/resume
