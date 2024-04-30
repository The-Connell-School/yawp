import * as E from '@react-email/components'
import {
	redirect,
	type MetaFunction,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Link } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input-2'
import { Button } from '#app/components/ui/button'
import { useTheme } from '#app/routes/api+/preferences+/theme/route.js'
import { validateCSRF } from '#app/utils/csrf.server'
import { prisma } from '#app/utils/db.server'
import { sendEmail } from '#app/utils/email.server'
import { checkHoneypot } from '#app/utils/honeypot.server'
import { useIsPending } from '#app/utils/misc'
import { EmailSchema } from '#app/utils/schemas/user'
import { prepareVerification } from '../verify.server'

const Schema = z.object({ email: EmailSchema })
const validator = withZod(Schema)

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const existingUser = await prisma.user.findUnique({
		where: { email: data.email },
		select: { id: true },
	})

	if (existingUser) {
		return validationError(
			{ fieldErrors: { email: 'An account with this email already exists.' } },
			data,
		)
	}

	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'onboarding',
		target: data.email,
	})

	const response = await sendEmail({
		to: data.email,
		subject: `Welcome to Yawp!`,
		react: (
			<E.Html lang="en" dir="ltr">
				<E.Container>
					<h1>
						<E.Text>Welcome to Yawp!</E.Text>
					</h1>
					<p>
						<E.Text>
							Here's your verification code: <strong>{otp}</strong>
						</E.Text>
					</p>
					<p>
						<E.Text>Or click the link to get started:</E.Text>
					</p>
					<E.Link href={verifyUrl.toString()}>{verifyUrl.toString()}</E.Link>
				</E.Container>
			</E.Html>
		),
	})

	if (response.status === 'success') {
		return redirect(redirectTo.toString())
	} else {
		return validationError(
			{ fieldErrors: { email: 'Failed to send email. Please try again.' } },
			data,
		)
	}
}

export default function SignupRoute() {
	const isPending = useIsPending()
	const theme = useTheme()

	return (
		<div className="mx-auto w-full max-w-md">
			<div className="mt-8 flex flex-col gap-3 text-center">
				<img
					src={
						theme === 'dark'
							? '/img/logo_for_dark_mode.png'
							: '/img/logo_for_light_mode.png'
					}
					alt="Logo on white background"
					className="mx-auto mb-8 h-auto w-48 rounded object-cover sm:w-52"
				/>
				<h1>Welcome!</h1>
				<p>Please enter your email.</p>
			</div>
			<div className="mx-auto mt-10 w-full max-w-md px-8">
				<ValidatedForm
					method="POST"
					className="flex flex-col gap-4"
					validator={validator}
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<FormInput type="email" name="email" autoFocus />
					<Button className="w-full" type="submit" disabled={isPending}>
						Submit
					</Button>
					<Button variant="link" asChild className="mx-auto mt-2 w-full">
						<Link to="/login">Already have an account?</Link>
					</Button>
				</ValidatedForm>
			</div>
		</div>
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Sign Up | Yawp!' }]
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
