data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  production_cloudtrail_enabled = var.env == "production" && var.cloudtrail_enabled
  cloudtrail_name               = var.cloudtrail_name != "" ? var.cloudtrail_name : "${var.app_name}-${var.env}-management-events"
  cloudtrail_log_bucket_name    = var.cloudtrail_log_bucket_name != "" ? var.cloudtrail_log_bucket_name : lower("${var.app_name}-${var.env}-cloudtrail-${data.aws_caller_identity.current.account_id}")
  cloudtrail_trail_arn          = "arn:${data.aws_partition.current.partition}:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.cloudtrail_name}"
  cloudtrail_log_prefix         = "${var.cloudtrail_s3_key_prefix}/AWSLogs/${data.aws_caller_identity.current.account_id}/"
  cloudtrail_tags = {
    Environment = var.env
    Project     = var.app_name
    Compliance  = "cloudtrail"
  }
}

data "aws_iam_policy_document" "cloudtrail_kms" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  statement {
    sid       = "AllowAccountKeyAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowCloudTrailEncryptLogs"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKey*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.cloudtrail_trail_arn]
    }

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudtrail:*:${data.aws_caller_identity.current.account_id}:trail/${local.cloudtrail_name}"]
    }
  }

  statement {
    sid       = "AllowCloudTrailDescribeKey"
    effect    = "Allow"
    actions   = ["kms:DescribeKey"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.cloudtrail_trail_arn]
    }
  }
}

resource "aws_kms_key" "cloudtrail" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  description             = "${var.app_name} ${var.env} CloudTrail log encryption"
  deletion_window_in_days = var.cloudtrail_kms_deletion_window_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.cloudtrail_kms[0].json

  tags = merge(local.cloudtrail_tags, {
    Name = "${local.cloudtrail_name}-kms"
  })
}

resource "aws_kms_alias" "cloudtrail" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  name          = "alias/${local.cloudtrail_name}-logs"
  target_key_id = aws_kms_key.cloudtrail[0].key_id
}

resource "aws_s3_bucket" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket = local.cloudtrail_log_bucket_name

  tags = merge(local.cloudtrail_tags, {
    Name = local.cloudtrail_log_bucket_name
  })
}

resource "aws_s3_bucket_ownership_controls" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket                  = aws_s3_bucket.cloudtrail_logs[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.cloudtrail[0].arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  rule {
    id     = "expire-cloudtrail-logs"
    status = "Enabled"

    filter {
      prefix = local.cloudtrail_log_prefix
    }

    expiration {
      days = var.cloudtrail_log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "cloudtrail_bucket" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.cloudtrail_logs[0].arn,
      "${aws_s3_bucket.cloudtrail_logs[0].arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "AWSCloudTrailAclCheck"
    effect  = "Allow"
    actions = ["s3:GetBucketAcl"]
    resources = [
      aws_s3_bucket.cloudtrail_logs[0].arn,
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.cloudtrail_trail_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid     = "AWSCloudTrailWrite"
    effect  = "Allow"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.cloudtrail_logs[0].arn}/${local.cloudtrail_log_prefix}*",
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.cloudtrail_trail_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail_logs[0].id
  policy = data.aws_iam_policy_document.cloudtrail_bucket[0].json
}

resource "aws_cloudtrail" "management_events" {
  count = local.production_cloudtrail_enabled ? 1 : 0

  name                          = local.cloudtrail_name
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs[0].bucket
  s3_key_prefix                 = var.cloudtrail_s3_key_prefix
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.cloudtrail[0].arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = merge(local.cloudtrail_tags, {
    Name = local.cloudtrail_name
  })

  depends_on = [aws_s3_bucket_policy.cloudtrail_logs]
}
