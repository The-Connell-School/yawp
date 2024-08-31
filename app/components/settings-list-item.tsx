import { NavLink } from '@remix-run/react'
import { type ReactNode } from 'react'
import { cn } from '#app/utils/misc'

type Props = {
	image?: ReactNode
	to: string
	title: string
	deleteButton?: ReactNode
}

export const SettingsNavLink = ({ image, to, title, deleteButton }: Props) => {
	return (
		<NavLink
			to={to}
			className={({ isActive }) =>
				cn(
					'flex w-full cursor-pointer items-center justify-between gap-2 rounded border transition hover:bg-muted/50',
					{
						'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10':
							isActive,
					},
				)
			}
		>
			<div className="flex items-center gap-2">
				{image ?? <div className="h-16 w-16" />}
				<p className="font-bold">{title || 'Untitled course'}</p>
			</div>
			<div className='mr-2'>

			{deleteButton}
			</div>
		</NavLink>
	)
}
