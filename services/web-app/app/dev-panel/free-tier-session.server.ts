import { prisma } from '~/utils/db.server';
import { buildAdminApprovalDesignedEmail } from '~/emails/build-free-tier-emails.server';
import {
  buildTeacherApprovedDesignedEmail,
  buildTeacherReleaseDesignedEmail,
} from '~/emails/build-free-tier-emails.server';
import type { FreeTierStatus } from '~/domain/free-tier/state';
import { devPanelFtPrefillForEmail } from './free-tier-session-prefill';

export type FreeTierSessionStage =
  | 'none'
  | 'form_filled'
  | 'invite_sent'
  | 'pending'
  | 'approved';

export type FreeTierSessionLinkRow = {
  id: 'verify' | 'admin_approval' | 'approved';
  label: string;
  url: string | null;
  openAs: 'signed-out' | 'teacher';
};

export type FreeTierSessionEmailRow = {
  id: string;
  subject: string;
  detail: string;
  kind: string;
};

export type FreeTierSessionSnapshot = {
  stage: FreeTierSessionStage;
  followEmail: string | null;
  formFilled: boolean;
  prefill: ReturnType<typeof devPanelFtPrefillForEmail> | null;
  links: FreeTierSessionLinkRow[];
  emails: FreeTierSessionEmailRow[];
  teacherUserId: string | null;
  openAppPath: string | null;
};

const LINK_LABELS: Record<FreeTierSessionLinkRow['id'], string> = {
  verify: 'Verify / continue sign-up',
  admin_approval: 'Admin approval',
  approved: 'Approved · off waitlist',
};

function stageFromApplication(
  status: FreeTierStatus | null,
  formFilled: boolean,
  followEmail: string | null
): FreeTierSessionStage {
  if (!followEmail) return 'none';
  if (!status) return formFilled ? 'form_filled' : 'none';
  if (status === 'APPROVED') return 'approved';
  if (status === 'SENT' || status === 'MANUAL_REVIEW' || status === 'ADMIN_SUBMITTED') {
    return 'pending';
  }
  if (
    status === 'INVITED' ||
    status === 'LEAD' ||
    status === 'ACCOUNT_CREATED'
  ) {
    return 'invite_sent';
  }
  return formFilled ? 'form_filled' : 'none';
}

function payloadUrl(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatEmailDetail(args: {
  createdAt: Date;
  toEmail: string;
  kind: string;
}) {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(args.createdAt);
  if (args.kind === 'admin_approval' || args.kind === 'admin_approval_reminder') {
    return `${time} · to admin`;
  }
  return time;
}

export async function loadFreeTierSessionSnapshot(args: {
  followEmail: string | null;
  formFilled: boolean;
  origin: string;
}): Promise<FreeTierSessionSnapshot> {
  const followEmail = args.followEmail?.trim().toLowerCase() ?? null;
  if (!followEmail) {
    return {
      stage: 'none',
      followEmail: null,
      formFilled: false,
      prefill: null,
      links: [
        { id: 'verify', label: LINK_LABELS.verify, url: null, openAs: 'signed-out' },
        { id: 'admin_approval', label: LINK_LABELS.admin_approval, url: null, openAs: 'signed-out' },
        { id: 'approved', label: LINK_LABELS.approved, url: null, openAs: 'teacher' },
      ],
      emails: [],
      teacherUserId: null,
      openAppPath: null,
    };
  }

  const app = await prisma.freeTierApplication.findUnique({
    where: { email: followEmail },
    select: {
      id: true,
      status: true,
      name: true,
      email: true,
      schoolName: true,
      userId: true,
      emailLogs: {
        where: { success: true },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          kind: true,
          toEmail: true,
          createdAt: true,
          payload: true,
        },
      },
    },
  });

  const stage = stageFromApplication(
    (app?.status as FreeTierStatus | undefined) ?? null,
    args.formFilled,
    followEmail
  );

  const releaseLog = app?.emailLogs.find(
    (row) => row.kind === 'teacher_release' || row.kind === 'release'
  );
  const adminLog = app?.emailLogs.find(
    (row) =>
      row.kind === 'admin_approval' || row.kind === 'admin_approval_reminder'
  );
  const approvedLog = app?.emailLogs.find((row) => row.kind === 'congratulations');

  const verifyUrl =
    payloadUrl(releaseLog?.payload, 'joinUrl') ??
    payloadUrl(releaseLog?.payload, 'releaseUrl');
  const adminUrl = payloadUrl(adminLog?.payload, 'approveUrl');
  const approvedUrl =
    payloadUrl(approvedLog?.payload, 'signInUrl') ??
    (app?.userId
      ? `${args.origin}/auth/login?redirectTo=${encodeURIComponent('/app')}`
      : null);

  const links: FreeTierSessionLinkRow[] = [
    {
      id: 'verify',
      label: LINK_LABELS.verify,
      url: verifyUrl,
      openAs: 'signed-out',
    },
    {
      id: 'admin_approval',
      label: LINK_LABELS.admin_approval,
      url: adminUrl,
      openAs: 'signed-out',
    },
    {
      id: 'approved',
      label: LINK_LABELS.approved,
      url: approvedUrl,
      openAs: 'teacher',
    },
  ];

  const emails: FreeTierSessionEmailRow[] =
    app?.emailLogs.map((row) => ({
      id: row.id,
      kind: row.kind,
      subject: emailSubjectForKind(row.kind, app.name, app.schoolName),
      detail: formatEmailDetail({
        createdAt: row.createdAt,
        toEmail: row.toEmail,
        kind: row.kind,
      }),
    })) ?? [];

  return {
    stage,
    followEmail,
    formFilled: args.formFilled,
    prefill: devPanelFtPrefillForEmail(followEmail),
    links,
    emails,
    teacherUserId: app?.userId ?? null,
    openAppPath: stage === 'approved' && app?.userId ? '/app' : null,
  };
}

