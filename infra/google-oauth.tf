# Adopt metadata for existing production secrets only after explicit opt-in.
# Values stay outside Terraform; App Runner resolves the ARNs at runtime.
locals {
  google_oauth_enabled  = var.google_oauth_credentials_configured && var.env == "production"
  google_oauth_adoption = local.google_oauth_enabled ? { production = true } : {}
}

resource "aws_secretsmanager_secret" "google_oauth_client_id" {
  for_each    = local.google_oauth_adoption
  name        = "yawp-production-google-oauth-client-id"
  description = "Existing production Google OAuth client ID"

  lifecycle {
    prevent_destroy = true
  }
}

import {
  for_each = local.google_oauth_adoption
  to       = aws_secretsmanager_secret.google_oauth_client_id[each.key]
  id       = var.google_oauth_secret_arns.client_id
}

resource "aws_secretsmanager_secret" "google_oauth_client_secret" {
  for_each    = local.google_oauth_adoption
  name        = "yawp-production-google-oauth-client-secret"
  description = "Existing production Google OAuth client secret"

  lifecycle {
    prevent_destroy = true
  }
}

import {
  for_each = local.google_oauth_adoption
  to       = aws_secretsmanager_secret.google_oauth_client_secret[each.key]
  id       = var.google_oauth_secret_arns.client_secret
}
