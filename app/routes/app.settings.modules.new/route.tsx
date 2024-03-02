import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod as parse } from '@conform-to/zod'
import { type Instruction, type Module_ } from '@prisma/client'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { v4 } from 'uuid'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormCheckbox } from '#app/components/forms/form-checkbox'
import { FormInput } from '#app/components/forms/form-input'
import { FormTextarea } from '#app/components/forms/form-textarea'
import { InfoCircledIcon, TrashIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { useFieldArray } from '#app/hooks/useFieldArray'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { InstructionInput } from './instruction-input'
import { TutorInput } from './tutor-input'

const StringItem = z
	.union([z.string().optional(), z.array(z.string().optional())])
	.optional()
export const Schema = z.object({
	title: z.string(),
	tutorId: z.string().optional(),
	position: z.number(),
	description: z.string().optional(),
	copyContentFromPrevious: z.string().optional(),
	instructions_answerKey: StringItem,
	instructions_answerType: StringItem,
	instructions_answerTypeOptions: StringItem,
	instructions_prompt: StringItem,
	instructions_promptType: StringItem,
	instructions: z.array(
		z.object({
			answerKey: z.string(),
			answerType: z.string(),
			answerTypeOptions: z.string(),
			prompt: z.string(),
			promptType: z.string(),
			position: z.number(),
			id: z.string().optional(),
		}),
	),
})
export type Schema = z.infer<typeof Schema>

export const toArray = (value: string | (string | undefined)[] | undefined) => {
	if (Array.isArray(value)) {
		return value
	}
	if (value) {
		return [value]
	}
	return []
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
	await requireUserWithRole(request, ['admin'])
	const tutors = await prisma.tutor.findMany({
		select: { id: true, name: true },
	})

	return json({ tutors })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const submission = parse(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const prompts = toArray(submission.value.instructions_prompt)
	const promptTypes = toArray(submission.value.instructions_promptType)
	const answerKeys = toArray(submission.value.instructions_answerKey)
	const answerTypes = toArray(submission.value.instructions_answerType)
	const answerTypesOptions = toArray(
		submission.value.instructions_answerTypeOptions,
	)

	const instructions = prompts?.reduce(
		(acc, prompt, i) => {
			const answerKey = answerKeys[i]
			const answerType = answerTypes[i] || 'textarea'
			const answerTypeOptions = answerTypesOptions[i]
			const promptType = promptTypes[i]

			if (!prompt || !answerKey || !answerType || !promptType) {
				return acc
			}

			acc.push({
				answerKey,
				answerType,
				prompt,
				promptType,
				position: i,
				answerTypeOptions,
			})
			return acc
		},
		[] as {
			prompt: string
			answerKey: string
			answerType: string
			answerTypeOptions?: string
			promptType: string
			position: number
		}[],
	)

	const created = await prisma.module_.create({
		data: {
			title: submission.value.title,
			position: submission.value.position,
			description: submission.value.description,
			tutorId: submission.value.tutorId,
			copyContentFromPrevious:
				submission.value.copyContentFromPrevious === 'true',
			instructions: { create: instructions },
		},
	})

	return redirectWithToast(`/app/settings/modules/${created.id}`, {
		type: 'success',
		description: 'Module created successfully',
		closeButton: false,
	})
}

export default function Route({
	isEditing = false,
	defaultValue = { instructions: [], id: '' } as any,
}: {
	isEditing?: boolean
	defaultValue?: Module_ & { instructions: Instruction[] }
}) {
	const { tutors } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()

	const [form, fields] = useForm({
		id: isEditing ? `edit-module-${defaultValue.id}` : 'new-module',
		lastResult: actionData,
		constraint: getZodConstraint(Schema),
		defaultValue,
	})

	const {
		fields: instructionFields,
		append,
		remove,
		reset,
		setValues,
	} = useFieldArray(fields.instructions, [
		'answerKey',
		'answerType',
		'answerTypeOptions',
		'prompt',
		'promptType',
		'position',
	])

	return (
		<Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-full max-h-[calc(100vh-70px)] flex-col justify-start gap-4 overflow-y-scroll p-4"
		>
			<div className="flex gap-4">
				<FormInput
					inputProps={{
						...getInputProps(fields.title, { type: 'text' }),
						placeholder: 'New Module',
						required: true,
					}}
					labelProps={{ children: 'Title' }}
					errors={fields.title.errors}
					className="flex-grow"
				/>
				<FormInput
					inputProps={{
						...getInputProps(fields.position, { type: 'number' }),
						placeholder: '1',
						required: true,
						min: 0,
					}}
					labelProps={{
						children: 'Position',
						info: 'Determines the order in which this module falls in relation to all the others.',
					}}
					errors={fields.position.errors}
				/>
			</div>
			<FormTextarea
				textareaProps={{
					...getInputProps(fields.description, { type: 'text' }),
					placeholder: 'Description',
				}}
				labelProps={{ children: 'Description' }}
				errors={fields.description.errors}
			/>
			<div className="grid gap-1">
				<div>
					<label htmlFor={fields.tutorId.id}>Tutor</label>
					<p className="text-sm text-muted-foreground">
						The tutor instructions will be sent on every answer check and AI
						prompt creation.
					</p>
				</div>
				<TutorInput
					tutors={tutors ?? []}
					inputProps={{
						...getInputProps(fields.tutorId, { type: 'hidden' }),
						defaultValue: fields.tutorId.initialValue,
					}}
				/>
			</div>
			<FormCheckbox
				field={fields.copyContentFromPrevious}
				buttonProps={{ required: false }}
				labelProps={{
					children: (
						<span className="flex items-center gap-2">
							Should copy content from previous module{' '}
							<Tooltip
								text={
									<span>
										When enabled, the content from the previous <br />
										module will be copied into this one.
									</span>
								}
							>
								<InfoCircledIcon />
							</Tooltip>
						</span>
					),
				}}
				errors={fields.copyContentFromPrevious.errors}
			/>
			<div className="flex flex-col gap-1">
				<label>Instructions</label>
				<p className="text-sm text-muted-foreground">
					Instructions are the building block of a module. Instructions are
					presented sequentially to the student in order to perform a specified
					task.
				</p>
				<div className="flex flex-col gap-1">
					{instructionFields.map((instruction, i) => (
						<InstructionInput
							key={v4()}
							instruction={instruction}
							onDelete={() => remove(i)}
							onCancel={prev => reset(i, prev as any)}
							onSave={setValues}
							index={i}
						/>
					))}
					<Button
						variant="outline"
						onClick={e => {
							e.preventDefault()
							append({
								answerKey: '',
								answerType: 'textarea',
								answerTypeOptions: '',
								updatedAt: new Date(),
								createdAt: new Date(),
								id: '',
								moduleId: '',
								prompt: '',
								promptType: 'hardcoded',
								position: (instructionFields.at(-1)?.position ?? 0) + 1,
								hasAnswerKey: false,
								concludingPrompt: '',
								concludingPromptType: 'hardcoded',
							})
						}}
					>
						Add instruction
					</Button>
				</div>
			</div>
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
