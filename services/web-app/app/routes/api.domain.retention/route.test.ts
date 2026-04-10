import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentRevision: {
    deleteMany: mock(),
  },
  documentWriteJournal: {
    deleteMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.domain.retention', () => {
  beforeEach(() => {
    process.env.INTERNAL_COMMAND_TOKEN = 'retention-token';
    prisma.documentRevision.deleteMany.mockReset();
    prisma.documentWriteJournal.deleteMany.mockReset();
    prisma.documentRevision.deleteMany.mockResolvedValue({ count: 0 });
    prisma.documentWriteJournal.deleteMany.mockResolvedValue({ count: 0 });
  });

  test('returns 401 when internal token is missing', async () => {
    const request = new Request('https://example.com/api/domain/retention', {
      method: 'POST',
    });

    const response = (await loader({ request } as any)) as Response;

    expect(response.status).toBe(401);
    expect(prisma.documentRevision.deleteMany).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.deleteMany).not.toHaveBeenCalled();
  });

  test('cleans up versions and write journals', async () => {
    prisma.documentRevision.deleteMany.mockResolvedValue({ count: 9 });
    prisma.documentWriteJournal.deleteMany.mockResolvedValue({ count: 2 });

    const startedAt = Date.now();

    const request = new Request('https://example.com/api/domain/retention', {
      method: 'POST',
      headers: {
        'x-internal-token': 'retention-token',
      },
    });

    const response = (await loader({ request } as any)) as {
      data: { deletedVersions: number; deletedSnapshots: number };
    };

    expect(prisma.documentRevision.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.deleteMany).toHaveBeenCalledTimes(1);

    const journalCutoff =
      prisma.documentWriteJournal.deleteMany.mock.calls[0]?.[0]?.where?.createdAt
        ?.lt;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    expect(journalCutoff).toBeInstanceOf(Date);
    expect(
      Math.abs((journalCutoff as Date).getTime() - (startedAt - threeDaysMs))
    ).toBeLessThan(10_000);

    expect(response.data).toMatchObject({
      deletedVersions: 9,
      deletedSnapshots: 0,
      deletedDocumentWriteJournals: 2,
    });
  });
});
