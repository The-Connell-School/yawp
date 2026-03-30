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
          trigger,
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
      console.warn('[SyncService] fetch failed:', err);
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
