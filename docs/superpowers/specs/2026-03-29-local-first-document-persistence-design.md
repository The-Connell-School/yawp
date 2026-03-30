# Local-First Document Persistence

## Problem

Document editing in YAWP suffers from data loss in several scenarios:

1. **Auth expiry during editing** — session expires, saves fail silently, app redirects away from editor, recent edits lost
2. **Silent network failures** — saves fail without user awareness, no retry
3. **Tutor interaction triggering unexpected logout** — clicking tutor feedback buttons occasionally causes redirect to logout, losing in-memory content
4. **History gaps** — DocumentVersion (3-day retention) and DocumentWriteJournal (7-day retention) are deleted, so teachers can't see full student writing progression

The current architecture is server-dependent: if a save fails for any reason, the only fallback is a fragile `localStorage` backup that doesn't work in incognito and is easily wiped.

## Design Principles

1. **Local-first persistence** — every edit is written to IndexedDB immediately, before any server communication
2. **Server sync is background and retried** — never blocking, never fire-and-forget
3. **Never redirect on auth failure** — show a banner, keep the editor open, content is safe locally
4. **Permanent history** — no retention-based deletion of revision snapshots
5. **Single-writer model** — no CRDT/OT complexity; one student owns one document

## Architecture Overview

```
Keystroke → TipTap update → IndexedDB (instant, ~1-5ms)
                                 ↓
                          SyncService (debounced 2s)
                                 ↓
                          POST /api/document/:id/save
                                 ↓
                    ┌── Success → IndexedDB syncStatus='synced'
                    ├── Network error → retry 2s, 4s, 8s... (cap 30s)
                    ├── Auth error → pause sync, show banner (no redirect)
                    └── Server error → retry with backoff
```

## Components

### 1. DocumentStore (Client-Side, IndexedDB)

**Purpose:** Durable local persistence that survives navigation, crashes, tab closes, and auth failures.

**Library:** `idb` — tiny (~1KB gzipped), well-maintained Promise wrapper around IndexedDB.

**Schema:**

```typescript
// IndexedDB database: "yawp-documents"
interface DocumentStoreEntry {
  docId: string;              // primary key
  html: string;               // current HTML content
  text: string;               // plain text content
  updatedAt: number;          // timestamp of last local edit
  serverRevision: number;     // last known server revision
  syncStatus: 'synced' | 'pending' | 'failed';
  lastSyncedAt: number | null;
  lastSyncError: string | null;
}
```

**Behavior:**

- On every TipTap `update` event: write to IndexedDB immediately (not debounced — IndexedDB writes are fast)
- On page load: compare local `updatedAt` vs server `updatedAt` for recovery (see Recovery Flow below)
- On successful server sync: update `syncStatus: 'synced'`, `serverRevision`, `lastSyncedAt`
- On failed sync: update `syncStatus: 'failed'`, `lastSyncError`

**Why IndexedDB over localStorage:**

- No 5MB quota limit (effectively unlimited)
- Doesn't block the main thread (async API)
- Works in incognito (persists for session duration)
- Not cleared by "Clear cookies" in most browsers
- Structured data — no JSON.stringify/parse overhead

### 2. SyncService (Client-Side)

**Purpose:** Reliably push local changes to the server, handling every failure mode gracefully.

**Interface:**

```typescript
type SyncStatus = 'synced' | 'saving' | 'offline' | 'auth-expired' | 'error';

interface SyncService {
  start(docId: string): void;
  stop(): void;
  forceSave(): Promise<void>;   // for Cmd+S
  getStatus(): SyncStatus;
  onStatusChange(cb: (status: SyncStatus) => void): () => void;
}
```

**Critical design decisions:**

1. **Never redirect on auth failure.** Show an inline banner: "Your session expired. Your work is saved locally. [Log back in]". The student clicks when ready — content is safe in IndexedDB.

2. **Debounce server sync, not local persistence.** Every keystroke goes to IndexedDB. Server sync is debounced to 2s.

3. **Deduplicate syncs.** Hash content before sending. If hash matches last synced hash, skip the request.

4. **Sync on visibility change.** When tab becomes hidden (`visibilitychange` event), force an immediate sync attempt. Catches "close laptop lid" and "switch tabs" cases.

5. **No more `keepalive` unmount saves.** IndexedDB makes this unnecessary — content is already persisted locally.

**Retry strategy:**

| Failure Type | Behavior |
|---|---|
| Network error | Retry with exponential backoff: 2s, 4s, 8s, 16s, cap at 30s |
| Auth error (401/403) | Pause sync, show "Session expired" banner, do NOT redirect |
| Server error (5xx) | Retry with exponential backoff |

### 3. Server-Side Save Endpoint (Simplified)

**Endpoint:**

```
POST /api/document/:id/save
  Body: { html, text, contentHash }
  Response: { ok: true, revision: number, savedAt: string }
```

