import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, json, redirect, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { TrashIcon } from 'lucide-react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { TutorForm } from '../app.settings.tutors.new/form'
import { validator } from '../app.settings.tutors.new/form/schema'

const deleteValidator = withZod(z.object({ id: z.string() }))

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing tutor id')
	await requireUserWithRole(request, ['admin'])
	const tutor = await prisma.tutor.findUnique({ where: { id: params.id } })

	if (!tutor) {
		return redirect('/app/settings/tutors')
	}

	return json({ tutor })
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing tutor id')
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const subaction = formData.get('subaction')

	if (subaction === 'delete') {
		const { error, data } = await deleteValidator.validate(formData)
		if (error) return validationError(error)
		await prisma.tutor.delete({ where: { id: data.id } })
		return redirectWithToast('/app/settings/tutors', {
			type: 'success',
			description: 'Tutor deleted successfully.',
			closeButton: false,
		})
	} else {
		const { error, data } = await validator.validate(formData)
		if (error) return validationError(error)

		await prisma.tutor.update({ where: { id: params.id }, data })

		return redirectWithToast(`/app/settings/tutors/${params.id}`, {
			type: 'success',
			description: 'Tutor updated successfully.',
			closeButton: false,
		})
	}
}

export default function TutorRoute() {
	const data = useLoaderData<typeof loader>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const formId = `edit-tutor-${data.tutor.id}`

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<TutorForm defaultValues={data.tutor} formId={formId} key={formId} />
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
					<Link to="/app/settings/tutors">Cancel</Link>
				</Button>
				<ValidatedForm
					validator={deleteValidator}
					method="POST"
					subaction="delete"
				>
					<input type="hidden" name="id" value={data.tutor.id} />
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
