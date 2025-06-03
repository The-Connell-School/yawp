data "aws_availability_zones" "available" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = ">= 3.14.0"

  name = "yawp-${var.env}"
  cidr = "10.0.0.0/16"

  azs             = [data.aws_availability_zones.available.names[0], data.aws_availability_zones.available.names[1]]
  public_subnets  = ["10.0.0.0/24",  "10.0.1.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Environment = var.env
    Project     = "yawp"
  }
}

 resource "aws_security_group" "apprunner" {
  name        = "yawp-${var.env}-apprunner-connector"
  description = "Allows App Runner tasks to egress into the VPC"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name        = "yawp-${var.env}-apprunner-sg"
    Environment = var.env
    Project     = "yawp"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
 }

 resource "aws_security_group" "rds" {
  name        = "yawp-${var.env}-rds"
  description = "Postgres access from App Runner"
  vpc_id      = module.vpc.vpc_id

  tags = {
    Name        = "yawp-${var.env}-rds-sg"
    Environment = var.env
    Project     = "yawp"
  }

  ingress {
    description     = "Postgres"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
 }

resource "aws_security_group" "bastion" {
  name        = "yawp-${var.env}-bastion"
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
    Name        = "yawp-${var.env}-bastion-sg"
    Environment = var.env
    Project     = "yawp"
  }
}

resource "aws_key_pair" "bastion" {
  key_name   = "yawp-${var.env}-bastion-key"
  public_key = var.bastion_public_key
}

resource "aws_instance" "bastion" {
  ami           = "ami-0c7217cdde317cfec"  # Amazon Linux 2023 AMI
  instance_type = "t3.micro"
  subnet_id     = module.vpc.public_subnets[0]
  key_name      = aws_key_pair.bastion.key_name
  associate_public_ip_address = true

  vpc_security_group_ids = [aws_security_group.bastion.id]

  tags = {
    Name        = "yawp-${var.env}-bastion"
    Environment = var.env
    Project     = "yawp"
  }
}

# Update RDS security group to allow access from bastion
resource "aws_security_group_rule" "rds_from_bastion" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = aws_security_group.rds.id
}

resource "aws_ecr_repository" "web_app" {
  name                 = "yawp-${var.env}-web-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "random_password" "db_master" {
  length           = 16
  special          = true
}

resource "aws_secretsmanager_secret" "db_url" {
  name        = "yawp-${var.env}-db-url"
  description = "URL for ${var.env} RDS"
}

resource "aws_secretsmanager_secret_version" "db_url_version" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = jsonencode({
    url = "postgresql://${var.db_username}:${random_password.db_master.result}@${aws_db_instance.postgres.endpoint}/${var.db_name}"
  })
}

resource "aws_db_subnet_group" "db_subnets" {
  name       = "yawp-${var.env}-db-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name        = "yawp-${var.env}-db-subnet-group"
    Environment = var.env
    Project     = "yawp"
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "yawp-${var.env}-postgres"
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
    Name        = "yawp-${var.env}-rds-instance"
    Environment = var.env
    Project     = "yawp"
  }
}

resource "aws_apprunner_vpc_connector" "vpc_connector" {
  vpc_connector_name = "yawp-${var.env}-vpc-connector"
  subnets            = module.vpc.private_subnets
  security_groups    = [aws_security_group.apprunner.id]

  tags = {
    Name        = "yawp-${var.env}-vpc-connector"
    Environment = var.env
    Project     = "yawp"
  }
}

resource "aws_iam_role" "apprunner_access" {
  name = "yawp-${var.env}-apprunner-access-role"
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
  name = "yawp-${var.env}-apprunner-ecr-policy"
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
  name = "yawp-${var.env}-apprunner-instance-role"
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
  name = "yawp-${var.env}-apprunner-instance-policy"
  role = aws_iam_role.apprunner_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.db_url.arn
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
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "apprunner" {
  name              = "/aws/apprunner/yawp-staging"
  retention_in_days = 30

  tags = {
    Environment = var.env
    Project     = "yawp"
  }
}

resource "aws_apprunner_service" "web" {
  service_name = "yawp-staging"

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
          SESSION_SECRET = var.session_secret
          INTERNAL_COMMAND_TOKEN = var.internal_command_token
          HONEYPOT_SECRET = var.honeypot_secret
          OPENAI_ORG_ID = var.openai_org_id
          OPENAI_API_KEY = var.openai_api_key
          ANTHROPIC_API_KEY = var.anthropic_api_key
          PORT = "8080"
        }

        runtime_environment_secrets = {
          DB_CREDS = aws_secretsmanager_secret.db_url.arn
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
    Project     = "yawp"
  }
}
