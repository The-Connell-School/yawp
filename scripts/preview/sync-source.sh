#!/usr/bin/env bash
set -euo pipefail

SSH_KEY="${PREVIEW_SSH_KEY:?PREVIEW_SSH_KEY is required}"
SSH_TARGET="${PREVIEW_SSH_TARGET:?PREVIEW_SSH_TARGET is required}"
REMOTE_SOURCE="${PREVIEW_REMOTE_SOURCE:?PREVIEW_REMOTE_SOURCE is required}"
INFLIGHT_MARKER="${PREVIEW_INFLIGHT_MARKER:?PREVIEW_INFLIGHT_MARKER is required}"
TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"
HEARTBEAT_MIN_SECONDS="${PREVIEW_HEARTBEAT_MIN_SECONDS:-5}"
HEARTBEAT_MAX_SECONDS="${PREVIEW_HEARTBEAT_MAX_SECONDS:-60}"

for value in "$TTL_SECONDS" "$HEARTBEAT_MIN_SECONDS" "$HEARTBEAT_MAX_SECONDS"; do
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || {
    echo "Preview source heartbeat intervals must be positive integers" >&2
    exit 2
  }
done

heartbeat_interval=$((TTL_SECONDS / 3))
(( heartbeat_interval < HEARTBEAT_MIN_SECONDS )) && heartbeat_interval="$HEARTBEAT_MIN_SECONDS"
(( heartbeat_interval > HEARTBEAT_MAX_SECONDS )) && heartbeat_interval="$HEARTBEAT_MAX_SECONDS"

rsync_pid=''
heartbeat_pid=''
cleanup() {
  trap - EXIT TERM INT
  if [[ -n "$heartbeat_pid" ]]; then
    kill "$heartbeat_pid" 2>/dev/null || true
    wait "$heartbeat_pid" 2>/dev/null || true
  fi
  if [[ -n "$rsync_pid" ]] && kill -0 "$rsync_pid" 2>/dev/null; then
    kill "$rsync_pid" 2>/dev/null || true
    wait "$rsync_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT TERM INT

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'services/web-app/node_modules' \
  --exclude 'services/web-app/.react-router' \
  --exclude 'services/web-app/.vite' \
  --exclude 'packages/prisma/generated' \
  --exclude '.worktrees' \
  -e "ssh -i $SSH_KEY" \
  ./ "$SSH_TARGET:$REMOTE_SOURCE/" &
rsync_pid=$!

(
  while sleep "$heartbeat_interval"; do
    printf -v heartbeat_command 'touch %q' "$INFLIGHT_MARKER"
    ssh -i "$SSH_KEY" "$SSH_TARGET" "$heartbeat_command" || exit 1
  done
) &
heartbeat_pid=$!

while kill -0 "$rsync_pid" 2>/dev/null; do
  if ! kill -0 "$heartbeat_pid" 2>/dev/null; then
    wait "$heartbeat_pid" || true
    echo "Preview deployment marker heartbeat failed" >&2
    kill "$rsync_pid" 2>/dev/null || true
    wait "$rsync_pid" 2>/dev/null || true
    exit 1
  fi
  sleep 0.1
done

wait "$rsync_pid"
rsync_pid=''
kill "$heartbeat_pid" 2>/dev/null || true
wait "$heartbeat_pid" 2>/dev/null || true
heartbeat_pid=''
trap - EXIT TERM INT
