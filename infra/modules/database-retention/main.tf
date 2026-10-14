locals {
  name_prefix = "${var.app_name}-${var.env}"

  common_tags = {
    Environment = var.env
    Project     = var.app_name
  }
}

data "aws_caller_identity" "current" {}

data "archive_file" "rds_snapshot_cleanup" {
  type        = "zip"
  source_file = "${path.module}/lambda/rds_snapshot_cleanup.py"
  output_path = "${path.root}/.terraform/${local.name_prefix}-rds-snapshot-cleanup.zip"
}

resource "aws_s3_bucket" "database_exports" {
  bucket = "${local.name_prefix}-database-exports"

  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-database-exports"
    DataClass = "database-export"
    Retention = "${var.export_retention_days}d"
  })
}

resource "aws_s3_bucket_ownership_controls" "database_exports" {
  bucket = aws_s3_bucket.database_exports.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "database_exports" {
  bucket                  = aws_s3_bucket.database_exports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "database_exports" {
  bucket = aws_s3_bucket.database_exports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "database_exports" {
  bucket = aws_s3_bucket.database_exports.id

  rule {
    id     = "expire-database-exports-after-${var.export_retention_days}-days"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    expiration {
      days = var.export_retention_days
    }
  }
}

resource "aws_cloudwatch_log_group" "rds_snapshot_cleanup" {
  name              = "/aws/lambda/${local.name_prefix}-rds-snapshot-cleanup"
  retention_in_days = 90

  tags = local.common_tags
}

resource "aws_iam_role" "rds_snapshot_cleanup" {
  name = "${local.name_prefix}-rds-snapshot-cleanup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

data "aws_iam_policy_document" "rds_snapshot_cleanup" {
  statement {
    sid = "WriteDeletionLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.rds_snapshot_cleanup.arn}:*"]
  }

  statement {
    sid = "InspectManualSnapshots"
    actions = [
      "rds:DescribeDBSnapshots",
      "rds:ListTagsForResource",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "DeleteEligibleManualSnapshots"
    actions   = ["rds:DeleteDBSnapshot"]
    resources = ["arn:${var.aws_partition}:rds:${var.aws_region}:${data.aws_caller_identity.current.account_id}:snapshot:*"]
  }
}

resource "aws_iam_role_policy" "rds_snapshot_cleanup" {
  name   = "${local.name_prefix}-rds-snapshot-cleanup"
  role   = aws_iam_role.rds_snapshot_cleanup.id
  policy = data.aws_iam_policy_document.rds_snapshot_cleanup.json
}

resource "aws_lambda_function" "rds_snapshot_cleanup" {
  function_name    = "${local.name_prefix}-rds-snapshot-cleanup"
  description      = "Deletes eligible manual RDS snapshots older than ${var.snapshot_retention_days} days while keeping the newest pre-deploy snapshot."
  role             = aws_iam_role.rds_snapshot_cleanup.arn
  handler          = "rds_snapshot_cleanup.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.rds_snapshot_cleanup.output_path
  source_code_hash = data.archive_file.rds_snapshot_cleanup.output_base64sha256
  timeout          = 120

  environment {
    variables = {
      DB_INSTANCE_IDENTIFIER      = var.db_instance_identifier
      SNAPSHOT_RETENTION_DAYS     = tostring(var.snapshot_retention_days)
      PRE_DEPLOY_SNAPSHOT_MARKERS = join(",", var.pre_deploy_snapshot_markers)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.rds_snapshot_cleanup,
    aws_iam_role_policy.rds_snapshot_cleanup,
  ]

  tags = local.common_tags
}

resource "aws_cloudwatch_event_rule" "rds_snapshot_cleanup" {
  name                = "${local.name_prefix}-rds-snapshot-cleanup"
  description         = "Deletes eligible manual RDS snapshots older than ${var.snapshot_retention_days} days and preserves the newest pre-deploy snapshot."
  schedule_expression = var.snapshot_cleanup_schedule_expression

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "rds_snapshot_cleanup" {
  rule = aws_cloudwatch_event_rule.rds_snapshot_cleanup.name
  arn  = aws_lambda_function.rds_snapshot_cleanup.arn
}

resource "aws_lambda_permission" "allow_rds_snapshot_cleanup_schedule" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rds_snapshot_cleanup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.rds_snapshot_cleanup.arn
}
