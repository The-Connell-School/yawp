import { randomBytes } from 'node:crypto';
import { prisma } from '~/utils/db.server';

/**
 * Share links: the durable half of the Google Classroom integration.
 *
 * A share link is a stable, revocable URL for one ClassAssignment. The teacher
 * hands it to Google Classroom, Classroom hosts it as the assignment's
 * material, and students click it to land back in YAWP. Because Classroom keeps
 * its own copy of the URL once posted, the token has to stay valid across
 * edits to the assignment — which is why this is a row rather than a signed,
 * expiring blob.
 *
 * Authorization is not this module's job beyond the one scoped lookup below:
 * routes decide who may mint, and the launch route decides who may enter.
 */

/**
 * 24 bytes = 192 bits. These URLs sit in Google Classroom and in browser
 * history, so the token is the only thing standing between a guess and a
 * class roster's assignment; it gets a real entropy budget rather than
 * borrowing cuid's.
 */
export const SHARE_TOKEN_BYTE_LENGTH = 24;

export const SHARE_LINK_PROVIDER_GOOGLE_CLASSROOM = 'google-classroom';

export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTE_LENGTH).toString('base64url');
}

/**
 * The class assignment a teacher is allowed to share, or null.
 *
 * The teacher scope lives in the `where` clause rather than in a check after
 * the read, so there is no window in which the row is in hand but unverified.
 */
export async function findShareableClassAssignmentForTeacher({
  classAssignmentId,
  membershipId,
}: {
  classAssignmentId: string;
  membershipId: string;
}) {
  return prisma.classAssignment.findFirst({
    where: {
      id: classAssignmentId,
      class: { teachers: { some: { id: membershipId } } },
    },
    select: {
      id: true,
      dueAt: true,
      class: {
        select: {
          id: true,
          title: true,
          period: true,
          grade: true,
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          pointValue: true,
          assignmentType: { select: { title: true } },
        },
      },
    },
  });
}

type ShareLinkRow = {
  id: string;
  token: string;
  classAssignmentId: string;
  revokedAt: Date | null;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * The link for this assignment, minting one if needed.
 *
 * Re-sharing an assignment whose link was revoked issues a *new* token rather
 * than reviving the old one. Pressing "Share" again should hand back something
 * that works, but the URL a teacher deliberately killed stays dead — including
 * in the Classroom post it was already pasted into.
 */
export async function getOrCreateShareLink({
  classAssignmentId,
  membershipId,
}: {
  classAssignmentId: string;
  membershipId: string | null;
}): Promise<ShareLinkRow> {
  const existing = (await prisma.classAssignmentShareLink.findUnique({
    where: { classAssignmentId },
  })) as ShareLinkRow | null;

  if (existing && !existing.revokedAt) return existing;

  if (existing) {
    return (await prisma.classAssignmentShareLink.update({
      where: { classAssignmentId },
      data: {
        token: generateShareToken(),
        revokedAt: null,
        createdByMembershipId: membershipId,
        provider: SHARE_LINK_PROVIDER_GOOGLE_CLASSROOM,
      },
    })) as ShareLinkRow;
  }

  try {
    return (await prisma.classAssignmentShareLink.create({
      data: {
        classAssignmentId,
        token: generateShareToken(),
        createdByMembershipId: membershipId,
        provider: SHARE_LINK_PROVIDER_GOOGLE_CLASSROOM,
      },
    })) as ShareLinkRow;
  } catch (error) {
    // Two clicks in the same instant: the unique index on classAssignmentId is
    // what makes "one live link per assignment" true, so losing the race is
    // correct behaviour, not an error to show the teacher.
    if (!isUniqueConstraintError(error)) throw error;

    const winner = (await prisma.classAssignmentShareLink.findUnique({
      where: { classAssignmentId },
    })) as ShareLinkRow | null;
    if (!winner) throw error;
    return winner;
  }
}

/**
 * Resolve a token from an inbound launch, with everything the launch route
 * needs to decide where the visitor belongs.
 *
 * A revoked link reads as if it never existed. The caller cannot tell the two
 * apart, which is the point: a guessed token and a retired one should look the
 * same from outside.
 */
export async function resolveShareLinkByToken(token: string) {
  if (!token) return null;

  const link = await prisma.classAssignmentShareLink.findUnique({
    where: { token },
    select: {
      id: true,
      revokedAt: true,
      classAssignment: {
        select: {
          id: true,
          assignmentId: true,
          postAt: true,
          class: {
            select: {
              id: true,
              title: true,
              period: true,
              grade: true,
              school: { select: { id: true, organizationId: true } },
            },
          },
          assignment: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!link || link.revokedAt) return null;
  return link;
}

/**
 * Best-effort launch telemetry. A student who clicked through from Classroom
 * has done nothing wrong if this write fails, so it never propagates.
 */
export async function recordShareLinkLaunch(id: string): Promise<void> {
  try {
    await prisma.classAssignmentShareLink.update({
      where: { id },
      data: { launchCount: { increment: 1 }, lastLaunchedAt: new Date() },
    });
  } catch {
    // Swallowed on purpose: telemetry must not stand between a student and
    // their assignment.
  }
}

/**
 * Close a link. The row survives so its token stays spent and cannot be
 * reissued to a different assignment.
 */
export async function revokeShareLink({
  classAssignmentId,
}: {
  classAssignmentId: string;
}) {
  return prisma.classAssignmentShareLink.update({
    where: { classAssignmentId },
    data: { revokedAt: new Date() },
  });
}
