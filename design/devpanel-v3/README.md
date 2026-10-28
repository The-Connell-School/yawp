# Dev panel v3 — Claude Design implementation source

## Source of truth (required)

Implementation markup follows **`.dc.html` Claude Design sources** under `html/` (hard rule). Use `*.rendered.html` only to cross-check DOM:

- `html/DevPanel.dc.html` — Developer tools panel
- `html/FeedbackSheet.dc.html` — Give feedback flyout
- `html/StatesSheet.dc.html` — Free-tier states flyout
- `html/AppScreen.dc.html` — App shell wrapper (frames)
- `html/*.rendered.html` — Rendered dumps for re-diff

Artifact: https://claude.ai/artifact/1pByUxigJ5SjW5AzqryTHj

PNGs (`01`–`05`) are QA-only for side-by-side MATCH/PARTIAL/MISS after HTML-driven implementation.

## QA frames (1280×800)

- `01-locked-beaker-desktop-1280.png`
- `02-unlocked-default-desktop-1280.png`
- `03-give-feedback-flyout-desktop-1280.png`
- `04-free-tier-flyout-desktop-1280.png`
- `05-signed-out-free-feedback-desktop-1280.png`

See `docs/design/evidence/devpanel-v3/GAP-ANALYSIS.md` and PR checklist §(d).
