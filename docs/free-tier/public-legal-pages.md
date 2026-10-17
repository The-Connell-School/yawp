# Public legal pages

Recovered from closed, unmerged #477 (`386aa075`) onto `954fbaae`.
The signup route change adds links inside the existing form; its loader, action,
confirmations, cap denials, approval, entitlements and analytics remain intact.
The pages export no loaders or actions. Root uses the existing public-page path;
legal GET/HEAD requests, including React Router data URLs, pass the configured
access gate without granting a seat or authorized-activity header. Other access
rules and the `free_tier` gate remain in force.

Copy evidence in this repository:

- Account, classroom and writing workflows: Prisma models and existing app routes.
- AI processing and configured analytics: `docs/work/ua-privacy-data-security-one-pager-draft.md`,
  `app/root.tsx`, `app/services/posthog.server.ts` and the AI completion utilities.
- Event requests, approval and limits: `docs/free-tier/waitlist-and-tokens.md`,
  `app/domain/free-tier/service.server.ts`, `approval-flow.server.ts`,
  `usage-budget.server.ts` and the current signup confirmation helper.
- Support address: existing `free-tier-config.server.ts` public error message.

The recovered copy removes an unverified no-sale assertion, a retention policy
assertion and a discretionary termination claim. It makes no compliance,
provider-training, security, residency, deletion-deadline or retention guarantee.
This is a product implementation review, not a claim of independent legal review.

Focused browser coverage is `e2e/tests/free-tier.legal.spec.ts`, included in the
normal smoke command. For lane evidence, start an isolated local runtime with
`./bin/project qa prepare --routes /free,/privacy,/terms --json`, then run:

```bash
CI=1 LEGAL_BASE_URL=http://localhost:<app-port> \
  bunx playwright test --config=playwright.legal.config.ts --workers=1
```

`LEGAL_EVIDENCE_DIR` writes screenshots and a timestamped SHA/URL/viewport manifest.
`LEGAL_ONLY=true` tests anonymous legal loads when the access gate is on.
Confirmation and denial browser cases intercept only POST action responses;
GET revalidation and the rendered route remain real. These presentation fixtures
perform no applicant mutation and send no email or analytics. Real action,
service and analytics behavior is covered separately by isolated unit regressions.
Hosted demo/production and hosted preview activity are not part of this proof.
