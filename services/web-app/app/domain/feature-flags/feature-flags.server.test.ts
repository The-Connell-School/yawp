import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
    findMany: mock(),
    upsert: mock(),
  },
  organization: {
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isFeatureFlagEnabled,
  isDailyPagesWritingConditionsEnabled,
  isLessonPlannerEnabled,
  listFeatureFlags,
  setFeatureFlag,
  findUnknownOrganizationIds,
} = await import('./feature-flags.server');
const {
  DAILY_PAGES_WRITING_CONDITIONS_FLAG,
  LESSON_PLANNER_FLAG,
} = await import('./feature-flags');

const NAME = 'feature_flag.daily_pages_paragraph_type_and_writing_time';

describe('feature flags (server)', () => {
  beforeEach(() => {
    // Other suites mock db.server in the same process; take it back.
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.setting.findUnique.mockReset();
    prisma.setting.findMany.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.organization.findMany.mockReset();
  });

  test('defaults off when no row exists', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    expect(await isFeatureFlagEnabled(DAILY_PAGES_WRITING_CONDITIONS_FLAG)).toBe(false);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({
      where: { name: NAME },
      select: { value: true },
    });
  });

  test('legacy "true" is on for every school, and with no school', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await isDailyPagesWritingConditionsEnabled('org-1')).toBe(true);
    expect(await isLessonPlannerEnabled('org-1')).toBe(true);
    expect(await isLessonPlannerEnabled(null)).toBe(true);
    expect(await isFeatureFlagEnabled(LESSON_PLANNER_FLAG)).toBe(true);
  });

  test('legacy "false" is off', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'false' });
    expect(await isDailyPagesWritingConditionsEnabled('org-1')).toBe(false);
  });

  test('everyone is on for every school', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"everyone","orgIds":[]}',
    });
    expect(await isLessonPlannerEnabled('org-9')).toBe(true);
    expect(await isLessonPlannerEnabled(null)).toBe(true);
  });

  test('off is off for every school', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"off","orgIds":["org-1"]}',
    });
    expect(await isLessonPlannerEnabled('org-1')).toBe(false);
  });

  test('targeted is on only for the listed schools', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"targeted","orgIds":["org-1","org-2"]}',
    });
    expect(await isFeatureFlagEnabled(LESSON_PLANNER_FLAG, 'org-1')).toBe(true);
    expect(await isDailyPagesWritingConditionsEnabled('org-2')).toBe(true);
    expect(await isLessonPlannerEnabled('org-3')).toBe(false);
    expect(await isLessonPlannerEnabled(null)).toBe(false);
    expect(await isFeatureFlagEnabled(LESSON_PLANNER_FLAG)).toBe(false);
  });

  test('reads the row fresh on every call, so a toggle applies at once', async () => {
    prisma.setting.findUnique.mockResolvedValueOnce({ value: 'false' });
    expect(await isLessonPlannerEnabled('org-1')).toBe(false);
    prisma.setting.findUnique.mockResolvedValueOnce({
      value: '{"mode":"targeted","orgIds":["org-1"]}',
    });
    expect(await isLessonPlannerEnabled('org-1')).toBe(true);
    expect(prisma.setting.findUnique).toHaveBeenCalledTimes(2);
  });

  test('fails closed (off) when the database read fails', async () => {
    prisma.setting.findUnique.mockRejectedValue(new Error('db down'));
    const error = console.error;
    console.error = () => {};
    try {
      expect(await isDailyPagesWritingConditionsEnabled('org-1')).toBe(false);
    } finally {
      console.error = error;
    }
  });

  test('lists every registered flag, off when it has no row', async () => {
    prisma.setting.findMany.mockResolvedValue([]);
    const flags = await listFeatureFlags();
    expect(flags).toHaveLength(2);
    expect(flags[0]).toMatchObject({
      key: DAILY_PAGES_WRITING_CONDITIONS_FLAG,
      mode: 'off',
      orgIds: [],
      enabled: false,
      updatedAt: null,
      lastChangedBy: null,
    });
    expect(flags[0].label.length).toBeGreaterThan(0);
  });

  test('lists the stored state and who last changed it', async () => {
    const updatedAt = new Date('2026-10-07T16:00:00Z');
    prisma.setting.findMany.mockResolvedValue([
      { name: NAME, value: 'true', description: 'Last changed by ops@yawp.school', updatedAt },
    ]);
    const [flag] = await listFeatureFlags();
    expect(flag).toMatchObject({
      mode: 'everyone',
      orgIds: [],
      enabled: true,
      updatedAt: updatedAt.toISOString(),
      lastChangedBy: 'ops@yawp.school',
    });
  });

  test('lists a targeted flag with its schools; enabled is false for legacy readers', async () => {
    prisma.setting.findMany.mockResolvedValue([
      {
        name: NAME,
        value: '{"mode":"targeted","orgIds":["org-1"]}',
        description: 'Last changed by ops@yawp.school',
        updatedAt: new Date('2026-10-07T16:00:00Z'),
      },
    ]);
    const [flag] = await listFeatureFlags();
    expect(flag).toMatchObject({ mode: 'targeted', orgIds: ['org-1'], enabled: false });
  });

  test('turning a flag on for everyone upserts its row as JSON and records the operator', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    const updatedAt = new Date('2026-10-07T16:00:00Z');
    const stored = '{"mode":"everyone","orgIds":[]}';
    prisma.setting.upsert.mockResolvedValue({
      name: NAME,
      value: stored,
      description: 'Last changed by ops@yawp.school',
      updatedAt,
    });

    const result = await setFeatureFlag(
      DAILY_PAGES_WRITING_CONDITIONS_FLAG,
      { mode: 'everyone', orgIds: [] },
      'ops@yawp.school'
    );

    const args = prisma.setting.upsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ name: NAME });
    expect(JSON.parse(args.create.value)).toEqual({ mode: 'everyone', orgIds: [] });
    expect(args.create).toMatchObject({
      name: NAME,
      valueType: 'json',
      description: 'Last changed by ops@yawp.school',
    });
    expect(JSON.parse(args.update.value)).toEqual({ mode: 'everyone', orgIds: [] });
    expect(args.update.description).toBe('Last changed by ops@yawp.school');
    expect(args.update.updatedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({
      previous: { mode: 'off', orgIds: [] },
      changed: true,
      flag: {
        key: DAILY_PAGES_WRITING_CONDITIONS_FLAG,
        mode: 'everyone',
        orgIds: [],
        enabled: true,
      },
    });
  });

  test('targets a flag at schools, deduped, and reports the previous value', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'true' });
    prisma.setting.upsert.mockImplementation(async (args: { update: { value: string } }) => ({
      name: NAME,
      value: args.update.value,
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date(),
    }));
    const result = await setFeatureFlag(
      LESSON_PLANNER_FLAG,
      { mode: 'targeted', orgIds: ['org-1', 'org-2', 'org-1'] },
      'ops@yawp.school'
    );
    expect(JSON.parse(prisma.setting.upsert.mock.calls[0]?.[0].update.value)).toEqual({
      mode: 'targeted',
      orgIds: ['org-1', 'org-2'],
    });
    expect(result).toMatchObject({
      previous: { mode: 'everyone', orgIds: [] },
      changed: true,
      flag: { mode: 'targeted', orgIds: ['org-1', 'org-2'], enabled: false },
    });
  });

  test('the same schools in another order are reported as unchanged', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"targeted","orgIds":["org-2","org-1"]}',
    });
    prisma.setting.upsert.mockImplementation(async (args: { update: { value: string } }) => ({
      name: NAME,
      value: args.update.value,
      description: null,
      updatedAt: new Date(),
    }));
    const result = await setFeatureFlag(
      LESSON_PLANNER_FLAG,
      { mode: 'targeted', orgIds: ['org-1', 'org-2'] },
      'ops@yawp.school'
    );
    expect(result.changed).toBe(false);
  });

  test('setting a flag to its current state is reported as unchanged', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'false' });
    prisma.setting.upsert.mockResolvedValue({
      name: NAME,
      value: '{"mode":"off","orgIds":[]}',
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date(),
    });
    const result = await setFeatureFlag(
      DAILY_PAGES_WRITING_CONDITIONS_FLAG,
      { mode: 'off', orgIds: [] },
      'ops@yawp.school'
    );
    expect(result.changed).toBe(false);
    expect(result.flag.enabled).toBe(false);
    expect(result.flag.mode).toBe('off');
  });

  test('finds organizations that do not exist with one query', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    expect(await findUnknownOrganizationIds(['org-1', 'org-404'])).toEqual(['org-404']);
    expect(prisma.organization.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1', 'org-404'] } },
      select: { id: true },
    });
    expect(await findUnknownOrganizationIds([])).toEqual([]);
    expect(prisma.organization.findMany).toHaveBeenCalledTimes(1);
  });
});
