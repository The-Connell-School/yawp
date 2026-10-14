#!/usr/bin/env bash
# Start a long-running host deploy without tying it to one SSH session.
set -euo pipefail

: "${SSH_IDENTITY:?SSH_IDENTITY is required}"
: "${SSH_TARGET:?SSH_TARGET is required}"
: "${LOCK_FILE:?LOCK_FILE is required}"
: "${DEPLOY_LOG:?DEPLOY_LOG is required}"
: "${REMOTE_COMMAND:?REMOTE_COMMAND is required}"

DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-3600}"
POLL_SECONDS="${DEPLOY_POLL_SECONDS:-30}"
FAILURE_LOG_LINES="${FAILURE_LOG_LINES:-120}"
EXIT_FILE="${DEPLOY_LOG}.exit"
LOG_DIR="$(dirname "$DEPLOY_LOG")"
LOCAL_LOG_COPY="/tmp/demo-deploy.log"

shell_quote() { printf '%q' "$1"; }

mask_deploy_log() {
  sed -E \
    -e 's/(PREVIEW_ACCESS_CODE=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_LOGIN_PASSWORD=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_POSTGRES_ADMIN_PASSWORD=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_MANAGEMENT_SERVICE_KEY=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/((DEMO_INTERNAL_API_KEYS|YAWP_INTERNAL_API_KEYS)=).*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_RESEND_API_KEY=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_STRIPE_SECRET_KEY=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_STRIPE_WEBHOOK_SECRET=)[^[:space:]]*/\1[REDACTED]/g'
}

emit_failure_log_tail() {
  local reason="$1"
  echo "${reason}; last ${FAILURE_LOG_LINES} log lines (secrets redacted):" >&2
  if [[ -f "$LOCAL_LOG_COPY" ]]; then
    tail -n "$FAILURE_LOG_LINES" "$LOCAL_LOG_COPY" | mask_deploy_log >&2 || true
  else
    ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" \
      "tail -n ${FAILURE_LOG_LINES} $(shell_quote "$DEPLOY_LOG") 2>/dev/null || true" \
      | mask_deploy_log >&2 || true
  fi
}

ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" bash -s <<REMOTE
set -euo pipefail
mkdir -p $(shell_quote "$LOG_DIR")
rm -f $(shell_quote "$DEPLOY_LOG") $(shell_quote "$EXIT_FILE")
if ! flock -n $(shell_quote "$LOCK_FILE") -c true; then
  echo "Another operation holds $(shell_quote "$LOCK_FILE")" >&2
  exit 1
fi
setsid bash -c "flock -w 1800 $(shell_quote "$LOCK_FILE") bash -lc $(shell_quote "$REMOTE_COMMAND") > $(shell_quote "$DEPLOY_LOG") 2>&1; echo \\\$? > $(shell_quote "$EXIT_FILE")" </dev/null >/dev/null 2>&1 &
REMOTE

deadline=$((SECONDS + DEPLOY_TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  if ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" \
    "test -f $(shell_quote "$EXIT_FILE")"; then
    break
  fi
  sleep "$POLL_SECONDS"
done

if ! ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" \
  "test -f $(shell_quote "$EXIT_FILE")"; then
  emit_failure_log_tail "Deploy timed out after ${DEPLOY_TIMEOUT_SECONDS}s"
  exit 1
fi

scp -i "$SSH_IDENTITY" -q "${SSH_TARGET}:${DEPLOY_LOG}" "$LOCAL_LOG_COPY"
exit_code="$(
  ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" \
    "tr -d '[:space:]' < $(shell_quote "$EXIT_FILE")"
)"
[[ "$exit_code" =~ ^[0-9]+$ ]] || exit_code=1
if [[ "$exit_code" != "0" ]]; then
  emit_failure_log_tail "Deploy failed with exit code ${exit_code}"
fi
exit "$exit_code"
