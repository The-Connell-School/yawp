import { redirect, type LoaderFunctionArgs } from 'react-router';
import { fulfillCheckoutSession } from '~/domain/student-license/student-license.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId, {
    allowPaymentRequired: true,
  });
  const checkoutSessionId = new URL(request.url).searchParams.get('session_id');
  if (!checkoutSessionId) {
    return new Response('Missing Checkout Session', { status: 400 });
  }

  try {
    const fulfillment = await fulfillCheckoutSession(checkoutSessionId);
    if (fulfillment.membershipId !== membership.id) {
      return new Response('Checkout Session belongs to another membership', {
        status: 403,
      });
    }
  } catch {
    return new Response('Payment could not be verified', { status: 400 });
  }

  return redirect('/app');
}
