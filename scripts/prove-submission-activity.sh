#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" && -f "$repo_root/.worktree-local/config.env" ]]; then
  # shellcheck disable=SC1091
  source "$repo_root/.worktree-local/config.env"
fi

case "${DATABASE_URL:-}" in
  postgresql://*@127.0.0.1:*/*) ;;
  *)
    echo "Refusing database proof outside an isolated 127.0.0.1 database." >&2
    exit 1
    ;;
esac

cd "$repo_root/services/web-app"

# Repeatable backend proof for the positive mutation contract, transaction
# atomicity, tenant/class authorization, rollout gating, and wrong-role denial.
bun test \
  app/domain/submissions/submission-activity.server.test.ts \
  app/routes/api.domain.update-submission/route.test.ts \
  app/routes/api.domain.release-grades/route.test.ts \
  app/routes/api.domain.unsubmit-submission/route.test.ts \
  app/routes/api.domain.submit-document/route.test.ts \
  app/routes/api.domain.grade-essay-ai/route.test.ts \
  'app/routes/api.model.submission.$id/route.test.ts' \
  app/routes/api.model.submission-comment/route.test.ts \
  'app/routes/api.model.submission-comment.$id/route.test.ts' \
  'app/routes/api.model.document.$id/route.test.ts' \
  'app/routes/app_.submissions_.$submissionId/route.loader.test.ts' \
  app/utils/grading-auth.server.test.ts \
  'app/routes/app.admin.organizations.$id/route.test.ts'

cd "$repo_root"
bash "$repo_root/scripts/prove-submission-activity-fresh-migration.sh"
