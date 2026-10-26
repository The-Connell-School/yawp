#!/usr/bin/env bash
# Remove Docker containers publishing the given host TCP ports (worktree Postgres in CI).
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/ci/release-docker-host-port.sh PORT [PORT...]

Stops and removes any running Docker container that publishes one of the listed
host ports. Used before worktree-local-setup when a prior CI step left Postgres
bound (e.g. demo feedback browser job re-bootstrap on RECORD_PORT_DATABASE).
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  exit 0
fi

port_published_by_container() {
  local cid="$1"
  local port="$2"
  docker port "$cid" 2>/dev/null | grep -qE ":${port}\$"
}

for port in "$@"; do
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    echo "Invalid port: $port" >&2
    exit 1
  fi

  mapfile -t filter_ids < <(docker ps -q --filter "publish=${port}" 2>/dev/null || true)
  for cid in "${filter_ids[@]}"; do
    [[ -n "$cid" ]] && docker rm -f "$cid" >/dev/null 2>&1 || true
  done

  mapfile -t all_ids < <(docker ps -q 2>/dev/null || true)
  for cid in "${all_ids[@]}"; do
    [[ -z "$cid" ]] && continue
    if port_published_by_container "$cid" "$port"; then
      docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
  done
done
