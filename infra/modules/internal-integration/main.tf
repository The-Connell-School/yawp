variable "config" {
 type = object({
  internal_origin = string
  public_origin = string
  management_secret_arn = string
  production_secret_arn = string
  issue_sessions = optional(bool, false)
  deliver_ends = optional(bool, false)
 })
 default = null
 validation {
  condition = var.config == null ? true : (!var.config.issue_sessions || var.config.deliver_ends)
  error_message = "Session issuance requires termination delivery."
 }
 validation {
  condition = var.config == null ? true : alltrue([for origin in [var.config.internal_origin,var.config.public_origin] : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$", origin))])
  error_message = "Use plain HTTPS origins without credentials, paths or queries."
 }
 validation {
  condition = var.config == null ? true : (var.config.management_secret_arn != var.config.production_secret_arn && alltrue([for arn in [var.config.management_secret_arn,var.config.production_secret_arn] : can(regex("^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$",arn))]))
  error_message = "Provide distinct exact Secrets Manager ARNs, never raw credentials."
 }
}
output "variables" {
 value = var.config == null ? {} : {
  INTERNAL_PLATFORM_ORIGIN = trimsuffix(var.config.internal_origin,"/")
  YAWP_PUBLIC_ORIGIN = trimsuffix(var.config.public_origin,"/")
  INTERNAL_IMPERSONATION_ENABLED = tostring(var.config.issue_sessions)
  INTERNAL_END_DELIVERY_ENABLED = tostring(var.config.deliver_ends)
 }
}
output "secrets" {
 value = var.config == null ? {} : {
  YAWP_MANAGEMENT_SERVICE_KEY = var.config.management_secret_arn
  YAWP_PRODUCTION_SERVICE_KEY = var.config.production_secret_arn
 }
}
output "secret_arns" {
 value = var.config == null ? [] : [var.config.management_secret_arn,var.config.production_secret_arn]
}
