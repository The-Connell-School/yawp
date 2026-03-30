# Submission Model Consolidation (Phase 1)

**Branch:** `feat/submission-model-consolidation`
**PR:** #77
**Status:** In progress
**Spec:** [docs/superpowers/specs/2026-03-24-submission-model-consolidation-design.md](../superpowers/specs/2026-03-24-submission-model-consolidation-design.md)
**Plan:** [docs/superpowers/plans/2026-03-24-submission-model-consolidation.md](../superpowers/plans/2026-03-24-submission-model-consolidation.md)

## Goal

Consolidate `DocumentSnapshot` + `Grade` into a single `Submission` model. Enable multiple submissions per document and multi-class assignment creation.

## Strategy

Expand-and-contract migration with dual-writes to old and new tables during transition, then backfill + cutover.

## Completed

- [x] Add Submission and SubmissionComment models to schema
- [x] Dual-write Submission on document submit
- [x] Add update-submission endpoint for auto-save grading
- [x] Dual-write grading data to Submission in grade-essay
- [x] Dual-write grading updates to Submission in update-grade
- [x] Dual-write releasedAt to Submission in release-grades
- [x] Add backfill script for Submission records from existing data
- [x] Multi-class assignment creation
- [x] Seed Submission records alongside DocumentSnapshots
- [x] Save Log tab in document history (spec, plan, implementation, tests)
- [x] Support restoring from DocumentWriteJournal entries
- [x] Rebased onto current main (2026-03-30)

## Remaining

- [ ] Review and test full branch before merge
- [ ] Run backfill on production data
- [ ] Phase 2: migrate reads from old models to Submission (future)
