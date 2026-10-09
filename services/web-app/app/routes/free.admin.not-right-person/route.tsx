import { type ActionFunctionArgs, type LoaderFunctionArgs, useActionData, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { redirectSchoolAdmin } from '~/domain/free-tier/approval-flow.server';
import {
  FreeTierAuthCard,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
  const peek = await peekSignedLink({ token, expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON' });
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
      <FreeTierAuthCard title="Request forwarded">
        <p className="text-sm text-muted-foreground">
          We emailed the administrator you named. The previous link is no longer active.
        </p>
      </FreeTierAuthCard>
    );
  }

  if (actionData && !actionData.ok) {
    const message =
      actionData.reason === 'email_failed'
        ? 'We could not send the email. Try again or contact support@yawp.school.'
        : actionData.reason === 'chain_cap'
          ? 'This request has been forwarded too many times. Contact support@yawp.school.'
          : 'We could not forward this request. The link may be invalid or already used.';
    return (
      <FreeTierAuthCard title="Unable to forward">
        <p className="text-sm text-muted-foreground">{message}</p>
      </FreeTierAuthCard>
    );
  }

  if (!data.ok) {
    return (
      <FreeTierAuthCard title="Link expired or already used">
        <p className="text-sm text-muted-foreground">This link is no longer valid.</p>
      </FreeTierAuthCard>
    );
  }
  return (
    <FreeTierAuthCard
      title="Send to the right person"
      subtitle="Tell us who can approve classroom software for this school (site or district administrator)."
    >
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <FreeTierFieldLabel label="Administrator name" htmlFor="adminName">
          <FreeTierTextInput id="adminName" name="adminName" required />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Administrator email" htmlFor="adminEmail">
          <FreeTierTextInput id="adminEmail" name="adminEmail" type="email" required />
        </FreeTierFieldLabel>
        <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
          Forward request
        </button>
      </Form>
    </FreeTierAuthCard>
  );
}
