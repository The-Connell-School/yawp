#!/usr/bin/env bash
set -euo pipefail

cache_hit="${1:-false}"
max_attempts=3
attempt_timeout="${PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT:-6m}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$("$repo_root/scripts/ci/resolve-playwright-version.sh")"

if [[ -z "$version" ]]; then
  echo "::error::Could not resolve @playwright/test version from bun.lock" >&2
  exit 1
fi

pw() {
  bunx --package "@playwright/test@${version}" playwright "$@"
}

launch_log="$(mktemp)"
trap 'rm -f "$launch_log"' EXIT

verify_chromium_launch() {
  : >"$launch_log"
  if node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
" 2>"$launch_log"; then
    return 0
  fi

  if grep -qiE 'host system is missing dependencies|missing dependencies|error while loading shared libraries|lib.*\.so\.[0-9]+' "$launch_log"; then
    cat "$launch_log" >&2
    return 2
  fi

  cat "$launch_log" >&2
  return 1
}

install_once() {
  if [[ "$cache_hit" == "true" ]]; then
    pw install chromium
    local launch_rc=0
    verify_chromium_launch || launch_rc=$?
    if [[ "$launch_rc" -eq 0 ]]; then
      return 0
    fi
    if [[ "$launch_rc" -eq 2 ]]; then
      echo "Chromium launch failed with missing OS libraries; running install-deps chromium"
      pw install-deps chromium
      verify_chromium_launch
      return $?
    fi
    return 1
  fi

  pw install --with-deps chromium
}

cd "$repo_root/services/web-app"

export version cache_hit launch_log repo_root
export -f pw verify_chromium_launch install_once

for attempt in $(seq 1 "$max_attempts"); do
  echo "Playwright chromium install attempt ${attempt}/${max_attempts} (cache_hit=${cache_hit}, version=${version})"
  exit_code=0
  timeout "$attempt_timeout" bash -euo pipefail -c 'install_once' || exit_code=$?

  if [[ "$exit_code" -eq 0 ]]; then
    echo "Playwright chromium install succeeded on attempt ${attempt}"
    exit 0
  fi

  if [[ "$exit_code" -eq 124 ]]; then
    echo "::warning::Playwright install attempt ${attempt} timed out after ${attempt_timeout}"
  else
    echo "::warning::Playwright install attempt ${attempt} failed (exit ${exit_code})"
  fi

  if [[ "$attempt" -lt "$max_attempts" ]]; then
    sleep $((attempt * 20))
  fi
done

echo "::error::Playwright chromium install failed after ${max_attempts} attempts"
exit 1
