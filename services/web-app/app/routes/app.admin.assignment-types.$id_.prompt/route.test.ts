import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
  },
};

const requireAdmin = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/auth.server.js', () => ({ requireAdmin }));

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

describe('admin assignment type prompt loader', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('loads the assignment context and serialized evaluation history', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis-driven essay',
      evaluations: [
        {
          id: 'evaluation-1',
          title: 'Positive greeting',
          description: 'Begin with an encouraging acknowledgment.',
          position: 0,
          archivedAt: null,
          createdAt: new Date('2026-07-13T16:00:00.000Z'),
        },
      ],
      evaluationCases: [
        {
          id: 'case-1',
          evaluationId: 'evaluation-1',
          title: 'Clear claim',
          rubricCategoryKey: 'thesis',
          documentText: 'School uniforms should remain optional.',
          criterion: 'The feedback identifies the claim.',
          expectedOutputJson: { overallComment: 'Jordan, strong start.' },
          position: 0,
          archivedAt: null,
          createdAt: new Date('2026-07-13T17:00:00.000Z'),
        },
      ],
      evaluationRuns: [
        {
          id: 'run-1',
          promptVersion: 4,
          status: 'completed',
          totalCases: 1,
          passedCases: 1,
          failedCases: 0,
          needsReviewCases: 0,
          promptSnapshotJson: {
            compiledPrompt: { system: 'Prompt v4', userMessage: 'Grade it.' },
          },
          createdAt: new Date('2026-07-13T18:00:00.000Z'),
          completedAt: new Date('2026-07-13T18:00:05.000Z'),
          results: [
            {
              id: 'result-1',
              caseId: 'case-1',
              caseTitle: 'Clear claim',
              rubricCategoryKey: 'thesis',
              criterion: 'The feedback identifies the claim.',
              status: 'pass',
              evidence: 'The response identifies the claim.',
              gradingOutputJson: { overallComment: 'Jordan, strong start.' },
              expectedOutputJson: { overallComment: 'Jordan, strong start.' },
            },
          ],
        },
      ],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/prompt'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(data.assignmentType).toEqual({
      id: 'at-1',
      title: 'Thesis-driven essay',
    });
    expect(data.evaluationHistory.evaluations).toEqual([
      expect.objectContaining({
        id: 'evaluation-1',
        title: 'Positive greeting',
        archived: false,
      }),
    ]);
    expect(data.evaluationHistory.cases).toEqual([
      expect.objectContaining({
        id: 'case-1',
        evaluationId: 'evaluation-1',
        expectedOutput: { overallComment: 'Jordan, strong start.' },
      }),
    ]);
    expect(data.evaluationHistory.runs).toEqual([
      expect.objectContaining({
        id: 'run-1',
        promptVersion: 4,
        passedCases: 1,
        results: [
          expect.objectContaining({
            caseId: 'case-1',
            status: 'pass',
          }),
        ],
      }),
    ]);
  });

  test('returns not found when the assignment type does not exist', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/missing/prompt'
        ),
        params: { id: 'missing' },
        context: {} as never,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
