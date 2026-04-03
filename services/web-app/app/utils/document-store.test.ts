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
        localVersion: 1,
      });
      const entry = await store.get('doc-1');
      expect(entry).not.toBeNull();
      expect(entry!.html).toBe('<p>hello</p>');
      expect(entry!.syncStatus).toBe('pending');
    });

    it('overwrites existing entry when localVersion is higher', async () => {
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
        localVersion: 1,
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
        localVersion: 2,
      });
      const entry = await store.get('doc-1');
      expect(entry!.html).toBe('<p>second</p>');
      expect(entry!.updatedAt).toBe(2000);
    });

    it('rejects write when localVersion is lower than existing', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>fresh</p>',
        text: 'fresh',
        updatedAt: 2000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'aaa',
        localVersion: 5,
      });
      await store.put({
        docId: 'doc-1',
        html: '<p>stale</p>',
        text: 'stale',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'bbb',
        localVersion: 3,
      });
      const entry = await store.get('doc-1');
      expect(entry!.html).toBe('<p>fresh</p>');
      expect(entry!.localVersion).toBe(5);
    });

    it('rejects write when localVersion equals existing', async () => {
      await store.put({
        docId: 'doc-1',
        html: '<p>first</p>',
        text: 'first',
        updatedAt: 1000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'aaa',
        localVersion: 3,
      });
      await store.put({
        docId: 'doc-1',
        html: '<p>duplicate</p>',
        text: 'duplicate',
        updatedAt: 2000,
        serverRevision: 1,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'bbb',
        localVersion: 3,
      });
      const entry = await store.get('doc-1');
      expect(entry!.html).toBe('<p>first</p>');
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
        localVersion: 1,
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
        localVersion: 1,
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
        localVersion: 1,
      });
      await store.delete('doc-1');
      const entry = await store.get('doc-1');
      expect(entry).toBeNull();
    });
  });
});
