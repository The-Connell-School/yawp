# Class Header Artwork (Real Art) — Design

## Context

Class cards (`TeacherClassCard`) and the class detail header currently show a
thin band (`320×128`, roughly `h-32`/`h-36`) filled by `ClassArt`
(`services/web-app/app/utils/class-art.ts` +
`services/web-app/app/components/class-art.tsx`): a deterministic,
plotter-style SVG pattern generated from the class id, drawn in the app's
warm-paper palette (`#FAFAF9` paper, `#D27050` terracotta, charcoal/neutral
grays — matching `--background`/`--primary` in `app.css`). The recent teacher
workspace redesign deliberately kept this band quiet ("not a hero").

Bryant wants to replace the procedural marks with real, open-source/public-
domain artwork — "maybe even just a part of a piece of artwork" — selected on
demand per class, treated to feel cohesive with the app's existing warm
cream/terracotta aesthetic (the "Anthropic style" look the rest of the UI
already has via the cream background + terracotta primary + serif accents).

## Decisions

- **Placement**: keep the existing quiet footprint — same `320×128`-ratio band
  on class cards and the class detail header strip. No new hero treatment.
- **Sourcing**: a curated local library of public-domain artworks (sourced
  from Wikimedia Commons / museum open-access collections), bundled as static
  assets. No live external API calls at request time.
- **Selection**: deterministic by class id, same approach as today's
  `generateClassArt` (hash → pick artwork + crop variant). A given class
  always renders the same band.
- **Treatment — chosen: D, natural full bleed.** Original colors,
  edge-to-edge — no inset frame/border, no duotone filter, no vignette/scrim.
  The artwork itself is the entire band; only the crop (`background-position`/
  `background-size`) varies per class.
  - Considered and not chosen: **A — Postcard/plate** (inset frame felt like
    "outlining" the art), **B — Duotone wash** (lost too much of each piece's
    original character), **C — Crop + scrim** (felt over-cropped/zoomed with
    an unnecessary vignette).
- **Content guideline — no nudity.** This is a school app; figure studies,
  classical nudes, etc. are excluded from the curated library regardless of
  artistic merit or public-domain status. Favor landscapes, ukiyo-e and other
  woodblock prints, abstract/geometric work, botanical and scientific
  illustration, textile/pattern design, and architectural or still-life
  subjects — all of which also tend to have calm, evenly-composed regions that
  crop well full-bleed without an awkward focal point landing at the edge.

## POC scope

A standalone, throwaway exploration page — not part of the production app or
its build/test pipeline:

- `poc/class-art/` — `index.html`, `styles.css`, `images/*.jpg`
- Served via `python3 -m http.server` (no build step, no JS framework)
- Starter library (5 pieces, all Wikimedia Commons / public domain):
  1. Hokusai — *Red Fuji* (Fine Wind, Clear Morning)
  2. Hokusai — *The Great Wave off Kanagawa*
  3. Van Gogh — *Wheat Field with Cypresses*
  4. Hilma af Klint — *The Ten Largest, No. 3, Youth*
  5. William Morris — *Strawberry Thief*
- For each artwork: one row showing treatments A/B/C side by side at card
  size (`320×128`), with a mock class title below, mirroring
  `TeacherClassCard`.
- One additional section showing a single artwork cropped three different
  ways at the wider class-detail-header strip size, to demonstrate how one
  piece of art can produce many distinct-feeling headers.
- Each artwork credited (artist, title, source, license) in the POC for
  reference.

## Production scope (next)

- **Library**: ship v1 with the 5 POC pieces (Hokusai ×2, Van Gogh, Hilma af
  Klint, William Morris — all already checked against the no-nudity guideline
  and proven under treatment D). For each piece, pre-curate 3–4
  `background-position`/`background-size` crop variants by eye (not random),
  so every combination looks intentional. 5 artworks × ~3–4 variants gives
  15–20 distinct headers — plenty of variety for v1. Adding more artworks
  later is just appending data.
- **Selection**: deterministic by class id, same `hashSeed`/`mulberry32`
  approach as today's `generateClassArt` — hash → (artwork index, crop variant
  index). Same class id always renders the same result.
- **Component**: replace the inline `<svg>` render in
  `app/components/class-art.tsx` (and the spec-generation logic in
  `app/utils/class-art.ts`) with a `<div>` using
  `background-image`/`background-position`/`background-size`, used in
  `TeacherClassCard`'s art band and the class detail header strip.
- **Assets**: bundled as static files (e.g.
  `services/web-app/public/class-art/*.jpg`), sized for the band footprint
  (~800px wide, ~100–150KB — matching the POC images).
- **Attribution**: quiet credit via `title`/`aria-label` on the band
  ("Artist — Title, public domain") — available on hover / to screen readers,
  not visually intrusive.
- **Testing** (per `AGENTS.md`): unit tests for the new selection function
  (deterministic per class id, indices stay in bounds); update existing
  e2e/unit assertions that check for `svg[data-testid="class-art"]` and "no
  `bg-gradient-to-br`" since the render output changes from inline SVG to a
  styled `<div>` with a background image.

## Out of scope

- Expanding the curated library beyond the initial 5 artworks (easy follow-up
  once the pattern is in place).
- A teacher-facing picker/override UI for artwork selection.

## Addendum (2026-06-12): Persisted per-class assignment + backfill

The "deterministic by class id" selection above (`generateClassArt`,
hash → pool index) remains as a **fallback** for classes without a persisted
assignment (un-backfilled rows, e2e fixtures), but is no longer the primary
mechanism. Instead:

- The 5 artworks × 3 crop variants flatten into a single 15-item
  `CLASS_ART_POOL`, addressed by index (`CLASS_ART_POOL_SIZE = 15`).
- `Class` gets a nullable `classArtIndex Int?` column, assigned once at class
  creation and never changed afterward.
- **Goal: a teacher shouldn't see repeat artwork across their classes until
  all 15 combinations have been used.** At creation time, the new class's
  index is chosen to avoid the `classArtIndex` values of that teacher's (or
  teachers', for multi-teacher classes) most recently created classes — up to
  the last 14 — falling back to the full pool once all 15 have been used
  recently. This guarantees a rotation through every combination before any
  repeats, per teacher.
- A one-time backfill script assigns `classArtIndex` to existing classes
  using the same per-teacher rotation logic, processed in `createdAt` order.
- `ClassArt` reads `classArtIndex` when present (`getClassArtByIndex`) and
  falls back to `generateClassArt(seed)` when `null`.
