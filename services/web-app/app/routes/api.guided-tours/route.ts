import { getMembershipId } from '~/cookies/membership-id.server';
import { getLockedPreviewApplication } from '~/domain/free-tier/locked-preview.server';
import type { ActionFunctionArgs } from 'react-router';
import { GUIDED_TOURS_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFreeTierEnabled, isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import {
  recordTourOutcome,
  resetTours,
} from '~/domain/guided-tours/guided-tours.server';
import {
  guidedToursAvailable,
  isTourId,
  isTourStatus,
} from '~/domain/guided-tours/tours';
import { requireMembership, requireUserId } from '~/utils/auth.server';

/**
 * Records that a free classroom teacher finished or skipped a page tour, or,
 * with `intent=reset`, forgets them all so every page greets them again.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const waiting = await getLockedPreviewApplication(userId, await getMembershipId(request));
  if (waiting) {
    if (!(await isFreeTierEnabled()) ||
        !(await isFeatureFlagEnabled(GUIDED_TOURS_FLAG, waiting.organizationId ?? undefined)))
      return Response.json({ error: 'Not found' }, { status: 404 });
    const form = await request.formData();
    const status = form.get('status');
    if (!['SENT', 'MANUAL_REVIEW'].includes(waiting.status) ||
        form.get('intent') !== null || form.get('tourId') !== 'waiting-preview' || !isTourStatus(status))
      return Response.json({ error: 'approval_required' }, { status: 403 });
    await recordTourOutcome(userId, 'waiting-preview', status);
    return Response.json({ ok: true });
  }
  const membership = await requireMembership(request, userId);
  const available = guidedToursAvailable({
    freeTierEnabled: await isFreeTierEnabled(),
    role: membership.role,
    plan: membership.organization.plan,
  });
  if (!available || !(await isFeatureFlagEnabled(GUIDED_TOURS_FLAG, membership.organization.id))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData();
  if (formData.get('intent') === 'reset') {
    await resetTours(userId);
    return Response.json({ ok: true });
  }
  const tourId = formData.get('tourId');
  const status = formData.get('status');
  if (!isTourId(tourId) || !isTourStatus(status)) {
    return Response.json({ error: 'Invalid tour' }, { status: 400 });
  }

  await recordTourOutcome(userId, tourId, status);
  return Response.json({ ok: true });
}
