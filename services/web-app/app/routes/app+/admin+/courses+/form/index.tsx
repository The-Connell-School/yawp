// import omit from 'lodash/omit'
// import { CameraIcon, TrashIcon } from 'lucide-react'
// import { ValidatedForm, useField, useFieldArray } from '@rvf/react-router'
// import { type z } from 'zod'
// import { FormImage } from '~/components/forms/form-image'
// import { FormInput } from '~/components/forms/form-input-2'
// import { FormTextarea } from '~/components/forms/form-textarea-2'
// import { Button } from '~/components/ui/button'
// import {
// 	HiddenValuesInputs,
// 	HiddenValuesProvider,
// } from '~/contexts/hidden-values'
// import { CourseModules } from './course-modules'
// import { CourseResource } from './resource'
// import { type Schema, validator, type CourseResourceSchema } from './schema'

// interface Props {
// 	formId: string
// 	defaultValues?: z.infer<typeof Schema>
// }

// export const CourseForm = ({ defaultValues, formId }: Props) => {
// 	const { error: courseResourcesError } = useField('resources', { formId })
// 	const [courseResources, { push: pushResource, remove: removeResource }] =
// 		useFieldArray<z.infer<typeof CourseResourceSchema>>('resources', { formId })

// 	return (
// 		<HiddenValuesProvider>
// 			<ValidatedForm
// 				id={formId}
// 				validator={validator}
// 				defaultValues={defaultValues}
// 				method="POST"
// 				encType="multipart/form-data"
// 				className="flex flex-col gap-4"
// 			>
// 				<HiddenValuesInputs
// 					defaultValues={omit(defaultValues, [
// 						'courseImageSrc',
// 						'description',
// 						'id',
// 						'image',
// 						'position',
// 						'title',
// 					])}
// 				/>
// 				<div className="flex w-full gap-4">
// 					<div className="h-[197px] w-[280px]">
// 						<FormImage name="courseImageSrc">
// 							{({ src, remove, pick }) =>
// 								src ? (
// 									<div
// 										className="relative h-full w-full rounded-lg bg-cover bg-center bg-no-repeat"
// 										style={{ backgroundImage: `url(${src})` }}
// 									>
// 										<TrashIcon
// 											className="absolute bottom-2 right-2 h-8 w-8 cursor-pointer rounded-full bg-destructive/75 p-2 text-destructive-foreground transition hover:bg-destructive"
// 											onClick={remove}
// 										/>
// 									</div>
// 								) : (
// 									<div>
// 										<div
// 											className="flex h-[197px] w-[197px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border transition hover:bg-muted"
// 											onClick={pick}
// 										>
// 											<CameraIcon className="h-8 w-8 text-muted-foreground" />
// 											<p className="text-sm text-muted-foreground">
// 												Upload an image
// 											</p>
// 										</div>
// 									</div>
// 								)
// 							}
// 						</FormImage>
// 					</div>
// 					<div className="flex w-full flex-col gap-4">
// 						<FormInput name="title" placeholder="Title" className="w-full" />
// 						<FormTextarea name="description" placeholder="Description" />
// 					</div>
// 				</div>
// 				<CourseModules />
// 				<div className="flex flex-col gap-1">
// 					<label>Resources</label>
// 					<p className="mb-1 text-sm text-muted-foreground">
// 						Resources are additional materials that teachers can use to enhance
// 						their understanding of this course. This could be a PDF, a video, or
// 						a website.
// 					</p>
// 					<div className="flex flex-col gap-1">
// 						{courseResources.map(({ key }, i) => (
// 							<CourseResource
// 								key={key}
// 								onDelete={() => removeResource(i)}
// 								name={`resources[${i}]`}
// 							/>
// 						))}
// 						<Button
// 							variant="secondary"
// 							onClick={e => {
// 								e.preventDefault()
// 								pushResource({
// 									title: 'New Resource',
// 									description: '',
// 									url: '',
// 								})
// 							}}
// 						>
// 							Add resource
// 						</Button>
// 						{courseResourcesError && (
// 							<p className="text-destructive-foreground">
// 								{courseResourcesError}
// 							</p>
// 						)}
// 					</div>
// 				</div>
// 			</ValidatedForm>
// 		</HiddenValuesProvider>
// 	)
// }
