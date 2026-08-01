variable "aws_region" {
  type        = string
  description = "AWS region to deploy into"
  default     = "us-east-1"   # adjust as needed
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

variable "marketing_renderer_desired_count" {
  type        = number
  description = "Running marketing renderer tasks. Zero means renders queue but nothing films them."
  default     = 0
}

variable "marketing_renderer_cpu" {
  type        = string
  description = "Fargate CPU units for the marketing renderer. Chromium wants at least 1 vCPU."
  default     = "1024"
}

variable "marketing_renderer_memory" {
  type        = string
  description = "Fargate memory (MiB) for the marketing renderer."
  default     = "2048"
}

variable "marketing_render_target_url" {
  type        = string
  description = "Demo environment the renderer films. Never a production URL."
  default     = ""
}

variable "marketing_render_target_is_demo" {
  type        = string
  description = "Must be \"confirmed\" for the renderer to start. States that the target holds demo data only."
  default     = ""
}
