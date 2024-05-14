import { invariant } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { DocumentLink } from '#app/components/document-link.js'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { NoDataPlaceholder } from '#app/components/no-data-placeholder.js'
import { UserImage } from '#app/components/user-image.js'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { timeAgo } from '#app/utils/timeAgo'
import { redirectWithToast } from '#app/utils/toast.server.js'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No student profile id provided')
	const userId = await requireUserId(request)
	const studentProfile = await prisma.studentProfile.findFirst({
		where: { id: params.id, workshopLeaderId: userId },
		include: {
			user: {
				include: {
					image: true,
					documents: {
						where: { deletedAt: null },
						include: {
							courseModuleSessions: {
								include: { courseModule: true },
								orderBy: { courseModule: { position: 'desc' } },
							},
						},
					},
				},
			},
		},
	})

	if (!studentProfile) {
		return redirectWithToast('/app/students', {
			type: 'error',
			description: 'Student not found',
		})
	}

	return json({ studentProfile })
}

export default function Route() {
	const { studentProfile } = useLoaderData<typeof loader>()

	return (
		<div className="mt-4 border-t">
			<div className="w-full p-4">
				<div className="flex gap-8">
					<UserImage user={studentProfile.user} />
					<div>
						<h2>{studentProfile.user.name}</h2>
						<p className="text-muted-foreground">{studentProfile.user.email}</p>
						<p className="text-muted-foreground">
							Joined {timeAgo(new Date(studentProfile.createdAt))}
						</p>
					</div>
				</div>
				<div className="mt-6">
					{studentProfile.user.documents.length === 0 ? (
						<NoDataPlaceholder
							title="No documents"
							subtitle={`${studentProfile.user.name} has not started any documents yet.`}
						/>
					) : null}
					<div className="grid grid-cols-2 gap-1 md:gap-2 xl:grid-cols-3">
						{studentProfile.user.documents.map(doc => (
							<DocumentLink key={doc.id} doc={doc} />
						))}
					</div>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
