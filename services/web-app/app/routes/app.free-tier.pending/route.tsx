import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
  useNavigation,
  Link,
} from 'react-router';
import { useEffect, useState } from 'react';
import { userHasPendingFreeTierTeachingLock } from '~/domain/free-tier/locked-preview.server';
import { isClassPreparationEnabled } from '~/domain/free-tier/class-preparation.server';
import { needsClassPreparation } from '~/domain/free-tier/class-preparation';
import {
  getApprovalWaitingDetails,
  isApprovalV2Enabled,
  forwardApprovalRequest,
} from '~/domain/free-tier/approval-v2.server';
import { loadTeacherDeniedSurface } from '~/domain/free-tier/approval-deny.server';
import {
  teacherAllRequestsUsedBody,
  teacherDeniedStatusBody,
  teacherDeniedStatusTitle,
} from '~/domain/free-tier/admin-deny-copy';
import {
  approvalMailto,
  approvalSentDate,
} from '~/domain/free-tier/approval-waiting';
import {
  ApprovalForwardForm,
  approvalForwardError,
} from '../free-tier/ApprovalForwardForm';
import { Clock } from 'lucide-react';
import { getTransactionalEmailFrom } from '~/utils/email.server';
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
import { Button } from '~/components/ui/button';

const FORWARD_ERROR_REASONS = new Set([
  'validation',
  'same_administrator',
  'chain_cap',
  'superseded',
  'rate_limited',
  'unavailable',
]);

type PendingActionData = Awaited<ReturnType<typeof action>>;

function isForwardActionError(
  data: PendingActionData | undefined
): data is { ok: false; reason: string } {
  return Boolean(
    data &&
      !data.ok &&
      'reason' in data &&
      typeof data.reason === 'string' &&
      FORWARD_ERROR_REASONS.has(data.reason)
  );
}

