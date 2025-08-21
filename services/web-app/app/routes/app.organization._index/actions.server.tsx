import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireOwner, requireProfile } from '~/utils/auth.server';
import {
  getOrganizationMembersTableCookie,
  getOrganizationMembersTableCookieValue,
  OrganizationMembersTableCookie,
  setOrganizationMembersTableCookie,
} from '~/utils/cookies.server';
import { getDomainUrl } from '~/utils/misc';
import { generateTOTP } from '~/utils/totp.server';
import { Prisma } from '@app/prisma';
import { sendEmail } from '~/utils/email.server';
import { OrganizationInviteEmail } from './OrganizationInviteEmail';

export async function updateFiltersAction(request: Request) {
  let filters = await getOrganizationMembersTableCookie(request);
  const formData = await request.formData();
  const key = formData.get('key') as
    | keyof OrganizationMembersTableCookie
    | 'skip-take'
    | 'reset';
  const value = formData.get('value') as string;

  if (key === 'sort') {
    const [field, direction] = value.split('-');
    filters.sort = field as 'name' | 'email';
    filters.direction = direction as 'asc' | 'desc';
  } else if (key === 'skip-take') {
    const [skip, take] = value.split('-');
    filters.skip = Number(skip);
    filters.take = Number(take);
  } else if (key === 'reset') {
    filters = JSON.parse(value) as OrganizationMembersTableCookie;
  } else {
    filters[key] = getOrganizationMembersTableCookieValue(key, value) as never;
  }

  const cookie = await setOrganizationMembersTableCookie(request, filters);
  return dataResponse({ success: true }, { headers: { 'Set-Cookie': cookie } });
}

export async function inviteTeachersAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const emails = formData.get('emails')?.toString().trim();
  if (!emails)
    return dataResponse({ error: 'Emails are required' }, { status: 400 });

  const emailList = emails
    .split(/[\n,]/)
    .map((email: string) => email.trim())
    .filter((email: string) => email && email.includes('@'));

  if (emailList.length === 0)
    return dataResponse({ error: 'No valid emails provided' }, { status: 400 });

  let successCount = 0;
  for (const email of emailList) {
    try {
      const existingVerification = await prisma.invitation.findFirst({
        where: {
          target: email,
          type: 'onboard-teacher',
          organizationId: profile?.organization.id,
        },
      });
      if (existingVerification)
        await prisma.invitation.delete({
          where: { id: existingVerification.id },
        });

      const { otp, ...verificationConfig } = await generateTOTP({
        algorithm: 'SHA-256',
        charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
        period: 3 * 24 * 60 * 60,
      });

      const type = 'onboard-teacher';
      const target = email;
      const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
      verifyUrl.searchParams.set('type', type);
      verifyUrl.searchParams.set('target', target);
      verifyUrl.searchParams.set('code', otp);

      const verificationData: Prisma.InvitationCreateInput = {
        type,
        target,
        ...verificationConfig,
        expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
        organization: { connect: { id: profile?.organization.id } },
      };
      await prisma.invitation.create({ data: verificationData });

      await sendEmail({
        to: email,
        subject: "You're invited to join your organization on Yawp!",
        react: (
          <OrganizationInviteEmail
            verifyUrl={verifyUrl.toString()}
            organizationName={profile.organization.name ?? 'your organization'}
            userType="teacher"
          />
        ),
      });

      successCount++;
    } catch (error) {
      console.error(`Failed to send invitation to ${email}:`, error);
    }
  }

  return dataResponse({
    success: true,
    message: `Invitations sent to ${successCount} teachers`,
    invited: successCount,
  });
}

