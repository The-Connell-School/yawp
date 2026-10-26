#!/usr/bin/env bash
# CI helper: shrink ~/.cache/ms-playwright before actions/cache/save to avoid oversized
# archives (HTTP 400) and stale multi-revision trees after install-deps + chromium.
set -euo pipefail

cache_root="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"

if [[ ! -d "$cache_root" ]]; then
  echo "Playwright cache root missing (${cache_root}); nothing to prune"
  exit 0
fi

size_before="$(du -sh "$cache_root" 2>/dev/null | awk '{print $1}' || echo unknown)"
echo "Pruning Playwright browser cache under ${cache_root} (size before: ${size_before})"

removed_other=0
for entry in "$cache_root"/*; do
  [[ -e "$entry" ]] || continue
  base="$(basename "$entry")"
  case "$base" in
    chromium-*|chromium_headless_shell-*|ffmpeg-*|.links|__dirlock)
      continue
      ;;
    *)
      echo "Removing non-chromium Playwright cache entry: ${base}"
      rm -rf "$entry"
      removed_other=$((removed_other + 1))
      ;;
  esac
done

keep_latest_revision_dirs() {
  local glob_pattern="$1"
  local -a dirs=()
  shopt -s nullglob
  dirs=("$cache_root"/${glob_pattern})
  shopt -u nullglob

  if ((${#dirs[@]} <= 1)); then
    return 0
  fi

  mapfile -t sorted < <(printf '%s\n' "${dirs[@]}" | sort -V)
  local keep="${sorted[-1]}"
  local dir base
  for dir in "${sorted[@]}"; do
    [[ "$dir" == "$keep" ]] && continue
    base="$(basename "$dir")"
    echo "Removing stale Playwright cache revision: ${base}"
    rm -rf "$dir"
  done
}

keep_latest_revision_dirs 'chromium-*'
keep_latest_revision_dirs 'chromium_headless_shell-*'
keep_latest_revision_dirs 'ffmpeg-*'

size_after="$(du -sh "$cache_root" 2>/dev/null | awk '{print $1}' || echo unknown)"
echo "Playwright cache prune complete (removed_other=${removed_other}, size after: ${size_after})"
