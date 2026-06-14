import { type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import {
  createDocumentForAssignmentType,
  DocumentCreationError,
} from '~/domain/documents.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isAssignmentsEnabledForContext } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({});

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'STUDENT') {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Only students can start assignments.',
    });
  }

  const { error } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      assignmentId: params.assignmentId,
      class: {
        students: {
          some: {
            id: profile.id,
          },
        },
      },
    },
    select: {
      id: true,
      assignmentId: true,
      assignment: {
        select: {
          assignmentTypeId: true,
        },
      },
      class: {
        select: {
          id: true,
          school: { select: { id: true, organizationId: true } },
          teachers: { select: { id: true } },
        },
      },
    },
  });

  if (!classAssignment) {
    return redirectWithToast('/app?tab=assignments', {
      type: 'error',
      description: 'Assignment not found.',
    });
  }

  const assignmentsEnabled = await isAssignmentsEnabledForContext({
    organizationId:
      classAssignment.class.school.organizationId ?? profile.organization.id,
    schoolId: classAssignment.class.school.id,
    teacherProfileId: null,
    teacherProfileIds: classAssignment.class.teachers.map((teacher) => teacher.id),
    classIds: [classAssignment.class.id],
  });
  if (!assignmentsEnabled) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Assignments are not enabled for your organization.',
    });
  }

  let documentId = '';
  try {
    const created = await createDocumentForAssignmentType({
      membershipId: profile.id,
      assignmentTypeId: classAssignment.assignment.assignmentTypeId,
      assignmentId: classAssignment.assignmentId,
      classAssignmentId: classAssignment.id,
    });
    documentId = created.documentId;
  } catch (creationError) {
    if (creationError instanceof DocumentCreationError) {
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
