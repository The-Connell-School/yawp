# Independent Ship Review r1 — PR #860 (Dev panel v3 visual / Claude Design)

**Reviewer:** Platform visual Ship Review (independent; not PR author)  
**PR:** https://github.com/The-Connell-School/yawp/pull/860  
**Branch:** `cursor/dev-panel-design-v3-ef97`  
**Reviewed head SHA:** `3933ce0763a153d937cb856d3d592ad908d2c861` (`3933ce076`)  
**GitHub `headRefOid` at review time:** `3933ce0763a153d937cb856d3d592ad908d2c861` — **matches; freshness OK**

**Design source:** `design/devpanel-v3/html/*.dc.html` · **BRIEF:** `design/devpanel-v3/README.md`  
**Design PNGs (1280×800):** supplied with review task (QA reference paths `design/devpanel-v3/01-…` through `05-…`; not committed at this SHA)  
**Impl PNGs:** `design/devpanel-v3/impl-2026-10-26/01-…` through `05-…` (committed)  
**Evidence note:** `docs/design/evidence/devpanel-v3/SHIP-REVIEW-D-2026-10-26.md`, `DC-REDIFF.md`, `GAP-ANALYSIS.md`

**I opened every design PNG and impl screenshot: yes**  
(Design frames from review attachments; impl frames read from repo paths above.)

---

## Per-frame verdict summary

| Frame | Design PNG | Impl PNG | Verdict | One-line deviation |
| --- | --- | --- | --- | --- |
| 01 locked beaker | `01-locked-beaker-desktop-1280.png` | `impl-2026-10-26/01-locked-beaker-desktop-1280.png` | **PARTIAL** | Master preview seat → unlocked beaker (no lock badge / locked tooltip); capture on `/app/assignments` not design `/teacher/dashboard`. |
| 02 unlocked default | `02-unlocked-default-desktop-1280.png` | `impl-2026-10-26/02-unlocked-default-desktop-1280.png` | **PARTIAL** | Panel chrome matches `.dc.html`; org **Yawp Local Dev**, free-tier **None**, user **Alex Teacher**, route `/app/assignments` vs design Lincoln HS, usage summary, Jordan, dashboard. |
| 03 Give feedback flyout | `03-give-feedback-flyout-desktop-1280.png` | `impl-2026-10-26/03-give-feedback-flyout-desktop-1280.png` | **PARTIAL** | Feedback sheet + pin **Writing…** match `FeedbackSheet.dc.html`; Page field `/app/assignments` and app shell differ from artboard `/teacher/dashboard`. |
| 04 Free-tier flyout | `04-free-tier-flyout-desktop-1280.png` | `impl-2026-10-26/04-free-tier-flyout-desktop-1280.png` | **PARTIAL** | States sheet structure, switch, filter, selected footer, Jump CTA align; catalog is product `FREE_TIER_STATE_GROUPS` (fewer accordion groups / admin rows than design artboard). |
| 05 signed-out `/free` + feedback | `05-signed-out-free-feedback-desktop-1280.png` | `impl-2026-10-26/05-signed-out-free-feedback-desktop-1280.png` | **PARTIAL** | Give feedback flyout matches `.dc.html`; `/free` is production waitlist form not design minimal card; dev panel shows expanded Sign-in roster vs design collapsed summary rows. |

---

## Frame 01 — locked beaker

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | PARTIAL | Design: teacher **Dashboard** + closed panel + FAB. Impl: **My Assignments** + FAB only — same “panel closed” idea, wrong route/screen. |
| Header midline | N/A | Panel closed. |
| Type / density (beaker) | MATCH | Circular FAB, bottom-right; beaker-only shadow reads consistent with BRIEF. |
| Control types | PARTIAL | Design: lock badge on FAB + tooltip **Developer tools · locked · Alt+Shift+D**. Impl: no lock badge, no locked tooltip (unlocked on master preview seat). |
| Copy word-for-word | PARTIAL | Locked label not shown in capture (unlocked state). |
| Active / selected states | PARTIAL | Design specifies **locked** beaker; impl shows **unlocked** affordance. |
| Border vs shadow | MATCH | Panel closed; beaker retains shadow per BRIEF. |
| BRIEF must-fixes | PARTIAL | No Demo badge (N/A closed). Locked chrome not evidenced in PNG. |
| Sticky notes | MATCH | Beaker shadow only; no panel flyout shadow. |

