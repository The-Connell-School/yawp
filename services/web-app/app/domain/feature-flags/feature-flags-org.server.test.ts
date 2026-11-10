import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { featureFlagPrismaTables } from './feature-flags.server.test-support';

const prisma = featureFlagPrismaTables();
mock.module('~/utils/db.server', () => ({ prisma }));

const {
  OrganizationFeatureFlagConflictError,
  enableFeatureFlagForOrganization,
  disableFeatureFlagForOrganization,
  releaseFeatureFlagToEveryone,
} = await import('./feature-flags-org.server');
const { LESSON_PLANNER_FLAG } = await import('./feature-flags');

const NAME = 'feature_flag.lesson_planner';

describe('organization feature flag helpers', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.adminConfigAudit.create.mockReset().mockResolvedValue({ id: 'audit-1' });
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.organization.findMany.mockReset();
  });

  test('enable adds a school to targeted rollout', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.setting.upsert.mockImplementation(async (args: { update: { value: string } }) => ({
      name: NAME,
      value: args.update.value,
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date('2026-10-07T16:00:00Z'),
    }));
    const result = await enableFeatureFlagForOrganization(
      LESSON_PLANNER_FLAG,
      'org-1',
      'ops@yawp.school'
    );
    expect(JSON.parse(prisma.setting.upsert.mock.calls[0]?.[0].update.value)).toEqual({
      mode: 'targeted',
      orgIds: ['org-1'],
    });
    expect(result.changed).toBe(true);
  });

  test('release sets everyone', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: '{"mode":"targeted","orgIds":["org-1"]}' });
    prisma.setting.upsert.mockImplementation(async (args: { update: { value: string } }) => ({
      name: NAME,
      value: args.update.value,
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date(),
    }));
    await releaseFeatureFlagToEveryone(LESSON_PLANNER_FLAG, 'ops@yawp.school');
    expect(JSON.parse(prisma.setting.upsert.mock.calls[0]?.[0].update.value)).toEqual({
      mode: 'everyone',
      orgIds: [],
    });
  });

  test('disable refuses when the flag is on for everyone', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"everyone","orgIds":[]}',
    });
    await expect(
      disableFeatureFlagForOrganization(
        LESSON_PLANNER_FLAG,
        'org-1',
        'ops@yawp.school'
      )
    ).rejects.toBeInstanceOf(OrganizationFeatureFlagConflictError);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('disable removes one school and turns off when empty', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"targeted","orgIds":["org-1","org-2"]}',
    });
    prisma.setting.upsert.mockImplementation(async (args: { update: { value: string } }) => ({
      name: NAME,
      value: args.update.value,
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date(),
    }));
    await disableFeatureFlagForOrganization(
      LESSON_PLANNER_FLAG,
      'org-1',
      'ops@yawp.school'
    );
    expect(JSON.parse(prisma.setting.upsert.mock.calls[0]?.[0].update.value)).toEqual({
      mode: 'targeted',
      orgIds: ['org-2'],
    });
  });
});
