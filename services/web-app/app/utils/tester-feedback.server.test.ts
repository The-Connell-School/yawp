import { describe, expect, mock, test } from 'bun:test';
import {
  sanitizeFeedbackUrl,
  feedbackCsv,
  feedbackQuerySchema,
  submitTesterFeedback,
  readTesterFeedback,
  type FeedbackDependencies,
  type FeedbackEntry,
} from './tester-feedback.server';

const entry: FeedbackEntry = {
  id: 'feedback-1',
  userId: 'tester-1',
  url: '/app?tab=work',
  userAgent: 'Test browser',
  whatIDid: 'Opened a document',
  whatHappened: 'It froze',
  whatIWish: 'It saved',
  severity: 'medium',
  environment: 'demo',
  createdAt: new Date('2026-10-12T00:00:00Z'),
};
const hmacAuth = {
  mode: 'hmac' as const,
  keyId: 'feedback-test',
  actorEmail: 'reviewer@yawp.school',
  scopes: ['management:read'] as const,
};
function setup(overrides: Partial<FeedbackDependencies> = {}) {
  const saved: unknown[] = [];
  let reads = 0;
  const deps: FeedbackDependencies = {
    enabled: () => true,
    getUser: async () => ({ id: 'tester-1', isTester: true, isAdmin: false }),
    environment: () => 'demo',
    save: async (input) => {
      saved.push(input);
      return true;
    },
    list: async () => {
      reads++;
      return [entry];
    },
    authenticateInternal: async () => null,
    ...overrides,
  };
  return { deps, saved, reads: () => reads };
}
function request(
  values: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  return new Request('https://demo.example/api/tester-feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://demo.example',
      ...headers,
    },
    body: new URLSearchParams({
      url: '/app?token=secret&tab=work',
      whatIDid: 'Opened',
      whatHappened: 'Froze',
      whatIWish: 'Save',
      ...values,
    }),
  });
}

describe('tester feedback submission', () => {
  test('saves validated input with server-owned attribution and sanitized URL', async () => {
    const { deps, saved } = setup();
    expect(
      (
        await submitTesterFeedback(
          request({ userId: 'other', environment: 'production' }),
          deps
        )
      ).status
    ).toBe(201);
    expect(saved).toEqual([
      {
        userId: 'tester-1',
        url: '/app?tab=work',
        userAgent: '',
        whatIDid: 'Opened',
        whatHappened: 'Froze',
        whatIWish: 'Save',
        severity: null,
        environment: 'demo',
      },
    ]);
  });
  test('accepts non-ASCII feedback within the advertised character limits', async () => {
    const { deps, saved } = setup();
    const response = await submitTesterFeedback(
      request({
        whatIDid: '界'.repeat(4000),
        whatHappened: '界'.repeat(4000),
        whatIWish: '界'.repeat(4000),
      }),
      deps
    );
    expect(response.status).toBe(201);
    expect(saved).toHaveLength(1);
  });
  test('requires enabled flag, authentication, and tester status', async () => {
    for (const [overrides, status] of [
      [{ enabled: () => false }, 404],
      [{ getUser: async () => null }, 401],
      [
        {
          getUser: async () => ({
            id: 'admin',
            isTester: false,
            isAdmin: true,
          }),
        },
        403,
      ],
    ] as [Partial<FeedbackDependencies>, number][]) {
      const { deps, saved } = setup(overrides);
      expect((await submitTesterFeedback(request(), deps)).status).toBe(status);
      expect(saved).toHaveLength(0);
    }
  });
  test('rejects empty, oversized, invalid severity and non-app URL input', async () => {
    for (const values of [
      { whatIDid: '  ' },
      { whatHappened: 'x'.repeat(4001) },
      { whatIWish: '' },
      { severity: 'urgent' },
      { url: 'https://other.example/app' },
      { url: '/auth/login' },
    ] as Record<string, string>[]) {
      const { deps, saved } = setup();
      expect((await submitTesterFeedback(request(values), deps)).status).toBe(
        400
      );
      expect(saved).toHaveLength(0);
    }
  });
  test('rejects cross-origin, missing-origin, unsupported content type, oversized body and non-POST', async () => {
    const { deps, saved } = setup();
    expect(
      (
        await submitTesterFeedback(
          request({}, { origin: 'https://other.example' }),
          deps
        )
      ).status
    ).toBe(403);
    const missing = request();
    missing.headers.delete('origin');
    expect((await submitTesterFeedback(missing, deps)).status).toBe(403);
    expect(
      (
        await submitTesterFeedback(
          request({}, { 'content-type': 'application/json' }),
          deps
        )
      ).status
    ).toBe(415);
    expect(
      (
        await submitTesterFeedback(
          request({ whatIDid: 'x'.repeat(500000) }),
          deps
        )
      ).status
    ).toBe(413);
    expect(
      (
        await submitTesterFeedback(
          new Request('https://demo.example/api/tester-feedback'),
          deps
        )
      ).status
    ).toBe(405);
    expect(saved).toHaveLength(0);
  });
  test('reports modest rate limiting without saving', async () => {
    const { deps } = setup({ save: async () => false });
    const response = await submitTesterFeedback(request(), deps);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('600');
  });
});

