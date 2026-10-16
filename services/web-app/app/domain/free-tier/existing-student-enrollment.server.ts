import type { Prisma } from '@app/prisma';
import { lockStudentRosters } from '~/domain/collaboration/class-assignment-lock.server';
import { prisma } from '~/utils/db.server';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isDemoFreeTierRouteOpen } from '~/utils/free-tier/free-tier-feature-gate.server';
import {
  assertFreeClassSeatAvailableInTx,
  enrollStudentInClassWithSeatCap,
  lockClassRosterSeatCap,
} from './class-seat-cap.server';
import {
  assertFreeTierSpendAllowed,
  FreeTierSpendGuardDeniedError,
} from './usage-budget.server';

const classSelect = {
  id: true,
  code: true,
  schoolYear: true,
  period: true,
  grade: true,
  school: {
    select: {
      name: true,
      organizationId: true,
      organization: { select: { plan: true } },
    },
  },
  teachers: { select: { user: { select: { name: true } } } },
} satisfies Prisma.ClassSelect;
const orderBy = [
  { schoolYear: 'desc' },
  { grade: 'asc' },
  { period: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ClassOrderByWithRelationInput[];
type CodeClass = Prisma.ClassGetPayload<{ select: typeof classSelect }>;

async function eligibleFreeClass(
  tx: Prisma.TransactionClient,
  klass: CodeClass
) {
  if (klass.school.organization.plan !== 'FREE_CLASSROOM') return true;
  // Persisted application status is the existing approval/expiry boundary. The
  // organization date fields are administrative metadata, not a new trial clock.
  const application = await tx.freeTierApplication.findFirst({
    where: { organizationId: klass.school.organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: { status: true },
  });
  if (application?.status !== 'APPROVED') return false;
  return Boolean(
    await tx.class.findFirst({
      where: {
        id: klass.id,
        isArchived: false,
        teachers: {
          some: {
            role: 'TEACHER',
            isActive: true,
            organizationId: klass.school.organizationId,
          },
        },
      },
      select: { id: true },
    })
  );
}

/**
 * An ordinary code first resolves within the selected organization, preserving
 * paid enrollment and its school disambiguation. Outside that boundary, only a
 * unique eligible free-classroom invitation is supported. Never list foreign
 * collisions or let a supplied class/organization id break a tie. Paid tenants
 * are never searched as a fallback. A supplied id cannot disambiguate a foreign
 * collision. Every caller must re-run this resolver, including POSTs.
 */
export async function resolveStudentClassCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
  rawCode: string
): Promise<CodeClass[]> {
  const code = rawCode.trim();
  if (!code) return [];
  const base = {
    isArchived: false,
    code: { equals: code, mode: 'insensitive' as const },
  };
  const own = await tx.class.findMany({
    where: { ...base, school: { organizationId } },
    select: classSelect,
    orderBy,
  });
  if (own.length) {
    const eligible = await Promise.all(
      own.map((k) => eligibleFreeClass(tx, k))
    );
    return own.filter((_, index) => eligible[index]);
  }
  if (!isDemoFreeTierRouteOpen(process.env) && !(await isFreeTierEnabled()))
    return [];
  // Fetch ids/details only server-side, at most two. Any collision fails closed;
  // eligibility filtering must not turn a collision into a different target.
  const candidates = await tx.class.findMany({
    where: { ...base, school: { organization: { plan: 'FREE_CLASSROOM' } } },
    select: classSelect,
    orderBy,
    take: 2,
  });
  if (candidates.length !== 1 || !(await eligibleFreeClass(tx, candidates[0]!)))
    return [];
  return candidates;
}

type EnrollmentResult =
  | { ok: true; membershipId: string }
  | {
      ok: false;
      code: 'invalid_code' | 'class_full' | 'unavailable';
      error: string;
    };
const invalid = (): EnrollmentResult => ({
  ok: false,
  code: 'invalid_code',
  error: 'Invalid code.',
});
class EnrollmentDenied extends Error {
  constructor(readonly result: EnrollmentResult) {
    super('Enrollment denied');
  }
}

export async function enrollExistingStudentByCode(params: {
  userId: string;
  sourceMembershipId: string;
  sourceOrganizationId: string;
  code: string;
  classId?: string;
  client?: Prisma.TransactionClient;
}): Promise<EnrollmentResult> {
  try {
    const enroll = async (tx: Prisma.TransactionClient): Promise<EnrollmentResult> => {
      // One identity can join through different tabs/classes concurrently. This
      // serializes membership creation across those classes, not only one roster.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-code:${params.userId}`}))`;
      const source = await tx.orgMembership.findFirst({
        where: {
          id: params.sourceMembershipId,
          userId: params.userId,
          organizationId: params.sourceOrganizationId,
          role: 'STUDENT',
          isActive: true,
          isOrgOwner: false,
        },
        select: { id: true },
      });
      if (!source) return invalid();
      const classes = await resolveStudentClassCode(
        tx,
        params.sourceOrganizationId,
        params.code
      );
      const selected = params.classId
        ? classes.find((k) => k.id === params.classId)
        : classes.length === 1
          ? classes[0]
          : undefined;
      if (!selected) return invalid();
      await lockClassRosterSeatCap(tx, selected.id);
      // A selection is never authorization. Read the current code, plan, archive
      // state and invitation again after acquiring the enrollment lock.
      const current = await resolveStudentClassCode(
        tx,
        params.sourceOrganizationId,
        params.code
      );
      const klass = current.find((k) => k.id === selected.id);
      if (!klass) return invalid();
      const organizationId = klass.school.organizationId;
      const memberQuery = {
        where: {
          userId_organizationId: { userId: params.userId, organizationId },
        },
        select: {
          id: true,
          userId: true,
          organizationId: true,
          role: true,
          isOrgOwner: true,
          isActive: true,
          classesAsStudent: { where: { id: klass.id }, select: { id: true } },
        },
      } satisfies Prisma.OrgMembershipFindUniqueArgs;
      let member = await tx.orgMembership.findUnique(memberQuery);
      if (member) {
        await lockStudentRosters(tx, [member.id]);
        member = await tx.orgMembership.findUnique(memberQuery);
        if (!member) return invalid();
      }
      if (
        member &&
        (member.userId !== params.userId ||
          member.organizationId !== organizationId ||
          member.role !== 'STUDENT' ||
          member.isOrgOwner ||
          !member.isActive)
      )
        return invalid();
      // Already admitted students do not consume another seat or budget admission.
      if (member?.classesAsStudent.length)
        return { ok: true, membershipId: member.id };
      const seat = await assertFreeClassSeatAvailableInTx(tx, {
        classId: klass.id,
        organizationId,
      });
      if (!seat.ok)
        return {
          ok: false,
          code: seat.code === 'class_full' ? 'class_full' : 'invalid_code',
          error: seat.error,
        };
      if (seat.plan === 'FREE_CLASSROOM') await assertFreeTierSpendAllowed(tx);
      if (!member) {
        // Foreign paid classes are excluded by resolution; no source identity or
        // membership is moved, and no owner/teacher privilege is inherited.
        member = await tx.orgMembership.create({
          data: {
            userId: params.userId,
            organizationId,
            role: 'STUDENT',
            isOrgOwner: false,
            isActive: true,
          },
          select: {
            id: true,
            userId: true,
            organizationId: true,
            role: true,
            isOrgOwner: true,
            isActive: true,
            classesAsStudent: { where: { id: klass.id }, select: { id: true } },
          },
        });
      }
      const enrolled = await enrollStudentInClassWithSeatCap({
        membershipId: member.id,
        classId: klass.id,
        organizationId,
        client: tx,
      });
      // Throw after any write so a downstream denial cannot leave a membership.
      if (!enrolled.ok)
        throw new EnrollmentDenied({
          ok: false,
          code: enrolled.code === 'class_full' ? 'class_full' : 'invalid_code',
          error: enrolled.error,
        });
      return { ok: true, membershipId: member.id };
    };
    return params.client ? await enroll(params.client) : await prisma.$transaction(enroll);
  } catch (error) {
    if (error instanceof EnrollmentDenied) return error.result;
    if (error instanceof FreeTierSpendGuardDeniedError)
      return {
        ok: false,
        code: 'unavailable',
        error: 'This free classroom is not accepting new students right now.',
      };
    throw error;
  }
}

/** A proved existing student without an active organization can use the same
 * public class invitation as a new signup. Never reactivate a disabled membership
 * or turn a staff account into a student. The caller holds the identity proof. */
export async function enrollUnassignedStudentByCode(tx: Prisma.TransactionClient, params: { userId: string; code: string; classId: string }): Promise<EnrollmentResult> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-code:${params.userId}`}))`;
  if (await tx.orgMembership.findFirst({ where: { userId: params.userId, role: 'TEACHER' }, select: { id: true } })) return invalid();
  const target = await tx.class.findFirst({ where: { id: params.classId, isArchived: false, code: { equals: params.code.trim(), mode: 'insensitive' } }, select: { school: { select: { organizationId: true } } } });
  if (!target) return invalid();
  const organizationId = target.school.organizationId;
  const classes = await resolveStudentClassCode(tx, organizationId, params.code);
  if (!classes.some(k => k.id === params.classId)) return invalid();
  const existing = await tx.orgMembership.findUnique({ where: { userId_organizationId: { userId: params.userId, organizationId } } });
  if (existing && (!existing.isActive || existing.role !== 'STUDENT' || existing.isOrgOwner)) return invalid();
  const seat = await assertFreeClassSeatAvailableInTx(tx, { classId: params.classId, organizationId });
  if (!seat.ok) return { ok: false, code: seat.code === 'class_full' ? 'class_full' : 'invalid_code', error: seat.error };
  if (seat.plan === 'FREE_CLASSROOM') await assertFreeTierSpendAllowed(tx);
  const member = existing || await tx.orgMembership.create({ data: { userId: params.userId, organizationId, role: 'STUDENT', isOrgOwner: false } });
  const enrolled = await enrollStudentInClassWithSeatCap({ membershipId: member.id, classId: params.classId, organizationId, client: tx });
  if (!enrolled.ok) throw new EnrollmentDenied({ ok: false, code: enrolled.code === 'class_full' ? 'class_full' : 'invalid_code', error: enrolled.error });
  return { ok: true, membershipId: member.id };
}
