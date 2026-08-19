#!/usr/bin/env bash
# Cloud Agent start: per-boot runtime reconciliation.
# Ensures the native Postgres cluster is online, then returns.
set -euo pipefail

PG_VERSION="$(ls /usr/lib/postgresql/ | sort -n | tail -1)"

if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true
fi

for _ in $(seq 1 60); do
  if sudo -u postgres pg_isready -q; then
    echo "Postgres is online."
    exit 0
  fi
  sleep 1
done

echo "Postgres did not become ready in time." >&2
exit 1
