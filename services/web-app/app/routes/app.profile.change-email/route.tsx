import { getInputProps, getFormProps, useForm } from '@conform-to/react';
import {
  getZodConstraint as getFieldsetConstraint,
  parseWithZod as parse,
} from '@conform-to/zod';
import * as E from '@react-email/components';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useActionData, useLoaderData } from 'react-router';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { z } from 'zod';
import { ErrorList } from '~/components/forms/error-list';
import { FormInput } from '~/components/forms/form-input';
import { EnvelopeClosedIcon } from '~/components/icons';
import { Button, button } from '~/components/ui/button';
import {
  prepareVerification,
  requireRecentVerification,
  type VerifyFunctionArgs,
} from '~/routes/auth.verify/utils.server';
import { requireUserId } from '~/utils/auth.server.ts';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { validateCSRF } from '~/utils/csrf.server.ts';
import { prisma } from '~/utils/db.server.ts';
import { sendEmail } from '~/utils/email.server.ts';
import { EmailSchema } from '~/utils/schemas/user.ts';
import { redirectWithToast } from '~/utils/toast.server.ts';
import { verifySessionStorage } from '~/utils/verification.server.ts';

export const handle: BreadcrumbHandle = {
  breadcrumb: (
    <Link
      to="/app/profile/change-email"
      className={button({ variant: 'ghost', size: 'sm' })}
    >
      <EnvelopeClosedIcon className="mr-2" /> Change email
    </Link>
  ),
};

const newEmailAddressSessionKey = 'new-email-address';

export const handleVerification = async ({
  request,
  submission,
}: VerifyFunctionArgs) => {
  await requireRecentVerification(request);

  if (submission.status !== 'success') {
    throw await redirectWithToast('/auth/login', {
      type: 'error',
      title: 'Invalid submission',
      description: 'Submission was not successful. Please try again.',
    });
  }

  const verifySession = await verifySessionStorage.getSession(
    request.headers.get('cookie')
  );
  const newEmail = verifySession.get(newEmailAddressSessionKey);

  if (!newEmail) {
    return dataResponse(
      submission.reply({
        formErrors: [
          'You must submit the code on the same device that requested the email change.',
        ],
      }),
      { status: 400 }
    );
  }

  const preUpdateUser = await prisma.user.findFirstOrThrow({
    select: { email: true },
    where: { id: submission.value.target },
  });
  const user = await prisma.user.update({
    where: { id: submission.value.target },
    select: { id: true, email: true },
    data: { email: newEmail },
  });

  void sendEmail({
    to: preUpdateUser.email,
    subject: 'Yawp! email changed',
    react: <EmailChangeNoticeEmail userId={user.id} />,
  });

  return redirectWithToast(
    '/app/profile',
    {
      title: 'Email Changed',
      type: 'success',
      description: `Your email has been changed to ${user.email}`,
    },
    {
      headers: {
        'set-cookie': await verifySessionStorage.destroySession(verifySession),
      },
    }
  );
};

const ChangeEmailSchema = z.object({
  email: EmailSchema,
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRecentVerification(request);
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    const params = new URLSearchParams({ redirectTo: request.url });
    throw redirect(`/auth/login?${params}`);
  }
  return dataResponse({ user });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  await validateCSRF(formData, request.headers);
  const submission = await parse(formData, {
    schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        ctx.addIssue({
          path: ['email'],
          code: z.ZodIssueCode.custom,
          message: 'This email is already in use.',
        });
      }
    }),
    async: true,
  });

  if (submission.status !== 'success' || !submission.value) {
    return dataResponse(submission.reply(), { status: 400 });
  }

  const { otp, redirectTo, verifyUrl } = await prepareVerification({
    period: 10 * 60,
    request,
    target: userId,
    type: 'change-email',
  });

  const response = await sendEmail({
    to: submission.value.email,
    subject: `Yawp! Email Change Verification`,
    react: <EmailChangeEmail verifyUrl={verifyUrl.toString()} otp={otp} />,
  });

  if (response.status === 'success') {
    const verifySession = await verifySessionStorage.getSession();
    verifySession.set(newEmailAddressSessionKey, submission.value.email);
    return redirect(redirectTo.toString(), {
      headers: {
        'set-cookie': await verifySessionStorage.commitSession(verifySession),
      },
    });
  } else {
    return dataResponse(
      submission.reply({ formErrors: [response.error.message] }),
      {
        status: 500,
      }
    );
  }
}

export function EmailChangeEmail({
  verifyUrl,
  otp,
}: {
  verifyUrl: string;
  otp: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Yawp! Email Change</E.Text>
        </h1>
        <p>
          <E.Text>
            Here's your verification code: <strong>{otp}</strong>
          </E.Text>
        </p>
        <p>
          <E.Text>Or click the link:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
      </E.Container>
    </E.Html>
  );
}

export function EmailChangeNoticeEmail({ userId }: { userId: string }) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Your Yawp! email has been changed</E.Text>
        </h1>
        <p>
          <E.Text>
            We're writing to let you know that your Yawp! email has been
            changed.
          </E.Text>
        </p>
        <p>
          <E.Text>
            If you changed your email address, then you can safely ignore this.
            But if you did not change your email address, then please contact
            support immediately.
          </E.Text>
        </p>
        <p>
          <E.Text>Your Account ID: {userId}</E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}

export default function ChangeEmailIndex() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const [form, fields] = useForm({
    id: 'change-email-form',
    constraint: getFieldsetConstraint(ChangeEmailSchema),
    lastResult: actionData,
    onValidate({ formData }) {
      return parse(formData, { schema: ChangeEmailSchema });
    },
  });

  return (
    <div>
      <h2>Change Email</h2>
      <p className="mt-2">
        You will receive an email at the new email address to confirm. An email
        notice will also be sent to your old address{' '}
        <strong>{data.user.email}</strong>.
      </p>
      <div className="mt-5">
        <Form method="POST" {...getFormProps(form)}>
          <AuthenticityTokenInput />
          <FormInput
            labelProps={{ children: 'New Email' }}
            inputProps={{
              ...getInputProps(fields.email, { type: 'email' }),
              autoComplete: 'email',
            }}
            className="max-w-sm"
            errors={fields.email.errors}
          />
          <ErrorList id={form.errorId} errors={form.errors} />
          <Button className="mt-2" type="submit">
            Send Confirmation
          </Button>
        </Form>
      </div>
    </div>
  );
}
