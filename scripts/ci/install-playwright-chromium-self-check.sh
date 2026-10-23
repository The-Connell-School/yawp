#!/usr/bin/env bash
# Sourced when PLAYWRIGHT_INSTALL_SELF_CHECK=1. Expects run_timed_in_process_group,
# timeout_to_seconds, attempt_timeout, and SCRIPT_PGID from install-playwright-chromium.sh.

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

echo "Running install-playwright-chromium self-check (timeout + exit code)"

attempt_timeout="3s"
export attempt_timeout

rc=0
run_timed_in_process_group "self-check hang" bash -c 'sleep 30' || rc=$?
assert_eq "hanging command returns 124" "$rc" "124"

rc=0
run_timed_in_process_group "self-check success" bash -c 'echo ok-self-check' || rc=$?
assert_eq "successful command returns 0" "$rc" "0"

if [[ "$self_check_failures" -gt 0 ]]; then
  echo "SELF_CHECK: ${self_check_failures} failure(s)" >&2
  exit 1
fi

echo "SELF_CHECK: all checks passed"
exit 0
