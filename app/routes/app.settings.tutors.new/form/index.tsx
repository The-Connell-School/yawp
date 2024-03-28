import { ValidatedForm } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { type Schema, validator } from '../form/schema'

interface Props {
	formId: string
	defaultValues?: z.infer<typeof Schema>
}

export const TutorForm = ({ defaultValues, formId }: Props) => {
	return (
		<ValidatedForm
			id={formId}
			validator={validator}
			defaultValues={defaultValues}
			method="POST"
			className="flex flex-col gap-4"
		>
			<FormInput name="name" placeholder="Name" className="w-full" />
			<FormTextarea name="instructions" placeholder="Instructions" />
		</ValidatedForm>
	)
}
