import { redirect } from 'react-router';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { prisma } from '~/utils/db.server.ts';
import { normalizeEmail } from '~/utils/normalize-email';
import {
  OwnerOnboardingMetadataSchema,
  StudentOnboardingMetadataSchema,
  TeacherOnboardingMetadataSchema,
} from '~/utils/schemas/invitation';
import { redirectWithToast } from '~/utils/toast.server';
import { verifyTOTP } from '~/utils/totp.server.ts';
import type { OrgMembership } from '@app/prisma';
import { z } from 'zod';

export const VerifyInvitationSchema = z.object({
  code: z.string().min(6).max(6),
  type: z.enum([
    'onboard-student',
    'onboard-teacher',
    'onboard-owner',
    'password-reset',
  ]),
  target: z.string(),
});

type VerifyInput = z.infer<typeof VerifyInvitationSchema>;

export type VerifyInvitationResult =
  | { ok: true; response: Response }
  | { ok: false; fieldErrors: Record<string, string> };

async function invitationForTarget(type: string, normalizedTarget: string) {
  return prisma.invitation.findFirst({
    where: {
      type,
      target: {
        equals: normalizedTarget,
        mode: 'insensitive',
      },
    },
    select: {
      expiresAt: true,
      algorithm: true,
      secret: true,
      period: true,
      charSet: true,
      digits: true,
      id: true,
      metadata: true,
    },
  });
}

export async function verifyInvitationCredentials(
  input: VerifyInput
): Promise<VerifyInvitationResult> {
  const { target, type } = input;
  const normalizedTarget = normalizeEmail(target);

  const invitation = await invitationForTarget(type, normalizedTarget);

  if (!invitation) {
    return { ok: false, fieldErrors: { code: 'Invalid code.' } };
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return { ok: false, fieldErrors: { code: 'Invitation has expired.' } };
  }

  const verification = await verifyTOTP({ otp: input.code, ...invitation });
  if (!verification) {
    return { ok: false, fieldErrors: { code: 'Invalid code.' } };
  }

  return completeVerifiedInvitation({
    request: null,
    type,
    normalizedTarget,
    invitation,
  });
}

