data "aws_availability_zones" "available" {}

locals {
  production_edge_enabled = var.env == "production" && var.production_domain_name != ""
  ua_billing_runtime_enabled = var.ua_student_billing_enabled && var.ua_stripe_credentials_configured
  production_domain_zone  = "${trim(var.production_domain_name, ".")}."
  production_edge_aliases = distinct([var.production_domain_name, var.ua_partner_hostname])
  apprunner_origin_domain = trimsuffix(replace(replace(aws_apprunner_service.web.service_url, "https://", ""), "http://", ""), "/")
}

data "aws_route53_zone" "production_domain" {
  count        = local.production_edge_enabled ? 1 : 0
  name         = local.production_domain_zone
  private_zone = false
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  count = local.production_edge_enabled ? 1 : 0
  name  = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  count = local.production_edge_enabled ? 1 : 0
  name  = "Managed-AllViewer"
}

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
        Resource = concat(
          [
            aws_secretsmanager_secret.db_url.arn,
            aws_secretsmanager_secret.honeypot.arn,
            aws_secretsmanager_secret.openai_org.arn,
            aws_secretsmanager_secret.openai_key.arn,
            aws_secretsmanager_secret.anthropic_key.arn,
            aws_secretsmanager_secret.session.arn,
            aws_secretsmanager_secret.internal_token.arn,
            aws_secretsmanager_secret.sentry_dsn.arn,
            aws_secretsmanager_secret.resend_api_key.arn
          ],
          module.internal_platform_integration.secret_arns,
          local.ua_billing_runtime_enabled ? [
            aws_secretsmanager_secret.stripe_secret_key[0].arn,
            aws_secretsmanager_secret.stripe_webhook_secret[0].arn
          ] : []
        )
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
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
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

resource "aws_secretsmanager_secret" "stripe_secret_key" {
  count = var.ua_stripe_credentials_configured ? 1 : 0
  name  = "${var.app_name}-${var.env}-stripe-secret-key"
}

resource "aws_secretsmanager_secret_version" "stripe_secret_key" {
  count         = var.ua_stripe_credentials_configured ? 1 : 0
  secret_id     = aws_secretsmanager_secret.stripe_secret_key[0].id
  secret_string = var.stripe_secret_key
}

resource "aws_secretsmanager_secret" "stripe_webhook_secret" {
  count = var.ua_stripe_credentials_configured ? 1 : 0
  name  = "${var.app_name}-${var.env}-stripe-webhook-secret"
}

resource "aws_secretsmanager_secret_version" "stripe_webhook_secret" {
  count         = var.ua_stripe_credentials_configured ? 1 : 0
  secret_id     = aws_secretsmanager_secret.stripe_webhook_secret[0].id
  secret_string = var.stripe_webhook_secret
}

resource "aws_apprunner_service" "web" {
  depends_on = [aws_iam_role_policy.apprunner_instance_policy]
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

        runtime_environment_variables = merge({
          NODE_ENV = var.env
          PORT = "8080"
          AI_MODEL = "claude-sonnet-4-6"
          EMAIL_PROVIDER = "ses"
          AWS_SES_REGION = var.aws_region
          SES_FROM_EMAIL = var.resend_from_email
          RESEND_FROM_EMAIL = var.resend_from_email
          POSTHOG_API_KEY = var.posthog_api_key
          POSTHOG_HOST = var.posthog_host
          AWS_S3_BUCKET_FOR_VIDEOS = aws_s3_bucket.videos.bucket
          AWS_S3_REGION_FOR_VIDEOS = "us-east-1"
          UA_STUDENT_BILLING_ENABLED                = tostring(local.ua_billing_runtime_enabled)
          UA_ORGANIZATION_ID                        = var.ua_organization_id
          UA_PARTNER_CODE                           = var.ua_partner_code
          UA_PARTNER_HOSTNAME                       = var.ua_partner_hostname
          STRIPE_UA_2026_PRICE_ID                   = var.stripe_ua_2026_price_id
          YAWP_APP_ORIGIN                           = var.yawp_app_origin
        }, length(var.stripe_ua_existing_subscription_price_ids) > 0 ? {
          STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS = join(",", var.stripe_ua_existing_subscription_price_ids)
        } : {}, module.internal_platform_integration.variables)

        runtime_environment_secrets = merge({
          HONEYPOT_SECRET = aws_secretsmanager_secret.honeypot.arn
          OPENAI_ORG_ID = aws_secretsmanager_secret.openai_org.arn
          OPENAI_API_KEY = aws_secretsmanager_secret.openai_key.arn
          ANTHROPIC_API_KEY = aws_secretsmanager_secret.anthropic_key.arn
          SESSION_SECRET = aws_secretsmanager_secret.session.arn
          INTERNAL_COMMAND_TOKEN = aws_secretsmanager_secret.internal_token.arn
          DATABASE_URL = aws_secretsmanager_secret.db_url.arn
          RESEND_API_KEY = aws_secretsmanager_secret.resend_api_key.arn
          SENTRY_DSN = aws_secretsmanager_secret.sentry_dsn.arn
        }, local.ua_billing_runtime_enabled ? {
          STRIPE_SECRET_KEY     = aws_secretsmanager_secret.stripe_secret_key[0].arn
          STRIPE_WEBHOOK_SECRET = aws_secretsmanager_secret.stripe_webhook_secret[0].arn
        } : {}, module.internal_platform_integration.secrets)
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

  lifecycle {
    precondition {
      condition = (
        (!var.ua_stripe_credentials_configured || (
          trimspace(var.stripe_secret_key) != "" &&
          trimspace(var.stripe_webhook_secret) != "" &&
          trimspace(var.stripe_ua_2026_price_id) != ""
        )) &&
        (var.ua_student_billing_enabled ? var.ua_stripe_credentials_configured : true) &&
        (!var.ua_student_billing_enabled || (
          trimspace(var.ua_organization_id) != "" &&
          trimspace(var.ua_partner_code) != "" &&
          trimspace(var.ua_partner_hostname) != "" &&
          var.yawp_app_origin == "https://${var.ua_partner_hostname}"
        ))
      )
      error_message = "UA Stripe credential staging requires the Stripe key, webhook secret, and price ID; enabling billing also requires the organization ID, partner code, partner hostname, and a matching HTTPS UA app origin."
    }
  }
}