export async function removeMembersAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const memberIds = formData.getAll('memberIds') as string[];

  const members = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      profiles: { some: { organizationId: profile?.organization.id } },
    },
  });
  if (members.length !== memberIds.length)
    return dataResponse(
      { error: 'Some members are not in the organization' },
      { status: 400 }
    );
  if (!memberIds || memberIds.length === 0)
    return dataResponse({ error: 'No members selected' }, { status: 400 });

  const owners = await prisma.user.count({
    where: {
      profiles: {
        some: { organizationId: profile?.organization.id, isOwner: true },
      },
      id: { notIn: memberIds },
    },
  });
  const removingOwners = await prisma.user.count({
    where: { id: { in: memberIds }, profiles: { some: { isOwner: true } } },
  });
  if (removingOwners > 0 && owners === 0)
    return dataResponse(
      { error: 'Cannot remove all owners from the organization' },
      { status: 400 }
    );

  const removedCount = await prisma.profile.deleteMany({
    where: { id: { in: memberIds }, organizationId: profile?.organization.id },
  });
  return dataResponse({
    success: true,
    message: `${removedCount.count} member(s) removed from organization`,
    removed: removedCount.count,
  });
}

export async function editMemberAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const memberId = formData.get('memberId')?.toString();
  if (!memberId)
    return dataResponse({ error: 'Missing memberId' }, { status: 400 });
  const memberProfile = await prisma.profile.findFirst({
    where: { userId: memberId, organizationId: profile.organization.id },
    include: { teacherProfile: true, studentProfile: true },
  });
  if (!memberProfile)
    return dataResponse({ error: 'Member not found' }, { status: 404 });

  const shouldCreateTeacher = formData.get('createTeacherProfile') === 'on';
  const shouldCreateStudent = formData.get('createStudentProfile') === 'on';
  const isOwner = formData.get('isOwner') === 'on';

  if (shouldCreateTeacher && !memberProfile.teacherProfile) {
    await prisma.teacherProfile.create({
      data: { profileId: memberProfile.id },
    });
  }
  if (shouldCreateStudent && !memberProfile.studentProfile) {
    await prisma.studentProfile.create({
      data: { profileId: memberProfile.id },
    });
  }

  await prisma.profile.update({
    where: { id: memberProfile.id },
    data: { isOwner },
  });
  return dataResponse({ success: true });
}

export async function deleteTeacherProfileAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const memberId = formData.get('memberId')?.toString();
  if (!memberId)
    return dataResponse({ error: 'Missing memberId' }, { status: 400 });
  const memberProfile = await prisma.profile.findFirst({
    where: { userId: memberId, organizationId: profile.organization.id },
    include: { teacherProfile: true },
  });
  if (!memberProfile?.teacherProfile)
    return dataResponse(
      { error: 'Teacher profile not found' },
      { status: 404 }
    );
  await prisma.teacherProfile.delete({
    where: { id: memberProfile.teacherProfile.id },
  });
  return dataResponse({ success: true });
}

export async function createSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const name = formData.get('name')?.toString().trim();
  const code = formData.get('code')?.toString().trim();
  if (!name || !code)
    return dataResponse(
      { error: 'Name and code are required' },
      { status: 400 }
    );
  await prisma.school.create({
    data: { name, code, organizationId: profile.organization.id },
  });
  return dataResponse({ success: true });
}

export async function updateSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const schoolId = formData.get('schoolId')?.toString();
  const name = formData.get('name')?.toString().trim();
  const code = formData.get('code')?.toString().trim();
  if (!schoolId || !name || !code)
    return dataResponse({ error: 'Missing fields' }, { status: 400 });
  const school = await prisma.school.findFirst({
    where: { id: schoolId, organizationId: profile.organization.id },
    select: { id: true },
  });
  if (!school)
    return dataResponse({ error: 'School not found' }, { status: 404 });
  await prisma.school.update({ where: { id: schoolId }, data: { name, code } });
  return dataResponse({ success: true });
}

export async function deleteSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const schoolId = formData.get('schoolId')?.toString();
  if (!schoolId)
    return dataResponse({ error: 'Missing schoolId' }, { status: 400 });
  const counts = await prisma.school.findFirst({
    where: { id: schoolId, organizationId: profile.organization.id },
    select: { _count: { select: { classes: true, teachers: true } } },
  });
  if (!counts)
    return dataResponse({ error: 'School not found' }, { status: 404 });
  if (counts._count.classes > 0 || counts._count.teachers > 0)
    return dataResponse(
      { error: 'Cannot delete a school with assigned classes or teachers' },
      { status: 400 }
    );
  await prisma.school.delete({ where: { id: schoolId } });
  return dataResponse({ success: true });
}

