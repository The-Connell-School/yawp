import { lookup } from 'node:dns/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { checkServerIdentity } from 'node:tls';
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
  deadline: Promise<never>,
  upstreamSignal?: AbortSignal | null
): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (registration.transportMode === 'loopback-http') {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return { address: '127.0.0.1', family: 4 };
    }
    const family = isIP(hostname);
    if (
      (family !== 4 && family !== 6) ||
      !['127.0.0.1', '::1'].includes(hostname)
    ) {
      throw new LtiHttpError(
        `${operation} refused a non-loopback test destination.`,
        { operation }
      );
    }
    return { address: hostname, family };
  }
  if (isBlockedLtiAddress(url.hostname)) {
    throw new LtiHttpError(
      `${operation} refused a private, loopback, or link-local destination.`,
      { operation }
    );
  }
  let addresses: Array<{ address: string; family: number }>;
  let rejectUpstreamAbort!: (error: LtiHttpError) => void;
  const upstreamAbort = new Promise<never>((_resolve, reject) => {
    rejectUpstreamAbort = reject;
  });
  const abortDns = () =>
    rejectUpstreamAbort(
      new LtiHttpError(`${operation} was aborted during DNS resolution.`, {
        operation,
      })
    );
  if (upstreamSignal?.aborted) abortDns();
  upstreamSignal?.addEventListener('abort', abortDns, { once: true });
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      deadline,
      upstreamAbort,
    ]);
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
    throw new LtiHttpError(`${operation} DNS resolution failed.`, {
      operation,
      cause: error,
    });
  } finally {
    upstreamSignal?.removeEventListener('abort', abortDns);
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
  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) {
    throw new LtiHttpError(`${operation} resolved an unsupported address.`, {
      operation,
    });
  }
  return { address: selected.address, family: selected.family };
}

function serializeLtiRequestBody(body: BodyInit | null | undefined) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error(
    'LTI network requests support only bounded in-memory bodies.'
  );
}

function requestPinnedLtiNetwork(input: {
  url: URL;
  destination: { address: string; family: 4 | 6 };
  init?: RequestInit;
  signal: AbortSignal;
}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = new Headers(input.init?.headers);
    headers.set('host', input.url.host);
    headers.set('accept-encoding', 'identity');
    const originalHostname = input.url.hostname.replace(/^\[|\]$/g, '');
    const body = serializeLtiRequestBody(input.init?.body);
    const request = (
      input.url.protocol === 'https:' ? requestHttps : requestHttp
    )(
      {
        protocol: input.url.protocol,
        hostname: input.destination.address,
        family: input.destination.family,
        port: input.url.port || undefined,
        path: `${input.url.pathname}${input.url.search}`,
        method: input.init?.method ?? 'GET',
        headers: Object.fromEntries(headers.entries()),
        signal: input.signal,
        ...(input.url.protocol === 'https:'
          ? {
              servername: isIP(originalHostname) ? undefined : originalHostname,
              checkServerIdentity: (_hostname: string, certificate: unknown) =>
                checkServerIdentity(
                  originalHostname,
                  certificate as Parameters<typeof checkServerIdentity>[1]
                ),
            }
          : {}),
      },
      (incoming) => {
        const status = incoming.statusCode ?? 500;
        if (status < 200 || status > 599) {
          incoming.resume();
          reject(new Error(`LTI upstream returned invalid status ${status}.`));
          return;
        }
        try {
          const responseHeaders = new Headers();
          for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
            responseHeaders.append(
              incoming.rawHeaders[index],
              incoming.rawHeaders[index + 1]
            );
          }
          const bodyless = [204, 205, 304].includes(status);
          if (bodyless) incoming.resume();
          resolve(
            new Response(
              bodyless
                ? null
                : (Readable.toWeb(
                    incoming
                  ) as unknown as ReadableStream<Uint8Array>),
              {
                status,
                statusText: incoming.statusMessage,
                headers: responseHeaders,
              }
            )
          );
        } catch (error) {
          incoming.destroy();
          reject(error);
        }
      }
    );
    request.on('error', reject);
    request.end(body);
  });
}

export async function fetchLtiNetwork(input: {
  operation: string;
  url: string | URL;
  registration: LtiRegistration;
  init?: RequestInit;
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
    const destination = await assertPublicDestination(
      url,
      input.registration,
      input.operation,
      deadline,
      upstreamSignal
    );
    const response = await Promise.race([
      requestPinnedLtiNetwork({
        url,
        destination,
        init: input.init,
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
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    if (error instanceof LtiHttpError) throw error;
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
