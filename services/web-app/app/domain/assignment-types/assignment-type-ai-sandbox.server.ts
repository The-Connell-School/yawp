import type { Prisma } from '@app/prisma';
import { createDocumentForAssignmentType } from '~/domain/documents.server';
import { prisma } from '~/utils/db.server';

type SandboxLaunchMode = 'tutor' | 'grading';

type SandboxControls = {
  studentFirstName: string;
  strictnessLevel: string;
  sampleEssay: string;
};

export type AssignmentTypeAiSandboxLaunchInput = {
  assignmentTypeId: string;
  assignmentTypeAiVersionId: string | null;
  createdByUserId: string;
  membershipId: string;
  mode: SandboxLaunchMode;
  label: string | null;
  notes: string | null;
  controls: SandboxControls;
  promptSnapshotJson: Prisma.InputJsonValue;
  assignmentTypeTitle: string;
};

export type AssignmentTypeAiSandboxLaunch = {
  runId: string;
  documentId: string;
  submissionId: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function documentHtmlFromText(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '';
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function createAssignmentTypeAiSandboxLaunch(
  input: AssignmentTypeAiSandboxLaunchInput
): Promise<AssignmentTypeAiSandboxLaunch> {
  const title = `AI sandbox: ${input.assignmentTypeTitle}`;
  const html = documentHtmlFromText(input.controls.sampleEssay);
  const run = await prisma.assignmentTypeAiEvaluationRun.create({
    data: {
      assignmentTypeId: input.assignmentTypeId,
      assignmentTypeAiVersionId: input.assignmentTypeAiVersionId,
      createdByUserId: input.createdByUserId,
      agentKind: 'workbench-real-page-sandbox',
      status: 'open',
      label: input.label,
      notes: input.notes,
      studentFirstName: input.controls.studentFirstName,
      strictnessLevel: input.controls.strictnessLevel,
      sampleInput: input.controls.sampleEssay,
      promptSnapshotJson: input.promptSnapshotJson,
    },
  });

  const document = await createDocumentForAssignmentType({
    membershipId: input.membershipId,
    assignmentTypeId: input.assignmentTypeId,
    initialTitle: title,
    initialText: input.controls.sampleEssay,
    initialHtml: html,
    isAiSandbox: true,
    aiSandboxRunId: run.id,
  });

  const submission =
    input.mode === 'grading'
      ? await prisma.submission.create({
          data: {
            documentId: document.documentId,
            title,
            text: input.controls.sampleEssay,
            html,
            submittedAt: new Date(),
            isAiSandbox: true,
            aiSandboxRunId: run.id,
          },
          select: { id: true },
        })
      : null;

  await prisma.assignmentTypeAiEvaluationRun.update({
    where: { id: run.id },
    data: {
      resultJson: {
        schemaVersion: 1,
        mode: 'real-page-sandbox',
        launchMode: input.mode,
        documentId: document.documentId,
        submissionId: submission?.id ?? null,
      },
    },
  });

  return {
    runId: run.id,
    documentId: document.documentId,
    submissionId: submission?.id ?? null,
  };
}
