import { getFormProps, getInputProps, useForm } from '@conform-to/react';
import {
  getZodConstraint as getFieldsetConstraint,
  parseWithZod as parse,
} from '@conform-to/zod';
import * as E from '@react-email/components';
import {
  data as dataResponse,
  redirect,
  type MetaFunction,
  type ActionFunctionArgs,
} from 'react-router';
import { Link, useFetcher } from 'react-router';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx';
import { ErrorList } from '~/components/forms/error-list.tsx';
import { FormInput } from '~/components/forms/form-input.tsx';
import { Button } from '~/components/ui/button.tsx';
import { validateCSRF } from '~/utils/csrf.server.ts';
import { prisma } from '~/utils/db.server.ts';
import { sendEmail } from '~/utils/email.server.ts';
import { EmailSchema } from '~/utils/schemas/user.ts';
import { prepareVerification } from '../auth.verify/utils';

const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await validateCSRF(formData, request.headers);
  const submission = await parse(formData, {
    schema: ForgotPasswordSchema.superRefine(async (data, ctx) => {
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ email: data.email }],
        },
        select: { id: true },
      });
      if (!user) {
        ctx.addIssue({
          path: ['email'],
          code: z.ZodIssueCode.custom,
          message: 'No user exists with this email',
        });
        return;
      }
    }),
    async: true,
  });

  if (submission.status !== 'success' || !submission.value) {
    return dataResponse(submission.reply(), { status: 400 });
  }

  const { email } = submission.value;

  const user = await prisma.user.findFirstOrThrow({
    where: { email: email },
    select: { email: true },
  });

  const { verifyUrl, redirectTo, otp } = await prepareVerification({
    period: 10 * 60,
    request,
    type: 'reset-password',
    target: email,
  });

  const response = await sendEmail({
    to: user.email,
    subject: `Yawp!`,
    react: (
      <ForgotPasswordEmail onboardingUrl={verifyUrl.toString()} otp={otp} />
    ),
  });

  if (response.status === 'success') {
    return redirect(redirectTo.toString());
  } else {
    return dataResponse(
      submission.reply({ formErrors: [response.error.message] }),
      {
        status: 500,
      }
    );
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
  const forgotPassword = useFetcher<typeof action>();

  const [form, fields] = useForm({
    id: 'forgot-password-form',
    constraint: getFieldsetConstraint(ForgotPasswordSchema),
    lastResult: forgotPassword.data,
    onValidate({ formData }) {
      return parse(formData, { schema: ForgotPasswordSchema });
    },
    shouldRevalidate: 'onBlur',
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
          <forgotPassword.Form method="POST" {...getFormProps(form)}>
            <AuthenticityTokenInput />
            <FormInput
              labelProps={{
                htmlFor: fields.email.id,
                children: 'Email',
                className: 'text-start',
              }}
              inputProps={{
                autoFocus: true,
                ...getInputProps(fields.email, { type: 'email' }),
              }}
              errors={fields.email.errors}
            />
            <ErrorList errors={form.errors} id={form.errorId} />

            <Button
              className="mt-2 w-full"
              type="submit"
              disabled={forgotPassword.state !== 'idle'}
            >
              Recover password
            </Button>
          </forgotPassword.Form>
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
