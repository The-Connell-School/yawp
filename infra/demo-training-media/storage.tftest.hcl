mock_provider "aws" {
  mock_data "aws_iam_role" {
    defaults = {
      arn  = "arn:aws:iam::422348803522:role/yawp-demo-role"
      name = "yawp-demo-role"
    }
  }
}

run "isolated_demo_storage" {
  command = plan

  assert {
    condition     = aws_s3_bucket.media.bucket == "yawp-demo-training-media-422348803522"
    error_message = "Storage must be isolated from existing buckets."
  }
  assert {
    condition = (
      aws_s3_bucket_public_access_block.media.block_public_acls &&
      aws_s3_bucket_public_access_block.media.block_public_policy &&
      aws_s3_bucket_public_access_block.media.ignore_public_acls &&
      aws_s3_bucket_public_access_block.media.restrict_public_buckets
    )
    error_message = "All public access must be blocked."
  }
  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.media.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "Media must use SSE-S3."
  }
  assert {
    condition = (
      toset(one(aws_s3_bucket_cors_configuration.media.cors_rule).allowed_origins) == toset(["https://demo.yawp.school", "https://internal.yawp.school", "http://127.0.0.1:6998"]) &&
      contains(one(aws_s3_bucket_cors_configuration.media.cors_rule).expose_headers, "ETag") &&
      toset(one(aws_s3_bucket_cors_configuration.media.cors_rule).allowed_methods) == toset(["PUT", "GET", "HEAD"])
    )
    error_message = "Only demo browser origins may upload and read ETags."
  }
  assert {
    condition     = one(aws_s3_bucket_lifecycle_configuration.media.rule).abort_incomplete_multipart_upload[0].days_after_initiation == 1
    error_message = "Incomplete uploads must expire."
  }
  assert {
    condition = (
      jsondecode(aws_iam_role_policy.media.policy).Statement[0].Resource == "arn:aws:s3:::yawp-demo-training-media-422348803522/teacher-trainings/*" &&
      toset(jsondecode(aws_iam_role_policy.media.policy).Statement[0].Action) == toset(["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]) &&
      jsondecode(aws_iam_role.media.assume_role_policy).Statement[0].Principal.AWS == "arn:aws:iam::422348803522:role/yawp-demo-role"
    )
    error_message = "Only the dedicated demo host may assume media access, scoped to training objects."
  }
}
