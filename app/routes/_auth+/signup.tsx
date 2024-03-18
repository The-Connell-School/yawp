import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import * as E from '@react-email/components'
import {
	json,
	redirect,
	type MetaFunction,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useActionData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms/error-list.tsx'
import { FormInput } from '#app/components/forms/form-input.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { EmailSchema } from '#app/utils/schemas/user.ts'
import { prepareVerification } from './verify.server.ts'

const SignupSchema = z.object({
	email: EmailSchema,
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()

	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = await parse(formData, {
		schema: SignupSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
				select: { id: true },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this email',
				})
				return
			}
		}),
		async: true,
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { email } = submission.value
	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'onboarding',
		target: email,
	})

	const response = await sendEmail({
		to: email,
		subject: `Welcome to Yawp!`,
		react: <SignupEmail onboardingUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		return redirect(redirectTo.toString())
	} else {
		return json(submission.reply({ formErrors: [response.error.message] }), {
			status: 500,
		})
	}
}

export function SignupEmail({
	onboardingUrl,
	otp,
}: {
	onboardingUrl: string
	otp: string
}) {
	return (
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
				<E.Link href={onboardingUrl}>{onboardingUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Sign Up | Yawp!' }]
}

export default function SignupRoute() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'signup-form',
		constraint: getFieldsetConstraint(SignupSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			const result = parse(formData, { schema: SignupSchema })
			return result
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto w-full max-w-md pt-20">
			<div className="flex flex-col gap-3 text-center">
				<h1>Let's get started!</h1>
				<p className="text-body-md mt-3 text-muted-foreground">
					Please enter your email.
				</p>
			</div>
			<div className="mx-auto mt-16 min-w-full max-w-sm px-8 sm:min-w-[368px]">
				<Form
					method="POST"
					{...getFormProps(form)}
					className="flex flex-col gap-4"
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<FormInput
						labelProps={{
							htmlFor: fields.email.id,
							children: 'Email',
						}}
						inputProps={{
							...getInputProps(fields.email, { type: 'email' }),
							autoFocus: true,
							autoComplete: 'email',
						}}
						errors={fields.email.errors}
					/>
					<ErrorList errors={form.errors} id={form.errorId} />
					<Button className="w-full" type="submit" disabled={isPending}>
						Submit
					</Button>
					<Button variant="link" asChild className="mx-auto mt-2 w-full">
						<Link to="/login">Already have an account?</Link>
					</Button>
				</Form>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
