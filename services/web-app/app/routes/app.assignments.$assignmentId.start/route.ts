import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { findStudentGroupDocument } from '~/domain/collaboration/groups.server';
import {
  createDocumentForAssignmentType,
  DocumentCreationError,
} from '~/domain/documents.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
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
          collaborationEnabled: true,
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

  // The same branch the class-assignment start route takes. Without it this
  // endpoint would hand a student a personal solo document for an assignment
  // their group already owns a draft for — the exact orphan draft the other
  // route exists to prevent. Both are student-facing POSTs, so the guard has to
  // live in both rather than only in the one the UI happens to use.
  if (classAssignment.assignment.collaborationEnabled) {
    const groupDocument = await findStudentGroupDocument({
      classAssignmentId: classAssignment.id,
      membershipId: profile.id,
    });

    if (!groupDocument) {
      return redirectWithToast('/app?tab=assignments', {
        type: 'error',
        description:
          'Your teacher has not opened groups for this assignment yet.',
      });
    }

    const collabParams = new URLSearchParams({
      exitTo: '/app?tab=assignments',
    });

    return redirectWithToast(
      `/app/collab-documents/${groupDocument.documentId}?${collabParams}`,
      { type: 'success', description: 'Opening your group document.' }
    );
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

export async function loader({ request }: LoaderFunctionArgs) {
  // GET requests to the start endpoint should be handled (not error).
  // Redirect users back to the assignments tab where they can initiate the start flow.
  return redirect('/app?tab=assignments');
}
