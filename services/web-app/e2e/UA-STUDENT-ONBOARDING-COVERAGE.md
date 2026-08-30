# University of Alabama onboarding release coverage

Run the complete release-confidence suite from `services/web-app`:

```bash
bun run test:ua:ship
```

For the browser/database/Stripe-contract E2E only:

```bash
bun run test:e2e:ua
```

The Playwright suite uses Chromium, the real React Router server, the production Prisma
schema, a real disposable PostgreSQL database, the Stripe Node SDK, and a local HTTP
Stripe contract emulator. The emulator creates hosted Checkout Sessions, generates real
Stripe webhook signatures, and serves PaymentIntent/refund/dispute state. This makes
Checkout and webhook tests deterministic and fast without production data or Stripe
credentials.
The UA server clock is fixed to a 2026 test instant only when `E2E=true`, so the
active-license cases remain deterministic after the real cohort expires.

## Coverage matrix

| Area | Edge case | Proof |
| --- | --- | --- |
| Partner entry | Anonymous `/ua` establishes trusted UA context | Browser E2E + route contract |
| Partner entry | Feature disabled or missing organization is unavailable | Configuration/route contract |
| Branding | UA auth pages show only official UA logo + neutral plus + YAWP logo | Browser E2E + component contract |
| Branding | Generic auth remains YAWP-only; no application colors change | Browser E2E + component contract |
| Context security | Unsigned/tampered partner values are rejected | Cookie contract |
| New signup | UA signup requires email but no organization/class code | Browser E2E + route contract |
| New signup | Invitation contains the configured UA organization and student partner | Browser E2E + route contract |
| Verification | Email OTP carries UA context into onboarding | Browser E2E |
| Onboarding | Account is created as one classless UA student membership | Browser E2E with PostgreSQL assertion |
| Onboarding | Auth, invitation, partner, and membership cookies survive/clear independently | Route/header contract + browser E2E |
| Existing account | User without UA membership must explicitly continue before one is created | Browser E2E + route contract |
| Existing student | Existing qualifying UA membership is selected and never duplicated | Route contract + unique DB constraint |
| Teachers | UA teachers bypass billing and cannot use student self-enrollment | Browser E2E + authorization contract |
| Other organizations | Existing non-UA students and teachers remain unchanged | Browser E2E + access contract |
| Billing scope | Only students in the configured UA organization require a license | Browser E2E + access contract |
| No entitlement | All protected routes redirect to payment | Browser E2E |
| Pending | Account stays blocked until the signed webhook activates it | Browser E2E + domain contract |
| Active | Manual, imported-subscription, and Checkout licenses grant access until cutoff | Browser E2E + access contract |
| Expired | Active record past `validUntil` is denied | Browser E2E + access contract |
| Refunded | Fully refunded license is denied and may start a clean new attempt | Browser E2E + webhook contract |
| Disputed | Access is suspended and a duplicate purchase is unavailable | Browser E2E + domain contract |
| Revoked/lost | Access is denied and a clean new purchase is allowed | Browser E2E + domain contract |
| Cutoff | Sales close and access expires at the exclusive January 1 CST boundary | Time-bound route/domain contract |
| Existing subscribers | Active/trialing allowed-price subscriptions import idempotently and skip Checkout | Import contract + production adapter against PostgreSQL |
| Import safety | Bad status, wrong price, duplicate email/subscription, ambiguous membership, and conflicts fail closed | Import contract |
| Import ownership | One Stripe subscription cannot be attached to a second student's license | Production adapter against PostgreSQL |
| Checkout shape | One payment, one $50 USD line item, correct Price, Session/PaymentIntent metadata, customer/reference, and canonical callbacks | Browser E2E through Stripe SDK; emulator rejects malformed requests |
| Checkout cancel | Account remains; canceled copy, Retry, and Sign out remain available | Browser E2E |
| Checkout reuse | Cancel/retry reuses the still-open Session instead of creating another charge | Browser E2E + domain contract |
| Parallel Checkout | Simultaneous first attempts converge on one license, one Stripe idempotency key, and one hosted Session | Browser E2E through production route + PostgreSQL + Stripe SDK |
| Delayed webhook | Paid return cannot activate access; UI waits until signed webhook arrives | Browser E2E + success-route contract |
| Terminal retry | Refunded/revoked attempts never reuse the old Session | Browser E2E + domain contract |
| Checkout mismatch | Unpaid, wrong amount/currency/mode/Price/quantity/cohort/org/member Sessions fail closed | Exhaustive domain contract |
| Success ownership | Missing Session or a Session owned by another membership is rejected | Success-route contract |
| Webhook signature | Missing, invalid, or modified signed payload is rejected | Webhook route contract |
| Webhook fulfillment | Valid signed completion activates the durable PostgreSQL entitlement | Browser E2E |
| Webhook duplicate | Same event delivered concurrently produces one event/state transition | Browser E2E + PostgreSQL unique constraint |
| Webhook ordering | Current Stripe payment state wins over stale event order | Domain contract |
| Webhook concurrency | Per-PaymentIntent advisory lock prevents stale ACTIVE after REFUNDED | Concurrency contract + PostgreSQL probe |
| Partial refund | Explicit policy retains access | Browser E2E + state contract |
| Full refund | Access is revoked, duplicate event is harmless, and retry is clean | Browser E2E |
| Open dispute | Access is suspended and another payment is blocked | Browser E2E |
| Won dispute | Access restores only if payment and retained funds still qualify | Browser E2E + state contract |
| Prevented/warning-closed dispute | Access restores only if payment and retained funds still qualify | State contract |
| Lost dispute | Access is revoked | Browser E2E + state contract |
| Invalid payment | Missing charge, failed intent, wrong amount/currency, or unpaid charge revokes | Exhaustive state contract |
| Class gate | Paid classless student sees the real inert dashboard under a blocking dialog | Browser E2E |
| Class gate | Escape and outside click cannot dismiss; Sign out remains available | Browser E2E |
| Class gate | Dialog fits a 390x844 mobile viewport | Browser E2E |
| Class code | Empty/invalid code stays inline | Browser E2E + validation contract |
| Class code | Code matching is case-insensitive | Browser E2E |
| Class code | Same code in another organization cannot leak or enroll cross-tenant | Browser E2E + authorization contract |
| Class code | One matching class enrolls in place and unlocks the dashboard | Browser E2E + PostgreSQL assertion |
| Class code | Multiple same-org matches stay in the dialog for explicit selection | Browser E2E + PostgreSQL assertion |
| Class code | Forged class ID, wrong code, teacher caller, archived class, and other tenant fail closed | Authorization contract |
| Compatibility | Standalone `/enter-code` remains available | Existing route regression coverage |

## External Stripe boundary

The deterministic suite covers the application, database, Stripe SDK request contract,
hosted-checkout redirects, real webhook signatures, retries, refunds, disputes, and
concurrency. Three environmental facts remain test-mode/live smoke checks after Stripe is
configured:

1. The actual Stripe Dashboard Product/Price IDs match the configured environment.
2. Stripe can deliver from its cloud to the deployed public webhook URL.
3. The deployed environment contains the intended secrets, origin, organization ID, and
   feature-flag value.

Those are deployment configuration checks, not untested application branches. Run one
Stripe test-mode smoke against the deployed URL before enabling live billing.
