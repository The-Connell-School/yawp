import { expect, mock, test } from 'bun:test';
import { authSessionStorage } from '../cookie-session-storages/authentication.server';
import {
  classifyFreeTierPreviewSession,
  freeTierPreviewDependencies,
  type FreeTierPreviewSession,
} from './preview-free-tier-access.server';

const grant = {
  kind: 'RELEASE' as const,
  tokenId: 'link-1',
  applicationId: 'application-1',
  issuedAt: 1,
};
const teacher: FreeTierPreviewSession = {
  user: {
    isAdmin: false,
    memberships: [
      {
        id: 'membership-1',
        role: 'TEACHER',
        organizationId: 'free-org',
        organization: { plan: 'FREE_CLASSROOM', previewSeatCode: null },
      },
    ],
  },
  application: {
    id: 'application-1',
    acquisitionTokenId: 'event-1',
    organizationId: 'free-org',
  },
};

test('legacy impersonation markers cannot use a grant even for its matching teacher', async () => {
  const realDb = { ...(await import('./db.server')) };
  const findSession = mock(async () => ({
    ...teacher,
    userId: 'teacher-1',
  }));
  const findApplication = mock(async () => teacher.application);
  mock.module('./db.server', () => ({
    ...realDb,
    prisma: {
      session: { findUnique: findSession },
      freeTierApplication: { findFirst: findApplication },
    },
  }));
  async function requestWith(markers: Record<string, string>) {
    const auth = await authSessionStorage.getSession();
    auth.set('sessionId', 'teacher-session');
    for (const [key, value] of Object.entries(markers)) auth.set(key, value);
    return new Request('https://demo.example/app/free-tier/onboarding', {
      headers: {
        cookie: (await authSessionStorage.commitSession(auth)).split(';', 1)[0],
      },
    });
  }
  try {
    expect(
      await freeTierPreviewDependencies.session(await requestWith({}), grant)
    ).toBe('teacher');
    findSession.mockClear();
    findApplication.mockClear();
    const impersonationMarkers: Record<string, string>[] = [
      { impersonationMode: 'read-only' },
      { impersonatorUserId: 'operator-1' },
      { impersonationMode: 'read-only', impersonatorUserId: 'operator-1' },
    ];
    for (const markers of impersonationMarkers) {
      expect(
        await freeTierPreviewDependencies.session(await requestWith(markers), grant)
      ).toBe('denied');
    }
    expect(findSession).not.toHaveBeenCalled();
    expect(findApplication).not.toHaveBeenCalled();
  } finally {
    mock.module('./db.server', () => realDb);
  }
});

test('only a grant-matching free-tier teacher can continue with a session', () => {
  expect(classifyFreeTierPreviewSession(null, null, grant)).toBe('denied');
  expect(classifyFreeTierPreviewSession(teacher, null, grant)).toBe('teacher');
  expect(classifyFreeTierPreviewSession(teacher, 'membership-1', grant)).toBe(
    'teacher'
  );
  expect(
    classifyFreeTierPreviewSession(teacher, 'other-membership', grant)
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(teacher, null, {
      ...grant,
      applicationId: 'another-application',
    })
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(teacher, null, {
      kind: 'acquisition',
      tokenId: 'event-1',
      issuedAt: 1,
    })
  ).toBe('teacher');
  expect(
    classifyFreeTierPreviewSession(teacher, null, {
      kind: 'acquisition',
      tokenId: 'other-event',
      issuedAt: 1,
    })
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(
      { ...teacher, application: null },
      null,
      grant
    )
  ).toBe('denied');
  expect(
    classifyFreeTierPreviewSession(
      { ...teacher, user: { ...teacher.user, isAdmin: true } },
      null,
      grant
    )
  ).toBe('denied');
  for (const changes of [
    { role: 'STUDENT' },
    { organizationId: 'another-org' },
    { organization: { plan: 'PAID', previewSeatCode: null } },
    { organization: { plan: 'FREE_CLASSROOM', previewSeatCode: 'seed-seat' } },
  ]) {
    const member = { ...teacher.user.memberships[0]!, ...changes };
    expect(
      classifyFreeTierPreviewSession(
        { ...teacher, user: { ...teacher.user, memberships: [member] } },
        null,
        grant
      )
    ).toBe('denied');
    expect(
      classifyFreeTierPreviewSession(
        {
          ...teacher,
          user: {
            ...teacher.user,
            memberships: [...teacher.user.memberships, member],
          },
        },
        null,
        grant
      )
    ).toBe('denied');
  }
  expect(
    classifyFreeTierPreviewSession(
      { ...teacher, user: { ...teacher.user, memberships: [] } },
      null,
      grant
    )
  ).toBe('teacher');
});
