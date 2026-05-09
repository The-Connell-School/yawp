import { type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import {
  createDocumentForAssignmentType,
  DocumentCreationError,
} from '~/domain/documents.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isAssignmentsEnabledForOrganization } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({});

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

  const assignmentsEnabled = await isAssignmentsEnabledForOrganization(
    profile.organization.id
  );
  if (!assignmentsEnabled) {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Assignments are not enabled for your organization.',
    });
  }

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
      assignmentTypeId: true,
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
    const created = await createDocumentForAssignmentType({
      profileId: profile.id,
      assignmentTypeId: assignment.assignmentTypeId,
      assignmentId: assignment.id,
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
