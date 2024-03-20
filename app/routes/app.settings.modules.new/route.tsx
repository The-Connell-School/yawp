import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { validationError } from 'remix-validated-form'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { ModuleForm } from './form'
import { validator } from './form/schema'

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
	const { error, data } = await validator.validate(formData)

	if (error) return validationError(error)

	const created = await prisma.module_.create({
		data: {
			...data,
			tutorId: data.tutorId || null,
			instructions: {
				create: data.instructions?.map((d, i) => ({ ...d, position: i })),
			},
		},
	})

	return redirectWithToast(`/app/settings/modules/${created.id}`, {
		type: 'success',
		description: 'Module created successfully',
		closeButton: false,
	})
}

export default function Route() {
	const { tutors } = useLoaderData<typeof loader>()
	const isPending = useIsPending()

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<ModuleForm formId="create-module" tutors={tutors} />
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
					<Link to="/app/settings/modules">Cancel</Link>
				</Button>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
