mock_provider "aws" {
 mock_data "aws_availability_zones" {
  defaults = { names = ["us-east-1a", "us-east-1b"] }
 }
 mock_resource "aws_secretsmanager_secret" {
  defaults = { arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:fixture-abcdef" }
 }
}
mock_provider "random" {}
variables {
 aws_tf_state_s3_key = "test-only"
 env = "test"
 app_name = "test-yawp"
 session_secret = "fixture"
 internal_command_token = "fixture"
 honeypot_secret = "fixture"
 openai_org_id = "fixture"
 openai_api_key = "fixture"
 anthropic_api_key = "fixture"
 bastion_public_key = "fixture"
 resend_api_key = "fixture"
 resend_from_email = "fixture@example.test"
 sentry_dsn = "fixture"
 posthog_api_key = "fixture"
 posthog_host = "https://example.test"
}
run "existing_runtime_preserved_when_unconfigured" {
 command = plan
 assert {
  condition = !contains(keys(aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_variables), "INTERNAL_IMPERSONATION_ENABLED") && contains(keys(aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets), "SESSION_SECRET")
  error_message = "Unconfigured integration must retain existing runtime settings without enabling impersonation."
 }
}
run "configured_runtime_and_permissions" {
 command = plan
 variables {
  internal_platform_integration = {
   internal_origin = "https://internal.yawp.school"
   public_origin = "https://yawp.school"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:production-abcdef"
   issue_sessions = true
   deliver_ends = true
  }
 }
 assert {
  condition = aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_variables["INTERNAL_IMPERSONATION_ENABLED"] == "true" && aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets["YAWP_PRODUCTION_SERVICE_KEY"] == var.internal_platform_integration.production_secret_arn && contains(keys(aws_apprunner_service.web.source_configuration[0].image_repository[0].image_configuration[0].runtime_environment_secrets), "SESSION_SECRET")
  error_message = "Integration settings must reach App Runner while retaining existing secrets."
 }
}
