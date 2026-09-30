# Opt-in wiring for the authenticated internal content API
# (/api/internal/v1/rubrics). The service key is created OUTSIDE Terraform
# (see docs/internal-platform-integration.md); only its exact Secrets Manager
# ARN is supplied here, so no credential enters tfvars or Terraform state.
variable "internal_content_integration" {
  type = object({
    secret_arn = string
    enabled    = optional(bool, false)
  })
  default = null

  validation {
    condition     = var.internal_content_integration == null ? true : can(regex("^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$", var.internal_content_integration.secret_arn))
    error_message = "Provide an exact Secrets Manager ARN, never a raw credential."
  }
}

# Distinctness from the management/production keys is enforced by a precondition
# on aws_apprunner_service.web (cross-variable validation needs Terraform >= 1.9;
# repo minimum is 1.5).
locals {
  internal_content_variables = var.internal_content_integration == null ? {} : {
    INTERNAL_CONTENT_ENABLED = tostring(var.internal_content_integration.enabled)
  }
  internal_content_secrets = var.internal_content_integration == null ? {} : {
    YAWP_CONTENT_SERVICE_KEY = var.internal_content_integration.secret_arn
  }
  internal_content_secret_arns = var.internal_content_integration == null ? [] : [var.internal_content_integration.secret_arn]
}
