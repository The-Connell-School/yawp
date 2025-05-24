
import { data as dataResponse, redirect } from 'react-router'
import { prisma } from '~/utils/db.server'
import { redirectWithToast } from '~/utils/toast.server'
import { verifySessionStorage } from '~/utils/verification.server'
import { type VerifyFunctionArgs } from '../auth.verify/utils.server'

export const resetPasswordEmailSessionKey = 'resetPasswordEmail'

export async function handleVerification({ submission }: VerifyFunctionArgs) {
	if (submission.status !== 'success') {
		throw await redirectWithToast('/login', {
			type: 'error',
			title: 'Invalid submission',
			description: 'Submission was not successful. Please try again.',
		})
	}

	const target = submission.value.target
	const user = await prisma.user.findFirst({
		where: { email: target },
		select: { email: true },
	})

	if (!user) {
		return dataResponse(
			submission.reply({ fieldErrors: { code: ['Invalid code'] } }),
			{
				status: 400,
			},
		)
	}

	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(resetPasswordEmailSessionKey, user.email)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}
