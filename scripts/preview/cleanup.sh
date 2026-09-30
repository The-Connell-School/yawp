#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
export PREVIEW_ROOT="$ROOT"
OPEN_PR_NUMBERS="${OPEN_PR_NUMBERS:-}"
PREVIEW_TTL_HOURS="${PREVIEW_TTL_HOURS:-72}"
TARGET_PR="${TARGET_PR:-}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
DOCKER="${PREVIEW_DOCKER:-docker}"
INFLIGHT_TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"
now_epoch="$(date +%s)"
cleanup_failed=0

if ! declare -F preview_remove_path >/dev/null 2>&1; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=remove-preview-path.sh
  source "$SCRIPT_DIR/remove-preview-path.sh"
fi

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

if [[ ! "$INFLIGHT_TTL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "PREVIEW_INFLIGHT_TTL_SECONDS must be a nonnegative integer" >&2
  exit 1
fi

is_inflight() {
  local pr_number="$1"
  local marker leaf modified
  for marker in "$ROOT/inflight/pr-${pr_number}"/*; do
    [[ -f "$marker" ]] || continue
    leaf="$(basename "$marker")"
    [[ "$leaf" =~ ^[0-9]+-[0-9]+$ ]] || continue
    modified="$(stat -c %Y "$marker" 2>/dev/null || stat -f %m "$marker")" || continue
    [[ "$modified" =~ ^[0-9]+$ ]] || continue
    if (( modified > now_epoch || now_epoch - modified < INFLIGHT_TTL_SECONDS )); then
      return 0
    fi
  done
  return 1
}

if [[ -n "$TARGET_PR" ]] && ! is_positive_integer "$TARGET_PR"; then
  echo "TARGET_PR must be a positive integer" >&2
  exit 1
fi

matches_target() {
  [[ -z "$TARGET_PR" || "$1" == "$TARGET_PR" ]]
}

is_open_pr() {
  local pr_number="$1"
  [[ " ${OPEN_PR_NUMBERS} " == *" ${pr_number} "* ]]
}

is_expired_path() {
  local path="$1"
  local modified_epoch
  modified_epoch="$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path")"
  local age_seconds="$((now_epoch - modified_epoch))"
  local ttl_seconds="$((PREVIEW_TTL_HOURS * 3600))"

  [[ "$age_seconds" -ge "$ttl_seconds" ]]
}

drop_preview_database() {
  local pr_number="$1"
  local database_name="yawp_pr_${pr_number}"

  if "$DOCKER" inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    "$DOCKER" exec "$POSTGRES_CONTAINER" dropdb -U postgres --if-exists "$database_name"
    "$DOCKER" exec "$POSTGRES_CONTAINER" dropuser -U postgres --if-exists "${database_name}_app"
  fi
}

remove_legacy_postgres_volume() {
  local project="$1"

  if "$DOCKER" volume inspect "${project}_${project}-postgres-data" >/dev/null 2>&1; then
    "$DOCKER" volume rm "${project}_${project}-postgres-data" >/dev/null
  fi
}

assert_project_resources_absent() {
  local project="$1"
  # On hosts without Docker available, assume no Compose-managed resources remain.
  command -v "$DOCKER" >/dev/null 2>&1 || return 0
  local resources
  resources="$("$DOCKER" ps -aq --filter "label=com.docker.compose.project=${project}" 2>/dev/null)" || return 1
  [[ -z "$resources" ]] || return 1
  resources="$("$DOCKER" volume ls -q --filter "label=com.docker.compose.project=${project}" 2>/dev/null)" || return 1
  [[ -z "$resources" ]] || return 1
  resources="$("$DOCKER" network ls -q --filter "label=com.docker.compose.project=${project}" 2>/dev/null)" || return 1
  [[ -z "$resources" ]]
}

destroy_preview_path() {
  local preview_path="$1"
  local pr_number="$2"
  local project="yawp-pr-${pr_number}"
  local compose_file="$preview_path/docker-compose.yml"

  if [[ -f "$compose_file" ]]; then
    if ! "$DOCKER" compose -p "$project" -f "$compose_file" down -v --remove-orphans; then
      echo "::warning::compose down failed for pr-${pr_number}; forcing container/resource removal without compose file" >&2
      # Force-remove containers, then volumes and networks strictly by compose project label.
      "$DOCKER" ps -aq --filter "label=com.docker.compose.project=${project}" 2>/dev/null \
        | xargs -r "$DOCKER" rm -f >/dev/null 2>&1 || true
      "$DOCKER" volume ls -q --filter "label=com.docker.compose.project=${project}" 2>/dev/null \
        | xargs -r "$DOCKER" volume rm >/dev/null 2>&1 || true
      "$DOCKER" network ls -q --filter "label=com.docker.compose.project=${project}" 2>/dev/null \
        | xargs -r "$DOCKER" network rm >/dev/null 2>&1 || true
      if ! assert_project_resources_absent "$project"; then
        echo "::error::compose down failed and resources remain for pr-${pr_number}" >&2
        return 1
      fi
      rm -f -- "$compose_file" || true
    fi
  else
    # Without a compose file, refuse cleanup when Compose-managed resources exist.
    if ! assert_project_resources_absent "$project"; then
      echo "::error::refusing source-only cleanup for pr-${pr_number}; Compose resources exist or could not be ruled out without ${compose_file}" >&2
      return 1
    fi
  fi

  drop_preview_database "$pr_number" || return 1
  remove_legacy_postgres_volume "$project" || return 1
  local remove_failed=0
  if ! preview_remove_path "$preview_path"; then
    remove_failed=1
  fi
  if ! preview_remove_path "$ROOT/sources/pr-${pr_number}"; then
    remove_failed=1
  fi
  if [[ "$remove_failed" -ne 0 ]]; then
    return 1
  fi
  echo "Cleaned preview pr-${pr_number}"
}

cleanup_previews() {
  local previews_dir="$ROOT/previews"
  [[ -d "$previews_dir" ]] || return 0

  for preview_path in "$previews_dir"/pr-*; do
    [[ -d "$preview_path" ]] || continue

    local slug
    slug="$(basename "$preview_path")"
    local pr_number="${slug#pr-}"

    if ! is_positive_integer "$pr_number"; then
      continue
    fi
    if ! matches_target "$pr_number"; then
      continue
    fi
    if is_inflight "$pr_number"; then
      echo "Skipping preview pr-${pr_number}: deployment is in flight"
      continue
    fi
    if is_open_pr "$pr_number"; then
      continue
    fi
    if [[ -z "$TARGET_PR" ]] && ! is_expired_path "$preview_path"; then
      continue
    fi

    if ! destroy_preview_path "$preview_path" "$pr_number"; then
      cleanup_failed=1
    fi
  done
}

cleanup_sources() {
  local sources_dir="$ROOT/sources"
  [[ -d "$sources_dir" ]] || return 0

  for source_path in "$sources_dir"/pr-*; do
    [[ -d "$source_path" ]] || continue

    local slug
    slug="$(basename "$source_path")"
    local pr_number="${slug#pr-}"

    if ! is_positive_integer "$pr_number"; then
      continue
    fi
    if ! matches_target "$pr_number"; then
      continue
    fi
    if is_inflight "$pr_number"; then
      echo "Skipping source pr-${pr_number}: deployment is in flight"
      continue
    fi
    if is_open_pr "$pr_number"; then
      continue
    fi
    if [[ -d "$ROOT/previews/pr-${pr_number}" ]]; then
      echo "Skipping source pr-${pr_number}: preview teardown is incomplete"
      continue
    fi
    if [[ -z "$TARGET_PR" ]] && ! is_expired_path "$source_path"; then
      continue
    fi

    if preview_remove_path "$source_path"; then
      echo "Cleaned source pr-${pr_number}"
    else
      cleanup_failed=1
    fi
  done
}

cleanup_previews
cleanup_sources
exit "$cleanup_failed"
