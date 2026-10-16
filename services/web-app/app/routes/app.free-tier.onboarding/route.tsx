import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { submitAdminDetails } from '~/domain/free-tier/approval-flow.server';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierSignOut,
  FreeTierTextInput,
  FreeTierProgress,
} from '../free-tier/FreeTierAuthCard';
import { freeTierConfigErrorMessage } from '~/domain/free-tier/free-tier-config.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

const MAX_NAME = 200;

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      id: true,
      schoolName: true,
      name: true,
      email: true,
      status: true,
    },
  });
  const lastFailedEmail = app
    ? await prisma.freeTierEmailLog.findFirst({
        where: {
          applicationId: app.id,
          kind: 'admin_approval',
          success: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;
  const pending = app
    ? await prisma.freeTierAdminApproval.findFirst({
        where: { applicationId: app.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { adminName: true, adminEmail: true, adminRole: true },
      })
    : null;
  return { app, lastFailedEmail, pending };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!app) return redirect('/app/free-tier/onboarding');
  try {
    const result = await submitAdminDetails({
      applicationId: app.id,
      userId,
      adminName: String(formData.get('adminName') ?? '')
        .trim()
        .slice(0, MAX_NAME),
      adminEmail: String(formData.get('adminEmail') ?? '')
        .trim()
        .slice(0, 320),
      adminRole: String(formData.get('adminRole') ?? '')
        .trim()
        .slice(0, 100),
    });
    if (!result.ok) {
      return result;
    }
    throw redirect('/app/free-tier/pending');
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      ok: false as const,
      reason: 'config' as const,
      message: freeTierConfigErrorMessage(error),
    };
  }
}

export default function FreeTierOnboardingRoute() {
  const { app, lastFailedEmail, pending } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const errorMessage =
    actionData && !actionData.ok
      ? actionData.reason === 'config'
        ? actionData.message
        : actionData.reason === 'email_failed'
          ? "We couldn't send the email. Try again, or contact support@yawp.school."
          : actionData.reason === 'illegal_state'
            ? "This application isn't ready for administrator details yet. Contact support@yawp.school."
            : 'Something went wrong. Try again.'
      : null;

  return (
    <FreeTierAuthCard
      title="Who can approve YAWP?"
      footer={<FreeTierSignOut />}
      subtitle="A site or district administrator. Department chairs and teachers can’t."
    >
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {lastFailedEmail && app?.status === 'ADMIN_SUBMITTED' ? (
        <p className="text-sm text-destructive" role="alert">
          We couldn't send the email. Try again, or contact support@yawp.school.
        </p>
      ) : null}
      <Form method="post" className="flex flex-col gap-4">
        <FreeTierFieldLabel label="Administrator name" htmlFor="adminName">
          <FreeTierTextInput
            id="adminName"
            name="adminName"
            required
            maxLength={MAX_NAME}
            defaultValue={pending?.adminName ?? ''}
          />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
          <FreeTierTextInput
            id="adminEmail"
            name="adminEmail"
            placeholder="name@district.org"
            type="email"
            required
            maxLength={320}
            defaultValue={pending?.adminEmail ?? ''}
          />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator role" htmlFor="adminRole">
          <FreeTierTextInput
            id="adminRole"
            name="adminRole"
            placeholder="Principal, Technology Director"
            required
            maxLength={100}
            defaultValue={pending?.adminRole ?? ''}
          />
        </FreeTierFieldLabel>
        <FreeTierProgress steps={['Account created', 'Ask your administrator', 'Start teaching']} current={1} />
        <FreeTierButton type="submit">{navigation.state === 'submitting' ? 'Sending…' : 'Send approval request'}</FreeTierButton>
      </Form>
    </FreeTierAuthCard>
  );
}
