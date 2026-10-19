import { expect, mock, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

const mail = mock(async (_options: unknown) => ({ status: 'success' }));
mock.module('~/utils/email.server', () => ({ sendEmail: mail }));

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)(
  'signed owner invitation lifecycle persists rotation, replay and audit history in Postgres',
  async () => {
    const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
    const database = new URL(connection);
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !database.pathname.startsWith('/yawp_')
    )
      throw new Error('Requires an isolated local Yawp database');
    process.env.DATABASE_URL = connection;
    const { prisma } = await import('./db.server');
    const { createInternalOwnerInvitationHandlers } =
      await import('./internal-owner-invitations.server');
    const { signInternalApiRequest } =
      await import('./internal-platform-signing.server');
    const { verifyTOTP } = await import('./totp.server');
    const keyId = `owner-invitation-${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const saved = {
      keys: process.env.YAWP_INTERNAL_API_KEYS,
      nonceStore: process.env.INTERNAL_API_NONCE_STORE,
    };
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: keyId, secret, scopes: ['management:write', 'management:read'] },
    ]);
    delete process.env.INTERNAL_API_NONCE_STORE;
    const organization = await prisma.organization.create({
      data: { name: 'Owner invitation integration' },
    });
    const auditRead = async (data: any) => {
      await prisma.internalPlatformApiAudit.create({ data });
    };
    const handlers = createInternalOwnerInvitationHandlers({
      db: prisma,
      auditRead,
    });
    const email = `${keyId}@example.test`;
    let userId: string | undefined;
    let foreignOrgId: string | undefined;
    const revokeEmail = `revoke-${email}`;
    function request(
      method: string,
      path = '',
      value?: unknown,
      idempotency?: string,
      organizationId = organization.id
    ) {
      const url = `https://yawp.test/api/internal/v1/admin/organizations/${organizationId}/invitations${path}`;
      const body = value === undefined ? '' : JSON.stringify(value);
      const headers = new Headers(
        signInternalApiRequest({
          method,
          url,
          body,
          keyId,
          secret,
          actor: 'Operator@example.test',
        }).headers
      );
      if (idempotency) headers.set('Idempotency-Key', idempotency);
      return new Request(url, {
        method,
        headers,
        ...(method === 'GET' ? {} : { body }),
      });
    }
    try {
      const value = {
        emails: [email, email.toUpperCase()],
        expiresInDays: 30,
        reason: '  Integration owner onboarding  ',
      };
      // Fresh signatures and nonces, one key across both URL forms: creates serialize.
      const creates = await Promise.all(
        ['', '///'].map((path) =>
          handlers.create(request('POST', path, value, keyId), organization.id)
        )
      );
      expect(creates.map((r) => r.status).sort()).toEqual([200, 201]);
      const payloads = await Promise.all(creates.map((r) => r.json()));
      expect(payloads[0]).toEqual(payloads[1]);
      expect(mail).toHaveBeenCalledTimes(1);
      const original = payloads[0].results[0].invitation;
      const oldRow = await prisma.invitation.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(oldRow.organizationId).toBe(organization.id);
      expect(JSON.parse(oldRow.metadata!)).toEqual({
        organizationId: organization.id,
      });
      expect(
        (
          await handlers.create(
            request('POST', '', { ...value, expiresInDays: 7 }, keyId),
            organization.id
          )
        ).status
      ).toBe(409);
      const res = await handlers.resend(
        request('POST', `/${original.id}/resend`, { reason: 'Retry delivery' }),
        organization.id,
        original.id
      );
      expect(res.status).toBe(200);
      const replacement = (await res.json()).invitation;
      expect(replacement.id).not.toBe(original.id);
      expect(replacement.resendHistory).toEqual([
        { invitationId: original.id, resentAt: replacement.sentAt },
      ]);
      expect(
        await prisma.invitation.findUnique({ where: { id: original.id } })
      ).toBeNull();
      const newRow = await prisma.invitation.findUniqueOrThrow({
        where: { id: replacement.id },
      });
      expect(newRow.secret).not.toBe(oldRow.secret);
      // Verification uses the same persisted OTP configuration as the existing flow.
      const element = (mail.mock.calls[1][0] as any).react;
      const link = element.props.children.props.children.find(
        (child: any) => child?.props?.href
      );
      const code = new URL(link.props.href).searchParams.get('code')!;
      expect(await verifyTOTP({ otp: code, ...newRow })).toBeTruthy();
      expect(await verifyTOTP({ otp: code, ...oldRow })).toBeNull();
      mail.mockImplementationOnce(async () => {
        throw new Error('Mock delivery failure');
      });
      const failedResend = await handlers.resend(
        request('POST', `/${replacement.id}/resend`, {
          reason: 'Delivery failure rollback',
        }),
        organization.id,
        replacement.id
      );
      expect(failedResend.status).toBe(502);
      expect(await failedResend.json()).toEqual({
        error: 'Invitation delivery failed',
      });
      expect(
        await prisma.invitation.findUnique({ where: { id: replacement.id } })
      ).not.toBeNull();
      expect(
        await prisma.internalPlatformApiAudit.count({
          where: { keyId, result: 'after' },
        })
      ).toBe(2);
      // Simulate the existing acceptance transaction: owner grant + invitation removal.
      const user = await prisma.user.create({
        data: { email, name: 'Owner integration' },
      });
      userId = user.id;
      await prisma.$transaction(async (tx) => {
        await tx.orgMembership.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: 'TEACHER',
            isOrgOwner: true,
          },
        });
        await tx.invitation.delete({ where: { id: replacement.id } });
      });
      const listed = await handlers.list(request('GET'), organization.id);
      expect(listed.status).toBe(200);
      const invitations = (await listed.json()).invitations;
      expect(invitations.find((i: any) => i.id === original.id).status).toBe(
        'revoked'
      );
      expect(invitations.find((i: any) => i.id === replacement.id).status).toBe(
        'accepted'
      );
      const audits = await prisma.internalPlatformApiAudit.findMany({
        where: { keyId },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.filter((a) => a.result === 'before')).toHaveLength(2);
      expect(audits.filter((a) => a.result === 'after')).toHaveLength(2);
      expect(
        audits
          .filter((a) =>
            a.action?.startsWith('organization.invitation.create.')
          )
          .every(
            (a) => (a.metadata as any).reason === 'Integration owner onboarding'
          )
      ).toBe(true);
      expect(JSON.stringify(audits)).not.toContain(newRow.secret);
      expect(JSON.stringify(audits)).not.toContain(oldRow.secret);
      // Accepted is a no-op even though acceptance has removed the live row.
      const acceptedRevoke = await handlers.revoke(request('POST', `/${replacement.id}/revoke`, {}), organization.id, replacement.id);
      expect(acceptedRevoke.status).toBe(200);
      expect((await acceptedRevoke.json()).invitation.status).toBe('accepted');
      expect(await prisma.orgMembership.count({ where: { organizationId: organization.id, isOrgOwner: true } })).toBe(1);

      const created = await handlers.create(request('POST', '', { emails: [revokeEmail], expiresInDays: 7 }), organization.id);
      const revocable = (await created.json()).results[0].invitation;
      const persisted = await prisma.invitation.findUniqueOrThrow({ where: { id: revocable.id } });
      const foreign = await prisma.organization.create({ data: { name: 'Foreign invitation integration' } });
      foreignOrgId = foreign.id;
      const notOwned = await handlers.revoke(request('POST', `/${revocable.id}/revoke`, {}, undefined, foreign.id), foreign.id, revocable.id);
      expect(notOwned.status).toBe(404);
      expect(await notOwned.json()).toEqual({ error: 'Invitation not found' });
      const valueRevoke = { reason: '  Integration revoke  ' };
      const sentBeforeRevoke = mail.mock.calls.length;
      const revokedResponses = await Promise.all(['', '///'].map((alias) => handlers.revoke(request('POST', `/${revocable.id}/revoke${alias}`, valueRevoke, 'revoke-key'), organization.id, revocable.id)));
      expect(revokedResponses.map((r) => r.status)).toEqual([200, 200]);
      const revoked = await revokedResponses[0].json();
      expect(await revokedResponses[1].json()).toEqual(revoked);
      expect(revoked.invitation).toEqual({ ...revocable, status: 'revoked' });
      expect(await prisma.invitation.findUnique({ where: { id: revocable.id } })).toBeNull();
      const again = await handlers.revoke(request('POST', `/${revocable.id}/revoke`), organization.id, revocable.id);
      expect(await again.json()).toEqual(revoked);
      const conflict = await handlers.revoke(request('POST', `/${revocable.id}/revoke`, { reason: 'Different bytes' }, 'revoke-key'), organization.id, revocable.id);
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({ error: 'Idempotency-Key was already used with a different request' });
      const unknown = await handlers.revoke(request('POST', '/unknown/revoke', {}), organization.id, 'unknown');
      expect(unknown.status).toBe(404);
      expect(mail.mock.calls.length).toBe(sentBeforeRevoke);
      const revokeAudits = await prisma.internalPlatformApiAudit.findMany({ where: { keyId, action: { startsWith: 'organization.invitation.revoke.' } }, orderBy: { createdAt: 'asc' } });
      expect(revokeAudits.map((a) => a.result)).toEqual(['before', 'after']);
      expect(revokeAudits.every((a) => a.targetId === organization.id && a.actorEmail === 'operator@example.test' && (a.metadata as any).reason === 'Integration revoke')).toBe(true);
      expect(JSON.stringify(revokeAudits)).not.toContain(persisted.secret);
      const finalList = await handlers.list(request('GET'), organization.id);
      expect((await finalList.json()).invitations.find((i: any) => i.id === revocable.id)).toEqual(revoked.invitation);

    } finally {
      await prisma.invitation.deleteMany({ where: { target: { in: [email, revokeEmail] } } });
      await prisma.orgMembership.deleteMany({
        where: { organizationId: organization.id },
      });
      await prisma.organization.delete({ where: { id: organization.id } });
      if (foreignOrgId) await prisma.organization.delete({ where: { id: foreignOrgId } });
      if (userId) await prisma.user.delete({ where: { id: userId } });
      await prisma.internalPlatformApiAudit.deleteMany({ where: { keyId } });
      await prisma.internalApiRequestNonce.deleteMany({ where: { keyId } });
      if (saved.keys === undefined) delete process.env.YAWP_INTERNAL_API_KEYS;
      else process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
      if (saved.nonceStore === undefined)
        delete process.env.INTERNAL_API_NONCE_STORE;
      else process.env.INTERNAL_API_NONCE_STORE = saved.nonceStore;
      await prisma.$disconnect();
    }
  },
  30000
);
