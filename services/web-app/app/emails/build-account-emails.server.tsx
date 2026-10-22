import {
  plainTextButton,
  plainTextEmailFooter,
} from './plain-text-footer';
import { renderTransactionalEmail } from './render.server';
import { transactionalEmailPublicOrigin } from './public-origin.server';
import {
  ClassInviteEmail,
  OrgTeacherInviteEmail,
  ResetPasswordEmail,
  SchoolSetupInviteEmail,
  SignInCodeEmail,
  WelcomeVerifyEmail,
} from './transactional-emails';

export function inviteeFirstName(emailOrName: string) {
  const trimmed = emailOrName.trim();
  if (trimmed.includes('@')) return 'there';
  return trimmed.split(/\s+/)[0] || 'there';
}

export async function buildSignInCodeEmail(code: string, origin?: string) {
  const site = origin ?? transactionalEmailPublicOrigin();
  const react = <SignInCodeEmail code={code} origin={site} />;
  const text = `Your sign-in code

Enter this code to finish signing in.

Your code: ${code}

Expires in 10 minutes.

Didn't ask for this? You can ignore this email.

${plainTextEmailFooter(
  "You're getting this because someone asked to sign in to Yawp! with this email address.",
  site
)}`;
  return {
    subject: 'Your Yawp! sign-in code',
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildResetPasswordEmail(args: {
  code: string;
  resetUrl: string;
  origin?: string;
}) {
  const site = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <ResetPasswordEmail code={args.code} resetUrl={args.resetUrl} origin={site} />
  );
  const text = `Reset your password

Enter this code or use the button below to reset your password. Both expire in 10 minutes.

Your code: ${args.code}

Expires in 10 minutes.

${plainTextButton('Reset password', args.resetUrl)}

Didn't ask for this? You can ignore this email. Your password won't change.

${plainTextEmailFooter(
  "You're getting this because someone asked to reset the password for this Yawp! account.",
  site
)}`;
  return {
    subject: 'Reset your Yawp! password',
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildWelcomeVerifyEmail(args: {
  firstName: string;
  code: string;
  verifyUrl: string;
  origin?: string;
}) {
  const site = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <WelcomeVerifyEmail
      firstName={args.firstName}
      code={args.code}
      verifyUrl={args.verifyUrl}
      origin={site}
    />
  );
  const text = `Welcome to Yawp!

Hi ${args.firstName},

You're almost in. Enter this code or tap the button below to verify your email.

Your code: ${args.code}

Expires in 10 minutes.

${plainTextButton('Verify and get started', args.verifyUrl)}

Didn't sign up? You can ignore this email.

${plainTextEmailFooter(
  "You're getting this because someone signed up for Yawp! with this email and a class code.",
  site
)}`;
  return {
    subject: 'Welcome to Yawp!',
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildClassInviteEmail(args: {
  teacherName: string;
  className: string;
  schoolName: string;
  joinUrl: string;
  origin?: string;
}) {
  const site = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <ClassInviteEmail
      teacherName={args.teacherName}
      className={args.className}
      schoolName={args.schoolName}
      joinUrl={args.joinUrl}
      origin={site}
    />
  );
  const headline = `${args.teacherName} invited you to join ${args.className} on Yawp!`;
  const text = `${headline}

Join the class to see your assignments and start writing.

${plainTextButton('Join class', args.joinUrl)}

This invitation expires in 3 days.

${plainTextEmailFooter(
  `You're getting this because ${args.teacherName} invited you to a class on Yawp!`,
  site
)}`;
  return {
    subject: `${args.teacherName} invited you to join ${args.className} on Yawp!`,
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildOrgTeacherInviteEmail(args: {
  firstName: string;
  inviterName: string;
  schoolName: string;
  acceptUrl: string;
  origin?: string;
}) {
  const site = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <OrgTeacherInviteEmail
      firstName={args.firstName}
      inviterName={args.inviterName}
      schoolName={args.schoolName}
      acceptUrl={args.acceptUrl}
      origin={site}
    />
  );
  const text = `Join ${args.schoolName} on Yawp!

Hi ${args.firstName},

${args.inviterName} added you as a teacher at ${args.schoolName}. Accept the invitation to set up your classes.

${plainTextButton('Accept invitation', args.acceptUrl)}

This invitation expires in 3 days.

${plainTextEmailFooter(
  `You're getting this because ${args.inviterName} invited you to ${args.schoolName} on Yawp!`,
  site
)}`;
  return {
    subject: `${args.inviterName} invited you to join ${args.schoolName} on Yawp!`,
    ...(await renderTransactionalEmail(react, text)),
  };
}

export async function buildSchoolSetupInviteEmail(args: {
  firstName: string;
  schoolName: string;
  acceptUrl: string;
  expiresInDays: number;
  personalNote?: string | null;
  origin?: string;
}) {
  const site = args.origin ?? transactionalEmailPublicOrigin();
  const react = (
    <SchoolSetupInviteEmail
      firstName={args.firstName}
      schoolName={args.schoolName}
      acceptUrl={args.acceptUrl}
      expiresInDays={args.expiresInDays}
      personalNote={args.personalNote}
      origin={site}
    />
  );
  const note = args.personalNote?.trim();
  const text = `Set up ${args.schoolName} on Yawp!

Your school is ready to set up

Hi ${args.firstName},

Our team created a Yawp! account for ${args.schoolName} and named you as its owner. Accept the invitation to add teachers and manage your school's classes.
${note ? `\n\nA note from Yawp!\n${note}\n` : ''}
${plainTextButton('Accept invitation', args.acceptUrl)}

This invitation expires in ${args.expiresInDays} days.

${plainTextEmailFooter(
  `You're getting this because the Yawp! team set up an account for ${args.schoolName} with you as owner.`,
  site
)}`;
  return {
    subject: `Set up ${args.schoolName} on Yawp!`,
    ...(await renderTransactionalEmail(react, text)),
  };
}
