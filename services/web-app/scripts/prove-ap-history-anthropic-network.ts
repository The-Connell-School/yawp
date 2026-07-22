import assert from 'node:assert/strict';

import { startMockAnthropicServer } from '../e2e/mocks/ai/mock-anthropic-server';

const mock = await startMockAnthropicServer();
process.env.ANTHROPIC_API_KEY = 'yawp-ap-history-network-mock-key';
process.env.ANTHROPIC_BASE_URL = mock.url;
process.env.AI_MODEL = 'claude-sonnet-4-6';

const startedAt = new Date();
const pdfMarker = 'AP_HISTORY_NETWORK_PDF_55d4';
const pdfBytes = Buffer.from(`%PDF-1.4\n%${pdfMarker}\n%%EOF`);

const { extractApHistoryPdf } =
  await import('../app/domain/ap-history/pdf-extraction.server');
const { prisma } = await import('../app/utils/db.server');

let createdLogIds: string[] = [];
try {
  mock.enqueue('ap-history-dbq');
  const dbq = await extractApHistoryPdf({ pdfBytes });
  assert.equal(dbq.essayType, 'dbq');
  assert.equal(dbq.sources.length, 1);

  const firstRequest = mock.capturedRequests[0];
  assert.ok(firstRequest, 'the Anthropic mock did not receive a request');
  assert.equal(firstRequest.method, 'POST');
  assert.equal(firstRequest.path, '/v1/messages');
  assert.equal(
    firstRequest.headers['x-api-key'],
    'yawp-ap-history-network-mock-key',
  );
  assert.ok(firstRequest.headers['anthropic-version']);
  assert.equal(firstRequest.body.model, 'claude-sonnet-4-6');
  assert.equal(firstRequest.body.max_tokens, 4_000);
  assert.equal(firstRequest.body.temperature, 0);
  assert.match(String(firstRequest.body.system), /AP U\.S\. History DBQ/);

  const firstMessages = firstRequest.body.messages as Array<{
    content: Array<{
      type: string;
      source?: { type: string; media_type: string; data: string };
    }>;
  }>;
  const documentPart = firstMessages[0]?.content.find(
    (part) => part.type === 'document',
  );
  assert.equal(documentPart?.source?.type, 'base64');
  assert.equal(documentPart?.source?.media_type, 'application/pdf');
  assert.match(
    Buffer.from(documentPart?.source?.data ?? '', 'base64').toString('utf8'),
    new RegExp(pdfMarker),
  );

  mock.enqueue('ap-history-leq');
  const leq = await extractApHistoryPdf({ pdfBytes });
  assert.equal(leq.essayType, 'leq');
  assert.deepEqual(leq.sources, []);

  await assert.rejects(async () => {
    mock.enqueue('malformed-json');
    await extractApHistoryPdf({ pdfBytes });
  });

  const beforeRetry = mock.capturedRequests.length;
  mock.enqueue('internal-error', 'ap-history-dbq');
  const recovered = await extractApHistoryPdf({ pdfBytes });
  assert.equal(recovered.essayType, 'dbq');
  assert.equal(mock.capturedRequests.length - beforeRetry, 2);

  const beforeOutage = mock.capturedRequests.length;
  await assert.rejects(async () => {
    mock.enqueue('internal-error', 'internal-error', 'internal-error');
    await extractApHistoryPdf({ pdfBytes });
  });
  assert.equal(mock.capturedRequests.length - beforeOutage, 3);

  const beforeRateLimit = mock.capturedRequests.length;
  await assert.rejects(async () => {
    mock.enqueue('rate-limited', 'rate-limited', 'rate-limited');
    await extractApHistoryPdf({ pdfBytes });
  });
  assert.equal(mock.capturedRequests.length - beforeRateLimit, 3);

  const beforeDrop = mock.capturedRequests.length;
  await assert.rejects(async () => {
    mock.enqueue(
      'connection-drop',
      'connection-drop',
      'connection-drop',
      'connection-drop',
      'connection-drop',
      'connection-drop',
    );
    await extractApHistoryPdf({ pdfBytes });
  });
  assert.ok(mock.capturedRequests.length - beforeDrop >= 3);

  const candidateLogs = await prisma.llmLog.findMany({
    where: { createdAt: { gte: startedAt }, provider: 'anthropic' },
    orderBy: { createdAt: 'asc' },
  });
  const proofLogs = candidateLogs.filter((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    return metadata?.feature === 'ap-history-pdf-import';
  });
  createdLogIds = proofLogs.map((log) => log.id);
  assert.equal(proofLogs.length, 7);
  for (const log of proofLogs) {
    assert.equal(log.systemPrompt, null);
    assert.equal(log.response, null);
    assert.doesNotMatch(JSON.stringify(log.messages), new RegExp(pdfMarker));
    assert.doesNotMatch(log.error ?? '', new RegExp(pdfMarker));
    assert.deepEqual(log.messages, {
      redacted: true,
      contentTypes: ['document', 'text'],
    });
    const metadata = log.metadata as Record<string, unknown>;
    assert.equal(metadata.sensitiveContentStored, false);
    assert.doesNotMatch(JSON.stringify(metadata), new RegExp(pdfMarker));
  }
  assert.equal(
    proofLogs.filter(
      (log) => log.error === 'provider_or_validation_failure',
    ).length,
    4,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: mock.url,
        capturedRequests: mock.capturedRequests.length,
        scenarios: {
          dbq: 'validated',
          leq: 'validated',
          malformedJson: 'rejected',
          transient500: 'SDK retry recovered',
          exhausted500: 'rejected',
          exhausted429: 'rejected',
          connectionDrop: 'rejected',
        },
        requestContract: {
          method: firstRequest.method,
          path: firstRequest.path,
          model: firstRequest.body.model,
          maxTokens: firstRequest.body.max_tokens,
          temperature: firstRequest.body.temperature,
          documentMediaType: documentPart?.source?.media_type,
        },
        metadataOnlyLogsVerified: proofLogs.length,
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
        return metadata?.feature === 'ap-history-pdf-import';
      })
      .map((log) => log.id);
  }
  if (createdLogIds.length > 0) {
    await prisma.llmLog.deleteMany({ where: { id: { in: createdLogIds } } });
  }
  await prisma.$disconnect();
  await mock.close();
}
