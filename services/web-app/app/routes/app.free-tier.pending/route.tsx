import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
  useNavigation,
  Link,
} from 'react-router';
import { getLockedPreviewApplication } from '~/domain/free-tier/locked-preview.server';
import { getMembershipId } from '~/cookies/membership-id.server';
import { isClassPreparationEnabled } from '~/domain/free-tier/class-preparation.server';
import { needsClassPreparation } from '~/domain/free-tier/class-preparation';
import {
  getApprovalWaitingDetails,
  isApprovalV2Enabled,
  forwardApprovalRequest,
} from '~/domain/free-tier/approval-v2.server';
import {
  approvalMailto,
  approvalSentDate,
} from '~/domain/free-tier/approval-waiting';
import {
  ApprovalForwardForm,
  approvalForwardError,
} from '../free-tier/ApprovalForwardForm';
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
      userId: true,
      organizationId: true,
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
    lockedPreview: Boolean(await getLockedPreviewApplication(userId, await getMembershipId(request))),
    approvalV2: app ? await getApprovalWaitingDetails(app) : null,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  const preparing = await prisma.freeTierApplication.findFirst({
    where: { userId, status: 'ACCOUNT_CREATED' },
    select: {
      status: true,
      organizationId: true,
      starterClassName: true,
      starterClassGrade: true,
    },
  });
  if (
    preparing &&
    needsClassPreparation(
      preparing,
      await isClassPreparationEnabled(userId, preparing.organizationId)
    )
  ) {
    return redirect('/app/free-tier/onboarding');
  }
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId, status: { in: ['SENT', 'MANUAL_REVIEW'] } },
    select: { id: true, userId: true, organizationId: true, status: true },
  });
  if (app && intent === 'forward' && (await isApprovalV2Enabled(app))) {
    const gate = await enforceUnauthByIpAndTarget({
      request,
      route: '/app/free-tier/pending:forward',
      targetKey: app.id,
      perIpPerMinute: 3,
      perIpPerHour: 10,
      perTargetPerHour: 10,
    });
    if (!gate.allowed) return { ok: false as const, reason: 'rate_limited' };
    try {
      return await forwardApprovalRequest({
        applicationId: app.id,
        userId,
        currentApprovalId: String(form.get('approvalId') ?? ''),
        newAdminName: String(form.get('adminName') ?? ''),
        newAdminEmail: String(form.get('adminEmail') ?? ''),
        request,
      });
    } catch {
      return { ok: false as const, reason: 'unavailable' };
    }
  }
  if (!app || app.status !== 'SENT' || intent !== 'resend')
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
  const { app, pending, lastFailedEmail, lockedPreview, approvalV2 } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const resending = navigation.state === 'submitting';
  const adminName = pending?.adminName ?? 'your administrator';
  if (approvalV2) {
    const current = approvalV2.approval;
    const terminal =
      app?.status === 'APPROVED' ||
      app?.status === 'REJECTED' ||
      app?.status === 'EXPIRED';
    const title =
      app?.status === 'APPROVED'
        ? 'Your classroom is approved'
        : app?.status === 'REJECTED'
          ? 'Request not approved'
          : app?.status === 'EXPIRED'
            ? 'Your invite expired'
            : app?.status === 'MANUAL_REVIEW'
              ? "We're reviewing your request"
              : 'Waiting for your administrator';
    return (
      <FreeTierAuthCard
        title={title}
        icon={<Clock />}
        footer={<FreeTierSignOut />}
      >
        {terminal ? (
          <p className="text-sm text-muted-foreground">
            {app.status === 'APPROVED'
              ? 'You can start teaching with YAWP.'
              : 'Questions? Email support@yawp.school.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {app?.status === 'SENT' && current
                ? approvalV2.firstSentAt
                  ? `Sent to ${current.adminName} on ${approvalSentDate(approvalV2.firstSentAt)}.`
                  : `Your request to ${current.adminName} is queued.`
                : 'We will email you when your request is ready.'}
            </p>
            <FreeTierProgress
              steps={[
                'Account created',
                'Request sent',
                app?.status === 'MANUAL_REVIEW'
                  ? 'YAWP review'
                  : `${current?.adminName ?? 'Your administrator'} approves`,
                'Start teaching',
              ]}
              current={2}
            />
            {current && app?.status === 'SENT' ? (
              <>
                <FreeTierPerson
                  name={current.adminName}
                  email={current.adminEmail}
                />
                <p className="text-sm text-muted-foreground">
                  Email your administrator directly to let them know why you
                  would like to use YAWP with your class.
                </p>
                <a
                  className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  href={approvalMailto({
                    adminEmail: current.adminEmail,
                    adminName: current.adminName,
                    teacherName: app.name,
                  })}
                >
                  Draft an email
                </a>
                <p className="text-xs text-muted-foreground">
                  {current.autoRemindersStopped
                    ? 'Weekly reminders have stopped. You can pick a different administrator below or contact support@yawp.school for help.'
                    : 'We will remind your administrator weekly, up to three times, and keep you posted.'}
                </p>
              </>
            ) : null}
            {actionData?.ok ? (
              <p role="status" className="text-sm text-muted-foreground">
                Request forwarded. We will notify your administrator and email
                you an update.
              </p>
            ) : null}
            {actionData && !actionData.ok ? (
              <p role="alert" className="text-sm text-destructive">
                {approvalForwardError(actionData.reason ?? 'unavailable')}
              </p>
            ) : null}
            {current ? (
              <details
                className="text-sm"
                open={actionData && !actionData.ok ? true : undefined}
              >
                <summary className="cursor-pointer py-2 text-primary underline underline-offset-4">
                  Not the right person? Forward this request
                </summary>
                <div className="pt-3">
                  <ApprovalForwardForm
                    approvalId={current.id}
                    busy={resending}
                  />
                </div>
              </details>
            ) : null}
          </>
        )}
        {lockedPreview && !terminal ? (
          <Link to="/app/free-tier/preview" className="text-center text-sm font-medium underline underline-offset-4">
            Look around while you wait
          </Link>
        ) : null}
      </FreeTierAuthCard>
    );
  }

  return (
    <FreeTierAuthCard
      title={
        app?.status === 'MANUAL_REVIEW'
          ? "We're reviewing your request"
          : 'Waiting for your administrator'
      }
      icon={<Clock />}
      footer={<FreeTierSignOut />}
    >
      {pending && app?.status === 'SENT' ? (
        <p className="text-sm text-muted-foreground">Sent to {adminName}.</p>
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
      <FreeTierProgress
        steps={[
          'Account created',
          'Request sent',
          app?.status === 'MANUAL_REVIEW'
            ? 'YAWP review'
            : `${adminName} approves`,
          'Start teaching',
        ]}
        current={2}
      />
      {pending && app?.status === 'SENT' ? (
        <FreeTierPerson name={adminName} email={pending.adminEmail} />
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
          {'message' in actionData
            ? actionData.message
            : 'Free-tier links are temporarily unavailable.'}
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
      {lockedPreview ? (
        <Link to="/app/free-tier/preview" className="text-center text-sm font-medium underline underline-offset-4">
          Look around while you wait
        </Link>
      ) : null}
    </FreeTierAuthCard>
  );
}
