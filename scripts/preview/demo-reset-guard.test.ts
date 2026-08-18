import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/demo-reset-guard.sh');

function run(overrides: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      SLUG: 'demo',
      PREVIEW_SLUG: undefined,
      DATABASE_NAME: 'yawp_demo',
      DEMO_RESET_DATA: 'false',
      DEMO_RESET_CONFIRMATION: '',
      ...overrides,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('demo reset guard', () => {
  test('a normal deploy is allowed without confirmation', () => {
    expect(run({}).exitCode).toBe(0);
  });

  test('reset is denied unless the exact database name is typed', () => {
    for (const confirmation of ['', 'RESET', 'RESET demo', 'reset yawp_demo']) {
      expect(
        run({
          DEMO_RESET_DATA: 'true',
          DEMO_RESET_CONFIRMATION: confirmation,
        }).exitCode
      ).not.toBe(0);
    }
    expect(
      run({
        DEMO_RESET_DATA: 'true',
        DEMO_RESET_CONFIRMATION: 'RESET yawp_demo',
      }).exitCode
    ).toBe(0);
  });

  test('reset cannot target another slug or database', () => {
    const confirmation = 'RESET yawp_demo';
    expect(
      run({
        SLUG: 'pr-274',
        DEMO_RESET_DATA: 'true',
        DEMO_RESET_CONFIRMATION: confirmation,
      }).exitCode
    ).not.toBe(0);
    expect(
      run({
        DATABASE_NAME: 'postgres',
        DEMO_RESET_DATA: 'true',
        DEMO_RESET_CONFIRMATION: confirmation,
      }).exitCode
    ).not.toBe(0);
  });

  test('rejects ambiguous reset flag values', () => {
    expect(run({ DEMO_RESET_DATA: '1' }).exitCode).not.toBe(0);
    expect(run({ DEMO_RESET_DATA: 'TRUE' }).exitCode).not.toBe(0);
  });
});
