#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
OPEN_PR_NUMBERS="${OPEN_PR_NUMBERS:-}"
PREVIEW_TTL_HOURS="${PREVIEW_TTL_HOURS:-72}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
now_epoch="$(date +%s)"

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
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

  if docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --if-exists "$database_name" || true
  fi
}

remove_legacy_postgres_volume() {
  local project="$1"

  docker volume rm "${project}_${project}-postgres-data" >/dev/null 2>&1 || true
}

remove_preview_path() {
  local path="$1"

  [[ -e "$path" || -L "$path" ]] || return 0

  if rm -rf -- "$path" 2>/dev/null; then
    return 0
  fi

  echo "Direct removal failed for $path; retrying with elevated cleanup." >&2

  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    if sudo -n rm -rf -- "$path"; then
      return 0
    fi
  fi

  if docker info >/dev/null 2>&1; then
    local parent
    local basename
    parent="$(dirname -- "$path")"
    basename="$(basename -- "$path")"
    if docker run --rm -v "$parent:/cleanup-parent" alpine:3.20 sh -c 'rm -rf -- "/cleanup-parent/$1"' sh "$basename"; then
      return 0
    fi
  fi

  rm -rf -- "$path"
}

destroy_preview_path() {
  local preview_path="$1"
  local pr_number="$2"
  local project="yawp-pr-${pr_number}"
  local compose_file="$preview_path/docker-compose.yml"

  if [[ -f "$compose_file" ]]; then
    docker compose -p "$project" -f "$compose_file" down -v --remove-orphans || true
  else
    docker compose -p "$project" down -v --remove-orphans || true
  fi

  drop_preview_database "$pr_number"
  remove_legacy_postgres_volume "$project"
  remove_preview_path "$preview_path"
  remove_preview_path "$ROOT/sources/pr-${pr_number}"
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
    if is_open_pr "$pr_number"; then
      continue
    fi
    if ! is_expired_path "$preview_path"; then
      continue
    fi

    destroy_preview_path "$preview_path" "$pr_number"
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
    if is_open_pr "$pr_number"; then
      continue
    fi
    if ! is_expired_path "$source_path"; then
      continue
    fi

    remove_preview_path "$source_path"
    echo "Cleaned source pr-${pr_number}"
  done
}

cleanup_previews
cleanup_sources
