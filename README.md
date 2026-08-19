# Ghosts in the Loop

A browser strategy game about nuclear deterrence in the age of advanced AI. You
can just play it at [ghostsintheloop.com](https://ghostsintheloop.com/): no
install, no account, nothing to sign up for. This repo is here for anyone who
wants to read the code, check the sources, or run the balance harness.

Twenty years on nuclear watch. You take one of nine nuclear powers; the rest are
bots. You don't command: you *process*, behind glass, in a building you can't
leave. Every year you spend a budget, sit a council, and read whatever the
warning system decides to show you. Sometimes it is wrong.

The design is a trap, and it is meant to be. Every turn, the locally-optimal
move is to buy the things that feel like power: targeting, missile defense, AI
woven into your command loop. Those work, modestly. They also push the tracks
that actually end runs. A player with good wargame instincts should lose, and
the post-game screen should show them exactly which assumption broke, and when.

Fifteen endings. The close calls in the incident deck are real, the reading
assigned at end of watch is real, and no gameplay data leaves your browser.

Developed for ChinaTalk's Hot Nuke Summer AI + Nukes contest.

## Running it

Requires Node 18+.

```sh
npm install
npm run dev      # vite dev server
npm run build    # tsc && vite build → dist/
npm run preview  # serve the production build
```

There is nothing to configure. `.env` only renames the game (see
[`.env.example`](.env.example)); `src/brand.ts` carries working defaults, so a
clean clone builds as-is.

## Testing

The game has no UI test suite. It has a headless harness that plays the exact
same year loop the UI plays: spend → advance → vote/crisis → strike roll →
warning → resolve → retaliate/hold → cascade, driven by player archetypes
rather than a human. Adversarial archetypes are there to break things, not to
win.

```sh
node tools/harness.mjs [runs-per-cell]   # balance sweep + ending coverage
node tools/sat_test.mjs                  # interceptor saturation tuning probe
node tools/layout_test.mjs               # briefing-screen layout regression
```

These import `.ts` modules directly and rely on Node's built-in type stripping,
so they need **Node 22.6+** (verified on 24). On anything older, run them with
`npx tsx tools/harness.mjs` instead.

`harness.mjs` is the one that matters: it reports the reading distribution and
asserts that all **15/15 endings stay reachable**. Run it after touching
anything in `src/rules/`.

`tools/dither.py` and `tools/pngpack.py` regenerate the art (Atkinson 1-bit
dither → amber, then repacked as 1-bit paletted PNG); `tools/notebake.py` bakes
the sticky notes from language-native handwriting fonts, so players never wait
on a Nastaliq webfont to read two words. Committed art is already processed:
you only need these if you change a source image.

## Layout

| Path | What's in it |
| --- | --- |
| `src/rules/` | The simulation. World state, warnings, cascade, council, endings, assigned readings. |
| `src/sim/` | The nine factions and the seeded RNG. |
| `src/data/` | Attacker tables, real historical close calls, coastline geometry. |
| `src/ui/` | React screens: strategic board, warning modal, ending, dev gallery. |
| `public/art/` | Dithered amber PNGs; the baked sticky notes. |
| `tools/` | The harness and the art pipeline. |
| `docs/` | Design and process documents, below. |

### docs

| Document | What it is |
| --- | --- |
| [`SPEC.md`](docs/SPEC.md) | The full design spec, and the argument the game is making. |
| [`ART_SPEC.md`](docs/ART_SPEC.md) | The amber/CRT visual rules. |
| [`final-wave.md`](docs/final-wave.md) | The brief for the last round of work before release. Everything in it shipped; kept as design history. |
| [`refactor-baseline.md`](docs/refactor-baseline.md) | Before and after measurements from the July 2026 refactor: bundle size, build time, LOC. |

[`SPEC.md`](docs/SPEC.md) still carries the working title, **Stone Age in 72**:
from Jacobsen's figure for launch to global thermonuclear exchange, and LeMay's
phrase. The game shipped as *Ghosts in the Loop*; the spec is otherwise
current.

## A note on deployment

This repo is the game, not the deployment. The scripts that publish it to a
live host are deliberately not committed, and `index.html` carries an
`__OG_BASE__` placeholder in its `og:url` and `og:image` tags that a deploy step
is expected to rewrite to an absolute origin. If you deploy your own copy,
substitute it: a built `dist/index.html` will otherwise ship the literal
placeholder, which harms nothing but makes for a broken link preview.

## License

The **code** is [GPL-3.0](LICENSE). Fork it, learn from it, build on it: a
distributed derivative has to stay open too.

The **content is not**: the prose, the art, the ending text, the incident deck,
and the assigned-reading bibliography are © 2026 Chas Kissick, all rights
reserved. The GPL is a software license and was never meant to cover writing.
If you want to reuse the writing or the artwork, ask.

Bundled third-party fonts under `tools/fonts/` keep their own licenses (SIL OFL
1.1, and Apache-2.0 for one). See
[`tools/fonts/LICENSES.md`](tools/fonts/LICENSES.md). They are build-time assets
and are never served to a player.
