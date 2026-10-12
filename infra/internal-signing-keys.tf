# Existing production secret (values provisioned outside this root). Import adopts
# the secret into state so App Runner wiring is not dropped on the next apply.
resource "aws_secretsmanager_secret" "internal_platform_signing_keys" {
  for_each = var.internal_platform_integration != null ? { production = true } : {}
  name     = "yawp-internal/production-signing-platform-keys"

  lifecycle {
    prevent_destroy = true
  }
}

import {
  for_each = var.internal_platform_integration != null ? { production = true } : {}
  to       = aws_secretsmanager_secret.internal_platform_signing_keys[each.key]
  id       = var.internal_platform_signing_keys_secret_arn
}
