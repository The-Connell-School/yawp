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

describe('document editor v2 design contract', () => {
  test('redesign CSS exposes tokens from the Student editor export', () => {
    const css = readFileSync(
      join(V2_ROOT, 'document-editor/document-editor-redesign.css'),
      'utf8'
    );
    expect(css).toContain('--tutor-panel-bg: #fcfaf5');
    expect(css).toContain('--tutor-rim: #e3ded2');
    expect(css).toContain('--doc-glass-bg:');
    expect(css).toContain('--doc-workspace-bg:');
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