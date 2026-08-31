import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test'] as const),
  DATABASE_PATH: z.string(),
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string(),
  INTERNAL_COMMAND_TOKEN: z.string(),
  HONEYPOT_SECRET: z.string(),
  CACHE_DATABASE_PATH: z.string(),
  AWS_S3_BUCKET_FOR_VIDEOS: z.string(),
  AWS_S3_REGION_FOR_VIDEOS: z.string(),
  AI_MODEL: z.string().optional(),
  /**
   * Realtime collaboration provider credentials. Optional on purpose: the
   * feature is gated per organization and unset everywhere today, so requiring
   * them would stop every existing environment from booting. The token route
   * returns a 500 rather than a token when they are absent.
   *
   * TIPTAP_COLLAB_SECRET signs document-scoped JWTs and must never reach the
   * client — do not add it to `getEnv()`.
   */
  TIPTAP_COLLAB_APP_ID: z.string().optional(),
  TIPTAP_COLLAB_SECRET: z.string().optional(),
  PREVIEW_DATA_MODE: z
    .enum(['seed', 'production-dump', 'sanitized-production'])
    .optional(),
});

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof schema> {}
  }
}

export function init() {
  const parsed = schema.safeParse(process.env);

  if (parsed.success === false) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ Invalid environment variables:',
      parsed.error.flatten().fieldErrors
    );

    throw new Error('Invalid environment variables');
  }
}

/**
 * This is used in both `entry.server.ts` and `root.tsx` to ensure that
 * the environment variables are set and globally available before the app is
 * started.
 *
 * NOTE: Do *not* add any environment variables in here that you do not wish to
 * be included in the client.
 * @returns all public ENV variables
 */
export function getEnv() {
  return {
    MODE: process.env.NODE_ENV,
    SENTRY_DSN: process.env.SENTRY_DSN,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  };
}

type ENV = ReturnType<typeof getEnv>;

declare global {
  var ENV: ENV;
  interface Window {
    ENV: ENV;
  }
}
