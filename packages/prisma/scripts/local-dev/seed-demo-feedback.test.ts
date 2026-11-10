import { expect, mock, test } from 'bun:test';
import { ensureDemoFeedbackEnabled } from './seed-demo-feedback';

test('does not upsert a removed demo-feedback-widget flag', async () => {
  const upsert = mock(async () => ({}));
  for (const environment of [
    'production',
    'pr-123',
    'development',
    undefined,
  ] as const) {
    expect(
      await ensureDemoFeedbackEnabled({ setting: { upsert } } as never, {
        YAWP_ENVIRONMENT: environment,
      })
    ).toEqual({ skipped: true });
    expect(upsert).not.toHaveBeenCalled();
  }
  expect(
    await ensureDemoFeedbackEnabled({ setting: { upsert } } as never, {
      PREVIEW_SLUG: 'demo',
    })
  ).toEqual({ enabled: true });
  expect(upsert).not.toHaveBeenCalled();
});
