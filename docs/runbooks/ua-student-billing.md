# University of Alabama student billing

The UA student license is a one-time $50 payment. It grants access through
December 31, 2026. Teachers keep their existing invitation-only onboarding and
never enter this checkout.

## Partner hostname

The canonical student entry is:

`https://ua.yawp.school/?organizationCode=<student-facing-code>`

The UA hostname uses the same `/auth/login` and `/auth/inv/signup` routes as
regular Yawp. Host detection supplies only the Alabama + Yawp auth branding and
UA student enrollment behavior. Cookies intentionally omit a `Domain`
attribute, so UA partner context and authenticated sessions remain isolated
from `yawp.school`. The legacy `/ua`, `/ua/sign-in`, and `/ua/sign-up` routes
remain available during the compatibility window but are not canonical links.

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

The webhook endpoint can remain on the exact default preview URL, for example
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

The browser flow runs on `https://ua-pr-123.preview.yawp.school`. Its one-click
URL carries both independent codes:

`https://ua-pr-123.preview.yawp.school/?code=<preview-access-code>&organizationCode=<ua-partner-code>`

Stripe Checkout success and cancellation return to the `ua-pr-123` hostname;
the webhook stays on `pr-123` because it is server-to-server and shares the
same application and database.

## Production cutover

Create a live-mode one-time $50 price and a live webhook endpoint at
`https://yawp.school/api/stripe/webhook` with the same event list. Then provide
these Terraform inputs through the existing protected deployment secret path:

```text
ua_student_billing_enabled=true
ua_organization_id=<production University of Alabama Organization.id>
ua_partner_hostname=ua.yawp.school
yawp_app_origin=https://ua.yawp.school
stripe_secret_key=<live Stripe secret key>
stripe_webhook_secret=<live endpoint signing secret>
stripe_ua_2026_price_id=<live one-time Price.id>
stripe_ua_existing_subscription_price_ids=[<legacy recurring Price.id>, ...]
```

Terraform stores the two Stripe secrets in AWS Secrets Manager and passes only
their ARNs to App Runner. The other values are ordinary runtime configuration.
The App Runner update fails before deployment if billing is enabled with an
incomplete configuration.

Terraform also adds `ua.yawp.school` to the CloudFront aliases and ACM
certificate and creates Route 53 A/AAAA aliases. The production Stripe webhook
continues to use `https://yawp.school/api/stripe/webhook`; no second endpoint is
required for the UA browser hostname.

Before enabling checkout, run the existing-subscription reconciliation script
in dry-run mode, review its counts, and then apply it. This prevents a student
with a qualifying prior subscription from paying again.

## Cancellation, refunds, and disputes

There is no subscription to cancel because this is a one-time fee. A student
can leave Stripe Checkout before paying and return later. A completed payment
activates the license. A full refund or a lost dispute revokes access; a
reinstated dispute restores it. Partial refunds remain an operator review case.
