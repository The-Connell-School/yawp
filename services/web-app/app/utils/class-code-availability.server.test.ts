import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(async () => ({ value: JSON.stringify({ mode: 'everyone' }) })),
  },
  class: {
    findMany: mock(async () => []),
  },
};

const { getClassCodeAvailability } = await import('./class-code-availability.server');

describe('getClassCodeAvailability', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.class.findMany.mockReset();
    prisma.setting.findUnique.mockResolvedValue({
      value: JSON.stringify({ mode: 'everyone' }),
    });
  });

  test('returns disabled when uniqueness flag is off', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: JSON.stringify({ mode: 'off' }),
    });
    const result = await getClassCodeAvailability(prisma as any, 'ABC123');
    expect(result).toEqual({ enforcementEnabled: false });
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  test('treats blank input as available without querying conflicts', async () => {
    const result = await getClassCodeAvailability(prisma as any, '   ');
    expect(result).toEqual({
      enforcementEnabled: true,
      available: true,
      normalizedCode: '',
    });
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  test('marks a taken code unavailable', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', code: 'taken1' },
    ] as { id: string; code: string }[]);
    const result = await getClassCodeAvailability(prisma as any, 'taken1');
    expect(result).toEqual({
      enforcementEnabled: true,
      available: false,
      normalizedCode: 'TAKEN1',
    });
  });

  test('allows the current class to keep its own code when editing', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', code: 'mine12' },
    ] as { id: string; code: string }[]);
    const result = await getClassCodeAvailability(prisma as any, 'mine12', {
      excludeClassId: 'class-1',
    });
    expect(result).toEqual({
      enforcementEnabled: true,
      available: true,
      normalizedCode: 'MINE12',
    });
  });
});
