import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentVersion: {
    deleteMany: mock(),
  },
  documentSnapshot: {
    deleteMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.domain.retention', () => {
  beforeEach(() => {
    process.env.INTERNAL_COMMAND_TOKEN = 'retention-token';
    prisma.documentVersion.deleteMany.mockReset();
    prisma.documentSnapshot.deleteMany.mockReset();
    prisma.documentVersion.deleteMany.mockResolvedValue({ count: 0 });
    prisma.documentSnapshot.deleteMany.mockResolvedValue({ count: 0 });
  });

  test('returns 401 when internal token is missing', async () => {
    const request = new Request('https://example.com/api/domain/retention', {
      method: 'POST',
    });

    const response = (await loader({ request } as any)) as Response;

    expect(response.status).toBe(401);
    expect(prisma.documentVersion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.documentSnapshot.deleteMany).not.toHaveBeenCalled();
  });

  test('cleans up versions without deleting snapshots', async () => {
    prisma.documentVersion.deleteMany.mockResolvedValue({ count: 9 });

    const request = new Request('https://example.com/api/domain/retention', {
      method: 'POST',
      headers: {
        'x-internal-token': 'retention-token',
      },
    });

    const response = (await loader({ request } as any)) as {
      data: { deletedVersions: number; deletedSnapshots: number };
    };

    expect(prisma.documentVersion.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.documentSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({
      deletedVersions: 9,
      deletedSnapshots: 0,
    });
  });
});
