import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
} from '@remix-run/node'
import { Link, useFetcher, useLoaderData } from '@remix-run/react'
import { ImageIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { FormInput } from '#app/components/forms/form-input'
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
import { twoFAVerificationType } from '../two-factor/route'

const ProfileFormSchema = z.object({
	name: NameSchema.optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			image: {
				select: { id: true },
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
	})

	const twoFactorVerification = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { type: twoFAVerificationType, target: userId } },
	})

	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})

	return json({
		user,
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
	})
}

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}
const profileUpdateActionIntent = 'update-profile'
const signOutOfSessionsActionIntent = 'sign-out-of-sessions'

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const intent = formData.get('intent')

	switch (intent) {
		case profileUpdateActionIntent: {
			return profileUpdateAction({ request, userId, formData })
		}
		case signOutOfSessionsActionIntent: {
			return signOutOfSessionsAction({ request, userId, formData })
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
					<UpdateProfile />
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
						<SignOutOfSessions />
					</div>
				</div>
			</div>
			{isAdmin ? (
				<div className="mt-12">
					<h2>Settings</h2>
					<div className="my-4 w-full border-b" />
					<Link to="/app/profile/assistants">
						<div className="cursor-pointer rounded-lg bg-primary/10 p-4 transition-colors hover:bg-primary/15">
							<h3 className="flex items-center gap-1.5">
								<LockClosedIcon className="h-4 w-4" />
								Manage assistants
							</h3>
							<p>
								Set passwords and more for each assistant accessible to students
								and teachers.
							</p>
						</div>
					</Link>
				</div>
			) : null}
		</div>
	)
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parse(formData, {
		async: true,
		schema: ProfileFormSchema,
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const data = submission.value

	await prisma.user.update({
		where: { id: userId },
		data: { name: data.name },
	})

	return json(submission.reply())
}

function UpdateProfile() {
	const data = useLoaderData<typeof loader>()
	const fetcher = useFetcher<typeof profileUpdateAction>()

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getFieldsetConstraint(ProfileFormSchema),
		lastResult: fetcher.data,
		onValidate({ formData }) {
			return parse(formData, { schema: ProfileFormSchema })
		},
		defaultValue: { name: data.user.name ?? '' },
	})

	return (
		<fetcher.Form
			method="POST"
			{...getFormProps(form)}
			className="flex flex-col gap-2"
		>
			<AuthenticityTokenInput />
			<FormInput
				labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
				inputProps={{
					...getInputProps(fields.name, { type: 'text' }),
					className: 'w-auto max-w-[400px] min-w-[200px]',
				}}
				errors={fields.name.errors}
			/>
			<div className="mt-1">
				<Button type="submit" name="intent" value={profileUpdateActionIntent}>
					Save changes
				</Button>
			</div>
		</fetcher.Form>
	)
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
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

function SignOutOfSessions() {
	const data = useLoaderData<typeof loader>()
	const dc = useDoubleCheck()
	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const otherSessionsCount = data.user._count.sessions - 1

	return (
		<div className="flex items-center gap-2">
			{otherSessionsCount ? (
				<fetcher.Form method="POST">
					<AuthenticityTokenInput />
					<Button
						className="flex-grow"
						variant={dc.doubleCheck ? 'destructive' : 'secondary'}
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: signOutOfSessionsActionIntent,
						})}
					>
						{dc.doubleCheck
							? `Are you sure?`
							: `Sign out of ${otherSessionsCount} other sessions`}
					</Button>
				</fetcher.Form>
			) : (
				'This is your only session'
			)}
		</div>
	)
}
