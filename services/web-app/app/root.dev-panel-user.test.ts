import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const webAppRoot = path.join(import.meta.dir, '..');

describe('root loader signed-out user', () => {
  test('returns user null on /free via the real loader in an isolated subprocess', () => {
    execFileSync(
      process.execPath,
      ['test', path.join(import.meta.dir, 'root.dev-panel-user.isolated.test.ts')],
      {
        cwd: webAppRoot,
        stdio: 'pipe',
        env: { ...process.env, ROOT_LOADER_USER_ISOLATED: '1' },
      }
    );
    expect(true).toBe(true);
  });
});
