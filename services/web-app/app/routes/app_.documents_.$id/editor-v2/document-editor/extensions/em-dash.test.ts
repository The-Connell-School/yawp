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
import { EmDash } from './em-dash';

// Input rules fire via TipTap's simulated-input mechanism, which schedules
// the actual match/replace in a `setTimeout(0)` (see @tiptap/core's
// `inputRulesPlugin`). Flush that queued microtask/macrotask before asserting.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function typeText(editor: Editor, text: string) {
  for (const char of text) {
    editor.commands.insertContent(char, { applyInputRules: true });
    await flush();
  }
}

describe('EmDash extension', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, EmDash],
      content: '<p></p>',
    });
  });

  it('converts two typed hyphens into an em dash', async () => {
    await typeText(editor, 'wait--really');
    expect(editor.getText()).toBe('wait—really');
  });

  it('is undoable with a single undo, reverting to the two hyphens', async () => {
    await typeText(editor, 'wait--');
    expect(editor.getText()).toBe('wait—');

    editor.commands.undo();
    expect(editor.getText()).toBe('wait--');
  });

  it('does not corrupt an existing triple hyphen already in the document', () => {
    editor.commands.setContent('<p>already---here</p>');
    expect(editor.getText()).toBe('already---here');
  });

  it('does not fire inside inline code', async () => {
    editor.commands.setContent('<p><code>a</code></p>');
    editor.commands.focus('end');
    await typeText(editor, '--');
    expect(editor.getText()).toBe('a--');
  });

  it('does not fire inside a code block', async () => {
    editor.commands.setContent('<pre><code>a</code></pre>');
    editor.commands.focus('end');
    await typeText(editor, '--');
    expect(editor.getText()).toBe('a--');
  });

  it('does not touch a hyphenated word like well-known', async () => {
    await typeText(editor, 'well-known');
    expect(editor.getText()).toBe('well-known');
  });
});
