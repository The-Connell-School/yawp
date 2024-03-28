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
import { TutorForm } from './form'
import { validator } from './form/schema'

export const loader = async ({ request }: LoaderFunctionArgs) => {
	await requireUserWithRole(request, ['admin'])
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)

	if (error) return validationError(error)

	const created = await prisma.tutor.create({ data })

	return redirectWithToast(`/app/settings/tutors/${created.id}`, {
		type: 'success',
		description: 'Tutor created successfully',
		closeButton: false,
	})
}

export default function Route() {
	const isPending = useIsPending()

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<TutorForm formId="create-module" />
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
					<Link to="/app/settings/tutors">Cancel</Link>
				</Button>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