describe('feedback URL sanitization', () => {
  test('strips token-like names, encoded names, credentials and token-like values', () => {
    expect(
      sanitizeFeedbackUrl(
        '/app/documents/one?tab=work&access_token=secret&invitationCode=secret&%61pi_key=secret&password=x&auth=x&sessionId=x&signature=x&code=x&state=x#fragment'
      )
    ).toBe('/app/documents/one?tab=work');
    expect(
      sanitizeFeedbackUrl(
        '/app?q=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature&tab=work&opaque=abcdefghijklmnopqrstuvwxyz0123456789'
      )
    ).toBe('/app?tab=work');
  });
  test('rejects external, malformed and non-app paths', () => {
    for (const value of [
      '//evil.example/app',
      'https://example/app',
      '/app/../auth',
      '/application',
      '/app\\evil',
      '/app?bad=%zz',
    ]) {
      expect(() => sanitizeFeedbackUrl(value)).toThrow();
    }
  });
});

describe('feedback reads and CSV', () => {
  test('escapes quotes, commas, newlines and spreadsheet formula injection', () => {
    const csv = feedbackCsv([
      {
        ...entry,
        whatIDid: '=HYPERLINK("x")',
        whatHappened: 'a,b\nc',
        whatIWish: ' \t+cmd',
      },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"a,b\nc"');
    expect(csv).toContain('"\' \t+cmd"');
    expect(csv).toContain('"demo"');
    expect(csv).toContain('2026-10-12T00:00:00.000Z');
    expect(feedbackCsv([])).toContain('whatIDid');
  });
  test('validates filters, dates and bounded page size', () => {
    expect(
      feedbackQuerySchema.safeParse({
        environment: 'demo',
        severity: 'high',
        userId: 'tester-1',
        since: '2026-10-01T00:00:00Z',
        until: '2026-10-12T00:00:00Z',
        limit: '50',
      }).success
    ).toBe(true);
    for (const input of [
      { severity: 'bad' },
      { limit: '10001' },
      { since: 'bad' },
      { since: '2026-10-12T00:00:00Z', until: '2026-10-01T00:00:00Z' },
      { unknown: 'x' },
    ]) {
      expect(feedbackQuerySchema.safeParse(input).success).toBe(false);
    }
  });
  test('admin and internal authorization happen before reads, even for CSV', async () => {
    const anonymous = setup({ getUser: async () => null });
    expect(
      (
        await readTesterFeedback(
          new Request('https://demo.example/app/tester/feedback?format=csv'),
          anonymous.deps,
          'admin'
        )
      ).status
    ).toBe(401);
    const tester = setup();
    expect(
      (
        await readTesterFeedback(
          new Request('https://demo.example/app/tester/feedback'),
          tester.deps,
          'admin'
        )
      ).status
    ).toBe(403);
    expect(tester.reads()).toBe(0);
    const internal = setup({
      authenticateInternal: async () => new Response(null, { status: 401 }),
    });
    expect(
      (
        await readTesterFeedback(
          new Request(
            'https://demo.example/api/internal/v1/tester-feedback?format=csv'
          ),
          internal.deps,
          'internal'
        )
      ).status
    ).toBe(401);
    expect(internal.reads()).toBe(0);
  });
  test('signed internal list and export audit rows record the operator after reading entries', async () => {
    const audit = mock(async () => {});
    const { deps } = setup({
      authenticateInternal: async () => hmacAuth,
      auditInternalRead: audit,
    });
    const list = await readTesterFeedback(
      new Request(
        'https://demo.example/api/internal/v1/tester-feedback?severity=medium'
      ),
      deps,
      'internal'
    );
    expect(list.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'reviewer@yawp.school',
        keyId: hmacAuth.keyId,
        endpoint: 'GET /api/internal/v1/tester-feedback',
        result: 'list.success',
        requestHash: expect.any(String),
      })
    );
    audit.mockClear();
    const csv = await readTesterFeedback(
      new Request(
        'https://demo.example/api/internal/v1/tester-feedback?format=csv'
      ),
      deps,
      'internal'
    );
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain('Opened a document');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'reviewer@yawp.school',
        keyId: hmacAuth.keyId,
        endpoint: 'GET /api/internal/v1/tester-feedback',
        result: 'export.success',
        requestHash: expect.any(String),
      })
    );
  });
  test('legacy bearer internal reads cannot list or export feedback', async () => {
    const audit = mock(async () => {});
    const auth = {
      mode: 'legacy' as const,
      keyId: 'legacy',
      actorEmail: 'legacy@yawp.internal',
      scopes: ['management:read'] as const,
    };
    const { deps, reads } = setup({
      authenticateInternal: async () => auth,
      auditInternalRead: audit,
    });

    for (const url of [
      'https://demo.example/api/internal/v1/tester-feedback',
      'https://demo.example/api/internal/v1/tester-feedback?format=csv',
    ]) {
      expect(
        (await readTesterFeedback(new Request(url), deps, 'internal')).status
      ).toBe(401);
    }
    expect(reads()).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });
  test('denied and invalid signed internal reads do not read rows or audit', async () => {
    const audit = mock(async () => {});
    const denied = setup({
      authenticateInternal: async () => new Response(null, { status: 403 }),
      auditInternalRead: audit,
    });
    expect(
      (
        await readTesterFeedback(
          new Request('https://demo.example/api/internal/v1/tester-feedback'),
          denied.deps,
          'internal'
        )
      ).status
    ).toBe(403);
    expect(denied.reads()).toBe(0);
    expect(audit).not.toHaveBeenCalled();
    const invalid = setup({
      authenticateInternal: async () => ({
        mode: 'hmac' as const,
        keyId: 'feedback-test',
        actorEmail: 'operator@example.test',
        scopes: ['management:read'] as const,
      }),
      auditInternalRead: audit,
    });
    expect(
      (
        await readTesterFeedback(
          new Request(
            'https://demo.example/api/internal/v1/tester-feedback?limit=200'
          ),
          invalid.deps,
          'internal'
        )
      ).status
    ).toBe(400);
    expect(invalid.reads()).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });
  test('admin CSV and signed internal list share the same filters and do not require the submission flag', async () => {
    const seen: unknown[] = [];
    const { deps } = setup({
      enabled: () => false,
      getUser: async () => ({ id: 'admin', isTester: false, isAdmin: true }),
      authenticateInternal: async () => hmacAuth,
      list: async (input) => {
        seen.push(input);
        return [entry];
      },
    });
    const csv = await readTesterFeedback(
      new Request(
        'https://demo.example/app/tester/feedback?format=csv&environment=demo'
      ),
      deps,
      'admin'
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('attachment');
    expect(csv.headers.get('cache-control')).toBe('no-store');
    expect(await csv.text()).toContain('Opened a document');
    const list = await readTesterFeedback(
      new Request(
        'https://demo.example/api/internal/v1/tester-feedback?severity=medium&userId=tester-1&since=2026-10-01T00%3A00%3A00Z&until=2026-10-13T00%3A00%3A00Z'
      ),
      deps,
      'internal'
    );
    expect((await list.json()).entries).toHaveLength(1);
    expect(seen).toEqual([
      { format: 'csv', environment: 'demo', limit: 10001 },
      {
        format: 'json',
        severity: 'medium',
        userId: 'tester-1',
        since: '2026-10-01T00:00:00Z',
        until: '2026-10-13T00:00:00Z',
        limit: 51,
      },
    ]);
    expect(
      (
        await readTesterFeedback(
          new Request(
            'https://demo.example/api/internal/v1/tester-feedback?limit=200'
          ),
          deps,
          'internal'
        )
      ).status
    ).toBe(400);
  });
  test('CSV refuses an oversized export instead of silently truncating', async () => {
    const { deps } = setup({
      authenticateInternal: async () => hmacAuth,
      list: async () => Array(10001).fill(entry),
    });
    expect(
      (
        await readTesterFeedback(
          new Request(
            'https://demo.example/api/internal/v1/tester-feedback?format=csv'
          ),
          deps,
          'internal'
        )
      ).status
    ).toBe(413);
  });
});

