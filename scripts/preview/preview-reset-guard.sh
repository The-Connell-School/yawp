#!/usr/bin/env bash
set -euo pipefail

# Validates PREVIEW_RESET_DATA, the PR-label escape hatch that recreates a
# seed-mode preview database so updated seed fixtures actually reach the
# environment. Seed-mode previews are otherwise created once and preserved
# forever, which is right for demo divergence and wrong when the point of the
# PR is the seed data itself.
#
# Deliberately separate from DEMO_RESET_DATA: that one guards the shared demo
# environment, takes a verified off-host backup first, and requires the
# database name to be typed. A PR label must not be able to reach it.

PREVIEW_RESET_DATA="${PREVIEW_RESET_DATA:-false}"
: "${SLUG:?SLUG is required}"
: "${DATA_MODE:?DATA_MODE is required}"

require_preview_reset_target() {
  case "$PREVIEW_RESET_DATA" in
    true | false) ;;
    *)
      echo "PREVIEW_RESET_DATA must be true or false" >&2
      return 1
      ;;
  esac
  [[ "$PREVIEW_RESET_DATA" == "true" ]] || return 0

  [[ "$SLUG" != "demo" ]] || {
    echo "PREVIEW_RESET_DATA cannot reset the demo environment; use DEMO_RESET_DATA with its confirmation." >&2
    return 1
  }

  [[ "$DATA_MODE" == "seed" ]] || {
    echo "PREVIEW_RESET_DATA only applies to seed-mode previews (got $DATA_MODE)" >&2
    return 1
  }
}

require_preview_reset_target
