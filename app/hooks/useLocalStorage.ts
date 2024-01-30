import { useEffect, useState } from 'react'

export function useLocalStorage(key: string, initialValue: any) {
	const [state, setState] = useState<any>(null)

	useEffect(() => {
		if (localStorage.getItem(key) === null) {
			localStorage.setItem(key, initialValue)
		}

		setState(localStorage.getItem(key))
	}, [initialValue, key])

	const setWithLocalStorage = (nextState: any) => {
		setState(nextState)
	}

	return [state, setWithLocalStorage]
}
