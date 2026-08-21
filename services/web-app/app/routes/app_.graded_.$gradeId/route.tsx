import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, redirect } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
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
 *
 * A session is required before the mapping is read. The route hands back a
 * document id in the `Location` header, so without a session it is a free
 * legacy-id -> document-id oracle: exactly the input every document-scoped
 * endpoint needs before it can be attacked. The destination page
 * (`app_.documents_.$id`) is properly authorized, so this loader does not need
 * to authorize the document itself — it only exists so an authenticated user
 * following an old bookmark lands somewhere sensible.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.gradeId, 'No grade id found');
  await requireUserId(request);

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
