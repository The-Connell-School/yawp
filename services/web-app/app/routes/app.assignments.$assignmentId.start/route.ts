import { type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import {
  createStudentDocumentForCourse,
  StudentDocumentCreationError,
} from '~/domain/student-documents.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({
  audioEnabled: z.union([z.literal('true'), z.literal('false')]),
});

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Only students can start assignments.',
    });
  }

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: params.assignmentId,
      class: {
        students: {
          some: {
            id: profile.studentProfile.id,
          },
        },
      },
    },
    select: {
      id: true,
      classId: true,
      studentCourseId: true,
    },
  });

  if (!assignment) {
    return redirectWithToast('/app?tab=assignments', {
      type: 'error',
      description: 'Assignment not found.',
    });
  }

  let documentId = '';
  try {
    const created = await createStudentDocumentForCourse({
      profileId: profile.id,
      studentCourseId: assignment.studentCourseId,
      classId: assignment.classId,
      assignmentId: assignment.id,
      audioEnabled: data.audioEnabled === 'true',
    });
    documentId = created.documentId;
  } catch (creationError) {
    if (creationError instanceof StudentDocumentCreationError) {
      return redirectWithToast('/app?tab=assignments', {
        type: 'error',
        description: creationError.message,
      });
    }
    throw creationError;
  }

  const redirectParams = new URLSearchParams({
    spa: '1',
    exitTo: '/app?tab=assignments',
  });

  return redirectWithToast(`/app/documents/${documentId}?${redirectParams}`, {
    type: 'success',
    description: 'Document created successfully.',
  });
}
