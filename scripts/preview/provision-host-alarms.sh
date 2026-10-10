#!/usr/bin/env bash
# Create or update CloudWatch alarms for a preview/demo host instance.
set -euo pipefail

INSTANCE_ID="${1:?instance id is required}"
ALARM_PREFIX="${2:?alarm name prefix is required}"
AWS="${HOST_ALARM_AWS:-aws}"
REGION="${HOST_ALARM_AWS_REGION:-us-east-1}"
SNS_TOPIC="${HOST_ALARM_SNS_TOPIC:-arn:aws:sns:us-east-1:422348803522:yawp-preview-alerts}"
NAMESPACE="${HOST_ALARM_METRIC_NAMESPACE:-Yawp/PreviewHost}"

put_alarm() {
  local suffix="$1"
  local metric="$2"
  local threshold="$3"
  local comparison="${4:-GreaterThanOrEqualToThreshold}"
  local periods="${5:-3}"
  local eval_periods="${6:-5}"
  local period="${7:-60}"
  local description="${8:-Yawp host ${suffix} for ${INSTANCE_ID}}"

  "$AWS" cloudwatch put-metric-alarm \
    --region "$REGION" \
    --alarm-name "${ALARM_PREFIX}-${suffix}" \
    --alarm-description "$description" \
    --namespace "$NAMESPACE" \
    --metric-name "$metric" \
    --dimensions "Name=InstanceId,Value=${INSTANCE_ID}" \
    --statistic Average \
    --period "$period" \
    --evaluation-periods "$eval_periods" \
    --datapoints-to-alarm "$periods" \
    --threshold "$threshold" \
    --comparison-operator "$comparison" \
    --treat-missing-data notBreaching \
    --alarm-actions "$SNS_TOPIC" \
    --ok-actions "$SNS_TOPIC"
}

# Deploy spikes routinely cross 75% during Vite/esbuild cold starts, so there is no
# warning-tier memory alarm. Critical catches acute pressure; sustained catches leaks.
put_alarm memory-critical MemoryUsedPercent 95 GreaterThanOrEqualToThreshold 2 3

# Sustained pressure: 5-minute averages must stay at or above 80% for 20 minutes
# (4 of 4 periods). Deploy spikes rarely hold that long; creeping leaks or too many
# warm previews do.
put_alarm memory-sustained MemoryUsedPercent 80 GreaterThanOrEqualToThreshold 4 4 300 \
  "Yawp host memory-sustained (20m avg >= 80%) for ${INSTANCE_ID}"

put_alarm disk-warning DiskUsedPercent 80

echo "Provisioned alarms ${ALARM_PREFIX}-{memory-critical,memory-sustained,disk-warning} for ${INSTANCE_ID}"
