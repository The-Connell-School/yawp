import {
	Link,
	NavLink,
	Outlet,
	json,
	useLoaderData,
	useLocation,
	useMatches,
} from '@remix-run/react'
import { AwardIcon } from 'lucide-react'
import {
	useCallback,
	useEffect,
	useState,
	cloneElement,
	type ReactElement,
	createContext,
} from 'react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import {
	AssistantIcon,
	ExitIcon,
	GearIcon,
	HamburgerIcon,
	LayersIcon,
	LockClosedIcon,
	PersonIcon,
	ReloadIcon,
	SlashIcon,
	XIcon,
} from '#app/components/icons'
import { Button, button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { UserImage } from '#app/components/user-image.js'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { useOnSwipe } from '#app/hooks/useHorizontalSwipe'
import { useUser } from '#app/hooks/useUser'
import {
	BreadcrumbHandleMatch,
	type BreadcrumbHandle,
} from '#app/utils/breadcrumb'
import { cn } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { NavStateSwitch, useNavState } from '../api+/preferences+/nav/route'
import { ThemeSwitch, useTheme } from '../api+/preferences+/theme/route'

const links = (
	isStaging: boolean,
): {
	icon?: ReactElement
	to: string
	label: string
	admin?: boolean
	teacher?: boolean
	end?: boolean
}[] => [
	...(isStaging
		? [
				{
					to: '/app',
					label: 'Dashboard',
					end: true,
					icon: <LayersIcon />,
				},
			]
		: []),
	{
		to: '/app/assistants',
		label: 'Assistants',
		icon: <AssistantIcon />,
	},
	...(isStaging
		? [
				{
					to: '/app/students',
					label: 'Students',
					icon: <PersonIcon />,
					teacher: true,
				},
				{
					to: '/app/settings',
					label: 'Settings',
					icon: <GearIcon />,
					admin: true,
				},
			]
		: []),
]

export const NavExpandedContext = createContext({
	isMobileNavOpen: false,
	setIsMobileNavOpen: (() => {}) as any,
})

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Home',
}

export async function loader() {
	return json({ isStaging: process.env.ENV === 'staging' })
}

