import { NavLink } from '@remix-run/react'
import { cn } from '#app/utils/misc'

type Props = {
	imageSrc?: string
	imageStyle?: 'rounded'
	to: string
	title: string
}

export const SettingsNavLink = ({ imageSrc, imageStyle, to, title }: Props) => {
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
			{imageSrc ? (
				<img
					src={imageSrc}
					alt=""
					className={cn('h-16 w-16 rounded-l object-cover', {
						'h-12 w-12 rounded-full p-2': imageStyle === 'rounded',
					})}
				/>
			) : (
				<div className="h-16 w-16" />
			)}
			<p className="font-bold">{title || 'Untitled course'}</p>
		</NavLink>
	)
}
