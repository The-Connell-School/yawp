import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const script = readFileSync(
  join(import.meta.dir, 'ensure-intern-qa-teachers-on-demo-host.sh'),
  'utf8'
);

test('demo host ensure script refuses without yawp_demo guard in tooling command', () => {
  expect(script).toContain('ENSURE_INTERN_QA_REQUIRE_DEMO=1');
  expect(script).toContain('PREVIEW_SLUG=demo');
  expect(script).toContain('DATABASE_NAME=yawp_demo');
  expect(script).toContain('ensure-intern-qa-teachers');
  expect(script).not.toContain('reset_data');
  expect(script).not.toContain('truncate');
});
