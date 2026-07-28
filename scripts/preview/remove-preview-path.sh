#!/usr/bin/env bash
# Removal helper shared by the preview cleanup and destroy paths.
#
# Preview containers bind-mount the source tree and run as root, so build output
# they generate (services/web-app/.react-router/types, Prisma client, Vite
# caches) lands on the host owned by root. The deploy user's `rm -rf` cannot
# delete those files, which is what left scheduled cleanup runs failing with
# "Permission denied" and stale previews piling up on the host.
#
# Removal is therefore attempted three ways, cheapest first:
#   1. plain rm, which covers everything the deploy user wrote
#   2. passwordless sudo, which the bootstrapped host grants
#   3. a throwaway root container over the parent directory, for hosts without
#      sudo but with docker
#
# PREVIEW_REMOVE_RM / PREVIEW_REMOVE_SUDO / PREVIEW_REMOVE_DOCKER /
# PREVIEW_REMOVE_IMAGE exist so tests can stand in for each layer.

preview_remove_path_is_safe() {
  local target="$1"

  # Only ever a pr-<number> directory that lives inside a parent directory.
  [[ "$target" == */* ]] || return 1
  [[ "$(basename "$target")" =~ ^pr-[1-9][0-9]*$ ]] || return 1
  return 0
}

preview_remove_path() {
  local target="${1:-}"
  [[ -n "$target" ]] || return 0

  if ! preview_remove_path_is_safe "$target"; then
    echo "Refusing to remove unsafe preview path: $target" >&2
    return 1
  fi

  [[ -e "$target" ]] || return 0

  local rm_cmd="${PREVIEW_REMOVE_RM:-rm}"
  "$rm_cmd" -rf "$target" 2>/dev/null || true
  [[ -e "$target" ]] || return 0

  local sudo_cmd="${PREVIEW_REMOVE_SUDO:-sudo -n}"
  # shellcheck disable=SC2086 -- sudo_cmd is a command plus flags.
  $sudo_cmd rm -rf "$target" >/dev/null 2>&1 || true
  [[ -e "$target" ]] || return 0

  local docker_cmd="${PREVIEW_REMOVE_DOCKER:-docker}"
  local image="${PREVIEW_REMOVE_IMAGE:-oven/bun:1.3.1}"
  local parent base
  parent="$(cd "$(dirname "$target")" 2>/dev/null && pwd)" || parent=''
  base="$(basename "$target")"
  if [[ -n "$parent" ]]; then
    # The image is one the preview host already runs, so this never needs a pull.
    "$docker_cmd" run --rm -v "$parent:/preview-target" "$image" \
      rm -rf "/preview-target/$base" >/dev/null 2>&1 || true
  fi
  [[ -e "$target" ]] || return 0

  echo "Failed to remove preview path: $target" >&2
  return 1
}
