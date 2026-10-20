# Demo container image registry

ECR repositories and a GitHub OIDC role used by the **Demo environment** workflow to
build images on GitHub-hosted runners. The demo host pulls by immutable SHA tag when
`DEMO_ECR_PUSH_ROLE_ARN` is configured on the GitHub **`demo` environment**.

**Safe to merge application changes before this stack is applied:** when
`DEMO_ECR_PUSH_ROLE_ARN` is unset, the demo workflow skips AWS/ECR and the demo host
keeps building production images locally (same as before this registry existed).

Apply **after merge** when you want pull-based demo deploys, from a workstation with
AWS credentials for account `422348803522`:

```bash
export AWS_PROFILE=yawp
terraform -chdir=infra/demo-image-registry init
terraform -chdir=infra/demo-image-registry plan
terraform -chdir=infra/demo-image-registry apply
```

If `plan` fails because the GitHub OIDC provider already exists, re-run with
`-var='create_github_oidc_provider=false'` (default). If the account has no provider
yet, use `-var='create_github_oidc_provider=true'` once.

Then:

1. Set the GitHub **`demo` environment** variable (replace `<arn>` with
   `demo_ecr_push_role_arn` from apply):

   ```bash
   gh variable set DEMO_ECR_PUSH_ROLE_ARN --env demo --repo The-Connell-School/yawp --body '<arn>'
   ```

2. Grant the demo instance role ECR pull access:

   ```bash
   export AWS_PROFILE=yawp
   export AWS_REGION=us-east-1
   export DEMO_HOST=52.2.48.34
   bash scripts/preview/guard-demo-backup-iam.sh
   ```

Keep the GitHub **`demo` environment** restricted to trusted dispatchers so OIDC
`sub` (`repo:The-Connell-School/yawp:environment:demo`) cannot be assumed by untrusted
workflows.
