import {
	Link,
	NavLink,
	Outlet,
	useLocation,
	useMatches,
} from '@remix-run/react'
import {
	useCallback,
	useEffect,
	useState,
	cloneElement,
	type ReactElement,
} from 'react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import {
	BellIcon,
	ExitIcon,
	GearIcon,
	HamburgerIcon,
	HomeIcon,
	LayersIcon,
	LockClosedIcon,
	ReloadIcon,
	SlashIcon,
	XIcon,
} from '#app/components/icons'
import { Button, button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { useOnSwipe } from '#app/hooks/useHorizontalSwipe'
import { useUser } from '#app/hooks/useUser'
import {
	BreadcrumbHandleMatch,
	type BreadcrumbHandle,
} from '#app/utils/breadcrumb'
import { cn, getUserImgSrc } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { NavStateSwitch, useNavState } from '../resources+/nav-state'
import { ThemeSwitch, useTheme } from '../resources+/theme'

const links: {
	icon?: ReactElement
	to: string
	label: string
	admin?: boolean
	end?: boolean
}[] = [
	{
		to: '/app',
		label: 'Home',
		icon: <HomeIcon />,
		end: true,
	},
	{
		to: '/app/modules',
		label: 'Modules',
		icon: <LayersIcon />,
	},
	{
		to: '/app/notifications',
		label: 'Notifications',
		icon: <BellIcon />,
	},
	{
		to: '/app/settings',
		label: 'Settings',
		icon: <GearIcon />,
		admin: true,
	},
]

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Home',
}

export default function Route() {
	const theme = useTheme()
	const location = useLocation()
	const user = useUser()
	const isAdmin = user.roles.find(r => r.name === 'admin')
	const [isMobileNavOpen, setMobileNavOpen] = useState(false)

	const navState = useNavState()
	const isNavExpanded = navState === 'expanded'
	const breakpoint = useBreakpoint()
	const isMobile = breakpoint === 'base' || breakpoint === 'sm'
	const navExpanded = isMobile || isNavExpanded

	const matches = useMatches()
	const breadcrumbs = matches
		.map(m => {
			const result = BreadcrumbHandleMatch.safeParse(m)
			if (!result.success || !result.data.handle.breadcrumb) return null
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
				setMobileNavOpen(true)
			} else if (direction === 'left' && isMobileNavOpen) {
				setMobileNavOpen(false)
			}
		},
		[isMobileNavOpen],
	)

	const swipeEvents = useOnSwipe({ onSwipe })

	// Close the navigation bar when the route changes
	useEffect(() => {
		setMobileNavOpen(false)
	}, [location])

	return (
		<main
			className={cn('flex h-screen max-h-screen min-h-screen', {
				'overflow-hidden': isMobileNavOpen,
			})}
		>
			{/* Mobile top menu */}
			<div className="fixed left-0 right-0 top-0 z-10 flex items-center justify-between overflow-hidden border-b bg-background p-2 sm:hidden">
				<Button
					variant="outline"
					size="icon"
					onClick={() => setMobileNavOpen(true)}
				>
					<HamburgerIcon />
				</Button>
				<div className="flex items-center">
					{breadcrumbs.map((bc, i) => (
						<slot key={bc.toString()}>
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
			{/* Left navigation panel */}
			<nav
				className={cn(
					'z-20 flex h-screen w-[240px] min-w-[240px] -translate-x-full transform flex-col overflow-hidden border-r bg-background transition-all duration-300 ease-in-out sm:flex sm:translate-x-0 ',
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
									? '/img/yawp_white_logo.png'
									: '/img/yawp_black_logo.png'
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
						onClick={() => setMobileNavOpen(false)}
					>
						<XIcon />
					</Button>
				</div>
				<div className="grid gap-1 p-3">
					{links
						.filter(link => !link.admin || (link.admin && isAdmin))
						.map(link => (
							<NavLink
								key={link.to}
								className={({ isActive }) =>
									cn(
										'flex w-full items-center gap-2 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-primary/15 dark:hover:bg-primary/20',
										{
											'bg-primary/10 text-primary dark:bg-primary/15': isActive,
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
										{link.admin ? (
											<Tooltip text="Admin only">
												<LockClosedIcon />
											</Tooltip>
										) : null}
									</>
								) : null}
							</NavLink>
						))}
				</div>
				<div className="flex flex-grow flex-col justify-end gap-2">
					<div className={cn('flex gap-2 px-2', { 'flex-col': !navExpanded })}>
						<Tooltip text="Sign out">
							<Button size="icon-sm" variant="outline" asChild>
								<Link to="/logout">
									<ExitIcon />
								</Link>
							</Button>
						</Tooltip>
						<ThemeSwitch buttonProps={{ variant: 'outline' }} />
						{!isMobile ? (
							<div className={navExpanded ? 'ml-auto' : undefined}>
								<NavStateSwitch buttonProps={{ variant: 'outline' }} />
							</div>
						) : null}
					</div>
					<Link to="/assistants/profile">
						<div className="flex items-center gap-4 border-t p-2 pb-6 transition hover:bg-foreground/5 dark:hover:bg-foreground/10 sm:pb-2">
							<img
								src={getUserImgSrc(user.image?.id)}
								alt={user.name ?? user.email}
								className="h-8 w-8 min-w-8 rounded-full object-cover"
							/>
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
					'h-[100vh - 3rem] relative min-w-full flex-grow -translate-x-[250px] overflow-y-scroll transition-all duration-300 ease-in-out sm:w-full sm:min-w-0 sm:translate-x-0',
					{ 'translate-x-0 opacity-50': isMobileNavOpen },
				)}
				onClick={isMobileNavOpen ? () => setMobileNavOpen(false) : undefined}
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
