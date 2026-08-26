import { describe, expect, test } from 'bun:test';
import {
  DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES,
  DOCUMENT_IMAGE_MAX_BYTES,
  GBA300_EXPANSION_RUBRIC_NAME,
  buildDocumentImageSrc,
  isDocumentImageSrc,
  isDocumentImageUploadEnabled,
  normalizeAltText,
  parseDocumentImageId,
  validateDocumentImageUpload,
} from './document-images';

describe('isDocumentImageUploadEnabled', () => {
  test('enables uploads for the GBA 300 expansion rubric', () => {
    expect(
      isDocumentImageUploadEnabled({ rubricName: GBA300_EXPANSION_RUBRIC_NAME })
    ).toBe(true);
  });

  test('leaves every other assignment type untouched', () => {
    expect(isDocumentImageUploadEnabled({ rubricName: 'thesis-driven-essay' })).toBe(false);
    expect(isDocumentImageUploadEnabled({ rubricName: 'daily-pages-engagement' })).toBe(false);
    expect(isDocumentImageUploadEnabled({ rubricName: 'gba300-international-etiquette' })).toBe(
      false
    );
  });

  test('treats a document with no rubric as not enabled', () => {
    expect(isDocumentImageUploadEnabled({ rubricName: null })).toBe(false);
    expect(isDocumentImageUploadEnabled({ rubricName: undefined })).toBe(false);
  });

  test('the kill switch turns the feature off even for the GBA expansion rubric', () => {
    expect(
      isDocumentImageUploadEnabled({
        rubricName: GBA300_EXPANSION_RUBRIC_NAME,
        killSwitch: 'true',
      })
    ).toBe(false);
  });

  test('an unset or non-"true" kill switch leaves the feature on', () => {
    for (const killSwitch of [undefined, '', 'false', 'no', '0']) {
      expect(
        isDocumentImageUploadEnabled({
          rubricName: GBA300_EXPANSION_RUBRIC_NAME,
          killSwitch,
        })
      ).toBe(true);
    }
  });
});

describe('validateDocumentImageUpload', () => {
  const ok = { contentType: 'image/png', byteSize: 1024, altText: 'Revenue by year' };

  test('accepts a well-formed upload', () => {
    const result = validateDocumentImageUpload(ok);
    expect(result.ok).toBe(true);
  });

  test('accepts every allowed content type', () => {
    for (const contentType of DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES) {
      expect(validateDocumentImageUpload({ ...ok, contentType }).ok).toBe(true);
    }
  });

  test('ignores content-type parameters and casing', () => {
    expect(validateDocumentImageUpload({ ...ok, contentType: 'IMAGE/PNG' }).ok).toBe(true);
    expect(
      validateDocumentImageUpload({ ...ok, contentType: 'image/jpeg; charset=binary' }).ok
    ).toBe(true);
  });

  test('rejects a content type outside the allowlist', () => {
    const result = validateDocumentImageUpload({ ...ok, contentType: 'image/svg+xml' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported-type');
  });

  test('rejects a non-image content type', () => {
    const result = validateDocumentImageUpload({ ...ok, contentType: 'application/pdf' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported-type');
  });

  test('rejects an empty file', () => {
    const result = validateDocumentImageUpload({ ...ok, byteSize: 0 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('empty');
  });

  test('accepts a file exactly at the size cap', () => {
    expect(
      validateDocumentImageUpload({ ...ok, byteSize: DOCUMENT_IMAGE_MAX_BYTES }).ok
    ).toBe(true);
  });

  test('rejects a file over the size cap', () => {
    const result = validateDocumentImageUpload({
      ...ok,
      byteSize: DOCUMENT_IMAGE_MAX_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('too-large');
  });

  test('rejects a blank alt text so every figure stays screen-reader legible', () => {
    for (const altText of ['', '   ', '\n\t']) {
      const result = validateDocumentImageUpload({ ...ok, altText });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('missing-alt-text');
    }
  });

  test('returns the normalized alt text on success', () => {
    const result = validateDocumentImageUpload({ ...ok, altText: '  Revenue by year \n' });
    expect(result.ok === true && result.altText).toBe('Revenue by year');
  });
});

describe('normalizeAltText', () => {
  test('trims and collapses whitespace', () => {
    expect(normalizeAltText('  Ten-year   sales\n history ')).toBe('Ten-year sales history');
  });

  test('caps runaway alt text', () => {
    expect(normalizeAltText('x'.repeat(1000)).length).toBe(300);
  });
});

describe('document image src round-tripping', () => {
  test('builds a same-origin src for an image id', () => {
    expect(buildDocumentImageSrc('img-1')).toBe('/api/image/document/img-1');
  });

  test('recognizes its own src', () => {
    expect(isDocumentImageSrc(buildDocumentImageSrc('img-1'))).toBe(true);
  });

  test('rejects anything that is not one of our image endpoints', () => {
    expect(isDocumentImageSrc('https://evil.example.com/tracker.png')).toBe(false);
    expect(isDocumentImageSrc('//evil.example.com/tracker.png')).toBe(false);
    expect(isDocumentImageSrc('data:image/png;base64,AAAA')).toBe(false);
    expect(isDocumentImageSrc('javascript:alert(1)')).toBe(false);
    expect(isDocumentImageSrc('/api/image/course/abc')).toBe(false);
    expect(isDocumentImageSrc('/api/image/document/')).toBe(false);
    expect(isDocumentImageSrc('/api/image/document/abc/../../secret')).toBe(false);
    expect(isDocumentImageSrc(null)).toBe(false);
  });

  test('parses the image id back out of a src', () => {
    expect(parseDocumentImageId('/api/image/document/img-1')).toBe('img-1');
    expect(parseDocumentImageId('https://evil.example.com/x.png')).toBe(null);
  });
});
