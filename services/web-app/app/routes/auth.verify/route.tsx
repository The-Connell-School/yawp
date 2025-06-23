import {
  getZodConstraint as getFieldsetConstraint,
  parseWithZod as parse,
} from '@conform-to/zod';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import {
  Form,
  Link,
  useActionData,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { Button } from '~/components/ui/button.tsx';
import { handleVerification as handleChangeEmailVerification } from '~/routes/app.profile.change-email/utils.server';
import { validateCSRF } from '~/utils/csrf.server.ts';
import { prisma } from '~/utils/db.server.ts';
import { useIsPending } from '~/utils/misc.tsx';
import { handleVerification as handleLoginTwoFactorVerification } from '../auth.login/utils.server.ts';
import { handleVerification as handleOnboardingVerification } from '../auth.onboarding/utils.server';
import { handleVerification as handleResetPasswordVerification } from '../auth.reset-password/utils.server';
import { handleVerification as handleTeacherOnboardingVerification } from '../auth.teacher-onboarding/utils.server';
import { handleVerification as handleOrganizationInviteVerification } from '../auth.organization-invite/utils.server';
import { isCodeValid } from './utils';
import {
  codeQueryParam,
  redirectToQueryParam,
  targetQueryParam,
  typeQueryParam,
  VerifySchema,
  VerificationTypeSchema,
  type VerificationTypes,
} from './constants.ts';
import { useForm } from '@rvf/react-router';

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  return validateRequest(request, formData);
}

async function validateRequest(
  request: Request,
  body: URLSearchParams | FormData
) {
  const submission = await parse(body, {
    schema: VerifySchema.superRefine(async (data, ctx) => {
      const codeIsValid = await isCodeValid({
        code: data[codeQueryParam],
        type: data[typeQueryParam],
        target: data[targetQueryParam],
      });
      if (!codeIsValid) {
        ctx.addIssue({
          path: ['code'],
          code: z.ZodIssueCode.custom,
          message: `Invalid code`,
        });
        return;
      }
    }),
    async: true,
  });

  console.log(submission);

  if (submission.status !== 'success' || !submission.value) {
    return dataResponse(submission.reply(), { status: 400 });
  }

  const { value: submissionValue } = submission;

  async function deleteVerification() {
    await prisma.verification.delete({
      where: {
        target_type: {
          type: submissionValue[typeQueryParam],
          target: submissionValue[targetQueryParam],
        },
      },
    });
  }

  switch (submissionValue[typeQueryParam]) {
    case 'reset-password': {
      await deleteVerification();
      return handleResetPasswordVerification({ request, body, submission });
    }
    case 'onboarding': {
      await deleteVerification();
      return handleOnboardingVerification({ request, body, submission });
    }
    case 'change-email': {
      await deleteVerification();
      return handleChangeEmailVerification?.({ request, body, submission });
    }
    case '2fa': {
      return handleLoginTwoFactorVerification({ request, body, submission });
    }
    case 'teacher-onboarding': {
      await deleteVerification();
      return handleTeacherOnboardingVerification({ request, body, submission });
    }
    case 'organization-teacher-invite':
    case 'organization-student-invite': {
      await deleteVerification();
      return handleOrganizationInviteVerification({
        request,
        body,
        submission,
      });
    }
  }
}

export default function VerifyRoute() {
  const [searchParams] = useSearchParams();
  const isPending = useIsPending();
  const parsedType = VerificationTypeSchema.safeParse(
    searchParams.get(typeQueryParam)
  );
  const type = parsedType.success ? parsedType.data : null;
  const code = searchParams.get('code') ?? '';

  const checkEmail = (
    <>
      <h1 className="text-h1">Check your email</h1>
      <p className="text-body-md mt-3 text-muted-foreground">
        We've sent you a code to verify your email address.
      </p>
    </>
  );

  const headings: Record<VerificationTypes, React.ReactNode> = {
    onboarding: checkEmail,
    'teacher-onboarding': checkEmail,
    'organization-teacher-invite': checkEmail,
    'organization-student-invite': checkEmail,
    'reset-password': checkEmail,
    'change-email': checkEmail,
    '2fa': (
      <>
        <h1 className="text-h1">Check your 2FA app</h1>
        <p className="text-body-md mt-3 text-muted-foreground">
          Please enter your 2FA code to verify your identity.
        </p>
      </>
    ),
  };

  const form = useForm({
    schema: VerifySchema,
    method: 'POST',
    defaultValues: {
      code,
      type: type ?? undefined,
      target: searchParams.get(targetQueryParam) ?? '',
      redirectTo: searchParams.get(redirectToQueryParam) ?? '',
    },
  });

  return (
    <main className="mx-auto w-full max-w-[400px] pt-20">
      <div className="flex flex-col gap-3">
        <div>{type ? headings[type] : 'Invalid Verification Type'}</div>
        <div className="mt-12 flex flex-col justify-center gap-1">
          <div className="flex w-full gap-2 px-8">
            <Form {...form.getFormProps()} className="flex-1">
              <AuthenticityTokenInput />
              <FormInput scope={form.scope('code')} type="text" label="Code" />
              <input type="hidden" name="type" value={type ?? undefined} />
              <input
                type="hidden"
                name="target"
                value={searchParams.get(targetQueryParam) ?? undefined}
              />
              <input
                type="hidden"
                name="redirectTo"
                value={searchParams.get(redirectToQueryParam) ?? undefined}
              />
              <Button
                className="mt-2 w-full"
                type="submit"
                disabled={isPending}
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
