output "ecr_repository_url" {
  description = "URL to push and pull container images"
  value       = aws_ecr_repository.web_app.repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the ECR repository"
  value       = aws_ecr_repository.web_app.arn
}

output "db_address" {
  description = "RDS endpoint"
  value       = aws_db_instance.postgres.address
}

output "db_port" {
  description = "RDS port"
  value       = aws_db_instance.postgres.port
}

output "db_secret_arn" {
  description = "ARN of the database URL secret"
  value       = aws_secretsmanager_secret.db_url.arn
}

output "bastion_public_ip" {
  description = "Public IP address of the bastion host"
  value       = aws_instance.bastion.public_ip
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

output "bastion_security_group_id" {
  description = "Bastion security group ID"
  value       = aws_security_group.bastion.id
}

output "web_service_arn" {
  description = "ARN of the App Runner service"
  value       = aws_apprunner_service.web.arn
}

output "web_service_url" {
  description = "Public URL of the App Runner service"
  value       = aws_apprunner_service.web.service_url
}

output "videos_bucket_name" {
  description = "S3 bucket for videos/files"
  value       = aws_s3_bucket.videos.bucket
}

output "database_exports_bucket_name" {
  description = "S3 bucket for database exports with 90-day lifecycle expiry"
  value       = module.database_retention.database_exports_bucket_name
}

output "database_exports_access_logs_bucket_name" {
  description = "S3 bucket receiving server access logs for database export object deletions"
  value       = module.database_retention.database_exports_access_logs_bucket_name
}

output "rds_snapshot_cleanup_lambda_name" {
  description = "Lambda function that deletes eligible old manual RDS snapshots"
  value       = module.database_retention.rds_snapshot_cleanup_lambda_name
}

output "cloudtrail_trail_arn" {
  description = "ARN of the production multi-region CloudTrail trail, when enabled."
  value       = try(aws_cloudtrail.management_events[0].arn, null)
}

output "cloudtrail_log_bucket_name" {
  description = "S3 bucket that stores production CloudTrail logs, when enabled."
  value       = try(aws_s3_bucket.cloudtrail_logs[0].bucket, null)
}

output "cloudtrail_kms_key_arn" {
  description = "KMS key used for production CloudTrail log encryption, when enabled."
  value       = try(aws_kms_key.cloudtrail[0].arn, null)
}
