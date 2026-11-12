import { type LoaderFunctionArgs, redirect } from 'react-router';
import {
  DocumentCreationError,
  documentCreationErrorTextForClient,
} from '~/domain/documents.server';
import { createOrReuseTeacherAssignmentPreviewDocument } from '~/domain/assignments/teacher-assignment-preview.server';
import { resolveTeacherTryItClassAssignment } from '~/domain/assignments/teacher-assignment-try-it.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { redirectWithToast } from '~/utils/toast.server';

function safeReturnTo(raw: string | null) {
  if (!raw?.startsWith('/app') || raw.includes('://')) return '/app/assignments';
  return raw;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const assignmentId = params.assignmentId;
  if (!assignmentId) {
    return redirectWithToast('/app/assignments', {
      type: 'error',
      description: 'Assignment not found.',
    });
  }

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return redirectWithToast('/app', {
      type: 'error',
      description: 'Only teachers can try assignments as a student.',
    });
  }

  const url = new URL(request.url);
  const classAssignment = await resolveTeacherTryItClassAssignment({
    assignmentId,
    teacherMembershipId: profile.id,
    classId: url.searchParams.get('classId'),
  });

  if (!classAssignment) {
    return redirectWithToast('/app/assignments', {
      type: 'error',
      description: 'That assignment is not in one of your classes.',
    });
  }

  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));

  let documentId = '';
  try {
    const created = await createOrReuseTeacherAssignmentPreviewDocument({
      membershipId: profile.id,
      assignmentTypeId: classAssignment.assignment.assignmentTypeId,
      assignmentId: classAssignment.assignmentId,
      teacherPreviewClassAssignmentId: classAssignment.id,
    });
    documentId = created.documentId;
  } catch (creationError) {
    if (creationError instanceof DocumentCreationError) {
      return redirectWithToast(returnTo, {
        type: 'error',
        description: documentCreationErrorTextForClient(
          creationError,
          'Could not open this assignment preview.',
        ),
      });
    }
    throw creationError;
  }

  const redirectParams = new URLSearchParams({
    spa: '1',
    exitTo: returnTo,
  });

  return redirect(`/app/documents/${documentId}?${redirectParams}`);
}
