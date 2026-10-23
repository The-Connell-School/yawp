#!/usr/bin/env bash
set -euo pipefail

cache_hit="${1:-false}"
max_attempts=2
attempt_timeout="${PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT:-6m}"
apt_lock_wait_seconds="${PLAYWRIGHT_APT_LOCK_WAIT_SECONDS:-60}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$("$repo_root/scripts/ci/resolve-playwright-version.sh")"

SCRIPT_PGID="$(ps -o pgid= -p $$ | tr -d ' ')"

if [[ -z "$version" ]]; then
  echo "::error::Could not resolve @playwright/test version from bun.lock" >&2
  exit 1
fi

pw() {
  bunx --package "@playwright/test@${version}" playwright "$@"
}

launch_log="$(mktemp)"
playwright_state_dir="$(mktemp -d)"
playwright_deps_flag="${playwright_state_dir}/os-deps-installed"
trap 'rm -f "$launch_log"; rm -rf "$playwright_state_dir"' EXIT

timeout_to_seconds() {
  local spec="$1"
  if [[ "$spec" =~ ^([0-9]+)m$ ]]; then
    echo $((BASH_REMATCH[1] * 60))
    return 0
  fi
  if [[ "$spec" =~ ^([0-9]+)s$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$spec" =~ ^[0-9]+$ ]]; then
    echo "$spec"
    return 0
  fi
  echo "::error::Unsupported timeout spec: ${spec}" >&2
  return 1
}

have_passwordless_sudo() {
  command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null
}

read_pgid_for_pid() {
  local pid="$1"
  ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' '
}

pgid_is_unsafe_to_kill() {
  local pgid="$1"
  [[ -z "$pgid" || "$pgid" == "0" || "$pgid" == "1" || "$pgid" == "$SCRIPT_PGID" ]]
}

configure_apt_dpkg_lock_timeout() {
  local conf_path="/etc/apt/apt.conf.d/99-yawp-playwright-ci-dpkg-lock-timeout.conf"
  local line='DPkg::Lock::Timeout "120";'
  if [[ -w /etc/apt/apt.conf.d ]]; then
    printf '%s\n' "$line" >"$conf_path"
    echo "Configured apt dpkg lock timeout at ${conf_path}"
    return 0
  fi
  if have_passwordless_sudo; then
    printf '%s\n' "$line" | sudo -n tee "$conf_path" >/dev/null
    echo "Configured apt dpkg lock timeout at ${conf_path} (via sudo)"
    return 0
  fi
  echo "::warning::Could not configure apt DPkg::Lock::Timeout (no write access to /etc/apt/apt.conf.d)"
}

lock_file_in_use() {
  local lock="$1"
  if have_passwordless_sudo; then
    sudo -n fuser -s "$lock" 2>/dev/null
    return $?
  fi
  fuser -s "$lock" 2>/dev/null
}

describe_lock_holders() {
  local lock="$1"
  if have_passwordless_sudo; then
    sudo -n fuser -v "$lock" 2>&1 || true
  else
    fuser -v "$lock" 2>&1 || true
  fi
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
      if lock_file_in_use "$lock"; then
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
    describe_lock_holders "$held_lock"
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  echo "::warning::apt/dpkg locks still held after ${max_wait}s"
  return 1
}

repair_apt_after_kill() {
  if have_passwordless_sudo; then
    timeout 60 sudo -n dpkg --configure -a || true
  fi
}

stop_process_group() {
  local pgid="$1"
  local leader_pid="$2"

  if pgid_is_unsafe_to_kill "$pgid"; then
    echo "::warning::Refusing to kill process group pgid=${pgid} (script pgid=${SCRIPT_PGID})"
    return 1
  fi

  local sid=""
  if [[ -n "$leader_pid" ]] && kill -0 "$leader_pid" 2>/dev/null; then
    sid="$(ps -o sid= -p "$leader_pid" 2>/dev/null | tr -d ' ' || true)"
  fi

  if have_passwordless_sudo; then
    sudo -n kill -TERM -- "-${pgid}" 2>/dev/null || true
    if [[ -n "$sid" ]]; then
      sudo -n pkill -TERM -s "$sid" 2>/dev/null || true
    fi
    sleep 5
    sudo -n kill -KILL -- "-${pgid}" 2>/dev/null || true
    if [[ -n "$sid" ]]; then
      sudo -n pkill -KILL -s "$sid" 2>/dev/null || true
    fi
    return 0
  fi

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  sleep 5
  kill -KILL -- "-${pgid}" 2>/dev/null || true
}

run_timed_in_process_group() {
  local label="$1"
  shift

  local deadline_sec
  deadline_sec="$(timeout_to_seconds "$attempt_timeout")"

  setsid "$@" > >(tee >&2) 2>&1 &
  local pid=$!
  local pgid=""
  local _try
  for _try in 1 2 3 4 5; do
    pgid="$(read_pgid_for_pid "$pid")"
    if [[ -n "$pgid" ]]; then
      break
    fi
    sleep 0.2
  done
  echo "${label}: started pid=${pid} pgid=${pgid:-unknown} (attempt_timeout=${attempt_timeout})"

  local rc=0
  local timed_out=0
  local started_at=$SECONDS

  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS - started_at >= deadline_sec )); then
      timed_out=1
      rc=124
      break
    fi
    sleep 1
  done

  if [[ "$timed_out" -eq 1 ]]; then
    if [[ -z "$pgid" ]]; then
      pgid="$(read_pgid_for_pid "$pid")"
    fi
    echo "${label}: timed out after ${attempt_timeout}; stopping process group ${pgid:-unknown}"
    stop_process_group "$pgid" "$pid"
    wait "$pid" 2>/dev/null || true
    return 124
  fi

  wait "$pid" || rc=$?
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

if [[ "${PLAYWRIGHT_INSTALL_SELF_CHECK:-}" == "1" ]]; then
  # shellcheck source=/dev/null
  source "$(dirname "${BASH_SOURCE[0]}")/install-playwright-chromium-self-check.sh"
  exit $?
fi

configure_apt_dpkg_lock_timeout

cd "$repo_root/services/web-app"

export version cache_hit launch_log repo_root playwright_deps_flag
export -f pw verify_chromium_launch install_once install_chromium_with_os_deps playwright_os_deps_installed

last_exit_code=0
for attempt in $(seq 1 "$max_attempts"); do
  deps_state="pending"
  if playwright_os_deps_installed; then
    deps_state="installed"
  fi
  echo "Playwright chromium install attempt ${attempt}/${max_attempts} (cache_hit=${cache_hit}, version=${version}, attempt_timeout=${attempt_timeout}, os_deps=${deps_state})"

  if [[ "$attempt" -gt 1 ]]; then
    wait_for_apt_locks "$apt_lock_wait_seconds" || true
    if [[ "$last_exit_code" -eq 124 ]]; then
      repair_apt_after_kill
    fi
    sleep $(((attempt - 1) * 20))
  fi

  exit_code=0
  if [[ "$cache_hit" == "true" ]]; then
    run_timed_in_process_group "attempt ${attempt} (cache hit path)" bash -euo pipefail -c 'install_once' || exit_code=$?
  else
    run_timed_in_process_group "attempt ${attempt} (install-deps + chromium)" bash -euo pipefail -c 'install_chromium_with_os_deps' || exit_code=$?
  fi
  last_exit_code=$exit_code

  if [[ "$exit_code" -eq 0 ]]; then
    echo "Playwright chromium install succeeded on attempt ${attempt}"
    exit 0
  fi

  if [[ "$exit_code" -eq 124 ]]; then
    echo "::warning::Playwright install attempt ${attempt} timed out after ${attempt_timeout} (process group terminated)"
  else
    echo "::warning::Playwright install attempt ${attempt} failed (exit ${exit_code})"
  fi
done

echo "::error::Playwright chromium install failed after ${max_attempts} attempts"
exit 1
