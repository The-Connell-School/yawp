import assert from 'node:assert/strict';

import { startMockAnthropicServer } from '../e2e/mocks/ai/mock-anthropic-server';

const mock = await startMockAnthropicServer();
process.env.ANTHROPIC_API_KEY = 'yawp-ai-eval-network-mock-key';
process.env.ANTHROPIC_BASE_URL = mock.url;
process.env.AI_MODEL = 'claude-sonnet-4-6';
process.env.ANTHROPIC_OUTAGE_FALLBACK_ENABLED = 'false';

const startedAt = new Date();
const proofKey = `ai-eval-proof-${Date.now()}`;
const { prisma } = await import('../app/utils/db.server');
const { runAiBehaviorEvaluation } = await import(
  '../app/domain/ai-evaluation/ai-behavior-evaluation-runner.server'
);
const {
  createAiPromptDraft,
  promoteAiPromptVersion,
  resolveAiPromptVersion,
  reviewAiPromptCalibration,
  rollbackAiPromptVersion,
} = await import('../app/domain/ai-evaluation/prompt-version-control.server');

let userId: string | null = null;
let assignmentTypeId: string | null = null;
let createdLogIds: string[] = [];

try {
  const user = await prisma.user.create({
    data: {
      email: `${proofKey}@yawp.invalid`,
      name: 'AI behavior network proof',
      isAdmin: true,
    },
  });
  userId = user.id;
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title: `AI behavior network proof ${proofKey}`,
      position: 999_216,
      rubricJson: {
        categories: [
          { key: 'thesis', label: 'Thesis', weight: 0.5 },
          { key: 'conclusion', label: 'Conclusion', weight: 0.5 },
        ],
      },
    },
  });
  assignmentTypeId = assignmentType.id;

  const candidate = await createAiPromptDraft({
    assignmentTypeId,
    surface: 'tutor',
    authorUserId: user.id,
    source: 'network-proof',
  });
  mock.enqueue(
    'eval-tutor-context',
    'eval-grading-balanced',
    'eval-tutor-reading',
    'eval-grading-beginner',
    'eval-grading-advanced',
    'eval-tutor-injection',
    'eval-grading-long',
    'eval-tutor-consistency',
    'eval-grading-consistency',
  );
  const passingRun = await runAiBehaviorEvaluation({
    assignmentTypeId,
    promptVersionId: candidate.id,
    runByUserId: user.id,
  });
  assert.equal(passingRun.status, 'passed');
  assert.equal(passingRun.totalCases, 8);
  assert.equal(passingRun.passedCases, 8);
  assert.equal(passingRun.failedCases, 0);
  assert.equal(passingRun.needsReviewCases, 0);
  assert.ok((passingRun.inputTokens ?? 0) > 0);
  assert.ok((passingRun.outputTokens ?? 0) > 0);

  assert.equal(mock.capturedRequests.length, 9);
  const firstRequest = mock.capturedRequests[0];
  assert.ok(firstRequest);
  assert.equal(firstRequest.method, 'POST');
  assert.equal(firstRequest.path, '/v1/messages');
  assert.equal(
    firstRequest.headers['x-api-key'],
    'yawp-ai-eval-network-mock-key',
  );
  assert.ok(firstRequest.headers['anthropic-version']);
  assert.equal(firstRequest.body.model, 'claude-sonnet-4-6');
  assert.equal(firstRequest.body.temperature, 0);
  assert.equal(firstRequest.body.max_tokens, 500);
  assert.match(String(firstRequest.body.system), /trusted_assignment_context/);
  assert.match(String(firstRequest.body.system), /community gardens/);
  assert.match(JSON.stringify(firstRequest.body.messages), /student_document/);

  const injectionRequest = mock.capturedRequests.find((request) =>
    JSON.stringify(request.body).includes('EVAL_SECRET_216'),
  );
  assert.ok(injectionRequest, 'prompt-injection fixture did not cross HTTP');
  const gradingRequests = mock.capturedRequests.filter(
    (request) => request.body.max_tokens === 900,
  );
  assert.equal(gradingRequests.length, 5);
  assert.ok(
    gradingRequests.every((request) =>
      JSON.stringify(request.body.messages).includes('thesis'),
    ),
  );

  const passingLogs = await prisma.llmLog.findMany({
    where: { createdAt: { gte: startedAt }, provider: 'anthropic' },
    orderBy: { createdAt: 'asc' },
  });
  const runLogs = passingLogs.filter((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    return metadata?.aiBehaviorEvaluationRunId === passingRun.id;
  });
  assert.equal(runLogs.length, 9);
  for (const log of runLogs) {
    assert.equal(log.systemPrompt, null);
    assert.equal(log.response, null);
    assert.equal(log.error, null);
    assert.deepEqual(log.messages, { redacted: true, messageCount: 1 });
    assert.ok((log.inputTokens ?? 0) > 0);
    assert.ok((log.outputTokens ?? 0) > 0);
    assert.ok(log.durationMs !== null);
    assert.doesNotMatch(JSON.stringify(log), /EVAL_SECRET_216/);
    const metadata = log.metadata as Record<string, unknown>;
    assert.equal(metadata.payloadLogging, 'metadata-only');
    assert.equal(metadata.synthetic, true);
  }

  await assert.rejects(
    promoteAiPromptVersion({
      assignmentTypeId,
      promptVersionId: candidate.id,
      runId: passingRun.id,
    }),
    /Calibration review is required/,
  );
  await reviewAiPromptCalibration({
    assignmentTypeId,
    runId: passingRun.id,
    reviewerUserId: user.id,
  });
  const promoted = await promoteAiPromptVersion({
    assignmentTypeId,
    promptVersionId: candidate.id,
    runId: passingRun.id,
  });
  assert.equal(promoted.status, 'production');
  const resolvedProduction = await resolveAiPromptVersion({
    assignmentTypeId,
    surface: 'tutor',
  });
  assert.equal(resolvedProduction.id, candidate.id);
  assert.equal(resolvedProduction.contentHash, candidate.contentHash);
  const rollback = await rollbackAiPromptVersion({
    assignmentTypeId,
    surface: 'tutor',
    productionVersionId: candidate.id,
  });
  assert.equal(rollback.rolledBackTo, 'canonical-runtime-v1');
  const resolvedAfterRollback = await resolveAiPromptVersion({
    assignmentTypeId,
    surface: 'tutor',
  });
  assert.equal(resolvedAfterRollback.id, null);
  assert.equal(resolvedAfterRollback.source, 'canonical-runtime-v1');

  const failingCandidate = await createAiPromptDraft({
    assignmentTypeId,
    surface: 'grading',
    authorUserId: user.id,
    source: 'network-proof-failure',
  });
  mock.enqueue(
    'malformed-json',
    'malformed-json',
    'malformed-json',
    'malformed-json',
    'malformed-json',
    'malformed-json',
    'malformed-json',
    'malformed-json',
    'malformed-json',
  );
  const failedRun = await runAiBehaviorEvaluation({
    assignmentTypeId,
    promptVersionId: failingCandidate.id,
    runByUserId: user.id,
  });
  assert.equal(failedRun.status, 'failed');
  assert.ok(failedRun.failedCases > 0);
  await assert.rejects(
    reviewAiPromptCalibration({
      assignmentTypeId,
      runId: failedRun.id,
      reviewerUserId: user.id,
    }),
    /Passing evaluation run not found/,
  );
  await assert.rejects(
    promoteAiPromptVersion({
      assignmentTypeId,
      promptVersionId: failingCandidate.id,
      runId: failedRun.id,
    }),
    /must pass every blocking case/,
  );

  const allProofLogs = await prisma.llmLog.findMany({
    where: { createdAt: { gte: startedAt }, provider: 'anthropic' },
    select: { id: true, metadata: true },
  });
  createdLogIds = allProofLogs
    .filter((log) => {
      const metadata = log.metadata as Record<string, unknown> | null;
      return metadata?.feature === 'ai-behavior-eval';
    })
    .map((log) => log.id);
  assert.equal(createdLogIds.length, 18);
  assert.equal(mock.capturedRequests.length, 18);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: mock.url,
        capturedRequests: mock.capturedRequests.length,
        passingRun: {
          cases: passingRun.totalCases,
          providerCalls: runLogs.length,
          inputTokens: passingRun.inputTokens,
          outputTokens: passingRun.outputTokens,
        },
        releaseLifecycle: {
          unreviewedPromotion: 'rejected',
          calibrationReview: 'recorded',
          promotion: 'resolved by runtime',
          rollback: 'canonical runtime restored',
          failedRunPromotion: 'rejected',
        },
        requestContract: {
          method: firstRequest.method,
          path: firstRequest.path,
          model: firstRequest.body.model,
          temperature: firstRequest.body.temperature,
          metadataOnlyLogs: createdLogIds.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  if (createdLogIds.length === 0) {
    const cleanupCandidates = await prisma.llmLog.findMany({
      where: { createdAt: { gte: startedAt }, provider: 'anthropic' },
      select: { id: true, metadata: true },
    });
    createdLogIds = cleanupCandidates
      .filter((log) => {
        const metadata = log.metadata as Record<string, unknown> | null;
        return metadata?.feature === 'ai-behavior-eval';
      })
      .map((log) => log.id);
  }
  if (createdLogIds.length > 0) {
    await prisma.llmLog.deleteMany({ where: { id: { in: createdLogIds } } });
  }
  if (assignmentTypeId) {
    await prisma.assignmentType.deleteMany({ where: { id: assignmentTypeId } });
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
  await mock.close();
}
