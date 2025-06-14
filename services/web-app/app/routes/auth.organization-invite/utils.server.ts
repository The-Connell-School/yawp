import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { verifySessionStorage } from '~/utils/verification.server';
import { type VerifyFunctionArgs } from '../auth.verify/utils';

export const onboardingEmailSessionKey = 'organizationInviteEmail';

export async function handleVerification({ submission }: VerifyFunctionArgs) {
  if (submission.status !== 'success') {
    throw await redirectWithToast('/auth/login', {
      type: 'error',
      title: 'Invalid submission',
      description: 'Submission was not successful. Please try again.',
    });
  }

  const email = submission.value.target;
  
  // Find the user to determine their profile type
  const user = await prisma.user.findUnique({
    where: { email },
    select: { 
      email: true,
      teacherProfile: true,
      studentProfile: true,
    },
  });

  if (!user) {
    throw await redirectWithToast('/auth/login', {
      type: 'error',
      title: 'User not found',
      description: 'No user found with this email address.',
    });
  }

  const verifySession = await verifySessionStorage.getSession();
  
  // If user has teacher profile (prioritize teacher over student)
  if (user.teacherProfile) {
    verifySession.set('teacherOnboardingEmail', email);
    return redirect('/auth/teacher-onboarding', {
      headers: {
        'set-cookie': await verifySessionStorage.commitSession(verifySession),
      },
    });
  }
  
  // If user has student profile only
  if (user.studentProfile) {
    verifySession.set('onboardingEmail', email);
    return redirect('/auth/onboarding', {
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