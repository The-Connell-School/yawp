import { PostHog } from 'posthog-node';

// Initialize PostHog for server-side error tracking
const shouldLogToPosthog =
  process.env.NODE_ENV === 'production' &&
  process.env.POSTHOG_API_KEY &&
  process.env.POSTHOG_HOST;

let posthog: PostHog | null = null;
if (shouldLogToPosthog) {
  posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
    host: process.env.POSTHOG_HOST,
  });
}

export { posthog };