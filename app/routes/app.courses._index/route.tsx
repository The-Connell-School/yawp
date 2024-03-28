import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { MixIcon, RocketIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { useUser } from '#app/hooks/useUser'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const [courses, courseModuleSession] = await Promise.all([
		prisma.course.findMany({
			orderBy: { createdAt: 'asc' },
			select: {
				id: true,
				title: true,
				description: true,
				image: true,
				courseModules: {
					select: { instructions: true, id: true, position: true },
				},
			},
		}),
		prisma.courseModuleSession.findFirst({
			where: { userId },
			orderBy: [
				{ courseModule: { course: { position: 'desc' } } },
				{ courseModule: { position: 'desc' } },
			],
			select: {
				courseModule: { select: { id: true } },
				instructionsCompleted: true,
			},
		}),
	])

	if (!courseModuleSession) {
		return json({
			courses,
			currentCourseModuleId: courses[0]?.courseModules[0]?.id,
			isStarting: true,
		})
	}

	let currentCourseModuleId: string | undefined

	courses.forEach(course => {
		const courseModule = course.courseModules.find(
			cm => cm.id === courseModuleSession.courseModule.id,
		)

		if (!courseModule) return

		if (
			courseModule.instructions.length ===
			courseModuleSession.instructionsCompleted
		) {
			currentCourseModuleId = course.courseModules.find(
				cm => cm.position === courseModule.position + 1,
			)?.id
		} else {
			currentCourseModuleId = courseModule.id
		}
	})

	return json({ courses, currentCourseModuleId, isStarting: false })
}

export default function Route() {
	const { courses, currentCourseModuleId, isStarting } =
		useLoaderData<typeof loader>()
	const user = useUser()

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex w-full justify-between border-b bg-muted">
				<div className="relative mx-auto w-full max-w-screen-lg p-3 pt-20 sm:p-5 sm:pt-10">
					<div className="flex max-w-[200px] flex-col sm:max-w-[400px]">
						<h2>Welcome, {user.name}!</h2>
						<p className="mt-3 max-w-[200px] text-muted-foreground">
							{currentCourseModuleId
								? isStarting
									? 'Hit the button to the right to get started!'
									: 'Hit the button to the right to pickup where you left off.'
								: "You've completed all the modules. Check back later for new content."}
						</p>
					</div>
					{currentCourseModuleId ? (
						<Button
							asChild
							className="absolute right-3 top-20 sm:right-5 sm:top-10"
						>
							<Link to={`/app/modules/${currentCourseModuleId}`}>
								{isStarting ? 'Get started' : 'Lets Go!'}{' '}
								<RocketIcon className="ml-2" />
							</Link>
						</Button>
					) : null}
				</div>
			</div>
			<ul className="mx-auto flex w-full max-w-screen-lg flex-col gap-3 p-3 sm:p-5">
				{courses.map(course => (
					<li key={course.id}>
						<Link
							to={`/app/courses/${course.id}`}
							className="flex h-full rounded-lg border shadow-sm transition hover:shadow-lg"
						>
							{course.image ? (
								<img
									src={`/api/course-images/${course.image.id}`}
									alt={course.title}
									className="h-auto w-1/4 max-w-[150px] rounded-l-lg object-cover"
								/>
							) : null}
							<div className="flex flex-col gap-1 p-4">
								<h4 className="text-xl">{course.title}</h4>
								<p className="flex-grow text-sm">{course.description}</p>
								<div className="flex items-center">
									<MixIcon className="mr-1 text-muted-foreground" />
									<p className="text-sm text-muted-foreground">
										{course.courseModules.length}{' '}
										{course.courseModules.length === 1 ? 'Module' : 'Modules'}
									</p>
								</div>
							</div>
						</Link>
					</li>
				))}
			</ul>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
