# PLAN: admin-migrate-1 platform

- Rebase the existing `codex/admin-migrate-1-20261013` platform PR branch onto current `origin/main` while preserving the signed tester feedback API behavior and legacy admin gating.
- Confirm `/app/tester/feedback` and `/api/admin/tester-feedback` no longer expose list/export behavior, while `/api/internal/v1/tester-feedback` keeps bounded list/export and CSV escaping semantics.
- Run focused platform route/API tests, Prisma migration/package checks needed by CI, and a touched-route TypeScript check.
- Check PR #470 CI and record whether remaining failures are actionable or external preview/ACME issues.
- Reviewer fix: recapture `/app/tester/feedback` from the real moved/gated platform route with an authenticated session, replacing the rejected visual harness artifact.
- Push any focused fixes if needed, refresh PR notes if screenshots/tests change, and report exact evidence in `BUILD_RESULT.md` / `STATUS.md`.
