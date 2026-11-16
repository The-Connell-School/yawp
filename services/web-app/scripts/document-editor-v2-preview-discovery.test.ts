import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PREVIEW_V2_QA_STUDENT_NAME,
  parseDocumentIdFromHref,
} from './document-editor-v2-preview-discovery.mjs';

describe('document-editor-v2-preview-discovery', () => {
  test('preview QA student persona matches seeded dev.student account', () => {
    expect(DEFAULT_PREVIEW_V2_QA_STUDENT_NAME).toBe('Sam Student');
  });
  test('parseDocumentIdFromHref accepts documents, collab, and submissions links', () => {
    expect(parseDocumentIdFromHref('/app/documents/abc123?exitTo=%2Fapp')).toBe(
      'abc123'
    );
    expect(
      parseDocumentIdFromHref('/app/collab-documents/collab01?exitTo=%2Fapp')
    ).toBe('collab01');
    expect(parseDocumentIdFromHref('/app/submissions/sub99')).toBeNull();
    expect(parseDocumentIdFromHref('/app/my-documents')).toBeNull();
  });
});