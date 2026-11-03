import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { CircleAlert } from 'lucide-react';
import {
  applicationIdForAdminLinkNaming,
  verifiedApplicationIdForAdminToken,
} from '~/domain/free-tier/admin-link-known-request.server';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import {
  fetchFreeTierApplicationTerminalGate,
  resolveAdminLinkReplacedGate,
  resolveAdminLinkTerminalGate,
} from '~/domain/free-tier/admin-link-gate.server';
import { redirectSchoolAdmin } from '~/domain/free-tier/approval-flow.server';
import { approvalForwardError } from '../free-tier/ApprovalForwardForm';
import type { FreeTierAdminLinkReplacedVariant } from '~/domain/free-tier/admin-link-gate.server';
import { useFreeTierEnabled } from '../free-tier/useFreeTierLayoutContext';
import { prisma } from '~/utils/db.server';
import { FreeTierAuthCard } from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import {
  AdminAlreadyApprovedCard,
  AdminDeclinedCard,
  AdminForwardBackLink,
  AdminForwardSentCard,
  AdminLinkExpiredCard,
  AdminLinkInvalidCard,
  AdminLinkReplacedCard,
  adminForwardPageIntro,
  adminForwardPageTitle,
} from '../free-tier/AdminApprovalStates';
import { AdminForwardForm } from '../free-tier/AdminApprovalForms';

type LoaderData =
  | {
      ok: false;
      reason?: string;
      schoolName?: string;
      teacherName?: string;
      variant?: FreeTierAdminLinkReplacedVariant;
    }
  | {
      ok: true;
      token: string;
      schoolName: string;
      teacherName: string;
      approveBackToken?: string;
      pendingAdminName?: string;
    };

function forwardFormCard(
  data: Extract<LoaderData, { ok: true }>,
  pass1: boolean,
  options: {
    serverErrors?: {
      adminName?: string;
      adminEmail?: string;
    };
    alertMessage?: string;
  } = {}
) {
  return (
    <FreeTierAuthCard title={adminForwardPageTitle(data.teacherName, pass1)}>
      <p className="text-sm text-card-foreground">
        {adminForwardPageIntro(data.teacherName, data.schoolName, pass1)}
      </p>
      {options.alertMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {options.alertMessage}
        </p>
      ) : null}
      <AdminForwardForm
        token={data.token}
        serverErrors={options.serverErrors}
      />
    </FreeTierAuthCard>
  );
}

