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
import { setProfileId } from '~/cookies/profile-id.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  OwnerOnboardingMetadataSchema,
  StudentOnboardingMetadataSchema,
  TeacherOnboardingMetadataSchema,
} from '~/utils/schemas/invitation';
import type { Profile, User } from '@app/prisma';

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

  const invitation = await prisma.invitation.findUnique({
    where: { target_type: { target, type } },
    select: {
      expiresAt: true,
      algorithm: true,
      secret: true,
      period: true,
      charSet: true,
      organizationId: true,
      schoolId: true,
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
    const { schoolId, klassId } = JSON.parse(
      invitation.metadata ?? '{}'
    ) as z.infer<typeof StudentOnboardingMetadataSchema>;

    if (!schoolId || !klassId) {
      return validationError({ fieldErrors: { code: 'Invalid code.' } });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: target },
    });

    if (existingUser) {
      return validationError({
        fieldErrors: { code: 'User already exists.' },
      });
    } else {
      invitationCookie.set('schoolId', schoolId);
      invitationCookie.set('klassId', klassId);
      invitationCookie.set('email', target);
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

    const existingUser = await prisma.user.findUnique({
      where: { email: target },
      include: {
        profiles: {
          where: { organizationId: organizationId },
          include: { teacherProfile: true },
        },
      },
    });

    if (existingUser) {
      let profile: Profile;
      if (existingUser.profiles.length > 0) {
        if (existingUser.profiles[0].teacherProfile) {
          return redirectWithToast(
            '/app',
            {
              title: 'Teacher profile already exists',
              description: 'Your teacher profile has already been created.',
            },
            {
              headers: {
                'set-cookie': [
                  await invitationCookieStorage.destroySession(
                    invitationCookie
                  ),
                  await setProfileId(existingUser.profiles[0].id),
                ].join(';'),
              },
            }
          );
        }
        const profileToUpdate = existingUser.profiles[0];
        profile = await prisma.profile.update({
          where: { id: profileToUpdate.id },
          data: { teacherProfile: { create: {} } },
        });
      } else {
        profile = await prisma.profile.create({
          data: {
            user: { connect: { id: existingUser.id } },
            organization: { connect: { id: organizationId } },
            teacherProfile: { create: {} },
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
              await setProfileId(profile.id),
            ].join(';'),
          },
        }
      );
    } else {
      invitationCookie.set('organizationId', organizationId);
      invitationCookie.set('email', target);
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

    const existingUser = await prisma.user.findUnique({
      where: { email: target },
      include: {
        profiles: { where: { organizationId: organizationId } },
      },
    });

    if (existingUser) {
      let profile: Profile;
      if (existingUser.profiles.length > 0) {
        const profileToUpdate = existingUser.profiles[0];
        profile = await prisma.profile.update({
          where: { id: profileToUpdate.id },
          data: { isOwner: true },
        });
      } else {
        profile = await prisma.profile.create({
          data: {
            user: { connect: { id: existingUser.id } },
            organization: { connect: { id: organizationId } },
            isOwner: true,
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
              await setProfileId(profile.id),
            ].join(';'),
          },
        }
      );
    } else {
      invitationCookie.set('organizationId', organizationId);
      invitationCookie.set('email', target);
      return redirect('/auth/inv/onboard-owner', {
        headers: {
          'set-cookie':
            await invitationCookieStorage.commitSession(invitationCookie),
        },
      });
    }
  } else if (type === 'password-reset') {
    invitationCookie.set('email', target);
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

  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { code, type, target },
  });

  return (
    <main className="mx-auto w-full max-w-[400px] pt-20">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-h1">Check your email</h1>
          <p className="text-body-md mt-3 text-muted-foreground">
            We've sent you a code to verify your email address.
          </p>
        </div>
        <div className="mt-12 flex flex-col justify-center gap-1">
          <div className="flex w-full gap-2 px-8">
            <Form {...form.getFormProps()} className="flex-1">
              <FormInput scope={form.scope('code')} type="text" label="Code" />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="target" value={target} />
              <Button
                className="mt-2 w-full"
                type="submit"
                disabled={navigation.state !== 'idle'}
              >
                Submit
              </Button>
            </Form>
          </div>
          <div className="px-8 text-center">
            <Button asChild variant="link">
              <Link to="/auth/login">Back to login</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
