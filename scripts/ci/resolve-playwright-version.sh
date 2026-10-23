#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mapfile -t versions < <(
  grep -oP '"@playwright/test": \["@playwright/test@\K[^"]+' "$repo_root/bun.lock" || true
)

if [[ ${#versions[@]} -eq 0 ]]; then
  echo "::error::Could not find hoisted @playwright/test version in bun.lock" >&2
  exit 1
fi

if [[ ${#versions[@]} -gt 1 ]]; then
  echo "::error::Expected one hoisted @playwright/test entry in bun.lock, found ${#versions[@]}: ${versions[*]}" >&2
  exit 1
fi

echo "${versions[0]}"
