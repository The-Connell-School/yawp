#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export SOURCE_DIR

source "$SCRIPT_DIR/tooling-artifacts.sh"

export PREVIEW_DATA_MODE="${PREVIEW_DATA_MODE:-seed}"
export PREVIEW_DEV_LOGIN_EMAIL="${PREVIEW_DEV_LOGIN_EMAIL:-dev.teacher@yawp.local}"
# Derive paths and database identity before creating the per-preview credential.
# The placeholder URL never reaches a container or persistent compose file.
eval "$(PREVIEW_DATABASE_URL=postgresql://identity.invalid/identity node "$SCRIPT_DIR/preview-env.mjs" --shell)"
unset DATABASE_URL

# preview-env.mjs already derives this and exports it in the eval above — yawp_pr_142 for
# a PR preview, yawp_demo for a slug-named environment like the demo box. Recomputing it
# from PR_NUMBER here defeated the slug override: a named environment has no PR number, so
# this produced the database "yawp_pr_" and, because PR_NUMBER is exported as an empty
# string rather than left unset, did it silently instead of failing under `set -u`.
: "${DATABASE_NAME:?preview-env.mjs did not export DATABASE_NAME}"
DEMO_RESET_DATA="${DEMO_RESET_DATA:-false}"
DEMO_RESET_CONFIRMATION="${DEMO_RESET_CONFIRMATION:-}"
DEMO_BACKUP_RETENTION="${DEMO_BACKUP_RETENTION:-14}"
DEMO_BACKUP_S3_URI="${DEMO_BACKUP_S3_URI:-s3://yawp-preview-videos/demo-backups}"
DEMO_RESET_BACKUP_FILE=""
DEMO_RESET_RECOVERY_ARMED=false
if [[ ! "$DEMO_BACKUP_RETENTION" =~ ^[0-9]+$ ]] \
  || (( DEMO_BACKUP_RETENTION < 1 || DEMO_BACKUP_RETENTION > 365 )); then
  echo "DEMO_BACKUP_RETENTION must be between 1 and 365" >&2
  exit 1
