import posthog from 'posthog-js';
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

function analyticsEnvironment(): string {
  if (typeof window === 'undefined') return 'unknown';
  const mode = window.ENV?.MODE;
  if (mode === 'development' || mode === 'test' || mode === 'production') {
    return mode;
  }
  return 'unknown';
}

function capture(event: string, properties: Record<string, unknown>) {
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break UI flows.
  }
}

export function captureAppErrorPresentedClient(args: {
  severity: AppErrorSeverity;
  surface: AppErrorSurface;
  error_code: string;
  http_status: number | null;
  message_template: string;
  route_template: string;
  is_expected: boolean;
  toast_title?: string | null;
  product_area?: AppErrorPresentedPayload['product_area'];
}): AppErrorPresentedPayload | null {
  const payload = buildAppErrorPresentedPayload({
    severity: args.severity,
    surface: args.surface,
    error_code: args.error_code,
    http_status: args.http_status,
    message_template: args.message_template,
    route_template: args.route_template,
    is_expected: args.is_expected,
    product_area: args.product_area,
    environment: analyticsEnvironment(),
    release_sha: null,
  });

  if (
    shouldSuppressAppErrorPresented({
      route_template: payload.route_template,
      surface: payload.surface,
      error_code: payload.error_code,
      message_template: payload.message_template,
      toast_title: args.toast_title,
    })
  ) {
    return null;
  }

  capture(APP_ERROR_PRESENTED_EVENT, payload);
  return payload;
}

export function captureAppRateLimitHitClient(args: {
  feature: string;
  scope: 'user' | 'global';
  limit_window: string;
  route_template: string;
}) {
  capture(APP_RATE_LIMIT_HIT_EVENT, {
    feature: args.feature,
    scope: args.scope,
    limit_window: args.limit_window,
    route_template: templateRoutePath(args.route_template),
    environment: analyticsEnvironment(),
    is_expected: true,
  });
}
