import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { User: 'user', Assistant: 'assistant' },
  getLLMCompletion,
}));

const { buildSeedContentPrompt, fillSeedSubmissionContent } =
  await import('./seed-generator-content.server');

const input = {
  organizationId: 'org-1',
  organizationName: 'Acme High',
  assignment: {
    title: 'Civic essay',
    prompt: 'Write about civic responsibility.',
  },
  student: { name: 'Maya R.', writingProfile: 'struggling' as const },
  submission: { localId: 'submission-1', status: 'submitted' as const },
};

describe('seed submission content fill', () => {
  beforeEach(() => getLLMCompletion.mockReset());

  test('builds a one-submission prompt grounded in the related nodes', () => {
    const prompt = buildSeedContentPrompt(input);
    expect(prompt).toContain('Maya R.');
    expect(prompt).toContain('struggling');
    expect(prompt).toContain('Civic essay');
    expect(prompt).toContain('submitted');
    expect(prompt).toMatch(/exactly one/i);
  });

  test('uses metadata-only logging, a deadline, and captures one valid fill', async () => {
    getLLMCompletion.mockImplementation(async (params: any) => {
      await params.handleToolCall('fill_seed_submission', {
        status: 'submitted',
        essayText: 'A complete student essay.',
      });
      return 'done';
    });

    const result = await fillSeedSubmissionContent(input);
    expect(result).toEqual({
      content: {
        status: 'submitted',
        essayText: 'A complete student essay.',
      },
    });
    expect(getLLMCompletion.mock.calls[0]?.[0]).toMatchObject({
      logPayload: 'metadata-only',
      allowFallbackProvider: false,
      maxToolRounds: 2,
    });
    expect(getLLMCompletion.mock.calls[0]?.[0].signal).toBeInstanceOf(
      AbortSignal
    );
  });

  test('returns unparseable when the provider omits or mismatches tool output', async () => {
    getLLMCompletion.mockResolvedValue('no tool');
    expect(await fillSeedSubmissionContent(input)).toMatchObject({
      type: 'unparseable',
    });

    getLLMCompletion.mockImplementation(async (params: any) => {
      await params.handleToolCall('fill_seed_submission', {
        status: 'draft',
        essayText: 'Wrong workflow state.',
      });
      return 'done';
    });
    expect(await fillSeedSubmissionContent(input)).toMatchObject({
      type: 'unparseable',
    });
  });

  test('returns transient for a provider timeout', async () => {
    getLLMCompletion.mockRejectedValue(
      Object.assign(new Error('request timed out'), { name: 'AbortError' })
    );
    expect(await fillSeedSubmissionContent(input)).toMatchObject({
      type: 'transient',
    });
  });
});
