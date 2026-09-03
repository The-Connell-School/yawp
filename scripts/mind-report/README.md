# Investor-coaching MIND report

Generate a short call brief, full school tables, and an aggregate JSON snapshot from
production. No application deployment, migration, or production write is needed.

```sh
./bin/project report mind --production --include-aws-costs \
  --out-dir reports/mind/YYYY-MM-DD --json
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
  The query returns 13 months and 13 weeks, including the current periods. The
  school year follows the app's July 1 boundary.
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
- Optional AWS costs are account-wide unblended service costs for the last three
  complete months, with the AWS estimated flag. They are not production-only
  student cost of revenue. No gross margin, renewal, or NRR is invented.

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
