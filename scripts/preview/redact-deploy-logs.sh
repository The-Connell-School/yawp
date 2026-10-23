#!/usr/bin/env bash
# Redact preview access codes from historical *deploy*.log files in place.
set -euo pipefail

LOG_DIR="${1:-}"
EXCLUDE_PATH=""
RECENT_MINUTES=0

usage() {
  echo "usage: redact-deploy-logs.sh LOG_DIR [--exclude PATH] [--recent-minutes N]" >&2
}

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --exclude)
      EXCLUDE_PATH="${2:-}"
      shift 2
      ;;
    --recent-minutes)
      RECENT_MINUTES="${2:-0}"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$LOG_DIR" || ! -d "$LOG_DIR" ]]; then
  echo "log directory is required" >&2
  exit 2
fi

EXCLUDE_PATH="$(readlink -f "$EXCLUDE_PATH" 2>/dev/null || true)"
if [[ -n "$EXCLUDE_PATH" && ! -f "$EXCLUDE_PATH" ]]; then
  EXCLUDE_PATH=""
fi

apply_redaction_sed() {
  sed -E \
    -e 's/(PREVIEW_ACCESS_CODE=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_SEAT_CODE_[0-9]+=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(Preview seat [0-9]+ \([^)]+\): )[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_ACCESS_SEATS=).*/\1[REDACTED]/g' \
    -e 's/(YAWP_TEST_PREVIEW_ACCESS_SEATS=).*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_MASTER_ACCESS_CODE=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_ACCESS_SECRET=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/("code"[[:space:]]*:[[:space:]]*")[^"]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_LOGIN_PASSWORD=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_POSTGRES_ADMIN_PASSWORD=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_MANAGEMENT_SERVICE_KEY=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/((DEMO_INTERNAL_API_KEYS|YAWP_INTERNAL_API_KEYS)=).*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_RESEND_API_KEY=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/((PREVIEW_)?GOOGLE_OAUTH_CLIENT_(ID|SECRET)[=:][[:space:]]*).*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_STRIPE_SECRET_KEY=)[^[:space:]]*/\1[REDACTED]/g' \
    -e 's/(PREVIEW_STRIPE_WEBHOOK_SECRET=)[^[:space:]]*/\1[REDACTED]/g'
}

count_sensitive_values() {
  local file="$1"
  local total=0
  local n

  n="$(
    grep -E 'PREVIEW_ACCESS_CODE=' "$file" 2>/dev/null \
      | grep -Ev 'PREVIEW_ACCESS_CODE=\[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E 'PREVIEW_SEAT_CODE_[0-9]+=' "$file" 2>/dev/null \
      | grep -Ev 'PREVIEW_SEAT_CODE_[0-9]+=\[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E 'Preview seat [0-9]+ \([^)]+\): ' "$file" 2>/dev/null \
      | grep -Ev 'Preview seat [0-9]+ \([^)]+\): \[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E 'PREVIEW_ACCESS_SEATS=' "$file" 2>/dev/null \
      | grep -Ev 'PREVIEW_ACCESS_SEATS=\[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E 'YAWP_TEST_PREVIEW_ACCESS_SEATS=' "$file" 2>/dev/null \
      | grep -Ev 'YAWP_TEST_PREVIEW_ACCESS_SEATS=\[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E 'PREVIEW_MASTER_ACCESS_CODE=' "$file" 2>/dev/null \
      | grep -Ev 'PREVIEW_MASTER_ACCESS_CODE=\[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E 'PREVIEW_ACCESS_SECRET=' "$file" 2>/dev/null \
      | grep -Ev 'PREVIEW_ACCESS_SECRET=\[REDACTED\]$' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))
  n="$(
    grep -E '"code"[[:space:]]*:[[:space:]]*"[^"]+"' "$file" 2>/dev/null \
      | grep -Ev '"code"[[:space:]]*:[[:space:]]*"\[REDACTED\]"' \
      | wc -l \
      | tr -d ' '
  )"
  total=$((total + n))

  printf '%s' "$total"
}

file_still_sensitive() {
  local file="$1"
  count_sensitive_values "$file" | grep -qv '^0$'
}

should_skip_file() {
  local file="$1"
  local abs now threshold

  abs="$(readlink -f "$file")"
  if [[ -n "$EXCLUDE_PATH" && "$abs" == "$EXCLUDE_PATH" ]]; then
    return 0
  fi
  if (( RECENT_MINUTES > 0 )); then
    now="$(date +%s)"
    threshold=$((now - RECENT_MINUTES * 60))
    if [[ "$(stat -c '%Y' "$file")" -ge "$threshold" ]]; then
      return 0
    fi
  fi
  return 1
}

redact_file() {
  local file="$1"
  local dir tmp mtime_ref before_lines after_lines before_count owner mode masked

  before_count="$(count_sensitive_values "$file")"
  (( before_count > 0 )) || return 1

  dir="$(dirname "$file")"
  tmp="$(mktemp "$dir/.redact-deploy-logs.XXXXXX")"
  mtime_ref="$(mktemp "$dir/.redact-deploy-logs-mtime.XXXXXX")"
  cp -p -- "$file" "$mtime_ref"
  owner="$(stat -c '%u:%g' "$file")"
  mode="$(stat -c '%a' "$file")"
  before_lines="$(wc -l < "$file")"

  if ! apply_redaction_sed < "$file" > "$tmp"; then
    rm -f -- "$tmp" "$mtime_ref"
    return 1
  fi

  after_lines="$(wc -l < "$tmp")"
  if [[ "$before_lines" != "$after_lines" ]]; then
    rm -f -- "$tmp" "$mtime_ref"
    return 1
  fi
  if file_still_sensitive "$tmp"; then
    rm -f -- "$tmp" "$mtime_ref"
    return 1
  fi

  if ! mv -- "$tmp" "$file"; then
    rm -f -- "$tmp" "$mtime_ref"
    return 1
  fi
  chown "$owner" "$file" 2>/dev/null || true
  chmod "$mode" "$file"
  touch -r "$mtime_ref" "$file"
  rm -f -- "$mtime_ref"
  masked="$before_count"
  printf '%s' "$masked"
  return 0
}

files_scanned=0
files_changed=0
values_masked=0

while IFS= read -r -d '' file; do
  files_scanned=$((files_scanned + 1))
  if should_skip_file "$file"; then
    continue
  fi
  if masked="$(redact_file "$file" 2>/dev/null)"; then
    files_changed=$((files_changed + 1))
    values_masked=$((values_masked + masked))
  fi
done < <(find "$LOG_DIR" -maxdepth 1 -type f -name '*deploy*.log' -print0 | LC_ALL=C sort -z)

printf 'files_scanned=%s\n' "$files_scanned"
printf 'files_changed=%s\n' "$files_changed"
printf 'values_masked=%s\n' "$values_masked"

exit 0
