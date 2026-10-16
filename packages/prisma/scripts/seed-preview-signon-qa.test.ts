import { describe, expect, test } from 'bun:test';
import {
  assertPreviewSignonTarget,
  seedPreviewSignonQa,
} from './seed-preview-signon-qa';

const valid = {
  YAWP_ENVIRONMENT: 'preview',
  PREVIEW_SLUG: 'pr-565',
  PREVIEW_DATA_MODE: 'seed',
  DATABASE_URL:
    'postgresql://yawp_pr_565_app:fixture@preview-postgres:5432/yawp_pr_565',
};
describe('preview sign-on fixture target', () => {
  test('accepts only the matching isolated PR target and seed mode', () => {
    expect(() => assertPreviewSignonTarget(valid)).not.toThrow();
    expect(() =>
      assertPreviewSignonTarget({
        ...valid,
        DATABASE_URL: valid.DATABASE_URL.replace(
          'preview-postgres',
          '127.0.0.1'
        ),
      })
    ).not.toThrow();
  });
  for (const change of [
    { YAWP_ENVIRONMENT: 'production' },
    { YAWP_ENVIRONMENT: 'demo' },
    { YAWP_ENVIRONMENT: '' },
    { PREVIEW_SLUG: 'demo' },
    { PREVIEW_SLUG: 'pr-566' },
    { PREVIEW_DATA_MODE: 'sanitized-production' },
    { PREVIEW_DATA_MODE: '' },
    { DATABASE_SCHEMA: 'public' },
    ...[
      'postgresql://postgres:fixture@preview-postgres/yawp_pr_565',
      'postgresql://yawp_pr_565_app:fixture@preview-postgres/yawp_demo',
      'postgresql://yawp_pr_565_app:fixture@production.example/yawp_pr_565',
      'postgresql://yawp_pr_565_app:fixture@preview-postgres/yawp_pr_565_extra',
      'postgresql://yawp_pr_565_app:fixture@preview-postgres/yawp_pr_565?host=production',
      'postgresql://yawp_pr_565_app:fixture@preview-postgres/yawp_pr_565?%63onnectionString=other',
      'postgresql://yawp_pr_565_app:fixture@preview-postgres/yawp_pr_565#fragment',
      'https://yawp_pr_565_app:fixture@preview-postgres/yawp_pr_565',
      'invalid',
      '',
    ].map((DATABASE_URL) => ({ DATABASE_URL })),
  ])
    test(`rejects before any client access: ${Object.keys(change).join()}`, async () => {
      const client = new Proxy(
        {},
        {
          get() {
            throw new Error('database touched');
          },
        }
      );
      await expect(
        seedPreviewSignonQa(client as any, { ...valid, ...change })
      ).rejects.toThrow('isolated PR preview');
    });
});

test('actual connection mismatch refuses before any model access', async () => {
  for (const actual of [
    { database: 'yawp_demo', role: 'yawp_pr_565_app' },
    { database: 'yawp_pr_565', role: 'postgres' },
  ]) {
    const tx = new Proxy(
      { $queryRaw: async () => [actual] },
      {
        get(target, key) {
          if (key === '$queryRaw') return target.$queryRaw;
          throw new Error('write attempted');
        },
      }
    );
    await expect(
      seedPreviewSignonQa(
        { $transaction: async (fn: any) => fn(tx) } as any,
        valid
      )
    ).rejects.toThrow('matching the connected');
  }
});
