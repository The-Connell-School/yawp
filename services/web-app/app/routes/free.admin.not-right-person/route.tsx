import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { CircleAlert } from 'lucide-react';
import {
  applicationIdFromSignedToken,
  peekSignedLink,
} from '~/domain/free-tier/signed-link.server';
import {
  fetchFreeTierApplicationTerminalGate,
  resolveAdminLinkReplacedGate,
  resolveAdminLinkTerminalGate,
} from '~/domain/free-tier/admin-link-gate.server';
import { redirectSchoolAdmin } from '~/domain/free-tier/approval-flow.server';
import { approvalForwardError } from '../free-tier/ApprovalForwardForm';
import { prisma } from '~/utils/db.server';
import { FreeTierAuthCard } from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import {
  AdminAlreadyApprovedCard,
  AdminDeclinedCard,
  AdminForwardSentCard,
  AdminLinkExpiredCard,
  AdminLinkInvalidCard,
  AdminLinkReplacedCard,
  adminForwardPageIntro,
} from '../free-tier/AdminApprovalStates';
import { AdminForwardForm } from '../free-tier/AdminApprovalForms';

type LoaderData =
  | {
      ok: false;
      reason?: string;
      schoolName?: string;
      teacherName?: string;
    }
  | {
      ok: true;
      token: string;
      schoolName: string;
      teacherName: string;
    };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const, reason: 'invalid' as const };
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  const appId = peek.ok
    ? peek.applicationId
    : applicationIdFromSignedToken(token);
  if (appId) {
    const gate = await fetchFreeTierApplicationTerminalGate(appId);
    if (gate) return { ok: false as const, ...gate };
  }
  if (peek.ok) {
    const app = await prisma.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: { schoolName: true, name: true },
    });
    return {
      ok: true as const,
      token,
      schoolName: app?.schoolName ?? 'your school',
      teacherName: app?.name ?? 'A teacher',
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
  }
  const gate = await resolveAdminLinkTerminalGate({ token, peek });
  if (gate) return { ok: false as const, ...gate };
  const replaced = await resolveAdminLinkReplacedGate({ token, peek });
  if (replaced) return { ok: false as const, ...replaced };
  return { ok: false as const, reason: peek.reason ?? 'invalid' };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const formData = await request.formData();
  const result = await redirectSchoolAdmin({
    token: String(formData.get('token') ?? ''),
    newAdminName: String(formData.get('adminName') ?? ''),
    newAdminEmail: String(formData.get('adminEmail') ?? ''),
    request,
  });
  if (!result.ok && result.reason === 'link_replaced') {
    return result;
  }
  if (!result.ok && result.reason === 'superseded') {
    const token = String(formData.get('token') ?? '');
    const appId = applicationIdFromSignedToken(token);
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
      />
    );
  }
  if (data.reason === 'invalid') {
    return <AdminLinkInvalidCard />;
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

  if (actionData?.ok) {
    return <AdminForwardSentCard />;
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
      return (
        <FreeTierAuthCard title="Forward this request">
          <p className="text-sm text-card-foreground">
            {adminForwardPageIntro(data.teacherName, data.schoolName)}
          </p>
          <AdminForwardForm
            token={data.token}
            teacherName={data.teacherName}
            schoolName={data.schoolName}
            serverErrors={{
              adminName: fieldErrors?.newAdminName?.[0] ?? 'Enter their name.',
              adminEmail:
                fieldErrors?.newAdminEmail?.[0] ??
                'Enter a valid email address.',
            }}
          />
        </FreeTierAuthCard>
      );
    }
    if (
      actionData.reason === 'same_as_teacher' ||
      actionData.reason === 'same_administrator' ||
      actionData.reason === 'chain_cap' ||
      actionData.reason === 'email_failed'
    ) {
      return (
        <FreeTierAuthCard title="Forward this request">
          <p className="text-sm text-card-foreground">
            {adminForwardPageIntro(data.teacherName, data.schoolName)}
          </p>
          <p role="alert" className="text-sm text-destructive">
            {actionData.reason === 'email_failed'
              ? "We couldn't send the email. Try again."
              : approvalForwardError(actionData.reason)}
          </p>
          <AdminForwardForm
            token={data.token}
            teacherName={data.teacherName}
            schoolName={data.schoolName}
          />
        </FreeTierAuthCard>
      );
    }
    return (
      <FreeTierAuthCard title="Unable to forward" icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">
          {approvalForwardError(actionData.reason)}
        </p>
      </FreeTierAuthCard>
    );
  }

  return (
    <FreeTierAuthCard title="Forward this request">
      <p className="text-sm text-card-foreground">
        {adminForwardPageIntro(data.teacherName, data.schoolName)}
      </p>
      <AdminForwardForm
        token={data.token}
        teacherName={data.teacherName}
        schoolName={data.schoolName}
      />
    </FreeTierAuthCard>
  );
}
