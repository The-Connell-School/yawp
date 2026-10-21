import { escapeHtml } from './html-escape.server';
import {
  ADMIN_APPROVAL_LINK_DAYS,
  FREE_TIER_ADMIN_MODEL_TRAINING_LINE,
  teacherAtSchool,
} from './admin-approval-copy';

const BRAND = '#1a1a1a';
const ACCENT = '#c45c3e';
const MUTED = '#5c5c5c';
const CARD = '#ffffff';
const PAGE = '#f5f1ea';
const HIGHLIGHT = '#efe8dc';

function bullet(text: string) {
  return `<tr><td style="padding:0 0 12px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:${BRAND};">${escapeHtml(text)}</td></tr>`;
}

export function renderAdminApprovalEmailHtml(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
  forwardedByAdminName?: string | null;
  reminder?: boolean;
}) {
  const heading = `Approve Yawp! for ${teacherAtSchool(args.teacherName, args.schoolName)}`;
  const forwarder = args.forwardedByAdminName?.trim();
  const forwardBanner = forwarder
    ? `<div style="margin:0 0 20px 0;padding:14px 16px;background:${HIGHLIGHT};border-radius:10px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:${BRAND};">${escapeHtml(`${forwarder} forwarded this to you as the right person to approve classroom software for ${teacherAtSchool(args.teacherName, args.schoolName)}.`)}</div>`
    : '';
  const reminderBanner = args.reminder
    ? `<p style="margin:0 0 16px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:${MUTED};">This is a reminder about the approval request below.</p>`
    : '';
  const approveHref = escapeHtml(args.approveUrl);
  const forwardHref = escapeHtml(args.notRightPersonUrl);
  const classroomIntro = `${teacherAtSchool(args.teacherName, args.schoolName)} would like to use Yawp! in their classroom.`;
  const administratorIntro = forwarder
    ? ''
    : ' They named you as the administrator who can approve classroom software.';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:24px 12px;background:${PAGE};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
<tr><td style="padding:0 0 20px 0;text-align:center;">
<div style="display:inline-block;width:56px;height:56px;border-radius:999px;background:${BRAND};color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-weight:800;font-size:13px;line-height:56px;letter-spacing:-0.02em;">YAWP!</div>
</td></tr>
<tr><td style="background:${CARD};border-radius:12px;padding:28px 24px 24px 24px;border:1px solid #e8e4dc;">
${reminderBanner}${forwardBanner}
<h1 style="margin:0 0 16px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:30px;font-weight:700;color:${BRAND};">${escapeHtml(heading)}</h1>
<p style="margin:0 0 20px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:${BRAND};">${escapeHtml(`${classroomIntro}${administratorIntro}`)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px 0;border:1px solid #e8e4dc;border-radius:10px;">
<tr><td style="padding:14px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="font-size:15px;font-weight:700;color:${BRAND};">${escapeHtml(args.teacherName)}</div>
<div style="font-size:14px;color:${MUTED};margin-top:2px;">Teacher at ${escapeHtml(args.schoolName)}</div>
<div style="font-size:14px;color:${MUTED};margin-top:2px;word-break:break-all;">${escapeHtml(args.teacherEmail)}</div>
</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
${bullet('Students draft essays with feedback as they write.')}
${bullet('Teachers control assignments and grading.')}
${bullet(FREE_TIER_ADMIN_MODEL_TRAINING_LINE)}
</table>
<p style="margin:0 0 24px 0;text-align:center;">
<a href="${approveHref}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:48px;padding:0 28px;border-radius:999px;">Review and approve</a>
</p>
<p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:${MUTED};text-align:center;">
Not the right person? <a href="${forwardHref}" style="color:${ACCENT};font-weight:600;">Forward this request</a>
</p>
</td></tr>
<tr><td style="padding:20px 8px 0 8px;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${MUTED};">
This link works for ${ADMIN_APPROVAL_LINK_DAYS} days. You don't need a Yawp! account.<br/>
Sent by Yawp! · yawp.school
</td></tr>
</table>
</body>
</html>`;
}
