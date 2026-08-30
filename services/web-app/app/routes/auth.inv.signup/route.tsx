import * as E from '@react-email/components';
import {
  redirect,
  type MetaFunction,
  type ActionFunctionArgs,
  useNavigation,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { Link } from 'react-router';
import {
  parseFormData,
  ValidatedForm,
  validationError,
} from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import { EmailSchema } from '~/utils/schemas/user';
import { generateTOTP } from '~/utils/totp.server';
import { Prisma } from '@app/prisma';
import { getDomainUrl } from '~/utils/misc';
import { normalizeEmail } from '~/utils/normalize-email';
import {
  getUaPartnerContext,
  requireUaOrganizationId,
} from '~/utils/ua-partner.server';

const GenericSchema = z.object({
  email: EmailSchema,
  code: z.string().min(1, 'Code is required'),
});

const UaSchema = z.object({
  email: EmailSchema,
  code: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const partnerContext = await getUaPartnerContext(request);
  return { partner: partnerContext?.partner ?? null };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const partnerContext = await getUaPartnerContext(request);
  const isUa = partnerContext?.partner === 'ua';
  const { error, data } = await parseFormData(
    formData,
    isUa ? UaSchema : GenericSchema
  );
  if (error) return validationError(error);
  const normalizedEmail = normalizeEmail(data.email);

  const classes = isUa
    ? []
    : await prisma.class.findMany({
        where: {
          code: { equals: data.code!, mode: 'insensitive' },
          isArchived: false,
        },
        select: { id: true },
        take: 20,
      });

  if (!isUa && classes.length === 0) {
    return validationError({ fieldErrors: { code: 'Invalid code.' } }, data);
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (existingUser) {
    return validationError(
      { fieldErrors: { email: 'An account with this email already exists.' } },
      data
    );
  }

  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789', // Leaving off 0 and O on purpose to avoid confusing users.
    period: 10 * 60,
  });

  const type = 'onboard-student';
  const target = normalizedEmail;
  const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
  verifyUrl.searchParams.set('type', type);
  verifyUrl.searchParams.set('target', target);
  verifyUrl.searchParams.set('code', otp);
  if (isUa) verifyUrl.searchParams.set('partner', 'ua');

  const verificationData: Prisma.InvitationCreateInput = {
    type,
    target,
    ...verificationConfig,
    expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
    metadata: JSON.stringify(
      isUa
        ? { partner: 'ua', organizationId: requireUaOrganizationId() }
        : classes.length === 1
          ? { klassId: classes[0]!.id }
          : { klassIds: classes.map((c) => c.id) }
    ),
  };

  // Check for existing invitation and delete if found
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      target: { equals: target, mode: 'insensitive' },
      type,
    },
  });

  if (existingInvitation) {
    await prisma.invitation.delete({
      where: { id: existingInvitation.id },
    });
  }

  await prisma.invitation.create({ data: verificationData });

  const response = await sendEmail({
    to: normalizedEmail,
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
    verifyUrl.searchParams.delete('code');
    return redirect(verifyUrl.toString());
  } else {
    return validationError(
      { fieldErrors: { email: 'Failed to send email. Please try again.' } },
      data
    );
  }
}

export default function SignupRoute() {
  const { partner } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const isUa = partner === 'ua';
  const schema = isUa ? UaSchema : GenericSchema;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mt-8 flex flex-col gap-3 text-center">
        <h1>Let's get started!</h1>
        <p>
          {isUa
            ? 'Please enter your email.'
            : 'Please enter your email & passcode.'}
        </p>
      </div>
      <div className="mx-auto mt-10 w-full max-w-md px-8">
        <ValidatedForm
          method="POST"
          className="flex flex-col gap-4"
          schema={schema}
          defaultValues={{
            email: '',
            code: '',
          }}
        >
          <FormInput
            scope="email"
            type="email"
            name="email"
            label="Email"
            autoFocus
          />
          {!isUa ? (
            <div className="flex w-full items-center rounded-lg border p-3 bg-white">
              <FormInput
                scope="code"
                type="text"
                label="Code"
                name="code"
                className="w-full"
              />
            </div>
          ) : null}
          <Button className="w-full" type="submit" disabled={isLoading}>
            Submit
          </Button>
          <Button variant="link" asChild className="mx-auto mt-2 w-full">
            <Link
              to={isUa ? '/auth/login?redirectTo=%2Fua' : '/auth/login'}
            >
              Already have an account?
            </Link>
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
