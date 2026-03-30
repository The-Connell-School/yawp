# Document Archive Refactor

**Status:** Planned
**Spec:** [docs/plans/2026-01-31-refactor-document-delete-to-archive-plan.md](../plans/2026-01-31-refactor-document-delete-to-archive-plan.md)

## Goal

Replace the "Delete" button with "Archive" using the existing `archivedAt` field on DocumentSnapshot. Low complexity — schema already supports it, just needs UI and API changes.

## TODO

- [ ] Update UI to show "Archive" instead of "Delete"
- [ ] Update API to set `archivedAt` instead of deleting
- [ ] Add ability to view/restore archived documents
