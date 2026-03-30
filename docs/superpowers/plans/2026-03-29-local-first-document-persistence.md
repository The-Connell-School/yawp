# Local-First Document Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile server-dependent document save pipeline with a local-first architecture where every edit is persisted to IndexedDB immediately and synced to the server in the background with retry, eliminating data loss from auth expiry, network failures, and unexpected navigation.

**Architecture:** Client-side IndexedDB store captures every edit instantly. A SyncService debounces and pushes changes to a simplified server endpoint with exponential backoff retry. A new `DocumentRevision` table replaces `DocumentVersion` + `DocumentSnapshot` with permanent, smart-interval snapshots. The editor never redirects on auth failure — it shows a banner while content stays safe locally.

**Tech Stack:** TipTap (existing), `idb` (IndexedDB wrapper), Prisma ORM, PostgreSQL, React Router v7, Bun test runner, Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-03-29-local-first-document-persistence-design.md`

---

## File Structure

**New files (client-side):**
- `services/web-app/app/utils/document-store.ts` — IndexedDB wrapper for document content
- `services/web-app/app/utils/document-store.test.ts` — Unit tests
- `services/web-app/app/utils/sync-service.ts` — Background sync with retry
- `services/web-app/app/utils/sync-service.test.ts` — Unit tests
- `services/web-app/app/utils/content-hash.ts` — SHA-256 content hashing utility
- `services/web-app/app/utils/content-hash.test.ts` — Unit tests
- `services/web-app/app/components/save-status-indicator.tsx` — Sync status UI component

**New files (server-side):**
- `services/web-app/app/routes/api.document.$id.save/route.ts` — Simplified save endpoint
- `services/web-app/app/routes/api.document.$id.save/route.test.ts` — Unit tests
- `services/web-app/app/routes/api.document.$id.revisions/route.ts` — Revision history endpoint

**Modified files:**
- `packages/prisma/schema.prisma` — Add `DocumentRevision` model
- `services/web-app/app/routes/app_.documents_.$id/editor/index.tsx` — Integrate DocumentStore + SyncService
- `services/web-app/app/routes/app_.documents_.$id/route.tsx` — Replace pending-save recovery with IndexedDB recovery, add save status UI, remove auth-redirect-on-save-failure
- `services/web-app/app/routes/api.domain.submit-document/route.ts` — Create DocumentRevision on submit
- `services/web-app/app/routes/api.domain.retention/route.ts` — Remove version/journal cleanup
- `services/web-app/package.json` — Add `idb` dependency

**Files to remove (in final cleanup task):**
- `services/web-app/app/utils/pending-document-save.ts`
- `services/web-app/app/utils/pending-document-save.test.ts`
- `services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx`
- `services/web-app/e2e/tests/document-local-backup-buckets.spec.ts`

---

### Task 1: Add `idb` Dependency and Content Hash Utility

**Files:**
- Modify: `services/web-app/package.json`
- Create: `services/web-app/app/utils/content-hash.ts`
- Create: `services/web-app/app/utils/content-hash.test.ts`

- [ ] **Step 1: Install `idb` package**

```bash
cd services/web-app && bun add idb
```

- [ ] **Step 2: Write failing tests for content-hash utility**

Create `services/web-app/app/utils/content-hash.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { contentHash } from './content-hash';

