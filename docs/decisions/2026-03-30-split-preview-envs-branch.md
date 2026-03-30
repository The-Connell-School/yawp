# Split preview environments into clean branch

**Date:** 2026-03-30

## Decision

Created `bbrock/preview-envs-clean` from main by cherry-picking only CI/CD + AWS preview commits from the old `bbrock/preview-envs-cleanup` branch. Merged as PR #84.

## Reason

The old branch had web-app feature changes (local-first persistence, paste alert, AI model default, design docs) mixed in with infrastructure work. Needed a clean branch with only CI/CD changes to merge safely.

## What Was Separated

- **Merged (PR #84):** Preview environments, production dump restore, CI/deploy workflow split, Terraform, pipeline fixes
- **Moved to `bbrock/misc-fixes` (PR #85):** AI model default, paste alert
- **Moved to `feat/submission-model-consolidation` (PR #77):** Submission model design docs (already existed on that branch)

## Cleanup

PRs #80 and #82 (old preview-envs branches) should be closed as superseded.
