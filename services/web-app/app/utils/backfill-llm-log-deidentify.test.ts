import { describe, expect, mock, test } from 'bun:test';
import {
  backfillLlmLogDeidentification,
  parseBackfillArgs,
  type BackfillPrisma,
} from '../../scripts/backfill-llm-log-deidentify-lib';

describe('LlmLog de-identification backfill', () => {
  test('defaults to dry-run and requires snapshot confirmation for production apply', () => {
    expect(parseBackfillArgs([])).toMatchObject({
      dryRun: true,
      environment: 'demo',
      batchSize: 500,
    });
    expect(() =>
      parseBackfillArgs(['--apply', '--environment', 'production'], {})
    ).toThrow('production RDS snapshot');
    expect(
      parseBackfillArgs(['--apply', '--environment', 'production'], {
        LLMLOG_BACKFILL_SNAPSHOT_CONFIRMED: 'true',
      })
    ).toMatchObject({
      dryRun: false,
      environment: 'production',
      snapshotConfirmed: true,
    });
  });

  test('dry-run counts changed rows without updating or logging sensitive content', async () => {
    const updates: unknown[] = [];
    const logs: string[] = [];
    const prisma: BackfillPrisma = {
      llmLog: {
        findMany: mock(async () => [
          {
            id: 'log-1',
            model: 'claude-sonnet-4-6',
            provider: 'anthropic',
            systemPrompt:
              'Help Jane Student for membership mem-1 and organization org-1.',
            messages: [{ role: 'user', content: 'Jane email jane@example.edu' }],
            response: 'Jane should revise request req-1.',
            error: 'Failed for user cyyyyyyyyyyyyyyyyyyyy',
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            durationMs: 4,
            metadata: {
              route: 'routes/test',
              studentName: 'Jane Student',
              organizationId: 'org-1',
              membershipId: 'mem-1',
              requestId: 'req-1',
              userId: 'cyyyyyyyyyyyyyyyyyyyy',
              fileName: 'Jane Student essay.pdf',
            },
          },
          {
            id: 'log-2',
            model: 'claude-sonnet-4-6',
            provider: 'anthropic',
            systemPrompt: 'Extract text from the uploaded file.',
            messages: [
              {
                role: 'user',
                fileName: 'Alex Author draft.pdf',
                content: 'Please extract Alex Author draft.pdf',
              },
            ],
            response: 'Extracted text from Alex Author draft.pdf',
            error: null,
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            durationMs: 4,
            metadata: {
              route: 'routes/test',
              fileName: 'Alex Author draft.pdf',
            },
          },
        ]),
        update: mock(async (args) => {
          updates.push(args);
        }),
      },
    };

    const summary = await backfillLlmLogDeidentification({
      prisma,
      options: {
        dryRun: true,
        batchSize: 10,
        environment: 'demo',
        snapshotConfirmed: false,
      },
      log: (message) => logs.push(message),
    });

    expect(summary).toEqual({
      scanned: 2,
      skipped: 0,
      changed: 2,
      textChanged: 2,
      updated: 0,
      batches: 1,
      dryRun: true,
    });
    expect(updates).toEqual([]);
    expect(logs.join('\n')).not.toContain('Jane');
    expect(logs.join('\n')).not.toContain('jane@example.edu');
    expect(logs.join('\n')).not.toContain('org-1');
    expect(logs.join('\n')).not.toContain('mem-1');
    expect(logs.join('\n')).not.toContain('req-1');
    expect(logs.join('\n')).not.toContain('cyyyyyyyyyyyyyyyyyyyy');
    expect(logs.join('\n')).not.toContain('Jane Student essay.pdf');
    expect(logs.join('\n')).not.toContain('Alex Author draft.pdf');
  });

  test('dry-run counts text changes when only ipHash appears in text and metadata', async () => {
    const ipHash =
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const prisma: BackfillPrisma = {
      llmLog: {
        findMany: mock(async () => [
          {
            id: 'log-ip-hash',
            model: 'claude-sonnet-4-6',
            provider: 'anthropic',
            systemPrompt: `Use attribution ${ipHash}.`,
            messages: [{ role: 'user', content: `Request hash ${ipHash}` }],
            response: `Response hash ${ipHash}`,
            error: null,
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            durationMs: 4,
            metadata: {
              route: 'routes/test',
              ipHash,
            },
          },
        ]),
        update: mock(async () => {
          throw new Error('dry-run must not update rows');
        }),
      },
    };

    const summary = await backfillLlmLogDeidentification({
      prisma,
      options: {
        dryRun: true,
        batchSize: 10,
        environment: 'demo',
        snapshotConfirmed: false,
      },
      log: () => undefined,
    });

    expect(summary).toMatchObject({
      scanned: 1,
      changed: 1,
      textChanged: 1,
      updated: 0,
      dryRun: true,
    });
  });

  test('dry-run reports contextual direct-name and organization text changes without exposing them', async () => {
    const logs: string[] = [];
    const prisma: BackfillPrisma = {
      llmLog: {
        findMany: mock(async () => [
          {
            id: 'log-contextual-name',
            model: 'claude-sonnet-4-6',
            provider: 'anthropic',
            systemPrompt:
              'Generate a thesis prompt for Brian Connell at Holy Family School.',
            messages: [
              {
                role: 'user',
                content:
                  'Please draft feedback for Brian Connell from Holy Family.',
              },
            ],
            response:
              '{"attribution":"Brian Connell, Holy Family","body":"For Brian Connell at Holy Family School, revise the claim."}',
            error: null,
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            durationMs: 4,
            metadata: {
              route: 'routes/api.domain.thesis-prompt-generator',
            },
          },
        ]),
        update: mock(async () => {
          throw new Error('dry-run must not update rows');
        }),
      },
    };

    const summary = await backfillLlmLogDeidentification({
      prisma,
      options: {
        dryRun: true,
        batchSize: 10,
        environment: 'demo',
        snapshotConfirmed: false,
      },
      log: (message) => logs.push(message),
    });

    expect(summary).toMatchObject({
      scanned: 1,
      changed: 1,
      textChanged: 1,
      updated: 0,
      dryRun: true,
    });
    expect(logs.join('\n')).not.toContain('Brian');
    expect(logs.join('\n')).not.toContain('Connell');
    expect(logs.join('\n')).not.toContain('Holy Family');
  });
});
