import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const capture = mock();
const alias = mock();

mock.module('~/services/posthog.server', () => ({
  posthog: { alias, capture },
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
  freeTierApplicationDistinctId,
  freeTierAnalyticsEnvironment,
  freeTierOrganizationDistinctId,
  freeTierScanDistinctId,
  FREE_TIER_ANALYTICS_EVENTS,
  runFreeTierAnalytics,
} = await import('./posthog-analytics.server');

describe('free-tier PostHog analytics', () => {
  beforeEach(() => {
    alias.mockReset();
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

  test('aliases scan and application actors onto the organization funnel actor', () => {
    const scanId = freeTierScanDistinctId({
      acquisitionTokenId: 'tok-1',
      dedupeCookieHash: 'cookie-hash',
    });
    const applicationId = freeTierApplicationDistinctId('app-1');
    const organizationId = freeTierOrganizationDistinctId('org-1');

    captureFreeTierAnalyticsEvent({
      event: FREE_TIER_ANALYTICS_EVENTS.signup,
      distinctId: applicationId,
      aliases: [scanId],
      properties: { application_id: 'app-1' },
    });
    captureFreeTierAnalyticsEvent({
      event: FREE_TIER_ANALYTICS_EVENTS.activation,
      distinctId: organizationId,
      aliases: [applicationId],
      properties: { application_id: 'app-1', organization_id: 'org-1' },
    });

    expect(alias).toHaveBeenNthCalledWith(1, {
      distinctId: scanId,
      alias: applicationId,
    });
    expect(alias).toHaveBeenNthCalledWith(2, {
      distinctId: applicationId,
      alias: organizationId,
    });
    expect(capture.mock.calls.map((call) => call[0].distinctId)).toEqual([
      applicationId,
      organizationId,
    ]);
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

  test('recognizes the deployed demo runtime ahead of preview', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'demo';
    expect(freeTierAnalyticsEnvironment()).toBe('demo');
  });

  test('isolates alias failures from capture', () => {
    alias.mockImplementation(() => {
      throw new Error('alias unavailable');
    });
    expect(() =>
      captureFreeTierAnalyticsEvent({
        event: FREE_TIER_ANALYTICS_EVENTS.activation,
        distinctId: 'org',
        aliases: ['app'],
      })
    ).not.toThrow();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  test('capture failures never escape', () => {
    capture.mockImplementation(() => {
      throw new Error('capture unavailable');
    });
    expect(() =>
      captureFreeTierAnalyticsEvent({
        event: FREE_TIER_ANALYTICS_EVENTS.signup,
        distinctId: 'app',
      })
    ).not.toThrow();
  });

  test('production is authoritative over a stale demo slug', () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.PREVIEW_SLUG = 'demo';
    expect(freeTierAnalyticsEnvironment()).toBe('production');
  });
  test('async client rejections are contained too', async () => {
    alias.mockRejectedValue(new Error('offline'));
    capture.mockRejectedValue(new Error('offline'));
    captureFreeTierAnalyticsEvent({
      event: 'free_tier.activation',
      distinctId: 'org',
      aliases: ['app'],
    });
    await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  test('async PostHog failures log redacted error metadata', async () => {
    const errorSpy = mock(() => {});
    const originalError = console.error;
    console.error = errorSpy as typeof console.error;

    alias.mockRejectedValue(
      new Error('token=super-secret-alias teacher@school.edu')
    );
    capture.mockRejectedValue(new Error('token=super-secret-capture'));

    try {
      captureFreeTierAnalyticsEvent({
        event: FREE_TIER_ANALYTICS_EVENTS.activation,
        distinctId: 'org',
        aliases: ['app'],
      });
      await Promise.resolve();

      expect(errorSpy).toHaveBeenCalledWith(
        'free_tier_posthog_alias_failed',
        expect.objectContaining({
          event: FREE_TIER_ANALYTICS_EVENTS.activation,
          error: expect.objectContaining({
            message: expect.stringContaining('[redacted-token]'),
          }),
        })
      );
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
        'super-secret-alias'
      );
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
        'teacher@school.edu'
      );
    } finally {
      console.error = originalError;
    }
  });

  test('runFreeTierAnalytics logs safe enrichment failures', async () => {
    const errorSpy = mock(() => {});
    const originalError = console.error;
    console.error = errorSpy as typeof console.error;

    try {
      await runFreeTierAnalytics(async () => {
        throw new Error('token=super-secret-enrichment teacher@school.edu');
      });

      expect(errorSpy).toHaveBeenCalledWith(
        'free_tier_analytics_enrichment_failed',
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('[redacted-token]'),
          }),
        })
      );
      expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain(
        'super-secret-enrichment'
      );
    } finally {
      console.error = originalError;
    }
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
