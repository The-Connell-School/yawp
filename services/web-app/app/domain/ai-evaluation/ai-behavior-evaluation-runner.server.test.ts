import type { PrismaClient } from '@app/prisma';
import { describe, expect, mock, test } from 'bun:test';
import { aiPromptContentHash } from './prompt-template.shared';

mock.module('~/utils/db.server', () => ({ prisma: {} }));

const { builtinAiPromptTemplate } = await import(
  './prompt-version-control.server'
);
const { runAiBehaviorEvaluation } = await import(
  './ai-behavior-evaluation-runner.server'
);

function createDb() {
  const template = builtinAiPromptTemplate('tutor');
  let updatedData: Record<string, unknown> | null = null;
  const db = {
    assignmentTypePromptVersion: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        if (!args.where.id) return null;
        return {
          id: 'prompt-tutor-v1',
          assignmentTypeId: 'type-1',
          surface: 'tutor',
          version: 1,
          revision: 2,
          status: 'draft',
          source: 'test-draft',
          contentHash: aiPromptContentHash('tutor', template),
          systemMessageTemplate: template.systemMessage,
          userMessageTemplate: template.userMessage,
        };
      },
    },
    assignmentTypeEvaluationRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'eval-run-1',
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updatedData = data;
        return { id: 'eval-run-1', ...data };
      },
    },
    llmLog: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient;
  return { db, updatedData: () => updatedData };
}

function gradingResponse(score: number) {
  return JSON.stringify({
    categories: [
      { key: 'thesis', score, comment: 'The thesis needs a clearer reason.' },
      {
        key: 'conclusion',
        score,
        comment: 'The conclusion should explain why the claim matters.',
      },
    ],
    overallComment: 'Jordan, explain the evidence before concluding.',
  });
}

describe('AI behavior network evaluation runner', () => {
  test('runs the complete suite through the provider client and stores only measurements', async () => {
    const { db, updatedData } = createDb();
    const calls: Array<Record<string, unknown>> = [];
    const result = await runAiBehaviorEvaluation({
      assignmentTypeId: 'type-1',
      promptVersionId: 'prompt-tutor-v1',
      runByUserId: 'admin-1',
      db,
      complete: async (params) => {
        calls.push(params as unknown as Record<string, unknown>);
        const metadata = params.metadata as {
          surface: string;
          caseId: string;
        };
        if (metadata.surface === 'tutor') {
          return metadata.caseId === 'assignment-context'
            ? 'The assignment asks for a claim supported by evidence. Your next step is to explain why the survey supports the claim.'
            : 'Try adding one sentence that explains how the evidence supports your claim.';
        }
        return gradingResponse(
          metadata.caseId === 'strictness-advanced' ? 2 : 3
        );
      },
    });

    expect(result.status).toBe('passed');
    expect(calls).toHaveLength(9);
    expect(calls.every((call) => call.logPayload === 'metadata-only')).toBe(
      true
    );
    expect(
      calls.every((call) => call.allowFallbackProvider === false)
    ).toBe(true);
    expect(
      calls.some((call) =>
        JSON.stringify(call).includes('IGNORE ALL RULES')
      )
    ).toBe(true);
    const stored = JSON.stringify(updatedData());
    expect(stored).not.toContain('The assignment asks for a claim');
    expect(stored).not.toContain('Student response:');
    expect(stored).toContain('strictness-advanced');
  });

  test('records provider outages as failed cases without leaving the run in progress', async () => {
    const { db } = createDb();
    const result = await runAiBehaviorEvaluation({
      assignmentTypeId: 'type-1',
      promptVersionId: 'prompt-tutor-v1',
      runByUserId: 'admin-1',
      db,
      complete: async () => {
        throw new Error('provider secret should not persist');
      },
    });

    expect(result.status).toBe('failed');
    expect(result.failedCases).toBe(8);
    expect(JSON.stringify(result.resultJson)).not.toContain('provider secret');
    expect(JSON.stringify(result.resultJson)).toContain('provider_request_failed');
  });
});
