# Local-First Document Persistence

**Branch:** `feature/local-first-persistence`
**PR:** #83
**Status:** Parked

## Goal

Offline-capable document editing with IndexedDB-first persistence and background server sync via SyncService.

## What It Adds

- DocumentRevision model for permanent, session-grouped history
- DocumentStore (IndexedDB wrapper) for client-side persistence
- SyncService with retry/backoff for background server sync
- `/api/document/$id/save` endpoint with smart revision creation (~30 min intervals or on triggers)
- SaveStatusIndicator component
- Content hash deduplication

## Why It Was Reverted

Reverted from main on 2026-03-30. The new save flow stopped writing to the old `DocumentSnapshot` and `DocumentVersion` tables. Existing views depend on those tables being populated. Needs backward compatibility (dual-write to old models) before merging back.

## Before Re-merging

- [ ] Add dual-write to DocumentSnapshot (hourly, matching old cadence)
- [ ] Add dual-write to DocumentVersion (throttled ~20s, matching old cadence)
- [ ] Verify existing document history views still work
- [ ] Run full E2E suite
- [ ] DocumentRevision table already exists in DB — schema just needs the model re-added

## Notes

- The DB already has the DocumentRevision table (migration ran before revert)
- Prisma schema on main intentionally omits DocumentRevision — the old code doesn't reference it
- AuditEvent removal was cherry-picked and kept on main separately
