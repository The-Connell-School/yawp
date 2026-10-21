import { redirect, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { getMembershipId } from '~/cookies/membership-id.server';
import { getLockedPreviewApplication } from '~/domain/free-tier/locked-preview.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await getLockedPreviewApplication(
    userId,
    await getMembershipId(request)
  );
  if (!app || !['SENT', 'MANUAL_REVIEW'].includes(app.status))
    throw redirect('/app/free-tier/pending');
  throw redirect('/app');
}

export default function LockedPreviewRedirectRoute() {
  return null;
}
