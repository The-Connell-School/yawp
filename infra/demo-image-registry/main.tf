terraform {
  required_version = ">= 1.7"
  backend "s3" {
    bucket  = "422348803522-yawp-terraform-preview-state"
    key     = "yawp/demo/image-registry/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.0"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "github_repository" {
  type    = string
  default = "The-Connell-School/yawp"
}

variable "create_github_oidc_provider" {
  type        = bool
  default     = false
  description = "Set true only when this account has no token.actions.githubusercontent.com OIDC provider yet."
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = ["422348803522"]
  default_tags {
    tags = {
      Environment = "demo"
      Project     = "yawp"
      Purpose     = "demo-container-registry"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

data "tls_certificate" "github" {
  count = var.create_github_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_github_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
  demo_image_repositories = {
    web     = "yawp-demo-web"
    toolbox = "yawp-demo-toolbox"
  }
}

resource "aws_ecr_repository" "demo" {
  for_each             = local.demo_image_repositories
  name                 = each.value
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "demo" {
  for_each   = aws_ecr_repository.demo
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 15 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 15
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_iam_role" "demo_image_push" {
  name = "yawp-demo-image-push"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = local.github_oidc_provider_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:demo"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "demo_image_push" {
  name = "yawp-demo-ecr-push"
  role = aws_iam_role.demo_image_push.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AuthorizeRegistry"
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PushDemoImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:ListImages",
        ]
        Resource = [for repository in aws_ecr_repository.demo : repository.arn]
      },
    ]
  })
}

output "demo_ecr_push_role_arn" {
  value       = aws_iam_role.demo_image_push.arn
  description = "GitHub Actions demo environment OIDC role for pushing demo images"
}

output "demo_web_repository_url" {
  value = aws_ecr_repository.demo["web"].repository_url
}

output "demo_toolbox_repository_url" {
  value = aws_ecr_repository.demo["toolbox"].repository_url
}
