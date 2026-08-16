#!/usr/bin/env bash
# Reconcile preview residency and running capacity on the shared host.
#
# Resident previews keep source, database, access code, and volumes on disk. Running
# previews have a live web container. Sleeping stops every PR-scoped service without
# removing containers or volumes, so the next deploy wakes the same environment without
# deleting preview-local state.
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
export PREVIEW_ROOT="$ROOT"
MODE="${PREVIEW_MODE:-admit}"
RESIDENT_CAP="${PREVIEW_MAX_RESIDENT:-${PREVIEW_MAX_ENVS:-30}}"
RUNNING_CAP="${PREVIEW_MAX_RUNNING:-$RESIDENT_CAP}"
KEEP_PR="${KEEP_PR:-}"
OPEN_PR_NUMBERS="${OPEN_PR_NUMBERS:-}"
PR_ACTIVITY="${PR_ACTIVITY:-}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
SLEEP_ENABLED="${PREVIEW_SLEEP_ENABLED:-true}"
DRAFT_IDLE_HOURS="${PREVIEW_DRAFT_IDLE_HOURS:-48}"
READY_IDLE_HOURS="${PREVIEW_READY_IDLE_HOURS:-48}"
NOW_EPOCH="${PREVIEW_NOW_EPOCH:-$(date +%s)}"
DOCKER="${PREVIEW_DOCKER:-docker}"
LOCK_WAIT_SECONDS="${PREVIEW_LOCK_WAIT_SECONDS:-900}"
INFLIGHT_TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"
GITHUB_REPOSITORY="${PREVIEW_GITHUB_REPOSITORY:-}"
GITHUB_TOKEN="${PREVIEW_GITHUB_TOKEN:-}"
GITHUB_API_URL="${PREVIEW_GITHUB_API_URL:-https://api.github.com}"
CURL="${PREVIEW_CURL:-curl}"
JQ="${PREVIEW_JQ:-jq}"

previews_dir="$ROOT/previews"
ACCESS_DIR="${PREVIEW_ACCESS_DIR:-$ROOT/wake/access}"

if ! declare -F preview_remove_path >/dev/null 2>&1; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=remove-preview-path.sh
  source "$SCRIPT_DIR/remove-preview-path.sh"
fi

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

is_nonnegative_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

case "$MODE" in
  admit|reconcile) ;;
  *) echo "PREVIEW_MODE must be admit or reconcile" >&2; exit 1 ;;
esac
for value in "$RESIDENT_CAP" "$RUNNING_CAP"; do
  is_positive_integer "$value" || { echo "Preview caps must be positive integers" >&2; exit 1; }
done
for value in "$DRAFT_IDLE_HOURS" "$READY_IDLE_HOURS" "$NOW_EPOCH" "$LOCK_WAIT_SECONDS" "$INFLIGHT_TTL_SECONDS"; do
  is_nonnegative_integer "$value" || { echo "Preview timing values must be nonnegative integers" >&2; exit 1; }
done
case "$SLEEP_ENABLED" in
  true|false) ;;
  *) echo "PREVIEW_SLEEP_ENABLED must be true or false" >&2; exit 1 ;;
esac
if [[ "$MODE" == "reconcile" ]]; then
  KEEP_PR=""
elif [[ -n "$KEEP_PR" ]] && ! is_positive_integer "$KEEP_PR"; then
  echo "KEEP_PR must be a positive integer" >&2
  exit 1
fi

acquire_host_lock() {
  [[ "${PREVIEW_LOCK_HELD:-false}" == "true" ]] && return 0
  command -v flock >/dev/null 2>&1 || return 0
  mkdir -p "$ROOT"
  exec 9>"$ROOT/preview-host.lock"
  flock -w "$LOCK_WAIT_SECONDS" 9
}

