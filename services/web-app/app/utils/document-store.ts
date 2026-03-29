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