fi
source "$SCRIPT_DIR/demo-reset-guard.sh"
DUMP_URI="${PREVIEW_DB_DUMP_S3_URI:-s3://yawp-preview-videos/production.dump}"
DUMP_VERSION="${PREVIEW_DB_DUMP_VERSION:-unversioned}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"
if [[ ! "$DUMP_VERSION" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "PREVIEW_DB_DUMP_VERSION contains unsupported characters" >&2
  exit 1
fi
if [[ "$DATA_MODE" == "sanitized-production" && "$DUMP_VERSION" == "unversioned" ]]; then
  echo "PREVIEW_DB_DUMP_VERSION is required for sanitized production previews" >&2
  exit 1
fi
safe_dump_version="$(printf '%s' "$DUMP_VERSION" | tr '.-' '__' | cut -c1-28)"
if [[ "$DATA_MODE" == "sanitized-production" ]]; then
  default_template_database="yawp_template_sanitized_${safe_dump_version}"
else
  default_template_database="yawp_template"
fi
if [[ -n "${PREVIEW_DB_TEMPLATE_DB:-}" ]]; then
  TEMPLATE_DB="$PREVIEW_DB_TEMPLATE_DB"
elif [[ "$DATA_MODE" == "sanitized-production" ]]; then
  # preview-env.mjs exports TEMPLATE_DATABASE_NAME=yawp_template for backward
  # compatibility. Sanitized snapshots must not inherit that unversioned cache.
  TEMPLATE_DB="$default_template_database"
else
  TEMPLATE_DB="${TEMPLATE_DATABASE_NAME:-$default_template_database}"
fi
DB_COMPOSE_DIR="$ROOT/postgres"
DB_COMPOSE_FILE="$DB_COMPOSE_DIR/docker-compose.yml"
TOOLING_FINGERPRINT_FILE="$PREVIEW_DIR/tooling.sha256"
DATA_SOURCE_FINGERPRINT_FILE="$PREVIEW_DIR/data-source"
DATA_SOURCE_FINGERPRINT="${DATA_MODE}:${DUMP_URI}:${DUMP_VERSION}"
DATA_SOURCE_CHANGED=1
TOOLING_CHANGED=1
DATABASE_CREATED=0

mkdir -p "$PREVIEW_DIR" "$DB_COMPOSE_DIR"
DATABASE_ROLE_FILE="$PREVIEW_DIR/database-role"
DATABASE_PASSWORD_FILE="$PREVIEW_DIR/database-password"
load_or_create_database_credential() {
  umask 077
  if [[ -s "$DATABASE_ROLE_FILE" ]]; then
    PREVIEW_DB_USER="$(<"$DATABASE_ROLE_FILE")"
  else
    PREVIEW_DB_USER="${DATABASE_NAME}_app"
    printf '%s\n' "$PREVIEW_DB_USER" > "$DATABASE_ROLE_FILE"
  fi
  if [[ -s "$DATABASE_PASSWORD_FILE" ]]; then
    PREVIEW_DB_PASSWORD="$(<"$DATABASE_PASSWORD_FILE")"
  else
    PREVIEW_DB_PASSWORD="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
    printf '%s\n' "$PREVIEW_DB_PASSWORD" > "$DATABASE_PASSWORD_FILE"
  fi
  [[ "$PREVIEW_DB_USER" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || {
    echo "Stored preview database role is invalid" >&2
    exit 1
  }
  [[ "$PREVIEW_DB_PASSWORD" =~ ^[A-Za-z0-9_-]{32,}$ ]] || {
    echo "Stored preview database password is invalid" >&2
    exit 1
  }
  export PREVIEW_DB_USER PREVIEW_DB_PASSWORD
}
load_or_create_database_credential
eval "$(node "$SCRIPT_DIR/preview-env.mjs" --shell)"
: "${PREVIEW_POSTGRES_ADMIN_PASSWORD:?PREVIEW_POSTGRES_ADMIN_PASSWORD is required}"
if [[ -f "$SOURCE_DIR/services/web-app/.preview-master-org-gate-v1" ]]; then
  PREVIEW_MASTER_ORG_GATE_ENABLED=true
  : "${PREVIEW_MASTER_ACCESS_CODE:?PREVIEW_MASTER_ACCESS_CODE is required}"
  [[ ${#PREVIEW_MASTER_ACCESS_CODE} -ge 8 \
    && ${#PREVIEW_MASTER_ACCESS_CODE} -le 64 \
    && "$PREVIEW_MASTER_ACCESS_CODE" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)+$ ]] || {
    echo "PREVIEW_MASTER_ACCESS_CODE must be a lowercase hyphenated code between 8 and 64 characters" >&2
    exit 1
  }
else
  PREVIEW_MASTER_ORG_GATE_ENABLED=false
fi
export PREVIEW_MASTER_ORG_GATE_ENABLED
case "${PREVIEW_KEEP_AWAKE:-false}" in
  true) printf 'true\n' > "$PREVIEW_DIR/keep-awake" ;;
  false) rm -f -- "$PREVIEW_DIR/keep-awake" ;;
  *) echo "PREVIEW_KEEP_AWAKE must be true or false" >&2; exit 1 ;;
esac
ACCESS_CODE_FILE="$PREVIEW_DIR/access-code"
ACCESS_SEATS_FILE="$PREVIEW_DIR/access-seats.json"
ACCESS_SECRET_FILE="$PREVIEW_DIR/access-secret"
SESSION_SECRET_FILE="$PREVIEW_DIR/session-secret"
export PREVIEW_SEAT_COUNT="${PREVIEW_SEAT_COUNT:-1}"
if [[ "$DATA_MODE" == "sanitized-production" ]]; then
  export PREVIEW_ACCESS_MASTER_ORGANIZATION_ID="${PREVIEW_ACCESS_MASTER_ORGANIZATION_ID:-default-org}"
  export PREVIEW_ACCESS_MASTER_LABEL="${PREVIEW_ACCESS_MASTER_LABEL:-Production rehearsal}"
else
  export PREVIEW_ACCESS_MASTER_ORGANIZATION_ID="${PREVIEW_ACCESS_MASTER_ORGANIZATION_ID:-local-dev-org}"
  export PREVIEW_ACCESS_MASTER_LABEL="${PREVIEW_ACCESS_MASTER_LABEL:-Master}"
fi

if [[ -f "$DATA_SOURCE_FINGERPRINT_FILE" && "$(<"$DATA_SOURCE_FINGERPRINT_FILE")" == "$DATA_SOURCE_FINGERPRINT" ]]; then
  DATA_SOURCE_CHANGED=0
elif [[ "$SLUG" == "demo" && "${DEMO_RESET_DATA:-false}" != "true" ]]; then
  if [[ -f "$DATA_SOURCE_FINGERPRINT_FILE" ]]; then
    echo "Refusing to replace demo database while DEMO_RESET_DATA=false." >&2
    echo "Requested data source: $DATA_SOURCE_FINGERPRINT" >&2
    echo "Current data source: $(<"$DATA_SOURCE_FINGERPRINT_FILE")" >&2
    exit 1
  fi
  # A missing fingerprint is safe only for a brand-new database. Once Postgres is
  # available, reset_preview_database_for_data_source_change verifies that state.
else
  rm -f "$ACCESS_CODE_FILE" "$ACCESS_SEATS_FILE"
fi

load_or_create_access_config() {
  umask 077
  if [[ -z "${PREVIEW_ACCESS_SEATS:-}" ]]; then
    local existing_seats="[]"
    local legacy_codes="${PREVIEW_ACCESS_CODES:-}"
    if [[ -s "$ACCESS_SEATS_FILE" ]]; then
      existing_seats="$(<"$ACCESS_SEATS_FILE")"
    elif [[ -z "$legacy_codes" && -s "$ACCESS_CODE_FILE" ]]; then
      legacy_codes="$(<"$ACCESS_CODE_FILE")"
    fi
    PREVIEW_ACCESS_SEATS="$(
      docker run --rm \
        -e PREVIEW_SEAT_COUNT="$PREVIEW_SEAT_COUNT" \
        -e PREVIEW_ACCESS_MASTER_ORGANIZATION_ID="$PREVIEW_ACCESS_MASTER_ORGANIZATION_ID" \
        -e PREVIEW_ACCESS_MASTER_LABEL="$PREVIEW_ACCESS_MASTER_LABEL" \
        -e PREVIEW_EXISTING_ACCESS_SEATS="$existing_seats" \
        -e PREVIEW_ACCESS_CODES="$legacy_codes" \
        -e PREVIEW_MASTER_ACCESS_CODE="${PREVIEW_MASTER_ACCESS_CODE:-}" \
        -v "$SOURCE_DIR:/app:ro" \
        -w /app \
        oven/bun:1.3.1 \
        bun scripts/preview/access-code.mjs --seats
    )"
    printf '%s\n' "$PREVIEW_ACCESS_SEATS" > "$ACCESS_SEATS_FILE"
  fi

  PREVIEW_ACCESS_CODES="$(
    PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e \
      "process.stdout.write(JSON.parse(process.env.PREVIEW_ACCESS_SEATS).map((seat) => seat.code).join(','))"
  )"
  # A retained seat map may be larger than a subsequently lowered count. Never
  # orphan one of those worlds on a reset; seed through the full retained map.
  PREVIEW_SEAT_COUNT="$(
    PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e \
      "process.stdout.write(String(JSON.parse(process.env.PREVIEW_ACCESS_SEATS).length))"
  )"

  if [[ -z "${PREVIEW_ACCESS_SECRET:-}" ]]; then
    if [[ -s "$ACCESS_SECRET_FILE" ]]; then
      PREVIEW_ACCESS_SECRET="$(<"$ACCESS_SECRET_FILE")"
    else
      PREVIEW_ACCESS_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
      printf '%s\n' "$PREVIEW_ACCESS_SECRET" > "$ACCESS_SECRET_FILE"
    fi
  fi

  if [[ -z "${PREVIEW_SESSION_SECRET:-}" ]]; then
    if [[ -s "$SESSION_SECRET_FILE" ]]; then
      PREVIEW_SESSION_SECRET="$(<"$SESSION_SECRET_FILE")"
    else
      PREVIEW_SESSION_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
      printf '%s\n' "$PREVIEW_SESSION_SECRET" > "$SESSION_SECRET_FILE"
    fi
  fi

  export PREVIEW_ACCESS_CODES PREVIEW_ACCESS_SEATS PREVIEW_ACCESS_SECRET PREVIEW_MASTER_ACCESS_CODE PREVIEW_MASTER_ORG_GATE_ENABLED PREVIEW_SESSION_SECRET PREVIEW_SEAT_COUNT
}

