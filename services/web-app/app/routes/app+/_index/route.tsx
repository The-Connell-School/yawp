import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	data as dataResponse,
} from 'react-router'
import { Link, useLoaderData, useFetcher } from 'react-router'
import { BookmarkIcon, EllipsisVertical, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { DocumentLink } from '~/components/document-link.js'
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js'
import { Button } from '~/components/ui/button.js'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js'
import { useUser } from '~/hooks/useUser.js'
import { redirectIfDisabled, requireUserId } from '~/utils/auth.server.js'
import { prisma } from '~/utils/db.server.js'
import { FeatureFlags } from '~/utils/featureFlags/index.js'

export async function loader({ request }: LoaderFunctionArgs) {
	await redirectIfDisabled(FeatureFlags.Courses, '/app/assistants')
	const userId = await requireUserId(request)

	const [courses, documents, studentProfiles, views] = await Promise.all([
		prisma.course.findMany({
			select: { image: { select: { id: true } }, id: true, title: true },
		}),
		prisma.document.findMany({
			orderBy: { createdAt: 'desc' },
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
		prisma.studentView.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
		}),
	])

	return dataResponse({
		courses,
		documents,
		studentProfiles,
		views,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	try {
		const formData = await request.formData()
		const intent = formData.get('intent')

		if (intent === 'deleteView') {
			const viewId = formData.get('viewId')
			await prisma.studentView.delete({
				where: { id: viewId as string },
			})

			return dataResponse({ success: true } as const)
		}

		return dataResponse({ success: false } as const)
	} catch (error) {
		throw error
	}
}

export default function AppRoute() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const isTeacher = user.teacherProfile !== null
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
	const fetcher = useFetcher<typeof action>()

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
					<div className="mt-8 flex flex-col">
						<div className="mb-1 flex items-center gap-1">
							<p className="text-foreground/60">Folders</p>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => setIsCreateModalOpen(true)}
							>
								<PlusIcon className="h-5 w-5" />
							</Button>
						</div>
						{data.views.length ? (
							<div className="flex flex-wrap gap-2">
								{data.views.map(view => (
									<Link
										key={view.id}
										to={`/app/students?view=cards${
											view.school ? `&school=${view.school}` : ''
										}${view.grade ? `&grade=${view.grade}` : ''}${
											view.period ? `&period=${view.period}` : ''
										}${view.workshopLeader ? `&workshopLeader=${view.workshopLeader}` : ''}${
											view.schoolTeacher ? `&teacher=${view.schoolTeacher}` : ''
										}`}
										className="align-center flex justify-between gap-2 rounded-lg border bg-muted/50 p-2 shadow-sm transition-shadow hover:shadow-md"
									>
										<BookmarkIcon className="my-auto h-5 w-5 fill-white text-gray-400" />
										<div className="my-auto min-w-fit font-medium">
											{view.name}
										</div>
										<DropdownMenu>
											<DropdownMenuTrigger>
												<Button
													size="icon-sm"
													variant="ghost"
													onClick={(e: React.MouseEvent) => e.stopPropagation()}
												>
													<EllipsisVertical
														size={16}
														className="text-muted-foreground"
													/>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<fetcher.Form method="post">
													<input
														type="hidden"
														name="intent"
														value="deleteView"
													/>
													<input type="hidden" name="viewId" value={view.id} />
													<DropdownMenuItem asChild>
														<Button
															variant="ghost"
															className="w-full justify-start"
															onClick={(e: React.MouseEvent) =>
																e.stopPropagation()
															}
														>
															Delete
														</Button>
													</DropdownMenuItem>
												</fetcher.Form>
											</DropdownMenuContent>
										</DropdownMenu>
									</Link>
								))}
							</div>
						) : (
							<NoDataPlaceholder
								title="No saved views"
								subtitle="Create a view to quickly access filtered student lists."
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
					<div className="mt-8 flex flex-col">
						<p className="my-2 text-foreground/60">Documents</p>
						{data.documents.length ? (
							<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
								{data.documents.map(doc => (
									<DocumentLink key={doc.id} doc={doc} exitTo="/app" />
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
				<Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create a Student View</DialogTitle>
							<DialogDescription>
								Go to the Students page, add your desired filters, and hit the
								'Save' button to create a new Student View from those filters.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button asChild>
								<Link to="/app/students">Go to Students</Link>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
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
								<DocumentLink key={doc.id} doc={doc} exitTo="/app" />
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
