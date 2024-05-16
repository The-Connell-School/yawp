import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { ArrowUpRight, FileIcon } from 'lucide-react'
import { DocumentLink } from '#app/components/document-link.js'
import { NoDataPlaceholder } from '#app/components/no-data-placeholder.js'
import { UserImage } from '#app/components/user-image.js'
import { useUser } from '#app/hooks/useUser.js'
import { redirectIfDisabled, requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { FeatureFlags } from '#app/utils/featureFlags/index.js'
import pluralize from '#app/utils/pluralize/pluralize.js'

export async function loader({ request }: LoaderFunctionArgs) {
	await redirectIfDisabled(FeatureFlags.Courses, '/app/assistants')
	const userId = await requireUserId(request)

	const [courses, documents, studentProfiles] = await Promise.all([
		prisma.course.findMany({
			select: { image: { select: { id: true } }, id: true, title: true },
		}),
		prisma.document.findMany({
			where: { userId, deletedAt: null },
			include: {
				courseModuleSessions: {
					include: { courseModule: true },
					orderBy: { courseModule: { position: 'desc' } },
				},
			},
		}),
		prisma.studentProfile.findMany({
			where: { workshopLeaderId: userId },
			include: { user: { include: { image: true, documents: true } } },
		}),
	])

	return json({ courses, documents, studentProfiles })
}

export default function AppRoute() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const isTeacher = user.teacherProfile !== null

	if (isTeacher) {
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
								Welcome to your teacher dashboard. Manage students, view
								resources, and more.
							</p>
						</div>
					</div>
				</div>
				<div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
					<div className="flex flex-col">
						<p className="my-2 text-foreground/60">Students</p>
						{data.studentProfiles.length ? (
							<div className="grid grid-cols-2 gap-2 md:grid-cols-6">
								<Link
									to="/app/students"
									className="flex h-32 flex-col rounded-lg border border-primary/10 bg-primary/5 p-4 shadow-sm transition-shadow hover:shadow-md"
								>
									<span className="grow">
										<span className="flex items-end text-muted-foreground">
											<span className="text-xl font-bold">All Students</span>
											<ArrowUpRight size={28} strokeWidth={2.5} />
										</span>
									</span>
									<span className="text-muted-foreground/70">
										{data.studentProfiles.length} total{' '}
										{pluralize({
											word: 'student',
											count: data.studentProfiles.length,
										})}
									</span>
								</Link>
								{data.studentProfiles.map(sp => (
									<Link
										key={sp.id}
										to={`/app/students/${sp.id}`}
										className="flex h-32 flex-col rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md"
									>
										<span className="flex gap-2 pb-2">
											<UserImage
												user={sp.user}
												size="xs"
												className="h-9 w-9 rounded-md"
											/>
											<span className="flex flex-col">
												<span className="text-sm font-bold">
													{sp.user.name}
												</span>
												<span className="text-xs text-muted-foreground">
													{sp.grade !== null ? `${sp.grade} grade` : ''}
													{sp.period !== null ? `, period ${sp.period}` : ''}
													{sp.grade === null && sp.period === null
														? `No grade`
														: ''}
												</span>
											</span>
										</span>
										<span className="mt-auto flex items-center gap-2 text-sm text-muted-foreground">
											<FileIcon size={18} />
											{sp.user.documents.length}{' '}
											{pluralize({
												word: 'document',
												count: sp.user.documents.length,
											})}
										</span>
									</Link>
								))}
							</div>
						) : (
							<NoDataPlaceholder
								title="No students"
								subtitle="Students assigned to you will show up here."
							/>
						)}
					</div>
					<div className="mt-8 flex flex-col">
						<p className="my-2 text-foreground/60">Resources (by course)</p>
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
				</div>
			</section>
		)
	}

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
							Welcome to your dashboard. Here you can view and manage your
							courses.
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
