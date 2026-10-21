import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { CircleAlert, CircleCheck } from 'lucide-react';
import {
  applicationIdFromSignedToken,
  peekSignedLink,
} from '~/domain/free-tier/signed-link.server';
import {
  fetchFreeTierApplicationTerminalGate,
  resolveAdminLinkReplacedGate,
} from '~/domain/free-tier/admin-link-gate.server';
import { completeSchoolAdminApproval } from '~/domain/free-tier/approval-flow.server';
import { prisma } from '~/utils/db.server';
import { FreeTierAuthCard } from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import {
  AdminAlreadyApprovedCard,
  AdminApprovePageIntro,
  AdminDeclinedCard,
  AdminLinkExpiredCard,
  AdminLinkInvalidCard,
  AdminLinkReplacedCard,
  AdminThankYouCard,
  adminApprovePageTitle,
  approveCheckboxError,
} from '../free-tier/AdminApprovalStates';
import { AdminApproveForm } from '../free-tier/AdminApprovalForms';

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
      teacherEmail?: string;
    };

async function applicationFromToken(token: string) {
  const applicationId = applicationIdFromSignedToken(token);
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
    };
  }
  if (peek.reason === 'expired') {
    const app = await applicationFromToken(token);
    if (app) {
      return {
        ok: false as const,
        reason: 'expired' as const,
        schoolName: app.schoolName,
        teacherName: app.name,
      };
    }
  }
  const replaced = await resolveAdminLinkReplacedGate({ token, peek });
  if (replaced) return { ok: false as const, ...replaced };
  if (peek.reason === 'invalid' || !peek.reason) {
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
    const appId = applicationIdFromSignedToken(token);
    if (appId) {
      const gate = await fetchFreeTierApplicationTerminalGate(appId);
      if (gate) return { ok: false as const, ...gate };
    }
    const app = await applicationFromToken(token);
    if (app && !['APPROVED', 'REJECTED', 'EXPIRED'].includes(app.status)) {
      return {
        ok: false as const,
        reason: 'link_replaced' as const,
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

  if (actionData?.ok && 'idempotent' in actionData && actionData.idempotent) {
    return (
      <AdminAlreadyApprovedCard
        teacherName={
          'app' in actionData && actionData.app
            ? actionData.app.name
            : (data.teacherName ?? 'A teacher')
        }
        schoolName={
          'app' in actionData && actionData.app
            ? actionData.app.schoolName
            : (data.schoolName ?? 'your school')
        }
      />
    );
  }

  if (actionData?.ok && 'app' in actionData && actionData.app) {
    return (
      <AdminThankYouCard
        teacherName={actionData.app.name}
        schoolName={actionData.app.schoolName}
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
            {data.teacherName} at {data.schoolName} can start using Yawp! We
            could not send your confirmation email.
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
            Yawp! has reached the current free-tier budget for this environment.
            We did not use this approval link; our team will follow up.
          </p>
        </FreeTierAuthCard>
      );
    }
  }

  return (
    <FreeTierAuthCard
      title={adminApprovePageTitle(data.teacherName, data.schoolName)}
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
