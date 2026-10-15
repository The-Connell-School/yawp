import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { isFreeTierEnabled } = await import('./feature-flags.server');

describe('isFreeTierEnabled', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.setting.findUnique.mockReset();
  });

  test('is on only for everyone', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"targeted","orgIds":["org-1"]}',
    });
    expect(await isFreeTierEnabled()).toBe(false);
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"everyone","orgIds":[]}',
    });
    expect(await isFreeTierEnabled()).toBe(true);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({
      where: { name: 'feature_flag.free_tier' },
      select: { value: true },
    });
  });
});

test('status checks can propagate read failures while existing callers still fail closed', async () => {
  const failure = new Error('fixture read failed');
  prisma.setting.findUnique.mockRejectedValue(failure);
  expect(await isFreeTierEnabled()).toBe(false);
  await expect(isFreeTierEnabled({ throwOnError: true })).rejects.toBe(failure);
});
