import type { PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { getDomainUrl } from './misc';
import { authorizeInternalApiRequest } from './internal-platform-auth.server';
import { auditRead, identifier } from './internal-assignment-types.server';
import {
  response,
  readBoundedBody,
  reasonSchema,
  requestHash,
  writeAuditRows,
} from './internal-admin-write.server';
import {
  issueOwnerInvitation,
  invalidateOwnerInvitation,
  listOwnerInvitations,
  ownerEmails,
  ownerInvitationOrganization,
  OwnerInvitationDeliveryError,
  type OwnerInvitation,
} from '~/domain/organizations/owner-invitations.server';

const createSchema = z
  .object({
    emails: z
      .array(z.string().trim().toLowerCase().email().max(254))
      .min(1)
      .max(50)
      .transform((emails) => [...new Set(emails)]),
    expiresInDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
    note: z.string().trim().min(1).max(2000).optional(),
    reason: reasonSchema,
  })
  .strict();
const resendSchema = z.object({ reason: reasonSchema }).strict();
type Result = {
  email: string;
  outcome:
    | 'invited'
    | 'already_member'
    | 'already_pending'
    | 'invitation_conflict';
  invitation?: OwnerInvitation;
};

export function createInternalOwnerInvitationHandlers(input: {
  db: Pick<PrismaClient, '$transaction'>;
  auditRead: Parameters<typeof auditRead>[2];
  authenticate?: typeof authorizeInternalApiRequest;
}) {
  const authenticate = input.authenticate ?? authorizeInternalApiRequest;
  async function handle(
    operation: 'list' | 'create' | 'resend' | 'revoke',
    request: Request,
    id?: string,
    invitationId?: string
  ) {
    if (request.method !== (operation === 'list' ? 'GET' : 'POST'))
      return response({ error: 'Method not allowed' }, 405);
    let body = new Uint8Array(0);
    try {
      if (operation !== 'list')
        body = await readBoundedBody(request, 256 * 1024);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
    const auth = await authenticate(request, {
      body,
      requiredScope:
        operation === 'list' ? 'management:read' : 'management:write',
    });
    if (auth instanceof Response)
      return auth.status === 404
        ? response({ error: 'Unauthorized' }, 401)
        : auth;
    if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
    if (
      !id ||
      !identifier.test(id) ||
      ((operation === 'resend' || operation === 'revoke') &&
        (!invitationId || !identifier.test(invitationId)))
    )
      return response({ error: 'Invalid organization or invitation id' }, 400);
    if (operation === 'list') {
      const result = await input.db.$transaction(
        async (tx) => {
          if (
            !(await tx.organization.findUnique({
              where: { id },
              select: { id: true },
            }))
          )
            return response({ error: 'Organization not found' }, 404);
          return response({ invitations: await listOwnerInvitations(tx, id) });
        },
        { isolationLevel: 'ReadCommitted' }
      );
      if (result.ok)
        await auditRead(
          request,
          auth,
          input.auditRead,
          'organization.invitations.list.success'
        );
      return result;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          body
        ) || '{}'
      );
    } catch {
      return response({ error: 'Invalid JSON' }, 400);
    }
    const parsed = (
      operation === 'create' ? createSchema : resendSchema
    ).safeParse(raw);
    if (!parsed.success)
      return response({ error: 'Invalid invitation request' }, 400);
    const hash = requestHash(body);
    const endpoint =
      operation === 'create'
        ? `POST /api/internal/v1/admin/organizations/${id}/invitations`
        : `POST /api/internal/v1/admin/organizations/${id}/invitations/${invitationId}/${operation}`;
    const action = `organization.invitation.${operation}`;
    const idempotencyKey =
      operation === 'create' || operation === 'revoke'
        ? request.headers.get('idempotency-key')?.trim() || null
        : null;
    if (idempotencyKey && idempotencyKey.length > 200)
      return response({ error: 'Invalid Idempotency-Key' }, 400);
    try {
      return await input.db.$transaction(
        async (tx) => {
          if (idempotencyKey) {
            const scope = JSON.stringify([
              action,
              id,
              auth.actorEmail,
              auth.keyId,
              idempotencyKey,
            ]);
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
          }
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id} FOR UPDATE`;
          const organization = await tx.organization.findUnique({
            where: { id },
            select: { id: true, name: true },
          });
          if (!organization)
            return response({ error: 'Organization not found' }, 404);
          if (idempotencyKey) {
            const previous = await tx.internalPlatformApiAudit.findFirst({
              where: {
                ...(operation === 'revoke' ? {} : { endpoint }),
                action:
                  operation === 'revoke'
                    ? { in: [`${action}.after`, `${action}.noop`] }
                    : `${action}.after`,
                result:
                  operation === 'revoke' ? { in: ['after', 'noop'] } : 'after',
                actorEmail: auth.actorEmail,
                keyId: auth.keyId,
                targetId: id,
                metadata: { path: ['idempotencyKey'], equals: idempotencyKey },
              },
              orderBy: { createdAt: 'desc' },
            });
            if (previous) {
              if (previous.requestHash !== hash)
                return response(
                  {
                    error:
                      'Idempotency-Key was already used with a different request',
                  },
                  409
                );
              const after = (
                previous.metadata as unknown as {
                  after?: { results?: Result[]; invitation?: OwnerInvitation };
                }
              )?.after;
              if (operation === 'revoke' && after?.invitation)
                return response({ invitation: after.invitation });
              if (operation === 'revoke' || !after?.results)
                return response(
                  { error: 'Idempotency-Key could not be replayed safely' },
                  409
                );
              return response({ results: after.results });
            }
          }
          if (operation === 'revoke')
            await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${invitationId} FOR UPDATE`;
          const before = await listOwnerInvitations(tx, id);
          const invitations = structuredClone(before);
          const results: Result[] = [];
          let resent: OwnerInvitation | undefined;
          if (operation === 'revoke') {
            const invitation = invitations.find((i) => i.id === invitationId);
            if (!invitation)
              return response({ error: 'Invitation not found' }, 404);
            if (
              invitation.status === 'accepted' ||
              invitation.status === 'revoked'
            ) {
              // No state change and no write-audit pair. A keyed no-op still needs
              // a durable replay receipt to bind its exact bytes and response.
              if (idempotencyKey)
                await tx.internalPlatformApiAudit.createMany({
                  data: [
                    {
                      actorEmail: auth.actorEmail,
                      keyId: auth.keyId,
                      endpoint,
                      requestHash: hash,
                      result: 'noop',
                      action: `${action}.noop`,
                      targetId: id,
                      metadata: {
                        after: { invitation },
                        idempotencyKey,
                        reason: parsed.data.reason ?? null,
                      },
                    },
                  ],
                });
              return response({ invitation });
            }
            await invalidateOwnerInvitation(tx, invitation.id);
            invitation.status = 'revoked';
            await writeAuditRows(tx, {
              auth,
              endpoint,
              hash,
              action,
              targetId: id,
              before: { invitations: before },
              after: { invitations, invitation },
              reason: parsed.data.reason ?? null,
              idempotencyKey,
            });
            return response({ invitation });
          }
          if (operation === 'resend') {
            const old = invitations.find((i) => i.id === invitationId);
            if (!old) return response({ error: 'Invitation not found' }, 404);
            if (old.status === 'accepted' || old.status === 'revoked')
              return response({ error: 'Invitation cannot be resent' }, 409);
            const scope = JSON.stringify(['owner-invitation.email', old.email]);
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
            // Unique delete races safely with acceptance: rollback if already consumed.
            await invalidateOwnerInvitation(tx, old.id);
            resent = await issueOwnerInvitation(tx, {
              organization,
              email: old.email,
              expiresInDays: 7,
              origin: getDomainUrl(request),
            });
            resent.resendHistory = [
              ...old.resendHistory,
              { invitationId: old.id, resentAt: resent.sentAt },
            ];
            old.status = 'revoked';
            invitations.push(resent);
          } else {
            const data = createSchema.parse(raw);
            // Stable email lock order also serializes the legacy global target/type
            // uniqueness constraint across different organizations.
            for (const email of [...data.emails].sort()) {
              const scope = JSON.stringify(['owner-invitation.email', email]);
              await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
            }
            const owners = await ownerEmails(tx, id);
            for (const email of data.emails) {
              if (owners.has(email)) {
                results.push({ email, outcome: 'already_member' });
                continue;
              }
              const existing = await tx.invitation.findFirst({
                where: {
                  type: 'onboard-owner',
                  target: { equals: email, mode: 'insensitive' },
                },
              });
              if (existing && ownerInvitationOrganization(existing) !== id) {
                results.push({ email, outcome: 'invitation_conflict' });
                continue;
              }
              if (
                existing &&
                (!existing.expiresAt || existing.expiresAt > new Date())
              ) {
                results.push({
                  email,
                  outcome: 'already_pending',
                  invitation: invitations.find((i) => i.id === existing.id),
                });
                continue;
              }
              if (existing) {
                await invalidateOwnerInvitation(tx, existing.id);
                const old = invitations.find((i) => i.id === existing.id);
                if (old) old.status = 'revoked';
              }
              const invitation = await issueOwnerInvitation(tx, {
                organization,
                email,
                expiresInDays: data.expiresInDays,
                note: data.note,
                origin: getDomainUrl(request),
              });
              invitations.push(invitation);
              results.push({ email, outcome: 'invited', invitation });
            }
          }
          await writeAuditRows(tx, {
            auth,
            endpoint,
            hash,
            action,
            targetId: id,
            before: { invitations: before },
            after: {
              invitations,
              ...(operation === 'create' ? { results } : {}),
            },
            reason: parsed.data.reason ?? null,
            idempotencyKey,
          });
          return operation === 'create'
            ? response({ results }, 201)
            : response({ invitation: resent });
        },
        { isolationLevel: 'ReadCommitted', timeout: 30000 }
      );
    } catch (error) {
      if (error instanceof OwnerInvitationDeliveryError)
        return response({ error: 'Invitation delivery failed' }, 502);
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2025')
          return response({ error: 'Invitation is no longer available' }, 409);
        if (error.code === 'P2002')
          return response(
            { error: 'Invitation changed; retry the request' },
            409
          );
      }
      throw error;
    }
  }
  return {
    list: (request: Request, id?: string) => handle('list', request, id),
    create: (request: Request, id?: string) => handle('create', request, id),
    revoke: (request: Request, id?: string, invitationId?: string) =>
      handle('revoke', request, id, invitationId),
    resend: (request: Request, id?: string, invitationId?: string) =>
      handle('resend', request, id, invitationId),
  };
}
