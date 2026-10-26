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
import { teacherPendingForwardError } from '~/domain/free-tier/admin-approval-copy';
import {
  ApprovalForwardForm,
  approvalForwardError,
} from '../free-tier/ApprovalForwardForm';
import { PendingForwardDisclosure } from '../free-tier/PendingForwardDisclosure';
import { PendingForwardSuccessBanner } from '../free-tier/PendingForwardSuccessBanner';
import { Clock, Info } from 'lucide-react';
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
import { yawpE2eForwardShouldFail } from '~/domain/free-tier/e2e-stub.server';

const FORWARD_ERROR_REASONS = new Set([
  'validation',
  'same_as_teacher',
  'same_administrator',
  'chain_cap',
  'email_failed',
  'superseded',
  'rate_limited',
  'unavailable',
]);

type PendingActionData = Awaited<ReturnType<typeof action>>;

function pendingForwardAlertMessage(
  reason: string,
  ctx: { schoolName: string; adminName?: string }
) {
  switch (reason) {
    case 'same_as_teacher':
    case 'same_administrator':
    case 'chain_cap':
    case 'email_failed':
      return teacherPendingForwardError({
        reason,
        schoolName: ctx.schoolName,
        adminName: ctx.adminName,
      });
    default:
      return approvalForwardError(reason, {
        pass1: false,
        schoolName: ctx.schoolName,
        adminName: ctx.adminName,
      });
  }
}

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

function PendingCardFooter() {
  return (
    <div className="flex flex-col items-center gap-1">
      <FreeTierSignOut />
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
    if (yawpE2eForwardShouldFail(request)) {
      return { ok: false as const, reason: 'unavailable' };
    }
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

function LockedPreviewExploreButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <FreeTierButton
      asChild
      data-testid="locked-preview-explore"
      className={disabled ? 'pointer-events-none opacity-50' : undefined}
      aria-disabled={disabled ? true : undefined}
    >
      <Link
        to="/app"
        tabIndex={disabled ? -1 : undefined}
        aria-disabled={disabled ? true : undefined}
        onClick={
          disabled
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
      >
        Explore my classroom
      </Link>
    </FreeTierButton>
  );
}

function PendingDraftRequestLink({
  adminEmail,
  adminName,
  teacherName,
  schoolName,
  approvalEmailFrom,
  disabled = false,
}: {
  adminEmail: string;
  adminName: string;
  teacherName: string;
  schoolName: string;
  approvalEmailFrom: string;
  disabled?: boolean;
}) {
  if (!adminEmail.trim()) return null;
  return (
    <FreeTierButton
      asChild
      variant="outline"
      className={`free-tier-draft-request${disabled ? ' pointer-events-none opacity-50' : ''}`}
      data-testid="pending-draft-request"
      aria-disabled={disabled ? true : undefined}
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
  const forwarding =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') === 'forward';
  const resending =
    navigation.state === 'submitting' &&
    navigation.formData?.get('intent') !== 'forward';
  const adminName = pending?.adminName ?? 'your administrator';
  const [forwardOpen, setForwardOpen] = useState(false);
  const [askAnotherOpen, setAskAnotherOpen] = useState(askOpen);

  useEffect(() => {
    if (isForwardActionError(actionData)) setForwardOpen(true);
  }, [actionData]);

  useEffect(() => {
    if (actionData?.ok && 'queued' in actionData) setForwardOpen(false);
  }, [actionData]);

  useEffect(() => {
    if (askOpen) setAskAnotherOpen(true);
  }, [askOpen]);

  if (teacherDenied && approvalV2?.enabled) {
    const { denied, chainCapReached, askAnotherHint: hint } = teacherDenied;
    return (
      <FreeTierAuthCard
        title={teacherDeniedStatusTitle()}
        icon={<Info className="h-5 w-5" aria-hidden />}
        footer={
          <div className="flex flex-col items-center gap-1">
            {showExploreClassroom ? (
              <Button
                type="button"
                variant="link"
                asChild
                className="h-auto p-0 text-sm underline"
              >
                <Link to="/app">Explore my classroom</Link>
              </Button>
            ) : null}
            <FreeTierSignOut />
          </div>
        }
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
        {actionData?.ok && 'queued' in actionData ? (
          <p role="status" className="text-sm text-muted-foreground">
            Request sent to {actionData.adminName}!
          </p>
        ) : null}
        {isForwardActionError(actionData) ? (
          <p role="alert" className="text-sm text-destructive">
            {pendingForwardAlertMessage(actionData.reason, {
              schoolName: app?.schoolName ?? 'your school',
              adminName: denied?.adminName,
            })}
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
        footer={<PendingCardFooter />}
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
            {actionData?.ok && 'queued' in actionData && actionData.adminName ? (
              <PendingForwardSuccessBanner adminName={actionData.adminName} />
            ) : null}
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
                {showForwardToggle ? (
                  <PendingForwardDisclosure
                    currentAdminName={current.adminName}
                    currentAdminEmail={current.adminEmail}
                    approvalId={current.id}
                    open={forwardOpen}
                    onOpenChange={setForwardOpen}
                    forwarding={forwarding}
                    schoolName={app.schoolName ?? 'your school'}
                    serverAlert={
                      isForwardActionError(actionData)
                        ? pendingForwardAlertMessage(actionData.reason, {
                            schoolName: app.schoolName ?? 'your school',
                            adminName: current.adminName,
                          })
                        : null
                    }
                  />
                ) : null}
                <PendingDraftRequestLink
                  adminEmail={current.adminEmail}
                  adminName={current.adminName}
                  teacherName={app.name}
                  schoolName={app.schoolName ?? 'your school'}
                  approvalEmailFrom={approvalEmailFrom}
                  disabled={forwarding}
                />
                {showExploreClassroom ? (
                  <LockedPreviewExploreButton disabled={forwarding} />
                ) : null}
              </>
            ) : null}
            {showExploreClassroom && app?.status === 'MANUAL_REVIEW' ? (
              <LockedPreviewExploreButton />
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
            : `${pending?.adminName ?? 'Your administrator'} approves`,
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
