import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { featureFlagPrismaTables } from '~/domain/feature-flags/feature-flags.server.test-support';

const prisma = featureFlagPrismaTables();

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isTeacherPromptGeneratorEnabled,
  teacherPromptGeneratorDisabledResponse,
} = await import('./gate.server');

const FLAG_NAME = 'feature_flag.teacher-prompt-generator';

describe('teacher prompt generator gate', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.setting.findUnique.mockReset();
  });

  test('is off on production without a Setting row', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    prisma.setting.findUnique.mockResolvedValue(null);
    expect(await isTeacherPromptGeneratorEnabled('org-1')).toBe(false);
  });

  test('is on on demo without a Setting row', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    prisma.setting.findUnique.mockResolvedValue(null);
    expect(await isTeacherPromptGeneratorEnabled('org-1')).toBe(true);
  });

  test('disabled response is null when enabled', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    prisma.setting.findUnique.mockResolvedValue(null);
    expect(await teacherPromptGeneratorDisabledResponse('org-1')).toBeNull();
  });

  test('disabled response is 404 when off on production', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    prisma.setting.findUnique.mockResolvedValue(null);
    const response = await teacherPromptGeneratorDisabledResponse('org-1');
    expect(response).not.toBeNull();
    const status =
      (response as { init?: { status?: number } }).init?.status ??
      (response as Response).status;
    expect(status).toBe(404);
  });

  test('honors everyone mode on production when Bryant flips the flag', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    prisma.setting.findUnique.mockImplementation(({ where }: { where: { name: string } }) =>
      where.name === FLAG_NAME
        ? Promise.resolve({ value: '{"mode":"everyone","orgIds":[]}' })
        : Promise.resolve(null)
    );
    expect(await isTeacherPromptGeneratorEnabled('org-1')).toBe(true);
  });
});
