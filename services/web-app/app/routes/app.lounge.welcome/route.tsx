import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
} from 'react-router';
import { useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import {
  DEFAULT_LOUNGE_DISPLAY_NAME_STYLE,
  loungeByline,
  type LoungeDisplayNameStyleKey,
} from '~/domain/lounge/display-name';
import { acceptLoungeGuidelines, getLoungeProfile } from '~/domain/lounge/lounge.server';
import { prisma } from '~/utils/db.server';
import { cn } from '~/utils/misc';

const STYLES: Array<{ key: LoungeDisplayNameStyleKey; label: string; hint: string }> = [
  { key: 'FULL_NAME', label: 'Full name and school', hint: 'Most like a real staff room.' },
  {
    key: 'FIRST_NAME_LAST_INITIAL',
    label: 'First name, last initial, and school',
    hint: 'Recognizable to colleagues, not searchable.',
  },
  { key: 'FIRST_NAME_ONLY', label: 'First name only', hint: 'Your school stays hidden.' },
];

export const LOUNGE_GUIDELINES = [
  'Be kind, and assume good faith.',
  'Keep students anonymous: no names, photos, or work that identifies them.',
  'No selling or promotion.',
  'Questions for Brian and the Yawp team are welcome any time.',
];

/** Only send people back into the Lounge, never somewhere else. */
function safeRedirect(value: string | null): string {
  if (value && /^\/app\/lounge(\/[A-Za-z0-9_-]+)?$/.test(value)) return value;
  return '/app/lounge/new';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer, membership } = await requireLoungeAccess(request);
  const url = new URL(request.url);
  const [profile, user] = await Promise.all([
    getLoungeProfile(viewer.userId),
    prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } }),
  ]);
  return data({
    redirectTo: safeRedirect(url.searchParams.get('redirectTo')),
    currentStyle: (profile?.displayNameStyle ?? DEFAULT_LOUNGE_DISPLAY_NAME_STYLE) as LoungeDisplayNameStyleKey,
    previews: Object.fromEntries(
      STYLES.map((style) => [
        style.key,
        loungeByline({
          name: user?.name,
          style: style.key,
          schoolName: membership.organization.name,
          isStaff: false,
        }),
      ])
    ) as Record<LoungeDisplayNameStyleKey, { name: string; detail: string | null }>,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer } = await requireLoungeAccess(request);
  const form = await request.formData();
  const style = String(form.get('displayNameStyle') ?? '');
  if (!STYLES.some((s) => s.key === style)) {
    return data({ error: 'Choose how your name appears.' }, { status: 400 });
  }
  if (form.get('guidelines') !== 'on') {
    return data({ error: 'Please agree to the community guidelines to continue.' }, { status: 400 });
  }
  await acceptLoungeGuidelines(viewer.userId, style as LoungeDisplayNameStyleKey);
  throw redirect(safeRedirect(String(form.get('redirectTo') ?? '')));
}

export default function LoungeWelcomeRoute() {
  const { redirectTo, currentStyle, previews } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [style, setStyle] = useState<LoungeDisplayNameStyleKey>(currentStyle);
  const preview = previews[style];

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Before your first post</p>
        <h1 className="mt-2 text-2xl font-bold">How should other teachers see you?</h1>
        <p className="mt-2 text-muted-foreground">
          The Teacher&apos;s Lounge is shared by teachers at every school using Yawp. Students never
          see it. You can change this later.
        </p>

        <Form method="post" className="mt-6 flex flex-col gap-6">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">How your name appears</legend>
            {STYLES.map((option) => (
              <label
                key={option.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-4',
                  style === option.key && 'border-foreground'
                )}
              >
                <input
                  type="radio"
                  name="displayNameStyle"
                  value={option.key}
                  checked={style === option.key}
                  onChange={() => setStyle(option.key)}
                  className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-sm text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            You&apos;ll appear as{' '}
            <span className="font-medium text-foreground">{preview.name}</span>
            {preview.detail ? <> · {preview.detail}</> : null}
          </p>

          <div className="rounded-lg border bg-background p-4">
            <h2 className="text-base font-bold">Community guidelines</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {LOUNGE_GUIDELINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="guidelines" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
            <span>I&apos;ll follow the community guidelines.</span>
          </label>

          {actionData?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {actionData.error}
            </p>
          ) : null}

          <div>
            <Button type="submit">Continue</Button>
          </div>
        </Form>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
