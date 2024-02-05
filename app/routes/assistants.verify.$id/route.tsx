import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	json,
	redirect,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useParams } from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ErrorList } from '#app/components/forms/error-list'
import { FormInput } from '#app/components/forms/form-input'
import { Button } from '#app/components/ui/button'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { useIsPending } from '#app/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariantResponse(params.id, 'Missing assistant id')
	const userId = await requireUserId(request)
	const metadata = await prisma.assistantMetadata.findFirst({
		where: { assistantId: params.id, userId },
		select: { isVerified: true },
	})

	if (metadata?.isVerified) {
		return redirect(`/assistants/${params.id}`)
	}

	try {
		await openai.beta.assistants.retrieve(params.id)
		return json({ metadata })
	} catch {
		return redirect('/assistants')
	}
}

const Schema = z.object({ password: z.string(), assistantId: z.string() })

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = await parse(formData, {
		schema: Schema.superRefine(async ({ assistantId, password }, ctx) => {
			const configuration = await prisma.assistantConfiguration.findUnique({
				where: { assistantId },
				select: { pin: true },
			})

			if (configuration) {
				if (configuration.pin !== password) {
					return ctx.addIssue({
						path: ['password'],
						code: 'custom',
						message: 'Invalid password',
					})
				}
			} else if (password !== assistantId.slice(-4)) {
				return ctx.addIssue({
					path: ['password'],
					code: 'custom',
					message: 'Invalid password',
				})
			}
		}),
		async: true,
	})

	submission.payload = {}
	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { assistantId } = submission.value
	const existing = await prisma.assistantMetadata.findFirst({
		where: { assistantId, userId },
		select: { id: true },
	})

	if (existing) {
		await prisma.assistantMetadata.update({
			where: { id: existing.id },
			data: { isVerified: true },
		})
	} else {
		await prisma.assistantMetadata.create({
			data: {
				assistantId,
				user: { connect: { id: userId } },
				isVerified: true,
			},
		})
	}

	return redirect(`/assistants/${assistantId}`)
}

export default function Route() {
	const params = useParams()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'assistant-password-form',
		lastResult: actionData,
		constraint: getFieldsetConstraint(Schema),
		defaultValue: { assistantId: params.id },
		onValidate: ({ formData }) => parse(formData, { schema: Schema }),
	})

	return (
		<main className="flex">
			<Form
				className="mx-auto flex min-h-screen max-w-[400px] flex-grow flex-col items-center justify-center gap-4 p-4"
				method="POST"
				{...getFormProps(form)}
			>
				<div className="grid gap-1">
					<h2 className="font-bold">Enter password</h2>
					<p className="text-muted-foreground">
						This assistant is password protected. Enter the pin provided by your
						workshop leader.
					</p>
				</div>
				<input {...getInputProps(fields.assistantId, { type: 'hidden' })} />
				<FormInput
					className="w-full"
					inputProps={{
						placeholder: 'Password',
						...getInputProps(fields.password, { type: 'password' }),
					}}
					errors={fields.password.errors}
				/>
				<ErrorList id={form.errorId} errors={form.errors} />
				<Button type="submit" className="w-full" isLoading={isPending}>
					Unlock
				</Button>
			</Form>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
