data "aws_availability_zones" "available" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = ">= 3.14.0"

  name = "${var.app_name}-${var.env}"
  cidr = "10.0.0.0/16"

  azs             = [data.aws_availability_zones.available.names[0], data.aws_availability_zones.available.names[1]]
  public_subnets  = ["10.0.0.0/24",  "10.0.1.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Environment = var.env
    Project     = var.app_name
  }
}

 resource "aws_security_group" "apprunner" {
  name        = "${var.app_name}-${var.env}-apprunner-connector"
  description = "Allows App Runner tasks to egress into the VPC"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name        = "${var.app_name}-${var.env}-apprunner-sg"
    Environment = var.env
    Project     = var.app_name
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
 }

 resource "aws_security_group" "rds" {
  name        = "${var.app_name}-${var.env}-rds"
  description = "Postgres access from App Runner"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name        = "${var.app_name}-${var.env}-rds-sg"
    Environment = var.env
    Project     = var.app_name
  }

  ingress {
    description     = "Postgres from App Runner"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner.id]
  }

  ingress {
    description     = "Postgres from Bastion"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
 }

resource "aws_security_group" "bastion" {
  name        = "${var.app_name}-${var.env}-bastion"
  description = "Security group for bastion host"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.app_name}-${var.env}-bastion-sg"
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_key_pair" "bastion" {
  key_name   = "${var.app_name}-${var.env}-bastion-key"
  public_key = var.bastion_public_key
}

resource "aws_instance" "bastion" {
  ami           = "ami-09e6f87a47903347c"  # Amazon Linux 2023 AMI
  instance_type = "t2.micro"
  subnet_id     = module.vpc.public_subnets[0]
  key_name      = aws_key_pair.bastion.key_name
  associate_public_ip_address = true

  vpc_security_group_ids = [aws_security_group.bastion.id]

  tags = {
    Name        = "${var.app_name}-${var.env}-bastion"
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_ecr_repository" "web_app" {
  name                 = "${var.app_name}-${var.env}-web-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "web_app" {
  repository = aws_ecr_repository.web_app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the last 5 images, expire everything older"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "random_password" "db_master" {
  length           = 16
  special          = true
}

resource "aws_secretsmanager_secret" "db_url" {
  name        = "${var.app_name}-${var.env}-db-url"
  description = "URL for ${var.env} RDS"
}

resource "aws_secretsmanager_secret_version" "db_url_version" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://${var.db_username}:${random_password.db_master.result}@${aws_db_instance.postgres.endpoint}/${var.db_name}"
}

