#!/usr/bin/env bash
# Repeatable real-Compose proof that sleep/wake retains the same project and state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER="${PREVIEW_DOCKER:-docker}"
PROOF_PR="${PREVIEW_PROOF_PR:-$((900000 + $$ % 99999))}"
TEMP_BASE="${TMPDIR:-/tmp}"
proof_root="$(mktemp -d "${TEMP_BASE%/}/yawp-preview-wake-proof.XXXXXX")"
preview_dir="$proof_root/previews/pr-${PROOF_PR}"
compose_file="$preview_dir/docker-compose.yml"
project="yawp-pr-${PROOF_PR}"

cleanup() {
  "$DOCKER" compose -p "$project" -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
  case "$proof_root" in
    "${TEMP_BASE%/}"/yawp-preview-wake-proof.*) rm -rf -- "$proof_root" ;;
    *) echo "Refusing to remove unexpected proof directory: $proof_root" >&2 ;;
  esac
}
trap cleanup EXIT

[[ "$PROOF_PR" =~ ^[1-9][0-9]*$ ]] || {
  echo "PREVIEW_PROOF_PR must be a positive integer" >&2
  exit 2
}
if "$DOCKER" ps -a --filter "label=com.docker.compose.project=${project}" -q | grep -q .; then
  echo "Compose project ${project} already exists" >&2
  exit 2
fi

mkdir -p "$preview_dir/state"
printf 'proof-state\n' > "$preview_dir/state/marker"
printf 'proof-access-code\n' > "$preview_dir/access-codes"
cat > "$compose_file" <<'YAML'
services:
  web:
    image: alpine:3.20
    command: ["sh", "-c", "while true; do sleep 3600; done"]
    volumes:
      - ./state:/state
    healthcheck:
      test: ["CMD", "test", "-f", "/state/marker"]
      interval: 1s
      timeout: 1s
      retries: 10
YAML

"$DOCKER" compose -p "$project" -f "$compose_file" up -d
container_before="$($DOCKER compose -p "$project" -f "$compose_file" ps -q web)"
for _ in {1..20}; do
  [[ "$($DOCKER inspect --format '{{.State.Health.Status}}' "$container_before")" == "healthy" ]] && break
  sleep 1
done
[[ "$($DOCKER inspect --format '{{.State.Health.Status}}' "$container_before")" == "healthy" ]]

state_before="$(shasum -a 256 "$preview_dir/state/marker" | awk '{print $1}')"
access_before="$(shasum -a 256 "$preview_dir/access-codes" | awk '{print $1}')"
"$DOCKER" compose -p "$project" -f "$compose_file" stop

wake_output="$(
  PREVIEW_ROOT="$proof_root" \
  PREVIEW_DOCKER="$DOCKER" \
  PREVIEW_MAX_RUNNING=2 \
  PREVIEW_WAKE_SKIP_FLOCK=true \
  PREVIEW_WAKE_HEALTH_ATTEMPTS=20 \
  PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS=1 \
  bash "$SCRIPT_DIR/wake-preview.sh" "$PROOF_PR"
)"
container_after="$($DOCKER compose -p "$project" -f "$compose_file" ps -q web)"
state_after="$(shasum -a 256 "$preview_dir/state/marker" | awk '{print $1}')"
access_after="$(shasum -a 256 "$preview_dir/access-codes" | awk '{print $1}')"

[[ "$wake_output" == *"WAKE_RESULT=woken"* ]]
[[ "$container_after" == "$container_before" ]]
[[ "$state_after" == "$state_before" ]]
[[ "$access_after" == "$access_before" ]]

printf '%s\n' "$wake_output"
printf 'PROOF_PROJECT=%s\n' "$project"
printf 'PROOF_CONTAINER_BEFORE=%s\n' "$container_before"
printf 'PROOF_CONTAINER_AFTER=%s\n' "$container_after"
printf 'PROOF_STATE_SHA256=%s\n' "$state_after"
printf 'PROOF_ACCESS_SHA256=%s\n' "$access_after"
printf 'PROOF_RESULT=pass\n'
