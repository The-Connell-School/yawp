# First 100 teacher dashboard operator runbook

[Dashboard definition](./posthog-first-100-dashboard.json) is a **versioned operator recipe**, not a native PostHog dashboard export or an API payload. It cannot be uploaded through a dashboard import button. This repository change is definition-ready only. No dashboard has been installed, ingestion verified, or live PostHog writes performed. An authorized operator must complete setup and record the dashboard URL and verification below in the existing YAWP project. Do not create a project or add credentials for this task.

## Event contract

All five server events use the existing `posthog-node` client, enabled only by its existing configuration. Common event properties: `product_area=free_tier`, `environment` and nullable `preview_slug`. IDs are internal opaque IDs; no email, teacher/student name, essay text, password, raw acquisition credential or scan cookie is sent. The scan actor contains only the SHA-256 cookie hash. Token labels/source/location are operator metadata.

| Event | Successful boundary and replay behavior | Identity and key properties |
| --- | --- | --- |
| `free_tier.scan` | Persisted token scan and counter, after existing 10-minute token/cookie dedupe. Repeat visits outside that window remain scans. | `free-tier-token:{token_id}:{cookie_hash}`; `acquisition_token_id`, token attribution |
| `free_tier.signup` | Newly inserted waitlist application or token redemption only. Honeypot, duplicate email, insert-race loser, denied redemption and replay emit nothing. | `free-tier-application:{application_id}`; `application_id`, `application_status`, `created=true`, `bypass_waitlist`, attribution |
| `free_tier.activation` | New free classroom provisioning transaction committed. Pending user, paid onboarding, rollback and `already_provisioned` retries emit nothing. | `free-tier-organization:{organization_id}`; `application_id`, `organization_id`, `teacher_user_id`, `activation_step=provisioned`, attribution |
| `free_tier.student_join` | New free-classroom enrollment and session both created successfully. Invalid handle/token, seat/budget denial and username collision emit nothing. | Organization actor; `student_user_id`, `membership_id`, `organization_id`, `class_id`, `join_method=student_join_link`, application/source attribution |
| `free_tier.first_essay` | Successful free-classroom solo or collaborative document submission that first brings the organization's persisted submission count to one, including archived submissions. Paid submissions, empty content, conflict/rollback and later submissions emit nothing. | Organization actor; `submission_id`, `document_id`, nullable `class_id`/`application_id`, `is_first_essay=true`, `submission_count=1` (ordinal), attribution. |

Attribution is `acquisition_channel=event_link` for token traffic (including QR links), otherwise `organic`. `acquisition_token_id`, `token_label`, `source_name`, `event_location`, ISO `event_date`, and `bypass_waitlist` follow the application into activation and first essay. Student join also includes the linked application's source, label and token ID. QR and manually opened event links share the token acquisition channel; separate campaigns using operator-assigned labels/sources. A scan is never required for organic signup.

Environment precedence: explicit `YAWP_ENVIRONMENT` wins, except reserved `PREVIEW_SLUG=demo` with a non-production runtime maps to `demo` (the deployed demo uses `YAWP_ENVIRONMENT=preview`). Next are explicit `APP_ENV`, then `DEPLOY`; absent those, a preview slug or a `/yawp_pr_` database denotes preview, then `NODE_ENV` denotes test/development/production, otherwise unknown. An explicit production runtime remains production even with a stale demo slug. `preview_slug` is preserved, including `demo` for demo. Exclude test/development/unknown from launch metrics. Do not combine demo and production toward the first 100.

## Connected identity and delivery limits

The Node SDK receives `alias({distinctId: previous, alias: new})` before capture on the new actor: scan -> application on a newly inserted event-link application, then application -> organization at new provisioning. Organic applicants begin at application. Student join and essay capture on that organization actor. These are synthetic classroom-funnel identities, separate from browser analytics/login identity; do not call identify on them or reuse them for a different person.

