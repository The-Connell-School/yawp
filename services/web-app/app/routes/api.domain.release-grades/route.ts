import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmissionEnabledForSchools } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

const POST = z.object({
  gradeIds: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return [value];
      return value;
    },
    z.array(z.string()).min(1, 'At least one grade is required')
  ),
});

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can release grades.' },
      { status: 403 }
    );
  }

  // Verify all grades exist and are eligible to be released.
  const grades = await (prisma as any).grade.findMany({
    where: {
      id: { in: data.gradeIds },
      ...(actor.isAdmin ? {} : { gradedById: actor.profileId }),
      releasedAt: null,
    },
    select: {
      id: true,
      snapshotId: true,
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

  if (grades.length === 0) {
    return dataResponse(
      { success: false, message: 'No unreleased grades found.' },
      { status: 404 }
    );
  }

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchools(
    grades.map((grade: any) => grade.document.class?.schoolId)
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grade release is currently disabled for one or more schools.',
      type: 'error',
    });
  }

  const now = new Date();

  // Release all grades
  await prisma.grade.updateMany({
    where: {
      id: { in: grades.map((g: any) => g.id) },
    },
    data: {
      releasedAt: now,
      updatedAt: now,
    },
  });

  // Dual-write to Submission table (Phase 1)
  const snapshotIds = grades
    .map((g: any) => g.snapshotId)
    .filter(Boolean);
  if (snapshotIds.length > 0) {
    await prisma.submission.updateMany({
      where: { legacySnapshotId: { in: snapshotIds } },
      data: {
        releasedAt: now,
        updatedAt: now,
      },
    }).catch((err: any) => {
      console.warn('Dual-write to Submission failed (Phase 1):', err.message);
    });
  }

  const message =
    grades.length === 1
      ? 'Grade released to student.'
      : `${grades.length} grades released to students.`;

  return dataResponse({
    success: true,
    message,
    releasedCount: grades.length,
  });
}
