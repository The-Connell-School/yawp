import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  createOrReuseCheckoutSession,
  getUaStudentLicenseAccess,
  getUaStudentLicenseBillingState,
  getUaStudentLicenseConfig,
  isUaStudentLicenseSalesClosed,
} from '~/domain/student-license/student-license.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export const UA_CHECKOUT_CANCELED_MESSAGE =
  'Checkout was canceled. Retry only if your payment did not complete.';
export const UA_DISPUTE_SUSPENDED_MESSAGE =
  'Your previous payment is under review. You cannot start another payment while Stripe resolves it. Access will update automatically when the review closes.';
export const UA_INVALID_PROMOTION_CODE_MESSAGE =
  'That promotion code is invalid or unavailable.';

export function canStartUaCheckout({
  closed,
  processing,
  suspended,
}: {
  closed: boolean;
  processing: boolean;
  suspended: boolean;
}) {
  return !closed && !processing && !suspended;
}

async function requirePaymentMembership(request: Request) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId, {
    allowPaymentRequired: true,
  });
  const access = await getUaStudentLicenseAccess({
    id: membership.id,
    role: membership.role,
    organizationId: membership.organization.id,
  });

  if (access !== 'PAYMENT_REQUIRED') throw redirect('/app');
  return membership;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const membership = await requirePaymentMembership(request);
  const config = getUaStudentLicenseConfig();
  const searchParams = new URL(request.url).searchParams;
  const billingState = await getUaStudentLicenseBillingState({
    id: membership.id,
    role: membership.role,
    organizationId: membership.organization.id,
  });
  return {
    canceled: searchParams.get('canceled') === '1',
    processing: searchParams.get('processing') === '1',
    closed: isUaStudentLicenseSalesClosed(),
    suspended: billingState === 'SUSPENDED',
    productionTestCodeEnabled:
      config.enabled && Boolean(config.productionTestPromotionCodeId),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const membership = await requirePaymentMembership(request);
  const config = getUaStudentLicenseConfig();
  if (!config.enabled) throw new Error('UA student billing is disabled');
  const contentType = request.headers.get('content-type') ?? '';
  const submittedCode =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
      ? (await request.formData()).get('productionTestCode')
      : null;
  const productionTestCode =
    typeof submittedCode === 'string' ? submittedCode.trim() : '';
  if (productionTestCode.length > 128) {
    return { promotionCodeError: UA_INVALID_PROMOTION_CODE_MESSAGE };
  }
  const origin = config.applicationOrigin;
  const checkout = await createOrReuseCheckoutSession({
    membershipId: membership.id,
    successUrl: `${origin}/billing/ua/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/billing/ua?canceled=1`,
    ...(productionTestCode ? { productionTestCode } : {}),
    config,
  });

  if (checkout.kind === 'ACTIVE') return redirect('/app');
  if (checkout.kind === 'CLOSED') return redirect('/billing/ua?closed=1');
  if (checkout.kind === 'PROCESSING') {
    return redirect('/billing/ua?processing=1');
  }
  if (checkout.kind === 'SUSPENDED') {
    return redirect('/billing/ua?suspended=1');
  }
  if (checkout.kind === 'INVALID_PROMOTION_CODE') {
    return { promotionCodeError: UA_INVALID_PROMOTION_CODE_MESSAGE };
  }
  return redirect(checkout.url);
}

export default function UaBillingRoute() {
  const { canceled, closed, processing, suspended, productionTestCodeEnabled } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-8">
      <div className="w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {closed
              ? 'Payment period closed'
              : suspended
                ? 'Payment under review'
                : 'Complete payment'}
          </h1>
          <p className="text-muted-foreground">
            {closed
              ? 'The 2026 student license ended on December 31, 2026.'
              : suspended
                ? UA_DISPUTE_SUSPENDED_MESSAGE
              : 'Pay the one-time $50 semester fee to continue to YAWP. Access runs through December 31, 2026.'}
          </p>
          {canceled ? (
            <p className="text-sm text-muted-foreground">
              {UA_CHECKOUT_CANCELED_MESSAGE}
            </p>
          ) : null}
          {processing ? (
            <p className="text-sm text-muted-foreground">
              Stripe is confirming your payment. Refresh this page in a moment.
            </p>
          ) : null}
        </div>

        {canStartUaCheckout({ closed, processing, suspended }) ? (
          <Form className="space-y-4" method="POST">
            {productionTestCodeEnabled ? (
              <div className="space-y-2 text-left">
                <label className="text-sm font-medium" htmlFor="production-test-code">
                  Promotion code <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  aria-describedby="production-test-code-error"
                  autoComplete="off"
                  id="production-test-code"
                  maxLength={128}
                  name="productionTestCode"
                  spellCheck={false}
                />
                {actionData && 'promotionCodeError' in actionData ? (
                  <p
                    className="text-sm text-destructive"
                    id="production-test-code-error"
                    role="alert"
                  >
                    {actionData.promotionCodeError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button className="w-full" type="submit">
              {canceled ? 'Retry payment' : 'Continue to payment'}
            </Button>
          </Form>
        ) : null}

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
