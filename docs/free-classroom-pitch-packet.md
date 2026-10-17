# Free classroom trial pitch packet

An active FREE_CLASSROOM teacher opens **Trial pitch packet** beside **Share this
report** on My Classes. `/app/pitch-packet` is an authenticated, read-only page.
The loader independently requires authentication, active teacher membership, the
existing free-tier feature gate and the existing onboarding, approval and expiry
gate, including independent `.data` requests. Scope comes only from the session
membership. Query parameters cannot choose a teacher, organization or class.
Personalized responses are private/no-store.

The packet uses `getClassroomActivityReport` and `classroomReportSummary` from the
merged activity report. It has exactly the same counts, scope and definitions;
see [the activity report documentation](free-classroom-activity-report.md).
All-zero activity retains the evaluation checklist and next steps. No identities,
writing, grades, credentials or authenticated URLs are included in the document.

`pitchPacketSections` is the common document model for rendered sections, the
plain-text clipboard output and browser print. Print hides app chrome and all
controls. The selectable plain-text packet is always available, with visible
recovery feedback when clipboard access fails. Copy and print send nothing. The
page explicitly explains that a page link does not grant administrator access.
Public privacy/terms URLs remain in the document; authenticated navigation links
are controls only and are excluded from the copied/printed packet.

## Capability sources

- Seat and active-class limits come from `getEntitlementsForPlan('FREE_CLASSROOM')`
  in `app/utils/entitlements.server.ts`, rather than duplicated numbers.
- The three bundle kinds are defined by `FREE_CLASSROOM_ASSIGNMENT_QUOTAS`,
  provisioned by `app/domain/free-tier/provision-free-classroom.server.ts` and
  seeded by `packages/prisma/scripts/seed-free-tier-bundle-assignment-types.ts`.
- Per-type creation limits and remaining allowances use
  `app/utils/assignment-quota.server.ts`; the labels appear in
  `app/components/assignments/assignment-creation-sheet.tsx`.
- Roster and assignment workflows remain on My Classes and the existing class
  routes. The packet does not initiate an approval or change any entitlement.
- `/privacy` and `/terms` are existing public legal routes. Evaluation questions
  are prompts for local discussion, not claims about compliance or efficacy.
- The existing teacher gate is `app/domain/free-tier/free-tier-gate.server.ts`.
  The feature gate retains its existing demo handling.

No pricing, trial duration, automatic upgrade, contractual commitment or efficacy
claim is added. Recorded activity is explicitly not evidence of learning gains.

## Local checks

Use `./bin/project capabilities --json`, `doctor`, `bootstrap --fresh`,
`fixture verify local-dev` and `dev start`. In execution environments that clean
up descendants when a shell exits, start the runtime and run Playwright in that
same shell, with `./bin/project dev stop --json` in an EXIT trap.

Run from services/web-app in separate processes to isolate route module mocks:

```
CI=1 bun test app/utils/pitch-packet.test.ts app/utils/classroom-report.test.ts app/utils/classroom-report.server.test.ts
CI=1 bun test app/routes/app.pitch-packet/route.test.ts
CI=1 bun test app/routes/app.classroom-report/route.test.ts
```

Run `./bin/project test --profile typecheck --json` from the repository root.
With `E2E_DATABASE_URL` pointing to the disposable local database and
`PACKET_BASE_URL` to the CLI runtime, run:

```
CI=1 playwright test --config playwright.pitch-packet.config.ts --workers=1
```

The suite shares the activity report's persisted fixture helper and normal
password login. Run the packet and report suites separately because each resets
those fixture records. Browser checks cover desktop/mobile content, plain-text
agreement, copy success/denial, print visibility, public and teacher navigation,
zero activity, another teacher and organization, and denied normal/direct data
requests. Clipboard and `window.print` are stubbed; native permission and print
dialogs are not automated. No external AI or email service is called.

`PACKET_BEFORE=1` captures the original My Classes entry surface and does not visit
the new route. `PACKET_SHOTS` writes screenshots with a source SHA, URL, viewport,
capture time and disposable-fixture provenance manifest. Use the existing
`PW_EXECUTABLE_PATH` override if the pinned browser cache is located elsewhere;
do not install a separate Playwright runtime.
