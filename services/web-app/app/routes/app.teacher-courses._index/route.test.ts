import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  featureFlagSettingName,
  serializeFeatureFlagValue,
  TEACHER_LOUNGE_FLAG,
} from '~/domain/feature-flags/feature-flags';

const requireUserId = mock(async () => 'user-1');
const requireMembership = mock(async () => ({
  organization: { id: 'org-1' },
}));
const findUnique = mock(async () => ({ email: 'other.teacher@example.com' }));

const TEACHER_LOUNGE_SETTING = featureFlagSettingName(TEACHER_LOUNGE_FLAG);
const ALLOWLIST_EMAIL = 'zestlan.simmons@mps.k12.al.us';

const prisma = {
  user: { findUnique },
  setting: { findUnique: mock() },
  accessListEntry: {
    findFirst: mock(),
    findUnique: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

function mockLoungeOff() {
  prisma.setting.findUnique.mockImplementation(
    ({ where }: { where: { name: string } }) =>
      Promise.resolve(
        where.name === TEACHER_LOUNGE_SETTING
          ? {
              value: serializeFeatureFlagValue({ mode: 'off', orgIds: [] }),
            }
          : null
      )
  );
  prisma.accessListEntry.findFirst.mockResolvedValue(null);
  prisma.accessListEntry.findUnique.mockResolvedValue(null);
}

describe('legacy teacher courses route', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    requireUserId.mockClear();
    requireMembership.mockClear();
    findUnique.mockClear();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ organization: { id: 'org-1' } });
    mockLoungeOff();
  });

  test('redirects to the teacher dashboard while the Lounge is disabled', async () => {
    findUnique.mockResolvedValue({ email: 'other.teacher@example.com' });
    const response = await loader({
      request: new Request('http://test/app/teacher-courses'),
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app');
  });

  test('redirects allowlisted teacher to teacher trainings', async () => {
    findUnique.mockResolvedValue({ email: ALLOWLIST_EMAIL });
    prisma.accessListEntry.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: { listKey_email: { listKey: string; email: string } };
      }) =>
        Promise.resolve(
          where.listKey_email.email === ALLOWLIST_EMAIL ? { id: '1' } : null
        )
    );
    const response = await loader({
      request: new Request('http://test/app/teacher-courses'),
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app/teacher-trainings');
  });
});
