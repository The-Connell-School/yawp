import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { openClassAssignmentForStudent } from '~/domain/assignments/open-class-assignment.server';
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
    },
  });

  if (!classAssignment) {
    return redirectWithToast('/app?tab=assignments', {
      type: 'error',
      description: 'Assignment not found.',
    });
  }

  const opened = await openClassAssignmentForStudent({
    classAssignmentId: classAssignment.id,
    membershipId: profile.id,
  });

  if (!opened.ok) {
    return redirectWithToast('/app?tab=assignments', {
      type: 'error',
      description: opened.message,
    });
  }

  if (opened.url.includes('/app/collab-documents/')) {
    return redirectWithToast(opened.url, {
      type: 'success',
      description: 'Opening your group document.',
    });
  }

  return redirectWithToast(opened.url, {
    type: 'success',
    description: 'Document created successfully.',
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  // GET requests to the start endpoint should be handled (not error).
  // Redirect users back to the assignments tab where they can initiate the start flow.
  return redirect('/app?tab=assignments');
}
