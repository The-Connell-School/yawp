import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
	unstable_parseMultipartFormData,
	unstable_createMemoryUploadHandler,
} from '@remix-run/node'
import { Link } from '@remix-run/react'
import omit from 'lodash/omit'
import { validationError } from 'remix-validated-form'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { CourseForm } from './form'
import { MAX_SIZE, validator } from './form/schema'

export const loader = async ({ request }: LoaderFunctionArgs) => {
	await requireUserWithRole(request, ['admin'])
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await unstable_parseMultipartFormData(
		request,
		unstable_createMemoryUploadHandler({ maxPartSize: MAX_SIZE }),
	)
	const { error, data } = await validator.validate(formData)

	if (error) return validationError(error)

	const count = await prisma.course.count()
	const created = await prisma.course.create({
		data: {
			...omit(data, ['image', 'courseImageSrc']),
			position: count,
			resources: {
				create: data.resources ?? [],
			},
			courseModules: {
				create: (data.courseModules ?? []).map((cm, index) => ({
					...omit(cm, ['id']),
					position: index,
					instructions: {
						create: (cm.instructions ?? []).map((instruction, i) => ({
							...instruction,
							position: i,
						})),
					},
				})),
			},
		},
	})

	if (data.image && data.courseImageSrc) {
		await prisma.courseImage.create({
			data: {
				course: { connect: { id: created.id } },
				contentType: data.image.type,
				blob: Buffer.from(await data.image.arrayBuffer()),
			},
		})
	}

	return redirectWithToast(`/app/admin/courses/${created.id}`, {
		type: 'success',
		description: 'Course created successfully',
		closeButton: false,
	})
}

export default function Route() {
	const isPending = useIsPending()

	return (
		<div className="flex h-full flex-col">
			<div className="no-scrollbar grow overflow-y-scroll p-6">
				<CourseForm formId="create-module" />
			</div>
			<div className="flex gap-2 px-6 pb-6 pt-1">
				<Button type="submit" disabled={isPending} form="create-module">
					Create
				</Button>
				<Button
					disabled={isPending}
					variant="secondary"
					asChild
					className="md:hidden"
				>
					<Link to="/app/admin/courses">Cancel</Link>
				</Button>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
