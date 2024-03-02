import { useNavigation } from '@remix-run/react'
import * as React from 'react'
import { useDebounce } from '#app/hooks/useDebounce'
import { cn } from '#app/utils/misc'

function GlobalLoading() {
	const navigation = useNavigation()
	const [active] = useDebounce(navigation.state !== 'idle', 200)

	const ref = React.useRef<HTMLDivElement>(null)
	const [animationComplete, setAnimationComplete] = React.useState(true)

	React.useEffect(() => {
		if (!ref.current) return
		if (active) setAnimationComplete(false)

		Promise.allSettled(
			ref.current.getAnimations().map(({ finished }) => finished),
		).then(() => !active && setAnimationComplete(true))
	}, [active])

	return (
		<div
			role="progressbar"
			aria-hidden={!active}
			aria-valuetext={active ? 'Loading' : undefined}
			className="fixed inset-x-0 left-0 top-0 z-50 h-1"
		>
			<div
				ref={ref}
				className={cn(
					'h-full bg-primary transition-all duration-500 ease-in-out',
					navigation.state === 'idle' &&
						animationComplete &&
						'w-0 opacity-0 transition-none',
					navigation.state === 'submitting' && 'w-4/12',
					navigation.state === 'loading' && 'w-10/12',
					navigation.state === 'idle' && !animationComplete && 'w-full',
				)}
			/>
		</div>
	)
}

export { GlobalLoading }
