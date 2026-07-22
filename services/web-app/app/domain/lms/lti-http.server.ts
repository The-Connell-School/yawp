export class LtiHttpError extends Error {
  readonly operation: string;
  readonly status: number | null;
  readonly retryAfter: string | null;

  constructor(
    message: string,
    options: {
      operation: string;
      status?: number | null;
      retryAfter?: string | null;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = 'LtiHttpError';
    this.operation = options.operation;
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }
}

export async function fetchLtiNetwork(input: {
  operation: string;
  url: string | URL;
  init?: RequestInit;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Response> {
  const timeoutMs = input.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error('LTI network timeout must be between 1 and 30000 ms.');
  }
  const controller = new AbortController();
  let timeout!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        new LtiHttpError(
          `${input.operation} timed out after ${timeoutMs} ms.`,
          { operation: input.operation }
        )
      );
    }, timeoutMs);
  });
  const upstreamSignal = input.init?.signal;
  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) abortFromUpstream();
  upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
  try {
    const response = await Promise.race([
      (input.fetchImpl ?? fetch)(input.url, {
        ...input.init,
        redirect: 'manual',
        signal: controller.signal,
      }),
      deadline,
    ]);
    if (response.status >= 300 && response.status < 400) {
      throw new LtiHttpError(
        `${input.operation} refused HTTP redirect ${response.status}.`,
        {
          operation: input.operation,
          status: response.status,
          retryAfter: response.headers.get('retry-after'),
        }
      );
    }
    return response;
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
    throw new LtiHttpError(`${input.operation} network request failed.`, {
      operation: input.operation,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

export async function readLtiJson(
  response: Response,
  operation: string,
  maxBytes = 1_048_576
): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    throw new LtiHttpError(
      `${operation} response exceeded ${maxBytes} bytes.`,
      {
        operation,
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      }
    );
  }
  const body = await response.text();
  if (Buffer.byteLength(body) > maxBytes) {
    throw new LtiHttpError(
      `${operation} response exceeded ${maxBytes} bytes.`,
      {
        operation,
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      }
    );
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new LtiHttpError(`${operation} returned malformed JSON.`, {
      operation,
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      cause: error,
    });
  }
}

export function throwLtiHttpStatus(
  response: Response,
  operation: string
): never {
  throw new LtiHttpError(`${operation} returned HTTP ${response.status}.`, {
    operation,
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
  });
}
