import { useState, useEffect } from 'react';
import { cn } from '~/utils/misc';

type LoadingProps = {
  label?: string;
  /** When true, uses v2 tutor bubble chrome from redesign CSS. */
  tutorBubble?: boolean;
};

export const Loading = ({ label, tutorBubble = false }: LoadingProps) => {
	const [activeDot, setActiveDot] = useState(0)

	useEffect(() => {
		const interval = setInterval(() => {
			setActiveDot(prevActiveDot =>
				prevActiveDot === 2 ? 0 : prevActiveDot + 1,
			)
		}, 500)

		return () => clearInterval(interval)
	}, [])

	return (
		<div
			className={cn(
				'flex w-fit items-center space-x-2',
				tutorBubble
					? 'doc-editor-tutor-message-loading mr-auto'
					: 'rounded-full rounded-bl-none bg-muted p-4'
			)}
		>
			{[...Array(3)].map((_, index) => (
				<span
					key={index}
					className={cn('h-3 w-3 rounded-full bg-foreground/20', {
						'animate-bounce': activeDot === index,
					})}
				></span>
			))}
			{label ? (
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
			) : null}
		</div>
	)
}
