#!/usr/bin/env bash
# Sourced when PLAYWRIGHT_INSTALL_SELF_CHECK=1. Expects run_timed_in_process_group,
# stop_leader_pid_tree, wait_bounded_for_pid, SCRIPT_PGID, SCRIPT_SID, SCRIPT_PID.

set -euo pipefail

self_check_failures=0

assert_eq() {
  local label="$1"
  local got="$2"
  local want="$3"
  if [[ "$got" != "$want" ]]; then
    echo "SELF_CHECK FAIL: ${label} (got=${got}, want=${want})" >&2
    self_check_failures=$((self_check_failures + 1))
  else
    echo "SELF_CHECK OK: ${label}"
  fi
}

assert_true() {
  local label="$1"
  if eval "$2"; then
    echo "SELF_CHECK OK: ${label}"
  else
    echo "SELF_CHECK FAIL: ${label}" >&2
    self_check_failures=$((self_check_failures + 1))
  fi
}

echo "Running install-playwright-chromium self-check (timeout + exit code)"

attempt_timeout="3s"
export attempt_timeout

rc=0
run_timed_in_process_group "self-check hang" bash -c 'sleep 30' || rc=$?
assert_eq "hanging command returns 124" "$rc" "124"

rc=0
run_timed_in_process_group "self-check success" bash -c 'echo ok-self-check' || rc=$?
assert_eq "successful command returns 0" "$rc" "0"

echo "self-check non-setsid fallback must not signal the script session"
sleep 300 &
sibling_pid=$!
bash -c 'sleep 120' &
leader_pid=$!
sleep 0.5

script_pgid_before="$(ps -o pgid= -p "$SCRIPT_PID" | tr -d ' ')"
script_sid_before="$(ps -o sid= -p "$SCRIPT_PID" | tr -d ' ')"

stop_leader_pid_tree "$leader_pid"
wait_bounded_for_pid "$leader_pid" 10

assert_true "script pid still alive" "kill -0 \"$SCRIPT_PID\" 2>/dev/null"
assert_true "dummy sibling still alive" "kill -0 \"$sibling_pid\" 2>/dev/null"
assert_eq "script pgid unchanged" "$(ps -o pgid= -p "$SCRIPT_PID" | tr -d ' ')" "$script_pgid_before"
assert_eq "script sid unchanged" "$(ps -o sid= -p "$SCRIPT_PID" | tr -d ' ')" "$script_sid_before"

kill "$sibling_pid" 2>/dev/null || true
wait "$sibling_pid" 2>/dev/null || true

if [[ "$self_check_failures" -gt 0 ]]; then
  echo "SELF_CHECK: ${self_check_failures} failure(s)" >&2
  exit 1
fi

echo "SELF_CHECK: all checks passed"
exit 0
