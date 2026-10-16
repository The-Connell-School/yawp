mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "422348803522"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"logging.s3.amazonaws.com\"},\"Action\":\"s3:PutObject\",\"Resource\":\"arn:aws:s3:::test-yawp-production-database-export-access-logs/database-exports/*\"}]}"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:422348803522:log-group:/aws/lambda/test-yawp-production-rds-snapshot-cleanup"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::422348803522:role/test-yawp-production-rds-snapshot-cleanup"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-1:422348803522:function:test-yawp-production-rds-snapshot-cleanup"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:us-east-1:422348803522:rule/test-yawp-production-rds-snapshot-cleanup"
    }
  }
}

variables {
  app_name               = "test-yawp"
  env                    = "production"
  aws_region             = "us-east-1"
  db_instance_identifier = "test-yawp-production-postgres"
}

run "database_exports_expire_after_90_days" {
  command = plan

  assert {
    condition = (
      aws_s3_bucket.database_exports.bucket == "test-yawp-production-database-exports" &&
      aws_s3_bucket_lifecycle_configuration.database_exports.rule[0].status == "Enabled" &&
      aws_s3_bucket_lifecycle_configuration.database_exports.rule[0].expiration[0].days == 90 &&
      aws_s3_bucket_lifecycle_configuration.database_exports.rule[0].abort_incomplete_multipart_upload[0].days_after_initiation == 7
    )
    error_message = "Database export bucket must expire export objects after the 90-day retention window."
  }
}

run "database_export_deletions_are_logged" {
  command = plan

  assert {
    condition = (
      aws_s3_bucket.database_exports_access_logs.bucket == "test-yawp-production-database-export-access-logs" &&
      aws_s3_bucket_logging.database_exports.target_prefix == "database-exports/" &&
      aws_s3_bucket_lifecycle_configuration.database_exports_access_logs.rule[0].expiration[0].days == 400 &&
      strcontains(data.aws_iam_policy_document.database_exports_access_logs.json, "logging.s3.amazonaws.com")
    )
    error_message = "Database export bucket lifecycle deletions must emit S3 server access logs to a retained audit bucket."
  }
}

run "snapshot_cleanup_is_scheduled_and_guarded" {
  command = plan

  assert {
    condition = (
      aws_cloudwatch_event_rule.rds_snapshot_cleanup.schedule_expression == "cron(30 8 * * ? *)" &&
      aws_lambda_function.rds_snapshot_cleanup.environment[0].variables.DB_INSTANCE_IDENTIFIER == "test-yawp-production-postgres" &&
      aws_lambda_function.rds_snapshot_cleanup.environment[0].variables.SNAPSHOT_RETENTION_DAYS == "90" &&
      aws_lambda_function.rds_snapshot_cleanup.environment[0].variables.PRE_DEPLOY_SNAPSHOT_MARKERS == "pre-deploy,predeploy" &&
      aws_iam_role_policy.rds_snapshot_cleanup.name == "test-yawp-production-rds-snapshot-cleanup"
    )
    error_message = "Snapshot cleanup must run on a schedule with 90-day retention and explicit pre-deploy markers."
  }
}

run "retention_cannot_be_shortened_below_90_days" {
  command = plan

  variables {
    export_retention_days   = 89
    snapshot_retention_days = 89
  }

  expect_failures = [
    var.export_retention_days,
    var.snapshot_retention_days,
  ]
}
