import { beforeEach, describe, expect, mock, test } from 'bun:test';

const persistAuditEvent = mock();
const getAuditContext = mock();
const withAuditContext = mock();

mock.module('~/utils/audit-context.server', () => ({
  getAuditContext,
  withAuditContext,
  updateAuditContext: () => {},
}));
mock.module('~/utils/audit-repository.server', () => ({
  persistAuditEvent,
}));

const { auditAction, redactAuditPayload } = await import('./audit.server');

describe('audit.server', () => {
  beforeEach(() => {
    persistAuditEvent.mockReset();
    getAuditContext.mockReset();
    withAuditContext.mockReset();

    getAuditContext.mockReturnValue({
      requestId: 'request-1',
      traceId: 'trace-1',
      route: '/api/test',
      method: 'POST',
      path: '/api/test',
      userId: 'user-1',
      profileId: 'profile-1',
      sessionId: 'session-1',
    });
    withAuditContext.mockImplementation(async (_request, run) => run());
    persistAuditEvent.mockResolvedValue({ id: 'audit-1' });
  });

  test('redacts secrets and summarizes document bodies', () => {
    const result = redactAuditPayload({
      password: 'secret',
      nested: {
        authorization: 'Bearer abc',
        token: 'xyz',
      },
      html: '<p>Hello world</p>',
      text: 'Hello world',
      harmless: 'keep-me',
    });

    expect(result).toEqual({
      password: '[REDACTED]',
      nested: {
        authorization: '[REDACTED]',
        token: '[REDACTED]',
      },
      html: {
        redacted: true,
        type: 'string',
        length: 18,
      },
      text: {
        redacted: true,
        type: 'string',
        length: 11,
      },
      harmless: 'keep-me',
    });
  });

  test('does not record audit events for successful requests', async () => {
    const action = auditAction(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });

    const response = await action({
      request: new Request('https://example.com/api/test', { method: 'POST' }),
    } as any);

    expect(response.status).toBe(201);
    expect(withAuditContext).toHaveBeenCalledTimes(1);
    expect(persistAuditEvent).not.toHaveBeenCalled();
  });

  test('does not record audit events for client errors', async () => {
    const action = auditAction(async () => {
      throw new Response(null, {
        status: 302,
        statusText: 'Found',
        headers: { Location: '/auth/login' },
      });
    });

    await expect(
      action({
        request: new Request('https://example.com/api/test', {
          method: 'POST',
        }),
      } as any)
    ).rejects.toBeInstanceOf(Response);

    expect(persistAuditEvent).not.toHaveBeenCalled();
  });

  test('records api.request.completed only for server errors', async () => {
    const action = auditAction(async () => {
      throw new Response('Internal error', { status: 500 });
    });

    await expect(
      action({
        request: new Request('https://example.com/api/test', {
          method: 'POST',
        }),
      } as any)
    ).rejects.toBeInstanceOf(Response);

    expect(persistAuditEvent).toHaveBeenCalledTimes(1);
    expect(persistAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      eventType: 'api.request.completed',
      requestId: 'request-1',
      traceId: 'trace-1',
      statusCode: 500,
      success: false,
    });
  });
});
