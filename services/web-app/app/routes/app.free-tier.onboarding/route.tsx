import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { submitAdminDetails } from '~/domain/free-tier/approval-flow.server';
import { renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy.server';

const MAX_NOTE = 500;
const MAX_NAME = 200;

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { id: true, schoolName: true, name: true, email: true, status: true },
  });
  return { app };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const app = await prisma.freeTierApplication.findFirst({ where: { userId }, select: { id: true } });
  if (!app) return redirect('/app/free-tier/onboarding');
  const result = await submitAdminDetails({
    applicationId: app.id,
    userId,
    adminName: String(formData.get('adminName') ?? '').trim().slice(0, MAX_NAME),
    adminEmail: String(formData.get('adminEmail') ?? '').trim().slice(0, 320),
    adminRole: String(formData.get('adminRole') ?? '').trim().slice(0, 100),
    personalNote: String(formData.get('personalNote') ?? '').trim().slice(0, MAX_NOTE),
  });
  if (!result.ok) {
    return result;
  }
  throw redirect('/app/free-tier/pending');
}

export default function FreeTierOnboardingRoute() {
  const { app } = useLoaderData<typeof loader>();
  const preview = renderAdminApprovalEmailBody({
    teacherName: app?.name ?? 'You',
    teacherEmail: app?.email ?? 'teacher@school.edu',
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
          <input name="adminName" required maxLength={MAX_NAME} className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Administrator email
          <input name="adminEmail" type="email" required maxLength={320} className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Administrator role
          <input name="adminRole" required maxLength={100} className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Personal note (optional, shown at top of email)
          <textarea name="personalNote" maxLength={MAX_NOTE} className="mt-1 w-full rounded-md border px-3 py-2" rows={3} />
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
