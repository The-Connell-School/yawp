import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const webAppRoot = path.join(import.meta.dir, '..');

describe('dev panel feedback route handler', () => {
  test('contract tests pass in an isolated subprocess', () => {
    execFileSync(
      process.execPath,
      ['test', path.join(import.meta.dir, 'feedback-route-contract.isolated.test.ts')],
      {
        cwd: webAppRoot,
        stdio: 'pipe',
        env: { ...process.env, FEEDBACK_CONTRACT_ISOLATED: '1' },
      }
    );
    expect(true).toBe(true);
  });
});
