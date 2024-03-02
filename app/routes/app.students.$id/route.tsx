import { invariant } from '@epic-web/invariant'
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { DEFAULT_ROUTE, getUserImgSrc } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No student profile id provided')
	const userId = await requireUserId(request)
	const studentProfile = await prisma.studentProfile.findFirst({
		where: { id: params.id, workshopLeaderId: userId },
		include: {
			user: {
				include: {
					image: true,
					moduleSessions: {
						include: { module: { include: { instructions: true } } },
					},
				},
			},
		},
	})

	if (!studentProfile) return redirect(DEFAULT_ROUTE)

	return json({ studentProfile })
}

export default function Route() {
	const { studentProfile } = useLoaderData<typeof loader>()

	return (
		<div className="w-full p-4">
			<div className="flex gap-8">
				<img
					src={getUserImgSrc(studentProfile.user.image?.id)}
					alt={studentProfile.user.name ?? studentProfile.user.email}
					className="h-24 w-24 min-w-24 rounded-full object-cover"
				/>
				<div>
					<h2>{studentProfile.user.name}</h2>
					<p className="text-muted-foreground">{studentProfile.user.email}</p>
					<p className="text-muted-foreground">
						Joined {timeAgo(new Date(studentProfile.createdAt))}
					</p>
				</div>
			</div>
			<div className="mt-6">
				{studentProfile.user.moduleSessions.map(ms => (
					<Link
						key={ms.id}
						className="flex w-fit flex-col items-center justify-center rounded border p-4"
						to={`/app/modules/${ms.moduleId}?studentProfileId=${studentProfile.id}`}
					>
						<p>{ms.module.title}</p>
						<p className="text-muted-foreground">
							{ms.instructionsCompleted === ms.module.instructions.length
								? 'Completed'
								: 'Not completed'}
						</p>
					</Link>
				))}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
