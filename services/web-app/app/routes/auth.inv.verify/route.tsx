import { type ActionFunctionArgs, redirect, useNavigation } from 'react-router';
import { Form, Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { Button } from '~/components/ui/button.tsx';
import { prisma } from '~/utils/db.server.ts';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { verifyTOTP } from '~/utils/totp.server.ts';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  OwnerOnboardingMetadataSchema,
  StudentOnboardingMetadataSchema,
  TeacherOnboardingMetadataSchema,
} from '~/utils/schemas/invitation';
import type { OrgMembership } from '@app/prisma';
import { normalizeEmail } from '~/utils/normalize-email';
import { enforceUnauthByIpAndTarget, rateLimitedJson } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';

const Schema = z.object({
  code: z.string().min(6).max(6),
  type: z.enum([
    'onboard-student',
    'onboard-teacher',
    'onboard-owner',
    'password-reset',
  ]),
  target: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const { data, error } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const { target, type } = data;
  const normalizedTarget = normalizeEmail(target);
  {
    const cfg = RATE_LIMITS.unauth.verify;
    const decision = await enforceUnauthByIpAndTarget({
      request,
      route: '/auth/inv/verify',
      targetKey: `${type}:${normalizedTarget}`,
      perIpPerMinute: cfg.perIpPerMinute,
      perIpPerHour: cfg.perIpPerHour,
      perTargetPerHour: cfg.perEmailPerHour,
    });
    if (!decision.allowed) {
      return rateLimitedJson(decision.scope, decision.retryAfterSeconds, 'Too many verification attempts. Please wait and try again.');
    }
  }

  const invitation = await prisma.invitation.findFirst({
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
      id: true,
      metadata: true,
    },
  });

  if (!invitation) {
    return validationError({
      fieldErrors: { code: 'Invalid code.' },
    });
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return validationError({
      fieldErrors: { code: 'Invitation has expired.' },
    });
  }

  const isValid = !!verifyTOTP({ otp: data.code, ...invitation });
  if (!isValid) {
    return validationError({
      fieldErrors: { code: 'Invalid code.' },
    });
  }

  // Delete the invitation after verification to prevent reuse.
  await prisma.invitation.delete({ where: { id: invitation.id } });

  const cookie = request.headers.get('cookie');
  const invitationCookie = await invitationCookieStorage.getSession(cookie);

  if (type === 'onboard-student') {
    const parsedMetadata = StudentOnboardingMetadataSchema.safeParse(
      JSON.parse(invitation.metadata ?? '{}')
    );

    if (!parsedMetadata.success) {
      return validationError({
        fieldErrors: { code: 'Invalid metadata. Please sign up again.' },
      });
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
      return validationError({
        fieldErrors: { code: 'User already exists.' },
      });
    } else {
      invitationCookie.set('klassId', klassId);
      invitationCookie.set('klassIds', klassIds);
      invitationCookie.set('schoolId', schoolId);
      if (isUa) {
        invitationCookie.set('partner', 'ua');
        invitationCookie.set('organizationId', metadata.organizationId);
      }
      invitationCookie.set('email', normalizedTarget);
      return redirect('/auth/inv/onboard-student', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      });
    }
  } else if (type === 'onboard-teacher') {
    const { organizationId } = JSON.parse(
      invitation.metadata ?? '{}'
    ) as z.infer<typeof TeacherOnboardingMetadataSchema>;

    if (!organizationId) {
      return validationError({ fieldErrors: { code: 'Invalid code.' } });
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

    if (existingUser) {
      let membership: OrgMembership;
      if (existingUser.memberships.length > 0) {
        if (existingUser.memberships[0].role === 'TEACHER') {
          return redirectWithToast(
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
          );
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

      return redirectWithToast(
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
      );
    } else {
      invitationCookie.set('organizationId', organizationId);
      invitationCookie.set('email', normalizedTarget);
      return redirect('/auth/inv/onboard-teacher', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      });
    }
  } else if (type === 'onboard-owner') {
    const { organizationId } = JSON.parse(
      invitation.metadata ?? '{}'
    ) as z.infer<typeof OwnerOnboardingMetadataSchema>;

    if (!organizationId) {
      return validationError({ fieldErrors: { code: 'Invalid code.' } });
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

      return redirectWithToast(
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
      );
    } else {
      invitationCookie.set('organizationId', organizationId);
      invitationCookie.set('email', normalizedTarget);
      return redirect('/auth/inv/onboard-owner', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      });
    }
  } else if (type === 'password-reset') {
    invitationCookie.set('email', normalizedTarget);
    return redirect('/auth/inv/forgot-password-reset', {
      headers: {
        'set-cookie':
          await invitationCookieStorage.commitSession(invitationCookie),
      },
    });
  } else {
    return validationError({ fieldErrors: { code: 'Invalid code.' } });
  }
}

export default function Route() {
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const type = (searchParams.get('type') ?? '') as any;
  const code = searchParams.get('code') ?? '';
  const target = searchParams.get('target') ?? '';
  const isUa = searchParams.get('partner') === 'ua';

  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { code, type, target },
  });

  return (
    <main className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-pretty text-base text-muted-foreground sm:text-sm">
          We’ve sent you a code to verify your email address.
        </p>
      </div>
      <Form {...form.getFormProps()} className="mt-6 flex flex-col gap-5">
        <FormInput scope={form.scope('code')} type="text" label="Code" />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="target" value={target} />
        <Button
          className="h-11 w-full text-base sm:h-10 sm:text-sm"
          type="submit"
          disabled={navigation.state !== 'idle'}
        >
          Submit
        </Button>
      </Form>
      <div className="mt-6 border-t border-black/10 pt-4 text-center">
        <Button asChild variant="link" className="w-full text-base sm:text-sm">
          <Link to={isUa ? '/auth/login?redirectTo=%2F' : '/auth/login'}>
            Back to login
          </Link>
        </Button>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
