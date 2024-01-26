import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, Outlet } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ExitIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { useUser } from '#app/hooks/useUser'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { getUserImgSrc } from '#app/utils/misc'
import { startCase } from '#app/utils/startCase'
import { ThemeSwitch } from '../resources+/theme'
import { SidebarSection } from './sidebar-link'

const mainLinks = [
	{
		to: '/app',
		label: 'Home',
		isDisabled: true,
		badge: 'Coming soon',
		icon: (
			<svg
				width="18"
				height="26"
				viewBox="0 0 15 15"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					fill="currentColor"
					fill-rule="evenodd"
					d="M2.8 1h-.05c-.229 0-.426 0-.6.041A1.5 1.5 0 0 0 1.04 2.15c-.04.174-.04.37-.04.6v2.5c0 .229 0 .426.041.6A1.5 1.5 0 0 0 2.15 6.96c.174.04.37.04.6.04h2.5c.229 0 .426 0 .6-.041A1.5 1.5 0 0 0 6.96 5.85c.04-.174.04-.37.04-.6v-2.5c0-.229 0-.426-.041-.6A1.5 1.5 0 0 0 5.85 1.04C5.676 1 5.48 1 5.25 1H5.2zm-.417 1.014c.043-.01.11-.014.417-.014h2.4c.308 0 .374.003.417.014a.5.5 0 0 1 .37.37c.01.042.013.108.013.416v2.4c0 .308-.003.374-.014.417a.5.5 0 0 1-.37.37C5.575 5.996 5.509 6 5.2 6H2.8c-.308 0-.374-.003-.417-.014a.5.5 0 0 1-.37-.37C2.004 5.575 2 5.509 2 5.2V2.8c0-.308.003-.374.014-.417a.5.5 0 0 1 .37-.37M9.8 1h-.05c-.229 0-.426 0-.6.041A1.5 1.5 0 0 0 8.04 2.15c-.04.174-.04.37-.04.6v2.5c0 .229 0 .426.041.6A1.5 1.5 0 0 0 9.15 6.96c.174.04.37.04.6.04h2.5c.229 0 .426 0 .6-.041a1.5 1.5 0 0 0 1.11-1.109c.04-.174.04-.37.04-.6v-2.5c0-.229 0-.426-.041-.6a1.5 1.5 0 0 0-1.109-1.11c-.174-.04-.37-.04-.6-.04h-.05zm-.417 1.014c.043-.01.11-.014.417-.014h2.4c.308 0 .374.003.417.014a.5.5 0 0 1 .37.37c.01.042.013.108.013.416v2.4c0 .308-.004.374-.014.417a.5.5 0 0 1-.37.37c-.042.01-.108.013-.416.013H9.8c-.308 0-.374-.003-.417-.014a.5.5 0 0 1-.37-.37C9.004 5.575 9 5.509 9 5.2V2.8c0-.308.003-.374.014-.417a.5.5 0 0 1 .37-.37M2.75 8h2.5c.229 0 .426 0 .6.041A1.5 1.5 0 0 1 6.96 9.15c.04.174.04.37.04.6v2.5c0 .229 0 .426-.041.6a1.5 1.5 0 0 1-1.109 1.11c-.174.04-.37.04-.6.04h-2.5c-.229 0-.426 0-.6-.041a1.5 1.5 0 0 1-1.11-1.109c-.04-.174-.04-.37-.04-.6v-2.5c0-.229 0-.426.041-.6A1.5 1.5 0 0 1 2.15 8.04c.174-.04.37-.04.6-.04m.05 1c-.308 0-.374.003-.417.014a.5.5 0 0 0-.37.37C2.004 9.425 2 9.491 2 9.8v2.4c0 .308.003.374.014.417a.5.5 0 0 0 .37.37c.042.01.108.013.416.013h2.4c.308 0 .374-.004.417-.014a.5.5 0 0 0 .37-.37c.01-.042.013-.108.013-.416V9.8c0-.308-.003-.374-.014-.417a.5.5 0 0 0-.37-.37C5.575 9.004 5.509 9 5.2 9zm7-1h-.05c-.229 0-.426 0-.6.041A1.5 1.5 0 0 0 8.04 9.15c-.04.174-.04.37-.04.6v2.5c0 .229 0 .426.041.6a1.5 1.5 0 0 0 1.109 1.11c.174.041.371.041.6.041h2.5c.229 0 .426 0 .6-.041a1.5 1.5 0 0 0 1.109-1.109c.041-.174.041-.371.041-.6V9.75c0-.229 0-.426-.041-.6a1.5 1.5 0 0 0-1.109-1.11c-.174-.04-.37-.04-.6-.04h-.05zm-.417 1.014c.043-.01.11-.014.417-.014h2.4c.308 0 .374.003.417.014a.5.5 0 0 1 .37.37c.01.042.013.108.013.416v2.4c0 .308-.004.374-.014.417a.5.5 0 0 1-.37.37c-.042.01-.108.013-.416.013H9.8c-.308 0-.374-.004-.417-.014a.5.5 0 0 1-.37-.37C9.004 12.575 9 12.509 9 12.2V9.8c0-.308.003-.374.014-.417a.5.5 0 0 1 .37-.37"
					clip-rule="evenodd"
				/>
			</svg>
		),
	},
	{
		to: '/assistants',
		label: 'Assistants',
		isExternal: true,
		icon: (
			<svg
				width="20"
				height="64"
				viewBox="0 0 32 32"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path fill="currentColor" d="M18 10h2v2h-2zm-6 0h2v2h-2z" />
				<path
					fill="currentColor"
					d="M26 20h-5v-2h1a2.002 2.002 0 0 0 2-2v-4h2v-2h-2V8a2.002 2.002 0 0 0-2-2h-2V2h-2v4h-4V2h-2v4h-2a2.002 2.002 0 0 0-2 2v2H6v2h2v4a2.002 2.002 0 0 0 2 2h1v2H6a2.002 2.002 0 0 0-2 2v8h2v-8h20v8h2v-8a2.002 2.002 0 0 0-2-2M10 8h12v8H10Zm3 10h6v2h-6Z"
				/>
			</svg>
		),
	},
]

