import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import {
  isApprovalV2Enabled,
  forwardApprovalByToken,
} from '~/domain/free-tier/approval-v2.server';
import { FREE_TIER_MODEL_TRAINING_LINE } from '~/domain/free-tier/email-copy';
import {
  ApprovalForwardForm,
  approvalForwardError,
} from '../free-tier/ApprovalForwardForm';
import {
  CircleCheck,
  CircleAlert,
  PencilLine,
  Shield,
  UserRound,
} from 'lucide-react';
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
  | {
      ok: true;
      token: string;
      schoolName: string;
      teacherName: string;
      teacherEmail?: string;
      approvalV2?: boolean;
    };

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
    select: {
      id: true,
      userId: true,
      organizationId: true,
      schoolName: true,
      name: true,
      email: true,
      status: true,
    },
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
    teacherEmail: app?.email,
    approvalV2: app ? await isApprovalV2Enabled(app) : false,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const authorized = formData.get('authorized') === 'on';
  const adminRole = String(formData.get('adminRole') ?? '');
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_APPROVE',
  });
  const app = peek.ok
    ? await prisma.freeTierApplication.findUnique({
        where: { id: peek.applicationId },
        select: { id: true, userId: true, organizationId: true },
      })
    : null;
  const v2 = app ? await isApprovalV2Enabled(app) : false;
  if (formData.get('intent') === 'forward') {
    if (!v2) return { ok: false as const, reason: 'not_allowed' };
    const result = await forwardApprovalByToken({
      token,
      purpose: 'ADMIN_APPROVE',
      newAdminName: String(formData.get('adminName') ?? ''),
      newAdminEmail: String(formData.get('adminEmail') ?? ''),
      request,
    });
    return { ...result, intent: 'forward' as const };
  }
  if (v2 && (!adminRole.trim() || adminRole.trim().length > 120 || !authorized))
    return { ok: false as const, reason: 'validation' };
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

  if (actionData?.ok && 'queued' in actionData && actionData.queued)
    return (
      <FreeTierAuthCard title="Request forwarded" icon={<CircleCheck />}>
        <p className="text-sm text-muted-foreground">
          Your request is queued for the new administrator. We will let the
          teacher know.
        </p>
      </FreeTierAuthCard>
    );

  if (actionData && actionData.ok && 'app' in actionData && actionData.app) {
    return (
      <FreeTierAuthCard title="Thank you" icon={<CircleCheck />}>
        <p className="text-sm text-muted-foreground">
          {actionData.app.name} can start using Yawp! We let them know.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (!data.ok && data.reason === 'already_approved') {
    return (
      <FreeTierAuthCard title="Already approved" icon={<CircleCheck />}>
        <p className="text-sm text-muted-foreground">
          Yawp! is already approved for{' '}
          {(data as { schoolName?: string }).schoolName ?? 'this school'}.
        </p>
      </FreeTierAuthCard>
    );
  }
  if (!data.ok && data.reason === 'declined') {
    return (
      <FreeTierAuthCard title="This request is closed" icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">
          Yawp! did not approve it. Questions? Email support@yawp.school.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && !actionData.ok && actionData.reason === 'already_approved') {
    const approvedSchool =
      'schoolName' in actionData &&
      typeof (actionData as { schoolName?: unknown }).schoolName === 'string'
        ? (actionData as { schoolName: string }).schoolName
        : 'this school';
    return (
      <FreeTierAuthCard title="Already approved" icon={<CircleCheck />}>
        <p className="text-sm text-muted-foreground">
          Yawp! is already approved for {approvedSchool}.
        </p>
      </FreeTierAuthCard>
    );
  }
  if (actionData && !actionData.ok && actionData.reason === 'declined') {
    return (
      <FreeTierAuthCard title="This request is closed" icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">
          Yawp! did not approve it. Questions? Email support@yawp.school.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (
    actionData &&
    !actionData.ok &&
    actionData.reason !== 'validation' &&
    !('intent' in actionData && actionData.intent === 'forward')
  ) {
    const declined =
      actionData.reason === 'illegal_state' &&
      'status' in actionData &&
      (actionData.status === 'REJECTED' || actionData.status === 'EXPIRED');
    const message = declined
      ? 'Yawp! did not approve it. Questions? Email support@yawp.school.'
      : actionData.reason === 'email_failed'
        ? "Your approval is saved, but we couldn't send your confirmation email."
        : actionData.reason === 'superseded'
          ? 'Use the link in our most recent email.'
          : actionData.reason === 'used'
            ? 'This approval link was already used.'
            : actionData.reason === 'budget_exceeded'
              ? 'Yawp! has reached the current free-tier budget for this environment. We did not use this approval link; our team will follow up.'
              : 'We could not complete this approval. The link may be invalid or expired.';
    return (
      <FreeTierAuthCard
        title={
          declined
            ? 'This request is closed'
            : actionData.reason === 'email_failed'
              ? 'Thank you'
              : actionData.reason === 'superseded'
                ? 'This link was replaced'
                : actionData.reason === 'budget_exceeded'
                  ? 'Free classrooms are paused'
                  : 'Unable to approve'
        }
        icon={
          actionData.reason === 'email_failed' ? (
            <CircleCheck />
          ) : (
            <CircleAlert />
          )
        }
      >
        {actionData.reason === 'email_failed' ? (
          <p className="text-sm text-muted-foreground">
            The teacher can start using Yawp!
          </p>
        ) : null}
        <p
          className={
            actionData.reason === 'email_failed'
              ? 'rounded-lg bg-secondary p-3 text-sm text-muted-foreground'
              : 'text-sm text-muted-foreground'
          }
        >
          {message}
        </p>
      </FreeTierAuthCard>
    );
  }

  if (!data.ok) {
    if (data.reason === 'already_approved') {
      return (
        <FreeTierAuthCard title="Already approved" icon={<CircleCheck />}>
          <p className="text-sm text-muted-foreground">
            Yawp! is already approved for{' '}
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
            Yawp! did not approve it. Questions? Email support@yawp.school.
          </p>
        </FreeTierAuthCard>
      );
    }
    return (
      <FreeTierAuthCard
        title={
          data.reason === 'invalid' || !data.reason
            ? "We couldn't open this link"
            : 'This link expired or was used'
        }
        icon={<CircleAlert />}
      >
        <p className="text-sm text-muted-foreground">
          {data.reason === 'invalid' || !data.reason
            ? 'Copy it again from the email.'
            : 'Ask the teacher to send a reminder.'}
        </p>
      </FreeTierAuthCard>
    );
  }

  return (
    <FreeTierAuthCard
      title={`Approve Yawp! for ${data.schoolName}`}
      aside={
        data.approvalV2 ? (
          <>
            <h2 className="text-lg font-semibold">About Yawp!</h2>
            <FreeTierPerson name={data.teacherName} email={data.teacherEmail} />
            <ul className="flex flex-col gap-3 text-sm text-card-foreground">
              <li>Students draft essays with feedback as they write.</li>
              <li>Teachers control assignments and grading.</li>
              <li>{FREE_TIER_MODEL_TRAINING_LINE}</li>
            </ul>
            <section
              aria-label="Administrator guide"
              data-guide-slot="administrator"
            />
          </>
        ) : undefined
      }
    >
      {!data.approvalV2 ? (
        <>
          <FreeTierPerson name={data.teacherName} />
          <ul className="flex flex-col gap-2.5 text-sm text-card-foreground">
            <li className="flex items-start gap-2.5">
              <PencilLine
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              />
              Students draft essays with feedback as they write.
            </li>
            <li className="flex items-start gap-2.5">
              <UserRound
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              />
              Teachers control assignments and grading.
            </li>
            <li className="flex items-start gap-2.5">
              <Shield
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              />
              {FREE_TIER_MODEL_TRAINING_LINE}
            </li>
          </ul>
        </>
      ) : null}
      {actionData &&
      !actionData.ok &&
      actionData.reason === 'validation' &&
      !('intent' in actionData) ? (
        <p role="alert" className="text-sm text-destructive">
          Enter your role and confirm you can approve classroom software.
        </p>
      ) : null}
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <FreeTierFieldLabel label="Your role" htmlFor="adminRole">
          <FreeTierTextInput
            id="adminRole"
            name="adminRole"
            invalidMessage="Enter your role."
            placeholder="Principal, Technology Director"
            required
          />
        </FreeTierFieldLabel>
        <label className="flex gap-2 text-sm items-start text-left">
          <Checkbox name="authorized" required className="mt-1" />
          <span>I can approve classroom software for {data.schoolName}.</span>
        </label>
        <FreeTierButton type="submit">Approve Yawp!</FreeTierButton>
      </Form>
      {data.approvalV2 ? (
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-primary underline underline-offset-4">
            I'd like to learn more first
          </summary>
          <div className="space-y-3 pt-3">
            <p>{data.teacherName}'s request will stay open.</p>
            <iframe
              src="https://app.usemotion.com/meet/brian-connell/ryxkqvr"
              loading="lazy"
              height="700"
              title="Book a time with Brian"
              className="w-full rounded-lg border"
            />
            <a
              href="https://app.usemotion.com/meet/brian-connell/ryxkqvr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-primary underline"
            >
              Open the calendar in a new tab
            </a>
          </div>
        </details>
      ) : null}
      {data.approvalV2 ? (
        <details
          className="text-sm"
          open={actionData && 'intent' in actionData ? true : undefined}
        >
          <summary className="cursor-pointer py-2 text-primary underline underline-offset-4">
            Not the right person? Forward this request
          </summary>
          <div className="pt-3">
            {actionData && !actionData.ok && 'intent' in actionData ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {approvalForwardError(actionData.reason)}
              </p>
            ) : null}
            <ApprovalForwardForm token={data.token} />
          </div>
        </details>
      ) : null}
    </FreeTierAuthCard>
  );
}
