# PostHog Dashboard: First 100 Teacher Activation

Use the existing YAWP PostHog project. Do not create a new analytics vendor, a second PostHog project, or new secrets.

Dashboard definition: [`posthog-first-100-dashboard.json`](./posthog-first-100-dashboard.json)

## Funnel Events

| Funnel step | Event name | Emitted from | Key filters |
| --- | --- | --- | --- |
| QR/event-link scan | `free_tier.scan` | `/free?t=...` loader after scan dedupe | `environment`, `acquisition_channel`, `source_name`, `token_label` |
| Signup/application | `free_tier.signup` | waitlist submit and event-link redemption | `environment`, `acquisition_channel`, `created`, `bypass_waitlist` |
| Teacher activation | `free_tier.activation` | free-classroom provisioning after approval | `environment`, `activation_step`, `acquisition_channel` |
| Student join | `free_tier.student_join` | free classroom student join route | `environment`, `organization_id`, `class_id` |
| First essay | `free_tier.first_essay` | successful free classroom document submission when the organization reaches one submission | `environment`, `is_first_essay`, `organization_id` |

All server-side events include `product_area=free_tier`, `environment`, and `preview_slug` when available. Acquisition segmentation uses `acquisition_channel`:

- `event_link`: QR/event-link token traffic.
- `organic`: free-tier waitlist traffic without an acquisition token.

## Funnel Identity

PostHog person identity is chained as the teacher moves through the funnel:

- Scan uses `free-tier-token:{acquisition_token_id}:{dedupe_cookie_hash}`.
- Event-link signup uses `free-tier-application:{application_id}` and aliases the scan actor when the scan cookie is present.
- Activation uses `free-tier-organization:{organization_id}` and aliases the application actor.
- Student join and first essay also use `free-tier-organization:{organization_id}`.

That gives the dashboard a connected actor path from scan -> signup/application -> activation/join -> first essay without adding secrets or changing storage. First-essay events also copy acquisition token, source, label, event, and bypass properties from the linked free-tier application so event-link / QR acquisition remains distinguishable from organic traffic.

## Suggested PostHog Setup

1. Create a dashboard named `Free tier first 100 teacher activation funnel`.
2. Add a funnel insight with steps:
   - `free_tier.scan`
   - `free_tier.signup`
   - `free_tier.activation` filtered to `activation_step = provisioned`
   - `free_tier.first_essay` filtered to `is_first_essay = true`
3. Add breakdowns for `environment`, `acquisition_channel`, `source_name`, and `token_label`.
4. Add a trends insight for `free_tier.activation`, unique by `application_id`, filtered to `activation_step = provisioned`, with a target line at 100.
5. Add a trends insight comparing `free_tier.signup`, `free_tier.activation`, and `free_tier.first_essay` broken down by `acquisition_channel`.

Use the `environment` filter to separate demo, production, and preview traffic.
