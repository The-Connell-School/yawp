import * as E from '@react-email/components';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server.js';
import { sendEmail } from '~/utils/email.server';
import { getDomainUrl } from '~/utils/misc';
import { normalizeEmail } from '~/utils/normalize-email';
import { generateTOTP } from '~/utils/totp.server';
import {
  assertFreeClassSeatAvailableInTx,
  enrollStudentInClassWithSeatCap,
} from '~/domain/free-tier/class-seat-cap.server';
import {
  FreeClassSeatError,
  isFreeClassSeatError,
} from '~/domain/free-tier/free-class-seat-error';

export type StudentEmailLookupResult =
  | { status: 'existing'; email: string }
  | { status: 'needs_invite'; email: string }
  | { status: 'already_enrolled'; email: string; message: string }
  | { status: 'error'; error: string };

export type StudentEnrollResult =
  { status: 'enrolled'; message?: string } | { status: 'error'; error: string };

export type StudentInviteResult =
  { status: 'invited'; email: string } | { status: 'error'; error: string };

const STAFF_ACCOUNT_ERROR =
  'This email belongs to a staff account, not a student account.';
const OTHER_ORGANIZATION_ERROR = 'This user belongs to another organization.';

// Stored emails are not guaranteed to be lower-cased — accounts created before
// email normalization keep their original casing — so every lookup here matches
// case-insensitively. An exact match would report an existing student as new and
// send them a second invite.
async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true,
      memberships: {
        select: {
          id: true,
          organizationId: true,
          role: true,
          classesAsStudent: {
            select: { id: true },
          },
        },
      },
    },
  });
}

type StudentMembershipLookup =
  | {
      status: 'ok';
      membership: { id: string; classesAsStudent: { id: string }[] };
    }
  | { status: 'error'; error: string };

function resolveStudentMembership(
  memberships: {
    id: string;
    organizationId: string;
    role: string;
    classesAsStudent: { id: string }[];
  }[],
  organizationId: string
): StudentMembershipLookup {
  const orgMembership = memberships.find(
    (membership) => membership.organizationId === organizationId
  );

  if (!orgMembership) {
    return { status: 'error', error: OTHER_ORGANIZATION_ERROR };
  }

  if (orgMembership.role !== 'STUDENT') {
    return { status: 'error', error: STAFF_ACCOUNT_ERROR };
  }

  return { status: 'ok', membership: orgMembership };
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

  const existingUser = await findUserByEmail(email);

  if (!existingUser) {
    return { status: 'needs_invite', email };
  }

  const membershipLookup = resolveStudentMembership(
    existingUser.memberships,
    organizationId
  );

  if (membershipLookup.status === 'error') {
    return { status: 'error', error: membershipLookup.error };
  }

  const alreadyEnrolled = membershipLookup.membership.classesAsStudent.some(
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

  const existingUser = await findUserByEmail(email);

  if (!existingUser) {
    return {
      status: 'error',
      error: 'No account found for this email. Send an invite instead.',
    };
  }

  const membershipLookup = resolveStudentMembership(
    existingUser.memberships,
    organizationId
  );

  if (membershipLookup.status === 'error') {
    return { status: 'error', error: membershipLookup.error };
  }

  const orgMembership = membershipLookup.membership;

  const alreadyEnrolled = orgMembership.classesAsStudent.some(
    (klass) => klass.id === classId
  );

  // Joining an additional class must never displace the student's other
  // classes, so this connects the new class instead of setting the list.
  if (alreadyEnrolled) {
    return {
      status: 'enrolled',
      message: 'Student is already in this class.',
    };
  }

  const enrolled = await enrollStudentInClassWithSeatCap({
    membershipId: orgMembership.id,
    classId,
    organizationId,
  });
  if (!enrolled.ok) {
    return { status: 'error', error: enrolled.error };
  }

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

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });

  if (existingUser) {
    return {
      status: 'error',
      error:
        'This student already has an account. Add them to the class instead.',
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
    try {
      const metadata = JSON.parse(existingInvitation.metadata ?? '{}');
      if (metadata?.partner === 'ua') {
        return {
          status: 'error',
          error:
            'This student has a pending University of Alabama signup. They must finish or clear that signup before receiving a class invitation.',
        };
      }
    } catch {
      // Legacy invitations without parseable metadata remain replaceable by
      // the ordinary class-invitation flow.
    }
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
    studentClassId: classId,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const seat = await assertFreeClassSeatAvailableInTx(tx, {
        classId,
        organizationId,
      });
      if (!seat.ok) {
        throw new FreeClassSeatError(seat.code, seat.error);
      }
      if (existingInvitation) {
        await tx.invitation.delete({ where: { id: existingInvitation.id } });
      }
      await tx.invitation.create({ data: verificationData });
    });
  } catch (error) {
    if (isFreeClassSeatError(error)) {
      return { status: 'error', error: error.message };
    }
    throw error;
  }

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
