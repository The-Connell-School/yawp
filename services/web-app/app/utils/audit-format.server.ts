type JsonLike =
  | null
  | string
  | number
  | boolean
  | JsonLike[]
  | { [key: string]: JsonLike };

const REDACTED = '[REDACTED]';
const BODY_SUMMARY_KEYS = new Set(['html', 'text', 'content']);
const SECRET_KEY_PATTERN =
  /password|cookie|token|secret|authorization|signature|signed|file|binary/i;

function summarizeLargeString(value: string) {
  return {
    redacted: true,
    type: 'string',
    length: value.length,
  } as const;
}

export function redactAuditPayload(
  value: unknown,
  key?: string
): JsonLike | undefined {
  if (value === undefined) return undefined;
  if (key && SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === 'string') {
    if (key && BODY_SUMMARY_KEYS.has(key)) {
      return summarizeLargeString(value);
    }
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditPayload(item)) as JsonLike[];
  }
  if (value instanceof Headers) {
    return summarizeHeaders(value);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([entryKey, entryValue]) => [entryKey, redactAuditPayload(entryValue, entryKey)]
    );
    return Object.fromEntries(entries) as JsonLike;
  }
  return String(value);
}

export function summarizeHeaders(headers: Headers | Record<string, string>) {
  const source =
    headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, redactAuditPayload(value, key)])
  ) as JsonLike;
}

export function summarizePrismaResult(value: unknown): JsonLike {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      count: value.length,
      sample: value
        .slice(0, 3)
        .map((item) => summarizePrismaResult(item)) as JsonLike[],
    };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const summary: Record<string, JsonLike> = {
      type: 'object',
      keys: Object.keys(record).slice(0, 12),
    };
    if (typeof record.id === 'string' || typeof record.id === 'number') {
      summary.id = String(record.id);
    }
    if (typeof record.count === 'number') {
      summary.count = record.count;
    } else if (typeof record._count === 'number') {
      summary.count = record._count;
    }
    return summary;
  }

  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string') return summarizeLargeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export function serializeAuditError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    const responseError = error as { status: number; statusText?: unknown };
    return {
      name: 'ResponseError',
      status: responseError.status,
      message:
        'statusText' in (error as Record<string, unknown>) &&
        typeof responseError.statusText === 'string'
          ? responseError.statusText
          : 'Response thrown',
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}