export async function assignTeacherToSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const teacherProfileId = formData.get('teacherProfileId')?.toString();
  const schoolId = formData.get('schoolId')?.toString();
  if (!teacherProfileId || !schoolId)
    return dataResponse({ error: 'Missing IDs' }, { status: 400 });
  const [tp, school] = await Promise.all([
    prisma.teacherProfile.findFirst({
      where: {
        id: teacherProfileId,
        profile: { organizationId: profile.organization.id },
      },
      select: { id: true },
    }),
    prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
      select: { id: true },
    }),
  ]);
  if (!tp || !school)
    return dataResponse({ error: 'Not found' }, { status: 404 });
  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: { schools: { connect: { id: schoolId } } },
  });
  return dataResponse({ success: true });
}

export async function unassignTeacherFromSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const teacherProfileId = formData.get('teacherProfileId')?.toString();
  const schoolId = formData.get('schoolId')?.toString();
  if (!teacherProfileId || !schoolId)
    return dataResponse({ error: 'Missing IDs' }, { status: 400 });
  const [tp, school] = await Promise.all([
    prisma.teacherProfile.findFirst({
      where: {
        id: teacherProfileId,
        profile: { organizationId: profile.organization.id },
      },
      select: { id: true },
    }),
    prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
      select: { id: true },
    }),
  ]);
  if (!tp || !school)
    return dataResponse({ error: 'Not found' }, { status: 404 });
  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: { schools: { disconnect: { id: schoolId } } },
  });
  return dataResponse({ success: true });
}

export async function assignTeacherToClassAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const teacherProfileId = formData.get('teacherProfileId')?.toString();
  const classId = formData.get('classId')?.toString();
  if (!teacherProfileId || !classId)
    return dataResponse({ error: 'Missing IDs' }, { status: 400 });
  const klass = await prisma.class.findFirst({
    where: { id: classId, school: { organizationId: profile.organization.id } },
    select: { id: true, schoolId: true },
  });
  const tp = await prisma.teacherProfile.findFirst({
    where: {
      id: teacherProfileId,
      profile: { organizationId: profile.organization.id },
    },
    select: { id: true, schools: { select: { id: true } } },
  });
  if (!klass || !tp)
    return dataResponse({ error: 'Not found' }, { status: 404 });
  if (!tp.schools.some((s) => s.id === klass.schoolId)) {
    await prisma.teacherProfile.update({
      where: { id: teacherProfileId },
      data: { schools: { connect: { id: klass.schoolId } } },
    });
  }
  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: { classes: { connect: { id: classId } } },
  });
  return dataResponse({ success: true });
}

export async function unassignTeacherFromClassAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const teacherProfileId = formData.get('teacherProfileId')?.toString();
  const classId = formData.get('classId')?.toString();
  if (!teacherProfileId || !classId)
    return dataResponse({ error: 'Missing IDs' }, { status: 400 });
  const klass = await prisma.class.findFirst({
    where: { id: classId, school: { organizationId: profile.organization.id } },
    select: { id: true, schoolId: true },
  });
  const tp = await prisma.teacherProfile.findFirst({
    where: {
      id: teacherProfileId,
      profile: { organizationId: profile.organization.id },
    },
    select: { id: true, schools: { select: { id: true } } },
  });
  if (!klass || !tp)
    return dataResponse({ error: 'Not found' }, { status: 404 });
  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: { classes: { disconnect: { id: classId } } },
  });
  return dataResponse({ success: true });
}

async function assignTeacherToAllClassesInSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const teacherProfileId = formData.get('teacherProfileId')?.toString();
  const schoolId = formData.get('schoolId')?.toString();
  if (!teacherProfileId || !schoolId)
    return dataResponse({ error: 'Missing IDs' }, { status: 400 });

  const [tp, school, schoolClasses] = await Promise.all([
    prisma.teacherProfile.findFirst({
      where: {
        id: teacherProfileId,
        profile: { organizationId: profile.organization.id },
      },
      select: {
        id: true,
        classes: { select: { id: true } },
        schools: { select: { id: true } },
      },
    }),
    prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
      select: { id: true },
    }),
    prisma.class.findMany({
      where: { schoolId, school: { organizationId: profile.organization.id } },
      select: { id: true },
    }),
  ]);
  if (!tp || !school)
    return dataResponse({ error: 'Not found' }, { status: 404 });

  const currentClassIds = new Set(tp.classes.map((c) => c.id));
  const toConnect = schoolClasses
    .map((c) => c.id)
    .filter((id) => !currentClassIds.has(id))
    .map((id) => ({ id }));

  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: {
      // Ensure teacher is connected to the school
      schools: tp.schools.some((s) => s.id === schoolId)
        ? undefined
        : { connect: { id: schoolId } },
      classes: toConnect.length > 0 ? { connect: toConnect } : undefined,
    },
  });
  return dataResponse({ success: true, assignedCount: toConnect.length });
}

async function unassignTeacherFromAllClassesInSchoolAction(request: Request) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const teacherProfileId = formData.get('teacherProfileId')?.toString();
  const schoolId = formData.get('schoolId')?.toString();
  if (!teacherProfileId || !schoolId)
    return dataResponse({ error: 'Missing IDs' }, { status: 400 });

  const [tp, school, schoolClasses] = await Promise.all([
    prisma.teacherProfile.findFirst({
      where: {
        id: teacherProfileId,
        profile: { organizationId: profile.organization.id },
      },
      select: { id: true, classes: { select: { id: true } } },
    }),
    prisma.school.findFirst({
      where: { id: schoolId, organizationId: profile.organization.id },
      select: { id: true },
    }),
    prisma.class.findMany({
      where: { schoolId, school: { organizationId: profile.organization.id } },
      select: { id: true },
    }),
  ]);
  if (!tp || !school)
    return dataResponse({ error: 'Not found' }, { status: 404 });

  const schoolClassIds = new Set(schoolClasses.map((c) => c.id));
  const toDisconnect = tp.classes
    .map((c) => c.id)
    .filter((id) => schoolClassIds.has(id))
    .map((id) => ({ id }));

  await prisma.teacherProfile.update({
    where: { id: teacherProfileId },
    data: {
      classes:
        toDisconnect.length > 0 ? { disconnect: toDisconnect } : undefined,
    },
  });
  return dataResponse({ success: true, unassignedCount: toDisconnect.length });
}

export async function organizationIndexAction({ request }: ActionFunctionArgs) {
  const formData = await request.clone().formData();
  const intent = formData.get('intent');

  if (intent === 'updateFilters') return updateFiltersAction(request);
  if (intent === 'invite-teachers') return inviteTeachersAction(request);
  if (intent === 'remove-members') return removeMembersAction(request);
  if (intent === 'edit-member') return editMemberAction(request);
  if (intent === 'delete-teacher-profile')
    return deleteTeacherProfileAction(request);
  if (intent === 'create-school') return createSchoolAction(request);
  if (intent === 'update-school') return updateSchoolAction(request);
  if (intent === 'delete-school') return deleteSchoolAction(request);
  if (intent === 'assign-teacher-to-school')
    return assignTeacherToSchoolAction(request);
  if (intent === 'unassign-teacher-from-school')
    return unassignTeacherFromSchoolAction(request);
  if (intent === 'assign-teacher-to-class')
    return assignTeacherToClassAction(request);
  if (intent === 'unassign-teacher-from-class')
    return unassignTeacherFromClassAction(request);
  if (intent === 'assign-teacher-to-all-classes-in-school')
    return assignTeacherToAllClassesInSchoolAction(request);
  if (intent === 'unassign-teacher-from-all-classes-in-school')
    return unassignTeacherFromAllClassesInSchoolAction(request);

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}
