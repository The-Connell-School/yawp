import type { ActionFunctionArgs } from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { recordTourOutcome } from '~/domain/guided-tours/guided-tours.server';
import {
  guidedToursAvailable,
  isTourId,
  isTourStatus,
} from '~/domain/guided-tours/tours';
import { requireMembership, requireUserId } from '~/utils/auth.server';

/** Records that a free classroom teacher finished or skipped a page tour. */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const available = guidedToursAvailable({
    freeTierEnabled: await isFreeTierEnabled(),
    role: membership.role,
    plan: membership.organization.plan,
  });
  if (!available) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const tourId = formData.get('tourId');
  const status = formData.get('status');
  if (!isTourId(tourId) || !isTourStatus(status)) {
    return Response.json({ error: 'Invalid tour' }, { status: 400 });
  }

  await recordTourOutcome(userId, tourId, status);
  return Response.json({ ok: true });
}
