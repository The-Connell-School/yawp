import { expect, mock, test } from 'bun:test';
import { RouterContextProvider } from 'react-router';
import { loader, middleware } from '../routes/api.internal.v1.tester-feedback/route';
import { testerFeedbackDependencies } from './tester-feedback-runtime.server';
import { resetInternalApiMemoryNonceStore, signInternalApiRequest } from './internal-platform-auth.server';
import type { FeedbackDependencies, FeedbackQuery } from './tester-feedback.server';

test('feedback loader authenticates the captured request before router query normalization', async () => {
  const names = ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE'] as const;
  const saved = names.map(name => process.env[name]);
  const original = { ...testerFeedbackDependencies };
  const list = mock(async (_input: FeedbackQuery) => []);
  const auditInternalRead = mock(async (_input: Parameters<NonNullable<FeedbackDependencies['auditInternalRead']>>[0]) => {});
  const secret = 'synthetic-feedback-boundary-signing-material';
  try {
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'boundary-test', secret, scopes: ['management:read'] }]);
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    resetInternalApiMemoryNonceStore();
    Object.assign(testerFeedbackDependencies, { list, auditInternalRead });
    const run = (request: Request) => {
      const context = new RouterContextProvider();
      const normalized = new URL(request.url);
      normalized.searchParams.delete('index'); // React Router's stripIndexParam
      return middleware[0]({ request, context, params: {}, url: new URL(request.url), pattern: '*' },
        () => loader({ request: new Request(normalized, { headers: request.headers }), context } as never));
    };
    for (const format of ['json', 'csv']) {
      const url = `https://demo.example/api/internal/v1/tester-feedback?environment=%64emo&userId=not%20a%2Btester%7e&since=2026-10-01T00%3a00%3a00Z&format=${format}`;
      const headers = signInternalApiRequest({ method: 'GET', url, keyId: 'boundary-test', secret, actor: 'Reviewer@Example.test' }).headers;
      const tampered = await run(new Request(url.replace('%64emo', 'demo'), { headers }));
      expect(tampered?.status).toBe(401);
      const valid = await run(new Request(url, { headers }));
      expect(valid?.status).toBe(200);
      expect((await run(new Request(url, { headers })))?.status).toBe(401);
    }
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]?.[0]).toMatchObject({ environment: 'demo', userId: 'not a+tester~', since: '2026-10-01T00:00:00Z' });
    expect(auditInternalRead).toHaveBeenCalledTimes(2);
    expect(auditInternalRead.mock.calls[0]?.[0]).toMatchObject({ actorEmail: 'reviewer@example.test', result: 'list.success' });
    expect(() => loader({ context: new RouterContextProvider() } as never)).toThrow();
  } finally {
    Object.assign(testerFeedbackDependencies, original);
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    });
    resetInternalApiMemoryNonceStore();
  }
});