refresh_pr_state() {
  if [[ -z "$GITHUB_REPOSITORY" && -z "$GITHUB_TOKEN" ]]; then
    return 0
  fi
  if [[ -z "$GITHUB_REPOSITORY" || -z "$GITHUB_TOKEN" ]]; then
    echo "PREVIEW_GITHUB_REPOSITORY and PREVIEW_GITHUB_TOKEN must be set together" >&2
    return 1
  fi
  [[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
    echo "PREVIEW_GITHUB_REPOSITORY must be owner/repository" >&2
    return 1
  }

  local page=1 response count page_numbers page_activity
  OPEN_PR_NUMBERS=""
  PR_ACTIVITY=""
  while (( page <= 10 )); do
    response="$(
      "$CURL" --fail --silent --show-error --location \
        --connect-timeout 5 --max-time 20 --retry 2 --retry-delay 1 --retry-all-errors \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "${GITHUB_API_URL%/}/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100&page=${page}"
    )"
    "$JQ" -e 'type == "array"' >/dev/null <<<"$response"
    count="$("$JQ" -r 'length' <<<"$response")"
    is_nonnegative_integer "$count" || {
      echo "GitHub returned an invalid pull request count" >&2
      return 1
    }
    page_numbers="$("$JQ" -r '[.[].number] | join(" ")' <<<"$response")"
    page_activity="$(
      "$JQ" -r '.[] | "\(.number) \(.updated_at | fromdateiso8601) \(if .draft then 1 else 0 end) \(if any(.labels[]?; .name == "preview:keep-awake") then 1 else 0 end)"' \
        <<<"$response"
    )"
    if [[ -n "$page_numbers" ]]; then
      OPEN_PR_NUMBERS="${OPEN_PR_NUMBERS:+${OPEN_PR_NUMBERS} }${page_numbers}"
    fi
    if [[ -n "$page_activity" ]]; then
      PR_ACTIVITY="${PR_ACTIVITY:+${PR_ACTIVITY}$'\n'}${page_activity}"
    fi
    (( count < 100 )) && break
    page=$((page + 1))
  done
  if (( page > 10 )); then
    echo "More than 1,000 open pull requests; refusing to reconcile from a partial snapshot" >&2
    return 1
  fi
}

marker_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"
}

inflight_marker_is_fresh() {
  local marker="$1"
  local modified
  modified="$(marker_mtime "$marker")" || return 1
  is_nonnegative_integer "$modified" || return 1
  (( modified > NOW_EPOCH || NOW_EPOCH - modified < INFLIGHT_TTL_SECONDS ))
}

