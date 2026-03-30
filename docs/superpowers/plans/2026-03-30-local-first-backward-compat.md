# Local-First Document Persistence (Backward Compatible) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first document persistence (IndexedDB + SyncService + DocumentRevision) alongside the existing save flow with zero modifications to existing code.

**Architecture:** New SyncService writes to IndexedDB on every editor update and syncs to a new POST endpoint in the background. The old debounced PUT remains the primary save path. A new "Revisions" tab appears alongside the existing document history UI. All changes are additive — no existing files are modified in breaking ways.

**Tech Stack:** Prisma, React Router v7, IndexedDB (via `idb`), Bun tests, Playwright E2E

---

### Task 1: Add `idb` dependency and DocumentRevision schema

**Files:**
- Modify: `services/web-app/package.json` (add `idb` dependency)
- Modify: `packages/prisma/schema.prisma` (add DocumentRevision model + Document relation)
- Create: `packages/prisma/migrations/20260329235731_add_document_revision/migration.sql`

- [ ] **Step 1: Add `idb` dependency**

```bash
cd services/web-app && bun add idb
```

- [ ] **Step 2: Add DocumentRevision model to schema**

In `packages/prisma/schema.prisma`, add after the DocumentSnapshot model (around line 221):

```prisma
model DocumentRevision {
  id         String   @id @default(cuid())
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  html       String
  text       String
  trigger    String

  @@index([documentId, createdAt(sort: Desc)])
}
```

Also add the `revisions` relation to the Document model:

```prisma
revisions             DocumentRevision[]
```

- [ ] **Step 3: Add migration file**

Create `packages/prisma/migrations/20260329235731_add_document_revision/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentRevision_documentId_createdAt_idx" ON "DocumentRevision"("documentId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: This table already exists in the production DB. Prisma will see the migration as already applied.

- [ ] **Step 4: Generate Prisma client**

```bash
bun prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/20260329235731_add_document_revision/ services/web-app/package.json bun.lockb
git commit -m "feat: add idb dependency and DocumentRevision model to schema"
```

---

### Task 2: Add content-hash utility

**Files:**
- Create: `services/web-app/app/utils/content-hash.ts`
- Create: `services/web-app/app/utils/content-hash.test.ts`

- [ ] **Step 1: Write the test**

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

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/web-app && bun test app/utils/content-hash.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/web-app && bun test app/utils/content-hash.test.ts
```

Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/utils/content-hash.ts services/web-app/app/utils/content-hash.test.ts
git commit -m "feat: add content-hash utility for sync deduplication"
```

---

### Task 3: Add DocumentStore (IndexedDB wrapper)

**Files:**
- Create: `services/web-app/app/utils/document-store.ts`
- Create: `services/web-app/app/utils/document-store.test.ts`

- [ ] **Step 1: Write the test**

Create `services/web-app/app/utils/document-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { DocumentStore, type DocumentStoreEntry } from './document-store';

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

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/web-app && bun test app/utils/document-store.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/web-app && bun test app/utils/document-store.test.ts
```

Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/utils/document-store.ts services/web-app/app/utils/document-store.test.ts
git commit -m "feat: add DocumentStore IndexedDB wrapper"
```

---

### Task 4: Add SyncService

**Files:**
- Create: `services/web-app/app/utils/sync-service.ts`
- Create: `services/web-app/app/utils/sync-service.test.ts`

