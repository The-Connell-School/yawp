import { expect, mock, test } from 'bun:test';
mock.module('~/services/posthog.server', () => ({ posthog: null }));
const { captureFreeTierAnalyticsEvent, runFreeTierAnalytics } =
  await import('./posthog-analytics.server');
test('absent client and failed enrichment never block a conversion', async () => {
  expect(() =>
    captureFreeTierAnalyticsEvent({
      event: 'free_tier.signup',
      distinctId: 'local-app',
      aliases: ['local-scan'],
    })
  ).not.toThrow();
  await expect(
    runFreeTierAnalytics(async () => {
      throw new Error('optional lookup');
    })
  ).resolves.toBeUndefined();
});
