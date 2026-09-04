import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const getLLMCompletion = mock();

mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));

const { action } = await import('./route');
const { gradingAssistantBenchmarkV1 } =
  await import('~/domain/ai-evaluation/grading-assistant-benchmark.v1');

describe('grading assistant benchmark action', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    getLLMCompletion.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    process.env.E2E = 'true';
  });

  test('runs a single benchmark case with the static thesis assistant', async () => {
    const benchmarkCase = gradingAssistantBenchmarkV1.cases[0];
    const formData = new FormData();
    formData.set('intent', 'runCase');
    formData.set('caseId', benchmarkCase.id);

    const response = await action({
      request: new Request(
        'https://example.test/api/domain/grading-assistant-benchmark',
        { method: 'POST', body: formData }
      ),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.success).toBe(true);
    expect((payload.caseResult as { caseId: string }).caseId).toBe(
      benchmarkCase.id
    );
    expect(getLLMCompletion).toHaveBeenCalledTimes(0);
  });

  test('rejects runCase without a case id', async () => {
    const formData = new FormData();
    formData.set('intent', 'runCase');

    const response = await action({
      request: new Request(
        'https://example.test/api/domain/grading-assistant-benchmark',
        { method: 'POST', body: formData }
      ),
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(400);
  });
});
