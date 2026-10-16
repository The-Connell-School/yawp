import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Clock } from 'lucide-react';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';
import { resendFreeTierAdminApprovalReminder } from '~/domain/free-tier/approval-flow.server';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierSignOut,
  FreeTierProgress,
  FreeTierPerson,
} from '../free-tier/FreeTierAuthCard';
import { freeTierConfigErrorMessage } from '~/domain/free-tier/free-tier-config.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      id: true,
      status: true,
      schoolName: true,
      email: true,
      name: true,
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { adminName: true, adminEmail: true },
      },
    },
  });
  const pending = app?.adminApprovals[0];
  const lastFailedEmail = app
    ? await prisma.freeTierEmailLog.findFirst({
        where: {
          applicationId: app.id,
          kind: 'admin_approval',
          success: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { error: true },
      })
    : null;
  return {
    app,
    pending,
    lastFailedEmail,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const intent = String((await request.formData()).get('intent'));
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId, status: 'SENT' },
    select: { id: true },
  });
  if (!app || intent !== 'resend')
    return { ok: false as const, reason: 'not_allowed' as const };

  const gate = await enforceUnauthByIpAndTarget({
    request,
    route: '/app/free-tier/pending:resend',
    targetKey: app.id,
    perIpPerMinute: 3,
    perIpPerHour: 10,
    perTargetPerHour: RATE_LIMITS.unauth.freeTierWaitlist.perEmailPerHour,
  });
  if (!gate.allowed) return { ok: false as const, rateLimited: true as const };

  try {
    return await resendFreeTierAdminApprovalReminder({
      applicationId: app.id,
      request,
    });
  } catch (error) {
    return {
      ok: false as const,
      reason: 'config' as const,
      message: freeTierConfigErrorMessage(error),
    };
  }
}

export default function FreeTierPendingRoute() {
  const { app, pending, lastFailedEmail } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const resending = navigation.state === 'submitting';
  const adminName = pending?.adminName ?? 'your administrator';
  return (
    <FreeTierAuthCard title={app?.status === 'MANUAL_REVIEW' ? "We're reviewing your request" : 'Waiting for your administrator'} icon={<Clock />} footer={<FreeTierSignOut />}>
      {pending && app?.status === 'SENT' ? (
        <p className="text-sm text-muted-foreground">
          Sent to {adminName}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          We will email you when your request is ready.
        </p>
      )}
      {lastFailedEmail && !pending ? (
        <p className="text-sm text-destructive" role="alert">
          We could not send the approval email. Use onboarding to update the
          administrator and try again, or contact support@yawp.school.
        </p>
      ) : null}
      <FreeTierProgress steps={['Account created', 'Request sent', app?.status === 'MANUAL_REVIEW' ? 'YAWP review' : `${adminName} approves`, 'Start teaching']} current={2} />
      {pending && app?.status === 'SENT' ? <FreeTierPerson name={adminName} email={pending.adminEmail} /> : null}
      {actionData?.ok ? (
        <p className="text-sm text-muted-foreground" role="status">
          Reminder sent to {pending?.adminEmail}.
        </p>
      ) : null}
      {actionData &&
      !actionData.ok &&
      'rateLimited' in actionData &&
      actionData.rateLimited ? (
        <p className="text-sm text-destructive" role="alert">
          Too many resend attempts. Please wait a few minutes and try again.
        </p>
      ) : null}
      {actionData && !actionData.ok && actionData.reason === 'email_failed' ? (
        <p className="text-sm text-destructive" role="alert">
          We could not send the reminder. Try again later or contact
          support@yawp.school.
        </p>
      ) : null}
      {actionData && !actionData.ok && actionData.reason === 'config' ? (
        <p className="text-sm text-destructive" role="alert">
          {actionData.message}
        </p>
      ) : null}
      {app?.status === 'SENT' ? (
        <Form method="post">
          <input type="hidden" name="intent" value="resend" />
          <FreeTierButton type="submit" disabled={resending} variant="outline">
            {resending ? 'Sending…' : 'Resend reminder'}
          </FreeTierButton>
        </Form>
      ) : null}
    </FreeTierAuthCard>
  );
}
