# Public free welcome and grade gate

`free-tier-onboarding-v2` stays registered, default OFF. Only anonymous
`everyone` mode enables the welcome presentation and explicit K/1–12 grade
selection. Off, targeted, missing and unreadable settings retain the legacy
public form and grade behavior. Existing free-tier access checks, request
bounds, throttles, honeypots and credential validation remain in place.

The `/free` action and public waitlist/token actions reject missing, malformed
and unsupported grades before admission when enabled. Explicit K/1–8 calls
I4's `recordBelowHsDecline` outside admission transactions. That writer owns
normalization, create-only storage, token provenance and its admission lock;
see [the shared decline contract](internal-grade-gate-declines.md). Public
responses disclose no application ID/existence. No submitted tag/token ID is
trusted. I4's stored-tag admission exclusions remain effective after flag-off
or a subsequent eligible request.

An additive nullable `FreeTierApplication.releaseEmailCopyVersion` records
`free-tier-onboarding-v2` only at first eligible creation. Every existing or
legacy application retains null. Duplicates, promotion by an event token,
operator release and delivery-time flag changes never replace this context.
The release sender reads that stored value for its subject and body, including
delayed batches and retries. Unknown/null versions use legacy copy. Below-HS
records have no release-copy context and schedule no admission mail.

## Local verification

Use the project CLI, sequentially, with CI=1 and lane-private TMPDIR:

- `test --profile free-tier-welcome-unit --json`: renderer, public entry-point
  flag/grade matrix, loader, and legacy route regressions.
- `test --profile free-tier-welcome-db --json`: original copy through delayed
  delivery (mocked transport), real public decline requests, duplicates,
  concurrent requests, token validity/provenance and legacy API protections.
- `test --profile internal-grade-declines --json` and
  `test --profile internal-grade-declines-integration --json`: shared I4
  compatibility, concurrent admission locks and durable operator exclusions.
- `test --profile project-cli --json` and `test --profile typecheck --json`.
- `test --profile free-tier-welcome-live-browser --json`: two desktop/mobile
  live-route flows using one worker, an owned local server/database and local
  mail capture. Supply FREE_WELCOME_EVIDENCE_DIR to save screenshots. The
  dedicated runner requires a local welcome worktree; the standard E2E runner
  excludes these mutation fixtures. Explicit E2E_DATABASE_URL is preserved.

CI runs the mocked route and both database suites in separate Bun processes.
The database suites accept only the dedicated loopback welcome worktree or the
loopback migration CI database under GitHub Actions. No provider transport is
used in these proofs. Existing component-only browser evidence is retained as
preparation, with integration evidence under the lane's
`shots/fto-free-page/integration/` directory. Brian-call copy and grade/decline
states supersede older artboard copy; comparisons label reference-only states.

The new migration requires a manager-confirmed production RDS snapshot before
driver merge/production migration. No flag activation or deployment is part
of this change. The driver owns merge.
