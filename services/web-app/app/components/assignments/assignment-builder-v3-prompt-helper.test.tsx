import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('assignment builder v3 places prompt helper beneath the Prompt label', async () => {
  const source = await Bun.file(
    join(import.meta.dir, 'assignment-builder-v3.tsx')
  ).text();
  expect(source).toContain('htmlFor="abv3-prompt"');
  expect(source).toContain('what students will see');
  expect(source).toContain('abv3-field-label-muted');
});