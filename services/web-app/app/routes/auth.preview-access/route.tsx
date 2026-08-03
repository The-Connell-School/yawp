import {
  Form,
  redirect,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { KeyRound } from 'lucide-react';
import { safeRedirect } from 'remix-utils/safe-redirect';
import {
  PREVIEW_ACCESS_PATH,
  clearPreviewAccessCookie,
  grantPreviewAccessCookie,
  isPreviewAccessConfigured,
  validatePreviewAccessCode,
} from '~/utils/preview-access.server';
import type { Route } from './+types/route';

export function loader({ request }: LoaderFunctionArgs) {
  const returnTo = new URL(request.url).searchParams.get('returnTo') ?? '';
  return {
    configured: isPreviewAccessConfigured(),
    returnTo: safeRedirect(returnTo, '/'),
  };
}

type LogoutFunction = typeof import('~/utils/auth.server').logout;

export function createPreviewAccessAction(logoutFunction?: LogoutFunction) {
  return async ({ request }: ActionFunctionArgs): Promise<Response> => {
    const formData = await request.formData();
    const intent = String(formData.get('intent') ?? 'enter');

    if (intent === 'sign-out') {
      const signOut =
        logoutFunction ?? (await import('~/utils/auth.server')).logout;
      await signOut(
        { request, redirectTo: PREVIEW_ACCESS_PATH },
        {
          headers: {
            'set-cookie': await clearPreviewAccessCookie(),
          },
        },
      );
      throw new Error('Preview access sign-out did not redirect.');
    }

    if (!isPreviewAccessConfigured()) {
      return Response.json(
        {
          error:
            'Preview access is not configured. Contact the deployment owner.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const code = String(formData.get('code') ?? '');
    if (!validatePreviewAccessCode(code)) {
      return Response.json(
        { error: 'That access code was not recognized.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const returnTo = safeRedirect(
      String(formData.get('returnTo') ?? ''),
      '/',
    );
    return redirect(returnTo, {
      headers: {
        'Cache-Control': 'no-store',
        'set-cookie': await grantPreviewAccessCookie(),
      },
    });
  };
}

export const action = createPreviewAccessAction();

export const meta: Route.MetaFunction = () => [
  { title: 'Preview Access | YAWP!' },
  {
    name: 'description',
    content: 'Enter an access code to open this YAWP! preview.',
  },
];

export default function PreviewAccessRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<{ error: string }>();
  const error = actionData?.error ?? null;

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10"
      data-preview-access-screen
    >
      <section className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-xl sm:p-10">
        <div className="mb-7 text-center">
          <img
            src="/img/landing/yawp-logo-circle.jpg"
            alt="YAWP!"
            className="mx-auto mb-5 size-20 rounded-full shadow-sm"
          />
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Private preview
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Find your YAWP!
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Enter the memorable access code shared with you to continue.
          </p>
        </div>

        <Form method="post" replace className="space-y-4">
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <div>
            <label
              htmlFor="preview-access-code"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Access code
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="preview-access-code"
                name="code"
                type="text"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={!loaderData.configured}
                placeholder="brave-otter-4193"
                aria-describedby={error ? 'preview-access-error' : undefined}
                className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 font-mono text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          {error ? (
            <p
              id="preview-access-error"
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!loaderData.configured}
            className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Open preview
          </button>
        </Form>
      </section>
    </main>
  );
}
