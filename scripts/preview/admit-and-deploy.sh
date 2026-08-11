#!/usr/bin/env bash
# Hold one host lock across capacity admission and deployment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
LOCK_WAIT_SECONDS="${PREVIEW_LOCK_WAIT_SECONDS:-900}"
ENFORCE_SCRIPT="${PREVIEW_ENFORCE_CAP_SCRIPT:-$SCRIPT_DIR/enforce-cap.sh}"
DEPLOY_SCRIPT="${PREVIEW_DEPLOY_SCRIPT:-$SCRIPT_DIR/deploy.sh}"

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
