#!/usr/bin/env bash
# Tear down demo-feedback CI worktree Postgres/dev server before the next fixture step.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PORTS=("$@")
if [[ ${#PORTS[@]} -eq 0 ]]; then
  PORTS=(54489 54490 5489 5490)
fi

"$ROOT/bin/project" dev stop --json >/dev/null 2>&1 || true

if [[ -f .worktree-local/config.env ]]; then
  # shellcheck disable=SC1091
  source .worktree-local/config.env
  docker rm -f "${CONTAINER_NAME:-}" >/dev/null 2>&1 || true
  if [[ -n "${VOLUME_NAME:-}" ]]; then
    docker volume rm "${VOLUME_NAME}" >/dev/null 2>&1 || true
  fi
fi

bash "$ROOT/scripts/ci/release-docker-host-port.sh" "${PORTS[@]}"