The real scan cookie codec is used at redemption. Missing/invalid cookies leave an unlinked scan; signup still works. Existing applications are never counted as a new signup when they later redeem a token; their earlier scan path is not retroactively reconstructed. Alias IDs must be new and cannot already belong to another previous actor. Reusing a scan cookie across applicants can produce ingestion warnings; do not force merge profiles. Inspect warnings and sample persons when verifying setup. [PostHog identity and alias rules](https://posthog.com/docs/product-analytics/identify), [Node SDK](https://posthog.com/docs/libraries/node).

Analytics is best effort. Missing client, enrichment errors, alias/capture throws and rejected client calls never undo a successful conversion. The SDK queues delivery; capture success is not ingestion proof. Free-classroom solo and collaborative submit transactions serialize the first-essay decision using an organization advisory lock. The optional count runs under a savepoint so a query failure can be rolled back without rejecting the submission; enrichment and capture run after commit. There is no durable outbox, delivery guarantee, historical backfill or retry of a replayed transition. Funnels can undercount when configuration, delivery or aliasing fails. Screenshots prove local flow behavior only.

## Manual setup in the existing project

1. Open the existing YAWP project and create a blank dashboard named **Free tier first 100 teacher activation funnel**. Do not alter runtime flags, budgets or environment configuration. Production free tier remains governed by its current flag.
2. Add a new **Funnels** insight named **All applicants to first essay (includes organic)**. Use ordered steps `free_tier.signup` -> `free_tier.activation` -> `free_tier.student_join` -> `free_tier.first_essay`, with a 30-day conversion window. Filter every step by `product_area=free_tier` and `environment=production`. Optionally duplicate a shorter signup -> activation -> first essay view for essays submitted by teachers before a student joins. Save it to this dashboard.
3. Add **Event-link / QR scan to first essay**, prepending `free_tier.scan` to those steps; filter its entry step to `acquisition_channel=event_link`. Organic traffic uses the previous insight. Keep environment filters on every step. Use person-based counting so aliases connect actors. Inspect a sample converted person's five raw events and identity links.
4. Duplicate funnel views with one entry-event breakdown at a time: `acquisition_channel` on the all-applicants funnel, `source_name` or `token_label` on the event-link funnel. Do not apply a source filter to organic users. Create separate demo and preview views by replacing **every** step's environment filter; add `preview_slug` for individual previews. A dashboard filter must not leave conflicting per-step production filters.
5. Add a new **SQL** insight using the `First 100 unique activated teachers` query verbatim from the JSON. It returns exact distinct nonempty `teacher_user_id`, target 100 and remaining for production only, over the whole instrumentation period. Optionally add an agreed launch-window `timestamp` filter and record it. Save as a table/number view. This is the authoritative target counter: do not sum daily unique users or count applications/organizations as teachers. Demo/preview counters must be separate, changing the SQL environment predicate explicitly.
6. Add Trends views for signup/activation/first essay, aggregation **Unique users**, with one acquisition or environment breakdown per saved view. Add total event counts for student joins and first essays. Trends use classroom-funnel actors, while the SQL target counts actual teacher IDs. See [Trends setup](https://posthog.com/docs/product-analytics/trends/overview).
7. After an authorized deployment and independently authorized sample transitions, verify Live events and ingestion warnings, then compare exact event/property names to the JSON contract. Confirm demo reports `environment=demo, preview_slug=demo`, an ordinary preview reports `preview` and its slug, and production is isolated. Confirm application/organization aliases connect, organic entry works, denied/replayed actions do not add conversions, and the SQL teacher count matches distinct approved fixtures. Do not enable production or send submissions just to complete this runbook.

## Verification record (operator to complete)

- Repository definition: ready after tests/typecheck/JSON validation.
- Existing PostHog project/dashboard URL: **pending**.
- Dashboard installed by / date: **pending**.
- Deployed commit and launch-window filter: **pending**.
- Live ingestion, aliases, environment and unique teacher count verified by / date: **pending**.
- Missing/duplicate event or merge-warning investigation: **pending**.

No screenshot or unit test in this PR represents an installed or verified PostHog dashboard.
