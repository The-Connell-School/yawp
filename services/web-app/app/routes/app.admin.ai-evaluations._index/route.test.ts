import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
}));

const { loader } = await import('./route');
const { gradingAssistantBenchmarkV1 } =
  await import('~/domain/ai-evaluation/grading-assistant-benchmark.v1');

describe('admin ai-evaluations loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('requires admin and returns the benchmark suite with review counts', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/admin/ai-evaluations'),
      params: {},
    } as any);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    const data = (
      response as {
        data: {
          suite: typeof gradingAssistantBenchmarkV1;
          draftCaseCount: number;
          approvedCaseCount: number;
          releaseBlocked: boolean;
        };
      }
    ).data;

    expect(data.suite).toEqual(gradingAssistantBenchmarkV1);
    expect(data.suite.cases).toHaveLength(15);
    expect(data.suite.evaluations).toHaveLength(9);
    expect(data.draftCaseCount).toBe(15);
    expect(data.approvedCaseCount).toBe(0);
    expect(data.releaseBlocked).toBe(true);
  });
});
