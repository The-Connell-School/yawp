# Server admission limits

The usage meter defines the environment budget: released applications and
INVITED, ACCOUNT_CREATED, ADMIN_SUBMITTED, SENT, MANUAL_REVIEW, and APPROVED
applications consume the configured per-application amount. Budget amounts,
status definitions, production configuration and paid-plan behavior are unchanged.

| Entry point | Admission before charged side effects | Denial |
| --- | --- | --- |
| Bypass event-token redemption, new applicant or LEAD | `free_tier_release` transaction lock, release-cap count, budget transition check; then token claim and application writes | `cap_reached` (HTTP 409) or `budget_exceeded` (HTTP 402); no token use or application change |
| Waitlist batch release | Same transaction lock and cap/budget headroom; then INVITED updates | Cap-full keeps refused/skipped response; exhausted budget returns HTTP 402. Operator denials persist audit records. No email/link creation on zero releases. |
| Operator approval / reopen | Existing activation guard and release lock, including denial audits | HTTP 409 cap / HTTP 402 budget; no decision, mutation or approval hook. Already-counted approval and replay retain their slot. |
| Administrator approval link | Landed approval lock and budget transition guard from #535 | Existing handled budget denial rolls back link consumption and approval changes. |
| Student handle registration | Free-classroom seat gate and environment spend guard inside enrollment transaction | Form-level handled error; no membership, user or session writes |
| Reporter | `reserveAiRequest`, after plan/approval gates, before conversation/model work | Explicit HTTP 402 budget feedback |
| Lesson planner | `reserveAiRequest` and `aiAdmissionErrorResponse`, before conversation/messages/tools/model work | Explicit HTTP 402 budget feedback |
| Class insights | `reserveAiRequest`, before model work and insight persistence | Explicit HTTP 402 result; no insight row |
| Assigned writing first-open prompt sets | Shared free-tier approval/budget guard inside generation, including the single-flight timeout fallback; existing sets remain readable | Explicit HTTP 402 paused screen/action alert; no provider call, fallback set or saved prompts. Paid generation gains no new reservation quota. |
| Assigned writing composition checks | `reserveAiRequest`, before feedback generation/attempt persistence | Explicit HTTP 402 feedback with `recorded: false` |
| Self-directed writing practice | Admission before topic-shaped generation, composition feedback, set generation and tutor work | Explicit HTTP 402 feedback and question-scoped rewrite alerts without a tutor grade; no fallback sequence, attempt or provider output |

All current `reserveAiRequest` callers handle budget exhaustion. Paid organizations
bypass the free-tier budget check and retain their existing AI reservation quotas.
Ordinary waitlist signup creates a LEAD and consumes no activation budget. Teacher
account creation redeems a slot already reserved by invitation; the existing
signed-link and replay behavior remains in place.

Event redemptions acquire the release lock before reading the existing applicant.
This makes competing new/LEAD admissions use the latest committed count, and makes
concurrent scans of one applicant reuse the same admission and token use.

Validation uses isolated Bun processes for mock-heavy files, real Postgres races,
signed operator requests with stubbed email/hooks, the web-app typecheck, and local
Playwright denial screenshots. No production migration is needed.
