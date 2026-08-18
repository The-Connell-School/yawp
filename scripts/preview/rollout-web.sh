#!/usr/bin/env bash
set -euo pipefail

: "${PREVIEW_COMPOSE_PROJECT:?PREVIEW_COMPOSE_PROJECT is required}"
: "${PREVIEW_COMPOSE_FILE:?PREVIEW_COMPOSE_FILE is required}"
: "${PREVIEW_ROUTER_FILE:?PREVIEW_ROUTER_FILE is required}"
: "${PREVIEW_HOSTNAME:?PREVIEW_HOSTNAME is required}"
: "${PREVIEW_PUBLIC_URL:?PREVIEW_PUBLIC_URL is required}"
: "${PREVIEW_LOGIN_SMOKE_SCRIPT:?PREVIEW_LOGIN_SMOKE_SCRIPT is required}"
: "${PREVIEW_ACCESS_CODE:?PREVIEW_ACCESS_CODE is required}"

PREVIEW_ROLLOUT_ATTEMPTS="${PREVIEW_ROLLOUT_ATTEMPTS:-90}"
PREVIEW_ROLLOUT_POLL_SECONDS="${PREVIEW_ROLLOUT_POLL_SECONDS:-1}"
PREVIEW_CANDIDATE_COMPOSE_FILE="${PREVIEW_CANDIDATE_COMPOSE_FILE:-${PREVIEW_COMPOSE_FILE}.candidate}"
PREVIEW_ACTIVE_WEB_FILE="${PREVIEW_ACTIVE_WEB_FILE:-${PREVIEW_COMPOSE_FILE}.active-web}"
PREVIEW_TLS="${PREVIEW_TLS:-true}"

