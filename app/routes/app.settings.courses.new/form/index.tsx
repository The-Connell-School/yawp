import omit from 'lodash/omit'
import { CameraIcon, TrashIcon } from 'lucide-react'
import { ValidatedForm, useField, useFieldArray } from 'remix-validated-form'
import { type z } from 'zod'
import { FormImage } from '#app/components/forms/form-image'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormTextarea } from '#app/components/forms/form-textarea-2'
import { Button } from '#app/components/ui/button'
import {
	HiddenValuesInputs,
	HiddenValuesProvider,
} from '#app/contexts/hidden-values'
import { CourseModule } from './course-module'
import { type Schema, validator, type CourseModuleSchema } from './schema'

interface Props {
	formId: string
	defaultValues?: z.infer<typeof Schema>
}

export const CourseForm = ({ defaultValues, formId }: Props) => {
	const { error } = useField('courseModules', { formId })
	const [courseModules, { push, remove }] = useFieldArray<
		z.infer<typeof CourseModuleSchema>
	>('courseModules', { formId })

	return (
		<HiddenValuesProvider>
			<ValidatedForm
				id={formId}
				validator={validator}
				defaultValues={defaultValues}
				method="POST"
				encType="multipart/form-data"
				className="flex flex-col gap-4"
			>
				<HiddenValuesInputs
					defaultValues={omit(defaultValues, [
						'courseImageSrc',
						'description',
						'id',
						'image',
						'position',
						'title',
					])}
				/>
				<div className="flex w-full gap-4">
					<div className="h-[197px] w-[280px]">
						<FormImage name="courseImageSrc">
							{({ src, remove, pick }) =>
								src ? (
									<div
										className="relative h-full w-full rounded-lg bg-cover bg-center bg-no-repeat"
										style={{ backgroundImage: `url(${src})` }}
									>
										<TrashIcon
											className="absolute bottom-2 right-2 h-8 w-8 cursor-pointer rounded-full bg-destructive/75 p-2 text-destructive-foreground transition hover:bg-destructive"
											onClick={remove}
										/>
									</div>
								) : (
									<div>
										<div
											className="flex h-[197px] w-[197px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border transition hover:bg-muted"
											onClick={pick}
										>
											<CameraIcon className="h-8 w-8 text-muted-foreground" />
											<p className="text-sm text-muted-foreground">
												Upload an image
											</p>
										</div>
									</div>
								)
							}
						</FormImage>
					</div>
					<div className="flex w-full flex-col gap-4">
						<FormInput name="title" placeholder="Title" className="w-full" />
						<FormTextarea name="description" placeholder="Description" />
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<label>Modules</label>
					<p className="mb-1 text-sm text-muted-foreground">
						Modules are the building block of a course. Break down your course
						into session length topics to make it easier for students to digest.
					</p>
					<div className="flex flex-col gap-1">
						{courseModules.map(({ key }, i) => (
							<CourseModule
								key={key}
								onDelete={() => remove(i)}
								name={`courseModules[${i}]`}
							/>
						))}
						<Button
							variant="outline"
							onClick={e => {
								e.preventDefault()
								push({
									title: 'New module',
									description: '',
									tutorId: '',
									instructions: [],
								})
							}}
						>
							Add module
						</Button>
						{error && <p className="text-destructive-foreground">{error}</p>}
					</div>
				</div>
			</ValidatedForm>
		</HiddenValuesProvider>
	)
}
