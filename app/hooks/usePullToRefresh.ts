import { useEffect, useState, useRef } from 'react'

type Pixels = number
type Params = { threshold?: Pixels }

export const usePullToRefresh = ({ threshold = 70 }: Params = {}) => {
	const [isPulling, setIsPulling] = useState(false)
	const startY = useRef<number | null>(null)

	useEffect(() => {
		const onTouchStart = (e: TouchEvent) => {
			console.log(e)
			// console.log('onstart', e.touches)
			if (window.innerHeight - e.touches[0].clientY < 150) {
				startY.current = e.touches[0].pageY
			}
		}

		const onTouchMove = (e: TouchEvent) => {
			// console.log('onmove', e.touches)
			if (startY.current !== null) {
				const currentY = e.touches[0].pageY
				if (currentY - startY.current > threshold) {
					setIsPulling(true)
				}
			}
		}

		const onTouchEnd = () => {
			if (isPulling) {
				setIsPulling(false)
				window.location.reload()
			}
			startY.current = null
		}

		window.addEventListener('touchstart', onTouchStart)
		window.addEventListener('touchmove', onTouchMove, { passive: true })
		window.addEventListener('touchend', onTouchEnd)

		return () => {
			window.removeEventListener('touchstart', onTouchStart)
			window.removeEventListener('touchmove', onTouchMove)
			window.removeEventListener('touchend', onTouchEnd)
		}
	}, [isPulling, threshold])

	return { isPulling }
}
