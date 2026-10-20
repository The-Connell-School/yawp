mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "422348803522"
    }
  }

  mock_data "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::422348803522:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

run "demo_image_push_oidc_trust" {
  command = plan

  variables {
    create_github_oidc_provider = false
  }

  assert {
    condition     = jsondecode(aws_iam_role.demo_image_push.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity"
    error_message = "Demo image push role must use GitHub OIDC web identity."
  }

  assert {
    condition     = jsondecode(aws_iam_role.demo_image_push.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "OIDC audience must remain sts.amazonaws.com."
  }

  assert {
    condition = toset(jsondecode(aws_iam_role.demo_image_push.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]) == toset([
      "repo:The-Connell-School/yawp:environment:demo",
      "repo:The-Connell-School@157837314/yawp@989330947:environment:demo",
    ])
    error_message = "Demo push role must trust legacy and immutable demo environment OIDC subjects exactly."
  }
}
