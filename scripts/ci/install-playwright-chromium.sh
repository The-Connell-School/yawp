#!/usr/bin/env bash
set -euo pipefail

cache_hit="${1:-false}"
max_attempts=3
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$("$repo_root/scripts/ci/resolve-playwright-version.sh")"

if [[ -z "$version" ]]; then
  echo "::error::Could not resolve @playwright/test version from bun.lock" >&2
  exit 1
fi

pw() {
  bunx --package "@playwright/test@${version}" playwright "$@"
}

install_once() {
  if [[ "$cache_hit" == "true" ]]; then
    pw install-deps chromium
  else
    pw install --with-deps chromium
  fi
}

cd "$repo_root/services/web-app"

for attempt in $(seq 1 "$max_attempts"); do
  echo "Playwright chromium install attempt ${attempt}/${max_attempts} (cache_hit=${cache_hit}, version=${version})"
  if install_once; then
    echo "Playwright chromium install succeeded on attempt ${attempt}"
    exit 0
  fi
  exit_code=$?
  echo "::warning::Playwright install attempt ${attempt} failed (exit ${exit_code})"
  if [[ "$attempt" -lt "$max_attempts" ]]; then
    sleep $((attempt * 20))
  fi
done

echo "::error::Playwright chromium install failed after ${max_attempts} attempts"
exit 1
