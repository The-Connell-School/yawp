import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {}
import { describe, expect, test } from 'bun:test';
import {
  initialsForDisplayName,
  readCommentHighlightExcerpt,
} from './comment-highlight-excerpt';

describe('readCommentHighlightExcerpt', () => {
  test('reads text from the comment mark in the editor', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p>Hello <span class="comment-mark" data-comment-id="c-1">focus</span> world</p>';
    expect(readCommentHighlightExcerpt(root, 'c-1')).toBe('focus');
  });

  test('returns null when the mark is missing', () => {
    const root = document.createElement('div');
    expect(readCommentHighlightExcerpt(root, 'missing')).toBeNull();
  });

  test('falls back to the document ProseMirror root when contentRoot is null', () => {
    const scroll = document.createElement('div');
    scroll.dataset.testid = 'document-editor-scroll';
    const prose = document.createElement('div');
    prose.className = 'ProseMirror';
    prose.innerHTML =
      '<p><span class="comment-mark" data-comment-id="c-2">anchor</span></p>';
    scroll.appendChild(prose);
    document.body.appendChild(scroll);
    expect(readCommentHighlightExcerpt(null, 'c-2')).toBe('anchor');
    scroll.remove();
  });
});

describe('initialsForDisplayName', () => {
  test('uses two-letter initials for a full name', () => {
    expect(initialsForDisplayName('Riley Student')).toBe('RS');
  });
});