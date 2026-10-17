mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::422348803522:role/test-role" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b"] }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "422348803522" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:422348803522:key/fixture" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::test-yawp-production-cloudtrail-422348803522" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:fixture-abcdef" }
  }
}
mock_provider "random" {}

variables {
  aws_tf_state_s3_key     = "test-only"
  env                     = "test"
  app_name                = "test-yawp"
  session_secret          = "fixture"
  ai_usage_ip_hmac_secret = "fixture"
  internal_command_token  = "fixture"
  honeypot_secret         = "fixture"
  openai_org_id           = "fixture"
  openai_api_key          = "fixture"
  anthropic_api_key       = "fixture"
  bastion_public_key      = "fixture"
  resend_api_key          = "fixture"
  resend_from_email       = "fixture@example.test"
  sentry_dsn              = "fixture"
  posthog_api_key         = "fixture"
  posthog_host            = "https://example.test"
  production_domain_name  = ""
}

run "cloudtrail_disabled_outside_production" {
  command = plan

  assert {
    condition     = length(aws_cloudtrail.management_events) == 0 && length(aws_s3_bucket.cloudtrail_logs) == 0 && length(aws_kms_key.cloudtrail) == 0
    error_message = "CloudTrail resources must stay production-only."
  }
}

run "production_cloudtrail_is_multi_region_and_encrypted" {
  command = plan

  override_resource {
    target          = aws_kms_key.cloudtrail[0]
    override_during = plan
    values = {
      arn    = "arn:aws:kms:us-east-1:422348803522:key/fixture"
      key_id = "fixture"
    }
  }

  variables {
    env                                 = "production"
    production_domain_name              = ""
    cloudtrail_log_retention_days       = 180
    cloudtrail_kms_deletion_window_days = 7
  }

  assert {
    condition     = aws_cloudtrail.management_events[0].is_multi_region_trail && aws_cloudtrail.management_events[0].include_global_service_events && aws_cloudtrail.management_events[0].enable_log_file_validation
    error_message = "Production CloudTrail must be multi-region, include global service events, and validate log files."
  }

  assert {
    condition     = aws_cloudtrail.management_events[0].kms_key_id == aws_kms_key.cloudtrail[0].arn && one(one(aws_s3_bucket_server_side_encryption_configuration.cloudtrail_logs[0].rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "CloudTrail logs must use explicit KMS encryption."
  }

  assert {
    condition     = one([for rule in aws_s3_bucket_lifecycle_configuration.cloudtrail_logs[0].rule : one(rule.expiration).days if rule.id == "expire-cloudtrail-logs"]) == 180
    error_message = "CloudTrail log retention must be lifecycle-managed by the configured retention days."
  }
}
