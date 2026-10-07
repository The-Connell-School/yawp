import { type ActionFunctionArgs, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { submitAdminDetails } from '~/domain/free-tier/approval-flow.server';
import { getDomainUrl } from '~/utils/misc';
import { renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { id: true, schoolName: true, name: true, status: true },
  });
  return { app };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const app = await prisma.freeTierApplication.findFirst({ where: { userId }, select: { id: true } });
  if (!app) return { ok: false as const };
  const result = await submitAdminDetails({
    applicationId: app.id,
    userId,
    adminName: String(formData.get('adminName') ?? ''),
    adminEmail: String(formData.get('adminEmail') ?? ''),
    adminRole: String(formData.get('adminRole') ?? ''),
    personalNote: String(formData.get('personalNote') ?? ''),
    requestBaseUrl: getDomainUrl(request),
  });
  return result;
}

export default function FreeTierOnboardingRoute() {
  const { app } = useLoaderData<typeof loader>();
  const preview = renderAdminApprovalEmailBody({
    teacherName: app?.name ?? 'You',
    schoolName: app?.schoolName ?? 'your school',
    personalNote: '',
    approveUrl: 'https://yawp.school/free/admin/approve',
    notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person',
  });
  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administrator approval</h1>
        <p className="text-muted-foreground">
          Site- or district-level administrators can approve YAWP. Department chairs and classroom teachers cannot.
        </p>
      </div>
      <Form method="post" className="space-y-3">
        <label className="block text-sm">
          Administrator name
          <input name="adminName" required className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Administrator email
          <input name="adminEmail" type="email" required className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Administrator role
          <input name="adminRole" required className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Personal note (optional, shown at top of email)
          <textarea name="personalNote" maxLength={500} className="mt-1 w-full rounded-md border px-3 py-2" rows={3} />
        </label>
        <div className="rounded-md border p-3 bg-muted text-sm">
          <p className="font-medium mb-2">Email preview (body is fixed)</p>
          <pre className="whitespace-pre-wrap text-xs">{preview}</pre>
        </div>
        <button type="submit" className="yawp-entry-button yawp-entry-button-primary">
          Send approval request
        </button>
      </Form>
    </main>
  );
}
