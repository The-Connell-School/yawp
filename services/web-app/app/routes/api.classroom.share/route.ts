import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
} from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getDomainUrl } from '~/utils/misc.tsx';
import {
  findShareableClassAssignmentForTeacher,
  getOrCreateShareLink,
} from '~/integrations/google-classroom/share-link.server';
import {
  buildClassroomLaunchUrl,
  buildGoogleClassroomShareUrl,
} from '~/integrations/google-classroom/share-url';

/**
 * "Share to Google Classroom": mint (or reuse) this assignment's link and hand
 * the teacher to Google's course picker.
 *
 * A POST rather than a link so the token is minted by a deliberate act. If the
 * teacher page rendered the URL up front it would have to write on read, and
 * every assignment page view would create a share link nobody asked for.
 *
 * The redirect goes cross-origin to classroom.google.com, where the teacher
 * picks the course and Classroom creates the coursework itself. YAWP holds no
 * Google credentials in this flow — see docs/integrations/google-classroom.md
 * for the OAuth-based path this stops short of.
 */

/** Description Classroom prefills. Kept short; teachers edit it in Classroom. */
function buildClassroomBody(prompt: string | null | undefined): string {
  const trimmed = (prompt || '').trim();
  if (!trimmed) return 'Open this assignment in YAWP to start writing.';
  const firstLine = trimmed.split('\n')[0].trim();
  const excerpt =
    firstLine.length > 280 ? `${firstLine.slice(0, 277)}...` : firstLine;
  return `${excerpt}\n\nOpen the link to start writing in YAWP.`;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  if (membership.role !== 'TEACHER') {
    return new Response('Forbidden', { status: 403 });
  }

  // Rollout gate. 404 rather than 403: with the flag off the endpoint should
  // not appear to exist at all.
  if (!membership.organization.googleClassroomEnabled) {
    return new Response('Not Found', { status: 404 });
  }

  const form = await request.formData();
  const classAssignmentId = String(form.get('classAssignmentId') || '');
  if (!classAssignmentId) {
    return new Response('classAssignmentId is required', { status: 400 });
  }

  const classAssignment = await findShareableClassAssignmentForTeacher({
    classAssignmentId,
    membershipId: membership.id,
  });
  // Indistinguishable from "no such assignment" on purpose: a teacher probing
  // ids should not learn which ones exist in other schools.
  if (!classAssignment) {
    return new Response('Not Found', { status: 404 });
  }

  const link = await getOrCreateShareLink({
    classAssignmentId: classAssignment.id,
    membershipId: membership.id,
  });

  const launchUrl = buildClassroomLaunchUrl(getDomainUrl(request), link.token);
  const shareUrl = buildGoogleClassroomShareUrl({
    url: launchUrl,
    title:
      classAssignment.assignment.title ||
      classAssignment.assignment.assignmentType.title,
    body: buildClassroomBody(classAssignment.assignment.prompt),
    itemType: 'assignment',
  });

  return redirect(shareUrl);
}

export async function loader(_args: LoaderFunctionArgs) {
  // Sharing is a POST. A stray GET (a bookmark, a back button) should land the
  // teacher somewhere useful rather than on an error.
  return redirect('/app');
}
