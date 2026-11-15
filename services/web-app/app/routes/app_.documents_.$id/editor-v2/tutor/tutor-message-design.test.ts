import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(
  join(import.meta.dir, '../document-editor/document-editor-redesign.css'),
  'utf8'
);

/** Claude Design export: document-editor-states.html tutor message chrome. */
describe('v2 tutor message design (states board)', () => {
  test('panel is solid cream with e3ded2 dividers (no glass blur)', () => {
    expect(css).toContain('--tutor-panel-bg: #fcfaf5');
    expect(css).toContain('--tutor-rim: #e3ded2');
    expect(css).toContain('.doc-editor-tutor-header');
    expect(css).toContain('border-bottom: 1px solid var(--tutor-rim)');
    expect(css).toContain('border-top: 1px solid var(--tutor-rim)');
    const tutorBlock = css.match(/\.doc-editor-tutor\s*\{[^}]+\}/)?.[0] ?? '';
    expect(tutorBlock).toContain('background: var(--tutor-panel-bg)');
    expect(tutorBlock).toContain('border-right: 1px solid var(--tutor-rim)');
    expect(tutorBlock).toContain('backdrop-filter: none');
  });

  test('tutor assistant bubble matches export', () => {
    expect(css).toContain('--tutor-bubble-bg: #ffffff');
    expect(css).toContain('--tutor-bubble-text: #1b1b1b');
    expect(css).toContain('--tutor-name: #1f4d3a');
    expect(css).toContain('--tutor-meta: #5f5b52');
    expect(css).toContain('border-radius: 4px 14px 14px 14px');
    expect(css).toContain('0 1px 2px rgba(31, 53, 50, 0.06)');
    expect(css).toContain('inset 0 0 0 1px var(--tutor-rim)');
    expect(css).toContain('.doc-editor-tutor-message-meta b');
    expect(css).toContain('color: var(--tutor-name)');
  });

  test('student bubble matches export', () => {
    expect(css).toContain('--student-bubble-bg: #e8f0eb');
    expect(css).toContain('--student-bubble-rim: #c9dbd0');
    expect(css).toContain('--student-bubble-text: #1b1b1b');
    expect(css).toContain('border-radius: 14px 14px 4px 14px');
    expect(css).toContain('inset 0 0 0 1px var(--student-bubble-rim)');
  });
});