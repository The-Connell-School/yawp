import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

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
    let lastMeta: string | null = null;
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        lastMeta = transaction.getMeta(USER_SOURCE_META) ?? null;
      }
    });

    // Simulate a user keydown by triggering it on the editor view dom
    const dom = editor.view.dom as HTMLElement;
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    // Simulate the resulting input by dispatching a transaction
    editor.commands.insertContent('a');

    expect(lastMeta).toBe('user');
  });

  it('does NOT tag transactions originating from explicit code', () => {
    let lastMeta: string | null = null;
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        lastMeta = transaction.getMeta(USER_SOURCE_META) ?? null;
      }
    });

    // No DOM event — pure code-initiated transaction
    editor.commands.insertContent('hello world');

    expect(lastMeta).toBeNull();
  });
});
