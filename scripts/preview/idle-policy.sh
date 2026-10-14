#!/usr/bin/env bash
# Shared with capacity reconciliation. Inputs contain no credentials.
preview_file_epoch() {
  local value=''
  [[ -f "$1" ]] && IFS= read -r value < "$1" || true
  [[ "$value" =~ ^[0-9]+$ ]] && printf '%s\n' "$value" || echo 0
}
preview_idle_deadline() {
  local dir="$1" hours="$2" human deploy
  human="$(preview_file_epoch "$dir/last-human-activity")"
  deploy="$(preview_file_epoch "$dir/last-deploy")"
  # Unknown history fails safely: bootstrap seeds legacy metadata once, without
  # restarting residents. Never guess an ancient deadline from absent metadata.
  (( human > 0 || deploy > 0 )) || { echo 0; return; }
  (( human > deploy )) && deploy="$human"
  echo "$((deploy + hours * 3600))"
}
preview_idle_protected() {
  local root="$1" pr="$2" now="$3" ttl="${4:-3600}" modified lease
  [[ -f "$root/quarantine/pr-$pr" ]] && return 0
  for marker in "$root/inflight/pr-$pr"/*; do
    [[ -f "$marker" ]] || continue
    modified="$(stat -c %Y "$marker")" || return 0
    (( now - modified < ttl )) && return 0
  done
  lease="$(preview_file_epoch "$root/wake/access/pr-$pr")"
  (( lease > 0 && now - lease < 120 )) && return 0
  return 1
}
