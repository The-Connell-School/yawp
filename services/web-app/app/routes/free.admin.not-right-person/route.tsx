import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { CircleAlert, CircleCheck, Send } from 'lucide-react';
import { Form } from 'react-router';
import {
  applicationIdFromSignedToken,
  peekSignedLink,
} from '~/domain/free-tier/signed-link.server';
import {
  fetchFreeTierApplicationTerminalGate,
  resolveAdminLinkTerminalGate,
} from '~/domain/free-tier/admin-link-gate.server';
import { redirectSchoolAdmin } from '~/domain/free-tier/approval-flow.server';
import { approvalForwardError } from '../free-tier/ApprovalForwardForm';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

type LoaderData =
  | { ok: false; reason?: string; schoolName?: string }
  | { ok: true; token: string };

function AlreadyApprovedCard({ schoolName }: { schoolName?: string }) {
  return (
    <FreeTierAuthCard title="Already approved" icon={<CircleCheck />}>
      <p className="text-sm text-muted-foreground">
        Yawp! is already approved for {schoolName ?? 'this school'}.
      </p>
    </FreeTierAuthCard>
  );
}

function DeclinedCard() {
  return (
    <FreeTierAuthCard title="This request is closed" icon={<CircleAlert />}>
      <p className="text-sm text-muted-foreground">
        Yawp! did not approve it. Questions? Email support@yawp.school.
      </p>
    </FreeTierAuthCard>
  );
}

function InvalidLinkCard() {
  return (
    <FreeTierAuthCard
      title="This link expired or was used"
      icon={<CircleAlert />}
    >
      <p className="text-sm text-muted-foreground">
        Ask the teacher to send a reminder.
      </p>
    </FreeTierAuthCard>
  );
}

function loaderTerminalView(data: LoaderData) {
  if (data.ok) return null;
  if (data.reason === 'already_approved') {
    return <AlreadyApprovedCard schoolName={data.schoolName} />;
  }
  if (data.reason === 'declined') {
    return <DeclinedCard />;
  }
  return null;
}

function schoolNameFromAction(actionData: object): string | undefined {
  if (
    'schoolName' in actionData &&
    typeof (actionData as { schoolName?: unknown }).schoolName === 'string'
  ) {
    return (actionData as { schoolName: string }).schoolName;
  }
  return undefined;
}

function actionTerminalView(actionData: NonNullable<ReturnType<typeof useActionData<typeof action>>>) {
  if (actionData.ok) return null;
  if (actionData.reason === 'already_approved') {
    return (
      <AlreadyApprovedCard schoolName={schoolNameFromAction(actionData)} />
    );
  }
  if (actionData.reason === 'declined') {
    return <DeclinedCard />;
  }
  if (
    actionData.reason === 'illegal_state' &&
    'status' in actionData &&
    actionData.status === 'APPROVED'
  ) {
    return <AlreadyApprovedCard />;
  }
  if (
    actionData.reason === 'illegal_state' &&
    'status' in actionData &&
    (actionData.status === 'REJECTED' || actionData.status === 'EXPIRED')
  ) {
    return <DeclinedCard />;
  }
  return null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
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
  if (peek.ok) return { ok: true as const, token };
  const gate = await resolveAdminLinkTerminalGate({ token, peek });
  if (gate) return { ok: false as const, ...gate };
  return { ok: false as const };
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
  return result;
}

