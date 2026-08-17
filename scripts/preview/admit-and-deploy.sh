#!/usr/bin/env bash
# Hold one host lock across capacity admission and deployment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
LOCK_WAIT_SECONDS="${PREVIEW_LOCK_WAIT_SECONDS:-900}"
ENFORCE_SCRIPT="${PREVIEW_ENFORCE_CAP_SCRIPT:-$SCRIPT_DIR/enforce-cap.sh}"
DEPLOY_SCRIPT="${PREVIEW_DEPLOY_SCRIPT:-$SCRIPT_DIR/deploy.sh}"
INFLIGHT_MARKER="${PREVIEW_INFLIGHT_MARKER:-}"
QUARANTINE_MARKER="${PREVIEW_QUARANTINE_MARKER:-}"

cleanup_inflight_marker() {
  [[ -n "$INFLIGHT_MARKER" ]] || return 0
  local root_abs parent_abs leaf pr="${PR_NUMBER:-}"
  [[ "$pr" =~ ^[1-9][0-9]*$ ]] || {
    echo "Refusing to remove in-flight marker without a valid PR_NUMBER" >&2
    return 0
  }
  root_abs="$(cd "$ROOT" 2>/dev/null && pwd -P)" || return 0
  parent_abs="$(cd "$(dirname "$INFLIGHT_MARKER")" 2>/dev/null && pwd -P)" || return 0
  leaf="$(basename "$INFLIGHT_MARKER")"
  if [[ "$parent_abs" != "$root_abs/inflight/pr-${pr}" || ! "$leaf" =~ ^[0-9]+-[0-9]+$ ]]; then
    echo "Refusing to remove unsafe in-flight marker: $INFLIGHT_MARKER" >&2
    return 0
  fi
  rm -f -- "$INFLIGHT_MARKER"
  rmdir "$parent_abs" 2>/dev/null || true
}

cleanup_quarantine_marker() {
  [[ -n "$QUARANTINE_MARKER" ]] || return 0
  local root_abs parent_abs leaf pr="${PR_NUMBER:-}"
  [[ "$pr" =~ ^[1-9][0-9]*$ ]] || return 0
  root_abs="$(cd "$ROOT" 2>/dev/null && pwd -P)" || return 0
  parent_abs="$(cd "$(dirname "$QUARANTINE_MARKER")" 2>/dev/null && pwd -P)" || return 0
  leaf="$(basename "$QUARANTINE_MARKER")"
  if [[ "$parent_abs" != "$root_abs/quarantine" || "$leaf" != "pr-${pr}" ]]; then
    echo "Refusing to remove unsafe quarantine marker: $QUARANTINE_MARKER" >&2
    return 0
  fi
  rm -f -- "$QUARANTINE_MARKER"
}

cleanup_deploy_state() {
  local status="$1"
  trap - EXIT
  cleanup_inflight_marker
  if (( status == 0 )); then
    cleanup_quarantine_marker
  fi
  exit "$status"
}

trap 'cleanup_deploy_state $?' EXIT

mkdir -p "$ROOT"
exec 9>"$ROOT/preview-host.lock"
if [[ -z "${PREVIEW_FLOCK:-}" ]]; then
  flock -w "$LOCK_WAIT_SECONDS" 9
elif [[ "$PREVIEW_FLOCK" != "false" ]]; then
  "$PREVIEW_FLOCK" -w "$LOCK_WAIT_SECONDS" 9
fi

capacity_output="$(
  PREVIEW_LOCK_HELD=true PREVIEW_MODE=admit bash "$ENFORCE_SCRIPT"
)"
printf '%s\n' "$capacity_output"

capacity_result="$(
  printf '%s\n' "$capacity_output" \
    | awk -F= '/^CAP_RESULT=/{print $2}' \
    | tail -1
)"
if [[ "$capacity_result" != "ok" ]]; then
  exit 75
fi

PREVIEW_LOCK_HELD=true bash "$DEPLOY_SCRIPT"
