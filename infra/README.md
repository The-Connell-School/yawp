# Yawp production infrastructure (Terraform root)

This directory is the Terraform root for the Yawp App Runner, RDS, and related AWS resources.

## Production variable values

Production `tfvars` (secrets and non-secret inputs) are **not** stored in git. They live in AWS Secrets Manager as JSON:

- **Secret name:** `yawp/terraform/production-tfvars`
- **Region:** `us-east-1`

Download and decrypt that secret for `terraform plan` / `apply` against production. Never commit tfvars or secret values to the repository.

See `envs/production.tfvars.example` for the shape of non-secret keys only (placeholders, no live values).

## Tests

```bash
terraform -chdir=infra test -filter=internal-integration.tftest.hcl
```

The project agent CLI runs the same contract in CI when infra paths change.
