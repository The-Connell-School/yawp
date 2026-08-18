#!/usr/bin/env bash
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/yawp-demo}"
BACKUP_FILE="${BACKUP_FILE:?BACKUP_FILE is required}"
DATABASE_NAME="${DATABASE_NAME:?DATABASE_NAME is required}"
DATABASE_USER="${DATABASE_USER:?DATABASE_USER is required}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"

[[ "$PREVIEW_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "PREVIEW_ROOT must be an absolute path without whitespace" >&2
  exit 1
}
[[ "$DATABASE_NAME" == "yawp_demo" ]] || {
  echo "Demo recovery may only restore yawp_demo" >&2
  exit 1
}
[[ "$DATABASE_USER" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || {
  echo "Invalid demo database role" >&2
  exit 1
}
[[ "$POSTGRES_CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]] || {
  echo "Invalid Postgres container name" >&2
  exit 1
}
[[ "$BACKUP_FILE" == "$PREVIEW_ROOT"/backups/yawp_demo-pre-reset-*.dump ]] || {
  echo "Demo recovery requires a pre-reset backup under PREVIEW_ROOT" >&2
  exit 1
}
[[ -f "$BACKUP_FILE" && ! -L "$BACKUP_FILE" ]] || {
  echo "Recovery backup must be a regular non-symlink file" >&2
  exit 1
}
checksum_file="${BACKUP_FILE}.sha256"
[[ -f "$checksum_file" && ! -L "$checksum_file" ]] || {
  echo "Recovery backup checksum sidecar is missing" >&2
  exit 1
}

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
else
  actual_checksum="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
fi
expected_checksum="$(awk 'NR == 1 {print $1}' "$checksum_file")"
[[ "$expected_checksum" =~ ^[a-fA-F0-9]{64}$ && "$actual_checksum" == "$expected_checksum" ]] || {
  echo "Recovery backup checksum mismatch" >&2
  exit 1
}

recovery_database="${DATABASE_NAME}_recovery_$$"
failed_database="${DATABASE_NAME}_failed_$$"
swapped=false
old_renamed=false

cleanup() {
  if [[ "$swapped" != "true" ]]; then
    docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --force --if-exists \
      "$recovery_database" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker exec -i "$POSTGRES_CONTAINER" pg_restore --list < "$BACKUP_FILE" >/dev/null
docker exec "$POSTGRES_CONTAINER" createdb -U postgres -O "$DATABASE_USER" \
  "$recovery_database"
docker exec -i "$POSTGRES_CONTAINER" pg_restore \
  -U postgres \
  -d "$recovery_database" \
  --exit-on-error \
  --no-owner \
  --no-acl < "$BACKUP_FILE" >/dev/null

live_exists="$(docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d postgres -Atc \
  "SELECT 1 FROM pg_database WHERE datname = '${DATABASE_NAME}'" | tr -d '[:space:]')"
if [[ "$live_exists" == "1" ]]; then
  docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DATABASE_NAME}' AND pid <> pg_backend_pid();" >/dev/null
  docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -c \
    "ALTER DATABASE \"${DATABASE_NAME}\" RENAME TO \"${failed_database}\";" >/dev/null
  old_renamed=true
fi

if ! docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 \
  -U postgres -d postgres -c \
  "ALTER DATABASE \"${recovery_database}\" RENAME TO \"${DATABASE_NAME}\";" >/dev/null; then
  if [[ "$old_renamed" == "true" ]]; then
    docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 \
      -U postgres -d postgres -c \
      "ALTER DATABASE \"${failed_database}\" RENAME TO \"${DATABASE_NAME}\";" >/dev/null || true
  fi
  exit 1
fi
swapped=true
if [[ "$old_renamed" == "true" ]]; then
  docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --force --if-exists \
    "$failed_database" >/dev/null 2>&1 || {
      echo "Recovered demo database is active; remove stale database $failed_database manually." >&2
    }
fi
trap - EXIT

echo "RESTORED_DATABASE=$DATABASE_NAME"
