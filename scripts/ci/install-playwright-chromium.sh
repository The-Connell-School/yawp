#!/usr/bin/env bash
set -euo pipefail

cache_hit="${1:-false}"
max_attempts=3
attempt_timeout="${PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT:-6m}"
apt_lock_wait_seconds="${PLAYWRIGHT_APT_LOCK_WAIT_SECONDS:-180}"
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
playwright_deps_flag="$(mktemp)"
trap 'rm -f "$launch_log" "$playwright_deps_flag"' EXIT

configure_apt_dpkg_lock_timeout() {
  local conf_path="/etc/apt/apt.conf.d/99-yawp-playwright-ci-dpkg-lock-timeout.conf"
  local line='DPkg::Lock::Timeout "120";'
  if [[ -w /etc/apt/apt.conf.d ]]; then
    printf '%s\n' "$line" >"$conf_path"
    echo "Configured apt dpkg lock timeout at ${conf_path}"
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    printf '%s\n' "$line" | sudo tee "$conf_path" >/dev/null
    echo "Configured apt dpkg lock timeout at ${conf_path} (via sudo)"
    return 0
  fi
  echo "::warning::Could not configure apt DPkg::Lock::Timeout (no write access to /etc/apt/apt.conf.d)"
}

wait_for_apt_locks() {
  local max_wait="${1:-$apt_lock_wait_seconds}"
  local elapsed=0
  local interval=5
  local locks=(
    /var/lib/dpkg/lock-frontend
    /var/lib/dpkg/lock
    /var/lib/apt/lists/lock
    /var/cache/apt/archives/lock
  )

  while (( elapsed < max_wait )); do
    local busy=0
    local held_lock=""
    for lock in "${locks[@]}"; do
      if [[ ! -e "$lock" ]]; then
        continue
      fi
      if fuser -s "$lock" 2>/dev/null; then
        busy=1
        held_lock="$lock"
        break
      fi
    done

    if (( busy == 0 )); then
      if (( elapsed > 0 )); then
        echo "apt/dpkg locks are free after ${elapsed}s"
      fi
      return 0
    fi

    echo "Waiting for apt/dpkg lock on ${held_lock} (${elapsed}s / ${max_wait}s)"
    fuser -v "$held_lock" 2>&1 || true
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  echo "::warning::apt/dpkg locks still held after ${max_wait}s"
  return 1
}

stop_process_group() {
  local pgid="$1"
  kill -TERM "-${pgid}" 2>/dev/null || true
  sleep 5
  kill -KILL "-${pgid}" 2>/dev/null || true
}

run_timed_in_process_group() {
  local label="$1"
  shift

  local attempt_log
  attempt_log="$(mktemp)"

  setsid "$@" >"$attempt_log" 2>&1 &
  local pid=$!
  local pgid
  pgid="$(ps -o pgid= -p "$pid" | tr -d ' ')"
  echo "${label}: started pid=${pid} pgid=${pgid}"

  local rc=0
  local timed_out=0
  if ! timeout --kill-after=30s "$attempt_timeout" bash -c "wait ${pid}"; then
    rc=$?
    if [[ "$rc" -eq 124 ]]; then
      timed_out=1
      echo "${label}: timed out after ${attempt_timeout}; stopping process group ${pgid}"
      stop_process_group "$pgid"
      wait "$pid" 2>/dev/null || true
      wait_for_apt_locks "$apt_lock_wait_seconds" || true
    fi
  fi

  if [[ "$timed_out" -eq 0 ]]; then
    wait "$pid" || rc=$?
  fi

  cat "$attempt_log" >&2
  rm -f "$attempt_log"

  if [[ "$timed_out" -eq 1 ]]; then
    return 124
  fi
  return "$rc"
}

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

playwright_os_deps_installed() {
  [[ -f "$playwright_deps_flag" ]]
}

install_chromium_with_os_deps() {
  if ! playwright_os_deps_installed; then
    echo "Installing Playwright OS dependencies (install-deps chromium)"
    pw install-deps chromium
    : >"$playwright_deps_flag"
  else
    echo "Skipping install-deps chromium (OS dependencies already installed this run)"
  fi
  echo "Installing Playwright Chromium browser binaries (install chromium)"
  pw install chromium
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

  install_chromium_with_os_deps
}

configure_apt_dpkg_lock_timeout

cd "$repo_root/services/web-app"

export version cache_hit launch_log repo_root playwright_deps_flag
export -f pw verify_chromium_launch install_once install_chromium_with_os_deps playwright_os_deps_installed

for attempt in $(seq 1 "$max_attempts"); do
  deps_state="pending"
  if playwright_os_deps_installed; then
    deps_state="installed"
  fi
  echo "Playwright chromium install attempt ${attempt}/${max_attempts} (cache_hit=${cache_hit}, version=${version}, attempt_timeout=${attempt_timeout}, os_deps=${deps_state})"
  wait_for_apt_locks "$apt_lock_wait_seconds" || true

  exit_code=0
  if [[ "$cache_hit" == "true" ]]; then
    run_timed_in_process_group "attempt ${attempt} (cache hit path)" bash -euo pipefail -c 'install_once' || exit_code=$?
  else
    run_timed_in_process_group "attempt ${attempt} (install-deps + chromium)" bash -euo pipefail -c 'install_chromium_with_os_deps' || exit_code=$?
  fi

  if [[ "$exit_code" -eq 0 ]]; then
    echo "Playwright chromium install succeeded on attempt ${attempt}"
    exit 0
  fi

  if [[ "$exit_code" -eq 124 ]]; then
    echo "::warning::Playwright install attempt ${attempt} timed out after ${attempt_timeout} (process group terminated)"
  else
    echo "::warning::Playwright install attempt ${attempt} failed (exit ${exit_code})"
  fi

  if [[ "$attempt" -lt "$max_attempts" ]]; then
    wait_for_apt_locks "$apt_lock_wait_seconds" || true
    sleep $((attempt * 20))
  fi
done

echo "::error::Playwright chromium install failed after ${max_attempts} attempts"
exit 1
