mock_provider "aws" {
  override_during = plan
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::422348803522:role/test-role" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:422348803522:log-group:fixture" }
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
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:fixture-abcdef" }
  }
}
mock_provider "random" {}
variables {
  cloudtrail_enabled      = false
  production_domain_name  = ""
  aws_tf_state_s3_key     = "test-only"
  env                     = "production"
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
}
run "default_off" {
  command = plan
  assert {
    condition = (
      length(aws_secretsmanager_secret.google_oauth_client_id) == 0 &&
      length(aws_secretsmanager_secret.google_oauth_client_secret) == 0 &&
      !contains(keys(aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets), "GOOGLE_OAUTH_CLIENT_ID") &&
      !contains(keys(aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets), "GOOGLE_OAUTH_CLIENT_SECRET")
    )
    error_message = "Default configuration must not adopt or wire Google OAuth credentials."
  }
  assert {
    condition     = !strcontains(aws_iam_role_policy.apprunner_instance_policy.policy, "google-oauth")
    error_message = "Default IAM permissions must not include Google OAuth secrets."
  }
}

run "opt_in_arn_wiring" {
  command = plan
  variables {
    google_oauth_credentials_configured = true
    google_oauth_secret_arns = {
      client_id     = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-id-ABC123"
      client_secret = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-secret-DEF456"
    }
  }
  override_resource {
    override_during = plan
    target          = aws_secretsmanager_secret.google_oauth_client_id["production"]
    values          = { arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-id-ABC123" }
  }
  override_resource {
    override_during = plan
    target          = aws_secretsmanager_secret.google_oauth_client_secret["production"]
    values          = { arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-secret-DEF456" }
  }
  assert {
    condition = (
      aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets["GOOGLE_OAUTH_CLIENT_ID"] == var.google_oauth_secret_arns.client_id &&
      aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets["GOOGLE_OAUTH_CLIENT_SECRET"] == var.google_oauth_secret_arns.client_secret
    )
    error_message = "App Runner must receive existing secret ARNs under the exact runtime names."
  }
  assert {
    condition = alltrue([
      for arn in [var.google_oauth_secret_arns.client_id, var.google_oauth_secret_arns.client_secret] :
      contains(jsondecode(aws_iam_role_policy.apprunner_instance_policy.policy).Statement[0].Resource, arn)
    ])
    error_message = "App Runner GetSecretValue must allow both adopted ARNs."
  }
}

run "missing_metadata_rejected" {
  command = plan
  variables {
    google_oauth_credentials_configured = true
  }
  expect_failures = [var.google_oauth_credentials_configured]
}

run "demo_cannot_adopt_production_credentials" {
  command = plan
  variables {
    env                                 = "demo"
    google_oauth_credentials_configured = true
    google_oauth_secret_arns = {
      client_id     = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-id-ABC123"
      client_secret = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-secret-DEF456"
    }
  }
  expect_failures = [var.google_oauth_credentials_configured]
}

run "wrong_account_rejected" {
  command = plan
  variables {
    google_oauth_credentials_configured = true
    google_oauth_secret_arns = {
      client_id     = "arn:aws:secretsmanager:us-east-1:000000000000:secret:yawp-production-google-oauth-client-id-ABC123"
      client_secret = "arn:aws:secretsmanager:us-east-1:422348803522:secret:yawp-production-google-oauth-client-secret-DEF456"
    }
  }
  expect_failures = [var.google_oauth_secret_arns]
}
