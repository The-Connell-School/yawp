import {
  renderAdminApprovalEmailSubject,
} from './admin-approval-copy';
import { renderAdminApprovalEmailBody } from './email-copy';
import { renderAdminApprovalEmailHtml } from './admin-approval-email-html.server';
import { adminApprovalUrlsFromEmailBody } from './email-copy';

export function buildDesignedAdminApprovalEmail(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
  forwardedByAdminName?: string | null;
  reminder?: boolean;
}) {
  const subject = renderAdminApprovalEmailSubject({
    teacherName: args.teacherName,
    schoolName: args.schoolName,
    reminder: args.reminder,
    forwardedByAdminName: args.forwardedByAdminName,
  });
  const text = renderAdminApprovalEmailBody({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    reminder: args.reminder,
  });
  const html = renderAdminApprovalEmailHtml({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    reminder: args.reminder,
  });
  return { subject, text, html };
}

/** Rebuild HTML for queued payloads that predate stored html (backward compatible). */
export function htmlForStoredAdminApprovalEmail(args: {
  subject: string;
  text: string;
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  html?: string;
}) {
  if (args.html) return args.html;
  const urls = adminApprovalUrlsFromEmailBody(args.text);
  const forwardLead = args.text.match(
    /^(.+) forwarded this to you as the right person/m
  );
  return renderAdminApprovalEmailHtml({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: urls.approveUrl ?? '',
    notRightPersonUrl: urls.notRightPersonUrl ?? '',
    reminder: args.subject.startsWith('Reminder:'),
    forwardedByAdminName: forwardLead?.[1] ?? null,
  });
}
