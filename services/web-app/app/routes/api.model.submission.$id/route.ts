import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';

/**
 * Stub route — the archive/unarchive functionality from the old
 * DocumentSnapshot model has been removed. Submissions are permanent.
 * This route is kept to avoid 404s on any lingering client-side calls.
 */
export async function action({ params }: ActionFunctionArgs) {
  invariant(params.id, 'No submission id provided');

  return dataResponse(
    {
      success: false,
      message: 'Archive/unarchive is no longer supported for submissions.',
    },
    { status: 410 }
  );
}