resource "aws_db_subnet_group" "db_subnets" {
  name       = "${var.app_name}-${var.env}-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name        = "${var.app_name}-${var.env}-db-subnet-group"
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "${var.app_name}-${var.env}-postgres"
  engine                 = "postgres"
  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  db_name                   = var.db_name
  username               = var.db_username
  password               = random_password.db_master.result
  db_subnet_group_name   = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  skip_final_snapshot     = true
  publicly_accessible     = false
  multi_az                = false
  storage_encrypted       = true
  backup_retention_period = 7

  tags = {
    Name        = "${var.app_name}-${var.env}-rds-instance"
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_apprunner_vpc_connector" "vpc_connector" {
  vpc_connector_name = "${var.app_name}-${var.env}-vpc-connector"
  subnets            = module.vpc.private_subnets
  security_groups    = [aws_security_group.apprunner.id]

  tags = {
    Name        = "${var.app_name}-${var.env}-vpc-connector"
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_iam_role" "apprunner_access" {
  name = "${var.app_name}-${var.env}-apprunner-access-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = { Service = "build.apprunner.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "apprunner_ecr_policy" {
  name = "${var.app_name}-${var.env}-apprunner-ecr-policy"
  role = aws_iam_role.apprunner_access.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
          "ecr:GetRepositoryPolicy",
          "ecr:ListImages"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.db_url.arn
      }
    ]
  })
}

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.app_name}-${var.env}-apprunner-instance-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "tasks.apprunner.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "apprunner_instance_policy" {
  name = "${var.app_name}-${var.env}-apprunner-instance-policy"
  role = aws_iam_role.apprunner_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.db_url.arn,
          aws_secretsmanager_secret.honeypot.arn,
          aws_secretsmanager_secret.openai_org.arn,
          aws_secretsmanager_secret.openai_key.arn,
          aws_secretsmanager_secret.anthropic_key.arn,
          aws_secretsmanager_secret.session.arn,
          aws_secretsmanager_secret.internal_token.arn,
          aws_secretsmanager_secret.sentry_dsn.arn,
          aws_secretsmanager_secret.resend_api_key.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.apprunner.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameters",
          "ssm:GetParameter"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "apprunner" {
  name              = "/aws/apprunner/${var.app_name}-${var.env}"
  retention_in_days = 30

  tags = {
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_secretsmanager_secret" "honeypot" {
  name = "${var.app_name}-${var.env}-honeypot-secret"
}

resource "aws_secretsmanager_secret_version" "honeypot" {
  secret_id     = aws_secretsmanager_secret.honeypot.id
  secret_string = var.honeypot_secret
}

resource "aws_secretsmanager_secret" "openai_org" {
  name = "${var.app_name}-${var.env}-openai-org"
}

resource "aws_secretsmanager_secret_version" "openai_org" {
  secret_id     = aws_secretsmanager_secret.openai_org.id
  secret_string = var.openai_org_id
}

resource "aws_secretsmanager_secret" "openai_key" {
  name = "${var.app_name}-${var.env}-openai-key"
}

resource "aws_secretsmanager_secret_version" "openai_key" {
  secret_id     = aws_secretsmanager_secret.openai_key.id
  secret_string = var.openai_api_key
}

resource "aws_secretsmanager_secret" "anthropic_key" {
  name = "${var.app_name}-${var.env}-anthropic-key"
}

resource "aws_secretsmanager_secret_version" "anthropic_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_key.id
  secret_string = var.anthropic_api_key
}

resource "aws_secretsmanager_secret" "session" {
  name = "${var.app_name}-${var.env}-session-secret"
}

resource "aws_secretsmanager_secret_version" "session" {
  secret_id     = aws_secretsmanager_secret.session.id
  secret_string = var.session_secret
}

resource "aws_secretsmanager_secret" "internal_token" {
  name = "${var.app_name}-${var.env}-internal-token"
}

resource "aws_secretsmanager_secret_version" "internal_token" {
  secret_id     = aws_secretsmanager_secret.internal_token.id
  secret_string = var.internal_command_token
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name = "${var.app_name}-${var.env}-resend-api-key"
}

resource "aws_secretsmanager_secret_version" "resend_api_key" {
  secret_id     = aws_secretsmanager_secret.resend_api_key.id
  secret_string = var.resend_api_key
}

resource "aws_secretsmanager_secret" "sentry_dsn" {
  name = "${var.app_name}-${var.env}-sentry-dsn"
}

resource "aws_secretsmanager_secret_version" "sentry_dsn" {
  secret_id     = aws_secretsmanager_secret.sentry_dsn.id
  secret_string = var.sentry_dsn
}

resource "aws_apprunner_service" "web" {
  service_name = "${var.app_name}-${var.env}"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.web_app.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "8080"

        runtime_environment_variables = {
          NODE_ENV = var.env
          PORT = "8080"
          AI_MODEL = "claude-sonnet-4-6"
          RESEND_FROM_EMAIL = var.resend_from_email
          POSTHOG_API_KEY = var.posthog_api_key
          POSTHOG_HOST = var.posthog_host
          AWS_S3_BUCKET_FOR_VIDEOS = aws_s3_bucket.videos.bucket
          AWS_S3_REGION_FOR_VIDEOS = "us-east-1"
        }

        runtime_environment_secrets = {
          HONEYPOT_SECRET = aws_secretsmanager_secret.honeypot.arn
          OPENAI_ORG_ID = aws_secretsmanager_secret.openai_org.arn
          OPENAI_API_KEY = aws_secretsmanager_secret.openai_key.arn
          ANTHROPIC_API_KEY = aws_secretsmanager_secret.anthropic_key.arn
          SESSION_SECRET = aws_secretsmanager_secret.session.arn
          INTERNAL_COMMAND_TOKEN = aws_secretsmanager_secret.internal_token.arn
          DATABASE_URL = aws_secretsmanager_secret.db_url.arn
          RESEND_API_KEY = aws_secretsmanager_secret.resend_api_key.arn
          SENTRY_DSN = aws_secretsmanager_secret.sentry_dsn.arn
        }
      }
    }

    auto_deployments_enabled = true
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.vpc_connector.arn
    }
  }

  health_check_configuration {
    protocol = "HTTP"
    path     = "/api/healthcheck"
    interval = 10
    timeout  = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  tags = {
    Environment = var.env
    Project     = var.app_name
  }
}

