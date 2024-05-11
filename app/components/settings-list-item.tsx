import { NavLink } from '@remix-run/react'
import { type ReactNode } from 'react'
import { cn } from '#app/utils/misc'

type Props = {
	image?: ReactNode
	to: string
	title: string
}

export const SettingsNavLink = ({ image, to, title }: Props) => {
	return (
		<NavLink
			to={to}
			className={({ isActive }) =>
				cn(
					'flex cursor-pointer items-center gap-2 rounded border transition hover:bg-muted/50',
					{
						'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10':
							isActive,
					},
				)
			}
		>
			{image ?? <div className="h-16 w-16" />}
			<p className="font-bold">{title || 'Untitled course'}</p>
		</NavLink>
	)
}
