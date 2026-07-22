import assert from 'node:assert/strict';

import { startMockAnthropicServer } from '../e2e/mocks/ai/mock-anthropic-server';

const mock = await startMockAnthropicServer();
process.env.ANTHROPIC_API_KEY = 'yawp-network-mock-key';
process.env.ANTHROPIC_BASE_URL = mock.url;
process.env.AI_MODEL = 'claude-sonnet-4-6';

const startedAt = new Date();
const responseMarker = 'NETWORK_PROOF_STUDENT_RESPONSE_7b3e';
const input = {
  lessonTitle: 'Topic Sentences',
  skill: 'topic sentences',
  rule: 'A topic sentence makes one arguable claim that its paragraph proves.',
  exercise: 'Rewrite this announcement as an arguable claim.',
  instruction: 'Write one topic sentence.',
  response: `${responseMarker}: The lunch schedule sidelines students with afternoon labs.`,
};

const { generatePracticeFeedback } =
  await import('../app/utils/writing-lessons/practice-feedback.server');
const { prisma } = await import('../app/utils/db.server');

let createdLogIds: string[] = [];
try {
  mock.enqueue('strong');
  const strong = await generatePracticeFeedback(input);
  assert.equal(strong.status, 'strong');
  assert.equal(strong.degraded, false);

  const firstRequest = mock.capturedRequests[0];
  assert.ok(firstRequest, 'the Anthropic mock did not receive a request');
  assert.equal(firstRequest.method, 'POST');
  assert.equal(firstRequest.path, '/v1/messages');
  assert.equal(firstRequest.headers['x-api-key'], 'yawp-network-mock-key');
  assert.ok(firstRequest.headers['anthropic-version']);
  assert.equal(firstRequest.body.model, 'claude-sonnet-4-6');
  assert.equal(firstRequest.body.max_tokens, 600);
  assert.equal(firstRequest.body.temperature, 0.2);
  assert.match(
    JSON.stringify(firstRequest.body.messages),
    new RegExp(responseMarker)
  );
  assert.match(String(firstRequest.body.system), /guide, do not do the work/i);

  mock.enqueue('developing');
  const developing = await generatePracticeFeedback(input);
  assert.equal(developing.status, 'developing');
  assert.equal(developing.degraded, false);

  mock.enqueue('malformed-json');
  const malformed = await generatePracticeFeedback(input);
  assert.equal(malformed.degraded, true);

  // The SDK retries retryable 5xx responses. One 500 followed by a healthy
  // response proves the unchanged provider client traverses the network retry.
  const beforeRetry = mock.capturedRequests.length;
  mock.enqueue('internal-error', 'strong');
  const recovered = await generatePracticeFeedback(input);
  assert.equal(recovered.degraded, false);
  assert.equal(mock.capturedRequests.length - beforeRetry, 2);

  // Exhaust the SDK retry budget and prove the product returns its deterministic
  // fallback rather than surfacing the provider outage to a student.
  const beforeOutage = mock.capturedRequests.length;
  mock.enqueue('internal-error', 'internal-error', 'internal-error');
  const outage = await generatePracticeFeedback(input);
  assert.equal(outage.degraded, true);
  assert.equal(mock.capturedRequests.length - beforeOutage, 3);

  const beforeRateLimit = mock.capturedRequests.length;
  mock.enqueue('rate-limited', 'rate-limited', 'rate-limited');
  const rateLimited = await generatePracticeFeedback(input);
  assert.equal(rateLimited.degraded, true);
  assert.equal(mock.capturedRequests.length - beforeRateLimit, 3);

  const beforeDrop = mock.capturedRequests.length;
  mock.enqueue(
    'connection-drop',
    'connection-drop',
    'connection-drop',
    'connection-drop',
    'connection-drop',
    'connection-drop'
  );
  const connectionDrop = await generatePracticeFeedback(input);
  assert.equal(connectionDrop.degraded, true);
  assert.ok(mock.capturedRequests.length - beforeDrop >= 3);

  const candidateLogs = await prisma.llmLog.findMany({
    where: { createdAt: { gte: startedAt }, provider: 'anthropic' },
    orderBy: { createdAt: 'asc' },
  });
  const proofLogs = candidateLogs.filter((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    return metadata?.feature === 'writing-practice-feedback';
  });
  createdLogIds = proofLogs.map((log) => log.id);
  assert.equal(proofLogs.length, 7);
  for (const log of proofLogs) {
    assert.equal(log.systemPrompt, null);
    assert.equal(log.response, null);
    assert.doesNotMatch(
      JSON.stringify(log.messages),
      new RegExp(responseMarker)
    );
    assert.doesNotMatch(log.error ?? '', new RegExp(responseMarker));
    assert.deepEqual(log.messages, { redacted: true, messageCount: 1 });
    const metadata = log.metadata as Record<string, unknown>;
    assert.equal(metadata.payloadLogging, 'metadata-only');
  }
  assert.equal(
    proofLogs.filter((log) => log.error === 'LLM request failed').length,
    3
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: mock.url,
        capturedRequests: mock.capturedRequests.length,
        scenarios: {
          strong: 'non-degraded',
          developing: 'non-degraded',
          malformedJson: 'degraded fallback',
          transient500: 'SDK retry recovered',
          exhausted500: 'degraded fallback',
          exhausted429: 'degraded fallback',
          connectionDrop: 'degraded fallback',
        },
        requestContract: {
          method: firstRequest.method,
          path: firstRequest.path,
          model: firstRequest.body.model,
          maxTokens: firstRequest.body.max_tokens,
          temperature: firstRequest.body.temperature,
        },
        metadataOnlyLogsVerified: proofLogs.length,
      },
      null,
      2
    )
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
        return metadata?.feature === 'writing-practice-feedback';
      })
      .map((log) => log.id);
  }
  if (createdLogIds.length > 0) {
    await prisma.llmLog.deleteMany({ where: { id: { in: createdLogIds } } });
  }
  await prisma.$disconnect();
  await mock.close();
}
