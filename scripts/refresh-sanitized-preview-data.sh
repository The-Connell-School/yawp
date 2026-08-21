#!/usr/bin/env bash
# Refresh the preview-safe production snapshot without ever writing raw production SQL to disk.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_ENV_FILE="${ROOT}/scripts/production-sync.env"
ENV_FILE="${YAWP_PRODUCTION_SYNC_ENV_FILE:-${DEFAULT_ENV_FILE}}"
DRY_RUN=false
CONFIRMED=false

usage() {
  cat <<'USAGE'
Usage: bash scripts/refresh-sanitized-preview-data.sh [options]

Streams production through SSH directly into a temporary local Postgres,
sanitizes identity fields, verifies data parity, uploads only the scrubbed
dump, and updates PREVIEW_SANITIZED_DUMP_VERSION in GitHub.

Options:
  --env-file PATH  Load production access values from PATH instead of
                   scripts/production-sync.env.
  --dry-run        Print the redacted execution plan. Make no external calls.
  --yes            Confirm the scrubbed S3 object and GitHub variable update.
  -h, --help       Show this help.

Non-interactive confirmation:
  YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH=yes \
    bun run db:refresh-sanitized-preview-data

Required configuration is documented in scripts/production-sync.env.example.
The command never saves the raw production dump and never prints passwords.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || { echo "--env-file requires a path" >&2; exit 2; }
      ENV_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes)
      CONFIRMED=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
