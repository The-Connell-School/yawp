#!/usr/bin/env bash
# Cloud Agent start: per-boot runtime reconciliation.
# Ensures the native Postgres cluster is installed and online, then returns.
set -euo pipefail

if ! ls /usr/lib/postgresql/ >/dev/null 2>&1; then
  for attempt in 1 2 3 4 5; do
    sudo apt-get update -qq -o Acquire::Retries=3 && \
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        -o Acquire::Retries=3 --fix-missing postgresql postgresql-contrib && break
    echo "apt install attempt ${attempt} failed; retrying..." >&2
    sleep $((attempt * 4))
  done
fi

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
