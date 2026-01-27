import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

// Schema for single or bulk grading
const POST = z.object({
  documentIds: z.array(z.string()).min(1, 'At least one document is required'),
  score: z.string().optional(),
  feedback: z.string().optional(),
  rubricScores: z.string().optional(),
  overallScore: z.string().optional(),
  overallComment: z.string().optional(),
  aiMeta: z.string().optional(),
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
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // Get teacher's profile
  const profile = await prisma.profile.findFirst({
    where: {
      userId,
      teacherProfile: { isNot: null },
    },
    select: {
      id: true,
      teacherProfile: {
        select: {
          classes: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!profile || !profile.teacherProfile) {
    return dataResponse(
      { success: false, message: 'Only teachers can grade essays.' },
      { status: 403 }
    );
  }

  // Get the teacher's class IDs for verification
  const teacherClassIds = profile.teacherProfile.classes.map(c => c.id);

  // Verify all documents exist, are submitted, and belong to students in teacher's classes
  const documents = await prisma.document.findMany({
    where: {
      id: { in: data.documentIds },
      submittedAt: { not: null },
      submittedSnapshotId: { not: null },
      classId: { in: teacherClassIds },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      submittedSnapshotId: true,
      profile: {
        select: {
          id: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (documents.length === 0) {
    return dataResponse(
      { success: false, message: 'No valid documents found to grade.' },
      { status: 404 }
    );
  }

  if (documents.length !== data.documentIds.length) {
    return dataResponse(
      {
        success: false,
        message: 'Some documents were not found or are not submitted.',
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const releasedAt = data.releaseImmediately === 'on' ? now : null;
  const rubricScores = parseJson(data.rubricScores);
  const aiMeta = parseJson(data.aiMeta);
  const overallScore =
    data.overallScore && Number.isFinite(Number(data.overallScore))
      ? Number(data.overallScore)
      : null;
  const overallComment = data.overallComment ?? null;

  // Create or update grades for all submitted snapshots
  const gradePromises = documents.map(doc => {
    if (!doc.submittedSnapshotId) {
      throw new Error(`Document ${doc.id} has no submitted snapshot`);
    }
    return prisma.grade.upsert({
      where: { snapshotId: doc.submittedSnapshotId },
      create: {
        snapshotId: doc.submittedSnapshotId,
        gradedById: profile.id,
        score: data.score,
        feedback: data.feedback,
        rubricScores,
        overallScore,
        overallComment,
        aiMeta,
        releasedAt,
      },
      update: {
        score: data.score,
        feedback: data.feedback,
        rubricScores,
        overallScore,
        overallComment,
        aiMeta,
        releasedAt,
        updatedAt: now,
      },
    });
  });

  await Promise.all(gradePromises);

  const message =
    documents.length === 1
      ? releasedAt
        ? 'Essay graded and released to student.'
        : 'Essay graded. You can release it to the student when ready.'
      : releasedAt
        ? `${documents.length} essays graded and released to students.`
        : `${documents.length} essays graded. You can release them to students when ready.`;

  return dataResponse({
    success: true,
    message,
    gradedCount: documents.length,
  });
}
