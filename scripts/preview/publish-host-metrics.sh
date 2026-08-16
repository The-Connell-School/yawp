#!/usr/bin/env bash
# Publish aggregate preview-host capacity metrics. No PR identifiers leave the host.
set -euo pipefail

ROOT="${PREVIEW_ROOT:-/srv/yawp-preview}"
MEMINFO_FILE="${PREVIEW_MEMINFO_FILE:-/proc/meminfo}"
DF="${PREVIEW_DF:-df}"
DOCKER="${PREVIEW_DOCKER:-docker}"
AWS="${PREVIEW_AWS:-aws}"
REGION="${PREVIEW_AWS_REGION:-us-east-1}"
NAMESPACE="Yawp/PreviewHost"

mem_total_kib="$(awk '$1 == "MemTotal:" {print $2}' "$MEMINFO_FILE")"
mem_available_kib="$(awk '$1 == "MemAvailable:" {print $2}' "$MEMINFO_FILE")"
swap_total_kib="$(awk '$1 == "SwapTotal:" {print $2}' "$MEMINFO_FILE")"
swap_free_kib="$(awk '$1 == "SwapFree:" {print $2}' "$MEMINFO_FILE")"

percent_used() {
  awk -v total="$1" -v free="$2" 'BEGIN {
    if (total <= 0) { printf "0.00"; exit }
    printf "%.2f", ((total - free) * 100) / total
  }'
}

memory_used_percent="$(percent_used "$mem_total_kib" "$mem_available_kib")"
memory_available_mib="$(awk -v kib="$mem_available_kib" 'BEGIN {printf "%.2f", kib / 1024}')"
swap_used_percent="$(percent_used "$swap_total_kib" "$swap_free_kib")"
disk_used_percent="$(
  "$DF" -P "$ROOT" \
    | awk 'NR == 2 {gsub(/%/, "", $5); print $5 + 0}'
)"

running_count=0
resident_numbers="$(
  for resident_parent in "$ROOT/previews" "$ROOT/sources"; do
    [[ -d "$resident_parent" ]] || continue
    for resident_path in "$resident_parent"/pr-*; do
      [[ -d "$resident_path" ]] || continue
      slug="$(basename "$resident_path")"
      pr="${slug#pr-}"
      [[ "$pr" =~ ^[1-9][0-9]*$ ]] || continue
      printf '%s\n' "$pr"
    done
  done | sort -un
)"
resident_count="$(printf '%s\n' "$resident_numbers" | awk 'NF {count++} END {print count + 0}')"
while IFS= read -r pr; do
  [[ -n "$pr" ]] || continue
  if "$DOCKER" ps \
    --filter "label=com.docker.compose.project=yawp-pr-${pr}" \
    --filter "label=com.docker.compose.service=web" \
    --filter status=running -q 2>/dev/null | grep -q .; then
    running_count=$((running_count + 1))
  fi
done <<<"$resident_numbers"
sleeping_count=$((resident_count - running_count))
(( sleeping_count >= 0 )) || sleeping_count=0

instance_id="${PREVIEW_INSTANCE_ID:-}"
if [[ -z "$instance_id" ]]; then
  imds_token="$(
    curl -fsS -X PUT \
      -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
      http://169.254.169.254/latest/api/token
  )"
  instance_id="$(
    curl -fsS \
      -H "X-aws-ec2-metadata-token: $imds_token" \
      http://169.254.169.254/latest/meta-data/instance-id
  )"
fi

metric_data="$(printf '[
  {"MetricName":"MemoryUsedPercent","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Percent"},
  {"MetricName":"MemoryAvailableMiB","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Megabytes"},
  {"MetricName":"SwapUsedPercent","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Percent"},
  {"MetricName":"DiskUsedPercent","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Percent"},
  {"MetricName":"ResidentPreviews","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Count"},
  {"MetricName":"RunningPreviews","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Count"},
  {"MetricName":"SleepingPreviews","Dimensions":[{"Name":"InstanceId","Value":"%s"}],"Value":%s,"Unit":"Count"}
]' \
  "$instance_id" "$memory_used_percent" \
  "$instance_id" "$memory_available_mib" \
  "$instance_id" "$swap_used_percent" \
  "$instance_id" "$disk_used_percent" \
  "$instance_id" "$resident_count" \
  "$instance_id" "$running_count" \
  "$instance_id" "$sleeping_count")"

"$AWS" cloudwatch put-metric-data \
  --region "$REGION" \
  --namespace "$NAMESPACE" \
  --metric-data "$metric_data"

printf 'Published preview metrics: memory=%s%% swap=%s%% disk=%s%% running=%s resident=%s sleeping=%s\n' \
  "$memory_used_percent" "$swap_used_percent" "$disk_used_percent" \
  "$running_count" "$resident_count" "$sleeping_count"
