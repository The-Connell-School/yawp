import { prisma } from '~/utils/db.server';
import type { GradedSubmissionInput } from './aggregate-rubric-performance';
import type { DifferentiationInput } from './differentiate-students';
import {
  CLASS_INSIGHT_INPUT_VERSION,
  classInsightFingerprint,
  isClassInsightCurrent,
} from './class-insight-cache';

export async function loadClassInsightInputs(classAssignmentIds: string[]) {
  const documents = await prisma.document.findMany({
    where: { classAssignmentId: { in: classAssignmentIds }, deletedAt: null },
    select: {
      id: true,
      classAssignmentId: true,
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
      group: { select: { label: true } },
      submissions: {
        where: {
          OR: [{ gradedAt: { not: null } }, { releasedAt: { not: null } }],
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          id: true,
          rubricScores: true,
          overallComment: true,
          score: true,
          overallScore: true,
          numericPercentage: true,
          gradedAt: true,
          releasedAt: true,
        },
      },
    },
  });

  const byClass = new Map<string, DifferentiationInput[]>();
  for (const doc of documents) {
    const submission = doc.submissions[0];
    if (!submission) continue;
    const key = doc.classAssignmentId ?? classAssignmentIds[0];
    const inputs = byClass.get(key) ?? [];
    inputs.push({
      submissionId: submission.id,
      score: submission.score,
      overallScore: submission.overallScore,
      numericPercentage: submission.numericPercentage,
      gradedAt: submission.gradedAt?.toISOString(),
      releasedAt: submission.releasedAt?.toISOString(),
      studentName:
        doc.group?.label?.trim() ||
        doc.membership?.user?.name?.trim() ||
        doc.membership?.user?.email?.trim() ||
        null,
      href: `/app/submissions/${submission.id}`,
      rubricScores:
        submission.rubricScores as GradedSubmissionInput['rubricScores'],
      overallComment: submission.overallComment,
    });
    byClass.set(key, inputs);
  }
  return byClass;
}

/** Invalidate on read so every grade write/release path shares the same rule. */
export async function currentClassInsightRows<
  T extends { classAssignmentId: string; summaryJson: unknown },
>(rows: T[]): Promise<T[]> {
  const versioned = rows.filter(
    (row) =>
      row.summaryJson &&
      typeof row.summaryJson === 'object' &&
      'inputVersion' in row.summaryJson &&
      row.summaryJson.inputVersion === CLASS_INSIGHT_INPUT_VERSION
  );
  if (!versioned.length) return [];
  const inputs = await loadClassInsightInputs(
    versioned.map((row) => row.classAssignmentId)
  );
  return versioned.filter((row) =>
    isClassInsightCurrent(
      row.summaryJson,
      classInsightFingerprint(inputs.get(row.classAssignmentId) ?? [])
    )
  );
}
