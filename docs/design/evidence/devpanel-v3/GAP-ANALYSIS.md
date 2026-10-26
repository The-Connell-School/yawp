# Dev panel v3: why Claude Design and #841 drifted apart

Written 2026-10-26, 2:50 PM CT, after Bryant called the #841 implementation "atrocious."

PR: https://github.com/The-Connell-School/yawp/pull/841 (merged squash `e537e5b7` from `8b924cb60`, ~11:11 AM CT, LIVE on prod and demo)

Design artifact: https://claude.ai/artifact/1pByUxigJ5SjW5AzqryTHj

Implementation source (required): `/workspace/design/devpanel-v3/artifact-source.html` (pending export from artifact).

See uploads/GAP-ANALYSIS.md for sections (a)–(c). Section (d) is pasted into PR bodies for Ship Review.

## (d) Checklist Platform pastes into every Claude-Design-backed PR

```
### Claude Design conformance (required — any MISS = BLOCK)
Design source: <artifact URL> · Frames: <path/NN-*.png list> · BRIEF: <path>
Screens captured on: <demo|preview URL> @ 1280x800, state/user/route matching each frame

| Frame | Design PNG | Impl screenshot | Verdict |
|---|---|---|---|
| NN-slug | ![](…) | ![](…) | MATCH/PARTIAL/MISS |

Per-frame checks (answer for every frame):
- [ ] Same regions in same order (header, rows, footer, flyouts); nothing added/removed
- [ ] Header: title size/weight matches; no truncation/ellipsis; icon + text + chevron on one midline
- [ ] Type scale & density match (row heights, paddings, font sizes) — no global h1/h2 bleed
- [ ] Every control matches type (toggle vs checkbox, × vs "Close", pill vs text, accordion vs flat list)
- [ ] All copy matches word-for-word (labels, helper text, placeholders, hints, status like "Writing…")
- [ ] Active/selected/hover/focus states shown where the frame shows them
- [ ] Edges: border vs shadow exactly as designed
- [ ] BRIEF must-fix items each verified visually (list them, MATCH/MISS)
- [ ] Sticky-note items implemented or listed as deviations
Deviations (intentional, with reason): …
Reviewer: I opened every design PNG and impl screenshot above: yes/no
```
