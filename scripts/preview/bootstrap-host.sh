#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
ACME_EMAIL="${PREVIEW_ACME_EMAIL:-}"
POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"

if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker git rsync nodejs awscli || sudo dnf install -y docker git rsync nodejs awscli2
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y docker git rsync nodejs awscli
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-plugin git rsync nodejs ca-certificates curl awscli
else
  echo "Install Docker, Docker Compose v2, git, rsync, Node, and AWS CLI before running this script." >&2
  exit 1
fi

command -v aws >/dev/null 2>&1 || { echo "AWS CLI is required to restore preview production dumps from S3." >&2; exit 1; }

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
docker network inspect preview >/dev/null 2>&1 || docker network create preview >/dev/null

connect_container_to_preview_network() {
  local container="$1"
  if docker inspect "$container" >/dev/null 2>&1; then
    docker network connect preview "$container" >/dev/null 2>&1 || true
  fi
}

if sudo iptables -S DOCKER-USER >/dev/null 2>&1; then
  sudo iptables -C DOCKER-USER -d 169.254.169.254/32 -j REJECT 2>/dev/null || \
    sudo iptables -I DOCKER-USER -d 169.254.169.254/32 -j REJECT
  sudo iptables -C DOCKER-USER -d 169.254.170.2/32 -j REJECT 2>/dev/null || \
    sudo iptables -I DOCKER-USER -d 169.254.170.2/32 -j REJECT
fi

if command -v ip6tables >/dev/null 2>&1 && sudo ip6tables -S DOCKER-USER >/dev/null 2>&1; then
  sudo ip6tables -C DOCKER-USER -d fd00:ec2::254/128 -j REJECT 2>/dev/null || \
    sudo ip6tables -I DOCKER-USER -d fd00:ec2::254/128 -j REJECT
fi

sudo mkdir -p "$ROOT/postgres"
sudo chown -R "$USER":"$USER" "$ROOT/postgres"
cat > "$ROOT/postgres/docker-compose.yml" <<YAML
services:
  postgres:
    image: postgres:16
    container_name: preview-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${PREVIEW_DB_PASSWORD:-postgres}
      POSTGRES_DB: postgres
    volumes:
      - preview-postgres-data:/var/lib/postgresql/data
    networks:
      - preview

volumes:
  preview-postgres-data:

networks:
  preview:
    external: true
YAML

docker compose -p "$POSTGRES_PROJECT" -f "$ROOT/postgres/docker-compose.yml" up -d
connect_container_to_preview_network preview-postgres

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
      - preview

networks:
  preview:
    external: true
YAML

docker compose -f "$ROOT/traefik/docker-compose.yml" up -d
connect_container_to_preview_network traefik-traefik-1

echo "Preview environment host ready at $ROOT"
