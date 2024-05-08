import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, Link, json, useLoaderData } from '@remix-run/react'
import { TrashIcon } from 'lucide-react'
import { validationError } from 'remix-validated-form'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { FeatureFlagForm } from './form'
import { validator } from './form/schema'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.name, 'Missing feature flag name')
	await requireUserWithRole(request, ['admin'])
	const ff = await prisma.featureFlag.findUnique({
		where: { name: params.name },
	})

	if (!ff) {
		return redirectWithToast('/app/admin/feature-flags', {
			type: 'error',
			description: 'Feature flag not found.',
			closeButton: false,
		})
	}

	return json({ ff })
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.name, 'Missing feature flag name')
	await requireUserWithRole(request, ['admin'])

	if (request.method === 'DELETE') {
		await prisma.featureFlag.delete({ where: { name: params.name } })
		return redirectWithToast('/app/admin/feature-flags', {
			type: 'success',
			description: 'Feature flag deleted successfully.',
			closeButton: false,
		})
	} else {
		const formData = await request.formData()
		const { error, data } = await validator.validate(formData)
		if (error) return validationError(error)

		const update = await prisma.featureFlag.update({
			where: { name: params.name },
			data: {
				name: data.name,
				description: data.description,
				isEnabled: data.isEnabled ?? false,
			},
		})

		return redirectWithToast(`/app/admin/feature-flags/${update.name}`, {
			type: 'success',
			description: 'Feature flag updated successfully.',
			closeButton: false,
		})
	}
}

export default function TeachersIdRoute() {
	const data = useLoaderData<typeof loader>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const formId = `edit-feature-flag-${data.ff.name}`

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<FeatureFlagForm defaultValues={data.ff} formId={formId} key={formId} />
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
					<Link to="/app/admin/feature-flags">Cancel</Link>
				</Button>
				<Form method="DELETE">
					<Button
						{...dc.getButtonProps({ type: 'submit' })}
						disabled={isPending}
						size={dc.doubleCheck ? 'default' : 'icon'}
						variant={dc.doubleCheck ? 'destructive' : 'secondary'}
					>
						{dc.doubleCheck ? (
							'Delete feature flag'
						) : (
							<TrashIcon className="h-5 w-5" />
						)}
					</Button>
				</Form>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
