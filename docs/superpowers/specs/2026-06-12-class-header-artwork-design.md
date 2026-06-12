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
  `generateClassArt` (hash → pick artwork + crop region + treatment). A given
  class always renders the same band.
- **Treatments**: three candidate visual treatments to "taste" before picking
  one (or a per-class mix):
  - **A — Postcard/plate**: natural color, shown inset within a cream card
    with a generous margin/border, like a plate in a book.
  - **B — Duotone wash**: artwork mapped into the app's cream→terracotta→
    charcoal range via an SVG/CSS duotone filter, so every piece feels
    branded regardless of its original palette.
  - **C — Crop + scrim**: a tighter, more abstract crop at full saturation
    with a subtle edge gradient for legibility — closest to "just a part of a
    piece of artwork."

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

## Out of scope (follow-up work, after tasting)

- Picking the final treatment(s) and building the production selection/crop
  algorithm (seed → artwork + crop + treatment).
- Expanding the curated library to full size and handling attribution in the
  product UI.
- Wiring the chosen treatment into `ClassArt`/`TeacherClassCard` and the class
  detail header, with tests per `AGENTS.md`.
