run "disabled_by_default" {
 command = plan
 assert {
  condition = length(output.variables) == 0 && length(output.secrets) == 0
  error_message = "Unconfigured integration must not change runtime settings."
 }
}
run "drain_preserves_credentials" {
 command = plan
 variables {
  config = {
   internal_origin = "https://internal.yawp.school"
   public_origin = "https://yawp.school"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:production-abcdef"
   issue_sessions = false
   deliver_ends = true
  }
 }
 assert {
  condition = output.variables.INTERNAL_IMPERSONATION_ENABLED == "false" && output.variables.INTERNAL_END_DELIVERY_ENABLED == "true" && length(output.secret_arns) == 2
  error_message = "Drain mode must retain delivery and both credentials."
 }
}
run "issuance_requires_delivery" {
 command = plan
 variables {
  config = {
   internal_origin = "https://internal.yawp.school"
   public_origin = "https://yawp.school"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:production-abcdef"
   issue_sessions = true
   deliver_ends = false
  }
 }
 expect_failures = [var.config]
}

run "reject_shared_credentials" {
 command = plan
 variables {
  config = {
   internal_origin = "https://internal.yawp.school"
   public_origin = "https://yawp.school"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   issue_sessions = false
   deliver_ends = false
  }
 }
 expect_failures = [var.config]
}

run "reject_wildcard_credentials" {
 command = plan
 variables {
  config = {
   internal_origin = "https://internal.yawp.school"
   public_origin = "https://yawp.school"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:production-*"
   issue_sessions = false
   deliver_ends = false
  }
 }
 expect_failures = [var.config]
}

run "reject_insecure_origin" {
 command = plan
 variables {
  config = {
   internal_origin = "http://internal.yawp.school"
   public_origin = "https://yawp.school"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:production-abcdef"
   issue_sessions = false
   deliver_ends = false
  }
 }
 expect_failures = [var.config]
}
run "activation_maps_runtime_keys" {
 command = plan
 variables {
  config = {
   internal_origin = "https://internal.yawp.school/"
   public_origin = "https://yawp.school/"
   management_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef"
   production_secret_arn = "arn:aws:secretsmanager:us-east-1:422348803522:secret:production-abcdef"
   issue_sessions = true
   deliver_ends = true
  }
 }
 assert {
  condition = output.variables.INTERNAL_IMPERSONATION_ENABLED == "true" && output.variables.INTERNAL_PLATFORM_ORIGIN == "https://internal.yawp.school" && output.variables.YAWP_PUBLIC_ORIGIN == "https://yawp.school" && output.secrets.YAWP_MANAGEMENT_SERVICE_KEY == var.config.management_secret_arn && output.secrets.YAWP_PRODUCTION_SERVICE_KEY == var.config.production_secret_arn
  error_message = "Activation must map the actual runtime keys and canonical origins."
 }
}
