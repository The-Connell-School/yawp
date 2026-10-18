import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { ContactUsForm } from '~/components/contact-us-form';
import { requireLoungeMember } from '~/domain/lounge/access.server';
import { LOUNGE_NAME, LOUNGE_TEAM_NAME, parseContactMessage } from '~/domain/lounge/launch';
import { createLoungeContactMessage } from '~/domain/lounge/lounge.server';
import { sendLoungeNotifications } from '~/domain/lounge/notifications.server';
import { getDomainUrl } from '~/utils/misc';
import { enforceAuthenticatedUserAndIp } from '~/utils/rate-limit.server';

/**
 * Contact Us, pinned at the top of the Lounge: a private note straight to
 * the YAWP! team (House Rule 7). It never posts in the Lounge. Who gets the
 * email is LOUNGE_CONTACT_EMAILS, so it can go to Brian, Brock, or both.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireLoungeMember(request);
  const from = new URL(request.url).searchParams.get('from') ?? '';
  return data({ from: /^\/app\//.test(from) ? from : '/app/lounge' });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer, organizationId } = await requireLoungeMember(request);
  const form = Object.fromEntries(await request.formData());
  const parsed = parseContactMessage(form);
  if (!parsed.ok) return data({ error: parsed.error, sent: false }, { status: 400 });
  const limit = await enforceAuthenticatedUserAndIp({
    request,
    route: 'lounge-contact',
    userId: viewer.userId,
    perUserPerHour: 10,
    perIpPerMinute: 5,
    perIpPerHour: 30,
  });
  if (!limit.allowed) {
    return data({ error: 'You have sent a lot of messages this hour. Please try again a little later.', sent: false }, { status: 429 });
  }
  const { notification } = await createLoungeContactMessage(viewer, { organizationId, ...parsed.value });
  void sendLoungeNotifications([notification], getDomainUrl(request));
  return data({ error: null, sent: true });
}

export default function LoungeContactRoute() {
  const { from } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <ContactUsForm
      from={from}
      back={{ to: '/app/lounge', label: LOUNGE_NAME }}
      intro={`Something broken or wrong? This goes straight to the ${LOUNGE_TEAM_NAME}, not the Lounge. We'll take care of it faster than a thread will.`}
      sent={Boolean(actionData?.sent)}
      error={actionData?.error ?? null}
      submitting={navigation.state === 'submitting'}
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