**Author deviation (verify):** Master preview seat unlocks panel → no lock badge — **agree** as runtime reason; still fails strict frame-01 pixel spec until a non-master capture exists.

---

## Frame 02 — unlocked default (panel docked, sections collapsed)

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Header, signed-in row, Sign in as → Free-tier → Blackboard → Tester tools, pinned Give feedback, footer re-enter + kbd. |
| Header midline | MATCH | **Developer tools** at 13px scale with chevron on one row (no truncated mega-title in impl shot). |
| Type / density | MATCH | 32px rows, 13px labels, compact footer chips. |
| Control types | MATCH | Chevrons, sign-out link, kbd chips; no checkbox/shadow regressions visible. |
| Copy word-for-word | PARTIAL | **Yawp!** N/A in panel body; org **Yawp Local Dev** vs **Lincoln High School**; free-tier **None** vs **Approved · About half left**; user name differs. |
| Active states | MATCH | Collapsed sections; Give feedback pin shows subtitle **Note, screenshot, URL** (not Writing…). |
| Border vs shadow | MATCH | Docked panel border-only; no left shadow on panel. |
| BRIEF must-fixes | MATCH | No env/Demo badge; border-only panel; section order correct. |
| Sticky notes | MATCH | Per DC-REDIFF matched items. |

**Author deviation (verify):** Preview org **Yawp Local Dev** / free-tier **None** — **agree** (fixture data). **Not documented:** route `/app/assignments`, persona **Alex Teacher** vs design dashboard / Jordan Rivera.

---

## Frame 03 — Give feedback flyout

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Feedback flyout left of docked panel; single flyout open. |
| Header midline | MATCH | **Give feedback** + **Close feedback** ×; 40px header reads correct. |
| Type / density | MATCH | Form spacing, screenshot card, mono Page field. |
| Control types | MATCH | × close (not “Close” text); textarea, read-only Page, primary Send. |
| Copy word-for-word | MATCH | Intro **Goes straight to the Yawp! team…**, Note placeholder, **Steps to repeat it help most.**, **Attached automatically** / panel omitted from shot, **Page** / **Filled in from the page you're on.**, Ctrl+Enter hint; pin **Writing…**. |
| Active states | MATCH | Pin row **Writing…** while flyout open. |
| Border vs shadow | MATCH | Flyout border edge; no heavy shadow stack. |
| BRIEF must-fixes | MATCH | Flyout content items from GAP (a) that were MISS in #841 appear present. |
| Sticky notes | MATCH | Screenshot excludes dev panel per copy. |

**Capture vs artboard:** Page field **`/app/assignments`** vs design **`/teacher/dashboard`** — expected dynamic field, but §(d) requires matching route/user for the frame PNG pair. **Not listed** in PR “Deviations” (frame 03 claimed **MATCH**).

---

## Frame 04 — Free-tier states flyout

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | MATCH | Intro, throwaway switch + help, filter, state list, Selected footer, **Jump to this state**. |
| Header midline | MATCH | **Free-tier states** + × close. |
| Type / density | MATCH | Accordion/list density readable; footer CTA full width. |
| Control types | MATCH | **Switch** (not checkbox); × close; radio selection; **Current** badge where applicable. |
| Copy word-for-word | MATCH | Intro **Pick a state, then jump. Yawp! reloads straight into it.**; throwaway copy uses **Yawp Local Dev** / **Alex Teacher** (preview names). |
| Active states | MATCH | **Usage: a few left** selected; row highlight; footer **Selected Approved · a few left**. |
| Border vs shadow | MATCH | Sheet border; no spurious shadow on docked panel. |
| BRIEF must-fixes | PARTIAL | Free-tier flyout rebuilt vs #841; catalog shorter than design artboard. |
| Sticky notes | PARTIAL | Full **Teacher signup / Pending / Approved** group counts from design not all visible. |

