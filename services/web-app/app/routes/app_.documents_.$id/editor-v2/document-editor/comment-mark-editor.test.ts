import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

import { describe, expect, it } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Comment } from './extensions/comment';
import {
  removeCommentMarkFromEditor,
  unsetCommentAtSelection,
} from './comment-mark-editor';

function editorWithHtml(html: string) {
  return new Editor({
    extensions: [StarterKit, Comment],
    content: html,
  });
}

describe('comment-mark-editor', () => {
  it('removeCommentMarkFromEditor removes only the matching id', () => {
    const editor = editorWithHtml(
      '<p><span data-comment-id="keep">a</span> <span data-comment-id="drop">b</span></p>'
    );
    const removed = removeCommentMarkFromEditor(editor, 'drop');
    expect(removed).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain('data-comment-id="keep"');
    expect(html).not.toContain('data-comment-id="drop"');
    editor.destroy();
  });

  it('unsetCommentAtSelection clears the active comment mark', () => {
    const editor = editorWithHtml(
      '<p><span data-comment-id="draft">selected</span></p>'
    );
    editor.commands.setTextSelection({ from: 1, to: 9 });
    const ok = unsetCommentAtSelection(editor);
    expect(ok).toBe(true);
    expect(editor.getHTML()).not.toContain('data-comment-id="draft"');
    editor.destroy();
  });
});