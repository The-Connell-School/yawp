# Platform mock admin

Intern testers can use `/app/tester/waitlist` and `/app/tester/approvals` without internal app access. This capability requires both `User.mockAdminGranted = true` and `MOCK_ADMIN_ENABLED=true`. The environment flag defaults off; demo compose sets it true, while production configuration remains unchanged. The free-tier feature flag must also be enabled.

For the Friday intern sandbox, use [the intern demo runbook](./intern-demo-runbook.md).

Apply the additive migration before enabling the capability. Provision or revoke the per-user grant through the existing trusted user administration/database maintenance process in the intended environment. There is no self-service grant endpoint. A grant changes neither admin flags nor organization membership or ownership. Tester routes work without organization membership and recheck the current grant on every request; revocation takes effect on the next request.

Waitlist approval uses `releaseBatch` and `sendReleaseEmailsForApplicationIds`, preserving the release cap and access email. Queue approval/rejection and reopening share the signed internal endpoints' operator decision functions, including existing provisioning hooks. These are real free-tier state changes and emails within the selected environment, not simulated outcomes. Reopening a rejection is supported; undoing an approval or waitlist release is not supported by the existing services.

Each changed target records actor user ID, action, target ID, environment, timestamp and transition metadata in `InternalPlatformApiAudit`. The audit write is in the status-change transaction and must succeed before commit. Retries that do not change state do not create duplicate audit rows or invoke hooks. Existing internal API audit rows remain compatible through nullable additive fields.

Local verification: targeted Bun unit tests for tester routes, tester audit/decisions, internal free-tier HTTP/operator behavior and preview compose rendering; web-app typecheck and Prisma package typecheck. The browser test `tester.mock-admin.spec.ts` requires an isolated E2E server launched with `MOCK_ADMIN_ENABLED=true` and the free-tier feature enabled. No production data is required for validation.
