import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentTypeAiEvaluationRun: {
    create: mock(),
    update: mock(),
  },
  submission: {
    create: mock(),
  },
};

const createDocumentForAssignmentType = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
}));

const { createAssignmentTypeAiSandboxLaunch } = await import(
  './assignment-type-ai-sandbox.server'
);

describe('createAssignmentTypeAiSandboxLaunch', () => {
  beforeEach(() => {
    prisma.assignmentTypeAiEvaluationRun.create.mockReset();
    prisma.assignmentTypeAiEvaluationRun.update.mockReset();
    prisma.submission.create.mockReset();
    createDocumentForAssignmentType.mockReset();

    prisma.assignmentTypeAiEvaluationRun.create.mockResolvedValue({
      id: 'run-1',
    });
    prisma.assignmentTypeAiEvaluationRun.update.mockResolvedValue({
      id: 'run-1',
    });
    createDocumentForAssignmentType.mockResolvedValue({
      documentId: 'document-1',
    });
    prisma.submission.create.mockResolvedValue({
      id: 'submission-1',
    });
  });

  test('creates a sandbox run, document, and submission for grading launches', async () => {
    const result = await createAssignmentTypeAiSandboxLaunch({
      assignmentTypeId: 'at-1',
      assignmentTypeAiVersionId: 'version-1',
      createdByUserId: 'admin-user-1',
      membershipId: 'admin-membership-1',
      mode: 'grading',
      label: 'Real grading sandbox',
      notes: null,
      controls: {
        studentFirstName: 'Ava',
        strictnessLevel: 'advanced',
        sampleEssay: 'This draft has a specific claim.',
      },
      promptSnapshotJson: {
        schemaVersion: 1,
        assignmentType: { id: 'at-1', title: 'Thesis Essay' },
      },
      assignmentTypeTitle: 'Thesis Essay',
    });

    expect(result).toEqual({
      runId: 'run-1',
      documentId: 'document-1',
      submissionId: 'submission-1',
    });
    expect(prisma.assignmentTypeAiEvaluationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        assignmentTypeAiVersionId: 'version-1',
        createdByUserId: 'admin-user-1',
        agentKind: 'workbench-real-page-sandbox',
        status: 'open',
        label: 'Real grading sandbox',
        studentFirstName: 'Ava',
        strictnessLevel: 'advanced',
        sampleInput: 'This draft has a specific claim.',
      }),
    });
    expect(createDocumentForAssignmentType).toHaveBeenCalledWith({
      membershipId: 'admin-membership-1',
      assignmentTypeId: 'at-1',
      initialTitle: 'AI sandbox: Thesis Essay',
      initialText: 'This draft has a specific claim.',
      initialHtml: '<p>This draft has a specific claim.</p>',
      isAiSandbox: true,
      aiSandboxRunId: 'run-1',
    });
    expect(prisma.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: 'document-1',
        title: 'AI sandbox: Thesis Essay',
        text: 'This draft has a specific claim.',
        html: '<p>This draft has a specific claim.</p>',
        isAiSandbox: true,
        aiSandboxRunId: 'run-1',
      }),
      select: { id: true },
    });
    expect(prisma.assignmentTypeAiEvaluationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        resultJson: {
          schemaVersion: 1,
          mode: 'real-page-sandbox',
          launchMode: 'grading',
          documentId: 'document-1',
          submissionId: 'submission-1',
        },
      },
    });
  });
});