elif [[ "$ENV_FILE" != "$DEFAULT_ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ "$DRY_RUN" != true && "$CONFIRMED" != true && "${YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH:-}" != yes ]]; then
  echo "Confirmation required: pass --yes or set YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH=yes" >&2
  exit 1
fi

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required configuration: $name" >&2
    exit 1
  fi
}

PREVIEW_DB_DUMP_S3_URI="${PREVIEW_DB_DUMP_S3_URI:-s3://yawp-preview-videos/production.dump}"
YAWP_GITHUB_REPOSITORY="${YAWP_GITHUB_REPOSITORY:-${GITHUB_REPOSITORY:-The-Connell-School/yawp}}"

for required_name in \
  YAWP_PROD_BASTION_HOST \
  YAWP_PROD_BASTION_KEY \
  YAWP_PROD_PG_HOST \
  YAWP_PROD_PG_USER \
  YAWP_PROD_PG_DB; do
  require_value "$required_name"
done

PROD_PASSWORD="${YAWP_PROD_PG_PASSWORD:-${PGPASSWORD:-}}"
if [[ -z "$PROD_PASSWORD" ]]; then
  echo "Missing required configuration: YAWP_PROD_PG_PASSWORD (or PGPASSWORD)" >&2
  exit 1
fi

if [[ ! "$PREVIEW_DB_DUMP_S3_URI" =~ ^s3://[^/]+/.+ ]]; then
  echo "PREVIEW_DB_DUMP_S3_URI must be an s3://bucket/key URI" >&2
  exit 1
fi

BASTION_USER="${YAWP_PROD_BASTION_USER:-ec2-user}"
PROD_PORT="${YAWP_PROD_PG_PORT:-5432}"
MASTER_ORGANIZATION_ID="${PREVIEW_ACCESS_MASTER_ORGANIZATION_ID:-default-org}"

if [[ "$DRY_RUN" == true ]]; then
  cat <<PLAN
Sanitized production preview refresh plan (no changes will be made):
1. Use production access configuration from ${ENV_FILE}.
2. Start a configured stopped bastion only when required.
3. Stream production dump directly into temporary Postgres; save no raw SQL.
4. Run local-only identity sanitizer and require its row/hash parity checks.
5. Create a scrubbed compressed dump.
6. Upload scrubbed dump to ${PREVIEW_DB_DUMP_S3_URI}.
7. Set PREVIEW_SANITIZED_DUMP_VERSION for ${YAWP_GITHUB_REPOSITORY}.
8. Remove temporary database/container/files and stop any bastion started here.
PLAN
  exit 0
fi

if [[ ! -f "$YAWP_PROD_BASTION_KEY" ]]; then
  echo "Bastion key not found: $YAWP_PROD_BASTION_KEY" >&2
  exit 1
fi

for command_name in docker ssh aws gh bun gzip shasum sed; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command not found: $command_name" >&2
    exit 1
  }
done

docker info >/dev/null 2>&1 || {
  echo "Docker is not available" >&2
  exit 1
}
gh auth status >/dev/null 2>&1 || {
  echo "GitHub CLI is not authenticated" >&2
  exit 1
}

AWS=(aws)
if [[ -n "${AWS_PROFILE:-}" ]]; then
  AWS+=(--profile "$AWS_PROFILE")
fi
if [[ -n "${AWS_REGION:-}" ]]; then
  AWS+=(--region "$AWS_REGION")
fi

WORK_PARENT="${YAWP_REFRESH_WORK_DIR:-${TMPDIR:-/tmp}}"
mkdir -p "$WORK_PARENT"
WORK_DIR="$(mktemp -d "${WORK_PARENT%/}/yawp-sanitized-refresh.XXXXXX")"
SANITIZED_DUMP="${WORK_DIR}/sanitized.sql.gz"
SANITIZER_REPORT="${WORK_DIR}/sanitizer-report.json"
CONTAINER_NAME="${YAWP_REFRESH_CONTAINER_NAME:-yawp-sanitized-refresh-$$}"
LOCAL_DB="yawp_sanitized_refresh"
CONTAINER_STARTED=false
BASTION_STARTED=false

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ "$CONTAINER_STARTED" == true ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if [[ "$BASTION_STARTED" == true ]]; then
    "${AWS[@]}" ec2 stop-instances \
      --instance-ids "$YAWP_PROD_BASTION_INSTANCE_ID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$WORK_DIR"
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

LOCAL_PG_PASSWORD="${YAWP_REFRESH_LOCAL_PG_PASSWORD:-$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')}"

if [[ -n "${YAWP_PROD_BASTION_INSTANCE_ID:-}" ]]; then
  bastion_state="$(
    "${AWS[@]}" ec2 describe-instances \
      --instance-ids "$YAWP_PROD_BASTION_INSTANCE_ID" \
      --query 'Reservations[0].Instances[0].State.Name' \
      --output text
  )"
  case "$bastion_state" in
    stopped)
      echo "Starting production bastion for snapshot stream..."
      BASTION_STARTED=true
      "${AWS[@]}" ec2 start-instances \
        --instance-ids "$YAWP_PROD_BASTION_INSTANCE_ID" >/dev/null
      "${AWS[@]}" ec2 wait instance-running \
        --instance-ids "$YAWP_PROD_BASTION_INSTANCE_ID"
      ;;
    running)
      ;;
    pending)
      "${AWS[@]}" ec2 wait instance-running \
        --instance-ids "$YAWP_PROD_BASTION_INSTANCE_ID"
      ;;
    *)
      echo "Bastion instance is not usable (state: $bastion_state)" >&2
      exit 1
      ;;
  esac
  discovered_bastion_host="$(
    "${AWS[@]}" ec2 describe-instances \
      --instance-ids "$YAWP_PROD_BASTION_INSTANCE_ID" \
      --query 'Reservations[0].Instances[0].PublicIpAddress' \
      --output text
  )"
  if [[ -n "$discovered_bastion_host" && "$discovered_bastion_host" != None ]]; then
    YAWP_PROD_BASTION_HOST="$discovered_bastion_host"
  fi
fi

echo "Starting temporary Postgres..."
CONTAINER_STARTED=true
docker run -d --name "$CONTAINER_NAME" \
  -e "POSTGRES_PASSWORD=${LOCAL_PG_PASSWORD}" \
  -p 127.0.0.1::5432 \
  --health-cmd='pg_isready -U postgres' \
  --health-interval=1s \
  --health-timeout=5s \
  --health-retries=60 \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 60); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" == healthy ]]; then
    break
  fi
  sleep 1
done
if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" != healthy ]]; then
  echo "Temporary Postgres did not become healthy" >&2
  exit 1
fi

LOCAL_PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | sed -E 's/^.*:([0-9]+)$/\1/' | tail -n 1)"
if [[ ! "$LOCAL_PORT" =~ ^[0-9]+$ ]]; then
  echo "Could not determine temporary Postgres port" >&2
  exit 1
