import * as React from 'react';
import {
  adminApprovalTeacherRerouteFooterWhy,
  adminApprovalTeacherRerouteLead,
  FREE_TIER_ADMIN_MODEL_TRAINING_LINE,
  teacherAtSchool,
} from '~/domain/free-tier/admin-approval-copy';
import { transactionalEmailLogoUrls } from './public-origin.server';
import {
  AboutYawpList,
  CodeBlock,
  EmailBanner,
  EmailBodyBlocks,
  EmailMutedLead,
  FinePrint,
  IdentityCard,
  PersonalNoteBlock,
  PillButton,
  SecondaryLink,
  YawpEmailLayout,
} from './layout/yawp-email-layout';

type LogoUrls = ReturnType<typeof transactionalEmailLogoUrls>;

function logos(origin?: string): LogoUrls {
  return transactionalEmailLogoUrls(origin);
}

export function TeacherReleaseEmail(props: {
  firstName: string;
  joinUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader="Your free classroom license is ready. Setup takes about five minutes."
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy="You're getting this because you signed up for a free Yawp! classroom license."
      headline="Your Yawp! classroom is waiting"
      showBrianSignOff
      linkFallbackUrl={props.joinUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            Your spot is ready. Your free Yawp! classroom license covers one class of
            up to 35 students, at no cost to you or your school.
          </>,
          <>
            Setup takes about five minutes: create your class, then ask your
            administrator to approve it. You can explore everything while you wait.
          </>,
        ]}
      />
      <PillButton label="Get started" href={props.joinUrl} />
      <EmailBodyBlocks
        paragraphs={[<>This link is just for you and expires in 30 days.</>]}
      />
      <EmailBodyBlocks
        paragraphs={[
          <>
            Changed your mind? Just reply and let us know, and we&apos;ll pass your
            spot to another teacher.
          </>,
        ]}
      />
    </YawpEmailLayout>
  );
}

export function TeacherStillWaitingEmail(props: {
  firstName: string;
  adminName: string;
  exploreUrl: string;
  changeAdminUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader={`We sent ${props.adminName} a friendly reminder. Your preview is ready to explore.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy="You're getting this once a week while your classroom waits for approval. It stops as soon as you're approved."
      headline="Still waiting on approval"
      showBrianSignOff
      linkFallbackUrl={props.exploreUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            We haven&apos;t heard from {props.adminName} yet, so we sent a friendly
            reminder. A quick word in the hallway or a short email from you can help,
            too.
          </>,
          <>In the meantime, your classroom preview is ready to explore.</>,
        ]}
      />
      <PillButton label="Explore my classroom" href={props.exploreUrl} />
      <EmailBodyBlocks
        paragraphs={[
          <>
            Think another administrator could approve sooner? You can send your request
            to them instead.
          </>,
        ]}
      />
      <SecondaryLink
        before=""
        linkLabel="Request approval from a different administrator"
        href={props.changeAdminUrl}
      />
    </YawpEmailLayout>
  );
}

export function TeacherForwardedEmail(props: {
  firstName: string;
  adminName: string;
  adminEmail: string;
  manualReview: boolean;
  pendingUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  const followUp = props.manualReview
    ? 'Our team is reviewing the new request.'
    : "We'll let you know the moment they approve.";
  return (
    <YawpEmailLayout
      preheader={`It's now with ${props.adminName}. ${followUp}`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy="You're getting this because you asked a school administrator to approve your Yawp! classroom."
      headline="Your request was forwarded"
      showBrianSignOff
      linkFallbackUrl={props.pendingUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            Your approval request is now with {props.adminName} ({props.adminEmail}
            ). {followUp}
          </>,
        ]}
      />
      <PillButton label="View your request" href={props.pendingUrl} />
    </YawpEmailLayout>
  );
}

export function TeacherApprovedEmail(props: {
  firstName: string;
  adminName: string;
  addStudentsUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader={`${props.adminName} approved your classroom. Next step: add your students.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy={`You're getting this because ${props.adminName} approved your Yawp! classroom.`}
      celebrationHeadline="You're approved!"
      showBrianSignOff
      linkFallbackUrl={props.addStudentsUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            {props.adminName} approved your classroom, so all free features are now
            unlocked.
          </>,
          <>
            Next, add your students. It takes about five minutes with your class in
            the room.
          </>,
        ]}
      />
      <PillButton label="Add students" href={props.addStudentsUrl} />
      <EmailBodyBlocks
        paragraphs={[
          <>A quick thank-you to {props.adminName} might be nice, too.</>,
        ]}
      />
    </YawpEmailLayout>
  );
}

