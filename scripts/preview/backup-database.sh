#!/usr/bin/env bash
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
DATABASE_NAME="${DATABASE_NAME:?DATABASE_NAME is required}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
BACKUP_KIND="${BACKUP_KIND:-scheduled}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
BACKUP_TIMESTAMP="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

[[ "$PREVIEW_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "PREVIEW_ROOT must be an absolute path without whitespace" >&2
  exit 1
}
[[ "$DATABASE_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "Invalid Postgres database name: $DATABASE_NAME" >&2
  exit 1
}
[[ "$POSTGRES_CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]] || {
  echo "Invalid Postgres container name: $POSTGRES_CONTAINER" >&2
  exit 1
}
[[ "$BACKUP_KIND" == "scheduled" || "$BACKUP_KIND" == "pre-reset" ]] || {
  echo "Invalid backup kind: $BACKUP_KIND" >&2
  exit 1
}
[[ "$BACKUP_TIMESTAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || {
  echo "BACKUP_TIMESTAMP must use YYYYMMDDTHHMMSSZ" >&2
  exit 1
}
if [[ ! "$BACKUP_RETENTION_COUNT" =~ ^[0-9]+$ ]] \
  || (( BACKUP_RETENTION_COUNT < 1 || BACKUP_RETENTION_COUNT > 365 )); then
  echo "BACKUP_RETENTION_COUNT must be between 1 and 365" >&2
  exit 1
fi

backup_dir="$PREVIEW_ROOT/backups"
backup_file="$backup_dir/${DATABASE_NAME}-${BACKUP_KIND}-${BACKUP_TIMESTAMP}.dump"
partial_file="${backup_file}.$$.partial"
lock_file="$backup_dir/.${DATABASE_NAME}-backup.lock"
verification_database=""

umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another backup for $DATABASE_NAME is already running" >&2
  exit 1
fi
cleanup() {
  if [[ -n "$verification_database" ]]; then
    docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --force --if-exists \
      "$verification_database" >/dev/null 2>&1 || true
  fi
  rm -f -- "$partial_file"
}
trap cleanup EXIT

docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U postgres \
  -d "$DATABASE_NAME" \
  --format=custom \
  --no-owner \
  --no-acl > "$partial_file"
[[ -s "$partial_file" ]] || {
  echo "pg_dump produced an empty backup" >&2
  exit 1
}
docker exec -i "$POSTGRES_CONTAINER" pg_restore --list < "$partial_file" >/dev/null
verification_database="yawp_backup_verify_${DATABASE_NAME:0:24}_$$"
docker exec "$POSTGRES_CONTAINER" createdb -U postgres "$verification_database"
docker exec -i "$POSTGRES_CONTAINER" pg_restore \
  -U postgres \
  -d "$verification_database" \
  --exit-on-error \
  --no-owner \
  --no-acl < "$partial_file" >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --force --if-exists \
  "$verification_database"
verification_database=""
mv -- "$partial_file" "$backup_file"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "${backup_file}.sha256"
else
  shasum -a 256 "$backup_file" > "${backup_file}.sha256"
fi

retained=0
while IFS= read -r candidate; do
  [[ -n "$candidate" ]] || continue
  retained=$((retained + 1))
  if (( retained > BACKUP_RETENTION_COUNT )); then
    rm -f -- "$candidate" "${candidate}.sha256"
  fi
done < <(
  find "$backup_dir" -maxdepth 1 -type f \
    -name "${DATABASE_NAME}-${BACKUP_KIND}-*.dump" -print | LC_ALL=C sort -r
)

echo "BACKUP_FILE=$backup_file"
