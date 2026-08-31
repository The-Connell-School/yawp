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
    <div className="mx-auto mt-10 w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-3 text-center">
        <h1>Welcome back!</h1>
        <p>Please enter your details.</p>
      </div>
      <div className="mt-8 w-full">
        <Form {...form.getFormProps()} className="flex flex-col gap-3">
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
          <Button className="w-full" type="submit">
            Log in
          </Button>
        </Form>
        <div className="my-8 rounded-xl border bg-muted p-6">
          <p className="text-xl font-bold">New here?</p>
          <p className="text-muted-foreground">
            Create an account to get started.
          </p>
          <Link
            className={button({
              variant: 'outline',
              size: 'lg',
              className: 'mt-4 w-full shadow',
            })}
            to={signupHref ?? '/auth/inv/signup'}
          >
            Create an account <ArrowRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
