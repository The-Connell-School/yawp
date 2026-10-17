import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { CircleAlert, Send } from 'lucide-react';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { redirectSchoolAdmin } from '~/domain/free-tier/approval-flow.server';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  if (!peek.ok) return { ok: false as const };
  return { ok: true as const, token };
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
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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
