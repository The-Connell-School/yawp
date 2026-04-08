import { type DocumentStore } from './document-store';

export type SyncStatus =
  | 'synced'
  | 'saving'
  | 'offline'
  | 'auth-expired'
  | 'error'
  | 'conflict';

export class SyncService {
  private _store: DocumentStore;
  private _fetch: typeof fetch;
  private _docId: string | null = null;
  private _status: SyncStatus = 'synced';
  private _listeners: Set<(status: SyncStatus) => void> = new Set();
  private _revisionListeners: Set<(revision: number) => void> = new Set();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryCount = 0;
  private _lastSyncedHash: string | null = null;
  private _conflictedHash: string | null = null;
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
    this._conflictedHash = null;
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

  onRevisionUpdate(cb: (revision: number) => void): () => void {
    this._revisionListeners.add(cb);
    return () => {
      this._revisionListeners.delete(cb);
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

    // If this exact content was already rejected as stale by the server, don't
    // keep retrying it — it would just get rejected again. Wait for the next
    // user keystroke to produce fresh content (with a fresh baseRevision via
    // the high-water mark advanced by onRevisionUpdate listeners).
    if (entry.contentHash === this._conflictedHash) {
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
          baseRevision: entry.serverRevision,
          trigger,
        }),
      });

      if (response.ok) {
        const body = await response.json();
        await this._store.markSynced(this._docId, body.revision, Date.now());
        this._lastSyncedHash = entry.contentHash;
        this._conflictedHash = null;
        this._retryCount = 0;
        if (typeof body.revision === 'number') {
          this._emitRevision(body.revision);
        }
        this._setStatus('synced');
        return;
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => null);
        if (body?.error === 'stale_base_revision') {
          // The local IDB content is based on a stale view of the server.
          // Mark this content as conflicted so we don't loop on it, advance
          // the high-water mark from the server's response, and surface a
          // conflict status to the UI. The next editor mutation will produce
          // fresh content with the new baseRevision and resume normal sync.
          this._conflictedHash = entry.contentHash;
          await this._store.markFailed(this._docId, 'stale_base_revision');
          if (typeof body.currentRevision === 'number') {
            this._emitRevision(body.currentRevision);
          }
          this._retryCount = 0;
          this._setStatus('conflict');
          return;
        }
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

  private _emitRevision(revision: number): void {
    for (const cb of this._revisionListeners) {
      try {
        cb(revision);
      } catch {
        // Listener errors are non-fatal
      }
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
