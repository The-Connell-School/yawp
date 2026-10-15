import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { CircleCheck, CircleAlert, PencilLine, Shield, UserRound } from 'lucide-react';
import { Form } from 'react-router';
import { Checkbox } from '~/components/ui/checkbox';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { completeSchoolAdminApproval } from '~/domain/free-tier/approval-flow.server';
import { prisma } from '~/utils/db.server';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
  FreeTierPerson,
} from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

type LoaderData =
  | { ok: false; reason?: string }
  | { ok: true; token: string; schoolName: string; teacherName: string };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_APPROVE',
  });
  if (!peek.ok) {
    if (peek.reason === 'used' || peek.reason === 'superseded') {
      const earlyId =
        await import('~/domain/free-tier/signed-link.server').then((m) =>
          m.applicationIdFromSignedToken(token)
        );
      if (earlyId) {
        const app = await prisma.freeTierApplication.findUnique({
          where: { id: earlyId },
          select: { status: true, schoolName: true },
        });
        if (app?.status === 'APPROVED') {
          return {
            ok: false as const,
            reason: 'already_approved' as const,
            schoolName: app.schoolName,
          };
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
    return {
      ok: false as const,
      reason: 'already_approved' as const,
      schoolName: app.schoolName,
    };
  }
  if (app?.status === 'REJECTED' || app?.status === 'EXPIRED') {
    return {
      ok: false as const,
      reason: 'declined' as const,
      schoolName: app.schoolName,
    };
  }
  return {
    ok: true as const,
    token,
    schoolName: app?.schoolName ?? 'your school',
    teacherName: app?.name ?? 'A teacher',
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
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

  if (
    actionData &&
    actionData.ok &&
    'idempotent' in actionData &&
    actionData.idempotent
  ) {
    return (
      <FreeTierAuthCard title="Already approved" icon={<CircleCheck />}>
        <p className="text-sm text-muted-foreground">
          The teacher already has access. Nothing else to do.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && actionData.ok && actionData.app) {
    return (
      <FreeTierAuthCard title="Thank you" icon={<CircleCheck />}>
        <p className="text-sm text-muted-foreground">
          {actionData.app.name} can start using YAWP. We let them know.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && !actionData.ok) {
    const declined =
      actionData.reason === 'illegal_state' &&
      (actionData.status === 'REJECTED' || actionData.status === 'EXPIRED');
    const message = declined
      ? 'YAWP did not approve it. Questions? Email support@yawp.school.'
      : actionData.reason === 'email_failed'
        ? "Your approval is saved, but we couldn't send your confirmation email."
        : actionData.reason === 'superseded'
          ? 'Use the link in our most recent email.'
          : actionData.reason === 'used'
            ? 'This approval link was already used.'
            : actionData.reason === 'budget_exceeded'
              ? 'YAWP has reached the current free-tier budget for this environment. We did not use this approval link; our team will follow up.'
              : 'We could not complete this approval. The link may be invalid or expired.';
    return (
      <FreeTierAuthCard
        title={declined ? 'This request is closed' : actionData.reason === 'email_failed' ? 'Thank you' : actionData.reason === 'superseded' ? 'This link was replaced' : actionData.reason === 'budget_exceeded' ? 'Free classrooms are paused' : 'Unable to approve'}
        icon={actionData.reason === 'email_failed' ? <CircleCheck /> : <CircleAlert />}
      >
        {actionData.reason === 'email_failed' ? <p className="text-sm text-muted-foreground">The teacher can start using YAWP.</p> : null}
        <p className={actionData.reason === 'email_failed' ? 'rounded-lg bg-secondary p-3 text-sm text-muted-foreground' : 'text-sm text-muted-foreground'}>{message}</p>
      </FreeTierAuthCard>
    );
  }

  if (!data.ok) {
    if (data.reason === 'already_approved') {
      return (
        <FreeTierAuthCard title="Already approved" icon={<CircleCheck />}>
          <p className="text-sm text-muted-foreground">
            YAWP is already approved for{' '}
            {(data as { schoolName?: string }).schoolName ?? 'this school'}.
          </p>
        </FreeTierAuthCard>
      );
    }
    if (data.reason === 'superseded') {
      return (
        <FreeTierAuthCard title="This link was replaced" icon={<CircleAlert />}>
          <p className="text-sm text-muted-foreground">
            Use the link in our most recent email.
          </p>
        </FreeTierAuthCard>
      );
    }
    if (data.reason === 'declined') {
      return (
        <FreeTierAuthCard title="This request is closed" icon={<CircleAlert />}>
          <p className="text-sm text-muted-foreground">
            YAWP did not approve it. Questions? Email support@yawp.school.
          </p>
        </FreeTierAuthCard>
      );
    }
    return (
      <FreeTierAuthCard title={data.reason === 'invalid' || !data.reason ? "We couldn't open this link" : 'This link expired or was used'} icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">
          {data.reason === 'invalid' || !data.reason ? 'Copy it again from the email.' : 'Ask the teacher to send a reminder.'}
        </p>
      </FreeTierAuthCard>
    );
  }

  return (
    <FreeTierAuthCard
      title={`Approve YAWP for ${data.schoolName}`}
    >
      <FreeTierPerson name={data.teacherName} />
      <ul className="flex flex-col gap-2.5 text-sm text-card-foreground">
        <li className="flex items-start gap-2.5"><PencilLine aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />Students draft essays with feedback as they write.</li>
        <li className="flex items-start gap-2.5"><UserRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />Teachers control assignments and grading.</li>
        <li className="flex items-start gap-2.5"><Shield aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />Student writing is never used to train outside models.</li>
      </ul>
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <FreeTierFieldLabel
          label="Your role"
          htmlFor="adminRole"
        >
          <FreeTierTextInput id="adminRole" name="adminRole" invalidMessage="Enter your role." placeholder="Principal, Technology Director" required />
        </FreeTierFieldLabel>
        <label className="flex gap-2 text-sm items-start text-left">
          <Checkbox name="authorized" required className="mt-1" />
          <span>
            I can approve classroom software for {data.schoolName}.
          </span>
        </label>
        <FreeTierButton type="submit">Approve YAWP</FreeTierButton>
      </Form>
    </FreeTierAuthCard>
  );
}
