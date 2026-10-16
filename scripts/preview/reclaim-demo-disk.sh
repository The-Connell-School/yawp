#!/usr/bin/env bash
# Run only on the demo host from the reviewed control checkout, before its build.
set -euo pipefail

echo 'Demo disk free before cleanup:'
df -h /
trap 'echo "Demo disk free after cleanup:"; df -h /' EXIT

# Command substitutions deliberately propagate failures. Process substitutions
# would hide a failed enumeration and could leave the protection set incomplete.
container_ids="$(docker ps -a --quiet --no-trunc)"
declare -A protected_images=()
while IFS= read -r container_id; do
  [[ -n "$container_id" ]] || continue
  container_image="$(docker container inspect --format '{{.Image}}' "$container_id")"
  image_id="$(docker image inspect --format '{{.Id}}' "$container_image")"
  if [[ ! "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Invalid container image ID; aborting cleanup" >&2
    exit 1
  fi
  protected_images["$image_id"]=1
done <<< "$container_ids"

# Resolve the complete protection set before any deletion. Full IDs avoid tag
# aliases; the set below also deduplicates images listed once per tag.
image_ids="$(docker image ls --all --quiet --no-trunc)"
declare -A candidates=()
while IFS= read -r image_id; do
  [[ -n "$image_id" ]] || continue
  if [[ ! "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Invalid candidate image ID; aborting cleanup" >&2
    exit 1
  fi
  if [[ -z "${protected_images[$image_id]:-}" ]]; then
    candidates["$image_id"]=1
  fi
done <<< "$image_ids"

if (( ${#candidates[@]} == 0 )); then
  echo 'No unused Docker images to remove.'
else
  for image_id in "${!candidates[@]}"; do
    # Never force removal. Docker can refuse images with multiple tags, child
    # images, or a container created since enumeration; retain those safely.
    if ! docker image rm "$image_id"; then
      echo "Retaining image $image_id: Docker refused non-forced removal" >&2
    fi
  done
fi

# Retain 2 GB of build cache for incremental demo builds while reclaiming older
# unused cache. This budget is finite and does not touch containers or volumes.
docker builder prune -af --keep-storage 2GB