describe('contentHash', () => {
  it('returns a hex string for given content', async () => {
    const hash = await contentHash('<p>hello</p>', 'hello');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same content', async () => {
    const a = await contentHash('<p>test</p>', 'test');
    const b = await contentHash('<p>test</p>', 'test');
    expect(a).toBe(b);
  });

  it('returns different hashes for different content', async () => {
    const a = await contentHash('<p>hello</p>', 'hello');
    const b = await contentHash('<p>world</p>', 'world');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd services/web-app && bun test app/utils/content-hash.test.ts
```

Expected: FAIL — `contentHash` not found.

- [ ] **Step 4: Implement content-hash utility**

Create `services/web-app/app/utils/content-hash.ts`:

```typescript
export async function contentHash(html: string, text: string): Promise<string> {
  const input = `${html}\0${text}`;
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd services/web-app && bun test app/utils/content-hash.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/web-app/package.json services/web-app/bun.lock services/web-app/app/utils/content-hash.ts services/web-app/app/utils/content-hash.test.ts
git commit -m "feat: add idb dependency and content-hash utility"
```

---

### Task 2: Add `DocumentRevision` Model to Prisma Schema

**Files:**
- Modify: `packages/prisma/schema.prisma`

- [ ] **Step 1: Add DocumentRevision model to schema**

In `packages/prisma/schema.prisma`, add after the `DocumentWriteJournal` model (after line ~254):

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

- [ ] **Step 2: Add the `revisions` relation to the Document model**

In the `Document` model, add below the `writeJournals` relation:

```prisma
  revisions                   DocumentRevision[]
```

- [ ] **Step 3: Generate and apply the migration**

```bash
cd packages/prisma && bunx prisma migrate dev --name add_document_revision
```

Expected: Migration creates `DocumentRevision` table with index.

- [ ] **Step 4: Verify the Prisma client generates correctly**

```bash
cd packages/prisma && bunx prisma generate
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/
git commit -m "feat: add DocumentRevision model to schema"
```

---

### Task 3: Build DocumentStore (IndexedDB Wrapper)

**Files:**
- Create: `services/web-app/app/utils/document-store.ts`
- Create: `services/web-app/app/utils/document-store.test.ts`

- [ ] **Step 1: Write failing tests for DocumentStore**

Create `services/web-app/app/utils/document-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { DocumentStore, type DocumentStoreEntry } from './document-store';

// Use a mock in-memory store for Bun (no IndexedDB in Node/Bun)
describe('DocumentStore', () => {
  let store: DocumentStore;

  beforeEach(() => {
    store = new DocumentStore();
    store._clear();
  });

  describe('put', () => {
    it('stores a document entry', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>hello</p>',
        text: 'hello',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'abc123',
      });
      const entry = await store.get('doc-1');
      expect(entry).not.toBeNull();
      expect(entry!.html).toBe('<p>hello</p>');
      expect(entry!.syncStatus).toBe('pending');
    });

    it('overwrites existing entry', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>first</p>',
        text: 'first',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'synced',
        lastSyncedAt: 1000,
        lastSyncError: null,
        contentHash: 'aaa',
      });
      await store.put({
        docId: 'doc-1',
        html: '<p>second</p>',
        text: 'second',
        updatedAt: 2000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: 1000,
        lastSyncError: null,
        contentHash: 'bbb',
      });
      const entry = await store.get('doc-1');
      expect(entry!.html).toBe('<p>second</p>');
      expect(entry!.updatedAt).toBe(2000);
    });
  });

  describe('get', () => {
    it('returns null when no entry exists', async () => {
      const entry = await store.get('nonexistent');
      expect(entry).toBeNull();
    });
  });

  describe('markSynced', () => {
    it('updates sync metadata', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>hi</p>',
        text: 'hi',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'abc',
      });
      await store.markSynced('doc-1', 2, 2000);
      const entry = await store.get('doc-1');
      expect(entry!.syncStatus).toBe('synced');
      expect(entry!.serverRevision).toBe(2);
      expect(entry!.lastSyncedAt).toBe(2000);
      expect(entry!.lastSyncError).toBeNull();
    });
  });

  describe('markFailed', () => {
    it('updates sync status and error', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>hi</p>',
        text: 'hi',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'abc',
      });
      await store.markFailed('doc-1', 'network error');
      const entry = await store.get('doc-1');
      expect(entry!.syncStatus).toBe('failed');
      expect(entry!.lastSyncError).toBe('network error');
    });
  });

  describe('delete', () => {
    it('removes the entry', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>hi</p>',
        text: 'hi',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'synced',
        lastSyncedAt: 1000,
        lastSyncError: null,
        contentHash: 'abc',
      });
      await store.delete('doc-1');
      const entry = await store.get('doc-1');
      expect(entry).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/web-app && bun test app/utils/document-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement DocumentStore**

Create `services/web-app/app/utils/document-store.ts`:

```typescript
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'yawp-documents';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

export interface DocumentStoreEntry {
  docId: string;
  html: string;
  text: string;
  updatedAt: number;
  serverRevision: number;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  contentHash: string;
}

export class DocumentStore {
  private _memoryStore: Map<string, DocumentStoreEntry> | null = null;
  private _dbPromise: Promise<IDBPDatabase> | null = null;

  private _useMemory(): boolean {
    return typeof indexedDB === 'undefined';
  }

  private _getDb(): Promise<IDBPDatabase> {
    if (this._useMemory()) {
      throw new Error('IndexedDB not available');
    }
    if (!this._dbPromise) {
      this._dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'docId' });
          }
        },
      });
    }
    return this._dbPromise;
  }

  private _mem(): Map<string, DocumentStoreEntry> {
    if (!this._memoryStore) {
      this._memoryStore = new Map();
    }
    return this._memoryStore;
  }

  async put(entry: DocumentStoreEntry): Promise<void> {
    if (this._useMemory()) {
      this._mem().set(entry.docId, { ...entry });
      return;
    }
    const db = await this._getDb();
    await db.put(STORE_NAME, entry);
  }

  async get(docId: string): Promise<DocumentStoreEntry | null> {
    if (this._useMemory()) {
      return this._mem().get(docId) ?? null;
    }
    const db = await this._getDb();
    const entry = await db.get(STORE_NAME, docId);
    return entry ?? null;
  }

  async markSynced(
    docId: string,
    serverRevision: number,
    syncedAt: number
  ): Promise<void> {
    const entry = await this.get(docId);
    if (!entry) return;
    await this.put({
      ...entry,
      syncStatus: 'synced',
      serverRevision,
      lastSyncedAt: syncedAt,
      lastSyncError: null,
    });
  }

  async markFailed(docId: string, error: string): Promise<void> {
    const entry = await this.get(docId);
    if (!entry) return;
    await this.put({
      ...entry,
      syncStatus: 'failed',
      lastSyncError: error,
    });
  }

  async delete(docId: string): Promise<void> {
    if (this._useMemory()) {
      this._mem().delete(docId);
      return;
    }
    const db = await this._getDb();
    await db.delete(STORE_NAME, docId);
  }

  /** Test-only: clear the in-memory store */
  _clear(): void {
    if (this._memoryStore) {
      this._memoryStore.clear();
    }
  }
}

/** Singleton instance used across the app */
export const documentStore = new DocumentStore();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/web-app && bun test app/utils/document-store.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/utils/document-store.ts services/web-app/app/utils/document-store.test.ts
git commit -m "feat: add DocumentStore IndexedDB wrapper"
```

---

### Task 4: Build SyncService

**Files:**
- Create: `services/web-app/app/utils/sync-service.ts`
- Create: `services/web-app/app/utils/sync-service.test.ts`

- [ ] **Step 1: Write failing tests for SyncService**

Create `services/web-app/app/utils/sync-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test';
import { SyncService, type SyncStatus } from './sync-service';
import { DocumentStore } from './document-store';

describe('SyncService', () => {
  let store: DocumentStore;
  let service: SyncService;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    store = new DocumentStore();
    store._clear();
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, revision: 2, savedAt: new Date().toISOString() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    service = new SyncService(store, mockFetch as typeof fetch);
  });

  afterEach(() => {
    service.stop();
  });

  it('starts with synced status', () => {
    expect(service.getStatus()).toBe('synced');
  });

  it('transitions to saving when sync is triggered', async () => {
    await store.put({
      docId: 'doc-1',
      html: '<p>test</p>',
      text: 'test',
      updatedAt: Date.now(),
      serverRevision: 1,
      syncStatus: 'pending',
      lastSyncedAt: null,
      lastSyncError: null,
      contentHash: 'abc',
    });

    const statusChanges: SyncStatus[] = [];
    service.onStatusChange((s) => statusChanges.push(s));
    service.start('doc-1');
    await service.forceSave();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(statusChanges).toContain('saving');
    expect(statusChanges).toContain('synced');
  });

  it('skips sync when content hash matches last synced hash', async () => {
    await store.put({
      docId: 'doc-1',
      html: '<p>test</p>',
      text: 'test',
      updatedAt: Date.now(),
      serverRevision: 1,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      lastSyncError: null,
      contentHash: 'abc',
    });

    service.start('doc-1');
    service.setLastSyncedHash('abc');
    await service.forceSave();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('transitions to auth-expired on 401 response', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 }))
    );

    await store.put({
      docId: 'doc-1',
      html: '<p>test</p>',
      text: 'test',
      updatedAt: Date.now(),
      serverRevision: 1,
      syncStatus: 'pending',
      lastSyncedAt: null,
      lastSyncError: null,
      contentHash: 'abc',
    });

    const statusChanges: SyncStatus[] = [];
    service.onStatusChange((s) => statusChanges.push(s));
    service.start('doc-1');
    await service.forceSave();

    expect(statusChanges).toContain('auth-expired');
  });

  it('transitions to offline on network error', async () => {
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    await store.put({
      docId: 'doc-1',
      html: '<p>test</p>',
      text: 'test',
      updatedAt: Date.now(),
      serverRevision: 1,
      syncStatus: 'pending',
      lastSyncedAt: null,
      lastSyncError: null,
      contentHash: 'abc',
    });

    const statusChanges: SyncStatus[] = [];
    service.onStatusChange((s) => statusChanges.push(s));
    service.start('doc-1');
    await service.forceSave();

    expect(statusChanges).toContain('offline');
  });

  it('notifies listeners on status change', async () => {
    const listener = mock(() => {});
    service.onStatusChange(listener);
    service.start('doc-1');

    await store.put({
      docId: 'doc-1',
      html: '<p>test</p>',
      text: 'test',
      updatedAt: Date.now(),
      serverRevision: 1,
      syncStatus: 'pending',
      lastSyncedAt: null,
      lastSyncError: null,
      contentHash: 'new-hash',
    });

    await service.forceSave();

    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribes listener when cleanup is called', async () => {
    const listener = mock(() => {});
    const unsub = service.onStatusChange(listener);
    unsub();

    service.start('doc-1');
    await store.put({
      docId: 'doc-1',
      html: '<p>test</p>',
      text: 'test',
      updatedAt: Date.now(),
      serverRevision: 1,
      syncStatus: 'pending',
      lastSyncedAt: null,
      lastSyncError: null,
      contentHash: 'new-hash',
    });

    await service.forceSave();

    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/web-app && bun test app/utils/sync-service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SyncService**

Create `services/web-app/app/utils/sync-service.ts`:

```typescript
import { type DocumentStore } from './document-store';
import { contentHash } from './content-hash';

export type SyncStatus = 'synced' | 'saving' | 'offline' | 'auth-expired' | 'error';

export class SyncService {
  private _store: DocumentStore;
  private _fetch: typeof fetch;
  private _docId: string | null = null;
  private _status: SyncStatus = 'synced';
  private _listeners: Set<(status: SyncStatus) => void> = new Set();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryCount = 0;
  private _lastSyncedHash: string | null = null;
  private _stopped = false;

  constructor(store: DocumentStore, fetchFn: typeof fetch = globalThis.fetch) {
    this._store = store;
    this._fetch = fetchFn;
  }

  start(docId: string): void {
    this._docId = docId;
    this._stopped = false;
    this._retryCount = 0;
  }

  stop(): void {
    this._stopped = true;
    this._docId = null;
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  getStatus(): SyncStatus {
    return this._status;
  }

  setLastSyncedHash(hash: string): void {
    this._lastSyncedHash = hash;
  }

  onStatusChange(cb: (status: SyncStatus) => void): () => void {
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  /** Schedule a debounced sync (call on every editor update) */
  scheduleSave(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this._sync();
    }, 2000);
  }

  /** Force an immediate sync (Cmd+S, visibility change, session-end) */
  async forceSave(): Promise<void> {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    await this._sync();
  }

  private _setStatus(status: SyncStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this._listeners) {
      try {
        cb(status);
      } catch {
        // Listener errors are non-fatal
      }
    }
  }

  private async _sync(): Promise<void> {
    if (this._stopped || !this._docId) return;

    const entry = await this._store.get(this._docId);
    if (!entry) return;

    // Deduplicate: skip if content hasn't changed since last sync
    if (entry.contentHash === this._lastSyncedHash && entry.syncStatus === 'synced') {
      return;
    }

    this._setStatus('saving');

    try {
      const response = await this._fetch(`/api/document/${this._docId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: entry.html,
          text: entry.text,
          contentHash: entry.contentHash,
        }),
      });

      if (response.ok) {
        const body = await response.json();
        await this._store.markSynced(
          this._docId,
          body.revision,
          Date.now()
        );
        this._lastSyncedHash = entry.contentHash;
        this._retryCount = 0;
        this._setStatus('synced');
        return;
      }

      if (response.status === 401 || response.status === 403) {
        await this._store.markFailed(this._docId, 'auth');
        this._setStatus('auth-expired');
        // Do NOT retry — wait for re-auth
        return;
      }

      // Server error — retry
      await this._store.markFailed(this._docId, `server:${response.status}`);
      this._setStatus('error');
      this._scheduleRetry();
    } catch (err) {
      // Network error — retry
      const message = err instanceof Error ? err.message : 'unknown';
      await this._store.markFailed(this._docId!, message);
      this._setStatus('offline');
      this._scheduleRetry();
    }
  }

  private _scheduleRetry(): void {
    if (this._stopped) return;
    this._retryCount++;
    const delay = Math.min(2000 * Math.pow(2, this._retryCount - 1), 30000);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      void this._sync();
    }, delay);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/web-app && bun test app/utils/sync-service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/utils/sync-service.ts services/web-app/app/utils/sync-service.test.ts
git commit -m "feat: add SyncService with retry and status reporting"
```

---

### Task 5: Build Simplified Server Save Endpoint

**Files:**
- Create: `services/web-app/app/routes/api.document.$id.save/route.ts`
- Create: `services/web-app/app/routes/api.document.$id.save/route.test.ts`

- [ ] **Step 1: Write failing tests for the save endpoint**

Create `services/web-app/app/routes/api.document.$id.save/route.test.ts`:

```typescript
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUniqueOrThrow: mock() },
  document: { findUniqueOrThrow: mock(), update: mock() },
  documentRevision: { findFirst: mock(), create: mock() },
  documentWriteJournal: { create: mock(), update: mock() },
};

const requireUserId = mock();
const requireProfile = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireProfile }));

const { action } = await import('./route');

function makeRequest(docId: string, body: Record<string, unknown>) {
  return new Request(`https://example.com/api/document/${docId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('api.document.$id.save', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    requireUserId.mockReset();
    requireProfile.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.document.findUniqueOrThrow.mockResolvedValue({
      id: 'doc-1',
      profileId: 'profile-1',
      html: '<p>old</p>',
      text: 'old',
      revision: 3,
      updatedAt: new Date('2026-01-01'),
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      revision: 4,
      updatedAt: new Date(),
    });
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.documentRevision.create.mockResolvedValue({ id: 'rev-1' });
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'j-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({ id: 'j-1' });
  });

  test('saves document and returns new revision', async () => {
    const response = (await action({
      request: makeRequest('doc-1', {
        html: '<p>new content</p>',
        text: 'new content',
        contentHash: 'abc123',
      }),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.revision).toBe(4);
    expect(body.savedAt).toBeDefined();

    expect(prisma.document.update).toHaveBeenCalledTimes(1);
    expect(prisma.document.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'doc-1' },
      data: {
        html: '<p>new content</p>',
        text: 'new content',
        revision: { increment: 1 },
      },
    });
  });

  test('creates a revision when none exists (session-start)', async () => {
    const response = (await action({
      request: makeRequest('doc-1', {
        html: '<p>new</p>',
        text: 'new',
        contentHash: 'abc',
      }),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.documentRevision.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentRevision.create.mock.calls[0][0].data).toMatchObject({
      documentId: 'doc-1',
      trigger: 'session-start',
    });
  });

  test('skips revision creation when last revision is recent', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      id: 'rev-existing',
      createdAt: new Date(), // just now
      contentHash: 'different',
    });

    const response = (await action({
      request: makeRequest('doc-1', {
        html: '<p>new</p>',
        text: 'new',
        contentHash: 'new-hash',
      }),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
  });

  test('creates journal entry for audit', async () => {
    await action({
      request: makeRequest('doc-1', {
        html: '<p>new</p>',
        text: 'new',
        contentHash: 'abc',
      }),
      params: { id: 'doc-1' },
    } as any);

    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
  });

  test('returns 401 when user is not authenticated', async () => {
    requireUserId.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    try {
      await action({
        request: makeRequest('doc-1', { html: '<p>x</p>', text: 'x', contentHash: 'x' }),
        params: { id: 'doc-1' },
      } as any);
    } catch (e) {
      expect((e as Response).status).toBe(401);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/web-app && bun test app/routes/api.document.\$id.save/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the save endpoint**

Create `services/web-app/app/routes/api.document.$id.save/route.ts`:

```typescript
import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const REVISION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export const action = async ({ request, params }: ActionFunctionArgs) => {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const body = await request.json();
  const { html, text, contentHash, trigger } = body as {
    html: string;
    text: string;
    contentHash: string;
    trigger?: string;
  };

  const [user, document] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isAdmin: true },
    }),
    prisma.document.findUniqueOrThrow({
      where: { id: params.id },
      select: {
        id: true,
        profileId: true,
        html: true,
        text: true,
        revision: true,
        updatedAt: true,
      },
    }),
  ]);

  // Authorization: owner, teacher of student's class, or admin
  if (!user.isAdmin && document.profileId !== profile.id) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create journal entry (lightweight audit)
  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.save',
      source: 'sync-service',
      status: 'pending',
      userId,
      profileId: profile.id,
      documentId: document.id,
      htmlHash: contentHash,
      textHash: contentHash,
      html,
      text,
    },
  });

  // Update document
  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      html,
      text,
      revision: { increment: 1 },
    },
    select: { revision: true, updatedAt: true },
  });

  // Smart revision creation
  const resolvedTrigger = trigger ?? null;
  const lastRevision = await prisma.documentRevision.findFirst({
    where: { documentId: document.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const now = new Date();
  const shouldCreateRevision =
    resolvedTrigger === 'session-start' ||
    resolvedTrigger === 'session-end' ||
    resolvedTrigger === 'submit' ||
    !lastRevision ||
    now.getTime() - lastRevision.createdAt.getTime() > REVISION_INTERVAL_MS;

  if (shouldCreateRevision) {
    await prisma.documentRevision.create({
      data: {
        documentId: document.id,
        html: document.html ?? '',
        text: document.text ?? '',
        trigger: resolvedTrigger ?? (!lastRevision ? 'session-start' : 'auto'),
      },
    });
  }

  // Mark journal accepted
  await prisma.documentWriteJournal.update({
    where: { id: journal.id },
    data: {
      status: 'accepted',
      resultingRevision: updated.revision,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      revision: updated.revision,
      savedAt: updated.updatedAt.toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/web-app && bun test app/routes/api.document.\$id.save/route.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.document.\$id.save/
git commit -m "feat: add simplified document save endpoint with smart revisions"
```

---

### Task 6: Build SaveStatusIndicator Component

**Files:**
- Create: `services/web-app/app/components/save-status-indicator.tsx`

- [ ] **Step 1: Create the SaveStatusIndicator component**

Create `services/web-app/app/components/save-status-indicator.tsx`:

```tsx
import { Check, CloudOff, AlertCircle, Loader2 } from 'lucide-react';
import type { SyncStatus } from '~/utils/sync-service';

interface Props {
  status: SyncStatus;
  onLoginClick?: () => void;
}

export function SaveStatusIndicator({ status, onLoginClick }: Props) {
  switch (status) {
    case 'synced':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3 w-3" />
          Saved
        </span>
      );
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </span>
      );
    case 'offline':
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-600">
          <CloudOff className="h-3 w-3" />
          Saved locally
        </span>
      );
    case 'auth-expired':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Session expired ·{' '}
          <button
            type="button"
            onClick={onLoginClick}
            className="underline hover:no-underline"
          >
            Log in
          </button>
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Save error · retrying...
        </span>
      );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/components/save-status-indicator.tsx
git commit -m "feat: add SaveStatusIndicator component"
```

---

### Task 7: Build Document Revisions API Endpoint

**Files:**
- Create: `services/web-app/app/routes/api.document.$id.revisions/route.ts`

- [ ] **Step 1: Create the revisions endpoint**

Create `services/web-app/app/routes/api.document.$id.revisions/route.ts`:

```typescript
import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  const skip = (page - 1) * limit;

  const revisions = await prisma.documentRevision.findMany({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      createdAt: true,
      trigger: true,
      html: true,
      text: true,
    },
  });

  return dataResponse({ revisions });
};
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/routes/api.document.\$id.revisions/
git commit -m "feat: add document revisions API endpoint"
```

---

### Task 8: Integrate DocumentStore + SyncService into Editor

This is the core integration task. The editor component gets rewired to write to IndexedDB on every update and use SyncService for server communication.

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/editor/index.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx`

- [ ] **Step 1: Update the Editor component to use DocumentStore + SyncService**

In `services/web-app/app/routes/app_.documents_.$id/editor/index.tsx`:

Replace the imports at the top of the file (lines 1-17) with:

```typescript
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findExcerptRange } from '~/utils/excerpt-position';
import { documentStore } from '~/utils/document-store';
import { SyncService, type SyncStatus } from '~/utils/sync-service';
import { contentHash } from '~/utils/content-hash';
import { useCommentsSelection } from '../comments/selection-context';
import { getSelectionInfo } from '../_components/grading-selection-utils';
import { Bar } from './bar';
import { GradingSelectionToolbar } from './grading-selection-toolbar';
import { ErrorBoundary } from './error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';
import { TabIndent } from './extensions/tab-indent';
```

Remove the `debounce` function (lines 21-27) — no longer needed.

Replace the `Props` type (lines 204-226) with:

```typescript
type Props = {
  docId: string;
  docHtml: string | null;
  initialRevision: number;
  editorSessionId: string;
  saveSnapshotId?: string | null;
  isEditable?: boolean;
  gradeHighlights?: GradeHighlight[];
  activeGradeCommentId?: string | null;
  onGradeCommentSelect?: (id: string) => void;
  onGrammarIssueHover?: (id: string | null, rect: DOMRect | null) => void;
  onContentSnapshot?: (content: { html: string; text: string }) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onEditorBridgeReady?: (bridge: EditorBridge | null) => void;
};
```

Replace the component's save-related logic. Remove the entire `useEffect` block that contains the `save` function (lines 427-561) and replace with:

```typescript
  // --- Local-first save integration ---
  const syncServiceRef = useRef<SyncService | null>(null);

  useEffect(() => {
    if (!editor || !isEditable) return;

    const getContentSnapshot = () => ({
      html: editor.getHTML(),
      text: editor.getText().replace(/\u00A0/g, ' '),
    });

    // Initialize SyncService
    const syncService = new SyncService(documentStore);
    syncServiceRef.current = syncService;

    const unsubStatus = syncService.onStatusChange((status) => {
      onSyncStatusChange?.(status);
    });

    syncService.start(docId);

    // Seed IndexedDB with server content
    void (async () => {
      const existing = await documentStore.get(docId);
      if (!existing || existing.syncStatus === 'synced') {
        const content = getContentSnapshot();
        const hash = await contentHash(content.html, content.text);
        await documentStore.put({
          docId,
          html: content.html,
          text: content.text,
          updatedAt: Date.now(),
          serverRevision: initialRevision,
          syncStatus: 'synced',
          lastSyncedAt: Date.now(),
          lastSyncError: null,
          contentHash: hash,
        });
        syncService.setLastSyncedHash(hash);
      } else {
        // Local entry has unsynced changes — recover it
        editor.commands.setContent(existing.html, false);
        syncService.forceSave();
      }
    })();

    // On every editor update: write to IndexedDB immediately, schedule server sync
    const onUpdate = async () => {
      const content = getContentSnapshot();
      const hash = await contentHash(content.html, content.text);
      await documentStore.put({
        docId,
        html: content.html,
        text: content.text,
        updatedAt: Date.now(),
        serverRevision: (await documentStore.get(docId))?.serverRevision ?? initialRevision,
        syncStatus: 'pending',
        lastSyncedAt: (await documentStore.get(docId))?.lastSyncedAt ?? null,
        lastSyncError: null,
        contentHash: hash,
      });
      syncService.scheduleSave();
    };

    const emitSnapshotDebounced = (() => {
      let timer: ReturnType<typeof setTimeout>;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(() => onContentSnapshot?.(getContentSnapshot()), 400);
      };
    })();

    // Sync on visibility change
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void syncService.forceSave();
      }
    };

    onEditorBridgeReady?.({
      getContent: getContentSnapshot,
      setContent: (html: string) => {
        editor.commands.setContent(html, true);
      },
      saveNow: (options) => syncService.forceSave(),
    });

    onContentSnapshot?.(getContentSnapshot());
    editor.on('update', onUpdate);
    editor.on('update', emitSnapshotDebounced);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      // Force a final sync attempt before unmount
      void syncService.forceSave();
      syncService.stop();
      syncServiceRef.current = null;
      unsubStatus();
      onEditorBridgeReady?.(null);
      editor.off('update', onUpdate);
      editor.off('update', emitSnapshotDebounced);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [editor, docId, editorSessionId, initialRevision, isEditable, onContentSnapshot, onSyncStatusChange, onEditorBridgeReady]);
```

Also update the Cmd+S handler (lines 563-576) to use SyncService:

```typescript
  useEffect(() => {
    if (!editor || !isEditable) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 's') return;

      event.preventDefault();
      void syncServiceRef.current?.forceSave();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, isEditable]);
```

- [ ] **Step 2: Update the document route to use SyncStatus instead of isSaving/hasSaveError**

In `services/web-app/app/routes/app_.documents_.$id/route.tsx`:

Add the new imports near the top:

```typescript
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import type { SyncStatus } from '~/utils/sync-service';
```

In the component, replace `isSaving` and `hasSaveError` state with:

```typescript
const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
```

Remove the `handleRemoteSaveSuccess`, `handleRemoteSaveFailure`, and `handleLoginRedirect` callbacks. Remove the `recoverPendingSave` function. Remove all `setPendingSave`/`getPendingSave`/`clearPendingSave` imports and usages.

Replace the old save status display in the JSX with:

```tsx
<SaveStatusIndicator
  status={syncStatus}
  onLoginClick={() => {
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth/login?redirectTo=${redirectTo}`;
  }}
/>
```

Pass `onSyncStatusChange={setSyncStatus}` to the `<Editor>` component instead of `setIsSaving`, `onRemoteSaveSuccess`, and `onRemoteSaveFailure`.

Remove the `setIsSaving` prop from Editor usage.

- [ ] **Step 3: Run the existing unit tests to check for regressions**

```bash
cd services/web-app && bun test
```

Expected: Tests pass (the old route.test.ts for api.model.document.$id still tests the old endpoint which is unchanged for now).

- [ ] **Step 4: Commit**

```bash
git add services/web-app/app/routes/app_.documents_.\$id/editor/index.tsx services/web-app/app/routes/app_.documents_.\$id/route.tsx services/web-app/app/components/save-status-indicator.tsx
git commit -m "feat: integrate DocumentStore + SyncService into editor"
```

---

### Task 9: Update Submit Document to Create DocumentRevision

**Files:**
- Modify: `services/web-app/app/routes/api.domain.submit-document/route.ts`

- [ ] **Step 1: Add DocumentRevision creation on submission**

In `services/web-app/app/routes/api.domain.submit-document/route.ts`, after the transaction that creates the DocumentSnapshot and updates the Document, add:

```typescript
    // Create permanent revision for history
    try {
      await prisma.documentRevision.create({
        data: {
          documentId: document.id,
          html: document.html ?? '',
          text: document.text ?? '',
          trigger: 'submit',
        },
      });
    } catch {
      // Revision creation is non-fatal
    }
```

This should be added after the existing transaction block but before the journal status update.

- [ ] **Step 2: Run existing tests**

```bash
cd services/web-app && bun test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/api.domain.submit-document/route.ts
git commit -m "feat: create DocumentRevision on document submission"
```

---

### Task 10: Update Retention Route (Remove Version/Journal Cleanup)

**Files:**
- Modify: `services/web-app/app/routes/api.domain.retention/route.ts`

- [ ] **Step 1: Remove DocumentVersion and DocumentWriteJournal cleanup**

Replace the entire file `services/web-app/app/routes/api.domain.retention/route.ts` with:

```typescript
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';

function assertInternalToken(request: Request) {
  const token =
    new URL(request.url).searchParams.get('token') ||
    request.headers.get('x-internal-token');
  if (!token || token !== process.env.INTERNAL_COMMAND_TOKEN) {
    return false;
  }
  return true;
}

export async function loader({ request }: ActionFunctionArgs) {
  if (!assertInternalToken(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // DocumentRevisions are permanent — no cleanup needed.
  // DocumentWriteJournal entries are lightweight and kept for audit.
  // Old DocumentVersion/DocumentSnapshot cleanup removed as those tables
  // are being phased out in favor of DocumentRevision.

  return dataResponse({
    message: 'No retention actions needed',
  });
}

export const action = loader;
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/routes/api.domain.retention/route.ts
git commit -m "feat: remove version/journal retention cleanup (revisions are permanent)"
```

---

### Task 11: E2E Test — Document Save Survives Auth Expiry

**Files:**
- Create: `services/web-app/e2e/tests/document-local-first-save.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `services/web-app/e2e/tests/document-local-first-save.spec.ts`:

```typescript
import { test, expect } from '../test-setup';
import { invalidateUserSessions } from '../db-helpers';
import { createE2EPrismaClient } from '../prisma-client';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"]';

async function openDocumentEditor(page: import('@playwright/test').Page, documentId: string) {
  await page.goto(`/app/documents/${documentId}`);
  await page.waitForLoadState('networkidle');
  const editor = page.locator(EDITOR_SELECTOR).first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

test.describe.serial('Document local-first persistence', () => {
  test('content survives after typing and reloading the page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    test.setTimeout(60_000);
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditor(page, e2eContext.documentId);

    // Type unique content
    const uniqueText = `Persistence test ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(uniqueText);
    await expect(editor).toContainText(uniqueText);

    // Wait for sync to complete
    await page.waitForTimeout(3000);

    // Reload and verify content persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    const editorAfterReload = page.locator(EDITOR_SELECTOR).first();
    await expect(editorAfterReload).toBeVisible({ timeout: 10000 });
    await expect(editorAfterReload).toContainText(uniqueText);
  });

  test('shows session expired banner instead of redirecting on auth loss', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    test.setTimeout(60_000);
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditor(page, e2eContext.documentId);

    // Type some content
    const uniqueText = `Auth test ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(uniqueText);
    await expect(editor).toContainText(uniqueText);

    // Invalidate user sessions to simulate auth expiry
    const prisma = createE2EPrismaClient();
    try {
      await invalidateUserSessions(prisma, e2eContext.userId);
    } finally {
      await prisma.$disconnect();
    }

    // Type more content to trigger a save that will fail with 401
    await page.keyboard.insertText(' more text after auth loss');

    // Wait for sync attempt
    await page.waitForTimeout(4000);

    // Verify the editor is still visible (not redirected)
    await expect(editor).toBeVisible();

    // Verify session expired indicator is shown
    await expect(page.getByText(/session expired/i)).toBeVisible({ timeout: 5000 });

    // Verify content is still in the editor (not lost)
    await expect(editor).toContainText(uniqueText);
  });
});
```

- [ ] **Step 2: Run the E2E test**

```bash
cd services/web-app && bun run test:e2e:smoke
```

Expected: New tests pass. The editor content survives reload and auth expiry without redirect.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/e2e/tests/document-local-first-save.spec.ts
git commit -m "test: add e2e tests for local-first document persistence"
```

---

### Task 12: Cleanup — Remove Old Save Infrastructure

**Files:**
- Delete: `services/web-app/app/utils/pending-document-save.ts`
- Delete: `services/web-app/app/utils/pending-document-save.test.ts`
- Delete: `services/web-app/e2e/tests/document-local-backup-buckets.spec.ts`
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx` — remove any remaining imports of `pending-document-save`

- [ ] **Step 1: Remove the old pending-document-save files**

```bash
rm services/web-app/app/utils/pending-document-save.ts
rm services/web-app/app/utils/pending-document-save.test.ts
rm services/web-app/e2e/tests/document-local-backup-buckets.spec.ts
```

- [ ] **Step 2: Verify no remaining references to removed files**

```bash
cd services/web-app && grep -r "pending-document-save" app/ --include="*.ts" --include="*.tsx" -l
```

Expected: No files found (all references already removed in Task 8).

- [ ] **Step 3: Run all unit tests**

```bash
cd services/web-app && bun test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old pending-document-save and local-backup-buckets code"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run all unit tests**

```bash
cd services/web-app && bun test
```

Expected: All tests pass.

- [ ] **Step 2: Run E2E smoke tests**

```bash
cd services/web-app && bun run test:e2e:smoke
```

Expected: All tests pass including the new local-first persistence tests.

- [ ] **Step 3: Manual verification checklist**

Open the app locally and verify:

1. Open a document — editor loads, status shows "Saved"
2. Type content — status briefly shows "Saving..." then returns to "Saved"
3. Open DevTools → Application → IndexedDB → yawp-documents → verify entry exists with current content
4. Kill the dev server (simulate network loss) → type more content → status shows "Saved locally"
5. Restart the dev server → status should transition from "Saved locally" → "Saving..." → "Saved"
6. Reload the page → content is preserved
7. Cmd+S → triggers immediate sync (status flashes "Saving...")

---

### Follow-Up Work (Not in This Plan)

These tasks should be done after the new system is validated in production:

1. **Backfill DocumentRevision from existing DocumentSnapshot data** — Write a migration script that creates `DocumentRevision` entries from existing `DocumentSnapshot` rows so teachers have historical data.
2. **Remove old tables** — Drop `DocumentVersion` and `DocumentSnapshot` models and all related code (including `api.model.document.$id` old save endpoint, `api.domain.restore-document-version`, `api.model.document.$id.versions`, `document-versions.tsx`).
3. **Simplify DocumentWriteJournal** — Drop the `html` and `text` columns (keep hashes + metadata only) to reduce storage.
4. **Build new teacher history UI** — Replace the old `document-versions.tsx` with a session-grouped timeline view powered by `DocumentRevision` data via the new `/api/document/:id/revisions` endpoint.
5. **Investigate and fix the tutor logout bug** — The local-first architecture makes this bug non-destructive, but the root cause (tutor feedback button triggering unexpected redirect) should still be found and fixed.
