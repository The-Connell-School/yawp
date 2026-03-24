output "apprunner_service_arn" {
  description = "App Runner service ARN (for start-deployment when the image tag is unchanged)."
  value       = aws_apprunner_service.web.arn
}

output "apprunner_service_url" {
  description = "Public URL of the PR preview."
  value       = aws_apprunner_service.web.service_url
}
