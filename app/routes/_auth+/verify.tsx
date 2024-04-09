import { getInputProps, useForm, getFormProps } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import { type ActionFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms/error-list.tsx'
import { FormInput } from '#app/components/forms/form-input.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { handleVerification as handleChangeEmailVerification } from '#app/routes/app.profile.change-email/route.tsx'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { handleVerification as handleLoginTwoFactorVerification } from './login.server'
import { handleVerification as handleOnboardingVerification } from './onboarding.server'
import { handleVerification as handleResetPasswordVerification } from './reset-password.server'
import { handleVerification as handleTeacherOnboardingVerification } from './teacher-onboarding.server.ts'
import { isCodeValid } from './verify.server.ts'
import {
	codeQueryParam,
	redirectToQueryParam,
	targetQueryParam,
	typeQueryParam,
	VerifySchema,
	VerificationTypeSchema,
	type VerificationTypes,
} from './verify_props'

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)
	return validateRequest(request, formData)
}

async function validateRequest(
	request: Request,
	body: URLSearchParams | FormData,
) {
	const submission = await parse(body, {
		schema: VerifySchema.superRefine(async (data, ctx) => {
			const codeIsValid = await isCodeValid({
				code: data[codeQueryParam],
				type: data[typeQueryParam],
				target: data[targetQueryParam],
			})
			if (!codeIsValid) {
				ctx.addIssue({
					path: ['code'],
					code: z.ZodIssueCode.custom,
					message: `Invalid code`,
				})
				return
			}
		}),
		async: true,
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	// this code path could be part of a loader (GET request), so we need to make
	// sure we're running on primary because we're about to make writes.
	await ensurePrimary()

	const { value: submissionValue } = submission

	async function deleteVerification() {
		await prisma.verification.delete({
			where: {
				target_type: {
					type: submissionValue[typeQueryParam],
					target: submissionValue[targetQueryParam],
				},
			},
		})
	}

	switch (submissionValue[typeQueryParam]) {
		case 'reset-password': {
			await deleteVerification()
			return handleResetPasswordVerification({ request, body, submission })
		}
		case 'onboarding': {
			await deleteVerification()
			return handleOnboardingVerification({ request, body, submission })
		}
		case 'change-email': {
			await deleteVerification()
			return handleChangeEmailVerification?.({ request, body, submission })
		}
		case '2fa': {
			return handleLoginTwoFactorVerification({ request, body, submission })
		}
		case 'teacher-onboarding': {
			await deleteVerification()
			return handleTeacherOnboardingVerification({ request, body, submission })
		}
	}
}

export default function VerifyRoute() {
	const [searchParams] = useSearchParams()
	const isPending = useIsPending()
	const actionData = useActionData<typeof action>()
	const parsedType = VerificationTypeSchema.safeParse(
		searchParams.get(typeQueryParam),
	)
	const type = parsedType.success ? parsedType.data : null

	const checkEmail = (
		<>
			<h1 className="text-h1">Check your email</h1>
			<p className="text-body-md mt-3 text-muted-foreground">
				We've sent you a code to verify your email address.
			</p>
		</>
	)

	const headings: Record<VerificationTypes, React.ReactNode> = {
		onboarding: checkEmail,
		'teacher-onboarding': checkEmail,
		'reset-password': checkEmail,
		'change-email': checkEmail,
		'2fa': (
			<>
				<h1 className="text-h1">Check your 2FA app</h1>
				<p className="text-body-md mt-3 text-muted-foreground">
					Please enter your 2FA code to verify your identity.
				</p>
			</>
		),
	}

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getFieldsetConstraint(VerifySchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parse(formData, { schema: VerifySchema })
		},
		defaultValue: {
			code: searchParams.get(codeQueryParam) ?? '',
			type,
			target: searchParams.get(targetQueryParam) ?? '',
			redirectTo: searchParams.get(redirectToQueryParam) ?? '',
		},
	})

	return (
		<main className="mx-auto w-full max-w-[400px] pt-20">
			<div className="flex flex-col gap-3">
				<p>{type ? headings[type] : 'Invalid Verification Type'}</p>
				<div className="mt-12 flex flex-col justify-center gap-1">
					<div>
						<ErrorList errors={form.errors} id={form.errorId} />
					</div>
					<div className="flex w-full gap-2 px-8">
						<Form method="POST" {...getFormProps(form)} className="flex-1">
							<AuthenticityTokenInput />
							<HoneypotInputs />
							<FormInput
								labelProps={{
									htmlFor: fields[codeQueryParam].id,
									children: 'Code',
								}}
								inputProps={{
									...getInputProps(fields[codeQueryParam], { type: 'text' }),
									autoComplete: 'one-time-code',
								}}
								errors={fields[codeQueryParam].errors}
							/>
							<input
								{...getInputProps(fields[typeQueryParam], { type: 'hidden' })}
							/>
							<input
								{...getInputProps(fields[targetQueryParam], { type: 'hidden' })}
							/>
							<input
								{...getInputProps(fields[redirectToQueryParam], {
									type: 'hidden',
								})}
							/>
							<Button
								className="mt-2 w-full"
								type="submit"
								disabled={isPending}
							>
								Submit
							</Button>
						</Form>
					</div>
				</div>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
