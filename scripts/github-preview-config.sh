#!/usr/bin/env bash
# Push PR preview repository variables + AWS_ROLE_ARN secret to GitHub (one-time / when ARNs change).
#
# Prerequisites: gh auth login (repo scope), aws CLI (yawp profile), AWS account 422348803522.
#
# Usage:
#   ./scripts/github-preview-config.sh
#   AWS_PROFILE=yawp AWS_REGION=us-east-1 GITHUB_REPO=The-Connell-School/yawp-2.0 ./scripts/github-preview-config.sh
#
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-yawp}"
export AWS_PROFILE

ACCOUNT_ID="${ACCOUNT_ID:-422348803522}"
ECR_REPO="${ECR_REPO:-yawp-preview-web-app}"
STATE_BUCKET="${STATE_BUCKET:-${ACCOUNT_ID}-yawp-terraform-preview-state}"
VIDEOS_BUCKET="${VIDEOS_BUCKET:-yawp-preview-videos}"
RESEND_FROM="${RESEND_FROM:-info@yawp.school}"
OIDC_ROLE_ARN="${OIDC_ROLE_ARN:-arn:aws:iam::${ACCOUNT_ID}:role/yawp-preview-github-actions}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/"
  exit 1
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI required"
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

secret_arn() {
  local id="$1"
  aws secretsmanager describe-secret \
    --secret-id "$id" \
    --region "$AWS_REGION" \
    --query ARN \
    --output text
}

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

PREFIX="yawp-preview"

gh_var PREVIEW_TF_STATE_BUCKET "$STATE_BUCKET"
gh_var PREVIEW_ECR_REPOSITORY "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
gh_var PREVIEW_AWS_S3_BUCKET "$VIDEOS_BUCKET"
gh_var PREVIEW_DB_DUMP_S3_URI "s3://${VIDEOS_BUCKET}/production.dump"
gh_var PREVIEW_RESEND_FROM_EMAIL "$RESEND_FROM"
gh_var PREVIEW_AWS_REGION "$AWS_REGION"
gh_var PREVIEW_APP_NAME "yawp-preview"

gh_var PREVIEW_DB_URL_SECRET_ARN "$(secret_arn "${PREFIX}/database-url")"
gh_var PREVIEW_SESSION_SECRET_ARN "$(secret_arn "${PREFIX}/session-secret")"
gh_var PREVIEW_HONEYPOT_SECRET_ARN "$(secret_arn "${PREFIX}/honeypot-secret")"
gh_var PREVIEW_OPENAI_ORG_SECRET_ARN "$(secret_arn "${PREFIX}/openai-org-id")"
gh_var PREVIEW_OPENAI_KEY_SECRET_ARN "$(secret_arn "${PREFIX}/openai-api-key")"
gh_var PREVIEW_ANTHROPIC_KEY_SECRET_ARN "$(secret_arn "${PREFIX}/anthropic-api-key")"
gh_var PREVIEW_INTERNAL_TOKEN_SECRET_ARN "$(secret_arn "${PREFIX}/internal-command-token")"
gh_var PREVIEW_RESEND_SECRET_ARN "$(secret_arn "${PREFIX}/resend-api-key")"
gh_var PREVIEW_SENTRY_DSN_SECRET_ARN "$(secret_arn "${PREFIX}/sentry-dsn")"

gh_sec AWS_ROLE_ARN "$OIDC_ROLE_ARN"

if [[ -n "${PREVIEW_POSTHOG_API_KEY:-}" ]]; then
  gh_var PREVIEW_POSTHOG_API_KEY "$PREVIEW_POSTHOG_API_KEY"
fi
if [[ -n "${PREVIEW_POSTHOG_HOST:-}" ]]; then
  gh_var PREVIEW_POSTHOG_HOST "$PREVIEW_POSTHOG_HOST"
fi
if [[ -n "${PREVIEW_AI_MODEL:-}" ]]; then
  gh_var PREVIEW_AI_MODEL "$PREVIEW_AI_MODEL"
fi

echo "Done. Repo: $REPO"