load_or_create_access_config
if [[ -n "${DIRECT_PORT:-}" || -f "$ROOT/ingress/current/ingress-server.mjs" ]]; then
  export PREVIEW_CUSTOM_INGRESS_ACTIVE=true
else
  # The migration PR itself still deploys through the old host. Keep its labels until
  # bootstrap proves and activates custom ingress; after cutover they disappear.
  export PREVIEW_CUSTOM_INGRESS_ACTIVE=false
fi
node "$SCRIPT_DIR/render-compose.mjs" > "$PREVIEW_DIR/docker-compose.yml"

docker network inspect preview >/dev/null 2>&1 || docker network create preview >/dev/null

start_ms="$(date +%s%3N)"
compose=(docker compose -p "$COMPOSE_PROJECT" -f "$PREVIEW_DIR/docker-compose.yml")
db_compose=(docker compose -p "$POSTGRES_PROJECT" -f "$DB_COMPOSE_FILE")

validate_database_name() {
  local database_name="$1"
  if [[ ! "$database_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid Postgres database name: $database_name" >&2
    exit 1
  fi
}

write_shared_postgres_compose() {
  local temporary="${DB_COMPOSE_FILE}.$$.tmp"
  umask 077
  cat > "$temporary" <<YAML
services:
  postgres:
    image: postgres:16
    container_name: ${POSTGRES_CONTAINER}
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${PREVIEW_POSTGRES_ADMIN_PASSWORD}
      POSTGRES_DB: postgres
    volumes:
      - preview-postgres-data:/var/lib/postgresql/data
    networks:
      - preview

volumes:
  preview-postgres-data:

networks:
  preview:
    external: true
YAML
  chmod 600 "$temporary"
  mv -f -- "$temporary" "$DB_COMPOSE_FILE"
}

stream_preview_dump() {
  if [[ -n "${PREVIEW_DB_DUMP_URL:-}" ]]; then
    curl -fSsL --retry 3 --retry-delay 2 "$PREVIEW_DB_DUMP_URL"
  else
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
      echo "Preview host cannot access AWS. Attach an instance profile that can read ${DUMP_URI} or provide PREVIEW_DB_DUMP_URL." >&2
      exit 1
    fi
    aws s3 cp "$DUMP_URI" -
  fi
}

wait_for_shared_postgres() {
  for _ in $(seq 1 60); do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Shared preview Postgres did not become ready." >&2
  "${db_compose[@]}" ps >&2 || true
  "${db_compose[@]}" logs --tail=120 postgres >&2 || true
  exit 1
}

connect_shared_postgres_to_preview_network() {
  docker network connect preview "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
}

ensure_shared_postgres() {
  write_shared_postgres_compose
  "${db_compose[@]}" up -d
  connect_shared_postgres_to_preview_network
  wait_for_shared_postgres
}

ensure_preview_database_role() {
  local exists
  exists="$(docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d postgres -Atc \
    "SELECT 1 FROM pg_roles WHERE rolname = '${DATABASE_USER}'" | tr -d '[:space:]')"
  if [[ "$exists" != "1" ]]; then
    docker exec "$POSTGRES_CONTAINER" createuser -U postgres "$DATABASE_USER"
  fi
  docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
    "ALTER ROLE \"${DATABASE_USER}\" WITH LOGIN PASSWORD '${DATABASE_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;"
}

harden_preview_database() {
  validate_database_name "$DATABASE_NAME"
  docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
    "ALTER DATABASE \"${DATABASE_NAME}\" OWNER TO \"${DATABASE_USER}\"; REVOKE CONNECT ON DATABASE \"${DATABASE_NAME}\" FROM PUBLIC; GRANT CONNECT ON DATABASE \"${DATABASE_NAME}\" TO \"${DATABASE_USER}\";"
  docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE_NAME" -c "
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
    EXECUTE format('ALTER %s %I.%I OWNER TO %I', object.kind, object.nspname, object.relname, '${DATABASE_USER}');
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
    EXECUTE format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', object.nspname, object.proname, object.arguments, '${DATABASE_USER}');
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
    EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', object.nspname, object.typname, '${DATABASE_USER}');
  END LOOP;
END
\$migration\$;
GRANT ALL ON SCHEMA public TO \"${DATABASE_USER}\";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"${DATABASE_USER}\";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"${DATABASE_USER}\";"
}

database_exists() {
  local database_name="$1"
  validate_database_name "$database_name"
  local exists
  exists="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '${database_name}'" | tr -d '[:space:]')"
  [[ "$exists" == "1" ]]
}

backup_demo_database_before_reset() {
  local backup_file backup_output
  [[ "$SLUG" == "demo" ]] || return 0
  database_exists "$DATABASE_NAME" || return 0
  export DATABASE_NAME
  backup_output="$(BACKUP_KIND=pre-reset \
    BACKUP_RETENTION_COUNT="$DEMO_BACKUP_RETENTION" \
    PREVIEW_ROOT="$ROOT" \
    PREVIEW_POSTGRES_CONTAINER="$POSTGRES_CONTAINER" \
    bash "$SCRIPT_DIR/backup-database.sh")"
  printf '%s\n' "$backup_output"
  backup_file="$(awk -F= '/^BACKUP_FILE=/{print $2}' <<<"$backup_output" | tail -1)"
  [[ "$backup_file" == "$ROOT"/backups/yawp_demo-pre-reset-*.dump ]] || {
    echo "Pre-reset backup returned an unexpected path" >&2
    return 1
  }
  PREVIEW_ROOT="$ROOT" \
    BACKUP_FILE="$backup_file" \
    BACKUP_S3_URI="$DEMO_BACKUP_S3_URI" \
    bash "$SCRIPT_DIR/publish-demo-backup.sh"
  DEMO_RESET_BACKUP_FILE="$backup_file"
}

arm_demo_reset_recovery() {
  [[ "$SLUG" == "demo" ]] || return 0
  [[ -n "$DEMO_RESET_BACKUP_FILE" ]] || {
    echo "Refusing demo reset without a verified off-host pre-reset backup" >&2
    return 1
  }
  DEMO_RESET_RECOVERY_ARMED=true
}

# shellcheck disable=SC2329 # Invoked by the EXIT trap after the function is defined.
recover_demo_database_on_failure() {
  local status=$?
  trap - EXIT
  if (( status != 0 )) && [[ "$DEMO_RESET_RECOVERY_ARMED" == "true" ]]; then
    DEMO_RESET_RECOVERY_ARMED=false
    echo "Demo deployment failed after reset; restoring the pre-reset database." >&2
    if PREVIEW_ROOT="$ROOT" BACKUP_FILE="$DEMO_RESET_BACKUP_FILE" DATABASE_NAME="$DATABASE_NAME" \
      DATABASE_USER="$DATABASE_USER" PREVIEW_POSTGRES_CONTAINER="$POSTGRES_CONTAINER" \
      bash "$SCRIPT_DIR/restore-demo-backup.sh" \
      && harden_preview_database; then
      echo "Demo pre-reset database restored; existing web container can reconnect." >&2
    else
      echo "CRITICAL: automatic demo database recovery failed; use $DEMO_RESET_BACKUP_FILE." >&2
    fi
  fi
  return "$status"
}

drop_preview_database() {
  local database_name="$1"
  validate_database_name "$database_name"
  if [[ "$SLUG" == "demo" ]]; then
    require_demo_reset_confirmation
    [[ "$DEMO_RESET_DATA" == "true" ]] || {
      echo "Refusing to delete the demo database while DEMO_RESET_DATA=false" >&2
      return 1
    }
  fi
  docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --force --if-exists \
    "$database_name"
}

revoke_public_database_connect() {
  local database_name="$1"
  validate_database_name "$database_name"
  docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
    "REVOKE CONNECT ON DATABASE \"${database_name}\" FROM PUBLIC;" >/dev/null
}

restore_dump_into_template() {
  echo "Restoring production dump into template database from ${DUMP_URI}..."
  stream_preview_dump \
    | sed -e '/^\\restrict/d' \
          -e '/^\\unrestrict/d' \
          -e '/^SET transaction_timeout/d' \
          -e '/OWNER TO /d' \
          -e '/^GRANT /d' \
          -e '/^REVOKE /d' \
    | docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d "$TEMPLATE_DB" -v ON_ERROR_STOP=1
}

ensure_template_database() {
  validate_database_name "$TEMPLATE_DB"
  local lock_file="$ROOT/preview-postgres.lock"

  (
    flock 9
    if database_exists "$TEMPLATE_DB"; then
      revoke_public_database_connect "$TEMPLATE_DB"
      echo "Template database $TEMPLATE_DB already exists; skipping production dump restore."
      exit 0
    fi

    docker exec "$POSTGRES_CONTAINER" createdb -U postgres "$TEMPLATE_DB"
    revoke_public_database_connect "$TEMPLATE_DB"
    if ! restore_dump_into_template; then
      docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --if-exists "$TEMPLATE_DB" || true
      exit 1
    fi
  ) 9>"$lock_file"
}

ensure_production_dump_preview_database() {
  validate_database_name "$DATABASE_NAME"
  if database_exists "$DATABASE_NAME"; then
    echo "Preview database $DATABASE_NAME already exists; skipping clone."
    return 0
  fi

  docker exec "$POSTGRES_CONTAINER" createdb -U postgres -O "$DATABASE_USER" -T "$TEMPLATE_DB" "$DATABASE_NAME"
  DATABASE_CREATED=1
}

reset_preview_database_for_data_source_change() {
  if [[ "$DATA_SOURCE_CHANGED" != "1" ]]; then
    return 0
  fi

  if ! database_exists "$DATABASE_NAME"; then
    return 0
  fi

  if [[ "$SLUG" == "demo" && "${DEMO_RESET_DATA:-false}" != "true" ]]; then
    echo "Refusing to adopt an existing demo database without a matching data-source fingerprint." >&2
    exit 1
  fi

  echo "Preview data source changed; replacing database $DATABASE_NAME..."
  backup_demo_database_before_reset
  if [[ "$SLUG" == "demo" ]]; then
    arm_demo_reset_recovery
  else
    "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
  fi
  drop_preview_database "$DATABASE_NAME"
  rm -f "$TOOLING_FINGERPRINT_FILE"
}

reset_seed_preview_database() {
  validate_database_name "$DATABASE_NAME"
  echo "Resetting preview database $DATABASE_NAME for seeded local-dev data..."
  backup_demo_database_before_reset
  if [[ "$SLUG" == "demo" ]]; then
    arm_demo_reset_recovery
  else
    "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
  fi
  drop_preview_database "$DATABASE_NAME"
  docker exec "$POSTGRES_CONTAINER" createdb -U postgres -O "$DATABASE_USER" "$DATABASE_NAME"
  DATABASE_CREATED=1
}

install_demo_backup_tooling() {
  [[ "$SLUG" == "demo" ]] || return 0
  [[ "$ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
    echo "Demo backup paths cannot contain whitespace" >&2
    exit 1
  }
  mkdir -p "$ROOT/ops" "$ROOT/backups"
  chmod 700 "$ROOT/ops" "$ROOT/backups"
  install -m 700 "$SCRIPT_DIR/backup-database.sh" "$ROOT/ops/backup-database.sh"
  install -m 700 "$SCRIPT_DIR/publish-demo-backup.sh" "$ROOT/ops/publish-demo-backup.sh"
  install -m 700 "$SCRIPT_DIR/restore-demo-backup.sh" "$ROOT/ops/restore-demo-backup.sh"
}

create_seed_preview_database() {
  validate_database_name "$DATABASE_NAME"
  echo "Creating preview database $DATABASE_NAME for seeded local-dev data..."
  docker exec "$POSTGRES_CONTAINER" createdb -U postgres -O "$DATABASE_USER" "$DATABASE_NAME"
  DATABASE_CREATED=1
}

ensure_preview_database() {
  case "$DATA_MODE" in
    seed)
      if [[ "${DEMO_RESET_DATA:-false}" == "true" ]]; then
        reset_seed_preview_database
      elif database_exists "$DATABASE_NAME"; then
        echo "Preview database $DATABASE_NAME already exists; preserving seat data."
      else
        create_seed_preview_database
      fi
      ;;
    production-dump|sanitized-production)
      ensure_template_database
      ensure_production_dump_preview_database
      ;;
    *)
      echo "Unsupported PREVIEW_DATA_MODE: $DATA_MODE" >&2
      exit 1
      ;;
  esac
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