function PendingBelowCardActions({
  showForwardToggle,
  approvalId,
  busy,
  forwardOpen,
  onToggleForward,
}: {
  showForwardToggle: boolean;
  approvalId?: string;
  busy: boolean;
  forwardOpen: boolean;
  onToggleForward: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {showForwardToggle ? (
        <Button type="button" variant="link" onClick={onToggleForward}>
          Not the right person?
        </Button>
      ) : null}
      <FreeTierSignOut />
      {showForwardToggle && forwardOpen ? (
        <div className="mt-4 w-full max-w-[240px] text-left">
          <ApprovalForwardForm approvalId={approvalId} busy={busy} />
        </div>
      ) : null}
    </div>
  );
}

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
      adminRedirectCount: true,
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
  const teacherDenied = app
    ? await loadTeacherDeniedSurface({ applicationId: app.id })
    : null;
  const askOpen =
    new URL(request.url).searchParams.get('ask') === '1' ||
    new URL(request.url).searchParams.get('ask') === 'true';
  return {
    app,
    pending,
    lastFailedEmail,
    showExploreClassroom: await userHasPendingFreeTierTeachingLock(userId),
    approvalV2: app ? await getApprovalWaitingDetails(app) : null,
    approvalEmailFrom: getTransactionalEmailFrom(),
    teacherDenied,
    askOpen,
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
  const deniedSurface = app
    ? await loadTeacherDeniedSurface({ applicationId: app.id })
    : null;
  if (app && intent === 'forward' && (await isApprovalV2Enabled(app))) {
    const approvalId = String(form.get('approvalId') ?? '');
    const currentApprovalId =
      approvalId ||
      deniedSurface?.denied.id ||
      (
        await prisma.freeTierAdminApproval.findFirst({
          where: { applicationId: app.id, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      )?.id ||
      '';
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
        currentApprovalId,
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

function LockedPreviewExploreButton() {
  return (
    <FreeTierButton asChild data-testid="locked-preview-explore">
      <Link to="/app">Explore my classroom</Link>
    </FreeTierButton>
  );
}

function PendingDraftRequestLink({
  adminEmail,
  adminName,
  teacherName,
  schoolName,
  approvalEmailFrom,
}: {
  adminEmail: string;
  adminName: string;
  teacherName: string;
  schoolName: string;
  approvalEmailFrom: string;
}) {
  if (!adminEmail.trim()) return null;
  return (
    <FreeTierButton
      asChild
      variant="outline"
      className="free-tier-draft-request"
      data-testid="pending-draft-request"
    >
      <a
        href={approvalMailto({
          adminEmail,
          adminName,
          teacherName,
          schoolName,
          approvalEmailFrom,
        })}
        rel="noopener noreferrer"
      >
        Draft a Request
      </a>
    </FreeTierButton>
  );
}

function TeacherAskAnotherForm({
  approvalId,
  busy,
  hint,
  open,
}: {
  approvalId: string;
  busy: boolean;
  hint: string;
  open: boolean;
}) {
  if (!open) return null;
  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="teacher-ask-another-form">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ApprovalForwardForm approvalId={approvalId} busy={busy} />
    </div>
  );
}

export default function FreeTierPendingRoute() {
  const {
    app,
    pending,
    lastFailedEmail,
    showExploreClassroom,
    approvalV2,
    approvalEmailFrom,
    teacherDenied,
    askOpen,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const resending = navigation.state === 'submitting';
  const adminName = pending?.adminName ?? 'your administrator';
  const [forwardOpen, setForwardOpen] = useState(false);
  const [askAnotherOpen, setAskAnotherOpen] = useState(askOpen);

  useEffect(() => {
    if (isForwardActionError(actionData)) setForwardOpen(true);
  }, [actionData]);

  useEffect(() => {
    if (askOpen) setAskAnotherOpen(true);
  }, [askOpen]);

  if (teacherDenied && approvalV2?.enabled) {
    const { denied, chainCapReached, askAnotherHint: hint } = teacherDenied;
    return (
      <FreeTierAuthCard
        title={teacherDeniedStatusTitle()}
        icon={<Clock />}
        footer={<FreeTierSignOut />}
      >
        <p className="text-sm text-muted-foreground">
          {teacherDeniedStatusBody(denied.adminName, app?.schoolName ?? 'your school')}
        </p>
        {chainCapReached ? (
          <>
            <p className="text-sm text-muted-foreground">
              {teacherAllRequestsUsedBody()}
            </p>
            <FreeTierButton asChild>
              <a href="mailto:support@yawp.school">Email support</a>
            </FreeTierButton>
          </>
        ) : (
          <>
            {!askAnotherOpen ? (
              <FreeTierButton type="button" onClick={() => setAskAnotherOpen(true)}>
                Ask another administrator
              </FreeTierButton>
            ) : null}
            <TeacherAskAnotherForm
              approvalId={denied.id}
              busy={resending}
              hint={hint}
              open={askAnotherOpen}
            />
            <FreeTierButton asChild variant="outline">
              <a href="mailto:support@yawp.school">Email support</a>
            </FreeTierButton>
          </>
        )}
        {showExploreClassroom ? <LockedPreviewExploreButton /> : null}
        {actionData?.ok && 'queued' in actionData ? (
          <p role="status" className="text-sm text-muted-foreground">
            Request sent to {actionData.adminName}!
          </p>
        ) : null}
        {isForwardActionError(actionData) ? (
          <p role="alert" className="text-sm text-destructive">
            {approvalForwardError(actionData.reason)}
          </p>
        ) : null}
      </FreeTierAuthCard>
    );
  }

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
              : app?.status === 'SENT' && current
                ? `Request sent to ${current.adminName}!`
                : 'Waiting for your administrator';
    const showForwardToggle = Boolean(current && !terminal);
    return (
      <FreeTierAuthCard
        title={title}
        icon={<Clock />}
        footer={
          <PendingBelowCardActions
            showForwardToggle={showForwardToggle}
            approvalId={current?.id}
            busy={resending}
            forwardOpen={forwardOpen}
            onToggleForward={() => setForwardOpen((open) => !open)}
          />
        }
      >
        {terminal ? (
          <>
            <p className="text-sm text-muted-foreground">
              {app.status === 'APPROVED'
                ? "You're all set to start teaching with Yawp!"
                : 'Questions? Email support@yawp.school.'}
            </p>
            {app.status === 'APPROVED' ? (
              <FreeTierButton asChild>
                <Link to="/app">Start teaching</Link>
              </FreeTierButton>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {app?.status === 'SENT' && current
                ? approvalV2.firstSentAt
                  ? `Sent to ${current.adminName} on ${approvalSentDate(approvalV2.firstSentAt)}.`
                  : `Your request to ${current.adminName} is queued.`
                : 'We will email you when your request is ready.'}
            </p>
            {app?.status === 'SENT' && current ? (
              <p className="text-sm text-muted-foreground">
                You’re almost there! It may be a good idea to give{' '}
                {current.adminName} a quick heads-up so the email doesn’t get
                buried. We’ll let you know the moment they approve.
              </p>
            ) : null}
            <FreeTierProgress
              steps={[
                'Account and class created',
                'Request sent',
                app?.status === 'MANUAL_REVIEW'
                  ? 'Yawp! review'
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
                <PendingDraftRequestLink
                  adminEmail={current.adminEmail}
                  adminName={current.adminName}
                  teacherName={app.name}
                  schoolName={app.schoolName ?? 'your school'}
                  approvalEmailFrom={approvalEmailFrom}
                />
                {showExploreClassroom ? <LockedPreviewExploreButton /> : null}
              </>
            ) : null}
            {showExploreClassroom && app?.status === 'MANUAL_REVIEW' ? (
              <LockedPreviewExploreButton />
            ) : null}
            {actionData?.ok && 'queued' in actionData ? (
              <p role="status" className="text-sm text-muted-foreground">
                Request forwarded. We will notify your administrator and email
                you an update.
              </p>
            ) : null}
            {isForwardActionError(actionData) ? (
              <p role="alert" className="text-sm text-destructive">
                {approvalForwardError(actionData.reason)}
              </p>
            ) : null}
          </>
        )}
      </FreeTierAuthCard>
    );
  }

  if (app?.status === 'APPROVED') {
    return (
      <FreeTierAuthCard
        title="Your classroom is approved"
        icon={<Clock />}
        footer={<FreeTierSignOut />}
      >
        <p className="text-sm text-muted-foreground">
          You&apos;re all set to start teaching with Yawp!
        </p>
        <FreeTierButton asChild>
          <Link to="/app">Start teaching</Link>
        </FreeTierButton>
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
          'Account and class created',
          'Request sent',
          app?.status === 'MANUAL_REVIEW'
            ? 'Yawp! review'
            : `${adminName} approves`,
          'Start teaching',
        ]}
        current={2}
      />
      {pending && app?.status === 'SENT' ? (
        <>
          <FreeTierPerson name={adminName} email={pending.adminEmail} />
          <PendingDraftRequestLink
            adminEmail={pending.adminEmail}
            adminName={adminName}
            teacherName={app.name}
            schoolName={app.schoolName ?? 'your school'}
            approvalEmailFrom={approvalEmailFrom}
          />
          {showExploreClassroom ? <LockedPreviewExploreButton /> : null}
        </>
      ) : null}
      {showExploreClassroom && app?.status === 'MANUAL_REVIEW' ? (
        <LockedPreviewExploreButton />
      ) : null}
    </FreeTierAuthCard>
  );
}
