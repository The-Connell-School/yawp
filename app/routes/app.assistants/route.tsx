import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	type ClientLoaderFunctionArgs,
	NavLink,
	Outlet,
	useLoaderData,
	type ClientActionFunctionArgs,
} from '@remix-run/react'
import { useContext } from 'react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { NavExpandedContext } from '../app/route'

const getLinkStyles = ({ isActive }: { isActive: boolean }) =>
	cn(
		'flex w-full items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-primary/15 dark:hover:bg-primary/20',
		{ 'bg-primary/10 dark:bg-primary/15 text-primary': isActive },
	)

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const [assistants, threads] = await Promise.all([
		openai.beta.assistants.list(),
		prisma.thread.findMany({
			where: { assistantMetadata: { userId } },
			select: {
				assistantMetadata: { select: { assistantId: true } },
				threadId: true,
				name: true,
			},
		}),
	])

	return json({ assistants, threads })
}

export async function clientLoader({ serverLoader }: ClientLoaderFunctionArgs) {
	let isInitialRequest = true
	const cacheKey = 'openai-assistants'

	if (isInitialRequest) {
		isInitialRequest = false
		const serverData = await serverLoader()
		sessionStorage.setItem(cacheKey, JSON.stringify(serverData))
		return serverData
	}

	const cachedData = JSON.parse(
		sessionStorage.getItem(cacheKey) ?? '{}',
	) as ReturnType<typeof loader>

	if (cachedData) {
		return cachedData
	}

	const serverData = await serverLoader()
	sessionStorage.setItem(cacheKey, JSON.stringify(serverData))
	return serverData
}

clientLoader.hydrate = true

export async function clientAction({ serverAction }: ClientActionFunctionArgs) {
	const cacheKey = 'openai-assistants'
	sessionStorage.removeItem(cacheKey)
	const serverData = await serverAction()
	return serverData
}

export default function Route() {
	const { assistants, threads } = useLoaderData<typeof loader>()
	const { isMobileNavOpen, setIsMobileNavOpen } = useContext(NavExpandedContext)

	return (
		<main
			className={cn('flex h-screen max-h-screen min-h-screen', {
				'overflow-hidden': isMobileNavOpen,
			})}
		>
			<nav
				className={cn(
					'z-20 flex h-screen w-[250px] min-w-[250px] -translate-x-full transform flex-col overflow-hidden border-r bg-background transition-transform duration-300 ease-in-out sm:flex sm:translate-x-0',
					{ 'translate-x-[190px]': isMobileNavOpen },
				)}
			>
				<div className="grid gap-1 p-2 pt-5">
					<h4 className="ml-2 text-sm">Assistants</h4>
					{assistants.data.map(assistant => (
						<NavLink
							key={assistant.id}
							className={getLinkStyles}
							to={`/app/assistants/${assistant.id}`}
							end
						>
							<span className="w-[189px] truncate">{assistant.name}</span>
						</NavLink>
					))}
				</div>
				<h4 className="ml-4 mt-4 text-sm">Conversations</h4>
				<div className="flex min-h-[90px] flex-grow flex-col gap-1 overflow-scroll p-2">
					{threads.flat().length > 0 ? (
						threads
							.flat()
							.map(({ assistantMetadata: { assistantId }, threadId, name }) => (
								<NavLink
									key={threadId}
									className={getLinkStyles}
									to={`/app/assistants/${assistantId}/${threadId}`}
								>
									<span className="w-[189px] truncate">{name}</span>
								</NavLink>
							))
					) : (
						<p className="ml-2 mt-1 text-sm text-muted-foreground/70">
							Start a conversation above.
						</p>
					)}
				</div>
			</nav>
			<div
				className={cn(
					'h-[100vh - 3rem] relative min-w-full flex-grow -translate-x-[250px] overflow-y-scroll bg-foreground/[2%] transition-all duration-300 ease-in-out sm:w-full sm:min-w-0 sm:translate-x-0',
					{ 'translate-x-0 opacity-50': isMobileNavOpen },
				)}
				onClick={isMobileNavOpen ? () => setIsMobileNavOpen(false) : undefined}
			>
				<Outlet />
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