# -----------------------
# S3 bucket for videos/files
# -----------------------
resource "aws_s3_bucket" "videos" {
  bucket = "${var.app_name}-${var.env}-videos"
}

resource "aws_s3_bucket_ownership_controls" "videos" {
  bucket = aws_s3_bucket.videos.id
  rule { object_ownership = "BucketOwnerPreferred" }
}

resource "aws_s3_bucket_public_access_block" "videos" {
  bucket                  = aws_s3_bucket.videos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "videos" {
  bucket = aws_s3_bucket.videos.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "videos" {
  bucket = aws_s3_bucket.videos.id
  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = [
      "http://localhost:5173",
      "https://${aws_apprunner_service.web.service_url}",
      "https://yawp.school",
    ]
    allowed_headers = ["*"]
    expose_headers  = ["ETag", "x-amz-request-id", "x-amz-id-2"]
    max_age_seconds = 3600
  }
}

data "aws_iam_policy_document" "videos_access" {
  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:CreateMultipartUpload",
      "s3:UploadPart",
      "s3:CompleteMultipartUpload",
      "s3:AbortMultipartUpload",
      "s3:ListBucketMultipartUploads",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.videos.arn,
      "${aws_s3_bucket.videos.arn}/*"
    ]
  }
}

resource "aws_iam_policy" "videos_policy" {
  name   = "${var.app_name}-${var.env}-videos-access"
  policy = data.aws_iam_policy_document.videos_access.json
}

resource "aws_iam_role_policy_attachment" "apprunner_instance_videos" {
  role       = aws_iam_role.apprunner_instance.name
  policy_arn = aws_iam_policy.videos_policy.arn
}


# -----------------------
# EventBridge rule to call retention API daily
# -----------------------
resource "aws_cloudwatch_event_connection" "retention" {
  name                = "${var.app_name}-${var.env}-retention-connection"
  authorization_type  = "API_KEY"
  auth_parameters {
    api_key {
      key   = "x-internal-token"
      value = var.internal_command_token
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "retention" {
  name                       = "${var.app_name}-${var.env}-retention-destination"
  description                = "Calls the app retention cleanup endpoint"
  invocation_endpoint        = "${aws_apprunner_service.web.service_url}/api/domain/retention"
  http_method                = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn            = aws_cloudwatch_event_connection.retention.arn
}

resource "aws_iam_role" "events_invoke_api_destination" {
  name = "${var.app_name}-${var.env}-events-invoke-api-destination"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "events.amazonaws.com" },
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "events_invoke_api_destination_policy" {
  name = "${var.app_name}-${var.env}-events-invoke-api-destination-policy"
  role = aws_iam_role.events_invoke_api_destination.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = ["events:InvokeApiDestination"],
      Resource = aws_cloudwatch_event_api_destination.retention.arn
    }]
  })
}

resource "aws_cloudwatch_event_rule" "retention_daily" {
  name                = "${var.app_name}-${var.env}-retention-daily"
  # Runs at 08:00 UTC daily (~2:00 AM CST / 3:00 AM CDT)
  schedule_expression = "cron(0 8 * * ? *)"
  description         = "Daily retention cleanup trigger"
}

resource "aws_cloudwatch_event_target" "retention_daily_target" {
  rule      = aws_cloudwatch_event_rule.retention_daily.name
  arn       = aws_cloudwatch_event_api_destination.retention.arn
  role_arn  = aws_iam_role.events_invoke_api_destination.arn
}
