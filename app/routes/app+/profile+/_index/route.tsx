import { invariantResponse } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { ImageIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { FormInput } from '#app/components/forms/form-input-2'
import { FormSelect } from '#app/components/forms/form-select-2';
import {
	CameraIcon,
	EnvelopeClosedIcon,
	LockClosedIcon,
} from '#app/components/icons'
import { Button, button } from '#app/components/ui/button'
import { UserImage } from '#app/components/user-image.js'
import { useUser } from '#app/hooks/useUser'
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useDoubleCheck } from '#app/utils/misc.tsx'
import { NameSchema } from '#app/utils/schemas/user'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createToastHeaders } from '#app/utils/toast.server.js';
import { twoFAVerificationType } from '../two-factor/route'

const ProfileFormSchema = z.object({
	name: NameSchema.optional(),
	workshopLeaderId: z.string().optional(),
})

const validator = withZod(ProfileFormSchema)

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const [user, teachers, twoFactorVerification, password] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				name: true,
				email: true,
				image: {
					select: { id: true },
				},
				studentProfile: {
					select: { workshopLeaderId: true },
				},
				_count: {
					select: {
						sessions: {
							where: {
								expirationDate: { gt: new Date() },
							},
						},
					},
				},
			},
		}),
		prisma.user.findMany({
			where: { teacherProfile: { isNot: null } },
			select: { id: true, name: true, email: true },
		}),
		prisma.verification.findUnique({
			select: { id: true },
			where: { target_type: { type: twoFAVerificationType, target: userId } },
		}),
		prisma.password.findUnique({
			select: { userId: true },
			where: { userId },
		})
	])

	return json({
		user,
		teachers,
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')

	switch (intent) {
		case 'update-profile': {
			const result = await validator.validate(formData)
			if (result.error) return validationError(result.error)

			const { name, workshopLeaderId } = result.data

			await prisma.user.update({
				where: { id: userId },
				data: { name },
			})

			if (workshopLeaderId) {
				await prisma.user.update({
					where: { id: userId },
					data: { studentProfile: { update: { workshopLeaderId } } },
				})
			}

			return json({ success: true }, {
				headers: await createToastHeaders({
					title: 'Profile updated',
					description: 'Your profile has been successfully updated.',
					type: 'success',
				}),
			})
		}
		case 'sign-out-of-sessions': {
			const authSession = await authSessionStorage.getSession(
				request.headers.get('cookie'),
			)
			const sessionId = authSession.get(sessionKey)
			invariantResponse(
				sessionId,
				'You must be authenticated to sign out of other sessions',
			)
			await prisma.session.deleteMany({
				where: {
					userId,
					id: { not: sessionId },
				},
			})
			return json({ status: 'success' } as const)
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

export default function EditUserProfile() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const isAdmin = user?.roles.some(role => role.name === 'admin')
	const dc = useDoubleCheck()
	const otherSessionsCount = (data.user?._count.sessions || 0) - 1

	return (
		<div>
			<div className="flex flex-col gap-4 lg:flex-row">
				<div className="relative h-52 w-52">
					{user.image ? (
						<UserImage user={user} className="h-48 w-48" />
					) : (
						<div className="flex h-48 w-48 min-w-16 items-center justify-center rounded-full bg-muted">
							<ImageIcon
								size={45}
								className="text-muted-foreground opacity-30"
							/>
						</div>
					)}
					<Link
						preventScrollReset
						to="photo"
						title="Change profile photo"
						aria-label="Change profile photo"
						className={button({
							size: 'icon',
							className: 'absolute bottom-5 right-5',
						})}
					>
						<CameraIcon />
					</Link>
				</div>
				<div className="flex flex-grow flex-col gap-2">
					<ValidatedForm
						validator={validator}
						method="POST"
						defaultValues={{ name: data.user?.name ?? '', workshopLeaderId: data.user?.studentProfile?.workshopLeaderId ?? '' }}
						className="flex flex-col gap-2"
					>
						<AuthenticityTokenInput />
						<div className='flex gap-2 flex-col sm:flex-row'>
							<FormInput
								name="name"
								label="Name"
								className="min-w-[200px]"
							/>
							{data.user?.studentProfile ? (
								<FormSelect
									name="workshopLeaderId"
									label="Yawp! Teacher"
									options={data.teachers.map(teacher => ({
										value: teacher.id,
										label: teacher.name,
									}))}
									className="min-w-[200px]"
								/>
							) : null}
						</div>
						<div className="mt-1">
							<Button type="submit" name="intent" value="update-profile">
								Save changes
							</Button>
						</div>
					</ValidatedForm>
					<div className="my-4 border-b" />
					<div className="my-4 border-b" />
					<div className="flex flex-wrap gap-2">
						<Link
							to="change-email"
							className={button({ variant: 'secondary' })}
						>
							<EnvelopeClosedIcon className="mr-2" /> Change email
						</Link>
						<Link to="two-factor" className={button({ variant: 'secondary' })}>
							<LockClosedIcon className="mr-2" />
							{data.isTwoFactorEnabled ? '2FA is enabled' : 'Enable 2FA'}
						</Link>
						<Link
							to={data.hasPassword ? 'password' : 'password/create'}
							className={button({ variant: 'secondary' })}
						>
							{data.hasPassword ? 'Change Password' : 'Create a Password'}
						</Link>
					</div>
					<div className="flex gap-2">
						<div className="flex items-center gap-2">
							{otherSessionsCount ? (
								<ValidatedForm method="POST" validator={validator}>
									<AuthenticityTokenInput />
									<Button
										className="flex-grow"
										variant={dc.doubleCheck ? 'destructive' : 'secondary'}
										{...dc.getButtonProps({
											type: 'submit',
											name: 'intent',
											value: 'sign-out-of-sessions',
										})}
									>
										{dc.doubleCheck
											? `Are you sure?`
											: `Sign out of ${otherSessionsCount} other sessions`}
									</Button>
								</ValidatedForm>
							) : (
								'This is your only session'
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
