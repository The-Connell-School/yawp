import { redactFreeformMessage } from './redact-freeform-message';

const ALLOWED_REQUEST_HEADERS = ['user-agent', 'x-request-id'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isPrismaClientError(error: unknown): boolean {
  return error instanceof Error && error.name.startsWith('PrismaClient');
}

function prismaMetaForLog(meta: unknown) {
  if (!isRecord(meta)) {
    return {};
  }
  const out: { modelName?: string; target?: unknown } = {};
  if (typeof meta.modelName === 'string') {
    out.modelName = meta.modelName;
  }
  if ('target' in meta) {
    out.target = meta.target;
  }
  return out;
}

function sanitizeStackFrame(line: string): string {
  let out = line.replace(/https?:\/\/[^\s)]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return '[redacted-url]';
    }
  });
  // V8 often encodes `path?query=1:line:col` — strip the query, keep line:col.
  out = out.replace(/\?[^:)]+(?=:\d+:\d+)/g, '');
  return out.replace(/\?[^\s)'"]+/g, '');
}

const REAL_STACK_FRAME = /^\s*at .*:\d+:\d+\)?$/;

/** Stack frames only — real V8 frames with line:col, redacted like freeform text. */
export function buildSafeStackForLog(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) {
    return undefined;
  }
  const frames = error.stack
    .split('\n')
    .slice(1)
    .filter((line) => REAL_STACK_FRAME.test(line))
    .map((line) => redactFreeformMessage(sanitizeStackFrame(line)));
  if (frames.length === 0) {
    return undefined;
  }
  return frames.join('\n');
}

function safeCauseForLog(
  error: Error
): { name: string; code?: string } | undefined {
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!(cause instanceof Error)) {
    if (isRecord(cause) && typeof cause.name === 'string') {
      const code =
        typeof cause.code === 'string' || typeof cause.code === 'number'
          ? String(cause.code)
          : undefined;
      return code ? { name: cause.name, code } : { name: cause.name };
    }
    return undefined;
  }
  if (isPrismaClientError(cause)) {
    return undefined;
  }
  const code =
    typeof (cause as Error & { code?: unknown }).code === 'string' ||
    typeof (cause as Error & { code?: unknown }).code === 'number'
      ? String((cause as Error & { code?: unknown }).code)
      : undefined;
  return code ? { name: cause.name, code } : { name: cause.name };
}

/** Stable client JSON copy — never forwards raw exception text to browsers. */
export function safeErrorTextForClientResponse(
  _error: unknown,
  fallback: string
): string {
  return fallback;
}

/** Teacher-safe validation copy from a typed domain error, with freeform redaction. */
export function safeDomainErrorTextForClientResponse(
  error: Error,
  fallback: string
): string {
  const redacted = redactFreeformMessage(error.message).trim();
  return redacted || fallback;
}

/** Single-line safe error text for DB rows or domain `{ ok: false, error }` payloads. */
export function safeErrorTextForLog(error: unknown): string {
  const safe = buildSafeErrorForLog(error);
  if ('message' in safe && typeof safe.message === 'string' && safe.message) {
    return safe.message;
  }
  if ('code' in safe && typeof safe.code === 'string') {
    return `${safe.name}:${safe.code}`;
  }
  return safe.name;
}

/**
 * Thrown non-Error values (Response, React Router ErrorResponse/data(), plain
 * objects, Promises) used to stringify to "[object Object]", which made every
 * such server error one unreadable PostHog cluster. Describe them by shape:
 * status codes, a redacted string `message`, or sorted keys only (never values).
 */
