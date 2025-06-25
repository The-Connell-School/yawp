import { getInputProps, getFormProps, useForm } from '@conform-to/react';
import {
  getZodConstraint as getFieldsetConstraint,
  parseWithZod as parse,
} from '@conform-to/zod';
import {
  data as dataResponse,
  redirect,
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import {
  Form,
  useActionData,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { z } from 'zod';
import { ErrorList } from '~/components/forms/error-list.tsx';
import { FormCheckbox } from '~/components/forms/form-checkbox.tsx';
import { FormInput } from '~/components/forms/form-input.tsx';
import { Button } from '~/components/ui/button.tsx';
import {
  requireAnonymous,
  sessionKey,
  signupAsOrganizationTeacher,
} from '~/utils/auth.server.ts';
import { validateCSRF } from '~/utils/csrf.server.ts';
import { useIsPending } from '~/utils/misc.tsx';
import {
  NameSchema,
  PasswordAndConfirmPasswordSchema,
} from '~/utils/schemas/user.ts';
import { authSessionStorage } from '~/utils/session.server.ts';
import { redirectWithToast } from '~/utils/toast.server.ts';
import { verifySessionStorage } from '~/utils/verification.server.ts';
import {
  onboardingTeacherEmailKey,
  onboardingTeacherOrganizationIdKey,
} from '../auth.verify/utils.server';

const SignupFormSchema = z
  .object({
    name: NameSchema,
    remember: z.boolean().optional(),
    redirectTo: z.string().optional(),
  })
  .and(PasswordAndConfirmPasswordSchema);

async function requireOnboardingTeacher(request: Request) {
  await requireAnonymous(request);
  const verifySession = await verifySessionStorage.getSession(
    request.headers.get('cookie')
  );
  const email = verifySession.get(onboardingTeacherEmailKey);
  const organizationId = verifySession.get(onboardingTeacherOrganizationIdKey);
  if (!email || !organizationId) {
    throw redirect('/auth/login');
  }
  return { email, organizationId };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { email, organizationId } = await requireOnboardingTeacher(request);
  return dataResponse({ email, organizationId });
}

export async function action({ request }: ActionFunctionArgs) {
  const { email, organizationId } = await requireOnboardingTeacher(request);
  const formData = await request.formData();
  const submission = await parse(formData, {
    schema: SignupFormSchema.transform(async (data) => {
      const session = await signupAsOrganizationTeacher({
        ...data,
        email,
        organizationId,
      });
      return { ...data, session };
    }),
    async: true,
  });

  if (submission.status !== 'success' || !submission.value) {
    return dataResponse(submission.reply(), { status: 400 });
  }

  const { session, remember, redirectTo } = submission.value;

  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  authSession.set(sessionKey, session.id);
  const verifySession = await verifySessionStorage.getSession();
  const headers = new Headers();
  headers.append(
    'set-cookie',
    await authSessionStorage.commitSession(authSession, {
      expires: remember ? session.expirationDate : undefined,
    })
  );
  headers.append(
    'set-cookie',
    await verifySessionStorage.destroySession(verifySession)
  );

  return redirectWithToast(
    safeRedirect(redirectTo, '/app'),
    { title: 'Welcome', description: 'Thanks for signing up!' },
    { headers }
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Setup Yawp! Account' }];
};

export default function SignupRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  const [form, fields] = useForm({
    id: 'organization-teacher-onboarding-form',
    constraint: getFieldsetConstraint(SignupFormSchema),
    defaultValue: { redirectTo },
    lastResult: actionData,
    onValidate({ formData }) {
      return parse(formData, { schema: SignupFormSchema });
    },
    shouldRevalidate: 'onBlur',
  });

  return (
    <div className="mx-auto w-full max-w-md px-2 py-20">
      <div className="flex flex-col gap-3 text-center">
        <h1>Welcome, {data.email}!</h1>
        <p>Please enter your details.</p>
      </div>
      <Form
        method="POST"
        className="mx-auto mt-20 flex min-w-full max-w-sm flex-col gap-3 px-8 sm:min-w-[368px]"
        {...getFormProps(form)}
      >
        <AuthenticityTokenInput />
        <FormInput
          labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
          inputProps={{
            ...getInputProps(fields.name, { type: 'text' }),
            autoComplete: 'name',
          }}
          errors={fields.name.errors}
        />
        <FormInput
          labelProps={{ htmlFor: fields.password.id, children: 'Password' }}
          inputProps={{
            ...getInputProps(fields.password, { type: 'password' }),
            autoComplete: 'new-password',
          }}
          errors={fields.password.errors}
        />

        <FormInput
          labelProps={{
            htmlFor: fields.confirmPassword.id,
            children: 'Confirm Password',
          }}
          inputProps={{
            ...getInputProps(fields.confirmPassword, { type: 'password' }),
            autoComplete: 'new-password',
          }}
          errors={fields.confirmPassword.errors}
        />

        <FormCheckbox
          field={fields.remember}
          labelProps={{
            htmlFor: fields.remember.id,
            children: 'Remember me',
          }}
          buttonProps={getInputProps(fields.remember, { type: 'checkbox' })}
          errors={fields.remember.errors}
        />

        <input {...getInputProps(fields.redirectTo, { type: 'hidden' })} />
        <ErrorList errors={form.errors} id={form.errorId} />

        <div className="flex items-center justify-between gap-6">
          <Button className="mt-4 w-full" type="submit" disabled={isPending}>
            Create an account
          </Button>
        </div>
      </Form>
    </div>
  );
}
