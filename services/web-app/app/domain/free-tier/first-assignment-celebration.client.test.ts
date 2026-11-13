import { describe, expect, test } from 'bun:test';
import {
  readFirstAssignmentCelebrationPendingClassId,
  writeFirstAssignmentCelebrationPending,
} from './first-assignment-celebration.client';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('first-assignment-celebration.client', () => {
  test('stores pending class id alongside assignment id', () => {
    localStorage.clear();
    (globalThis as { window?: typeof globalThis }).window = globalThis;
    writeFirstAssignmentCelebrationPending('assignment-1', 'class-9');
    expect(readFirstAssignmentCelebrationPendingClassId()).toBe('class-9');
  });
});