function emailSubjectForKind(
  kind: string,
  teacherName: string,
  schoolName: string
) {
  if (kind === 'teacher_release' || kind === 'release') {
    return "You're in: start your Yawp! classroom";
  }
  if (kind === 'admin_approval' || kind === 'admin_approval_reminder') {
    return `${teacherName} at ${schoolName} would like to use Yawp!`;
  }
  if (kind === 'congratulations') {
    return "You're approved! Your Yawp! classroom is ready";
  }
  return kind.replace(/_/g, ' ');
}

export async function renderFreeTierSessionEmailPreview(args: {
  emailLogId: string;
  followEmail: string;
  origin: string;
}) {
  const app = await prisma.freeTierApplication.findUnique({
    where: { email: args.followEmail.toLowerCase() },
    select: {
      id: true,
      name: true,
      email: true,
      schoolName: true,
      emailLogs: {
        where: { id: args.emailLogId, success: true },
        take: 1,
        select: { kind: true, payload: true, toEmail: true },
      },
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { adminName: true, adminEmail: true },
      },
    },
  });
  const log = app?.emailLogs[0];
  if (!app || !log) return null;

  const payload = log.payload;
  if (log.kind === 'teacher_release' || log.kind === 'release') {
    const joinUrl =
      payloadUrl(payload, 'joinUrl') ?? payloadUrl(payload, 'releaseUrl');
    if (!joinUrl) return null;
    const built = await buildTeacherReleaseDesignedEmail({
      name: app.name,
      joinUrl,
      origin: args.origin,
    });
    return built.html;
  }
  if (log.kind === 'admin_approval' || log.kind === 'admin_approval_reminder') {
    const approveUrl = payloadUrl(payload, 'approveUrl');
    const notRightPersonUrl = payloadUrl(payload, 'notRightPersonUrl');
    if (!approveUrl || !notRightPersonUrl) return null;
    const built = await buildAdminApprovalDesignedEmail({
      teacherName: app.name,
      teacherEmail: app.email,
      schoolName: app.schoolName,
      approveUrl,
      notRightPersonUrl,
      reminder: log.kind.includes('reminder'),
      pass1: false,
      origin: args.origin,
    });
    return built.html;
  }
  if (log.kind === 'congratulations') {
    const signInUrl =
      payloadUrl(payload, 'signInUrl') ??
      `${args.origin}/auth/login?redirectTo=${encodeURIComponent('/app')}`;
    const adminName = app.adminApprovals[0]?.adminName ?? 'Your administrator';
    const built = await buildTeacherApprovedDesignedEmail({
      teacherName: app.name,
      adminName,
      signInUrl,
      origin: args.origin,
    });
    return built.html;
  }
  return null;
}
