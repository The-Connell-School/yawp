import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import {
  freeClassroomsPausedBody,
  thankYouTeacherEmailFailedBody,
} from '~/domain/free-tier/admin-approval-copy';
import type { FreeTierAdminLinkReplacedVariant } from '~/domain/free-tier/admin-link-gate.server';
import { useFreeTierEnabled } from '../free-tier/useFreeTierLayoutContext';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { applicationIdForAdminLinkNaming } from '~/domain/free-tier/admin-link-known-request.server';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import {
  fetchFreeTierApplicationTerminalGate,
  resolveAdminLinkReplacedGate,
} from '~/domain/free-tier/admin-link-gate.server';
import { completeSchoolAdminApproval } from '~/domain/free-tier/approval-flow.server';
import { prisma } from '~/utils/db.server';
import { FreeTierAuthCard } from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { resolveAdminDenyAnsweredGate } from '~/domain/free-tier/approval-deny.server';
import {
  AdminAlreadyApprovedCard,
  AdminApprovePageIntro,
  AdminDeclinedCard,
  AdminDenyAlreadyAnsweredCard,
  AdminLinkExpiredCard,
  AdminLinkInvalidCard,
  AdminLinkReplacedCard,
  AdminThankYouCard,
  adminApprovePageTitle,
  approveCheckboxError,
} from '../free-tier/AdminApprovalStates';
import { AdminApproveForm } from '../free-tier/AdminApprovalForms';
import { AdminApprovalQa } from '../free-tier/AdminApprovalQa';
import { AdminForwardLink } from '../free-tier/AdminApprovalStates';

type LoaderData =
  | {
      ok: false;
      reason?: string;
      schoolName?: string;
      teacherName?: string;
      variant?: FreeTierAdminLinkReplacedVariant;
      decidedAt?: string;
    }
  | {
      ok: true;
      token: string;
      schoolName: string;
      teacherName: string;
      teacherEmail?: string;
      showDenyAndQa: boolean;
    };

async function applicationFromVerifiedToken(
  token: string,
  peek: Awaited<ReturnType<typeof peekSignedLink>>
) {
  const applicationId = await applicationIdForAdminLinkNaming(
    token,
    peek,
    'ADMIN_APPROVE'
  );
  if (!applicationId) return null;
  return prisma.freeTierApplication.findUnique({
    where: { id: applicationId },
    select: { schoolName: true, name: true, email: true, status: true },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const, reason: 'invalid' as const };
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_APPROVE',
  });
  const appId = await applicationIdForAdminLinkNaming(
    token,
    peek,
    'ADMIN_APPROVE'
  );
  const showDenyAndQa = await isFeatureFlagEnabled(FREE_TIER_FLAG);
  if (appId) {
    const gate = await fetchFreeTierApplicationTerminalGate(appId);
    if (gate) return { ok: false as const, ...gate };
    if (showDenyAndQa) {
      const denied = await resolveAdminDenyAnsweredGate({ token });
      if (denied?.reason === 'admin_denied') {
        return {
          ok: false as const,
          reason: 'admin_denied' as const,
          teacherName: denied.teacherName,
          schoolName: denied.schoolName,
          decidedAt: denied.decidedAt.toISOString(),
        };
      }
    }
  }
  if (peek.ok) {
    const app = await prisma.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: {
        schoolName: true,
        name: true,
        email: true,
      },
    });
    return {
      ok: true as const,
      token,
      schoolName: app?.schoolName ?? 'your school',
      teacherName: app?.name ?? 'A teacher',
      teacherEmail: app?.email,
      showDenyAndQa,
    };
  }
  if (peek.reason === 'expired') {
    const app = await applicationFromVerifiedToken(token, peek);
    if (app) {
      return {
        ok: false as const,
        reason: 'expired' as const,
        schoolName: app.schoolName,
        teacherName: app.name,
      };
    }
    return { ok: false as const, reason: 'invalid' as const };
  }
  const replaced = await resolveAdminLinkReplacedGate({
    token,
    peek,
    expectedPurpose: 'ADMIN_APPROVE',
  });
  if (replaced) return { ok: false as const, ...replaced };
  if (
    peek.reason === 'invalid' ||
    peek.reason === 'purpose_mismatch' ||
    !peek.reason
  ) {
    return { ok: false as const, reason: 'invalid' as const };
  }
  return { ok: false as const, reason: peek.reason };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const authorized = formData.get('authorized') === 'on';
  const adminRole = String(formData.get('adminRole') ?? '');
  if (!adminRole.trim() || adminRole.trim().length > 120 || !authorized) {
    return { ok: false as const, reason: 'validation' as const };
  }
  const result = await completeSchoolAdminApproval({
    token,
    authorized,
    adminRole,
    request,
  });
  if (!result.ok && result.reason === 'superseded') {
    const peek = await peekSignedLink({
      token,
      expectedPurpose: 'ADMIN_APPROVE',
    });
    const replaced = await resolveAdminLinkReplacedGate({
      token,
      peek,
      expectedPurpose: 'ADMIN_APPROVE',
    });
    if (replaced) return { ok: false as const, ...replaced };
    const appId = await applicationIdForAdminLinkNaming(
      token,
      peek,
      'ADMIN_APPROVE'
    );
    if (appId) {
      const gate = await fetchFreeTierApplicationTerminalGate(appId);
      if (gate) return { ok: false as const, ...gate };
    }
    const app = await applicationFromVerifiedToken(token, peek);
    if (app && !['APPROVED', 'REJECTED', 'EXPIRED'].includes(app.status)) {
      return {
        ok: false as const,
        reason: 'link_replaced' as const,
        variant: 'resent' as const,
        teacherName: app.name,
        schoolName: app.schoolName,
      };
    }
  }
  return result;
}

