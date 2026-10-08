import { type ActionFunctionArgs, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { redirectSchoolAdmin } from '~/domain/free-tier/approval-flow.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
  const peek = await peekSignedLink({ token, expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON' });
  if (!peek.ok) return { ok: false as const };
  return { ok: true as const, token };
}

export async function action({ request }: ActionFunctionArgs) {
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
  if (!data.ok) {
    return (
      <main className="yawp-entry">
        <section className="yawp-entry-shell">
          <h1 className="text-2xl font-semibold">Link expired or already used</h1>
        </section>
      </main>
    );
  }
  return (
    <main className="yawp-entry">
      <section className="yawp-entry-shell max-w-lg">
        <h1 className="text-2xl font-semibold mb-2">Send to the right person</h1>
        <p className="text-muted-foreground mb-6">
          Tell us who can approve classroom software for this school (site or district administrator).
        </p>
        <Form method="post" className="space-y-3">
          <input type="hidden" name="token" value={data.token} />
          <label className="block text-sm">
            Administrator name
            <input name="adminName" required className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <label className="block text-sm">
            Administrator email
            <input name="adminEmail" type="email" required className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
            Forward request
          </button>
        </Form>
      </section>
    </main>
  );
}
