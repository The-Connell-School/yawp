#!/usr/bin/env bash
# Prepare SSH for demo-host workflows when ssh-keyscan is flaky.
set -euo pipefail

: "${PREVIEW_HOST:?PREVIEW_HOST is required}"
: "${PREVIEW_SSH_USER:?PREVIEW_SSH_USER is required}"
: "${DEMO_SSH_PRIVATE_KEY:?DEMO_SSH_PRIVATE_KEY is required}"

mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' "$DEMO_SSH_PRIVATE_KEY" > ~/.ssh/demo_key
chmod 600 ~/.ssh/demo_key
cat >> ~/.ssh/config <<'EOF'
Host *
  ServerAliveInterval 30
  ServerAliveCountMax 120
  TCPKeepAlive yes
EOF
chmod 600 ~/.ssh/config

known_hosts_ready() {
  ssh-keygen -F "$PREVIEW_HOST" >/dev/null 2>&1
}

SSH_KEYSCAN_TYPES="${DEMO_SSH_KEYSCAN_TYPES:-ed25519,ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256}"

for attempt in 1 2 3 4 5 6 7 8; do
  if ssh-keyscan -T 10 -t "$SSH_KEYSCAN_TYPES" "$PREVIEW_HOST" >> ~/.ssh/known_hosts 2>/dev/null \
    && known_hosts_ready; then
    echo "Demo host host key captured via ssh-keyscan"
    exit 0
  fi
  if ssh -i ~/.ssh/demo_key -o BatchMode=yes -o ConnectTimeout=20 \
      -o StrictHostKeyChecking=accept-new \
      -o HostKeyAlgorithms=+ssh-rsa,ssh-ed25519,ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256 \
      "${PREVIEW_SSH_USER}@${PREVIEW_HOST}" "echo ssh-ready" >/dev/null 2>&1 \
    && known_hosts_ready; then
    echo "Demo host host key captured via first authenticated SSH probe"
    exit 0
  fi
  echo "SSH probe attempt ${attempt}/8 failed; retrying in 15s" >&2
  sleep 15
done

echo "Could not reach demo host ${PREVIEW_HOST} over SSH" >&2
exit 1
