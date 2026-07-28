#!/usr/bin/env bash
set -euo pipefail

# Writes the preview deploy key and records the preview host's SSH host key.
#
# This used to be an inline `ssh-keyscan -H "$PREVIEW_HOST" >> known_hosts` in
# every preview job. One unanswered scan failed the workflow with a bare
# "Process completed with exit code 1" and no indication that the host was
# simply unreachable, which is the single most common preview failure. Scanning
# is retried, and a host that never answers now says so.
#
# PREVIEW_SSH_DIR / PREVIEW_SSH_KEYSCAN / PREVIEW_SSH_KEYSCAN_ATTEMPTS /
# PREVIEW_SSH_KEYSCAN_DELAY exist so tests can drive this without a network.

host="${PREVIEW_HOST:-}"
private_key="${PREVIEW_SSH_PRIVATE_KEY:-}"
ssh_dir="${PREVIEW_SSH_DIR:-$HOME/.ssh}"
keyscan="${PREVIEW_SSH_KEYSCAN:-ssh-keyscan}"
attempts="${PREVIEW_SSH_KEYSCAN_ATTEMPTS:-5}"
delay="${PREVIEW_SSH_KEYSCAN_DELAY:-5}"
port="${PREVIEW_SSH_PORT:-22}"

if [[ -z "$host" ]]; then
  echo "Missing PREVIEW_HOST; set the repository variable PREVIEW_HOST." >&2
  exit 1
fi

if [[ -z "$private_key" ]]; then
  echo "Missing PREVIEW_SSH_PRIVATE_KEY; set the repository secret PREVIEW_SSH_PRIVATE_KEY." >&2
  exit 1
fi

mkdir -p "$ssh_dir"
chmod 700 "$ssh_dir"
printf '%s\n' "$private_key" > "$ssh_dir/preview_key"
chmod 600 "$ssh_dir/preview_key"

scanned="$(mktemp)"
trap 'rm -f "$scanned"' EXIT

for attempt in $(seq 1 "$attempts"); do
  # ssh-keyscan can exit 0 having collected nothing, so trust the output only.
  if "$keyscan" -T 10 -p "$port" -H "$host" > "$scanned" 2>/dev/null && [[ -s "$scanned" ]]; then
    cat "$scanned" >> "$ssh_dir/known_hosts"
    exit 0
  fi

  echo "Attempt ${attempt}/${attempts}: no SSH host key from ${host}:${port}."
  if [[ "$attempt" -lt "$attempts" ]]; then
    sleep "$delay"
  fi
done

cat >&2 <<MESSAGE
Preview host ${host} did not answer SSH on port ${port} after ${attempts} attempts.

The preview deploy cannot continue. Check, in order:
  - the preview EC2 instance is running and healthy
  - PREVIEW_HOST still matches its address (it changes on stop/start without an
    Elastic IP)
  - the security group still allows SSH from GitHub Actions runners
MESSAGE
exit 1
