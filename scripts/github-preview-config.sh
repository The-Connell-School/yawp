#!/usr/bin/env bash
# Push preview environment repository variables to GitHub.
#
# Usage:
#   PREVIEW_HOST=203.0.113.10 PREVIEW_DOMAIN=preview.yawp.school ./scripts/github-preview-config.sh
#   GITHUB_REPO=The-Connell-School/yawp-2.0 ./scripts/github-preview-config.sh
#
# Set PREVIEW_SSH_PRIVATE_KEY to also update the SSH secret.
# Set PREVIEW_DATA_MODE=production-dump to opt back into production-copy preview data.
# Set PREVIEW_DEV_LOGIN_EMAIL to choose the seeded dev persona used by smoke tests.
# Set PREVIEW_AI_MODEL to choose the Anthropic model used by preview app containers.
# Set PREVIEW_ANTHROPIC_API_KEY to update the preview Anthropic API secret.
# Access codes and cookie signing secrets are generated and retained per environment by
# the deploy script; they are not repository secrets.
# Set PREVIEW_DB_PASSWORD when the shared preview Postgres password is not the default.
# Set PREVIEW_LOGIN_EMAIL and PREVIEW_LOGIN_PASSWORD to update production-dump login smoke secrets.
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

test -n "${PREVIEW_HOST:-}" || { echo "Set PREVIEW_HOST"; exit 1; }
test -n "${PREVIEW_DOMAIN:-}" || { echo "Set PREVIEW_DOMAIN"; exit 1; }

gh_var PREVIEW_HOST "$PREVIEW_HOST"
gh_var PREVIEW_DOMAIN "$PREVIEW_DOMAIN"
gh_var PREVIEW_ROOT "${PREVIEW_ROOT:-/srv/yawp-preview}"
gh_var PREVIEW_SSH_USER "${PREVIEW_SSH_USER:-ec2-user}"
gh_var PREVIEW_TLS "${PREVIEW_TLS:-true}"
gh_var PREVIEW_RUNTIME "${PREVIEW_RUNTIME:-fast}"
gh_var PREVIEW_DATA_MODE "${PREVIEW_DATA_MODE:-seed}"
gh_var PREVIEW_DEV_LOGIN_EMAIL "${PREVIEW_DEV_LOGIN_EMAIL:-dev.teacher@yawp.local}"
gh_var PREVIEW_AI_MODEL "${PREVIEW_AI_MODEL:-claude-sonnet-4-6}"
gh_var PREVIEW_DB_DUMP_S3_URI "${PREVIEW_DB_DUMP_S3_URI:-s3://yawp-preview-videos/production.dump}"

if [[ -n "${PREVIEW_SSH_PRIVATE_KEY:-}" ]]; then
  gh_sec PREVIEW_SSH_PRIVATE_KEY "$PREVIEW_SSH_PRIVATE_KEY"
fi

if [[ -n "${PREVIEW_ANTHROPIC_API_KEY:-}" ]]; then
  gh_sec PREVIEW_ANTHROPIC_API_KEY "$PREVIEW_ANTHROPIC_API_KEY"
fi

if [[ -n "${PREVIEW_DB_PASSWORD:-}" ]]; then
  gh_sec PREVIEW_DB_PASSWORD "$PREVIEW_DB_PASSWORD"
fi

if [[ -n "${PREVIEW_LOGIN_EMAIL:-}" ]]; then
  gh_sec PREVIEW_LOGIN_EMAIL "$PREVIEW_LOGIN_EMAIL"
fi

if [[ -n "${PREVIEW_LOGIN_PASSWORD:-}" ]]; then
  gh_sec PREVIEW_LOGIN_PASSWORD "$PREVIEW_LOGIN_PASSWORD"
fi

echo "Done. Repo: $REPO"
