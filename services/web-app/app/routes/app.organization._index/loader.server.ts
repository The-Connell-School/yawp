import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireOwner, requireProfile } from '~/utils/auth.server';
import { getOrganizationMembersTableCookie } from '~/utils/cookies.server';

export async function loadOrganizationIndex({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const { sort, direction, skip, take, seat } =
    await getOrganizationMembersTableCookie(request);

  const baseWhere = {
    profiles: { some: { organizationId: profile?.organization.id } },
  } as const;

  const seatFilters = (seat ?? []) as string[];
  const orConditions: any[] = [];
  for (const s of seatFilters) {
    if (s === 'owner') {
      orConditions.push({
        profiles: {
          some: { organizationId: profile?.organization.id, isOwner: true },
        },
      });
    }
    if (s === 'teacher') {
      orConditions.push({
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            teacherProfile: { isNot: null },
          },
        },
      });
    }
    if (s === 'student') {
      orConditions.push({
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            studentProfile: { isNot: null },
            teacherProfile: { is: null },
          },
        },
      });
    }
    if (s === 'unassigned') {
      orConditions.push({
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            studentProfile: { is: null },
            teacherProfile: { is: null },
          },
        },
      });
    }
  }

  const where =
    orConditions.length > 0
      ? { AND: [baseWhere, { OR: orConditions }] }
      : baseWhere;

  const [
    users,
    totalCount,
    organization,
    invitations,
    schools,
    teacherProfiles,
    totalTeachers,
    totalStudents,
    totalOwners,
  ] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        profiles: {
          where: { organizationId: profile?.organization.id },
          include: { studentProfile: true, teacherProfile: true },
        },
      },
      orderBy: { [sort]: direction },
      skip,
      take,
    }),
    prisma.user.count({ where }),
    prisma.organization.findUniqueOrThrow({
      where: { id: profile?.organization.id },
      select: {
        name: true,
        numOfTeacherSeats: true,
        numOfStudentSeats: true,
        accessExpiresAt: true,
      },
    }),
    prisma.invitation.findMany({
      where: {
        organizationId: profile?.organization.id,
        type: {
          in: [
            'organization-teacher-invite',
            'organization-student-invite',
            'organization-owner-invite',
          ],
        },
      },
    }),
    prisma.school.findMany({
      where: { organizationId: profile?.organization.id },
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { classes: true, teachers: true } },
        classes: {
          select: {
            id: true,
            grade: true,
            period: true,
            _count: { select: { teachers: true, students: true } },
          },
          orderBy: [{ grade: 'asc' }, { period: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.teacherProfile.findMany({
      where: { profile: { organizationId: profile?.organization.id } },
      select: {
        id: true,
        profileId: true,
        profile: {
          select: { user: { select: { id: true, name: true, email: true } } },
        },
        schools: { select: { id: true, name: true } },
        classes: {
          select: { id: true, grade: true, period: true, schoolId: true },
        },
      },
    }),
    prisma.user.count({
      where: {
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            teacherProfile: { isNot: null },
          },
        },
      },
    }),
    prisma.user.count({
      where: {
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            studentProfile: { isNot: null },
            teacherProfile: { is: null },
          },
        },
      },
    }),
    prisma.user.count({
      where: {
        profiles: {
          some: {
            organizationId: profile?.organization.id,
            isOwner: true,
          },
        },
      },
    }),
  ]);

  return {
    organization,
    invitations,
    users,
    totalCount,
    table: { sort, direction, skip, take },
    seat: seat ?? [],
    currentUser: user,
    schools,
    teacherProfiles,
    totals: {
      teachers: totalTeachers,
      students: totalStudents,
      owners: totalOwners,
    },
  };
}
