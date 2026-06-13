import * as E from '@react-email/components';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server.js';
import { sendEmail } from '~/utils/email.server';
import { getDomainUrl } from '~/utils/misc';
import { normalizeEmail } from '~/utils/normalize-email';
import { generateTOTP } from '~/utils/totp.server';

export type StudentEmailLookupResult =
  | { status: 'existing'; email: string }
  | { status: 'needs_invite'; email: string }
  | { status: 'already_enrolled'; email: string; message: string }
  | { status: 'error'; error: string };

export type StudentEnrollResult =
  | { status: 'enrolled'; message?: string }
  | { status: 'error'; error: string };

export type StudentInviteResult =
  | { status: 'invited'; email: string }
  | { status: 'error'; error: string };

async function findStudentUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      memberships: {
        where: { role: 'STUDENT' },
        select: {
          id: true,
          organizationId: true,
          classesAsStudent: {
            select: { id: true },
          },
        },
      },
    },
  });
}

export async function lookupStudentEmailForClass({
  email: rawEmail,
  classId,
  organizationId,
}: {
  email: string;
  classId: string;
  organizationId: string;
}): Promise<StudentEmailLookupResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { status: 'error', error: 'Email is required.' };
  }

  const existingUser = await findStudentUserByEmail(email);

  if (!existingUser) {
    return { status: 'needs_invite', email };
  }

  const orgMembership = existingUser.memberships.find(
    (membership) => membership.organizationId === organizationId
  );

  if (!orgMembership) {
    return {
      status: 'error',
      error: 'This user belongs to another organization.',
    };
  }

  const alreadyEnrolled = orgMembership.classesAsStudent.some(
    (klass) => klass.id === classId
  );

  if (alreadyEnrolled) {
    return {
      status: 'already_enrolled',
      email,
      message: 'Student is already in this class.',
    };
  }

  return { status: 'existing', email };
}

export async function enrollExistingStudentInClass({
  email: rawEmail,
  classId,
  organizationId,
}: {
  email: string;
  classId: string;
  organizationId: string;
}): Promise<StudentEnrollResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { status: 'error', error: 'Email is required.' };
  }

  const existingUser = await findStudentUserByEmail(email);

  if (!existingUser) {
    return {
      status: 'error',
      error: 'No account found for this email. Send an invite instead.',
    };
  }

  const orgMembership = existingUser.memberships.find(
    (membership) => membership.organizationId === organizationId
  );

  if (!orgMembership) {
    return {
      status: 'error',
      error: 'This user belongs to another organization.',
    };
  }

  const alreadyEnrolled = orgMembership.classesAsStudent.some(
    (klass) => klass.id === classId
  );

  if (alreadyEnrolled) {
    return {
      status: 'enrolled',
      message: 'Student is already in this class.',
    };
  }

  await prisma.orgMembership.update({
    where: { id: orgMembership.id },
    data: { classesAsStudent: { connect: { id: classId } } },
  });

  return { status: 'enrolled' };
}

function StudentClassInviteEmail({
  verifyUrl,
  organizationName,
}: {
  verifyUrl: string;
  organizationName: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Welcome to Yawp!</E.Text>
        </h1>
        <p>
          <E.Text>
            {"You've been invited to join a class at "}
            {organizationName} on Yawp!
          </E.Text>
        </p>
        <p>
          <E.Text>Click the link to finish signing up:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
        <p>
          <E.Text>
            This invitation will expire in 3 days for security reasons.
          </E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}

export async function sendStudentClassInvite({
  email: rawEmail,
  classId,
  organizationId,
  request,
}: {
  email: string;
  classId: string;
  organizationId: string;
  request: Request;
}): Promise<StudentInviteResult> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { status: 'error', error: 'Email is required.' };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return {
      status: 'error',
      error: 'This student already has an account. Add them to the class instead.',
    };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      target: { equals: email, mode: 'insensitive' },
      type: 'onboard-student',
    },
  });

  if (existingInvitation) {
    await prisma.invitation.delete({
      where: { id: existingInvitation.id },
    });
  }

  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
    period: 3 * 24 * 60 * 60,
  });

  const type = 'onboard-student';
  const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
  verifyUrl.searchParams.set('type', type);
  verifyUrl.searchParams.set('target', email);
  verifyUrl.searchParams.set('code', otp);

  const verificationData: Prisma.InvitationCreateInput = {
    type,
    target: email,
    ...verificationConfig,
    expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
    metadata: JSON.stringify({ klassId: classId }),
  };

  await prisma.invitation.create({ data: verificationData });

  const response = await sendEmail({
    to: email,
    subject: "You're invited to join a class on Yawp!",
    react: (
      <StudentClassInviteEmail
        verifyUrl={verifyUrl.toString()}
        organizationName={organization?.name ?? 'your school'}
      />
    ),
  });

  if (response.status !== 'success') {
    return {
      status: 'error',
      error: 'Failed to send invitation. Please try again.',
    };
  }

  return { status: 'invited', email };
}
