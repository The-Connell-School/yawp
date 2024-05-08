import { invariant } from '@epic-web/invariant'
import {
	unstable_createMemoryUploadHandler,
	unstable_parseMultipartFormData,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, json, redirect, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import omit from 'lodash/omit'
import { TrashIcon } from 'lucide-react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { CourseForm } from './form'
import { MAX_SIZE, validator } from './form/schema'

const deleteValidator = withZod(z.object({ id: z.string() }))

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing course id')
	await requireUserWithRole(request, ['admin'])
	const course = await prisma.course.findUnique({
		where: { id: params.id },
		include: {
			courseModules: { include: { instructions: true } },
			image: { select: { id: true } },
		},
	})

	if (!course) {
		return redirect('/app/admin/courses')
	}

	return json({ course })
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing course id')
	await requireUserWithRole(request, ['admin'])
	const formData = await unstable_parseMultipartFormData(
		request,
		unstable_createMemoryUploadHandler({ maxPartSize: MAX_SIZE }),
	)
	const subaction = formData.get('subaction')

	if (subaction === 'delete') {
		const { error, data } = await deleteValidator.validate(formData)
		if (error) return validationError(error)
		await prisma.course.delete({ where: { id: data.id } })
		return redirectWithToast('/app/admin/courses', {
			type: 'success',
			description: 'Course deleted successfully.',
			closeButton: false,
		})
	} else {
		const { error, data } = await validator.validate(formData)
		if (error) return validationError(error)

		const [currentCourseModules] = await Promise.all([
			prisma.courseModule.findMany({
				where: { courseId: params.id },
				select: { id: true },
			}),
			// Create and update course modules
			...(data.courseModules ?? []).map(async ({ id, ...cm }, CMIdx) => {
				if (id) {
					await prisma.courseModuleInstruction.deleteMany({
						where: { courseModuleId: id },
					})
					return prisma.courseModule.update({
						where: { id },
						data: {
							...cm,
							position: CMIdx,
							instructions: {
								create: (cm.instructions ?? []).map((i, IIdx) => ({
									...i,
									position: IIdx,
								})),
							},
						},
					})
				} else {
					return prisma.courseModule.create({
						data: {
							...cm,
							position: CMIdx,
							instructions: {
								create: (cm.instructions ?? []).map((i, IIdx) => ({
									...i,
									position: IIdx,
								})),
							},
						},
					})
				}
			}),
		])

		const currentCourseModuleIds = currentCourseModules.map(cm => cm.id)
		const courseModulesToDelete = currentCourseModuleIds.filter(
			id => !data.courseModules?.some(cm => cm.id === id),
		)

		const [update] = await Promise.all([
			prisma.course.update({
				include: { image: true },
				where: { id: params.id },
				data: omit(data, ['image', 'courseImageSrc', 'courseModules']),
			}),
			// Delete removed course modules
			prisma.courseModule.deleteMany({
				where: { id: { in: courseModulesToDelete } },
			}),
		])

		if (data.image && data.image.size > 0 && data.courseImageSrc) {
			if (data.courseImageSrc && update.image) {
				await prisma.course.update({
					where: { id: params.id },
					data: { image: { delete: true } },
				})
			}

			await prisma.courseImage.create({
				data: {
					contentType: data.image.type,
					blob: Buffer.from(await data.image.arrayBuffer()),
					course: { connect: { id: params.id } },
				},
			})
		} else if (!data.courseImageSrc && update.image) {
			await prisma.course.update({
				where: { id: params.id },
				data: { image: { delete: true } },
			})
		}

		return redirectWithToast(`/app/admin/courses/${params.id}`, {
			type: 'success',
			description: 'Course updated successfully.',
			closeButton: false,
		})
	}
}

export default function CoursesIdRoute() {
	const data = useLoaderData<typeof loader>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const formId = `edit-course-${data.course.id}`

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<CourseForm
					defaultValues={{
						...data.course,
						image: undefined,
						courseImageSrc: data.course.image
							? `/api/image/course/${data.course.image?.id}`
							: undefined,
					}}
					formId={formId}
					key={formId}
				/>
			</div>
			<div className="flex gap-2 px-6 pb-6 pt-1">
				<Button type="submit" disabled={isPending} form={formId}>
					Update
				</Button>
				<Button
					disabled={isPending}
					variant="secondary"
					asChild
					className="md:hidden"
				>
					<Link to="/app/admin/courses">Cancel</Link>
				</Button>
				<ValidatedForm
					validator={deleteValidator}
					method="POST"
					subaction="delete"
					encType="multipart/form-data"
				>
					<input type="hidden" name="id" value={data.course.id} />
					<Button
						{...dc.getButtonProps({ type: 'submit' })}
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
				</ValidatedForm>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
