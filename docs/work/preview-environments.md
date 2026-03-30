# Preview Environments

**Status:** Completed
**Merged:** 2026-03-30 via PR #84

## What Was Done

- PR preview environments with App Runner + shared DB per-schema (Terraform)
- Production dump restore from S3 for previews and E2E
- Seed overlay script for test users on production data
- CI/deploy workflow split (separate `ci.yml` and `deploy.yml`)
- GitHub preview config script
- Various pipeline fixes (TLS, IAM, retry logic)

## References

- [Preview environments portable reference](../superpowers/preview-environments-portable-reference.md)
- [Production dump spec](../superpowers/specs/2026-03-26-production-dump-for-previews-and-e2e.md)

## Cleanup

Old branches `bbrock/preview-envs-cleanup` (PR #82) and `bbrock/preview-envs-and-more` (PR #80) are superseded — should be closed.
