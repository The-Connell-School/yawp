# Opt-in deployment references only. No service credentials are generated here.
variable "internal_platform_integration" {
 type = object({
  internal_origin = string
  public_origin = string
  management_secret_arn = string
  production_secret_arn = string
  issue_sessions = optional(bool, false)
  deliver_ends = optional(bool, false)
 })
 default = null
}
module "internal_platform_integration" {
 source = "./modules/internal-integration"
 config = var.internal_platform_integration
}
