import { type ActionFunctionArgs, type LoaderFunctionArgs, useLoaderData } from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';
import { mintSignedLink, FREE_TIER_LINK_TTL_MS } from '~/domain/free-tier/signed-link.server';
import { sendFreeTierAdminReminderEmail } from '~/domain/free-tier/email.server';
import { freeTierPublicAppOrigin } from '~/domain/free-tier/free-tier-public-url.server';
import { adminApprovalEmailCopyVersionHash } from '~/domain/free-tier/email-copy.server';
import { renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      status: true,
      schoolName: true,
      email: true,
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { adminName: true, adminEmail: true, personalNote: true },
      },
    },
  });
  const pending = app?.adminApprovals[0];
  return {
    app,
    pending,
    emailCopyVersionLabel: adminApprovalEmailCopyVersionHash().slice(0, 8),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const intent = String((await request.formData()).get('intent'));
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId, status: 'SENT' },
    select: { id: true, name: true, schoolName: true, email: true },
  });
  if (!app || intent !== 'resend') return { ok: false as const, reason: 'not_allowed' as const };

  const gate = await enforceUnauthByIpAndTarget({
    request,
    route: '/app/free-tier/pending:resend',
    targetKey: app.id,
    perIpPerMinute: 3,
    perIpPerHour: 10,
    perTargetPerHour: RATE_LIMITS.unauth.freeTierWaitlist.perEmailPerHour,
  });
  if (!gate.allowed) return { ok: false as const, rateLimited: true as const };

  const emailLinks = await prisma.$transaction(async (tx) => {
    const pending = await tx.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, adminEmail: true, personalNote: true },
    });
    if (!pending) return null;

    const approveMint = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });
    const declineMint = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });

    await tx.freeTierAdminApproval.update({
      where: { id: pending.id },
      data: { signedLinkId: approveMint.linkId },
    });

    const base = freeTierPublicAppOrigin();
    return {
      to: pending.adminEmail,
      personalNote: pending.personalNote,
      approveUrl: `${base}/free/admin/approve?t=${encodeURIComponent(approveMint.token)}`,
      notRightPersonUrl: `${base}/free/admin/not-right-person?t=${encodeURIComponent(declineMint.token)}`,
    };
  });

  if (!emailLinks) return { ok: false as const, reason: 'not_found' as const };

  const emailResult = await sendFreeTierAdminReminderEmail({
    applicationId: app.id,
    to: emailLinks.to,
    teacherEmail: app.email,
    teacherName: app.name,
    schoolName: app.schoolName,
    personalNote: emailLinks.personalNote,
    approveUrl: emailLinks.approveUrl,
    notRightPersonUrl: emailLinks.notRightPersonUrl,
  });
  if (!emailResult.ok) {
    return { ok: false as const, reason: 'email_failed' as const, error: emailResult.error };
  }
  return { ok: true as const };
}

export default function FreeTierPendingRoute() {
  const { app, pending, emailCopyVersionLabel } = useLoaderData<typeof loader>();
  const adminName = pending?.adminName ?? 'your administrator';
  const preview = pending
    ? renderAdminApprovalEmailBody({
        teacherName: 'You',
        teacherEmail: app?.email ?? 'teacher@school.edu',
        schoolName: app?.schoolName ?? 'your school',
        personalNote: pending.personalNote,
        approveUrl: '#',
        notRightPersonUrl: '#',
      })
    : '';
  return (
    <main className="yawp-entry">
      <section className="yawp-entry-shell max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Waiting for {adminName}</h1>
      <p className="text-muted-foreground">
        We emailed {pending?.adminEmail ?? 'your school administrator'}. You will not have classes or AI tools until
        they approve YAWP for {app?.schoolName}.
      </p>
      {app?.status === 'MANUAL_REVIEW' ? (
        <p className="text-sm border rounded-md p-3 bg-muted">
          Our team is reviewing this request manually. We will email you when it is ready.
        </p>
      ) : null}
      <div className="rounded-md border p-3 bg-muted text-sm">
        <p className="font-medium mb-2">Email preview</p>
        <pre className="whitespace-pre-wrap text-xs">{preview}</pre>
        <p className="text-xs text-muted-foreground mt-1">Copy version {emailCopyVersionLabel}</p>
      </div>
      {app?.status === 'SENT' ? (
        <Form method="post">
          <input type="hidden" name="intent" value="resend" />
          <button type="submit" className="yawp-entry-button yawp-entry-button-secondary text-sm">
            Resend reminder
          </button>
        </Form>
      ) : null}
      </section>
    </main>
  );
}
