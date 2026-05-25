#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_FORGE_ROOT:-/srv/yawp-preview-forge}"
ACME_EMAIL="${PREVIEW_FORGE_ACME_EMAIL:-}"

if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker git rsync nodejs
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y docker git rsync nodejs
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-plugin git rsync nodejs ca-certificates curl
else
  echo "Install Docker, Docker Compose v2, git, rsync, and Node before running this script." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL \
    https://github.com/docker/compose/releases/download/v2.31.0/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

sudo systemctl enable --now docker
sudo mkdir -p "$ROOT/traefik/letsencrypt" "$ROOT/previews" "$ROOT/sources"
sudo chown -R "$USER":"$USER" "$ROOT"
docker network inspect preview-forge >/dev/null 2>&1 || docker network create preview-forge >/dev/null

cat > "$ROOT/traefik/docker-compose.yml" <<YAML
services:
  traefik:
    image: traefik:v3.1
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL:-admin@example.com}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    networks:
      - preview-forge

networks:
  preview-forge:
    external: true
YAML

docker compose -f "$ROOT/traefik/docker-compose.yml" up -d

echo "Preview Forge host ready at $ROOT"
