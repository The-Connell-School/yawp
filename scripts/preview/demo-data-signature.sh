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

docker exec "$POSTGRES_CONTAINER" psql \
  --no-psqlrc \
  -v ON_ERROR_STOP=1 \
  -U postgres \
  -d "$DATABASE_NAME" \
  -Atc '
SELECT json_build_object(
  $json$organizations$json$, (SELECT count(*) FROM "Organization"),
  $json$users$json$, (SELECT count(*) FROM "User"),
  $json$classes$json$, (SELECT count(*) FROM "Class"),
  $json$assignments$json$, (SELECT count(*) FROM "Assignment"),
  $json$documents$json$, (SELECT count(*) FROM "Document"),
  $json$submissions$json$, (SELECT count(*) FROM "Submission"),
  $json$moduleSessions$json$, (SELECT count(*) FROM "AssignmentModuleSession")
)::text;
'
