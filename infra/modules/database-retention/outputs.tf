output "database_exports_bucket_name" {
  description = "S3 bucket for database export objects."
  value       = aws_s3_bucket.database_exports.bucket
}

output "database_exports_access_logs_bucket_name" {
  description = "S3 bucket receiving server access logs for database export object deletions."
  value       = aws_s3_bucket.database_exports_access_logs.bucket
}

output "rds_snapshot_cleanup_lambda_name" {
  description = "Lambda function that deletes eligible old manual RDS snapshots."
  value       = aws_lambda_function.rds_snapshot_cleanup.function_name
}
