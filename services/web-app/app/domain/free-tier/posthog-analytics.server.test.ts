import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const capture = mock();

mock.module('~/services/posthog.server', () => ({
  posthog: { capture },
}));

const originalEnv = {
  APP_ENV: process.env.APP_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DEPLOY: process.env.DEPLOY,
  NODE_ENV: process.env.NODE_ENV,
  PREVIEW_SLUG: process.env.PREVIEW_SLUG,
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
};

const {
  acquisitionChannel,
  captureFreeTierAnalyticsEvent,
  freeTierAnalyticsEnvironment,
  FREE_TIER_ANALYTICS_EVENTS,
} = await import('./posthog-analytics.server');

describe('free-tier PostHog analytics', () => {
  beforeEach(() => {
    capture.mockReset();
    delete process.env.APP_ENV;
    delete process.env.DEPLOY;
    delete process.env.PREVIEW_SLUG;
    delete process.env.YAWP_ENVIRONMENT;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://db/yawp';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('keeps stable event names for the first 100 teacher funnel', () => {
    expect(FREE_TIER_ANALYTICS_EVENTS).toEqual({
      scan: 'free_tier.scan',
      signup: 'free_tier.signup',
      activation: 'free_tier.activation',
      studentJoin: 'free_tier.student_join',
      firstEssay: 'free_tier.first_essay',
    });
  });

  test('adds environment and segmentation properties without a network dependency', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'pr-123';

    captureFreeTierAnalyticsEvent({
      event: FREE_TIER_ANALYTICS_EVENTS.signup,
      distinctId: 'free-tier-application:app-1',
      properties: {
        application_id: 'app-1',
        acquisition_channel: 'event_link',
      },
    });

    expect(capture).toHaveBeenCalledWith({
      distinctId: 'free-tier-application:app-1',
      event: 'free_tier.signup',
      properties: {
        product_area: 'free_tier',
        environment: 'preview',
        preview_slug: 'pr-123',
        application_id: 'app-1',
        acquisition_channel: 'event_link',
      },
    });
  });

  test('detects demo, production, and preview environments for dashboard filters', () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    expect(freeTierAnalyticsEnvironment()).toBe('demo');

    process.env.YAWP_ENVIRONMENT = 'production';
    expect(freeTierAnalyticsEnvironment()).toBe('production');

    delete process.env.YAWP_ENVIRONMENT;
    process.env.DATABASE_URL = 'postgresql://db/yawp_pr_482';
    expect(freeTierAnalyticsEnvironment()).toBe('preview');
  });

  test('distinguishes event-link acquisition from organic free-tier traffic', () => {
    expect(acquisitionChannel({ acquisitionTokenId: 'tok-1' })).toBe(
      'event_link'
    );
    expect(acquisitionChannel({ sourceName: 'NCTE booth' })).toBe('event_link');
    expect(
      acquisitionChannel({ acquisitionTokenId: null, sourceName: null })
    ).toBe('organic');
  });
});
