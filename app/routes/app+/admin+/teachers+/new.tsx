import * as E from '@react-email/components'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { validationError } from 'remix-validated-form'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prepareVerification } from '#app/routes/_auth+/verify.server.js'
import { prisma } from '#app/utils/db.server'
import { sendEmail } from '#app/utils/email.server.js'
import { useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { TeacherForm } from './form'
import { validator } from './form/schema'

export const loader = async ({ request }: LoaderFunctionArgs) => {
	await requireUserWithRole(request, ['admin'])
	const allStudents = await prisma.user.findMany({
		where: { studentProfile: { isNot: null } },
		include: {
			studentProfile: {
				include: { workshopLeader: { select: { email: true } } },
			},
		},
	})
	return json({ allStudents })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const { error, data, formId } = await validator.validate(formData)
	if (error) return validationError(error)

	const [user, verification] = await Promise.all([
		prisma.user.findUnique({
			where: { email: data.email },
			include: { teacherProfile: true },
		}),
		prisma.verification.findFirst({
			where: { target: data.email, type: 'teacher-onboarding' },
		}),
	])

	if (user && user.teacherProfile) {
		const error = 'A teacher already exists with that email.'
		return validationError({ fieldErrors: { email: error }, formId }, data)
	} else if (verification) {
		const error = 'A teacher with that email has already been invited.'
		return validationError({ fieldErrors: { email: error }, formId }, data)
	}

	if (user) {
		const update = await prisma.user.update({
			where: { id: user.id },
			data: { teacherProfile: { create: {} } },
			include: { teacherProfile: true },
		})

		return redirectWithToast(`/app/admin/teachers/${update.id}`, {
			type: 'success',
			description: 'Teacher updated successfully',
			closeButton: false,
		})
	} else {
		const { verifyUrl } = await prepareVerification({
			period: 60 * 60 * 48,
			request,
			type: 'teacher-onboarding',
			target: data.email,
		})

		const response = await sendEmail({
			to: data.email,
			subject: `You've been invited to join Yawp!`,
			react: (
				<E.Html lang="en" dir="ltr">
					<E.Container>
						<h1>
							<E.Text>Welcome to Yawp!</E.Text>
						</h1>
						<p>
							<E.Text>
								You've been invited to join Yawp! as a teacher. To get started,
								click the link below.
							</E.Text>
						</p>
						<E.Link href={verifyUrl.href}>{verifyUrl.href}</E.Link>
					</E.Container>
				</E.Html>
			),
		})

		if (response.status === 'success') {
			return redirectWithToast('/app/admin/teachers', {
				type: 'success',
				description: 'Teacher invitation sent.',
				closeButton: false,
			})
		} else {
			return redirectWithToast('/app/admin/teachers', {
				type: 'error',
				description: 'Teacher invitation was not sent. Please try again.',
				closeButton: false,
			})
		}
	}
}

export default function Route() {
	const { allStudents } = useLoaderData<typeof loader>()
	const isPending = useIsPending()

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<TeacherForm formId="create-module" allStudents={allStudents} />
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
					<Link to="/app/admin/teachers">Cancel</Link>
				</Button>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
