import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { completeSchoolAdminApproval } from '~/domain/free-tier/approval-flow.server';
import { prisma } from '~/utils/db.server';
import {
  FreeTierAuthCard,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';

type LoaderData =
  | { ok: false; reason?: string }
  | { ok: true; token: string; schoolName: string; teacherName: string };

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
  const peek = await peekSignedLink({ token, expectedPurpose: 'ADMIN_APPROVE' });
  if (!peek.ok) {
    if (peek.reason === 'used' || peek.reason === 'superseded') {
      const earlyId = await import('~/domain/free-tier/signed-link.server').then((m) =>
        m.applicationIdFromSignedToken(token)
      );
      if (earlyId) {
        const app = await prisma.freeTierApplication.findUnique({
          where: { id: earlyId },
          select: { status: true, schoolName: true },
        });
        if (app?.status === 'APPROVED') {
          return { ok: false as const, reason: 'already_approved' as const, schoolName: app.schoolName };
        }
      }
      if (peek.reason === 'superseded') {
        return { ok: false as const, reason: 'superseded' as const };
      }
    }
    return { ok: false as const, reason: peek.reason };
  }
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: { schoolName: true, name: true, status: true },
  });
  if (app?.status === 'APPROVED') {
    return { ok: false as const, reason: 'already_approved' as const, schoolName: app.schoolName };
  }
  if (app?.status === 'REJECTED' || app?.status === 'EXPIRED') {
    return { ok: false as const, reason: 'declined' as const, schoolName: app.schoolName };
  }
  return {
    ok: true as const,
    token,
    schoolName: app?.schoolName ?? 'your school',
    teacherName: app?.name ?? 'A teacher',
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const authorized = formData.get('authorized') === 'on';
  const adminRole = String(formData.get('adminRole') ?? '');
  const result = await completeSchoolAdminApproval({
    token,
    authorized,
    adminRole,
    request,
  });
  return result;
}

export default function FreeAdminApproveRoute() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();

  if (actionData && actionData.ok && 'idempotent' in actionData && actionData.idempotent) {
    return (
      <FreeTierAuthCard title="Already approved" className="yawp-entry-status-card">
        <p className="text-sm text-muted-foreground">
          This school has already approved YAWP. No further action is needed.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && actionData.ok && actionData.app) {
    return (
      <FreeTierAuthCard title="Thank you">
        <p className="text-sm text-muted-foreground">
          YAWP is approved for {actionData.app.schoolName}. The teacher will receive an email to sign in and open
          their class.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && !actionData.ok) {
    const message =
      actionData.reason === 'email_failed'
        ? 'We recorded your approval but could not send the confirmation email. Our team will follow up.'
        : actionData.reason === 'superseded'
          ? 'A newer approval link was sent to your school administrator. Please use the most recent email from YAWP.'
          : actionData.reason === 'used'
            ? 'This approval link was already used.'
            : 'We could not complete this approval. The link may be invalid or expired.';
    return (
      <FreeTierAuthCard title="Unable to approve">
        <p className="text-sm text-muted-foreground">{message}</p>
      </FreeTierAuthCard>
    );
  }

  if (!data.ok) {
    if (data.reason === 'already_approved') {
      return (
        <FreeTierAuthCard title="Already approved" className="yawp-entry-status-card">
          <p className="text-sm text-muted-foreground">
            YAWP is already approved for {(data as { schoolName?: string }).schoolName ?? 'this school'}.
          </p>
        </FreeTierAuthCard>
      );
    }
    if (data.reason === 'superseded') {
      return (
        <FreeTierAuthCard title="Link replaced">
          <p className="text-sm text-muted-foreground">
            A newer approval link was sent to your school administrator. Please use the most recent email from YAWP.
          </p>
        </FreeTierAuthCard>
      );
    }
    if (data.reason === 'declined') {
      return (
        <FreeTierAuthCard title="Request not approved" className="yawp-entry-status-card">
          <p className="text-sm text-muted-foreground">
            This YAWP access request for {(data as { schoolName?: string }).schoolName ?? 'this school'} was not
            approved. No further action is needed on this link.
          </p>
        </FreeTierAuthCard>
      );
    }
    return (
      <FreeTierAuthCard title="Link expired or already used">
        <p className="text-sm text-muted-foreground">This link is no longer valid.</p>
      </FreeTierAuthCard>
    );
  }

  return (
    <FreeTierAuthCard
      title={`Approve YAWP for ${data.schoolName}`}
      subtitle={`${data.teacherName} requested access for their classroom.`}
    >
      <p className="text-sm text-muted-foreground">
        Confirm you are authorized to approve classroom software for your school or district.
      </p>
      <Form method="post" className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <FreeTierFieldLabel label="Your role (e.g. Principal, Technology Director)" htmlFor="adminRole">
          <FreeTierTextInput id="adminRole" name="adminRole" required />
        </FreeTierFieldLabel>
        <label className="flex gap-2 text-sm items-start text-left">
          <input type="checkbox" name="authorized" required className="mt-1" />
          <span>I am authorized to approve this use for {data.schoolName}.</span>
        </label>
        <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
          Approve YAWP
        </button>
      </Form>
    </FreeTierAuthCard>
  );
}
