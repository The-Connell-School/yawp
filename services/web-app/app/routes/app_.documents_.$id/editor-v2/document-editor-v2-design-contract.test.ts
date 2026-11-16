import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const V2_ROOT = join(import.meta.dir);

/** Claude Design exports: Student editor + Editor states board. */
const DESIGN_STATE_MARKERS: { state: string; marker: string }[] = [
  { state: 'student desktop', marker: 'doc-editor-frame' },
  { state: 'tutor panel', marker: 'doc-editor-tutor' },
  { state: 'comments margin', marker: 'doc-editor-margin' },
  { state: 'comments card', marker: 'doc-editor-comment-card' },
  { state: 'toolbar', marker: 'doc-editor-toolbar-glass' },
  { state: 'prompt strip', marker: 'doc-editor-prompt-strip' },
  { state: 'top bar', marker: 'doc-editor-header' },
  { state: 'teacher view banner', marker: 'doc-editor-view-banner' },
  { state: 'mobile 390', marker: 'doc-editor-mobile-tabbar' },
  { state: 'tutor step progress', marker: 'doc-editor-tutor-step-indicator' },
  { state: 'comment reply', marker: 'doc-editor-comment-reply' },
];

const V2_ONLY_COMPONENTS = [
  'document-editor-v2-page.tsx',
  'comments/margin-comment-card.tsx',
  'comments/margin-comments-rail.tsx',
  'document-editor/document-margin-comments.tsx',
  'tutor/tutor-step-progress.tsx',
  'tutor/loading.tsx',
  'document-editor/editor-bar.tsx',
];

const REPO_ROOT = join(import.meta.dir, '../../../../../..');

describe('document editor v2 design contract', () => {
  test('v2 capture fixture module is committed', () => {
    const capture = join(
      REPO_ROOT,
      'services/web-app/app/domain/document-editor/document-editor-v2-capture.shared.ts'
    );
    expect(existsSync(capture)).toBe(true);
    const text = readFileSync(capture, 'utf8');
    expect(text).toContain('v2Capture');
    expect(text).toContain('comments-reply-resolved');
  });

  test('preview document editor v2 QA constants are committed', () => {
    const constants = join(
      REPO_ROOT,
      'packages/prisma/scripts/local-dev/preview-document-editor-v2-qa.ts'
    );
    expect(existsSync(constants)).toBe(true);
    const text = readFileSync(constants, 'utf8');
    expect(text).toContain('previewdoceditv2qa0001');
  });

  test('Claude Design exports are committed under docs/design/document-editor-v2', () => {
    const designDir = join(REPO_ROOT, 'docs/design/document-editor-v2');
    expect(existsSync(join(designDir, 'document-editor.html'))).toBe(true);
    expect(existsSync(join(designDir, 'document-editor-states.html'))).toBe(true);
    expect(existsSync(join(designDir, 'button.css'))).toBe(true);
    expect(existsSync(join(designDir, 'IMPLEMENTATION.md'))).toBe(true);
  });

  test('resolved comment row uses states-board glass chrome', () => {
    const css = readFileSync(
      join(V2_ROOT, 'document-editor/document-editor-redesign.css'),
      'utf8'
    );
    expect(css).toContain('.doc-editor-comment-resolved-row');
    expect(css).toContain('backdrop-filter: blur(16px)');
    expect(css).toContain('0 12px 32px rgba(31, 53, 50, 0.1)');
  });

  test('redesign CSS exposes tokens from the Student editor export', () => {
    const css = readFileSync(
      join(V2_ROOT, 'document-editor/document-editor-redesign.css'),
      'utf8'
    );
    expect(css).toContain('--tutor-panel-bg: #fcfaf5');
    expect(css).toContain('--tutor-rim: #e3ded2');
    expect(css).toContain('--tutor-bubble-bg: #ffffff');
    expect(css).toContain('--tutor-name: #1f4d3a');
    expect(css).toContain('--tutor-meta: #5f5b52');
    expect(css).toContain('--student-bubble-bg: #e8f0eb');
    expect(css).toContain('--doc-glass-bg:');
    expect(css).toContain('--doc-workspace-bg:');
    expect(css).toContain('.doc-editor-comments-sheet');
    expect(css).toContain('.doc-editor-comment-card--sheet');
  });

  test('each states-board surface maps to v2 CSS or components', () => {
    const css = readFileSync(
      join(V2_ROOT, 'document-editor/document-editor-redesign.css'),
      'utf8'
    );
    for (const { state, marker } of DESIGN_STATE_MARKERS) {
      expect(css.includes(marker)).toBe(true);
      if (!css.includes(marker)) {
        throw new Error(`Missing design marker for ${state}: ${marker}`);
      }
    }
  });

  test('v2 route uses editor-v2-only components (not v1 page)', () => {
    for (const file of V2_ONLY_COMPONENTS) {
      expect(existsSync(join(V2_ROOT, file))).toBe(true);
    }
    expect(existsSync(join(V2_ROOT, '../editor-v1/document-editor-v1-page.tsx'))).toBe(
      true
    );
    const pageSource = readFileSync(
      join(V2_ROOT, 'document-editor-v2-page.tsx'),
      'utf8'
    );
    expect(pageSource).toContain('./comments/margin-comments-rail');
    expect(pageSource).not.toContain('./editor-v1/');
  });
});