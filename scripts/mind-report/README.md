# Investor-coaching MIND report

Generate a short call brief, full school tables, and an aggregate JSON snapshot from
production. No application deployment, migration, or production write is needed.

```sh
./bin/project report mind --production --include-aws-costs \
  --out-dir reports/mind/YYYY-MM-DD --json
./bin/project report mind --production --months 24 --include-aws-costs \
  --out-dir reports/mind/YYYY-MM-DD-two-years --json
./bin/project test --profile mind-report --json
```

The dated output directory is gitignored. Outputs contain school-level business
aggregates and should stay in the private workspace. Do not publish these as public
QA artifacts. The command refuses to overwrite an existing snapshot.

For an offline rerender using already-extracted data:

```sh
./bin/project report mind --snapshot /absolute/path/snapshot.json \
  --out-dir reports/mind/YYYY-MM-DD-rerender --json
```

Prerequisites: Python 3 (standard library only), PostgreSQL `psql`, AWS CLI access
through profile `yawp`, and the existing trusted production SSH key. The command
discovers the running `yawp-production-bastion` using AWS, fetches only
`yawp-production-db-url` from Secrets Manager into memory, opens a localhost tunnel,
and closes it in `finally`. PostgreSQL requires TLS. SQL runs in a repeatable-read,
read-only transaction with a 60-second statement timeout and 3-second lock timeout;
the connection also defaults to read-only. It never dumps a database. Connection
credentials do not appear in argv, logs, or output artifacts.

Override prerequisites with `--aws-profile`, `--ssh-key`, or `--psql`. This uses
the same production DB/bastion architecture documented in
`docs/superpowers/runbooks/production-db-access.md`, without requiring a copied env
file. PostgreSQL schema drift fails closed. The SQL is fixed and checked in, not
supplied by a model at runtime. AWS cost retrieval is optional and read-only; failure
fails that requested report run rather than inventing a cost.

## Definitions and limitations

- Time: UTC, Monday-start weeks and calendar months; the current period is partial.
  `--months 24` returns 24 complete months plus the current month to date, and
  every intersecting week. Default is 12 complete months plus current. The first
  week is clipped at the requested month boundary and marked partial when needed.
  The school year follows the app's July 1 boundary.
- School attribution: ClassAssignment → Class first; otherwise preserved
  DocumentClassForensic → Class; otherwise a unique current membership-school
  mapping. Ambiguous/unlinked records remain in an organization-specific unassigned
  bucket. Legacy duplicate institutions are not merged speculatively.
- Scope: exclude four known demo/QA/test organizations and eight unverified
  personal/internal school labels, using explicit IDs in `report.sql`. Exclude
  admin/superadmin users and obvious test-email patterns. These are a practical
  initial reporting cohort, not Brian's verified paid-customer roster. Update
  exclusions deliberately and preserve old snapshots/definition versions.
- Student activity excludes teacher-owned practice documents even when their
  artifact kind is `student`. Ownership role, rather than artifact label alone,
  determines whether a solo artifact represents student use.
- Accounts are organization memberships, not unique humans, purchased licenses,
  or necessarily currently enrolled students. School links can overlap; portfolio
  active-member counts deduplicate membership IDs. `isActive` is an account flag,
  not an engagement event. Seats are configuration at organization level and
  cannot be allocated across its schools without a contract ledger.
- Teacher activation: first retained attributable feedback or first student
  submission in a currently linked class. The denominator is registered eligible
  teachers, not selected/invited teachers. Speed begins at membership creation;
  negative intervals are excluded from speed and counted as a data-quality issue.
  Monthly cohort output has a mature-30-day denominator for 30-day conversion.
- Teacher usage: distinct feedback actors and current teachers of classes with
  assignment deployments/submissions. Co-teachers are inferred; assignment
  creation does not store an actor. Admin-supported schools can have student
  usage with zero eligible teacher usage. Assignment deployment volume itself
  includes admin-created assignments in included schools.
- History definition v2 adds retained teacher DocumentComment feedback. This can
  reveal activation/activity absent from the prior submission-only feedback
  sources. Old feedback may predate membership creation after migrations: show
  that anomaly and omit those intervals from speed rather than reporting a
  negative activation duration.
- Older student engagement counts human (`agent=user`) tutor messages, student
  comment replies, accepted saves and submissions, deduplicated by membership.
  Do not count assistant tutor replies as student activity. Documents created are
  a separate start/setup proxy; some may be empty. The model's session creation
  timestamps can reflect migration history, so tutor activity uses the preserved
  message timestamps. Only aggregate counts leave the database.
- Submission, grade, and release counts use their own timestamps. A grade may
  concern a prior-period submission. Mutable grade timestamps reflect current
  retained state, not every grading event. Archived/deleted-marked documents and
  unsubmitted attempts remain in historical totals; hard-deleted history cannot
  be recovered. A repeat submission is not proof of substantive revision.
- Accepted saves supplement recent student use; older saves and logins are not
  reconstructed. New telemetry should never be described as all-history DAU/WAU.
  Coverage minima are emitted with every snapshot.
- UA license statuses are reported before the user-email filter, including manual,
  pending and refunded rows. Manual entitlements are not payments, and a refunded
  row's historical `amountPaid` is not net retained revenue.
- Optional AWS costs are account-wide unblended service costs for the requested
  complete months, with the AWS estimated flag. If AWS specifically rejects a
  request because history beyond 14 months is disabled, retry the 13 available
  prior complete months and mark older requested months unavailable/null. Other
  AWS failures still fail closed. No billing preferences are changed. These are
  not production-only student cost of revenue. No margin, renewal, or NRR is invented.
