import { expect, test } from 'bun:test';
import { readSkippedTours, writeSkippedTours } from './skipped-tours';
test('skips last only for the same authenticated session and account', () => {
  const previous = globalThis.window;
  const entries = new Map<string, string>();
  (globalThis as any).window = { sessionStorage: { getItem: (key: string) => entries.get(key), setItem: (key: string, value: string) => entries.set(key, value) } };
  try {
    writeSkippedTours('login-one', ['dashboard']);
    expect(readSkippedTours('login-one')).toEqual(['dashboard']);
    expect(readSkippedTours('login-two')).toEqual([]);
    writeSkippedTours('login-two', ['class']);
    expect(readSkippedTours('login-two')).toEqual(['class']);
    expect(readSkippedTours('login-one')).toEqual(['dashboard']);
  } finally { (globalThis as any).window = previous; }
});
