import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, redirect, useLoaderData } from '@remix-run/react'
import { DocumentLink } from '#app/components/document-link.js'
import { NoDataPlaceholder } from '#app/components/no-data-placeholder.js'
import { useUser } from '#app/hooks/useUser.js'
import { requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { FeatureFlags } from '#app/utils/featureFlags/index.js'

export async function loader({ request }: LoaderFunctionArgs) {
	const ff = await prisma.featureFlag.findUnique({
		where: { name: FeatureFlags.Courses },
	})
	if (!ff?.isEnabled) return redirect('/app/assistants')

	const userId = await requireUserId(request)

	const [courses, documents] = await Promise.all([
		prisma.course.findMany({
			select: { image: { select: { id: true } }, id: true, title: true },
		}),
		prisma.document.findMany({
			where: { userId, deletedAt: null },
			include: { courseModuleSessions: { include: { courseModule: true } } },
		}),
	])

	return json({ courses, documents })
}

export default function AppRoute() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const isTeacher = user.teacherProfile !== null

	return (
		<section
			data-testid="app._index"
			className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
		>
			<div className="flex w-full justify-between border-b bg-muted">
				<div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
					<div className="flex flex-col">
						<h2>Welcome, {user.name}!</h2>
						<p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
							{isTeacher
								? 'Welcome to your dashboard. Here you can view and manage your students.'
								: 'Welcome to your dashboard. Here you can view and manage your courses.'}
						</p>
					</div>
				</div>
			</div>
			<div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
				<div className="flex flex-col">
					<p className="my-2 text-foreground/60">Courses</p>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
						{data.courses.map(course => (
							<Link
								to={`/app/courses/${course.id}`}
								key={course.id}
								className="flex flex-col rounded-lg border transition-shadow hover:shadow"
							>
								{course.image ? (
									<img
										src={`/api/image/course/${course.image.id}`}
										alt=""
										className="h-32 w-auto rounded-t-lg object-cover"
									/>
								) : (
									<div className="h-32 w-auto rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20" />
								)}
								<div className="max-w-42 flex items-center justify-between p-3">
									<h4 className="text-foreground/90">{course.title}</h4>
								</div>
							</Link>
						))}
					</div>
				</div>
				<div className="mt-8 flex flex-col">
					<p className="my-2 text-foreground/60">Documents</p>
					{data.documents.length ? (
						<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
							{data.documents.map(doc => (
								<DocumentLink key={doc.id} doc={doc} />
							))}
						</div>
					) : (
						<NoDataPlaceholder
							title="No documents"
							subtitle="Select a course above to get started."
						/>
					)}
				</div>
			</div>
		</section>
	)
}
