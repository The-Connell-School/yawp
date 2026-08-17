#!/usr/bin/env bash
# Wake one resident preview without rebuilding it. This intentionally uses
# docker compose start so containers, volumes, database, and access state survive sleep.
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
DOCKER="${PREVIEW_DOCKER:-docker}"
CURL="${PREVIEW_CURL:-curl}"
RUNNING_CAP="${PREVIEW_MAX_RUNNING:-4}"
SLEEP_ENABLED="${PREVIEW_SLEEP_ENABLED:-true}"
ALLOW_DISPLACEMENT="${PREVIEW_WAKE_ALLOW_DISPLACEMENT:-true}"
LOCK_WAIT_SECONDS="${PREVIEW_LOCK_WAIT_SECONDS:-900}"
INFLIGHT_TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"
HEALTH_ATTEMPTS="${PREVIEW_WAKE_HEALTH_ATTEMPTS:-60}"
HEALTH_INTERVAL_SECONDS="${PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS:-1}"
ACCESS_DIR="${PREVIEW_ACCESS_DIR:-$ROOT/wake/access}"
FIXED_NOW_EPOCH="${PREVIEW_NOW_EPOCH:-}"
NOW_EPOCH=0
AUTHORIZED_AT_EPOCH="${PREVIEW_WAKE_AUTHORIZED_AT_EPOCH:-}"
AUTHORIZATION_MAX_QUEUE_SECONDS="${PREVIEW_WAKE_AUTHORIZATION_MAX_QUEUE_SECONDS:-30}"
AUTHORIZED_ORGANIZATION_ID="${PREVIEW_WAKE_AUTHORIZED_ORGANIZATION_ID:-}"
REQUIRE_PREVIEW_SEAT_CODE="${PREVIEW_WAKE_REQUIRE_PREVIEW_SEAT_CODE:-}"
AUTHORIZED_CODE_SHA256="${PREVIEW_WAKE_AUTHORIZED_CODE_HMAC_SHA256:-}"
WAKE_LEASE_SECONDS="${PREVIEW_WAKE_LEASE_SECONDS:-120}"
LEGACY_HEALTH_PORT="${PREVIEW_LEGACY_HEALTH_PORT:-8080}"
PR_NUMBER="${1:-}"

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

is_nonnegative_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

is_positive_integer "$PR_NUMBER" || {
  echo "Preview PR must be a positive integer" >&2
  exit 2
}
is_positive_integer "$RUNNING_CAP" || {
  echo "PREVIEW_MAX_RUNNING must be a positive integer" >&2
  exit 2
}
case "$SLEEP_ENABLED" in
  true|false) ;;
  *) echo "PREVIEW_SLEEP_ENABLED must be true or false" >&2; exit 2 ;;
esac
case "$ALLOW_DISPLACEMENT" in
  true|false) ;;
  *) echo "PREVIEW_WAKE_ALLOW_DISPLACEMENT must be true or false" >&2; exit 2 ;;
esac
is_nonnegative_integer "$LOCK_WAIT_SECONDS" || {
  echo "PREVIEW_LOCK_WAIT_SECONDS must be a nonnegative integer" >&2
  exit 2
}
is_nonnegative_integer "$INFLIGHT_TTL_SECONDS" || {
  echo "PREVIEW_INFLIGHT_TTL_SECONDS must be a nonnegative integer" >&2
  exit 2
}
is_positive_integer "$HEALTH_ATTEMPTS" || {
  echo "PREVIEW_WAKE_HEALTH_ATTEMPTS must be a positive integer" >&2
  exit 2
}
is_nonnegative_integer "$HEALTH_INTERVAL_SECONDS" || {
  echo "PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS must be a nonnegative integer" >&2
  exit 2
}
[[ -z "$FIXED_NOW_EPOCH" ]] || is_nonnegative_integer "$FIXED_NOW_EPOCH" || {
  echo "PREVIEW_NOW_EPOCH must be a nonnegative integer" >&2
  exit 2
}
[[ -z "$AUTHORIZED_AT_EPOCH" ]] || is_nonnegative_integer "$AUTHORIZED_AT_EPOCH" || {
  echo "PREVIEW_WAKE_AUTHORIZED_AT_EPOCH must be a nonnegative integer" >&2
  exit 2
}
is_nonnegative_integer "$AUTHORIZATION_MAX_QUEUE_SECONDS" || {
  echo "PREVIEW_WAKE_AUTHORIZATION_MAX_QUEUE_SECONDS must be a nonnegative integer" >&2
  exit 2
}
if [[ -n "$AUTHORIZED_ORGANIZATION_ID" ]] \
  && [[ ! "$AUTHORIZED_ORGANIZATION_ID" =~ ^[a-z0-9][a-z0-9-]{0,127}$ ]]; then
  echo "PREVIEW_WAKE_AUTHORIZED_ORGANIZATION_ID is invalid" >&2
  exit 2
