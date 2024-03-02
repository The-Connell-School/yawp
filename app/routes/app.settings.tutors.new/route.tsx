import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod as parse } from '@conform-to/zod'
import { type Tutor, type Upload } from '@prisma/client'
import { type ActionFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input'
import { FormTextarea } from '#app/components/forms/form-textarea'
import { TrashIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { toArray, useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'

const StringItem = z
	.union([z.string().optional(), z.array(z.string().optional())])
	.optional()
export const Schema = z.object({
	id: z.string().optional(),
	name: z.string(),
	promptInstructions: z.string().optional(),
	answerInstructions: z.string().optional(),
	files_blob: StringItem,
	files_name: StringItem,
	files_contentType: StringItem,
})
export type Schema = z.infer<typeof Schema>

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const submission = parse(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const fileBlobs = toArray(submission.value.files_blob)
	const fileNames = toArray(submission.value.files_name)
	const fileContentTypes = toArray(submission.value.files_contentType)

	const files = fileBlobs?.reduce((acc, blob, i) => {
		const fileName = fileNames[i]
		const fileContentType = fileContentTypes[i]

		if (!fileName || !fileContentType || !blob) {
			return acc
		}

		acc.push({
			blob: Buffer.from(blob),
			name: fileName,
			contentType: fileContentType,
			userId: user.id,
		} as Upload)
		return acc
	}, [] as Upload[])

	const created = await prisma.tutor.create({
		data: {
			name: submission.value.name,
			answerInstructions: submission.value.answerInstructions,
			promptInstructions: submission.value.promptInstructions,
			files: { create: files },
		},
	})

	return redirectWithToast(`/app/settings/tutors/${created.id}`, {
		type: 'success',
		description: 'Tutor created successfully',
		closeButton: false,
	})
}

export default function Route({
	isEditing = false,
	defaultValue = { instructions: '', id: '', name: '', files: [] } as any,
}: {
	isEditing?: boolean
	defaultValue?: Tutor & { files: Upload[] }
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()

	const [form, fields] = useForm({
		id: isEditing ? `edit-module-${defaultValue.id}` : 'new-module',
		lastResult: actionData,
		constraint: getZodConstraint(Schema),
		defaultValue,
	})

	// const {
	// 	fields: fileFields,
	// 	append,
	// 	remove,
	// } = useFieldArray(fields.files, ['name', 'blob', 'contentType'])

	return (
		<Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-full max-h-[calc(100vh-70px)] flex-col justify-start gap-4 overflow-y-scroll p-4"
		>
			<FormInput
				inputProps={{
					...getInputProps(fields.name, { type: 'text' }),
					placeholder: 'New Tutor',
					required: true,
				}}
				labelProps={{ children: 'Name' }}
				errors={fields.name.errors}
			/>
			<FormTextarea
				textareaProps={{
					...getInputProps(fields.promptInstructions, { type: 'text' }),
					placeholder: 'You are a helpful tutor.',
				}}
				labelProps={{
					children: 'Prompt Instructions',
					info: 'Additional instructions included in every Instruction which uses AI to prompt the user.',
				}}
				errors={fields.promptInstructions.errors}
			/>
			<FormTextarea
				textareaProps={{
					...getInputProps(fields.answerInstructions, { type: 'text' }),
					placeholder: 'Your response should be encouraging.',
				}}
				labelProps={{
					children: 'Answer Instructions',
					info: 'Additional instructions to be sent when determining the response / answer check for every instruction.',
				}}
				errors={fields.answerInstructions.errors}
			/>
			{/* <div className="flex flex-col gap-1">
				<div className="flex items-center gap-1">
					<label>Files</label>
					<Tooltip text="Upload files for the tutor to learn from. This will help add context to any prompts by the tutor and any requests from the student.">
						<InfoCircledIcon />
					</Tooltip>
				</div>
				<div className="flex flex-col gap-1">
					{fileFields.map((file, i) => (
						<FilesInput
							index={i}
							onDelete={() => remove(i)}
							key={v4()}
							file={file}
						/>
					))}
					<Button
						variant="outline"
						onClick={e => {
							e.preventDefault()
							append({
								name: '',
								contentType: '',
								id: '',
								createdAt: new Date(),
								updatedAt: new Date(),
								deletedAt: null,
								userId: '',
								tutorId: '',
								blob: '' as any,
							})
						}}
					>
						Add file
					</Button>
				</div>
			</div> */}
			<div className="flex gap-2">
				<Button type="submit" disabled={isPending} className="max-w-fit">
					{isEditing ? 'Update' : 'Create'}
				</Button>
				{isEditing ? (
					<Button
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: 'delete',
						})}
						disabled={isPending}
						size={dc.doubleCheck ? 'default' : 'icon'}
						variant={dc.doubleCheck ? 'destructive' : 'secondary'}
					>
						{dc.doubleCheck ? (
							'Are you sure?'
						) : (
							<TrashIcon className="h-5 w-5" />
						)}
					</Button>
				) : null}
			</div>
		</Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
