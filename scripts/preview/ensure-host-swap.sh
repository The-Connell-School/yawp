#!/usr/bin/env bash
# Ensure a swap file exists so small hosts survive production Docker builds.
set -euo pipefail

SWAP_FILE="${HOST_SWAP_FILE:-/swapfile}"
SWAP_SIZE_MB="${HOST_SWAP_SIZE_MB:-2048}"

if swapon --show 2>/dev/null | grep -q .; then
  echo "Swap already enabled: $(swapon --show)"
  exit 0
fi

if [[ ! -f "$SWAP_FILE" ]]; then
  if ! sudo fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null; then
    sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=progress
  fi
  sudo chmod 600 "$SWAP_FILE"
  sudo mkswap "$SWAP_FILE"
fi

sudo swapon "$SWAP_FILE"
if ! grep -qF "$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

echo "Swap enabled: $(swapon --show)"
