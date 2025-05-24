import { redirect } from 'react-router'
import { redirectWithToast } from '~/utils/toast.server'
import { verifySessionStorage } from '~/utils/verification.server'
import { type VerifyFunctionArgs } from '../auth.verify/utils.server'

export const onboardingEmailSessionKey = 'teacherOnboardingEmail'

export async function handleVerification({ submission }: VerifyFunctionArgs) {
	if (submission.status !== 'success') {
		throw await redirectWithToast('/login', {
			type: 'error',
			title: 'Invalid submission',
			description: 'Submission was not successful. Please try again.',
		})
	}

	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(onboardingEmailSessionKey, submission.value.target)
	return redirect('/teacher-onboarding', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}