export async function completeVerifiedInvitation({
  request,
  type,
  normalizedTarget,
  invitation,
}: {
  request: Request | null;
  type: VerifyInput['type'];
  normalizedTarget: string;
  invitation: {
    id: string;
    metadata: string | null;
  };
}): Promise<VerifyInvitationResult> {
  const cookieHeader = request?.headers.get('cookie') ?? null;
  const invitationCookie =
    await invitationCookieStorage.getSession(cookieHeader);

  if (type === 'onboard-student') {
    const parsedMetadata = StudentOnboardingMetadataSchema.safeParse(
      JSON.parse(invitation.metadata ?? '{}')
    );

    if (!parsedMetadata.success) {
      return {
        ok: false,
        fieldErrors: { code: 'Invalid metadata. Please sign up again.' },
      };
    }

    const metadata = parsedMetadata.data;
    const isUa = 'partner' in metadata;
    let klassId: string | undefined;
    let klassIds: string[] | undefined;
    let schoolId: string | undefined;
    if (!isUa) {
      klassId = metadata.klassId;
      klassIds = metadata.klassIds;
      schoolId = metadata.schoolId;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedTarget,
          mode: 'insensitive',
        },
      },
    });

    if (existingUser) {
      invitationCookie.set('email', normalizedTarget);
      invitationCookie.set('klassId', klassId);
      invitationCookie.set('klassIds', klassIds);
      invitationCookie.set('schoolId', schoolId);
      return {
        ok: true,
        response: redirectWithToast(
          '/auth/login?redirectTo=%2Fapp',
          {
            title: 'Sign in to join your class',
            description:
              'You already have a Yawp! account with this email. Sign in to finish joining the class.',
          },
          {
            headers: {
              'set-cookie':
                await invitationCookieStorage.commitSession(invitationCookie),
            },
          }
        ),
      };
    }

    await prisma.invitation.delete({ where: { id: invitation.id } });

    invitationCookie.set('klassId', klassId);
    invitationCookie.set('klassIds', klassIds);
    invitationCookie.set('schoolId', schoolId);
    if (isUa) {
      invitationCookie.set('partner', 'ua');
      invitationCookie.set('organizationId', metadata.organizationId);
    }
    invitationCookie.set('email', normalizedTarget);
    return {
      ok: true,
      response: redirect('/auth/inv/onboard-student', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      }),
    };
  }

  if (type === 'onboard-teacher') {
    const { organizationId } = JSON.parse(
      invitation.metadata ?? '{}'
    ) as z.infer<typeof TeacherOnboardingMetadataSchema>;

    if (!organizationId) {
      return { ok: false, fieldErrors: { code: 'Invalid code.' } };
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedTarget,
          mode: 'insensitive',
        },
      },
      include: {
        memberships: {
          where: { organizationId: organizationId },
        },
      },
    });

    await prisma.invitation.delete({ where: { id: invitation.id } });

    if (existingUser) {
      let membership: OrgMembership;
      if (existingUser.memberships.length > 0) {
        if (existingUser.memberships[0].role === 'TEACHER') {
          return {
            ok: true,
            response: redirectWithToast(
              '/app',
              {
                title: 'Teacher membership already exists',
                description: 'Your teacher membership has already been created.',
              },
              {
                headers: {
                  'set-cookie': [
                    await invitationCookieStorage.destroySession(
                      invitationCookie
                    ),
                    await setMembershipId(existingUser.memberships[0].id),
                  ].join(';'),
                },
              }
            ),
          };
        }
        const membershipToUpdate = existingUser.memberships[0];
        membership = await prisma.orgMembership.update({
          where: { id: membershipToUpdate.id },
          data: { role: 'TEACHER' },
        });
      } else {
        membership = await prisma.orgMembership.create({
          data: {
            user: { connect: { id: existingUser.id } },
            organization: { connect: { id: organizationId } },
            role: 'TEACHER',
          },
        });
      }

      return {
        ok: true,
        response: redirectWithToast(
          '/app',
          {
            title: 'Invitation accepted',
            description:
              'You have successfully accepted an invitation to join an organization.',
          },
          {
            headers: {
              'set-cookie': [
                await invitationCookieStorage.destroySession(invitationCookie),
                await setMembershipId(membership.id),
              ].join(';'),
            },
          }
        ),
      };
    }

    invitationCookie.set('organizationId', organizationId);
    invitationCookie.set('email', normalizedTarget);
    return {
      ok: true,
      response: redirect('/auth/inv/onboard-teacher', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      }),
    };
  }

  if (type === 'onboard-owner') {
    const { organizationId } = JSON.parse(
      invitation.metadata ?? '{}'
    ) as z.infer<typeof OwnerOnboardingMetadataSchema>;

    if (!organizationId) {
      return { ok: false, fieldErrors: { code: 'Invalid code.' } };
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedTarget,
          mode: 'insensitive',
        },
      },
      include: {
        memberships: { where: { organizationId: organizationId } },
      },
    });

    await prisma.invitation.delete({ where: { id: invitation.id } });

    if (existingUser) {
      let membership: OrgMembership;
      if (existingUser.memberships.length > 0) {
        const membershipToUpdate = existingUser.memberships[0];
        membership = await prisma.orgMembership.update({
          where: { id: membershipToUpdate.id },
          data: { isOrgOwner: true },
        });
      } else {
        membership = await prisma.orgMembership.create({
          data: {
            user: { connect: { id: existingUser.id } },
            organization: { connect: { id: organizationId } },
            role: 'TEACHER',
            isOrgOwner: true,
          },
        });
      }

      return {
        ok: true,
        response: redirectWithToast(
          '/app',
          {
            title: 'Invitation accepted',
            description:
              'You have successfully accepted an invitation to join an organization.',
          },
          {
            headers: {
              'set-cookie': [
                await invitationCookieStorage.destroySession(invitationCookie),
                await setMembershipId(membership.id),
              ].join(';'),
            },
          }
        ),
      };
    }

    invitationCookie.set('organizationId', organizationId);
    invitationCookie.set('email', normalizedTarget);
    return {
      ok: true,
      response: redirect('/auth/inv/onboard-owner', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      }),
    };
  }

  if (type === 'password-reset') {
    await prisma.invitation.delete({ where: { id: invitation.id } });
    invitationCookie.set('email', normalizedTarget);
    return {
      ok: true,
      response: redirect('/auth/inv/forgot-password-reset', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      }),
    };
  }

  return { ok: false, fieldErrors: { code: 'Invalid code.' } };
}

export async function verifyInvitationFromQuery(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  const parsed = VerifyInvitationSchema.safeParse({
    code: url.searchParams.get('code') ?? '',
    type: url.searchParams.get('type') ?? '',
    target: url.searchParams.get('target') ?? '',
  });
  if (!parsed.success) return null;

  const result = await verifyInvitationCredentials(parsed.data);
  if (result.ok) return result.response;
  return null;
}
