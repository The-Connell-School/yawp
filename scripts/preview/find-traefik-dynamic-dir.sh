#!/usr/bin/env bash
set -euo pipefail

validate_dynamic_dir() {
  local candidate="$1"
  [[ "$candidate" == /* ]] || return 1
  [[ "$candidate" != *[$'\n\r\t ']* ]] || return 1
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
}

if [[ -n "${PREVIEW_TRAEFIK_DYNAMIC_DIR:-}" ]]; then
  if ! validate_dynamic_dir "$PREVIEW_TRAEFIK_DYNAMIC_DIR"; then
    echo "PREVIEW_TRAEFIK_DYNAMIC_DIR must be an existing absolute, non-symlink directory without whitespace" >&2
    exit 1
  fi
  printf '%s\n' "$PREVIEW_TRAEFIK_DYNAMIC_DIR"
  exit 0
fi

running_containers="$(docker ps --format '{{.ID}} {{.Image}}')" || {
  echo "Unable to list running containers while locating Traefik" >&2
  exit 1
}

dynamic_directories=()
while read -r container_id image_name _; do
  [[ -n "$container_id" && -n "$image_name" ]] || continue
  [[ "$image_name" =~ (^|/)traefik($|:|@) ]] || continue

  mount_sources="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/dynamic"}}{{println .Source}}{{end}}{{end}}' "$container_id")" || {
    echo "Unable to inspect running Traefik container" >&2
    exit 1
  }
  while IFS= read -r mount_source; do
    [[ -n "$mount_source" ]] || continue
    if ! validate_dynamic_dir "$mount_source"; then
      echo "Running Traefik container has an invalid /dynamic mount source" >&2
      exit 1
    fi
    already_recorded=false
    for existing in "${dynamic_directories[@]:-}"; do
      if [[ "$existing" == "$mount_source" ]]; then
        already_recorded=true
        break
      fi
    done
    [[ "$already_recorded" == "true" ]] || dynamic_directories+=("$mount_source")
  done <<<"$mount_sources"
done <<<"$running_containers"

if (( ${#dynamic_directories[@]} != 1 )); then
  echo "Expected exactly one Traefik dynamic directory; found ${#dynamic_directories[@]}" >&2
  exit 1
fi

printf '%s\n' "${dynamic_directories[0]}"
