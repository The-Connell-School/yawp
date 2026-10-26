# Dev panel v3: `.dc.html` vs implementation (2026-10-26)

Source of truth: `design/devpanel-v3/html/*.dc.html` (Claude Design export). Cross-check: `*.rendered.html`.

## Matched from DevPanel.dc.html

- Desktop density: 32px section rows, 40px header, 13px row labels; mobile 44px / 52px / 14px via CSS vars.
- Popover panel surface, ink border (`foreground / 0.24`), no flyout shadow.
- Non-`h1` title (13px desktop) with ChevronsRight close + Alt+Shift+D hints.
- User row copy/layout; signed-out two-part row.
- Sign in as: Teachers / Admins / Students groups, pill **Sign in** buttons, current row highlight.
- Free-tier / Give feedback row chevrons and **Writing…** active subtitle.
- Blackboard + Tester tools bodies (LTI copy, Launch as pills, Current page + Copy).
- Footer coral **Re-enter access code** + kbd chips (2px bottom border).

## Matched from FeedbackSheet.dc.html

- Form copy, Note placeholder, screenshot card, **Page** field, Ctrl+Enter hint, 503 error copy.
- Desktop flyout header 40px, **Close feedback** ×.

## Matched from StatesSheet.dc.html

- Intro, Switch + throwaway help (on/off copy), filter, accordion groups, state buttons, Current pill, Selected footer, Jump.
- Confirm copy: **Change {name}'s test data?** / **Change data and jump**.

## Gaps / deviations (intentional or catalog-limited)

| Item | .dc / rendered | Implementation | Reason |
|---|---|---|---|
| Declined + Admin side full state lists | StatesSheet.dc (11 admin states) | Catalog groups only; admin-side 2 jumps | Product `FREE_TIER_STATE_GROUPS` — no invented jumps |
| Tester tools class simulation | Not in frames 01–05 | Populate / Clear rows | Product QA feature |
| Give feedback sent success UI | .dc “Thanks. Feedback sent.” compact | Existing sent flow + e2e strings | Backward compat with demo-feedback e2e |
| Give feedback error footer | .dc Try again + Copy feedback side-by-side | Inline alert + single footer button | Copy feedback not wired to API yet |
| Locked panel chrome | .dc list + primary **Enter access code** | Centered lock + outline button | Partial — frame 01 re-verify on preview |
| Org picker | .dc combobox + search list | Select or Command popover by org count | Same behavior; small orgs use native select |
| Frame 02 section default | rendered 02 often has BB/tools open | .dc `default` opens Sign in as only | `.dc` `sections` state opens BB/tools — use that for frame 02 QA setup |
| Throwaway badge on user row | .dc `after-jump` shows “throwaway” pill | Not shown | Needs server flag for throwaway session |

## Preview evidence

Capture @ 1280×800 on demo/preview per frame 01–05 before Ship Review; fill PR §(d) table with MATCH/PARTIAL/MISS.
