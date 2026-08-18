import {
  Form,
  useActionData,
} from 'react-router';
import { Building2, KeyRound } from 'lucide-react';
import {
  createPreviewAccessAction,
  createPreviewAccessLoader,
} from './action.server';
import type { Route } from './+types/route';

export const loader = createPreviewAccessLoader();
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
          {loaderData.masterSelection ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Choose an organization
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your master access code is verified. Pick the organization
                you&apos;d like to preview as.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Find your YAWP!
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Enter the memorable access code shared with you to continue.
              </p>
            </>
          )}
        </div>

        {loaderData.masterSelection ? (
          <div className="space-y-4">
            <Form method="post" replace className="space-y-4">
              <input type="hidden" name="intent" value="select-organization" />
              <input type="hidden" name="returnTo" value={loaderData.returnTo} />
              <div>
                <label
                  htmlFor="preview-organization-id"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Organization
                </label>
                <div className="relative">
                  <Building2
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <select
                    id="preview-organization-id"
                    name="organizationId"
                    required
                    defaultValue=""
                    aria-describedby={
                      error ? 'preview-access-error' : undefined
                    }
                    className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-10 pr-8 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="" disabled>
                      Select an organization
                    </option>
                    {loaderData.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 8 5"
                    width="8"
                    height="5"
                    fill="none"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <path d="M.5.5 4 4 7.5.5" stroke="currentcolor" />
                  </svg>
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
                className="h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue to organization
              </button>
            </Form>

            <Form method="post" replace>
              <input type="hidden" name="intent" value="cancel-master" />
              <button
                type="submit"
                className="h-9 w-full rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Use a different access code
              </button>
            </Form>
          </div>
        ) : (
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
        )}
      </section>
    </main>
  );
}