[[ "$PREVIEW_COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || {
  echo "Invalid PREVIEW_COMPOSE_PROJECT" >&2
  exit 1
}
[[ "$PREVIEW_HOSTNAME" =~ ^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] || {
  echo "Invalid PREVIEW_HOSTNAME" >&2
  exit 1
}
[[ "$PREVIEW_ROLLOUT_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || {
  echo "PREVIEW_ROLLOUT_ATTEMPTS must be a positive integer" >&2
  exit 1
}
[[ "$PREVIEW_ROLLOUT_POLL_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]] || {
  echo "PREVIEW_ROLLOUT_POLL_SECONDS must be a nonnegative number" >&2
  exit 1
}
case "$PREVIEW_TLS" in
  true|false) ;;
  *) echo "PREVIEW_TLS must be true or false" >&2; exit 1 ;;
esac
[[ -f "$PREVIEW_COMPOSE_FILE" ]] || {
  echo "Preview compose file does not exist: $PREVIEW_COMPOSE_FILE" >&2
  exit 1
}
[[ -f "$PREVIEW_LOGIN_SMOKE_SCRIPT" ]] || {
  echo "Preview login smoke script does not exist" >&2
  exit 1
}

compose=(docker compose -p "$PREVIEW_COMPOSE_PROJECT" -f "$PREVIEW_COMPOSE_FILE")
candidate_compose=(
  docker compose -p "$PREVIEW_COMPOSE_PROJECT"
  -f "$PREVIEW_COMPOSE_FILE"
  -f "$PREVIEW_CANDIDATE_COMPOSE_FILE"
)

write_candidate_override() {
  local temporary="${PREVIEW_CANDIDATE_COMPOSE_FILE}.$$.tmp"
  umask 077
  cat > "$temporary" <<'YAML'
services:
  web:
    labels:
      - "traefik.enable=false"
YAML
  chmod 600 "$temporary"
  mv -f -- "$temporary" "$PREVIEW_CANDIDATE_COMPOSE_FILE"
}

list_web_containers() {
  "${compose[@]}" ps --all -q web
}

wait_for_container_health() {
  local container="$1" status
  for _ in $(seq 1 "$PREVIEW_ROLLOUT_ATTEMPTS"); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    [[ "$status" == "healthy" ]] && return 0
    [[ "$status" == "exited" || "$status" == "dead" ]] && break
    sleep "$PREVIEW_ROLLOUT_POLL_SECONDS"
  done
  echo "Candidate web container did not become healthy" >&2
  docker logs --tail=120 "$container" >&2 || true
  return 1
}

run_login_smoke() {
  local base_url="$1"
  PREVIEW_BASE_URL="$base_url" \
    PREVIEW_DATA_MODE="${PREVIEW_DATA_MODE:-seed}" \
    PREVIEW_RUNTIME="${PREVIEW_RUNTIME:-production}" \
    PREVIEW_ACCESS_CODE="$PREVIEW_ACCESS_CODE" \
    PREVIEW_DEV_LOGIN_EMAIL="${PREVIEW_DEV_LOGIN_EMAIL:-}" \
    PREVIEW_LOGIN_EMAIL="${PREVIEW_LOGIN_EMAIL:-}" \
    PREVIEW_LOGIN_PASSWORD="${PREVIEW_LOGIN_PASSWORD:-}" \
    node "$PREVIEW_LOGIN_SMOKE_SCRIPT"
}

run_public_smoke() {
  for _ in $(seq 1 "$PREVIEW_ROLLOUT_ATTEMPTS"); do
    if curl -fsS --connect-timeout 1 --max-time 2 \
      "${PREVIEW_PUBLIC_URL%/}/api/healthcheck" >/dev/null 2>&1 \
      && run_login_smoke "$PREVIEW_PUBLIC_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$PREVIEW_ROLLOUT_POLL_SECONDS"
  done
  echo "Public demo health/login smoke did not pass after cutover" >&2
  return 1
}

route_backup="${PREVIEW_ROUTER_FILE}.$$.previous"
route_existed=false
route_changed=false
old_container=""
old_stopped=false
candidate_container=""
committed=false

restore_previous_route() {
  [[ "$route_changed" == "true" ]] || return 0
  if [[ "$route_existed" == "true" ]]; then
    mv -f -- "$route_backup" "$PREVIEW_ROUTER_FILE"
  else
    rm -f -- "$PREVIEW_ROUTER_FILE"
  fi
  route_changed=false
}

rollback() {
  local status=$?
  if [[ "$committed" != "true" ]]; then
    if [[ "$old_stopped" == "true" && -n "$old_container" ]]; then
      docker start "$old_container" >/dev/null 2>&1 || true
    fi
    restore_previous_route || true
    if [[ -n "$old_container" ]]; then
      while IFS= read -r rollback_container; do
        [[ -n "$rollback_container" && "$rollback_container" != "$old_container" ]] || continue
        docker rm -f "$rollback_container" >/dev/null 2>&1 || true
      done < <(list_web_containers 2>/dev/null || true)
    fi
    if [[ -n "$candidate_container" ]]; then
      docker rm -f "$candidate_container" >/dev/null 2>&1 || true
    fi
  fi
  rm -f -- "$route_backup"
  return "$status"
}
trap rollback EXIT

write_candidate_route() {
  local candidate_name="$1"
  local route_dir temporary router_base
  [[ "$candidate_name" =~ ^[A-Za-z0-9_.-]+$ ]] || {
    echo "Invalid candidate container name" >&2
    return 1
  }
  route_dir="$(dirname "$PREVIEW_ROUTER_FILE")"
  [[ -d "$route_dir" ]] || {
    echo "Traefik dynamic configuration directory is missing" >&2
    return 1
  }
  if [[ -f "$PREVIEW_ROUTER_FILE" ]]; then
    cp -p -- "$PREVIEW_ROUTER_FILE" "$route_backup"
    route_existed=true
  fi
  router_base="${PREVIEW_COMPOSE_PROJECT}-cutover"
  temporary="${PREVIEW_ROUTER_FILE}.$$.tmp"
  umask 077
  if [[ "$PREVIEW_TLS" == "true" ]]; then
    cat > "$temporary" <<YAML
http:
  routers:
    ${router_base}-http:
      rule: 'Host(\`${PREVIEW_HOSTNAME}\`)'
      entryPoints: [web]
      service: ${router_base}
      priority: 10000
    ${router_base}-https:
      rule: 'Host(\`${PREVIEW_HOSTNAME}\`)'
      entryPoints: [websecure]
      service: ${router_base}
      priority: 10000
      tls:
        certResolver: letsencrypt
  services:
    ${router_base}:
      loadBalancer:
        servers:
          - url: "http://${candidate_name}:8080"
YAML
  else
    cat > "$temporary" <<YAML
http:
  routers:
    ${router_base}-http:
      rule: 'Host(\`${PREVIEW_HOSTNAME}\`)'
      entryPoints: [web]
      service: ${router_base}
      priority: 10000
  services:
    ${router_base}:
      loadBalancer:
        servers:
          - url: "http://${candidate_name}:8080"
YAML
  fi
  chmod 600 "$temporary"
  mv -f -- "$temporary" "$PREVIEW_ROUTER_FILE"
  route_changed=true
}

existing_containers=()
while IFS= read -r container; do
  [[ -n "$container" ]] && existing_containers+=("$container")
done < <(list_web_containers)
if (( ${#existing_containers[@]} == 0 )); then
  rm -f -- "$PREVIEW_ROUTER_FILE" "$PREVIEW_ACTIVE_WEB_FILE"
  "${compose[@]}" up -d web
  committed=true
  echo "PREVIEW_ROLLOUT_MODE=initial"
  exit 0
fi
if [[ -s "$PREVIEW_ACTIVE_WEB_FILE" ]]; then
  active_container="$(<"$PREVIEW_ACTIVE_WEB_FILE")"
  active_found=false
  for container in "${existing_containers[@]}"; do
    if [[ "$container" == "$active_container" ]]; then
      active_found=true
      continue
    fi
    stale_status="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
    [[ "$stale_status" != "running" ]] || {
      echo "Refusing rollout with an unexpected second running web container" >&2
      exit 1
    }
    docker rm "$container" >/dev/null
  done
  [[ "$active_found" == "true" ]] || {
    echo "Recorded active web container is missing" >&2
    exit 1
  }
  existing_containers=("$active_container")
elif (( ${#existing_containers[@]} != 1 )); then
  echo "Expected exactly one active web container before rollout" >&2
  exit 1
fi
old_container="${existing_containers[0]}"

write_candidate_override
"${candidate_compose[@]}" up -d --no-recreate --scale web=2 web

rollout_containers=()
while IFS= read -r container; do
  [[ -n "$container" ]] && rollout_containers+=("$container")
done < <(list_web_containers)
for container in "${rollout_containers[@]}"; do
  if [[ "$container" != "$old_container" ]]; then
    if [[ -n "$candidate_container" ]]; then
      echo "Rollout created more than one candidate web container" >&2
      exit 1
    fi
    candidate_container="$container"
  fi
done
[[ -n "$candidate_container" ]] || {
  echo "Rollout did not create a candidate web container" >&2
  exit 1
}

wait_for_container_health "$candidate_container"
candidate_ip="$(docker inspect --format '{{with index .NetworkSettings.Networks "preview"}}{{.IPAddress}}{{end}}' "$candidate_container")"
[[ "$candidate_ip" =~ ^[0-9]+([.][0-9]+){3}$ ]] || {
  echo "Candidate web container has no valid preview-network address" >&2
  exit 1
}
candidate_url="http://${candidate_ip}:8080"
run_login_smoke "$candidate_url"

candidate_name="$(docker inspect --format '{{.Name}}' "$candidate_container")"
candidate_name="${candidate_name#/}"
write_candidate_route "$candidate_name"
run_public_smoke

docker stop "$old_container" >/dev/null
old_stopped=true
run_public_smoke

active_temporary="${PREVIEW_ACTIVE_WEB_FILE}.$$.tmp"
printf '%s\n' "$candidate_container" > "$active_temporary"
chmod 600 "$active_temporary"
mv -f -- "$active_temporary" "$PREVIEW_ACTIVE_WEB_FILE"
committed=true
rm -f -- "$route_backup"
echo "PREVIEW_ROLLOUT_MODE=health-gated"
echo "PREVIEW_ACTIVE_WEB_CONTAINER=$candidate_container"
echo "PREVIEW_ROLLBACK_WEB_CONTAINER=$old_container"
