import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useFetcher, useLoaderData } from '@remix-run/react'
import { PlusIcon } from 'lucide-react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { CaretLeftIcon, DotsVerticalIcon } from '#app/components/icons'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '#app/components/ui/accordion.js'
import { Button } from '#app/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.js'
import { Tooltip } from '#app/components/ui/tooltip.js'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { timeAgo } from '#app/utils/timeAgo/timeAgo.js'
import { redirectWithToast } from '#app/utils/toast.server.js'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const [course, documents] = await Promise.all([
		prisma.course.findUnique({
			where: { id: params.id },
			include: { image: true, courseModules: true },
		}),
		prisma.document.findMany({
			where: {
				userId,
				deletedAt: null,
				courseModuleSessions: {
					some: { courseModule: { courseId: params.id } },
				},
			},
			include: {
				courseModuleSessions: {
					take: 1,
					orderBy: { courseModule: { position: 'asc' } },
					include: { courseModule: true },
				},
			},
		}),
	])

	if (!course) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Course not found',
		})
	}

	return json({ course, documents })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const firstCourseModule = await prisma.courseModule.findFirst({
		where: { courseId: params.id },
		orderBy: { position: 'asc' },
	})

	if (!firstCourseModule) {
		return redirectWithToast(`/app/courses/${params.id}`, {
			type: 'error',
			description: 'No course modules for this course.',
		})
	}

	const doc = await prisma.document.create({
		data: {
			userId,
			text: '',
			html: '',
			courseModuleSessions: {
				create: {
					userId,
					instructionsCompleted: 0,
					courseModuleId: firstCourseModule.id,
				},
			},
		},
	})

	return redirectWithToast(`/app/document/${doc.id}`, {
		type: 'success',
		description: 'Document created successfully.',
	})
}

export default function AppCoursesIdRoute() {
	const data = useLoaderData<typeof loader>()
	const deleteDocumentFetcher = useFetcher()
	const hasModules = data.course.courseModules.length > 0

	return (
		<div className="h-full w-full overflow-scroll">
			<div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
				<div className="mb-4 flex justify-between gap-2">
					<Button asChild variant="outline">
						<Link to="/app" className="w-fit">
							<CaretLeftIcon className="mr-1 h-5 w-5" /> Back to dashboard
						</Link>
					</Button>
					<Form method="post">
						<Button type="submit" className="w-fit" disabled={!hasModules}>
							New <PlusIcon className="ml-1 h-5 w-5" />
						</Button>
					</Form>
				</div>
				<div className="flex flex-col items-start gap-6 pb-6 sm:flex-row lg:items-end">
					{data.course.image ? (
						<img
							src={`/api/image/course/${data.course.image.id}`}
							alt={data.course.title}
							className="h-auto w-screen min-w-[170px] max-w-[250px] rounded-lg object-cover"
						/>
					) : null}
					<div className="flex flex-col gap-3">
						<h1 className="text-3xl font-bold">{data.course.title}</h1>
						<p className="text-sm sm:text-base">{data.course.description}</p>
					</div>
				</div>
				{hasModules ? (
					<>
						<h3 className="mb-2 text-foreground/75">Modules</h3>
						<div className="border-b" />
						<Accordion type="multiple">
							{data.course.courseModules.map(cm => (
								<AccordionItem key={cm.id} value={cm.id}>
									<AccordionTrigger className="py-2 text-base">
										{cm.title}
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground">
										{cm.description || 'No description.'}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</>
				) : null}
				<div className="grid grid-cols-1 gap-3 pb-10 pt-6 sm:grid-cols-2 md:grid-cols-3">
					{data.documents.map(doc => (
						<Link
							key={doc.id}
							to={`/app/document/${doc.id}`}
							className="relative flex h-48 flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow"
						>
							<span className="absolute right-1 top-1 z-20 rounded-full border bg-primary px-2 py-0.5 text-xs text-primary-foreground">
								{doc.courseModuleSessions[0].courseModule.title}
							</span>
							{doc.html ? (
								<div
									dangerouslySetInnerHTML={{ __html: doc.html }}
									className="z-10 flex-1 scale-90 overflow-hidden p-3 font-times text-sm"
								/>
							) : (
								<p className="flex w-full flex-1 items-center justify-center p-3 text-lg text-muted-foreground/60">
									No preview.
								</p>
							)}
							<div className="flex items-center justify-between border-t bg-muted p-2 text-sm">
								<Tooltip
									delayDuration={200}
									text={new Date(doc.createdAt).toLocaleString('en-US', {
										year: 'numeric',
										month: '2-digit',
										day: '2-digit',
										hour: '2-digit',
										minute: '2-digit',
										second: '2-digit',
									})}
								>
									<p>
										Created{' '}
										<span className="underline">{timeAgo(doc.createdAt)}</span>
									</p>
								</Tooltip>
								<DropdownMenu>
									<DropdownMenuTrigger>
										<Button
											size="icon-sm"
											variant="ghost"
											onClick={e => e.stopPropagation()}
										>
											<DotsVerticalIcon />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<deleteDocumentFetcher.Form
											method="DELETE"
											action={`/api/model/document/${doc.id}`}
										>
											<DropdownMenuItem asChild>
												<Button
													variant="ghost"
													className="w-full justify-start"
													onClick={e => e.stopPropagation()}
												>
													Delete
												</Button>
											</DropdownMenuItem>
										</deleteDocumentFetcher.Form>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</Link>
					))}
					{!hasModules ? (
						<div className="col-span-full flex flex-col items-center justify-center rounded-lg border p-5">
							<h4 className="text-foreground/80">No modules</h4>
							<p className="text-muted-foreground">
								Come back later to check for modules to work through.
							</p>
						</div>
					) : data.documents.length === 0 ? (
						<div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed p-5">
							<h4 className="text-foreground/80">No documents</h4>
							<p className="text-muted-foreground">
								Hit the <code>+ New</code> button above to create your first
								document.
							</p>
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
