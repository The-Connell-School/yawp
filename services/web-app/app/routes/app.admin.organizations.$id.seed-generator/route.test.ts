import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  seedGeneratorConversation: { findMany: mock(), findFirst: mock() },
};
const requireSeedGeneratorAccess = mock();
const loadSeedGeneratorOrganizationContext = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module(
  '~/utils/admin-seed-generator/seed-generator-access.server',
  () => ({ requireSeedGeneratorAccess })
);
mock.module(
  '~/domain/admin-seed-generator/seed-generator-context.server',
  () => ({ loadSeedGeneratorOrganizationContext })
);

const { committableNodeIds, loader } = await import('./route');

afterAll(() => mock.restore());

describe('dedicated admin seed-generator page loader', () => {
  beforeEach(() => {
    prisma.seedGeneratorConversation.findMany.mockReset();
    prisma.seedGeneratorConversation.findFirst.mockReset();
    requireSeedGeneratorAccess.mockReset();
    loadSeedGeneratorOrganizationContext.mockReset();
    requireSeedGeneratorAccess.mockResolvedValue({
      membership: { id: 'admin-membership-1' },
    });
    loadSeedGeneratorOrganizationContext.mockResolvedValue({
      organizationId: 'org-1',
      organizationName: 'Acme High',
      existingClasses: [],
      existingAssignmentTypes: [],
    });
    prisma.seedGeneratorConversation.findMany.mockResolvedValue([]);
  });

  test('uses the shared preview/admin access gate', async () => {
    requireSeedGeneratorAccess.mockRejectedValue(
      new Response('Not found', { status: 404 })
    );
    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/organizations/org-1/seed-generator'
        ),
        params: { id: 'org-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
  });

  test('lists at most thirty threads scoped to membership and target organization', async () => {
    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/organizations/org-1/seed-generator'
      ),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);
    expect(prisma.seedGeneratorConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          membershipId: 'admin-membership-1',
          organizationId: 'org-1',
          deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      })
    );
    expect(result.selectedConversation).toBeNull();
  });

  test('loads the selected thread and graph only within the same scope', async () => {
    prisma.seedGeneratorConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      title: 'English 9 demo',
      messages: [],
      nodes: [],
    });
    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/organizations/org-1/seed-generator?c=conversation-1'
      ),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);
    expect(prisma.seedGeneratorConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'conversation-1',
          membershipId: 'admin-membership-1',
          organizationId: 'org-1',
          deletedAt: null,
        },
      })
    );
    expect(result.selectedConversation?.id).toBe('conversation-1');
  });
});

describe('seed graph commit count', () => {
  test('does not count approved student/document nodes without an approved submission chain', () => {
    const base = {
      committedEntityId: null,
      data: {},
      parentLocalId: null,
      status: 'approved' as const,
    };
    const ids = committableNodeIds([
      { ...base, localId: 'class-1', kind: 'class' },
      {
        ...base,
        localId: 'assignment-1',
        kind: 'assignment',
        parentLocalId: 'class-1',
      },
      {
        ...base,
        localId: 'student-1',
        kind: 'student',
        parentLocalId: 'class-1',
      },
      {
        ...base,
        localId: 'document-1',
        kind: 'document',
        parentLocalId: 'assignment-1',
        data: { studentLocalId: 'student-1' },
      },
      {
        ...base,
        localId: 'submission-1',
        kind: 'submission',
        parentLocalId: 'document-1',
        status: 'rejected',
        data: { status: 'submitted' },
      },
    ]);

    expect([...ids].sort()).toEqual(['assignment-1', 'class-1']);
  });

  test('does not count a bottom-up writing chain while its class is still proposed', () => {
    const ids = committableNodeIds([
      {
        localId: 'class-1',
        kind: 'class',
        parentLocalId: null,
        status: 'proposed',
        committedEntityId: null,
        data: {},
      },
      {
        localId: 'assignment-1',
        kind: 'assignment',
        parentLocalId: 'class-1',
        status: 'approved',
        committedEntityId: null,
        data: {},
      },
      {
        localId: 'student-1',
        kind: 'student',
        parentLocalId: 'class-1',
        status: 'approved',
        committedEntityId: null,
        data: {},
      },
      {
        localId: 'document-1',
        kind: 'document',
        parentLocalId: 'assignment-1',
        status: 'approved',
        committedEntityId: null,
        data: { studentLocalId: 'student-1' },
      },
      {
        localId: 'submission-1',
        kind: 'submission',
        parentLocalId: 'document-1',
        status: 'approved',
        committedEntityId: null,
        data: { status: 'submitted' },
      },
    ]);

    expect([...ids]).toEqual([]);
  });
});
