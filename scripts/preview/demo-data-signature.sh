#!/usr/bin/env bash
set -euo pipefail

DATABASE_NAME="${DATABASE_NAME:-yawp_demo}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"

[[ "$DATABASE_NAME" == "yawp_demo" ]] || {
  echo "Demo data signature may only inspect yawp_demo" >&2
  exit 1
}
[[ "$POSTGRES_CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]] || {
  echo "Invalid Postgres container name" >&2
  exit 1
}

psql_atc() {
  docker exec "$POSTGRES_CONTAINER" psql \
    --no-psqlrc \
    -v ON_ERROR_STOP=1 \
    -U postgres \
    -d "$DATABASE_NAME" \
    -Atc "$1"
}

tester_feedback_count=0
if [[ "$(psql_atc 'SELECT (to_regclass($reg$public."TesterFeedback"$reg$) IS NOT NULL)::int')" == "1" ]]; then
  tester_feedback_count="$(psql_atc 'SELECT count(*)::bigint FROM "TesterFeedback"')"
fi
[[ "$tester_feedback_count" =~ ^[0-9]+$ ]] || {
  echo "Invalid TesterFeedback count" >&2
  exit 1
}

psql_atc '
SELECT json_build_object(
  $json$organizations$json$, (SELECT count(*) FROM "Organization"),
  $json$users$json$, (SELECT count(*) FROM "User"),
  $json$classes$json$, (SELECT count(*) FROM "Class"),
  $json$assignments$json$, (SELECT count(*) FROM "Assignment"),
  $json$documents$json$, (SELECT count(*) FROM "Document"),
  $json$submissions$json$, (SELECT count(*) FROM "Submission"),
  $json$moduleSessions$json$, (SELECT count(*) FROM "AssignmentModuleSession"),
  $json$testerFeedback$json$, '"${tester_feedback_count}"'::bigint
)::text;
'