sha256_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum
  else
    shasum -a 256
  fi
}

compute_tooling_fingerprint() {
  (
    cd "$SOURCE_DIR"
    {
      for control_file in \
        "$SCRIPT_DIR/deploy.sh" \
        "$SCRIPT_DIR/preview-env.mjs" \
        "$SCRIPT_DIR/render-compose.mjs" \
        "$SCRIPT_DIR/find-traefik-dynamic-dir.sh" \
        "$SCRIPT_DIR/rollout-web.sh" \
        "$SCRIPT_DIR/tooling-artifacts.sh"
      do
        sha256_file "$control_file"
      done
      for file in \
        package.json \
        bun.lock \
        bun.lockb \
        services/web-app/package.json \
        packages/prisma/package.json \
        packages/prisma/schema.prisma \
        packages/prisma/prisma.config.ts \
        packages/prisma/scripts/assignment-type-release-gate.ts \
        packages/prisma/scripts/backfill-class-art-key.ts \
        packages/prisma/scripts/seed-local-dev.ts \
        packages/prisma/scripts/seed-class-starter-assignment-type.ts \
        packages/prisma/scripts/seed-preview-teacher-notes-qa.ts \
        packages/prisma/scripts/local-dev/preview-teacher-notes-qa.ts \
        packages/prisma/scripts/assets/class-starter.jpg \
        packages/prisma/scripts/sync-prod-fidelity-fixtures.ts \
        packages/prisma/scripts/preview-seats.ts \
        packages/prisma/scripts/seed-preview-seats.ts \
        packages/prisma/scripts/local-dev/class-insights.ts \
        packages/prisma/scripts/local-dev/dev-personas.ts \
        packages/prisma/scripts/local-dev/seed-synthetic-data.ts \
        packages/prisma/scripts/local-dev/seed-daily-pages-samples.ts \
        services/web-app/app/domain/assignment-types/daily-pages-sample-entries.ts \
        scripts/preview/deploy.sh
      do
        if [[ -f "$file" ]]; then
          sha256_file "$file"
        fi
      done

      if [[ -d packages/prisma/fixtures/prod-fidelity ]]; then
        find packages/prisma/fixtures/prod-fidelity -type f -print \
          | LC_ALL=C sort \
          | while IFS= read -r file; do
              sha256_file "$file"
            done
      fi

      if [[ -d packages/prisma/migrations ]]; then
        find packages/prisma/migrations -type f -print \
          | LC_ALL=C sort \
          | while IFS= read -r file; do
              sha256_file "$file"
            done
      fi
    } | sha256_stream | awk '{print $1}'
  )
}

