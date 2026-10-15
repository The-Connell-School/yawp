import { redirect } from 'react-router';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import type { Prisma } from '@app/prisma';
import {
  StudentOnboardingMetadataSchema,
  TeacherOnboardingMetadataSchema,
  OwnerOnboardingMetadataSchema,
} from '~/utils/schemas/invitation';
import { FlowError, type Flow } from './flow.server';
import { classSummary, lookupClasses } from './classes.server';
import { requireUaOrganizationId } from '~/utils/ua-partner.server';

/** Resolve the existing invitation contract only after email/provider proof.
 * Roles, organization and allowed classes come from the invitation, never POST. */
export async function readInvitation(tx: Prisma.TransactionClient, flow: Flow) {
  if (!flow.data.invitationId) return null;
  if (!flow.data.proof) throw new FlowError('Verify your email first.', 401);
  const invite = await tx.invitation.findUnique({
    where: { id: flow.data.invitationId },
  });
  if (
    !invite ||
    invite.target.toLowerCase() !== flow.data.identifier ||
    (invite.expiresAt && invite.expiresAt <= new Date())
  )
    throw new FlowError('Your invitation expired.');
  let raw: unknown;
  try {
    raw = JSON.parse(invite.metadata || '{}');
  } catch {
    throw new FlowError('Invalid invitation.');
  }
  if (invite.type === 'onboard-teacher' || invite.type === 'onboard-owner') {
    const schema =
      invite.type === 'onboard-owner'
        ? OwnerOnboardingMetadataSchema
        : TeacherOnboardingMetadataSchema;
    const metadata = schema.safeParse(raw);
    if (!metadata.success) throw new FlowError('Invalid invitation.');
    const organizationId = metadata.data.organizationId;
    if (invite.organizationId && invite.organizationId !== organizationId)
      throw new FlowError('Invalid invitation.');
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!organization) throw new FlowError('Invalid invitation.');
    // A staff invitation must never carry a student class selected in another step.
    flow.data.classId = undefined;
    flow.data.classCode = undefined;
    flow.data.classCandidates = undefined;
    let schoolId = invite.schoolId ?? undefined;
    if (
      schoolId &&
      !(await tx.school.findFirst({
        where: { id: schoolId, organizationId },
        select: { id: true },
      }))
    )
      throw new FlowError('Invalid invitation.');
    if (!schoolId && invite.type === 'onboard-teacher') {
      const schools = await tx.school.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      });
      if (schools.length === 1) schoolId = schools[0].id;
      // The merged screen has no school selector. Use the existing onboarding
      // page for a multi-school invite instead of silently selecting a school.
    }
    return {
      invite,
      organizationId,
      role: 'TEACHER' as const,
      owner: invite.type === 'onboard-owner',
      schoolId,
      organizationName: organization.name,
    };
  }
  if (invite.type !== 'onboard-student')
    throw new FlowError('Invalid invitation.');
  const metadata = StudentOnboardingMetadataSchema.safeParse(raw);
  if (!metadata.success) throw new FlowError('Invalid invitation.');
  if ('partner' in metadata.data) {
    if (metadata.data.organizationId !== requireUaOrganizationId())
      throw new FlowError('Invalid invitation.');
    flow.data.partner = true;
    return {
      invite,
      organizationId: metadata.data.organizationId,
      role: 'STUDENT' as const,
      owner: false,
    };
  }
  const data = metadata.data;
  const ids = [
    ...(data.klassIds || []),
    ...(data.klassId ? [data.klassId] : []),
  ];
  const classes = await tx.class.findMany({
    where: {
      isArchived: false,
      ...(ids.length ? { id: { in: ids } } : {}),
      ...(data.schoolId ? { schoolId: data.schoolId } : {}),
      ...(invite.organizationId
        ? { school: { organizationId: invite.organizationId } }
        : {}),
    },
    select: {
      id: true,
      code: true,
      school: { select: { organizationId: true } },
    },
    take: 20,
    orderBy: { id: 'asc' },
  });
  if (!classes.length) throw new FlowError('Class not found.');
  const selected = flow.data.classId
    ? classes.find((k) => k.id === flow.data.classId)
    : classes.length === 1
      ? classes[0]
      : undefined;
  flow.data.classCandidates = classes.map((k) => k.id);
  if (!selected)
    return { invite, role: 'STUDENT' as const, owner: false, classes };
  flow.data.classId = selected.id;
  flow.data.classCode = selected.code;
  return {
    invite,
    organizationId: selected.school.organizationId,
    role: 'STUDENT' as const,
    owner: false,
    classes,
  };
}
export async function prepareInvitation(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request
) {
  const invitation = await readInvitation(tx, flow);
  if (!invitation) return null;
  if (
    invitation.role === 'TEACHER' &&
    !invitation.owner &&
    !invitation.schoolId
  ) {
    const cookie = await invitationCookieStorage.getSession(
      request.headers.get('cookie')
    );
    cookie.set('email', flow.data.identifier);
    cookie.set('organizationId', invitation.organizationId);
    await tx.invitation.delete({ where: { id: invitation.invite.id } });
    flow.data.invitationId = undefined;
    flow.data.legacyOrganizationId = invitation.organizationId;
    return redirect('/auth/inv/onboard-teacher', {
      headers: {
        'set-cookie': await invitationCookieStorage.commitSession(cookie),
      },
    });
  }
  if (invitation.role === 'TEACHER')
    return {
      screen: 'name-password' as const,
      identifier: flow.data.identifier,
      variant: invitation.owner ? 'admin' : 'teacher',
      organizationName: invitation.organizationName,
    };
  if (invitation.classes && !flow.data.classId) {
    // Each option is explicitly permitted by the signed invitation metadata.
    const summaries = await Promise.all(
      invitation.classes.map(async (k) =>
        (await lookupClasses(tx, k.code)).find((c) => c.id === k.id)
      )
    );
    return {
      screen: 'class-found' as const,
      identifier: flow.data.identifier,
      variant: 'multiple',
      classes: summaries.filter((k) => !!k).map(classSummary),
    };
  }
  return null;
}

export async function acceptExistingInvitation(
  tx: Prisma.TransactionClient,
  flow: Flow,
  userId: string
) {
  const invitation = await readInvitation(tx, flow);
  if (!invitation || invitation.role === 'STUDENT') return;
  const member = await tx.orgMembership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: invitation.organizationId,
      },
    },
  });
  if (member) {
    await tx.orgMembership.update({
      where: { id: member.id },
      data: {
        role: 'TEACHER',
        ...(invitation.owner ? { isOrgOwner: true } : {}),
        ...(invitation.schoolId
          ? { schools: { connect: { id: invitation.schoolId } } }
          : {}),
      },
    });
  } else
    await tx.orgMembership.create({
      data: {
        userId,
        organizationId: invitation.organizationId,
        role: 'TEACHER',
        isOrgOwner: invitation.owner,
        ...(invitation.schoolId
          ? { schools: { connect: { id: invitation.schoolId } } }
          : {}),
      },
    });
  await tx.invitation.delete({ where: { id: invitation.invite.id } });
  flow.data.invitationId = undefined;
}
