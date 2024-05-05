import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
} from '@remix-run/node'
import { useFetcher } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Button } from '#app/components/ui/button.tsx'
import { requireRecentVerification } from '#app/routes/_auth+/verify.server'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useDoubleCheck } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { twoFAVerificationType } from '../two-factor/route.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireRecentVerification(request)
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireRecentVerification(request)
	await validateCSRF(await request.formData(), request.headers)
	const userId = await requireUserId(request)
	await prisma.verification.delete({
		where: { target_type: { target: userId, type: twoFAVerificationType } },
	})
	return redirectWithToast('/app/profile/two-factor', {
		title: '2FA Disabled',
		description: 'Two factor authentication has been disabled.',
	})
}

export default function TwoFactorDisableRoute() {
	const disable2FAFetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()

	return (
		<div className="max-w-[400px= mx-auto">
			<disable2FAFetcher.Form method="POST">
				<AuthenticityTokenInput />
				<p className="mb-2">
					Disabling two factor authentication is not recommended. However, if
					you would like to do so, click below.
				</p>
				<Button
					variant={dc.doubleCheck ? 'destructive' : undefined}
					{...dc.getButtonProps({
						className: 'mx-auto',
						name: 'intent',
						value: 'disable',
						type: 'submit',
					})}
				>
					{dc.doubleCheck ? 'Are you sure?' : 'Disable 2FA'}
				</Button>
			</disable2FAFetcher.Form>
		</div>
	)
}
