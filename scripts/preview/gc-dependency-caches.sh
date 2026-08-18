#!/usr/bin/env bash
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
GRACE_HOURS="${PREVIEW_DEPENDENCY_CACHE_GRACE_HOURS:-168}"
NOW_EPOCH="${PREVIEW_GC_NOW_EPOCH:-$(date +%s)}"

if [[ ! "$GRACE_HOURS" =~ ^[0-9]+$ ]]; then
  echo "PREVIEW_DEPENDENCY_CACHE_GRACE_HOURS must be a nonnegative integer" >&2
  exit 1
fi
if [[ ! "$NOW_EPOCH" =~ ^[0-9]+$ ]]; then
  echo "PREVIEW_GC_NOW_EPOCH must be a nonnegative integer" >&2
  exit 1
fi

referenced_fingerprints=' '
shopt -s nullglob
for reference_file in "$ROOT"/previews/*/dependency-cache.sha256; do
  fingerprint="$(<"$reference_file")"
  if [[ "$fingerprint" =~ ^[0-9a-f]{64}$ ]]; then
    referenced_fingerprints+="$fingerprint "
  else
    echo "Ignoring invalid dependency cache reference: $reference_file" >&2
  fi
done
shopt -u nullglob

grace_seconds="$((GRACE_HOURS * 3600))"
while IFS= read -r volume; do
  [[ -n "$volume" ]] || continue
  if [[ ! "$volume" =~ ^yawp-preview-deps-v[0-9]+-([0-9a-f]{64})-(root|web)$ ]]; then
    echo "Ignoring malformed labeled dependency cache volume: $volume" >&2
    continue
  fi
  fingerprint="${BASH_REMATCH[1]}"
  [[ "$referenced_fingerprints" != *" $fingerprint "* ]] || continue

  label_fingerprint="$(docker volume inspect --format '{{ index .Labels "com.yawp.preview.dependency-fingerprint" }}' "$volume")"
  created_at="$(docker volume inspect --format '{{ index .Labels "com.yawp.preview.created-at" }}' "$volume")"
  if [[ "$label_fingerprint" != "$fingerprint" || ! "$created_at" =~ ^[0-9]+$ ]]; then
    echo "Ignoring dependency cache with inconsistent labels: $volume" >&2
    continue
  fi
  if (( created_at > NOW_EPOCH || NOW_EPOCH - created_at < grace_seconds )); then
    continue
  fi

  if docker volume rm "$volume" >/dev/null 2>&1; then
    echo "Removed unused dependency cache volume $volume"
  else
    echo "Keeping dependency cache volume $volume: still mounted" >&2
  fi
done < <(
  docker volume ls \
    --filter label=com.yawp.preview.dependency-cache=true \
    --format '{{.Name}}'
)

# Production image layers are labeled explicitly. Default image prune targets only
# dangling images, and Docker retains anything referenced by a running or stopped
# container; the age filter preserves a rollback/build-cache window.
docker image prune --force \
  --filter label=com.yawp.preview.production-runtime=true \
  --filter "until=${GRACE_HOURS}h" \
  >/dev/null
