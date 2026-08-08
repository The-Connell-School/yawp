import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const transaction = {
  seedGeneratorConversation: {
    create: mock(),
    update: mock(),
    updateMany: mock(),
  },
  seedGeneratorMessage: { createMany: mock() },
  seedGeneratorNode: { create: mock(), update: mock() },
};
const prisma = {
  $transaction: mock(),
  seedGeneratorConversation: { findFirst: mock() },
  seedGeneratorNode: {
    findMany: mock(),
    update: mock(),
    updateMany: mock(),
  },
  class: { findMany: mock() },
  assignment: { findMany: mock() },
  orgMembership: { findMany: mock() },
};
const requireMutableRequest = mock();
const requireSeedGeneratorAccess = mock();
const loadSeedGeneratorOrganizationContext = mock();
const reserveAiRequest = mock();
class AiRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(seconds: number) {
    super('rate limited');
    this.retryAfterSeconds = seconds;
  }
}
const proposeSeedGraph = mock();
const fillSeedSubmissionContent = mock();
const writeApprovedSeedData = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireMutableRequest }));
mock.module('~/utils/ai-admission.server', () => ({
  reserveAiRequest,
  AiRateLimitError,
}));
mock.module(
  '~/utils/admin-seed-generator/seed-generator-access.server',
  () => ({ requireSeedGeneratorAccess })
);
mock.module(
  '~/domain/admin-seed-generator/seed-generator-context.server',
  () => ({ loadSeedGeneratorOrganizationContext })
);
mock.module(
  '~/domain/admin-seed-generator/seed-generator-propose.server',
  () => ({ proposeSeedGraph })
);
mock.module(
  '~/domain/admin-seed-generator/seed-generator-content.server',
  () => ({ fillSeedSubmissionContent })
);
mock.module(
  '~/domain/admin-seed-generator/seed-generator-write.server',
  () => ({ writeApprovedSeedData })
);

const { action, mapWithConcurrency } = await import('./route');

afterAll(() => mock.restore());

