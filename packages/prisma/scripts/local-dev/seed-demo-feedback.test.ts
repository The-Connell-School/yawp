import { expect, mock, test } from 'bun:test';
import { ensureDemoFeedbackEnabled } from './seed-demo-feedback';
test('creates the flag only in demo and preserves explicit operator settings', async () => {
  const upsert = mock(async () => ({}));
  for (const environment of ['production', 'pr-123', 'development', undefined]) {
    await ensureDemoFeedbackEnabled({ setting: { upsert } } as never, { YAWP_ENVIRONMENT: environment });
    expect(upsert).not.toHaveBeenCalled();
  }
  await ensureDemoFeedbackEnabled({ setting: { upsert } } as never, { PREVIEW_SLUG: 'demo' });
  expect(upsert).toHaveBeenCalledWith({ where: { name: 'feature_flag.demo-feedback-widget' }, create: { name: 'feature_flag.demo-feedback-widget', value: '{"mode":"everyone","orgIds":[]}', valueType: 'json', description: 'Started on for demo feedback' }, update: {} });
});
