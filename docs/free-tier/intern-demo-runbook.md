# Friday intern demo runbook

Use this runbook for the Friday 2026-10-16 intern sandbox on demo. PRs #453, #454, #455, #456, and #457 are merged into platform main with the core CI gates green. Hosted demo browser QA is still blocked until approved preview-access and intern credentials are available, so do not recheck the hosted gate without fresh access from the manager.

## Entry flow

1. Open the approved demo URL from the manager.
2. Sign in with one assigned intern tester account.
3. Use only the seeded intern tester identities from `services/web-app/scripts/demo/create-intern-testers.ts`: `bryant+intern1@brock.software` through `bryant+intern4@brock.software`, displayed as `Intern Tester 1` through `Intern Tester 4`.
4. If credentials are provided through the approved manager-owned store, use only entries named `yawp-demo/intern-1` through `yawp-demo/intern-4`.
5. Keep any credential handoff outside the repository, issue tracker, and screenshots. Do not paste passwords into feedback.
6. Work only in demo. Do not use production, production data, production credentials, or any production admin path.

The demo reconciliation script is `services/web-app/scripts/demo/create-intern-testers.ts`. It refuses production markers, requires a demo database host, and grants tester/mock-admin flags only for those demo intern users.

## Pretend-admin scope

Pretend admin is a tester sandbox role, not real admin access. It requires the demo-only `MOCK_ADMIN_ENABLED=true` setting plus the per-user tester grant from the demo intern script.

Allowed tester pages:

- `/app/tester/waitlist`
- `/app/tester/approvals`

Pretend-admin users can exercise the free-tier waitlist and approval sandbox routes exposed for testing. They cannot access the real admin app, internal app, production controls, secrets, credential rotation, or any production operation. Revoking the per-user grant removes the tester routes on the next request.

## Feedback log

Interns should use the in-app `Log feedback` button on `/app` pages. The form asks for:

- what they did
- what happened
- what they wish it did
- optional severity

Feedback is stored as tester feedback with a sanitized relative app URL. Reviewers with real admin access can review it at `/app/tester/feedback` and export CSV through the page. Internal callers can use the signed `/api/internal/v1/tester-feedback` endpoint.

## Current QA note

The platform behavior from #453-#457 is merged. The remaining hosted demo E2E pass is intentionally blocked until approved demo credentials and preview-access credentials are provided. Preserve the existing gated-state screenshots under `codex-loop/lanes/interns/shots/intern-sandbox-qa/` as the current evidence, and resume browser QA only after access is available.
