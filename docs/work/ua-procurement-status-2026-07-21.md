# University of Alabama Procurement Status

Date: 2026-07-21

Status: **Waiting on UA**

This is the current reconciliation for GitHub issue #209. It supersedes the
operational status in the June 27 finish-line checklist without erasing the
historical evidence in that packet.

## Exact production build

- Production URL: `https://yawp.school`
- Reviewed page: `https://yawp.school/accessibility`
- Git commit: `8faad77c3a4cfd2a4b8bd37aec9f4d0a7bc61cdc`
- Successful production workflow: GitHub Actions run `29334283656`, completed
  2026-07-14
- 2026-07-21 smoke: `/api/healthcheck` returned HTTP 200 with `OK` and
  `/accessibility` returned HTTP 200 with the expected support address and WCAG
  wording.

The public page is live. Older June documents that say the page is not deployed
are historical snapshots and must not be used as the current status.

## Current external state

- Brian sent Rachel Thompson the accessibility summary and public page on
  2026-06-29 and offered student/instructor evaluator access.
- UA CISO Taylor Anderson reported a TLS/cipher access problem on 2026-07-01.
  YAWP moved behind the current CloudFront TLS edge, and Brian sent the fixed
  production URL and successful TLS/accessibility smoke evidence the same day.
- Brian followed up with Rachel on 2026-07-14. The connected mailbox contains
  no later UA response through 2026-07-21.
- The current dated procurement outcome is therefore **waiting on UA**, not
  approved and not remediation requested.

## Completed and reusable evidence

- Public accessibility statement and issue-reporting path are live.
- Automated axe, keyboard-smoke, reflow-proxy, and representative VoiceOver
  evidence is recorded with the limitations stated in the public page and WCAG
  self-evaluation.
- Teacher's Lounge caption, transcript, and visual-note remediation is recorded.
- Conservative output wording does not promise tagged PDF support.
- The AI/data answer names the configured production primary model and the
  application fallback path without claiming unverified provider training,
  retention, residency, FERPA, SOC 2, or incident-response terms.
- Evaluator delivery uses expiring named invitation links; preset credentials,
  if unavoidable, use recipient-restricted one-time shares and never plaintext
  email.

## Human/external markers

These markers do not block unrelated engineering work:

1. **HUMAN — UA response:** Rachel/UA must record approved, remediation
   requested, or provide the remaining evaluator roles and email addresses.
2. **HUMAN — evaluator identity:** Do not create evaluator access until the
   intended named recipients and roles are confirmed. Taylor Anderson's public
   TLS/page review does not authorize creation of application accounts.
3. **HUMAN — support ownership:** Confirm who actively receives
   `yawp@theconnellschool.com` and name the backup/escalation owner. The
   connected Bryant mailbox has no mail to or from that address and cannot
   prove routing or monitoring.
4. **HUMAN/LEGAL — provider terms:** Confirm the applicable Anthropic and OpenAI
   account terms before making provider-side training, retention, or contractual
   data-use claims.
5. **HUMAN — external communication:** Brian or Bryant must approve/send any
   further UA message. No automated send is authorized by this status update.

## If UA requests access

Use `docs/work/ua-evaluator-access-instructions-draft.md`. Create the minimum
role-specific access for the named reviewers, record environment and expiry,
verify student/instructor/admin boundaries and a negative cross-tenant attempt,
then disable or archive access after the review window.

## If UA requests remediation

Create one GitHub issue per distinct finding. Include the affected URL/flow,
browser or assistive technology, exact observed behavior, severity/user impact,
the production build above, and a reproducible acceptance test. Do not turn a
list of findings into an unscoped umbrella issue.
