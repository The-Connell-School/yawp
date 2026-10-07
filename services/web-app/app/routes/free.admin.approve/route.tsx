import { type ActionFunctionArgs, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { completeSchoolAdminApproval } from '~/domain/free-tier/approval-flow.server';
import { getDomainUrl } from '~/utils/misc';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const };
  const peek = await peekSignedLink({ token, expectedPurpose: 'ADMIN_APPROVE' });
  if (!peek.ok) return { ok: false as const, reason: peek.reason };
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: { schoolName: true, name: true },
  });
  return { ok: true as const, token, schoolName: app?.schoolName ?? 'your school', teacherName: app?.name ?? 'A teacher' };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const authorized = formData.get('authorized') === 'on';
  const adminRole = String(formData.get('adminRole') ?? '');
  const result = await completeSchoolAdminApproval({
    token,
    authorized,
    adminRole,
    request,
    requestBaseUrl: getDomainUrl(request),
  });
  return result;
}

export default function FreeAdminApproveRoute() {
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
        <h1 className="text-2xl font-semibold mb-2">Approve YAWP for {data.schoolName}</h1>
        <p className="text-muted-foreground mb-6">
          {data.teacherName} requested access for their classroom. Confirm you are authorized to approve classroom
          software for your school or district.
        </p>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="token" value={data.token} />
          <label className="block text-sm">
            Your role (e.g. Principal, Technology Director)
            <input name="adminRole" required className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <label className="flex gap-2 text-sm items-start">
            <input type="checkbox" name="authorized" required className="mt-1" />
            <span>I am authorized to approve this use for {data.schoolName}.</span>
          </label>
          <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
            Approve YAWP
          </button>
        </Form>
      </section>
    </main>
  );
}