fi

docker exec -e "PGPASSWORD=${LOCAL_PG_PASSWORD}" "$CONTAINER_NAME" \
  createdb -U postgres "$LOCAL_DB"

printf -v quoted_prod_password '%q' "$PROD_PASSWORD"
printf -v quoted_prod_host '%q' "$YAWP_PROD_PG_HOST"
printf -v quoted_prod_port '%q' "$PROD_PORT"
printf -v quoted_prod_user '%q' "$YAWP_PROD_PG_USER"
printf -v quoted_prod_db '%q' "$YAWP_PROD_PG_DB"
remote_dump_command="export PGPASSWORD=${quoted_prod_password}; exec pg_dump -h ${quoted_prod_host} -p ${quoted_prod_port} -U ${quoted_prod_user} -d ${quoted_prod_db} --format=plain --no-owner --no-acl"

echo "Streaming production directly into temporary Postgres..."
ssh -i "$YAWP_PROD_BASTION_KEY" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  -o "UserKnownHostsFile=${WORK_DIR}/known_hosts" \
  "${BASTION_USER}@${YAWP_PROD_BASTION_HOST}" \
  "$remote_dump_command" \
  | sed -e '/^\\restrict/d' -e '/^\\unrestrict/d' -e '/^SET transaction_timeout/d' \
  | docker exec -i -e "PGPASSWORD=${LOCAL_PG_PASSWORD}" "$CONTAINER_NAME" \
      psql -U postgres -d "$LOCAL_DB" -v ON_ERROR_STOP=1 >/dev/null

LOCAL_DATABASE_URL="postgresql://postgres:${LOCAL_PG_PASSWORD}@127.0.0.1:${LOCAL_PORT}/${LOCAL_DB}"
echo "Sanitizing identities and verifying production parity..."
(
  cd "$ROOT"
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  PREVIEW_ACCESS_MASTER_ORGANIZATION_ID="$MASTER_ORGANIZATION_ID" \
    bun run --cwd packages/prisma sanitize-preview-production-data
) >"$SANITIZER_REPORT"

if ! grep -q '"usersSanitized"' "$SANITIZER_REPORT" \
  || ! grep -q '"tablesVerified"' "$SANITIZER_REPORT" \
  || ! grep -q '"fingerprints"' "$SANITIZER_REPORT"; then
  echo "Sanitizer did not emit its required parity report" >&2
  exit 1
fi

echo "Creating scrubbed snapshot..."
docker exec -e "PGPASSWORD=${LOCAL_PG_PASSWORD}" "$CONTAINER_NAME" \
  pg_dump -U postgres -d "$LOCAL_DB" --format=plain --no-owner --no-acl \
  | gzip -9 >"$SANITIZED_DUMP"
if [[ ! -s "$SANITIZED_DUMP" ]]; then
  echo "Scrubbed snapshot is empty" >&2
  exit 1
fi

snapshot_hash="$(shasum -a 256 "$SANITIZED_DUMP" | awk '{print substr($1, 1, 8)}')"
snapshot_version="$(date -u +%Y%m%dT%H%M%SZ)-${snapshot_hash}"
s3_path="${PREVIEW_DB_DUMP_S3_URI#s3://}"
s3_bucket="${s3_path%%/*}"
s3_key="${s3_path#*/}"

echo "Uploading scrubbed snapshot..."
gzip -dc "$SANITIZED_DUMP" \
  | "${AWS[@]}" s3 cp - "$PREVIEW_DB_DUMP_S3_URI" \
      --sse AES256 --only-show-errors
"${AWS[@]}" s3api head-object --bucket "$s3_bucket" --key "$s3_key" >/dev/null

echo "Publishing sanitized snapshot version..."
gh variable set PREVIEW_SANITIZED_DUMP_VERSION \
  --body "$snapshot_version" \
  --repo "$YAWP_GITHUB_REPOSITORY"

echo "Sanitized preview snapshot refreshed."
echo "PREVIEW_SANITIZED_DUMP_VERSION=${snapshot_version}"
