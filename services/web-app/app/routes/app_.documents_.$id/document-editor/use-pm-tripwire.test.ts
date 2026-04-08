import { GlobalRegistrator } from '@happy-dom/global-registrator';
// Guard: register only if not already registered (multi-file bun:test runs share a process)
try {
  GlobalRegistrator.register();
} catch {
  // Already registered by another test file in this process — safe to ignore
}

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SourceTracker, USER_SOURCE_META } from './extensions/source-tracker';
import {
  checkPmTransaction,
  installPmTripwire,
  RECOVERY_SOURCE,
} from './use-pm-tripwire';

describe('checkPmTransaction (pure predicate)', () => {
  // Build minimal synthetic transactions
  const fakeTx = (docChanged: boolean, source: string | null) => ({
    docChanged,
    steps: [{ type: 'replace' }],
    getMeta: (key: string) => (key === USER_SOURCE_META && source ? source : undefined),
  } as any);

  it('returns null when transaction does not change content (no violation)', () => {
    expect(checkPmTransaction(fakeTx(false, null))).toBeNull();
  });

  it('returns null when transaction is tagged user', () => {
    expect(checkPmTransaction(fakeTx(true, 'user'))).toBeNull();
  });

  it('returns null when transaction is tagged recovery-on-mount', () => {
    expect(checkPmTransaction(fakeTx(true, RECOVERY_SOURCE))).toBeNull();
  });

  it('returns error message when docChanged transaction has no source meta', () => {
    const result = checkPmTransaction(fakeTx(true, null));
    expect(result).not.toBeNull();
    expect(result).toContain('Unauthorized PM mutation');
  });

  it('returns error message when source is unrecognized', () => {
    const result = checkPmTransaction(fakeTx(true, 'mystery-source'));
    expect(result).not.toBeNull();
  });
});

describe('installPmTripwire (with real Editor)', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, SourceTracker],
      content: '<p>hello</p>',
    });
    (window as any).__yawpUnauthorizedPmWrites = 0;
  });

  afterEach(() => {
    editor.destroy();
  });

  it('throws on unauthorized mutation when dev: true', () => {
    installPmTripwire(editor, { dev: true });

    expect(() => {
      // Programmatic insert with no user DOM event → no source tag → tripwire fires
      editor.commands.insertContent('untagged');
    }).toThrow(/Unauthorized PM mutation/);
  });

  it('logs and increments counter in prod (dev: false), does NOT throw', () => {
    const errorSpy = mock(() => {});
    const original = console.error;
    console.error = errorSpy;

    try {
      installPmTripwire(editor, { dev: false });
      expect(() => {
        editor.commands.insertContent('untagged');
      }).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
      expect((window as any).__yawpUnauthorizedPmWrites).toBe(1);
    } finally {
      console.error = original;
    }
  });

  it('does NOT throw or log when source is tagged user (via SourceTracker DOM event)', () => {
    installPmTripwire(editor, { dev: true });

    // Simulate a real user event before the mutation — SourceTracker tags it
    const dom = editor.view.dom as HTMLElement;
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(() => {
      editor.commands.insertContent('a');
    }).not.toThrow();
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const unsubscribe = installPmTripwire(editor, { dev: true });
    unsubscribe();

    // After unsubscribe, the tripwire should NOT fire
    expect(() => {
      editor.commands.insertContent('after-unsub');
    }).not.toThrow();
  });
});
