#!/usr/bin/env bash
# Run the Prisma CLI under Node.js. Bun 1.3.x can segfault/SIGILL when it
# substitutes for Node while executing `prisma migrate deploy` (see demo deploy).
set -euo pipefail

repo_has_prisma_package() {
  [[ -f "$1/packages/prisma/schema.prisma" ]]
}

resolve_repo_root() {
  local candidate script_dir git_root
  for candidate in "${PRISMA_CLI_REPO_ROOT:-}" "${REPO_ROOT:-}"; do
    if [[ -n "$candidate" ]] && repo_has_prisma_package "$candidate"; then
      cd "$candidate" && pwd
      return 0
    fi
  done
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  candidate="$(cd "$script_dir/../.." && pwd)"
  if repo_has_prisma_package "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi
  if repo_has_prisma_package "$PWD"; then
    cd "$PWD" && pwd
    return 0
  fi
  if command -v git >/dev/null 2>&1; then
    git_root="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ -n "$git_root" ]] && repo_has_prisma_package "$git_root"; then
      printf '%s\n' "$git_root"
      return 0
    fi
  fi
  echo "preview prisma-cli: could not resolve application repo root (set PRISMA_CLI_REPO_ROOT or REPO_ROOT)." >&2
  exit 1
}

ROOT="$(resolve_repo_root)"

node_major_version() {
  node -p 'Number(process.versions.node.split(".")[0])'
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && [[ "$(node_major_version)" -ge 22 ]]; then
    return 0
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "preview prisma-cli: Node.js 22+ is required but apt-get is unavailable." >&2
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
  if [[ "$(node_major_version)" -lt 22 ]]; then
    echo "preview prisma-cli: Node.js 22+ is required for Prisma 7." >&2
    exit 1
  fi
}

resolve_prisma_entry() {
  local candidate
  for candidate in \
    "$ROOT/packages/prisma/node_modules/prisma/build/index.js" \
    "$ROOT/node_modules/prisma/build/index.js"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "preview prisma-cli: Prisma is not installed; run bun install first." >&2
  exit 1
}

if [[ "${PREVIEW_PRISMA_CLI_PRINT_REPO_ROOT:-}" == "1" ]]; then
  printf '%s\n' "$ROOT"
  exit 0
fi

ensure_node
PRISMA_ENTRY="$(resolve_prisma_entry)"
cd "$ROOT/packages/prisma"
exec node "$PRISMA_ENTRY" "$@"
