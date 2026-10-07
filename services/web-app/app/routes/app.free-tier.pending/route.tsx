import { type ActionFunctionArgs, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';
import { mintSignedLink } from '~/domain/free-tier/signed-link.server';
import { sendFreeTierAdminReminderEmail } from '~/domain/free-tier/email.server';
import { getDomainUrl } from '~/utils/misc';
import { adminApprovalEmailCopyVersionHash, renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      status: true,
      schoolName: true,
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { adminName: true, adminEmail: true, personalNote: true },
      },
    },
  });
  const pending = app?.adminApprovals[0];
  return { app, pending };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const intent = String((await request.formData()).get('intent'));
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId, status: { in: ['SENT', 'MANUAL_REVIEW'] } },
    select: { id: true, name: true, schoolName: true, email: true },
  });
  if (!app || intent !== 'resend') return { ok: false as const };
  const pending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: app.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) return { ok: false as const };
  const gate = await enforceUnauthByIpAndTarget({
    request,
    route: '/app/free-tier/pending:resend',
    targetKey: app.id,
    perIpPerMinute: 3,
    perIpPerHour: 10,
    perTargetPerHour: RATE_LIMITS.unauth.freeTierWaitlist.perEmailPerHour,
  });
  if (!gate.allowed) return { ok: false as const, rateLimited: true as const };
  const approve = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_APPROVE' });
  const decline = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_NOT_RIGHT_PERSON' });
  const base = getDomainUrl(request);
  await sendFreeTierAdminReminderEmail({
    applicationId: app.id,
    to: pending.adminEmail,
    teacherName: app.name,
    schoolName: app.schoolName,
    approveUrl: `${base}/free/admin/approve?t=${encodeURIComponent(approve.token)}`,
    notRightPersonUrl: `${base}/free/admin/not-right-person?t=${encodeURIComponent(decline.token)}`,
  });
  return { ok: true as const };
}

export default function FreeTierPendingRoute() {
  const { app, pending } = useLoaderData<typeof loader>();
  const adminName = pending?.adminName ?? 'your administrator';
  const preview = pending
    ? renderAdminApprovalEmailBody({
        teacherName: 'You',
        schoolName: app?.schoolName ?? 'your school',
        personalNote: pending.personalNote,
        approveUrl: '#',
        notRightPersonUrl: '#',
      })
    : '';
  return (
    <main className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Waiting for {adminName}</h1>
      <p className="text-muted-foreground">
        We emailed {pending?.adminEmail ?? 'your school administrator'}. You will not have classes or AI tools until
        they approve YAWP for {app?.schoolName}.
      </p>
      {app?.status === 'MANUAL_REVIEW' ? (
        <p className="text-sm border rounded-md p-3 bg-muted">
          Our team is reviewing this request manually. We will email you at {app?.schoolName ? '' : 'your address'} when
          it is ready.
        </p>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Email preview</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-md border p-3 bg-muted">{preview}</pre>
        <p className="text-xs text-muted-foreground mt-1">Copy version {adminApprovalEmailCopyVersionHash().slice(0, 8)}</p>
      </details>
      <Form method="post">
        <input type="hidden" name="intent" value="resend" />
        <button type="submit" className="text-sm underline">Resend reminder</button>
      </Form>
    </main>
  );
}
