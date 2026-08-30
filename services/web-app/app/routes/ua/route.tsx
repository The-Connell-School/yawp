import {
  Form,
  Link,
  data,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { Button, button } from '~/components/ui/button';
import { setMembershipId } from '~/cookies/membership-id.server';
import { getUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  commitUaPartnerContext,
  isUaStudentBillingEnabled,
  requireUaOrganizationId,
} from '~/utils/ua-partner.server';

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
  const [userId, partnerCookie] = await Promise.all([
    getUserId(request),
    commitUaPartnerContext(),
  ]);

  if (!userId) {
    return data(
      { authenticated: false as const },
      { headers: { 'set-cookie': partnerCookie } }
    );
  }

  const membership = await findUaMembership(userId, organizationId);
  if (!membership) {
    return data(
      { authenticated: true as const },
      { headers: { 'set-cookie': partnerCookie } }
    );
  }

  return redirect(membership.role === 'STUDENT' ? '/billing/ua' : '/app', {
    headers: {
      'set-cookie': await setMembershipId(membership.id),
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const organizationId = requireUaOrganizationId();
  const userId = await getUserId(request);
  if (!userId) throw redirect('/auth/login?redirectTo=%2Fua');

  const existing = await findUaMembership(userId, organizationId);
  if (existing) {
    return redirect(existing.role === 'STUDENT' ? '/billing/ua' : '/app', {
      headers: { 'set-cookie': await setMembershipId(existing.id) },
    });
  }

  const membership = await prisma.orgMembership.create({
    data: { userId, organizationId, role: 'STUDENT' },
    select: { id: true },
  });

  return redirect('/billing/ua', {
    headers: { 'set-cookie': await setMembershipId(membership.id) },
  });
}

export default function UaLanding({
  loaderData,
}: {
  loaderData: { authenticated: boolean };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <AuthBrandLockup partner="ua" />
        <div className="mt-12 rounded-xl border bg-background p-8 text-left shadow-sm">
          {loaderData.authenticated ? (
            <>
              <h1 className="text-center">Continue to Yawp</h1>
              <Form method="post" className="mt-8">
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
                  to="/auth/inv/signup"
                >
                  Create an account
                </Link>
                <Link
                  className={button({
                    variant: 'outline',
                    className: 'w-full',
                  })}
                  to="/auth/login?redirectTo=%2Fua"
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
