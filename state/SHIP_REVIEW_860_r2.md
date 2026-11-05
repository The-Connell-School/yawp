# Independent Ship Review r2 — PR #860 (Dev panel v3 visual / Claude Design)

**Reviewer:** Platform visual Ship Review (independent; not PR author)  
**PR:** https://github.com/The-Connell-School/yawp/pull/860  
**Branch:** `cursor/dev-panel-design-v3-ef97`  
**Reviewed head SHA:** `f835a25f0242ea813e198a8edac59214a23c56ee` (`f835a25f`)  
**GitHub `headRefOid` at review time:** `f835a25f0242ea813e198a8edac59214a23c56ee` — **matches; freshness OK**

**Prior review:** `state/SHIP_REVIEW_860_r1.md` @ `3933ce076` — **BLOCK** (undocumented capture PARTIALs; frame 01 unlocked; frame 05 Sign-in-as expanded)

**Design source:** `design/devpanel-v3/html/*.dc.html` · **BRIEF:** `design/devpanel-v3/README.md`  
**Design PNGs (1280×800):** QA paths `design/devpanel-v3/01-…` through `05-…` (not committed at this SHA; opened from reviewer-supplied attachments matching those filenames)  
**Impl PNGs:** `design/devpanel-v3/impl-2026-10-26/01-…` through `05-…` (committed at head)

**I opened every design PNG and impl screenshot: yes**

---

## r2 delta vs r1 (author claims @ `f835a25f`)

| r1 blocker | r2 evidence | Result |
| --- | --- | --- |
| Frame 01 missing locked beaker | Impl `01-…`: padlock badge on FAB; `/app` teacher home (Welcome, Jordan); capture script clears panel unlock cookie and hovers beaker before shot | **Addressed** (lock badge); tooltip see frame 01 checklist |
| Frames 01–04 on `/app/assignments` | Impl `01–04`: product teacher dashboard (`Welcome, Jordan!`, class cards), not assignments index | **Addressed** |
| Frame 05 Sign-in-as expanded | Impl `05-…`: **Sign in as** row collapsed (`Yawp Local Dev` + chevron only) | **Addressed** |
| Undocumented capture PARTIALs | PR body table + six-item intentional deviation list | **Addressed at frame level** |

---

## Per-frame verdict summary

| Frame | Design PNG | Impl PNG | Verdict | One-line deviation |
| --- | --- | --- | --- | --- |
| 01 locked beaker | `01-locked-beaker-desktop-1280.png` | `impl-2026-10-26/01-locked-beaker-desktop-1280.png` | **PARTIAL** | Lock badge on closed panel at `/app` vs artboard `/teacher/dashboard` + Lincoln/Jordan Rivera chrome; product shell (North Ridge cards, extra nav items). |
| 02 unlocked default | `02-unlocked-default-desktop-1280.png` | `impl-2026-10-26/02-unlocked-default-desktop-1280.png` | **PARTIAL** | Panel chrome matches `.dc.html`; org **Yawp Local Dev**, user **Jordan Teacher**, free-tier **None** vs Lincoln / Jordan Rivera / **Approved · About half left**. |
| 03 Give feedback flyout | `03-give-feedback-flyout-desktop-1280.png` | `impl-2026-10-26/03-give-feedback-flyout-desktop-1280.png` | **PARTIAL** | Flyout copy, controls, pin **Writing…** match `FeedbackSheet.dc.html`; Page field **`/app/`** vs artboard **`/teacher/dashboard`**. |
| 04 Free-tier flyout | `04-free-tier-flyout-desktop-1280.png` | `impl-2026-10-26/04-free-tier-flyout-desktop-1280.png` | **PARTIAL** | Sheet chrome, switch, filter, selection footer, Jump CTA align; catalog is product `FREE_TIER_STATE_GROUPS` (fewer accordion groups than design artboard). |
| 05 signed-out `/free` + feedback | `05-signed-out-free-feedback-desktop-1280.png` | `impl-2026-10-26/05-signed-out-free-feedback-desktop-1280.png` | **PARTIAL** | Give feedback flyout matches `.dc.html`; live waitlist `/free` vs design minimal card; Sign-in-as **collapsed** (matches design). |

**No frame: MISS**

---

## Frame 01 — locked beaker

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | PARTIAL | Design: mock **Dashboard** + closed panel + FAB. Impl: product **`/app`** home + FAB — same closed-panel idea; background shell differs (documented). |
| Header midline | N/A | Panel closed. |
| Type / density (beaker) | MATCH | Circular FAB bottom-right; shadow on beaker only. |
| Control types | PARTIAL | Lock badge on FAB **MATCH** design. Design shows styled hover callout **Developer tools · locked · Alt+Shift+D**; impl PNG shows badge only (native `title` on hover; OS tooltip not painted in screenshot). |
| Copy word-for-word | PARTIAL | Locked callout not visible in impl PNG; `title`/aria carry copy in DOM. |
| Active / selected states | PARTIAL | Locked state evidenced by badge; hover callout not visible in PNG vs design frame. |
| Border vs shadow | MATCH | Panel closed; beaker shadow retained. |
| BRIEF must-fixes | MATCH | No Demo badge; beaker-only shadow. |
| Sticky notes | MATCH | No panel flyout shadow. |

---