run_tooling_if_needed() {
  local fingerprint
  local previous_fingerprint=""
  fingerprint="$(compute_tooling_fingerprint)"
  if [[ -f "$TOOLING_FINGERPRINT_FILE" ]]; then
    previous_fingerprint="$(<"$TOOLING_FINGERPRINT_FILE")"
  fi

  local missing_artifacts
  missing_artifacts="$(preview_missing_tooling_artifacts "$SOURCE_DIR" | awk 'BEGIN { first = 1 } { if (!first) printf ", "; printf "%s", $0; first = 0 }')"

  # The tooling fingerprint intentionally covers database/bootstrap inputs, not every
  # application source file. Production images therefore rebuild on every deployment;
  # Docker's layer cache keeps unchanged builds cheap while guaranteeing code-only refs
  # cannot silently restart the previously tagged image.
  if [[ "$RUNTIME" == "production" ]]; then
    COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build web
  fi

  if [[ "$DATABASE_CREATED" == "0" && "$fingerprint" == "$previous_fingerprint" && -z "$missing_artifacts" ]]; then
    echo "Tooling fingerprint unchanged and database already existed; skipping install/generate/migrate."
    TOOLING_CHANGED=0
    # Even when skipping full tooling, always run idempotent seeds that must
    # keep preview data current with the codebase (e.g., AP History library).
    if [[ -f "$SOURCE_DIR/packages/prisma/scripts/seed-ap-history-library.ts" ]]; then
      echo "Running AP History library seed on existing preview database (skip path)."
      "${compose[@]}" run --rm toolbox bash -lc 'bun prisma generate && bun run seed-ap-history-library'
    fi
    return 0
  fi

  if [[ -n "$missing_artifacts" ]]; then
    echo "Preview tooling artifacts missing ($missing_artifacts); running install/generate/migrate."
  fi

  if [[ "$RUNTIME" != "production" ]]; then
    "${compose[@]}" pull --quiet toolbox web || true
  fi

  local tooling_command
  tooling_command='bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy'
  if [[ -f "$SOURCE_DIR/packages/prisma/scripts/backfill-class-art-key.ts" ]]; then
    tooling_command+=' && bun run scripts/backfill-class-art-key.ts'
  fi
  if [[ "$DATA_MODE" == "seed" && "$DATABASE_CREATED" == "1" ]]; then
    if [[ ! -f "$SOURCE_DIR/packages/prisma/scripts/seed-local-dev.ts" ]]; then
      echo "Requested application ref cannot seed a new preview database." >&2
      exit 1
    fi
    tooling_command+=' && bun run seed-local-dev'
  elif [[ "$DATA_MODE" == "seed" && -f "$SOURCE_DIR/packages/prisma/scripts/sync-prod-fidelity-fixtures.ts" ]]; then
    tooling_command+=' && bun run sync-prod-fidelity-fixtures'
  fi
  # After whichever data path above created an organization, and before the gate
  # that validates assignment type data. `kind` is not settable through the admin
  # UI, so without this a preview has no Class Starter to click on. The seed is
  # idempotent, so it runs on every data mode and on every deploy.
  if [[ -f "$SOURCE_DIR/packages/prisma/scripts/seed-class-starter-assignment-type.ts" ]]; then
    tooling_command+=' && bun run seed-class-starter-assignment-type'
  fi
  if [[ "$DATA_MODE" == "seed" && -f "$SOURCE_DIR/packages/prisma/scripts/seed-preview-teacher-notes-qa.ts" ]]; then
    tooling_command+=' && bun run seed-preview-teacher-notes-qa'
  fi
  if [[ -f "$SOURCE_DIR/packages/prisma/scripts/assignment-type-release-gate.ts" ]]; then
    tooling_command+=' && bun run scripts/assignment-type-release-gate.ts --require-data'
  fi
  # Always (idempotently) seed the AP History assignment type and prompt library so
  # previews backed by an existing database pick up newly added prompts/sections.
  if [[ -f "$SOURCE_DIR/packages/prisma/scripts/seed-ap-history-library.ts" ]]; then
    tooling_command+=' && bun run seed-ap-history-library'
  fi

  "${compose[@]}" run --rm toolbox bash -lc "$tooling_command"
  printf '%s\n' "$fingerprint" > "$TOOLING_FINGERPRINT_FILE"
}

