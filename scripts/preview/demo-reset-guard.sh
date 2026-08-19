#!/usr/bin/env bash
set -euo pipefail

DEMO_RESET_DATA="${DEMO_RESET_DATA:-false}"
DEMO_RESET_CONFIRMATION="${DEMO_RESET_CONFIRMATION:-}"
: "${SLUG:?SLUG is required}"
: "${DATABASE_NAME:?DATABASE_NAME is required}"

require_demo_reset_confirmation() {
  case "$DEMO_RESET_DATA" in
    true|false) ;;
    *) echo "DEMO_RESET_DATA must be true or false" >&2; return 1 ;;
  esac
  [[ "$DEMO_RESET_DATA" == "true" ]] || return 0
  [[ "$SLUG" == "demo" && "$DATABASE_NAME" == "yawp_demo" ]] || {
    echo "DEMO_RESET_DATA may only reset the demo database yawp_demo" >&2
    return 1
  }
  local expected="RESET ${DATABASE_NAME}"
  [[ "$DEMO_RESET_CONFIRMATION" == "$expected" ]] || {
    echo "Refusing demo reset without DEMO_RESET_CONFIRMATION=$expected" >&2
    return 1
  }
}

require_demo_reset_confirmation
