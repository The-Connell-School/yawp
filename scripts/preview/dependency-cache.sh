#!/usr/bin/env bash

preview_dependency_cache_marker='.yawp-preview-dependency-cache'

preview_dependency_cache_is_ready() {
  local volume="$1"
  local fingerprint="$2"
  docker run --rm \
    -e "DEPENDENCY_CACHE_FINGERPRINT=$fingerprint" \
    -v "${volume}:/cache:ro" \
    "$PREVIEW_BUN_IMAGE" \
    bash -lc '[[ -f /cache/'"$preview_dependency_cache_marker"' ]] && [[ "$(< /cache/'"$preview_dependency_cache_marker"')" == "$DEPENDENCY_CACHE_FINGERPRINT" ]]' \
    >/dev/null 2>&1
}

preview_dependency_cache_remove_partial() {
  local volume
  local failed=0
  for volume in "$DEPENDENCY_ROOT_VOLUME" "$DEPENDENCY_WEB_VOLUME"; do
    if docker volume inspect "$volume" >/dev/null 2>&1 \
      && ! docker volume rm "$volume" >/dev/null; then
      failed=1
    fi
  done
  return "$failed"
}

preview_dependency_cache_create_volume() {
  local volume="$1"
  docker volume create \
    --label com.yawp.preview.dependency-cache=true \
    --label "com.yawp.preview.dependency-fingerprint=$DEPENDENCY_CACHE_FINGERPRINT" \
    --label "com.yawp.preview.created-at=$(date +%s)" \
    "$volume" >/dev/null
}

preview_dependency_cache_install() {
  preview_dependency_cache_create_volume "$DEPENDENCY_ROOT_VOLUME"
  preview_dependency_cache_create_volume "$DEPENDENCY_WEB_VOLUME"
  if ! docker run --rm \
    -e "DEPENDENCY_CACHE_FINGERPRINT=$DEPENDENCY_CACHE_FINGERPRINT" \
    -v "$SOURCE_DIR:/app" \
    -v "$DEPENDENCY_ROOT_VOLUME:/app/node_modules" \
    -v "$DEPENDENCY_WEB_VOLUME:/app/services/web-app/node_modules" \
    -w /app \
    "$PREVIEW_BUN_IMAGE" \
    bash -lc 'set -euo pipefail
      bun install --frozen-lockfile --ignore-scripts
      mkdir -p /app/services/web-app/node_modules/.vite
      printf "%s\n" "$DEPENDENCY_CACHE_FINGERPRINT" > /app/node_modules/.yawp-preview-dependency-cache
      printf "%s\n" "$DEPENDENCY_CACHE_FINGERPRINT" > /app/services/web-app/node_modules/.yawp-preview-dependency-cache'; then
    preview_dependency_cache_remove_partial || true
    return 1
  fi
}

preview_prepare_dependency_cache() {
  local script_dir="$1"
  local preview_root="$2"
  eval "$(node "$script_dir/dependency-cache.mjs" "$SOURCE_DIR")"
  export DEPENDENCY_CACHE_FINGERPRINT DEPENDENCY_ROOT_VOLUME DEPENDENCY_WEB_VOLUME PREVIEW_BUN_IMAGE

  # Docker cannot create nested mountpoints below a read-only source bind. These paths
  # are excluded from source sync and hold no PR state; the actual contents live in
  # immutable shared dependency volumes or per-preview scratch volumes.
  mkdir -p \
    "$SOURCE_DIR/node_modules" \
    "$SOURCE_DIR/services/web-app/node_modules/.vite" \
    "$SOURCE_DIR/services/web-app/.react-router"
  mkdir -p "$preview_root"
  local lock_file="$preview_root/dependency-cache.lock"
  (
    flock -w 900 8
    local root_ready=false
    local web_ready=false
    preview_dependency_cache_is_ready "$DEPENDENCY_ROOT_VOLUME" "$DEPENDENCY_CACHE_FINGERPRINT" \
      && root_ready=true
    preview_dependency_cache_is_ready "$DEPENDENCY_WEB_VOLUME" "$DEPENDENCY_CACHE_FINGERPRINT" \
      && web_ready=true
    if [[ "$root_ready" == "true" && "$web_ready" == "true" ]]; then
      echo "Reusing dependency cache $DEPENDENCY_CACHE_FINGERPRINT."
      exit 0
    fi
    if [[ "$root_ready" != "$web_ready" ]]; then
      echo "Dependency cache pair is inconsistent; refusing to mutate a potentially mounted cache." >&2
      exit 1
    fi
    preview_dependency_cache_remove_partial || {
      echo "Dependency cache is incomplete but still in use; refusing to mutate it." >&2
      exit 1
    }
    echo "Creating dependency cache $DEPENDENCY_CACHE_FINGERPRINT..."
    preview_dependency_cache_install
  ) 8>"$lock_file"
}
