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
import { normalizeEmail } from '~/utils/normalize-email';
import { enforceUnauthByIpAndTarget, rateLimitedFormResponse } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';

const Schema = z.object({
  email: EmailSchema,
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const parsed = await parseFormData(formData, Schema);

  if (parsed.error) return validationError(parsed.error);

  const { email } = parsed.data;
  const normalizedEmail = normalizeEmail(email);
  {
    const cfg = RATE_LIMITS.unauth.forgotPassword;
    const decision = await enforceUnauthByIpAndTarget({
      request,
      route: '/auth/inv/forgot-password',
      targetKey: normalizedEmail,
      perIpPerMinute: cfg.perIpPerMinute,
      perIpPerHour: cfg.perIpPerHour,
      perTargetPerHour: cfg.perEmailPerHour,
    });
    if (!decision.allowed) {
      return rateLimitedFormResponse('email', decision.retryAfterSeconds, 'Too many password reset attempts. Please wait and try again.');
    }
  }

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
      NOT: { email: null },
    },
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
  const target = normalizedEmail;
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

  await prisma.invitation.deleteMany({
    where: {
      type,
      target: { equals: target, mode: 'insensitive' },
    },
  });

  await prisma.invitation.create({ data: verificationData });

  const response = await sendEmail({
    to: user.email!,
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
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Forgot password?</h1>
        <p className="text-pretty text-base text-muted-foreground sm:text-sm">
          We’ll send you reset instructions.
        </p>
      </div>
      <Form
        method="POST"
        className="mt-6 flex flex-col gap-5"
        {...form.getFormProps()}
      >
        <FormInput
          scope={form.scope('email')}
          type="email"
          label="Email"
          autoFocus
        />
        <Button
          className="h-11 w-full text-base sm:h-10 sm:text-sm"
          type="submit"
          disabled={isLoading}
        >
          Recover password
        </Button>
      </Form>
      <div className="mt-6 border-t border-black/10 pt-4 text-center">
        <Button variant="link" asChild className="w-full text-base sm:text-sm">
          <Link to="/auth/login">Back to login</Link>
        </Button>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
