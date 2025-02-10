import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormListInput } from '#app/components/forms/form-list-input.tsx'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { requireUserWithRole } from '#app/utils/permissions'
import { startCase } from '#app/utils/startCase'
import { redirectWithToast } from '#app/utils/toast.server'

const Schema = z.object({
	name: z.string(),
	value: z.string(),
})

const validator = withZod(Schema)

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const settings = await prisma.setting.findMany()
	return json({ settings })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	await prisma.setting.upsert({
		where: { name: data.name },
		create: data,
		update: data,
	})

	return redirectWithToast('/app/admin/general', {
		type: 'success',
		description: 'Setting updated successfully',
	})
}

export default function GeneralSettings() {
	const { settings } = useLoaderData<typeof loader>()

	return (
		<div className="p-3 sm:p-5">
			<h3>Settings</h3>
			<div className="mt-6 max-w-[500px]">
				{settings.map(setting =>
					setting.valueType === 'string' ? (
						<ValidatedForm
							key={setting.id}
							method="POST"
							validator={validator}
							defaultValues={{
								name: setting.name,
								value: setting.value,
							}}
							className="mb-4"
						>
							<div className="flex items-end gap-4">
								<input type="hidden" name="name" value={setting.name} />
								<FormInput
									name="value"
									label={startCase(setting.name)}
									className="flex-1"
								/>
								<Button type="submit">Save</Button>
							</div>
						</ValidatedForm>
					) : setting.valueType === 'arrayOfStrings' ? (
						<ValidatedForm
							key={setting.id}
							method="POST"
							validator={validator}
							defaultValues={{
								name: setting.name,
								value: setting.value,
							}}
							className="mb-4"
							id={setting.id}
						>
							<div className="flex flex-col gap-4">
								<input type="hidden" name="name" value={setting.name} />
								<FormListInput
									name="value"
									label={startCase(setting.name)}
									defaultValue={setting.value}
									formId={setting.id}
								/>
							</div>
						</ValidatedForm>
					) : null,
				)}
			</div>
		</div>
	)
}
