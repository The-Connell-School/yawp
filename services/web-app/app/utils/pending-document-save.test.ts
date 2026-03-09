import { describe, it, expect, beforeEach } from 'bun:test';
import {
  setPendingSave,
  getPendingSave,
  clearPendingSave,
} from './pending-document-save';

// Polyfill localStorage for non-browser test environments
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('pending-document-save', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setPendingSave', () => {
    it('stores content in localStorage', () => {
      setPendingSave('doc-1', { html: '<p>hello</p>', text: 'hello' });
      const raw = localStorage.getItem('yawp:pending-save:doc-1');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.docId).toBe('doc-1');
      expect(parsed.html).toBe('<p>hello</p>');
      expect(parsed.text).toBe('hello');
      expect(typeof parsed.savedAt).toBe('number');
    });

    it('overwrites previous entry', () => {
      setPendingSave('doc-1', { html: '<p>first</p>', text: 'first' });
      setPendingSave('doc-1', { html: '<p>second</p>', text: 'second' });
      const result = getPendingSave('doc-1');
      expect(result?.html).toBe('<p>second</p>');
    });
  });

  describe('getPendingSave', () => {
    it('returns null when no entry exists', () => {
      expect(getPendingSave('doc-1')).toBeNull();
    });

    it('returns the stored entry', () => {
      setPendingSave('doc-1', { html: '<p>hi</p>', text: 'hi' });
      const result = getPendingSave('doc-1');
      expect(result).toEqual(
        expect.objectContaining({
          docId: 'doc-1',
          html: '<p>hi</p>',
          text: 'hi',
        })
      );
    });

    it('returns null for invalid JSON', () => {
      localStorage.setItem('yawp:pending-save:doc-1', 'not-json');
      expect(getPendingSave('doc-1')).toBeNull();
    });

    it('returns null for malformed data', () => {
      localStorage.setItem(
        'yawp:pending-save:doc-1',
        JSON.stringify({ docId: 'doc-1' })
      );
      expect(getPendingSave('doc-1')).toBeNull();
    });
  });

  describe('clearPendingSave', () => {
    it('removes the entry from localStorage', () => {
      setPendingSave('doc-1', { html: '<p>hi</p>', text: 'hi' });
      clearPendingSave('doc-1');
      expect(getPendingSave('doc-1')).toBeNull();
    });

    it('does not throw when entry does not exist', () => {
      expect(() => clearPendingSave('doc-1')).not.toThrow();
    });
  });
});
