import { redirect } from 'react-router';
import { redirectWithToast } from '~/utils/toast.server';
import { verifySessionStorage } from '~/utils/verification.server';
import { prisma } from '~/utils/db.server';
import { addUserToOrganization } from '~/utils/auth.server';
import { type VerifyFunctionArgs } from './utils';

export const onboardingTeacherEmailKey = 'onboardingTeacherEmail';
export const onboardingTeacherOrganizationIdKey =
  'onboardingTeacherOrganizationId';
export const onboardingStudentEmailKey = 'onboardingStudentEmail';
export const onboardingStudentOrganizationIdKey =
  'onboardingStudentOrganizationId';
export const onboardingOwnerEmailKey = 'onboardingOwnerEmail';
export const onboardingOwnerOrganizationIdKey =
  'onboardingOwnerOrganizationId';

export async function handleVerification({
  submission,
  verification,
}: VerifyFunctionArgs) {
  if (submission.status !== 'success' || !verification) {
    throw await redirectWithToast('/auth/login', {
      type: 'error',
      title: 'Invalid submission',
      description: 'Submission was not successful. Please try again.',
    });
  }

  const { target: email, type, organizationId } = verification;
  
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      userRoles: {
        where: { organizationId },
      },
    },
  });

  // If user exists and already has a role in this organization, redirect to login
  if (existingUser && existingUser.userRoles.length > 0) {
    throw await redirectWithToast('/auth/login', {
      type: 'info',
      title: 'Already a member',
      description: 'You are already a member of this organization. Please log in.',
    });
  }

  // If user exists but doesn't have a role in this organization, add them
  if (existingUser) {
    try {
      const roleConfig = getRoleConfig(type);
      await addUserToOrganization({
        userId: existingUser.id,
        organizationId,
        ...roleConfig,
      });

      throw await redirectWithToast('/auth/login', {
        type: 'success',
        title: 'Added to organization',
        description: 'You have been added to the organization. Please log in to continue.',
      });
    } catch (error) {
      throw await redirectWithToast('/auth/login', {
        type: 'error',
        title: 'Error adding to organization',
        description: 'There was an error adding you to the organization. Please try again.',
      });
    }
  }

  // User doesn't exist, proceed with normal onboarding flow
  const verifySession = await verifySessionStorage.getSession();

  if (type === 'organization-teacher-invite') {
    verifySession.set(onboardingTeacherEmailKey, email);
    verifySession.set(onboardingTeacherOrganizationIdKey, organizationId);
    return redirect('/auth/organization-teacher-onboarding', {
      headers: {
        'set-cookie': await verifySessionStorage.commitSession(verifySession),
      },
    });
  }

  if (type === 'organization-student-invite') {
    verifySession.set(onboardingStudentEmailKey, email);
    verifySession.set(onboardingStudentOrganizationIdKey, organizationId);
    return redirect('/auth/organization-student-onboarding', {
      headers: {
        'set-cookie': await verifySessionStorage.commitSession(verifySession),
      },
    });
  }

  if (type === 'organization-owner-invite') {
    verifySession.set(onboardingOwnerEmailKey, email);
    verifySession.set(onboardingOwnerOrganizationIdKey, organizationId);
    return redirect('/auth/organization-owner-onboarding', {
      headers: {
        'set-cookie': await verifySessionStorage.commitSession(verifySession),
      },
    });
  }

  // Fallback - shouldn't happen but handle gracefully
  throw await redirectWithToast('/auth/login', {
    type: 'error',
    title: 'Invalid user profile',
    description: 'User does not have a valid profile type.',
  });
}

function getRoleConfig(inviteType: string) {
  switch (inviteType) {
    case 'organization-teacher-invite':
      return {
        createTeacherProfile: true,
        createStudentProfile: true, // Teachers can also be students
      };
    case 'organization-student-invite':
      return {
        createStudentProfile: true,
      };
    case 'organization-owner-invite':
      return {
        isOwner: true,
        createStudentProfile: true,
      };
    default:
      return {};
  }
}
