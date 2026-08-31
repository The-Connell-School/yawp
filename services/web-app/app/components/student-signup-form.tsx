import { z } from 'zod';
import { useNavigation } from 'react-router';
import { ValidatedForm } from '@rvf/react-router';
import { FormInput } from '~/components/forms/form-input-2';
import { Button, button } from '~/components/ui/button';
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
    <div className="mx-auto mt-10 w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Let's get started!</h1>
        <p className="text-muted-foreground">
          {isUa
            ? 'Please enter your email.'
            : 'Please enter your email & passcode.'}
        </p>
      </div>
      <div className="mt-8 w-full">
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
          validationBehaviorConfig={
            isUa
              ? {
                  initial: 'onSubmit',
                  whenTouched: 'onSubmit',
                  whenSubmitted: 'onSubmit',
                }
              : undefined
          }
        >
          <FormInput
            scope="email"
            type="email"
            name="email"
            label="Email"
            autoFocus
          />
          {!isUa || !codeAccepted ? (
            <FormInput
              scope="code"
              type="text"
              label="Code"
              name="code"
              className="w-full"
            />
          ) : null}
          <Button className="w-full" type="submit" disabled={isLoading}>
            Submit
          </Button>
        </ValidatedForm>
        <a
          className={button({
            variant: 'link',
            className: 'mx-auto mt-2 w-full',
          })}
          href={loginHref ?? (isUa ? '/ua/sign-in' : '/auth/login')}
        >
          Already have an account?
        </a>
      </div>
    </div>
  );
}
