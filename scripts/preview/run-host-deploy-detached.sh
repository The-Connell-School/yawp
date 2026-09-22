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
EXIT_FILE="${DEPLOY_LOG}.exit"
LOG_DIR="$(dirname "$DEPLOY_LOG")"

shell_quote() { printf '%q' "$1"; }

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
  echo "Deploy timed out after ${DEPLOY_TIMEOUT_SECONDS}s; log tail:" >&2
  ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" \
    "tail -50 $(shell_quote "$DEPLOY_LOG") 2>/dev/null || true" >&2
  exit 1
fi

scp -i "$SSH_IDENTITY" -q "${SSH_TARGET}:${DEPLOY_LOG}" /tmp/demo-deploy.log
exit_code="$(
  ssh -i "$SSH_IDENTITY" -o BatchMode=yes "$SSH_TARGET" \
    "tr -d '[:space:]' < $(shell_quote "$EXIT_FILE")"
)"
[[ "$exit_code" =~ ^[0-9]+$ ]] || exit_code=1
exit "$exit_code"
