variable "app_name" {
  type        = string
  description = "Name of the application."
}

variable "env" {
  type        = string
  description = "Environment name."
}

variable "aws_region" {
  type        = string
  description = "AWS region where the database and retention resources live."
}

variable "aws_partition" {
  type        = string
  description = "AWS partition for IAM ARNs."
  default     = "aws"
}

variable "db_instance_identifier" {
  type        = string
  description = "RDS DB instance identifier whose manual snapshots may be cleaned up."
}

variable "export_retention_days" {
  type        = number
  description = "Number of days to retain database export objects in S3."
  default     = 90

  validation {
    condition     = var.export_retention_days >= 90
    error_message = "Database export retention must be at least 90 days."
  }
}

variable "snapshot_retention_days" {
  type        = number
  description = "Number of days to retain manual RDS snapshots before scheduled cleanup deletes eligible snapshots."
  default     = 90

  validation {
    condition     = var.snapshot_retention_days >= 90
    error_message = "Manual RDS snapshot retention must be at least 90 days."
  }
}

variable "snapshot_cleanup_schedule_expression" {
  type        = string
  description = "EventBridge schedule expression for manual RDS snapshot cleanup."
  default     = "cron(30 8 * * ? *)"
}

variable "pre_deploy_snapshot_markers" {
  type        = list(string)
  description = "Snapshot identifier or tag markers that classify a manual snapshot as pre-deploy."
  default     = ["pre-deploy", "predeploy"]
}
