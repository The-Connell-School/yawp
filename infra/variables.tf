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

output "web_service_arn" {
  description = "ARN of the App Runner service"
  value       = aws_apprunner_service.web.arn
}

output "web_service_url" {
  description = "Public URL of the App Runner service"
  value       = aws_apprunner_service.web.service_url
}