# CloudFront forwards the viewer Host header so the application can select the
# UA partner experience. App Runner rejects unassociated Host values at its
# Envoy edge, so the partner hostname must also be registered here even though
# public A/AAAA traffic terminates at CloudFront.
resource "aws_apprunner_custom_domain_association" "ua_partner" {
  count                = local.production_edge_enabled && var.ua_partner_hostname != var.production_domain_name ? 1 : 0
  domain_name          = var.ua_partner_hostname
  enable_www_subdomain = false
  service_arn          = aws_apprunner_service.web.arn
}

resource "aws_route53_record" "ua_apprunner_cert_validation" {
  # App Runner returns two computed validation records. Fixed keys keep the
  # graph plannable on the first apply, before their names are known.
  for_each = local.production_edge_enabled && var.ua_partner_hostname != var.production_domain_name ? toset(["0", "1"]) : toset([])

  allow_overwrite = true
  name            = tolist(aws_apprunner_custom_domain_association.ua_partner[0].certificate_validation_records)[tonumber(each.key)].name
  records         = [tolist(aws_apprunner_custom_domain_association.ua_partner[0].certificate_validation_records)[tonumber(each.key)].value]
  ttl             = 60
  type            = tolist(aws_apprunner_custom_domain_association.ua_partner[0].certificate_validation_records)[tonumber(each.key)].type
  zone_id         = data.aws_route53_zone.production_domain[0].zone_id
}

resource "aws_acm_certificate" "web_edge" {
  count             = local.production_edge_enabled ? 1 : 0
  domain_name       = var.production_domain_name
  subject_alternative_names = var.ua_partner_hostname == var.production_domain_name ? [] : [var.ua_partner_hostname]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_route53_record" "web_edge_cert_validation" {
  for_each = local.production_edge_enabled ? {
    for option in aws_acm_certificate.web_edge[0].domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.production_domain[0].zone_id
}

resource "aws_acm_certificate_validation" "web_edge" {
  count                   = local.production_edge_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.web_edge[0].arn
  validation_record_fqdns = [for record in aws_route53_record.web_edge_cert_validation : record.fqdn]
}

resource "aws_cloudfront_distribution" "web_edge" {
  count           = local.production_edge_enabled ? 1 : 0
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.app_name}-${var.env} TLS 1.3 edge"
  aliases         = local.production_edge_aliases

  origin {
    domain_name = local.apprunner_origin_domain
    origin_id   = "apprunner-web"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 120
    }
  }

  default_cache_behavior {
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "apprunner-web"
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer[0].id
    compress                 = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web_edge[0].certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  tags = {
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_route53_record" "production_domain_a" {
  count           = local.production_edge_enabled ? 1 : 0
  allow_overwrite = true
  name            = var.production_domain_name
  type            = "A"
  zone_id         = data.aws_route53_zone.production_domain[0].zone_id

  alias {
    name                   = aws_cloudfront_distribution.web_edge[0].domain_name
    zone_id                = aws_cloudfront_distribution.web_edge[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "production_domain_aaaa" {
  count           = local.production_edge_enabled ? 1 : 0
  allow_overwrite = true
  name            = var.production_domain_name
  type            = "AAAA"
  zone_id         = data.aws_route53_zone.production_domain[0].zone_id

  alias {
    name                   = aws_cloudfront_distribution.web_edge[0].domain_name
    zone_id                = aws_cloudfront_distribution.web_edge[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ua_domain_a" {
  count           = local.production_edge_enabled ? 1 : 0
  allow_overwrite = true
  name            = var.ua_partner_hostname
  type            = "A"
  zone_id         = data.aws_route53_zone.production_domain[0].zone_id

  alias {
    name                   = aws_cloudfront_distribution.web_edge[0].domain_name
    zone_id                = aws_cloudfront_distribution.web_edge[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ua_domain_aaaa" {
  count           = local.production_edge_enabled ? 1 : 0
  allow_overwrite = true
  name            = var.ua_partner_hostname
  type            = "AAAA"
  zone_id         = data.aws_route53_zone.production_domain[0].zone_id

  alias {
    name                   = aws_cloudfront_distribution.web_edge[0].domain_name
    zone_id                = aws_cloudfront_distribution.web_edge[0].hosted_zone_id
    evaluate_target_health = false
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
      "https://${var.ua_partner_hostname}",
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
