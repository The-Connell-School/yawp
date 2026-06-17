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
});
