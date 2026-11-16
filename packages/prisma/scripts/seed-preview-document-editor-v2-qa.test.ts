import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  previewDocumentEditorV2QaDatabaseAllowed,
  shouldRunPreviewDocumentEditorV2QaSeed,
} from './seed-preview-document-editor-v2-qa';
import {
  PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID,
  PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID,
} from './local-dev/preview-document-editor-v2-qa';

describe('seed-preview-document-editor-v2-qa', () => {
  test('previewDocumentEditorV2QaDatabaseAllowed gates PR preview databases', () => {
    expect(
      previewDocumentEditorV2QaDatabaseAllowed(
        'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_963'
      )
    ).toBe(true);
    expect(
      previewDocumentEditorV2QaDatabaseAllowed(
        'postgresql://postgres:postgres@preview-postgres:5432/yawp_demo'
      )
    ).toBe(false);
  });

  test('shouldRunPreviewDocumentEditorV2QaSeed respects PREVIEW_DATA_MODE', () => {
    const previous = process.env.PREVIEW_DATA_MODE;
  try {
    delete process.env.PREVIEW_DATA_MODE;
    expect(shouldRunPreviewDocumentEditorV2QaSeed()).toBe(true);
    process.env.PREVIEW_DATA_MODE = 'seed';
    expect(shouldRunPreviewDocumentEditorV2QaSeed()).toBe(true);
    process.env.PREVIEW_DATA_MODE = 'dump';
    expect(shouldRunPreviewDocumentEditorV2QaSeed()).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.PREVIEW_DATA_MODE;
    else process.env.PREVIEW_DATA_MODE = previous;
  }
  });

  test('uses stable preview-only document ids', () => {
    expect(PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID).toMatch(/^previewdoc/);
    expect(PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID).toMatch(/^previewdoc/);
  });

  test('is wired for preview seed deploys and non-fatal failures', () => {
    const script = readFileSync(
      join(import.meta.dir, 'seed-preview-document-editor-v2-qa.ts'),
      'utf8'
    );
    expect(script).toContain('failed (non-fatal)');
    expect(script).toContain('assertLocalSeedTarget');
    expect(script).toContain('PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID');

    const deploy = readFileSync(
      join(import.meta.dir, '../../../scripts/preview/deploy.sh'),
      'utf8'
    );
    expect(deploy).toContain('seed-preview-document-editor-v2-qa');
  });
});