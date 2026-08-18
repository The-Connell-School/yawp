#!/usr/bin/env bash
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/yawp-demo}"
BACKUP_FILE="${BACKUP_FILE:?BACKUP_FILE is required}"
BACKUP_S3_URI="${BACKUP_S3_URI:-s3://yawp-preview-videos/demo-backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"

[[ "$PREVIEW_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "PREVIEW_ROOT must be an absolute path without whitespace" >&2
  exit 1
}
[[ "$BACKUP_S3_URI" =~ ^s3://[a-z0-9.-]+/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid BACKUP_S3_URI" >&2
  exit 1
}
if [[ ! "$BACKUP_RETENTION_COUNT" =~ ^[1-9][0-9]{0,2}$ ]] \
  || (( BACKUP_RETENTION_COUNT < 1 || BACKUP_RETENTION_COUNT > 365 )); then
  echo "BACKUP_RETENTION_COUNT must be between 1 and 365" >&2
  exit 1
fi
[[ "$BACKUP_FILE" == "$PREVIEW_ROOT"/backups/yawp_demo-scheduled-*.dump ]] || {
  echo "BACKUP_FILE must be a scheduled yawp_demo backup under PREVIEW_ROOT" >&2
  exit 1
}
[[ -f "$BACKUP_FILE" && ! -L "$BACKUP_FILE" ]] || {
  echo "BACKUP_FILE must be a regular non-symlink file" >&2
  exit 1
}
checksum_file="${BACKUP_FILE}.sha256"
[[ -f "$checksum_file" && ! -L "$checksum_file" ]] || {
  echo "Backup checksum sidecar is missing" >&2
  exit 1
}

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
else
  actual_checksum="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
fi
expected_checksum="$(awk 'NR == 1 {print $1}' "$checksum_file")"
[[ "$expected_checksum" =~ ^[a-fA-F0-9]{64}$ && "$actual_checksum" == "$expected_checksum" ]] || {
  echo "Backup checksum mismatch" >&2
  exit 1
}

destination="${BACKUP_S3_URI%/}"
bucket_and_prefix="${destination#s3://}"
bucket="${bucket_and_prefix%%/*}"
prefix="${bucket_and_prefix#*/}/"
filename="$(basename "$BACKUP_FILE")"
versioning_status="$(aws s3api get-bucket-versioning \
  --bucket "$bucket" \
  --query Status \
  --output text)"
[[ "$versioning_status" == "Enabled" ]] || {
  echo "Demo backup bucket versioning must be enabled" >&2
  exit 1
}

aws s3 cp "$BACKUP_FILE" "$destination/$filename" \
  --sse AES256 \
  --only-show-errors
aws s3 cp "$checksum_file" "$destination/${filename}.sha256" \
  --sse AES256 \
  --only-show-errors

versioned_keys_text="$(aws s3api list-object-versions \
  --bucket "$bucket" \
  --prefix "$prefix" \
  --query '[Versions[].Key, DeleteMarkers[].Key][]' \
  --output text)"
dump_keys_text=''
while IFS= read -r object_key; do
  [[ -n "$object_key" && "$object_key" != "None" ]] || continue
  dump_key="${object_key%.sha256}"
  [[ "$dump_key" == "$prefix"yawp_demo-scheduled-*.dump ]] || continue
  dump_keys_text+="${dump_key}"$'\n'
done <<<"$(printf '%s\n' "$versioned_keys_text" | tr '\t' '\n')"
sorted_dump_keys="$(printf '%s' "$dump_keys_text" | LC_ALL=C sort -ur)"
keys=()
while IFS= read -r key; do
  [[ -n "$key" ]] && keys+=("$key")
done <<<"$sorted_dump_keys"

for ((index = BACKUP_RETENTION_COUNT; index < ${#keys[@]}; index++)); do
  key="${keys[$index]}"
  [[ "$key" == "$prefix"yawp_demo-scheduled-*.dump ]] || {
    echo "Refusing to delete unexpected S3 key: $key" >&2
    exit 1
  }
  for object_key in "$key" "${key}.sha256"; do
    versions_text="$(aws s3api list-object-versions \
      --bucket "$bucket" \
      --prefix "$object_key" \
      --query '[Versions[].[Key,VersionId], DeleteMarkers[].[Key,VersionId]][]' \
      --output text)"
    while read -r returned_key version_id; do
      [[ "$returned_key" == "$object_key" ]] || continue
      [[ -n "$version_id" && "$version_id" != "None" ]] || continue
      aws s3api delete-object \
        --bucket "$bucket" \
        --key "$object_key" \
        --version-id "$version_id" >/dev/null
    done <<<"$versions_text"
  done
done

echo "BACKUP_S3_OBJECT=$destination/$filename"