export default function Route() {
	const theme = useTheme()
	const location = useLocation()
	const user = useUser()
	const isAdmin = user.roles.find(r => r.name === 'admin')
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
	const { isStaging } = useLoaderData<typeof loader>()

	const matches = useMatches()
	const isInAssistants = !!matches.find(m => m.id.includes('app.assistants'))

	const navState = useNavState()
	const breakpoint = useBreakpoint()
	const isMobile = breakpoint === 'base' || breakpoint === 'sm'
	const isNavExpanded = navState === 'expanded' || isMobile
	const navExpanded = (isMobile && isMobileNavOpen) || isNavExpanded

	const breadcrumbs = matches
		.map(m => {
			const result = BreadcrumbHandleMatch.safeParse(m)
			if (!result.success || !result.data.handle.breadcrumb) return null
			if (typeof result.data.handle.breadcrumb !== 'string')
				return result.data.handle.breadcrumb
			return (
				<Link
					key={m.id}
					to={m.pathname}
					className={button({ variant: 'ghost', size: 'sm' })}
				>
					{result.data.handle.breadcrumb}
				</Link>
			)
		})
		.filter(Boolean)

	const onSwipe = useCallback(
		(direction: 'left' | 'right') => {
			if (direction === 'right' && !isMobileNavOpen) {
				setIsMobileNavOpen(true)
			} else if (direction === 'left' && isMobileNavOpen) {
				setIsMobileNavOpen(false)
			}
		},
		[isMobileNavOpen],
	)

	const swipeEvents = useOnSwipe({ onSwipe })

	// Close the navigation bar when the route changes
	useEffect(() => {
		setIsMobileNavOpen(false)
	}, [location])

	return (
		<main
			className={cn('flex h-screen min-h-screen overflow-hidden', {
				'overflow-hidden': isMobileNavOpen,
			})}
		>
			{/* Left navigation panel */}
			<nav
				className={cn(
					'z-20 flex h-full w-[190px] min-w-[190px] -translate-x-full transform flex-col border-r bg-background transition-all duration-300 ease-in-out sm:translate-x-0',
					{
						'translate-x-0': isMobileNavOpen,
						'w-[56px] min-w-0 items-center': !navExpanded,
					},
				)}
			>
				<div
					className={cn('mx-2 mt-1 flex justify-between py-2', {
						'p-3': navExpanded,
					})}
				>
					<Link to=".">
						<img
							src={
								theme === 'dark'
									? '/img/logo_for_dark_mode.png'
									: '/img/logo_for_light_mode.png'
							}
							alt="Logo on white background"
							className={cn('h-auto w-10 rounded object-cover py-2', {
								'w-24': navExpanded,
							})}
						/>
					</Link>
					<Button
						variant="outline"
						size="icon-sm"
						className="sm:hidden"
						onClick={() => setIsMobileNavOpen(false)}
					>
						<XIcon />
					</Button>
				</div>
				<div className="grid gap-1 p-3">
					{links(isStaging)
						.filter(
							link =>
								(!link.admin && !link.teacher) ||
								(link.admin && isAdmin) ||
								(link.teacher && (user.teacherProfile || isAdmin)),
						)
						.map(link => (
							<NavLink
								key={link.to}
								className={({ isActive }) =>
									cn(
										'flex w-full items-center gap-2 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground',
										{
											'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary':
												isActive,
											'py-2': !navExpanded,
										},
									)
								}
								to={link.to}
								end={link.end}
							>
								{link.icon ? (
									navExpanded ? (
										cloneElement(link.icon, { className: 'w-5 h-5' })
									) : (
										<Tooltip
											key={link.to}
											text={link.label}
											open={navExpanded ? false : undefined}
											contentProps={{ side: 'right' }}
										>
											{cloneElement(link.icon, { className: 'w-5 h-5' })}
										</Tooltip>
									)
								) : null}
								{navExpanded ? (
									<>
										<span className="w-full">{link.label}</span>
										{link.teacher ? (
											<Tooltip text="Teachers only">
												<AwardIcon className="h-5 w-5" />
											</Tooltip>
										) : null}
										{link.admin ? (
											<Tooltip text="Admin only">
												<LockClosedIcon className="h-5 w-5" />
											</Tooltip>
										) : null}
									</>
								) : null}
							</NavLink>
						))}
				</div>
				<div className="flex flex-grow flex-col justify-end gap-2">
					<div className={cn('flex px-2', { 'flex-col': !navExpanded })}>
						<Tooltip text="Sign out">
							<Button size="icon-sm" variant="ghost" asChild>
								<Link to="/logout">
									<ExitIcon />
								</Link>
							</Button>
						</Tooltip>
						<ThemeSwitch buttonProps={{ variant: 'ghost' }} />
						{!isMobile ? (
							<div className={navExpanded ? 'ml-auto' : undefined}>
								<NavStateSwitch buttonProps={{ variant: 'ghost' }} />
							</div>
						) : null}
					</div>
					<Link to="/app/profile">
						<div className="flex items-center gap-4 border-t p-3 pb-6 transition hover:bg-foreground/5 dark:hover:bg-foreground/10 sm:pb-3">
							<UserImage user={user} size="xs" />
							{navExpanded ? (
								<div>
									<p className="text-sm font-bold">{user.name}</p>
									<p className="text-sm text-muted-foreground">
										{startCase(user.roles[0]?.name)}
									</p>
								</div>
							) : null}
						</div>
					</Link>
				</div>
			</nav>
			<div
				className={cn(
					'min-w-full flex-1 transition-all duration-300 ease-in-out sm:min-w-0 sm:translate-x-0',
					{
						'translate-x-0': isMobileNavOpen,
						'-translate-x-[190px]': isNavExpanded,
						'opacity-50': !isInAssistants && isMobileNavOpen,
					},
				)}
				onClick={
					isMobileNavOpen && !isInAssistants
						? () => setIsMobileNavOpen(false)
						: undefined
				}
				{...swipeEvents}
			>
				{/* Mobile top menu */}
				<div
					className={cn(
						'flex items-center justify-between border-b bg-background p-2 sm:hidden',
						{ 'opacity-50': !isInAssistants && isMobileNavOpen },
					)}
				>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setIsMobileNavOpen(true)}
					>
						<HamburgerIcon />
					</Button>
					<div className="flex items-center">
						{breadcrumbs.map((bc, i) => (
							<slot key={bc.key}>
								{i === 0 ? (
									bc
								) : (
									<>
										<SlashIcon />
										{bc}
									</>
								)}
							</slot>
						))}
					</div>
					<Button
						variant="outline"
						size="icon"
						onClick={() => window.location.reload()}
					>
						<ReloadIcon />
					</Button>
				</div>
				<NavExpandedContext.Provider
					value={{ isMobileNavOpen, setIsMobileNavOpen }}
				>
					<Outlet />
				</NavExpandedContext.Provider>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
