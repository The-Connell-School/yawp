import type { ActionFunctionArgs } from 'react-router';
import { handleInboundEmailEvent } from '~/domain/free-tier/email-provider-events.server';

/** Resend (Svix) and SES (SNS) delivery events. Unsigned bodies are refused. */
export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  const result = await handleInboundEmailEvent({
    rawBody,
    headers: request.headers,
  });
  return Response.json(result.body, { status: result.status });
}