function request(values: Record<string, string>) {
  return new Request('https://example.test/app/api/domain/seed-generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
}

function actionArgs(seedRequest: Request): Parameters<typeof action>[0] {
  return {
    request: seedRequest,
    params: {},
    context: {} as never,
  } as unknown as Parameters<typeof action>[0];
}

describe('seed generator resource route', () => {
  beforeEach(() => {
    for (const value of [
      prisma.$transaction,
      prisma.seedGeneratorConversation.findFirst,
      prisma.seedGeneratorNode.findMany,
      prisma.seedGeneratorNode.update,
      prisma.seedGeneratorNode.updateMany,
      prisma.class.findMany,
      prisma.assignment.findMany,
      prisma.orgMembership.findMany,
      transaction.seedGeneratorConversation.create,
      transaction.seedGeneratorConversation.update,
      transaction.seedGeneratorConversation.updateMany,
      transaction.seedGeneratorMessage.createMany,
      transaction.seedGeneratorNode.create,
      transaction.seedGeneratorNode.update,
      requireMutableRequest,
      requireSeedGeneratorAccess,
      loadSeedGeneratorOrganizationContext,
      reserveAiRequest,
      proposeSeedGraph,
      fillSeedSubmissionContent,
      writeApprovedSeedData,
    ]) {
      value.mockReset();
    }
    requireSeedGeneratorAccess.mockResolvedValue({
      membership: {
        id: 'admin-membership-1',
        organization: { id: 'admin-home-org' },
      },
    });
    loadSeedGeneratorOrganizationContext.mockResolvedValue({
      organizationId: 'org-1',
      organizationName: 'Acme High',
      admissionMembershipId: 'target-org-member-1',
      existingClasses: [],
      existingAssignmentTypes: [
        { id: 'type-1', title: 'Essay', description: null },
      ],
    });
    reserveAiRequest.mockResolvedValue(undefined);
    transaction.seedGeneratorConversation.create.mockResolvedValue({
      id: 'conversation-1',
    });
    transaction.seedGeneratorConversation.update.mockResolvedValue({});
    transaction.seedGeneratorConversation.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.seedGeneratorMessage.createMany.mockResolvedValue({ count: 2 });
    transaction.seedGeneratorNode.create.mockImplementation(
      async ({ data }) => ({
        id: 'node-db-1',
        ...data,
        committedEntityId: null,
      })
    );
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(transaction)
    );
  });

  test('lazily creates the first thread and persists its turn and nodes atomically', async () => {
    proposeSeedGraph.mockResolvedValue({
      reply: 'Proposed one class.',
      graph: {
        nodes: [
          {
            localId: 'class-1',
            kind: 'class',
            parentLocalId: null,
            data: {
              title: 'English 9',
              grade: '9',
              period: '3',
              schoolYear: '2026-2027',
            },
          },
        ],
      },
    });

    const response = await action(
      actionArgs(
        request({
          intent: 'message',
          organizationId: 'org-1',
          message: 'Add an English 9 class',
        })
      )
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reserveAiRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        membershipId: 'admin-membership-1',
        organizationId: 'admin-home-org',
        feature: 'admin-seed-generator-actor',
      })
    );
    expect(reserveAiRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        membershipId: 'target-org-member-1',
        organizationId: 'org-1',
        feature: 'admin-seed-generator-organization',
      })
    );
    expect(transaction.seedGeneratorConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membershipId: 'admin-membership-1',
          organizationId: 'org-1',
        }),
      })
    );
    expect(transaction.seedGeneratorMessage.createMany).toHaveBeenCalledTimes(
      1
    );
    expect(transaction.seedGeneratorNode.create).toHaveBeenCalledTimes(1);
    expect((response as { data: any }).data).toMatchObject({
      conversationId: 'conversation-1',
      isNewConversation: true,
    });
  });

  test('returns retry messaging and 503 for transient provider failures', async () => {
    proposeSeedGraph.mockResolvedValue({
      type: 'transient',
      message: 'Retry this request in a moment.',
    });
    const response = await action(
      actionArgs(
        request({
          intent: 'message',
          organizationId: 'org-1',
          message: 'Add a class',
        })
      )
    );
    expect((response as { init?: { status?: number } }).init?.status).toBe(503);
    expect((response as { data: any }).data.error.type).toBe('transient');
  });

  test('returns rephrase messaging and 422 for invalid model output', async () => {
    proposeSeedGraph.mockResolvedValue({
      type: 'unparseable',
      message: 'Rephrase with clearer relationships.',
    });
    const response = await action(
      actionArgs(
        request({
          intent: 'message',
          organizationId: 'org-1',
          message: 'Something vague',
        })
      )
    );
    expect((response as { init?: { status?: number } }).init?.status).toBe(422);
    expect((response as { data: any }).data.error.type).toBe('unparseable');
  });

  test('bounds content workers instead of launching an unbounded Promise.all', async () => {
    let active = 0;
    let peak = 0;
    const values = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return value * 2;
      }
    );
    expect(peak).toBe(2);
    expect(values).toEqual([2, 4, 6, 8, 10, 12]);
  });

  test('rejects client attempts to forge server-owned committed status', async () => {
    const response = await action(
      actionArgs(
        request({
          intent: 'edit-node',
          organizationId: 'org-1',
          conversationId: 'conversation-1',
          localId: 'class-1',
          status: 'committed',
        })
      )
    );

    expect((response as { init?: { status?: number } }).init?.status).toBe(400);
    expect(prisma.seedGeneratorConversation.findFirst).not.toHaveBeenCalled();
  });

  test('returns a conflict without mutating a stale graph snapshot', async () => {
    prisma.seedGeneratorConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      membershipId: 'admin-membership-1',
      organizationId: 'org-1',
      updatedAt: new Date('2026-08-06T12:00:00.000Z'),
      deletedAt: null,
      messages: [],
      nodes: [
        {
          id: 'node-db-1',
          localId: 'class-1',
          kind: 'class',
          parentLocalId: null,
          status: 'proposed',
          data: {
            title: 'English 9',
            grade: '9',
            period: '3',
            schoolYear: '2026-2027',
          },
          committedEntityId: null,
        },
      ],
    });
    transaction.seedGeneratorConversation.updateMany.mockResolvedValue({
      count: 0,
    });

    const response = await action(
      actionArgs(
        request({
          intent: 'edit-node',
          organizationId: 'org-1',
          conversationId: 'conversation-1',
          localId: 'class-1',
          status: 'approved',
        })
      )
    );

    expect((response as { init?: { status?: number } }).init?.status).toBe(409);
    expect(transaction.seedGeneratorNode.update).not.toHaveBeenCalled();
  });
});
