import { json, redirect } from '@remix-run/node'
import { prisma } from '#app/utils/db.server'
import { redirectWithToast } from '#app/utils/toast.server'
import { verifySessionStorage } from '#app/utils/verification.server'
import { type VerifyFunctionArgs } from './verify.server'

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
		return json(submission.reply({ fieldErrors: { code: ['Invalid code'] } }), {
			status: 400,
		})
	}

	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(resetPasswordEmailSessionKey, user.email)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}
