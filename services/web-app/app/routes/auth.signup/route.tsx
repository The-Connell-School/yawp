import * as E from '@react-email/components';
import {
  redirect,
  type MetaFunction,
  type ActionFunctionArgs,
} from 'react-router';
import { Link } from 'react-router';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import {
  parseFormData,
  ValidatedForm,
  validationError,
} from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
import { validateCSRF } from '~/utils/csrf.server';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import { Setting } from '~/utils/enums.ts';
import { useIsPending } from '~/utils/misc';
import { EmailSchema } from '~/utils/schemas/user';
import { prepareVerification } from '../auth.verify/utils';

const Schema = z.object({
  email: EmailSchema,
  passcode: z.string().min(1, 'Passcode is required'),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await validateCSRF(formData, request.headers);
  const { error, data } = await parseFormData(formData, Schema);
  if (error) return validationError(error);

  const passcodeSetting = await prisma.setting.findUnique({
    where: { name: Setting.SignupPasscode },
    select: { value: true },
  });

  if (passcodeSetting?.value !== data.passcode) {
    return validationError(
      { fieldErrors: { passcode: 'Invalid passcode.' } },
      data
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existingUser) {
    return validationError(
      { fieldErrors: { email: 'An account with this email already exists.' } },
      data
    );
  }

  const { verifyUrl, redirectTo, otp } = await prepareVerification({
    period: 10 * 60,
    request,
    type: 'onboarding',
    target: data.email,
  });

  const response = await sendEmail({
    to: data.email,
    subject: `Welcome to Yawp!`,
    react: (
      <E.Html lang="en" dir="ltr">
        <E.Container>
          <h1>
            <E.Text>Welcome to Yawp!</E.Text>
          </h1>
          <p>
            <E.Text>
              Here's your verification code: <strong>{otp}</strong>
            </E.Text>
          </p>
          <p>
            <E.Text>Or click the link to get started:</E.Text>
          </p>
          <E.Link href={verifyUrl.toString()}>{verifyUrl.toString()}</E.Link>
        </E.Container>
      </E.Html>
    ),
  });

  if (response.status === 'success') {
    return redirect(redirectTo.toString());
  } else {
    return validationError(
      { fieldErrors: { email: 'Failed to send email. Please try again.' } },
      data
    );
  }
}

export default function SignupRoute() {
  const isPending = useIsPending();

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mt-8 flex flex-col gap-3 text-center">
        <img
          src="/img/logo_for_light_mode.png"
          alt="Logo"
          className="mx-auto mb-8 h-auto w-48 rounded object-cover sm:w-52"
        />
        <h1>Let's get started!</h1>
        <p>Please enter your email & passcode.</p>
      </div>
      <div className="mx-auto mt-10 w-full max-w-md px-8">
        <ValidatedForm
          method="POST"
          className="flex flex-col gap-4"
          schema={Schema}
          defaultValues={{
            email: '',
            passcode: '',
          }}
        >
          <AuthenticityTokenInput />
          <FormInput scope="email" type="email" name="email" autoFocus />
          <div className="flex w-full items-center rounded-lg border p-3 bg-white">
            <FormInput
              scope="passcode"
              type="text"
              label="App Passcode"
              labelInfo="This is the passcode for the Yawp! app."
              name="passcode"
              className="w-full"
            />
          </div>
          <Button className="w-full" type="submit" disabled={isPending}>
            Submit
          </Button>
          <Button variant="link" asChild className="mx-auto mt-2 w-full">
            <Link to="/auth/login">Already have an account?</Link>
          </Button>
        </ValidatedForm>
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Sign Up | Yawp!' }];
};

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