const ABOUT_YAWP_ITEMS = [
  'Students draft essays with feedback as they write.',
  'Teachers control assignments and grading.',
  FREE_TIER_ADMIN_MODEL_TRAINING_LINE,
];

export function AdminApprovalEmail(props: {
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
  const urls = logos(props.origin);
  const forwarder = props.forwardedByAdminName?.trim();
  const teacherSchool = teacherAtSchool(props.teacherName, props.schoolName);
  const preheader = forwarder
    ? `${forwarder} forwarded this to you. No Yawp! account needed.`
    : "Review the request in a couple of minutes. You don't need a Yawp! account.";
  const footerWhy = props.routedByTeacher
    ? adminApprovalTeacherRerouteFooterWhy(props.teacherName)
    : forwarder
      ? `You're getting this because ${forwarder} forwarded ${props.teacherName}'s request to you.`
      : `You're getting this because ${props.teacherName} named you as an administrator who can approve classroom software at ${props.schoolName}.`;
  const intro =
    forwarder || props.routedByTeacher
      ? `${teacherSchool} would like to use Yawp! in their classroom.`
      : `${teacherSchool} would like to use Yawp! in their classroom. They named you as the administrator who can approve classroom software.`;
  const banner = props.routedByTeacher ? (
    <EmailBanner>
      {adminApprovalTeacherRerouteLead(props.teacherName, props.schoolName)}
    </EmailBanner>
  ) : forwarder ? (
    <EmailBanner>
      {forwarder} forwarded this to you as the right person to approve classroom
      software for {teacherSchool}.
    </EmailBanner>
  ) : undefined;

  return (
    <YawpEmailLayout
      preheader={
        props.reminder
          ? `${props.teacherName}'s request is still open. It takes a couple of minutes.`
          : preheader
      }
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy={footerWhy}
      banner={banner}
      headline={`Approve Yawp! for ${teacherSchool}`}
      linkFallbackUrl={props.approveUrl}
    >
      {props.reminder ? (
        <EmailMutedLead>
          This is a reminder about the approval request below.
        </EmailMutedLead>
      ) : null}
      <EmailBodyBlocks paragraphs={[intro]} />
      <IdentityCard
        rows={[
          { label: 'Teacher', value: props.teacherName },
          { label: 'School', value: props.schoolName },
          { label: 'Email', value: props.teacherEmail },
        ]}
      />
      <AboutYawpList label="About Yawp!" items={ABOUT_YAWP_ITEMS} />
      <PillButton label="Review and approve" href={props.approveUrl} />
      <SecondaryLink
        before="Not the right person?"
        linkLabel="Forward this request"
        href={props.notRightPersonUrl}
      />
      <FinePrint>
        This link works for 14 days. You don&apos;t need a Yawp! account.
      </FinePrint>
    </YawpEmailLayout>
  );
}

export function SignInCodeEmail(props: { code: string; origin?: string }) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader={`Your code is ${props.code}. It expires in 10 minutes.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy="You're getting this because someone asked to sign in to Yawp! with this email address."
      headline="Your sign-in code"
    >
      <EmailBodyBlocks paragraphs={[<>Enter this code to finish signing in.</>]} />
      <CodeBlock code={props.code} expiryLine="Expires in 10 minutes" />
      <EmailBodyBlocks
        paragraphs={[<>Didn&apos;t ask for this? You can ignore this email.</>]}
      />
    </YawpEmailLayout>
  );
}

export function ResetPasswordEmail(props: {
  code: string;
  resetUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader={`Use code ${props.code} or the button inside. It expires in 10 minutes.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy="You're getting this because someone asked to reset the password for this Yawp! account."
      headline="Reset your password"
      linkFallbackUrl={props.resetUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>
            Enter this code or use the button below to reset your password. Both
            expire in 10 minutes.
          </>,
        ]}
      />
      <CodeBlock code={props.code} expiryLine="Expires in 10 minutes" />
      <PillButton label="Reset password" href={props.resetUrl} />
      <EmailBodyBlocks
        paragraphs={[
          <>
            Didn&apos;t ask for this? You can ignore this email. Your password
            won&apos;t change.
          </>,
        ]}
      />
    </YawpEmailLayout>
  );
}