prebuild_production_images() {
  [[ "$RUNTIME" == "production" ]] || return 0
  # Complete every fallible image build before an explicit demo reset can touch data.
  # Docker's layer cache keeps unchanged builds cheap while code-only refs still rebuild.
  COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build web toolbox
}

ensure_preview_seats() {
  if [[ "$DATA_MODE" != "seed" ]]; then
    return 0
  fi
  if [[ ! -f "$SOURCE_DIR/packages/prisma/scripts/seed-preview-seats.ts" ]]; then
    echo "Requested application ref predates preview seats; preserving the existing demo database."
    return 0
  fi
  "${compose[@]}" run --rm toolbox bash -lc \
    'cd packages/prisma && bun run seed-preview-seats'
}

remove_legacy_project_postgres() {
  docker rm -f "${COMPOSE_PROJECT}-postgres-1" >/dev/null 2>&1 || true
  docker volume rm "${COMPOSE_PROJECT}_${COMPOSE_PROJECT}-postgres-data" >/dev/null 2>&1 || true
}

refresh_web_container_if_needed() {
  "${compose[@]}" up -d --force-recreate web
  start_blackboard_lti_mock_if_present
  remove_legacy_project_postgres
}

start_blackboard_lti_mock_if_present() {
  if grep -qE '^[[:space:]]*blackboard-lti-mock:' "$PREVIEW_DIR/docker-compose.yml"; then
    "${compose[@]}" up -d --force-recreate blackboard-lti-mock
  fi
}

