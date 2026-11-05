import { freeTierAnalyticsEnvironment } from '~/domain/free-tier/posthog-analytics.server';
import { posthog } from '~/services/posthog.server';
import { buildSafeErrorForLog } from '~/utils/server-error-request-context.server';
import {
  APP_ERROR_PRESENTED_EVENT,
  APP_RATE_LIMIT_HIT_EVENT,
  buildAppErrorPresentedPayload,
  shouldSuppressAppErrorPresented,
  templateRoutePath,
  type AppErrorPresentedPayload,
  type AppErrorSeverity,
  type AppErrorSurface,
} from './app-error-presented.shared';

function releaseSha(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    null
  );
}

function captureEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>
) {
  if (!posthog) return;
  try {
    void Promise.resolve(
      posthog.capture({ distinctId, event, properties })
    ).catch((error) => {
      console.error('app_error_posthog_capture_failed', {
        event,
        error: buildSafeErrorForLog(error),
      });
    });
  } catch (error) {
    console.error('app_error_posthog_capture_failed', {
      event,
      error: buildSafeErrorForLog(error),
    });
  }
}

export function captureAppErrorPresentedServer(args: {
  distinctId: string;
  severity: AppErrorSeverity;
  surface: AppErrorSurface;
  error_code: string;
  http_status: number | null;
  message_template: string;
  route_template: string;
  is_expected: boolean;
  correlation_id?: string | null;
}): AppErrorPresentedPayload | null {
  const payload = buildAppErrorPresentedPayload({
    ...args,
    environment: freeTierAnalyticsEnvironment(),
    release_sha: releaseSha(),
  });

  if (
    shouldSuppressAppErrorPresented({
      route_template: payload.route_template,
      surface: payload.surface,
      error_code: payload.error_code,
      message_template: payload.message_template,
    })
  ) {
    return null;
  }

  captureEvent(args.distinctId, APP_ERROR_PRESENTED_EVENT, payload);
  return payload;
}

export function captureAppRateLimitHitServer(args: {
  distinctId: string;
  feature: string;
  scope: 'user' | 'global';
  limit_window: string;
  route_template: string;
}) {
  captureEvent(args.distinctId, APP_RATE_LIMIT_HIT_EVENT, {
    feature: args.feature,
    scope: args.scope,
    limit_window: args.limit_window,
    route_template: templateRoutePath(args.route_template),
    environment: freeTierAnalyticsEnvironment(),
    release_sha: releaseSha(),
    is_expected: true,
  });
}
