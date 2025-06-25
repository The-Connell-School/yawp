import { redirect } from 'react-router';
import { redirectWithToast } from '~/utils/toast.server';
import { verifySessionStorage } from '~/utils/verification.server';
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
