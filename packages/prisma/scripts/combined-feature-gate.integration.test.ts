import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import pg from 'pg';
import {
  executeCombinedFeatureGate,
  runCombinedFeatureGate,
} from './combined-feature-gate';

const integrationEnabled = process.env.COMBINED_FEATURE_GATE_INTEGRATION === '1';
const integrationTest = integrationEnabled ? test : test.skip;
const postcheckIntegrationTest =
  integrationEnabled && process.env.COMBINED_FEATURE_GATE_POSTCHECK === '1'
    ? test
    : test.skip;
const negativeIntegrationTest =
  integrationEnabled && process.env.COMBINED_FEATURE_GATE_NEGATIVES !== '0'
    ? test
    : test.skip;
let client: pg.Client;

describe('production node-postgres combined-feature gates', () => {
  beforeAll(async () => {
    if (!integrationEnabled) return;
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the combined-feature gate integration proof');
    }
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  integrationTest('runs the production preflight through node-postgres on valid data', async () => {
    await runCombinedFeatureGate('combined-feature-preflight.sql', process.env);
  });

  postcheckIntegrationTest('runs the production postcheck through node-postgres on valid data', async () => {
    await runCombinedFeatureGate('combined-feature-postcheck.sql', process.env);
  });

  const negativeCases = [
    {
      label: 'writing-problem-count',
      mutation:
        'UPDATE "WritingPracticeAssignment" SET "problemCount" = 0 WHERE "id" = \'rehearsal-writing-assignment\'',
      message: 'preflight: invalid WritingPracticeAssignment problem count or lesson slugs',
    },
    {
      label: 'writing-attempt-status',
      mutation:
        'UPDATE "WritingPracticeAttempt" SET "status" = \'invalid-status\' WHERE "id" = \'rehearsal-attempt-1\'',
      message: 'preflight: invalid WritingPracticeAttempt.status value',
    },
    {
      label: 'class-insight-status',
      mutation:
        'UPDATE "ClassAssignmentInsight" SET "status" = \'invalid-status\' WHERE "id" = \'rehearsal-class-insight\'',
      message: 'preflight: invalid ClassAssignmentInsight count or status',
    },
    {
      label: 'reporter-conversation-tenant',
      mutation:
        'UPDATE "ReporterConversation" SET "organizationId" = \'rehearsal-org-b\' WHERE "id" = \'rehearsal-conversation\'',
      message: 'preflight: ReporterConversation membership tenant mismatch',
    },
    {
      label: 'reporter-growth-status',
      mutation:
        'UPDATE "ReporterGrowthPlan" SET "status" = \'invalid-status\' WHERE "id" = \'rehearsal-growth-plan\'',
      message: 'preflight: invalid ReporterGrowthPlan.status value',
    },
  ] as const;

  for (const negativeCase of negativeCases) {
    negativeIntegrationTest(`rejects ${negativeCase.label} through node-postgres`, async () => {
      await client.query('BEGIN');
      try {
        await client.query(negativeCase.mutation);
        await expect(
          executeCombinedFeatureGate(
            client,
            'combined-feature-preflight.sql',
            () => undefined
          )
        ).rejects.toThrow(negativeCase.message);
        console.log(`preflight_negative_node=${negativeCase.label} result=rejected`);
      } finally {
        await client.query('ROLLBACK');
      }
    });
  }
});
