# Approval waiting preview

`free-tier-onboarding-v2` remains default OFF. No environment flags are changed.
The waiting page links to `/app/free-tier/preview` with “Look around while you
wait”. It retains #581's sent date, forwarding, and reminder behavior.

The preview stays in the small sign-in layout. A new teacher has no classroom
organization or membership until approval; previewing must not provision one.
It reuses the shipped Class Starter and thesis prompt corpora, the pre-writing
rubric, and a local Lesson Planner guide clip. Searching and paging are GETs.
Tenant IDs in query parameters do not select data. Saved prompts, student data,
assignments, and tool output are never loaded here.

## Authorization map

| Entry point | Pending teacher with flag ON | Approved, flag OFF, or other roles |
| --- | --- | --- |
| Shared `requireUserId` authentication | Allowlist of waiting, preparation, status, and preview routes; teaching reads redirect and mutations return 403 | Existing authorization applies |
| `/app/free-tier/onboarding` POST | Existing class preparation and approval submission | Existing behavior |
| `/app/free-tier/pending` POST | Existing rate-limited forwarding/reminders | Existing behavior |
| `/app/free-tier/preview` GET/HEAD | SENT and MANUAL_REVIEW only; public content | Redirect to waiting flow; existing gate handles status |
| Assignment pages, `/api/assignments/create`, attachment and prompt APIs | Denied before body parsing, uploads, or writes | Existing authorization and entitlements |
| Student management, invitation creation, class roster actions | Denied at authentication | Existing authorization |
| Public token/invitation enrollment | Approval backstop in shared seat admission; legacy `/auth/inv/onboard-student` checks the destination organization in the account/roster/session transaction before any writes | Existing enrollment rules, including legacy seat behavior |
| Assignment domain admission | Approval backstop before lifetime quota consumption | Existing quota rules |
| Reporter, Lesson Planner, packets, resource/PDF routes | Denied at authentication | Existing feature/role gates |
| Reporter and Lesson Planner tool dispatch, generation admission | Organization approval backstop before tool execution or usage reservation | Existing authorization and metering |

The lock covers ACCOUNT_CREATED and ADMIN_SUBMITTED too, while preserving the
class-preparation step. Only SENT/MANUAL_REVIEW expose preview content. A paid
membership or a different selected tenant is outside this rollout. A teacher's
application scopes flag evaluation to its organization; an unprovisioned teacher
uses the existing no-organization flag semantics, so a targeted foreign tenant
cannot enable this preview.

The legacy public onboarding action has no teacher session and does not call
`requireUserId`. Its valid class-code and invitation cookies therefore require
the same organization approval policy directly. User/password creation, student
membership, class connection, and session creation are one transaction after the
check. Single-class, multi-class and organization invitations are covered by
direct-action unit and real-database regressions. Pending enrollment returns 403
without writes; approved, flag-OFF, paid-account and tenant-targeted behavior is
preserved. Desktop/mobile browser checks also submit the actual public form.

The parent route can replace an action's 403 with a redirect into the locked
waiting flow. Browser checks accept only those waiting/preview redirects and
assert no assignment or usage writes. Real route tests invoke the authenticated
actions directly and require 403 before parsing a crafted body.

## Tours and design

#594 remains a separate PR. No tour implementation or migration is copied here.
Current main has no available guided tours. Its proposed eligibility also requires
a free-classroom teacher membership, which a new waiting teacher does not have.
After #594 lands, its eligible-tour integration needs review together with this
preview; do not relax membership eligibility or allow teaching routes to show a
tour. Protected #433 is untouched.

The v2 preview artboards 15/16 are dashboard proposals. This change uses the
required small sign-in components and their tokens rather than inventing a
pre-approval classroom/dashboard, stale quota labels, or a class join link.
The waiting references 09/10 retain the same compact form treatment. Evidence
includes the reference images beside desktop/mobile implementations.

## Local checks

Use a disposable worktree database through `./bin/project bootstrap` with `CI=1`.
Put Bun/Prisma caches under the lane's `$TMPDIR` via `BUN_TMPDIR`,
`BUN_INSTALL_CACHE_DIR`, and `XDG_CACHE_HOME`.

```
./bin/project test --profile free-tier-locked-preview-unit --json
./bin/project test --profile free-tier-locked-preview-db --json
./bin/project test --profile free-tier-locked-preview-browser --json
./bin/project test --profile free-tier-class-step-unit --json
./bin/project test --profile typecheck --json
```

The dedicated browser profile uses one worker and owns/stops its local server.
Set `LOCKED_PREVIEW_EVIDENCE_DIR` to retain screenshots and, if necessary, use
the existing supported `PW_EXECUTABLE_PATH` override for an installed browser.
The fixture never sends email. Final-head CI and independent Ship Review APPROVE
remain required before driver merge. This change has no migration.
