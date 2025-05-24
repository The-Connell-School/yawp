import { NavLink } from 'react-router'
import { type ReactElement, cloneElement } from 'react'
import { cn } from '~/utils/misc'

type Props = {
	links: {
		to: string
		label: string
		icon: ReactElement
		badge?: string
		isDisabled?: boolean
		isExternal?: boolean
	}[]
	title: string
}

export const SidebarSection = ({ links, title }: Props) => {
	return (
		<div className="mb-4 flex flex-col gap-0.5">
			<div className="mb-1 flex items-center justify-between gap-2 pl-2">
				<p className="text-foreground text-sm font-bold">{title}</p>
			</div>
			{links.map(({ to, label, icon, isDisabled, badge, isExternal }) => (
				<NavLink
					to={to}
					key={to}
					end
					className={({ isActive }) =>
						cn(
							'hover:bg-foreground/15 flex items-center rounded p-1 px-2 text-slate-300',
							{
								'bg-foreground/15': isActive,
								'text-foreground/40 pointer-events-none': isDisabled,
							},
						)
					}
				>
					{cloneElement(icon, {
						className: cn('mr-2 text-foreground h-4', {
							'text-foreground/40': isDisabled,
						}),
					})}{' '}
					{label}
					{badge ? (
						<div className="bg-foreground/20 ml-auto rounded px-1 py-0.5 text-xs">
							{badge}
						</div>
					) : null}
					{isExternal ? (
						<svg
							width="20"
							height="20"
							viewBox="0 0 21 21"
							xmlns="http://www.w3.org/2000/svg"
							className="ml-auto"
						>
							<path
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M18.5 8.5v-5h-5m5 0l-7 7m-1-7h-5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"
							/>
						</svg>
					) : null}
				</NavLink>
			))}
		</div>
	)
}
