#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-demo}"
ROOT_PARENT="${PREVIEW_ROOT_PARENT:-/srv}"
PUBLIC_URL="${PREVIEW_PUBLIC_URL:-https://demo.yawp.school}"
HEALTH_ATTEMPTS="${TRAEFIK_HEALTH_ATTEMPTS:-30}"
COMPOSE_FILE="$ROOT/traefik/docker-compose.yml"
DYNAMIC_DIR="$ROOT/traefik/dynamic"

[[ "$ROOT_PARENT" == /* && "$ROOT_PARENT" != *[$'\n\r\t ']* \
  && "$(dirname "$ROOT")" == "$ROOT_PARENT" \
  && "$(basename "$ROOT")" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "PREVIEW_ROOT must be a safe direct child of PREVIEW_ROOT_PARENT" >&2
  exit 1
}
[[ "$PUBLIC_URL" =~ ^https://[A-Za-z0-9.-]+$ ]] || {
  echo "PREVIEW_PUBLIC_URL must be an HTTPS origin" >&2
  exit 1
}
[[ "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || {
  echo "TRAEFIK_HEALTH_ATTEMPTS must be a positive integer" >&2
  exit 1
}
[[ -f "$COMPOSE_FILE" && ! -L "$COMPOSE_FILE" ]] || {
  echo "Demo Traefik compose file is missing or unsafe" >&2
  exit 1
}

compose=(docker compose -f "$COMPOSE_FILE")

wait_for_demo_health() {
  local attempt
  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if curl -fsS --connect-timeout 2 --max-time 5 \
      "${PUBLIC_URL%/}/api/healthcheck" >/dev/null; then
      return 0
    fi
    (( attempt < HEALTH_ATTEMPTS )) && sleep 1
  done
  return 1
}

verify_running_provider() {
  local command_json container_id dynamic_mount
  container_id="$("${compose[@]}" ps -q traefik)"
  [[ "$container_id" =~ ^[A-Za-z0-9]+$ ]] || {
    echo "Expected exactly one running Traefik service container" >&2
    return 1
  }
  command_json="$(docker inspect --format '{{json .Config.Cmd}}' "$container_id")"
  [[ "$command_json" == *"--providers.file.directory=/dynamic"* \
    && "$command_json" == *"--providers.file.watch=true"* ]] || {
    echo "Running Traefik did not enable the file provider" >&2
    return 1
  }
  dynamic_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/dynamic"}}{{.Type}}{{end}}{{end}}' "$container_id")"
  [[ "$dynamic_mount" == "bind" ]] || {
    echo "Running Traefik does not have the expected /dynamic bind mount" >&2
    return 1
  }
}

provider_configured=false
mount_configured=false
file_provider_marker_present=false
grep -Eq -- 'providers\.file\.|/dynamic' "$COMPOSE_FILE" \
  && file_provider_marker_present=true
grep -Fxq '      - --providers.file.directory=/dynamic' "$COMPOSE_FILE" \
  && grep -Fxq '      - --providers.file.watch=true' "$COMPOSE_FILE" \
  && provider_configured=true
grep -Fxq '      - ./dynamic:/dynamic:ro' "$COMPOSE_FILE" \
  && mount_configured=true

if [[ "$file_provider_marker_present" == "true" ]]; then
  [[ "$provider_configured" == "true" && "$mount_configured" == "true" && -d "$DYNAMIC_DIR" ]] || {
    echo "Demo Traefik file-provider configuration is only partially applied" >&2
    exit 1
  }
  verify_running_provider
  wait_for_demo_health || {
    echo "Demo is unhealthy with the existing Traefik file-provider configuration" >&2
    exit 1
  }
  echo "TRAEFIK_FILE_PROVIDER_ENABLED=already"
  exit 0
fi

wait_for_demo_health || {
  echo "Demo must be healthy before Traefik maintenance begins" >&2
  exit 1
}

mkdir -p "$DYNAMIC_DIR"
chmod 700 "$DYNAMIC_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${COMPOSE_FILE}.pre-file-provider.${timestamp}.$$"
temporary_file="${COMPOSE_FILE}.file-provider.$$.tmp"
cp -p -- "$COMPOSE_FILE" "$backup_file"

compose_changed=false
committed=false
rollback() {
  local status=$?
  trap - EXIT
  rm -f -- "$temporary_file"
  if [[ "$status" -ne 0 && "$compose_changed" == "true" && "$committed" != "true" ]]; then
    echo "Traefik upgrade failed; restoring the previous compose file" >&2
    cp -p -- "$backup_file" "$COMPOSE_FILE"
    if "${compose[@]}" up -d traefik >/dev/null 2>&1 \
      && wait_for_demo_health; then
      echo "Previous Traefik configuration restored and demo is healthy" >&2
    else
      echo "Rollback could not prove demo health; inspect the host immediately" >&2
    fi
  fi
  exit "$status"
}
trap rollback EXIT

awk '
  /^[[:space:]]*-[[:space:]]*--providers\.docker\.exposedbydefault=false[[:space:]]*$/ {
    print
    print "      - --providers.file.directory=/dynamic"
    print "      - --providers.file.watch=true"
    provider_anchor += 1
    next
  }
  /^[[:space:]]*-[[:space:]]*\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro[[:space:]]*$/ {
    print
    print "      - ./dynamic:/dynamic:ro"
    mount_anchor += 1
    next
  }
  { print }
  END {
    if (provider_anchor != 1 || mount_anchor != 1) exit 42
  }
' "$COMPOSE_FILE" > "$temporary_file" || {
  echo "Legacy Traefik compose file did not match the reviewed upgrade anchors" >&2
  exit 1
}

docker compose -f "$temporary_file" config >/dev/null
chmod 600 "$temporary_file"
mv -f -- "$temporary_file" "$COMPOSE_FILE"
compose_changed=true

"${compose[@]}" up -d traefik
verify_running_provider
wait_for_demo_health || {
  echo "Demo did not recover after enabling the Traefik file provider" >&2
  exit 1
}

committed=true
echo "TRAEFIK_FILE_PROVIDER_ENABLED=true"
echo "TRAEFIK_COMPOSE_BACKUP=$backup_file"
