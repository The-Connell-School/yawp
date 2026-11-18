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

host_port_is_free() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    # ss -H is portable on GitHub Actions runners and returns quickly.
    ! ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(0.2)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
sys.exit(0)
PY
  else
    return 0
  fi
}

wait_for_host_port_free() {
  local port="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if host_port_is_free "$port"; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

for port in "$@"; do
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    echo "Invalid port: $port" >&2
    exit 1
  fi

  while IFS= read -r cid; do
    [[ -n "$cid" ]] && docker rm -f "$cid" >/dev/null 2>&1 || true
  done < <(docker ps -q --filter "publish=${port}" 2>/dev/null || true)

  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    if port_published_by_container "$cid" "$port"; then
      docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
  done < <(docker ps -q 2>/dev/null || true)

  wait_for_host_port_free "$port" || {
    echo "Timed out waiting for host port ${port} to become free." >&2
    exit 1
  }
done
