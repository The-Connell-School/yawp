import { ValidatedForm, useField, useFieldArray } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormSearchSelect } from '#app/components/forms/form-search-select'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { Button } from '#app/components/ui/button'
import { type Schema, validator } from '../form/schema'
import { Instruction, type InstructionSchema } from '../form-instruction'

interface Props {
	formId: string
	defaultValues?: z.infer<typeof Schema>
	tutors: { id: string; name: string }[]
}

export const ModuleForm = ({ defaultValues, tutors, formId }: Props) => {
	const { error } = useField('instructions', { formId })
	const [instructions, { push, remove }] = useFieldArray<
		z.infer<typeof InstructionSchema>
	>('instructions', { formId })

	return (
		<ValidatedForm
			id={formId}
			validator={validator}
			defaultValues={defaultValues}
			method="POST"
			className="flex flex-col gap-4"
		>
			<div className="flex gap-4">
				<FormInput name="title" placeholder="Title" className="flex-grow" />
				<FormInput
					name="position"
					type="number"
					placeholder="1"
					min={0}
					labelInfo="Determines the order in which this module falls in relation to all the others."
				/>
			</div>
			<FormTextarea name="description" placeholder="Description" />
			<FormSearchSelect
				name="tutorId"
				options={tutors.map(t => ({ value: t.id, label: t.name }))}
				label="Tutor"
			/>
			<div className="flex flex-col gap-1">
				<label>Instructions</label>
				<p className="text-sm text-muted-foreground">
					Instructions are the building block of a module. Instructions are
					presented sequentially to the student in order to perform a specified
					task.
				</p>
				<div className="flex flex-col gap-1">
					{instructions.map(({ key }, i) => (
						<Instruction key={key} onDelete={() => remove(i)} index={i} />
					))}
					<Button
						variant="outline"
						onClick={e => {
							e.preventDefault()
							push({
								answerKey: '',
								answerType: 'textarea',
								answerTypeOptions: '',
								prompt: '',
								promptType: 'hardcoded',
								position: instructions.length,
								canAskQuestion: false,
								concludingPrompt: '',
								concludingPromptType: 'hardcoded',
								title: 'New instruction',
							})
						}}
					>
						Add instruction
					</Button>
					{error && <p className="text-destructive-foreground">{error}</p>}
				</div>
			</div>
		</ValidatedForm>
	)
}
