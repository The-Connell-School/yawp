#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
ACME_EMAIL="${PREVIEW_ACME_EMAIL:-}"
DOMAIN="${PREVIEW_DOMAIN:-}"
RUNNING_CAP="${PREVIEW_MAX_RUNNING:-4}"
SLEEP_ENABLED="${PREVIEW_SLEEP_ENABLED:-true}"
INFLIGHT_TTL_SECONDS="${PREVIEW_INFLIGHT_TTL_SECONDS:-3600}"
WAKE_USER="${PREVIEW_WAKE_USER:-$USER}"
HTTP_PORT="${PREVIEW_HTTP_PORT:-80}"
HTTPS_PORT="${PREVIEW_HTTPS_PORT:-443}"
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
case "$SLEEP_ENABLED" in
  true|false) ;;
  *) echo "PREVIEW_SLEEP_ENABLED must be true or false" >&2; exit 1 ;;
esac
[[ "$INFLIGHT_TTL_SECONDS" =~ ^[0-9]+$ ]] || {
  echo "PREVIEW_INFLIGHT_TTL_SECONDS must be a nonnegative integer" >&2
  exit 1
}
for port in "$HTTP_PORT" "$HTTPS_PORT"; do
  if ! [[ "$port" =~ ^[1-9][0-9]*$ ]] || (( port > 65535 )); then
    echo "Preview ingress ports must be valid TCP ports" >&2
    exit 1
  fi
done

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
command -v flock >/dev/null 2>&1 || {
  echo "flock is required for preview host mutation locking" >&2
  exit 1
}

if ! docker compose version >/dev/null 2>&1; then
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL \
    https://github.com/docker/compose/releases/download/v2.31.0/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

sudo systemctl enable --now docker
sudo mkdir -p \
  "$ROOT/ingress/certs" \
  "$ROOT/ingress/acme" \
  "$ROOT/ingress/challenges" \
  "$ROOT/previews" \
  "$ROOT/sources" \
  "$ROOT/wake/access"
# Preview deploy and teardown jobs create/remove descendants concurrently. Only repair
# ownership on the stable directories bootstrap itself must write; recursively walking
# the whole root races with teardown and makes a harmless disappearing PR path fatal.
sudo chown "$USER":"$USER" \
  "$ROOT" \
  "$ROOT/ingress" \
  "$ROOT/ingress/certs" \
  "$ROOT/ingress/acme" \
  "$ROOT/ingress/challenges" \
  "$ROOT/previews" \
  "$ROOT/sources" \
  "$ROOT/wake" \
  "$ROOT/wake/access"
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
chmod 700 "$ROOT/postgres"
exec 8>"$ROOT/preview-host.lock"
flock -w 900 8
postgres_compose="$ROOT/postgres/docker-compose.yml"
postgres_compose_temporary="${postgres_compose}.$$.tmp"
umask 077
cat > "$postgres_compose_temporary" <<YAML
services:
  postgres:
    image: postgres:16
    container_name: preview-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${PREVIEW_POSTGRES_ADMIN_PASSWORD:?PREVIEW_POSTGRES_ADMIN_PASSWORD is required}
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
chmod 600 "$postgres_compose_temporary"
mv -f -- "$postgres_compose_temporary" "$postgres_compose"

docker compose -p "$POSTGRES_PROJECT" -f "$postgres_compose" up -d
connect_container_to_preview_network preview-postgres

postgres_ready=false
for attempt in {1..90}; do
  if docker exec preview-postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  (( attempt < 90 )) && sleep 1
done
[[ "$postgres_ready" == "true" ]] || {
  echo "Shared preview Postgres did not become ready before resident migration" >&2
  exit 1
}

database_role_migration="$ROOT/bootstrap/scripts/preview/migrate-resident-database-roles.sh"
[[ -f "$database_role_migration" ]] || {
  echo "Preview database role migration must be synced before bootstrap" >&2
  exit 1
}
chmod +x "$database_role_migration"
env \
  PREVIEW_ROOT="$ROOT" \
  PREVIEW_POSTGRES_ADMIN_PASSWORD="$PREVIEW_POSTGRES_ADMIN_PASSWORD" \
  bash "$database_role_migration"
