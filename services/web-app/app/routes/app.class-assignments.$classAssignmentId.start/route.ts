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

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: params.classAssignmentId,
      OR: [{ postAt: null }, { postAt: { lte: new Date() } }],
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

  // Collaborative assignments do not create a personal document. The student
  // opens the draft their group already owns, which is what removes the race two
  // partners hitting Start at the same moment would otherwise cause.
  //
  // Guarded so the solo path below is reached on exactly the same inputs it was
  // before this branch existed: every existing assignment has
  // collaborationEnabled false.
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
