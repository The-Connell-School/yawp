variable "app_name" {
  type        = string
  description = "Application name prefix for App Runner and IAM."
  default     = "yawp-preview"
}

variable "env" {
  type        = string
  description = "PR environment suffix, e.g. pr-42."
}

variable "aws_region" {
  type        = string
  description = "AWS region (must match ECR and shared RDS)."
  default     = "us-east-1"
}

variable "database_schema" {
  type        = string
  description = "Postgres schema for this PR (e.g. pr_42)."
}

variable "web_app_image_identifier" {
  type        = string
  description = "ECR image URI with tag, e.g. 123.dkr.ecr.us-east-1.amazonaws.com/yawp-preview-web-app:pr-42."
}

variable "shared_database_url_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for shared preview/staging DATABASE_URL (base URL without schema=)."
}

variable "shared_session_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for SESSION_SECRET."
}

variable "shared_honeypot_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for HONEYPOT_SECRET."
}

variable "shared_openai_org_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for OPENAI_ORG_ID."
}

variable "shared_openai_key_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for OPENAI_API_KEY."
}

variable "shared_anthropic_key_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for ANTHROPIC_API_KEY."
}

variable "shared_internal_token_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for INTERNAL_COMMAND_TOKEN."
}

variable "shared_resend_api_key_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for RESEND_API_KEY."
}

variable "shared_sentry_dsn_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for SENTRY_DSN (may be a placeholder secret for previews)."
}

variable "aws_s3_bucket_for_videos" {
  type        = string
  description = "Existing S3 bucket for video uploads (e.g. staging bucket; previews are non-prod only)."
}

variable "aws_s3_region_for_videos" {
  type        = string
  default     = "us-east-1"
}

variable "ai_model" {
  type        = string
  description = "AI model id passed to the app."
  default     = "claude-3-7-sonnet-20250219"
}

variable "resend_from_email" {
  type        = string
  description = "From address for Resend."
}

variable "posthog_api_key" {
  type        = string
  default     = ""
}

variable "posthog_host" {
  type        = string
  default     = ""
}
