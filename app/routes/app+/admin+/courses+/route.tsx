import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { NavLink, useLoaderData, useSearchParams } from '@remix-run/react'
import { ImageIcon } from 'lucide-react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ListLayout } from '#app/components/list-layout.js'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const courses = await prisma.course.findMany({
		include: { image: true },
		where: {
			...(query
				? {
						OR: [
							{ title: { contains: query } },
							{ description: { contains: query } },
						],
					}
				: {}),
		},
	})

	return json({ courses })
}

export default function CoursesRoute() {
	const { courses } = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	return (
		<ListLayout path="admin/courses">
			{courses.length > 0 ? (
				courses.map(course => (
					<NavLink
						key={course.id}
						to={`/app/admin/courses/${course.id}?q=${searchParams.get('q') ?? ''}`}
						className={({ isActive }) =>
							cn(
								'flex cursor-pointer items-center rounded border transition hover:bg-muted/50',
								{
									'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10':
										isActive,
								},
							)
						}
					>
						{course.image ? (
							<img
								src={`/api/image/course/${course.image.id}`}
								alt={course.title}
								className="h-16 w-16 rounded-l object-cover"
							/>
						) : (
							<div className="flex h-16 w-16 min-w-16 items-center justify-center rounded-l bg-muted">
								<ImageIcon
									size={25}
									className="text-muted-foreground opacity-30"
								/>
							</div>
						)}
						<div className="overflow-hidden p-2">
							<p className="font-bold">{course.title || 'Untitled course'}</p>
							<p
								className="truncate text-muted-foreground/80"
								style={{ maxWidth: '100%' }}
							>
								{course.description || 'No description available.'}
							</p>
						</div>
					</NavLink>
				))
			) : (
				<div className="flex h-full w-full flex-col items-center justify-center gap-1">
					<h3>No courses found.</h3>
					<p>
						Hit the <code className="bg-foreground/10 px-1">+</code> button
						above to create one.
					</p>
				</div>
			)}
		</ListLayout>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
