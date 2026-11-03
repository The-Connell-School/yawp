import type { PostHog } from 'posthog-node';
import { buildSafeErrorForLog } from '~/utils/server-error-request-context.server';

/** PostHog exception events must not ship raw Error.message, stacks, or causes. */
export function errorForPosthogCapture(error: unknown): Error {
  const safe = buildSafeErrorForLog(error);
  const message =
    'message' in safe && typeof safe.message === 'string' && safe.message
      ? safe.message
      : 'code' in safe && typeof safe.code === 'string'
        ? `${safe.name}:${safe.code}`
        : safe.name;
  const synthetic = new Error(message);
  synthetic.name = safe.name;
  if ('stack' in safe && typeof safe.stack === 'string') {
    synthetic.stack = `${synthetic.name}: ${message}\n${safe.stack}`;
  }
  return synthetic;
}

export function capturePosthogServerException(
  client: PostHog,
  error: unknown,
  distinctId: string,
  additionalProperties?: Record<string | number, unknown>,
) {
  client.captureException(
    errorForPosthogCapture(error),
    distinctId,
    additionalProperties,
  );
}
