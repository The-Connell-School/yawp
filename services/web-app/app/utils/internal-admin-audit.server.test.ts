import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'bun:test';

test('signed admin Audit authentication, shaping and pagination in isolation', () => {
  const result = spawnSync(process.execPath, ['test', fileURLToPath(new URL('./internal-admin-audit.server.check.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, encoding: 'utf8',
  });
  if (result.status !== 0) console.error(result.stdout, result.stderr);
  expect(result.status).toBe(0);
});
