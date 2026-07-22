import { beforeEach, describe, expect, mock, test } from 'bun:test';

const completeLtiLaunch = mock();
const getUserId = mock();
const setMembershipId = mock(async () => 'membership=selected');
const setPendingLtiLink = mock(async () => 'lti-pending=signed');
const createSession = mock();

class LtiPilotError extends Error {}

mock.module('~/domain/lms/lti-pilot.server', () => ({
  completeLtiLaunch,
  LtiPilotError,
}));
mock.module('~/utils/auth.server', () => ({
  getUserId,
  getSessionExpirationDate: () => new Date('2026-07-22T01:00:00.000Z'),
  sessionKey: 'sessionId',
}));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));
mock.module('~/cookies/lti-pending-link.server', () => ({ setPendingLtiLink }));
mock.module('~/utils/db.server', () => ({
  prisma: { session: { create: createSession } },
}));
mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: {
    getSession: mock(),
    commitSession: mock(),
  },
}));

const { action, loader } = await import('./route');

function launchRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://yawp.example/lti/launch', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  });
}

describe('LTI launch callback route', () => {
  beforeEach(() => {
    completeLtiLaunch.mockReset();
    getUserId.mockReset();
    setMembershipId.mockClear();
    setPendingLtiLink.mockClear();
    createSession.mockReset();
    getUserId.mockResolvedValue(null);
  });

  test('rejects GET and never invokes launch verification', () => {
    const response = loader({} as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/lti/error');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(completeLtiLaunch).not.toHaveBeenCalled();
  });

  test('rejects duplicate form keys before launch verification', async () => {
    const response = await action({
      request: launchRequest('id_token=one&id_token=two&state=state'),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/lti/error');
    expect(completeLtiLaunch).not.toHaveBeenCalled();
  });

  test('rejects oversized launch forms before reading or persisting', async () => {
    const response = await action({
      request: launchRequest('id_token=x&state=y', {
        'content-length': String(25 * 1024),
      }),
      params: {},
      context: undefined,
    } as never);

    expect(response.headers.get('location')).toBe('/lti/error');
    expect(completeLtiLaunch).not.toHaveBeenCalled();
  });

  test('sets only the signed pending-link cookie for an unknown subject', async () => {
    completeLtiLaunch.mockResolvedValue({
      kind: 'link_required',
      pendingLinkId: 'pending-1',
      pendingLinkSecret: 's'.repeat(43),
    });
    const response = await action({
      request: launchRequest('id_token=jwt&state=state'),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/lti/link');
    expect(response.headers.get('set-cookie')).toBe('lti-pending=signed');
    expect(setMembershipId).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  test('selects the linked membership without replacing an existing session', async () => {
    getUserId.mockResolvedValue('user-1');
    completeLtiLaunch.mockResolvedValue({
      kind: 'linked',
      userId: 'user-1',
      membershipId: 'membership-1',
      destination: '/app/my-classes/class-1',
    });
    const response = await action({
      request: launchRequest('id_token=jwt&state=state'),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/app/my-classes/class-1'
    );
    expect(setMembershipId).toHaveBeenCalledWith('membership-1');
    expect(createSession).not.toHaveBeenCalled();
  });
});
