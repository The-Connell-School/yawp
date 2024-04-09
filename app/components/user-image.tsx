import { cn, getUserImgSrc } from '#app/utils/misc'

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
		xxs: 'h-5 w-5 min-w-5',
		xs: 'h-7 w-7 min-w-7',
		sm: 'h-10 w-10 min-w-10',
		md: 'h-14 w-14 min-w-14',
		lg: 'h-20 w-20 min-w-20',
	}

	return (
		<img
			src={getUserImgSrc(user.image?.id)}
			alt={user.name ?? user.email}
			className={cn('rounded-full object-cover', sizes[size], className)}
		/>
	)
}
