import type { Prisma } from '@app/prisma';
import { redirect } from 'react-router';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import {
  getSessionExpirationDateForUser,
  sessionKey,
} from '~/utils/auth.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import {
  enforceFreeTierTeacherGate,
  loadFreeTierGateApplication,
} from '~/domain/free-tier/free-tier-gate.server';
import {
  enrollExistingStudentByCode,
  enrollUnassignedStudentByCode,
} from '~/domain/free-tier/existing-student-enrollment.server';
import {
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
} from '~/utils/preview-access.server';
import { previewSessionAllowedWithoutSeatMembership } from '~/utils/preview-session-seat.server';
import {
  FlowError,
  stateFor,
  assertCurrentIdentity,
  type Flow,
} from './flow.server';
import {
  readInvitation,
  prepareInvitation,
  acceptExistingInvitation,
  acceptStudentInvitation,
} from './invitations.server';
import { postAuthenticationDestination } from './policy.server';

async function authenticationHeaders(
  tx: Prisma.TransactionClient,
  request: Request,
  user: { id: string; email: string | null },
  issueSession: boolean
) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (issueSession) {
    const session = await tx.session.create({
      data: {
        userId: user.id,
        expirationDate: getSessionExpirationDateForUser(user),
      },
    });
    const auth = await authSessionStorage.getSession(
      request.headers.get('cookie')
    );
    auth.set(sessionKey, session.id);
    headers.append(
      'set-cookie',
      await authSessionStorage.commitSession(auth, {
        expires: session.expirationDate,
      })
    );
  }
  return headers;
}

export async function finishAuthentication(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request,
  userId: string,
  issueSession = true,
  selectedMembershipId?: string
): Promise<Response> {
  const membershipChosen = Boolean(selectedMembershipId);
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, mustChangePassword: true },
  });
  let memberships = await tx.orgMembership.findMany({
    where: { userId, isActive: true },
    include: { organization: { select: { name: true, plan: true } } },
    orderBy: { id: 'asc' },
  });
  if (isIsolatedPreviewSeatMode()) {
    const seat = await getPreviewAccessSeat(request);
    memberships = memberships.filter(
      (m) => m.organizationId === seat?.organizationId
    );
    if (
      !memberships.length &&
      !(await previewSessionAllowedWithoutSeatMembership(userId))
    )
      throw new FlowError('Sign-in is unavailable for this account.', 403);
  }
  if (
    selectedMembershipId &&
    !memberships.some((m) => m.id === selectedMembershipId)
  )
    throw new FlowError('Choose an active membership.', 403);
  flow.data.userId = userId;
  if (flow.data.pendingGoogle && flow.data.proof && !user.mustChangePassword) {
    const headers = await authenticationHeaders(
      tx,
      request,
      user,
      issueSession
    );
    return Response.json(
      stateFor(flow, {
        screen: 'link-google',
        identifier: flow.data.identifier,
      }),
      { headers }
    );
  }
  if (!user.mustChangePassword && flow.data.invitationId && flow.data.proof) {
    await assertCurrentIdentity(tx, flow);
    const invitation = await readInvitation(tx, flow);
    if (invitation?.role === 'TEACHER')
      await acceptExistingInvitation(tx, flow, userId);
    else if (invitation?.role === 'STUDENT') {
      const next = await prepareInvitation(tx, flow, request);
      if (next && !(next instanceof Response) && next.variant === 'multiple') {
        return Response.json(stateFor(flow, next), {
          headers: await authenticationHeaders(tx, request, user, issueSession),
        });
      }
      selectedMembershipId = await acceptStudentInvitation(tx, flow, userId);
    }
    memberships = await tx.orgMembership.findMany({
      where: { userId, isActive: true },
      include: { organization: { select: { name: true, plan: true } } },
      orderBy: { id: 'asc' },
    });
  }
  // A forced password change must complete before a class is joined.
  if (!user.mustChangePassword && flow.data.classId && flow.data.classCode) {
    const target = await tx.class.findUnique({
      where: { id: flow.data.classId },
      select: { school: { select: { organizationId: true } } },
    });
    const source =
      memberships.find(
        (m) =>
          m.role === 'STUDENT' &&
          !m.isOrgOwner &&
          m.organizationId === target?.school.organizationId
      ) ?? memberships.find((m) => m.role === 'STUDENT' && !m.isOrgOwner);
    const enrollment = source
      ? await enrollExistingStudentByCode({
          userId,
          sourceMembershipId: source.id,
          sourceOrganizationId: source.organizationId,
          code: flow.data.classCode,
          classId: flow.data.classId,
          client: tx,
        })
      : await enrollUnassignedStudentByCode(tx, {
          userId,
          code: flow.data.classCode,
          classId: flow.data.classId,
        });
    if (!enrollment.ok) throw new FlowError(enrollment.error);
    selectedMembershipId = enrollment.membershipId;
    // Class context is consumed only by the existing enrollment operation.
    flow.data.classId = undefined;
    flow.data.classCode = undefined;
    memberships = await tx.orgMembership.findMany({
      where: { userId, isActive: true },
      include: { organization: { select: { name: true, plan: true } } },
      orderBy: { id: 'asc' },
    });
  }
  let trialDestination: string | null = null;
  if (!user.mustChangePassword && memberships.length) {
    const application = await loadFreeTierGateApplication(userId);
    try {
      await enforceFreeTierTeacherGate({
        userId,
        pathname: flow.data.destination,
        application,
      });
    } catch (response) {
      if (!(response instanceof Response) || !response.headers.get('Location'))
        throw response;
      trialDestination = response.headers.get('Location');
    }
  }
  const destination = postAuthenticationDestination({
    mustChangePassword: user.mustChangePassword,
    activeMemberships: membershipChosen ? 1 : memberships.length,
    trialDestination,
    redirectTo: flow.data.destination,
  });
  const headers = await authenticationHeaders(tx, request, user, issueSession);
  if (destination === 'inactive') {
    const anyStaff = await tx.orgMembership.findFirst({
      where: { userId, role: 'TEACHER' },
      select: { id: true },
    });
    return Response.json(
      stateFor(flow, {
        screen: 'inactive',
        variant: anyStaff ? 'staff' : 'student',
        identifier: flow.data.identifier,
      }),
      { headers }
    );
  }
  if (destination === 'membership')
    return Response.json(
      stateFor(flow, {
        screen: 'membership',
        memberships: memberships.map((m) => ({
          id: m.id,
          organization: m.organization.name,
          role: m.isOrgOwner
            ? 'School admin'
            : m.role === 'TEACHER'
              ? 'Teacher'
              : 'Student',
        })),
      }),
      { headers }
    );
  const membershipId =
    selectedMembershipId ||
    (memberships.length === 1 ? memberships[0].id : undefined);
  if (membershipId)
    headers.append('set-cookie', await setMembershipId(membershipId));
  if (destination !== '/auth/required-password-change')
    flow.data.completed = true;
  return redirect(destination, { headers });
}