function terminalFromLoader(data: Extract<LoaderData, { ok: false }>) {
  const teacherName = data.teacherName ?? 'A teacher';
  const schoolName = data.schoolName ?? 'your school';
  if (data.reason === 'already_approved') {
    return (
      <AdminAlreadyApprovedCard
        teacherName={teacherName}
        schoolName={schoolName}
      />
    );
  }
  if (data.reason === 'declined') {
    return (
      <AdminDeclinedCard teacherName={teacherName} schoolName={schoolName} />
    );
  }
  if (
    data.reason === 'admin_denied' &&
    'decidedAt' in data &&
    typeof data.decidedAt === 'string'
  ) {
    return (
      <AdminDenyAlreadyAnsweredCard
        teacherName={teacherName}
        schoolName={schoolName}
        decidedAt={new Date(data.decidedAt)}
      />
    );
  }
  if (data.reason === 'expired') {
    return (
      <AdminLinkExpiredCard teacherName={teacherName} schoolName={schoolName} />
    );
  }
  if (data.reason === 'link_replaced') {
    return (
      <AdminLinkReplacedCard
        teacherName={teacherName}
        schoolName={schoolName}
        variant={data.variant ?? 'forwarded'}
      />
    );
  }
  if (data.reason === 'invalid') {
    return (
      <AdminLinkInvalidCard
        teacherName={data.teacherName}
        schoolName={data.schoolName}
      />
    );
  }
  return null;
}

function terminalFromAction(actionData: NonNullable<ReturnType<typeof useActionData<typeof action>>>) {
  if (actionData.ok) return null;
  const actionApp =
    'app' in actionData
      ? (actionData as { app?: { name?: string; schoolName?: string } }).app
      : undefined;
  const teacherName =
    actionApp?.name ??
    ('teacherName' in actionData &&
    typeof (actionData as { teacherName?: string }).teacherName === 'string'
      ? (actionData as { teacherName: string }).teacherName
      : 'A teacher');
  const schoolName =
    actionApp?.schoolName ??
    ('schoolName' in actionData &&
    typeof (actionData as { schoolName?: string }).schoolName === 'string'
      ? (actionData as { schoolName: string }).schoolName
      : 'your school');
  if (actionData.reason === 'already_approved') {
    return (
      <AdminAlreadyApprovedCard
        teacherName={teacherName}
        schoolName={schoolName}
      />
    );
  }
  if (actionData.reason === 'declined') {
    return (
      <AdminDeclinedCard teacherName={teacherName} schoolName={schoolName} />
    );
  }
  if (
    actionData.reason === 'link_replaced' ||
    actionData.reason === 'superseded'
  ) {
    return (
      <AdminLinkReplacedCard
        teacherName={teacherName}
        schoolName={schoolName}
        variant={
          'variant' in actionData
            ? (actionData as { variant?: FreeTierAdminLinkReplacedVariant })
                .variant ?? 'forwarded'
            : 'forwarded'
        }
      />
    );
  }
  if (
    actionData.reason === 'illegal_state' &&
    'status' in actionData &&
    actionData.status === 'APPROVED'
  ) {
    return (
      <AdminAlreadyApprovedCard
        teacherName={teacherName}
        schoolName={schoolName}
      />
    );
  }
  if (
    actionData.reason === 'illegal_state' &&
    'status' in actionData &&
    (actionData.status === 'REJECTED' || actionData.status === 'EXPIRED')
  ) {
    return (
      <AdminDeclinedCard teacherName={teacherName} schoolName={schoolName} />
    );
  }
  return null;
}

