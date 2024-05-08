import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { NavLink, useLoaderData, useSearchParams } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ListLayout } from '#app/components/list-layout.js'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const ffs = await prisma.featureFlag.findMany({
		where: {
			...(query ? { name: { contains: query } } : {}),
		},
	})

	return json({ ffs })
}

export default function TeachersRoute() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	return (
		<ListLayout path="admin/feature-flags">
			{data.ffs.length === 0 ? (
				<div className="mt-12 flex h-full w-full flex-col items-center justify-center gap-1">
					<h3>No feature flags found.</h3>
					<p>
						Hit the <code className="bg-foreground/10 px-1">+</code> button
						above to create one.
					</p>
				</div>
			) : null}
			{data.ffs.map(ff => (
				<NavLink
					key={ff.id}
					to={`/app/admin/feature-flags/${ff.name}?q=${searchParams.get('q') ?? ''}`}
					className={({ isActive }) =>
						cn(
							'flex cursor-pointer items-center gap-2 rounded border p-1.5 shadow-sm transition hover:bg-muted/50 md:p-3',
							{
								'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10':
									isActive,
							},
						)
					}
				>
					<p className="font-bold">{ff.name}</p>
					<p className="font-muted-foreground text-sm">{ff.description}</p>
				</NavLink>
			))}
		</ListLayout>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
