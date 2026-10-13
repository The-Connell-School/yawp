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
            systemPrompt: 'Help Jane Student.',
            messages: [{ role: 'user', content: 'Jane email jane@example.edu' }],
            response: 'Jane should revise.',
            error: null,
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            durationMs: 4,
            metadata: {
              route: 'routes/test',
              studentName: 'Jane Student',
              membershipId: 'mem-1',
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
      scanned: 1,
      skipped: 0,
      changed: 1,
      updated: 0,
      batches: 1,
      dryRun: true,
    });
    expect(updates).toEqual([]);
    expect(logs.join('\n')).not.toContain('Jane');
    expect(logs.join('\n')).not.toContain('jane@example.edu');
    expect(logs.join('\n')).not.toContain('mem-1');
  });
});