function forwardPageWithBackLink(
  data: Extract<LoaderData, { ok: true }>,
  pass1: boolean,
  options: Parameters<typeof forwardFormCard>[2] = {}
) {
  return (
    <>
      {forwardFormCard(data, pass1, options)}
      <AdminForwardBackLink
        approveToken={data.approveBackToken}
        className="mt-4 text-muted-foreground"
      />
    </>
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const url = new URL(request.url);
  const token = url.searchParams.get('t') ?? '';
  const approveBackToken = url.searchParams.get('approveT') ?? undefined;
  if (!token) return { ok: false as const, reason: 'invalid' as const };
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  const appId = await applicationIdForAdminLinkNaming(
    token,
    peek,
    'ADMIN_NOT_RIGHT_PERSON'
  );
  if (appId) {
    const gate = await fetchFreeTierApplicationTerminalGate(appId);
    if (gate) return { ok: false as const, ...gate };
  }
  if (peek.ok) {
    const app = await prisma.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: { schoolName: true, name: true },
    });
    const pending = await prisma.freeTierAdminApproval.findFirst({
      where: { applicationId: peek.applicationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { adminName: true },
    });
    return {
      ok: true as const,
      token,
      schoolName: app?.schoolName ?? 'your school',
      teacherName: app?.name ?? 'A teacher',
      approveBackToken,
      pendingAdminName: pending?.adminName,
    };
  }
  if (peek.reason === 'expired') {
    const app = appId
      ? await prisma.freeTierApplication.findUnique({
          where: { id: appId },
          select: { schoolName: true, name: true },
        })
      : null;
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
  const gate = await resolveAdminLinkTerminalGate({
    token,
    peek,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  if (gate) return { ok: false as const, ...gate };
  const replaced = await resolveAdminLinkReplacedGate({
    token,
    peek,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  if (replaced) return { ok: false as const, ...replaced };
  if (
    peek.reason === 'invalid' ||
    peek.reason === 'purpose_mismatch' ||
    !peek.reason
  ) {
    return { ok: false as const, reason: 'invalid' as const };
  }
  return { ok: false as const, reason: peek.reason ?? 'invalid' };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const newAdminName = String(formData.get('adminName') ?? '');
  const newAdminEmail = String(formData.get('adminEmail') ?? '');
  const result = await redirectSchoolAdmin({
    token,
    newAdminName,
    newAdminEmail,
    request,
  });
  if (!result.ok && result.reason === 'link_replaced') {
    return result;
  }
  if (!result.ok && result.reason === 'superseded') {
    const appId = await verifiedApplicationIdForAdminToken(
      token,
      'ADMIN_NOT_RIGHT_PERSON'
    );
    if (appId) {
      const gate = await fetchFreeTierApplicationTerminalGate(appId);
      if (gate) return { ok: false as const, ...gate };
      const app = await prisma.freeTierApplication.findUnique({
        where: { id: appId },
        select: { name: true, schoolName: true, status: true },
      });
      if (app && !['APPROVED', 'REJECTED', 'EXPIRED'].includes(app.status)) {
        return {
          ok: false as const,
          reason: 'link_replaced' as const,
          teacherName: app.name,
          schoolName: app.schoolName,
        };
      }
    }
  }
  if (result.ok) {
    const appId = await verifiedApplicationIdForAdminToken(
      token,
      'ADMIN_NOT_RIGHT_PERSON'
    );
    const app = appId
      ? await prisma.freeTierApplication.findUnique({
          where: { id: appId },
          select: { name: true, schoolName: true, status: true },
        })
      : null;
    return {
      ...result,
      teacherName: app?.name ?? 'A teacher',
      schoolName: app?.schoolName ?? 'your school',
      recipientName: newAdminName.trim(),
      recipientEmail: newAdminEmail.trim(),
      manualReview: app?.status === 'MANUAL_REVIEW',
    };
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
  const teacherName =
    'teacherName' in actionData &&
    typeof (actionData as { teacherName?: string }).teacherName === 'string'
      ? (actionData as { teacherName: string }).teacherName
      : 'A teacher';
  const schoolName =
    'schoolName' in actionData &&
    typeof (actionData as { schoolName?: string }).schoolName === 'string'
      ? (actionData as { schoolName: string }).schoolName
      : 'your school';
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

export default function FreeAdminNotRightPersonRoute() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const pass1 = useFreeTierEnabled();

  if (actionData?.ok) {
    return (
      <AdminForwardSentCard
        teacherName={actionData.teacherName}
        schoolName={actionData.schoolName}
        recipientName={actionData.recipientName}
        recipientEmail={actionData.recipientEmail}
        manualReview={
          'manualReview' in actionData && actionData.manualReview === true
        }
      />
    );
  }

  if (!data.ok) {
    const terminal = terminalFromLoader(data);
    if (terminal) return terminal;
    return <AdminLinkInvalidCard />;
  }

  const actionTerminal = actionData ? terminalFromAction(actionData) : null;
  if (actionTerminal) return actionTerminal;

  if (actionData && !actionData.ok) {
    if (
      actionData.reason === 'invalid' ||
      actionData.reason === 'expired' ||
      actionData.reason === 'purpose_mismatch' ||
      actionData.reason === 'used'
    ) {
      return <AdminLinkInvalidCard />;
    }
    if (actionData.reason === 'validation') {
      const fieldErrors =
        'fieldErrors' in actionData
          ? (actionData.fieldErrors as {
              newAdminName?: string[];
              newAdminEmail?: string[];
            })
          : undefined;
      return forwardPageWithBackLink(data, pass1, {
        serverErrors: {
          ...(fieldErrors?.newAdminName?.[0]
            ? { adminName: 'Enter their name.' }
            : {}),
          ...(fieldErrors?.newAdminEmail?.[0]
            ? { adminEmail: 'Enter a valid email address.' }
            : {}),
        },
      });
    }
    if (
      actionData.reason === 'same_as_teacher' ||
      actionData.reason === 'same_administrator' ||
      actionData.reason === 'chain_cap' ||
      actionData.reason === 'email_failed'
    ) {
      return forwardPageWithBackLink(data, pass1, {
        alertMessage: approvalForwardError(actionData.reason, {
          pass1,
          teacherName: data.teacherName,
          schoolName: data.schoolName,
          adminName: data.pendingAdminName,
        }),
      });
    }
    return (
      <FreeTierAuthCard title="Unable to forward" icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">
          {approvalForwardError(actionData.reason, {
            pass1,
            teacherName: data.teacherName,
            schoolName: data.schoolName,
          })}
        </p>
      </FreeTierAuthCard>
    );
  }

  return forwardPageWithBackLink(data, pass1);
}
