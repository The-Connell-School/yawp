import { z } from 'zod';
import { isUnifiedSignOnEnabled } from './gate.server';
import { browserContext, withFlow, FlowError } from './flow.server';
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
    const user = await tx.user.create({
      data: {
        email: flow.data.identifier,
        name: values.name,
        emailVerifiedAt: new Date(),
        ...(hash ? { password: { create: { hash } } } : {}),
        memberships: {
          create: {
            organizationId: flow.data.legacyOrganizationId,
            role: 'TEACHER',
            schools: { connect: { id: school.id } },
          },
        },
      },
    });
    if (google && flow.data.pendingGoogle)
      await tx.signonIdentity.create({
        data: {
          provider: 'google',
          subject: flow.data.pendingGoogle.subject,
          userId: user.id,
        },
      });
    flow.data.pendingGoogle = undefined;
    flow.data.legacyOrganizationId = undefined;
    const response = await finishAuthentication(tx, flow, request, user.id);
    const { invitationCookieStorage } =
      await import('~/cookie-session-storages/invitation.server');
    const invitation = await invitationCookieStorage.getSession(
      request.headers.get('cookie')
    );
    response.headers.append(
      'set-cookie',
      await invitationCookieStorage.destroySession(invitation)
    );
    return response;
  });
}
