import { ValidatedForm, useField, useFieldArray } from 'remix-validated-form'
import { type z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { Button } from '#app/components/ui/button'
import { type Schema, validator } from './schema'
import { Student } from './student'

interface Props {
	formId: string
	allStudents: { email: string }[]
	defaultValues?: z.infer<typeof Schema>
}

export const TeacherForm = ({ allStudents, defaultValues, formId }: Props) => {
	const { error } = useField('students', { formId })
	const [students, { push, remove }] = useFieldArray<{ email: string }>(
		'students',
		{ formId },
	)

	const studentOptions = allStudents.filter(
		s => students.find(s2 => s2.defaultValue.email === s.email) === undefined,
	)

	return (
		<ValidatedForm
			id={formId}
			validator={validator}
			defaultValues={defaultValues}
			method="POST"
			encType="multipart/form-data"
			className="flex flex-col gap-4"
		>
			{/* Force validation to succeed with a disabled input that is required */}
			{defaultValues?.email ? (
				<input type="hidden" value={defaultValues.email} name="email" />
			) : null}
			<FormInput
				name="email"
				type="email"
				title="Email"
				placeholder="teacher@example.com"
				disabled={!!defaultValues?.email}
				helperText={
					defaultValues?.email
						? 'To change the email address, you must create a new teacher account.'
						: "You can assign students to a teacher after you've created their account."
				}
			/>
			{defaultValues?.email ? (
				<div className="flex flex-col gap-1">
					<label>Students</label>
					<p className="mb-1 text-sm text-muted-foreground">
						Assign students to this teacher.
					</p>
					<div className="flex flex-col gap-1">
						{students.map(({ key }, i) => (
							<Student
								key={key}
								onDelete={() => remove(i)}
								students={studentOptions}
								name={`students[${i}].email`}
							/>
						))}
						<Button
							variant="outline"
							onClick={e => {
								e.preventDefault()
								push({ email: '' })
							}}
						>
							Add module
						</Button>
						{error && <p className="text-destructive-foreground">{error}</p>}
					</div>
				</div>
			) : null}
		</ValidatedForm>
	)
}
