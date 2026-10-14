import { spawnSync } from 'node:child_process';
import { expect, test } from 'bun:test';

test('signed admin Audit authentication, shaping and pagination in isolation', () => {
  const result = spawnSync(process.execPath, ['test', './app/utils/internal-admin-audit.server.check.ts'], {
    cwd: process.cwd(), env: process.env, encoding: 'utf8',
  });
  if (result.status !== 0) console.error(result.stdout, result.stderr);
  expect(result.status).toBe(0);
});