fi
case "$REQUIRE_PREVIEW_SEAT_CODE" in
  true|false|'') ;;
  *) echo "PREVIEW_WAKE_REQUIRE_PREVIEW_SEAT_CODE must be true or false" >&2; exit 2 ;;
esac
if [[ -n "$AUTHORIZED_ORGANIZATION_ID" && -z "$REQUIRE_PREVIEW_SEAT_CODE" ]] \
  || [[ -z "$AUTHORIZED_ORGANIZATION_ID" && -n "$REQUIRE_PREVIEW_SEAT_CODE" ]]; then
  echo "Preview wake authorization descriptor is incomplete" >&2
  exit 2
fi
if [[ -n "$AUTHORIZED_CODE_SHA256" && ! "$AUTHORIZED_CODE_SHA256" =~ ^[a-f0-9]{64}$ ]]; then
  echo "PREVIEW_WAKE_AUTHORIZED_CODE_HMAC_SHA256 is invalid" >&2
  exit 2
fi
is_nonnegative_integer "$WAKE_LEASE_SECONDS" || {
  echo "PREVIEW_WAKE_LEASE_SECONDS must be a nonnegative integer" >&2
  exit 2
}
if ! is_positive_integer "$LEGACY_HEALTH_PORT" || (( LEGACY_HEALTH_PORT > 65535 )); then
  echo "PREVIEW_LEGACY_HEALTH_PORT must be a valid TCP port" >&2
  exit 2
fi

preview_dir="$ROOT/previews/pr-${PR_NUMBER}"
compose_file="$preview_dir/docker-compose.yml"
project="yawp-pr-${PR_NUMBER}"

if [[ "${PREVIEW_WAKE_SKIP_FLOCK:-false}" != "true" ]] && command -v flock >/dev/null 2>&1; then
  mkdir -p "$ROOT"
  exec 9>"$ROOT/preview-host.lock"
  flock -w "$LOCK_WAIT_SECONDS" 9 || {
    echo "Preview wake lock timed out" >&2
    exit 5
  }
fi

[[ -f "$compose_file" ]] || {
  echo "Preview pr-${PR_NUMBER} is not resident" >&2
  exit 4
}

current_epoch() {
  if [[ -n "$FIXED_NOW_EPOCH" ]]; then
    printf '%s\n' "$FIXED_NOW_EPOCH"
  else
    date +%s
  fi
}

# The shared lock may queue for minutes. Start lease decisions from lock acquisition,
# not process creation, so an otherwise new wake cannot immediately displace itself.
NOW_EPOCH="$(current_epoch)"
is_nonnegative_integer "$NOW_EPOCH" || {
  echo "Preview clock returned an invalid epoch" >&2
  exit 2
}
if [[ -n "$AUTHORIZED_AT_EPOCH" ]] \
  && (( NOW_EPOCH < AUTHORIZED_AT_EPOCH \
    || NOW_EPOCH - AUTHORIZED_AT_EPOCH > AUTHORIZATION_MAX_QUEUE_SECONDS )); then
  echo "Preview authorization expired while queued" >&2
  exit 12
fi

