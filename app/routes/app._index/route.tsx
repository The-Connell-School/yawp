import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, redirect, useLoaderData } from '@remix-run/react'
import { useUser } from '#app/hooks/useUser.js'
import { requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'

export async function loader({ request }: LoaderFunctionArgs) {
	if (process.env.ENV !== 'staging') return redirect('/app/assistants')

	await requireUserId(request)
	const courses = await prisma.course.findMany({
		select: { image: { select: { id: true } }, id: true, title: true },
	})

	return json({ courses })
}

export default function AppRoute() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const isTeacher = user.teacherProfile !== null

	return (
		<section data-testid="app._index" className="flex h-full w-full flex-col">
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
			<div className="mx-auto w-full max-w-screen-lg px-3 py-3 sm:px-5">
				<div className="flex flex-col">
					<h2 className="my-2 text-foreground/70">Courses</h2>
					<div className="flex gap-2">
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
										className="h-32 w-48 rounded-t-lg object-cover"
									/>
								) : (
									<div className="h-32 w-48 rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20" />
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
