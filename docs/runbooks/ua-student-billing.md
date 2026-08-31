# University of Alabama student billing

The UA student license is a one-time $50 payment. It grants access through
December 31, 2026. Teachers keep their existing invitation-only onboarding and
never enter this checkout.

## Stripe sandbox

The verified sandbox catalog is:

- Product: `prod_VAgFpOe36KPfnX`
- Price: `price_1UAKsYHOYKJAxG9PN4RfcXwN`
- Amount: $50 USD, one time

Configure the `preview-host` GitHub environment with:

- Secret `PREVIEW_STRIPE_SECRET_KEY`: a least-privilege Stripe test key
- Secret `PREVIEW_STRIPE_WEBHOOK_SECRET`: the signing secret for the preview's
  `/api/stripe/webhook` endpoint
- Variable `PREVIEW_STRIPE_UA_2026_PRICE_ID`: the sandbox price above
- Variable `PREVIEW_UA_ORGANIZATION_ID`:
  `university-of-alabama-preview`
- Variable `PREVIEW_UA_STUDENT_BILLING_ENABLED`: `true` while the UA preview is
  under test
- Optional variable `PREVIEW_STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS`: a
  comma-separated list of sandbox recurring prices used to test migration

The webhook endpoint must use the exact active preview URL, for example
`https://pr-123.preview.yawp.school/api/stripe/webhook`, and subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_reinstated`
- `charge.dispute.funds_withdrawn`

Preview webhook secrets are endpoint-specific. Rotate the secret when the
tested PR number changes, and turn the preview billing variable back off after
testing.

## Production cutover

Create a live-mode one-time $50 price and a live webhook endpoint at
`https://yawp.school/api/stripe/webhook` with the same event list. Then provide
these Terraform inputs through the existing protected deployment secret path:

```text
ua_student_billing_enabled=true
ua_organization_id=<production University of Alabama Organization.id>
yawp_app_origin=https://yawp.school
stripe_secret_key=<live Stripe secret key>
stripe_webhook_secret=<live endpoint signing secret>
stripe_ua_2026_price_id=<live one-time Price.id>
stripe_ua_existing_subscription_price_ids=[<legacy recurring Price.id>, ...]
```

Terraform stores the two Stripe secrets in AWS Secrets Manager and passes only
their ARNs to App Runner. The other values are ordinary runtime configuration.
The App Runner update fails before deployment if billing is enabled with an
incomplete configuration.

Before enabling checkout, run the existing-subscription reconciliation script
in dry-run mode, review its counts, and then apply it. This prevents a student
with a qualifying prior subscription from paying again.

## Cancellation, refunds, and disputes

There is no subscription to cancel because this is a one-time fee. A student
can leave Stripe Checkout before paying and return later. A completed payment
activates the license. A full refund or a lost dispute revokes access; a
reinstated dispute restores it. Partial refunds remain an operator review case.
