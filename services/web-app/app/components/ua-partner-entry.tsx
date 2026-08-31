import { Form, Link, useActionData } from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { Button, button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export function UaPartnerEntry({
  authenticated,
  codeAccepted,
  loginHref,
  signupHref,
}: {
  authenticated: boolean;
  codeAccepted: boolean;
  loginHref: string;
  signupHref: string;
}) {
  const actionData = useActionData<{ error?: string }>();

  if (!authenticated) {
    return (
      <main className="isolate flex min-h-dvh items-center justify-center bg-white p-6 sm:p-12">
        <div className="flex w-full max-w-lg flex-col items-center gap-14 text-center">
          <AuthBrandLockup partner="ua" />
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Link className={button({ className: 'w-full' })} to={signupHref}>
              Create an Account
            </Link>
            <Link
              className={button({ variant: 'outline', className: 'w-full' })}
              to={loginHref}
            >
              Log In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="isolate flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg text-center">
        <AuthBrandLockup partner="ua" />
        <div className="mt-12 rounded-xl border bg-background p-8 text-left shadow-sm">
          <h1 className="text-center">Continue to Yawp</h1>
          <Form method="post" className="mt-8">
            {!codeAccepted ? (
              <div className="mb-4 text-left">
                <Label htmlFor="ua-organization-code">Organization code</Label>
                <Input
                  id="ua-organization-code"
                  name="code"
                  className="mt-2"
                  required
                  autoComplete="off"
                />
                {actionData?.error ? (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {actionData.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mb-4 text-center text-sm text-muted-foreground">
                University of Alabama code accepted
              </p>
            )}
            <Button className="w-full" type="submit">
              Continue as a student
            </Button>
          </Form>
          <Form method="post" action="/auth/logout" className="mt-3">
            <Button variant="outline" className="w-full" type="submit">
              Sign out
            </Button>
          </Form>
        </div>
      </div>
    </main>
  );
}
