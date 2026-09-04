import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ClassManageSheet', () => {
  test('posts to the my-classes index action by default', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'class-manage-sheet.tsx'),
      'utf8'
    );

    expect(source).toContain("actionUrl = '/app/my-classes?index'");
  });

  test('period select is optional with a no-period option', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'class-manage-sheet.tsx'),
      'utf8'
    );

    expect(source).toContain('Period (optional)');
    expect(source).toContain('No period');
    expect(source).not.toContain('onValueChange={setPeriod} required');
  });

  test('grade select is optional with a no-grade option', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'class-manage-sheet.tsx'),
      'utf8'
    );

    expect(source).toContain('Grade (optional)');
    expect(source).toContain('No grade');
    expect(source).not.toContain('onValueChange={setGrade} required');
  });
});
