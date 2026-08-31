variable "aws_region" {
  type        = string
  description = "AWS region to deploy into"
  default     = "us-east-1" # adjust as needed
}

variable "aws_tf_state_s3_key" {
  type        = string
  description = "AWS S3 key for Terraform state"
}

variable "env" {
  type        = string
  description = "Environment to deploy into"
}

variable "db_name" {
  type        = string
  description = "Name of the Postgres database"
  default     = "yawpdb"
}

variable "db_username" {
  type        = string
  description = "Master username for the RDS instance"
  default     = "yawp_admin"
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t3.small"
}

variable "db_allocated_storage" {
  type        = number
  description = "Allocated storage (GB)"
  default     = 20
}

variable "session_secret" {
  type        = string
  description = "Secret used for session encryption"
}

variable "internal_command_token" {
  type        = string
  description = "Token for internal commands"
}

variable "honeypot_secret" {
  type        = string
  description = "Secret for honeypot encryption"
}

variable "openai_org_id" {
  type        = string
  description = "OpenAI organization ID"
}

variable "openai_api_key" {
  type        = string
  description = "OpenAI API key"
}

variable "anthropic_api_key" {
  type        = string
  description = "Anthropic API key"
}

variable "bastion_public_key" {
  description = "Public SSH key for bastion host access"
  type        = string
}

variable "resend_api_key" {
  type        = string
  description = "Resend API key"
}

variable "resend_from_email" {
  type        = string
  description = "Resend from email"
}

variable "app_name" {
  type        = string
  description = "Name of the application (e.g. AirBnB, Yawp, etc.)"
}

variable "sentry_dsn" {
  type        = string
  description = "Sentry DSN"
}

variable "posthog_api_key" {
  type        = string
  description = "PostHog API key"
}

variable "posthog_host" {
  type        = string
  description = "PostHog host URL"
}

variable "production_domain_name" {
  type        = string
  description = "Public production domain served through the TLS 1.3 CloudFront edge."
  default     = "yawp.school"
}

variable "ua_student_billing_enabled" {
  type        = bool
  description = "Enable the University of Alabama student checkout and license gate."
  default     = false
}

variable "ua_organization_id" {
  type        = string
  description = "Production Organization.id for the University of Alabama."
  default     = ""
}

variable "yawp_app_origin" {
  type        = string
  description = "Public origin Stripe uses for checkout success and cancellation redirects."
  default     = "https://yawp.school"
}

variable "stripe_secret_key" {
  type        = string
  description = "Stripe API secret key for the target environment."
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  type        = string
  description = "Signing secret for the target environment's Stripe webhook endpoint."
  sensitive   = true
  default     = ""
}

variable "stripe_ua_2026_price_id" {
  type        = string
  description = "Stripe one-time Price ID for the 2026 University of Alabama student license."
  default     = ""
}

variable "stripe_ua_existing_subscription_price_ids" {
  type        = list(string)
  description = "Legacy recurring Stripe Price IDs whose subscribers should receive the UA license without paying again."
  default     = []
}
