import { z } from 'zod';
import { isUnifiedSignOnEnabled } from './gate.server';
import {
  browserContext,
  withFlow,
  FlowError,
  assertCurrentIdentity,
} from './flow.server';
import { readInvitation } from './invitations.server';
import {
  NameSchema,
  PasswordAndConfirmPasswordSchema,
} from '~/utils/schemas/user';
import { getPasswordHash, requireMutableRequest } from '~/utils/auth.server';
import { finishAuthentication } from './authentication.server';

export async function legacyTeacherContext(
  request: Request,
  email: string,
  organizationId: string
) {
  if (!(await isUnifiedSignOnEnabled())) return null;
  const context = await browserContext(request);
  if (!context) return null;
  try {
    return await withFlow(request, context.token, async (flow) =>
      flow.data.proof &&
      flow.data.identifier === email &&
      flow.data.legacyOrganizationId === organizationId
        ? { google: flow.data.proof === 'google' }
        : null
    );
  } catch {
    return null;
  }
}
/** Preserve the existing school selector for invitations with several schools,
 * while retaining server-held proof, provider mode and destination atomically. */
export async function completeLegacyTeacherSignup(
  request: Request,
  values: Record<string, string>
) {
  await requireMutableRequest(request);
  const context = await browserContext(request);
  return withFlow(request, context?.token, async (flow, tx) => {
    if (
      !flow.data.proof ||
      !flow.data.identifier ||
      !flow.data.legacyOrganizationId
    )
      throw new FlowError('Invalid invitation.');
    await assertCurrentIdentity(tx, flow);
    const invitation = await readInvitation(tx, flow);
    if (
      !invitation ||
      invitation.role !== 'TEACHER' ||
      invitation.owner ||
      invitation.organizationId !== flow.data.legacyOrganizationId
    )
      throw new FlowError('Invalid invitation.');
    const google = flow.data.proof === 'google';
    const parsed = z
      .object({ name: NameSchema, schoolId: z.string().min(1) })
      .and(google ? z.object({}) : PasswordAndConfirmPasswordSchema)
      .safeParse(values);
    if (!parsed.success) throw new FlowError('Check your details.');
    const school = await tx.school.findFirst({
      where: {
        id: values.schoolId,
        organizationId: flow.data.legacyOrganizationId,
      },
      select: { id: true },
    });
    if (!school) throw new FlowError('Choose a school from your invitation.');
    const hash = google ? undefined : await getPasswordHash(values.password);
    const existing = flow.data.userId
      ? await tx.user.findUniqueOrThrow({
          where: { id: flow.data.userId },
          include: { password: true },
        })
      : null;
    // Email proof can activate the originally resolved passwordless identity.
    // It must never replace credentials established since that proof, or link
    // an existing account through the new Google signup continuation.
    if (existing && (existing.password || !hash))
      throw new FlowError('Please sign in again.');
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            name: values.name,
            emailVerifiedAt: new Date(),
            mustChangePassword: false,
            password: { create: { hash: hash! } },
          },
        })
      : await tx.user.create({
          data: {
            email: flow.data.identifier,
            name: values.name,
            emailVerifiedAt: new Date(),
            ...(hash ? { password: { create: { hash } } } : {}),
          },
        });
    await tx.orgMembership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invitation.organizationId,
        },
      },
      create: {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: 'TEACHER',
        schools: { connect: { id: school.id } },
      },
      update: { role: 'TEACHER', schools: { connect: { id: school.id } } },
    });
    if (google && flow.data.pendingGoogle)
      await tx.signonIdentity.create({
        data: {
          provider: 'google',
          subject: flow.data.pendingGoogle.subject,
          userId: user.id,
        },
      });
    await tx.invitation.delete({ where: { id: invitation.invite.id } });
    flow.data.invitationId = undefined;
    flow.data.pendingGoogle = undefined;
    flow.data.legacyOrganizationId = undefined;
    const response = await finishAuthentication(tx, flow, request, user.id);
    const { invitationCookieStorage } =
      await import('~/cookie-session-storages/invitation.server');
    const invitationCookie = await invitationCookieStorage.getSession(
      request.headers.get('cookie')
    );
    response.headers.append(
      'set-cookie',
      await invitationCookieStorage.destroySession(invitationCookie)
    );
    return response;
  });
}
