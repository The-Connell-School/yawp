# Free-account in-app presentation (v2)

Merge is held through the Friday October 16 intern session. The driver owns release.
No schema, policy, cap, permission, grading action, feature-setting or auth changes.

The app parent reads presentation data only for an eligible free-account teacher
while the existing free-tier gate is open. The existing demo exception still
applies. All other accounts retain the previous rendering. Documents already
matches the requested Needs Grading view; its existing status URL is used.

## Data and design discrepancies for Ship Review

- Assignment counters use `FreeClassroomAssignmentKindUsage.lifetimeCreatedCount`,
  with existing 12/3/3 limits. Deletion does not return an assignment allowance.
- Students include active roster seats and unexpired invitations, exactly as the
  existing seat guard does. A design sample omitting reserved seats may differ.
- Lesson plans count organization-wide nondeleted conversations, with the existing
  five-plan cap. Deleting a draft continues to make room for another plan.
- No “class code shared” event exists. The checklist's first completed step means
  a class code is ready to share; it does not claim a measured sharing event.
  Submission and grading steps use existing submission status, including manual
  grades. No progress or tracking writes were added.
- The current free-account join card requires the join link to create a handle
  account. The new card preserves that instruction rather than promising a new
  class-code enrollment path. Board and QR controls use the same existing link.
- The grading limiter refills token buckets continuously. The pause shows the
  actual available-token time for a blocked teacher window, not the artboard's
  sample “12 minutes” or a fabricated hourly reset.
- Reporter uses “Reporter comes with a YAWP paid plan” to comply with lane copy
  constraints. The locked page performs no report reads. Existing report API
  entitlement checks remain in place.
- “Talk to us” links lead to the existing free-account status page. No mail action
  or new external destination is introduced.
- The existing Create Class control and its blocked-cap explanation remain available on My Classes; the reference omits that control. This preserves the current action outcome rather than changing the class-creation flow.
- Existing class art, names, tables and document data remain live. Broken image
  placeholders and example students in the export are not copied into the app.

## Local verification

Use `./bin/project capabilities --json`, `doctor --json`, and
`bootstrap --fresh --json` for the pinned runtime and isolated database.
`BUN_TMPDIR`, `BUN_INSTALL_CACHE_DIR`, `XDG_CACHE_HOME`, browser temp files and
Playwright output must point into the lane-private `TMPDIR`.

- `./bin/project test --profile free-tier-inapp-unit --json`
- `NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json`
- Start the isolated server with `./bin/project dev start --json`, then run
  `./bin/project test --profile free-tier-inapp-browser --json` in that same
  process session, and always run `./bin/project dev stop --json` afterwards.
- `FREE_INAPP_REGRESSION=navigation` runs the existing join and trial-status flows against the new class heading and Usage status entry. These flows need an ephemeral local `FREE_TIER_LINK_HMAC_SECRET` and the local `PRIMARY_APP_URL` on the dev server, as in CI. No auth implementation is changed.
- `FREE_INAPP_REGRESSION=1` runs the existing quota and assignment-choice browser files.
- `PW_EXECUTABLE_PATH` can select an already installed Chromium through the supported configuration override.
- `FREE_INAPP_SHOTS` selects permanent local screenshot evidence.
- `FREE_INAPP_BEFORE=1` captures the same local states against the parent revision.

The browser profile uses one Chromium worker and only loopback URLs. It restores
quota rows, class rosters, generated local users, lesson fixtures and grading
bucket rows in `finally`. No hosted preview, AI call or mail call is needed.

Ship Review must inspect the screenshot manifest and the v2 side-by-side
artboards, verify paid and flag-off controls, and confirm CI before approval.

## Ship Review corrections

The Reporter locked presentation uses the v2 card immediately below its header:
24px top spacing, 28px card padding, a circular lock badge, left-aligned benefit
rows with icons, and a rounded action. Approved paid-plan wording and the
existing Reporter API entitlement denial remain in place.

Mobile Usage uses the existing modal Sheet primitive at the bottom of the
viewport, with full width, 16px top corners, a dimmed dashboard, and an explicit
close control. Opening it closes the navigation drawer. Escape, the close control,
and the overlay dismiss it and return focus to the visible navigation opener.
Desktop Usage retains the existing popover and restores focus to its trigger.

Focused in-app browser checks cover those layouts, ordinary and exhausted Usage,
modal focus containment, all three mobile dismissal methods, and the Reporter
API denial. Evidence uses the exported device panel dimensions: Usage at
390×1284 (board 23's measured content height is 1283.59px), Reporter at 390×844
(board 46), and the existing desktop 1440×1000 viewport. The screenshot manifest
records each capture's actual dimensions; the implementation comparisons preserve
natural screenshot sizes rather than stretching the device viewport to the export.
