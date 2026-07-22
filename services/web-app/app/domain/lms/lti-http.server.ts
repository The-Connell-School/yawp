import { lookup } from 'node:dns/promises';
import { isBlockedLtiAddress, type LtiRegistration } from './lti-registration';

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

type DeadlineContext = {
  controller: AbortController;
  deadline: Promise<never>;
  timeout: ReturnType<typeof setTimeout>;
  upstreamSignal?: AbortSignal | null;
  abortFromUpstream: () => void;
};

const responseDeadlines = new WeakMap<Response, DeadlineContext>();

function cleanupDeadline(response: Response) {
  const context = responseDeadlines.get(response);
  if (!context) return;
  clearTimeout(context.timeout);
  context.upstreamSignal?.removeEventListener(
    'abort',
    context.abortFromUpstream
  );
  responseDeadlines.delete(response);
}

export function finishLtiNetwork(response: Response) {
  cleanupDeadline(response);
  if (response.body && !response.bodyUsed) void response.body.cancel();
}

async function assertPublicDestination(
  url: URL,
  registration: LtiRegistration,
  operation: string,
  deadline: Promise<never>
) {
  if (registration.transportMode === 'loopback-http') return;
  if (isBlockedLtiAddress(url.hostname)) {
    throw new LtiHttpError(
      `${operation} refused a private, loopback, or link-local destination.`,
      { operation }
    );
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      deadline,
    ]);
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
    throw new LtiHttpError(`${operation} DNS resolution failed.`, {
      operation,
      cause: error,
    });
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedLtiAddress(address))
  ) {
    throw new LtiHttpError(
      `${operation} resolved to a private, loopback, or link-local destination.`,
      { operation }
    );
  }
}

export async function fetchLtiNetwork(input: {
  operation: string;
  url: string | URL;
  registration: LtiRegistration;
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
  const context: DeadlineContext = {
    controller,
    deadline,
    timeout,
    upstreamSignal,
    abortFromUpstream,
  };

  try {
    const url = new URL(input.url);
    await assertPublicDestination(
      url,
      input.registration,
      input.operation,
      deadline
    );
    const response = await Promise.race([
      (input.fetchImpl ?? fetch)(url, {
        ...input.init,
        redirect: 'manual',
        signal: controller.signal,
      }),
      deadline,
    ]);
    responseDeadlines.set(response, context);
    if (response.status >= 300 && response.status < 400) {
      const error = new LtiHttpError(
        `${input.operation} refused HTTP redirect ${response.status}.`,
        {
          operation: input.operation,
          status: response.status,
          retryAfter: response.headers.get('retry-after'),
        }
      );
      finishLtiNetwork(response);
      throw error;
    }
    return response;
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    throw new LtiHttpError(`${input.operation} network request failed.`, {
      operation: input.operation,
      cause: error,
    });
  }
}

export async function readLtiJson(
  response: Response,
  operation: string,
  maxBytes = 1_048_576
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('LTI response body limit must be a positive integer.');
  }
  const context = responseDeadlines.get(response);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    context?.controller.abort();
    finishLtiNetwork(response);
    throw new LtiHttpError(
      `${operation} response exceeded ${maxBytes} bytes.`,
      {
        operation,
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      }
    );
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const reader = response.body?.getReader();
  try {
    if (reader) {
      while (true) {
        const result = context
          ? await Promise.race([reader.read(), context.deadline])
          : await reader.read();
        if (result.done) break;
        byteLength += result.value.byteLength;
        if (byteLength > maxBytes) {
          context?.controller.abort();
          await reader.cancel();
          throw new LtiHttpError(
            `${operation} response exceeded ${maxBytes} bytes.`,
            {
              operation,
              status: response.status,
              retryAfter: response.headers.get('retry-after'),
            }
          );
        }
        chunks.push(result.value);
      }
    }
    const body = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk))
    ).toString('utf8');
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
  } finally {
    cleanupDeadline(response);
  }
}

export function throwLtiHttpStatus(
  response: Response,
  operation: string
): never {
  const error = new LtiHttpError(
    `${operation} returned HTTP ${response.status}.`,
    {
      operation,
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
    }
  );
  finishLtiNetwork(response);
  throw error;
}
