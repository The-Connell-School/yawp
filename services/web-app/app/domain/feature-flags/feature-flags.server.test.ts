import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
    findMany: mock(),
    upsert: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isFeatureFlagEnabled,
  isDailyPagesWritingConditionsEnabled,
  listFeatureFlags,
  setFeatureFlag,
} = await import('./feature-flags.server');
const { DAILY_PAGES_WRITING_CONDITIONS_FLAG } = await import('./feature-flags');

const NAME = 'feature_flag.daily_pages_paragraph_type_and_writing_time';

describe('feature flags (server)', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.findMany.mockReset();
    prisma.setting.upsert.mockReset();
  });

  test('defaults off when no row exists', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    expect(await isFeatureFlagEnabled(DAILY_PAGES_WRITING_CONDITIONS_FLAG)).toBe(false);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({
      where: { name: NAME },
      select: { value: true },
    });
  });

  test('reads on from the stored row', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await isDailyPagesWritingConditionsEnabled()).toBe(true);
  });

  test('reads off from the stored row', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'false' });
    expect(await isDailyPagesWritingConditionsEnabled()).toBe(false);
  });

  test('fails closed (off) when the database read fails', async () => {
    prisma.setting.findUnique.mockRejectedValue(new Error('db down'));
    const error = console.error;
    console.error = () => {};
    try {
      expect(await isDailyPagesWritingConditionsEnabled()).toBe(false);
    } finally {
      console.error = error;
    }
  });

  test('lists every registered flag, off when it has no row', async () => {
    prisma.setting.findMany.mockResolvedValue([]);
    const flags = await listFeatureFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      key: DAILY_PAGES_WRITING_CONDITIONS_FLAG,
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
      enabled: true,
      updatedAt: updatedAt.toISOString(),
      lastChangedBy: 'ops@yawp.school',
    });
  });

  test('turning a flag on upserts its row and records the operator', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    const updatedAt = new Date('2026-10-07T16:00:00Z');
    prisma.setting.upsert.mockResolvedValue({
      name: NAME,
      value: 'true',
      description: 'Last changed by ops@yawp.school',
      updatedAt,
    });

    const result = await setFeatureFlag(
      DAILY_PAGES_WRITING_CONDITIONS_FLAG,
      true,
      'ops@yawp.school'
    );

    const args = prisma.setting.upsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ name: NAME });
    expect(args.create).toMatchObject({
      name: NAME,
      value: 'true',
      valueType: 'boolean',
      description: 'Last changed by ops@yawp.school',
    });
    expect(args.update).toMatchObject({
      value: 'true',
      description: 'Last changed by ops@yawp.school',
    });
    expect(args.update.updatedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({
      previousEnabled: false,
      changed: true,
      flag: { key: DAILY_PAGES_WRITING_CONDITIONS_FLAG, enabled: true },
    });
  });

  test('setting a flag to its current state is reported as unchanged', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'false' });
    prisma.setting.upsert.mockResolvedValue({
      name: NAME,
      value: 'false',
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date(),
    });
    const result = await setFeatureFlag(
      DAILY_PAGES_WRITING_CONDITIONS_FLAG,
      false,
      'ops@yawp.school'
    );
    expect(result.changed).toBe(false);
    expect(result.flag.enabled).toBe(false);
  });
});