- [ ] **Step 1: Write the test**

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
    service = new SyncService(store, mockFetch as unknown as typeof fetch);
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

  it('notifies listeners and supports unsubscribe', async () => {
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

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/web-app && bun test app/utils/sync-service.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `services/web-app/app/utils/sync-service.ts`:

```typescript
import { type DocumentStore } from './document-store';

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

  constructor(store: DocumentStore, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this._store = store;
    this._fetch = fetchFn;
  }

  start(docId: string): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
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

  scheduleSave(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this._sync();
    }, 2000);
  }

  async forceSave(options?: { trigger?: string }): Promise<void> {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    await this._sync(options?.trigger);
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

  private async _sync(trigger?: string): Promise<void> {
    if (this._stopped || !this._docId) return;

    const entry = await this._store.get(this._docId);
    if (!entry) return;

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
          trigger,
        }),
      });

      if (response.ok) {
        const body = await response.json();
        await this._store.markSynced(this._docId, body.revision, Date.now());
        this._lastSyncedHash = entry.contentHash;
        this._retryCount = 0;
        this._setStatus('synced');
        return;
      }

      if (response.status === 401 || response.status === 403) {
        await this._store.markFailed(this._docId, 'auth');
        this._setStatus('auth-expired');
        return;
      }

      await this._store.markFailed(this._docId, `server:${response.status}`);
      this._setStatus('error');
      this._scheduleRetry();
    } catch (err) {
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/web-app && bun test app/utils/sync-service.test.ts
```

Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/utils/sync-service.ts services/web-app/app/utils/sync-service.test.ts
git commit -m "feat: add SyncService with retry and status reporting"
```

---

### Task 5: Add document save API endpoint

**Files:**
- Create: `services/web-app/app/routes/api.document.$id.save/route.ts`
- Create: `services/web-app/app/routes/api.document.$id.save/route.test.ts`

- [ ] **Step 1: Write the test**

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
      createdAt: new Date(),
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/web-app && bun test app/routes/api.document.\$id.save/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

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

  if (!user.isAdmin && document.profileId !== profile.id) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      html,
      text,
      revision: { increment: 1 },
      updatedAt: new Date(),
    },
    select: { revision: true, updatedAt: true },
  });

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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/web-app && bun test app/routes/api.document.\$id.save/route.test.ts
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app/routes/api.document.\$id.save/
git commit -m "feat: add document save endpoint with smart revisions"
```

---

### Task 6: Add document revisions API endpoint

**Files:**
- Create: `services/web-app/app/routes/api.document.$id.revisions/route.ts`

- [ ] **Step 1: Write the implementation**

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

### Task 7: Add SaveStatusIndicator component

**Files:**
- Create: `services/web-app/app/components/save-status-indicator.tsx`

- [ ] **Step 1: Write the component**

Create `services/web-app/app/components/save-status-indicator.tsx`:

```typescript
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

### Task 8: Add DocumentHistory component

**Files:**
- Create: `services/web-app/app/routes/app_.documents_.$id/_components/document-history.tsx`

- [ ] **Step 1: Write the component**

Create `services/web-app/app/routes/app_.documents_.$id/_components/document-history.tsx` with the full DocumentHistory component. This component fetches from `/api/document/${documentId}/revisions`, groups revisions into sessions (30-min gaps), and renders a session timeline with preview panel.

The component is self-contained — it uses `useFetcher` to load revisions, groups them via `groupIntoSessions()`, and renders inside a `Sheet` modal with a left session timeline and right preview panel. It exports `DocumentHistory` with props `{ documentId: string }`.

Key elements:
- `Revision` type: `{ id, createdAt, trigger, html, text }`
- `Session` type: groups revisions by 30-min gaps
- `TriggerBadge`: shows trigger type (auto, submit, session-start, etc.)
- `REVISIONS_PER_PAGE = 50` with load-more pagination
- Auto-expands the most recent session
- View-only (no restore functionality — that stays in DocumentVersions)

Write the full component as shown in the design spec exploration. The complete code is 285 lines — reference the feature branch file `git show feature/local-first-persistence:services/web-app/app/routes/app_.documents_.\$id/_components/document-history.tsx` for the exact implementation.

- [ ] **Step 2: Commit**

```bash
git add "services/web-app/app/routes/app_.documents_.\$id/_components/document-history.tsx"
git commit -m "feat: add DocumentHistory component for revision timeline"
```

---

### Task 9: Integrate into editor (additive only)

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/editor/index.tsx` (append only)

- [ ] **Step 1: Add imports at top of file**

Add these imports alongside existing imports (do not remove any existing imports):

```typescript
import { documentStore } from '~/utils/document-store';
import { SyncService } from '~/utils/sync-service';
import { contentHash } from '~/utils/content-hash';
```

- [ ] **Step 2: Add optional `onSyncStatusChange` to the Editor props interface**

Find the Editor props type (around line 202) and append the new optional prop:

```typescript
onSyncStatusChange?: (status: import('~/utils/sync-service').SyncStatus) => void;
```

- [ ] **Step 3: Add SyncService initialization effect**

Inside the Editor component, after the existing `useEffect` blocks (around line 550), add a new effect:

```typescript
// Local-first sync: runs alongside existing save flow
useEffect(() => {
  if (!docId) return;

  const syncService = new SyncService(documentStore);
  syncService.start(docId);

  const unsub = onSyncStatusChange
    ? syncService.onStatusChange(onSyncStatusChange)
    : undefined;

  // On visibility change, force sync with session-end trigger
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void syncService.forceSave({ trigger: 'session-end' });
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  syncServiceRef.current = syncService;

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    void syncService.forceSave({ trigger: 'session-end' });
    syncService.stop();
    unsub?.();
  };
}, [docId]);
```

Also add a ref near the other refs:

```typescript
const syncServiceRef = useRef<SyncService | null>(null);
```

- [ ] **Step 4: Add IndexedDB write inside the existing onUpdate handler**

Find the editor `update` event handler (around line 530 where `editor.on('update', saveDebounced)` is). Add a parallel write to IndexedDB that runs alongside the existing debounce. Add this code in the same area, after the existing update handler setup:

```typescript
// Local-first: write to IndexedDB on every update
editor.on('update', async ({ editor: e }) => {
  const html = e.getHTML();
  const text = e.getText();
  const hash = await contentHash(html, text);
  await documentStore.put({
    docId,
    html,
    text,
    updatedAt: Date.now(),
    serverRevision: currentRevisionRef.current,
    syncStatus: 'pending',
    lastSyncedAt: null,
    lastSyncError: null,
    contentHash: hash,
  });
  syncServiceRef.current?.scheduleSave();
});
```

- [ ] **Step 5: Run existing tests to verify nothing is broken**

```bash
cd services/web-app && bun test
```

Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add "services/web-app/app/routes/app_.documents_.\$id/editor/index.tsx"
git commit -m "feat: integrate SyncService + IndexedDB into editor (additive)"
```

---

### Task 10: Integrate into document route (additive only)

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx` (append only)

- [ ] **Step 1: Add imports**

Add these imports alongside existing imports:

```typescript
import { useState as useStateSyncStatus } from 'react';
import type { SyncStatus } from '~/utils/sync-service';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import { DocumentHistory } from './_components/document-history';
```

Note: use a different name if `useState` is already imported (it is). Just use the existing `useState` import and add the type + component imports:

```typescript
import type { SyncStatus } from '~/utils/sync-service';
import { SaveStatusIndicator } from '~/components/save-status-indicator';
import { DocumentHistory } from './_components/document-history';
```

- [ ] **Step 2: Add syncStatus state**

Near the existing `isSaving` state declaration (around line 406), add:

```typescript
const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
```

- [ ] **Step 3: Add `onSyncStatusChange` to Editor props**

Find where `<Editor>` is rendered (around line 1216) and add the new prop alongside existing props:

```typescript
onSyncStatusChange={setSyncStatus}
```

- [ ] **Step 4: Add SaveStatusIndicator to navbar**

Find the existing save status UI in the navbar (around line 1065-1075 where `isSaving` controls the display). After the existing save status span, add the new indicator:

```typescript
<SaveStatusIndicator status={syncStatus} />
```

- [ ] **Step 5: Add DocumentHistory alongside DocumentVersions**

Find where `<DocumentVersions documentId={data.doc.id} />` is rendered (around line 1077). Add DocumentHistory right next to it:

```typescript
<DocumentHistory documentId={data.doc.id} />
```

This renders both history icons side by side — the old one for snapshots/autosaves, the new one for revisions.

- [ ] **Step 6: Run typecheck**

```bash
bun web-app:typecheck
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add "services/web-app/app/routes/app_.documents_.\$id/route.tsx"
git commit -m "feat: add SyncStatus indicator and DocumentHistory to document page"
```

---

### Task 11: Add E2E test for local-first flow

**Files:**
- Create: `services/web-app/e2e/tests/document-local-first.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `services/web-app/e2e/tests/document-local-first.spec.ts`:

```typescript
import { test, expect } from '../test-setup';

test.describe('Local-first document persistence', () => {
  test('new save endpoint responds and creates revision', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, e2eContext.teacherPassword);

    // Navigate to a document
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Find a document link and navigate to it
    const docLink = page.locator('a[href*="/app/documents/"]').first();
    if ((await docLink.count()) === 0) {
      test.skip();
      return;
    }
    await docLink.click();
    await page.waitForURL('**/app/documents/**');
    await page.waitForLoadState('networkidle');

    // Verify the SaveStatusIndicator is present (shows "Saved")
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10000 });

    // Verify the DocumentHistory icon is present (second history icon)
    const historyIcons = page.locator('svg.lucide-history');
    await expect(historyIcons.first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/e2e/tests/document-local-first.spec.ts
git commit -m "test: add E2E test for local-first document persistence"
```

---

### Task 12: Run full CI checks

- [ ] **Step 1: Run unit tests**

```bash
cd services/web-app && bun test
```

Expected: All tests pass including new ones

- [ ] **Step 2: Run typecheck**

```bash
bun web-app:typecheck
```

Expected: No errors

- [ ] **Step 3: Run E2E smoke tests locally (if possible)**

```bash
cd services/web-app && bun run test:e2e:smoke
```

Expected: All existing tests pass, new test passes or skips gracefully

- [ ] **Step 4: Push branch and verify CI**

```bash
git push origin HEAD
```

Verify on GitHub that the CI workflow passes (typecheck + E2E).
