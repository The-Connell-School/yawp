#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-}"

cleanup_tester_feedback_backup() {
  local backup_file="${DEMO_TESTER_FEEDBACK_BACKUP_FILE:-${BACKUP_FILE:-}}"
  local backup_dir=""
  if [[ -n "$backup_file" ]]; then
    backup_dir="$(dirname "$backup_file")"
    rm -f "$backup_file"
    rmdir "$backup_dir" 2>/dev/null || true
  fi
}

case "$COMMAND" in
  export)
    PREVIEW_ROOT="${PREVIEW_ROOT:?PREVIEW_ROOT is required}"
    DATABASE_NAME="${DATABASE_NAME:?DATABASE_NAME is required}"
    [[ "$DATABASE_NAME" == "yawp_demo" ]] || {
      echo "Tester feedback preservation is limited to yawp_demo" >&2
      exit 1
    }
    mkdir -p "$PREVIEW_ROOT/backups"
    chmod 700 "$PREVIEW_ROOT/backups"
    backup_file="$(node "$SCRIPT_DIR/preserve-demo-tester-feedback.mjs" export | tr -d '[:space:]')"
    if [[ -n "$backup_file" ]]; then
      [[ "$backup_file" == "$PREVIEW_ROOT"/backups/.tester-feedback-restore-* ]] || {
        echo "Unexpected tester feedback backup path" >&2
        exit 1
      }
      printf '%s\n' "$backup_file"
    fi
    ;;
  restore)
    DATABASE_NAME="${DATABASE_NAME:?DATABASE_NAME is required}"
    BACKUP_FILE="${BACKUP_FILE:?BACKUP_FILE is required}"
    [[ "$DATABASE_NAME" == "yawp_demo" ]] || {
      echo "Tester feedback preservation is limited to yawp_demo" >&2
      exit 1
    }
    [[ -f "$BACKUP_FILE" && ! -L "$BACKUP_FILE" ]] || {
      echo "Tester feedback backup must be a regular non-symlink file" >&2
      exit 1
    }
    node "$SCRIPT_DIR/preserve-demo-tester-feedback.mjs" restore
    cleanup_tester_feedback_backup
    ;;
  cleanup)
    cleanup_tester_feedback_backup
    ;;
  *)
    echo "Usage: preserve-demo-tester-feedback.sh export|restore|cleanup" >&2
    exit 2
    ;;
esac
