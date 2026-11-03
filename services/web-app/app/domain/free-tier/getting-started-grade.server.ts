import type { PrismaClient } from '@app/prisma';
import {
  FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF,
  resolveFreeTierGradeStepHref,
} from './getting-started-grade';

const needsGradingSubmissionWhere = {
  unsubmittedAt: null,
  releasedAt: null,
  gradedAt: null,
  score: null,
  numericPercentage: null,
  letterGrade: null,
  overallComment: null,
  feedback: null,
} as const;

const teacherSavedGradeWhere = (membershipId: string) => ({
  gradedByMembershipId: membershipId,
  OR: [
    { releasedAt: { not: null } },
    { score: { not: null } },
    { numericPercentage: { not: null } },
    { letterGrade: { not: null } },
    { overallComment: { not: null } },
    { feedback: { not: null } },
  ],
});

export async function readFreeTierGettingStartedGradeProgress(
  db: Pick<PrismaClient, 'submission'>,
  params: { classId: string; membershipId: string }
): Promise<{ graded: boolean; gradeStepHref: string }> {
  const documentScope = { classAssignment: { classId: params.classId } };
  const [gradedSubmission, firstNeedsGradingSubmission] = await Promise.all([
    db.submission.findFirst({
      where: {
        unsubmittedAt: null,
        document: documentScope,
        ...teacherSavedGradeWhere(params.membershipId),
      },
      select: { id: true },
    }),
    db.submission.findFirst({
      where: {
        ...needsGradingSubmissionWhere,
        document: documentScope,
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    }),
  ]);

  return {
    graded: gradedSubmission != null,
    gradeStepHref: resolveFreeTierGradeStepHref({
      firstNeedsGradingSubmissionId: firstNeedsGradingSubmission?.id ?? null,
      exitTo: FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF,
    }),
  };
}
