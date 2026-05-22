import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmissionEnabledForSchools } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  canManageGrades,
  getGradingActor,
} from '~/utils/grading-auth.server';

const POST = z.object({
  submissionIds: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return [value];
      return value;
    },
    z.array(z.string()).min(1, 'At least one submission is required')
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

  // Verify all submissions exist and are eligible to be released.
  const submissions = await prisma.submission.findMany({
    where: {
      id: { in: data.submissionIds },
      document: { is: { profileId: { not: actor.profileId } } },
      ...(actor.isAdmin ? {} : { gradedById: actor.profileId }),
      releasedAt: null,
    },
    select: {
      id: true,
      document: {
        select: {
          id: true,
          assignment: {
            select: {
              class: {
                select: {
                  schoolId: true,
                },
              },
            },
          },
          studentProfile: {
            select: {
              classes: {
                select: {
                  schoolId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (submissions.length === 0) {
    return dataResponse(
      { success: false, message: 'No unreleased submissions found.' },
      { status: 404 }
    );
  }

  const directSchoolIds = submissions
    .map((s) => s.document.assignment?.class?.schoolId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const documentIdsMissingSchool = submissions
    .filter((s) => !s.document.assignment?.class?.schoolId)
    .map((s) => s.document.id);

  let forensicSchoolIds: string[] = [];
  if (documentIdsMissingSchool.length > 0) {
    const forensic = await prisma.documentClassForensic.findMany({
      where: { documentId: { in: documentIdsMissingSchool } },
      select: { oldClassId: true },
    });
    const oldClassIds = Array.from(
      new Set(forensic.map((row) => row.oldClassId).filter(Boolean))
    );
    if (oldClassIds.length > 0) {
      const oldClasses = await prisma.class.findMany({
        where: { id: { in: oldClassIds } },
        select: { schoolId: true },
      });
      forensicSchoolIds = oldClasses
        .map((row) => row.schoolId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    }
  }

  const schoolIds = Array.from(new Set([...directSchoolIds, ...forensicSchoolIds]));

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchools(schoolIds);
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grade release is currently disabled for one or more schools.',
      type: 'error',
    });
  }

  const now = new Date();

  // Release all submissions
  await prisma.submission.updateMany({
    where: {
      id: { in: submissions.map((s) => s.id) },
    },
    data: {
      releasedAt: now,
      updatedAt: now,
    },
  });

  const message =
    submissions.length === 1
      ? 'Grade released to student.'
      : `${submissions.length} grades released to students.`;

  return dataResponse({
    success: true,
    message,
    releasedCount: submissions.length,
  });
}