export default function FreeAdminNotRightPersonRoute() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();

  const loaderTerminal = loaderTerminalView(data);
  if (loaderTerminal) return loaderTerminal;

  if (actionData?.ok) {
    return (
      <FreeTierAuthCard title="Request forwarded" icon={<Send />}>
        <p className="text-sm text-muted-foreground">
          {'queued' in actionData
            ? 'Your request is queued. We will email the teacher an update.'
            : "We emailed the administrator you named. You're all set."}
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && !actionData.ok) {
    const actionTerminal = actionTerminalView(actionData);
    if (actionTerminal) return actionTerminal;
    if (
      actionData.reason === 'invalid' ||
      actionData.reason === 'expired' ||
      actionData.reason === 'purpose_mismatch' ||
      actionData.reason === 'used'
    ) {
      return <InvalidLinkCard />;
    }
    if (actionData.reason === 'validation') {
      const fieldErrors =
        'fieldErrors' in actionData
          ? (actionData.fieldErrors as {
              newAdminName?: string[];
              newAdminEmail?: string[];
            })
          : undefined;
      if (!data.ok) {
        return (
          <FreeTierAuthCard
            title="This link expired or was used"
            icon={<CircleAlert />}
          >
            <p className="text-sm text-muted-foreground">
              Ask the teacher to send a reminder.
            </p>
          </FreeTierAuthCard>
        );
      }
      return (
        <FreeTierAuthCard
          title="Send to the right person"
          subtitle="Who approves classroom software for this site or district?"
        >
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="token" value={data.token} />
            {fieldErrors?.newAdminEmail?.[0] ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.newAdminEmail[0]}
              </p>
            ) : fieldErrors?.newAdminName?.[0] ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.newAdminName[0]}
              </p>
            ) : (
              <p role="alert" className="text-sm text-destructive">
                {approvalForwardError('validation')}
              </p>
            )}
            <FreeTierFieldLabel label="Administrator name" htmlFor="adminName">
              <FreeTierTextInput id="adminName" name="adminName" required />
            </FreeTierFieldLabel>
            <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
              <FreeTierTextInput
                id="adminEmail"
                name="adminEmail"
                placeholder="name@district.org"
                type="email"
                required
              />
            </FreeTierFieldLabel>
            <FreeTierButton type="submit">Forward request</FreeTierButton>
          </Form>
        </FreeTierAuthCard>
      );
    }
    if (
      actionData.reason === 'same_as_teacher' ||
      actionData.reason === 'same_administrator' ||
      actionData.reason === 'superseded'
    ) {
      if (!data.ok) {
        return (
          <FreeTierAuthCard
            title="This link expired or was used"
            icon={<CircleAlert />}
          >
            <p className="text-sm text-muted-foreground">
              Ask the teacher to send a reminder.
            </p>
          </FreeTierAuthCard>
        );
      }
      return (
        <FreeTierAuthCard
          title="Send to the right person"
          subtitle="Who approves classroom software for this site or district?"
        >
          <p role="alert" className="text-sm text-destructive">
            {approvalForwardError(actionData.reason)}
          </p>
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="token" value={data.token} />
            <FreeTierFieldLabel label="Administrator name" htmlFor="adminName">
              <FreeTierTextInput id="adminName" name="adminName" required />
            </FreeTierFieldLabel>
            <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
              <FreeTierTextInput
                id="adminEmail"
                name="adminEmail"
                placeholder="name@district.org"
                type="email"
                required
              />
            </FreeTierFieldLabel>
            <FreeTierButton type="submit">Forward request</FreeTierButton>
          </Form>
        </FreeTierAuthCard>
      );
    }
    const message =
      actionData.reason === 'email_failed'
        ? "We couldn't send the email. Try again."
        : actionData.reason === 'chain_cap'
          ? 'This request was forwarded too many times. Email support@yawp.school and we will sort it out.'
          : 'We could not forward this request. The link may be invalid or already used.';
    return (
      <FreeTierAuthCard title="Unable to forward" icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">{message}</p>
      </FreeTierAuthCard>
    );
  }

  if (!data.ok) {
    return <InvalidLinkCard />;
  }
  return (
    <FreeTierAuthCard
      title="Send to the right person"
      subtitle="Who approves classroom software for this site or district?"
    >
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <FreeTierFieldLabel label="Administrator name" htmlFor="adminName">
          <FreeTierTextInput id="adminName" name="adminName" required />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
          <FreeTierTextInput
            id="adminEmail"
            name="adminEmail"
            placeholder="name@district.org"
            type="email"
            required
          />
        </FreeTierFieldLabel>
        <FreeTierButton type="submit">Forward request</FreeTierButton>
      </Form>
    </FreeTierAuthCard>
  );
}
