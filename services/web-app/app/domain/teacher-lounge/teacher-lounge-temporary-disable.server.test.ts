import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  featureFlagSettingName,
  serializeFeatureFlagValue,
  TEACHER_LOUNGE_FLAG,
} from '~/domain/feature-flags/feature-flags';

const TEACHER_LOUNGE_SETTING = featureFlagSettingName(TEACHER_LOUNGE_FLAG);

/** Seeded by migration `20261104120000_admin_config_access_lists`. */
const SEEDED_ALLOWLIST_EMAILS = [
  'zestlan.simmons@mps.k12.al.us',
  'eric@theconnellschool.com',
  'christhewriter@mail.com',
] as const;

const prisma = {
  setting: {
    findUnique: mock(),
  },
  accessListEntry: {
    findFirst: mock(),
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isTeacherLoungeTemporarilyDisabledForUser,
  redirectIfTeacherLoungeTemporarilyDisabled,
} = await import('./teacher-lounge-temporary-disable.server');

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
}

function mockAllowlistEmail(email: string) {
  prisma.accessListEntry.findFirst.mockResolvedValue(null);
  prisma.accessListEntry.findUnique.mockImplementation(
    ({
      where,
    }: {
      where: { listKey_email: { listKey: string; email: string } };
    }) =>
      Promise.resolve(
        where.listKey_email.listKey === 'teacher_lounge' &&
          where.listKey_email.email === email.toLowerCase()
          ? { id: 'entry-1' }
          : null
      )
  );
}

function resetMocks() {
  mock.module('~/utils/db.server', () => ({ prisma }));
  prisma.setting.findUnique.mockReset();
  prisma.accessListEntry.findFirst.mockReset();
  prisma.accessListEntry.findUnique.mockReset();
  mockLoungeOff();
  prisma.accessListEntry.findFirst.mockResolvedValue(null);
  prisma.accessListEntry.findUnique.mockResolvedValue(null);
}

describe('isTeacherLoungeTemporarilyDisabledForUser', () => {
  beforeEach(resetMocks);

  test('disables Teacher\'s Lounge for arbitrary teacher emails', async () => {
    expect(
      await isTeacherLoungeTemporarilyDisabledForUser({
        email: 'other.teacher@example.com',
      })
    ).toBe(true);
  });

  test('disables when email is missing', async () => {
    expect(
      await isTeacherLoungeTemporarilyDisabledForUser({ email: null })
    ).toBe(true);
    expect(
      await isTeacherLoungeTemporarilyDisabledForUser({ email: undefined })
    ).toBe(true);
  });

  test('allows Montgomery GEAR UP teacher (case-insensitive)', async () => {
    for (const email of [
      SEEDED_ALLOWLIST_EMAILS[0],
      'Zestlan.Simmons@mps.k12.al.us',
    ]) {
      resetMocks();
      mockAllowlistEmail(email);
      expect(
        await isTeacherLoungeTemporarilyDisabledForUser({ email })
      ).toBe(false);
    }
  });

  test('allows Eric Miller (case-insensitive)', async () => {
    for (const email of [
      SEEDED_ALLOWLIST_EMAILS[1],
      'Eric@TheConnellSchool.com',
    ]) {
      resetMocks();
      mockAllowlistEmail(email);
      expect(
        await isTeacherLoungeTemporarilyDisabledForUser({ email })
      ).toBe(false);
    }
  });

  test('allows Chris Davis (case-insensitive)', async () => {
    for (const email of [
      SEEDED_ALLOWLIST_EMAILS[2],
      'ChrisTheWriter@Mail.com',
    ]) {
      resetMocks();
      mockAllowlistEmail(email);
      expect(
        await isTeacherLoungeTemporarilyDisabledForUser({ email })
      ).toBe(false);
    }
  });

  test('prefers userId on the access list over email', async () => {
    prisma.accessListEntry.findFirst.mockResolvedValue({ id: 'by-user' });
    expect(
      await isTeacherLoungeTemporarilyDisabledForUser({
        userId: 'user-1',
        email: 'other.teacher@example.com',
      })
    ).toBe(false);
    expect(prisma.accessListEntry.findUnique.mock.calls.length).toBe(0);
  });

  test('everyone mode enables Lounge for any teacher', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: serializeFeatureFlagValue({ mode: 'everyone', orgIds: [] }),
    });
    expect(
      await isTeacherLoungeTemporarilyDisabledForUser({
        email: 'other.teacher@example.com',
      })
    ).toBe(false);
  });
});

describe('redirectIfTeacherLoungeTemporarilyDisabled', () => {
  beforeEach(resetMocks);

  test('redirects non-allowlisted teachers to the dashboard', async () => {
    try {
      await redirectIfTeacherLoungeTemporarilyDisabled({
        email: 'other.teacher@example.com',
      });
      expect.unreachable('expected redirect');
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('Location')).toBe('/app');
    }
  });

  test('does not redirect allowlisted Montgomery teacher', async () => {
    mockAllowlistEmail(SEEDED_ALLOWLIST_EMAILS[0]);
    await expect(
      redirectIfTeacherLoungeTemporarilyDisabled({
        email: SEEDED_ALLOWLIST_EMAILS[0],
      })
    ).resolves.toBeUndefined();
  });
});
