terraform {
  required_version = ">= 1.7"
  backend "s3" {
    bucket  = "422348803522-yawp-terraform-preview-state"
    key     = "yawp/demo/training-media/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = ["422348803522"]
  default_tags {
    tags = { Environment = "demo", Project = "yawp", Purpose = "teacher-training-media" }
  }
}

# Host resources are owned by the existing demo bootstrap/IAM control plane.
# Read this role; add one new inline policy without adopting or editing it.
data "aws_iam_role" "demo_host" {
  name = "yawp-demo-role"
}

resource "aws_s3_bucket" "media" {
  bucket        = "yawp-demo-training-media-422348803522"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    # Existing admin UI, hosted Internal, and the exact demo acceptance origin.
    allowed_origins = ["https://demo.yawp.school", "https://internal.yawp.school", "http://127.0.0.1:6998"]
    allowed_headers = ["content-type", "content-length", "x-amz-*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    id     = "abort-incomplete-training-uploads"
    status = "Enabled"
    filter { prefix = "teacher-trainings/" }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

resource "aws_s3_bucket_policy" "media_tls" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_iam_role" "media" {
  name = "yawp-demo-training-media"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = data.aws_iam_role.demo_host.arn }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "media" {
  name = "training-media-objects"
  role = aws_iam_role.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      # S3 create/upload-part/complete all authorize via PutObject, not API names.
      # No ListParts call is made by this implementation.
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
      Resource = "arn:aws:s3:::yawp-demo-training-media-422348803522/teacher-trainings/*"
    }]
  })
}

resource "aws_iam_role_policy" "demo_host_assume_media" {
  name = "yawp-demo-assume-training-media"
  role = data.aws_iam_role.demo_host.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sts:AssumeRole"
      Resource = aws_iam_role.media.arn
    }]
  })
}

output "bucket" { value = aws_s3_bucket.media.bucket }
output "region" { value = "us-east-1" }
output "runtime_role_arn" { value = aws_iam_role.media.arn }
