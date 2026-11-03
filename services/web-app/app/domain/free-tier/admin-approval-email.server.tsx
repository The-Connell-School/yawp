import {
  adminApprovalTeacherRerouteLeadMarker,
  renderAdminApprovalEmailSubject,
} from './admin-approval-copy';
import { renderAdminApprovalEmailBody } from './email-copy';
import { adminApprovalUrlsFromEmailBody } from './email-copy';
import { buildAdminApprovalDesignedEmail } from '~/emails/build-free-tier-emails.server';
import { AdminApprovalEmail } from '~/emails/transactional-emails';
import { renderTransactionalEmail } from '~/emails/render.server';
import { transactionalEmailPublicOrigin } from '~/emails/public-origin.server';

export async function buildDesignedAdminApprovalEmail(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
  reminder?: boolean;
  pass1: boolean;
}) {
  return buildAdminApprovalDesignedEmail({
    ...args,
    origin: transactionalEmailPublicOrigin(),
  });
}

/** Rebuild HTML for queued payloads that predate stored html (backward compatible). */
export async function htmlForStoredAdminApprovalEmail(args: {
  subject: string;
  text: string;
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  html?: string;
  pass1: boolean;
}) {
  if (args.html) return args.html;
  const urls = adminApprovalUrlsFromEmailBody(args.text);
  const pass1ForwardLead = args.text.match(
    /^(.+) forwarded .+'s request at .+ to you\./m
  );
  const forwardLead =
    pass1ForwardLead ??
    args.text.match(/^(.+) forwarded this to you as the right person/m);
  const routedByTeacher =
    args.text.includes(adminApprovalTeacherRerouteLeadMarker(true)) ||
    args.text.includes(adminApprovalTeacherRerouteLeadMarker(false));
  const escapedSchool = args.schoolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pass1ForwardFooter = new RegExp(
    `forwarded ${args.teacherName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'s request at ${escapedSchool} to you`
  ).test(args.text);
  const pass1 = args.pass1;
  const origin = transactionalEmailPublicOrigin();
  const react = (
    <AdminApprovalEmail
      teacherName={args.teacherName}
      teacherEmail={args.teacherEmail}
      schoolName={args.schoolName}
      approveUrl={urls.approveUrl ?? ''}
      notRightPersonUrl={urls.notRightPersonUrl ?? ''}
      reminder={args.subject.startsWith('Reminder:')}
      forwardedByAdminName={forwardLead?.[1] ?? null}
      routedByTeacher={routedByTeacher}
      pass1={pass1}
      origin={origin}
    />
  );
  const { html } = await renderTransactionalEmail(react, args.text);
  return html;
}

export { renderAdminApprovalEmailSubject };
