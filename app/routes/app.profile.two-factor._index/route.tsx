import {
	type ActionFunctionArgs,
	json,
	redirect,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, useFetcher, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { Button, button } from '#app/components/ui/button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { twoFAVerificationType } from '../app.profile.two-factor/route.tsx'
import { twoFAVerifyVerificationType } from '../app.profile.two-factor.verify/route.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: { target_type: { type: twoFAVerificationType, target: userId } },
		select: { id: true },
	})
	return json({ is2FAEnabled: Boolean(verification) })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	await validateCSRF(await request.formData(), request.headers)
	const { otp: _otp, ...config } = generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
	}
	await prisma.verification.upsert({
		where: {
			target_type: { target: userId, type: twoFAVerifyVerificationType },
		},
		create: verificationData,
		update: verificationData,
	})
	return redirect('/app/profile/two-factor/verify')
}

export default function TwoFactorRoute() {
	const data = useLoaderData<typeof loader>()
	const enable2FAFetcher = useFetcher<typeof action>()

	return (
		<div className="flex flex-col gap-4">
			{data.is2FAEnabled ? (
				<>
					<p className="text-lg">You have enabled two-factor authentication.</p>
					<Link to="disable" className={button({ className: 'w-fit' })}>
						Disable 2FA
					</Link>
				</>
			) : (
				<>
					<p>You have not enabled two-factor authentication yet.</p>
					<p className="text-sm">
						Two factor authentication adds an extra layer of security to your
						account. You will need to enter a code from an authenticator app
						like{' '}
						<a className="underline" href="https://1password.com/">
							1Password
						</a>{' '}
						to log in.
					</p>
					<enable2FAFetcher.Form method="POST">
						<AuthenticityTokenInput />
						<Button
							type="submit"
							name="intent"
							value="enable"
							className="mx-auto"
						>
							Enable 2FA
						</Button>
					</enable2FAFetcher.Form>
				</>
			)}
		</div>
	)
}
