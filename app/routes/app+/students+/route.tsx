import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useSearchParams } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ListLayout } from '#app/components/list-layout'
import { SettingsNavLink } from '#app/components/settings-list-item'
import { UserImage } from '#app/components/user-image.js'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const students = await prisma.studentProfile.findMany({
		where: {
			workshopLeaderId: userId,
			...(query && {
				OR: [
					{ user: { name: { contains: query } } },
					{ user: { email: { contains: query } } },
				],
			}),
		},
		include: { user: { select: { image: true, name: true, email: true } } },
	})

	return json({ students })
}

export default function Route() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	return (
		<ListLayout path="students" hideAddButton>
			{data.students.length > 0 ? (
				data.students.map(sp => (
					<SettingsNavLink
						key={sp.id}
						to={`/app/students/${sp.id}?q=${searchParams.get('q') ?? ''}`}
						title={sp.user.name ?? sp.user.email}
						image={
							<div className="py-2 pl-2">
								<UserImage user={sp.user} size="xs" />
							</div>
						}
					/>
				))
			) : (
				<div className="mt-14 flex h-full w-full flex-col items-center justify-center gap-1">
					<h3>No students found.</h3>
					<p className="w-1/2 text-center text-sm text-muted-foreground">
						Students assigned to you will show up here. If you are expecting
						students to be here, contact your administrator.
					</p>
				</div>
			)}
		</ListLayout>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
