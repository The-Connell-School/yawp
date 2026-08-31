import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { Button, button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { setMembershipId } from '~/cookies/membership-id.server';
import { getUserId, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  commitUaPartnerContext,
  getUaPartnerCodeCapture,
  getUaPartnerContext,
  isUaStudentBillingEnabled,
  isValidUaPartnerCode,
  requireUaOrganizationId,
} from '~/utils/ua-partner.server';
import { combineHeaders } from '~/utils/misc';

async function findUaMembership(userId: string, organizationId: string) {
  return prisma.orgMembership.findFirst({
    where: { userId, organizationId, isActive: true },
    select: { id: true, role: true },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!isUaStudentBillingEnabled()) {
    throw new Response('Not found', { status: 404 });
  }

  const organizationId = requireUaOrganizationId();
  const capture = getUaPartnerCodeCapture(request);
  if (capture?.accepted) {
    return redirect(capture.redirectTo, {
      headers: { 'set-cookie': await commitUaPartnerContext() },
    });
  }
  if (capture) return redirect('/ua/sign-up?codeError=1');

  const [userId, partnerContext] = await Promise.all([
    getUserId(request),
    getUaPartnerContext(request),
  ]);

  if (!userId) {
    return data({
      authenticated: false as const,
      codeAccepted: partnerContext?.partner === 'ua',
    });
  }

  const membership = await findUaMembership(userId, organizationId);
  if (!membership) {
    return data({
      authenticated: true as const,
      codeAccepted: partnerContext?.partner === 'ua',
    });
  }

  return redirect(membership.role === 'STUDENT' ? '/billing/ua' : '/app', {
    headers: {
      'set-cookie': await setMembershipId(membership.id),
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const organizationId = requireUaOrganizationId();
  const userId = await requireUserId(request);

  const existing = await findUaMembership(userId, organizationId);
  if (existing) {
    return redirect(existing.role === 'STUDENT' ? '/billing/ua' : '/app', {
      headers: { 'set-cookie': await setMembershipId(existing.id) },
    });
  }

  const formData = await request.formData();
  const partnerContext = await getUaPartnerContext(request);
  const submittedCode = String(formData.get('code') || '');
  if (!partnerContext && !isValidUaPartnerCode(submittedCode)) {
    return data({ error: 'Enter a valid organization code.' }, { status: 400 });
  }

  const membership = await prisma.orgMembership.create({
    data: { userId, organizationId, role: 'STUDENT' },
    select: { id: true },
  });

  return redirect('/billing/ua', {
    headers: combineHeaders(
      { 'set-cookie': await setMembershipId(membership.id) },
      partnerContext ? null : { 'set-cookie': await commitUaPartnerContext() }
    ),
  });
}

export default function UaLanding({
  loaderData,
}: {
  loaderData: { authenticated: boolean; codeAccepted: boolean };
}) {
  const actionData = useActionData<typeof action>();
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <AuthBrandLockup partner="ua" />
        <div className="mt-12 rounded-xl border bg-background p-8 text-left shadow-sm">
          {loaderData.authenticated ? (
            <>
              <h1 className="text-center">Continue to Yawp</h1>
              <Form method="post" className="mt-8">
                {!loaderData.codeAccepted ? (
                  <div className="mb-4 text-left">
                    <Label htmlFor="ua-organization-code">
                      Organization code
                    </Label>
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
            </>
          ) : (
            <>
              <h1 className="text-center">Welcome to Yawp</h1>
              <div className="mt-8 flex flex-col gap-3">
                <Link
                  className={button({ className: 'w-full' })}
                  to="/ua/sign-up"
                >
                  Create an account
                </Link>
                <Link
                  className={button({
                    variant: 'outline',
                    className: 'w-full',
                  })}
                  to="/ua/sign-in"
                >
                  Log in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
