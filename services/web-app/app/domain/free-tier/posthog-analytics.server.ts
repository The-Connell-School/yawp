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

export function freeTierScanDistinctId(input: {
  acquisitionTokenId: string;
  dedupeCookieHash: string;
}) {
  return `free-tier-token:${input.acquisitionTokenId}:${input.dedupeCookieHash}`;
}

export function freeTierApplicationDistinctId(applicationId: string) {
  return `free-tier-application:${applicationId}`;
}

export function freeTierOrganizationDistinctId(organizationId: string) {
  return `free-tier-organization:${organizationId}`;
}

export function freeTierAnalyticsEnvironment(): FreeTierEnvironment {
  // Demo uses the preview runtime under its reserved slug.
  if (
    process.env.PREVIEW_SLUG?.trim().toLowerCase() === 'demo' &&
    process.env.YAWP_ENVIRONMENT?.trim().toLowerCase() !== 'production'
  )
    return 'demo';
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
  aliases?: string[];
  properties?: FreeTierAnalyticsProperties;
}) {
  if (!posthog) return;

  for (const alias of args.aliases ?? []) {
    if (!alias || alias === args.distinctId) continue;
    try {
      // Link previous -> new before capturing the new actor.
      void Promise.resolve(
        posthog.alias({ distinctId: alias, alias: args.distinctId })
      ).catch(() => {
        console.error('free_tier_posthog_alias_failed', { event: args.event });
      });
    } catch {
      console.error('free_tier_posthog_alias_failed', { event: args.event });
    }
  }
  try {
    void Promise.resolve(
      posthog.capture({
        distinctId: args.distinctId,
        event: args.event,
        properties: {
          ...args.properties,
          product_area: 'free_tier',
          environment: freeTierAnalyticsEnvironment(),
          preview_slug: process.env.PREVIEW_SLUG?.trim() || null,
        },
      })
    ).catch(() =>
      console.error('free_tier_posthog_capture_failed', { event: args.event })
    );
  } catch {
    console.error('free_tier_posthog_capture_failed', { event: args.event });
  }
}

/** Enrichment failures must not undo a successful lifecycle transition. */
export async function runFreeTierAnalytics(work: () => Promise<void>) {
  try {
    await work();
  } catch {
    console.error('free_tier_analytics_enrichment_failed');
  }
}
