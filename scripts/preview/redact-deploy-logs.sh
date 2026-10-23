#!/usr/bin/env bash
# Redact preview access codes from historical *deploy*.log files in place.
set -euo pipefail

LOG_DIR="${1:-}"
EXCLUDE_PATH=""
ONLY_PATH=""
RECENT_MINUTES=0
REQUIRE_EXIT=true

# Matches packages/prisma/preview-access-code.ts PREVIEW_ACCESS_CODE_PATTERN
PREVIEW_SEAT_CODE_RE='[a-z]+-[a-z]+-[1-9][0-9]{3}'
# Matches deploy.sh PREVIEW_MASTER_ACCESS_CODE validation (lowercase hyphenated slug)
PREVIEW_MASTER_CODE_RE='[a-z][a-z0-9]*(-[a-z0-9]+)+'
ACCESS_CODE_VALUE_RE="${PREVIEW_SEAT_CODE_RE}|${PREVIEW_MASTER_CODE_RE}"

SUMMARY_FILE=""
TEMP_FILE=""

cleanup_temps() {
  if [[ -n "$TEMP_FILE" ]]; then
    rm -f -- "$TEMP_FILE"
  fi
}
trap cleanup_temps EXIT TERM INT

usage() {
  echo "usage: redact-deploy-logs.sh LOG_DIR [--exclude PATH] [--only PATH] [--recent-minutes N] [--no-require-exit]" >&2
}

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --exclude)
      EXCLUDE_PATH="${2:-}"
      shift 2
      ;;
    --only)
      ONLY_PATH="${2:-}"
      shift 2
      ;;
    --recent-minutes)
      RECENT_MINUTES="${2:-0}"
      shift 2
      ;;
    --no-require-exit)
      REQUIRE_EXIT=false
      shift
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

LOG_DIR_REAL="$(readlink -f "$LOG_DIR")"
SUMMARY_FILE="${LOG_DIR_REAL}/redact-deploy-logs.last"

resolve_path() {
  local target="$1"
  [[ -n "$target" ]] || return 1
  readlink -f "$target" 2>/dev/null || true
}

if [[ -n "$EXCLUDE_PATH" ]]; then
  EXCLUDE_PATH="$(resolve_path "$EXCLUDE_PATH")"
  [[ -f "$EXCLUDE_PATH" ]] || EXCLUDE_PATH=""
fi
if [[ -n "$ONLY_PATH" ]]; then
  ONLY_PATH="$(resolve_path "$ONLY_PATH")"
  [[ -f "$ONLY_PATH" ]] || ONLY_PATH=""
fi

cleanup_stale_temps() {
  find "$LOG_DIR" -maxdepth 1 -type f -name '.redact-deploy-logs.*' -mmin +10 -delete 2>/dev/null || true
}

apply_redaction_sed() {
  sed -E \
    -e "s/(PREVIEW_ACCESS_CODE=)(${ACCESS_CODE_VALUE_RE})(\\r)?/\\1[REDACTED]\\3/g" \
    -e "s/(PREVIEW_SEAT_CODE_[0-9]+=)(${PREVIEW_SEAT_CODE_RE})/\\1[REDACTED]/g" \
    -e "s/(Preview seat [0-9]+ \\([^)]+\\): )(${PREVIEW_SEAT_CODE_RE})/\\1[REDACTED]/g" \
    -e "s/(PREVIEW_MASTER_ACCESS_CODE=)(${PREVIEW_MASTER_CODE_RE})/\\1[REDACTED]/g" \
    -e 's/(PREVIEW_ACCESS_SECRET=)[^[:space:]]*/\1[REDACTED]/g' \
    -e "s/\"code\"[[:space:]]*:[[:space:]]*\"(${PREVIEW_SEAT_CODE_RE})\"/\"code\":\"[REDACTED]\"/g" \
    -e "s/\"code\"[[:space:]]*:[[:space:]]*\"(${PREVIEW_MASTER_CODE_RE})\"/\"code\":\"[REDACTED]\"/g" \
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

  n="$(grep -oE "PREVIEW_ACCESS_CODE=(${ACCESS_CODE_VALUE_RE})" "$file" 2>/dev/null | wc -l | tr -d ' ')"
  total=$((total + n))
  n="$(grep -oE "PREVIEW_SEAT_CODE_[0-9]+=(${PREVIEW_SEAT_CODE_RE})" "$file" 2>/dev/null | wc -l | tr -d ' ')"
  total=$((total + n))
  n="$(grep -oE "Preview seat [0-9]+ \\([^)]+\\): (${PREVIEW_SEAT_CODE_RE})" "$file" 2>/dev/null | wc -l | tr -d ' ')"
  total=$((total + n))
  n="$(grep -oE "PREVIEW_MASTER_ACCESS_CODE=(${PREVIEW_MASTER_CODE_RE})" "$file" 2>/dev/null | wc -l | tr -d ' ')"
  total=$((total + n))
  n="$(grep -oE 'PREVIEW_ACCESS_SECRET=[^[:space:]]+' "$file" 2>/dev/null | grep -Ev 'PREVIEW_ACCESS_SECRET=\[REDACTED\]' | wc -l | tr -d ' ')"
  total=$((total + n))
  n="$(grep -oE "\"code\"[[:space:]]*:[[:space:]]*\"(${ACCESS_CODE_VALUE_RE})\"" "$file" 2>/dev/null | wc -l | tr -d ' ')"
  total=$((total + n))

  printf '%s' "$total"
}

