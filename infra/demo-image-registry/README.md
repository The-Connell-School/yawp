# Demo container image registry

ECR repositories and a GitHub OIDC role used by the **Demo environment** workflow to
build images on GitHub-hosted runners. The demo host pulls by immutable SHA tag.

Apply from a workstation with AWS credentials for account `422348803522`:

```bash
terraform -chdir=infra/demo-image-registry init
terraform -chdir=infra/demo-image-registry plan
terraform -chdir=infra/demo-image-registry apply
```

If `plan` fails because the GitHub OIDC provider already exists, re-run with
`-var='create_github_oidc_provider=false'` (default). If the account has no provider
yet, use `-var='create_github_oidc_provider=true'` once.

After apply, set repository variable `DEMO_ECR_PUSH_ROLE_ARN` to the
`demo_ecr_push_role_arn` output and run `scripts/preview/guard-demo-backup-iam.sh`
so the demo instance role can pull from these repositories.
