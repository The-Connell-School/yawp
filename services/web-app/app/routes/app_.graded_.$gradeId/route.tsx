import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

/**
 * Legacy grade redirect route.
 *
 * Old URLs like /app/graded/:gradeId no longer exist because the Grade table
 * has been replaced by the Submission table. This route looks up the
 * LegacyGradeRedirect mapping to find the corresponding submissionId and
 * redirects to the document page (Phase 3 will add a dedicated submission view
 * at /app/submissions/:submissionId).
 */
export async function loader({ params }: LoaderFunctionArgs) {
  invariant(params.gradeId, 'No grade id found');

  const mapping = await prisma.legacyGradeRedirect.findUnique({
    where: { gradeId: params.gradeId },
    select: { submissionId: true },
  });

  if (!mapping) {
    return redirectWithToast('/app', {
      description: 'Grade not found.',
      type: 'error',
    });
  }

  // Look up the submission to get the documentId for redirect
  const submission = await prisma.submission.findUnique({
    where: { id: mapping.submissionId },
    select: {
      id: true,
      documentId: true,
    },
  });

  if (!submission) {
    return redirectWithToast('/app', {
      description: 'Submission not found.',
      type: 'error',
    });
  }

  // Redirect to the document page — Phase 3 will add /app/submissions/:id
  return redirect(`/app/documents/${submission.documentId}`);
}

export default function Route() {
  // This route always redirects in the loader — this component should never render.
  return null;
}
