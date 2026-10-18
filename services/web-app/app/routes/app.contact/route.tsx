import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { ContactUsForm } from '~/components/contact-us-form';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireTeacherContact } from '~/domain/contact/contact-access.server';
import { safeContactReturnPath } from '~/domain/contact/contact-access';
import { LOUNGE_TEAM_NAME, parseContactMessage } from '~/domain/lounge/launch';
import { createLoungeContactMessage } from '~/domain/lounge/lounge.server';
import { sendLoungeNotifications } from '~/domain/lounge/notifications.server';
import { getDomainUrl } from '~/utils/misc';
import { enforceAuthenticatedUserAndIp } from '~/utils/rate-limit.server';

/**
 * Contact Us from the teacher dashboard (Brian, round 6): the same private
 * note to the YAWP! team as the Lounge's Contact Us, same inbox and email,
 * without joining the Lounge first. Behind the teacher_contact_us flag.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireTeacherContact(request);
  return data({ from: safeContactReturnPath(new URL(request.url).searchParams.get('from')) });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer, organizationId } = await requireTeacherContact(request);
  const form = Object.fromEntries(await request.formData());
  const parsed = parseContactMessage(form);
  if (!parsed.ok) return data({ error: parsed.error, sent: false }, { status: 400 });
  // One budget with the Lounge's Contact Us, so the two doors don't double it.
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

export default function ContactRoute() {
  const { from } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <ContactUsForm
      from={from}
      back={from === '/app' ? { to: '/app', label: 'Back to your dashboard' } : { to: from, label: 'Back' }}
      intro={`Need help, or something broken? This goes straight to the ${LOUNGE_TEAM_NAME}, and we'll answer by email.`}
      sent={Boolean(actionData?.sent)}
      error={actionData?.error ?? null}
      submitting={navigation.state === 'submitting'}
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
