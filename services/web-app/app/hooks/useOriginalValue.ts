import { useState, useEffect } from 'react'
import { usePrevious } from './usePrevious'

export const useOriginalValue = <T>({
	isOpen,
	value,
}: {
	isOpen: boolean
	value: T
}) => {
	const [original, setOriginal] = useState<T>()
	const wasOpen = usePrevious(isOpen)

	useEffect(() => {
		if (isOpen && !wasOpen) {
			setOriginal(value)
		}
	}, [value, wasOpen, isOpen])

	return original
}