const adminLinks = [
	{
		to: '/app/students',
		label: 'Students',
		icon: (
			<svg
				width="24"
				height="24"
				viewBox="0 0 256 256"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					fill="currentColor"
					d="m225.9 58.31l-96-32a6 6 0 0 0-3.8 0l-96 32A6 6 0 0 0 26 64v80a6 6 0 0 0 12 0V72.32l38.68 12.9A62 62 0 0 0 99 174.75c-19.25 6.53-36 19.59-48 38a6 6 0 0 0 10 6.53C76.47 195.59 100.88 182 128 182s51.53 13.59 67 37.28a6 6 0 0 0 10-6.56c-12-18.38-28.73-31.44-48-38a62 62 0 0 0 22.27-89.53l46.63-15.5a6 6 0 0 0 0-11.38M178 120a50 50 0 1 1-89.37-30.8l37.47 12.49a6 6 0 0 0 3.8 0l37.47-12.49A49.78 49.78 0 0 1 178 120m-50-30.32L51 64l77-25.68L205 64Z"
				/>
			</svg>
		),
	},
	{
		to: '/app/teachers',
		label: 'Teachers',
		icon: (
			<svg
				width="24"
				height="24"
				viewBox="0 0 256 256"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					fill="currentColor"
					d="M216 42H40a14 14 0 0 0-14 14v144a14 14 0 0 0 14 14h13.39a6 6 0 0 0 5.42-3.43a50 50 0 0 1 90.38 0a6 6 0 0 0 5.42 3.43H216a14 14 0 0 0 14-14V56a14 14 0 0 0-14-14M78 144a26 26 0 1 1 26 26a26 26 0 0 1-26-26m140 56a2 2 0 0 1-2 2h-57.73a62.34 62.34 0 0 0-31.48-27.61a38 38 0 1 0-45.58 0A62.34 62.34 0 0 0 49.73 202H40a2 2 0 0 1-2-2V56a2 2 0 0 1 2-2h176a2 2 0 0 1 2 2ZM198 80v96a6 6 0 0 1-6 6h-16a6 6 0 0 1 0-12h10V86H70v10a6 6 0 0 1-12 0V80a6 6 0 0 1 6-6h128a6 6 0 0 1 6 6"
				/>
			</svg>
		),
	},
	{
		to: '/app/modules',
		label: 'Modules',
		icon: (
			<svg
				width="24"
				height="24"
				viewBox="0 0 32 32"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					fill="currentColor"
					d="M24 30H8a2.002 2.002 0 0 1-2-2V4a2.002 2.002 0 0 1 2-2h16a2.002 2.002 0 0 1 2 2v16.618l-5-2.5l-5 2.5V4H8v24h16v-4h2v4a2.003 2.003 0 0 1-2 2m-3-14.118l3 1.5V4h-6v13.382Z"
				/>
			</svg>
		),
	},
]

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({ where: { id: userId } })

	invariantResponse(user, 'User not found', { status: 404 })
	return json({})
}

export default function Route() {
	const user = useUser()
	const isAdmin = user?.roles.some(role => role.name === 'admin')

	return (
		<main className="flex">
			<nav className="bg dark flex min-h-screen min-w-[220px] flex-col bg-background/90 p-4 dark:border-r">
				<div className="w-fit">
					<img
						src="/img/yawp_white_logo.png"
						alt="Logo on white background"
						className="h-auto w-24 rounded object-cover"
					/>
				</div>
				<h4 className="my-12 text-white">
					Welcome, <br />
					{user.name}
				</h4>
				<div className="flex flex-grow flex-col justify-end gap-2">
					<SidebarSection title="Main" links={mainLinks} />
					{isAdmin ? <SidebarSection title="Admin" links={adminLinks} /> : null}
					<div className="mt-8 flex justify-end gap-2">
						<ThemeSwitch buttonProps={{ variant: 'sidebar' }} />
						<Tooltip text="Sign out">
							<Button size="icon-sm" variant="sidebar" asChild>
								<Link to="/logout">
									<ExitIcon />
								</Link>
							</Button>
						</Tooltip>
					</div>
					<Link to="/assistants/profile">
						<div className="flex items-center gap-4 rounded bg-foreground/15 p-2 shadow-lg transition hover:bg-foreground/10">
							<img
								src={getUserImgSrc(user.image?.id)}
								alt={user.name ?? user.email}
								className="h-8 w-8 min-w-8 rounded-full object-cover"
							/>
							<div>
								<p className="text-sm font-bold text-slate-300">{user.name}</p>
								<p className="text-sm text-slate-400">
									{startCase(user.roles[0]?.name)}
								</p>
							</div>
						</div>
					</Link>
				</div>
			</nav>
			<div className="max-h-screen min-h-screen flex-grow overflow-scroll">
				<Outlet />
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
