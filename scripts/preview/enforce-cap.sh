#!/usr/bin/env bash
# Keep the number of live preview environments at or under a hard cap.
#
# Runs ON THE PREVIEW HOST, before a deploy. The host is a fixed-size box; without a
# ceiling, one more PR is always "just one more" until the box runs out of memory and
# wedges — which is exactly what happened on 2026-07-28, taking every preview down and
# with it a client demo.
#
# Order of reclamation, cheapest and least surprising first:
#   1. Environments whose PR is closed or merged. Nobody wants these.
#   2. If still at the cap, the least active environment: drafts before ready-for-review,
#      then oldest PR activity. The incoming PR is never evicted.
#
# Eviction removes the ENVIRONMENT, never the pull request. A PR is shared state and
# other people's work; a preview is a derived artifact that any push rebuilds. Evicted
# PRs get a comment from the workflow saying how to get theirs back.
#
# Required env:
#   OPEN_PR_NUMBERS  space-separated PR numbers currently open
#   PR_ACTIVITY      one "<number> <epoch-seconds> <draft:0|1>" per line, for ranking
# Optional env:
#   PREVIEW_ROOT      default /srv/yawp-preview
#   PREVIEW_MAX_ENVS  default 30
#   KEEP_PR           PR number being deployed; never evicted
#
# Prints machine-readable results for the workflow:
#   CAP_RECLAIMED=<n>  CAP_EVICTED=<numbers>  CAP_LIVE=<n>  CAP_RESULT=ok|full
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
export PREVIEW_ROOT="$ROOT"
CAP="${PREVIEW_MAX_ENVS:-30}"
KEEP_PR="${KEEP_PR:-}"
OPEN_PR_NUMBERS="${OPEN_PR_NUMBERS:-}"
PR_ACTIVITY="${PR_ACTIVITY:-}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"

previews_dir="$ROOT/previews"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=remove-preview-path.sh
source "$SCRIPT_DIR/remove-preview-path.sh"

live_env_numbers() {
  [[ -d "$previews_dir" ]] || return 0
  for path in "$previews_dir"/pr-*; do
    [[ -d "$path" ]] || continue
    local slug pr
    slug="$(basename "$path")"
    pr="${slug#pr-}"
    [[ "$pr" =~ ^[1-9][0-9]*$ ]] || continue
    printf '%s\n' "$pr"
  done
}

is_open_pr() {
  [[ " ${OPEN_PR_NUMBERS} " == *" ${1} "* ]]
}

# Same teardown cleanup.sh performs, using the shared safe-removal helper.
destroy_env() {
  local pr="$1"
  # This function removes trees as root. Callers pass validated numbers, but the guard
  # stays local to the dangerous operation rather than relying on every call site.
  [[ "$pr" =~ ^[1-9][0-9]*$ ]] || { echo "::error::refusing to destroy malformed env id '${pr}'"; return 1; }
  local path="$previews_dir/pr-${pr}"
  local project="yawp-pr-${pr}"
  local compose_file="$path/docker-compose.yml"

  if [[ -f "$compose_file" ]]; then
    docker compose -p "$project" -f "$compose_file" down -v --remove-orphans || true
  else
    docker compose -p "$project" down -v --remove-orphans || true
  fi
  if docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --if-exists "yawp_pr_${pr}" || true
  fi
  docker volume rm "${project}_${project}-postgres-data" >/dev/null 2>&1 || true

  # The two paths fail differently and must not be collapsed. live_env_numbers() counts
  # directories under previews/, so a surviving previews/pr-N means this env is still
  # counted against the cap: reporting it reclaimed would make the cap silently
  # unenforceable, which is the failure this whole script exists to prevent. A surviving
  # sources/pr-N only leaks disk, so it warns and lets the deploy proceed.
  if ! preview_remove_path "$path"; then
    echo "::error::could not remove ${path}; it still counts against the cap"
    return 1
  fi
  if ! preview_remove_path "$ROOT/sources/pr-${pr}"; then
    echo "::warning::left ${ROOT}/sources/pr-${pr} on disk; environment is gone but the source tree leaked"
  fi
}

# --- 1. reclaim environments whose PR is no longer open -----------------------------
# A single stuck environment must not abort the pass: the others are still reclaimable,
# and the cap math below recounts the filesystem rather than trusting this counter, so a
# failure here simply leaves that environment in the live set and lets eviction — or the
# final `full` result — deal with it honestly.
reclaimed=0
for pr in $(live_env_numbers); do
  if ! is_open_pr "$pr"; then
    echo "reclaim pr-${pr}: pull request is closed or merged"
    if destroy_env "$pr"; then
      reclaimed=$((reclaimed + 1))
    fi
  fi
done

# --- 2. evict the least active until the incoming deploy fits ------------------------
# Rank: drafts before ready-for-review, then oldest activity first. A draft nobody has
# touched in weeks is the cheapest thing on the box to take away.
rank_candidates() {
  local keep="$1"
  local live_list
  live_list="$(live_env_numbers | tr '\n' ' ')"
  printf '%s\n' "$PR_ACTIVITY" | awk -v keep="$keep" -v live=" $live_list " '
    NF >= 3 {
      pr = $1; updated = $2; draft = $3
      if (pr == keep) next
      if (index(live, " " pr " ") == 0) next
      # drafts sort first (0), then oldest activity first
      printf "%d %d %s\n", (draft == "1" ? 0 : 1), updated, pr
    }' | sort -k1,1n -k2,2n | awk '{print $3}'
}

evicted=""
live_count="$(live_env_numbers | wc -l | tr -d ' ')"
incoming_present=0
if [[ -n "$KEEP_PR" ]] && [[ -d "$previews_dir/pr-${KEEP_PR}" ]]; then
  incoming_present=1
fi
# A redeploy of an environment that already exists does not consume a new slot.
needed=$((live_count + (incoming_present == 1 ? 0 : 1)))

if [[ "$needed" -gt "$CAP" ]]; then
  for pr in $(rank_candidates "$KEEP_PR"); do
    [[ "$needed" -gt "$CAP" ]] || break
    echo "evict pr-${pr}: at the cap of ${CAP} environments, least active candidate"
    # Only a removal that actually happened frees a slot. Decrementing on a failed evict
    # would let the deploy proceed over the cap — the memory exhaustion this guards
    # against — and would comment "your preview was reclaimed" on a PR still holding one.
    if destroy_env "$pr"; then
      evicted="${evicted} ${pr}"
      needed=$((needed - 1))
    fi
  done
fi

live_count="$(live_env_numbers | wc -l | tr -d ' ')"
result="ok"
[[ "$needed" -gt "$CAP" ]] && result="full"

echo "CAP_RECLAIMED=${reclaimed}"
echo "CAP_EVICTED=$(printf '%s' "${evicted# }")"
echo "CAP_LIVE=${live_count}"
echo "CAP_MAX=${CAP}"
echo "CAP_RESULT=${result}"
