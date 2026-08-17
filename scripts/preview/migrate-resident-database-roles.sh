#!/usr/bin/env bash
# Replace legacy shared-superuser DATABASE_URL values without deleting preview data,
# access codes, source trees, or named volumes. Safe to rerun.
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
DOCKER="${PREVIEW_DOCKER:-docker}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
ADMIN_PASSWORD="${PREVIEW_POSTGRES_ADMIN_PASSWORD:?PREVIEW_POSTGRES_ADMIN_PASSWORD is required}"

[[ "$ADMIN_PASSWORD" =~ ^[A-Za-z0-9_-]{32,}$ ]] || {
  echo "PREVIEW_POSTGRES_ADMIN_PASSWORD must be a 32-character URL-safe secret" >&2
  exit 2
}

database_exists() {
  local database="$1"
  [[ "$($DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d postgres -Atc \
    "SELECT 1 FROM pg_database WHERE datname = '${database}'" | tr -d '[:space:]')" == "1" ]]
}

ensure_database_role() {
  local database="$1" role="$2" password="$3"
  local role_exists
  role_exists="$($DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d postgres -Atc \
    "SELECT 1 FROM pg_roles WHERE rolname = '${role}'" | tr -d '[:space:]')"
  if [[ "$role_exists" != "1" ]]; then
    $DOCKER exec "$POSTGRES_CONTAINER" createuser -U postgres "$role"
  fi
  $DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
    "ALTER ROLE \"${role}\" WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; ALTER DATABASE \"${database}\" OWNER TO \"${role}\"; REVOKE CONNECT ON DATABASE \"${database}\" FROM PUBLIC; GRANT CONNECT ON DATABASE \"${database}\" TO \"${role}\";" \
    >/dev/null
  $DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d "$database" -c "
DO \$migration\$
DECLARE object record;
BEGIN
  FOR object IN
    SELECT namespace.nspname, relation.relname,
      CASE relation.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END AS kind
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      AND pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO %I', object.kind, object.nspname, object.relname, '${role}');
  END LOOP;
  FOR object IN
    SELECT namespace.nspname, routine.proname, pg_get_function_identity_arguments(routine.oid) AS arguments
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_get_userbyid(routine.proowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = routine.oid AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', object.nspname, object.proname, object.arguments, '${role}');
  END LOOP;
  FOR object IN
    SELECT namespace.nspname, data_type.typname
    FROM pg_type data_type
    JOIN pg_namespace namespace ON namespace.oid = data_type.typnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND data_type.typtype IN ('e', 'd')
      AND pg_get_userbyid(data_type.typowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend dependency
        WHERE dependency.classid = 'pg_type'::regclass
          AND dependency.objid = data_type.oid AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', object.nspname, object.typname, '${role}');
  END LOOP;
END
\$migration\$;
GRANT ALL ON SCHEMA public TO \"${role}\";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"${role}\";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"${role}\";" \
    >/dev/null
}

rewrite_compose_database_url() {
  local compose_file="$1" database="$2" role="$3" password_file="$4"
  node - "$compose_file" "$database" "$role" "$password_file" <<'NODE'
const fs = require('node:fs');
const [composeFile, database, role, passwordFile] = process.argv.slice(2);
const password = fs.readFileSync(passwordFile, 'utf8').trim();
const source = fs.readFileSync(composeFile, 'utf8');
const escaped = database.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`postgresql://[^"\\s]+@preview-postgres:5432/${escaped}`, 'g');
const replacement = `postgresql://${role}:${password}@preview-postgres:5432/${database}`;
const updated = source.replace(pattern, replacement);
if (updated === source && !source.includes(replacement)) {
  throw new Error(`No replaceable DATABASE_URL found in ${composeFile}`);
}
const temporary = `${composeFile}.${process.pid}.tmp`;
fs.writeFileSync(temporary, updated, { mode: 0o600 });
fs.renameSync(temporary, composeFile);
NODE
}

shopt -s nullglob
for preview_dir in "$ROOT"/previews/*; do
  [[ -d "$preview_dir" ]] || continue
  slug="$(basename "$preview_dir")"
  [[ "$slug" =~ ^[a-z][a-z0-9-]{0,30}$ ]] || {
    echo "Skipping unsafe preview directory name: $slug" >&2
    continue
  }
  compose_file="$preview_dir/docker-compose.yml"
  [[ -f "$compose_file" ]] || continue
  database="yawp_${slug//-/_}"
  role="${database}_app"
  role_file="$preview_dir/database-role"
  password_file="$preview_dir/database-password"
  if ! database_exists "$database"; then
    echo "Skipping $slug because database $database is absent" >&2
    continue
  fi
  umask 077
  if [[ -s "$role_file" ]]; then
    role="$(<"$role_file")"
  else
    printf '%s\n' "$role" > "$role_file"
  fi
  if [[ ! -s "$password_file" ]]; then
    node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url') + '\n')" \
      > "$password_file"
  fi
  password="$(<"$password_file")"
  [[ "$role" =~ ^[a-z_][a-z0-9_]{0,62}$ && "$password" =~ ^[A-Za-z0-9_-]{32,}$ ]] || {
    echo "Invalid stored database credential for $slug" >&2
    exit 1
  }

  was_running=false
  if $DOCKER ps --filter "label=com.docker.compose.project=yawp-${slug}" \
    --filter "label=com.docker.compose.service=web" --filter status=running -q \
    | grep -q .; then
    was_running=true
  fi
  ensure_database_role "$database" "$role" "$password"
  rewrite_compose_database_url "$compose_file" "$database" "$role" "$password_file"
  compose=("$DOCKER" compose -p "yawp-${slug}" -f "$compose_file")
  if [[ "$was_running" == "true" ]]; then
    "${compose[@]}" up -d --force-recreate web >/dev/null
  else
    "${compose[@]}" create --force-recreate web >/dev/null
  fi
  echo "Migrated $slug to isolated database role $role"
done

# Templates must never be reachable through another preview's login role.
while IFS= read -r database; do
  [[ "$database" =~ ^yawp_[a-z0-9_]+$ ]] || continue
  $DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
    "REVOKE CONNECT ON DATABASE \"${database}\" FROM PUBLIC;" >/dev/null
done < <($DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'yawp\_%' ESCAPE '\\' ORDER BY datname")

# Existing Postgres volumes ignore POSTGRES_PASSWORD changes. Rotate the actual admin
# role only after every resident compose file no longer contains the previous credential.
$DOCKER exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
  "ALTER ROLE postgres WITH PASSWORD '${ADMIN_PASSWORD}';" >/dev/null
echo "Resident preview database roles isolated and Postgres administrator rotated"
