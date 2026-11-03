#!/usr/bin/env bash
# Resolve the live demo web container (same compose project/service as deploy).
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/yawp-demo}"
PREVIEW_SLUG="${PREVIEW_SLUG:-demo}"
COMPOSE_PROJECT="${PREVIEW_COMPOSE_PROJECT:-yawp-${PREVIEW_SLUG}}"
PREVIEW_DIR="${PREVIEW_DIR:-${PREVIEW_ROOT}/previews/${PREVIEW_SLUG}}"
COMPOSE_FILE="${PREVIEW_COMPOSE_FILE:-${PREVIEW_DIR}/docker-compose.yml}"
ACTIVE_WEB_FILE="${PREVIEW_ACTIVE_WEB_FILE:-${PREVIEW_DIR}/docker-compose.yml.active-web}"

[[ "$PREVIEW_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid PREVIEW_ROOT" >&2
  exit 1
}
[[ "$COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || {
  echo "Invalid PREVIEW_COMPOSE_PROJECT" >&2
  exit 1
}
[[ -f "$COMPOSE_FILE" ]] || {
  echo "Demo compose file is missing: $COMPOSE_FILE" >&2
  exit 1
}

compose=(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE")

resolve_active_web_container() {
  local -a containers=()
  local container active status
  while IFS= read -r container; do
    [[ -n "$container" ]] && containers+=("$container")
  done < <("${compose[@]}" ps -q web 2>/dev/null || true)

  if [[ -s "$ACTIVE_WEB_FILE" ]]; then
    active="$(tr -d '[:space:]' <"$ACTIVE_WEB_FILE")"
    for container in "${containers[@]}"; do
      [[ "$container" == "$active" ]] || continue
      status="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
      [[ "$status" == "running" ]] || {
        echo "Recorded active demo web container is not running" >&2
        exit 1
      }
      printf '%s\n' "$container"
      return 0
    done
    echo "Recorded active demo web container is missing" >&2
    exit 1
  fi

  local -a running=()
  for container in "${containers[@]}"; do
    status="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
    [[ "$status" == "running" ]] && running+=("$container")
  done
  if (( ${#running[@]} != 1 )); then
    echo "Expected exactly one running demo web container, found ${#running[@]}" >&2
    exit 1
  fi
  printf '%s\n' "${running[0]}"
}

resolve_active_web_container
