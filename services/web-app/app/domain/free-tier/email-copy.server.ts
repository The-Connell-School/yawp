import { createHash } from 'node:crypto';

export const ADMIN_APPROVAL_EMAIL_COPY_VERSION = '2026-10-08-v2';

export function adminApprovalEmailCopyVersionHash() {
  return createHash('sha256').update(ADMIN_APPROVAL_EMAIL_COPY_VERSION).digest('hex');
}

const APPROVAL_LINK_DAYS = 14;

export function renderAdminApprovalEmailBody(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  personalNote?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
}) {
  const note = args.personalNote?.trim()
    ? `${args.personalNote.trim()}\n\n---\n\n`
    : '';
  return `${note}Hello,

${args.teacherName} (${args.teacherEmail}) at ${args.schoolName} would like to use YAWP in their classroom.

YAWP is a classroom writing platform where students draft essays and receive AI-assisted feedback while teachers stay in control of assignments and grading.

How AI is used: students interact with a writing tutor during drafting. Teachers review student work and grades; AI does not replace teacher judgment.

Privacy: student writing is used to provide feedback in YAWP. It is not used to train public AI models.

Questions? Contact us at support@yawp.school.

Approve YAWP for this school (link expires in ${APPROVAL_LINK_DAYS} days):
${args.approveUrl}

I'm not the right person to approve this:
${args.notRightPersonUrl}`;
}

export function renderReleaseEmailBody(args: { name: string; joinUrl: string }) {
  return `Hi ${args.name},

You're in — we'd love to have you try YAWP with your students.

Create your teacher account to get started:
${args.joinUrl}

This link is for you only and expires in 30 days.

— The YAWP team`;
}

export function renderCongratulationsEmailBody(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
}) {
  return `Hi ${args.teacherName},

Great news — ${args.adminName} approved YAWP for your classroom.

Sign in to create your first class and assign your Class Starter:
${args.signInUrl}

— The YAWP team`;
}
