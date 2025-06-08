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

variable "app_name" {
  type        = string
  description = "Name of the application (e.g. AirBnB, Yawp, etc.)"
}

output "web_service_arn" {
  description = "ARN of the App Runner service"
  value       = aws_apprunner_service.web.arn
}

output "web_service_url" {
  description = "Public URL of the App Runner service"
  value       = aws_apprunner_service.web.service_url
}
