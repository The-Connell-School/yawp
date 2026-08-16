#!/usr/bin/env bash
# Wake one resident preview without rebuilding it. This intentionally uses
# docker compose start so containers, volumes, database, and access state survive sleep.
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
DOCKER="${PREVIEW_DOCKER:-docker}"
RUNNING_CAP="${PREVIEW_MAX_RUNNING:-8}"
LOCK_WAIT_SECONDS="${PREVIEW_LOCK_WAIT_SECONDS:-900}"
HEALTH_ATTEMPTS="${PREVIEW_WAKE_HEALTH_ATTEMPTS:-60}"
HEALTH_INTERVAL_SECONDS="${PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS:-1}"
ACCESS_DIR="${PREVIEW_ACCESS_DIR:-$ROOT/wake/access}"
NOW_EPOCH="${PREVIEW_NOW_EPOCH:-$(date +%s)}"
WAKE_LEASE_SECONDS="${PREVIEW_WAKE_LEASE_SECONDS:-120}"
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
is_nonnegative_integer "$LOCK_WAIT_SECONDS" || {
  echo "PREVIEW_LOCK_WAIT_SECONDS must be a nonnegative integer" >&2
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
is_nonnegative_integer "$NOW_EPOCH" || {
  echo "PREVIEW_NOW_EPOCH must be a nonnegative integer" >&2
  exit 2
}
is_nonnegative_integer "$WAKE_LEASE_SECONDS" || {
  echo "PREVIEW_WAKE_LEASE_SECONDS must be a nonnegative integer" >&2
  exit 2
}

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
  local temporary
  mkdir -p "$ACCESS_DIR"
  temporary="$ACCESS_DIR/pr-${pr}.$$.tmp"
  printf '%s\n' "$NOW_EPOCH" > "$temporary"
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

  local candidate_dir="$ROOT/previews/pr-${oldest_pr}"
  "$DOCKER" compose -p "yawp-pr-${oldest_pr}" \
    -f "$candidate_dir/docker-compose.yml" stop >&2
  is_running "$oldest_pr" && {
    echo "Preview running capacity could not be reclaimed" >&2
    return 1
  }
  printf '%s\n' "$oldest_pr"
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

fail_wake() {
  local message="$1"
  local code="$2"
  "$DOCKER" compose -p "$project" -f "$compose_file" stop >/dev/null 2>&1 || true
  if ! restore_displaced; then
    echo "Preview pr-${PR_NUMBER} wake failed and displaced pr-${slept} could not be restored" >&2
  fi
  echo "$message" >&2
  exit "$code"
}

if is_running "$PR_NUMBER"; then
  wait_for_project_health "$PR_NUMBER" || {
    echo "Preview pr-${PR_NUMBER} is running but did not become healthy" >&2
    exit 8
  }
  record_access "$PR_NUMBER"
  echo "WAKE_RESULT=already-running"
  echo "WAKE_SLEPT="
  exit 0
fi

running_count="$(running_env_numbers | wc -l | tr -d ' ')"
is_nonnegative_integer "$running_count" || running_count=0
slept=""
if (( running_count >= RUNNING_CAP )); then
  slept="$(sleep_lru_candidate)" || exit 6
fi

if ! "$DOCKER" compose -p "$project" -f "$compose_file" start; then
  fail_wake "Preview pr-${PR_NUMBER} could not start" 7
fi
if ! wait_for_project_health "$PR_NUMBER"; then
  fail_wake "Preview pr-${PR_NUMBER} did not become healthy" 8
fi
if ! record_access "$PR_NUMBER"; then
  fail_wake "Preview pr-${PR_NUMBER} could not record its wake lease" 9
fi

echo "WAKE_RESULT=woken"
echo "WAKE_SLEPT=${slept}"
