// A minimal localStorage rather than registering happy-dom: these tests
// need nothing else from the DOM, and registering here would change the
// global environment for every other test file sharing the process.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

import { beforeEach, describe, expect, it } from 'bun:test';
import {
  APP_INTERNAL_COPY_KEY,
  markInternalCopy,
  wasCopiedInsideApp,
} from './internal-copy';

describe('internal copy provenance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('treats a paste as external when nothing was copied in the app', () => {
    expect(wasCopiedInsideApp('some text from elsewhere')).toBe(false);
  });

  it('recognizes a paste of exactly what was copied in the app', () => {
    markInternalCopy('a paragraph the student copied');
    expect(wasCopiedInsideApp('a paragraph the student copied')).toBe(true);
  });

  it('recognizes the same in-app text pasted more than once', () => {
    // A student who copies one passage and pastes it in two places must not
    // trip an alert on the second paste.
    markInternalCopy('a paragraph the student copied');

    expect(wasCopiedInsideApp('a paragraph the student copied')).toBe(true);
    expect(wasCopiedInsideApp('a paragraph the student copied')).toBe(true);
    expect(wasCopiedInsideApp('a paragraph the student copied')).toBe(true);
  });

  it('ignores whitespace differences between the selection and the clipboard', () => {
    markInternalCopy('first line\n\nsecond line');
    expect(wasCopiedInsideApp('first line\nsecond line  ')).toBe(true);
  });

  it('falls back to suppressing one paste when the copied text could not be read', () => {
    // Some surfaces (inputs, textareas) do not expose the copied text to a
    // document-level copy listener. Suppressing one paste matches the older
    // behavior; being stricter here would risk a false alarm.
    markInternalCopy('');

    expect(wasCopiedInsideApp('anything at all')).toBe(true);
    expect(wasCopiedInsideApp('anything at all')).toBe(false);
  });

  it('suppresses one paste when the stored value predates content matching', () => {
    // A tab that was open across the deploy can still hold the old boolean.
    localStorage.setItem(APP_INTERNAL_COPY_KEY, 'true');

    expect(wasCopiedInsideApp('anything at all')).toBe(true);
    expect(wasCopiedInsideApp('anything at all')).toBe(false);
  });

  it('still suppresses a paste that does not match the last in-app copy, but only once', () => {
    // The mismatch may be a browser normalizing the clipboard differently
    // from the DOM selection, so this stays as permissive as it was before
    // content matching existed.
    markInternalCopy('what was copied');

    expect(wasCopiedInsideApp('something completely different')).toBe(true);
    expect(wasCopiedInsideApp('something completely different')).toBe(false);
  });

  it('replaces the record when a newer in-app copy happens', () => {
    markInternalCopy('first copy');
    markInternalCopy('second copy');

    expect(wasCopiedInsideApp('second copy')).toBe(true);
  });
});
