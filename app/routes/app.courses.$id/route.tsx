import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, redirect, useLoaderData } from '@remix-run/react'
import { ArrowRight, Check } from 'lucide-react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import {
	ArrowRightIcon,
	CaretLeftIcon,
	CheckCircledIcon,
	MixIcon,
} from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const [course, courseModuleSessions] = await Promise.all([
		prisma.course.findUnique({
			where: { id: params.id },
			include: {
				image: true,
				courseModules: {
					include: { instructions: true },
					orderBy: { createdAt: 'asc' },
				},
			},
		}),
		prisma.courseModuleSession.findMany({
			where: { userId, courseModule: { courseId: params.id } },
		}),
	])

	if (!course) {
		return redirect('/app/courses')
	}

	return json({ course, courseModuleSessions })
}

export default function Route() {
	const { course, courseModuleSessions } = useLoaderData<typeof loader>()
	const courseModules = course.courseModules.reduce(
		(acc, courseModule) => {
			const courseModuleSession = courseModuleSessions.find(
				cms => cms.courseModuleId === courseModule.id,
			)

			acc.push({
				id: courseModule.id,
				title: courseModule.title,
				description: courseModule.description,
				pctComplete: courseModuleSession
					? courseModule.instructions.length > 0
						? Math.floor(
								(courseModuleSession.instructionsCompleted /
									courseModule.instructions.length) *
									100,
							)
						: 100
					: 0,
			})

			return acc
		},
		[] as {
			pctComplete: number
			title: string
			description: string | null
			id: string
		}[],
	)

	const pctComplete = Math.floor(
		(courseModules.reduce(
			(acc, courseModule) => acc + courseModule.pctComplete,
			0,
		) /
			(courseModules.length * 100)) *
			100,
	)

	const isFinished = courseModules.length > 0 && pctComplete >= 100
	const nextCourseModuleId =
		courseModules.length === 0
			? null
			: courseModules.find(cm => cm.pctComplete < 100)?.id ?? null

	return (
		<div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 pt-20 sm:p-5 sm:pt-10">
			<Button asChild variant="outline">
				<Link to="/app/courses" className="mb-4 w-fit">
					<CaretLeftIcon className="mr-1 h-5 w-5" /> Back to Courses
				</Link>
			</Button>
			<div className="flex flex-col items-start gap-6 pb-6 sm:flex-row lg:items-end">
				{course.image ? (
					<img
						src={`/api/course-images/${course.image.id}`}
						alt={course.title}
						className="h-auto w-screen min-w-[170px] max-w-[250px] rounded-lg object-cover"
					/>
				) : null}
				<div className="flex flex-col gap-3">
					<h1 className="text-3xl font-bold">{course.title}</h1>
					<p className="text-sm sm:text-base">{course.description}</p>
				</div>
			</div>
			<div className="border-b border-foreground/5" />
			<div className="flex justify-between">
				<div className="flex flex-grow items-center justify-center border-r border-foreground/5 pr-2">
					<MixIcon className="mr-2 h-5 w-5 text-muted-foreground" />
					<p>
						{course.courseModules.length}{' '}
						{course.courseModules.length === 1 ? 'module' : 'modules'}
					</p>
				</div>
				<div className="flex flex-grow items-center justify-center border-r border-foreground/5 pr-2">
					<CheckCircledIcon
						className={cn('mr-1 h-5 w-5 text-muted-foreground', {
							'text-green-700': pctComplete >= 100,
						})}
					/>
					<p className={cn({ 'text-green-700': pctComplete >= 100 })}>
						{isNaN(pctComplete) ? '0%' : `${pctComplete}% `} complete
					</p>
				</div>
				<div className="flex flex-grow justify-center">
					{isFinished ? (
						<Button disabled className="my-1">
							Finished
						</Button>
					) : nextCourseModuleId ? (
						<Button asChild>
							<Link to={`/app/modules/${nextCourseModuleId}`} className="my-1">
								{pctComplete >= 100
									? 'Completed'
									: pctComplete === 0
										? 'Get Started'
										: 'Continue'}{' '}
								<ArrowRightIcon className="ml-2" />
							</Link>
						</Button>
					) : (
						<Button disabled className="my-1">
							No modules
						</Button>
					)}
				</div>
			</div>
			<div className="border-b border-foreground/5" />
			<div className="flex flex-col gap-3 pb-10 pt-6">
				{courseModules.map(courseModule => (
					<Link
						key={courseModule.id}
						to={`/app/modules/${courseModule.id}`}
						className="relative flex flex-col justify-between overflow-hidden rounded-lg border hover:bg-foreground/5"
					>
						<div className="p-3">
							<h2 className="text-lg font-bold">{courseModule.title}</h2>
							<p className="text-sm">{courseModule.description}</p>
						</div>
						<div className="mt-2 flex items-center px-3 pb-3">
							<p className="text-muted-foreground">
								{courseModule.pctComplete === 0
									? 'Not started'
									: courseModule.pctComplete >= 100
										? 'Completed'
										: 'In progress'}
							</p>
							{courseModule.pctComplete >= 100 ? (
								<Check className="ml-2 h-5 w-5 text-muted-foreground" />
							) : (
								<ArrowRight className="ml-2 h-5 w-5 text-muted-foreground" />
							)}
						</div>
						<div
							className="h-1.5 rounded-r bg-green-600"
							style={{ width: `${courseModule.pctComplete}%` }}
						/>
					</Link>
				))}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