flock -u 8

source_wake_server="$ROOT/bootstrap/scripts/preview/wake-server.mjs"
source_ingress_server="$ROOT/bootstrap/scripts/preview/ingress-server.mjs"
source_certificate_manager="$ROOT/bootstrap/scripts/preview/certificate-manager.mjs"
source_internal_routes="$ROOT/bootstrap/scripts/preview/internal-routes.mjs"
source_wake_script="$ROOT/bootstrap/scripts/preview/wake-preview.sh"
[[ -f "$source_internal_routes" && -f "$source_wake_server" && -f "$source_ingress_server" && -f "$source_certificate_manager" && -f "$source_wake_script" ]] || {
  echo "Preview ingress, certificate, wake server, and wake script must be synced before bootstrap" >&2
  exit 1
}
release_id="$(sha256sum \
  "$source_wake_server" \
  "$source_ingress_server" \
  "$source_certificate_manager" \
  "$source_internal_routes" \
  "$source_wake_script" \
  | sha256sum \
  | awk '{print $1}')"
release_dir="$ROOT/ingress/releases/$release_id"
mkdir -p "$release_dir"
install -m 0644 "$source_wake_server" "$release_dir/wake-server.mjs"
install -m 0644 "$source_ingress_server" "$release_dir/ingress-server.mjs"
install -m 0644 "$source_certificate_manager" "$release_dir/certificate-manager.mjs"
install -m 0644 "$source_internal_routes" "$release_dir/internal-routes.mjs"
install -m 0755 "$source_wake_script" "$release_dir/wake-preview.sh"
ingress_server="$release_dir/ingress-server.mjs"
certificate_manager="$release_dir/certificate-manager.mjs"
wake_script="$release_dir/wake-preview.sh"
current_release_link="$ROOT/ingress/current"
previous_release=""
if [[ -L "$current_release_link" ]]; then
  previous_release="$(readlink "$current_release_link")"
fi

PREVIEW_ROOT="$ROOT" \
PREVIEW_DOMAIN="$DOMAIN" \
PREVIEW_TRAEFIK_ACME_PATH="$ROOT/traefik/letsencrypt/acme.json" \
  node "$certificate_manager" --import-traefik

default_hostname="$(
  find "$ROOT/ingress/certs" -mindepth 1 -maxdepth 1 -type d -name "pr-*.$DOMAIN" -printf '%f\n' \
    | sort -V \
    | tail -1
)"
[[ -n "$default_hostname" ]] || {
  echo "No resident preview TLS certificate was available for ingress cutover" >&2
  exit 1
}
running_hostnames=()
while IFS= read -r container_name; do
  if [[ "$container_name" =~ ^yawp-pr-([1-9][0-9]*)-web-1$ ]]; then
    running_hostname="pr-${BASH_REMATCH[1]}.$DOMAIN"
    if [[ -f "$ROOT/ingress/certs/$running_hostname/privkey.pem" \
      && -f "$ROOT/ingress/certs/$running_hostname/fullchain.pem" ]]; then
      running_hostnames+=("$running_hostname")
    fi
  fi
