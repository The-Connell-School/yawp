# Attach inline policy to yawp-preview-github-actions so PR workflows can
# stream the DB dump from S3 (default: s3://yawp-preview-videos/production.dump).
#
# Apply once: terraform -chdir=infra/preview-github-dump-access init && terraform apply

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "github_actions_role_name" {
  type    = string
  default = "yawp-preview-github-actions"
}

variable "dump_bucket" {
  type        = string
  description = "Must match PREVIEW_AWS_S3_BUCKET / workflow default dump bucket"
  default     = "yawp-preview-videos"
}

variable "dump_key" {
  type    = string
  default = "production.dump"
}

provider "aws" {
  region = var.aws_region
}

data "aws_iam_role" "github_actions" {
  name = var.github_actions_role_name
}

resource "aws_iam_role_policy" "preview_production_dump_read" {
  name = "preview-production-dump-s3-read"
  role = data.aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadPreviewDatabaseDumpObject"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
        ]
        Resource = "arn:aws:s3:::${var.dump_bucket}/${var.dump_key}"
      },
      {
        Sid    = "ListBucketForDumpKey"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.dump_bucket}"
        Condition = {
          StringLike = {
            "s3:prefix" = ["${var.dump_key}"]
          }
        }
      },
    ]
  })
}

output "role_arn" {
  value = data.aws_iam_role.github_actions.arn
}