## Frame 02 — unlocked default (panel docked, sections collapsed)

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Header, signed-in row, four sections, pinned Give feedback, footer re-enter + kbd. |
| Header midline | MATCH | Beaker + **Developer tools** at 13px scale + collapse chevron on one row. |
| Type / density | MATCH | 32px rows, compact footer. |
| Control types | MATCH | Chevrons, sign-out, kbd chips. |
| Copy word-for-word | PARTIAL | **Yawp Local Dev** / **None** / **Jordan Teacher** vs Lincoln / usage summary / Jordan Rivera (pre-listed). |
| Active states | MATCH | Sections collapsed; Give feedback subtitle **Note, screenshot, URL**. |
| Border vs shadow | MATCH | Border-only docked panel. |
| BRIEF must-fixes | MATCH | No env badge; section order; border-only. |
| Sticky notes | MATCH | Per `DC-REDIFF.md` matched chrome items. |

---

## Frame 03 — Give feedback flyout

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Feedback flyout left of docked panel. |
| Header midline | MATCH | **Give feedback** + × close; 40px header. |
| Type / density | MATCH | Form spacing, screenshot card, mono Page field. |
| Control types | MATCH | × close, textarea, read-only Page, Send. |
| Copy word-for-word | MATCH | Intro, Note placeholder, **Steps to repeat it help most.**, screenshot helper, Page helper, Ctrl+Enter hint; pin **Writing…**. |
| Active states | MATCH | Pin **Writing…** while flyout open. |
| Border vs shadow | MATCH | Flyout border edge. |
| BRIEF must-fixes | MATCH | Flyout content from GAP (a) present vs #841. |
| Sticky notes | MATCH | Screenshot excludes dev panel per copy. |

**Artboard capture:** Page **`/app/`** vs **`/teacher/dashboard`** — pre-listed deviation #1.

---

## Frame 04 — Free-tier states flyout

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Intro, throwaway switch, filter, list, Selected footer, Jump CTA. |
| Header midline | MATCH | **Free-tier states** + ×. |
| Type / density | MATCH | Readable list + full-width footer button. |
| Control types | MATCH | Switch, ×, radio, **Current** badge where applicable. |
| Copy word-for-word | MATCH | Intro and throwaway copy (preview names). |
| Active states | MATCH | **Usage: a few left** selected; footer **Selected Approved · a few left**. |
| Border vs shadow | MATCH | Sheet border; docked panel border-only. |
| BRIEF must-fixes | PARTIAL | Catalog shorter than design artboard (documented). |
| Sticky notes | PARTIAL | Not all design accordion group headers visible (product catalog). |

---

## Frame 05 — signed-out `/free` + Give feedback

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Feedback flyout + docked panel; **Sign in as collapsed** (r1 fix verified). |
| Header midline | MATCH | Dev panel + feedback headers per `.dc.html`. |
| Type / density | MATCH | Collapsed summary rows match design density. |
| Control types | MATCH | Feedback controls match frame 03 / `FeedbackSheet.dc.html`. |
| Copy word-for-word | MATCH | **Yawp!** in feedback; Page **`/free`**; signed-out banner copy. |
| Active states | MATCH | Pin **Writing…**. |
| Border vs shadow | MATCH | Border-only edges. |
| BRIEF must-fixes | PARTIAL | Production `/free` onboarding vs AppScreen mock (pre-listed #5). |
| Sticky notes | PARTIAL | Background page intentionally production. |

---

## Intentional deviations (PR full list) — independent verification @ PNGs

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | Route / Page: `/app` not `/teacher/dashboard` | **Accept** — impl `01–04` on teacher home; `03` Page **`/app/`**; `05` **`/free`**. |
| 2 | Fixture persona / org vs artboard | **Accept** — **Jordan Teacher**, **Yawp Local Dev**, North Ridge–style cards vs Jordan Rivera / Lincoln. |
| 3 | Free-tier row **None** (frame 02) | **Accept** — visible in impl `02`. |
| 4 | Trimmed free-tier catalog (frame 04) | **Accept** — flat/shorter list vs design accordion groups; `DC-REDIFF.md`. |
| 5 | Live `/free` background (frame 05) | **Accept** — waitlist form in impl `05`. |
| 6 | Site gate vs panel unlock cookie; frame 01 locked before unlock | **Accept** — lock badge on `01` with panel closed; separate from site gate per PR + capture script. |

**PR frame-01 note “Lock badge + locked tooltip captured”:** Lock badge **confirmed** in impl PNG. Styled tooltip box from design frame **not visible** in impl PNG (native tooltip limitation); acceptable as implementation detail **within** frame-01 **PARTIAL** + item #6, not a separate undocumented frame-level gap.

---

## Spot checks (process)

| Check | Result |
| --- | --- |
| No `[skip preview]` on design-backed UI PR | **PASS** — title/body do not skip preview. |
| ≥1 rendered layout test for design-backed chrome | **PASS** — `services/web-app/app/dev-panel/dev-panel-shell-header.test.tsx`. |
| No unrelated drive-by product change | **PASS** — diff at `f835a25f` scoped to dev-panel, preview capture, compose mount, e2e helpers, design docs/impl PNGs, r1 review doc (`git diff main...f835a25f --stat`). |

---

## Verdict

**SHIP**

**Reason:** GitHub head matches `f835a25f`. **No MISS.** All five frames are **PARTIAL** only for reasons pre-listed in the PR conformance table and intentional deviation list (1–6); r1 blockers (locked beaker badge, `/app` captures, frame 05 collapsed Sign-in-as) are **verified in impl PNGs**. Residual §(d) checklist PARTIALs (artboard route/persona, catalog trim, `/free` shell, frame-01 hover callout not painted in PNG) are covered by those listed deviations or are chrome-adjacent screenshot limits, not undocumented frame-level gaps.

---

*Review pinned to code SHA `f835a25f0242ea813e198a8edac59214a23c56ee`. Docs-only commit on branch tip.*
