import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  organization: { findUnique: mock() },
  class: { findMany: mock() },
  organizationAssignmentType: { findMany: mock() },
};

const requireAdmin = mock();
const isIsolatedPreviewSeatMode = mock();
const proposeSeedData = mock();
const commitApprovedSeedData = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/preview-access.server', () => ({ isIsolatedPreviewSeatMode }));
mock.module('~/domain/admin-seed-generator/seed-generator-propose.server', () => ({
  proposeSeedData,
}));
mock.module('~/domain/admin-seed-generator/seed-generator-write.server', () => ({
  commitApprovedSeedData,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

function createRequest(form: URLSearchParams) {
  return new Request('https://example.test/app/admin/organizations/org-1/seed-generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

const validCommitProposal = {
  classes: [
    {
      localId: 'class-1',
      title: 'English 9',
      grade: '9',
      period: '3',
      schoolYear: '2025-2026',
      approved: true,
    },
  ],
  assignments: [
    {
      localId: 'assignment-1',
      classLocalId: 'class-1',
      title: 'Civic essay',
      prompt: 'Write about civic responsibility.',
      assignmentTypeTitle: 'The Thesis-Driven Essay',
      approved: true,
    },
  ],
  students: [
    {
      localId: 'student-1',
      name: 'Maya R.',
      classLocalId: 'class-1',
      writingProfile: 'struggling',
      submissions: [
        {
          localId: 'submission-1',
          assignmentLocalId: 'assignment-1',
          essayText: 'essay text',
          status: 'submitted',
        },
      ],
      approved: true,
    },
  ],
};

describe('admin org seed-generator route', () => {
  beforeEach(() => {
    prisma.organization.findUnique.mockReset();
    prisma.class.findMany.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    requireAdmin.mockReset();
    isIsolatedPreviewSeatMode.mockReset();
    proposeSeedData.mockReset();
    commitApprovedSeedData.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme High' });
    prisma.class.findMany.mockResolvedValue([]);
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      {
        assignmentType: { id: 'type-1', title: 'The Thesis-Driven Essay', description: null },
      },
    ]);
  });

  test('loader 404s when not in isolated preview seat mode', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(false);

    await expect(
      loader({
        request: new Request('https://example.test/app/admin/organizations/org-1/seed-generator'),
        params: { id: 'org-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
  });

  test('action 404s when not in isolated preview seat mode, even for a well-formed propose intent', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(false);
    const form = new URLSearchParams({ intent: 'propose', instructions: 'add a class' });

    await expect(
      action({
        request: createRequest(form),
        params: { id: 'org-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });

    expect(proposeSeedData).not.toHaveBeenCalled();
  });

  test('loader returns organization context in preview seat mode', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);

    const response = await loader({
      request: new Request('https://example.test/app/admin/organizations/org-1/seed-generator'),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);

    expect((response as { data: Record<string, unknown> }).data).toMatchObject({
      organization: { id: 'org-1', name: 'Acme High' },
      existingAssignmentTypes: [
        { id: 'type-1', title: 'The Thesis-Driven Essay', description: null },
      ],
    });
  });

  test('propose intent requires non-empty instructions', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    const form = new URLSearchParams({ intent: 'propose', instructions: '  ' });

    const response = await action({
      request: createRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(400);
    expect(proposeSeedData).not.toHaveBeenCalled();
  });

  test('propose intent calls proposeSeedData with organization context', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    proposeSeedData.mockResolvedValue({ proposal: { classes: [], assignments: [], students: [] } });
    const form = new URLSearchParams({
      intent: 'propose',
      instructions: 'add a struggling writer',
    });

    const response = await action({
      request: createRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);

    expect(proposeSeedData).toHaveBeenCalledWith({
      ctx: {
        organizationId: 'org-1',
        organizationName: 'Acme High',
        existingClasses: [],
        existingAssignmentTypes: [
          { id: 'type-1', title: 'The Thesis-Driven Essay', description: null },
        ],
      },
      instructions: 'add a struggling writer',
    });
    expect((response as { data: Record<string, unknown> }).data).toHaveProperty('proposal');
  });

  test('commit intent rejects a malformed proposal payload before calling the writer', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    const form = new URLSearchParams({ intent: 'commit', proposal: '{"not":"valid"}' });

    const response = await action({
      request: createRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(400);
    expect(commitApprovedSeedData).not.toHaveBeenCalled();
  });

  test('commit intent writes only the validated, approved proposal', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    commitApprovedSeedData.mockResolvedValue({
      classesCreated: 1,
      assignmentsCreated: 1,
      studentsCreated: 1,
      submissionsCreated: 1,
      documentsCreated: 1,
      skippedStudents: [],
    });
    const form = new URLSearchParams({
      intent: 'commit',
      proposal: JSON.stringify(validCommitProposal),
    });

    const response = await action({
      request: createRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    } as any);

    expect(commitApprovedSeedData).toHaveBeenCalledTimes(1);
    const [dbArg, proposalArg, ctxArg] = commitApprovedSeedData.mock.calls[0]!;
    expect(dbArg).toBe(prisma);
    expect(proposalArg).toEqual(validCommitProposal);
    expect(ctxArg).toEqual({
      organizationId: 'org-1',
      organizationName: 'Acme High',
      existingClassIds: new Set(),
      assignmentTypeIdByTitle: new Map([['The Thesis-Driven Essay', 'type-1']]),
    });
    expect((response as { data: Record<string, unknown> }).data).toHaveProperty('summary');
  });
});
