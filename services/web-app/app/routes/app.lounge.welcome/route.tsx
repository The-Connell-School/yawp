import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireLoungeAccess, safeLoungeReturnPath } from '~/domain/lounge/access.server';
import {
  LOUNGE_HOUSE_RULES,
  LOUNGE_NAME,
  LOUNGE_RULES_CONSENT_LABEL,
  LOUNGE_SHARE_CONSENT_LABEL,
  LOUNGE_WELCOME_INTRO,
} from '~/domain/lounge/launch';
import { acceptLoungeHouseRules, getLoungeProfile } from '~/domain/lounge/lounge.server';

/**
 * The first-visit welcome box (Brian, Oct 16 2026): the House Rules, a
 * required agreement, and an optional consent to share posts with the name
 * removed. Shown once; the consent can be changed later in settings.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer } = await requireLoungeAccess(request);
  const redirectTo = safeLoungeReturnPath(new URL(request.url).searchParams.get('redirectTo'));
  if (viewer.isStaff || (await getLoungeProfile(viewer.userId))) throw redirect(redirectTo);
  return data({ redirectTo });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer } = await requireLoungeAccess(request);
  const form = await request.formData();
  if (form.get('houseRules') !== 'on') {
    return data({ error: 'Please agree to the House Rules to enter the Lounge.' }, { status: 400 });
  }
  await acceptLoungeHouseRules(viewer.userId, { shareConsent: form.get('shareConsent') === 'on' });
  throw redirect(safeLoungeReturnPath(String(form.get('redirectTo') ?? '')));
}

export default function LoungeWelcomeRoute() {
  const { redirectTo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [agreed, setAgreed] = useState(false);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll bg-secondary">
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <div className="rounded-2xl border bg-popover p-6 shadow-sm sm:p-8">
          <h1 className="lounge-serif text-[40px] leading-none text-foreground">{LOUNGE_NAME}</h1>
          <p className="mt-3 leading-relaxed">{LOUNGE_WELCOME_INTRO}</p>
          <ol className="mt-4 flex list-decimal flex-col gap-2 pl-6 leading-relaxed marker:font-bold marker:text-primary">
            {LOUNGE_HOUSE_RULES.map((rule) => (
              <li key={rule.title}>
                <span className="font-bold">{rule.title}</span> {rule.detail}
              </li>
            ))}
          </ol>

          <Form method="post" className="mt-6 flex flex-col gap-4 border-t pt-5">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="houseRules"
                required
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span className="font-medium">{LOUNGE_RULES_CONSENT_LABEL}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="shareConsent"
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span className="flex flex-col">
                <span>{LOUNGE_SHARE_CONSENT_LABEL}</span>
                <span className="text-sm text-muted-foreground">Optional. You can change this later in settings.</span>
              </span>
            </label>

            {actionData?.error ? (
              <p role="alert" className="text-sm text-destructive">
                {actionData.error}
              </p>
            ) : null}

            <div>
              <Button type="submit" disabled={!agreed || navigation.state === 'submitting'}>
                Enter the Lounge
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