export function WelcomeVerifyEmail(props: {
  firstName: string;
  code: string;
  verifyUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader={`Your code is ${props.code}. Verify your email to join your class.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy="You're getting this because someone signed up for Yawp! with this email and a class code."
      headline="Welcome to Yawp!"
      linkFallbackUrl={props.verifyUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            You&apos;re almost in. Enter this code or tap the button below to verify
            your email.
          </>,
        ]}
      />
      <CodeBlock code={props.code} expiryLine="Expires in 10 minutes" />
      <PillButton label="Verify and get started" href={props.verifyUrl} />
      <EmailBodyBlocks
        paragraphs={[<>Didn&apos;t sign up? You can ignore this email.</>]}
      />
    </YawpEmailLayout>
  );
}

export function ClassInviteEmail(props: {
  teacherName: string;
  className: string;
  schoolName: string;
  joinUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  const headline = `${props.teacherName} invited you to join ${props.className} at ${props.schoolName}`;
  return (
    <YawpEmailLayout
      preheader={`${props.className} at ${props.schoolName}. This invitation expires in 3 days.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy={`You're getting this because ${props.teacherName} invited you to a class on Yawp!`}
      headline={headline}
      linkFallbackUrl={props.joinUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Join the class to see your assignments and start writing.</>,
        ]}
      />
      <PillButton label="Join class" href={props.joinUrl} />
      <EmailBodyBlocks paragraphs={[<>This invitation expires in 3 days.</>]} />
    </YawpEmailLayout>
  );
}

export function OrgTeacherInviteEmail(props: {
  firstName: string;
  inviterName: string;
  schoolName: string;
  acceptUrl: string;
  origin?: string;
}) {
  const urls = logos(props.origin);
  return (
    <YawpEmailLayout
      preheader="Accept to set up your classes. This invitation expires in 3 days."
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy={`You're getting this because ${props.inviterName} invited you to ${props.schoolName} on Yawp!`}
      headline={`Join ${props.schoolName} on Yawp!`}
      linkFallbackUrl={props.acceptUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            {props.inviterName} added you as a teacher at {props.schoolName}. Accept
            the invitation to set up your classes.
          </>,
        ]}
      />
      <PillButton label="Accept invitation" href={props.acceptUrl} />
      <EmailBodyBlocks paragraphs={[<>This invitation expires in 3 days.</>]} />
    </YawpEmailLayout>
  );
}

export function SchoolSetupInviteEmail(props: {
  firstName: string;
  schoolName: string;
  acceptUrl: string;
  expiresInDays: number;
  personalNote?: string | null;
  origin?: string;
}) {
  const urls = logos(props.origin);
  const note = props.personalNote?.trim();
  return (
    <YawpEmailLayout
      preheader={`We've created your school's account. This invitation expires in ${props.expiresInDays} days.`}
      logoBlackUrl={urls.black}
      logoWhiteUrl={urls.white}
      siteUrl={urls.site}
      footerWhy={`You're getting this because the Yawp! team set up an account for ${props.schoolName} with you as owner.`}
      headline="Your school is ready to set up"
      linkFallbackUrl={props.acceptUrl}
    >
      <EmailBodyBlocks
        paragraphs={[
          <>Hi {props.firstName},</>,
          <>
            Our team created a Yawp! account for {props.schoolName} and named you as
            its owner. Accept the invitation to add teachers and manage your
            school&apos;s classes.
          </>,
        ]}
      />
      {note ? (
        <PersonalNoteBlock label="A note from Yawp!" note={note} />
      ) : null}
      <PillButton label="Accept invitation" href={props.acceptUrl} />
      <EmailBodyBlocks
        paragraphs={[
          <>This invitation expires in {props.expiresInDays} days.</>,
        ]}
      />
    </YawpEmailLayout>
  );
}
