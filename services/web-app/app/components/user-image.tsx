import { cn, getUserImgSrc } from '~/utils/misc'

type Props = {
	size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg'
	className?: string
	user: {
		email: string
		image: { id: string } | null
		name?: string | null
	}
}

export const UserImage = ({ user, className, size = 'md' }: Props) => {
	const sizes = {
		xxs: 'h-5 w-5 min-w-5 text-sm',
		xs: 'h-7 w-7 min-w-7',
		sm: 'h-10 w-10 min-w-10 text-lg',
		md: 'h-14 w-14 min-w-14 text-2xl',
		lg: 'h-20 w-20 min-w-20',
	}

	if (!user.image?.id) {
		return (
			<div
				className={cn(
					'flex items-center justify-center rounded-full bg-primary text-primary-foreground',
					sizes[size],
					className,
				)}
			>
				{user.name?.[0].toUpperCase()}
			</div>
		)
	}

	return (
		<img
			src={getUserImgSrc(user.image.id)}
			alt={user.name ?? user.email}
			className={cn('rounded-full object-cover', sizes[size], className)}
		/>
	)
}
