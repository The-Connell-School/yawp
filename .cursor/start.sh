#!/usr/bin/env bash
# Cloud Agent start: per-boot runtime.
# Rewrites the (gitignored) dev .env files, ensures Postgres is online, then
# runs the web-app dev server in the foreground (attached) so logs are visible.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.bun/bin:$PATH"

DB_NAME="yawp_workspace"
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/${DB_NAME}"

cat > "$ROOT/packages/prisma/.env" <<EOF
DATABASE_URL="${DATABASE_URL}"
EOF

cat > "$ROOT/services/web-app/.env" <<EOF
NODE_ENV=development
DATABASE_URL="${DATABASE_URL}"
DATABASE_PATH=".local-dev.sqlite"
CACHE_DATABASE_PATH=".cache.sqlite"
SESSION_SECRET="cloud-agent-dev-secret"
HONEYPOT_SECRET="cloud-agent-honeypot"
INTERNAL_COMMAND_TOKEN="cloud-agent-internal-token"
AWS_S3_BUCKET_FOR_VIDEOS="cloud-agent-local-dev-bucket"
AWS_S3_REGION_FOR_VIDEOS="us-east-1"
CLASS_INSIGHT_MOCK_MODE=fixture
AI_MODEL="claude-sonnet-4-5"
ANTHROPIC_API_KEY=""
EOF

PG_VERSION="$(ls /usr/lib/postgresql/ | sort -n | tail -1)"
if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true
fi
for _ in $(seq 1 60); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done
if ! sudo -u postgres pg_isready -q; then
  echo "Postgres did not become ready in time." >&2
  exit 1
fi
echo "Postgres is online."

cd "$ROOT/services/web-app"
exec env PORT=5176 bun run dev
