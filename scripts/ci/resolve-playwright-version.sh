#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
grep -oP '"@playwright/test": \["@playwright/test@\K[^"]+' "$repo_root/bun.lock" | head -1
