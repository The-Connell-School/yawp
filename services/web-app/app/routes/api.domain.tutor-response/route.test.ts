import { describe, expect, mock, test } from 'bun:test';

const getSession = mock();

mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: {
    getSession,
  },
}));
mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion: mock(),
}));

const { action } = await import('./route');

function authSession(values: Record<string, unknown>) {
  return {
    get: mock((key: string) => values[key]),
  };
}

describe('api.domain.tutor-response read-only impersonation', () => {
  test('preserves the read-only mutation guard response', async () => {
    getSession.mockResolvedValue(
      authSession({
        impersonationMode: 'read-only',
        impersonatorUserId: 'operator-user',
      })
    );

    const body = new FormData();
    body.set('response', 'Hello');
    body.set('cmsId', 'cms-1');

    let thrown: unknown;
    try {
      await action({
        request: new Request('https://example.com/api/domain/tutor-response', {
          method: 'POST',
          body,
          headers: { cookie: 'en_session=signed-cookie' },
        }),
      } as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
  });
});
