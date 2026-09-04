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

  "$AWS" cloudwatch put-metric-alarm \
    --region "$REGION" \
    --alarm-name "${ALARM_PREFIX}-${suffix}" \
    --alarm-description "Yawp host ${suffix} for ${INSTANCE_ID}" \
    --namespace "$NAMESPACE" \
    --metric-name "$metric" \
    --dimensions "Name=InstanceId,Value=${INSTANCE_ID}" \
    --statistic Average \
    --period 60 \
    --evaluation-periods "$eval_periods" \
    --datapoints-to-alarm "$periods" \
    --threshold "$threshold" \
    --comparison-operator "$comparison" \
    --treat-missing-data notBreaching \
    --alarm-actions "$SNS_TOPIC" \
    --ok-actions "$SNS_TOPIC"
}

put_alarm memory-warning MemoryUsedPercent 75
put_alarm memory-critical MemoryUsedPercent 85  GreaterThanOrEqualToThreshold 2 3
put_alarm disk-warning DiskUsedPercent 80

echo "Provisioned alarms ${ALARM_PREFIX}-{memory-warning,memory-critical,disk-warning} for ${INSTANCE_ID}"
