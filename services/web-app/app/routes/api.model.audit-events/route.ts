import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { recordAuditEvent } from '~/utils/audit.server';

const BrowserAuditEventSchema = z.object({
  eventType: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  userId: z.string().optional(),
  profileId: z.string().optional(),
  sessionId: z.string().optional(),
  editorSessionId: z.string().optional(),
  documentId: z.string().optional(),
  path: z.string().optional(),
  route: z.string().optional(),
  method: z.string().optional(),
  statusCode: z.number().int().optional(),
  success: z.boolean().optional(),
  payload: z.unknown().optional(),
  metadata: z.unknown().optional(),
});

const RequestSchema = z.object({
  events: z.array(BrowserAuditEventSchema).max(50),
});

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return dataResponse(
      {
        ok: false,
        error: 'invalid_audit_events_payload',
      },
      { status: 400 }
    );
  }

  await Promise.all(
    parsed.data.events.map((event) =>
      recordAuditEvent({
        createdAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
        source: 'browser',
        eventType: event.eventType,
        userId: event.userId ?? null,
        profileId: event.profileId ?? null,
        sessionId: event.sessionId ?? null,
        editorSessionId: event.editorSessionId ?? null,
        documentId: event.documentId ?? null,
        route: event.route ?? null,
        path: event.path ?? null,
        method: event.method ?? null,
        statusCode: event.statusCode ?? null,
        success: event.success ?? null,
        payload: event.payload,
        metadata: event.metadata,
      })
    )
  );

  return dataResponse({
    ok: true,
    accepted: parsed.data.events.length,
  });
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
