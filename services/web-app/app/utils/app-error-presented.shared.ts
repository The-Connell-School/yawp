export type AppErrorSeverity = 'user_blocking' | 'degraded' | 'info';
export type AppErrorSurface =
  | 'toast'
  | 'banner'
  | 'error_boundary'
  | 'inline'
  | 'network';

export type AppErrorProductArea =
  | 'tutor'
  | 'auth'
  | 'free_tier'
  | 'documents'
  | 'unknown';

export const APP_ERROR_PRESENTED_EVENT = 'app_error_presented' as const;
export const APP_RATE_LIMIT_HIT_EVENT = 'app_rate_limit_hit' as const;

export const TUTOR_RATE_LIMIT_MESSAGE =
  'Give me a moment — try again soon.';

export type AppErrorPresentedPayload = {
  severity: AppErrorSeverity;
  surface: AppErrorSurface;
  error_code: string;
  http_status: number | null;
  message_template: string;
  route_template: string;
  product_area: AppErrorProductArea;
  environment: string;
  release_sha?: string | null;
  correlation_id?: string | null;
  is_expected: boolean;
  fingerprint: string;
};

const CUID2_PATTERN = /\/c[a-z0-9]{24,32}(?=\/|$)/gi;
const UUID_PATTERN =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

/** Strip dynamic path segments so errors can be grouped safely. */
export function templateRoutePath(pathname: string): string {
  let path = pathname.split('?')[0]?.split('#')[0] ?? '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(UUID_PATTERN, '/:id');
  path = path.replace(CUID2_PATTERN, '/:id');
  path = path.replace(/\/\d+(?=\/|$)/g, '/:id');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const LONG_TOKEN_PATTERN = /\b[a-z0-9_-]{32,}\b/gi;

/** Fingerprintable, PII-safe copy for analytics grouping. */
export function sanitizeMessageTemplate(input: string): string {
  let text = input.trim().replace(/\s+/g, ' ');
  if (!text) return 'unknown';
  text = text.replace(EMAIL_PATTERN, '[email]');
  text = text.replace(LONG_TOKEN_PATTERN, '[token]');
  if (text.length > 160) text = `${text.slice(0, 157)}...`;
  return text;
}

export function buildAppErrorFingerprint(input: {
  error_code: string;
  route_template: string;
  message_template: string;
}): string {
  const normalized = [
    input.error_code.trim().toUpperCase(),
    input.route_template.trim(),
    sanitizeMessageTemplate(input.message_template).toLowerCase(),
  ].join('|');
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16)}`;
}

export function resolveProductArea(routeTemplate: string): AppErrorProductArea {
  if (routeTemplate.startsWith('/auth') || routeTemplate.startsWith('/enter-code')) {
    return 'auth';
  }
  if (routeTemplate.includes('/free-tier')) return 'free_tier';
  if (
    routeTemplate.startsWith('/app/documents') ||
    routeTemplate.startsWith('/app/group-drafts')
  ) {
    return 'documents';
  }
  if (
    routeTemplate.includes('/tutor') ||
    routeTemplate.startsWith('/app/documents')
  ) {
    return 'tutor';
  }
  return 'unknown';
}

const SUPPRESSED_AUTH_TOAST_TITLES = new Set(
  [
    'Invalid invitation',
    'Session expired',
    'Sign-in cancelled',
    'Google sign-in cancelled',
  ].map((value) => value.toLowerCase())
);

const SUPPRESSED_AUTH_MESSAGE_SNIPPETS = [
  'invalid email or password',
  'too many login attempts',
  'google sign-in is unavailable',
  'sign-in was cancelled',
  'sign in was cancelled',
  'must change your password',
  'required password change',
  'csrf',
  'origin mismatch',
  'honeypot',
  'unknown user',
  'wrong password',
];

const SUPPRESSED_ERROR_CODES = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_RATE_LIMITED',
  'AUTH_CSRF',
  'AUTH_ORIGIN_REJECT',
  'AUTH_HONEYPOT',
  'AUTH_GOOGLE_CANCEL',
  'AUTH_MUST_CHANGE_PASSWORD',
  'VALIDATION',
  'HTTP_400',
]);

function isAuthRoute(routeTemplate: string) {
  return (
    routeTemplate.startsWith('/auth') || routeTemplate.startsWith('/enter-code')
  );
}

function messageMatchesAuthNoise(messageTemplate: string) {
  const normalized = messageTemplate.toLowerCase();
  return SUPPRESSED_AUTH_MESSAGE_SNIPPETS.some((snippet) =>
    normalized.includes(snippet)
  );
}

export function shouldSuppressAppErrorPresented(input: {
  route_template: string;
  surface: AppErrorSurface;
  error_code: string;
  message_template: string;
  toast_title?: string | null;
}): boolean {
  const errorCode = input.error_code.trim().toUpperCase();
  if (SUPPRESSED_ERROR_CODES.has(errorCode)) return true;

  if (!isAuthRoute(input.route_template)) return false;

  const title = input.toast_title?.trim().toLowerCase();
  if (title && SUPPRESSED_AUTH_TOAST_TITLES.has(title)) return true;

  if (messageMatchesAuthNoise(input.message_template)) return true;

  if (
    input.surface === 'error_boundary' &&
    (input.route_template === '/auth/login' ||
      input.route_template.startsWith('/auth/inv'))
  ) {
    return true;
  }

  return false;
}

export function inferHttpErrorCode(status: number): string {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400) return 'HTTP_400';
  if (status === 401) return 'HTTP_401';
  if (status === 403) return 'HTTP_403';
  if (status === 404) return 'HTTP_404';
  if (status >= 500) return 'HTTP_500';
  return `HTTP_${status}`;
}

export function inferToastErrorPresentation(input: {
  title?: string | null;
  description?: string | null;
  route_template: string;
}): Pick<
  AppErrorPresentedPayload,
  'severity' | 'error_code' | 'http_status' | 'message_template' | 'is_expected'
> {
  const title = sanitizeMessageTemplate(input.title ?? '');
  const description = sanitizeMessageTemplate(input.description ?? '');
  const message_template =
    description !== 'unknown'
      ? description
      : title !== 'unknown'
        ? title
        : 'unknown';

  if (shouldSuppressAppErrorPresented({
    route_template: input.route_template,
    surface: 'toast',
    error_code: 'TOAST_ERROR',
    message_template,
    toast_title: input.title,
  })) {
    return {
      severity: 'info',
      error_code: 'TOAST_ERROR',
      http_status: null,
      message_template,
      is_expected: true,
    };
  }

  return {
    severity: 'degraded',
    error_code: 'TOAST_ERROR',
    http_status: null,
    message_template,
    is_expected: false,
  };
}

export type TutorApiErrorShape = {
  status: number;
  message?: string | null;
  error?:
    | {
        code?: string;
        message?: string;
        scope?: string;
        retryAfterSeconds?: number;
      }
    | string
    | null;
};

export function classifyTutorApiError(input: TutorApiErrorShape): {
  error_code: string;
  http_status: number;
  message_template: string;
  severity: AppErrorSeverity;
  is_expected: boolean;
  rate_limit?: { feature: string; scope: 'user' | 'global'; limit_window: string };
} {
  const errorObject =
    typeof input.error === 'object' && input.error !== null ? input.error : null;
  const rawMessage =
    (typeof input.error === 'string' ? input.error : errorObject?.message) ??
    input.message ??
    'unknown';
  const message_template = sanitizeMessageTemplate(rawMessage);
  const error_code =
    errorObject?.code?.trim().toUpperCase() ??
    inferHttpErrorCode(input.status);

  if (error_code === 'RATE_LIMITED' || input.status === 429) {
    const scope =
      errorObject?.scope === 'global' ? ('global' as const) : ('user' as const);
    return {
      error_code: 'RATE_LIMITED',
      http_status: input.status,
      message_template:
        message_template === 'unknown'
          ? sanitizeMessageTemplate(TUTOR_RATE_LIMIT_MESSAGE)
          : message_template,
      severity: 'info',
      is_expected: true,
      rate_limit: {
        feature: 'tutor',
        scope,
        limit_window: inferTutorLimitWindow(scope, errorObject?.retryAfterSeconds),
      },
    };
  }

  if (error_code === 'SESSION_TURN_LIMIT') {
    return {
      error_code: 'SESSION_TURN_LIMIT',
      http_status: input.status,
      message_template,
      severity: 'degraded',
      is_expected: true,
    };
  }

  if (input.status >= 500) {
    return {
      error_code: 'TUTOR_FAILED',
      http_status: input.status,
      message_template,
      severity: 'user_blocking',
      is_expected: false,
    };
  }

  return {
    error_code,
    http_status: input.status,
    message_template,
    severity: 'degraded',
    is_expected: false,
  };
}

function inferTutorLimitWindow(
  scope: 'user' | 'global',
  retryAfterSeconds?: number
): string {
  const retry = retryAfterSeconds ?? 60;
  if (scope === 'global') {
    return retry <= 90 ? 'global_per_minute' : 'global_per_hour';
  }
  if (retry <= 90) return 'per_minute';
  if (retry <= 3_700) return 'per_hour';
  return 'per_day';
}

export function buildAppErrorPresentedPayload(input: {
  severity: AppErrorSeverity;
  surface: AppErrorSurface;
  error_code: string;
  http_status: number | null;
  message_template: string;
  route_template: string;
  environment: string;
  release_sha?: string | null;
  correlation_id?: string | null;
  is_expected: boolean;
  product_area?: AppErrorProductArea;
}): AppErrorPresentedPayload {
  const message_template = sanitizeMessageTemplate(input.message_template);
  const route_template = templateRoutePath(input.route_template);
  return {
    severity: input.severity,
    surface: input.surface,
    error_code: input.error_code.trim().toUpperCase(),
    http_status: input.http_status,
    message_template,
    route_template,
    product_area: input.product_area ?? resolveProductArea(route_template),
    environment: input.environment,
    release_sha: input.release_sha ?? null,
    correlation_id: input.correlation_id ?? null,
    is_expected: input.is_expected,
    fingerprint: buildAppErrorFingerprint({
      error_code: input.error_code,
      route_template,
      message_template,
    }),
  };
}