revalidate_authorization() {
  [[ -n "$AUTHORIZED_ORGANIZATION_ID" ]] || return 0
  local current current_code current_digest manifest_record manifest_organization
  if [[ -n "$AUTHORIZED_CODE_SHA256" ]]; then
    if [[ "$REQUIRE_PREVIEW_SEAT_CODE" == "true" ]]; then
      current_code="$($DOCKER exec preview-postgres psql --no-psqlrc -v ON_ERROR_STOP=1 \
        -U postgres -d "yawp_pr_${PR_NUMBER}" -tAc \
        "SELECT COALESCE(\"previewSeatCode\", '') FROM \"Organization\" WHERE \"id\" = '${AUTHORIZED_ORGANIZATION_ID}' LIMIT 1;" \
        2>/dev/null || true)"
    else
      manifest_record="$(node -e '
        const fs = require("node:fs");
        const seats = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        const master = Array.isArray(seats) ? seats[0] : null;
        if (master) process.stdout.write(`${master.organizationId}\t${master.code}`);
      ' "$preview_dir/access-seats.json" 2>/dev/null || true)"
      IFS=$'\t' read -r manifest_organization current_code <<< "$manifest_record"
      [[ "$manifest_organization" == "$AUTHORIZED_ORGANIZATION_ID" ]] || return 1
      current="$($DOCKER exec preview-postgres psql --no-psqlrc -v ON_ERROR_STOP=1 \
        -U postgres -d "yawp_pr_${PR_NUMBER}" -tAc \
        "SELECT EXISTS (SELECT 1 FROM \"Organization\" WHERE \"id\" = '${AUTHORIZED_ORGANIZATION_ID}')::int;" \
        2>/dev/null || true)"
      [[ "${current//[[:space:]]/}" == "1" ]] || return 1
    fi
    current_digest="$(printf '%s' "$current_code" | node -e '
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const secret = fs.readFileSync(process.argv[1], "utf8").trim();
      const chunks = [];
      process.stdin.on("data", (chunk) => chunks.push(chunk));
      process.stdin.on("end", () => process.stdout.write(
        crypto.createHmac("sha256", secret).update(Buffer.concat(chunks)).digest("hex")
      ));
    ' "$preview_dir/access-secret" 2>/dev/null || true)"
    [[ "$current_digest" == "$AUTHORIZED_CODE_SHA256" ]]
    return
  fi
  local seat_predicate=""
  [[ "$REQUIRE_PREVIEW_SEAT_CODE" == "true" ]] \
    && seat_predicate=' AND "previewSeatCode" IS NOT NULL'
  current="$($DOCKER exec preview-postgres psql --no-psqlrc -v ON_ERROR_STOP=1 \
    -U postgres -d "yawp_pr_${PR_NUMBER}" -tAc \
    "SELECT EXISTS (SELECT 1 FROM \"Organization\" WHERE \"id\" = '${AUTHORIZED_ORGANIZATION_ID}'${seat_predicate})::int;" \
    2>/dev/null || true)"
  [[ "${current//[[:space:]]/}" == "1" ]]
}

require_current_authorization() {
  revalidate_authorization
}

if ! require_current_authorization; then
  echo "Preview authorization was revoked while queued" >&2
  exit 12
fi

is_running() {
  local pr="$1"
  "$DOCKER" ps \
    --filter "label=com.docker.compose.project=yawp-pr-${pr}" \
    --filter "label=com.docker.compose.service=web" \
    --filter status=running -q 2>/dev/null | grep -q .
}

running_env_numbers() {
  local project_name pr
  "$DOCKER" ps \
    --filter "label=com.docker.compose.service=web" \
    --filter status=running \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null \
    | while IFS= read -r project_name; do
        case "$project_name" in
          yawp-pr-[1-9][0-9]*) pr="${project_name#yawp-pr-}" ;;
          [1-9][0-9]*) pr="$project_name" ;;
          *) continue ;;
        esac
        is_positive_integer "$pr" && printf '%s\n' "$pr"
      done \
    | sort -un
}

marker_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || printf '0\n'
}

inflight_marker_is_fresh() {
  local marker="$1"
  local modified
  modified="$(marker_mtime "$marker")"
  is_nonnegative_integer "$modified" || return 1
  (( modified > NOW_EPOCH || NOW_EPOCH - modified < INFLIGHT_TTL_SECONDS ))
}

