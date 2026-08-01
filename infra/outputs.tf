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

output "marketing_renderer_ecr_repository_url" {
  description = "Push the marketing renderer image here"
  value       = aws_ecr_repository.marketing_renderer.repository_url
}

output "marketing_renderer_service_name" {
  description = "ECS service for the marketing renderer, scaled to zero by default"
  value       = aws_ecs_service.marketing_renderer.name
}
