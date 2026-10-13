import { posthog } from '~/services/posthog.server';

type FreeTierEnvironment =
  | 'demo'
  | 'production'
  | 'preview'
  | 'development'
  | 'test'
  | 'unknown';

export const FREE_TIER_ANALYTICS_EVENTS = {
  scan: 'free_tier.scan',
  signup: 'free_tier.signup',
  activation: 'free_tier.activation',
  studentJoin: 'free_tier.student_join',
  firstEssay: 'free_tier.first_essay',
} as const;

export type FreeTierAnalyticsEventName =
  (typeof FREE_TIER_ANALYTICS_EVENTS)[keyof typeof FREE_TIER_ANALYTICS_EVENTS];

type FreeTierAnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export function freeTierAnalyticsEnvironment(): FreeTierEnvironment {
  const explicit = process.env.YAWP_ENVIRONMENT?.trim().toLowerCase();
  if (
    explicit === 'demo' ||
    explicit === 'production' ||
    explicit === 'preview'
  ) {
    return explicit;
  }

  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (appEnv === 'demo' || appEnv === 'production' || appEnv === 'preview') {
    return appEnv;
  }

  const deploy = process.env.DEPLOY?.trim().toLowerCase();
  if (deploy === 'demo' || deploy === 'production' || deploy === 'preview') {
    return deploy;
  }

  if (
    process.env.PREVIEW_SLUG?.trim() ||
    process.env.DATABASE_URL?.includes('/yawp_pr_')
  ) {
    return 'preview';
  }

  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.NODE_ENV === 'development') return 'development';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'unknown';
}

export function acquisitionChannel(input: {
  acquisitionTokenId?: string | null;
  sourceName?: string | null;
}) {
  if (input.acquisitionTokenId) return 'event_link';
  if (input.sourceName?.trim()) return 'event_link';
  return 'organic';
}

export function captureFreeTierAnalyticsEvent(args: {
  event: FreeTierAnalyticsEventName;
  distinctId: string;
  properties?: FreeTierAnalyticsProperties;
}) {
  if (!posthog) return;

  try {
    posthog.capture({
      distinctId: args.distinctId,
      event: args.event,
      properties: {
        product_area: 'free_tier',
        environment: freeTierAnalyticsEnvironment(),
        preview_slug: process.env.PREVIEW_SLUG?.trim() || null,
        ...args.properties,
      },
    });
  } catch (error) {
    console.error('free_tier_posthog_capture_failed', {
      event: args.event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
