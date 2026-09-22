#!/usr/bin/env bash
# Verify preview-host alarms retain paired recovery notifications.
set -euo pipefail

AWS="${PREVIEW_AWS:-aws}"
JQ="${PREVIEW_JQ:-jq}"
REGION="${PREVIEW_AWS_REGION:-us-east-1}"
alarms=(
  yawp-preview-host-disk-warning
  yawp-preview-host-memory-warning
  yawp-preview-host-memory-critical
  yawp-demo-host-disk-warning
  yawp-demo-host-memory-warning
  yawp-demo-host-memory-critical
)

response="$("$AWS" cloudwatch describe-alarms \
  --region "$REGION" \
  --alarm-names "${alarms[@]}" \
  --output json)"

# shellcheck disable=SC2016 # jq variables are intentionally inside a single-quoted program.
"$JQ" -e --argjson expected "${#alarms[@]}" '
  (.MetricAlarms | length) == $expected
  and all(.MetricAlarms[];
    (.ActionsEnabled == true)
    and (.AlarmActions | type == "array" and length > 0)
    and (.OKActions | type == "array" and length > 0)
    and ((.AlarmActions | sort) == (.OKActions | sort))
  )
' >/dev/null <<<"$response" || {
  echo "Preview host alarms must enable actions and retain matching non-empty AlarmActions and OKActions" >&2
  exit 1
}

"$JQ" -r '.MetricAlarms[] | "ALARM=\(.AlarmName) STATE=\(.StateValue) RECOVERY_ACTIONS=\(.OKActions | join(","))"' \
  <<<"$response"
