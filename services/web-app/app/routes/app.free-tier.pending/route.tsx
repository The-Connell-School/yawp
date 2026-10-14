import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
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
    <FreeTierAuthCard title={`Waiting for ${adminName}`}>
      {pending && app?.status === 'SENT' ? (
        <p className="text-sm text-muted-foreground">
          We emailed {pending.adminEmail}. You will not have classes or AI tools
          until they approve YAWP for {app.schoolName}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your approval request is being processed. You will not have classes or
          AI tools until an administrator approves YAWP for {app?.schoolName}.
        </p>
      )}
      {lastFailedEmail && !pending ? (
        <p className="text-sm text-destructive" role="alert">
          We could not send the approval email. Use onboarding to update the
          administrator and try again, or contact support@yawp.school.
        </p>
      ) : null}
      {app?.status === 'MANUAL_REVIEW' ? (
        <p className="text-sm text-muted-foreground">
          Our team is reviewing this request manually. We will email you when it
          is ready.
        </p>
      ) : null}
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
      <FreeTierSignOut />
    </FreeTierAuthCard>
  );
}
