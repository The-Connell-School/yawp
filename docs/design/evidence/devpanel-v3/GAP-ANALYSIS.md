# Dev panel v3: why Claude Design and #841 drifted apart

Written 2026-10-26, 2:50 PM CT, after Bryant called the #841 implementation "atrocious."
PR: https://github.com/The-Connell-School/yawp/pull/841 (merged squash `e537e5b7` from `8b924cb60`, ~11:11 AM CT, LIVE on prod and demo)
Evidence used: BRIEF.md, NOTES.md, design frames 01–05, author-shots/*, the #841 diff and body, SHIP_REVIEW_841_r1 (docs PR #842), the r3 reviewer transcript (bc-6fb565db), and platform/NOTES.md for 10:04–11:19 CT.
The Claude artifact (1pByUxigJ5SjW5AzqryTHj) needs a sign-in and could not be fetched. Frame 06 (hover, focus, pressed) was never exported, so nobody had it.

## (a) What drifted

| BRIEF must-fix | Verdict | Evidence |
|---|---|---|
| No Demo/env badge | **MATCH** | `Badge`/`envBadge` were removed from the shell and the fallback shell. No badge appears in the author shots. |
| Border-only, no left shadow | **MATCH** | `shadow-xl`/`shadow-lg` were removed from the panel and all flyouts. There is a 1px border, `box-shadow: none` is set, and only the beaker keeps its shadow. |
| Header text + chevron aligned | **MISS** | The `<h1>` lost its size classes (`text-base font-semibold`). The 13px setting sits on the parent div, so the global `h1 { @apply text-4xl font-bold }` in `app/app.css:257` wins. The title renders at about 36px bold and gets cut to **"Developer to…"** by `truncate`. The header is not a 32px row and the chevron is not on the midline the design has. This bug is **still on main** (`dev-panel-shell.tsx:311`). |
| Denser devtools aesthetic | **PARTIAL / MISS** | The section rows did get denser (13px type, 32px rows, mono values). The giant title cancels that out, and both flyouts still look like roomy product forms. |
| Section order (Sign in as → Free-tier → Blackboard → Tester tools) | **MATCH** | The row order in `dev-panel-shell.tsx` matches the design. Class simulation moved under Tester tools; the design never covered this and the implementer chose it. |
| Give feedback pinned at bottom | **PARTIAL** | It is pinned at the bottom. The design has one row with "Note, screenshot, URL" right-aligned, a highlighted row with "Writing…" while the flyout is open, and "Re-enter access code" plus kbd chips below it. The build has a two-line row (mono subtitle) and no active or "Writing…" state. |
| Free-tier as a left flyout | **PARTIAL** | It does open to the left. But the flyout files changed by **one line each** (only the shadow class), so none of the frame 03/04 content was built: |
| · Free-tier flyout content | MISS | The design has an × close button, a toggle with explanatory copy, collapsible groups ("Teacher signup · 5 states" ▾), a "Current" pill, a "Selected: Approved · A few left" summary, and a "Jump to this state" button. The build has a "Close" text button, a bare checkbox, a flat list under uppercase headers, and no selected summary. |
| · Give feedback flyout content | MISS | The design has a placeholder, "Steps to repeat it help most.", an "Attached automatically" screenshot card, "Page" in a mono field, "Filled in from the page you're on.", and a Ctrl+Enter hint. The build has an empty note box, a bare thumbnail, a "Page URL" label, an extra "Sent as a tester" line, and no hint. |

## (b) Process failures, ranked by impact

1. **The design was translated into a code checklist and the pictures were never compared.** The author worked from NOTES.md's text list (13px, 32px rows, 12px insets, no shadow, section order) and from what the PR describes as "row chevrons + styling only." Anything that lived only in the PNGs, which includes all flyout content and the header row, was not built. The PR body still claims "Design frames matched 01–05."
2. **Ship Review signed off on visuals without looking at them.** r1's "Design alignment" section says frame 02 "matches frame" and cites class names as evidence. It gave the alignment item **Met** because of `align-items: center`, while the attached author shot shows a 36px "Developer to…". Reviews r2–r4 were delta-only (e2e helper fixes) and repeated "chrome unchanged," so nobody looked at the UI again across 4 SHIP verdicts.
3. **The only tests read source code as text.** `dev-panel-shell-chrome.test.ts` checks that strings like `envBadge` and `shadow-xl` are absent. No test renders the panel or checks layout, and r1 noted this as a "non-blocking gap."
4. **The author shots can't be compared with the frames.** They were taken signed out on localhost `/auth/login`, while frames 02–04 show a signed-in teacher on `/teacher/dashboard`. No shot showed a signed-in state or a frame 05 `/free` state. Because the states differ, comparing them side by side was hard, and nobody asked for matching shots.
5. **There was no preview build and no check on demo before merge.** The PR title has `[skip preview]`, and the merge was driven by CI. Nobody looked at demo after merge before calling it LIVE.
6. **Smaller issues:**
   - Frame 06 (hover, focus, pressed states) was never exported.
   - The mobile 390 frames are notes only.
   - The artifact link needs a sign-in, so cloud agents get only the PNGs.

   These are real gaps, but they don't explain the drift. Frames 02–05 already showed everything that was missed.

The process failed at both handoff points. Nobody required the implementer to match the pixels, and nobody required the reviewer to compare them, so the drift went through 4 SHIP verdicts. The design frames were complete enough. The implementer did not make up a new design either; most of the work just never got done.

## (c) Standing process (effective now, every Claude-Design-backed UI PR)

1. **Handoff:** the author task lists every frame path and says: "Each frame is a spec. Match its layout, copy, and controls, not only the NOTES bullets." If there is a sticky note in the design, the author implements it, or lists it in the PR as not done with a reason.
2. **No `[skip preview]`** on design-backed UI PRs. Screenshots must come from demo or a preview deploy in **the same state, route, viewport (1280×800), and user** as each frame.
3. **The PR body must have a side-by-side table:** one row per frame, with the design PNG, the implementation screenshot, and a MATCH/PARTIAL/MISS verdict for each checklist item. Anything that differs must be written as a deviation with a reason.
4. **Ship Review is a separate visual pass.** The reviewer opens both images for every frame and fills in the checklist below. A code citation never counts as visual evidence. **Any MISS blocks the merge.** A PARTIAL blocks unless the deviation was listed in advance. Delta reviews (r2+) re-check visuals whenever product TSX/CSS changed.
5. **After merge:** a demo screenshot per frame is attached to the tip-confirm note before anyone reports it LIVE.
6. **Tests:** for each design-backed component, add at least one rendered check (computed font size or height of the header, DOM section order). Source-string tests don't count as coverage for visuals.

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
