import { z } from 'zod';
import { useNavigation } from 'react-router';
import { ValidatedForm } from '@rvf/react-router';
import { FormInput } from '~/components/forms/form-input-2';
import { Button, button } from '~/components/ui/button';
import { EmailSchema } from '~/utils/schemas/user';

export const GenericStudentSignupSchema = z.object({
  email: EmailSchema,
  code: z
    .string()
    .trim()
    .min(1, 'Code is required'),
});

export const UaStudentSignupSchema = z.object({
  email: EmailSchema,
  code: z.string().optional(),
});

export const RequiredUaStudentSignupSchema = z.object({
  email: EmailSchema,
  code: z.string().min(1, 'Access code is required'),
});

export function StudentSignupForm({
  partner,
  codeAccepted = false,
  codeError = null,
  loginHref,
}: {
  partner: 'ua' | null;
  codeAccepted?: boolean;
  codeError?: string | null;
  loginHref?: string;
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
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Let's get started!</h1>
        <p className="text-base text-pretty text-muted-foreground sm:text-sm">
          {isUa
            ? 'Please enter your email.'
            : 'Please enter your email & passcode.'}
        </p>
      </div>
      <div className="mt-6 w-full">
        {codeError ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {codeError}
          </p>
        ) : null}
        <ValidatedForm
          method="POST"
          className="flex flex-col gap-5"
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
              label="Access code"
              name="code"
              className="w-full"
            />
          ) : null}
          <Button
            className="h-11 w-full text-base sm:h-10 sm:text-sm"
            type="submit"
            disabled={isLoading}
          >
            Submit
          </Button>
        </ValidatedForm>
        <div className="mt-6 border-t border-black/10 pt-4 text-center">
          <a
            className={button({
              variant: 'link',
              className: 'w-full text-base sm:text-sm',
            })}
            href={loginHref ?? (isUa ? '/ua/sign-in' : '/auth/login')}
          >
            Already have an account?
          </a>
        </div>
      </div>
    </div>
  );
}