is_inflight() {
  local pr="$1"
  local marker leaf
  for marker in "$ROOT/inflight/pr-${pr}"/*; do
    [[ -f "$marker" ]] || continue
    leaf="$(basename "$marker")"
    [[ "$leaf" =~ ^[0-9]+-[0-9]+$ ]] || continue
    inflight_marker_is_fresh "$marker" && return 0
  done
  return 1
}

prune_stale_inflight_markers() {
  local pr_dir marker leaf
  [[ -d "$ROOT/inflight" ]] || return 0
  for pr_dir in "$ROOT"/inflight/pr-*; do
    [[ -d "$pr_dir" ]] || continue
    [[ "$(basename "$pr_dir")" =~ ^pr-[1-9][0-9]*$ ]] || continue
    for marker in "$pr_dir"/*; do
      [[ -f "$marker" ]] || continue
      leaf="$(basename "$marker")"
      [[ "$leaf" =~ ^[0-9]+-[0-9]+$ ]] || continue
      inflight_marker_is_fresh "$marker" || rm -f -- "$marker"
    done
    rmdir "$pr_dir" 2>/dev/null || true
  done
}

resident_env_numbers() {
  local parent path slug pr
  for parent in "$previews_dir" "$ROOT/sources"; do
    [[ -d "$parent" ]] || continue
    for path in "$parent"/pr-*; do
      [[ -d "$path" ]] || continue
      slug="$(basename "$path")"
      pr="${slug#pr-}"
      is_positive_integer "$pr" || continue
      printf '%s\n' "$pr"
    done
  done | sort -un
}

is_resident() {
  local pr="$1"
  [[ -d "$previews_dir/pr-${pr}" || -d "$ROOT/sources/pr-${pr}" ]]
}

is_open_pr() {
  [[ " ${OPEN_PR_NUMBERS} " == *" ${1} "* ]]
}

activity_record() {
  local target="$1"
  printf '%s\n' "$PR_ACTIVITY" | awk -v target="$target" '
    $1 == target && NF >= 3 {
      pinned = (NF >= 4 && $4 == "1") ? 1 : 0
      print $1, $2, $3, pinned
      exit
    }'
}

access_epoch() {
  local pr="$1"
  local value=""
  local access_file="$ACCESS_DIR/pr-${pr}"
  [[ -f "$access_file" ]] || { echo 0; return 0; }
  IFS= read -r value < "$access_file" || true
  is_nonnegative_integer "$value" && printf '%s\n' "$value" || echo 0
}

effective_activity_epoch() {
  local pr="$1"
  local github_epoch="$2"
  local url_epoch
  url_epoch="$(access_epoch "$pr")"
  if is_nonnegative_integer "$url_epoch" && (( url_epoch > github_epoch )); then
    printf '%s\n' "$url_epoch"
  else
    printf '%s\n' "$github_epoch"
  fi
}

sync_keep_awake_markers() {
  local pr record pinned marker
  while IFS= read -r pr; do
    [[ -d "$previews_dir/pr-${pr}" ]] || continue
    record="$(activity_record "$pr")"
    [[ -n "$record" ]] || continue
    read -r _ _ _ pinned <<<"$record"
    marker="$previews_dir/pr-${pr}/keep-awake"
    if [[ "$pinned" == "1" ]]; then
      printf 'true\n' > "$marker"
    else
      rm -f -- "$marker"
    fi
  done < <(resident_env_numbers)
}

is_running() {
  local pr="$1"
  "$DOCKER" ps \
    --filter "label=com.docker.compose.project=yawp-pr-${pr}" \
    --filter "label=com.docker.compose.service=web" \
    --filter status=running -q 2>/dev/null | grep -q .
}

running_env_numbers() {
  local pr
  while IFS= read -r pr; do
    [[ -n "$pr" ]] || continue
    is_running "$pr" && printf '%s\n' "$pr"
  done < <(resident_env_numbers)
  return 0
}

destroy_env() {
  local pr="$1"
  is_positive_integer "$pr" || {
    echo "::error::refusing to destroy malformed env id '${pr}'"
    return 1
  }

  local path="$previews_dir/pr-${pr}"
  local project="yawp-pr-${pr}"
  local compose_file="$path/docker-compose.yml"

  if [[ -f "$compose_file" ]]; then
    "$DOCKER" compose -p "$project" -f "$compose_file" down -v --remove-orphans || true
  else
    "$DOCKER" compose -p "$project" down -v --remove-orphans || true
  fi
  if "$DOCKER" inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    "$DOCKER" exec "$POSTGRES_CONTAINER" dropdb -U postgres --if-exists "yawp_pr_${pr}" || true
  fi
  "$DOCKER" volume rm "${project}_${project}-postgres-data" >/dev/null 2>&1 || true

  if ! preview_remove_path "$path"; then
    echo "::error::could not remove ${path}; it still counts against the resident cap"
    return 1
  fi
  if ! preview_remove_path "$ROOT/sources/pr-${pr}"; then
    echo "::warning::left ${ROOT}/sources/pr-${pr} on disk; environment is gone but source leaked"
  fi
  rm -f -- "$ACCESS_DIR/pr-${pr}"
}

stop_env() {
  local pr="$1"
  local path="$previews_dir/pr-${pr}"
  local compose_file="$path/docker-compose.yml"
  local project="yawp-pr-${pr}"

  [[ -f "$compose_file" ]] || {
    echo "::error::cannot sleep pr-${pr}; compose file missing"
    return 1
  }
  if ! "$DOCKER" compose -p "$project" -f "$compose_file" stop; then
    echo "::error::failed to stop pr-${pr} services"
    return 1
  fi
  if is_running "$pr"; then
    echo "::error::pr-${pr} web container still running after stop"
    return 1
  fi
}

rank_candidates() {
  local scope="$1"
  local keep="$2"
  local candidates=""
  local pr
  if [[ "$scope" == "running" ]]; then
    while IFS= read -r pr; do
      [[ -n "$pr" ]] || continue
      is_inflight "$pr" || candidates="${candidates:+${candidates} }${pr}"
    done < <(running_env_numbers)
  else
    while IFS= read -r pr; do
      [[ -n "$pr" ]] || continue
      is_inflight "$pr" || candidates="${candidates:+${candidates} }${pr}"
    done < <(resident_env_numbers)
  fi

  local updated draft pinned effective
  while read -r pr updated draft pinned; do
    [[ -n "$pr" ]] || continue
    pinned="${pinned:-0}"
    [[ "$pr" != "$keep" && "$pinned" != "1" ]] || continue
    [[ " $candidates " == *" $pr "* ]] || continue
    is_nonnegative_integer "$updated" || continue
    effective="$(effective_activity_epoch "$pr" "$updated")"
    printf '%d %d %s\n' "$([[ "$draft" == "1" ]] && echo 0 || echo 1)" "$effective" "$pr"
  done <<<"$PR_ACTIVITY" | sort -k1,1n -k2,2n | awk '{print $3}'
}

append_number() {
  local current="$1"
  local number="$2"
  [[ " $current " == *" $number "* ]] && printf '%s' "$current" || printf '%s' "${current:+$current }$number"
}

incoming_resident_slots() {
  if [[ "$MODE" == "admit" && -n "$KEEP_PR" ]] && ! is_resident "$KEEP_PR"; then
    echo 1
  else
    echo 0
  fi
}

incoming_running_slots() {
  if [[ "$MODE" == "admit" && -n "$KEEP_PR" ]] && ! is_running "$KEEP_PR"; then
    echo 1
  else
    echo 0
  fi
}

acquire_host_lock
prune_stale_inflight_markers
refresh_pr_state
sync_keep_awake_markers

reclaimed=0
evicted=""
slept=""

# Closed or merged PRs never retain host resources.
while IFS= read -r pr; do
  [[ -n "$pr" ]] || continue
  if is_inflight "$pr"; then
    echo "keep pr-${pr}: deployment is in flight"
    continue
  fi
  if ! is_open_pr "$pr"; then
    echo "reclaim pr-${pr}: pull request is closed or merged"
    if destroy_env "$pr"; then
      reclaimed=$((reclaimed + 1))
    fi
  fi
done < <(resident_env_numbers)

# Idle leases stop every PR-scoped service. State stays resident and any new deploy wakes it.
if [[ "$SLEEP_ENABLED" == "true" ]]; then
  while IFS= read -r pr; do
    [[ -n "$pr" ]] || continue
    is_inflight "$pr" && continue
    record="$(activity_record "$pr")"
    [[ -n "$record" ]] || continue
    read -r _ updated draft pinned <<<"$record"
    is_nonnegative_integer "$updated" || continue
    updated="$(effective_activity_epoch "$pr" "$updated")"
    [[ "$pinned" == "1" ]] && continue
    idle_hours="$READY_IDLE_HOURS"
    [[ "$draft" == "1" ]] && idle_hours="$DRAFT_IDLE_HOURS"
    if (( NOW_EPOCH - updated >= idle_hours * 3600 )); then
      echo "sleep pr-${pr}: idle lease expired"
      if stop_env "$pr"; then
        slept="$(append_number "$slept" "$pr")"
      fi
    fi
  done < <(rank_candidates running "$KEEP_PR")
fi

# Resident pressure deletes derived environments, drafts then oldest activity.
resident_count="$(resident_env_numbers | wc -l | tr -d ' ')"
resident_needed=$((resident_count + $(incoming_resident_slots)))
if (( resident_needed > RESIDENT_CAP )); then
  while IFS= read -r pr; do
    [[ -n "$pr" ]] || continue
    (( resident_needed > RESIDENT_CAP )) || break
    is_inflight "$pr" && continue
    echo "evict pr-${pr}: resident cap ${RESIDENT_CAP}, least active candidate"
    if destroy_env "$pr"; then
      evicted="$(append_number "$evicted" "$pr")"
      resident_needed=$((resident_needed - 1))
    fi
  done < <(rank_candidates resident "$KEEP_PR")
fi

# Running pressure sleeps; it never destroys state.
running_count="$(running_env_numbers | wc -l | tr -d ' ')"
running_needed=$((running_count + $(incoming_running_slots)))
if (( running_needed > RUNNING_CAP )); then
  while IFS= read -r pr; do
    [[ -n "$pr" ]] || continue
    (( running_needed > RUNNING_CAP )) || break
    is_inflight "$pr" && continue
    echo "sleep pr-${pr}: running cap ${RUNNING_CAP}, least active candidate"
    if stop_env "$pr"; then
      slept="$(append_number "$slept" "$pr")"
      running_needed=$((running_needed - 1))
    fi
  done < <(rank_candidates running "$KEEP_PR")
fi

# Recount truth after every operation. Failed deletes/stops never free phantom capacity.
resident_count="$(resident_env_numbers | wc -l | tr -d ' ')"
running_count="$(running_env_numbers | wc -l | tr -d ' ')"
resident_needed=$((resident_count + $(incoming_resident_slots)))
running_needed=$((running_count + $(incoming_running_slots)))
result="ok"
reason=""
if (( resident_needed > RESIDENT_CAP )); then
  result="full"
  reason="resident-cap"
elif (( running_needed > RUNNING_CAP )); then
  result="full"
  reason="running-cap"
fi

echo "CAP_RECLAIMED=${reclaimed}"
echo "CAP_EVICTED=${evicted}"
echo "CAP_SLEPT=${slept}"
echo "CAP_RESIDENT=${resident_count}"
echo "CAP_RUNNING=${running_count}"
echo "CAP_MAX_RESIDENT=${RESIDENT_CAP}"
echo "CAP_MAX_RUNNING=${RUNNING_CAP}"
echo "CAP_LIVE=${resident_count}"
echo "CAP_MAX=${RESIDENT_CAP}"
echo "CAP_RESULT=${result}"
echo "CAP_REASON=${reason}"
echo "CAP_MODE=${MODE}"
