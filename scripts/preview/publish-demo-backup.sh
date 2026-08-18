#!/usr/bin/env bash
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/yawp-demo}"
BACKUP_FILE="${BACKUP_FILE:?BACKUP_FILE is required}"
BACKUP_S3_URI="${BACKUP_S3_URI:-s3://yawp-preview-videos/demo-backups}"

[[ "$PREVIEW_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "PREVIEW_ROOT must be an absolute path without whitespace" >&2
  exit 1
}
[[ "$BACKUP_S3_URI" =~ ^s3://[a-z0-9.-]+/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid BACKUP_S3_URI" >&2
  exit 1
}
case "$BACKUP_FILE" in
  "$PREVIEW_ROOT"/backups/yawp_demo-scheduled-*.dump|\
  "$PREVIEW_ROOT"/backups/yawp_demo-pre-reset-*.dump) ;;
  *)
    echo "BACKUP_FILE must be a scheduled or pre-reset yawp_demo backup under PREVIEW_ROOT" >&2
    exit 1
    ;;
esac
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

echo "BACKUP_S3_OBJECT=$destination/$filename"
