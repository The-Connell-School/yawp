# Marketing renderer worker.
#
# Films validated storyboards against a demo environment and uploads stills and
# silent clips for the admin Marketing Studio. Scaled to zero by default: the
# renderer costs nothing until someone sets marketing_renderer_desired_count.
#
# The worker refuses to start unless MARKETING_RENDER_TARGET_IS_DEMO is
# "confirmed", so the target below must be an environment holding demo data.

resource "aws_ecr_repository" "marketing_renderer" {
  name                 = "${var.app_name}-${var.env}-marketing-renderer"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "marketing_renderer" {
  repository = aws_ecr_repository.marketing_renderer.name

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

resource "aws_security_group" "marketing_renderer" {
  name        = "${var.app_name}-${var.env}-marketing-renderer"
  description = "Egress for the marketing renderer worker"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.app_name}-${var.env}-marketing-renderer-sg"
    Environment = var.env
    Project     = var.app_name
  }
}

resource "aws_security_group_rule" "rds_from_marketing_renderer" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.marketing_renderer.id
  description              = "Postgres access from the marketing renderer"
}

resource "aws_cloudwatch_log_group" "marketing_renderer" {
  name              = "/ecs/${var.app_name}-${var.env}-marketing-renderer"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "marketing_renderer" {
  name = "${var.app_name}-${var.env}-marketing-renderer"
}

resource "aws_iam_role" "marketing_renderer_execution" {
  name = "${var.app_name}-${var.env}-marketing-renderer-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "marketing_renderer_execution" {
  role       = aws_iam_role.marketing_renderer_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "marketing_renderer_execution_secrets" {
  name = "${var.app_name}-${var.env}-marketing-renderer-execution-secrets"
  role = aws_iam_role.marketing_renderer_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.db_url.arn]
      }
    ]
  })
}

resource "aws_iam_role" "marketing_renderer_task" {
  name = "${var.app_name}-${var.env}-marketing-renderer-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

# Write-only on the marketing prefix. The worker uploads renders; the web app
# signs the read URLs, so the renderer never needs to read the bucket back.
resource "aws_iam_role_policy" "marketing_renderer_task" {
  name = "${var.app_name}-${var.env}-marketing-renderer-task"
  role = aws_iam_role.marketing_renderer_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = ["${aws_s3_bucket.videos.arn}/marketing-media/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = ["${aws_cloudwatch_log_group.marketing_renderer.arn}:*"]
      }
    ]
  })
}

resource "aws_ecs_task_definition" "marketing_renderer" {
  family                   = "${var.app_name}-${var.env}-marketing-renderer"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.marketing_renderer_cpu
  memory                   = var.marketing_renderer_memory
  execution_role_arn       = aws_iam_role.marketing_renderer_execution.arn
  task_role_arn            = aws_iam_role.marketing_renderer_task.arn

  container_definitions = jsonencode([
    {
      name      = "marketing-renderer"
      image     = "${aws_ecr_repository.marketing_renderer.repository_url}:latest"
      essential = true

      environment = [
        { name = "AWS_S3_BUCKET_FOR_VIDEOS", value = aws_s3_bucket.videos.bucket },
        { name = "AWS_S3_REGION_FOR_VIDEOS", value = var.aws_region },
        { name = "MARKETING_RENDER_TARGET_URL", value = var.marketing_render_target_url },
        { name = "MARKETING_RENDER_TARGET_IS_DEMO", value = var.marketing_render_target_is_demo },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.marketing_renderer.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "renderer"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "marketing_renderer" {
  name            = "${var.app_name}-${var.env}-marketing-renderer"
  cluster         = aws_ecs_cluster.marketing_renderer.id
  task_definition = aws_ecs_task_definition.marketing_renderer.arn
  desired_count   = var.marketing_renderer_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.marketing_renderer.id]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}
