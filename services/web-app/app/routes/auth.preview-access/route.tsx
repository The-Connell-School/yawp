import { Form, useActionData } from 'react-router';
import { Building2, KeyRound } from 'lucide-react';
import { AuthFormCard } from '~/components/auth-form-card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import '~/components/unified-signon/unified-signon.css';
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

// The auth layout already shows the YAWP! logo above this card, so the card
// itself carries no logo. Styling reuses the unified sign-on card tokens.
export default function PreviewAccessRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<{ error: string }>();
  const error = actionData?.error ?? null;
  const master = loaderData.masterSelection;

  const errorBanner = error ? (
    <div
      id="preview-access-error"
      role="alert"
      className="signon-banner signon-error"
    >
      {error}
    </div>
  ) : null;

  return (
    <section
      className="unified-signon"
      data-signon-screen="preview-access"
      data-preview-access-screen
    >
      <div className="signon-stack">
        <AuthFormCard
          title={master ? 'Choose an organization' : 'Find your YAWP!'}
          className="signon-card"
          icon={
            <p className="preview-access-eyebrow">
              <KeyRound width={14} height={14} aria-hidden="true" />
              Private preview
            </p>
          }
        >
          <div className="signon-fields">
            <p className="signon-copy">
              {master
                ? 'Your master access code is verified. Pick the organization you\u2019d like to preview as.'
                : 'Enter the access code shared with you to continue.'}
            </p>

            {master ? (
              <>
                <Form
                  method="post"
                  replace
                  className="signon-fields"
                  data-preview-organization-selector
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="select-organization"
                  />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={loaderData.returnTo}
                  />
                  <div className="signon-field">
                    <label htmlFor="preview-organization-id">
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
                        className="h-10 w-full appearance-none rounded-md border border-input bg-white pl-9 pr-8 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  {errorBanner}
                  <Button type="submit" className="signon-primary">
                    Continue to organization
                  </Button>
                </Form>
                <Form method="post" replace className="text-center">
                  <input type="hidden" name="intent" value="cancel-master" />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={loaderData.returnTo}
                  />
                  <Button
                    type="submit"
                    variant="link"
                    className="signon-text-button"
                  >
                    Use a different access code
                  </Button>
                </Form>
              </>
            ) : (
              <Form method="post" replace className="signon-fields">
                <input
                  type="hidden"
                  name="returnTo"
                  value={loaderData.returnTo}
                />
                <div className="signon-field">
                  <label htmlFor="preview-access-code">Access code</label>
                  <Input
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
                    aria-invalid={!!error}
                    aria-describedby={
                      error ? 'preview-access-error' : undefined
                    }
                    className="font-mono"
                  />
                </div>
                {errorBanner}
                <Button
                  type="submit"
                  className="signon-primary"
                  disabled={!loaderData.configured}
                >
                  Open preview
                </Button>
              </Form>
            )}
          </div>
        </AuthFormCard>
      </div>
    </section>
  );
}
