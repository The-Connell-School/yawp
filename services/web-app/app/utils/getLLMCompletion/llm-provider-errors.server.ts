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

export function getAnthropicRetryableStatus(error: unknown): number | null {
  const status = readStatus(error);
  return status !== null && RETRYABLE_ANTHROPIC_STATUSES.has(status)
    ? status
    : null;
}

export function isRetryableAnthropicOutageError(error: unknown): boolean {
  return getAnthropicRetryableStatus(error) !== null || containsOverloadedError(error);
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
