import React, { useEffect, useState } from 'react'
import { cn } from '#app/utils/misc'

export const ChatPending: React.FC = () => {
	const [activeDot, setActiveDot] = useState(0)

	useEffect(() => {
		const interval = setInterval(() => {
			setActiveDot(prevActiveDot =>
				prevActiveDot === 2 ? 0 : prevActiveDot + 1,
			)
		}, 500) // Cycle active dot every 500ms

		return () => clearInterval(interval)
	}, [])

	return (
		<div className="flex w-fit items-center space-x-2 rounded-full rounded-bl-none bg-muted p-4">
			{[...Array(3)].map((_, index) => (
				<span
					key={index}
					className={cn('h-3 w-3 rounded-full bg-foreground/20', {
						'animate-bounce': activeDot === index,
					})}
				></span>
			))}
		</div>
	)
}
