# Local preview seat-policy QA

Selected comparison triplets, operator/flag-OFF pairs and sanitized validation are
committed here. Full originals and orphan comparisons are lane-local at
`/home/bryant/work/yawp/codex-loop/lanes/design-impl/shots/di-signon-preview-seat-policy/`.

All evidence here is **local**, using a lane-owned `yawp_pr_999565` database and
app role, the real preview access action, `PREVIEW_ACCESS_GATE=on`,
`PREVIEW_DATA_MODE=seed`, merged #573 fixtures, normal password verification,
sessions, middleware and unified sign-on handlers. No hosted request or change
was made. Historical `shots/di-signon-hosted-qa/RESULTS.md` is preserved; rows 21/22
stay blocked there until the separate #565 refresh and hosted execution.

The ordinary master-selected fixture seat reproduces both restrictions:
`multiple` proceeds with only its selected-organization membership and never
shows the picker; valid passwords for `inactive` and `orphan` are rejected by
seat policy. `before/` captures those results at 1280×1000 and 390×844. Password
inputs are masked. These are ordinary-policy baselines on the changed build;
the integration test first reproduced the restrictions against origin/main.

The supported operator context requires fresh verified generic master access,
explicit fixture account selection, eligible isolated database/role and enabled
sign-on flag. It expires after ten minutes and is bound to the current master
seat cookie and one of four exact disposable fixture identities. It changes
seat policy for that account, never authentication proof. Wrong passwords,
unrelated accounts, ordinary seat codes, unowned/inactive membership selections,
forged/expired/future/missing context, expired/forged/revoked master authority,
non-preview environments/databases and flag OFF are covered by regression tests.
An additional real-session test proves expiry/removal/tampering clears an already
authenticated orphan recovery session before the downstream handler can run.

`after/` captures the real two-choice membership picker and inactive/orphan
student recovery screens at both widths. The UI also selects the owned second
membership and opens the orphan's class-code recovery entry. `unassigned` is
verified through real handlers and retains its existing active-membership
destination. No activation/membership changes manufacture those screens.

Twenty Playwright cases pass with one worker: six ordinary-policy baselines,
six supported flows, two original/current master-picker captures each, and two
original/current flag-OFF login captures each. The master-picker before and
legacy before images run the original application modules from origin/main
`23cc0017`; the matching after images run the changed modules, with the same
local database, runtime and viewport. Both legacy login pairs have **zero changed
pixels**; see `flag-off-pixel-comparison.json`.

Fresh v2 comparison triplets are `signon-27-multiple-{1280,390}-*` and
`signon-25-{inactive,orphan}-{1280,390}-*`. Left is the supplied v2 reference;
right is the implementation. `reference-provenance.json` records PNG/DOM/copy
hashes and exact mobile crop coordinates. Existing presentation differences are
retained: the fixture has two active choices with its real names rather than
three reference placeholders; the mobile reference contains a broken logo/frame;
installed fonts affect weight/wrapping. This PR does not alter sign-on CSS or
redesign these screens. The added operator form reuses existing components/tokens
and has no supplied artboard. `picker-*-before-after.png` captures that addition.

Validation: the preview fixture profile passes 95 tests / 489 assertions,
including 12 real-DB seat-policy cases; 21 access/session/password boundary tests
and 12 CLI tests pass. Supplemental ordinary-seat coverage (one case / nine
assertions) and real-session expiry coverage (one case / 24 assertions) also pass.
Project typecheck passes. `validation-summary.json` and `tdd-evidence.md` retain
sanitized details. Early browser harness runs used the legacy error text rather
than the unified error text, and navigated before seat selection completed;
corrected waits/copy pass without changing the application or its guards.

Independent driver Ship Review and exact-head GitHub CI remain merge gates.
No migration, hosted operation, flag change outside the local disposable DB,
external email, Google login, secret operation or merge was performed. Cleanup
and the final commit/PR are recorded in state/BUILD_RESULT.md.

## Selected local comparisons

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Membership picker | [v2/current](signon-27-multiple-1280-side-by-side.png) | [v2/current](signon-27-multiple-390-side-by-side.png) |
| Inactive recovery | [v2/current](signon-25-inactive-1280-side-by-side.png) | [v2/current](signon-25-inactive-390-side-by-side.png) |
| Master picker addition | [original/current](picker-1280-before-after.png) | [original/current](picker-390-before-after.png) |
| Flag-OFF legacy login | [original/current](off-1280-before-after.png) | [original/current](off-390-before-after.png) |

[Setup and rollback runbook](../../../runbooks/unified-signon-preview-fixtures.md) ·
[Builder self-check](ship-review.md) · [Validation](validation-summary.json).