**What the server does on each save:**

1. Update the `Document` row (html, text, increment revision)
2. Conditionally create a `DocumentRevision` (see smart interval logic)
3. Return the new revision number

**No more conflict detection.** With single-writer and local-first, the client is the source of truth. The server accepts whatever the client sends. If collaboration is added later, this is where CRDTs would plug in.

### 4. DocumentRevision Table (Replaces DocumentVersion + DocumentSnapshot)

**Schema:**

```prisma
model DocumentRevision {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  html       String
  text       String
  trigger    String   // 'auto' | 'submit' | 'session-start' | 'session-end'
  createdAt  DateTime @default(now())

  @@index([documentId, createdAt(sort: Desc)])
}
```

**Smart snapshot intervals — when to create a revision:**

- **Session start:** First save after >30 min of inactivity (captures "what they started with")
- **Every 30 minutes** of active editing (time-based progression for teachers)
- **Session end:** When sync service detects tab close / visibility hidden after edits (client sends `trigger: 'session-end'` in the save request body)
- **On submission:** Always snapshot before submission
- **Deduplicated:** Skip if content hash matches the last revision

**Permanent storage.** No retention policy, no deletion. A student writing for 2 hours generates ~4 revisions. Over a school year: 200-400 revisions per document — very manageable.

**Teacher history view:** Query `DocumentRevision` grouped by editing sessions (gaps >30 min = new session). Each session shows start and end snapshots. Clean, scannable timeline.

### 5. Recovery Flow (Page Load)

```
Page load → Fetch document from server (existing loader)
         → Check IndexedDB for local entry
         ↓
  ┌─ No local entry → use server content, seed IndexedDB
  ├─ Local entry, syncStatus='synced' → use server content (authoritative)
  └─ Local entry, syncStatus='pending' or 'failed'
       → Compare local updatedAt vs server updatedAt
       ├─ Local is newer → restore local content into editor, queue sync
       └─ Server is newer → use server content, update IndexedDB
```

Recovery is automatic and silent. The student opens their document and their latest work is there. A brief toast — "Recovered unsaved changes" — appears only when local recovery was needed.

**Auth expiry recovery sequence:**

1. Student is editing, session expires
2. Banner appears: "Session expired. Your work is saved locally. [Log back in]"
3. Student clicks "Log back in" → `/auth/login?redirectTo=...`
4. After login, redirected back to document page
5. Recovery flow finds newer content in IndexedDB, restores it
6. SyncService starts and pushes recovered content to server

### 6. Save Status UI

Small, unobtrusive indicator in the editor toolbar:

| Status | Display | When |
|---|---|---|
| `synced` | "Saved" (checkmark) | All changes on server |
| `saving` | "Saving..." (spinner) | Sync in progress |
| `offline` | "Saved locally" (cloud-off icon) | Network errors, retrying |
| `auth-expired` | "Session expired · [Log in]" (alert icon) | 401/403 from server |
| `error` | "Save error · retrying..." (warning icon) | Repeated server failures |

**Key UX shift:** "Saved" means saved to IndexedDB (instant). Server sync status is secondary. The student should never feel anxiety about whether their work is safe.

## What Gets Removed

- `pending-document-save.ts` — localStorage backup, replaced by IndexedDB
- `DocumentVersion` model — replaced by `DocumentRevision`
- `DocumentSnapshot` model — merged into `DocumentRevision`
- All version-creation logic in the save endpoint (20s throttled autosave, hourly snapshot)
- The retention job's version/journal cleanup (revisions are permanent)
- Conflict detection logic (baseRevision, clientSeq, stale sequence checks)
- `keepalive` unmount save
- `document-versions.tsx` component — replaced by new history view

## What Stays

- **`DocumentWriteJournal`** — keep as lightweight audit trail, no longer load-bearing for recovery. Can drop full html/text storage (keep just hashes + metadata). 7-day retention is fine.
- **TipTap editor** — unchanged
- **`Document` table** — unchanged (still the server source of truth)

## Migration Strategy

1. Deploy new `DocumentRevision` table and new save endpoint alongside existing system
2. Switch editor to use new `DocumentStore` + `SyncService`
3. Backfill: create initial `DocumentRevision` entries from existing `DocumentSnapshot` data where available
4. Remove old `DocumentVersion`, `DocumentSnapshot` tables and related code
5. Simplify `DocumentWriteJournal` (drop html/text columns, keep metadata + hashes)

## Future Considerations

- **Collaboration:** The `SyncService` → server pipeline is designed to be replaceable with a CRDT sync layer (e.g., Y.js + WebSocket) if real-time collaboration becomes important
- **Offline-first PWA:** IndexedDB persistence is the foundation for full offline support if needed
- **Compression:** If revision storage grows large, content can be gzip-compressed or delta-encoded