export default function FreeAdminApproveRoute() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const pass1 = useFreeTierEnabled();

  if (actionData?.ok && 'idempotent' in actionData && actionData.idempotent) {
    const teacherName = data.ok ? data.teacherName : 'A teacher';
    const schoolName = data.ok ? data.schoolName : 'your school';
    return (
      <AdminAlreadyApprovedCard
        teacherName={teacherName}
        schoolName={schoolName}
      />
    );
  }

  if (actionData?.ok && 'app' in actionData && actionData.app) {
    const app = actionData.app as { name: string; schoolName: string };
    return (
      <AdminThankYouCard teacherName={app.name} schoolName={app.schoolName} />
    );
  }

  if (!data.ok) {
    const terminal = terminalFromLoader(data);
    if (terminal) return terminal;
    return <AdminLinkInvalidCard />;
  }

  const actionTerminal = actionData ? terminalFromAction(actionData) : null;
  if (actionTerminal) return actionTerminal;

  if (actionData && !actionData.ok && actionData.reason !== 'validation') {
    const declined =
      actionData.reason === 'illegal_state' &&
      'status' in actionData &&
      (actionData.status === 'REJECTED' || actionData.status === 'EXPIRED');
    if (declined) {
      return (
        <AdminDeclinedCard
          teacherName={data.teacherName}
          schoolName={data.schoolName}
        />
      );
    }
    if (actionData.reason === 'email_failed') {
      return (
        <FreeTierAuthCard title="Thank you" icon={<CircleCheck />} status>
          <p className="text-sm text-muted-foreground">
            {thankYouTeacherEmailFailedBody(
              data.teacherName,
              data.schoolName,
              pass1
            )}
          </p>
        </FreeTierAuthCard>
      );
    }
    if (
      actionData.reason === 'link_replaced' ||
      actionData.reason === 'superseded'
    ) {
      return (
        <AdminLinkReplacedCard
          teacherName={data.teacherName}
          schoolName={data.schoolName}
          variant={
            'variant' in actionData
              ? (actionData as { variant?: FreeTierAdminLinkReplacedVariant })
                  .variant ?? 'forwarded'
              : 'forwarded'
          }
        />
      );
    }
    if (actionData.reason === 'budget_exceeded') {
      return (
        <FreeTierAuthCard
          title="Free classrooms are paused"
          icon={<CircleAlert />}
        >
          <p className="text-sm text-muted-foreground">
            {freeClassroomsPausedBody(
              data.teacherName,
              data.schoolName,
              pass1
            )}
          </p>
        </FreeTierAuthCard>
      );
    }
  }

  return (
    <FreeTierAuthCard
      title={adminApprovePageTitle(data.teacherName, data.schoolName)}
      belowCard={
        data.showDenyAndQa ? (
          <AdminForwardLink token={data.token} />
        ) : undefined
      }
      stackAfterCard={
        data.showDenyAndQa ? (
          <AdminApprovalQa teacherName={data.teacherName} />
        ) : undefined
      }
    >
      <AdminApprovePageIntro
        teacherName={data.teacherName}
        schoolName={data.schoolName}
        teacherEmail={data.teacherEmail}
      />
      <AdminApproveForm
        token={data.token}
        schoolName={data.schoolName}
        teacherName={data.teacherName}
        showDenyAndQa={data.showDenyAndQa}
        serverErrors={
          actionData && !actionData.ok && actionData.reason === 'validation'
            ? {
                adminRole: 'Enter your role.',
                authorized: approveCheckboxError(
                  data.teacherName,
                  data.schoolName
                ),
              }
            : undefined
        }
      />
    </FreeTierAuthCard>
  );
}