file_still_sensitive() {
  local file="$1"
  [[ "$(count_sensitive_values "$file")" != "0" ]]
}

file_within_log_dir() {
  local file="$1"
  local abs
  abs="$(resolve_path "$file")"
  [[ -n "$abs" && "$abs" == "${LOG_DIR_REAL}/"* ]]
}

should_skip_file() {
  local file="$1"
  local abs now threshold

  if [[ -L "$file" ]]; then
    return 0
  fi
  if ! file_within_log_dir "$file"; then
    return 0
  fi

  abs="$(resolve_path "$file")"
  if [[ -n "$EXCLUDE_PATH" && "$abs" == "$EXCLUDE_PATH" ]]; then
    return 0
  fi
  if [[ -n "$ONLY_PATH" && "$abs" != "$ONLY_PATH" ]]; then
    return 0
  fi
  if [[ "$REQUIRE_EXIT" == true && ! -f "${file}.exit" ]]; then
    return 0
  fi
  if (( RECENT_MINUTES > 0 )) && [[ -z "$ONLY_PATH" ]]; then
    now="$(date +%s)"
    threshold=$((now - RECENT_MINUTES * 60))
    if [[ "$(stat -c '%Y' "$file")" -ge "$threshold" ]]; then
      return 0
    fi
  fi
  return 1
}

count_file_lines() {
  wc -l < "$1" | tr -d ' '
}

redact_file() {
  local file="$1"
  local dir tmp owner mode before_lines after_lines before_count mtime_epoch

  before_count="$(count_sensitive_values "$file")"
  (( before_count > 0 )) || return 1

  dir="$(dirname "$file")"
  tmp="$(mktemp "$dir/.redact-deploy-logs.XXXXXX")"
  TEMP_FILE="$tmp"
  owner="$(stat -c '%u:%g' "$file")"
  mode="$(stat -c '%a' "$file")"
  mtime_epoch="$(stat -c '%Y' "$file")"
  before_lines="$(count_file_lines "$file")"

  if ! apply_redaction_sed < "$file" > "$tmp"; then
    rm -f -- "$tmp"
    TEMP_FILE=""
    return 1
  fi

  after_lines="$(count_file_lines "$tmp")"
  if [[ "$before_lines" != "$after_lines" ]]; then
    rm -f -- "$tmp"
    TEMP_FILE=""
    return 1
  fi
  if file_still_sensitive "$tmp"; then
    rm -f -- "$tmp"
    TEMP_FILE=""
    return 1
  fi

  if ! chown "$owner" "$tmp" 2>/dev/null; then
    rm -f -- "$tmp"
    TEMP_FILE=""
    return 1
  fi
  if ! mv -- "$tmp" "$file"; then
    rm -f -- "$tmp"
    TEMP_FILE=""
    return 1
  fi
  TEMP_FILE=""
  chmod "$mode" "$file"
  touch -d "@${mtime_epoch}" "$file"
  REDACT_LAST_MASKED="$before_count"
  return 0
}

write_summary() {
  local warning="${1:-0}"
  local tmp_summary
  tmp_summary="$(mktemp "${LOG_DIR_REAL}/.redact-summary.XXXXXX")"
  {
    printf 'REDACT_TIMESTAMP=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'REDACT_FILES_SCANNED=%s\n' "$files_scanned"
    printf 'REDACT_FILES_CHANGED=%s\n' "$files_changed"
    printf 'REDACT_VALUES_MASKED=%s\n' "$values_masked"
    if [[ "$warning" != "0" ]]; then
      printf 'REDACT_WARNING=1\n'
    fi
  } > "$tmp_summary"
  mv -- "$tmp_summary" "$SUMMARY_FILE"
}

cleanup_stale_temps

files_scanned=0
files_changed=0
values_masked=0
REDACT_LAST_MASKED=0
warning=0

collect_files() {
  if [[ -n "$ONLY_PATH" ]]; then
    printf '%s\0' "$ONLY_PATH"
    return
  fi
  find "$LOG_DIR" -maxdepth 1 -type f -name '*deploy*.log' -print0 | LC_ALL=C sort -z
}

while IFS= read -r -d '' file; do
  files_scanned=$((files_scanned + 1))
  if should_skip_file "$file"; then
    continue
  fi
  if redact_file "$file"; then
    files_changed=$((files_changed + 1))
    values_masked=$((values_masked + REDACT_LAST_MASKED))
  fi
done < <(collect_files)

write_summary "$warning" || warning=1

printf 'files_scanned=%s\n' "$files_scanned"
printf 'files_changed=%s\n' "$files_changed"
printf 'values_masked=%s\n' "$values_masked"

exit 0
