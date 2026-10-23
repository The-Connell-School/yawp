import {
  CONGRATULATIONS_V2_SUBJECT,
  FORWARD_NOTICE_V2_SUBJECT,
  RELEASE_EMAIL_V2_SUBJECT,
  TEACHER_REMINDER_V2_SUBJECT,
  renderCongratulationsEmailV2Body,
  renderForwardNoticeV2Body,
  renderReleaseEmailV2Body,
  renderTeacherReminderV2Body,
} from '~/domain/free-tier/email-copy';
import { renderAdminApprovalEmailBody } from '~/domain/free-tier/email-copy';
import { renderAdminApprovalEmailSubject } from '~/domain/free-tier/admin-approval-copy';
import { renderTransactionalEmail } from './render.server';
import {
  AdminApprovalEmail,
  TeacherApprovedEmail,
  TeacherForwardedEmail,
  TeacherReleaseEmail,
  TeacherStillWaitingEmail,
} from './transactional-emails';
import { transactionalEmailPublicOrigin } from './public-origin.server';

export function teacherFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim() || 'there';
}

export async function buildTeacherReleaseDesignedEmail(args: {
  name: string;
  joinUrl: string;
  origin?: string;
}) {
  const origin = args.origin ?? transactionalEmailPublicOrigin();
  const firstName = teacherFirstName(args.name);
  const react = (
    <TeacherReleaseEmail
      firstName={firstName}
      joinUrl={args.joinUrl}
      origin={origin}
    />
  );
  const text = renderReleaseEmailV2Body({
    name: args.name,
    joinUrl: args.joinUrl,
  });
  return {
    subject: RELEASE_EMAIL_V2_SUBJECT,
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildTeacherStillWaitingDesignedEmail(args: {
  teacherName: string;
  adminName: string;
  exploreUrl: string;
  changeAdminUrl: string;
  origin?: string;
}) {
  const origin = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <TeacherStillWaitingEmail
      firstName={teacherFirstName(args.teacherName)}
      adminName={args.adminName}
      exploreUrl={args.exploreUrl}
      changeAdminUrl={args.changeAdminUrl}
      origin={origin}
    />
  );
  const text = renderTeacherReminderV2Body({
    teacherName: args.teacherName,
    adminName: args.adminName,
    pendingUrl: args.exploreUrl,
    changeAdminUrl: args.changeAdminUrl,
  });
  return {
    subject: TEACHER_REMINDER_V2_SUBJECT,
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildTeacherForwardedDesignedEmail(args: {
  teacherName: string;
  adminName: string;
  adminEmail: string;
  manualReview: boolean;
  pendingUrl: string;
  origin?: string;
}) {
  const origin = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <TeacherForwardedEmail
      firstName={teacherFirstName(args.teacherName)}
      adminName={args.adminName}
      adminEmail={args.adminEmail}
      manualReview={args.manualReview}
      pendingUrl={args.pendingUrl}
      origin={origin}
    />
  );
  const text = renderForwardNoticeV2Body(args);
  return {
    subject: FORWARD_NOTICE_V2_SUBJECT,
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildTeacherApprovedDesignedEmail(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
  origin?: string;
}) {
  const origin = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <TeacherApprovedEmail
      firstName={teacherFirstName(args.teacherName)}
      adminName={args.adminName}
      addStudentsUrl={args.signInUrl}
      origin={origin}
    />
  );
  const text = renderCongratulationsEmailV2Body(args);
  return {
    subject: CONGRATULATIONS_V2_SUBJECT,
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildAdminApprovalDesignedEmail(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
  reminder?: boolean;
  origin?: string;
}) {
  const origin = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <AdminApprovalEmail
      teacherName={args.teacherName}
      teacherEmail={args.teacherEmail}
      schoolName={args.schoolName}
      approveUrl={args.approveUrl}
      notRightPersonUrl={args.notRightPersonUrl}
      forwardedByAdminName={args.forwardedByAdminName}
      routedByTeacher={args.routedByTeacher}
      reminder={args.reminder}
      origin={origin}
    />
  );
  const subject = renderAdminApprovalEmailSubject({
    teacherName: args.teacherName,
    schoolName: args.schoolName,
    reminder: args.reminder,
    forwardedByAdminName: args.forwardedByAdminName,
    routedByTeacher: args.routedByTeacher,
  });
  const text = renderAdminApprovalEmailBody({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    routedByTeacher: args.routedByTeacher,
    reminder: args.reminder,
  });
  return {
    subject,
    ...(await renderTransactionalEmail(react, text)),
  };
}
