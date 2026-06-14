import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getSession = mock();
const commitSession = mock();

mock.module('../cookie-session-storages/authentication.server.ts', () => ({
  authSessionStorage: {
    getSession,
    commitSession,
    destroySession: mock(),
  },
}));

const prisma = {
  session: {
    findUnique: mock(),
  },
};

mock.module('./db.server.ts', () => ({ prisma }));
mock.module('~/cookies/membership-id.server', () => ({
  getMembershipId: mock(),
  setMembershipId: mock(),
}));

const preview = await import('./student-preview.server.ts');
const auth = await import('./auth.server.ts');

function authSession(values: Record<string, unknown>) {
  const data = { ...values };
  return {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    },
    unset: (key: string) => {
      delete data[key];
    },
  };
}

describe('student preview', () => {
  beforeEach(() => {
    getSession.mockReset();
    commitSession.mockReset();
    commitSession.mockResolvedValue('preview-session-cookie');
  });

  test('allows teachers and admins', () => {
    expect(
      preview.canEnterStudentPreview({ role: 'TEACHER', isAdmin: false })
    ).toBe(true);
    expect(
      preview.canEnterStudentPreview({ role: 'TEACHER', isAdmin: true })
    ).toBe(true);
    expect(
      preview.canEnterStudentPreview({ role: 'STUDENT', isAdmin: false })
    ).toBe(false);
    expect(
      preview.canEnterStudentPreview({ role: 'STUDENT', isAdmin: true })
    ).toBe(true);
  });

  test('reads preview state from the auth session', async () => {
    getSession.mockResolvedValue(
      authSession({
        studentPreviewMode: 'read-only',
        studentPreviewOrgId: 'org-1',
      })
    );

    await expect(
      preview.getStudentPreviewState(
        new Request('https://example.com/app', {
          headers: { cookie: 'en_session=signed-cookie' },
        })
      )
    ).resolves.toEqual({
      active: true,
      organizationId: 'org-1',
    });
  });

  test('isStudentPreviewActive reflects preview state', () => {
    expect(preview.isStudentPreviewActive({ active: true })).toBe(true);
    expect(preview.isStudentPreviewActive({ active: false })).toBe(false);
  });

  test('shouldUseStudentExperience includes preview mode', () => {
    expect(
      preview.shouldUseStudentExperience({
        membershipRole: 'TEACHER',
        previewActive: true,
      })
    ).toBe(true);
    expect(
      preview.shouldUseStudentExperience({
        membershipRole: 'TEACHER',
        previewActive: false,
      })
    ).toBe(false);
    expect(
      preview.shouldUseStudentExperience({
        membershipRole: 'STUDENT',
        previewActive: false,
      })
    ).toBe(true);
  });

  test('startStudentPreview stores read-only preview keys', async () => {
    const session = authSession({});
    getSession.mockResolvedValue(session);

    const cookie = await preview.startStudentPreview(
      new Request('https://example.com/app'),
      'org-42'
    );

    expect(session.get('studentPreviewMode')).toBe('read-only');
    expect(session.get('studentPreviewOrgId')).toBe('org-42');
    expect(cookie).toBe('preview-session-cookie');
    expect(commitSession).toHaveBeenCalled();
  });

  test('endStudentPreview clears preview keys', async () => {
    const session = authSession({
      studentPreviewMode: 'read-only',
      studentPreviewOrgId: 'org-42',
    });
    getSession.mockResolvedValue(session);

    const cookie = await preview.endStudentPreview(
      new Request('https://example.com/app')
    );

    expect(session.get('studentPreviewMode')).toBeUndefined();
    expect(session.get('studentPreviewOrgId')).toBeUndefined();
    expect(cookie).toBe('preview-session-cookie');
  });
});

function readOnlyAuthSession(values: Record<string, unknown>) {
  return {
    get: mock((key: string) => values[key]),
  };
}

function request(method: string, pathname: string) {
  return new Request(`https://example.com${pathname}`, {
    method,
    headers: { cookie: 'en_session=signed-cookie' },
  });
}

describe('student preview auth contract', () => {
  beforeEach(() => {
    getSession.mockReset();
    commitSession.mockReset();
    prisma.session.findUnique.mockReset();
    commitSession.mockResolvedValue('preview-session-cookie');

    getSession.mockResolvedValue(
      readOnlyAuthSession({
        sessionId: 'teacher-session',
        studentPreviewMode: 'read-only',
        studentPreviewOrgId: 'org-1',
      })
    );
    prisma.session.findUnique.mockResolvedValue({
      user: { id: 'teacher-user' },
    });
  });

  test('allows navigation during student preview', async () => {
    const userId = await auth.requireUserId(request('GET', '/app'));

    expect(userId).toBe('teacher-user');
  });

  test('blocks normal mutation requests during student preview', async () => {
    let thrown: unknown;

    try {
      await auth.requireUserId(request('POST', '/api/user/name'));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
    await expect((thrown as Response).json()).resolves.toEqual({
      error: 'Student preview active',
      message: 'This session can view student pages but cannot make changes.',
    });
  });

  test('allows preview toggle during student preview', async () => {
    const userId = await auth.requireUserId(
      request('POST', '/api/student-preview')
    );

    expect(userId).toBe('teacher-user');
  });
});
