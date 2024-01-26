import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	type ClientLoaderFunctionArgs,
	Link,
	NavLink,
	Outlet,
	useLoaderData,
	type ClientActionFunctionArgs,
	useLocation,
} from '@remix-run/react'
import { useCallback, useEffect, useState } from 'react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ExitIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { useOnSwipe } from '#app/hooks/useHorizontalSwipe'
import { useUser } from '#app/hooks/useUser'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { cn, getUserImgSrc } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { ThemeSwitch, useTheme } from '../resources+/theme'

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
	const theme = useTheme()
	const location = useLocation()
	const user = useUser()
	const [isNavOpen, setIsNavOpen] = useState(false)

	const onSwipe = useCallback(
		(direction: 'left' | 'right') => {
			if (direction === 'right' && !isNavOpen) {
				setIsNavOpen(true)
			} else if (direction === 'left' && isNavOpen) {
				setIsNavOpen(false)
			}
		},
		[isNavOpen],
	)

	const swipeEvents = useOnSwipe({ onSwipe })

	// Close the navigation bar when the route changes
	useEffect(() => {
		setIsNavOpen(false)
	}, [location])

	return (
		<main
			className={cn('flex h-screen max-h-screen min-h-screen', {
				'overflow-hidden': isNavOpen,
			})}
		>
			<div className="fixed left-0 right-0 top-0 z-10 flex items-center justify-between overflow-hidden border-b bg-background p-2 sm:hidden">
				<Button
					variant="outline"
					size="icon"
					onClick={() => setIsNavOpen(true)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
						className="h-5 w-5"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
						/>
					</svg>
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={() => window.location.reload()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
						className="h-5 w-5"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
						/>
					</svg>
				</Button>
			</div>
			<nav
				className={cn(
					'z-20 flex h-screen w-[250px] min-w-[250px] -translate-x-full transform flex-col overflow-hidden border-r bg-background transition-transform duration-300 ease-in-out sm:flex sm:translate-x-0',
					{ 'translate-x-0': isNavOpen },
				)}
			>
				<div className="mx-2 mb-16 mt-1 flex justify-between p-2">
					<Link to=".">
						<img
							src={
								theme === 'dark'
									? '/img/yawp_white_logo.png'
									: '/img/yawp_black_logo.png'
							}
							alt="Logo on white background"
							className="h-auto w-24 rounded object-cover"
						/>
					</Link>
					<Button
						variant="outline"
						size="icon-sm"
						className="sm:hidden"
						onClick={() => setIsNavOpen(false)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth="1.5"
							stroke="currentColor"
							className="h-5 w-5"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M6 18 18 6M6 6l12 12"
							/>
						</svg>
					</Button>
				</div>
				<div className="grid gap-1 p-2">
					<h4 className="ml-2 text-sm">Assistants</h4>
					{assistants.data.map(assistant => (
						<NavLink
							key={assistant.id}
							className={getLinkStyles}
							to={`/assistants/${assistant.id}`}
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
									to={`/assistants/${assistantId}/${threadId}`}
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
				<div className="flex flex-col justify-end gap-2">
					<div className="flex gap-2 px-2">
						<Tooltip text="Sign out">
							<Button size="icon-sm" variant="outline" asChild>
								<Link to="/logout">
									<ExitIcon />
								</Link>
							</Button>
						</Tooltip>
						<ThemeSwitch buttonProps={{ variant: 'outline' }} />
					</div>
					<Link to="/assistants/profile">
						<div className="flex items-center gap-4 border-t p-2 pb-6 transition hover:bg-foreground/5 sm:pb-2 dark:hover:bg-foreground/10">
							<img
								src={getUserImgSrc(user.image?.id)}
								alt={user.name ?? user.email}
								className="h-8 w-8 min-w-8 rounded-full object-cover"
							/>
							<div>
								<p className="text-sm font-bold">{user.name}</p>
								<p className="text-sm text-muted-foreground">
									{startCase(user.roles[0]?.name)}
								</p>
							</div>
						</div>
					</Link>
				</div>
			</nav>
			<div
				className={cn(
					'h-[100vh - 3rem] relative min-w-full flex-grow -translate-x-[250px] overflow-y-scroll bg-foreground/[2%] transition-all duration-300 ease-in-out sm:w-full sm:min-w-0 sm:translate-x-0',
					{ 'translate-x-0 opacity-50': isNavOpen },
				)}
				onClick={isNavOpen ? () => setIsNavOpen(false) : undefined}
				{...swipeEvents}
			>
				<Outlet />
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