rollout_demo_web_without_downtime() {
  local traefik_dynamic_dir additional_hostnames
  traefik_dynamic_dir="$(bash "$SCRIPT_DIR/find-traefik-dynamic-dir.sh")"
  additional_hostnames=""
  if [[ "${PREVIEW_UA_STUDENT_BILLING_ENABLED:-false}" == "true" ]]; then
    additional_hostnames="$UA_HOSTNAME"
  fi
  PREVIEW_COMPOSE_PROJECT="$COMPOSE_PROJECT" \
    PREVIEW_COMPOSE_FILE="$PREVIEW_DIR/docker-compose.yml" \
    PREVIEW_ROUTER_FILE="$traefik_dynamic_dir/${COMPOSE_PROJECT}-cutover.yml" \
    PREVIEW_HOSTNAME="$HOSTNAME" \
    PREVIEW_ADDITIONAL_HOSTNAMES="$additional_hostnames" \
    PREVIEW_PUBLIC_URL="$URL" \
    PREVIEW_LOGIN_SMOKE_SCRIPT="$SCRIPT_DIR/smoke-login.mjs" \
    PREVIEW_ACCESS_CODE="$smoke_access_code" \
    PREVIEW_DATA_MODE="$DATA_MODE" \
    PREVIEW_RUNTIME="$RUNTIME" \
    PREVIEW_DEV_LOGIN_EMAIL="$PREVIEW_DEV_LOGIN_EMAIL" \
    PREVIEW_LOGIN_EMAIL="${PREVIEW_LOGIN_EMAIL:-}" \
    PREVIEW_LOGIN_PASSWORD="${PREVIEW_LOGIN_PASSWORD:-}" \
    PREVIEW_TLS="${PREVIEW_TLS:-true}" \
    bash "$SCRIPT_DIR/rollout-web.sh"
  remove_legacy_project_postgres
}

ensure_shared_postgres

assert_no_master_code_collision() {
  [[ "$PREVIEW_MASTER_ORG_GATE_ENABLED" == "true" ]] || return 0
  local database_exists relation_exists collision
  database_exists="$(docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d postgres -Atc \
    "SELECT 1 FROM pg_database WHERE datname = '${DATABASE_NAME}'" | tr -d '[:space:]')"
  [[ "$database_exists" == "1" ]] || return 0
  relation_exists="$(docker exec "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d "$DATABASE_NAME" -Atc \
    "SELECT to_regclass('public.\"Organization\"') IS NOT NULL" | tr -d '[:space:]')"
  [[ "$relation_exists" == "t" ]] || return 0
  collision="$(docker exec \
    -e PGOPTIONS="-c yawp.master_access_code=$PREVIEW_MASTER_ACCESS_CODE" \
    "$POSTGRES_CONTAINER" psql --no-psqlrc -U postgres -d "$DATABASE_NAME" -Atc \
    "SELECT 1 FROM \"Organization\" WHERE lower(\"previewSeatCode\") = lower(current_setting('yawp.master_access_code')) LIMIT 1" \
    | tr -d '[:space:]')"
  if [[ "$collision" == "1" ]]; then
    echo "Generic master access code collides with an existing organization code; deployment stopped without changing that code." >&2
    exit 1
  fi
}

