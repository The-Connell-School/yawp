import { describe, expect, it } from 'bun:test';
import { uniqueMarginCommentIds } from './margin-comment-ids';

describe('uniqueMarginCommentIds', () => {
  it('drops duplicate ids when draft id matches a committed comment', () => {
    expect(
      uniqueMarginCommentIds(['a', 'b'], 'a')
    ).toEqual(['a', 'b']);
  });

  it('preserves first-seen order', () => {
    expect(uniqueMarginCommentIds(['c', 'a', 'c', 'b'])).toEqual(['c', 'a', 'b']);
  });
});