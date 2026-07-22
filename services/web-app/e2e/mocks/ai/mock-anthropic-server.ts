import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export type AnthropicMockScenario =
  | 'strong'
  | 'developing'
  | 'malformed-json'
  | 'rate-limited'
  | 'internal-error'
  | 'connection-drop';

export type CapturedAnthropicRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
};

type StartMockAnthropicServerOptions = {
  scenarios?: AnthropicMockScenario[];
};

const feedbackByScenario = {
  strong: {
    status: 'strong',
    summary: 'Your claim is specific, arguable, and ready to support.',
    strengths: ['You take a clear position.', 'The claim fits one paragraph.'],
    focus: ['Use your next sentence to introduce evidence.'],
    encouragement: 'Strong work—keep building from this claim.',
  },
  developing: {
    status: 'developing',
    summary: 'Your direction is clear, but the claim can be more specific.',
    strengths: ['You state a position in your own voice.'],
    focus: ['Name who is affected and what changes for them.'],
    encouragement: 'You have the core idea; sharpen one detail.',
  },
} as const;

function writeJson(
  response: import('node:http').ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

export async function startMockAnthropicServer(
  options: StartMockAnthropicServerOptions = {}
) {
  const capturedRequests: CapturedAnthropicRequest[] = [];
  const scenarios = [...(options.scenarios ?? [])];
  let fallbackScenario: AnthropicMockScenario = 'strong';
  let responseNumber = 0;

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    let byteCount = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteCount += buffer.length;
      if (byteCount > 1_000_000) {
        writeJson(response, 413, {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'body too large' },
        });
        return;
      }
      chunks.push(buffer);
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      writeJson(response, 400, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'invalid JSON' },
      });
      return;
    }

    const path = new URL(request.url ?? '/', 'http://mock.local').pathname;
    capturedRequests.push({
      method: request.method ?? '',
      path,
      headers: request.headers,
      body,
    });

    if (request.method !== 'POST' || path !== '/v1/messages') {
      writeJson(response, 404, {
        type: 'error',
        error: { type: 'not_found_error', message: 'mock route not found' },
      });
      return;
    }

    const scenario = scenarios.shift() ?? fallbackScenario;
    if (scenario === 'connection-drop') {
      request.socket.destroy();
      return;
    }
    if (scenario === 'rate-limited') {
      writeJson(
        response,
        429,
        {
          type: 'error',
          error: { type: 'rate_limit_error', message: 'mock rate limit' },
        },
        { 'retry-after': '0' }
      );
      return;
    }
    if (scenario === 'internal-error') {
      writeJson(response, 500, {
        type: 'error',
        error: { type: 'api_error', message: 'mock provider outage' },
      });
      return;
    }

    responseNumber += 1;
    const text =
      scenario === 'malformed-json'
        ? '{not valid tutor feedback'
        : JSON.stringify(feedbackByScenario[scenario]);
    writeJson(response, 200, {
      id: `msg_yawp_mock_${responseNumber}`,
      type: 'message',
      role: 'assistant',
      model: String(body.model ?? 'claude-sonnet-4-6'),
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 73, output_tokens: 41 },
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    capturedRequests,
    enqueue(...next: AnthropicMockScenario[]) {
      scenarios.push(...next);
    },
    setFallbackScenario(next: AnthropicMockScenario) {
      fallbackScenario = next;
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
