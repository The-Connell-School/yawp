import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
	redirect,
	unstable_createMemoryUploadHandler,
	unstable_parseMultipartFormData,
} from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms/error-list'
import { CameraIcon, ResetIcon } from '#app/components/icons'
import { Button, button } from '#app/components/ui/button'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	getUserImgSrc,
	useDoubleCheck,
	useIsPending,
} from '#app/utils/misc.tsx'
import { type BreadcrumbHandle } from '../assistants.profile/route'

export const handle: BreadcrumbHandle = {
	breadcrumb: (
		<Link
			to="/assistants/profile/two-factor"
			className={button({ variant: 'ghost', size: 'sm' })}
		>
			<CameraIcon className="mr-2" /> Photo
		</Link>
	),
}

const MAX_SIZE = 1024 * 1024 * 3 // 3MB

const DeleteImageSchema = z.object({
	intent: z.literal('delete'),
})

const NewImageSchema = z.object({
	intent: z.literal('submit'),
	photoFile: z
		.instanceof(File)
		.refine(file => file.size > 0, 'Image is required')
		.refine(file => file.size <= MAX_SIZE, 'Image size must be less than 3MB'),
})

const PhotoFormSchema = z.union([DeleteImageSchema, NewImageSchema])

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			image: { select: { id: true } },
		},
	})
	invariantResponse(user, 'User not found', { status: 404 })
	return json({ user })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await unstable_parseMultipartFormData(
		request,
		unstable_createMemoryUploadHandler({ maxPartSize: MAX_SIZE }),
	)
	await validateCSRF(formData, request.headers)

	const submission = await parse(formData, {
		schema: PhotoFormSchema.transform(async data => {
			if (data.intent === 'delete') return { intent: 'delete' }
			if (data.photoFile.size <= 0) return z.NEVER
			return {
				intent: data.intent,
				image: {
					contentType: data.photoFile.type,
					blob: Buffer.from(await data.photoFile.arrayBuffer()),
				},
			}
		}),
		async: true,
	})

	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const { image, intent } = submission.value

	if (intent === 'delete') {
		await prisma.userImage.deleteMany({ where: { userId } })
		return redirect('/assistants/profile')
	}

	await prisma.$transaction(async $prisma => {
		await $prisma.userImage.deleteMany({ where: { userId } })
		await $prisma.user.update({
			where: { id: userId },
			data: { image: { create: image } },
		})
	})

	return redirect('/assistants/profile')
}

export default function PhotoRoute() {
	const data = useLoaderData<typeof loader>()
	const doubleCheckDeleteImage = useDoubleCheck()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [newImageSrc, setNewImageSrc] = useState<string | null>(null)

	const [form, fields] = useForm({
		id: 'profile-photo',
		constraint: getFieldsetConstraint(PhotoFormSchema),
		lastSubmission: actionData?.submission,
		onValidate({ formData }) {
			// otherwise, the best error zod gives us is "Invalid input" which is not
			// enough
			if (formData.get('intent') === 'delete') {
				return parse(formData, { schema: DeleteImageSchema })
			}
			return parse(formData, { schema: NewImageSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div>
			<Form
				method="POST"
				encType="multipart/form-data"
				className="flex gap-10"
				onReset={() => setNewImageSrc(null)}
				{...form.props}
			>
				<AuthenticityTokenInput />
				<img
					src={
						newImageSrc ?? (data.user ? getUserImgSrc(data.user.image?.id) : '')
					}
					className="h-48 w-48 rounded-full object-cover"
					alt={data.user?.name ?? data.user?.email}
				/>
				<ErrorList errors={fields.photoFile.errors} id={fields.photoFile.id} />
				<div className="flex flex-col justify-center gap-2">
					{/*
						We're doing some kinda odd things to make it so this works well
						without JavaScript. Basically, we're using CSS to ensure the right
						buttons show up based on the input's "valid" state (whether or not
						an image has been selected). Progressive enhancement FTW!
					*/}
					<input
						{...conform.input(fields.photoFile, { type: 'file' })}
						accept="image/*"
						className="peer sr-only"
						required
						tabIndex={newImageSrc ? -1 : 0}
						onChange={e => {
							const file = e.currentTarget.files?.[0]
							if (file) {
								const reader = new FileReader()
								reader.onload = event => {
									setNewImageSrc(event.target?.result?.toString() ?? null)
								}
								reader.readAsDataURL(file)
							}
						}}
					/>
					<label
						htmlFor={fields.photoFile.id}
						className={button({ className: 'cursor-pointer' })}
					>
						Change
					</label>
					<Button
						name="intent"
						value="submit"
						type="submit"
						className="peer-invalid:hidden"
						isLoading={isPending}
					>
						Save Photo
					</Button>
					<Button
						type="reset"
						className="peer-invalid:hidden"
						variant="secondary"
					>
						<ResetIcon className="mr-2" />
						Reset
					</Button>
					{data.user.image?.id ? (
						<Button
							variant="destructive"
							className="peer-valid:hidden"
							{...doubleCheckDeleteImage.getButtonProps({
								type: 'submit',
								name: 'intent',
								value: 'delete',
							})}
						>
							{doubleCheckDeleteImage.doubleCheck ? 'Are you sure?' : 'Delete'}
						</Button>
					) : null}
				</div>
				<ErrorList errors={form.errors} />
			</Form>
		</div>
	)
}
