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
    function request(
      method: string,
      path = '',
      value?: unknown,
      idempotency?: string
    ) {
      const url = `https://yawp.test/api/internal/v1/admin/organizations/${organization.id}/invitations${path}`;
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
      // Fresh signatures and nonces, one idempotency key: concurrent creates serialize.
      const creates = await Promise.all(
        [1, 2].map(() =>
          handlers.create(request('POST', '', value, keyId), organization.id)
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
    } finally {
      await prisma.invitation.deleteMany({ where: { target: email } });
      await prisma.orgMembership.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
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
