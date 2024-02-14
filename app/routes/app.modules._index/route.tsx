import { type LoaderFunctionArgs, json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { useUser } from '#app/hooks/useUser'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const modules = await prisma.module_.findMany({
		orderBy: { position: 'asc' },
		select: {
			_count: { select: { instructions: true } },
			id: true,
			title: true,
			description: true,
		},
	})
	const session = await prisma.moduleSession.findFirst({
		where: { userId },
		orderBy: { module: { position: 'desc' } },
		select: { module: { select: { id: true } }, instructionsCompleted: true },
	})

	if (!session) {
		return json({ modules, nextModuleId: modules[0]?.id, isStarting: true })
	}

	const nextModule = modules.find(module_ => module_.id === session?.module.id)!
	const nextModuleId =
		nextModule._count.instructions === session.instructionsCompleted
			? modules[modules.indexOf(nextModule) + 1]?.id
			: nextModule.id

	return json({ modules, nextModuleId, isStarting: false })
}

export default function Route() {
	const { modules, nextModuleId, isStarting } = useLoaderData<typeof loader>()
	const user = useUser()

	return (
		<div className="mx-auto flex h-full w-full max-w-screen-lg flex-col p-2">
			{nextModuleId ? (
				<div className="mt-10 flex justify-between rounded-lg border p-5">
					<div className="flex flex-col">
						<h2>Welcome, {user.name}!</h2>
						<p className="max-w-[600px]">
							Get started by working through the modules below. Hit the button
							to the right to pickup where you left off.
						</p>
					</div>
					<Link
						to={`/app/modules/${nextModuleId}`}
						className="flex h-full w-[100px] items-center justify-center rounded-md bg-primary/20 transition-colors hover:bg-primary/30"
					>
						{isStarting ? 'Begin' : 'Continue'}
					</Link>
				</div>
			) : (
				<div className="mt-10 flex justify-between rounded-lg border p-5">
					<div className="flex flex-col">
						<h2>Welcome, {user.name}!</h2>
						<p className="max-w-[600px]">
							You've completed all the modules. Check back later for new
							content.
						</p>
					</div>
				</div>
			)}
			<ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
				{modules.map(module_ => (
					<li key={module_.id}>
						<Link
							to={`/app/modules/${module_.id}`}
							className="flex flex-col gap-2 rounded-lg border px-6 py-6 transition-colors hover:bg-foreground/[2%]"
						>
							<h4>{module_.title}</h4>
							<p>{module_.description}</p>
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
