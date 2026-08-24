import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/preview-reset-guard.sh');

function run(overrides: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      SLUG: 'pr-319',
      PREVIEW_SLUG: undefined,
      DATA_MODE: 'seed',
      PREVIEW_RESET_DATA: 'false',
      ...overrides,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('preview reset guard', () => {
  test('a normal deploy is allowed', () => {
    expect(run({}).exitCode).toBe(0);
  });

  test('a PR preview may reset its own seeded data', () => {
    expect(run({ PREVIEW_RESET_DATA: 'true' }).exitCode).toBe(0);
  });

  // The demo environment has its own reset path, which takes a verified
  // off-host backup and demands the database name be typed out. A PR label
  // must never be able to reach it.
  test('it refuses to reset the demo environment', () => {
    const result = run({ PREVIEW_RESET_DATA: 'true', SLUG: 'demo' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('DEMO_RESET_DATA');
  });

  // Dump-based previews restore from a snapshot rather than the seed scripts,
  // so dropping the database would not produce fresher fixture data.
  test('it refuses outside seed mode', () => {
    for (const mode of ['production-dump', 'sanitized-production']) {
      expect(
        run({ PREVIEW_RESET_DATA: 'true', DATA_MODE: mode }).exitCode
      ).not.toBe(0);
    }
  });

  test('it rejects a value that is neither true nor false', () => {
    for (const value of ['yes', '1', 'TRUE', 'on']) {
      expect(run({ PREVIEW_RESET_DATA: value }).exitCode).not.toBe(0);
    }
  });

  // The workflow passes the label check through verbatim, so an unset or empty
  // value has to mean "do not reset" rather than fail the deploy.
  test('unset and empty are treated as off', () => {
    expect(run({ PREVIEW_RESET_DATA: '' }).exitCode).toBe(0);
    expect(run({ PREVIEW_RESET_DATA: undefined }).exitCode).toBe(0);
  });
});
