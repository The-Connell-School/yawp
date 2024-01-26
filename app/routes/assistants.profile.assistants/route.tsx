import {
	type FieldConfig,
	conform,
	useFieldList,
	useFieldset,
	useForm,
} from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { type AssistantConfiguration } from '@prisma/client'
import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	isRouteErrorResponse,
	useActionData,
	useLoaderData,
	useRouteError,
} from '@remix-run/react'
import { useRef } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms/error-list'
import { FormInput } from '#app/components/forms/form-input'
import { FormTextarea } from '#app/components/forms/form-textarea'
import { Button, button } from '#app/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table'
import { openai } from '#app/services/openai'
import { validateCSRF } from '#app/utils/csrf.server'
import { prisma } from '#app/utils/db.server'
import { requireUserWithRole } from '#app/utils/permissions'
import { pick } from '#app/utils/pick'
import { type BreadcrumbHandle } from '../assistants.profile/route'

export const handle: BreadcrumbHandle = {
	breadcrumb: (
		<Link
			to="/assistants/profile/assistants"
			className={button({ variant: 'ghost', size: 'sm' })}
		>
			<svg
				width="18"
				height="54"
				viewBox="0 0 32 32"
				xmlns="http://www.w3.org/2000/svg"
				className="mr-2"
			>
				<path fill="currentColor" d="M18 10h2v2h-2zm-6 0h2v2h-2z" />
				<path
					fill="currentColor"
					d="M26 20h-5v-2h1a2.002 2.002 0 0 0 2-2v-4h2v-2h-2V8a2.002 2.002 0 0 0-2-2h-2V2h-2v4h-4V2h-2v4h-2a2.002 2.002 0 0 0-2 2v2H6v2h2v4a2.002 2.002 0 0 0 2 2h1v2H6a2.002 2.002 0 0 0-2 2v8h2v-8h20v8h2v-8a2.002 2.002 0 0 0-2-2M10 8h12v8H10Zm3 10h6v2h-6Z"
				/>
			</svg>{' '}
			Assistants
		</Link>
	),
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const [assistants, configurations] = await Promise.all([
		openai.beta.assistants.list(),
		prisma.assistantConfiguration.findMany(),
	])

	const data = assistants.data.reduce(
		(acc, assistant) => {
			const config = configurations.find(c => c.assistantId === assistant.id)

			acc.push({
				id: assistant.id,
				name: assistant.name ?? 'Unknown',
				pin: config ? config.pin : assistant.id.slice(-4),
				...pick(config, ['actionText', 'description']),
			})

			return acc
		},
		[] as ({ name: string; id: string } & Pick<
			AssistantConfiguration,
			'pin' | 'actionText' | 'description'
		>)[],
	)

	return json({ data })
}

const AssistantSchema = z.object({
	pin: z.string().min(4),
	id: z.string(),
	actionText: z.string().optional(),
	description: z.string().optional(),
})
const ManageAssistantsSchema = z.object({
	assistants: z.array(AssistantSchema),
})

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const submission = parse(formData, { schema: ManageAssistantsSchema })

	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	await Promise.all(
		submission.value.assistants.map(({ id, ...fields }) =>
			prisma.assistantConfiguration.upsert({
				where: { assistantId: id },
				create: { ...fields, assistantId: id },
				update: { ...fields },
			}),
		),
	)

	return null
}

export default function Route() {
	const { data } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()

	const [form, { assistants }] = useForm({
		id: 'manage-assistants-form',
		lastSubmission: actionData?.submission,
		constraint: getFieldsetConstraint(ManageAssistantsSchema),
		defaultValue: { assistants: data },
	})

	const assistantsList = useFieldList(form.ref, assistants)

	return (
		<div>
			<h2>Manage Assistants</h2>
			<p className="mt-2">
				You can set a password for each assistant. A password is required.{' '}
				<br />
				The default password is the last 4 characters of the assistant's{' '}
				<code>id</code>.
			</p>
			<div className="mt-5">
				<Form method="POST" {...form.props}>
					<AuthenticityTokenInput />
					<div className="rounded-lg border">
						<Table>
							<TableHeader className="border-b">
								<TableHead>Id</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Password</TableHead>
								<TableHead className="min-w-[135px]">Action Text</TableHead>
								<TableHead className="min-w-[135px]">Description</TableHead>
							</TableHeader>
							<TableBody>
								{assistantsList.map(a => (
									<TableRow key={a.key}>
										<TableCell className="align-top">
											{a.defaultValue.id}
										</TableCell>
										<TableCell className="align-top">
											{a.defaultValue.name}
										</TableCell>
										<TableCell className="align-top">
											<AssistantPinRow assistant={a} />
										</TableCell>
										<TableCell className="align-top">
											<AssistantActionTextRow assistant={a} />
										</TableCell>
										<TableCell className="align-top">
											<AssistantDescriptionRow assistant={a} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<ErrorList id={form.errorId} errors={form.errors} />
					<div className="mt-5 flex gap-2">
						<Button type="submit">Save changes</Button>
						<Button variant="secondary">Cancel</Button>
					</div>
				</Form>
			</div>
		</div>
	)
}

type Props = {
	assistant: FieldConfig<z.infer<typeof AssistantSchema>>
}

export const AssistantPinRow = ({ assistant }: Props) => {
	const ref = useRef<HTMLFieldSetElement>(null)
	const { pin, id } = useFieldset(ref, assistant)

	return (
		<fieldset ref={ref}>
			<input type="hidden" {...conform.input(id)} />
			<FormInput
				labelProps={{ className: 'hidden' }}
				inputProps={{
					size: 'sm',
					required: true,
					placeholder: 'Password',
					...conform.input(pin),
				}}
			/>
		</fieldset>
	)
}

export const AssistantActionTextRow = ({ assistant }: Props) => {
	const ref = useRef<HTMLFieldSetElement>(null)
	const { actionText } = useFieldset(ref, assistant)

	return (
		<fieldset ref={ref}>
			<FormInput
				labelProps={{ className: 'hidden' }}
				inputProps={{
					size: 'sm',
					placeholder: 'Get started',
					...conform.input(actionText),
				}}
			/>
		</fieldset>
	)
}
export const AssistantDescriptionRow = ({ assistant }: Props) => {
	const ref = useRef<HTMLFieldSetElement>(null)
	const { description } = useFieldset(ref, assistant)

	return (
		<fieldset ref={ref}>
			<FormTextarea
				labelProps={{ className: 'hidden' }}
				textareaProps={{
					size: 'sm',
					placeholder: 'Description',
					...conform.input(description),
				}}
			/>
		</fieldset>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()

	if (isRouteErrorResponse(error)) {
		return (
			<div>
				<h1>
					{error.status} {error.statusText}
				</h1>
				<p>{error.data}</p>
			</div>
		)
	} else if (error instanceof Error) {
		return (
			<div>
				<h1>Error</h1>
				<p>{error.message}</p>
				<p>The stack trace is:</p>
				<pre>{error.stack}</pre>
			</div>
		)
	} else {
		return <h1>Unknown Error</h1>
	}
}
