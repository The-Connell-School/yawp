import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireLoungeMember } from '~/domain/lounge/access.server';
import { LOUNGE_CONTACT_MAX, LOUNGE_NAME, LOUNGE_TEAM_NAME, parseContactMessage } from '~/domain/lounge/launch';
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
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        <Link to="/app/lounge" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
          ← {LOUNGE_NAME}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Contact Us</h1>
        <p className="mt-2 text-muted-foreground">
          Something broken or wrong? This goes straight to the {LOUNGE_TEAM_NAME}, not the Lounge. We&apos;ll
          take care of it faster than a thread will.
        </p>
        {actionData?.sent ? (
          <p role="status" className="mt-6 rounded-lg bg-secondary px-4 py-3">
            Thanks. The {LOUNGE_TEAM_NAME} will get back to you by email.
          </p>
        ) : (
          <Form method="post" className="mt-6 flex flex-col gap-3">
            <input type="hidden" name="pageUrl" value={from} />
            <label htmlFor="contact-message" className="text-sm text-muted-foreground">
              Message
            </label>
            <textarea
              id="contact-message"
              name="message"
              rows={6}
              maxLength={LOUNGE_CONTACT_MAX}
              required
              placeholder="What happened, and where? Leave out student names."
              className="rounded-md border border-input bg-input-background px-3 py-2 text-[15px]"
            />
            {actionData?.error ? (
              <p role="alert" className="text-sm text-destructive">
                {actionData.error}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={navigation.state === 'submitting'}>
                Send
              </Button>
            </div>
          </Form>
        )}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
