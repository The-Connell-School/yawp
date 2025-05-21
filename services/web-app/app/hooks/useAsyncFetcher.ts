import { useFetcher } from 'react-router'
import { useState, useCallback, useEffect } from 'react'

export const useAsyncFetcherSubmit = <T>() => {
	const fetcher = useFetcher<T>()
	const [isLoading, setIsLoading] = useState(false)
	const [pendingPromise, setPendingPromise] = useState<{
		resolve: (data: T) => void
		reject: (error: any) => void
	} | null>(null)

	const submit = useCallback(
		(
			submitData: Parameters<typeof fetcher.submit>[0],
			options?: Parameters<typeof fetcher.submit>[1],
		) => {
			return new Promise<T>((resolve, reject) => {
				fetcher.submit(submitData, options)
				setIsLoading(true)
				setPendingPromise({ resolve, reject })
			})
		},
		[fetcher],
	)

	useEffect(() => {
		if (fetcher.state === 'idle' && pendingPromise) {
			setIsLoading(false)
			pendingPromise.resolve(fetcher.data as T)
			setPendingPromise(null)
		}
	}, [fetcher.state, pendingPromise, fetcher.data])

	return { submit, isLoading, fetcher }
}