export function describeNonErrorForLog(error: unknown): {
  name: string;
  message: string;
  status?: number;
} {
  if (typeof Response !== 'undefined' && error instanceof Response) {
    return {
      name: 'ThrownResponse',
      message: `HTTP ${error.status}`,
      status: error.status,
    };
  }
  if (
    error instanceof Promise ||
    (isRecord(error) &&
      typeof (error as { then?: unknown }).then === 'function')
  ) {
    return {
      name: 'ThrownPromise',
      message: 'Promise thrown or rejected without await',
    };
  }
  if (isRecord(error)) {
    const record = error as Record<string, unknown>;
    const status =
      typeof record.status === 'number' ? record.status : undefined;
    const ctor =
      typeof (record as { constructor?: { name?: unknown } }).constructor
        ?.name === 'string'
        ? (record as { constructor: { name: string } }).constructor.name
        : '';
    const name =
      ctor === 'ErrorResponseImpl' || 'internal' in record
        ? 'ErrorResponse'
        : ctor === 'DataWithResponseInit'
          ? 'ThrownData'
          : 'UnknownError';
    if (typeof record.message === 'string' && record.message.trim()) {
      return {
        name,
        message: redactFreeformMessage(record.message),
        ...(status !== undefined ? { status } : {}),
      };
    }
    const init = isRecord(record.init) ? record.init : undefined;
    const initStatus =
      init && typeof init.status === 'number' ? init.status : undefined;
    const effectiveStatus = status ?? initStatus;
    if (effectiveStatus !== undefined) {
      return {
        name,
        message: `HTTP ${effectiveStatus}`,
        status: effectiveStatus,
      };
    }
    const keys = Object.keys(record).sort().slice(0, 8);
    return {
      name,
      message: keys.length
        ? `non-Error object (${ctor || 'Object'}) keys: ${keys.join(',')}`
        : `non-Error object (${ctor || 'Object'})`,
    };
  }
  return {
    name: 'UnknownError',
    message: redactFreeformMessage(String(error)),
  };
}

/**
 * Route shape for error tracking: path segments whose value equals a route
 * param are replaced with `:key`, so class codes / tokens never leave the box.
 */
export function routeTemplateForLog(
  request: Request,
  params: Record<string, string | undefined> | undefined
): string {
  const path = requestPathWithoutQuery(request);
  const byValue = new Map<string, string>();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) byValue.set(value, key);
  }
  return path
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // keep raw segment
      }
      const key = byValue.get(decoded);
      return key ? `:${key}` : segment;
    })
    .join('/');
}

export function buildSafeErrorForLog(error: unknown) {
  if (!(error instanceof Error)) {
    const described = describeNonErrorForLog(error);
    // Status (when any) is already in the message ("HTTP 404"); keep the
    // original { name, message } shape so callers' inferred types are unchanged.
    return { name: described.name, message: described.message };
  }

  if (isPrismaClientError(error)) {
    const code =
      typeof (error as Error & { code?: unknown }).code === 'string'
        ? (error as Error & { code: string }).code
        : undefined;
    const meta = prismaMetaForLog((error as Error & { meta?: unknown }).meta);
    const stack = buildSafeStackForLog(error);
    return {
      name: error.name,
      ...(code ? { code } : {}),
      ...meta,
      ...(stack ? { stack } : {}),
    };
  }

  const stack = buildSafeStackForLog(error);
  const cause = safeCauseForLog(error);
  return {
    name: error.name,
    message: redactFreeformMessage(error.message),
    ...(cause ? { cause } : {}),
    ...(stack ? { stack } : {}),
  };
}

function requestPathWithoutQuery(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return '/';
  }
}

export function requestIdFromHeaders(request: Request): string | null {
  return request.headers.get('x-request-id');
}

/** Safe request fields for server error logs — no cookies, auth, or forwarding headers. */
export function buildServerErrorRequestContext(request: Request) {
  const headers: Record<string, string> = {};
  for (const name of ALLOWED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  return {
    method: request.method,
    path: requestPathWithoutQuery(request),
    requestId: requestIdFromHeaders(request),
    headers,
  };
}

/** Route param values may hold class codes, tokens, or emails — log sorted keys only. */
export function buildSafeRouteParamsForLog(
  params: Record<string, string | undefined> | undefined
) {
  if (!params) {
    return { paramKeys: [] as string[] };
  }
  return { paramKeys: Object.keys(params).sort() };
}
