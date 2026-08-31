import { z } from 'zod';
import { Link, useNavigation } from 'react-router';
import { ValidatedForm } from '@rvf/react-router';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
import { EmailSchema } from '~/utils/schemas/user';
import { UaPartnerCodeStatus } from '~/components/ua-partner-code-status';

export const GenericStudentSignupSchema = z.object({
  email: EmailSchema,
  code: z.string().min(1, 'Code is required'),
});

export const UaStudentSignupSchema = z.object({
  email: EmailSchema,
  code: z.string().optional(),
});

export const RequiredUaStudentSignupSchema = z.object({
  email: EmailSchema,
  code: z.string().min(1, 'Code is required'),
});

export function StudentSignupForm({
  partner,
  codeAccepted = false,
  codeError = null,
  loginHref,
  clearCodeAction,
}: {
  partner: 'ua' | null;
  codeAccepted?: boolean;
  codeError?: string | null;
  loginHref?: string;
  clearCodeAction?: string;
}) {
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const isUa = partner === 'ua';
  const schema = isUa
    ? codeAccepted
      ? UaStudentSignupSchema
      : RequiredUaStudentSignupSchema
    : GenericStudentSignupSchema;

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
        {isUa && codeAccepted ? (
          <div className="mb-4">
            <UaPartnerCodeStatus clearAction={clearCodeAction} />
          </div>
        ) : null}
        {codeError ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {codeError}
          </p>
        ) : null}
        <ValidatedForm
          method="POST"
          className="flex flex-col gap-4"
          schema={schema}
          defaultValues={{ email: '', code: '' }}
        >
          <FormInput
            scope="email"
            type="email"
            name="email"
            label="Email"
            autoFocus
          />
          {!isUa || !codeAccepted ? (
            <div className="flex w-full items-center rounded-lg border bg-white p-3">
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
            <Link to={loginHref ?? (isUa ? '/ua/sign-in' : '/auth/login')}>
              Already have an account?
            </Link>
          </Button>
        </ValidatedForm>
      </div>
    </div>
  );
}
