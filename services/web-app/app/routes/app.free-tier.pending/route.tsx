import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Form } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';
import {
  mintSignedLink,
  FREE_TIER_LINK_TTL_MS,
  invalidateOpenAdminApprovalLinks,
} from '~/domain/free-tier/signed-link.server';
import { sendFreeTierAdminReminderEmail } from '~/domain/free-tier/email.server';
import { freeTierPublicAppOrigin } from '~/domain/free-tier/free-tier-public-url.server';
import { adminApprovalEmailCopyVersionHash } from '~/domain/free-tier/email-copy.server';
import { renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy';
import { FreeTierAuthCard, FreeTierEmailPreview } from '../free-tier/FreeTierAuthCard';
import { freeTierConfigErrorMessage } from '~/domain/free-tier/free-tier-config.server';

const LINK_PLACEHOLDER = '(link included in the email we sent)';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      status: true,
      schoolName: true,
      email: true,
      name: true,
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

  try {
    const emailLinks = await prisma.$transaction(async (tx) => {
      const pending = await tx.freeTierAdminApproval.findFirst({
        where: { applicationId: app.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, adminEmail: true, personalNote: true },
      });
      if (!pending) return null;

      await invalidateOpenAdminApprovalLinks(tx, app.id);

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
  } catch (error) {
    return { ok: false as const, reason: 'config' as const, message: freeTierConfigErrorMessage(error) };
  }
}

export default function FreeTierPendingRoute() {
  const { app, pending, emailCopyVersionLabel } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const resending = navigation.state === 'submitting';
  const adminName = pending?.adminName ?? 'your administrator';
  const preview = pending
    ? renderAdminApprovalEmailBody({
        teacherName: app?.name ?? 'Your teacher',
        teacherEmail: app?.email ?? 'teacher@school.edu',
        schoolName: app?.schoolName ?? 'your school',
        personalNote: pending.personalNote,
        approveUrl: LINK_PLACEHOLDER,
        notRightPersonUrl: LINK_PLACEHOLDER,
      })
    : '';

  return (
    <FreeTierAuthCard title={`Waiting for ${adminName}`} showLogo={false}>
      <p className="text-sm text-muted-foreground">
        We emailed {pending?.adminEmail ?? 'your school administrator'}. You will not have classes or AI tools until
        they approve YAWP for {app?.schoolName}.
      </p>
      {app?.status === 'MANUAL_REVIEW' ? (
        <p className="text-sm rounded-md border p-3 bg-muted text-foreground">
          Our team is reviewing this request manually. We will email you when it is ready.
        </p>
      ) : null}
      {pending ? (
        <FreeTierEmailPreview body={preview} versionLabel={emailCopyVersionLabel} />
      ) : null}
      {actionData?.ok ? (
        <p className="text-sm text-green-700" role="status">Reminder sent to {pending?.adminEmail}.</p>
      ) : null}
      {actionData && !actionData.ok && actionData.rateLimited ? (
        <p className="text-sm text-destructive" role="alert">
          Too many resend attempts. Please wait a few minutes and try again.
        </p>
      ) : null}
      {actionData && !actionData.ok && actionData.reason === 'email_failed' ? (
        <p className="text-sm text-destructive" role="alert">
          We could not send the reminder. Try again later or contact support@yawp.school.
        </p>
      ) : null}
      {actionData && !actionData.ok && actionData.reason === 'config' ? (
        <p className="text-sm text-destructive" role="alert">{actionData.message}</p>
      ) : null}
      {app?.status === 'SENT' ? (
        <Form method="post">
          <input type="hidden" name="intent" value="resend" />
          <button
            type="submit"
            disabled={resending}
            className="yawp-entry-button yawp-entry-button-secondary text-sm"
          >
            {resending ? 'Sending…' : 'Resend reminder'}
          </button>
        </Form>
      ) : null}
    </FreeTierAuthCard>
  );
}
