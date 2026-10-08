const RETRYABLE_ANTHROPIC_STATUSES = new Set([500, 504, 529]);

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === 'number' ? status : null;
}

function containsOverloadedError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    return /overloaded_error/i.test(error.message);
  }
  try {
    return /overloaded_error/i.test(JSON.stringify(error));
  } catch {
    return false;
  }
}

/**
 * The provider's own name for what went wrong — `authentication_error`,
 * `invalid_request_error`, `rate_limit_error`. Anthropic nests it one level
 * deeper than OpenAI does, so both shapes are read.
 */
function readProviderErrorType(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const envelope = (error as Record<string, unknown>).error;
  if (!envelope || typeof envelope !== 'object') return null;
  const outer = envelope as Record<string, unknown>;
  const inner = outer.error;
  if (inner && typeof inner === 'object') {
    const nestedType = (inner as Record<string, unknown>).type;
    if (typeof nestedType === 'string') return nestedType;
  }
  return typeof outer.type === 'string' ? outer.type : null;
}

/**
 * A failed model call, said in a way an operator can act on and a log can
 * safely keep: the error's class, the provider's name for it, and the status.
 *
 * Deliberately never the message body. Providers quote the prompt back in
 * their messages, and these descriptions are written into logs that are kept
 * free of teacher and student words.
 */
export function describeProviderError(error: unknown): string {
  const name =
    error instanceof Error
      ? error.name
      : error && typeof error === 'object'
        ? ((error as Record<string, unknown>).name as string | undefined)
        : undefined;
  const status = readStatus(error);
  const type = readProviderErrorType(error);
  const parts = [name, type, status !== null ? `HTTP ${status}` : null].filter(
    Boolean
  );
  return parts.length ? parts.join(' · ') : 'unknown error';
}

const CONFIGURATION_STATUSES = new Set([401, 403, 404]);
const CONFIGURATION_TYPES = new Set([
  'authentication_error',
  'permission_error',
  'not_found_error',
]);

/**
 * Whether the call failed because of how the deployment is set up — a key the
 * provider will not accept, or a model name that does not exist — rather than
 * because of anything happening right now. Retrying one of these produces the
 * same failure until an environment variable changes, so telling anyone to
 * try again is a lie.
 */
export function isProviderConfigurationError(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== null && CONFIGURATION_STATUSES.has(status)) return true;
  const type = readProviderErrorType(error);
  return type !== null && CONFIGURATION_TYPES.has(type);
}

export function getAnthropicRetryableStatus(error: unknown): number | null {
  const status = readStatus(error);
  return status !== null && RETRYABLE_ANTHROPIC_STATUSES.has(status)
    ? status
    : null;
}

export function isRetryableAnthropicOutageError(error: unknown): boolean {
  return (
    getAnthropicRetryableStatus(error) !== null ||
    containsOverloadedError(error)
  );
}

export class LlmFallbackRetrySignal extends Error {
  readonly fallbackModel: string;
  readonly reason: string;
  readonly retryableStatus: number | null;

  constructor({
    fallbackModel,
    reason,
    retryableStatus = null,
  }: {
    fallbackModel: string;
    reason: string;
    retryableStatus?: number | null;
  }) {
    super('LLM fallback retry requested');
    this.name = 'LlmFallbackRetrySignal';
    this.fallbackModel = fallbackModel;
    this.reason = reason;
    this.retryableStatus = retryableStatus;
  }
}

export function isLlmFallbackRetrySignal(
  error: unknown
): error is LlmFallbackRetrySignal {
  return error instanceof LlmFallbackRetrySignal;
}
