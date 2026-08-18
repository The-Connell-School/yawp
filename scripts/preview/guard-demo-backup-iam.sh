#!/usr/bin/env bash
set -euo pipefail

DEMO_HOST="${DEMO_HOST:?DEMO_HOST is required}"
BACKUP_S3_URI="${BACKUP_S3_URI:-s3://yawp-preview-videos/demo-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
POLICY_NAME="yawp-demo-backup-deny-delete"

[[ "$DEMO_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || {
  echo "Invalid DEMO_HOST" >&2
  exit 1
}
[[ "$BACKUP_S3_URI" =~ ^s3://[a-z0-9.-]+/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid BACKUP_S3_URI" >&2
  exit 1
}
[[ "$AWS_REGION" =~ ^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$ ]] || {
  echo "Invalid AWS_REGION" >&2
  exit 1
}

instance_id="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --filters \
    "Name=ip-address,Values=$DEMO_HOST" \
    'Name=instance-state-name,Values=pending,running,stopping,stopped' \
  --query 'Reservations[].Instances[].InstanceId' \
  --output text)"
[[ "$instance_id" =~ ^i-[a-f0-9]+$ ]] || {
  echo "Expected exactly one EC2 instance for DEMO_HOST; received: ${instance_id:-none}" >&2
  exit 1
}

profile_arn="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$instance_id" \
  --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' \
  --output text)"
[[ "$profile_arn" =~ ^arn:[a-z0-9-]+:iam::[0-9]{12}:instance-profile/[A-Za-z0-9+=,.@_/-]+$ ]] || {
  echo "Demo instance has no valid IAM instance profile" >&2
  exit 1
}
profile_name="${profile_arn##*/}"

role_name="$(aws iam get-instance-profile \
  --instance-profile-name "$profile_name" \
  --query 'InstanceProfile.Roles[].RoleName' \
  --output text)"
[[ "$role_name" =~ ^[A-Za-z0-9+=,.@_-]{1,64}$ ]] || {
  echo "Expected exactly one IAM role on the demo instance profile" >&2
  exit 1
}
role_arn="$(aws iam get-role \
  --role-name "$role_name" \
  --query 'Role.Arn' \
  --output text)"
[[ "$role_arn" =~ ^arn:[a-z0-9-]+:iam::[0-9]{12}:role/.+$ ]] || {
  echo "Could not resolve the demo host IAM role ARN" >&2
  exit 1
}

destination="${BACKUP_S3_URI%/}"
bucket_and_prefix="${destination#s3://}"
bucket="${bucket_and_prefix%%/*}"
prefix="${bucket_and_prefix#*/}"
resource_arn="arn:aws:s3:::${bucket}/${prefix}/*"
policy_document="$(printf '{"Version":"2012-10-17","Statement":[{"Sid":"DenyDemoBackupDeletion","Effect":"Deny","Action":["s3:DeleteObject","s3:DeleteObjectVersion"],"Resource":"%s"}]}' "$resource_arn")"

aws iam put-role-policy \
  --role-name "$role_name" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$policy_document"

decisions="$(aws iam simulate-principal-policy \
  --policy-source-arn "$role_arn" \
  --action-names s3:DeleteObject s3:DeleteObjectVersion \
  --resource-arns "$resource_arn" \
  --query 'EvaluationResults[].EvalDecision' \
  --output text)"
decision_count=0
for decision in $decisions; do
  [[ "$decision" == "explicitDeny" ]] || {
    echo "Demo role does not explicitly deny backup deletion: $decisions" >&2
    exit 1
  }
  decision_count=$((decision_count + 1))
done
[[ "$decision_count" == "2" ]] || {
  echo "AWS did not return both backup deletion decisions" >&2
  exit 1
}

echo "DEMO_INSTANCE_ID=$instance_id"
echo "DEMO_INSTANCE_ROLE=$role_name"
echo "DEMO_BACKUP_DELETE_DECISION=explicitDeny"
