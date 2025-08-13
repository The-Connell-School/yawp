import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireOwner, requireProfile } from '~/utils/auth.server';
import { getOrganizationMembersTableCookie } from '~/utils/cookies.server';

export async function loadOrganizationIndex({ request }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const { sort, direction, skip, take } =
    await getOrganizationMembersTableCookie(request);

  const [
    users,
    totalCount,
    organization,
    invitations,
    schools,
    teacherProfiles,
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        profiles: { some: { organizationId: profile?.organization.id } },
      },
      include: {
        profiles: {
          where: { isOwner: true },
          include: { studentProfile: true, teacherProfile: true },
        },
      },
      orderBy: { [sort]: direction },
      skip,
      take,
    }),
    prisma.user.count({
      where: {
        profiles: { some: { organizationId: profile?.organization.id } },
      },
    }),
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
  ]);

  return {
    organization,
    invitations,
    users,
    totalCount,
    table: { sort, direction, skip, take },
    currentUser: user,
    schools,
    teacherProfiles,
  };
}
