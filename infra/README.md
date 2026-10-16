# Yawp production infrastructure (Terraform root)

This directory is the Terraform root for the Yawp App Runner, RDS, and related AWS resources.

## Production variable values

Production `tfvars` (secrets and non-secret inputs) are **not** stored in git. They live in AWS Secrets Manager as JSON:

- **Secret name:** `yawp/terraform/production-tfvars`
- **Region:** `us-east-1`

Download and decrypt that secret for `terraform plan` / `apply` against production. Never commit tfvars or secret values to the repository.

See `envs/production.tfvars.example` for the shape of non-secret keys only (placeholders, no live values).

## Optional Google OAuth credential wiring

`google_oauth_credentials_configured` defaults to `false`: no Google secret
metadata is adopted and App Runner receives no additional secret ARNs or IAM
permissions. An approved future opt-in also requires `google_oauth_secret_arns`
with `client_id` and `client_secret` set to the full existing ARNs, including
their AWS suffixes. Validation restricts these to
`yawp-production-google-oauth-client-id` and
`yawp-production-google-oauth-client-secret` in account `422348803522`,
region `us-east-1`, and the production environment.

The declarative imports adopt secret metadata with `prevent_destroy`; no secret
versions or credential values are managed here. App Runner resolves the ARNs as
`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. This configuration does
not enable the `unified-sign-on` feature flag.

Demo and preview workflows independently accept optional GitHub secrets named
`DEMO_GOOGLE_OAUTH_CLIENT_ID` / `DEMO_GOOGLE_OAUTH_CLIENT_SECRET` and
`PREVIEW_GOOGLE_OAUTH_CLIENT_ID` / `PREVIEW_GOOGLE_OAUTH_CLIENT_SECRET`.
They pass through the host as `PREVIEW_GOOGLE_OAUTH_*` and into the web container
under the exact runtime names above. Missing values remain empty; the existing
application handles unavailable Google credentials. Credentials are excluded
from the tooling container, masked before host transport, and redacted from
detached deployment failure logs.

## Production CloudTrail

Production plans create a multi-region management-event CloudTrail named
`<app_name>-production-management-events`. Logs are written under the
`cloudtrail/` prefix in a private S3 bucket with KMS default encryption, S3
versioning, public access blocks, TLS-only bucket policy, and lifecycle
expiration. The default current-object retention is 365 days and can be adjusted
with `cloudtrail_log_retention_days` before plan review.

## Tests

```bash
terraform -chdir=infra test -filter=internal-integration.tftest.hcl
```

The project agent CLI runs the same contract in CI when infra paths change.
