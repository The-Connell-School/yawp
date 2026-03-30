# CI/Deploy Workflow Split

**Status:** Completed
**Merged:** 2026-03-30 with preview environments (PR #84)

## What Changed

Split `.github/workflows/deploy.yml` into two workflows:

- **`ci.yml`** — Runs on push to main AND pull requests to main. Contains: typecheck, E2E tests, Terraform validate.
- **`deploy.yml`** — Runs only on push to main. Contains: Docker build + push to ECR.

## Why

The old single workflow triggered on PRs targeting main, which caused the deploy job to show as a check on PRs even though it was skipped via an `if` guard.