assert_no_master_code_collision
ensure_preview_database_role
prebuild_production_images
trap recover_demo_database_on_failure EXIT
reset_preview_database_for_data_source_change
ensure_preview_database
harden_preview_database
run_tooling_if_needed
ensure_preview_seats
assert_no_master_code_collision
install_demo_backup_tooling
health_url="${PREVIEW_HEALTHCHECK_URL:-${URL}/api/healthcheck}"
login_url="${PREVIEW_LOGIN_URL:-${URL}}"
smoke_access_code="$(
  PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e \
    "process.stdout.write(JSON.parse(process.env.PREVIEW_ACCESS_SEATS)[0].code)"
)"
if [[ -n "${DIRECT_PORT:-}" ]]; then
  health_url="http://127.0.0.1:${DIRECT_PORT}/api/healthcheck"
  login_url="http://127.0.0.1:${DIRECT_PORT}"
fi

start_or_refresh_web() {
  if [[ "$SLUG" == "demo" && "$RUNTIME" == "production" && -z "${DIRECT_PORT:-}" ]]; then
    rollout_demo_web_without_downtime
  else
    refresh_web_container_if_needed
  fi
  if [[ "$SLUG" == "demo" && "$RUNTIME" == "production" && -z "${DIRECT_PORT:-}" ]]; then
    start_blackboard_lti_mock_if_present
  fi
}
start_or_refresh_web

  if [[ "$SLUG" != "demo" \
    && -z "${DIRECT_PORT:-}" \
    && "${PREVIEW_TLS:-true}" == "true" \
    && "$PREVIEW_CUSTOM_INGRESS_ACTIVE" == "true" ]]; then
  PREVIEW_ROOT="$ROOT" \
  PREVIEW_DOMAIN="$PREVIEW_DOMAIN" \
  PREVIEW_ACME_EMAIL="${PREVIEW_ACME_EMAIL:-admin@example.com}" \
    node "$SCRIPT_DIR/certificate-manager.mjs" "$HOSTNAME"
  PREVIEW_ROOT="$ROOT" \
  PREVIEW_DOMAIN="$PREVIEW_DOMAIN" \
  PREVIEW_ACME_EMAIL="${PREVIEW_ACME_EMAIL:-admin@example.com}" \
    node "$SCRIPT_DIR/certificate-manager.mjs" "$UA_HOSTNAME"
  if grep -qE '^[[:space:]]*blackboard-lti-mock:' "$PREVIEW_DIR/docker-compose.yml"; then
    PREVIEW_ROOT="$ROOT" \
    PREVIEW_DOMAIN="$PREVIEW_DOMAIN" \
    PREVIEW_ACME_EMAIL="${PREVIEW_ACME_EMAIL:-admin@example.com}" \
      node "$SCRIPT_DIR/certificate-manager.mjs" "$BLACKBOARD_HOSTNAME" \
      || echo "Blackboard hostname certificate not issued yet; host ingress must route ${BLACKBOARD_HOSTNAME}"
  fi
fi

for attempt in $(seq 1 90); do
  if curl -fsS --connect-timeout 1 --max-time 2 "$health_url" >/dev/null; then
    PREVIEW_BASE_URL="$login_url" \
      PREVIEW_DATA_MODE="$DATA_MODE" \
      PREVIEW_ACCESS_CODE="$smoke_access_code" \
      node "$SCRIPT_DIR/smoke-login.mjs"
    end_ms="$(date +%s%3N)"
    elapsed_ms="$((end_ms - start_ms))"
    echo "PREVIEW_URL=$URL"
    echo "PREVIEW_HOSTNAME=$HOSTNAME"
    echo "UA_PREVIEW_URL=$UA_URL"
    echo "UA_PREVIEW_HOSTNAME=$UA_HOSTNAME"
    echo "BLACKBOARD_URL=$BLACKBOARD_URL"
    echo "BLACKBOARD_HOSTNAME=$BLACKBOARD_HOSTNAME"
    echo "PREVIEW_ACCESS_CODE=$smoke_access_code"
    echo "PREVIEW_MASTER_ORG_GATE_ENABLED=$PREVIEW_MASTER_ORG_GATE_ENABLED"
    PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e '
      for (const [index, seat] of JSON.parse(process.env.PREVIEW_ACCESS_SEATS).entries()) {
        console.log(`PREVIEW_SEAT_CODE_${index + 1}=${seat.code}`)
        console.log(`Preview seat ${index + 1} (${seat.label}): ${seat.code}`)
      }
    '
    echo "PREVIEW_ELAPSED_MS=$elapsed_ms"
    printf '%s\n' "$DATA_SOURCE_FINGERPRINT" > "$DATA_SOURCE_FINGERPRINT_FILE"
    DEMO_RESET_RECOVERY_ARMED=false
    exit 0
  fi
  echo "Waiting for preview healthcheck ($attempt/90): $health_url"
  sleep 1
done

echo "Preview did not become healthy: $health_url" >&2
"${compose[@]}" ps >&2 || true
"${compose[@]}" logs --tail=120 web >&2 || true
exit 1
