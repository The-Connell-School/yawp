#!/usr/bin/env bash
# Stop idle PR services under the same lock as deploy/wake. Never remove data.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/idle-policy.sh"
ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
DOCKER="${PREVIEW_DOCKER:-docker}"
HOURS="${PREVIEW_IDLE_SLEEP_HOURS:-48}"
NOW="${PREVIEW_NOW_EPOCH:-$(date +%s)}"
TARGET="${TARGET_PR:-}"
[[ "$HOURS" =~ ^[0-9]+$ && "$NOW" =~ ^[0-9]+$ ]] || { echo 'Invalid idle timing' >&2; exit 2; }
[[ -z "$TARGET" || "$TARGET" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid idle target' >&2; exit 2; }
exec 9>"$ROOT/preview-host.lock"
flock -w "${PREVIEW_LOCK_WAIT_SECONDS:-30}" 9
slept=''
for dir in "$ROOT"/previews/pr-*; do
  [[ -f "$dir/docker-compose.yml" ]] || continue
  pr="${dir##*/pr-}"
  [[ "$pr" =~ ^[1-9][0-9]*$ ]] || continue
  [[ -z "$TARGET" || "$TARGET" == "$pr" ]] || continue
  [[ -n "$("$DOCKER" ps --filter "label=com.docker.compose.project=yawp-pr-$pr" --filter label=com.docker.compose.service=web --filter status=running -q)" ]] || continue
  deadline="$(preview_idle_deadline "$dir" "$HOURS")"
  echo "pr-$pr last_human_activity=$(preview_file_epoch "$dir/last-human-activity") last_deploy=$(preview_file_epoch "$dir/last-deploy") sleeps_at=$deadline"
  [[ "${PREVIEW_SLEEP_ENABLED:-true}" == true && "${PREVIEW_IDLE_DRY_RUN:-false}" != true ]] || continue
  (( deadline > 0 && NOW >= deadline )) || continue
  preview_idle_protected "$ROOT" "$pr" "$NOW" "${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}" && continue
  mapfile -t services < <(awk '/^services:/ {in_services=1; next} in_services && /^[^[:space:]]/ {in_services=0} in_services && /^  [a-zA-Z0-9_-]+:/ {sub(/:.*/, "", $1); print $1}' "$dir/docker-compose.yml")
  (( ${#services[@]} > 0 )) || { echo "No services for pr-$pr" >&2; exit 2; }
  "$DOCKER" compose -p "yawp-pr-$pr" -f "$dir/docker-compose.yml" stop "${services[@]}"
  slept="${slept:+$slept }$pr"
done
echo "IDLE_SLEPT=$slept"