done < <(docker ps --format '{{.Names}}')
(( ${#running_hostnames[@]} > 0 )) || {
  echo "Custom ingress cutover requires at least one running preview with a migrated certificate" >&2
  exit 1
}

# Prove routing and TLS on alternate ports while the old ingress still owns 80/443.
canary_log="$ROOT/ingress/canary.log"
PREVIEW_ROOT="$ROOT" \
PREVIEW_DOMAIN="$DOMAIN" \
PREVIEW_MAX_RUNNING="$RUNNING_CAP" \
PREVIEW_HTTP_PORT=19080 \
PREVIEW_HTTPS_PORT=19443 \
PREVIEW_TLS_DEFAULT_HOST="$default_hostname" \
PREVIEW_WAKE_SCRIPT="$wake_script" \
  node "$ingress_server" >"$canary_log" 2>&1 &
canary_pid=$!
stop_canary() {
  kill "$canary_pid" >/dev/null 2>&1 || true
  wait "$canary_pid" >/dev/null 2>&1 || true
}
trap stop_canary EXIT
for canary_hostname in "${running_hostnames[@]}"; do
  canary_ready=false
  for attempt in {1..20}; do
    canary_status="$(curl -sk --connect-timeout 1 --max-time 3 \
      --resolve "$canary_hostname:19443:127.0.0.1" \
      -o /dev/null -w '%{http_code}' \
      "https://$canary_hostname:19443/api/healthcheck" 2>/dev/null || true)"
    if [[ "$canary_status" == "200" ]]; then
      canary_ready=true
      break
    fi
    sleep 1
  done
  [[ "$canary_ready" == "true" ]] || {
    echo "Custom preview ingress canary failed upstream health for $canary_hostname" >&2
    tail -80 "$canary_log" >&2 || true
    exit 1
  }
done
stop_canary
trap - EXIT

node_path="$(command -v node)"
ingress_unit=/etc/systemd/system/yawp-preview-ingress.service
previous_ingress_unit="$ROOT/ingress/previous-ingress.$$.service"
had_previous_ingress_unit=false
if sudo test -f "$ingress_unit"; then
  sudo cp -p -- "$ingress_unit" "$previous_ingress_unit"
  sudo chown "$USER":"$USER" "$previous_ingress_unit"
  had_previous_ingress_unit=true
fi
release_link_changed=false
traefik_container=""
traefik_was_running=false
rollback_ingress() {
  if [[ "$release_link_changed" == "true" ]]; then
    if [[ -n "$previous_release" ]]; then
      rollback_release_link="$ROOT/ingress/.current.rollback.$$.tmp"
      ln -s "$previous_release" "$rollback_release_link"
      mv -Tf -- "$rollback_release_link" "$current_release_link"
    else
      rm -f -- "$current_release_link"
    fi
  fi
  if [[ "$had_previous_ingress_unit" == "true" ]]; then
    sudo cp -p -- "$previous_ingress_unit" "$ingress_unit"
  else
    sudo rm -f -- "$ingress_unit"
  fi
  sudo systemctl daemon-reload >/dev/null 2>&1 || true
  if [[ "$traefik_was_running" == "true" && -n "$traefik_container" ]]; then
    sudo systemctl disable --now yawp-preview-ingress.service >/dev/null 2>&1 || true
    docker start "$traefik_container" >/dev/null 2>&1 || true
  elif [[ "$release_link_changed" == "true" && "$had_previous_ingress_unit" == "true" ]]; then
    sudo systemctl enable yawp-preview-ingress.service >/dev/null 2>&1 || true
    sudo systemctl restart yawp-preview-ingress.service >/dev/null 2>&1 || true
  fi
  rm -f -- "$previous_ingress_unit"
}
trap rollback_ingress EXIT
sudo tee /etc/systemd/system/yawp-preview-ingress.service >/dev/null <<UNIT
[Unit]
Description=Yawp preview HTTPS ingress and automatic wake service
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
User=$WAKE_USER
Environment=PREVIEW_ROOT=$ROOT
Environment=PREVIEW_DOMAIN=$DOMAIN
Environment=PREVIEW_MAX_RUNNING=$RUNNING_CAP
Environment=PREVIEW_SLEEP_ENABLED=$SLEEP_ENABLED
Environment=PREVIEW_INFLIGHT_TTL_SECONDS=$INFLIGHT_TTL_SECONDS
Environment=PREVIEW_HTTP_PORT=$HTTP_PORT
Environment=PREVIEW_HTTPS_PORT=$HTTPS_PORT
Environment=PREVIEW_TLS_DEFAULT_HOST=$default_hostname
Environment=PREVIEW_WAKE_SCRIPT=$ROOT/ingress/current/wake-preview.sh
EnvironmentFile=-/etc/yawp-internal/ingress.env
ExecStart=$node_path $ROOT/ingress/current/ingress-server.mjs
Restart=always
RestartSec=2
KillMode=control-group
TimeoutStopSec=1200
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/yawp-preview-certificate-renewal.service >/dev/null <<UNIT
[Unit]
Description=Renew resident Yawp preview TLS certificates
After=yawp-preview-ingress.service network-online.target

[Service]
Type=oneshot
User=$WAKE_USER
Environment=PREVIEW_ROOT=$ROOT
Environment=PREVIEW_DOMAIN=$DOMAIN
Environment=PREVIEW_ACME_EMAIL=${ACME_EMAIL:-admin@example.com}
EnvironmentFile=-/etc/yawp-internal/ingress.env
ExecStart=/usr/bin/flock -w 900 $ROOT/preview-host.lock $node_path $ROOT/ingress/current/certificate-manager.mjs --resident
TimeoutStartSec=900
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
UNIT

# Installed but not enabled: Internal rollout must configure and enable this path explicitly.
sudo tee /etc/systemd/system/yawp-preview-internal-certificates.service >/dev/null <<UNIT
[Unit]
Description=Provision certificates for registered Internal previews
After=yawp-preview-ingress.service network-online.target
StartLimitIntervalSec=0

[Service]
Type=oneshot
User=$WAKE_USER
Environment=PREVIEW_ROOT=$ROOT
Environment=PREVIEW_DOMAIN=$DOMAIN
Environment=PREVIEW_ACME_EMAIL=${ACME_EMAIL:-admin@example.com}
EnvironmentFile=/etc/yawp-internal/ingress.env
ExecStart=/usr/bin/flock -w 900 $ROOT/preview-host.lock $node_path $ROOT/ingress/current/certificate-manager.mjs --internal
TimeoutStartSec=900
Restart=on-failure
RestartSec=5min
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
UNIT

sudo tee /etc/systemd/system/yawp-preview-internal-certificates.path >/dev/null <<'UNIT'
[Unit]
Description=Watch Internal preview routes for certificate provisioning

[Path]
PathChanged=/srv/yawp-internal-routes
Unit=yawp-preview-internal-certificates.service

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/yawp-preview-certificate-renewal.timer >/dev/null <<'UNIT'
[Unit]
Description=Check Yawp preview TLS certificates daily

[Timer]
OnBootSec=15m
OnUnitActiveSec=24h
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
exec 8>"$ROOT/preview-host.lock"
flock -w 900 8
next_release_link="$ROOT/ingress/.current.$$.tmp"
ln -s "releases/$release_id" "$next_release_link"
mv -Tf -- "$next_release_link" "$current_release_link"
release_link_changed=true
traefik_container="$(docker ps -aq --filter 'name=^/traefik-traefik-1$' | head -1)"
if [[ -n "$traefik_container" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$traefik_container")" == "true" ]]; then
  traefik_was_running=true
  docker stop "$traefik_container" >/dev/null
fi
sudo systemctl enable yawp-preview-ingress.service
sudo systemctl restart yawp-preview-ingress.service
for public_hostname in "${running_hostnames[@]}"; do
  public_ready=false
  for attempt in {1..30}; do
    public_status="$(curl -sS --connect-timeout 1 --max-time 3 -o /dev/null -w '%{http_code}' \
      "https://$public_hostname/api/healthcheck" 2>/dev/null || true)"
    if [[ "$public_status" == "200" ]]; then
      public_ready=true
      break
    fi
    sleep 1
  done
  [[ "$public_ready" == "true" ]] || {
    echo "Custom preview ingress failed public TLS smoke for $public_hostname; restoring previous ingress" >&2
    sudo journalctl -u yawp-preview-ingress.service -n 80 --no-pager >&2 || true
    exit 1
  }
done
trap - EXIT
rm -f -- "$previous_ingress_unit"
if [[ -n "$traefik_container" ]]; then
  docker rm "$traefik_container" >/dev/null
fi
sudo systemctl disable --now yawp-preview-wake.service >/dev/null 2>&1 || true
sudo systemctl enable --now yawp-preview-certificate-renewal.timer
flock -u 8

metrics_script="$ROOT/bootstrap/scripts/preview/publish-host-metrics.sh"
if [[ -f "$metrics_script" ]]; then
  export HOST_METRICS_SCRIPT="$metrics_script"
  export HOST_METRICS_SERVICE=yawp-preview-metrics
  bash "$ROOT/bootstrap/scripts/preview/install-host-metrics.sh"
else
  echo "Warning: $metrics_script missing; host metrics timer not installed." >&2
fi

echo "Preview environment host ready at $ROOT"
