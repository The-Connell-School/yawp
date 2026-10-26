#!/usr/bin/env bash
set -euo pipefail

cache_hit="${1:-false}"
max_attempts=2
attempt_timeout_default="${PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT:-12m}"
attempt_timeout_max="${PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT_MAX:-20m}"
apt_lock_wait_seconds="${PLAYWRIGHT_APT_LOCK_WAIT_SECONDS:-60}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$("$repo_root/scripts/ci/resolve-playwright-version.sh")"

SCRIPT_PGID="$(ps -o pgid= -p $$ | tr -d ' ')"
SCRIPT_SID="$(ps -o sid= -p $$ | tr -d ' ')"
SCRIPT_PID=$$

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
  local sec=""
  if [[ "$spec" =~ ^([0-9]+)m$ ]]; then
    sec=$((10#${BASH_REMATCH[1]} * 60))
  elif [[ "$spec" =~ ^([0-9]+)s$ ]]; then
    sec=$((10#${BASH_REMATCH[1]}))
  elif [[ "$spec" =~ ^[0-9]+$ ]]; then
    sec=$((10#${spec}))
  else
    echo "::error::Unsupported timeout spec: ${spec}" >&2
    return 1
  fi
  if (( sec < 1 )); then
    echo "::error::Playwright install timeout must be at least 1 second (got: ${spec})" >&2
    return 1
  fi
  echo "$sec"
  return 0
}

seconds_to_timeout_spec() {
  local sec="$1"
  if (( sec >= 60 && sec % 60 == 0 )); then
    echo "$((sec / 60))m"
    return 0
  fi
  echo "${sec}s"
}

clamp_attempt_timeout() {
  local requested="$1"
  local max_spec="$2"
  local req_sec max_sec
  req_sec="$(timeout_to_seconds "$requested")" || return 1
  max_sec="$(timeout_to_seconds "$max_spec")" || return 1
  if (( req_sec > max_sec )); then
    echo "::warning::PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT=${requested} exceeds max ${max_spec}; using ${max_spec}" >&2
    seconds_to_timeout_spec "$max_sec"
    return 0
  fi
  echo "$requested"
}

attempt_timeout="$(clamp_attempt_timeout "$attempt_timeout_default" "$attempt_timeout_max")"

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

child_setsid_pgid_poll_seconds="${PLAYWRIGHT_PGID_POLL_SECONDS:-5}"

read_child_setsid_pgid() {
  local pid="$1"
  local poll_seconds="${2:-$child_setsid_pgid_poll_seconds}"
  local deadline=$((SECONDS + poll_seconds))
  local pgid=""

  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo ""
      return 1
    fi
    pgid="$(read_pgid_for_pid "$pid")"
    if [[ -n "$pgid" && "$pgid" == "$pid" ]]; then
      echo "$pgid"
      return 0
    fi
    sleep 0.1
  done

  pgid="$(read_pgid_for_pid "$pid")"
  if [[ -n "$pgid" && "$pgid" == "$pid" ]]; then
    echo "$pgid"
    return 0
  fi
  echo ""
  return 1
}

read_sid_for_pid() {
  local pid="$1"
  ps -o sid= -p "$pid" 2>/dev/null | tr -d ' ' || true
}

wait_bounded_for_pid() {
  local pid="$1"
  local max_sec="$2"
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null && (( elapsed < max_sec )); do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  wait "$pid" 2>/dev/null || true
}

may_pkill_leader_session() {
  local sid="$1"
  local leader_pid="$2"
  [[ -n "$sid" && -n "$leader_pid" && "$sid" == "$leader_pid" && "$sid" != "$SCRIPT_SID" ]]
}

signal_pid_tree() {
  local pid="$1"
  local sig="$2"
  local child

  while IFS= read -r child; do
    [[ -z "$child" ]] && continue
    signal_pid_tree "$child" "$sig"
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  if have_passwordless_sudo; then
    sudo -n kill "-${sig}" -- "$pid" 2>/dev/null || true
  else
    kill "-${sig}" -- "$pid" 2>/dev/null || true
  fi
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
    timeout -k 10 60 sudo -n dpkg --configure -a || true
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
    sid="$(read_sid_for_pid "$leader_pid")"
  fi

  if have_passwordless_sudo; then
    sudo -n kill -TERM -- "-${pgid}" 2>/dev/null || true
    if may_pkill_leader_session "$sid" "$leader_pid"; then
      sudo -n pkill -TERM -s "$sid" 2>/dev/null || true
    fi
    sleep 5
    sudo -n kill -KILL -- "-${pgid}" 2>/dev/null || true
    if may_pkill_leader_session "$sid" "$leader_pid"; then
      sudo -n pkill -KILL -s "$sid" 2>/dev/null || true
    fi
    return 0
  fi

  kill -TERM -- "-${pgid}" 2>/dev/null || true
  sleep 5
  kill -KILL -- "-${pgid}" 2>/dev/null || true
  return 0
}

stop_leader_pid_tree() {
  local pid="$1"

  signal_pid_tree "$pid" TERM
  sleep 5
  if kill -0 "$pid" 2>/dev/null; then
    signal_pid_tree "$pid" KILL
  fi
}

terminate_timed_out_leader() {
  local label="$1"
  local pid="$2"
  local killed=0

  echo "${label}: timed out after ${attempt_timeout}; re-reading pgid for pid=${pid}"
  local pgid=""
  pgid="$(read_child_setsid_pgid "$pid")" || true
  echo "${label}: timeout pgid=${pgid:-unknown} (expected pgid==pid=${pid}, script_pgid=${SCRIPT_PGID})"

  if [[ -n "$pgid" && "$pgid" == "$pid" ]] && ! pgid_is_unsafe_to_kill "$pgid"; then
    if stop_process_group "$pgid" "$pid"; then
      killed=1
      echo "${label}: sent TERM/KILL to process group ${pgid}"
    fi
  fi

  if [[ "$killed" -eq 0 ]] && kill -0 "$pid" 2>/dev/null; then
    echo "${label}: falling back to leader pid and descendant kill (pid=${pid})"
    stop_leader_pid_tree "$pid"
    killed=1
  fi

  wait_bounded_for_pid "$pid" 10
  PLAYWRIGHT_LAST_KILL_APPLIED=$killed
  export PLAYWRIGHT_LAST_KILL_APPLIED
}

run_timed_in_process_group() {
  local label="$1"
  shift

  PLAYWRIGHT_LAST_KILL_APPLIED=0
  export PLAYWRIGHT_LAST_KILL_APPLIED

  local deadline_sec
  deadline_sec="$(timeout_to_seconds "$attempt_timeout")"

  setsid "$@" > >(tee >&2) 2>&1 &
  local pid=$!
  local pgid=""
  pgid="$(read_child_setsid_pgid "$pid")" || true
  echo "${label}: started pid=${pid} pgid=${pgid:-unknown} (attempt_timeout=${attempt_timeout}, script_pgid=${SCRIPT_PGID})"

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
    terminate_timed_out_leader "$label" "$pid"
    return 124
  fi

  wait "$pid" || rc=$?
  return "$rc"
}

verify_chromium_launch() {
  : >"$launch_log"
  if (cd "$repo_root" && bun -e "
import { chromium } from 'playwright';
import { logScriptError } from './services/web-app/app/utils/log-script-error.server.ts';
(async () => {
  const browser = await chromium.launch({ headless: true });
  await browser.close();
})().catch((err) => {
  logScriptError(err);
  process.exit(1);
});
") 2>"$launch_log"; then
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
    if [[ "${PLAYWRIGHT_LAST_KILL_APPLIED:-0}" -eq 1 ]]; then
      echo "::warning::Playwright install attempt ${attempt} timed out after ${attempt_timeout} (install process terminated)"
    else
      echo "::warning::Playwright install attempt ${attempt} timed out after ${attempt_timeout} (could not confirm install process termination)"
    fi
  else
    echo "::warning::Playwright install attempt ${attempt} failed (exit ${exit_code})"
  fi
done

echo "::error::Playwright chromium install failed after ${max_attempts} attempts"
exit 1
