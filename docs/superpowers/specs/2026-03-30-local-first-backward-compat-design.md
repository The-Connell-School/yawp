# Local-First Document Persistence — Backward Compatible Design

## Overview

Add the local-first document persistence system (IndexedDB + SyncService + DocumentRevision) alongside the existing save flow with zero modifications to existing code. The old debounced PUT remains the primary save path. The new system runs in parallel as a local safety net and lays the groundwork for a future cutover.

## Approach

**Add only, change nothing.** Every existing file, endpoint, component, and test continues to work exactly as before. New code is appended, never replacing.

## Schema

Add DocumentRevision model to Prisma schema:

```prisma
model DocumentRevision {
  id         String   @id @default(cuid())
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  html       String
  text       String
  trigger    String   // 'auto' | 'submit' | 'session-start' | 'session-end'

  @@index([documentId, createdAt(sort: Desc)])
}
```

The table already exists in the DB from a previous migration. The migration file will be added but is effectively a no-op — mark as applied or use `createIfNotExists` pattern.

No changes to Document, DocumentVersion, or DocumentSnapshot models.

## New Utility Files

### `app/utils/content-hash.ts`
SHA-256 hash of `html\0text`. Used by SyncService to deduplicate — if the old PUT already saved the same content, SyncService skips the POST.

### `app/utils/document-store.ts`
IndexedDB wrapper for `yawp-documents` database. Stores document content locally with fields: `docId`, `html`, `text`, `updatedAt`, `serverRevision`, `syncStatus`, `lastSyncedAt`, `lastSyncError`, `contentHash`. Falls back to in-memory Map for SSR/tests.

### `app/utils/sync-service.ts`
Background sync orchestrator. 2s debounce, exponential backoff retry (up to 30s), status reporting. POSTs to `/api/document/$id/save`. Status states: `synced`, `saving`, `offline`, `auth-expired`, `error`.

Each utility has its own test file. These files are standalone with no imports from existing application code beyond standard shared utils.

## New API Endpoints

### POST `/api/document/$id/save`
- Accepts: `{ html, text, contentHash, trigger? }`
- Creates DocumentWriteJournal entry (lightweight audit)
- Updates Document record (html, text, revision++)
- Creates DocumentRevision smartly: on explicit triggers (session-start, session-end, submit) or every 30 minutes for auto-saves
- Returns: `{ ok: true, revision, savedAt }`
- Has its own test file

### GET `/api/document/$id/revisions`
- Returns paginated DocumentRevision list ordered by createdAt desc
- Used by the new DocumentHistory component

The old PUT `/api/model/document/$id` and GET `/api/model/document.$id.versions` remain completely untouched.

### Deduplication

Both the old PUT and the new POST write to the same Document record. SyncService uses content hash comparison — if the old PUT already saved identical content, SyncService detects no change and skips the POST. No double-writes.

## New UI Components

### `app/components/save-status-indicator.tsx`
Displays SyncService status (synced/saving/offline/auth-expired/error) with appropriate icon and message. Added to the document page navbar alongside the existing save status display. The old "Saving"/"Saved"/"Save failed" UI remains primary and untouched.

### `app/routes/app_.documents_.$id/_components/document-history.tsx`
Shows DocumentRevision history grouped by sessions with trigger labels (auto, submit, session-start, session-end). View-only (no restore — that stays in the old component).

### Integration with existing DocumentVersions

A thin wrapper parent component renders the existing DocumentVersions component with an added "Revisions" tab. The wrapper does not modify DocumentVersions internals — it wraps it and adds the tab option that switches between the old component's content and the new DocumentHistory content.

The existing "Snapshots" and "Autosaves" tabs continue to work exactly as before.

## Editor Integration

Minimal additive changes to two existing files:

### `editor/index.tsx` (append only)
- Add a `useEffect` that initializes SyncService + DocumentStore on mount, tears down on unmount
- Add a `documentStore.put()` call inside the existing `onUpdate` handler (appended after existing debounce trigger)
- Add optional `onSyncStatusChange` callback prop (ignored if not provided)

Nothing removed or modified: debounced PUT, `setIsSaving`, `onRemoteSaveSuccess`, `onRemoteSaveFailure`, `clientSeq`, `baseRevision` — all untouched.

### `route.tsx` (append only)
- Add `syncStatus` state, pass `onSyncStatusChange` to Editor
- Add the thin wrapper parent that renders both DocumentVersions and DocumentHistory
- Add SaveStatusIndicator to the navbar area

No existing props, callbacks, or UI elements removed or modified.

## Testing

- **New unit tests**: `content-hash.test.ts`, `document-store.test.ts`, `sync-service.test.ts`, `api.document.$id.save/route.test.ts`
- **New E2E test**: `document-local-first.spec.ts` — verifies IndexedDB persistence and the new save endpoint
- **Existing tests**: Zero modifications. All existing tests pass as-is since no existing code is changed.

## What This Enables

Once deployed and observed in production for a few weeks:
1. Verify DocumentRevisions are being created correctly alongside old DocumentVersions/Snapshots
2. Verify IndexedDB recovery works in edge cases (tab close, auth expiry, network loss)
3. When confident, flip to making SyncService the primary save path (future PR)
4. Eventually sunset the old PUT endpoint and DocumentVersions/Snapshots (far future)

## Files Added

```
app/utils/content-hash.ts (+ test)
app/utils/document-store.ts (+ test)
app/utils/sync-service.ts (+ test)
app/components/save-status-indicator.tsx
app/routes/api.document.$id.save/route.ts (+ test)
app/routes/api.document.$id.revisions/route.ts
app/routes/app_.documents_.$id/_components/document-history.tsx
e2e/tests/document-local-first.spec.ts
packages/prisma/schema.prisma (DocumentRevision model added)
packages/prisma/migrations/... (DocumentRevision migration)
```

## Files Modified (append only)

```
app/routes/app_.documents_.$id/editor/index.tsx — add SyncService init + IndexedDB write
app/routes/app_.documents_.$id/route.tsx — add syncStatus, SaveStatusIndicator, wrapper parent
```
