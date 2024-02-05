import { type TouchEventHandler, useState } from 'react'

type Params = {
	threshold?: number
	onSwipe?: (direction: 'left' | 'right') => void
}

export const useOnSwipe = ({ onSwipe, threshold = 80 }: Params = {}) => {
	const [touchStart, setTouchStart] = useState<number | null>(null)
	const [touchEnd, setTouchEnd] = useState<number | null>(null)
	const distance = (touchStart ?? 0) - (touchEnd ?? 0)

	const onTouchStart: TouchEventHandler<HTMLDivElement> = e => {
		setTouchEnd(null)
		setTouchStart(e.targetTouches[0].clientX)
	}

	const onTouchMove: TouchEventHandler<HTMLDivElement> = e => {
		setTouchEnd(e.targetTouches[0].clientX)
	}

	const onTouchEnd = () => {
		const isSwipeLeft = distance > threshold
		const isSwipeRight = distance < -threshold

		if (onSwipe && (isSwipeRight || isSwipeLeft)) {
			onSwipe(isSwipeRight ? 'right' : 'left')
		}

		setTouchStart(null)
		setTouchEnd(null)
	}

	return { onTouchStart, onTouchMove, onTouchEnd }
}