- The full report renders the entire requested calendar, including unavailable
  pre-submission months as N/A rather than zero. Zero after a source begins means
  no retained matching events, not a guarantee that all history survived. Monthly,
  weekly, school and whole-window event counts reconcile independently in the renderer.

## Verification

Focused tests cover zero denominators, complete-period comparisons, undefined
growth from zero, school-label escaping, failed reconciliation, read-only connection
settings, tunnel cleanup after query failure, and CLI source validation. The
renderer also checks school/portfolio submission totals, unique school-period
rows, count bounds, inclusion/exclusion totals and attribution totals.

Production snapshots contain the query SHA-256, repository SHA, extraction time,
data coverage and exclusion counts. Preserve the clean code commit alongside the
dated snapshot to audit later methodology changes. No student names, emails, essay
text, individual grades, or payment IDs leave the database.

## Business inputs still required

Brian supplies the actual source systems and a school/contract revenue ledger,
renewal decisions, paid seat allocations, selected-teacher roster with dates, and
direct-cost/support-time records. The report contains the field-level join plan
and separate formulas for renewal, cohort NRR, licensing margin and service margin.
Start with a manual monthly finance join and the repeatable product-data pull;
there is no need to build a customer-facing analytics dashboard for this request.

## Anthropic and AWS operating-cost estimate

Definition v3 also writes `COST-ESTIMATES.md` and `cost-estimates.json` and includes
cost tables in the call brief and full report. The same command above pulls LlmLog
aggregates in the same read-only transaction. Only aggregate token counts and
school-level attribution leave PostgreSQL, never log payloads or person IDs.

The observed model is `claude-sonnet-4-6`. Its standard Anthropic API list price,
verified 2026-09-03 at <https://platform.claude.com/docs/en/about-claude/pricing>, is
USD 3 input / 15 output / 3.75 five-minute cache write / 0.30 cache read per million
tokens. `costs.py` pins this rate card. Unknown model/provider rates produce N/A,
not zero; deliberately extend the rate card after verification if models change.
The API's input and cache categories are separate and additive. The code uses
five-minute ephemeral caching; older missing cache fields are assumed zero.
Missing input/output totals are counted explicitly and can understate spend.

Attribution uses metadata IDs first, then a unique exact assistant-response match
within 60 seconds following the log timestamp, unique for both the message and
log. It uses all matching messages before applying cohort exclusions. No text or
hash is exported. Explicitly identified test/admin/teacher-practice calls are
excluded; remaining unmatched calls form shared AI overhead. School inference
uses the same historical/current membership evidence as product metrics.

Shared AI is allocated by monthly tutor-message share, falling back to active
student share when there are no messages. AWS account-wide cost is allocated by
monthly active-student share. Zero activity preserves unallocated overhead; no
zero denominator is reported as zero unit cost. School-month totals reconcile
with the combined account estimate after explicit AI exclusions. A student at
multiple schools is an exposure in each school. These are cost per active
student-school membership, not cost per purchased seat or selling prices.

Logging begins February 21, 2026 in the initial production pull. Earlier AI is
unavailable, February is partial, and the current month is incomplete. Comparable
unit costs require both a complete retained-log calendar month and AWS costs.
Use month-specific costs; avoid dividing six months of AI or thirteen months of
AWS by two years of distinct students. No two-year all-in total is claimed.

## Full two-year school cost scenario

When the request needs a full-period school estimate despite missing invoices/logs,
run the explicit opt-in scenario:

```sh
./bin/project report mind --production --months 24 --include-aws-costs \
  --estimate-cost-gaps --out-dir reports/mind/YYYY-MM-DD-school-history --json
```

This adds `SCHOOL-COSTS-TWO-YEARS.md` and `school-costs-two-years.json`. It covers
only the requested complete calendar months (September 2024–August 2026 for the
September 2026 pull), excluding the current partial month. The ordinary cost
report still preserves unavailable source values; the separate historical
scenario shows known AI/AWS components and modeled gaps in distinct columns.

- AI gaps use actual retained tutor-message timestamps before the earliest LLM
  log, multiplied by pooled included AI cost per tutor message in the earliest
  three complete log months with messages (March–May 2026 initially). This avoids
  applying the newer summer cache rate to older interactions. It is an activity
  proxy for total AI, including grading, not proof of historical model choice,
  token volumes or spend. Pre-log AI without tutor activity is not reconstructed.
- The partial first log month keeps logged costs and estimates only pre-log
  messages, avoiding double counting. Missing tokens inside the logged period
  remain an uncertainty rather than another imputed layer.
- AWS gaps use the median of the earliest three recorded monthly account costs
  (August–October 2025 initially). This flat earlier-hosting assumption is not a
  recovered bill. Monthly active-student shares allocate both known and modeled
  hosting. No-activity overhead remains unallocated.
- Every school has every complete month in the JSON. The summary includes schools
  with retained activity or any allocated cost. Zero allocations are not proof
  that historical cost was zero. Known subtotals span incomplete coverage and must
  not be described as complete historical bills.
- Student-months sum school-level monthly active memberships. The rate is monthly
  operational cost per active membership, not a two-year cost per distinct human,
  a paid-seat rate or a proposed selling price. Legacy school records remain
  separate by organization.

The scenario requires the new `pre_llm_student_tutor_messages` SQL aggregate;
older snapshots without it fail clearly rather than guessing the partial-month
split. Tests cover observed/model separation, source immutability, the partial
month, zero denominators/overhead, complete school-month grids, no calibration,
no AWS baseline, and exclusion of the current partial month.
