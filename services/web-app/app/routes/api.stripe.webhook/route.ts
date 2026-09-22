import type { ActionFunctionArgs } from 'react-router';
import { processStripeWebhook } from '~/domain/student-license/student-license.server';

export async function action({ request }: ActionFunctionArgs) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing Stripe signature', { status: 400 });

  const rawBody = await request.text();
  try {
    const result = await processStripeWebhook(rawBody, signature);
    return Response.json({ received: true, ...result });
  } catch {
    return new Response('Invalid Stripe webhook', { status: 400 });
  }
}
