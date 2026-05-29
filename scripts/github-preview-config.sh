#!/usr/bin/env bash
# Push preview environment repository variables to GitHub.
#
# Usage:
#   PREVIEW_FORGE_HOST=203.0.113.10 PREVIEW_FORGE_DOMAIN=preview.yawp.school ./scripts/github-preview-config.sh
#   GITHUB_REPO=The-Connell-School/yawp-2.0 ./scripts/github-preview-config.sh
#
# Set PREVIEW_FORGE_SSH_PRIVATE_KEY to also update the SSH secret.
# Set PREVIEW_LOGIN_EMAIL and PREVIEW_LOGIN_PASSWORD to update the login smoke secrets.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/"
  exit 1
fi

REPO="${GITHUB_REPO:-}"
if [[ -z "$REPO" ]]; then
  if REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null); then
    :
  else
    REPO="The-Connell-School/yawp-2.0"
  fi
fi

gh_var() {
  local name="$1"
  local value="$2"
  echo "variable $name"
  gh variable set "$name" --body "$value" --repo "$REPO"
}

gh_sec() {
  local name="$1"
  local value="$2"
  echo "secret $name"
  gh secret set "$name" --body "$value" --repo "$REPO"
}

test -n "${PREVIEW_FORGE_HOST:-}" || { echo "Set PREVIEW_FORGE_HOST"; exit 1; }
test -n "${PREVIEW_FORGE_DOMAIN:-}" || { echo "Set PREVIEW_FORGE_DOMAIN"; exit 1; }

gh_var PREVIEW_FORGE_HOST "$PREVIEW_FORGE_HOST"
gh_var PREVIEW_FORGE_DOMAIN "$PREVIEW_FORGE_DOMAIN"
gh_var PREVIEW_FORGE_ROOT "${PREVIEW_FORGE_ROOT:-/srv/yawp-preview-forge}"
gh_var PREVIEW_FORGE_SSH_USER "${PREVIEW_FORGE_SSH_USER:-ec2-user}"
gh_var PREVIEW_FORGE_TLS "${PREVIEW_FORGE_TLS:-true}"
gh_var PREVIEW_FORGE_RUNTIME "${PREVIEW_FORGE_RUNTIME:-fast}"
gh_var PREVIEW_DB_DUMP_S3_URI "${PREVIEW_DB_DUMP_S3_URI:-s3://yawp-preview-videos/production.dump}"

if [[ -n "${PREVIEW_FORGE_SSH_PRIVATE_KEY:-}" ]]; then
  gh_sec PREVIEW_FORGE_SSH_PRIVATE_KEY "$PREVIEW_FORGE_SSH_PRIVATE_KEY"
fi

if [[ -n "${PREVIEW_LOGIN_EMAIL:-}" ]]; then
  gh_sec PREVIEW_LOGIN_EMAIL "$PREVIEW_LOGIN_EMAIL"
fi

if [[ -n "${PREVIEW_LOGIN_PASSWORD:-}" ]]; then
  gh_sec PREVIEW_LOGIN_PASSWORD "$PREVIEW_LOGIN_PASSWORD"
fi

echo "Done. Repo: $REPO"
