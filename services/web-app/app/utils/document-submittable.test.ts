import { describe, expect, test } from 'bun:test';
import { isDocumentSubmittableContent } from './document-submittable';

describe('isDocumentSubmittableContent', () => {
  test('true when both html and text are non-empty', () => {
    expect(isDocumentSubmittableContent('<p>a</p>', 'a')).toBe(true);
  });

  test('false when text is empty', () => {
    expect(isDocumentSubmittableContent('<p></p>', '')).toBe(false);
  });

  test('false when html is empty', () => {
    expect(isDocumentSubmittableContent('', 'x')).toBe(false);
  });
});
