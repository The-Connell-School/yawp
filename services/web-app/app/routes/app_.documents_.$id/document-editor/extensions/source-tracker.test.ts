import { GlobalRegistrator } from '@happy-dom/global-registrator';
// Guard: register only if not already registered (multi-file bun:test runs share a process)
try {
  GlobalRegistrator.register();
} catch {
  // Already registered by another test file in this process — safe to ignore
}

import { describe, it, expect, beforeEach } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SourceTracker, USER_SOURCE_META } from './source-tracker';

describe('SourceTracker extension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, SourceTracker],
      content: '<p>hello</p>',
    });
  });

  it('tags transactions originating from user input events', () => {
    const captured: { meta: string | null } = { meta: null };
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        captured.meta = transaction.getMeta(USER_SOURCE_META) ?? null;
      }
    });

    // Simulate a user keydown by triggering it on the editor view dom
    const dom = editor.view.dom as HTMLElement;
    dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    // Simulate the resulting input by dispatching a transaction
    editor.commands.insertContent('a');

    expect(captured.meta).toBe('user');
  });

  it('does NOT tag transactions originating from explicit code', () => {
    const captured: { meta: string | null } = { meta: null };
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        captured.meta = transaction.getMeta(USER_SOURCE_META) ?? null;
      }
    });

    // No DOM event — pure code-initiated transaction
    editor.commands.insertContent('hello world');

    expect(captured.meta).toBeNull();
  });
});
