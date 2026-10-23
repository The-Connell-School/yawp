#!/usr/bin/env bash
# Run `prisma migrate deploy` inside the preview toolbox and emit DEMO_PRISMA_* summary lines.
set -euo pipefail

REPO_ROOT="${PRISMA_MIGRATE_REPO_ROOT:-/app}"
PRISMA_CLI="${PRISMA_MIGRATE_PRISMA_CLI:-bash scripts/preview/prisma-cli.sh}"
SUMMARY_SCRIPT="${PRISMA_MIGRATE_SUMMARY_SCRIPT:-scripts/preview/emit-prisma-migrate-summary.mjs}"

migrate_log="$(mktemp)"
cleanup() {
  rm -f "$migrate_log"
}
trap cleanup EXIT

run_migrate() {
  (
    cd "$REPO_ROOT"
    # shellcheck disable=SC2086
    eval "$PRISMA_CLI migrate deploy"
  ) 2>&1 | tee -a "$migrate_log"
}

if ! run_migrate; then
  run_migrate
fi

node "$REPO_ROOT/$SUMMARY_SCRIPT" "$migrate_log"
