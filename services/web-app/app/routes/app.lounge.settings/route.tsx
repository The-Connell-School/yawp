import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
} from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireLoungeMember } from '~/domain/lounge/access.server';
import { LOUNGE_NAME, LOUNGE_SHARE_CONSENT_LABEL } from '~/domain/lounge/launch';
import { getLoungeProfile, updateLoungeSettings } from '~/domain/lounge/lounge.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer } = await requireLoungeMember(request);
  const profile = await getLoungeProfile(viewer.userId);
  return data({
    hasProfile: Boolean(profile),
    shareConsent: Boolean(profile?.shareConsentAt),
    emailNotifications: profile?.emailNotifications ?? true,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer } = await requireLoungeMember(request);
  const form = await request.formData();
  await updateLoungeSettings(viewer.userId, {
    shareConsent: form.get('shareConsent') === 'on',
    emailNotifications: form.get('emailNotifications') === 'on',
  });
  return data({ saved: true });
}

export default function LoungeSettingsRoute() {
  const { hasProfile, shareConsent, emailNotifications } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        <Link
          to="/app/lounge"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {LOUNGE_NAME}
        </Link>
        <h1 className="lounge-serif mt-1 text-[38px] leading-tight text-foreground">Lounge settings</h1>
        {hasProfile ? (
          <Form method="post" className="mt-6 flex flex-col gap-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="shareConsent"
                defaultChecked={shareConsent}
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span>{LOUNGE_SHARE_CONSENT_LABEL}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="emailNotifications"
                defaultChecked={emailNotifications}
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span>Email me about replies, mentions, and answers from the YAWP! team</span>
            </label>
            <div className="flex items-center gap-4">
              <Button type="submit">Save</Button>
              {actionData?.saved ? (
                <span role="status" className="text-sm text-muted-foreground">
                  Saved.
                </span>
              ) : null}
            </div>
          </Form>
        ) : (
          <p className="mt-4 text-muted-foreground">Nothing to set here for the YAWP! team.</p>
        )}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
