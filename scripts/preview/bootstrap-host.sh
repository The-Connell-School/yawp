#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
ACME_EMAIL="${PREVIEW_ACME_EMAIL:-}"
DOMAIN="${PREVIEW_DOMAIN:-}"
RUNNING_CAP="${PREVIEW_MAX_RUNNING:-8}"
WAKE_PORT="${PREVIEW_WAKE_PORT:-9876}"
WAKE_USER="${PREVIEW_WAKE_USER:-$USER}"
POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"
METRICS_USER="${PREVIEW_METRICS_USER:-$USER}"

[[ "$DOMAIN" =~ ^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] || {
  echo "PREVIEW_DOMAIN must be a valid DNS domain" >&2
  exit 1
}
[[ "$RUNNING_CAP" =~ ^[1-9][0-9]*$ ]] || {
  echo "PREVIEW_MAX_RUNNING must be a positive integer" >&2
  exit 1
}
if ! [[ "$WAKE_PORT" =~ ^[1-9][0-9]*$ ]] || (( WAKE_PORT > 65535 )); then
  echo "PREVIEW_WAKE_PORT must be a valid TCP port" >&2
  exit 1
fi

if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker git rsync nodejs jq awscli || sudo dnf install -y docker git rsync nodejs jq awscli2
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y docker git rsync nodejs jq awscli
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-plugin git rsync nodejs jq ca-certificates curl awscli
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
sudo mkdir -p \
  "$ROOT/traefik/letsencrypt" \
  "$ROOT/traefik/dynamic" \
  "$ROOT/traefik/logs" \
  "$ROOT/previews" \
  "$ROOT/sources" \
  "$ROOT/wake/access"
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

# Remove the legacy entrypoint-wide Basic auth configuration. Access control now belongs
# to each React Router app so it can render the branded gate while still protecting its
# loaders, actions, and APIs.
rm -f "$ROOT/traefik/dynamic/access-gate.yml"

wake_server="$ROOT/bootstrap/scripts/preview/wake-server.mjs"
wake_script="$ROOT/bootstrap/scripts/preview/wake-preview.sh"
[[ -f "$wake_server" && -f "$wake_script" ]] || {
  echo "Preview wake server and script must be synced before bootstrap" >&2
  exit 1
}
chmod +x "$wake_script"

wake_env="$ROOT/wake/wake.env"
if [[ ! -s "$wake_env" ]]; then
  umask 077
  wake_secret="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
  printf 'PREVIEW_WAKE_SECRET=%s\n' "$wake_secret" > "$wake_env"
fi
chmod 600 "$wake_env"
IFS='=' read -r _ wake_secret < "$wake_env"
[[ "$wake_secret" =~ ^[A-Za-z0-9_-]{32,}$ ]] || {
  echo "Preview wake secret is invalid" >&2
  exit 1
}

domain_regex="${DOMAIN//./\\.}"
wake_host_rule="HostRegexp(\`^pr-[1-9][0-9]*\\.${domain_regex}$\`)"
# Router rule shape: HostRegexp(`^pr-[1-9][0-9]*\\.<configured-domain>$`)
cat > "$ROOT/traefik/dynamic/preview-wake.yml" <<YAML
http:
  middlewares:
    preview-wake-secret:
      headers:
        customRequestHeaders:
          X-Preview-Wake-Secret: "${wake_secret}"
    preview-wake-rate-limit:
      rateLimit:
        average: 2
        period: 1m
        burst: 3
  routers:
    preview-wake-fallback:
      rule: '${wake_host_rule}'
      entryPoints:
        - websecure
      middlewares:
        - preview-wake-rate-limit
        - preview-wake-secret
      service: preview-wake
      priority: 1
      tls:
        certResolver: letsencrypt
  services:
    preview-wake:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:${WAKE_PORT}"
YAML
chmod 600 "$ROOT/traefik/dynamic/preview-wake.yml"
touch "$ROOT/traefik/logs/access.json"
sudo chown "$WAKE_USER" "$ROOT/traefik/logs/access.json"
chmod 640 "$ROOT/traefik/logs/access.json"

cat > "$ROOT/traefik/docker-compose.yml" <<YAML
services:
  traefik:
    image: traefik:v3.1
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.file.directory=/dynamic
      - --providers.file.watch=true
      - --accesslog=true
      - --accesslog.filepath=/logs/access.json
      - --accesslog.format=json
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
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
      - ./dynamic:/dynamic:ro
      - ./logs:/logs
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - preview

networks:
  preview:
    external: true
YAML

docker compose -f "$ROOT/traefik/docker-compose.yml" up -d
connect_container_to_preview_network traefik-traefik-1

node_path="$(command -v node)"
sudo tee /etc/systemd/system/yawp-preview-wake.service >/dev/null <<UNIT
[Unit]
Description=Wake sleeping Yawp preview environments on first request
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
User=$WAKE_USER
EnvironmentFile=$wake_env
Environment=PREVIEW_ROOT=$ROOT
Environment=PREVIEW_DOMAIN=$DOMAIN
Environment=PREVIEW_MAX_RUNNING=$RUNNING_CAP
Environment=PREVIEW_WAKE_PORT=$WAKE_PORT
Environment=PREVIEW_WAKE_SCRIPT=$wake_script
Environment=PREVIEW_ACCESS_LOG=$ROOT/traefik/logs/access.json
Environment=PREVIEW_ACCESS_LOG_MAX_BYTES=52428800
ExecStart=$node_path $wake_server
Restart=always
RestartSec=2
TimeoutStopSec=10
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now yawp-preview-wake.service
sudo systemctl restart yawp-preview-wake.service

metrics_script="$ROOT/bootstrap/scripts/preview/publish-host-metrics.sh"
if [[ -f "$metrics_script" ]]; then
  chmod +x "$metrics_script"
  sudo tee /etc/systemd/system/yawp-preview-metrics.service >/dev/null <<UNIT
[Unit]
Description=Publish Yawp preview host capacity metrics
After=docker.service network-online.target

[Service]
Type=oneshot
User=$METRICS_USER
Environment=PREVIEW_ROOT=$ROOT
Environment=PREVIEW_AWS_REGION=${PREVIEW_AWS_REGION:-us-east-1}
ExecStart=/usr/bin/env bash $metrics_script
UNIT

  sudo tee /etc/systemd/system/yawp-preview-metrics.timer >/dev/null <<'UNIT'
[Unit]
Description=Publish Yawp preview host metrics every minute

[Timer]
OnBootSec=60
OnUnitActiveSec=60
Persistent=true

[Install]
WantedBy=timers.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable --now yawp-preview-metrics.timer
  if ! bash "$metrics_script"; then
    echo "Warning: initial preview metric publish failed; timer remains installed." >&2
  fi
else
  echo "Warning: $metrics_script missing; host metrics timer not installed." >&2
fi

echo "Preview environment host ready at $ROOT"
