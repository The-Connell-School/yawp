#!/usr/bin/env bash
# Shared Vite optimizeDeps template seeding for fast-runtime previews.
# Sourced from deploy.sh after compose variables exist.

: "${SCRIPT_DIR:?SCRIPT_DIR is required}"
: "${SOURCE_DIR:?SOURCE_DIR is required}"
: "${ROOT:?ROOT is required}"
: "${PREVIEW_DIR:?PREVIEW_DIR is required}"
: "${COMPOSE_PROJECT:?COMPOSE_PROJECT is required}"
: "${SLUG:?SLUG is required}"

VITE_DEPS_ROOT="${VITE_DEPS_ROOT:-$ROOT/vite-deps}"
VITE_DEPS_FP_FILE="${VITE_DEPS_FP_FILE:-$PREVIEW_DIR/vite-deps-fingerprint}"
WEB_NODE_MODULES_VOLUME="${COMPOSE_PROJECT}-web-node-modules"
VITE_SEED_STATE="${VITE_SEED_STATE:-skipped}"
RAN_BUN_INSTALL="${RAN_BUN_INSTALL:-0}"
PREV_VITE_DEPS_FINGERPRINT=""
VITE_DEPS_FP=""
VITE_LOCKFILE_HASH=""

volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

compute_vite_deps_fingerprint() {
  (
    cd "$SOURCE_DIR"
    for file in \
      bun.lockb \
      bun.lock \
      package.json \
      services/web-app/package.json \
      services/web-app/vite.config.ts \
      services/web-app/react-router.config.ts
    do
      if [[ -f "$file" ]]; then
        sha256_file "$file"
      fi
    done
  ) | sha256_stream | awk '{print $1}'
}

load_vite_deps_state() {
  if [[ -f "$VITE_DEPS_FP_FILE" ]]; then
    PREV_VITE_DEPS_FINGERPRINT="$(<"$VITE_DEPS_FP_FILE")"
  fi
  VITE_DEPS_FP="$(compute_vite_deps_fingerprint)"
  VITE_LOCKFILE_HASH="$(node "$SCRIPT_DIR/vite-lockfile-hash.mjs" "$SOURCE_DIR" 2>/dev/null || true)"
}

write_vite_deps_fingerprint() {
  [[ -n "$VITE_DEPS_FP" ]] || return 0
  printf '%s\n' "$VITE_DEPS_FP" > "$VITE_DEPS_FP_FILE"
}

vite_deps_container() {
  local subcommand="$1"
  shift
  local name="yawp-vite-deps-${SLUG}"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run --rm --name "$name" --network none \
    -e SEED_STAMP="$$" \
    -e EXPECT_LOCKFILE_HASH="$VITE_LOCKFILE_HASH" \
    -e OWNER="$(id -u):$(id -g)" \
    -v "$SCRIPT_DIR/vite-deps-copy.sh:/opt/vite-deps-copy.sh:ro" \
    -v "$SCRIPT_DIR/check-vite-deps.mjs:/opt/check-vite-deps.mjs:ro" \
    -v "${WEB_NODE_MODULES_VOLUME}:/vol/web" \
    "$@" \
    oven/bun:1.3.1 \
    sh /opt/vite-deps-copy.sh "$subcommand"
}

# Copy a shared template into this PR's web node_modules volume before Vite starts.
# Never fails the deploy — every branch returns 0.
seed_vite_deps() {
  [[ "${RUNTIME:-fast}" == "fast" ]] || {
    VITE_SEED_STATE="skipped-production"
    return 0
  }

  local template_dir="$VITE_DEPS_ROOT/$VITE_DEPS_FP"

  if [[ "$VITE_DEPS_FP" == "$PREV_VITE_DEPS_FINGERPRINT" && "$RAN_BUN_INSTALL" != "1" ]]; then
    VITE_SEED_STATE="current"
    echo "Vite deps cache already current for ${VITE_DEPS_FP:0:12}; leaving it alone."
    return 0
  fi

  if ! volume_exists "$WEB_NODE_MODULES_VOLUME"; then
    VITE_SEED_STATE="no-volume"
    echo "web node_modules volume not materialised yet; skipping Vite deps seed." >&2
    return 0
  fi

  if [[ -z "$VITE_LOCKFILE_HASH" ]]; then
    VITE_SEED_STATE="no-lockfile"
    echo "Could not hash the workspace lockfile; skipping Vite deps seed." >&2
    return 0
  fi

  if [[ ! -d "$template_dir/web" ]]; then
    VITE_SEED_STATE="miss"
    if [[ -n "$PREV_VITE_DEPS_FINGERPRINT" ]]; then
      echo "No Vite deps template for ${VITE_DEPS_FP:0:12}; clearing stale cache."
      "${compose[@]}" stop web >/dev/null 2>&1 || true
      if vite_deps_container clear; then
        VITE_SEED_STATE="cleared"
      else
        echo "Could not clear stale Vite deps cache; continuing." >&2
      fi
    else
      echo "No Vite deps template for ${VITE_DEPS_FP:0:12} yet; this PR pre-bundles and publishes one."
    fi
    return 0
  fi

  if ! node "$SCRIPT_DIR/check-vite-deps.mjs" "$template_dir/web" "$VITE_LOCKFILE_HASH"; then
    echo "Vite deps template ${VITE_DEPS_FP:0:12} failed validation; retiring it." >&2
    rm -rf "$template_dir"
    VITE_SEED_STATE="bad-template"
    return 0
  fi

  "${compose[@]}" stop web >/dev/null 2>&1 || true
  if ! vite_deps_container seed -v "$template_dir:/tpl:ro"; then
    echo "Vite deps seed failed; retiring template ${VITE_DEPS_FP:0:12}." >&2
    rm -rf "$template_dir"
    VITE_SEED_STATE="failed"
    return 0
  fi

  touch "$template_dir/.last-used" 2>/dev/null || true
  VITE_SEED_STATE="seeded"
  echo "Seeded web Vite deps cache from template ${VITE_DEPS_FP:0:12}."
}

# Publish this PR's proven cache as the shared template after smoke passes.
publish_vite_deps_template() {
  [[ "${RUNTIME:-fast}" == "fast" ]] || return 0
  [[ -n "$VITE_DEPS_FP" && -n "$VITE_LOCKFILE_HASH" ]] || return 0

  local template_dir="$VITE_DEPS_ROOT/$VITE_DEPS_FP"
  local build_dir="$VITE_DEPS_ROOT/.build.$$"

  if [[ -d "$template_dir" ]]; then
    return 0
  fi

  local attempt ready=0
  for attempt in $(seq 1 20); do
    if "${compose[@]}" exec -T web \
      test -f /app/services/web-app/node_modules/.vite/deps/_metadata.json 2>/dev/null; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ "$ready" != "1" ]]; then
    echo "web has written no Vite deps cache; no template published." >&2
    return 0
  fi

  rm -rf "$build_dir"
  mkdir -p "$build_dir"
  if ! vite_deps_container harvest -v "$build_dir:/out"; then
    echo "Could not harvest this PR's Vite deps cache; no template published." >&2
    rm -rf "$build_dir"
    return 0
  fi
  touch "$build_dir/.last-used"

  if mv -T "$build_dir" "$template_dir" 2>/dev/null; then
    echo "Published Vite deps template ${VITE_DEPS_FP:0:12} ($(du -sh "$template_dir" 2>/dev/null | cut -f1))."
  else
    rm -rf "$build_dir"
  fi
}
