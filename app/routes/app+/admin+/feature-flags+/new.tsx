import { type ActionFunctionArgs } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { validationError } from 'remix-validated-form'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { FeatureFlagForm } from './form'
import { validator } from './form/schema'

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const update = await prisma.featureFlag.create({
		data: {
			name: data.name,
			description: data.description,
			isEnabled: data.isEnabled,
		},
	})

	return redirectWithToast(`/app/admin/feature-flags/${update.name}`, {
		type: 'success',
		description: 'Feature flag created successfully.',
		closeButton: false,
	})
}

export default function TeachersIdRoute() {
	const isPending = useIsPending()
	const formId = `new-feature-flag`

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<FeatureFlagForm formId={formId} key={formId} />
			</div>
			<div className="flex gap-2 px-6 pb-6 pt-1">
				<Button type="submit" disabled={isPending} form={formId}>
					Create
				</Button>
				<Button
					disabled={isPending}
					variant="secondary"
					asChild
					className="md:hidden"
				>
					<Link to="/app/admin/feature-flags">Cancel</Link>
				</Button>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
