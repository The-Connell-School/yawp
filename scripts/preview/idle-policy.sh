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

# Running capacity uses human activity exclusively. Deploys and wake leases never
# move a recorded human visit forward. Legacy previews fall back to their web start.
preview_activity_epoch() {
  local root="$1" pr="$2" dir human container started epoch
  dir="$root/previews/pr-$pr"
  human="$(preview_file_epoch "$dir/last-human-activity")"
  if (( human > 0 )); then
    printf '%s\n' "$human"
    return
  fi
  container="$("$DOCKER" ps --filter "label=com.docker.compose.project=yawp-pr-$pr" \
    --filter label=com.docker.compose.service=web --filter status=running -q 2>/dev/null | head -1)"
  started=""
  if [[ -n "$container" ]]; then
    started="$("$DOCKER" inspect --format '{{.State.StartedAt}}' "$container" 2>/dev/null || true)"
  fi
  epoch=0
  [[ -z "$started" ]] || epoch="$(date -d "$started" +%s 2>/dev/null || echo 0)"
  if [[ "$epoch" =~ ^[0-9]+$ ]] && (( epoch > 0 )); then
    printf '%s\n' "$epoch"
    return
  fi
  # last-deploy is the recorded Compose start for residents without Docker history.
  epoch="$(preview_file_epoch "$dir/last-deploy")"
  if (( epoch > 0 )); then
    printf '%s\n' "$epoch"
  else
    stat -c %Y "$dir/docker-compose.yml" 2>/dev/null \
      || stat -f %m "$dir/docker-compose.yml" 2>/dev/null || echo 0
  fi
}