**Author deviation (verify):** Product `FREE_TIER_STATE_GROUPS` trimmed vs 11-row design — **agree** (sound; documented in PR + `DC-REDIFF.md`).

---

## Frame 05 — signed-out `/free` + Give feedback

| Check (GAP §d) | Result | Notes |
| --- | --- | --- |
| Regions / order | PARTIAL | Feedback flyout + docked panel present; **Sign in as** body expanded with TEACHERS/ADMINS/STUDENTS lists vs design collapsed summary rows (**Signed out** / **Pick a login below** + chevron values only). |
| Header midline | MATCH | Dev panel + feedback headers align with `.dc.html` patterns. |
| Type / density | PARTIAL | Expanded roster increases density vs design frame. |
| Control types | MATCH | Feedback controls match frame 03 / `FeedbackSheet.dc.html`. |
| Copy word-for-word | MATCH | Feedback uses **Yawp!**; Page **`/free`**; dev panel signed-out banner copy present. |
| Active states | MATCH | Give feedback **Writing…** on pin row. |
| Border vs shadow | MATCH | Border-only panel/flyout edges. |
| BRIEF must-fixes | PARTIAL | `/free` background is production onboarding, not AppScreen mock. |
| Sticky notes | PARTIAL | Background page intentionally production. |

**Author deviation (verify):** Live `/free` onboarding vs design minimal card — **agree**. **Not documented:** signed-out panel default **expanded Sign in as** vs design **collapsed** row chrome.

---

## Intentional deviations claimed in PR (independent verification)

| Claim | Verdict |
| --- | --- |
| Frame 01: master preview seat unlocks → no lock badge | **Accept reason**; frame-01 PNG still does not prove locked UI. |
| Frame 02: preview org / free-tier strings | **Accept** for org/tier strings; **incomplete** for route/persona. |
| Frame 04: trimmed free-tier catalog | **Accept** (product catalog, documented in `DC-REDIFF.md`). |
| Frame 05: production `/free` page vs design card | **Accept** for main content; **panel collapse state** not covered. |

**Undocumented PARTIAL (blocks strict SHIP):**

- Frames **01–04:** Implementation captures **`/app/assignments`** + **Alex Teacher** / **Yawp Local Dev** while design frames **01–04** use **`/teacher/dashboard`** + **Jordan Rivera** / **Lincoln High School** (§(d) capture parity).
- Frame **03:** PR table marks **MATCH**; route/Page-field artboard mismatch is still a PARTIAL under strict checklist.
- Frame **05:** Expanded **Sign in as** roster vs design collapsed panel — not in PR deviation list.

---

## Spot checks (process)

| Check | Result |
| --- | --- |
| No `[skip preview]` on design-backed UI PR | **PASS** — PR title `fix(dev-panel): Claude Design v3 — HTML-driven chrome (WIP)`; body does not lead with skip. |
| ≥1 rendered layout test for design-backed chrome | **PASS** — `services/web-app/app/dev-panel/dev-panel-shell-header.test.tsx` (computed 13px title, 40px header). |
| No unrelated drive-by product change | **PASS** — diff scoped to dev-panel TSX/CSS, preview capture script, compose mount, e2e helpers, design docs/impl PNGs (see `git diff main...3933ce076 --stat`). |

---

## Verdict

**BLOCK**

**Reason:** Multiple **PARTIAL** outcomes are not pre-listed with reasons sufficient for §(d) strict ship (capture route/user/persona for frames 01–04; frame 05 panel default state; frame 01 does not show the locked beaker state the frame is named for). **No MISS** on implemented chrome vs `.dc.html` for open-panel/flyout flows, but **undocumented PARTIAL = BLOCK** per `GAP-ANALYSIS.md` §(c–d) and review rules.

**To unblock (suggested, non-binding):** Add deviations for artboard capture mismatch or re-capture impl PNGs on `/teacher/dashboard` with Jordan-equivalent fixture data; capture frame 01 locked beaker on a non-master preview seat; capture frame 05 with Sign in as **collapsed** to match design; keep documented catalog/`/free` exceptions.

---

*Review pinned to code SHA `3933ce0763a153d937cb856d3d592ad908d2c861`. Docs-only commit on branch tip.*
