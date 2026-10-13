# PLAN: qa-suite-open-pr-integration-audit

1. Audit the current platform `origin/main` free-tier Playwright coverage and prior lane QA expectations for required seeded repro specs.
2. Add a small, auditable free-tier demo suite manifest/runner contract in `services/web-app` that lists required seeded repro specs and fails locally if any required default spec is absent.
3. Keep changes limited to QA docs, Playwright specs, and runner tests; do not change product behavior, secrets, migrations, email sending, or deployment.
4. Run focused runner contract tests and the manifest/list command. Run the narrow demo suite locally where the environment permits; if hosted demo credentials are missing, write the explicit skip artifact under the task shots directory.
5. If a product regression reproduces, record evidence in `FAILURES.md` and add the matching `free-tier-fixes` P0b backlog item instead of touching app behavior.
