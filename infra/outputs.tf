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
  description = "ARN of the Secrets Manager secret holding DB creds"
  value       = aws_secretsmanager_secret.db_credentials.arn
}