describe('signed feedback internal API', () => {
  test('requires management read scope, protects CSV filters, and rejects replay', async () => {
    const {
      authorizeInternalApiRequest,
      signInternalApiRequest,
      resetInternalApiMemoryNonceStore,
      resetInternalApiRateLimitBuckets,
    } = await import('./internal-platform-auth.server');
    const names = [
      'YAWP_INTERNAL_API_KEYS',
      'INTERNAL_API_NONCE_STORE',
      'LEGACY_INTERNAL_KEY_ALLOWED',
    ] as const;
    const saved = names.map((name) => process.env[name]);
    const secret = 'test-feedback-signing-material-32-characters';
    try {
      process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
        { id: 'feedback-test', secret, scopes: ['management:read'] },
        { id: 'other-test', secret, scopes: ['stats:read'] },
      ]);
      process.env.INTERNAL_API_NONCE_STORE = 'memory';
      process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
      resetInternalApiMemoryNonceStore();
      resetInternalApiRateLimitBuckets();
      const { deps, reads } = setup({
        authenticateInternal: authorizeInternalApiRequest,
      });
      const url =
        'https://demo.example/api/internal/v1/tester-feedback?format=csv&environment=demo';
      expect(
        (await readTesterFeedback(new Request(url), deps, 'internal')).status
      ).toBe(401);
      const signed = (keyId: string) =>
        signInternalApiRequest({
          method: 'GET',
          url,
          keyId,
          secret,
          actor: 'operator@example.test',
        }).headers;
      expect(
        (
          await readTesterFeedback(
            new Request(url, { headers: signed('other-test') }),
            deps,
            'internal'
          )
        ).status
      ).toBe(403);
      const headers = signed('feedback-test');
      expect(
        (
          await readTesterFeedback(
            new Request(
              url.replace('environment=demo', 'environment=production'),
              { headers }
            ),
            deps,
            'internal'
          )
        ).status
      ).toBe(401);
      expect(
        (
          await readTesterFeedback(
            new Request(url, { headers }),
            deps,
            'internal'
          )
        ).status
      ).toBe(200);
      expect(
        (
          await readTesterFeedback(
            new Request(url, { headers }),
            deps,
            'internal'
          )
        ).status
      ).toBe(401);
      expect(reads()).toBe(1);
    } finally {
      names.forEach((name, i) => {
        if (saved[i] === undefined) delete process.env[name];
        else process.env[name] = saved[i];
      });
      resetInternalApiMemoryNonceStore();
      resetInternalApiRateLimitBuckets();
    }
  });
});
