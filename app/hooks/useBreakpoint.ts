import { useEffect, useState } from 'react'

const useBreakpoint = () => {
	const [breakpoint, setBreakPoint] = useState<
		'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | undefined
	>()

	const [windowSize, setWindowSize] = useState<
		| {
				width: number | undefined
				height: number | undefined
		  }
		| undefined
	>()

	const handleResize = () => {
		setWindowSize({
			width: window.innerWidth,
			height: window.innerHeight,
		})
	}

	useEffect(() => {
		window.addEventListener('resize', handleResize)
		handleResize()

		if (!windowSize?.width || !windowSize?.height) return

		if (0 < windowSize.width && windowSize.width < 640) {
			setBreakPoint('base')
		}
		if (640 < windowSize.width && windowSize.width < 768) {
			setBreakPoint('md')
		}
		if (768 < windowSize.width && windowSize.width < 1024) {
			setBreakPoint('lg')
		}
		if (1024 < windowSize.width && windowSize.width < 1280) {
			setBreakPoint('xl')
		}
		if (windowSize.width >= 1280) {
			setBreakPoint('2xl')
		}

		return () => window.removeEventListener('resize', handleResize)
	}, [windowSize?.height, windowSize?.width])

	return breakpoint
}

export default useBreakpoint
