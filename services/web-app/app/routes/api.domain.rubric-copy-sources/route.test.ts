import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findMany: mock(),
  },
};
const requireAdmin = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));

const { loader } = await import('./route');

async function readBody(response: unknown) {
  const typed = response as { json?: () => Promise<unknown>; data?: unknown };
  return typeof typed.json === 'function' ? typed.json() : typed.data;
}

describe('api.domain.rubric-copy-sources', () => {
  beforeEach(() => {
    prisma.assignmentType.findMany.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('returns copyable rubric sources for admins', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([
      {
        id: 'at-1',
        title: 'ACT Writing',
        scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
        rubricJson: {
          categories: [
            { key: 'thesis', label: 'Thesis', weight: 1, description: 'Strong claim.' },
          ],
        },
      },
    ]);

    const response = await loader({
      request: new Request(
        'https://example.test/api/domain/rubric-copy-sources?excludeId=at-2'
      ),
      params: {},
      context: {} as never,
    } as any);

    const body = (await readBody(response)) as {
      success: boolean;
      sources: Array<{ id: string; title: string }>;
    };

    expect(body.success).toBe(true);
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]?.title).toBe('ACT Writing');
    expect(prisma.assignmentType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          id: { not: 'at-2' },
        }),
      })
    );
  });
});
