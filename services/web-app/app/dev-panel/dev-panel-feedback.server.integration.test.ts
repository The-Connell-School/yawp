import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const webAppRoot = path.join(import.meta.dir, '..');

describe('dev panel feedback integration', () => {
  test('integration tests pass in an isolated subprocess', () => {
    execFileSync(
      process.execPath,
      [
        'test',
        path.join(import.meta.dir, 'dev-panel-feedback.server.integration.isolated.test.ts'),
      ],
      {
        cwd: webAppRoot,
        stdio: 'pipe',
        env: { ...process.env, DEV_PANEL_FEEDBACK_INTEGRATION_ISOLATED: '1' },
      }
    );
    expect(true).toBe(true);
  });
});
