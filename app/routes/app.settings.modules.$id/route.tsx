import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { json, redirect, useLoaderData } from '@remix-run/react'
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
import { ModuleForm } from '../app.settings.modules.new/form'
import { validator } from '../app.settings.modules.new/form/schema'

const deleteValidator = withZod(z.object({ id: z.string() }))

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing module id')
	await requireUserWithRole(request, ['admin'])
	const [module_, tutors] = await Promise.all([
		prisma.module_.findUnique({
			where: { id: params.id },
			include: { instructions: true },
		}),
		prisma.tutor.findMany({ select: { id: true, name: true } }),
	])

	if (!module_) {
		return redirect('/app/settings/modules')
	}

	return json({ module_, tutors })
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing student profile id')
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const subaction = formData.get('subaction')

	if (subaction === 'delete') {
		const { error, data } = await deleteValidator.validate(formData)
		if (error) return validationError(error)
		await prisma.module_.delete({ where: { id: data.id } })
		return redirectWithToast('/app/settings/modules', {
			type: 'success',
			description: 'Module deleted successfully.',
			closeButton: false,
		})
	} else {
		const { error, data } = await validator.validate(formData)
		if (error) return validationError(error)

		await prisma.instruction.deleteMany({
			where: { moduleId: params.id },
		})

		await prisma.module_.update({
			where: { id: params.id },
			data: {
				...data,
				tutorId: data.tutorId || null,
				instructions: {
					create: data.instructions?.map((d, i) => ({ ...d, position: i })),
				},
			},
		})

		return redirectWithToast(`/app/settings/modules/${params.id}`, {
			type: 'success',
			description: 'Module updated successfully.',
			closeButton: false,
		})
	}
}

export default function ModuleRoute() {
	const data = useLoaderData<typeof loader>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const formId = `edit-module-${data.module_.id}`

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<ModuleForm
					tutors={data.tutors}
					defaultValues={data.module_}
					formId={formId}
					key={formId}
				/>
			</div>
			<div className="flex gap-2 px-6 pb-6 pt-1">
				<Button type="submit" disabled={isPending} form={formId}>
					Update
				</Button>
				<ValidatedForm
					validator={deleteValidator}
					method="POST"
					subaction="delete"
				>
					<input type="hidden" name="id" value={data.module_.id} />
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
