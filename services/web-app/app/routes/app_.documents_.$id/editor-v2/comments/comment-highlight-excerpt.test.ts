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
});

describe('initialsForDisplayName', () => {
  test('uses two-letter initials for a full name', () => {
    expect(initialsForDisplayName('Riley Student')).toBe('RS');
  });
});