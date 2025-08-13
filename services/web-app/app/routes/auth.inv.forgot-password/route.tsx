import * as E from '@react-email/components';
import {
  redirect,
  type MetaFunction,
  type ActionFunctionArgs,
  Form,
  useNavigation,
} from 'react-router';
import { Link } from 'react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx';
import { Button } from '~/components/ui/button.tsx';
import { prisma } from '~/utils/db.server.ts';
import { sendEmail } from '~/utils/email.server.ts';
import { EmailSchema } from '~/utils/schemas/user.ts';
import { parseFormData } from '@rvf/react';
import { useForm, validationError } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { generateTOTP } from '~/utils/totp.server';
import { Prisma } from '@app/prisma';
import { getDomainUrl } from '~/utils/misc';

const Schema = z.object({
  email: EmailSchema,
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const parsed = await parseFormData(formData, Schema);

  if (parsed.error) return validationError(parsed.error);

  const { email } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email },
    select: { email: true },
  });

  if (!user) {
    return validationError({
      fieldErrors: {
        email: 'No user exists with this email',
      },
    });
  }

  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789', // Leaving off 0 and O on purpose to avoid confusing users.
    period: 10 * 60,
  });

  const type = 'password-reset';
  const target = email;
  const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
  verifyUrl.searchParams.set('type', type);
  verifyUrl.searchParams.set('target', target);
  verifyUrl.searchParams.set('code', otp);

  const verificationData: Prisma.InvitationCreateInput = {
    type,
    target,
    ...verificationConfig,
    expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
  };

  await prisma.invitation.create({ data: verificationData });

  const response = await sendEmail({
    to: user.email,
    subject: `Yawp!`,
    react: (
      <ForgotPasswordEmail onboardingUrl={verifyUrl.toString()} otp={otp} />
    ),
  });

  if (response.status === 'success') {
    verifyUrl.searchParams.delete('code');
    return redirect(verifyUrl.toString());
  } else {
    return validationError({
      fieldErrors: {
        email: response.error.message,
      },
    });
  }
}

function ForgotPasswordEmail({
  onboardingUrl,
  otp,
}: {
  onboardingUrl: string;
  otp: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Yawp! Password Reset</E.Text>
        </h1>
        <p>
          <E.Text>
            Here's your verification code: <strong>{otp}</strong>
          </E.Text>
        </p>
        <p>
          <E.Text>Or click the link:</E.Text>
        </p>
        <E.Link href={onboardingUrl}>{onboardingUrl}</E.Link>
      </E.Container>
    </E.Html>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Password Recovery for Yawp!' }];
};

export default function ForgotPasswordRoute() {
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  const form = useForm({
    id: 'forgot-password',
    schema: Schema,
    method: 'POST',
    defaultValues: { email: '' },
  });

  return (
    <div className="mx-auto w-full max-w-md pt-20">
      <div className="flex flex-col gap-3 text-center">
        <div className="text-center">
          <h1>Forgot Password</h1>
          <p className="text-body-md mt-3 text-muted-foreground">
            No worries, we'll send you reset instructions.
          </p>
        </div>
        <div className="mx-auto mt-8 min-w-full max-w-sm px-8 sm:min-w-[368px]">
          <Form method="POST" {...form.getFormProps()}>
            <FormInput scope={form.scope('email')} type="email" autoFocus />

            <Button className="mt-2 w-full" type="submit" disabled={isLoading}>
              Recover password
            </Button>
          </Form>
        </div>
        <Button variant="link" asChild className="mx-auto w-full">
          <Link to="/auth/login">Back to login</Link>
        </Button>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
