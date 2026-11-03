#!/usr/bin/env bash
# CI helper: run `bun install --frozen-lockfile` with a per-attempt wall clock limit
# and one retry when the install stalls (network/registry hang). Real lockfile or
# resolution errors fail immediately without a retry.
set -euo pipefail

max_attempts=2
attempt_timeout_default="${BUN_INSTALL_ATTEMPT_TIMEOUT:-10m}"
attempt_timeout_max="${BUN_INSTALL_ATTEMPT_TIMEOUT_MAX:-15m}"
retry_backoff_seconds="${BUN_INSTALL_RETRY_BACKOFF_SECONDS:-15}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SCRIPT_PGID="$(ps -o pgid= -p $$ | tr -d ' ')"
SCRIPT_PID=$$

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
    echo "::error::Bun install timeout must be at least 1 second (got: ${spec})" >&2
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
    echo "::warning::BUN_INSTALL_ATTEMPT_TIMEOUT=${requested} exceeds max ${max_spec}; using ${max_spec}" >&2
    seconds_to_timeout_spec "$max_sec"
    return 0
  fi
  echo "$requested"
}

attempt_timeout="$(clamp_attempt_timeout "$attempt_timeout_default" "$attempt_timeout_max")"

read_pgid_for_pid() {
  local pid="$1"
  ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' '
}

pgid_is_unsafe_to_kill() {
  local pgid="$1"
  [[ -z "$pgid" || "$pgid" == "0" || "$pgid" == "1" || "$pgid" == "$SCRIPT_PGID" ]]
}

child_setsid_pgid_poll_seconds="${BUN_INSTALL_PGID_POLL_SECONDS:-5}"

read_child_setsid_pgid() {
  local pid="$1"
  local poll_seconds="${2:-$child_setsid_pgid_poll_seconds}"
  local deadline=$((SECONDS + poll_seconds))
  local pgid=""

  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo ""
      return 0
    fi
    pgid="$(read_pgid_for_pid "$pid")"
    if [[ -n "$pgid" && "$pgid" == "$pid" ]]; then
      echo "$pgid"
      return 0
    fi
    sleep 0.2
  done
  read_pgid_for_pid "$pid"
}

wait_bounded_for_pid() {
  local pid="$1"
  local max_wait="$2"
  local deadline=$((SECONDS + max_wait))
  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 0.2
  done
  return 0
}

signal_pid_tree() {
  local pid="$1"
  local sig="$2"
  kill "-${sig}" "$pid" 2>/dev/null || true
  local children=""
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  if [[ -n "$children" ]]; then
    while read -r child; do
      [[ -n "$child" ]] && signal_pid_tree "$child" "$sig"
    done <<<"$children"
  fi
}

stop_process_group() {
  local pgid="$1"
  local leader_pid="$2"
  kill "-TERM" "-${pgid}" 2>/dev/null || kill -TERM "$leader_pid" 2>/dev/null || true
  sleep 2
  if kill -0 "$leader_pid" 2>/dev/null; then
    kill "-KILL" "-${pgid}" 2>/dev/null || kill -KILL "$leader_pid" 2>/dev/null || true
  fi
}

stop_leader_pid_tree() {
  local pid="$1"
  signal_pid_tree "$pid" TERM
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    signal_pid_tree "$pid" KILL
  fi
}

BUN_INSTALL_LAST_KILL_APPLIED=0

terminate_timed_out_leader() {
  local label="$1"
  local pid="$2"
  local killed=0

  echo "${label}: timed out after ${attempt_timeout}; re-reading pgid for pid=${pid}"
  local pgid=""
  pgid="$(read_child_setsid_pgid "$pid")" || true
  echo "${label}: timeout pgid=${pgid:-unknown} (expected pgid==pid=${pid}, script_pgid=${SCRIPT_PGID})"

  if [[ -n "$pgid" && "$pgid" == "$pid" ]] && ! pgid_is_unsafe_to_kill "$pgid"; then
    stop_process_group "$pgid" "$pid"
    killed=1
    echo "${label}: sent TERM/KILL to process group ${pgid}"
  fi

  if [[ "$killed" -eq 0 ]] && kill -0 "$pid" 2>/dev/null; then
    echo "${label}: falling back to leader pid and descendant kill (pid=${pid})"
    stop_leader_pid_tree "$pid"
    killed=1
  fi

  wait_bounded_for_pid "$pid" 10 || true
  BUN_INSTALL_LAST_KILL_APPLIED=$killed
}

run_timed_in_process_group() {
  local label="$1"
  shift

  BUN_INSTALL_LAST_KILL_APPLIED=0

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

run_bun_install() {
  cd "$repo_root"
  bun install --frozen-lockfile
}

if [[ "${BUN_INSTALL_SELF_CHECK:-}" == "1" ]]; then
  rc=0
  run_timed_in_process_group "self-check hang" bash -c 'sleep 30' || rc=$?
  [[ "$rc" == "124" ]] || {
    echo "SELF_CHECK FAIL: expected hang to return 124 (got ${rc})" >&2
    exit 1
  }
  rc=0
  run_timed_in_process_group "self-check success" bash -c 'echo ok-self-check' || rc=$?
  [[ "$rc" == "0" ]] || {
    echo "SELF_CHECK FAIL: expected success to return 0 (got ${rc})" >&2
    exit 1
  }
  echo "SELF_CHECK: bun-install-frozen timing checks passed"
  exit 0
fi

export repo_root
export -f run_bun_install

last_exit_code=0
for attempt in $(seq 1 "$max_attempts"); do
  echo "Bun install attempt ${attempt}/${max_attempts} (attempt_timeout=${attempt_timeout}, frozen lockfile)"

  if [[ "$attempt" -gt 1 ]]; then
    echo "Retrying bun install after prior attempt exit ${last_exit_code}"
    sleep $(((attempt - 1) * retry_backoff_seconds))
  fi

  exit_code=0
  run_timed_in_process_group "attempt ${attempt}" bash -euo pipefail -c 'run_bun_install' || exit_code=$?
  last_exit_code=$exit_code

  if [[ "$exit_code" -eq 0 ]]; then
    echo "Bun install succeeded on attempt ${attempt}"
    exit 0
  fi

  if [[ "$exit_code" -ne 124 ]]; then
    echo "::error::bun install --frozen-lockfile failed with exit ${exit_code} (not retrying non-timeout failures)"
    exit "$exit_code"
  fi

  if [[ "${BUN_INSTALL_LAST_KILL_APPLIED:-0}" -eq 1 ]]; then
    echo "::warning::Bun install attempt ${attempt} timed out after ${attempt_timeout} (install process terminated)"
  else
    echo "::warning::Bun install attempt ${attempt} timed out after ${attempt_timeout} (could not confirm install process termination)"
  fi
done

echo "::error::bun install --frozen-lockfile failed after ${max_attempts} attempts (stall/timeouts)"
exit 1
