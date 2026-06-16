locals {
  instance_secret_arns = [
    var.shared_database_url_secret_arn,
    var.shared_session_secret_arn,
    var.shared_honeypot_secret_arn,
    var.shared_openai_org_secret_arn,
    var.shared_openai_key_secret_arn,
    var.shared_anthropic_key_secret_arn,
    var.shared_internal_token_secret_arn,
    var.shared_resend_api_key_secret_arn,
    var.shared_sentry_dsn_secret_arn,
  ]
}

resource "aws_iam_role" "apprunner_access" {
  name = "${var.app_name}-${var.env}-apprunner-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "build.apprunner.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.app_name}-${var.env}-apprunner-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "tasks.apprunner.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "apprunner_instance" {
  name = "${var.app_name}-${var.env}-apprunner-instance-policy"
  role = aws_iam_role.apprunner_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = local.instance_secret_arns
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:CreateMultipartUpload",
          "s3:UploadPart",
          "s3:CompleteMultipartUpload",
          "s3:AbortMultipartUpload",
          "s3:ListBucketMultipartUploads",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.aws_s3_bucket_for_videos}",
          "arn:aws:s3:::${var.aws_s3_bucket_for_videos}/*"
        ]
      }
    ]
  })
}

resource "aws_apprunner_service" "web" {
  service_name = "${var.app_name}-${var.env}"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = var.web_app_image_identifier
      image_repository_type = "ECR"

      image_configuration {
        port = "8080"

        runtime_environment_variables = {
          NODE_ENV                 = "production"
          PORT                     = "8080"
          DATABASE_SCHEMA          = var.database_schema
          DATABASE_SSL_REQUIRE     = "true"
          AI_MODEL                 = var.ai_model
          EMAIL_PROVIDER           = "ses"
          AWS_SES_REGION           = var.aws_region
          SES_FROM_EMAIL           = var.resend_from_email
          RESEND_FROM_EMAIL        = var.resend_from_email
          POSTHOG_API_KEY          = var.posthog_api_key
          POSTHOG_HOST             = var.posthog_host
          AWS_S3_BUCKET_FOR_VIDEOS = var.aws_s3_bucket_for_videos
          AWS_S3_REGION_FOR_VIDEOS = var.aws_s3_region_for_videos
        }

        runtime_environment_secrets = {
          DATABASE_URL             = var.shared_database_url_secret_arn
          SESSION_SECRET           = var.shared_session_secret_arn
          HONEYPOT_SECRET          = var.shared_honeypot_secret_arn
          OPENAI_ORG_ID            = var.shared_openai_org_secret_arn
          OPENAI_API_KEY           = var.shared_openai_key_secret_arn
          ANTHROPIC_API_KEY        = var.shared_anthropic_key_secret_arn
          INTERNAL_COMMAND_TOKEN   = var.shared_internal_token_secret_arn
          RESEND_API_KEY           = var.shared_resend_api_key_secret_arn
          SENTRY_DSN               = var.shared_sentry_dsn_secret_arn
        }
      }
    }

    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = "1024"
    memory            = "2048"
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type = "DEFAULT"
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/healthcheck"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }
}
