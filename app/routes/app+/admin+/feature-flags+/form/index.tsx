import { ValidatedForm } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormSwitch } from '#app/components/forms/form-switch-2'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { type Schema, validator } from './schema'

interface Props {
	formId: string
	defaultValues?: z.infer<typeof Schema>
}

export const FeatureFlagForm = ({ defaultValues, formId }: Props) => {
	return (
		<ValidatedForm
			id={formId}
			validator={validator}
			defaultValues={defaultValues}
			method="POST"
			className="flex flex-col gap-4"
		>
			<FormInput name="name" placeholder="E.g. enableCourses" form={formId} />
			<FormTextarea
				form={formId}
				name="description"
				placeholder="E.g. Enables the courses tab for students."
			/>
			<FormSwitch
				form={formId}
				label="Is Enabled?"
				className="flex w-full items-center justify-between gap-2 rounded-lg border p-3"
				name="isEnabled"
				defaultChecked={defaultValues?.isEnabled}
			/>
		</ValidatedForm>
	)
}