target_deployment_is_inflight() {
  local marker leaf
  for marker in "$ROOT/inflight/pr-${PR_NUMBER}"/*; do
    [[ -f "$marker" ]] || continue
    leaf="$(basename "$marker")"
    [[ "$leaf" =~ ^[0-9]+-[0-9]+$ ]] || continue
    inflight_marker_is_fresh "$marker" && return 0
  done
  return 1
}

access_epoch() {
  local pr="$1"
  local access_file="$ACCESS_DIR/pr-${pr}"
  local value=""
  if [[ -f "$access_file" ]]; then
    IFS= read -r value < "$access_file" || true
    if is_nonnegative_integer "$value"; then
      printf '%s\n' "$value"
      return 0
    fi
  fi
  marker_mtime "$ROOT/previews/pr-${pr}"
}

record_access() {
  local pr="$1"
  local temporary recorded_epoch
  recorded_epoch="$(current_epoch)"
  is_nonnegative_integer "$recorded_epoch" || return 1
  mkdir -p "$ACCESS_DIR"
  temporary="$ACCESS_DIR/pr-${pr}.$$.tmp"
  printf '%s\n' "$recorded_epoch" > "$temporary"
  mv -f -- "$temporary" "$ACCESS_DIR/pr-${pr}"
}

sleep_lru_candidate() {
  local candidate oldest_pr="" oldest_epoch="" epoch
  while IFS= read -r candidate; do
    [[ -n "$candidate" && "$candidate" != "$PR_NUMBER" ]] || continue
    [[ -f "$ROOT/previews/pr-${candidate}/docker-compose.yml" ]] || continue
    [[ -f "$ROOT/previews/pr-${candidate}/keep-awake" ]] && continue
    epoch="$(access_epoch "$candidate")"
    is_nonnegative_integer "$epoch" || epoch=0
    if (( epoch > NOW_EPOCH || NOW_EPOCH - epoch < WAKE_LEASE_SECONDS )); then
      continue
    fi
    if [[ -z "$oldest_pr" ]] || (( epoch < oldest_epoch )); then
      oldest_pr="$candidate"
      oldest_epoch="$epoch"
    fi
  done < <(running_env_numbers)

  [[ -n "$oldest_pr" ]] || {
    echo "Preview running capacity is full and every candidate is pinned" >&2
    return 1
  }

  slept="$oldest_pr"
  local candidate_dir="$ROOT/previews/pr-${slept}"
  if ! "$DOCKER" compose -p "yawp-pr-${slept}" \
    -f "$candidate_dir/docker-compose.yml" stop >&2; then
    echo "Preview running capacity stop failed" >&2
    return 1
  fi
  is_running "$slept" && {
    echo "Preview running capacity could not be reclaimed" >&2
    return 1
  }
  return 0
}

wait_for_project_health() {
  local pr="$1"
  local project_dir="$ROOT/previews/pr-${pr}"
  local project_file="$project_dir/docker-compose.yml"
  local container_id status attempt
  [[ -f "$project_file" ]] || return 1
  container_id="$($DOCKER compose -p "yawp-pr-${pr}" -f "$project_file" ps -q web)"
  [[ -n "$container_id" ]] || return 1
  for (( attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++ )); do
    status="$($DOCKER inspect --format '{{.State.Health.Status}}' "$container_id" 2>/dev/null || true)"
    [[ "$status" == "healthy" ]] && return 0
    if [[ -z "$status" ]]; then
      local container_ip
      container_ip="$($DOCKER inspect \
        --format '{{with index .NetworkSettings.Networks "preview"}}{{.IPAddress}}{{end}}' \
        "$container_id" 2>/dev/null || true)"
      if [[ "$container_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] && \
        "$CURL" --fail --silent --show-error --max-time 2 \
          "http://${container_ip}:${LEGACY_HEALTH_PORT}/api/healthcheck" >/dev/null; then
        return 0
      fi
    fi
    (( attempt < HEALTH_ATTEMPTS )) && sleep "$HEALTH_INTERVAL_SECONDS"
  done
  return 1
}

restore_displaced() {
  [[ -n "$slept" ]] || return 0
  local displaced_dir="$ROOT/previews/pr-${slept}"
  local displaced_file="$displaced_dir/docker-compose.yml"
  [[ -f "$displaced_file" ]] || return 1
  "$DOCKER" compose -p "yawp-pr-${slept}" -f "$displaced_file" start >&2 || return 1
  wait_for_project_health "$slept"
}

ensure_target_stopped() {
  is_running "$PR_NUMBER" || return 0
  if ! "$DOCKER" compose -p "$project" -f "$compose_file" stop >/dev/null 2>&1; then
    is_running "$PR_NUMBER" && return 1
  fi
  ! is_running "$PR_NUMBER"
}

fail_wake() {
  local message="$1"
  local code="$2"
  echo "$message" >&2
  exit "$code"
}

wake_committed=false
displacement_started=false
wake_started=false
handle_exit() {
  local code="$1"
  trap - EXIT TERM INT
  if (( code == 0 )) || [[ "$wake_committed" == "true" ]]; then
    return 0
  fi
  if [[ "$wake_started" == "true" ]]; then
    if ensure_target_stopped; then
      restore_displaced || echo "Interrupted wake could not restore displaced pr-${slept}" >&2
    else
      echo "Interrupted wake could not stop pr-${PR_NUMBER}; refusing to restore another preview above the running cap" >&2
    fi
  elif [[ "$displacement_started" == "true" ]]; then
    restore_displaced || echo "Interrupted displacement could not restore pr-${slept}" >&2
  fi
}
handle_signal() {
  local signal="$1"
  trap - TERM INT
  echo "Preview pr-${PR_NUMBER} wake interrupted by ${signal}" >&2
  exit 10
}
trap 'handle_exit $?' EXIT
trap 'handle_signal TERM' TERM
trap 'handle_signal INT' INT

# Source synchronization intentionally happens before the deploy job takes this
# host lock. Its marker is published under the lock first, so a wake that acquires
# the lock during rsync must fail closed instead of starting from a partial tree.
if target_deployment_is_inflight; then
  echo "Preview pr-${PR_NUMBER} deployment is in progress" >&2
  exit 11
fi

if is_running "$PR_NUMBER"; then
  wait_for_project_health "$PR_NUMBER" || {
    echo "Preview pr-${PR_NUMBER} is running but did not become healthy" >&2
    exit 8
  }
  require_current_authorization || {
    echo "Preview authorization was revoked while queued" >&2
    exit 12
  }
  record_access "$PR_NUMBER"
  echo "WAKE_RESULT=already-running"
  echo "WAKE_SLEPT="
  exit 0
fi

running_count="$(running_env_numbers | wc -l | tr -d ' ')"
is_nonnegative_integer "$running_count" || running_count=0
slept=""
require_current_authorization || {
  echo "Preview authorization was revoked while queued" >&2
  exit 12
}
if (( running_count > RUNNING_CAP )); then
  echo "Preview host is already above running capacity" >&2
  exit 6
fi
if (( running_count == RUNNING_CAP )); then
  if [[ "$SLEEP_ENABLED" != "true" || "$ALLOW_DISPLACEMENT" != "true" ]]; then
    echo "Preview running capacity is full and displacement is disabled" >&2
    exit 6
  fi
  displacement_started=true
  sleep_lru_candidate || exit 6
fi

wake_started=true
if ! "$DOCKER" compose -p "$project" -f "$compose_file" start; then
  fail_wake "Preview pr-${PR_NUMBER} could not start" 7
fi
if ! wait_for_project_health "$PR_NUMBER"; then
  fail_wake "Preview pr-${PR_NUMBER} did not become healthy" 8
fi
require_current_authorization || fail_wake "Preview authorization was revoked while queued" 12
if ! record_access "$PR_NUMBER"; then
  fail_wake "Preview pr-${PR_NUMBER} could not record its wake lease" 9
fi
wake_committed=true

echo "WAKE_RESULT=woken"
echo "WAKE_SLEPT=${slept}"
