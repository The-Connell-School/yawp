import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'yawp-documents';
const DB_VERSION = 2;
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
  /** Monotonically increasing; prevents stale overwrites */
  localVersion: number;
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
        upgrade(db, oldVersion, _newVersion, transaction) {
          if (oldVersion < 1) {
            db.createObjectStore(STORE_NAME, { keyPath: 'docId' });
          }
          if (oldVersion < 2) {
            // Migration: backfill localVersion on existing records
            const store = transaction.objectStore(STORE_NAME);
            store.openCursor().then(function migrate(cursor) {
              if (!cursor) return;
              const value = cursor.value;
              if (value.localVersion === undefined) {
                value.localVersion = 0;
                cursor.update(value);
              }
              return cursor.continue().then(migrate);
            });
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

  /**
   * Version-gated write. Silently rejects if the existing entry has a
   * localVersion >= the incoming entry's localVersion, preventing stale
   * data from overwriting fresher content.
   */
  async put(entry: DocumentStoreEntry): Promise<void> {
    if (this._useMemory()) {
      const existing = this._mem().get(entry.docId);
      if (existing && existing.localVersion >= entry.localVersion) return;
      this._mem().set(entry.docId, { ...entry });
      return;
    }
    // Note: This version gate is safe for single-tab sequential writes (our use case).
    // IDB readwrite transactions do not provide true serializable isolation — concurrent
    // transactions from the same JS context can interleave. If multi-tab or worker
    // scenarios are needed, add a promise-based transaction queue.
    const db = await this._getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = await store.get(entry.docId);
    if (existing && existing.localVersion >= entry.localVersion) {
      tx.abort();
      return;
    }
    await store.put(entry);
    await tx.done;
  }

  /**
   * Bypass version gating — for internal updates that don't change content
   * (e.g. markSynced, markFailed).
   */
  private async _rawPut(entry: DocumentStoreEntry): Promise<void> {
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
    await this._rawPut({
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
    await this._rawPut({
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
