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
        new Response(
          JSON.stringify({
            ok: true,
            revision: 2,
            savedAt: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
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
      localVersion: 1,
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
      localVersion: 1,
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
      localVersion: 1,
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
      localVersion: 1,
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
      localVersion: 1,
    });

    await service.forceSave();
    expect(listener).not.toHaveBeenCalled();
  });
});
