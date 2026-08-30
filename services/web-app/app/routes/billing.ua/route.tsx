import {
  Form,
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { Button } from '~/components/ui/button';
import {
  createOrReuseCheckoutSession,
  getUaStudentLicenseAccess,
  getUaStudentLicenseConfig,
} from '~/domain/student-license/student-license.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getDomainUrl } from '~/utils/misc';

async function requirePaymentMembership(request: Request) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const access = await getUaStudentLicenseAccess({
    id: membership.id,
    role: membership.role,
    organizationId: membership.organization.id,
  });

  if (access !== 'PAYMENT_REQUIRED') throw redirect('/app');
  return membership;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePaymentMembership(request);
  return {
    canceled: new URL(request.url).searchParams.get('canceled') === '1',
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const membership = await requirePaymentMembership(request);
  const origin = getDomainUrl(request);
  const checkout = await createOrReuseCheckoutSession({
    membershipId: membership.id,
    successUrl: `${origin}/billing/ua/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/billing/ua?canceled=1`,
    config: getUaStudentLicenseConfig(),
  });

  if (checkout.kind === 'ACTIVE') return redirect('/app');
  return redirect(checkout.url);
}

export default function UaBillingRoute() {
  const { canceled } = useLoaderData<typeof loader>();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-8">
      <div className="w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Complete payment</h1>
          <p className="text-muted-foreground">
            Pay the one-time $50 semester fee to continue to YAWP. Access runs
            through December 31, 2026.
          </p>
          {canceled ? (
            <p className="text-sm text-muted-foreground">
              Checkout was canceled. You have not been charged.
            </p>
          ) : null}
        </div>

        <Form method="POST">
          <Button className="w-full" type="submit">
            {canceled ? 'Retry payment' : 'Continue to payment'}
          </Button>
        </Form>

        <Form action="/auth/logout" method="POST">
          <Button className="w-full" type="submit" variant="ghost">
            Sign out
          </Button>
        </Form>
      </div>
    </main>
  );
}

export const meta: MetaFunction = () => [{ title: 'Payment | Yawp!' }];
