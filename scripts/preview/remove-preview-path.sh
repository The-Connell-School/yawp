#!/usr/bin/env bash
# Safely remove preview trees that can contain container-root-owned build output.

preview_remove_path_is_safe() {
  local target="${1:-}"
  local root="${PREVIEW_ROOT:-/srv/yawp-preview}"
  local leaf root_abs parent_abs

  [[ -n "$target" ]] || return 1
  leaf="$(basename "$target")"
  [[ "$leaf" =~ ^pr-[1-9][0-9]*$ ]] || return 1

  root_abs="$(cd "$root" 2>/dev/null && pwd -P)" || return 1
  parent_abs="$(cd "$(dirname "$target")" 2>/dev/null && pwd -P)" || return 1
  [[ "$parent_abs" == "$root_abs/previews" || "$parent_abs" == "$root_abs/sources" ]]
}

preview_remove_path() {
  local target="${1:-}"
  local rm_cmd="${PREVIEW_REMOVE_RM:-rm}"
  local docker_cmd="${PREVIEW_REMOVE_DOCKER:-docker}"
  local image="${PREVIEW_REMOVE_IMAGE:-oven/bun:1.3.1}"
  local parent leaf

  if ! preview_remove_path_is_safe "$target"; then
    echo "Refusing to remove unsafe preview path: ${target:-<empty>}" >&2
    return 1
  fi
  [[ -e "$target" ]] || return 0

  "$rm_cmd" -rf "$target" 2>/dev/null || true
  [[ -e "$target" ]] || return 0

  parent="$(cd "$(dirname "$target")" && pwd -P)"
  leaf="$(basename "$target")"
  "$docker_cmd" run --rm --user 0:0 --entrypoint /bin/sh \
    -v "$parent:/target" "$image" \
    -c 'rm -rf "/target/$1"' _ "$leaf" >/dev/null 2>&1 || true
  [[ -e "$target" ]] || return 0

  echo "Failed to remove preview path: $target" >&2
  return 1
}
