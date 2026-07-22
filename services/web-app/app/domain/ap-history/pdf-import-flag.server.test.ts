import { afterEach, describe, expect, test } from 'bun:test';
import { isApHistoryPdfImportEnabled } from './pdf-import-flag.server';

const original = process.env.AP_HISTORY_PDF_IMPORT_ENABLED;

afterEach(() => {
  if (original === undefined) {
    delete process.env.AP_HISTORY_PDF_IMPORT_ENABLED;
  } else {
    process.env.AP_HISTORY_PDF_IMPORT_ENABLED = original;
  }
});

describe('isApHistoryPdfImportEnabled', () => {
  test('is default-off and follows only the organization gate', () => {
    delete process.env.AP_HISTORY_PDF_IMPORT_ENABLED;
    expect(isApHistoryPdfImportEnabled(false)).toBe(false);
    expect(isApHistoryPdfImportEnabled(true)).toBe(true);
  });

  test('the environment can kill but never enable a tenant', () => {
    process.env.AP_HISTORY_PDF_IMPORT_ENABLED = 'false';
    expect(isApHistoryPdfImportEnabled(true)).toBe(false);

    process.env.AP_HISTORY_PDF_IMPORT_ENABLED = 'true';
    expect(isApHistoryPdfImportEnabled(false)).toBe(false);
    expect(isApHistoryPdfImportEnabled(true)).toBe(true);
  });
});
