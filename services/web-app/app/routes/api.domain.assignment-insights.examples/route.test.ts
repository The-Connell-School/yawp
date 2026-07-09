import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  document: { findMany: mock() },
};

const getGradingActor = mock();
const canManageGrades = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));

const { loader } = await import('./route');

function getRequest(params: Record<string, string>) {
  const url = new URL('https://example.com/api/domain/assignment-insights/examples');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url, { method: 'GET' });
}

function payloadOf(response: unknown) {
  return response as {
    data: { examples: Array<{ snippet: string; score: number }>; message?: string };
    init?: { status?: number };
  };
}

const ACTOR = { membershipId: 'm-1', isAdmin: false };

describe('api.domain.assignment-insights.examples', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    prisma.document.findMany.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    getGradingActor.mockResolvedValue(ACTOR);
    canManageGrades.mockReturnValue(true);
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);
    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );
    expect(response.init?.status).toBe(403);
    expect(response.data.examples).toEqual([]);
  });

  test('rejects an unknown rubric category', async () => {
    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'not_a_category',
          status: 'gap',
        }),
      } as never)
    );
    expect(response.init?.status).toBe(400);
  });

  test('404s when the class assignment is not owned by the teacher', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );
    expect(response.init?.status).toBe(404);
  });

  test('returns the lowest-scoring snippets for a gap category', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'd-strong',
        submissions: [
          {
            id: 's-strong',
            text: 'A precise, well-integrated analysis of the quotation.',
            html: null,
            rubricScores: { evidence_and_support: 5 },
          },
        ],
      },
      {
        id: 'd-weak',
        submissions: [
          {
            id: 's-weak',
            text: 'The quote is just dropped in with no explanation at all.',
            html: null,
            rubricScores: { evidence_and_support: 2 },
          },
        ],
      },
      {
        id: 'd-unscored',
        submissions: [
          {
            id: 's-unscored',
            text: 'No rubric score on the category here.',
            html: null,
            rubricScores: { thesis_and_content: 4 },
          },
        ],
      },
    ]);

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'evidence_and_support',
          status: 'gap',
        }),
      } as never)
    );

    expect(response.init?.status ?? 200).toBe(200);
    // Only the two scored submissions appear, weakest first for a gap.
    expect(response.data.examples).toHaveLength(2);
    expect(response.data.examples[0].score).toBe(2);
    expect(response.data.examples[0].snippet).toContain('dropped in');
    expect(response.data.examples[1].score).toBe(5);
  });

  test('reads the nested rubric-score shape and strips html', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'd-1',
        submissions: [
          {
            id: 's-1',
            text: '',
            html: '<p>Rich <em>markup</em> student text.</p>',
            rubricScores: { thesis_and_content: { score: 5, comment: 'Great' } },
          },
        ],
      },
    ]);

    const response = payloadOf(
      await loader({
        request: getRequest({
          classAssignmentId: 'ca-1',
          category: 'thesis_and_content',
          status: 'strength',
        }),
      } as never)
    );

    expect(response.data.examples).toHaveLength(1);
    expect(response.data.examples[0].score).toBe(5);
    expect(response.data.examples[0].snippet).toBe('Rich markup student text.');
  });
});
