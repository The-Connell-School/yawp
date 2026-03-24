import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import { isDocumentSubmissionEnabledForSchools } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  buildTeacherClassWhere,
  canManageGrades,
  getGradingActor,
} from '~/utils/grading-auth.server';

// Schema for single or bulk grading
const POST = z.object({
  documentIds: z.union([z.string(), z.array(z.string())]).optional(),
  snapshotIds: z.union([z.string(), z.array(z.string())]).optional(),
  score: z.string().optional(),
  feedback: z.string().optional(),
  rubricScores: z.string().optional(),
  overallScore: z.string().optional(),
  overallComment: z.string().optional(),
  numericPercentage: z.string().optional(),
  letterGrade: z.string().optional(),
  aiMeta: z.string().optional(),
  grammarIssues: z.string().optional(),
  releaseImmediately: z.enum(['on']).optional(), // Checkbox value
});

function parseJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const documentIds = data.documentIds
    ? Array.isArray(data.documentIds)
      ? data.documentIds
      : [data.documentIds]
    : [];
  const snapshotIds = data.snapshotIds
    ? Array.isArray(data.snapshotIds)
      ? data.snapshotIds
      : [data.snapshotIds]
    : [];

  if (documentIds.length === 0 && snapshotIds.length === 0) {
    return validationError({
      fieldErrors: { documentIds: 'At least one document is required' },
    });
  }

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can grade essays.' },
      { status: 403 }
    );
  }

  const teacherClassWhere = buildTeacherClassWhere(actor);

  let snapshots: {
    id: string;
    documentId: string;
    text: string;
    html: string;
    title: string | null;
    document: { class: { schoolId: string } | null };
  }[] = [];

  if (snapshotIds.length > 0) {
    snapshots = await prisma.documentSnapshot.findMany({
      where: {
        id: { in: snapshotIds },
        submittedAt: { not: null },
        archivedAt: null,
        document: {
          deletedAt: null,
          ...teacherClassWhere,
        },
      },
      select: {
        id: true,
        documentId: true,
        title: true,
        text: true,
        html: true,
        document: {
          select: {
            class: {
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });
  } else {
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        submittedAt: { not: null },
        submittedSnapshotId: { not: null },
        submittedSnapshot: {
          is: {
            submittedAt: { not: null },
            archivedAt: null,
          },
        },
        deletedAt: null,
        ...teacherClassWhere,
      },
      select: {
        id: true,
        submittedSnapshotId: true,
        submittedSnapshot: {
          select: {
            id: true,
            title: true,
            text: true,
            html: true,
          },
        },
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    snapshots = documents
      .filter((doc): doc is typeof doc & { submittedSnapshot: { id: string; title: string | null; text: string; html: string } } =>
        doc.submittedSnapshot !== null
      )
      .map((doc) => ({
        id: doc.submittedSnapshot.id,
        documentId: doc.id,
        title: doc.submittedSnapshot.title,
        text: doc.submittedSnapshot.text,
        html: doc.submittedSnapshot.html,
        document: { class: doc.class },
      }));
  }

  if (snapshots.length === 0) {
    return dataResponse(
      { success: false, message: 'No valid submissions found to grade.' },
      { status: 404 }
    );
  }

  if (
    (documentIds.length > 0 && snapshots.length !== documentIds.length) ||
    (snapshotIds.length > 0 && snapshots.length !== snapshotIds.length)
  ) {
    return dataResponse(
      {
        success: false,
        message: 'Some selected submissions were not found.',
      },
      { status: 400 }
    );
  }

  const schoolIds = snapshots.map((snapshot) => snapshot.document.class?.schoolId);
  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchools(schoolIds);
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled for one or more schools.',
      type: 'error',
    });
  }

  const now = new Date();
  const releaseImmediately = data.releaseImmediately === 'on';
  const rubricScores = parseJson(data.rubricScores);
  const aiMeta = parseJson(data.aiMeta);
  const grammarIssues = parseJson(data.grammarIssues);
  const overallScore =
    data.overallScore && Number.isFinite(Number(data.overallScore))
      ? Number(data.overallScore)
      : null;
  const overallComment = data.overallComment ?? null;
  const numericPercentage =
    data.numericPercentage && Number.isFinite(Number(data.numericPercentage))
      ? Math.max(0, Math.min(100, Math.round(Number(data.numericPercentage))))
      : null;
  const letterGrade =
    numericPercentage !== null ? letterFromPercent(numericPercentage) : null;
  const score =
    data.score ??
    (numericPercentage !== null
      ? (formatGrade(numericPercentage, letterGrade) ?? undefined)
      : undefined);

  // Create or update grades for all submitted snapshots
  const gradePromises = snapshots.map((snapshot) => {
    return prisma.grade.upsert({
      where: { snapshotId: snapshot.id },
      create: {
        documentId: snapshot.documentId,
        snapshotId: snapshot.id,
        gradedById: actor.profileId,
        essayTitle: snapshot.title,
        essayText: snapshot.text,
        essayHtml: snapshot.html,
        score,
        feedback: data.feedback,
        rubricScores,
        overallScore,
        overallComment,
        numericPercentage,
        letterGrade,
        aiMeta,
        ...(grammarIssues !== null ? { grammarIssues } : {}),
        ...(releaseImmediately ? { releasedAt: now } : {}),
      } as any,
      update: {
        documentId: snapshot.documentId,
        essayTitle: snapshot.title,
        essayText: snapshot.text,
        essayHtml: snapshot.html,
        score,
        feedback: data.feedback,
        rubricScores,
        overallScore,
        overallComment,
        numericPercentage,
        letterGrade,
        aiMeta,
        ...(grammarIssues !== null ? { grammarIssues } : {}),
        ...(releaseImmediately ? { releasedAt: now } : {}),
        updatedAt: now,
      } as any,
    });
  });

  await Promise.all(gradePromises);

  const message =
    snapshots.length === 1
      ? releaseImmediately
        ? 'Essay graded and released to student.'
        : 'Essay graded. You can release it to the student when ready.'
      : releaseImmediately
        ? `${snapshots.length} essays graded and released to students.`
        : `${snapshots.length} essays graded. You can release them to students when ready.`;

  return dataResponse({
    success: true,
    message,
    gradedCount: snapshots.length,
  });
}
