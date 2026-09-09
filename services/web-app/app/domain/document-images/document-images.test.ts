import { describe, expect, test } from 'bun:test';
import {
  carriesFiles,
  filesFromDataTransfer,
  DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES,
  DOCUMENT_IMAGE_MAX_BYTES,
  GBA300_EXPANSION_RUBRIC_NAME,
  buildDocumentImageSrc,
  isDocumentImageSrc,
  isDocumentImageUploadEnabled,
  normalizeAltText,
  parseDocumentImageId,
  sniffImageContentType,
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

  test('enables uploads for an assignment type that opted in directly', () => {
    // Production's GBA 300 expansion assignment type has no linked Rubric row,
    // so the column is the signal that actually carries the rollout.
    expect(
      isDocumentImageUploadEnabled({ rubricName: null, allowsImageUploads: true })
    ).toBe(true);
  });

  test('leaves an assignment type that has not opted in alone', () => {
    expect(
      isDocumentImageUploadEnabled({
        rubricName: 'thesis-driven-essay',
        allowsImageUploads: false,
      })
    ).toBe(false);
  });

  test('the kill switch overrides a direct opt-in too', () => {
    expect(
      isDocumentImageUploadEnabled({ allowsImageUploads: true, killSwitch: 'true' })
    ).toBe(false);
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

describe('filesFromDataTransfer', () => {
  const png = new File([new Uint8Array([1])], 'chart.png', { type: 'image/png' });
  const txt = new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' });

  test('returns the files a paste or drop carries', () => {
    expect(filesFromDataTransfer({ files: [png, txt] })).toEqual([png, txt]);
  });

  test('returns non-image files too, so the student gets a real error', () => {
    // A dropped PDF must produce "that format is not supported", not silence.
    expect(filesFromDataTransfer({ files: [txt] })).toEqual([txt]);
  });

  test('is empty for a paste carrying no files', () => {
    expect(filesFromDataTransfer({ files: [] })).toEqual([]);
    expect(filesFromDataTransfer({})).toEqual([]);
    expect(filesFromDataTransfer(null)).toEqual([]);
    expect(filesFromDataTransfer(undefined)).toEqual([]);
  });
});

describe('carriesFiles', () => {
  test('is true only when there is at least one file to handle', () => {
    const png = new File([new Uint8Array([1])], 'chart.png', { type: 'image/png' });
    expect(carriesFiles({ files: [png] })).toBe(true);
    // Plain text paste: must fall through to the editor untouched.
    expect(carriesFiles({ files: [] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });
});

describe('sniffImageContentType', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const WEBP = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);

  test('reads the format out of the bytes, not the declared type', () => {
    expect(sniffImageContentType(PNG)).toBe('image/png');
    expect(sniffImageContentType(JPEG)).toBe('image/jpeg');
    expect(sniffImageContentType(GIF)).toBe('image/gif');
    expect(sniffImageContentType(WEBP)).toBe('image/webp');
  });

  test('rejects a document wearing an image content type', () => {
    // The whole point: a student can put image/png on any bytes they like.
    const html = new TextEncoder().encode('<script>alert(1)</script>');
    expect(sniffImageContentType(html)).toBeNull();
  });

  test('rejects an SVG, which is script-capable XML we serve from our origin', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffImageContentType(svg)).toBeNull();
  });

  test('does not read past the end of a truncated file', () => {
    expect(sniffImageContentType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageContentType(new Uint8Array())).toBeNull();
    // RIFF header with no WEBP tag behind it is some other RIFF container.
    expect(sniffImageContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});
