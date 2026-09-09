import { z } from 'zod';
import { Form, Link } from 'react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useForm } from '@rvf/react-router';
import { FormInput } from '~/components/forms/form-input-2';
import { Button, button } from '~/components/ui/button';
import { EmailSchema, PasswordSchema } from '~/utils/schemas/user';

export const LoginSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().nullish(),
});

export function LoginForm({
  redirectTo,
  signupHref,
}: {
  redirectTo: string | null;
  signupHref?: string;
}) {
  const form = useForm({
    schema: LoginSchema,
    method: 'POST',
    defaultValues: { redirectTo, email: '', password: '' },
    validationBehaviorConfig: {
      initial: 'onSubmit',
      whenTouched: 'onSubmit',
      whenSubmitted: 'onSubmit',
    },
  });

  return (
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Welcome back!</h1>
        <p className="text-base text-pretty text-muted-foreground sm:text-sm">
          Please enter your details.
        </p>
      </div>
      <div className="mt-6 w-full">
        <Form {...form.getFormProps()} className="flex flex-col gap-4">
          <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />
          <FormInput
            scope={form.scope('email')}
            type="email"
            label="Email"
            autoComplete="email"
          />
          <FormInput
            scope={form.scope('password')}
            type="password"
            label="Password"
            autoComplete="current-password"
          />
          <div className="flex items-center justify-end">
            <Link
              to="/auth/inv/forgot-password"
              className={button({ variant: 'link' })}
            >
              Forgot password?
            </Link>
          </div>
          <Button
            className="h-11 w-full text-base sm:h-10 sm:text-sm"
            type="submit"
          >
            Log in
          </Button>
        </Form>
        <div className="mt-6 flex flex-col gap-4 border-t border-black/10 pt-6">
          <div className="flex flex-col gap-1 text-left">
            <p className="font-medium">New here?</p>
            <p className="text-base text-pretty text-muted-foreground sm:text-sm">
              Create an account to get started.
            </p>
          </div>
          <Link
            className={button({
              variant: 'outline',
              className: 'h-11 w-full gap-2 text-base sm:h-10 sm:text-sm',
            })}
            to={signupHref ?? '/auth/inv/signup'}
          >
            Create an account <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
